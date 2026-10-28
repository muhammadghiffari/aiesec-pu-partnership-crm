# Engagement, scorecard, re-raise, ESSM import/export and dashboards

**Requirement group:** FR-800, FR-850, FR-900

# Requirements — E5 Post Survey and ESSM Operations

- Track monthly mandatory newsletters during active partnerships; partner visits, AIESEC event invitations and greeting cards remain optional ESSM engagements.
- Seed the official BD scorecard URL and store sent date/actor plus completion status only unless response integration is approved.
- Record re-raise decision: Yes, No, Planning To. Planning To requires review date; Yes opens a new cycle.
- ESSM import provides preview, validation, dedupe, row errors and idempotency. Export matches approved column order and dropdown values.
- Dashboard/export access is permission checked and audited.

## Acceptance criteria
- Newsletter due/completion can be reported by month and active partner.
- Survey status and official URL appear on the partnership timeline.
- Re-raise creates linked cycle and preserves prior-cycle history.
- Workbook mapping is versioned and compared against synthetic golden file; real workbook stays out of Git.
