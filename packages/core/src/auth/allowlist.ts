/**
 * Email allowlist (FR-100). Deny by default: an empty or missing list admits nobody.
 *
 * Entries are exact email addresses only. Wildcards and bare domains are rejected at
 * construction so a typo cannot silently widen access. The list is input data from
 * configuration; the caller passes the raw string (this module does not read the env).
 */

import { z } from "zod";
import type { AllowlistProvider } from "./types";

const emailEntry = z.email();

export class AllowlistConfigError extends Error {
  constructor(readonly invalidEntryCount: number) {
    // Never echo the entries: they are personal data.
    super(
      `allowlist contains ${invalidEntryCount} invalid entr${invalidEntryCount === 1 ? "y" : "ies"}`,
    );
    this.name = "AllowlistConfigError";
  }
}

export function parseAllowlist(raw: string | undefined | null): Set<string> {
  const entries = (raw ?? "")
    .split(/[,\n;]/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  const invalid = entries.filter((entry) => !emailEntry.safeParse(entry).success);
  if (invalid.length > 0) throw new AllowlistConfigError(invalid.length);

  return new Set(entries);
}

export function createStaticAllowlist(raw: string | undefined | null): AllowlistProvider {
  const allowed = parseAllowlist(raw);
  return { isAllowed: (normalizedEmail) => allowed.has(normalizedEmail.trim().toLowerCase()) };
}
