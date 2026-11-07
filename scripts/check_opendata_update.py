"""檢查各縣市的政府開放資料（新竹市以外）有沒有更新，有就產生差異報告。只讀，不改 repo 裡的任何檔案。

  python3 scripts/check_opendata_update.py                 全部縣市，報告印到 stdout
  python3 scripts/check_opendata_update.py tpe tnn         只檢查指定縣市
  python3 scripts/check_opendata_update.py --report x.md   另外寫成檔案

結束碼：0 沒有變動／1 有變動／2 有縣市下載失敗（其他縣市照跑）。
新竹市用 check_hccg_update.py。有變動時的處理步驟見 docs/operations.md「政府資料更新（其他縣市）」。

做法：把 scripts/ 與 data/raw 複製到暫存資料夾，在那裡執行現有的下載腳本（fetch_*.py），repo 本身不會被改到。
  1. 原始資料：先比 sha256（桃園市比每個檔案的雜湊），不同才逐筆比對（依公園名稱配對）。
  2. 匯入結果：原始資料有變的縣市，在暫存資料夾重新匯入（指令同 check_seed_hash.py），跟 repo 的 places.json 比對
     場地增減與屬性值變動。查證日期（at）會跟著擷取日期改變，不算變動。
"""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from check_hccg_update import diff_records
from check_seed_hash import CITIES as IMPORTS
from lib.io import read_json

ROOT = Path(__file__).resolve().parent.parent
SHOW = 20  # 每一類最多列出幾筆，其餘只寫數量
# 每個縣市：下載腳本、原始檔與配對欄位、是否參與匯入（txg-play.json 是人工對應進 research.json 的，不參與匯入）
SOURCES = {
    "tpe": {"name": "臺北市", "files": [("scripts/fetch_tpe_parks.py", "data/raw/tpe/pkl-arcade.json", "公園名稱")]},
    "tnn": {"name": "臺南市", "files": [("scripts/fetch_tnn_parks.py", "data/raw/tnn/tnn-parks.json", "公園名稱")]},
    "tyc": {"name": "桃園市", "files": [("scripts/fetch_tycg_parks.py", "data/raw/tyc/tycg-parks.json", "公園名稱")]},
    "txg": {"name": "臺中市", "files": [("scripts/fetch_txg_parks.py", "data/raw/txg/txg-parks.json", "公園綠地名稱"),
                                       ("scripts/fetch_txg_play.py", "data/raw/txg/txg-play.json", "公園名稱")],
            "manual": ["data/raw/txg/txg-play.json"]},
    "nwt": {"name": "新北市", "files": [("scripts/fetch_ntpc_parks.py", "data/raw/nwt/ntpc-parks.json", "name")]},
    "nan": {"name": "南投縣", "files": [("scripts/fetch_ntc_parks.py", "data/raw/nan/ntc-parks.json", "公園名稱")]},
}
ENV = {**os.environ, "PYTHONIOENCODING": "utf-8"}


def run_script(work, args):
    """在暫存資料夾執行 scripts/ 裡的腳本；失敗時丟出 RuntimeError（含錯誤訊息最後一行）"""
    p = subprocess.run([sys.executable, *args], cwd=work, env=ENV, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if p.returncode != 0:
        lines = (p.stderr or p.stdout).strip().splitlines()
        raise RuntimeError(lines[-1] if lines else f"{args[0]} 結束碼 {p.returncode}")


# ---------- 比對（純函式） ----------

def hashes(data):
    """原始檔的雜湊：桃園市每個檔案各一個（files），其他是整份一個"""
    if "files" in data:
        return {k: v.get("sha256") for k, v in data["files"].items()}
    return {"": data.get("sha256")}


def place_view(p):
    """比對場地時看的欄位：名稱、行政區、地址、面積、座標、屬性值、停車類型與收費（不看查證日期與說明）"""
    park = p.get("parking") or {}
    return {"名稱": p.get("name"), "行政區": p.get("district"), "地址": p.get("address"), "面積": p.get("area_ha"),
            "座標": (p.get("lat"), p.get("lng")),
            "屬性": {k: a["v"] for k, a in sorted(p.get("attrs", {}).items())},
            "停車": (park.get("type"), park.get("fee"))}


def diff_places(old, new):
    """兩份 places 清單 → {added, removed, changed: [(舊, 新, [變動的欄位])]}，依 id 配對"""
    old_by, new_by = {p["id"]: p for p in old}, {p["id"]: p for p in new}
    changed = []
    for pid in sorted(set(old_by) & set(new_by)):
        o, n = place_view(old_by[pid]), place_view(new_by[pid])
        fields = [f for f in o if o[f] != n[f]]
        if fields:
            changed.append((old_by[pid], new_by[pid], fields))
    return {"added": [new_by[i] for i in sorted(set(new_by) - set(old_by))],
            "removed": [old_by[i] for i in sorted(set(old_by) - set(new_by))],
            "changed": changed}


# ---------- 檢查 ----------

def check_city(city, root, work, run=run_script):
    """一個縣市。work 是已經複製好 scripts/ 與 data/raw 的暫存資料夾"""
    spec = SOURCES[city]
    r = {"city": city, "name": spec["name"], "files": [], "places": None, "error": None}
    try:
        for script, rel, key in spec["files"]:
            old = read_json(root / rel)
            run(work, [script])
            new = read_json(work / rel)
            same = hashes(old) == hashes(new)
            r["files"].append({
                "path": rel, "dataset": old.get("dataset", ""), "fetched": old.get("fetched", ""),
                "counts": (len(old["records"]), len(new["records"])), "same": same,
                "manual": rel in spec.get("manual", []),
                "diff": None if same else diff_records(old["records"], new["records"], key)})
        if any(not f["same"] and not f["manual"] for f in r["files"]):
            for script in IMPORTS[city]["scripts"]:
                run(work, script if isinstance(script, list) else [script])
            seed = f"data/seed/{city}/places.json"
            r["places"] = diff_places(read_json(root / seed)["places"], read_json(work / seed)["places"])
            r["places"]["counts"] = (len(read_json(root / seed)["places"]), len(read_json(work / seed)["places"]))
    except (OSError, RuntimeError, ValueError, KeyError) as e:
        r["error"] = str(e)
    return r


def changed(r):
    return any(not f["same"] for f in r["files"])


def check(cities, root=ROOT, run=run_script):
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        shutil.copytree(root / "scripts", work / "scripts", ignore=shutil.ignore_patterns("__pycache__"))
        shutil.copytree(root / "data/raw", work / "data/raw")
        for city in cities:
            (work / "data/seed" / city).mkdir(parents=True, exist_ok=True)
        return [check_city(c, root, work, run) for c in cities]


# ---------- 報告 ----------

def _list(lines, title, items, fmt):
    if not items:
        return
    lines.append(f"- {title} {len(items)} 筆：")
    lines.extend(f"  - {fmt(x)}" for x in items[:SHOW])
    if len(items) > SHOW:
        lines.append(f"  - ……另外 {len(items) - SHOW} 筆")


def render_report(results):
    lines = ["# 政府開放資料更新檢查", ""]
    for r in results:
        status = "下載失敗" if r["error"] else ("**有變動**" if changed(r) else "沒有變動")
        lines += [f"## {r['name']}（{r['city']}）：{status}", ""]
        if r["error"]:
            lines += [f"- 錯誤：{r['error']}", ""]
        for f in r["files"]:
            lines.append(f"### `{f['path']}`")
            lines.append(f"- 資料集：{f['dataset']}；我們的擷取日期：{f['fetched']}；"
                         f"筆數 {f['counts'][0]} → {f['counts'][1]}")
            if f["same"]:
                lines += ["- 檔案雜湊相同，內容沒有變", ""]
                continue
            d = f["diff"]
            name = next(k for s, p, k in SOURCES[r["city"]]["files"] if p == f["path"])
            _list(lines, "新增", d["added"], lambda x: str(x.get(name, "")))
            _list(lines, "刪除", d["removed"], lambda x: str(x.get(name, "")))
            _list(lines, "欄位變動", d["changed"], lambda c: f"{c[0].get(name, '')}：" + "；".join(
                f"{k} `{a}` → `{b}`" for k, a, b in c[2] if k != "no"))
            if not any(d.values()):
                lines.append("- 雜湊不同，但逐筆比對沒有差異（可能只是排序或格式）")
            if f["manual"]:
                lines.append("- 這份不參與匯入（人工對應進 research.json），要人工看是否需要更新")
            lines.append("")
        p = r["places"]
        if p is not None:
            lines.append("### 重新匯入後的場地")
            lines.append(f"- 場地數 {p['counts'][0]} → {p['counts'][1]}")
            _list(lines, "新增場地", p["added"], lambda x: f"{x['id']} {x['name']}")
            _list(lines, "刪除場地", p["removed"], lambda x: f"{x['id']} {x['name']}")
            _list(lines, "內容變動的場地", p["changed"], lambda c: f"{c[0]['id']} {c[0]['name']}：{'、'.join(c[2])}")
            if not (p["added"] or p["removed"] or p["changed"]):
                lines.append("- 場地與屬性值都沒有變")
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main(argv=None, root=ROOT, run=run_script):
    ap = argparse.ArgumentParser(description="檢查各縣市的政府開放資料有沒有更新（只讀）")
    ap.add_argument("cities", nargs="*", metavar="縣市", help=f"{'、'.join(SOURCES)}，不填就是全部")
    ap.add_argument("--report", help="報告另外寫成這個檔案")
    args = ap.parse_args(argv)
    unknown = [c for c in args.cities if c not in SOURCES]
    if unknown:
        ap.error(f"不認得的縣市：{'、'.join(unknown)}（可用：{'、'.join(SOURCES)}）")
    results = check(args.cities or list(SOURCES), root, run)
    report = render_report(results)
    print(report, end="")
    if args.report:
        Path(args.report).write_text(report, encoding="utf-8", newline="\n")
    if any(r["error"] for r in results):
        return 2
    return 1 if any(changed(r) for r in results) else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
