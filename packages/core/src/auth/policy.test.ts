/**
 * FR-100 role × action matrix. The expected table below is written out independently of
 * policy.ts so a policy edit that silently widens access fails here.
 */

import { describe, expect, it } from "vitest";
import { ACTION_CATALOG, type Action, ALL_ACTIONS, isMutatingAction } from "./actions";
import { authorize, permissionsFor, ROLE_PERMISSIONS } from "./policy";
import { ACCESS_ROLES, type AccessRole } from "./types";

const VIEWER_ALLOWED: Action[] = ["partner.read", "cycle.read", "ratecard.read", "report.view"];

const STAFF_ONLY_ALLOWED: Action[] = [
  "partner.write",
  "contact.read",
  "contact.write",
  "cycle.write",
  "research.work",
  "outreach.draft",
  "outreach.approve",
  "outreach.record_send",
  "meeting.write",
  "mom.finalize",
  "snd.confirm",
  "proposal.write",
  "loa.submit",
  "implementation.write",
  "revenue.record",
  "engagement.write",
  "survey.write",
  "reraise.decide",
  "merchandise.write",
  "internal_notes.read",
  "dashboard.view_own",
];

const LEAD_ONLY_ALLOWED: Action[] = [
  "loa.approve",
  "ratecard.edit",
  "package.edit",
  "dashboard.view_all",
  "export.run",
  "import.run",
  "config.manage",
  "taxonomy.configure",
  "user.manage",
  "quota.manage",
  "ai.control",
  "gate.override",
  "audit.read",
];

const EXPECTED: Record<AccessRole, Set<Action>> = {
  VIEWER: new Set(VIEWER_ALLOWED),
  BD_STAFF: new Set([...VIEWER_ALLOWED, ...STAFF_ONLY_ALLOWED]),
  CRM_LEAD: new Set([...VIEWER_ALLOWED, ...STAFF_ONLY_ALLOWED, ...LEAD_ONLY_ALLOWED]),
};

// Context that satisfies loa.approve's separation-of-duties input (a different submitter).
const ctx = { submitterUserId: "someone-else" };

describe("role × action matrix (exhaustive)", () => {
  it("the expected table covers every catalogued action exactly once", () => {
    const listed = [...VIEWER_ALLOWED, ...STAFF_ONLY_ALLOWED, ...LEAD_ONLY_ALLOWED];
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual([...ALL_ACTIONS].sort());
  });

  for (const role of ACCESS_ROLES) {
    for (const action of ALL_ACTIONS) {
      const expected = EXPECTED[role].has(action);
      it(`${role} ${expected ? "may" : "may NOT"} ${action}`, () => {
        const decision = authorize({ userId: "actor", accessRole: role }, action, ctx);
        expect(decision.ok).toBe(expected);
        if (!decision.ok) {
          expect(decision.code).toBe("ACTION_NOT_PERMITTED");
          expect(decision.httpStatus).toBe(403);
        }
      });
    }
  }

  it("policy table has no grant outside the catalog", () => {
    for (const role of ACCESS_ROLES) {
      for (const action of ROLE_PERMISSIONS[role]) {
        expect(Object.hasOwn(ACTION_CATALOG, action)).toBe(true);
      }
    }
  });

  it("permissions are strictly nested: VIEWER ⊂ BD_STAFF ⊂ CRM_LEAD", () => {
    const v = new Set(permissionsFor("VIEWER"));
    const s = new Set(permissionsFor("BD_STAFF"));
    const l = new Set(permissionsFor("CRM_LEAD"));
    expect([...v].every((a) => s.has(a)) && s.size > v.size).toBe(true);
    expect([...s].every((a) => l.has(a)) && l.size > s.size).toBe(true);
  });

  it("VIEWER holds no mutating action and cannot export or override", () => {
    for (const action of permissionsFor("VIEWER")) expect(isMutatingAction(action)).toBe(false);
    for (const action of ["export.run", "gate.override", "audit.read"] as const) {
      expect(authorize({ userId: "v", accessRole: "VIEWER" }, action).ok).toBe(false);
    }
  });
});

describe("CRM Lead parity (D-007): TL BD and LCVP PD are one permission set", () => {
  const tlBd = { userId: "u-tlbd", accessRole: "CRM_LEAD" as const, organizationalTitle: "TL BD" };
  const lcvp = {
    userId: "u-lcvp",
    accessRole: "CRM_LEAD" as const,
    organizationalTitle: "LCVP PD",
  };

  it("yields identical decisions for every action", () => {
    for (const action of ALL_ACTIONS) {
      const a = authorize(tlBd, action, ctx);
      const b = authorize(lcvp, action, ctx);
      expect(b).toEqual(a);
    }
  });

  it("organizational title never influences the decision", () => {
    const staffWithLeadTitle = {
      userId: "u-x",
      accessRole: "BD_STAFF" as const,
      organizationalTitle: "TL BD",
    };
    expect(authorize(staffWithLeadTitle, "gate.override").ok).toBe(false);
    expect(authorize(staffWithLeadTitle, "ratecard.edit").ok).toBe(false);
    const leadWithOddTitle = {
      userId: "u-y",
      accessRole: "CRM_LEAD" as const,
      organizationalTitle: "Intern",
    };
    expect(authorize(leadWithOddTitle, "ratecard.edit").ok).toBe(true);
  });

  it("both leads can perform staff workflows and lead-only actions", () => {
    for (const lead of [tlBd, lcvp]) {
      for (const action of [...STAFF_ONLY_ALLOWED, ...LEAD_ONLY_ALLOWED]) {
        expect(authorize(lead, action, ctx).ok, `${lead.organizationalTitle} ${action}`).toBe(true);
      }
    }
  });
});

describe("LoA separation of duties (D-009)", () => {
  it("denies approving a LoA the actor submitted, for every role", () => {
    for (const role of ACCESS_ROLES) {
      const decision = authorize({ userId: "u1", accessRole: role }, "loa.approve", {
        submitterUserId: "u1",
      });
      expect(decision.ok).toBe(false);
    }
    const lead = authorize({ userId: "u1", accessRole: "CRM_LEAD" }, "loa.approve", {
      submitterUserId: "u1",
    });
    expect(lead).toMatchObject({ ok: false, code: "SELF_APPROVAL_FORBIDDEN", httpStatus: 403 });
  });

  it("applies to both CRM Leads equally", () => {
    for (const id of ["u-tlbd", "u-lcvp"]) {
      expect(
        authorize({ userId: id, accessRole: "CRM_LEAD" }, "loa.approve", { submitterUserId: id }),
      ).toMatchObject({ ok: false, code: "SELF_APPROVAL_FORBIDDEN" });
    }
  });

  it("allows a different CRM Lead to approve", () => {
    expect(
      authorize({ userId: "u-lcvp", accessRole: "CRM_LEAD" }, "loa.approve", {
        submitterUserId: "u-tlbd",
      }).ok,
    ).toBe(true);
  });

  it("fails closed when the submitter is not supplied", () => {
    expect(authorize({ userId: "u-lcvp", accessRole: "CRM_LEAD" }, "loa.approve")).toMatchObject({
      ok: false,
      code: "CONTEXT_REQUIRED",
    });
    expect(
      authorize({ userId: "u-lcvp", accessRole: "CRM_LEAD" }, "loa.approve", {
        submitterUserId: "",
      }),
    ).toMatchObject({ ok: false, code: "CONTEXT_REQUIRED" });
  });

  it("staff cannot approve LoAs even when not the submitter", () => {
    expect(
      authorize({ userId: "s", accessRole: "BD_STAFF" }, "loa.approve", { submitterUserId: "x" }),
    ).toMatchObject({ ok: false, code: "ACTION_NOT_PERMITTED" });
  });
});

describe("fail-closed behaviour", () => {
  it("denies unknown actions, including prototype keys", () => {
    for (const action of ["nope", "", "constructor", "__proto__", "toString", "partner.read "]) {
      expect(authorize({ userId: "u", accessRole: "CRM_LEAD" }, action)).toMatchObject({
        ok: false,
        code: "ACTION_UNKNOWN",
      });
    }
  });

  it("denies an unrecognised role at runtime", () => {
    const decision = authorize(
      { userId: "u", accessRole: "SUPER_ADMIN" as unknown as AccessRole },
      "partner.read",
    );
    expect(decision.ok).toBe(false);
  });
});
