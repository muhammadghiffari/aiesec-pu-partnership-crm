/**
 * /partners — authenticated searchable Partner master. The persisted service
 * enforces authorization before records are read.
 */

import { authorize, ESSM_INDUSTRIES, type PartnerRecord } from "@crm/core";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PartnerBackendUnavailableError, withPartnerBackend } from "@/features/partners/backend";
import { PartnerSearchList } from "@/features/partners/PartnerSearchList";
import { SignOutButton } from "@/features/partners/SignOutButton";

export const metadata: Metadata = { title: "Partners — CRM" };

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; industry?: string }>;
}) {
  const { q = "", industry = "" } = await searchParams;
  const industryCode = ESSM_INDUSTRIES.find((item) => item.code === industry)?.code ?? null;
  let partners: PartnerRecord[] = [];
  let canWrite = false;
  let denied = false;
  let errored = false;
  let unavailable = false;
  try {
    const token = (await cookies()).get("crm_session")?.value;
    const result = await withPartnerBackend(({ partners: service }) =>
      service.search(token, { q, industry: industryCode }),
    );
    if (result.ok) {
      partners = result.value;
      canWrite = authorize(result.principal, "partner.write").ok;
    } else if (result.httpStatus === 401 || result.httpStatus === 403) denied = true;
    else errored = true;
  } catch (error) {
    if (error instanceof PartnerBackendUnavailableError) {
      unavailable = true;
    } else {
      errored = true;
    }
  }

  if (unavailable) {
    return (
      <main>
        <h1>Partners</h1>
        <p role="alert">
          Partner records are temporarily unavailable. No changes can be saved. Please try again
          after the backend is connected.
        </p>
      </main>
    );
  }

  if (denied) {
    return (
      <main>
        <h1>Partners</h1>
        <p role="alert">
          You do not have access to the partner master. Sign in with an authorized account or ask a
          CRM Lead for access.
        </p>
      </main>
    );
  }
  if (errored) {
    return (
      <main>
        <h1>Partners</h1>
        <p role="alert">The partner list could not be loaded. Try again.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Partner master</h1>
      <SignOutButton />
      <PartnerSearchList
        partners={partners}
        query={q}
        industry={industryCode}
        canWrite={canWrite}
      />
    </main>
  );
}
