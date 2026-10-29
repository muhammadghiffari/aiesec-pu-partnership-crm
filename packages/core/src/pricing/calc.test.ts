import { describe, expect, it } from "vitest";
import {
  type CatalogItemRef,
  formatQuantity,
  isRupiah,
  lineTotal,
  MAX_MONEY,
  PricingError,
  type PricingInput,
  priceProposal,
  toThousandths,
} from "./calc";

const item = (id: string, value: number, name = `Benefit ${id}`): CatalogItemRef => ({
  itemId: id,
  benefitName: name,
  unit: "slot",
  monetizedUnitValue: value,
});
const catalog = (...items: CatalogItemRef[]) => new Map(items.map((i) => [i.itemId, i]));
const pkg = (price: number, ...benefits: [string, number][]) => ({
  packageId: "pkg-1",
  listedPrice: price,
  benefits: benefits.map(([itemId, qty]) => ({ itemId, includedQtyThousandths: qty * 1000 })),
});
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof PricingError ? e.code : `other:${String(e)}`;
  }
  return "no error";
};

describe("quantity parsing (thousandths)", () => {
  it.each([
    [1, 1000],
    [2.5, 2500],
    ["2.5", 2500],
    ["0.001", 1],
    ["0.125", 125],
    ["10000", 10_000_000],
    [" 3 ", 3000],
    [0.1, 100],
    [0.3, 300],
  ])("%s -> %s", (q, expected) => {
    expect(toThousandths(q)).toBe(expected);
  });

  it.each([
    0,
    -1,
    "0",
    "0.000",
    "1.0001",
    "1e3",
    "1e-7",
    "abc",
    "",
    "1,5",
    Number.NaN,
    Number.POSITIVE_INFINITY,
    10_000.001,
    1e-7,
    "١٢٣",
  ])("rejects %s", (q) => {
    expect(toThousandths(q as number)).toBeNull();
  });

  it("does not suffer binary float drift (0.1 + 0.2 style inputs)", () => {
    expect(toThousandths(0.1 + 0.2)).toBeNull(); // 0.30000000000000004 has too many decimals
    expect(toThousandths("0.3")).toBe(300);
  });

  it("formats thousandths back exactly", () => {
    expect(formatQuantity(2500)).toBe("2.500");
    expect(formatQuantity(1)).toBe("0.001");
    expect(formatQuantity(10_000_000)).toBe("10000.000");
  });
});

describe("line total: round half up, integer arithmetic", () => {
  it.each([
    [1000, 500_000, 500_000],
    [2500, 400_000, 1_000_000],
    [1500, 333, 500], // 499.5 -> 500
    [1000, 0, 0],
    [1, 1, 0], // 0.001 rupiah rounds down
    [500, 1, 1], // 0.5 -> 1 (half up)
    [499, 1, 0], // 0.499 -> 0
    [3333, 100, 333], // 333.3 -> 333
    [3335, 100, 334], // 333.5 -> 334
    [1_000, MAX_MONEY, MAX_MONEY],
  ])("qty %s x %s = %s", (q, unit, expected) => {
    expect(lineTotal(q, unit)).toBe(expected);
  });

  it("is monotonic and never exceeds quantity x value by a full rupiah", () => {
    for (let q = 1; q <= 2000; q += 7) {
      for (const v of [1, 7, 333, 12_345, 999_999]) {
        const exact = (q * v) / 1000;
        const got = lineTotal(q, v);
        expect(Math.abs(got - exact)).toBeLessThanOrEqual(0.5 + 1e-9);
      }
    }
  });

  it("rejects fractional or negative money, bad quantities and overflow", () => {
    expect(code(() => lineTotal(1000, 1.5))).toBe("INVALID_MONEY");
    expect(code(() => lineTotal(1000, -1))).toBe("INVALID_MONEY");
    expect(code(() => lineTotal(1000, MAX_MONEY + 1))).toBe("INVALID_MONEY");
    expect(code(() => lineTotal(0, 1000))).toBe("INVALID_QUANTITY");
    expect(code(() => lineTotal(1.5, 1000))).toBe("INVALID_QUANTITY");
    expect(code(() => lineTotal(10_000_000, MAX_MONEY))).toBe("OVERFLOW");
  });

  it("isRupiah accepts only safe whole non-negative numbers within the cap", () => {
    for (const ok of [0, 1, 500_000, MAX_MONEY]) expect(isRupiah(ok)).toBe(true);
    for (const bad of [
      -1,
      0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      MAX_MONEY + 1,
      "5",
      null,
      undefined,
    ])
      expect(isRupiah(bad)).toBe(false);
  });
});

describe("proposal totals", () => {
  const cat = catalog(item("a", 500_000), item("b", 250_000), item("c", 1_000_000));

  it("CUSTOM: sum of custom lines at catalog values", () => {
    const r = priceProposal({
      mode: "CUSTOM",
      package: null,
      catalog: cat,
      customLines: [
        { itemId: "a", quantity: 2 },
        { itemId: "b", quantity: "1.5" },
      ],
    });
    expect(r.calculatedValue).toBe(1_000_000 + 375_000);
    expect(r.lines.map((l) => [l.itemId, l.source, l.lineTotal])).toEqual([
      ["a", "CUSTOM", 1_000_000],
      ["b", "CUSTOM", 375_000],
    ]);
    expect(r.packagePrice).toBe(0);
  });

  it("PACKAGE: worth the listed price; package benefit lines are included, never added again", () => {
    const r = priceProposal({
      mode: "PACKAGE",
      package: pkg(1_500_000, ["a", 2], ["b", 3]),
      catalog: cat,
      customLines: [],
    });
    expect(r.calculatedValue).toBe(1_500_000);
    expect(r.packageBenefitsReferenceValue).toBe(1_000_000 + 750_000); // reference only
    expect(r.customTotal).toBe(0);
    expect(r.lines.every((l) => l.source === "PACKAGE")).toBe(true);
  });

  it("HYBRID: package price plus custom lines for benefits the package does NOT include", () => {
    const r = priceProposal({
      mode: "HYBRID",
      package: pkg(1_500_000, ["a", 2]),
      catalog: cat,
      customLines: [{ itemId: "c", quantity: 1 }],
    });
    expect(r.calculatedValue).toBe(1_500_000 + 1_000_000);
    expect(r.lines.map((l) => l.source)).toEqual(["PACKAGE", "CUSTOM"]);
  });

  it("a custom line for a benefit the package already includes is refused (would be counted twice)", () => {
    expect(
      code(() =>
        priceProposal({
          mode: "HYBRID",
          package: pkg(1_500_000, ["a", 2]),
          catalog: cat,
          customLines: [{ itemId: "a", quantity: 1 }],
        }),
      ),
    ).toBe("DOUBLE_COUNTED_BENEFIT");
  });

  it("the same benefit twice (custom or in a package) is refused", () => {
    expect(
      code(() =>
        priceProposal({
          mode: "CUSTOM",
          package: null,
          catalog: cat,
          customLines: [
            { itemId: "a", quantity: 1 },
            { itemId: "a", quantity: 2 },
          ],
        }),
      ),
    ).toBe("DUPLICATE_BENEFIT");
    expect(
      code(() =>
        priceProposal({
          mode: "PACKAGE",
          package: pkg(1, ["a", 1], ["a", 2]),
          catalog: cat,
          customLines: [],
        }),
      ),
    ).toBe("DUPLICATE_BENEFIT");
  });

  it("mode and package must agree", () => {
    expect(
      code(() => priceProposal({ mode: "PACKAGE", package: null, catalog: cat, customLines: [] })),
    ).toBe("PACKAGE_REQUIRED");
    expect(
      code(() => priceProposal({ mode: "HYBRID", package: null, catalog: cat, customLines: [] })),
    ).toBe("PACKAGE_REQUIRED");
    expect(
      code(() => priceProposal({ mode: "CUSTOM", package: pkg(1), catalog: cat, customLines: [] })),
    ).toBe("PACKAGE_NOT_ALLOWED");
    expect(
      code(() =>
        priceProposal({
          mode: "PACKAGE",
          package: pkg(1, ["a", 1]),
          catalog: cat,
          customLines: [{ itemId: "b", quantity: 1 }],
        }),
      ),
    ).toBe("PACKAGE_MODE_CUSTOM_LINE");
  });

  it("an item missing from the catalog is refused", () => {
    expect(
      code(() =>
        priceProposal({
          mode: "CUSTOM",
          package: null,
          catalog: cat,
          customLines: [{ itemId: "zzz", quantity: 1 }],
        }),
      ),
    ).toBe("PACKAGE_LINE_NOT_IN_PACKAGE");
  });

  it("keeps catalog and agreed values; reports the negotiated difference", () => {
    const r = priceProposal({
      mode: "CUSTOM",
      package: null,
      catalog: cat,
      customLines: [
        { itemId: "a", quantity: 2, agreedUnitValue: 450_000 },
        { itemId: "b", quantity: 1, agreedUnitValue: 300_000 },
      ],
    });
    expect(
      r.lines.map((l) => [l.catalogUnitValue, l.agreedUnitValue, l.negotiatedDelta, l.lineTotal]),
    ).toEqual([
      [500_000, 450_000, -50_000, 900_000],
      [250_000, 300_000, 50_000, 300_000],
    ]);
    expect(r.calculatedValue).toBe(1_200_000);
  });

  it("package benefits can carry negotiated values without changing the package price", () => {
    const r = priceProposal({
      mode: "PACKAGE",
      package: pkg(1_000_000, ["a", 2]),
      catalog: cat,
      customLines: [],
      packageAgreedValues: new Map([["a", 400_000]]),
    });
    expect(r.calculatedValue).toBe(1_000_000);
    expect(r.lines[0]).toMatchObject({
      agreedUnitValue: 400_000,
      negotiatedDelta: -100_000,
      lineTotal: 800_000,
    });
  });

  it("rounding is per line, then summed (not rounded once at the end)", () => {
    const c = catalog(item("x", 333));
    const r = priceProposal({
      mode: "CUSTOM",
      package: null,
      catalog: new Map([...c, ["y", item("y", 333)]]),
      customLines: [
        { itemId: "x", quantity: "1.5" },
        { itemId: "y", quantity: "1.5" },
      ],
    });
    expect(r.lines.map((l) => l.lineTotal)).toEqual([500, 500]); // 499.5 each -> 500
    expect(r.calculatedValue).toBe(1000); // not 999 (rounding the 999.0 sum)
  });

  it("zero and missing values: an empty custom proposal is worth 0; a free benefit adds 0", () => {
    expect(
      priceProposal({ mode: "CUSTOM", package: null, catalog: cat, customLines: [] })
        .calculatedValue,
    ).toBe(0);
    expect(
      priceProposal({
        mode: "CUSTOM",
        package: null,
        catalog: catalog(item("free", 0)),
        customLines: [{ itemId: "free", quantity: 5 }],
      }).calculatedValue,
    ).toBe(0);
  });

  it("is deterministic and does not mutate its input", () => {
    const input: PricingInput = {
      mode: "HYBRID",
      package: pkg(1_500_000, ["a", 2]),
      catalog: cat,
      customLines: [{ itemId: "c", quantity: 1 }],
    };
    const before = JSON.stringify([input.customLines, input.package]);
    expect(priceProposal(input)).toEqual(priceProposal(input));
    expect(JSON.stringify([input.customLines, input.package])).toBe(before);
  });

  it("sums stay exact at the upper bound", () => {
    const big = catalog(item("a", MAX_MONEY), item("b", MAX_MONEY));
    const r = priceProposal({
      mode: "CUSTOM",
      package: null,
      catalog: big,
      customLines: [
        { itemId: "a", quantity: 1 },
        { itemId: "b", quantity: 1 },
      ],
    });
    expect(r.calculatedValue).toBe(2 * MAX_MONEY);
    expect(Number.isSafeInteger(r.calculatedValue)).toBe(true);
  });
});
