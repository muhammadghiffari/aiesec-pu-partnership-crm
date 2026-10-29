/**
 * /partners — draft searchable partner list; production is unavailable until
 * the audited service and authenticated session integration are installed.
 */

import type { Metadata } from "next";
import {
  getPartnerPrincipal,
  getPartnerService,
  PartnerBackendUnavailableError,
} from "@/features/partners/backend";
import { PartnerSearchList } from "@/features/partners/PartnerSearchList";
import {
  type IndustryCode,
  type Partner,
  PartnerAccessDeniedError,
} from "@/features/partners/types";

export const metadata: Metadata = { title: "Partners — CRM" };

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; industry?: string }>;
}) {
  const { q = "", industry = "" } = await searchParams;
  const industryCode = industry === "" ? null : (industry as IndustryCode);
  let partners: Partner[] = [];
  let denied = false;
  let errored = false;
  let unavailable = false;
  try {
    partners = await getPartnerService().search(getPartnerPrincipal(), q, industryCode);
  } catch (error) {
    if (error instanceof PartnerBackendUnavailableError) {
      unavailable = true;
    } else if (error instanceof PartnerAccessDeniedError) {
      denied = true;
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
      <PartnerSearchList partners={partners} query={q} industry={industryCode} />
    </main>
  );
}
