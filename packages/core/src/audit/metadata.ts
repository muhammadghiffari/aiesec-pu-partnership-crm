/**
 * Audit metadata minimization (SECURITY_PRIVACY #7).
 *
 * Fails closed: metadata that looks like contact PII, a secret, a prompt/transcript/message
 * body, or a whole-record dump is REJECTED, not silently stored. A rejected audit event
 * rejects the mutation (see service.ts), so a developer sees the mistake in tests instead of
 * PII reaching the log.
 */

import { z } from "zod";
import type { AuditMetadata } from "./types";

export class AuditMetadataError extends Error {
  constructor(
    readonly code: "UNSAFE_KEY" | "UNSAFE_VALUE" | "TOO_LARGE" | "INVALID_SHAPE",
    /** Offending key name only — never the value. */
    readonly key?: string,
  ) {
    super(`unsafe audit metadata: ${code}${key ? ` (key: ${key})` : ""}`);
    this.name = "AuditMetadataError";
  }
}

const MAX_KEYS = 20;
const MAX_STRING = 200;
const MAX_LIST = 25;

/** Keys that imply PII, secrets, or free-text bodies. */
const FORBIDDEN_KEY =
  /(e-?mail|phone|whats?app|linkedin|password|passwd|secret|token|api[-_]?key|authorization|cookie|credential|prompt|transcript|message|body|content|note|address|contact[-_]?name|signature)/i;

/** Value shapes that must never appear regardless of key name. */
const FORBIDDEN_VALUE: readonly RegExp[] = [
  /[^\s@]+@[^\s@]+\.[^\s@]+/, // email address
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/, // JWT
  /\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,}/, // provider-style API keys
  /\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{16,}/, // GitHub tokens
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_HEX = /^[0-9a-f]{64}$/i;
const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;

/** Phone-like digit runs (>= 9 digits), excluding ISO dates. UUIDs/hashes are exempted earlier. */
function looksLikePhone(value: string): boolean {
  for (const match of value.matchAll(/\+?\d[\d\s().-]{7,}\d/g)) {
    const run = match[0];
    const digits = run.replace(/\D/g, "").length;
    if (digits >= 9 && !ISO_DATE_PREFIX.test(run)) return true;
  }
  return false;
}

const valueSchema = z.union([
  z.string().max(MAX_STRING),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(z.string().max(MAX_STRING)).max(MAX_LIST),
]);

const metadataSchema = z.record(z.string().min(1).max(60), valueSchema);

function scanString(key: string, value: string): void {
  if (UUID.test(value) || SHA256_HEX.test(value)) return; // opaque identifiers, not free text
  if (FORBIDDEN_VALUE.some((pattern) => pattern.test(value)) || looksLikePhone(value)) {
    throw new AuditMetadataError("UNSAFE_VALUE", key);
  }
}

export function assertSafeText(label: string, value: string): void {
  scanString(label, value);
}

export function validateAuditMetadata(input: unknown): AuditMetadata {
  const parsed = metadataSchema.safeParse(input);
  if (!parsed.success) throw new AuditMetadataError("INVALID_SHAPE");
  const entries = Object.entries(parsed.data);
  if (entries.length > MAX_KEYS) throw new AuditMetadataError("TOO_LARGE");

  const out: Record<string, string | number | boolean | null | string[]> = {};
  for (const [key, value] of entries) {
    // `<something>Hash` holding a SHA-256 digest is allowed (e.g. approvedContentHash): the
    // digest is one-way and is exactly what the approval audit trail must record.
    const isDigest = /hash$/i.test(key) && typeof value === "string" && SHA256_HEX.test(value);
    if (!isDigest && FORBIDDEN_KEY.test(key)) throw new AuditMetadataError("UNSAFE_KEY", key);
    if (typeof value === "string") scanString(key, value);
    if (Array.isArray(value)) for (const item of value) scanString(key, item);
    out[key] = Array.isArray(value) ? [...value] : value;
  }
  return Object.freeze(out);
}

/**
 * Records WHICH fields changed without recording their values. Preferred over before/after
 * values for partner and contact records. Compares with `Object.is`-style JSON equality.
 */
export function changedFieldNames(
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys]
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .sort();
}
