"""匯入流程：轉接器輸出 → 合併到既有場地／新增 → 座標覆寫 → 檢查 → 寫出 places.json、places.csv、review 清單。

轉接器（scripts/sources/<來源>.py）要提供：
  SOURCE_ID       來源代碼（places.json 的 sources key，也用在場地 id）
  SOURCE_SHORT    review 清單裡的簡稱，例如「清冊」
  CITY            縣市代碼（decisions D12）
  SOURCES         要加入 places.json 的來源定義 {id: {label, url, kind}}
  ALIAS           {來源裡的名稱: 既有場地 id}（名稱不同但是同一處）
  COORD_OVERRIDE  {既有場地 id: (lat, lng, 座標來源說明)}
  records(root, review)  依序產生 SourceRecord（格式見 lib/merge.py）

補充資料（例如 sources/hccg_parks.py 的公園面積）由 run(..., parks=) 傳入，只用完全相同的名稱對應。
"""
import sys

from .attrs import attr_keys
from .io import read_json, write_csv, write_json
from .merge import find_existing, merge_attrs, new_place, place_id
from .review import ReviewCollector

CSV_BASE = ["id", "name", "district", "lat", "lng", "size", "stay", "age_min", "age_max", "fee", "status"]


def apply_areas(places, parks, review):
    """用公園資料補面積：先用場地名稱，對不到再用清冊上的名稱；有多個不同面積時不填，列入 review"""
    for p in places:
        if p["name"] in parks:
            areas = {parks[p["name"]]["area"]}
        else:
            names = [r["name"] for r in p.get("official_ref", [])]
            areas = {parks[n]["area"] for n in names if n in parks}
        areas.discard(None)
        p["area_ha"] = areas.pop() if len(areas) == 1 else None
        if p["area_ha"] is None:
            reason = "對到多個不同面積" if len(areas) > 1 else "公園資料沒有這個名稱"
            review.add("parks-unmatched", [p["id"], p["name"], reason])


def run(root, adapter, today, parks=None):
    # 每個縣市一個資料夾：data/seed/<縣市>/、data/review/<縣市>/
    seed_dir = root / "data/seed" / adapter.CITY
    seed_path = seed_dir / "places.json"
    seed = read_json(seed_path)
    if seed.get("version") != "0.1":
        sys.exit(f"places.json 是 v{seed.get('version')}，已經匯入過；請先執行 scripts/build_seed.py 重新產生 v0.1，避免重複合併")

    keys = attr_keys(seed["labels"])
    seed["sources"].update(adapter.SOURCES)
    by_name = {p["name"]: p for p in seed["places"]}
    by_id = {p["id"]: p for p in seed["places"]}

    review = ReviewCollector()
    stats = {"merged": 0, "new": 0, "skipped_none": 0, "skipped_nocoord": 0}
    seen_names = set()

    for rec in adapter.records(root, review):
        if not rec["items"]:
            review.add("no-playground", [rec["ext_no"], rec["name"], rec["district"], rec["raw_text"]])
            stats["skipped_none"] += 1
            continue

        target = find_existing(rec, by_id, by_name, adapter.ALIAS)
        if target:
            stats["merged"] += 1
            merge_attrs(target, rec, adapter.SOURCE_ID, adapter.SOURCE_SHORT, today, review)
            if rec["coord"] and target["id"] not in adapter.COORD_OVERRIDE:
                target["lat"], target["lng"] = rec["coord"]
                target["source_coords"] = (rec.get("coord_label")
                                           or f"OpenStreetMap {rec['coord_ref']}（{adapter.SOURCE_SHORT}編號 {rec['ext_no']}）")
            target.setdefault("official_ref", []).append(rec["official_ref"])
            continue

        if not rec["coord"]:
            review.add("unmatched", [rec["ext_no"], rec["name"], rec["district"], rec["raw_text"],
                                     rec.get("review_status", "")])
            stats["skipped_nocoord"] += 1
            continue

        # 同名的第二處以後加上編號，避免列表上分不出來
        display = rec["name"] if rec["name"] not in seen_names else f"{rec['name']}（{rec['ext_no']}）"
        seen_names.add(rec["name"])
        uid = place_id(adapter.CITY, adapter.SOURCE_ID, rec["ext_no"])
        seed["places"].append(new_place(rec, uid, display, keys, adapter.SOURCE_ID, today))
        stats["new"] += 1

    for pid, (lat, lng, ref) in adapter.COORD_OVERRIDE.items():
        by_id[pid]["lat"], by_id[pid]["lng"] = lat, lng
        by_id[pid]["source_coords"] = f"OpenStreetMap {ref}"

    leftover = [p["name"] for p in seed["places"] if "Google" in p.get("source_coords", "")]
    if leftover:
        sys.exit(f"仍有 Google 座標未替換：{leftover}")

    if parks is not None:
        seed["sources"].update(parks.SOURCES)
        records = parks.load(root)
        apply_areas(seed["places"], {n: {"area": parks.area_ha(r)} for n, r in records.items()}, review)

    for p in seed["places"]:
        p["city"] = adapter.CITY
    seed["version"] = "0.2"
    seed["generated"] = today
    write_json(seed_path, seed)

    write_csv(seed_dir / "places.csv",
              CSV_BASE + keys + ["parking_type", "parking_fee", "parking_spaces"],
              [[p[k] for k in CSV_BASE] + [p["attrs"][k]["v"] for k in keys]
               + [p["parking"]["type"], p["parking"]["fee"], p["parking"]["spaces"] or ""]
               for p in seed["places"]])
    review.write(root / "data/review" / adapter.CITY)

    print(f"場地總數 {len(seed['places'])}｜合併到既有 {stats['merged']}｜新增 {stats['new']}"
          f"｜清冊無遊具 {stats['skipped_none']}｜找不到座標 {stats['skipped_nocoord']}")
    review.print_summary()
