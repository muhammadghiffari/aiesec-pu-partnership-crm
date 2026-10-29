/** FR-200: HTTP boundary uses the same persisted, authenticated service as server pages. */
import { afterEach, describe, expect, it } from "vitest";
import { createPersistedBackend } from "../../apps/web/features/partners/backend";
import { createPartnerHttp } from "../../apps/web/features/partners/http";
import { freshDb, insert } from "../../packages/db/src/test-support";

describe("partner HTTP integration", () => {
  const databases: Array<{ close(): Promise<void> }> = [];
  afterEach(async () => {
    for (const db of databases.splice(0)) await db.close();
  });
  it("denies anonymous reads and persists an authenticated create/list/detail round trip", async () => {
    const db = await freshDb();
    databases.push(db);
    await insert(db, "users", {
      email: "lead@example.invalid",
      name: "Synthetic Lead",
      access_role: "CRM_LEAD",
    });
    await insert(db, "industry_categories", { code: "EDUCATION", name: "Education" });
    const backend = createPersistedBackend(db, {
      identity: {
        verify: async () => ({
          subject: "synthetic",
          email: "lead@example.invalid",
          emailVerified: true,
        }),
      },
      allowlist: "lead@example.invalid",
    });
    const signed = await backend.sessions.signIn("synthetic-only-test-token");
    if (!signed.ok) throw new Error("synthetic session rejected");
    const handlers = createPartnerHttp(async (run) => run(backend));
    expect(
      (await handlers.list(new Request("https://crm.example.invalid/api/partners"))).status,
    ).toBe(401);
    const headers = {
      "content-type": "application/json",
      origin: "https://crm.example.invalid",
      cookie: `crm_session=${signed.sessionToken}`,
    };
    const created = await handlers.create(
      new Request("https://crm.example.invalid/api/partners", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "Synthetic Academy",
          industry: "EDUCATION",
          sourceDescription: "Directory",
          sourceTier: "research",
          contact: {
            name: "Synthetic PIC",
            email: "pic@example.invalid",
            sourceTier: "research",
            lawfulBasisNote: "Public listing",
          },
        }),
      }),
    );
    expect(created.status).toBe(201);
    const data = (await created.json()) as { partner: { id: string } };
    const list = await handlers.list(
      new Request("https://crm.example.invalid/api/partners?q=Synthetic", { headers }),
    );
    expect(((await list.json()) as { partners: unknown[] }).partners).toHaveLength(1);
    expect(
      (
        await handlers.get(new Request("https://crm.example.invalid/api/partners/x", { headers }), {
          params: Promise.resolve({ id: data.partner.id }),
        })
      ).status,
    ).toBe(200);
    const params = { params: Promise.resolve({ id: data.partner.id }) };
    expect(
      (
        await handlers.list(
          new Request("https://crm.example.invalid/api/partners?industry=INVALID", { headers }),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await handlers.get(new Request("https://crm.example.invalid/api/partners/x", { headers }), {
          params: Promise.resolve({ id: crypto.randomUUID() }),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await handlers.create(
          new Request("https://crm.example.invalid/api/partners", {
            method: "POST",
            headers,
            body: "{",
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handlers.create(
          new Request("https://crm.example.invalid/api/partners", {
            method: "POST",
            headers,
            body: JSON.stringify({ name: "" }),
          }),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await handlers.patch(
          new Request("https://crm.example.invalid/api/partners/x", {
            method: "PATCH",
            headers: { ...headers, origin: "https://evil.example.invalid" },
            body: JSON.stringify({ kind: "partner", name: "Untrusted" }),
          }),
          params,
        )
      ).status,
    ).toBe(403);
    const edited = await handlers.patch(
      new Request("https://crm.example.invalid/api/partners/x", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          kind: "partner",
          name: "Synthetic Institute",
          sourceDescription: "Referral",
        }),
      }),
      params,
    );
    expect(edited.status).toBe(200);
    const added = await handlers.patch(
      new Request("https://crm.example.invalid/api/partners/x", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          kind: "contact",
          name: "Other Synthetic PIC",
          email: "other@example.invalid",
          sourceTier: "research",
          lawfulBasisNote: "Public directory",
        }),
      }),
      params,
    );
    expect(added.status).toBe(200);
    const phoneOnly = await handlers.patch(
      new Request("https://crm.example.invalid/api/partners/x", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          kind: "contact",
          name: "Phone Only PIC",
          phone: "+62 812 0000 0101",
          sourceTier: "research",
          lawfulBasisNote: "Public phone directory",
        }),
      }),
      params,
    );
    expect(phoneOnly.status).toBe(200);
    const noChannel = await handlers.patch(
      new Request("https://crm.example.invalid/api/partners/x", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          kind: "contact",
          name: "No Channel PIC",
          sourceTier: "research",
          lawfulBasisNote: "No channel supplied",
        }),
      }),
      params,
    );
    expect(noChannel.status).toBe(422);
    expect(await backend.partners.getById(signed.sessionToken, data.partner.id)).toMatchObject({
      ok: true,
      value: { name: "Synthetic Institute", contacts: [{}, {}, {}] },
    });
    await db.exec(
      "ALTER TABLE partners ADD CONSTRAINT reject_synthetic_partner CHECK (name <> 'Another Synthetic Partner')",
    );
    const failed = await handlers.create(
      new Request("https://crm.example.invalid/api/partners", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "Another Synthetic Partner",
          industry: "EDUCATION",
          sourceDescription: "Directory",
          sourceTier: "research",
        }),
      }),
    );
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "internal_error" });
    expect((await db.query("SELECT * FROM partners")).rows).toHaveLength(1);
  });
});
