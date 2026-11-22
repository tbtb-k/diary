"""Copilot 管理ダイジェストの機械的な作業をまとめたスクリプト。

  collect : RSS から前号以降の Copilot 関連の投稿を集め、記録帳（items.json）と比べて
            「新規・更新・持ち越し・完了」に分けた作業メモ（worksheet）を作る
  commit  : 作業メモと、Claude が決めた判定（decisions.json）を記録帳に書き込む
  check   : 公開前の HTML をチェックする

使い方（リポジトリの直下で）:
  curl -sS -o /tmp/mc.xml https://mc.merill.net/rss.xml
  python3 .claude/skills/copilot-digest/digest.py collect --rss /tmp/mc.xml --out /tmp/ws.json
  python3 .claude/skills/copilot-digest/digest.py check pages/admin_YYYYMMDD-copilot.html --worksheet /tmp/ws.json
  python3 .claude/skills/copilot-digest/digest.py commit --worksheet /tmp/ws.json --decisions /tmp/decisions.json

外部ライブラリは使いません（標準ライブラリだけ）。ネットワークにもつなぎません。
"""
import argparse
import datetime as dt
import email.utils
import html
import html.parser
import json
import pathlib
import re
import sys
import xml.etree.ElementTree as ET

HERE = pathlib.Path(__file__).resolve().parent
STATE = HERE / "items.json"
JST = dt.timezone(dt.timedelta(hours=9))
LEVELS = {"red", "amber", "blue", "green", "grey"}
VERDICTS = {"check", "cond", "ok", "none"}
TRACKED = {"red", "amber"}  # 持ち越し・完了の対象にする仕分け
TOPIC = re.compile(r"copilot", re.I)
MC_ID = re.compile(r"^(MC\d+)\s*[:：]\s*(.*)$")


# ---------------------------------------------------------------- 共通
def load_state(path):
    p = pathlib.Path(path)
    if not p.exists():
        sys.exit(f"記録帳が見つかりません: {p}")
    return json.loads(p.read_text(encoding="utf-8"))


def save_state(path, state):
    pathlib.Path(path).write_text(
        json.dumps(state, ensure_ascii=False, indent=1, sort_keys=False) + "\n", encoding="utf-8"
    )


def parse_iso(s):
    d = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)


def iso(d):
    return d.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def clean(text):
    text = re.sub(r"<[^>]+>", " ", html.unescape(text or ""))
    return re.sub(r"\s+", " ", text).strip()


def read_rss(path):
    root = ET.parse(path).getroot()
    out, oldest = [], None
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        pub_raw = it.findtext("pubDate")
        if not pub_raw:
            continue
        pub = email.utils.parsedate_to_datetime(pub_raw)
        if pub.tzinfo is None:
            pub = pub.replace(tzinfo=dt.timezone.utc)
        oldest = pub if oldest is None or pub < oldest else oldest
        m = MC_ID.match(title)
        if not m:
            continue
        summary = clean(it.findtext("description"))
        services = [c.text.strip() for c in it.findall("category") if c.text and c.text.strip() != "Message Center"]
        out.append({
            "id": m.group(1),
            "title_en": m.group(2).strip(),
            "summary_en": summary,
            "services": services,
            "pub_date": iso(pub),
            "link": (it.findtext("link") or f"https://mc.merill.net/message/{m.group(1)}").strip(),
            "_pub": pub,
        })
    return out, oldest


# ---------------------------------------------------------------- collect
def cmd_collect(a):
    state = load_state(a.state)
    now = parse_iso(a.now) if a.now else dt.datetime.now(dt.timezone.utc)
    today = now.astimezone(JST).date()
    issue = today.strftime("%Y%m%d")
    cutoff = parse_iso(state["last_cutoff"])
    items = state["items"]

    rss, oldest = read_rss(a.rss)
    window = {}
    for r in rss:
        if not (cutoff < r["_pub"] <= now):
            continue
        if not TOPIC.search(r["title_en"] + " " + r["summary_en"]):
            continue
        prev = window.get(r["id"])
        if prev is None or r["_pub"] > prev["_pub"]:
            window[r["id"]] = r

    new, updated, minor = [], [], []
    for r in sorted(window.values(), key=lambda x: x["_pub"], reverse=True):
        r = {k: v for k, v in r.items() if k != "_pub"}
        old = items.get(r["id"])
        if old is None:
            new.append(r)
            continue
        r["previous"] = {k: old.get(k) for k in (
            "title_ja", "level", "verdict", "act_by", "keep_until", "group",
            "summary_en", "first_issue", "last_issue", "closed_issue")}
        (minor if old.get("summary_en") == r["summary_en"] else updated).append(r)

    # 要約が変わっていない投稿（minor）は「変化なし」と同じ扱いにして、持ち越し・完了の判定に残す
    in_window = {r["id"] for r in new + updated}
    carry, done = [], []
    for mid, it in items.items():
        if mid in in_window or it.get("level") not in TRACKED or it.get("closed_issue"):
            continue
        row = {"id": mid, **{k: it.get(k) for k in (
            "title_ja", "title_en", "level", "verdict", "act_by", "keep_until", "group", "first_issue")}}
        ku = it.get("keep_until")
        if ku and dt.date.fromisoformat(ku) < today:
            done.append(row)
        else:
            carry.append(row)
    carry.sort(key=lambda x: (x.get("keep_until") or "9999-12-31", x["id"]))
    done.sort(key=lambda x: x["id"])

    ws = {
        "issue": issue,
        "issue_date": today.strftime("%Y/%m/%d"),
        "now": iso(now),
        "period_from": iso(cutoff),
        "period_to": iso(now),
        "period_label": f"{cutoff.astimezone(JST):%Y/%m/%d %H:%M} 〜 {now.astimezone(JST):%Y/%m/%d %H:%M}（日本時間）",
        "prev_issue": state.get("last_issue"),
        "issue_no": len(state.get("issues", [])),
        "coverage_gap": bool(oldest and oldest > cutoff),
        "counts": {"new": len(new), "updated": len(updated), "minor": len(minor),
                   "carry": len(carry), "done": len(done)},
        "new": new, "updated": updated, "minor": minor, "carry": carry, "done": done,
    }
    pathlib.Path(a.out).write_text(json.dumps(ws, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    print(f"号: {ws['issue_date']}号（No.{ws['issue_no']:02d}）  対象: {ws['period_label']}")
    if state.get("last_issue") == issue:
        print("WARN 今日の号はすでに記録帳にあります（同じ日に2回目の実行）")
    if ws["coverage_gap"]:
        print("WARN RSS の一番古い投稿が前号の集計時刻より新しいです。取りこぼしの可能性があります")
    c = ws["counts"]
    print(f"新規 {c['new']} / 更新 {c['updated']}（要約に変化なし {c['minor']}） / 持ち越し {c['carry']} / 完了 {c['done']}")
    for label, rows in (("新規", new), ("更新", updated)):
        for r in rows:
            print(f"  [{label}] {r['id']} {r['title_en'][:70]}")
    print(f"作業メモ: {a.out}")


# ---------------------------------------------------------------- commit
def cmd_commit(a):
    state = load_state(a.state)
    ws = json.loads(pathlib.Path(a.worksheet).read_text(encoding="utf-8"))
    dec = json.loads(pathlib.Path(a.decisions).read_text(encoding="utf-8"))
    issue = ws["issue"]
    if state.get("last_issue") == issue and not a.force:
        sys.exit(f"NG {issue} はすでに記録帳に書き込み済みです（やり直すときは --force）")

    errors = []
    need = [r["id"] for r in ws["new"]] + [r["id"] for r in ws["updated"]]
    for mid in need:
        if mid not in dec:
            errors.append(f"{mid} の判定が decisions.json にありません")
    for mid, d in dec.items():
        if d.get("level") not in LEVELS:
            errors.append(f"{mid}: level は {sorted(LEVELS)} のどれか")
        if d.get("verdict") not in VERDICTS:
            errors.append(f"{mid}: verdict は {sorted(VERDICTS)} のどれか")
        if not d.get("title_ja"):
            errors.append(f"{mid}: title_ja（日本語の見出し）がありません")
        for k in ("act_by", "keep_until"):
            v = d.get(k)
            if v:
                try:
                    dt.date.fromisoformat(v)
                except ValueError:
                    errors.append(f"{mid}: {k} は YYYY-MM-DD 形式（{v}）")
        if d.get("level") in TRACKED and not d.get("keep_until"):
            errors.append(f"{mid}: 要判断・確認推奨には keep_until（いつまで持ち越すか）が必要です")
    if errors:
        print("\n".join("NG " + e for e in errors))
        sys.exit(1)

    rows = {r["id"]: r for r in ws["new"] + ws["updated"] + ws["minor"]}
    for mid, r in rows.items():
        old = state["items"].get(mid, {})
        d = dec.get(mid, {})
        merged = {
            "title_ja": d.get("title_ja", old.get("title_ja")),
            "title_en": r["title_en"],
            "services": r["services"],
            "level": d.get("level", old.get("level")),
            "verdict": d.get("verdict", old.get("verdict")),
            "act_by": d.get("act_by", old.get("act_by")),
            "keep_until": d.get("keep_until", old.get("keep_until")),
            "group": d.get("group", old.get("group")),
            "summary_en": r["summary_en"],
            "pub_date": r["pub_date"],
            "first_issue": old.get("first_issue", issue),
            "last_issue": issue,
            "closed_issue": None if d.get("level", old.get("level")) in TRACKED else old.get("closed_issue"),
            "history": old.get("history", []),
        }
        if not old or (old.get("level"), old.get("verdict")) != (merged["level"], merged["verdict"]):
            merged["history"] = merged["history"] + [{"issue": issue, "level": merged["level"], "verdict": merged["verdict"]}]
        state["items"][mid] = merged

    for r in ws["done"]:
        state["items"][r["id"]]["closed_issue"] = issue

    state["last_cutoff"] = ws["now"]
    state["last_issue"] = issue
    state.setdefault("issues", [])
    state["issues"] = [x for x in state["issues"] if x.get("issue") != issue] + [{
        "issue": issue,
        "file": f"pages/admin_{issue}-copilot.html",
        "period_from": ws["period_from"],
        "period_to": ws["period_to"],
        "counts": ws["counts"],
    }]
    save_state(a.state, state)
    print(f"OK 記録帳を更新しました（{issue}号・登録 {len(rows)} 件・完了 {len(ws['done'])} 件）")


# ---------------------------------------------------------------- check
VOID = {"meta", "br", "hr", "img", "input", "link", "wbr", "source", "area", "col", "base"}


class Scan(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack, self.errors, self.ids, self.ext = [], [], set(), []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get("id"):
            self.ids.add(a["id"])
        if tag == "script" and a.get("src"):
            self.ext.append(("script", a["src"]))
        if tag == "link" and a.get("href") and a.get("rel") not in ("preconnect",):
            self.ext.append(("link", a["href"]))
        if tag not in VOID:
            self.stack.append((tag, self.getpos()[0]))

    def handle_startendtag(self, tag, attrs):
        a = dict(attrs)
        if a.get("id"):
            self.ids.add(a["id"])

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if self.stack and self.stack[-1][0] == tag:
            self.stack.pop()
            return
        opened = self.stack[-1] if self.stack else None
        self.errors.append(f"{self.getpos()[0]}行目: </{tag}> の前に閉じていないタグ {opened}")
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break


REQUIRED_IDS = ["diff", "todo", "carry", "red", "amber", "blue", "green", "grey", "about"]
ALLOWED_HOSTS = ("https://fonts.googleapis.com/", "https://fonts.gstatic.com/")


def cmd_check(a):
    ng, warn = [], []
    for f in a.files:
        p = pathlib.Path(f)
        s = p.read_text(encoding="utf-8")
        tag = p.name
        m = re.fullmatch(r"admin_(\d{8})-copilot\.html", p.name)
        if not m:
            ng.append(f"{tag}: ファイル名は admin_YYYYMMDD-copilot.html")
        if not re.match(r"\s*<!doctype html>", s, re.I):
            ng.append(f"{tag}: 先頭が <!doctype html> ではありません")
        for pat, msg in ((r'<html lang="ja">', '<html lang="ja">'),
                         (r'<meta charset="utf-8">', '<meta charset="utf-8">'),
                         (r'<meta name="viewport"', "viewport の meta"),
                         (r'<meta name="description" content="[^"]{10,}"', "description の meta"),
                         (r"<body[\s>]", "<body>")):
            if not re.search(pat, s):
                ng.append(f"{tag}: {msg} がありません")
        t = re.search(r"<title>(.*?)</title>", s, re.S)
        if not t or not re.fullmatch(r"Copilot 管理ダイジェスト \d{4}/\d{2}/\d{2}号", t.group(1).strip()):
            ng.append(f"{tag}: <title> は「Copilot 管理ダイジェスト YYYY/MM/DD号」の形にします")
        elif m and t.group(1).strip()[-11:-1].replace("/", "") != m.group(1):
            ng.append(f"{tag}: <title> の日付とファイル名の日付が違います")
        for bad in ("TODO", "XXX", "〇〇", "ここに書く", "lorem"):
            if bad in s:
                ng.append(f"{tag}: 書きかけの印「{bad}」が残っています")

        sc = Scan()
        sc.feed(s)
        sc.close()
        ng += [f"{tag}: {e}" for e in sc.errors[:5]]
        if sc.stack:
            ng.append(f"{tag}: 閉じていないタグ {sc.stack[-3:]}")
        for need in REQUIRED_IDS:
            if need not in sc.ids:
                ng.append(f'{tag}: id="{need}" のセクションがありません')
        for kind, url in sc.ext:
            if url.startswith(("http://", "https://", "//")) and not url.startswith(ALLOWED_HOSTS):
                ng.append(f"{tag}: 外部の読み込み {kind} {url}（Google Fonts 以外は使いません）")

        if a.worksheet:
            ws = json.loads(pathlib.Path(a.worksheet).read_text(encoding="utf-8"))
            if m and m.group(1) != ws["issue"]:
                ng.append(f"{tag}: 作業メモの号（{ws['issue']}）とファイル名が違います")
            for key, label in (("new", "新規"), ("updated", "更新"), ("carry", "持ち越し"), ("done", "完了")):
                for r in ws[key]:
                    if r["id"] not in s:
                        ng.append(f"{tag}: {label}の {r['id']} がページに出ていません")
            if f"No.{ws['issue_no']:02d}" not in s:
                warn.append(f"{tag}: 号数 No.{ws['issue_no']:02d} がページに見つかりません")

    for w in warn:
        print("WARN", w)
    if ng:
        for e in ng:
            print("NG", e)
        sys.exit(1)
    print("OK", " ".join(a.files))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("collect")
    c.add_argument("--rss", required=True)
    c.add_argument("--state", default=str(STATE))
    c.add_argument("--now", help="ISO 形式の現在時刻（テスト用）")
    c.add_argument("--out", default="/tmp/copilot-digest-worksheet.json")
    m = sub.add_parser("commit")
    m.add_argument("--worksheet", required=True)
    m.add_argument("--decisions", required=True)
    m.add_argument("--state", default=str(STATE))
    m.add_argument("--force", action="store_true")
    k = sub.add_parser("check")
    k.add_argument("files", nargs="+")
    k.add_argument("--worksheet")
    a = ap.parse_args()
    {"collect": cmd_collect, "commit": cmd_commit, "check": cmd_check}[a.cmd](a)


if __name__ == "__main__":
    main()
