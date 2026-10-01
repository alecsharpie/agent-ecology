// Gemini API client implementing the lab's LLM interface, for Node runs (scripts/run-api.ts).
// The key is read from GEMINI_API_KEY and sent as a header, never in the URL or the logs.

import type { ChatMessage, Completion, CompletionOpts, LLM } from "./types.ts";

/** Convert our JSON schema to the OpenAPI subset Gemini accepts (no additionalProperties). */
function toGeminiSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(toGeminiSchema);
  if (!s || typeof s !== "object") return s;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === "additionalProperties") continue;
    out[k] = k === "type" && typeof v === "string" ? v.toUpperCase() : toGeminiSchema(v);
  }
  return out;
}

export interface GeminiOptions {
  model: string;
  /** e.g. "low" for Gemini 3.x models; omitted = the model's default. */
  thinkingLevel?: string;
  maxRetries?: number;
  /** Cap on request starts per minute, to stay under free-tier rate limits. */
  rpm?: number;
}

let nextSlot = 0;
/** Space request starts evenly so at most `rpm` begin per minute (shared across instances). */
async function throttle(rpm?: number) {
  if (!rpm) return;
  const now = Date.now(), gap = 60000 / rpm;
  const at = Math.max(now, nextSlot);
  nextSlot = at + gap;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

export class GeminiLLM implements LLM {
  private key: string;
  private o: GeminiOptions;
  constructor(o: GeminiOptions) {
    this.o = o;
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is not set");
    this.key = key;
  }

  async complete(messages: ChatMessage[], opts: CompletionOpts): Promise<Completion> {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
    const contents = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const generationConfig: Record<string, unknown> = { temperature: opts.temperature, maxOutputTokens: Math.max(opts.maxTokens, 64), seed: opts.seed == null ? undefined : opts.seed % 2147483647 };
    if (opts.jsonSchema) Object.assign(generationConfig, { responseMimeType: "application/json", responseSchema: toGeminiSchema(opts.jsonSchema) });
    if (this.o.thinkingLevel) generationConfig.thinkingConfig = { thinkingLevel: this.o.thinkingLevel };
    const body = JSON.stringify({ systemInstruction: system ? { parts: [{ text: system }] } : undefined, contents, generationConfig });
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.o.model}:generateContent`;
    const started = Date.now();
    for (let attempt = 0; ; attempt++) {
      await throttle(this.o.rpm);
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": this.key }, body });
      if (res.ok) {
        const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } };
        const text = (j.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
        const u = j.usageMetadata ?? {};
        return { text, promptTokens: u.promptTokenCount ?? 0, completionTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0), ms: Date.now() - started };
      }
      const retryable = res.status === 429 || res.status >= 500;
      const detail = await res.text();
      if (/PerDay/.test(detail)) throw new Error(`Gemini daily quota exhausted for ${this.o.model}: ${detail.slice(0, 200)}`);
      if (!retryable || attempt >= (this.o.maxRetries ?? 30)) throw new Error(`Gemini ${res.status}: ${detail.slice(0, 300)}`);
      // Honour the server's suggested delay when it gives one.
      const hinted = /"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(detail);
      const wait = hinted ? Number(hinted[1]) * 1000 + 1000 : Math.min(60000, 2000 * 2 ** attempt);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}
