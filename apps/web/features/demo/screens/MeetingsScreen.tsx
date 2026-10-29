"use client";

/**
 * /demo/meetings — meeting workspace.
 *
 * Upcoming/past segmentation against the fixed demo date. Detail drawer shows
 * a synthetic Minutes-of-Meeting layout (discussion / decisions / action
 * items with owners and due dates). Completion is gated on minutes existing —
 * "Record outcomes" generates a demo MoM first.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MeetingBadge } from "../components/badges";
import { formatDate, friendlyDate, isPast } from "../format";
import { indexById } from "../selectors";
import { useDemo } from "../store";
import type { DemoMeeting, MeetingKind } from "../types";
import { Icon } from "../ui/Icon";
import { Drawer, Modal } from "../ui/overlays";
import { Badge, Button, Card, EmptyState, Field, PageHeader, Segmented } from "../ui/primitives";
import { useToast } from "../ui/toast";

const KIND_LABELS: Record<MeetingKind, string> = {
  DISCOVERY: "Discovery",
  SALES: "Sales",
  REVIEW: "Review",
  KICKOFF: "Kickoff",
};

type Section = "UPCOMING" | "PAST" | "ALL";

export function MeetingsScreen() {
  const { state } = useDemo();
  const partnersById = indexById(state.partners);
  const [section, setSection] = useState<Section>("UPCOMING");
  const [selected, setSelected] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const meetings = useMemo(() => {
    const past = (m: DemoMeeting) => isPast(m.at) || m.status !== "SCHEDULED";
    return state.meetings
      .filter((m) => (section === "ALL" ? true : section === "UPCOMING" ? !past(m) : past(m)))
      .slice()
      .sort((a, b) =>
        section === "UPCOMING" ? a.at.localeCompare(b.at) : b.at.localeCompare(a.at),
      );
  }, [state.meetings, section]);

  const selectedMeeting = selected ? (state.meetings.find((m) => m.id === selected) ?? null) : null;

  return (
    <div className="page">
      <PageHeader
        title="Meetings"
        description="Sales and delivery meetings across the book. All records are synthetic; completing a meeting requires minutes (MoM) — try it on the upcoming review meeting."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setAddOpen(true)}>
            Add meeting
          </Button>
        }
      />

      <Card
        flush
        title={
          <Segmented
            ariaLabel="Show upcoming or past meetings"
            value={section}
            onChange={(v) => setSection(v as Section)}
            options={[
              { value: "UPCOMING", label: "Upcoming" },
              { value: "PAST", label: "Past" },
              { value: "ALL", label: "All" },
            ]}
          />
        }
      >
        {meetings.length === 0 ? (
          <EmptyState
            icon="calendar"
            title={section === "UPCOMING" ? "No upcoming meetings" : "No past meetings"}
            description="Synthetic meetings you add will appear here by date."
            action={
              <Button size="sm" variant="primary" icon="plus" onClick={() => setAddOpen(true)}>
                Add meeting
              </Button>
            }
          />
        ) : (
          <div>
            {meetings.map((m) => {
              const p = partnersById.get(m.partnerId);
              const overdue = m.status === "SCHEDULED" && isPast(m.at);
              return (
                <button
                  key={m.id}
                  type="button"
                  className="act-item"
                  style={{
                    width: "100%",
                    border: 0,
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onClick={() => setSelected(m.id)}
                >
                  <span className="act-ico i-blue">
                    <Icon name="calendar" size={14} />
                  </span>
                  <span className="act-txt" style={{ minWidth: 0 }}>
                    <span className="strong trunc" style={{ display: "block" }}>
                      {m.title}
                    </span>
                    <span className="muted tiny">
                      {formatDate(m.at, { withTime: true })} · {m.location}
                      {p ? ` · ${p.name}` : ""}
                    </span>
                  </span>
                  <span className="hstack" style={{ gap: 6 }}>
                    <Badge tone="outline">{KIND_LABELS[m.kind]}</Badge>
                    {overdue ? (
                      <Badge tone="amber" icon="clock">
                        Awaiting outcomes
                      </Badge>
                    ) : (
                      <MeetingBadge status={m.status} />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <MeetingDrawer meeting={selectedMeeting} onClose={() => setSelected(null)} />
      <AddMeetingModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

/* ------------------------------- drawer ------------------------------- */

function MeetingDrawer({ meeting, onClose }: { meeting: DemoMeeting | null; onClose: () => void }) {
  const { state, dispatch } = useDemo();
  const toast = useToast();

  if (!meeting)
    return (
      <Drawer open={false} onClose={onClose} title={<span />}>
        {null}
      </Drawer>
    );
  const partner = state.partners.find((p) => p.id === meeting.partnerId);
  const overdue = meeting.status === "SCHEDULED" && isPast(meeting.at);

  function recordOutcomes() {
    if (!meeting) return;
    dispatch({
      type: "SET_MINUTES",
      meetingId: meeting.id,
      minutes: {
        discussion: [
          "Reviewed current collaboration status against the synthetic plan.",
          "Partner raised two operational questions; both answered on the call.",
          "Next steps agreed with explicit owners and due dates.",
        ],
        decisions: ["Proceed as planned; no scope change (demo MoM)."],
        actionItems: [
          {
            id: `${meeting.id}-new-1`,
            text: "Share updated timeline with partner",
            owner: "Nadia Prameswari",
            dueDate: new Date(Date.now() + 3 * 86400000).toISOString(),
            done: false,
          },
          {
            id: `${meeting.id}-new-2`,
            text: "Partner confirms attendees for the next checkpoint",
            owner: partner?.name ?? "Partner",
            dueDate: new Date(Date.now() + 5 * 86400000).toISOString(),
            done: false,
          },
        ],
        recordedAt: new Date().toISOString(),
        recordedBy: "Nadia Prameswari",
        evidenceUrl: "https://notes.internal.example.invalid/mom/demo",
      },
    });
    toast.ok("Demo minutes recorded", "You can now mark the meeting completed.");
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={meeting.title}
      sub={
        <span className="hstack hstack-wrap" style={{ gap: 8 }}>
          <MeetingBadge status={meeting.status} />
          <Badge tone="outline">{KIND_LABELS[meeting.kind]}</Badge>
          {partner ? <Link href={`/demo/partners/${partner.id}`}>{partner.name}</Link> : null}
        </span>
      }
      footer={
        meeting.status === "SCHEDULED" ? (
          <>
            <Button
              variant="ghost"
              onClick={() => {
                dispatch({
                  type: "SET_MEETING_STATUS",
                  meetingId: meeting.id,
                  status: "CANCELLED",
                });
                toast.ok("Meeting cancelled", "Status recorded in demo state.");
                onClose();
              }}
            >
              Cancel meeting
            </Button>
            <Button variant="secondary" icon="file-text" onClick={recordOutcomes}>
              Record outcomes (demo MoM)
            </Button>
            <Button
              variant="primary"
              icon="check"
              disabled={!meeting.minutes}
              title={!meeting.minutes ? "Minutes are required to complete a meeting" : undefined}
              onClick={() => {
                dispatch({
                  type: "SET_MEETING_STATUS",
                  meetingId: meeting.id,
                  status: "COMPLETED",
                });
                toast.ok("Meeting completed", "Status recorded in demo state.");
                onClose();
              }}
            >
              Mark completed
            </Button>
          </>
        ) : null
      }
    >
      {overdue ? (
        <div className="note-banner" role="note">
          <Icon name="alert" size={14} />
          This meeting's date passed while its status is still scheduled. Record outcomes to
          complete it, or cancel with a note.
        </div>
      ) : null}

      <section aria-labelledby="mm-meta">
        <h3 className="card-title" id="mm-meta" style={{ marginBottom: 8 }}>
          Meeting details
        </h3>
        <dl className="kv" style={{ gridTemplateColumns: "130px 1fr" }}>
          <div style={{ display: "contents" }}>
            <dt>When</dt>
            <dd>
              {friendlyDate(meeting.at)} ·{" "}
              {new Date(meeting.at).toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Asia/Jakarta",
              })}
            </dd>
          </div>
          <div style={{ display: "contents" }}>
            <dt>Location</dt>
            <dd>{meeting.location}</dd>
          </div>
          <div style={{ display: "contents" }}>
            <dt>Attendees</dt>
            <dd>{meeting.attendees.join(", ")}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="mm-minutes">
        <div className="spread" style={{ marginBottom: 8 }}>
          <h3 className="card-title" id="mm-minutes">
            Minutes of Meeting
          </h3>
          {meeting.minutes ? (
            <Badge tone="green" icon="check-circle">
              Recorded
            </Badge>
          ) : (
            <Badge tone="amber" icon="clock">
              Not recorded
            </Badge>
          )}
        </div>
        {meeting.minutes ? (
          <div className="stack-md">
            <div>
              <div className="f-legend" style={{ marginBottom: 6 }}>
                Discussion
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  fontSize: 13,
                  color: "var(--ink-2)",
                  display: "grid",
                  gap: 4,
                }}
              >
                {meeting.minutes.discussion.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="f-legend" style={{ marginBottom: 6 }}>
                Decisions
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  fontSize: 13,
                  color: "var(--ink-2)",
                  display: "grid",
                  gap: 4,
                }}
              >
                {meeting.minutes.decisions.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="f-legend" style={{ marginBottom: 6 }}>
                Action items
              </div>
              <div className="stack-xs">
                {meeting.minutes.actionItems.map((a) => (
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
                        dispatch({
                          type: "TOGGLE_MEETING_ITEM",
                          meetingId: meeting.id,
                          itemId: a.id,
                        })
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
            </div>
            <div className="muted tiny">
              Recorded by {meeting.minutes.recordedBy} · {friendlyDate(meeting.minutes.recordedAt)}{" "}
              · evidence:{" "}
              {meeting.minutes.evidenceUrl ? (
                <a href={meeting.minutes.evidenceUrl} target="_blank" rel="noreferrer">
                  MoM reference (synthetic)
                </a>
              ) : (
                "—"
              )}
            </div>
          </div>
        ) : (
          <EmptyState
            icon="file-text"
            title="No minutes recorded"
            description="Every completed meeting must have a MoM. Use 'Record outcomes' below to generate the demo minutes for this record."
          />
        )}
      </section>
    </Drawer>
  );
}

/* ----------------------------- add meeting ---------------------------- */

function AddMeetingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const partners = useMemo(
    () => [...state.partners].sort((a, b) => a.name.localeCompare(b.name)),
    [state.partners],
  );
  const [partnerId, setPartnerId] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<MeetingKind>("DISCOVERY");
  const [at, setAt] = useState("2026-11-05T10:00");
  const [location, setLocation] = useState("Google Meet (synthetic)");
  const [attendees, setAttendees] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPartnerId(partners[0]?.id ?? "");
      setTitle("");
      setKind("DISCOVERY");
      setLocation("Google Meet (synthetic)");
      setAttendees("");
      setErr(null);
    }
  }, [open, partners]);

  function save() {
    if (!partnerId) {
      setErr("Pick a partner for this meeting.");
      return;
    }
    if (title.trim().length < 5) {
      setErr("Give the meeting a clear title (min 5 characters).");
      return;
    }
    if (Number.isNaN(new Date(at).getTime())) {
      setErr("Enter a valid date and time.");
      return;
    }
    dispatch({
      type: "ADD_MEETING",
      meeting: {
        partnerId,
        title: title.trim(),
        kind,
        at: new Date(at).toISOString(),
        location: location.trim() || "To be confirmed",
        attendees: ["Nadia Prameswari (AIESEC)", ...(attendees.trim() ? [attendees.trim()] : [])],
      },
    });
    onClose();
    toast.ok("Meeting scheduled", "Synthetic record added to the demo book.");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add meeting"
      description="Synthetic meeting record — no invitation is sent anywhere and no calendar is connected."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="check" onClick={save}>
            Schedule meeting
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
      <Field label="Partner" htmlFor="nm-partner" required>
        <select
          id="nm-partner"
          className="input"
          value={partnerId}
          onChange={(e) => setPartnerId(e.target.value)}
        >
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Title" htmlFor="nm-title" required>
        <input
          id="nm-title"
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Discovery — goals and constraints"
          maxLength={120}
        />
      </Field>
      <div className="f-grid">
        <Field label="Type" htmlFor="nm-kind">
          <select
            id="nm-kind"
            className="input"
            value={kind}
            onChange={(e) => setKind(e.target.value as MeetingKind)}
          >
            <option value="DISCOVERY">Discovery</option>
            <option value="SALES">Sales</option>
            <option value="REVIEW">Review</option>
            <option value="KICKOFF">Kickoff</option>
          </select>
        </Field>
        <Field label="Date & time" htmlFor="nm-at" required>
          <input
            id="nm-at"
            type="datetime-local"
            className="input"
            value={at}
            onChange={(e) => setAt(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Location" htmlFor="nm-loc">
        <input
          id="nm-loc"
          className="input"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </Field>
      <Field
        label="Other attendees"
        htmlFor="nm-att"
        hint="Comma-free free text; the AIESEC owner is added automatically."
      >
        <input
          id="nm-att"
          className="input"
          value={attendees}
          onChange={(e) => setAttendees(e.target.value)}
          placeholder="e.g. Dina Maharani (Acme)"
        />
      </Field>
    </Modal>
  );
}
