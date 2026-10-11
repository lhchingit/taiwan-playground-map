"""匯入桃園市公園（特色遊戲場＋有遊具的埤塘公園），產生 data/seed/tyc/（P4，規則見 scripts/sources/tycg.py）。

  python3 scripts/import_tycg.py

輸入：data/raw/tyc/tycg-parks.json、osm-matches.tsv、manual-review.tsv（人工定位工具）
輸出：data/seed/tyc/places.json、places.csv；data/review/tyc/ 的 unmatched、match-review、unmapped-items、
      no-playground（CSV），以及人工定位工具讀的 to-locate.json
不連網路，同樣的輸入一定產生同樣的輸出（check_seed_hash.py）。
"""
from pathlib import Path

from lib.attrs import attr_keys, blank_attrs
from lib.io import read_json, read_tsv, write_csv, write_json
from lib.labels import labels_json
from lib.manual import coord_label, read_manual, status_text
from sources import hccg, tycg

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data/raw/tyc"
# 自動採用的定位方式；其他（contains、review-multi、nominatim-street）要人工確認
AUTO = {"exact", "exact-district", "nominatim-poi"}
CSV_BASE = ["id", "name", "district", "lat", "lng", "size", "stay", "age_min", "age_max", "fee", "status"]


def merge_records(records):
    """同名（同編號）的公園合併：設施合在一起，停車、廁所任一份標示有就是有"""
    parks = {}
    for r in records:
        p = parks.setdefault(r["no"], {"no": r["no"], "name": r["公園名稱"], "district": r["區域"],
                                       "address": r["地址"], "rows": [], "facilities": [], "parking": "u",
                                       "toilet": "u"})
        p["rows"].append(r)
        if r["設施"] and r["設施"] not in p["facilities"]:
            p["facilities"].append(r["設施"])
        p["address"] = p["address"] or r["地址"]
        if tycg.flag(r["停車"]) == "y":
            p["parking"] = "y"
        if tycg.flag(r["廁所"]) == "y":
            p["toilet"] = "y"
    for p in parks.values():
        p["facilities"] = "、".join(p["facilities"])
    return [parks[k] for k in sorted(parks)]


def coordinate(park, match, manual):
    """(座標, 座標來源說明, 待確認的原因)；座標是 None 時不上地圖"""
    man = manual.get(str(park["no"]))
    if man and man["狀態"] == "located":
        return (float(man["緯度"]), float(man["經度"])), coord_label(man), None
    if man and man["狀態"] != "confirmed":
        return None, None, None  # 找不到、廢除、待實地、重複：不上地圖
    method = match[2] if match else "none"
    has = bool(match and match[4])
    if has and (method in AUTO or (man and man["狀態"] == "confirmed")):
        label = (f"OpenStreetMap {match[3]}（{'地址定位' if method.startswith('nominatim') else '比對方式'}："
                 f"{method}{'，人工確認' if method not in AUTO else ''}）")
        return (float(match[4]), float(match[5])), label, None
    return None, None, method if has else "none"


def main():
    data = read_json(RAW / "tycg-parks.json")
    fetched = data["fetched"]
    matches = {r[0]: r for r in read_tsv(RAW / "osm-matches.tsv")}
    manual = read_manual(RAW / "manual-review.tsv")
    labels = labels_json()
    keys = attr_keys(labels)

    places, review = [], {"unmatched": [], "match-review": [], "unmapped-items": [], "no-playground": []}
    to_locate = []
    for park in merge_records(data["records"]):
        no = str(park["no"])
        items = tycg.split_items(park["facilities"])
        mapped, unmapped = tycg.map_facilities(park["facilities"])
        if not tycg.has_playground(mapped, items):
            review["no-playground"].append([no, park["name"], park["district"], park["facilities"]])
            continue
        if unmapped:
            review["unmapped-items"].append([no, park["name"], "、".join(unmapped)])
        match = matches.get(no)
        coord, label, pending = coordinate(park, match, manual)
        status = status_text(manual.get(no))
        if coord is None:
            if pending and pending != "none":
                review["match-review"].append([no, park["name"], park["district"], pending, match[3],
                                               match[4], match[5], status])
            else:
                review["unmatched"].append([no, park["name"], park["district"], park["address"],
                                            park["facilities"], status])
            to_locate.append({
                "no": no, "name": park["name"], "district": park["district"], "items": park["facilities"],
                "address": park["address"],
                "kind": "match-review" if pending and pending != "none" else "unmatched",
                "osm": ({"id": match[3], "method": match[2], "lat": float(match[4]), "lng": float(match[5])}
                        if match and match[4] else None),
            })
            continue

        attrs = blank_attrs(keys)
        for k, note in mapped.items():
            attrs[k] = {"v": "y", "src": tycg.SOURCE_ID, "note": note, "at": fetched}
        if park["toilet"] == "y":
            attrs["toilet"] = {"v": "y", "src": tycg.SOURCE_ID, "note": "公園資料標示有廁所", "at": fetched}
        stay, size = hccg.estimate(items)
        places.append(dict(
            id=f"tyc-tycg-{park['no']:03d}", name=park["name"], district=park["district"],
            address=park["address"] or None, lat=round(coord[0], 7), lng=round(coord[1], 7),
            size=size, stay=stay, stay_src="est", age_min=None, age_max=None,
            # 資料沒有收費、開放時間：未知，不推測
            fee=None, indoor=False, hours=None, surface=None, status="open",
            summary=tycg.summary(park), attrs=attrs,
            parking=({"type": "u", "fee": "u", "spaces": None, "src": tycg.SOURCE_ID,
                      "note": "公園資料標示有停車（類型未提供）", "at": fetched}
                     if park["parking"] == "y" else
                     {"type": "u", "fee": "u", "spaces": None, "src": None, "note": None, "at": None}),
            source_coords=label,
            official_ref=[{"tycg_no": park["no"], "name": park["name"], "kinds": [r["類別"] for r in park["rows"]],
                           "items": park["facilities"]}],
            area_ha=None, city=tycg.CITY,
        ))

    sources = {**tycg.SOURCES, **{k: v for k, v in hccg.SOURCES.items() if k == "osm"},
               "est": {"label": "依面積與設施推估", "url": None, "kind": "estimate"}}
    seed = {"version": "0.2", "city": "桃園市", "generated": fetched, "sources": sources,
            "labels": labels, "places": places}
    seed_dir = ROOT / "data/seed/tyc"
    seed_dir.mkdir(parents=True, exist_ok=True)
    write_json(seed_dir / "places.json", seed)
    write_csv(seed_dir / "places.csv", CSV_BASE + keys + ["parking_type", "parking_fee", "parking_spaces"],
              [[p[k] for k in CSV_BASE] + [p["attrs"][k]["v"] for k in keys] + ["u", "u", ""] for p in places])

    out = ROOT / "data/review/tyc"
    out.mkdir(parents=True, exist_ok=True)
    heads = {
        "unmatched": ["編號", "公園", "區域", "地址", "設施", "處理狀態"],
        "match-review": ["編號", "公園", "區域", "方式", "OSM id", "緯度", "經度", "處理狀態"],
        "unmapped-items": ["編號", "公園", "對不到屬性的設施文字"],
        "no-playground": ["編號", "公園", "區域", "設施"],
    }
    for name, rows in review.items():
        write_csv(out / f"{name}.csv", heads[name], rows)
    write_json(out / "to-locate.json", {"city": "tyc", "generated": fetched, "items": to_locate})

    print(f"桃園市：上地圖 {len(places)}｜待定位 {len(review['unmatched'])}｜待確認比對 {len(review['match-review'])}"
          f"｜沒有遊具 {len(review['no-playground'])}｜有對不到的設施文字 {len(review['unmapped-items'])} 處")


if __name__ == "__main__":
    main()
