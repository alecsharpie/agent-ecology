# 10: Stubborn and fickle: two models, two ways to fail

**Data:** `lab/public/results/naming-{a,b,d}-letters-game-s*.json`. Pre-registered conditions A (Qwen2.5 1.5B, greedy), B (Qwen2.5 1.5B, T=0.7) and D (Llama 3.2 1B, T=0.7); letters pool, "game" wording.

## The comparison

| Measure | **A**: Qwen 1.5B, greedy (2 seeds) | **B**: Qwen 1.5B, T=0.7 (3 seeds) | **D**: Llama 3.2 1B, T=0.7 (2 seeds) |
|---|---|---|---|
| Converged (pre-registered rule) | 0 / 2 | 0 / 3 | 0 / 2 |
| Consensus, last 10 rounds | 0.51, 0.50 | 0.39, 0.55, 0.50 | **0.26, 0.23** (chance is about 0.2) |
| Repeats a winning name | 93%, 88% | 87%, 86%, 82% | **32%, 38%** |
| After a mismatch: keeps own name | 84%, 79% | 71%, 64%, 66% | **11%, 8%** |
| After a mismatch: tries a random other name | 14%, 20% | 26%, 32%, 30% | **87%, 90%** |
| After a mismatch: copies the partner | 2%, 1% | 3%, 4%, 4% | 2%, 3% |
| Leading name | T, Q | Q, Q, Q | none |

![Consensus by condition](figures/consensus-by-condition.svg)

## Reading it with the habit phase diagram

Note [06](06-habits.md) mapped which habits let a population converge: **always repeat a winning name, copy partners sometimes (about 30–50% of the time is best), and almost never pick at random.**

- **Qwen is too stubborn.** It repeats itself whether it wins or loses (probe: 92% repeat after five straight losses, [08](08-probes-and-biased-copying.md)). Camps form in the first few rounds and then never dissolve. That's the "0% copy" row of the phase diagram.
- **Greedy Qwen (A) is even more stubborn, and freezes solid.** With sampling switched off, the population locks into a fixed split. Seed 0 showed *exactly* T×12, Q×10 in rounds 20, 30 and 40. Removing randomness removes the last thing that could move an agent between camps.
- **Llama is too fickle.** It abandons even a winning name two times out of three, and after a loss picks a random name 87% of the time. That's the far right of the phase diagram, where too much exploration means nothing accumulates. Consensus stays at chance.
- **Neither copies partners** (1–4%). That's the one ingredient every converging population in the phase diagram had, and it's what both models lack.

## Other differences

- **Leaders.** Qwen populations are led by Q or T, its individual favourites ([05](05-individual-bias.md)). Greedy seed 0 went to T, decided by who happened to meet whom in the first rounds. Llama has no clear leader, because its agents don't hold on to anything long enough.
- **Position bias differs by model.** In round 1, Qwen picks the first-listed name most (17–18 of 24 in condition A). Llama's picks are spread out, and across the whole run it favours the first *and last* positions (201 and 122 of 960 picks). So "position bias" isn't one thing; each model has its own shape of it.

## Grading, so far (pre-registered predictions, `lab/src/predictions.ts`)

| # | Prediction | Status |
|---|---|---|
| 1 | B converges in most seeds | 0/3 converged; it needs at least 3 of 5, so this is heading for **wrong** |
| 2 | A converges faster than B, always on the same name | **wrong so far**: A doesn't converge, and its two seeds are led by different names (T, Q) |
| 3 | C (0.5B) mostly fails | not run yet |
| 4 | Winners differ from the individual baseline | untestable yet: no winners under the pre-registered rule |
| 5 | Critical mass between 10% and 30% | not run yet (needs a converged population) |

The predictions assumed small models would behave roughly like the paper's frontier models, just more noisily. They don't: each model has systematic habits that push it off the region of the phase diagram where conventions form.
