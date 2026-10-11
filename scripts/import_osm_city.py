"""沒有官方清單的縣市：從 OpenStreetMap 的遊戲場產生種子資料（decisions D20）。

  python3 scripts/import_osm_city.py hsq

輸入：data/raw/<縣市>/osm.json（scripts/fetch_osm_city.py）、data/raw/<縣市>/manual-names.tsv（人工命名或排除）
輸出：data/seed/<縣市>/places.json、places.csv；data/review/<縣市>/unnamed.csv、merged.csv、excluded.csv
規則見 scripts/sources/osm_playgrounds.py。不連網路，同樣的輸入一定產生同樣的輸出（check_seed_hash.py）。
"""
import sys
from pathlib import Path

from lib.attrs import attr_keys
from lib.io import read_json, write_csv, write_json
from lib.labels import labels_json
from sources import osm_playgrounds as osm

ROOT = Path(__file__).resolve().parent.parent
CITIES = {"hsq": "新竹縣", "tyc": "桃園市", "mlc": "苗栗縣"}
CSV_BASE = ["id", "name", "district", "lat", "lng", "size", "stay", "age_min", "age_max", "fee", "status"]


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in CITIES:
        sys.exit(f"用法：python3 scripts/import_osm_city.py <{'|'.join(CITIES)}>")
    city = sys.argv[1]
    raw = read_json(ROOT / "data/raw" / city / "osm.json")
    playgrounds = raw["playgrounds"]
    manual = osm.load_manual(ROOT / "data/raw" / city / "manual-names.tsv", {p["ref"] for p in playgrounds})
    labels = labels_json()
    keys = attr_keys(labels)

    groups, unnamed, excluded = osm.group_playgrounds(playgrounds, manual)
    places = osm.to_places(groups, city, keys)
    seed = {"version": "0.2", "city": CITIES[city], "generated": raw["fetched"], "sources": osm.SOURCES,
            "labels": labels, "places": places}
    seed_dir = ROOT / "data/seed" / city
    seed_dir.mkdir(parents=True, exist_ok=True)
    write_json(seed_dir / "places.json", seed)
    write_csv(seed_dir / "places.csv", CSV_BASE + keys + ["parking_type", "parking_fee", "parking_spaces"],
              [[p[k] for k in CSV_BASE] + [p["attrs"][k]["v"] for k in keys] + ["u", "u", ""] for p in places])

    osm_url = "https://www.openstreetmap.org/{}/{}"
    kinds = {"n": "node", "w": "way", "r": "relation"}
    link = lambda ref: osm_url.format(kinds[ref[0]], ref[1:])  # noqa: E731
    review = ROOT / "data/review" / city
    review.mkdir(parents=True, exist_ok=True)
    write_csv(review / "unnamed.csv",
              ["OSM", "行政區", "緯度", "經度", "OSM 連結", "處理方式"],
              [[p["ref"], osm.district_of(p) or "", p["lat"], p["lng"], link(p["ref"]),
                "確認後在 manual-names.tsv 填名稱或「（排除）」"] for p in unnamed])
    write_csv(review / "merged.csv",
              ["場地 id", "名稱", "合併的 OSM 遊戲場", "各遊戲場自己的名稱"],
              [[p["id"], p["name"], p["official_ref"][0]["osm"],
                "、".join(m["tags"].get("name", "") for m in g["members"] if m["tags"].get("name"))]
               for p, g in zip(places, sorted(groups, key=lambda g: osm.ref_key(g["members"][0]["ref"])))
               if len(g["members"]) > 1])
    write_csv(review / "excluded.csv", ["OSM", "行政區", "OSM 連結"],
              [[p["ref"], osm.district_of(p) or "", link(p["ref"])] for p in excluded])

    print(f"{CITIES[city]}：OSM 遊戲場 {len(playgrounds)}｜場地 {len(places)}"
          f"（合併 {sum(len(g['members']) - 1 for g in groups)} 處遊戲區）｜沒有名稱 {len(unnamed)}｜排除 {len(excluded)}")


if __name__ == "__main__":
    main()
