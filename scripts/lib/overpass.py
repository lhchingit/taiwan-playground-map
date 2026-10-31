"""Overpass API（OpenStreetMap 查詢）。公開主機忙碌時會回 429／5xx：等一下再試。只有 fetch／locate 腳本使用，匯入不連網路。"""
import json
import time
import urllib.error
import urllib.parse
import urllib.request

from lib.geo import distance_m
from lib.opendata import USER_AGENT

OVERPASS = "https://overpass-api.de/api/interpreter"
# is_in 一次查幾個點（太多會逾時）
BATCH = 10


def overpass(q, tries=5):
    """回傳 (原始位元組, 解析後的 JSON)"""
    for i in range(tries):
        req = urllib.request.Request(
            OVERPASS, data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": USER_AGENT}
        )
        try:
            with urllib.request.urlopen(req, timeout=240) as r:
                raw = r.read()
            return raw, json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or i == tries - 1:
                raise
            time.sleep(15 * (i + 1))
    raise RuntimeError("unreachable")


def is_in_query(points, levels="7|8"):
    """每個點前面放一個 marker，回應依序是 marker、所在的公園、所在的行政區（levels：admin_level，預設鄉鎮市）"""
    parts = ["[out:json][timeout:180];"]
    for r, (lat, lon) in points:
        parts.append(
            f'make marker ref="{r}";out;'
            f"is_in({lat},{lon})->.x;"
            'area.x["leisure"="park"]["name"];out tags;'
            f'area.x["boundary"="administrative"]["admin_level"~"^({levels})$"];out tags;'
        )
    return "".join(parts)


def parse_is_in(elements):
    """{點的 ref: {"parks": [{"area", "name"}], "districts": [{"level", "name"}]}}"""
    out, cur = {}, None
    for e in elements:
        t = e.get("tags", {})
        if e["type"] == "marker":
            cur = out.setdefault(t["ref"], {"parks": [], "districts": []})
        elif cur is not None and t.get("leisure") == "park":
            cur["parks"].append({"area": e["id"], "name": t.get("name", "")})
        elif cur is not None and t.get("boundary") == "administrative":
            cur["districts"].append({"level": int(t.get("admin_level", 0)), "name": t.get("name", "")})
    return out


def batched(points, query, parse):
    """分批查詢：query(一批點) → Overpass 回應；parse(elements) → {ref: …}。
    一批一直逾時（公開主機忙碌、範圍大的縣市）時拆成兩半再查，直到一次一個點；一個點也查不到才放棄。"""
    out = {}

    def run(batch):
        time.sleep(2)  # Overpass 的使用規範：不要連續大量查詢
        try:
            out.update(parse(query(batch)["elements"]))
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or len(batch) == 1:
                raise
            half = len(batch) // 2
            run(batch[:half])
            run(batch[half:])

    for i in range(0, len(points), BATCH):
        run(points[i:i + BATCH])
    return out


def within(points, query=None):
    """[(ref, (lat, lon))] → {ref: {"parks": […], "districts": […]}}"""
    query = query or (lambda batch: overpass(is_in_query(batch), tries=3)[1])
    return batched(points, query, parse_is_in)


# 命名工具的提示：附近有名稱的地點（scripts/fetch_osm_nearby.py）
NEARBY_KINDS = [
    ("leisure", "^(park|playground|garden)$"),
    ("amenity", "^(school|kindergarten|community_centre)$"),
    ("landuse", "^residential$"),
    ("place", "^(neighbourhood|quarter)$"),
]
KIND_LABEL = {
    "park": "公園", "playground": "遊戲場", "garden": "花園", "school": "學校", "kindergarten": "幼兒園",
    "community_centre": "社區活動中心", "residential": "住宅區", "neighbourhood": "鄰里", "quarter": "鄰里",
}
NEARBY_MAX = 8


def nearby_query(points, radius=150):
    """每個點前面放一個 marker，回應依序是 marker、附近有名稱的地點（中心點與標籤）"""
    parts = ["[out:json][timeout:180];"]
    for r, (lat, lon) in points:
        around = f"(around:{radius},{lat},{lon})"
        union = "".join(f'nwr{around}["name"]["{k}"~"{v}"];' for k, v in NEARBY_KINDS)
        parts.append(f'make marker ref="{r}";out;({union});out center tags;')
    return "".join(parts)


def kind_of(tags):
    for k, _ in NEARBY_KINDS:
        if tags.get(k) in KIND_LABEL:
            return KIND_LABEL[tags[k]]
    return "其他"


def parse_nearby(elements, coords, own=None):
    """coords：{ref: (lat, lon)}；own：{ref: 遊戲場本身的 OSM ref}（不列自己）。
    → {ref: [{name, kind, osm, distance_m}]}，依距離排序，每個點最多 NEARBY_MAX 個，同一個 OSM 物件只列一次"""
    out, cur = {}, None
    for e in elements:
        t = e.get("tags", {})
        if e["type"] == "marker":
            cur = t["ref"]
            out.setdefault(cur, [])
            continue
        if cur is None or not t.get("name"):
            continue
        ref = f"{e['type'][0]}{e['id']}"
        if ref == (own or {}).get(cur) or any(x["osm"] == ref for x in out[cur]):
            continue
        c = e.get("center", e)
        if "lat" not in c:
            continue
        out[cur].append({"name": t["name"].strip(), "kind": kind_of(t), "osm": ref,
                         "distance_m": round(distance_m(coords[cur], (c["lat"], c["lon"])))})
    for ref, items in out.items():
        out[ref] = sorted(items, key=lambda x: (x["distance_m"], x["osm"]))[:NEARBY_MAX]
    return out


# 自動排除：遊戲場位在學校、幼兒園、政府機關、研究機構、軍營的範圍內（scripts/fetch_osm_institutions.py，decisions D20）。
# 大學、專科（university／college）不算：多數校園對外開放。研究機構（含民間研發園區）也不對外開放，一併排除。
INSTITUTION_KINDS = [
    ("amenity", "^(kindergarten|school)$"),
    ("amenity", "^(townhall|police|fire_station)$"),
    ("office", "^(government|research)$"),
    ("landuse", "^military$"),
]
INSTITUTION_LABEL = {
    "kindergarten": "幼兒園", "school": "學校", "townhall": "政府機關", "police": "警察局", "fire_station": "消防隊",
    "government": "政府機關", "research": "研究機構", "military": "軍營",
}


def institution_query(points):
    """每個點前面放一個 marker，回應依序是 marker、所在的學校／機關區域（有沒有名稱都算）"""
    parts = ["[out:json][timeout:180];"]
    for r, (lat, lon) in points:
        parts.append(f'make marker ref="{r}";out;is_in({lat},{lon})->.x;')
        parts.append("".join(f'area.x["{k}"~"{v}"];out tags;' for k, v in INSTITUTION_KINDS))
    return "".join(parts)


def area_ref(e):
    """is_in 回傳的區域 → OSM ref。新版 Overpass 直接回傳 way／relation；
    舊版回傳 area，id 是 way 加 2400000000、relation 加 3600000000"""
    if e["type"] in ("way", "relation"):
        return f"{e['type'][0]}{e['id']}"
    return f"r{e['id'] - 3600000000}" if e["id"] >= 3600000000 else f"w{e['id'] - 2400000000}"


def institution_kind(tags):
    return next((INSTITUTION_LABEL[tags[k]] for k, _ in INSTITUTION_KINDS if tags.get(k) in INSTITUTION_LABEL), None)


def parse_institutions(elements):
    """{點的 ref: [{"osm", "kind", "name"}]}；同一個區域只列一次，依 OSM ref 排序"""
    out, cur = {}, None
    for e in elements:
        t = e.get("tags", {})
        if e["type"] == "marker":
            cur = t["ref"]
            out.setdefault(cur, [])
            continue
        if cur is None:
            continue
        kind = institution_kind(t)
        if kind is None:
            continue
        ref = area_ref(e)
        if all(x["osm"] != ref for x in out[cur]):
            out[cur].append({"osm": ref, "kind": kind, "name": (t.get("name") or "").strip()})
    return {k: sorted(v, key=lambda x: x["osm"]) for k, v in out.items()}

