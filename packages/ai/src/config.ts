/**
 * Runtime LLM configuration (M2-03, ADR 001, D-014).
 *
 * This module does NOT read the environment. It maps the LLM_* fields of the M0-04 config
 * contract (`@crm/config` AppConfig, same field names) into a validated adapter config, so
 * there is exactly one env loader. Coding-assistant model names never appear here.
 *
 * Secrets: the API key is kept only on the returned object and handed to the transport. It is
 * never included in errors, metadata or `describeLlmConfig()`.
 */

import { z } from "zod";

export const LLM_PROVIDERS = ["none", "openai_compatible"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

/** Structural subset of `@crm/config` AppConfig. Field names must stay identical. */
export interface AppConfigLlmFields {
  AI_ENABLED: boolean;
  LLM_PROVIDER: string;
  LLM_BASE_URL?: string | undefined;
  LLM_API_KEY?: string | undefined;
  LLM_MODEL_DEFAULT?: string | undefined;
  LLM_MODEL_QUALITY?: string | undefined;
  LLM_TIMEOUT_MS: number;
  LLM_MAX_OUTPUT_TOKENS: number;
  LLM_MAX_CONCURRENCY: number;
}

export type LlmConfig =
  | { enabled: false; reason: "AI_DISABLED" | "PROVIDER_NONE" }
  | {
      enabled: true;
      provider: "openai_compatible";
      baseUrl: string;
      apiKey: string;
      models: { default: string; quality: string };
      timeoutMs: number;
      maxOutputTokens: number;
      maxConcurrency: number;
    };

export class LlmConfigError extends Error {
  constructor(readonly issues: readonly string[]) {
    // Variable names only, never values.
    super(`invalid LLM configuration: ${issues.join(", ")}`);
    this.name = "LlmConfigError";
  }
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function validBaseUrl(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.search || url.hash) return false;
    // TLS required except for a local development endpoint.
    return url.protocol === "https:" || (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname));
  } catch {
    return false;
  }
}

const modelId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/);

export function llmConfigFromAppConfig(c: AppConfigLlmFields): LlmConfig {
  if (!c.AI_ENABLED) return { enabled: false, reason: "AI_DISABLED" };
  const provider = c.LLM_PROVIDER.trim().toLowerCase();
  if (provider === "none") return { enabled: false, reason: "PROVIDER_NONE" };

  const issues: string[] = [];
  if (!(LLM_PROVIDERS as readonly string[]).includes(provider)) issues.push("LLM_PROVIDER");
  if (!validBaseUrl(c.LLM_BASE_URL)) issues.push("LLM_BASE_URL");
  if (!c.LLM_API_KEY || c.LLM_API_KEY.trim().length < 8) issues.push("LLM_API_KEY");
  const def = modelId.safeParse(c.LLM_MODEL_DEFAULT);
  if (!def.success) issues.push("LLM_MODEL_DEFAULT");
  const quality = c.LLM_MODEL_QUALITY ? modelId.safeParse(c.LLM_MODEL_QUALITY) : def;
  if (!quality.success) issues.push("LLM_MODEL_QUALITY");
  const bounded = (n: number, min: number, max: number) =>
    Number.isInteger(n) && n >= min && n <= max;
  if (!bounded(c.LLM_TIMEOUT_MS, 1_000, 300_000)) issues.push("LLM_TIMEOUT_MS");
  if (!bounded(c.LLM_MAX_OUTPUT_TOKENS, 64, 32_000)) issues.push("LLM_MAX_OUTPUT_TOKENS");
  if (!bounded(c.LLM_MAX_CONCURRENCY, 1, 16)) issues.push("LLM_MAX_CONCURRENCY");
  if (issues.length > 0 || !def.success || !quality.success) throw new LlmConfigError(issues);

  return {
    enabled: true,
    provider: "openai_compatible",
    baseUrl: (c.LLM_BASE_URL as string).replace(/\/+$/, ""),
    apiKey: (c.LLM_API_KEY as string).trim(),
    models: { default: def.data, quality: quality.data },
    timeoutMs: c.LLM_TIMEOUT_MS,
    maxOutputTokens: c.LLM_MAX_OUTPUT_TOKENS,
    maxConcurrency: c.LLM_MAX_CONCURRENCY,
  };
}

/** Safe for logs: no key, no full URL path. */
export function describeLlmConfig(config: LlmConfig): Record<string, unknown> {
  if (!config.enabled) return { enabled: false, reason: config.reason };
  return {
    enabled: true,
    provider: config.provider,
    baseUrlHost: new URL(config.baseUrl).host,
    models: config.models,
    timeoutMs: config.timeoutMs,
    maxOutputTokens: config.maxOutputTokens,
    maxConcurrency: config.maxConcurrency,
    apiKey: "[redacted]",
  };
}
