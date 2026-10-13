-- 0013_city_kaohsiung：新增高雄市（OpenStreetMap 遊戲場起步，decisions D20；沒有找到可用的官方清單）
-- launched_at 留空：匯入不會上線，上線時間由人決定（pnpm city launch khh）
INSERT INTO cities (code, slug, name) VALUES ('khh', 'kaohsiung', '高雄市');
