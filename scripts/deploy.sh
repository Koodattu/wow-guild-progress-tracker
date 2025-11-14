#!/bin/bash

# WoW Guild Progress Tracker - Auto Deploy Script
# This script is designed to be run every minute via cron
# It checks for updates and deploys them automatically with proper locking

set -e

# Configuration
PROJECT_DIR="$HOME/wow-guild-progress-tracker"
REPO_URL="https://github.com/Koodattu/wow-guild-progress-tracker.git"
LOCKFILE="$PROJECT_DIR/.deploy.lock"
COMPOSE_FILE="docker-compose.prod.yml"
LOCK_TIMEOUT=600  # 10 minutes in seconds

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

# Check if another deployment is running
check_lock() {
    if [ -f "$LOCKFILE" ]; then
        local lock_pid=$(cat "$LOCKFILE")
        local lock_time=$(stat -c %Y "$LOCKFILE" 2>/dev/null || stat -f %m "$LOCKFILE" 2>/dev/null || echo 0)
        local lock_age=$(($(date +%s) - lock_time))

        # Check if the process is still running
        if kill -0 "$lock_pid" 2>/dev/null; then
            if [ "$lock_age" -gt "$LOCK_TIMEOUT" ]; then
                warn "Lock file is older than $LOCK_TIMEOUT seconds. Removing stale lock."
                rm -f "$LOCKFILE"
                return 0
            else
                log "Another deployment is in progress (PID: $lock_pid). Exiting."
                exit 0
            fi
        else
            warn "Removing stale lock file (process $lock_pid not running)"
            rm -f "$LOCKFILE"
        fi
    fi
    return 0
}

# Create lock file
create_lock() {
    echo $$ > "$LOCKFILE"
    log "Lock acquired (PID: $$)"
}

# Remove lock file
remove_lock() {
    if [ -f "$LOCKFILE" ]; then
        rm -f "$LOCKFILE"
        log "Lock released"
    fi
}

# Trap to ensure lock is removed on exit
trap remove_lock EXIT INT TERM

# Main deployment function
deploy() {
    log "Starting deployment check..."

    # Change to project directory
    if [ ! -d "$PROJECT_DIR" ]; then
        error "Project directory not found: $PROJECT_DIR"
        exit 1
    fi

    cd "$PROJECT_DIR"
    log "Changed to project directory: $PROJECT_DIR"

    # Fetch latest changes
    log "Fetching latest changes from remote..."
    git fetch "$REPO_URL" main 2>&1 || {
        error "Failed to fetch from remote repository"
        exit 1
    }

    # Get local and remote commit IDs
    LOCAL_COMMIT=$(git rev-parse HEAD)
    REMOTE_COMMIT=$(git rev-parse FETCH_HEAD)

    log "Local commit:  $LOCAL_COMMIT"
    log "Remote commit: $REMOTE_COMMIT"

    # Compare commits
    if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
        log "Already up to date. No deployment needed."
        exit 0
    fi

    log "New changes detected! Starting deployment..."

    # Pull latest changes
    log "Pulling latest changes..."
    git pull "$REPO_URL" main || {
        error "Failed to pull changes"
        exit 1
    }

    log "Successfully pulled changes"

    # Stop all running containers
    log "Stopping running containers..."
    RUNNING_CONTAINERS=$(docker ps -q)
    if [ -n "$RUNNING_CONTAINERS" ]; then
        docker stop $RUNNING_CONTAINERS || warn "Failed to stop some containers"
        log "Containers stopped"
    else
        log "No running containers to stop"
    fi

    # Build and start containers with extended timeout
    log "Building and starting containers (this may take up to 10 minutes)..."
    COMPOSE_HTTP_TIMEOUT=600 DOCKER_CLIENT_TIMEOUT=600 docker compose -f "$COMPOSE_FILE" up --build -d || {
        error "Failed to build and start containers"
        exit 1
    }

    log "Containers successfully built and started"

    # Optional: Wait a bit and check if containers are running
    sleep 5
    RUNNING_COUNT=$(docker ps -q | wc -l)
    log "Currently running containers: $RUNNING_COUNT"

    log "Deployment completed successfully!"
    log "Deployed commit: $REMOTE_COMMIT"
}

# Main execution
main() {
    log "=== WoW Guild Progress Tracker Auto Deploy ==="

    # Check for lock
    check_lock

    # Create lock
    create_lock

    # Run deployment
    deploy
}

# Run main function
main
