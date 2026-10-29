"use client";

import type { ContactRecord } from "@crm/core";
/** FR-200: contact details are always saved through the audited server boundary. */
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { SOURCE_TIERS } from "./types";

export function ContactForm({
  partnerId,
  initial,
}: {
  partnerId: string;
  initial?: ContactRecord;
}) {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [issues, setIssues] = useState<{ path: string; message: string }[]>([]);
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)}>
        {initial ? `Edit ${initial.name}` : "Add contact"}
      </button>
      {open && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            const form = new FormData(event.currentTarget);
            const data: Record<string, unknown> = {
              kind: initial ? "contact_edit" : "contact",
              ...(initial ? { contactId: initial.id } : {}),
            };
            for (const key of [
              "name",
              "title",
              "email",
              "phone",
              "sourceUrl",
              "sourceTier",
              "lawfulBasisNote",
            ]) {
              const value = form.get(key);
              if (typeof value !== "string") continue;
              if (value.trim()) data[key] = value;
              else if (initial && ["title", "email", "phone", "sourceUrl"].includes(key))
                data[key] = null;
            }
            setBusy(true);
            setIssues([]);
            setMessage("");
            try {
              const response = await fetch(`/api/partners/${partnerId}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(data),
              });
              if (response.ok) {
                setOpen(false);
                setMessage("Contact saved.");
                router.refresh();
              } else if (response.status === 422) {
                const result = (await response.json()) as {
                  issues?: { path: string; message: string }[];
                };
                setIssues(result.issues ?? []);
                setMessage("Check the contact details and try again.");
              } else
                setMessage(
                  response.status === 403 || response.status === 401
                    ? "You do not have permission to save this contact."
                    : "Contact could not be saved. Your changes are still here; try again.",
                );
            } catch {
              setMessage("Contact could not be saved. Your changes are still here; try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy}>
            <legend>{initial ? "Edit contact" : "New contact"}</legend>
            <label htmlFor={`${uid}-name`}>Name</label>
            <input id={`${uid}-name`} name="name" required defaultValue={initial?.name} />
            <label htmlFor={`${uid}-title`}>Title</label>
            <input id={`${uid}-title`} name="title" defaultValue={initial?.title ?? ""} />
            <label htmlFor={`${uid}-email`}>Email</label>
            <input
              id={`${uid}-email`}
              name="email"
              type="email"
              defaultValue={initial?.email ?? ""}
            />
            <label htmlFor={`${uid}-phone`}>Phone / WhatsApp</label>
            <input
              id={`${uid}-phone`}
              name="phone"
              type="tel"
              defaultValue={initial?.phone ?? ""}
            />
            <label htmlFor={`${uid}-source`}>Source URL</label>
            <input
              id={`${uid}-source`}
              name="sourceUrl"
              type="url"
              defaultValue={initial?.sourceUrl ?? ""}
            />
            <label htmlFor={`${uid}-tier`}>Source tier</label>
            <select
              id={`${uid}-tier`}
              name="sourceTier"
              defaultValue={initial?.sourceTier ?? "research"}
            >
              {SOURCE_TIERS.map((tier) => (
                <option key={tier} value={tier}>
                  {tier}
                </option>
              ))}
            </select>
            <label htmlFor={`${uid}-basis`}>Contact lawful-basis note</label>
            <textarea
              id={`${uid}-basis`}
              name="lawfulBasisNote"
              required
              defaultValue={initial?.lawfulBasisNote}
            />
            <button type="submit">{busy ? "Saving…" : "Save contact"}</button>
            <button type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </fieldset>
        </form>
      )}
      {message && <p role="status">{message}</p>}
      {issues.length > 0 && (
        <ul role="alert">
          {issues.map((issue) => (
            <li key={issue.path}>
              {issue.path}: {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
