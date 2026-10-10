-- 0002_public_views：首頁用的公開 view（P1）

-- 縣市範圍：前端依出發點判斷要載入哪些縣市（decisions D4）。
-- 刻意以擁有者權限執行（不套用 cities 的 RLS），讓尚未上線的縣市範圍也看得到；
-- 只公開這幾個欄位，未上線縣市的場地仍由 places 的 RLS 擋住。
CREATE VIEW city_bounds AS
SELECT code, slug, name, bbox, launched_at IS NOT NULL AS launched
FROM cities;

-- 首頁清單與地圖需要的欄位。security_invoker：沿用 places、place_parking 的 RLS（未上線縣市讀不到）。
-- attrs 只有 y / n，沒有的 key 代表未知；停車有多列時取已知的那列，沒有資料時為 type u。
CREATE VIEW place_cards WITH (security_invoker = true) AS
SELECT p.id, p.name, p.city, p.district,
       ST_Y(p.geom::geometry) AS lat, ST_X(p.geom::geometry) AS lng,
       p.age_min, p.age_max, p.stay_bucket AS stay, p.size_class AS size,
       p.indoor, p.fee, p.status, p.attrs,
       COALESCE(pk.parking, '{"type": "u", "fee": "u", "spaces": null}'::jsonb) AS parking
FROM places p
LEFT JOIN LATERAL (
  SELECT jsonb_build_object('type', pp.type, 'fee', pp.fee, 'spaces', pp.spaces) AS parking
  FROM place_parking pp
  WHERE pp.place_id = p.id
  ORDER BY (pp.type = 'u'), pp.id
  LIMIT 1
) pk ON true;

-- 只能讀。city_bounds 是單一資料表的簡單 view，Postgres 預設可以透過它寫入，
-- 而且以擁有者權限執行、不受 RLS 限制，所以一定要先收回 Supabase 預設給的全部權限。
REVOKE ALL ON city_bounds, place_cards FROM anon, authenticated;
GRANT SELECT ON city_bounds, place_cards TO anon, authenticated;
