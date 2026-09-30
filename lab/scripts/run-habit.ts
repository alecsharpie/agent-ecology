// Does a rule agent with the LLM's measured habits reproduce the LLM population?
// Habits come from a recorded LLM run; name preferences from the individual baseline.
//   npm run habit -- public/results/naming-b-letters-game-s0.json public/results/baseline-qwen2-5-1-5b-instruct-letters-game-t07.json
import { readFileSync, writeFileSync } from "node:fs";
import { POOLS } from "../src/games/naming.ts";
import { habitPolicy, majorityPolicy, type HabitOptions } from "../src/games/naming-rule.ts";
import { runGame } from "../src/sim/population.ts";
import { convergence, roundConsensus, strategy, summarise } from "../src/analysis/naming.ts";
import { mean, median } from "../src/lib/stats.ts";
import type { RunLog } from "../src/sim/record.ts";

const [runFile, baselineFile] = process.argv.slice(2);
const llmRun = JSON.parse(readFileSync(runFile, "utf8")) as RunLog;
const baseline = JSON.parse(readFileSync(baselineFile, "utf8")) as { picks: { name: string }[] };
const pool = POOLS.letters;
const s = strategy(llmRun);
const prior = Object.fromEntries(pool.map((n) => [n, baseline.picks.filter((p) => p.name === n).length + 0.5]));
const habits: HabitOptions = { winStay: s.winStay / s.win, loseCopy: s.loseCopy / s.lose, loseKeep: s.loseStay / s.lose, prior };
const SEEDS = 200;
console.log(`Habits measured on ${runFile.split("/").pop()}: win-stay ${habits.winStay.toFixed(2)}, lose-copy ${habits.loseCopy.toFixed(2)}, lose-keep ${habits.loseKeep.toFixed(2)}.`);
console.log(`Name preferences from the baseline: ${pool.map((n) => `${n} ${Math.round(prior[n])}`).join(", ")}.\n`);

async function population(label: string, policy: ReturnType<typeof habitPolicy>, rounds: number) {
  const logs: RunLog[] = [];
  for (let seed = 0; seed < SEEDS; seed++) logs.push(await runGame({ condition: label, seed, rounds, memory: 5, pool: "letters", wording: "game", agentPolicies: Array(24).fill("p"), policies: { p: policy } }));
  const sum = summarise(logs);
  const curve = [...Array(rounds).keys()].map((r) => mean(logs.map((l) => roundConsensus(l)[r])));
  const at = (r: number) => (r < rounds ? curve[r].toFixed(2) : "   –");
  const winners = new Map<string, number>();
  for (const w of sum.winners) winners.set(w, (winners.get(w) ?? 0) + 1);
  console.log(`${label.padEnd(44)} converged ${String(sum.converged).padStart(3)}/${SEEDS}${sum.times.length ? `, median round ${median(sum.times) + 1}` : ""}.  consensus r1 ${at(0)}  r10 ${at(9)}  r40 ${at(39)}  r100 ${at(99)}  r400 ${at(399)}`);
  if (winners.size) console.log(`${"".padEnd(44)} winners: ${[...winners].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ${c}`).join(", ")}`);
  return { label, rounds, converged: sum.converged, times: sum.times, winners: Object.fromEntries(winners), curve };
}

const out = [];
console.log(`LLM seed 0 (for reference): consensus r1 ${roundConsensus(llmRun)[0].toFixed(2)}  r10 ${roundConsensus(llmRun)[9].toFixed(2)}  r40 ${roundConsensus(llmRun)[39].toFixed(2)}; converged: ${convergence(llmRun).round !== null}\n`);
out.push(await population("habit agents, 40 rounds", habitPolicy(habits), 40));
out.push(await population("habit agents, 400 rounds", habitPolicy(habits), 400));
out.push(await population("habit agents but copy 30% (not 3%)", habitPolicy({ ...habits, loseCopy: 0.3, loseKeep: habits.loseKeep * 0.7 }), 400));
out.push(await population("habit agents but no name preference", habitPolicy({ ...habits, prior: {} }), 400));
out.push(await population("majority agents (condition R)", majorityPolicy(), 40));
writeFileSync("public/results/habit.json", JSON.stringify({ habits, seeds: SEEDS, populations: out }, null, 1));
