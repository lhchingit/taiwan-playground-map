// 場地的修改紀錄（審核員、管理員）：設施與生活機能、基本資料與狀態，由新到舊；可以「回到這筆修改之前」。
// 只讀得到負責縣市的紀錄（RLS）；其他人導回審核後台。
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { attributeHistoryText, fieldHistoryText } from '@/lib/admin/history';
import { currentUser } from '@/lib/auth/session';
import { getAttributeCatalog, getCityBounds, getSources } from '@/lib/data';
import { supabaseAuth } from '@/lib/supabase/auth';
import { HistoryTable, type HistoryRow } from './HistoryTable';

export const metadata: Metadata = {
  title: '修改紀錄｜全台放電地圖',
  robots: { index: false },
};

interface Props {
  params: Promise<{ id: string }>;
}

export default function PlaceHistoryPage({ params }: Props) {
  return (
    <main className="place-page admin-page">
      <nav className="place-nav" aria-label="導覽">
        <Link href="/admin">← 審核後台</Link>
      </nav>
      <Suspense fallback={<p className="note">載入中…</p>}>
        <HistoryContent params={params} />
      </Suspense>
    </main>
  );
}

const DATE = new Intl.DateTimeFormat('zh-TW', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Taipei',
});

async function HistoryContent({ params }: Props) {
  const { id } = await params;
  const supabase = await supabaseAuth();
  const user = await currentUser(supabase);
  if (!user || user.banned || !['moderator', 'admin'].includes(user.role)) redirect('/');

  const { data: place } = await supabase
    .from('places')
    .select('id, name, city')
    .eq('id', id)
    .maybeSingle();
  const [cities, catalog, sources] = await Promise.all([
    getCityBounds(),
    getAttributeCatalog(),
    getSources(),
  ]);
  const cityName = new Map(cities.map((c) => [c.code, c.name]));
  const [attrs, fields] = await Promise.all([
    supabase
      .from('place_attribute_history')
      .select(
        'id, key, old_value, new_value, old_source, new_source, new_note, changed_by, changed_at',
      )
      .eq('place_id', id)
      .order('id', { ascending: false })
      .limit(300),
    supabase
      .from('place_field_history')
      .select(
        'id, field, old_value, new_value, old_source, new_source, old_until, new_until, note, suggestion_id, restored_from, changed_by, changed_at',
      )
      .eq('place_id', id)
      .order('id', { ascending: false })
      .limit(300),
  ]);
  // 場地不存在，或不是負責縣市（RLS 讀不到場地）
  if (!place) redirect('/admin');

  const ids = [
    ...new Set(
      [...(attrs.data ?? []), ...(fields.data ?? [])]
        .map((h) => h.changed_by)
        .filter((x): x is string => !!x),
    ),
  ];
  const { data: profiles } = ids.length
    ? await supabase.from('profiles').select('id, display_name').in('id', ids)
    : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name ?? '家長']));
  const source = (sid: string | null | undefined) =>
    sid ? (sources.find((s) => s.id === sid)?.label ?? sid) : null;

  const attrRows: HistoryRow[] = (attrs.data ?? []).map((h) => ({
    id: h.id,
    at: DATE.format(new Date(h.changed_at)),
    ...attributeHistoryText(h, catalog.labels, source, names),
    note: h.new_note ?? '',
  }));
  const fieldRows: HistoryRow[] = (fields.data ?? []).map((h) => ({
    id: h.id,
    at: DATE.format(new Date(h.changed_at)),
    ...fieldHistoryText(h, source, names),
    note: [
      h.note ?? '',
      h.suggestion_id ? `由建議 #${h.suggestion_id} 套用` : '',
      h.restored_from ? `還原紀錄 #${h.restored_from}` : '',
    ]
      .filter(Boolean)
      .join('；'),
  }));

  return (
    <article className="place-article">
      <div className="dhead">
        <h1>修改紀錄：{place.name}</h1>
        <p className="cmeta">
          {cityName.get(place.city) ?? place.city}．
          <Link
            href={`/${cities.find((c) => c.code === place.city)?.slug ?? ''}/places/${place.id}`}
          >
            看場地頁
          </Link>
        </p>
        <p className="note">
          「回到這筆修改之前」會把那個項目恢復成這筆修改發生前的值與來源，並新增一筆紀錄；原有紀錄不會被刪除。
        </p>
      </div>
      <HistoryTable placeId={place.id} attributes={attrRows} fields={fieldRows} />
    </article>
  );
}
