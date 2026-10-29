/**
 * Deterministic outreach linter (PRD §6, E2: "linter errors block approval; every required
 * rule has a unit test"). Pure function of (channel, language, subject, body). No model calls.
 *
 * Severity ERROR blocks approval. WARNING is shown to the human approver and recorded.
 * The rule set is versioned; a change to any rule requires a new LINT_VERSION.
 */

import type { ContactChannelType } from "../contacts/address";

export const LINT_VERSION = 1;

export type LintSeverity = "ERROR" | "WARNING";

export interface LintFinding {
  rule: LintRule;
  severity: LintSeverity;
  /** Short, non-sensitive explanation (never echoes matched text). */
  message: string;
}

export const LINT_RULES = {
  BODY_TOO_SHORT: "ERROR",
  BODY_TOO_LONG: "ERROR",
  SUBJECT_REQUIRED: "ERROR",
  SUBJECT_NOT_ALLOWED: "ERROR",
  SUBJECT_TOO_LONG: "ERROR",
  PLACEHOLDER_LEFT: "ERROR",
  UNVERIFIED_MARKER: "ERROR",
  INTERNAL_NOTE_LEAK: "ERROR",
  SECRET_LIKE: "ERROR",
  INSECURE_LINK: "ERROR",
  LINK_SHORTENER: "ERROR",
  CONTROL_CHARACTERS: "ERROR",
  GUARANTEE_PROMISE: "ERROR",
  SALUTATION_MISSING: "WARNING",
  CLOSING_MISSING: "WARNING",
  EXCESSIVE_CAPS: "WARNING",
  EXCESSIVE_EXCLAMATION: "WARNING",
} as const satisfies Record<string, LintSeverity>;
export type LintRule = keyof typeof LINT_RULES;

const MAX_BODY: Record<ContactChannelType, number> = {
  EMAIL: 5000,
  LINKEDIN: 1900,
  WHATSAPP: 1500,
  PHONE: 1500,
};
const MIN_BODY = 40;
const MAX_SUBJECT = 150;

const PLACEHOLDER =
  /\{\{[^}]*\}\}|\[(?:NAMA|NAME|PERUSAHAAN|COMPANY|TANGGAL|DATE|TODO)[^\]]*\]|<\s*(?:name|nama|company)\s*>|\b(?:TODO|TBD|XXX|lorem ipsum)\b/i;
const UNVERIFIED = /\[(?:unverified|belum terverifikasi|perlu cek|cek lagi|source\?)\]/i;
const INTERNAL =
  /\b(?:BATNA|batas (?:bawah )?negosiasi|harga minimum kami|internal only|jangan dibagikan|catatan internal)\b/i;
const SECRET =
  /\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,}|\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{16,}|\bAKIA[0-9A-Z]{16}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:LLM_API_KEY|AUTH_SECRET|DATABASE_URL)\b/;
const GUARANTEE =
  /\b(?:dijamin|garansi|pasti untung|guarantee[ds]?|guaranteed returns?|100% (?:pasti|guaranteed))\b/i;
const URL_RE = /\bhttps?:\/\/[^\s<>"')]+/gi;
const SHORTENERS = new Set([
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "cutt.ly",
  "rebrand.ly",
  "shorturl.at",
]);
const SALUTATION: Record<"id" | "en", RegExp> = {
  id: /\b(?:Yth\.?|Bapak|Ibu|Bapak\/Ibu|Kepada)\b/,
  en: /\b(?:Dear|Hello|Good (?:morning|afternoon))\b/i,
};
const CLOSING: Record<"id" | "en", RegExp> = {
  id: /\b(?:Hormat kami|Salam hangat|Terima kasih)\b/i,
  en: /\b(?:Kind regards|Best regards|Regards|Sincerely|Thank you)\b/i,
};

function hasControlChars(text: string): boolean {
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if ((c < 0x20 && c !== 0x0a && c !== 0x0d && c !== 0x09) || c === 0x7f) return true;
    if (
      c === 0x200b ||
      c === 0x200e ||
      c === 0x200f ||
      (c >= 0x202a && c <= 0x202e) ||
      (c >= 0x2066 && c <= 0x2069)
    )
      return true;
  }
  return false;
}

export interface LintInput {
  channel: ContactChannelType;
  language: "id" | "en";
  subject: string | null;
  body: string;
}

export interface LintReport {
  version: number;
  passed: boolean;
  findings: LintFinding[];
}

export function lintOutreach(input: LintInput): LintReport {
  const findings: LintFinding[] = [];
  const add = (rule: LintRule, message: string) =>
    findings.push({ rule, severity: LINT_RULES[rule], message });
  const { body, subject, channel } = input;
  const whole = `${subject ?? ""}\n${body}`;
  const visibleLength = body.trim().length;

  if (visibleLength < MIN_BODY)
    add("BODY_TOO_SHORT", `Body must be at least ${MIN_BODY} characters.`);
  if (body.length > MAX_BODY[channel])
    add("BODY_TOO_LONG", `Body exceeds ${MAX_BODY[channel]} characters for ${channel}.`);

  if (channel === "EMAIL") {
    if (!subject || subject.trim().length === 0) add("SUBJECT_REQUIRED", "Email needs a subject.");
    else if (subject.length > MAX_SUBJECT)
      add("SUBJECT_TOO_LONG", `Subject exceeds ${MAX_SUBJECT} characters.`);
  } else if (subject !== null && subject.trim().length > 0) {
    add("SUBJECT_NOT_ALLOWED", `${channel} messages have no subject.`);
  }

  if (PLACEHOLDER.test(whole))
    add("PLACEHOLDER_LEFT", "Template placeholder or TODO left in the text.");
  if (UNVERIFIED.test(whole))
    add("UNVERIFIED_MARKER", "Text still contains an unverified-claim marker.");
  if (INTERNAL.test(whole)) add("INTERNAL_NOTE_LEAK", "Text contains internal negotiation notes.");
  if (SECRET.test(whole)) add("SECRET_LIKE", "Text contains a credential-like value.");
  if (GUARANTEE.test(whole)) add("GUARANTEE_PROMISE", "Do not promise guaranteed outcomes.");
  if (hasControlChars(whole))
    add("CONTROL_CHARACTERS", "Text contains hidden or control characters.");

  let insecure = false;
  let shortener = false;
  for (const match of whole.matchAll(URL_RE)) {
    const raw = match[0];
    if (raw.toLowerCase().startsWith("http://")) insecure = true;
    try {
      if (SHORTENERS.has(new URL(raw).hostname.toLowerCase().replace(/^www\./, "")))
        shortener = true;
    } catch {
      insecure = true;
    }
  }
  if (insecure) add("INSECURE_LINK", "Links must use https.");
  if (shortener) add("LINK_SHORTENER", "Do not use link shorteners; show the full destination.");

  // The salutation must OPEN the message: a stray "Ibu" later in the text does not count.
  const firstLine = body.split("\n").find((line) => line.trim().length > 0) ?? "";
  if (channel === "EMAIL" && !SALUTATION[input.language].test(firstLine)) {
    add("SALUTATION_MISSING", "Open with a formal salutation.");
  }
  if (channel === "EMAIL" && !CLOSING[input.language].test(body))
    add("CLOSING_MISSING", "Add a formal closing.");

  const letters = body.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 40 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.5) {
    add("EXCESSIVE_CAPS", "Too much text in capital letters.");
  }
  if ((body.match(/!/g)?.length ?? 0) > 3 || /!{2,}/.test(body))
    add("EXCESSIVE_EXCLAMATION", "Too many exclamation marks.");

  return { version: LINT_VERSION, passed: findings.every((f) => f.severity !== "ERROR"), findings };
}
