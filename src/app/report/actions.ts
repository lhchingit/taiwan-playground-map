'use server';
// 送出修正建議、回報新場地：Turnstile 驗證 → （第一次）同意服務條款 → 以登入身分經 RLS 寫入 edit_suggestions（待審）。
// 不使用 service role key；審核只能透過資料庫的 review_suggestion()（CLAUDE.md 權限規則）。
import { headers } from 'next/headers';
import { launchedCityAt } from '@/lib/cities';
import { getAttributeCatalog, getCityBounds } from '@/lib/data';
import { parseNewPlace, parseSuggestion, submitErrorMessage } from '@/lib/suggestions/form';
import { supabaseAuth, type AuthClient } from '@/lib/supabase/auth';
import { turnstileSiteKey, verifyTurnstile } from '@/lib/turnstile';
import type { Json } from '@/types/database';

export interface ReportState {
  status: 'idle' | 'sent' | 'error';
  message: string;
  /** 同一個項目已經有自己的待審建議時，那一筆的 id（可以直接撤回，decisions D29） */
  pendingId?: number;
}

type Fields = Record<string, string | undefined>;

const fail = (message: string): ReportState => ({ status: 'error', message });

async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get('cf-connecting-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
}

function toFields(formData: FormData): Fields {
  return Object.fromEntries(
    [...formData.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : undefined]),
  );
}

/** 共用：登入、Turnstile、（第一次）同意服務條款。通過時回傳 client 與使用者 id */
async function prepare(
  fields: Fields,
): Promise<{ ok: true; supabase: AuthClient; userId: string } | { ok: false; state: ReportState }> {
  const supabase = await supabaseAuth();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, state: fail('請先登入。') };

  if (!turnstileSiteKey()) return { ok: false, state: fail('目前暫停回報，請稍後再試。') };
  if (!(await verifyTurnstile(fields['cf-turnstile-response'] ?? null, await clientIp()))) {
    return { ok: false, state: fail('驗證沒有通過，請再試一次。') };
  }

  // 第一次提交：同意服務條款（時間由資料庫設成伺服器時間）
  const { data: profile } = await supabase
    .from('profiles')
    .select('terms_accepted_at')
    .eq('id', userId)
    .maybeSingle();
  if (!profile) return { ok: false, state: fail('請先登入。') };
  if (!profile.terms_accepted_at) {
    if (fields.agree !== 'on') {
      return { ok: false, state: fail('第一次回報前，請先勾選同意服務條款。') };
    }
    const { error } = await supabase
      .from('profiles')
      .update({ terms_accepted_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) return { ok: false, state: fail('目前不能回報：帳號可能已停權。') };
  }
  return { ok: true, supabase, userId };
}

async function insert(
  supabase: AuthClient,
  row: { user_id: string; place_id: string | null; kind: string; payload: NonNullable<Json> },
  sent: string,
): Promise<ReportState> {
  const { error } = await supabase.from('edit_suggestions').insert(row);
  if (error?.code === '23505' && row.place_id) {
    // 同一個項目已經有待審建議（0006）：找出自己那一筆，讓使用者可以撤回後重新送出
    const payload = row.payload as Record<string, unknown>;
    let q = supabase
      .from('edit_suggestions')
      .select('id')
      .eq('user_id', row.user_id)
      .eq('place_id', row.place_id)
      .eq('kind', row.kind)
      .eq('status', 'pending');
    if (row.kind === 'attribute') q = q.eq('payload->>key', String(payload.key));
    if (row.kind === 'field') q = q.eq('payload->>field', String(payload.field));
    const { data } = await q.limit(1).maybeSingle();
    return { ...fail(submitErrorMessage(error)), ...(data && { pendingId: data.id }) };
  }
  if (error) return fail(submitErrorMessage(error));
  return { status: 'sent', message: sent };
}

export async function submitSuggestion(
  _prev: ReportState,
  formData: FormData,
): Promise<ReportState> {
  const fields = toFields(formData);
  const placeId = fields.place_id ?? '';
  if (!/^[a-z0-9-]{1,80}$/.test(placeId)) return fail('找不到這個場地。');
  const catalog = await getAttributeCatalog();
  const parsed = parseSuggestion(fields, catalog.order);
  if (!parsed.ok) return fail(parsed.error);

  const ready = await prepare(fields);
  if (!ready.ok) return ready.state;
  return insert(
    ready.supabase,
    { user_id: ready.userId, place_id: placeId, kind: parsed.kind, payload: parsed.payload },
    '已收到你的修正建議，審核通過後會更新。',
  );
}

/** 回報新場地：位置所在的縣市由伺服器依已上線縣市的範圍判斷（不信任瀏覽器送來的縣市） */
export async function submitNewPlace(_prev: ReportState, formData: FormData): Promise<ReportState> {
  const fields = toFields(formData);
  const point = { lat: Number(fields.lat), lng: Number(fields.lng) };
  const city =
    Number.isFinite(point.lat) && Number.isFinite(point.lng)
      ? launchedCityAt(point, await getCityBounds())
      : null;
  const parsed = parseNewPlace(fields, city?.code ?? null);
  if (!parsed.ok) return fail(parsed.error);

  const ready = await prepare(fields);
  if (!ready.ok) return ready.state;
  return insert(
    ready.supabase,
    {
      user_id: ready.userId,
      place_id: null,
      kind: 'new_place',
      payload: parsed.payload as unknown as NonNullable<Json>,
    },
    '已收到你的回報，審核通過後會出現在地圖上。',
  );
}
