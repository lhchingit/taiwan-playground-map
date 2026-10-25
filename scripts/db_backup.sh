#!/usr/bin/env bash
# 正式資料庫備份：supabase db dump（roles／schema／data）→ tar.gz → age 加密，只留下加密檔。
# 本機與 GitHub Actions（.github/workflows/db-backup.yml）共用；還原方式見 docs/operations.md。
#
#   BACKUP_DATABASE_URL=... BACKUP_AGE_RECIPIENT=age1... bash scripts/db_backup.sh <輸出目錄>
#
# 連線要用 Session pooler（埠 5432）或直連，不要用 Transaction pooler（埠 6543）。
# 備份裡有會員資料（auth.users），未加密的檔案只放在暫存目錄，結束時一定刪掉；不印出連線字串與資料內容。
set -euo pipefail

out_dir="${1:?用法：bash scripts/db_backup.sh <輸出目錄>}"
: "${BACKUP_DATABASE_URL:?沒有設定 BACKUP_DATABASE_URL（Session pooler 連線字串）}"
: "${BACKUP_AGE_RECIPIENT:?沒有設定 BACKUP_AGE_RECIPIENT（age 公鑰）}"
case "$BACKUP_AGE_RECIPIENT" in
  age1*) ;;
  *) echo "BACKUP_AGE_RECIPIENT 不是 age 公鑰（應該以 age1 開頭）" >&2; exit 1 ;;
esac
AGE="${AGE:-age}"
command -v "$AGE" >/dev/null || { echo "找不到 age（https://github.com/FiloSottile/age）" >&2; exit 1; }

name="playmap-db-$(date -u +%Y%m%d-%H%M)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/$name" "$out_dir"

dump() { pnpm exec supabase db dump --db-url "$BACKUP_DATABASE_URL" "$@" >/dev/null; }
dump -f "$work/$name/roles.sql" --role-only
dump -f "$work/$name/schema.sql"
dump -f "$work/$name/data.sql" --data-only --use-copy

for f in roles schema data; do
  [ -s "$work/$name/$f.sql" ] || { echo "$f.sql 是空的，備份失敗" >&2; exit 1; }
done
grep -q 'COPY "public"."places"' "$work/$name/data.sql" || { echo "data.sql 沒有 public.places，備份失敗" >&2; exit 1; }

tar -czf "$work/$name.tar.gz" -C "$work" "$name"
"$AGE" -r "$BACKUP_AGE_RECIPIENT" -o "$out_dir/$name.tar.gz.age" "$work/$name.tar.gz"
echo "已備份：$out_dir/$name.tar.gz.age（$(wc -c < "$out_dir/$name.tar.gz.age") bytes，已加密）"
