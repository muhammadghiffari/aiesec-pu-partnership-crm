#!/usr/bin/env bash
set -euo pipefail

OWNER="${GITHUB_OWNER:-muhammadghiffari}"
REPO="${GITHUB_REPO_NAME:-aiesec-pu-partnership-crm}"
COLLABORATOR="${GITHUB_NEW_DEVELOPER:-hicesse}"
FULL_REPO="$OWNER/$REPO"
DESCRIPTION="AIESEC in President University — ESSM-aligned Partnership CRM for the BD subdivision. Internal use only."

command -v gh >/dev/null || { echo "GitHub CLI (gh) is required." >&2; exit 1; }
command -v git >/dev/null || { echo "git is required." >&2; exit 1; }
gh auth status
if [[ -z "$(git config user.name || true)" || -z "$(git config user.email || true)" ]]; then
  echo "Set your local Git author before running this script, e.g. git config user.name 'Muhammad Ghiffari' and git config user.email '<your verified GitHub email>'." >&2
  exit 4
fi
if [[ "$OWNER" != "muhammadghiffari" ]]; then
  echo "Target owner override: $OWNER. Confirm this is intentional before continuing." >&2
  read -r -p "Type the exact owner username to continue: " CONFIRM
  [[ "$CONFIRM" == "$OWNER" ]] || { echo "Owner confirmation failed."; exit 1; }
fi
if gh repo view "$FULL_REPO" >/dev/null 2>&1; then
  echo "Repository $FULL_REPO already exists. Refusing to overwrite or push automatically." >&2
  echo "Clone it and review carefully before merging this pack." >&2
  exit 2
fi
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git init -b main
fi
if git remote get-url origin >/dev/null 2>&1; then
  echo "An origin remote already exists. Refusing to replace it automatically." >&2
  exit 3
fi
# Commit handover content before creating and pushing the remote.
git add -A
if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  git commit -m "chore: add ESSM-aligned CRM implementation handover"
else
  if ! git diff --cached --quiet; then
    git commit -m "chore: update CRM implementation handover"
  fi
fi
gh repo create "$FULL_REPO" --private --source=. --remote=origin --push --description "$DESCRIPTION"
gh repo edit "$FULL_REPO" --enable-issues --enable-wiki=false --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false --delete-branch-on-merge || echo "Some repository settings were unavailable; review Settings manually."
if gh api -X PUT "repos/$FULL_REPO/collaborators/$COLLABORATOR" -f permission=push >/dev/null; then
  echo "Write-access invitation issued to $COLLABORATOR. The collaborator must accept it."
else
  echo "Could not invite $COLLABORATOR automatically. Check spelling, permissions, and repository settings; invite manually." >&2
fi
if [[ -n "${CATALNA_GITHUB_USER:-}" ]]; then
  gh api -X PUT "repos/$FULL_REPO/collaborators/$CATALNA_GITHUB_USER" -f permission=push >/dev/null \
    && echo "Write-access invitation issued to $CATALNA_GITHUB_USER." \
    || echo "Could not invite Catalna handle provided in CATALNA_GITHUB_USER; check it manually." >&2
else
  echo "Catalna invitation skipped: set CATALNA_GITHUB_USER only after confirming her exact handle."
fi

echo "Created and pushed private repository: https://github.com/$FULL_REPO"
echo "Next: verify collaborators, set up issue labels/milestones, then start M0-02."
