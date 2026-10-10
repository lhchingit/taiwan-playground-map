# 竹市放電地圖（playmap）

新竹市親子遊樂場與公園地圖。目前完成 P0（專案骨架與資料匯入），還沒有介面；下一步見 `docs/tasks/P1-prototype-port.md`。

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

# 4. 匯入種子資料（可以重複執行）
pnpm seed

# 5. 檢查
pnpm lint && pnpm typecheck && pnpm test   # 單元測試，不需要資料庫
pnpm test:db                               # 資料庫測試（RLS、seed），需要步驟 3、4
pnpm exec playwright install chromium      # 第一次跑 e2e 前
pnpm test:e2e

# 開發伺服器
pnpm dev
```

本機 Supabase 的網址與金鑰用 `pnpm exec supabase status` 查看；Studio 在 http://127.0.0.1:54323 。

### 其他指令

| 指令 | 用途 |
|---|---|
| `pnpm typegen` | migration 改了之後，重新產生 `src/types/database.ts` |
| `pnpm format` | 用 Prettier 排版 |
| `python3 scripts/build_seed.py && python3 scripts/import_hccg.py` | 從原始資料重新產生 `places.json`、`places.csv`、`data/review/` |
| `python3 scripts/check_seed_hash.py` | 在暫存資料夾重新產生上面的檔案，逐位元組比對 repo 裡的版本 |

## 目錄

| 路徑 | 內容 |
|---|---|
| `CLAUDE.md` | 給 Claude Code 的專案規則（資料三態、授權、慣例） |
| `docs/decisions.md` | 技術決策與重新檢討的條件 |
| `docs/tasks/` | 依序實作的任務說明（P0～P4；P4 是拓展到新竹縣、桃園市、苗栗縣） |
| `docs/prototype/playmap.html` | 可直接打開的原型，介面與行為以它為準 |
| `data/seed/places.json` | 新竹市 72 處種子資料（含來源） |
| `data/raw/` | 養工處清冊原文、清冊與 OpenStreetMap 的比對結果 |
| `data/review/` | 匯入時需要人工處理的清單（P2） |
| `scripts/build_seed.py` | 產生 places.json v0.1（手工整理的 10 筆） |
| `scripts/import_hccg.py` | 用清冊轉接器匯入、換成 OSM 座標，輸出 v0.2 |
| `scripts/sources/` | 資料來源轉接器，每個來源一個（目前：`hccg.py` 新竹市清冊） |
| `scripts/lib/` | 轉接器共用：讀寫檔、屬性對照、比對合併、review 清單 |
| `scripts/seed.ts`、`scripts/seed/` | `pnpm seed`：檢查 places.json 後寫入資料庫 |
| `supabase/migrations/0001_init.sql` | 初版資料表、索引、attrs 同步 trigger、RLS |
| `supabase/pending/0002_auth_roles.sql` | 會員角色、審核、照片、權限（P3 才放回 migrations） |
| `src/types/` | `place.ts` 手寫領域型別；`database.ts` 由 `pnpm typegen` 產生 |
| `tests/unit/`、`tests/db/`、`tests/e2e/` | 單元測試、資料庫測試、端對端測試 |
| `tests/fixtures/` | 測試用資料（`filter-cases.json` 是原型算出的 21 個篩選標準答案） |
| `.claude/commands/new-attribute.md` | 新增屬性的固定流程 |

地圖資料 © OpenStreetMap contributors（ODbL）。
