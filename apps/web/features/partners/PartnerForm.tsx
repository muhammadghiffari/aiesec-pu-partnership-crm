"use client";

import type { PartnerRecord } from "@crm/core";
/**
 * Accessible partner create/edit form (M1-03). Client-side checks are limited to
 * input hygiene; all business validation runs server-side in the API route.
 * Duplicate warnings from the service require an explicit human confirmation.
 */
import { useRef, useState } from "react";
import { partnerFormPayload } from "./form-payload";
import { ESSM_INDUSTRIES, SOURCE_TIERS } from "./types";

type Issue = { path: string; message: string };
type Duplicate = { partnerId: string; name: string; reason: string };

export function PartnerForm({ initial }: { initial?: PartnerRecord }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [duplicates, setDuplicates] = useState<Duplicate[] | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedId, setSavedId] = useState<string | null>(null);

  async function submit(confirmDuplicate = false) {
    const form = formRef.current;
    if (!form) return;
    const data = partnerFormPayload(new FormData(form), confirmDuplicate, Boolean(initial));
    setStatus("saving");
    setIssues([]);
    setDuplicates(null);
    let response: Response;
    try {
      response = await fetch(initial ? `/api/partners/${initial.id}` : "/api/partners", {
        method: initial ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(initial ? { kind: "partner", ...data } : data),
      });
    } catch {
      setStatus("error");
      return;
    }
    if (response.status === (initial ? 200 : 201)) {
      const body = (await response.json()) as { partner?: { id: string }; data?: { id: string } };
      setStatus("saved");
      setSavedId(body.partner?.id ?? body.data?.id ?? null);
      return;
    }
    if (response.status === 409) {
      const body = (await response.json()) as { duplicates: Duplicate[] };
      setDuplicates(body.duplicates);
      setStatus("error");
      return;
    }
    if (response.status === 422) {
      const body = (await response.json()) as { issues: Issue[] };
      setIssues(body.issues);
      setStatus("error");
      return;
    }
    setStatus("error");
  }

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      noValidate
    >
      <h2 id="new-partner-heading">{initial ? "Edit partner" : "Add a new partner"}</h2>
      <div role="alert" aria-live="polite">
        {status === "saved" && (
          <p>
            Partner {initial ? "updated" : "saved"}.{" "}
            {savedId && <a href={`/partners/${savedId}`}>Open the partner detail page.</a>}
          </p>
        )}
        {status === "error" && issues.length > 0 && (
          <div>
            <p>Please fix the following before saving:</p>
            <ul>
              {issues.map((issue) => (
                <li key={`${issue.path}-${issue.message}`}>
                  {issue.path}: {issue.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        {status === "error" && duplicates && (
          <div>
            <p>
              Possible duplicates found. Confirm only if none of these is the same organization:
            </p>
            <ul>
              {duplicates.map((d) => (
                <li key={d.partnerId}>
                  <a href={`/partners/${d.partnerId}`}>{d.name}</a> ({d.reason.replace("_", " ")})
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => void submit(true)}>
              Save anyway — not a duplicate
            </button>
          </div>
        )}
        {status === "error" && !issues.length && !duplicates && <p>Saving failed. Try again.</p>}
      </div>

      <fieldset>
        <legend>Organization</legend>
        <p>
          <label htmlFor="pf-name">Partner name</label>
          <input id="pf-name" name="name" required maxLength={200} defaultValue={initial?.name} />
        </p>
        <p>
          <label htmlFor="pf-domain">Website domain (e.g. partner.co.id)</label>
          <input
            id="pf-domain"
            name="websiteDomain"
            type="text"
            inputMode="url"
            defaultValue={initial?.websiteDomain ?? ""}
          />
        </p>
        <p>
          <label htmlFor="pf-industry">ESSM industry category</label>
          <select id="pf-industry" name="industry" required defaultValue={initial?.industry ?? ""}>
            <option value="" disabled>
              Select a category
            </option>
            {ESSM_INDUSTRIES.map((i) => (
              <option key={i.code} value={i.code}>
                {i.label}
              </option>
            ))}
          </select>
        </p>
        <p>
          <label htmlFor="pf-email">Official company email (optional)</label>
          <input
            id="pf-email"
            name="officialEmail"
            type="email"
            defaultValue={initial?.officialEmail ?? ""}
          />
        </p>
      </fieldset>

      <fieldset>
        <legend>Source and provenance (required)</legend>
        <p>
          <label htmlFor="pf-source-url">Source URL</label>
          <input
            id="pf-source-url"
            name="sourceUrl"
            type="url"
            defaultValue={initial?.sourceUrl ?? ""}
          />
        </p>
        <p>
          <label htmlFor="pf-source-tier">Source tier</label>
          <select
            id="pf-source-tier"
            name="sourceTier"
            required
            defaultValue={initial?.sourceTier ?? "research"}
          >
            {SOURCE_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {tier}
              </option>
            ))}
          </select>
        </p>
        <p>
          <label htmlFor="pf-basis">Source description</label>
          <textarea
            id="pf-basis"
            name="sourceDescription"
            required
            rows={2}
            maxLength={500}
            defaultValue={initial?.sourceDescription}
          />
        </p>
      </fieldset>

      {!initial && (
        <fieldset>
          <legend>Primary contact (PIC)</legend>
          <p>
            <label htmlFor="pf-c-name">Contact name</label>
            <input id="pf-c-name" name="contact.name" required maxLength={200} />
          </p>
          <p>
            <label htmlFor="pf-c-title">Title (optional)</label>
            <input id="pf-c-title" name="contact.title" maxLength={120} />
          </p>
          <p>
            <label htmlFor="pf-c-email">Contact email</label>
            <input
              id="pf-c-email"
              name="contact.email"
              type="email"
              aria-describedby="pf-c-channel-note"
            />
          </p>
          <p>
            <label htmlFor="pf-c-phone">Phone / WhatsApp (optional)</label>
            <input
              id="pf-c-phone"
              name="contact.phone"
              type="tel"
              aria-describedby="pf-c-channel-note"
            />
          </p>
          <p>
            <small id="pf-c-channel-note">
              Provide at least one contact channel: email or phone/WhatsApp.
            </small>
          </p>
          <p>
            <label htmlFor="pf-c-source">Contact source URL (optional)</label>
            <input id="pf-c-source" name="contact.sourceUrl" type="url" />
          </p>
          <p>
            <label htmlFor="pf-c-tier">Contact source tier</label>
            <select id="pf-c-tier" name="contact.sourceTier" required defaultValue="research">
              {SOURCE_TIERS.map((tier) => (
                <option key={tier} value={tier}>
                  {tier}
                </option>
              ))}
            </select>
          </p>
          <p>
            <label htmlFor="pf-c-basis">Contact lawful-basis note</label>
            <textarea
              id="pf-c-basis"
              name="contact.lawfulBasisNote"
              required
              rows={2}
              maxLength={500}
            />
          </p>
        </fieldset>
      )}

      <button type="submit" disabled={status === "saving"}>
        {status === "saving" ? "Saving…" : initial ? "Save changes" : "Save partner"}
      </button>
      {initial && <a href={`/partners/${initial.id}`}>Cancel editing</a>}
    </form>
  );
}
