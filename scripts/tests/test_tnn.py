"""臺南市公園設施資料（sources/tnn.py，decisions D21）：數量 > 0 才是「有」，0 或空白是未知，沒有任何「無」"""
import unittest

from sources import osm_playgrounds as osm
from sources import tnn


def park(**counts):
    r = {"公園名稱": "測試公園", "所在轄區": "東區", "緯度": "22.98", "經度": "120.24", "面積公頃": "0.5"}
    r.update({f"{k}數量": str(v) for k, v in counts.items()})
    return r


class TnnTest(unittest.TestCase):
    def test_only_positive_counts_are_yes(self):
        r = park(溜滑梯=2, 盪鞦韆=0, 搖搖樂="")
        self.assertEqual(tnn.map_counts(r), {"slide": "公園設施資料：溜滑梯 2"})
        # 0 與空白都不寫（維持 u），沒有任何 n
        self.assertNotIn("swing", tnn.map_counts(r))

    def test_several_columns_to_one_key(self):
        r = park(蹺蹺板=1, 彈力蹺蹺板=2, 搖搖椅=3, 籃球場=1, 網球場=1, 高燈=4, 矮燈=2, 公廁=1, 移動式廁間=1)
        m = tnn.map_counts(r)
        self.assertEqual(m["seesaw"], "公園設施資料：蹺蹺板 1、彈力蹺蹺板 2")
        self.assertEqual(m["spring_rider"], "公園設施資料：搖搖椅 3")
        self.assertEqual(m["ball_court"], "公園設施資料：籃球場 1、網球場 1")
        self.assertEqual(m["lighting"], "公園設施資料：高燈 4、矮燈 2")
        self.assertEqual(m["toilet"], "公園設施資料：公廁 1、移動式廁間 1")

    def test_fitness_and_combo(self):
        # 天梯雲梯、平衡木在體健區：對照到單槓、平衡木，但只有它們不算有遊戲場
        fitness = park(天梯雲梯=1, 平衡木=1, 太空漫步機雙人漫步機=2)
        self.assertEqual(set(tnn.map_counts(fitness)), {"bars", "balance"})
        self.assertFalse(tnn.is_playground(fitness))
        # 組合遊具只寫進說明，不推測裡面有什麼，但算有遊戲場
        combo = park(大型兒童遊具=1)
        self.assertTrue(tnn.is_playground(combo))
        self.assertEqual(tnn.map_counts(combo), {})
        self.assertIn("大型兒童遊具 1 座", tnn.summary(combo))

    def test_parking_lot_with_spaces(self):
        self.assertEqual(tnn.parking(park(汽車停車位=31)),
                         {"type": "lot", "spaces": 31, "note": "公園設施資料：汽車停車位 31 格"})
        self.assertIsNone(tnn.parking(park(機車停車位=10)))

    def test_counts_must_be_integers(self):
        self.assertEqual(tnn.count(park(溜滑梯="2.0"), "溜滑梯數量"), 2)
        with self.assertRaises(ValueError):
            tnn.count(park(溜滑梯="兩座"), "溜滑梯數量")
        with self.assertRaises(ValueError):
            tnn.count(park(溜滑梯="1.5"), "溜滑梯數量")

    def test_odd_names(self):
        for name in ["公一", "公兒三", "公1", "公二十"]:
            self.assertRegex(name, tnn.ODD_NAME)
        for name in ["公園路公園", "公園", "千禧公園"]:
            self.assertNotRegex(name, tnn.ODD_NAME)

    def test_display_name_drops_land_use_codes(self):
        for raw, shown in [("南門公園(公8)", "南門公園"), ("長榮公園(富台段公兒38)", "長榮公園"),
                           ("光州公園(公兒13)(原大世界公園)", "光州公園(原大世界公園)"),
                           ("華平公園(舊苗圃)", "華平公園(舊苗圃)"), ("新順公園(二)(公兒6)", "新順公園(二)"),
                           ("公兒(中埕里鄰公園)", "中埕里鄰公園"), ("建南公園(公)", "建南公園"),
                           ("佃西里如意公園(公六)", "佃西里如意公園"), ("牛墟公園(公兒1-4)", "牛墟公園")]:
            self.assertEqual(tnn.display_name(raw), shown)

    def test_suspicious_osm_names(self):
        for name in ["碰碰車", "一心保齡球館", "公兒37"]:
            self.assertTrue(osm.suspicious_name(name), name)
        for name in ["臺南公園", "兒童遊樂區", "親子廣場"]:
            self.assertFalse(osm.suspicious_name(name), name)

    def test_coordinate_and_area(self):
        self.assertEqual(tnn.coordinate(park()), (22.98, 120.24))
        self.assertIsNone(tnn.coordinate({**park(), "緯度": "", "經度": ""}))
        self.assertEqual(tnn.area_ha(park()), 0.5)
        self.assertIsNone(tnn.area_ha({**park(), "面積公頃": ""}))

    def test_osm_coordinate_same_name_same_district(self):
        def pg(ref, park_name, district):
            return {"ref": ref, "lat": 23.0, "lng": 120.2, "tags": {},
                    "parks": [{"area": 1, "name": park_name}], "districts": [{"level": 8, "name": district}]}
        pgs = [pg("w20", "測試 公園", "東區"), pg("w10", "測試公園", "東區"), pg("w5", "測試公園", "北區")]
        self.assertEqual(tnn.osm_coordinate("測試公園", "東區", pgs, osm.district_of, osm.ref_key),
                         (23.0, 120.2, "w10"))
        self.assertIsNone(tnn.osm_coordinate("測試公園", "南區", pgs, osm.district_of, osm.ref_key))


if __name__ == "__main__":
    unittest.main()
