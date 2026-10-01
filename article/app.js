(() => {
"use strict";
const D = JSON.parse(document.getElementById("article-data").textContent);
const $ = (id) => document.getElementById(id);
const NAMES = ["F", "J", "K", "M", "Q", "R", "T", "W", "X", "Z"];
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------- randomness ----------
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randInt = (r, n) => Math.floor(r() * n);
const pick = (r, xs) => xs[randInt(r, xs.length)];
function shuffle(r, xs) {
  const o = [...xs];
  for (let i = o.length - 1; i > 0; i--) { const j = randInt(r, i + 1); [o[i], o[j]] = [o[j], o[i]]; }
  return o;
}
function weighted(r, names, prior) {
  const w = names.map((n) => (prior && prior[n] != null ? prior[n] : 1));
  let x = r() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < names.length; i++) if ((x -= w[i]) < 0) return names[i];
  return names[names.length - 1];
}
let seedCounter = (Date.now() % 100000) | 0;
const freshSeed = () => ++seedCounter * 2654435761;

// ---------- the naming game ----------
// Agents remember their own interactions; a decide function maps memory to a name.
function majorityDecider(memoryLen, prior) {
  return (mem, r) => {
    const w = mem.slice(-memoryLen);
    if (!w.length) return weighted(r, NAMES, prior);
    const t = new Map();
    for (const m of w) t.set(m.theirs, (t.get(m.theirs) || 0) + 1);
    const top = Math.max(...t.values());
    return pick(r, [...t].filter(([, c]) => c === top).map(([n]) => n));
  };
}
function habitDecider(h) {
  return (mem, r) => {
    const last = mem[mem.length - 1];
    const fresh = (ex) => weighted(r, NAMES.filter((n) => n !== ex), h.prior);
    if (!last) return fresh();
    const x = r();
    if (last.payoff > 0) return x < h.winStay ? last.mine : fresh(last.mine);
    if (x < h.copy) return last.theirs;
    if (x < h.copy + h.keep) return last.mine;
    return fresh(last.mine);
  };
}
class Population {
  constructor({ n = 24, decide, seed, committed = null, memories = null }) {
    this.n = n; this.decide = decide; this.r = makeRng(seed);
    this.committed = committed || Array(n).fill(null);
    this.mem = memories ? memories.map((m) => [...m]) : Array.from({ length: n }, () => []);
    this.history = [];
  }
  step() {
    const order = shuffle(this.r, [...Array(this.n).keys()]);
    const partner = Array(this.n);
    for (let i = 0; i < this.n; i += 2) { partner[order[i]] = order[i + 1]; partner[order[i + 1]] = order[i]; }
    const plays = [...Array(this.n).keys()].map((a) => this.committed[a] || this.decide(this.mem[a], this.r));
    const round = plays.map((name, a) => ({ name, partner: partner[a], match: name === plays[partner[a]] }));
    round.forEach((p, a) => { this.mem[a].push({ mine: p.name, theirs: plays[p.partner], payoff: p.match ? 100 : -50 }); if (this.mem[a].length > 12) this.mem[a].shift(); });
    this.history.push(round);
    return round;
  }
}
function tally(names) {
  const t = new Map();
  for (const n of names) t.set(n, (t.get(n) || 0) + 1);
  return [...t].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
const consensusOf = (names) => (names.length ? tally(names)[0][1] / names.length : 0);

// ---------- agent grids ----------
function makeGrid(el, n = 24, clickable = false) {
  el.innerHTML = "";
  const tiles = [];
  for (let i = 0; i < n; i++) {
    const t = document.createElement(clickable ? "button" : "div");
    t.className = "tile";
    if (clickable) t.type = "button";
    el.append(t);
    tiles.push(t);
  }
  return tiles;
}
/** colourOf(name) -> 1|2|3|0. Colour follows the name, not its rank. */
function paintGrid(tiles, round, colourOf, opts = {}) {
  tiles.forEach((t, i) => {
    const p = round ? round[i] : null;
    const c = p ? colourOf(p.name) : 0;
    t.className = `tile${c ? ` c${c}` : ""}${opts.committed && opts.committed[i] ? " committed" : ""}${opts.selected === i ? " sel" : ""}`;
    t.innerHTML = p ? `${esc(p.name)}${p.match ? '<span class="pay" aria-hidden="true">✓</span>' : ""}` : "·";
    t.setAttribute("aria-label", p ? `Agent ${i}: played ${p.name}${p.match ? ", matched" : ""}` : `Agent ${i}`);
  });
}
/** Assign the first three distinct names seen to colours 1–3, and keep them. */
function stickyColours() {
  const map = new Map();
  return {
    of: (n) => map.get(n) || 0,
    update(names) { for (const [n] of tally(names)) if (!map.has(n) && map.size < 3) map.set(n, map.size + 1); },
    reset() { map.clear(); },
    set(ns) { map.clear(); ns.forEach((n, i) => map.set(n, i + 1)); },
  };
}

// ---------- charts ----------
const SVGNS = "http://www.w3.org/2000/svg";
function lineChart(el, o) {
  const W = o.width || 640, H = o.height || 300;
  const L = o.left ?? 46, R = o.right ?? (o.endLabels ? 132 : 14), T = o.top ?? 14, B = o.bottom ?? 44;
  const [x0, x1] = o.x, [y0, y1] = o.y;
  const x = (v) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - y0) / (y1 - y0 || 1)) * (H - T - B);
  const yFmt = o.yFmt || ((v) => pct(v));
  const xFmt = o.xFmt || String;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || "")}">`;
  for (const t of o.yTicks || [y0, (y0 + y1) / 2, y1]) {
    s += `<line class="gridline" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${yFmt(t)}</text>`;
  }
  for (const t of o.xTicks || []) s += `<text class="tick" x="${x(t)}" y="${H - B + 18}" text-anchor="middle">${xFmt(t)}</text>`;
  if (o.xLabel) s += `<text class="axis-label" x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle">${esc(o.xLabel)}</text>`;
  if (o.yLabel) s += `<text class="axis-label" transform="translate(12 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">${esc(o.yLabel)}</text>`;
  for (const ref of o.refs || []) {
    s += `<line class="ref" x1="${L}" x2="${W - R}" y1="${y(ref.y)}" y2="${y(ref.y)}"/>`;
    if (ref.label) s += `<text class="ref-label" x="${ref.right ? W - R - 4 : L + 6}" y="${y(ref.y) - 6}" text-anchor="${ref.right ? "end" : "start"}">${esc(ref.label)}</text>`;
  }
  const ends = [];
  for (const se of o.series) {
    const pts = se.points.filter((p) => p[1] != null);
    if (!pts.length) continue;
    const path = se.step
      ? pts.map((p, i) => (i ? `H${x((p[0] + pts[i - 1][0]) / 2).toFixed(1)}V${y(p[1]).toFixed(1)}H${x(p[0]).toFixed(1)}` : `M${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`)).join("")
      : pts.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
    s += `<path d="${path}" fill="none" style="stroke:var(${se.color})" stroke-width="${se.width || 2}" stroke-linejoin="round" stroke-linecap="round"${se.dash ? ' stroke-dasharray="5 4"' : ""}/>`;
    if (se.dots) for (const p of pts) s += `<circle cx="${x(p[0])}" cy="${y(p[1])}" r="4.5" style="fill:var(${se.color});stroke:var(--card)" stroke-width="2"/>`;
    if (se.marker != null && pts[se.marker]) s += `<circle cx="${x(pts[se.marker][0])}" cy="${y(pts[se.marker][1])}" r="5" style="fill:var(${se.color});stroke:var(--card)" stroke-width="2"/>`;
    if (o.endLabels) ends.push({ se, yy: y(pts[pts.length - 1][1]) });
  }
  ends.sort((a, b) => a.yy - b.yy);
  for (let i = 1; i < ends.length; i++) if (ends[i].yy - ends[i - 1].yy < 15) ends[i].yy = ends[i - 1].yy + 15;
  for (const e of ends) s += `<line x1="${W - R + 6}" x2="${W - R + 18}" y1="${e.yy}" y2="${e.yy}" style="stroke:var(${e.se.color})" stroke-width="2"/><text class="label" x="${W - R + 22}" y="${e.yy + 4}">${esc(e.se.label)}</text>`;
  s += `<line class="ref hair" y1="${T}" y2="${H - B}" visibility="hidden"/><rect class="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/></svg><div class="tip" hidden></div>`;
  el.innerHTML = s;
  const svg = el.querySelector("svg"), tip = el.querySelector(".tip"), hair = svg.querySelector(".hair");
  const xsAll = [...new Set(o.series.flatMap((se) => se.points.map((p) => p[0])))].sort((a, b) => a - b);
  const toX = (e) => {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const v = pt.matrixTransform(svg.getScreenCTM().inverse());
    const xv = x0 + ((v.x - L) / (W - L - R)) * (x1 - x0);
    return xsAll.reduce((b, c) => (Math.abs(c - xv) < Math.abs(b - xv) ? c : b), xsAll[0]);
  };
  if (!xsAll.length) return;
  svg.addEventListener("pointermove", (e) => {
    const xv = toX(e);
    hair.setAttribute("x1", x(xv)); hair.setAttribute("x2", x(xv)); hair.setAttribute("visibility", "visible");
    const rows = o.series.map((se) => { const p = se.points.find((q) => q[0] === xv); return p && p[1] != null ? `<div><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:var(${se.color});margin-right:6px"></span>${esc(se.label)}: <b>${yFmt(p[1], 1)}</b></div>` : ""; }).join("");
    tip.innerHTML = `<div style="color:var(--ink-2)">${esc(o.tipX ? o.tipX(xv) : `${o.xLabel || "x"} ${xFmt(xv)}`)}</div>${rows}`;
    tip.hidden = false;
    const box = el.getBoundingClientRect();
    tip.style.left = `${Math.min(box.width - tip.offsetWidth - 4, Math.max(0, e.clientX - box.left + 14))}px`;
    tip.style.top = `${Math.max(0, e.clientY - box.top - tip.offsetHeight - 10)}px`;
  });
  svg.addEventListener("pointerleave", () => { tip.hidden = true; hair.setAttribute("visibility", "hidden"); });
  if (o.onClick) svg.addEventListener("click", (e) => o.onClick(toX(e)));
}
function legend(el, items) {
  el.innerHTML = items.map((it) => `<span><i class="${it.dot ? "dot" : ""}" style="background:var(${it.color})"></i>${esc(it.label)}</span>`).join("");
}

// ---------- 0. hero ----------
(function hero() {
  const tiles = makeGrid($("hero-grid"));
  const qwen = D.habitPoints.find((p) => p.id === "B");
  const prior = Object.fromEntries(NAMES.map((n, i) => [n, D.baselines["Qwen 1.5B"].counts[i] + 0.5]));
  const gemma = D.habitPoints.find((p) => p.id === "G");
  const modes = {
    rule: () => majorityDecider(5),
    qwen: () => habitDecider({ winStay: qwen.winStay, copy: qwen.copy, keep: qwen.keep, prior }),
    gemma: () => habitDecider({ winStay: gemma.winStay, copy: gemma.copy, keep: gemma.keep }),
  };
  let mode = "rule", pop, colours = stickyColours(), timer = null, series = [];
  const ROUNDS = 60;
  function restart() {
    pop = new Population({ decide: modes[mode](), seed: freshSeed() });
    colours.reset(); series = [];
    paintGrid(tiles, null, () => 0);
    draw();
  }
  function draw() {
    lineChart($("hero-chart"), { x: [1, ROUNDS], y: [0, 1], xTicks: [1, 20, 40, 60], yTicks: [0, 0.5, 1], height: 250, xLabel: "round", aria: "Consensus by round",
      refs: [{ y: 0.9, label: "converged", right: true }, { y: 0.2, label: "chance", right: true }],
      series: [{ label: { rule: "agents that copy", qwen: "Qwen 1.5B habits", gemma: "Gemma 4 26B habits" }[mode], color: "--s1", points: series, marker: series.length - 1 }], tipX: (r) => `round ${r}` });
  }
  function tick() {
    if (pop.history.length >= ROUNDS) { clearInterval(timer); timer = setTimeout(() => { restart(); timer = setInterval(tick, 160); }, 2200); return; }
    const round = pop.step();
    const names = round.map((p) => p.name);
    colours.update(names);
    paintGrid(tiles, round, colours.of);
    series.push([pop.history.length, consensusOf(names)]);
    const top = tally(names)[0];
    $("hero-stat").innerHTML = `Round <b>${pop.history.length}</b> · most played: <b>${top[0]}</b> by ${top[1]} of 24 agents`;
    draw();
  }
  function start() { clearInterval(timer); clearTimeout(timer); restart(); if (reduceMotion) { for (let i = 0; i < ROUNDS; i++) tick(); } else timer = setInterval(tick, 160); }
  $("hero-chips").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    mode = b.dataset.k;
    for (const c of $("hero-chips").querySelectorAll("button")) c.setAttribute("aria-pressed", String(c === b));
    start();
  });
  start();
})();

// ---------- 2. rule curve ----------
lineChart($("chart-rule"), {
  x: [1, 40], y: [0, 1], xTicks: [1, 10, 20, 30, 40], yTicks: [0, 0.25, 0.5, 0.75, 1], height: 260, xLabel: "round", aria: "Rule agents consensus",
  refs: [{ y: 0.9, label: "converged", right: true }, { y: 0.2, label: "chance with 10 names", right: true }],
  series: [{ label: "rule agents, mean of 200", color: "--s1", points: D.condCurves.R.curve.map((v, i) => [i + 1, v]) }], tipX: (r) => `round ${r}`,
});

// ---------- 3. playground ----------
(function playground() {
  const tiles = makeGrid($("pg-grid"));
  const ws = $("pg-ws"), cp = $("pg-copy"), ex = $("pg-explore");
  const hp = Object.fromEntries(D.habitPoints.map((p) => [p.id, p]));
  const presets = [
    { k: "recipe", label: "A working recipe", ws: 1, copy: 0.4, explore: 0 },
    { k: "B", label: "Qwen 1.5B (measured)", ws: hp.B.winStay, copy: hp.B.copy, explore: hp.B.explore },
    { k: "A", label: "Qwen 1.5B greedy", ws: hp.A.winStay, copy: hp.A.copy, explore: hp.A.explore },
    { k: "C", label: "Qwen 0.5B", ws: hp.C.winStay, copy: hp.C.copy, explore: hp.C.explore },
    { k: "D", label: "Llama 1B", ws: hp.D.winStay, copy: hp.D.copy, explore: hp.D.explore },
    { k: "plain", label: "Qwen 1.5B, other wording", ws: hp.plain.winStay, copy: hp.plain.copy, explore: hp.plain.explore },
    { k: "G", label: "Gemma 4 26B", ws: hp.G.winStay, copy: hp.G.copy, explore: hp.G.explore },
  ];
  $("pg-presets").innerHTML = presets.map((p, i) => `<button type="button" data-i="${i}" aria-pressed="${i === 0}">${esc(p.label)}</button>`).join("");
  let pop, timer, series = [], colours = stickyColours();
  const ROUNDS = 120;
  function show() {
    $("pg-ws-v").textContent = pct(+ws.value); $("pg-copy-v").textContent = pct(+cp.value); $("pg-explore-v").textContent = pct(+ex.value);
  }
  function draw() {
    lineChart($("pg-chart"), { x: [1, ROUNDS], y: [0, 1], xTicks: [1, 30, 60, 90, 120], yTicks: [0, 0.5, 1], height: 270, xLabel: "round", aria: "Consensus",
      refs: [{ y: 0.9, label: "converged", right: true }], series: [{ label: "most common name", color: "--s1", points: series, marker: series.length - 1 }], tipX: (r) => `round ${r}` });
  }
  function restart() {
    clearInterval(timer);
    const h = { winStay: +ws.value, copy: +cp.value, keep: Math.max(0, 1 - +cp.value - +ex.value) };
    pop = new Population({ decide: habitDecider(h), seed: freshSeed() });
    series = []; colours.reset(); paintGrid(tiles, null, () => 0); draw();
    const tick = () => {
      if (pop.history.length >= ROUNDS) { clearInterval(timer); return; }
      const names = pop.step().map((p) => p.name);
      colours.update(names);
      paintGrid(tiles, pop.history[pop.history.length - 1], colours.of);
      series.push([pop.history.length, consensusOf(names)]);
      const last10 = series.slice(-10).reduce((a, p) => a + p[1], 0) / Math.min(10, series.length);
      $("pg-stat").innerHTML = `Round <b>${pop.history.length}</b> · agreement over the last 10 rounds: <b>${pct(last10)}</b> · keep own name after a loss: ${pct(h.keep)}`;
      draw();
    };
    if (reduceMotion) { for (let i = 0; i < ROUNDS; i++) tick(); } else timer = setInterval(tick, 70);
  }
  function setPreset(i) {
    const p = presets[i];
    ws.value = p.ws; cp.value = p.copy; ex.value = p.explore;
    for (const b of $("pg-presets").querySelectorAll("button")) b.setAttribute("aria-pressed", String(+b.dataset.i === i));
    show(); restart();
  }
  const clearPreset = () => { for (const b of $("pg-presets").querySelectorAll("button")) b.setAttribute("aria-pressed", "false"); };
  ws.addEventListener("input", () => { clearPreset(); show(); });
  cp.addEventListener("input", () => { if (+cp.value + +ex.value > 1) ex.value = (1 - +cp.value).toFixed(2); clearPreset(); show(); });
  ex.addEventListener("input", () => { if (+cp.value + +ex.value > 1) cp.value = (1 - +ex.value).toFixed(2); clearPreset(); show(); });
  for (const s of [ws, cp, ex]) s.addEventListener("change", restart);
  $("pg-restart").addEventListener("click", restart);
  $("pg-presets").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setPreset(+b.dataset.i); });
  setPreset(0);
})();

// ---------- 4. replay of real runs ----------
(function replay() {
  const sel = $("rp-select"), scrub = $("rp-scrub");
  D.replays.forEach((r, i) => sel.add(new Option(r.label, String(i))));
  const tiles = makeGrid($("rp-grid"), 24, true);
  const colours = stickyColours();
  let run, round = 39, agent = 5, timer = null;
  function promptFor(r, a) {
    const k = run.rounds;
    const order = k[r].o[a].split("").join(", ");
    const mem = [];
    for (let q = Math.max(0, r - run.memory); q < r; q++) {
      const mine = k[q].n[a], theirs = k[q].n[k[q].p[a]];
      mem.push({ mine, theirs, payoff: mine === theirs ? 100 : -50 });
    }
    const hist = mem.length ? mem.map((m, i) => `Round ${i + 1}: you picked ${m.mine}, your partner picked ${m.theirs}, you got ${m.payoff > 0 ? "+" : ""}${m.payoff} points.`).join("\n") : "No rounds played yet.";
    if (run.wording === "plain") {
      return [["System", `Each turn you are matched with someone and you both choose a label without seeing each other's choice. Available labels: ${order}.\nChoosing the same label as the other person earns 100. Choosing a different label loses 50.`],
        ["User", `What happened in your last few turns:\n${hist}\n\nReply with JSON {"name": "..."} containing the label you choose now.`]];
    }
    let t = "";
    if (run.wording === "tally" && mem.length) {
      const m = new Map(); for (const h of mem) m.set(h.theirs, (m.get(h.theirs) || 0) + 1);
      t = `\nSummary: in these rounds your partners picked ${[...m].sort((x, y) => y[1] - x[1]).map(([n, c]) => `${n} ${c} time${c > 1 ? "s" : ""}`).join(", ")}.`;
    }
    return [["System", `You are playing a repeated game with a series of partners. In each round you and your partner simultaneously pick one name from this list: [${order}].\nIf you both pick the SAME name, you each get +100 points. If you pick DIFFERENT names, you each get -50 points.\nYour goal is to maximise your own total points. You cannot talk to your partner.`],
      ["User", `Your recent rounds:\n${hist}${t}\n\nWhich name do you pick this round? Answer with JSON: {"name": "<one name from the list>"}.`]];
  }
  function render() {
    const k = run.rounds[round];
    const rd = k.n.map((name, a) => ({ name, partner: k.p[a], match: name === k.n[k.p[a]] }));
    paintGrid(tiles, rd, colours.of, { selected: agent });
    scrub.value = round; $("rp-round").textContent = `${round + 1} of ${run.rounds.length}`;
    const top = tally(k.n).slice(0, 3).map(([n, c]) => `<b>${n}</b> ×${c}`).join(", ");
    $("rp-stat").innerHTML = `Round ${round + 1}: ${top}. Agreement this round: <b>${pct(run.consensus[round])}</b>.<br>Habits over the run: repeat after a win <b>${pct(run.habits.winStay)}</b>, copy after a loss <b>${pct(run.habits.copy)}</b>, keep own <b>${pct(run.habits.keep)}</b>, explore <b>${pct(run.habits.explore)}</b>.`;
    lineChart($("rp-chart"), { x: [1, run.rounds.length], y: [0, 1], xTicks: [1, 10, 20, 30, 40], yTicks: [0, 0.5, 1], height: 200, xLabel: "round (click to jump)", aria: "Consensus of this run",
      refs: [{ y: 0.9, label: "converged", right: true }], series: [{ label: "agreement", color: "--s1", points: run.consensus.map((v, i) => [i + 1, v]), marker: round }], tipX: (r) => `round ${r}`,
      onClick: (r) => { stop(); round = r - 1; render(); } });
    const p = promptFor(round, agent);
    const partner = k.p[agent];
    $("rp-prompt").innerHTML = `<div class="prompt">${p.map(([role, text]) => `<div class="role">${role} · agent ${agent}, round ${round + 1}</div><pre>${esc(text)}</pre>`).join("")}<div class="answer">The model answered <b>${esc(k.n[agent])}</b>. Its partner, agent ${partner}, played <b>${esc(k.n[partner])}</b>: ${k.n[agent] === k.n[partner] ? "a match, +100 each." : "no match, −50 each."}</div></div>`;
  }
  function load(i) {
    run = D.replays[i];
    const last = run.rounds.slice(-10).flatMap((r) => r.n);
    colours.set(tally(last).slice(0, 3).map(([n]) => n));
    legend($("rp-legend"), [...tally(last).slice(0, 3).map(([n], j) => ({ label: `${n} (${pct(tally(last)[j][1] / last.length)} of plays, last 10 rounds)`, color: `--s${j + 1}`, dot: true })), { label: "any other name", color: "--paper-2", dot: true }]);
    scrub.max = run.rounds.length - 1;
    round = Math.min(round, run.rounds.length - 1);
    render();
  }
  const stop = () => { clearInterval(timer); timer = null; $("rp-play").textContent = "Play"; };
  $("rp-play").addEventListener("click", () => {
    if (timer) return stop();
    if (round >= run.rounds.length - 1) round = 0;
    $("rp-play").textContent = "Pause";
    timer = setInterval(() => { if (round >= run.rounds.length - 1) return stop(); round++; render(); }, 280);
  });
  scrub.addEventListener("input", () => { stop(); round = +scrub.value; render(); });
  sel.addEventListener("change", () => { stop(); load(+sel.value); });
  tiles.forEach((t, i) => t.addEventListener("click", () => { agent = i; render(); }));
  load(0);
})();

// ---------- 4b. all conditions ----------
(function conditions() {
  const c = D.condCurves;
  const list = [
    ["R", "Rule agents", "--ink-3"], ["tally", "Qwen 1.5B + tally line", "--s3"], ["B", "Qwen 1.5B", "--s1"], ["A", "Qwen 1.5B greedy", "--s7"],
    ["C", "Qwen 0.5B", "--s5"], ["E", "Half Qwen, half Llama", "--s4"], ["D", "Llama 1B", "--s2"],
  ].filter(([k]) => c[k]);
  const series = list.map(([k, label, color]) => ({ label: `${label} (${c[k].seeds})`, color, points: c[k].curve.slice(0, 40).map((v, i) => [i + 1, v]) }));
  legend($("cond-legend"), series.map((s) => ({ label: s.label, color: s.color })));
  lineChart($("chart-conditions"), { x: [1, 40], y: [0, 1], xTicks: [1, 10, 20, 30, 40], yTicks: [0, 0.25, 0.5, 0.75, 1], height: 340, width: 760, endLabels: true, right: 190, xLabel: "round", aria: "Consensus by condition",
    refs: [{ y: 0.9, label: "converged (pre-registered bar)" }], series, tipX: (r) => `round ${r} (number of seeds in brackets)` });
})();

// ---------- 5. probes and the habit map ----------
(function probes() {
  const rows = [
    ["win-streak", "Won 5 times in a row, always on X"],
    ["lose-to-Y", "Lost 5 times on X; every partner played Y"],
    ["wins-then-loss", "Won 4 times on X, then lost to a partner playing Y"],
    ["lose-mixed", "Lost 5 times on X; partners played Y, Y, Z, Y, Z"],
  ];
  $("probe-rows").innerHTML = rows.map(([id, text]) => {
    const p = D.probes.game[id];
    return `<tr><td>${text}</td><td class="num"><b>${pct(p.X)}</b></td><td class="num">${pct(p.Y)}</td><td class="num">${pct(p.Z + p.other)}</td></tr>`;
  }).join("");
})();
(function habitMap() {
  const ws = [...new Set(D.habitMap.map((c) => c.winStay))].sort((a, b) => a - b);
  const cp = [...new Set(D.habitMap.map((c) => c.copy))].sort((a, b) => a - b);
  const W = 760, H = 420, L = 70, R = 24, T = 16, B = 56;
  const cw = (W - L - R) / cp.length, ch = (H - T - B) / ws.length;
  // Continuous position along a categorical axis: interpolate between band centres.
  const interp = (vals, v, size, origin, flip) => {
    let i = vals.findIndex((x) => x >= v);
    if (i === -1) i = vals.length - 1; else if (i === 0) i = 1;
    // Values just outside the swept range sit at most half a band beyond the edge.
    const a = vals[i - 1], b = vals[i], f = Math.max(-0.5, Math.min(1.5, (v - a) / (b - a)));
    const pos = (i - 1 + f) + 0.5;
    return flip ? origin + (vals.length - pos) * size : origin + pos * size;
  };
  const level = (v) => Math.min(5, Math.floor(Math.max(0, v - 0.15) / 0.13));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Map of habits">`;
  for (const c of D.habitMap) {
    const xi = cp.indexOf(c.copy), yi = ws.indexOf(c.winStay);
    s += `<rect class="cell" data-ws="${c.winStay}" data-cp="${c.copy}" data-v="${c.consensus}" x="${L + xi * cw + 1}" y="${T + (ws.length - 1 - yi) * ch + 1}" width="${cw - 2}" height="${ch - 2}" rx="3" style="fill:var(--heat-${level(c.consensus)})"/>`;
  }
  cp.forEach((v, i) => { s += `<text class="tick" x="${L + (i + 0.5) * cw}" y="${H - B + 18}" text-anchor="middle">${Math.round(v * 100)}%</text>`; });
  ws.forEach((v, i) => { s += `<text class="tick" x="${L - 8}" y="${T + (ws.length - 1 - i + 0.5) * ch + 4}" text-anchor="end">${Math.round(v * 100)}%</text>`; });
  s += `<text class="axis-label" x="${(L + W - R) / 2}" y="${H - 8}" text-anchor="middle">copy the partner after a loss →</text>`;
  s += `<text class="axis-label" transform="translate(16 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">repeat after a win →</text>`;
  const offsets = { nonsense: [12, -11], A: [12, 9], B: [12, 17], tally: [10, -9], plain: [10, 4], C: [10, 4], D: [10, 16], E: [10, 4], F: [-9, -9, "end"], Fp: [10, 14], G: [10, 14] };
  for (const p of D.habitPoints) {
    const px = interp(cp, p.copy, cw, L, false), py = interp(ws, p.winStay, ch, T, true);
    const [dx, dy, anchor] = offsets[p.id] || [10, 4];
    s += `<circle cx="${px}" cy="${py}" r="5.5" style="fill:var(--ink);stroke:var(--card)" stroke-width="2"><title>${esc(p.label)}: repeat after a win ${pct(p.winStay)}, copy ${pct(p.copy)}, explore ${pct(p.explore)}</title></circle>`;
    s += `<text class="label" x="${px + dx}" y="${py + dy}" text-anchor="${anchor || "start"}" style="paint-order:stroke;stroke:var(--paper);stroke-width:3px">${esc(p.label)}</text>`;
  }
  s += `</svg><div class="tip" hidden></div>`;
  const el = $("chart-habitmap");
  el.innerHTML = `<div class="legend"><span>Agreement reached:</span>${[0, 1, 2, 3, 4, 5].map((l) => `<span><i class="dot" style="background:var(--heat-${l});width:14px;height:10px;border-radius:2px"></i>${l === 0 ? "≤ 28%" : l === 5 ? "≥ 80%" : `${Math.round((0.15 + l * 0.13) * 100)}%+`}</span>`).join("")}<span><i class="dot" style="background:var(--ink)"></i>language-model populations</span></div>` + s;
  const tip = el.querySelector(".tip");
  el.querySelectorAll("rect.cell").forEach((r) => {
    r.addEventListener("pointermove", (e) => {
      tip.innerHTML = `Repeat after a win <b>${pct(+r.dataset.ws)}</b>, copy <b>${pct(+r.dataset.cp)}</b><br>agreement reached: <b>${pct(+r.dataset.v)}</b>`;
      tip.hidden = false;
      const box = el.getBoundingClientRect();
      tip.style.left = `${Math.min(box.width - tip.offsetWidth - 4, e.clientX - box.left + 14)}px`;
      tip.style.top = `${e.clientY - box.top - tip.offsetHeight - 10}px`;
    });
    r.addEventListener("pointerleave", () => (tip.hidden = true));
  });
})();

// ---------- 6. size ladder ----------
(function ladder() {
  const models = ["Qwen 1.5B", "Qwen 3B", "Qwen 7B", "Gemma 4 26B", "Gemma 4 31B"];
  const rows = [
    ["win-streak", "Won 5 times on X → plays X", "X"],
    ["lose-to-Y", "Lost 5 times on X; every partner played Y → plays Y", "Y"],
    ["wins-then-loss", "Won 4 on X, then lost to Y → keeps X", "X"],
    ["lose-mixed", "Lost 5 on X; partners Y, Y, Z, Y, Z → plays Y", "Y"],
  ];
  $("ladder-rows").innerHTML = rows.map(([id, text, good]) => `<tr><td>${text}</td>${models.map((m) => { const v = D.ladder[m][id][good]; return `<td class="num">${v >= 0.5 ? `<b>${pct(v)}</b>` : pct(v)}</td>`; }).join("")}</tr>`).join("");
  const c = D.condCurves;
  const gem = D.replays.find((r) => r.id === "naming-gemma-4-26b-a4b-it-letters-game-s0");
  const series = [
    { label: "Rule agents (200)", color: "--ink-3", points: c.R.curve.slice(0, 40).map((v, i) => [i + 1, v]) },
    { label: `Gemma 4 26B (${c.G.seeds}, mean)`, color: "--s3", points: c.G.curve.map((v, i) => [i + 1, v]) },
    { label: "Qwen 7B, partner-only", color: "--s7", points: c.Fp.curve.map((v, i) => [i + 1, v]) },
    { label: "Qwen 7B", color: "--s2", points: c.F.curve.map((v, i) => [i + 1, v]) },
    { label: `Qwen 1.5B (${c.B.seeds}, mean)`, color: "--s1", points: c.B.curve.map((v, i) => [i + 1, v]) },
  ];
  legend($("ladder-legend"), series.map((s) => ({ label: s.label, color: s.color })));
  lineChart($("chart-ladder"), { x: [1, 40], y: [0, 1], xTicks: [1, 10, 20, 30, 40], yTicks: [0, 0.25, 0.5, 0.75, 1], height: 320, width: 760, endLabels: true, right: 180, xLabel: "round", aria: "Consensus for bigger models",
    refs: [{ y: 0.9, label: "converged" }], series, tipX: (r) => `round ${r}` });
  void gem;
})();

// ---------- 7. individual baselines ----------
(function baselines() {
  const el = $("chart-baselines");
  const leaders = { "Qwen 1.5B": ["Q", "T"], "Qwen 0.5B": ["W", "J"], "Llama 1B": [] };
  const W = 320, H = 210, L = 34, R = 8, T = 26, B = 30;
  const max = 70;
  el.innerHTML = `<div class="two">${Object.entries(D.baselines).map(([model, b]) => {
    const bw = (W - L - R) / NAMES.length;
    const y = (v) => T + (1 - v / max) * (H - T - B);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${model} name preferences"><text class="label" x="${L}" y="14" style="font-weight:600">${model}</text>`;
    for (const t of [0, 20, 40, 60]) s += `<line class="gridline" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`;
    s += `<line class="ref" x1="${L}" x2="${W - R}" y1="${y(20)}" y2="${y(20)}" stroke-dasharray="3 3"/>`;
    NAMES.forEach((n, i) => {
      const v = b.counts[i], lead = leaders[model].includes(n);
      const x0 = L + i * bw + bw * 0.2, w = bw * 0.6, top = y(v), base = y(0);
      const r = Math.min(4, (base - top) / 2);
      s += `<path d="M${x0},${base}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + w - r}Q${x0 + w},${top} ${x0 + w},${top + r}V${base}Z" style="fill:var(${lead ? "--s1" : "--ink-3"});opacity:${lead ? 1 : 0.45}"><title>${model}: ${n} picked by ${v} of 200 fresh agents</title></path>`;
      s += `<text class="tick" x="${x0 + w / 2}" y="${H - B + 15}" text-anchor="middle" style="${lead ? "fill:var(--ink);font-weight:600" : ""}">${n}</text>`;
      if (v === Math.max(...b.counts)) s += `<text class="tick" x="${x0 + w / 2}" y="${top - 5}" text-anchor="middle" style="fill:var(--ink)">${v}</text>`;
    });
    return s + "</svg>";
  }).join("")}</div>`;
})();

// ---------- 7. tipping ----------
(function tipping() {
  const tiles = makeGrid($("tp-grid"));
  const kS = $("tp-k"), mS = $("tp-mem");
  let timer;
  function run() {
    clearInterval(timer);
    const k = +kS.value, M = +mS.value;
    $("tp-k-v").textContent = `${k} of 24 (${pct(k / 24)})`; $("tp-mem-v").textContent = `${M}`;
    let pop = null, conv = null;
    for (let attempt = 0; attempt < 8 && !conv; attempt++) {
      pop = new Population({ decide: majorityDecider(M), seed: freshSeed() });
      for (let r = 0; r < 80; r++) {
        const names = pop.step().map((p) => p.name);
        if (consensusOf(names) === 1) { conv = names[0]; break; }
      }
    }
    if (!conv) { $("tp-stat").textContent = "This population never settled on a name, which happens with very short memories. Try again or raise the memory."; return; }
    const alt = NAMES[(NAMES.indexOf(conv) + 3) % NAMES.length];
    const committed = [...Array(24).keys()].map((i) => (i < k ? alt : null));
    const after = new Population({ decide: majorityDecider(M), seed: freshSeed(), committed, memories: pop.mem });
    const colourOf = (n) => (n === conv ? 1 : n === alt ? 2 : 0);
    const series = [[0, 0]];
    const ROUNDS = 40;
    paintGrid(tiles, pop.history[pop.history.length - 1], colourOf, { committed });
    const draw = () => lineChart($("tp-chart"), { x: [0, ROUNDS], y: [0, 1], xTicks: [0, 10, 20, 30, 40], yTicks: [0, 0.5, 1], height: 260, xLabel: "rounds since the minority started", aria: "Share playing the new name",
      refs: [{ y: 0.5, label: "majority", right: true }], series: [{ label: `new name ${alt}`, color: "--s2", points: series, marker: series.length - 1 }], tipX: (r) => `round ${r}` });
    draw();
    const tick = () => {
      if (after.history.length >= ROUNDS) {
        clearInterval(timer);
        const last = after.history.slice(-5).flatMap((r) => r.map((p) => p.name));
        const flipped = last.filter((n) => n === alt).length / last.length > 0.5;
        $("tp-stat").innerHTML = `${flipped ? `<b>Flipped.</b> ${k} committed agents moved the population from ${conv} to ${alt}.` : `<b>Held.</b> The population stayed with ${conv}; ${k} committed agents weren't enough.`} Run again: near the threshold, outcomes vary.`;
        return;
      }
      const round = after.step();
      paintGrid(tiles, round, colourOf, { committed });
      series.push([after.history.length, round.filter((p) => p.name === alt).length / 24]);
      $("tp-stat").innerHTML = `Convention <b>${conv}</b> (blue). ${k} committed agents play <b>${alt}</b> (orange). Round ${after.history.length} of ${ROUNDS}.`;
      draw();
    };
    if (reduceMotion) { for (let i = 0; i <= ROUNDS; i++) tick(); } else timer = setInterval(tick, 120);
  }
  kS.addEventListener("input", () => { $("tp-k-v").textContent = `${kS.value} of 24 (${pct(+kS.value / 24)})`; });
  mS.addEventListener("input", () => { $("tp-mem-v").textContent = mS.value; });
  for (const s of [kS, mS]) s.addEventListener("change", run);
  $("tp-run").addEventListener("click", run);
  run();
  const gcol = { 3: "--s3", 5: "--s1", 7: "--s2" };
  lineChart($("chart-gemma-tip"), { x: [0, 30], y: [0, 1], xTicks: [0, 10, 20, 30], yTicks: [0, 0.5, 1], height: 260, endLabels: true, right: 130, xLabel: "rounds since the minority started", aria: "Gemma tipping",
    refs: [{ y: 0.5, label: "majority" }], series: D.gemmaTipping.map((t) => ({ label: `${t.k} committed (${pct(t.k / 24, 1)})`, color: gcol[t.k], points: [[0, 0], ...t.curve.map((v, i) => [i + 1, v])] })), tipX: (r) => `round ${r}` });
  const rows = D.tippingMemory.filter((r) => [3, 5, 8, 12].includes(r.memory));
  const colors = { 3: "--s3", 5: "--s1", 8: "--s7", 12: "--s2" };
  lineChart($("chart-critical"), { x: [1, 10], y: [0, 1], xTicks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], yTicks: [0, 0.5, 1], height: 280, endLabels: true, right: 110, xLabel: "committed agents (of 24)", aria: "Flip rate by committed agents and memory",
    series: rows.map((r) => ({ label: `memory ${r.memory}`, color: colors[r.memory], dots: true, points: r.rates.map((v, i) => [i + 1, v]) })), tipX: (k) => `${k} committed agents (${pct(k / 24)})` });
})();

// ---------- 8. cascades ----------
(function cascades() {
  const c = D.cascades;
  const K = [-3, -2, -1, 0, 1, 2, 3];
  const series = [
    { label: "Qwen 1.5B, sampled", color: "--s1", dots: true, points: K.map((k, i) => [k, c.qwen.conformity[i]]) },
    { label: "Llama 1B, sampled", color: "--s3", dots: true, points: K.map((k, i) => [k, c.llama.conformity[i]]) },
    { label: "Qwen 1.5B, greedy", color: "--s7", dots: true, points: K.map((k, i) => [k, c.qwenGreedy.conformity[i]]) },
    { label: "Rational player", color: "--s2", step: true, points: K.map((k) => [k, k >= 2 ? 1 : 0]) },
  ];
  legend($("conf-legend"), series.map((s) => ({ label: s.label, color: s.color })));
  lineChart($("chart-conformity"), { x: [-3, 3], y: [0, 1], xTicks: K, xFmt: (v) => (v > 0 ? `+${v}` : `${v}`), yTicks: [0, 0.25, 0.5, 0.75, 1], height: 320, width: 720, endLabels: true, right: 150,
    xLabel: "earlier guesses against my ball, minus guesses for it", yLabel: "went against own ball", aria: "Conformity curves", series, tipX: (k) => `crowd ${k > 0 ? "+" : ""}${k}` });

  // Simulator: player types built from measured behaviour.
  const curve = (arr) => (net) => arr[Math.max(-3, Math.min(3, net)) + 3];
  const types = [
    { k: "own", label: "Ignore everyone", p1: () => "own", later: () => 0 },
    { k: "bayes", label: "Rational", bayes: true },
    { k: "qwen", label: "Qwen 1.5B (measured)", p1own: c.qwen.player1Own, later: curve(c.qwen.conformity) },
    { k: "llama", label: "Llama 1B (measured)", p1own: c.llama.player1Own, later: curve(c.llama.conformity) },
    { k: "greedy", label: "Qwen 1.5B greedy (measured)", p1blue: true, later: curve(c.qwenGreedy.conformity) },
  ];
  $("cs-types").innerHTML = types.map((t, i) => `<button type="button" data-i="${i}" aria-pressed="${i === 2}">${esc(t.label)}</button>`).join("");
  function game(t, r) {
    const redUrn = r() < 0.5; // true urn is the red-majority urn
    const turns = [];
    for (let i = 0; i < 10; i++) {
      const ball = r() < 2 / 3 ? (redUrn ? "red" : "blue") : (redUrn ? "blue" : "red");
      let guess;
      if (t.bayes) {
        const revealed = turns.filter((x) => !x.inCascade).reduce((s, x) => s + (x.guess === "red" ? 1 : -1), 0);
        if (Math.abs(revealed) >= 2) { guess = revealed > 0 ? "red" : "blue"; turns.push({ ball, guess, inCascade: true }); continue; }
        const lead = revealed + (ball === "red" ? 1 : -1);
        guess = lead > 0 ? "red" : lead < 0 ? "blue" : ball;
      } else if (i === 0) {
        guess = t.p1blue ? "blue" : t.k === "own" || r() < t.p1own ? ball : (ball === "red" ? "blue" : "red");
      } else {
        const net = turns.filter((x) => x.guess !== ball).length - turns.filter((x) => x.guess === ball).length;
        guess = r() < t.later(net) ? (ball === "red" ? "blue" : "red") : ball;
      }
      turns.push({ ball, guess, inCascade: false });
    }
    return { truth: redUrn ? "red" : "blue", turns };
  }
  function run(i) {
    const t = types[i];
    for (const b of $("cs-types").querySelectorAll("button")) b.setAttribute("aria-pressed", String(+b.dataset.i === i));
    const r = makeRng(freshSeed());
    const games = [...Array(2000)].map(() => game(t, r));
    const acc = games.reduce((s, g) => s + g.turns.filter((x) => x.guess === g.truth).length, 0) / (games.length * 10);
    const wrong = games.filter((g) => { const l = g.turns.slice(-3); return l.every((x) => x.guess === l[0].guess) && l[0].guess !== g.truth; }).length / games.length;
    const dot = (col) => `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:var(${col === "red" ? "--s8" : "--s1"})"></span>`;
    $("cs-games").innerHTML = `<div class="table-wrap" style="margin:0"><table><thead><tr><th>True urn</th>${[...Array(10).keys()].map((j) => `<th class="num">${j + 1}</th>`).join("")}</tr></thead><tbody>${games.slice(0, 10).map((g) => `<tr><td>${dot(g.truth)} ${g.truth}</td>${g.turns.map((x) => `<td class="num" style="${x.guess !== g.truth ? "background:var(--paper-2)" : ""}" title="drew ${x.ball}, guessed ${x.guess}">${dot(x.ball)} <span class="mono">${x.guess === "red" ? "R" : "B"}</span></td>`).join("")}</tr>`).join("")}</tbody></table></div><div class="stat-line">Dot: the ball the player drew. Letter: their guess. Shaded: a wrong guess.</div>`;
    $("cs-out").innerHTML = `<div class="eyebrow">2,000 simulated games</div><div class="big-number" style="margin-top:8px">${pct(acc)}</div><div class="stat-line" style="margin-top:4px">of guesses were right. Ignoring everyone gets 67%; rational players about 76%.</div><div class="big-number" style="margin-top:18px">${pct(wrong)}</div><div class="stat-line" style="margin-top:4px">of games ended with the last three players all wrong. Rational players: about 19%.</div>${t.p1blue ? `<p class="stat-line" style="margin-top:14px">The real greedy runs: ${pct(c.qwenGreedy.accuracy)} right, ${pct(c.qwenGreedy.last3Wrong)} wrong lock-ins.</p>` : t.k === "qwen" ? `<p class="stat-line" style="margin-top:14px">The real runs: ${pct(c.qwen.accuracy)} right, ${pct(c.qwen.last3Wrong)} wrong lock-ins.</p>` : t.k === "llama" ? `<p class="stat-line" style="margin-top:14px">The real runs: ${pct(c.llama.accuracy)} right, ${pct(c.llama.last3Wrong)} wrong lock-ins.</p>` : ""}`;
  }
  $("cs-types").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) run(+b.dataset.i); });
  run(2);
})();

// ---------- 9a. Schelling ----------
(function schelling() {
  const N = 40, canvas = $("sc-canvas"), ctx = canvas.getContext("2d"), tol = $("sc-tol");
  let grid, timer, sims;
  const nb = (g, i) => { const r = Math.floor(i / N), c = i % N, o = []; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (!dr && !dc) continue; const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= N || cc >= N) continue; const v = g[rr * N + cc]; if (v !== null) o.push(v); } return o; };
  const share = (g, i) => { const ns = nb(g, i); return ns.length ? ns.filter((v) => v === g[i]).length / ns.length : null; };
  const happy = (g, i, t) => (share(g, i) ?? 1) >= t;
  const similarity = (g) => { const xs = g.map((v, i) => (v === null ? null : share(g, i))).filter((x) => x !== null); return xs.reduce((a, b) => a + b, 0) / xs.length; };
  function paint() {
    const cs = getComputedStyle(document.documentElement);
    const col = [cs.getPropertyValue("--s1").trim(), cs.getPropertyValue("--s2").trim()], empty = cs.getPropertyValue("--paper-2").trim();
    const s = canvas.width / N;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    grid.forEach((v, i) => { ctx.fillStyle = v === null ? empty : col[v]; ctx.fillRect((i % N) * s + 0.5, Math.floor(i / N) * s + 0.5, s - 1, s - 1); });
  }
  function draw() {
    lineChart($("sc-chart"), { x: [0, Math.max(10, sims.length - 1)], y: [0.4, 1], yTicks: [0.4, 0.6, 0.8, 1], xTicks: [0, Math.max(10, sims.length - 1)], height: 230, xLabel: "step", aria: "Similar neighbours over time",
      refs: [{ y: 0.5, label: "random city", right: true }], series: [{ label: "same-kind neighbours", color: "--s1", points: sims.map((v, i) => [i, v]), marker: sims.length - 1 }], tipX: (s) => `step ${s}` });
  }
  function run() {
    clearInterval(timer);
    const t = +tol.value; $("sc-tol-v").textContent = pct(t);
    const r = makeRng(freshSeed());
    grid = Array.from({ length: N * N }, () => (r() < 0.9 ? (r() < 0.5 ? 0 : 1) : null));
    sims = [similarity(grid)]; paint(); draw();
    let step = 0;
    const tick = () => {
      const movers = shuffle(r, grid.map((_, i) => i).filter((i) => grid[i] !== null && !happy(grid, i, t)));
      if (!movers.length || step >= 120) {
        clearInterval(timer);
        $("sc-stat").innerHTML = `${movers.length ? "Still unsettled after 120 steps: almost nobody can be content, so agents keep moving." : `Everyone content after <b>${step}</b> steps.`} Same-kind neighbours: <b>${pct(sims[0])}</b> at the start, <b>${pct(sims[sims.length - 1])}</b> now, from agents who only asked for <b>${pct(t)}</b>.`;
        return;
      }
      for (const i of movers) {
        if (grid[i] === null || happy(grid, i, t)) continue;
        const empties = []; grid.forEach((v, j) => { if (v === null) empties.push(j); });
        const j = empties[randInt(r, empties.length)]; grid[j] = grid[i]; grid[i] = null;
      }
      step++; sims.push(similarity(grid)); paint(); draw();
      $("sc-stat").innerHTML = `Step <b>${step}</b>: ${movers.length} discontented agents moved.`;
    };
    if (reduceMotion) { for (let i = 0; i <= 120; i++) tick(); } else timer = setInterval(tick, 90);
  }
  tol.addEventListener("input", () => { $("sc-tol-v").textContent = pct(+tol.value); });
  tol.addEventListener("change", run);
  $("sc-run").addEventListener("click", run);
  const redraw = () => grid && paint();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  run();
})();

// ---------- 9b. El Farol ----------
(function elFarol() {
  const clamp = (v) => Math.max(0, Math.min(100, v));
  const at = (h, k) => h[h.length - k] ?? 50;
  const bag = [];
  for (let k = 1; k <= 5; k++) bag.push((h) => at(h, k));
  for (let k = 1; k <= 3; k++) bag.push((h) => 100 - at(h, k));
  for (const k of [2, 3, 4, 5, 8]) bag.push((h) => h.slice(-k).reduce((a, b) => a + b, 0) / Math.min(k, h.length));
  for (const k of [3, 5, 8]) bag.push((h) => { const xs = h.slice(-k); const n = xs.length, mx = (n - 1) / 2, my = xs.reduce((a, b) => a + b, 0) / n; const sl = xs.reduce((s, y, i) => s + (i - mx) * (y - my), 0) / xs.reduce((s, _, i) => s + (i - mx) ** 2, 0); return clamp(my + sl * (n - mx)); });
  for (const c of [30, 45, 55, 67, 75]) bag.push(() => c);
  const AVG4 = 10; // index of "average of last 4"
  const types = [
    { label: "Diverse forecasters (6 rules each)", k: 6 },
    { label: "Monoculture: everyone averages the last 4 weeks", mono: AVG4 },
    { label: "Coin flips (go with p = 0.6)", coin: true },
  ];
  $("ef-types").innerHTML = types.map((t, i) => `<button type="button" data-i="${i}" aria-pressed="${i === 0}">${esc(t.label)}</button>`).join("");
  function sim(t, r, weeks = 170) {
    const hist = Array.from({ length: 10 }, () => randInt(r, 101));
    if (t.coin) return [...Array(weeks)].map(() => [...Array(100)].filter(() => r() < 0.6).length);
    const hold = [...Array(100)].map(() => { if (t.mono != null) return [t.mono]; const s = new Set(); while (s.size < t.k) s.add(randInt(r, bag.length)); return [...s]; });
    const err = hold.map((h) => h.map(() => 0));
    const out = [];
    for (let w = 0; w < weeks; w++) {
      const f = hold.map((h) => h.map((p) => bag[p](hist)));
      let going = 0;
      hold.forEach((h, a) => { let best = 0; for (let i = 1; i < h.length; i++) if (err[a][i] < err[a][best]) best = i; if (f[a][best] <= 60) going++; });
      out.push(going); hist.push(going);
      hold.forEach((h, a) => h.forEach((_, i) => (err[a][i] = 0.9 * err[a][i] + Math.abs(f[a][i] - going))));
    }
    return out.slice(50);
  }
  function run(i) {
    for (const b of $("ef-types").querySelectorAll("button")) b.setAttribute("aria-pressed", String(+b.dataset.i === i));
    const att = sim(types[i], makeRng(freshSeed()));
    const m = att.reduce((a, b) => a + b, 0) / att.length, sd = Math.sqrt(att.reduce((s, x) => s + (x - m) ** 2, 0) / att.length);
    const crowded = att.filter((x) => x > 60).length / att.length;
    const enjoyed = att.reduce((s, x) => s + (x <= 60 ? x : 0), 0) / att.length / 60;
    lineChart($("ef-chart"), { x: [1, att.length], y: [0, 100], yTicks: [0, 20, 40, 60, 80, 100], yFmt: (v) => `${Math.round(v)}`, xTicks: [1, 30, 60, 90, 120], height: 260, width: 760, xLabel: "week", yLabel: "people at the bar", aria: "Weekly attendance",
      refs: [{ y: 60, label: "capacity 60" }], series: [{ label: "attendance", color: "--s1", points: att.map((v, w) => [w + 1, v]) }], tipX: (w) => `week ${w}` });
    $("ef-stat").innerHTML = `Mean attendance <b>${m.toFixed(1)}</b> · week-to-week swing (sd) <b>${sd.toFixed(1)}</b> · overcrowded in <b>${pct(crowded)}</b> of weeks · seats enjoyed <b>${pct(enjoyed)}</b> (attendance on good nights as a share of capacity; crowded nights count as zero).`;
  }
  $("ef-types").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) run(+b.dataset.i); });
  run(0);
})();
})();
