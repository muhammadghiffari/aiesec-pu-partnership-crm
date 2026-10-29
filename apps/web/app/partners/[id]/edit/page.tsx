/** FR-200: authenticated, persisted partner edit screen. */

import { authorize, type PartnerRecord } from "@crm/core";
import { cookies } from "next/headers";
import { PartnerBackendUnavailableError, withPartnerBackend } from "@/features/partners/backend";
import { PartnerForm } from "@/features/partners/PartnerForm";

export default async function EditPartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data: PartnerRecord | null = null;
  let message = "Partner editing is temporarily unavailable.";
  try {
    const token = (await cookies()).get("crm_session")?.value;
    const result = await withPartnerBackend(async ({ sessions, partners }) => {
      const auth = await sessions.authenticate(token);
      if (!auth.ok || !authorize(auth.principal, "partner.write").ok)
        return { ok: false as const, httpStatus: 403 };
      return partners.getById(token, id);
    });
    if (result.ok) data = result.value;
    else
      message =
        result.httpStatus === 404 || result.httpStatus === 422
          ? "This partner record does not exist."
          : result.httpStatus === 403 || result.httpStatus === 401
            ? "Sign in with a permitted account to edit this partner."
            : message;
  } catch (error) {
    if (!(error instanceof PartnerBackendUnavailableError)) throw error;
  }
  return (
    <main>
      <h1>Edit partner</h1>
      <a href={`/partners/${id}`}>Back to partner</a>
      {data ? <PartnerForm initial={data} /> : <p role="alert">{message}</p>}
    </main>
  );
}
