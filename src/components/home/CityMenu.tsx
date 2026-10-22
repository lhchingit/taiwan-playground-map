'use client';
// 縣市頁標題的縣市選單：原生 select，手機會跳出系統選單。篩選條件帶到新縣市（屬性代號全台共用）。
import { useRouter } from 'next/navigation';
import { sortCitiesNorthToSouth, type CityBounds } from '@/lib/cities';
import { filtersToQuery, type Filters } from '@/lib/filter';

const ALL = '';

export function CityMenu({
  city,
  cities,
  counts,
  filters,
}: {
  city: CityBounds;
  cities: readonly CityBounds[];
  /** 各縣市的場地數，key 是縣市代碼 */
  counts: Readonly<Record<string, number>>;
  filters: Filters;
}) {
  const router = useRouter();
  const launched = sortCitiesNorthToSouth(cities.filter((c) => c.launched));
  return (
    // 看得到的是縣市名稱膠囊；原生 select 透明疊在上面（寬度不被最長的選項撐開），點了跳出系統選單
    <span className="city-pick">
      <span aria-hidden="true">{city.name}</span>
      <select
        aria-label="切換縣市"
        value={city.slug}
        onChange={(e) => {
          const slug = e.target.value;
          if (slug === ALL) return router.push('/');
          const q = filtersToQuery(filters);
          router.push(`/${slug}${q ? `?${q}` : ''}`);
        }}
      >
        <option value={ALL}>全部縣市（台灣地圖）</option>
        {launched.map((c) => (
          <option key={c.code} value={c.slug}>
            {counts[c.code] === undefined ? c.name : `${c.name}（${counts[c.code]} 處）`}
          </option>
        ))}
      </select>
    </span>
  );
}
