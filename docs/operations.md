# 營運手冊：正式環境的資料作業

這份文件寫給「已經上線到雲端」之後的人：怎麼把新縣市的資料匯入正式資料庫、確認後公開，以及出錯時怎麼收回。
本機開發請看 README。

## 基本觀念

- **匯入（`pnpm seed`）和上線（`pnpm city launch`）是兩件事。** 匯入只寫資料，不會公開；上線才會讓訪客看得到。
- **沒上線的縣市，資料在資料庫裡，但 RLS 會擋住訪客**（場地、屬性、停車都讀不到）。可以先匯入、在 Supabase Studio 裡檢查，再上線。
- **網站資料快取 1 小時。** 匯入、上線、下線之後，工具會呼叫網站的 `/api/revalidate` 清快取，變更立刻生效；沒設定的話最多 1 小時後才更新。
- **使用者回報的資料（`source_id = 'user'`）不會被匯入覆蓋或刪除。**
- **匯入可以重複執行**，只有內容有變的資料才會更新。也可以先 `--dry-run` 試跑，看會改變什麼。

## 第一次設定（只做一次）

### 1. Supabase 連線字串

Supabase 後台 → 專案 → **Connect** → 複製 Postgres 連線字串（含密碼），例如：
`postgresql://postgres.xxxx:密碼@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`

匯入要在交易裡執行，請用 **Session pooler（埠 5432）或直連**，不要用 Transaction pooler（埠 6543）。

### 2. 網站的清快取密鑰

產生一組夠長的隨機字串（例如 `openssl rand -hex 32`），設定在網站的部署環境變數 `REVALIDATE_SECRET`，並重新部署。
沒設定時 `/api/revalidate` 一律回 404。

### 3. GitHub 的 production environment

GitHub repo → **Settings → Environments → New environment**，名稱 `production`：

- **Required reviewers**：加上你自己（或負責審核資料的人）。每次執行資料作業都要核准。
- **Deployment branches**：選 **Selected branches** → 只允許 `main`。
- **Environment secrets**：

| 名稱 | 內容 |
|---|---|
| `PROD_DATABASE_URL` | 第 1 步的連線字串 |
| `SITE_URL` | 正式網址，例如 `https://example.tw`（結尾不要 `/`） |
| `REVALIDATE_SECRET` | 第 2 步的密鑰 |

### 4. 登入（P3）

網站只用 anon key，登入 session 存在 httpOnly cookie，不需要 service role key。上線前在 Supabase 後台設定：

1. **Authentication → URL Configuration**
   - Site URL：正式網址，例如 `https://<網域>`。
   - Redirect URLs：`https://<網域>/**`。只有清單裡的網址可以收到登入結果。
2. **Google 登入**
   - 在 Google Cloud Console 建立「OAuth 用戶端 ID」，類型選「網頁應用程式」。
   - 「已授權的重新導向 URI」填 Supabase 的 callback：`https://<專案代碼>.supabase.co/auth/v1/callback`。
   - 把 Client ID、Secret 填到 Supabase 的 Authentication → Providers → Google。
   - OAuth 同意畫面的應用程式名稱填「全台放電地圖」，範圍只要 email、profile。
3. **Email 登入連結**
   - Authentication → Emails → Templates 的「Magic Link」與「Confirm signup」兩個範本，主旨與內容都改成 `supabase/templates/magic_link.html`。
   - 連結格式是 `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email`，網站在 `/auth/confirm` 驗證。
4. **寄信服務（SMTP）**：Supabase 內建的寄信服務每小時只能寄很少封，只適合測試，**上線前一定要設定自訂 SMTP**（Authentication → Emails → SMTP Settings），例如 Amazon SES、Resend、Postmark。寄件人用自己網域的信箱，並設定 SPF／DKIM，避免被當成垃圾信。
5. **頻率限制**：Authentication → Rate Limits 的寄信上限依 SMTP 方案調整。

本機開發：Google 預設關閉（登入頁顯示「尚未設定」）；Email 登入信可以在 Mailpit（http://127.0.0.1:54324）看到。

## 匯入一個新縣市（以新竹縣 `hsq` 為例）

1. **本機準備資料**（P4 任務，見 `docs/tasks/P4-expansion.md`）
   - 寫資料來源轉接器 `scripts/sources/<來源>.py`，輸出到 `data/seed/hsq/places.json`。
   - 原始資料放 `data/raw/hsq/`，需要人工確認的清單在 `data/review/hsq/`。
   - 本機匯入檢查：`pnpm seed --city hsq` → `pnpm city launch hsq` → `pnpm dev` 實際看過。
   - 開 PR、CI 綠燈、合併到 `main`。
2. **schema 有改的話，先套用 migration**
   ```bash
   pnpm exec supabase link --project-ref <專案代碼>
   pnpm exec supabase db push
   ```
3. **GitHub → Actions → 資料作業（正式環境） → Run workflow**
   1. `hsq` + `dry-run`：看 job summary，確認新增的筆數合理、沒有意外的刪除。
   2. `hsq` + `seed`：會先試跑一次，再真的匯入。
4. **在 Supabase Studio 檢查**：`places` 裡 `city = 'hsq'` 的資料、座標、屬性。這時訪客還看不到。
5. **上線**：`hsq` + `launch`。網站立刻出現新竹縣；首頁 `/` 會從直接導向新竹市，變成縣市選單。
6. **上線後確認**：打開 `/hsinchu-county` 與幾個場地頁；`/sitemap.xml` 有新的場地頁。

之後資料有更新，重新跑 `seed` 即可，不用再上線一次。

**場地從種子資料拿掉時**（例如人工確認已廢除、待實地確認）：`seed` 預設只會警告「資料庫有、places.json 沒有」，不會刪除。確認要刪的話，在 Run workflow 勾選 **prune**：試跑會先列出會刪除的場地，匯入時才真的刪除。有使用者回報資料的場地不會被刪，會列出來交給人工處理。

## 政府資料更新（新竹市）

`.github/workflows/hccg-update.yml` 每季（1、4、7、10 月 1 日）執行 `scripts/check_hccg_update.py --meta-only`。

**限制：** GitHub Actions 連不到市府的下載主機（odws.hccg.gov.tw，逾時，可能擋國外 IP），所以自動檢查只看
data.gov.tw 上三份資料的「更新時間」與下載網址：

- 更新時間晚於我們的擷取日期，或下載網址換了 → 開一個標籤是「資料更新」的 issue（已經有開著的就留言）
- 更新時間有變，內容不一定有變；反過來，市府改了內容卻沒更新時間的話，自動檢查也不會發現。所以每年至少在本機跑一次完整檢查

也可以在 Actions 頁面手動執行。

收到 issue 後：

1. **在本機跑完整檢查**：`python3 scripts/check_hccg_update.py`，它會下載三份資料，產生差異報告
   （新增、刪除、設施變更、編號變動）。結果是「沒有變動」就在 issue 留言後關閉。
2. **先看報告裡標「注意」或「要跟著處理」的項目**
   - **編號變動**：`manual-review.tsv`、`osm-matches.tsv` 用清冊編號對應，場地 id 也由編號產生（D12，公開後不改）。
     不能直接重新匯入，要先人工決定怎麼對應，必要時先開 issue 討論。
   - **被引用的場地刪除**：確認是真的廢除，還是改名或併到別處；`manual-review.tsv` 等檔案裡的那一列要跟著處理。
   - **對不到屬性的新設施文字**：在 `scripts/sources/hccg.py` 的 `RULES` 加規則；看不出是什麼設施就留著，**不可推測**。
   - **屬性不再列出**：清冊沒列出不代表沒有，**不可以改成「無」**。
   - **下載網址換了**：更新 `scripts/sources/hccg_datasets.py`。
3. **下載**：報告列出要跑的 `fetch_hccg_*.py`。
4. **重新匯入**：`python3 scripts/build_seed.py && python3 scripts/import_hccg.py`，看 `git diff data/` 與 `data/review/hsc/` 的變化。
5. **更新標準答案**：`pnpm regen:filter-cases`，跑完整測試（含 `pnpm test:e2e`）。
6. **開 PR**，說明裡附上 issue 連結與報告重點。合併後關閉 issue。
7. **匯入正式環境**：Actions → 資料作業 → `hsc` + `dry-run` 確認，再 `seed`（有場地被拿掉時勾 prune）。

## 出錯時

- **資料有問題、要先收回**：`hsq` + `unlaunch`。訪客立刻看不到新竹縣（RLS＋清快取），資料留在資料庫，修正後重新 `seed`、`launch`。
- **匯入失敗**：整個匯入在同一個交易裡，失敗就全部回滾，資料庫不會停在一半。看 job 的錯誤訊息修正後重跑。
- **清快取失敗**：資料庫已經更新，網站最多 1 小時後也會更新。檢查 `SITE_URL`、`REVALIDATE_SECRET` 是否跟網站的設定一致。

## 從本機操作（不建議，只在 GitHub Actions 不能用時）

```bash
DATABASE_URL="<連線字串>" SITE_URL="https://example.tw" REVALIDATE_SECRET="<密鑰>" \
  pnpm seed --city hsq --dry-run --allow-remote
# 確認後拿掉 --dry-run；上線：
DATABASE_URL=... SITE_URL=... REVALIDATE_SECRET=... pnpm city launch hsq --allow-remote
```

不加 `--allow-remote` 時，工具會拒絕連到本機以外的資料庫。

## 新增 4 個縣市以外的縣市

`cities` 表目前有新竹市（hsc）、新竹縣（hsq）、桃園市（tyc）、苗栗縣（mlc）。新增其他縣市時：

1. 寫一個 migration 新增 `cities` 資料列（`code` 三碼、`slug`、`name`），`launched_at` 留空。
2. 在 `scripts/fetch_city_bounds.py` 的 `CITIES` 加上這個縣市，執行後提交 `data/raw/osm-city-bounds.json`。
3. 在 `.github/workflows/data-ops.yml` 的 `city` 選項加上新代碼。
4. 之後照「匯入一個新縣市」的步驟。
