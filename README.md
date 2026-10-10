# 全台放電地圖（playmap）

台灣親子遊樂場與公園地圖，目前上線新竹市。已完成 P0（專案骨架與資料匯入）與 P1（首頁的篩選、清單、地圖，以及每個場地的獨立頁面）。

## 從 clone 到跑起來

需要：Node 24 以上、Docker（本機 Supabase 用）、Python 3.12 以上（只有重新產生 places.json 時需要）。

```bash
# 1. 啟用 pnpm（版本由 package.json 的 packageManager 決定）
corepack enable pnpm
#    Windows 若出現 EPERM（沒有權限寫入 Program Files），改用：
#    corepack enable --install-directory "%APPDATA%\npm" pnpm

# 2. 安裝套件（supabase CLI 也一起裝在專案裡，用 pnpm exec supabase 執行）
pnpm install

# 3. 啟動本機 Supabase，從 migrations 建出資料表（第一次要下載 Docker 映像檔，需要幾分鐘）
pnpm exec supabase start
pnpm exec supabase db reset

# 4. 匯入種子資料（可以重複執行），再讓新竹市上線（匯入不會自動上線）
pnpm seed
pnpm city launch hsc

# 5. 產生 .env.local（Next.js 連本機 Supabase 用）
pnpm env:local

# 6. 開發伺服器：http://localhost:3000（會導向 /hsinchu-city）
pnpm dev

# 檢查
pnpm lint && pnpm typecheck && pnpm test   # 單元測試，不需要資料庫
pnpm test:db                               # 資料庫測試（RLS、seed），需要步驟 3、4
pnpm exec playwright install chromium      # 第一次跑 e2e 前
pnpm test:e2e                              # 需要步驟 3～5；會自動 build 並啟動在 3100 埠
```

本機 Supabase 的網址與金鑰用 `pnpm exec supabase status` 查看；Studio 在 http://127.0.0.1:54323 。

### 用 Docker Compose 執行

網站包成容器（正式版建置），資料庫沿用本機的 Supabase CLI。

```bash
# 前提：上面的步驟 1～5（Supabase 已啟動、已匯入資料、已產生 .env.local）
pnpm docker:up     # 建置映像檔並在背景啟動：http://localhost:3000
pnpm docker:down   # 停止並移除容器
```

- 容器透過 `host.docker.internal:54321` 連到主機上的 Supabase。**建置時也要連得到**：場地頁是建置時產生的，所以要先啟動 Supabase 再 `docker:up`。
- 資料改了之後**不用重新建置**：`pnpm seed`、`pnpm city launch／unlaunch` 會用 `.env.local` 的 `REVALIDATE_SECRET` 通知容器清快取，變更立刻生效（`pnpm dev` 也一樣）。
  `.env.local` 是舊的（沒有 `REVALIDATE_SECRET`）的話，先 `pnpm env:local` 再 `pnpm docker:up`。
- ⚠️ 重新 `pnpm docker:up` **不會**讀到新資料：原始碼沒變時 Docker 會沿用上次的建置結果。真的要從頭建置用 `docker compose --env-file .env.local build --no-cache`。
- 用 e2e 測容器：`PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm exec playwright test`（不會另外啟動伺服器）。
- 映像檔只含 Next 的 standalone 輸出（約 280 MB），以非 root 的 `node` 使用者執行；`.env*` 不會被打包進去。

### 其他指令

| 指令 | 用途 |
|---|---|
| `pnpm typegen` | migration 改了之後，重新產生 `src/types/database.ts` |
| `pnpm format` | 用 Prettier 排版 |
| `pnpm seed --city <代碼>`／`--dry-run`／`--prune` | 只匯入一個縣市；試跑（做完後回滾，只印出會改變什麼）；刪除種子資料已經沒有的場地（有使用者回報資料的不刪） |
| `pnpm regen:filter-cases` | 補資料後，用原型重新產生 `tests/fixtures/filter-cases.json`（`--check` 只檢查是否最新） |
| `pnpm city status`／`launch <代碼>`／`unlaunch <代碼>` | 縣市的場地數與上線狀態；上線、下線 |
| `pnpm docker:up`／`docker:down` | 用 Docker Compose 建置並啟動／停止網站（見上方） |
| `python3 scripts/build_seed.py && python3 scripts/import_hccg.py` | 從原始資料重新產生新竹市的 `data/seed/hsc/`、`data/review/hsc/` |
| `python3 scripts/check_seed_hash.py` | 在暫存資料夾重新產生上面的檔案，逐位元組比對 repo 裡的版本 |
| `pnpm tool:locate` | 人工定位工具（只在本機）：http://localhost:4100，處理找不到座標與待確認比對的清冊資料，結果寫進 `data/raw/hsc/manual-review.tsv`；之後重新執行上一列的兩個腳本套用 |
| `python3 scripts/fetch_hccg_toilets.py` | 重新下載新竹市公廁地點資訊到 `data/raw/hsc/hccg-toilets.json`；名稱對不到的公廁列在 `data/review/hsc/toilets-unmatched.csv`，人工確認後填 `data/raw/hsc/toilet-aliases.tsv` |
| `python3 scripts/fetch_hccg_parks.py` | 重新下載新竹市公園管理維護地點（面積與地點提示）到 `data/raw/hsc/hccg-parks.json` |
| `python -m unittest discover -s scripts/tests -t scripts` | 匯入腳本（Python）的測試 |
| `python3 scripts/fetch_city_bounds.py` | 從 OSM（Nominatim）重新取得各縣市行政界範圍，存到 `data/raw/osm-city-bounds.json`（新增縣市時才需要） |
| `pnpm screenshots p1b`／`p1c` | 原型與正式版並排截圖（正式版要先在 3100 埠執行）：p1b 首頁篩選、p1c 場地詳情，輸出到 `docs/screenshots/<組別>/` |

## 目錄

| 路徑 | 內容 |
|---|---|
| `CLAUDE.md` | 給 Claude Code 的專案規則（資料三態、授權、慣例） |
| `docs/decisions.md` | 技術決策與重新檢討的條件 |
| `docs/tasks/` | 依序實作的任務說明（P0～P4；P4 是拓展到新竹縣、桃園市、苗栗縣） |
| `docs/prototype/playmap.html` | 可直接打開的原型，介面與行為以它為準 |
| `data/seed/<縣市>/places.json` | 種子資料，每個縣市一個資料夾（目前：`hsc` 新竹市 72 處，含來源） |
| `data/raw/<縣市>/` | 原始資料（新竹市：養工處清冊原文、清冊與 OSM 的比對結果）；`data/raw/osm-city-bounds.json` 是各縣市 OSM 行政界範圍 |
| `data/review/<縣市>/` | 匯入時需要人工處理的清單（P2） |
| `scripts/build_seed.py` | 產生新竹市 places.json v0.1（手工整理的 10 筆） |
| `scripts/import_hccg.py` | 用清冊轉接器匯入、換成 OSM 座標，輸出 v0.2 |
| `scripts/sources/` | 資料來源轉接器，每個來源一個（目前：`hccg.py` 新竹市清冊） |
| `scripts/lib/` | 轉接器共用：讀寫檔、屬性對照、比對合併、review 清單 |
| `scripts/seed.ts`、`scripts/city.ts`、`scripts/seed/` | `pnpm seed`：檢查全部縣市的 places.json 後寫入資料庫；`pnpm city`：上線／下線 |
| `docs/operations.md` | 營運手冊：正式環境的匯入、上線、下線（GitHub Actions「資料作業」） |
| `supabase/migrations/0001_init.sql` | 初版資料表、索引、attrs 同步 trigger、RLS |
| `supabase/migrations/0002_public_views.sql` | 首頁用的公開 view：`city_bounds`（縣市範圍）、`place_cards`（清單與地圖） |
| `supabase/migrations/0003_place_coord_source.sql` | 場地的座標來源說明（`coord_source`） |
| `supabase/pending/0004_auth_roles.sql` | 會員角色、審核、照片、權限（P3 才放回 migrations） |
| `src/app/` | 頁面：`/` 導向 `/hsinchu-city`；`/[city]` 首頁；`/[city]/places/[id]` 場地頁；`/api/cities/[code]/places`、`/api/places/[id]`（快取 1 小時）；`sitemap.xml`、`robots.txt` |
| `src/components/home/` | 首頁元件：篩選面板、出發點、清單、地圖、詳情面板 |
| `src/components/place/` | 場地詳情內容（場地頁與首頁面板共用） |
| `src/lib/filter/` | 篩選、距離、時間估算、網址轉換（純函式） |
| `src/lib/` | 縣市載入判斷、格式、資料讀取、地址搜尋等 |
| `src/types/` | `place.ts` 手寫領域型別；`database.ts` 由 `pnpm typegen` 產生 |
| `tests/unit/`、`tests/db/`、`tests/e2e/` | 單元測試、資料庫測試、端對端測試 |
| `tests/fixtures/` | 測試用資料（`filter-cases.json` 是原型算出的 21 個篩選標準答案） |
| `docs/screenshots/` | 原型與正式版的並排截圖 |
| `.claude/commands/new-attribute.md` | 新增屬性的固定流程 |

地圖資料 © OpenStreetMap contributors（ODbL）。
