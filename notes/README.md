# Experiment notes

## What we've learned so far (plain language)

*Updated as results come in. Each point links to the note with the evidence.*

1. **Simple agents do form conventions.** Agents that copy whatever their recent partners played most often agree on one name within about 20 rounds, with nobody in charge and nobody seeing the whole group ([00](00-rule-baseline.md)).
2. **Small language models, so far, do not fully converge, but one name does pull ahead.** In 3 of 3 runs, Qwen2.5 1.5B agents split into Q and T camps, and Q, the model's favourite name on its own, took the lead, reaching a majority in 2 runs ([01](01-first-llm-seed.md)). The reason is visible in their choices: after a mismatch they keep their own name 71% of the time and adopt their partner's only 3%.
3. **The camps weren't emergent; they were inherited.** On its own, with no history, the model already favours Q and T ([05](05-individual-bias.md)). It also picks the first name listed 62% of the time, which is why every prompt shuffles the list.
4. **What an agent needs for a convention to form** ([06](06-habits.md)): always repeat a winning name, sometimes (not always) copy a partner who beat you, and almost never pick at random. Sampled LLM agents wander off even after winning, and that noise alone can keep a population below our 90% "converged" line. That's a flag on the measure as well as on the agents.
5. **Tipping points are cliffs, and memory sets where the cliff is.** Overturning a convention takes 13–29% committed agents depending on how many rounds agents remember. Below that, nothing happens; a couple more agents, and it always flips ([00](00-rule-baseline.md), [07](07-tipping-vs-memory.md)).
6. **The same lesson shows up in three classic models.** Mild preferences produce strong segregation ([02](02-schelling.md)); rational people herd into wrong answers about 1 time in 5 ([03](03-information-cascades.md)); a crowd self-organises around a bar's capacity only if its members think differently, and a monoculture fails completely ([04](04-el-farol.md)).

## Index

Working notes, in the order they were written. [`journal.md`](journal.md) is the running log, and each experiment gets its own file.

| # | Note | Status |
|---|---|---|
| 00 | [Rule-based reference (condition R)](00-rule-baseline.md) | done |
| 01 | [Condition B: Qwen2.5 1.5B, T=0.7](01-first-llm-seed.md) | seeds 0–2 done |
| 02 | [Schelling segregation](02-schelling.md) | done (rule-based) |
| 03 | [Information cascades](03-information-cascades.md) | done (rule-based); LLM version planned |
| 04 | [El Farol bar](04-el-farol.md) | done (rule-based) |
| 05 | [Individual bias baseline (Qwen2.5 1.5B)](05-individual-bias.md) | done |
| 06 | [Habits: what an agent must do for a convention](06-habits.md) | done (CPU); probes next |
| 07 | [Critical mass depends on memory length](07-tipping-vs-memory.md) | done (CPU) |
