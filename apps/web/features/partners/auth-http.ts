/** FR-100: Google ID token is verified by M0-05, then an opaque DB-backed cookie is issued. */
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  type createPersistedBackend,
  PartnerBackendUnavailableError,
  readSessionCookie,
} from "./backend";
import { isSameOrigin } from "./request-origin";

type Backend = ReturnType<typeof createPersistedBackend>;
type Runner = <T>(work: (backend: Backend) => Promise<T>) => Promise<T>;
const tokenInput = z.strictObject({ idToken: z.string().min(10).max(8192) });
export function createAuthHttp(run: Runner) {
  return {
    async signIn(request: Request) {
      if (!isSameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      let parsed: ReturnType<typeof tokenInput.safeParse>;
      try {
        parsed = tokenInput.safeParse(await request.json());
      } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
      }
      if (!parsed.success)
        return NextResponse.json({ error: "validation_failed" }, { status: 422 });
      try {
        const signed = await run(({ sessions }) => sessions.signIn(parsed.data.idToken));
        if (!signed.ok)
          return NextResponse.json(
            { error: signed.httpStatus === 401 ? "authentication_required" : "forbidden" },
            { status: signed.httpStatus },
          );
        const response = NextResponse.json(
          { status: "signed_in" },
          { headers: { "cache-control": "no-store" } },
        );
        response.cookies.set("crm_session", signed.sessionToken, {
          httpOnly: true,
          secure:
            new URL(request.url).protocol === "https:" || process.env.NODE_ENV === "production",
          sameSite: "strict",
          path: "/",
          maxAge: Math.max(1, Math.floor((signed.expiresAt.getTime() - Date.now()) / 1000)),
        });
        return response;
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof PartnerBackendUnavailableError
                ? "service_unavailable"
                : "internal_error",
          },
          { status: error instanceof PartnerBackendUnavailableError ? 503 : 500 },
        );
      }
    },
    async signOut(request: Request) {
      if (!isSameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      try {
        const token = readSessionCookie(request.headers);
        if (token) await run(({ sessions }) => sessions.signOut(token));
        const response = NextResponse.json(
          { status: "signed_out" },
          { headers: { "cache-control": "no-store" } },
        );
        response.cookies.set("crm_session", "", {
          httpOnly: true,
          secure:
            new URL(request.url).protocol === "https:" || process.env.NODE_ENV === "production",
          sameSite: "strict",
          path: "/",
          maxAge: 0,
        });
        return response;
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof PartnerBackendUnavailableError
                ? "service_unavailable"
                : "internal_error",
          },
          { status: error instanceof PartnerBackendUnavailableError ? 503 : 500 },
        );
      }
    },
  };
}
