"""官方公園清單補地址與面積（sources/park_lists.py，新北市、臺中市）：不改名稱、座標與屬性"""
import unittest

from sources import park_lists
from sources import osm_playgrounds as osm


def pg(ref, park=None, name=None, district="板橋區"):
    return {"ref": ref, "lat": 25.0, "lng": 121.46, "tags": {"name": name} if name else {},
            "parks": [{"area": park[0], "name": park[1]}] if park else [],
            "districts": [{"level": 8, "name": district}]}


def official(seqno, name, area="板橋區", address="新北市板橋區某路1號"):
    return {"seqno": seqno, "name": name, "area": area, "address": address, "management": "板橋區公所"}


class BaseNameTest(unittest.TestCase):
    def test_strip_land_code_and_spaces(self):
        self.assertEqual(park_lists.base_name("南山公園 (公兒三)"), "南山公園")
        self.assertEqual(park_lists.base_name("訊塘社區公園(公兒十)"), "訊塘社區公園")
        self.assertEqual(park_lists.base_name("四維公園（公四）"), "四維公園")
        self.assertEqual(park_lists.base_name("溪 洲 公 園"), "溪洲公園")


class EnrichTest(unittest.TestCase):
    def run_enrich(self, playgrounds, records, manual=None, city="nwt"):
        groups, _, _ = osm.group_playgrounds(playgrounds, manual or {})
        groups = sorted(groups, key=lambda g: osm.ref_key(g["members"][0]["ref"]))
        places = osm.to_places(groups, city, ["slide"])
        before = [(p["name"], p["lat"], p["lng"], p["attrs"]) for p in places]
        matched, ambiguous = park_lists.enrich(places, groups, records, park_lists.CONFIGS[city])
        self.assertEqual([(p["name"], p["lat"], p["lng"], p["attrs"]) for p in places], before)  # 不改這些
        return places, matched, ambiguous

    def test_unique_match_adds_address(self):
        places, matched, _ = self.run_enrich([pg("n1", park=(1, "南山公園"))],
                                             [official("2", "南山公園 (公兒三)")])
        self.assertEqual(places[0]["address"], "新北市板橋區某路1號")
        self.assertEqual(places[0]["official_ref"][-1]["ntpc_seqno"], "2")
        self.assertIn("地址來自新北市公園資料", places[0]["summary"])
        self.assertEqual(len(matched), 1)

    def test_other_district_not_matched(self):
        places, matched, _ = self.run_enrich([pg("n1", park=(1, "南山公園"))],
                                             [official("2", "南山公園", area="八里區")])
        self.assertIsNone(places[0]["address"])
        self.assertEqual(matched, [])

    def test_ambiguous_goes_to_review(self):
        places, matched, ambiguous = self.run_enrich(
            [pg("n1", park=(1, "中山公園"))],
            [official("1", "中山公園(公一)"), official("2", "中山公園(公二)", address="另一個地址")])
        self.assertIsNone(places[0]["address"])
        self.assertEqual((matched, len(ambiguous)), ([], 1))

    def test_own_or_manual_names_not_matched(self):
        # 遊戲場自己的名稱、人工命名都不是公園名稱
        places, matched, _ = self.run_enrich(
            [pg("n1", name="南山公園"), pg("n2")], [official("2", "南山公園")], manual={"n2": "南山公園"})
        self.assertTrue(all(p["address"] is None for p in places))
        self.assertEqual(matched, [])


    def test_area_not_set_for_new_taipei(self):
        places, _, _ = self.run_enrich([pg("n1", park=(1, "南山公園"))], [official("2", "南山公園")])
        self.assertIsNone(places[0]["area_ha"])


def txg(seqno, name, district="02東區", address="自由三街與自由一街口", area="3,535"):
    return {"項次": seqno, "公園綠地名稱": name, "行政區": district, "類別": "公園", "設置地點": address,
            "面積（M2）": area, "維護單位": "區公所"}


class TaichungTest(unittest.TestCase):
    run_enrich = EnrichTest.run_enrich  # 同一套比對流程，不重跑新北市的案例

    def test_district_and_area_parsing(self):
        self.assertEqual(park_lists.txg_district("01中區"), "中區")
        self.assertEqual(park_lists.txg_district("29和平區"), "和平區")
        self.assertEqual(park_lists.txg_area("3,535"), 3535)
        self.assertIsNone(park_lists.txg_area(""))
        self.assertIsNone(park_lists.txg_area("-"))

    def test_unique_match_adds_address_and_area(self):
        places, matched, _ = self.run_enrich([pg("n1", park=(1, "干城公園"), district="東區")],
                                             [txg("2", "干城公園")], city="txg")
        p = places[0]
        self.assertEqual((p["address"], p["area_ha"]), ("自由三街與自由一街口", 0.35))
        self.assertEqual(p["official_ref"][-1]["txg_seqno"], "2")
        self.assertIn("地址與面積來自臺中市公園綠地清冊", p["summary"])
        self.assertEqual(len(matched), 1)

    def test_missing_area_only_adds_address(self):
        places, _, _ = self.run_enrich([pg("n1", park=(1, "干城公園"), district="東區")],
                                       [txg("2", "干城公園", area="")], city="txg")
        self.assertIsNone(places[0]["area_ha"])
        self.assertIn("地址來自臺中市公園綠地清冊", places[0]["summary"])

    def test_ambiguous_in_same_district(self):
        places, matched, ambiguous = self.run_enrich(
            [pg("n1", park=(1, "中山公園"), district="東區")],
            [txg("1", "中山公園(公一)"), txg("2", "中山公園")], city="txg")
        self.assertIsNone(places[0]["address"])
        self.assertEqual((matched, len(ambiguous)), ([], 1))


if __name__ == "__main__":
    unittest.main()
