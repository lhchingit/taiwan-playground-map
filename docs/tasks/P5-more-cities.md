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
- **指令：** `python3 scripts/fetch_osm_city.py nwt`、`python3 scripts/fetch_ntpc_parks.py` → `python3 scripts/import_osm_city.py nwt`
- **進度（2026-10-13）：** 資料已準備好、**未上線**。
  - OSM 遊戲場 230 處（衛福部統計 464 處）：
    - **上地圖 102 處**：同一個公園裡的 47 處遊戲區合併進去。
    - **沒有名稱 81 處**：`data/review/nwt/unnamed.csv`，之後跟其他縣市一起人工命名。
  - **補上地址 48 處**：`official-matched.csv`，方便抽查。同一區有多個相符的：0。
  - 遊具全部是 `u`，靠家長回報補。
- **Overpass：** 新北市的遊戲場多、範圍大，查所在公園的 is_in 常逾時。`lib/overpass.py` 的 `within` 改成：一批逾時就拆成兩半再查。

## 完成標準（每個縣市）

- [ ] 該縣市的轉接器、設施對照與測試已合併。
- [ ] 所有場地座標來自 OSM、TGOS、政府開放資料或人工定位，`data/` 內沒有任何來自 Google 的座標或內容。
- [ ] review 清單都處理過或註記原因。
- [ ] `cities.launched_at` 已設定，該縣市首頁與場地頁可以公開瀏覽。
