import type { ContactRecord } from "@crm/core";
import { describe, expect, it } from "vitest";
import { contactSummary } from "../../apps/web/features/partners/contact-summary";

function contact(overrides: Partial<ContactRecord> = {}): ContactRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    partnerId: "00000000-0000-4000-8000-000000000002",
    name: "Synthetic Contact",
    title: null,
    email: "contact@example.invalid",
    phone: null,
    sourceUrl: null,
    sourceTier: "research",
    lawfulBasisNote: "Synthetic fixture",
    verification: "unverified",
    verifiedAt: null,
    doNotContact: false,
    dncReason: null,
    ...overrides,
  };
}

describe("partner list contact summary", () => {
  it("shows an empty state when there are no contacts", () => {
    expect(contactSummary([])).toEqual({ verification: "No contact yet", doNotContact: "—" });
  });

  it("shows the single contact state directly", () => {
    expect(contactSummary([contact({ verification: "verified" })])).toEqual({
      verification: "Verified",
      doNotContact: "—",
    });
    expect(contactSummary([contact({ doNotContact: true })])).toEqual({
      verification: "Unverified",
      doNotContact: "Do not contact",
    });
  });

  it("aggregates multiple contacts instead of reporting an arbitrary one", () => {
    expect(
      contactSummary([
        contact({ verification: "verified" }),
        contact({
          id: "00000000-0000-4000-8000-000000000003",
          name: "Second Contact",
          doNotContact: true,
        }),
      ]),
    ).toEqual({
      verification: "1 of 2 verified",
      doNotContact: "1 of 2 do not contact",
    });
  });

  it("reports all verified and all do-not-contact states", () => {
    expect(
      contactSummary([
        contact({ verification: "verified", doNotContact: true }),
        contact({
          id: "00000000-0000-4000-8000-000000000003",
          verification: "verified",
          doNotContact: true,
        }),
      ]),
    ).toEqual({
      verification: "2 of 2 verified",
      doNotContact: "2 of 2 do not contact",
    });
  });

  it("uses the pending and failed labels for one contact", () => {
    expect(contactSummary([contact({ verification: "pending" })]).verification).toBe(
      "Verification pending",
    );
    expect(contactSummary([contact({ verification: "failed" })]).verification).toBe(
      "Verification failed",
    );
  });
});
