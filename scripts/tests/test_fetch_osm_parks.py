"""fetch_osm_parks.py：OSM 公園的中心點要在這個縣市（admin_level=4），編號打錯時在下載階段擋下來（不連網路）"""
import unittest

import fetch_osm_parks
from lib import overpass


def park(*districts, name="北社尾公園"):
    return {"name": name, "districts": [{"level": lv, "name": n} for lv, n in districts]}


class WrongCityTest(unittest.TestCase):
    def test_same_city_ok(self):
        parks = {"w1": park((4, "嘉義市"), (8, "西區"))}
        self.assertEqual(fetch_osm_parks.wrong_city(parks, "嘉義市"), [])

    def test_other_city_listed(self):
        # PR #129：北社尾公園誤寫成嘉義縣民雄左岸公園的編號
        parks = {"w548372059": park((4, "嘉義縣"), (8, "民雄鄉"), name="民雄左岸公園"),
                 "w548372060": park((4, "嘉義市"), (8, "西區"))}
        self.assertEqual(fetch_osm_parks.wrong_city(parks, "嘉義市"),
                         [("w548372059", "民雄左岸公園", "嘉義縣")])

    def test_no_city_listed(self):
        # 查不到縣市（例如海上、行政界缺資料）也不放行
        parks = {"w1": park((8, "西區"))}
        self.assertEqual(fetch_osm_parks.wrong_city(parks, "嘉義市"), [("w1", "北社尾公園", "")])

    def test_unnamed_city_ignored(self):
        parks = {"w1": park((4, ""), (8, "西區"))}
        self.assertEqual(fetch_osm_parks.wrong_city(parks, "嘉義市"), [("w1", "北社尾公園", "")])


class IsInQueryTest(unittest.TestCase):
    def test_default_levels_unchanged(self):
        # 其他呼叫者（import_osm_city 等）的查詢不變
        q = overpass.is_in_query([("w1", (23.5, 120.4))])
        self.assertIn('["admin_level"~"^(7|8)$"]', q)

    def test_city_level(self):
        q = overpass.is_in_query([("w1", (23.5, 120.4))], levels="4|7|8")
        self.assertIn('["admin_level"~"^(4|7|8)$"]', q)


if __name__ == "__main__":
    unittest.main()
