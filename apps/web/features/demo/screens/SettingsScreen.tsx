"use client";

/**
 * /demo/settings — prototype configuration.
 * Demo user + role summary, UI preferences (actually applied), an explicit
 * statement of what is NOT connected, dataset statistics, and the reset
 * action with confirmation.
 */
import { useState } from "react";
import { useDemo } from "../store";
import { ConfirmDialog } from "../ui/overlays";
import { Avatar, Badge, Button, Card, KeyValue, PageHeader, Segmented } from "../ui/primitives";
import { useToast } from "../ui/toast";

export function SettingsScreen() {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="page" style={{ maxWidth: 880 }}>
      <PageHeader
        title="Prototype settings"
        description="Everything on this screen applies to the demo session only and is lost on refresh — there is no persistence by design."
      />

      <Card title="Demo user & role" sub="Fixed for the presentation session">
        <div className="hstack" style={{ gap: 12, alignItems: "flex-start" }}>
          <Avatar name="Nadia Prameswari" />
          <div style={{ flex: 1 }}>
            <b style={{ fontSize: 14 }}>Nadia Prameswari</b>
            <div className="muted tiny">nadia.prameswari@aiesec-demo.example</div>
            <div className="hstack" style={{ marginTop: 6 }}>
              <Badge tone="teal" icon="shield-check">
                CRM Lead
              </Badge>
              <Badge tone="outline">TL BD mirror (D-007)</Badge>
            </div>
            <KeyValue
              columns="180px 1fr"
              entries={[
                [
                  "Permissions",
                  "All staff workflows + configurations, approvals (never self-approval), gate actuation",
                ],
                [
                  "LoA rule",
                  "Can approve LoAs submitted by others; can never approve own submissions (D-009)",
                ],
              ]}
            />
          </div>
        </div>
      </Card>

      <Card title="UI preferences" sub="Applied live to the demo shell — session only">
        <div className="stack-md">
          <div className="spread">
            <div>
              <b style={{ fontSize: 13 }}>Density</b>
              <div className="muted tiny">Table row and card padding</div>
            </div>
            <Segmented
              ariaLabel="Density"
              value={state.prefs.density}
              onChange={(v) =>
                dispatch({
                  type: "SET_PREF",
                  key: "density",
                  value: v as typeof state.prefs.density,
                })
              }
              options={[
                { value: "comfortable", label: "Comfortable" },
                { value: "compact", label: "Compact" },
              ]}
            />
          </div>
          <div className="divider" />
          <div className="spread">
            <div>
              <b style={{ fontSize: 13 }}>Date display</b>
              <div className="muted tiny">Relative hints ("in 2 days") vs. absolute dates</div>
            </div>
            <Segmented
              ariaLabel="Date format"
              value={state.prefs.dateFormat}
              onChange={(v) =>
                dispatch({
                  type: "SET_PREF",
                  key: "dateFormat",
                  value: v as typeof state.prefs.dateFormat,
                })
              }
              options={[
                { value: "relative", label: "Relative" },
                { value: "absolute", label: "Absolute" },
              ]}
            />
          </div>
        </div>
      </Card>

      <Card title="What is NOT connected" sub="Read this before answering stakeholder questions">
        <div className="checks">
          {[
            {
              t: "Authentication & permissions",
              d: "No sign-in. The demo user is fixed; role rules are demonstrated, not enforced against a real identity.",
            },
            {
              t: "Server persistence",
              d: "Nothing is stored anywhere. A page refresh or 'Reset demo data' restores the initial synthetic dataset.",
            },
            {
              t: "Sending (email/WhatsApp/LinkedIn)",
              d: "The Send action is permanently disabled here. Production sends go through an approved human sender profile with strict gates.",
            },
            {
              t: "AI provider / research worker",
              d: "Research jobs are scripted timers producing synthetic candidates. No model is called; no claim is verified by an AI.",
            },
            {
              t: "Document signing",
              d: "LoA statuses record workflow metadata only. Agreements are drafted from official templates and signed outside the CRM.",
            },
            {
              t: "Scorecard responses",
              d: "Per D-011 the official BD Post-Partnership Scorecard is tracked as link + dispatch/completion status only.",
            },
          ].map((x) => (
            <div key={x.t} className="check-row warn">
              <span className="check-ico" aria-hidden="true">
                !
              </span>
              <div className="check-txt">
                <strong>{x.t}</strong>
                <span>{x.d}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid-2">
        <Card title="Current dataset" sub="Synthetic records held in memory right now">
          <div className="f-grid">
            {[
              ["Partners", state.partners.length],
              ["Contacts", state.contacts.length],
              ["Cycles", state.cycles.length],
              ["Research candidates", state.candidates.length],
              ["Outreach drafts", state.drafts.length],
              ["Meetings", state.meetings.length],
              ["LoA records", state.agreements.length],
              ["Projects", state.projects.length],
              ["Activities logged", state.activities.length],
            ].map(([k, v]) => (
              <div key={k} className="spread">
                <span className="muted" style={{ fontSize: 13 }}>
                  {k}
                </span>
                <b className="strong">{v}</b>
              </div>
            ))}
          </div>
          <p className="muted tiny" style={{ marginTop: 12 }}>
            Every organization, person and document in this dataset is fictional (*.example /
            .invalid domains).
          </p>
        </Card>

        <Card title="Reset" sub="Return the session to its initial synthetic state">
          <p style={{ fontSize: 13, color: "var(--ink-2)", margin: "0 0 12px" }}>
            Discards anything created or changed here — accepted candidates, drafts, approvals,
            status changes, preferences — and reseeds the fixed demo dataset.
          </p>
          <Button variant="danger" icon="refresh" onClick={() => setConfirmReset(true)}>
            Reset demo data
          </Button>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          dispatch({ type: "RESET" });
          setConfirmReset(false);
          toast.ok("Demo state reset", "The synthetic dataset was reseeded.");
        }}
        title="Reset demo session?"
        message="All in-memory changes will be discarded and the synthetic dataset reseeded. Nothing real is affected."
        confirmLabel="Reset demo data"
      />
    </div>
  );
}
