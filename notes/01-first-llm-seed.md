# 01: Condition B: Qwen2.5 1.5B, T=0.7 (seeds 0–2)

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

## Seeds 1 and 2 (headless, about 18 min each)

| Seed | Converged (>0.9 for 5 rounds) | Mean consensus, last 10 rounds | Leading name, last 10 rounds | Runner-up | Win-stay | After a mismatch: copy / keep / other |
|---|---|---|---|---|---|---|
| 0 | no | 0.39 | Q 39% | T 34% | 87% | 3% / 71% / 26% |
| 1 | no | 0.55 | **Q 55%** (majority) | T 34% | 86% | 4% / 64% / 32% |
| 2 | no | 0.50 | **Q 50%** | T 25% | 82% | 4% / 66% / 30% |

- **The same story three times.** No seed passes the pre-registered bar, but Q gains ground in all three, and in seeds 1 and 2 it holds a majority by the end. The agents' habits are almost identical across seeds, which suggests they are a property of the model and prompt, not of the run.
- **Q wins even from behind.** In seed 2, Z led round 1 (8 of 24 agents) and Q had only 5. By round 10 Q was ahead and Z had faded. The model's own preference for Q ([05](05-individual-bias.md)) keeps feeding Q through the "try a different name" choices, since fresh picks favour Q.
- **Collective bias, tentatively.** Q is 28% of solo picks but led all 3 populations. If population leaders simply followed the solo distribution, that would happen about 2% of the time (0.28³). That's a post-hoc number on 3 seeds, so exploratory, not a test. But it's the same shape as the rule-model result, where a weak individual lean doubled a name's win rate ([00](00-rule-baseline.md)): **amplification of an individual bias, not a bias that no individual has.**

## Against the frozen predictions

Prediction 1 ("B converges in most seeds within 40 rounds"): 0 of 3 so far. It needs at least 3 of 5, so it can no longer pass unless seeds 3 and 4 both converge, which looks unlikely. By the pre-registered rule it is heading for **wrong**. Note [06](06-habits.md) shows the rule itself may be out of reach for sampled agents. That caveat will be reported next to the grade, not used to change it.

## What to try next (exploratory, labelled as such)

1. **More seeds of B.** Is freezing typical, or bad luck?
2. **The "tally" wording.** Add one line: "your partners picked Q 3 times, T 2 times". If agents then converge, the problem is *extracting* the signal from a list, not the strategy.
3. **Longer runs.** The paper's populations played far longer. Two frozen camps might eventually tip, since round 40 ended at the highest consensus of the run.
