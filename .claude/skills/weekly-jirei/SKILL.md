---
name: weekly-jirei
description: 毎週、Microsoft 365 Copilot の Agent Builder と Copilot Studio の活用事例を1本ずつ記事HTMLにまとめ、学習記録サイト（tbtb-k/diary の pages/）の main に公開する手順。「今週の事例」「週次事例」「weekly-jirei」と言われたとき、または定期実行から呼ばれたときに使う。
---

# 週次の AI 活用事例（Agent Builder / Copilot Studio）

毎週1回、公開されている事例から **Agent Builder 枠1本・Copilot Studio 枠1本** を選び、1記事1事例のHTMLにして、サイト（https://tbtb-k.github.io/diary/）に公開します。

- 読み手：AI を使い始めたばかりの人。非エンジニア前提で、専門用語には必ず一言そえます。
- 公開先：`tbtb-k/diary` リポジトリの `main` ブランチ。`pages/` に置くと、トップの一覧に自動で並びます。
- リポジトリの持ち主（tbtb-k）は、このタスクで **main へ直接 push すること** を許可しています。プルリクエストは作りません。

## 成果物（1回の実行で）

| ファイル | 中身 |
|---|---|
| `pages/jirei_YYYYMMDD-agent-builder.html` | Agent Builder の事例1本 |
| `pages/jirei_YYYYMMDD-copilot-studio.html` | Copilot Studio の事例1本 |
| `.claude/skills/weekly-jirei/log.md` | 掲載済み表とネタ帳を更新 |

`YYYYMMDD` は実行日（日本時間）です。`TZ=Asia/Tokyo date +%Y%m%d` で求めます。ファイル名の `jirei_` は一覧のカテゴリになるので変えません。

## 手順

### 1. 準備

```bash
cd <diary のチェックアウト>          # 見つからなければ add_repo（owner: tbtb-k, repo: diary, access: push）で追加してクローン
git fetch origin main
git checkout -B weekly-jirei origin/main
D=$(TZ=Asia/Tokyo date +%Y%m%d)
ls pages/jirei_${D}-* 2>/dev/null     # すでにあれば今週分は作成済み。上書きせずに終了し、その旨を報告する
```

`log.md` を読み、「掲載済み」と「ネタ帳」を把握します。

### 2. 事例を選ぶ（枠ごとに1本）

1. まず `log.md` のネタ帳を見ます。次に WebSearch で新しい事例を探します。検索例：
   - `site:microsoft.com/ja-jp/customers/story エージェント ビルダー`
   - `site:microsoft.com/ja-jp/customers/story Copilot Studio エージェント`
   - `site:microsoft.com/en/customers/story "Agent Builder"`
   - `site:microsoft.com/en/customers/story Copilot Studio agent`
   - `site:microsoft.com/insidetrack/blog agent`
2. 候補の本文を **WebFetch で必ず読みます**。検索結果の要約だけで数字や事実を書いてはいけません。
3. 次の条件で1本ずつ選びます。
   - 本文にツール名が明記されている。Agent Builder 枠は「Agent Builder」「エージェント ビルダー」、または旧称の「Copilot Studio agent builder」「Copilot Studio lite」の記載があるもの。Copilot Studio 枠は Copilot Studio でエージェントを作ったもの。
   - 困りごと（before）と変化（after）が書ける。数字があればなお良い。
   - 新しいもの優先（公開から1年以内が目安）。
   - 「掲載済み」と同じ事例は選ばない。同じ組織が2週続かないようにする。日本と海外の事例がかたよらないようにする。
4. 条件を満たす事例が見つからない枠は、無理に作らず、その枠を休みにして報告に書きます。**事例をでっち上げたり、別の事例の数字を混ぜたりしないでください。**

**ネットワークの制約（2026-09 時点）**：本文を読めるのは `www.microsoft.com` だけです。learn / news / adoption / ukstories.microsoft.com、techcommunity、日本のメディア（ITmedia・日経など）はブロックされます。読めないページを出典にしてはいけません。ブロックされたら、そのホスト名を報告に書きます。

### 3. 記事を書く

`assets/template.html` をコピーし、`{{ }}` を差し替えます。`<style>` と構造は変えません。見本は `pages/jirei_20260928-agent-builder.html` と `pages/jirei_20260928-copilot-studio.html` です。

記事は次の8ブロックを、この順番で必ずそろえます。

1. **タイトル**：何がどう変わったかが分かる形（例：「出張規程への問い合わせメールが9割減りました」）。ツール名だけのタイトルにしない。`<title>` と `<h1>` は同じ文にします（一覧のカード見出しになります）。
2. **リード（3文）**：誰が何に困っていて、何をして、どうなったか。
3. **01 こんな場面、ありませんか**：読み手が「あるある」と思える具体的な場面。
4. **02 やってみたこと**：ツールの一言説明と流れ。**流れ図（3〜5個のボックス）を1つ**入れ、手順を3〜5ステップで書く。
5. **03 どう変わったか**：これまで／いま を並べる。数字には「〇〇が公表した数字です」と出どころを書く。数字がなければ「公表されていません」と書く。
6. **04 明日から試すには**：読み手が最初にやる3ステップ。準備物と「ライセンスや社内設定で変わる」の一言も。
7. **05 つまずきやすいところ**：出典にある苦労・注意点と、権限・機密情報・AI の間違いへの注意。
8. **06 おわりに**：感想で終わらせず、他の業務にも応用できる形に一段広げる。「自分の職場に置き換えると、〜」の段落を必ず入れる。フッターに出典（媒体名・記事タイトル・公開日・URL）と「相談窓口：○○」を残す。

文章のルール：

- **全文ですます調**。見出しも含めて常体を混ぜない。1文は60字程度まで。
- 専門用語には一言そえる（例：「SharePoint（社内の共有ファイル置き場）」「ハルシネーション（AI がもっともらしい間違いを答えること）」）。
- 誇張しない。「劇的に」「圧倒的に」は使わない。出典にないことは書かない。一般的な作り方で補った手順には、テンプレートの注記（`src-note`）を残す。
- プロンプト全文や画面スクリーンショットは載せない。画像ファイルや外部CSS・外部スクリプトは使わない（HTML1ファイルで完結）。
- 個人名は入れず、役職で書く（例：「CFO（最高財務責任者）は〜」）。組織名は、公開されている事例の範囲で書いてよい。
- リポジトリは公開（Public）です。持ち主の勤務先・案件名・お客様名など、出典にない固有の情報は入れない。
- 英語の出典は、自然な日本語に訳して書く。引用する発言は短く、意訳であることが分かる書き方にする。

アカウントに `ai-usecase-share` スキルがある場合は、その文体ルールにも従います（保存先とファイル名だけは、このスキルの規則を優先します）。

### 4. 仕上げ前のチェック

- [ ] ファイル名が `pages/jirei_YYYYMMDD-agent-builder.html` / `pages/jirei_YYYYMMDD-copilot-studio.html`（`.html.html` になっていない）
- [ ] `{{` が残っていない（`grep -n '{{' pages/jirei_${D}-*.html` が空）
- [ ] 8ブロックがこの順番でそろい、流れ図が1つ入っている
- [ ] 全文ですます調。専門用語に説明がある
- [ ] 数字・固有名詞がすべて出典の本文と一致している（もう一度 WebFetch で照合する）
- [ ] 出典の公開日と URL がフッターにある
- [ ] 外部ファイル参照がない（`grep -nE '<(link|script|img)' pages/jirei_${D}-*.html` が空）
- [ ] HTML が壊れていない（`python3 -c "import html.parser,sys;[html.parser.HTMLParser().feed(open(f,encoding='utf-8').read()) for f in sys.argv[1:]]" pages/jirei_${D}-*.html`）

### 5. 記録を更新する

`log.md` の「掲載済み」に2行を足し、使った候補をネタ帳から消します。本文を読んだが今回使わなかった良い候補があれば、ネタ帳に「本文確認済み」で足しておきます。「実行メモ」に、気づいたこと（ブロックされたホストなど）を1行残します。

### 6. 公開する（main に push）

```bash
git add pages/jirei_${D}-agent-builder.html pages/jirei_${D}-copilot-studio.html .claude/skills/weekly-jirei/log.md
git commit -m "Add weekly case studies ${D} (Agent Builder / Copilot Studio)"
git push origin HEAD:main
```

- push が「non-fast-forward」で断られたら、`git pull --rebase origin main` をしてから、もう一度 push します（自分の新しいコミットだけなので問題ありません）。
- ネットワークエラーのときだけ、2秒・4秒・8秒・16秒と間をあけて最大4回やり直します。
- force push はしません。main 以外のファイル（既存のページなど）は変更しません。
- セッションに指定の作業ブランチがあれば、同じコミットをそちらにも push してかまいません。

公開後、数分でサイトに反映されます。

### 7. 最後に報告する

この報告は、持ち主のスマホとメールに通知として届きます。短く、次の形で書きます。

```
今週の事例を公開しました 🎉
・Agent Builder：<タイトル>（<組織名>）
  https://tbtb-k.github.io/diary/pages/jirei_YYYYMMDD-agent-builder.html
・Copilot Studio：<タイトル>（<組織名>）
  https://tbtb-k.github.io/diary/pages/jirei_YYYYMMDD-copilot-studio.html
補った点：<出典になく自分で補った箇所を1〜3点。なければ「なし」>
```

休みにした枠、ブロックされたホスト、push の失敗などがあれば、最後に1〜2行で添えます。
