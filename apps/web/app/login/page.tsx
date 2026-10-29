/** FR-100: Google is the identity provider; no local/dev principal login. */

import { headers } from "next/headers";
import { GoogleSignIn } from "@/features/partners/GoogleSignIn";

export default async function LoginPage() {
  await headers(); // Configured OAuth client ID is read per request, not at build time.
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  return (
    <main>
      <h1>Sign in to Partnership CRM</h1>
      {clientId ? (
        <GoogleSignIn clientId={clientId} />
      ) : (
        <p role="alert">
          Sign-in is unavailable. Ask your administrator to configure Google authentication.
        </p>
      )}
    </main>
  );
}
