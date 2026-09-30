import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, runSequence } from "../src/games/cascade.ts";
import { cascadePrompt, framingFor, parseUrn, runLLMSequence } from "../src/games/cascade-llm.ts";
import type { ChatMessage, Completion, LLM } from "../src/lib/types.ts";

test("bayes follows its ball until revealed balls lead by 2, then cascades", () => {
  const t = (guess: "A" | "B", inCascade = false) => ({ ball: guess === "A" ? ("a" as const) : ("b" as const), guess, overrodeOwn: false, inCascade });
  assert.equal(decide("bayes", "b", []).guess, "B");
  assert.equal(decide("bayes", "b", [t("A")]).guess, "B"); // tie goes to own ball
  assert.deepEqual(decide("bayes", "b", [t("A"), t("A")]), { guess: "A", inCascade: true });
  // Cascade guesses carry no information, so they don't extend the lead.
  assert.deepEqual(decide("bayes", "b", [t("A"), t("B"), t("A"), t("A", true)]), { guess: "B", inCascade: false });
});

test("prompt shows the ball colour and earlier guesses, with counterbalanced framing", () => {
  const frames = [...Array(40).keys()].map(framingFor);
  assert.ok(frames.some((f) => f.aColour === "red") && frames.some((f) => f.aColour === "blue"));
  const f = { aColour: "blue" as const, firstUrn: "B" as const };
  const text = cascadePrompt("a", ["A", "B"], f).map((m) => m.content).join("\n");
  assert.match(text, /Urn B contains 2 red balls and 1 blue ball\. Urn A contains 2 blue balls/);
  assert.match(text, /You drew a blue ball/);
  assert.match(text, /guessed, in order: A, B/);
  assert.equal(parseUrn('{"urn": "B"}'), "B");
  assert.equal(parseUrn("B"), null);
});

test("an LLM that always follows its ball behaves exactly like 'own'", async () => {
  // Read the ball colour off the prompt and answer the urn whose majority colour it is.
  const llm: LLM = {
    async complete(m: ChatMessage[]): Promise<Completion> {
      const text = m.map((x) => x.content).join("\n");
      const colour = /You drew a (\w+) ball/.exec(text)![1];
      const urn = new RegExp(`Urn (\\w) contains 2 ${colour}`).exec(text)![1];
      return { text: JSON.stringify({ urn }), promptTokens: 1, completionTokens: 1, ms: 1 };
    },
  };
  for (const seed of [1, 2, 3]) {
    const s = await runLLMSequence(llm, 10, seed, 0);
    assert.deepEqual(s.turns.map((t) => t.guess), runSequence("own", 10, seed).turns.map((t) => t.guess));
    assert.ok(s.turns.every((t) => !t.overrodeOwn));
  }
});
