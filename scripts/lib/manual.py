"""人工處理結果：data/raw/<縣市>/manual-review.tsv（人工定位工具 pnpm tool:locate 寫入）。

每一列是一筆清冊資料的處理結果，匯入時套用（scripts/sources/hccg.py）。
欄位格式也由 scripts/tools/locate/review-file.ts 讀寫，兩邊要一致（tests/fixtures/manual-review-sample.tsv）。
"""
import csv
from pathlib import Path

COLUMNS = ["清冊編號", "狀態", "緯度", "經度", "定位依據", "對應編號", "說明", "定位者", "日期"]

# 狀態 → 顯示在 review 清單的文字
STATUS_LABEL = {
    "located": "已人工定位",
    "confirmed": "已確認比對正確",
    "not_found": "找不到",
    "abolished": "已廢除",
    "pending_visit": "待實地確認",
    "duplicate": "重複",
}
# 定位依據只能是這三種（CLAUDE.md：不可以用 Google 地圖查座標）
BASES = ("實地確認", "OSM 地圖上可見的公園範圍", "政府公告的地址")
# 台灣本島與離島的大致範圍
TW = {"lat": (21.5, 26.5), "lng": (118.0, 122.5)}


def validate(row):
    """回傳錯誤訊息清單；空清單代表通過"""
    errors = []
    no, status = row.get("清冊編號", ""), row.get("狀態", "")
    if not no.isdigit():
        errors.append(f"清冊編號不是數字：{no}")
    if status not in STATUS_LABEL:
        errors.append(f"#{no} 狀態不正確：{status}")
    if status == "located":
        try:
            lat, lng = float(row["緯度"]), float(row["經度"])
            if not (TW["lat"][0] <= lat <= TW["lat"][1] and TW["lng"][0] <= lng <= TW["lng"][1]):
                errors.append(f"#{no} 座標不在台灣範圍內")
        except (KeyError, ValueError):
            errors.append(f"#{no} 已定位但沒有座標")
        if row.get("定位依據") not in BASES:
            errors.append(f"#{no} 定位依據要是：{'、'.join(BASES)}")
    if status == "duplicate" and not row.get("對應編號", "").isdigit():
        errors.append(f"#{no} 重複要填對應的清冊編號")
    if not row.get("定位者"):
        errors.append(f"#{no} 沒有填定位者")
    return errors


def read_manual(path):
    """{清冊編號: 列}；檔案不存在時回傳空 dict。有不合法的列就中止匯入。"""
    path = Path(path)
    if not path.exists():
        return {}
    with open(path, encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f, delimiter="\t"))
    errors = [e for r in rows for e in validate(r)]
    if errors:
        raise ValueError(f"{path} 有 {len(errors)} 個問題：\n- " + "\n- ".join(errors))
    return {r["清冊編號"]: r for r in rows}


def status_text(row):
    """review 清單的「處理狀態」欄；沒有處理過的是空字串"""
    if not row:
        return ""
    label = STATUS_LABEL[row["狀態"]]
    if row["狀態"] == "duplicate":
        label += f"（同 #{row['對應編號']}）"
    if row.get("說明"):
        label += f"：{row['說明']}"
    return f"{label}（{row['定位者']}，{row['日期']}）"


def coord_label(row):
    """人工定位的座標來源說明（寫進 places.json 的 source_coords）"""
    return f"人工定位（{row['定位依據']}，{row['定位者']}，{row['日期']}）"
