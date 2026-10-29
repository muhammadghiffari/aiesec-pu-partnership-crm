/** /partners/new — accessible partner creation (M1-03). */

import { authorize } from "@crm/core";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PartnerBackendUnavailableError, withPartnerBackend } from "@/features/partners/backend";
import { PartnerForm } from "@/features/partners/PartnerForm";

export const metadata: Metadata = { title: "Add partner — CRM" };

export default async function NewPartnerPage() {
  let available = false;
  let denied = false;
  try {
    const token = (await cookies()).get("crm_session")?.value;
    const result = await withPartnerBackend(({ sessions }) => sessions.authenticate(token));
    denied = !result.ok || !authorize(result.principal, "partner.write").ok;
    available = !denied;
  } catch (error) {
    if (!(error instanceof PartnerBackendUnavailableError)) throw error;
  }
  return (
    <main>
      <h1>Add a partner</h1>
      <p>
        <a href="/partners">Back to the partner list</a>
      </p>
      {available ? (
        <PartnerForm />
      ) : (
        <p role="alert">
          {denied
            ? "Sign in with a permitted account to create partners."
            : "Partner creation is temporarily unavailable. No changes can be saved until the authenticated backend is connected."}
        </p>
      )}
    </main>
  );
}
