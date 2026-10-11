"""下載一個縣市在 OpenStreetMap 上的遊戲場，以及每個遊戲場位在哪個公園、哪個鄉鎮市（Overpass API），
存成 data/raw/<縣市>/osm.json。只在要更新時手動執行，結果提交進 repo；匯入不會連網路。

  python3 scripts/fetch_osm_city.py hsq

用途（decisions D20）：沒有官方清單的縣市，用 OSM 的 leisure=playground 起步；
所在的公園用來替沒有名稱的遊戲場取名，鄉鎮市用來填行政區。
做法：先取遊戲場的中心點，再用 is_in 查每個點所在的區域（不下載多邊形，查詢輕、結果就是 OSM 的判斷）。
授權：© OpenStreetMap contributors，ODbL（地圖與資料頁需標示）。
"""
import hashlib
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

from lib.opendata import USER_AGENT

ROOT = Path(__file__).resolve().parent.parent
OVERPASS = "https://overpass-api.de/api/interpreter"
# 縣市代碼 → OSM 行政區的 ISO 3166-2 代碼
ISO = {"hsq": "TW-HSQ", "tyc": "TW-TAO", "mlc": "TW-MIA"}
BATCH = 10


def overpass(q, tries=4):
    """公開的 Overpass 主機忙碌時會回 429／504：等一下再試"""
    for i in range(tries):
        req = urllib.request.Request(
            OVERPASS, data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": USER_AGENT}
        )
        try:
            with urllib.request.urlopen(req, timeout=240) as r:
                raw = r.read()
            return raw, json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code not in (429, 502, 503, 504) or i == tries - 1:
                raise
            time.sleep(15 * (i + 1))
    raise RuntimeError("unreachable")


def playground_query(iso):
    return f'[out:json][timeout:180];area["ISO3166-2"="{iso}"]->.a;nwr["leisure"="playground"](area.a);out center tags;'


def ref(e):
    return f"{e['type'][0]}{e['id']}"


def center(e):
    if e["type"] == "node":
        return e["lat"], e["lon"]
    return e["center"]["lat"], e["center"]["lon"]


def is_in_query(points):
    """每個點前面放一個 marker，回應依序是 marker、所在的公園、所在的鄉鎮市"""
    parts = ["[out:json][timeout:180];"]
    for r, (lat, lon) in points:
        parts.append(
            f'make marker ref="{r}";out;'
            f"is_in({lat},{lon})->.x;"
            'area.x["leisure"="park"]["name"];out tags;'
            'area.x["boundary"="administrative"]["admin_level"~"^(7|8)$"];out tags;'
        )
    return "".join(parts)


def parse_is_in(elements):
    """{遊戲場 ref: {"parks": [{"area", "name"}], "districts": [{"level", "name"}]}}"""
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


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ISO:
        sys.exit(f"用法：python3 scripts/fetch_osm_city.py <{'|'.join(ISO)}>")
    city = sys.argv[1]
    q1 = playground_query(ISO[city])
    raw1, data = overpass(q1)
    playgrounds = sorted(data["elements"], key=lambda e: (e["type"], e["id"]))
    points = [(ref(e), center(e)) for e in playgrounds]
    within = {}
    for i in range(0, len(points), BATCH):
        time.sleep(2)  # Overpass 的使用規範：不要連續大量查詢
        _, d = overpass(is_in_query(points[i:i + BATCH]))
        within.update(parse_is_in(d["elements"]))
    missing = [r for r, _ in points if r not in within]
    if missing:
        sys.exit(f"is_in 查詢沒有回傳：{missing[:5]}…（共 {len(missing)} 筆），請稍後再試")

    out = {
        "source": "OpenStreetMap（Overpass API）",
        "license": "© OpenStreetMap contributors，ODbL",
        "query": q1,
        "fetched": date.today().isoformat(),
        "osm_base": data.get("osm3s", {}).get("timestamp_osm_base"),
        "sha256": hashlib.sha256(raw1).hexdigest(),
        "playgrounds": [
            {"ref": ref(e), "lat": center(e)[0], "lng": center(e)[1], "tags": e.get("tags", {}), **within[ref(e)]}
            for e in playgrounds
        ],
    }
    path = ROOT / "data/raw" / city / "osm.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    pg = out["playgrounds"]
    print(f"{path.relative_to(ROOT)}：遊戲場 {len(pg)}（有名稱 {sum(1 for p in pg if p['tags'].get('name'))}、"
          f"在有名稱的公園裡 {sum(1 for p in pg if p['parks'])}）")


if __name__ == "__main__":
    main()
