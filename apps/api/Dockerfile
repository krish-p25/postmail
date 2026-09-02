FROM node:20-alpine AS build

WORKDIR /app

# Copy all workspace package.json files (npm ci needs them all for the lockfile)
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/dashboard/package.json ./apps/dashboard/
COPY apps/extension/package.json ./apps/extension/

# Install all dependencies (full workspace install for correct lockfile resolution)
RUN npm ci

# Copy source
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/
COPY tsconfig.base.json ./

# Build shared package
WORKDIR /app/packages/shared
RUN npx tsc

# Build API
WORKDIR /app/apps/api
RUN npx tsc

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/dashboard/package.json ./apps/dashboard/
COPY apps/extension/package.json ./apps/extension/

RUN npm ci --omit=dev

COPY .env ./
COPY packages/shared/ ./packages/shared/
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/dist ./apps/api/dist

WORKDIR /app/apps/api

EXPOSE 3005

CMD ["node", "dist/index.js"]
