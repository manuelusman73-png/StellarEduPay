#!/usr/bin/env bash
# backup.sh — Create a compressed mongodump of the StellarEduPay database.
#
# Usage:
#   MONGO_URI=mongodb://localhost:27017/stellaredupay \
#   BACKUP_DIR=/backups \
#   ./scripts/backup.sh
#
# Environment variables:
#   MONGO_URI       — MongoDB connection string (required)
#   BACKUP_DIR      — Directory to store backups (default: ./backups)
#   RETAIN_DAYS     — Days to keep old backups (default: 7)
#   WEBHOOK_URL     — Optional webhook URL for failure alerts
#   MIN_BACKUP_SIZE — Minimum expected backup size in bytes (default: 1024)

set -euo pipefail

MONGO_URI="${MONGO_URI:?MONGO_URI is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETAIN_DAYS="${RETAIN_DAYS:-7}"
WEBHOOK_URL="${WEBHOOK_URL:-}"
MIN_BACKUP_SIZE="${MIN_BACKUP_SIZE:-1024}"
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
BACKUP_PATH="${BACKUP_DIR}/${TIMESTAMP}"

mkdir -p "${BACKUP_DIR}"

# Function to send alert
send_alert() {
  local message="$1"
  echo "[backup] ALERT: ${message}" >&2
  
  if [[ -n "${WEBHOOK_URL}" ]]; then
    curl -X POST "${WEBHOOK_URL}" \
      -H "Content-Type: application/json" \
      -d "{\"text\":\"[StellarEduPay Backup] ${message}\",\"timestamp\":\"${TIMESTAMP}\"}" \
      --max-time 10 \
      --silent \
      --show-error || echo "[backup] Failed to send webhook alert" >&2
  fi
}

echo "[backup] Starting backup → ${BACKUP_PATH}.gz"

# Run mongodump
if ! mongodump --uri="${MONGO_URI}" --archive="${BACKUP_PATH}.gz" --gzip; then
  send_alert "mongodump failed with exit code $?"
  exit 1
fi

# Verify backup file exists
if [[ ! -f "${BACKUP_PATH}.gz" ]]; then
  send_alert "Backup file ${BACKUP_PATH}.gz was not created"
  exit 1
fi

# Verify backup file is non-empty and meets minimum size
BACKUP_SIZE=$(stat -c%s "${BACKUP_PATH}.gz" 2>/dev/null || stat -f%z "${BACKUP_PATH}.gz" 2>/dev/null || echo "0")
if [[ "${BACKUP_SIZE}" -lt "${MIN_BACKUP_SIZE}" ]]; then
  send_alert "Backup file ${BACKUP_PATH}.gz is too small (${BACKUP_SIZE} bytes, expected at least ${MIN_BACKUP_SIZE})"
  rm -f "${BACKUP_PATH}.gz"
  exit 1
fi

echo "[backup] Backup created: ${BACKUP_PATH}.gz ($(du -sh "${BACKUP_PATH}.gz" | cut -f1))"

# Verify backup integrity with mongorestore --dryRun
echo "[backup] Verifying backup integrity..."
if ! mongorestore --archive="${BACKUP_PATH}.gz" --gzip --dryRun 2>&1 | grep -q "done"; then
  send_alert "Backup verification failed — mongorestore --dryRun did not complete successfully"
  rm -f "${BACKUP_PATH}.gz"
  exit 1
fi

echo "[backup] ✓ Backup verified successfully"

# Remove backups older than RETAIN_DAYS
PRUNED=$(find "${BACKUP_DIR}" -name "*.gz" -mtime "+${RETAIN_DAYS}" -delete -print | wc -l)
if [[ "${PRUNED}" -gt 0 ]]; then
  echo "[backup] Pruned ${PRUNED} backup(s) older than ${RETAIN_DAYS} days"
fi

echo "[backup] Backup complete"
