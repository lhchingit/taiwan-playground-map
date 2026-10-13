-- 0010_city_taipei：新增臺北市（資料來源：臺北市公園設施資料，decisions D21）
-- launched_at 留空：匯入不會上線，上線時間由人決定（pnpm city launch tpe）
INSERT INTO cities (code, slug, name) VALUES ('tpe', 'taipei', '臺北市');
