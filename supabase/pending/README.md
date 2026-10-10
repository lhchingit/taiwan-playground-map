# 尚未啟用的 migration

`0003_auth_roles.sql`（會員、角色、審核、照片）屬於 P3。P0 先移出 `supabase/migrations/`，避免 P3 還沒審過的 policy（例如 `mod_write`）提早生效。P1 新增了 `0002_public_views.sql`，所以這個檔案改編號為 0003。P3 開工時移回 `migrations/`，並依當時的編號調整。
