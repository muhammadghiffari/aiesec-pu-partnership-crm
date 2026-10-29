# Prototype demo guide — `/demo`

A presentation prototype of the AIESEC in PU Partnership CRM, built to show the
intended product shape across the five ESSM lifecycle stages. It is a UI
prototype with **synthetic data held in memory**. It is not wired to a database,
an auth provider, an AI model, a mail/WhatsApp/LinkedIn sender, or any document
signing service.

The real M1-03 partner module lives at `/partners` and is untouched by this
prototype. Everything documented here is under `/demo`.

## Live database demo mode (D-016, optional)

By default the demo runs fully in-memory. With the local PostgreSQL configured,
Partners & Contacts connect to the real M1-03 API + database through the same
routes the production app uses (auth, RBAC and append-only audit included);
every other module stays synthetic and labelled.

Setup (local PostgreSQL 18 service on `127.0.0.1:5432`, visible in pgAdmin4):

1. Create once: login role `crm_app` and database `crm_dev` (owner `crm_app`).
2. Apply migrations 0001–0005 + the idempotent synthetic seed:
   `DATABASE_URL="postgresql://crm_app:<role-password>@127.0.0.1:5432/crm_dev?sslmode=disable" pnpm tsx apps/web/scripts/dev-db-setup.mts`
3. Configure the untracked `apps/web/.env.local` with `DATABASE_URL`,
   `CRM_ALLOWED_EMAILS` (dev sign-in emails) and `CRM_DEMO_MODE=1`, then `pnpm dev`
   and open `/demo`: the workspace shows a `LIVE DB` pill and offers the
   dev sign-in while signed out. The dev token only relaxes the *verifier*;
   allowlist, active `users` row, session minting, RBAC and audit are unchanged.
4. Seeds are strictly synthetic (`*.example.invalid`); no real partner or
   workbook data. In production `CRM_DEMO_MODE` is ignored and the Google
   verifier is required (D-016).

## Start the prototype

Prerequisites: Node >= 22 and pnpm 10.15 (`corepack enable` if pnpm is missing).

From the repository root:

```bash
pnpm install          # once, or after dependency changes
pnpm dev              # starts @crm/web on the Next.js dev server
```

Open **http://localhost:3000/demo**.

To run the production build instead of the dev server:

```bash
pnpm build
pnpm --filter @crm/web start
```

`pnpm start` from the repository root does not exist — the web app is a
workspace package, hence the `--filter`. Stop either server with `Ctrl-C`.

If port 3000 is already taken by another checkout, Next.js picks the next free
port and prints it in the terminal; use that port in place of 3000.

## The five-minute walkthrough

Seeded dataset: 14 partner records (11 with a partnership cycle, 3 without),
6 outreach drafts, 7 LoA records, 5 research candidates awaiting review. The
demo clock is pinned to **29 Oct 2026** so counts and relative dates are
deterministic, and the signed-in user is **Nadia Prameswari (CRM Lead)**.

1. **Overview** (`/demo`) — the four KPI cards (14 partner records, 10 active
   cycles, 5 pending candidates, 8 follow-ups due) and the five-stage pipeline
   strip. Every stage chip opens the partner directory pre-filtered to it.
2. **Partners** (`/demo/partners`) — search, ESSM industry filter, stage filter,
   relationship filter and sort. Point out that row and card counts agree with
   the Overview, and that a row opens the profile from anywhere on the row.
3. **Partner profile** (open `Halimun Sintetis Learning House`) — the re-raise
   story: an organisation with a finished oGX cycle, its cycle card, stage
   history, verification state and activity trail. The same name appears
   verbatim on its outreach draft, which is the consistency point worth showing.
4. **Research** (`/demo/research`) — the criteria panel, a run that completes
   itself, and the candidate table. Note the duplicate flag on
   "Halimun Learning Center" (same domain as the existing Halimun record) and
   that accepting a candidate requires a human decision.
5. **Outreach** (`/demo/outreach`) — the readiness panel on the right is the
   important part. Select *Agenda Kemitraan Selanjutnya — Bukit Sintetis Health*
   to show a Do-Not-Contact block, then *Peluang Aktivasi Kampus untuk Ekatama
   Demo Foods* to show an unverified-channel block. In both cases the review
   stamp and send actions are disabled; the prototype never sends.
6. **Contacts** (`/demo/contacts`) — identity verification and per-channel
   verification are separate facts, each needing a method and an evidence URL.
   Open any contact row for the drawer.
7. **Letters of Agreement** (`/demo/loa`) — submit `LOA/2026/0014` and show that
   the Approve action is then disabled for its own submitter
   (decision D-009, separation of duties).
8. **Reports** (`/demo/reports`) and **Settings** (`/demo/settings`) — read-only
   reporting that reconciles with the same dataset, and the density / date
   format preferences plus a second reset control.

## Reset behaviour

The store is a React context plus `useReducer`. Nothing is written to
`localStorage`, cookies, a server, or a database.

- **Client-side navigation keeps state.** Moving between `/demo` routes with the
  sidebar, breadcrumbs, links or the global search does not reload the document,
  so created partners, reviews, DNC marks and stamped drafts survive.
- **A hard refresh reseeds everything.** Reloading the page (F5 / Ctrl-R, or
  opening a route directly) restores the seed dataset. Any record created in the
  session is gone; that is the documented demo behaviour, not a bug.
- **Reset on demand.** "Reset demo data" in the sidebar footer, or the same
  control on Settings, opens a confirmation dialog and reseeds immediately,
  showing a `Demo state reset` confirmation.

Use a reset between demos so the numbers in the walkthrough match this guide.

## What is simulated

| Area | Prototype behaviour |
| --- | --- |
| Persistence | None. In-memory only; a refresh reseeds. |
| Authentication | None. The user is a fixed demo identity; no OAuth, no session. |
| Partner / contact records | Created in memory. Duplicate detection runs locally and forces an explicit human confirmation. |
| Research jobs | Simulated progress and fixed synthetic candidates. No crawler, no external calls. |
| AI drafting | None. Draft bodies are fixed synthetic Bahasa Indonesia templates; the panel states the model/provider is not connected. |
| Message sending | Disabled everywhere. Email / WhatsApp / LinkedIn are preparation-only; no send credentials exist. |
| LoA | Recorded workflow metadata only. Documents are drafted outside the system and signed externally; the CRM records a reference, never a signature. |
| Reports | Read-only views over the same in-memory dataset. |
| Audit | Activity entries are appended to the in-memory timeline, not to an append-only audit store. |

## Gates that are real behaviour, not decoration

These are the parts of the product worth demoing as rules rather than screens:

- **Do-Not-Contact wins over everything.** A DNC contact is blocked in every
  flow regardless of verification state, and the review stamp stays disabled.
- **Identity and channel verification are separate.** Both the person and the
  exact channel must be verified; an unverified channel is never "outreach
  ready" and cannot be stamped.
- **Approval is exact-version.** Editing a reviewed draft invalidates the review
  stamp and logs the invalidation.
- **A submitter cannot approve their own LoA** (D-009). The Approve control is
  disabled for the submitter with an explanation.
- **Duplicates require a decision.** Creating a partner whose name or domain
  resembles an existing record raises a review dialog with "Go back" and
  "Not a duplicate — save anyway".

## Accessibility notes

- Every route starts with a skip link, and focus-visible outlines are defined
  globally.
- Clickable table rows are not bare `<tr onClick>` elements. Each carries one
  real control in its first cell — a `<Link>` on partner rows, a `<button>` on
  contact and LoA rows — so keyboard and screen-reader users get native
  Enter/Space activation, an accessible name and a visible focus ring on the
  row. Partner rows let that link cover the whole row; contact and LoA rows
  keep a guarded row click (their cells contain other links and controls), so a
  mouse click anywhere still opens the record while the nested controls keep
  their own behaviour.
- Drawers and dialogs are native `<dialog>` elements with labels, and close on
  Escape.

## Verification commands

```bash
pnpm format           # biome check --write
pnpm lint             # biome check
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest run (includes tests/demo)
pnpm --filter @crm/web build
python3 scripts/validate-handover.py
```

The demo trust rules (DNC, channel verification, D-009, duplicate detection,
report reconciliation) are covered by `tests/demo/demo-selectors.test.ts`.

## Known limitations

- No persistence, so a refresh cannot be used to "resume where you left off".
- Dates and relative labels are computed against a fixed anchor
  (29 Oct 2026), not the real clock.
- Pagination on the partner directory is client-side over the seeded records.
- The prototype is presentation-only: it proves flow and policy shape, not
  backend behaviour. Backend services, schema, authorization and audit are
  separate implementation work with their own acceptance criteria.
- In a background browser tab, streamed page content can appear as a loading
  skeleton until the tab is focused; that is a browser timer-throttling effect,
  not an application error.
