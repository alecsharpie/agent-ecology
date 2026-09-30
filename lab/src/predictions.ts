// Predictions for the LLM conditions, to be FROZEN before the first LLM run (as in
// agentic-evals' variants.ts). Draft copied from the plan: edit freely until then, then set
// `frozenAt` and don't touch the claims again. The write-up grades each one.
//
// Note: condition R has already been run (see public/results/rule.json), so its results
// can inform these. That's fine; say so in the write-up.

export interface Prediction {
  id: number;
  claim: string;
  /** How it will be graded, stated so there's no wiggle room afterwards. */
  test: string;
}

export const frozenAt: string | null = "2026-09-30T22:30";

export const PREDICTIONS: Prediction[] = [
  { id: 1, claim: "B converges in most seeds within 40 rounds.", test: "At least 3 of 5 B seeds meet the convergence rule (>0.9 for 5 consecutive windows)." },
  { id: 2, claim: "A (clones) converges faster than B, and always on the same name.", test: "Median A convergence round < median B, and all converged A seeds share one winner." },
  { id: 3, claim: "C (0.5B) mostly fails to converge.", test: "At most 2 of 5 C seeds converge." },
  { id: 4, claim: "The winning-name distribution differs from the individual-bias baseline.", test: "Permutation test on TVD, winners (pooled B seeds) vs 200 fresh picks, p < 0.05 under both wordings." },
  { id: 5, claim: "The critical mass is between 10% and 30%.", test: "The smallest f with flip rate > 50% is in {10, 20, 30}%." },
];
