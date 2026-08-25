FROM node:20-alpine

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

WORKDIR /app/apps/dashboard

EXPOSE 3006

CMD ["npx", "vite", "--host", "0.0.0.0"]
