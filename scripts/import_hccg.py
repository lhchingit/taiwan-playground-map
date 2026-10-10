"""匯入新竹市兒童遊戲場清冊，並用 OpenStreetMap 座標取代原型暫用的 Google 座標。

輸入：
  data/seed/places.json            v0.1 種子資料（10 筆，scripts/build_seed.py 產生）
  data/raw/hccg-playgrounds.tsv    養工處清冊（116 筆，原文照錄）
  data/raw/osm-matches.tsv         清冊名稱 ↔ OSM 比對結果與座標
輸出：
  data/seed/places.json            v0.2（覆寫）
  data/seed/places.csv
  data/review/*.csv                需要人工處理的清單

規則（對應 CLAUDE.md 資料規則）：
  - 清冊只列「有」的遊具，沒列出的不代表沒有 → 只寫入 y，其餘維持原值或 u。
  - 清冊寫「無」的場地不匯入地圖（另列 no-playground.csv 供確認）。
  - 沒有座標的場地不匯入（列在 unmatched.csv，待人工定位）。
  - 現有資料為 n、清冊為 y 時不自動覆蓋，列入 conflicts.csv。
  - 現有資料來源是網友評論線索（lead）而清冊為 y 時，改用清冊為來源。
"""
import csv, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TODAY = "2026-10-10"

HCCG_SRC = {"label": "新竹市兒童遊戲場清冊（養護工程處，政府資料開放平台；清冊未註明調查年份）",
            "url": "https://data.gov.tw/dataset/132713", "kind": "open_data"}
OSM_SRC = {"label": "OpenStreetMap（© OpenStreetMap contributors, ODbL）",
           "url": "https://www.openstreetmap.org/copyright", "kind": "open_data"}

# 清冊遊具文字 → 屬性 key（依序比對，同一項可以對到多個 key）
RULES = [
    (r"溜索", ["zipline"]),
    (r"溜滑梯|滑梯|滑草坡|地景磨石子", ["slide"]),
    (r"鳥巢", ["nest_swing", "swing"]),
    (r"鞦韆", ["swing"]),
    (r"搖搖馬|彈簧馬|搖搖椅", ["spring_rider"]),
    (r"翹翹板|蹺蹺板", ["seesaw"]),
    (r"沙坑", ["sandpit"]),
    (r"攀岩", ["climbing_wall"]),
    (r"攀爬網", ["rope_net"]),
    (r"攀爬|盤爬架", ["climbing"]),
    (r"平衡木|梅花樁", ["balance"]),
    (r"吊橋", ["suspension_bridge"]),
    (r"旋轉", ["spinner"]),
    (r"彈跳床", ["trampoline"]),
    (r"傳聲筒", ["music"]),
    (r"共融|無障礙", ["inclusive"]),
]

# 清冊名稱 → 既有場地 id（名稱不同但是同一處）
EXISTING_ALIAS = {
    "新竹大砂坑公園": "hsc-hsinchu-park",       # 清冊把新竹公園內的沙坑遊戲區獨立列出
    "經國路園道": "hsc-green-road-smile-slide",  # 碗公型磨石子溜滑梯
}
# 既有場地的 OSM 座標（清冊沒有的另外指定）
EXISTING_COORD_OVERRIDE = {
    "hsc-nanliao-sand-water": (24.848985, 120.928307, "w598705370 親子沙灘戲水池"),
}


def read_tsv(path):
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        rows.append(line.split("\t"))
    return rows


def parse_items(text):
    text = text.strip().rstrip("。")
    if text in ("", "無"):
        return []
    return [i.strip().rstrip("。") for i in re.split(r"[、，,]", text) if i.strip()]


def map_items(items):
    """回傳 ({key: 原文}, [沒有對應的原文])"""
    attrs, unmapped = {}, []
    for item in items:
        hit = False
        for pat, keys in RULES:
            if re.search(pat, item):
                hit = True
                for k in keys:
                    if item not in attrs.setdefault(k, []):
                        attrs[k].append(item)
        if not hit:
            unmapped.append(item)
    return {k: "、".join(v) for k, v in attrs.items()}, unmapped


def estimate(items):
    n = len(items)
    stay = "lt30" if n <= 2 else "30_60" if n <= 4 else "60_120"
    size = "S" if n <= 2 else "M" if n <= 5 else "L"
    return stay, size


def blank_attrs(keys):
    return {k: {"v": "u", "src": None, "note": None, "at": None} for k in keys}


def main():
    seed = json.loads((ROOT / "data/seed/places.json").read_text(encoding="utf-8"))
    keys = list(seed["labels"]["play"]) + list(seed["labels"]["amenity"])
    seed["sources"]["hccg"] = HCCG_SRC
    seed["sources"]["osm"] = OSM_SRC
    by_name = {p["name"]: p for p in seed["places"]}
    by_id = {p["id"]: p for p in seed["places"]}

    hccg = read_tsv(ROOT / "data/raw/hccg-playgrounds.tsv")
    osm = {r[0]: r for r in read_tsv(ROOT / "data/raw/osm-matches.tsv")}

    review = {"unmatched": [], "match-review": [], "conflicts": [], "no-playground": [], "unmapped-items": []}
    stats = {"merged": 0, "new": 0, "skipped_none": 0, "skipped_nocoord": 0}
    seen_names = set()

    for no, name, district, text in hccg:
        district = district.replace("公所", "")
        items = parse_items(text)
        m = osm.get(no, [no, name, "none"])
        method = m[2] if len(m) > 2 else "none"
        coord = (float(m[4]), float(m[5])) if len(m) >= 6 and m[4] else None

        if not items:
            review["no-playground"].append([no, name, district, text])
            stats["skipped_none"] += 1
            continue

        mapped, unmapped = map_items(items)
        if unmapped:
            review["unmapped-items"].append([no, name, "、".join(unmapped)])
        if method.startswith("review") or method.endswith("spread") or method == "contains":
            review["match-review"].append([no, name, method, m[3] if len(m) > 3 else "", *(coord or ("", ""))])

        target = by_id.get(EXISTING_ALIAS.get(name, "")) or by_name.get(name)
        if target:
            stats["merged"] += 1
            for k, item in mapped.items():
                a = target["attrs"][k]
                if a["v"] == "n":
                    review["conflicts"].append([target["name"], k, f"現有：無（{a['src']}：{a['note'] or ''}）", f"清冊：{item}"])
                elif a["v"] == "u" or a["src"] == "lead":
                    target["attrs"][k] = {"v": "y", "src": "hccg", "note": item, "at": TODAY}
            if coord and target["id"] not in EXISTING_COORD_OVERRIDE:
                target["lat"], target["lng"] = coord
                target["source_coords"] = f"OpenStreetMap {m[3]}（清冊編號 {no}）"
            target.setdefault("official_ref", []).append({"hccg_no": int(no), "name": name, "items": text})
            continue

        if not coord:
            review["unmatched"].append([no, name, district, text])
            stats["skipped_nocoord"] += 1
            continue

        uid = f"hsc-hccg-{int(no):03d}"
        disp = name if name not in seen_names else f"{name}（{no}）"
        seen_names.add(name)
        stay, size = estimate(items)
        attrs = blank_attrs(keys)
        for k, item in mapped.items():
            attrs[k] = {"v": "y", "src": "hccg", "note": item, "at": TODAY}
        seed["places"].append(dict(
            id=uid, name=disp, district=district, address=None, lat=coord[0], lng=coord[1],
            size=size, stay=stay, stay_src="est", age_min=None, age_max=None,
            fee="free", indoor=False, hours=None, surface=None, status="open",
            summary=f"清冊列出的遊具：{text.rstrip('。、')}",
            attrs=attrs,
            parking={"type": "u", "fee": "u", "spaces": None, "src": None, "note": None, "at": None},
            source_coords=f"OpenStreetMap {m[3]}（比對方式：{method}）",
            official_ref=[{"hccg_no": int(no), "name": name, "items": text}],
        ))
        stats["new"] += 1

    for pid, (lat, lng, ref) in EXISTING_COORD_OVERRIDE.items():
        by_id[pid]["lat"], by_id[pid]["lng"] = lat, lng
        by_id[pid]["source_coords"] = f"OpenStreetMap {ref}"

    leftover = [p["name"] for p in seed["places"] if "Google" in p.get("source_coords", "")]
    if leftover:
        sys.exit(f"仍有 Google 座標未替換：{leftover}")

    for p in seed["places"]:
        p["city"] = "hsc"          # decisions D12：縣市代碼
    seed["version"] = "0.2"
    seed["generated"] = TODAY
    (ROOT / "data/seed/places.json").write_text(json.dumps(seed, ensure_ascii=False, indent=1), encoding="utf-8")

    with open(ROOT / "data/seed/places.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        base = ["id", "name", "district", "lat", "lng", "size", "stay", "age_min", "age_max", "fee", "status"]
        w.writerow(base + keys + ["parking_type", "parking_fee", "parking_spaces"])
        for p in seed["places"]:
            w.writerow([p[k] for k in base] + [p["attrs"][k]["v"] for k in keys]
                       + [p["parking"]["type"], p["parking"]["fee"], p["parking"]["spaces"] or ""])

    heads = {"unmatched": ["清冊編號", "公園", "行政區", "設施內容"],
             "match-review": ["清冊編號", "公園", "比對方式", "OSM id", "緯度", "經度"],
             "conflicts": ["場地", "屬性", "現有資料", "清冊"],
             "no-playground": ["清冊編號", "公園", "行政區", "設施內容"],
             "unmapped-items": ["清冊編號", "公園", "未對應的遊具文字"]}
    (ROOT / "data/review").mkdir(exist_ok=True)
    for k, rows in review.items():
        with open(ROOT / f"data/review/{k}.csv", "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f); w.writerow(heads[k]); w.writerows(rows)

    print(f"場地總數 {len(seed['places'])}｜合併到既有 {stats['merged']}｜新增 {stats['new']}"
          f"｜清冊無遊具 {stats['skipped_none']}｜找不到座標 {stats['skipped_nocoord']}")
    for k, rows in review.items():
        print(f"  review/{k}.csv：{len(rows)} 筆")


if __name__ == "__main__":
    main()
