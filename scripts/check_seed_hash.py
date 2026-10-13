"""從原始資料重新產生 places.json 等檔案，逐位元組比對 repo 裡的版本。

在暫存資料夾裡依序跑 build_seed.py → import_hccg.py（不會動到 repo 的檔案），
任何一個檔案的 SHA-256 不同就以結束碼 1 結束。用途：
  - 重構匯入腳本時，確認輸出完全不變
  - CI 裡確認 places.json 與產生它的腳本、原始資料一致
"""
import hashlib
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# 每個縣市：產生的指令與輸出檔（新增縣市時在這裡加一筆）
CITIES = {
    "hsc": {
        "scripts": ["scripts/build_seed.py", "scripts/import_hccg.py"],
        "outputs": ["data/seed/hsc/places.json", "data/seed/hsc/places.csv"]
        + [f"data/review/hsc/{k}.csv" for k in
           ["conflicts", "match-review", "no-playground", "unmapped-items", "unmatched",
            "parks-unmatched", "toilets-unmatched"]],
    },
    # 新竹縣：OpenStreetMap 的遊戲場（decisions D20）
    "hsq": {
        "scripts": [["scripts/import_osm_city.py", "hsq"]],
        "outputs": ["data/seed/hsq/places.json", "data/seed/hsq/places.csv"]
        + [f"data/review/hsq/{k}.csv" for k in ["unnamed", "merged", "excluded"]],
    },
    # 臺北市：臺北市公園設施資料（decisions D21）
    "tpe": {
        "scripts": ["scripts/import_pkl.py"],
        "outputs": ["data/seed/tpe/places.json", "data/seed/tpe/places.csv"]
        + [f"data/review/tpe/{k}.csv" for k in ["odd-names", "out-of-bounds", "districts-unknown"]],
    },
    # 新北市：OSM 遊戲場，官方公園清單只補地址
    "nwt": {
        "scripts": [["scripts/import_osm_city.py", "nwt"]],
        "outputs": ["data/seed/nwt/places.json", "data/seed/nwt/places.csv"]
        + [f"data/review/nwt/{k}.csv" for k in ["unnamed", "merged", "excluded", "official-matched",
                                                "official-ambiguous"]],
    },
    # 苗栗縣：同新竹縣（沒有官方清單）
    "mlc": {
        "scripts": [["scripts/import_osm_city.py", "mlc"]],
        "outputs": ["data/seed/mlc/places.json", "data/seed/mlc/places.csv"]
        + [f"data/review/mlc/{k}.csv" for k in ["unnamed", "merged", "excluded"]],
    },
    # 桃園市：桃園市公園（特色遊戲場＋有遊具的埤塘公園），再用 OSM 遊戲場補充
    "tyc": {
        "scripts": ["scripts/import_tycg.py"],
        "outputs": ["data/seed/tyc/places.json", "data/seed/tyc/places.csv", "data/review/tyc/to-locate.json"]
        + [f"data/review/tyc/{k}.csv" for k in ["unmatched", "match-review", "unmapped-items", "no-playground",
                                                "unnamed", "merged", "excluded", "osm-covered",
                                                "osm-near-official"]],
    },
}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        shutil.copytree(ROOT / "scripts", work / "scripts", ignore=shutil.ignore_patterns("__pycache__"))
        shutil.copytree(ROOT / "data/raw", work / "data/raw")
        failed = []
        for city, spec in CITIES.items():
            (work / "data/seed" / city).mkdir(parents=True)
            for script in spec["scripts"]:
                # 腳本可以帶參數：["scripts/import_osm_city.py", "hsq"]
                args = script if isinstance(script, list) else [script]
                subprocess.run([sys.executable, *args], cwd=work, env=env, check=True,
                               stdout=subprocess.DEVNULL)
        for rel in [o for spec in CITIES.values() for o in spec["outputs"]]:
            got, want = sha256(work / rel), sha256(ROOT / rel)
            ok = got == want
            print(f"{'OK  ' if ok else 'DIFF'} {got}  {rel}")
            if not ok:
                failed.append(rel)

    if failed:
        sys.exit(f"重新產生的檔案與 repo 不同：{', '.join(failed)}")
    print("全部相同")


if __name__ == "__main__":
    main()
