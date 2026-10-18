"""人工查證的遊具與設施（data/raw/<縣市>/research.json）：補在 OSM 場地上，每一項都要有來源與說明。

格式：
  {"verified_at": "2026-10-18",
   "sources": {"<來源 key>": {"label": "...", "url": "...", "kind": "news|article"}},
   "places": {"<場地 id>": {"<屬性 key>": ["y|n", "<來源 key>", "<重新整理的說明>"]}}}

只記來源文字明確寫到的；「沒有」也要來源明寫才填 n。格式有錯就中止匯入，不會默默略過。
"""
from datetime import date

KINDS = {"news", "article"}
VALUES = {"y", "n"}
UNKNOWN_TAIL = "遊具與設施還沒有資料，歡迎回報。"
RESEARCHED_TAIL = "部分遊具資料來自網路文章或新聞，現場可能已經不同，歡迎回報。"


class ResearchError(ValueError):
    pass


def validate(research, places, keys):
    errors = []
    try:
        date.fromisoformat(research.get("verified_at") or "")
    except ValueError:
        errors.append("verified_at 要是 YYYY-MM-DD")
    sources = research.get("sources") or {}
    for key, s in sources.items():
        if not (s.get("label") or "").strip() or not (s.get("url") or "").startswith("https://"):
            errors.append(f"來源 {key}：要有 label 與 https 網址")
        if s.get("kind") not in KINDS:
            errors.append(f"來源 {key}：kind 只能是 {'/'.join(sorted(KINDS))}")
    ids = {p["id"] for p in places}
    for pid, attrs in (research.get("places") or {}).items():
        if pid not in ids:
            errors.append(f"{pid}：沒有這個場地")
        for k, entry in attrs.items():
            where = f"{pid} {k}"
            if k not in keys:
                errors.append(f"{where}：沒有這個屬性")
            if not isinstance(entry, list) or len(entry) != 3:
                errors.append(f"{where}：格式要是 [值, 來源, 說明]")
                continue
            v, src, note = entry
            if v not in VALUES:
                errors.append(f"{where}：值只能是 y 或 n")
            if src not in sources:
                errors.append(f"{where}：來源 {src} 沒有定義")
            if not (note or "").strip():
                errors.append(f"{where}：要有說明")
    if errors:
        raise ResearchError("research.json 有錯：\n  " + "\n  ".join(errors))


def apply(research, places, keys):
    """把查證結果寫進 places（就地修改），回傳要併進 seed 的來源"""
    validate(research, places, keys)
    at = research["verified_at"]
    by_id = {p["id"]: p for p in places}
    for pid, attrs in research["places"].items():
        p = by_id[pid]
        for k, (v, src, note) in attrs.items():
            p["attrs"][k] = {"v": v, "src": src, "note": note.strip(), "at": at}
        if attrs and p["summary"].endswith(UNKNOWN_TAIL):
            p["summary"] = p["summary"][: -len(UNKNOWN_TAIL)] + RESEARCHED_TAIL
    used = {src for attrs in research["places"].values() for _, src, _ in attrs.values()}
    return {k: s for k, s in research["sources"].items() if k in used}
