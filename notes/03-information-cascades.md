# 03: Information cascades

**Code:** `lab/src/games/cascade.ts`. **Run:** `cd lab && node --experimental-strip-types scripts/run-cascade.ts` (about 1 s). **Data:** `lab/public/results/cascade.json`.
**Reproduces:** Bikhchandani, Hirshleifer & Welch (1992), "A theory of fads, fashion, custom, and cultural change as informational cascades"; lab design from Anderson & Holt (1997).

## The question

Can a group of people who are each individually sensible, and who each hold real evidence, all end up confidently wrong?

## The game, in plain words

- A coin flip picks urn **A** (2 `a` balls, 1 `b`) or urn **B** (1 `a`, 2 `b`).
- 10 players go one at a time. Each privately draws a ball, which points to the right urn 2 times in 3.
- Each player sees everyone's earlier *guesses* (not their balls), then guesses publicly.

## Four kinds of player

| Player | Rule |
|---|---|
| own | Ignores everyone and guesses from their own ball. |
| bayes | Textbook rational. Earlier guesses reveal balls, *until* the revealed count leads by 2. After that, everyone follows the lead whatever they drew (a cascade), so their guesses reveal nothing. |
| majority | Counts earlier guesses as if they were balls, then adds their own. |
| stubborn | Follows their own ball unless earlier guesses lead the other way by 3 or more. |

## What happened (10,000 sequences each)

| Player | Accuracy, player 1 → player 10 | Group accuracy | Wrong cascade | Guessed against own ball |
|---|---|---|---|---|
| own | 67% flat | 67% | 0% | 0% |
| bayes | 67 → 80% | 76% | **18.5%** | 26% |
| majority | identical to bayes | 76% | 18.5% | 26% |
| stubborn | 67 → 85% | 76% | 8.5% | 15% |

**Theory check.** For bayes, a cascade forms when two revealed balls in a row agree: both right has probability 4/9, both wrong 1/9, and a split (4/9) resets the count. A cascade is only visible if someone plays after it forms, so with 10 players 4 pairs count. That predicts a wrong-cascade rate of (1/9)(1 − (4/9)⁴)/(5/9) = **19.2%**. Measured: **18.7%** (within noise). My first theory line used 5 pairs and was off by 2.5 standard errors. Tracking that down is how the off-by-one in "who can see a cascade" came to light.

## Why it happens

Once two more players have guessed A than B (among those whose guesses still carry information), a rational player with a `b` ball reasons that the public evidence is 2 balls against their 1, so they should guess A. Correctly! But now their guess says nothing about their ball, so the next player faces exactly the same situation, and so on forever. **Everyone is individually rational, and the group has stopped learning.** In about 1 sequence in 5, the first two balls happened to mislead, and all 10 people end up wrong.

## Surprises

1. **Naive herding = rational herding, in this game.** Counting guesses as if they were balls gives exactly the same guesses as the full Bayesian reasoning in every one of the 10,000 sequences. The binary game can't tell sophisticated inference from simple copying. Worth remembering before crediting an LLM with "reasoning about others' information" in a setup like this.
2. **Stubbornness is a public good.** Stubborn players are less accurate early (player 3: 66% vs 75%), because they ignore good public information. But their guesses keep revealing their balls for longer, which halves wrong cascades (8.5%) and makes the *last* players more accurate (85% vs 80%). What's best for me now is not what's best for the group.

## Link to LLM agents

This is the most natural GPU experiment after the naming game. Each call is one guess (a short prompt: prior guesses + my ball), the rational benchmark is exact, and we can see where a small model sits between "own", "bayes" and "stubborn". Queued in the plan.
