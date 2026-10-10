"""新竹市親子遊樂場種子資料 v0.1 — 產生 places.json / places.csv
屬性值三態：y 有 / n 無 / u 未知；每個屬性附來源代碼。
"""
import json, csv

VERIFIED = "2026-10-10"

SOURCES = {
    "yam":   {"label": "網路文章：蕃薯藤旅遊 新竹市公園懶人包", "url": "https://travel.yam.com/article/119929", "kind": "article"},
    "upto":  {"label": "網路文章：新竹市公園特色整理", "url": "https://uptogo.com.tw/親子/新竹市公園/", "kind": "article"},
    "tvbs":  {"label": "網路文章：TVBS 食尚玩家 新竹景點", "url": "https://supertaste.tvbs.com.tw/hot/358679", "kind": "article"},
    "udn":   {"label": "新聞：聯合報 2026-08 竹市公園遮蔭（養工處回應）", "url": "https://udn.com/news/story/7324/9665456", "kind": "news"},
    "lead":  {"label": "網友評論線索，待實地確認", "url": None, "kind": "lead"},
    "est":   {"label": "依面積與設施推估", "url": None, "kind": "estimate"},
}

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

def A(**kw):
    """kw: key=(value, source[, note])"""
    out = {}
    for k in list(PLAY) + list(AMENITY):
        if k in kw:
            t = kw[k]
            out[k] = {"v": t[0], "src": t[1], "note": t[2] if len(t) > 2 else None, "at": VERIFIED}
        else:
            out[k] = {"v": "u", "src": None, "note": None, "at": None}
    return out

PLACES = [
    dict(id="hsc-hsinchu-park", name="新竹公園", district="東區", address="新竹市東區食品路66號（東山街與食品路口）",
         lat=24.800916, lng=120.977325, size="L", stay="60_120", stay_src="est", age_min=1, age_max=12,
         fee="free", indoor=False, hours="24 小時（動物園、玻工館另計）", surface=None, status="open",
         summary="近 100 公尺分齡大沙坑，搭配磨石子地景溜滑梯與鳥巢鞦韆，園內還有動物園與玻璃工藝博物館。",
         attrs=A(slide=("y","yam","磨石子地景溜滑梯"), swing=("y","yam"), baby_swing=("y","yam","尿布式鞦韆"), nest_swing=("y","yam"),
                 sandpit=("y","yam","三區：一般砂、用水細砂、小童白細砂"), spinner=("y","yam"),
                 rope_net=("y","yam","溜滑梯結合繩網攀爬"), toddler_zone=("y","yam","小童白細砂沙坑"), shade=("y","yam","沙坑周邊樹蔭多"),
                 inclusive=("y","yam","兒童共融活動區"), transit=("y","yam","新竹火車站步行約 10 分鐘"),
                 food=("y","upto","園內與周邊有咖啡店"), lighting=("y","lead","跑道有夜間照明"))),
    dict(id="hsc-luguang-park", name="綠光公園", district="東區", address="新竹市東區鐵道路一段28巷79號對面",
         lat=24.812440, lng=120.984971, size="M", stay="60_120", stay_src="est", age_min=3, age_max=12,
         fee="free", indoor=False, hours="24 小時", surface=None, status="open",
         summary="新竹市第一座有溜索的公園，還有攀岩牆、大沙坑與手壓汲水器，旁邊是生態滯洪池。",
         attrs=A(zipline=("y","yam","全市首座溜索"), climbing_wall=("y","yam"), balance=("y","yam"), spring_rider=("y","lead","評論提到只有一隻"), open_lawn=("y","yam","一整片大綠地"),
                 sandpit=("y","yam"), slide=("y","yam","磨石子溜滑梯"), swing=("y","yam","圓盤鞦韆"),
                 water_pump=("y","yam","復古手壓汲水器，可以比賽噴水"), transit=("y","yam","北新竹站步行約 8 分鐘"),
                 toilet=("n","lead","評論提到需借用附近超商廁所"), handwash=("y","lead"),
                 shade=("y","lead","樹蔭多，下午三點後較舒適"), parking=("y","lead","有少量車位，假日難停"),
                 food=("y","lead","鄰近便利商店"))),
    dict(id="hsc-guanxin-park", name="關新公園", district="東區", address="新竹市東區關新路59號",
         lat=24.785733, lng=121.019477, size="M", stay="60_120", stay_src="est", age_min=2, age_max=12,
         fee="free", indoor=False, hours="24 小時", surface=None, status="open",
         summary="分齡規劃：南側 2–5 歲草坡溜滑梯，北側 5–12 歲寬版磨石子溜滑梯與攀爬台，還有粉筆塗鴉牆。",
         attrs=A(slide=("y","yam","草坡溜滑梯＋寬版磨石子溜滑梯"), climbing=("y","yam","攀爬遊戲台"), chalk_wall=("y","yam","自備粉筆"), toddler_zone=("y","yam","南側 2–5 歲區"),
                 swing=("y","lead"), sandpit=("y","lead"), shade=("y","udn","市府表示近年已增設遮蔭"),
                 transit=("y","yam","新莊站步行約 400 公尺"))),
    dict(id="hsc-changhe-park", name="長和公園", district="北區", address="新竹市北區長安街117號（新民街與愛文街口）",
         lat=24.808258, lng=120.963959, size="S", stay="30_60", stay_src="est", age_min=3, age_max=12,
         fee="free", indoor=False, hours="24 小時", surface=None, status="open",
         summary="百年大榕樹遮蔭下的樹屋瞭望平台、三索平衡木和吊橋，夏天也不太曬。",
         attrs=A(slide=("y","yam","磨石子溜滑梯"), balance=("y","yam","三索平衡木"),
                 suspension_bridge=("y","yam"), tree_house=("y","yam","高架樹屋瞭望平台"), ball_court=("y","lead","小型籃球場"), shade=("y","yam","百年大榕樹"),
                 stroller=("y","yam","無障礙坡道"), toilet=("n","lead","評論提到沒有公廁"),
                 parking=("n","lead","巷弄狹窄，車位很少"), transit=("y","yam","新竹火車站步行約 16 分鐘"))),
    dict(id="hsc-gangnan-canal-park", name="港南運河公園", district="香山區", address="新竹市香山區海埔路600號",
         lat=24.822847, lng=120.910355, size="L", stay="60_120", stay_src="est", age_min=1, age_max=12,
         fee="free", indoor=False, hours="24 小時", surface=None, status="open",
         summary="有紅綠燈、斑馬線的滑步車賽道，大型攀爬區與幼兒攀爬區分開，緊鄰海岸自行車道。",
         attrs=A(pushbike=("y","yam","含迷你紅綠燈與交通標誌"), climbing=("y","yam","爬架、穿環、旋轉桿"), toddler_zone=("y","yam","幼兒攀爬區"),
                 trampoline=("y","yam"), spinner=("y","yam","極限飛輪"), balance=("y","yam"),
                 shade=("u","yam","只提到家長可在涼亭休息"))),
    dict(id="hsc-zhongyang-park", name="中央公園", district="東區", address="新竹市東區中央路162巷",
         lat=24.807980, lng=120.973000, size="M", stay="60_120", stay_src="est", age_min=2, age_max=12,
         fee="free", indoor=False, hours="24 小時", surface=None, status="open",
         summary="市中心社區型公園，歐盟認證遊具、多種鞦韆與沙坑，大草皮可以跑。",
         attrs=A(slide=("y","lead"), swing=("y","lead","多種鞦韆"), sandpit=("y","lead"), spring_rider=("y","lead"),
                 chalk_wall=("y","lead","粉筆步道"), open_lawn=("y","upto","大片綠地"),
                 shade=("y","udn","市府表示近年已增設遮蔭"), parking=("y","lead","附近橋下有停車場"),
                 food=("y","lead"))),
    dict(id="hsc-nanliao-sand-water", name="南寮兒童挖沙玩水區", district="北區", address="新竹市北區南寮街261號旁（新竹漁港旅遊服務中心）",
         lat=24.849226, lng=120.928503, size="L", stay="half", stay_src="est", age_min=1, age_max=10,
         fee="free", indoor=False, hours="夏季開放；週一、週五休（評論線索，出發前請查證）", surface="沙地", status="seasonal",
         summary="大沙池加上水深約 25 公分的戲水池和溜滑梯，旁邊的旅服中心有廁所和淋浴間。",
         attrs=A(sandpit=("y","tvbs"), water_play=("y","tvbs","夏季開放"), slide=("y","lead","磨石子滑梯滑進水池"),
                 footwash=("y","lead"), toilet=("y","lead","旅服中心內"), parking=("y","tvbs","車位多；評論提到每小時 30 元"),
                 shade=("u","lead","有遮陽棚，但也有人說很曬"), food=("y","tvbs","漁港周邊"))),
    dict(id="hsc-minghu-park", name="明湖公園", district="東區", address="新竹市東區明湖路775巷28號",
         lat=24.774399, lng=120.968304, size="M", stay="30_60", stay_src="est", age_min=2, age_max=10,
         fee="free", indoor=False, hours="24 小時", surface=None, status="open",
         summary="湖邊社區公園，有慢跑步道和兒童遊戲區，遊具細節還沒有可靠資料。",
         attrs=A(shade=("y","udn","市府表示近年已增設遮蔭"))),
    dict(id="hsc-green-road-smile-slide", name="綠園道 微笑溜滑梯", district="東區", address="新竹市東區縱貫路671號附近（東大路與民權路段）",
         lat=24.813652, lng=120.969317, size="S", stay="lt30", stay_src="est", age_min=3, age_max=12,
         fee="free", indoor=False, hours="24 小時", surface=None, status="open",
         summary="綠園道上的碗公造型磨石子溜滑梯，適合順路放電。旁邊就是馬路且沒有圍欄，要看緊孩子。",
         attrs=A(slide=("y","upto","碗公型磨石子溜滑梯"), shade=("y","lead"), parking=("y","lead","路邊停車"),
                 food=("y","lead"))),
    dict(id="hsc-xingxue-park", name="興學公園", district="東區", address="新竹市東區興竹街122號",
         lat=24.797676, lng=120.965911, size="S", stay="30_60", stay_src="est", age_min=2, age_max=8,
         fee="free", indoor=False, hours="24 小時", surface=None, status="open",
         summary="緊鄰鐵道，可以看火車，有新的溜滑梯和蹺蹺板。",
         attrs=A(slide=("y","lead"), seesaw=("y","lead"), spring_rider=("n","lead","評論提到沒有搖搖馬"), baby_swing=("n","lead","評論提到沒有嬰兒鞦韆"),
                 open_lawn=("y","lead"), handwash=("n","lead","只有樹下的灌溉水龍頭"), parking=("y","lead","智慧停車格"),
                 shade=("u","udn","市府列入今年度增設遮蔭計畫"))),
]

# 停車：type lot/street/none/u；fee free/paid/u；spaces 整數或 None
def PK(type="u", fee="u", spaces=None, src=None, note=None):
    return {"type": type, "fee": fee, "spaces": spaces, "src": src, "note": note, "at": VERIFIED if src else None}
PARKING = {
    "hsc-hsinchu-park":          PK(),
    "hsc-luguang-park":          PK("u", "u", None, "lead", "評論提到有少量車位，假日難停；類型待確認"),
    "hsc-guanxin-park":          PK(),
    "hsc-changhe-park":          PK("street", "u", None, "lead", "園區步道旁有少數車位，巷弄狹窄不好找"),
    "hsc-gangnan-canal-park":    PK(),
    "hsc-zhongyang-park":        PK("lot", "u", None, "lead", "附近橋下有大型停車場"),
    "hsc-nanliao-sand-water":    PK("lot", "paid", None, "lead", "車位多；評論提到每小時 30 元"),
    "hsc-minghu-park":           PK(),
    "hsc-green-road-smile-slide":PK("street", "u", None, "lead", "附近路邊停車格多"),
    "hsc-xingxue-park":          PK("street", "paid", None, "lead", "智慧停車格（路邊收費）"),
}
for p in PLACES:
    p["attrs"].pop("parking", None)
    p["parking"] = PARKING[p["id"]]

for p in PLACES:
    p["source_coords"] = "Google Places（原型暫用，正式版須改用 OSM／TGOS 重新定位）"

json.dump({"version": "0.1", "city": "新竹市", "generated": VERIFIED, "sources": SOURCES,
           "labels": {"play": PLAY, "play_groups": [{"name": n, "keys": list(g)} for n, g in PLAY_GROUPS], "amenity": AMENITY}, "places": PLACES},
          open("data/seed/hsc/places.json", "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)

keys = list(PLAY) + list(AMENITY)
with open("data/seed/hsc/places.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["id","name","district","address","lat","lng","size","stay","age_min","age_max","fee","status"] + keys + ["parking_type","parking_fee","parking_spaces"])
    for p in PLACES:
        w.writerow([p[k] for k in ["id","name","district","address","lat","lng","size","stay","age_min","age_max","fee","status"]]
                   + [p["attrs"][k]["v"] for k in keys]
                   + [p["parking"]["type"], p["parking"]["fee"], p["parking"]["spaces"] or ""])
print(len(PLACES), "places")
