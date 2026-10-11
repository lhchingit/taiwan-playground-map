// 「我的貢獻」：自己提交的建議與照片、暱稱、刪除帳號。需要登入，動態產生（不快取）。
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AuthButton } from '@/components/auth/AuthButton';
import { KIND_LABEL, statusText, suggestionSummary } from '@/lib/auth/labels';
import { currentUser } from '@/lib/auth/session';
import { getAttributeCatalog, getCityBounds } from '@/lib/data';
import { supabaseAuth } from '@/lib/supabase/auth';
import { DeleteAccountForm, NicknameForm } from './MeForms';

export const metadata: Metadata = {
  title: '我的貢獻｜全台放電地圖',
  robots: { index: false },
};

export default function MePage() {
  return (
    <main className="place-page">
      <nav className="place-nav" aria-label="導覽">
        <Link href="/">← 全台放電地圖</Link>
        <AuthButton />
      </nav>
      <Suspense fallback={<p className="note">載入中…</p>}>
        <MeContent />
      </Suspense>
    </main>
  );
}

// 照片上傳先不開放（decisions D17）；開放時改成 true，「我的照片」區塊就會出現
const PHOTOS_ENABLED = false;

const DATE = new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeZone: 'Asia/Taipei' });

async function MeContent() {
  const supabase = await supabaseAuth();
  const user = await currentUser(supabase);
  if (!user) redirect('/login?next=/me');

  const [suggestions, photos, catalog, cities] = await Promise.all([
    supabase
      .from('edit_suggestions')
      .select('id, kind, payload, status, reject_reason, created_at, place_id, places(name, city)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('photos')
      .select('id, status, reject_reason, created_at, places(name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    getAttributeCatalog(),
    getCityBounds(),
  ]);
  const slug = new Map(cities.map((c) => [c.code, c.slug]));

  return (
    <article className="place-article">
      <div className="dhead">
        <h1>我的貢獻</h1>
        {user.banned && (
          <p className="note err" role="alert">
            帳號已停權{user.banReason ? `：${user.banReason}` : ''}。你仍然可以刪除帳號。
          </p>
        )}
      </div>

      <section className="dsec" aria-labelledby="me-profile">
        <h2 id="me-profile" className="dsec-title">
          暱稱
        </h2>
        <NicknameForm name={user.name} disabled={user.banned} />
      </section>

      <section className="dsec" aria-labelledby="me-suggestions">
        <h2 id="me-suggestions" className="dsec-title">
          我的修正建議
        </h2>
        {suggestions.data?.length ? (
          <ul className="me-list">
            {suggestions.data.map((s) => {
              const place = s.places;
              const citySlug = place ? slug.get(place.city) : undefined;
              const href = citySlug && s.place_id ? `/${citySlug}/places/${s.place_id}` : null;
              return (
                <li key={s.id}>
                  <div>
                    {href ? <Link href={href}>{place?.name}</Link> : (place?.name ?? '新增場地')}
                    <span className="cmeta">．{KIND_LABEL[s.kind] ?? s.kind}</span>
                  </div>
                  <div>{suggestionSummary(s.kind, s.payload, catalog.labels)}</div>
                  <div className="cmeta">
                    <span className={`me-status ${s.status}`}>
                      {statusText(s.status, s.reject_reason)}
                    </span>
                    ．{DATE.format(new Date(s.created_at))}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="note">還沒有資料。在場地頁按「回報修正」就可以提供修正。</p>
        )}
      </section>

      {PHOTOS_ENABLED && (
        <section className="dsec" aria-labelledby="me-photos">
          <h2 id="me-photos" className="dsec-title">
            我的照片
          </h2>
          {photos.data?.length ? (
            <ul className="me-list">
              {photos.data.map((p) => (
                <li key={p.id}>
                  <div>{p.places?.name}</div>
                  <div className="cmeta">
                    <span className={`me-status ${p.status}`}>
                      {statusText(p.status === 'approved' ? 'accepted' : p.status, p.reject_reason)}
                    </span>
                    ．{DATE.format(new Date(p.created_at))}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="note">還沒有資料。</p>
          )}
        </section>
      )}

      <section className="dsec" aria-labelledby="me-delete">
        <h2 id="me-delete" className="dsec-title">
          刪除帳號
        </h2>
        <DeleteAccountForm />
      </section>
    </article>
  );
}
