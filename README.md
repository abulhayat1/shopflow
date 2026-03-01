# 🛍️ ShopFlow — Phase 1: Foundation

> **Platform Engineering Course | Phase 1 of 5**  
> You are the **Platform Engineer**. I am your **architect**.  
> Before we automate anything, we must understand what we're automating.

---

## 🏗️ What You've Built

```
shopflow/
├── services/
│   ├── gateway/              ← API Gateway (port 3000) — single entry point
│   ├── user-service/         ← Auth + user profiles (port 3001)
│   ├── product-service/      ← Product catalog + inventory (port 3002)
│   ├── order-service/        ← Orders + checkout with DB transactions (port 3003)
│   └── notification-service/ ← Email/alert dispatcher (port 3004)
└── infra/
    ├── nginx/nginx.conf      ← Reverse proxy (port 80)
    ├── postgres/init.sql     ← Schema + seed data for all 3 databases
    └── scripts/
        ├── start.sh          ← Start all services in correct order
        ├── stop.sh           ← Graceful shutdown
        └── health.sh         ← Check all service health endpoints
```

---

## 🚀 Quick Start

### 1. Prerequisites

```bash
# Check you have these installed:
node --version    # Node.js 18+
npm --version
psql --version    # PostgreSQL 14+
git --version
```

### 2. Initialize the Database

```bash
# macOS: start PostgreSQL
brew services start postgresql@15

# Run the init script (creates DBs, tables, and seeds sample products)
psql -U postgres -f infra/postgres/init.sql
```

### 3. Install Dependencies

```bash
# Installs npm packages for all services at once
for svc in user-service product-service order-service notification-service gateway; do
  echo "Installing $svc..."
  (cd services/$svc && npm install)
done
```

### 4. Start ShopFlow

```bash
./infra/scripts/start.sh
```

### 5. Check Health

```bash
./infra/scripts/health.sh
```

---

## 🧪 Test the API

```bash
# 1. Register a user
curl -s -X POST http://localhost:3000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com","password":"secret123"}' | jq

# 2. Login
curl -s -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"secret123"}' | jq

# 3. Browse products
curl -s http://localhost:3000/api/products | jq

# 4. Place an order (use your user_id and product IDs from above)
curl -s -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"user_id":1,"items":[{"product_id":1,"quantity":2}]}' | jq

# 5. Check health of all services
./infra/scripts/health.sh
```

---

## 📚 Phase 1 Architect Lessons

### Lesson 1: The Reverse Proxy Pattern
```
Browser → Nginx (port 80) → Gateway (port 3000) → Services (3001-3004)
```
External clients never talk to individual services. Nginx and the Gateway are the **two layers of defense** before traffic reaches business logic.

**Why two layers?**
- **Nginx**: SSL termination, static files, connection management — infrastructure concerns
- **Gateway**: Auth, rate limiting, routing, request logging — application concerns

### Lesson 2: Service Discovery Problem (Phase 1 Problem)
Open `services/gateway/index.js`. Notice:
```javascript
const services = {
  users: process.env.USER_SERVICE_URL || 'http://localhost:3001',
  // ...
```
The gateway **hardcodes where services live**. What happens if:
- A service crashes and restarts on a different port?
- You scale to 3 instances of `product-service`?

➡️ This is why **Kubernetes Service Discovery** exists (Phase 2).

### Lesson 3: The Startup Order Problem
Look at `infra/scripts/start.sh`. Services start in this order:
```
PostgreSQL → user-service → product-service → order-service → notification-service → gateway
```
**Why does this matter?** `order-service` calls `product-service` on startup-time validation. If `product-service` isn't up yet, `order-service` would crash.

➡️ In Phase 2, Kubernetes handles this with **readinessProbes** and **init containers**.

### Lesson 4: No Cross-Service Foreign Keys
Open `infra/postgres/init.sql`. The `order_items` table has:
```sql
product_id  INTEGER NOT NULL  -- NO FOREIGN KEY to product-service DB
```
This is intentional. Each service **owns its data**. Cross-service data references are by **ID only** — not enforced by the DB. This is the **Database-per-Service** pattern.

➡️ Trade-off: you lose referential integrity, but services can deploy and scale **independently**.

### Lesson 5: Health Endpoints are Non-Negotiable
Every service exposes `GET /health`. Notice it checks more than just "is the process alive?":
```json
{ "status": "ok", "service": "user-service", "db": "connected" }
```
It tells you **db connectivity** too. A service that's alive but can't reach its DB is **unhealthy** — the load balancer should stop sending it traffic.

➡️ In Phase 2, this maps directly to K8s `livenessProbe` and `readinessProbe`.

---

## 🎯 Phase 1 Challenges (Do these before Phase 2!)

**Challenge 1 (Easy)**: Add a `GET /api/products?category=Electronics` filter and test it.

**Challenge 2 (Medium)**: The `notification-service` logs to console. Add a simple in-memory log array that stores the last 50 notifications. Expose it at `GET /api/notifications/recent`.

**Challenge 3 (Hard)**: The gateway has no authentication. Add a middleware that:
1. Reads the `Authorization: Bearer <token>` header
2. Verifies the JWT (use the same `JWT_SECRET` as `user-service`)
3. Rejects requests to `/api/orders` if no valid token is present

*(Hint: This is called an **auth middleware** — in Phase 2 it moves to a K8s Ingress annotation)*

---

## ⏭️ What's Next: Phase 2 — Containerization

In Phase 2 you will:
- Write a `Dockerfile` for each service
- Run the full stack with one `docker compose up` command
- Deploy to a local Kubernetes cluster
- Write your first Helm chart

**The goal**: Never again run `./start.sh` manually. The platform does it for you.
