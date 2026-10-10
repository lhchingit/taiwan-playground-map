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
OUTPUTS = [
    "data/seed/places.json",
    "data/seed/places.csv",
    "data/review/conflicts.csv",
    "data/review/match-review.csv",
    "data/review/no-playground.csv",
    "data/review/unmapped-items.csv",
    "data/review/unmatched.csv",
]


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        shutil.copytree(ROOT / "scripts", work / "scripts", ignore=shutil.ignore_patterns("__pycache__"))
        shutil.copytree(ROOT / "data/raw", work / "data/raw")
        (work / "data/seed").mkdir()
        for script in ["scripts/build_seed.py", "scripts/import_hccg.py"]:
            subprocess.run([sys.executable, script], cwd=work, env=env, check=True, stdout=subprocess.DEVNULL)

        failed = []
        for rel in OUTPUTS:
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
