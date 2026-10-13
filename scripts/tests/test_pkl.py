"""臺北市公園設施資料（sources/pkl.py、lib/twd97.py、lib/numbering.py，decisions D21）"""
import json
import unittest
from pathlib import Path

from lib.numbering import assign_numbers
from lib.twd97 import to_twd97, to_wgs84
from sources import pkl

ROOT = Path(__file__).resolve().parents[2]


def row(no, name="甲公園", dist="大安", x="304000", y="2768000", **counts):
    r = {"no": no, "公園名稱": name, "行政區": dist, "管理單位": "某所", "X坐標": x, "Y坐標": y}
    for c in pkl.ALL_COUNTS:
        r[c] = str(counts.get(c.removesuffix("數量"), 0))
    return r


class Twd97Test(unittest.TestCase):
    def test_origin(self):
        lat, lng = to_wgs84(250000, 0)
        self.assertAlmostEqual(lat, 0, places=9)
        self.assertAlmostEqual(lng, 121, places=9)

    def test_round_trip_within_1cm(self):
        for lat, lng in [(25.0339, 121.5645), (24.8, 120.97), (25.2, 121.4), (22.0, 120.8)]:
            x, y = to_twd97(lat, lng)
            back = to_twd97(*to_wgs84(x, y))
            self.assertLess(abs(back[0] - x), 0.01)
            self.assertLess(abs(back[1] - y), 0.01)

    def test_taipei_101(self):
        # 台北 101 約在 TWD97 (306966, 2769651)
        x, y = to_twd97(25.0339, 121.5645)
        self.assertAlmostEqual(x, 306966, delta=1)
        self.assertAlmostEqual(y, 2769651, delta=1)


class CountsTest(unittest.TestCase):
    def test_positive_is_y_zero_is_unknown(self):
        total = pkl.totals({"areas": [row(1, 鞦韆=2, 戲沙坑=0, 組合遊具=1)]})
        mapped = pkl.map_counts(total)
        self.assertEqual(set(mapped), {"swing"})  # 0 不是「沒有」：不出現，維持 u
        self.assertEqual(mapped["swing"], "公園處設施資料：鞦韆 2 座")

    def test_note_only_columns_not_mapped(self):
        total = pkl.totals({"areas": [row(1, 組合遊具=1, 擺盪船索=1, 其他=2)]})
        self.assertEqual(pkl.map_counts(total), {})
        text = pkl.summary({"areas": [row(1)]}, total)
        self.assertIn("組合遊具 1 座", text)
        self.assertIn("擺盪船索 1 座", text)
        self.assertIn("其他遊具 2 座", text)

    def test_not_a_number_stops(self):
        with self.assertRaises(ValueError):
            pkl.count({"公園名稱": "甲", "鞦韆數量": "兩座"}, "鞦韆數量")


class GroupTest(unittest.TestCase):
    def test_exact_duplicates_and_merge(self):
        parks = pkl.group_parks([
            row(1, x="304100", 鞦韆=1), row(1, x="304100", 鞦韆=1),  # 完全相同：算一次
            row(1, x="304000", 搖搖樂=1),
            row(2, name="乙公園"),
        ])
        self.assertEqual([(p["no"], len(p["areas"])) for p in parks], [(1, 2), (2, 1)])
        # 座標用 (X, Y) 最小的那一處，跟原始資料的順序無關
        self.assertEqual(parks[0]["areas"][0]["X坐標"], "304000")
        total = pkl.totals(parks[0])
        self.assertEqual((total["鞦韆數量"], total["搖搖樂數量"]), (1, 1))
        self.assertIn("2 處遊戲區", pkl.summary(parks[0], total))

    def test_district(self):
        self.assertEqual(pkl.district("文山(木柵)"), "文山區")
        self.assertEqual(pkl.district("內湖"), "內湖區")
        self.assertEqual(pkl.district("園(信義)"), "信義區")
        self.assertIsNone(pkl.district("板橋"))

    def test_odd_name(self):
        self.assertTrue(pkl.ODD_NAME.match("園(信義)16"))
        self.assertFalse(pkl.ODD_NAME.match("大安森林公園"))

    def test_stable_numbers_by_name_and_district(self):
        # 同名不同區是不同的公園
        recs = assign_numbers([row(0, name="新興公園", dist="中山"), row(0, name="新興公園", dist="北投"),
                               row(0, name="新興公園", dist="中山")], {}, key=pkl.park_key)
        self.assertEqual([r["no"] for r in recs], [1, 2, 1])
        again = assign_numbers([row(0, name="新興公園", dist="北投")], {"新興公園｜中山": 1, "新興公園｜北投": 2},
                               key=pkl.park_key)
        self.assertEqual(again[0]["no"], 2)


class RepoSeedTest(unittest.TestCase):
    def test_seed(self):
        seed = json.loads((ROOT / "data/seed/tpe/places.json").read_text(encoding="utf-8"))
        places = seed["places"]
        self.assertTrue(places)
        self.assertNotIn("n", {a["v"] for p in places for a in p["attrs"].values()})
        names = [p["name"] for p in places]
        self.assertEqual(len(names), len(set(names)))
        self.assertIn("新興公園（中山區）", names)
        self.assertIn("新興公園（北投區）", names)
        self.assertFalse(any(pkl.ODD_NAME.match(n) for n in names))
        for p in places:
            self.assertIn(p["district"], pkl.DISTRICTS)
            self.assertTrue(24.9 < p["lat"] < 25.3 and 121.4 < p["lng"] < 121.7, p["id"])


if __name__ == "__main__":
    unittest.main()
