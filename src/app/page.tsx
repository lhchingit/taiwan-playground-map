import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthButton } from '@/components/auth/AuthButton';
import { NearestCity } from '@/components/home/NearestCity';
import { TaiwanMap } from '@/components/home/TaiwanMap';
import { sortCitiesNorthToSouth } from '@/lib/cities';
import { getCityBounds, getCityPlaces } from '@/lib/data';

// 只有一個縣市上線時直接進入那個縣市；兩個以上時顯示台灣地圖與縣市選單（decisions D12）
export default async function Home() {
  const all = await getCityBounds();
  const cities = all.filter((c) => c.launched);
  const only = cities.length === 1 ? cities[0] : undefined;
  if (only) redirect(`/${only.slug}`);

  const places = await Promise.all(cities.map((c) => getCityPlaces(c.code)));
  const counts = Object.fromEntries(cities.map((c, i) => [c.code, places[i]?.length ?? 0]));

  return (
    <main className="place-page">
      {/* 登入／暱稱選單（我的貢獻、審核後台、登出）：瀏覽器端查登入狀態，首頁仍是靜態頁 */}
      <nav className="place-nav home-nav" aria-label="導覽">
        <AuthButton />
      </nav>
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
            <>
              <TaiwanMap cities={all} counts={counts} />
              <ul className="city-list">
                {sortCitiesNorthToSouth(cities).map((c) => (
                  <li key={c.code}>
                    <Link href={`/${c.slug}`}>{c.name}</Link>
                    <span className="note">{counts[c.code]} 處</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
        <section className="dsec">
          <p className="note">地圖與座標資料 © OpenStreetMap contributors</p>
          <p className="note">縣市界線：內政部國土測繪中心（政府資料開放授權條款）</p>
        </section>
      </article>
    </main>
  );
}
