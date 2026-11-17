"""AI Weekly の号（pages/report_YYYYMMDD.html）を公開前にチェックする。

使い方: python3 .claude/skills/ai-weekly/check.py pages/report_YYYYMMDD.html [...]
すべて OK なら終了コード 0、どれか NG なら 1。WARN は公開を止めない注意です。
"""
import html.parser
import pathlib
import re
import sys

VOID = {"meta", "br", "hr", "img", "input", "link", "wbr", "source", "area", "col", "base"}
SECTIONS = ["copilot", "ms", "industry", "japan"]


class Balance(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack, self.errors = [], []

    def handle_starttag(self, tag, attrs):
        if tag not in VOID:
            self.stack.append((tag, self.getpos()[0]))

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack or self.stack[-1][0] != tag:
            opened = self.stack[-1] if self.stack else None
            self.errors.append(f"{self.getpos()[0]}行目: </{tag}> の前に閉じていないタグ {opened}")
            # 立て直し: 同じタグまで戻る
            for i in range(len(self.stack) - 1, -1, -1):
                if self.stack[i][0] == tag:
                    del self.stack[i:]
                    break
        else:
            self.stack.pop()


def block(s, start_pat, end_tag):
    m = re.search(start_pat, s)
    if not m:
        return ""
    end = s.find(end_tag, m.end())
    return s[m.start(): end if end != -1 else len(s)]


def check(path):
    ng, warn = [], []
    p = pathlib.Path(path)
    s = p.read_text(encoding="utf-8")

    m = re.fullmatch(r"report_(\d{4})(\d{2})(\d{2})\.html", p.name)
    if not m:
        ng.append("ファイル名が report_YYYYMMDD.html の形ではありません")
        return ng, warn
    y, mo, d = m.groups()
    date_label = f"{y}/{mo}/{d}号"

    # 完全版の形
    if not s.startswith("<!doctype html>"):
        ng.append("先頭が <!doctype html> ではありません")
    for need in ('<html lang="ja">', '<meta charset="utf-8">',
                 '<meta name="viewport" content="width=device-width, initial-scale=1">'):
        if need not in s:
            ng.append(f"{need} がありません")
    t = re.search(r"<title>(.*?)</title>", s)
    if not t or t.group(1) != f"AI Weekly {date_label}":
        ng.append(f"<title> が「AI Weekly {date_label}」ではありません（{t.group(1) if t else 'なし'}）")
    st = re.search(r"<style>\s*(.*?)</style>", s, re.S)
    if not st or not st.group(1).startswith("body{margin:0}"):
        ng.append("<style> の先頭が body{margin:0} ではありません")
    if "prefers-color-scheme: dark" not in s:
        ng.append("ダークモードの指定（prefers-color-scheme: dark）がありません")

    # 外部読み込みなし
    ext = re.findall(r"<(?:link|script|img|iframe|object|embed)\b[^>]*>|@import|url\(\s*['\"]?https?:", s, re.I)
    if ext:
        ng.append(f"外部読み込み・スクリプト・画像があります: {ext[:3]}")
    for bad in ("{{", "}}", "TODO", "XXX", "claude:viewport"):
        if bad in s.split("</style>", 1)[-1]:
            ng.append(f"本文に {bad} が残っています")

    # HTML の閉じ忘れ
    b = Balance()
    b.feed(s)
    b.close()
    ng += b.errors[:5]
    if b.stack:
        ng.append(f"閉じていないタグがあります: {b.stack[-3:]}")

    # 表紙
    if f'<p class="issue">{date_label}</p>' not in s:
        ng.append(f'表紙の号の日付 <p class="issue">{date_label}</p> がありません')
    nos = re.findall(r"No\.(\d{2,})", s)
    mast_no = re.search(r'class="mast-top[^"]*"><span>No\.(\d+)</span>', s)
    foot_no = re.search(r"AI Weekly No\.(\d+)｜", s)
    if not mast_no or not foot_no:
        ng.append("表紙かフッターの号数（No.xx）が見つかりません")
    elif mast_no.group(1) != foot_no.group(1):
        ng.append(f"表紙 No.{mast_no.group(1)} とフッター No.{foot_no.group(1)} が違います")
    if "対象期間" not in s:
        ng.append("表紙に「対象期間」がありません")

    # 3行まとめ
    summ = block(s, r'<section class="summary"', "</section>")
    n_sum = summ.count("<li>")
    if n_sum != 3:
        ng.append(f"3行まとめが {n_sum} 行です（3行にします）")

    # 目次の件数と、各カテゴリの記事数が合っているか
    toc = block(s, r'<nav class="toc"', "</nav>")
    for sec in SECTIONS:
        body = block(s, rf'<section class="sec" id="{sec}"', "</section>")
        if not body:
            ng.append(f"カテゴリ #{sec} がありません")
            continue
        n = body.count('<article class="item">')
        tm = re.search(rf'href="#{sec}".*?<span class="n mono">(\d+)件</span>', toc, re.S)
        if not tm:
            ng.append(f"目次に #{sec} の件数がありません")
        elif int(tm.group(1)) != n:
            ng.append(f"目次の #{sec} は {tm.group(1)}件、本文は {n}件です")
        hm = re.search(r'<span class="count mono">(\d+)件</span>', body)
        if hm and int(hm.group(1)) != n:
            ng.append(f"#{sec} の見出しの件数 {hm.group(1)}件 と本文 {n}件 が違います")
        for i, art in enumerate(body.split('<article class="item">')[1:], 1):
            if not re.search(r'<p class="src">.*?href="https?://', art, re.S):
                ng.append(f"#{sec} の {i} 件目に出典リンクがありません")
            if not re.search(r'<time class="date" datetime="\d{4}-\d{2}-\d{2}">', art):
                ng.append(f"#{sec} の {i} 件目に日付（time datetime）がありません")
    n_copilot = block(s, r'<section class="sec" id="copilot"', "</section>").count('<article class="item">')
    if n_copilot and not 3 <= n_copilot <= 7:
        warn.append(f"Copilot 枠が {n_copilot} 件です（目安 4〜6 件）")

    before = block(s, r'<aside class="aside" id="before"', "</aside>")
    if before:
        n = before.count("<li>")
        tm = re.search(r'href="#before".*?<span class="n mono">(\d+)件</span>', toc, re.S)
        if not tm or int(tm.group(1)) != n:
            ng.append(f"目次の「期間直前の発表」の件数と本文 {n}件 が合いません")
    elif 'href="#before"' in toc:
        ng.append("目次に「期間直前の発表」がありますが、本文にありません")

    for need, label in (('id="term"', "今週のかみ砕き用語"), ('id="next"', "来週以降の注目予定"),
                        ('id="sources"', "出典一覧")):
        if need not in s:
            ng.append(f"「{label}」がありません")
    srcs = block(s, r'id="sources"', "</section>")
    if srcs.count("<li>") < 5:
        warn.append(f"出典一覧が {srcs.count('<li>')} 件です")

    # 分量（出典一覧を除く本文の文字数。これまでの号は 6,000〜8,000 字）
    main = s.split("</style>", 1)[-1].split('id="sources"')[0]
    chars = len(re.sub(r"\s+", "", re.sub(r"<[^>]+>", "", main)))
    if not 4000 <= chars <= 10000:
        warn.append(f"本文が {chars} 字です（これまでの号は 6,000〜8,000 字）")

    return ng, warn


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    bad = False
    for f in sys.argv[1:]:
        ng, warn = check(f)
        print(("NG  " if ng else "OK  ") + f)
        for e in ng:
            print("   NG:", e)
        for w in warn:
            print("   WARN:", w)
        bad |= bool(ng)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
