"""桃園市公園（工務局，資料集 148726）的轉接器：特色遊戲場＋有遊具的埤塘公園（P4，decisions D14）。

輸入：data/raw/tyc/tycg-parks.json（fetch_tycg_parks.py）、data/raw/tyc/osm-matches.tsv（locate_tyc.py）、
      data/raw/tyc/manual-review.tsv（人工定位工具 pnpm tool:locate -- --city tyc）
規則（不推測）：
  - 設施文字對照到屬性 key；對不到的列在 unmapped-items.csv
  - 有遊具才上地圖：對到兒童遊具類的屬性，或寫了「遊戲場」「遊具」；只有步道、涼亭、球場的不上地圖（D13）
  - 停車、廁所：「˙」是有（y），空白是未提供（u，不是 n）
  - 同名的公園（特色遊戲場與埤塘公園都有）合併成一處
"""
import re

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


def map_facilities(text):
    """({屬性 key: 原文}, [對不到的原文])"""
    return map_items(split_items(text), RULES)


def has_playground(attrs, items):
    return any(k not in NOT_PLAYGROUND for k in attrs) or any(PLAYGROUND_WORDS.search(i) for i in items)


def flag(value):
    """「˙」→ y；空白 → u（未提供，不是沒有）"""
    return "y" if value.strip() == YES else "u"


def summary(rec):
    """說明：只列出資料的類別與設施清單（不轉載「特色」的宣傳文字）"""
    kinds = "、".join(sorted({r["類別"] for r in rec["rows"]}))
    return f"桃園市公園資料（{kinds}）列出的設施：{rec['facilities']}"
