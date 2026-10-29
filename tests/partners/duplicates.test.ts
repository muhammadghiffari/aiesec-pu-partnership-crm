import { describe, expect, it } from "vitest";
import { findPartnerDuplicates } from "../../packages/core/src/partners/service";

const acme = { id: "acme", name: "Acme", websiteDomain: null };

describe("partner duplicate review", () => {
  it("flags an exact name even when it is a single token", () => {
    expect(findPartnerDuplicates([acme], "Acme", null)).toEqual([
      { partnerId: "acme", name: "Acme", reason: "same_name" },
    ]);
  });

  it("flags a single-token overlap against a longer name", () => {
    expect(
      findPartnerDuplicates(
        [{ id: "acme-inc", name: "Acme Inc", websiteDomain: null }],
        "Acme",
        null,
      ),
    ).toEqual([{ partnerId: "acme-inc", name: "Acme Inc", reason: "similar_name" }]);
  });

  it("flags two-token overlap and the same domain", () => {
    expect(
      findPartnerDuplicates(
        [{ id: "branch", name: "Synthetic Academy Branch", websiteDomain: null }],
        "Synthetic Academy",
        null,
      ),
    ).toEqual([{ partnerId: "branch", name: "Synthetic Academy Branch", reason: "similar_name" }]);
    expect(
      findPartnerDuplicates(
        [{ id: "domain", name: "Different Name", websiteDomain: "acme.example" }],
        "Acme",
        "acme.example",
      ),
    ).toEqual([{ partnerId: "domain", name: "Different Name", reason: "same_domain" }]);
  });

  it("does not warn on one shared token between two multi-token names", () => {
    expect(
      findPartnerDuplicates(
        [{ id: "school", name: "Synthetic School", websiteDomain: null }],
        "Synthetic Academy",
        null,
      ),
    ).toEqual([]);
  });

  it("returns no warnings for an empty partner set", () => {
    expect(findPartnerDuplicates([], "Acme", "acme.example")).toEqual([]);
  });
});
