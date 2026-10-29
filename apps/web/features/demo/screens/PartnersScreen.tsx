"use client";

/**
 * /demo/partners — partner directory with live search, ESSM industry filter,
 * lifecycle-stage and relationship filters, filter chips, sort and
 * pagination. Rows link to partner profiles; Add partner opens the real
 * create flow (/demo/partners/new).
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { ESSM_INDUSTRIES } from "../../partners/types";
import { RelationshipBadge, StageBadge, VerificationBadge } from "../components/badges";
import { friendlyDate, isPast } from "../format";
import { allRollups } from "../selectors";
import { useDemo } from "../store";
import type { IndustryCode, LifecycleStage, RelationshipStatus } from "../types";
import { RELATIONSHIP_LABELS } from "../types";
import { Icon } from "../ui/Icon";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  cn,
  EmptyState,
  PageHeader,
  Pagination,
} from "../ui/primitives";

const PAGE_SIZE = 8;

type SortKey = "name" | "recent" | "value";

export function PartnersScreenInner() {
  const { state } = useDemo();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [industry, setIndustry] = useState<IndustryCode | "">(
    (searchParams.get("industry") as IndustryCode) || "",
  );
  const [stage, setStage] = useState<LifecycleStage | "">(
    (searchParams.get("stage") as LifecycleStage) || "",
  );
  const [rel, setRel] = useState<RelationshipStatus | "">(
    (searchParams.get("status") as RelationshipStatus) || "",
  );
  const [sort, setSort] = useState<SortKey>("recent");
  const [page, setPage] = useState(1);

  const rollups = useMemo(() => allRollups(state), [state]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = state.partners.filter((p) => {
      const r = rollups.get(p.id);
      if (q) {
        const hay =
          `${p.name} ${p.websiteDomain ?? ""} ${p.officialEmail ?? ""} ${p.ownerName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (industry && p.industry !== industry) return false;
      if (stage && r?.cycle?.stage !== stage) return false;
      if (rel && r?.relationship !== rel) return false;
      return true;
    });
    rows.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "value") {
        const av = rollups.get(a.id)?.cycle?.agreedValueIdr ?? 0;
        const bv = rollups.get(b.id)?.cycle?.agreedValueIdr ?? 0;
        return bv - av;
      }
      return b.lastActivityAt.localeCompare(a.lastActivityAt);
    });
    return rows;
  }, [state.partners, rollups, query, industry, stage, rel, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const activeChips: { key: string; label: string; clear: () => void }[] = [];
  if (query.trim())
    activeChips.push({
      key: "q",
      label: `“${query.trim()}”`,
      clear: () => {
        setQuery("");
        setPage(1);
      },
    });
  if (industry)
    activeChips.push({
      key: "i",
      label: ESSM_INDUSTRIES.find((i) => i.code === industry)?.label ?? industry,
      clear: () => {
        setIndustry("");
        setPage(1);
      },
    });
  if (stage)
    activeChips.push({
      key: "s",
      label: stage
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/^\w/, (c) => c.toUpperCase()),
      clear: () => {
        setStage("");
        setPage(1);
      },
    });
  if (rel)
    activeChips.push({
      key: "r",
      label: RELATIONSHIP_LABELS[rel],
      clear: () => {
        setRel("");
        setPage(1);
      },
    });

  function resetAll() {
    setQuery("");
    setIndustry("");
    setStage("");
    setRel("");
    setPage(1);
  }

  const totalPartners = state.partners.length;

  return (
    <div className="page">
      <PageHeader
        title="Partners"
        description="Partner master for the BD book. Search, filter and open a partner profile to work on verification, outreach and the cycle."
        actions={
          <ButtonLink href="/demo/partners/new" variant="primary" icon="plus">
            Add partner
          </ButtonLink>
        }
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
          <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200 }}>
            <Icon name="search" size={14} className="sr-only" />
            <input
              className="input"
              style={{ paddingLeft: 30 }}
              type="search"
              placeholder="Search name, domain, official email or owner…"
              aria-label="Search partners"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
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
            style={{ maxWidth: 220 }}
            aria-label="Filter by industry"
            value={industry}
            onChange={(e) => {
              setIndustry(e.target.value as IndustryCode | "");
              setPage(1);
            }}
          >
            <option value="">All industries</option>
            {ESSM_INDUSTRIES.map((i) => (
              <option key={i.code} value={i.code}>
                {i.label}
              </option>
            ))}
          </select>

          <select
            className="input"
            style={{ maxWidth: 200 }}
            aria-label="Filter by lifecycle stage"
            value={stage}
            onChange={(e) => {
              setStage(e.target.value as LifecycleStage | "");
              setPage(1);
            }}
          >
            <option value="">All stages</option>
            <option value="PROSPECTING">Prospecting</option>
            <option value="SALES_PROCESS">Sales Process</option>
            <option value="CLOSE_DEAL">Close Deal</option>
            <option value="PARTNERSHIP_IMPLEMENTATION">Partnership Implementation</option>
            <option value="POST_SURVEY">Post Survey</option>
          </select>

          <select
            className="input"
            style={{ maxWidth: 180 }}
            aria-label="Filter by partnership status"
            value={rel}
            onChange={(e) => {
              setRel(e.target.value as RelationshipStatus | "");
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="PROSPECT">Prospect</option>
            <option value="ACTIVE">Active partner</option>
            <option value="BREAK">On break</option>
            <option value="FINISH">Finished</option>
          </select>

          <select
            className="input"
            style={{ maxWidth: 170 }}
            aria-label="Sort order"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="recent">Sort: recent activity</option>
            <option value="name">Sort: name A→Z</option>
            <option value="value">Sort: agreed value</option>
          </select>
        </div>

        {activeChips.length > 0 ? (
          <div
            className="chips"
            style={{ padding: "10px 18px", borderBottom: "1px solid var(--line)" }}
          >
            <span className="muted tiny" style={{ alignSelf: "center" }}>
              Active filters:
            </span>
            {activeChips.map((c) => (
              <span className="chip" key={c.key}>
                {c.label}
                <button type="button" aria-label={`Clear filter ${c.label}`} onClick={c.clear}>
                  <Icon name="x" size={11} />
                </button>
              </span>
            ))}
            <button
              type="button"
              className="btn btn-link"
              style={{ fontSize: 12 }}
              onClick={resetAll}
            >
              Reset all
            </button>
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <EmptyState
            icon={totalPartners === 0 ? "briefcase" : "search"}
            title={totalPartners === 0 ? "No partners yet" : "No partners match these filters"}
            description={
              totalPartners === 0
                ? "Add the first partner record to start the demo book."
                : "Adjust the search text or clear the filters to see records."
            }
            action={
              totalPartners === 0 ? (
                <ButtonLink href="/demo/partners/new" variant="primary" size="sm" icon="plus">
                  Add partner
                </ButtonLink>
              ) : (
                <Button size="sm" onClick={resetAll}>
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className="tbl-scroll">
              <table className="tbl">
                <caption className="sr-only">
                  {filtered.length} partner record(s) in the demo directory
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Partner</th>
                    <th scope="col">Category</th>
                    <th scope="col">PIC / contact</th>
                    <th scope="col">Status</th>
                    <th scope="col">Lifecycle stage</th>
                    <th scope="col">Last activity</th>
                    <th scope="col">Next action</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((p) => {
                    const r = rollups.get(p.id);
                    const primary = r?.contacts[0];
                    const next = r?.cycle?.nextAction;
                    return (
                      <tr key={p.id} className="t-row row-click row-stretch">
                        <td>
                          <Link
                            href={`/demo/partners/${p.id}`}
                            className="t-strong row-open"
                            aria-label={`Open partner profile for ${p.name}`}
                          >
                            {p.name}
                          </Link>
                          <span className="t-sub">{p.websiteDomain ?? "no domain on file"}</span>
                        </td>
                        <td>{industryLabelShort(p.industry)}</td>
                        <td>
                          {primary ? (
                            <>
                              <span className="t-strong" style={{ fontWeight: 520 }}>
                                {primary.name}
                              </span>
                              <span className="t-sub hstack" style={{ gap: 6 }}>
                                <VerificationBadge status={primary.identityVerification} />
                                {primary.dnc?.active ? (
                                  <Badge tone="red" icon="ban">
                                    DNC
                                  </Badge>
                                ) : null}
                              </span>
                            </>
                          ) : (
                            <span className="muted">No contact yet</span>
                          )}
                        </td>
                        <td>{r ? <RelationshipBadge status={r.relationship} /> : "—"}</td>
                        <td>
                          {r?.cycle ? (
                            <StageBadge stage={r.cycle.stage} />
                          ) : (
                            <Badge tone="outline">No cycle</Badge>
                          )}
                        </td>
                        <td className="muted nowrap">{friendlyDate(p.lastActivityAt)}</td>
                        <td>
                          {next ? (
                            <>
                              <span className="t-strong" style={{ fontWeight: 540 }}>
                                {next.label}
                              </span>
                              <span
                                className={cn("t-sub", isPast(next.dueDate) && "strong")}
                                style={isPast(next.dueDate) ? { color: "var(--red)" } : undefined}
                              >
                                due {friendlyDate(next.dueDate)}
                              </span>
                            </>
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
            <Pagination
              page={safePage}
              pages={pages}
              total={filtered.length}
              pageSize={PAGE_SIZE}
              onPage={setPage}
            />
          </>
        )}
      </Card>
    </div>
  );
}

function industryLabelShort(code: IndustryCode): string {
  return ESSM_INDUSTRIES.find((i) => i.code === code)?.label ?? code;
}

export function PartnersScreen() {
  return (
    <Suspense fallback={<PartnersSkeleton />}>
      <PartnersScreenInner />
    </Suspense>
  );
}

function PartnersSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-live="polite">
      <div className="skt" style={{ height: 30, width: 240 }} />
      <div className="skt" style={{ height: 420 }} />
    </div>
  );
}
