/**
 * DEVELOPMENT-ONLY local identity verifier for the /demo PostgreSQL experience
 * (FR-100).
 *
 * Real deployments verify Google-signed ID tokens (`createGoogleIdentityVerifier`).
 * When no authorized Google OAuth client exists, local development still needs to
 * exercise the full session path: allowlist, users lookup, session minting, RBAC
 * and audit. This verifier accepts exactly one token shape, `dev:<email>`, so a
 * local session can be minted for an allowlisted, seeded user.
 *
 * It is NOT a weaker authentication for production: the web composition installs
 * this verifier only when ALL of the following hold (see features/partners/backend.ts):
 *   1. the Node process is not running in production mode, and
 *   2. `CRM_DEMO_MODE=1` is set explicitly.
 * In production the flag is ignored and Google verification is required; this
 * verifier is never installed. Even in dev, the allowlist plus an active `users`
 * row are still enforced by the session service.
 *
 * This module never reads the environment; the caller decides whether dev mode
 * is allowed.
 */

import { IdentityVerificationError } from "./google-id-token";
import { normalizeEmail } from "./google-id-token";
import type { IdentityVerifier, VerifiedIdentity } from "./types";

export const DEV_TOKEN_PREFIX = "dev:";

export function devIdentityToken(email: string): string {
  return `${DEV_TOKEN_PREFIX}${normalizeEmail(email)}`;
}

export function isDevIdentityToken(token: string): boolean {
  return token.startsWith(DEV_TOKEN_PREFIX);
}

export function devIdentityEmail(token: string): string | null {
  if (!isDevIdentityToken(token)) return null;
  const email = token.slice(DEV_TOKEN_PREFIX.length);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? normalizeEmail(email) : null;
}

export function createDevIdentityVerifier(options?: {
  /** Optional override for tests; defaults to the web dev sign-in issuer string. */
  subjectPrefix?: string;
}): IdentityVerifier {
  const subjectPrefix = options?.subjectPrefix ?? "local-demo";
  return {
    async verify(idToken: string): Promise<VerifiedIdentity> {
      const email = devIdentityEmail(idToken);
      if (!email) throw new IdentityVerificationError("MALFORMED_TOKEN");
      return {
        subject: `${subjectPrefix}:${email}`,
        email,
        emailVerified: true,
        name: undefined,
      };
    },
  };
}
