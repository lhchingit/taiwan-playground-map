// 把 Supabase 回傳、要導給瀏覽器的網址，從「伺服器連 Supabase 的網址」換成「瀏覽器連 Supabase 的網址」。
// Docker 裡的網站用 host.docker.internal 連 Supabase，但瀏覽器在主機上要用 127.0.0.1（compose.yaml 的 SUPABASE_PUBLIC_URL）。
// 兩者相同、沒設定，或網址不是 Supabase 的，就原樣回傳。
export function toPublicUrl(url: string, internal: string, publicUrl: string | undefined): string {
  if (!publicUrl) return url;
  const from = internal.replace(/\/+$/, '');
  const to = publicUrl.replace(/\/+$/, '');
  if (from === to) return url;
  if (url === from || url.startsWith(`${from}/`) || url.startsWith(`${from}?`)) {
    return to + url.slice(from.length);
  }
  return url;
}
