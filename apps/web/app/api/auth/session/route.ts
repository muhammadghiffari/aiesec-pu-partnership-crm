/** FR-100: session creation requires a Google-signed ID token and allowlisted user. */

import { createAuthHttp } from "@/features/partners/auth-http";
import { withPartnerBackend } from "@/features/partners/backend";

const handlers = createAuthHttp(withPartnerBackend);
export const POST = handlers.signIn;
export const DELETE = handlers.signOut;
