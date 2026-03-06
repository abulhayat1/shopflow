#!/usr/bin/env bash

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PIDS_DIR="${ROOT_DIR}/.pids"

log()  { echo -e "${BLUE}[stop]${NC} $*"; }
ok()   { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }

stop_service() {
  local name=$1
  local pid_file="${PIDS_DIR}/${name}.pid"

  if [ -f "$pid_file" ]; then
    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" && ok "Stopped ${name} (PID ${pid})"
    else
      warn "${name} was not running (stale PID ${pid})"
    fi
    rm -f "$pid_file"
  else
    warn "No PID file for ${name}"
  fi
}

log "Stopping ShopFlow services..."

stop_service "gateway"
stop_service "notification-service"
stop_service "order-service"
stop_service "product-service"
stop_service "user-service"

if command -v nginx &>/dev/null; then
  nginx -s quit 2>/dev/null && ok "Nginx stopped" || warn "Nginx was not running"
fi

echo ""
echo -e "${GREEN}ShopFlow stopped.${NC}"
