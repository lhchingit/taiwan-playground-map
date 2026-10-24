"""桃園市公園（sources/tycg.py、import_tycg.py、fetch_tycg_parks.py）"""
import json
import unittest
from pathlib import Path

import import_tycg
from fetch_tycg_parks import assign_numbers
from sources import tycg

ROOT = Path(__file__).resolve().parents[2]


class ItemsTest(unittest.TestCase):
    def test_split_keeps_parentheses_together(self):
        self.assertEqual(tycg.split_items("磨石子(直道、彎道)溜滑梯、攀爬牆/沙坑，鞦韆。"),
                         ["磨石子(直道、彎道)溜滑梯", "攀爬牆", "沙坑", "鞦韆"])

    def test_task_terms(self):
        # docs/tasks/P4-expansion.md 列出的桃園用語
        cases = {
            "鞍式鞦韆": "swing", "親子鞦韆": "swing", "高低單槓": "bars", "滑索": "zipline",
            "梅花樁": "balance", "隧道": "tunnel", "攀爬牆": "climbing_wall", "低齡兒童遊具組": "toddler_zone",
        }
        for text, key in cases.items():
            attrs, unmapped = tycg.map_facilities(text)
            self.assertIn(key, attrs, text)
            self.assertEqual(unmapped, [], text)

    def test_unmapped_not_guessed(self):
        attrs, unmapped = tycg.map_facilities("城堡遊戲組、擺盪大索、溜滑梯")
        self.assertEqual(set(attrs), {"slide"})
        self.assertEqual(unmapped, ["城堡遊戲組", "擺盪大索"])

    def test_has_playground(self):
        def check(text):
            attrs, _ = tycg.map_facilities(text)
            return tycg.has_playground(attrs, tycg.split_items(text))
        self.assertTrue(check("步道、溜滑梯"))
        self.assertTrue(check("步道、涼亭、遊戲場"))      # 籠統寫有遊戲場
        self.assertFalse(check("步道、籃球場、體健設施"))  # 球場、體健不算遊具
        self.assertFalse(check("木棧步道、觀景台"))

    def test_flags(self):
        self.assertEqual(tycg.flag("˙"), "y")
        self.assertEqual(tycg.flag(" ˙ "), "y")
        self.assertEqual(tycg.flag(""), "u")  # 未提供，不是沒有


class DecisionsTest(unittest.TestCase):
    def write(self, text):
        import tempfile
        path = Path(tempfile.mkdtemp()) / "item-decisions.tsv"
        path.write_text(text, encoding="utf-8")
        return path

    HEAD = "用語\t決定\t理由\t決定者\t日期\n"

    def test_decisions_apply(self):
        decisions = {"多人座搖椅": "spring_rider", "擺盪大索": tycg.NO_MAP}
        attrs, pending = tycg.map_facilities("多人座搖椅、擺盪大索、城堡遊戲組、溜滑梯", decisions)
        self.assertEqual(attrs, {"spring_rider": "多人座搖椅", "slide": "溜滑梯"})
        self.assertEqual(pending, ["城堡遊戲組"])  # 只剩還沒決定的

    def test_decision_adds_to_existing_attr(self):
        attrs, _ = tycg.map_facilities("搖搖馬、多人座搖椅", {"多人座搖椅": "spring_rider"})
        self.assertEqual(attrs["spring_rider"], "搖搖馬、多人座搖椅")

    def test_load_and_validate(self):
        ok = self.write(self.HEAD + "轉轉椅\tspinner\t會轉\tA\t2026-10-11\n")
        self.assertEqual(tycg.load_decisions(ok, ["spinner"]), {"轉轉椅": "spinner"})
        bad = self.write(self.HEAD + "某物\tnot_a_key\t\t\t\n")
        with self.assertRaises(ValueError) as e:
            tycg.load_decisions(bad, ["spinner"])
        self.assertIn("屬性 key", str(e.exception))
        self.assertIn("理由與決定者", str(e.exception))

    def test_repo_decisions_are_valid_and_cover_all_terms(self):
        # repo 裡的決定清單合法；目前所有對不到的用語都已經決定（unmapped-items.csv 是空的）
        from lib.attrs import attr_keys
        from lib.labels import labels_json
        keys = attr_keys(labels_json())
        decisions = tycg.load_decisions(ROOT / "data/raw/tyc/item-decisions.tsv", keys)
        self.assertEqual(decisions["擺盪大索"], tycg.NO_MAP)
        self.assertEqual(decisions["極限飛輪"], tycg.NO_MAP)
        rows = (ROOT / "data/review/tyc/unmapped-items.csv").read_text(encoding="utf-8-sig").strip().splitlines()
        self.assertEqual(len(rows), 1, rows)


class NumbersTest(unittest.TestCase):
    def test_stable_numbers(self):
        first = assign_numbers([{"公園名稱": "甲公園"}, {"公園名稱": "乙公園"}], {})
        self.assertEqual([r["no"] for r in first], [1, 2])
        # 下一版：順序改變、名稱空白不同、有新的、甲被刪除
        again = assign_numbers([{"公園名稱": "丙公園"}, {"公園名稱": "乙 公園"}],
                               {r["公園名稱"]: r["no"] for r in first})
        self.assertEqual([r["no"] for r in again], [3, 2])  # 刪除的 1 不重用


class ImportTest(unittest.TestCase):
    def rec(self, no, name, kind="特色遊戲場", facilities="溜滑梯", parking="", toilet=""):
        return {"no": no, "類別": kind, "公園名稱": name, "區域": "桃園區", "地址": "某路",
                "特色": "", "設施": facilities, "停車": parking, "廁所": toilet}

    def test_merge_same_name(self):
        [p] = import_tycg.merge_records([
            self.rec(1, "鑊篤陂塘生態公園", facilities="溜滑梯、沙坑"),
            self.rec(1, "鑊篤陂塘生態公園", kind="埤塘公園", facilities="步道、遊戲場", toilet="˙"),
        ])
        self.assertEqual(p["facilities"], "溜滑梯、沙坑、步道、遊戲場")
        self.assertEqual((p["parking"], p["toilet"]), ("u", "y"))

    def test_coordinate_rules(self):
        park = {"no": 7}
        row = lambda m: ["7", "x", m, "w1", "24.9", "121.3"]  # noqa: E731
        for m in ("exact", "exact-district", "nominatim-poi"):
            coord, label, pending = import_tycg.coordinate(park, row(m), {})
            self.assertEqual(coord, (24.9, 121.3), m)
            self.assertIn(m, label)
        for m in ("contains", "review-multi", "nominatim-street"):
            coord, _, pending = import_tycg.coordinate(park, row(m), {})
            self.assertIsNone(coord, m)
            self.assertEqual(pending, m)
        # 人工確認比對正確 → 採用；人工定位 → 用人工座標；找不到 → 不上地圖
        coord, label, _ = import_tycg.coordinate(park, row("contains"), {"7": {"狀態": "confirmed"}})
        self.assertEqual(coord, (24.9, 121.3))
        self.assertIn("人工確認", label)
        man = {"狀態": "located", "緯度": "24.95", "經度": "121.25", "定位依據": "實地確認", "定位者": "A",
               "日期": "2026-10-11"}
        coord, label, _ = import_tycg.coordinate(park, row("none"), {"7": man})
        self.assertEqual(coord, (24.95, 121.25))
        self.assertIn("人工定位", label)
        coord, _, _ = import_tycg.coordinate(park, row("exact"), {"7": {"狀態": "not_found"}})
        self.assertIsNone(coord)


class SplitOsmTest(unittest.TestCase):
    """OSM 遊戲場補充：官方場地已涵蓋的不重複、太近又不同名的等人工判斷"""
    OFFICIAL = [{"id": "tyc-tycg-001", "name": "大有梯田生態公園", "lat": 25.0, "lng": 121.3, "osm": "w100"},
                {"id": "tyc-tycg-002", "name": "人工定位公園", "lat": 24.9, "lng": 121.2, "osm": None}]

    def pg(self, ref, lat, lng, parks=(), name=None):
        return {"ref": ref, "lat": lat, "lng": lng, "tags": {"name": name} if name else {},
                "parks": [{"area": a, "name": n} for a, n in parks], "districts": []}

    def split(self, pgs, manual=None):
        extra, covered, near = tycg.split_osm(pgs, self.OFFICIAL, manual or {})
        return ([p["ref"] for p in extra], [(p["ref"], o["id"], why) for p, o, why in covered],
                [(p["ref"], o["id"]) for p, o, _ in near])

    def test_same_osm_object(self):
        # 遊戲場在官方場地比對到的公園（w100 → area 2400000100）裡；或遊戲場本身就是那個物件
        _, covered, _ = self.split([self.pg("n1", 25.01, 121.31, parks=[(2400000100, "別名公園")]),
                                    self.pg("w100", 25.0, 121.3)])
        self.assertEqual(covered, [("n1", "tyc-tycg-001", "同一個 OSM 物件"), ("w100", "tyc-tycg-001", "同一個 OSM 物件")])

    def test_same_name(self):
        _, covered, _ = self.split([self.pg("n2", 24.903, 121.2, parks=[(9, "人工定位 公園")])])  # 約 330 公尺
        self.assertEqual(covered, [("n2", "tyc-tycg-002", "名稱相同")])

    def test_same_name_far_away_is_another_park(self):
        # 同名但相距很遠（約 11 公里）：是別的公園，不算涵蓋
        extra, covered, _ = self.split([self.pg("n5", 25.0, 121.2, parks=[(9, "人工定位公園")])])
        self.assertEqual((extra, covered), (["n5"], []))

    def test_near_with_other_name_waits_for_review(self):
        # 約 100 公尺、名稱不同：不推測是不是同一處
        pgs = [self.pg("n3", 24.9009, 121.2, parks=[(8, "隔壁公園")])]
        extra, covered, near = self.split(pgs)
        self.assertEqual((extra, covered, near), ([], [], [("n3", "tyc-tycg-002")]))
        # 人工判斷過（填名稱或「（排除）」）就照一般規則
        extra, _, near = self.split(pgs, {"n3": "（排除）"})
        self.assertEqual((extra, near), (["n3"], []))

    def test_far_is_extra(self):
        extra, covered, near = self.split([self.pg("n4", 24.92, 121.2, parks=[(8, "遠方公園")])])
        self.assertEqual((extra, covered, near), (["n4"], [], []))

    def test_area_id(self):
        self.assertEqual(tycg.area_id("w447066447"), 2400000000 + 447066447)
        self.assertEqual(tycg.area_id("r5"), 3600000005)
        self.assertIsNone(tycg.area_id("n1"))
        self.assertIsNone(tycg.area_id(None))


class RepoSeedTest(unittest.TestCase):
    def test_official_places_keep_ids_and_osm_places_are_unknown(self):
        seed = json.loads((ROOT / "data/seed/tyc/places.json").read_text(encoding="utf-8"))
        official = [p for p in seed["places"] if p["id"].startswith("tyc-tycg-")]
        extra = [p for p in seed["places"] if p["id"].startswith("tyc-osm-")]
        self.assertEqual(len(official) + len(extra), len(seed["places"]))
        self.assertEqual(len(official), 34)
        self.assertTrue(extra)
        # OSM 遊戲場的屬性只會來自人工查證（research.json 的網路文章或新聞），其他都是未知
        researched = {k for k, s in seed["sources"].items() if s["kind"] in ("news", "article")}
        for p in extra:
            for k, a in p["attrs"].items():
                self.assertTrue(a["v"] == "u" or a["src"] in researched, (p["id"], k))
        names = [p["name"] for p in seed["places"]]
        self.assertEqual(len(names), len(set(names)))


class NoGoogleTest(unittest.TestCase):
    def test_repo_data_has_no_google_links(self):
        # 原始資料的「地標」是 Google 地圖連結，不可以存進 repo
        for path in [ROOT / "data/raw/tyc/tycg-parks.json", ROOT / "data/seed/tyc/places.json"]:
            text = path.read_text(encoding="utf-8").lower()
            for word in ("goo.gl", "google.com/maps", "g.page"):
                self.assertFalse(word in text, f"{path.name} 含有 {word}")
        raw = json.loads((ROOT / "data/raw/tyc/tycg-parks.json").read_text(encoding="utf-8"))
        self.assertFalse(any("地標" in r for r in raw["records"]), "原始資料不可以存「地標」欄")

    def test_seed_flags_only_y_or_u(self):
        seed = json.loads((ROOT / "data/seed/tyc/places.json").read_text(encoding="utf-8"))
        values = {p["attrs"]["toilet"]["v"] for p in seed["places"]}
        self.assertTrue(values <= {"y", "u"})
        self.assertNotIn("n", {a["v"] for p in seed["places"] for a in p["attrs"].values()})


if __name__ == "__main__":
    unittest.main()
