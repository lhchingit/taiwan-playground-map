// 場地詳情（首頁詳情面板用），快取 1 小時。不存在或縣市未上線時 404。
import { getLaunchedPlaceParams, getPlaceDetail } from '@/lib/data';

export async function generateStaticParams() {
  return (await getLaunchedPlaceParams()).map(({ id }) => ({ id }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getPlaceDetail(id);
  if (!detail) return Response.json({ error: '找不到這個場地' }, { status: 404 });
  return Response.json(detail, {
    headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
  });
}
