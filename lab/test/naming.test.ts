import { test } from "node:test";
import assert from "node:assert/strict";
import type { ChatMessage, Completion, CompletionOpts, LLM } from "../src/lib/types.ts";
import { POOLS, buildPrompt, parseAnswer, payoff, window, answerSchema } from "../src/games/naming.ts";
import { majorityPolicy, minimalNamingGame } from "../src/games/naming-rule.ts";
import { pairAgents, poolOrder, replayMemory, runGame, type Decision, type Policy, type Request } from "../src/sim/population.ts";
import { llmPolicy } from "../src/sim/llm-policy.ts";
import { convergence, flipped, positionCounts, parseCounts, summarise, consensusSeries } from "../src/analysis/naming.ts";
import { permutationTvd, tvd, wilson } from "../src/lib/stats.ts";
import type { RunLog } from "../src/sim/record.ts";

/** A fake model: answers with a function of the prompt, and records what it was shown. */
class ScriptedLLM implements LLM {
  seen: { messages: ChatMessage[]; opts: CompletionOpts }[] = [];
  private answer: (messages: ChatMessage[], opts: CompletionOpts) => string;
  constructor(answer: (messages: ChatMessage[], opts: CompletionOpts) => string) {
    this.answer = answer;
  }
  async complete(messages: ChatMessage[], opts: CompletionOpts): Promise<Completion> {
    this.seen.push({ messages, opts });
    return { text: this.answer(messages, opts), promptTokens: 10, completionTokens: 5, ms: 1 };
  }
}

const letters = POOLS.letters;
const firstOption = (_: ChatMessage[], opts: CompletionOpts) =>
  JSON.stringify({ name: (opts.jsonSchema as { properties: { name: { enum: string[] } } }).properties.name.enum[0] });

const base = { condition: "test", seed: 7, rounds: 6, memory: 3, pool: "letters" as const, wording: "game" as const };
const agents = (n: number, id = "p") => Array(n).fill(id);

test("payoff is symmetric and matches the paper", () => {
  assert.equal(payoff("F", "F"), 100);
  assert.equal(payoff("F", "J"), -50);
});

test("pairing is a perfect matching, deterministic, and changes by round", () => {
  const p = pairAgents(24, 1, 0);
  assert.equal(p.length, 12);
  assert.deepEqual([...p.flat()].sort((a, b) => a - b), [...Array(24).keys()]);
  assert.deepEqual(pairAgents(24, 1, 0), p);
  assert.notDeepEqual(pairAgents(24, 1, 1), p);
  assert.throws(() => pairAgents(5, 1, 0));
});

test("pool order is a shuffled permutation per agent and round", () => {
  const a = poolOrder(letters, 1, 0, 0);
  assert.deepEqual([...a].sort(), [...letters].sort());
  assert.notDeepEqual(poolOrder(letters, 1, 0, 1), a);
});

test("prompt shows only the memory window, in the given order", () => {
  const mem = [1, 2, 3, 4].map((i) => ({ mine: letters[i], theirs: letters[i + 1], payoff: -50 }));
  const w = window(mem, 2);
  assert.deepEqual(w, mem.slice(2));
  const text = buildPrompt("game", ["Z", "F"], w).map((m) => m.content).join("\n");
  assert.match(text, /\[Z, F\]/);
  assert.match(text, /Round 1: you picked M, your partner picked Q/);
  assert.doesNotMatch(text, /you picked J/);
  assert.match(buildPrompt("plain", ["Z"], []).map((m) => m.content).join(""), /No rounds played yet/);
  assert.deepEqual(answerSchema(["Z", "F"]).properties.name.enum, ["Z", "F"]);
});

test("parsing: ok, repaired and failed", () => {
  assert.deepEqual(parseAnswer('{"name": "K"}', letters), { name: "K", status: "ok" });
  assert.deepEqual(parseAnswer("I pick K.", letters), { name: "K", status: "repaired" });
  assert.deepEqual(parseAnswer("K or M", letters), { name: null, status: "failed" });
  assert.deepEqual(parseAnswer('{"name": "A"}', letters), { name: null, status: "failed" });
  assert.deepEqual(parseAnswer("Kiwi", letters), { name: null, status: "failed" });
});

test("an LLM population: memory, payoffs and positions are consistent", async () => {
  const llm = new ScriptedLLM(firstOption);
  const log = await runGame({ ...base, agentPolicies: agents(8), policies: { p: llmPolicy({ modelId: "p", temperature: 0, wording: "game", llm }) } });
  assert.equal(log.plays.length, 8 * 6);
  assert.equal(llm.seen.length, 8 * 6);
  // Always the first option shown, so position 0 every time.
  assert.deepEqual(positionCounts([log]).slice(0, 2), [48, 0]);
  assert.deepEqual(parseCounts([log]), { ok: 48, repaired: 0, failed: 0 });
  for (const p of log.plays) {
    const q = log.plays.find((x) => x.round === p.round && x.agent === p.partner)!;
    assert.equal(q.partner, p.agent);
    assert.equal(p.payoff, payoff(p.name, q.name));
    assert.equal(q.payoff, p.payoff);
  }
  // The memory window is enforced: the last prompt shows 3 rounds, not 5.
  const last = llm.seen.at(-1)!.messages[1].content;
  assert.equal(last.match(/^Round \d/gm)?.length, 3);
  assert.deepEqual(log.finalMemory, replayMemory(log.initialMemory, log.plays));
});

test("committed agents never call their policy", async () => {
  const llm = new ScriptedLLM(firstOption);
  const committed = ["Z", "Z", null, null];
  const log = await runGame({ ...base, rounds: 3, agentPolicies: agents(4), committed, policies: { p: llmPolicy({ modelId: "p", temperature: 0, wording: "game", llm }) } });
  assert.equal(llm.seen.length, 2 * 3);
  assert.ok(log.plays.filter((p) => p.agent < 2).every((p) => p.name === "Z" && p.status === "committed"));
});

test("failed parses still play, with the flag kept", async () => {
  const llm = new ScriptedLLM(() => "no idea");
  const log = await runGame({ ...base, rounds: 1, agentPolicies: agents(4), policies: { p: llmPolicy({ modelId: "p", temperature: 0, wording: "game", llm }) } });
  assert.ok(log.plays.every((p) => p.status === "failed" && letters.includes(p.name)));
});

test("mixed populations are answered one policy (model) at a time", async () => {
  const calls: string[] = [];
  const policy = (id: string): Policy => ({
    id,
    async decide(rs: Request[]): Promise<Decision[]> {
      calls.push(`${id}:${rs.length}`);
      return rs.map((r) => ({ name: r.order[0], status: "ok" }));
    },
  });
  await runGame({ ...base, rounds: 2, agentPolicies: ["a", "b", "a", "b", "a", "a"], policies: { a: policy("a"), b: policy("b") } });
  assert.deepEqual(calls, ["a:4", "b:2", "a:4", "b:2"]);
});

test("a resumed run is identical to an uninterrupted one", async () => {
  const opts = { ...base, rounds: 12, agentPolicies: agents(10), policies: { p: majorityPolicy() } };
  const full = await runGame(opts);
  const partial = full.plays.filter((p) => p.round < 5);
  const resumed = await runGame({ ...opts, resume: partial });
  assert.deepEqual(resumed.plays, full.plays);
  assert.deepEqual(resumed.finalMemory, full.finalMemory);
});

const synthetic = (rounds: string[][]): RunLog => ({
  meta: { experiment: "naming", condition: "s", seed: 0, agents: rounds[0].length, rounds: rounds.length, memory: 5, pool: "letters", wording: "game", agentPolicies: [], committed: [], startedAt: "", finishedAt: "" },
  plays: rounds.flatMap((names, round) => names.map((name, agent) => ({ round, agent, partner: agent ^ 1, name, order: letters, position: letters.indexOf(name), payoff: 0, status: "ok" as const, policy: "s" }))),
  initialMemory: [],
  finalMemory: [],
});

test("convergence needs STREAK windows above threshold on one name", () => {
  const mixed = Array(10).fill("F").map((x, i) => (i < 5 ? x : "J"));
  const allF = Array(10).fill("F");
  const log = synthetic([mixed, mixed, mixed, allF, allF, allF, allF, allF, allF, allF, allF, allF, allF]);
  const s = consensusSeries(log);
  assert.equal(s[0].share, 0.5);
  const c = convergence(log);
  assert.equal(c.name, "F");
  assert.equal(c.round, 7); // first window with no mixed rounds is r=7 (rounds 3..7)
  assert.equal(convergence(synthetic(Array(4).fill(allF))).round, null); // too short: censored
  assert.equal(summarise([log]).converged, 1);
});

test("flipped means the alternative holds a majority of the final window", () => {
  assert.equal(flipped(synthetic(Array(6).fill(["Z", "Z", "Z", "F"])), "Z"), true);
  assert.equal(flipped(synthetic(Array(6).fill(["Z", "Z", "F", "F"])), "Z"), false);
});

test("stats: TVD, permutation test and Wilson", () => {
  assert.equal(tvd([1, 0], [0, 1]), 1);
  assert.equal(tvd([0.5, 0.5], [0.5, 0.5]), 0);
  const same = permutationTvd(["a", "b", "a", "b"], ["b", "a", "b", "a"], ["a", "b"], 500);
  assert.equal(same.tvd, 0);
  assert.equal(same.p, 1);
  const diff = permutationTvd(Array(30).fill("a"), Array(30).fill("b"), ["a", "b"], 500);
  assert.ok(diff.p < 0.01);
  const [lo, hi] = wilson(5, 10);
  assert.ok(lo < 0.5 && hi > 0.5);
});

test("the classic minimal naming game reaches consensus", () => {
  const r = minimalNamingGame(24, letters, 20000, 3);
  assert.ok(r.consensusAt !== null);
  assert.ok(letters.includes(r.winner!));
});
