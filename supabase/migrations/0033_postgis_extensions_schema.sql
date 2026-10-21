-- 0033_postgis_extensions_schema：PostGIS 搬到 extensions schema（decisions D31）
-- 原因：0001 把 PostGIS 裝在 public，它自帶的 spatial_ref_sys 擁有者是 supabase_admin，
-- 不能開 RLS 也收不回權限，任何人都能透過 API 刪改（刪掉 SRID 4326，距離計算與新增場地會壞掉）。
-- extensions 不對 API 公開。PostGIS 不支援 ALTER EXTENSION … SET SCHEMA，只能移除再重裝：
-- CASCADE 會刪掉 geom 欄位、索引與用到它的 view，這裡先記下座標，重裝後重建並逐筆比對。
-- 之後的 migration 用到 PostGIS 時，SECURITY DEFINER 函式的 search_path 要寫 public, extensions。

CREATE TEMP TABLE _geom_before ON COMMIT DROP AS
  SELECT 'places' AS tbl, id, ST_AsEWKT(geom) AS ewkt,
         ST_X(geom::geometry) AS lng, ST_Y(geom::geometry) AS lat
  FROM places
  UNION ALL
  SELECT 'naming_candidates', id, ST_AsEWKT(geom), ST_X(geom::geometry), ST_Y(geom::geometry)
  FROM naming_candidates;

DROP EXTENSION postgis CASCADE;
CREATE EXTENSION postgis SCHEMA extensions;

ALTER TABLE places ADD COLUMN geom extensions.geography(Point, 4326);
ALTER TABLE naming_candidates ADD COLUMN geom extensions.geography(Point, 4326);

UPDATE places p
SET geom = extensions.ST_SetSRID(extensions.ST_MakePoint(b.lng, b.lat), 4326)::extensions.geography
FROM _geom_before b WHERE b.tbl = 'places' AND b.id = p.id;
UPDATE naming_candidates c
SET geom = extensions.ST_SetSRID(extensions.ST_MakePoint(b.lng, b.lat), 4326)::extensions.geography
FROM _geom_before b WHERE b.tbl = 'naming_candidates' AND b.id = c.id;

-- 座標要跟搬家前一模一樣，有任何不同就整個退回
DO $$
DECLARE
  bad int;
BEGIN
  SELECT count(*) INTO bad
  FROM _geom_before b
  FULL JOIN (
    SELECT 'places' AS tbl, id, extensions.ST_AsEWKT(geom) AS ewkt FROM places
    UNION ALL
    SELECT 'naming_candidates', id, extensions.ST_AsEWKT(geom) FROM naming_candidates
  ) a ON a.tbl = b.tbl AND a.id = b.id
  WHERE a.ewkt IS DISTINCT FROM b.ewkt;
  IF bad > 0 THEN
    RAISE EXCEPTION '搬移 PostGIS 後有 % 筆座標不同，取消', bad;
  END IF;
END $$;

ALTER TABLE places ALTER COLUMN geom SET NOT NULL;
ALTER TABLE naming_candidates ALTER COLUMN geom SET NOT NULL;
CREATE INDEX places_geom_idx ON places USING gist (geom);

-- 0002、0014 的 view，被 CASCADE 刪掉後照原本寫法重建
CREATE VIEW place_cards WITH (security_invoker = true) AS
SELECT p.id, p.name, p.city, p.district,
       extensions.ST_Y(p.geom::extensions.geometry) AS lat,
       extensions.ST_X(p.geom::extensions.geometry) AS lng,
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

CREATE VIEW naming_open WITH (security_invoker = true) AS
SELECT c.id, c.city, c.osm_ref, c.district,
       extensions.ST_Y(c.geom::extensions.geometry) AS lat,
       extensions.ST_X(c.geom::extensions.geometry) AS lng, c.nearby,
       naming_vote_count(c.id) AS votes
FROM naming_candidates c
WHERE c.status = 'open';

-- 只能讀（naming_open 原本靠 Supabase 預設權限拿到全部權限，一併收緊）
REVOKE ALL ON place_cards, naming_open FROM anon, authenticated;
GRANT SELECT ON place_cards, naming_open TO anon, authenticated;

-- 用到 PostGIS 的 SECURITY DEFINER 函式要找得到 extensions
ALTER FUNCTION review_suggestion(bigint, boolean, text, text, jsonb) SET search_path = public, extensions;
ALTER FUNCTION apply_naming(text, text, text, text, text, uuid, integer) SET search_path = public, extensions;
