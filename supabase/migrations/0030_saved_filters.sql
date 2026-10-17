-- 0030_saved_filters：登入的使用者可以儲存篩選條件，最多 5 組（decisions D27，2026-10-17）。
-- query 存的是分享網址的 query string（filtersToQuery()），出發點本來就不在裡面，不會存到任何位置。
-- 只有本人看得到、改得了名稱、刪得掉；刪除帳號時一起刪除。上限由 trigger 把關（同一個人上鎖，同時送出也擋得住）。
-- 停權的人也可以存：這是個人設定，不是公開內容；也不需要先同意服務條款。

CREATE TABLE saved_filters (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 20 AND name = btrim(name)),
  query      text NOT NULL CHECK (char_length(query) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX saved_filters_user_idx ON saved_filters (user_id, created_at);

ALTER TABLE saved_filters ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_select ON saved_filters FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY own_insert ON saved_filters FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY own_update ON saved_filters FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY own_delete ON saved_filters FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 匿名完全不能存取；登入的人只能新增名稱與條件、只能改名稱
REVOKE ALL ON saved_filters FROM anon, authenticated;
GRANT SELECT, DELETE ON saved_filters TO authenticated;
GRANT INSERT (name, query) ON saved_filters TO authenticated;
GRANT UPDATE (name) ON saved_filters TO authenticated;

CREATE OR REPLACE FUNCTION saved_filters_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('saved_filters:' || NEW.user_id::text));
  IF (SELECT count(*) FROM saved_filters WHERE user_id = NEW.user_id) >= 5 THEN
    RAISE EXCEPTION 'saved_filters_limit' USING HINT = '最多 5 組，請先刪掉一組。';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION saved_filters_limit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER saved_filters_limit BEFORE INSERT ON saved_filters
  FOR EACH ROW EXECUTE FUNCTION saved_filters_limit();
