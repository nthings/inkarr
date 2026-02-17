# ============================================
# Stage 1: Base image with Node.js and pnpm
# ============================================
FROM node:24-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies needed for native modules (better-sqlite3)
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

# ============================================
# Stage 2: Install dependencies
# ============================================
FROM base AS deps

# Copy package files
COPY package.json pnpm-lock.yaml .npmrc ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm db:generate

# ============================================
# Stage 3: Build the application
# ============================================
FROM base AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
# Copy generated Prisma client from deps stage
COPY --from=deps /app/app/generated ./app/generated
COPY . .

# Set production environment for build
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Build the Next.js application
RUN pnpm build

# ============================================
# Stage 4: Production runner with s6-overlay
# ============================================
FROM node:24-alpine AS runner

# Install s6-overlay
RUN apk add --no-cache curl xz
ARG S6_OVERLAY_VERSION=3.1.5.0
RUN curl -fsSL https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz | tar -Jxp -C /
RUN curl -fsSL https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-x86_64.tar.xz | tar -Jxp -C /

# Install runtime dependencies
RUN apk add --no-cache libc6-compat python3 make g++ procps su-exec

WORKDIR /app


# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:/config/app.db
ENV S6_CMD_WAIT_FOR_SERVICES_MAXTIME=0

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

# Copy the standalone build
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy node_modules from deps (where native modules were compiled)
COPY --from=deps /app/node_modules ./node_modules

# Rebuild native modules for this environment
RUN npm rebuild better-sqlite3

# Create config directory (ownership will be set by init script at runtime)
RUN mkdir -p /config && chmod 755 /config

# Copy s6-overlay init and service scripts
COPY s6-overlay/s6-rc.d/ /etc/s6-overlay/s6-rc.d/
COPY s6-overlay/scripts/ /etc/s6-overlay/scripts/

# Make scripts executable
RUN chmod +x /etc/s6-overlay/scripts/*.sh \
    && chmod +x /etc/s6-overlay/s6-rc.d/svc-inkarr/run

# Expose port
EXPOSE 3000

# S6 entrypoint
ENTRYPOINT ["/init"]
