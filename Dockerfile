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
# Stage 4: Production runner
# ============================================
FROM node:24-alpine AS runner

WORKDIR /app

# Install runtime dependencies and build tools for native modules
RUN apk add --no-cache libc6-compat python3 make g++ su-exec

# Create non-root user for security (will be recreated at runtime to match mounted volume)
RUN addgroup --system -g 1001 nextjs
RUN adduser --system -u 1001 nextjs

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:/app/config/app.db

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

# Copy the standalone build
COPY --from=builder --chown=1001:1001 /app/.next/standalone ./
COPY --from=builder --chown=1001:1001 /app/.next/static ./.next/static

# Copy node_modules from deps (where native modules were compiled)
COPY --from=deps --chown=1001:1001 /app/node_modules ./node_modules

# Rebuild native modules for this environment
RUN npm rebuild better-sqlite3

# Copy entrypoint script
COPY --chown=0:0 docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Create data and config directories
RUN mkdir -p /app/data/downloads /app/data/manga /app/data/comics /app/config
RUN chmod 755 /app/data /app/config

# Expose port
EXPOSE 3000

# Set hostname
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/v1/system/status || exit 1

# Start the application with migrations
ENTRYPOINT ["./docker-entrypoint.sh"]
