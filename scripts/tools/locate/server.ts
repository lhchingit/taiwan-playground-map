// 人工定位工具（只在本機使用）：pnpm tool:locate → http://localhost:4100
// 列出找不到座標、比對不確定的清冊資料，點地圖記下座標或標註處理狀態，寫入 data/raw/hsc/manual-review.tsv。
// 只綁定 127.0.0.1，不是網站的一部分，不會部署。之後執行 build_seed.py && import_hccg.py 套用結果。
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import { loadItems, loadPlaces, PATHS, readReviewEntries } from './items';
import { serializeReviewFile, upsertEntry, validateEntry, type ReviewEntry } from './review-file';

const HERE = resolve('scripts/tools/locate');
const MAPLIBRE = resolve('node_modules/maplibre-gl/dist');

const STATIC: Record<string, [string, string]> = {
  '/': [join(HERE, 'index.html'), 'text/html; charset=utf-8'],
  '/app.js': [join(HERE, 'app.js'), 'text/javascript; charset=utf-8'],
  '/vendor/maplibre-gl.mjs': [join(MAPLIBRE, 'maplibre-gl.mjs'), 'text/javascript'],
  '/vendor/maplibre-gl-worker.mjs': [join(MAPLIBRE, 'maplibre-gl-worker.mjs'), 'text/javascript'],
  '/vendor/maplibre-gl.css': [join(MAPLIBRE, 'maplibre-gl.css'), 'text/css'],
};

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function send(res: ServerResponse, status: number, body: unknown, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : (body as Buffer));
}

/** root：資料所在的資料夾（測試時指向暫存副本） */
export function createLocateServer(root: string): Server {
  const reviewPath = join(root, PATHS.review);
  const save = (entries: ReviewEntry[]) => writeFileSync(reviewPath, serializeReviewFile(entries));

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const file = STATIC[url.pathname];
      if (req.method === 'GET' && file) return send(res, 200, readFileSync(file[0]), file[1]);

      if (req.method === 'GET' && url.pathname === '/api/items') {
        return send(res, 200, { items: loadItems(root), places: loadPlaces(root) });
      }

      if (req.method === 'POST' && url.pathname === '/api/review') {
        const b = (await readBody(req)) as Record<string, unknown>;
        const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
        const entry: ReviewEntry = {
          no: String(b.no ?? ''),
          status: String(b.status ?? '') as ReviewEntry['status'],
          lat: num(b.lat),
          lng: num(b.lng),
          basis: String(b.basis ?? ''),
          ref: String(b.ref ?? ''),
          note: String(b.note ?? ''),
          by: String(b.by ?? ''),
          date: today(),
        };
        if (!loadItems(root).some((i) => i.no === entry.no)) {
          return send(res, 400, { errors: [`清單裡沒有清冊編號 ${entry.no}`] });
        }
        const errors = validateEntry(entry);
        if (errors.length > 0) return send(res, 400, { errors });
        save(upsertEntry(readReviewEntries(root), entry));
        return send(res, 200, { ok: true, entry });
      }

      const del = url.pathname.match(/^\/api\/review\/(\d+)$/);
      if (req.method === 'DELETE' && del) {
        save(readReviewEntries(root).filter((e) => e.no !== del[1]));
        return send(res, 200, { ok: true });
      }

      send(res, 404, { error: 'not found' });
    } catch (e) {
      send(res, 500, { errors: [e instanceof Error ? e.message : String(e)] });
    }
  });
}
