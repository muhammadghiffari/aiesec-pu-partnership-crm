# Engagement, scorecard, re-raise, ESSM import/export and dashboards

**Design notes:**

# Design — E5 Post Survey and ESSM Operations

Use a versioned ESSM mapping manifest to translate workbook headers/columns/dropdowns into normalized fields. Import is a dry-run preview followed by an idempotent transactional commit with row fingerprint ledger. Invalid/unknown dropdowns must be reviewed and never silently coerced.

Reports consume domain services/typed queries and expose separate actual financial, in-kind and merchandise values. The national survey integration is link/status only; no Google Forms response scraping/API use without authorization.
