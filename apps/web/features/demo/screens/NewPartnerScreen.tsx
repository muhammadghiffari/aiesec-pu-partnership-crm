"use client";

/**
 * /demo/partners/new — create-partner flow.
 *
 * Grouped organization / classification / provenance / PIC sections follow
 * the M1-03 partner form contract. A valid submission lands in the demo
 * session store (never a server). Duplicate detection forces an explicit
 * human decision, mirroring the service's 409 contract.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ESSM_INDUSTRIES, SOURCE_TIERS } from "../../partners/types";
import { findPartnerDuplicates } from "../selectors";
import { useDemo } from "../store";
import type { IndustryCode, SourceTier } from "../types";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/overlays";
import { Button, cn, Field, PageHeader } from "../ui/primitives";
import { useToast } from "../ui/toast";

interface FieldErrors {
  [key: string]: string;
}

const DOMAIN_RE = /^$|^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const EMAIL_RE = /^$|^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^$|^[+0-9][0-9 ()-]{4,24}$/;
const URL_RE = /^$|^https:\/\/[^\s/$.?#].[^\s]*$/;

export function NewPartnerScreen() {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const router = useRouter();

  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [industry, setIndustry] = useState<IndustryCode | "">("");
  const [officialEmail, setOfficialEmail] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceTier, setSourceTier] = useState<SourceTier>("research");
  const [basis, setBasis] = useState("");
  const [notes, setNotes] = useState("");

  const [addContact, setAddContact] = useState(false);
  const [cName, setCName] = useState("");
  const [cTitle, setCTitle] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cSource, setCSource] = useState<SourceTier>("research");
  const [cBasis, setCBasis] = useState("");

  const [errors, setErrors] = useState<FieldErrors>({});
  const [dupeOpen, setDupeOpen] = useState(false);
  const [dupes, setDupes] = useState<{ id: string; name: string }[]>([]);

  function validate(): FieldErrors {
    const e: FieldErrors = {};
    if (name.trim().length < 2) e.name = "Partner name must be at least 2 characters.";
    if (domain.trim() && !DOMAIN_RE.test(domain.trim()))
      e.domain = "Use a bare domain such as partner.co.id (no protocol).";
    if (!industry) e.industry = "Choose one of the ten ESSM industry categories.";
    if (officialEmail.trim() && !EMAIL_RE.test(officialEmail.trim()))
      e.officialEmail = "Enter a valid email address or leave empty.";
    if (sourceUrl.trim() && !URL_RE.test(sourceUrl.trim()))
      e.sourceUrl = "A source URL must start with https:// and be a valid address.";
    if (basis.trim().length < 3)
      e.basis = "A short lawful-basis / provenance note is required (min 3 characters).";
    if (addContact) {
      if (cName.trim().length < 2) e.cName = "Contact name must be at least 2 characters.";
      if (!EMAIL_RE.test(cEmail.trim()) || !cEmail.trim())
        e.cEmail = "A valid email is required for the PIC.";
      if (cPhone.trim() && !PHONE_RE.test(cPhone.trim()))
        e.cPhone = "Use a phone/WhatsApp format like +62 812-0000-0000.";
      if (cBasis.trim().length < 3)
        e.cBasis = "Explain where this contact data comes from (min 3 characters).";
    }
    return e;
  }

  function doSubmit(opts: { confirmedDuplicates?: boolean } = {}) {
    const e = validate();
    setErrors(e);
    // Clear earlier feedback first: a stale "Check the form" toast must never sit
    // next to (or outlive) the success confirmation of the same submit.
    toast.clear();
    if (Object.keys(e).length > 0) {
      toast.err("Check the form", "Some required fields need attention before saving.");
      return;
    }
    if (!opts.confirmedDuplicates) {
      const found = findPartnerDuplicates(state.partners, name.trim(), domain.trim() || null);
      if (found.length > 0) {
        setDupes(found.map((f) => ({ id: f.id, name: f.name })));
        setDupeOpen(true);
        return;
      }
    }
    dispatch({
      type: "ADD_PARTNER",
      partner: {
        name: name.trim(),
        websiteDomain: domain.trim() || null,
        industry: industry as IndustryCode,
        officialEmail: officialEmail.trim() || null,
        sourceTier,
        sourceUrl: sourceUrl.trim() || null,
        lawfulBasisNote: basis.trim(),
        notes: notes.trim() || "Created via the demo create-partner flow (synthetic record).",
        contact: addContact
          ? {
              name: cName.trim(),
              title: cTitle.trim() || null,
              email: cEmail.trim(),
              phone: cPhone.trim() || null,
              sourceTier: cSource,
              sourceUrl: sourceUrl.trim() || null,
              lawfulBasisNote: cBasis.trim(),
            }
          : null,
      },
    });
    const newId = `p-${String(state.seq + 1).padStart(3, "0")}`;
    toast.ok("Partner created", "The new synthetic record is live in this demo session only.");
    router.push(`/demo/partners/${newId}`);
  }

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <PageHeader
        title="Add a partner"
        description="Create a partner master record with ESSM classification and provenance. The record enters the directory at Prospecting; verify contacts before any outreach."
        meta={null}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          doSubmit();
        }}
        noValidate
        className="stack-lg"
      >
        <fieldset className="f-group">
          <legend className="f-legend">Organization</legend>
          <div className="f-grid">
            <Field label="Partner name" htmlFor="np-name" required error={errors.name}>
              <input
                id="np-name"
                className={cn("input", errors.name && "input-err")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Demo Acme Logistics"
                maxLength={200}
                autoComplete="off"
              />
            </Field>
            <Field
              label="Website domain"
              htmlFor="np-domain"
              error={errors.domain}
              hint="Bare domain only — the system links outreach and dedupe checks to it."
            >
              <input
                id="np-domain"
                className={cn("input", errors.domain && "input-err")}
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="partner.co.id"
                inputMode="url"
                autoComplete="off"
              />
            </Field>
          </div>
          <div className="f-grid">
            <Field
              label="ESSM industry category"
              htmlFor="np-industry"
              required
              error={errors.industry}
            >
              <select
                id="np-industry"
                className={cn("input", errors.industry && "input-err")}
                value={industry}
                onChange={(e) => setIndustry(e.target.value as IndustryCode | "")}
              >
                <option value="">Select a category…</option>
                {ESSM_INDUSTRIES.map((i) => (
                  <option key={i.code} value={i.code}>
                    {i.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Official company email"
              htmlFor="np-email"
              error={errors.officialEmail}
              hint="Optional public contact desk; never used for outreach without verification."
            >
              <input
                id="np-email"
                className={cn("input", errors.officialEmail && "input-err")}
                value={officialEmail}
                onChange={(e) => setOfficialEmail(e.target.value)}
                placeholder="info@partner.co.id"
                autoComplete="off"
              />
            </Field>
          </div>
          <Field
            label="Internal notes"
            htmlFor="np-notes"
            hint="Optional context for the team (synthetic demo record)."
          >
            <textarea
              id="np-notes"
              className="input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why this organization is worth pursuing…"
              maxLength={500}
            />
          </Field>
        </fieldset>

        <fieldset className="f-group">
          <legend className="f-legend">Source & provenance (required)</legend>
          <div className="f-grid">
            <Field
              label="Source URL"
              htmlFor="np-source"
              error={errors.sourceUrl}
              hint="Where the record came from. Visible on every attribution view."
            >
              <input
                id="np-source"
                className={cn("input", errors.sourceUrl && "input-err")}
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://directory.example.invalid/entry"
                autoComplete="off"
              />
            </Field>
            <Field
              label="Source tier"
              htmlFor="np-tier"
              hint="official: partner-owned; referral: mutually introduced; research: public record; unverified: uncorroborated."
            >
              <select
                id="np-tier"
                className="input"
                value={sourceTier}
                onChange={(e) => setSourceTier(e.target.value as SourceTier)}
              >
                {SOURCE_TIERS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field
            label="Lawful-basis / provenance note"
            htmlFor="np-basis"
            required
            error={errors.basis}
          >
            <textarea
              id="np-basis"
              className={cn("input", errors.basis && "input-err")}
              rows={2}
              value={basis}
              onChange={(e) => setBasis(e.target.value)}
              placeholder="e.g. Public business directory entry with an advertising invite."
              maxLength={500}
            />
          </Field>
        </fieldset>

        <fieldset className="f-group" style={!addContact ? { opacity: 0.92 } : undefined}>
          <legend className="f-legend">Primary contact (PIC)</legend>
          <label className="checkrow">
            <input
              type="checkbox"
              className="checkbox"
              checked={addContact}
              onChange={(e) => setAddContact(e.target.checked)}
            />
            Add a primary contact now (can be done later from the partner profile)
          </label>
          {addContact ? (
            <>
              <div className="f-grid" style={{ marginTop: 8 }}>
                <Field label="Contact name" htmlFor="np-c-name" required error={errors.cName}>
                  <input
                    id="np-c-name"
                    className={cn("input", errors.cName && "input-err")}
                    value={cName}
                    onChange={(e) => setCName(e.target.value)}
                    maxLength={200}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Title / role" htmlFor="np-c-title">
                  <input
                    id="np-c-title"
                    className="input"
                    value={cTitle}
                    onChange={(e) => setCTitle(e.target.value)}
                    maxLength={120}
                    autoComplete="off"
                  />
                </Field>
              </div>
              <div className="f-grid">
                <Field label="Contact email" htmlFor="np-c-email" required error={errors.cEmail}>
                  <input
                    id="np-c-email"
                    className={cn("input", errors.cEmail && "input-err")}
                    value={cEmail}
                    onChange={(e) => setCEmail(e.target.value)}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Phone / WhatsApp" htmlFor="np-c-phone" error={errors.cPhone}>
                  <input
                    id="np-c-phone"
                    className={cn("input", errors.cPhone && "input-err")}
                    value={cPhone}
                    onChange={(e) => setCPhone(e.target.value)}
                    placeholder="+62 812-0000-0000"
                    autoComplete="off"
                  />
                </Field>
              </div>
              <div className="f-grid">
                <Field label="Contact source tier" htmlFor="np-c-tier">
                  <select
                    id="np-c-tier"
                    className="input"
                    value={cSource}
                    onChange={(e) => setCSource(e.target.value as SourceTier)}
                  >
                    {SOURCE_TIERS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Contact lawful-basis note"
                  htmlFor="np-c-basis"
                  required
                  error={errors.cBasis}
                >
                  <input
                    id="np-c-basis"
                    className={cn("input", errors.cBasis && "input-err")}
                    value={cBasis}
                    onChange={(e) => setCBasis(e.target.value)}
                    maxLength={500}
                  />
                </Field>
              </div>
            </>
          ) : null}
        </fieldset>

        <div
          className="hstack"
          style={{ justifyContent: "flex-end", gap: 8, padding: "4px 0 20px" }}
        >
          <Button type="button" onClick={() => router.push("/demo/partners")}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" icon="check">
            Save partner
          </Button>
        </div>
      </form>

      <Modal
        open={dupeOpen}
        onClose={() => setDupeOpen(false)}
        title="Possible duplicate partner records"
        description="The directory already contains records that look similar. Duplicates corrupt pipeline reporting and outreach history — confirm only if none of these is the same organization."
        footer={
          <>
            <Button onClick={() => setDupeOpen(false)}>Go back</Button>
            <Button
              variant="primary"
              icon="check"
              onClick={() => {
                setDupeOpen(false);
                doSubmit({ confirmedDuplicates: true });
              }}
            >
              Not a duplicate — save anyway
            </Button>
          </>
        }
      >
        <div className="stack-sm">
          {dupes.map((d) => (
            <div key={d.id} className="check-row warn">
              <span className="check-ico">
                <Icon name="flag" size={13} />
              </span>
              <div className="check-txt">
                <strong>{d.name}</strong>
                <span>
                  Found via same domain or strong name overlap. This guard mirrors the service
                  contract (HTTP 409 → explicit human confirmation).
                </span>
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
