#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
COMPOSE_PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

mkdir -p "$BACKUP_DIR"

cd "$COMPOSE_PROJECT_DIR"

DB_USER="$(grep '^DB_USER=' .env | cut -d= -f2-)"
DB_NAME="$(grep '^DB_NAME=' .env | cut -d= -f2-)"

docker exec shopchik_db pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql"
find "$BACKUP_DIR" -type f -name "${DB_NAME}_*.sql" -mtime +14 -delete

echo "Backup created: $BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql"
