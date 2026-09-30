// Run log format. Every call is stored with enough to rebuild its prompt (pool order +
// the memory implied by earlier plays), so metrics come from a rescore, never a re-run.

import type { Memory, ParseStatus, PoolId, WordingId } from "../games/naming.ts";

export interface Play {
  round: number; // 0-based
  agent: number;
  partner: number;
  /** The name actually played (after any substitution for a failed parse). */
  name: string;
  /** Pool order shown to this agent this round; `position` is the chosen name's index in it. */
  order: string[];
  position: number;
  payoff: number;
  status: ParseStatus | "committed";
  /** Which policy decided this play, e.g. a model id or "rule". */
  policy: string;
  raw?: string;
  ms?: number;
  promptTokens?: number;
  completionTokens?: number;
}

export interface RunMeta {
  experiment: "naming";
  condition: string;
  seed: number;
  agents: number;
  rounds: number;
  memory: number;
  pool: PoolId;
  wording: WordingId;
  /** Policy id per agent, and the committed name for committed agents. */
  agentPolicies: string[];
  committed: (string | null)[];
  /** Set when this run continued from another run's final memory (tipping). */
  continuedFrom?: string;
  startedAt: string;
  finishedAt: string | null;
  gpu?: string;
}

export interface RunLog {
  meta: RunMeta;
  plays: Play[];
  initialMemory: Memory[][];
  finalMemory: Memory[][];
}

export const runKey = (m: RunMeta) => `${m.condition}|${m.pool}|${m.wording}|${m.seed}`;
