// 更新登入 session 的 cookie（存取權杖過期時用 refresh token 換新）。
// 只在需要登入身分的路徑執行；公開頁面（首頁、場地頁）不經過這裡，維持可以快取。
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseEnv } from '@/lib/supabase/env';

export async function proxy(request: NextRequest) {
  const { url, key } = supabaseEnv();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
        // 設定登入 cookie 的回應不能被 CDN 快取，否則可能把別人的 session 給下一個人
        for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
      },
    },
  });
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ['/me/:path*', '/admin/:path*', '/login', '/auth/:path*', '/api/session'],
};
