// El Farol: diverse forecasters vs a monoculture vs coin flips.
//   node --experimental-strip-types scripts/run-el-farol.ts
import { writeFileSync } from "node:fs";
import { makeRng } from "../src/lib/rng.ts";
import { runElFarol, type ElFarolResult } from "../src/games/el-farol.ts";
import { mean } from "../src/lib/stats.ts";

const AGENTS = 100, CAPACITY = 60, WEEKS = 300, BURN_IN = 50, SEEDS = Number(process.env.SEEDS ?? 50);
const sd = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));

function describe(label: string, runs: number[][]) {
  const steady = runs.map((a) => a.slice(BURN_IN));
  const m = mean(steady.map(mean)), s = mean(steady.map(sd));
  const crowded = mean(steady.map((a) => a.filter((x) => x > CAPACITY).length / a.length));
  const good = mean(steady.map((a) => mean(a.map((x) => (x <= CAPACITY ? x : 0))) / CAPACITY));
  console.log(`${label.padEnd(42)} mean ${m.toFixed(1).padStart(5)}  sd ${s.toFixed(1).padStart(5)}  overcrowded ${Math.round(crowded * 100).toString().padStart(3)}% of weeks  seats enjoyed ${Math.round(good * 100)}%`);
  return { label, mean: m, sd: s, crowded, good, example: runs[0].slice(0, 80) };
}

console.log(`El Farol: ${AGENTS} agents, capacity ${CAPACITY}, ${WEEKS} weeks (first ${BURN_IN} discarded), ${SEEDS} seeds.`);
console.log(`"Seats enjoyed" = average attendance on good nights / capacity; crowded nights count as 0.\n`);
const rows: ReturnType<typeof describe>[] = [];
const seeds = [...Array(SEEDS).keys()];
const diverse = (k: number) => seeds.map((seed) => runElFarol({ agents: AGENTS, capacity: CAPACITY, k, weeks: WEEKS, seed, decay: 0.9 }));
for (const k of [1, 3, 6, 12]) rows.push(describe(`diverse, ${k} predictor${k > 1 ? "s" : ""} per agent`, diverse(k).map((r) => r.attendance)));
for (const mono of ["same as 1 week ago", "average of last 4", "trend over last 3"])
  rows.push(describe(`monoculture: everyone uses "${mono}"`, seeds.map((seed) => runElFarol({ agents: AGENTS, capacity: CAPACITY, k: 1, weeks: WEEKS, seed, decay: 0.9, monoculture: mono }).attendance)));
rows.push(describe("coin flips: each goes with p = 0.6", seeds.map((seed) => { const r = makeRng(seed); return [...Array(WEEKS)].map(() => [...Array(AGENTS)].filter(() => r() < 0.6).length); })));

const ex: ElFarolResult = diverse(6)[0];
console.log(`\nseed 0, 6 predictors each, weeks 51–90: ${ex.attendance.slice(50, 90).join(" ")}`);
console.log(`predictors trusted in the final week: ${Object.entries(ex.finalTrust).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} (${c})`).join(", ")}`);
writeFileSync("public/results/el-farol.json", JSON.stringify({ params: { AGENTS, CAPACITY, WEEKS, BURN_IN, SEEDS }, rows, example: ex }, null, 1));
