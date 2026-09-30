// The El Farol bar problem (Arthur 1994, "Inductive reasoning and bounded rationality").
//
// The point: 100 people each decide every week whether to go to a bar that is only fun
// if at most 60 go. Nobody communicates, and there is no correct forecast to deduce: if
// everyone believed "it'll be empty", everyone would go and it would be packed. Yet with
// a diverse ecology of simple forecasting rules, attendance hovers around 60 on its own.
// And if everyone uses the same rule, the self-organisation collapses into boom and bust.
//
// Rules, exactly:
//   - Each agent holds k predictors drawn at random from a shared bag of simple rules
//     ("same as last week", "average of the last 4 weeks", "mirror of 2 weeks ago", ...).
//   - Each week an agent forecasts attendance with the predictor that has been most
//     accurate recently (discounted absolute error), and goes if the forecast is ≤ capacity.
//   - After the week, every predictor an agent holds is scored against the real attendance.

import { makeRng, randInt, type Rng } from "../lib/rng.ts";

export interface Predictor {
  name: string;
  predict(history: readonly number[]): number;
}

const clamp = (x: number) => Math.max(0, Math.min(100, x));
const at = (h: readonly number[], k: number) => h[h.length - k] ?? 50;

/** The bag of forecasting rules, in the spirit of Arthur's list. */
export function predictorBag(): Predictor[] {
  const bag: Predictor[] = [];
  for (let k = 1; k <= 5; k++) bag.push({ name: `same as ${k} week${k > 1 ? "s" : ""} ago`, predict: (h) => at(h, k) });
  for (let k = 1; k <= 3; k++) bag.push({ name: `mirror of ${k} week${k > 1 ? "s" : ""} ago`, predict: (h) => 100 - at(h, k) });
  for (const k of [2, 3, 4, 5, 8]) bag.push({ name: `average of last ${k}`, predict: (h) => h.slice(-k).reduce((a, b) => a + b, 0) / Math.min(k, h.length) });
  for (const k of [3, 5, 8]) {
    bag.push({
      name: `trend over last ${k}`,
      predict: (h) => {
        const xs = h.slice(-k);
        if (xs.length < 2) return at(h, 1);
        const n = xs.length, mx = (n - 1) / 2, my = xs.reduce((a, b) => a + b, 0) / n;
        const slope = xs.reduce((s, y, i) => s + (i - mx) * (y - my), 0) / xs.reduce((s, _, i) => s + (i - mx) ** 2, 0);
        return clamp(my + slope * (n - mx));
      },
    });
  }
  for (const c of [30, 45, 55, 67, 75]) bag.push({ name: `always ${c}`, predict: () => c });
  return bag;
}

export interface ElFarolOptions {
  agents: number;
  capacity: number;
  /** Predictors per agent. */
  k: number;
  weeks: number;
  seed: number;
  /** Discount on past errors when scoring predictors (1 = remember everything equally). */
  decay: number;
  /** If set, every agent holds only this one predictor: a monoculture. */
  monoculture?: string;
}

export interface ElFarolResult {
  attendance: number[];
  /** How many agents trusted each predictor in the final week. */
  finalTrust: Record<string, number>;
}

export function runElFarol(o: ElFarolOptions): ElFarolResult {
  const rng: Rng = makeRng(o.seed);
  const bag = predictorBag();
  const history: number[] = Array.from({ length: 10 }, () => randInt(rng, 101)); // random past to start from
  const holdings: Predictor[][] = Array.from({ length: o.agents }, () => {
    if (o.monoculture) return [bag.find((p) => p.name === o.monoculture)!];
    const own = new Set<Predictor>();
    while (own.size < Math.min(o.k, bag.length)) own.add(bag[randInt(rng, bag.length)]);
    return [...own];
  });
  const errors = holdings.map((hs) => hs.map(() => 0));
  const attendance: number[] = [];
  let trust: string[] = [];
  for (let w = 0; w < o.weeks; w++) {
    const forecasts = holdings.map((hs) => hs.map((p) => p.predict(history)));
    trust = holdings.map((hs, a) => {
      let best = 0;
      for (let i = 1; i < hs.length; i++) if (errors[a][i] < errors[a][best]) best = i;
      return hs[best].name;
    });
    const going = holdings.filter((hs, a) => forecasts[a][hs.findIndex((p) => p.name === trust[a])] <= o.capacity).length;
    attendance.push(going);
    history.push(going);
    holdings.forEach((hs, a) => hs.forEach((_, i) => (errors[a][i] = o.decay * errors[a][i] + Math.abs(forecasts[a][i] - going))));
  }
  const finalTrust: Record<string, number> = {};
  for (const t of trust) finalTrust[t] = (finalTrust[t] ?? 0) + 1;
  return { attendance, finalTrust };
}
