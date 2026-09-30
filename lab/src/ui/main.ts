// The lab page: pick a condition and seed, run it on WebGPU, watch the population.
// Every round is saved to public/results/<run>.json (dev server only), so a stopped or
// crashed run resumes where it left off. URL params (?cond=B&seed=0&pool=letters&wording=game)
// preset the form; &go=run or &go=baseline starts immediately (used by the headless driver).
//
// Explainability is the point of the page: click any agent to see the exact prompt it was
// shown and what it answered, and scrub through rounds to watch a convention form.

import { CONDITIONS, PARAMS, baselineName, conditionById, runName } from "../conditions.ts";
import { POOLS, answerSchema, buildPrompt, parseAnswer, window as memWindow, type PoolId, type WordingId } from "../games/naming.ts";
import { describeGpu, hasWebGpu, llm } from "../lib/llm.ts";
import { modelLabel } from "../lib/models.ts";
import { median } from "../lib/stats.ts";
import { llmPolicy } from "../sim/llm-policy.ts";
import { poolOrder, replayMemory, runGame, type Policy } from "../sim/population.ts";
import type { RunLog } from "../sim/record.ts";
import { convergence, parseCounts, playsByRound, roundConsensus, strategy } from "../analysis/naming.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const condSel = $<HTMLSelectElement>("cond");
const poolSel = $<HTMLSelectElement>("pool");
const wordingSel = $<HTMLSelectElement>("wording");
const seedIn = $<HTMLInputElement>("seed");
const runBtn = $<HTMLButtonElement>("run");
const baseBtn = $<HTMLButtonElement>("baseline");
const loadBtn = $<HTMLButtonElement>("load");
const stopBtn = $<HTMLButtonElement>("stop");
const status = $("status");
const bar = $("progress");
const scrub = $<HTMLInputElement>("scrub");

for (const c of CONDITIONS) condSel.add(new Option(`${c.id}: ${c.label}`, c.id));
const params = new URLSearchParams(location.search);
condSel.value = params.get("cond") ?? "B";
poolSel.value = params.get("pool") ?? "letters";
wordingSel.value = params.get("wording") ?? "game";
seedIn.value = params.get("seed") ?? "0";
const describeCondition = () => {
  const c = conditionById(condSel.value)!;
  $("cond-purpose").textContent = `${c.purpose}. ${c.models.map(modelLabel).join(" + ")}, temperature ${c.temperature}.`;
};
condSel.onchange = describeCondition;
describeCondition();

// ---------- status and progress ----------

type Phase = "idle" | "loading" | "running" | "done" | "stopped" | "error";
function setStatus(phase: Phase, text: string, progress?: number) {
  status.dataset.phase = phase;
  status.textContent = text;
  bar.hidden = progress === undefined;
  if (progress !== undefined) {
    const pct = Math.round(Math.max(0, Math.min(1, progress)) * 1000) / 10;
    bar.querySelector<HTMLDivElement>(".fill")!.style.width = `${pct}%`;
    bar.setAttribute("aria-valuenow", String(pct));
    bar.dataset.phase = phase;
  }
}

const fmtMinutes = (ms: number) => (ms < 60000 ? "under a minute" : `about ${Math.round(ms / 60000)} min`);

let controller: AbortController | null = null;
function busy(on: boolean) {
  runBtn.disabled = baseBtn.disabled = loadBtn.disabled = on;
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

/** Read a saved result: from the dev server's disk reader if present, else the static file. */
async function loadSaved<T>(name: string): Promise<T | null> {
  for (const url of [`/__save-results?name=${name}`, `/results/${name}.json`]) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok) return (await r.json()) as T; // a missing static file comes back as index.html and fails to parse
    } catch {
      // try the next source
    }
  }
  return null;
}

const loadModel = (modelId: string) =>
  llm.load(modelId, (p) => setStatus("loading", `Loading ${modelLabel(modelId)}: ${Math.round(p.progress * 100)}%. ${p.text}`, p.progress));

// ---------- the current run, and which round / agent is being inspected ----------

let current: RunLog | null = null;
let viewRound: number | null = null; // null = follow the latest round
let selected: number | null = null;

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function shownRound(log: RunLog) {
  const n = playsByRound(log).length;
  return viewRound === null ? n - 1 : Math.min(viewRound, n - 1);
}

function renderGrid(log: RunLog | null) {
  const grid = $("grid");
  const r = log ? shownRound(log) : -1;
  const plays = log?.plays.filter((p) => p.round === r) ?? [];
  const tally = new Map<string, number>();
  for (const p of plays) tally.set(p.name, (tally.get(p.name) ?? 0) + 1);
  const ranked = [...tally].sort((a, b) => b[1] - a[1]);
  const modal = ranked[0]?.[0];
  $("round-label").textContent = log && r >= 0 ? `Round ${r + 1} of ${log.meta.rounds}` : "No run yet";
  $("round-tally").textContent = ranked.length ? `Most played: ${ranked.slice(0, 4).map(([n, c]) => `${n} ×${c}`).join(", ")}` : "";
  grid.innerHTML = "";
  for (let i = 0; i < PARAMS.agents; i++) {
    const p = plays.find((x) => x.agent === i);
    const cell = document.createElement("button");
    cell.className = `cell${p && p.name === modal ? " modal" : ""}${log?.meta.committed[i] ? " committed" : ""}${selected === i ? " selected" : ""}${p && p.payoff > 0 ? " matched" : ""}`;
    cell.innerHTML = `<span class="name">${p?.name ?? "·"}</span>${p ? `<span class="pay">${p.payoff > 0 ? "✓" : "✗"}</span>` : ""}`;
    cell.setAttribute("aria-label", p ? `Agent ${i}: played ${p.name}, ${p.payoff > 0 ? "matched" : "did not match"} partner ${p.partner}` : `Agent ${i}`);
    cell.onclick = () => {
      selected = i;
      if (current) render(current);
    };
    grid.append(cell);
  }
  if (log) {
    const n = playsByRound(log).length;
    scrub.max = String(Math.max(0, n - 1));
    scrub.value = String(r);
    scrub.disabled = n < 2;
  }
}

scrub.oninput = () => {
  if (!current) return;
  const n = playsByRound(current).length;
  const v = Number(scrub.value);
  viewRound = v >= n - 1 ? null : v;
  render(current);
};

function renderChart(series: number[], rounds: number, marked: number | null) {
  const el = $("chart");
  const W = 560, H = 240, L = 32, R = 8, T = 8, B = 24;
  const x = (r: number) => L + (r / Math.max(1, rounds - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v) * (H - T - B);
  const path = series.map((v, r) => `${r ? "L" : "M"}${x(r).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const yTicks = [0, 0.5, 1].map((v) => `<text class="tick" x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${v}</text>`).join("");
  const xTicks = [0, 9, 19, 29, rounds - 1].filter((r) => r < rounds).map((r) => `<text class="tick" x="${x(r)}" y="${H - 6}" text-anchor="middle">${r + 1}</text>`).join("");
  el.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Consensus by round">` +
    `<line class="axis" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>` +
    `<line class="threshold" x1="${L}" x2="${W - R}" y1="${y(0.9)}" y2="${y(0.9)}"/>` +
    `<text class="tick" x="${W - R}" y="${y(0.9) - 4}" text-anchor="end">converged</text>` +
    `<line class="threshold chance" x1="${L}" x2="${W - R}" y1="${y(0.2)}" y2="${y(0.2)}"/>` +
    `<text class="tick" x="${W - R}" y="${y(0.2) - 4}" text-anchor="end">chance ≈ 0.2</text>` +
    yTicks + xTicks +
    `<path class="line" d="${path}"/>` +
    (marked !== null && series[marked] !== undefined ? `<circle class="dot" r="4" cx="${x(marked)}" cy="${y(series[marked])}"/>` : "") +
    `<line class="hair" y1="${T}" y2="${y(0)}" visibility="hidden"/>` +
    `<circle class="dot hover" r="4" visibility="hidden"/>` +
    `<rect x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent"/>` +
    `</svg><div class="tooltip" hidden></div>`;
  const svg = el.querySelector("svg")!;
  const tip = el.querySelector<HTMLDivElement>(".tooltip")!;
  const hair = svg.querySelector<SVGLineElement>(".hair")!;
  const dot = svg.querySelector<SVGCircleElement>(".dot.hover")!;
  const roundAt = (e: PointerEvent) => {
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    return Math.max(0, Math.min(series.length - 1, Math.round(((pt.x - L) / (W - L - R)) * (rounds - 1))));
  };
  svg.onpointermove = (e) => {
    if (!series.length) return;
    const r = roundAt(e);
    for (const a of ["x1", "x2"]) hair.setAttribute(a, String(x(r)));
    dot.setAttribute("cx", String(x(r)));
    dot.setAttribute("cy", String(y(series[r])));
    hair.setAttribute("visibility", "visible");
    dot.setAttribute("visibility", "visible");
    tip.hidden = false;
    tip.textContent = `Round ${r + 1}: ${Math.round(series[r] * 100)}% played the most common name (click to view)`;
    const box = el.getBoundingClientRect();
    tip.style.left = `${Math.min(box.width - 280, Math.max(0, e.clientX - box.left + 12))}px`;
    tip.style.top = `${e.clientY - box.top - 34}px`;
  };
  svg.onpointerleave = () => {
    tip.hidden = true;
    hair.setAttribute("visibility", "hidden");
    dot.setAttribute("visibility", "hidden");
  };
  svg.onclick = (e) => {
    if (!current || !series.length) return;
    const r = roundAt(e);
    viewRound = r >= series.length - 1 ? null : r;
    render(current);
  };
}

/** What one agent saw and did in the shown round: the whole causal chain for one decision. */
function renderAgent(log: RunLog) {
  const el = $("agent");
  if (selected === null) {
    el.innerHTML = `<p class="hint">Click any agent in the grid to see exactly what it was shown and what it answered.</p>`;
    return;
  }
  const r = shownRound(log);
  const p = log.plays.find((x) => x.round === r && x.agent === selected);
  if (!p) {
    el.innerHTML = "";
    return;
  }
  const partner = log.plays.find((x) => x.round === r && x.agent === p.partner)!;
  if (p.status === "committed") {
    el.innerHTML = `<h3>Agent ${p.agent}, round ${r + 1}</h3><p>This agent is <b>committed</b>: it always plays ${p.name} and never asks the model.</p>`;
    return;
  }
  const memory = replayMemory(log.initialMemory, log.plays.filter((x) => x.round < r))[p.agent];
  const prompt = buildPrompt(log.meta.wording, p.order, memWindow(memory, log.meta.memory));
  el.innerHTML =
    `<h3>Agent ${p.agent}, round ${r + 1}</h3>` +
    `<ol class="chain">` +
    `<li><b>It was shown this prompt</b> (names shuffled for this agent; memory limited to its last ${log.meta.memory} rounds):` +
    prompt.map((m) => `<div class="msg"><span class="role">${m.role}</span><pre>${escapeHtml(m.content)}</pre></div>`).join("") +
    `</li><li><b>The model answered</b> <code>${escapeHtml(p.raw ?? "")}</code>${p.ms ? ` in ${p.ms} ms` : ""}. Parsed as <b>${p.name}</b> (${p.status}), which was option ${p.position + 1} of ${p.order.length} in the order shown.</li>` +
    `<li><b>Its partner</b>, agent ${p.partner}, played <b>${partner.name}</b>.</li>` +
    `<li><b>Result:</b> ${p.payoff > 0 ? `a match, +${p.payoff} each` : `no match, ${p.payoff} each`}. This round is added to both agents' memories.</li></ol>`;
}

function renderRunDetail(log: RunLog) {
  const ms = log.plays.map((p) => p.ms ?? 0).filter(Boolean);
  const pc = parseCounts([log]);
  const conv = convergence(log);
  const s = strategy(log);
  const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "–");
  $("summary").innerHTML =
    `<p>${conv.round !== null ? `<b>Converged</b> on <b>${conv.name}</b> at round ${conv.round + 1}.` : "<b>Not converged</b> (needs more than 90% on one name for 5 rounds running)."} ` +
    `${log.plays.length} model calls so far, median ${median(ms)} ms each. Parsing: ${pc.ok} ok, ${pc.repaired} repaired, ${pc.failed} failed.</p>` +
    `<p><b>How are agents deciding?</b> After a match, they played the same name again ${pct(s.winStay, s.win)} of the time. ` +
    `After a mismatch, they switched to their partner's name ${pct(s.loseCopy, s.lose)} of the time, kept their own ${pct(s.loseStay, s.lose)}, and tried a third name ${pct(s.loseOther, s.lose)}. ` +
    `<span class="muted">For comparison, the rule agents in condition R (which converge in 19 rounds) copy the name their recent partners played most often.</span></p>`;
}

function render(log: RunLog) {
  current = log;
  renderGrid(log);
  renderChart(roundConsensus(log), log.meta.rounds, viewRound);
  renderAgent(log);
  renderRunDetail(log);
}

// ---------- a seed of one condition ----------

function currentName() {
  return runName(condSel.value, poolSel.value, wordingSel.value, Number(seedIn.value));
}

async function runSeed() {
  const cond = conditionById(condSel.value)!;
  const pool = poolSel.value as PoolId;
  const wording = wordingSel.value as WordingId;
  const seed = Number(seedIn.value);
  const name = currentName();
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
    const doneBefore = saved?.plays.length ?? 0;
    const total = PARAMS.rounds * PARAMS.agents;
    const log = await runGame({
      condition: cond.id, seed, rounds: PARAMS.rounds, memory: PARAMS.memory, pool, wording, agentPolicies, policies,
      resume: saved?.plays, signal: controller.signal, gpu,
      onDecision: (round, done, perRound) => {
        const calls = round * PARAMS.agents + done;
        const rate = (performance.now() - started) / Math.max(1, calls - doneBefore);
        setStatus("running", `${name}: round ${round + 1} of ${PARAMS.rounds}, agent ${done} of ${perRound}. ${fmtMinutes(rate * (total - calls))} left.`, calls / total);
      },
      onRound: async (l) => {
        render(l);
        await save(name, l);
      },
    });
    await save(name, log);
    render(log);
    const mins = ((performance.now() - started) / 60000).toFixed(1);
    if (controller.signal.aborted) setStatus("stopped", `Stopped after ${playsByRound(log).length} rounds. Run the same seed again to resume.`, log.plays.length / total);
    else setStatus("done", `${name} finished in ${mins} min${saved ? " (resumed)" : ""}. Saved to public/results/${name}.json.`, 1);
  } catch (e) {
    setStatus("error", `Error: ${(e as Error).message}`);
    throw e;
  } finally {
    busy(false);
  }
}

/** View a saved run without running anything. */
async function loadRun() {
  const saved = await loadSaved<RunLog>(currentName());
  if (!saved) return setStatus("idle", `No saved run called ${currentName()}.`);
  viewRound = null;
  render(saved);
  setStatus("done", `Loaded ${currentName()} (${playsByRound(saved).length} of ${saved.meta.rounds} rounds).`);
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
    const started = performance.now();
    for (let i = 0; i < PARAMS.baselineAgents && !controller.signal.aborted; i++) {
      // Different shuffle and seed per fresh agent; memory is empty.
      const order = poolOrder(POOLS[pool], 777, 0, i);
      const c = await llm.complete(buildPrompt(wording, order, []), { temperature: cond.temperature, maxTokens: 20, jsonSchema: answerSchema(order), seed: 1000 + i });
      const p = parseAnswer(c.text, order);
      picks.push({ name: p.name, position: p.name ? order.indexOf(p.name) : -1, order, raw: c.text, status: p.status, ms: c.ms });
      const left = ((performance.now() - started) / picks.length) * (PARAMS.baselineAgents - picks.length);
      setStatus("running", `Individual baseline, ${modelLabel(model)}: fresh agent ${picks.length} of ${PARAMS.baselineAgents}. ${fmtMinutes(left)} left.`, picks.length / PARAMS.baselineAgents);
      if (picks.length % 20 === 0) renderBaseline(picks, pool);
    }
    renderBaseline(picks, pool);
    await save(name, { meta: { model, pool, wording, temperature: cond.temperature, gpu: await describeGpu(), finishedAt: new Date().toISOString() }, picks });
    setStatus(controller.signal.aborted ? "stopped" : "done", `Baseline saved to public/results/${name}.json (${picks.length} picks).`, picks.length / PARAMS.baselineAgents);
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
  $("summary").innerHTML =
    `<h3>Individual baseline: ${picks.length} fresh agents, empty memory</h3>` +
    `<p>What does one agent pick on its own, before any interaction? If every name were equally likely, each would get about ${(picks.length / names.length).toFixed(0)}. ` +
    `The collective-bias question is whether the population's winning names follow this distribution or something else. ` +
    `The position table shows how often the name shown 1st, 2nd, … was picked. The shuffle turns position bias into noise instead of fake name preference.</p>` +
    `<div class="panels"><div class="table-wrap"><table><tr><th>Name</th><th>Picks</th></tr>${rows(names, byName)}</table></div>` +
    `<div class="table-wrap"><table><tr><th>Position shown</th><th>Picks</th></tr>${rows(names.map((_, i) => String(i + 1)), byPos)}</table></div></div>`;
}

runBtn.onclick = () => void runSeed();
baseBtn.onclick = () => void runBaseline();
loadBtn.onclick = () => void loadRun();

renderGrid(null);
renderChart([], PARAMS.rounds, null);
$("agent").innerHTML = `<p class="hint">Run or load a seed, then click any agent to see exactly what it was shown and what it answered.</p>`;
if (!hasWebGpu()) setStatus("error", "WebGPU is not available in this browser. Use a recent Chrome.");
else if (params.get("go") === "run") void runSeed();
else if (params.get("go") === "baseline") void runBaseline();
else if (params.get("go") === "view") void loadRun();
