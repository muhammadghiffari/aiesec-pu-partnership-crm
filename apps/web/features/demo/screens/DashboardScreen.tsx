"use client";

/**
 * /demo — overview dashboard. Every figure is computed from the live demo
 * dataset; number cards, pipeline rows, activity and task items all link to
 * the corresponding module or record.
 */
import Link from "next/link";
import { IndustryChip, industryLabel, StageBadge } from "../components/badges";
import { friendlyDate, idrCompact, relativeDay } from "../format";
import {
  activityByWeek,
  allRollups,
  dashboardCounts,
  indexById,
  pendingCandidates,
  stageCounts,
  tasksDueSoon,
} from "../selectors";
import { useDemo } from "../store";
import { DonutChart, PipelineBars, TrendArea } from "../ui/charts";
import { Icon } from "../ui/Icon";
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from "../ui/primitives";
import { useToast } from "../ui/toast";

const ACT_TONE: Record<
  string,
  {
    icon:
      | "briefcase"
      | "shield-check"
      | "ban"
      | "calendar"
      | "file-text"
      | "sparkles"
      | "send"
      | "kanban"
      | "pencil";
    tone: string;
  }
> = {
  partner_created: { icon: "briefcase", tone: "i-blue" },
  verified: { icon: "shield-check", tone: "i-green" },
  dnc: { icon: "ban", tone: "i-green" },
  meeting: { icon: "calendar", tone: "i-blue" },
  loa: { icon: "file-text", tone: "i-violet" },
  research: { icon: "sparkles", tone: "i-amber" },
  outreach: { icon: "send", tone: "i-teal" },
  project: { icon: "kanban", tone: "i-teal" },
  stage_change: { icon: "briefcase", tone: "i-blue" },
  edited: { icon: "pencil", tone: "i-blue" },
  contact: { icon: "briefcase", tone: "i-blue" },
};

export function DashboardScreen() {
  const { state, dispatch } = useDemo();
  const toast = useToast();

  const counts = dashboardCounts(state);
  const stages = stageCounts(state);
  const weeks = activityByWeek(state);
  const rollups = allRollups(state);
  const partnersById = indexById(state.partners);
  const pending = pendingCandidates(state.candidates);
  const dueSoon = tasksDueSoon(state.tasks, 14).slice(0, 5);
  const recentPartners = [...state.partners]
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
    .slice(0, 6);
  const recentActivities = [...state.activities]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 7);

  /* Stage distribution for the donut chart. */
  const donutSegments = stages.map((s) => ({
    label: STAGE_LABELS[s.stage],
    value: s.count,
  }));

  return (
    <div className="page">
      <PageHeader
        title={
          <>
            Good morning, <span className="nowrap">Nadia</span>
          </>
        }
        description={
          <>
            Today is the demo date <strong>29 Oct 2026</strong>. Here is where the partnership book
            stands across the five ESSM stages — every figure below links to its source records.
          </>
        }
        actions={
          <>
            <ButtonLink href="/demo/partners/new" variant="primary" icon="plus">
              Add partner
            </ButtonLink>
            <ButtonLink href="/demo/research">Review research queue</ButtonLink>
          </>
        }
      />

      {/* -------- 4-column inset-border metric row -------- */}
      <div className="dash-metrics">
        <div className="metric-cell">
          <Link href="/demo/partners" className="metric-inner" aria-label="Partner records">
            <span className="metric-top">
              <span className="stat-ico i-teal">
                <Icon name="briefcase" size={15} />
              </span>
              <span className="metric-label">Partner records</span>
            </span>
            <span className="metric-value">{counts.partners}</span>
            <span className="metric-foot">
              <span className="up">Live count</span> of the directory
            </span>
          </Link>
        </div>
        <div className="metric-cell">
          <Link
            href="/demo/partners"
            className="metric-inner"
            aria-label="Active partnership cycles"
          >
            <span className="metric-top">
              <span className="stat-ico i-blue">
                <Icon name="zap" size={15} />
              </span>
              <span className="metric-label">Active cycles</span>
            </span>
            <span className="metric-value">{counts.activeCycles}</span>
            <span className="metric-foot">Live sales or delivery motion</span>
          </Link>
        </div>
        <div className="metric-cell">
          <Link
            href="/demo/research"
            className="metric-inner"
            aria-label="Research candidates pending"
          >
            <span className="metric-top">
              <span className="stat-ico i-amber">
                <Icon name="sparkles" size={15} />
              </span>
              <span className="metric-label">Pending reviews</span>
            </span>
            <span className="metric-value">{counts.pendingCandidates}</span>
            <span className="metric-foot">Awaiting human decision</span>
          </Link>
        </div>
        <div className="metric-cell">
          <Link href="/demo/partners" className="metric-inner" aria-label="Follow-ups due (14d)">
            <span className="metric-top">
              <span className="stat-ico i-green">
                <Icon name="clock" size={15} />
              </span>
              <span className="metric-label">Follow-ups due</span>
            </span>
            <span className="metric-value">{counts.followUpsDueSoon}</span>
            <span className="metric-foot">Within the next 14 days</span>
          </Link>
        </div>
      </div>

      {/* -------- 2-column analytics: trend (large) + donut (right) -------- */}
      <div className="dash-analytics">
        <Card
          title="Activity over the last 8 weeks"
          sub="Synthetic events recorded in the demo book (period 5 Sep – 29 Oct 2026)"
          side={
            <ButtonLink href="/demo/reports" size="sm" variant="ghost" icon="chart">
              Reports
            </ButtonLink>
          }
        >
          <TrendArea
            points={weeks.map((w) => ({ label: w.label, count: w.count }))}
            ariaLabel="Weekly activity trend in the demo dataset"
            height={180}
          />
        </Card>

        <Card title="Stage distribution" sub="Partners by current lifecycle stage">
          <DonutChart
            segments={donutSegments}
            ariaLabel="Partner distribution across five ESSM stages"
          />
        </Card>
      </div>

      {/* -------- pipeline + recent activity -------- */}
      <div className="grid-2" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
        <Card
          title="Partnership pipeline"
          sub="Five fixed ESSM lifecycle stages — click a stage to open its filtered directory"
        >
          <PipelineBars
            rows={stages.map((s, i) => ({
              stage: s.stage,
              order: i + 1,
              label: STAGE_LABELS[s.stage],
              count: s.count,
              valueLabel: s.valueIdr ? idrCompact(s.valueIdr) : "no agreed value",
              href: `/demo/partners?stage=${s.stage}`,
            }))}
          />
          <div className="divider" style={{ margin: "14px -2px 12px" }} />
          <div className="hstack" style={{ justifyContent: "space-between" }}>
            <span className="muted tiny">
              Total across stages:{" "}
              <b className="strong">{stages.reduce((n, s) => n + s.count, 0)} partners</b> with a
              cycle
              {state.partners.length - stages.reduce((n, s) => n + s.count, 0) > 0
                ? ` · ${state.partners.length - stages.reduce((n, s) => n + s.count, 0)} without a cycle yet`
                : ""}
            </span>
            <ButtonLink href="/demo/reports" size="sm" variant="ghost" icon="chart">
              Open reports
            </ButtonLink>
          </div>
        </Card>

        <Card title="Recent activity" sub="Latest events across the book">
          <div className="act-list" style={{ margin: "-16px -18px" }}>
            {recentActivities.map((a) => {
              const t = ACT_TONE[a.kind] ??
                ACT_TONE.edited ?? { icon: "pencil" as const, tone: "i-blue" };
              const partner = a.partnerId ? partnersById.get(a.partnerId) : undefined;
              return (
                <Link
                  key={a.id}
                  href={a.href}
                  className="act-item"
                  style={{ textDecoration: "none" }}
                >
                  <span className={`act-ico ${t.tone}`}>
                    <Icon name={t.icon} size={14} />
                  </span>
                  <span className="act-txt trunc" title={a.summary}>
                    {partner ? <b>{partner.name}</b> : <b>{a.actor}</b>} — {a.summary}
                  </span>
                  <span className="act-meta">{relativeDay(a.at)}</span>
                </Link>
              );
            })}
          </div>
        </Card>
      </div>

      {/* -------- 3-column: tasks + partners + research queue -------- */}
      <div className="grid-3">
        <Card
          title="Upcoming follow-ups & tasks"
          sub={`${dueSoon.length} most urgent · due within 14 days`}
          side={
            <ButtonLink href="/demo/partners" size="sm" variant="ghost" icon="arrow-r">
              Directory
            </ButtonLink>
          }
        >
          {dueSoon.length === 0 ? (
            <EmptyState
              icon="check-circle"
              title="No due follow-ups"
              description="Every open task lands here when it is due within two weeks."
            />
          ) : (
            <div>
              {dueSoon.map((t) => {
                const partner = t.partnerId ? partnersById.get(t.partnerId) : undefined;
                return (
                  <div className={`task-row${t.done ? " done" : ""}`} key={t.id}>
                    <input
                      type="checkbox"
                      className="checkbox"
                      aria-label={`Mark '${t.title}' done`}
                      checked={t.done}
                      onChange={() => {
                        dispatch({ type: "TOGGLE_TASK", taskId: t.id });
                        toast.ok("Task marked done", "The dashboard count updates immediately.");
                      }}
                    />
                    <div className="task-txt">
                      <Link href={t.href} className="strong" style={{ textDecoration: "none" }}>
                        {t.title}
                      </Link>
                      <div className="muted tiny">
                        {partner ? `${partner.name} · ` : ""}due {friendlyDate(t.dueDate)}
                      </div>
                    </div>
                    <Badge tone="outline">{t.kind.replaceAll("_", " ").toLowerCase()}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card
          title="Recent partners"
          sub="By latest activity"
          side={
            <ButtonLink href="/demo/partners" size="sm" variant="ghost" icon="arrow-r">
              All partners
            </ButtonLink>
          }
        >
          {recentPartners.length === 0 ? (
            <EmptyState
              icon="briefcase"
              title="No partners yet"
              description="Partner records you add during the demo appear here."
              action={
                <ButtonLink href="/demo/partners/new" size="sm" variant="primary">
                  Add partner
                </ButtonLink>
              }
            />
          ) : (
            <table className="mini-tbl">
              <caption className="sr-only">Recent partners by activity</caption>
              <thead>
                <tr>
                  <th scope="col">Partner</th>
                  <th scope="col">Stage</th>
                  <th scope="col">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {recentPartners.map((p) => {
                  const r = rollups.get(p.id);
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link
                          href={`/demo/partners/${p.id}`}
                          className="strong"
                          style={{ textDecoration: "none" }}
                        >
                          {p.name}
                        </Link>
                        <span className="t-sub">{industryLabel(p.industry)}</span>
                      </td>
                      <td>
                        {r?.cycle ? (
                          <StageBadge stage={r.cycle.stage} />
                        ) : (
                          <Badge tone="outline">No cycle</Badge>
                        )}
                      </td>
                      <td className="muted">{friendlyDate(p.lastActivityAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        <Card
          title="Research review queue"
          sub={`${pending.length} candidates awaiting human decision`}
          side={
            <ButtonLink href="/demo/research" size="sm" variant="ghost" icon="arrow-r">
              Review queue
            </ButtonLink>
          }
        >
          {pending.length === 0 ? (
            <EmptyState
              icon="check-circle"
              title="Queue is clear"
              description="New simulated research candidates will appear here for human accept/reject decisions."
              action={
                <ButtonLink href="/demo/research" size="sm">
                  Open research
                </ButtonLink>
              }
            />
          ) : (
            <div className="stack-md">
              {pending.slice(0, 4).map((c) => (
                <div
                  key={c.id}
                  className="hstack"
                  style={{ justifyContent: "space-between", gap: 10 }}
                >
                  <div style={{ minWidth: 0 }}>
                    <Link
                      href="/demo/research"
                      className="strong"
                      style={{ fontSize: 13, textDecoration: "none" }}
                    >
                      {c.orgName}
                    </Link>
                    <div className="muted tiny trunc" title={c.notes}>
                      {industryLabel(c.industry)} · fit {c.fitScore}/100
                      {c.duplicateOf ? " · possible duplicate" : ""}
                    </div>
                  </div>
                  <IndustryChip industry={c.industry} />
                </div>
              ))}
              <ButtonLink
                href="/demo/research"
                size="sm"
                variant="ghost"
                icon="arrow-r"
                style={{ justifySelf: "start" }}
              >
                Review all {pending.length} candidates
              </ButtonLink>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

const STAGE_LABELS: Record<string, string> = {
  PROSPECTING: "Prospecting",
  SALES_PROCESS: "Sales Process",
  CLOSE_DEAL: "Close Deal",
  PARTNERSHIP_IMPLEMENTATION: "Partnership Implementation",
  POST_SURVEY: "Post Survey",
};
