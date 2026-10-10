"""新竹市政府（養護工程處）三份開放資料的設定：下載腳本與 check_hccg_update.py 共用，網址只在這裡維護。

kind：
  tsv   清冊，存成原文照錄的 TSV（沒有存原始檔雜湊，比對內容）
  json  存成 {source, dataset, url, license, fetched, sha256, records}，比對雜湊；key 是用來配對紀錄的欄位
"""
LICENSE = "政府資料開放授權條款－第 1 版"

DATASETS = {
    "playgrounds": {
        "id": "132713", "label": "新竹市兒童遊戲場清冊", "kind": "tsv",
        "url": "https://odws.hccg.gov.tw/001/Upload/25/opendataback/9059/571/b02a5f4e-09d4-4b98-bdca-3b47f4ecf7ad.json",
        "path": "data/raw/hsc/hccg-playgrounds.tsv", "fetch": "scripts/fetch_hccg_playgrounds.py",
    },
    "parks": {
        "id": "67762", "label": "新竹市公園管理維護地點", "kind": "json", "key": "公園名稱",
        "source": "新竹市公園管理維護地點（新竹市政府養護工程處）",
        "url": "https://odws.hccg.gov.tw/001/Upload/25/opendataback/9059/71/4a6003c3-fe42-4e54-be5c-4c888bb6c754.json",
        "path": "data/raw/hsc/hccg-parks.json", "fetch": "scripts/fetch_hccg_parks.py",
    },
    "toilets": {
        "id": "67757", "label": "新竹市公廁地點資訊", "kind": "json", "key": "公廁名稱",
        "source": "新竹市公廁地點資訊（新竹市政府養護工程處）",
        "url": "https://odws.hccg.gov.tw/001/Upload/25/opendataback/9059/81/5672e4c5-63c7-4336-aa9e-34c09aa2f446.json",
        "path": "data/raw/hsc/hccg-toilets.json", "fetch": "scripts/fetch_hccg_toilets.py",
        # 這些欄位變更時在報告裡特別標出來（會影響匯入結果）
        "watch": ["育嬰台數量"],
    },
}


def dataset_page(ds):
    return f"https://data.gov.tw/dataset/{ds['id']}"
