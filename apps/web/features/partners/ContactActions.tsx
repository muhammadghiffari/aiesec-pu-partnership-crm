"use client";

/**
 * Contact verification and do-not-contact controls (M1-03).
 * Business rules run server-side (PATCH /api/partners/[id]); this component
 * surfaces the result accessibly, including denials and validation errors.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { VERIFICATION_STATUSES, type VerificationStatus } from "./types";

type Issue = { path: string; message: string };

export function ContactActions({
  partnerId,
  contactId,
  contactName,
  currentVerification,
  currentDnc,
}: {
  partnerId: string;
  contactId: string;
  contactName: string;
  currentVerification: VerificationStatus;
  currentDnc: boolean;
}) {
  const [verification, setVerification] = useState<VerificationStatus>(currentVerification);
  const [dnc, setDnc] = useState(currentDnc);
  const [message, setMessage] = useState<string | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function patch(body: Record<string, unknown>, onSuccess: () => void, successText: string) {
    setBusy(true);
    setIssues([]);
    setMessage(null);
    try {
      const response = await fetch(`/api/partners/${partnerId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        onSuccess();
        setMessage(successText);
        return;
      }
      if (response.status === 422) {
        const data = (await response.json()) as { issues?: Issue[] };
        setIssues(data.issues ?? []);
        return;
      }
      if (response.status === 401) {
        setMessage("Your session has expired. Sign in again and retry.");
        return;
      }
      if (response.status === 403) {
        setMessage("You do not have permission for this action.");
        return;
      }
      setMessage("The action failed. Try again.");
    } catch {
      setMessage("The action failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p role="status" aria-live="polite">
        {message}
        {issues.length > 0 && (
          <span> {issues.map((i) => `${i.path}: ${i.message}`).join("; ")}</span>
        )}
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void patch(
            {
              kind: "verify",
              contactId,
              verification: form.get("verification"),
              sourceUrl: form.get("sourceUrl") || undefined,
              lawfulBasisNote: form.get("lawfulBasisNote") || undefined,
            },
            () => {
              setVerification(form.get("verification") as VerificationStatus);
              router.refresh();
            },
            "Contact verification updated.",
          );
        }}
      >
        <fieldset>
          <legend>Verification for {contactName}</legend>
          <p>
            <label htmlFor={`verify-${contactId}`}>Verification status</label>
            <select id={`verify-${contactId}`} name="verification" defaultValue={verification}>
              {VERIFICATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </p>
          <p>
            <label htmlFor={`verify-src-${contactId}`}>Source URL (required to verify)</label>
            <input id={`verify-src-${contactId}`} name="sourceUrl" type="url" />
          </p>
          <p>
            <label htmlFor={`verify-basis-${contactId}`}>Lawful-basis note</label>
            <input id={`verify-basis-${contactId}`} name="lawfulBasisNote" maxLength={500} />
          </p>
          <button type="submit" disabled={busy}>
            Update verification
          </button>
        </fieldset>
      </form>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const next = form.get("doNotContact") === "true";
          void patch(
            { kind: "dnc", contactId, doNotContact: next, reason: String(form.get("reason")) },
            () => {
              setDnc(next);
              router.refresh();
            },
            next ? "Contact marked do-not-contact." : "Do-not-contact cleared.",
          );
        }}
      >
        <fieldset>
          <legend>Do-not-contact</legend>
          <p>
            <label htmlFor={`dnc-${contactId}`}>Do-not-contact state</label>
            <select id={`dnc-${contactId}`} name="doNotContact" defaultValue={String(dnc)}>
              <option value="false">Allowed to contact</option>
              <option value="true">Do not contact</option>
            </select>
          </p>
          <p>
            <label htmlFor={`dnc-reason-${contactId}`}>Reason (required)</label>
            <input
              id={`dnc-reason-${contactId}`}
              name="reason"
              required
              minLength={3}
              maxLength={500}
            />
          </p>
          <button type="submit" disabled={busy}>
            Update do-not-contact
          </button>
        </fieldset>
      </form>
    </div>
  );
}
