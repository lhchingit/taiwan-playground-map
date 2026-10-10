import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AuthButton } from '@/components/auth/AuthButton';
import { PlaceDetailView } from '@/components/place/PlaceDetailView';
import {
  getAttributeCatalog,
  getCityBounds,
  getLaunchedPlaceParams,
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

export default async function PlacePage({ params }: Props) {
  const found = await load(params);
  if (!found) notFound();
  const { city, detail } = found;
  const catalog = await getAttributeCatalog();
  const ld = placeJsonLd(
    detail,
    catalog,
    `${siteUrl()}/${city.slug}/places/${detail.id}`,
    city.name,
  );

  return (
    <main className="place-page">
      <nav className="place-nav" aria-label="導覽">
        <Link href={`/${city.slug}`}>← 全台放電地圖：回到{city.name}地圖</Link>
        <AuthButton />
      </nav>
      <article className="place-article">
        <PlaceDetailView detail={detail} catalog={catalog} headingLevel={1} />
      </article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }} />
    </main>
  );
}
