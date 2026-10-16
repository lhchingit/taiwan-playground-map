"""下載「南投縣都市計畫區公園一覽表」（南投縣政府，政府資料開放平台資料集 127415），存成 data/raw/nan/ntc-parks.json。
只在要更新時手動執行，結果提交進 repo；匯入不會連網路。

用途：只用來替 OpenStreetMap 遊戲場補地址（座落位置）與面積（scripts/sources/park_lists.py）。
一覽表沒有遊具資料（「兒童遊樂場用地」是都市計畫的用地分類，不代表現場有遊具），所以不單獨上地圖（decisions D13、D20）。
只存編號、名稱、所在轄區、座落位置、面積、維護管理單位；一覽表的座標不使用，所以不存。
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
OUT = ROOT / "data/raw/nan/ntc-parks.json"
DATASET = "https://data.gov.tw/dataset/127415"
URL = ("https://data.nantou.gov.tw/dataset/d3eb0d5e-d257-4117-893c-4d3ee5641207/resource/"
       "e8de8c44-cf77-41a0-8076-723b1af22a8d/download/20200617153912.csv")
# 南投縣開放資料平台對非瀏覽器的 User-Agent 回 403
BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
FIELDS = ["編號", "公園名稱", "所在轄區", "座落位置", "面積（m2）", "維護管理單位"]


def main():
    raw = download(URL, user_agent=BROWSER_UA)
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
    missing = [f for f in FIELDS if f not in rows[0]]
    if missing:
        raise SystemExit(f"欄位不見了：{missing}（資料格式可能改了）")
    out = {
        "source": "南投縣都市計畫區公園一覽表（南投縣政府）",
        "dataset": DATASET,
        "license": "政府資料開放授權條款－第 1 版",
        "url": URL,
        "fetched": date.today().isoformat(),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "note": "只存編號、名稱、所在轄區、座落位置、面積、維護管理單位；不存座標（不使用）",
        "records": [{f: (r.get(f) or "").strip() for f in FIELDS} for r in rows],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(rows)} 筆 → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
