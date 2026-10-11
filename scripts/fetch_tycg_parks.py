"""下載「桃園市公園」（工務局，政府資料開放平台資料集 148726）：特色遊戲場、埤塘公園兩個 CSV，
存成 data/raw/tyc/tycg-parks.json。只在要更新時手動執行，結果提交進 repo；匯入不會連網路。

- 原文照錄，但不存「地標」欄：那是 Google 地圖連結，不可以使用（CLAUDE.md 授權規則）。
- 原始資料沒有編號、列的順序也可能改變，所以自己維護穩定編號（no）：
  名稱相同的沿用上一版的編號，新的公園接著編，刪除的編號不重用。場地 id 是 tyc-tycg-<no>。
授權：政府資料開放授權條款－第 1 版（見 docs/decisions.md D14）。
"""
import csv
import hashlib
import io
import json
from datetime import date
from pathlib import Path

from lib.opendata import download

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data/raw/tyc/tycg-parks.json"
DATASET = "https://data.gov.tw/dataset/148726"
BASE = "https://opendata.tycg.gov.tw/api/dataset/4e233760-cb9c-4bca-bef2-e14ac80b1667/resource/{}/download"
FILES = {
    "特色遊戲場": BASE.format("cc8663dc-51f4-4a4f-9da1-f3fc266dc0c2"),
    "埤塘公園": BASE.format("eff0b4d8-2ef3-49ec-b894-68b92dac23f0"),
}
FIELDS = ["區域", "公園名稱", "特色", "設施", "地址", "停車", "廁所"]  # 不含「地標」


def name_key(name):
    return "".join(name.split())


def assign_numbers(records, previous):
    """records：[{公園名稱,…}]；previous：{名稱: 編號}（上一版）。名稱相同（忽略空白）的同一個編號。"""
    numbers = {name_key(k): v for k, v in previous.items()}
    nxt = max(numbers.values(), default=0) + 1
    for r in records:
        k = name_key(r["公園名稱"])
        if k not in numbers:
            numbers[k] = nxt
            nxt += 1
        r["no"] = numbers[k]
    return records


def parse_csv(raw):
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
    return [{f: (r.get(f) or "").strip() for f in FIELDS} for r in rows]


def main():
    previous = {}
    if OUT.exists():
        old = json.loads(OUT.read_text(encoding="utf-8"))
        previous = {r["公園名稱"]: r["no"] for r in old["records"]}
    records, files = [], {}
    for kind, url in FILES.items():
        raw = download(url)
        files[kind] = {"url": url, "sha256": hashlib.sha256(raw).hexdigest()}
        records += [{"類別": kind, **r} for r in parse_csv(raw)]
    assign_numbers(records, previous)
    out = {
        "source": "桃園市公園（桃園市政府工務局）",
        "dataset": DATASET,
        "license": "政府資料開放授權條款－第 1 版",
        "fetched": date.today().isoformat(),
        "files": files,
        "note": "不含原始資料的「地標」欄（Google 地圖連結，不可使用）",
        "records": records,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(records)} 筆 → {OUT.relative_to(ROOT)}（{len({r['no'] for r in records})} 個公園）")


if __name__ == "__main__":
    main()
