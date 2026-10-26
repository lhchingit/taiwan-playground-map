"""下載「臺中市公園設施資料-兒童遊具」（臺中市政府建設局，政府資料開放平台資料集 152426），存成 data/raw/txg/txg-play.json。
只在要更新時手動執行，結果提交進 repo；匯入不會連網路。

用途：各公園的兒童遊具數量，人工比對到場地後寫進 data/raw/txg/research.json（decisions D20）。
資料沒有座標；不在地圖上的公園用 OSM 同區同名公園的範圍中心（scripts/fetch_osm_parks.py）。
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
OUT = ROOT / "data/raw/txg/txg-play.json"
DATASET = "https://data.gov.tw/dataset/152426"
URL = "https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=1c1fec65-1ef1-4b74-b87a-ec28def1fe23"
FIELDS = ["行政區", "公園名稱", "多功能/組合遊戲組數量", "搖搖樂/椅數量", "鞦韆", "蹺蹺板", "溜滑梯數量", "沙坑",
          "攀爬架/網/遊具", "其他（請註明）"]


def main():
    raw = download(URL)
    # 檔案開頭有兩個 BOM：decode 去掉一個，欄位名稱上還留一個；「其他」欄位名稱中間有換行
    rows = [{"".join(k.lstrip("﻿").split()): v for k, v in r.items()}
            for r in csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))]
    missing = [f for f in FIELDS if f not in rows[0]]
    if missing:
        raise SystemExit(f"欄位不見了：{missing}（資料格式可能改了）")
    out = {
        "source": "臺中市公園設施資料-兒童遊具（臺中市政府建設局）",
        "dataset": DATASET,
        "license": "政府資料開放授權條款－第 1 版",
        "url": URL,
        "fetched": date.today().isoformat(),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "columns": FIELDS,
        "records": [{f: (r.get(f) or "").strip() for f in FIELDS} for r in rows],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(rows)} 筆 → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
