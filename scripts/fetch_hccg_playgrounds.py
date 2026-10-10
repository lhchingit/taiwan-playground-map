"""下載「新竹市兒童遊戲場清冊」（養護工程處，政府資料開放平台資料集 132713），
存成 data/raw/hsc/hccg-playgrounds.tsv。只在要更新時手動執行，結果提交進 repo；匯入不會連網路。

TSV 原文照錄（不修正錯字）：編號、公園、行政區、設施內容。更新後依序執行
build_seed.py → import_hccg.py → pnpm regen:filter-cases（見 docs/operations.md「政府資料更新」）。
授權：政府資料開放授權條款－第 1 版（見 docs/decisions.md D14）。
"""
from datetime import date
from pathlib import Path

from lib.opendata import decode_records, download
from sources.hccg_datasets import DATASETS, dataset_page

ROOT = Path(__file__).resolve().parent.parent
DS = DATASETS["playgrounds"]
OUT = ROOT / DS["path"]
FIELDS = ["編號", "公園", "行政區", "設施內容"]


def render_tsv(records, fetched, url=DS["url"]):
    lines = [
        f"# 新竹市兒童遊戲場清冊（養護工程處）｜政府資料開放平台 {dataset_page(DS)}",
        f"# 原始檔：{url}",
        f"# 授權：政府資料開放授權條款-第1版｜擷取日期：{fetched}｜欄位：{'、'.join(FIELDS)}（原文照錄，未修正錯字）",
    ]
    for r in records:
        row = [str(r.get(f, "")) for f in FIELDS]
        if any(c in v for v in row for c in "\t\r\n"):
            raise ValueError(f"清冊編號 {row[0]} 的欄位含有 tab 或換行，TSV 無法原文照錄，請人工確認")
        lines.append("\t".join(row))
    return "\n".join(lines) + "\n"


def main():
    records = decode_records(download(DS["url"]))
    OUT.write_bytes(render_tsv(records, date.today().isoformat()).encode("utf-8"))
    print(f"{len(records)} 筆 → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
