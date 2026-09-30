// How does the critical mass depend on memory length? Majority agents (condition R) with
// memory M first reach a convention; then k agents are committed to a new name for 40 more
// rounds. Critical mass = smallest k that flips more than half the populations.
//   node --experimental-strip-types scripts/run-tipping-memory.ts
import { writeFileSync } from "node:fs";
import { POOLS, type Memory } from "../src/games/naming.ts";
import { majorityPolicy } from "../src/games/naming-rule.ts";
import { runGame } from "../src/sim/population.ts";
import { convergence, flipped } from "../src/analysis/naming.ts";

const N = 24, SEEDS = Number(process.env.SEEDS ?? 100), SETUP = 60, TIP = 40;
const pool = POOLS.letters;
const policies = { rule: majorityPolicy() };
const rows = [];
console.log(`Critical mass vs memory: ${N} majority agents, ${SEEDS} seeds, ${TIP} rounds after commitment.`);
console.log("memory | flip rate with k committed agents: k = 1 … 10 | critical mass");
for (const M of [1, 2, 3, 5, 8, 12]) {
  const base = [];
  for (let seed = 0; seed < SEEDS; seed++) {
    const l = await runGame({ condition: "R", seed, rounds: SETUP, memory: M, pool: "letters", wording: "game", agentPolicies: Array(N).fill("rule"), policies });
    if (convergence(l).round !== null) base.push(l);
  }
  const rates: number[] = [];
  for (let k = 1; k <= 10; k++) {
    let flips = 0;
    for (const l of base) {
      const alt = pool[(pool.indexOf(convergence(l).name!) + 1) % pool.length];
      const t = await runGame({
        condition: "tip", seed: l.meta.seed + 5000, rounds: TIP, memory: M, pool: "letters", wording: "game", agentPolicies: Array(N).fill("rule"), policies,
        committed: [...Array(N).keys()].map((i) => (i < k ? alt : null)), initialMemory: l.finalMemory as Memory[][],
      });
      if (flipped(t, alt)) flips++;
    }
    rates.push(flips / base.length);
  }
  const crit = rates.findIndex((r) => r > 0.5) + 1;
  rows.push({ memory: M, converged: base.length, rates, criticalMass: crit || null });
  console.log(`${String(M).padStart(6)} | ${rates.map((r) => `${Math.round(r * 100)}`.padStart(4)).join("")} | ${crit ? `${crit} agents (${Math.round((100 * crit) / N)}%)` : "> 10"}   [${base.length} converged]`);
}
writeFileSync("public/results/tipping-memory.json", JSON.stringify({ N, SEEDS, SETUP, TIP, rows }, null, 1));
