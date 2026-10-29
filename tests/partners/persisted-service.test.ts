/** FR-200: service authorization and audit guard run against migrated PostgreSQL. */
import { afterEach, describe, expect, it } from "vitest";
import { createAuditService } from "../../packages/core/src/audit/service";
import { createSessionService, hashSessionToken } from "../../packages/core/src/auth/session";
import { createPartnerService } from "../../packages/core/src/partners/service";
import { createAuditSqlStore } from "../../packages/db/src/audit-store";
import { createPartnerRepository } from "../../packages/db/src/partners";
import { createSessionStore, createUserDirectory } from "../../packages/db/src/sessions";
import { freshDb, insert } from "../../packages/db/src/test-support";

describe("persisted partner service", () => {
  const databases: Array<{ close(): Promise<void> }> = [];
  afterEach(async () => {
    for (const db of databases.splice(0)) await db.close();
  });
  it("rejects unauthenticated creation without a write or audit event", async () => {
    const db = await freshDb();
    databases.push(db);
    await insert(db, "industry_categories", { code: "EDUCATION", name: "Education" });
    const sessions = createSessionService({
      identity: {
        verify: async () => ({
          subject: "synthetic",
          email: "lead@example.invalid",
          emailVerified: true,
        }),
      },
      allowlist: { isAllowed: () => true },
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
    const service = createPartnerService({
      sessions,
      audit,
      repository: createPartnerRepository(db),
    });
    const result = await service.create(null, {
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
    });
    expect(result).toMatchObject({ ok: false, httpStatus: 401 });
    expect((await db.query("SELECT * FROM partners")).rows).toHaveLength(0);
    expect((await db.query("SELECT * FROM audit_log")).rows).toHaveLength(0);
  });
  it("requires a human duplicate decision and audits the confirmed persisted creation", async () => {
    const db = await freshDb();
    databases.push(db);
    await insert(db, "industry_categories", { code: "EDUCATION", name: "Education" });
    await insert(db, "users", {
      email: "lead@example.invalid",
      name: "Synthetic Lead",
      access_role: "CRM_LEAD",
    });
    const sessions = createSessionService({
      identity: {
        verify: async () => ({
          subject: "synthetic",
          email: "lead@example.invalid",
          emailVerified: true,
        }),
      },
      allowlist: { isAllowed: () => true },
      users: createUserDirectory(db),
      sessions: createSessionStore(db),
    });
    const signed = await sessions.signIn("synthetic-only-test-token");
    if (!signed.ok) throw new Error("synthetic test session not created");
    const store = createAuditSqlStore(db);
    const audit = createAuditService({
      guard: { sessions },
      transaction: store.transaction,
      reader: store.reader,
      denialWriter: store.writer,
    });
    const service = createPartnerService({
      sessions,
      audit,
      repository: createPartnerRepository(db),
    });
    const input = {
      name: "Synthetic Academy",
      industry: "EDUCATION",
      sourceDescription: "Directory",
      sourceTier: "research",
      websiteDomain: "academy.example",
      contact: {
        name: "Synthetic PIC",
        email: "pic@example.invalid",
        sourceTier: "research",
        lawfulBasisNote: "Public listing",
      },
    };
    const first = await service.create(signed.sessionToken, input);
    expect(first.ok).toBe(true);
    const duplicate = await service.create(signed.sessionToken, {
      ...input,
      contact: { ...input.contact, email: "other@example.invalid" },
    });
    expect(duplicate).toMatchObject({
      ok: false,
      code: "duplicate_confirmation_required",
      httpStatus: 409,
    });
    expect((await db.query("SELECT * FROM partners")).rows).toHaveLength(1);
    expect((await db.query("SELECT * FROM audit_log")).rows).toHaveLength(1);
    const confirmed = await service.create(signed.sessionToken, {
      ...input,
      name: "Synthetic Academy Branch",
      contact: { ...input.contact, email: "other@example.invalid" },
      confirmDuplicate: true,
    });
    expect(confirmed.ok).toBe(true);
    expect((await db.query("SELECT * FROM partners")).rows).toHaveLength(2);
    if (!first.ok) throw new Error("first save failed");
    expect(
      await service.update(signed.sessionToken, first.value.id, {
        name: "Synthetic Academy Branch",
      }),
    ).toMatchObject({ ok: false, httpStatus: 409 });
    expect(
      await service.update(signed.sessionToken, first.value.id, {
        name: "Synthetic Academy Branch",
        confirmDuplicate: true,
      }),
    ).toMatchObject({ ok: true });
  });
  it("updates the partner and contact only for an authenticated writer, retaining provenance and DNC reason", async () => {
    const db = await freshDb();
    databases.push(db);
    await insert(db, "industry_categories", { code: "EDUCATION", name: "Education" });
    await insert(db, "users", {
      email: "lead@example.invalid",
      name: "Synthetic Lead",
      access_role: "CRM_LEAD",
    });
    const sessions = createSessionService({
      identity: {
        verify: async () => ({
          subject: "synthetic",
          email: "lead@example.invalid",
          emailVerified: true,
        }),
      },
      allowlist: { isAllowed: () => true },
      users: createUserDirectory(db),
      sessions: createSessionStore(db),
    });
    const signed = await sessions.signIn("synthetic-only-test-token");
    if (!signed.ok) throw new Error("sign-in failed");
    const store = createAuditSqlStore(db);
    const audit = createAuditService({
      guard: { sessions },
      transaction: store.transaction,
      reader: store.reader,
      denialWriter: store.writer,
    });
    const service = createPartnerService({
      sessions,
      audit,
      repository: createPartnerRepository(db),
    });
    const created = await service.create(signed.sessionToken, {
      name: "Synthetic Academy",
      industry: "EDUCATION",
      sourceDescription: "Directory",
      sourceTier: "research",
    });
    if (!created.ok) throw new Error("create failed");
    const id = created.value.id;
    const edited = await service.update(signed.sessionToken, id, {
      name: "Synthetic Institute",
      sourceDescription: "Referral",
    });
    expect(edited.ok && edited.value.sourceDescription).toBe("Referral");
    const added = await service.createContact(signed.sessionToken, id, {
      name: "Synthetic PIC",
      email: "pic@example.invalid",
      phone: "+62 812 0000 0099",
      sourceTier: "research",
      lawfulBasisNote: "Public directory",
      sourceUrl: "https://example.invalid/contact",
    });
    if (!added.ok) throw new Error("contact failed");
    const person = added.value;
    expect(person.verification).toBe("unverified");
    expect(
      await service.createContact(signed.sessionToken, id, {
        name: "Other Synthetic PIC",
        email: "pic@example.invalid",
        sourceTier: "research",
        lawfulBasisNote: "Public directory",
      }),
    ).toMatchObject({ ok: false, code: "duplicate_contact", httpStatus: 409 });
    expect(
      await service.updateContact(signed.sessionToken, id, {
        contactId: person.id,
        title: "Synthetic Manager",
        lawfulBasisNote: "Official contact page",
      }),
    ).toMatchObject({
      ok: true,
      value: { title: "Synthetic Manager", lawfulBasisNote: "Official contact page" },
    });
    expect(
      await service.setVerification(signed.sessionToken, id, {
        contactId: person.id,
        verification: "verified",
        sourceTier: "official",
        lawfulBasisNote: "Official staff directory",
      }),
    ).toMatchObject({
      ok: true,
      value: {
        verification: "verified",
        sourceTier: "official",
        lawfulBasisNote: "Official staff directory",
      },
    });
    expect(
      await service.setDnc(signed.sessionToken, id, {
        contactId: person.id,
        doNotContact: true,
        reason: "Contact requested no outreach",
      }),
    ).toMatchObject({ ok: true, value: { doNotContact: true } });

    // Removing both channels in one edit must not leave a contact with no way to reach them.
    expect(
      await service.updateContact(signed.sessionToken, id, {
        contactId: person.id,
        email: null,
        phone: null,
      }),
    ).toMatchObject({ ok: false, code: "validation_failed", httpStatus: 422 });
    const retained = await service.getById(signed.sessionToken, id);
    expect(retained.ok && retained.value.contacts.find((c) => c.id === person.id)?.email).toBe(
      "pic@example.invalid",
    );

    // A legacy contact without a channel cannot be marked verified, even with a source URL.
    const legacy = await insert(db, "contacts", {
      partner_id: id,
      name: "Legacy Contact",
      lawful_basis_note: "Legacy import",
      source_tier: "RESEARCH",
    });
    expect(
      await service.setVerification(signed.sessionToken, id, {
        contactId: String(legacy.contact_id),
        verification: "verified",
        sourceUrl: "https://example.invalid/legacy",
      }),
    ).toMatchObject({
      ok: false,
      code: "validation_failed",
      httpStatus: 422,
      issues: [{ path: "contactId" }],
    });

    expect((await db.query("SELECT * FROM audit_log")).rows).toHaveLength(6);
  });
  it("denies an expired cookie and keeps contact PII away from a viewer", async () => {
    const db = await freshDb();
    databases.push(db);
    const category = await insert(db, "industry_categories", {
      code: "EDUCATION",
      name: "Education",
    });
    const viewer = await insert(db, "users", {
      email: "viewer@example.invalid",
      name: "Synthetic Viewer",
      access_role: "VIEWER",
    });
    const row = await insert(db, "partners", {
      name: "Synthetic School",
      industry_category_id: category.category_id,
      source: "Directory",
    });
    await insert(db, "contacts", {
      partner_id: row.partner_id,
      name: "Synthetic PIC",
      email: "pic@example.invalid",
      lawful_basis_note: "Directory",
    });
    const sessions = createSessionService({
      identity: {
        verify: async () => ({
          subject: "synthetic",
          email: "viewer@example.invalid",
          emailVerified: true,
        }),
      },
      allowlist: { isAllowed: () => true },
      users: createUserDirectory(db),
      sessions: createSessionStore(db),
      viewerEnabled: true,
    });
    const store = createAuditSqlStore(db);
    const audit = createAuditService({
      guard: { sessions },
      transaction: store.transaction,
      reader: store.reader,
      denialWriter: store.writer,
    });
    const service = createPartnerService({
      sessions,
      audit,
      repository: createPartnerRepository(db),
    });
    const oldToken = "synthetic-expired-session";
    await createSessionStore(db).create({
      sessionId: crypto.randomUUID(),
      userId: String(viewer.user_id),
      tokenHash: await hashSessionToken(oldToken),
      createdAt: new Date("2020-01-01"),
      expiresAt: new Date("2020-01-02"),
    });
    expect(await service.search(oldToken, { q: "", industry: null })).toMatchObject({
      ok: false,
      httpStatus: 401,
    });
    const signed = await sessions.signIn("synthetic-only-test-token");
    if (!signed.ok) throw new Error("sign-in failed");
    expect(await service.getById(signed.sessionToken, String(row.partner_id))).toMatchObject({
      ok: true,
      value: { contacts: [] },
    });
    expect(
      await service.search(signed.sessionToken, { q: "pic@example.invalid", industry: null }),
    ).toMatchObject({ ok: true, value: [] });
    expect(
      await service.createContact(signed.sessionToken, String(row.partner_id), {
        name: "Other PIC",
        email: "other@example.invalid",
        sourceTier: "research",
        lawfulBasisNote: "Directory",
      }),
    ).toMatchObject({ ok: false, httpStatus: 403 });
    expect((await db.query<{ kind: string }>("SELECT kind FROM audit_log")).rows).toEqual([
      { kind: "ACCESS_DENIED" },
    ]);
  });
  it("rolls back partner and contact when the append-only audit insert fails", async () => {
    const db = await freshDb();
    databases.push(db);
    await insert(db, "industry_categories", { code: "EDUCATION", name: "Education" });
    await insert(db, "users", {
      email: "lead@example.invalid",
      name: "Synthetic Lead",
      access_role: "CRM_LEAD",
    });
    const sessions = createSessionService({
      identity: {
        verify: async () => ({
          subject: "synthetic",
          email: "lead@example.invalid",
          emailVerified: true,
        }),
      },
      allowlist: { isAllowed: () => true },
      users: createUserDirectory(db),
      sessions: createSessionStore(db),
    });
    const signed = await sessions.signIn("synthetic-only-test-token");
    if (!signed.ok) throw new Error("sign-in failed");
    const store = createAuditSqlStore(db);
    const audit = createAuditService({
      guard: { sessions },
      transaction: store.transaction,
      reader: store.reader,
      denialWriter: store.writer,
    });
    const service = createPartnerService({
      sessions,
      audit,
      repository: createPartnerRepository(db),
    });
    await db.exec("ALTER TABLE audit_log ADD CONSTRAINT reject_synthetic_audits CHECK (false)");
    await expect(
      service.create(signed.sessionToken, {
        name: "Synthetic Partner",
        industry: "EDUCATION",
        sourceDescription: "Directory",
        sourceTier: "research",
        contact: {
          name: "Synthetic PIC",
          email: "pic@example.invalid",
          sourceTier: "research",
          lawfulBasisNote: "Public directory",
        },
      }),
    ).rejects.toThrow("audit write failed");
    expect((await db.query("SELECT * FROM partners")).rows).toHaveLength(0);
    expect((await db.query("SELECT * FROM contacts")).rows).toHaveLength(0);
  });
});
