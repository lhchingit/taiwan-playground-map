-- 0034_report_fee_age：回報修正的「基本資料」開放費用與適合年齡
-- - 回報內容沿用 { field, value }：費用 value 是 free／paid；適合年齡是「最小-最大」（例：3-12，0～18 歲）
-- - 費用、適合年齡也記錄來源與確認日期（比照 0007 的開放時間、地面材質），匯入時保留會員回報的值
-- - 修改紀錄的 old_value／new_value 存同樣的文字；年齡有一邊未知時記 NULL

-- ---------- 費用、適合年齡的來源 ----------
ALTER TABLE places
  ADD COLUMN fee_source      text REFERENCES sources(id),
  ADD COLUMN fee_verified_at date,
  ADD COLUMN age_source      text REFERENCES sources(id),
  ADD COLUMN age_verified_at date;

ALTER TABLE place_field_history DROP CONSTRAINT place_field_history_field_check;
ALTER TABLE place_field_history ADD CONSTRAINT place_field_history_field_check
  CHECK (field IN ('hours','surface','status','fee','age'));

-- 年齡的文字表示：「最小-最大」；有一邊未知就是 NULL
CREATE FUNCTION age_text(p_min smallint, p_max smallint) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_min IS NULL OR p_max IS NULL THEN NULL ELSE p_min || '-' || p_max END
$$;

-- ---------- 格式檢查：基本資料多了費用、適合年齡 ----------
CREATE OR REPLACE FUNCTION check_suggestion_payload(p_kind text, p_place_id text, p jsonb)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b numeric[]; m text[];
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RAISE EXCEPTION '建議內容格式錯誤'; END IF;
  IF p_kind = 'new_place' THEN
    IF p_place_id IS NOT NULL THEN RAISE EXCEPTION '新增場地的建議不能指定場地'; END IF;
  ELSIF p_place_id IS NULL THEN
    RAISE EXCEPTION '要指定場地';
  END IF;

  IF p_kind = 'attribute' THEN
    IF NOT EXISTS (SELECT 1 FROM attribute_defs WHERE key = p->>'key') THEN
      RAISE EXCEPTION '沒有這個設施項目：%', p->>'key';
    END IF;
    IF p->>'value' IS NULL OR p->>'value' NOT IN ('y','n','u') THEN
      RAISE EXCEPTION '設施的值只能是 y、n、u';
    END IF;
  ELSIF p_kind = 'parking' THEN
    IF p->>'type' IS NULL OR p->>'type' NOT IN ('lot','street','none','u') THEN
      RAISE EXCEPTION '停車類型錯誤';
    END IF;
    IF COALESCE(p->>'fee', 'u') NOT IN ('free','paid','u') THEN RAISE EXCEPTION '停車費用錯誤'; END IF;
    IF p ? 'spaces' AND jsonb_typeof(p->'spaces') <> 'null' AND NOT (
         jsonb_typeof(p->'spaces') = 'number' AND (p->>'spaces') ~ '^\d+$') THEN
      RAISE EXCEPTION '停車格數要是 0 以上的整數';
    END IF;
  ELSIF p_kind = 'field' THEN
    IF p->>'field' IS NULL OR p->>'field' NOT IN ('hours','surface','fee','age') THEN
      RAISE EXCEPTION '這個欄位不能回報：%', p->>'field';
    END IF;
    IF p->>'field' = 'fee' THEN
      IF COALESCE(p->>'value', '') NOT IN ('free','paid') THEN
        RAISE EXCEPTION '費用只能是免費或收費';
      END IF;
    ELSIF p->>'field' = 'age' THEN
      -- 「最小-最大」，0～18 的整數，最小不能大於最大
      m := regexp_match(COALESCE(p->>'value', ''), '^(\d{1,2})-(\d{1,2})$');
      IF m IS NULL OR m[1]::int > m[2]::int OR m[2]::int > 18 THEN
        RAISE EXCEPTION '適合年齡要是 0～18 歲，例如 3-12';
      END IF;
    ELSIF COALESCE(btrim(p->>'value'), '') = '' OR char_length(p->>'value') > 100 THEN
      RAISE EXCEPTION '內容要 1～100 個字';
    END IF;
  ELSIF p_kind = 'closure' THEN
    IF COALESCE(btrim(p->>'reason'), '') = '' THEN RAISE EXCEPTION '要填封閉或維修的原因'; END IF;
    IF COALESCE(p->>'status', 'maintenance') NOT IN ('maintenance','closed') THEN
      RAISE EXCEPTION '狀態只能是維修中或已封閉';
    END IF;
    IF p->>'until' IS NOT NULL THEN
      IF (p->>'until') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION '預計恢復日期格式錯誤'; END IF;
      BEGIN
        PERFORM (p->>'until')::date;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION '預計恢復日期格式錯誤';
      END;
    END IF;
  ELSIF p_kind = 'new_place' THEN
    IF COALESCE(btrim(p->>'name'), '') = '' OR char_length(btrim(p->>'name')) > 50 THEN
      RAISE EXCEPTION '要填場地名稱（最多 50 個字）';
    END IF;
    IF char_length(COALESCE(p->>'address', '')) > 100 THEN RAISE EXCEPTION '地址最多 100 個字'; END IF;
    IF jsonb_typeof(p->'lat') <> 'number' OR jsonb_typeof(p->'lng') <> 'number'
       OR (p->>'lat')::numeric NOT BETWEEN 21.8 AND 25.4
       OR (p->>'lng')::numeric NOT BETWEEN 118.1 AND 122.1 THEN
      RAISE EXCEPTION '位置不在台灣範圍內';
    END IF;
    SELECT bbox INTO b FROM cities WHERE code = p->>'city';
    IF NOT FOUND THEN RAISE EXCEPTION '沒有這個縣市：%', p->>'city'; END IF;
    -- bbox：[西, 南, 東, 北]（由 seed 依 OSM 行政界計算）
    IF b IS NOT NULL AND NOT ((p->>'lng')::numeric BETWEEN b[1] AND b[3]
                              AND (p->>'lat')::numeric BETWEEN b[2] AND b[4]) THEN
      RAISE EXCEPTION '位置不在這個縣市的範圍內';
    END IF;
  END IF;
END $$;

-- ---------- 修改紀錄：加上費用、適合年齡 ----------
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
    CASE p_field WHEN 'hours' THEN p_old.hours WHEN 'surface' THEN p_old.surface WHEN 'fee' THEN p_old.fee
                 WHEN 'age' THEN age_text(p_old.age_min, p_old.age_max) ELSE p_old.status END,
    CASE p_field WHEN 'hours' THEN p_new.hours WHEN 'surface' THEN p_new.surface WHEN 'fee' THEN p_new.fee
                 WHEN 'age' THEN age_text(p_new.age_min, p_new.age_max) ELSE p_new.status END,
    CASE p_field WHEN 'hours' THEN p_old.hours_source WHEN 'surface' THEN p_old.surface_source
                 WHEN 'fee' THEN p_old.fee_source WHEN 'age' THEN p_old.age_source ELSE p_old.status_source END,
    CASE p_field WHEN 'hours' THEN p_new.hours_source WHEN 'surface' THEN p_new.surface_source
                 WHEN 'fee' THEN p_new.fee_source WHEN 'age' THEN p_new.age_source ELSE p_new.status_source END,
    CASE p_field WHEN 'hours' THEN p_old.hours_verified_at WHEN 'surface' THEN p_old.surface_verified_at
                 WHEN 'fee' THEN p_old.fee_verified_at WHEN 'age' THEN p_old.age_verified_at
                 ELSE p_old.status_verified_at END,
    CASE p_field WHEN 'hours' THEN p_new.hours_verified_at WHEN 'surface' THEN p_new.surface_verified_at
                 WHEN 'fee' THEN p_new.fee_verified_at WHEN 'age' THEN p_new.age_verified_at
                 ELSE p_new.status_verified_at END,
    CASE WHEN p_field = 'status' THEN p_old.status_until END,
    CASE WHEN p_field = 'status' THEN p_new.status_until END,
    CASE WHEN p_field = 'status' THEN p_old.status_note END,
    COALESCE(p_comment, CASE WHEN p_field = 'status' THEN p_new.status_note END),
    p_suggestion_id, p_restored_from, auth.uid());
END $$;

-- ---------- 審核：核准費用、適合年齡時寫入場地 ----------
CREATE OR REPLACE FUNCTION review_suggestion(p_id bigint, p_accept boolean,
                                             p_reason text DEFAULT NULL, p_note text DEFAULT NULL,
                                             p_payload jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  s edit_suggestions;
  p jsonb;
  f text;
  before places;
  after places;
  new_id text;
BEGIN
  SELECT * INTO s FROM edit_suggestions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR s.status <> 'pending' THEN RAISE EXCEPTION '這筆建議不存在或已審核'; END IF;
  IF NOT can_moderate(COALESCE(place_city(s.place_id), s.payload->>'city')) THEN
    RAISE EXCEPTION '沒有審核權限';
  END IF;
  IF s.user_id = auth.uid() THEN RAISE EXCEPTION '不能審核自己的建議'; END IF;

  IF p_accept THEN
    p := COALESCE(p_payload, s.payload);
    -- 新增場地不能改到別的縣市（權限是依原本建議的縣市檢查的）
    IF s.kind = 'new_place' AND p->>'city' IS DISTINCT FROM s.payload->>'city' THEN
      RAISE EXCEPTION '不能改成別的縣市';
    END IF;
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
        ELSIF f = 'surface' THEN
          UPDATE places SET surface = p->>'value', surface_source = 'user', surface_verified_at = current_date,
                            updated_at = now()
           WHERE id = s.place_id RETURNING * INTO after;
        ELSIF f = 'fee' THEN
          UPDATE places SET fee = p->>'value', fee_source = 'user', fee_verified_at = current_date,
                            updated_at = now()
           WHERE id = s.place_id RETURNING * INTO after;
        ELSE
          UPDATE places SET age_min = split_part(p->>'value', '-', 1)::smallint,
                            age_max = split_part(p->>'value', '-', 2)::smallint,
                            age_source = 'user', age_verified_at = current_date, updated_at = now()
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
    ELSIF s.kind = 'new_place' THEN
      new_id := (p->>'city') || '-user-' || lpad(nextval('user_place_seq')::text, 3, '0');
      INSERT INTO places (id, name, city, address, geom, status, status_source, status_verified_at,
                          coord_source, created_from_suggestion)
      VALUES (new_id, btrim(p->>'name'), p->>'city', NULLIF(btrim(COALESCE(p->>'address', '')), ''),
              ST_SetSRID(ST_MakePoint((p->>'lng')::float8, (p->>'lat')::float8), 4326)::geography,
              'open', 'user', current_date,
              format('使用者在 OpenStreetMap 地圖上標示，審核員確認（建議 #%s）', s.id), s.id)
      RETURNING * INTO after;
      -- 停車：一列類型未知（每個場地剛好一列，跟匯入的場地一樣）
      INSERT INTO place_parking (place_id, type, fee) VALUES (new_id, 'u', 'u');
      INSERT INTO place_field_history (place_id, field, old_value, new_value, new_source, new_verified_at,
                                       note, suggestion_id, changed_by)
      VALUES (new_id, 'status', NULL, 'open', 'user', current_date, '新增場地', s.id, auth.uid());
      UPDATE edit_suggestions SET place_id = new_id WHERE id = s.id;
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

-- ---------- 還原：加上費用、適合年齡 ----------
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
  ELSIF h.field = 'fee' THEN
    IF (before.fee, before.fee_source) IS NOT DISTINCT FROM (h.old_value, h.old_source) THEN
      RAISE EXCEPTION '已經是這個版本';
    END IF;
    UPDATE places SET fee = h.old_value, fee_source = h.old_source,
                      fee_verified_at = h.old_verified_at, updated_at = now()
     WHERE id = h.place_id RETURNING * INTO after;
  ELSIF h.field = 'age' THEN
    IF (age_text(before.age_min, before.age_max), before.age_source)
       IS NOT DISTINCT FROM (h.old_value, h.old_source) THEN
      RAISE EXCEPTION '已經是這個版本';
    END IF;
    UPDATE places SET age_min = NULLIF(split_part(COALESCE(h.old_value, ''), '-', 1), '')::smallint,
                      age_max = NULLIF(split_part(COALESCE(h.old_value, ''), '-', 2), '')::smallint,
                      age_source = h.old_source, age_verified_at = h.old_verified_at, updated_at = now()
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
