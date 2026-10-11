-- 0006_suggestion_dedupe：同一個人對同一個場地的同一個項目，只能有一筆待審建議（P3(c)）
-- 「同一個項目」：屬性看 key、基本資料看欄位；停車、封閉每個場地各算一項。
-- 介面收到違反唯一的錯誤（23505）時顯示「你已經回報過，正在審核中」。審核過後就可以再提交。
CREATE UNIQUE INDEX edit_suggestions_pending_once
  ON edit_suggestions (
    user_id, place_id, kind,
    (CASE kind WHEN 'attribute' THEN payload->>'key' WHEN 'field' THEN payload->>'field' ELSE '' END))
  WHERE status = 'pending' AND user_id IS NOT NULL AND place_id IS NOT NULL;
