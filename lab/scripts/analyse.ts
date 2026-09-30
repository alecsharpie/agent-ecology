// Read recorded naming-game runs and print what the agents are doing.
//   node --experimental-strip-types scripts/analyse.ts public/results/naming-b-letters-game-s0.json [...]
// Beyond the headline metrics it asks *how* agents choose: after a match do they repeat
// (win-stay)? After a mismatch do they copy their partner, keep their own name, or pick something else?

import { readFileSync } from "node:fs";
import type { RunLog } from "../src/sim/record.ts";
import { convergence, parseCounts, playsByRound, positionCounts, roundConsensus, strategy } from "../src/analysis/naming.ts";
import { median } from "../src/lib/stats.ts";

const files = process.argv.slice(2);
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "–");

for (const f of files) {
  const log = JSON.parse(readFileSync(f, "utf8")) as RunLog;
  const rounds = playsByRound(log);
  const cons = roundConsensus(log);
  const conv = convergence(log);
  const s = strategy(log);
  const pc = parseCounts([log]);
  console.log(`\n# ${f}`);
  console.log(`${log.meta.condition} seed ${log.meta.seed}, ${rounds.length}/${log.meta.rounds} rounds${log.meta.finishedAt ? "" : " (unfinished)"}, parse ${pc.ok}/${pc.repaired}/${pc.failed}, median ${median(log.plays.map((p) => p.ms ?? 0))} ms/call`);
  console.log(`converged: ${conv.round !== null ? `round ${conv.round + 1} on ${conv.name}` : "no"}`);
  console.log("round  consensus  top names");
  rounds.forEach((r, i) => {
    const t = new Map<string, number>();
    for (const n of r) t.set(n, (t.get(n) ?? 0) + 1);
    const top = [...t].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n, k]) => `${n}×${k}`).join(" ");
    console.log(`${String(i + 1).padStart(5)}  ${cons[i].toFixed(2).padStart(9)}  ${top}`);
  });
  console.log(`after a match:    repeat ${pct(s.winStay, s.win)} (n=${s.win})`);
  console.log(`after a mismatch: copy partner ${pct(s.loseCopy, s.lose)}, keep own ${pct(s.loseStay, s.lose)}, something else ${pct(s.loseOther, s.lose)} (n=${s.lose})`);
  const pos = positionCounts([log]);
  console.log(`position chosen (1..10): ${pos.join(" ")}`);
  const pos0 = positionCounts([log], true);
  console.log(`position, round 1 only:  ${pos0.join(" ")}`);
}
