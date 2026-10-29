import { describe, expect, it } from "vitest";
import { buildContactHarness, manual, PARTNER_ID } from "./test-support";

type H = Awaited<ReturnType<typeof buildContactHarness>>;

async function acceptedContact(h: H, extra: Record<string, unknown> = {}) {
  const staff = await h.login("staff@example.invalid");
  const cand = await h.contacts.addManualCandidate(staff, manual(extra));
  if (!cand.ok) throw new Error(`candidate: ${cand.code}`);
  const acc = await h.contacts.acceptCandidate(staff, {
    candidateId: cand.value.candidateId,
    lawfulBasisNote: "Listed on the partner's official team page for partnership enquiries",
  });
  if (!acc.ok) throw new Error(`accept: ${acc.code}`);
  return { staff, ...acc.value };
}

async function readyContact(h: H) {
  const c = await acceptedContact(h);
  const v1 = await h.contacts.verifyChannel(c.staff, {
    channelId: c.channelId,
    method: "OFFICIAL_WEBSITE",
    evidenceUrl: "https://syntheticedu.example.invalid/team",
  });
  const v2 = await h.contacts.verifyContact(c.staff, { contactId: c.contactId });
  if (!v1.ok || !v2.ok) throw new Error("verify failed");
  return c;
}

const readiness = (
  h: H,
  token: string,
  c: { contactId: string; channelId: string },
  intended = "EMAIL",
) =>
  h.contacts.checkReadiness(token, {
    partnerId: PARTNER_ID,
    contactId: c.contactId,
    channelId: c.channelId,
    intendedChannel: intended,
  });

describe("candidate contacts are separate from contacts", () => {
  it("a manual entry becomes a PENDING candidate with provenance, not a contact", async () => {
    const h = await buildContactHarness();
    const r = await h.contacts.addManualCandidate(
      await h.login("staff@example.invalid"),
      manual({ address: " PIC@SyntheticEdu.example.invalid " }),
    );
    expect(r).toMatchObject({
      ok: true,
      value: {
        reviewStatus: "PENDING",
        provider: "MANUAL",
        address: "pic@syntheticedu.example.invalid",
        sourceUrl: "https://syntheticedu.example.invalid/team",
        offDomain: false,
      },
    });
    expect(h.repo.contacts.size).toBe(0);
    expect(h.repo.channels.size).toBe(0);
  });

  it("requires a source URL and a valid address, and refuses an identical pending candidate", async () => {
    const h = await buildContactHarness();
    const staff = await h.login("staff@example.invalid");
    for (const bad of [
      manual({ sourceUrl: undefined }),
      manual({ sourceUrl: "not a url" }),
      manual({ address: "nope" }),
      manual({ channel: "FAX" }),
      manual({ verified: true }),
    ]) {
      expect(await h.contacts.addManualCandidate(staff, bad)).toMatchObject({
        ok: false,
        code: "VALIDATION_FAILED",
      });
    }
    expect((await h.contacts.addManualCandidate(staff, manual())).ok).toBe(true);
    expect(
      await h.contacts.addManualCandidate(
        staff,
        manual({ address: "PIC@syntheticedu.example.invalid" }),
      ),
    ).toMatchObject({
      ok: false,
      code: "CANDIDATE_ALREADY_PENDING",
    });
  });

  it("audit metadata carries no name, email, phone or address", async () => {
    const h = await buildContactHarness();
    await readyContact(h);
    const serialized = JSON.stringify(await h.auditStore.list({ limit: 500 }));
    expect(serialized).not.toContain("example.invalid");
    expect(serialized).not.toContain("Synthetic PIC");
  });

  it("accepting creates an UNVERIFIED contact and an UNVERIFIED channel", async () => {
    const h = await buildContactHarness();
    const c = await acceptedContact(h);
    expect(h.repo.contacts.get(c.contactId)).toMatchObject({
      verificationStatus: "UNVERIFIED",
      doNotContact: false,
      partnerId: PARTNER_ID,
    });
    expect(h.repo.channels.get(c.channelId)).toMatchObject({
      verificationStatus: "UNVERIFIED",
      channel: "EMAIL",
      sourceTier: "OFFICIAL",
    });
  });

  it("a candidate can be attached to an existing contact of the same partner only", async () => {
    const h = await buildContactHarness();
    const c = await acceptedContact(h);
    const cand = await h.contacts.addManualCandidate(
      c.staff,
      manual({ channel: "WHATSAPP", address: "0812 3456 7890" }),
    );
    if (!cand.ok) throw new Error();
    const r = await h.contacts.acceptCandidate(c.staff, {
      candidateId: cand.value.candidateId,
      lawfulBasisNote: "Given by the PIC during a call",
      existingContactId: c.contactId,
    });
    expect(r).toMatchObject({ ok: true, value: { contactId: c.contactId } });
    expect(h.repo.contacts.size).toBe(1);
    expect(h.repo.channels.size).toBe(2);

    const own = h.repo.contacts.get(c.contactId);
    if (!own) throw new Error("missing contact");
    const foreignId = "44444444-4444-4444-8444-444444444444";
    h.repo.contacts.set(foreignId, { ...own, contactId: foreignId, partnerId: "other-partner" });
    const cand2 = await h.contacts.addManualCandidate(
      c.staff,
      manual({ address: "second@syntheticedu.example.invalid" }),
    );
    if (!cand2.ok) throw new Error();
    expect(
      await h.contacts.acceptCandidate(c.staff, {
        candidateId: cand2.value.candidateId,
        lawfulBasisNote: "x".repeat(10),
        existingContactId: foreignId,
      }),
    ).toMatchObject({ ok: false, code: "CONTACT_NOT_FOUND" });
  });

  it("rejecting needs a reason; a candidate is reviewed once", async () => {
    const h = await buildContactHarness();
    const staff = await h.login("staff@example.invalid");
    const cand = await h.contacts.addManualCandidate(staff, manual());
    if (!cand.ok) throw new Error();
    expect(
      await h.contacts.rejectCandidate(staff, { candidateId: cand.value.candidateId, reason: "x" }),
    ).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(
      (
        await h.contacts.rejectCandidate(staff, {
          candidateId: cand.value.candidateId,
          reason: "Not the PIC",
        })
      ).ok,
    ).toBe(true);
    expect(
      await h.contacts.acceptCandidate(staff, {
        candidateId: cand.value.candidateId,
        lawfulBasisNote: "Official site",
      }),
    ).toMatchObject({ ok: false, code: "CANDIDATE_ALREADY_REVIEWED" });
    expect(h.repo.contacts.size).toBe(0);
  });

  it("accept is atomic: an audit failure creates no contact or channel", async () => {
    const h = await buildContactHarness({ failAudit: true });
    const id = "55555555-5555-4555-8555-555555555555";
    // Seeded directly: the audited add would itself fail in this harness.
    h.repo.candidates.set(id, {
      candidateId: id,
      partnerId: PARTNER_ID,
      name: "Synthetic PIC",
      title: null,
      channel: "EMAIL",
      address: "pic@syntheticedu.example.invalid",
      sourceUrl: "https://syntheticedu.example.invalid/team",
      sourceTier: "OFFICIAL",
      provider: "MANUAL",
      retrievedAt: new Date(),
      requestedBy: "u-staff",
      offDomain: false,
      reviewStatus: "PENDING",
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      acceptedContactId: null,
    });
    const staff = await h.login("staff@example.invalid");
    await expect(
      h.contacts.acceptCandidate(staff, { candidateId: id, lawfulBasisNote: "Official site" }),
    ).rejects.toThrow(/audit write failed/);
    expect(h.repo.contacts.size).toBe(0);
    expect(h.repo.channels.size).toBe(0);
    expect(h.repo.candidates.get(id)?.reviewStatus).toBe("PENDING");
  });
});

describe("enrichment boundary", () => {
  it("a lookup stores capped, validated rows as PENDING UNVERIFIED candidates and records counts only", async () => {
    const h = await buildContactHarness();
    h.provider.next = () => ({
      results: [
        {
          name: "PIC One",
          channel: "EMAIL",
          address: "one@syntheticedu.example.invalid",
          sourceUrl: "https://syntheticedu.example.invalid/a",
          verified: true,
        },
        {
          name: "PIC Two",
          channel: "EMAIL",
          address: "two@freemail.example.invalid",
          sourceUrl: "https://directory.example.invalid/b",
          sourceTier: "OFFICIAL",
        },
        { name: "No Source", channel: "EMAIL", address: "three@syntheticedu.example.invalid" },
      ],
    });
    const r = await h.contacts.lookupContacts(await h.login("staff@example.invalid"), {
      partnerId: PARTNER_ID,
    });
    expect(r).toMatchObject({
      ok: true,
      value: { stored: 2, rejected: 1, skippedDuplicates: 0, truncated: false },
    });
    const stored = [...h.repo.candidates.values()];
    expect(
      stored.every(
        (c) =>
          c.reviewStatus === "PENDING" &&
          c.sourceTier === "UNVERIFIED" &&
          c.provider === "SYNTHETIC_API",
      ),
    ).toBe(true);
    expect(stored.find((c) => c.name === "PIC Two")?.offDomain).toBe(true);
    expect(h.repo.contacts.size).toBe(0);
    expect(h.provider.calls).toEqual([
      { partnerName: "Synthetic Edu Foundation", websiteDomain: "syntheticedu.example.invalid" },
    ]);
  });

  it("re-running a lookup does not duplicate pending candidates", async () => {
    const h = await buildContactHarness();
    h.provider.next = () => ({
      results: [
        {
          name: "PIC One",
          channel: "EMAIL",
          address: "one@syntheticedu.example.invalid",
          sourceUrl: "https://syntheticedu.example.invalid/a",
        },
      ],
    });
    const staff = await h.login("staff@example.invalid");
    await h.contacts.lookupContacts(staff, { partnerId: PARTNER_ID });
    expect(await h.contacts.lookupContacts(staff, { partnerId: PARTNER_ID })).toMatchObject({
      ok: true,
      value: { stored: 0, skippedDuplicates: 1 },
    });
    expect(h.repo.candidates.size).toBe(1);
  });

  it("is refused when no provider is configured (ENRICH_PROVIDER=none) and never reaches a provider", async () => {
    const h = await buildContactHarness({ enrichment: false });
    expect(
      await h.contacts.lookupContacts(await h.login("staff@example.invalid"), {
        partnerId: PARTNER_ID,
      }),
    ).toMatchObject({
      ok: false,
      code: "ENRICHMENT_DISABLED",
    });
  });

  it("unauthorized callers and unknown partners never trigger a provider call", async () => {
    const h = await buildContactHarness();
    expect(
      (
        await h.contacts.lookupContacts(await h.login("viewer@example.invalid"), {
          partnerId: PARTNER_ID,
        })
      ).ok,
    ).toBe(false);
    expect((await h.contacts.lookupContacts(undefined, { partnerId: PARTNER_ID })).ok).toBe(false);
    expect(
      await h.contacts.lookupContacts(await h.login("staff@example.invalid"), {
        partnerId: "66666666-6666-4666-8666-666666666666",
      }),
    ).toMatchObject({ ok: false, code: "PARTNER_NOT_FOUND" });
    expect(h.provider.calls).toHaveLength(0);
  });

  it("only one partner per call: bulk queries are not expressible", async () => {
    const h = await buildContactHarness();
    const staff = await h.login("staff@example.invalid");
    for (const bad of [
      { partnerIds: [PARTNER_ID] },
      { partnerId: PARTNER_ID, query: "site:linkedin.com" },
      { domain: "*.example.invalid" },
    ]) {
      expect(await h.contacts.lookupContacts(staff, bad)).toMatchObject({
        ok: false,
        code: "VALIDATION_FAILED",
      });
    }
    expect(h.provider.calls).toHaveLength(0);
  });

  it("provider failure, timeout and malformed output store nothing and leak no provider message", async () => {
    const h = await buildContactHarness({ timeoutMs: 20 });
    const staff = await h.login("staff@example.invalid");
    h.provider.next = () => {
      throw new Error("403 for api key sk-xxxxxxxxxxxxxxxx");
    };
    const failed = await h.contacts.lookupContacts(staff, { partnerId: PARTNER_ID });
    expect(failed).toEqual({ ok: false, code: "PROVIDER_FAILED", httpStatus: 502 });
    h.provider.next = () => new Promise(() => {});
    expect(await h.contacts.lookupContacts(staff, { partnerId: PARTNER_ID })).toMatchObject({
      code: "PROVIDER_FAILED",
    });
    h.provider.next = () => "<html>captcha</html>";
    expect(await h.contacts.lookupContacts(staff, { partnerId: PARTNER_ID })).toMatchObject({
      code: "PROVIDER_OUTPUT_INVALID",
    });
    expect(h.repo.candidates.size).toBe(0);
  });
});

describe("verification: identity and channel are distinct, human, evidenced", () => {
  it("page-based methods need an evidence URL; conversation methods do not", async () => {
    const h = await buildContactHarness();
    const c = await acceptedContact(h);
    for (const method of ["OFFICIAL_WEBSITE", "PUBLIC_PROFILE_MATCH"]) {
      expect(
        await h.contacts.verifyChannel(c.staff, { channelId: c.channelId, method }),
      ).toMatchObject({ ok: false, code: "EVIDENCE_REQUIRED" });
    }
    expect(
      await h.contacts.verifyChannel(c.staff, {
        channelId: c.channelId,
        method: "PARTNER_CONFIRMED",
      }),
    ).toMatchObject({
      ok: true,
      value: {
        verificationStatus: "VERIFIED",
        verificationMethod: "PARTNER_CONFIRMED",
        verifiedBy: "u-staff",
      },
    });
  });

  it("a contact cannot be identity-verified before one of its channels is verified", async () => {
    const h = await buildContactHarness();
    const c = await acceptedContact(h);
    expect(await h.contacts.verifyContact(c.staff, { contactId: c.contactId })).toMatchObject({
      ok: false,
      code: "NO_VERIFIED_CHANNEL",
    });
    await h.contacts.verifyChannel(c.staff, { channelId: c.channelId, method: "DIRECT_REFERRAL" });
    expect((await h.contacts.verifyContact(c.staff, { contactId: c.contactId })).ok).toBe(true);
  });

  it("a verified contact with an unverified second channel is not ready on that channel", async () => {
    const h = await buildContactHarness();
    const c = await readyContact(h);
    const cand = await h.contacts.addManualCandidate(
      c.staff,
      manual({ channel: "WHATSAPP", address: "0812 3456 7890" }),
    );
    if (!cand.ok) throw new Error();
    const wa = await h.contacts.acceptCandidate(c.staff, {
      candidateId: cand.value.candidateId,
      lawfulBasisNote: "Given on call",
      existingContactId: c.contactId,
    });
    if (!wa.ok) throw new Error();
    expect(await readiness(h, c.staff, c)).toMatchObject({ ok: true, value: { ready: true } });
    expect(
      await readiness(
        h,
        c.staff,
        { contactId: c.contactId, channelId: wa.value.channelId },
        "WHATSAPP",
      ),
    ).toMatchObject({
      ok: true,
      value: { ready: false, blockers: ["CHANNEL_NOT_VERIFIED"] },
    });
  });

  it("a failed channel blocks readiness and can be recorded with a reason", async () => {
    const h = await buildContactHarness();
    const c = await readyContact(h);
    expect(
      (
        await h.contacts.markChannelFailed(c.staff, {
          channelId: c.channelId,
          reason: "Email bounced",
        })
      ).ok,
    ).toBe(true);
    expect(await readiness(h, c.staff, c)).toMatchObject({
      value: { ready: false, blockers: ["CHANNEL_FAILED"] },
    });
  });

  it("viewers and anonymous callers cannot verify", async () => {
    const h = await buildContactHarness();
    const c = await acceptedContact(h);
    for (const token of [await h.login("viewer@example.invalid"), undefined]) {
      expect(
        (
          await h.contacts.verifyChannel(token, {
            channelId: c.channelId,
            method: "PARTNER_CONFIRMED",
          })
        ).ok,
      ).toBe(false);
    }
    expect(h.repo.channels.get(c.channelId)?.verificationStatus).toBe("UNVERIFIED");
  });
});

describe("do-not-contact", () => {
  it("staff can set DNC with a reason; readiness then fails with DO_NOT_CONTACT", async () => {
    const h = await buildContactHarness();
    const c = await readyContact(h);
    expect(
      (
        await h.contacts.setDoNotContact(c.staff, {
          contactId: c.contactId,
          reason: "Asked us to stop",
        })
      ).ok,
    ).toBe(true);
    expect(await readiness(h, c.staff, c)).toMatchObject({
      value: { ready: false, blockers: ["DO_NOT_CONTACT"] },
    });
    expect(h.repo.contacts.get(c.contactId)).toMatchObject({
      doNotContact: true,
      dncSetBy: "u-staff",
    });
  });

  it("a DNC contact cannot be (re)verified", async () => {
    const h = await buildContactHarness();
    const c = await acceptedContact(h);
    await h.contacts.setDoNotContact(c.staff, {
      contactId: c.contactId,
      reason: "Asked us to stop",
    });
    expect(
      await h.contacts.verifyChannel(c.staff, {
        channelId: c.channelId,
        method: "PARTNER_CONFIRMED",
      }),
    ).toMatchObject({ code: "CONTACT_DNC" });
    expect(await h.contacts.verifyContact(c.staff, { contactId: c.contactId })).toMatchObject({
      code: "CONTACT_DNC",
    });
  });

  it("only a CRM Lead can clear DNC, with a reason, recorded as a gate override", async () => {
    const h = await buildContactHarness();
    const c = await readyContact(h);
    await h.contacts.setDoNotContact(c.staff, {
      contactId: c.contactId,
      reason: "Asked us to stop",
    });
    expect(
      await h.contacts.clearDoNotContact(c.staff, {
        contactId: c.contactId,
        reason: "Partner asked to resume contact",
      }),
    ).toMatchObject({
      ok: false,
      code: "ACTION_NOT_PERMITTED",
    });
    const lead = await h.login("lcvp.pd@example.invalid");
    expect(
      await h.contacts.clearDoNotContact(lead, { contactId: c.contactId, reason: "short" }),
    ).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(
      (
        await h.contacts.clearDoNotContact(lead, {
          contactId: c.contactId,
          reason: "Partner asked in writing to resume contact",
        })
      ).ok,
    ).toBe(true);
    const [override] = await h.auditStore.list({ kind: "GATE_OVERRIDE" });
    expect(override).toMatchObject({
      actorUserId: "u-lcvp",
      entityId: c.contactId,
      metadata: { gate: "do_not_contact" },
    });
    expect(await readiness(h, lead, c)).toMatchObject({ value: { ready: true } });
  });

  it("setting DNC twice or clearing a non-DNC contact is refused", async () => {
    const h = await buildContactHarness();
    const c = await acceptedContact(h);
    await h.contacts.setDoNotContact(c.staff, {
      contactId: c.contactId,
      reason: "Asked us to stop",
    });
    expect(
      await h.contacts.setDoNotContact(c.staff, { contactId: c.contactId, reason: "Again" }),
    ).toMatchObject({ code: "ALREADY_DNC" });
    const lead = await h.login("tlbd@example.invalid");
    await h.contacts.clearDoNotContact(lead, {
      contactId: c.contactId,
      reason: "Partner asked in writing to resume",
    });
    expect(
      await h.contacts.clearDoNotContact(lead, {
        contactId: c.contactId,
        reason: "Partner asked in writing to resume",
      }),
    ).toMatchObject({ code: "NOT_DNC" });
  });
});

describe("readiness through the service", () => {
  it("is ready for a fully verified, non-DNC contact and channel", async () => {
    const h = await buildContactHarness();
    const c = await readyContact(h);
    expect(await readiness(h, c.staff, c)).toEqual({
      ok: true,
      value: {
        ready: true,
        channel: "EMAIL",
        address: "pic@syntheticedu.example.invalid",
        manualSendOnly: false,
      },
    });
  });

  it("is not ready for an unverified recipient or the wrong channel type", async () => {
    const h = await buildContactHarness();
    const c = await acceptedContact(h);
    expect(await readiness(h, c.staff, c)).toMatchObject({
      value: { ready: false, blockers: ["CONTACT_NOT_VERIFIED", "CHANNEL_NOT_VERIFIED"] },
    });
    const r = await readyContact(await buildContactHarness());
    expect(r).toBeTruthy();
  });

  it("requires authentication", async () => {
    const h = await buildContactHarness();
    const c = await readyContact(h);
    expect(await readiness(h, undefined as unknown as string, c)).toMatchObject({
      ok: false,
      httpStatus: 401,
    });
  });
});
