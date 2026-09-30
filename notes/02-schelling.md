# 02: Schelling segregation

**Code:** `lab/src/games/schelling.ts`. **Run:** `cd lab && npm run schelling` (seconds). **Data:** `lab/public/results/schelling.json`.
**Reproduces:** Schelling (1971), "Dynamic models of segregation", *J. Math. Sociology*.

## The question

If nobody minds being in the minority, can a city still end up segregated?

## The rules, in plain words

- A 30×30 grid is 90% full of two kinds of agents, `#` and `o`, placed at random.
- Each agent looks at its (up to) 8 neighbours. It is **content** if at least a share *t* of them are its own kind.
- Each step, every discontented agent moves to a random empty cell. Repeat until everyone is content.

With *t* = 30%, an agent is perfectly happy as a 1-in-3 minority. Nobody wants segregation.

## What happened (50 seeds per row)

| Content if ≥ this share alike | Similar neighbours: start → end | Settled |
|---|---|---|
| 0% | 50% → 50% | 50/50 |
| 25% | 50% → 59% | 50/50 |
| **30%** | **50% → 76%** | 50/50 |
| 50% | 50% → 87% | 50/50 |
| 62.5% | 50% → 98% | 47/50 |
| 75% | 50% → 99% | 41/50 |
| 87.5% | 50% → 53% | 0/50 |

Seed 0 at 30%, before and after 11 steps:

```
before                           after
oo###o.###oo#.oo#ooooo###o#o.o   oo###oo###.###oooooooo#####..o
ooo#oo##oo##o#ooo#o.o#oo####oo   ooo#oo###.####ooooooo..#####oo
oo##o.o##o###o.###o#oo###o#oo#   oo..ooo##.###ooo..o.oo###o#ooo
ooo#ooo###ooo#oo.oo#o##oooooo#   ooooooo###.###ooooooo##.ooooo.
ooo#ooo##oo####o#.#o.o#o###o##   ooo.ooo##oo####o.o.o.o#o.ooooo
```

(Top 5 rows shown. The full grids are printed by the script.)

## Why it happens

A move is local, but it has two side effects. The mover leaves a spot that is now *less* diverse, and arrives at a spot that is now more mixed. The neighbours it left behind may tip below their threshold and move too. Each move nudges the next, and the process only stops when everybody is content. The configurations where everyone is content at 30% are overwhelmingly clustered ones, so that's where the dynamics end up.

**Micro preference: "I'd like 30% like me." Macro outcome: about 76% like me.** You cannot read the macro pattern off the individual rule, and that gap is what "emergent" means.

## Two surprises

- **The response to *t* is not smooth.** It jumps between 25% and 30% (59% → 76%). Small changes in individual tolerance can cause large changes in collective structure, just like the tipping cliff in the naming game ([00](00-rule-baseline.md)).
- **Extreme intolerance (87.5%) produces *less* segregation.** Almost nobody can be content, so everyone keeps moving at random and the grid stays mixed. Gridlock, not order.

## Link to LLM agents

The obvious next step: replace the threshold with an LLM agent that sees its neighbourhood and decides whether to move. Does a model that says it values diversity still segregate? That's a candidate GPU experiment; see the plan.
