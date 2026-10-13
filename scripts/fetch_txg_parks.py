"""下載「臺中市公園綠地清冊」（臺中市政府建設局，政府資料開放平台資料集 88288），存成 data/raw/txg/txg-parks.json。
只在要更新時手動執行，結果提交進 repo；匯入不會連網路。

用途：只用來替 OpenStreetMap 遊戲場補地址（設置地點）與面積（scripts/sources/park_lists.py）。
清冊沒有遊具資料（「兒童遊樂場用地」是都市計畫的用地分類，不代表現場有遊具），所以不單獨上地圖（decisions D13、D20）。
只存項次、名稱、行政區、類別、設置地點、面積、維護單位；清冊的座標不使用，所以不存。
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
OUT = ROOT / "data/raw/txg/txg-parks.json"
DATASET = "https://data.gov.tw/dataset/88288"
URL = "https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=9cb342e2-9f0b-4657-bdd3-74753098dc6a"
FIELDS = ["項次", "公園綠地名稱", "行政區", "類別", "設置地點", "面積（M2）", "維護單位"]


def main():
    raw = download(URL)
    # 檔案開頭有兩個 BOM：decode 去掉一個，欄位名稱上還留一個
    rows = [{k.lstrip("﻿"): v for k, v in r.items()}
            for r in csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))]
    missing = [f for f in FIELDS if f not in rows[0]]
    if missing:
        raise SystemExit(f"欄位不見了：{missing}（資料格式可能改了）")
    out = {
        "source": "臺中市公園綠地清冊（臺中市政府建設局）",
        "dataset": DATASET,
        "license": "政府資料開放授權條款－第 1 版",
        "url": URL,
        "fetched": date.today().isoformat(),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "note": "只存項次、名稱、行政區、類別、設置地點、面積、維護單位；不存座標（不使用）",
        "records": [{f: (r.get(f) or "").strip() for f in FIELDS} for r in rows],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(rows)} 筆 → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
