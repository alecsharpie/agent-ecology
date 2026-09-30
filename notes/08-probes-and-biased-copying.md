# 08: Why the LLM agents don't converge, and why Q wins anyway

**Data:** `lab/public/results/probe-qwen2-5-1-5b-instruct-{game,tally}-t07.json` (probe page, 400 calls each), `naming-b-letters-tally-s{0,1}.json` (tally variant, paired with game seeds 0–1).
**Status:** exploratory. The "tally" wording and the probes are not part of the pre-registered protocol.

## 1. Probes: what one agent does in a clear situation

The probe page (`/probe.html`) fixes an agent's memory to a scripted history and asks the model 100 times. The names are rotated through all 10 letters and the list is shuffled every call. Qwen2.5 1.5B, T = 0.7.

| Scripted history (last 5 rounds) | "game" wording: plays own X | plays partner's Y | other | "tally" wording: X | Y | other |
|---|---|---|---|---|---|---|
| Won 5 times, always on X | **96%** | 1% | 3% | 60% | 5% | 35% |
| **Lost 5 times on X; every partner played Y** | **92%** | **1%** | 7% | 66% | **3%** | 31% |
| Won 4 times on X, then lost to Y | 96% | 2% | 2% | 93% | 4% | 3% |
| Lost 5 times on X; partners played Y, Y, Z, Y, Z | 89% | 4% | 7% | 72% | 13% | 15% |

**The model repeats its own past choice, whatever happened.** After five straight losses to partners who all played Y, it plays X again 92% of the time. A coordination-minded player would switch to Y almost always. The model isn't weighing payoffs or partners; it's continuing the visible pattern "you picked X, you picked X, …". Copying from context is a well-known language-model tendency, and here it's the whole story of the frozen camps ([01](01-first-llm-seed.md)).

**The tally line doesn't teach it to follow partners.** It makes agents *less* consistent: after 5 wins, they stick only 60% of the time, and even after 5 losses to Y they pick Y only 3% of the time. They scatter to other names instead.

## 2. The tally variant in populations (paired with the same seeds)

Same seed means same pairings, same shuffles and an identical round 1. Only the extra line differs from round 2 on.

| Seed | Wording | Copy after a mismatch | Explore | Consensus, last 10 rounds | Leader |
|---|---|---|---|---|---|
| 0 | game | 3% | 26% | 0.39 | Q 39% |
| 0 | tally | 10% | 21% | **0.64** | Q 64% |
| 1 | game | 4% | 32% | 0.55 | Q 55% |
| 1 | tally | 12% | 27% | **0.65** | Q 65% (71% by round 40) |

Tally populations get closer to a convention in both seeds, and it's always Q. Neither converges.

## 3. The mechanism: agents copy partners whose name they already like

If the tally line doesn't create copying in the probes, why does copying triple in populations? Splitting every "lost last round" moment by what the partner had played:

| Run | Copied the partner, when the partner played **Q** | …when the partner played **another name** |
|---|---|---|
| game, seeds 0 / 1 / 2 | 6% / 7% / 7% | 2% / 3% / 3% |
| tally, seeds 0 / 1 | **18% / 19%** | 5% / 7% |

**Agents are 2.5–3 times more likely to adopt a partner's name when it's a name the model already prefers.** In cultural-evolution terms this is *content-biased transmission*: social learning filtered by prior taste. The tally line raises copying, but mostly copying *of Q*.

This ties the whole picture together:

1. Agents mostly repeat themselves, so the population fragments into camps early ([01](01-first-llm-seed.md)).
2. When they do move, they move toward names they like, and Q is the model's favourite ([05](05-individual-bias.md)).
3. So every seed drifts toward Q, even from behind (seed 2), which amplifies a 28% individual preference into leadership in every run.

**The collective bias here is not something that emerges out of nowhere. It's an individual bias, amplified because it filters who gets copied.** It's the same shape as the rule model with a weak lean ([00](00-rule-baseline.md)), where a small tilt doubled a name's win rate, plus one extra ingredient the rule model lacked: preference-filtered copying.

## What would change my mind

- If the "plain" wording or the nonsense-word pool shows equal copying of all names, the content bias is a quirk of letters or of this prompt.
- If a different model family (Llama 3.2 1B, condition D, running next) copies partners more, repetition may be a Qwen-specific trait.
