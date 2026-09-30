// Model interface, copied from agentic-evals. Anything that implements LLM can drive the
// game, so tests use a scripted fake and the browser uses WebLLM.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionOpts {
  temperature: number;
  maxTokens: number;
  stop?: string[];
  /** JSON schema; when set, decoding is grammar-constrained to match it. */
  jsonSchema?: object;
  seed?: number;
  onToken?: (textSoFar: string) => void;
}

export interface Completion {
  text: string;
  promptTokens: number;
  completionTokens: number;
  ms: number;
}

/** The only thing a player needs from a model. */
export interface LLM {
  complete(messages: ChatMessage[], opts: CompletionOpts): Promise<Completion>;
}
