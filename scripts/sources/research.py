"""人工查證（data/raw/<縣市>/research.json）：補在 OSM 場地上的遊具與設施，以及 OSM 只畫了公園的遊戲場（decisions D20）。

格式：
  {"verified_at": "2026-10-18",
   "sources": {"<來源 key>": {"label": "...", "url": "...", "kind": "news|article|open_data"}},
   "parks": {"<OSM ref>": ["<來源 key>", "<哪篇報導寫明裡面有遊戲場>", "<查證日期，選填>"]},
   "aka": {"<場地 id>": ["<來源 key>", "<新聞或文章用的名稱>"]},
   "places": {"<場地 id>": {"<屬性 key>": ["y|n", "<來源 key>", "<重新整理的說明>", "<查證日期，選填>"]}}}

查證日期沒寫就用 verified_at；之後補查的項目寫自己的日期，先前查的項目日期不變。

parks：OSM 公園裡沒有標遊戲場、但新聞、文章或政府開放資料寫明有的，用公園範圍中心點（data/raw/<縣市>/osm-parks.json，
scripts/fetch_osm_parks.py）建立場地，名稱用 OSM 公園名稱；依據的來源記在 listing_src／listing_at（places.listing_source）。
只記來源文字明確寫到的；「沒有」也要來源明寫才填 n。格式有錯就中止匯入，不會默默略過。
場地屬性已經有其他來源的值（例如桃園市府開放資料）時不覆蓋，也算格式錯誤。
"""
import math
from collections import Counter
from datetime import date

KINDS = {"news", "article", "open_data"}
VALUES = {"y", "n"}
UNKNOWN_TAIL = "遊具與設施還沒有資料，歡迎回報。"
RESEARCHED_TAIL = "部分遊具資料來自網路文章或新聞，現場可能已經不同，歡迎回報。"
# 補的項目全部來自政府開放資料（例如臺中市公園設施資料-兒童遊具）
OPEN_DATA_TAIL = "部分遊具資料來自政府開放資料，現場可能已經不同，歡迎回報。"
PARK_TEXT = "OpenStreetMap 標示的公園，新聞或網路文章寫明裡面有兒童遊戲場：{}。"
OPEN_DATA_PARK_TEXT = "OpenStreetMap 標示的公園，政府開放資料列有兒童遊具：{}。"
# 新公園的中心點離現有場地太近，可能是同一處（OSM 遊戲場已經在地圖上）
MIN_DISTANCE_M = 100


class ResearchError(ValueError):
    pass


def distance_m(a, b):
    lat = math.radians((a["lat"] + b["lat"]) / 2)
    return math.hypot((a["lat"] - b["lat"]) * 111_195, (a["lng"] - b["lng"]) * 111_195 * math.cos(lat))


def check_date(errors, where, entry, n):
    """entry 的第 n 項（選填）是查證日期"""
    if len(entry) > n:
        try:
            date.fromisoformat(entry[n] or "")
        except (TypeError, ValueError):
            errors.append(f"{where}：查證日期要是 YYYY-MM-DD")


def check_cited(errors, where, entry, sources, dated=False):
    lengths = (2, 3) if dated else (2,)
    if not isinstance(entry, list) or len(entry) not in lengths:
        errors.append(f"{where}：格式要是 [來源, 說明{', 查證日期（選填）' if dated else ''}]")
        return
    src, note = entry[:2]
    check_date(errors, where, entry, 2)
    if src not in sources:
        errors.append(f"{where}：來源 {src} 沒有定義")
    if not (note or "").strip():
        errors.append(f"{where}：要有說明")


def validate_base(research):
    errors = []
    try:
        date.fromisoformat(research.get("verified_at") or "")
    except ValueError:
        errors.append("verified_at 要是 YYYY-MM-DD")
    for key, s in (research.get("sources") or {}).items():
        if not (s.get("label") or "").strip() or not (s.get("url") or "").startswith("https://"):
            errors.append(f"來源 {key}：要有 label 與 https 網址")
        if s.get("kind") not in KINDS:
            errors.append(f"來源 {key}：kind 只能是 {'/'.join(sorted(KINDS))}")
    return errors


def validate_places(research, places, keys):
    errors = []
    sources = research.get("sources") or {}
    by_id = {p["id"]: p for p in places}
    ids = set(by_id)
    for pid, entry in (research.get("aka") or {}).items():
        if pid not in ids:
            errors.append(f"aka {pid}：沒有這個場地")
        check_cited(errors, f"aka {pid}", entry, sources)
    for pid, attrs in (research.get("places") or {}).items():
        if pid not in ids:
            errors.append(f"{pid}：沒有這個場地")
        for k, entry in attrs.items():
            where = f"{pid} {k}"
            if k not in keys:
                errors.append(f"{where}：沒有這個屬性")
            if not isinstance(entry, list) or len(entry) not in (3, 4):
                errors.append(f"{where}：格式要是 [值, 來源, 說明, 查證日期（選填）]")
                continue
            v, src, note = entry[:3]
            check_date(errors, where, entry, 3)
            place = by_id.get(pid)
            old = place["attrs"].get(k) if place else None
            if old and old["v"] != "u":  # 官方資料（例如桃園市府開放資料）已經有值：不覆蓋
                errors.append(f"{where}：已經有資料（來源 {old['src']}），不覆蓋")
            if v not in VALUES:
                errors.append(f"{where}：值只能是 y 或 n")
            if src not in sources:
                errors.append(f"{where}：來源 {src} 沒有定義")
            if not (note or "").strip():
                errors.append(f"{where}：要有說明")
    return errors


def park_places(research, osm_parks, places, keys, city):
    """parks 列出的公園 → 新場地（不修改 places）。回傳 (新場地, 錯誤)"""
    errors, new = [], []
    parks = research.get("parks") or {}
    if not parks:
        return new, errors
    fetched = (osm_parks or {}).get("parks", {})
    if set(fetched) != set(parks):
        return new, [f"osm-parks.json 跟 research.json 的 parks 對不上：請重新執行 python scripts/fetch_osm_parks.py {city}"]
    sources = research.get("sources") or {}
    ids = {p["id"] for p in places}
    for ref in sorted(parks):
        pid = f"{city}-osm-{ref}"
        where = f"parks {ref}"
        check_cited(errors, where, parks[ref], sources, dated=True)
        park = fetched[ref]
        if pid in ids:
            errors.append(f"{where}：已經是場地")
        if not (park.get("name") or "").strip():
            errors.append(f"{where}：OSM 公園沒有名稱")
        for other in places + new:
            d = distance_m(park, other)
            if d < MIN_DISTANCE_M:
                errors.append(f"{where}：離 {other['name']}（{other['id']}）只有 {d:.0f} 公尺，可能是同一處")
        # OSM 偶爾有沒有名稱的行政界（例如屏東縣來義鄉），跳過
        ds = sorted((x for x in park.get("districts", []) if x.get("name")), key=lambda x: -x["level"])
        ok = isinstance(parks[ref], list) and len(parks[ref]) in (2, 3)
        note = parks[ref][1] if ok else ""
        kind = (sources.get(parks[ref][0]) or {}).get("kind") if ok else None
        text = OPEN_DATA_PARK_TEXT if kind == "open_data" else PARK_TEXT
        new.append(dict(
            id=pid, name=(park.get("name") or "").strip(), district=ds[0]["name"] if ds else None, address=None,
            lat=park["lat"], lng=park["lng"],
            size=None, stay=None, stay_src=None, age_min=None, age_max=None,
            fee=None, indoor=False, hours=None, surface=None,
            status="open", summary=text.format(note.strip()) + UNKNOWN_TAIL,
            attrs={k: {"v": "u", "src": None, "note": None, "at": None} for k in keys},
            parking={"type": "u", "fee": "u", "spaces": None, "src": None, "note": None, "at": None},
            # OSM 只畫成一個點（node）的，沒有範圍，座標就是那個點
            source_coords=f"OpenStreetMap {ref}（leisure={park.get('leisure') or 'park'} {'點' if ref.startswith('n') else '範圍中心'}）",
            listing_src=parks[ref][0] if ok else None,
            listing_at=parks[ref][2] if ok and len(parks[ref]) == 3 else research.get("verified_at"),
            official_ref=[{"osm": ref}],
            area_ha=None,
            city=city,
        ))
    return new, errors


def apply(research, places, keys, city=None, osm_parks=None):
    """把查證結果寫進 places（就地修改，新公園加在最後），回傳要併進 seed 的來源"""
    new, park_errors = park_places(research, osm_parks, places, keys, city)
    errors = validate_base(research) + park_errors + validate_places(research, places + new, keys)
    if errors:
        raise ResearchError("research.json 有錯：\n  " + "\n  ".join(errors))
    places.extend(new)
    counts = Counter(p["name"] for p in places)
    for p in new:  # 跟其他場地同名、但在不同行政區（例如兩個中山公園）：加上行政區
        if counts[p["name"]] > 1:
            p["name"] = f"{p['name']}（{p['district'] or '行政區未知'}）"
    at = research["verified_at"]
    by_id = {p["id"]: p for p in places}
    for pid, (_, note) in (research.get("aka") or {}).items():
        p = by_id[pid]
        cut = len(p["summary"]) - len(UNKNOWN_TAIL) if p["summary"].endswith(UNKNOWN_TAIL) else len(p["summary"])
        p["summary"] = p["summary"][:cut] + note.strip() + "。" + p["summary"][cut:]
    for pid, attrs in (research.get("places") or {}).items():
        p = by_id[pid]
        for k, (v, src, note, *own) in attrs.items():
            p["attrs"][k] = {"v": v, "src": src, "note": note.strip(), "at": own[0] if own else at}
        # 全部來自開放資料的用開放資料的說法；有用到新聞或文章的照舊
        open_only = all(research["sources"][e[1]]["kind"] == "open_data" for e in attrs.values())
        tail = OPEN_DATA_TAIL if open_only else RESEARCHED_TAIL
        # 官方公園清單補地址時，說明後面會再接「地址來自…」，所以不只看結尾
        if attrs and UNKNOWN_TAIL in p["summary"]:
            p["summary"] = p["summary"].replace(UNKNOWN_TAIL, tail, 1)
        elif attrs and RESEARCHED_TAIL not in p["summary"] and OPEN_DATA_TAIL not in p["summary"]:
            # 官方清冊的場地（桃園）原本就有遊具資料
            p["summary"] = p["summary"].rstrip("。") + "。" + tail
    used = {e[1] for attrs in (research.get("places") or {}).values() for e in attrs.values()}
    used |= {e[0] for section in ("parks", "aka") for e in (research.get(section) or {}).values()}
    return {k: s for k, s in research["sources"].items() if k in used}
