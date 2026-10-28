#!/usr/bin/env bash
set -euo pipefail
REPO="${GITHUB_REPO:-muhammadghiffari/aiesec-pu-partnership-crm}"
command -v gh >/dev/null || { echo "Install/authenticate GitHub CLI first." >&2; exit 1; }
gh auth status
# Baseline labels: NAME|HEX. This helper creates labels/milestones only; create issues from docs/IMPLEMENTATION_PLAN.md.
for spec in \
  "area:product|0366d1" "area:web|1d76db" "area:core|d876e3" "area:db|fbca04" \
  "area:ai|0e8a16" "area:worker|5319e7" "area:companion|0052cc" "area:docs|0075ca" \
  "schema-lock|d93f0b" "needs-triage|cfd3d7" "blocked|b60205"; do
  name="${spec%%|*}"; hex="${spec##*|}"
  gh label create "$name" --repo "$REPO" --color "$hex" --force >/dev/null || true
done
for m in "M0 Foundation" "M1 Core ESSM" "M2 Prospecting Outreach" "M3 Sales Close Deal" "M4 Implementation Revenue Merchandise" "M5 Engagement Survey Import Export" "M6 Hardening UAT"; do
  gh api "repos/$REPO/milestones" -f title="$m" >/dev/null 2>&1 || echo "Milestone may already exist or API permission missing: $m"
done
echo "Baseline labels/milestones processed for $REPO. Create individual issues from docs/IMPLEMENTATION_PLAN.md and assign one owner/reviewer each."
