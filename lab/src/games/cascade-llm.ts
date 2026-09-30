// Information cascades with LLM players. Same game as cascade.ts; each player is one model
// call that sees its private ball and the earlier public guesses.
//
// What we want to learn: where does a small model sit between "own" (ignore others),
// "bayes" (follow a lead of 2 revealed balls), and "stubborn"? And does the group of
// LLM players cascade into wrong answers as often as rational players do?
//
// Controls against shortcuts:
//   - Ball colours are counterbalanced: in half the sequences urn A is mostly red, in the
//     other half mostly blue, so "red means A" can't be memorised from the wording.
//   - Which urn is listed first in the prompt is counterbalanced the same way.

import { makeRng, subSeed } from "../lib/rng.ts";
import type { ChatMessage, LLM } from "../lib/types.ts";
import { decide, type CascadeTurn, type Sequence, type Urn } from "./cascade.ts";

export interface Framing {
  /** Colour of the majority ball in urn A (urn B is the opposite). */
  aColour: "red" | "blue";
  /** Which urn is described first. */
  firstUrn: Urn;
  /**
   * How urns are named to the model. v1 "letters": "urn A" / "urn B"; the 1.5B model mostly
   * answered "A" regardless of its ball (notes/09). v2 "colours": "the red urn" / "the blue urn"
   * (named by majority colour), so there is no arbitrary label to latch onto.
   */
  labels?: "letters" | "colours";
}

export const framingFor = (seed: number, labels: "letters" | "colours" = "letters"): Framing => {
  const r = makeRng(subSeed(seed, 91));
  return { aColour: r() < 0.5 ? "red" : "blue", firstUrn: r() < 0.5 ? "A" : "B", labels };
};

/** The name the model sees for an urn, and back. */
export const urnName = (u: Urn, f: Framing) => (f.labels === "colours" ? (u === "A" ? f.aColour : other(f.aColour)) : u);
export const urnFromName = (name: string, f: Framing): Urn | null =>
  f.labels === "colours" ? (name === f.aColour ? "A" : name === other(f.aColour) ? "B" : null) : name === "A" || name === "B" ? name : null;

const other = (c: "red" | "blue") => (c === "red" ? "blue" : "red");

/** The colour a player sees for their ball, given the ball's letter ("a" = urn A's majority colour). */
export const ballColour = (ball: "a" | "b", f: Framing) => (ball === "a" ? f.aColour : other(f.aColour));

export function cascadePrompt(ball: "a" | "b", earlier: readonly Urn[], f: Framing): ChatMessage[] {
  const describe = (u: Urn) => {
    const maj = u === "A" ? f.aColour : other(f.aColour);
    return f.labels === "colours" ? `The ${maj} urn contains 2 ${maj} balls and 1 ${other(maj)} ball.` : `Urn ${u} contains 2 ${maj} balls and 1 ${other(maj)} ball.`;
  };
  const urns = f.firstUrn === "A" ? [describe("A"), describe("B")] : [describe("B"), describe("A")];
  const history = earlier.length
    ? `The ${earlier.length} people before you guessed, in order: ${earlier.map((u) => urnName(u, f)).join(", ")}. Each of them saw only their own ball and the guesses made before them.`
    : "You are the first to guess.";
  return [
    {
      role: "system",
      content:
        `One of two urns was chosen by a fair coin flip. ${urns.join(" ")}\n` +
        `People take turns. Each person privately draws one ball from the chosen urn, looks at it, puts it back, and then publicly guesses which urn was chosen. ` +
        `You earn a reward if your guess is correct.`,
    },
    {
      role: "user",
      content: `You drew a ${ballColour(ball, f)} ball. ${history}\n\nWhich urn do you guess? Answer with JSON: {"urn": "${urnName(f.firstUrn, f)}" or "${urnName(f.firstUrn === "A" ? "B" : "A", f)}"}.`,
    },
  ];
}

/** Allowed answers, in the order the urns were described. */
export const cascadeSchema = (f: Framing = { aColour: "red", firstUrn: "A" }) => {
  const first = f.firstUrn, second: Urn = first === "A" ? "B" : "A";
  return { type: "object", properties: { urn: { type: "string", enum: [urnName(first, f), urnName(second, f)] } }, required: ["urn"], additionalProperties: false };
};

export function parseUrn(raw: string, f: Framing = { aColour: "red", firstUrn: "A" }): Urn | null {
  try {
    const v = JSON.parse(raw) as { urn?: unknown };
    return typeof v.urn === "string" ? urnFromName(v.urn, f) : null;
  } catch {
    return null;
  }
}

export interface LLMTurn extends CascadeTurn {
  raw: string;
  /** What the textbook Bayesian would have guessed in the same spot. */
  bayesGuess: Urn;
  ms: number;
}

export interface LLMSequence extends Sequence {
  seed: number;
  framing: Framing;
  turns: LLMTurn[];
}

/** One sequence of `players` LLM guesses. Draws are identical to cascade.ts's runSequence for the same seed. */
export async function runLLMSequence(llm: LLM, players: number, seed: number, temperature: number, labels: "letters" | "colours" = "letters"): Promise<LLMSequence> {
  const rng = makeRng(seed);
  const urn: Urn = rng() < 0.5 ? "A" : "B";
  const framing = framingFor(seed, labels);
  const turns: LLMTurn[] = [];
  for (let i = 0; i < players; i++) {
    const matches = rng() < 2 / 3;
    const ball = (urn === "A") === matches ? "a" : "b";
    const c = await llm.complete(cascadePrompt(ball, turns.map((t) => t.guess), framing), { temperature, maxTokens: 12, jsonSchema: cascadeSchema(framing), seed: subSeed(seed, i) });
    // A parse failure falls back to the player's own ball, and is visible via raw.
    const guess = parseUrn(c.text, framing) ?? (ball === "a" ? "A" : "B");
    // Bayes' view of this spot: it treats every earlier guess as informative unless in a cascade by its own reckoning.
    const b = decide("bayes", ball, turns);
    turns.push({ ball, guess, overrodeOwn: guess !== (ball === "a" ? "A" : "B"), inCascade: b.inCascade, bayesGuess: b.guess, raw: c.text, ms: c.ms });
  }
  return { urn, turns, seed, framing };
}
