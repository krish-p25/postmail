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
COPY apps/dashboard/ ./apps/dashboard/
COPY tsconfig.base.json ./

# Copy .env so Vite can read VITE_* vars at build time (envDir points to repo root)
COPY .env ./

WORKDIR /app/apps/dashboard
RUN npx vite build

# Production stage — serve static files (.env is not copied here)
FROM node:20-alpine

RUN npm install -g serve

COPY --from=build /app/apps/dashboard/dist /app/dist

EXPOSE 3006

CMD ["serve", "-s", "/app/dist", "-l", "3006"]
