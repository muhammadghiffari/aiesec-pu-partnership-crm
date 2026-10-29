/**
 * Rate Card domain types and storage port (M3-01, FR-500, PRD §4).
 *
 * Money is integer rupiah (AGENTS.md, DECISIONS Q-15). Dates are calendar dates as
 * `YYYY-MM-DD` strings (no time zone ambiguity). The ESSM scoring formula is NOT modelled
 * here: it is an unresolved release blocker (DECISIONS Q-01).
 */

export const RATE_CARD_STATUSES = ["DRAFT", "ACTIVE", "RETIRED"] as const;
export type RateCardStatus = (typeof RATE_CARD_STATUSES)[number];

export interface RateCardVersion {
  rateCardId: string;
  name: string;
  version: number;
  currency: string;
  status: RateCardStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  ownerId: string;
}

export interface RateCardItem {
  itemId: string;
  rateCardId: string;
  category: string;
  benefitName: string;
  monetizedUnitValue: number;
  unit: string;
  active: boolean;
  /** PROPOSED until a CRM Lead confirms it; never presented as an official national price. */
  valueStatus: "PROPOSED" | "CONFIRMED";
  confirmedBy: string | null;
  confirmedAt: Date | null;
}

export interface RateCardPackage {
  packageId: string;
  rateCardId: string;
  packageName: string;
  listedPrice: number;
  slotLimits: string;
  active: boolean;
}

export interface PackageBenefit {
  packageBenefitId: string;
  packageId: string;
  itemId: string;
  rateCardId: string;
  includedQty: number;
  slotLimit: number | null;
}

export interface BenefitCategory {
  code: string;
  label: string;
  active: boolean;
}

export interface CatalogVersionView {
  version: RateCardVersion;
  items: RateCardItem[];
  packages: RateCardPackage[];
  packageBenefits: PackageBenefit[];
}

/** Storage port; every method participates in the audited transaction. */
export interface RateCardRepository {
  categoryExists(code: string): Promise<boolean>;
  latestVersion(name: string): Promise<RateCardVersion | null>;
  listVersions(name: string): Promise<RateCardVersion[]>;
  listNames(): Promise<string[]>;
  getVersion(rateCardId: string): Promise<RateCardVersion | null>;
  insertVersion(v: RateCardVersion): Promise<void>;
  /** Compare-and-set on status. */
  updateVersion(
    rateCardId: string,
    expected: RateCardStatus,
    patch: Partial<Pick<RateCardVersion, "status" | "effectiveFrom" | "effectiveTo">>,
  ): Promise<boolean>;
  deleteDraft(rateCardId: string): Promise<boolean>;

  listItems(rateCardId: string): Promise<RateCardItem[]>;
  getItem(itemId: string): Promise<RateCardItem | null>;
  insertItem(item: RateCardItem): Promise<void>;
  updateItem(
    itemId: string,
    patch: Partial<
      Pick<
        RateCardItem,
        | "benefitName"
        | "monetizedUnitValue"
        | "unit"
        | "active"
        | "category"
        | "valueStatus"
        | "confirmedBy"
        | "confirmedAt"
      >
    >,
  ): Promise<void>;
  deleteItem(itemId: string): Promise<boolean>;
  itemIsReferenced(itemId: string): Promise<boolean>;

  listPackages(rateCardId: string): Promise<RateCardPackage[]>;
  getPackage(packageId: string): Promise<RateCardPackage | null>;
  insertPackage(p: RateCardPackage): Promise<void>;
  updatePackage(
    packageId: string,
    patch: Partial<Pick<RateCardPackage, "packageName" | "listedPrice" | "slotLimits" | "active">>,
  ): Promise<void>;
  listPackageBenefits(rateCardId: string): Promise<PackageBenefit[]>;
  replacePackageBenefits(
    packageId: string,
    rateCardId: string,
    benefits: PackageBenefit[],
  ): Promise<void>;
}
