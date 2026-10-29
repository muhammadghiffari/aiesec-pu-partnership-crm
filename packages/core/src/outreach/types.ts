import type { ContactChannelType } from "../contacts/address";

export const OUTREACH_STATUSES = ["DRAFT", "APPROVED", "SENT", "REPLIED", "CANCELLED"] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

export interface OutreachMessage {
  messageId: string;
  cycleId: string;
  contactId: string;
  /** The exact contact_channels row (and therefore canonical address) this message is bound to. */
  channelId: string;
  channel: ContactChannelType;
  subject: string | null;
  body: string;
  language: "id" | "en";
  status: OutreachStatus;
  followUpAttempt: number;
  draftSource: "HUMAN" | "AI";
  /** `<template id>@<version>` when an AI draft; never prompt text. */
  aiTemplate: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  approvedContentHash: string | null;
  approvedLintVersion: number | null;
  sentAt: Date | null;
}

export type MessagePatch = Partial<
  Pick<
    OutreachMessage,
    | "channelId"
    | "channel"
    | "subject"
    | "body"
    | "status"
    | "approvedBy"
    | "approvedAt"
    | "approvedContentHash"
    | "approvedLintVersion"
    | "sentAt"
  >
>;

/** Storage port. Must participate in the same transaction as the audit write. */
export interface OutreachRepository {
  getCyclePartnerId(cycleId: string): Promise<string | null>;
  getMessage(messageId: string): Promise<OutreachMessage | null>;
  insertMessage(message: OutreachMessage): Promise<void>;
  /** Compare-and-set on status; returns false when the stored status was not `expectedStatus`. */
  updateMessage(
    messageId: string,
    expectedStatus: OutreachStatus,
    patch: MessagePatch,
  ): Promise<boolean>;
}
