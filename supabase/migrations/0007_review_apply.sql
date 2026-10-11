-- 0007_review_apply：審核後台（P3(e1)）
-- - 基本欄位（開放時間、地面材質、狀態）也記錄來源與確認日期，並留下修改紀錄
-- - 核准時審核員可以先修改內容（review_suggestion 的 p_payload），在同一個交易裡套用（decisions D15）
-- - 封閉或維修：場地狀態改成維修中／已封閉，記錄預計恢復日期；reopen_place() 恢復開放
-- - 審核員讀得到負責縣市（含未上線）的場地、屬性、停車，才能對照目前的值

-- ---------- 基本欄位的來源 ----------
ALTER TABLE places
  ADD COLUMN hours_source        text REFERENCES sources(id),
  ADD COLUMN hours_verified_at   date,
  ADD COLUMN surface_source      text REFERENCES sources(id),
  ADD COLUMN surface_verified_at date,
  ADD COLUMN status_source       text REFERENCES sources(id),
  ADD COLUMN status_verified_at  date,
  ADD COLUMN status_until        date,          -- 維修中／已封閉時的預計恢復日期
  ADD COLUMN status_note         text;          -- 維修中／已封閉的原因

-- 實際套用的內容（審核員可能修改過）；原始建議 payload 不變
ALTER TABLE edit_suggestions ADD COLUMN applied_payload jsonb;

-- ---------- 基本欄位的修改紀錄 ----------
CREATE TABLE place_field_history (
  id            bigserial PRIMARY KEY,
  place_id      text NOT NULL,
  field         text NOT NULL CHECK (field IN ('hours','surface','status')),
  old_value     text, new_value text,
  old_source    text, new_source text,
  note          text,
  suggestion_id bigint,                       -- 由哪一筆建議套用；恢復開放等審核員操作為 NULL
  changed_by    uuid,
  changed_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX place_field_history_place_idx ON place_field_history (place_id, changed_at DESC);
ALTER TABLE place_field_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY mod_read ON place_field_history FOR SELECT TO authenticated
  USING (can_moderate(place_city(place_id)));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON place_field_history FROM anon, authenticated;

-- ---------- 審核員讀得到負責縣市的資料（含未上線縣市） ----------
CREATE POLICY mod_read ON places FOR SELECT TO authenticated USING (can_moderate(city));
CREATE POLICY mod_read ON place_attributes FOR SELECT TO authenticated
  USING (can_moderate(place_city(place_id)));
CREATE POLICY mod_read ON place_parking FOR SELECT TO authenticated
  USING (can_moderate(place_city(place_id)));

-- ---------- 建議內容的格式檢查（新增建議與核准時共用） ----------
CREATE OR REPLACE FUNCTION check_suggestion_payload(p_kind text, p_place_id text, p jsonb)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    IF p->>'field' IS NULL OR p->>'field' NOT IN ('hours','surface') THEN
      RAISE EXCEPTION '這個欄位不能回報：%', p->>'field';
    END IF;
    IF COALESCE(btrim(p->>'value'), '') = '' OR char_length(p->>'value') > 100 THEN
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
END $$;

CREATE OR REPLACE FUNCTION validate_suggestion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM check_suggestion_payload(NEW.kind, NEW.place_id, NEW.payload);
  RETURN NEW;
END $$;

-- ---------- 審核：核准時可以用審核員修改過的內容（p_payload）套用 ----------
DROP FUNCTION review_suggestion(bigint, boolean, text, text);
CREATE FUNCTION review_suggestion(p_id bigint, p_accept boolean,
                                  p_reason text DEFAULT NULL, p_note text DEFAULT NULL,
                                  p_payload jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s edit_suggestions;
  p jsonb;
  f text;
  v_status text;
  v_old text;
  v_old_src text;
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
    ELSIF s.kind = 'field' THEN
      f := p->>'field';
      IF f = 'hours' THEN
        SELECT hours, hours_source INTO v_old, v_old_src FROM places WHERE id = s.place_id;
        UPDATE places SET hours = p->>'value', hours_source = 'user', hours_verified_at = current_date,
                          updated_at = now()
         WHERE id = s.place_id;
      ELSE
        SELECT surface, surface_source INTO v_old, v_old_src FROM places WHERE id = s.place_id;
        UPDATE places SET surface = p->>'value', surface_source = 'user', surface_verified_at = current_date,
                          updated_at = now()
         WHERE id = s.place_id;
      END IF;
      INSERT INTO place_field_history
        (place_id, field, old_value, new_value, old_source, new_source, suggestion_id, changed_by)
      VALUES (s.place_id, f, v_old, p->>'value', v_old_src, 'user', s.id, auth.uid());
    ELSIF s.kind = 'closure' THEN
      v_status := COALESCE(p->>'status', 'maintenance');
      SELECT status, status_source INTO v_old, v_old_src FROM places WHERE id = s.place_id;
      UPDATE places SET status = v_status, status_until = (p->>'until')::date, status_note = p->>'reason',
                        status_source = 'user', status_verified_at = current_date, updated_at = now()
       WHERE id = s.place_id;
      INSERT INTO place_field_history
        (place_id, field, old_value, new_value, old_source, new_source, note, suggestion_id, changed_by)
      VALUES (s.place_id, 'status', v_old, v_status, v_old_src, 'user', p->>'reason', s.id, auth.uid());
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

-- ---------- 恢復開放（審核員確認維修結束） ----------
CREATE OR REPLACE FUNCTION reopen_place(p_place_id text, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old text; v_old_src text;
BEGIN
  SELECT status, status_source INTO v_old, v_old_src FROM places WHERE id = p_place_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '找不到這個場地'; END IF;
  IF NOT can_moderate(place_city(p_place_id)) THEN RAISE EXCEPTION '沒有審核權限'; END IF;
  IF v_old NOT IN ('maintenance','closed') THEN RAISE EXCEPTION '這個場地沒有標示維修中或已封閉'; END IF;
  UPDATE places SET status = 'open', status_until = NULL, status_note = NULL,
                    status_source = 'user', status_verified_at = current_date, updated_at = now()
   WHERE id = p_place_id;
  INSERT INTO place_field_history
    (place_id, field, old_value, new_value, old_source, new_source, note, changed_by)
  VALUES (p_place_id, 'status', v_old, 'open', v_old_src, 'user', p_note, auth.uid());
END $$;

-- ---------- 函式執行權限（同 0004：匿名不能執行；審核相關只給登入的人，函式裡再檢查權限） ----------
REVOKE EXECUTE ON FUNCTION
  check_suggestion_payload(text, text, jsonb),
  review_suggestion(bigint, boolean, text, text, jsonb),
  reopen_place(text, text)
FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION check_suggestion_payload(text, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION
  review_suggestion(bigint, boolean, text, text, jsonb),
  reopen_place(text, text)
TO authenticated;
