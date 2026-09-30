// Static SVG figures for the notes (GitHub renders them inline). Regenerate after new runs:
//   npm run figures
// Colours follow the dataviz reference palette; text uses ink colours, never series colours.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { roundConsensus } from "../src/analysis/naming.ts";
import type { RunLog } from "../src/sim/record.ts";

const OUT = "../notes/figures";
const INK = "#0b0b0b", INK2 = "#52514e", INK3 = "#8a8983", GRID = "#e6e5e0", SURFACE = "#fcfcfb";
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#4a3aa7", "#e87ba4", "#008300"];
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

interface Series { label: string; points: [number, number][]; colour: string; step?: boolean; dots?: boolean }

function lineChart(o: { title: string; subtitle: string; xLabel: string; yLabel: string; xTicks: number[]; xFmt?: (x: number) => string; yMax?: number; series: Series[]; refY?: { y: number; label: string } }) {
  const W = 720, H = 400, L = 56, R = 150, T = 70, B = 56;
  const xs = o.series.flatMap((s) => s.points.map((p) => p[0]));
  const x0 = Math.min(...xs), x1 = Math.max(...xs), yMax = o.yMax ?? 1;
  const x = (v: number) => L + ((v - x0) / (x1 - x0)) * (W - L - R);
  const y = (v: number) => T + (1 - v / yMax) * (H - T - B);
  const fmtX = o.xFmt ?? String;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, -apple-system, Segoe UI, sans-serif">`;
  svg += `<rect width="${W}" height="${H}" fill="${SURFACE}"/>`;
  svg += `<text x="${L}" y="28" font-size="16" font-weight="600" fill="${INK}">${esc(o.title)}</text>`;
  svg += `<text x="${L}" y="48" font-size="12" fill="${INK2}">${esc(o.subtitle)}</text>`;
  for (const t of [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax)) {
    svg += `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="${GRID}" stroke-width="1"/>`;
    svg += `<text x="${L - 8}" y="${y(t) + 4}" font-size="11" text-anchor="end" fill="${INK3}">${Math.round(t * 100)}%</text>`;
  }
  for (const t of o.xTicks) svg += `<text x="${x(t)}" y="${H - B + 18}" font-size="11" text-anchor="middle" fill="${INK3}">${esc(fmtX(t))}</text>`;
  svg += `<text x="${(L + W - R) / 2}" y="${H - 12}" font-size="12" text-anchor="middle" fill="${INK2}">${esc(o.xLabel)}</text>`;
  svg += `<text transform="translate(16 ${(T + H - B) / 2}) rotate(-90)" font-size="12" text-anchor="middle" fill="${INK2}">${esc(o.yLabel)}</text>`;
  if (o.refY) {
    svg += `<line x1="${L}" x2="${W - R}" y1="${y(o.refY.y)}" y2="${y(o.refY.y)}" stroke="${INK3}" stroke-width="1"/>`;
    svg += `<text x="${L + 4}" y="${y(o.refY.y) - 5}" font-size="11" fill="${INK2}">${esc(o.refY.label)}</text>`;
  }
  // Direct labels at line ends, nudged apart so they don't collide.
  const ends = o.series.map((s) => ({ s, yy: y(s.points[s.points.length - 1][1]) })).sort((a, b) => a.yy - b.yy);
  for (let i = 1; i < ends.length; i++) if (ends[i].yy - ends[i - 1].yy < 15) ends[i].yy = ends[i - 1].yy + 15;
  for (const s of o.series) {
    const pts = s.step
      ? s.points.flatMap((p, i) => (i ? [[p[0] - 0.5, s.points[i - 1][1]], [p[0] - 0.5, p[1]], p] : [p]))
      : s.points;
    const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
    svg += `<path d="${d}" fill="none" stroke="${s.colour}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (s.dots) for (const p of s.points) svg += `<circle cx="${x(p[0])}" cy="${y(p[1])}" r="4.5" fill="${s.colour}" stroke="${SURFACE}" stroke-width="2"/>`;
    const e = ends.find((q) => q.s === s)!;
    svg += `<line x1="${W - R + 6}" x2="${W - R + 18}" y1="${e.yy}" y2="${e.yy}" stroke="${s.colour}" stroke-width="2"/>`;
    svg += `<text x="${W - R + 22}" y="${e.yy + 4}" font-size="11.5" fill="${INK}">${esc(s.label)}</text>`;
  }
  return svg + "</svg>\n";
}

// ---------- 1. cascade conformity curve ----------
type Turn = { ball: "a" | "b"; guess: "A" | "B"; overrodeOwn: boolean };
function conformity(file: string): [number, number][] {
  const S = (JSON.parse(readFileSync(file, "utf8")) as { sequences: { turns: Turn[] }[] }).sequences;
  const bins = new Map<number, [number, number]>();
  for (const s of S)
    s.turns.forEach((t, i) => {
      if (!i) return;
      const own = t.ball === "a" ? "A" : "B";
      const e = s.turns.slice(0, i);
      const net = Math.max(-3, Math.min(3, e.filter((x) => x.guess !== own).length - e.filter((x) => x.guess === own).length));
      const b = bins.get(net) ?? [0, 0];
      bins.set(net, [b[0] + (t.overrodeOwn ? 1 : 0), b[1] + 1]);
    });
  return [...bins].sort((a, b) => a[0] - b[0]).map(([k, [a, n]]) => [k, a / n]);
}
const cascades = [
  { label: "Qwen 1.5B, T=0.7", file: "public/results/cascade-qwen2-5-1-5b-instruct-t07-colours.json", colour: SERIES[0] },
  { label: "Llama 1B, T=0.7", file: "public/results/cascade-llama-3-2-1b-t07-colours.json", colour: SERIES[2] },
  { label: "Qwen 1.5B, greedy", file: "public/results/cascade-qwen2-5-1-5b-instruct-t0-colours.json", colour: SERIES[3] },
].filter((c) => existsSync(c.file));
if (cascades.length) {
  writeFileSync(`${OUT}/cascade-conformity.svg`, lineChart({
    title: "Sampled LLM players slide toward the crowd; greedy ones switch in a step",
    subtitle: "100 sequences of 10 players each. How often a player guessed against its own ball.",
    xLabel: "earlier guesses against my ball minus guesses for it (capped at ±3)",
    yLabel: "went against own ball",
    xTicks: [-3, -2, -1, 0, 1, 2, 3], xFmt: (v) => (v > 0 ? `+${v}` : String(v)),
    series: [
      ...cascades.map((c) => ({ label: c.label, points: conformity(c.file), colour: c.colour, dots: true })),
      { label: "rational (Bayes)", points: [-3, -2, -1, 0, 1, 2, 3].map((k) => [k, k >= 2 ? 1 : 0] as [number, number]), colour: SERIES[1], step: true },
    ],
  }));
  console.log("wrote cascade-conformity.svg");
}

// ---------- 2. consensus over time, by condition ----------
const groups: { label: string; files: string[] }[] = [
  { label: "B + tally line", files: ["naming-b-letters-tally-s0", "naming-b-letters-tally-s1"] },
  { label: "B: Qwen 1.5B", files: ["naming-b-letters-game-s0", "naming-b-letters-game-s1", "naming-b-letters-game-s2"] },
  { label: "A: Qwen greedy", files: ["naming-a-letters-game-s0", "naming-a-letters-game-s1"] },
  { label: "D: Llama 1B", files: ["naming-d-letters-game-s0", "naming-d-letters-game-s1"] },
  { label: "C: Qwen 0.5B", files: ["naming-c-letters-game-s0", "naming-c-letters-game-s1"] },
];
const series: Series[] = [];
const rule = JSON.parse(readFileSync("public/results/rule.json", "utf8")) as { conditions: { curve: number[] }[] };
series.push({ label: "R: rule agents", points: rule.conditions[0].curve.map((v, r) => [r + 1, v]), colour: INK3 });
groups.forEach((g, i) => {
  const logs = g.files.map((f) => `public/results/${f}.json`).filter(existsSync).map((f) => JSON.parse(readFileSync(f, "utf8")) as RunLog).filter((l) => l.meta.finishedAt);
  if (!logs.length) return;
  const curves = logs.map(roundConsensus);
  const mean = curves[0].map((_, r) => curves.reduce((s, c) => s + c[r], 0) / curves.length);
  series.push({ label: `${g.label} (${logs.length})`, points: mean.map((v, r) => [r + 1, v]), colour: SERIES[i] });
});
writeFileSync(`${OUT}/consensus-by-condition.svg`, lineChart({
  title: "Rule agents agree; small LLM populations stall",
  subtitle: "Share of plays on the round's most common name, mean over seeds (n). 24 agents, 10 names.",
  xLabel: "round", yLabel: "consensus", xTicks: [1, 10, 20, 30, 40],
  series, refY: { y: 0.9, label: "converged (pre-registered: above 90% for 5 rounds)" },
}));
console.log("wrote consensus-by-condition.svg");
