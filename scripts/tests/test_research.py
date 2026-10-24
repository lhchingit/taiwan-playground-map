"""人工查證（sources/research.py）：遊具與設施、OSM 只畫了公園的遊戲場、別名；格式有錯時中止"""
import copy
import unittest

from sources import research


def place(pid="hsq-osm-w1", lat=24.80, lng=121.00):
    return {"id": pid, "name": f"場地{pid}", "lat": lat, "lng": lng, "summary": "OpenStreetMap 標示的遊戲場。遊具與設施還沒有資料，歡迎回報。",
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

    def test_entry_date_overrides_verified_at(self):
        # 之後補查的項目寫自己的查證日期，先前查的項目仍用 verified_at
        d = data()
        d["places"]["hsq-osm-w1"]["slide"] = ["y", "news-1", "有溜滑梯", "2026-10-23"]
        places = [place()]
        research.apply(d, places, ["slide", "toilet"])
        self.assertEqual(places[0]["attrs"]["slide"]["at"], "2026-10-23")
        self.assertEqual(places[0]["attrs"]["toilet"]["at"], "2026-10-18")

    def test_summary_with_address_note(self):
        # 官方公園清單補地址後，「地址來自…」接在「還沒有資料」後面，也要換成查證的說明
        p = place()
        p["summary"] += "地址來自測試清單。"
        research.apply(data(), [p], ["slide", "toilet"])
        self.assertEqual(p["summary"],
                         "OpenStreetMap 標示的遊戲場。部分遊具資料來自網路文章或新聞，現場可能已經不同，歡迎回報。地址來自測試清單。")

    def test_official_summary_gets_note(self):
        # 官方清冊的場地（桃園）說明沒有「還沒有資料」，補了查證資料就在最後加上說明
        p = place("tyc-tycg-001")
        p["summary"] = "桃園市公園資料（特色遊戲場）列出的設施：溜滑梯"
        d = data(places={"tyc-tycg-001": {"toilet": ["y", "news-1", "有廁所"]}})
        research.apply(d, [p], ["slide", "toilet"])
        self.assertEqual(p["summary"], "桃園市公園資料（特色遊戲場）列出的設施：溜滑梯。"
                                       "部分遊具資料來自網路文章或新聞，現場可能已經不同，歡迎回報。")


class ValidateTest(unittest.TestCase):
    def assert_error(self, d, message):
        with self.assertRaises(research.ResearchError) as e:
            research.apply(d, [place()], ["slide", "toilet"])
        self.assertIn(message, str(e.exception))

    def with_entry(self, key, entry):
        d = data()
        d["places"] = {"hsq-osm-w1": {key: entry}}
        return d

    def test_does_not_override_existing_value(self):
        # 官方資料已經有值的項目不覆蓋（桃園市府開放資料）
        p = place()
        p["attrs"]["slide"] = {"v": "y", "src": "tycg", "note": "溜滑梯", "at": "2026-10-11"}
        with self.assertRaises(research.ResearchError) as e:
            research.apply(data(), [p], ["slide", "toilet"])
        self.assertIn("hsq-osm-w1 slide：已經有資料（來源 tycg），不覆蓋", str(e.exception))

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

    def test_bad_entry_date(self):
        self.assert_error(self.with_entry("slide", ["y", "news-1", "有", "2026/10/23"]), "查證日期要是 YYYY-MM-DD")
        self.assert_error(self.with_entry("slide", ["y", "news-1", "有", "2026-10-23", "x"]), "格式要是")

    def test_bad_source_kind_and_date(self):
        d = data(verified_at="2026/10/18")
        d["sources"] = copy.deepcopy(d["sources"])
        d["sources"]["news-1"]["kind"] = "lead"
        self.assert_error(d, "verified_at 要是 YYYY-MM-DD")
        self.assert_error(d, "kind 只能是")


def osm_parks(**parks):
    base = {"w9": {"name": "兒9公園", "leisure": "park", "lat": 24.81, "lng": 121.01,
                   "districts": [{"level": 8, "name": "竹北市"}]}}
    base.update(parks)
    return {"parks": base}


def with_parks(parks=None, **over):
    d = data(**over)
    d["parks"] = parks or {"w9": ["news-1", "縣府啟用的特色遊戲場「測試」"]}
    return d


class ParksTest(unittest.TestCase):
    def test_creates_place_from_osm_park(self):
        places = [place()]
        d = with_parks()
        d["places"]["hsq-osm-w9"] = {"slide": ["y", "news-1", "有溜滑梯"]}
        sources = research.apply(d, places, ["slide", "toilet"], "hsq", osm_parks())
        new = places[-1]
        self.assertEqual((new["id"], new["name"], new["district"], new["lat"], new["lng"]),
                         ("hsq-osm-w9", "兒9公園", "竹北市", 24.81, 121.01))
        self.assertEqual(new["source_coords"], "OpenStreetMap w9（leisure=park 範圍中心）")
        self.assertEqual((new["listing_src"], new["listing_at"]), ("news-1", "2026-10-18"))
        self.assertEqual(new["summary"], "OpenStreetMap 標示的公園，新聞或網路文章寫明裡面有兒童遊戲場："
                         "縣府啟用的特色遊戲場「測試」。部分遊具資料來自網路文章或新聞，現場可能已經不同，歡迎回報。")
        self.assertEqual(new["attrs"]["slide"]["v"], "y")
        self.assertEqual(new["attrs"]["toilet"]["v"], "u")
        self.assertIn("news-1", sources)

    def test_park_with_own_date(self):
        places = [place()]
        research.apply(with_parks({"w9": ["news-1", "特色遊戲場", "2026-10-23"]}), places, ["slide", "toilet"], "hsq",
                       osm_parks())
        self.assertEqual((places[-1]["listing_src"], places[-1]["listing_at"]), ("news-1", "2026-10-23"))

    def test_without_attrs_keeps_unknown_tail(self):
        places = [place()]
        research.apply(with_parks(), places, ["slide", "toilet"], "hsq", osm_parks())
        self.assertTrue(places[-1]["summary"].endswith("遊具與設施還沒有資料，歡迎回報。"))

    def assert_error(self, d, parks, message, places=None):
        with self.assertRaises(research.ResearchError) as e:
            research.apply(d, places or [place()], ["slide", "toilet"], "hsq", parks)
        self.assertIn(message, str(e.exception))

    def test_errors(self):
        self.assert_error(with_parks(), {"parks": {}}, "osm-parks.json 跟 research.json 的 parks 對不上")
        self.assert_error(with_parks(), None, "對不上")
        self.assert_error(with_parks(), osm_parks(), "已經是場地", places=[place("hsq-osm-w9", 25.5, 121.5)])
        self.assert_error(with_parks(), osm_parks(), "可能是同一處", places=[place(lat=24.8104, lng=121.0101)])
        self.assert_error(with_parks(), osm_parks(w9={"name": " ", "lat": 24.81, "lng": 121.01}), "沒有名稱")
        self.assert_error(with_parks({"w9": ["blog-9", "有"]}), osm_parks(), "parks w9：來源 blog-9 沒有定義")
        self.assert_error(with_parks({"w9": ["news-1", ""]}), osm_parks(), "parks w9：要有說明")
        self.assert_error(with_parks({"w9": ["news-1", "有", "昨天"]}), osm_parks(), "parks w9：查證日期要是 YYYY-MM-DD")


class AkaTest(unittest.TestCase):
    def test_aka_goes_into_summary(self):
        places = [place()]
        d = data(places={}, aka={"hsq-osm-w1": ["news-1", "文章稱這裡為蘑菇城堡公園"]})
        sources = research.apply(d, places, ["slide"])
        self.assertEqual(places[0]["summary"],
                         "OpenStreetMap 標示的遊戲場。文章稱這裡為蘑菇城堡公園。遊具與設施還沒有資料，歡迎回報。")
        self.assertEqual(list(sources), ["news-1"])

    def test_aka_unknown_place(self):
        with self.assertRaises(research.ResearchError) as e:
            research.apply(data(aka={"hsq-osm-w7": ["news-1", "別名"]}), [place()], ["slide", "toilet"])
        self.assertIn("aka hsq-osm-w7：沒有這個場地", str(e.exception))


if __name__ == "__main__":
    unittest.main()
