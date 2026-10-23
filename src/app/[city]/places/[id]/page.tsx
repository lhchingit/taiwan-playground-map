import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HomeApp } from '@/components/home/HomeApp';
import {
  getAttributeCatalog,
  getCityBounds,
  getCityPlaces,
  getLaunchedPlaceParams,
  getNamingCandidates,
  getPlaceDetail,
} from '@/lib/data';
import { jsonLdScript, placeJsonLd } from '@/lib/seo';
import { siteUrl } from '@/lib/site';

interface Props {
  params: Promise<{ city: string; id: string }>;
}

/** 已上線縣市的全部場地，建置時產生；資料 1 小時後重新驗證（src/lib/data.ts 的 cacheLife） */
export async function generateStaticParams() {
  return getLaunchedPlaceParams();
}

/** 場地存在、縣市已上線、且網址的縣市跟場地相符，才有頁面 */
async function load(params: Props['params']) {
  const { city: slug, id } = await params;
  const city = (await getCityBounds()).find((c) => c.slug === slug && c.launched);
  if (!city) return null;
  const detail = await getPlaceDetail(id);
  if (!detail || detail.city !== city.code) return null;
  return { city, detail };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await load(params);
  if (!found) return {};
  const { city, detail: d } = found;
  const path = `/${city.slug}/places/${d.id}`;
  const description =
    d.summary ?? `${d.name}（${city.name}${d.district ?? ''}）的遊樂設施、生活機能與停車資訊。`;
  return {
    title: `${d.name}｜${city.name}親子遊樂場`,
    description,
    alternates: { canonical: path },
    openGraph: { title: d.name, description, url: path, type: 'website', locale: 'zh_TW' },
  };
}

/**
 * 直接開啟（或重新整理）場地網址：跟點選後一樣是整個地圖畫面，面板打開這個場地。
 * 伺服器輸出的面板就有完整內容；縣市的場地清單不內嵌，在瀏覽器載入（HomeApp）。
 */
export default async function PlacePage({ params }: Props) {
  const found = await load(params);
  if (!found) notFound();
  const { city, detail } = found;
  const [cities, catalog, naming] = await Promise.all([
    getCityBounds(),
    getAttributeCatalog(),
    getNamingCandidates(city.code),
  ]);
  // 縣市選單上的場地數（同縣市頁；各縣市的場地已經快取）
  const launched = cities.filter((c) => c.launched);
  const cityCounts =
    launched.length > 1
      ? Object.fromEntries(
          await Promise.all(
            launched.map(async (c) => [c.code, (await getCityPlaces(c.code)).length] as const),
          ),
        )
      : {};
  const ld = placeJsonLd(
    detail,
    catalog,
    `${siteUrl()}/${city.slug}/places/${detail.id}`,
    city.name,
  );

  return (
    <>
      <HomeApp
        city={city}
        cities={cities}
        catalog={catalog}
        initialPlace={detail}
        query=""
        namingCount={naming.length}
        cityCounts={cityCounts}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }} />
    </>
  );
}
