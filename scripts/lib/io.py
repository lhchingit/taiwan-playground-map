"""讀寫檔案。輸出一律 UTF-8、LF 換行，在任何作業系統產生的位元組都相同（重構驗收靠雜湊比對）。"""
import csv
import json


def read_tsv(path):
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        rows.append(line.split("\t"))
    return rows


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")


def write_csv(path, header, rows):
    # utf-8-sig 讓 Excel 正確顯示中文；csv 模組自己處理換行（\r\n），所以 newline=""
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
