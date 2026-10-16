-- 0022_city_nantou：新增南投縣（OpenStreetMap 遊戲場起步＋都市計畫區公園一覽表補地址與面積，decisions D20）
-- launched_at 留空：匯入不會上線，上線時間由人決定（pnpm city launch nan）
INSERT INTO cities (code, slug, name) VALUES ('nan', 'nantou', '南投縣');
