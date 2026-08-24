FROM node:20-alpine

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install all workspace dependencies
RUN npm install --workspace=apps/api --include-workspace-root

# Copy source
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/
COPY tsconfig.base.json ./

WORKDIR /app/apps/api

EXPOSE 3001

CMD ["npx", "ts-node-dev", "--respawn", "--transpile-only", "src/index.ts"]
