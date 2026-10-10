"""下載「新竹市公園管理維護地點」（養護工程處，政府資料開放平台資料集 67762），
存成 data/raw/hsc/hccg-parks.json。只在要更新時手動執行，結果提交進 repo；匯入不會連網路。

這份資料沒有座標，用途：
  - 補上場地的面積（area_ha），只用完全相同的公園名稱對應
  - 人工定位工具顯示「地點」「里別」當提示
授權：政府資料開放授權條款－第 1 版（見 docs/decisions.md D14）。
"""
import hashlib
import json
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data/raw/hsc/hccg-parks.json"
DATASET = "https://data.gov.tw/dataset/67762"
URL = "https://odws.hccg.gov.tw/001/Upload/25/opendataback/9059/71/4a6003c3-fe42-4e54-be5c-4c888bb6c754.json"


def main():
    req = urllib.request.Request(URL, headers={"User-Agent": "playmap-data/0.1"})
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
    records = json.loads(raw.decode("utf-8-sig"))
    out = {
        "source": "新竹市公園管理維護地點（新竹市政府養護工程處）",
        "dataset": DATASET,
        "url": URL,
        "license": "政府資料開放授權條款－第 1 版",
        "fetched": date.today().isoformat(),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "records": records,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(records)} 筆 → {OUT.relative_to(ROOT)}（sha256 {out['sha256'][:12]}…）")


if __name__ == "__main__":
    main()
