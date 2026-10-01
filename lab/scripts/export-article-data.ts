// Collect everything the HTML explainer embeds into one compact JSON file.
//   node --experimental-strip-types scripts/export-article-data.ts > ../notes/article-data.json
import { existsSync, readFileSync } from "node:fs";
import { habitPolicy } from "../src/games/naming-rule.ts";
import { runGame } from "../src/sim/population.ts";
import { roundConsensus, strategy } from "../src/analysis/naming.ts";
import type { RunLog } from "../src/sim/record.ts";

const R = (f: string) => JSON.parse(readFileSync(`public/results/${f}.json`, "utf8"));
const has = (f: string) => existsSync(`public/results/${f}.json`);

// 1. Compact replays of real runs: per round, each agent's name, partner and shown order.
function compact(f: string, label: string) {
  const l = R(f) as RunLog;
  const rounds = [...Array(l.meta.rounds).keys()].map((r) => {
    const ps = l.plays.filter((p) => p.round === r).sort((a, b) => a.agent - b.agent);
    return { n: ps.map((p) => p.name), p: ps.map((p) => p.partner), o: ps.map((p) => p.order.join("")) };
  });
  const s = strategy(l);
  return { id: f, label, wording: l.meta.wording, memory: l.meta.memory, rounds, consensus: roundConsensus(l).map((x) => +x.toFixed(3)),
    habits: { winStay: +(s.winStay / s.win).toFixed(3), copy: +(s.loseCopy / s.lose).toFixed(3), keep: +(s.loseStay / s.lose).toFixed(3), explore: +(s.loseOther / s.lose).toFixed(3) } };
}
const replays = [
  ["naming-b-letters-game-s0", "Qwen 1.5B · seed 0"],
  ["naming-b-letters-game-s2", "Qwen 1.5B · seed 2"],
  ["naming-b-letters-tally-s1", "Qwen 1.5B + tally line · seed 1"],
  ["naming-a-letters-game-s0", "Qwen 1.5B greedy · seed 0"],
  ["naming-c-letters-game-s0", "Qwen 0.5B · seed 0"],
  ["naming-d-letters-game-s0", "Llama 1B · seed 0"],
  ["naming-b-letters-plain-s0", "Qwen 1.5B, plain wording · seed 0"],
  ["naming-e-letters-game-s0", "Half Qwen, half Llama · seed 0"],
  ["naming-gemma-4-26b-a4b-it-letters-game-s0", "Gemma 4 26B · seed 0 (converges)"],
  ["naming-f-letters-partners-s0", "Qwen 7B, partner-only memory · seed 0 (converges)"],
  ["naming-f-letters-game-s0", "Qwen 7B · seed 0"],
].filter(([f]) => has(f)).map(([f, l]) => compact(f, l));

// 2. Habit points for every model × prompt we ran (pooled over seeds).
function pooledHabits(files: string[]) {
  const logs = files.filter(has).map((f) => R(f) as RunLog).filter((l) => l.meta.finishedAt);
  const t = logs.map(strategy).reduce((a, s) => ({ winStay: a.winStay + s.winStay, win: a.win + s.win, loseCopy: a.loseCopy + s.loseCopy, loseStay: a.loseStay + s.loseStay, loseOther: a.loseOther + s.loseOther, lose: a.lose + s.lose }));
  const cons = logs.map((l) => { const c = roundConsensus(l); return c.slice(-10).reduce((a, b) => a + b, 0) / 10; });
  return { seeds: logs.length, winStay: +(t.winStay / t.win).toFixed(3), copy: +(t.loseCopy / t.lose).toFixed(3), keep: +(t.loseStay / t.lose).toFixed(3), explore: +(t.loseOther / t.lose).toFixed(3), finalConsensus: +(cons.reduce((a, b) => a + b, 0) / cons.length).toFixed(3) };
}
const seeds = (prefix: string) => [0, 1, 2, 3, 4].map((s) => `${prefix}-s${s}`);
const habitPoints = [
  { id: "B", label: "Qwen 1.5B", ...pooledHabits(seeds("naming-b-letters-game")) },
  { id: "A", label: "Qwen 1.5B greedy", ...pooledHabits(seeds("naming-a-letters-game")) },
  { id: "tally", label: "Qwen 1.5B + tally", ...pooledHabits(seeds("naming-b-letters-tally")) },
  { id: "plain", label: "Qwen 1.5B, plain wording", ...pooledHabits(seeds("naming-b-letters-plain")) },
  { id: "nonsense", label: "Qwen 1.5B, nonsense words", ...pooledHabits(seeds("naming-b-nonsense-game")) },
  { id: "C", label: "Qwen 0.5B", ...pooledHabits(seeds("naming-c-letters-game")) },
  { id: "D", label: "Llama 1B", ...pooledHabits(seeds("naming-d-letters-game")) },
  { id: "E", label: "Half Qwen, half Llama", ...pooledHabits(seeds("naming-e-letters-game")) },
  { id: "F", label: "Qwen 7B", ...pooledHabits(seeds("naming-f-letters-game")) },
  { id: "Fp", label: "Qwen 7B, partner-only", ...pooledHabits(seeds("naming-f-letters-partners")) },
  { id: "G", label: "Gemma 4 26B", ...pooledHabits(seeds("naming-gemma-4-26b-a4b-it-letters-game")) },
];

// 3. Habit map: final consensus for (win-stay × copy), no exploration, uniform names.
const WS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1], CP = [0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
const habitMap: { winStay: number; copy: number; consensus: number }[] = [];
for (const w of WS) for (const c of CP) {
  const pol = habitPolicy({ winStay: w, loseCopy: c, loseKeep: 1 - c, prior: {} });
  let tot = 0; const SEEDS = 16;
  for (let seed = 0; seed < SEEDS; seed++) {
    const l = await runGame({ condition: "map", seed, rounds: 60, memory: 1, pool: "letters", wording: "game", agentPolicies: Array(24).fill("p"), policies: { p: pol } });
    const cs = roundConsensus(l); tot += cs.slice(-10).reduce((a, b) => a + b, 0) / 10;
  }
  habitMap.push({ winStay: w, copy: c, consensus: +(tot / SEEDS).toFixed(3) });
}

// 4. Everything else, already summarised by earlier scripts.
const rule = R("rule");
const condCurves = Object.fromEntries([["B", "naming-b-letters-game"], ["A", "naming-a-letters-game"], ["C", "naming-c-letters-game"], ["D", "naming-d-letters-game"], ["E", "naming-e-letters-game"], ["tally", "naming-b-letters-tally"], ["F", "naming-f-letters-game"], ["Fp", "naming-f-letters-partners"], ["G", "naming-gemma-4-26b-a4b-it-letters-game"]].map(([k, p]) => {
  const logs = seeds(p).filter(has).map((f) => R(f) as RunLog).filter((l) => l.meta.finishedAt);
  const cs = logs.map(roundConsensus);
  return [k, { seeds: logs.length, curve: cs[0].map((_, r) => +(cs.reduce((s, c) => s + c[r], 0) / cs.length).toFixed(3)) }];
}));
condCurves.R = { seeds: 200, curve: rule.conditions[0].curve.map((x: number) => +x.toFixed(3)) };

const baselineOf = (f: string) => { const b = R(f); const pool = ["F","J","K","M","Q","R","T","W","X","Z"]; return { counts: pool.map((n) => b.picks.filter((p: { name: string }) => p.name === n).length), position: [...Array(10).keys()].map((i) => b.picks.filter((p: { position: number }) => p.position === i).length) }; };
const probesOf = (f: string) => { const d = R(f); const ids = [...new Set(d.calls.map((c: { probe: string }) => c.probe))] as string[]; return Object.fromEntries(ids.map((id) => { const cs = d.calls.filter((c: { probe: string }) => c.probe === id); const p = (a: string) => +(cs.filter((c: { answer: string }) => c.answer === a).length / cs.length).toFixed(2); return [id, { X: p("X"), Y: p("Y"), Z: p("Z"), other: p("other") }]; })); };

function cascadeSummary(f: string) {
  type Turn = { ball: "a" | "b"; guess: "A" | "B"; overrodeOwn: boolean; inCascade: boolean };
  const S = R(f).sequences as { urn: "A" | "B"; turns: Turn[] }[];
  const T = S.flatMap((s) => s.turns.map((t, i) => ({ ...t, i, urn: s.urn, seq: s })));
  const bins: Record<number, [number, number]> = {};
  for (const t of T.filter((t) => t.i > 0)) { const own = t.ball === "a" ? "A" : "B"; const e = t.seq.turns.slice(0, t.i); const net = Math.max(-3, Math.min(3, e.filter((x) => x.guess !== own).length - e.filter((x) => x.guess === own).length)); (bins[net] ??= [0, 0])[1]++; if (t.overrodeOwn) bins[net][0]++; }
  const p1 = T.filter((t) => t.i === 0);
  return { sequences: S.length, player1Own: +(p1.filter((t) => !t.overrodeOwn).length / p1.length).toFixed(2), accuracy: +(T.filter((t) => t.guess === t.urn).length / T.length).toFixed(2),
    last3Wrong: +(S.filter((s) => { const l = s.turns.slice(-3).map((t) => t.guess); return l.every((g) => g === l[0]) && l[0] !== s.urn; }).length / S.length).toFixed(2),
    conformity: [-3, -2, -1, 0, 1, 2, 3].map((k) => (bins[k] ? +(bins[k][0] / bins[k][1]).toFixed(3) : null)) };
}

console.log(JSON.stringify({
  replays, habitPoints, habitMap, condCurves,
  ruleSummary: { converged: 195, seeds: 200, medianRounds: 19, biased: rule.conditions[2].bias, tipping: rule.tipping },
  tippingMemory: R("tipping-memory").rows,
  baselines: { "Qwen 1.5B": baselineOf("baseline-qwen2-5-1-5b-instruct-letters-game-t07"), "Qwen 0.5B": baselineOf("baseline-qwen2-5-0-5b-instruct-letters-game-t07"), "Llama 1B": baselineOf("baseline-llama-3-2-1b-letters-game-t07") },
  ladder: Object.fromEntries([["Qwen 1.5B", "probe-qwen2-5-1-5b-instruct-game-t07"], ["Qwen 3B", "probe-qwen2-5-3b-instruct-game-t07"], ["Qwen 7B", "probe-qwen2-5-7b-instruct-game-t07"], ["Gemma 4 26B", "probe-gemma-4-26b-a4b-it-game-t07"], ["Gemma 4 31B", "probe-gemma-4-31b-it-game-t07"], ["Qwen 1.5B, partner-only", "probe-qwen2-5-1-5b-instruct-partners-t07"], ["Qwen 7B, partner-only", "probe-qwen2-5-7b-instruct-partners-t07"]].map(([k, f]) => [k, probesOf(f)])),
  gemmaTipping: [3, 5, 7].map((k) => { const f = `tip-naming-gemma-4-26b-a4b-it-letters-game-s0-k${k}`; if (!has(f)) return null; const l = R(f) as RunLog; const alt = l.meta.committed.find((c) => c)!; return { k, curve: [...Array(l.meta.rounds).keys()].map((r) => l.plays.filter((p) => p.round === r && p.name === alt).length / 24) }; }).filter(Boolean),
  probes: { game: probesOf("probe-qwen2-5-1-5b-instruct-game-t07"), tally: probesOf("probe-qwen2-5-1-5b-instruct-tally-t07"), plain: probesOf("probe-qwen2-5-1-5b-instruct-plain-t07"), llama: probesOf("probe-llama-3-2-1b-game-t07") },
  cascades: { qwen: cascadeSummary("cascade-qwen2-5-1-5b-instruct-t07-colours"), llama: cascadeSummary("cascade-llama-3-2-1b-t07-colours"), qwenGreedy: cascadeSummary("cascade-qwen2-5-1-5b-instruct-t0-colours"), qwenLetters: cascadeSummary("cascade-qwen2-5-1-5b-instruct-t07") },
  elFarol: R("el-farol").rows.map((r: { label: string; mean: number; sd: number; crowded: number; good: number }) => ({ label: r.label, mean: +r.mean.toFixed(1), sd: +r.sd.toFixed(1), crowded: +r.crowded.toFixed(2), good: +r.good.toFixed(2) })),
  schelling: R("schelling").rows.map((r: { tolerance: number; before: number; after: number; settled: number }) => ({ tolerance: r.tolerance, before: +r.before.toFixed(3), after: +r.after.toFixed(3), settled: r.settled })),
}));
