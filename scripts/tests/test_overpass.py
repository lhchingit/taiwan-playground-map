"""lib/overpass.py 的 within：一批一直逾時時拆成兩半再查（不連網路，用假的查詢）"""
import unittest
import urllib.error
from unittest import mock

from lib import overpass


def fake_query(fail_when_larger_than):
    calls = []

    def query(batch):
        calls.append(len(batch))
        if len(batch) > fail_when_larger_than:
            raise urllib.error.HTTPError("u", 504, "Gateway Timeout", {}, None)
        elements = []
        for ref, _ in batch:
            elements += [{"type": "marker", "tags": {"ref": ref}},
                         {"type": "area", "id": 1, "tags": {"boundary": "administrative", "admin_level": "8",
                                                             "name": "板橋區"}}]
        return {"elements": elements}
    return query, calls


@mock.patch("lib.overpass.time.sleep", lambda s: None)
class WithinTest(unittest.TestCase):
    POINTS = [(f"n{i}", (25.0, 121.4)) for i in range(10)]

    def test_split_until_it_works(self):
        query, calls = fake_query(fail_when_larger_than=3)
        out = overpass.within(self.POINTS, query)
        self.assertEqual(set(out), {r for r, _ in self.POINTS})
        self.assertEqual(calls[0], 10)
        self.assertEqual(calls, [10, 5, 2, 3, 5, 2, 3])  # 失敗的一批拆成兩半
        self.assertEqual(sum(n for n in calls if n <= 3), 10)  # 成功的批次涵蓋全部的點

    def test_gives_up_when_a_single_point_fails(self):
        query, _ = fake_query(fail_when_larger_than=0)
        with self.assertRaises(urllib.error.HTTPError):
            overpass.within(self.POINTS[:2], query)

    def test_other_errors_are_not_retried(self):
        def query(batch):
            raise urllib.error.HTTPError("u", 400, "Bad Request", {}, None)
        with self.assertRaises(urllib.error.HTTPError):
            overpass.within(self.POINTS, query)


if __name__ == "__main__":
    unittest.main()
