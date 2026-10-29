"use client";

/**
 * Small data-viz primitives backed by CSS/SVG only (no charting library
 * exists in the repo, and none is added): pipeline bars, a generic bar list
 * and an 8-week activity trend line.
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

export function TrendArea({ points, ariaLabel }: { points: Point[]; ariaLabel?: string }) {
  const W = 640;
  const H = 140;
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
            <stop offset="0%" stopColor="#0d7d71" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#0d7d71" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={PAD_X}
            x2={W - PAD_X}
            y1={y(max * f)}
            y2={y(max * f)}
            stroke="#e4e9ee"
            strokeWidth="1"
          />
        ))}
        <path d={areaPath} fill="url(#demo-trend-fill)" />
        <path
          d={linePath}
          fill="none"
          stroke="#0d7d71"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <g key={p.label}>
            <circle
              cx={x(i)}
              cy={y(p.count)}
              r={3.5}
              fill="#fff"
              stroke="#0d7d71"
              strokeWidth="2"
            />
            <text
              x={x(i)}
              y={y(p.count) - 7}
              textAnchor="middle"
              fontSize="10"
              fill="#67768a"
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
