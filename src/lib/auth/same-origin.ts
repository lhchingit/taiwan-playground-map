// 會改變狀態的 POST（登出、刪除帳號）只接受本站送出的表單，避免被別的網站代送（CSRF）。
// 瀏覽器送出表單時一定會帶 Origin；登入 cookie 本身也是 SameSite=Lax，這裡是第二道檢查。
import type { NextRequest } from 'next/server';
import { requestOrigin } from './origin';

export async function isSameOrigin(request: NextRequest): Promise<boolean> {
  const origin = request.headers.get('origin');
  return origin !== null && origin === (await requestOrigin());
}
