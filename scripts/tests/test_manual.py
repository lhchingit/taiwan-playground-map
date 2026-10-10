"""lib/manual.py：人工處理結果的讀取與檢查。執行：python -m unittest discover -s scripts/tests -t scripts"""
import tempfile
import unittest
from pathlib import Path

from lib.manual import coord_label, read_manual, status_text, validate

ROOT = Path(__file__).resolve().parents[2]
SAMPLE = ROOT / "tests/fixtures/manual-review-sample.tsv"


def row(**kw):
    base = {"清冊編號": "9", "狀態": "located", "緯度": "24.83", "經度": "120.97",
            "定位依據": "實地確認", "對應編號": "", "說明": "", "定位者": "測試者", "日期": "2026-10-11"}
    base.update(kw)
    return base


class ValidateTest(unittest.TestCase):
    def test_sample_file_is_valid(self):
        rows = read_manual(SAMPLE)
        self.assertEqual(sorted(rows), ["15", "32", "9"])
        self.assertEqual(rows["9"]["定位依據"], "OSM 地圖上可見的公園範圍")

    def test_located_needs_coords_and_allowed_basis(self):
        self.assertEqual(validate(row()), [])
        self.assertTrue(validate(row(緯度="")))
        self.assertTrue(validate(row(定位依據="Google 地圖")))

    def test_coords_must_be_in_taiwan(self):
        self.assertTrue(validate(row(緯度="120.97", 經度="24.83")))  # 經緯度寫反

    def test_duplicate_needs_target(self):
        self.assertTrue(validate(row(狀態="duplicate", 緯度="", 經度="")))
        self.assertEqual(validate(row(狀態="duplicate", 緯度="", 經度="", 對應編號="15")), [])

    def test_unknown_status_and_missing_author(self):
        self.assertTrue(validate(row(狀態="maybe")))
        self.assertTrue(validate(row(定位者="")))

    def test_missing_file_is_empty(self):
        self.assertEqual(read_manual(ROOT / "no-such-file.tsv"), {})

    def test_invalid_file_stops_import(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "m.tsv"
            p.write_text("清冊編號\t狀態\t緯度\t經度\t定位依據\t對應編號\t說明\t定位者\t日期\n"
                         "9\tlocated\t\t\t實地確認\t\t\t測試者\t2026-10-11\n", encoding="utf-8")
            with self.assertRaises(ValueError):
                read_manual(p)


class TextTest(unittest.TestCase):
    def test_status_text(self):
        self.assertEqual(status_text(None), "")
        self.assertEqual(status_text(row(狀態="duplicate", 對應編號="15", 說明="同一處")),
                         "重複（同 #15）：同一處（測試者，2026-10-11）")

    def test_coord_label(self):
        self.assertEqual(coord_label(row()), "人工定位（實地確認，測試者，2026-10-11）")


if __name__ == "__main__":
    unittest.main()
