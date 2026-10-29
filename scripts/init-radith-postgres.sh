#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"
WEB_ENV="$ROOT/apps/web/.env.local"
DB_NAME="crm_dev"
DB_USER="crm_app"
DB_PORT="5433"
ALLOWLIST="crm.lead.demo@example.invalid,bd.staff.demo@example.invalid"

if [[ -e "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE already exists. It was not changed. Inspect it privately and configure the expected CRM_DB_* values, DATABASE_URL and port $DB_PORT manually."
  exit 2
fi
if [[ -e "$WEB_ENV" ]]; then
  echo "ERROR: $WEB_ENV already exists. It was not changed. Merge the DATABASE_URL, CRM_ALLOWED_EMAILS and CRM_DEMO_MODE settings manually."
  exit 2
fi
if [[ ! -f "$ROOT/apps/web/scripts/dev-db-setup.mts" ]]; then
  echo "ERROR: this repository branch lacks the PostgreSQL demo setup script. Fetch origin/demo/postgres-live first."
  exit 2
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: Docker CLI unavailable. Install/start Docker Desktop and enable WSL integration, or run this script in a shell where docker compose works."
  exit 2
fi
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker Desktop daemon is not running or this shell is not integrated with it. Start Docker Desktop and enable WSL integration, then retry. No env files were written."
  exit 2
fi
if command -v ss >/dev/null 2>&1 && ss -H -ltn 2>/dev/null | awk '$4 ~ /:5433$/ { found=1 } END { exit !found }'; then
  echo "ERROR: host port 5433 is already listening. Inspect the existing service first; do not stop native PostgreSQL. Choose a free port and update DB_PORT consistently in this script and Compose config. No env files were written."
  exit 2
fi

PASSWORD="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
URL="postgresql://${DB_USER}:${PASSWORD}@127.0.0.1:${DB_PORT}/${DB_NAME}?sslmode=disable"
umask 077
cat > "$ENV_FILE" <<EOF
# Local-only development environment. Git-ignored. Never commit this file.
CRM_DB_NAME=${DB_NAME}
CRM_DB_USER=${DB_USER}
CRM_DB_PASSWORD=${PASSWORD}
CRM_DB_PORT=${DB_PORT}
DATABASE_URL=${URL}
DATABASE_SSL=disable
CRM_ALLOWED_EMAILS=${ALLOWLIST}
CRM_DEMO_MODE=1
EOF
mkdir -p "$(dirname "$WEB_ENV")"
cat > "$WEB_ENV" <<EOF
# Local-only demo connection. Git-ignored. Never commit this file.
DATABASE_URL=${URL}
DATABASE_SSL=disable
CRM_ALLOWED_EMAILS=${ALLOWLIST}
CRM_DEMO_MODE=1
EOF
chmod 600 "$ENV_FILE" "$WEB_ENV"
echo "Created git-ignored local environment files (credentials not printed)."
echo "Next: source .env && docker compose up -d --wait postgres && pnpm tsx apps/web/scripts/dev-db-setup.mts"
