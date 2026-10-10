-- 0003_place_coord_source：座標來源說明（P1）
-- 例：「OpenStreetMap w448662016（清冊編號 94）」。座標只能來自 OpenStreetMap、內政部 TGOS 或實地測量，
-- 不可以是 Google（CLAUDE.md 授權規則；seed 匯入前會檢查）。場地頁照原型顯示。
ALTER TABLE places ADD COLUMN coord_source text;
