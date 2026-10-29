/** FR-200: a production request must never read or write the synthetic mock. */
import { describe, expect, it } from "vitest";
import {
  PATCH as editPartner,
  GET as readPartner,
} from "../../apps/web/app/api/partners/[id]/route";
import { POST as createPartner, GET as listPartners } from "../../apps/web/app/api/partners/route";
import {
  createPersistedBackend,
  PartnerBackendUnavailableError,
  readSessionCookie,
  withPartnerBackend,
} from "../../apps/web/features/partners/backend";
import { MockPartnerService } from "../../apps/web/features/partners/mock-service";
import { ESSM_INDUSTRIES as uiCategories } from "../../apps/web/features/partners/types";
import { ESSM_INDUSTRIES as domainCategories } from "../../packages/core/src/partners/models";
import { freshDb, insert } from "../../packages/db/src/test-support";

describe("production partner boundary", () => {
  it("shares the single official industry list with the domain", () => {
    expect(uiCategories).toBe(domainCategories);
  });
  it("only reads the opaque session cookie, never a development principal header", () => {
    expect(readSessionCookie(new Headers({ "x-dev-principal-role": "CRM_LEAD" }))).toBeNull();
    expect(
      readSessionCookie(new Headers({ cookie: "other=ignored; crm_session=opaque-token" })),
    ).toBe("opaque-token");
  });
  it("composes the real persisted session and audited partner service", async () => {
    const db = await freshDb();
    try {
      await insert(db, "users", {
        email: "lead@example.invalid",
        name: "Synthetic Lead",
        access_role: "CRM_LEAD",
      });
      await insert(db, "industry_categories", { code: "EDUCATION", name: "Education" });
      const app = createPersistedBackend(db, {
        identity: {
          verify: async () => ({
            subject: "synthetic",
            email: "lead@example.invalid",
            emailVerified: true,
          }),
        },
        allowlist: "lead@example.invalid",
      });
      const signed = await app.sessions.signIn("synthetic-only-test-token");
      if (!signed.ok) throw new Error("sign-in rejected");
      const result = await app.partners.create(signed.sessionToken, {
        name: "Synthetic Partner",
        industry: "EDUCATION",
        sourceDescription: "Directory",
        sourceTier: "research",
      });
      expect(result.ok).toBe(true);
      expect((await db.query("SELECT * FROM partners")).rows).toHaveLength(1);
    } finally {
      await db.close();
    }
  });
  it("fails closed without a configured PostgreSQL connection", async () => {
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      await expect(
        withPartnerBackend(async ({ partners }) =>
          partners.search(null, { q: "", industry: null }),
        ),
      ).rejects.toThrow(PartnerBackendUnavailableError);
    } finally {
      if (original === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = original;
    }
  });
  it("rejects an unknown DATABASE_SSL mode instead of silently ignoring it", async () => {
    const keys = [
      "DATABASE_URL",
      "GOOGLE_OAUTH_CLIENT_ID",
      "CRM_ALLOWED_EMAILS",
      "DATABASE_SSL",
    ] as const;
    const saved = keys.map((key) => [key, process.env[key]] as const);
    process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:1/crm";
    process.env.GOOGLE_OAUTH_CLIENT_ID = "synthetic.apps.googleusercontent.com";
    process.env.CRM_ALLOWED_EMAILS = "lead@example.invalid";
    process.env.DATABASE_SSL = "sometimes";
    try {
      await expect(
        withPartnerBackend(async ({ partners }) =>
          partners.search(null, { q: "", industry: null }),
        ),
      ).rejects.toThrow(PartnerBackendUnavailableError);
    } finally {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("keeps synthetic fixtures available to explicit tests only", () => {
    expect(new MockPartnerService().all()).toHaveLength(2);
  });

  it("never returns fixture records from the production list endpoint", async () => {
    const response = await listPartners(
      new Request("http://localhost/api/partners", {
        headers: { "x-dev-principal-role": "CRM_LEAD" },
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "service_unavailable" });
  });

  it("cannot save a partner while the audited backend is missing", async () => {
    const response = await createPartner(
      new Request("http://localhost/api/partners", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
          "x-dev-principal-role": "CRM_LEAD",
        },
        body: JSON.stringify({ name: "Synthetic Example" }),
      }),
    );
    expect(response.status).toBe(503);
  });

  it("cannot read or edit a synthetic contact through production detail routes", async () => {
    const params = { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) };
    expect((await readPartner(new Request("http://localhost/api/partners/1"), params)).status).toBe(
      503,
    );
    const response = await editPartner(
      new Request("http://localhost/api/partners/1", {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({
          kind: "dnc",
          contactId: "synthetic",
          doNotContact: true,
          reason: "requested",
        }),
      }),
      params,
    );
    expect(response.status).toBe(503);
  });
});
