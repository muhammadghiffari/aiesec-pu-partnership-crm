"use client";

/**
 * /demo/research — prospecting & research queue.
 *
 * Criteria are editable (demo state only). "Run research job" simulates a
 * queued→running→completed worker with a progress bar and adds candidates to
 * the review pool. Accept/reject is always a human decision; duplicates
 * require an explicit resolution choice; rejection requires a reason.
 */
import { useEffect, useRef, useState } from "react";
import { ESSM_INDUSTRIES } from "../../partners/types";
import { CandidateBadge, IndustryChip, industryLabel, JobBadge } from "../components/badges";
import { friendlyDate } from "../format";
import { useDemoRuntime } from "../live/provider";
import { indexById } from "../selectors";
import { useDemo } from "../store";
import type { DemoCandidate, IndustryCode, ProjectSupportCode } from "../types";
import { PROJECT_SUPPORTS } from "../types";
import { Icon } from "../ui/Icon";
import { ConfirmDialog, Modal } from "../ui/overlays";
import {
  Badge,
  Button,
  Card,
  cn,
  EmptyState,
  Field,
  KeyValue,
  PageHeader,
  Progress,
} from "../ui/primitives";
import { useToast } from "../ui/toast";

/* Synthetic pool the simulated worker "finds": */
const RUN_POOL: Omit<
  DemoCandidate,
  "id" | "jobId" | "reviewStatus" | "reviewReason" | "reviewedBy" | "reviewedAt"
>[] = [
  {
    orgName: "Senja Demo Retail",
    websiteDomain: "senja-demo.example",
    industry: "ECOMMERCE_RETAIL",
    sourceUrl: "https://retail-radar.example.invalid/listings/senja-demo-retail",
    sourceLabel: "Retail Radar listing (synthetic)",
    sourceTier: "research",
    fitScore: 74,
    notes: "New fulfillment hub; exploring campus segmentation for delivery partnerships.",
    flags: [],
    duplicateOf: null,
    contactDraft: {
      name: "Rizky Maulana",
      title: "Partnerships",
      email: "rizky@senja-demo.example",
      offDomainNote: null,
    },
  },
  {
    orgName: "Pagi Sintetik Beverage",
    websiteDomain: "pagi-sintetik.example",
    industry: "FMCG_FNB",
    sourceUrl: "https://launch-tracker.example.invalid/entries/pagi-sintetik",
    sourceLabel: "Product launch tracker (synthetic)",
    sourceTier: "research",
    fitScore: 81,
    notes: "Cold-brew launch targeting students; actively seeking campus sampling booths.",
    flags: ["Off-domain contact data"],
    duplicateOf: null,
    contactDraft: {
      name: "Tiara Ambar",
      title: "Brand Executive",
      email: "tiara.a@mail-hub-demo.example",
      offDomainNote:
        "Contact email domain does not match the organization domain — verify before relying on it.",
    },
  },
];

export function ResearchScreen() {
  const { state, dispatch } = useDemo();
  const toast = useToast();

  const [indSel, setIndSel] = useState<IndustryCode[]>(state.criteria.industries);
  const [keywords, setKeywords] = useState(state.criteria.keywords);
  const [psSel, setPsSel] = useState<ProjectSupportCode | "">(state.criteria.projectSupport ?? "");
  const [target, setTarget] = useState(String(state.criteria.targetCount));

  const [reviewing, setReviewing] = useState<string | null>(null);
  const runningJob = state.jobs.find((j) => j.status === "RUNNING") ?? null;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  function schedule(steps: { after: number; run: () => void }[]) {
    for (const s of steps) timers.current.push(setTimeout(s.run, s.after));
  }

  function runJob() {
    if (runningJob) {
      toast.warn(
        "A job is already running",
        "Jobs are queued — one runs at a time in this prototype.",
      );
      return;
    }
    const snippet = `${indSel.length ? indSel.map((c) => industryLabel(c)).join(", ") : "All industries"} · target ${target}`;
    const name = `${indSel.length ? industryLabel(indSel[0] ?? "OTHERS") : "All-industry"} scan — demo run`;
    dispatch({ type: "RUN_JOB", name, criteriaSnippet: snippet });
    const jobId = `job-${String(state.seq + 1).padStart(3, "0")}`;
    const seq = state.seq + 1;
    const candIds = seq + 1;
    const candidates: DemoCandidate[] = RUN_POOL.map((c, i) => ({
      ...c,
      id: `cand-r${candIds + i}`,
      jobId,
      reviewStatus: "PENDING",
      reviewReason: null,
      reviewedBy: null,
      reviewedAt: null,
    }));
    schedule([
      { after: 700, run: () => dispatch({ type: "UPDATE_JOB", jobId, patch: { progress: 28 } }) },
      { after: 1400, run: () => dispatch({ type: "UPDATE_JOB", jobId, patch: { progress: 57 } }) },
      { after: 2100, run: () => dispatch({ type: "UPDATE_JOB", jobId, patch: { progress: 84 } }) },
      {
        after: 2800,
        run: () => {
          dispatch({ type: "COMPLETE_JOB", jobId, candidates });
          toast.ok(
            "Research job finished (simulated)",
            `${candidates.length} new candidates entered the review queue.`,
          );
        },
      },
    ]);
  }

  const queued = state.jobs.filter((j) => j.status === "QUEUED");
  const reviewingCandidate = reviewing
    ? (state.candidates.find((c) => c.id === reviewing) ?? null)
    : null;

  return (
    <div className="page">
      <PageHeader
        title="Research"
        description="Prospecting workspace — synthetic criteria drive simulated research jobs. Every candidate enters as pending review and carries attributable sources; a human accepts or rejects, never the system."
      />

      <div className="grid-2" style={{ gridTemplateColumns: "340px 1fr" }}>
        <div className="stack-lg">
          <Card
            title="Research criteria"
            sub="Editable demo criteria — each job run snapshots them"
          >
            <div className="stack-md">
              <Field label="Industries in scope">
                <div className="chips">
                  {ESSM_INDUSTRIES.map((i) => {
                    const on = indSel.includes(i.code);
                    return (
                      <button
                        key={i.code}
                        type="button"
                        className="chip"
                        aria-pressed={on}
                        onClick={() =>
                          setIndSel(on ? indSel.filter((c) => c !== i.code) : [...indSel, i.code])
                        }
                        style={
                          on
                            ? {
                                background: "var(--teal-soft)",
                                color: "var(--teal-strong)",
                                borderColor: "#cde6e2",
                                cursor: "pointer",
                              }
                            : { cursor: "pointer" }
                        }
                      >
                        {i.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field label="Keywords" htmlFor="rc-kw">
                <input
                  id="rc-kw"
                  className="input"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                />
              </Field>
              <div className="f-grid">
                <Field label="Project Support focus" htmlFor="rc-ps">
                  <select
                    id="rc-ps"
                    className="input"
                    value={psSel}
                    onChange={(e) => setPsSel(e.target.value as ProjectSupportCode | "")}
                  >
                    <option value="">Any</option>
                    {PROJECT_SUPPORTS.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Target candidates" htmlFor="rc-n">
                  <input
                    id="rc-n"
                    className="input"
                    type="number"
                    min={1}
                    max={25}
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  />
                </Field>
              </div>
              <div className="hstack" style={{ gap: 8 }}>
                <Button
                  size="sm"
                  icon="check"
                  onClick={() => {
                    dispatch({
                      type: "SET_CRITERIA",
                      criteria: {
                        industries: indSel,
                        keywords,
                        projectSupport: psSel || null,
                        targetCount: Math.max(1, Math.min(25, Number.parseInt(target, 10) || 10)),
                        updatedAt: new Date().toISOString(),
                      },
                    });
                    toast.ok("Criteria saved", "Stored in demo session state only.");
                  }}
                >
                  Save criteria
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  icon="sparkles"
                  onClick={runJob}
                  disabled={runningJob !== null}
                >
                  {runningJob ? "Job running…" : "Run research job"}
                </Button>
              </div>
              <p className="field-hint">
                Simulation only — no AI provider, no real crawling, no external calls. The worker
                “finds” synthetic candidates so the review workflow can be experienced end to end.
              </p>
            </div>
          </Card>

          <Card title="Job queue" sub={`${state.jobs.length} job record(s) in this session`}>
            <div className="stack-md">
              {state.jobs.slice(0, 6).map((j) => (
                <div key={j.id} className="card" style={{ padding: "10px 14px" }}>
                  <div className="spread">
                    <div style={{ minWidth: 0 }}>
                      <b style={{ fontSize: 13 }}>{j.name}</b>
                      <div className="muted tiny trunc">{j.criteriaSnippet}</div>
                    </div>
                    <JobBadge status={j.status} />
                  </div>
                  {j.status === "RUNNING" ? (
                    <div style={{ marginTop: 8 }} className="stack-xs">
                      <Progress value={j.progress} aria-label={`Progress of ${j.name}`} />
                      <span className="muted tiny">Simulated worker… {j.progress}%</span>
                    </div>
                  ) : null}
                  {j.status === "FAILED" ? (
                    <div className="field-err" style={{ marginTop: 6 }}>
                      <Icon name="alert" size={12} />
                      <span>{j.error}</span>
                    </div>
                  ) : null}
                  <div className="muted tiny" style={{ marginTop: 6 }}>
                    {j.status === "COMPLETED"
                      ? `found ${j.found} candidates · completed ${friendlyDate(j.completedAt ?? j.createdAt)}`
                      : `created ${friendlyDate(j.createdAt)}`}
                  </div>
                </div>
              ))}
              {queued.length > 1 ? (
                <p className="muted tiny">
                  {queued.length - 1} additional job(s) waiting for the worker.
                </p>
              ) : null}
            </div>
          </Card>
        </div>

        <Card
          title="Review queue"
          sub={`${state.candidates.filter((c) => c.reviewStatus === "PENDING").length} pending human decisions of ${state.candidates.length} candidate(s)`}
          flush
        >
          <CandidateList onReview={(id) => setReviewing(id)} />
        </Card>
      </div>

      <ReviewModal candidate={reviewingCandidate} onClose={() => setReviewing(null)} />
    </div>
  );
}

/* --------------------------- candidate list --------------------------- */

function CandidateList({ onReview }: { onReview: (id: string) => void }) {
  const { state } = useDemo();
  const partnersById = indexById(state.partners);
  const [filter, setFilter] = useState<"PENDING" | "ALL" | "REVIEWED">("PENDING");
  const rows = state.candidates
    .filter((c) =>
      filter === "ALL"
        ? true
        : filter === "PENDING"
          ? c.reviewStatus === "PENDING"
          : c.reviewStatus !== "PENDING",
    )
    .slice()
    .sort((a, b) => {
      if (a.reviewStatus === "PENDING" && b.reviewStatus !== "PENDING") return -1;
      if (a.reviewStatus !== "PENDING" && b.reviewStatus === "PENDING") return 1;
      return b.fitScore - a.fitScore;
    });

  return (
    <>
      <div
        style={{ padding: "12px 18px", borderBottom: "1px solid var(--line)" }}
        className="hstack"
      >
        {(["PENDING", "REVIEWED", "ALL"] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={cn("chip")}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            style={
              filter === f
                ? {
                    background: "var(--navy)",
                    color: "#fff",
                    borderColor: "var(--navy)",
                    cursor: "pointer",
                  }
                : { cursor: "pointer" }
            }
          >
            {f === "PENDING" ? "Pending review" : f === "REVIEWED" ? "Decided" : "All"}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon="sparkles"
          title={filter === "PENDING" ? "Nothing awaiting review" : "No candidates in this view"}
          description="Run a simulated research job to add candidates — or switch the filter above."
        />
      ) : (
        <div style={{ padding: "14px 18px", display: "grid", gap: 12 }}>
          {rows.map((c) => {
            const dupe = c.duplicateOf ? partnersById.get(c.duplicateOf) : undefined;
            return (
              <article key={c.id} className="cand">
                <div className="cand-hd">
                  <div
                    className={cn("score-ring", c.fitScore < 70 && "mid")}
                    style={{ "--v": c.fitScore } as React.CSSProperties}
                    role="img"
                    aria-label={`Fit score ${c.fitScore} of 100`}
                    title="Prospect-prioritisation signal only — never an ESSM alignment score"
                  >
                    {c.fitScore}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="hstack hstack-wrap" style={{ gap: 8 }}>
                      <b style={{ fontSize: 13.5 }}>{c.orgName}</b>
                      <IndustryChip industry={c.industry} />
                    </div>
                    <div className="muted tiny" style={{ marginTop: 2 }}>
                      {c.websiteDomain} · {c.sourceLabel}
                    </div>
                  </div>
                  <CandidateBadge status={c.reviewStatus} />
                </div>
                <div className="cand-bd">
                  <span>{c.notes}</span>
                  <span className="hstack hstack-wrap" style={{ gap: 8 }}>
                    <a
                      href={c.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="hstack tiny"
                      style={{ gap: 4 }}
                    >
                      <Icon name="external" size={11} /> {c.sourceUrl}
                    </a>
                    <Badge tone="outline">{c.sourceTier}</Badge>
                    {c.flags.map((f) => (
                      <span key={f} className={cn("flag", f.includes("duplicate") && "red")}>
                        <Icon name="flag" size={11} /> {f}
                      </span>
                    ))}
                  </span>
                  {dupe ? (
                    <span className="field-err" style={{ marginTop: 0 }}>
                      <Icon name="alert" size={12} />
                      <span>
                        Possible duplicate of{" "}
                        <LinkSafe href={`/demo/partners/${dupe.id}`} label={dupe.name} /> — an
                        explicit human choice is required during acceptance.
                      </span>
                    </span>
                  ) : null}
                  {c.contactDraft.offDomainNote ? (
                    <span className="field-err" style={{ marginTop: 0, color: "var(--amber)" }}>
                      <Icon name="alert" size={12} />
                      <span>{c.contactDraft.offDomainNote}</span>
                    </span>
                  ) : null}
                  {c.reviewStatus !== "PENDING" && c.reviewReason ? (
                    <span className="muted tiny">
                      Decision by {c.reviewedBy} ({friendlyDate(c.reviewedAt ?? "")}):{" "}
                      {c.reviewReason}
                    </span>
                  ) : null}
                </div>
                <div className="cand-ft">
                  {c.reviewStatus === "PENDING" ? (
                    <Button size="sm" variant="primary" icon="eye" onClick={() => onReview(c.id)}>
                      Review candidate
                    </Button>
                  ) : (
                    <span className="muted tiny">Reviewed</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

function LinkSafe({ href, label }: { href: string; label: string }) {
  return <a href={href}>{label}</a>;
}

/* ----------------------------- review modal --------------------------- */

function ReviewModal({
  candidate,
  onClose,
}: {
  candidate: DemoCandidate | null;
  onClose: () => void;
}) {
  const { state, dispatch } = useDemo();
  const runtime = useDemoRuntime();
  const toast = useToast();
  const [resolution, setResolution] = useState<"NEW" | "LINK">("NEW");
  const [note, setNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [confirm, setConfirm] = useState<null | "accept" | "reject">(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (candidate) {
      setResolution(candidate.duplicateOf ? "LINK" : "NEW");
      setNote("");
      setRejectReason("");
      setConfirm(null);
    }
  }, [candidate]);

  if (!candidate) return null;
  const dupe = candidate.duplicateOf
    ? state.partners.find((p) => p.id === candidate.duplicateOf)
    : undefined;
  const job = state.jobs.find((j) => j.id === candidate.jobId);

  function candidatePartner() {
    const contact = candidate!.contactDraft.email
      ? {
          name: candidate!.contactDraft.name,
          title: candidate!.contactDraft.title,
          email: candidate!.contactDraft.email,
          phone: null as string | null,
          sourceTier: candidate!.sourceTier,
          sourceUrl: candidate!.sourceUrl,
          lawfulBasisNote:
            candidate!.contactDraft.offDomainNote ||
            `Email sourced during research (${candidate!.sourceLabel}).`,
        }
      : null;
    return {
      name: candidate!.orgName,
      websiteDomain: candidate!.websiteDomain,
      industry: candidate!.industry,
      officialEmail: candidate!.contactDraft.email || null,
      sourceTier: candidate!.sourceTier,
      sourceUrl: candidate!.sourceUrl,
      lawfulBasisNote:
        note.trim() || `Acceptance review of research source: ${candidate!.sourceLabel}.`,
      notes: "Accepted from the Prospecting review queue in this demo session.",
      contact,
    };
  }

  async function doAccept() {
    if (!candidate || busy) return;
    if (resolution === "LINK" && dupe) {
      // Link decision: no record is created; the review state changes only.
      dispatch({
        type: "MARK_CANDIDATE_REVIEWED",
        candidateId: candidate.id,
        outcome: "ACCEPTED_LINKED",
        note: note.trim() || `Reviewed as the same organization as ${dupe.name}.`,
      });
      setConfirm(null);
      onClose();
      toast.ok("Candidate linked", "No duplicate was created; the decision was recorded.");
      return;
    }
    setBusy(true);
    const outcome = await runtime.acceptCandidate(candidate.id, candidatePartner());
    setBusy(false);
    if (!outcome) return; // the wrapper surfaced duplicates/server errors
    setConfirm(null);
    onClose();
    if (!("duplicates" in outcome))
      toast.ok(
        resolution === "NEW" ? "Candidate accepted" : "Candidate linked",
        "A partner record was created in Prospecting with unverified contacts — verification comes next.",
      );
  }

  function doReject() {
    if (!candidate) return;
    if (rejectReason.trim().length < 3) return;
    dispatch({ type: "REJECT_CANDIDATE", candidateId: candidate.id, reason: rejectReason.trim() });
    setConfirm(null);
    onClose();
    toast.ok("Candidate rejected", "Reason recorded against the candidate for the audit trail.");
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`Review: ${candidate.orgName}`}
        description={`Candidate from ${job?.name ?? candidate.jobId} · provenance must be verified before any record is trusted.`}
        size="lg"
        footer={
          <>
            <Button
              variant="danger"
              icon="x"
              onClick={() => setConfirm("reject")}
              disabled={candidate.reviewStatus !== "PENDING"}
            >
              Reject with reason
            </Button>
            <Button
              variant="primary"
              icon="check"
              onClick={() => setConfirm("accept")}
              disabled={candidate.reviewStatus !== "PENDING"}
            >
              Accept
            </Button>
          </>
        }
      >
        <div className="grid-2">
          <KeyValue
            columns="130px 1fr"
            entries={[
              ["Organization", candidate.orgName],
              ["Domain", candidate.websiteDomain],
              ["Industry", industryLabel(candidate.industry)],
              [
                "Fit score",
                `${candidate.fitScore}/100 — a prioritisation signal only; it never decides`,
              ],
              ["Source tier", candidate.sourceTier],
            ]}
          />
          <KeyValue
            columns="130px 1fr"
            entries={[
              [
                "Source URL",
                <a key="su" href={candidate.sourceUrl} target="_blank" rel="noreferrer">
                  {candidate.sourceUrl}
                </a>,
              ],
              ["Source label", candidate.sourceLabel],
              ["Flags", candidate.flags.length ? candidate.flags.join(", ") : "none"],
              [
                "Contact draft",
                `${candidate.contactDraft.name ?? "—"} (${candidate.contactDraft.email})`,
              ],
            ]}
          />
        </div>
        <p style={{ fontSize: 13 }}>{candidate.notes}</p>
        {candidate.contactDraft.offDomainNote ? (
          <div className="field-err" style={{ marginTop: 0 }}>
            <Icon name="alert" size={12} />
            <span>{candidate.contactDraft.offDomainNote}</span>
          </div>
        ) : null}
        <div className="note-banner" role="note">
          <Icon name="info" size={14} />
          Human review is mandatory. Accepting creates an <b>unverified</b> partner record — nothing
          here validates the organization, its contacts, or any channel.
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm === "accept"}
        onClose={() => setConfirm(null)}
        onConfirm={doAccept}
        title={`Accept '${candidate?.orgName ?? ""}'?`}
        message={
          dupe
            ? "This candidate is flagged as a possible duplicate of an existing partner. Choose what the record means before accepting — duplicates are only created by explicit human decision."
            : "Accepting creates a partner record in Prospecting with unverified contacts. You can still edit everything afterwards."
        }
        confirmLabel={
          dupe && resolution === "LINK"
            ? "Accept as same organization (link)"
            : "Accept and create partner record"
        }
        extra={
          <div className="stack-sm">
            {dupe ? (
              <div className="stack-xs">
                <label
                  className={`radio-card${resolution === "LINK" ? " active" : ""}`}
                  style={{ display: "flex" }}
                >
                  <input
                    type="radio"
                    name="dup-res"
                    checked={resolution === "LINK"}
                    onChange={() => setResolution("LINK")}
                  />
                  <span>
                    <b>Same organization</b> — link to “{dupe.name}”. No duplicate record is
                    created.
                  </span>
                </label>
                <label
                  className={`radio-card${resolution === "NEW" ? " active" : ""}`}
                  style={{ display: "flex" }}
                >
                  <input
                    type="radio"
                    name="dup-res"
                    checked={resolution === "NEW"}
                    onChange={() => setResolution("NEW")}
                  />
                  <span>
                    <b>Different organization</b> — create a new partner record despite the
                    similarity.
                  </span>
                </label>
              </div>
            ) : null}
            <Field label="Reviewer note (optional)" htmlFor="acc-note">
              <input
                id="acc-note"
                className="input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why this is being accepted…"
                maxLength={200}
              />
            </Field>
          </div>
        }
      />

      <ConfirmDialog
        open={confirm === "reject"}
        onClose={() => setConfirm(null)}
        onConfirm={doReject}
        title={`Reject '${candidate?.orgName ?? ""}'?`}
        message="Rejection requires a reason — it is recorded on the candidate and the audit trail so the decision stays reviewable."
        confirmLabel="Reject candidate"
        danger
        confirmDisabled={rejectReason.trim().length < 3}
        extra={
          <Field label="Rejection reason (required)" htmlFor="rej-reason">
            <textarea
              id="rej-reason"
              className="input"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. No student-facing program evidence in the synthetic sources."
              maxLength={500}
            />
          </Field>
        }
      />
    </>
  );
}
