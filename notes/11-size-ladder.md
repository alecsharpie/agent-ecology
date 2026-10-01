# 11: The size ladder: where copying switches on

**Status:** exploratory (after the pre-registered grid). **Data:** `lab/public/results/probe-*.json`, `naming-gemma-4-26b-a4b-it-letters-game-s0.json`. **Code:** probes in the browser (`/probe.html`) for Qwen; `lab/scripts/run-api.ts` with `lab/src/lib/gemini.ts` for Gemma, through the Gemini API.

## Why

None of the 25 pre-registered populations converged ([10](10-stubborn-vs-fickle.md)). Two questions followed. Is the failure about *size*? And is the 1.5B model's stubbornness caused by seeing its own past picks in the prompt?

## Test 1: remove the agent's own picks from its memory

A new exploratory wording, `partners`: the same prompt, but each remembered round says only "your partner picked Y; you did not match (-50 points)", never "you picked X".

| Qwen 1.5B: 5 losses on X, every partner played Y | plays own X | plays partner's Y | something else |
|---|---|---|---|
| Standard memory | 92% | 1% | 7% |
| Partner-only memory | **10%** | **7%** | 83% |

**Half right.** Seeing its own picks is what makes the model repeat itself. But take those lines away and nothing coordinated replaces them: it still almost never follows five partners who all played Y. At 1.5B there is no usable strategy underneath, only echoing its own history or guessing.

## Test 2: the same probes, bigger models

100 samples per cell for Qwen (browser), 50 for Gemma (API, free tier, paced at 25 requests a minute). Standard ("game") wording, T = 0.7.

| Scripted last 5 rounds | Qwen 1.5B | Qwen 3B | Qwen 7B | Gemma 4 26B-A4B | Gemma 4 31B |
|---|---|---|---|---|---|
| Won 5 on X → plays X | 96% | 0% | 100% | 100% | 100% |
| Lost 5, partners all Y → plays Y | 1% | 6% | **63%** | **98%** | **100%** |
| Won 4 on X, then lost to Y → keeps X | 96% | 0% | 99% | 100% | 100% |
| Lost 5, partners Y,Y,Z,Y,Z → plays Y | 4% | 4% | 52% | 86% | 100% |

- **Copying switches on between 3B and 7B**, and is complete by about 26B.
- **Qwen 3B is not a step on the way.** It ignores its memory entirely and picks the first-listed name 68% of the time (the second 27%). The ladder isn't monotonic: 1.5B echoes itself, 3B reads only the list, 7B reads its partners.
- **Gemma 31B plays the textbook strategy**: keep a winner, follow the partners' majority after losses, don't overreact to one loss. That is our "majority agent" ([00](00-rule-baseline.md)), discovered by the model from the prompt alone.
- **Qwen 7B with partner-only memory over-copies**: 100% copying after five losses, but also 97% abandonment of a 4-win streak after a single loss. That's the over-copying corner of the phase diagram ([06](06-habits.md)), where mismatched pairs swap names.

## Test 3: a population of Gemma 4 26B-A4B (seed 0)

24 agents, same protocol as every other run (letters, "game" wording, memory 5, 40 rounds, T = 0.7). 960 calls through the Gemini API, about 40 minutes at the free-tier pace.

```
round  consensus  most played
    1       0.21  F×5 K×3 X×3 T×3
    5       0.29  F×7 M×5 K×4 Z×3
   10       0.50  F×12 X×5 M×4 K×2
   15       0.71  F×17 X×4 M×3
   20       1.00  F×24
   40       1.00  F×24
```

**The first LLM population in this project to converge**, at round 21 by the pre-registered rule. The rule agents' median is 19. Its measured habits: repeat after a win **100%**; after a loss copy **26%**, keep 73%, explore **1%**. That sits squarely in the region the habit phase diagram ([06](06-habits.md)) predicted would work. The S-curve is the same shape as the rule agents': slow drift, then the feedback loop takes over around round 10.

**Round 1: all 24 agents picked the first name in their shuffled list.** With empty memory Gemma's choice is pure position, so effectively random over names. That makes the collective-bias test clean: if some names win more often across seeds, the bias can't be individual taste. Seeds 1–2 and a 200-agent baseline are running.

## Not possible on this key

Gemini 3.8 Flash worked in a smoke test, but the free tier allows **20 requests per day per model**. A population run needs 960. Running it needs billing enabled on the key's project. The cost would be small (about 300k input tokens per run).

## So, why is the game hard for small models?

1. Converging requires one inference: "my partners' names tell me what the population plays; switch to that". Copying partners is the habit that carries it.
2. Below about 7B, the models don't make that inference. They do whatever is most salient in the prompt instead: repeat their own listed picks (1.5B), or pick by position (3B).
3. From about 7B the inference appears, and by about 26B it's reliable and well-calibrated, with no overreaction. That's enough for a population to converge like simple rule agents.

The original paper's populations converged because its models were big enough to copy. Our small-model failures aren't a failed replication; they map out where that capability begins.
