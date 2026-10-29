"use client";

/**
 * Small data-viz primitives backed by CSS/SVG only (no charting library
 * exists in the repo, and none is added): pipeline bars, a generic bar list,
 * an 8-week activity trend line, and a donut chart.
 */
import Link from "next/link";

type Point = { label: string; count: number };

/* ------------------------- pipeline bars (5 stages) ------------------- */

export function PipelineBars({
  rows,
}: {
  rows: {
    stage: string;
    order: number;
    label: string;
    count: number;
    valueLabel: string;
    href: string;
  }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="pipe">
      {rows.map((r) => (
        <Link
          key={r.stage}
          href={r.href}
          className="pipe-row"
          aria-label={`${r.label}: ${r.count} partner record(s)`}
        >
          <span className="pipe-name">
            <span className="pipe-n">{r.order}</span>
            {r.label}
          </span>
          <span className="pipe-bar">
            <span
              className="pipe-fill"
              style={{ width: `${Math.max(3, (r.count / max) * 100)}%` }}
            />
          </span>
          <span className="pipe-val">
            {r.count} partner{r.count === 1 ? "" : "s"}
            <small>{r.valueLabel}</small>
          </span>
        </Link>
      ))}
    </div>
  );
}

/* ----------------------------- bar list ------------------------------ */

export function BarList({
  rows,
  tone = "blue",
  emptyText = "No data yet.",
}: {
  rows: { label: string; count: number }[];
  tone?: "blue" | "teal";
  emptyText?: string;
}) {
  if (rows.length === 0) return <p className="muted tiny">{emptyText}</p>;
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar-row" key={r.label}>
          <span className="bar-name" title={r.label}>
            {r.label}
          </span>
          <span className="bar">
            <span
              className={`bar-fill${tone === "teal" ? " t2" : ""}`}
              style={{ width: `${Math.max(4, (r.count / max) * 100)}%` }}
            />
          </span>
          <span className="bar-val">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

/* --------------------------- trend line chart ------------------------ */

export function TrendArea({
  points,
  ariaLabel,
  height = 140,
}: {
  points: Point[];
  ariaLabel?: string;
  height?: number;
}) {
  const W = 640;
  const H = height;
  const PAD_X = 8;
  const PAD_TOP = 14;
  const PAD_BOTTOM = 10;
  const max = Math.max(1, ...points.map((p) => p.count));
  const step = points.length > 1 ? (W - PAD_X * 2) / (points.length - 1) : 0;
  const y = (v: number) => PAD_TOP + (1 - v / max) * (H - PAD_TOP - PAD_BOTTOM);
  const x = (i: number) => PAD_X + i * step;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.count).toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${x(points.length - 1).toFixed(1)},${H - PAD_BOTTOM} L${PAD_X},${H - PAD_BOTTOM} Z`;

  return (
    <div className="trend-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={ariaLabel ?? "Activity trend chart"}
      >
        <defs>
          <linearGradient id="demo-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.01" />
          </linearGradient>
          <filter id="demo-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={PAD_X}
            x2={W - PAD_X}
            y1={y(max * f)}
            y2={y(max * f)}
            stroke="rgba(148,163,196,0.1)"
            strokeWidth="1"
          />
        ))}
        <path d={areaPath} fill="url(#demo-trend-fill)" />
        <path
          d={linePath}
          fill="none"
          stroke="#22d3ee"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#demo-glow)"
          className="trend-line"
        />
        {points.map((p, i) => (
          <g key={p.label}>
            <circle cx={x(i)} cy={y(p.count)} r={5} fill="#22d3ee" opacity="0.18" />
            <circle
              cx={x(i)}
              cy={y(p.count)}
              r={3}
              fill="#0b1020"
              stroke="#22d3ee"
              strokeWidth="2"
            />
            <text
              x={x(i)}
              y={y(p.count) - 9}
              textAnchor="middle"
              fontSize="10"
              fill="#96a1b7"
              fontWeight="600"
            >
              {p.count > 0 ? p.count : ""}
            </text>
          </g>
        ))}
      </svg>
      <div className="trend-x" aria-hidden="true">
        {points.map((p) => (
          <span key={p.label}>{p.label}</span>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------- donut chart --------------------------- */

const DONUT_COLORS = ["#22d3ee", "#a78bfa", "#34d399", "#fbbf24", "#f87171"];

export function DonutChart({
  segments,
  size = 140,
  thickness = 22,
  ariaLabel,
}: {
  segments: { label: string; value: number; color?: string }[];
  size?: number;
  thickness?: number;
  ariaLabel?: string;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return <p className="muted tiny">No data yet.</p>;

  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  let accumulated = 0;
  const arcs = segments.map((seg, i) => {
    const pct = seg.value / total;
    const dashLength = pct * circumference;
    const dashOffset = -accumulated * circumference;
    accumulated += pct;
    return { ...seg, dashLength, dashOffset, color: seg.color ?? DONUT_COLORS[i % 5] };
  });

  return (
    <div className="donut-wrap">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={ariaLabel ?? "Stage distribution"}
      >
        {/* background ring */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(148,163,196,0.1)"
          strokeWidth={thickness}
        />
        {arcs.map((arc) => (
          <circle
            key={arc.label}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={arc.color}
            strokeWidth={thickness}
            strokeDasharray={`${arc.dashLength} ${circumference - arc.dashLength}`}
            strokeDashoffset={arc.dashOffset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: "stroke-dasharray 0.6s ease, stroke-dashoffset 0.6s ease" }}
          />
        ))}
        {/* center label */}
        <text
          x={cx}
          y={cy - 5}
          textAnchor="middle"
          fill="#fff"
          fontSize="22"
          fontWeight="700"
          letterSpacing="-0.03em"
        >
          {total}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#96a1b7" fontSize="10" fontWeight="600">
          total
        </text>
      </svg>
      <div className="donut-legend">
        {arcs.map((arc) => (
          <div className="donut-key" key={arc.label}>
            <i style={{ background: arc.color }} />
            <span className="trunc" title={arc.label}>
              {arc.label}
            </span>
            <b>{arc.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
