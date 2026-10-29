/** FR-200: shared persisted Partner/Contact view. */
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
export type SourceTier = "official" | "referral" | "research" | "unverified";
export type VerificationStatus = "unverified" | "pending" | "verified" | "failed";
export interface ContactRecord {
  id: string;
  partnerId: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  sourceUrl: string | null;
  sourceTier: SourceTier;
  lawfulBasisNote: string;
  verification: VerificationStatus;
  verifiedAt: string | null;
  doNotContact: boolean;
  dncReason: string | null;
}
export interface PartnerRecord {
  id: string;
  name: string;
  websiteDomain: string | null;
  industry: IndustryCode;
  officialEmail: string | null;
  sourceDescription: string;
  sourceUrl: string | null;
  sourceTier: SourceTier;
  createdAt: string;
  contacts: ContactRecord[];
}
