// 隱私權政策（草稿，待法律審閱）。內容要跟實際的資料處理一致（CLAUDE.md 授權與隱私規則）。
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '隱私權政策（草稿）｜全台放電地圖',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <main className="place-page legal">
      <nav className="place-nav" aria-label="導覽">
        <Link href="/">← 全台放電地圖</Link>
      </nav>
      <article className="place-article">
        <div className="dhead">
          <h1>隱私權政策</h1>
          <p className="note err" role="note">
            草稿，待法律審閱。正式版本公布前，內容可能修改。
          </p>
        </div>

        <section className="dsec">
          <h2 className="dsec-title">一、不登入時</h2>
          <ul>
            <li>瀏覽、篩選、查路線都不需要登入，網站不建立任何帳號資料。</li>
            <li>
              使用「目前位置」時，位置只在你的瀏覽器裡計算距離，
              <strong>不會傳到網站的伺服器</strong>
              ，也不會記錄在任何紀錄或分析資料裡。
            </li>
            <li>輸入地址找出發點時，地址會送到 OpenStreetMap 的地址查詢服務（Nominatim）。</li>
          </ul>
        </section>

        <section className="dsec">
          <h2 className="dsec-title">二、登入後蒐集的資料</h2>
          <ul>
            <li>
              Email：用來登入，不會公開，也不會用來寄廣告。只有網站管理員為了協助處理帳號問題（例如你來信要求協助或刪除資料）時看得到。
            </li>
            <li>暱稱：公開顯示在你的貢獻旁。預設是「家長」加 4 位數字，可以隨時修改。</li>
            <li>你提交的修正建議、提交時間、審核結果。</li>
            <li>同意服務條款的時間。</li>
            <li>
              你儲存的篩選條件（最多 5
              組，例如「沙坑＋廁所」）：只有你看得到，不包含出發點或位置，刪除帳號時一起刪除。
            </li>
            <li>用 Google 登入時，Google 會提供你的 Email 與名稱；網站不會公開名稱或頭像。</li>
            <li>登入頁會載入 Google 提供的登入按鈕，Google 依它的隱私權政策處理這次連線。</li>
          </ul>
        </section>

        <section className="dsec">
          <h2 className="dsec-title">三、用途</h2>
          <p>
            只用於登入、顯示你的貢獻與審核狀態、審核員判斷建議是否可信（例如被採納過幾次），以及防止濫用。
          </p>
        </section>

        <section className="dsec">
          <h2 className="dsec-title">四、第三方服務</h2>
          <ul>
            <li>Supabase：存放帳號與資料。</li>
            <li>
              Cloudflare Turnstile：送出修正建議前確認不是機器人，會處理你的 IP
              位址與瀏覽器資訊。網站把 IP 轉送給 Cloudflare 驗證，<strong>網站本身不保存 IP</strong>
              。
            </li>
            <li>OpenStreetMap：地圖圖磚與地址查詢。</li>
          </ul>
        </section>

        <section className="dsec">
          <h2 className="dsec-title">五、保存期限與刪除</h2>
          <ul>
            <li>帳號資料保存到你刪除帳號為止。</li>
            <li>
              在<Link href="/me">「我的貢獻」</Link>
              頁可以刪除帳號：Email、暱稱等個人資料會立即刪除；已採納的修正會保留在場地資料裡，但不再連結到你。
            </li>
            <li>未採納的修正建議保留作為審核紀錄，不公開。</li>
          </ul>
        </section>

        <section className="dsec">
          <h2 className="dsec-title">六、聯絡</h2>
          <p>
            對個人資料有疑問，或要行使查詢、更正、刪除等權利，請透過網站公布的聯絡方式與我們聯繫（正式版本會補上）。
          </p>
        </section>
      </article>
    </main>
  );
}
