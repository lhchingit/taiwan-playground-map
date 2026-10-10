"""匯入新竹市兒童遊戲場清冊，並用 OpenStreetMap 座標取代原型暫用的 Google 座標。

輸入：data/seed/hsc/places.json v0.1（10 筆，scripts/build_seed.py 產生）＋ scripts/sources/hccg.py 讀的原始資料
輸出：data/seed/hsc/places.json v0.2（覆寫）、data/seed/hsc/places.csv、data/review/hsc/*.csv

規則（對應 CLAUDE.md 資料規則）：
  - 清冊寫「無」的場地不匯入地圖（另列 no-playground.csv 供確認）。
  - 沒有座標的場地不匯入（列在 unmatched.csv，待人工定位）。
  - 現有資料為 n、清冊為 y 時不自動覆蓋，列入 conflicts.csv。
  - 現有資料來源是網友評論線索（lead）而清冊為 y 時，改用清冊為來源。
"""
from pathlib import Path

from lib import pipeline
from sources import hccg, hccg_parks, hccg_toilets

ROOT = Path(__file__).resolve().parent.parent
TODAY = "2026-10-10"

if __name__ == "__main__":
    pipeline.run(ROOT, hccg, TODAY, parks=hccg_parks, toilets=hccg_toilets)
