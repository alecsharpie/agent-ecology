# 05: Individual bias baseline: Qwen2.5 1.5B, T=0.7

**Data:** `lab/public/results/baseline-qwen2-5-1-5b-instruct-letters-game-t07.json`. 200 fresh agents, empty memory, "game" wording, letters, a different shuffle per agent. About 2 minutes headless (0.4 s per call, since the prompt is short).

## Why this matters

The paper's "collective bias" claim is that the name a *population* settles on is not simply the name individuals prefer. To test that we need to know what individuals prefer. This is that measurement.

## What one agent picks on its own

| Name | F | J | K | M | Q | R | T | W | X | Z |
|---|---|---|---|---|---|---|---|---|---|---|
| Picks (of 200) | 19 | 7 | 2 | 7 | **55** | 15 | **33** | 4 | 29 | 29 |

If every name were equally liked, each would get about 20.

| Position in the shown list | 1st | 2nd | 3rd | 4th–10th |
|---|---|---|---|---|
| Picks | **124** | 50 | 8 | 18 |

## Two biases, stacked

1. **Position bias dominates.** 62% of agents pick whatever is listed first, and 87% pick one of the first two. Without shuffling, "the first name in the list" would look like a strong preference for one letter, and every population would trivially agree on it. The shuffle turns this into noise instead of fake consensus.
2. **A name preference sits on top.** Position alone can't explain the table. The clean test is to look only at agents who were shown a given name *first*:

   | Name | Shown first | …and picked it | Shown elsewhere | …and picked it |
   |---|---|---|---|---|
   | Q | 19 | **19 (100%)** | 181 | 36 (20%) |
   | T | 15 | **15 (100%)** | 185 | 18 (10%) |
   | F | 22 | 14 (64%) | 178 | 5 (3%) |

   Q is never passed over when it's first, and is still picked a fifth of the time from later positions. F gets skipped even from first place.

## Link to the naming game

Seed 0 of B froze into two camps, Q and T ([01](01-first-llm-seed.md)). Those are the model's two favourite names on its own. So far, the population's structure is **inherited** from individual preference, not emergent. The collective-bias test asks whether, across many seeds, the winners follow this table (Q about 28%, T about 17%, …) or something else. It needs seeds that actually converge, and none has yet.

## Caveats

- One model, one wording, one pool. The pre-registered check reruns this with the "plain" wording and nonsense words.
- Temperature 0.7. At temperature 0 (condition A) every fresh agent shown the same order would pick the same name.

## Other models (added later)

Same protocol, 200 fresh agents each, "game" wording, letters, T=0.7:

| Model | F | J | K | M | Q | R | T | W | X | Z | Picked the first-listed name |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Qwen2.5 1.5B | 19 | 7 | 2 | 7 | **55** | 15 | **33** | 4 | 29 | 29 | 124 (62%) |
| Qwen2.5 0.5B | 9 | **40** | 0 | 4 | 31 | 12 | 7 | **64** | 12 | 21 | 99 (50%) |
| Llama 3.2 1B | 23 | 10 | 17 | **39** | **52** | 11 | 10 | 6 | 3 | 29 | 39 (20%) |

**Each population drifts to its own model's favourites.** Qwen 1.5B populations were led by Q and T in every seed; Qwen 0.5B populations by **W and J**, its two favourites. Llama populations never held a leader long enough to say. Every model has its own "taste" in letters, and its populations inherit it, which fits the content-biased copying in [08](08-probes-and-biased-copying.md).

Position bias also differs by model: Llama picks the first-listed name only 20% of the time (it spreads across first and last positions), Qwen 1.5B 62%.
