# 09: Information cascades with an LLM (Qwen2.5 1.5B)

**Page:** `lab/cascade.html`. **Data:** `lab/public/results/cascade-qwen2-5-1-5b-instruct-t07.json`. **Rule-based reference:** [03](03-information-cascades.md).

## The question

In the urn game, rational players herd into a wrong answer about 1 time in 5 ([03](03-information-cascades.md)). Where does a small language model sit between "ignore others", "rational herding" and something else?

## Version 1: urns named "A" and "B"

The prompt describes both urns ("Urn A contains 2 red balls and 1 blue ball…"), tells the player the colour of their ball and the earlier guesses, and asks for "A" or "B". The colour-to-urn mapping and the order the urns are described in are counterbalanced across sequences. 88 sequences of 10 players, temperature 0.7.

| Measure | Qwen2.5 1.5B | Follow-own-ball player | Rational player |
|---|---|---|---|
| **Player 1** (no social information) guesses their own ball's urn | **52%** | 100% | 100% |
| Accuracy over all guesses | **49%** | 67% | 76% |
| Guesses own ball's urn when there's no rational cascade | 48% | 100% | 100% |
| Same guess as the previous player | 54% | – | – |
| Guessed "A" | 54% (65% for player 1) | 50% | 50% |

**Result: chance level.** The model doesn't link "I drew a red ball" to "the urn with more red balls", even with no social information to confuse it. So there's no herding to study. The one systematic signal is a mild lean toward answering "A" (65% for player 1), the same kind of label/position bias as in the naming game ([05](05-individual-bias.md)).

## Protocol note (honesty)

The page hot-reloaded at sequence 89, because I edited code it imports. It resumed from its checkpoint, but sequences 89–100 ran with a slightly changed prompt (answer options listed in the order the urns were described). Only sequences 0–87 are analysed as version 1. Lesson: never edit modules a running experiment imports.

## Version 2: urns named by their majority colour (queued)

"The red urn contains 2 red balls and 1 blue ball…". Earlier guesses are reported as "red, red, blue", and the answer is a colour. Following your own ball now means just repeating its colour. If the model still can't do that, it can't play this game at all. If it can, the interesting part begins: when earlier guesses say "blue, blue" and you drew red, do you follow the crowd?

## What this says about emergence with small models

A population can only show a social phenomenon if its members can do the individual step first. In the naming game the individual step is trivial ("say a name"), so we see population dynamics, albeit stubborn ones. In the cascade game the individual step is an inference that 1.5B parameters apparently can't make in this framing. **Capability floors decide which collective phenomena are even reachable.** That's the same question as condition C (0.5B) in the plan.
