"""屬性字典：遊樂設施（分組）與生活機能。所有縣市共用，新增屬性見 .claude/commands/new-attribute.md。"""

PLAY_GROUPS = [
    ("滑行擺盪", {"slide": "溜滑梯", "swing": "盪鞦韆", "baby_swing": "嬰兒鞦韆", "nest_swing": "鳥巢鞦韆", "zipline": "溜索",
                 "seesaw": "蹺蹺板", "spring_rider": "搖搖馬", "spinner": "旋轉盤"}),
    ("攀爬平衡", {"climbing": "攀爬架", "climbing_wall": "攀岩牆", "rope_net": "攀爬繩網", "balance": "平衡木",
                 "suspension_bridge": "吊橋", "tunnel": "鑽洞隧道", "tree_house": "樹屋／高架平台"}),
    ("玩沙玩水", {"sandpit": "沙坑", "sand_table": "玩沙桌", "water_play": "戲水池／噴水", "water_pump": "汲水器"}),
    ("跑跳體能", {"trampoline": "彈跳床", "pushbike": "滑步車道", "open_lawn": "大草坪", "ball_court": "球場", "skatepark": "滑板場", "bars": "單槓"}),
    ("感官創意", {"music": "音樂遊具", "chalk_wall": "塗鴉牆", "toddler_zone": "幼兒專區"}),
]
PLAY = {k: v for _, g in PLAY_GROUPS for k, v in g.items()}
AMENITY = {"toilet": "廁所", "handwash": "洗手台", "footwash": "洗腳池", "shade": "遮蔭",
           "transit": "大眾運輸", "stroller": "嬰兒車友善", "nursing": "哺乳室／尿布台", "lighting": "夜間照明",
           "food": "周邊餐飲", "inclusive": "共融遊具"}


def labels_json():
    """places.json 的 labels 欄位"""
    return {"play": PLAY, "play_groups": [{"name": n, "keys": list(g)} for n, g in PLAY_GROUPS], "amenity": AMENITY}
