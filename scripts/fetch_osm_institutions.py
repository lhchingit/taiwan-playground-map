"""下載每個 OSM 遊戲場是否位在學校、幼兒園、政府機關、研究機構、軍營的範圍內（Overpass is_in），
存成 data/raw/<縣市>/osm-institutions.json。osm.json 更新後要重新執行；結果提交進 repo，匯入不連網路。

  python3 scripts/fetch_osm_institutions.py nwt

用途（decisions D20）：在這些範圍內的遊戲場上課、上班時間通常不對外開放，匯入時自動排除，
列在 data/review/<縣市>/excluded-institution.csv。大學、專科不算（多數校園對外開放）。
檔案裡記著 osm.json 的 sha256，兩者不一致時匯入會中止。
授權：© OpenStreetMap contributors，ODbL。
"""
import hashlib
import json
import sys
from datetime import date
from pathlib import Path

from lib.overpass import batched, institution_query, overpass, parse_institutions

ROOT = Path(__file__).resolve().parent.parent
CITIES = ["hsq", "tyc", "mlc", "nwt", "txg", "khh", "tnn"]


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in CITIES:
        sys.exit(f"用法：python3 scripts/fetch_osm_institutions.py <{'|'.join(CITIES)}>")
    city = sys.argv[1]
    osm_path = ROOT / "data/raw" / city / "osm.json"
    osm_bytes = osm_path.read_bytes()
    playgrounds = json.loads(osm_bytes.decode("utf-8"))["playgrounds"]
    points = [(p["ref"], (p["lat"], p["lng"])) for p in playgrounds]
    result = batched(points, lambda batch: overpass(institution_query(batch), tries=3)[1], parse_institutions)
    missing = [r for r, _ in points if r not in result]
    if missing:
        sys.exit(f"查詢沒有回傳：{missing[:5]}…（共 {len(missing)} 筆），請稍後再試")
    out = {
        "source": "OpenStreetMap（Overpass API）",
        "license": "© OpenStreetMap contributors，ODbL",
        "fetched": date.today().isoformat(),
        "osm_json_sha256": hashlib.sha256(osm_bytes).hexdigest(),
        "note": "遊戲場所在的學校、幼兒園、政府機關、軍營（只列在範圍內的）；匯入時自動排除",
        "inside": {r: result[r] for r in sorted(result) if result[r]},
    }
    path = ROOT / "data/raw" / city / "osm-institutions.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"{path.relative_to(ROOT)}：遊戲場 {len(points)}，在學校／機關範圍內 {len(out['inside'])}")


if __name__ == "__main__":
    main()
