# 00: Rule-based reference (condition R)

**Date:** 2026-09-30. **Code:** `lab/scripts/run-rule.ts`. **Data:** `lab/public/results/rule.json`. **Rerun:** `cd lab && npm run rule` (about 4 s).

## Why

This is the reference dynamics, with no model involved. It exercises the same pairing, memory, payoff and metric code the LLM runs use, so any bug shows up here first. It also shows what "emergence" looks like when we know exactly what every agent does.

## Setup

N = 24 agents, K = 10 names (letters), memory M = 5, 40 rounds, 200 seeds.

- **Majority agent.** It sees exactly what an LLM agent sees and plays the name its last 5 partners played most often. Ties are broken at random. With empty memory it picks uniformly.
- **Variants:** 10% noise (a random name instead); a weak individual prior toward F (weight 1.5, versus 1 for the other nine names).
- **Classic minimal naming game** (Baronchelli et al. 2006) for comparison: speaker/hearer pairs with inventories that collapse on success.

## Results

| Variant | Converged | Median rounds to converge | Consensus at rounds 1 / 11 / 21 / 40 |
|---|---|---|---|
| Majority | 195/200 | 19 | 0.21 / 0.55 / 0.92 / 1.00 |
| Majority + 10% noise | 136/200 | 27 | 0.21 / 0.45 / 0.78 / 0.90 |
| Classic minimal naming game | 200/200 | 21 (round-equivalents) | — |

**Collective bias.**

- *Null check:* with no individual preference, the distribution of winning names matches the fresh-agent picks (TVD 0.07, permutation p = 0.97). The test does not flag a bias that isn't there.
- *Amplification:* with the weak individual lean, F is 12% of fresh picks (about 10% would be uniform) but wins **26%** of runs (TVD 0.19, p = 0.014).

**Tipping.** Committed agents always play a new name, for 30 extra rounds after consensus. A run "flips" if the new name holds a majority of the last 5 rounds' plays.

| Committed agents | 0 | 1 | 2 | 3 | 4 | 5 | 7 | 10 |
|---|---|---|---|---|---|---|---|---|
| Majority | 0% | 0% | 0% | 0% | 11% | 87% | 100% | 100% |
| + 10% noise | 0% | 0% | 0% | 2% | 68% | 100% | 100% | 100% |

## What I learned

1. **Agreement is emergent.** No agent sees more than 5 of its own past meetings, yet the whole population locks onto one name. Early on the curve is flat, then it rises steeply once one name gets a lead.
2. **Small individual biases compound.** A preference too weak to notice in one agent (12% versus 10%) more than doubles that name's share of winning conventions. So "collective bias" can emerge from weak individual biases, not only from none.
3. **Tipping is a cliff.** The threshold sits between 4 and 5 committed agents (17–21%). Below it the minority is absorbed; above it the flip is nearly certain.
4. **Noise lowers the critical mass.** A noisy convention is less entrenched, because memories contain some off-convention plays, so a minority tips it more easily.

## Caveats

These agents are much simpler than LLMs. The point is a baseline for the *shape* of the curves, not the numbers.
