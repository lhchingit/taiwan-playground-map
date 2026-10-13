"""臺北市公園設施資料－兒童遊戲場（公園路燈工程管理處，資料集 136476）的轉接器（decisions D21）。

輸入：data/raw/tpe/pkl-arcade.json（fetch_tpe_parks.py）、data/raw/tpe/manual-names.tsv（用地編號名稱的人工命名）
規則（不推測）：
  - 一列是一處遊戲區；完全相同的列只算一次；同一個公園（名稱＋行政區）的遊戲區合併成一處場地
  - 遊具是「數量」：數量 > 0 → y；數量 0 → u（組合遊具裡可能就有滑梯、鞦韆，0 不代表沒有）
  - 組合遊具、擺盪船索、其他：不對照屬性，只寫進說明（擺盪船索比照桃園「擺盪大索不算鞦韆」）
  - 座標是 TWD97 TM2，轉成 WGS84；同一個公園有多處遊戲區時，用 (X, Y) 最小的那一處，讓結果固定
  - 名稱是用地編號（例如「園(信義)16」）的不上地圖，等人工命名
"""
import csv
import json
import re
from pathlib import Path

from lib.twd97 import to_wgs84

SOURCE_ID = "pkl"
CITY = "tpe"
SOURCES = {
    "pkl": {"label": "臺北市公園設施資料（公園路燈工程管理處，政府資料開放平台）",
            "url": "https://data.gov.tw/dataset/136476", "kind": "open_data"},
}

# 數量欄位 → 屬性 key
COUNT_RULES = [
    ("磨石滑梯數量", "slide"),
    ("鞦韆數量", "swing"),
    ("翹翹板數量", "seesaw"),
    ("搖搖樂數量", "spring_rider"),
    ("攀爬組數量", "climbing"),
    ("戲沙坑數量", "sandpit"),
]
# 不對照屬性、只寫進說明的數量欄位
NOTE_ONLY = [("組合遊具數量", "組合遊具"), ("擺盪船索數量", "擺盪船索"), ("其他數量", "其他遊具")]
ALL_COUNTS = [c for c, _ in COUNT_RULES] + [c for c, _ in NOTE_ONLY]

DISTRICTS = ["中正區", "大同區", "中山區", "松山區", "大安區", "萬華區",
             "信義區", "士林區", "北投區", "內湖區", "南港區", "文山區"]
# 用地編號，不是公園名稱：「園(信義)16」
ODD_NAME = re.compile(r"^園[（(]")

MANUAL_COLUMNS = ["編號", "名稱", "依據", "確認者", "日期"]


def park_key(r):
    return f"{r['公園名稱'].strip()}｜{r['行政區'].strip()}"


def district(raw):
    """「文山(木柵)」→ 文山區；「內湖」→ 內湖區；「園(信義)」→ 信義區；對不到 → None"""
    raw = raw.strip()
    m = re.match(r"^([^（(]*)[（(]([^）)]*)[）)]$", raw)
    for part in ([m.group(1), m.group(2)] if m else [raw]):
        name = part.strip()
        name = name if name.endswith("區") else f"{name}區"
        if name in DISTRICTS:
            return name
    return None


def count(row, column):
    value = (row.get(column) or "").strip()
    if not value:
        return 0
    if not value.isdigit():
        raise ValueError(f"{row['公園名稱']}：{column} 不是數字（{value}）")
    return int(value)


def group_parks(records):
    """[{no, name, district_raw, areas: [去重後的遊戲區列]}]，依編號排序"""
    parks, seen = {}, set()
    for r in records:
        sig = json.dumps(r, ensure_ascii=False, sort_keys=True)
        if sig in seen:
            continue
        seen.add(sig)
        p = parks.setdefault(r["no"], {"no": r["no"], "name": r["公園名稱"].strip(),
                                       "district_raw": r["行政區"].strip(), "areas": []})
        p["areas"].append(r)
    for p in parks.values():
        p["areas"].sort(key=lambda r: (float(r["X坐標"]), float(r["Y坐標"])))
    return [parks[k] for k in sorted(parks)]


def totals(park):
    return {c: sum(count(a, c) for a in park["areas"]) for c in ALL_COUNTS}


def map_counts(total):
    """{屬性 key: 說明}：只有數量 > 0 的（其他維持 u）"""
    return {key: f"公園處設施資料：{column.removesuffix('數量')} {total[column]} 座"
            for column, key in COUNT_RULES if total[column] > 0}


def items_present(total):
    """數量 > 0 的遊具種類（估算規模、停留時間用）"""
    return [c.removesuffix("數量") for c in ALL_COUNTS if total[c] > 0]


def coordinate(park):
    first = park["areas"][0]
    return to_wgs84(float(first["X坐標"]), float(first["Y坐標"]))


def summary(park, total):
    parts = [f"{c.removesuffix('數量')} {total[c]} 座" for c, _ in COUNT_RULES if total[c] > 0]
    extra = [f"{label} {total[c]} 座" for c, label in NOTE_ONLY if total[c] > 0]
    n = len(park["areas"])
    text = "臺北市公園設施資料" + (f"列出 {n} 處遊戲區" if n > 1 else "列出的遊戲區")
    if parts:
        text += f"：{'、'.join(parts)}"
    if extra:
        text += f"{'；另有' if parts else '：'}{'、'.join(extra)}"
    return text + "。"


def load_manual(path, nos):
    """{編號(str): 名稱}；編號不存在、沒有名稱、依據或確認者時中止"""
    path = Path(path)
    if not path.exists():
        return {}
    with open(path, encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f, delimiter="\t"))
    errors = []
    for r in rows:
        no = (r.get("編號") or "").strip()
        if no not in nos:
            errors.append(f"編號不存在：{no}")
        if not (r.get("名稱") or "").strip():
            errors.append(f"#{no}：要填名稱")
        if not r.get("依據") or not r.get("確認者"):
            errors.append(f"#{no}：要填依據與確認者")
    if errors:
        raise ValueError(f"{path} 有 {len(errors)} 個問題：\n- " + "\n- ".join(errors))
    return {r["編號"].strip(): r["名稱"].strip() for r in rows}
