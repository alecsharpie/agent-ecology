// Phase diagram: which (copy, explore) habits let a population reach a convention?
// After a mismatch an agent copies its partner with probability `copy`, picks a random
// fresh name with probability `explore`, and otherwise keeps its own. After a match it
// repeats (win-stay 0.86 as measured, or 1.0). No name preference (uniform fresh picks).
//   node --experimental-strip-types scripts/run-habit-sweep.ts
import { writeFileSync } from "node:fs";
import { habitPolicy } from "../src/games/naming-rule.ts";
import { runGame } from "../src/sim/population.ts";
import { summarise } from "../src/analysis/naming.ts";

const SEEDS = 40, ROUNDS = 100;
const COPY = [0, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9];
const EXPLORE = [0, 0.02, 0.05, 0.1, 0.26];
const out: { winStay: number; copy: number; explore: number; converged: number }[] = [];
for (const winStay of [0.86, 1]) {
  console.log(`\nwin-stay ${winStay}: share of ${SEEDS} populations reaching a convention within ${ROUNDS} rounds`);
  console.log(`copy \\ explore  ${EXPLORE.map((e) => `${(e * 100).toFixed(0)}%`.padStart(5)).join("")}`);
  for (const copy of COPY) {
    const cells: string[] = [];
    for (const explore of EXPLORE) {
      if (copy + explore > 1) { cells.push("    ·"); continue; }
      const policy = habitPolicy({ winStay, loseCopy: copy, loseKeep: 1 - copy - explore, prior: {} });
      const logs = [];
      for (let seed = 0; seed < SEEDS; seed++) logs.push(await runGame({ condition: "sweep", seed, rounds: ROUNDS, memory: 1, pool: "letters", wording: "game", agentPolicies: Array(24).fill("p"), policies: { p: policy } }));
      const c = summarise(logs).converged;
      out.push({ winStay, copy, explore, converged: c / SEEDS });
      cells.push(`${Math.round((100 * c) / SEEDS)}%`.padStart(5));
    }
    console.log(`${`${(copy * 100).toFixed(0)}%`.padStart(14)}  ${cells.join("")}`);
  }
}
writeFileSync("public/results/habit-sweep.json", JSON.stringify({ SEEDS, ROUNDS, cells: out }, null, 1));
