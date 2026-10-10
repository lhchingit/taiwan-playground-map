/** 網站的正式網址（canonical、sitemap、JSON-LD 用）。上線時設定 SITE_URL。 */
export function siteUrl(): string {
  return (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}
