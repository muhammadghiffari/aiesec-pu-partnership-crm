"use client";

/**
 * /demo/outreach — outreach preparation workspace.
 *
 * Nothing here sends anything. The email editor holds synthetic formal
 * Indonesian drafts; readiness is recomputed live from DNC, identity and
 * per-channel verification. A human-review stamp is recorded against the
 * exact version — editing afterwards invalidates it.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { DraftBadge, industryLabel } from "../components/badges";
import { draftReadiness, indexById } from "../selectors";
import { useDemo } from "../store";
import type { ChannelKind } from "../types";
import { Icon } from "../ui/Icon";
import { ConfirmDialog } from "../ui/overlays";
import {
  Avatar,
  Badge,
  Button,
  Card,
  cn,
  DncBanner,
  EmptyState,
  Field,
  PageHeader,
  Segmented,
} from "../ui/primitives";
import { useToast } from "../ui/toast";

const CHANNEL_ICON: Record<ChannelKind, "mail" | "whatsapp" | "linkedin"> = {
  email: "mail",
  whatsapp: "whatsapp",
  linkedin: "linkedin",
};

function templateBody(recipientFirst: string, partnerName: string, owner: string): string {
  return `Kepada Yth. Bapak/Ibu ${recipientFirst},

Salam hangat dari AIESEC in President University.

Kami sangat menghargai waktu untuk memperkenalkan diri. AIESEC in President University adalah organisasi pengembangan kepemimpinan bagi pemuda, dan kami membuka peluang kolaborasi Business Development dengan ${partnerName}.

Mengikuti perkembangan ${partnerName} belakangan ini, kami yakin ada keselarasan kuat antara fokus program Bapak/Ibu dan kegiatan kami di kampus — mulai dari aktivasi merek hingga program pengembangan mahasiswa.

Apabila Bapak/Ibu berkenan, kami akan sangat senang untuk menjadwalkan diskusi singkat 30 menit minggu depan dan menyampaikan proposal gambaran kemitraan.

Hormat kami,
${owner}
Business Development — AIESEC in President University

[DEMO — draf sintetis. Pesan ini tidak pernah dikirim.]`;
}

export function OutreachScreenInner() {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const params = useSearchParams();
  const partnersById = indexById(state.partners);
  const contactsById = indexById(state.contacts);

  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(
    state.drafts[0]?.id ?? null,
  );
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "DRAFT" | "NEEDS_REVIEW" | "READY_FOR_REVIEW" | "BLOCKED"
  >("ALL");
  const [previewMode, setPreviewMode] = useState<"edit" | "preview">("edit");
  const [composeOpen, setComposeOpen] = useState(false);
  const [confirmStamp, setConfirmStamp] = useState(false);

  // deep links: /demo/outreach?partner=xx or ?contact=yy
  useEffect(() => {
    const pid = params.get("partner");
    const cid = params.get("contact");
    if (pid || cid) {
      const found = state.drafts.find((d) => (cid ? d.contactId === cid : d.partnerId === pid));
      if (found) setSelectedDraftId(found.id);
      else setComposeOpen(true);
    }
  }, [params, state.drafts]);

  const draft = selectedDraftId
    ? (state.drafts.find((d) => d.id === selectedDraftId) ?? null)
    : null;
  const contact = draft ? (contactsById.get(draft.contactId) ?? null) : null;
  const partner = draft ? (partnersById.get(draft.partnerId) ?? null) : null;
  const readiness = draft ? draftReadiness(draft, contact) : null;

  const draftsFiltered = state.drafts.filter((d) => {
    if (statusFilter === "ALL") return true;
    const c = contactsById.get(d.contactId) ?? null;
    return draftReadiness(d, c).status === statusFilter;
  });

  const counts = useMemo(() => {
    const acc = {
      ALL: state.drafts.length,
      DRAFT: 0,
      NEEDS_REVIEW: 0,
      READY_FOR_REVIEW: 0,
      BLOCKED: 0,
    };
    for (const d of state.drafts) {
      const c = contactsById.get(d.contactId) ?? null;
      acc[draftReadiness(d, c).status] += 1;
    }
    return acc;
  }, [state.drafts, contactsById]);

  return (
    <div className="page">
      <PageHeader
        title="Outreach"
        description="Draft and prepare partner outreach. Readiness is computed live from DNC marks and identity/channel verification — a human stamps the exact version before anything could leave in production. This prototype sends nothing."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setComposeOpen(true)}>
            New synthetic draft
          </Button>
        }
      />

      <div className="grid-2" style={{ gridTemplateColumns: "330px 1fr" }}>
        <Card flush title="Draft queue" sub="Approval applies to the exact version" side={null}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
            <Segmented
              ariaLabel="Filter drafts by status"
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as typeof statusFilter)}
              options={[
                { value: "ALL", label: `All ${counts.ALL}` },
                { value: "DRAFT", label: `Drafts ${counts.DRAFT}` },
                { value: "READY_FOR_REVIEW", label: `Ready ${counts.READY_FOR_REVIEW}` },
                { value: "NEEDS_REVIEW", label: `Review ${counts.NEEDS_REVIEW}` },
                { value: "BLOCKED", label: `Blocked ${counts.BLOCKED}` },
              ]}
            />
          </div>
          {draftsFiltered.length === 0 ? (
            <EmptyState
              icon="send"
              title="No drafts in this view"
              description="Create a synthetic draft to see the readiness workflow."
            />
          ) : (
            <div>
              {draftsFiltered.map((d) => {
                const p = partnersById.get(d.partnerId);
                const c = contactsById.get(d.contactId);
                const r = draftReadiness(d, c ?? null);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedDraftId(d.id)}
                    className="act-item"
                    style={{
                      width: "100%",
                      border: 0,
                      background: selectedDraftId === d.id ? "var(--teal-soft)" : "transparent",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                    aria-current={selectedDraftId === d.id ? "true" : undefined}
                  >
                    <span className="act-ico i-teal">
                      <Icon name={CHANNEL_ICON[d.channel]} size={14} />
                    </span>
                    <span className="act-txt" style={{ minWidth: 0 }}>
                      <span className="strong trunc" style={{ display: "block" }}>
                        {d.subject || <span className="muted">(no subject)</span>}
                      </span>
                      <span className="muted tiny">
                        {p?.name ?? "—"} {c ? `· ${c.name}` : ""}
                      </span>
                    </span>
                    <DraftBadge status={r.status} />
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {draft && partner ? (
          <div className="stack-lg">
            {/* recipient + readiness */}
            <Card
              title="Recipient & readiness"
              sub="Computed live from the demo dataset — edit contacts in the Contacts module"
              side={<DraftBadge status={readiness?.status ?? "DRAFT"} />}
            >
              <div
                className="hstack"
                style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}
              >
                <div className="hstack" style={{ gap: 10, alignItems: "flex-start" }}>
                  <Avatar name={contact?.name ?? "?"} />
                  <div>
                    <b style={{ fontSize: 14 }}>{contact?.name ?? "No recipient selected"}</b>
                    <div className="muted tiny">
                      {contact?.title ?? ""} ·{" "}
                      <Link href={`/demo/partners/${partner.id}`}>{partner.name}</Link>
                    </div>
                    <div className="muted tiny">{industryLabel(partner.industry)}</div>
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setComposeOpen(true)}>
                  Change recipient
                </Button>
              </div>

              {contact?.dnc?.active ? (
                <div style={{ marginTop: 12 }}>
                  <DncBanner>
                    <strong>Outreach to {contact.name} is blocked.</strong> {contact.dnc.reason} The
                    DNC rule overrides every verification state — no flow may surface this contact
                    as ready.
                  </DncBanner>
                </div>
              ) : null}

              <div className="checks" style={{ marginTop: 12 }}>
                {readiness?.checks.map((c) => (
                  <div key={c.key} className={cn("check-row", c.state)}>
                    <span className="check-ico">
                      <Icon
                        name={
                          c.state === "ok" ? "check-circle" : c.state === "warn" ? "alert" : "ban"
                        }
                        size={13}
                      />
                    </span>
                    <div className="check-txt">
                      <strong>{c.label}</strong>
                      <span>{c.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* composer */}
            <Card
              title="Message (synthetic)"
              sub="Draft content is demo template text in formal Bahasa Indonesia — clearly marked, never sent"
              side={
                <Segmented
                  ariaLabel="Switch between editor and preview"
                  value={previewMode}
                  onChange={(v) => setPreviewMode(v as typeof previewMode)}
                  options={[
                    { value: "edit", label: "Editor" },
                    { value: "preview", label: "Preview" },
                  ]}
                />
              }
            >
              {previewMode === "edit" ? (
                <div className="stack-md">
                  <div className="f-grid" style={{ gridTemplateColumns: "140px 1fr" }}>
                    <Field label="Channel" htmlFor="ob-channel">
                      <select
                        id="ob-channel"
                        className="input"
                        value={draft.channel}
                        onChange={(e) =>
                          dispatch({
                            type: "UPDATE_DRAFT",
                            draftId: draft.id,
                            patch: { channel: e.target.value as ChannelKind },
                          })
                        }
                      >
                        <option value="email">Email</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="linkedin">LinkedIn</option>
                      </select>
                    </Field>
                    <div />
                  </div>
                  <Field
                    label="Subject"
                    htmlFor="ob-subject"
                    hint={
                      draft.channel === "email"
                        ? "Required for email drafts."
                        : "Used as the message title. Approval binds to subject + body + recipient + channel."
                    }
                  >
                    <input
                      id="ob-subject"
                      className="input"
                      value={draft.subject}
                      onChange={(e) =>
                        dispatch({
                          type: "UPDATE_DRAFT",
                          draftId: draft.id,
                          patch: { subject: e.target.value },
                        })
                      }
                      placeholder="e.g. Proposal Kolaborasi — <Partner>"
                      maxLength={180}
                    />
                  </Field>
                  <Field label="Body" htmlFor="ob-body">
                    <textarea
                      id="ob-body"
                      className="input"
                      rows={15}
                      value={draft.body}
                      onChange={(e) =>
                        dispatch({
                          type: "UPDATE_DRAFT",
                          draftId: draft.id,
                          patch: { body: e.target.value },
                        })
                      }
                      style={{ fontFamily: "inherit", lineHeight: 1.65 }}
                    />
                  </Field>
                  <KeyValueRow
                    pairs={[
                      ["Sources used for claims", draft.sources.join("\n")],
                      ["Model/provider", "not connected — fixed synthetic template"],
                      [
                        "Approval",
                        draft.approvedAt
                          ? `Stamped by ${draft.approvedBy} (demo stamp ${draft.approvedHash})`
                          : "None yet",
                      ],
                    ]}
                  />
                </div>
              ) : (
                <div className="msg-preview">
                  <div className="msg-hd">
                    <dl className="kv">
                      <div style={{ display: "contents" }}>
                        <dt>To</dt>
                        <dd>
                          {contact
                            ? `${contact.name} <${contact.channels.find((c) => c.channel === draft.channel)?.value ?? "?"}>`
                            : "—"}
                        </dd>
                      </div>
                      <div style={{ display: "contents" }}>
                        <dt>Partner</dt>
                        <dd>{partner.name}</dd>
                      </div>
                      <div style={{ display: "contents" }}>
                        <dt>Subject</dt>
                        <dd>{draft.subject || <span className="muted">(no subject)</span>}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="msg-bd">{draft.body}</div>
                  <div className="msg-demo-stamp">
                    <Icon name="alert" size={12} />
                    Demo content — synthetic template. No AI provider is connected and no message
                    will ever be delivered from this prototype.
                  </div>
                </div>
              )}

              <div className="spread" style={{ marginTop: 14 }}>
                <span className="muted tiny">
                  Last edit{" "}
                  {new Date(draft.updatedAt).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="hstack" style={{ gap: 8 }}>
                  {readiness?.canMarkReviewed ? (
                    <Button
                      variant="primary"
                      icon="shield-check"
                      onClick={() => setConfirmStamp(true)}
                    >
                      Stamp human review (demo)
                    </Button>
                  ) : draft.approvedAt ? (
                    <Badge tone="green" icon="shield-check">
                      Reviewed — exact-version stamp active
                    </Badge>
                  ) : (
                    <Button
                      variant="secondary"
                      icon="shield-check"
                      disabled
                      title="Resolve the blockers above first"
                    >
                      Stamp human review (demo)
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    icon="send"
                    disabled
                    title="Sending is never available in this prototype. In production, a human sends via the approved sender profile after strict gates — no AI/tool has send credentials."
                  >
                    Send — disabled in prototype
                  </Button>
                </span>
              </div>
            </Card>
          </div>
        ) : (
          <Card>
            <EmptyState
              icon="send"
              title="Select a draft"
              description="Pick a draft from the queue, or create a new synthetic draft for a partner contact."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  icon="plus"
                  onClick={() => setComposeOpen(true)}
                >
                  New synthetic draft
                </Button>
              }
            />
          </Card>
        )}
      </div>

      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onCreated={(id) => setSelectedDraftId(id)}
      />

      <ConfirmDialog
        open={confirmStamp}
        onClose={() => setConfirmStamp(false)}
        onConfirm={() => {
          if (!draft) return;
          dispatch({ type: "STAMP_DRAFT", draftId: draft.id });
          setConfirmStamp(false);
          toast.ok(
            "Human review stamped (demo)",
            "The stamp binds to this exact version — any further edit invalidates it.",
          );
        }}
        title="Stamp the exact version as reviewed?"
        message="In production this binds an approval to a content hash of body + subject + recipient + channel; any change invalidates it. The demo records a synthetic stamp only — nothing is queued, sent, or approved for delivery."
        confirmLabel="Stamp review"
      />
    </div>
  );
}

/* ------------------------------- compose ------------------------------ */

function ComposeModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (draftId: string) => void;
}) {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const [partnerId, setPartnerId] = useState("");
  const [contactId, setContactId] = useState("");
  const [channel, setChannel] = useState<ChannelKind>("email");

  const partners = useMemo(
    () => [...state.partners].sort((a, b) => a.name.localeCompare(b.name)),
    [state.partners],
  );
  const contacts = state.contacts.filter((c) => c.partnerId === partnerId);
  const contact = contacts.find((c) => c.id === contactId);

  useEffect(() => {
    if (open && !partnerId) {
      const first = partners.find((p) => state.contacts.some((c) => c.partnerId === p.id));
      if (first) {
        setPartnerId(first.id);
        const c0 = state.contacts.find((c) => c.partnerId === first.id);
        if (c0) setContactId(c0.id);
      }
    }
  }, [open, partnerId, partners, state.contacts]);

  function create() {
    const c = contacts.find((x) => x.id === contactId);
    const p = partners.find((x) => x.id === partnerId);
    if (!c || !p) {
      toast.err(
        "Pick a partner and recipient",
        "A draft always targets one contact on one partner.",
      );
      return;
    }
    const subject = `Peluang Kolaborasi — ${p.name}`;
    dispatch({
      type: "CREATE_DRAFT",
      draft: {
        partnerId: p.id,
        contactId: c.id,
        channel,
        subject,
        body: templateBody(c.name.split(" ")[0] ?? c.name, p.name, "Nadia Prameswari"),
        sources: p.sourceUrl ? [p.sourceUrl] : [],
      },
    });
    const newId = `d-${String(state.seq + 1).padStart(3, "0")}`;
    onCreated(newId);
    onClose();
    toast.ok(
      "Draft created",
      "Synthetic template text pre-filled — readiness is computed live below.",
    );
  }

  return (
    <ConfirmlessModal
      open={open}
      onClose={onClose}
      title="New synthetic draft"
      onConfirm={create}
      confirmLabel="Create draft"
    >
      <Field label="Partner" htmlFor="cp-partner">
        <select
          id="cp-partner"
          className="input"
          value={partnerId}
          onChange={(e) => {
            setPartnerId(e.target.value);
            const c0 = state.contacts.find((c) => c.partnerId === e.target.value);
            setContactId(c0?.id ?? "");
          }}
        >
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Recipient"
        htmlFor="cp-contact"
        hint={
          contacts.length === 0
            ? "This partner has no contacts yet — add one from its profile."
            : undefined
        }
      >
        <select
          id="cp-contact"
          className="input"
          value={contactId}
          onChange={(e) => setContactId(e.target.value)}
        >
          {contacts.length === 0 ? <option value="">No contacts</option> : null}
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} — {c.title ?? "contact"}
              {c.dnc?.active ? " (DNC)" : ""}
            </option>
          ))}
        </select>
      </Field>
      {contact?.dnc?.active ? (
        <DncBanner>
          <strong>{contact.name} is Do-Not-Contact.</strong> The draft can be prepared for
          demonstration, but readiness will stay blocked.
        </DncBanner>
      ) : null}
      <Field label="Channel" htmlFor="cp-channel">
        <select
          id="cp-channel"
          className="input"
          value={channel}
          onChange={(e) => setChannel(e.target.value as ChannelKind)}
        >
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="linkedin">LinkedIn</option>
        </select>
      </Field>
    </ConfirmlessModal>
  );
}

import { Modal } from "../ui/overlays";

function ConfirmlessModal({
  open,
  onClose,
  onConfirm,
  title,
  confirmLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  confirmLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description="Create a draft bound to a partner contact and channel. The demo template writes formal Bahasa Indonesia with a synthetic-data disclaimer."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="check" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
      size="sm"
    >
      {children}
    </Modal>
  );
}

function KeyValueRow({ pairs }: { pairs: [string, string][] }) {
  return (
    <dl className="kv" style={{ gridTemplateColumns: "170px 1fr" }}>
      {pairs.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd style={{ whiteSpace: "pre-wrap" }}>{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function OutreachScreen() {
  return (
    <Suspense
      fallback={
        <div className="page">
          <div className="skt" style={{ height: 400 }} />
        </div>
      }
    >
      <OutreachScreenInner />
    </Suspense>
  );
}
