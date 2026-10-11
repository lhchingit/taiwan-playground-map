// 頁首與「回報修正」用：目前登入的人（只有暱稱、角色、是否同意條款）＋可以用的登入方式、Turnstile 的公開 site key。不能快取。
import { NextResponse } from 'next/server';
import { authProviders } from '@/lib/auth/providers';
import { currentUser } from '@/lib/auth/session';
import { supabaseAuth } from '@/lib/supabase/auth';
import { turnstileSiteKey } from '@/lib/turnstile';

export async function GET() {
  const user = await currentUser(await supabaseAuth());
  return NextResponse.json(
    {
      user: user && {
        name: user.name,
        role: user.role,
        banned: user.banned,
        termsAccepted: user.termsAccepted,
      },
      providers: await authProviders(),
      turnstileSiteKey: turnstileSiteKey(),
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
