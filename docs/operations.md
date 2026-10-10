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
