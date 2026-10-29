/**
 * Client-side bridge into the persisted M1-03 partner API (D-016 live demo mode).
 *
 * Only partners and contacts flow through this module. Every other demo slice
 * stays in the labelled in-memory sandbox. Calls reuse the same routes the real
 * app uses, so authorization, validation and the append-only audit trail are the
 * genuine M0-05/M1-03 paths — no client-side shortcut around the server.
 */
import { z } from "zod";
import type { IndustryCode, SourceTier, VerificationStatus } from "../../partners/types";
import { ESSM_INDUSTRIES, SOURCE_TIERS, VERIFICATION_STATUSES } from "../../partners/types";

const industry = z.enum(
  ESSM_INDUSTRIES.map((entry) => entry.code) as [IndustryCode, ...IndustryCode[]],
);
const tier = z.enum(SOURCE_TIERS) as z.ZodType<SourceTier>;
const verification = z.enum(VERIFICATION_STATUSES) as z.ZodType<VerificationStatus>;

export const contactRecordSchema = z.object({
  id: z.uuid(),
  partnerId: z.uuid(),
  name: z.string(),
  title: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  sourceTier: tier,
  lawfulBasisNote: z.string(),
  verification,
  verifiedAt: z.string().nullable(),
  doNotContact: z.boolean(),
  dncReason: z.string().nullable(),
});

export const partnerRecordSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  websiteDomain: z.string().nullable(),
  industry,
  officialEmail: z.string().nullable(),
  sourceDescription: z.string(),
  sourceUrl: z.string().nullable(),
  sourceTier: tier,
  createdAt: z.iso.datetime(),
  contacts: z.array(contactRecordSchema),
});

export type APIContact = z.infer<typeof contactRecordSchema>;
export type APIPartner = z.infer<typeof partnerRecordSchema>;

/* ------------------------------------------------------------------ */
/* Error envelope: mirrors the API's {error, issues?, duplicates?} shape */
/* ------------------------------------------------------------------ */

export interface IssueLike {
  path: string;
  message: string;
}

export interface DuplicateLike {
  partnerId: string;
  name: string;
  reason: string;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly issues: IssueLike[];
  readonly duplicates: DuplicateLike[];

  constructor(
    code: string,
    status: number,
    issues: IssueLike[] = [],
    duplicates: DuplicateLike[] = [],
  ) {
    super(code);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.issues = issues;
    this.duplicates = duplicates;
  }

  get isDuplicate(): boolean {
    return (
      this.code === "duplicate_confirmation_required" ||
      this.code === "duplicate_partner" ||
      this.code === "duplicate_contact"
    );
  }
}

const duplicatesSchema = z.array(
  z.object({
    partnerId: z.string(),
    name: z.string(),
    reason: z.string(),
  }),
);
const issuesSchema = z.array(z.object({ path: z.string(), message: z.string() }));

async function request<T>(
  url: string,
  init: RequestInit,
  unwrap: (data: unknown) => T,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ApiError("network_error", 0);
  }
  if (response.ok) {
    try {
      return unwrap(await response.json());
    } catch {
      throw new ApiError("invalid_response", response.status);
    }
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const code =
    payload &&
    typeof payload === "object" &&
    typeof (payload as { error?: unknown }).error === "string"
      ? (payload as { error: string }).error
      : "internal_error";
  if (code === "service_unavailable" && response.status === 503)
    throw new ApiError(code, response.status);
  const issues =
    payload && typeof payload === "object" && "issues" in payload
      ? (issuesSchema.safeParse((payload as { issues: unknown }).issues).data ?? [])
      : [];
  const duplicates =
    payload && typeof payload === "object" && "duplicates" in payload
      ? (duplicatesSchema.safeParse((payload as { duplicates: unknown }).duplicates).data ?? [])
      : [];
  throw new ApiError(code, response.status, issues, duplicates);
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/* ------------------------------------------------------------------ */
/* Endpoints                                                          */
/* ------------------------------------------------------------------ */

/** GET /api/demo/status — data-mode probe (see app/api/demo/status/route.ts). */
export interface DemoStatusPayload {
  mode: "sandbox" | "live";
  signedIn: boolean;
  user: { email: string; role: string } | null;
  devSignIn: boolean;
  devEmail: string | null;
  unreachable: boolean;
}

export async function fetchDemoStatus(): Promise<DemoStatusPayload> {
  return request<DemoStatusPayload>("/api/demo/status", { method: "GET" }, (data) => {
    const parsed = z
      .object({
        mode: z.enum(["sandbox", "live"]),
        signedIn: z.boolean().optional().default(false),
        user: z.object({ email: z.string(), role: z.string() }).nullable().optional().default(null),
        devSignIn: z.boolean().optional().default(false),
        devEmail: z.string().nullable().optional().default(null),
        unreachable: z.boolean().optional().default(false),
      })
      .safeParse(data);
    if (!parsed.success) return safeStatus();
    return {
      mode: parsed.data.mode,
      signedIn: parsed.data.signedIn,
      user: parsed.data.user,
      devSignIn: parsed.data.devSignIn,
      devEmail: parsed.data.devEmail,
      unreachable: parsed.data.unreachable,
    };
  }).catch(() => safeStatus());
}

function safeStatus(): DemoStatusPayload {
  return {
    mode: "sandbox",
    signedIn: false,
    user: null,
    devSignIn: false,
    devEmail: null,
    unreachable: false,
  };
}

/** GET /api/partners?q= — the live directory is one master list with contacts. */
export async function fetchLiveDirectory(): Promise<APIPartner[]> {
  return request<APIPartner[]>("/api/partners?q=", { method: "GET" }, (data) => {
    const parsed = z.object({ partners: z.array(partnerRecordSchema) }).safeParse(data);
    if (!parsed.success) throw new ApiError("invalid_response", 200);
    return parsed.data.partners;
  });
}

/** POST /api/partners — returns the saved PartnerRecord (with contacts). */
export function createLivePartner(input: unknown): Promise<APIPartner> {
  return request("/api/partners", jsonInit("POST", input), partnerRecordSchema.parse);
}

/** PATCH /api/partners/:id — one endpoint per demo mutation kind. */
export function patchLivePartner<T>(
  id: string,
  kind: string,
  input: Record<string, unknown>,
): Promise<T> {
  return request(`/api/partners/${id}`, jsonInit("PATCH", { kind, ...input }), (data) => data as T);
}

/** POST /api/auth/session — dev sign-in mints the same DB-backed session cookie. */
export async function sendDevSignIn(email: string): Promise<void> {
  await request(
    "/api/auth/session",
    jsonInit("POST", { idToken: `dev:${email}` }),
    () => undefined,
  );
}

/** DELETE /api/auth/session — ends the DB-backed session (cookie is invalidated). */
export async function sendDevSignOut(): Promise<void> {
  await request("/api/auth/session", { method: "DELETE" }, () => undefined);
}
