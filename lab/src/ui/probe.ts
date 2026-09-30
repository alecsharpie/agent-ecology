// Probe page: runs every probe in src/games/probes.ts and tabulates the answers.
// URL params: ?model=<id>&temp=0.7&wording=game&k=10&go=run (used by the headless driver).

import { POOLS, answerSchema, buildPrompt, parseAnswer, type WordingId } from "../games/naming.ts";
import { PROBES, classify, roles, type Answer } from "../games/probes.ts";
import { describeGpu, hasWebGpu, llm } from "../lib/llm.ts";
import { MODELS, modelLabel } from "../lib/models.ts";
import { makeRng, shuffle, subSeed } from "../lib/rng.ts";
import { wilson } from "../lib/stats.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const modelSel = $<HTMLSelectElement>("model");
const tempIn = $<HTMLInputElement>("temp");
const wordingSel = $<HTMLSelectElement>("wording");
const kIn = $<HTMLInputElement>("k");
const bar = $("progress");
const status = $("status");
for (const m of MODELS) modelSel.add(new Option(m.label, m.id));
const params = new URLSearchParams(location.search);
modelSel.value = params.get("model") ?? "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
tempIn.value = params.get("temp") ?? "0.7";
wordingSel.value = params.get("wording") ?? "game";
kIn.value = params.get("k") ?? "10";

function setStatus(phase: string, text: string, progress?: number) {
  status.dataset.phase = phase;
  status.textContent = text;
  bar.hidden = progress === undefined;
  if (progress !== undefined) bar.querySelector<HTMLDivElement>(".fill")!.style.width = `${Math.round(progress * 1000) / 10}%`;
}

interface ProbeCall { probe: string; x: string; y: string; z: string; order: string[]; raw: string; name: string | null; answer: Answer }

function render(calls: ProbeCall[]) {
  const pct = (a: number, n: number) => (n ? `${Math.round((100 * a) / n)}%` : "–");
  const rows = PROBES.map((p) => {
    const cs = calls.filter((c) => c.probe === p.id);
    const n = cs.length;
    const count = (a: Answer) => cs.filter((c) => c.answer === a).length;
    const good = count(p.sensible);
    const [lo, hi] = wilson(good, n);
    return `<tr><td>${p.situation}</td><td>${n}</td><td>${pct(count("X"), n)}</td><td>${pct(count("Y"), n)}</td><td>${pct(count("Z"), n)}</td><td>${pct(count("other"), n)}</td>` +
      `<td><b>${p.sensible}</b>: ${pct(good, n)} <span class="muted">[${pct(lo, 1)}–${pct(hi, 1)}]</span></td></tr>`;
  }).join("");
  $("results").innerHTML =
    `<div class="table-wrap"><table><tr><th>Situation</th><th>n</th><th>Played X (own)</th><th>Played Y</th><th>Played Z</th><th>Something else</th><th>Coordination-minded answer</th></tr>${rows}</table></div>` +
    `<p class="muted">"Coordination-minded" is what an agent trying to match its next partner would play: stick with a name that keeps winning, switch to the name partners keep playing. Brackets are 95% Wilson intervals.</p>`;
}

async function run() {
  const model = modelSel.value, temperature = Number(tempIn.value), wording = wordingSel.value as WordingId, k = Number(kIn.value);
  const pool = POOLS.letters;
  const name = `probe-${model.split("-").slice(0, 3).join("-")}-${wording}-t${String(temperature).replace(".", "")}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  try {
    await llm.load(model, (p) => setStatus("loading", `Loading ${modelLabel(model)}: ${Math.round(p.progress * 100)}%`, p.progress));
    const calls: ProbeCall[] = [];
    const total = PROBES.length * pool.length * k;
    for (const p of PROBES)
      for (let i = 0; i < pool.length; i++)
        for (let j = 0; j < k; j++) {
          const r = roles(pool, i);
          const order = shuffle(makeRng(subSeed(i, j, 5)), pool);
          const c = await llm.complete(buildPrompt(wording, order, p.memory(r.x, r.y, r.z)), { temperature, maxTokens: 20, jsonSchema: answerSchema(order), seed: subSeed(i, j, 6) });
          const parsed = parseAnswer(c.text, order);
          calls.push({ probe: p.id, ...r, order, raw: c.text, name: parsed.name, answer: classify(parsed.name, r) });
          setStatus("running", `Probe "${p.id}": ${calls.length} of ${total} calls.`, calls.length / total);
          if (calls.length % 10 === 0) render(calls);
        }
    render(calls);
    await fetch(`/__save-results?name=${name}`, { method: "POST", body: JSON.stringify({ meta: { model, temperature, wording, k, gpu: await describeGpu() }, calls }) }).catch(() => {});
    setStatus("done", `Saved to public/results/${name}.json.`, 1);
  } catch (e) {
    setStatus("error", `Error: ${(e as Error).message}`);
    throw e;
  }
}

$("run").onclick = () => void run();
if (!hasWebGpu()) setStatus("error", "WebGPU is not available in this browser. Use a recent Chrome.");
else if (params.get("go") === "run") void run();
