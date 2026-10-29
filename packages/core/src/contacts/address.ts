/**
 * Canonical channel addresses (M2-02). One canonical form per address so the same recipient
 * cannot appear as two "different" channels (one verified, one not), and an approval hash
 * (M2-04) is computed over a stable value.
 */

export const CONTACT_CHANNELS = ["EMAIL", "WHATSAPP", "PHONE", "LINKEDIN"] as const;
export type ContactChannelType = (typeof CONTACT_CHANNELS)[number];

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const E164 = /^\+[1-9][0-9]{7,14}$/;
const LINKEDIN_SLUG = /^[A-Za-z0-9_-]{3,100}$/;

/** Returns the canonical address, or null when the value is not a valid address for `channel`. */
export function normalizeAddress(channel: ContactChannelType, raw: string): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.length < 3 || value.length > 320) return null;

  switch (channel) {
    case "EMAIL": {
      const email = value.toLowerCase();
      return EMAIL.test(email) ? email : null;
    }
    case "WHATSAPP":
    case "PHONE": {
      // Keep digits and a leading +; Indonesian national format 08xx -> +628xx.
      const compact = value.replace(/[\s().-]/g, "");
      if (!/^\+?[0-9]+$/.test(compact)) return null;
      let e164 = compact;
      if (compact.startsWith("0")) e164 = `+62${compact.slice(1)}`;
      else if (compact.startsWith("62")) e164 = `+${compact}`;
      return E164.test(e164) ? e164 : null;
    }
    case "LINKEDIN": {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        return null;
      }
      const host = url.hostname.toLowerCase();
      if (url.protocol !== "https:" || (host !== "linkedin.com" && host !== "www.linkedin.com"))
        return null;
      if (url.username || url.password) return null;
      // Only personal profile URLs; query strings/fragments (tracking) are dropped.
      const match = url.pathname.match(/^\/in\/([^/]+)\/?$/);
      const slug = match?.[1];
      if (!slug || !LINKEDIN_SLUG.test(slug)) return null;
      return `https://www.linkedin.com/in/${slug}`;
    }
  }
}

/** Hostname-level check used to flag a candidate email that is not on the partner's domain. */
export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  return at > 0 ? email.slice(at + 1).toLowerCase() : null;
}
