#!/usr/bin/env bash
# Dumps the full Postgres database (all tables) referenced by DATABASE_URL
# in server/.env into server/backups/ as a timestamped custom-format dump.
#
# Usage:
#   ./scripts/backup-db.sh              # dump to server/backups/
#   ./scripts/backup-db.sh /some/dir    # dump to a custom directory
#
# Restore with:npx prisma studio
#   pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" <file>.dump

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$SERVER_DIR/.env"
BACKUP_DIR="${1:-$SERVER_DIR/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found." >&2
  exit 1
fi

DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '"'"'"'')"

if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL not set in $ENV_FILE." >&2
  exit 1
fi

command -v pg_dump >/dev/null 2>&1 || { echo "Error: pg_dump not found on PATH." >&2; exit 1; }

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DUMP_FILE="$BACKUP_DIR/helpdesk_${TIMESTAMP}.dump"

echo "Dumping database to $DUMP_FILE ..."
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$DUMP_FILE"

echo "Backup complete: $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"

if [ "$RETENTION_DAYS" -gt 0 ]; then
  echo "Pruning backups older than $RETENTION_DAYS day(s) in $BACKUP_DIR ..."
  find "$BACKUP_DIR" -maxdepth 1 -name 'helpdesk_*.dump' -mtime "+$RETENTION_DAYS" -print -delete
fi
