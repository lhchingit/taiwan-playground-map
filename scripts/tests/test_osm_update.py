"""OSM 更新檢查（check_osm_update.py）。不連網路：下載與匯入腳本換成假的。"""
import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

import check_osm_update as chk


def pg(ref, name=None, lat=24.5, parks=()):
    return {"ref": ref, "lat": lat, "lng": 118.3, "tags": {"leisure": "playground", **({"name": name} if name else {})},
            "parks": list(parks), "districts": [{"level": 7, "name": "金城鎮"}]}


def place(pid, name):
    return {"id": pid, "name": name, "district": "金城鎮", "lat": 24.5, "lng": 118.3,
            "attrs": {"slide": {"v": "u", "src": "s", "note": None, "at": "2026-10-13"}},
            "parking": {"type": "u", "fee": "u"}}


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


OLD_PG = [pg("n1", "甲公園"), pg("w2", "乙公園")]
OLD_PLACES = [place("kin-osm-n1", "甲公園"), place("kin-osm-w2", "乙公園")]
PARKS = {"w9": {"name": "丙公園", "leisure": "park", "lat": 25.0, "lng": 121.5, "districts": []}}


def osm(playgrounds, base="2026-10-13T00:00:00Z"):
    return {"fetched": "2026-10-13", "osm_base": base, "sha256": base, "playgrounds": playgrounds}


def inst(inside):
    return {"fetched": "2026-10-13", "osm_json_sha256": "x", "inside": inside}


class Fixture:
    """暫存資料夾裡的最小 repo：金門縣（osm.json）與臺北市（只有 osm-parks.json）"""

    def __init__(self, root):
        self.root = Path(root)
        (self.root / "scripts").mkdir()
        write(self.root / "data/raw/kin/osm.json", osm(OLD_PG))
        write(self.root / "data/raw/kin/osm-institutions.json", inst({}))
        write(self.root / "data/seed/kin/places.json", {"places": OLD_PLACES})
        write(self.root / "data/raw/tpe/osm-parks.json", {"fetched": "2026-10-13", "parks": PARKS})
        write(self.root / "data/seed/tpe/places.json", {"places": [place("tpe-1", "丙公園")]})


class FakeRun:
    """假的「執行腳本」：下載腳本寫入 new_*，匯入腳本寫入 places；fail 裡的腳本丟錯"""

    def __init__(self, playgrounds=OLD_PG, inside=None, parks=PARKS, places=None, fail=()):
        self.playgrounds, self.inside, self.parks, self.fail = playgrounds, inside or {}, parks, fail
        self.places = places or {"kin": OLD_PLACES, "tpe": [place("tpe-1", "丙公園")]}
        self.calls = []

    def __call__(self, work, args):
        self.calls.append(args)
        if args[0] in self.fail:
            raise RuntimeError("OSM 找不到：['w9']")
        city = args[1] if len(args) > 1 else "tpe"
        raw = work / "data/raw" / city
        if args[0] == "scripts/fetch_osm_city.py":
            write(raw / "osm.json", osm(self.playgrounds, base="2026-11-27T00:00:00Z"))
        elif args[0] == "scripts/fetch_osm_institutions.py":
            write(raw / "osm-institutions.json", inst(self.inside))
        elif args[0] == "scripts/fetch_osm_parks.py":
            write(raw / "osm-parks.json", {"fetched": "2026-11-27", "parks": self.parks})
        else:  # 匯入
            write(work / "data/seed" / city / "places.json", {"places": self.places[city]})


def run_main(root, fake, argv=("kin",)):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = chk.main(list(argv), root=root, run=fake)
    return code, out.getvalue()


class DiffOsmTest(unittest.TestCase):
    def test_same(self):
        self.assertFalse(chk.any_change(chk.diff_osm(OLD_PG, [dict(p) for p in OLD_PG])))

    def test_added_removed_changed(self):
        new = [pg("n1", "甲親子公園", lat=24.6), pg("n3")]
        d = chk.diff_osm(OLD_PG, new)
        self.assertEqual((d["added"], d["removed"]), (["n3"], ["w2"]))
        self.assertEqual(d["changed"], [("n1", ["名稱", "位置"])])

    def test_park_and_tags(self):
        new = [pg("n1", "甲公園", parks=[{"area": 1, "name": "丁公園"}]), {**OLD_PG[1], "tags": {"name": "乙公園"}}]
        self.assertEqual(chk.diff_osm(OLD_PG, new)["changed"], [("n1", ["所在公園"]), ("w2", ["其他標籤"])])


class CheckTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        Fixture(self.root)

    def tearDown(self):
        self.tmp.cleanup()

    def test_cities(self):
        self.assertNotIn("hsc", chk.CITIES)
        self.assertEqual(len(chk.CITIES), 21)

    def test_no_change(self):
        fake = FakeRun()
        code, out = run_main(self.root, fake)
        self.assertEqual(code, 0)
        self.assertIn("金門縣（kin）：沒有變動", out)
        self.assertIn("OSM 資料時間 2026-10-13T00:00:00Z → 2026-11-27T00:00:00Z", out)
        self.assertEqual([c[0] for c in fake.calls], ["scripts/fetch_osm_city.py", "scripts/fetch_osm_institutions.py",
                                                      "scripts/import_osm_city.py"])

    def test_changed(self):
        fake = FakeRun(playgrounds=[pg("n1", "甲親子公園"), pg("w2", "乙公園"), pg("n3")],
                       inside={"w2": [{"kind": "school", "name": "某國小"}]},
                       places={"kin": [{**OLD_PLACES[0], "name": "甲親子公園"}, place("kin-osm-n3", "丁公園")]})
        code, out = run_main(self.root, fake)
        self.assertEqual(code, 1)
        self.assertIn("**有變動**", out)
        self.assertIn("新增遊戲場 1 筆", out)
        self.assertIn("n1：名稱", out)
        self.assertIn("進入學校／機關範圍（匯入時排除） 1 筆", out)
        self.assertIn("場地數 2 → 2", out)
        self.assertIn("kin-osm-n3 丁公園", out)
        self.assertIn("kin-osm-w2 乙公園", out)
        self.assertIn("kin-osm-n1 甲公園：名稱", out)
        # repo 本身沒有被改到
        self.assertEqual(json.loads((self.root / "data/raw/kin/osm.json").read_text(encoding="utf-8"))["osm_base"],
                         "2026-10-13T00:00:00Z")

    def test_taipei_parks_only(self):
        moved = {"w9": {**PARKS["w9"], "lat": 25.1}}
        fake = FakeRun(parks=moved)
        code, out = run_main(self.root, fake, argv=("tpe",))
        self.assertEqual(code, 1)
        self.assertEqual([c[0] for c in fake.calls], ["scripts/fetch_osm_parks.py", "scripts/import_pkl.py"])
        self.assertIn("w9：位置", out)

    def test_failure_other_cities_still_run(self):
        fake = FakeRun(fail=("scripts/fetch_osm_parks.py",))
        code, out = run_main(self.root, fake, argv=("tpe", "kin"))
        self.assertEqual(code, 2)
        self.assertIn("臺北市（tpe）：失敗", out)
        self.assertIn("下載 osm-parks.json：OSM 找不到", out)
        self.assertIn("金門縣（kin）：沒有變動", out)

    def test_import_failure(self):
        fake = FakeRun(fail=("scripts/import_osm_city.py",))
        code, out = run_main(self.root, fake)
        self.assertEqual(code, 2)
        self.assertIn("重新匯入：", out)

    def test_report_file(self):
        report = self.root / "r.md"
        run_main(self.root, FakeRun(), argv=("kin", "--report", str(report)))
        self.assertIn("# OSM 更新檢查", report.read_text(encoding="utf-8"))

    def test_unknown_city(self):
        with self.assertRaises(SystemExit), contextlib.redirect_stderr(io.StringIO()):
            chk.main(["hsc"], root=self.root, run=FakeRun())


if __name__ == "__main__":
    unittest.main()
