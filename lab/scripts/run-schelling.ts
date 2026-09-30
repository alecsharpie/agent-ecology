// Schelling segregation sweep. Rule-based, runs in Node in seconds.
//   npm run schelling
import { writeFileSync } from "node:fs";
import { draw, runSchelling } from "../src/games/schelling.ts";
import { mean, median } from "../src/lib/stats.ts";

const SIZE = 30, DENSITY = 0.9, MAX_STEPS = 200, SEEDS = Number(process.env.SEEDS ?? 50);
const TOLERANCES = [0, 0.125, 0.25, 0.3, 0.375, 0.5, 0.625, 0.75, 0.875];

const rows = TOLERANCES.map((tolerance) => {
  const runs = [...Array(SEEDS).keys()].map((seed) => runSchelling({ size: SIZE, density: DENSITY, tolerance, maxSteps: MAX_STEPS, seed }));
  return {
    tolerance,
    before: mean(runs.map((r) => r.similarity[0])),
    after: mean(runs.map((r) => r.similarity.at(-1)!)),
    settled: runs.filter((r) => r.settled).length,
    medianSteps: median(runs.map((r) => r.steps)),
    example: runs[0],
  };
});

console.log(`Schelling: ${SIZE}×${SIZE} grid, ${DENSITY * 100}% occupied, ${SEEDS} seeds per row`);
console.log("wants ≥ this share alike | similar neighbours before → after | settled | median steps");
for (const r of rows)
  console.log(`${(r.tolerance * 100).toFixed(1).padStart(22)}% | ${(r.before * 100).toFixed(0).padStart(6)}% → ${(r.after * 100).toFixed(0).padStart(3)}%${" ".repeat(18)}| ${String(r.settled).padStart(3)}/${SEEDS} | ${r.medianSteps}`);

const ex = rows.find((r) => r.tolerance === 0.3)!.example;
console.log(`\nSeed 0 at 30% tolerance, before:\n${draw(ex.initial, SIZE)}\n\nafter ${ex.steps} steps:\n${draw(ex.final, SIZE)}`);

writeFileSync("public/results/schelling.json", JSON.stringify({ params: { SIZE, DENSITY, MAX_STEPS, SEEDS }, rows: rows.map(({ example, ...r }) => ({ ...r, example: { initial: example.initial, final: example.final, similarity: example.similarity, unhappy: example.unhappy } })) }));
