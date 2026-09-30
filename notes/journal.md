# Journal

Running log, newest last. Decisions, surprises and dead ends go here. Results go in the numbered notes.

## 2026-09-30

- Built `lab/` and condition R (see [00](00-rule-baseline.md)).
- Fixed a bug in `summarise`: `logs.map(convergence)` passed the array index as the `threshold`. A test caught it.
- Alec started seed 0 of condition B from the page. The model download (about 900 MB) was the slow part. After that, calls take about 0.5–1.3 s each.
- Froze `lab/src/predictions.ts` unchanged from the plan's draft (22:30). Honesty note: seed 0 of B was at round 6 of 40 when they were frozen, with consensus still near chance, so the freeze was not informed by any convergence result.
- Seed 0 of B finished (22:47): **no convergence**, two frozen camps (Q and T). Agents keep their own name 71% of the time after a mismatch and copy the partner 3%. See [01](01-first-llm-seed.md).
- Found and fixed a dev-server bug: `server.watch.ignored` on `public/results` meant runs saved after startup were never served, so resume would silently restart from round 1. Results are now read straight from disk.
- Added three rule-based reproductions for context: Schelling ([02](02-schelling.md)), information cascades ([03](03-information-cascades.md)), El Farol ([04](04-el-farol.md)). The cascade theory check first missed by 2.5 standard errors. Cause: a cascade formed by the last two players has no one after them to reveal it.
- Page now explains itself: a "how this works" box, click an agent to see its prompt and answer, a round replay slider, a loading bar with time left.
- Next in the headless queue: the individual baseline (Qwen 1.5B), B seeds 1–2, then the tally variant.
- Individual baseline done (headless, 2 min): 62% pick the first-listed name; Q is favoured (28%, and 19/19 when shown first). See [05](05-individual-bias.md). Queued: B seeds 1–2, then the tally variant on seeds 0–1.
- Built a "habit agent" from the LLM's measured reactions: it freezes too (0/200 converge over 400 rounds), but at lower consensus than the LLM. Phase diagram: win-stay < 1 makes the 0.9 threshold unreachable; copying helps up to about 50% and hurts beyond (swap oscillation); 10% exploration already kills convergence. See [06](06-habits.md).
- **Methodological flag:** the pre-registered convergence rule (above 0.9 for 5 rounds) may be unreachable for any sampled (T=0.7) population. I'm not changing it; I'm adding reports of the consensus level and stable majorities alongside it.
- Critical mass vs memory (CPU): 13% at M=3, 21% at M=5, 25% at M=8, 29% at M=12; M ≤ 2 barely converges. Always a cliff. See [07](07-tipping-vs-memory.md).
- B seeds 1–2 done: no convergence, but Q leads in all 3 seeds (majority in 2), even overtaking an early Z lead in seed 2. Tentative amplification of the individual Q preference. Prediction 1 is heading for wrong.
