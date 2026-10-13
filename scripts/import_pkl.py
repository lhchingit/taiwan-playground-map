"""匯入臺北市公園設施資料（兒童遊戲場），產生 data/seed/tpe/（decisions D21，規則見 scripts/sources/pkl.py）。

  python3 scripts/import_pkl.py

輸入：data/raw/tpe/pkl-arcade.json、data/raw/tpe/manual-names.tsv、data/raw/osm-city-bounds.json（範圍檢查）
輸出：data/seed/tpe/places.json、places.csv；data/review/tpe/ 的 odd-names、out-of-bounds、districts-unknown（CSV）
不連網路，同樣的輸入一定產生同樣的輸出（check_seed_hash.py）。
"""
from pathlib import Path

from lib.attrs import attr_keys, blank_attrs
from lib.io import read_json, write_csv, write_json
from lib.labels import labels_json
from sources import hccg, pkl

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data/raw/tpe"
CSV_BASE = ["id", "name", "district", "lat", "lng", "size", "stay", "age_min", "age_max", "fee", "status"]


def main():
    data = read_json(RAW / "pkl-arcade.json")
    fetched = data["fetched"]
    parks = pkl.group_parks(data["records"])
    manual = pkl.load_manual(RAW / "manual-names.tsv", {str(p["no"]) for p in parks})
    west, south, east, north = read_json(ROOT / "data/raw/osm-city-bounds.json")["cities"]["tpe"]["bbox"]
    labels = labels_json()
    keys = attr_keys(labels)

    review = {"odd-names": [], "out-of-bounds": [], "districts-unknown": []}
    kept = []
    for park in parks:
        no = str(park["no"])
        dist = pkl.district(park["district_raw"])
        lat, lng = pkl.coordinate(park)
        name = manual.get(no) or park["name"]
        if dist is None:
            review["districts-unknown"].append([no, park["name"], park["district_raw"]])
        elif pkl.ODD_NAME.match(name):
            review["odd-names"].append([no, park["name"], dist, round(lat, 7), round(lng, 7),
                                        "確認後在 manual-names.tsv 填名稱"])
        elif not (west <= lng <= east and south <= lat <= north):
            review["out-of-bounds"].append([no, park["name"], dist, round(lat, 7), round(lng, 7)])
        else:
            kept.append((park, name, dist, lat, lng))

    count = {}
    for _, name, _, _, _ in kept:
        count[name] = count.get(name, 0) + 1
    places = []
    for park, name, dist, lat, lng in kept:
        total = pkl.totals(park)
        attrs = blank_attrs(keys)
        for k, note in pkl.map_counts(total).items():
            attrs[k] = {"v": "y", "src": pkl.SOURCE_ID, "note": note, "at": fetched}
        stay, size = hccg.estimate(pkl.items_present(total))
        places.append(dict(
            id=f"tpe-pkl-{park['no']:03d}", name=f"{name}（{dist}）" if count[name] > 1 else name,
            district=dist, address=None, lat=round(lat, 7), lng=round(lng, 7),
            size=size, stay=stay, stay_src="est", age_min=None, age_max=None,
            # 資料沒有收費、開放時間、生活機能、停車：未知，不推測
            fee=None, indoor=False, hours=None, surface=None, status="open",
            summary=pkl.summary(park, total), attrs=attrs,
            parking={"type": "u", "fee": "u", "spaces": None, "src": None, "note": None, "at": None},
            source_coords="臺北市公園設施資料（TWD97 二度分帶，轉換為 WGS84）",
            official_ref=[{"pkl_no": park["no"], "name": park["name"], "district": park["district_raw"],
                           "areas": len(park["areas"])}],
            area_ha=None, city=pkl.CITY,
        ))

    sources = {**pkl.SOURCES, "est": {"label": "依面積與設施推估", "url": None, "kind": "estimate"}}
    seed = {"version": "0.2", "city": "臺北市", "generated": fetched, "sources": sources,
            "labels": labels, "places": places}
    seed_dir = ROOT / "data/seed/tpe"
    seed_dir.mkdir(parents=True, exist_ok=True)
    write_json(seed_dir / "places.json", seed)
    write_csv(seed_dir / "places.csv", CSV_BASE + keys + ["parking_type", "parking_fee", "parking_spaces"],
              [[p[k] for k in CSV_BASE] + [p["attrs"][k]["v"] for k in keys] + ["u", "u", ""] for p in places])

    out = ROOT / "data/review/tpe"
    out.mkdir(parents=True, exist_ok=True)
    heads = {
        "odd-names": ["編號", "名稱", "行政區", "緯度", "經度", "處理方式"],
        "out-of-bounds": ["編號", "名稱", "行政區", "緯度", "經度"],
        "districts-unknown": ["編號", "名稱", "行政區（原文）"],
    }
    for name, rows in review.items():
        write_csv(out / f"{name}.csv", heads[name], rows)

    areas = sum(len(p["areas"]) for p in parks)
    print(f"臺北市：原始 {len(data['records'])} 列｜去重後遊戲區 {areas}｜公園 {len(parks)}｜上地圖 {len(places)}"
          f"｜用地編號名稱 {len(review['odd-names'])}｜範圍外 {len(review['out-of-bounds'])}"
          f"｜行政區對不到 {len(review['districts-unknown'])}")


if __name__ == "__main__":
    main()
