// POST /api/revalidate  body: { "city": "hsq" }（可省略）
// Authorization: Bearer <REVALIDATE_SECRET>。沒設定 REVALIDATE_SECRET 時回 404，不暴露這個端點。
// 由 pnpm city launch／unlaunch 與 GitHub Actions 的資料作業呼叫（docs/operations.md）。
import { revalidateTag } from 'next/cache';
import { isAuthorized, revalidationTags } from '@/lib/revalidate';

export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return new Response(null, { status: 404 });
  if (!isAuthorized(req.headers.get('authorization'), secret)) {
    return Response.json({ error: '未授權' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { city?: unknown };
  const tags = revalidationTags(body.city);
  if (!tags) return Response.json({ error: 'city 要是三碼縣市代碼' }, { status: 400 });

  // expire: 0：下一個請求就拿到新資料（例如下線後不能再顯示舊的場地）
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: tags });
}
