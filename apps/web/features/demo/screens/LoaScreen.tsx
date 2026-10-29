"use client";

/**
 * /demo/loa — Letter of Agreement workflow (recorded metadata only).
 *
 * The CRM records draft/review/approval/signature-reference metadata. An
 * approval here is a recorded prototype step — never a legal act. Signing
 * happens outside the system; "record signed copy" only stores a reference.
 * D-009 separation of duties is enforced: a submitter can never approve their
 * own LoA.
 */
import Link from "next/link";
import { useState } from "react";
import { LoaBadge } from "../components/badges";
import { friendlyDate, idr } from "../format";
import { DEMO_USER } from "../seed";
import { canApproveLoa, indexById } from "../selectors";
import { useDemo } from "../store";
import type { DemoAgreement } from "../types";
import { Icon } from "../ui/Icon";
import { ConfirmDialog, Drawer, Modal } from "../ui/overlays";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  KeyValue,
  PageHeader,
  Timeline,
} from "../ui/primitives";
import { useToast } from "../ui/toast";

export function LoaScreen() {
  const { state } = useDemo();
  const partnersById = indexById(state.partners);
  const [selected, setSelected] = useState<string | null>(null);

  const agreements = [...state.agreements].sort((a, b) => b.number.localeCompare(a.number));
  const selectedLoa = selected ? (state.agreements.find((a) => a.id === selected) ?? null) : null;

  return (
    <div className="page">
      <PageHeader
        title="Letters of Agreement"
        description="Recorded workflow metadata for agreements — drafts, reviews, approvals and signed-copy references. Documents are drafted from official templates and signed outside the system; this module never signs anything."
      />

      <Card flush>
        {agreements.length === 0 ? (
          <EmptyState
            icon="file-text"
            title="No agreements recorded"
            description="LoA records appear when a close-deal partner is ready for contracting."
          />
        ) : (
          <div className="tbl-scroll">
            <table className="tbl">
              <caption className="sr-only">{agreements.length} agreement record(s)</caption>
              <thead>
                <tr>
                  <th scope="col">Number</th>
                  <th scope="col">Agreement</th>
                  <th scope="col">Partner</th>
                  <th scope="col">Type</th>
                  <th scope="col">Value (IDR)</th>
                  <th scope="col">Status</th>
                  <th scope="col">Submitted by</th>
                </tr>
              </thead>
              <tbody>
                {agreements.map((a) => (
                  <tr
                    key={a.id}
                    className="row-click"
                    onClick={(e) => {
                      // Nested controls (the open button) own their own click.
                      if (e.target instanceof Element && e.target.closest("a,button")) return;
                      setSelected(a.id);
                    }}
                  >
                    <td className="t-strong nowrap">
                      <button
                        type="button"
                        className="row-open"
                        aria-label={`Open agreement ${a.number} — ${a.title}`}
                        onClick={() => setSelected(a.id)}
                      >
                        {a.number}
                      </button>
                    </td>
                    <td>
                      <span className="t-strong" style={{ fontWeight: 540 }}>
                        {a.title}
                      </span>
                      <span className="t-sub">
                        {a.kind === "MONETARY"
                          ? "Monetary / valued template"
                          : "Non-monetary template"}
                      </span>
                    </td>
                    <td>{partnersById.get(a.partnerId)?.name ?? "—"}</td>
                    <td>
                      <Badge tone="outline">
                        {a.kind === "MONETARY" ? "Monetary" : "Non-monetary"}
                      </Badge>
                    </td>
                    <td className="nowrap">{a.valueIdr ? idr(a.valueIdr) : "—"}</td>
                    <td>
                      <LoaBadge status={a.status} />
                    </td>
                    <td className="nowrap">
                      {a.submitter}
                      {a.submitter === DEMO_USER.name ? <span className="t-sub">you</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="muted tiny" style={{ maxWidth: "80ch" }}>
        Numbering follows the configurable sequential pattern (confirm with the template owner —
        decision Q-04). The demo user is <b>{DEMO_USER.name}</b>; LoAs she submitted cannot be
        approved by her (D-009 separation of duties).
      </p>

      <LoaDrawer loa={selectedLoa} onClose={() => setSelected(null)} />
    </div>
  );
}

/* ------------------------------- drawer ------------------------------- */

function LoaDrawer({ loa, onClose }: { loa: DemoAgreement | null; onClose: () => void }) {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [signOpen, setSignOpen] = useState(false);

  if (!loa)
    return (
      <Drawer open={false} onClose={onClose} title={<span />}>
        {null}
      </Drawer>
    );
  const partner = state.partners.find((p) => p.id === loa.partnerId);
  const gate = canApproveLoa(DEMO_USER.name, loa);

  const steps: { key: string; label: string; done: boolean; current: boolean }[] = (() => {
    const order: DemoAgreement["status"][] = [
      "DRAFT",
      "IN_REVIEW",
      "APPROVED",
      "AWAITING_SIGNATURE",
      "SIGNED",
    ];
    const idx = order.indexOf(loa.status === "REJECTED" ? "DRAFT" : loa.status);
    return [
      { key: "draft", label: "Draft prepared", done: true, current: loa.status === "DRAFT" },
      {
        key: "review",
        label: "Submitted for approval",
        done: loa.status !== "DRAFT",
        current: loa.status === "IN_REVIEW",
      },
      {
        key: "approve",
        label: "Approved by CRM Lead (recorded)",
        done: idx >= 2,
        current: loa.status === "APPROVED",
      },
      {
        key: "sign",
        label: "External signature",
        done: loa.status === "SIGNED",
        current: loa.status === "AWAITING_SIGNATURE",
      },
      {
        key: "onfile",
        label: "Signed copy on file",
        done: loa.status === "SIGNED",
        current: false,
      },
    ];
  })();

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        title={<span>{loa.number}</span>}
        sub={
          <span className="hstack hstack-wrap" style={{ gap: 8 }}>
            <LoaBadge status={loa.status} />
            <Badge tone="outline">
              {loa.kind === "MONETARY" ? "Monetary template" : "Non-monetary"}
            </Badge>
            {partner ? <Link href={`/demo/partners/${partner.id}`}>{partner.name}</Link> : null}
          </span>
        }
        footer={
          <>
            {loa.status === "DRAFT" ? (
              <Button variant="primary" icon="arrow-r" onClick={() => setConfirmSubmit(true)}>
                Submit for approval
              </Button>
            ) : null}
            {loa.status === "IN_REVIEW" ? (
              <Button
                variant="primary"
                icon="check"
                disabled={!gate.allowed}
                title={
                  !gate.allowed
                    ? (gate.reason ?? "Not approvable by the current demo user")
                    : undefined
                }
                onClick={() => setConfirmApprove(true)}
              >
                Approve (recorded)
              </Button>
            ) : null}
            {loa.status === "APPROVED" ? (
              <Button variant="primary" icon="file-text" onClick={() => setSignOpen(true)}>
                Record signed copy…
              </Button>
            ) : null}
          </>
        }
      >
        {!gate.allowed && loa.status === "IN_REVIEW" ? (
          <div className="field-err" style={{ marginTop: 0 }}>
            <Icon name="alert" size={12} />
            <span>{gate.reason}</span>
          </div>
        ) : null}

        <section aria-labelledby="loa-steps">
          <h3 className="card-title" id="loa-steps" style={{ marginBottom: 10 }}>
            Workflow
          </h3>
          <div className="pipe" style={{ gap: 2 }}>
            {steps.map((s) => (
              <div key={s.key} className="hstack" style={{ gap: 10, padding: "5px 2px" }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    background: s.done
                      ? "var(--teal)"
                      : s.current
                        ? "var(--amber-soft)"
                        : "var(--surface-3)",
                    color: s.done ? "#fff" : "var(--amber)",
                    border:
                      s.current && !s.done ? "2px solid #d99a26" : "1px solid var(--line-strong)",
                    flex: "none",
                    fontSize: 10,
                  }}
                >
                  {s.done ? <Icon name="check" size={10} strokeWidth={3} /> : null}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: s.current ? "var(--ink)" : s.done ? "var(--ink-2)" : "var(--ink-4)",
                    fontWeight: s.current ? 620 : 420,
                  }}
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="loa-meta">
          <h3 className="card-title" id="loa-meta" style={{ marginBottom: 8 }}>
            Document metadata
          </h3>
          <KeyValue
            entries={[
              ["Title", loa.title],
              ["Cycle", loa.cycleId],
              ["Signatories", loa.signatories.join(" + ")],
              ["Submitted by", loa.submitter],
              [
                "Value (snapshot)",
                loa.valueIdr ? idr(loa.valueIdr) : "Non-monetary — no value snapshot",
              ],
              [
                "Document ref",
                loa.documentRef ? (
                  <a key="doc" href={loa.documentRef} target="_blank" rel="noreferrer">
                    open reference (synthetic)
                  </a>
                ) : (
                  "—"
                ),
              ],
              [
                "Signed copy",
                loa.signedRef ? (
                  <a key="sig" href={loa.signedRef} target="_blank" rel="noreferrer">
                    archived reference (synthetic)
                  </a>
                ) : (
                  "Not recorded"
                ),
              ],
              ["Signed at", loa.signedAt ? friendlyDate(loa.signedAt) : "—"],
            ]}
          />
        </section>

        <section aria-labelledby="loa-preview">
          <h3 className="card-title" id="loa-preview" style={{ marginBottom: 8 }}>
            Document preview
          </h3>
          <article className="doc" aria-label={`Synthetic document preview of ${loa.number}`}>
            <span className="doc-watermark">Demo copy — not legally valid</span>
            <h4>{loa.title}</h4>
            <p>
              <b>Letter of Agreement {loa.number}</b> — synthetic stand-in for the official
              bilingual template. Generated from the approved template structure with configurable
              fields only (partner names, scope, values are snapshots taken at draft time).
            </p>
            <div className="doc-line" style={{ width: "92%" }} />
            <div className="doc-line" style={{ width: "86%" }} />
            <div className="doc-line" style={{ width: "78%" }} />
            <p style={{ marginTop: 10 }}>
              Signing and storage of the legally binding copy happen <b>outside</b> the CRM. This
              record tracks references, workflow state and responsibility only.
            </p>
          </article>
        </section>

        <section aria-labelledby="loa-history">
          <h3 className="card-title" id="loa-history" style={{ marginBottom: 8 }}>
            Versions & audit trail
          </h3>
          <Timeline
            items={[
              ...loa.versions.map((v) => ({
                key: `v${v.version}`,
                dot: "gray" as const,
                title: (
                  <>
                    <b>v{v.version}</b> created by {v.by}
                    <span className="muted"> — {v.note}</span>
                  </>
                ),
                meta: friendlyDate(v.at),
              })),
              ...loa.history.map((h, i) => ({
                key: `h${i}`,
                dot: (h.action === "APPROVED"
                  ? "teal"
                  : h.action === "RETURNED"
                    ? "red"
                    : h.action === "SIGNATURE_RECORDED"
                      ? "gray"
                      : "amber") as "teal" | "gray" | "red" | "amber",
                title: (
                  <>
                    <b>{h.actor}</b> {h.action.replaceAll("_", " ").toLowerCase()}
                    <span className="muted"> — {h.note}</span>
                  </>
                ),
                meta: friendlyDate(h.at),
              })),
            ].sort((a, b) => (a.key < b.key ? -1 : 1))}
          />
          <p className="muted tiny" style={{ marginTop: 10 }}>
            Every approval here is a <b>recorded prototype step</b> — it changes no legal fact and
            no production backend. In the real system these events write append-only audit entries.
          </p>
        </section>
      </Drawer>

      <ConfirmDialog
        open={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        onConfirm={() => {
          dispatch({ type: "LOA_SUBMIT", loaId: loa.id });
          setConfirmSubmit(false);
          toast.ok(
            "Submitted for approval",
            `${loa.number} is now in review — approvable by the other CRM Lead, never by the submitter.`,
          );
        }}
        title={`Submit ${loa.number} for approval?`}
        message="This records a workflow step only. After submitting, the submitter can never approve it (D-009), so the other CRM Lead must review."
        confirmLabel="Submit for approval"
      />

      <ConfirmDialog
        open={confirmApprove}
        onClose={() => setConfirmApprove(false)}
        onConfirm={() => {
          dispatch({
            type: "LOA_APPROVE",
            loaId: loa.id,
            note: "Approved after checking the SnD snapshot (demo)",
          });
          setConfirmApprove(false);
          toast.ok(
            "Approval recorded",
            `${loa.number} progressed to 'Approved (recorded)' — no legal act was performed.`,
          );
        }}
        title={`Approve ${loa.number}?`}
        message="In production this writes an append-only approval event after checking the SnD snapshot. Here it is a recorded prototype step with no legal effect — a demo button can never make an agreement approved or signed."
        confirmLabel="Approve (recorded step)"
      />

      <SignModal loa={loa} open={signOpen} onClose={() => setSignOpen(false)} />
    </>
  );
}

function SignModal({
  loa,
  open,
  onClose,
}: {
  loa: DemoAgreement;
  open: boolean;
  onClose: () => void;
}) {
  const { dispatch } = useDemo();
  const toast = useToast();
  const [date, setDate] = useState("2026-10-30");
  const [ref, setRef] = useState(
    `https://archive.example.invalid/loa/${loa.number.replaceAll("/", "-")}-signed`,
  );
  const [err, setErr] = useState<string | null>(null);

  function save() {
    if (Number.isNaN(new Date(date).getTime())) {
      setErr("Enter a valid signature date.");
      return;
    }
    if (!/^https:\/\/\S+/.test(ref)) {
      setErr("Provide an archive reference URL for the externally signed copy.");
      return;
    }
    dispatch({
      type: "LOA_RECORD_SIGNATURE",
      loaId: loa.id,
      signedAt: new Date(date).toISOString(),
      signedRef: ref,
    });
    onClose();
    toast.ok(
      "Signed copy reference recorded",
      "The CRM now tracks the external signed-copy location for this LoA.",
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Record signed copy for ${loa.number}?`}
      description="Signing happens outside the CRM. This records the archive reference and date of the signed document — it does not sign, execute, or finalize anything."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="check" onClick={save}>
            Record reference
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
      <Field label="Signature date" htmlFor="sg-date" required>
        <input
          id="sg-date"
          type="date"
          className="input"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
      <Field
        label="Signed copy archive reference"
        htmlFor="sg-ref"
        required
        hint="Where the signed PDF lives (synthetic link)."
      >
        <input id="sg-ref" className="input" value={ref} onChange={(e) => setRef(e.target.value)} />
      </Field>
    </Modal>
  );
}
