"""OpenStreetMap 的遊戲場 → 場地（沒有官方清單的縣市起步用，decisions D20）。

輸入：data/raw/<縣市>/osm.json（scripts/fetch_osm_city.py 產生：每個遊戲場的中心點、標籤、所在的公園與鄉鎮市）
      data/raw/<縣市>/manual-names.tsv（人工命名或排除）
      data/raw/<縣市>/osm-institutions.json（scripts/fetch_osm_institutions.py：位在學校、機關範圍內的遊戲場）

規則（全部不推測）：
  0. 位在學校、幼兒園、政府機關、軍營的範圍內 → 自動排除，優先於下面所有規則（上課、上班時間通常不對外開放；大學不算）
  1. 位在有名稱的公園裡 → 用公園名稱；同一個公園裡的遊戲場合併成一處（各遊戲區自己的名稱寫在說明裡）
  2. 不在公園裡、但遊戲場自己有名稱 → 用自己的名稱
  3. 都沒有 → 看人工命名表；表裡也沒有 → 列進 unnamed，不上地圖
  4. 人工命名表寫「（排除）」的遊戲場不上地圖（例如 OSM 標錯、私人社區）
  5. 遊具、生活機能全部是未知（OSM 幾乎沒有遊具資料）；規模、停留時間、年齡、收費也是未知
"""
import csv
import hashlib
import json
from pathlib import Path

SOURCE_ID = "osm"
# 跟新竹市（sources/hccg.py）用同一個來源定義：sources 表是全國共用的，同一個 id 的內容必須相同
SOURCES = {
    "osm": {"label": "OpenStreetMap（© OpenStreetMap contributors, ODbL）",
            "url": "https://www.openstreetmap.org/copyright", "kind": "open_data"},
}
EXCLUDE = "（排除）"
MANUAL_COLUMNS = ["OSM", "名稱", "依據", "確認者", "日期"]


def ref_key(ref):
    """排序用：n < r < w，再依 id 數字"""
    return (ref[0], int(ref[1:]))


def district_of(pg):
    """層級數字最大的行政區（鄉鎮市；里的層級更大，但查詢時只取 7、8）"""
    ds = sorted(pg.get("districts", []), key=lambda d: -d["level"])
    return ds[0]["name"] if ds else None


def park_of(pg):
    """所在的有名稱公園；同時在多個公園裡時取 area id 最小的，讓結果固定"""
    parks = sorted(pg.get("parks", []), key=lambda p: p["area"])
    return parks[0] if parks else None


def load_manual(path, refs):
    """{OSM ref: 名稱}；ref 不存在、沒有名稱、沒有依據或確認者時中止"""
    path = Path(path)
    if not path.exists():
        return {}
    with open(path, encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f, delimiter="\t"))
    errors = []
    for r in rows:
        ref = (r.get("OSM") or "").strip()
        if ref not in refs:
            errors.append(f"OSM 遊戲場不存在：{ref}")
        if not (r.get("名稱") or "").strip():
            errors.append(f"{ref}：要填名稱（或「{EXCLUDE}」）")
        if not r.get("依據") or not r.get("確認者"):
            errors.append(f"{ref}：要填依據與確認者")
    if errors:
        raise ValueError(f"{path} 有 {len(errors)} 個問題：\n- " + "\n- ".join(errors))
    return {r["OSM"].strip(): r["名稱"].strip() for r in rows}


def load_institutions(path, osm_path):
    """{OSM ref: [{osm, kind, name}]}：位在學校、機關範圍內的遊戲場。檔案不存在或跟 osm.json 對不上時中止"""
    path, osm_path = Path(path), Path(osm_path)
    if not path.exists():
        raise ValueError(f"{path} 不存在：請先執行 python scripts/fetch_osm_institutions.py <縣市>")
    data = json.loads(path.read_text(encoding="utf-8"))
    if data["osm_json_sha256"] != hashlib.sha256(osm_path.read_bytes()).hexdigest():
        raise ValueError(f"{path} 跟 {osm_path.name} 對不上（osm.json 更新過）：請重新執行 fetch_osm_institutions.py")
    return data["inside"]


def split_institutions(playgrounds, inside):
    """回傳 (其他遊戲場, [(遊戲場, 所在的學校／機關)])；在學校、機關範圍內的一律排除，不看名稱與人工命名"""
    kept, out = [], []
    for pg in playgrounds:
        if inside.get(pg["ref"]):
            out.append((pg, inside[pg["ref"]]))
        else:
            kept.append(pg)
    return kept, out


def institution_label(places):
    """excluded-institution.csv 的「所在的學校／機關」欄"""
    return "；".join(f"{x['kind']}：{x['name'] or '（沒有名稱）'}" for x in places)


def group_playgrounds(playgrounds, manual):
    """回傳 (groups, unnamed, excluded)。group：{key, name, district, members}，members 依 ref 排序"""
    groups, unnamed, excluded = {}, [], []
    for pg in sorted(playgrounds, key=lambda p: ref_key(p["ref"])):
        ref = pg["ref"]
        if manual.get(ref) == EXCLUDE:
            excluded.append(pg)
            continue
        park = park_of(pg)
        own = (pg.get("tags", {}).get("name") or "").strip()
        if park:
            key, name = f"park:{park['area']}", park["name"]
        elif own:
            key, name = f"pg:{ref}", own
        elif manual.get(ref):
            key, name = f"pg:{ref}", manual[ref]
        else:
            unnamed.append(pg)
            continue
        g = groups.setdefault(key, {"key": key, "name": name, "district": district_of(pg), "members": []})
        g["members"].append(pg)
    return list(groups.values()), unnamed, excluded


def summary(group):
    members = group["members"]
    names = [m["tags"]["name"].strip() for m in members if (m.get("tags", {}).get("name") or "").strip()
             and m["tags"]["name"].strip() != group["name"]]
    text = f"OpenStreetMap 標示了 {len(members)} 處遊戲區" if len(members) > 1 else "OpenStreetMap 標示的遊戲場"
    if names:
        text += f"：{'、'.join(names)}"
    return text + "。遊具與設施還沒有資料，歡迎回報。"


def to_places(groups, city, keys):
    """場地資料（places.json 的格式）。同名的加上行政區，仍重複時再加 OSM 編號"""
    count = {}
    for g in groups:
        count[g["name"]] = count.get(g["name"], 0) + 1
    seen = set()
    places = []
    for g in sorted(groups, key=lambda g: ref_key(g["members"][0]["ref"])):
        first = g["members"][0]
        name = g["name"]
        if count[name] > 1:
            name = f"{name}（{g['district'] or '行政區未知'}）"
            if name in seen:
                name = f"{name[:-1]}・{first['ref']}）"
        seen.add(name)
        refs = ",".join(m["ref"] for m in g["members"])
        places.append(dict(
            id=f"{city}-osm-{first['ref']}", name=name, district=g["district"], address=None,
            lat=round(first["lat"], 7), lng=round(first["lng"], 7),
            size=None, stay=None, stay_src=None, age_min=None, age_max=None,
            fee=None, indoor=first.get("tags", {}).get("indoor") == "yes", hours=None, surface=None,
            status="open", summary=summary(g),
            attrs={k: {"v": "u", "src": None, "note": None, "at": None} for k in keys},
            parking={"type": "u", "fee": "u", "spaces": None, "src": None, "note": None, "at": None},
            source_coords=f"OpenStreetMap {first['ref']}（leisure=playground）",
            official_ref=[{"osm": refs}],
            area_ha=None,
            city=city,
        ))
    return places
