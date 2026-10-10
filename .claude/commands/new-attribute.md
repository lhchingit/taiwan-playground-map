---
description: 新增一個場地屬性（遊樂設施或生活機能），一次改完資料、介面與測試
argument-hint: <key> <中文標籤> <play|amenity> [分組名稱]
---

新增屬性：$ARGUMENTS

照順序完成以下步驟，每一步做完都確認一次：

1. **檢查重複**：確認 `attribute_defs` 與 `data/seed/places.json` 裡沒有意思相同的 key，有的話停下來問我。
2. **key 命名**：英文 snake_case 名詞，例如 `baby_swing`、`skatepark`。
3. **新增 migration**：在 `attribute_defs` 插入一列（`key`、`label`、`category`、`group_name`、`sort_order`）。
   `category` 為 play 時一定要有 `group_name`，而且必須是現有分組之一；要新增分組先問我。
4. **更新 seed**：在 `scripts/build_seed.py` 的 `PLAY_GROUPS` 或 `AMENITY` 加上這個 key，重新產生 `places.json`。
   **所有場地的值都保持 `u`**，除非我提供了有來源的資料。不可以自己推測任何場地有或沒有。
5. **介面**：確認篩選面板與場地頁會自動出現這個項目（應該從 `attribute_defs` 讀取，不用寫死）；如果需要手動改，代表有東西寫死了，順便修正。
6. **測試**：在 `tests/fixtures/` 補一個案例，驗證選這個屬性時，因為全部都是未知，結果是 0 處，`unknownHint` 等於場地總數。
7. **驗證**：跑 `supabase db reset && pnpm seed && pnpm lint && pnpm typecheck && pnpm test`。
8. **回報**：列出改了哪些檔案、目前有幾個場地有這項資料。
