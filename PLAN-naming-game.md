# Naming game in the browser: replication plan

First experiment for a small in-browser lab on agent populations. It replicates the core findings of Ashery, Aiello & Baronchelli, "Emergent social conventions and collective bias in LLM populations" (*Science Advances* 11(20), 2025, doi:10.1126/sciadv.adu9368). The difference is that it uses 0.5–1.5B models running in the browser on WebGPU instead of frontier APIs.

## Questions

1. **Convention.** Does a population of small LLM agents, playing repeated pairwise coordination games with only local memory, converge on one shared name?
2. **Collective bias.** Does the population favour names that no single agent prefers when it has no memory? In other words, is the group's bias different from the sum of individual biases?
3. **Tipping.** Once a convention exists, how large must a committed minority be to overturn it? Is there a critical mass?
4. **Monoculture vs diversity.** Do clone populations (one model, greedy decoding) behave differently from sampled or mixed-model populations?

## Protocol (follows the paper, simplified)

- **Population.** N = 24 agents. Every agent is the same loaded model with its own memory. No personas.
- **Name pool.** K = 10 candidate names, for example single letters. The order is shuffled on every call so that position bias cannot pass for name preference.
- **Round.** Pair the agents at random (12 pairs). Each agent privately picks one name from the pool. If both picked the same name, both get +100; otherwise both get −50. Each agent sees only its own outcome.
- **Memory.** Each agent's prompt shows its last M = 5 interactions: what it played, what its partner played, and the payoff. It carries nothing else and cannot see other pairs.
- **Output.** A single name, decoded under a JSON schema whose value is an enum of the pool. `agentic-evals` already supports `jsonSchema` in `CompletionOpts`. Use max tokens of about 16. Parse failures should then be near zero, and are logged if they happen.
- **Run length.** 40 rounds = 960 calls. At about 1–3 s per short constrained call, that is roughly 20–45 minutes per run.

### Conditions

| ID | Condition | Purpose |
|---|---|---|
| A | Qwen2.5 1.5B, temperature 0 | Clone population (strict monoculture) |
| B | Qwen2.5 1.5B, temperature 0.7 | Same model, sampling diversity |
| C | Qwen2.5 0.5B, temperature 0.7 | Is there a capability floor for conventions? |
| D | Llama 3.2 1B, temperature 0.7 | Different model family |
| E | Half Qwen2.5 1.5B, half Llama 3.2 1B, temperature 0.7 | Mixed population |
| R | Rule-based minimal naming game (Baronchelli et al. 2006), in plain JS | Reference dynamics with no LLM, as in `swarm` |

Run 5 seeds per condition to start. Condition R is free, so run 200 seeds for it.

**Mixed populations and the engine.** WebLLM holds one model at a time. Pairs are fixed at the start of each round, so collect every prompt for the round, run model A's batch, swap, then run model B's batch. Measure the swap cost once before relying on this. If swapping is too slow, drop condition E from the first pass.

### Tipping sub-experiment

Take populations from condition B that reached consensus, above 90% on one name. Make a fraction f of agents committed: they always play one chosen alternative name. Sweep f over {0, 5, 10, 20, 30, 40}% and run 30 more rounds each. Measure whether the alternative becomes the majority.

### Individual-bias baseline

For each model, ask 200 fresh agents (empty memory, shuffled pool) to pick a name. This gives the individual preference distribution to compare against.

## Measures

- **Consensus.** Share of the last 5 rounds' plays that went to the modal name. Say a run has converged when this stays above 0.9 for 5 consecutive rounds.
- **Time to convergence.** Rounds until that point, or censored at 40.
- **Collective bias.** Across seeds, the distribution of which name won, compared with the individual-bias baseline. Report the total variation distance and an exact multinomial or permutation test. The paper's claim is that these differ.
- **Tipping curve.** The share of runs flipped at each f, with Wilson intervals, to locate the critical mass.
- **Diversity check.** Compare A (clones) with B (sampled) and with E (mixed) on convergence time and on the variety of names that win.

## Validity checks (lessons from `agentic-evals`)

- **Commit predictions first.** Write them into a `predictions.ts` before any run, as `variants.ts` does, and grade them in the write-up. Suggested starting predictions, to edit before running:
  1. B converges in most seeds within 40 rounds.
  2. A (clones) converges faster than B but always on the same name.
  3. C (0.5B) mostly fails to converge.
  4. The winning-name distribution differs from the individual-bias baseline.
  5. Critical mass falls somewhere between 10% and 30%.
- **Position bias.** Shuffling the pool on every call handles most of it. Also log the index at which each chosen name appeared, and report position against choice.
- **Prompt overlap.** `agentic-evals` Part 4 found effects that came from the prompt, not the models. So run two prompt wordings, and a fresh name pool: nonsense words instead of letters. Only report an effect that survives both.
- **Greedy is a best case.** Report sampled results as the main result. Treat greedy as the clone condition, not the default.
- **Determinism.** Reuse `check-determinism.mjs` on a few greedy runs, so that condition A really is a clone population.
- **Scoring separate from running.** Store every call: prompt, raw output, parsed name, payoff and timings. Metrics then come from a rescore step without re-running any model.

## Reuse from `me/agentic-evals`

| File | Use |
|---|---|
| `src/lib/llm.ts` and `llm.worker.ts` | WebLLM engine in a worker, streaming, JSON-schema decoding |
| `src/lib/types.ts` (`LLM`, `ChatMessage`, `CompletionOpts`) | Model interface, so a scripted fake model can drive tests |
| `src/lib/stats.ts` (`wilson`, `signTest`, `median`) | Intervals and paired tests |
| `scripts/run-headless.mjs` | Long runs in headless Chromium with WebGPU, resume and retry |
| `scripts/check-determinism.mjs` | Token-exact replay check |
| `vite.config.ts` save endpoint | Writing a recorded run to `public/results/` |

Presentation can borrow from `me/swarm`: print the running rule from the live code, and label every parameter by its source (paper, measured, or chosen to illustrate).

## Project layout (new, in `me/agent-ecology/lab`)

```
lab/
  src/lib/llm.ts, llm.worker.ts, types.ts, stats.ts   (copied)
  src/games/naming.ts      prompt builder, schema, payoff, memory
  src/games/naming-rule.ts rule-based baseline (condition R)
  src/sim/population.ts    pairing, rounds, commitment, mixed-model batching
  src/sim/record.ts        run log format + save
  src/analysis/naming.ts   consensus, convergence, bias, tipping (pure functions)
  src/predictions.ts       committed before first run
  src/ui/                  live view: population grid coloured by current name, consensus curve
  test/                    fake-model tests for pairing, payoff, memory window, parsing
```

## First session checklist

1. Scaffold `lab/` with Vite and TypeScript, copy the reused files, and get the fake-model tests passing.
2. Build condition R first. It checks the pairing, payoff, memory and metrics code with no GPU.
3. Commit `predictions.ts`.
4. Run the individual-bias baseline for Qwen2.5 1.5B, then one seed of condition B, and look at the traces before scaling up.
5. Run the full grid headless. Then run the tipping sweep.
6. Do the analysis and write-up, then link it from the Agent Ecology Field Guide's "lab evidence" table.

## Budget

Conditions A–E × 5 seeds × about 960 calls ≈ 24k calls. Add the baselines and the tipping sweep, about 10k more calls. At 1–3 s each, that is roughly 10–30 GPU-hours on an M3. Before committing to the full grid, time the first seed and cut to N = 16 or 30 rounds if needed.

## Progress log

### 2026-09-30: session 1 (checklist steps 1–3 done)

- `lab/` is scaffolded: Vite + TS, 14 fake-model tests passing (`npm test`), and a clean typecheck. The tests caught one real bug: `logs.map(convergence)` passed the array index as the threshold.
- Condition R was run: `npm run rule`, 200 seeds, 4 s, summary in `lab/public/results/rule.json`. It uses two rule agents. The "majority" agent sees exactly what an LLM agent sees and plays the name its last 5 partners played most often. The other is the classic Baronchelli minimal naming game.
  - Convergence: 195/200 seeds, median 19 rounds. The classic minimal naming game takes a median of 21 round-equivalents.
  - Collective bias, null check: with no individual preference, winners match fresh picks (TVD 0.07, p = 0.97). Good, the test doesn't cry wolf.
  - Amplification: giving each agent a weak individual lean toward F (12% of fresh picks, versus about 10% for the others) makes F win 26% of runs (p = 0.014). A small individual bias becomes a large collective one.
  - Tipping: the flip is sharp. With 3 committed agents (12.5%), 0% of runs flip. With 4 (17%), 11% flip. With 5 (21%), 87% flip. With 10% noise the critical mass drops, and 4 agents flip 68%, because a noisy convention is less entrenched.
- The LLM page is built (`npm run dev`, then http://localhost:5190). It saves every round to `public/results/` and resumes after a crash. The headless driver is `scripts/run-headless.mjs`.
- `src/predictions.ts` is a draft. Edit it and set `frozenAt` **before** the first LLM run.
- Next: step 4, the individual baseline for Qwen2.5 1.5B, then one seed of B. Read the traces before scaling up.
