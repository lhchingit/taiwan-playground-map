import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NearestCity } from '@/components/home/NearestCity';
import { getCityBounds, getCityPlaces } from '@/lib/data';

// 只有一個縣市上線時直接進入那個縣市；兩個以上時顯示縣市選單（decisions D12）
export default async function Home() {
  const cities = (await getCityBounds()).filter((c) => c.launched);
  const only = cities.length === 1 ? cities[0] : undefined;
  if (only) redirect(`/${only.slug}`);

  const counts = await Promise.all(cities.map((c) => getCityPlaces(c.code)));

  return (
    <main className="place-page">
      <article className="place-article">
        <div className="dhead">
          <h1>全台放電地圖</h1>
          <p>選擇縣市，依遊樂設施、孩子年齡、廁所、停車與距離找親子遊樂場與公園。</p>
        </div>
        <section className="dsec" aria-labelledby="city-list-title">
          <h2 id="city-list-title" className="dsec-title">
            已上線的縣市
          </h2>
          <NearestCity cities={cities} />
          {cities.length === 0 ? (
            <p className="note">目前還沒有上線的縣市。</p>
          ) : (
            <ul className="city-list">
              {cities.map((c, i) => (
                <li key={c.code}>
                  <Link href={`/${c.slug}`}>{c.name}</Link>
                  <span className="note">{counts[i]?.length ?? 0} 處</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="dsec">
          <p className="note">地圖與座標資料 © OpenStreetMap contributors</p>
        </section>
      </article>
    </main>
  );
}
