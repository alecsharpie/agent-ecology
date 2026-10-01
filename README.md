# Agent ecology

A small in-browser lab for studying emergent behaviour in populations of LLM agents.

The first experiment replicates Ashery, Aiello & Baronchelli, "Emergent social conventions and collective bias in LLM populations" (*Science Advances* 11(20), 2025). The difference is that it uses 0.5–1.5B models running locally on WebGPU instead of frontier APIs.

- [`PLAN-naming-game.md`](PLAN-naming-game.md): the experimental plan and progress log.
- [`notes/`](notes/): experiment notes, one file per experiment, plus a running journal.
- [`lab/`](lab/): the code. It's Vite + TypeScript, with WebLLM for inference.
- `agent-ecology.html`: the Agent Ecology Field Guide.

Start with the interactive explainer, [`article/how-crowds-make-up-their-minds.html`](article/how-crowds-make-up-their-minds.html), or [`notes/README.md`](notes/README.md): it opens with a plain-language summary of what we've learned so far.

## Pages (with `npm run dev`)

- `/`: the naming game. Run or view a seed; click any agent to see the exact prompt it saw and what it answered; replay round by round.
- `/probe.html`: scripted-memory probes. What does one agent do after five wins, or five losses?
- `/cascade.html`: information cascades with LLM players.

## Running it

```sh
cd lab
npm install
npm test            # fake-model tests, no GPU
npm run rule        # condition R: rule-based agents, runs in Node in seconds
npm run dev         # the lab page at http://localhost:5190 (needs WebGPU: recent Chrome)
CONDS=B SEEDS=0-4 node scripts/run-headless.mjs   # unattended runs; needs `npm run dev`
nohup sh scripts/queue.sh > queue.log 2>&1 &       # a list of headless jobs; each resumes from its checkpoint
```

Every LLM call is recorded (pool order, raw output, parsed name, payoff, timing) in `lab/public/results/`. All metrics are computed from those logs, so any analysis can be re-run without re-running a model.
