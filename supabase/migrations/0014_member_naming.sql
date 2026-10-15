-- 會員一起命名沒有名稱的 OSM 遊戲場（decisions D23）。
-- 待命名的點（naming_candidates）由 pnpm seed 從 data/review/<縣市>/unnamed.csv 匯入，不放進 places，
-- 所以不會出現在地圖、sitemap、API。會員投票（naming_votes）只能透過 vote_naming()；
-- 3 位以上不同會員提出相同名稱（或都建議排除）就自動通過，通過時立刻建立場地（id 跟匯入時相同）。
-- 審核員可以用 resolve_naming() 直接決定。結果用 pnpm naming:export 寫回 manual-names.tsv。

-- ---------- 待命名的點 ----------
CREATE TABLE naming_candidates (
  id             text PRIMARY KEY,               -- 未來的場地 id：<city>-osm-<ref>
  city           text NOT NULL REFERENCES cities(code),
  osm_ref        text NOT NULL CHECK (osm_ref ~ '^[nwr][0-9]+$'),
  district       text,
  geom           geography(Point, 4326) NOT NULL,
  nearby         jsonb NOT NULL DEFAULT '[]',    -- 附近有名稱的 OSM 地點（只是提示）
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'named', 'excluded')),
  resolved_name  text,
  resolved_basis text,
  resolved_by    text CHECK (resolved_by IN ('votes', 'moderator', 'import')),
  resolved_user  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'open') = (resolved_at IS NULL))
);
CREATE INDEX naming_candidates_city_idx ON naming_candidates (city, status);

-- ---------- 投票（一人一票，可以改票） ----------
CREATE TABLE naming_votes (
  id           bigserial PRIMARY KEY,
  candidate_id text NOT NULL REFERENCES naming_candidates(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action       text NOT NULL CHECK (action IN ('name', 'exclude')),
  name         text,                              -- 原始輸入（排除時為 NULL）
  name_key     text,                              -- 比對用：NFKC、去空白、小寫
  basis        text NOT NULL,                     -- 命名依據，或排除理由
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, user_id),
  CHECK ((action = 'name') = (name IS NOT NULL AND name_key IS NOT NULL))
);
CREATE INDEX naming_votes_user_idx ON naming_votes (user_id, updated_at);

-- 投票建立的場地：seed 不當成孤兒、--prune 不刪
ALTER TABLE places ADD COLUMN created_from_naming boolean NOT NULL DEFAULT false;

-- ---------- 權限：公開只看得到已上線縣市、還沒決定的點；票只有自己與審核員看得到；不能直接寫入 ----------
-- 兩張表的規則互相參照會無限遞迴，用 SECURITY DEFINER 的小函式查另一張表
CREATE OR REPLACE FUNCTION naming_candidate_city(p_candidate text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT city FROM naming_candidates WHERE id = p_candidate
$$;
CREATE OR REPLACE FUNCTION naming_voted(p_candidate text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM naming_votes WHERE candidate_id = p_candidate AND user_id = auth.uid())
$$;
ALTER TABLE naming_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE naming_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_read ON naming_candidates FOR SELECT TO anon, authenticated
  USING (status = 'open' AND city IN (SELECT code FROM cities WHERE launched_at IS NOT NULL));
CREATE POLICY mod_read ON naming_candidates FOR SELECT TO authenticated
  USING (can_moderate(city));
-- 投過票的人看得到結果（「我的貢獻」）
CREATE POLICY voter_read ON naming_candidates FOR SELECT TO authenticated
  USING (naming_voted(id));
CREATE POLICY own_read ON naming_votes FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY mod_read ON naming_votes FOR SELECT TO authenticated
  USING (can_moderate(naming_candidate_city(candidate_id)));
REVOKE INSERT, UPDATE, DELETE ON naming_candidates, naming_votes FROM anon, authenticated;

-- ---------- 規則（跟 scripts/tools/name/names-file.ts、src/lib/naming.ts 一致） ----------
CREATE OR REPLACE FUNCTION naming_key(p_name text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(regexp_replace(normalize(btrim(p_name), NFKC), '\s+', '', 'g'))
$$;

CREATE OR REPLACE FUNCTION check_naming(p_action text, p_name text, p_basis text) RETURNS void
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_action = 'name' THEN
    IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION '請填名稱'; END IF;
    IF char_length(btrim(p_name)) > 40 THEN RAISE EXCEPTION '名稱最多 40 字'; END IF;
    IF p_name ~* '(https?:|www\.|\.com|google)' THEN RAISE EXCEPTION '名稱不能是網址'; END IF;
    IF p_basis IS NULL OR p_basis NOT IN ('OSM 地圖上可見的名稱', '實地確認', '政府公告') THEN
      RAISE EXCEPTION '命名依據要是：OSM 地圖上可見的名稱、實地確認、政府公告（不可以用 Google 地圖查名稱）';
    END IF;
  ELSIF p_action = 'exclude' THEN
    IF p_basis IS NULL OR p_basis NOT IN ('OSM 標錯／不是遊戲場', '私人社區', '在學校或機關內') THEN
      RAISE EXCEPTION '排除的理由要是：OSM 標錯／不是遊戲場、私人社區、在學校或機關內';
    END IF;
  ELSE
    RAISE EXCEPTION '不認得的動作';
  END IF;
END $$;

-- 參與人數（view 用；SECURITY DEFINER 才能數到別人的票，只回傳數字）
CREATE OR REPLACE FUNCTION naming_vote_count(p_candidate text) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM naming_votes WHERE candidate_id = p_candidate
$$;

-- 公開的參與人數（不透露各人提的名稱）
CREATE VIEW naming_open WITH (security_invoker = true) AS
SELECT c.id, c.city, c.osm_ref, c.district,
       ST_Y(c.geom::geometry) AS lat, ST_X(c.geom::geometry) AS lng, c.nearby,
       naming_vote_count(c.id) AS votes
FROM naming_candidates c
WHERE c.status = 'open';

-- ---------- 套用結果（內部使用，不開放直接呼叫） ----------
CREATE OR REPLACE FUNCTION apply_naming(p_candidate text, p_action text, p_name text, p_basis text,
                                        p_by text, p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c naming_candidates;
  final_name text;
BEGIN
  SELECT * INTO c FROM naming_candidates WHERE id = p_candidate FOR UPDATE;
  IF NOT FOUND OR c.status <> 'open' THEN RAISE EXCEPTION '這一處已經處理過了'; END IF;
  IF p_action = 'name' THEN
    IF EXISTS (SELECT 1 FROM places WHERE id = c.id) THEN RAISE EXCEPTION '這一處已經有名稱了'; END IF;
    final_name := btrim(regexp_replace(p_name, '\s+', ' ', 'g'));
    -- 同一個縣市已經有同名場地：加上行政區（跟匯入的規則一樣）
    IF EXISTS (SELECT 1 FROM places WHERE city = c.city AND name = final_name) THEN
      final_name := final_name || '（' || COALESCE(c.district, '行政區未知') || '）';
    END IF;
    INSERT INTO places (id, name, city, district, geom, status, summary, coord_source, created_from_naming)
    VALUES (c.id, final_name, c.city, c.district, c.geom, 'open',
            'OpenStreetMap 標示的遊戲場。遊具與設施還沒有資料，歡迎回報。',
            'OpenStreetMap ' || c.osm_ref || '（leisure=playground）', true);
    -- 停車：一列類型未知（每個場地剛好一列，跟匯入的場地一樣）
    INSERT INTO place_parking (place_id, type, fee) VALUES (c.id, 'u', 'u');
    INSERT INTO place_field_history (place_id, field, old_value, new_value, new_source, note, changed_by)
    VALUES (c.id, 'status', NULL, 'open', 'user',
            CASE p_by WHEN 'votes' THEN '會員命名（3 人一致）' ELSE '審核員命名' END || '：' || final_name, p_user);
  ELSE
    final_name := NULL;
  END IF;
  UPDATE naming_candidates
     SET status = CASE p_action WHEN 'name' THEN 'named' ELSE 'excluded' END,
         resolved_name = final_name, resolved_basis = p_basis, resolved_by = p_by,
         resolved_user = p_user, resolved_at = now()
   WHERE id = c.id;
END $$;

-- ---------- 會員投票 ----------
-- 回傳 'voted'（已記錄）、'named'（剛好湊滿 3 人，已上地圖）、'excluded'
CREATE OR REPLACE FUNCTION vote_naming(p_candidate text, p_action text, p_name text, p_basis text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c naming_candidates;
  k text;
  top record;
  n_exclude int;
BEGIN
  IF auth.uid() IS NULL OR app_role() IS NULL THEN RAISE EXCEPTION '請先登入（或帳號已停權）'; END IF;
  IF NOT has_accepted_terms() THEN RAISE EXCEPTION '請先同意服務條款'; END IF;
  SELECT * INTO c FROM naming_candidates WHERE id = p_candidate FOR UPDATE;
  IF NOT FOUND OR NOT city_launched(c.city) THEN RAISE EXCEPTION '找不到這一處'; END IF;
  IF c.status <> 'open' THEN RAISE EXCEPTION '這一處已經處理過了'; END IF;
  PERFORM check_naming(p_action, p_name, p_basis);

  -- 每天上限（改票也算一次）
  PERFORM pg_advisory_xact_lock(hashtextextended('naming_votes:' || auth.uid()::text, 0));
  IF (SELECT count(*) FROM naming_votes
      WHERE user_id = auth.uid() AND updated_at > now() - interval '24 hours') >= 100 THEN
    RAISE EXCEPTION '今天的命名次數已達上限，明天再試';
  END IF;

  k := CASE WHEN p_action = 'name' THEN naming_key(p_name) END;
  INSERT INTO naming_votes (candidate_id, user_id, action, name, name_key, basis)
  VALUES (c.id, auth.uid(), p_action, CASE WHEN p_action = 'name' THEN btrim(p_name) END, k, p_basis)
  ON CONFLICT (candidate_id, user_id) DO UPDATE
    SET action = EXCLUDED.action, name = EXCLUDED.name, name_key = EXCLUDED.name_key,
        basis = EXCLUDED.basis, updated_at = now();

  IF p_action = 'name' THEN
    IF (SELECT count(DISTINCT user_id) FROM naming_votes
        WHERE candidate_id = c.id AND action = 'name' AND name_key = k) >= 3 THEN
      -- 名稱用最多人寫的原始寫法（一樣多時用最早的）；依據用最多的
      SELECT name INTO top FROM naming_votes WHERE candidate_id = c.id AND name_key = k
       GROUP BY name ORDER BY count(*) DESC, min(created_at) LIMIT 1;
      PERFORM apply_naming(c.id, 'name', top.name,
        (SELECT basis FROM naming_votes WHERE candidate_id = c.id AND name_key = k
          GROUP BY basis ORDER BY count(*) DESC, min(created_at) LIMIT 1),
        'votes', NULL);
      UPDATE profiles SET accepted_count = accepted_count + 1
       WHERE id IN (SELECT user_id FROM naming_votes WHERE candidate_id = c.id AND name_key = k);
      RETURN 'named';
    END IF;
  ELSE
    SELECT count(DISTINCT user_id) INTO n_exclude FROM naming_votes
     WHERE candidate_id = c.id AND action = 'exclude';
    IF n_exclude >= 3 THEN
      PERFORM apply_naming(c.id, 'exclude', NULL,
        (SELECT basis FROM naming_votes WHERE candidate_id = c.id AND action = 'exclude'
          GROUP BY basis ORDER BY count(*) DESC, min(created_at) LIMIT 1),
        'votes', NULL);
      UPDATE profiles SET accepted_count = accepted_count + 1
       WHERE id IN (SELECT user_id FROM naming_votes WHERE candidate_id = c.id AND action = 'exclude');
      RETURN 'excluded';
    END IF;
  END IF;
  RETURN 'voted';
END $$;

-- ---------- 審核員直接決定（不用滿 3 票） ----------
CREATE OR REPLACE FUNCTION resolve_naming(p_candidate text, p_action text, p_name text, p_basis text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c naming_candidates;
BEGIN
  SELECT * INTO c FROM naming_candidates WHERE id = p_candidate;
  IF NOT FOUND OR NOT can_moderate(c.city) THEN RAISE EXCEPTION '沒有審核權限'; END IF;
  PERFORM check_naming(p_action, p_name, p_basis);
  PERFORM apply_naming(c.id, p_action, p_name, p_basis, 'moderator', auth.uid());
END $$;

REVOKE EXECUTE ON FUNCTION apply_naming(text, text, text, text, text, uuid), naming_vote_count(text),
  vote_naming(text, text, text, text), resolve_naming(text, text, text, text) FROM PUBLIC, anon;
-- 套用結果只能經過 vote_naming()／resolve_naming()（Supabase 預設會把函式權限給 authenticated）
REVOKE EXECUTE ON FUNCTION apply_naming(text, text, text, text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION vote_naming(text, text, text, text), resolve_naming(text, text, text, text)
  TO authenticated;
-- view 要能數票（只回傳數字）
GRANT EXECUTE ON FUNCTION naming_vote_count(text) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION naming_candidate_city(text), naming_voted(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION naming_candidate_city(text), naming_voted(text) TO authenticated;
GRANT SELECT ON naming_open TO anon, authenticated;
