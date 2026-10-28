/**
 * /partners — searchable partner list. The service call runs server-side and
 * is deny-closed; an anonymous/unauthorized visitor sees the denied state.
 */

import type { Metadata } from "next";
import { headers } from "next/headers";
import { getPartnerService } from "@/features/partners/mock-service";
import { PartnerSearchList } from "@/features/partners/PartnerSearchList";
import { principalFromHeaderGetter } from "@/features/partners/principal";
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
  const headerList = await headers();
  const principal = principalFromHeaderGetter((name) => headerList.get(name));

  let partners: Partner[] = [];
  let denied = false;
  let errored = false;
  try {
    partners = await getPartnerService().search(principal, q, industryCode);
  } catch (error) {
    if (error instanceof PartnerAccessDeniedError) {
      denied = true;
    } else {
      errored = true;
    }
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
