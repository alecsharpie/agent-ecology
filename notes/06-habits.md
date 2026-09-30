# 06: Habits: what an agent must do for a convention to form

**Code:** `lab/src/games/naming-rule.ts` (`habitPolicy`), `lab/scripts/run-habit.ts`, `lab/scripts/run-habit-sweep.ts`. **Data:** `lab/public/results/habit.json`, `habit-sweep.json`. Runs in seconds to minutes, CPU only.

## The idea

Seed 0 of B didn't converge ([01](01-first-llm-seed.md)). We measured *how* its agents react to their last round. Now build a rule agent that has exactly those reactions, and nothing else, and see whether a population of them behaves like the LLM population. If it does, the reactions are the mechanism. Then vary the reactions to see which ones matter.

A **habit agent** looks only at its last round:

- after a **match**: repeat the name with probability *win-stay*, otherwise try a fresh name;
- after a **mismatch**: **copy** the partner's name, **keep** its own, or **explore** (a fresh name), with fixed probabilities.

## Step 1: plug in the LLM's measured habits

From seed 0: win-stay 0.86; after a mismatch, copy 0.03, keep 0.71, explore 0.26. Fresh names come from the individual baseline ([05](05-individual-bias.md)). 200 seeds:

| Population | Converged | Consensus at round 1 / 10 / 40 / 400 |
|---|---|---|
| LLM, seed 0 (reference) | 0/1 | 0.25 / 0.33 / 0.46 / – |
| Habit agents | **0/200** | 0.30 / 0.29 / 0.29 / 0.29 |
| Habit agents, but copy 30% | 0/200 | 0.30 / 0.32 / 0.32 / 0.33 |
| Majority agents (R) | 195/200 | 0.21 / 0.51 / 1.00 / – |

**The habits are enough to prevent a convention**, even over 400 rounds. The fit isn't exact, though: the LLM population crept up to 0.46 while habit agents stay flat at 0.29. The real agents get *stickier over time*. After a mismatch they kept their own name 41% of the time in rounds 1–9 but 71% by the end, so fixed rates miss something. More copying alone (30%) doesn't fix it.

## Step 2: map which habits work

This sweep uses no name preference and 40 seeds per cell, 100 rounds. Each cell is the share of populations that reach a convention (above 90% on one name for 5 rounds).

**Win-stay 0.86 (as measured):** 0% in *every* cell, whatever the copy and explore rates.

**Win-stay 1.0 (always repeat a winning name):**

| copy ↓ / explore → | 0% | 2% | 5% | 10% | 26% |
|---|---|---|---|---|---|
| 0% | 0% | 0% | 0% | 0% | 0% |
| 10% | 23% | 10% | 5% | 0% | 0% |
| 20% | 60% | 13% | 0% | 0% | 0% |
| 30% | 68% | 45% | 20% | 3% | 0% |
| **50%** | **90%** | 55% | 23% | 0% | 0% |
| 70% | 58% | 43% | 5% | 0% | 0% |
| 90% | 23% | 0% | 0% | 0% | · |

## What this explains

1. **Noise sets a ceiling on consensus, and ours sits below the threshold.** With win-stay 0.86, even a population that fully agrees loses about 14% of its agents to wandering every round: about 3.4 of 24. "Converged" means above 90%, at most 2 strays. So it's arithmetically out of reach. **This is a property of the measure as much as of the agents.** A sampled model (T=0.7) may never pass a 0.9 threshold even when there is clearly a convention. This affects the pre-registered convergence rule. I won't change it after the fact, but every note will also report the consensus level reached, and the question of whether a *stable majority* formed.
2. **You must copy sometimes.** With 0% copying nothing converges: nobody ever joins anyone.
3. **But not too much.** 90% copy is worse than 50%. If both partners in a mismatch copy each other, they swap names and mismatch again. Stubbornness in moderation is what lets one name win.
4. **Exploration is poison with 10 names.** 10% random exploration kills almost all convergence. The LLM's measured 26% is far past that line.

## Open question → probes

Win-stay was measured in a population that never agreed. An agent whose memory is 5 wins in a row on Q may repeat Q far more than 86% of the time. The direct test is to give the model scripted memories and count its answers. The next step is a probe page.
