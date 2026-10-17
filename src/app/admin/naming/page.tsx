// 命名投票（decisions D23）：負責縣市裡有人投票、還沒決定的待命名點。
// 審核員看得到每個名稱的票數與提出的人（只顯示暱稱），可以直接決定（不用達到門檻）。
// 管理員可以調整自動通過的門檻（全站一個數字）。
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AuthButton } from '@/components/auth/AuthButton';
import { currentUser } from '@/lib/auth/session';
import { getCityBounds, getNamingThreshold } from '@/lib/data';
import { supabaseAuth } from '@/lib/supabase/auth';
import { ResolveForm } from './ResolveForm';
import { ThresholdForm } from './ThresholdForm';

export const metadata: Metadata = {
  title: '命名投票｜全台放電地圖',
  robots: { index: false },
};

const OSM_TYPE: Record<string, string> = { n: 'node', w: 'way', r: 'relation' };

export default function NamingAdminPage() {
  return (
    <main className="place-page admin-page">
      <nav className="place-nav" aria-label="導覽">
        <Link href="/admin">← 審核後台</Link>
        <AuthButton />
      </nav>
      <Suspense fallback={<p className="note">載入中…</p>}>
        <NamingAdmin />
      </Suspense>
    </main>
  );
}

interface Vote {
  action: string;
  name: string | null;
  name_key: string | null;
  basis: string;
  profiles: { display_name: string | null } | null;
}

const who = (v: Vote) => `${v.profiles?.display_name ?? '家長'}（${v.basis}）`;

/** 依比對用的名稱分組（寫法不同但視為相同的算同一個），票多的在前 */
function tally(votes: Vote[]) {
  const groups = new Map<string, { names: Map<string, number>; people: string[] }>();
  for (const v of votes.filter((x) => x.action === 'name')) {
    const key = v.name_key ?? '';
    const g = groups.get(key) ?? { names: new Map<string, number>(), people: [] };
    g.names.set(v.name ?? '', (g.names.get(v.name ?? '') ?? 0) + 1);
    g.people.push(who(v));
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({
      name: [...g.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '',
      people: g.people,
    }))
    .sort((a, b) => b.people.length - a.people.length);
}

async function NamingAdmin() {
  const supabase = await supabaseAuth();
  const me = await currentUser(supabase);
  if (!me || me.banned || !['moderator', 'admin'].includes(me.role)) redirect('/');
  const [{ data, error }, cities, threshold] = await Promise.all([
    supabase
      .from('naming_candidates')
      .select(
        'id, city, osm_ref, district, naming_votes(action, name, name_key, basis, profiles(display_name))',
      )
      .eq('status', 'open')
      .order('id'),
    getCityBounds(),
    getNamingThreshold(),
  ]);
  if (error) throw new Error(`讀取命名投票失敗：${error.message}`);
  const cityName = new Map(cities.map((c) => [c.code, c.name]));
  // RLS：審核員只讀得到負責縣市的點與票
  const rows = (data ?? [])
    .map((c) => ({ ...c, votes: (c.naming_votes ?? []) as unknown as Vote[] }))
    .filter((c) => c.votes.length > 0);

  return (
    <article className="place-article">
      <div className="dhead">
        <h1>命名投票</h1>
        <p className="cmeta">
          有人投票、還沒決定的待命名點 {rows.length} 處。{threshold}{' '}
          位會員提出相同名稱（或都建議排除）會自動通過；未達門檻或意見分歧時，由審核員在這裡決定。
        </p>
        {me.role === 'admin' && <ThresholdForm value={threshold} />}
      </div>
      {rows.length === 0 && <p className="note">目前沒有需要處理的命名投票。</p>}
      {rows.map((c) => {
        const names = tally(c.votes);
        const excludes = c.votes.filter((v) => v.action === 'exclude');
        return (
          <section key={c.id} className="card" aria-label={c.id}>
            <h2 className="ctitle">
              {cityName.get(c.city) ?? c.city}．{c.district ?? '行政區未知'}{' '}
              <a
                href={`https://www.openstreetmap.org/${OSM_TYPE[c.osm_ref[0] ?? 'n']}/${c.osm_ref.slice(1)}`}
                target="_blank"
                rel="noopener"
              >
                {c.osm_ref}
              </a>
            </h2>
            <ul>
              {names.map((t) => (
                <li key={t.name}>
                  「{t.name}」{t.people.length} 票：{t.people.join('、')}
                </li>
              ))}
              {excludes.length > 0 && (
                <li>
                  建議排除 {excludes.length} 票：{excludes.map(who).join('、')}
                </li>
              )}
            </ul>
            <ResolveForm id={c.id} city={c.city} names={names.map((t) => t.name)} />
          </section>
        );
      })}
    </article>
  );
}
