#!/usr/bin/env bash
# ================================================================
# ShopFlow - Master Startup Script
# Usage: ./infra/scripts/start.sh
#
# ARCHITECT NOTE: This script is your Phase 1 "orchestrator."
# It starts services in the CORRECT ORDER because they have
# dependencies on each other:
#
#   PostgreSQL → Services → Gateway → Nginx
#
# In Phase 2 (Kubernetes), K8s handles startup ordering via
# readiness probes and init containers — no bash scripts needed.
# For now, this teaches you WHY ordering matters.
# ================================================================

set -euo pipefail  # Fail fast on any error (good practice!)

# Color output for readability
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LOGS_DIR="${ROOT_DIR}/logs"
PIDS_DIR="${ROOT_DIR}/.pids"

mkdir -p "$LOGS_DIR" "$PIDS_DIR"

log()   { echo -e "${BLUE}[start]${NC} $*"; }
ok()    { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*"; exit 1; }

# ── Wait for a port to become available ───────────────────────
wait_for_port() {
  local service=$1 port=$2 retries=15
  log "Waiting for ${service} on port ${port}..."
  for i in $(seq 1 $retries); do
    if nc -z localhost "$port" 2>/dev/null; then
      ok "${service} is ready on port ${port}"
      return 0
    fi
    sleep 1
  done
  error "${service} failed to start on port ${port} after ${retries}s"
}

# ── Start a Node.js service ────────────────────────────────────
start_service() {
  local name=$1 dir=$2 port=$3
  log "Starting ${name} on port ${port}..."

  if [ -f "${PIDS_DIR}/${name}.pid" ]; then
    local existing_pid
    existing_pid=$(cat "${PIDS_DIR}/${name}.pid")
    if kill -0 "$existing_pid" 2>/dev/null; then
      warn "${name} already running (PID ${existing_pid}), skipping"
      return 0
    fi
  fi

  cd "$dir"
  node index.js >> "${LOGS_DIR}/${name}.log" 2>&1 &
  echo $! > "${PIDS_DIR}/${name}.pid"
  wait_for_port "$name" "$port"
}

# ── STEP 1: Check PostgreSQL ───────────────────────────────────
log "Checking PostgreSQL..."
if ! pg_isready -q; then
  error "PostgreSQL is not running. Start it first:
  macOS:  brew services start postgresql@15
  Linux:  sudo systemctl start postgresql"
fi
ok "PostgreSQL is ready"

# ── STEP 2: Start Microservices ────────────────────────────────
log "Starting ShopFlow microservices..."

start_service "user-service"         "${ROOT_DIR}/services/user-service"         3001
start_service "product-service"      "${ROOT_DIR}/services/product-service"      3002
start_service "order-service"        "${ROOT_DIR}/services/order-service"        3003
start_service "notification-service" "${ROOT_DIR}/services/notification-service" 3004

# ── STEP 3: Start API Gateway ──────────────────────────────────
start_service "gateway" "${ROOT_DIR}/services/gateway" 3000

# ── STEP 4: Check Nginx (optional in Phase 1) ─────────────────
if command -v nginx >/dev/null 2>&1; then
  log "Checking nginx config..."

  if nginx -t -c "${ROOT_DIR}/infra/nginx/nginx.conf"; then
    if pgrep nginx >/dev/null; then
      warn "Nginx already running — skipping start"
    else
      log "Starting nginx..."
      nginx -c "${ROOT_DIR}/infra/nginx/nginx.conf"
      ok "Nginx started — ShopFlow available at http://localhost"
    fi
  else
    warn "Nginx config test failed — skipping nginx"
  fi
else
  warn "Nginx not installed — services available via port 3000"
fi

# ── Done ───────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     🛍️  ShopFlow is running!              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo "  Gateway:              http://localhost:3000"
echo "  via Nginx (if up):    http://localhost"
echo ""
echo "  Endpoints:"
echo "    POST   /api/users/register"
echo "    POST   /api/users/login"
echo "    GET    /api/products"
echo "    POST   /api/orders"
echo ""
echo "  Logs:    ${LOGS_DIR}/"
echo "  PIDs:    ${PIDS_DIR}/"
echo ""
echo "  To stop: ./infra/scripts/stop.sh"
