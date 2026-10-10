# P1 把原型搬進 Next.js

**目標：** 做出跟 `docs/prototype/playmap.html` 行為一致的正式版，資料改從 Supabase 讀取，每個場地都有可被搜尋引擎索引的頁面。

開始前先用瀏覽器打開原型，實際操作一遍。

## 範圍

### 1. 篩選邏輯（先做，先寫測試）

- 從原型的 `pass()`、`passAttr()`、`hav()`、`est()` 與停車判斷，抽成 `src/lib/filter/` 下的純函式。
- 篩選條件定義成一個型別 `Filters`，包含：
  `maxKm`、`age`、`play[]`、`amen[]`、`stay[]`、`size[]`、`env`、`free`、`includeUnknown`、`pkType[]`、`pkFee`、`pkMin`。
- 回傳 `{ results: Place[]（依距離排序）, unknownHint: number }`。
  `unknownHint` 是「開啟包含未知後會多出幾處」，沒開啟時才計算。
- **用 `tests/fixtures/filter-cases.json` 寫表格驅動測試**：21 個案例，`expected_ids` 的內容與順序都要完全相同。這組測試沒過就不要往下做。

### 2. 篩選狀態 ↔ 網址

- 篩選條件同步到 query string，例如 `?play=sandpit,slide&amen=toilet&age=3&km=5&unk=1`。
- 重新整理或分享連結後，畫面要還原成同樣的狀態。
- 出發點**不要**放進網址，避免分享連結時洩漏使用者位置。

### 3. 首頁 `/`

- 版面與原型相同：桌機左欄放篩選和清單、右邊是地圖；手機上方地圖、下方清單，篩選面板預設收起。
- 地圖只顯示符合條件的場地；標記編號與清單編號一致（依距離排序）。
- 出發點：預設嘗試定位；可以輸入地址（Nominatim，限台灣）或在地圖上點選。定位失敗時以新竹火車站為範例並標示「範例」。
- 交通方式：開車、機車、步行、大眾運輸（記在 localStorage）。
- 資料載入：依出發點載入附近縣市的場地（見 decisions D4），每個縣市的資料各自快取 1 小時。目前只有新竹市上線，但程式要能處理多個縣市。
- 網址：首頁 `/` 導向 `/hsinchu-city`；場地頁 `/hsinchu-city/places/[id]`（decisions D12）。

### 4. 場地頁 `/<縣市>/places/[id]`

- 地圖與場地頁標示「© OpenStreetMap contributors」，場地頁顯示資料來源（清冊、網路文章、使用者回報）。
- 用 `generateStaticParams` 預先產生靜態頁，並設定 `revalidate`。
- 內容與原型詳情面板相同：基本資料、遊樂設施（依分組）、生活機能、停車；
  已知的逐列顯示並附來源與確認日期，未知的收成一行「還沒有資料：…」。
- SEO：`<title>` 用「場地名稱｜新竹市親子遊樂場」，meta description 用 `summary`，
  加上 JSON-LD（schema.org `Park` 或 `Playground`）。
- 在首頁點清單或標記，桌機打開側邊詳情面板，手機打開底部抽屜，同時更新網址為 `/hsinchu-city/places/[id]`（可分享）。
- 「查實際路線」連到 Google 地圖，帶入目前的出發點與交通方式。
- 「回報修正」按鈕先顯示「即將開放」，P3 才實作。

### 5. 樣式

- 沿用原型 `:root` 的顏色與字體 tokens，深色模式要能用。
- 手機寬度 400px 時不能出現水平捲動。

### 6. 端對端測試（Playwright）

至少包含：
- 選「沙坑」再加「廁所」→ 顯示 1 處，提示「另有 69 處資料未知」；勾選包含未知 → 70 處。
- 年齡未知（`age_min` 為 null）的場地：選了年齡就不顯示，勾選包含未知才顯示。
- 選「停車場」＋「付費」→ 1 處（南寮兒童挖沙玩水區）。
- 地圖標記數量等於清單數量。
- 帶 query string 打開網址，篩選狀態正確還原。
- 直接打開 `/hsinchu-city/places/hsc-luguang-park`，頁面有「溜索」且標示來源。
- 出發點設在新竹市與新竹縣交界附近時，會去載入新竹縣的資料（目前新竹縣沒有上線、沒有資料，結果只有新竹市，但要驗證有發出請求且不會出錯）。
- 手機尺寸沒有水平捲動。

把 e2e 加進 CI。

## 不在範圍

登入、回報修正的實際功能、實際路線計算、照片、PWA。

## 完成標準

- [ ] `filter-cases.json` 的 21 個案例全部通過。
- [ ] 上面列的 e2e 測試全部通過，且已加進 CI。
- [ ] 跟原型並排操作，相同條件下結果一致（PR 附上幾組截圖對照）。
- [ ] Lighthouse 手機版 SEO ≥ 95、無障礙 ≥ 90。
- [ ] PR 說明列出跟原型不一致的地方和原因。

## 給 Claude Code 的提示

分三個 PR：（a）篩選純函式與測試；（b）首頁；（c）場地頁與 SEO。每個 PR 開工前先用 plan mode 提計畫。
