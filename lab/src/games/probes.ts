// Probes: scripted memories that pose one clear situation to a single agent. Instead of
// inferring habits from a messy population run, we ask directly: "given this history, what
// do you play?" Each probe is run with the names rotated through the whole pool (so no single
// letter's preference dominates) and the list order shuffled per call.

import type { Memory } from "./naming.ts";

export interface Probe {
  id: string;
  /** Plain-language description of the situation, for the page and notes. */
  situation: string;
  /** What a coordination-minded agent should play, e.g. "X" (own) or "Y" (partner's). */
  sensible: "X" | "Y";
  memory: (x: string, y: string, z: string) => Memory[];
}

const win = (n: string): Memory => ({ mine: n, theirs: n, payoff: 100 });
const loss = (mine: string, theirs: string): Memory => ({ mine, theirs, payoff: -50 });

export const PROBES: Probe[] = [
  { id: "win-streak", situation: "Won 5 rounds in a row, always playing X.", sensible: "X", memory: (x) => [win(x), win(x), win(x), win(x), win(x)] },
  { id: "lose-to-Y", situation: "Lost 5 rounds in a row playing X; every partner played Y.", sensible: "Y", memory: (x, y) => [loss(x, y), loss(x, y), loss(x, y), loss(x, y), loss(x, y)] },
  { id: "wins-then-loss", situation: "Won 4 rounds on X, then lost the last round to a partner playing Y.", sensible: "X", memory: (x, y) => [win(x), win(x), win(x), win(x), loss(x, y)] },
  { id: "lose-mixed", situation: "Lost 5 rounds playing X; partners played Y, Y, Z, Y, Z.", sensible: "Y", memory: (x, y, z) => [loss(x, y), loss(x, y), loss(x, z), loss(x, y), loss(x, z)] },
];

/** Rotate roles through the pool: probe i uses X = pool[i], Y = pool[i+3], Z = pool[i+6]. */
export const roles = (pool: readonly string[], i: number) => ({ x: pool[i % pool.length], y: pool[(i + 3) % pool.length], z: pool[(i + 6) % pool.length] });

export type Answer = "X" | "Y" | "Z" | "other";

export function classify(name: string | null, r: { x: string; y: string; z: string }): Answer {
  return name === r.x ? "X" : name === r.y ? "Y" : name === r.z ? "Z" : "other";
}
