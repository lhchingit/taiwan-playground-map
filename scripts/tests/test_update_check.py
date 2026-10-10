"""政府資料更新檢查（check_hccg_update.py）與清冊下載格式（fetch_hccg_playgrounds.render_tsv）。不連網路。"""
import contextlib
import hashlib
import io
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path

import check_hccg_update as chk
from fetch_hccg_playgrounds import render_tsv
from sources.hccg_datasets import DATASETS

PG = DATASETS["playgrounds"]
PARKS = DATASETS["parks"]
TOILETS = DATASETS["toilets"]


def pg(no, name, items, district="北區"):
    return {"編號": no, "公園": name, "行政區": district, "設施內容": items}


def enc(records):
    return json.dumps(records, ensure_ascii=False).encode("utf-8")


class FakeNet:
    def __init__(self, data, urls=None, fail=False):
        self.data, self.urls, self.fail = data, urls or {}, fail

    def meta(self, dataset_id):
        if self.fail:
            raise urllib.error.URLError("network down")
        ds = next(d for d in DATASETS.values() if d["id"] == dataset_id)
        return {"modified": "2026-04-16 12:01:51", "json_url": self.urls.get(dataset_id, ds["url"])}

    def get(self, url):
        return self.data[url]


class Fixture:
    """暫存資料夾裡的最小 repo：三份原始資料＋用編號對應的檔案"""

    PLAYGROUNDS = [pg("1", "甲公園", "溜滑梯1座、搖搖馬2座"), pg("2", "乙公園", "鞦韆1組"),
                   pg("3", "吉羊公園", "翹翹板1組"), pg("4", "吉羊公園", "沙坑1座")]
    PARK_RECS = [{"編號": "1", "公園名稱": "甲公園", "面積公頃": "1.2"}]
    TOILET_RECS = [{"編號": "1", "公廁名稱": "甲公園公廁", "育嬰台數量": "0"}]

    def __init__(self, root):
        self.root = Path(root)
        raw = self.root / "data/raw/hsc"
        raw.mkdir(parents=True)
        (self.root / PG["path"]).write_text(render_tsv(self.PLAYGROUNDS, "2026-10-10"), encoding="utf-8")
        for ds, recs in [(PARKS, self.PARK_RECS), (TOILETS, self.TOILET_RECS)]:
            (self.root / ds["path"]).write_text(json.dumps(
                {"fetched": "2026-10-10", "sha256": hashlib.sha256(enc(recs)).hexdigest(), "records": recs},
                ensure_ascii=False), encoding="utf-8")
        (raw / "manual-review.tsv").write_text(
            "清冊編號\t狀態\t緯度\t經度\t定位依據\t對應編號\t說明\t定位者\t日期\n"
            "2\tconfirmed\t\t\t\t\t\tX\t2026-10-10\n", encoding="utf-8")
        (raw / "osm-matches.tsv").write_text("# 說明\n1\t甲公園\texact\tw1\t24.8\t120.9\n", encoding="utf-8")
        (raw / "toilet-aliases.tsv").write_text(
            "公廁名稱\t場地 id\t依據\t確認者\t日期\n某公廁\thsc-hccg-002\t實地\tX\t2026-10-10\n", encoding="utf-8")

    def net(self, playgrounds=None, parks=None, toilets=None, **kw):
        return FakeNet({PG["url"]: enc(playgrounds if playgrounds is not None else self.PLAYGROUNDS),
                        PARKS["url"]: enc(parks if parks is not None else self.PARK_RECS),
                        TOILETS["url"]: enc(toilets if toilets is not None else self.TOILET_RECS)}, **kw)

    def run(self, net):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
            code = chk.main([], root=self.root, net=net, today="2026-10-10")
        return code, out.getvalue()


class UpdateCheckTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.fx = Fixture(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def results(self, net):
        return {r["name"]: r for r in chk.check(self.fx.root, net)}

    def test_no_changes(self):
        code, report = self.fx.run(self.fx.net())
        self.assertEqual(code, 0)
        self.assertEqual(report.count("沒有變動"), 3)
        self.assertNotIn("處理步驟", report)

    def test_added_and_removed(self):
        new = [r for r in Fixture.PLAYGROUNDS if r["編號"] != "2"] + [pg("5", "丙公園", "溜滑梯1座", "東區")]
        d = self.results(self.fx.net(playgrounds=new))["playgrounds"]["diff"]
        self.assertEqual([r["公園"] for r in d["added"]], ["丙公園"])
        removed, refs = d["removed"][0]
        self.assertEqual(removed["公園"], "乙公園")
        # #2 被 manual-review.tsv 引用，場地 id hsc-hccg-002 被 toilet-aliases.tsv 引用
        self.assertEqual(sorted(Path(f).name for f in refs), ["manual-review.tsv", "toilet-aliases.tsv"])
        code, report = self.fx.run(self.fx.net(playgrounds=new))
        self.assertEqual(code, 1)
        self.assertIn("#5 丙公園（東區）：溜滑梯1座", report)
        self.assertIn("要跟著處理", report)
        self.assertIn("python3 scripts/fetch_hccg_playgrounds.py", report)
        self.assertNotIn("fetch_hccg_parks", report)

    def test_facility_change_maps_attrs_with_import_rules(self):
        new = [pg("1", "甲公園", "溜滑梯1座、鞦韆2組、魔法飛毯1座")] + Fixture.PLAYGROUNDS[1:]
        c = self.results(self.fx.net(playgrounds=new))["playgrounds"]["diff"]["items"][0]
        self.assertEqual(c["gained"], ["swing"])
        self.assertEqual(c["lost"], ["spring_rider"])
        self.assertEqual(c["unmapped"], ["魔法飛毯1座"])
        _, report = self.fx.run(self.fx.net(playgrounds=new))
        self.assertIn("舊：溜滑梯1座、搖搖馬2座", report)
        self.assertIn("不可推測", report)

    def test_count_only_change_has_no_attr_change(self):
        new = [pg("1", "甲公園", "溜滑梯2座、搖搖馬1座")] + Fixture.PLAYGROUNDS[1:]
        c = self.results(self.fx.net(playgrounds=new))["playgrounds"]["diff"]["items"][0]
        self.assertEqual((c["gained"], c["lost"], c["unmapped"]), ([], [], []))

    def test_renumbering_warns_with_refs(self):
        new = [pg("9", "甲公園", "溜滑梯1座、搖搖馬2座")] + Fixture.PLAYGROUNDS[1:]
        d = self.results(self.fx.net(playgrounds=new))["playgrounds"]["diff"]
        o, n, refs = d["renumbered"][0]
        self.assertEqual((o["編號"], n["編號"]), ("1", "9"))
        self.assertEqual([Path(f).name for f in refs], ["osm-matches.tsv"])
        self.assertEqual((d["added"], d["removed"], d["items"]), ([], [], []))
        _, report = self.fx.run(self.fx.net(playgrounds=new))
        self.assertIn("甲公園：#1 → #9", report)

    def test_same_name_paired_by_number(self):
        # 兩筆吉羊公園順序對調、#4 的設施改了：要配對到同編號，不能誤判成兩筆都變更
        new = Fixture.PLAYGROUNDS[:2] + [pg("4", "吉羊公園", "沙坑2座"), pg("3", "吉羊公園", "翹翹板1組")]
        d = self.results(self.fx.net(playgrounds=new))["playgrounds"]["diff"]
        self.assertEqual([c["new"]["編號"] for c in d["items"]], ["4"])
        self.assertEqual(d["renumbered"], [])

    def test_district_change(self):
        new = [pg("1", "甲公園", "溜滑梯1座、搖搖馬2座", "東區")] + Fixture.PLAYGROUNDS[1:]
        _, report = self.fx.run(self.fx.net(playgrounds=new))
        self.assertIn("#1 甲公園：北區 → 東區", report)

    def test_json_dataset_changes(self):
        toilets = [{"編號": "1", "公廁名稱": "甲公園公廁", "育嬰台數量": "2"},
                   {"編號": "2", "公廁名稱": "新公廁", "育嬰台數量": "0"}]
        parks = []
        r = self.results(self.fx.net(parks=parks, toilets=toilets))
        self.assertEqual([x["公園名稱"] for x in r["parks"]["diff"]["removed"]], ["甲公園"])
        t = r["toilets"]["diff"]
        self.assertEqual([x["公廁名稱"] for x in t["added"]], ["新公廁"])
        self.assertEqual(t["changed"][0][2], [("育嬰台數量", "0", "2")])
        code, report = self.fx.run(self.fx.net(parks=parks, toilets=toilets))
        self.assertEqual(code, 1)
        self.assertIn("**育嬰台數量：0 → 2**", report)  # 會影響匯入的欄位特別標出

    def test_bytes_differ_but_same_records(self):
        net = self.fx.net()
        net.data[PARKS["url"]] = json.dumps(Fixture.PARK_RECS, ensure_ascii=False, indent=2).encode("utf-8")
        code, report = self.fx.run(net)
        self.assertEqual(code, 0)
        self.assertIn("不算變動", report)

    def test_download_url_changed(self):
        new_url = "https://odws.hccg.gov.tw/new.json"
        net = self.fx.net(urls={PG["id"]: new_url})
        net.data[new_url] = net.data[PG["url"]]
        code, report = self.fx.run(net)
        self.assertEqual(code, 1)
        self.assertIn("下載網址換了", report)
        self.assertIn("hccg_datasets.py", report)

    def test_network_failure_exits_2(self):
        code, _ = self.fx.run(self.fx.net(fail=True))
        self.assertEqual(code, 2)


class RenderTsvTest(unittest.TestCase):
    def test_exact_bytes(self):
        recs = [{"編號": "1", "公園": "甲公園", "行政區": "北區", "AreaCode": "10018020", "設施內容": "溜滑梯1座"},
                {"編號": "2", "公園": "乙公園", "行政區": "東區", "AreaCode": "10018010", "設施內容": "無"}]
        self.assertEqual(render_tsv(recs, "2026-10-10", url="https://example.test/x.json"), (
            "# 新竹市兒童遊戲場清冊（養護工程處）｜政府資料開放平台 https://data.gov.tw/dataset/132713\n"
            "# 原始檔：https://example.test/x.json\n"
            "# 授權：政府資料開放授權條款-第1版｜擷取日期：2026-10-10｜欄位：編號、公園、行政區、設施內容（原文照錄，未修正錯字）\n"
            "1\t甲公園\t北區\t溜滑梯1座\n"
            "2\t乙公園\t東區\t無\n"))

    def test_rejects_tabs_and_newlines(self):
        with self.assertRaises(ValueError):
            render_tsv([{"編號": "1", "公園": "甲", "行政區": "北區", "設施內容": "a\tb"}], "2026-10-10")


if __name__ == "__main__":
    unittest.main()
