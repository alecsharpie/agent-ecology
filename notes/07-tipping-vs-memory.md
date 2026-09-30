# 07: Critical mass depends on memory length

**Code:** `lab/scripts/run-tipping-memory.ts` (about 10 s, CPU). **Data:** `lab/public/results/tipping-memory.json`.
**Context:** Centola, Becker, Brackbill & Baronchelli (2018), "Experimental evidence for tipping points in social convention", *Science*. In human groups playing a naming game, a committed minority of about 25% overturned an established convention. Ashery et al. (2025) ask the same question of LLM populations.

## The question

Our rule agents with memory 5 tipped at 5 committed agents out of 24 (21%, [00](00-rule-baseline.md)). Is that number a property of "conventions", or of how much the agents remember?

## Setup

24 majority agents (play what your last *M* partners played most often), 100 seeds. First 60 rounds to reach a convention, then *k* agents are committed to a new name for 40 rounds. A population "flips" if the new name holds a majority at the end.

## Results

| Memory *M* | k=1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | Critical mass (flip > 50%) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | never converges | | | | | | | | – |
| 2 | 100% | 100% | … | | | | | | 1 agent, but only 6/100 converged at all |
| 3 | 0 | 0 | 64 | 100 | 100 | | | | **3 agents (13%)** |
| 5 | 0 | 0 | 0 | 23 | 99 | 100 | | | **5 agents (21%)** |
| 8 | 0 | 0 | 0 | 0 | 31 | 93 | 99 | 100 | **6 agents (25%)** |
| 12 | 0 | 0 | 0 | 0 | 0 | 13 | 82 | 100 | **7 agents (29%)** |

## What I learned

1. **Memory is inertia.** The longer agents remember, the more committed agents it takes to shift them. It rises steadily from 13% to 29%. A convention is harder to overturn when everyone carries a long record of it working.
2. **Too little memory, no convention at all.** With M = 1 an agent just copies its last partner. Two mismatched partners copy each other, swap names, and mismatch again, so nothing settles. With M = 2, 94 of 100 populations never converge, and the few that do are overturned by a single committed agent.
3. **The tipping point is always a cliff.** At every memory length the flip rate jumps from about 0% to about 100% within 1–2 agents. That sharpness is the signature of a tipping point, not a gradual shift.
4. **Memory 8 lands at 25%**, close to what Centola et al. found in people. I would not read much into that: the rule, the pool size and the population size all move the number. But it shows a critical mass in the 20–30% range falls out of very simple agents.

## For the LLM tipping experiment

The LLM agents use M = 5, so on this model the reference is about 21%. But the LLM agents are much stickier than majority agents ([01](01-first-llm-seed.md), [06](06-habits.md)): they keep their own name 71% of the time after a loss. Stubbornness should raise the critical mass, and could remove the cliff altogether. That's a sharp prediction the LLM run can test, once a population actually converges.
