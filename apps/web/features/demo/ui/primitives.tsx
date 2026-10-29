"use client";

/**
 * Core presentational primitives shared by every demo screen.
 * All class names come from app/demo/styles/*.css.
 */
import Link from "next/link";
import type React from "react";
import { Icon, type IconName } from "./Icon";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------ buttons ------------------------------ */

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "link";

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  className,
  children,
  type = "button",
  ...rest
}: {
  variant?: BtnVariant;
  size?: "md" | "sm";
  icon?: IconName;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        "btn",
        variant === "link" ? "btn-link" : `btn-${variant}`,
        size === "sm" && "btn-sm",
        className,
      )}
      {...rest}
    >
      {icon ? <Icon name={icon} size={size === "sm" ? 13 : 15} /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  icon,
  className,
  style,
  onClick,
  children,
}: {
  href: string;
  variant?: BtnVariant;
  size?: "md" | "sm";
  icon?: IconName;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn("btn", `btn-${variant}`, size === "sm" && "btn-sm", className)}
      style={style}
      onClick={onClick}
    >
      {icon ? <Icon name={icon} size={size === "sm" ? 13 : 15} /> : null}
      {children}
    </Link>
  );
}

/* ------------------------------ badges ------------------------------- */

export type BadgeTone =
  | "neutral"
  | "outline"
  | "teal"
  | "blue"
  | "green"
  | "amber"
  | "red"
  | "violet"
  | "navy";

export function Badge({
  tone = "neutral",
  icon,
  dot = false,
  children,
}: {
  tone?: BadgeTone;
  icon?: IconName;
  dot?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className={`badge b-${tone}`}>
      {icon ? <Icon name={icon} size={11} /> : null}
      {dot ? <span className="badge-dot" /> : null}
      {children}
    </span>
  );
}

/* ------------------------------- card -------------------------------- */

export function Card({
  title,
  sub,
  side,
  children,
  flush = false,
  className,
}: {
  title?: React.ReactNode;
  sub?: React.ReactNode;
  side?: React.ReactNode;
  children: React.ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <section className={cn("card", className)}>
      {title != null || side != null ? (
        <header className="card-hd">
          <div>
            <h2 className="card-title">{title}</h2>
            {sub ? <div className="card-sub">{sub}</div> : null}
          </div>
          {side ? <div className="card-side">{side}</div> : null}
        </header>
      ) : null}
      <div className={flush ? "card-bd card-bd-flush" : "card-bd"}>{children}</div>
    </section>
  );
}

/* ----------------------------- PageHeader ---------------------------- */

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <div className="ph">
      <div className="ph-titles">
        <h1>{title}</h1>
        {description ? <p className="ph-desc">{description}</p> : null}
        {meta ? (
          <div className="hstack hstack-wrap" style={{ marginTop: 8, gap: 8 }}>
            {meta}
          </div>
        ) : null}
      </div>
      {actions ? <div className="ph-actions">{actions}</div> : null}
    </div>
  );
}

/* ------------------------------- fields ------------------------------ */

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="f-row">
      <label className="label" htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="req" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <div className="field-err" role="alert">
          <Icon name="alert" size={12} />
          <span>{error}</span>
        </div>
      ) : hint ? (
        <div className="field-hint">{hint}</div>
      ) : null}
    </div>
  );
}

/* ----------------------------- empty state --------------------------- */

export function EmptyState({
  icon = "inbox",
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-art">
        <Icon name={icon} size={20} />
      </div>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action ? <div style={{ marginTop: 6 }}>{action}</div> : null}
    </div>
  );
}

/* ----------------------------- progress bar -------------------------- */

export function Progress({
  value,
  tone = "ok",
  "aria-label": ariaLabel,
}: {
  value: number;
  tone?: "ok" | "warn" | "red";
  "aria-label"?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-label={ariaLabel ?? `Progress ${clamped}%`}
    >
      <div
        className={`progress-fill${tone === "ok" ? "" : ` ${tone}`}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/* -------------------------------- tabs ------------------------------- */

export function Tabs({
  tabs,
  value,
  onChange,
  ariaLabel,
}: {
  tabs: { id: string; label: string; badge?: string | number }[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          className={cn("tab", value === t.id && "active")}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.badge !== undefined ? (
            <Badge tone={value === t.id ? "teal" : "neutral"}>{t.badge}</Badge>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------- pagination ----------------------------- */

export function Pagination({
  page,
  pages,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <nav className="pagi" aria-label="Pagination">
      <span className="pagi-info">
        {start}–{end} of {total}
      </span>
      <div className="pagi-pages">
        <button
          type="button"
          className="pagi-btn"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <Icon name="chevron-l" size={13} />
        </button>
        {pageNumbers(page, pages).map((n, i) =>
          n === -1 ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: ellipsis slots have no identity
            <span key={`gap-${i}`} className="pagi-info" style={{ padding: "0 4px" }}>
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              className={cn("pagi-btn", n === page && "active")}
              aria-current={n === page ? "page" : undefined}
              onClick={() => onPage(n)}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          className="pagi-btn"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <Icon name="chevron-r" size={13} />
        </button>
      </div>
    </nav>
  );
}

function pageNumbers(page: number, pages: number): number[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: number[] = [1];
  const lo = Math.max(2, page - 1);
  const hi = Math.min(pages - 1, page + 1);
  if (lo > 2) out.push(-1);
  for (let n = lo; n <= hi; n++) out.push(n);
  if (hi < pages - 1) out.push(-1);
  out.push(pages);
  return out;
}

/* ------------------------------ stat card ---------------------------- */

export function StatCard({
  href,
  icon,
  iconTone = "teal",
  label,
  value,
  foot,
}: {
  href?: string;
  icon: IconName;
  iconTone?: "teal" | "blue" | "amber" | "green" | "violet";
  label: string;
  value: React.ReactNode;
  foot?: React.ReactNode;
}) {
  const body = (
    <>
      <div className="stat-top">
        <span className={`stat-ico i-${iconTone}`}>
          <Icon name={icon} size={16} />
        </span>
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-value">{value}</div>
      {foot ? <div className="stat-foot">{foot}</div> : null}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="stat"
        aria-label={`${label}: ${typeof value === "number" ? value : ""}`}
      >
        {body}
      </Link>
    );
  }
  return <div className="stat">{body}</div>;
}

/* ------------------------------ timeline ----------------------------- */

export function Timeline({
  items,
}: {
  items: {
    key: string;
    dot?: "teal" | "gray" | "red" | "amber";
    title: React.ReactNode;
    meta: React.ReactNode;
  }[];
}) {
  return (
    <div className="tl">
      {items.map((it) => (
        <div className="tl-item" key={it.key}>
          <span
            className={cn(
              "tl-dot",
              it.dot === "gray" && "gray",
              it.dot === "red" && "red",
              it.dot === "amber" && "amber",
            )}
          />
          <div className="tl-body">
            <div className="tl-title">{it.title}</div>
            <div className="tl-meta">{it.meta}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------ avatar + initials -------------------------- */

export function Avatar({
  name,
  size = "md",
  hint,
}: {
  name: string;
  size?: "md" | "sm";
  hint?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className={cn("avatar", size === "sm" && "avatar-sm")}
      role="img"
      aria-label={hint ?? name}
      title={hint ?? name}
    >
      {initials || "?"}
    </span>
  );
}

/* --------------------------- segmented control ----------------------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <fieldset className="seg" aria-label={ariaLabel} style={{ border: 0, padding: 2, margin: 0 }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={cn("seg-btn", o.value === value && "active")}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}

/* ------------------------------ key-value ---------------------------- */

export function KeyValue({
  entries,
  columns,
}: {
  entries: [string, React.ReactNode][];
  columns?: string;
}) {
  return (
    <dl className="kv" style={columns ? { gridTemplateColumns: columns } : undefined}>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd>{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------ callouts ----------------------------- */

export function DncBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="dnc-banner" role="alert">
      <Icon name="ban" size={15} />
      <div>{children}</div>
    </div>
  );
}

export function NoteBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="note-banner" role="note">
      <Icon name="info" size={15} />
      <div>{children}</div>
    </div>
  );
}
