// 幫忙命名（decisions D23）：已上線縣市裡沒有名稱的 OSM 遊戲場，會員一起命名，達到門檻人數（管理員設定）一致就上地圖。
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NamingApp } from '@/components/naming/NamingApp';
import { getCityBounds, getNamingCandidates, getNamingThreshold } from '@/lib/data';

interface Params {
  params: Promise<{ city: string }>;
}

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
    title: `幫忙命名${city.name}的遊戲場｜全台放電地圖`,
    description: `${city.name}還沒有名稱的遊戲場：依地圖或現場看到的名稱填寫，${await getNamingThreshold()} 人一致就會加到地圖上。`,
    robots: { index: false },
  };
}

export default async function NamingPage({ params }: Params) {
  const city = await findCity((await params).city);
  if (!city) notFound();
  const [candidates, threshold] = await Promise.all([
    getNamingCandidates(city.code),
    getNamingThreshold(),
  ]);
  return <NamingApp city={city} candidates={candidates} threshold={threshold} />;
}
