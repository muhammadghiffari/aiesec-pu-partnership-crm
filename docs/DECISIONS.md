# Decisions, Constraints and Unresolved Source Questions

Date baseline: 28 October 2026. Changes require product-owner approval and an ADR if they affect a system invariant.

## Accepted decisions

| ID | Decision | Implementation effect |
|---|---|---|
| D-001 | Private repository target is `muhammadghiffari/aiesec-pu-partnership-crm` | Bootstrap is explicit and private; no public mirror |
| D-002 | Fixed EDGE_ANCHORED 13-page diagram is system-design baseline | Keep it in `docs/diagrams/`; PRD follows its domain structure |
| D-003 | Official lifecycle has five top-level stages only | Prospecting, Sales Process, Close Deal, Partnership Implementation, Post Survey |
| D-004 | Use ESSM industry categories and Project Support as classification | Legacy operational verticals are not canonical partner taxonomy |
| D-005 | Rate Card is structured and independently versioned | Catalog/package/item entities; proposals snapshot value calculations |
| D-006 | Merchandise Tracker is in scope | Dedicated merchandise entities and calculation tests |
| D-007 | TL BD and LCVP PD have identical CRM Lead permission profile | Organizational seniority does not imply different in-app permissions |
| D-008 | Both CRM Leads can assist staff work | They may work assigned/staff workflows as well as administration/review |
| D-009 | LoA submitter may never approve own LoA | Enforced in domain service and database constraint/trigger where feasible |
| D-010 | AI never sends or approves external communication/LoA | No send credentials/tools in worker; human approval/send is separate |
| D-011 | Official survey response contents are not integrated at first release | Link + dispatch/completion status only |
| D-012 | Real ESSM workbook/data is excluded from Git | Local authorized mapping/import process only |
| D-013 | Third developer is `hicesse`; Catalna continues as an existing developer | `hicesse` invited with write permission by bootstrap; do not guess Catalna's handle |
| D-014 | Developer model choices are separate from application runtime LLM | Runtime provider/model must pass independent access and evaluation checks |

## Temporary defaults requiring confirmation before production

| ID | Question / potential source mismatch | Safe interim behavior | Owner / release gate |
|---|---|---|---|
| Q-01 | ESSM Rate Card formula appears inconsistent: five factor scores on 0–5 scale, formula reference reportedly divides by 15 | Store raw inputs and formula/config version; do not lock formula into production until compared with live workbook and approved | Product owner + ESSM standard owner; blocks production monetization formula |
| Q-02 | ESSM guidance mentions Scorecard during implementation and also organizes it as Post-Experience; CRM stages include Stage 5 Post Survey | Keep stage 5 as formal lifecycle. Allow dispatch during implementation with audit; default due date after event/program completion/report until national guidance confirms timing | Product owner; confirm before launch |
| Q-03 | Exact workbook tab names/column positions/dropdown values must match live workbook | Implement versioned data mapping and golden-file test using authorized local workbook; do not commit the workbook | Import/export spike |
| Q-04 | Exact LoA numbering, signer title wording, bilingual template field labels | Make numbering/template fields configurable; use approved official template copies only | Product owner before LoA production |
| Q-05 | Hosting/privacy region, provider terms, backup target and budget | Do not use production data before privacy review and restore drill; architecture adapter keeps hosting replaceable | Product owner before production |
| Q-06 | Runtime LLM access differs from coding-assistant IDE access | Runtime provider smoke test and evals required; local IDE availability is not runtime API authorization | AI integration milestone |
| Q-07 | Catalna's exact GitHub handle is not provided | Preserve display name in docs; do not attempt invitation or create a handle by guessing | Product owner to confirm |
| Q-08 | Current legal basis/retention/participant notice and Companion platform terms | Data minimization; DNC/erase path; Companion disabled unless approved and safe | Privacy/security review |
| Q-09 | PRD §11 lists capabilities in prose; the exact action-level role matrix for `VIEWER` is not specified (contact PII, exports, audit log) | `VIEWER` is read-only on partner, cycle, rate card and reports only. No contact PII, internal notes, exports or audit access. `export.run` and `audit.read` are CRM Lead only. Source of truth: `packages/core/src/auth/policy.ts` and its independent matrix test | Product owner confirm before UAT |
| Q-10 | PRD says BD staff "approve their own exact outbound content" but does not state which roles may export, import or override gates beyond "CRM Lead authorizes gate waivers" | `outreach.approve` is granted to `BD_STAFF` and `CRM_LEAD`; `gate.override`, `loa.approve`, `ratecard.edit`, `package.edit`, `import.run`, `user.manage` are lead-only | Product owner confirm before M2/M3 |
| Q-11 | Session lifetime, cookie attributes and CSRF strategy are unspecified | Default 8h server-side session, opaque 256-bit token stored only as SHA-256 hash, account state and allowlist re-checked every request. HttpOnly/Secure/SameSite and CSRF are applied by the web layer and verified when it is wired | Security review (M6-01) |
| Q-12 | Retention/purge of audit records vs erase requests (SECURITY_PRIVACY #5) is undefined | Audit metadata never stores contact PII, so erasure of personal data does not require editing audit rows; no audit purge operation exists. Any retention-based purge needs a product-owner decision and a separate, privileged, audited procedure | Product owner before production |
| Q-13 | Class Diagram types `AuditLog.entityId` as UUID, but M0-06 events also target non-row things (for example the denied action name for `ACCESS_DENIED`) | `audit_log.entity_id` is `text`. Approval requested to update the diagram in the same change (AGENTS.md rule); every other AuditLog attribute matches | Product owner |
| Q-14 | The diagram names enumerations it does not define (ContactStatus, OutreachChannel/Status, RateCardStatus, ProposalStatus, ContributionType, MeetingType/Decision, MoMStatus, ParticipantType, LoAStatus, ProjectStatus, DeliverableStatus, EngagementType/Status) | Interim CHECK domains in migrations 0001-0003 (for example LoAStatus = DRAFT, SUBMITTED, APPROVED, REJECTED, SIGNED, CANCELLED). Later issues extend them by appending a migration | Product owner before UAT |
| Q-15 | Diagram says `decimal` for money; AGENTS.md says integer rupiah unless a decimal need is agreed | Money columns are `bigint` rupiah; `quantity` is `numeric(12,3)` (fractional quantities). "Derived" proposal/line totals are stored calculator snapshots; the rounding rule is owned by M3-02, not hard-coded in SQL. Merchandise totals are DB-generated integer arithmetic | Product owner / M3-02 |
| Q-16 | Additions beyond the diagram needed by PRD/DATA_MODEL | Lookups `project_support_types`, `benefit_categories` (not seeded: M1-02/M3-01); Contact DNC/provenance columns; Partner `website_domain`/`normalized_name`; cycle `previous_cycle_id` + `re_raise_review_date`; LoA `template_kind` and numbering columns; `user_sessions`. One benefit per proposal (`proposal_benefits` unique per proposal+item) to prevent double counting | Product owner |
| Q-17 | PRD says only that gate waivers need a named lead, reason, timestamp and audit event; it does not say which stage gates are waivable | Waivable by a CRM Lead with a 10-500 character reason: proposal sent, meeting recorded, MoM final (Sales Process exit). NOT waivable by anyone: Market Research (scores, Proceed, evidence, human verifier), confirmed SnD, approved + independently approved + fully signed LoA with document link, finished project with report link. Source of truth: `WAIVABLE_GATES` in `packages/core/src/lifecycle/rules.ts` | Product owner before UAT |
| Q-18 | Stage movement rules are not spelled out beyond the five-stage order | Strictly forward, one stage at a time; no backward or repeat move; Post Survey is terminal. A renewal is a NEW cycle (M5-03), never a reopened one. `openCycle` creates only a partner's first cycle; later cycles come from the Re-Raise decision | Product owner |
| Q-19 | PRD §8: Active/Break/Finish "requires date and reason when relevant" | BREAK and FINISH require a 3-200 character reason; the date is the audit event time (UTC). FINISH is terminal. `partnership_status` becomes ACTIVE automatically when a cycle enters Partnership Implementation. Sales status is editable through Close Deal; approach method through Sales Process | Product owner |
| Q-20 | Worker-produced rows (job state, candidate drafts) are system output, but audit events need a user actor (`audit_log.actor_user_id` NOT NULL) and the worker has no session | Job outcomes are recorded on `research_jobs` itself (status, attempt, error code, finish time). Human actions (criteria versions, enqueue, quota change, accept/reject) are audited normally. Candidate drafts are attributed through `research_jobs.requested_by`. A dedicated system actor would need a new AccessRole, which D-007 does not define | Product owner |
| Q-21 | Quota basis is not specified beyond "per-staff quotas" | Default 10 jobs per staff member per Asia/Jakarta calendar day, overridable per user by a CRM Lead (0 disables). Cancelled jobs free their slot; failed and dead jobs still count so retries cannot be used to bypass the cap. An idempotent replay consumes nothing | Product owner |
| Q-22 | Retry policy is not specified | Up to 3 attempts (configurable 1-5 per job), exponential backoff 30s doubling to a 15 min cap, 120s lease for crash recovery, 45s provider deadline. Only `CRITERIA_UNAVAILABLE` and `AI_DISABLED` fail without retry. A job whose last attempt crashed is marked DEAD, never retried past its bound | Product owner |

## Superseded assumptions

- PRD v1.1 said merchandise tracking was out of scope; replaced by D-006.
- PRD v1.1 used eight “verticals” as target taxonomy; replaced by D-004.
- PRD v1.1 defined TL BD as a separate `super_admin` permission role while LCVP PD had different capabilities; replaced by D-007/D-008. A deployment or technical administrator flag may exist only as an infrastructure concern and must not create business-permission disparity between CRM Leads.
- Earlier examples that embedded tactics (e.g. specific outreach tactics or time windows) are operating guidance and are not CRM stages or schema enums.
