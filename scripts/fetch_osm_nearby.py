"""下載人工命名工具（pnpm tool:name）的提示：待命名的每一處附近 150 公尺內有名稱的 OSM 地點，
存成 data/raw/<縣市>/osm-nearby.json。只在要命名前手動執行，結果提交進 repo；工具開啟時不用連網路。

  python3 scripts/fetch_osm_nearby.py nwt

待命名的清單（跟 scripts/tools/name/items.ts 相同）：
  - data/review/<縣市>/unnamed.csv：沒有名稱的 OSM 遊戲場
  - data/review/tyc/osm-near-official.csv：離官方場地很近、名稱不同（座標從 data/raw/tyc/osm.json 取）
  - data/review/tpe/odd-names.csv：名稱是用地編號（鍵是編號）
這些名稱**只是提示**，匯入不會讀這個檔，名稱一定要人確認後才寫進 manual-names.tsv（decisions D20）。
授權：© OpenStreetMap contributors，ODbL。
"""
import csv
import json
import sys
from datetime import date
from pathlib import Path

from lib.overpass import batched, nearby_query, overpass, parse_nearby

ROOT = Path(__file__).resolve().parent.parent
CITIES = ["hsq", "tyc", "mlc", "tpe", "nwt", "txg", "khh", "tnn", "cyi", "chw", "pif", "yun", "ila", "cyq", "nan", "hua", "ttt", "kee"]


def read_csv(path):
    if not path.exists():
        return []
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def queue(city):
    """[(鍵, (lat, lon), 遊戲場本身的 OSM ref 或 None)]"""
    review = ROOT / "data/review" / city
    points = [(r["OSM"], (float(r["緯度"]), float(r["經度"])), r["OSM"]) for r in read_csv(review / "unnamed.csv")]
    near = read_csv(review / "osm-near-official.csv")
    if near:
        osm = {p["ref"]: p for p in json.loads((ROOT / "data/raw" / city / "osm.json").read_text(encoding="utf-8"))
               ["playgrounds"]}
        points += [(r["OSM"], (osm[r["OSM"]]["lat"], osm[r["OSM"]]["lng"]), r["OSM"]) for r in near]
    points += [(r["編號"], (float(r["緯度"]), float(r["經度"])), None) for r in read_csv(review / "odd-names.csv")]
    return points


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in CITIES:
        sys.exit(f"用法：python3 scripts/fetch_osm_nearby.py <{'|'.join(CITIES)}>")
    city = sys.argv[1]
    points = queue(city)
    coords = {k: c for k, c, _ in points}
    own = {k: o for k, _, o in points if o}
    result = batched([(k, c) for k, c, _ in points],
                     lambda batch: overpass(nearby_query(batch), tries=3)[1],
                     lambda elements: parse_nearby(elements, coords, own))
    missing = [k for k in coords if k not in result]
    if missing:
        sys.exit(f"查詢沒有回傳：{missing[:5]}…（共 {len(missing)} 筆），請稍後再試")
    out = {
        "source": "OpenStreetMap（Overpass API）",
        "license": "© OpenStreetMap contributors，ODbL",
        "fetched": date.today().isoformat(),
        "radius_m": 150,
        "note": "人工命名工具的提示，只是參考；匯入不使用",
        "nearby": {k: result[k] for k in sorted(result)},
    }
    path = ROOT / "data/raw" / city / "osm-nearby.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    with_hint = sum(1 for v in result.values() if v)
    print(f"{path.relative_to(ROOT)}：{len(result)} 處，其中 {with_hint} 處附近有名稱")


if __name__ == "__main__":
    main()
