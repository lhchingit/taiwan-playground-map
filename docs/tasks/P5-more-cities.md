# P5 拓展到更多縣市

**原則：** 跟 P4 相同，每個縣市一個 PR（或一組 PR），做完一個、上線一個。上線時間由人決定（`pnpm city launch`）。

新增縣市的步驟見 `docs/operations.md`「新增其他縣市」。

## 臺北市（tpe）

- **資料：** 臺北市公園設施資料－兒童遊戲場（公園路燈工程管理處，[136476](https://data.gov.tw/dataset/136476)），附 TWD97 座標（decisions D21）。
- **指令：** `python3 scripts/fetch_tpe_parks.py` → `python3 scripts/import_pkl.py`
- **進度（2026-10-13）：** 資料已準備好、**未上線**。
  - 原始 972 列，完全相同的重複列去掉後是 520 處遊戲區，分屬 416 個公園。
    - **上地圖 415 處**：同一個公園的遊戲區合併成一處。
    - **用地編號名稱 1 處**：「園(信義)16」，列在 `data/review/tpe/odd-names.csv`，人工命名後填 `data/raw/tpe/manual-names.tsv`。
  - 遊具：數量 > 0 的是 `y`，其他是 `u`。生活機能、停車、收費、開放時間都是未知。
- **之後可以考慮：**
  - 河濱公園遊戲區（[122018](https://data.gov.tw/dataset/122018)，水利工程處，29 座，有座標）。
  - OSM 補充公園處資料以外的遊戲場（比照桃園，decisions D20）。OSM 上臺北市有 365 處遊戲場。

## 新北市（nwt）

- **資料：** 以 OSM 遊戲場起步（decisions D20）。官方「新北市公園」（[124566](https://data.gov.tw/dataset/124566)）只用來補地址與管理單位；它沒有座標和遊具，所以不單獨上地圖。
- **指令：** `python3 scripts/fetch_osm_city.py nwt`、`python3 scripts/fetch_osm_institutions.py nwt`、`python3 scripts/fetch_ntpc_parks.py` → `python3 scripts/import_osm_city.py nwt`
- **進度（2026-10-13）：** 資料已準備好、**未上線**。
  - OSM 遊戲場 230 處（衛福部統計 464 處）：
    - **上地圖 102 處**：同一個公園裡的 47 處遊戲區合併進去。
    - **沒有名稱 81 處**：`data/review/nwt/unnamed.csv`，之後跟其他縣市一起人工命名。
  - **補上地址 48 處**：`official-matched.csv`，方便抽查。同一區有多個相符的：0。
  - 遊具全部是 `u`，靠家長回報補。
- **Overpass：** 新北市的遊戲場多、範圍大，查所在公園的 is_in 常逾時。`lib/overpass.py` 的 `within` 改成：一批逾時就拆成兩半再查。

## 臺中市（txg）

- **資料：** 以 OSM 遊戲場起步（decisions D20）。建設局「臺中市公園綠地清冊」（[88288](https://data.gov.tw/dataset/88288)）只用來補地址（設置地點）與面積。
  - 清冊沒有遊具；「兒童遊樂場用地」（219 筆）是都市計畫的用地分類，不代表現場有遊具，所以不單獨上地圖。
  - 清冊的座標不使用。
- **指令：** `python3 scripts/fetch_osm_city.py txg`、`python3 scripts/fetch_osm_institutions.py txg`、`python3 scripts/fetch_txg_parks.py` → `python3 scripts/import_osm_city.py txg`
- **進度（2026-10-13）：** 資料已準備好、**未上線**。
  - OSM 遊戲場 202 處（衛福部統計 689 處）：
    - **上地圖 118 處**：同一個公園裡的 39 處遊戲區合併進去。
    - **沒有名稱 45 處**：`data/review/txg/unnamed.csv`，之後一起人工命名。
  - **補上地址與面積 72 處**：`official-matched.csv`。同一區有多個相符的：0。
  - 遊具全部是 `u`。
- 官方清單補充的程式改成新北市、臺中市共用（`sources/park_lists.py`）。新北市的輸出不變。

## 高雄市（khh）

- **資料：** 只用 OSM 遊戲場起步（decisions D20）。
  - 沒有找到可用的官方開放資料。養工處網站的「特色公園共融遊戲場」名單是網頁內容、授權不明，也沒有座標，所以不使用。
- **指令：** `python3 scripts/fetch_osm_city.py khh`、`python3 scripts/fetch_osm_institutions.py khh` → `python3 scripts/import_osm_city.py khh`
- **進度（2026-10-13）：** 資料已準備好、**未上線**。
  - OSM 遊戲場 108 處（衛福部統計 432 處）：
    - **上地圖 58 處**：同一個公園裡的 16 處遊戲區合併進去。
    - **沒有名稱 34 處**：`data/review/khh/unnamed.csv`，之後一起人工命名。
  - 遊具全部是 `u`。資料少，上線時間由人決定。
- **範圍：** OSM 的高雄市行政區包含東沙島與太平島，所以 `osm-city-bounds.json` 的範圍很大。這個範圍只在縣市沒有場地時使用，高雄市有場地後改用場地座標計算，不受影響。

## 臺南市（tnn）

- **資料：** 臺南市公園設施資料（臺南市政府工務局，[53556](https://data.gov.tw/dataset/53556)，政府資料開放授權條款，decisions D21），附 WGS84 座標；再用 OSM 遊戲場補上官方沒有的（比照桃園，D20）。
  - 每列一個公園，約 200 個「數量」欄位。規則見 `scripts/sources/tnn.py`：
    - 數量 > 0 → `y`；0 或空白 → `u`，不寫 `n`。
    - 只有兒童遊具區的欄位 > 0 才算有遊戲場。
    - 大／中／小型兒童遊具（組合遊具）只寫進說明。
    - 公廁 → 廁所、高燈／矮燈 → 夜間照明、各種球場 → 球場。
    - 汽車停車位 → 停車場與格數。
  - 名稱裡的用地編號括號拿掉再顯示（「南門公園(公8)」→ 南門公園），原文保留在 `official_ref`。
  - OSM 補充裡名稱不像公共遊戲場的（碰碰車、保齡球館…）先不上地圖，列在 `named-suspicious.csv`，用命名工具確認。
- **指令：** `python3 scripts/fetch_tnn_parks.py`、`python3 scripts/fetch_osm_city.py tnn`、`python3 scripts/fetch_osm_institutions.py tnn` → `python3 scripts/import_tnn.py`
- **進度（2026-10-15）：** 資料已準備好、**未上線**。
  - 官方 426 個公園：
    - **上地圖 237 處**
    - 只有體健設施 169 處
    - 名稱是用地編號 19 處：`odd-names-official.csv`
    - 缺座標 1 處：`no-coords.csv`
  - OSM 遊戲場 150 處：
    - 學校／機關內 11 處
    - 官方已涵蓋 32 處
    - **補充 30 處**
    - 離官方場地很近、待判斷 14 處：`osm-near-official.csv`
    - 沒有名稱 20 處：`unnamed.csv`
    - 名稱可疑 14 處：`named-suspicious.csv`
  - **上地圖合計 267 處。**

## 嘉義市（cyi）

- **資料：** 只用 OSM 遊戲場起步（decisions D20）。
  - 政府資料開放平臺與嘉義市資料開放平臺都沒有找到可用的公園或遊戲場清單；網路上只有新聞與部落格。
  - 網址 slug 是 `chiayi-city`，嘉義縣之後用 `chiayi-county`。
- **指令：** `python3 scripts/fetch_osm_city.py cyi`、`python3 scripts/fetch_osm_institutions.py cyi` → `python3 scripts/import_osm_city.py cyi`
- **進度（2026-10-15）：** 資料已準備好、**未上線**。
  - OSM 遊戲場 16 處（新聞提到市內約 21 處兒童遊戲場）：
    - **上地圖 5 處**：文化公園、番仔溝公園、嘉義公園、中正公園、文昌公園；同一個公園裡的 2 處遊戲區合併進去。
    - 國小裡的 7 處自動排除。
    - **沒有名稱 2 處**：`data/review/cyi/unnamed.csv`。
  - 遊具全部是 `u`。資料少，上線時間由人決定。

## 彰化縣（chw）

- **資料：** 只用 OSM 遊戲場起步（decisions D20）。
  - 「樂遊彰化公園」是縣府城市暨觀光發展處網站的特色公園介紹（約 10 處）。沒有座標、沒有下載檔，而且標示「All rights reserved」，不使用。
  - 一般公園由各鄉鎮市公所管理，沒有全縣清單。
- **名稱可疑的先不上地圖**（`import_osm_city.py` 的 `HOLD_SUSPICIOUS`，嚴格模式，只對彰化縣）：
  - 遊戲場或所在公園的名稱不像公共遊戲場，例如槌球場、工坊。
  - OSM 標成室內的，多半是商業室內遊樂場。
  - 這些列在 `named-suspicious.csv`，用命名工具確認。
- **指令：** `python3 scripts/fetch_osm_city.py chw`、`python3 scripts/fetch_osm_institutions.py chw` → `python3 scripts/import_osm_city.py chw`
- **進度（2026-10-16）：** 資料已準備好、**未上線**。OSM 遊戲場 37 處：
  - **上地圖 10 處**（同一個公園的 3 處遊戲區合併進去）
  - 學校／機關內 10 處
  - **名稱可疑 6 處**：LZ遊樂園、百果山、坑厝五分車站、合興槌球場、體能探索教育場、糯米坊工坊
  - **沒有名稱 8 處**
  - 遊具全部是 `u`。

## 屏東縣（pif）

- **資料：** 只用 OSM 遊戲場起步（decisions D20）。
  - 「寶貝放電護照」是縣府的集章活動，沒有可下載的清單或座標。
  - 政府資料開放平臺沒有屏東縣的公園或遊戲場資料集。
- **名稱可疑的處理：** 跟彰化縣一樣用嚴格模式（`HOLD_SUSPICIOUS`），先不上地圖，列在 `named-suspicious.csv`。
- **指令：** `python3 scripts/fetch_osm_city.py pif`、`python3 scripts/fetch_osm_institutions.py pif` → `python3 scripts/import_osm_city.py pif`
- **進度（2026-10-16）：** 資料已準備好、**未上線**。OSM 遊戲場 24 處：
  - **上地圖 7 處**（同一個公園裡的 5 處遊戲區已合併）
  - 學校內 5 處
  - **名稱可疑 4 處**：里港鄉兒童室內遊戲室 ×2（OSM 標成室內）、炫風小型賽車場、潮好玩幸福村
  - **沒有名稱 3 處**
  - 遊具全部是 `u`。

## 雲林縣（yun）

- **資料：** 只用 OSM 遊戲場起步（decisions D20）。政府資料開放平臺沒有雲林縣的公園或遊戲場清冊。
- **名稱可疑：** 用嚴格模式（`HOLD_SUSPICIOUS`），這次沒有擋下任何一處。
- **指令：** `python3 scripts/fetch_osm_city.py yun`、`python3 scripts/fetch_osm_institutions.py yun` → `python3 scripts/import_osm_city.py yun`
- **進度（2026-10-16）：** 資料已準備好、**未上線**。
  - OSM 遊戲場 17 處：
    - **上地圖 5 處**
    - 國小裡 6 處
    - **沒有名稱 6 處**
  - 膨鼠森林公園、虎尾 632 高地公園等特色公園，OSM 上沒有標成遊戲場，所以沒有出現；之後可以補 OSM 或由會員回報新場地。
  - 遊具全部是 `u`。

## 宜蘭縣（ila）

- **資料：** 只用 OSM 遊戲場起步（decisions D20）。宜蘭縣政府開放資料平台與政府資料開放平臺都沒有公園或遊戲場清單。
- **名稱可疑：** 用嚴格模式（`HOLD_SUSPICIOUS`）擋下。
- **指令：** `python3 scripts/fetch_osm_city.py ila`、`python3 scripts/fetch_osm_institutions.py ila` → `python3 scripts/import_osm_city.py ila`
- **進度（2026-10-16）：** 資料已準備好、**未上線**。
  - OSM 遊戲場 27 處：
    - **上地圖 9 處**（同一個公園的 7 處遊戲區合併進去）
    - 國小裡 7 處
    - **名稱可疑 1 處**：龍潭湖風景區
    - **沒有名稱 3 處**
  - 頭城鎮一處 OSM 名稱只寫「遊樂場」，照規則上地圖，之後可以回報修正。
  - 遊具全部是 `u`。

## 完成標準（每個縣市）

- [ ] 該縣市的轉接器、設施對照與測試已合併。
- [ ] 所有場地座標來自 OSM、TGOS、政府開放資料或人工定位，`data/` 內沒有任何來自 Google 的座標或內容。
- [ ] review 清單都處理過或註記原因。
- [ ] `cities.launched_at` 已設定，該縣市首頁與場地頁可以公開瀏覽。
