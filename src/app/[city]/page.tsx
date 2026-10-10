import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { HomeApp, type HomeAppProps } from '@/components/home/HomeApp';
import { getAttributeCatalog, getCityBounds, getCityPlaces } from '@/lib/data';

interface Params {
  params: Promise<{ city: string }>;
}
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** 已上線的縣市才有頁面；其他 slug 一律 404 */
export async function generateStaticParams() {
  return (await getCityBounds()).filter((c) => c.launched).map((c) => ({ city: c.slug }));
}

async function findCity(slug: string) {
  return (await getCityBounds()).find((c) => c.slug === slug && c.launched);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const city = await findCity((await params).city);
  if (!city) return {};
  return {
    title: `${city.name}親子遊樂場與公園地圖｜全台放電地圖`,
    description: `${city.name}的親子遊樂場與公園：依遊樂設施、孩子年齡、廁所等生活機能、停車與距離篩選，資料標示來源。`,
  };
}

export default async function CityPage({
  params,
  searchParams,
}: Params & { searchParams: SearchParams }) {
  const city = await findCity((await params).city);
  if (!city) notFound();
  const [cities, catalog, places] = await Promise.all([
    getCityBounds(),
    getAttributeCatalog(),
    getCityPlaces(city.code),
  ]);
  const props = { city, cities, catalog, places };

  // 篩選條件在網址裡（要求時才知道），放在 Suspense 裡；伺服器產生的畫面就是篩選後的結果
  return (
    <Suspense fallback={<Loading />}>
      <WithQuery {...props} searchParams={searchParams} />
    </Suspense>
  );
}

async function WithQuery({
  searchParams,
  ...props
}: Omit<HomeAppProps, 'query'> & { searchParams: SearchParams }) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (typeof v === 'string') q.set(k, v);
  }
  return <HomeApp {...props} query={q.toString()} />;
}

function Loading() {
  return (
    <main className="app">
      <div className="side">
        <header className="head">
          <h1>全台放電地圖</h1>
          <p className="sub">載入中…</p>
        </header>
      </div>
      <section className="mapwrap" aria-label="地圖" />
    </main>
  );
}
