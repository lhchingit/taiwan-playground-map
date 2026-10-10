"""人工處理結果與公園面積套用到匯入流程（sources/hccg.py、lib/pipeline.py）"""
import shutil
import tempfile
import unittest
from pathlib import Path

from lib.pipeline import apply_areas
from lib.review import ReviewCollector
from sources import hccg

ROOT = Path(__file__).resolve().parents[2]


def records_with(manual_tsv):
    """用 repo 的清冊與 OSM 比對，加上指定的人工處理結果，產生 SourceRecord"""
    with tempfile.TemporaryDirectory() as d:
        raw = Path(d) / "data/raw/hsc"
        raw.mkdir(parents=True)
        for f in ["hccg-playgrounds.tsv", "osm-matches.tsv"]:
            shutil.copy(ROOT / "data/raw/hsc" / f, raw / f)
        if manual_tsv:
            shutil.copy(manual_tsv, raw / "manual-review.tsv")
        review = ReviewCollector()
        recs = {r["ext_no"]: r for r in hccg.records(Path(d), review)}
        return recs, review


class ManualReviewTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.before, cls.review_before = records_with(None)
        cls.after, cls.review_after = records_with(ROOT / "tests/fixtures/manual-review-sample.tsv")

    def test_located_uses_manual_coords_and_label(self):
        self.assertIsNone(self.before["9"]["coord"])  # 原本找不到座標
        self.assertEqual(self.after["9"]["coord"], (24.8301, 120.9702))
        self.assertEqual(self.after["9"]["coord_label"], "人工定位（OSM 地圖上可見的公園範圍，測試者，2026-10-11）")

    def test_pending_and_duplicate_stay_off_map_with_status(self):
        for no in ("15", "32"):
            self.assertIsNone(self.after[no]["coord"])
        self.assertTrue(self.after["15"]["review_status"].startswith("待實地確認"))
        self.assertTrue(self.after["32"]["review_status"].startswith("重複（同 #15）"))

    def test_untouched_records_are_unchanged(self):
        for no, rec in self.before.items():
            if no not in ("9", "15", "32"):
                self.assertEqual(rec, self.after[no])

    def test_no_manual_file_means_empty_status(self):
        self.assertTrue(all(r["review_status"] == "" for r in self.before.values()))


class DuplicateMergeTest(unittest.TestCase):
    """範例檔：#32 吉羊公園標成重複，同 #15"""

    @classmethod
    def setUpClass(cls):
        cls.recs, _ = records_with(ROOT / "tests/fixtures/manual-review-sample.tsv")

    def test_attrs_are_merged_into_target(self):
        t = self.recs["15"]
        self.assertIn("slide", t["attrs"])          # #15：組合遊具組溜滑梯1組
        self.assertIn("spring_rider", t["attrs"])   # #32：搖搖馬2組
        self.assertEqual(t["items"], ["組合遊具組溜滑梯1組", "組合遊具組1組", "搖搖馬2組"])

    def test_raw_text_and_refs_are_kept(self):
        t = self.recs["15"]
        self.assertTrue(t["summary"].endswith("；組合遊具組1組、搖搖馬2組（清冊編號 32）"))
        self.assertEqual([r["hccg_no"] for r in [t["official_ref"], *t["merged_refs"]]], [15, 32])

    def test_estimate_uses_merged_items(self):
        self.assertEqual((self.recs["15"]["stay"], self.recs["15"]["size"]), ("30_60", "M"))

    def test_duplicate_itself_stays_off_map(self):
        self.assertIsNone(self.recs["32"]["coord"])
        self.assertTrue(self.recs["32"]["review_status"].startswith("重複（同 #15）"))


class DuplicateErrorTest(unittest.TestCase):
    HEAD = "\t".join(["清冊編號", "狀態", "緯度", "經度", "定位依據", "對應編號", "說明", "定位者", "日期"]) + "\n"

    def run_with(self, rows):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "m.tsv"
            body = "".join("\t".join([no, "duplicate", "", "", "", ref, "", "測試者", "2026-10-11"]) + "\n"
                           for no, ref in rows)
            f.write_text(self.HEAD + body, encoding="utf-8")
            records_with(f)

    def test_self_reference(self):
        with self.assertRaisesRegex(ValueError, "自己"):
            self.run_with([("32", "32")])

    def test_missing_target(self):
        with self.assertRaisesRegex(ValueError, "不存在"):
            self.run_with([("32", "9999")])

    def test_chain_or_cycle(self):
        with self.assertRaisesRegex(ValueError, "也標成重複"):
            self.run_with([("15", "32"), ("32", "15")])


class AreaTest(unittest.TestCase):
    def test_exact_name_then_official_name_else_review(self):
        parks = {"甲公園": {"area": 1.5}, "乙公園": {"area": 0.2}, "丙公園": {"area": 0.3}}
        places = [
            {"id": "a", "name": "甲公園"},
            {"id": "b", "name": "顯示名稱", "official_ref": [{"name": "乙公園"}]},
            {"id": "c", "name": "兩個名稱", "official_ref": [{"name": "乙公園"}, {"name": "丙公園"}]},
            {"id": "d", "name": "甲公園附近"},  # 不做模糊比對
        ]
        review = ReviewCollector()
        apply_areas(places, parks, review)
        self.assertEqual([p["area_ha"] for p in places], [1.5, 0.2, None, None])
        self.assertEqual([r[2] for r in review.rows["parks-unmatched"]], ["對到多個不同面積", "公園資料沒有這個名稱"])


if __name__ == "__main__":
    unittest.main()
