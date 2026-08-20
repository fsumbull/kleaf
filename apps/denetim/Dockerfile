# kleaf panel — on-premise imaj
# Not: Konteyner içinde PostgreSQL kullanılır. prisma/schema.prisma'daki provider
# derleme sırasında "postgresql" olarak değiştirilir (SQLite yalnızca yerel geliştirme içindir).

# ── 1. bağımlılıklar ─────────────────────────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile --ignore-scripts

# ── 2. derleme ───────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# SQLite (geliştirme) → PostgreSQL (üretim)
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma \
 && pnpm prisma generate
# Derleme anında veritabanı gerekmez; build için sahte URL yeterli
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV AUTH_SECRET="build-gecici"
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ── 3. çalışma zamanı ────────────────────────────────────────
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S kleaf && adduser -S kleaf -G kleaf

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/src/assets ./src/assets
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && chown -R kleaf:kleaf /app

USER kleaf
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/saglik || exit 1
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["pnpm", "start"]
