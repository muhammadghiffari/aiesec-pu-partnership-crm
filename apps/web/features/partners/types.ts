/**
 * M1-03 draft partner/contact feature contract (test fixture slice).
 *
 * The fixed diagram (Partner, Contact, IndustryCategory) and PRD FR-200 define
 * the domain shape. M1-01 provides tables, not a persisted partner service;
 * this draft differs from migration 0001 (see DECISIONS Q-20). Until reconciled,
 * production access fails closed in backend.ts; tests alone use mock-service.ts.
 * This file must stay JSX-free so the root vitest suite can test it.
 */
import { z } from "zod";

/** Ten official ESSM BD industry categories (docs/ESSM_MAPPING.md §2). */
export const ESSM_INDUSTRIES = [
  { code: "ENERGY_MATERIALS_INDUSTRIALS", label: "Energy, Materials & Industrials" },
  { code: "HEALTH_CARE", label: "Health Care" },
  { code: "FINANCIAL_BANK_INSURANCE", label: "Financial (Bank & Insurance)" },
  { code: "TECH_COMPANY", label: "Tech Company" },
  { code: "FMCG_FNB", label: "FMCG & FnB" },
  { code: "COMMUNICATION_SERVICES", label: "Communication Services" },
  { code: "ECOMMERCE_RETAIL", label: "E-Commerce and Retail" },
  { code: "EDUCATION", label: "Education" },
  { code: "CONSULTING", label: "Consulting" },
  { code: "OTHERS", label: "Others" },
] as const;

export type IndustryCode = (typeof ESSM_INDUSTRIES)[number]["code"];

export const VERIFICATION_STATUSES = ["unverified", "pending", "verified", "failed"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const DNC_STATUSES = ["unknown", "allowed", "do_not_contact"] as const;
export type DncStatus = (typeof DNC_STATUSES)[number];

/** Source tiers per PRD: provenance and lawful-basis note are required. */
export const SOURCE_TIERS = ["official", "referral", "research", "unverified"] as const;
export type SourceTier = (typeof SOURCE_TIERS)[number];

export type Contact = {
  id: string;
  partnerId: string;
  name: string;
  title: string | null;
  email: string;
  phone: string | null;
  verification: VerificationStatus;
  sourceUrl: string | null;
  sourceTier: SourceTier;
  lawfulBasisNote: string;
  doNotContact: boolean;
  verifiedAt: string | null;
};

export type Partner = {
  id: string;
  name: string;
  websiteDomain: string | null;
  industry: IndustryCode;
  officialEmail: string | null;
  sourceUrl: string | null;
  sourceTier: SourceTier;
  lawfulBasisNote: string;
  createdAt: string;
  contacts: Contact[];
};

export type DuplicateWarning = {
  partnerId: string;
  name: string;
  reason: "same_domain" | "similar_name";
};

export type PartnerPrincipal = {
  /** Present and active only when M0-05 authentication has admitted the user. */
  email: string | null;
  role: "NONE" | "BD_STAFF" | "CRM_LEAD";
  active: boolean;
};

export type PartnerAccessDenied = { ok: false; error: "access_denied" };
export type PartnerValidationFailed = {
  ok: false;
  error: "validation_failed";
  issues: ConfigStyleIssue[];
};
export type ConfigStyleIssue = { path: string; message: string };
export type PartnerNotFound = { ok: false; error: "not_found" };
export type PartnerDuplicateConfirmationRequired = {
  ok: false;
  error: "duplicate_confirmation_required";
  duplicates: DuplicateWarning[];
};
export type PartnerSaved<T> = { ok: true; data: T };
export type PartnerResult<T> =
  | PartnerSaved<T>
  | PartnerAccessDenied
  | PartnerValidationFailed
  | PartnerNotFound
  | PartnerDuplicateConfirmationRequired;

export const partnerCreateInputSchema = z.object({
  name: z.string().trim().min(2).max(200),
  websiteDomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "must be a bare domain like example.co.id")
    .optional(),
  industry: z.enum(ESSM_INDUSTRIES.map((i) => i.code) as [IndustryCode, ...IndustryCode[]]),
  officialEmail: z.string().trim().toLowerCase().email().optional(),
  sourceUrl: z.string().trim().url().optional(),
  sourceTier: z.enum(SOURCE_TIERS),
  lawfulBasisNote: z.string().trim().min(3).max(500),
  contact: z.object({
    name: z.string().trim().min(2).max(200),
    title: z.string().trim().max(120).optional(),
    email: z.string().trim().toLowerCase().email(),
    phone: z
      .string()
      .trim()
      .regex(/^[+0-9 ()-]{5,25}$/)
      .optional(),
    sourceUrl: z.string().trim().url().optional(),
    sourceTier: z.enum(SOURCE_TIERS),
    lawfulBasisNote: z.string().trim().min(3).max(500),
  }),
  /** Must be true when duplicate warnings exist; set by the confirm dialog. */
  confirmDuplicate: z.boolean().default(false),
});
export type PartnerCreateInput = z.infer<typeof partnerCreateInputSchema>;

export const partnerUpdateInputSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  websiteDomain: z.string().trim().toLowerCase().optional(),
  industry: z
    .enum(ESSM_INDUSTRIES.map((i) => i.code) as [IndustryCode, ...IndustryCode[]])
    .optional(),
  officialEmail: z.string().trim().toLowerCase().email().optional(),
});
export type PartnerUpdateInput = z.infer<typeof partnerUpdateInputSchema>;

export const contactVerificationInputSchema = z.object({
  contactId: z.string().min(1),
  verification: z.enum(VERIFICATION_STATUSES),
  sourceUrl: z.string().trim().url().optional(),
  sourceTier: z.enum(SOURCE_TIERS).optional(),
  lawfulBasisNote: z.string().trim().min(3).max(500).optional(),
});

export const dncInputSchema = z.object({
  contactId: z.string().min(1),
  doNotContact: z.boolean(),
  reason: z.string().trim().min(3).max(500),
});

/**
 * Draft UI service contract; not yet reconciled with the persisted schema.
 */
export interface PartnerService {
  search(
    principal: PartnerPrincipal,
    query: string,
    industry: IndustryCode | null,
  ): Promise<Partner[]>;
  getById(principal: PartnerPrincipal, id: string): Promise<Partner | null>;
  /** Input is untrusted boundary data; implementations must validate with Zod. */
  create(principal: PartnerPrincipal, input: unknown): Promise<PartnerResult<Partner>>;
  update(principal: PartnerPrincipal, id: string, input: unknown): Promise<PartnerResult<Partner>>;
  setContactVerification(
    principal: PartnerPrincipal,
    partnerId: string,
    input: unknown,
  ): Promise<PartnerResult<Contact>>;
  setDoNotContact(
    principal: PartnerPrincipal,
    partnerId: string,
    input: unknown,
  ): Promise<PartnerResult<Contact>>;
}

/** Draft mock-only authorization; production uses M0-05 auth policy once wired. */
export function canPerform(principal: PartnerPrincipal, action: "read" | "write"): boolean {
  if (!principal.active || principal.email === null) return false;
  if (principal.role === "NONE") return false;
  // TL BD and LCVP PD both resolve to CRM_LEAD; BD_STAFF has the same read set
  // and write access to assigned workflows (partners master included in M1-03).
  return action === "read" ? true : principal.role === "BD_STAFF" || principal.role === "CRM_LEAD";
}

export function assertCan(principal: PartnerPrincipal, action: "read" | "write"): void {
  if (!canPerform(principal, action)) {
    throw new PartnerAccessDeniedError();
  }
}

export class PartnerAccessDeniedError extends Error {
  constructor() {
    super("access denied");
    this.name = "PartnerAccessDeniedError";
  }
}

export function toValidationIssues(error: z.ZodError): ConfigStyleIssue[] {
  return error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}
