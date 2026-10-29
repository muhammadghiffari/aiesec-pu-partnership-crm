# Handover and Release Checklist

## M1-03 continuation blocker (29 October 2026)

PR #5 remains draft. M1-04 includes the Partner/Contact tables and central auth/audit
contracts, but no persisted Partner/Contact repository or domain service, no database
session/user adapter, and no authenticated web session/cookie integration. The M1-03
mock service is now test-only; production pages show an unavailable state and API
requests return 503 rather than reading fixtures or accepting a development principal.
This is **not** completed CRUD and must not be described as production-ready.

Before enabling the retained partner/contact components: reconcile Q-20 in
`docs/DECISIONS.md`; provide the real Partner/Contact service in `packages/core`,
database repository plus atomic audit transaction, web session store/cookie/CSRF
integration and server-side `partner.read`/`partner.write`/`contact.read`/
`contact.write` checks. Then wire API and server pages through that service, complete
create/edit/contact flows with server-side tests, and run the walkthrough on a
supported Node version with an authorized synthetic test database. No schema change
or seed data was added by this continuation.

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
