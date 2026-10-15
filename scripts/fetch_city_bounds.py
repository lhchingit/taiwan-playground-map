"""從 OpenStreetMap（Nominatim）取得各縣市行政界的範圍，存成 data/raw/osm-city-bounds.json。

用途：沒有場地的縣市（例如尚未上線的新竹縣）沒辦法用「場地座標外擴 1 公里」算範圍，
改用 OSM 行政界的 bbox，讓前端能依出發點判斷要載入哪些縣市（decisions D4）。

只在新增縣市或需要更新時手動執行；結果提交進 repo，seed 不會連網路。
遵守 Nominatim 使用政策：帶 User-Agent、每秒最多 1 次。
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data/raw/osm-city-bounds.json"
USER_AGENT = "playmap-seed/0.1 (https://github.com/lhchingit/taiwan-playground-map)"

# 與 supabase/migrations 的 cities 相同（0001_init、0010_city_taipei、0011_city_new_taipei、0012_city_taichung、0013_city_kaohsiung、0015_city_tainan、0016_city_chiayi、0017_city_changhua、0018_city_pingtung、0019_city_yunlin、0020_city_yilan、0021_city_chiayi_county）
CITIES = [("hsc", "新竹市"), ("hsq", "新竹縣"), ("tyc", "桃園市"), ("mlc", "苗栗縣"), ("tpe", "臺北市"), ("nwt", "新北市"), ("txg", "臺中市"), ("khh", "高雄市"), ("tnn", "臺南市"), ("cyi", "嘉義市"), ("chw", "彰化縣"), ("pif", "屏東縣"), ("yun", "雲林縣"), ("ila", "宜蘭縣"), ("cyq", "嘉義縣")]


def search(name):
    q = urllib.parse.urlencode({"q": name, "format": "jsonv2", "countrycodes": "tw", "limit": 10})
    req = urllib.request.Request(f"https://nominatim.openstreetmap.org/search?{q}",
                                 headers={"User-Agent": USER_AGENT, "Accept-Language": "zh-TW"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def main():
    out = {
        "source": "OpenStreetMap Nominatim（© OpenStreetMap contributors, ODbL）",
        "fetched": date.today().isoformat(),
        "note": "bbox 為 [西, 南, 東, 北]；只用在沒有場地的縣市（scripts/seed/transform.ts）",
        "cities": {},
    }
    missing = []
    for i, (code, name) in enumerate(CITIES):
        if i:
            time.sleep(1.1)
        hits = [h for h in search(name)
                if h.get("category") == "boundary" and h.get("type") == "administrative"
                and h.get("name") == name]
        if not hits:
            missing.append(name)
            continue
        h = hits[0]
        south, north, west, east = (float(x) for x in h["boundingbox"])
        out["cities"][code] = {
            "name": name,
            "osm": f"{h['osm_type']}/{h['osm_id']}",
            "bbox": [west, south, east, north],
        }
        print(f"{code} {name} {h['osm_type']}/{h['osm_id']} {out['cities'][code]['bbox']}")

    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    if missing:
        sys.exit(f"找不到行政界：{'、'.join(missing)}（已寫入其他縣市）")


if __name__ == "__main__":
    main()
