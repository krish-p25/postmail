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

# Build args become env vars at build time so Vite can inline them
ARG VITE_API_URL
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

WORKDIR /app/apps/dashboard
RUN npx vite build

# Production stage — serve static files
FROM node:20-alpine

RUN npm install -g serve

COPY --from=build /app/apps/dashboard/dist /app/dist

EXPOSE 3006

CMD ["serve", "-s", "/app/dist", "-l", "3006"]
