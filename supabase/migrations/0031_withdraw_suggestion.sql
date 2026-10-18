-- 0031_withdraw_suggestion：使用者可以撤回自己還沒審核的修正建議（decisions D29，2026-10-18）。
-- 撤回後狀態是 withdrawn（保留紀錄，「我的貢獻」顯示「已撤回」），審核後台不再出現；
-- 待審唯一索引（0006）只看 pending，所以撤回後可以重新回報同一個項目。
-- 只能透過 withdraw_suggestion()：只有本人、只有 pending。不新增 UPDATE policy，審核仍然只能透過 review_suggestion()。

ALTER TABLE edit_suggestions DROP CONSTRAINT edit_suggestions_status_check;
ALTER TABLE edit_suggestions ADD CONSTRAINT edit_suggestions_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn'));

CREATE FUNCTION withdraw_suggestion(p_id bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s edit_suggestions;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '請先登入'; END IF;
  -- 不是自己的跟不存在一樣處理（不透露別人的建議是否存在）；停權的人也可以撤回自己的
  SELECT * INTO s FROM edit_suggestions WHERE id = p_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND OR s.status <> 'pending' THEN RAISE EXCEPTION '這筆建議不存在或已審核'; END IF;
  UPDATE edit_suggestions SET status = 'withdrawn' WHERE id = p_id;
END $$;

REVOKE ALL ON FUNCTION withdraw_suggestion(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION withdraw_suggestion(bigint) TO authenticated;
