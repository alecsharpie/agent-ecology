// The naming game (Ashery, Aiello & Baronchelli 2025): two agents each pick a name from a
// shared pool; matching pays both +100, mismatching costs both 50. Agents see only their
// own last M interactions. Everything here is pure, so the prompt shown to a model and
// the payoff it receives can be tested without a model.

import type { ChatMessage } from "../lib/types.ts";

/** One remembered interaction, from the agent's own point of view. */
export interface Memory {
  mine: string;
  theirs: string;
  payoff: number;
}

export type PoolId = "letters" | "nonsense";

/** Letters as in the paper; nonsense words are the fresh pool for the prompt-overlap check. */
export const POOLS: Record<PoolId, string[]> = {
  letters: ["F", "J", "K", "M", "Q", "R", "T", "W", "X", "Z"],
  nonsense: ["dax", "wug", "fep", "blick", "toma", "zib", "mip", "lorp", "vunt", "gazz"],
};

export const PAYOFF = { match: 100, mismatch: -50 } as const;

export const payoff = (a: string, b: string) => (a === b ? PAYOFF.match : PAYOFF.mismatch);

/** The last `m` memories, oldest first. */
export const window = (memory: readonly Memory[], m: number) => (m <= 0 ? [] : memory.slice(-m));

export type WordingId = "game" | "plain" | "tally" | "partners";

const historyLines = (memory: readonly Memory[]) =>
  memory.length
    ? memory.map((h, i) => `Round ${i + 1}: you picked ${h.mine}, your partner picked ${h.theirs}, you got ${h.payoff > 0 ? "+" : ""}${h.payoff} points.`).join("\n")
    : "No rounds played yet.";

/**
 * Partner-only memory: what each partner played and whether you matched, but never your own
 * pick. Tests whether self-repetition ("you picked X, you picked X…") is what blocks copying.
 */
const partnerLines = (memory: readonly Memory[]) =>
  memory.length
    ? memory.map((h, i) => `Round ${i + 1}: your partner picked ${h.theirs}; ${h.payoff > 0 ? `you matched (+${h.payoff} points)` : `you did not match (${h.payoff} points)`}.`).join("\n")
    : "No rounds played yet.";

/** One line summarising what recent partners played, most frequent first. Used by the "tally" wording. */
export function partnerTally(memory: readonly Memory[]): string {
  if (!memory.length) return "";
  const t = new Map<string, number>();
  for (const m of memory) t.set(m.theirs, (t.get(m.theirs) ?? 0) + 1);
  return `Summary: in these rounds your partners picked ${[...t].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ${c} time${c > 1 ? "s" : ""}`).join(", ")}.`;
}

/**
 * Wordings of the same game. "game" and "plain" are the two pre-registered wordings.
 * "tally" is an exploratory variant: the "game" prompt plus one line that counts what recent
 * partners played. It tests whether agents fail to coordinate because they can't pull that
 * signal out of the round-by-round list. The paper's effects should not depend on the phrasing,
 * so an effect is only reported if it shows up under both.
 */
export function buildPrompt(wording: WordingId, order: readonly string[], memory: readonly Memory[]): ChatMessage[] {
  const options = order.join(", ");
  if (wording === "game" || wording === "tally" || wording === "partners") {
    const tally = wording === "tally" && memory.length ? `\n${partnerTally(memory)}` : "";
    const lines = wording === "partners" ? partnerLines(memory) : historyLines(memory);
    return [
      {
        role: "system",
        content:
          `You are playing a repeated game with a series of partners. In each round you and your partner ` +
          `simultaneously pick one name from this list: [${options}].\n` +
          `If you both pick the SAME name, you each get +${PAYOFF.match} points. ` +
          `If you pick DIFFERENT names, you each get ${PAYOFF.mismatch} points.\n` +
          `Your goal is to maximise your own total points. You cannot talk to your partner.`,
      },
      {
        role: "user",
        content: `Your recent rounds:\n${lines}${tally}\n\nWhich name do you pick this round? Answer with JSON: {"name": "<one name from the list>"}.`,
      },
    ];
  }
  return [
    {
      role: "system",
      content:
        `Each turn you are matched with someone and you both choose a label without seeing each other's choice. ` +
        `Available labels: ${options}.\n` +
        `Choosing the same label as the other person earns ${PAYOFF.match}. Choosing a different label loses ${-PAYOFF.mismatch}.`,
    },
    {
      role: "user",
      content: `What happened in your last few turns:\n${historyLines(memory)}\n\nReply with JSON {"name": "..."} containing the label you choose now.`,
    },
  ];
}

/** Grammar for constrained decoding: the answer can only be one of the pool names. */
export const answerSchema = (order: readonly string[]) => ({
  type: "object",
  properties: { name: { type: "string", enum: [...order] } },
  required: ["name"],
  additionalProperties: false,
});

export type ParseStatus = "ok" | "repaired" | "failed";

/**
 * Read a name out of model output. Constrained decoding should make "ok" nearly universal;
 * "repaired" means we recovered a lone pool name from malformed output, which is logged.
 */
export function parseAnswer(raw: string, pool: readonly string[]): { name: string | null; status: ParseStatus } {
  try {
    const v = JSON.parse(raw) as { name?: unknown };
    if (typeof v?.name === "string" && pool.includes(v.name)) return { name: v.name, status: "ok" };
  } catch {
    // fall through to repair
  }
  const found = pool.filter((n) => new RegExp(`(^|[^A-Za-z])${n}([^A-Za-z]|$)`).test(raw));
  return found.length === 1 ? { name: found[0], status: "repaired" } : { name: null, status: "failed" };
}
