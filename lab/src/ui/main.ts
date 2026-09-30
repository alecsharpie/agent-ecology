// The lab page: pick a condition and seed, run it on WebGPU, watch the population.
// Every round is saved to public/results/<run>.json (dev server only), so a stopped or
// crashed run resumes where it left off. URL params (?cond=B&seed=0&pool=letters&wording=game)
// preset the form; &go=run or &go=baseline starts immediately (used by the headless driver).

import { CONDITIONS, PARAMS, baselineName, conditionById, runName } from "../conditions.ts";
import { POOLS, answerSchema, buildPrompt, parseAnswer, type PoolId, type WordingId } from "../games/naming.ts";
import { describeGpu, hasWebGpu, llm } from "../lib/llm.ts";
import { modelLabel } from "../lib/models.ts";
import { median } from "../lib/stats.ts";
import { llmPolicy } from "../sim/llm-policy.ts";
import { poolOrder, runGame, type Policy } from "../sim/population.ts";
import type { RunLog } from "../sim/record.ts";
import { convergence, parseCounts, playsByRound, roundConsensus } from "../analysis/naming.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const condSel = $<HTMLSelectElement>("cond");
const poolSel = $<HTMLSelectElement>("pool");
const wordingSel = $<HTMLSelectElement>("wording");
const seedIn = $<HTMLInputElement>("seed");
const runBtn = $<HTMLButtonElement>("run");
const baseBtn = $<HTMLButtonElement>("baseline");
const stopBtn = $<HTMLButtonElement>("stop");
const status = $("status");

for (const c of CONDITIONS) condSel.add(new Option(`${c.id}: ${c.label}`, c.id));
const params = new URLSearchParams(location.search);
condSel.value = params.get("cond") ?? "B";
poolSel.value = params.get("pool") ?? "letters";
wordingSel.value = params.get("wording") ?? "game";
seedIn.value = params.get("seed") ?? "0";

type Phase = "idle" | "loading" | "running" | "done" | "stopped" | "error";
function setStatus(phase: Phase, text: string) {
  status.dataset.phase = phase;
  status.textContent = text;
}

let controller: AbortController | null = null;
function busy(on: boolean) {
  runBtn.disabled = baseBtn.disabled = on;
  stopBtn.disabled = !on;
}
stopBtn.onclick = () => controller?.abort();

async function save(name: string, data: unknown) {
  try {
    await fetch(`/__save-results?name=${name}`, { method: "POST", body: JSON.stringify(data) });
  } catch {
    // Not on the dev server: nothing to save to. The run still completes in memory.
  }
}

async function loadSaved<T>(name: string): Promise<T | null> {
  try {
    const r = await fetch(`/results/${name}.json`, { cache: "no-store" });
    return r.ok ? ((await r.json()) as T) : null; // Vite serves index.html for missing files, which fails to parse
  } catch {
    return null;
  }
}

const loadModel = (modelId: string) =>
  llm.load(modelId, (p) => setStatus("loading", `Loading ${modelLabel(modelId)}: ${Math.round(p.progress * 100)}% (${p.text})`));

// ---------- rendering ----------

function renderGrid(log: RunLog | null) {
  const grid = $("grid");
  const n = PARAMS.agents;
  const rounds = log ? playsByRound(log) : [];
  const last = log?.plays.filter((p) => p.round === rounds.length - 1) ?? [];
  const tally = new Map<string, number>();
  for (const p of last) tally.set(p.name, (tally.get(p.name) ?? 0) + 1);
  const modal = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0];
  grid.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const p = last.find((x) => x.agent === i);
    const cell = document.createElement("div");
    cell.className = `cell${p && p.name === modal ? " modal" : ""}${log?.meta.committed[i] ? " committed" : ""}`;
    cell.textContent = p?.name ?? "·";
    cell.title = p ? `Agent ${i}: played ${p.name}, partner ${p.partner}, ${p.payoff > 0 ? "+" : ""}${p.payoff}` : `Agent ${i}`;
    grid.append(cell);
  }
}

function renderChart(series: number[], rounds: number) {
  const el = $("chart");
  const W = 560, H = 240, L = 32, R = 8, T = 8, B = 24;
  const x = (r: number) => L + (r / Math.max(1, rounds - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v) * (H - T - B);
  const path = series.map((v, r) => `${r ? "L" : "M"}${x(r).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const yTicks = [0, 0.5, 1].map((v) => `<text class="tick" x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${v}</text>`).join("");
  const xTicks = [0, 10, 20, 30, rounds - 1].filter((r) => r < rounds).map((r) => `<text class="tick" x="${x(r)}" y="${H - 6}" text-anchor="middle">${r + 1}</text>`).join("");
  el.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Consensus by round">` +
    `<line class="axis" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>` +
    `<line class="threshold" x1="${L}" x2="${W - R}" y1="${y(0.9)}" y2="${y(0.9)}"/>` +
    yTicks + xTicks +
    `<path class="line" d="${path}"/>` +
    `<line class="hair" y1="${T}" y2="${y(0)}" visibility="hidden"/>` +
    `<circle class="dot" r="4" visibility="hidden"/>` +
    `<rect x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent"/>` +
    `</svg><div class="tooltip" hidden></div>`;
  const svg = el.querySelector("svg")!;
  const tip = el.querySelector<HTMLDivElement>(".tooltip")!;
  const hair = svg.querySelector<SVGLineElement>(".hair")!;
  const dot = svg.querySelector<SVGCircleElement>(".dot")!;
  svg.onpointermove = (e) => {
    if (!series.length) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    const r = Math.max(0, Math.min(series.length - 1, Math.round(((pt.x - L) / (W - L - R)) * (rounds - 1))));
    hair.setAttribute("x1", String(x(r)));
    hair.setAttribute("x2", String(x(r)));
    dot.setAttribute("cx", String(x(r)));
    dot.setAttribute("cy", String(y(series[r])));
    hair.setAttribute("visibility", "visible");
    dot.setAttribute("visibility", "visible");
    tip.hidden = false;
    tip.textContent = `Round ${r + 1}: ${Math.round(series[r] * 100)}% on the most common name`;
    const box = el.getBoundingClientRect();
    tip.style.left = `${Math.min(box.width - 200, Math.max(0, e.clientX - box.left + 12))}px`;
    tip.style.top = `${e.clientY - box.top - 30}px`;
  };
  svg.onpointerleave = () => {
    tip.hidden = true;
    hair.setAttribute("visibility", "hidden");
    dot.setAttribute("visibility", "hidden");
  };
}

function renderRunDetail(log: RunLog) {
  const recent = log.plays.slice(-8).reverse();
  const ms = log.plays.map((p) => p.ms ?? 0).filter(Boolean);
  const pc = parseCounts([log]);
  const conv = convergence(log);
  $("detail-title").textContent = "Run";
  $("detail").innerHTML =
    `<p>${log.plays.length} calls, median ${median(ms)} ms per call. Parse: ${pc.ok} ok, ${pc.repaired} repaired, ${pc.failed} failed. ` +
    (conv.round !== null ? `Converged on <b>${conv.name}</b> at round ${conv.round + 1}.` : "Not converged yet.") +
    `</p><div class="table-wrap"><table><tr><th>Round</th><th>Agent</th><th>Played</th><th>Position</th><th>Payoff</th><th>Raw output</th><th>ms</th></tr>` +
    recent.map((p) => `<tr><td>${p.round + 1}</td><td>${p.agent}</td><td>${p.name}</td><td>${p.position + 1}</td><td>${p.payoff}</td><td><code>${escapeHtml(p.raw ?? "")}</code></td><td>${p.ms ?? ""}</td></tr>`).join("") +
    `</table></div>`;
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function render(log: RunLog) {
  renderGrid(log);
  renderChart(roundConsensus(log), log.meta.rounds);
  renderRunDetail(log);
}

// ---------- a seed of one condition ----------

async function runSeed() {
  const cond = conditionById(condSel.value)!;
  const pool = poolSel.value as PoolId;
  const wording = wordingSel.value as WordingId;
  const seed = Number(seedIn.value);
  const name = runName(cond.id, pool, wording, seed);
  controller = new AbortController();
  busy(true);
  try {
    const saved = await loadSaved<RunLog>(name);
    if (saved?.meta.finishedAt) {
      render(saved);
      setStatus("done", `${name} is already complete (loaded from public/results). Pick another seed to run.`);
      return;
    }
    const agentPolicies = Array.from({ length: PARAMS.agents }, (_, i) => cond.models[i % cond.models.length]);
    const policies: Record<string, Policy> = {};
    for (const m of cond.models) {
      policies[m] = llmPolicy({ modelId: m, temperature: cond.temperature, wording, llm, prepare: loadModel, signal: controller.signal });
    }
    const gpu = await describeGpu();
    const started = performance.now();
    const log = await runGame({
      condition: cond.id, seed, rounds: PARAMS.rounds, memory: PARAMS.memory, pool, wording, agentPolicies, policies,
      resume: saved?.plays, signal: controller.signal, gpu,
      onDecision: (round, done, total) => setStatus("running", `${name}: round ${round + 1}/${PARAMS.rounds}, call ${done}/${total}`),
      onRound: async (l) => {
        render(l);
        await save(name, l);
      },
    });
    await save(name, log);
    render(log);
    const mins = ((performance.now() - started) / 60000).toFixed(1);
    if (controller.signal.aborted) setStatus("stopped", `Stopped after ${playsByRound(log).length} rounds. Run the same seed again to resume.`);
    else setStatus("done", `${name} finished in ${mins} min${saved ? " (resumed)" : ""}. Saved to public/results/${name}.json.`);
  } catch (e) {
    setStatus("error", `Error: ${(e as Error).message}`);
    throw e;
  } finally {
    busy(false);
  }
}

// ---------- individual-bias baseline ----------

interface BaselinePick {
  name: string | null;
  position: number;
  order: string[];
  raw: string;
  status: string;
  ms: number;
}

async function runBaseline() {
  const cond = conditionById(condSel.value)!;
  const pool = poolSel.value as PoolId;
  const wording = wordingSel.value as WordingId;
  const model = cond.models[0];
  const name = baselineName(model, pool, wording, cond.temperature);
  controller = new AbortController();
  busy(true);
  try {
    await loadModel(model);
    const picks: BaselinePick[] = [];
    for (let i = 0; i < PARAMS.baselineAgents && !controller.signal.aborted; i++) {
      // Different shuffle and seed per fresh agent; memory is empty.
      const order = poolOrder(POOLS[pool], 777, 0, i);
      const c = await llm.complete(buildPrompt(wording, order, []), { temperature: cond.temperature, maxTokens: 20, jsonSchema: answerSchema(order), seed: 1000 + i });
      const p = parseAnswer(c.text, order);
      picks.push({ name: p.name, position: p.name ? order.indexOf(p.name) : -1, order, raw: c.text, status: p.status, ms: c.ms });
      setStatus("running", `Baseline ${model}: ${picks.length}/${PARAMS.baselineAgents}`);
      if (picks.length % 20 === 0) renderBaseline(picks, pool);
    }
    renderBaseline(picks, pool);
    await save(name, { meta: { model, pool, wording, temperature: cond.temperature, gpu: await describeGpu(), finishedAt: new Date().toISOString() }, picks });
    setStatus(controller.signal.aborted ? "stopped" : "done", `Baseline saved to public/results/${name}.json (${picks.length} picks).`);
  } catch (e) {
    setStatus("error", `Error: ${(e as Error).message}`);
    throw e;
  } finally {
    busy(false);
  }
}

function renderBaseline(picks: BaselinePick[], pool: PoolId) {
  const names = POOLS[pool];
  const byName = names.map((n) => picks.filter((p) => p.name === n).length);
  const byPos = names.map((_, i) => picks.filter((p) => p.position === i).length);
  const max = Math.max(1, ...byName, ...byPos);
  const rows = (labels: string[], cs: number[]) =>
    labels.map((l, i) => `<tr><td>${l}</td><td><span class="bar" style="width:${(cs[i] / max) * 200}px"></span>${cs[i]}</td></tr>`).join("");
  $("detail-title").textContent = `Individual baseline (${picks.length} fresh agents)`;
  $("detail").innerHTML =
    `<p>Uniform would be ${(picks.length / names.length).toFixed(0)} per name. The position table checks that the shuffle stops order from passing for preference.</p>` +
    `<div class="panels"><div class="table-wrap"><table><tr><th>Name</th><th>Picks</th></tr>${rows(names, byName)}</table></div>` +
    `<div class="table-wrap"><table><tr><th>Position shown</th><th>Picks</th></tr>${rows(names.map((_, i) => String(i + 1)), byPos)}</table></div></div>`;
}

runBtn.onclick = () => void runSeed();
baseBtn.onclick = () => void runBaseline();

renderGrid(null);
renderChart([], PARAMS.rounds);
if (!hasWebGpu()) setStatus("error", "WebGPU is not available in this browser. Use a recent Chrome.");
else if (params.get("go") === "run") void runSeed();
else if (params.get("go") === "baseline") void runBaseline();
