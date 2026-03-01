# =============================================================================
# 🐳 LESSON: What is a Dockerfile?
# =============================================================================
# A Dockerfile is a recipe to build a Docker IMAGE.
# An image is a snapshot of: OS + runtime + your code + dependencies.
# A running image is called a CONTAINER.
#
# Think of it like this:
#   Dockerfile  →  Image  →  Container
#   Recipe      →  Cake   →  Slice on plate
#
# Why do we use containers?
#   Without containers: "It works on my Mac but not on the server" 😤
#   With containers:    The container IS the environment. Same everywhere. ✅
# =============================================================================

# =============================================================================
# LESSON: Multi-Stage Builds — the most important Docker pattern
# =============================================================================
# Most beginners write ONE big image that includes everything (compiler, dev
# tools, test frameworks, etc.). This creates huge, slow, and insecure images.
#
# Multi-stage builds use separate stages:
#   Stage 1 (builder): install ALL deps including devDependencies
#   Stage 2 (runner):  copy only production files → tiny, secure image
#
# The final image only contains what Stage 2 puts in it.
# Stage 1 is thrown away after the build. You get the benefits of a full
# toolchain without paying for it in image size.
# =============================================================================

# ── STAGE 1: Builder ──────────────────────────────────────────────────────────
# node:20-alpine = Node.js 20 on Alpine Linux (a ~5MB minimal OS)
# Compare: node:20 (Debian) = ~1GB   vs   node:20-alpine = ~180MB
FROM node:20-alpine AS builder

# Set working directory inside the container
WORKDIR /app

# =============================================================================
# LESSON: Why copy package.json BEFORE source code?
# =============================================================================
# Docker builds in LAYERS. Each instruction (COPY, RUN) = one layer.
# Docker CACHES layers — if the layer's input hasn't changed, it reuses the
# cached result instead of rebuilding.
#
# If you COPY . . first and then npm install:
#   - Every code change (even a typo) invalidates the npm install cache
#   - npm install runs from scratch every time = slow builds!
#
# If you COPY package*.json first, then npm install:
#   - npm install only re-runs when package.json changes (dependencies changed)
#   - Code changes don't invalidate the install cache = fast builds!
# =============================================================================
COPY package*.json ./
RUN npm ci --only=production

# Now copy the actual source code (this layer changes every commit)
COPY . .

# ── STAGE 2: Production Runner ────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# =============================================================================
# LESSON: Running as a non-root user
# =============================================================================
# By default, containers run as ROOT inside the container.
# If an attacker exploits your app, they get root access inside the container.
# While containers are isolated, defense-in-depth means we NEVER run as root.
#
# node:alpine comes with a built-in unprivileged user called "node" (UID 1000).
# We switch to it here. Kubernetes also enforces this via SecurityContext.
# =============================================================================
USER node

# Copy only the production dependencies and source from the builder stage
# The --chown=node:node makes the copied files owned by our non-root user
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/index.js ./
COPY --from=builder --chown=node:node /app/package.json ./

# =============================================================================
# LESSON: EXPOSE is documentation, not security
# =============================================================================
# EXPOSE tells OTHER DEVELOPERS (and Docker tooling) which port this app uses.
# It does NOT block traffic or open firewall holes. It's purely informational.
# The actual port binding happens via `docker run -p` or K8s Service.
# =============================================================================
EXPOSE 3001

# =============================================================================
# LESSON: CMD vs ENTRYPOINT
# =============================================================================
# CMD  = the default command to run. Can be overridden at runtime.
# ENTRYPOINT = the fixed executable. CMD becomes arguments to it.
#
# Using CMD ["node", "index.js"] (array form = "exec form"):
#   - Process runs as PID 1 (receives OS signals directly)
#   - CTRL+C / SIGTERM from Docker/K8s stops the process cleanly
#   - Shell form (CMD node index.js) wraps in /bin/sh — signals get lost!
#   - Always use exec form (array) for containerized processes.
# =============================================================================
CMD ["node", "index.js"]
