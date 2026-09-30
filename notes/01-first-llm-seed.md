# 01: First LLM seed: Qwen2.5 1.5B, T=0.7 (condition B, seed 0)

**Data:** `lab/public/results/naming-b-letters-game-s0.json`. **Inspect:** `npm run dev`, then open `http://localhost:5190/?cond=B&seed=0&go=view` and click any agent. **Analyse:** `npm run analyse -- public/results/naming-b-letters-game-s0.json`.

## Setup

This is the pre-registered protocol: 24 agents, all Qwen2.5 1.5B (4-bit, WebGPU) at temperature 0.7, letters pool, "game" wording, memory of 5 rounds, 40 rounds. 960 calls, median 1.1 s each, about 18 minutes on an M3. There were no parse failures: constrained decoding makes every answer a valid name.

## What happened

**No convention emerged.** Consensus rose from 0.25 to about 0.4, then flatlined. From round 15 on, the population sat in **two frozen camps**: about 9–11 agents on Q and about 8 on T, with a few scattered on F and Z.

```
round  consensus  most played
    1       0.25  Q×6 T×6 Z×3 X×2
   10       0.33  T×8 F×5 Q×5 Z×2
   20       0.33  T×8 Q×8 R×2 F×2
   30       0.33  T×8 Q×8 Z×3 F×3
   40       0.46  Q×11 T×8 F×3 Z×1
```

For comparison, the rule agents (note [00](00-rule-baseline.md)) reach 0.92 consensus by round 21.

## Why: how the agents decide

For every agent and every round, the analysis looks at what happened last time and what the agent did next:

| Last round was… | What the agent did next | LLM agents | Rule agents |
|---|---|---|---|
| a match | played the same name again | 87% | ~100% |
| a mismatch | switched to the partner's name | **3%** | often |
| a mismatch | kept its own name | **71%** | sometimes |
| a mismatch | tried a third name | 26% | rarely |

The LLM agents are **stubborn**. They almost never adopt what their partners are playing. A typical example is agent 5 in round 20. It played T five rounds running, lost four of them against partners who played Q, F, F and Q, and picked T again (click it in the page to see the exact prompt).

Stubbornness freezes a population. Once there are two big camps, a T agent meets a Q agent, both lose, and both keep their name. Nothing ever moves agents from one camp to the other. In the rule model, the loser adopts what it keeps seeing, which is what drains the smaller camp.

## Where did Q and T come from?

They were already the top two names in round 1, when every agent had empty memory. In round 1, 14 of 24 agents picked the *first* name shown and 8 the second, so position drives the empty-memory choice. But Q and T were each picked 6 times, well above the 2.4 you'd expect from 10 shuffled names. So the model seems to have a real prior for Q and T, even over position. The individual baseline (200 fresh agents) will measure this directly.

## Against the frozen predictions

Prediction 1 ("B converges in most seeds within 40 rounds") is off to a bad start: 0 of 1. One seed isn't a verdict. More seeds are running.

## What to try next (exploratory, labelled as such)

1. **More seeds of B.** Is freezing typical, or bad luck?
2. **The "tally" wording.** Add one line: "your partners picked Q 3 times, T 2 times". If agents then converge, the problem is *extracting* the signal from a list, not the strategy.
3. **Longer runs.** The paper's populations played far longer. Two frozen camps might eventually tip, since round 40 ended at the highest consensus of the run.
