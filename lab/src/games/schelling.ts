// Schelling's segregation model (Schelling 1971, "Dynamic models of segregation").
//
// The point: agents who are perfectly happy to be a minority in their neighbourhood still
// produce a sharply segregated city. The macro pattern is much stronger than any micro
// preference, which is the textbook case of emergence.
//
// Rules, exactly:
//   - A size×size grid (edges do not wrap). Most cells hold an agent of type 0 or 1; the rest are empty.
//   - An agent's neighbours are the up to 8 surrounding occupied cells.
//   - An agent is happy if at least `tolerance` of its neighbours share its type
//     (an agent with no neighbours is happy).
//   - Each step, every unhappy agent (in random order) moves to a random empty cell.
//   - Stop when everyone is happy, or after maxSteps.

import { makeRng, randInt, shuffle, type Rng } from "../lib/rng.ts";

export type Cell = 0 | 1 | null;

export interface SchellingOptions {
  size: number;
  /** Fraction of cells occupied. */
  density: number;
  /** Minimum share of same-type neighbours an agent needs to stay put. */
  tolerance: number;
  maxSteps: number;
  seed: number;
}

export interface SchellingResult {
  initial: Cell[];
  final: Cell[];
  /** Mean share of same-type neighbours, before and after each step. */
  similarity: number[];
  unhappy: number[];
  steps: number;
  settled: boolean;
}

function neighbours(grid: Cell[], size: number, i: number): Cell[] {
  const r = Math.floor(i / size), c = i % size;
  const out: Cell[] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
      const v = grid[rr * size + cc];
      if (v !== null) out.push(v);
    }
  return out;
}

export function sameShare(grid: Cell[], size: number, i: number): number | null {
  const ns = neighbours(grid, size, i);
  return ns.length ? ns.filter((n) => n === grid[i]).length / ns.length : null;
}

export const isHappy = (grid: Cell[], size: number, i: number, tolerance: number) => (sameShare(grid, size, i) ?? 1) >= tolerance;

/** The segregation measure: average share of same-type neighbours across agents that have any. */
export function similarity(grid: Cell[], size: number): number {
  const xs = grid.map((v, i) => (v === null ? null : sameShare(grid, size, i))).filter((x): x is number => x !== null);
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function randomGrid(rng: Rng, size: number, density: number): Cell[] {
  return Array.from({ length: size * size }, () => (rng() < density ? (rng() < 0.5 ? 0 : 1) : null));
}

export function runSchelling(o: SchellingOptions): SchellingResult {
  const rng = makeRng(o.seed);
  const grid = randomGrid(rng, o.size, o.density);
  const initial = [...grid];
  const countUnhappy = () => grid.filter((v, i) => v !== null && !isHappy(grid, o.size, i, o.tolerance)).length;
  const sim = [similarity(grid, o.size)];
  const unhappy = [countUnhappy()];
  let step = 0;
  for (; step < o.maxSteps && unhappy[unhappy.length - 1] > 0; step++) {
    const movers = shuffle(rng, grid.map((_, i) => i).filter((i) => grid[i] !== null && !isHappy(grid, o.size, i, o.tolerance)));
    for (const i of movers) {
      if (grid[i] === null || isHappy(grid, o.size, i, o.tolerance)) continue; // a neighbour's move may have fixed it
      const empties = grid.map((v, j) => (v === null ? j : -1)).filter((j) => j >= 0);
      const j = empties[randInt(rng, empties.length)];
      grid[j] = grid[i];
      grid[i] = null;
    }
    sim.push(similarity(grid, o.size));
    unhappy.push(countUnhappy());
  }
  return { initial, final: [...grid], similarity: sim, unhappy, steps: step, settled: unhappy[unhappy.length - 1] === 0 };
}

/** ASCII picture: '#' and 'o' for the two types, '.' for empty. For notes and terminals. */
export const draw = (grid: Cell[], size: number) =>
  Array.from({ length: size }, (_, r) => grid.slice(r * size, (r + 1) * size).map((v) => (v === null ? "." : v ? "#" : "o")).join("")).join("\n");
