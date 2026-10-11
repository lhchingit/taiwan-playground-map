// 人工定位工具的頁面程式（瀏覽器端，不經過打包）。資料存取都透過本機伺服器 server.ts。
import * as maplibregl from '/vendor/maplibre-gl.mjs';

maplibregl.setWorkerUrl('/vendor/maplibre-gl-worker.mjs');

const STATUS_LABEL = {
  located: '已人工定位',
  confirmed: '已確認比對正確',
  not_found: '找不到',
  abolished: '已廢除',
  pending_visit: '待實地確認',
  duplicate: '重複',
};
// 找不到座標的不會有「比對正確」；待確認的比對可以確認、改定位或標註
const STATUSES = {
  unmatched: ['located', 'not_found', 'abolished', 'pending_visit', 'duplicate'],
  'match-review': ['confirmed', 'located', 'not_found', 'abolished', 'pending_visit', 'duplicate'],
};
const BASES = ['實地確認', 'OSM 地圖上可見的公園範圍', '政府公告的地址'];
const OSM_TYPE = { w: 'way', n: 'node', r: 'relation' };

const state = { items: [], places: [], filter: 'todo', selected: null, pick: null, reviewFile: '' };
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );

// ---- 地圖：預設用 OSM 標準圖磚（公園畫成綠色，方便依「OSM 地圖上可見的公園範圍」定位）；
//      可切換成 OpenFreeMap。只有一個人在本機偶爾使用，流量很小，符合 OSM 圖磚使用政策。 ----
const OSM_STANDARD = {
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
};
const OPENFREEMAP = 'https://tiles.openfreemap.org/styles/positron';
const map = new maplibregl.Map({
  container: 'map',
  style: OSM_STANDARD,
  center: [120.97, 24.8],
  zoom: 12,
  attributionControl: {
    compact: true,
    customAttribution:
      '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>',
  },
});
let standard = true;
document.querySelector('#basemap').addEventListener('click', (e) => {
  standard = !standard;
  map.setStyle(standard ? OSM_STANDARD : OPENFREEMAP);
  e.currentTarget.textContent = standard ? '底圖：OSM 標準' : '底圖：OpenFreeMap';
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

const el = (cls, title) => {
  const d = document.createElement('div');
  d.className = cls;
  if (title) d.title = title;
  return d;
};
let osmMarker = null;
let pickMarker = null;
let placeMarkers = [];

map.on('click', (e) => {
  if (!state.selected) return;
  state.pick = { lat: Number(e.lngLat.lat.toFixed(6)), lng: Number(e.lngLat.lng.toFixed(6)) };
  showPick();
  const status = $('#status');
  if (status && status.value !== 'located') {
    status.value = 'located';
    status.dispatchEvent(new Event('change'));
  }
  const coords = $('#coords');
  if (coords) coords.textContent = `${state.pick.lat}, ${state.pick.lng}`;
});

function showPick() {
  pickMarker?.remove();
  pickMarker = null;
  if (state.pick) {
    pickMarker = new maplibregl.Marker({ element: el('pick', '你點選的位置') })
      .setLngLat([state.pick.lng, state.pick.lat])
      .addTo(map);
  }
}

function drawPlaces() {
  placeMarkers.forEach((m) => m.remove());
  placeMarkers = state.places.map((p) =>
    new maplibregl.Marker({ element: el('dot', `已上地圖：${p.name}`) })
      .setLngLat([p.lng, p.lat])
      .addTo(map),
  );
}

// ---- 清單 ----
const done = (i) => i.review !== null;

function renderList() {
  const shown = state.items.filter(
    (i) => state.filter === 'all' || (state.filter === 'done') === done(i),
  );
  $('#progress').textContent = `已處理 ${state.items.filter(done).length}／${state.items.length}`;
  $('#list').innerHTML =
    shown
      .map(
        (
          i,
        ) => `<li><button type="button" data-no="${i.no}" aria-current="${state.selected === i.no}">
        <span><b>#${i.no} ${esc(i.name)}</b>（${esc(i.district)}）
          <span class="badge">${i.kind === 'unmatched' ? '找不到座標' : '待確認比對'}</span>
          ${i.review ? `<span class="badge done">${STATUS_LABEL[i.review.status]}</span>` : ''}</span>
        <span class="meta">${esc(i.items)}</span></button></li>`,
      )
      .join('') || '<li class="meta" style="padding:8px">沒有項目。</li>';
}

$('#list').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-no]');
  if (b) select(b.dataset.no);
});
document.querySelectorAll('.tabs button').forEach((b) =>
  b.addEventListener('click', () => {
    state.filter = b.dataset.filter;
    document
      .querySelectorAll('.tabs button')
      .forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderList();
  }),
);

// ---- 詳情與表單 ----
function select(no) {
  state.selected = no;
  const i = state.items.find((x) => x.no === no);
  if (!i) return;
  const r = i.review;
  state.pick = r?.status === 'located' ? { lat: r.lat, lng: r.lng } : null;
  showPick();
  osmMarker?.remove();
  osmMarker = null;
  if (i.osm) {
    osmMarker = new maplibregl.Marker({ element: el('osm', `目前的 OSM 比對：${i.osm.id}`) })
      .setLngLat([i.osm.lng, i.osm.lat])
      .addTo(map);
  }
  const center = state.pick ?? i.osm;
  if (center) map.flyTo({ center: [center.lng, center.lat], zoom: 17 });

  const osmLink = i.osm
    ? `<a href="https://www.openstreetmap.org/${OSM_TYPE[i.osm.id[0]] ?? 'way'}/${i.osm.id.slice(1)}" target="_blank" rel="noopener">${esc(i.osm.id)}</a>（${esc(i.osm.method)}，藍點）`
    : '沒有';
  const by = localStorage.getItem('locate.by') ?? '';
  $('#detail').innerHTML = `
    <h2>#${i.no} ${esc(i.name)}</h2>
    <dl>
      <dt>行政區</dt><dd>${esc(i.district)}</dd>
      <dt>清冊遊具</dt><dd>${esc(i.items)}</dd>
      <dt>OSM 比對</dt><dd>${osmLink}</dd>
      ${i.hint ? `<dt>公園資料</dt><dd>地點：${esc(i.hint.location)}；里別：${esc(i.hint.village)}；面積：${esc(i.hint.areaHa)} 公頃</dd>` : '<dt>公園資料</dt><dd class="meta">沒有同名的公園</dd>'}
      ${r ? `<dt>目前結果</dt><dd>${STATUS_LABEL[r.status]}${r.note ? `：${esc(r.note)}` : ''}（${esc(r.by)}，${esc(r.date)}）</dd>` : ''}
    </dl>
    <form id="form">
      <label>處理結果
        <select id="status">${STATUSES[i.kind].map((s) => `<option value="${s}" ${r?.status === s ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`).join('')}</select>
      </label>
      <div id="located-fields">
        <p class="meta">在地圖上點選位置（橘點）：<b id="coords">${state.pick ? `${state.pick.lat}, ${state.pick.lng}` : '還沒點選'}</b></p>
        <label>定位依據
          <select id="basis"><option value="">請選擇</option>${BASES.map((b) => `<option ${r?.basis === b ? 'selected' : ''}>${b}</option>`).join('')}</select>
        </label>
      </div>
      <label id="ref-field">對應的清冊編號（同一處）<input id="ref" inputmode="numeric" value="${esc(r?.ref ?? '')}" /></label>
      <label>說明<input id="note" value="${esc(r?.note ?? '')}" placeholder="例：公園範圍在南勢街旁的綠地" /></label>
      <label>定位者<input id="by" value="${esc(by)}" required /></label>
      <div style="display:flex; gap:6px">
        <button class="btn primary" type="submit">儲存</button>
        ${r ? '<button class="btn" type="button" id="clear">清除結果</button>' : ''}
      </div>
      <p id="msg" role="status"></p>
    </form>`;

  const sync = () => {
    const s = $('#status').value;
    $('#located-fields').hidden = s !== 'located';
    $('#ref-field').hidden = s !== 'duplicate';
  };
  $('#status').addEventListener('change', sync);
  sync();
  $('#form').addEventListener('submit', save);
  $('#clear')?.addEventListener('click', clear);
  renderList();
}

async function save(e) {
  e.preventDefault();
  const by = $('#by').value.trim();
  localStorage.setItem('locate.by', by);
  const status = $('#status').value;
  const res = await fetch('/api/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      no: state.selected,
      status,
      lat: status === 'located' ? (state.pick?.lat ?? null) : null,
      lng: status === 'located' ? (state.pick?.lng ?? null) : null,
      basis: $('#basis').value,
      ref: $('#ref').value.trim(),
      note: $('#note').value,
      by,
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    $('#msg').className = 'errors';
    $('#msg').textContent = body.errors.join('；');
    return;
  }
  await load();
  select(state.selected);
  $('#msg').className = 'ok';
  $('#msg').textContent = `已儲存到 ${state.reviewFile}`;
}

async function clear() {
  await fetch(`/api/review/${state.selected}`, { method: 'DELETE' });
  await load();
  select(state.selected);
}

// ---- 地址搜尋：只用來移動地圖，座標仍要在地圖上點選 ----
$('#search').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#q').value.trim();
  if (!q) return;
  const params = new URLSearchParams({
    format: 'jsonv2',
    countrycodes: 'tw',
    'accept-language': 'zh-TW',
    limit: '5',
    q,
  });
  try {
    const r = await (await fetch(`https://nominatim.openstreetmap.org/search?${params}`)).json();
    $('#results').innerHTML = r.length
      ? r
          .map(
            (x, k) =>
              `<button type="button" class="result" data-k="${k}">${esc(x.display_name)}</button>`,
          )
          .join('')
      : '<span class="meta">找不到。</span>';
    $('#results').onclick = (ev) => {
      const b = ev.target.closest('button[data-k]');
      if (!b) return;
      const x = r[Number(b.dataset.k)];
      map.flyTo({ center: [Number(x.lon), Number(x.lat)], zoom: 17 });
      $('#results').innerHTML = '';
    };
  } catch {
    $('#results').innerHTML = '<span class="meta">地址搜尋連不上。</span>';
  }
});

async function load() {
  const data = await (await fetch('/api/items')).json();
  state.items = data.items;
  state.reviewFile = data.reviewFile;
  if (state.places.length === 0) {
    state.places = data.places;
    drawPlaces();
    // 地圖移到這個縣市（已經上地圖的場地範圍）
    if (data.places.length > 0) {
      const lngs = data.places.map((p) => p.lng);
      const lats = data.places.map((p) => p.lat);
      map.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 40, duration: 0 },
      );
    }
  }
  renderList();
}

load();
