import type { ContactChannelType } from "./address";

export const SOURCE_TIERS = ["OFFICIAL", "REFERRAL", "RESEARCH", "UNVERIFIED"] as const;
export type SourceTier = (typeof SOURCE_TIERS)[number];

export const VERIFICATION_METHODS = [
  "OFFICIAL_WEBSITE",
  "PARTNER_CONFIRMED",
  "DIRECT_REFERRAL",
  "PUBLIC_PROFILE_MATCH",
] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

/** Methods where the evidence is a conversation, not a page; everything else needs a URL. */
export const METHODS_WITHOUT_URL: ReadonlySet<VerificationMethod> = new Set([
  "PARTNER_CONFIRMED",
  "DIRECT_REFERRAL",
]);

export interface ContactRecord {
  contactId: string;
  partnerId: string;
  name: string;
  title: string | null;
  /** Identity: this person is a real PIC at the partner. */
  verificationStatus: "UNVERIFIED" | "PENDING" | "VERIFIED" | "FAILED";
  lawfulBasisNote: string;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  doNotContact: boolean;
  dncReason: string | null;
  dncSetBy: string | null;
  dncSetAt: Date | null;
}

export interface ChannelRecord {
  channelId: string;
  contactId: string;
  channel: ContactChannelType;
  /** Canonical form (see address.ts). Immutable. */
  address: string;
  sourceUrl: string | null;
  sourceTier: SourceTier;
  /** Reachability: this exact address reaches that person. */
  verificationStatus: "UNVERIFIED" | "VERIFIED" | "FAILED";
  verificationMethod: VerificationMethod | null;
  evidenceUrl: string | null;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
}

export interface ContactCandidate {
  candidateId: string;
  partnerId: string;
  name: string;
  title: string | null;
  channel: ContactChannelType;
  address: string;
  sourceUrl: string;
  sourceTier: SourceTier;
  provider: string;
  retrievedAt: Date;
  requestedBy: string;
  /** Set when an email's domain differs from the partner's website domain (review hint). */
  offDomain: boolean;
  reviewStatus: "PENDING" | "ACCEPTED" | "REJECTED";
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewReason: string | null;
  acceptedContactId: string | null;
}

export interface PartnerSummary {
  partnerId: string;
  name: string;
  websiteDomain: string | null;
}

/** Storage port; each mutating method is atomic within the audited transaction. */
export interface ContactRepository {
  getPartner(partnerId: string): Promise<PartnerSummary | null>;
  getContact(contactId: string): Promise<ContactRecord | null>;
  getChannel(channelId: string): Promise<ChannelRecord | null>;
  listChannels(contactId: string): Promise<ChannelRecord[]>;
  findChannel(
    contactId: string,
    channel: ContactChannelType,
    address: string,
  ): Promise<ChannelRecord | null>;
  insertContact(contact: ContactRecord): Promise<void>;
  insertChannel(channel: ChannelRecord): Promise<void>;
  updateChannelVerification(
    channelId: string,
    patch: Pick<
      ChannelRecord,
      "verificationStatus" | "verificationMethod" | "evidenceUrl" | "verifiedBy" | "verifiedAt"
    >,
  ): Promise<void>;
  updateContact(
    contactId: string,
    patch: Partial<
      Pick<
        ContactRecord,
        | "verificationStatus"
        | "verifiedBy"
        | "verifiedAt"
        | "doNotContact"
        | "dncReason"
        | "dncSetBy"
        | "dncSetAt"
      >
    >,
  ): Promise<void>;

  hasPendingCandidate(
    partnerId: string,
    channel: ContactChannelType,
    address: string,
  ): Promise<boolean>;
  insertCandidate(candidate: ContactCandidate): Promise<void>;
  getCandidate(candidateId: string): Promise<ContactCandidate | null>;
  /** Only succeeds while PENDING. */
  markCandidate(
    candidateId: string,
    patch: Pick<
      ContactCandidate,
      "reviewStatus" | "reviewedBy" | "reviewedAt" | "reviewReason" | "acceptedContactId"
    >,
  ): Promise<boolean>;
}

/** Raw, untrusted provider answer. Anything the provider says about verification is ignored. */
export interface ContactEnrichmentProvider {
  /** Stable provider code, e.g. "MANUAL_LOOKUP". */
  readonly code: string;
  /**
   * Look up publicly listed business contacts for ONE partner. Implementations must use an
   * official API under its terms. Bulk crawling, logged-in scraping, connection requests and
   * CAPTCHA/rate-limit bypass are prohibited (docs/CONTACT_SOURCING.md).
   */
  lookup(
    query: { partnerName: string; websiteDomain: string | null },
    options: { signal: AbortSignal },
  ): Promise<unknown>;
}
