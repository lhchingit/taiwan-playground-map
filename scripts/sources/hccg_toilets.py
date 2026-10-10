"""新竹市公廁地點資訊（養護工程處，資料集 67757）：data/raw/hsc/hccg-toilets.json。

這份資料沒有座標，只能依名稱對應到場地（decisions D14）：
  - 公廁名稱正規化後（拿掉括號、「公廁」與後面的編號）跟場地名稱完全相同
  - 或人工對應表 data/raw/hsc/toilet-aliases.tsv（名稱對不到、但人工確認是同一處）
不做模糊比對；對不到的列進 review 清單，只附上名稱相近的場地當提示。
"""
import csv
import re
from pathlib import Path

from lib.io import read_json

SOURCE_ID = "hccg_toilets"
SOURCE_SHORT = "公廁資料"
SOURCES = {
    "hccg_toilets": {"label": "新竹市公廁地點資訊（養護工程處，政府資料開放平台）",
                     "url": "https://data.gov.tw/dataset/67757", "kind": "open_data"},
}
ALIASES = "data/raw/hsc/toilet-aliases.tsv"
ALIAS_COLUMNS = ["公廁名稱", "場地 id", "依據", "確認者", "日期"]


def normalize(name):
    """「青青草原公廁(6)」→「青青草原」；「十八尖山公廁-1(博愛街入口)」→「十八尖山」"""
    name = re.sub(r"[（(].*?[）)]", "", name)
    name = re.sub(r"公廁.*$", "", name)
    return name.strip()


def _int(v):
    try:
        return max(0, int(str(v).strip() or 0))
    except ValueError:
        return 0


def load(root):
    """[{name, key, nursing}]，key 是正規化後的名稱，nursing 是育嬰台數量；fetched 是取得日期"""
    data = read_json(root / "data/raw/hsc/hccg-toilets.json")
    toilets = [{"name": r["公廁名稱"].strip(), "key": normalize(r["公廁名稱"]), "nursing": _int(r.get("育嬰台數量"))}
               for r in data["records"]]
    return toilets, data["fetched"]


def load_aliases(root, toilet_names, place_ids):
    """{公廁名稱: 場地 id}。公廁名稱或場地 id 不存在、缺少依據或確認者時中止匯入。"""
    path = Path(root) / ALIASES
    if not path.exists():
        return {}
    with open(path, encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f, delimiter="\t"))
    errors = []
    for r in rows:
        name, pid = r.get("公廁名稱", ""), r.get("場地 id", "")
        if name not in toilet_names:
            errors.append(f"公廁名稱不存在：{name}")
        if pid not in place_ids:
            errors.append(f"{name}：場地 id 不存在：{pid}")
        if not r.get("依據") or not r.get("確認者"):
            errors.append(f"{name}：要填依據與確認者")
    if errors:
        raise ValueError(f"{path} 有 {len(errors)} 個問題：\n- " + "\n- ".join(errors))
    return {r["公廁名稱"]: r["場地 id"] for r in rows}
