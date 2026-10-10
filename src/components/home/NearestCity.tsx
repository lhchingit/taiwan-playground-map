'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { distanceToBboxKm, nearestCity, type CityBounds } from '@/lib/cities';
import { formatKm } from '@/lib/format';

/** 縣市選單上方的「離你最近」。定位只在瀏覽器計算，不送到伺服器；不自動跳轉。 */
export function NearestCity({ cities }: { cities: CityBounds[] }) {
  const [hit, setHit] = useState<{ city: CityBounds; km: number } | null>(null);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const city = nearestCity(origin, cities);
        if (city?.bbox) setHit({ city, km: distanceToBboxKm(origin, city.bbox) });
      },
      () => {},
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }, [cities]);

  if (!hit) return null;
  return (
    <p className="nearest" role="status">
      離你最近：<Link href={`/${hit.city.slug}`}>{hit.city.name}</Link>
      {hit.km > 0 && `（約 ${formatKm(hit.km)}）`}
    </p>
  );
}
