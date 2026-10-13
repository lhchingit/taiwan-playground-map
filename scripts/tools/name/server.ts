// 人工命名工具（只在本機使用）：pnpm tool:name → http://localhost:4101
// 列出各縣市沒有名稱（或名稱是用地編號）的遊戲場，在地圖上確認後命名或排除，寫入 data/raw/<縣市>/manual-names.tsv。
// 只綁定 127.0.0.1，不是網站的一部分，不會部署。之後重新執行該縣市的匯入腳本套用結果。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { CITIES, loadAll, loadItems, namesPath, readNames } from './items';
import {
  BASES,
  EXCLUDE,
  EXCLUDE_REASONS,
  serializeNamesFile,
  upsertName,
  validateName,
  type NameEntry,
} from './names-file';

const HERE = resolve('scripts/tools/name');
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

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>;
}

function send(res: ServerResponse, status: number, body: unknown, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : (body as Buffer));
}

/** root：資料所在的資料夾（測試時指向暫存副本） */
export function createNameServer(root: string): Server {
  const save = (city: string, entries: NameEntry[]) => {
    const c = CITIES.find((x) => x.code === city)!;
    const path = join(root, namesPath(city));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, serializeNamesFile(entries, c.key));
  };

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const file = STATIC[url.pathname];
      if (req.method === 'GET' && file) return send(res, 200, readFileSync(file[0]), file[1]);

      if (req.method === 'GET' && url.pathname === '/api/items') {
        return send(res, 200, {
          bases: BASES,
          excludeReasons: EXCLUDE_REASONS,
          exclude: EXCLUDE,
          cities: loadAll(root).map(({ city, items }) => ({ ...city, items })),
        });
      }

      if (req.method === 'POST' && url.pathname === '/api/name') {
        const b = await readBody(req);
        const city = CITIES.find((c) => c.code === String(b.city ?? ''));
        if (!city) return send(res, 400, { errors: ['沒有這個縣市'] });
        const exclude = b.action === 'exclude';
        const entry: NameEntry = {
          key: String(b.key ?? '').trim(),
          name: exclude ? EXCLUDE : String(b.name ?? '').trim(),
          basis: String(b.basis ?? '').trim(),
          by: String(b.by ?? '').trim(),
          date: today(),
        };
        if (!loadItems(root, city.code).some((i) => i.key === entry.key)) {
          return send(res, 400, { errors: [`待處理清單裡沒有 ${entry.key}`] });
        }
        const errors = validateName(entry, { allowExclude: city.allowExclude });
        if (errors.length > 0) return send(res, 400, { errors });
        save(city.code, upsertName(readNames(root, city.code), entry));
        return send(res, 200, { ok: true, entry });
      }

      if (req.method === 'DELETE' && url.pathname === '/api/name') {
        const city = CITIES.find((c) => c.code === url.searchParams.get('city'));
        if (!city) return send(res, 400, { errors: ['沒有這個縣市'] });
        const key = url.searchParams.get('key') ?? '';
        save(
          city.code,
          readNames(root, city.code).filter((e) => e.key !== key),
        );
        return send(res, 200, { ok: true });
      }

      send(res, 404, { error: 'not found' });
    } catch (e) {
      send(res, 500, { errors: [e instanceof Error ? e.message : String(e)] });
    }
  });
}
