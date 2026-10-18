"""人工查證的遊具與設施（sources/research.py）：套用結果，以及格式有錯時中止"""
import copy
import unittest

from sources import research


def place(pid="hsq-osm-w1"):
    return {"id": pid, "summary": "OpenStreetMap 標示的遊戲場。遊具與設施還沒有資料，歡迎回報。",
            "attrs": {k: {"v": "u", "src": None, "note": None, "at": None} for k in ["slide", "toilet"]}}


def data(**over):
    d = {"verified_at": "2026-10-18",
         "sources": {"news-1": {"label": "新聞：測試", "url": "https://example.test/1", "kind": "news"},
                     "unused": {"label": "網路文章：沒用到", "url": "https://example.test/2", "kind": "article"}},
         "places": {"hsq-osm-w1": {"slide": ["y", "news-1", "有溜滑梯"], "toilet": ["n", "news-1", "文章寫沒有廁所"]}}}
    d.update(over)
    return d


class ApplyTest(unittest.TestCase):
    def test_sets_attrs_sources_and_summary(self):
        places = [place(), place("hsq-osm-w2")]
        sources = research.apply(data(), places, ["slide", "toilet"])
        self.assertEqual(places[0]["attrs"]["slide"], {"v": "y", "src": "news-1", "note": "有溜滑梯", "at": "2026-10-18"})
        self.assertEqual(places[0]["attrs"]["toilet"]["v"], "n")
        self.assertEqual(places[0]["summary"],
                         "OpenStreetMap 標示的遊戲場。部分遊具資料來自網路文章或新聞，現場可能已經不同，歡迎回報。")
        self.assertEqual(list(sources), ["news-1"])  # 沒用到的來源不放進 seed
        self.assertEqual(places[1], place("hsq-osm-w2"))  # 沒有查證資料的場地不變


class ValidateTest(unittest.TestCase):
    def assert_error(self, d, message):
        with self.assertRaises(research.ResearchError) as e:
            research.apply(d, [place()], ["slide", "toilet"])
        self.assertIn(message, str(e.exception))

    def with_entry(self, key, entry):
        d = data()
        d["places"] = {"hsq-osm-w1": {key: entry}}
        return d

    def test_unknown_place(self):
        d = data()
        d["places"] = {"hsq-osm-w9": {"slide": ["y", "news-1", "有"]}}
        self.assert_error(d, "hsq-osm-w9：沒有這個場地")

    def test_unknown_attribute(self):
        self.assert_error(self.with_entry("rocket", ["y", "news-1", "有"]), "rocket：沒有這個屬性")

    def test_bad_value(self):
        self.assert_error(self.with_entry("slide", ["u", "news-1", "有"]), "值只能是 y 或 n")

    def test_undefined_source(self):
        self.assert_error(self.with_entry("slide", ["y", "blog-9", "有"]), "來源 blog-9 沒有定義")

    def test_blank_note(self):
        self.assert_error(self.with_entry("slide", ["y", "news-1", " "]), "要有說明")

    def test_bad_source_kind_and_date(self):
        d = data(verified_at="2026/10/18")
        d["sources"] = copy.deepcopy(d["sources"])
        d["sources"]["news-1"]["kind"] = "lead"
        self.assert_error(d, "verified_at 要是 YYYY-MM-DD")
        self.assert_error(d, "kind 只能是")


if __name__ == "__main__":
    unittest.main()
