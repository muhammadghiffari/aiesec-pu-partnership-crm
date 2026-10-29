/**
 * Provider-neutral LLM adapter (M2-03, FR-950).
 *
 * `generate(template, input)`:
 *   1. validates input against the template's strict schema (minimization, no extra fields);
 *   2. refuses when AI is disabled or the spend cap is reached;
 *   3. calls the transport with a deadline, bounded concurrency and retries for retryable
 *      TRANSPORT errors only;
 *   4. parses JSON, validates the output schema, and allows ONE repair attempt on a schema
 *      failure (E2 spec); after that the result is a QUALITY failure for human review;
 *   5. runs the template's deterministic checks (grounding, tone, secrets).
 *
 * Results always carry metadata: template id/version, provider, model, attempts, latency,
 * token counts, estimated cost and a SHA-256 of the prompt (the prompt text and the API key are
 * never stored or returned). Transport failures and quality failures are distinct `kind`s.
 * The adapter has no tools and no send capability.
 */

import type { LlmConfig } from "./config";
import type { PromptTemplate, QualityCode } from "./prompts";
import {
  type ChatTransport,
  RETRYABLE,
  TransportError,
  type TransportErrorCode,
} from "./transport";

export interface Pricing {
  /** Integer micro-units of the billing currency per 1 000 tokens. */
  inputPer1k: number;
  outputPer1k: number;
}

export interface GenerationMeta {
  templateId: string;
  templateVersion: number;
  provider: string;
  model: string;
  attempts: number;
  repairAttempted: boolean;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: number | null;
  promptSha256: string;
}

export type GenerationResult<O> =
  | { ok: true; output: O; meta: GenerationMeta }
  | { ok: false; kind: "DISABLED"; code: "AI_DISABLED" | "PROVIDER_NONE" | "BUDGET_EXCEEDED" }
  | { ok: false; kind: "INPUT"; code: "INPUT_INVALID" | "DO_NOT_CONTACT" }
  | { ok: false; kind: "TRANSPORT"; code: TransportErrorCode; meta: GenerationMeta }
  | {
      ok: false;
      kind: "QUALITY";
      code: QualityCode;
      problems: QualityCode[];
      meta: GenerationMeta;
    };

export interface AdapterDeps {
  config: LlmConfig;
  transport: ChatTransport | null;
  pricing?: Pricing;
  /** Total spend allowed for this adapter instance (micro-units). Undefined = no cap. */
  spendCapMicros?: number;
  maxTransportRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function semaphore(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}

/** Strips a ```json fence some models add; does not try to "fix" broken JSON. */
function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, "$1");
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

export function createLlmAdapter(deps: AdapterDeps) {
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => Date.now());
  const maxRetries = deps.maxTransportRetries ?? 2;
  const limit = semaphore(deps.config.enabled ? deps.config.maxConcurrency : 1);
  let spentMicros = 0;

  function cost(inputTokens: number, outputTokens: number): number | null {
    if (!deps.pricing) return null;
    return Math.ceil(
      (inputTokens * deps.pricing.inputPer1k + outputTokens * deps.pricing.outputPer1k) / 1000,
    );
  }

  async function generate<I, O>(
    template: PromptTemplate<I, O>,
    rawInput: unknown,
  ): Promise<GenerationResult<O>> {
    const config = deps.config;
    if (!config.enabled || !deps.transport) {
      return {
        ok: false,
        kind: "DISABLED",
        code: config.enabled ? "PROVIDER_NONE" : config.reason,
      };
    }
    if (deps.spendCapMicros !== undefined && spentMicros >= deps.spendCapMicros) {
      return { ok: false, kind: "DISABLED", code: "BUDGET_EXCEEDED" };
    }

    const parsedInput = template.input.safeParse(rawInput);
    if (!parsedInput.success) return { ok: false, kind: "INPUT", code: "INPUT_INVALID" };
    let prompt: { system: string; user: string };
    try {
      prompt = template.build(parsedInput.data);
    } catch (error) {
      if (error instanceof Error && error.name === "DoNotContactError") {
        return { ok: false, kind: "INPUT", code: "DO_NOT_CONTACT" };
      }
      throw error;
    }

    const model = template.tier === "quality" ? config.models.quality : config.models.default;
    const meta: GenerationMeta = {
      templateId: template.id,
      templateVersion: template.version,
      provider: config.provider,
      model,
      attempts: 0,
      repairAttempted: false,
      latencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      costMicros: null,
      promptSha256: await sha256(
        `${template.id}@${template.version}\n${prompt.system}\n${prompt.user}`,
      ),
    };
    const started = now();

    const call = async (messages: { role: "system" | "user"; content: string }[]) => {
      let lastCode: TransportErrorCode = "NETWORK_ERROR";
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        meta.attempts++;
        try {
          // The deadline starts when a concurrency slot is held, not while queued.
          const response = await limit(async () => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), config.timeoutMs);
            try {
              return await Promise.race([
                (deps.transport as ChatTransport).complete(
                  { model, messages, maxOutputTokens: config.maxOutputTokens, json: true },
                  { signal: controller.signal },
                ),
                new Promise<never>((_, reject) =>
                  controller.signal.addEventListener("abort", () =>
                    reject(new TransportError("TIMEOUT")),
                  ),
                ),
              ]);
            } catch (error) {
              // Whatever the provider throws after our deadline fired is a timeout.
              if (controller.signal.aborted) throw new TransportError("TIMEOUT");
              throw error;
            } finally {
              clearTimeout(timer);
            }
          });
          if (response.usage) {
            meta.inputTokens += response.usage.inputTokens;
            meta.outputTokens += response.usage.outputTokens;
          }
          return { ok: true as const, content: response.content };
        } catch (error) {
          lastCode = error instanceof TransportError ? error.code : "NETWORK_ERROR";
          if (!RETRYABLE.has(lastCode) || attempt === maxRetries) break;
          await sleep(500 * 2 ** attempt);
        }
      }
      return { ok: false as const, code: lastCode };
    };

    const finish = () => {
      meta.latencyMs = Math.max(0, now() - started);
      meta.costMicros = cost(meta.inputTokens, meta.outputTokens);
      if (meta.costMicros) spentMicros += meta.costMicros;
    };

    const messages = [
      { role: "system" as const, content: prompt.system },
      { role: "user" as const, content: prompt.user },
    ];
    let response = await call(messages);
    if (!response.ok) {
      finish();
      return { ok: false, kind: "TRANSPORT", code: response.code, meta };
    }

    let parsed = template.output.safeParse(parseJson(response.content));
    if (!parsed.success) {
      // One repair attempt: restate the contract; do not include the bad output verbatim.
      meta.repairAttempted = true;
      response = await call([
        ...messages,
        {
          role: "user",
          content:
            "Your previous answer was not valid JSON for the required schema. Reply again with exactly one JSON " +
            "object that matches the requested fields and limits. No prose, no code fences.",
        },
      ]);
      if (!response.ok) {
        finish();
        return { ok: false, kind: "TRANSPORT", code: response.code, meta };
      }
      parsed = template.output.safeParse(parseJson(response.content));
    }
    finish();
    if (!parsed.success) {
      return {
        ok: false,
        kind: "QUALITY",
        code: "SCHEMA_INVALID",
        problems: ["SCHEMA_INVALID"],
        meta,
      };
    }

    const problems = template.check(parsed.data, parsedInput.data);
    if (problems.length > 0) {
      return { ok: false, kind: "QUALITY", code: problems[0] as QualityCode, problems, meta };
    }
    return { ok: true, output: parsed.data, meta };
  }

  return {
    generate,
    /** Accumulated estimated spend (micro-units) for this instance. */
    spent: () => spentMicros,
  };
}

export type LlmAdapter = ReturnType<typeof createLlmAdapter>;
