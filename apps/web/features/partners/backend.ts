import {
  createAuditService,
  createPartnerService,
  createSessionService,
  createStaticAllowlist,
} from "@crm/core";
import {
  createDevIdentityVerifier,
  createGoogleIdentityVerifier,
  type IdentityVerifier,
} from "@crm/core";
import type { SqlClient } from "@crm/db";
import {
  createAuditSqlStore,
  createPartnerRepository,
  createSessionStore,
  createUserDirectory,
} from "@crm/db";
import { Pool } from "pg";

/** No configured production database/identity/allowlist: deny all access. */
export class PartnerBackendUnavailableError extends Error {
  constructor() {
    super("Partner persistence and authenticated session wiring are not available");
    this.name = "PartnerBackendUnavailableError";
  }
}

/**
 * Dev-only demo gate (D-016). The only thing it relaxes is the *identity verifier*:
 * a `dev:<email>` token is accepted instead of a Google ID token when the process
 * is not in production AND `CRM_DEMO_MODE=1` is set explicitly. Everything else —
 * allowlist, active users row, session minting, RBAC, audit — is the real path.
 * In production the flag is ignored entirely and Google verification is required.
 */
export function demoSignInEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.CRM_DEMO_MODE === "1";
}

function resolveIdentity(clientId: string): IdentityVerifier {
  return demoSignInEnabled()
    ? createDevIdentityVerifier()
    : createGoogleIdentityVerifier({ clientId, jwks });
}

/** First allowlisted email, for the dev sign-in suggestion (dev mode only, never PII). */
export function firstAllowlistedEmail(): string | null {
  if (!demoSignInEnabled()) return null;
  const value = process.env.CRM_ALLOWED_EMAILS;
  if (!value) return null;
  const first = value
    .split(/[,;\n]/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => /[^\s@]+@[^\s@]+\.[^\s@]{2,}/.test(entry))[0];
  return first ?? null;
}

export function readSessionCookie(headers: Headers): string | null {
  const value = headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("crm_session="));
  const token = value?.slice("crm_session=".length);
  return token && /^[A-Za-z0-9_-]{1,256}$/.test(token) ? token : null;
}

export function createPersistedBackend(
  db: SqlClient,
  config: { identity: IdentityVerifier; allowlist: string },
) {
  const sessions = createSessionService({
    identity: config.identity,
    allowlist: createStaticAllowlist(config.allowlist),
    users: createUserDirectory(db),
    sessions: createSessionStore(db),
  });
  const store = createAuditSqlStore(db);
  const audit = createAuditService({
    guard: { sessions },
    transaction: store.transaction,
    reader: store.reader,
    denialWriter: store.writer,
  });
  return {
    sessions,
    partners: createPartnerService({ sessions, audit, repository: createPartnerRepository(db) }),
  };
}

let pool: Pool | null = null;
function configuration() {
  const url = process.env.DATABASE_URL;
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const allowlist = process.env.CRM_ALLOWED_EMAILS;
  const demo = demoSignInEnabled();
  // The allowlist is always required: even dev sign-in is gated by it and the
  // session service re-checks it on every request.
  if (!url || !allowlist) throw new PartnerBackendUnavailableError();
  // The Google client id is only required outside the dev-only demo gate.
  if (!demo && !clientId) throw new PartnerBackendUnavailableError();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new PartnerBackendUnavailableError();
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:")
    throw new PartnerBackendUnavailableError();
  return { url, clientId: clientId ?? "", allowlist };
}
function sslConfiguration(url: string) {
  const explicit = process.env.DATABASE_SSL;
  if (explicit && !["disable", "require", "verify-full"].includes(explicit))
    throw new PartnerBackendUnavailableError();
  if (explicit === "disable") return false;
  if (explicit === "require") return { rejectUnauthorized: false };
  if (explicit === "verify-full") return { rejectUnauthorized: true };
  // Respect an explicit sslmode in DATABASE_URL; otherwise require verified TLS in production.
  if (new URL(url).searchParams.has("sslmode")) return undefined;
  return process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined;
}
const jwks = {
  async getKeys(): Promise<readonly JsonWebKey[]> {
    const response = await fetch("https://www.googleapis.com/oauth2/v3/certs", {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Google signing keys unavailable");
    const parsed: unknown = await response.json();
    if (!parsed || typeof parsed !== "object" || !("keys" in parsed) || !Array.isArray(parsed.keys))
      throw new Error("Invalid signing key response");
    return parsed.keys as JsonWebKey[];
  },
};
export async function withPartnerBackend<T>(
  run: (backend: ReturnType<typeof createPersistedBackend>) => Promise<T>,
): Promise<T> {
  const config = configuration();
  pool ??= new Pool({
    connectionString: config.url,
    ssl: sslConfiguration(config.url),
    max: 10,
    connectionTimeoutMillis: 5000,
  });
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    const db: SqlClient = {
      exec: async (sql) => {
        const command = sql.trim().toUpperCase();
        await client.query(sql);
        if (command === "BEGIN") transactionOpen = true;
        if (command === "COMMIT" || command === "ROLLBACK") transactionOpen = false;
      },
      query: async <T>(sql: string, params?: unknown[]) => {
        const result = await client.query(sql, params);
        return { rows: result.rows as T[] };
      },
    };
    return await run(
      createPersistedBackend(db, {
        identity: resolveIdentity(config.clientId),
        allowlist: config.allowlist,
      }),
    );
  } finally {
    // A connection with an unclosed transaction must never return to the pool.
    client.release(
      transactionOpen ? new Error("partner request left a transaction open") : undefined,
    );
  }
}
