# 竹市放電地圖：Next.js 網站的映像檔（本機測試用；資料庫沿用 Supabase CLI）。
# next build 會讀資料庫（建置時產生場地頁），所以建置時要連得到 Supabase，見 compose.yaml。

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable pnpm
WORKDIR /app

# 1. 安裝套件（只複製 lockfile 相關檔，原始碼改了也能沿用這層快取）
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# 2. 建置。這幾個值只用在這個階段，不會進到最終映像檔。
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG SUPABASE_URL
ARG SUPABASE_ANON_KEY
ARG SITE_URL=http://localhost:3000
RUN test -n "$SUPABASE_URL" && test -n "$SUPABASE_ANON_KEY" \
  || (echo "缺少 SUPABASE_URL 或 SUPABASE_ANON_KEY（請先執行 pnpm env:local，並用 pnpm docker:up 建置）" && exit 1)
RUN SUPABASE_URL="$SUPABASE_URL" SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" SITE_URL="$SITE_URL" \
  NEXT_OUTPUT=standalone pnpm exec next build

# 3. 執行：只有 standalone 輸出與靜態檔，不含原始碼與開發套件
FROM node:24-bookworm-slim AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
