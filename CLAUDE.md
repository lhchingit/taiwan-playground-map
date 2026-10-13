# 全台放電地圖（playmap）

台灣親子遊樂場與公園地圖。家長可依遊樂設施、年齡、生活機能、停車、距離等條件篩選場地。
目前範圍：**新竹市**（72 處，來源：養工處兒童遊戲場清冊＋網路資料，座標來自 OpenStreetMap）。
新竹縣、桃園市、苗栗縣、臺北市、新北市的資料已準備好，上線時間由人決定（`pnpm city launch`）。目標：公開給大眾使用的手機優先網站（PWA），之後擴展到全台。

- 介面與互動規格：`docs/prototype/playmap.html`（可直接用瀏覽器打開的原型，行為以它為準）
- 技術決策與理由：`docs/decisions.md`
- 目前任務：`docs/tasks/` 裡編號最小、還沒完成的那一份

## 技術棧

Next.js（App Router）+ TypeScript strict、pnpm、Supabase（Postgres + PostGIS、Auth、Storage）、
MapLibre GL（`react-map-gl/maplibre`）、Vitest、Playwright。版本用專案開始時的最新穩定版，並在 package.json 鎖定。

## 常用指令

```bash
pnpm dev                 # 開發伺服器
pnpm test                # Vitest 單元測試
pnpm test:e2e            # Playwright 端對端測試
pnpm lint && pnpm typecheck
supabase start           # 本機 Supabase（需要 Docker）
supabase db reset        # 重建資料庫並跑 migrations + seed
pnpm seed                # 從 data/seed/<縣市>/places.json 匯入（--city hsc 只匯入一個縣市、--dry-run 試跑、--prune 刪除已拿掉的場地）
pnpm regen:filter-cases  # 補資料後用原型重新產生篩選標準答案
pnpm city launch hsc     # 上線（匯入不會自動上線）；status／unlaunch
python3 scripts/build_seed.py && python3 scripts/import_hccg.py   # 重新產生新竹市的 data/seed/hsc/
pnpm tool:locate         # 人工定位工具（本機），結果寫進 data/raw/hsc/manual-review.tsv
python -m unittest discover -s scripts/tests -t scripts   # 匯入腳本的測試
```

改完程式後，至少跑 `pnpm lint && pnpm typecheck && pnpm test`；動到 UI 的話再跑 `pnpm test:e2e`。

## 資料規則（不可違反）

1. **屬性是三態：`y` 有／`n` 無／`u` 未知。** 沒有資料就是 `u`，絕不能預設成 `n` 或 `false`。
   TypeScript 型別用 `'y' | 'n' | 'u'`，不要用 boolean。
2. **篩選語意：** 預設只有 `y` 通過；使用者開啟「包含資料未知」時 `u` 也通過；`n` 永遠不通過。
   同一組內的多選條件是 AND（遊樂設施、生活機能），停車類型是 OR。
   標準答案在 `tests/fixtures/filter-cases.json`，任何篩選邏輯的修改都必須通過這組測試。
3. **每筆事實都要有來源。** `place_attributes` 與 `place_parking` 的每一列都要有 `source_id` 與 `verified_at`。
4. **不可以自己編造場地資料。** 不能憑印象或推測填任何屬性、座標、開放時間；找不到來源就留 `u`，並在 PR 說明。
   測試用的假資料只能放在 `tests/fixtures/`，id 以 `test-` 開頭，不可進入 seed。
5. **新增屬性只加資料、不改表結構。** 在 `attribute_defs` 加一列（含 `category`、`group_name`、`sort_order`），
   再補介面標籤與測試。流程見 `.claude/commands/new-attribute.md`。
6. **停車是獨立結構：** `type`（lot / street / none / u）、`fee`（free / paid / u）、`spaces`（整數或 null）。

## 授權與隱私（不可違反）

- **不可以把 Google Maps / Places 的任何資料存進資料庫或 seed**，包括座標、評論、照片、評分。
  座標來源只能是 OpenStreetMap、內政部 TGOS、政府開放資料（政府資料開放授權條款，decisions D21），或實地測量。
  （新竹市等縣市的座標來自 OpenStreetMap，臺北市來自公園處的開放資料；地圖與資料頁需標示「© OpenStreetMap contributors」。）
- 網路文章與評論只能當成「查證線索」，事實要重新整理並標註來源，不可複製原文。
- 使用者上傳的照片：伺服器端移除 EXIF（含 GPS），審核通過前不公開。
- 不在 log 或分析事件裡記錄使用者的精確定位；距離計算在前端完成。

## 權限規則（不可違反，P3 起適用）

- **看資料不用登入，寫入才要登入。** 首頁、場地頁、篩選、查路線永遠不能要求登入。
- 角色：`member` 會員 → `trusted` 資深貢獻者（尚未啟用）→ `moderator` 審核員（限負責縣市）→ `admin` 管理員。
  角色只存在 `profiles.role`，判斷一律用資料庫函式 `app_role()`、`is_admin()`、`can_moderate(city)`。
- **權限在資料庫層把關**（RLS、SECURITY DEFINER 函式）。前端隱藏按鈕只是體驗，不能當成安全機制。
- 使用者提交的修改一律先進 `edit_suggestions`（status = pending），**只能透過 `review_suggestion()` 核准**，
  不可以寫任何繞過審核、直接寫入 `place_attributes` 的會員端程式。
- 審核員不能審核自己的建議，也不能審核負責縣市以外的建議。
- 每一個權限規則都要有對應的自動測試（用不同身分的 JWT 直接打資料庫）；改 RLS 時，權限測試必須全部通過。
- 對外只顯示暱稱；email、登入方式、精確定位不可出現在任何公開頁面或 API 回應。

## 程式慣例

- 介面文字一律繁體中文（台灣用語），沿用原型用字：「包含資料未知」「還沒有資料」「回報修正」「查實際路線」。
- 篩選、距離、時間估算寫成純函式，放在 `src/lib/filter/`，不依賴 React，必須有單元測試。
- 篩選狀態同步到網址 query string，方便家長分享連結。
- 時間估算：直線距離 × 1.35 ÷ 速度（開車 30、機車 25、步行 4.5 km/h），介面標示「估算」；大眾運輸不估算，連到 Google 地圖。
- 顏色與字體沿用原型 `:root` 的 tokens，支援淺色與深色模式。
- Supabase 存取一律經過 RLS；不要在前端使用 service role key。

## 工作方式

- 一個 PR 只做一件事；先提計畫（plan mode），確認後再寫程式。
- PR 說明要列出：做了什麼、怎麼驗證、有哪些資料欄位仍是 `u` 或需要人工確認。
- 不確定的產品決策（例如篩選語意、用字）先問，不要自己決定。
