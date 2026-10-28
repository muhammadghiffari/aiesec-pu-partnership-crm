/**
 * M0-04 acceptance tests for the typed startup configuration contract:
 * positive loads with development defaults, negative cases for missing,
 * malformed and placeholder values in production and feature-enabled modes,
 * provider-gated integration keys, safety flags, and redaction tests proving
 * secret values never appear in errors or logs. All values are synthetic.
 */
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfigFromEnv, redactConfig, SECRET_KEYS } from "./index";

const SYNTHETIC_SECRET = "sk-synthetic-secret-value-123";
const SYNTHETIC_DB = "postgres://localhost:5432/synthetic_test";

function validDevEnv(): Record<string, string | undefined> {
  return {
    NODE_ENV: "development",
    DATABASE_URL: SYNTHETIC_DB,
    APP_URL: "http://localhost:3000",
  };
}

function validProdEnv(): Record<string, string | undefined> {
  return {
    NODE_ENV: "production",
    APP_URL: "https://crm.example.invalid",
    DATABASE_URL: SYNTHETIC_DB,
    AUTH_SECRET: "synthetic-session-secret-value",
    AUTH_GOOGLE_ID: "synthetic-client-id",
    AUTH_GOOGLE_SECRET: SYNTHETIC_SECRET,
    AI_ENABLED: "true",
    LLM_PROVIDER: "synthetic-provider",
    LLM_API_KEY: SYNTHETIC_SECRET,
    LLM_MODEL_DEFAULT: "synthetic-runtime-model",
  };
}

describe("loadConfigFromEnv — success paths", () => {
  it("loads a valid development config with documented defaults", () => {
    const config = loadConfigFromEnv(validDevEnv());
    expect(config.NODE_ENV).toBe("development");
    expect(config.TZ).toBe("Asia/Jakarta");
    expect(config.DATABASE_URL).toBe(SYNTHETIC_DB);
    expect(config.auth.enabled).toBe(false);
    expect(config.AI_ENABLED).toBe(false);
    expect(config.LLM_PROVIDER).toBe("none");
    expect(config.LLM_TIMEOUT_MS).toBe(45000);
    expect(config.OUTBOUND_ASSISTED_SEND_ENABLED).toBe(false);
    expect(config.COMPANION_ENABLED).toBe(false);
  });

  it("applies the safe localhost database default when unset in development", () => {
    const config = loadConfigFromEnv({ NODE_ENV: "development" });
    expect(config.DATABASE_URL).toBe("postgres://localhost:5432/aiesec_crm_dev");
  });

  it("keeps the official ESSM survey URL from the contract", () => {
    const config = loadConfigFromEnv(validDevEnv());
    expect(config.ESSM_SURVEY_URL).toBe("https://s.aiesec.or.id/AIESECPartnershipSurvey-BD");
  });

  it("loads a complete production config with auth and LLM enabled", () => {
    const config = loadConfigFromEnv(validProdEnv());
    expect(config.NODE_ENV).toBe("production");
    expect(config.auth.enabled).toBe(true);
    expect(config.AUTH_GOOGLE_SECRET).toBe(SYNTHETIC_SECRET);
    expect(config.AI_ENABLED).toBe(true);
    expect(config.LLM_MODEL_DEFAULT).toBe("synthetic-runtime-model");
    expect(config.LLM_MAX_CONCURRENCY).toBe(1);
  });
});

describe("loadConfigFromEnv — production fails safely", () => {
  it("requires DATABASE_URL and APP_URL in production", () => {
    expect(() => loadConfigFromEnv({ NODE_ENV: "production" })).toThrow(ConfigError);
    try {
      loadConfigFromEnv({ NODE_ENV: "production" });
    } catch (error) {
      const variables = (error as ConfigError).issues.map((i) => i.variable);
      expect(variables).toContain("DATABASE_URL");
      expect(variables).toContain("APP_URL");
      expect(variables).toContain("AUTH_GOOGLE_ID");
      expect(variables).toContain("AUTH_SECRET");
    }
  });

  it("requires auth credentials exactly when auth is enabled in development", () => {
    try {
      loadConfigFromEnv({ NODE_ENV: "development", AUTH_SECRET: "synthetic-session-secret-value" });
      expect.unreachable("expected ConfigError");
    } catch (error) {
      const variables = (error as ConfigError).issues.map((i) => i.variable);
      expect(variables).toContain("AUTH_GOOGLE_ID");
      expect(variables).toContain("AUTH_GOOGLE_SECRET");
      expect(variables).not.toContain("DATABASE_URL");
    }
  });

  it("requires LLM key, provider and model exactly when AI_ENABLED=true", () => {
    try {
      loadConfigFromEnv({ NODE_ENV: "development", AI_ENABLED: "true" });
      expect.unreachable("expected ConfigError");
    } catch (error) {
      const variables = (error as ConfigError).issues.map((i) => i.variable);
      expect(variables).toContain("LLM_API_KEY");
      expect(variables).toContain("LLM_MODEL_DEFAULT");
      expect(variables).toContain("LLM_PROVIDER");
    }
  });

  it("requires SEARCH/ENRICH keys only when their provider is enabled", () => {
    // Disabled by default: no key needed.
    expect(() => loadConfigFromEnv(validDevEnv())).not.toThrow();
    // Enabled without key: fails naming the key variable.
    try {
      loadConfigFromEnv({ ...validDevEnv(), SEARCH_PROVIDER: "synthetic-search" });
      expect.unreachable("expected ConfigError");
    } catch (error) {
      expect((error as ConfigError).issues.map((i) => i.variable)).toContain("SEARCH_API_KEY");
    }
  });

  it("rejects assisted outbound send and companion enabled in production", () => {
    try {
      loadConfigFromEnv({ ...validProdEnv(), OUTBOUND_ASSISTED_SEND_ENABLED: "true" });
      expect.unreachable("expected ConfigError");
    } catch (error) {
      const issues = (error as ConfigError).issues;
      expect(issues.some((i) => i.variable === "OUTBOUND_ASSISTED_SEND_ENABLED")).toBe(true);
    }
    try {
      loadConfigFromEnv({ ...validProdEnv(), COMPANION_ENABLED: "true" });
      expect.unreachable("expected ConfigError");
    } catch (error) {
      const issues = (error as ConfigError).issues;
      expect(issues.some((i) => i.variable === "COMPANION_ENABLED")).toBe(true);
    }
  });
});

describe("loadConfigFromEnv — malformed and placeholder values", () => {
  it("rejects a non-URL APP_URL without echoing the value", () => {
    try {
      loadConfigFromEnv({ NODE_ENV: "development", APP_URL: "not a url" });
      expect.unreachable("expected ConfigError");
    } catch (error) {
      const issues = (error as ConfigError).issues;
      expect(issues.some((i) => i.variable === "APP_URL" && i.code === "invalid_url")).toBe(true);
      expect((error as Error).message).not.toContain("not a url");
    }
  });

  it("rejects placeholder secret values without echoing them", () => {
    try {
      loadConfigFromEnv({
        NODE_ENV: "development",
        AUTH_SECRET: "changeme",
        AUTH_GOOGLE_ID: "placeholder",
        AUTH_GOOGLE_SECRET: "your-secret-here",
      });
      expect.unreachable("expected ConfigError");
    } catch (error) {
      const issues = (error as ConfigError).issues;
      for (const variable of ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "AUTH_SECRET"]) {
        expect(issues.some((i) => i.variable === variable && i.code === "placeholder")).toBe(true);
      }
      const message = (error as Error).message;
      expect(message).not.toContain("changeme");
      expect(message).not.toContain("your-secret-here");
    }
  });

  it("rejects unknown enum values and non-numeric numbers without echoing them", () => {
    expect(() => loadConfigFromEnv({ NODE_ENV: "staging" } as Record<string, string>)).toThrow(
      ConfigError,
    );
    try {
      loadConfigFromEnv({ LLM_TIMEOUT_MS: "not-a-number" });
      expect.unreachable("expected ConfigError");
    } catch (error) {
      expect((error as ConfigError).issues.map((i) => i.variable)).toContain("LLM_TIMEOUT_MS");
      expect((error as Error).message).not.toContain("not-a-number");
    }
  });
});

describe("redaction", () => {
  it("replaces every secret field with [redacted] and keeps metadata readable", () => {
    const config = loadConfigFromEnv(validProdEnv());
    const safe = redactConfig(config);
    const serialized = JSON.stringify(safe);
    expect(serialized).not.toContain(SYNTHETIC_SECRET);
    expect(serialized).not.toContain("synthetic-session-secret-value");
    expect(safe.AUTH_GOOGLE_SECRET).toBe("[redacted]");
    expect(safe.LLM_API_KEY).toBe("[redacted]");
    expect(safe.LLM_MODEL_DEFAULT).toBe("synthetic-runtime-model");
    expect(safe.auth).toEqual({ enabled: true });
  });

  it("never includes secret VALUES in ConfigError messages, only variable names", () => {
    try {
      loadConfigFromEnv({
        NODE_ENV: "production",
        AUTH_GOOGLE_SECRET: SYNTHETIC_SECRET,
        AI_ENABLED: "true",
        LLM_PROVIDER: "synthetic-provider",
        LLM_MODEL_DEFAULT: "synthetic-runtime-model",
      });
      expect.unreachable("expected ConfigError");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain(SYNTHETIC_SECRET);
      expect(message).toContain("LLM_API_KEY");
      expect(message).toContain("DATABASE_URL");
    }
  });

  it("exports the canonical secret key list for log scrubbers", () => {
    expect(SECRET_KEYS).toContain("LLM_API_KEY");
    expect(SECRET_KEYS).toContain("AUTH_SECRET");
    expect(SECRET_KEYS).toContain("AUTH_GOOGLE_SECRET");
    expect(SECRET_KEYS).toContain("SEARCH_API_KEY");
    expect(SECRET_KEYS).toContain("ENRICH_API_KEY");
    expect(SECRET_KEYS).toContain("GITHUB_DISPATCH_TOKEN");
    expect(SECRET_KEYS).toContain("BACKUP_AGE_PUBLIC_KEY");
  });
});
