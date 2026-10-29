# Handover and Release Checklist

## M1-03 integration status (29 October 2026)

PR #5 remains draft and its remote head predates this local stacked continuation.
Ghiffari resolved Q-20 in D-015: the Partner form's required `sourceDescription`
maps to `partners.source`; Contact keeps `lawful_basis_note`. No migration or seed
was added. `packages/core/src/partners` provides validated, guarded operations;
`packages/db/src` supplies bound-parameter Partner/Contact, session/user and
append-only audit SQL adapters. API routes and server pages call the persisted
service. The old mock is imported by tests only; no development principal exists.

The web composition requires `DATABASE_URL` (PostgreSQL URL),
`GOOGLE_OAUTH_CLIENT_ID` (public Google audience), and `CRM_ALLOWED_EMAILS`
(comma/semicolon/newline-delimited exact allowlisted email addresses). Configure
them outside Git. `DATABASE_SSL` is optional (`disable`, `require`, `verify-full`);
an explicit `sslmode` in `DATABASE_URL` is respected, and production otherwise
requires verified TLS. Run migrations 0001–0005 separately and provision active
users and the ten ESSM `industry_categories` (M1-02) before creating partners.
Missing configuration denies all access (503); no fallback fixtures. Google
Identity Services supplies a signed ID token to `/api/auth/session`, which calls
the M0-05 verifier/session service and stores a hashed opaque token in
`user_sessions`. The cookie is HttpOnly, SameSite=Strict, Secure over
HTTPS/production. Mutating routes require a same-origin `Origin`; the check uses
the browser Host and trusted `X-Forwarded-Host`/`X-Forwarded-Proto` rather than
Next.js's internal request URL. Mutations and audit append share one SQL
connection/transaction. RBAC is evaluated in M0-05, including separate contact
access. No real production database or OAuth credentials were used for tests.

A production-build browser walkthrough has passed against an isolated local
PostgreSQL 18 database with synthetic users, sessions and ESSM categories:
anonymous/viewer denial, create, contact create/edit, verification, DNC, partner
edit, search/filter, list summaries, 404, immediate server refresh after
verification/DNC, and sign-out UI. Real HTTP checks also covered duplicate 409,
invalid 422, missing 404, cross-origin 403, expired/revoked/signed-out 401, and
sign-out cookie attributes. The Google ID-token exchange itself was not exercised
because no authorized OAuth client/allowlisted Google account was available;
sessions were seeded directly through the same DB adapter.

Still requiring verification before review: M1-02 ESSM category seeds in the
target environment; Q-21 contact source-URL verification rule; Google OAuth
end-to-end sign-in with an authorized test account; deployment cookie, TLS, CSRF
and connection-pool review; UI visual polish (the current pages use browser
default styling); and PR #5 publication/base strategy.

## Repository handover

- [ ] Private repository owned by `muhammadghiffari` created and initial pack pushed.
- [ ] `hicesse` invitation issued and accepted; write permission verified.
- [ ] Catalna's exact GitHub handle confirmed and invitation accepted.
- [ ] Default branch and CI verified; direct pushes to `main` avoided by team convention or enforced branch protection.
- [ ] One issue per implementation task; assigned owner and reviewer recorded.

## Product / data

- [ ] Fixed diagram and this PRD are the shared system baseline.
- [ ] Live ESSM workbook mapping reviewed; no workbook copied into Git.
- [ ] Industry and Project Support dropdowns match the workbook.
- [ ] Rate Card score formula discrepancy confirmed by the appropriate owner.
- [ ] Proposal values snapshot; actual revenue separate; merchandise sales not double-counted.
- [ ] Mandatory report, newsletter and scorecard tracking demonstrated.
- [ ] LoA templates and numbering approved.

## Security / operational

- [ ] Auth allowlist and role/action matrix pass.
- [ ] TL BD/LCVP PD same CRM Lead permissions demonstrated.
- [ ] LoA self-approval prevented.
- [ ] AI worker has no send credentials/tool.
- [ ] DNC, erasure, contact provenance and transcript retention are tested.
- [ ] Companion remains disabled unless its safety/policy review passes.
- [ ] Provider/hosting terms, data region, backups, monitoring and incident contact approved.
- [ ] Backup restore drill passed.

## Release

- [ ] Golden path and negative tests passed.
- [ ] Export matches synthetic golden workbook.
- [ ] Open questions resolved or explicitly accepted by product owner.
- [ ] Rollback and migration plan checked.
- [ ] User-facing help and handover report prepared.
- [ ] Product owner signs off production use.
