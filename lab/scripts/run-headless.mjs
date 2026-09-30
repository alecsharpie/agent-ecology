// Runs naming-game seeds in headless Chromium with WebGPU (a background tab gets throttled;
// a headless page does not). Needs `npm run dev` running. Each seed saves after every
// round, so if the renderer dies (a WebGPU context crash after many calls) the driver just
// relaunches and the page resumes from the checkpoint.
//   CONDS=B SEEDS=0-4 node scripts/run-headless.mjs
//   CONDS=A,B,C,D,E SEEDS=0-4 POOL=nonsense WORDING=plain node scripts/run-headless.mjs
//   BASELINE=1 CONDS=B node scripts/run-headless.mjs         (individual-bias baseline)
//   PROBE=Qwen2.5-1.5B-Instruct-q4f16_1-MLC WORDINGS=game,tally node scripts/run-headless.mjs   (probe page)
//   CASCADE=Qwen2.5-1.5B-Instruct-q4f16_1-MLC TEMP=0.7 N=100 node scripts/run-headless.mjs   (cascade page)
//   CHROME=/path/to/chrome PROFILE=/tmp/profile ...           (optional)
import { chromium } from "playwright-core";

const base = process.env.URL ?? "http://localhost:5190/";
const conds = (process.env.CONDS ?? "B").split(",");
const [lo, hi] = (process.env.SEEDS ?? "0").split("-").map(Number);
const seeds = Array.from({ length: (hi ?? lo) - lo + 1 }, (_, i) => lo + i);
const pool = process.env.POOL ?? "letters";
const wording = process.env.WORDING ?? "game";
const MAX_ATTEMPTS = Number(process.env.ATTEMPTS ?? 6);

async function once(query, path = "") {
  const ctx = await chromium.launchPersistentContext(process.env.PROFILE ?? ".chrome-profile", {
    executablePath: process.env.CHROME,
    channel: process.env.CHROME ? undefined : "chrome",
    headless: true,
    args: ["--enable-unsafe-webgpu", "--enable-gpu"],
  });
  try {
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("pageerror:", e.message));
    await page.goto(`${base}${path}?${query}`);
    let last = "";
    for (;;) {
      await page.waitForTimeout(5000);
      const s = page.locator("#status");
      const [text, phase] = [await s.textContent(), await s.getAttribute("data-phase")];
      // Log once per round (or per 10% of model loading), not every poll.
      const key = `${phase} ${(text ?? "").replace(/, agent \d+ of \d+.*$/, "").replace(/(\d)\d%.*$/, "$1").replace(/sequence (\d*)\d of.*$/, "$1")}`;
      if (key !== last) console.log(new Date().toISOString().slice(11, 19), `[${phase}]`, text, ((last = key), ""));
      if (phase === "done") return true;
      if (phase === "error" || phase === "stopped") throw new Error(text ?? phase);
    }
  } finally {
    await ctx.close();
  }
}

async function withRetries(query, path) {
  for (let a = 1; a <= MAX_ATTEMPTS; a++) {
    try {
      if (await once(query, path)) return;
    } catch (e) {
      console.log(`attempt ${a} failed: ${e.message}`);
    }
  }
  throw new Error(`gave up on ${query}`);
}

if (process.env.PROBE) {
  for (const model of process.env.PROBE.split(","))
    for (const wording of (process.env.WORDINGS ?? "game").split(","))
      await withRetries(new URLSearchParams({ model, wording, temp: process.env.TEMP ?? "0.7", k: process.env.K ?? "10", go: "run" }), "probe.html");
  console.log("all done");
  process.exit(0);
}

if (process.env.CASCADE) {
  for (const model of process.env.CASCADE.split(","))
    await withRetries(new URLSearchParams({ model, temp: process.env.TEMP ?? "0.7", n: process.env.N ?? "100", go: "run" }), "cascade.html");
  console.log("all done");
  process.exit(0);
}

for (const cond of conds) {
  if (process.env.BASELINE) {
    await withRetries(new URLSearchParams({ cond, pool, wording, go: "baseline" }));
    continue;
  }
  for (const seed of seeds) await withRetries(new URLSearchParams({ cond, pool, wording, seed: String(seed), go: "run" }));
}
console.log("all done");
