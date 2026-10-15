"""下載「臺南市公園設施資料」（臺南市政府工務局，政府資料開放平台資料集 53556），
存成 data/raw/tnn/tnn-parks.json。只在要更新時手動執行，結果提交進 repo；匯入不會連網路。

- 一列是一個公園，原文照錄（CSV 的每個欄位都是字串）；空白的設施欄位省略，讀取時空白就是 0。
- 原始資料沒有編號，自己維護穩定編號（no）：以「所在轄區｜公園名稱」為鍵（「公一」等用地編號在不同區都有），
  相同的沿用上一版的編號，新的接著編，刪除的編號不重用。場地 id 是 tnn-tnn-<no>。
- 座標欄位（緯度、經度）是 WGS84。
授權：政府資料開放授權條款－第 1 版（見 docs/decisions.md D14、D21）。
"""
import csv
import hashlib
import io
import json
from datetime import date
from pathlib import Path

from lib.numbering import assign_numbers
from lib.opendata import download
from sources.tnn import park_key

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data/raw/tnn/tnn-parks.json"
DATASET = "https://data.gov.tw/dataset/53556"
URL = "https://data.tainan.gov.tw/File/ResourceCsvDownload/a7e21d6b-7942-4c26-9b31-9e7cd8c41971"


# 每一列都保留的欄位（其他欄位空白時省略，讀取時空白就是 0）
KEEP = ["縣市", "所在轄區", "公園名稱", "緯度", "經度", "里別", "面積公頃", "類別", "座落位置", "管理單位"]


def parse(raw):
    """CSV（UTF-8，可能帶 BOM）→ [{欄位: 字串}]；欄位名稱與值去掉前後空白，空白的設施欄位省略（約 200 欄大多空白）"""
    text = raw.decode("utf-8-sig")
    rows = [{k.strip(): (v or "").strip() for k, v in r.items() if k}
            for r in csv.DictReader(io.StringIO(text))]
    return [{k: v for k, v in r.items() if v or k in KEEP} for r in rows]


def columns(raw):
    """原始資料的全部欄位名稱（匯入時檢查用到的欄位都還在）"""
    return [c.strip() for c in next(csv.reader(io.StringIO(raw.decode("utf-8-sig")))) if c.strip()]


def main():
    previous = {}
    if OUT.exists():
        old = json.loads(OUT.read_text(encoding="utf-8"))
        previous = {park_key(r): r["no"] for r in old["records"]}
    raw = download(URL, timeout=120)
    records = assign_numbers(parse(raw), previous, key=park_key)
    out = {
        "source": "臺南市公園設施資料（臺南市政府工務局）",
        "dataset": DATASET,
        "license": "政府資料開放授權條款－第 1 版",
        "url": URL,
        "fetched": date.today().isoformat(),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "note": "緯度、經度是 WGS84；各「…數量」欄位是設施數量；空白的欄位省略",
        "columns": columns(raw),
        "records": records,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(records)} 個公園 → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
