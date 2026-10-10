# P0 專案骨架與資料匯入

**目標：** 建立可以開發的空專案，本機資料庫裡有 10 筆新竹市種子資料，CI 綠燈。
這個階段**不做任何介面**。

## 範圍

1. **初始化專案**
   - Next.js（App Router）+ TypeScript strict + pnpm + ESLint + Prettier。
   - `package.json` 要有這些 scripts：`dev`、`build`、`lint`、`typecheck`、`test`、`test:e2e`、`seed`。
   - Vitest 與 Playwright 裝好，各放一個能通過的範例測試。
2. **本機 Supabase**
   - `supabase init`，把 `supabase/migrations/0001_init.sql` 放進 migrations。
   - `supabase db reset` 要能從零建出所有資料表、索引和 trigger。
3. **型別**
   - 用 `supabase gen types typescript` 產生資料庫型別，放在 `src/types/database.ts`。
   - 手寫領域型別放在 `src/types/place.ts`：`Tri = 'y' | 'n' | 'u'`、`Place`、`Parking`、`AttributeDef`。注意 `age_min`、`age_max`、`address`、`hours` 可以是 null（代表未知）。
     欄位要能對應到 `data/seed/places.json` 的結構。
4. **匯入腳本 `pnpm seed`**（`scripts/seed.ts`）
   - 讀取 `data/seed/places.json`，依序寫入 `sources` → `attribute_defs` → `places` → `place_attributes` → `place_parking`。
   - 值為 `u` 且沒有來源的屬性**不寫入** `place_attributes`（沒有資料列就代表未知）。
   - `attribute_defs` 依照 json 的 `labels.play_groups` 與 `labels.amenity` 產生，保留分組與順序。
   - 寫完後更新 `places.attrs`（查詢用的 JSONB，見 decisions D5）。
   - 可以重複執行（upsert），不會產生重複資料。
   - 結束時印出摘要：各表筆數、每個場地已知屬性數。
5. **CI（GitHub Actions）**
   - 每個 PR 都跑 `lint`、`typecheck`、`test`。
   - e2e 先不跑，P1 再加。
6. **多縣市預備（decisions D12）**
   - `cities` 表已在 0001 migration；seed 把新竹市（`hsc`）的 `launched_at` 設為現在，其他縣市保持 NULL。
   - seed 依 OpenStreetMap 新竹市行政界算出 `cities.bbox`（或用該縣市所有場地座標外擴 1 公里，二選一，在 PR 說明採用哪一種）。
   - 場地的 `city` 欄位一律存縣市代碼（`hsc`），不要存中文名稱。
   - 把 `scripts/import_hccg.py` 重構成第一個資料來源轉接器 `scripts/sources/hccg.py`，比對、合併、review 清單抽成共用模組 `scripts/lib/`。
     重構後重新產生的 `places.json` 必須和重構前**完全相同**（用雜湊值比對），這是重構的驗收方式。
7. **RLS 初版**
   - 所有表都開 RLS。
   - 匿名使用者可以讀 `places`、`place_attributes`、`place_parking`、`attribute_defs`、`sources`。
   - 沒有任何寫入權限（寫入只能透過 service role 的匯入腳本）。

## 不在範圍

介面、地圖、登入、使用者回報、補資料（P2 處理）。

## 完成標準

- [ ] `supabase db reset && pnpm seed` 跑完：`places` 72 筆、`attribute_defs` 38 筆（28 項遊樂設施＋10 項生活機能）、`place_parking` 72 筆（未知的停車資料也要有一列 type = 'u'），`sources` 8 筆。
- [ ] 再跑一次 `pnpm seed`，筆數不變。
- [ ] `select attrs->>'sandpit' from places where id='hsc-hsinchu-park'` 回傳 `y`；`attrs->>'skatepark'` 回傳 `u` 或 null（兩種都要明確當成未知處理）。
- [ ] 用匿名 key 寫入任一資料表會失敗，要有一個測試驗證這件事。
- [ ] 把新竹縣的 `launched_at` 暫時設成現在、再設回 NULL：設回 NULL 時匿名使用者讀不到該縣市的場地（要有測試）。
- [ ] 匯入腳本重構前後產生的 `places.json` 雜湊值相同。
- [ ] CI 在 PR 上是綠燈。
- [ ] README 寫明從 clone 到跑起來的步驟。

## 給 Claude Code 的提示

先用 plan mode 提出計畫：列出要建立的檔案、seed 腳本的處理順序，以及 `places.attrs` 要用 trigger 還是由腳本同步、各自的取捨。確認後再開始寫程式。
