-- 0004_auth_roles：會員、角色、修正建議審核、照片紀錄、修改紀錄（P3）
-- 依賴 Supabase 的 auth schema（auth.users、auth.uid()）。
-- 權限原則（CLAUDE.md）：看資料不用登入、寫入才要登入；權限在資料庫層把關；
-- 會員的修改一律進 edit_suggestions，只能透過 review_suggestion() 核准。
-- 審核員也不能直接寫場地資料表（decisions D15），要改資料一律透過 SECURITY DEFINER 函式（P3(e)）。
-- Storage bucket 與其 policy 在 P3(d) 建立。

-- ---------- 角色 ----------
CREATE TABLE profiles (
  id             uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name   text CHECK (char_length(display_name) BETWEEN 1 AND 30),
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

-- 新使用者註冊時自動建立 profile。預設暱稱「家長 1234」：不用社群帳號名稱，
-- 避免真名在使用者不知情時公開（decisions D16）；使用者可以在 /me 修改。
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, '家長 ' || lpad(floor(random() * 10000)::int::text, 4, '0'));
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 權限判斷函式（給 RLS 使用）。被停權的帳號 app_role() 是 NULL，所有寫入自動失敗。
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

-- 一定回傳 true／false：被停權時 app_role() 是 NULL，如果讓 NULL 傳出去，
-- 呼叫端寫 IF NOT can_moderate(...) 會把 NULL 當成「沒有拒絕」而放行
CREATE OR REPLACE FUNCTION can_moderate(p_city text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_admin() OR COALESCE(app_role() = 'moderator' AND EXISTS (
    SELECT 1 FROM moderator_cities WHERE user_id = auth.uid() AND city = p_city), false)
$$;

-- 場地所屬縣市、縣市是否上線。以擁有者權限執行：policy 裡如果直接寫 (SELECT city FROM places …)，
-- 子查詢本身會套用 places 的 RLS，未上線縣市的場地查不到縣市，負責的審核員就審不了。
CREATE OR REPLACE FUNCTION place_city(p_place_id text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT city FROM places WHERE id = p_place_id
$$;

CREATE OR REPLACE FUNCTION city_launched(p_city text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM cities WHERE code = p_city AND launched_at IS NOT NULL)
$$;

-- 一般使用者只能改自己的暱稱與同意服務條款（只能從未同意改成現在），不能改角色、計數、停權等欄位。
-- 只檢查從 API 直接送來的修改（current_user 是 authenticated）；review_suggestion() 等 SECURITY DEFINER
-- 函式以擁有者身分執行，由函式自己把關（例如核准時採納次數加 1）。
CREATE OR REPLACE FUNCTION guard_profile_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user = 'authenticated' AND NOT is_admin() THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.role IS DISTINCT FROM OLD.role
      OR NEW.accepted_count IS DISTINCT FROM OLD.accepted_count
      OR NEW.banned_at IS DISTINCT FROM OLD.banned_at
      OR NEW.ban_reason IS DISTINCT FROM OLD.ban_reason
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION '沒有權限修改這些欄位';
    END IF;
    IF NEW.terms_accepted_at IS DISTINCT FROM OLD.terms_accepted_at THEN
      IF OLD.terms_accepted_at IS NOT NULL OR NEW.terms_accepted_at IS NULL THEN
        RAISE EXCEPTION '已經同意過服務條款';
      END IF;
      NEW.terms_accepted_at := now();  -- 同意時間一律用伺服器時間
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_guard BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION guard_profile_update();

-- ---------- 修正建議 ----------
INSERT INTO sources (id, label, url, kind)
VALUES ('user', '使用者回報（已審核）', NULL, 'user')
ON CONFLICT (id) DO NOTHING;

-- 0001 的 key、field、proposed 保留不刪；新程式只用 kind＋payload
ALTER TABLE edit_suggestions
  ADD COLUMN kind text NOT NULL DEFAULT 'attribute'
      CHECK (kind IN ('attribute','parking','field','new_place','closure')),
  ADD COLUMN payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN reject_reason text
      CHECK (reject_reason IN ('duplicate','unverifiable','inappropriate','outdated','other')),
  ADD COLUMN review_note text;
ALTER TABLE edit_suggestions ALTER COLUMN proposed DROP NOT NULL;
-- payload 格式（validate_suggestion() 檢查）：
--   attribute: {"key":"footwash","value":"y","note":"東側入口"}
--   parking:   {"type":"lot","fee":"paid","spaces":40,"fee_note":"每小時 30 元","note":"..."}
--   field:     {"field":"hours","value":"06:00–22:00"}
--   closure:   {"reason":"遊具維修中","until":"2026-12-31"}
--   new_place: {"name":"...","lat":24.8,"lng":120.9,"address":"...","city":"hsc"}
CREATE INDEX edit_suggestions_queue_idx ON edit_suggestions (status, created_at);
CREATE INDEX edit_suggestions_user_idx ON edit_suggestions (user_id, created_at);
ALTER TABLE edit_suggestions
  ADD CONSTRAINT edit_suggestions_user_fk FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- payload 格式檢查（不論誰新增都檢查）
CREATE OR REPLACE FUNCTION validate_suggestion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p jsonb := NEW.payload;
BEGIN
  IF jsonb_typeof(p) <> 'object' THEN RAISE EXCEPTION '建議內容格式錯誤'; END IF;
  IF NEW.kind = 'new_place' THEN
    IF NEW.place_id IS NOT NULL THEN RAISE EXCEPTION '新增場地的建議不能指定場地'; END IF;
  ELSIF NEW.place_id IS NULL THEN
    RAISE EXCEPTION '要指定場地';
  END IF;

  IF NEW.kind = 'attribute' THEN
    IF NOT EXISTS (SELECT 1 FROM attribute_defs WHERE key = p->>'key') THEN
      RAISE EXCEPTION '沒有這個設施項目：%', p->>'key';
    END IF;
    IF p->>'value' IS NULL OR p->>'value' NOT IN ('y','n','u') THEN
      RAISE EXCEPTION '設施的值只能是 y、n、u';
    END IF;
  ELSIF NEW.kind = 'parking' THEN
    IF p->>'type' IS NULL OR p->>'type' NOT IN ('lot','street','none','u') THEN
      RAISE EXCEPTION '停車類型錯誤';
    END IF;
    IF COALESCE(p->>'fee', 'u') NOT IN ('free','paid','u') THEN RAISE EXCEPTION '停車費用錯誤'; END IF;
    IF p ? 'spaces' AND jsonb_typeof(p->'spaces') <> 'null' AND NOT (
         jsonb_typeof(p->'spaces') = 'number' AND (p->>'spaces') ~ '^\d+$') THEN
      RAISE EXCEPTION '停車格數要是 0 以上的整數';
    END IF;
  ELSIF NEW.kind = 'field' THEN
    IF p->>'field' IS NULL OR p->>'field' NOT IN ('hours','surface') THEN
      RAISE EXCEPTION '這個欄位不能回報：%', p->>'field';
    END IF;
  ELSIF NEW.kind = 'closure' THEN
    IF p->>'until' IS NOT NULL AND (p->>'until') !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION '預計恢復日期格式錯誤';
    END IF;
  ELSIF NEW.kind = 'new_place' THEN
    IF COALESCE(btrim(p->>'name'), '') = '' THEN RAISE EXCEPTION '要填場地名稱'; END IF;
    IF jsonb_typeof(p->'lat') <> 'number' OR jsonb_typeof(p->'lng') <> 'number'
       OR (p->>'lat')::numeric NOT BETWEEN 21.8 AND 25.4
       OR (p->>'lng')::numeric NOT BETWEEN 118.1 AND 122.1 THEN
      RAISE EXCEPTION '位置不在台灣範圍內';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM cities WHERE code = p->>'city') THEN
      RAISE EXCEPTION '沒有這個縣市：%', p->>'city';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER edit_suggestions_validate BEFORE INSERT ON edit_suggestions
FOR EACH ROW EXECUTE FUNCTION validate_suggestion();

-- 每個帳號 24 小時內最多 30 筆建議。用 advisory lock 讓同一個帳號的新增排隊，同時送出也不會超過上限。
CREATE OR REPLACE FUNCTION limit_suggestions() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('edit_suggestions:' || NEW.user_id::text, 0));
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
DECLARE s edit_suggestions;
BEGIN
  SELECT * INTO s FROM edit_suggestions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR s.status <> 'pending' THEN RAISE EXCEPTION '這筆建議不存在或已審核'; END IF;
  IF NOT can_moderate(COALESCE(place_city(s.place_id), s.payload->>'city')) THEN
    RAISE EXCEPTION '沒有審核權限';
  END IF;
  IF s.user_id = auth.uid() THEN RAISE EXCEPTION '不能審核自己的建議'; END IF;

  IF p_accept THEN
    IF s.kind = 'attribute' THEN
      IF s.payload->>'value' NOT IN ('y','n','u') THEN RAISE EXCEPTION '設施的值只能是 y、n、u'; END IF;
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
  -- 值、來源、說明都沒變（例如只更新確認日期）不記錄
  IF TG_OP = 'UPDATE' AND (OLD.value, OLD.source_id, OLD.note) IS NOT DISTINCT FROM
                          (NEW.value, NEW.source_id, NEW.note) THEN
    RETURN NULL;
  END IF;
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

-- ---------- 照片（紀錄；檔案的 Storage bucket 在 P3(d)） ----------
CREATE TABLE photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id      text NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  -- 刪除帳號時照片一併刪除（P3 任務）；Storage 檔案的清除在 P3(d)
  user_id       uuid REFERENCES profiles(id) ON DELETE CASCADE,
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

-- profiles：只看得到自己的（審核員、管理員看得到全部）；被停權的人不能改自己的資料
CREATE POLICY own_read   ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR app_role() IN ('moderator','admin'));
CREATE POLICY own_update ON profiles FOR UPDATE TO authenticated
  USING ((id = auth.uid() AND app_role() IS NOT NULL) OR is_admin())
  WITH CHECK ((id = auth.uid() AND app_role() IS NOT NULL) OR is_admin());

CREATE POLICY admin_manage ON moderator_cities FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY own_read     ON moderator_cities FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 修正建議：會員新增自己的待審建議（審核欄位必須空白、場地或縣市必須已上線）；
-- 看得到自己的，審核員看得到負責縣市的；審核只能透過 review_suggestion()（沒有 UPDATE／DELETE policy）
CREATE POLICY member_insert ON edit_suggestions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND status = 'pending'
    AND reviewed_by IS NULL AND reviewed_at IS NULL AND reject_reason IS NULL AND review_note IS NULL
    AND app_role() IS NOT NULL AND has_accepted_terms()
    AND city_launched(COALESCE(place_city(place_id), payload->>'city')));
CREATE POLICY read_own_or_mod ON edit_suggestions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR can_moderate(COALESCE(place_city(place_id), payload->>'city')));

-- 場地資料表（places、place_attributes、place_parking、attribute_defs、sources）維持 0001 的公開唯讀：
-- 不給審核員或管理員直接寫入的 policy（decisions D15）。

CREATE POLICY mod_read ON place_attribute_history FOR SELECT TO authenticated
  USING (can_moderate(place_city(place_id)));

-- 照片：公開只看得到已核准的；會員新增自己的待審照片；審核員更新負責縣市的
CREATE POLICY public_approved ON photos FOR SELECT TO anon, authenticated
  USING (status = 'approved');
CREATE POLICY own_or_mod_read ON photos FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR can_moderate(place_city(place_id)));
CREATE POLICY member_insert ON photos FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND status = 'pending' AND NOT exif_stripped
    AND reviewed_by IS NULL AND reviewed_at IS NULL AND reject_reason IS NULL
    AND app_role() IS NOT NULL AND has_accepted_terms() AND city_launched(place_city(place_id)));
CREATE POLICY mod_update ON photos FOR UPDATE TO authenticated
  USING (can_moderate(place_city(place_id))) WITH CHECK (can_moderate(place_city(place_id)));

-- ---------- 函式執行權限 ----------
-- Supabase 預設讓 anon、authenticated 都能執行 public 的函式（PostgREST 的 /rpc）。
-- 匿名使用者不需要任何一個；審核函式只給登入的人（函式裡再檢查審核權限）。
REVOKE EXECUTE ON FUNCTION
  handle_new_user(), app_role(), has_accepted_terms(), is_admin(), can_moderate(text),
  place_city(text), city_launched(text), guard_profile_update(), validate_suggestion(),
  limit_suggestions(), review_suggestion(bigint, boolean, text, text), log_attribute_change()
FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION
  handle_new_user(), guard_profile_update(), validate_suggestion(), limit_suggestions(), log_attribute_change()
FROM authenticated;
GRANT EXECUTE ON FUNCTION
  app_role(), has_accepted_terms(), is_admin(), can_moderate(text), place_city(text), city_launched(text),
  review_suggestion(bigint, boolean, text, text)
TO authenticated;

-- ---------- 資料表權限 ----------
-- 匿名使用者沒有任何寫入的理由：在權限層就擋掉，不必等到 RLS（也不會先跑到格式檢查的 trigger）。
-- 修改紀錄只由 trigger 寫入（SECURITY DEFINER），登入的人也不能直接寫。
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON profiles, moderator_cities, edit_suggestions, place_attribute_history, photos FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON place_attribute_history FROM authenticated;
