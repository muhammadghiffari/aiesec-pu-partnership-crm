/**
 * Server-side principal resolution for partner API routes.
 *
 * M0-05 will supply the real Google-authenticated session. Until then this is
 * deny-closed: production resolves to an inactive anonymous principal, so every
 * mutating or read handler rejects with 403. A documented development-only
 * header (`x-dev-principal-role`, ignored when NODE_ENV=production) lets
 * contributors exercise the UI locally without faking an auth system.
 */
import type { PartnerPrincipal } from "./types";

export function principalFromRequest(request: Request): PartnerPrincipal {
  return principalFromHeaderGetter((name) => request.headers.get(name));
}

/** Server-component variant (uses next/headers). */
export function principalFromHeaderGetter(get: (name: string) => string | null): PartnerPrincipal {
  if (process.env.NODE_ENV === "production") {
    return { email: null, role: "NONE", active: false };
  }
  const role = get("x-dev-principal-role");
  if (role === "CRM_LEAD" || role === "BD_STAFF") {
    return { email: "dev@example.invalid", role, active: true };
  }
  return { email: null, role: "NONE", active: false };
}
