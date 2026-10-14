// 審核後台：負責縣市的待審修正建議（最舊的在前）、對照目前的值、核准／退回、批次、恢復開放。
// 只有審核員與管理員進得來（其他人導回首頁）；真正的權限在資料庫（RLS、review_suggestion()）。
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AuthButton } from '@/components/auth/AuthButton';
import { groupQueue } from '@/lib/admin/queue';
import { haversineKm } from '@/lib/filter';
import { KIND_LABEL, suggestionSummary } from '@/lib/auth/labels';
import { currentUser } from '@/lib/auth/session';
import { getAttributeCatalog, getCityBounds, getSources } from '@/lib/data';
import { PARKING_FEE_LABEL, PARKING_TYPE_LABEL } from '@/lib/format';
import { supabaseAuth } from '@/lib/supabase/auth';
import type { Json } from '@/types/database';
import type { ParkingFee, ParkingType } from '@/types/place';
import { AdminQueue, ReopenList, type CardData, type CurrentLine } from './AdminQueue';

export const metadata: Metadata = {
  title: '審核後台｜全台放電地圖',
  robots: { index: false },
};

interface Props {
  searchParams: Promise<{ city?: string; place?: string; kind?: string }>;
}

export default function AdminPage({ searchParams }: Props) {
  return (
    <main className="place-page admin-page">
      <nav className="place-nav" aria-label="導覽">
        <Link href="/">← 全台放電地圖</Link>
        <AuthButton />
      </nav>
      <Suspense fallback={<p className="note">載入中…</p>}>
        <AdminContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const TRI: Record<string, string> = { y: '有', n: '無', u: '未知' };
const STATUS: Record<string, string> = {
  open: '開放中',
  seasonal: '季節性開放',
  maintenance: '維修中',
  closed: '已封閉',
};
const DATE = new Intl.DateTimeFormat('zh-TW', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Taipei',
});

const obj = (p: Json) =>
  p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, Json | undefined>) : {};
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/** 核准前可以修改的欄位，預填家長建議的內容 */
function editDefaults(
  kind: string,
  p: Record<string, Json | undefined>,
): Record<string, string> | null {
  if (kind === 'field') return { field: s(p.field), value: s(p.value) };
  if (kind === 'closure') {
    return { reason: s(p.reason), until: s(p.until), status: s(p.status) || 'maintenance' };
  }
  if (kind === 'new_place') {
    return {
      name: s(p.name),
      address: s(p.address),
      lat: s(p.lat),
      lng: s(p.lng),
      city: s(p.city),
    };
  }
  return null;
}

async function AdminContent({ searchParams }: Props) {
  const supabase = await supabaseAuth();
  const user = await currentUser(supabase);
  if (!user || user.banned || !['moderator', 'admin'].includes(user.role)) redirect('/');
  const q = await searchParams;

  const [pending, myCities, cityList, catalog, sources] = await Promise.all([
    supabase
      .from('edit_suggestions')
      .select(
        'id, kind, payload, note, created_at, place_id, places(name, city, hours, surface, status, status_until, status_note, hours_source, hours_verified_at, surface_source, surface_verified_at, status_source, status_verified_at), profiles(display_name, accepted_count)',
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(500),
    supabase.from('moderator_cities').select('city').eq('user_id', user.id),
    getCityBounds(),
    getAttributeCatalog(),
    getSources(),
  ]);
  if (pending.error) throw new Error(`讀取待審建議失敗：${pending.error.message}`);

  const cityName = new Map(cityList.map((c) => [c.code, c.name]));
  const allowed =
    user.role === 'admin' ? cityList.map((c) => c.code) : (myCities.data ?? []).map((r) => r.city);
  const sourceLabel = (id: string | null | undefined) =>
    id ? (sources.find((x) => x.id === id)?.label ?? id) : null;

  const rows = (pending.data ?? []).map((r) => ({
    ...r,
    city: r.places?.city ?? s(obj(r.payload).city),
  }));
  const filtered = rows.filter(
    (r) =>
      (!q.city || r.city === q.city) &&
      (!q.place || r.place_id === q.place) &&
      (!q.kind || r.kind === q.kind),
  );

  // 目前的值：屬性與停車另外查（審核員讀得到負責縣市的資料，含未上線縣市）
  const placeIds = [...new Set(filtered.map((r) => r.place_id).filter((x): x is string => !!x))];
  // 新增場地：同縣市已有的場地（附近 300 公尺內的列出來，當作重複的提示）
  const newPlaceCities = [
    ...new Set(filtered.filter((r) => r.kind === 'new_place').map((r) => r.city)),
  ];
  const [attrs, parking, closedPlaces, cityCards] = await Promise.all([
    placeIds.length
      ? supabase
          .from('place_attributes')
          .select('place_id, key, value, note, verified_at, source_id')
          .in('place_id', placeIds)
      : Promise.resolve({ data: [] as never[] }),
    placeIds.length
      ? supabase
          .from('place_parking')
          .select('place_id, type, fee, spaces, fee_note, note, verified_at, source_id')
          .in('place_id', placeIds)
          .order('id')
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from('places')
      .select('id, name, city, status, status_until, status_note')
      .in('status', ['maintenance', 'closed'])
      .in('city', allowed.length ? allowed : ['-'])
      .order('name'),
    newPlaceCities.length
      ? supabase.from('place_cards').select('id, name, lat, lng').in('city', newPlaceCities)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const current = (r: (typeof filtered)[number]): CurrentLine[] => {
    const p = obj(r.payload);
    const pl = r.places;
    if (r.kind === 'attribute') {
      const a = (attrs.data ?? []).find((x) => x.place_id === r.place_id && x.key === p.key);
      return [
        a
          ? {
              text: `${TRI[a.value.trim()] ?? a.value}${a.note ? `：${a.note}` : ''}`,
              source: sourceLabel(a.source_id),
              verifiedAt: a.verified_at,
            }
          : { text: '還沒有資料', source: null, verifiedAt: null },
      ];
    }
    if (r.kind === 'parking') {
      const list = (parking.data ?? []).filter((x) => x.place_id === r.place_id);
      if (!list.length) return [{ text: '還沒有資料', source: null, verifiedAt: null }];
      return list.map((x) => ({
        text: [
          PARKING_TYPE_LABEL[x.type as ParkingType],
          PARKING_FEE_LABEL[x.fee as ParkingFee],
          x.spaces !== null ? `${x.spaces} 格` : '',
          x.fee_note ?? '',
        ]
          .filter(Boolean)
          .join('．'),
        source: sourceLabel(x.source_id),
        verifiedAt: x.verified_at,
      }));
    }
    if (r.kind === 'field' && pl) {
      const hours = p.field === 'hours';
      return [
        {
          text: (hours ? pl.hours : pl.surface) ?? '還沒有資料',
          source: sourceLabel(hours ? pl.hours_source : pl.surface_source),
          verifiedAt: hours ? pl.hours_verified_at : pl.surface_verified_at,
        },
      ];
    }
    if (r.kind === 'closure' && pl) {
      return [
        {
          text: [
            STATUS[pl.status] ?? pl.status,
            pl.status_note ?? '',
            pl.status_until ? `預計 ${pl.status_until} 恢復` : '',
          ]
            .filter(Boolean)
            .join('．'),
          source: sourceLabel(pl.status_source),
          verifiedAt: pl.status_verified_at,
        },
      ];
    }
    if (r.kind === 'new_place') {
      const at = { lat: Number(p.lat), lng: Number(p.lng) };
      const near = (cityCards.data ?? [])
        .map((c) => ({
          name: c.name,
          m: Math.round(haversineKm(at, { lat: Number(c.lat), lng: Number(c.lng) }) * 1000),
        }))
        .filter((c) => c.m <= 300)
        .sort((a, b) => a.m - b.m);
      if (!near.length)
        return [{ text: '附近 300 公尺內沒有已知的場地', source: null, verifiedAt: null }];
      return near.map((c) => ({
        text: `附近已有：${c.name}（約 ${c.m} 公尺）`,
        source: null,
        verifiedAt: null,
      }));
    }
    return [{ text: '（沒有資料）', source: null, verifiedAt: null }];
  };

  const cards: CardData[] = filtered.map((r) => {
    const p = obj(r.payload);
    return {
      id: r.id,
      kind: r.kind,
      kindLabel: KIND_LABEL[r.kind] ?? r.kind,
      placeId: r.place_id,
      placeName: r.places?.name ?? s(p.name),
      cityName: cityName.get(r.city) ?? r.city,
      payload: r.payload,
      createdAt: r.created_at,
      createdText: DATE.format(new Date(r.created_at)),
      summary: suggestionSummary(r.kind, r.payload, catalog.labels),
      note: s(p.note) || r.note || '',
      submitter: r.profiles
        ? { name: r.profiles.display_name ?? '家長', accepted: r.profiles.accepted_count }
        : null,
      current: current(r),
      edit: editDefaults(r.kind, p),
    };
  });
  const groups = groupQueue(cards);
  const placesInQueue = [
    ...new Map(rows.filter((r) => r.place_id).map((r) => [r.place_id!, r.places?.name ?? ''])),
  ];

  return (
    <>
      <article className="place-article">
        <div className="dhead">
          <h1>審核後台</h1>
          <p>
            <Link href="/admin/naming">命名投票</Link>
            {user.role === 'admin' && (
              <>
                ．<Link href="/admin/users">使用者管理</Link>
              </>
            )}
          </p>
          <p className="cmeta">
            {user.role === 'admin'
              ? '管理員：全部縣市'
              : `負責縣市：${allowed.map((c) => cityName.get(c) ?? c).join('、') || '尚未指派'}`}
          </p>
          <p>
            待審 <strong>{rows.length}</strong> 筆
            {filtered.length !== rows.length && `（符合篩選 ${filtered.length} 筆）`}
          </p>
          <form className="admin-filter" method="get">
            <label>
              縣市
              <select name="city" defaultValue={q.city ?? ''}>
                <option value="">全部</option>
                {allowed.map((c) => (
                  <option key={c} value={c}>
                    {cityName.get(c) ?? c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              場地
              <select name="place" defaultValue={q.place ?? ''}>
                <option value="">全部</option>
                {placesInQueue.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              類型
              <select name="kind" defaultValue={q.kind ?? ''}>
                <option value="">全部</option>
                {Object.entries(KIND_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn" type="submit">
              篩選
            </button>
          </form>
        </div>
        <AdminQueue groups={groups} />
      </article>

      <article className="place-article admin-closed">
        <section className="dsec" aria-labelledby="closed-title">
          <h2 id="closed-title" className="dsec-title">
            維修中／已封閉的場地
          </h2>
          <ReopenList
            places={(closedPlaces.data ?? []).map((p) => ({
              id: p.id,
              name: p.name,
              text: [
                STATUS[p.status] ?? p.status,
                p.status_note ?? '',
                p.status_until ? `預計 ${p.status_until} 恢復` : '',
              ]
                .filter(Boolean)
                .join('．'),
            }))}
          />
        </section>
      </article>
    </>
  );
}
