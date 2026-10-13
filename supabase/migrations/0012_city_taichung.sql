-- 0012_city_taichung：新增臺中市（OpenStreetMap 遊戲場起步，公園綠地清冊只補地址與面積，decisions D20）
-- launched_at 留空：匯入不會上線，上線時間由人決定（pnpm city launch txg）
INSERT INTO cities (code, slug, name) VALUES ('txg', 'taichung', '臺中市');
