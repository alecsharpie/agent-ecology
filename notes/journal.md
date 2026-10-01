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

## 2026-10-01

- Tally variant, seeds 0–1 (paired): consensus 0.39 → 0.64 and 0.55 → 0.65, always Q; copying 3–4% → 10–12%. Still no convergence.
- Probes: the model plays its own previous name 92% of the time even after 5 losses to partners who all played Y. The tally line adds scatter, not copying.
- Key finding: copying is 2.5–3× higher when the partner's name is Q, the model's favourite. That's content-biased transmission, the mechanism for Q's lead. See [08](08-probes-and-biased-copying.md).
- LLM cascades v1 (urns named A/B): chance level, with player 1 following its own ball 52% of the time. The page hot-reloaded at sequence 89 after I edited an imported module; only 0–87 are analysed. v2 (urns named by colour) queued after A and D. See [09](09-llm-cascades.md).
- Condition A (greedy Qwen), seeds 0–1: frozen solid (identical counts in rounds 20/30/40), led by T and Q. Condition D (Llama 1B), seed 0: the opposite, fickle (win-stay 32%, explores 87% after a loss), consensus at chance. See [10](10-stubborn-vs-fickle.md).
- The chained background queue hit the 2-hour limit and was killed during D seed 1 (10 rounds saved). Replaced it with `lab/scripts/queue.sh`, run under nohup; all jobs resume from checkpoints, so nothing was lost.
- D seed 1: fickle again (win-stay 38%, explores 90% after a mismatch). Cascade v2 (colour labels): player 1 follows its ball 70% of the time; smooth conformity curve; group accuracy 52%, worse than no social info (67%). Added SVG figures (`npm run figures`).
- Condition C (Qwen 0.5B), seeds 0–1: copies partners most (21–23%) but win-stay only about 53%; consensus 0.33; drifts to W/J, not Q/T. Queued baselines for C and D to test the 'drift to own favourites' idea.
- **Prompt-overlap check (B seed 0):** the plain wording makes Qwen fickle (win-stay 12%, explores 92%); the nonsense pool makes it frozen-stubborn (three camps; 21/24 pick the first option in round 1). 'Stubborn vs fickle' is model × prompt, not model; note 10 corrected. Robust across all: copying stays 2–4%, no convergence. Queued plain-wording probes.
- Cascade robustness: Llama shows the same smooth conformity (group 60% < 67% independent). Greedy Qwen herds as a perfect step at the rational threshold, but player 1 always says 'blue' → 41% wrong lock-ins. Llama probes (game wording): only 30% stick after 5 wins.
- Baselines for Qwen 0.5B (W, J favoured) and Llama 1B (Q, M, Z). Qwen 0.5B populations drift to W/J, matching its solo favourites. Plain-wording probes: any loss triggers scatter (78% after mixed losses). Starting the rest of the pre-registered grid (queue5).
- Pre-registered grid complete (queue5): A, B, C, D, E × 5 seeds = 25 runs, **0 converged**. B: Q leads 4/5. A: Q or T always (T 3, Q 2). C: W and J are the top two in 5/5. D: diffuse, near chance. E (mixed): near chance, led by Q/T/Z, a blend of both models' favourites.
- Final grading: P1 wrong (0/5), P2 wrong (0/5, leaders split), P3 right but trivially, P4 can't be graded as written (no winners), P5 can't be tested on models (nothing to tip).
- Wrote the interactive explainer in `article/` ("How Crowds Make Up Their Minds").
- Size ladder (2026-10-02): partner-only memory removes 1.5B's self-repetition but doesn't create copying. Probes: copying switches on at 7B (63%) and is complete at Gemma 26B/31B (98–100%); Qwen 3B ignores memory (position only). **Gemma 4 26B population converged** (seed 0, round 21, on F). Gemini 3.8 Flash blocked by the free-tier quota (20/day). See [11](11-size-ladder.md).
