'use server';
// 送出修正建議：Turnstile 驗證 → （第一次）同意服務條款 → 以登入身分經 RLS 寫入 edit_suggestions（待審）。
// 不使用 service role key；審核只能透過資料庫的 review_suggestion()（CLAUDE.md 權限規則）。
import { headers } from 'next/headers';
import { getAttributeCatalog } from '@/lib/data';
import { parseSuggestion, submitErrorMessage } from '@/lib/suggestions/form';
import { supabaseAuth } from '@/lib/supabase/auth';
import { turnstileSiteKey, verifyTurnstile } from '@/lib/turnstile';

export interface ReportState {
  status: 'idle' | 'sent' | 'error';
  message: string;
}

async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get('cf-connecting-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
}

export async function submitSuggestion(
  _prev: ReportState,
  formData: FormData,
): Promise<ReportState> {
  const fail = (message: string): ReportState => ({ status: 'error', message });
  const fields = Object.fromEntries(
    [...formData.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : undefined]),
  );
  const placeId = fields.place_id ?? '';
  if (!/^[a-z0-9-]{1,80}$/.test(placeId)) return fail('找不到這個場地。');

  const supabase = await supabaseAuth();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return fail('請先登入。');

  const catalog = await getAttributeCatalog();
  const parsed = parseSuggestion(fields, catalog.order);
  if (!parsed.ok) return fail(parsed.error);

  if (!turnstileSiteKey()) return fail('目前暫停回報，請稍後再試。');
  if (!(await verifyTurnstile(fields['cf-turnstile-response'] ?? null, await clientIp()))) {
    return fail('驗證沒有通過，請再試一次。');
  }

  // 第一次提交：同意服務條款（時間由資料庫設成伺服器時間）
  const { data: profile } = await supabase
    .from('profiles')
    .select('terms_accepted_at')
    .eq('id', userId)
    .maybeSingle();
  if (!profile) return fail('請先登入。');
  if (!profile.terms_accepted_at) {
    if (fields.agree !== 'on') return fail('第一次回報前，請先勾選同意服務條款。');
    const { error } = await supabase
      .from('profiles')
      .update({ terms_accepted_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) return fail('目前不能回報：帳號可能已停權。');
  }

  const { error } = await supabase.from('edit_suggestions').insert({
    user_id: userId,
    place_id: placeId,
    kind: parsed.kind,
    payload: parsed.payload,
  });
  if (error) return fail(submitErrorMessage(error));
  return { status: 'sent', message: '已收到你的修正建議，審核通過後會更新。' };
}
