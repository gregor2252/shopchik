#!/bin/bash
set -e

PROJECT_DIR="/opt/finess_shop/shopchik"
BACKUP_DIR="$PROJECT_DIR/backups"
DATE="$(date +%F_%H-%M)"

DB_USER="shopchik_user"
DB_NAME="shopchik_db"
UPLOADS_VOLUME="shopchik_uploads"

mkdir -p "$BACKUP_DIR"

cd "$PROJECT_DIR"

docker compose exec -T db pg_dump \
-U "$DB_USER" \
-d "$DB_NAME" \
> "$BACKUP_DIR/db_$DATE.sql"

docker run --rm \
-v "$UPLOADS_VOLUME:/uploads:ro" \
-v "$BACKUP_DIR:/backups" \
alpine tar -czf "/backups/uploads_$DATE.tar.gz" -C /uploads .

find "$BACKUP_DIR" -type f -name "db_*.sql" -mtime +14 -delete
find "$BACKUP_DIR" -type f -name "uploads_*.tar.gz" -mtime +14 -delete
