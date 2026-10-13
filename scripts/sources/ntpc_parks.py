"""「新北市公園」清單（農業局，資料集 124566）→ 替 OpenStreetMap 遊戲場補地址與管理單位。

輸入：data/raw/nwt/ntpc-parks.json（fetch_ntpc_parks.py）
規則（不推測）：
  - 只比對「依所在公園命名」的場地：OSM 公園名稱＋OSM 行政區
  - 比對鍵：去掉括號裡的用地編號與空白的名稱＋行政區（「南山公園 (公兒三)」→ 南山公園｜八里區）
  - 唯一相符才補地址；同一區有兩個以上相符的不補，列進 review
  - 不改名稱、座標與屬性
"""
import re

SOURCE_ID = "ntpc"
SOURCES = {
    "ntpc": {"label": "新北市公園（農業局，政府資料開放平台）",
             "url": "https://data.gov.tw/dataset/124566", "kind": "open_data"},
}
PAREN = re.compile(r"[（(][^）)]*[）)]")


def base_name(name):
    """去掉括號（全形、半形）裡的用地編號與所有空白"""
    return "".join(PAREN.sub("", name or "").split())


def index(records):
    """{鍵: [官方資料]}"""
    out = {}
    for r in records:
        out.setdefault(f"{base_name(r['name'])}｜{r['area']}", []).append(r)
    return out


def enrich(places, groups, records):
    """依所在公園命名的場地補上地址。places 與 groups 一一對應（osm.to_places 的順序）。
    回傳 (matched, ambiguous)：[(場地, 官方資料或候選清單)]"""
    idx = index(records)
    matched, ambiguous = [], []
    for place, group in zip(places, groups):
        if not group["key"].startswith("park:"):
            continue  # 遊戲場自己的名稱或人工命名：不是公園名稱，不比對
        hits = idx.get(f"{base_name(group['name'])}｜{group['district']}", [])
        if len(hits) == 1:
            r = hits[0]
            place["address"] = r["address"] or None
            place["official_ref"].append({"ntpc_seqno": r["seqno"], "name": r["name"], "management": r["management"]})
            place["summary"] = place["summary"] + "地址來自新北市公園資料。"
            matched.append((place, r))
        elif len(hits) > 1:
            ambiguous.append((place, hits))
    return matched, ambiguous
