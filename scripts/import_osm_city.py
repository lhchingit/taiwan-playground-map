"""沒有官方清單的縣市：從 OpenStreetMap 的遊戲場產生種子資料（decisions D20）。

  python3 scripts/import_osm_city.py hsq

輸入：data/raw/<縣市>/osm.json（scripts/fetch_osm_city.py）、data/raw/<縣市>/manual-names.tsv（人工命名或排除）、
      data/raw/<縣市>/research.json、osm-parks.json（有的話：人工查證的遊具與設施、OSM 只畫了公園的遊戲場，sources/research.py）、
      data/raw/<縣市>/osm-institutions.json（scripts/fetch_osm_institutions.py：位在學校、機關範圍內的遊戲場）
輸出：data/seed/<縣市>/places.json、places.csv；
      data/review/<縣市>/unnamed.csv、merged.csv、excluded.csv、excluded-institution.csv（HOLD_SUSPICIOUS 的縣市另有 named-suspicious.csv）
新北市、臺中市、南投縣另外用官方公園清單補地址（與面積），輸出 official-matched.csv、official-ambiguous.csv（sources/park_lists.py）
規則見 scripts/sources/osm_playgrounds.py。不連網路，同樣的輸入一定產生同樣的輸出（check_seed_hash.py）。
"""
import sys
from pathlib import Path

from lib.attrs import attr_keys
from lib.io import read_json, write_csv, write_json
from lib.labels import labels_json
from sources import park_lists, research
from sources import osm_playgrounds as osm

ROOT = Path(__file__).resolve().parent.parent
CITIES = {"hsq": "新竹縣", "tyc": "桃園市", "mlc": "苗栗縣", "nwt": "新北市", "txg": "臺中市", "khh": "高雄市", "cyi": "嘉義市", "chw": "彰化縣", "pif": "屏東縣", "yun": "雲林縣", "ila": "宜蘭縣", "cyq": "嘉義縣", "nan": "南投縣", "hua": "花蓮縣", "ttt": "臺東縣", "kee": "基隆市", "pen": "澎湖縣", "kin": "金門縣", "lie": "連江縣"}
# 名稱可疑的遊戲場先不上地圖、等人工確認的縣市（osm_playgrounds.hold_suspicious；值是 strict）；其他縣市照舊
HOLD_SUSPICIOUS = {"chw": True, "pif": True, "yun": True, "ila": True, "cyq": True, "nan": True, "hua": True, "ttt": True, "kee": True, "pen": True, "kin": True, "lie": True}
CSV_BASE = ["id", "name", "district", "lat", "lng", "size", "stay", "age_min", "age_max", "fee", "status"]


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in CITIES:
        sys.exit(f"用法：python3 scripts/import_osm_city.py <{'|'.join(CITIES)}>")
    city = sys.argv[1]
    raw_dir = ROOT / "data/raw" / city
    raw = read_json(raw_dir / "osm.json")
    playgrounds = raw["playgrounds"]
    manual = osm.load_manual(raw_dir / "manual-names.tsv", {p["ref"] for p in playgrounds})
    inside = osm.load_institutions(raw_dir / "osm-institutions.json", raw_dir / "osm.json")
    kept, in_institution = osm.split_institutions(playgrounds, inside)
    labels = labels_json()
    keys = attr_keys(labels)

    groups, unnamed, excluded = osm.group_playgrounds(kept, manual)
    held = []
    if city in HOLD_SUSPICIOUS:
        groups, held = osm.hold_suspicious(groups, manual, strict=HOLD_SUSPICIOUS[city])
    places = osm.to_places(groups, city, keys)
    sources = dict(osm.SOURCES)
    official = None
    config = park_lists.CONFIGS.get(city)
    if config:  # 官方公園清單只補地址與面積（sources/park_lists.py）
        parks = read_json(ROOT / config["raw"])
        ordered = sorted(groups, key=lambda g: osm.ref_key(g["members"][0]["ref"]))  # 跟 to_places 相同的順序
        official = park_lists.enrich(places, ordered, parks["records"], config)
        sources.update(config["sources"])
    research_path = raw_dir / "research.json"
    if research_path.exists():  # 人工查證的遊具與設施（sources/research.py）
        parks_path = raw_dir / "osm-parks.json"
        osm_parks = read_json(parks_path) if parks_path.exists() else None
        sources.update(research.apply(read_json(research_path), places, keys, city, osm_parks))
    seed ={"version": "0.2", "city": CITIES[city], "generated": raw["fetched"], "sources": sources,
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
    if city in HOLD_SUSPICIOUS:
        write_csv(review / "named-suspicious.csv", osm.SUSPICIOUS_COLUMNS, osm.suspicious_rows(held, link))
    write_csv(review / "excluded-institution.csv", ["OSM", "行政區", "所在的學校／機關", "OSM 連結"],
              [[p["ref"], osm.district_of(p) or "", osm.institution_label(at), link(p["ref"])]
               for p, at in in_institution])

    if official is not None:
        matched, ambiguous = official
        write_csv(review / "official-matched.csv", ["場地 id", "名稱", "官方序號", "官方名稱", "地址", "管理單位"],
                  [[p["id"], p["name"], r["seqno"], r["name"], r["address"], r["management"]] for p, r in matched])
        write_csv(review / "official-ambiguous.csv", ["場地 id", "名稱", "行政區", "官方候選（序號：名稱／地址）"],
                  [[p["id"], p["name"], p["district"] or "",
                    "；".join(f"{r['seqno']}：{r['name']}／{r['address']}" for r in hits)] for p, hits in ambiguous])
        print(f"  官方公園清單補上地址 {len(matched)}｜同一區有多個相符 {len(ambiguous)}")

    print(f"{CITIES[city]}：OSM 遊戲場 {len(playgrounds)}｜場地 {len(places)}"
          f"（合併 {sum(len(g['members']) - 1 for g in groups)} 處遊戲區）｜沒有名稱 {len(unnamed)}｜排除 {len(excluded)}"
          f"｜學校／機關內 {len(in_institution)}" + (f"｜名稱可疑 {len(held)}" if city in HOLD_SUSPICIOUS else ""))


if __name__ == "__main__":
    main()
