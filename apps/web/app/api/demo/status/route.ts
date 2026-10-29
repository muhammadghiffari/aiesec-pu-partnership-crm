/** Data-mode probe for the /demo workspace UI (FR-200/D-016). No protected action runs here. */
import { NextResponse } from "next/server";
import {
  demoSignInEnabled,
  firstAllowlistedEmail,
  PartnerBackendUnavailableError,
  readSessionCookie,
  withPartnerBackend,
} from "@/features/partners/backend";

export const dynamic = "force-dynamic";

type Status =
  | { mode: "sandbox" }
  | {
      mode: "live";
      signedIn: boolean;
      user: { email: string; role: string } | null;
      devSignIn: boolean;
      devEmail: string | null;
      unreachable?: boolean;
    };

function json(status: Status) {
  return NextResponse.json(status, { headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const devSignIn = demoSignInEnabled();
  try {
    return json(
      await withPartnerBackend(({ sessions }) =>
        sessions.authenticate(readSessionCookie(request.headers)).then((result) => {
          if (!result.ok) {
            return {
              mode: "live" as const,
              signedIn: false,
              user: null,
              devSignIn,
              devEmail: firstAllowlistedEmail(),
            };
          }
          return {
            mode: "live" as const,
            signedIn: true,
            user: { email: result.principal.email, role: result.principal.accessRole },
            devSignIn,
            devEmail: null,
          };
        }),
      ),
    );
  } catch (error) {
    if (error instanceof PartnerBackendUnavailableError) return json({ mode: "sandbox" });
    // Configured but unreachable: the UI shows live-intended + a clear connection
    // error instead of silently pretending the database view is fine.
    console.error("demo status probe failed", error);
    return json({
      mode: "live" as const,
      signedIn: false,
      user: null,
      devSignIn,
      devEmail: firstAllowlistedEmail(),
      unreachable: true,
    });
  }
}
