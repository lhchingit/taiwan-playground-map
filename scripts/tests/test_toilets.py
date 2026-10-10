"""公廁資料（sources/hccg_toilets.py、lib/pipeline.apply_toilets）"""
import tempfile
import unittest
from pathlib import Path

from lib.pipeline import apply_toilets
from lib.review import ReviewCollector
from sources import hccg_toilets
from sources.hccg_toilets import load_aliases, normalize


def attr(v, src=None, note=None):
    return {"v": v, "src": src, "note": note, "at": "2026-10-01" if src else None}


def place(pid, name, toilet=None, nursing=None):
    return {"id": pid, "name": name,
            "attrs": {"toilet": toilet or attr("u"), "nursing": nursing or attr("u")}}


def toilet(name, nursing=0):
    return {"name": name, "key": normalize(name), "nursing": nursing}


class NormalizeTest(unittest.TestCase):
    def test_forms(self):
        self.assertEqual(normalize("青青草原公廁(6)"), "青青草原")
        self.assertEqual(normalize("十八尖山公廁-1(博愛街入口)"), "十八尖山")
        self.assertEqual(normalize("南寮運動公園(足球場)"), "南寮運動公園")
        self.assertEqual(normalize("港南運河公園"), "港南運河公園")
        self.assertEqual(normalize("西雅公廁"), "西雅")


class ApplyTest(unittest.TestCase):
    def run_apply(self, places, toilets, aliases=None):
        review = ReviewCollector()
        apply_toilets(places, toilets, aliases or {}, hccg_toilets, "2026-10-10", review)
        return review

    def test_exact_name_sets_toilet_and_nursing_only_when_tables(self):
        a, b = place("a", "青青草原"), place("b", "三民公園")
        self.run_apply([a, b], [toilet("青青草原公廁(1)"), toilet("青青草原公廁(6)", 2), toilet("三民公園公廁")])
        self.assertEqual(a["attrs"]["toilet"]["v"], "y")
        self.assertEqual(a["attrs"]["toilet"]["src"], "hccg_toilets")
        self.assertEqual(a["attrs"]["nursing"]["note"], "公廁育嬰台 2 座（青青草原公廁(6)）")
        self.assertEqual(b["attrs"]["toilet"]["v"], "y")
        self.assertEqual(b["attrs"]["nursing"]["v"], "u")  # 育嬰台 0：維持未知，不寫「無」

    def test_no_fuzzy_match_but_hint_in_review(self):
        p = place("a", "西雅公園")
        review = self.run_apply([p], [toilet("西雅公廁")])
        self.assertEqual(p["attrs"]["toilet"]["v"], "u")
        self.assertEqual(review.rows["toilets-unmatched"], [["西雅公廁", "西雅", "西雅公園"]])

    def test_alias_maps_unmatched_name(self):
        p = place("hsc-hsinchu-park", "新竹公園")
        self.run_apply([p], [toilet("動物園旁公廁")], {"動物園旁公廁": "hsc-hsinchu-park"})
        self.assertEqual(p["attrs"]["toilet"]["v"], "y")

    def test_existing_no_becomes_conflict(self):
        p = place("a", "三民公園", toilet=attr("n", "lead", "評論說沒有"))
        review = self.run_apply([p], [toilet("三民公園公廁")])
        self.assertEqual(p["attrs"]["toilet"]["v"], "n")
        self.assertEqual(len(review.rows["conflicts"]), 1)

    def test_lead_is_replaced_but_article_yes_is_kept(self):
        lead = place("a", "三民公園", toilet=attr("y", "lead", "網友說有"))
        article = place("b", "湳雅公園", toilet=attr("y", "yam", "文章說有"))
        self.run_apply([lead, article], [toilet("三民公園公廁"), toilet("湳雅公園公廁")])
        self.assertEqual(lead["attrs"]["toilet"]["src"], "hccg_toilets")
        self.assertEqual(article["attrs"]["toilet"]["src"], "yam")


class AliasFileTest(unittest.TestCase):
    def write(self, rows):
        d = tempfile.mkdtemp()
        p = Path(d) / hccg_toilets.ALIASES
        p.parent.mkdir(parents=True)
        p.write_text("\t".join(hccg_toilets.ALIAS_COLUMNS) + "\n"
                     + "".join("\t".join(r) + "\n" for r in rows), encoding="utf-8")
        return d

    def test_valid(self):
        root = self.write([["動物園旁公廁", "hsc-hsinchu-park", "實地確認", "測試者", "2026-10-11"]])
        self.assertEqual(load_aliases(root, {"動物園旁公廁"}, {"hsc-hsinchu-park"}),
                         {"動物園旁公廁": "hsc-hsinchu-park"})

    def test_unknown_place_or_toilet_or_missing_basis_stops_import(self):
        for row in (["動物園旁公廁", "hsc-nope", "實地確認", "測試者", "2026-10-11"],
                    ["不存在公廁", "hsc-hsinchu-park", "實地確認", "測試者", "2026-10-11"],
                    ["動物園旁公廁", "hsc-hsinchu-park", "", "測試者", "2026-10-11"]):
            with self.assertRaises(ValueError):
                load_aliases(self.write([row]), {"動物園旁公廁"}, {"hsc-hsinchu-park"})

    def test_missing_file_is_empty(self):
        self.assertEqual(load_aliases(tempfile.mkdtemp(), set(), set()), {})


if __name__ == "__main__":
    unittest.main()
