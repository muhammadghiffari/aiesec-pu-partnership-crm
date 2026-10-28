# Prospecting jobs, contact verification and approved outreach

**Requirement group:** FR-300, FR-400, FR-950

# Requirements — E2 Prospecting and Sales Process

- Criteria and research jobs are versioned, quota-limited and idempotent.
- AI-generated research contains source URLs and labels unsupported claims as unverified.
- Contact details/channel must be verified to required status before sending.
- Outreach linter is deterministic; approval is bound to a hash of exact body, recipient, channel and relevant subject/metadata.
- Edit after approval invalidates approval. DNC and unverified recipient block send.
- Reply types include Interested, Not Interested and No Response; No Response allows at most three follow-ups and is cancelled on reply/DNC.
- AI worker cannot send and has no credentials/tools capable of sending.

## Acceptance criteria
- Each AI output passes schema validation or enters a failed-review queue after one repair attempt.
- Linter errors block approval; every required rule has a unit test.
- Approved hash mismatch blocks outgoing action.
- Any change to recipient/channel invalidates approval.
- Stop-on-warning and quota tests pass; Companion remains disabled until safety review.
