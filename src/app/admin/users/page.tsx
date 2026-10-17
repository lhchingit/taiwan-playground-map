// 使用者管理（只有管理員）：搜尋（暱稱或 Email）、角色、負責縣市、停權；最近的管理員操作紀錄。
// Email 只在這裡、只給管理員看（decisions D18），透過資料庫函式 admin_list_users() 讀取。
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { adminLogText, changedBy } from '@/lib/admin/history';
import { currentUser } from '@/lib/auth/session';
import { getCityBounds } from '@/lib/data';
import { supabaseAuth } from '@/lib/supabase/auth';
import { UsersTable, type UserRow } from './UsersTable';

export const metadata: Metadata = {
  title: '使用者管理｜全台放電地圖',
  robots: { index: false },
};

interface Props {
  searchParams: Promise<{ q?: string; page?: string }>;
}

const PAGE = 50;
const DATE = new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeZone: 'Asia/Taipei' });
const TIME = new Intl.DateTimeFormat('zh-TW', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Taipei',
});

export default function UsersPage({ searchParams }: Props) {
  return (
    <main className="place-page admin-page">
      <nav className="place-nav" aria-label="導覽">
        <Link href="/admin">← 審核後台</Link>
      </nav>
      <Suspense fallback={<p className="note">載入中…</p>}>
        <UsersContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function UsersContent({ searchParams }: Props) {
  const supabase = await supabaseAuth();
  const me = await currentUser(supabase);
  if (!me || me.banned || !['moderator', 'admin'].includes(me.role)) redirect('/');
  if (me.role !== 'admin') redirect('/admin');
  const q = await searchParams;
  const query = (q.q ?? '').trim().slice(0, 100);
  const page = Math.max(1, Number(q.page) || 1);

  const [list, log, cities] = await Promise.all([
    supabase.rpc('admin_list_users', {
      p_query: query || undefined,
      p_limit: PAGE,
      p_offset: (page - 1) * PAGE,
    }),
    supabase
      .from('admin_log')
      .select('id, actor, target, action, before, after, created_at')
      .order('id', { ascending: false })
      .limit(50),
    getCityBounds(),
  ]);
  if (list.error) throw new Error(`讀取使用者失敗：${list.error.message}`);
  const users = list.data ?? [];
  const total = Number(users[0]?.total ?? 0);
  const cityName = (code: string) => cities.find((c) => c.code === code)?.name ?? code;

  const logIds = [
    ...new Set(
      (log.data ?? []).flatMap((l) => [l.actor, l.target]).filter((x): x is string => !!x),
    ),
  ];
  const { data: names } = logIds.length
    ? await supabase.from('profiles').select('id, display_name').in('id', logIds)
    : { data: [] };
  const nameMap = new Map((names ?? []).map((n) => [n.id, n.display_name ?? '家長']));

  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    name: u.display_name ?? '家長',
    email: u.email,
    role: u.role,
    cities: u.cities ?? [],
    accepted: u.accepted_count,
    suggestions: Number(u.suggestions),
    bannedAt: u.banned_at ? DATE.format(new Date(u.banned_at)) : null,
    banReason: u.ban_reason,
    createdAt: DATE.format(new Date(u.created_at)),
    self: u.id === me.id,
  }));
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const link = (p: number) =>
    `/admin/users?${new URLSearchParams({ ...(query && { q: query }), page: String(p) })}`;

  return (
    <>
      <article className="place-article">
        <div className="dhead">
          <h1>使用者管理</h1>
          <p className="note">
            Email 只有管理員看得到，請只用於協助處理帳號問題（隱私權政策）。所有操作都會記錄。
          </p>
          <form className="admin-filter" method="get" role="search">
            <label>
              搜尋暱稱或 Email
              <input name="q" defaultValue={query} maxLength={100} />
            </label>
            <button className="btn" type="submit">
              搜尋
            </button>
          </form>
          <p className="cmeta">
            共 {total} 人{pages > 1 && `．第 ${page}／${pages} 頁`}
          </p>
        </div>
        <UsersTable users={rows} cities={cities.map((c) => ({ code: c.code, name: c.name }))} />
        {pages > 1 && (
          <nav className="dsec admin-pages" aria-label="分頁">
            {page > 1 && <Link href={link(page - 1)}>← 上一頁</Link>}
            {page < pages && <Link href={link(page + 1)}>下一頁 →</Link>}
          </nav>
        )}
      </article>

      <article className="place-article admin-closed">
        <section className="dsec" aria-labelledby="log-title">
          <h2 id="log-title" className="dsec-title">
            最近的管理員操作
          </h2>
          {(log.data ?? []).length === 0 ? (
            <p className="note">還沒有紀錄。</p>
          ) : (
            <ul className="me-list">
              {(log.data ?? []).map((l) => (
                <li key={l.id}>
                  <div>
                    {changedBy(l.actor, nameMap)} → {l.target ? changedBy(l.target, nameMap) : '—'}
                    ：{adminLogText(l.action, l.before, l.after, cityName)}
                  </div>
                  <div className="cmeta">{TIME.format(new Date(l.created_at))}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </article>
    </>
  );
}
