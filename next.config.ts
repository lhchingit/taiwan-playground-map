import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 公開資料用 'use cache' + cacheLife('hours') 快取（src/lib/data.ts）
  cacheComponents: true,
  // 只有建置 Docker 映像檔時輸出 standalone（Dockerfile 設定 NEXT_OUTPUT=standalone）；
  // 平常的 pnpm build／pnpm start 不受影響（next start 不支援 standalone）
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
};

export default nextConfig;
