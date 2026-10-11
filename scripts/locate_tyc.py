"""桃園市公園的定位（連網路，結果存成 data/raw/tyc/osm-matches.tsv 提交進 repo；匯入不會連網路）。

  python3 scripts/locate_tyc.py

1. OpenStreetMap 名稱比對（Overpass：桃園市內有名稱的 leisure=park、leisure=playground 的中心點）
   - 名稱相同（忽略空白與括號）→ exact，自動採用
   - 相同名稱有好幾處：只有一處位在資料寫的行政區裡 → exact-district，自動採用；否則 review-multi，待確認
   - 名稱互相包含 → contains，待確認
2. 比對不到的，用 Nominatim 依地址查（每秒最多 1 次、帶 User-Agent、限台灣）
   - 查到公園、遊戲場這類地點 → nominatim-poi，自動採用
   - 只到路名或區域 → nominatim-street，待確認（不自動採用）
   - 查不到 → none
不可以使用 Google 地理編碼，也不可以用原始資料的「地標」（Google 地圖連結）。
"""
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

from lib.io import read_json
from lib.opendata import USER_AGENT
from lib.overpass import overpass, within

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data/raw/tyc/osm-matches.tsv"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
POI = {("leisure", "park"), ("leisure", "playground"), ("leisure", "garden"), ("leisure", "nature_reserve"),
       ("leisure", "recreation_ground"), ("tourism", "attraction"), ("tourism", "theme_park")}


def norm(name):
    """比對用：去掉空白與括號內容（例：「南興水岸遊憩公園(光明郵局公園)」→「南興水岸遊憩公園」）"""
    return re.sub(r"[（(].*?[）)]", "", "".join(name.split()))


def osm_candidates():
    q = ('[out:json][timeout:180];area["ISO3166-2"="TW-TAO"]->.a;'
         '(nwr["leisure"="park"]["name"](area.a);nwr["leisure"="playground"]["name"](area.a););out center tags;')
    _, data = overpass(q)
    out = []
    for e in data["elements"]:
        c = e if e["type"] == "node" else e.get("center")
        if c:
            out.append({"ref": f"{e['type'][0]}{e['id']}", "name": e["tags"]["name"], "lat": c["lat"], "lng": c["lon"]})
    return out


def match_name(name, candidates):
    """(方式, [候選])：exact／review-multi／contains／none"""
    key = norm(name)
    exact = [c for c in candidates if norm(c["name"]) == key]
    if len(exact) == 1:
        return "exact", exact
    if len(exact) > 1:
        return "review-multi", exact
    contains = [c for c in candidates
                if len(key) >= 3 and len(norm(c["name"])) >= 3 and (key in norm(c["name"]) or norm(c["name"]) in key)]
    if contains:
        return "contains", contains[:1]
    return "none", []


def geocode(address):
    q = address if address.startswith("桃園市") else f"桃園市{address}"
    params = urllib.parse.urlencode({"q": q, "format": "jsonv2", "countrycodes": "tw", "limit": 1,
                                     "accept-language": "zh-TW"})
    req = urllib.request.Request(f"{NOMINATIM}?{params}", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as r:
        res = json.loads(r.read().decode("utf-8"))
    time.sleep(1.1)  # Nominatim 使用政策：每秒最多 1 次
    if not res:
        return "none", None
    hit = res[0]
    kind = "nominatim-poi" if (hit.get("category"), hit.get("type")) in POI else "nominatim-street"
    return kind, {"ref": f"{hit['osm_type'][0]}{hit['osm_id']}", "lat": float(hit["lat"]), "lng": float(hit["lon"])}


def main():
    data = read_json(ROOT / "data/raw/tyc/tycg-parks.json")
    parks = {}
    for r in data["records"]:
        parks.setdefault(r["no"], r)  # 同名的公園只定位一次
    candidates = osm_candidates()
    lines = [
        f"# 桃園市公園 ↔ OpenStreetMap 比對與地址定位｜取得日期：{data['fetched']}｜座標授權：© OpenStreetMap contributors, ODbL",
        "# 欄位：編號、公園、方式（exact 名稱相同／exact-district 同名多處但只有一處在同一區／review-multi 同名多處／contains 名稱包含／"
        "nominatim-poi 地址查到公園類地點／nominatim-street 只到路名／none 找不到）、OSM id、緯度、經度",
    ]
    stats = {}
    results = {no: match_name(parks[no]["公園名稱"], candidates) for no in sorted(parks)}
    # 同名多處：查每個候選地點位在哪個區（is_in），跟資料的「區域」比對
    multi = {h["ref"]: (h["lat"], h["lng"]) for m, hits in results.values() if m == "review-multi" for h in hits}
    district = {ref: [d["name"] for d in v["districts"]] for ref, v in within(list(multi.items())).items()}
    for no, (method, hits) in list(results.items()):
        if method == "review-multi":
            same = [h for h in hits if parks[no]["區域"] in district.get(h["ref"], [])]
            if len(same) == 1:
                results[no] = ("exact-district", same)
    for no in sorted(parks):
        r = parks[no]
        method, hits = results[no]
        hit = hits[0] if hits else None
        if method == "none" and r["地址"]:
            method, hit = geocode(r["地址"])
        stats[method] = stats.get(method, 0) + 1
        cols = [str(no), r["公園名稱"], method,
                ",".join(h["ref"] for h in hits) if hits else (hit["ref"] if hit else ""),
                f"{hit['lat']:.7f}" if hit else "", f"{hit['lng']:.7f}" if hit else ""]
        lines.append("\t".join(cols))
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    print(f"{OUT.relative_to(ROOT)}：" + "、".join(f"{k} {v}" for k, v in sorted(stats.items())))


if __name__ == "__main__":
    main()
