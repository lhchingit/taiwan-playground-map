"""匯入時需要人工處理的清單（data/review/<縣市>/*.csv）。"""
from .io import write_csv

HEADS = {
    "unmatched": ["清冊編號", "公園", "行政區", "設施內容", "處理狀態"],
    "match-review": ["清冊編號", "公園", "比對方式", "OSM id", "緯度", "經度", "處理狀態"],
    "conflicts": ["場地", "屬性", "現有資料", "清冊"],
    "no-playground": ["清冊編號", "公園", "行政區", "設施內容"],
    "unmapped-items": ["清冊編號", "公園", "未對應的遊具文字"],
    "parks-unmatched": ["場地 id", "名稱", "原因"],
    "toilets-unmatched": ["公廁名稱", "正規化後的名稱", "名稱相近的場地（只是提示，人工確認後填 toilet-aliases.tsv）"],
}


class ReviewCollector:
    def __init__(self):
        self.rows = {k: [] for k in HEADS}

    def add(self, kind, row):
        self.rows[kind].append(row)

    def write(self, out_dir):
        out_dir.mkdir(parents=True, exist_ok=True)
        for k, rows in self.rows.items():
            write_csv(out_dir / f"{k}.csv", HEADS[k], rows)

    def print_summary(self):
        for k, rows in self.rows.items():
            print(f"  review/{k}.csv：{len(rows)} 筆")
