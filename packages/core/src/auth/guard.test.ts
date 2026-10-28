/**
 * Proves the guard is the enforcement point: a denied request never reaches the handler and
 * therefore cannot mutate protected records, for every session state × role × action.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { ALL_ACTIONS, isMutatingAction } from "./actions";
import { parseAllowlist } from "./allowlist";
import { createGoogleIdentityVerifier } from "./google-id-token";
import { type DecisionEvent, runAuthorized } from "./guard";
import { authorize } from "./policy";
import { createSessionService } from "./session";
import {
  ALLOWLIST_RAW,
  generateTestKeyPair,
  InMemorySessions,
  InMemoryUsers,
  MutableClock,
  signJwt,
  syntheticUsers,
  TEST_CLIENT_ID,
  type TestKeyPair,
  validClaims,
} from "./test-support";

let key: TestKeyPair;
beforeAll(async () => {
  key = await generateTestKeyPair();
});

/** Stand-in for a protected record store; every handler writes to it. */
class ProtectedStore {
  records: string[] = ["seed"];
  writes = 0;
  write(value: string) {
    this.writes++;
    this.records.push(value);
  }
}

function build() {
  const clock = new MutableClock();
  const users = new InMemoryUsers(syntheticUsers.map((u) => ({ ...u })));
  const sessions = new InMemorySessions();
  const events: DecisionEvent[] = [];
  const liveAllowlist = parseAllowlist(ALLOWLIST_RAW);
  const service = createSessionService({
    identity: createGoogleIdentityVerifier({
      clientId: TEST_CLIENT_ID,
      jwks: { getKeys: async () => [key.publicJwk] },
      clock,
    }),
    allowlist: { isAllowed: (email) => liveAllowlist.has(email) },
    users,
    sessions,
    clock,
    viewerEnabled: true,
    sessionTtlMs: 60_000,
  });
  const login = async (email: string) => {
    const r = await service.signIn(await signJwt(key, validClaims(clock, { email })));
    if (!r.ok) throw new Error(`sign-in failed for ${email}`);
    return r.sessionToken;
  };
  return {
    clock,
    users,
    liveAllowlist,
    service,
    login,
    events,
    deps: { sessions: service, onDecision: (e: DecisionEvent) => void events.push(e) },
  };
}

describe("runAuthorized", () => {
  it("runs the handler for an authorized caller and passes the server-derived principal", async () => {
    const { deps, login } = build();
    const store = new ProtectedStore();
    const token = await login("staff@example.invalid");
    const result = await runAuthorized(deps, token, "partner.write", {}, (p) => {
      store.write(p.userId);
      return "done";
    });
    expect(result).toMatchObject({ ok: true, value: "done", principal: { userId: "u-staff" } });
    expect(store.writes).toBe(1);
  });

  it("never runs the handler without a session", async () => {
    const { deps } = build();
    const store = new ProtectedStore();
    for (const token of [undefined, null, "", "forged"]) {
      const result = await runAuthorized(deps, token, "partner.write", {}, () => store.write("x"));
      expect(result).toMatchObject({ ok: false, httpStatus: 401 });
    }
    expect(store.writes).toBe(0);
    expect(store.records).toEqual(["seed"]);
  });

  it("emits DENIED then ALLOWED decision events for the audit integration point", async () => {
    const { deps, login, events } = build();
    const viewer = await login("viewer@example.invalid");
    const lead = await login("tlbd@example.invalid");
    await runAuthorized(deps, viewer, "partner.write", {}, () => 1);
    await runAuthorized(deps, lead, "partner.write", {}, () => 1);
    await runAuthorized(deps, undefined, "partner.write", {}, () => 1);
    expect(events).toEqual([
      {
        action: "partner.write",
        outcome: "DENIED",
        actorUserId: "u-viewer",
        denialCode: "ACTION_NOT_PERMITTED",
      },
      { action: "partner.write", outcome: "ALLOWED", actorUserId: "u-tlbd" },
      { action: "partner.write", outcome: "DENIED", denialCode: "NO_SESSION" },
    ]);
  });

  it("decision events contain no email, token or payload fields", async () => {
    const { deps, login, events } = build();
    const token = await login("staff@example.invalid");
    await runAuthorized(deps, token, "partner.write", {}, () => 1);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("example.invalid");
    expect(serialized).not.toContain(token);
  });

  it("enforces LoA self-approval through the guard for both CRM Leads", async () => {
    const { deps, login } = build();
    const store = new ProtectedStore();
    for (const [email, id] of [
      ["tlbd@example.invalid", "u-tlbd"],
      ["lcvp.pd@example.invalid", "u-lcvp"],
    ] as const) {
      const token = await login(email);
      const self = await runAuthorized(deps, token, "loa.approve", { submitterUserId: id }, () =>
        store.write("approved"),
      );
      expect(self).toMatchObject({ ok: false, code: "SELF_APPROVAL_FORBIDDEN" });
    }
    expect(store.writes).toBe(0);

    const lcvp = await login("lcvp.pd@example.invalid");
    const other = await runAuthorized(
      deps,
      lcvp,
      "loa.approve",
      { submitterUserId: "u-tlbd" },
      () => store.write("approved"),
    );
    expect(other.ok).toBe(true);
    expect(store.writes).toBe(1);
  });

  it("denies unknown actions without running the handler", async () => {
    const { deps, login } = build();
    const store = new ProtectedStore();
    const token = await login("tlbd@example.invalid");
    const result = await runAuthorized(deps, token, "partner.delete_everything", {}, () =>
      store.write("x"),
    );
    expect(result).toMatchObject({ ok: false, code: "ACTION_UNKNOWN" });
    expect(store.writes).toBe(0);
  });
});

describe("denied requests cannot mutate protected records (state × role × action)", () => {
  type Mode = "valid" | "expired" | "revoked" | "inactive" | "not-allowlisted" | "no-token";

  const roles = [
    ["tlbd@example.invalid", "CRM_LEAD"],
    ["lcvp.pd@example.invalid", "CRM_LEAD"],
    ["staff@example.invalid", "BD_STAFF"],
    ["viewer@example.invalid", "VIEWER"],
  ] as const;
  const modes: Mode[] = ["valid", "expired", "revoked", "inactive", "not-allowlisted", "no-token"];

  for (const [email, role] of roles) {
    for (const mode of modes) {
      it(`${role} (${email.split("@")[0]}) in state ${mode}`, async () => {
        const ctx = build();
        const store = new ProtectedStore();
        let token: string | undefined = await ctx.login(email);

        if (mode === "expired") ctx.clock.advance(61_000);
        if (mode === "revoked") await ctx.service.signOut(token);
        if (mode === "inactive") {
          const user = [...ctx.users.users.values()].find((u) => u.email === email);
          if (user) ctx.users.users.set(user.userId, { ...user, isActive: false });
        }
        if (mode === "not-allowlisted") ctx.liveAllowlist.delete(email);
        if (mode === "no-token") token = undefined;

        let expectedWrites = 0;
        for (const action of ALL_ACTIONS) {
          const principalId =
            [...ctx.users.users.values()].find((u) => u.email === email)?.userId ?? "";
          const context = action === "loa.approve" ? { submitterUserId: "someone-else" } : {};
          const result = await runAuthorized(ctx.deps, token, action, context, () => {
            store.write(action);
          });

          const shouldAllow =
            mode === "valid" &&
            authorize({ userId: principalId, accessRole: role }, action, context).ok;
          expect(result.ok, `${role}/${mode}/${action}`).toBe(shouldAllow);
          if (shouldAllow) expectedWrites++;
          if (!shouldAllow) expect(store.writes).toBe(expectedWrites);
        }
        expect(store.writes).toBe(expectedWrites);
        if (mode !== "valid") {
          expect(store.writes).toBe(0);
          expect(store.records).toEqual(["seed"]);
        }
      });
    }
  }

  it("a viewer, even fully authenticated, cannot perform any mutating action", async () => {
    const ctx = build();
    const store = new ProtectedStore();
    const token = await ctx.login("viewer@example.invalid");
    for (const action of ALL_ACTIONS.filter(isMutatingAction)) {
      const r = await runAuthorized(ctx.deps, token, action, { submitterUserId: "x" }, () =>
        store.write(action),
      );
      expect(r.ok, action).toBe(false);
    }
    expect(store.writes).toBe(0);
  });
});
