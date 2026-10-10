// 場地頁的結構化資料（schema.org）。只放已知的事實：未知的設施不列、收費未知時不寫 isAccessibleForFree。
import type { PlaceDetail } from './place-detail';
import type { AttributeCatalog } from './places';

export function placeJsonLd(
  d: PlaceDetail,
  catalog: AttributeCatalog,
  url: string,
  cityName: string,
) {
  const amenities = catalog.order
    .filter((k) => d.attrs[k] === 'y')
    .map((k) => ({
      '@type': 'LocationFeatureSpecification',
      name: catalog.labels[k] ?? k,
      value: true,
    }));
  return {
    '@context': 'https://schema.org',
    '@type': 'Playground',
    name: d.name,
    url,
    ...(d.summary ? { description: d.summary } : {}),
    geo: { '@type': 'GeoCoordinates', latitude: d.lat, longitude: d.lng },
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'TW',
      addressRegion: cityName,
      ...(d.district ? { addressLocality: d.district } : {}),
      ...(d.address ? { streetAddress: d.address } : {}),
    },
    ...(d.fee !== null ? { isAccessibleForFree: d.fee === 'free' } : {}),
    // 開放時間是自由文字（例：「24 小時（動物園另計）」），不符合 openingHours 的格式，所以不放
    ...(amenities.length > 0 ? { amenityFeature: amenities } : {}),
  };
}

/** 放進 <script type="application/ld+json">，避免內容裡的 </script> 提前結束標籤 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
