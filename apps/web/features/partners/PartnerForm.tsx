"use client";

/**
 * Accessible partner create form (M1-03). Client-side checks are limited to
 * input hygiene; all business validation runs server-side in the API route.
 * Duplicate warnings from the service require an explicit human confirmation.
 */
import { useRef, useState } from "react";
import { ESSM_INDUSTRIES, SOURCE_TIERS } from "./types";

type Issue = { path: string; message: string };
type Duplicate = { partnerId: string; name: string; reason: string };

export function PartnerForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [duplicates, setDuplicates] = useState<Duplicate[] | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedId, setSavedId] = useState<string | null>(null);

  async function submit(confirmDuplicate = false) {
    const form = formRef.current;
    if (!form) return;
    const data = Object.fromEntries(new FormData(form).entries());
    setStatus("saving");
    setIssues([]);
    setDuplicates(null);
    const response = await fetch("/api/partners", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...data, confirmDuplicate }),
    });
    if (response.status === 201) {
      const body = (await response.json()) as { partner: { id: string } };
      setStatus("saved");
      setSavedId(body.partner.id);
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
      <h2 id="new-partner-heading">Add a new partner</h2>
      <div role="alert" aria-live="polite">
        {status === "saved" && (
          <p>
            Partner saved.{" "}
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
          <input id="pf-name" name="name" required maxLength={200} />
        </p>
        <p>
          <label htmlFor="pf-domain">Website domain (e.g. partner.co.id)</label>
          <input id="pf-domain" name="websiteDomain" type="text" inputMode="url" />
        </p>
        <p>
          <label htmlFor="pf-industry">ESSM industry category</label>
          <select id="pf-industry" name="industry" required defaultValue="">
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
          <input id="pf-email" name="officialEmail" type="email" />
        </p>
      </fieldset>

      <fieldset>
        <legend>Source and provenance (required)</legend>
        <p>
          <label htmlFor="pf-source-url">Source URL</label>
          <input id="pf-source-url" name="sourceUrl" type="url" />
        </p>
        <p>
          <label htmlFor="pf-source-tier">Source tier</label>
          <select id="pf-source-tier" name="sourceTier" required defaultValue="research">
            {SOURCE_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {tier}
              </option>
            ))}
          </select>
        </p>
        <p>
          <label htmlFor="pf-basis">Lawful-basis / provenance note</label>
          <textarea id="pf-basis" name="lawfulBasisNote" required rows={2} maxLength={500} />
        </p>
      </fieldset>

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
          <input id="pf-c-email" name="contact.email" type="email" required />
        </p>
        <p>
          <label htmlFor="pf-c-phone">Phone / WhatsApp (optional)</label>
          <input id="pf-c-phone" name="contact.phone" type="tel" />
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

      <button type="submit" disabled={status === "saving"}>
        {status === "saving" ? "Saving…" : "Save partner"}
      </button>
    </form>
  );
}
