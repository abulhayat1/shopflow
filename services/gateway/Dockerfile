# Gateway Dockerfile
# Read user-service/Dockerfile for the full explanation of every instruction.
#
# =============================================================================
# LESSON: Why does the gateway get its own image?
# =============================================================================
# You might think: "The gateway is just a proxy, why containerize it?"
#
# Answer: in Kubernetes (Phase 2), each container runs in its own isolated pod.
# The gateway runs as a K8s Deployment — K8s can:
#   - Scale it independently (add more gateway replicas under high traffic)
#   - Roll it out with zero downtime (rolling updates)
#   - Restart it if it crashes (self-healing)
#   - Apply resource limits to prevent it hogging CPU/memory
#
# Without containerization, none of this is possible.
# =============================================================================

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

FROM node:20-alpine AS runner
WORKDIR /app
USER node
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/index.js ./
COPY --from=builder --chown=node:node /app/package.json ./
EXPOSE 3000
CMD ["node", "index.js"]
