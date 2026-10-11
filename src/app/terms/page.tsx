// 服務條款（草稿，待法律審閱）。使用者貢獻內容的授權見 decisions D11（資料採 ODbL）。
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '服務條款（草稿）｜全台放電地圖',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <main className="place-page legal">
      <nav className="place-nav" aria-label="導覽">
        <Link href="/">← 全台放電地圖</Link>
      </nav>
      <article className="place-article">
        <div className="dhead">
          <h1>服務條款</h1>
          <p className="note err" role="note">
            草稿，待法律審閱。正式版本公布前，內容可能修改。
          </p>
        </div>

        <section className="dsec">
          <h2 className="dsec-title">一、服務內容</h2>
          <p>
            全台放電地圖提供親子遊樂場與公園的資訊。瀏覽地圖、場地資料、篩選與查路線都不需要登入；登入後可以回報修正。
          </p>
          <p>場地資料可能不完整或已經改變，出發前請自行確認現場狀況與開放時間。</p>
        </section>

        <section className="dsec">
          <h2 className="dsec-title">二、帳號</h2>
          <ul>
            <li>
              可以用 Google 帳號或 Email 登入連結登入。網站只公開你的暱稱，不公開 Email 或登入方式。
            </li>
            <li>你可以隨時在「我的貢獻」頁修改暱稱或刪除帳號。</li>
          </ul>
        </section>

        <section className="dsec">
          <h2 className="dsec-title">三、你貢獻的內容與授權</h2>
          <ul>
            <li>
              你回報的修正（例如設施有沒有、停車、開放時間），經審核採納後會成為場地資料的一部分。
            </li>
            <li>
              你同意這些內容以{' '}
              <a
                href="https://opendatacommons.org/licenses/odbl/1-0/"
                target="_blank"
                rel="noopener"
              >
                開放資料庫授權條款（ODbL）1.0
              </a>{' '}
              授權公開，任何人都可以依照 ODbL 使用、改作與再散布（要標示出處，改作後的資料庫也要以
              ODbL 公開）。
            </li>
            <li>網站的地圖與座標也來自 OpenStreetMap，同樣採 ODbL。</li>
            <li>
              你保證回報的內容是自己實地確認或整理的事實，
              <strong>不是抄錄網路文章、評論的原文</strong>
              ，也<strong>不是從 Google 地圖等不允許轉用的服務複製</strong>的資料。
            </li>
            <li>刪除帳號後，已採納的內容會保留在場地資料裡，但不再顯示是誰提供的。</li>
          </ul>
        </section>

        <section className="dsec">
          <h2 className="dsec-title">四、審核</h2>
          <ul>
            <li>所有修正都要經過審核員確認，通過後才會更新場地資料。</li>
            <li>
              審核員可以因為重複、無法查證、不當內容、資訊過時等原因不採納，原因會顯示在「我的貢獻」頁。
            </li>
            <li>每個帳號 24 小時內最多回報 30 筆。</li>
          </ul>
        </section>

        <section className="dsec">
          <h2 className="dsec-title">五、停權</h2>
          <p>
            故意提供不實資料、張貼不當內容、大量灌水或干擾服務時，網站可以停權帳號。停權後不能再回報，但仍然可以刪除帳號。
          </p>
        </section>

        <section className="dsec">
          <h2 className="dsec-title">六、其他</h2>
          <p>
            個人資料的處理方式見<Link href="/privacy">隱私權政策</Link>。條款修改時會在網站公告。
          </p>
        </section>
      </article>
    </main>
  );
}
