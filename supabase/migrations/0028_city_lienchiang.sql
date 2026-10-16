-- 0028_city_lienchiang：新增連江縣（OpenStreetMap 遊戲場起步，decisions D20；沒有可用的開放資料）
-- launched_at 留空：匯入不會上線，上線時間由人決定（pnpm city launch lie）
INSERT INTO cities (code, slug, name) VALUES ('lie', 'lienchiang', '連江縣');
