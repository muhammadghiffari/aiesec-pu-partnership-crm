/**
 * Mapping between persisted M1-03 records and the demo workspace shapes.
 *
 * Mapping decisions (per docs/DECISIONS.md live-demo entry):
 * - partner `sourceDescription` is the persisted home of the demo
 *   lawful-basis note — the same field the M1-03 create contract requires.
 * - partner `ownerName`/`notes` have no persisted column in M1-03; they remain
 *   demo-session-only values and are never sent to the API.
 * - contact verifications are stored once per contact row; the demo's per-channel
 *   channel rows (email / WhatsApp) all reflect that same contact-level fact.
 *   LinkedIn rows never appear from the database (emails + phones only).
 * - the verification `method` wording is not persisted server-side; it stays in
 *   the demo journal/state until the next refresh.
 */
import type { APIContact, APIPartner } from "./api";
import type { DemoContact, DemoPartner, VerificationStatus } from "../types";

function fallbackVerification(value: string): VerificationStatus {
  return ["unverified", "pending", "verified", "failed"].includes(value)
    ? (value as VerificationStatus)
    : "unverified";
}

export function toDemoPartner(record: APIPartner): DemoPartner {
  return {
    id: record.id,
    name: record.name,
    websiteDomain: record.websiteDomain,
    industry: record.industry,
    officialEmail: record.officialEmail,
    ownerName: null,
    sourceTier: record.sourceTier,
    sourceUrl: record.sourceUrl,
    // The demo lawful-basis note lives in the persisted sourceDescription column.
    lawfulBasisNote: record.sourceDescription,
    notes: null,
    createdAt: record.createdAt,
    lastActivityAt: record.createdAt,
  };
}

/** Map a persisted contact row into the demo contact model (loadedAt ≈ addedAt). */
export function toDemoContact(record: APIContact, loadedAt: string): DemoContact {
  const verifiedAt: string | null = record.verifiedAt;
  const evidence: string | null = record.verification === "verified" ? record.sourceUrl : null;
  const channels: DemoContact["channels"] = [];
  if (record.email)
    channels.push({
      channel: "email",
      value: record.email,
      verification: record.verification,
      method: null,
      evidenceUrl: evidence,
      verifiedAt,
    });
  if (record.phone)
    channels.push({
      channel: "whatsapp",
      value: record.phone,
      verification: record.verification,
      method: null,
      evidenceUrl: evidence,
      verifiedAt,
    });
  return {
    id: record.id,
    partnerId: record.partnerId,
    name: record.name,
    title: record.title,
    identityVerification: fallbackVerification(record.verification),
    identityMethod: null,
    identityEvidenceUrl: evidence,
    channels,
    sourceTier: record.sourceTier,
    sourceUrl: record.sourceUrl,
    lawfulBasisNote: record.lawfulBasisNote,
    dnc: record.doNotContact
      ? {
          active: true,
          reason: record.dncReason ?? "",
          at: loadedAt,
          by: "recorded in the CRM audit trail",
        }
      : null,
    addedAt: loadedAt,
  };
}
