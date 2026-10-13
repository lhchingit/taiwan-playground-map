"""新北市公園清單補地址（sources/ntpc_parks.py）：只補地址，不改名稱、座標與屬性"""
import unittest

from sources import ntpc_parks
from sources import osm_playgrounds as osm


def pg(ref, park=None, name=None, district="板橋區"):
    return {"ref": ref, "lat": 25.0, "lng": 121.46, "tags": {"name": name} if name else {},
            "parks": [{"area": park[0], "name": park[1]}] if park else [],
            "districts": [{"level": 8, "name": district}]}


def official(seqno, name, area="板橋區", address="新北市板橋區某路1號"):
    return {"seqno": seqno, "name": name, "area": area, "address": address, "management": "板橋區公所"}


class BaseNameTest(unittest.TestCase):
    def test_strip_land_code_and_spaces(self):
        self.assertEqual(ntpc_parks.base_name("南山公園 (公兒三)"), "南山公園")
        self.assertEqual(ntpc_parks.base_name("訊塘社區公園(公兒十)"), "訊塘社區公園")
        self.assertEqual(ntpc_parks.base_name("四維公園（公四）"), "四維公園")
        self.assertEqual(ntpc_parks.base_name("溪 洲 公 園"), "溪洲公園")


class EnrichTest(unittest.TestCase):
    def run_enrich(self, playgrounds, records, manual=None):
        groups, _, _ = osm.group_playgrounds(playgrounds, manual or {})
        groups = sorted(groups, key=lambda g: osm.ref_key(g["members"][0]["ref"]))
        places = osm.to_places(groups, "nwt", ["slide"])
        before = [(p["name"], p["lat"], p["lng"], p["attrs"]) for p in places]
        matched, ambiguous = ntpc_parks.enrich(places, groups, records)
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


if __name__ == "__main__":
    unittest.main()
