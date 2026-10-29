/**
 * /partners/[id] — partner detail with contacts, provenance, verification and
 * do-not-contact controls (M1-03). Server-rendered; authorization is enforced
 * by the service before any data is read.
 */

import { authorize, ESSM_INDUSTRIES, type PartnerRecord } from "@crm/core";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PartnerBackendUnavailableError, withPartnerBackend } from "@/features/partners/backend";
import { ContactActions } from "@/features/partners/ContactActions";
import { ContactForm } from "@/features/partners/ContactForm";

export const metadata: Metadata = { title: "Partner — CRM" };

export default async function PartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let partner: PartnerRecord | null = null;
  let denied = false;
  let canWritePartner = false;
  let canWriteContact = false;
  let unavailable = false;
  try {
    const token = (await cookies()).get("crm_session")?.value;
    const result = await withPartnerBackend(({ partners }) => partners.getById(token, id));
    if (result.ok) {
      partner = result.value;
      canWritePartner = authorize(result.principal, "partner.write").ok;
      canWriteContact = authorize(result.principal, "contact.write").ok;
    } else if (result.httpStatus === 401 || result.httpStatus === 403) denied = true;
    else if (result.httpStatus !== 404 && result.httpStatus !== 422) unavailable = true;
  } catch (error) {
    if (error instanceof PartnerBackendUnavailableError) unavailable = true;
    else throw error;
  }

  if (unavailable) {
    return (
      <main>
        <h1>Partner</h1>
        <p role="alert">
          Partner records are temporarily unavailable. No changes can be saved. Please try again
          after the backend is connected.
        </p>
        <a href="/partners">Back to the partner list</a>
      </main>
    );
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
      {canWritePartner && (
        <p>
          <a href={`/partners/${partner.id}/edit`}>Edit partner</a>
        </p>
      )}
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
          — {partner.sourceDescription}
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
        {canWriteContact && <ContactForm partnerId={partner.id} />}
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
                <dd>{contact.email ?? "—"}</dd>
                <dt>Phone / WhatsApp</dt>
                <dd>{contact.phone ?? "—"}</dd>
                <dt>Verification</dt>
                <dd>{contact.verification}</dd>
                <dt>Do-not-contact reason</dt>
                <dd>{contact.dncReason ?? "—"}</dd>
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
              {canWriteContact && <ContactForm partnerId={partner.id} initial={contact} />}
              {canWriteContact && (
                <ContactActions
                  partnerId={partner.id}
                  contactId={contact.id}
                  contactName={contact.name}
                  currentVerification={contact.verification}
                  currentDnc={contact.doNotContact}
                />
              )}
            </article>
          ))
        )}
      </section>
    </main>
  );
}
