"use client";

import { industryLabel } from "../components/badges";
import { idrCompact } from "../format";
/**
 * /demo/reports — presentation reporting over the same live demo dataset.
 * Every figure reconciles with the directory and dashboard counts; the period
 * label is explicit because the dataset is anchored at the demo date.
 */
import {
  activityByWeek,
  allRollups,
  categoryCounts,
  stageCounts,
  tasksDueSoon,
} from "../selectors";
import { useDemo } from "../store";
import { LIFECYCLE_LABELS } from "../types";
import { BarList, PipelineBars, TrendArea } from "../ui/charts";
import { Badge, Card, PageHeader } from "../ui/primitives";

export function ReportsScreen() {
  const { state } = useDemo();

  const stages = stageCounts(state);
  const cats = categoryCounts(state);
  const weeks = activityByWeek(state);
  const rollups = allRollups(state);
  const withCycle = stages.reduce((n, s) => n + s.count, 0);
  const withoutCycle = state.partners.length - withCycle;
  const followUps = tasksDueSoon(state.tasks, 14);

  const relCounts = { ACTIVE: 0, PROSPECT: 0, BREAK: 0, FINISH: 0 } as Record<string, number>;
  for (const [, r] of rollups) relCounts[r.relationship] = (relCounts[r.relationship] ?? 0) + 1;

  return (
    <div className="page">
      <PageHeader
        title="Reports"
        description={
          <>
            Live reads over the demo book, period{" "}
            <strong>1 Sep – 29 Oct 2026 (demo date anchor)</strong>. These numbers are computed from
            the same dataset as the directory — the counts below reconcile 1:1 with directory
            filters.
          </>
        }
        meta={
          <Badge tone="teal" icon="info">
            Reconciles with directory: {state.partners.length} partner records
          </Badge>
        }
      />

      <div className="grid-2" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
        <Card
          title="Pipeline distribution"
          sub="Current cycle stage per partner (partners without a cycle are excluded)"
        >
          <PipelineBars
            rows={stages.map((s, i) => ({
              stage: s.stage,
              order: i + 1,
              label: LIFECYCLE_LABELS[s.stage],
              count: s.count,
              valueLabel: s.valueIdr ? `${idrCompact(s.valueIdr)} agreed` : "no agreed value",
              href: `/demo/partners?stage=${s.stage}`,
            }))}
          />
          <div className="divider" style={{ margin: "14px 0 10px" }} />
          <p className="muted tiny">
            {withCycle} partners have an active cycle record; {withoutCycle} record(s) (e.g. freshly
            accepted research candidates) have no cycle yet and are counted separately in the
            directory.
          </p>
        </Card>

        <Card
          title="Partner-category distribution"
          sub="Across all partner records, by ESSM category"
        >
          <BarList
            rows={cats.map((c) => ({ label: industryLabel(c.code as never), count: c.count }))}
            tone="teal"
          />
          {cats.length < 10 ? (
            <p className="muted tiny" style={{ marginTop: 10 }}>
              {10 - cats.length} of the ten official categories are currently unrepresented in the
              book.
            </p>
          ) : null}
        </Card>
      </div>

      <div className="grid-2">
        <Card
          title="Stage counts (reconciled)"
          sub="The directory's stage filter returns exactly these counts"
        >
          <table className="mini-tbl">
            <caption className="sr-only">Lifecycle stage counts</caption>
            <thead>
              <tr>
                <th scope="col">Stage</th>
                <th scope="col">Partners</th>
                <th scope="col">Agreed value (not revenue)</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((s) => (
                <tr key={s.stage}>
                  <td>{LIFECYCLE_LABELS[s.stage]}</td>
                  <td>{s.count}</td>
                  <td>{s.valueIdr ? idrCompact(s.valueIdr) : "—"}</td>
                </tr>
              ))}
              <tr>
                <td>
                  <b>No cycle yet</b>
                </td>
                <td>{withoutCycle}</td>
                <td>—</td>
              </tr>
              <tr>
                <td>
                  <b>Total partner records</b>
                </td>
                <td>
                  <b>{state.partners.length}</b>
                </td>
                <td>—</td>
              </tr>
            </tbody>
          </table>

          <div className="divider" style={{ margin: "14px 0 12px" }} />
          <div className="f-legend" style={{ marginBottom: 8 }}>
            Relationship status roll-up
          </div>
          <BarList
            rows={[
              { label: "Active partner", count: relCounts.ACTIVE ?? 0 },
              { label: "Prospect", count: relCounts.PROSPECT ?? 0 },
              { label: "On break", count: relCounts.BREAK ?? 0 },
              { label: "Finished", count: relCounts.FINISH ?? 0 },
            ]}
          />
        </Card>

        <div className="stack-lg">
          <Card
            title="Activity trend (8 weeks)"
            sub="Synthetic events per week, 5 Sep – 29 Oct 2026"
          >
            <TrendArea
              points={weeks.map((w) => ({ label: w.label, count: w.count }))}
              ariaLabel="Weekly activity trend"
            />
          </Card>

          <Card
            title="Pending follow-up indicators"
            sub={`${followUps.length} open task(s) due within the next 14 days`}
          >
            {followUps.length === 0 ? (
              <p className="muted tiny">No follow-ups due soon.</p>
            ) : (
              <div className="stack-xs">
                {followUps.map((t) => (
                  <div key={t.id} className="spread" style={{ fontSize: 12.5 }}>
                    <span className="trunc" style={{ maxWidth: 340 }} title={t.title}>
                      {t.title}
                    </span>
                    <Badge tone="amber" icon="clock">
                      {new Date(t.dueDate).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <p className="muted tiny" style={{ maxWidth: "84ch" }}>
        Production reporting (FR-900s print/export story) adds rate-card value vs. actual financial
        and in-kind receipts with evidence proof — explicitly distinct measures. Proposed values
        here are <b>not</b> revenue and are never presented as such.
      </p>
    </div>
  );
}
