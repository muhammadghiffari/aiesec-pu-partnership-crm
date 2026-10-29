import { describe, expect, it } from "vitest";
import {
  APPROVAL_HASH_VERSION,
  type ApprovalPayload,
  approvalHash,
  canonicalApprovalString,
  sameHash,
} from "./hash";

const base: ApprovalPayload = {
  messageId: "11111111-1111-4111-8111-111111111111",
  cycleId: "22222222-2222-4222-8222-222222222222",
  contactId: "33333333-3333-4333-8333-333333333333",
  channelId: "44444444-4444-4444-8444-444444444444",
  channel: "EMAIL",
  address: "pic@syntheticedu.example.invalid",
  subject: "Penjajakan kerja sama",
  body: "Yth. Ibu Sinta,\nKami ingin berdiskusi.",
};

describe("approval hash", () => {
  it("is a stable lowercase SHA-256 hex digest", async () => {
    const h = await approvalHash(base);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await approvalHash({ ...base })).toBe(h);
    expect(canonicalApprovalString(base).startsWith(`${APPROVAL_HASH_VERSION}\n`)).toBe(true);
  });

  it.each([
    ["body (one character)", { body: `${base.body}.` }],
    ["body (trailing space)", { body: `${base.body} ` }],
    ["body (case)", { body: base.body.replace("Kami", "kami") }],
    ["body (look-alike character)", { body: base.body.replace("a", "а") }],
    ["body (zero-width space)", { body: `${base.body}\u200b` }],
    ["subject", { subject: "Penjajakan kerja sama!" }],
    ["subject removed", { subject: null }],
    ["recipient (contact)", { contactId: "55555555-5555-4555-8555-555555555555" }],
    ["channel row", { channelId: "66666666-6666-4666-8666-666666666666" }],
    ["channel type", { channel: "WHATSAPP" }],
    ["address", { address: "other@syntheticedu.example.invalid" }],
    ["address case-look-alike", { address: "pic@syntheticedu.example.invalid " }],
    ["cycle", { cycleId: "77777777-7777-4777-8777-777777777777" }],
    ["message id", { messageId: "88888888-8888-4888-8888-888888888888" }],
  ] as const)("changes when the %s changes", async (_label, patch) => {
    expect(await approvalHash({ ...base, ...patch })).not.toBe(await approvalHash(base));
  });

  it("an empty subject and a missing subject are different content", async () => {
    expect(await approvalHash({ ...base, subject: "" })).not.toBe(
      await approvalHash({ ...base, subject: null }),
    );
  });

  it("cannot be confused by moving text between adjacent fields (length-prefixed)", async () => {
    const a = await approvalHash({ ...base, address: "ab", subject: "cd" });
    const b = await approvalHash({ ...base, address: "abc", subject: "d" });
    const c = await approvalHash({ ...base, subject: "x\nbody=5:hello", body: "" });
    const d = await approvalHash({ ...base, subject: "x", body: "\nbody=5:hello" });
    expect(a).not.toBe(b);
    expect(c).not.toBe(d);
  });

  it("counts UTF-8 bytes, so multi-byte text is unambiguous", async () => {
    expect(canonicalApprovalString({ ...base, body: "é" })).toContain("body=2:é");
    expect(canonicalApprovalString({ ...base, body: "😀" })).toContain("body=4:😀");
  });

  it("sameHash compares equal digests, rejects different ones and different lengths", () => {
    const h = "a".repeat(64);
    expect(sameHash(h, h)).toBe(true);
    expect(sameHash(h, `${"a".repeat(63)}b`)).toBe(false);
    expect(sameHash(h, "a".repeat(63))).toBe(false);
    expect(sameHash("", "")).toBe(true);
  });
});
