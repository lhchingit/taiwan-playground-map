"""臺南市公園設施資料（臺南市政府工務局，資料集 53556）的轉接器（decisions D21）。

輸入：data/raw/tnn/tnn-parks.json（fetch_tnn_parks.py）
規則（不推測）：
  - 一列是一個公園。兒童遊具區的欄位任一數量 > 0 才算有遊戲場；只有體健設施的不上地圖
  - 設施是「數量」：數量 > 0 → y；0 或空白 → u（不是「沒有」，例如組合遊具裡可能就有滑梯）
  - 大型／中型／小型兒童遊具（組合遊具）、轉轉拼圖等：不對照屬性，只寫進說明
  - 汽車停車位 > 0 → 停車類型是停車場，格數用資料的數字；收費未知
  - 座標是 WGS84。沒有座標的，用同一個行政區、所在公園同名的 OSM 遊戲場座標（OSM ref 最小的那個）
  - 名稱是用地編號（「公一」「公兒三」）的不上地圖，等人工命名
  - 名稱裡用地編號的括號拿掉再顯示（「南門公園(公8)」→ 南門公園），原文保留在 official_ref；
    「公兒(中埕里鄰公園)」這種取括號裡的名稱；「(舊苗圃)」「(一)」等說明保留
  - OSM 補充裡名稱不像公共遊戲場的（沒有公園、遊戲、兒童…等字，或本身是用地編號）先不上地圖，等人工確認
"""
import re

SOURCE_ID = "tnn"
CITY = "tnn"
SOURCES = {
    "tnn": {"label": "臺南市公園設施資料（臺南市政府工務局，政府資料開放平台）",
            "url": "https://data.gov.tw/dataset/53556", "kind": "open_data"},
}

# 兒童遊具區的欄位（任一 > 0 才算有遊戲場）
PLAY_COLUMNS = [
    "搖搖椅數量", "搖搖樂數量", "攀岩牆數量", "旋轉地球數量", "鐵馬搖椅數量", "雙座潛艇滑軌數量", "天梯爬梯數量",
    "鏡子護欄數量", "泡泡窗數量", "方向盤數量", "螺旋滑梯數量", "海底峽谷爬梯數量", "彈力蹺蹺板數量", "蹺蹺板數量",
    "攀爬梯網狀爬架數量", "盪鞦韆數量", "溜滑梯數量", "吊橋數量", "親子木樁數量", "沙坑數量",
    "大型兒童遊具數量", "中型兒童遊具數量", "小型兒童遊具數量", "轉轉拼圖數量", "其他遊樂設施數量",
]
# 數量欄位 → 屬性 key（同一個 key 可以有好幾個欄位）
COUNT_RULES = [
    ("溜滑梯數量", "slide"), ("螺旋滑梯數量", "slide"),
    ("盪鞦韆數量", "swing"),
    ("蹺蹺板數量", "seesaw"), ("彈力蹺蹺板數量", "seesaw"),
    ("搖搖樂數量", "spring_rider"), ("搖搖椅數量", "spring_rider"),
    ("攀岩牆數量", "climbing_wall"),
    ("攀爬梯網狀爬架數量", "climbing"),
    ("旋轉地球數量", "spinner"),
    ("吊橋數量", "suspension_bridge"),
    ("沙坑數量", "sandpit"),
    ("天梯雲梯數量", "bars"),
    ("平衡木數量", "balance"),
    ("籃球場數量", "ball_court"), ("網球場數量", "ball_court"), ("羽球場數量", "ball_court"), ("排球場數量", "ball_court"),
    ("洗腳池數量", "footwash"),
    ("高燈數量", "lighting"), ("矮燈數量", "lighting"),
    ("公廁數量", "toilet"), ("移動式廁間數量", "toilet"),
]
MAPPED = {c for c, _ in COUNT_RULES}
# 兒童遊具區裡不對照屬性的（只寫進說明）
NOTE_ONLY = [c for c in PLAY_COLUMNS if c not in MAPPED]
PARKING_COLUMN = "汽車停車位數量"

# 用地編號，不是公園名稱：「公一」「公兒三」「公1」「公(兒)2」「公兒37」
ODD_NAME = re.compile(r"^公[（(]?兒?[)）]?[A-Za-z]?[一二三四五六七八九十0-9０-９]+$")
# 用地編號的括號：「(公8)」「(公六)」「(公兒E53)」「(公兒1-4)」「(綠4)」「(富台段公兒20)」「(灣裡公42)」「(公)」；說明性的括號不算
CODE_PAREN = re.compile(r"\s*[（(][^（）()]*?(?:公兒|兒公|公|兒|綠|廣)[A-Za-z]?[0-9０-９一二三四五六七八九十\-－]*[)）]")
# 「公兒(中埕里鄰公園)」：真正的名稱在括號裡
CODE_PREFIX = re.compile(r"^(?:公兒|公|兒)[（(](.+)[)）]$")
# 像公共遊戲場的名稱（OSM 補充用；沒有這些字的先等人工確認）
PLAYGROUND_NAME = re.compile(r"公園|遊戲|遊樂|兒童|親子|廣場|綠地|playground|park", re.I)


def label(column):
    return column.removesuffix("數量")


def display_name(name):
    """去掉用地編號的括號（「光州公園(公兒13)(原大世界公園)」→ 光州公園(原大世界公園)）"""
    name = name.strip()
    m = CODE_PREFIX.match(name)
    if m:
        name = m.group(1).strip()
    return CODE_PAREN.sub("", name).strip() or name


def suspicious_osm_name(name):
    """OSM 遊戲場自己的名稱不像公共遊戲場（例如「碰碰車」「保齡球館」），或是用地編號"""
    return bool(ODD_NAME.match(name)) or not PLAYGROUND_NAME.search(name)


def park_key(r):
    return f"{r['所在轄區'].strip()}｜{r['公園名稱'].strip()}"


def count(row, column):
    """空白 → 0；不是整數時中止（不猜）"""
    value = (row.get(column) or "").strip()
    if not value:
        return 0
    try:
        number = float(value)
    except ValueError:
        raise ValueError(f"{row['公園名稱']}：{column} 不是數字（{value}）") from None
    if number < 0 or number != int(number):
        raise ValueError(f"{row['公園名稱']}：{column} 不是 0 以上的整數（{value}）")
    return int(number)


def is_playground(row):
    return any(count(row, c) > 0 for c in PLAY_COLUMNS)


def map_counts(row):
    """{屬性 key: 說明}：只有數量 > 0 的（其他維持 u，不寫 n）"""
    notes = {}
    for column, key in COUNT_RULES:
        n = count(row, column)
        if n > 0:
            notes.setdefault(key, []).append(f"{label(column)} {n}")
    return {k: f"公園設施資料：{'、'.join(v)}" for k, v in notes.items()}


def items_present(row):
    """數量 > 0 的兒童遊具種類（估算規模、停留時間用）"""
    return [label(c) for c in PLAY_COLUMNS if count(row, c) > 0]


def parking(row):
    """汽車停車位 > 0 → 停車場與格數；否則 None（停車維持未知）"""
    n = count(row, PARKING_COLUMN)
    return {"type": "lot", "spaces": n, "note": f"公園設施資料：汽車停車位 {n} 格"} if n > 0 else None


def area_ha(row):
    value = (row.get("面積公頃") or "").strip()
    try:
        return round(float(value), 4) if value and float(value) > 0 else None
    except ValueError:
        return None


def coordinate(row):
    """(緯度, 經度)；沒有或看不懂時是 None"""
    try:
        lat, lng = float(row.get("緯度") or ""), float(row.get("經度") or "")
    except ValueError:
        return None
    return (lat, lng) if lat and lng else None


def name_key(name):
    return "".join((name or "").split())


def osm_coordinate(name, district, playgrounds, district_of, ref_key):
    """沒有座標的公園：同一個行政區、所在公園同名的 OSM 遊戲場（ref 最小的那個）→ (lat, lng, ref)；沒有就是 None"""
    hits = [pg for pg in playgrounds
            if district_of(pg) == district and any(name_key(p["name"]) == name_key(name) for p in pg.get("parks", []))]
    if not hits:
        return None
    pg = min(hits, key=lambda p: ref_key(p["ref"]))
    return pg["lat"], pg["lng"], pg["ref"]


def summary(row):
    play = [f"{label(c)} {count(row, c)} 座" for c in PLAY_COLUMNS if c in MAPPED and count(row, c) > 0]
    extra = [f"{label(c)} {count(row, c)} 座" for c in NOTE_ONLY if count(row, c) > 0]
    text = "臺南市公園設施資料列出的兒童遊具"
    if play:
        text += f"：{'、'.join(play)}"
    if extra:
        text += f"{'；另有' if play else '：'}{'、'.join(extra)}"
    return text + "。"
