"""下載「臺北市公園設施資料」的兒童遊戲場（公園路燈工程管理處，政府資料開放平台資料集 136476），
存成 data/raw/tpe/pkl-arcade.json。只在要更新時手動執行，結果提交進 repo；匯入不會連網路。

- 原文照錄（含完全相同的重複列；去重在匯入時做）。
- 原始資料沒有編號，自己維護穩定編號（no）：以「公園名稱｜行政區」為鍵（「新興公園」在中山、北投各有一個），
  相同的沿用上一版的編號，新的接著編，刪除的編號不重用。場地 id 是 tpe-pkl-<no>。
授權：政府資料開放授權條款－第 1 版（見 docs/decisions.md D14、D21）。
"""
import hashlib
import json
from datetime import date
from pathlib import Path

from lib.numbering import assign_numbers
from lib.opendata import decode_records, download
from sources.pkl import park_key

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data/raw/tpe/pkl-arcade.json"
DATASET = "https://data.gov.tw/dataset/136476"
URL = "https://tppkl.blob.core.windows.net/blobfs/TaipeiParkFacility_Arcade.json"


def main():
    previous = {}
    if OUT.exists():
        old = json.loads(OUT.read_text(encoding="utf-8"))
        previous = {park_key(r): r["no"] for r in old["records"]}
    raw = download(URL)
    records = assign_numbers(decode_records(raw), previous, key=park_key)
    out = {
        "source": "臺北市公園設施資料－兒童遊戲場（臺北市政府工務局公園路燈工程管理處）",
        "dataset": DATASET,
        "license": "政府資料開放授權條款－第 1 版",
        "url": URL,
        "fetched": date.today().isoformat(),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "note": "X坐標、Y坐標是 TWD97 二度分帶（TM2），匯入時轉成 WGS84（scripts/lib/twd97.py）",
        "records": records,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(records)} 列 → {OUT.relative_to(ROOT)}（{len({r['no'] for r in records})} 個公園）")


if __name__ == "__main__":
    main()
