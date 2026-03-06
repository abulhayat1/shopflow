# ShopFlow — Platform Engineering Tutorial
## What we built, why we built it, and how it all fits together

---

## The Big Picture

Before any code, understand this mental model:

```
Phase 1 → Run code manually on your laptop
Phase 2 → Package code into containers, let Kubernetes manage them
Phase 3 → Automate everything — no more manual steps
Phase 4 → See what's happening inside (Observability)
Phase 5 → Self-service for developers (Internal Developer Platform)
```

Each phase solves a real problem that the previous phase created.

---

## Phase 1 — Running Services Manually

### What we built
5 Node.js microservices running directly on your machine:
- `user-service` — register/login (port 3001)
- `product-service` — product catalog (port 3002)
- `order-service` — place orders (port 3003)
- `notification-service` — send alerts (port 3004)
- `gateway` — single entry point, routes to the above (port 3000)

### Why microservices instead of one big app?

**One big app (monolith):**
```
If the email notification feature crashes → entire site is down
If you want to scale product browsing → you have to scale everything
If team A deploys → team B's work goes out too (risky)
```

**Microservices:**
```
notification crashes → users can still browse and buy
product-service getting traffic spikes → scale only that service
team A deploys user-service independently of team B's order-service
```

### Why separate databases per service?
Each service owns its own database. `order-service` never directly queries `users` table.

```
BAD:  order-service does SELECT * FROM users WHERE id = ?
GOOD: order-service calls http://user-service:3001/users/123
```

Why? If `user-service` changes its DB schema, `order-service` doesn't break. Services are truly independent.

### The problem Phase 1 created
```bash
# You had to run this manually every time:
./start.sh    # start all 5 services in right order
./stop.sh     # stop them
./health.sh   # check if they're up
```

Problems:
- If `user-service` crashes at 3am → nobody restarts it
- Works on your laptop, breaks on someone else's machine ("it works on my machine")
- No way to run 2 copies of the same service for load balancing

---

## Phase 2 — Docker + Kubernetes

### Part A: Docker — Package your app

**The problem:** "Works on my machine" syndrome.

Your laptop has Node.js 20. The server has Node.js 16. app crashes.
Your laptop has a specific `libssl` version. Server doesn't. App crashes.

**Docker solution:** Package the app AND its entire environment into one file (image).

```dockerfile
FROM node:20-alpine       # exact Node.js version, always
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY index.js .
CMD ["node", "index.js"]  # run it
```

Now you ship the image, not just the code. Runs identically everywhere.

**Why multi-stage builds?**
```dockerfile
# Stage 1: install everything (including dev tools)
FROM node:20-alpine AS builder
RUN npm ci                # installs devDependencies too (tests, build tools)

# Stage 2: only copy what's needed to run
FROM node:20-alpine AS runner
COPY --from=builder /app/node_modules .  # only prod deps
COPY index.js .
```

Result: image goes from ~800MB → ~200MB. Smaller = faster to download, less attack surface.

**Why non-root user?**
```dockerfile
USER node  # run as "node" user, not root
```
If someone hacks your app inside the container, they get `node` user permissions, not `root`. They can't install malware, read `/etc/passwd`, etc.

---

### Part B: docker-compose — Run all services locally

Instead of 5 separate terminal tabs:
```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:15-alpine
  user-service:
    build: ./services/user-service
    depends_on:
      postgres:
        condition: service_healthy  # wait for postgres to be READY, not just started
```

One command replaces your entire `start.sh`:
```bash
docker compose up      # start everything
docker compose down    # stop everything
```

**Key concept — Service Discovery:**
In Phase 1: `DB_HOST=localhost`
In Docker Compose: `DB_HOST=postgres` (container name = hostname)

Docker's internal DNS resolves `postgres` to the postgres container's IP automatically. You never hardcode IPs.

---

### Part C: Kubernetes — The Real Orchestrator

Docker Compose is great for local development. But in production you need:
- Auto-restart if a container crashes
- Load balancing across multiple copies
- Rolling updates with zero downtime
- Resource limits so one service can't eat all CPU

That's Kubernetes.

**Core K8s Resources:**

#### Namespace
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: shopflow
```
A virtual cluster inside your real cluster. Keeps `shopflow` resources separate from `monitoring`, `logging`, etc.

#### ConfigMap — non-secret configuration
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: shopflow-config
  namespace: shopflow
data:
  DB_HOST: "postgres"
  USER_SERVICE_URL: "http://user-service:3001"
```
Why not hardcode in Deployment? Because you want the same Docker image to work in dev (pointing to dev DB) and prod (pointing to prod DB). Only the ConfigMap changes between environments.

#### Secret — sensitive configuration
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: shopflow-secrets
type: Opaque
data:
  DB_PASSWORD: c2hvcGZsb3cxMjM=   # base64 encoded
```
Same as ConfigMap, but:
- Stored separately in etcd
- Don't appear in `kubectl describe pod` logs
- RBAC can restrict which pods can read them

> ⚠️ base64 is NOT encryption. In production we'd use AWS Secrets Manager + External Secrets Operator to inject real encrypted secrets.

#### Deployment — run and maintain N copies of a pod
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
spec:
  replicas: 2        # always keep 2 pods running
  selector:
    matchLabels:
      app: user-service
  template:
    spec:
      containers:
        - name: user-service
          image: shopflow/user-service:local
```

What Kubernetes does with this:
1. Sees you want 2 pods
2. Creates them
3. Pod crashes? Creates a replacement automatically
4. Node (server) dies? Moves pods to another node

**Rolling Update — zero downtime deploys:**
```
Before update: [pod-v1] [pod-v1]
Step 1:        [pod-v1] [pod-v1] [pod-v2]  ← new pod created
Step 2:        [pod-v1] [pod-v2]           ← old pod removed
Step 3:        [pod-v2] [pod-v2] [pod-v2]  ← (if 3 replicas)
Step 4:        [pod-v2] [pod-v2]           ← done
```
Traffic always has pods to go to. Zero downtime.

#### Service — stable network address for pods
```yaml
apiVersion: v1
kind: Service
metadata:
  name: user-service
spec:
  type: ClusterIP
  selector:
    app: user-service   # sends traffic to pods with this label
  ports:
    - port: 3001
```

Pods get random IPs that change every restart. A Service gives you a stable DNS name:
```
http://user-service:3001   ← always works, even as pods come and go
```

#### StatefulSet — for databases (not Deployment)
```yaml
kind: StatefulSet
metadata:
  name: postgres
spec:
  serviceName: postgres
  replicas: 1
```

Why StatefulSet for PostgreSQL instead of Deployment?

| | Deployment | StatefulSet |
|--|--|--|
| Pod name | `pod-abc123` (random) | `postgres-0` (stable) |
| Storage | Shared or ephemeral | Each pod gets its own persistent disk |
| Startup order | Random | Always 0 → 1 → 2 |

PostgreSQL must always be `postgres-0` — clients need a stable hostname to connect to the primary. If it restarts, it gets the same disk back (same data).

#### Probes — health monitoring
```yaml
livenessProbe:          # is the container alive?
  httpGet:
    path: /health
    port: 3001
  failureThreshold: 3   # restart after 3 failures

readinessProbe:         # ready to receive traffic?
  httpGet:
    path: /health
    port: 3001
  failureThreshold: 3   # remove from load balancer after 3 failures
```

`livenessProbe` failure → container RESTARTS
`readinessProbe` failure → container stays up, but gets no traffic (e.g. DB still initializing)

#### Resource Requests and Limits
```yaml
resources:
  requests:
    cpu: "50m"       # 0.05 cores — minimum I need to run
    memory: "64Mi"   # minimum RAM
  limits:
    cpu: "200m"      # 0.2 cores — never give me more than this
    memory: "256Mi"  # if I exceed this → OOMKilled (restarted)
```

Without limits: a memory leak in `order-service` could eat all RAM on the node and crash every other service. Limits prevent "noisy neighbor" problems.

---

## Phase 3 — CI/CD: Automate Everything

### The problem Phase 2 created
Every time you change code, you had to:
```bash
docker build -t shopflow/user-service:local ./services/user-service
kind load docker-image shopflow/user-service:local --name shopflow
kubectl rollout restart deployment/user-service -n shopflow
```

That's 3 commands per service × 5 services = 15 commands every single deploy. Manual. Error-prone. Slow.

### CI/CD solves this

**CI (Continuous Integration):** On every `git push`, automatically build and test your code.
**CD (Continuous Delivery):** On every successful build, automatically deploy to an environment.

### GitHub Actions — our CI pipeline

```yaml
# .github/workflows/ci.yml
on:
  push:
    branches: [main]

jobs:
  build-and-push:
    strategy:
      matrix:
        service: [user-service, product-service, order-service, notification-service, gateway]
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3    # login to GHCR
      - uses: docker/build-push-action@v5
          with:
            context: ./services/${{ matrix.service }}
            push: true
            tags: ghcr.io/abulhayat1/shopflow/${{ matrix.service }}:sha-abc1234
```

What `matrix` does: instead of 5 separate jobs, you define the pattern once. GitHub runs all 5 IN PARALLEL. 5x faster.

**Image tagging strategy:**
```
ghcr.io/abulhayat1/shopflow/user-service:sha-abc1234   ← immutable, specific commit
ghcr.io/abulhayat1/shopflow/user-service:latest        ← latest on main
```

Never deploy `latest` in production — you can't roll back to a specific version. Always use the `sha-` tag.

### GitOps — ArgoCD

**The old way (push-based deploy):**
```
Your CI pipeline → kubectl apply → Kubernetes cluster
```
Problem: CI needs credentials to your cluster. Security risk. Also if someone manually changes K8s, it's out of sync with your repo.

**GitOps (pull-based deploy):**
```
Your CI pipeline → git push → (image tag updated in git)
ArgoCD (running inside cluster) → watches git → sees update → applies to cluster
```

ArgoCD lives inside your cluster. It constantly watches your git repo. When it sees a change, it applies it. Your git repo is the single source of truth.

```yaml
# gitops/argocd-apps/shopflow-dev.yaml
kind: Application
spec:
  source:
    repoURL: https://github.com/abulhayat1/shopflow.git
    path: gitops/overlays/dev    # watch this folder
  syncPolicy:
    automated:
      prune: true      # delete resources removed from git
      selfHeal: true   # revert manual kubectl changes
```

### Kustomize — environment-specific config without duplication

You have 3 environments: dev, staging, prod.
They're 95% the same — only replica count differs.

Without Kustomize: 3 full copies of every manifest (nightmare to maintain).
With Kustomize:

```
gitops/
  base/              ← shared config (5 services, 2 replicas each)
  overlays/
    dev/             ← patch: set all replicas to 1
    staging/         ← no patch (use base)
    prod/            ← patch: set gateway/user/product to 3 replicas
```

The dev overlay:
```yaml
# gitops/overlays/dev/kustomization.yaml
resources:
  - ../../base        # inherit everything from base
patches:
  - target:
      kind: Deployment
    patch: |-
      - op: replace
        path: /spec/replicas
        value: 1      # override: 1 replica in dev to save money
```

---

## The Full Flow — End to End

```
Developer writes code
       ↓
git push → GitHub
       ↓
GitHub Actions CI triggers:
  - Builds 5 Docker images in parallel
  - Pushes to GHCR (ghcr.io/abulhayat1/shopflow/*)
  - Updates image tag in gitops/overlays/dev/*.yaml
  - Commits + pushes that change back to git
       ↓
ArgoCD (running in cluster) detects git changed
  - Applies updated manifests to shopflow-dev namespace
  - Kubernetes does rolling update (zero downtime)
       ↓
Dev environment running latest code ✅

To promote to staging/prod:
  - GitHub Actions → CD workflow → manually trigger
  - Select environment + image tag (sha-abc1234)
  - Updates gitops/overlays/staging/*.yaml
  - ArgoCD picks it up, deploys to staging
```

---

## Coming Up: Phase 4 — Observability

The system is now running and auto-deploying. But:
- How do you know if it's healthy?
- How do you know response times are getting slower?
- How do you know which service caused an error?

That's Observability: **Metrics** (Prometheus), **Dashboards** (Grafana), **Tracing** (Jaeger).

The three pillars:
| Pillar | Tool | Question it answers |
|--------|------|---------------------|
| Metrics | Prometheus | What are the numbers? (req/sec, error rate, latency) |
| Logs | Loki | What happened and when? |
| Traces | Jaeger | Which service caused the slowdown? |
