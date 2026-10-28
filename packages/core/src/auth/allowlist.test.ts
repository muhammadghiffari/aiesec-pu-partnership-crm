import { describe, expect, it } from "vitest";
import { AllowlistConfigError, createStaticAllowlist, parseAllowlist } from "./allowlist";

describe("email allowlist", () => {
  it("admits listed emails case-insensitively and nobody else", async () => {
    const list = createStaticAllowlist("a@example.invalid, B@Example.invalid");
    expect(await list.isAllowed("a@example.invalid")).toBe(true);
    expect(await list.isAllowed("  b@example.INVALID ")).toBe(true);
    expect(await list.isAllowed("c@example.invalid")).toBe(false);
  });

  it("denies everyone when empty, missing or whitespace-only (deny by default)", async () => {
    for (const raw of ["", "   ", undefined, null, ",,;"]) {
      const list = createStaticAllowlist(raw);
      expect(await list.isAllowed("a@example.invalid")).toBe(false);
    }
  });

  it("supports comma, semicolon and newline separators", () => {
    expect(parseAllowlist("a@example.invalid;b@example.invalid\nc@example.invalid").size).toBe(3);
  });

  it("rejects wildcards, bare domains and malformed entries without echoing them", () => {
    for (const raw of [
      "*@example.invalid",
      "@example.invalid",
      "example.invalid",
      "a@b",
      "not-an-email",
    ]) {
      expect(() => parseAllowlist(raw)).toThrow(AllowlistConfigError);
    }
    try {
      parseAllowlist("secret.person@@example.invalid");
    } catch (error) {
      expect((error as Error).message).not.toContain("secret.person");
    }
  });

  it("does not admit by suffix or substring", async () => {
    const list = createStaticAllowlist("a@example.invalid");
    expect(await list.isAllowed("a@example.invalid.attacker.invalid")).toBe(false);
    expect(await list.isAllowed("xa@example.invalid")).toBe(false);
  });
});
