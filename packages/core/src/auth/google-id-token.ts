/**
 * Google ID-token verification — the identity boundary (FR-100).
 *
 * Verifies an RS256 JWT against Google's JWKS using WebCrypto, then validates claims with
 * Zod. Network access (fetching JWKS) is an injected port so tests are hermetic and the
 * web app owns caching/transport. The OAuth client id comes from configuration (M0-04)
 * and is passed in; this module never reads the environment.
 *
 * Rejects: wrong algorithm (incl. `none`/HS*), unknown `kid`, bad signature, wrong issuer
 * or audience, expired/not-yet-valid token, missing or unverified email, and wrong nonce.
 * Every failure surfaces as `IdentityVerificationError` with a non-sensitive reason code;
 * the raw token is never included in errors.
 */

import { z } from "zod";
import type { Clock, IdentityVerifier, VerifiedIdentity } from "./types";
import { systemClock } from "./types";

export type IdentityFailureReason =
  | "MALFORMED_TOKEN"
  | "UNSUPPORTED_ALGORITHM"
  | "UNKNOWN_KEY"
  | "BAD_SIGNATURE"
  | "INVALID_CLAIMS"
  | "WRONG_ISSUER"
  | "WRONG_AUDIENCE"
  | "TOKEN_EXPIRED"
  | "TOKEN_NOT_YET_VALID"
  | "EMAIL_NOT_VERIFIED"
  | "NONCE_MISMATCH"
  | "KEYS_UNAVAILABLE";

export class IdentityVerificationError extends Error {
  constructor(readonly reason: IdentityFailureReason) {
    super(`identity verification failed: ${reason}`);
    this.name = "IdentityVerificationError";
  }
}

export interface JwksProvider {
  /** Returns the current key set. Caching/refresh policy belongs to the implementation. */
  getKeys(): Promise<readonly JsonWebKey[]>;
}

export const GOOGLE_ISSUERS: readonly string[] = [
  "https://accounts.google.com",
  "accounts.google.com",
];

const headerSchema = z.object({ alg: z.string(), kid: z.string().min(1) }).passthrough();

const claimsSchema = z
  .object({
    iss: z.string(),
    aud: z.union([z.string(), z.array(z.string())]),
    sub: z.string().min(1),
    exp: z.number(),
    iat: z.number().optional(),
    nbf: z.number().optional(),
    email: z.string().min(3).max(320),
    email_verified: z.union([z.boolean(), z.literal("true"), z.literal("false")]),
    name: z.string().max(200).optional(),
    nonce: z.string().optional(),
  })
  .passthrough();

export interface GoogleVerifierOptions {
  /** OAuth client id this application is registered as (token `aud`). */
  clientId: string;
  jwks: JwksProvider;
  clock?: Clock;
  /** Allowed clock skew in seconds. Default 60. */
  clockSkewSeconds?: number;
  /** If set, the token's `nonce` must equal this value. */
  expectedNonce?: string | undefined;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(input)) throw new IdentityVerificationError("MALFORMED_TOKEN");
  const padded = input
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function parseJsonSegment(segment: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)));
  } catch (error) {
    if (error instanceof IdentityVerificationError) throw error;
    throw new IdentityVerificationError("MALFORMED_TOKEN");
  }
}

export function createGoogleIdentityVerifier(options: GoogleVerifierOptions): IdentityVerifier {
  if (!options.clientId.trim()) throw new Error("clientId is required");
  const clock = options.clock ?? systemClock;
  const skew = options.clockSkewSeconds ?? 60;

  return {
    async verify(idToken: string): Promise<VerifiedIdentity> {
      const parts = typeof idToken === "string" ? idToken.split(".") : [];
      if (parts.length !== 3 || parts.some((p) => p.length === 0)) {
        throw new IdentityVerificationError("MALFORMED_TOKEN");
      }
      const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string];

      const header = headerSchema.safeParse(parseJsonSegment(encodedHeader));
      if (!header.success) throw new IdentityVerificationError("MALFORMED_TOKEN");
      // Pin the algorithm; never trust the header to select a weaker one.
      if (header.data.alg !== "RS256") throw new IdentityVerificationError("UNSUPPORTED_ALGORITHM");

      let keys: readonly JsonWebKey[];
      try {
        keys = await options.jwks.getKeys();
      } catch {
        throw new IdentityVerificationError("KEYS_UNAVAILABLE");
      }
      const jwk = keys.find(
        (key) =>
          (key as JsonWebKey & { kid?: string }).kid === header.data.kid && key.kty === "RSA",
      );
      if (!jwk) throw new IdentityVerificationError("UNKNOWN_KEY");

      let verified = false;
      try {
        const cryptoKey = await crypto.subtle.importKey(
          "jwk",
          jwk,
          { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
          false,
          ["verify"],
        );
        verified = await crypto.subtle.verify(
          "RSASSA-PKCS1-v1_5",
          cryptoKey,
          base64UrlToBytes(encodedSignature),
          new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
        );
      } catch {
        throw new IdentityVerificationError("BAD_SIGNATURE");
      }
      if (!verified) throw new IdentityVerificationError("BAD_SIGNATURE");

      const parsed = claimsSchema.safeParse(parseJsonSegment(encodedPayload));
      if (!parsed.success) throw new IdentityVerificationError("INVALID_CLAIMS");
      const claims = parsed.data;

      if (!GOOGLE_ISSUERS.includes(claims.iss)) throw new IdentityVerificationError("WRONG_ISSUER");
      const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (!audiences.includes(options.clientId))
        throw new IdentityVerificationError("WRONG_AUDIENCE");

      const nowSeconds = Math.floor(clock.now().getTime() / 1000);
      if (claims.exp + skew <= nowSeconds) throw new IdentityVerificationError("TOKEN_EXPIRED");
      if (claims.nbf !== undefined && claims.nbf - skew > nowSeconds) {
        throw new IdentityVerificationError("TOKEN_NOT_YET_VALID");
      }
      if (claims.iat !== undefined && claims.iat - skew > nowSeconds) {
        throw new IdentityVerificationError("TOKEN_NOT_YET_VALID");
      }

      if (claims.email_verified !== true && claims.email_verified !== "true") {
        throw new IdentityVerificationError("EMAIL_NOT_VERIFIED");
      }
      if (options.expectedNonce !== undefined && claims.nonce !== options.expectedNonce) {
        throw new IdentityVerificationError("NONCE_MISMATCH");
      }

      return {
        subject: claims.sub,
        email: normalizeEmail(claims.email),
        emailVerified: true,
        name: claims.name,
      };
    },
  };
}
