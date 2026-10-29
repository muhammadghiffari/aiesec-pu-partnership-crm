/**
 * Enrichment trust boundary (M2-02). Provider output is untrusted DATA:
 * - validated per row with Zod; malformed rows are dropped and counted;
 * - every row needs a source URL (http(s), no credentials) and a valid channel address;
 * - anything the provider claims about verification, consent or DNC is ignored: results are
 *   always stored UNVERIFIED as candidates for human review;
 * - result count is capped per lookup (no bulk harvesting);
 * - text is bounded and control characters are stripped.
 */

import { z } from "zod";
import {
  CONTACT_CHANNELS,
  type ContactChannelType,
  emailDomain,
  normalizeAddress,
} from "./address";
import { SOURCE_TIERS, type SourceTier } from "./types";

export const MAX_RESULTS_PER_LOOKUP = 10;

const clean = (max: number, min = 1) =>
  z
    .string()
    .transform((s) =>
      [...s]
        .filter((ch) => {
          const c = ch.charCodeAt(0);
          return c >= 0x20 && c !== 0x7f;
        })
        .join("")
        .trim(),
    )
    .pipe(z.string().min(min).max(max));

const sourceUrl = z
  .string()
  .max(2000)
  .refine((u) => {
    try {
      const url = new URL(u);
      return (
        (url.protocol === "https:" || url.protocol === "http:") &&
        !url.username &&
        !url.password &&
        url.hostname.includes(".")
      );
    } catch {
      return false;
    }
  });

const rowSchema = z.object({
  name: clean(200, 2),
  title: clean(120).nullish(),
  channel: z.enum(CONTACT_CHANNELS),
  address: z.string().max(320),
  sourceUrl,
  // Providers may only claim a weaker tier; OFFICIAL/REFERRAL are human judgements.
  sourceTier: z.enum(SOURCE_TIERS).optional(),
});

export interface EnrichedRow {
  name: string;
  title: string | null;
  channel: ContactChannelType;
  address: string;
  sourceUrl: string;
  sourceTier: SourceTier;
  offDomain: boolean;
}

export interface ParsedEnrichment {
  rows: EnrichedRow[];
  rejected: number;
  truncated: boolean;
}

export function parseEnrichment(
  raw: unknown,
  partnerDomain: string | null,
): ParsedEnrichment | null {
  const envelope = z.object({ results: z.array(z.unknown()) }).safeParse(raw);
  if (!envelope.success) return null;

  const all = envelope.data.results;
  const truncated = all.length > MAX_RESULTS_PER_LOOKUP;
  const rows: EnrichedRow[] = [];
  const seen = new Set<string>();
  let rejected = 0;

  for (const item of all.slice(0, MAX_RESULTS_PER_LOOKUP)) {
    const parsed = rowSchema.safeParse(item);
    const address = parsed.success
      ? normalizeAddress(parsed.data.channel, parsed.data.address)
      : null;
    if (!parsed.success || !address) {
      rejected++;
      continue;
    }
    const key = `${parsed.data.channel}:${address}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const claimed = parsed.data.sourceTier;
    const tier: SourceTier = claimed === "RESEARCH" ? "RESEARCH" : "UNVERIFIED";
    const domain = parsed.data.channel === "EMAIL" ? emailDomain(address) : null;
    const offDomain =
      domain !== null &&
      partnerDomain !== null &&
      domain !== partnerDomain &&
      !domain.endsWith(`.${partnerDomain}`);

    rows.push({
      name: parsed.data.name,
      title: parsed.data.title ?? null,
      channel: parsed.data.channel,
      address,
      sourceUrl: parsed.data.sourceUrl,
      sourceTier: tier,
      offDomain,
    });
  }
  return { rows, rejected, truncated };
}
