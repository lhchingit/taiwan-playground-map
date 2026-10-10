// 一個縣市的場地（decisions D4）。網址只有縣市代碼，使用者的出發點不會送到伺服器。
// 尚未上線的縣市回傳空陣列（RLS）；不存在的縣市代碼回傳 404。
import { getCityBounds, getCityPlaces } from '@/lib/data';

export async function generateStaticParams() {
  return (await getCityBounds()).map((c) => ({ code: c.code }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!(await getCityBounds()).some((c) => c.code === code)) {
    return Response.json({ error: '沒有這個縣市' }, { status: 404 });
  }
  const places = await getCityPlaces(code);
  return Response.json(places, {
    headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
  });
}
