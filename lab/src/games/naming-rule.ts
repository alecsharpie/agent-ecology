// Condition R: agents with no model at all. Two flavours.
//
// 1. `majorityPolicy` sees exactly what an LLM agent sees (its last M rounds) and plays the
//    name its partners played most often. It uses the same pairing, memory and payoff code
//    as the LLM runs, so it checks that machinery and gives the reference dynamics.
// 2. `minimalNamingGame` is the classic Baronchelli et al. (2006) model: speaker/hearer,
//    growing word inventories, collapse on success. It has its own loop because its
//    agents keep an inventory, not a window of payoffs.

import { makeRng, pick, randInt, type Rng } from "../lib/rng.ts";
import type { Decision, Policy, Request } from "../sim/population.ts";

export interface MajorityOptions {
  /** Chance of ignoring memory and playing a random name (trembling hand). */
  noise?: number;
  /**
   * Weights for the empty-memory choice, keyed by name; missing names weigh 1. This is an
   * individual bias, used to check how a weak individual preference shows up collectively.
   */
  prior?: Record<string, number>;
}

function weightedPick(rng: Rng, names: readonly string[], prior: Record<string, number> = {}): string {
  const w = names.map((n) => prior[n] ?? 1);
  let r = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < names.length; i++) if ((r -= w[i]) < 0) return names[i];
  return names[names.length - 1];
}

export function majorityChoice(req: Request, opts: MajorityOptions = {}): string {
  const rng = makeRng(req.seed);
  if (!req.memory.length || rng() < (opts.noise ?? 0)) return weightedPick(rng, req.order, opts.prior);
  const tally = new Map<string, number>();
  for (const m of req.memory) tally.set(m.theirs, (tally.get(m.theirs) ?? 0) + 1);
  const top = Math.max(...tally.values());
  return pick(rng, [...tally].filter(([, c]) => c === top).map(([n]) => n));
}

export function majorityPolicy(opts: MajorityOptions = {}, id = "rule"): Policy {
  return {
    id,
    async decide(requests: Request[]): Promise<Decision[]> {
      return requests.map((r) => ({ name: majorityChoice(r, opts), status: "ok" }));
    },
  };
}

export interface MinimalNgResult {
  /** Per interaction: success, and number of distinct words across all inventories after it. */
  success: boolean[];
  distinctWords: number[];
  /** Interactions until every inventory is the same single word, or null. */
  consensusAt: number | null;
  winner: string | null;
}

/** Baronchelli et al. 2006 minimal naming game over a fixed pool of names. */
export function minimalNamingGame(n: number, pool: readonly string[], interactions: number, seed: number): MinimalNgResult {
  const rng = makeRng(seed);
  const inv: string[][] = Array.from({ length: n }, () => []);
  const success: boolean[] = [];
  const distinctWords: number[] = [];
  for (let t = 0; t < interactions; t++) {
    const s = randInt(rng, n);
    let h = randInt(rng, n - 1);
    if (h >= s) h++;
    if (!inv[s].length) inv[s].push(pick(rng, pool));
    const word = pick(rng, inv[s]);
    const ok = inv[h].includes(word);
    if (ok) inv[s] = inv[h] = [word];
    else inv[h].push(word);
    success.push(ok);
    const words = new Set(inv.flat());
    distinctWords.push(words.size);
    if (words.size === 1 && inv.every((i) => i.length === 1)) {
      return { success, distinctWords, consensusAt: t + 1, winner: inv[0][0] };
    }
  }
  return { success, distinctWords, consensusAt: null, winner: null };
}
