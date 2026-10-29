"use client";

/**
 * /demo/contacts — contact directory & verification workspace.
 *
 * Identity verification and per-channel verification are shown (and changed)
 * as separate facts, each requiring an explicit method and evidence URL.
 * A Do-Not-Contact contact is marked prominently and stays blocked in every
 * demo flow (outreach readiness computes DNC first).
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { industryLabel, VerificationBadge } from "../components/badges";
import { useDemoRuntime } from "../live/provider";
import { indexById } from "../selectors";
import { useDemo } from "../store";
import type { ChannelKind, VerificationStatus } from "../types";
import { CHANNEL_LABELS } from "../types";
import { Icon } from "../ui/Icon";
import { Drawer, Modal } from "../ui/overlays";
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  DncBanner,
  EmptyState,
  Field,
  KeyValue,
  PageHeader,
} from "../ui/primitives";

const VER_METHODS = [
  "Reply confirmation during intro exchange",
  "Cross-checked against official staff page",
  "Phone call confirmation with office desk",
  "Video call with referral chain confirmation",
  "Returned mail / obsoletion check",
  "Other documented method",
];

type IdentityFilter = "" | VerificationStatus;
type ChannelFilter = "" | ChannelKind;

export function ContactsScreenInner() {
  const { state } = useDemo();
  const params = useSearchParams();
  const [query, setQuery] = useState("");
  const [partnerFilter, setPartnerFilter] = useState("");
  const [identityF, setIdentityF] = useState<IdentityFilter>("");
  const [channelF, setChannelF] = useState<ChannelFilter>("");
  const [dncOnly, setDncOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(params.get("contact"));

  const partnersById = indexById(state.partners);
  const filteredPartners = useMemo(
    () => [...state.partners].sort((a, b) => a.name.localeCompare(b.name)),
    [state.partners],
  );
  const contacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.contacts
      .filter((c) => {
        const partner = partnersById.get(c.partnerId);
        if (q) {
          const hay =
            `${c.name} ${c.title ?? ""} ${partner?.name ?? ""} ${c.channels.map((x) => x.value).join(" ")}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (partnerFilter && c.partnerId !== partnerFilter) return false;
        if (identityF && c.identityVerification !== identityF) return false;
        if (channelF && !c.channels.some((ch) => ch.channel === channelF)) return false;
        if (dncOnly && !c.dnc?.active) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [state.contacts, partnersById, query, partnerFilter, identityF, channelF, dncOnly]);

  useEffect(() => {
    const fromUrl = params.get("contact");
    if (fromUrl && state.contacts.some((c) => c.id === fromUrl)) setSelected(fromUrl);
  }, [params, state.contacts]);

  return (
    <div className="page">
      <PageHeader
        title="Contacts"
        description="People behind the partners — identity and channel verification are managed separately here, and every change requires an explicit method and evidence."
      />

      <Card flush>
        <div
          style={{
            padding: "14px 18px",
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <div style={{ position: "relative", flex: "1 1 220px", minWidth: 190 }}>
            <input
              className="input"
              style={{ paddingLeft: 30 }}
              placeholder="Search name, title, channel address…"
              aria-label="Search contacts"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span
              style={{
                position: "absolute",
                left: 10,
                top: 10,
                color: "var(--ink-4)",
                pointerEvents: "none",
              }}
            >
              <Icon name="search" size={13} />
            </span>
          </div>

          <select
            className="input"
            style={{ maxWidth: 210 }}
            aria-label="Filter by partner"
            value={partnerFilter}
            onChange={(e) => setPartnerFilter(e.target.value)}
          >
            <option value="">All partners</option>
            {filteredPartners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            className="input"
            style={{ maxWidth: 180 }}
            aria-label="Filter by identity verification"
            value={identityF}
            onChange={(e) => setIdentityF(e.target.value as IdentityFilter)}
          >
            <option value="">Any identity status</option>
            <option value="unverified">Unverified</option>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="failed">Failed</option>
          </select>

          <select
            className="input"
            style={{ maxWidth: 160 }}
            aria-label="Filter by channel"
            value={channelF}
            onChange={(e) => setChannelF(e.target.value as ChannelFilter)}
          >
            <option value="">Any channel</option>
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="linkedin">LinkedIn</option>
          </select>

          <label className="checkrow" style={{ marginLeft: 2 }}>
            <input
              type="checkbox"
              className="checkbox"
              checked={dncOnly}
              onChange={(e) => setDncOnly(e.target.checked)}
            />
            DNC only
          </label>
        </div>

        {contacts.length === 0 ? (
          <EmptyState
            icon="users"
            title="No contacts match"
            description="Adjust search or the filters. Verification work you do here is remembered across the demo session."
          />
        ) : (
          <div className="tbl-scroll">
            <table className="tbl">
              <caption className="sr-only">
                {contacts.length} contact(s) in the demo directory
              </caption>
              <thead>
                <tr>
                  <th scope="col">Contact</th>
                  <th scope="col">Partner</th>
                  <th scope="col">Channels</th>
                  <th scope="col">Identity</th>
                  <th scope="col">Source</th>
                  <th scope="col">DNC</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => {
                  const partner = partnersById.get(c.partnerId);
                  return (
                    <tr
                      key={c.id}
                      className="row-click"
                      onClick={(e) => {
                        // Nested controls (the partner link) own their own click.
                        if (e.target instanceof Element && e.target.closest("a,button")) return;
                        setSelected(c.id);
                      }}
                    >
                      <td>
                        <button
                          type="button"
                          className="row-open"
                          onClick={() => setSelected(c.id)}
                        >
                          <span className="hstack" style={{ gap: 8 }}>
                            <span className="avatar avatar-sm" aria-hidden="true">
                              {c.name
                                .split(" ")
                                .map((w) => w[0])
                                .slice(0, 2)
                                .join("")}
                            </span>
                            <span>
                              <span className="t-strong">{c.name}</span>
                              <span className="t-sub">{c.title ?? "role not recorded"}</span>
                            </span>
                          </span>
                        </button>
                      </td>
                      <td>
                        <Link
                          href={`/demo/partners/${c.partnerId}`}
                          className="t-strong"
                          style={{ fontWeight: 540 }}
                        >
                          {partner?.name ?? "—"}
                        </Link>
                      </td>
                      <td>
                        <span className="hstack hstack-wrap" style={{ gap: 4 }}>
                          {c.channels.map((ch) => (
                            <span
                              key={ch.channel}
                              className="chip"
                              title={`${CHANNEL_LABELS[ch.channel]}: ${ch.verification}`}
                            >
                              <Icon
                                name={
                                  ch.channel === "email"
                                    ? "mail"
                                    : ch.channel === "whatsapp"
                                      ? "whatsapp"
                                      : "linkedin"
                                }
                                size={11}
                              />
                              {ch.value.split("@")[0] === ch.value
                                ? ch.value
                                : `${ch.value.split("@")[0]}@…`}
                              <span
                                className="badge-dot"
                                style={{
                                  background:
                                    ch.verification === "verified"
                                      ? "var(--green)"
                                      : ch.verification === "failed"
                                        ? "var(--red)"
                                        : ch.verification === "pending"
                                          ? "#d99a26"
                                          : "var(--line-strong)",
                                }}
                              />
                            </span>
                          ))}
                        </span>
                      </td>
                      <td>
                        <VerificationBadge status={c.identityVerification} />
                      </td>
                      <td>
                        <Badge tone="outline">{c.sourceTier}</Badge>
                      </td>
                      <td>
                        {c.dnc?.active ? (
                          <Badge tone="red" icon="ban">
                            DNC
                          </Badge>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ContactDrawer contactId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

/* ------------------------------ drawer ------------------------------- */

function ContactDrawer({ contactId, onClose }: { contactId: string | null; onClose: () => void }) {
  const { state } = useDemo();
  const [verifyModal, setVerifyModal] = useState<
    null | { kind: "identity" } | { kind: "channel"; channel: ChannelKind }
  >(null);
  const [dncModal, setDncModal] = useState(false);

  const contact = contactId ? (state.contacts.find((c) => c.id === contactId) ?? null) : null;
  if (!contact) {
    return (
      <Drawer open={false} onClose={onClose} title={<span />}>
        {null}
      </Drawer>
    );
  }
  const partner = state.partners.find((p) => p.id === contact.partnerId);
  const draftsUsing = state.drafts.filter((d) => d.contactId === contact.id);

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        title={
          <span className="hstack" style={{ gap: 10 }}>
            <Avatar name={contact.name} size="sm" />
            <span>{contact.name}</span>
          </span>
        }
        sub={
          <span className="hstack hstack-wrap" style={{ gap: 8, marginTop: 4 }}>
            <span>{contact.title ?? "role not recorded"}</span>
            {partner ? (
              <span>
                · <Link href={`/demo/partners/${partner.id}`}>{partner.name}</Link>
              </span>
            ) : null}
          </span>
        }
        actions={<VerificationBadge status={contact.identityVerification} kind="identity" />}
        footer={
          <>
            <ButtonLink
              href={`/demo/outreach?contact=${contact.id}`}
              variant="secondary"
              icon="send"
              onClick={onClose}
            >
              Prepare outreach to this contact
            </ButtonLink>
            <Button
              variant={contact.dnc?.active ? "secondary" : "danger"}
              icon="ban"
              onClick={() => setDncModal(true)}
            >
              {contact.dnc?.active ? "Manage DNC" : "Mark Do-Not-Contact"}
            </Button>
          </>
        }
      >
        {contact.dnc?.active ? (
          <DncBanner>
            <strong>Do-Not-Contact is active.</strong> {contact.dnc.reason}
            <div className="tiny" style={{ marginTop: 3 }}>
              Set by {contact.dnc.by} ·{" "}
              {new Date(contact.dnc.at).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}{" "}
              — outreach to this contact is blocked in every demo flow.
            </div>
          </DncBanner>
        ) : null}

        {draftsUsing.length === 0 ? null : (
          <div className="note-banner" role="note">
            <Icon name="info" size={14} />
            {draftsUsing.length} outreach draft{draftsUsing.length === 1 ? "" : "s"} reference this
            contact. Readiness is recomputed from the current verification facts every time.
          </div>
        )}

        <section aria-labelledby="cd-identity">
          <div className="spread" style={{ marginBottom: 8 }}>
            <h3 className="card-title" id="cd-identity">
              Identity verification
            </h3>
            <Button
              size="sm"
              icon="shield-check"
              onClick={() => setVerifyModal({ kind: "identity" })}
            >
              Update identity
            </Button>
          </div>
          <KeyValue
            columns="130px 1fr"
            entries={[
              ["Status", <VerificationBadge key="v" status={contact.identityVerification} />],
              ["Method", contact.identityMethod ?? "—"],
              [
                "Evidence",
                contact.identityEvidenceUrl ? (
                  <a key="e" href={contact.identityEvidenceUrl} target="_blank" rel="noreferrer">
                    open evidence (synthetic)
                  </a>
                ) : (
                  "—"
                ),
              ],
            ]}
          />
        </section>

        <section aria-labelledby="cd-channels">
          <h3 className="card-title" id="cd-channels" style={{ marginBottom: 8 }}>
            Channels — each verified separately
          </h3>
          <div className="stack-sm">
            {contact.channels.map((ch) => (
              <div key={ch.channel} className="card" style={{ padding: "10px 14px" }}>
                <div className="spread">
                  <span className="hstack" style={{ gap: 8 }}>
                    <Icon
                      name={
                        ch.channel === "email"
                          ? "mail"
                          : ch.channel === "whatsapp"
                            ? "whatsapp"
                            : "linkedin"
                      }
                      size={14}
                    />
                    <span style={{ fontSize: 13 }}>{ch.value}</span>
                  </span>
                  <span className="hstack">
                    <VerificationBadge status={ch.verification} kind="channel" />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setVerifyModal({ kind: "channel", channel: ch.channel })}
                    >
                      Update
                    </Button>
                  </span>
                </div>
                <div className="muted tiny" style={{ marginTop: 6 }}>
                  {ch.verifiedAt
                    ? `Verified ${new Date(ch.verifiedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} via ${ch.method}`
                    : ch.method
                      ? `Last method: ${ch.method}`
                      : "No verification recorded for this exact channel."}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="cd-prov">
          <h3 className="card-title" id="cd-prov" style={{ marginBottom: 8 }}>
            Provenance
          </h3>
          <KeyValue
            columns="130px 1fr"
            entries={[
              ["Source tier", contact.sourceTier],
              [
                "Source",
                contact.sourceUrl ? (
                  <a key="s" href={contact.sourceUrl} target="_blank" rel="noreferrer">
                    attribution link (synthetic)
                  </a>
                ) : (
                  "—"
                ),
              ],
              ["Lawful basis", contact.lawfulBasisNote],
              [
                "Added",
                new Date(contact.addedAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                }),
              ],
              ["Partner category", partner ? industryLabel(partner.industry) : "—"],
            ]}
          />
        </section>
      </Drawer>

      <VerificationModal
        contactId={contact.id}
        mode={verifyModal}
        onClose={() => setVerifyModal(null)}
      />
      <DncModal contactId={contact.id} open={dncModal} onClose={() => setDncModal(false)} />
    </>
  );
}

/* -------------------------- verification dialog ---------------------- */

function VerificationModal({
  contactId,
  mode,
  onClose,
}: {
  contactId: string;
  mode: null | { kind: "identity" } | { kind: "channel"; channel: ChannelKind };
  onClose: () => void;
}) {
  const { state } = useDemo();
  const runtime = useDemoRuntime();
  const [status, setStatus] = useState<VerificationStatus>("verified");
  const [method, setMethod] = useState("");
  const [evidence, setEvidence] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode) {
      setStatus("verified");
      setMethod("");
      setEvidence("");
      setErr(null);
    }
  }, [mode]);

  if (!mode) return null;
  const label =
    mode.kind === "identity"
      ? "Update identity verification"
      : `Update ${mode.channel} channel verification`;

  function save() {
    setErr(null);
    if (!mode || busy) return;
    if (status === "verified") {
      if (!method.trim()) {
        setErr("An explicit verification method is required to mark verified.");
        return;
      }
      if (!/^https:\/\/\S+$/.test(evidence.trim())) {
        setErr(
          "An evidence URL (https://…) is required for a verified status — no verification result is ever assumed.",
        );
        return;
      }
    }
    if (status === "failed" && !method.trim()) {
      setErr("Record how the verification failed (e.g. bounced address).");
      return;
    }
    const partnerId = state.contacts.find((c) => c.id === contactId)?.partnerId;
    if (!partnerId) {
      setErr("The contact is no longer in this session — reopen the Contacts screen.");
      return;
    }
    setBusy(true);
    void runtime
      .verifyContact({
        partnerId,
        contactId,
        scope: mode.kind === "identity" ? "identity" : mode.channel,
        status,
        method: method.trim(),
        evidenceUrl: evidence.trim() || null,
      })
      .then((ok) => {
        setBusy(false);
        if (ok) onClose();
        // a failure keeps the modal open; the wrapper explained why
      });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={label}
      description="Verification is a human attestation with method + evidence. ‘Verified’ data is treated as fact everywhere else; ‘pending/unverified/failed’ never is."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="shield-check" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save verification"}
          </Button>
        </>
      }
      size="sm"
    >
      {err ? (
        <div className="field-err" role="alert">
          <Icon name="alert" size={12} />
          <span>{err}</span>
        </div>
      ) : null}
      <Field label="Verification status" htmlFor="vm-status">
        <select
          id="vm-status"
          className="input"
          value={status}
          onChange={(e) => setStatus(e.target.value as VerificationStatus)}
        >
          <option value="unverified">Unverified</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="failed">Failed</option>
        </select>
      </Field>
      <Field
        label={status === "verified" ? "Verification method (required)" : "Method / note"}
        htmlFor="vm-method"
        hint={
          runtime.mode === "live"
            ? "Recorded in the demo activity journal only - the database stores the verification status, not this wording."
            : "Pick a documented method or write one explicitly."
        }
      >
        <input
          id="vm-method"
          className="input"
          list="crm-ver-methods"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          placeholder="e.g. Reply confirmation during intro exchange"
          maxLength={200}
        />
        <datalist id="crm-ver-methods">
          {VER_METHODS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </Field>
      <Field
        label={status === "verified" ? "Evidence URL (required)" : "Evidence URL"}
        htmlFor="vm-evidence"
        hint={
          runtime.mode === "live"
            ? "Stored on the contact record when verifying (M1-03 contract)."
            : "Synthetic link that supports the verification claim."
        }
      >
        <input
          id="vm-evidence"
          className="input"
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          placeholder="https://directory.example.invalid/…"
        />
      </Field>
    </Modal>
  );
}

/* ------------------------------- DNC dialog -------------------------- */

function DncModal({
  contactId,
  open,
  onClose,
}: {
  contactId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { state } = useDemo();
  const runtime = useDemoRuntime();
  const contact = state.contacts.find((c) => c.id === contactId);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setReason("");
      setErr(null);
    }
  }, [open]);

  if (!contact) return null;
  const active = contact.dnc?.active ?? false;

  function save(activate: boolean) {
    if (reason.trim().length < 3) {
      setErr("A reason is required (minimum 3 characters) — DNC decisions must be attributable.");
      return;
    }
    if (!contact || busy) return;
    setBusy(true);
    void runtime.setDnc(contact.partnerId, contactId, activate, reason.trim()).then((ok) => {
      setBusy(false);
      if (ok) onClose();
      // a failure keeps the modal open; the wrapper explained why
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={active ? "Clear Do-Not-Contact?" : "Mark as Do-Not-Contact?"}
      description={
        active
          ? "DNC is a safety guarantee. Clearing it re-enables readiness evaluation — record why the restriction no longer applies."
          : "DNC is absolute: every demo flow (outreach readiness, queues, batch views) will block this contact afterward, regardless of verification."
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {active ? (
            <Button variant="primary" onClick={() => save(false)} disabled={busy}>
              Clear DNC with reason
            </Button>
          ) : (
            <Button variant="danger" icon="ban" onClick={() => save(true)} disabled={busy}>
              Mark Do-Not-Contact
            </Button>
          )}
        </>
      }
      size="sm"
    >
      {err ? (
        <div className="field-err" role="alert">
          <Icon name="alert" size={12} />
          <span>{err}</span>
        </div>
      ) : null}
      <Field
        label={active ? "Reason for clearing (required)" : "Reason (required)"}
        htmlFor="dnc-reason"
        hint={
          runtime.mode === "live"
            ? "Reason is stored with the DNC record and the audit trail (min 3 characters)."
            : "e.g. Opted out via reply on 5 Oct 2026."
        }
      >
        <textarea
          id="dnc-reason"
          className="input"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
        />
      </Field>
    </Modal>
  );
}

export function ContactsScreen() {
  return (
    <Suspense
      fallback={
        <div className="page">
          <div className="skt" style={{ height: 400 }} />
        </div>
      }
    >
      <ContactsScreenInner />
    </Suspense>
  );
}
