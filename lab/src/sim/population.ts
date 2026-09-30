// Pairing, rounds and memory for a population of agents. Deciding what to play is
// delegated to a Policy, which sees one batch of requests per round. Batching lets a
// mixed population load model A, answer all of A's agents, then swap to model B.

import { payoff, window, type Memory, type ParseStatus, type PoolId, type WordingId, POOLS } from "../games/naming.ts";
import { makeRng, pick, shuffle, subSeed } from "../lib/rng.ts";
import type { Play, RunLog, RunMeta } from "./record.ts";

export interface Request {
  agent: number;
  round: number;
  /** The agent's visible memory: already cut to the window, oldest first. */
  memory: Memory[];
  order: string[];
  /** Per-call seed, for sampled decoding or rule randomness. */
  seed: number;
}

export interface Decision {
  name: string | null;
  status: ParseStatus;
  raw?: string;
  ms?: number;
  promptTokens?: number;
  completionTokens?: number;
}

export interface Policy {
  id: string;
  decide(requests: Request[], onDecision?: (done: number) => void): Promise<Decision[]>;
}

export interface GameOptions {
  condition: string;
  seed: number;
  rounds: number;
  memory: number;
  pool: PoolId;
  wording: WordingId;
  /** One entry per agent: which policy it uses. Length is the population size (must be even). */
  agentPolicies: string[];
  policies: Record<string, Policy>;
  /** Committed name per agent, or null. Committed agents never call their policy. */
  committed?: (string | null)[];
  /** Start from existing memories (tipping). Defaults to empty. */
  initialMemory?: Memory[][];
  continuedFrom?: string;
  /** Plays already made in an interrupted run with the same options; the run resumes after them. */
  resume?: Play[];
  onRound?: (log: RunLog) => void | Promise<void>;
  onDecision?: (round: number, done: number, total: number) => void;
  signal?: AbortSignal;
  gpu?: string;
}

/** Random perfect matching for round `round`. Deterministic given the seed. */
export function pairAgents(n: number, seed: number, round: number): [number, number][] {
  if (n % 2) throw new Error("population size must be even");
  const order = shuffle(makeRng(subSeed(seed, round, 0)), [...Array(n).keys()]);
  const pairs: [number, number][] = [];
  for (let i = 0; i < n; i += 2) pairs.push([order[i], order[i + 1]]);
  return pairs;
}

export const poolOrder = (pool: readonly string[], seed: number, round: number, agent: number) =>
  shuffle(makeRng(subSeed(seed, round, agent + 1, 1)), pool);

/** Rebuild every agent's memory by replaying plays in order. */
export function replayMemory(initial: Memory[][], plays: readonly Play[]): Memory[][] {
  const mem = initial.map((m) => [...m]);
  const byRound = new Map<string, Play>();
  for (const p of plays) byRound.set(`${p.round}:${p.agent}`, p);
  for (const p of plays) {
    const other = byRound.get(`${p.round}:${p.partner}`);
    if (other) mem[p.agent].push({ mine: p.name, theirs: other.name, payoff: p.payoff });
  }
  return mem;
}

export async function runGame(o: GameOptions): Promise<RunLog> {
  const n = o.agentPolicies.length;
  const pool = POOLS[o.pool];
  const committed = o.committed ?? Array(n).fill(null);
  const initialMemory = o.initialMemory ?? Array.from({ length: n }, () => []);
  const plays: Play[] = [...(o.resume ?? [])];
  const memory = replayMemory(initialMemory, plays);
  const firstRound = plays.length ? Math.max(...plays.map((p) => p.round)) + 1 : 0;

  const meta: RunMeta = {
    experiment: "naming",
    condition: o.condition,
    seed: o.seed,
    agents: n,
    rounds: o.rounds,
    memory: o.memory,
    pool: o.pool,
    wording: o.wording,
    agentPolicies: o.agentPolicies,
    committed,
    continuedFrom: o.continuedFrom,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    gpu: o.gpu,
  };
  const log = (): RunLog => ({ meta, plays, initialMemory, finalMemory: memory });

  for (let round = firstRound; round < o.rounds; round++) {
    if (o.signal?.aborted) break;
    const pairs = pairAgents(n, o.seed, round);
    const partner = new Map<number, number>();
    for (const [a, b] of pairs) partner.set(a, b).set(b, a);

    const requests: Request[] = [...Array(n).keys()].map((agent) => ({
      agent,
      round,
      memory: window(memory[agent], o.memory),
      order: poolOrder(pool, o.seed, round, agent),
      seed: subSeed(o.seed, round, agent + 1, 2),
    }));

    // Group the agents that need a decision by policy, and answer one policy at a time.
    const decisions = new Map<number, Decision & { policy: string }>();
    for (const r of requests) {
      const c = committed[r.agent];
      if (c) decisions.set(r.agent, { name: c, status: "ok", policy: "committed" });
    }
    const pending = requests.filter((r) => !committed[r.agent]);
    let done = 0;
    for (const [policyId, policy] of Object.entries(o.policies)) {
      const batch = pending.filter((r) => o.agentPolicies[r.agent] === policyId);
      if (!batch.length) continue;
      const base = done;
      const out = await policy.decide(batch, (k) => o.onDecision?.(round, base + k, pending.length));
      done += batch.length;
      batch.forEach((r, i) => decisions.set(r.agent, { ...out[i], policy: policyId }));
    }
    if (o.signal?.aborted) break;

    // A failed parse still has to play something; substitute a random name and keep the flag.
    const fallback = makeRng(subSeed(o.seed, round, 3));
    const played = new Map<number, string>();
    for (const r of requests) {
      const d = decisions.get(r.agent);
      if (!d) throw new Error(`no decision for agent ${r.agent} (policy ${o.agentPolicies[r.agent]} missing?)`);
      played.set(r.agent, d.name ?? pick(fallback, pool));
    }

    for (const r of requests) {
      const d = decisions.get(r.agent)!;
      const mine = played.get(r.agent)!;
      const p = partner.get(r.agent)!;
      const theirs = played.get(p)!;
      const pay = payoff(mine, theirs);
      plays.push({
        round,
        agent: r.agent,
        partner: p,
        name: mine,
        order: r.order,
        position: r.order.indexOf(mine),
        payoff: pay,
        status: committed[r.agent] ? "committed" : d.status,
        policy: d.policy,
        raw: d.raw,
        ms: d.ms,
        promptTokens: d.promptTokens,
        completionTokens: d.completionTokens,
      });
      memory[r.agent].push({ mine, theirs, payoff: pay });
    }
    await o.onRound?.(log());
  }
  if (!o.signal?.aborted) meta.finishedAt = new Date().toISOString();
  return log();
}
