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

from fetch_city_bounds import CITIES as CITY_NAMES
from lib.overpass import batched, is_in_query, overpass, parse_is_in

ROOT = Path(__file__).resolve().parent.parent
CITIES = ["hsq", "tyc", "nwt", "txg", "khh", "tpe", "tnn", "chw", "pif", "yun", "mlc", "cyq", "cyi"]
KINDS = {"n": "node", "w": "way", "r": "relation"}


def wrong_city(parks, name):
    """中心點不在 name 這個縣市（OSM admin_level=4）的公園：[(ref, OSM 名稱, 實際所在的縣市，查不到是空字串)]。
    編號打錯時（例如把嘉義縣的公園寫進嘉義市）在下載階段就擋下來；查不到縣市的也算錯。"""
    out = []
    for ref, p in parks.items():
        found = [d["name"] for d in p.get("districts", []) if d["level"] == 4 and d["name"]]
        if name not in found:
            out.append((ref, p.get("name", ""), "、".join(found)))
    return out


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
                    lambda batch: overpass(is_in_query(batch, levels="4|7|8"), tries=3)[1], parse_is_in)
    for r, p in parks.items():
        p["districts"] = where.get(r, {}).get("districts", [])
    name = dict(CITY_NAMES)[city]
    wrong = wrong_city(parks, name)
    if wrong:
        sys.exit(f"OSM 公園不在{name}（research.json 的 parks 編號可能打錯），沒有寫檔：\n  "
                 + "\n  ".join(f"{r} {n}：" + (f"在{found}，不在{name}" if found else "查不到所在的縣市")
                               for r, n, found in wrong))
    for p in parks.values():
        # 縣市只用來檢查；districts 只存鄉鎮市（跟 research.py 選行政區的方式一致）
        p["districts"] = [d for d in p["districts"] if d["level"] != 4]
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
