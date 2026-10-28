/**
 * @crm/config — typed startup configuration contract (M0-04).
 *
 * Loads and validates the environment contract declared in `.env.example`:
 * app runtime, database, auth, LLM adapter, worker, outbound-send/companion
 * flags and integration keys. Zod parses at the boundary. Rules:
 * - Secrets have no defaults and are never echoed: error messages and the
 *   redaction helper expose variable NAMES and validation codes only — never
 *   received values (Zod issue messages are deliberately not propagated).
 * - Production fails safely: required values must be present, auth must be on,
 *   assisted outbound send and the companion stay disabled unless explicitly
 *   justified (they default to false and are forbidden-by-default in prod).
 * - Development defaults are documented and safe (localhost DB, auth off).
 * - App-runtime model configuration (LLM_*) is separate from coding-agent
 *   model names; IDE/agent model choices never appear in runtime config.
 */
import { z } from "zod";

export const CONFIG_PACKAGE_NAME = "@crm/config" as const;

/** Environment variable names that hold secret material (log-scrub list). */
export const SECRET_KEYS = [
  "AUTH_SECRET",
  "AUTH_GOOGLE_SECRET",
  "LLM_API_KEY",
  "SEARCH_API_KEY",
  "ENRICH_API_KEY",
  "GITHUB_DISPATCH_TOKEN",
  "BACKUP_AGE_PUBLIC_KEY",
] as const;

const REDACTED = "[redacted]";

/** Literal placeholder values that must never reach a real environment. */
const PLACEHOLDER_VALUES = new Set([
  "",
  "changeme",
  "change_me",
  "placeholder",
  "your-secret-here",
  "example",
]);

/** Boolean env flag stored as "true"/"false", surfaced as a real boolean. */
const flag = (def: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(def)
    .transform((v) => v === "true");

const rawSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_URL: z.string().optional(),
  TZ: z.string().default("Asia/Jakarta"),
  DATABASE_URL: z.string().optional(),
  // Auth (Google OAuth; server-side allowlist is enforced by M0-05).
  ALLOWED_EMAILS: z.string().optional(),
  AUTH_SECRET: z.string().optional(),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  // LLM adapter (application runtime only; coding-agent models never appear).
  AI_ENABLED: flag("false"),
  LLM_PROVIDER: z.string().default("none"),
  LLM_BASE_URL: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL_DEFAULT: z.string().optional(),
  LLM_MODEL_QUALITY: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(45000),
  LLM_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(2000),
  LLM_MAX_CONCURRENCY: z.coerce.number().int().positive().default(1),
  // Worker and safety flags.
  WORKER_MAX_MINUTES: z.coerce.number().int().positive().default(20),
  OUTBOUND_ASSISTED_SEND_ENABLED: flag("false"),
  COMPANION_ENABLED: flag("false"),
  GITHUB_DISPATCH_TOKEN: z.string().optional(),
  GITHUB_REPO: z.string().optional(),
  // Enrichment / research integrations (provider "none" = disabled).
  SEARCH_PROVIDER: z.string().default("none"),
  SEARCH_API_KEY: z.string().optional(),
  ENRICH_PROVIDER: z.string().default("none"),
  ENRICH_API_KEY: z.string().optional(),
  // Fixed official survey URL and retention policy.
  ESSM_SURVEY_URL: z.string().default("https://s.aiesec.or.id/AIESECPartnershipSurvey-BD"),
  TRANSCRIPT_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  BACKUP_AGE_PUBLIC_KEY: z.string().optional(),
});

export type AppConfig = z.infer<typeof rawSchema> & {
  auth: { enabled: boolean };
};

export type ConfigIssue = { variable: string; code: string; message: string };

const ISSUE_MESSAGES: Record<string, string> = {
  missing: "required variable is not set",
  empty: "variable is set but empty",
  placeholder: "variable still contains its placeholder value",
  invalid_url: "variable is not a valid http(s) URL",
  invalid_type: "variable must be a string",
  invalid_value: "variable must be one of the documented values",
  too_small: "variable must be a positive integer",
  required_when_enabled: "required while this feature is enabled",
  required_in_production: "required in production",
  forbidden_in_production: "must not be enabled in production",
};

export class ConfigError extends Error {
  readonly issues: readonly ConfigIssue[];

  constructor(issues: readonly ConfigIssue[]) {
    // Variable names and codes only — values must never reach this message.
    super(
      `Invalid configuration:\n${issues.map((i) => `  - ${i.variable}: ${i.message}`).join("\n")}`,
    );
    this.name = "ConfigError";
    this.issues = issues;
  }
}

function issue(variable: string, code: string): ConfigIssue {
  return { variable, code, message: ISSUE_MESSAGES[code] ?? code };
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function checkSecret(name: string, value: string | undefined, issues: ConfigIssue[]): boolean {
  if (value === undefined) {
    issues.push(issue(name, "missing"));
    return false;
  }
  if (PLACEHOLDER_VALUES.has(value.trim().toLowerCase())) {
    issues.push(issue(name, "placeholder"));
    return false;
  }
  return true;
}

/**
 * Pure loader: validates a raw environment record into a typed config.
 * Throws {@link ConfigError} with redacted, actionable issues on any problem.
 */
export function loadConfigFromEnv(env: Record<string, string | undefined>): AppConfig {
  const parsed = rawSchema.safeParse(env);
  if (!parsed.success) {
    // Deliberately drop zod's own messages: they can embed received values.
    throw new ConfigError(
      parsed.error.issues.map((i) => issue(i.path.join(".") || "(root)", i.code)),
    );
  }
  const e = parsed.data;
  const issues: ConfigIssue[] = [];
  const isProduction = e.NODE_ENV === "production";
  const authEnabled = isProduction || e.AUTH_SECRET !== undefined || e.AUTH_GOOGLE_ID !== undefined;

  // Database: safe localhost default in development/test, required in production.
  if (e.DATABASE_URL === undefined && isProduction) {
    issues.push(issue("DATABASE_URL", "required_in_production"));
  }
  if (e.DATABASE_URL !== undefined && e.DATABASE_URL.trim() === "") {
    issues.push(issue("DATABASE_URL", "empty"));
  }

  // App URL: safe localhost default in development/test, required in production.
  if (e.APP_URL === undefined && isProduction) {
    issues.push(issue("APP_URL", "required_in_production"));
  }
  if (e.APP_URL !== undefined && !isHttpUrl(e.APP_URL)) {
    issues.push(issue("APP_URL", "invalid_url"));
  }

  // Auth credentials: required exactly when auth is enabled.
  if (authEnabled) {
    if (e.AUTH_GOOGLE_ID === undefined) {
      issues.push(issue("AUTH_GOOGLE_ID", "required_when_enabled"));
    } else if (PLACEHOLDER_VALUES.has(e.AUTH_GOOGLE_ID.trim().toLowerCase())) {
      issues.push(issue("AUTH_GOOGLE_ID", "placeholder"));
    }
    checkSecret("AUTH_GOOGLE_SECRET", e.AUTH_GOOGLE_SECRET, issues);
    checkSecret("AUTH_SECRET", e.AUTH_SECRET, issues);
  }

  // LLM adapter credentials: required exactly when the adapter is enabled.
  if (e.AI_ENABLED) {
    if (e.LLM_PROVIDER === "none") {
      issues.push(issue("LLM_PROVIDER", "required_when_enabled"));
    }
    checkSecret("LLM_API_KEY", e.LLM_API_KEY, issues);
    if (e.LLM_MODEL_DEFAULT === undefined) {
      issues.push(issue("LLM_MODEL_DEFAULT", "required_when_enabled"));
    }
  }

  // Integration keys are required exactly when their provider is enabled.
  if (e.SEARCH_PROVIDER !== "none") {
    checkSecret("SEARCH_API_KEY", e.SEARCH_API_KEY, issues);
  }
  if (e.ENRICH_PROVIDER !== "none") {
    checkSecret("ENRICH_API_KEY", e.ENRICH_API_KEY, issues);
  }

  // Safety: assisted send and companion are disabled by default and must not
  // be enabled in production without a documented product-owner decision.
  if (isProduction && e.OUTBOUND_ASSISTED_SEND_ENABLED) {
    issues.push(issue("OUTBOUND_ASSISTED_SEND_ENABLED", "forbidden_in_production"));
  }
  if (isProduction && e.COMPANION_ENABLED) {
    issues.push(issue("COMPANION_ENABLED", "forbidden_in_production"));
  }

  if (issues.length > 0) {
    throw new ConfigError(issues);
  }

  return {
    ...e,
    auth: { enabled: authEnabled },
    // Documented safe development defaults; production absence already failed.
    DATABASE_URL: e.DATABASE_URL ?? "postgres://localhost:5432/aiesec_crm_dev",
    APP_URL: e.APP_URL ?? "http://localhost:3000",
  };
}

/**
 * Log-safe view of a config: every secret variable is replaced by "[redacted]".
 * The return value is JSON-serializable and safe for CI output and diagnostics.
 */
export function redactConfig(config: AppConfig): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key === "auth") {
      redacted[key] = { enabled: config.auth.enabled };
      continue;
    }
    redacted[key] =
      typeof value === "string" && (SECRET_KEYS as readonly string[]).includes(key)
        ? REDACTED
        : value;
  }
  return redacted;
}

/** Startup entry point: reads process.env. Throws ConfigError on invalid config. */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  return loadConfigFromEnv(env);
}

/** Convenience helper for health/readiness reporting. */
export function describeConfig(config: AppConfig): Record<string, unknown> {
  return redactConfig(config);
}
