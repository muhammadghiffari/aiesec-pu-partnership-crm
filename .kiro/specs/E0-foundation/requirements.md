# Foundation, authentication and governance

**Requirement group:** FR-100

# Requirements — E0 Foundation

## Outcome
A private, typed, auditable platform foundation with Google authentication, allowlist checks, shared CRM Lead permissions and CI. Do not implement business features outside the foundation scope.

## Requirements
- Sign in with Google; deny emails not in server-side allowlist.
- Store role assignments in the database; TL BD and LCVP PD map to the same `CRM_LEAD` permission capabilities.
- Optional viewer is disabled unless explicitly configured.
- Central authorization function protects every route/action/service/worker token.
- All material mutations pass through an audit service.
- `.env.example` contains placeholders only; startup fails safely when required secrets are absent.
- CI validates formatting, type checking, unit tests, migration state and the fixed diagram.

## Acceptance criteria
- Unauthenticated/unknown/inactive users cannot read CRM data.
- Role-action matrix test proves TL BD and LCVP PD capabilities are identical; LoA self-approval is denied independent of role.
- Audit mutation tests assert one append-only audit record per mutation.
- Test/CI logs contain no environment secrets or real PII.
