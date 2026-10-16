"""把內政部「直轄市、縣市界線(TWD97經緯度)」簡化成首頁的 SVG 台灣地圖，存成 src/lib/taiwan-map.json。

資料：內政部國土測繪中心，政府資料開放平台資料集 7442（SHP），政府資料開放授權條款－第 1 版。
界線以陸地為準（OSM 的縣市行政界有些含海域，畫成地圖不像陸地，所以不用）。
只在要更新時手動執行；結果提交進 repo，建置不會連網路。
金門、連江離本島太遠，平移、縮放到左上角的小框裡（常見的台灣地圖畫法）；澎湖照實際位置；
本島範圍外的島（東沙、南沙等）不畫。
"""
import hashlib
import io
import json
import math
import struct
import sys
import zipfile
from datetime import date
from pathlib import Path

from lib.opendata import download

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src/lib/taiwan-map.json"
DATASET = "https://data.gov.tw/dataset/7442"
URL = ("https://www.tgos.tw/tgos/VirtualDir/Product/1cd4f4c9-6b01-4cf9-bf6c-23a73aa17d24/"
       "%E7%9B%B4%E8%BD%84%E5%B8%82%E3%80%81%E7%B8%A3(%E5%B8%82)%E7%95%8C%E7%B7%9A1140318.zip")
BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"

# 本島＋澎湖的經緯度範圍與投影（等距圓柱，經度乘 cos(23.7°)）
WEST, EAST, SOUTH, NORTH = 119.25, 122.2, 21.85, 25.4
K = math.cos(math.radians(23.7))
SCALE = 150  # 每 1 度緯度的 viewBox 單位
WIDTH = round((EAST - WEST) * K * SCALE)
HEIGHT = round((NORTH - SOUTH) * SCALE)

# 小框：名稱 → (經緯度範圍 (西, 南, 東, 北), 框在 viewBox 的位置 (x, y, 寬))
INSETS = {
    "連江縣": ((119.88, 25.93, 120.53, 26.4), (6, 6, 96)),
    "金門縣": ((118.18, 24.38, 118.5, 24.53), (6, 92, 96)),
}
TOLERANCE = 0.35     # Douglas–Peucker（viewBox 單位）
MIN_AREA = 1.0       # 比這小的島不畫（每個縣市至少留最大的一塊）
# 離島縣市的島都很小，門檻放低才畫得出來
MIN_AREA_BY_COUNTY = {"澎湖縣": 0.08, "金門縣": 0.3, "連江縣": 0.05}

# 太小的縣市，標籤位置手動微調（viewBox 單位，加在自動算出的位置上）
LABEL_NUDGE = {"新竹市": (-18, 0), "嘉義市": (-20, -4), "基隆市": (2, -9)}


# ---- SHP / DBF（只讀 Polygon，夠用就好，不另外裝套件）----

def read_dbf(raw):
    count, header_len, record_len = struct.unpack("<IHH", raw[4:12])
    fields = []
    for i in range(32, header_len - 1, 32):
        f = raw[i:i + 32]
        fields.append((f[:11].split(b"\0")[0].decode(), f[16]))
    rows, off = [], header_len
    for _ in range(count):
        rec, p, row = raw[off + 1:off + record_len], 0, {}
        for name, length in fields:
            row[name] = rec[p:p + length].decode("utf-8").strip()
            p += length
        rows.append(row)
        off += record_len
    return rows


def read_shp(raw):
    """[[ring, ...], ...]：每筆記錄的所有 ring（經緯度）"""
    shapes, off = [], 100
    while off < len(raw):
        _, length = struct.unpack(">ii", raw[off:off + 8])
        body = raw[off + 8:off + 8 + length * 2]
        off += 8 + length * 2
        if struct.unpack("<i", body[:4])[0] != 5:
            shapes.append([])
            continue
        num_parts, num_points = struct.unpack("<ii", body[36:44])
        parts = list(struct.unpack(f"<{num_parts}i", body[44:44 + 4 * num_parts])) + [num_points]
        pts_off = 44 + 4 * num_parts
        pts = [struct.unpack("<2d", body[pts_off + 16 * i:pts_off + 16 * i + 16]) for i in range(num_points)]
        shapes.append([pts[parts[i]:parts[i + 1]] for i in range(num_parts)])
    return shapes


# ---- 幾何 ----

def signed_area(ring):
    return sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1])) / 2


def inside(pt, ring):
    x, y = pt
    c = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def polygons(rings):
    """SHP 的外框是順時針、洞是逆時針（經緯度、y 向上）；洞歸給包住它的外框"""
    outers = [r for r in rings if signed_area(r) < 0]
    holes = [r for r in rings if signed_area(r) > 0]
    out = [(o, []) for o in outers]
    for h in holes:
        for o, hs in out:
            if inside(h[0], o):
                hs.append(h)
                break
    return out


def dp(points, tol):
    """Douglas–Peucker（迭代，長的 ring 也不會遞迴太深）"""
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = points[a], points[b]
        dx, dy = x2 - x1, y2 - y1
        norm = math.hypot(dx, dy)
        best, idx = 0.0, -1
        for i in range(a + 1, b):
            x, y = points[i]
            d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / norm if norm else math.hypot(x - x1, y - y1)
            if d > best:
                best, idx = d, i
        if idx >= 0 and best > tol:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(points, keep) if k]


def simplify_ring(ring, tol):
    pts = ring[:-1] if ring[0] == ring[-1] else ring
    if len(pts) < 4:
        return pts
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
    return dp(pts[:far + 1], tol)[:-1] + dp(pts[far:] + [pts[0]], tol)[:-1]


def seg_dist(p, a, b):
    (px, py), (ax, ay), (bx, by) = p, a, b
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy or 1e-9)))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def label_point(outer, holes):
    """離邊界最遠的內部點（格點搜尋），讓名稱落在區塊裡面"""
    xs, ys = [p[0] for p in outer], [p[1] for p in outer]
    best, pt = -1.0, (sum(xs) / len(xs), sum(ys) / len(ys))
    n = 40
    rings = [outer] + holes
    for i in range(n + 1):
        for j in range(n + 1):
            p = (min(xs) + (max(xs) - min(xs)) * i / n, min(ys) + (max(ys) - min(ys)) * j / n)
            if not inside(p, outer) or any(inside(p, h) for h in holes):
                continue
            d = min(seg_dist(p, a, b) for r in rings for a, b in zip(r, r[1:] + r[:1]))
            if d > best:
                best, pt = d, p
    return pt


# ---- 投影與輸出 ----

def project_main(lon, lat):
    return ((lon - WEST) * K * SCALE, (NORTH - lat) * SCALE)


def inset_projector(bounds, box):
    west, _, east, north = bounds
    x0, y0, w = box
    s = w / ((east - west) * K)
    return lambda lon, lat: (x0 + (lon - west) * K * s, y0 + (north - lat) * s)


def inset_height(bounds, box):
    west, south, east, north = bounds
    return box[2] * (north - south) / ((east - west) * K)


def within(ring, bounds):
    west, south, east, north = bounds
    return any(west <= lon <= east and south <= lat <= north for lon, lat in ring)


def path(rings):
    return "".join("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in r) + "Z" for r in rings)


def build(name, polys, project, bounds, min_area, label=None):
    shapes = []
    for outer, holes in polys:
        if not within(outer, bounds):
            continue
        o = simplify_ring([project(*p) for p in outer], TOLERANCE)
        hs = [simplify_ring([project(*p) for p in h], TOLERANCE) for h in holes]
        hs = [h for h in hs if len(h) >= 3 and abs(signed_area(h)) >= min_area]
        if len(o) >= 3:
            shapes.append((o, hs))
    shapes.sort(key=lambda s: -abs(signed_area(s[0])))
    kept = shapes[:1] + [s for s in shapes[1:] if abs(signed_area(s[0])) >= min_area]
    if label is None:
        label = label_point(*kept[0])
    lx, ly = label
    nx, ny = LABEL_NUDGE.get(name, (0, 0))
    return {"name": name, "d": path([r for o, hs in kept for r in [o] + hs]),
            "label": [round(lx + nx, 1), round(ly + ny, 1)]}


def main():
    raw = download(URL, timeout=120, user_agent=BROWSER_UA)
    z = zipfile.ZipFile(io.BytesIO(raw))
    base = next(n for n in z.namelist() if n.lower().endswith(".shp"))[:-4]
    rows = read_dbf(z.read(base + ".dbf"))
    shapes = read_shp(z.read(base + ".shp"))
    main_bounds = (WEST, SOUTH, EAST, NORTH)
    counties = []
    for row, rings in sorted(zip(rows, shapes), key=lambda t: t[0]["COUNTYCODE"]):
        name = row["COUNTYNAME"]
        polys = polygons(rings)
        if name in INSETS:
            bounds, box = INSETS[name]
            west, south, east, north = bounds
            # 小框裡的名稱放在框的下緣中間
            x0, y0, w = box
            counties.append(build(name, polys, inset_projector(bounds, box), (west, south, east, north),
                                  MIN_AREA_BY_COUNTY[name], label=(x0 + w / 2, y0 + inset_height(bounds, box) - 7)))
        else:
            counties.append(build(name, polys, project_main, main_bounds, MIN_AREA_BY_COUNTY.get(name, MIN_AREA)))
    out = {
        "source": "內政部國土測繪中心「直轄市、縣市界線(TWD97經緯度)」（政府資料開放授權條款－第 1 版），簡化後使用",
        "dataset": DATASET,
        "url": URL,
        "fetched": date.today().isoformat(),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "viewBox": [0, 0, WIDTH, HEIGHT],
        "insets": [{"name": n, "x": box[0], "y": box[1], "width": box[2],
                    "height": round(inset_height(bounds, box), 1)} for n, (bounds, box) in INSETS.items()],
        "counties": counties,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(counties)} 個縣市 → {OUT.relative_to(ROOT)}（{OUT.stat().st_size // 1024} KB）", file=sys.stderr)


if __name__ == "__main__":
    main()
