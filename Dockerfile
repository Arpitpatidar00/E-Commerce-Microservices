FROM node:20-alpine AS builder

ARG SERVICE_PATH
ARG SERVICE_NAME

WORKDIR /app
RUN npm install -g pnpm@10.7.1

# Copy root configuration and lockfiles
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy shared library code
COPY shared/ ./shared/

# Copy the specific service code
COPY ${SERVICE_PATH}/ ./${SERVICE_PATH}/

# Install dependencies (frozen lockfile for deterministic builds)
RUN pnpm install --frozen-lockfile

# Build the shared library first, then the specific microservice
RUN pnpm --filter @ecommerce/shared build
RUN pnpm --filter ${SERVICE_NAME} build

FROM node:20-alpine AS runner
ARG SERVICE_PATH

WORKDIR /app

# Copy built files and dependencies from the builder stage
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/${SERVICE_PATH} ./${SERVICE_PATH}

# Default environment variables
ENV NODE_ENV=production
ENV SERVICE_EXEC_PATH=${SERVICE_PATH}/dist/server.js

# Execute the built microservice
CMD node ${SERVICE_EXEC_PATH}
