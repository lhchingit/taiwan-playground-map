# 竹市放電地圖（playmap）

新竹市親子遊樂場與公園地圖。目前只有起始文件與種子資料，程式從 `docs/tasks/P0-scaffold.md` 開始實作。

| 路徑 | 內容 |
|---|---|
| `CLAUDE.md` | 給 Claude Code 的專案規則（資料三態、授權、慣例） |
| `docs/decisions.md` | 技術決策與重新檢討的條件 |
| `docs/tasks/` | 依序實作的任務說明（P0～P4；P4 是拓展到新竹縣、桃園市、苗栗縣） |
| `docs/prototype/playmap.html` | 可直接打開的原型，介面與行為以它為準 |
| `data/seed/places.json` | 新竹市 72 處種子資料（含來源） |
| `data/raw/` | 養工處清冊原文、清冊與 OpenStreetMap 的比對結果 |
| `data/review/` | 匯入時需要人工處理的清單（P2） |
| `scripts/build_seed.py`、`scripts/import_hccg.py` | 產生 places.json（依序執行：先 build_seed 產生 10 筆，再 import_hccg 匯入清冊並換座標） |
| `supabase/migrations/0001_init.sql` | 初版資料表、索引、attrs 同步 trigger、RLS |
| `supabase/migrations/0002_auth_roles.sql` | 會員角色、修正建議審核、照片、修改紀錄與權限（P3） |
| `tests/fixtures/filter-cases.json` | 由原型算出的 21 個篩選標準答案 |
| `.claude/commands/new-attribute.md` | 新增屬性的固定流程 |

開始：在 repo 根目錄啟動 Claude Code，輸入「請依照 docs/tasks/P0-scaffold.md 開始，先提出計畫」。
