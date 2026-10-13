-- 0011_city_new_taipei：新增新北市（OpenStreetMap 遊戲場起步，官方「新北市公園」清單只補地址，decisions D20）
-- launched_at 留空：匯入不會上線，上線時間由人決定（pnpm city launch nwt）
INSERT INTO cities (code, slug, name) VALUES ('nwt', 'new-taipei', '新北市');
