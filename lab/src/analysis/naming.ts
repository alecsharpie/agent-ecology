// Metrics for the naming game. Pure functions of run logs, so they can be re-run on
// recorded data without touching a model.

import { POOLS } from "../games/naming.ts";
import type { RunLog } from "../sim/record.ts";
import { counts, permutationTvd, wilson } from "../lib/stats.ts";

export const WINDOW = 5; // rounds of plays pooled when measuring consensus
export const THRESHOLD = 0.9;
export const STREAK = 5; // consecutive rounds above threshold to call it converged

export const poolOf = (log: RunLog) => POOLS[log.meta.pool];

/** Names played in each round, indexed by round. */
export function playsByRound(log: RunLog): string[][] {
  const out: string[][] = Array.from({ length: log.meta.rounds }, () => []);
  for (const p of log.plays) out[p.round].push(p.name);
  return out.filter((r) => r.length);
}

function modal(names: readonly string[]): { name: string | null; share: number } {
  if (!names.length) return { name: null, share: 0 };
  const tally = new Map<string, number>();
  for (const n of names) tally.set(n, (tally.get(n) ?? 0) + 1);
  const [name, c] = [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return { name, share: c / names.length };
}

/** Share of the plays in rounds r-WINDOW+1..r that went to that window's modal name. */
export function consensusSeries(log: RunLog, win = WINDOW): { share: number; name: string | null }[] {
  const rounds = playsByRound(log);
  return rounds.map((_, r) => modal(rounds.slice(Math.max(0, r - win + 1), r + 1).flat()));
}

/** Share of each round's own plays on its modal name (no pooling); good for plotting. */
export const roundConsensus = (log: RunLog) => playsByRound(log).map((r) => modal(r).share);

/** First round (0-based) of a STREAK-long run above THRESHOLD on one name, or null (censored). */
export function convergence(log: RunLog, threshold = THRESHOLD, streak = STREAK): { round: number | null; name: string | null } {
  const s = consensusSeries(log);
  for (let r = 0; r + streak <= s.length; r++) {
    const run = s.slice(r, r + streak);
    if (run.every((x) => x.share > threshold && x.name === run[0].name)) return { round: r, name: run[0].name };
  }
  return { round: null, name: null };
}

/** The dominant name in the final window, and how dominant. */
export function finalState(log: RunLog) {
  const s = consensusSeries(log);
  return s[s.length - 1] ?? { share: 0, name: null };
}

/**
 * Distribution of the chosen name's position in the shown order, excluding committed
 * agents. With `firstRoundOnly`, only memoryless choices count, where position bias is
 * least masked by coordination.
 */
export function positionCounts(logs: RunLog[], firstRoundOnly = false): number[] {
  const k = logs.length ? poolOf(logs[0]).length : 0;
  const out = Array(k).fill(0);
  for (const l of logs)
    for (const p of l.plays) if (p.status !== "committed" && (!firstRoundOnly || p.round === 0)) out[p.position]++;
  return out;
}

export function parseCounts(logs: RunLog[]) {
  const c = { ok: 0, repaired: 0, failed: 0 };
  for (const l of logs) for (const p of l.plays) if (p.status !== "committed") c[p.status]++;
  return c;
}

export interface ConditionSummary {
  runs: number;
  converged: number;
  convergedCi: [number, number];
  /** Rounds to convergence for converged runs. */
  times: number[];
  winners: string[];
  distinctWinners: number;
}

export function summarise(logs: RunLog[]): ConditionSummary {
  const conv = logs.map((l) => convergence(l));
  const ok = conv.filter((c) => c.round !== null);
  return {
    runs: logs.length,
    converged: ok.length,
    convergedCi: wilson(ok.length, logs.length),
    times: ok.map((c) => c.round!),
    winners: ok.map((c) => c.name!),
    distinctWinners: new Set(ok.map((c) => c.name)).size,
  };
}

/**
 * Collective bias: compare which names won across seeds with the names fresh agents pick
 * alone. Equal distributions mean the group just inherits individual taste.
 */
export function collectiveBias(winners: string[], individualPicks: string[], pool: readonly string[], iterations = 10000) {
  return {
    winnerCounts: counts(winners, pool),
    individualCounts: counts(individualPicks, pool),
    ...permutationTvd(winners, individualPicks, pool, iterations),
  };
}

/** Did the committed minority's name take over? Majority of the final window's plays. */
export function flipped(log: RunLog, alternative: string): boolean {
  const last = playsByRound(log).slice(-WINDOW).flat();
  return last.filter((n) => n === alternative).length / last.length > 0.5;
}

export function tippingPoint(fraction: number, logs: RunLog[], alternative: (l: RunLog) => string) {
  const k = logs.filter((l) => flipped(l, alternative(l))).length;
  return { fraction, runs: logs.length, flipped: k, rate: logs.length ? k / logs.length : 0, ci: wilson(k, logs.length) };
}

/**
 * How agents react to their last outcome. After a match: repeat the same name (win-stay)?
 * After a mismatch: copy the partner, keep their own name, or try a third name? Committed agents excluded.
 */
export function strategy(log: RunLog) {
  const byRound = new Map(log.plays.map((p) => [`${p.round}:${p.agent}`, p]));
  const byAgent = new Map<number, RunLog["plays"]>();
  for (const p of log.plays) (byAgent.get(p.agent) ?? byAgent.set(p.agent, []).get(p.agent)!).push(p);
  const c = { winStay: 0, win: 0, loseCopy: 0, loseStay: 0, loseOther: 0, lose: 0 };
  for (const [agent, ps] of byAgent) {
    if (log.meta.committed[agent]) continue;
    for (let i = 1; i < ps.length; i++) {
      const prev = ps[i - 1];
      const theirs = byRound.get(`${prev.round}:${prev.partner}`)!.name;
      const now = ps[i].name;
      if (prev.payoff > 0) {
        c.win++;
        if (now === prev.name) c.winStay++;
      } else {
        c.lose++;
        if (now === theirs) c.loseCopy++;
        else if (now === prev.name) c.loseStay++;
        else c.loseOther++;
      }
    }
  }
  return c;
}
