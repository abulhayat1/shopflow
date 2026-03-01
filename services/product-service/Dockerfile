# Same multi-stage pattern as user-service — read its Dockerfile for full explanations.
# Key lesson baked into every service:
#  1. Copy package*.json first → fast layer caching
#  2. Multi-stage → tiny production image
#  3. Non-root user (node) → security
#  4. CMD exec form → clean signal handling

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
EXPOSE 3002
CMD ["node", "index.js"]
