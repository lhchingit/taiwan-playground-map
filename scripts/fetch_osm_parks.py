"""下載 research.json 的 `parks` 列出的 OSM 公園：名稱、範圍中心點、所在鄉鎮市，存成 data/raw/<縣市>/osm-parks.json。
research.json 的 parks 改過後要重新執行；結果提交進 repo，匯入不連網路。

  python3 scripts/fetch_osm_parks.py hsq

用途（decisions D20）：OSM 只畫了公園、沒有標遊戲場，但新聞或文章寫明裡面有兒童遊戲場的，用公園範圍中心點上地圖。
授權：© OpenStreetMap contributors，ODbL。
"""
import json
import sys
from datetime import date
from pathlib import Path

from lib.overpass import batched, is_in_query, overpass, parse_is_in

ROOT = Path(__file__).resolve().parent.parent
CITIES = ["hsq"]
KINDS = {"n": "node", "w": "way", "r": "relation"}


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in CITIES:
        sys.exit(f"用法：python3 scripts/fetch_osm_parks.py <{'|'.join(CITIES)}>")
    city = sys.argv[1]
    raw_dir = ROOT / "data/raw" / city
    refs = sorted(json.loads((raw_dir / "research.json").read_text(encoding="utf-8")).get("parks", {}))
    if not refs:
        sys.exit("research.json 沒有 parks")
    ids = "".join(f"{KINDS[r[0]]}({r[1:]});" for r in refs)
    elements = overpass(f"[out:json][timeout:120];({ids});out center tags;", tries=3)[1]["elements"]
    parks = {}
    for e in elements:
        ref = e["type"][0] + str(e["id"])
        center = e.get("center") or {"lat": e["lat"], "lon": e["lon"]}
        parks[ref] = {"name": e.get("tags", {}).get("name", ""), "leisure": e.get("tags", {}).get("leisure", ""),
                      "lat": round(center["lat"], 7), "lng": round(center["lon"], 7)}
    missing = [r for r in refs if r not in parks]
    if missing:
        sys.exit(f"OSM 找不到：{missing}")
    where = batched([(r, (p["lat"], p["lng"])) for r, p in parks.items()],
                    lambda batch: overpass(is_in_query(batch), tries=3)[1], parse_is_in)
    for r, p in parks.items():
        p["districts"] = where.get(r, {}).get("districts", [])
    out = {
        "source": "OpenStreetMap（Overpass API）",
        "license": "© OpenStreetMap contributors，ODbL",
        "fetched": date.today().isoformat(),
        "note": "research.json 的 parks 列出的公園：名稱、範圍中心點、所在鄉鎮市",
        "parks": {r: parks[r] for r in refs},
    }
    path = raw_dir / "osm-parks.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"{path.relative_to(ROOT)}：公園 {len(refs)}")


if __name__ == "__main__":
    main()
