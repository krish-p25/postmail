# ── Stage 1: Install all deps ────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/dashboard/package.json ./apps/dashboard/
COPY apps/extension/package.json ./apps/extension/

RUN --mount=type=cache,target=/root/.npm npm install

# ── Stage 2: Build shared package ────────────────────────
FROM deps AS shared-build

COPY packages/shared/ ./packages/shared/
COPY tsconfig.base.json ./

WORKDIR /app/packages/shared
RUN npx tsc

# ── Stage 3: Build dashboard (Vite) ─────────────────────
FROM shared-build AS dashboard-build

WORKDIR /app
COPY apps/dashboard/ ./apps/dashboard/
# .env is needed for VITE_* vars at build time
COPY .env ./

WORKDIR /app/apps/dashboard
RUN npx vite build

# ── Stage 4: Build API (TypeScript) ─────────────────────
FROM shared-build AS api-build

WORKDIR /app
COPY apps/api/ ./apps/api/

WORKDIR /app/apps/api
RUN npx tsc -p tsconfig.json

# ── Stage 5: Production image ───────────────────────────
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/dashboard/package.json ./apps/dashboard/
COPY apps/extension/package.json ./apps/extension/

RUN --mount=type=cache,target=/root/.npm npm install --omit=dev --ignore-scripts

# Shared package (source + compiled)
COPY packages/shared/ ./packages/shared/
COPY --from=shared-build /app/packages/shared/dist ./packages/shared/dist

# API compiled output
COPY --from=api-build /app/apps/api/dist ./apps/api/dist

# Dashboard built static files
COPY --from=dashboard-build /app/apps/dashboard/dist ./apps/dashboard/dist

# .well-known for Microsoft identity verification etc.
COPY .well-known ./apps/dashboard/dist/.well-known

WORKDIR /app/apps/api

EXPOSE 3005

CMD ["node", "dist/index.js"]
