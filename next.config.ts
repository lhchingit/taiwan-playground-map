import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 公開資料用 'use cache' + cacheLife('hours') 快取（src/lib/data.ts）
  cacheComponents: true,
};

export default nextConfig;
