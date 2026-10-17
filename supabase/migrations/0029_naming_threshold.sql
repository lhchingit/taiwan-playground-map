-- 0029_naming_threshold：會員命名的自動通過門檻改成可以設定（decisions D23，2026-10-17）。
-- 原本 3 位會員一致就自動通過；改成全站一個門檻（預設 10 人），只有管理員能透過 admin_set_naming_threshold() 調整，
-- 操作記在 admin_log。命名與建議排除共用同一個門檻。未達門檻的由審核員／管理員在 /admin/naming 用 resolve_naming() 決定。
-- 已經有的票不受影響：未達新門檻的點留在待命名，等下一票或人工決定（門檻調低時也不會自動補通過）。

-- ---------- 網站設定（只有一列；公開可讀，寫入只能經過管理員函式） ----------
CREATE TABLE site_settings (
  id               boolean PRIMARY KEY DEFAULT true CHECK (id),
  naming_threshold int NOT NULL DEFAULT 10 CHECK (naming_threshold BETWEEN 2 AND 100),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid REFERENCES profiles(id) ON DELETE SET NULL
);
INSERT INTO site_settings DEFAULT VALUES;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_read ON site_settings FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON site_settings FROM anon, authenticated;

CREATE OR REPLACE FUNCTION naming_threshold() RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT naming_threshold FROM site_settings WHERE id
$$;
GRANT EXECUTE ON FUNCTION naming_threshold() TO anon, authenticated;

-- ---------- 管理員調整門檻（記在 admin_log） ----------
ALTER TABLE admin_log DROP CONSTRAINT admin_log_action_check;
ALTER TABLE admin_log ADD CONSTRAINT admin_log_action_check
  CHECK (action IN ('set_role','set_cities','ban','unban','set_naming_threshold'));

CREATE OR REPLACE FUNCTION admin_set_naming_threshold(p_threshold int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old int;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION '只有管理員可以做這件事'; END IF;
  IF p_threshold IS NULL OR p_threshold < 2 OR p_threshold > 100 THEN
    RAISE EXCEPTION '門檻要是 2～100 人';
  END IF;
  SELECT naming_threshold INTO old FROM site_settings WHERE id FOR UPDATE;
  IF old = p_threshold THEN RETURN; END IF;
  UPDATE site_settings SET naming_threshold = p_threshold, updated_at = now(), updated_by = auth.uid()
   WHERE id;
  INSERT INTO admin_log (actor, target, action, before, after)
  VALUES (auth.uid(), NULL, 'set_naming_threshold',
          jsonb_build_object('naming_threshold', old), jsonb_build_object('naming_threshold', p_threshold));
END $$;
REVOKE EXECUTE ON FUNCTION admin_set_naming_threshold(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_set_naming_threshold(int) TO authenticated;

-- ---------- 通過時記下一致的人數（匯出的確認者寫「會員 N 人一致」） ----------
ALTER TABLE naming_candidates ADD COLUMN resolved_votes int;

DROP FUNCTION apply_naming(text, text, text, text, text, uuid);
CREATE FUNCTION apply_naming(p_candidate text, p_action text, p_name text, p_basis text,
                             p_by text, p_user uuid, p_votes int DEFAULT NULL)
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
            CASE p_by WHEN 'votes' THEN '會員命名（' || p_votes || ' 人一致）' ELSE '審核員命名' END
              || '：' || final_name, p_user);
  ELSE
    final_name := NULL;
  END IF;
  UPDATE naming_candidates
     SET status = CASE p_action WHEN 'name' THEN 'named' ELSE 'excluded' END,
         resolved_name = final_name, resolved_basis = p_basis, resolved_by = p_by,
         resolved_user = p_user, resolved_votes = CASE p_by WHEN 'votes' THEN p_votes END,
         resolved_at = now()
   WHERE id = c.id;
END $$;
-- 套用結果只能經過 vote_naming()／resolve_naming()（Supabase 預設會把函式權限給 authenticated）
REVOKE EXECUTE ON FUNCTION apply_naming(text, text, text, text, text, uuid, int)
  FROM PUBLIC, anon, authenticated;

-- ---------- 會員投票：門檻改用 naming_threshold() ----------
-- 回傳 'voted'（已記錄）、'named'（剛好達到門檻，已上地圖）、'excluded'
CREATE OR REPLACE FUNCTION vote_naming(p_candidate text, p_action text, p_name text, p_basis text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c naming_candidates;
  k text;
  top record;
  n int;
  need int := naming_threshold();
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
    SELECT count(DISTINCT user_id) INTO n FROM naming_votes
     WHERE candidate_id = c.id AND action = 'name' AND name_key = k;
    IF n >= need THEN
      -- 名稱用最多人寫的原始寫法（一樣多時用最早的）；依據用最多的
      SELECT name INTO top FROM naming_votes WHERE candidate_id = c.id AND name_key = k
       GROUP BY name ORDER BY count(*) DESC, min(created_at) LIMIT 1;
      PERFORM apply_naming(c.id, 'name', top.name,
        (SELECT basis FROM naming_votes WHERE candidate_id = c.id AND name_key = k
          GROUP BY basis ORDER BY count(*) DESC, min(created_at) LIMIT 1),
        'votes', NULL, n);
      UPDATE profiles SET accepted_count = accepted_count + 1
       WHERE id IN (SELECT user_id FROM naming_votes WHERE candidate_id = c.id AND name_key = k);
      RETURN 'named';
    END IF;
  ELSE
    SELECT count(DISTINCT user_id) INTO n FROM naming_votes
     WHERE candidate_id = c.id AND action = 'exclude';
    IF n >= need THEN
      PERFORM apply_naming(c.id, 'exclude', NULL,
        (SELECT basis FROM naming_votes WHERE candidate_id = c.id AND action = 'exclude'
          GROUP BY basis ORDER BY count(*) DESC, min(created_at) LIMIT 1),
        'votes', NULL, n);
      UPDATE profiles SET accepted_count = accepted_count + 1
       WHERE id IN (SELECT user_id FROM naming_votes WHERE candidate_id = c.id AND action = 'exclude');
      RETURN 'excluded';
    END IF;
  END IF;
  RETURN 'voted';
END $$;
