/**
 * Outreach readiness (PRD §6, SECURITY_PRIVACY #5). The single rule every draft/approve/send
 * path must call (M2-04 approval, M2-05 assisted send). Pure and deterministic.
 */

import type { ContactChannelType } from "./address";
import type { ChannelRecord, ContactRecord } from "./types";

export const READINESS_BLOCKERS = [
  "CONTACT_NOT_FOUND",
  "CHANNEL_NOT_FOUND",
  "DO_NOT_CONTACT",
  "CONTACT_NOT_VERIFIED",
  "CHANNEL_NOT_VERIFIED",
  "CHANNEL_FAILED",
  "CHANNEL_OF_OTHER_CONTACT",
  "CHANNEL_TYPE_MISMATCH",
  "CONTACT_OF_OTHER_PARTNER",
] as const;
export type ReadinessBlocker = (typeof READINESS_BLOCKERS)[number];

export type Readiness =
  | { ready: true; channel: ContactChannelType; address: string; manualSendOnly: boolean }
  | { ready: false; blockers: ReadinessBlocker[] };

/** No automatic sending for WhatsApp or LinkedIn (AGENTS.md); phone is human by nature. */
const MANUAL_ONLY: ReadonlySet<ContactChannelType> = new Set(["WHATSAPP", "LINKEDIN", "PHONE"]);

export interface ReadinessInput {
  contact: ContactRecord | null;
  channel: ChannelRecord | null;
  /** The channel type the message is written for (e.g. an email body must go to EMAIL). */
  intendedChannel: ContactChannelType;
  /** The partner whose cycle the message belongs to. */
  partnerId: string;
}

export function assessReadiness(input: ReadinessInput): Readiness {
  const { contact, channel } = input;
  const blockers: ReadinessBlocker[] = [];
  if (!contact) blockers.push("CONTACT_NOT_FOUND");
  if (!channel) blockers.push("CHANNEL_NOT_FOUND");
  if (!contact || !channel) return { ready: false, blockers };

  // DNC is checked first and always reported, whatever else is wrong.
  if (contact.doNotContact) blockers.push("DO_NOT_CONTACT");
  if (contact.partnerId !== input.partnerId) blockers.push("CONTACT_OF_OTHER_PARTNER");
  if (channel.contactId !== contact.contactId) blockers.push("CHANNEL_OF_OTHER_CONTACT");
  if (channel.channel !== input.intendedChannel) blockers.push("CHANNEL_TYPE_MISMATCH");
  if (contact.verificationStatus !== "VERIFIED") blockers.push("CONTACT_NOT_VERIFIED");
  if (channel.verificationStatus === "FAILED") blockers.push("CHANNEL_FAILED");
  else if (channel.verificationStatus !== "VERIFIED") blockers.push("CHANNEL_NOT_VERIFIED");

  if (blockers.length > 0) return { ready: false, blockers };
  return {
    ready: true,
    channel: channel.channel,
    address: channel.address,
    manualSendOnly: MANUAL_ONLY.has(channel.channel),
  };
}
