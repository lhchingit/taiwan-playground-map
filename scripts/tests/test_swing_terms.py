"""「圓盤鞦韆」就是鳥巢鞦韆（decisions D22）：對到 nest_swing，也照「鳥巢也算盪鞦韆」的規則對到 swing"""
import json
import unittest
from pathlib import Path

from lib.attrs import map_items
from sources import hccg, tycg

ROOT = Path(__file__).resolve().parents[2]


class DiscSwingTest(unittest.TestCase):
    def test_rules(self):
        for rules in (hccg.RULES, tycg.RULES):
            for text in ("圓盤鞦韆1座", "鳥巢盪鞦韆1座"):
                attrs, unmapped = map_items([text], rules)
                self.assertEqual(set(attrs), {"nest_swing", "swing"}, text)
                self.assertEqual(unmapped, [])
            attrs, _ = map_items(["鞦韆2座"], rules)
            self.assertEqual(set(attrs), {"swing"})  # 一般鞦韆不算鳥巢

    def test_luguang_park_has_no_disc_swing_wording(self):
        # 綠光公園原本同時列出「圓盤鞦韆」（網路文章）與清冊的「鳥巢盪鞦韆1座」，其實是同一座
        seed = json.loads((ROOT / "data/seed/hsc/places.json").read_text(encoding="utf-8"))
        [p] = [p for p in seed["places"] if p["id"] == "hsc-luguang-park"]
        self.assertEqual((p["attrs"]["swing"]["v"], p["attrs"]["swing"]["src"]), ("y", "hccg"))
        self.assertEqual(p["attrs"]["nest_swing"]["v"], "y")
        self.assertNotIn("圓盤", json.dumps(p, ensure_ascii=False))


if __name__ == "__main__":
    unittest.main()
