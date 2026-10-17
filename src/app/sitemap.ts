import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { getCityBounds, getLaunchedPlaceParams } from '@/lib/data';
import { siteUrl } from '@/lib/site';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 請求時才產生：Vercel 不會因為 revalidateTag 重新產生建置時預先產生的 sitemap，上線新縣市後會停在舊內容。
  // 資料本身仍經過 'use cache'（cities、places 標籤），清快取後才重新查。
  await connection();
  const base = siteUrl();
  const cities = (await getCityBounds()).filter((c) => c.launched);
  const places = await getLaunchedPlaceParams();
  return [
    ...cities.map((c) => ({
      url: `${base}/${c.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 1,
    })),
    ...places.map((p) => ({
      url: `${base}/${p.city}/places/${p.id}`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ];
}
