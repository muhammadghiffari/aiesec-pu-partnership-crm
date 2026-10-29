"use client";

/** FR-100: sign-out revokes the DB-backed session and clears the HttpOnly cookie. */
import { useState } from "react";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/session", { method: "DELETE" });
      if (!response.ok) {
        setError("Sign-out failed. Try again.");
        return;
      }
      window.location.assign("/login");
    } catch {
      setError("Sign-out failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button type="button" onClick={() => void signOut()} disabled={busy}>
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
