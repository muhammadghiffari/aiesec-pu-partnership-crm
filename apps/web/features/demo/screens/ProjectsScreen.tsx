"use client";

/**
 * /demo/projects — partnership implementation portfolio.
 *
 * Projects belong to partners in (or near) implementation and track
 * milestone timeline and action items. The create flow is a demo interaction
 * only — nothing is persisted anywhere.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProjectBadge, StageBadge } from "../components/badges";
import { friendlyDate } from "../format";
import { indexById } from "../selectors";
import { useDemo } from "../store";
import type { DemoProject, ProjectStatus } from "../types";
import { PROJECT_STATUS_LABELS, PROJECT_SUPPORT_LABELS, PROJECT_SUPPORTS } from "../types";
import { Icon } from "../ui/Icon";
import { Drawer, Modal } from "../ui/overlays";
import { Badge, Button, Card, EmptyState, Field, PageHeader, Segmented } from "../ui/primitives";
import { useToast } from "../ui/toast";

type Section = "ALL" | "ACTIVE" | "RISK" | "DONE";

export function ProjectsScreen() {
  const { state } = useDemo();
  const partnersById = indexById(state.partners);
  const cyclesById = indexById(state.cycles);
  const [section, setSection] = useState<Section>("ALL");
  const [statusF, setStatusF] = useState<ProjectStatus | "">("");
  const [selected, setSelected] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const rows = useMemo(
    () =>
      state.projects
        .filter((p) => {
          if (section === "ACTIVE") return p.status === "IN_PROGRESS" || p.status === "PLANNING";
          if (section === "RISK") return p.status === "AT_RISK";
          if (section === "DONE") return p.status === "COMPLETED";
          return true;
        })
        .filter((p) => (statusF ? p.status === statusF : true))
        .slice()
        .sort((a, b) => a.endDate.localeCompare(b.endDate)),
    [state.projects, section, statusF],
  );

  const selectedProject = selected ? (state.projects.find((p) => p.id === selected) ?? null) : null;
  const projectCreatableCycles = state.cycles.filter(
    (c) => c.stage === "PARTNERSHIP_IMPLEMENTATION" || c.stage === "CLOSE_DEAL",
  );

  return (
    <div className="page">
      <PageHeader
        title="Projects"
        description="Implementation portfolio — projects deliver the obligations of signed LoAs. Filter by lifecycle area, open a project for its milestone timeline and action items."
        actions={
          <Button
            variant="primary"
            icon="plus"
            onClick={() => setCreateOpen(true)}
            disabled={projectCreatableCycles.length === 0}
          >
            New project (demo)
          </Button>
        }
      />

      <Card
        flush
        title={
          <Segmented
            ariaLabel="Project sections"
            value={section}
            onChange={(v) => setSection(v as Section)}
            options={[
              { value: "ALL", label: "All" },
              { value: "ACTIVE", label: "Active" },
              { value: "RISK", label: "At risk" },
              { value: "DONE", label: "Completed" },
            ]}
          />
        }
        side={
          <select
            className="input"
            style={{ maxWidth: 170 }}
            aria-label="Filter by status"
            value={statusF}
            onChange={(e) => setStatusF(e.target.value as ProjectStatus | "")}
          >
            <option value="">Any status</option>
            {Object.entries(PROJECT_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        }
      >
        {rows.length === 0 ? (
          <EmptyState
            icon="kanban"
            title="No projects in this view"
            description="Projects link to implementation-stage partnership cycles."
          />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              padding: "14px 18px",
            }}
          >
            {rows.map((p) => {
              const partner = partnersById.get(p.partnerId);
              const cycle = cyclesById.get(p.cycleId);
              const overdueItems = p.actionItems.filter(
                (a) => !a.done && isPastLite(a.dueDate),
              ).length;
              return (
                <button
                  key={p.id}
                  type="button"
                  className="card"
                  style={{ textAlign: "left", cursor: "pointer", padding: 0, font: "inherit" }}
                  onClick={() => setSelected(p.id)}
                >
                  <div style={{ padding: "14px 16px 10px" }}>
                    <div className="spread">
                      <Badge tone="outline">{PROJECT_SUPPORT_LABELS[p.projectSupport]}</Badge>
                      <ProjectBadge status={p.status} />
                    </div>
                    <b style={{ display: "block", marginTop: 8, fontSize: 14 }}>{p.name}</b>
                    <div className="muted tiny" style={{ marginTop: 2 }}>
                      {partner?.name ?? "—"} · owner {p.owner}
                    </div>
                  </div>
                  <div style={{ padding: "0 16px 12px" }} className="stack-xs">
                    <div className="hstack" style={{ gap: 8 }}>
                      <span className="progress" style={{ flex: 1 }}>
                        <span
                          className={
                            p.progress >= 70
                              ? "progress-fill"
                              : p.progress >= 30
                                ? "progress-fill warn"
                                : "progress-fill red"
                          }
                          style={{ width: `${p.progress}%` }}
                        />
                      </span>
                      <span className="tiny strong nowrap">{p.progress}%</span>
                    </div>
                    <div className="spread">
                      <span className="muted tiny">
                        {friendlyDate(p.startDate)} → {friendlyDate(p.endDate)}
                      </span>
                      {p.nextMilestone ? (
                        <span className="muted tiny trunc" title={`Next: ${p.nextMilestone}`}>
                          Next: {p.nextMilestone}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div
                    className="divider"
                    style={{ display: "flex", padding: "8px 16px", gap: 8, alignItems: "center" }}
                  >
                    {cycle ? <StageBadge stage={cycle.stage} /> : null}
                    {overdueItems > 0 ? (
                      <span className="flag red" style={{ marginLeft: "auto" }}>
                        <Icon name="clock" size={11} /> {overdueItems} overdue item
                        {overdueItems === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <ProjectDrawer project={selectedProject} onClose={() => setSelected(null)} />
      <CreateProjectModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        cycles={projectCreatableCycles}
      />
    </div>
  );
}

function isPastLite(iso: string): boolean {
  return new Date(iso).getTime() < new Date("2026-10-29T02:30:00.000Z").getTime();
}

/* ------------------------------- drawer ------------------------------- */

function ProjectDrawer({ project, onClose }: { project: DemoProject | null; onClose: () => void }) {
  const { state, dispatch } = useDemo();
  const toast = useToast();

  if (!project)
    return (
      <Drawer open={false} onClose={onClose} title={<span />}>
        {null}
      </Drawer>
    );
  const partner = state.partners.find((p) => p.id === project.partnerId);
  const cycle = state.cycles.find((c) => c.id === project.cycleId);

  return (
    <Drawer
      open
      onClose={onClose}
      title={project.name}
      sub={
        <span className="hstack hstack-wrap" style={{ gap: 8 }}>
          <ProjectBadge status={project.status} />
          <Badge tone="outline">{PROJECT_SUPPORT_LABELS[project.projectSupport]}</Badge>
          {partner ? <Link href={`/demo/partners/${partner.id}`}>{partner.name}</Link> : null}
          {cycle ? <StageBadge stage={cycle.stage} /> : null}
        </span>
      }
      actions={null}
      footer={
        <select
          aria-label="Change project status"
          className="input"
          style={{ maxWidth: 190 }}
          value={project.status}
          onChange={(e) => {
            dispatch({
              type: "SET_PROJECT_STATUS",
              projectId: project.id,
              status: e.target.value as ProjectStatus,
            });
            toast.ok("Status updated", PROJECT_STATUS_LABELS[e.target.value as ProjectStatus]);
          }}
        >
          {Object.entries(PROJECT_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      }
    >
      <section aria-labelledby="prd-sum">
        <h3 className="card-title" id="prd-sum" style={{ marginBottom: 8 }}>
          Summary
        </h3>
        <dl className="kv" style={{ gridTemplateColumns: "130px 1fr" }}>
          <div style={{ display: "contents" }}>
            <dt>Owner</dt>
            <dd>{project.owner}</dd>
          </div>
          <div style={{ display: "contents" }}>
            <dt>Timeline</dt>
            <dd>
              {friendlyDate(project.startDate)} → {friendlyDate(project.endDate)}
            </dd>
          </div>
          <div style={{ display: "contents" }}>
            <dt>Progress</dt>
            <dd>{project.progress}% (demo figure)</dd>
          </div>
          <div style={{ display: "contents" }}>
            <dt>Next milestone</dt>
            <dd>{project.nextMilestone ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="prd-ms">
        <h3 className="card-title" id="prd-ms" style={{ marginBottom: 10 }}>
          Milestone timeline
        </h3>
        {project.milestones.length === 0 ? (
          <EmptyState
            icon="kanban"
            title="No milestones yet"
            description="Milestones appear here as the project is scoped."
          />
        ) : (
          <div className="ms-track">
            {project.milestones.map((m) => (
              <div key={m.id} className="ms-item">
                <span className={`ms-dot ${m.status}`} aria-hidden="true" />
                <span className={`ms-name${m.status === "DONE" ? " done" : ""}`}>{m.name}</span>
                <span className="muted tiny nowrap">{friendlyDate(m.dueDate)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="prd-items">
        <h3 className="card-title" id="prd-items" style={{ marginBottom: 8 }}>
          Action items
        </h3>
        {project.actionItems.length === 0 ? (
          <p className="muted tiny">No open action items on this project.</p>
        ) : (
          <div className="stack-xs">
            {project.actionItems.map((a) => (
              <label
                key={a.id}
                className="checkrow"
                style={{ alignItems: "flex-start", cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  className="checkbox"
                  style={{ marginTop: 3 }}
                  checked={a.done}
                  onChange={() =>
                    dispatch({ type: "TOGGLE_PROJECT_ITEM", projectId: project.id, itemId: a.id })
                  }
                />
                <span
                  style={{
                    flex: 1,
                    textDecoration: a.done ? "line-through" : "none",
                    color: a.done ? "var(--ink-4)" : undefined,
                  }}
                >
                  {a.text}
                  <span className="muted tiny" style={{ display: "block" }}>
                    {a.owner} · due {friendlyDate(a.dueDate)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
      </section>

      <p className="muted tiny">
        Project data lives only in this demo session — no persistence, no real obligation tracking
        yet.
      </p>
    </Drawer>
  );
}

/* --------------------------- create project --------------------------- */

function CreateProjectModal({
  open,
  onClose,
  cycles,
}: {
  open: boolean;
  onClose: () => void;
  cycles: { id: string; partnerId: string }[];
}) {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const partnersById = indexById(state.partners);
  const [cycleId, setCycleId] = useState("");
  const [name, setName] = useState("");
  const [ps, setPs] = useState(PROJECT_SUPPORTS[0].code);
  const [owner, setOwner] = useState("Nadia Prameswari");
  const [end, setEnd] = useState("2026-12-15");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCycleId(cycles[0]?.id ?? "");
      setName("");
      setErr(null);
    }
  }, [open, cycles]);

  function save() {
    const cycle = state.cycles.find((c) => c.id === cycleId);
    if (!cycle) {
      setErr("Pick a partnership cycle for this project.");
      return;
    }
    if (name.trim().length < 5) {
      setErr("Project name must be at least 5 characters.");
      return;
    }
    if (Number.isNaN(new Date(end).getTime())) {
      setErr("Enter a valid end date.");
      return;
    }
    dispatch({
      type: "ADD_PROJECT",
      project: {
        partnerId: cycle.partnerId,
        cycleId: cycle.id,
        name: name.trim(),
        projectSupport: ps,
        owner,
        startDate: new Date().toISOString(),
        endDate: new Date(end).toISOString(),
      },
    });
    onClose();
    toast.ok(
      "Project created (demo)",
      "A synthetic implementation project was added to this session.",
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New project (demo)"
      description="Implementation projects attach to close-deal or implementation-stage cycles. The record lives only in demo session state."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="check" onClick={save}>
            Create project
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
      <Field label="Partnership cycle" htmlFor="npj-cycle" required>
        <select
          id="npj-cycle"
          className="input"
          value={cycleId}
          onChange={(e) => setCycleId(e.target.value)}
        >
          {cycles.map((c) => (
            <option key={c.id} value={c.id}>
              {partnersById.get(c.partnerId)?.name ?? c.partnerId}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Project name" htmlFor="npj-name" required>
        <input
          id="npj-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Campus Demo Day 2026"
          maxLength={120}
        />
      </Field>
      <div className="f-grid">
        <Field label="Project Support" htmlFor="npj-ps">
          <select
            id="npj-ps"
            className="input"
            value={ps}
            onChange={(e) => setPs(e.target.value as typeof ps)}
          >
            {PROJECT_SUPPORTS.map((p) => (
              <option key={p.code} value={p.code}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Owner" htmlFor="npj-owner">
          <select
            id="npj-owner"
            className="input"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          >
            <option>Nadia Prameswari</option>
            <option>Raka Wijaya</option>
            <option>Bimo Saputra</option>
            <option>Sinta Maheswari</option>
          </select>
        </Field>
      </div>
      <Field label="End date" htmlFor="npj-end" required>
        <input
          id="npj-end"
          type="date"
          className="input"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
      </Field>
    </Modal>
  );
}
