# 04: The El Farol bar

**Code:** `lab/src/games/el-farol.ts`. **Run:** `cd lab && node --experimental-strip-types scripts/run-el-farol.ts` (a few seconds). **Data:** `lab/public/results/el-farol.json`.
**Reproduces:** Arthur (1994), "Inductive reasoning and bounded rationality", *American Economic Review*.

## The question

100 people each decide, every week, whether to go to a bar. It's fun if 60 or fewer go and miserable if more do. Nobody talks. There's no right forecast to deduce: if everyone predicted "quiet", everyone would go and it would be packed. Can the crowd still regulate itself?

## The rules, in plain words

- There is a bag of 21 simple forecasting rules: "same as last week", "average of the last 4 weeks", "mirror of last week" (100 minus it), "trend of the last 3", "always 55", and so on.
- Each agent gets *k* rules at random. Each week it uses whichever of its rules has been most accurate lately (errors fade by 10% a week), and goes if that rule forecasts ≤ 60.
- The comparisons: everyone given the *same single* rule (a monoculture), and everyone flipping a biased coin (go with probability 0.6).

## What happened (50 seeds, weeks 51–300)

| Population | Mean attendance | Swing (sd) | Crowded weeks | Seats enjoyed* |
|---|---|---|---|---|
| diverse, 1 rule each | 60.0 | 13.5 | 48% | 42% |
| diverse, 3 rules each | 58.7 | 16.2 | 51% | 37% |
| diverse, 6 rules each (Arthur's setup) | 59.0 | 18.6 | 49% | 38% |
| diverse, 12 rules each | 57.1 | 30.6 | 49% | 25% |
| monoculture: "same as last week" | 50.0 | 50.0 | 50% | **0%** |
| monoculture: "average of last 4" | 60.0 | 49.0 | 60% | **0%** |
| coin flips, p = 0.6 | 60.0 | 4.9 | 46% | 51% |

\*Average attendance on good nights as a share of capacity; crowded nights count as zero.

## What I learned

1. **Arthur's headline holds.** With diverse rules, mean attendance self-organises to about 60, the capacity, even though no rule "knows" 60 is the answer.
2. **A monoculture fails completely.** If everyone forecasts the same way, everyone makes the same decision, so it's 100 or 0 every week. Nobody ever enjoys a seat. Diversity isn't decoration here; it's the mechanism. This is the same question as condition A (clones) in the naming game, and El Farol is a case where clones should do *worse*.
3. **The self-organisation is not by good forecasting.** In the final week of seed 0, 52 of 100 agents trusted "always 55" or "always 67", rules that amount to "I always go" or "I never go". The crowd regulates itself mostly by sorting into regulars and stay-at-homes, with the forecasters adjusting at the margin.
4. **The swings are bigger than pure chance, and grow with more rules per agent.** Coin flips give sd 4.9; Arthur's setup gives 18.6. More rules make agents more reactive: they switch to whichever rule just did well, all at the same time, which is herding. This matches what the minority-game literature reports (volatility above the random baseline when agents hold many strategies), but I haven't checked that literature in detail; treat the link as a lead.

## Caveats

- The bag of rules is mine, in Arthur's spirit; his exact list isn't reproduced. The mean-near-60 result is robust to that; the size of the swings probably isn't.
- One capacity (60) and one discount (0.9) only.
