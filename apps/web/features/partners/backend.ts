import type { IdentityVerifier } from "@crm/core";
import {
  createAuditService,
  createGoogleIdentityVerifier,
  createPartnerService,
  createSessionService,
  createStaticAllowlist,
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
  if (!url || !clientId || !allowlist) throw new PartnerBackendUnavailableError();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new PartnerBackendUnavailableError();
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:")
    throw new PartnerBackendUnavailableError();
  return { url, clientId, allowlist };
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
        identity: createGoogleIdentityVerifier({ clientId: config.clientId, jwks }),
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
