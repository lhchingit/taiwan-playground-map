"""原始資料沒有編號、列的順序也可能改變時，自己維護穩定編號（場地 id 用）。

名稱（鍵）相同的沿用上一版的編號，新的接著編，刪除的編號不重用。
"""


def name_key(name):
    """忽略空白：「乙 公園」跟「乙公園」是同一個"""
    return "".join(name.split())


def assign_numbers(records, previous, key=lambda r: r["公園名稱"]):
    """records：[{…}]，每筆加上 no；previous：{鍵: 編號}（上一版）；key：從一筆資料取出鍵"""
    numbers = {name_key(k): v for k, v in previous.items()}
    nxt = max(numbers.values(), default=0) + 1
    for r in records:
        k = name_key(key(r))
        if k not in numbers:
            numbers[k] = nxt
            nxt += 1
        r["no"] = numbers[k]
    return records
