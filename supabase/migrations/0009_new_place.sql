-- 0009_new_place：核准「新增場地」的建議（P3(c2)）
-- - 新場地的 id：<縣市>-user-<編號>（decisions D12 的格式；編號來自 user_place_seq）
-- - 座標是使用者在本站 OpenStreetMap 底圖上標示、審核員確認後的位置（decisions D19），coord_source 記錄來源
-- - 核准後立即上地圖：只有名稱、地址、座標；屬性全是未知，停車一列（類型未知），跟匯入的場地一樣

ALTER TABLE places ADD COLUMN created_from_suggestion bigint;   -- 由哪一筆建議建立（匯入的場地是 NULL）
CREATE SEQUENCE user_place_seq;

-- ---------- 格式檢查：新增場地補上名稱、地址長度與縣市範圍 ----------
CREATE OR REPLACE FUNCTION check_suggestion_payload(p_kind text, p_place_id text, p jsonb)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b numeric[];
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

-- ---------- 審核：核准新增場地時建立場地 ----------
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
