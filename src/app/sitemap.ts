import type { MetadataRoute } from 'next';
import { getCityBounds, getLaunchedPlaceParams } from '@/lib/data';
import { siteUrl } from '@/lib/site';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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
