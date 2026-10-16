"""政府資料開放平台（data.gov.tw）的下載與 metadata。只有 fetch_* 與 check_hccg_update.py 會連網路；匯入不會。"""
import json
import urllib.request

USER_AGENT = "playmap-data/0.1"
META_API = "https://data.gov.tw/api/v2/rest/dataset/{}"


def download(url, timeout=60, user_agent=USER_AGENT):
    req = urllib.request.Request(url, headers={"User-Agent": user_agent})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def decode_records(raw):
    """平台的 JSON 檔有時帶 BOM"""
    return json.loads(raw.decode("utf-8-sig"))


def dataset_meta(dataset_id):
    """{modified, json_url}：平台上的更新時間與目前的 JSON 下載網址（沒有 JSON 格式時是 None）"""
    result = json.loads(download(META_API.format(dataset_id), timeout=30).decode("utf-8"))["result"]
    json_url = next((d["resourceDownloadUrl"] for d in result.get("distribution", [])
                     if d.get("resourceFormat", "").upper() == "JSON"), None)
    return {"modified": result.get("modifiedDate", ""), "json_url": json_url}
