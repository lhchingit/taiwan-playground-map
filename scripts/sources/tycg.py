"""桃園市公園（工務局，資料集 148726）的轉接器：特色遊戲場＋有遊具的埤塘公園（P4，decisions D14）。

輸入：data/raw/tyc/tycg-parks.json（fetch_tycg_parks.py）、data/raw/tyc/osm-matches.tsv（locate_tyc.py）、
      data/raw/tyc/manual-review.tsv（人工定位工具 pnpm tool:locate -- --city tyc）
規則（不推測）：
  - 設施文字對照到屬性 key（RULES）；RULES 對不到的，看人工決定的清單 data/raw/tyc/item-decisions.tsv
    （對照到某個屬性，或「不對照」）；都沒有的才列在 unmapped-items.csv 等人決定
  - 有遊具才上地圖：對到兒童遊具類的屬性，或寫了「遊戲場」「遊具」；只有步道、涼亭、球場的不上地圖（D13）
  - 停車、廁所：「˙」是有（y），空白是未提供（u，不是 n）
  - 同名的公園（特色遊戲場與埤塘公園都有）合併成一處
"""
import csv
import math
import re
from pathlib import Path

from lib.attrs import map_items

SOURCE_ID = "tycg"
SOURCE_SHORT = "桃園市公園資料"
CITY = "tyc"
SOURCES = {
    "tycg": {"label": "桃園市公園（工務局，政府資料開放平台）", "url": "https://data.gov.tw/dataset/148726",
             "kind": "open_data"},
}

# 設施文字 → 屬性 key（依序比對，同一項可以對到多個 key）
RULES = [
    (r"溜索|滑索", ["zipline"]),
    (r"溜滑梯|滑梯|滑道|流滑梯", ["slide"]),
    (r"鳥巢", ["nest_swing", "swing"]),
    (r"鞦韆", ["swing"]),
    (r"搖搖馬|搖搖樂|搖搖椅|彈簧馬", ["spring_rider"]),
    (r"翹翹板|蹺蹺板", ["seesaw"]),
    (r"沙坑", ["sandpit"]),
    (r"玩沙台|戲沙盤", ["sand_table"]),
    (r"攀岩|攀爬牆", ["climbing_wall"]),
    (r"攀爬網|繩網|蜘蛛網", ["rope_net"]),
    (r"攀爬|盤爬", ["climbing"]),
    (r"平衡木|梅花樁|獨木橋", ["balance"]),
    (r"吊橋", ["suspension_bridge"]),
    (r"旋轉", ["spinner"]),
    (r"彈跳床", ["trampoline"]),
    (r"傳聲筒|敲擊|聲音遊戲", ["music"]),
    (r"共融|無障礙", ["inclusive"]),
    (r"單槓|雲梯", ["bars"]),
    (r"隧道|鑽籠|涵管", ["tunnel"]),
    (r"低齡兒童遊具組", ["toddler_zone"]),
    (r"戲水|水柱", ["water_play"]),
    (r"樹屋|瞭望台", ["tree_house"]),
    (r"籃球場|球場", ["ball_court"]),
]
# 不算兒童遊具的屬性（只有這些的公園不上地圖）
NOT_PLAYGROUND = {"ball_court", "open_lawn", "skatepark", "pushbike"}
# 籠統寫「有遊戲場」：對不到具體遊具，但代表有遊戲場
PLAYGROUND_WORDS = re.compile(r"遊戲場|遊具")

YES = "˙"


def split_items(text):
    """以「、」「/」「，」分隔設施，但括號裡的頓號不算：「磨石子(直道、彎道)溜滑梯」是一項"""
    items, buf, depth = [], [], 0
    for ch in text:
        if ch in "(（":
            depth += 1
        elif ch in ")）":
            depth = max(0, depth - 1)
        if depth == 0 and ch in "、/／，,":
            items.append("".join(buf))
            buf = []
        else:
            buf.append(ch)
    items.append("".join(buf))
    return [i.strip().rstrip("。") for i in items if i.strip().rstrip("。")]


NO_MAP = "不對照"
DECISION_COLUMNS = ["用語", "決定", "理由", "決定者", "日期"]


def load_decisions(path, keys):
    """{用語: 屬性 key 或「不對照」}；決定不是已知的屬性、或沒有理由與決定者時中止匯入"""
    path = Path(path)
    if not path.exists():
        return {}
    with open(path, encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f, delimiter="\t"))
    errors = []
    for r in rows:
        term, decision = (r.get("用語") or "").strip(), (r.get("決定") or "").strip()
        if not term:
            errors.append("有一列沒有用語")
        if decision != NO_MAP and decision not in keys:
            errors.append(f"{term}：決定要是屬性 key 或「{NO_MAP}」（{decision}）")
        if not r.get("理由") or not r.get("決定者"):
            errors.append(f"{term}：要填理由與決定者")
    if errors:
        raise ValueError(f"{path} 有 {len(errors)} 個問題：\n- " + "\n- ".join(errors))
    return {r["用語"].strip(): r["決定"].strip() for r in rows}


def map_facilities(text, decisions=None):
    """({屬性 key: 原文}, [還沒決定的原文])。RULES 對不到的，再看人工決定"""
    attrs, unmapped = map_items(split_items(text), RULES)
    pending = []
    for item in unmapped:
        decision = (decisions or {}).get(item)
        if decision is None:
            pending.append(item)
        elif decision != NO_MAP:
            attrs[decision] = f"{attrs[decision]}、{item}" if decision in attrs else item
    return attrs, pending


def has_playground(attrs, items):
    return any(k not in NOT_PLAYGROUND for k in attrs) or any(PLAYGROUND_WORDS.search(i) for i in items)


def flag(value):
    """「˙」→ y；空白 → u（未提供，不是沒有）"""
    return "y" if value.strip() == YES else "u"


# OSM 遊戲場離官方場地多近（公尺）、名稱又不同時，要人工判斷是不是同一處
NEAR_M = 150
# 名稱相同也要在這個距離內才算同一處：桃園有好幾個「中正公園」
SAME_NAME_M = 500
# Overpass 的 area id：way 加 2400000000、relation 加 3600000000
AREA_OFFSET = {"w": 2400000000, "r": 3600000000}


def area_id(ref):
    return AREA_OFFSET[ref[0]] + int(ref[1:]) if ref and ref[0] in AREA_OFFSET else None


def distance_m(a, b):
    lat1, lng1, lat2, lng2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def name_key(name):
    return "".join((name or "").split())


def split_osm(playgrounds, officials, manual):
    """OSM 遊戲場分成（補充的, 已涵蓋的, 待判斷的）（P4 桃園第二階段，decisions D20）。

    officials：[{id, name, lat, lng, osm}]，osm 是官方場地座標所用的 OSM 物件（人工定位的是 None）。
    依序判斷，不推測：
      1. 所在公園（或遊戲場本身）就是官方場地比對到的 OSM 物件 → 涵蓋
      2. 所在公園或遊戲場的名稱與官方場地相同，且在 SAME_NAME_M 公尺內 → 涵蓋（同名但很遠的是別的公園）
      3. 離官方場地 NEAR_M 公尺內、名稱不同：manual-names.tsv 還沒判斷 → 待判斷；判斷過就照一般規則
      4. 其他 → 補充
    已涵蓋與待判斷的每一筆是 (遊戲場, 官方場地, 依據)。
    """
    by_area = {area_id(o["osm"]): o for o in officials if area_id(o["osm"])}
    by_ref = {o["osm"]: o for o in officials if o["osm"]}
    by_name = {}
    for o in officials:
        by_name.setdefault(name_key(o["name"]), []).append(o)
    extra, covered, near = [], [], []
    for pg in playgrounds:
        parks = pg.get("parks", [])
        hit = by_ref.get(pg["ref"]) or next((by_area[p["area"]] for p in parks if p["area"] in by_area), None)
        if hit:
            covered.append((pg, hit, "同一個 OSM 物件"))
            continue
        names = [p["name"] for p in parks] + [pg.get("tags", {}).get("name", "")]
        here = (pg["lat"], pg["lng"])
        hit = next((o for n in names for o in by_name.get(name_key(n), [])
                    if distance_m(here, (o["lat"], o["lng"])) <= SAME_NAME_M), None)
        if hit:
            covered.append((pg, hit, "名稱相同"))
            continue
        close = sorted((distance_m(here, (o["lat"], o["lng"])), o["id"], o) for o in officials)
        if close and close[0][0] <= NEAR_M and pg["ref"] not in manual:
            near.append((pg, close[0][2], f"{close[0][0]:.0f} 公尺"))
            continue
        extra.append(pg)
    return extra, covered, near


def summary(rec):
    """說明：只列出資料的類別與設施清單（不轉載「特色」的宣傳文字）"""
    kinds = "、".join(sorted({r["類別"] for r in rec["rows"]}))
    return f"桃園市公園資料（{kinds}）列出的設施：{rec['facilities']}"
