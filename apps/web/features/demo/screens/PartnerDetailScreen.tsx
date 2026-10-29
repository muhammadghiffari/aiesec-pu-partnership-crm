"use client";

/**
 * /demo/partners/[id] — partner profile with Overview / Contacts /
 * Partnership Cycle / Activity tabs.
 *
 * Edit uses the M1-03 update contract fields; contact add goes through the
 * same provenance discipline as creation. Stage advancement into
 * Partnership Implementation is gated on a signed LoA record (domain rule).
 */
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ESSM_INDUSTRIES, SOURCE_TIERS } from "../../partners/types";
import {
  IndustryChip,
  industryLabel,
  RelationshipBadge,
  StageBadge,
  VerificationBadge,
} from "../components/badges";
import { friendlyDate, idr, relativeDay } from "../format";
import { partnerRollup } from "../selectors";
import { useDemo } from "../store";
import type { IndustryCode, LifecycleStage, SourceTier } from "../types";
import { LIFECYCLE_STAGES, PROJECT_SUPPORT_LABELS } from "../types";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/overlays";
import {
  Avatar,
  Badge,
  Button,
  Card,
  cn,
  DncBanner,
  EmptyState,
  Field,
  KeyValue,
  PageHeader,
  Tabs,
} from "../ui/primitives";
import { useToast } from "../ui/toast";

const STAGE_ORDER: LifecycleStage[] = [
  "PROSPECTING",
  "SALES_PROCESS",
  "CLOSE_DEAL",
  "PARTNERSHIP_IMPLEMENTATION",
  "POST_SURVEY",
];

export function PartnerDetailScreen({ id }: { id: string }) {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);

  const partner = state.partners.find((p) => p.id === id);
  const rollup = useMemo(() => (partner ? partnerRollup(state, partner) : null), [state, partner]);
  const activities = useMemo(
    () =>
      state.activities
        .filter((a) => a.partnerId === id)
        .slice()
        .sort((a, b) => b.at.localeCompare(a.at)),
    [state.activities, id],
  );
  const loaSigned = state.agreements.some((a) => a.partnerId === id && a.status === "SIGNED");

  if (!partner || !rollup) {
    return (
      <div className="page" style={{ maxWidth: 640 }}>
        <EmptyState
          icon="search"
          title="Partner not found"
          description="This record does not exist in the demo session (it may have been reseeded)."
          action={
            <Button variant="primary" onClick={() => router.push("/demo/partners")}>
              Back to partners
            </Button>
          }
        />
      </div>
    );
  }

  const r = rollup;
  const primaryContact = r.contacts[0];
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "contacts", label: "Contacts", badge: r.contacts.length },
    { id: "cycle", label: "Partnership Cycle" },
    { id: "activity", label: "Activity", badge: activities.length },
  ];

  return (
    <div className="page">
      <PageHeader
        title={partner.name}
        meta={
          <>
            <IndustryChip industry={partner.industry} />
            <RelationshipBadge status={r.relationship} />
            {r.cycle ? (
              <StageBadge stage={r.cycle.stage} />
            ) : (
              <Badge tone="outline">No cycle</Badge>
            )}
            {partner.websiteDomain ? (
              <span className="muted tiny hstack" style={{ gap: 4 }}>
                <Icon name="globe" size={12} /> {partner.websiteDomain}
              </span>
            ) : null}
          </>
        }
        description={partner.notes ?? "No internal note recorded for this partner."}
        actions={
          <>
            <Button variant="secondary" icon="pencil" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            <Button variant="secondary" icon="plus" onClick={() => setContactOpen(true)}>
              Add contact
            </Button>
            <Button
              variant="primary"
              icon="send"
              onClick={() => router.push(`/demo/outreach?partner=${partner.id}`)}
            >
              Prepare outreach
            </Button>
          </>
        }
      />

      <Card flush>
        <div style={{ padding: "0 18px" }}>
          <Tabs
            tabs={tabs}
            value={tab}
            onChange={setTab}
            ariaLabel={`Sections of ${partner.name}`}
          />
        </div>
        <div style={{ padding: "18px" }}>
          {tab === "overview" ? (
            <div className="grid-2" style={{ gridTemplateColumns: "1.2fr 1fr" }}>
              <div className="stack-md">
                <section aria-labelledby="pd-facts">
                  <h3 className="card-title" id="pd-facts" style={{ marginBottom: 10 }}>
                    Organization facts
                  </h3>
                  <KeyValue
                    entries={[
                      ["ESSM category", industryLabel(partner.industry)],
                      ["Website domain", partner.websiteDomain ?? "—"],
                      ["Official email", partner.officialEmail ?? "—"],
                      [
                        "Source tier",
                        <SourceTierLabel
                          key="st"
                          tier={partner.sourceTier}
                          url={partner.sourceUrl}
                        />,
                      ],
                      ["Lawful basis", partner.lawfulBasisNote],
                      [
                        "Owner (AIESEC PIC)",
                        partner.ownerName ?? <span className="muted">Unassigned</span>,
                      ],
                      ["Created", friendlyDate(partner.createdAt)],
                      ["Last activity", friendlyDate(partner.lastActivityAt)],
                    ]}
                  />
                </section>
                {r.cycle?.alignment ? (
                  <section aria-labelledby="pd-align">
                    <h3 className="card-title" id="pd-align" style={{ marginBottom: 10 }}>
                      Partnership Alignment (human-entered, ESSM)
                    </h3>
                    <div className="align-meters">
                      <ScoreRow label="Values" value={r.cycle.alignment.values} />
                      <ScoreRow label="Vision" value={r.cycle.alignment.vision} />
                      <ScoreRow label="Current focus" value={r.cycle.alignment.currentFocus} />
                      <ScoreRow label="Program" value={r.cycle.alignment.program} />
                    </div>
                    <p className="muted tiny" style={{ marginTop: 8 }}>
                      Proceed decision:{" "}
                      <b className="strong">{r.cycle.alignment.proceed ?? "not yet recorded"}</b> —
                      AI can never set these scores or the Proceed decision.
                    </p>
                  </section>
                ) : null}
              </div>

              <div className="stack-md">
                <section aria-labelledby="pd-next" className="card" style={{ padding: 14 }}>
                  <h3 className="card-title" id="pd-next" style={{ marginBottom: 10 }}>
                    Next steps
                  </h3>
                  {r.cycle?.nextAction ? (
                    <div className="stack-sm">
                      <div className="hstack">
                        <Icon name="flag" size={14} />
                        <span>{r.cycle.nextAction.label}</span>
                      </div>
                      <div className="muted tiny">
                        due {friendlyDate(r.cycle.nextAction.dueDate)}
                      </div>
                    </div>
                  ) : (
                    <p className="muted tiny">No follow-up scheduled on the current cycle.</p>
                  )}
                  {primaryContact?.dnc?.active ? (
                    <div style={{ marginTop: 10 }}>
                      <DncBanner>
                        <strong>{primaryContact.name} is Do-Not-Contact.</strong> All outreach to
                        this person is blocked in every demo flow ({primaryContact.dnc.reason}).
                      </DncBanner>
                    </div>
                  ) : null}
                  <div className="divider" style={{ margin: "12px 0" }} />
                  <div className="stack-xs">
                    <div className="spread">
                      <span className="muted tiny">Verification coverage</span>
                      <span className="tiny strong">
                        {r.contacts.filter((c) => c.identityVerification === "verified").length}/
                        {r.contacts.length} identities verified
                      </span>
                    </div>
                    <div className="spread">
                      <span className="muted tiny">Agreed value (not revenue)</span>
                      <span className="tiny strong">{idr(r.cycle?.agreedValueIdr ?? null)}</span>
                    </div>
                  </div>
                </section>

                <section aria-labelledby="pd-actsample">
                  <h3 className="card-title" id="pd-actsample" style={{ marginBottom: 10 }}>
                    Latest touchpoints
                  </h3>
                  {activities.length === 0 ? (
                    <p className="muted tiny">No recorded activity yet.</p>
                  ) : (
                    <div className="stack-sm">
                      {activities.slice(0, 4).map((a) => (
                        <div key={a.id} style={{ fontSize: 12.5 }}>
                          <div className="trunc" title={a.summary}>
                            {a.summary}
                          </div>
                          <div className="muted tiny">{relativeDay(a.at)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          ) : null}

          {tab === "contacts" ? (
            r.contacts.length === 0 ? (
              <EmptyState
                icon="user"
                title="No contacts yet"
                description="Add a contact with provenance to prepare identity and channel verification."
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    icon="plus"
                    onClick={() => setContactOpen(true)}
                  >
                    Add contact
                  </Button>
                }
              />
            ) : (
              <div className="stack-md">
                {r.contacts.map((c) => (
                  <article key={c.id} className="card" style={{ padding: 14 }}>
                    <div
                      className="hstack"
                      style={{ justifyContent: "space-between", alignItems: "flex-start" }}
                    >
                      <div className="hstack" style={{ alignItems: "flex-start", gap: 10 }}>
                        <Avatar name={c.name} size="sm" />
                        <div>
                          <b style={{ fontSize: 13.5 }}>{c.name}</b>
                          <div className="muted tiny">{c.title ?? "role not recorded"}</div>
                        </div>
                      </div>
                      <div className="hstack hstack-wrap" style={{ gap: 6 }}>
                        <VerificationBadge status={c.identityVerification} kind="identity" />
                        {c.dnc?.active ? (
                          <Badge tone="red" icon="ban">
                            Do-Not-Contact
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <div className="f-grid" style={{ marginTop: 10 }}>
                      {c.channels.map((ch) => (
                        <div
                          key={ch.channel}
                          className="card"
                          style={{ padding: "8px 12px", background: "var(--surface-2)" }}
                        >
                          <div className="hstack" style={{ justifyContent: "space-between" }}>
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
                              <span style={{ fontSize: 12.5 }}>{ch.value}</span>
                            </span>
                            <VerificationBadge status={ch.verification} kind="channel" />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="muted tiny" style={{ marginTop: 10 }}>
                      Source: {c.sourceTier}
                      {c.sourceUrl ? (
                        <>
                          {" "}
                          ·{" "}
                          <a href={c.sourceUrl} target="_blank" rel="noreferrer">
                            attribution link
                          </a>
                        </>
                      ) : null}{" "}
                      — {c.lawfulBasisNote}
                    </div>
                  </article>
                ))}
                <div className="note-banner" role="note">
                  <Icon name="info" size={14} />
                  Channel management (verify / DNC) lives in the <b>Contacts</b> module — one
                  consistent place for every partner’s contacts.
                </div>
              </div>
            )
          ) : null}

          {tab === "cycle" ? (
            r.cycle && r.cycles.length > 0 ? (
              <div className="stack-lg">
                {r.cycles.map((cy) => {
                  const idx = STAGE_ORDER.indexOf(cy.stage);
                  const nextStage = STAGE_ORDER[idx + 1] as LifecycleStage | undefined;
                  const canAdvance =
                    nextStage && !(nextStage === "PARTNERSHIP_IMPLEMENTATION" && !loaSigned);
                  return (
                    <article key={cy.id} className="card" style={{ padding: 16 }}>
                      <div className="spread">
                        <div className="hstack">
                          <StageBadge stage={cy.stage} />
                          <Badge tone="outline">
                            {cy.salesType === "NEW_SALES" ? "New Sales" : "Re-Raise"}
                          </Badge>
                          <Badge tone="outline">{PROJECT_SUPPORT_LABELS[cy.projectSupport]}</Badge>
                          {cy.partnershipStatus ? (
                            <Badge
                              tone={
                                cy.partnershipStatus === "ACTIVE"
                                  ? "green"
                                  : cy.partnershipStatus === "BREAK"
                                    ? "amber"
                                    : "neutral"
                              }
                            >
                              {cy.partnershipStatus}
                            </Badge>
                          ) : null}
                        </div>
                        <span className="muted tiny">updated {friendlyDate(cy.updatedAt)}</span>
                      </div>

                      <div style={{ margin: "14px 0 6px" }}>
                        <div className="hstack" style={{ gap: 4, flexWrap: "wrap" }}>
                          {STAGE_ORDER.map((s, i) => (
                            <div key={s} className="hstack" style={{ gap: 4 }}>
                              <span
                                className="chip"
                                style={
                                  i < idx
                                    ? {
                                        background: "var(--teal-soft)",
                                        color: "var(--teal-strong)",
                                        borderColor: "#cde6e2",
                                      }
                                    : i === idx
                                      ? {
                                          background: "var(--navy)",
                                          color: "#fff",
                                          borderColor: "var(--navy)",
                                        }
                                      : undefined
                                }
                              >
                                {i + 1}. {LIFECYCLE_STAGES.find((x) => x.code === s)?.label}
                              </span>
                              {i < STAGE_ORDER.length - 1 ? (
                                <Icon name="chevron-r" size={12} className="muted" />
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="f-grid" style={{ marginTop: 12 }}>
                        <KeyValue
                          columns="140px 1fr"
                          entries={[
                            ["Sales status", cy.salesStatus],
                            [
                              "Approach",
                              cy.approachMethod === "ACTIVE"
                                ? "Active (AIESEC initiated)"
                                : "Passive (partner initiated)",
                            ],
                            ["Agreed value", idr(cy.agreedValueIdr)],
                            ["History", `${cy.stageHistory.length} stage record(s)`],
                          ]}
                        />
                        <div>
                          {nextStage ? (
                            <>
                              <Button
                                size="sm"
                                variant="primary"
                                icon="arrow-r"
                                onClick={() => setAdvanceOpen(true)}
                                disabled={!canAdvance}
                                title={
                                  !canAdvance
                                    ? "A signed LoA must be on file before entering Partnership Implementation"
                                    : undefined
                                }
                              >
                                Advance to{" "}
                                {LIFECYCLE_STAGES.find((x) => x.code === nextStage)?.label}
                              </Button>
                              {!canAdvance ? (
                                <p className="field-err" style={{ marginTop: 6 }}>
                                  <Icon name="alert" size={12} />
                                  Blocked: stage 4 requires an approved + signed LoA. Record the
                                  signed copy in the LoA module first.
                                </p>
                              ) : null}
                            </>
                          ) : (
                            <p className="muted tiny">
                              Final stage reached. A re-raise decision opens a new cycle instead of
                              editing history.
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="divider" style={{ margin: "14px 0 10px" }} />
                      <h4 className="card-title" style={{ marginBottom: 8, fontSize: 12.5 }}>
                        Stage history
                      </h4>
                      <div className="stack-xs">
                        {cy.stageHistory
                          .slice()
                          .reverse()
                          .map((h) => (
                            <div
                              key={`${h.stage}-${h.at}`}
                              className="hstack"
                              style={{ fontSize: 12.5 }}
                            >
                              <span className="strong" style={{ minWidth: 190 }}>
                                {LIFECYCLE_STAGES.find((x) => x.code === h.stage)?.label}
                              </span>
                              <span className="muted tiny">{friendlyDate(h.at)}</span>
                            </div>
                          ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon="calendar"
                title="No partnership cycle yet"
                description="A cycle opens when this partner moves from research into structured sales work (New Sales or Re-Raise). This partner is currently a directory record only."
              />
            )
          ) : null}

          {tab === "activity" ? (
            activities.length === 0 ? (
              <EmptyState
                icon="clock"
                title="No activity recorded"
                description="Actions on this partner (edits, verification, outreach prep) will appear here."
              />
            ) : (
              <div className="stack-md">
                {activities.map((a) => (
                  <div key={a.id} className="hstack" style={{ gap: 10, alignItems: "flex-start" }}>
                    <span className="tl-dot" style={{ marginTop: 4 }} />
                    <div>
                      <div style={{ fontSize: 13 }}>{a.summary}</div>
                      <div className="muted tiny">
                        {a.actor} · {friendlyDate(a.at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : null}
        </div>
      </Card>

      <EditPartnerModal open={editOpen} onClose={() => setEditOpen(false)} partnerId={partner.id} />
      <AddContactModal
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        partnerId={partner.id}
      />

      {r.cycle
        ? (() => {
            const cyc = r.cycle;
            if (!cyc) return null;
            const curIdx = STAGE_ORDER.indexOf(cyc.stage);
            const nextStage = STAGE_ORDER[curIdx + 1] as LifecycleStage | undefined;
            const curLabel = LIFECYCLE_STAGES.find((x) => x.code === cyc.stage)?.label ?? cyc.stage;
            const nextLabel = nextStage
              ? (LIFECYCLE_STAGES.find((x) => x.code === nextStage)?.label ?? nextStage)
              : "—";
            return (
              <Modal
                open={advanceOpen}
                onClose={() => setAdvanceOpen(false)}
                title={`Advance ${partner.name} to the next stage?`}
                description="Stage transitions are recorded on the cycle history and audit trail (append-only in production). This demo transition only touches in-memory demo state."
                footer={
                  <>
                    <Button onClick={() => setAdvanceOpen(false)}>Cancel</Button>
                    <Button
                      variant="primary"
                      icon="arrow-r"
                      onClick={() => {
                        if (!nextStage) return;
                        dispatch({
                          type: "ADVANCE_CYCLE_STAGE",
                          cycleId: cyc.id,
                          stage: nextStage,
                        });
                        setAdvanceOpen(false);
                        toast.ok(
                          "Stage advanced",
                          `${partner.name} is now in ${nextLabel} (demo transition).`,
                        );
                      }}
                    >
                      Advance stage
                    </Button>
                  </>
                }
              >
                <KeyValue
                  entries={[
                    ["Current stage", curLabel],
                    ["Next stage", nextLabel],
                  ]}
                />
              </Modal>
            );
          })()
        : null}
    </div>
  );
}

/* --------------------------- score row ------------------------------ */

function ScoreRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="align-row">
      <span className="muted">{label}</span>
      <span className="align-dots">
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={cn("align-dot", value !== null && n <= value && "on")} />
        ))}
      </span>
      <span className="strong tiny">{value ?? "—"}</span>
    </div>
  );
}

function SourceTierLabel({ tier, url }: { tier: SourceTier; url: string | null }) {
  return (
    <span className="hstack" style={{ gap: 6 }}>
      <span>{tier}</span>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="tiny">
          attribution link
        </a>
      ) : null}
    </span>
  );
}

/* --------------------------- edit modal ------------------------------ */

function EditPartnerModal({
  open,
  onClose,
  partnerId,
}: {
  open: boolean;
  onClose: () => void;
  partnerId: string;
}) {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const partner = state.partners.find((p) => p.id === partnerId);
  const [name, setName] = useState(partner?.name ?? "");
  const [domain, setDomain] = useState(partner?.websiteDomain ?? "");
  const [email, setEmail] = useState(partner?.officialEmail ?? "");
  const [industry, setIndustry] = useState<IndustryCode>(partner?.industry ?? "OTHERS");
  const [notes, setNotes] = useState(partner?.notes ?? "");
  const [err, setErr] = useState<string | null>(null);

  // keep fields in sync when editing a different partner
  useEffect(() => {
    setName(partner?.name ?? "");
    setDomain(partner?.websiteDomain ?? "");
    setEmail(partner?.officialEmail ?? "");
    setIndustry(partner?.industry ?? "OTHERS");
    setNotes(partner?.notes ?? "");
  }, [partner]);

  if (!partner) return null;

  function save() {
    if ((name ?? "").trim().length < 2) {
      setErr("Partner name must be at least 2 characters.");
      return;
    }
    dispatch({
      type: "UPDATE_PARTNER",
      id: partnerId,
      patch: {
        name: name.trim(),
        websiteDomain: domain.trim() || null,
        officialEmail: email.trim() || null,
        industry,
        notes: notes.trim() || null,
      },
    });
    onClose();
    toast.ok("Partner updated", "Changes are live in this demo session.");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit partner"
      description="Same fields as the M1-03 update contract (name, domain, industry, official email) plus internal notes."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="check" onClick={save}>
            Save changes
          </Button>
        </>
      }
    >
      {err ? (
        <div className="field-err" role="alert">
          <Icon name="alert" size={12} />
          <span>{err}</span>
        </div>
      ) : null}
      <Field label="Partner name" htmlFor="ed-name" required>
        <input
          id="ed-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
        />
      </Field>
      <div className="f-grid">
        <Field label="Website domain" htmlFor="ed-domain">
          <input
            id="ed-domain"
            className="input"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          />
        </Field>
        <Field label="Official email" htmlFor="ed-email">
          <input
            id="ed-email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
      </div>
      <Field label="ESSM industry category" htmlFor="ed-industry" required>
        <select
          id="ed-industry"
          className="input"
          value={industry}
          onChange={(e) => setIndustry(e.target.value as IndustryCode)}
        >
          {ESSM_INDUSTRIES.map((i) => (
            <option key={i.code} value={i.code}>
              {i.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Internal notes" htmlFor="ed-notes">
        <textarea
          id="ed-notes"
          className="input"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
        />
      </Field>
    </Modal>
  );
}

function AddContactModal({
  open,
  onClose,
  partnerId,
}: {
  open: boolean;
  onClose: () => void;
  partnerId: string;
}) {
  const { dispatch } = useDemo();
  const toast = useToast();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [tier, setTier] = useState<SourceTier>("research");
  const [basis, setBasis] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});

  function reset() {
    setName("");
    setTitle("");
    setEmail("");
    setPhone("");
    setBasis("");
    setErrs({});
  }

  function save() {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = "Contact name must be at least 2 characters.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) e.email = "A valid email is required.";
    if (basis.trim().length < 3) e.basis = "A provenance / lawful-basis note is required.";
    setErrs(e);
    if (Object.keys(e).length > 0) return;
    dispatch({
      type: "ADD_CONTACT",
      partnerId,
      contact: {
        name: name.trim(),
        title: title.trim() || null,
        email: email.trim(),
        phone: phone.trim() || null,
        sourceTier: tier,
        sourceUrl: null,
        lawfulBasisNote: basis.trim(),
      },
    });
    reset();
    onClose();
    toast.ok(
      "Contact added",
      "Verification is unverified by default — verify identity and channels before outreach.",
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a contact"
      description="Contacts enter as unverified on every channel. Verify identity and each intended channel from the Contacts module before any outreach preparation treats them as ready."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="check" onClick={save}>
            Add contact
          </Button>
        </>
      }
    >
      <div className="f-grid">
        <Field label="Contact name" htmlFor="ac-name" required error={errs.name}>
          <input
            id="ac-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
          />
        </Field>
        <Field label="Title / role" htmlFor="ac-title">
          <input
            id="ac-title"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
          />
        </Field>
      </div>
      <div className="f-grid">
        <Field label="Email" htmlFor="ac-email" required error={errs.email}>
          <input
            id="ac-email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Phone / WhatsApp" htmlFor="ac-phone">
          <input
            id="ac-phone"
            className="input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+62 812-0000-0000"
          />
        </Field>
      </div>
      <Field label="Source tier" htmlFor="ac-tier">
        <select
          id="ac-tier"
          className="input"
          value={tier}
          onChange={(e) => setTier(e.target.value as SourceTier)}
        >
          {SOURCE_TIERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Lawful-basis / provenance note" htmlFor="ac-basis" required error={errs.basis}>
        <input
          id="ac-basis"
          className="input"
          value={basis}
          onChange={(e) => setBasis(e.target.value)}
          maxLength={500}
        />
      </Field>
    </Modal>
  );
}
