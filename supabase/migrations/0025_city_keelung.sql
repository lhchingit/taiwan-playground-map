-- 0025_city_keelung：新增基隆市（OpenStreetMap 遊戲場起步，decisions D20；沒有可用的開放資料）
-- launched_at 留空：匯入不會上線，上線時間由人決定（pnpm city launch kee）
INSERT INTO cities (code, slug, name) VALUES ('kee', 'keelung', '基隆市');
