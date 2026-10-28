/**
 * /partners/[id] — partner detail with contacts, provenance, verification and
 * do-not-contact controls (M1-03). Server-rendered; authorization is enforced
 * by the service before any data is read.
 */

import type { Metadata } from "next";
import { headers } from "next/headers";
import { ContactActions } from "@/features/partners/ContactActions";
import { getPartnerService } from "@/features/partners/mock-service";
import { principalFromHeaderGetter } from "@/features/partners/principal";
import { ESSM_INDUSTRIES, PartnerAccessDeniedError } from "@/features/partners/types";

export const metadata: Metadata = { title: "Partner — CRM" };

export default async function PartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headerList = await headers();
  const principal = principalFromHeaderGetter((name) => headerList.get(name));
  let partner = null;
  let denied = false;
  try {
    partner = await getPartnerService().getById(principal, id);
  } catch (error) {
    if (error instanceof PartnerAccessDeniedError) denied = true;
  }

  if (denied) {
    return (
      <main>
        <h1>Partner</h1>
        <p role="alert">You do not have access to this partner record.</p>
      </main>
    );
  }
  if (!partner) {
    return (
      <main>
        <h1>Partner</h1>
        <p role="status">This partner does not exist or was removed.</p>
        <p>
          <a href="/partners">Back to the partner list</a>
        </p>
      </main>
    );
  }

  const industryLabel = ESSM_INDUSTRIES.find((i) => i.code === partner.industry)?.label;

  return (
    <main>
      <h1>{partner.name}</h1>
      <p>
        <a href="/partners">Back to the partner list</a>
      </p>
      <dl>
        <dt>ESSM industry category</dt>
        <dd>{industryLabel ?? partner.industry}</dd>
        <dt>Website domain</dt>
        <dd>{partner.websiteDomain ?? "—"}</dd>
        <dt>Official email</dt>
        <dd>{partner.officialEmail ?? "—"}</dd>
        <dt>Source</dt>
        <dd>
          {partner.sourceUrl ? (
            <a href={partner.sourceUrl} rel="noreferrer noopener">
              {partner.sourceTier}
            </a>
          ) : (
            partner.sourceTier
          )}{" "}
          — {partner.lawfulBasisNote}
        </dd>
        <dt>Created</dt>
        <dd>
          {new Date(partner.createdAt).toLocaleString("en-GB", {
            timeZone: "Asia/Jakarta",
          })}
        </dd>
      </dl>

      <section aria-labelledby="contacts-heading">
        <h2 id="contacts-heading">Contacts</h2>
        {partner.contacts.length === 0 ? (
          <p role="status">No contacts recorded yet.</p>
        ) : (
          partner.contacts.map((contact) => (
            <article key={contact.id}>
              <h3>
                {contact.name}
                {contact.doNotContact ? " (DO NOT CONTACT)" : ""}
              </h3>
              <dl>
                <dt>Title</dt>
                <dd>{contact.title ?? "—"}</dd>
                <dt>Email</dt>
                <dd>{contact.email}</dd>
                <dt>Phone / WhatsApp</dt>
                <dd>{contact.phone ?? "—"}</dd>
                <dt>Verification</dt>
                <dd>{contact.verification}</dd>
                <dt>Provenance</dt>
                <dd>
                  {contact.sourceTier}
                  {contact.sourceUrl ? (
                    <>
                      {" — "}
                      <a href={contact.sourceUrl} rel="noreferrer noopener">
                        source
                      </a>
                    </>
                  ) : null}{" "}
                  — {contact.lawfulBasisNote}
                </dd>
              </dl>
              <ContactActions
                partnerId={partner.id}
                contactId={contact.id}
                contactName={contact.name}
                currentVerification={contact.verification}
                currentDnc={contact.doNotContact}
              />
            </article>
          ))
        )}
      </section>
    </main>
  );
}
