// The cascade page: run N sequences of 10 LLM players, save after each sequence (resumable),
// and show every decision next to what a rational player would have done.
// URL params: ?model=<id>&temp=0.7&n=100&go=run (used by the headless driver).

import { describeGpu, hasWebGpu, llm } from "../lib/llm.ts";
import { MODELS, modelLabel } from "../lib/models.ts";
import { runLLMSequence, ballColour, type LLMSequence } from "../games/cascade-llm.ts";
import { firstCascade } from "../games/cascade.ts";
import { wilson } from "../lib/stats.ts";

const PLAYERS = 10;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const modelSel = $<HTMLSelectElement>("model");
const tempIn = $<HTMLInputElement>("temp");
const nIn = $<HTMLInputElement>("n");
const runBtn = $<HTMLButtonElement>("run");
const stopBtn = $<HTMLButtonElement>("stop");
const bar = $("progress");
const status = $("status");

for (const m of MODELS) modelSel.add(new Option(m.label, m.id));
const params = new URLSearchParams(location.search);
modelSel.value = params.get("model") ?? "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
tempIn.value = params.get("temp") ?? "0.7";
nIn.value = params.get("n") ?? "100";

function setStatus(phase: string, text: string, progress?: number) {
  status.dataset.phase = phase;
  status.textContent = text;
  bar.hidden = progress === undefined;
  if (progress !== undefined) {
    bar.querySelector<HTMLDivElement>(".fill")!.style.width = `${Math.round(progress * 1000) / 10}%`;
    bar.dataset.phase = phase;
  }
}

const labels = (params.get("labels") === "colours" ? "colours" : "letters") as "letters" | "colours";
const runName = () => `cascade-${modelSel.value.split("-").slice(0, 3).join("-")}-t${tempIn.value.replace(".", "")}${labels === "colours" ? "-colours" : ""}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");

async function loadSaved(name: string): Promise<{ sequences: LLMSequence[] } | null> {
  try {
    const r = await fetch(`/__save-results?name=${name}`, { cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/** Where the LLM agreed with the rational player, and where it didn't, split by situation. */
function analyse(seqs: LLMSequence[]) {
  const turns = seqs.flatMap((s) => s.turns);
  const noLead = turns.filter((t) => !t.inCascade);
  const cascadeAgainst = turns.filter((t) => t.inCascade && t.bayesGuess !== (t.ball === "a" ? "A" : "B"));
  const wrongLock = seqs.filter((s) => {
    const last = s.turns.slice(-3).map((t) => t.guess);
    return last.every((g) => g === last[0]) && last[0] !== s.urn;
  }).length;
  return {
    agree: turns.filter((t) => t.guess === t.bayesGuess).length / turns.length,
    ownWhenNoLead: noLead.filter((t) => !t.overrodeOwn).length / noLead.length,
    nNoLead: noLead.length,
    joinWhenRational: cascadeAgainst.filter((t) => t.overrodeOwn).length / Math.max(1, cascadeAgainst.length),
    nCascadeAgainst: cascadeAgainst.length,
    accuracy: turns.filter((t, i) => t.guess === seqs[Math.floor(i / PLAYERS)].urn).length / turns.length,
    lastAccuracy: seqs.filter((s) => s.turns.at(-1)!.guess === s.urn).length / seqs.length,
    wrongLock,
    rationalWrongCascade: seqs.filter((s) => firstCascade(s) === "wrong").length,
  };
}

function render(seqs: LLMSequence[]) {
  if (!seqs.length) return;
  const a = analyse(seqs);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const [lo, hi] = wilson(a.wrongLock, seqs.length);
  $("summary").innerHTML =
    `<p><b>${seqs.length} sequences, ${seqs.length * PLAYERS} guesses.</b> The model's guesses were right ${pct(a.accuracy)} of the time (one ball alone: 67%; rational players: about 76%). The 10th player was right ${pct(a.lastAccuracy)} of the time.</p>` +
    `<p><b>Does it use its own ball?</b> When the earlier guesses did not lead by 2 (no rational cascade), it guessed its own ball's urn ${pct(a.ownWhenNoLead)} of the time (n=${a.nNoLead}); a rational player would do so every time. ` +
    `<b>Does it herd?</b> When a rational player would ignore their ball and follow the crowd, the model did so ${pct(a.joinWhenRational)} of the time (n=${a.nCascadeAgainst}). ` +
    `Overall it made the rational choice ${pct(a.agree)} of the time.</p>` +
    `<p><b>Wrong lock-in:</b> the last 3 players all guessed the wrong urn in ${a.wrongLock} of ${seqs.length} sequences (${pct(a.wrongLock / seqs.length)}, 95% CI ${pct(lo)}–${pct(hi)}). Rational players seeing the same balls would have started a wrong cascade in ${a.rationalWrongCascade}.</p>`;
  const rows = seqs.slice(-30).reverse().map((s) => {
    const cells = s.turns.map((t) => {
      const c = ballColour(t.ball, s.framing);
      return `<td class="${t.overrodeOwn ? "against" : ""}${t.guess !== t.bayesGuess ? " irrational" : ""}" title="drew ${c}; guessed ${t.guess}; rational: ${t.bayesGuess}; raw ${t.raw}"><span class="ball ${c}"></span>${t.guess}<sub>${t.bayesGuess}</sub></td>`;
    }).join("");
    return `<tr><td>#${s.seed}</td><td><b>${s.urn}</b></td>${cells}</tr>`;
  }).join("");
  $("rows").innerHTML =
    `<h2>Latest sequences</h2><p class="muted">Each cell: the ball the player drew, their guess, and in small type the rational guess. Outlined = went against their own ball. Faded = not what the rational player would do. Hover for the raw model output.</p>` +
    `<table class="seq"><tr><th>Seq</th><th>True urn</th>${[...Array(PLAYERS).keys()].map((i) => `<th>P${i + 1}</th>`).join("")}</tr>${rows}</table>`;
}

let controller: AbortController | null = null;
stopBtn.onclick = () => controller?.abort();

async function run() {
  const name = runName();
  const n = Number(nIn.value);
  const temperature = Number(tempIn.value);
  controller = new AbortController();
  runBtn.disabled = true;
  stopBtn.disabled = false;
  try {
    const saved = await loadSaved(name);
    const seqs: LLMSequence[] = saved?.sequences ?? [];
    render(seqs);
    await llm.load(modelSel.value, (p) => setStatus("loading", `Loading ${modelLabel(modelSel.value)}: ${Math.round(p.progress * 100)}%`, p.progress));
    const gpu = await describeGpu();
    const started = performance.now();
    const before = seqs.length;
    while (seqs.length < n && !controller.signal.aborted) {
      seqs.push(await runLLMSequence(llm, PLAYERS, seqs.length, temperature, labels));
      await fetch(`/__save-results?name=${name}`, { method: "POST", body: JSON.stringify({ meta: { model: modelSel.value, temperature, players: PLAYERS, labels, gpu }, sequences: seqs }) }).catch(() => {});
      render(seqs);
      const per = (performance.now() - started) / (seqs.length - before);
      setStatus("running", `${name}: sequence ${seqs.length} of ${n}. About ${Math.max(1, Math.round((per * (n - seqs.length)) / 60000))} min left.`, seqs.length / n);
    }
    setStatus(controller.signal.aborted ? "stopped" : "done", `${name}: ${seqs.length} sequences saved to public/results/${name}.json.`, seqs.length / n);
  } catch (e) {
    setStatus("error", `Error: ${(e as Error).message}`);
    throw e;
  } finally {
    runBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

runBtn.onclick = () => void run();
void loadSaved(runName()).then((s) => s && render(s.sequences));
if (!hasWebGpu()) setStatus("error", "WebGPU is not available in this browser. Use a recent Chrome.");
else if (params.get("go") === "run") void run();
