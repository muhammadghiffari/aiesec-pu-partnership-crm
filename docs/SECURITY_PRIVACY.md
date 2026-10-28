# Security and Privacy Requirements

## Protected data classes

- **Partner business data:** company details, partnership history, proposals, pricing, negotiations, deliverables, revenue, LoA and MoM.
- **Personal data:** PIC names, direct email/phone/WhatsApp/LinkedIn, contact provenance, meeting attendees and transcript content.
- **Secrets:** OAuth keys/tokens, DB connection strings, provider API keys, encryption keys, GitHub tokens.
- **Restricted internal notes:** internal negotiation limits, BATNA, risk flags and staff feedback.

## Minimum controls

1. Keep repository private; least-privilege team access. Never commit real ESSM workbook, exports, contact lists, transcripts, contracts, `.env*` files, or backups.
2. Google OAuth plus allowlist. Use central server-side authorization for all mutations and data access. TL BD and LCVP PD resolve to the same CRM Lead permission set.
3. Use secure cookies, appropriate CSRF protection, rate limiting, session expiry/revocation, and scoped Companion tokens.
4. Keep send credentials entirely out of the AI/worker runtime. Use one explicit user-initiated send action tied to the approved content hash.
5. Do-not-contact is checked in domain services for draft creation, queue, and send. An erase request must remove or irreversibly redact personal data according to the approved retention/legal basis while preserving only the minimal audit fact needed.
6. Contact source/provenance, verification and lawful-basis note are required. Do not infer blanket consent from third-party sourcing.
7. Log actor, action, entity ID, timestamp and redacted before/after metadata. No full PII or raw message/transcript in application logs by default.
8. Encrypt data in transit and backups; evaluate encryption-at-rest and managed database provider access. Test restore quarterly or before major release.
9. LLM payloads only contain the minimum context needed. Model inputs are not trusted instruction channels. Strip irrelevant PII and never include credentials.
10. Companion stops immediately on CAPTCHA, security challenge, platform warning or restriction. If platform policy cannot be met, disable automation and use a manual workflow.
11. Store data region, subprocessors, retention windows, breach process and owner contact in a reviewed production ADR.
12. Audit and review every gate override. Gate waiver must state reason, lead actor, entity and timestamp.

## Incident checklist

- Disable outbound send/Companion/worker with feature flags.
- Revoke affected user or integration credentials/tokens.
- Preserve a redacted audit record and investigate scope without copying PII into public issues.
- Determine required notifications using the approved legal/privacy runbook.
- Restore only from verified backups; record restore test and access review.
- Add regression tests and close the incident only after owner review.
