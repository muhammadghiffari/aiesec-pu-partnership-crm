import type { ContactRecord, VerificationStatus } from "@crm/core";

const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  verified: "Verified",
  pending: "Verification pending",
  unverified: "Unverified",
  failed: "Verification failed",
};

/** A partner can have several contacts; the list must not report one arbitrarily. */
export function contactSummary(contacts: ContactRecord[]): {
  verification: string;
  doNotContact: string;
} {
  const total = contacts.length;
  const only = contacts[0];
  if (!only) return { verification: "No contact yet", doNotContact: "—" };
  if (total === 1)
    return {
      verification: VERIFICATION_LABELS[only.verification],
      doNotContact: only.doNotContact ? "Do not contact" : "—",
    };
  const verified = contacts.filter((contact) => contact.verification === "verified").length;
  const doNotContact = contacts.filter((contact) => contact.doNotContact).length;
  return {
    verification: `${verified} of ${total} verified`,
    doNotContact: doNotContact === 0 ? "—" : `${doNotContact} of ${total} do not contact`,
  };
}
