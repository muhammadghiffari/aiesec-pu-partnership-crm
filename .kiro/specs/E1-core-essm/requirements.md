# Core partner, cycle, classification and Market Research

**Requirement group:** FR-200, FR-300

# Requirements — E1 Core ESSM Domain

- Partner is the organization master; one Partner may have many PartnershipCycles.
- Every cycle uses one of five canonical stages and separate sales/partnership status fields.
- Industry classification uses the ten ESSM categories; Project Support uses the ESSM dropdown.
- Contact captures PIC/contact details, source URL/provenance, verification status and do-not-contact.
- Market Research has four required human scores (Values, Vision, Current Focus, Program) from 1–5, evidence URLs, researcher/date and human Proceed decision.
- AI fit score remains separate from ESSM alignment score.

## Acceptance criteria
- Category and Project Support seeds are idempotent and preserve source labels.
- No legacy business vertical appears as the primary industry taxonomy.
- Score values outside 1–5 and missing required scores are rejected.
- DNC prevents draft/send actions at service level.
- Re-raise creates a new cycle without modifying prior history.
