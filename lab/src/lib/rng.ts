// Seeded randomness. Every stochastic choice in the simulation (pairing, pool order,
// rule-agent choices) draws from one of these, so a run is reproducible from its seed.

export type Rng = () => number;

/** mulberry32: small, fast, good enough for simulation. Returns floats in [0, 1). */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (rng: Rng, n: number) => Math.floor(rng() * n);

export const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[randInt(rng, xs.length)];

/** Fisher–Yates; returns a new array. */
export function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Derive an independent integer seed, e.g. per agent call, from a run seed and indices. */
export function subSeed(...parts: number[]): number {
  let h = 2166136261;
  for (const p of parts) {
    h ^= p >>> 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return h >>> 0;
}
