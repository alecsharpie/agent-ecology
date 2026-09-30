// The experimental grid from PLAN-naming-game.md. Condition R lives in scripts/run-rule.ts.

export const QWEN_15 = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
export const QWEN_05 = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
export const LLAMA_1 = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

export interface Condition {
  id: "A" | "B" | "C" | "D" | "E";
  label: string;
  /** Models, split evenly across the population in this order (agent i gets models[i % len]). */
  models: string[];
  temperature: number;
  purpose: string;
}

export const CONDITIONS: Condition[] = [
  { id: "A", label: "Qwen2.5 1.5B, greedy", models: [QWEN_15], temperature: 0, purpose: "Clone population (strict monoculture)" },
  { id: "B", label: "Qwen2.5 1.5B, T=0.7", models: [QWEN_15], temperature: 0.7, purpose: "Same model, sampling diversity (main result)" },
  { id: "C", label: "Qwen2.5 0.5B, T=0.7", models: [QWEN_05], temperature: 0.7, purpose: "Is there a capability floor?" },
  { id: "D", label: "Llama 3.2 1B, T=0.7", models: [LLAMA_1], temperature: 0.7, purpose: "Different model family" },
  { id: "E", label: "Half Qwen 1.5B, half Llama 1B, T=0.7", models: [QWEN_15, LLAMA_1], temperature: 0.7, purpose: "Mixed population" },
];

export const PARAMS = { agents: 24, rounds: 40, memory: 5, baselineAgents: 200 } as const;

export const conditionById = (id: string) => CONDITIONS.find((c) => c.id === id);

export const runName = (cond: string, pool: string, wording: string, seed: number) => `naming-${cond}-${pool}-${wording}-s${seed}`.toLowerCase();
export const baselineName = (model: string, pool: string, wording: string, temperature: number) =>
  `baseline-${model.split("-").slice(0, 3).join("-")}-${pool}-${wording}-t${String(temperature).replace(".", "")}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
