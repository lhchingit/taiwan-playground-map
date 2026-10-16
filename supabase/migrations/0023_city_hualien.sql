-- 0023_city_hualien：新增花蓮縣（OpenStreetMap 遊戲場起步，decisions D20；沒有可用的開放資料）
-- launched_at 留空：匯入不會上線，上線時間由人決定（pnpm city launch hua）
INSERT INTO cities (code, slug, name) VALUES ('hua', 'hualien', '花蓮縣');
