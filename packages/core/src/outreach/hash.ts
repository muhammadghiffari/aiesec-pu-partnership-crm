/**
 * Approval content hash (PRD §6, ARCHITECTURE invariant 6).
 *
 * The approval is bound to the EXACT text, recipient and channel: message id, cycle, contact,
 * channel row, channel type, canonical address, subject and body. Fields are length-prefixed
 * with their UTF-8 byte length so no two different payloads can produce the same canonical
 * string. The text is not normalised: any byte change, including whitespace, invalidates.
 *
 * The same canonical form is recomputed inside PostgreSQL (migration 0008) so a direct database
 * edit cannot keep a stale approval. Keep both in sync; `hash.test.ts` and the DB tests check
 * parity.
 */

export const APPROVAL_HASH_VERSION = "outreach-approval/v1";

export interface ApprovalPayload {
  messageId: string;
  cycleId: string;
  contactId: string;
  channelId: string;
  channel: string;
  address: string;
  subject: string | null;
  body: string;
}

const encoder = new TextEncoder();

function field(name: string, value: string | null): string {
  if (value === null) return `${name}=~\n`;
  return `${name}=${encoder.encode(value).length}:${value}\n`;
}

export function canonicalApprovalString(p: ApprovalPayload): string {
  return (
    `${APPROVAL_HASH_VERSION}\n` +
    field("message", p.messageId) +
    field("cycle", p.cycleId) +
    field("contact", p.contactId) +
    field("channel_id", p.channelId) +
    field("channel", p.channel) +
    field("address", p.address) +
    field("subject", p.subject) +
    field("body", p.body)
  );
}

export async function approvalHash(p: ApprovalPayload): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(canonicalApprovalString(p)));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison of two hex digests. */
export function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
