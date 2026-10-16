-- 0024_city_taitung：新增臺東縣（OpenStreetMap 遊戲場起步，decisions D20；沒有可用的開放資料）
-- launched_at 留空：匯入不會上線，上線時間由人決定（pnpm city launch ttt）
INSERT INTO cities (code, slug, name) VALUES ('ttt', 'taitung', '臺東縣');
