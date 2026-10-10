"""下載「新竹市公廁地點資訊」（養護工程處，政府資料開放平台資料集 67757），
存成 data/raw/hsc/hccg-toilets.json。只在要更新時手動執行，結果提交進 repo；匯入不會連網路。

這份資料沒有座標，只能依名稱對應到場地：
  - 對到的場地：廁所設為「有」；育嬰台數量 > 0 時，哺乳室／尿布台也設為「有」
  - 對不到的列在 data/review/hsc/toilets-unmatched.csv，人工確認後填進 data/raw/hsc/toilet-aliases.tsv
授權：政府資料開放授權條款－第 1 版（見 docs/decisions.md D14）。
"""
import hashlib
import json
from datetime import date
from pathlib import Path

from lib.opendata import decode_records, download
from sources.hccg_datasets import DATASETS, LICENSE, dataset_page

ROOT = Path(__file__).resolve().parent.parent
DS = DATASETS["toilets"]
OUT = ROOT / DS["path"]


def main():
    raw = download(DS["url"])
    records = decode_records(raw)
    out = {
        "source": DS["source"],
        "dataset": dataset_page(DS),
        "url": DS["url"],
        "license": LICENSE,
        "fetched": date.today().isoformat(),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "records": records,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(records)} 筆 → {OUT.relative_to(ROOT)}（sha256 {out['sha256'][:12]}…）")


if __name__ == "__main__":
    main()
