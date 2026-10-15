-- 0015_city_tainan：新增臺南市（臺南市公園設施資料＋OSM 遊戲場補充，decisions D20、D21）
-- launched_at 留空：匯入不會上線，上線時間由人決定（pnpm city launch tnn）
INSERT INTO cities (code, slug, name) VALUES ('tnn', 'tainan', '臺南市');
