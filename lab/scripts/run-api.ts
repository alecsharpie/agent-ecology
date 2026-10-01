// Run probes or naming-game populations against an API model (Gemini / Gemma via the Gemini API).
// Same game code, pairing, logging and file formats as the browser runs.
//   MODEL=gemini-3.8-flash THINKING=low MODE=probe K=5 node --experimental-strip-types scripts/run-api.ts
//   MODEL=gemma-4-26b-a4b-it MODE=run SEEDS=0-1 WORDING=game node --experimental-strip-types scripts/run-api.ts
//   MODEL=gemma-4-26b-a4b-it MODE=baseline N=200                    (200 fresh agents, empty memory)
//   MODEL=gemma-4-26b-a4b-it MODE=tip FROM=<run name> K=5 ROUNDS=30   (commit K agents to a new name)
// Population runs checkpoint after every round and resume if restarted.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Memory } from "../src/games/naming.ts";
import { poolOrder } from "../src/sim/population.ts";
import { GeminiLLM } from "../src/lib/gemini.ts";
import { POOLS, answerSchema, buildPrompt, parseAnswer, type WordingId } from "../src/games/naming.ts";
import { PROBES, classify, roles } from "../src/games/probes.ts";
import { makeRng, shuffle, subSeed } from "../src/lib/rng.ts";
import { runGame, type Decision, type Policy, type Request } from "../src/sim/population.ts";
import type { RunLog } from "../src/sim/record.ts";

const model = process.env.MODEL ?? "gemini-3.8-flash";
const llm = new GeminiLLM({ model, thinkingLevel: process.env.THINKING || undefined, rpm: process.env.RPM ? Number(process.env.RPM) : undefined });
const temperature = Number(process.env.TEMP ?? 0.7);
const wording = (process.env.WORDING ?? "game") as WordingId;
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);
const tag = model.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

function apiPolicy(): Policy {
  return {
    id: model,
    async decide(requests: Request[]): Promise<Decision[]> {
      return pool(requests, CONCURRENCY, async (r) => {
        const c = await llm.complete(buildPrompt(wording, r.order, r.memory), { temperature, maxTokens: 20, jsonSchema: answerSchema(r.order), seed: r.seed });
        const { name, status } = parseAnswer(c.text, r.order);
        return { name, status, raw: c.text, ms: c.ms, promptTokens: c.promptTokens, completionTokens: c.completionTokens };
      });
    },
  };
}

/** Map with at most `n` calls in flight. */
async function pool<T, R>(items: T[], n: number, f: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all([...Array(Math.min(n, items.length))].map(async () => { while (next < items.length) { const i = next++; out[i] = await f(items[i], i); } }));
  return out;
}

const MODE = process.env.MODE ?? "probe";
if (MODE === "baseline") {
  const N = Number(process.env.N ?? 200), names = POOLS.letters;
  const picks = await pool([...Array(N).keys()], CONCURRENCY, async (i) => {
    const order = poolOrder(names, 777, 0, i); // same shuffles as the browser baselines
    const c = await llm.complete(buildPrompt(wording, order, []), { temperature, maxTokens: 20, jsonSchema: answerSchema(order), seed: 1000 + i });
    const p = parseAnswer(c.text, order);
    return { name: p.name, position: p.name ? order.indexOf(p.name) : -1, order, raw: c.text, status: p.status, ms: c.ms };
  });
  const name = `baseline-${tag}-letters-${wording}-t${String(temperature).replace(".", "")}`;
  writeFileSync(`public/results/${name}.json`, JSON.stringify({ meta: { model, pool: "letters", wording, temperature, finishedAt: new Date().toISOString() }, picks }));
  console.log(`saved ${name}: ${names.map((n) => `${n}:${picks.filter((p) => p.name === n).length}`).join(" ")} | first position ${picks.filter((p) => p.position === 0).length}`);
} else if (MODE === "tip") {
  const from = process.env.FROM!, K = Number(process.env.K ?? 5), rounds = Number(process.env.ROUNDS ?? 30);
  const base = JSON.parse(readFileSync(`public/results/${from}.json`, "utf8")) as RunLog;
  const last = base.plays.filter((p) => p.round === base.meta.rounds - 1).map((p) => p.name);
  const conv = [...new Set(last)].sort((a, b) => last.filter((x) => x === b).length - last.filter((x) => x === a).length)[0];
  const names = POOLS.letters, alt = names[(names.indexOf(conv) + 3) % names.length];
  const committed = [...Array(24).keys()].map((i) => (i < K ? alt : null));
  const name = `tip-${from}-k${K}`;
  const file = `public/results/${name}.json`;
  const saved = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as RunLog) : null;
  const policy = apiPolicy();
  const log = await runGame({
    condition: `tip-k${K}`, seed: base.meta.seed + 10000, rounds, memory: 5, pool: "letters", wording, agentPolicies: Array(24).fill(model), policies: { [model]: policy },
    committed, initialMemory: base.finalMemory as Memory[][], continuedFrom: from, resume: saved?.plays,
    onRound: (l) => { writeFileSync(file, JSON.stringify(l)); const r = Math.max(...l.plays.map((p) => p.round)); console.log(`${name} round ${r + 1}/${rounds}: ${alt} played by ${l.plays.filter((p) => p.round === r && p.name === alt).length}/24 (convention was ${conv})`); },
  });
  writeFileSync(file, JSON.stringify(log));
} else if (MODE === "probe") {
  const K = Number(process.env.K ?? 5), names = POOLS.letters;
  const jobs = PROBES.flatMap((p) => names.flatMap((_, i) => [...Array(K).keys()].map((j) => ({ p, i, j }))));
  let done = 0;
  const calls = await pool(jobs, CONCURRENCY, async ({ p, i, j }) => {
    const r = roles(names, i), order = shuffle(makeRng(subSeed(i, j, 5)), names);
    const c = await llm.complete(buildPrompt(wording, order, p.memory(r.x, r.y, r.z)), { temperature, maxTokens: 20, jsonSchema: answerSchema(order), seed: subSeed(i, j, 6) });
    const parsed = parseAnswer(c.text, order);
    if (++done % 20 === 0) console.log(`${done}/${jobs.length}`);
    return { probe: p.id, ...r, order, raw: c.text, name: parsed.name, answer: classify(parsed.name, r), ms: c.ms };
  });
  const name = `probe-${tag}-${wording}-t${String(temperature).replace(".", "")}`;
  writeFileSync(`public/results/${name}.json`, JSON.stringify({ meta: { model, temperature, wording, k: K, thinking: process.env.THINKING ?? null }, calls }));
  for (const p of PROBES) {
    const cs = calls.filter((c) => c.probe === p.id), f = (a: string) => Math.round((100 * cs.filter((c) => c.answer === a).length) / cs.length);
    console.log(`${p.id.padEnd(16)} own X ${f("X")}%  partner Y ${f("Y")}%  Z ${f("Z")}%  other ${f("other")}%`);
  }
  console.log(`saved ${name}`);
} else {
  const [lo, hi] = (process.env.SEEDS ?? "0").split("-").map(Number);
  const rounds = Number(process.env.ROUNDS ?? 40);
  const policy = apiPolicy();
  for (let seed = lo; seed <= (hi ?? lo); seed++) {
    const name = `naming-${tag}-letters-${wording}-s${seed}`;
    const file = `public/results/${name}.json`;
    const saved = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as RunLog) : null;
    if (saved?.meta.finishedAt) { console.log(`${name} already complete`); continue; }
    const started = Date.now();
    const log = await runGame({
      condition: tag, seed, rounds, memory: 5, pool: "letters", wording, agentPolicies: Array(24).fill(model), policies: { [model]: policy }, resume: saved?.plays,
      onRound: (l) => {
        writeFileSync(file, JSON.stringify(l));
        const r = Math.max(...l.plays.map((p) => p.round));
        const t = new Map<string, number>(); for (const p of l.plays.filter((p) => p.round === r)) t.set(p.name, (t.get(p.name) ?? 0) + 1);
        console.log(`${name} round ${r + 1}/${rounds}: ${[...t].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => `${n}×${c}`).join(" ")} (${Math.round((Date.now() - started) / 1000)} s)`);
      },
    });
    writeFileSync(file, JSON.stringify(log));
  }
}
