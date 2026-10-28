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

## Superseded assumptions

- PRD v1.1 said merchandise tracking was out of scope; replaced by D-006.
- PRD v1.1 used eight “verticals” as target taxonomy; replaced by D-004.
- PRD v1.1 defined TL BD as a separate `super_admin` permission role while LCVP PD had different capabilities; replaced by D-007/D-008. A deployment or technical administrator flag may exist only as an infrastructure concern and must not create business-permission disparity between CRM Leads.
- Earlier examples that embedded tactics (e.g. specific outreach tactics or time windows) are operating guidance and are not CRM stages or schema enums.
