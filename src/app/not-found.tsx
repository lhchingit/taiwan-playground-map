import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="place-page">
      <article className="place-article">
        <div className="dhead">
          <h1>找不到這個頁面</h1>
          <p>這個場地可能已經移除，或網址有誤。</p>
          <p>
            <Link href="/hsinchu-city">回到全台放電地圖</Link>
          </p>
        </div>
      </article>
    </main>
  );
}
