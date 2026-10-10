// 頁首與「回報修正」用：目前登入的人（只有暱稱與角色）＋可以用的登入方式。不能快取。
import { NextResponse } from 'next/server';
import { authProviders } from '@/lib/auth/providers';
import { currentUser } from '@/lib/auth/session';
import { supabaseAuth } from '@/lib/supabase/auth';

export async function GET() {
  const user = await currentUser(await supabaseAuth());
  return NextResponse.json(
    {
      user: user && { name: user.name, role: user.role, banned: user.banned },
      providers: await authProviders(),
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
