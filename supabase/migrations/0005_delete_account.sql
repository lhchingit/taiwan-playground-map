-- 0005_delete_account：會員自己刪除帳號（P3(b)，「我的貢獻」頁）
-- 刪除 auth.users 那一列：profiles、照片紀錄跟著刪（ON DELETE CASCADE），
-- 已採納的建議保留，但 user_id 變成 NULL、不再顯示提交者（edit_suggestions_user_fk ON DELETE SET NULL）。
-- 以擁有者權限執行，只能刪除 auth.uid() 自己，網站不需要 service role key。
-- 被停權的人也可以刪除自己的帳號（個人資料的刪除權不因停權而失去）。
-- Storage 裡的照片檔案在 P3(d) 一併清除。
CREATE OR REPLACE FUNCTION delete_my_account() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION '請先登入'; END IF;
  DELETE FROM auth.users WHERE id = uid;
END $$;

REVOKE EXECUTE ON FUNCTION delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_my_account() TO authenticated;
