"""TWD97 二度分帶（TM2，中央經線 121°E）與 WGS84 經緯度互轉（decisions D21）。

政府開放資料常用 TWD97 TM2 座標（例如臺北市公園設施資料的 X坐標、Y坐標）。
TWD97 使用 GRS80 橢球，與 WGS84 的差異在公分等級，地圖用途可以視為相同。
公式：Snyder, Map Projections — A Working Manual（USGS 1395），橫麥卡托投影的級數展開。
"""
import math

A = 6378137.0                     # GRS80 長半徑
F = 1 / 298.257222101             # GRS80 扁率
E2 = F * (2 - F)                  # 第一偏心率平方
EP2 = E2 / (1 - E2)               # 第二偏心率平方
K0 = 0.9999
LNG0 = math.radians(121)
DX = 250000.0                     # 東偏（公尺）


def _meridian(phi):
    e4, e6 = E2 * E2, E2 ** 3
    return A * ((1 - E2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi
                - (3 * E2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * math.sin(2 * phi)
                + (15 * e4 / 256 + 45 * e6 / 1024) * math.sin(4 * phi)
                - (35 * e6 / 3072) * math.sin(6 * phi))


def to_twd97(lat, lng):
    """(緯度, 經度) → (X, Y)（公尺）"""
    phi, lam = math.radians(lat), math.radians(lng)
    s, c, t = math.sin(phi), math.cos(phi), math.tan(phi)
    n = A / math.sqrt(1 - E2 * s * s)
    tt, cc, aa = t * t, EP2 * c * c, (lam - LNG0) * c
    x = K0 * n * (aa + (1 - tt + cc) * aa ** 3 / 6
                  + (5 - 18 * tt + tt * tt + 72 * cc - 58 * EP2) * aa ** 5 / 120) + DX
    y = K0 * (_meridian(phi) + n * t * (aa ** 2 / 2 + (5 - tt + 9 * cc + 4 * cc * cc) * aa ** 4 / 24
                                        + (61 - 58 * tt + tt * tt + 600 * cc - 330 * EP2) * aa ** 6 / 720))
    return x, y


def to_wgs84(x, y):
    """(X, Y)（公尺）→ (緯度, 經度)"""
    x -= DX
    mu = (y / K0) / (A * (1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256))
    e1 = (1 - math.sqrt(1 - E2)) / (1 + math.sqrt(1 - E2))
    fp = (mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu)
          + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu)
          + (151 * e1 ** 3 / 96) * math.sin(6 * mu)
          + (1097 * e1 ** 4 / 512) * math.sin(8 * mu))
    s, c, t = math.sin(fp), math.cos(fp), math.tan(fp)
    cc, tt = EP2 * c * c, t * t
    n = A / math.sqrt(1 - E2 * s * s)
    r = A * (1 - E2) / (1 - E2 * s * s) ** 1.5
    d = x / (n * K0)
    lat = fp - (n * t / r) * (d ** 2 / 2 - (5 + 3 * tt + 10 * cc - 4 * cc * cc - 9 * EP2) * d ** 4 / 24
                              + (61 + 90 * tt + 298 * cc + 45 * tt * tt - 3 * cc * cc - 252 * EP2) * d ** 6 / 720)
    lng = LNG0 + (d - (1 + 2 * tt + cc) * d ** 3 / 6
                  + (5 - 2 * cc + 28 * tt - 3 * cc * cc + 8 * EP2 + 24 * tt * tt) * d ** 5 / 120) / c
    return math.degrees(lat), math.degrees(lng)
