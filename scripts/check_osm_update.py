"""檢查各縣市在 OpenStreetMap 上的遊戲場有沒有變動（新竹市以外），有就產生差異報告。只讀，不改 repo 裡的任何檔案。

  python3 scripts/check_osm_update.py                 全部縣市，報告印到 stdout
  python3 scripts/check_osm_update.py pen kin         只檢查指定縣市
  python3 scripts/check_osm_update.py --report x.md   另外寫成檔案

結束碼：0 沒有變動／1 有變動／2 有縣市下載或匯入失敗（其他縣市照跑）。
新竹市的 OSM 對應是人工的（osm-matches.tsv），不在這裡檢查。有變動時的處理步驟見 docs/operations.md「OSM 更新檢查」。

做法：同 check_opendata_update.py，在暫存資料夾執行現有的下載腳本，repo 本身不會被改到。
  1. 下載：osm.json（fetch_osm_city.py）→ osm-institutions.json（fetch_osm_institutions.py，記著 osm.json 的雜湊，
     一定要跟著重抓）→ 有 osm-parks.json 的縣市再加 fetch_osm_parks.py。臺北市沒有 osm.json，只檢查 osm-parks.json。
  2. 原始資料：OSM 每次下載的雜湊都不同（含資料時間與擷取日期），所以直接比內容：
     遊戲場依 ref 配對、學校或機關範圍內的遊戲場、research.json 用到的公園。
  3. 匯入結果：每個縣市都在暫存資料夾重新匯入（指令同 check_seed_hash.py），跟 repo 的 places.json 比對。
"""
import argparse
import shutil
import sys
import tempfile
from pathlib import Path

from check_opendata_update import IMPORTS, _list, diff_places, run_script
from fetch_city_bounds import CITIES as CITY_NAMES
from lib.io import read_json

ROOT = Path(__file__).resolve().parent.parent
CITIES = [c for c in IMPORTS if c != "hsc"]
NAMES = dict(CITY_NAMES)


# ---------- 比對（純函式） ----------

def playground_view(p):
    tags = p.get("tags", {})
    return {"名稱": tags.get("name"), "其他標籤": {k: v for k, v in tags.items() if k != "name"},
            "位置": (p.get("lat"), p.get("lng")), "所在公園": p.get("parks"), "行政區": p.get("districts")}


def diff_keyed(old, new, view):
    """兩個 {鍵: 資料} → {added: [鍵], removed: [鍵], changed: [(鍵, [變動的欄位])]}"""
    changed = []
    for k in sorted(set(old) & set(new)):
        o, n = view(old[k]), view(new[k])
        fields = [f for f in o if o[f] != n[f]]
        if fields:
            changed.append((k, fields))
    return {"added": sorted(set(new) - set(old)), "removed": sorted(set(old) - set(new)), "changed": changed}


def diff_osm(old, new):
    """osm.json 的 playgrounds，依 ref 配對"""
    return diff_keyed({p["ref"]: p for p in old}, {p["ref"]: p for p in new}, playground_view)


def diff_parks(old, new):
    """osm-parks.json 的 parks：名稱、位置、所在鄉鎮市"""
    return diff_keyed(old, new, lambda p: {"名稱": p.get("name"), "位置": (p.get("lat"), p.get("lng")),
                                           "行政區": p.get("districts")})


def any_change(d):
    return d is not None and any(d[k] for k in ("added", "removed", "changed"))


# ---------- 檢查 ----------

def downloads(city, root):
    """[(腳本, 檔案, 比對方式)]；只抓 repo 裡已經有的檔案"""
    raw = root / "data/raw" / city
    out = []
    if (raw / "osm.json").exists():
        out += [("scripts/fetch_osm_city.py", "osm.json", "osm"),
                ("scripts/fetch_osm_institutions.py", "osm-institutions.json", "institutions")]
    if (raw / "osm-parks.json").exists():
        out.append(("scripts/fetch_osm_parks.py", "osm-parks.json", "parks"))
    return out


def compare(kind, old, new):
    if kind == "osm":
        return diff_osm(old["playgrounds"], new["playgrounds"])
    if kind == "institutions":
        # 只看哪些遊戲場進入或離開範圍；範圍內的遊戲場本身有變時，osm.json 那邊會列出
        return diff_keyed(old["inside"], new["inside"], lambda v: {"所在範圍": v})
    return diff_parks(old["parks"], new["parks"])


def check_city(city, root, work, run=run_script):
    """一個縣市。work 是已經複製好 scripts/ 與 data/raw 的暫存資料夾"""
    r = {"city": city, "name": NAMES.get(city, city), "files": [], "places": None, "error": None}
    step = ""
    try:
        for script, name, kind in downloads(city, root):
            step = f"下載 {name}"
            rel = f"data/raw/{city}/{name}"
            run(work, [script, city])
            old, new = read_json(root / rel), read_json(work / rel)
            r["files"].append({"path": rel, "kind": kind, "fetched": old.get("fetched", ""),
                               "osm_base": (old.get("osm_base"), new.get("osm_base")),
                               "diff": compare(kind, old, new)})
        step = "重新匯入"
        for script in IMPORTS[city]["scripts"]:
            run(work, script if isinstance(script, list) else [script])
        seed = f"data/seed/{city}/places.json"
        old, new = read_json(root / seed)["places"], read_json(work / seed)["places"]
        r["places"] = {**diff_places(old, new), "counts": (len(old), len(new))}
    except (OSError, RuntimeError, ValueError, KeyError) as e:
        r["error"] = f"{step}：{e}"
    return r


def changed(r):
    return any(any_change(f["diff"]) for f in r["files"]) or any_change(r["places"])


def check(cities, root=ROOT, run=run_script):
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        shutil.copytree(root / "scripts", work / "scripts", ignore=shutil.ignore_patterns("__pycache__"))
        shutil.copytree(root / "data/raw", work / "data/raw")
        for city in cities:
            (work / "data/seed" / city).mkdir(parents=True, exist_ok=True)
        return [check_city(c, root, work, run) for c in cities]


# ---------- 報告 ----------

TITLES = {"osm": ("新增遊戲場", "刪除遊戲場", "內容變動的遊戲場"),
          "institutions": ("進入學校／機關範圍（匯入時排除）", "離開學校／機關範圍", "所在範圍改變"),
          "parks": ("新增公園", "OSM 找不到的公園", "內容變動的公園")}


def render_report(results):
    lines = ["# OSM 更新檢查", ""]
    for r in results:
        status = "失敗" if r["error"] else ("**有變動**" if changed(r) else "沒有變動")
        lines += [f"## {r['name']}（{r['city']}）：{status}", ""]
        if r["error"]:
            lines += [f"- 錯誤：{r['error']}", ""]
        for f in r["files"]:
            d = f["diff"]
            lines.append(f"### `{f['path']}`")
            base = f["osm_base"]
            lines.append(f"- 我們的擷取日期：{f['fetched']}" + (f"；OSM 資料時間 {base[0]} → {base[1]}" if base[0] else ""))
            added, removed, chg = TITLES[f["kind"]]
            _list(lines, added, d["added"], str)
            _list(lines, removed, d["removed"], str)
            _list(lines, chg, d["changed"], lambda c: f"{c[0]}：{'、'.join(c[1])}")
            if not any_change(d):
                lines.append("- 內容沒有變")
            lines.append("")
        p = r["places"]
        if p is not None:
            lines.append("### 重新匯入後的場地")
            lines.append(f"- 場地數 {p['counts'][0]} → {p['counts'][1]}")
            _list(lines, "新增場地", p["added"], lambda x: f"{x['id']} {x['name']}")
            _list(lines, "刪除場地", p["removed"], lambda x: f"{x['id']} {x['name']}")
            _list(lines, "內容變動的場地", p["changed"], lambda c: f"{c[0]['id']} {c[0]['name']}：{'、'.join(c[2])}")
            if not any_change(p):
                lines.append("- 場地與屬性值都沒有變")
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main(argv=None, root=ROOT, run=run_script):
    ap = argparse.ArgumentParser(description="檢查各縣市的 OSM 遊戲場有沒有變動（只讀）")
    ap.add_argument("cities", nargs="*", metavar="縣市", help=f"{'、'.join(CITIES)}，不填就是全部")
    ap.add_argument("--report", help="報告另外寫成這個檔案")
    args = ap.parse_args(argv)
    unknown = [c for c in args.cities if c not in CITIES]
    if unknown:
        ap.error(f"不認得的縣市：{'、'.join(unknown)}（可用：{'、'.join(CITIES)}）")
    results = check(args.cities or CITIES, root, run)
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
