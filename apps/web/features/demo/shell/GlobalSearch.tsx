"use client";

/**
 * Global demo search: partners, contacts, agreements and projects matched
 * live from the in-memory dataset, navigable with keyboard or pointer.
 * Uses the native <dialog> pattern shared with the other overlays.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { industryLabel } from "../components/badges";
import { useDemo } from "../store";
import { Icon } from "../ui/Icon";

interface Result {
  key: string;
  href: string;
  icon: "briefcase" | "user" | "file-text" | "kanban";
  title: string;
  sub: string;
}

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state } = useDemo();
  const [q, setQ] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return undefined;
    if (open && !el.open) {
      el.showModal();
      setQ("");
      const t = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
    if (!open && el.open) el.close();
    return undefined;
  }, [open]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (e.target === el) onClose();
    };
    el.addEventListener("cancel", onCancel);
    el.addEventListener("click", onClick);
    return () => {
      el.removeEventListener("cancel", onCancel);
      el.removeEventListener("click", onClick);
    };
  }, [onClose]);

  const results = useMemo<Result[]>(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    const out: Result[] = [];
    for (const p of state.partners) {
      const hay = `${p.name} ${p.websiteDomain ?? ""} ${p.officialEmail ?? ""}`.toLowerCase();
      if (hay.includes(query)) {
        out.push({
          key: `p-${p.id}`,
          href: `/demo/partners/${p.id}`,
          icon: "briefcase",
          title: p.name,
          sub: `Partner · ${industryLabel(p.industry)}`,
        });
      }
      if (out.length >= 5) break;
    }
    for (const c of state.contacts) {
      const partner = state.partners.find((p) => p.id === c.partnerId);
      const hay =
        `${c.name} ${c.title ?? ""} ${c.channels.map((ch) => ch.value).join(" ")}`.toLowerCase();
      if (hay.includes(query)) {
        out.push({
          key: `c-${c.id}`,
          href: `/demo/contacts?contact=${c.id}`,
          icon: "user",
          title: c.name,
          sub: `Contact · ${partner?.name ?? ""}`,
        });
      }
      if (out.length >= 8) break;
    }
    for (const a of state.agreements) {
      if (a.number.toLowerCase().includes(query) || a.title.toLowerCase().includes(query)) {
        out.push({
          key: `l-${a.id}`,
          href: "/demo/loa",
          icon: "file-text",
          title: a.number,
          sub: `LoA · ${a.title}`,
        });
      }
    }
    for (const pr of state.projects) {
      if (pr.name.toLowerCase().includes(query)) {
        out.push({
          key: `pr-${pr.id}`,
          href: "/demo/projects",
          icon: "kanban",
          title: pr.name,
          sub: "Project",
        });
      }
    }
    return out.slice(0, 8);
  }, [q, state]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-label="Global demo search"
      style={{
        border: 0,
        borderRadius: 14,
        padding: 0,
        width: "min(520px, calc(100vw - 32px))",
        maxHeight: "70vh",
        marginTop: "12vh",
        overflow: "hidden",
        boxShadow: "0 24px 60px -12px rgba(13,25,38,0.35)",
        color: "var(--ink)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 16px",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <Icon name="search" size={16} />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search partners, contacts, LoAs, projects…"
          aria-label="Search the demo dataset"
          style={{ border: 0, outline: "none", flex: 1, font: "inherit", fontSize: 14 }}
        />
        <kbd
          className="kbd"
          style={{
            fontSize: 10.5,
            border: "1px solid var(--line-strong)",
            borderRadius: 4,
            padding: "0 6px",
          }}
        >
          Esc
        </kbd>
      </div>
      {q.trim() === "" ? (
        <p style={{ padding: "16px", fontSize: 12.5, color: "var(--ink-3)", margin: 0 }}>
          Type to search across the synthetic demo dataset. Results link directly to records.
        </p>
      ) : results.length === 0 ? (
        <p style={{ padding: "16px", fontSize: 12.5, color: "var(--ink-3)", margin: 0 }}>
          No matches for “{q}” in the demo dataset.
        </p>
      ) : (
        <div className="search-results" style={{ padding: 8 }}>
          {results.map((r) => (
            <Link key={r.key} href={r.href} className="search-result" onClick={onClose}>
              <span className="act-ico i-teal">
                <Icon name={r.icon} size={14} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span className="t-strong" style={{ display: "block" }}>
                  {r.title}
                </span>
                <span className="muted tiny">{r.sub}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </dialog>
  );
}
