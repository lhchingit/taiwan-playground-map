"""Overpass API（OpenStreetMap 查詢）。公開主機忙碌時會回 429／5xx：等一下再試。只有 fetch／locate 腳本使用，匯入不連網路。"""
import json
import time
import urllib.error
import urllib.parse
import urllib.request

from lib.opendata import USER_AGENT

OVERPASS = "https://overpass-api.de/api/interpreter"
# is_in 一次查幾個點（太多會逾時）
BATCH = 10


def overpass(q, tries=5):
    """回傳 (原始位元組, 解析後的 JSON)"""
    for i in range(tries):
        req = urllib.request.Request(
            OVERPASS, data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": USER_AGENT}
        )
        try:
            with urllib.request.urlopen(req, timeout=240) as r:
                raw = r.read()
            return raw, json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or i == tries - 1:
                raise
            time.sleep(15 * (i + 1))
    raise RuntimeError("unreachable")


def is_in_query(points):
    """每個點前面放一個 marker，回應依序是 marker、所在的公園、所在的鄉鎮市"""
    parts = ["[out:json][timeout:180];"]
    for r, (lat, lon) in points:
        parts.append(
            f'make marker ref="{r}";out;'
            f"is_in({lat},{lon})->.x;"
            'area.x["leisure"="park"]["name"];out tags;'
            'area.x["boundary"="administrative"]["admin_level"~"^(7|8)$"];out tags;'
        )
    return "".join(parts)


def parse_is_in(elements):
    """{點的 ref: {"parks": [{"area", "name"}], "districts": [{"level", "name"}]}}"""
    out, cur = {}, None
    for e in elements:
        t = e.get("tags", {})
        if e["type"] == "marker":
            cur = out.setdefault(t["ref"], {"parks": [], "districts": []})
        elif cur is not None and t.get("leisure") == "park":
            cur["parks"].append({"area": e["id"], "name": t.get("name", "")})
        elif cur is not None and t.get("boundary") == "administrative":
            cur["districts"].append({"level": int(t.get("admin_level", 0)), "name": t.get("name", "")})
    return out


def within(points, query=None):
    """[(ref, (lat, lon))] → {ref: {"parks": […], "districts": […]}}，分批查詢。
    一批一直逾時（公開主機忙碌、範圍大的縣市）時拆成兩半再查，直到一次一個點；一個點也查不到才放棄。"""
    query = query or (lambda batch: overpass(is_in_query(batch), tries=3)[1])
    out = {}

    def run(batch):
        time.sleep(2)  # Overpass 的使用規範：不要連續大量查詢
        try:
            out.update(parse_is_in(query(batch)["elements"]))
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or len(batch) == 1:
                raise
            half = len(batch) // 2
            run(batch[:half])
            run(batch[half:])

    for i in range(0, len(points), BATCH):
        run(points[i:i + BATCH])
    return out
