// Condition R: the rule-based reference, run entirely in Node. No model, no GPU.
//   npm run rule                       (defaults: 200 seeds)
//   SEEDS=50 npm run rule
// Writes a summary to public/results/rule.json; full logs are reproducible from the seeds.

import { writeFileSync } from "node:fs";
import { POOLS, type Memory } from "../src/games/naming.ts";
import { majorityChoice, majorityPolicy, minimalNamingGame, type MajorityOptions } from "../src/games/naming-rule.ts";
import { runGame, type Request } from "../src/sim/population.ts";
import { convergence, collectiveBias, summarise, tippingPoint, roundConsensus } from "../src/analysis/naming.ts";
import { makeRng, subSeed, shuffle } from "../src/lib/rng.ts";
import { mean, median } from "../src/lib/stats.ts";
import type { RunLog } from "../src/sim/record.ts";

const SEEDS = Number(process.env.SEEDS ?? 200);
const N = 24, ROUNDS = 40, M = 5, TIP_ROUNDS = 30;
const pool = POOLS.letters;
const FRACTIONS = [0, 1 / 24, 2 / 24, 3 / 24, 4 / 24, 5 / 24, 0.3, 0.4]; // 0–5 agents in steps of one, then 30% and 40%

const game = (condition: string, seed: number, opts: MajorityOptions) =>
  runGame({ condition, seed, rounds: ROUNDS, memory: M, pool: "letters", wording: "game", agentPolicies: Array(N).fill("rule"), policies: { rule: majorityPolicy(opts) } });

/** 'Individual-bias baseline' for a rule agent: fresh agents with empty memory. */
function individualPicks(opts: MajorityOptions, n = 200): string[] {
  return [...Array(n).keys()].map((i) => {
    const req: Request = { agent: 0, round: 0, memory: [], order: shuffle(makeRng(subSeed(99, i)), pool), seed: subSeed(98, i) };
    return majorityChoice(req, opts);
  });
}

const fmtDist = (cs: number[]) => pool.map((n, i) => `${n}:${cs[i]}`).join(" ");

async function condition(label: string, opts: MajorityOptions) {
  const logs: RunLog[] = [];
  for (let s = 0; s < SEEDS; s++) logs.push(await game(label, s, opts));
  const sum = summarise(logs);
  const bias = collectiveBias(sum.winners, individualPicks(opts), pool, 5000);
  const curve = ROUNDS && [...Array(ROUNDS).keys()].map((r) => mean(logs.map((l) => roundConsensus(l)[r])));
  console.log(`\n== ${label} ==`);
  console.log(`converged ${sum.converged}/${sum.runs} (95% CI ${sum.convergedCi.map((x) => x.toFixed(2)).join("–")}), median time ${median(sum.times)} rounds, ${sum.distinctWinners} distinct winners`);
  console.log(`mean per-round consensus: r0 ${curve[0].toFixed(2)}  r5 ${curve[5].toFixed(2)}  r10 ${curve[10].toFixed(2)}  r20 ${curve[20].toFixed(2)}  r39 ${curve[39].toFixed(2)}`);
  console.log(`winners:    ${fmtDist(bias.winnerCounts)}`);
  console.log(`individual: ${fmtDist(bias.individualCounts)}`);
  console.log(`TVD ${bias.tvd.toFixed(3)}, permutation p = ${bias.p.toFixed(4)}`);
  return { label, opts, summary: { ...sum, medianTime: median(sum.times) }, bias, curve, logs };
}

async function tipping(logs: RunLog[], opts: MajorityOptions) {
  const base = logs.filter((l) => convergence(l).round !== null);
  const rows = [];
  for (const f of FRACTIONS) {
    const k = Math.round(f * N);
    const out: RunLog[] = [];
    for (const l of base) {
      const conv = convergence(l).name!;
      const alt = pool[(pool.indexOf(conv) + 1) % pool.length];
      const committed = [...Array(N).keys()].map((i) => (i < k ? alt : null));
      out.push(
        await runGame({
          condition: `tip-${f}`, seed: l.meta.seed + 10000, rounds: TIP_ROUNDS, memory: M, pool: "letters", wording: "game",
          agentPolicies: Array(N).fill("rule"), policies: { rule: majorityPolicy(opts) }, committed,
          initialMemory: l.finalMemory as Memory[][], continuedFrom: `R|${l.meta.seed}`,
        }),
      );
    }
    rows.push({ ...tippingPoint(f, out, (x) => x.meta.committed.find((c) => c) ?? ""), committedAgents: k });
  }
  console.log(`\n== tipping (${base.length} converged populations, ${TIP_ROUNDS} more rounds) ==`);
  for (const r of rows) console.log(`f=${(r.fraction * 100).toFixed(0).padStart(2)}% (${String(r.committedAgents).padStart(2)} agents): flipped ${String(r.flipped).padStart(3)}/${r.runs}  ${(r.rate * 100).toFixed(0)}% [${r.ci.map((x) => (x * 100).toFixed(0)).join("–")}]`);
  return rows;
}

const plain = await condition("R (majority of last 5 partners)", {});
const noisy = await condition("R, 10% noise", { noise: 0.1 });
const biased = await condition("R, weak individual bias toward F (weight 1.5)", { prior: { F: 1.5 } });
const tip = await tipping(plain.logs, {});
const tipNoisy = await tipping(noisy.logs, { noise: 0.1 });

const ng = [...Array(SEEDS).keys()].map((s) => minimalNamingGame(N, pool, 200000, s));
const ngTimes = ng.filter((r) => r.consensusAt !== null).map((r) => r.consensusAt! / (N / 2));
console.log(`\n== classic minimal naming game (Baronchelli 2006), N=${N} ==`);
console.log(`consensus ${ngTimes.length}/${SEEDS}, median ${median(ngTimes).toFixed(1)} round-equivalents (${N / 2} interactions each), max distinct words ${Math.max(...ng.flatMap((r) => r.distinctWords))}`);

const strip = ({ logs: _logs, ...rest }: Awaited<ReturnType<typeof condition>>) => rest;
writeFileSync(
  "public/results/rule.json",
  JSON.stringify({ params: { SEEDS, N, ROUNDS, M, TIP_ROUNDS, FRACTIONS }, conditions: [plain, noisy, biased].map(strip), tipping: tip, tippingNoisy: tipNoisy, minimalNg: { times: ngTimes } }, null, 1),
);
