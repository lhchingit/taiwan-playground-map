-- 0016_city_chiayi：新增嘉義市（OpenStreetMap 遊戲場起步，decisions D20；沒有找到可用的官方清單）
-- slug 是 chiayi-city（嘉義縣之後用 chiayi-county）；launched_at 留空，上線時間由人決定（pnpm city launch cyi）
INSERT INTO cities (code, slug, name) VALUES ('cyi', 'chiayi-city', '嘉義市');
