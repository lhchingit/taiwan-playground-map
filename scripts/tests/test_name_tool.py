"""人工命名工具：附近名稱的解析（不連網路），以及 Python 端讀得懂工具寫出的 manual-names.tsv"""
import unittest
from pathlib import Path

from lib import overpass
from sources import osm_playgrounds as osm

ROOT = Path(__file__).resolve().parents[2]


class NearbyTest(unittest.TestCase):
    def test_parse_sort_dedupe_and_skip_self(self):
        coords = {"n1": (25.0, 121.5)}
        elements = [
            {"type": "marker", "tags": {"ref": "n1"}},
            {"type": "way", "id": 2, "center": {"lat": 25.001, "lon": 121.5},
             "tags": {"name": "遠一點的國小", "amenity": "school"}},
            {"type": "way", "id": 3, "center": {"lat": 25.0002, "lon": 121.5},
             "tags": {"name": "文化公園", "leisure": "park"}},
            {"type": "way", "id": 3, "center": {"lat": 25.0002, "lon": 121.5},
             "tags": {"name": "文化公園", "leisure": "park"}},  # 同一個物件只列一次
            {"type": "node", "id": 1, "lat": 25.0, "lon": 121.5,
             "tags": {"name": "自己", "leisure": "playground"}},  # 遊戲場本身不列
            {"type": "node", "id": 9, "lat": 25.0, "lon": 121.5, "tags": {"leisure": "park"}},  # 沒有名稱
        ]
        out = overpass.parse_nearby(elements, coords, {"n1": "n1"})
        self.assertEqual([(x["name"], x["kind"]) for x in out["n1"]], [("文化公園", "公園"), ("遠一點的國小", "學校")])
        self.assertLess(out["n1"][0]["distance_m"], out["n1"][1]["distance_m"])

    def test_point_without_hits_is_present(self):
        out = overpass.parse_nearby([{"type": "marker", "tags": {"ref": "n1"}}], {"n1": (25.0, 121.5)})
        self.assertEqual(out, {"n1": []})

    def test_query_has_marker_per_point(self):
        q = overpass.nearby_query([("n1", (25.0, 121.5)), ("n2", (24.0, 120.5))])
        self.assertEqual(q.count("make marker"), 2)
        self.assertIn("around:150,25.0,121.5", q)


class SharedSampleTest(unittest.TestCase):
    def test_python_reads_tool_output(self):
        # 工具（scripts/tools/name/names-file.ts）寫出的格式；TS 端也用同一個檔測試
        names = osm.load_manual(ROOT / "tests/fixtures/manual-names-sample.tsv", {"n100", "w200"})
        self.assertEqual(names, {"n100": "文化公園", "w200": osm.EXCLUDE})


if __name__ == "__main__":
    unittest.main()
