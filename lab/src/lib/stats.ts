// Generic statistics. median, wilson and signTest are copied from agentic-evals;
// the distribution comparisons are new for the collective-bias question.

import { makeRng, shuffle } from "./rng.ts";

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** 95% Wilson score interval for a proportion. */
export function wilson(successes: number, n: number): [number, number] {
  if (n === 0) return [0, 1];
  const z = 1.96;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (centre - margin) / denom), Math.min(1, (centre + margin) / denom)];
}

/** Exact two-sided sign test on the discordant pairs (McNemar's exact test). */
export function signTest(fixed: number, broken: number): number {
  const n = fixed + broken;
  if (n === 0) return 1;
  const choose = (k: number) => {
    let c = 1;
    for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
    return c;
  };
  let tail = 0;
  for (let k = 0; k <= Math.min(fixed, broken); k++) tail += choose(k);
  return Math.min(1, (2 * tail) / 2 ** n);
}

/** Counts of each category, in the order of `categories`. */
export function counts<T>(xs: readonly T[], categories: readonly T[]): number[] {
  return categories.map((c) => xs.filter((x) => x === c).length);
}

export function toDistribution(cs: number[]): number[] {
  const total = cs.reduce((a, b) => a + b, 0);
  return cs.map((c) => (total ? c / total : 0));
}

/** Total variation distance between two distributions over the same categories. */
export function tvd(p: number[], q: number[]): number {
  return p.reduce((s, pi, i) => s + Math.abs(pi - q[i]), 0) / 2;
}

/**
 * Two-sample permutation test on TVD: are samples `a` and `b` drawn from the same
 * categorical distribution? Returns the observed TVD and a Monte Carlo p-value.
 */
export function permutationTvd<T>(a: readonly T[], b: readonly T[], categories: readonly T[], iterations = 10000, seed = 1) {
  const dist = (xs: readonly T[]) => toDistribution(counts(xs, categories));
  const observed = tvd(dist(a), dist(b));
  const pooled = [...a, ...b];
  const rng = makeRng(seed);
  let atLeast = 0;
  for (let i = 0; i < iterations; i++) {
    const s = shuffle(rng, pooled);
    if (tvd(dist(s.slice(0, a.length)), dist(s.slice(a.length))) >= observed - 1e-12) atLeast++;
  }
  return { tvd: observed, p: (atLeast + 1) / (iterations + 1) };
}
