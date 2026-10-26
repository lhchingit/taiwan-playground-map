"""匯入臺南市公園設施資料，再用 OpenStreetMap 的遊戲場補上官方資料沒有的，產生 data/seed/tnn/
（P5，規則見 scripts/sources/tnn.py、scripts/sources/osm_playgrounds.py；decisions D20、D21）。

  python3 scripts/import_tnn.py

輸入：data/raw/tnn/tnn-parks.json（fetch_tnn_parks.py）、
      osm.json、osm-institutions.json（fetch_osm_city.py tnn、fetch_osm_institutions.py tnn）、
      manual-names.tsv（OSM 遊戲場的人工命名或排除）、data/raw/osm-city-bounds.json（範圍檢查）、
      research.json、osm-parks.json（有的話：人工查證的遊具與設施，只補未知的項目；工務局特色遊戲場網站列出、
      OSM 只畫了公園的遊戲場，sources/research.py）
輸出：data/seed/tnn/places.json、places.csv；data/review/tnn/ 的
      no-playground、odd-names-official、no-coords、out-of-bounds（官方資料），
      unnamed、named-suspicious、merged、excluded、excluded-institution、osm-covered、osm-near-official（OSM 遊戲場）（CSV）
不連網路，同樣的輸入一定產生同樣的輸出（check_seed_hash.py）。
"""
from pathlib import Path

from lib.attrs import attr_keys, blank_attrs
from lib.io import read_json, write_csv, write_json
from lib.labels import labels_json
from sources import hccg, research, tnn, tycg
from sources import osm_playgrounds as osm

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data/raw/tnn"
CSV_BASE = ["id", "name", "district", "lat", "lng", "size", "stay", "age_min", "age_max", "fee", "status"]
OSM_URL = "https://www.openstreetmap.org/{}/{}"
KINDS = {"n": "node", "w": "way", "r": "relation"}


def link(ref):
    return OSM_URL.format(KINDS[ref[0]], ref[1:])


def main():
    data = read_json(RAW / "tnn-parks.json")
    fetched = data["fetched"]
    used = set(tnn.PLAY_COLUMNS) | tnn.MAPPED | {tnn.PARKING_COLUMN}
    missing = sorted(used - set(data["columns"]))
    if missing:
        raise SystemExit(f"官方資料沒有這些欄位（可能改名了）：{'、'.join(missing)}")
    west, south, east, north = read_json(ROOT / "data/raw/osm-city-bounds.json")["cities"]["tnn"]["bbox"]
    osm_raw = read_json(RAW / "osm.json")
    playgrounds = osm_raw["playgrounds"]
    labels = labels_json()
    keys = attr_keys(labels)

    review = {"no-playground": [], "odd-names-official": [], "no-coords": [], "out-of-bounds": []}
    places, officials = [], []
    for r in sorted(data["records"], key=lambda r: r["no"]):
        no, raw_name, dist = r["no"], r["公園名稱"].strip(), r["所在轄區"].strip()
        name = tnn.display_name(raw_name)
        if not tnn.is_playground(r):
            review["no-playground"].append([no, name, dist])
            continue
        if tnn.ODD_NAME.match(name):
            review["odd-names-official"].append([no, raw_name, dist, r.get("緯度", ""), r.get("經度", ""),
                                                 "用地編號，確認名稱後再處理"])
            continue
        coord, coord_label = tnn.coordinate(r), "臺南市公園設施資料（WGS84）"
        if coord is None:
            hit = tnn.osm_coordinate(name, dist, playgrounds, osm.district_of, osm.ref_key)
            if hit is None:
                review["no-coords"].append([no, name, dist, r.get("座落位置", "")])
                continue
            coord, coord_label = hit[:2], f"OpenStreetMap {hit[2]}（所在公園同名，leisure=playground）"
        lat, lng = coord
        if not (west <= lng <= east and south <= lat <= north):
            review["out-of-bounds"].append([no, name, dist, lat, lng])
            continue

        attrs = blank_attrs(keys)
        for k, note in tnn.map_counts(r).items():
            attrs[k] = {"v": "y", "src": tnn.SOURCE_ID, "note": note, "at": fetched}
        lot = tnn.parking(r)
        stay, size = hccg.estimate(tnn.items_present(r))
        pid = f"tnn-tnn-{no:03d}"
        officials.append({"id": pid, "name": name, "lat": lat, "lng": lng, "osm": None})
        places.append(dict(
            id=pid, name=name, district=dist, address=r.get("座落位置") or None,
            lat=round(lat, 7), lng=round(lng, 7),
            size=size, stay=stay, stay_src="est", age_min=None, age_max=None,
            # 資料沒有收費、開放時間、年齡、地面材質：未知，不推測
            fee=None, indoor=False, hours=None, surface=None, status="open",
            summary=tnn.summary(r), attrs=attrs,
            parking=({"type": "lot", "fee": "u", "spaces": lot["spaces"], "src": tnn.SOURCE_ID,
                      "note": lot["note"], "at": fetched} if lot else
                     {"type": "u", "fee": "u", "spaces": None, "src": None, "note": None, "at": None}),
            source_coords=coord_label,
            official_ref=[{"tnn_no": no, "name": raw_name, "district": dist, "kind": r.get("類別", "")}],
            area_ha=tnn.area_ha(r), city=tnn.CITY,
        ))

    # 同一個行政區有同名的官方場地：加上行政區（目前資料沒有，以防萬一）
    count = {}
    for p in places:
        count[p["name"]] = count.get(p["name"], 0) + 1
    for p in places:
        if count[p["name"]] > 1:
            p["name"] = f"{p['name']}（{p['district']}）"

    # OSM 遊戲場：學校／機關內的先排除，官方場地已涵蓋的不重複建立（規則見 tycg.split_osm）
    names = osm.load_manual(RAW / "manual-names.tsv", {p["ref"] for p in playgrounds})
    kept, in_institution = osm.split_institutions(
        playgrounds, osm.load_institutions(RAW / "osm-institutions.json", RAW / "osm.json"))
    extra, covered, near = tycg.split_osm(kept, officials, names)
    groups, unnamed, excluded = osm.group_playgrounds(extra, names)
    # 自己的名稱不像公共遊戲場的（不在公園裡、也沒有人工命名）：先不上地圖，等人工確認
    groups, held = osm.hold_suspicious(groups, names)
    osm_places = osm.to_places(groups, tnn.CITY, keys)
    taken = {p["name"] for p in places}
    for p in osm_places:
        if p["name"] in taken:  # 跟官方場地同名、但不是同一處（不同公園）：加上行政區
            p["name"] = f"{p['name']}（{p['district'] or '行政區未知'}）"
    places += osm_places

    sources = {**tnn.SOURCES, **osm.SOURCES, "est": {"label": "依面積與設施推估", "url": None, "kind": "estimate"}}
    research_path = RAW / "research.json"
    if research_path.exists():  # 人工查證的遊具與設施，只補未知的項目（sources/research.py）
        parks_path = RAW / "osm-parks.json"
        osm_parks = read_json(parks_path) if parks_path.exists() else None
        sources.update(research.apply(read_json(research_path), places, keys, tnn.CITY, osm_parks))
    seed = {"version": "0.2", "city": "臺南市", "generated": fetched, "sources": sources,
            "labels": labels, "places": places}
    seed_dir = ROOT / "data/seed/tnn"
    seed_dir.mkdir(parents=True, exist_ok=True)
    write_json(seed_dir / "places.json", seed)
    write_csv(seed_dir / "places.csv", CSV_BASE + keys + ["parking_type", "parking_fee", "parking_spaces"],
              [[p[k] for k in CSV_BASE] + [p["attrs"][k]["v"] for k in keys]
               + [p["parking"]["type"], p["parking"]["fee"], p["parking"]["spaces"] or ""] for p in places])

    out = ROOT / "data/review/tnn"
    out.mkdir(parents=True, exist_ok=True)
    heads = {
        "no-playground": ["編號", "公園", "行政區"],
        "odd-names-official": ["編號", "名稱", "行政區", "緯度", "經度", "處理方式"],
        "no-coords": ["編號", "公園", "行政區", "座落位置"],
        "out-of-bounds": ["編號", "公園", "行政區", "緯度", "經度"],
    }
    for name, rows in review.items():
        write_csv(out / f"{name}.csv", heads[name], rows)
    write_csv(out / "unnamed.csv", ["OSM", "行政區", "緯度", "經度", "OSM 連結", "處理方式"],
              [[p["ref"], osm.district_of(p) or "", p["lat"], p["lng"], link(p["ref"]),
                "確認後在 manual-names.tsv 填名稱或「（排除）」"] for p in unnamed])
    write_csv(out / "named-suspicious.csv", osm.SUSPICIOUS_COLUMNS, osm.suspicious_rows(held, link))
    write_csv(out / "merged.csv", ["場地 id", "名稱", "合併的 OSM 遊戲場", "各遊戲場自己的名稱"],
              [[p["id"], p["name"], p["official_ref"][0]["osm"],
                "、".join(m["tags"].get("name", "") for m in g["members"] if m["tags"].get("name"))]
               for p, g in zip(osm_places, sorted(groups, key=lambda g: osm.ref_key(g["members"][0]["ref"])))
               if len(g["members"]) > 1])
    write_csv(out / "excluded.csv", ["OSM", "行政區", "OSM 連結"],
              [[p["ref"], osm.district_of(p) or "", link(p["ref"])] for p in excluded])
    write_csv(out / "excluded-institution.csv", ["OSM", "行政區", "所在的學校／機關", "OSM 連結"],
              [[p["ref"], osm.district_of(p) or "", osm.institution_label(at), link(p["ref"])]
               for p, at in in_institution])
    write_csv(out / "osm-covered.csv", ["OSM", "所在公園", "官方場地 id", "官方場地", "依據", "OSM 連結"],
              [[p["ref"], "、".join(x["name"] for x in p["parks"]), o["id"], o["name"], why, link(p["ref"])]
               for p, o, why in covered])
    write_csv(out / "osm-near-official.csv",
              ["OSM", "所在公園", "OSM 名稱", "官方場地 id", "官方場地", "距離", "OSM 連結", "處理方式"],
              [[p["ref"], "、".join(x["name"] for x in p["parks"]), p["tags"].get("name", ""), o["id"], o["name"],
                dist, link(p["ref"]), "同一處就在 manual-names.tsv 填「（排除）」，不同處就填名稱"]
               for p, o, dist in near])

    n_official = len(places) - len(osm_places)
    print(f"臺南市：公園 {len(data['records'])}｜官方上地圖 {n_official}｜沒有遊具 {len(review['no-playground'])}"
          f"｜用地編號 {len(review['odd-names-official'])}｜缺座標 {len(review['no-coords'])}"
          f"｜範圍外 {len(review['out-of-bounds'])}")
    print(f"  OSM 遊戲場 {len(playgrounds)}：學校／機關內 {len(in_institution)}｜官方已涵蓋 {len(covered)}"
          f"｜待判斷 {len(near)}｜補充場地 {len(osm_places)}｜沒有名稱 {len(unnamed)}｜名稱可疑 {len(held)}"
          f"｜排除 {len(excluded)}")
    print(f"  上地圖合計 {len(places)}")


if __name__ == "__main__":
    main()
