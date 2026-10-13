"""下載「新北市公園」（新北市政府農業局，政府資料開放平台資料集 124566），存成 data/raw/nwt/ntpc-parks.json。
只在要更新時手動執行，結果提交進 repo；匯入不會連網路。

用途：只用來替 OpenStreetMap 遊戲場補地址與管理單位（scripts/sources/ntpc_parks.py）。
這份清單沒有座標、也沒有遊具，看不出哪個公園有遊戲場，所以不單獨上地圖（decisions D13、D20）。
只存名稱、區域、地址、管理單位；市話用不到，不存。
授權：政府資料開放授權條款－第 1 版。
"""
import csv
import hashlib
import io
import json
from datetime import date
from pathlib import Path

from lib.opendata import download

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data/raw/nwt/ntpc-parks.json"
DATASET = "https://data.gov.tw/dataset/124566"
URL = "https://data.ntpc.gov.tw/api/datasets/5fe3a136-29cc-4695-a17e-6636a32c3342/csv/file"
FIELDS = ["seqno", "name", "area", "address", "management"]


def main():
    raw = download(URL)
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
    out = {
        "source": "新北市公園（新北市政府農業局）",
        "dataset": DATASET,
        "license": "政府資料開放授權條款－第 1 版",
        "url": URL,
        "fetched": date.today().isoformat(),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "note": "只存名稱、區域、地址、管理單位（不存市話）；沒有座標與遊具",
        "records": [{f: (r.get(f) or "").strip() for f in FIELDS} for r in rows],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(rows)} 筆 → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
