# AGENTS.md：給貢獻者與 AI agent 的工作指南

這份文件把專案目前的規則整理成可以照著做的指南，人或 AI agent 都適用。它只是入口與摘要。
規則有衝突時，以下面的文件為準，細節也請看原文：

| 文件 | 內容 |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | **不可違反的規則**：資料、授權、權限、程式慣例 |
| [`docs/decisions.md`](docs/decisions.md) | 每個技術與產品決策的理由，用 D 編號引用 |
| [`docs/operations.md`](docs/operations.md) | 操作流程：上線、匯入、命名、寫回 repo |
| [`docs/tasks/`](docs/tasks/) | 目前的任務。P5 是更多縣市，各縣市的資料來源、進度與待處理數量都在 `P5-more-cities.md` |
| [`docs/prototype/playmap.html`](docs/prototype/playmap.html) | 介面與互動規格，行為以它為準 |

---

## 1. 工作流程

1. **先提計畫，確認後才寫程式。**
2. **一個 PR 只做一件事。** 從 `main` 開分支，例如 `p5-<縣市代碼>`。
3. **完成前要跑完驗證**，見第 8 節。
4. **PR 說明**用繁體中文，要列出：
   - 做了什麼
   - 怎麼驗證
   - 哪些欄位仍是 `u`、哪些需要人工確認
5. **署名**
   - commit 結尾：`Co-Authored-By: <模型名稱> <noreply@anthropic.com>`
   - PR 說明結尾：`🤖 Generated with [Claude Code](https://claude.com/claude-code)`
6. **以下由人決定，不要自己決定：**
   - 縣市上線時間：`pnpm city launch`
   - 產品用語、篩選語意
   - 資料來源的取捨
   - 意思不明的欄位怎麼對照
   - 場地名稱：一律由人或會員命名，**不可代填**

---

## 2. 不可違反的規則（摘要）

完整內容見 `CLAUDE.md`。

- **三態：** `y` 有、`n` 無、`u` 未知。**沒有資料就是 `u`**，數量 0 或空白也是 `u`，不能寫成 `n`。
- **每筆事實都要有來源：** `place_attributes`、`place_parking` 的每一列都要有 `source_id` 與 `verified_at`。
- **不可以用 Google。** 不能存 Google 的座標、評論、照片、評分，也不能用 Google 查名稱或位置。
  - **座標來源只能是：**
    - OpenStreetMap
    - 內政部 TGOS
    - 政府開放資料：授權要明確，例如政府資料開放授權條款（D21）
    - 實地確認
    - 使用者在本站 OSM 底圖上標示、審核員確認過的位置（D19）
  - **名稱依據只能是：**「OSM 地圖上可見的名稱」「實地確認」「政府公告」（D20、D23）。
- **不編造資料：** 找不到來源就留 `u`。測試資料只能放在 `tests/fixtures/`，id 用 `test-` 開頭。
- **權限在資料庫層：** 用 RLS 與 SECURITY DEFINER 函式。前端隱藏按鈕不算安全機制。
  - 修改建議只能透過 `review_suggestion()` 核准。
  - 會員命名只能透過 `vote_naming()`、`resolve_naming()`（D23）。
  - 不可以在前端或 app 使用 service role key。
  - 每個權限規則都要有測試，用不同身分的 JWT 直接打資料庫。
- **隱私：** 對外只顯示暱稱。Email 只有管理員看得到（D18）。不記錄精確定位。

---

## 3. 縣市一覽

| 代碼 | 縣市 | 網址 slug | 資料來源 | 匯入指令 |
|---|---|---|---|---|
| `hsc` | 新竹市 | `hsinchu-city` | 兒童遊戲場清冊＋網路資料（座標 OSM） | `build_seed.py` → `import_hccg.py` |
| `hsq` | 新竹縣 | `hsinchu-county` | OSM | `import_osm_city.py hsq` |
| `tyc` | 桃園市 | `taoyuan` | 桃園市公園＋OSM 補充 | `import_tycg.py` |
| `mlc` | 苗栗縣 | `miaoli` | OSM | `import_osm_city.py mlc` |
| `tpe` | 臺北市 | `taipei` | 公園處設施資料（D21） | `import_pkl.py` |
| `nwt` | 新北市 | `new-taipei` | OSM＋官方清單補地址 | `import_osm_city.py nwt` |
| `txg` | 臺中市 | `taichung` | OSM＋公園綠地清冊補地址、面積 | `import_osm_city.py txg` |
| `khh` | 高雄市 | `kaohsiung` | OSM | `import_osm_city.py khh` |
| `tnn` | 臺南市 | `tainan` | 公園設施資料＋OSM 補充 | `import_tnn.py` |
| `cyi` | 嘉義市 | `chiayi-city` | OSM | `import_osm_city.py cyi` |
| `chw` | 彰化縣 | `changhua` | OSM（名稱可疑：嚴格模式） | `import_osm_city.py chw` |
| `pif` | 屏東縣 | `pingtung` | OSM（名稱可疑：嚴格模式） | `import_osm_city.py pif` |
| `yun` | 雲林縣 | `yunlin` | OSM（名稱可疑：嚴格模式） | `import_osm_city.py yun` |
| `ila` | 宜蘭縣 | `yilan` | OSM（名稱可疑：嚴格模式） | `import_osm_city.py ila` |
| `cyq` | 嘉義縣 | `chiayi-county` | OSM（名稱可疑：嚴格模式） | `import_osm_city.py cyq` |
| `hua` | 花蓮縣 | `hualien` | OSM（名稱可疑：嚴格模式） | `import_osm_city.py hua` |
| `ttt` | 臺東縣 | `taitung` | OSM（名稱可疑：嚴格模式） | `import_osm_city.py ttt` |
| `kee` | 基隆市 | `keelung` | OSM（名稱可疑：嚴格模式） | `import_osm_city.py kee` |
| `pen` | 澎湖縣 | `penghu` | OSM（名稱可疑：嚴格模式） | `import_osm_city.py pen` |
| `kin` | 金門縣 | `kinmen` | OSM（名稱可疑：嚴格模式） | `import_osm_city.py kin` |
| `lie` | 連江縣 | `lienchiang` | OSM（名稱可疑：嚴格模式） | `import_osm_city.py lie` |
| `nan` | 南投縣 | `nantou` | OSM＋都市計畫區公園一覽表補地址、面積（名稱可疑：嚴格模式） | `fetch_ntc_parks.py` → `import_osm_city.py nan` |

- 匯入指令都在 `scripts/` 底下，用 `python3 scripts/<指令>` 執行。
- 上線狀態用 `pnpm city status` 查。**匯入不會上線。**

---

## 4. 新增一個縣市

### 4.1 先判斷資料來源

1. **找官方開放資料。** 要同時符合三個條件：
   - 授權明確，例如政府資料開放授權條款
   - 可以下載，例如 CSV、JSON
   - 有座標，或有能對到座標的資訊

   查詢來源：政府資料開放平臺（data.gov.tw）、縣市開放資料平台。
2. **以下不能用：** 只有網頁、標示「All rights reserved」、授權不明。例如高雄的特色公園名單、彰化的「樂遊彰化公園」、屏東的「寶貝放電護照」。部落格與新聞只能當查證線索。
3. **把查到的結果和建議給使用者決定。** 常見的三條路：
   - **官方資料為主＋OSM 補充：** 臺北、臺南、桃園。要寫轉接器 `scripts/sources/<來源>.py` 與匯入程式。
   - **只用 OSM（D20）：** 新竹縣、苗栗、高雄、嘉義市、彰化、屏東、雲林、宜蘭、嘉義縣、花蓮、臺東、基隆、澎湖、金門、連江。沿用 `import_osm_city.py`。
   - **OSM 為主＋官方公園清單補地址、面積：** 新北、臺中、南投。清單沒有遊具資料，不單獨上地圖；在 `scripts/sources/park_lists.py` 加 `CONFIGS`，再寫 `fetch_<來源>_parks.py`。

### 4.2 要改的地方（只用 OSM 的縣市）

- [ ] `supabase/migrations/00NN_city_<名稱>.sql`：`INSERT INTO cities (code, slug, name)`，`launched_at` 留空。
- [ ] `.github/workflows/data-ops.yml`：`city` 的 `options` 加上新代碼，正式環境才能匯入、上線（`tests/unit/data-ops.test.ts` 會檢查）。
- [ ] `src/lib/cities.ts`：`CITY_ORDER` 照由北到南、離島最後的位置加上新代碼，首頁縣市清單照這個順序（`tests/unit/cities.test.ts` 會檢查）。
- [ ] `scripts/fetch_osm_city.py`：`ISO` 加上 ISO 3166-2 代碼，例如彰化是 `TW-CHA`。
- [ ] `scripts/fetch_osm_institutions.py`、`scripts/fetch_osm_nearby.py`：加到 `CITIES`。
- [ ] `scripts/fetch_city_bounds.py`：加到 `CITIES`，執行後確認 `data/raw/osm-city-bounds.json` **只多了這個縣市**。
- [ ] `scripts/import_osm_city.py`：
  - 加到 `CITIES`。
  - 要擋名稱可疑的，加到 `HOLD_SUSPICIOUS`，見 5.3。
- [ ] `scripts/check_seed_hash.py`：加上這個縣市的輸出檔。有 `HOLD_SUSPICIOUS` 的要包含 `named-suspicious`。
- [ ] `scripts/tools/name/items.ts`：命名工具的 `CITIES`。
- [ ] `tests/db/rls.test.ts`：`city_bounds` 的縣市數與清單。
- [ ] `tests/db/seed.test.ts`：照其他 OSM 縣市的寫法，檢查未上線、座標來自 OSM、屬性全部 `u`。
- [ ] 文件：
  - `docs/tasks/P5-more-cities.md` 加一節：資料、指令、進度、待處理數量。
  - `CLAUDE.md` 的縣市列表。
  - `README.md` 的指令。

### 4.3 下載與匯入

依序執行，**不要同時查 Overpass**。公開主機每個 IP 只能同時跑約 2 個查詢，常回 504，要重試。

```bash
python3 scripts/fetch_osm_city.py <代碼>          # data/raw/<代碼>/osm.json
python3 scripts/fetch_osm_institutions.py <代碼>  # data/raw/<代碼>/osm-institutions.json
python3 scripts/import_osm_city.py <代碼>         # data/seed/<代碼>/、data/review/<代碼>/
python3 scripts/fetch_osm_nearby.py <代碼>        # 命名提示 data/raw/<代碼>/osm-nearby.json
npx supabase migration up && pnpm seed --city <代碼>
```

- 原始資料（`data/raw/`）、種子資料（`data/seed/`）、待處理清單（`data/review/`）都提交進 repo。
- 匯入不連網路，同樣的輸入一定產生同樣的輸出。

---

## 5. OSM 遊戲場的匯入規則（D20）

規則在 `scripts/sources/osm_playgrounds.py`。

### 5.1 名稱（不推測）

依序判斷：

1. 位在有名稱的公園裡 → 用公園名稱。同一個公園裡的遊戲場合併成一處，各遊戲區自己的名稱寫在說明裡。
2. 不在公園裡、但自己有名稱 → 用自己的名稱。
3. 都沒有 → 看 `data/raw/<代碼>/manual-names.tsv`。表裡也沒有的列在 `unnamed.csv`，**不上地圖**。
4. 命名表寫「（排除）」的不上地圖。

### 5.2 學校、機關內的自動排除

遊戲場位在下列範圍內，匯入時**自動排除**，而且優先於上面所有規則：

- 幼兒園、學校：`amenity=kindergarten|school`
- 政府機關：`office=government`、`amenity=townhall|police|fire_station`
- 研究機構：`office=research`
- 軍營：`landuse=military`

**大學、專科不算**，因為多數校園對外開放。

相關檔案：

- 判斷結果存在 `osm-institutions.json`，裡面記著 `osm.json` 的 sha256。`osm.json` 更新後要重抓，不然匯入會中止。
- 被排除的列在 `excluded-institution.csv`。
- OSM 沒畫出學校範圍的，在命名工具用「在學校或機關內」手動排除。

### 5.3 名稱可疑的先不上地圖

規則是 `osm_playgrounds.hold_suspicious`。

- **一般模式：** 遊戲場**自己的名稱**不像公共遊戲場，或本身是用地編號 → 擋下。
  - 「不像公共遊戲場」的意思是名稱裡沒有公園、遊戲、遊樂、兒童、親子、廣場、綠地等字，例如「碰碰車」「保齡球館」。
  - 用地編號例如「公兒37」。
- **嚴格模式：** 一般模式的規則之外，還會擋：
  - **所在公園的名稱可疑**，例如 OSM 把「糯米坊工坊」標成公園。
  - **OSM 標成室內的**（`indoor=yes`），多半是商業室內遊樂場。
- **哪些縣市開啟：**
  - 臺南：在 `import_tnn.py` 用一般模式。
  - 彰化、屏東、雲林、宜蘭、嘉義縣、南投、花蓮、臺東、基隆、澎湖、金門、連江：在 `import_osm_city.py` 的 `HOLD_SUSPICIOUS` 用嚴格模式。
  - 其他縣市沒有開，結果不受影響。
- 擋下的列在 `named-suspicious.csv`，用命名工具確認：是遊戲場就照名稱命名，不是就排除。
- 人工命名表有這一處的，照人工決定，不再擋。

### 5.4 官方資料＋OSM 補充時，判斷「已涵蓋」

用 `sources/tycg.py` 的 `split_osm`。

- **同一處：** 同一個 OSM 物件，或名稱相同且在 **500 公尺**內 → 不重複建立，列在 `osm-covered.csv`。
- **待判斷：** 離官方場地 **150 公尺**內、名稱不同 → 列在 `osm-near-official.csv`，等人判斷：
  - 填「（排除）」＝同一處
  - 填名稱＝不同處

### 5.5 屬性

OSM 遊戲場的以下欄位**全部是 `u`**，靠家長回報：

- 遊具、生活機能、停車
- 規模、停留時間、年齡、收費

---

## 6. 官方資料的對照規則

- **數量欄位**，例如臺北、臺南：
  - 數量 > 0 → `y`。
  - 0 或空白 → `u`。
  - 組合遊具（大型、中型、小型兒童遊具等）**只寫進說明**，不推測裡面有什麼。
- **停車：** 資料直接給格數時，例如臺南的汽車停車位 → 類型「停車場」加格數，收費 `u`。
- **用地編號名稱：**
  - 名稱本身是編號（「公一」「公(兒)3」「園(信義)16」）→ 不上地圖，列進 review 等命名。
  - 名稱後面帶編號括號（「南門公園(公8)」）→ 顯示時拿掉，原文保留在 `official_ref`（臺南 `sources/tnn.py`）。
- **用語對照：**
  - 「圓盤鞦韆」＝鳥巢鞦韆，同時也算盪鞦韆（D22）。
  - 意思不明的欄位先問使用者，例如臺南的搖搖椅、天梯雲梯、球場、照明。
- **座標：** TWD97 用 `scripts/lib/twd97.py` 轉成 WGS84。轉換後不在縣市範圍內的列進 review。

---

## 7. 命名

### 7.1 本機命名工具：`pnpm tool:name`

開啟 http://localhost:4101。

- **能處理的清單：**
  - `unnamed.csv`（沒有名稱）
  - `osm-near-official.csv`（離官方很近）
  - `named-suspicious.csv`（名稱可疑）
  - 臺北的 `odd-names.csv`（用地編號）
- **還不能處理：** 臺南的 `odd-names-official.csv`（官方用地編號名稱）。
- **依據只有三種：** OSM 地圖上可見的名稱、實地確認、政府公告。伺服器端也會檢查。
- **排除理由：** OSM 標錯／不是遊戲場、私人社區、在學校或機關內、與官方場地是同一處。排除不用填名稱。
- 結果寫進 `data/raw/<代碼>/manual-names.tsv`。之後重新匯入，見頁首的指令，再開 PR。

### 7.2 會員命名（D23）

網址是 `/<slug>/naming`，只在已上線的縣市出現。

- **自動通過：**
  - **達到門檻人數（預設 10 人，管理員在 `/admin/naming` 設定）的不同會員提出相同名稱**就自動通過，立刻上地圖。
  - 排除也一樣，達到門檻人數建議排除就排除。未達門檻的由審核員或管理員決定。
  - 比對名稱時全形半形、空白、大小寫都視為相同。
- **只顯示參與人數，不顯示別人提的名稱。**
- **審核員：** 可以在 `/admin/naming` 直接決定，不用滿 3 票。
- **寫回 repo：** 用 `pnpm naming:export` 寫回 `manual-names.tsv`，確認者只寫「會員 N 人一致」（N 是通過時一致的人數）或「審核員」，不寫暱稱。接著重新匯入、開 PR。

---

## 8. 測試與驗證

```bash
pnpm lint && pnpm typecheck && pnpm test           # 單元測試
pnpm test:db                                       # 資料庫權限與 seed（需要本機 Supabase）
pnpm test:e2e                                      # 端對端（動到 UI 必跑）
python -m unittest discover -s scripts/tests -t scripts
python3 scripts/check_seed_hash.py                 # 重新產生 seed，逐位元組比對
```

### 常見陷阱

- **跑 `test:db`、`test:e2e` 之前：**
  - 測試假設只有新竹市上線。先 `pnpm city unlaunch` 其他已上線的縣市，跑完再 `launch` 回來。
  - 刪掉 `.next`，因為建置快取會留著舊的上線狀態。
  - 關掉還在跑的 3100 port 伺服器。
- **新增資料庫函式或資料表後**，要執行 `pnpm typegen`，或 `npx supabase gen types ...`，重新產生 `src/types/database.ts`。CI 會檢查。
- **場地 0 處的縣市**（OSM 遊戲場全部沒有名稱，例如金門）：一樣可以加，`places.json` 的 `places` 是空的；`pnpm seed` 會用 OSM 行政界當範圍、匯入待命名清單。0 處場地不能上線，會員命名頁也要上線後才有，先用 `pnpm tool:name` 命名。
- **只改其他縣市時**，`check_seed_hash.py` 要「全部相同」，確認沒影響到別的縣市。
- **e2e 的時間差：**
  - 等資料載入完再操作，例如先等「基本資料」標題出現再捲動。
  - 需要特定角色的帳號，先建立好再登入。
- **Overpass 逾時（504）：** 放背景重試，間隔幾分鐘。
- **建置時讀資料庫：** `next build` 會產生所有已上線縣市的場地頁（上千頁）。
  - 伺服器端 Supabase client 的同時請求數由 `src/lib/supabase/limit.ts` 限制（預設 8，可用 `SUPABASE_MAX_CONCURRENCY` 調整）。
  - 不要拿掉，否則會塞爆本機 Kong 的 512 條連線，建置失敗（「讀取場地…失敗：An unexpected error occurred」）。
- **偶發錯誤，重試就好：** CI 偶爾被 Docker Hub 限流。
- **Windows 終端機中文亂碼：** Python 輸出時設 `PYTHONIOENCODING=utf-8`，或輸出到檔案再讀。

---

## 9. 前端慣例

- **介面文字：** 繁體中文、台灣用語，沿用原型用字，例如「包含資料未知」「還沒有資料」「回報修正」「查實際路線」。顏色與字體用原型 `:root` 的 tokens，支援深色模式。
- **篩選：**
  - 純函式放在 `src/lib/filter/`，必須通過 `tests/fixtures/filter-cases.json`。
  - 篩選狀態同步到網址。
- **地圖（D2）：**
  - 彩色是 OpenFreeMap `liberty`（預設），灰階是 `positron`。
  - 右下角的 `MapColorControl` 可以切換，選擇記在 localStorage 的 `pm.map`。
  - OSM 備援圖磚在灰階時用 CSS 濾鏡轉灰。
- **詳情面板（`PlacePanel`）：** 捲動時上方區塊固定在頂端。
  - 桌機固定整塊。
  - 手機只固定名稱與按鈕。
  - 打開「回報修正」表單時不固定。
  - 個別場地頁不固定。
- **首頁台灣地圖（`TaiwanMap`）：** 兩個以上縣市上線時，首頁顯示台灣地圖＋地圖下方的精簡清單。
  - 界線是內政部「直轄市、縣市界線」簡化成的靜態 SVG（`python3 scripts/build_taiwan_map.py` → `src/lib/taiwan-map.json`，22 個縣市都已畫好，新增縣市不用重跑）。
  - 用縣市名稱對應資料庫；已上線的可以點，未上線的灰色、不能點。
  - 金門、連江在左上角的小框，澎湖照實際位置。
- **localStorage：** 讀寫都要包 try/catch，私密瀏覽也要能用。

---

## 10. 在本機確認

```bash
supabase start                 # 或 npx supabase start；需要 Docker Desktop
pnpm seed                      # 匯入全部縣市
pnpm city launch <代碼>        # 只影響本機資料庫
pnpm docker:up                 # 用目前的程式建置並啟動網站 http://localhost:3000
```

- **網址：** `http://localhost:3000/<slug>`，slug 見第 3 節。命名頁是 `/<slug>/naming`。
- **登入：** 本機的登入信寄到 Mailpit：http://localhost:54324。
- **確認完：** 如果不想讓縣市留在上線狀態，執行 `pnpm city unlaunch <代碼>`。
- **正式環境的上線**由人在 GitHub Actions 操作，見 `docs/operations.md`。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
