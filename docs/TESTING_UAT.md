# Testing Strategy and User Acceptance Tests

## Required test layers

- **Unit:** lifecycle state machine; status semantics; CRM Lead equivalence; LoA self-approval; DNC; outreach content hash; Rate Card math/snapshot; merchandise math; due dates/working days.
- **Integration:** Postgres constraints, audit service, import idempotency, proof-required status, unique LoA numbering, data-access filters, job retries and lock behavior.
- **AI evaluations:** valid structured output, evidence URL grounding, no fabricated claims, Indonesian formal tone, prompt-injection fixtures, DNC handling, budget/latency caps.
- **E2E:** five ESSM stages in synthetic data, positive and negative gate cases, role matrix, import/export dry run, accessible keyboard navigation.
- **Security:** every route/server action/job/extension endpoint × role × account state; export authorization; session revocation; secret scanning.

## Synthetic golden path

1. CRM Lead signs in; configure criteria with one ESSM industry category and Project Support.
2. Create a synthetic prospect; research output has source links. AI fit priority is visible separately from ESSM score.
3. Staff enters four alignment scores in the 1–5 range and a human `Proceed` decision. Invalid or missing fields block progression.
4. Add a synthetic contact using `example.invalid`; verify contact and channel. DNC status blocks drafting and sending.
5. AI creates a draft. Linter flags an unsupported claim. After correction, staff approves; changing content or recipient invalidates the approval hash. No send occurs automatically from the AI worker.
6. Record partner response. Not Interested closes the attempt. No Response allows at most three follow-ups. Interested continues to discovery.
7. Configure a Rate Card item/unit value and an optional package. Proposal total uses selected lines exactly once; update catalog afterward and prove historic proposal snapshot does not change.
8. Conduct meeting 1 and finalize the structured MoM. Matched flow requires final MoM. Meeting round limit is enforced.
9. Record complete SnD; attempt LoA without SnD (must fail). Submit LoA; the submitter attempts approval (must fail); a distinct CRM Lead approves. Fully signed link is required to start implementation.
10. Record actual financial and in-kind receipts separately with evidence; a proposal estimate must not change actual revenue. Finish program without report link (must fail).
11. Record monthly newsletter. Optional visit/invitation/greeting can be skipped without blocking completion. Send/track the official BD Post-Partnership Scorecard link.
12. Choose Re-Raise YES and prove a new PartnershipCycle is created while old cycle remains unchanged. PLANNING_TO requires a review date.
13. Add merchandise items, COGS, selling price, quantity and bundle. Verify profit/COGS/revenue formulas and evidence; confirm no duplicate revenue roll-up.
14. Import synthetic workbook fixture with duplicate/invalid values; preview shows errors. Re-running import is idempotent. Export matches the synthetic golden file.
15. Verify TL BD and LCVP PD have equivalent action permission sets for staff workflow, config, and approval; both are unable to approve a LoA they submitted.

Production UAT must use approved real data only in a secured environment and must not create real outbound sends without explicit human approval.
