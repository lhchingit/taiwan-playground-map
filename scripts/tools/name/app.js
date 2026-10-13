// 人工命名工具的頁面程式（瀏覽器端，不經過打包）。資料存取都透過本機伺服器 server.ts。
import * as maplibregl from '/vendor/maplibre-gl.mjs';

maplibregl.setWorkerUrl('/vendor/maplibre-gl-worker.mjs');

const state = { data: null, city: null, index: 0 };
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
const storage = {
  get: (k) => {
    try {
      return localStorage.getItem(k) ?? '';
    } catch {
      return '';
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* 私密視窗等情況：不記也沒關係 */
    }
  },
};

// ---- 地圖：OSM 標準圖磚（公園、學校的名稱看得到）。只有一個人在本機偶爾使用，流量很小。 ----
const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
      },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
  },
  center: [121, 24.5],
  zoom: 7,
  attributionControl: {
    compact: true,
    customAttribution:
      '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>',
  },
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
let markers = [];
const dot = (cls, title) => {
  const d = document.createElement('div');
  d.className = cls;
  if (title) d.title = title;
  return d;
};

const city = () => state.data.cities.find((c) => c.code === state.city);
const items = () => city()?.items ?? [];
const current = () => items()[state.index];

function renderTabs() {
  $('#tabs').innerHTML = state.data.cities
    .map((c) => {
      const left = c.items.filter((i) => !i.done).length;
      return `<button data-city="${c.code}" aria-pressed="${c.code === state.city}">${esc(c.name)} ${left}／${c.items.length}</button>`;
    })
    .join('');
  const all = state.data.cities.flatMap((c) => c.items);
  $('#progress').textContent = `已處理 ${all.filter((i) => i.done).length}／${all.length}`;
  $('#commands').innerHTML = state.data.cities
    .map((c) => `<code>${esc(c.importCmd)}</code>`)
    .join(' ');
}

function renderList() {
  $('#list').innerHTML = items()
    .map((i, n) => {
      const label = i.done
        ? `<span class="done">✓ ${esc(i.done.name)}</span>`
        : `<span class="meta">${i.kind === 'near-official' ? '離官方場地很近' : i.kind === 'odd-name' ? '用地編號' : '沒有名稱'}</span>`;
      return `<li data-n="${n}" aria-selected="${n === state.index}">${esc(i.key)} ${esc(i.district)}<br />${label}</li>`;
    })
    .join('');
  $('#list li[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

function renderItem() {
  const i = current();
  $('#panel').hidden = !i;
  markers.forEach((m) => m.remove());
  markers = [];
  if (!i) return;
  $('#title').textContent = i.key;
  $('#where').textContent = `${city().name} ${i.district}`;
  $('#osmlink').hidden = !i.osmUrl;
  if (i.osmUrl) $('#osmlink').href = i.osmUrl;
  $('#context').hidden = !i.context;
  $('#context').textContent = i.context;
  $('#nearby').innerHTML =
    i.nearby
      .map(
        (h, n) =>
          `<li><button data-hint="${n}">${esc(h.name)} <span class="meta">${esc(h.kind)} ${h.distance_m} 公尺</span></button></li>`,
      )
      .join('') || '<li class="meta">附近沒有有名稱的地點</li>';
  $('#name').value = i.done && i.done.name !== state.data.exclude ? i.done.name : '';
  $('#basis').value = i.done && state.data.bases.includes(i.done.basis) ? i.done.basis : '';
  $('#excludeBox').hidden = !city().allowExclude;
  $('#undo').hidden = !i.done;
  $('#status').textContent = i.done ? `已處理：${i.done.name}（${i.done.basis}）` : '';
  $('#errors').textContent = '';
  markers.push(
    new maplibregl.Marker({ element: dot('pin', '這一處') }).setLngLat([i.lng, i.lat]).addTo(map),
  );
  map.jumpTo({ center: [i.lng, i.lat], zoom: 17 });
  $('#name').focus();
}

function render() {
  renderTabs();
  renderList();
  renderItem();
}

function go(n) {
  state.index = Math.max(0, Math.min(items().length - 1, n));
  render();
}

/** 下一筆還沒處理的；都處理過了就停在下一筆 */
function next() {
  const list = items();
  for (let k = 1; k <= list.length; k++) {
    const n = (state.index + k) % list.length;
    if (!list[n].done) return go(n);
  }
  go(state.index + 1);
}

async function load() {
  state.data = await (await fetch('/api/items')).json();
  if (!state.city) state.city = state.data.cities[0]?.code ?? null;
}

async function post(body) {
  const i = current();
  storage.set('name-tool-by', $('#by').value.trim());
  const res = await fetch('/api/name', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ city: state.city, key: i.key, by: $('#by').value, ...body }),
  });
  const json = await res.json();
  if (!res.ok) {
    $('#errors').textContent = json.errors.join('；');
    return;
  }
  i.done = json.entry;
  next();
}

const save = () => post({ action: 'name', name: $('#name').value, basis: $('#basis').value });
const exclude = () => {
  if (!city().allowExclude) return;
  post({ action: 'exclude', basis: $('#reason').value });
};

// ---- 事件 ----
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-city]');
  if (!b) return;
  state.city = b.dataset.city;
  state.index = 0;
  render();
});
$('#list').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-n]');
  if (li) go(Number(li.dataset.n));
});
$('#nearby').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-hint]');
  if (!b) return;
  const h = current().nearby[Number(b.dataset.hint)];
  $('#name').value = h.name;
  $('#basis').value = 'OSM 地圖上可見的名稱';
  $('#name').focus();
});
$('#save').addEventListener('click', save);
$('#exclude').addEventListener('click', exclude);
$('#skip').addEventListener('click', next);
$('#undo').addEventListener('click', async () => {
  const i = current();
  await fetch(`/api/name?city=${state.city}&key=${encodeURIComponent(i.key)}`, {
    method: 'DELETE',
  });
  i.done = null;
  render();
});
document.addEventListener('keydown', (e) => {
  if (!current()) return;
  const typing = ['INPUT', 'SELECT'].includes(document.activeElement?.tagName ?? '');
  if (e.key === 'Enter') {
    e.preventDefault();
    save();
  } else if (e.key === 'Escape' || (!typing && e.key.toLowerCase() === 'e')) {
    e.preventDefault();
    exclude();
  } else if (!typing && e.key.toLowerCase() === 's') {
    e.preventDefault();
    next();
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    go(state.index + (e.key === 'ArrowDown' ? 1 : -1));
  }
});

await load();
$('#basis').innerHTML =
  '<option value="">（選擇依據）</option>' +
  state.data.bases.map((b) => `<option>${esc(b)}</option>`).join('');
$('#reason').innerHTML = state.data.excludeReasons
  .map((b) => `<option>${esc(b)}</option>`)
  .join('');
$('#by').value = storage.get('name-tool-by');
render();
