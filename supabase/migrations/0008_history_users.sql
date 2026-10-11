-- 0008_history_users：修改紀錄的還原、管理員的使用者管理（P3(e2)）
-- - 修改紀錄補上確認日期、預計恢復日期、原因，還原時才能完整恢復
-- - restore_attribute()／restore_field()：回到某一筆修改「之前」的狀態（也能回到匯入時的原始值）
-- - admin_*()：使用者列表（含 Email，只有管理員）、角色、負責縣市、停權；每個操作都記在 admin_log
-- - 收回管理員直接寫 profiles、moderator_cities 的權限：角色變更一律透過函式，才會留下紀錄

-- ---------- 修改紀錄補欄位 ----------
ALTER TABLE place_attribute_history
  ADD COLUMN old_verified_at date,
  ADD COLUMN new_verified_at date;

ALTER TABLE place_field_history
  ADD COLUMN old_verified_at date,
  ADD COLUMN new_verified_at date,
  ADD COLUMN old_until       date,          -- 狀態：修改前的預計恢復日期
  ADD COLUMN new_until       date,
  ADD COLUMN old_note        text,          -- 狀態：修改前的原因（note 是修改後的原因或審核員說明）
  ADD COLUMN restored_from   bigint;        -- 由還原產生時，還原的是哪一筆紀錄

CREATE OR REPLACE FUNCTION log_attribute_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- 值、來源、說明都沒變（例如只更新確認日期）不記錄
  IF TG_OP = 'UPDATE' AND (OLD.value, OLD.source_id, OLD.note) IS NOT DISTINCT FROM
                          (NEW.value, NEW.source_id, NEW.note) THEN
    RETURN NULL;
  END IF;
  INSERT INTO place_attribute_history
    (place_id, key, old_value, new_value, old_source, new_source, old_note, new_note,
     old_verified_at, new_verified_at, changed_by)
  VALUES (COALESCE(NEW.place_id, OLD.place_id), COALESCE(NEW.key, OLD.key),
          OLD.value, NEW.value, OLD.source_id, NEW.source_id, OLD.note, NEW.note,
          OLD.verified_at, NEW.verified_at, auth.uid());
  RETURN NULL;
END $$;

-- 基本欄位改變時寫一筆紀錄（審核套用、恢復開放、還原共用）
CREATE OR REPLACE FUNCTION log_field_change(
  p_place_id text, p_field text, p_old places, p_new places,
  p_suggestion_id bigint DEFAULT NULL, p_restored_from bigint DEFAULT NULL, p_comment text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO place_field_history
    (place_id, field, old_value, new_value, old_source, new_source, old_verified_at, new_verified_at,
     old_until, new_until, old_note, note, suggestion_id, restored_from, changed_by)
  VALUES (
    p_place_id, p_field,
    CASE p_field WHEN 'hours' THEN p_old.hours WHEN 'surface' THEN p_old.surface ELSE p_old.status END,
    CASE p_field WHEN 'hours' THEN p_new.hours WHEN 'surface' THEN p_new.surface ELSE p_new.status END,
    CASE p_field WHEN 'hours' THEN p_old.hours_source WHEN 'surface' THEN p_old.surface_source ELSE p_old.status_source END,
    CASE p_field WHEN 'hours' THEN p_new.hours_source WHEN 'surface' THEN p_new.surface_source ELSE p_new.status_source END,
    CASE p_field WHEN 'hours' THEN p_old.hours_verified_at WHEN 'surface' THEN p_old.surface_verified_at ELSE p_old.status_verified_at END,
    CASE p_field WHEN 'hours' THEN p_new.hours_verified_at WHEN 'surface' THEN p_new.surface_verified_at ELSE p_new.status_verified_at END,
    CASE WHEN p_field = 'status' THEN p_old.status_until END,
    CASE WHEN p_field = 'status' THEN p_new.status_until END,
    CASE WHEN p_field = 'status' THEN p_old.status_note END,
    COALESCE(p_comment, CASE WHEN p_field = 'status' THEN p_new.status_note END),
    p_suggestion_id, p_restored_from, auth.uid());
END $$;

-- ---------- 審核、恢復開放：改用 log_field_change()，紀錄完整的前後狀態 ----------
CREATE OR REPLACE FUNCTION review_suggestion(p_id bigint, p_accept boolean,
                                             p_reason text DEFAULT NULL, p_note text DEFAULT NULL,
                                             p_payload jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s edit_suggestions;
  p jsonb;
  f text;
  before places;
  after places;
BEGIN
  SELECT * INTO s FROM edit_suggestions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR s.status <> 'pending' THEN RAISE EXCEPTION '這筆建議不存在或已審核'; END IF;
  IF NOT can_moderate(COALESCE(place_city(s.place_id), s.payload->>'city')) THEN
    RAISE EXCEPTION '沒有審核權限';
  END IF;
  IF s.user_id = auth.uid() THEN RAISE EXCEPTION '不能審核自己的建議'; END IF;

  IF p_accept THEN
    IF s.kind = 'new_place' THEN
      RAISE EXCEPTION '新增場地的核准還沒開放，請先保留或退回';
    END IF;
    p := COALESCE(p_payload, s.payload);
    PERFORM check_suggestion_payload(s.kind, s.place_id, p);

    IF s.kind = 'attribute' THEN
      INSERT INTO place_attributes (place_id, key, value, note, source_id, verified_at)
      VALUES (s.place_id, p->>'key', p->>'value', p->>'note', 'user', current_date)
      ON CONFLICT (place_id, key) DO UPDATE
        SET value = EXCLUDED.value, note = EXCLUDED.note,
            source_id = 'user', verified_at = current_date;
    ELSIF s.kind = 'parking' THEN
      DELETE FROM place_parking WHERE place_id = s.place_id AND type = 'u';
      INSERT INTO place_parking (place_id, type, fee, fee_note, spaces, note, source_id, verified_at)
      VALUES (s.place_id, p->>'type', COALESCE(p->>'fee','u'), p->>'fee_note',
              (p->>'spaces')::int, p->>'note', 'user', current_date);
    ELSIF s.kind IN ('field', 'closure') THEN
      SELECT * INTO before FROM places WHERE id = s.place_id FOR UPDATE;
      IF s.kind = 'field' THEN
        f := p->>'field';
        IF f = 'hours' THEN
          UPDATE places SET hours = p->>'value', hours_source = 'user', hours_verified_at = current_date,
                            updated_at = now()
           WHERE id = s.place_id RETURNING * INTO after;
        ELSE
          UPDATE places SET surface = p->>'value', surface_source = 'user', surface_verified_at = current_date,
                            updated_at = now()
           WHERE id = s.place_id RETURNING * INTO after;
        END IF;
      ELSE
        f := 'status';
        UPDATE places SET status = COALESCE(p->>'status', 'maintenance'), status_until = (p->>'until')::date,
                          status_note = p->>'reason', status_source = 'user', status_verified_at = current_date,
                          updated_at = now()
         WHERE id = s.place_id RETURNING * INTO after;
      END IF;
      PERFORM log_field_change(s.place_id, f, before, after, s.id);
    END IF;
    UPDATE profiles SET accepted_count = accepted_count + 1 WHERE id = s.user_id;
  END IF;

  UPDATE edit_suggestions
     SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END,
         reject_reason = CASE WHEN p_accept THEN NULL ELSE COALESCE(p_reason, 'other') END,
         applied_payload = CASE WHEN p_accept THEN p ELSE NULL END,
         review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = p_id;
END $$;

CREATE OR REPLACE FUNCTION reopen_place(p_place_id text, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE before places; after places;
BEGIN
  SELECT * INTO before FROM places WHERE id = p_place_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '找不到這個場地'; END IF;
  IF NOT can_moderate(place_city(p_place_id)) THEN RAISE EXCEPTION '沒有審核權限'; END IF;
  IF before.status NOT IN ('maintenance','closed') THEN RAISE EXCEPTION '這個場地沒有標示維修中或已封閉'; END IF;
  UPDATE places SET status = 'open', status_until = NULL, status_note = NULL,
                    status_source = 'user', status_verified_at = current_date, updated_at = now()
   WHERE id = p_place_id RETURNING * INTO after;
  PERFORM log_field_change(p_place_id, 'status', before, after, NULL, NULL, p_note);
END $$;

-- ---------- 還原：回到某一筆修改之前的狀態 ----------
CREATE OR REPLACE FUNCTION restore_attribute(p_history_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h place_attribute_history; cur place_attributes; found_cur boolean;
BEGIN
  SELECT * INTO h FROM place_attribute_history WHERE id = p_history_id;
  IF NOT FOUND THEN RAISE EXCEPTION '找不到這筆修改紀錄'; END IF;
  IF NOT can_moderate(place_city(h.place_id)) THEN RAISE EXCEPTION '沒有審核權限'; END IF;
  SELECT * INTO cur FROM place_attributes WHERE place_id = h.place_id AND key = h.key FOR UPDATE;
  found_cur := FOUND;

  IF h.old_value IS NULL THEN
    -- 這筆修改之前沒有資料（未知）：刪掉那一列
    IF NOT found_cur THEN RAISE EXCEPTION '已經是這個版本'; END IF;
    DELETE FROM place_attributes WHERE place_id = h.place_id AND key = h.key;
  ELSE
    IF found_cur AND (cur.value, cur.source_id, cur.note) IS NOT DISTINCT FROM
                     (h.old_value, h.old_source, h.old_note) THEN
      RAISE EXCEPTION '已經是這個版本';
    END IF;
    IF h.old_source IS NULL THEN RAISE EXCEPTION '這筆紀錄沒有來源，不能還原'; END IF;
    INSERT INTO place_attributes (place_id, key, value, note, source_id, verified_at)
    VALUES (h.place_id, h.key, h.old_value, h.old_note, h.old_source,
            COALESCE(h.old_verified_at, h.changed_at::date))
    ON CONFLICT (place_id, key) DO UPDATE
      SET value = EXCLUDED.value, note = EXCLUDED.note,
          source_id = EXCLUDED.source_id, verified_at = EXCLUDED.verified_at;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION restore_field(p_history_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h place_field_history; before places; after places;
BEGIN
  SELECT * INTO h FROM place_field_history WHERE id = p_history_id;
  IF NOT FOUND THEN RAISE EXCEPTION '找不到這筆修改紀錄'; END IF;
  IF NOT can_moderate(place_city(h.place_id)) THEN RAISE EXCEPTION '沒有審核權限'; END IF;
  SELECT * INTO before FROM places WHERE id = h.place_id FOR UPDATE;

  IF h.field = 'hours' THEN
    IF (before.hours, before.hours_source) IS NOT DISTINCT FROM (h.old_value, h.old_source) THEN
      RAISE EXCEPTION '已經是這個版本';
    END IF;
    UPDATE places SET hours = h.old_value, hours_source = h.old_source,
                      hours_verified_at = h.old_verified_at, updated_at = now()
     WHERE id = h.place_id RETURNING * INTO after;
  ELSIF h.field = 'surface' THEN
    IF (before.surface, before.surface_source) IS NOT DISTINCT FROM (h.old_value, h.old_source) THEN
      RAISE EXCEPTION '已經是這個版本';
    END IF;
    UPDATE places SET surface = h.old_value, surface_source = h.old_source,
                      surface_verified_at = h.old_verified_at, updated_at = now()
     WHERE id = h.place_id RETURNING * INTO after;
  ELSE
    IF (before.status, before.status_source, before.status_until, before.status_note)
       IS NOT DISTINCT FROM (h.old_value, h.old_source, h.old_until, h.old_note) THEN
      RAISE EXCEPTION '已經是這個版本';
    END IF;
    UPDATE places SET status = COALESCE(h.old_value, 'open'), status_source = h.old_source,
                      status_verified_at = h.old_verified_at, status_until = h.old_until,
                      status_note = h.old_note, updated_at = now()
     WHERE id = h.place_id RETURNING * INTO after;
  END IF;
  PERFORM log_field_change(h.place_id, h.field, before, after, NULL, h.id,
                           CASE WHEN h.field = 'status' THEN after.status_note END);
END $$;

-- ---------- 管理員的使用者管理 ----------
CREATE TABLE admin_log (
  id         bigserial PRIMARY KEY,
  actor      uuid NOT NULL,                  -- 管理員
  target     uuid,                           -- 被操作的使用者（刪除帳號後仍保留 id）
  action     text NOT NULL CHECK (action IN ('set_role','set_cities','ban','unban')),
  before     jsonb,
  after      jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_log_created_idx ON admin_log (created_at DESC);
ALTER TABLE admin_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_read ON admin_log FOR SELECT TO authenticated USING (is_admin());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON admin_log FROM anon, authenticated;

CREATE OR REPLACE FUNCTION require_admin_on(p_user uuid) RETURNS profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t profiles;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION '只有管理員可以做這件事'; END IF;
  IF p_user = auth.uid() THEN RAISE EXCEPTION '不能對自己的帳號做這件事'; END IF;
  SELECT * INTO t FROM profiles WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '找不到這個使用者'; END IF;
  RETURN t;
END $$;

-- 使用者列表：含 Email（只有管理員能呼叫，decisions D18）。用暱稱或 Email 搜尋（部分符合，不當成萬用字元）。
CREATE OR REPLACE FUNCTION admin_list_users(p_query text DEFAULT NULL, p_limit int DEFAULT 50, p_offset int DEFAULT 0)
RETURNS TABLE (id uuid, display_name text, email text, role text, cities text[], accepted_count int,
               suggestions bigint, banned_at timestamptz, ban_reason text, created_at timestamptz, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE q text := lower(btrim(COALESCE(p_query, '')));
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION '只有管理員可以做這件事'; END IF;
  RETURN QUERY
  SELECT p.id, p.display_name, u.email::text, p.role,
         COALESCE((SELECT array_agg(m.city ORDER BY m.city) FROM moderator_cities m WHERE m.user_id = p.id),
                  '{}'::text[]),
         p.accepted_count,
         (SELECT count(*) FROM edit_suggestions e WHERE e.user_id = p.id),
         p.banned_at, p.ban_reason, p.created_at,
         count(*) OVER ()
  FROM profiles p JOIN auth.users u ON u.id = p.id
  WHERE q = '' OR strpos(lower(COALESCE(p.display_name, '')), q) > 0 OR strpos(lower(u.email), q) > 0
  ORDER BY p.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END $$;

CREATE OR REPLACE FUNCTION admin_set_role(p_user uuid, p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t profiles; old_cities text[];
BEGIN
  t := require_admin_on(p_user);
  IF p_role NOT IN ('member','moderator','admin') THEN RAISE EXCEPTION '角色只能是會員、審核員或管理員'; END IF;
  IF t.role = p_role THEN RETURN; END IF;
  SELECT COALESCE(array_agg(city ORDER BY city), '{}') INTO old_cities FROM moderator_cities WHERE user_id = p_user;
  UPDATE profiles SET role = p_role WHERE id = p_user;
  -- 不是審核員就沒有負責縣市
  IF p_role <> 'moderator' THEN DELETE FROM moderator_cities WHERE user_id = p_user; END IF;
  INSERT INTO admin_log (actor, target, action, before, after)
  VALUES (auth.uid(), p_user, 'set_role',
          jsonb_build_object('role', t.role, 'cities', old_cities),
          jsonb_build_object('role', p_role,
                             'cities', CASE WHEN p_role = 'moderator' THEN to_jsonb(old_cities) ELSE '[]'::jsonb END));
END $$;

CREATE OR REPLACE FUNCTION admin_set_cities(p_user uuid, p_cities text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t profiles; old_cities text[]; new_cities text[];
BEGIN
  t := require_admin_on(p_user);
  IF t.role <> 'moderator' THEN RAISE EXCEPTION '只有審核員需要指派負責縣市'; END IF;
  SELECT COALESCE(array_agg(DISTINCT c ORDER BY c), '{}') INTO new_cities FROM unnest(COALESCE(p_cities, '{}')) c;
  IF EXISTS (SELECT 1 FROM unnest(new_cities) c WHERE NOT EXISTS (SELECT 1 FROM cities WHERE code = c)) THEN
    RAISE EXCEPTION '沒有這個縣市';
  END IF;
  SELECT COALESCE(array_agg(city ORDER BY city), '{}') INTO old_cities FROM moderator_cities WHERE user_id = p_user;
  DELETE FROM moderator_cities WHERE user_id = p_user;
  INSERT INTO moderator_cities (user_id, city) SELECT p_user, c FROM unnest(new_cities) c;
  INSERT INTO admin_log (actor, target, action, before, after)
  VALUES (auth.uid(), p_user, 'set_cities', jsonb_build_object('cities', old_cities),
          jsonb_build_object('cities', new_cities));
END $$;

CREATE OR REPLACE FUNCTION admin_ban(p_user uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t profiles; r text := btrim(COALESCE(p_reason, ''));
BEGIN
  t := require_admin_on(p_user);
  IF r = '' OR char_length(r) > 200 THEN RAISE EXCEPTION '停權原因要 1～200 個字'; END IF;
  IF t.banned_at IS NOT NULL THEN RAISE EXCEPTION '這個帳號已經停權'; END IF;
  UPDATE profiles SET banned_at = now(), ban_reason = r WHERE id = p_user;
  INSERT INTO admin_log (actor, target, action, before, after)
  VALUES (auth.uid(), p_user, 'ban', NULL, jsonb_build_object('reason', r));
END $$;

CREATE OR REPLACE FUNCTION admin_unban(p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t profiles;
BEGIN
  t := require_admin_on(p_user);
  IF t.banned_at IS NULL THEN RAISE EXCEPTION '這個帳號沒有停權'; END IF;
  UPDATE profiles SET banned_at = NULL, ban_reason = NULL WHERE id = p_user;
  INSERT INTO admin_log (actor, target, action, before, after)
  VALUES (auth.uid(), p_user, 'unban', jsonb_build_object('reason', t.ban_reason), NULL);
END $$;

-- ---------- 收回直接寫入：角色、停權、負責縣市一律透過上面的函式（才會留下紀錄） ----------
-- profiles：只能改自己的（暱稱、同意條款，由 guard 檢查欄位）；管理員也一樣
DROP POLICY own_update ON profiles;
CREATE POLICY own_update ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() AND app_role() IS NOT NULL)
  WITH CHECK (id = auth.uid() AND app_role() IS NOT NULL);

-- guard 不再放行管理員的直接修改（包括改自己的角色）
CREATE OR REPLACE FUNCTION guard_profile_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user = 'authenticated' THEN
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

-- moderator_cities：管理員只能讀，寫入透過 admin_set_cities()／admin_set_role()
DROP POLICY admin_manage ON moderator_cities;
CREATE POLICY admin_read ON moderator_cities FOR SELECT TO authenticated USING (is_admin());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON moderator_cities FROM authenticated;

-- ---------- 函式執行權限 ----------
REVOKE EXECUTE ON FUNCTION
  log_field_change(text, text, places, places, bigint, bigint, text),
  require_admin_on(uuid),
  restore_attribute(bigint), restore_field(bigint),
  admin_list_users(text, int, int), admin_set_role(uuid, text), admin_set_cities(uuid, text[]),
  admin_ban(uuid, text), admin_unban(uuid)
FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION
  log_field_change(text, text, places, places, bigint, bigint, text), require_admin_on(uuid)
FROM authenticated;
GRANT EXECUTE ON FUNCTION
  restore_attribute(bigint), restore_field(bigint),
  admin_list_users(text, int, int), admin_set_role(uuid, text), admin_set_cities(uuid, text[]),
  admin_ban(uuid, text), admin_unban(uuid)
TO authenticated;
