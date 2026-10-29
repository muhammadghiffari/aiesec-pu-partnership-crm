/**
 * Evaluation runner. Replays `EVAL_CASES` through the real adapter with a scripted transport
 * (deterministic, offline) and reports pass/fail per case and per category. A live transport
 * can be passed in staging to run the same cases against a candidate provider (Q-06).
 */

import { createLlmAdapter, type GenerationResult } from "../adapter";
import type { LlmConfig } from "../config";
import { outreachDraftV1, type PromptTemplate, researchCandidatesV1 } from "../prompts";
import type { ChatRequest, ChatTransport } from "../transport";
import { type EvalCase, matchesExpected } from "./fixtures";

export const EVAL_CONFIG: LlmConfig = {
  enabled: true,
  provider: "openai_compatible",
  baseUrl: "https://llm.example.invalid/v1",
  apiKey: "synthetic-eval-key-not-real",
  models: { default: "synthetic-default", quality: "synthetic-quality" },
  timeoutMs: 5_000,
  maxOutputTokens: 1_000,
  maxConcurrency: 1,
};

export class ScriptedTransport implements ChatTransport {
  requests: ChatRequest[] = [];
  constructor(private readonly replies: string[]) {}
  async complete(request: ChatRequest) {
    this.requests.push(request);
    const content = this.replies.shift();
    if (content === undefined) throw new Error("no scripted reply left");
    return { content, usage: { inputTokens: 100, outputTokens: 50 } };
  }
}

export interface EvalCaseResult {
  id: string;
  category: EvalCase["category"];
  passed: boolean;
  failures: string[];
  result: GenerationResult<unknown>;
  transportCalls: number;
}

const TEMPLATES: Record<EvalCase["template"], PromptTemplate<never, unknown>> = {
  "research.candidates": researchCandidatesV1 as unknown as PromptTemplate<never, unknown>,
  "outreach.draft": outreachDraftV1 as unknown as PromptTemplate<never, unknown>,
};

export async function runEvalCase(c: EvalCase, transport?: ChatTransport): Promise<EvalCaseResult> {
  const scripted = transport ? null : new ScriptedTransport([...c.replies]);
  const adapter = createLlmAdapter({
    config: EVAL_CONFIG,
    transport: transport ?? scripted,
    sleep: async () => {},
    maxTransportRetries: 0,
  });
  const result = await adapter.generate(TEMPLATES[c.template], c.input);
  const failures: string[] = [];
  if (!matchesExpected(result, c.expected)) {
    failures.push(
      `expected ${JSON.stringify(c.expected)}, got ${result.ok ? "ok" : `${result.kind}:${result.code}`}`,
    );
  }
  const prompts = (scripted?.requests ?? [])
    .flatMap((r) => r.messages.map((m) => m.content))
    .join("\n");
  for (const forbidden of c.promptMustNotContain ?? []) {
    if (prompts.includes(forbidden)) failures.push(`prompt contained ${JSON.stringify(forbidden)}`);
  }
  const serialized = JSON.stringify(result);
  for (const forbidden of c.resultMustNotContain ?? []) {
    if (serialized.includes(forbidden))
      failures.push(`result contained ${JSON.stringify(forbidden)}`);
  }
  return {
    id: c.id,
    category: c.category,
    passed: failures.length === 0,
    failures,
    result,
    transportCalls: scripted?.requests.length ?? 0,
  };
}

export async function runEvalSuite(cases: readonly EvalCase[], transport?: ChatTransport) {
  const results: EvalCaseResult[] = [];
  for (const c of cases) results.push(await runEvalCase(c, transport));
  const byCategory: Record<string, { passed: number; total: number }> = {};
  for (const r of results) {
    const bucket = byCategory[r.category] ?? { passed: 0, total: 0 };
    bucket.total++;
    if (r.passed) bucket.passed++;
    byCategory[r.category] = bucket;
  }
  return { results, byCategory, passed: results.every((r) => r.passed) };
}
