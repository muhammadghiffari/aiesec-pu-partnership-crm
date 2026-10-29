/**
 * Deterministic proposal pricing (M3-02, FR-501..503, PRD §4). Pure integer arithmetic.
 *
 * Rules (docs/DECISIONS.md Q-33):
 *  - Money is whole rupiah. Quantity has at most 3 decimals and is handled as thousandths.
 *  - Line total = round-half-up( quantity x agreed unit value ), computed as
 *    ((qty_thousandths x unit) + 500) / 1000 with integer division. This is the exact formula the
 *    database CHECK uses, so the application and the database cannot disagree.
 *  - A PACKAGE proposal is worth the package's listed price. Package benefit lines are shown for
 *    the delivery obligation but are INCLUDED in that price: they are never added again.
 *  - A CUSTOM proposal is the sum of its custom lines.
 *  - A HYBRID proposal is the package price plus its custom lines. A custom line for a benefit
 *    the package already includes is refused (it would be counted twice).
 *  - A line's catalog value and the negotiated (agreed) value are both kept; a negotiated
 *    difference is reported, never hidden.
 *  - A proposal valuation is a forecast. Nothing here writes actual revenue (M4-02).
 */

export const MAX_QUANTITY_THOUSANDTHS = 10_000_000; // 10 000.000
export const MAX_MONEY = 1_000_000_000_000; // 1e12 rupiah keeps every sum below 2^53

export class PricingError extends Error {
  constructor(
    readonly code:
      | "INVALID_QUANTITY"
      | "INVALID_MONEY"
      | "DUPLICATE_BENEFIT"
      | "DOUBLE_COUNTED_BENEFIT"
      | "PACKAGE_REQUIRED"
      | "PACKAGE_NOT_ALLOWED"
      | "PACKAGE_LINE_NOT_IN_PACKAGE"
      | "PACKAGE_MODE_CUSTOM_LINE"
      | "OVERFLOW",
  ) {
    super(`pricing: ${code}`);
    this.name = "PricingError";
  }
}

export function isRupiah(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= MAX_MONEY;
}

/** Parses a quantity given as a number or decimal string into thousandths; null when invalid. */
export function toThousandths(quantity: number | string): number | null {
  const text =
    typeof quantity === "number"
      ? Number.isFinite(quantity)
        ? String(quantity)
        : ""
      : quantity.trim();
  if (!/^\d{1,5}(\.\d{1,3})?$/.test(text)) return null; // also rejects exponent notation (1e-7)
  const [whole = "0", frac = ""] = text.split(".");
  const thousandths = Number(whole) * 1000 + Number(frac.padEnd(3, "0"));
  return thousandths > 0 && thousandths <= MAX_QUANTITY_THOUSANDTHS ? thousandths : null;
}

export function formatQuantity(thousandths: number): string {
  const whole = Math.floor(thousandths / 1000);
  const frac = String(thousandths % 1000).padStart(3, "0");
  return `${whole}.${frac}`;
}

/** Round half up to whole rupiah. Same formula as the database CHECK. */
export function lineTotal(thousandths: number, agreedUnitValue: number): number {
  if (!Number.isSafeInteger(thousandths) || thousandths <= 0)
    throw new PricingError("INVALID_QUANTITY");
  if (!isRupiah(agreedUnitValue)) throw new PricingError("INVALID_MONEY");
  const product = thousandths * agreedUnitValue;
  if (!Number.isSafeInteger(product)) throw new PricingError("OVERFLOW");
  return Math.floor((product + 500) / 1000);
}

export type PricingMode = "PACKAGE" | "CUSTOM" | "HYBRID";

export interface CatalogItemRef {
  itemId: string;
  benefitName: string;
  unit: string;
  monetizedUnitValue: number;
}

export interface PricedLine {
  itemId: string;
  source: "PACKAGE" | "CUSTOM";
  benefitName: string;
  unit: string;
  quantityThousandths: number;
  catalogUnitValue: number;
  agreedUnitValue: number;
  lineTotal: number;
  /** agreed - catalog (per unit): negative = discount, positive = premium. */
  negotiatedDelta: number;
}

export interface PackageInput {
  packageId: string;
  listedPrice: number;
  /** Benefits the package includes: item id -> included quantity (thousandths). */
  benefits: { itemId: string; includedQtyThousandths: number }[];
}

export interface PricingInput {
  mode: PricingMode;
  package: PackageInput | null;
  /** The catalog (one frozen version) every line is priced from. */
  catalog: ReadonlyMap<string, CatalogItemRef>;
  /** Custom lines chosen by the user. Package lines are derived, not supplied. */
  customLines: { itemId: string; quantity: number | string; agreedUnitValue?: number }[];
  /** Optional per-package-benefit negotiated unit values (otherwise the catalog value). */
  packageAgreedValues?: ReadonlyMap<string, number>;
}

export interface PricingResult {
  mode: PricingMode;
  packageId: string | null;
  lines: PricedLine[];
  packagePrice: number;
  customTotal: number;
  /** What the proposal is worth. Package lines are NOT added on top of the package price. */
  calculatedValue: number;
  /** Sum of package line totals at the catalog/agreed values, for information only. */
  packageBenefitsReferenceValue: number;
}

export function priceProposal(input: PricingInput): PricingResult {
  const { mode, package: pkg } = input;
  if (mode === "CUSTOM" && pkg) throw new PricingError("PACKAGE_NOT_ALLOWED");
  if ((mode === "PACKAGE" || mode === "HYBRID") && !pkg) throw new PricingError("PACKAGE_REQUIRED");
  if (mode === "PACKAGE" && input.customLines.length > 0)
    throw new PricingError("PACKAGE_MODE_CUSTOM_LINE");

  const lines: PricedLine[] = [];
  const seen = new Set<string>();
  const included = new Set(pkg?.benefits.map((b) => b.itemId) ?? []);
  let packagePrice = 0;
  let referenceValue = 0;

  if (pkg) {
    if (!isRupiah(pkg.listedPrice)) throw new PricingError("INVALID_MONEY");
    packagePrice = pkg.listedPrice;
    for (const b of pkg.benefits) {
      if (seen.has(b.itemId)) throw new PricingError("DUPLICATE_BENEFIT");
      seen.add(b.itemId);
      const item = input.catalog.get(b.itemId);
      if (!item) throw new PricingError("PACKAGE_LINE_NOT_IN_PACKAGE");
      const agreed = input.packageAgreedValues?.get(b.itemId) ?? item.monetizedUnitValue;
      const total = lineTotal(b.includedQtyThousandths, agreed);
      referenceValue += total;
      lines.push({
        itemId: item.itemId,
        source: "PACKAGE",
        benefitName: item.benefitName,
        unit: item.unit,
        quantityThousandths: b.includedQtyThousandths,
        catalogUnitValue: item.monetizedUnitValue,
        agreedUnitValue: agreed,
        lineTotal: total,
        negotiatedDelta: agreed - item.monetizedUnitValue,
      });
    }
  }

  let customTotal = 0;
  for (const c of input.customLines) {
    if (seen.has(c.itemId)) {
      // Either the same custom benefit twice, or one the package already includes.
      throw new PricingError(
        included.has(c.itemId) ? "DOUBLE_COUNTED_BENEFIT" : "DUPLICATE_BENEFIT",
      );
    }
    seen.add(c.itemId);
    const item = input.catalog.get(c.itemId);
    if (!item) throw new PricingError("PACKAGE_LINE_NOT_IN_PACKAGE");
    const qty = toThousandths(c.quantity);
    if (qty === null) throw new PricingError("INVALID_QUANTITY");
    const agreed = c.agreedUnitValue ?? item.monetizedUnitValue;
    if (!isRupiah(agreed)) throw new PricingError("INVALID_MONEY");
    const total = lineTotal(qty, agreed);
    customTotal += total;
    lines.push({
      itemId: item.itemId,
      source: "CUSTOM",
      benefitName: item.benefitName,
      unit: item.unit,
      quantityThousandths: qty,
      catalogUnitValue: item.monetizedUnitValue,
      agreedUnitValue: agreed,
      lineTotal: total,
      negotiatedDelta: agreed - item.monetizedUnitValue,
    });
  }

  const calculatedValue = packagePrice + customTotal;
  if (!Number.isSafeInteger(calculatedValue) || calculatedValue > MAX_MONEY * 4)
    throw new PricingError("OVERFLOW");
  return {
    mode,
    packageId: pkg?.packageId ?? null,
    lines,
    packagePrice,
    customTotal,
    calculatedValue,
    packageBenefitsReferenceValue: referenceValue,
  };
}
