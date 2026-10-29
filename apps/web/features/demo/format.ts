/**
 * Small formatting helpers shared across the demo prototype.
 * Client-safe, no dependencies. Dates use the fixed demo anchor so renders
 * are deterministic and hydration-safe.
 */
import { DEMO_NOW_ISO } from "./types";

export const DEMO_NOW = new Date(DEMO_NOW_ISO);

const MILLIS_PER_DAY = 86_400_000;

export function formatDate(iso: string, opts: { withTime?: boolean } = {}): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(opts.withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Asia/Jakarta",
  });
}

export function formatDateOnly(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

/** "3 days ago" / "in 5 days" relative to the fixed demo anchor. */
export function relativeDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const days = Math.round((d.getTime() - DEMO_NOW.getTime()) / MILLIS_PER_DAY);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1) return `in ${days} days`;
  return `${-days} days ago`;
}

/** Absolute date with a small relative hint when close to the anchor. */
export function friendlyDate(iso: string): string {
  const rel = relativeDay(iso);
  const abs = formatDateOnly(iso);
  if (rel === "Today" || rel === "Tomorrow" || rel === "Yesterday") return `${rel} · ${abs}`;
  return abs;
}

export function isDueWithin(iso: string, days: number): boolean {
  const d = new Date(iso);
  const delta = d.getTime() - DEMO_NOW.getTime();
  return delta >= -MILLIS_PER_DAY && delta <= days * MILLIS_PER_DAY;
}

export function isPast(iso: string): boolean {
  return new Date(iso).getTime() < DEMO_NOW.getTime();
}

/** Integer rupiah, e.g. "Rp 45.000.000". */
export function idr(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `Rp ${value.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;
}

export function idrCompact(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (Math.abs(value) >= 1_000_000_000)
    return `Rp ${(value / 1_000_000_000).toFixed(1).replace(".", ",")} M`;
  if (Math.abs(value) >= 1_000_000)
    return `Rp ${(value / 1_000_000).toFixed(1).replace(".", ",")} jt`;
  return idr(value);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Short self-describing id generator for records created during the session. */
export function sessionId(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(3, "0")}`;
}
