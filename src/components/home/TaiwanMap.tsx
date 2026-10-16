import Link from 'next/link';
import type { CityBounds } from '@/lib/cities';
import map from '@/lib/taiwan-map.json';

// 區塊很小的縣市，名稱用小一號的字
const SMALL = new Set(['新竹市', '嘉義市', '基隆市', '臺北市']);
// 離島縣市的島很小，不畫白色邊線（不然會被邊線蓋掉）
const ISLANDS = new Set(['澎湖縣', '金門縣', '連江縣']);

/**
 * 首頁的台灣地圖：已上線的縣市可以點，進入該縣市；未上線的灰色、不能點。
 * 界線來自內政部（scripts/build_taiwan_map.py 產生 src/lib/taiwan-map.json），用名稱對應資料庫的縣市。
 * 先畫全部區塊、再畫全部名稱，名稱才不會被後面的區塊蓋住；名稱那一層的連結不進 tab 順序（區塊已經有了）。
 */
export function TaiwanMap({
  cities,
  counts,
}: {
  cities: CityBounds[];
  counts: Record<string, number>;
}) {
  const byName = new Map(cities.filter((c) => c.launched).map((c) => [c.name, c]));
  return (
    <svg className="tw-map" viewBox={map.viewBox.join(' ')} role="group" aria-label="台灣縣市地圖">
      {map.insets.map((i) => (
        <rect
          key={i.name}
          className="tw-inset"
          x={i.x}
          y={i.y}
          width={i.width}
          height={i.height}
          rx={4}
        />
      ))}
      {map.counties.map((c) => {
        const city = byName.get(c.name);
        if (!city) {
          return (
            <path
              key={c.name}
              className={ISLANDS.has(c.name) ? 'tw-off tw-island' : 'tw-off'}
              d={c.d}
            >
              <title>{`${c.name}（尚未上線）`}</title>
            </path>
          );
        }
        return (
          <Link
            key={c.name}
            href={`/${city.slug}`}
            className={ISLANDS.has(c.name) ? 'tw-on tw-island' : 'tw-on'}
            data-city={city.code}
            aria-label={`${c.name}，${counts[city.code] ?? 0} 處`}
          >
            <path d={c.d} />
          </Link>
        );
      })}
      {map.counties.map((c) => {
        const city = byName.get(c.name);
        const text = (
          <text
            x={c.label[0]}
            y={c.label[1]}
            className={SMALL.has(c.name) ? 'tw-label tw-small' : 'tw-label'}
          >
            {c.name}
          </text>
        );
        if (!city) {
          return (
            <g key={c.name} className="tw-off-label" aria-hidden="true">
              {text}
            </g>
          );
        }
        return (
          <Link
            key={c.name}
            href={`/${city.slug}`}
            className="tw-on-label"
            tabIndex={-1}
            aria-hidden="true"
          >
            {text}
          </Link>
        );
      })}
    </svg>
  );
}
