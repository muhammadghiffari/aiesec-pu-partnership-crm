# Operational Runbook (Initial Template)

This file must be filled with real environment/provider details before production; secrets must stay in the secret manager, never here.

## Routine checks

- Check auth failures, failed/overdue jobs, AI usage and structured-output failure rates.
- Review open cycles without dated next action, reports overdue, monthly newsletters due, unverified revenue proof and scorecard status.
- Check backup outcome and retention; periodically run restore drills.
- Review rate-card formula/config changes and exports after ESSM workbook mapping updates.

## Kill switches

- `AI_ENABLED=false`: stop new AI jobs; preserve already-generated drafts.
- `OUTBOUND_ASSISTED_SEND_ENABLED=false`: hide/disable send handoff controls.
- `COMPANION_ENABLED=false`: revoke Companion tasks/tokens and disable extension endpoints.
- Disable relevant OAuth/provider credentials using the provider console if compromised.

## Failure response

1. Identify affected component and time window without pasting production PII into issues.
2. Stop retries for non-idempotent outbound or import actions.
3. Inspect redacted job/audit metadata and provider status.
4. If a security, privacy, or platform warning occurred, disable the integration and notify the product owner.
5. Restore from a tested backup only under owner approval; record recovery point and steps.
6. Add a regression test and document resolution after the incident.
