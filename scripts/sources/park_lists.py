"""官方公園清單 → 替 OpenStreetMap 遊戲場補地址（與面積）。用於新北市、臺中市、南投縣（decisions D20）。

這些清單沒有遊具資料，看不出哪個公園有遊戲場，所以不單獨上地圖（D13）；只補充已經在地圖上的 OSM 場地。
規則（不推測）：
  - 只比對「依所在公園命名」的場地：OSM 公園名稱＋OSM 行政區
  - 比對鍵：去掉括號裡的用地編號與空白的名稱＋行政區（「南山公園 (公兒三)」→ 南山公園｜八里區）
  - 唯一相符才補；同一區有兩個以上相符的不補，列進 review
  - 不改名稱、座標與屬性；清冊的座標不使用
  - 官方改名而 OSM 還是舊名時，用 data/raw/<縣市>/official-aliases.tsv 人工對照（要寫依據）；
    對照的官方名稱在清單找不到就報錯，免得對照表過期沒人發現
  - 清冊地址寫「河川區域無住址」等（NO_ADDRESS）當成沒有地址；沒有地址也沒有面積的不算對上（沒有東西可補）
"""
import re

PAREN = re.compile(r"[（(][^）)]*[）)]")
NO_ADDRESS = {"河川區域無住址"}


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


def read_aliases(rows):
    """official-aliases.tsv 的列（OSM 公園名稱、行政區、官方名稱、依據；第一列是欄名）→ {OSM 鍵: 官方名稱}"""
    out = {}
    for r in rows[1:]:
        if len(r) < 4 or not all(x.strip() for x in r[:4]):
            raise ValueError(f"official-aliases.tsv 每一列都要有 OSM 公園名稱、行政區、官方名稱、依據：{r}")
        out[f"{base_name(r[0])}｜{r[1].strip()}"] = r[2].strip()
    return out


def enrich(places, groups, raw_records, config, aliases=None):
    """依所在公園命名的場地補上地址（與面積）。places 與 groups 一一對應（osm.to_places 的順序）。
    aliases：{OSM 鍵: 官方名稱}（read_aliases）。回傳 (matched, ambiguous)：[(場地, 清冊資料或候選清單)]"""
    records = []
    for r in raw_records:
        rec = config["record"](r)
        if (rec["address"] or "").strip() in NO_ADDRESS:
            rec["address"] = ""
        records.append(rec)
    idx = index(records)
    aliases = aliases or {}
    stale = [f"{k} → {v}" for k, v in aliases.items() if f"{base_name(v)}｜{k.split('｜')[1]}" not in idx]
    if stale:
        raise ValueError(f"official-aliases.tsv 的官方名稱在清單裡找不到（對照表可能過期）：{'、'.join(stale)}")
    matched, ambiguous = [], []
    for place, group in zip(places, groups):
        if not group["key"].startswith("park:"):
            continue  # 遊戲場自己的名稱或人工命名：不是公園名稱，不比對
        key = f"{base_name(group['name'])}｜{group['district']}"
        if key in aliases:
            key = f"{base_name(aliases[key])}｜{group['district']}"
        hits = idx.get(key, [])
        if len(hits) == 1 and not hits[0]["address"] and hits[0]["area_m2"] is None:
            continue  # 沒有地址也沒有面積：沒有東西可補
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
