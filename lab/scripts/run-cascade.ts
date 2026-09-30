// Information cascade simulation. Rule-based, runs in Node in about a second.
//   node --experimental-strip-types scripts/run-cascade.ts
import { writeFileSync } from "node:fs";
import { cascadeOutcome, firstCascade, runSequence, type DeciderId } from "../src/games/cascade.ts";
import { wilson } from "../src/lib/stats.ts";

const PLAYERS = 10, SEQUENCES = Number(process.env.SEQUENCES ?? 10000);
const deciders: DeciderId[] = ["own", "bayes", "majority", "stubborn"];
const out: Record<string, unknown> = {};

console.log(`Information cascades: ${PLAYERS} players per sequence, ${SEQUENCES} sequences per decider. A private ball is right 2/3 of the time.\n`);
for (const d of deciders) {
  const seqs = [...Array(SEQUENCES).keys()].map((s) => runSequence(d, PLAYERS, s));
  const byPos = [...Array(PLAYERS).keys()].map((i) => seqs.filter((s) => s.turns[i].guess === s.urn).length / SEQUENCES);
  const outcomes = seqs.map((s) => cascadeOutcome(s));
  const wrong = outcomes.filter((o) => o === "wrong").length;
  const right = outcomes.filter((o) => o === "right").length;
  const overrode = seqs.flatMap((s) => s.turns).filter((t) => t.overrodeOwn).length / (SEQUENCES * PLAYERS);
  const [lo, hi] = wilson(wrong, SEQUENCES);
  console.log(`== ${d} ==`);
  console.log(`accuracy by position: ${byPos.map((x) => `${Math.round(x * 100)}`).join(" ")} (%)`);
  console.log(`group accuracy (mean over players): ${Math.round((byPos.reduce((a, b) => a + b) / PLAYERS) * 100)}%`);
  console.log(`locked into a right cascade ${Math.round((100 * right) / SEQUENCES)}%, a WRONG cascade ${((100 * wrong) / SEQUENCES).toFixed(1)}% [${(lo * 100).toFixed(1)}–${(hi * 100).toFixed(1)}], no cascade ${Math.round((100 * (SEQUENCES - right - wrong)) / SEQUENCES)}%`);
  if (d === "bayes") {
    const w = seqs.filter((s) => firstCascade(s) === "wrong").length / SEQUENCES;
    // Revealed balls arrive in pairs: both right (4/9) starts a right cascade, both wrong (1/9) a
    // wrong one, a split (4/9) resets. A cascade is only visible if someone plays after it forms,
    // so with 10 players only the first 4 pairs count.
    const pairs = Math.floor((PLAYERS - 1) / 2);
    const theory = ((1 / 9) * (1 - (4 / 9) ** pairs)) / (5 / 9);
    console.log(`first cascade was wrong: ${(w * 100).toFixed(1)}% (theory: ${(theory * 100).toFixed(1)}%; 20.0% with endless players)`);
  }
  const same = d === "majority" && seqs.every((s, i) => s.turns.every((t, j) => t.guess === runSequence("bayes", PLAYERS, i).turns[j].guess));
  if (d === "majority") console.log(`identical guesses to bayes in every sequence: ${same}`);
  console.log(`guesses that went against the player's own ball: ${Math.round(overrode * 100)}%\n`);
  out[d] = { byPos, right, wrong, overrode, example: seqs.find((s) => cascadeOutcome(s) === "wrong") };
}
writeFileSync("public/results/cascade.json", JSON.stringify({ params: { PLAYERS, SEQUENCES }, deciders: out }, null, 1));
