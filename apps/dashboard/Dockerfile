FROM node:20-alpine

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/dashboard/package.json ./apps/dashboard/

# Install all workspace dependencies
RUN npm install --workspace=apps/dashboard --include-workspace-root

# Copy source
COPY packages/shared/ ./packages/shared/
COPY apps/dashboard/ ./apps/dashboard/
COPY tsconfig.base.json ./

WORKDIR /app/apps/dashboard

EXPOSE 5173

CMD ["npx", "vite", "--host", "0.0.0.0"]
