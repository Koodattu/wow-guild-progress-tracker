#!/bin/bash

# WoW Guild Progress Tracker - Auto Deploy Script
set -e

# Configuration
PROJECT_DIR="$HOME/wow-guild-progress-tracker"
REPO_URL="https://github.com/Koodattu/wow-guild-progress-tracker.git"
LOCKFILE="$PROJECT_DIR/.deploy.lock"
COMPOSE_FILE="docker-compose.prod.yml"
LOCK_TIMEOUT=1200

# --- BACKUP CONFIGURATION ---
BACKUP_DIR="$HOME/wow-backups"
DB_CONTAINER_NAME="wow-prog-db"
RETENTION_DAYS=7
MAX_BACKUPS=5
# ----------------------------

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"; }
error() { echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2; }
warn() { echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"; }

check_lock() {
    if [ -f "$LOCKFILE" ]; then
        local lock_pid=$(cat "$LOCKFILE")
        local lock_time=$(stat -c %Y "$LOCKFILE" 2>/dev/null || stat -f %m "$LOCKFILE" 2>/dev/null || echo 0)
        local lock_age=$(($(date +%s) - lock_time))

        if kill -0 "$lock_pid" 2>/dev/null; then
            if [ "$lock_age" -gt "$LOCK_TIMEOUT" ]; then
                warn "Lock file is older than $LOCK_TIMEOUT seconds. Removing stale lock."
                rm -f "$LOCKFILE"
            else
                log "Another deployment is in progress (PID: $lock_pid). Exiting."
                exit 0
            fi
        else
            warn "Removing stale lock file (process $lock_pid not running)"
            rm -f "$LOCKFILE"
        fi
    fi
}

create_lock() { echo $$ > "$LOCKFILE"; log "Lock acquired (PID: $$)"; }
remove_lock() { [ -f "$LOCKFILE" ] && rm -f "$LOCKFILE" && log "Lock released"; }

trap remove_lock EXIT INT TERM

backup_db() {
    log "Starting database backup..."

    mkdir -p "$BACKUP_DIR"

    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_NAME="wow_db_backup_$TIMESTAMP.gz"
    BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"

    # Check if container is running
    if ! docker ps -q -f name=^/${DB_CONTAINER_NAME}$ > /dev/null; then
        warn "Database container '$DB_CONTAINER_NAME' is not running. Skipping backup."
        return 0
    fi

    # Run mongodump
    log "Streaming dump to $BACKUP_PATH..."
    docker exec "$DB_CONTAINER_NAME" mongodump --archive --gzip > "$BACKUP_PATH" || {
        error "Database backup failed!"
        return 1
    }

    log "Backup completed: $BACKUP_NAME"

    # --- KEEP ONLY 5 LATEST ---
    log "Cleaning up old backups (keeping latest $MAX_BACKUPS)..."

    # 1. List files matching the pattern
    # 2. Sort by modification time (oldest first)
    # 3. head -n -$MAX_BACKUPS selects all EXCEPT the last 5
    # 4. xargs rm deletes them
    ls -1tr "$BACKUP_DIR"/wow_db_backup_*.gz 2>/dev/null | head -n -$MAX_BACKUPS | xargs -r rm

    log "Cleanup finished. Current backups in storage:"
    ls -lh "$BACKUP_DIR" | grep "wow_db_backup"
}

deploy() {
    log "Starting deployment check..."

    if [ ! -d "$PROJECT_DIR" ]; then
        error "Project directory not found: $PROJECT_DIR"
        exit 1
    fi

    cd "$PROJECT_DIR"

    # Check if we're on main branch
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
    if [ "$CURRENT_BRANCH" != "main" ]; then
        log "Not on main branch (current: $CURRENT_BRANCH). Skipping deployment."
        exit 0
    fi

    # Fetch latest changes
    log "Fetching latest changes..."
    git fetch "$REPO_URL" main 2>&1 || { error "Failed to fetch"; exit 1; }

    LOCAL_COMMIT=$(git rev-parse HEAD)
    REMOTE_COMMIT=$(git rev-parse FETCH_HEAD)

    if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
        log "Already up to date. No deployment needed."
        exit 0
    fi

    log "New changes detected! Starting backup before deployment..."

    # RUN BACKUP BEFORE DEPLOYING
    backup_db || {
        error "Deployment aborted because backup failed."
        exit 1
    }

    log "Pulling latest changes..."
    git pull "$REPO_URL" main || { error "Failed to pull changes"; exit 1; }

    log "Building and starting containers..."
    COMPOSE_HTTP_TIMEOUT=720 DOCKER_CLIENT_TIMEOUT=720 docker compose -f "$COMPOSE_FILE" up --build -d || {
        error "Failed to build and start containers"
        exit 1
    }

    sleep 5
    RUNNING_COUNT=$(docker ps -q | wc -l)
    log "Deployment completed. Running containers: $RUNNING_COUNT"
}

main() {
    log "=== WoW Guild Progress Tracker Auto Deploy ==="
    check_lock
    create_lock
    deploy
}

main