-- 0002_auth_roles：會員、角色、修正建議審核、照片、修改紀錄（P3）
-- 依賴 Supabase 的 auth schema（auth.users、auth.uid()）

-- ---------- 角色 ----------
CREATE TABLE profiles (
  id             uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name   text CHECK (char_length(display_name) <= 30),
  role           text NOT NULL DEFAULT 'member'
                 CHECK (role IN ('member','trusted','moderator','admin')),
  accepted_count integer NOT NULL DEFAULT 0,
  banned_at      timestamptz,
  ban_reason     text,
  terms_accepted_at timestamptz,          -- 第一次提交前必須同意服務條款
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- 審核員負責的縣市（admin 不需要，視為全部）
CREATE TABLE moderator_cities (
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  city    text NOT NULL REFERENCES cities(code),
  PRIMARY KEY (user_id, city)
);

-- 新使用者註冊時自動建立 profile
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, left(COALESCE(NEW.raw_user_meta_data->>'name', '家長'), 30));
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 權限判斷函式（給 RLS 使用）
CREATE OR REPLACE FUNCTION app_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM profiles WHERE id = auth.uid() AND banned_at IS NULL
$$;

CREATE OR REPLACE FUNCTION has_accepted_terms() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND terms_accepted_at IS NOT NULL)
$$;

CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT COALESCE(app_role() = 'admin', false) $$;

CREATE OR REPLACE FUNCTION can_moderate(p_city text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_admin() OR (app_role() = 'moderator' AND EXISTS (
    SELECT 1 FROM moderator_cities WHERE user_id = auth.uid() AND city = p_city))
$$;

-- 一般使用者只能改自己的暱稱，不能改角色、計數或停權欄位
CREATE OR REPLACE FUNCTION guard_profile_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT is_admin() AND auth.uid() IS NOT NULL AND (
       NEW.role IS DISTINCT FROM OLD.role
    OR NEW.accepted_count IS DISTINCT FROM OLD.accepted_count
    OR NEW.banned_at IS DISTINCT FROM OLD.banned_at
    OR NEW.ban_reason IS DISTINCT FROM OLD.ban_reason) THEN
    RAISE EXCEPTION '沒有權限修改這些欄位';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_guard BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION guard_profile_update();

-- ---------- 修正建議 ----------
INSERT INTO sources (id, label, url, kind)
VALUES ('user', '使用者回報（已審核）', NULL, 'user')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE edit_suggestions
  ADD COLUMN kind text NOT NULL DEFAULT 'attribute'
      CHECK (kind IN ('attribute','parking','field','new_place','closure')),
  ADD COLUMN payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN reject_reason text
      CHECK (reject_reason IN ('duplicate','unverifiable','inappropriate','outdated','other')),
  ADD COLUMN review_note text;
ALTER TABLE edit_suggestions ALTER COLUMN proposed DROP NOT NULL;
-- payload 範例：
--   attribute: {"key":"footwash","value":"y","note":"東側入口"}
--   parking:   {"type":"lot","fee":"paid","spaces":40,"fee_note":"每小時 30 元"}
--   field:     {"field":"hours","value":"06:00–22:00"}
--   closure:   {"reason":"遊具維修中","until":"2026-12-31"}
--   new_place: {"name":"...","lat":24.8,"lng":120.9,"address":"..."}
CREATE INDEX edit_suggestions_queue_idx ON edit_suggestions (status, created_at);
ALTER TABLE edit_suggestions
  ADD CONSTRAINT edit_suggestions_user_fk FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- 每個帳號 24 小時內最多 30 筆建議
CREATE OR REPLACE FUNCTION limit_suggestions() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM edit_suggestions
      WHERE user_id = NEW.user_id AND created_at > now() - interval '24 hours') >= 30 THEN
    RAISE EXCEPTION '今天的回報次數已達上限，明天再試';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER edit_suggestions_rate BEFORE INSERT ON edit_suggestions
FOR EACH ROW EXECUTE FUNCTION limit_suggestions();

-- 審核：核准時在同一個交易裡合併資料（attribute / parking 自動套用，其餘由審核員在後台手動套用後再核准）
CREATE OR REPLACE FUNCTION review_suggestion(p_id bigint, p_accept boolean,
                                             p_reason text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s edit_suggestions; v_city text;
BEGIN
  SELECT * INTO s FROM edit_suggestions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR s.status <> 'pending' THEN RAISE EXCEPTION '這筆建議不存在或已審核'; END IF;
  SELECT city INTO v_city FROM places WHERE id = s.place_id;
  IF NOT can_moderate(COALESCE(v_city, s.payload->>'city')) THEN RAISE EXCEPTION '沒有審核權限'; END IF;
  IF s.user_id = auth.uid() THEN RAISE EXCEPTION '不能審核自己的建議'; END IF;

  IF p_accept THEN
    IF s.kind = 'attribute' THEN
      INSERT INTO place_attributes (place_id, key, value, note, source_id, verified_at)
      VALUES (s.place_id, s.payload->>'key', s.payload->>'value', s.payload->>'note', 'user', current_date)
      ON CONFLICT (place_id, key) DO UPDATE
        SET value = EXCLUDED.value, note = EXCLUDED.note,
            source_id = 'user', verified_at = current_date;
    ELSIF s.kind = 'parking' THEN
      DELETE FROM place_parking WHERE place_id = s.place_id AND type = 'u';
      INSERT INTO place_parking (place_id, type, fee, fee_note, spaces, note, source_id, verified_at)
      VALUES (s.place_id, s.payload->>'type', COALESCE(s.payload->>'fee','u'), s.payload->>'fee_note',
              (s.payload->>'spaces')::int, s.payload->>'note', 'user', current_date);
    END IF;
    UPDATE profiles SET accepted_count = accepted_count + 1 WHERE id = s.user_id;
  END IF;

  UPDATE edit_suggestions
     SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END,
         reject_reason = CASE WHEN p_accept THEN NULL ELSE COALESCE(p_reason, 'other') END,
         review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = p_id;
END $$;

-- ---------- 修改紀錄（可追溯、可還原） ----------
CREATE TABLE place_attribute_history (
  id          bigserial PRIMARY KEY,
  place_id    text NOT NULL,
  key         text NOT NULL,
  old_value   char(1), new_value char(1),
  old_source  text,    new_source text,
  old_note    text,    new_note text,
  changed_by  uuid,                       -- 審核者或管理員；匯入腳本為 NULL
  changed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX place_attribute_history_place_idx ON place_attribute_history (place_id, changed_at DESC);

CREATE OR REPLACE FUNCTION log_attribute_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO place_attribute_history
    (place_id, key, old_value, new_value, old_source, new_source, old_note, new_note, changed_by)
  VALUES (COALESCE(NEW.place_id, OLD.place_id), COALESCE(NEW.key, OLD.key),
          OLD.value, NEW.value, OLD.source_id, NEW.source_id, OLD.note, NEW.note, auth.uid());
  RETURN NULL;
END $$;
-- PostgreSQL 11 起，INSERT 時 OLD 為 NULL、DELETE 時 NEW 為 NULL，所以同一個函式可以處理三種操作
CREATE TRIGGER place_attributes_history
AFTER INSERT OR UPDATE OR DELETE ON place_attributes
FOR EACH ROW EXECUTE FUNCTION log_attribute_change();

-- ---------- 照片 ----------
CREATE TABLE photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id      text NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  storage_path  text NOT NULL,            -- photos-pending/… 或 photos-public/…
  caption       text CHECK (char_length(caption) <= 100),
  exif_stripped boolean NOT NULL DEFAULT false,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reject_reason text,
  reviewed_by   uuid, reviewed_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX photos_place_idx ON photos (place_id) WHERE status = 'approved';

-- ---------- RLS ----------
ALTER TABLE profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderator_cities        ENABLE ROW LEVEL SECURITY;
ALTER TABLE place_attribute_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos                  ENABLE ROW LEVEL SECURITY;

CREATE POLICY own_read     ON profiles FOR SELECT USING (id = auth.uid() OR app_role() IN ('moderator','admin'));
CREATE POLICY own_update   ON profiles FOR UPDATE USING (id = auth.uid() OR is_admin());
CREATE POLICY admin_manage ON moderator_cities FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY mod_read     ON moderator_cities FOR SELECT USING (user_id = auth.uid() OR is_admin());

-- 修正建議：會員新增自己的待審建議；看得到自己的，審核員看得到負責縣市的；審核只能透過 review_suggestion()
CREATE POLICY member_insert ON edit_suggestions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending' AND app_role() IS NOT NULL AND has_accepted_terms());
CREATE POLICY read_own_or_mod ON edit_suggestions FOR SELECT USING (
  user_id = auth.uid()
  OR can_moderate((SELECT city FROM places WHERE id = place_id))
  OR (place_id IS NULL AND can_moderate(payload->>'city')));

-- 場地資料：審核員可直接修改負責縣市，管理員全部
CREATE POLICY mod_write ON places FOR ALL
  USING (can_moderate(city)) WITH CHECK (can_moderate(city));
CREATE POLICY mod_write ON place_attributes FOR ALL
  USING (can_moderate((SELECT city FROM places WHERE id = place_id)))
  WITH CHECK (can_moderate((SELECT city FROM places WHERE id = place_id)));
CREATE POLICY mod_write ON place_parking FOR ALL
  USING (can_moderate((SELECT city FROM places WHERE id = place_id)))
  WITH CHECK (can_moderate((SELECT city FROM places WHERE id = place_id)));
CREATE POLICY admin_write ON attribute_defs FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY admin_write ON sources        FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY mod_read ON place_attribute_history FOR SELECT
  USING (can_moderate((SELECT city FROM places WHERE id = place_id)));

-- 照片：公開只看得到已核准的；會員上傳自己的待審照片
CREATE POLICY public_approved ON photos FOR SELECT USING (
  status = 'approved' OR user_id = auth.uid()
  OR can_moderate((SELECT city FROM places WHERE id = place_id)));
CREATE POLICY member_insert ON photos FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending' AND app_role() IS NOT NULL AND has_accepted_terms());
CREATE POLICY mod_update ON photos FOR UPDATE
  USING (can_moderate((SELECT city FROM places WHERE id = place_id)));

-- Storage bucket（photos-pending 私有、photos-public 公開）與其 policy 由 P3 實作時建立，見 docs/tasks/P3-auth-moderation.md
