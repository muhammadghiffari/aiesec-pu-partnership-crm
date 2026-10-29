import { describe, expect, it } from "vitest";
import { AuditMetadataError, changedFieldNames, validateAuditMetadata } from "./metadata";

const SHA = "a".repeat(64);

describe("safe audit metadata", () => {
  it("accepts minimized operational metadata", () => {
    const out = validateAuditMetadata({
      changedFields: ["status", "stage"],
      rowCount: 12,
      dryRun: false,
      format: "xlsx",
      entityRef: "3f2b8c1e-8a1d-4c55-9a43-2f6c1f0a9b11",
      approvedContentHash: SHA,
      effectiveFrom: "2026-10-29",
      occurredAt: "2026-10-29T03:00:00.000Z",
      previous: null,
    });
    expect(out.rowCount).toBe(12);
    expect(out.changedFields).toEqual(["status", "stage"]);
  });

  it("returns a frozen copy", () => {
    const input = { items: ["a"] };
    const out = validateAuditMetadata(input);
    expect(Object.isFrozen(out)).toBe(true);
    input.items.push("b");
    expect(out.items).toEqual(["a"]);
  });

  it.each([
    "email",
    "contactEmail",
    "phone",
    "whatsappNumber",
    "linkedinUrl",
    "password",
    "apiKey",
    "authToken",
    "sessionCookie",
    "prompt",
    "transcript",
    "messageBody",
    "draftContent",
    "internalNote",
    "contactName",
    "signature",
  ])("rejects forbidden key %s", (key) => {
    expect(() => validateAuditMetadata({ [key]: "x" })).toThrowError(AuditMetadataError);
  });

  it("a non-digest value under a hash-like key is still checked by key", () => {
    expect(() => validateAuditMetadata({ contentHash: "not-a-digest" })).toThrow(
      AuditMetadataError,
    );
  });

  it.each([
    ["email in an innocent key", { summary: "contact budi@example.invalid today" }],
    ["JWT", { ref: "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2ln" }],
    ["bearer header", { ref: "Bearer abcdefghijklmnop12345" }],
    ["provider key", { ref: `${"sk"}-${"x".repeat(24)}` }],
    ["github token", { ref: `${"ghp"}_${"x".repeat(24)}` }],
    ["aws key id", { ref: `${"AKIA"}${"X".repeat(16)}` }],
    ["private key block", { ref: `${"-----BEGIN RSA "}${"PRIVATE KEY"}-----` }],
    ["international phone", { ref: "+62 812 3456 7890" }],
    ["local phone", { ref: "0812-3456-7890" }],
    ["email inside a list", { refs: ["fine", "someone@example.invalid"] }],
  ])("rejects unsafe value: %s", (_label, input) => {
    expect(() => validateAuditMetadata(input)).toThrowError(AuditMetadataError);
  });

  it("rejects nested objects and non-primitive values (no record dumps)", () => {
    for (const bad of [
      { record: { name: "x" } },
      { fn: () => 1 },
      { d: new Date() },
      { list: [1, 2] },
    ]) {
      expect(() => validateAuditMetadata(bad)).toThrow(AuditMetadataError);
    }
  });

  it("rejects oversize metadata", () => {
    const many = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, i]));
    expect(() => validateAuditMetadata(many)).toThrow(AuditMetadataError);
    expect(() => validateAuditMetadata({ note: "x" })).toThrow(AuditMetadataError);
    expect(() => validateAuditMetadata({ summary: "x".repeat(201) })).toThrow(AuditMetadataError);
    expect(() => validateAuditMetadata({ list: Array.from({ length: 26 }, () => "a") })).toThrow();
  });

  it("errors name the key but never leak the offending value", () => {
    try {
      validateAuditMetadata({ summary: "reach me at secret.person@example.invalid" });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain("secret.person");
      expect((error as AuditMetadataError).key).toBe("summary");
    }
  });
});

describe("changedFieldNames", () => {
  it("lists changed, added and removed field names only", () => {
    expect(
      changedFieldNames(
        { name: "A", status: "NEW", gone: 1, same: [1] },
        { name: "A", status: "WON", added: true, same: [1] },
      ),
    ).toEqual(["added", "gone", "status"]);
  });
});
