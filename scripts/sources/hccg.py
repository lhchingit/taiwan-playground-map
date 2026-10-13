"""新竹市兒童遊戲場清冊（養護工程處）轉接器，座標來自 OpenStreetMap 比對結果。

輸入：
  data/raw/hsc/hccg-playgrounds.tsv    養工處清冊（116 筆，原文照錄）
  data/raw/hsc/osm-matches.tsv         清冊名稱 ↔ OSM 比對結果與座標
  data/raw/hsc/manual-review.tsv       人工處理結果（pnpm tool:locate；格式見 lib/manual.py）

規則（對應 CLAUDE.md 資料規則）：
  - 清冊只列「有」的遊具，沒列出的不代表沒有 → 只產生 y。
  - 清冊寫「無」的場地 items 為空，由 pipeline 列入 no-playground.csv。
"""
import re

from lib.attrs import map_items
from lib.io import read_tsv
from lib.manual import coord_label, read_manual, status_text

SOURCE_ID = "hccg"
SOURCE_SHORT = "清冊"
CITY = "hsc"

SOURCES = {
    "hccg": {"label": "新竹市兒童遊戲場清冊（養護工程處，政府資料開放平台；清冊未註明調查年份）",
             "url": "https://data.gov.tw/dataset/132713", "kind": "open_data"},
    "osm": {"label": "OpenStreetMap（© OpenStreetMap contributors, ODbL）",
            "url": "https://www.openstreetmap.org/copyright", "kind": "open_data"},
}

# 清冊遊具文字 → 屬性 key（依序比對，同一項可以對到多個 key）
RULES = [
    (r"溜索", ["zipline"]),
    (r"溜滑梯|滑梯|滑草坡|地景磨石子", ["slide"]),
    (r"鳥巢|圓盤鞦韆", ["nest_swing", "swing"]),  # 圓盤鞦韆就是鳥巢鞦韆
    (r"鞦韆", ["swing"]),
    (r"搖搖馬|彈簧馬|搖搖椅", ["spring_rider"]),
    (r"翹翹板|蹺蹺板", ["seesaw"]),
    (r"沙坑", ["sandpit"]),
    (r"攀岩", ["climbing_wall"]),
    (r"攀爬網", ["rope_net"]),
    (r"攀爬|盤爬架", ["climbing"]),
    (r"平衡木|梅花樁", ["balance"]),
    (r"吊橋", ["suspension_bridge"]),
    (r"旋轉", ["spinner"]),
    (r"彈跳床", ["trampoline"]),
    (r"傳聲筒", ["music"]),
    (r"共融|無障礙", ["inclusive"]),
]

# 清冊名稱 → 既有場地 id（名稱不同但是同一處）
ALIAS = {
    "新竹大砂坑公園": "hsc-hsinchu-park",       # 清冊把新竹公園內的沙坑遊戲區獨立列出
    "經國路園道": "hsc-green-road-smile-slide",  # 碗公型磨石子溜滑梯
}
# 既有場地的 OSM 座標（清冊沒有的另外指定）
COORD_OVERRIDE = {
    "hsc-nanliao-sand-water": (24.848985, 120.928307, "w598705370 親子沙灘戲水池"),
}


def parse_items(text):
    text = text.strip().rstrip("。")
    if text in ("", "無"):
        return []
    return [i.strip().rstrip("。") for i in re.split(r"[、，,]", text) if i.strip()]


def estimate(items):
    n = len(items)
    stay = "lt30" if n <= 2 else "30_60" if n <= 4 else "60_120"
    size = "S" if n <= 2 else "M" if n <= 5 else "L"
    return stay, size


def merge_duplicates(recs, manual):
    """標成「重複」的清冊資料：遊具合併到對應的那一筆（不遺失任何遊具），清冊原文兩筆都保留。
    對應的編號不存在、指向自己，或對應的那筆本身也是重複（含循環）時中止匯入。"""
    by_no = {r["ext_no"]: r for r in recs}
    for no, man in manual.items():
        if man["狀態"] != "duplicate":
            continue
        ref = man["對應編號"]
        if ref == no:
            raise ValueError(f"manual-review.tsv：#{no} 標成重複，但對應的是自己")
        if ref not in by_no or no not in by_no:
            raise ValueError(f"manual-review.tsv：#{no} 對應的清冊編號 #{ref} 不存在")
        if manual.get(ref, {}).get("狀態") == "duplicate":
            raise ValueError(f"manual-review.tsv：#{no} 對應的 #{ref} 也標成重複，請直接對應到要保留的那一筆")
        dup, target = by_no[no], by_no[ref]
        if not target["items"]:
            raise ValueError(f"manual-review.tsv：#{no} 對應的 #{ref} 清冊沒有遊具")
        for k, note in dup["attrs"].items():
            old = target["attrs"].get(k)
            target["attrs"][k] = note if not old or note in old.split("、") else f"{old}、{note}"
        target["items"] = target["items"] + dup["items"]
        target["stay"], target["size"] = estimate(target["items"])
        target["summary"] += f"；{dup['raw_text'].rstrip('。、')}（{SOURCE_SHORT}編號 {no}）"
        target.setdefault("merged_refs", []).append(dup["official_ref"])
    return recs


def records(root, review):
    hccg = read_tsv(root / "data/raw/hsc/hccg-playgrounds.tsv")
    osm = {r[0]: r for r in read_tsv(root / "data/raw/hsc/osm-matches.tsv")}
    manual = read_manual(root / "data/raw/hsc/manual-review.tsv")

    recs = []
    for no, name, district, text in hccg:
        district = district.replace("公所", "")
        items = parse_items(text)
        m = osm.get(no, [no, name, "none"])
        method = m[2] if len(m) > 2 else "none"
        osm_coord = (float(m[4]), float(m[5])) if len(m) >= 6 and m[4] else None

        # 人工處理結果：已定位用人工座標；找不到／廢除／待實地／重複的不上地圖（比對錯的 OSM 座標也不用）
        man = manual.get(no)
        coord, label = osm_coord, None
        if man and man["狀態"] == "located":
            coord, label = (float(man["緯度"]), float(man["經度"])), coord_label(man)
        elif man and man["狀態"] != "confirmed":
            coord = None
        status = status_text(man)

        mapped = {}
        if items:
            mapped, unmapped = map_items(items, RULES)
            if unmapped:
                review.add("unmapped-items", [no, name, "、".join(unmapped)])
            if method.startswith("review") or method.endswith("spread") or method == "contains":
                review.add("match-review",
                           [no, name, method, m[3] if len(m) > 3 else "", *(osm_coord or ("", "")), status])

        stay, size = estimate(items)
        recs.append({
            "ext_no": no, "name": name, "district": district, "raw_text": text,
            "items": items, "attrs": mapped,
            "coord": coord, "coord_ref": m[3] if len(m) > 3 else "", "match_method": method,
            # 人工定位時的座標來源說明（沒有時用 OSM 的說法）；review 清單的「處理狀態」
            "coord_label": label, "review_status": status,
            "summary": f"清冊列出的遊具：{text.rstrip('。、')}", "stay": stay, "size": size,
            "official_ref": {"hccg_no": int(no), "name": name, "items": text},
        })

    # 先全部讀完，才能把重複的遊具合併到後面（或前面）的那一筆
    yield from merge_duplicates(recs, manual)
