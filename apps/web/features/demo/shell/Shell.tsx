"use client";

/**
 * CRM application shell for /demo: sidebar (identity + grouped nav + demo
 * user), top bar (breadcrumb, global search, notifications, reset, user menu)
 * and the persistent DEMO MODE banner.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { friendlyDate } from "../format";
import { useDemo } from "../store";
import { Icon, type IconName } from "../ui/Icon";
import { ConfirmDialog, Popover } from "../ui/overlays";
import { Avatar, Button } from "../ui/primitives";
import { useToast } from "../ui/toast";
import { GlobalSearch } from "./GlobalSearch";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Operate",
    items: [
      { href: "/demo", label: "Overview", icon: "overview" },
      { href: "/demo/partners", label: "Partners", icon: "briefcase" },
      { href: "/demo/contacts", label: "Contacts", icon: "users" },
    ],
  },
  {
    label: "Lifecycle",
    items: [
      { href: "/demo/research", label: "Research", icon: "sparkles" },
      { href: "/demo/outreach", label: "Outreach", icon: "send" },
      { href: "/demo/meetings", label: "Meetings", icon: "calendar" },
      { href: "/demo/loa", label: "LoA", icon: "file-text" },
      { href: "/demo/projects", label: "Projects", icon: "kanban" },
    ],
  },
  {
    label: "Insight",
    items: [
      { href: "/demo/reports", label: "Reports", icon: "chart" },
      { href: "/demo/settings", label: "Settings", icon: "settings" },
    ],
  },
];

function pageTitle(pathname: string): { group: string; current: string } {
  const map: [string, string][] = [
    ["/demo/partners/new", "Add partner"],
    ["/demo/partners/", "Partner profile"],
    ["/demo/partners", "Partners"],
    ["/demo/contacts", "Contacts"],
    ["/demo/research", "Research"],
    ["/demo/outreach", "Outreach"],
    ["/demo/meetings", "Meetings"],
    ["/demo/loa", "Letters of Agreement"],
    ["/demo/projects", "Projects"],
    ["/demo/reports", "Reports"],
    ["/demo/settings", "Settings"],
    ["/demo", "Overview"],
  ];
  for (const [prefix, title] of map) {
    if (
      prefix === "/demo/partners/"
        ? pathname.startsWith(prefix)
        : pathname === prefix || (prefix !== "/demo" && pathname.startsWith(`${prefix}/`))
    ) {
      return { group: "AIESEC PU CRM", current: title };
    }
  }
  return { group: "AIESEC PU CRM", current: "Overview" };
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const { group, current } = pageTitle(pathname);
  const unread = state.notifications.filter((n) => !n.read).length;
  const pendingCount = state.candidates.filter((c) => c.reviewStatus === "PENDING").length;
  const partnerCount = state.partners.length;

  function isActive(href: string): boolean {
    if (href === "/demo") return pathname === "/demo";
    return pathname.startsWith(href);
  }

  function doReset() {
    dispatch({ type: "RESET" });
    setConfirmReset(false);
    toast.ok("Demo state reset", "All records restored to the initial synthetic dataset.");
  }

  return (
    <div className="crm" data-density={state.prefs.density}>
      <a className="skip" href="#demo-main">
        Skip to main content
      </a>
      <div className="crm-layout">
        {navOpen ? (
          <button
            type="button"
            className="crm-scrim"
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
          />
        ) : null}

        <aside className={`side${navOpen ? " open" : ""}`} aria-label="Primary">
          <div className="side-brand">
            <span className="side-logo" aria-hidden="true">
              APU
            </span>
            <span className="side-brandtext">
              <strong>AIESEC PU Partnership CRM</strong>
              <span>Business Development workspace</span>
            </span>
          </div>

          <nav className="side-nav">
            {NAV_GROUPS.map((groupDef) => (
              <div key={groupDef.label}>
                <div className="nav-label">{groupDef.label}</div>
                {groupDef.items.map((item) => {
                  const active = isActive(item.href);
                  const badge =
                    item.href === "/demo/partners"
                      ? partnerCount
                      : item.href === "/demo/research" && pendingCount > 0
                        ? pendingCount
                        : undefined;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`nav-item${active ? " active" : ""}`}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setNavOpen(false)}
                    >
                      <Icon name={item.icon} size={16} className="nav-icon" />
                      <span>{item.label}</span>
                      {badge !== undefined ? <span className="nav-count">{badge}</span> : null}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="side-foot">
            <div className="side-user">
              <Avatar name="Nadia Prameswari" />
              <div className="side-user-text">
                <strong>Nadia Prameswari</strong>
                <span>CRM Lead · Demo session</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon="refresh"
              className="side-reset"
              onClick={() => setConfirmReset(true)}
              style={{ justifyContent: "flex-start", color: "#b8c8d6" }}
            >
              Reset demo data
            </Button>
          </div>
        </aside>

        <div className="main-col">
          <header className="topbar">
            <button
              type="button"
              className="iconbtn menu-btn"
              aria-label="Open navigation"
              onClick={() => setNavOpen(true)}
            >
              <Icon name="menu" size={17} />
            </button>
            <nav className="top-crumb" aria-label="Breadcrumb">
              <Link href="/demo">{group}</Link>
              <span
                className="hide-sm"
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <Icon name="chevron-r" size={12} />
                <strong>{current}</strong>
              </span>
            </nav>

            <div className="top-actions">
              <button
                type="button"
                className="search-btn"
                onClick={() => setSearchOpen(true)}
                aria-label="Search across the CRM"
              >
                <Icon name="search" size={14} />
                <span className="search-label">Search partners, contacts…</span>
                <kbd className="kbd">/demo</kbd>
              </button>

              <span
                className="tag-demo"
                title="Prototype mode: every action uses synthetic in-memory data"
              >
                DEMO MODE
              </span>

              <Popover
                ariaLabel="Notifications"
                open={bellOpen}
                onOpenChange={setBellOpen}
                width={330}
                trigger={
                  <button
                    type="button"
                    className="iconbtn"
                    aria-label={`Notifications (${unread} unread)`}
                    aria-haspopup="dialog"
                    aria-expanded={bellOpen}
                    onClick={() => setBellOpen((v) => !v)}
                  >
                    <Icon name="bell" size={16} />
                    {unread > 0 ? <span className="ping" aria-hidden="true" /> : null}
                  </button>
                }
              >
                <div className="menu-hd spread">
                  <span>Notifications</span>
                  {unread > 0 ? (
                    <button
                      type="button"
                      className="btn btn-link"
                      style={{ fontSize: 11.5 }}
                      onClick={() => dispatch({ type: "MARK_NOTIFICATIONS_READ" })}
                    >
                      Mark all read
                    </button>
                  ) : null}
                </div>
                {state.notifications.length === 0 ? (
                  <p className="muted tiny" style={{ padding: "4px 10px 10px" }}>
                    No notifications.
                  </p>
                ) : (
                  state.notifications.slice(0, 6).map((n) => (
                    <Link
                      key={n.id}
                      href={n.href}
                      className={`notif-item${n.read ? " read" : ""}`}
                      onClick={() => setBellOpen(false)}
                    >
                      <span className="dot" aria-hidden="true" />
                      <span>
                        <span className="notif-title">{n.title}</span>
                        {n.body}
                        <span className="act-meta" style={{ display: "block", marginTop: 2 }}>
                          {friendlyDate(n.at)}
                        </span>
                      </span>
                    </Link>
                  ))
                )}
              </Popover>

              <Popover
                ariaLabel="User menu"
                open={userOpen}
                onOpenChange={setUserOpen}
                width={230}
                trigger={
                  <button
                    type="button"
                    className="iconbtn"
                    aria-label="User menu for Nadia Prameswari"
                    aria-haspopup="dialog"
                    aria-expanded={userOpen}
                    onClick={() => setUserOpen((v) => !v)}
                  >
                    <Avatar name="Nadia Prameswari" size="sm" />
                  </button>
                }
              >
                <div style={{ padding: "10px 10px 6px" }}>
                  <b style={{ fontSize: 13 }}>Nadia Prameswari</b>
                  <div className="muted tiny">CRM Lead · TL BD mirror (D-007)</div>
                  <div className="muted tiny" style={{ marginTop: 2 }}>
                    nadia.prameswari@aiesec-demo.example
                  </div>
                </div>
                <div className="menu-sep" />
                <Link
                  href="/demo/settings"
                  className="menu-item"
                  onClick={() => setUserOpen(false)}
                >
                  <Icon name="settings" size={14} /> Prototype settings
                </Link>
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    setUserOpen(false);
                    setConfirmReset(true);
                  }}
                >
                  <Icon name="refresh" size={14} /> Reset demo data
                </button>
                <div className="menu-sep" />
                <p className="muted tiny" style={{ padding: "2px 10px 8px", margin: 0 }}>
                  Authentication is not connected in this prototype.
                </p>
              </Popover>
            </div>
          </header>

          <div className="demo-banner" role="note">
            <Icon name="alert" size={13} />
            <span>
              <strong>Demo mode.</strong> All data is synthetic and held in memory — a refresh
              reseeds the session. No message is ever sent and no document is ever signed.
            </span>
          </div>

          <main className="content" id="demo-main">
            {children}
          </main>
        </div>
      </div>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      {confirmReset ? (
        <ConfirmResetInline onCancel={() => setConfirmReset(false)} onConfirm={doReset} />
      ) : null}
    </div>
  );
}

function ConfirmResetInline({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open
      onClose={onCancel}
      onConfirm={onConfirm}
      title="Reset demo session?"
      message="All in-memory changes — created partners, reviews, drafts, meetings, approvals — will be discarded and the synthetic dataset reseeded. Nothing real is affected."
      confirmLabel="Reset demo data"
    />
  );
}
