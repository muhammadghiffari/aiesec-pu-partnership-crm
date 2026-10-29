/**
 * Validation of untrusted research output (model/search results). Fail closed per candidate:
 * a candidate without a valid source URL, with out-of-range scores or oversized text is
 * rejected individually; a malformed envelope rejects the whole attempt.
 *
 * Model output is DATA. Nothing here interprets text as instructions, and URLs are only
 * stored, never fetched.
 */

import { z } from "zod";
import type { CandidateDraft } from "./types";

const MAX_CANDIDATES = 20;

// Strip control characters (incl. NUL) so stored text cannot smuggle terminal/escape content.
const cleanText = (max: number, min = 1) =>
  z
    .string()
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional sanitisation
    .transform((s) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim())
    .pipe(z.string().min(min).max(max));

/** http(s) only, no embedded credentials, bounded length. */
export const sourceUrl = z
  .string()
  .max(2000)
  .refine((u) => {
    try {
      const url = new URL(u);
      return (
        (url.protocol === "https:" || url.protocol === "http:") &&
        url.username === "" &&
        url.password === "" &&
        url.hostname.includes(".")
      );
    } catch {
      return false;
    }
  }, "invalid source url");

const domain = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/);

export const candidateSchema = z.object({
  name: cleanText(200, 2),
  websiteDomain: domain.nullish().transform((d) => d ?? null),
  fitScore: z.number().finite().min(0).max(100),
  fitRationale: cleanText(1000),
  insightSummary: cleanText(2000),
  sourceUrls: z.array(sourceUrl).min(1).max(10),
  unverifiedClaims: z.array(cleanText(300)).max(20).default([]),
});

const envelopeSchema = z.object({ candidates: z.array(z.unknown()).max(MAX_CANDIDATES) });

export interface ParsedResearchOutput {
  accepted: CandidateDraft[];
  /** Candidates dropped for failing validation (no source, bad score, oversized text). */
  rejectedCount: number;
  /** Candidates dropped because they scored below the criteria threshold. */
  belowThresholdCount: number;
}

export function parseResearchOutput(
  raw: unknown,
  minFitScore: number,
): ParsedResearchOutput | null {
  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success) return null;

  const accepted: CandidateDraft[] = [];
  const seen = new Set<string>();
  let rejectedCount = 0;
  let belowThresholdCount = 0;

  for (const item of envelope.data.candidates) {
    const parsed = candidateSchema.safeParse(item);
    if (!parsed.success) {
      rejectedCount++;
      continue;
    }
    const candidate = parsed.data;
    if (candidate.fitScore < minFitScore) {
      belowThresholdCount++;
      continue;
    }
    const key = candidate.name.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue; // same company twice in one answer
    seen.add(key);
    accepted.push(candidate);
  }
  return { accepted, rejectedCount, belowThresholdCount };
}
