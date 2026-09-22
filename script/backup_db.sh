set -euo pipefail

HOST="127.0.0.1"
PORT="5433"
USER="postgres"
PASSWORD="postgres"
DATABASE="helpdesk"
BACKUP_DIR="./backups"

mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTFILE="$BACKUP_DIR/${DATABASE}_${TIMESTAMP}.dump"

export PGPASSWORD="$PASSWORD"

pg_dump \
    --host="$HOST" \
    --port="$PORT" \
    --username="$USER" \
    --dbname="$DATABASE" \
    --format=custom \
    --file="$OUTFILE" \
    --verbose

echo "Backup written to: $OUTFILE"