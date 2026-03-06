#!/usr/bin/env bash

set -uo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

services=(
  "gateway:3000"
  "user-service:3001"
  "product-service:3002"
  "order-service:3003"
  "notification-service:3004"
)

all_healthy=true

echo ""
echo "  ShopFlow Health Status"
echo "  ─────────────────────────────────────"

for entry in "${services[@]}"; do
  name="${entry%%:*}"
  port="${entry##*:}"

  response=$(curl -s -o /tmp/shopflow_health.json -w "%{http_code}" \
    --max-time 3 "http://localhost:${port}/health" 2>/dev/null || echo "000")

  if [ "$response" = "200" ]; then
    db_status=$(python3 -c "import json,sys; d=json.load(open('/tmp/shopflow_health.json')); print(d.get('db','n/a'))" 2>/dev/null || echo "n/a")
    echo -e "  ${GREEN}✓${NC}  ${name} (port ${port})   db: ${db_status}"
  else
    echo -e "  ${RED}✗${NC}  ${name} (port ${port})   HTTP ${response}"
    all_healthy=false
  fi
done

echo "  ─────────────────────────────────────"
if $all_healthy; then
  echo -e "  ${GREEN}All services healthy ✓${NC}"
else
  echo -e "  ${YELLOW}Some services are unhealthy — check logs/${NC}"
fi
echo ""
