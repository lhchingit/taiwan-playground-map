"""檢查新竹市政府的三份開放資料（清冊、公園、公廁）有沒有更新，有就產生差異報告。只讀，不改任何檔案。

  python3 scripts/check_hccg_update.py                 報告印到 stdout
  python3 scripts/check_hccg_update.py --report x.md   另外寫成檔案
  python3 scripts/check_hccg_update.py --meta-only     只看 data.gov.tw 的更新時間與下載網址，不下載資料

結束碼：0 沒有變動／1 有變動／2 下載或讀取失敗。
每季由 .github/workflows/hccg-update.yml 用 --meta-only 自動執行：GitHub Actions 連不到市府的下載主機
（odws.hccg.gov.tw，逾時），只讀得到 data.gov.tw。平台更新時間晚於我們的擷取日期就開 issue，再由人在本機跑完整檢查。
收到 issue 後的處理步驟見 docs/operations.md「政府資料更新」。

比對方式：
  - 清冊：TSV 沒有存原始檔雜湊，逐筆比內容。依公園名稱配對，同名的再用編號區分。
  - 公園、公廁：先比 sha256，不同才逐筆比內容（依名稱配對）。
  - 平台上的 JSON 下載網址跟 sources/hccg_datasets.py 不同時也算變動（要更新設定）。
"""
import argparse
import hashlib
import re
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

from lib.attrs import map_items
from lib.io import read_json, read_tsv
from lib.merge import place_id
from lib.opendata import dataset_meta, decode_records, download
from sources import hccg
from sources.hccg_datasets import DATASETS, dataset_page

ROOT = Path(__file__).resolve().parent.parent
PLAYGROUND_FIELDS = ["編號", "公園", "行政區", "設施內容"]
# 用清冊編號（或由編號產生的場地 id）對應的檔案：編號變動或清冊刪除時要跟著處理
REF_FILES = ["data/raw/hsc/manual-review.tsv", "data/raw/hsc/osm-matches.tsv", "data/raw/hsc/toilet-aliases.tsv"]


class Net:
    """連網路的部分集中在這裡；測試時換成假的"""

    def meta(self, dataset_id):
        try:
            return dataset_meta(dataset_id)
        except OSError as e:
            raise OSError(f"讀取 data.gov.tw 資料集 {dataset_id} 的 metadata 失敗：{e}") from e

    def get(self, url):
        try:
            return download(url)
        except OSError as e:
            raise OSError(f"下載 {url} 失敗：{e}") from e


# ---------- 配對與比對（純函式） ----------

def pair(old, new, key, no):
    """依 key 配對；同一個 key 有多筆時，先配編號相同的，剩下的依順序配。回傳 (pairs, removed, added)"""
    old_by, new_by = defaultdict(list), defaultdict(list)
    for r in old:
        old_by[key(r)].append(r)
    for r in new:
        new_by[key(r)].append(r)
    pairs, removed, added = [], [], []
    for k in list(old_by) + [k for k in new_by if k not in old_by]:
        olds, news = list(old_by.get(k, [])), list(new_by.get(k, []))
        for o in list(olds):
            n = next((n for n in news if no(n) == no(o)), None)
            if n is not None:
                pairs.append((o, n))
                olds.remove(o)
                news.remove(n)
        while olds and news:
            pairs.append((olds.pop(0), news.pop(0)))
        removed += olds
        added += news
    return pairs, removed, added


def facility_attrs(text):
    """清冊設施文字 → ({屬性 key: 原文}, [對不到屬性的原文])，規則跟匯入完全相同"""
    return map_items(hccg.parse_items(text), hccg.RULES)


def diff_playgrounds(old_rows, new_rows, refs):
    """old_rows／new_rows：[{編號, 公園, 行政區, 設施內容}]；refs：{編號: [引用它的檔案]}"""
    pairs, removed, added = pair(old_rows, new_rows, key=lambda r: r["公園"], no=lambda r: r["編號"])
    d = {"added": added, "removed": [(r, refs.get(r["編號"], [])) for r in removed],
         "renumbered": [], "district": [], "items": []}
    for o, n in pairs:
        if o["編號"] != n["編號"]:
            d["renumbered"].append((o, n, refs.get(o["編號"], [])))
        if o["行政區"] != n["行政區"]:
            d["district"].append((o, n))
        if o["設施內容"] != n["設施內容"]:
            old_attrs, old_unmapped = facility_attrs(o["設施內容"])
            new_attrs, new_unmapped = facility_attrs(n["設施內容"])
            d["items"].append({
                "old": o, "new": n,
                "gained": sorted(set(new_attrs) - set(old_attrs)),
                "lost": sorted(set(old_attrs) - set(new_attrs)),
                "unmapped": [i for i in new_unmapped if i not in old_unmapped],
            })
    return d


def diff_records(old, new, key):
    """公園、公廁：依名稱配對，回傳 {added, removed, changed: [(old, new, [(欄位, 舊, 新)])]}"""
    pairs, removed, added = pair(old, new, key=lambda r: str(r.get(key, "")).strip(),
                                 no=lambda r: r.get("編號"))
    changed = []
    for o, n in pairs:
        fields = [(f, o.get(f), n.get(f)) for f in dict.fromkeys(list(o) + list(n)) if o.get(f) != n.get(f)]
        if fields:
            changed.append((o, n, fields))
    return {"added": added, "removed": removed, "changed": changed}


def has_changes(d):
    return any(d.get(k) for k in ["added", "removed", "renumbered", "district", "items", "changed"])


# ---------- 讀取本機資料 ----------

def load_refs(root):
    """{清冊編號: [引用它的檔案]}"""
    refs = defaultdict(list)

    def add(no, path):
        if no and path not in refs[no]:
            refs[no].append(path)

    for path in REF_FILES:
        p = root / path
        if not p.exists():
            continue
        rows = read_tsv(p)
        if path.endswith("toilet-aliases.tsv"):
            # 第二欄是場地 id；清冊場地的 id 由編號產生（decisions D12）
            ids = {r[1] for r in rows[1:] if len(r) > 1}
            for r in read_tsv(root / DATASETS["playgrounds"]["path"]):
                if place_id(hccg.CITY, hccg.SOURCE_ID, r[0]) in ids:
                    add(r[0], path)
        elif path.endswith("manual-review.tsv"):
            for r in rows[1:]:
                add(r[0], path)
                if len(r) > 5:
                    add(r[5], path)  # 對應編號
        else:
            for r in rows:
                add(r[0], path)
    return refs


def load_labels(root):
    p = root / "data/seed/hsc/places.json"
    if not p.exists():
        return {}
    labels = read_json(p)["labels"]
    return {**labels["play"], **labels["amenity"]}


def tsv_fetched(path):
    m = re.search(r"擷取日期：(\d{4}-\d{2}-\d{2})", path.read_text(encoding="utf-8"))
    return m.group(1) if m else ""


# ---------- 檢查 ----------

def check(root, net, meta_only=False):
    """meta_only：不下載資料，平台更新時間（日期）晚於我們的擷取日期，或下載網址換了，就算有變動"""
    results = []
    refs = load_refs(root)
    for name, ds in DATASETS.items():
        meta = net.meta(ds["id"])
        r = {"name": name, "ds": ds, "modified": meta.get("modified", ""), "notes": [], "url_changed": False}
        url = meta.get("json_url") or ds["url"]
        if not meta.get("json_url"):
            r["notes"].append("平台上找不到 JSON 格式的下載網址，改用 sources/hccg_datasets.py 裡的網址")
        elif meta["json_url"] != ds["url"]:
            r["url_changed"] = True
            r["notes"].append(f"**下載網址換了**：`{ds['url']}` → `{meta['json_url']}`，"
                              "請更新 `scripts/sources/hccg_datasets.py`")
        path = root / ds["path"]
        if meta_only:
            stored = None if ds["kind"] == "tsv" else read_json(path)
            r["fetched"] = tsv_fetched(path) if stored is None else stored.get("fetched", "")
            r["counts"] = (len(read_tsv(path)) if stored is None else len(stored["records"]), None)
            r["diff"] = {}
            newer = bool(r["modified"]) and r["modified"][:10] > r["fetched"]
            if newer:
                r["notes"].append(f"平台更新時間（{r['modified']}）晚於我們的擷取日期（{r['fetched']}）。"
                                  "內容不一定有變，要在本機跑完整檢查才知道")
            r["changed"] = r["url_changed"] or newer
            results.append(r)
            continue
        raw = net.get(url)
        if ds["kind"] == "tsv":
            r["fetched"] = tsv_fetched(path)
            old = [dict(zip(PLAYGROUND_FIELDS, row)) for row in read_tsv(path)]
            new = [{f: str(rec.get(f, "")) for f in PLAYGROUND_FIELDS} for rec in decode_records(raw)]
            r["diff"] = diff_playgrounds(old, new, refs)
            r["counts"] = (len(old), len(new))
        else:
            stored = read_json(path)
            r["fetched"] = stored.get("fetched", "")
            r["counts"] = (len(stored["records"]),) * 2
            r["diff"] = {}
            if hashlib.sha256(raw).hexdigest() != stored.get("sha256"):
                new = decode_records(raw)
                r["counts"] = (len(stored["records"]), len(new))
                r["diff"] = diff_records(stored["records"], new, ds["key"])
                if not has_changes(r["diff"]):
                    r["notes"].append("原始檔的位元組不同，但每一筆內容都相同（可能只是格式），不算變動")
        r["changed"] = r["url_changed"] or has_changes(r["diff"])
        results.append(r)
    return results


# ---------- 報告 ----------

def _row(r):
    return f"#{r['編號']} {r['公園']}（{r['行政區']}）"


def _refs(files):
    return f"；**被 {'、'.join(f'`{Path(f).name}`' for f in files)} 引用，要跟著處理**" if files else ""


def _attrs(keys, labels):
    return "、".join(labels.get(k, k) for k in keys)


def render_playgrounds(d, labels):
    out = []
    if d["added"]:
        out.append(f"#### 新增（{len(d['added'])}）")
        out += [f"- {_row(r)}：{r['設施內容'] or '（空白）'}" for r in d["added"]]
    if d["removed"]:
        out.append(f"#### 刪除（{len(d['removed'])}）")
        out += [f"- {_row(r)}{_refs(files)}" for r, files in d["removed"]]
    if d["items"]:
        out.append(f"#### 設施變更（{len(d['items'])}）")
        for c in d["items"]:
            out.append(f"- {_row(c['new'])}")
            out.append(f"  - 舊：{c['old']['設施內容'] or '（空白）'}")
            out.append(f"  - 新：{c['new']['設施內容'] or '（空白）'}")
            if c["gained"]:
                out.append(f"  - 屬性新出現：{_attrs(c['gained'], labels)}")
            if c["lost"]:
                out.append(f"  - 屬性不再列出：{_attrs(c['lost'], labels)}"
                           "（清冊沒列出不代表沒有，**不可以改成「無」**；重新匯入後確認結果）")
            if c["unmapped"]:
                out.append(f"  - 對不到屬性的新設施文字：{'、'.join(c['unmapped'])}"
                           "（要在 `sources/hccg.py` 的 RULES 加規則，**不可推測**）")
    if d["renumbered"]:
        out.append(f"#### 編號變動（{len(d['renumbered'])}）")
        out.append("**注意：** `manual-review.tsv`、`osm-matches.tsv` 用清冊編號對應，場地 id 也由編號產生（D12，"
                   "公開後不可改），編號變動要人工處理，不能直接重新匯入。")
        out += [f"- {n['公園']}：#{o['編號']} → #{n['編號']}{_refs(files)}" for o, n, files in d["renumbered"]]
    if d["district"]:
        out.append(f"#### 行政區變更（{len(d['district'])}）")
        out += [f"- #{n['編號']} {n['公園']}：{o['行政區']} → {n['行政區']}" for o, n in d["district"]]
    return out


def render_records(d, key, watch):
    out = []
    if d["added"]:
        out.append(f"#### 新增（{len(d['added'])}）")
        out += [f"- {r.get(key, '')}" for r in d["added"]]
    if d["removed"]:
        out.append(f"#### 刪除（{len(d['removed'])}）")
        out += [f"- {r.get(key, '')}" for r in d["removed"]]
    if d["changed"]:
        out.append(f"#### 欄位變更（{len(d['changed'])}）")
        for o, n, fields in d["changed"]:
            parts = [f"{'**' if f in watch else ''}{f}：{a} → {b}{'**' if f in watch else ''}"
                     for f, a, b in fields]
            out.append(f"- {n.get(key, '')}：{'；'.join(parts)}")
    return out


def render_report(results, today, labels, meta_only=False):
    changed = any(r["changed"] for r in results)
    out = [f"## 新竹市政府資料更新檢查（{today}）", "",
           "| 資料 | 平台更新時間 | 我們的擷取日期 | 筆數（舊 → 新） | 結果 |", "|---|---|---|---|---|"]
    for r in results:
        ds = r["ds"]
        old_n, new_n = r["counts"]
        counts = f"{old_n} → {new_n}" if new_n is not None else f"{old_n} → （未下載）"
        out.append(f"| [{ds['label']}]({dataset_page(ds)}) | {r['modified'] or '—'} | {r['fetched'] or '—'} | "
                   f"{counts} | {'**有變動**' if r['changed'] else '沒有變動'} |")
    for r in results:
        if not (r["changed"] or r["notes"]):
            continue
        ds = r["ds"]
        out += ["", f"### {ds['label']}（`{ds['path']}`）"]
        out += [f"- {n}" for n in r["notes"]]
        if r["diff"]:
            out += (render_playgrounds(r["diff"], labels) if ds["kind"] == "tsv"
                    else render_records(r["diff"], ds["key"], ds.get("watch", [])))
    if changed:
        fetches = " && ".join(f"python3 {DATASETS[r['name']]['fetch']}" for r in results if r["changed"])
        steps = ["在本機執行 `python3 scripts/check_hccg_update.py` 取得完整差異報告"
                 "（GitHub Actions 連不到市府的下載主機，只看了平台更新時間）；沒有變動就關閉這個 issue"] if meta_only else []
        steps += ["先處理上面標「注意」「要跟著處理」的項目（編號變動、被引用的刪除）",
                  f"下載：`{fetches}`",
                  "重新匯入：`python3 scripts/build_seed.py && python3 scripts/import_hccg.py`，"
                  "檢查 `data/review/hsc/` 的變化（尤其 conflicts、unmapped-items）",
                  "`pnpm regen:filter-cases`，跑完整測試後開 PR；合併後用「資料作業」workflow 匯入正式環境"]
        out += ["", "### 處理步驟（詳見 docs/operations.md「政府資料更新」）", ""]
        out += [f"{i}. {t}" for i, t in enumerate(steps, 1)]
    return changed, "\n".join(out) + "\n"


def main(argv=None, root=ROOT, net=None, today=None):
    ap = argparse.ArgumentParser(description="檢查新竹市政府開放資料是否更新")
    ap.add_argument("--report", help="另外把報告寫到這個檔案")
    ap.add_argument("--meta-only", action="store_true", help="只看 data.gov.tw 的更新時間與下載網址，不下載資料")
    args = ap.parse_args(argv)
    try:
        results = check(root, net or Net(), meta_only=args.meta_only)
    except (OSError, ValueError, KeyError) as e:  # 網路錯誤（URLError 是 OSError）、JSON 格式錯誤、欄位不見
        print(f"檢查失敗：{type(e).__name__}: {e}", file=sys.stderr)
        return 2
    changed, report = render_report(results, today or date.today().isoformat(), load_labels(root), args.meta_only)
    print(report)
    if args.report:
        Path(args.report).write_text(report, encoding="utf-8", newline="\n")
    return 1 if changed else 0


if __name__ == "__main__":
    sys.exit(main())
