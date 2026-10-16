"""官方公園清單 → 替 OpenStreetMap 遊戲場補地址（與面積）。用於新北市、臺中市、南投縣（decisions D20）。

這些清單沒有遊具資料，看不出哪個公園有遊戲場，所以不單獨上地圖（D13）；只補充已經在地圖上的 OSM 場地。
規則（不推測）：
  - 只比對「依所在公園命名」的場地：OSM 公園名稱＋OSM 行政區
  - 比對鍵：去掉括號裡的用地編號與空白的名稱＋行政區（「南山公園 (公兒三)」→ 南山公園｜八里區）
  - 唯一相符才補；同一區有兩個以上相符的不補，列進 review
  - 不改名稱、座標與屬性；清冊的座標不使用
"""
import re

PAREN = re.compile(r"[（(][^）)]*[）)]")


def base_name(name):
    """去掉括號（全形、半形）裡的用地編號與所有空白"""
    return "".join(PAREN.sub("", name or "").split())


def nwt_record(r):
    """新北市公園（fetch_ntpc_parks.py）"""
    return {"seqno": r["seqno"], "name": r["name"], "district": r["area"], "address": r["address"],
            "management": r["management"], "area_m2": None}


def txg_district(raw):
    """「01中區」→ 中區"""
    return re.sub(r"^\d+", "", raw.strip())


def txg_area(raw):
    """「3,535」→ 3535；寫不出來 → None"""
    text = (raw or "").replace(",", "").strip()
    try:
        value = float(text)
    except ValueError:
        return None
    return value if value > 0 else None


def txg_record(r):
    """臺中市公園綠地清冊（fetch_txg_parks.py）"""
    return {"seqno": r["項次"], "name": r["公園綠地名稱"], "district": txg_district(r["行政區"]),
            "address": r["設置地點"], "management": r["維護單位"], "area_m2": txg_area(r["面積（M2）"])}


def nan_record(r):
    """南投縣都市計畫區公園一覽表（fetch_ntc_parks.py）：名稱、單位裡有換行；地址括號裡是地段地號，不要"""
    flat = lambda s: "".join((s or "").split())  # noqa: E731
    return {"seqno": r["編號"], "name": flat(r["公園名稱"]), "district": flat(r["所在轄區"]),
            "address": flat(PAREN.sub("", r["座落位置"] or "")), "management": flat(r["維護管理單位"]),
            "area_m2": txg_area(r["面積（m2）"])}


CONFIGS = {
    "nwt": {
        "raw": "data/raw/nwt/ntpc-parks.json",
        "record": nwt_record,
        "ref_key": "ntpc_seqno",
        "label": "新北市公園資料",
        "sources": {"ntpc": {"label": "新北市公園（農業局，政府資料開放平台）",
                             "url": "https://data.gov.tw/dataset/124566", "kind": "open_data"}},
    },
    "txg": {
        "raw": "data/raw/txg/txg-parks.json",
        "record": txg_record,
        "ref_key": "txg_seqno",
        "label": "臺中市公園綠地清冊",
        "sources": {"txgparks": {"label": "臺中市公園綠地清冊（建設局，政府資料開放平台）",
                                 "url": "https://data.gov.tw/dataset/88288", "kind": "open_data"}},
    },
    "nan": {
        "raw": "data/raw/nan/ntc-parks.json",
        "record": nan_record,
        "ref_key": "ntc_seqno",
        "label": "南投縣都市計畫區公園一覽表",
        "sources": {"ntcparks": {"label": "南投縣都市計畫區公園一覽表（南投縣政府，政府資料開放平台）",
                                 "url": "https://data.gov.tw/dataset/127415", "kind": "open_data"}},
    },
}


def index(records):
    """{鍵: [清冊資料]}"""
    out = {}
    for r in records:
        out.setdefault(f"{base_name(r['name'])}｜{r['district']}", []).append(r)
    return out


def enrich(places, groups, raw_records, config):
    """依所在公園命名的場地補上地址（與面積）。places 與 groups 一一對應（osm.to_places 的順序）。
    回傳 (matched, ambiguous)：[(場地, 清冊資料或候選清單)]"""
    idx = index([config["record"](r) for r in raw_records])
    matched, ambiguous = [], []
    for place, group in zip(places, groups):
        if not group["key"].startswith("park:"):
            continue  # 遊戲場自己的名稱或人工命名：不是公園名稱，不比對
        hits = idx.get(f"{base_name(group['name'])}｜{group['district']}", [])
        if len(hits) == 1:
            r = hits[0]
            place["address"] = r["address"] or None
            place["official_ref"].append({config["ref_key"]: r["seqno"], "name": r["name"],
                                          "management": r["management"]})
            what = "地址"
            if r["area_m2"] is not None:
                place["area_ha"] = round(r["area_m2"] / 10000, 2)
                what = "地址與面積"
            place["summary"] = place["summary"] + f"{what}來自{config['label']}。"
            matched.append((place, r))
        elif len(hits) > 1:
            ambiguous.append((place, hits))
    return matched, ambiguous
