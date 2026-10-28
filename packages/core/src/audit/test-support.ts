/**
 * Test-only harness for audit tests: a transactional domain store with real rollback, wired to
 * the auth test-support session service. Synthetic data only. Not exported from the index.
 */

import { createStaticAllowlist } from "../auth/allowlist";
import { createGoogleIdentityVerifier } from "../auth/google-id-token";
import { createSessionService } from "../auth/session";
import {
  ALLOWLIST_RAW,
  generateTestKeyPair,
  InMemorySessions,
  InMemoryUsers,
  MutableClock,
  signJwt,
  syntheticUsers,
  TEST_CLIENT_ID,
  validClaims,
} from "../auth/test-support";
import { createInMemoryAuditStore } from "./memory-store";
import { createAuditService } from "./service";
import type { AuditEvent, AuditedTransaction, AuditStore, AuditWriter } from "./types";

/** Anything the harness can roll back when a transaction fails. */
export interface Rollbackable {
  snapshot(): unknown;
  restore(snapshot: unknown): void;
}

/** Protected domain records. `restore` models a DB rollback. */
export class DomainStore {
  records = new Map<string, string>([["partner-1", "Synthetic Partner"]]);
  writes = 0;
  write(id: string, value: string) {
    this.writes++;
    this.records.set(id, value);
  }
  snapshot() {
    return { records: new Map(this.records), writes: this.writes };
  }
  restore(s: { records: Map<string, string>; writes: number }) {
    this.records = new Map(s.records);
    this.writes = s.writes;
  }
}

export async function buildAuditHarness(
  options: {
    failAudit?: boolean;
    store?: AuditStore;
    denialWriterFails?: boolean;
    viewerEnabled?: boolean;
    /** Extra domain store rolled back together with the default one. */
    extraDomain?: Rollbackable;
  } = {},
) {
  const key = await generateTestKeyPair();
  const clock = new MutableClock();
  const users = new InMemoryUsers(syntheticUsers.map((u) => ({ ...u })));
  const sessionService = createSessionService({
    identity: createGoogleIdentityVerifier({
      clientId: TEST_CLIENT_ID,
      jwks: { getKeys: async () => [key.publicJwk] },
      clock,
    }),
    allowlist: createStaticAllowlist(ALLOWLIST_RAW),
    users,
    sessions: new InMemorySessions(),
    clock,
    viewerEnabled: options.viewerEnabled ?? true,
  });

  const auditStore = options.store ?? createInMemoryAuditStore();
  const domain = new DomainStore();
  let ids = 0;

  const transaction: AuditedTransaction = async (work) => {
    const snapshot = domain.snapshot();
    const extraSnapshot = options.extraDomain?.snapshot();
    const buffered: AuditEvent[] = [];
    const writer: AuditWriter = {
      async append(event) {
        if (options.failAudit) throw new Error("audit store unavailable");
        buffered.push(event);
        return event;
      },
    };
    try {
      const result = await work(writer);
      for (const event of buffered) await auditStore.append(event);
      return result;
    } catch (error) {
      domain.restore(snapshot);
      if (options.extraDomain) options.extraDomain.restore(extraSnapshot);
      throw error;
    }
  };

  const denialWriter: AuditWriter = options.denialWriterFails
    ? {
        async append() {
          throw new Error("denial log unavailable");
        },
      }
    : auditStore;

  const audit = createAuditService({
    guard: { sessions: sessionService },
    transaction,
    reader: auditStore,
    denialWriter,
    clock,
    newId: () => `evt-${String(++ids).padStart(4, "0")}`,
  });

  const login = async (email: string) => {
    const r = await sessionService.signIn(await signJwt(key, validClaims(clock, { email })));
    if (!r.ok) throw new Error(`sign-in failed: ${r.code}`);
    return r.sessionToken;
  };

  return { audit, auditStore, domain, clock, login, users, sessionService };
}
