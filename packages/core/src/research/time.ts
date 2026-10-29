/**
 * Calendar-day boundaries in Asia/Jakarta (AGENTS.md: store UTC, display and count by Jakarta).
 * Asia/Jakarta is UTC+7 with no daylight saving, so a fixed offset is exact.
 */

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** [from, to) in UTC covering the Jakarta calendar day that contains `instant`. */
export function jakartaDayRange(instant: Date): { from: Date; to: Date } {
  const local = instant.getTime() + JAKARTA_OFFSET_MS;
  const startLocal = Math.floor(local / DAY_MS) * DAY_MS;
  const from = new Date(startLocal - JAKARTA_OFFSET_MS);
  return { from, to: new Date(from.getTime() + DAY_MS) };
}
