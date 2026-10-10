"""把轉接器輸出的 SourceRecord 合併到既有場地，或建立新場地。

SourceRecord（dict）：
  ext_no        來源裡的編號（字串）
  name, district
  raw_text      來源原文（照錄，用在 review 清單與 official_ref）
  items         拆好的原文項目；空的代表來源寫「無」
  attrs         {屬性 key: 原文}，只有「有」（來源沒列出的不代表沒有）
  coord         (lat, lng) 或 None；只能來自 OSM / TGOS / 實地測量
  coord_ref     座標來源的編號，例如 OSM 的 w447990023
  match_method  名稱比對方式
  summary, stay, size   新建場地時用
  official_ref  {"<來源>_no": ..., "name": ..., "items": ...}
"""
from .attrs import blank_attrs


def find_existing(rec, by_id, by_name, alias):
    return by_id.get(alias.get(rec["name"], "")) or by_name.get(rec["name"])


def merge_attrs(target, rec, src_id, src_short, today, review):
    """來源寫「有」時：現有是 n → 列入 conflicts，不自動覆蓋；現有是 u 或只是網友線索（lead）→ 改用這個來源。"""
    for k, item in rec["attrs"].items():
        a = target["attrs"][k]
        if a["v"] == "n":
            review.add("conflicts", [target["name"], k, f"現有：無（{a['src']}：{a['note'] or ''}）", f"{src_short}：{item}"])
        elif a["v"] == "u" or a["src"] == "lead":
            target["attrs"][k] = {"v": "y", "src": src_id, "note": item, "at": today}


def place_id(city, source, ext_no):
    """decisions D12：<縣市代碼>-<來源>-<編號>，id 一旦公開就不改"""
    return f"{city}-{source}-{int(ext_no):03d}"


def new_place(rec, uid, display_name, keys, src_id, today):
    attrs = blank_attrs(keys)
    for k, item in rec["attrs"].items():
        attrs[k] = {"v": "y", "src": src_id, "note": item, "at": today}
    return dict(
        id=uid, name=display_name, district=rec["district"], address=None,
        lat=rec["coord"][0], lng=rec["coord"][1],
        size=rec["size"], stay=rec["stay"], stay_src="est", age_min=None, age_max=None,
        # 清冊沒有收費資訊，不推測：fee 為 None（未知）
        fee=None, indoor=False, hours=None, surface=None, status="open",
        summary=rec["summary"],
        attrs=attrs,
        parking={"type": "u", "fee": "u", "spaces": None, "src": None, "note": None, "at": None},
        source_coords=rec.get("coord_label") or f"OpenStreetMap {rec['coord_ref']}（比對方式：{rec['match_method']}）",
        official_ref=[rec["official_ref"]],
    )
