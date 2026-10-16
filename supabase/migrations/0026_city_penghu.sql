-- 0026_city_penghu：新增澎湖縣（OpenStreetMap 遊戲場起步，decisions D20；沒有可用的開放資料）
-- launched_at 留空：匯入不會上線，上線時間由人決定（pnpm city launch pen）
INSERT INTO cities (code, slug, name) VALUES ('pen', 'penghu', '澎湖縣');
