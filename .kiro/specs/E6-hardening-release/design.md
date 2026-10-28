# Security, UAT, reliability and release handover

**Design notes:**

# Design — E6 Hardening and Release

Use test evidence and reviewed ADRs, not model output claims, to decide readiness. Add rate limits, bounded queues, operational switches, structured redacted logs, database backup/restore and release runbook. Keep Companion disabled if platform compliance is uncertain. Production secrets live only in hosting/GitHub secret stores.
