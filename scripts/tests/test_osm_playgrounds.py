"""OpenStreetMap 遊戲場 → 場地（sources/osm_playgrounds.py，decisions D20）"""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from sources import osm_playgrounds as osm

KEYS = ["slide", "toilet"]


def pg(ref, lat=24.8, lng=121.0, name=None, park=None, district="竹北市", **tags):
    t = dict(tags)
    if name:
        t["name"] = name
    return {
        "ref": ref, "lat": lat, "lng": lng, "tags": t,
        "parks": [{"area": park[0], "name": park[1]}] if park else [],
        "districts": [{"level": 8, "name": district}] if district else [],
    }


class GroupTest(unittest.TestCase):
    def test_park_name_and_merge(self):
        # 同一個公園裡的遊戲場合併成一處，名稱用公園名稱；自己的名稱寫在說明裡
        groups, unnamed, excluded = osm.group_playgrounds([
            pg("w20", park=(1, "AI智慧園區公園"), name="滑梯遊戲區"),
            pg("w10", park=(1, "AI智慧園區公園")),
            pg("w30", park=(2, "文忠路公園")),
        ], {})
        self.assertEqual([(g["name"], [m["ref"] for m in g["members"]]) for g in groups],
                         [("AI智慧園區公園", ["w10", "w20"]), ("文忠路公園", ["w30"])])
        self.assertEqual((unnamed, excluded), ([], []))
        self.assertIn("2 處遊戲區：滑梯遊戲區", osm.summary(groups[0]))

    def test_own_name_when_not_in_park(self):
        groups, unnamed, _ = osm.group_playgrounds([pg("n1", name="惠安社區遊樂場")], {})
        self.assertEqual(groups[0]["name"], "惠安社區遊樂場")
        self.assertEqual(unnamed, [])

    def test_unnamed_goes_to_review_not_guessed(self):
        groups, unnamed, _ = osm.group_playgrounds([pg("w5")], {})
        self.assertEqual(groups, [])
        self.assertEqual([p["ref"] for p in unnamed], ["w5"])

    def test_manual_name_and_exclude(self):
        groups, unnamed, excluded = osm.group_playgrounds(
            [pg("w5"), pg("w6", park=(3, "某公園")), pg("w7")],
            {"w5": "里民活動中心遊戲場", "w6": osm.EXCLUDE},
        )
        self.assertEqual([g["name"] for g in groups], ["里民活動中心遊戲場"])
        self.assertEqual([p["ref"] for p in excluded], ["w6"])  # 在公園裡也可以排除
        self.assertEqual([p["ref"] for p in unnamed], ["w7"])

    def test_district_and_park_choice_are_stable(self):
        p = pg("w1")
        p["districts"] = [{"level": 7, "name": "上層"}, {"level": 8, "name": "竹北市"}]
        p["parks"] = [{"area": 9, "name": "乙"}, {"area": 3, "name": "甲"}]
        self.assertEqual(osm.district_of(p), "竹北市")
        self.assertEqual(osm.park_of(p)["name"], "甲")


class PlacesTest(unittest.TestCase):
    def test_all_unknown_and_osm_coords(self):
        groups, _, _ = osm.group_playgrounds([pg("w10", lat=24.81234567891, park=(1, "公園"))], {})
        [p] = osm.to_places(groups, "hsq", KEYS)
        self.assertEqual(p["id"], "hsq-osm-w10")
        self.assertEqual(p["lat"], 24.8123457)
        self.assertEqual(p["source_coords"], "OpenStreetMap w10（leisure=playground）")
        self.assertEqual({a["v"] for a in p["attrs"].values()}, {"u"})  # 不推測，也沒有任何 n
        self.assertEqual((p["size"], p["stay"], p["fee"], p["age_min"]), (None, None, None, None))
        self.assertEqual(p["parking"]["type"], "u")
        self.assertEqual(p["city"], "hsq")

    def test_same_name_gets_district(self):
        groups, _, _ = osm.group_playgrounds([
            pg("w1", park=(1, "中正公園"), district="竹北市"),
            pg("w2", park=(2, "中正公園"), district="竹東鎮"),
            pg("w3", park=(3, "中正公園"), district="竹東鎮"),
        ], {})
        names = [p["name"] for p in osm.to_places(groups, "hsq", KEYS)]
        self.assertEqual(names, ["中正公園（竹北市）", "中正公園（竹東鎮）", "中正公園（竹東鎮・w3）"])


class ManualFileTest(unittest.TestCase):
    def write(self, text):
        d = tempfile.mkdtemp()
        path = Path(d) / "manual-names.tsv"
        path.write_text(text, encoding="utf-8")
        return path

    def test_valid(self):
        path = self.write("OSM\t名稱\t依據\t確認者\t日期\nw5\t某遊戲場\t實地\tA\t2026-10-11\n")
        self.assertEqual(osm.load_manual(path, {"w5"}), {"w5": "某遊戲場"})

    def test_errors(self):
        path = self.write("OSM\t名稱\t依據\t確認者\t日期\nw9\t\t\t\t\n")
        with self.assertRaises(ValueError) as e:
            osm.load_manual(path, {"w5"})
        msg = str(e.exception)
        self.assertIn("不存在", msg)
        self.assertIn("要填名稱", msg)
        self.assertIn("依據與確認者", msg)

    def test_missing_file_is_empty(self):
        self.assertEqual(osm.load_manual(Path(tempfile.mkdtemp()) / "none.tsv", set()), {})


class InstitutionTest(unittest.TestCase):
    SCHOOL = [{"osm": "w123", "kind": "學校", "name": "某國小"}]

    def test_inside_is_excluded_before_any_name(self):
        # 在學校範圍內：在有名稱的公園裡、自己有名稱、有人工命名都一樣排除
        pgs = [pg("w1", park=(1, "某公園")), pg("w2", name="校園遊戲場"), pg("w3"), pg("w4", park=(1, "某公園"))]
        kept, inside = osm.split_institutions(pgs, {"w1": self.SCHOOL, "w2": self.SCHOOL, "w3": self.SCHOOL})
        self.assertEqual([p["ref"] for p in kept], ["w4"])
        self.assertEqual([(p["ref"], at) for p, at in inside],
                         [("w1", self.SCHOOL), ("w2", self.SCHOOL), ("w3", self.SCHOOL)])
        groups, unnamed, excluded = osm.group_playgrounds(kept, {"w3": "某遊戲場"})
        self.assertEqual([g["name"] for g in groups], ["某公園"])
        self.assertEqual(osm.institution_label(self.SCHOOL), "學校：某國小")
        self.assertEqual(osm.institution_label([{"osm": "w9", "kind": "軍營", "name": ""}]), "軍營：（沒有名稱）")

    def test_empty_list_is_not_inside(self):
        kept, inside = osm.split_institutions([pg("w1")], {"w1": []})
        self.assertEqual(([p["ref"] for p in kept], inside), (["w1"], []))

    def write(self, osm_text, sha=None):
        d = Path(tempfile.mkdtemp())
        (d / "osm.json").write_text(osm_text, encoding="utf-8")
        sha = sha or hashlib.sha256(osm_text.encode("utf-8")).hexdigest()
        (d / "osm-institutions.json").write_text(
            json.dumps({"osm_json_sha256": sha, "inside": {"w1": self.SCHOOL}}), encoding="utf-8")
        return d / "osm-institutions.json", d / "osm.json"

    def test_load(self):
        self.assertEqual(osm.load_institutions(*self.write("{}")), {"w1": self.SCHOOL})

    def test_load_stops_when_osm_json_changed(self):
        with self.assertRaises(ValueError) as e:
            osm.load_institutions(*self.write("{}", sha="0" * 64))
        self.assertIn("對不上", str(e.exception))

    def test_load_stops_when_missing(self):
        with self.assertRaises(ValueError):
            osm.load_institutions(Path(tempfile.mkdtemp()) / "none.json", Path("osm.json"))


if __name__ == "__main__":
    unittest.main()
