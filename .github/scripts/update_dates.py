#!/usr/bin/env python3
"""pages/ の各HTMLが最初に追加された日時を git の履歴から調べて、dates.json に書き出す。

トップページ（index.html）の「新着順」は、このファイルを1回読むだけで並べられる。
（以前はページごとに GitHub API に聞いていたが、API は1時間60回までなので
 ページが50件を超えたあたりで日付が取り切れなくなっていた）

ふだんは .github/workflows/update-dates.yml が main への push のたびに自動で実行する。
手で作り直すときは、リポジトリのどこからでも:  python3 .github/scripts/update_dates.py
"""
import json
import pathlib
import subprocess
import sys
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[2]
PAGES = "pages"
OUT = ROOT / "dates.json"


def git(*args):
    return subprocess.run(["git", "-c", "core.quotepath=false", *args],
                          cwd=ROOT, capture_output=True, text=True, check=True).stdout


def main():
    if git("rev-parse", "--is-shallow-repository").strip() == "true":
        sys.exit("履歴が途中までしかないため、正しい日付が出せません（checkout で fetch-depth: 0 にしてください）")

    # ファイルが追加（A）されたコミットだけを拾う（ブランチで作ってから取り込んだものも漏らさないよう --full-history）。
    # 同じファイルが何度か出てきたら、いちばん古い日を採る
    log = git("log", "--full-history", "--diff-filter=A", "--no-renames", "--format=@%cI", "--name-only", "--", PAGES)
    added, when = {}, None
    for line in log.splitlines():
        if line.startswith("@"):
            when = datetime.fromisoformat(line[1:]).astimezone(timezone.utc)
        elif line.strip() and when:
            name = line.strip()
            if name not in added or when < added[name]:
                added[name] = when

    dates = {}
    for p in sorted((ROOT / PAGES).iterdir()):
        if p.is_file() and p.suffix.lower() in (".html", ".htm"):
            d = added.get(f"{PAGES}/{p.name}")
            if d:
                dates[p.name] = d

    # 見やすいように新しい順で書く（読む側は順番に頼らない）。日時は UTC にそろえる
    ordered = {k: v.strftime("%Y-%m-%dT%H:%M:%SZ")
               for k, v in sorted(dates.items(), key=lambda kv: (-kv[1].timestamp(), kv[0]))}
    OUT.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"dates.json: {len(ordered)} 件")


if __name__ == "__main__":
    main()
