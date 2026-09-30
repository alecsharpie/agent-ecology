# Journal

Running log, newest last. Decisions, surprises and dead ends go here. Results go in the numbered notes.

## 2026-09-30

- Built `lab/` and condition R (see [00](00-rule-baseline.md)).
- Fixed a bug in `summarise`: `logs.map(convergence)` passed the array index as the `threshold`. A test caught it.
- Alec started seed 0 of condition B from the page. The model download (about 900 MB) was the slow part. After that, calls take about 0.5–1.3 s each.
- Froze `lab/src/predictions.ts` unchanged from the plan's draft (22:30). Honesty note: seed 0 of B was at round 6 of 40 when they were frozen, with consensus still near chance, so the freeze was not informed by any convergence result.
