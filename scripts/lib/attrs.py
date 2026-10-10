"""屬性（三態 y / n / u）相關的共用函式。"""
import re


def attr_keys(labels):
    return list(labels["play"]) + list(labels["amenity"])


def blank_attrs(keys):
    return {k: {"v": "u", "src": None, "note": None, "at": None} for k in keys}


def map_items(items, rules):
    """依轉接器的對照規則（[(regex, [key...]), ...]，依序比對，同一項可以對到多個 key）
    回傳 ({key: 原文}, [沒有對應的原文])"""
    attrs, unmapped = {}, []
    for item in items:
        hit = False
        for pat, keys in rules:
            if re.search(pat, item):
                hit = True
                for k in keys:
                    if item not in attrs.setdefault(k, []):
                        attrs[k].append(item)
        if not hit:
            unmapped.append(item)
    return {k: "、".join(v) for k, v in attrs.items()}, unmapped
