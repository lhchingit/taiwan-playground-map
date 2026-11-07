"""政府開放資料更新檢查（check_opendata_update.py）。不連網路：下載與匯入腳本換成假的。"""
import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

import check_opendata_update as chk


def place(pid, name, slide="u", lat=25.0):
    return {"id": pid, "name": name, "district": "中正區", "lat": lat, "lng": 121.5,
            "attrs": {"slide": {"v": slide, "src": "s", "note": None, "at": "2026-10-13"}},
            "parking": {"type": "u", "fee": "u"}}


def raw(records, sha, fetched="2026-10-13"):
    return {"dataset": "https://data.gov.tw/dataset/136476", "fetched": fetched, "sha256": sha, "records": records}


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


OLD_RECS = [{"公園名稱": "甲公園", "鞦韆數量": "1", "no": 1}, {"公園名稱": "乙公園", "鞦韆數量": "0", "no": 2}]
OLD_PLACES = [place("tpe-1", "甲公園"), place("tpe-2", "乙公園")]


class Fixture:
    """暫存資料夾裡的最小 repo：臺北市的原始檔與 seed"""

    def __init__(self, root):
        self.root = Path(root)
        (self.root / "scripts").mkdir()
        write(self.root / "data/raw/tpe/pkl-arcade.json", raw(OLD_RECS, "aaa"))
        write(self.root / "data/seed/tpe/places.json", {"places": OLD_PLACES})


class FakeRun:
    """假的「執行腳本」：下載腳本寫入 new_raw，匯入腳本寫入 new_places；fail 裡的腳本丟錯"""

    def __init__(self, new_raw=None, new_places=None, fail=()):
        self.new_raw, self.new_places, self.fail = new_raw, new_places, fail
        self.calls = []

    def __call__(self, work, args):
        self.calls.append(args[0])
        if args[0] in self.fail:
            raise RuntimeError("urlopen error timed out")
        if args[0] == "scripts/fetch_tpe_parks.py":
            write(work / "data/raw/tpe/pkl-arcade.json", self.new_raw)
        elif args[0] == "scripts/import_pkl.py":
            write(work / "data/seed/tpe/places.json", {"places": self.new_places})


def run_main(root, fake, argv=("tpe",)):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = chk.main(list(argv), root=root, run=fake)
    return code, out.getvalue()


class DiffPlacesTest(unittest.TestCase):
    def test_same(self):
        d = chk.diff_places(OLD_PLACES, [dict(p) for p in OLD_PLACES])
        self.assertEqual(d, {"added": [], "removed": [], "changed": []})

    def test_added_removed_changed(self):
        new = [place("tpe-1", "甲公園", slide="y"), place("tpe-3", "丙公園")]
        d = chk.diff_places(OLD_PLACES, new)
        self.assertEqual([p["id"] for p in d["added"]], ["tpe-3"])
        self.assertEqual([p["id"] for p in d["removed"]], ["tpe-2"])
        self.assertEqual([(o["id"], f) for o, n, f in d["changed"]], [("tpe-1", ["屬性"])])

    def test_verified_date_is_not_a_change(self):
        new = [dict(p) for p in OLD_PLACES]
        new[0] = {**new[0], "attrs": {"slide": {"v": "u", "src": "s", "note": None, "at": "2026-11-07"}}}
        self.assertEqual(chk.diff_places(OLD_PLACES, new)["changed"], [])

    def test_address_change(self):
        # 新北市等縣市的官方清單只補地址與面積，清單更新時要看得出來
        new = [{**OLD_PLACES[0], "address": "中山路 1 號"}, OLD_PLACES[1]]
        self.assertEqual(chk.diff_places(OLD_PLACES, new)["changed"][0][2], ["地址"])

    def test_coords_change(self):
        new = [place("tpe-1", "甲公園", lat=25.1), OLD_PLACES[1]]
        self.assertEqual(chk.diff_places(OLD_PLACES, new)["changed"][0][2], ["座標"])


class HashesTest(unittest.TestCase):
    def test_single_file(self):
        self.assertEqual(chk.hashes({"sha256": "x"}), {"": "x"})

    def test_tycg_files(self):
        data = {"files": {"特色遊戲場": {"url": "u1", "sha256": "a"}, "埤塘公園": {"url": "u2", "sha256": "b"}}}
        self.assertEqual(chk.hashes(data), {"特色遊戲場": "a", "埤塘公園": "b"})


class CheckTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        Fixture(self.root)

    def tearDown(self):
        self.tmp.cleanup()

    def test_no_change(self):
        fake = FakeRun(new_raw=raw(OLD_RECS, "aaa", fetched="2026-11-07"))
        code, out = run_main(self.root, fake)
        self.assertEqual(code, 0)
        self.assertIn("沒有變動", out)
        self.assertNotIn("scripts/import_pkl.py", fake.calls)  # 雜湊相同就不重新匯入

    def test_changed(self):
        recs = [{"公園名稱": "甲公園", "鞦韆數量": "2", "no": 1}, {"公園名稱": "丙公園", "鞦韆數量": "1", "no": 3}]
        fake = FakeRun(new_raw=raw(recs, "bbb"), new_places=[place("tpe-1", "甲公園", slide="y"),
                                                             place("tpe-3", "丙公園")])
        code, out = run_main(self.root, fake)
        self.assertEqual(code, 1)
        self.assertIn("**有變動**", out)
        self.assertIn("筆數 2 → 2", out)
        self.assertIn("新增 1 筆", out)
        self.assertIn("鞦韆數量 `1` → `2`", out)
        self.assertIn("場地數 2 → 2", out)
        self.assertIn("tpe-3 丙公園", out)
        self.assertIn("tpe-2 乙公園", out)
        # repo 本身沒有被改到
        self.assertEqual(json.loads((self.root / "data/raw/tpe/pkl-arcade.json").read_text(encoding="utf-8"))
                         ["sha256"], "aaa")

    def test_download_failure_other_cities_still_run(self):
        write(self.root / "data/raw/nan/ntc-parks.json", raw([{"公園名稱": "甲公園"}], "nnn"))
        fake = FakeRun(fail=("scripts/fetch_tpe_parks.py",))
        orig = fake.__call__

        def run(work, args):
            if args[0] == "scripts/fetch_ntc_parks.py":
                fake.calls.append(args[0])
                write(work / "data/raw/nan/ntc-parks.json", raw([{"公園名稱": "甲公園"}], "nnn"))
                return
            orig(work, args)

        code, out = run_main(self.root, run, argv=("tpe", "nan"))
        self.assertEqual(code, 2)
        self.assertIn("下載失敗", out)
        self.assertIn("urlopen error timed out", out)
        self.assertIn("scripts/fetch_ntc_parks.py", fake.calls)

    def test_report_file(self):
        fake = FakeRun(new_raw=raw(OLD_RECS, "aaa"))
        report = self.root / "r.md"
        run_main(self.root, fake, argv=("tpe", "--report", str(report)))
        self.assertIn("# 政府開放資料更新檢查", report.read_text(encoding="utf-8"))

    def test_unknown_city(self):
        with self.assertRaises(SystemExit), contextlib.redirect_stderr(io.StringIO()):
            chk.main(["xxx"], root=self.root, run=FakeRun())


if __name__ == "__main__":
    unittest.main()
