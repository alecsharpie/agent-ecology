// An LLM agent: builds the prompt from the agent's memory, decodes under a JSON schema
// whose only allowed values are the pool names, and parses the result.

import { answerSchema, buildPrompt, parseAnswer, type WordingId } from "../games/naming.ts";
import type { LLM } from "../lib/types.ts";
import type { Decision, Policy, Request } from "./population.ts";

export interface LLMPolicyOptions {
  modelId: string;
  temperature: number;
  wording: WordingId;
  llm: LLM;
  /** Called before a batch; the browser uses it to (re)load the model for mixed populations. */
  prepare?: (modelId: string) => Promise<void>;
  maxTokens?: number;
  signal?: AbortSignal;
}

export function llmPolicy(o: LLMPolicyOptions): Policy {
  return {
    id: o.modelId,
    async decide(requests: Request[], onDecision?: (done: number) => void): Promise<Decision[]> {
      await o.prepare?.(o.modelId);
      const out: Decision[] = [];
      for (const r of requests) {
        if (o.signal?.aborted) break;
        const c = await o.llm.complete(buildPrompt(o.wording, r.order, r.memory), {
          temperature: o.temperature,
          maxTokens: o.maxTokens ?? 20,
          jsonSchema: answerSchema(r.order),
          seed: r.seed,
        });
        const { name, status } = parseAnswer(c.text, r.order);
        out.push({ name, status, raw: c.text, ms: c.ms, promptTokens: c.promptTokens, completionTokens: c.completionTokens });
        onDecision?.(out.length);
      }
      return out;
    },
  };
}
