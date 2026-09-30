// Information cascades (Bikhchandani, Hirshleifer & Welch 1992; lab version Anderson & Holt 1997).
//
// The point: people who each reason sensibly, and each hold useful private information,
// can all end up confidently wrong. Once the public record leans far enough one way,
// a rational person ignores their own evidence, so their choice adds no new information
// and everyone after them is in the same position. The group stops learning.
//
// The game, exactly:
//   - One of two urns is chosen by coin flip. Urn A holds 2 "a" balls and 1 "b"; urn B holds 1 "a" and 2 "b".
//   - Players go one at a time. Each privately draws one ball (with replacement): it matches
//     the true urn with probability 2/3.
//   - Each player sees every earlier player's public guess (not their balls), then guesses A or B.
//
// Deciders:
//   own       – ignores others, guesses what their ball suggests. (No social learning.)
//   bayes     – the textbook rational agent. Before any cascade, every guess reveals the ball
//               behind it, so the player counts revealed balls plus their own and follows the
//               majority (a tie goes to their own ball). Once the revealed count leads by 2,
//               everyone follows it whatever they draw: a cascade. Guesses in a cascade reveal nothing.
//   majority  – naive herding: counts earlier guesses as if they were balls, plus their own ball.
//               In this binary game it makes exactly the same guesses as bayes (see notes/03).
//   stubborn  – follows their own ball unless earlier guesses lead the other way by 3 or more.

import { makeRng } from "../lib/rng.ts";

export type Urn = "A" | "B";
export type DeciderId = "own" | "bayes" | "majority" | "stubborn";

export interface CascadeTurn {
  ball: "a" | "b";
  guess: Urn;
  /** True if this player's guess went against their own ball. */
  overrodeOwn: boolean;
  /** The public record already determined the (bayes) guess regardless of the ball. */
  inCascade: boolean;
}

export interface Sequence {
  urn: Urn;
  turns: CascadeTurn[];
}

const ballUrn = (b: "a" | "b"): Urn => (b === "a" ? "A" : "B");

export function decide(decider: DeciderId, ball: "a" | "b", earlier: readonly CascadeTurn[]): { guess: Urn; inCascade: boolean } {
  const own = ballUrn(ball);
  if (decider === "own") return { guess: own, inCascade: false };
  if (decider === "majority") {
    const lead = earlier.reduce((s, t) => s + (t.guess === "A" ? 1 : -1), 0) + (own === "A" ? 1 : -1);
    return { guess: lead > 0 ? "A" : lead < 0 ? "B" : own, inCascade: false };
  }
  if (decider === "stubborn") {
    const lead = earlier.reduce((s, t) => s + (t.guess === "A" ? 1 : -1), 0);
    const follow = (lead >= 3 && own === "B") || (lead <= -3 && own === "A");
    return { guess: follow ? (lead > 0 ? "A" : "B") : own, inCascade: Math.abs(lead) >= 3 };
  }
  // bayes: only guesses made outside a cascade carry information (they equal the ball).
  const revealed = earlier.filter((t) => !t.inCascade).reduce((s, t) => s + (t.guess === "A" ? 1 : -1), 0);
  if (Math.abs(revealed) >= 2) return { guess: revealed > 0 ? "A" : "B", inCascade: true };
  const lead = revealed + (own === "A" ? 1 : -1);
  return { guess: lead > 0 ? "A" : lead < 0 ? "B" : own, inCascade: false };
}

export function runSequence(decider: DeciderId, players: number, seed: number): Sequence {
  const rng = makeRng(seed);
  const urn: Urn = rng() < 0.5 ? "A" : "B";
  const turns: CascadeTurn[] = [];
  for (let i = 0; i < players; i++) {
    const matches = rng() < 2 / 3;
    const ball = (urn === "A") === matches ? "a" : "b";
    const d = decide(decider, ball, turns);
    turns.push({ ball, guess: d.guess, overrodeOwn: d.guess !== ballUrn(ball), inCascade: d.inCascade });
  }
  return { urn, turns };
}

/** For bayes: the direction of the first cascade, if one formed. */
export function firstCascade(s: Sequence): "right" | "wrong" | "none" {
  const t = s.turns.find((x) => x.inCascade);
  return !t ? "none" : t.guess === s.urn ? "right" : "wrong";
}

/** Did the sequence lock in? The last `tail` guesses agree and at least one player overrode their own ball to join. */
export function cascadeOutcome(s: Sequence, tail = 3): "right" | "wrong" | "none" {
  const last = s.turns.slice(-tail).map((t) => t.guess);
  const locked = last.every((g) => g === last[0]) && s.turns.some((t) => t.overrodeOwn && t.guess === last[0]);
  if (!locked) return "none";
  return last[0] === s.urn ? "right" : "wrong";
}
