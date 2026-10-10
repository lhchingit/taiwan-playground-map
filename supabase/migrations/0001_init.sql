-- 0001_init：全台放電地圖初版 schema（對應 data/seed/places.json）
CREATE EXTENSION IF NOT EXISTS postgis;

-- 縣市（decisions D12）。launched_at 為 NULL 的縣市不出現在公開頁面
CREATE TABLE cities (
  code         text PRIMARY KEY CHECK (code ~ '^[a-z]{3}$'),  -- hsc 新竹市、hsq 新竹縣、tyc 桃園市、mlc 苗栗縣
  slug         text NOT NULL UNIQUE,                         -- 網址用：hsinchu-city
  name         text NOT NULL,
  bbox         numeric[] CHECK (bbox IS NULL OR array_length(bbox, 1) = 4),  -- [西, 南, 東, 北]，由 seed 依 OSM 行政界計算
  launched_at  timestamptz
);
INSERT INTO cities (code, slug, name) VALUES
  ('hsc', 'hsinchu-city',   '新竹市'),
  ('hsq', 'hsinchu-county', '新竹縣'),
  ('tyc', 'taoyuan',        '桃園市'),
  ('mlc', 'miaoli',         '苗栗縣');

CREATE TABLE places (
  id            text PRIMARY KEY,                 -- 例：hsc-luguang-park
  name          text NOT NULL,
  city          text NOT NULL REFERENCES cities(code),
  district      text,
  address       text,
  geom          geography(Point, 4326) NOT NULL,
  size_class    char(1) CHECK (size_class IN ('S','M','L')),
  area_ha       numeric(6,2),
  age_min       smallint, age_max smallint,
  stay_bucket   text CHECK (stay_bucket IN ('lt30','30_60','60_120','half')),
  stay_source   text,                             -- est / user_median ...
  fee           text CHECK (fee IN ('free','paid')),
  indoor        boolean NOT NULL DEFAULT false,
  hours         text,
  surface       text,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','seasonal','maintenance','closed')),
  summary       text,
  attrs         jsonb NOT NULL DEFAULT '{}'::jsonb, -- 查詢用彙整，由 place_attributes 同步，勿直接寫入（decisions D5）
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX places_geom_idx ON places USING gist (geom);
CREATE INDEX places_attrs_idx ON places USING gin (attrs);

-- 屬性字典：新增篩選條件只要加一列
CREATE TABLE attribute_defs (
  key        text PRIMARY KEY,                    -- slide, footwash ...
  label      text NOT NULL,
  category   text NOT NULL CHECK (category IN ('play','amenity')),
  group_name text,                                -- 遊樂設施分組：滑行擺盪、攀爬平衡、玩沙玩水…
  sort_order smallint NOT NULL DEFAULT 0
);

CREATE TABLE sources (
  id     text PRIMARY KEY,
  label  text NOT NULL,
  url    text,
  kind   text NOT NULL CHECK (kind IN ('open_data','article','news','lead','estimate','user','survey'))
);

-- 三態屬性值，含來源與確認時間；沒有列 = 未知
CREATE TABLE place_attributes (
  place_id     text REFERENCES places(id) ON DELETE CASCADE,
  key          text REFERENCES attribute_defs(key),
  value        char(1) NOT NULL CHECK (value IN ('y','n','u')),
  note         text,
  source_id    text REFERENCES sources(id),
  verified_at  date,
  PRIMARY KEY (place_id, key)
);
CREATE INDEX place_attr_key_val_idx ON place_attributes (key, value);

-- 停車：一個場地可有多處（例如正門停車場＋周邊路邊格）
CREATE TABLE place_parking (
  id           bigserial PRIMARY KEY,
  place_id     text REFERENCES places(id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN ('lot','street','none','u')),
  fee          text NOT NULL DEFAULT 'u' CHECK (fee IN ('free','paid','u')),
  fee_note     text,                               -- 例：每小時 30 元
  spaces       integer CHECK (spaces >= 0),        -- NULL = 未知
  distance_m   integer,                            -- 距場地入口步行距離
  note         text,
  source_id    text REFERENCES sources(id),
  verified_at  date
);
CREATE INDEX place_parking_place_idx ON place_parking (place_id);

-- 使用者修正建議 → 審核 → 合併
CREATE TABLE edit_suggestions (
  id           bigserial PRIMARY KEY,
  place_id     text REFERENCES places(id) ON DELETE CASCADE,
  key          text REFERENCES attribute_defs(key),  -- NULL 表示改基本欄位
  field        text,                                  -- 改基本欄位時的欄位名
  proposed     text NOT NULL,
  note         text,
  user_id      uuid,                                  -- Supabase auth.users
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  reviewed_by  uuid, reviewed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 範例查詢：3 公里內、有沙坑且有廁所（包含未知時把條件改成 value IN ('y','u') OR 無列）
-- SELECT p.id, p.name, ST_Distance(p.geom, ST_MakePoint(120.9716,24.8016)::geography) AS m
-- FROM places p
-- WHERE ST_DWithin(p.geom, ST_MakePoint(120.9716,24.8016)::geography, 3000)
--   AND EXISTS (SELECT 1 FROM place_attributes a WHERE a.place_id=p.id AND a.key='sandpit' AND a.value='y')
--   AND EXISTS (SELECT 1 FROM place_attributes a WHERE a.place_id=p.id AND a.key='toilet'  AND a.value='y')
-- ORDER BY m;

-- 同步 places.attrs（只放 y / n；沒有的 key 代表未知）
CREATE OR REPLACE FUNCTION sync_place_attrs() RETURNS trigger AS $$
DECLARE pid text := COALESCE(NEW.place_id, OLD.place_id);
BEGIN
  UPDATE places SET attrs = COALESCE((
      SELECT jsonb_object_agg(key, value) FROM place_attributes
      WHERE place_id = pid AND value IN ('y','n')), '{}'::jsonb),
    updated_at = now()
  WHERE id = pid;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER place_attributes_sync
AFTER INSERT OR UPDATE OR DELETE ON place_attributes
FOR EACH ROW EXECUTE FUNCTION sync_place_attrs();

-- RLS：公開唯讀，寫入只能透過 service role
ALTER TABLE cities            ENABLE ROW LEVEL SECURITY;
ALTER TABLE places            ENABLE ROW LEVEL SECURITY;
ALTER TABLE attribute_defs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources           ENABLE ROW LEVEL SECURITY;
ALTER TABLE place_attributes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE place_parking     ENABLE ROW LEVEL SECURITY;
ALTER TABLE edit_suggestions  ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_read ON cities           FOR SELECT USING (launched_at IS NOT NULL);
CREATE POLICY public_read ON places           FOR SELECT USING (
  EXISTS (SELECT 1 FROM cities c WHERE c.code = places.city AND c.launched_at IS NOT NULL));
CREATE POLICY public_read ON attribute_defs   FOR SELECT USING (true);
CREATE POLICY public_read ON sources          FOR SELECT USING (true);
-- 屬性與停車跟著場地：所屬場地的縣市尚未上線時也讀不到
CREATE POLICY public_read ON place_attributes FOR SELECT USING (
  EXISTS (SELECT 1 FROM places p JOIN cities c ON c.code = p.city
          WHERE p.id = place_attributes.place_id AND c.launched_at IS NOT NULL));
CREATE POLICY public_read ON place_parking    FOR SELECT USING (
  EXISTS (SELECT 1 FROM places p JOIN cities c ON c.code = p.city
          WHERE p.id = place_parking.place_id AND c.launched_at IS NOT NULL));
-- edit_suggestions 的權限在 P3 設定
