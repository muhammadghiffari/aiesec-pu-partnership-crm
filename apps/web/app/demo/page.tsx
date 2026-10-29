import type { Metadata } from "next";
import Link from "next/link";
import { LpReveal } from "./LpReveal";

export const metadata: Metadata = {
  title: "AIESEC in PU Partnership CRM — Stakeholder Preview",
  description:
    "Explore how AIESEC in President University manages its end-to-end partnership lifecycle — from prospect research through LoA signing and post-survey. Synthetic demo data only.",
  robots: { index: false, follow: false },
};

/* ------------------------------------------------------------------ *
 * Inline SVG icon atoms (no external dep, no bundle overhead).
 * ------------------------------------------------------------------ */
function Ico({ d, size = 18, className }: { d: string; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

function Check() {
  return (
    <svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * Static KPI preview (synthetic numbers aligned with seed data).
 * ------------------------------------------------------------------ */
const KPIS = [
  { label: "Active Partners", value: "14", delta: "+3 this term" },
  { label: "Pipeline Value", value: "Rp 182 jt", delta: "8 proposals open" },
  { label: "Pending Reviews", value: "4", delta: "Due in 7 days" },
  { label: "LoA Signed", value: "6", delta: "2 in progress" },
] as const;

/* ------------------------------------------------------------------ *
 * Lifecycle stages — the five official ESSM stages.
 * ------------------------------------------------------------------ */
const STAGES = [
  {
    n: "01",
    icon: "M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z",
    label: "Prospecting",
    desc: "AI-assisted fit scoring surfaces high-alignment candidates from public registries. BD team reviews scores and makes the Proceed decision.",
    href: "/demo/research",
  },
  {
    n: "02",
    icon: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.06 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 17Z",
    label: "Sales Process",
    desc: "Structured outreach with approved templates, meeting logs, and rate-card proposals. Every send is manually confirmed.",
    href: "/demo/outreach",
  },
  {
    n: "03",
    icon: "M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 0 0 1.946-.806 3.42 3.42 0 0 1 4.438 0 3.42 3.42 0 0 0 1.946.806 3.42 3.42 0 0 1 3.138 3.138 3.42 3.42 0 0 0 .806 1.946 3.42 3.42 0 0 1 0 4.438 3.42 3.42 0 0 0-.806 1.946 3.42 3.42 0 0 1-3.138 3.138 3.42 3.42 0 0 0-1.946.806 3.42 3.42 0 0 1-4.438 0 3.42 3.42 0 0 0-1.946-.806 3.42 3.42 0 0 1-3.138-3.138 3.42 3.42 0 0 0-.806-1.946 3.42 3.42 0 0 1 0-4.438 3.42 3.42 0 0 0 .806-1.946 3.42 3.42 0 0 1 3.138-3.138Z",
    label: "Close Deal",
    desc: "Separation-of-duties LoA workflow: submitter drafts, a different authorised BD Lead approves. No self-approval is possible.",
    href: "/demo/loa",
  },
  {
    n: "04",
    icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 0 2-2h2a2 2 0 0 0 2 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
    label: "Implementation",
    desc: "Project milestones, benefit delivery tracker, financial and in-kind receipt logging with evidence uploads.",
    href: "/demo/projects",
  },
  {
    n: "05",
    icon: "M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586Z",
    label: "Post Survey",
    desc: "Dispatch tracker for the official BD Post-Partnership Scorecard. Link-send status logged; completion tracked without storing response PII.",
    href: "/demo/reports",
  },
] as const;

/* ------------------------------------------------------------------ *
 * Feature cards.
 * ------------------------------------------------------------------ */
const FEATURES = [
  {
    icon: "M13 2L3 14h9l-1 8 10-12h-9l1-8Z",
    title: "Rate Card & Proposals",
    desc: "Structured benefit catalog with package bundles. Proposal line items are value-snapshotted so later catalog edits never rewrite historical records.",
    bullets: [
      "Multi-tier packages (Bronze / Silver / Gold)",
      "IDR value snapshot at send time",
      "In-kind vs. cash tracking",
    ],
  },
  {
    icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z",
    title: "Built-in Safeguards",
    desc: "Business rules are enforced at the service layer — the UI cannot bypass them.",
    bullets: [
      "DNC contact flag blocks outreach",
      "Self-approval of LoA is blocked",
      "Audit trail on every mutation",
    ],
  },
  {
    icon: "M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 0 2-2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 0-2-2V9m0 0h18",
    title: "ESSM-Aligned Data Model",
    desc: "Ten industry categories, four Market Research alignment scores, ESSM Project Support values, and a Merchandise Tracker — all first-class entities.",
    bullets: [
      "ESSM industry & project-support enums",
      "Market Research alignment (1–5 each)",
      "Merchandise Tracker module",
    ],
  },
] as const;

/* ------------------------------------------------------------------ *
 * Safeguard strips.
 * ------------------------------------------------------------------ */
const GUARDS = [
  {
    icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z",
    label: "No Auto-Send",
    desc: "Every outreach send is manually confirmed by the BD team member. Templates require prior approval.",
  },
  {
    icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0M22 21v-2a4 4 0 0 1-3 3.87M16 3.13a4 4 0 0 1 0 7.75",
    label: "SoD on LoA",
    desc: "Submitter and approver must be different users. CRM Lead role controls both, but separation-of-duties is enforced by the service.",
  },
  {
    icon: "M18 20V10M12 20V4M6 20v-6",
    label: "Immutable Audit",
    desc: "Every gate override, proposal send, and receipt record writes an append-only audit event with actor and timestamp.",
  },
  {
    icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016Z",
    label: "AI as Assist Only",
    desc: "The AI model never sends messages, makes final alignment decisions, or signs documents. Human confirmation is always the last step.",
  },
] as const;

/* ================================================================== *
 * Page component
 * ================================================================== */
export default function DemoLandingPage() {
  return (
    <div className="lp">
      {/* ---- nav ---- */}
      <nav className="lp-nav" aria-label="Site navigation">
        <div className="lp-wrap">
          <a href="/demo" className="lp-brand">
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: "linear-gradient(140deg,#22d3ee,#6366f1 70%,#a78bfa)",
                display: "grid",
                placeItems: "center",
                color: "#050813",
                fontWeight: 800,
                fontSize: 12,
                flexShrink: 0,
                boxShadow:
                  "0 0 0 1px rgba(255,255,255,.14) inset,0 6px 18px -6px rgba(34,211,238,.5)",
              }}
              aria-hidden="true"
            >
              AP
            </span>
            <span>
              <strong
                style={{ display: "block", fontSize: 13.5, fontWeight: 650, color: "var(--ink)" }}
              >
                AIESEC in PU
              </strong>
              <small>Partnership CRM</small>
            </span>
          </a>

          <div className="lp-links">
            {STAGES.slice(0, 3).map((s) => (
              <Link key={s.n} href={s.href}>
                {s.label}
              </Link>
            ))}
          </div>

          <Link href="/demo/dashboard" className="btn btn-primary" style={{ marginLeft: "auto" }}>
            Open Dashboard
          </Link>
        </div>
      </nav>

      {/* ---- hero ---- */}
      <section className="lp-hero lp-reveal">
        <div className="lp-wrap">
          <p className="lp-pill">
            <b>PREVIEW</b>
            Presentation prototype · Synthetic data only
          </p>

          <h1 className="lp-h1">
            Partnership pipeline,
            <br />
            <span className="grad">end to end.</span>
          </h1>

          <p className="lp-lead">
            AIESEC in President University's Partnership CRM tracks every deal from prospect
            research through LoA signing to post-survey — with built-in business-rule safeguards and
            an ESSM-aligned data model.
          </p>

          <div className="lp-ctas">
            <Link href="/demo/dashboard" className="btn btn-primary">
              Open the dashboard
            </Link>
            <Link href="/demo/partners" className="btn btn-secondary">
              Browse partners
            </Link>
          </div>

          <p className="lp-note">
            All data is synthetic. No real partner information, PII, or production service is
            involved.
          </p>
        </div>
      </section>

      {/* ---- product preview ---- */}
      <div className="lp-wrap">
        <div className="lp-preview lp-reveal">
          <div className="lp-screen">
            <div className="lp-screen-bar">
              <i aria-hidden="true" />
              <i aria-hidden="true" />
              <i aria-hidden="true" />
              <span>localhost:3000/demo/dashboard</span>
            </div>
            <div className="lp-screen-bd">
              {/* KPI strip */}
              <div className="lp-kpis">
                {KPIS.map((k) => (
                  <div key={k.label} className="lp-kpi">
                    <div className="lp-kpi-label">{k.label}</div>
                    <div className="lp-kpi-val">{k.value}</div>
                    <div className="lp-kpi-delta">{k.delta}</div>
                  </div>
                ))}
              </div>

              {/* Pipeline preview rows */}
              <div className="lp-split">
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 650,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--ink-4)",
                      marginBottom: 10,
                    }}
                  >
                    Active Pipeline
                  </div>
                  {[
                    {
                      name: "Demo Acme Logistics",
                      stage: "Sales Process",
                      pct: 60,
                      val: "Rp 28 jt",
                    },
                    {
                      name: "Bukit Sintetis Health",
                      stage: "Close Deal",
                      pct: 80,
                      val: "Rp 42 jt",
                    },
                    { name: "Citra Demo Edu", stage: "Prospecting", pct: 25, val: "Rp 18 jt" },
                    {
                      name: "Demo Nusa Finance",
                      stage: "Implementation",
                      pct: 95,
                      val: "Rp 55 jt",
                    },
                  ].map((row) => (
                    <div key={row.name} className="lp-prow">
                      <div className="lp-pname">{row.name}</div>
                      <div
                        style={{
                          display: "flex",
                          height: 6,
                          borderRadius: 4,
                          background: "rgba(148,163,196,.1)",
                          overflow: "hidden",
                          flex: 1,
                        }}
                      >
                        <div
                          style={{
                            width: `${row.pct}%`,
                            background: "linear-gradient(90deg,#22d3ee,#a78bfa)",
                            borderRadius: 4,
                          }}
                        />
                      </div>
                      <div className="lp-pval">{row.val}</div>
                    </div>
                  ))}
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 650,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--ink-4)",
                      marginBottom: 10,
                    }}
                  >
                    Recent Activity
                  </div>
                  {[
                    { label: "LoA signed — Demo Nusa Finance", time: "2h ago", color: "#34d399" },
                    {
                      label: "Proposal sent — Bukit Sintetis Health",
                      time: "Yesterday",
                      color: "#22d3ee",
                    },
                    {
                      label: "Meeting logged — Demo Acme Logistics",
                      time: "2d ago",
                      color: "#a78bfa",
                    },
                    {
                      label: "Research score updated — Citra Demo Edu",
                      time: "3d ago",
                      color: "#fbbf24",
                    },
                  ].map((ev) => (
                    <div
                      key={ev.label}
                      style={{
                        display: "flex",
                        gap: 10,
                        padding: "8px 0",
                        borderBottom: "1px solid var(--line)",
                        fontSize: 12,
                        alignItems: "flex-start",
                      }}
                    >
                      <div
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: ev.color,
                          marginTop: 5,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1, color: "var(--ink-2)" }}>{ev.label}</div>
                      <div style={{ color: "var(--ink-4)", flexShrink: 0 }}>{ev.time}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ---- lifecycle stages ---- */}
        <section className="lp-section lp-reveal" aria-labelledby="lp-stages-hd">
          <p className="lp-eyebrow">End-to-end lifecycle</p>
          <h2 className="lp-h2" id="lp-stages-hd">
            Five stages. One system.
          </h2>
          <p className="lp-sub">
            The CRM enforces the official ESSM pipeline: no shortcuts, no workarounds — and every
            step is auditable.
          </p>

          <div className="lp-flow">
            {STAGES.map((s) => (
              <a key={s.n} href={s.href} className="lp-step">
                <div className="lp-step-n">STAGE {s.n}</div>
                <div className="lp-step-ico">
                  <Ico d={s.icon} size={17} />
                </div>
                <h3>{s.label}</h3>
                <p>{s.desc}</p>
                <span className="lp-go">Explore →</span>
              </a>
            ))}
          </div>
        </section>

        {/* ---- features ---- */}
        <section className="lp-section lp-reveal" aria-labelledby="lp-feat-hd">
          <p className="lp-eyebrow">Capabilities</p>
          <h2 className="lp-h2" id="lp-feat-hd">
            What the CRM handles
          </h2>

          <div className="lp-features">
            {FEATURES.map((f) => (
              <div key={f.title} className="lp-feature">
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    background:
                      "linear-gradient(140deg,rgba(34,211,238,.16),rgba(167,139,250,.16))",
                    border: "1px solid var(--line-strong)",
                    display: "grid",
                    placeItems: "center",
                    color: "var(--teal-strong)",
                  }}
                >
                  <Ico d={f.icon} size={17} />
                </div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
                <ul>
                  {f.bullets.map((b) => (
                    <li key={b}>
                      <Check />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* safeguard strip */}
          <div className="lp-guard">
            {GUARDS.map((g) => (
              <div key={g.label}>
                <b>
                  <Ico d={g.icon} size={15} />
                  {g.label}
                </b>
                <span>{g.desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ---- closing CTA ---- */}
        <div className="lp-cta lp-reveal">
          <div>
            <h2>Ready to explore the prototype?</h2>
            <p>
              Walk through a full partnership cycle — from research and outreach to proposal, LoA
              signing, and post-survey dispatch — with synthetic AIESEC PU data.
            </p>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/demo/dashboard" className="btn btn-primary">
              Open dashboard
            </Link>
            <Link href="/demo/research" className="btn btn-secondary">
              Start with Research
            </Link>
          </div>
        </div>

        {/* ---- footer ---- */}
        <footer className="lp-foot">
          <div className="lp-wrap" style={{ padding: 0 }}>
            <div>
              <strong>AIESEC in President University</strong>
              <br />
              Partnership CRM — Presentation prototype
            </div>
            <div style={{ textAlign: "right" }}>
              Synthetic data only · Not for production use
              <br />
              <span>BD Post-Survey: </span>
              <a
                href="https://s.aiesec.or.id/AIESECPartnershipSurvey-BD"
                target="_blank"
                rel="noopener noreferrer"
              >
                s.aiesec.or.id/AIESECPartnershipSurvey-BD
              </a>
            </div>
          </div>
        </footer>
      </div>

      <LpReveal />
    </div>
  );
}
