"""新竹市公園管理維護地點（養護工程處，資料集 67762）：data/raw/hsc/hccg-parks.json。

這份資料沒有座標，只用來：
  - 補上場地的面積（area_ha），只用完全相同的名稱對應，不做模糊比對
  - 人工定位工具顯示「地點」「里別」當提示
"""
from lib.io import read_json

SOURCE_ID = "hccg_parks"
SOURCES = {
    "hccg_parks": {"label": "新竹市公園管理維護地點（養護工程處，政府資料開放平台）",
                   "url": "https://data.gov.tw/dataset/67762", "kind": "open_data"},
}


def load(root):
    """{公園名稱: {地點, 里別, 區別, 面積公頃}}；同名的公園（資料裡有重複）不使用，避免對錯"""
    data = read_json(root / "data/raw/hsc/hccg-parks.json")
    by_name, dup = {}, set()
    for r in data["records"]:
        name = r["公園名稱"].strip()
        if name in by_name:
            dup.add(name)
        by_name[name] = {"地點": r.get("地點", ""), "里別": r.get("里別", ""),
                         "區別": r.get("區別", ""), "面積公頃": r.get("面積公頃", "")}
    for name in dup:
        del by_name[name]
    return by_name


def area_ha(park):
    try:
        v = float(park["面積公頃"])
    except (KeyError, TypeError, ValueError):
        return None
    return v if v >= 0 else None
