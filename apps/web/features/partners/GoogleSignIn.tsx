"use client";

/** GIS issues a Google ID token; the server verifies signature, audience and allowlist. */
import Script from "next/script";
import { useRef, useState } from "react";

type GoogleId = {
  initialize(options: {
    client_id: string;
    callback: (result: { credential: string }) => void;
  }): void;
  renderButton(element: HTMLElement, options: { theme: "outline"; size: "large" }): void;
};
declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } };
  }
}

export function GoogleSignIn({ clientId }: { clientId: string }) {
  const mount = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const initialize = () => {
    const google = window.google?.accounts?.id;
    if (!google || !mount.current) {
      setError("Google sign-in could not be loaded. Try reloading this page.");
      return;
    }
    mount.current.replaceChildren();
    google.initialize({
      client_id: clientId,
      callback: async ({ credential }) => {
        setBusy(true);
        setError("");
        try {
          const result = await fetch("/api/auth/session", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ idToken: credential }),
          });
          if (!result.ok) {
            setError("Sign-in was not permitted. Use an authorized account or contact a CRM Lead.");
            return;
          }
          window.location.assign("/partners");
        } catch {
          setError("Sign-in failed. Check your connection and try again.");
        } finally {
          setBusy(false);
        }
      },
    });
    google.renderButton(mount.current, { theme: "outline", size: "large" });
  };
  return (
    <section aria-label="Google sign-in">
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={initialize}
      />
      <div ref={mount} />
      {busy && <p role="status">Signing in…</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
