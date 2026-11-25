# AI Weekly 記録帳

毎号の公開記録と、実行で気づいたことのメモです。号数は「前号の番号＋1」です（試作号が No.00）。

## 発行済み

| No. | 号 | 対象期間 | ファイル | メモ |
|---|---|---|---|---|
| 00 | 2026/09/23号 | 09/16–09/22 | `pages/report_20260923.html` | 試作号。完成形の見本 |
| 01 | 2026/09/30号 | 09/23–09/29 | `pages/report_20260930.html` | 旧ルーティン作成。サイトへは手作業でアップ |
| 02 | 2026/10/07号 | 09/30–10/06 | `pages/report_20261007.html` | 旧ルーティン作成（Artifact のみ）。2026-11-17 にサイトへ追加 |
| 03 | 2026/10/14号 | 10/07–10/13 | `pages/report_20261014.html` | 同上 |
| 04 | 2026/10/21号 | 10/14–10/20 | `pages/report_20261021.html` | 同上 |
| 05 | 2026/10/28号 | 10/21–10/27 | `pages/report_20261028.html` | 同上 |
| 06 | 2026/11/04号 | 10/28–11/03 | `pages/report_20261104.html` | 同上 |
| 07 | 2026/11/11号 | 11/04–11/10 | `pages/report_20261111.html` | 同上 |
| 08 | 2026/11/18号 | 11/11–11/17 | `pages/report_20261118.html` | Ignite 初日（11/17）と M365 大規模障害（11/12–13）の週。本文 約8,700字 |
| 09 | 2026/11/25号 | 11/18–11/24 | `pages/report_20261125.html` | Ignite 後半（Copilot Studio ブログ 11/18）、ワークフロー新部品、GPT-6.2 Sol。Anthropic 上場。本文 約9,600字 |

<!-- 新しい号はこの上に1行ずつ足す（例：| 08 | 2026/11/18号 | 11/11–11/17 | `pages/report_20261118.html` | Ignite 週 | ） -->

## 続けて追いかける話題

前号の「来週以降の注目予定」に入れたものから、続報が出たら本編で拾うものです。号を出すたびに、終わったものは消し、新しいものを足します。

- 11/20 M365 大規模障害の最終版の事後レポート（MO1550821／EX1550543）→ 11/25号では信頼できる出典で本文を読めず未掲載。読めたら拾う
- Copilot Code の GA（Ignite で「数週間以内」）と、Autopilot の米国以外への展開時期（MC1557730）
- 11/30 Power Automate デザイナー内 Copilot のサポート終了（MC1540258）
- 12/01 Copilot Studio ワークフローの Python 手順 GA（MC1561862）、12/03 文書を渡す機能 GA（MC1561859）
- 12/02 Power Platform プロンプトのモデル移行・Claude／Grok 退役（MC1536101）
- 12月上旬 利用上限後に Copilot Credits でモデルを使い続ける機能の GA（MC1557754）。従量課金モデルの GA は12月上旬〜中旬（MC1519122）。Teams 会議 AI ポリシー（MeetingAI 等）の先行リリース（MC1532253、GA は2027年1月）
- 12/08 Power BI で M365 Copilot が既定で有効に（MC1546429）、Dataverse エージェントユーザー GA（MC1560996）
- 12月 Copilot Studio のエージェントアカウントのパブリックプレビュー、Teams チャネルの Copilot プレビュー（MC1562277）、Workspaces GA（MC1559638）
- 12/14 GitHub Copilot で一部の旧モデルが提供終了
- 12/17 Copilot Studio ワークフローのサービスプリンシパル認証 GA（MC1557509）
- 12/31 Power Platform 版のスケジュールされたプロンプトが終了（MC1550533）
- 2027/1 Copilot デスクトップアプリのアプリ内ブラウズが既定でオン（MC1560922、対応期限 1/3）、OneNote の新しい Copilot GA（MC1559641）

## 実行メモ

- 2026-11-17：旧ルーティン（claude.ai のチャット側で作ったもの）は Artifact を作るだけで、GitHub への push ができていなかった。Code のルーティン＋このスキルに作り直した。
- 2026-11-17：ネットワークで読めるかを確認。`mc.merill.net`・`github.blog`・`openai.com`・`blog.google`・`*.watch.impress.co.jp`・`www.publickey1.jp`・`www.kesslernity.com` は、環境の許可リストに入れるまで「CONNECT tunnel failed, response 403」で読めなかった。`www.microsoft.com`・`news.microsoft.com` は相手サイト側が自動アクセスを断ることがある（403）。
- 2026-11-17：環境（Default）の許可リストに 15 ホストを追加（`mc.merill.net`・`github.blog`・`openai.com`・`blog.google`・`workspaceupdates.googleblog.com`・`ai.watch.impress.co.jp`・`cloud.watch.impress.co.jp`・`www.watch.impress.co.jp`・`forest.watch.impress.co.jp`・`www.publickey1.jp`・`www.kesslernity.com`・`techcrunch.com`・`www.theregister.com`・`qiita.com`・`blog-en.topedia.com`）。追加後は読めることを確認。ただし `openai.com` は相手サイト側が 403 を返す → OpenAI の話題は GitHub Changelog・Microsoft の発表・報道（TechCrunch など）で裏を取る。
- 2026-11-18：`mc.merill.net` のトップページには期間内の MC／RM の一覧が埋め込まれていて（最新 約3,800件）、日付で絞ると取りこぼしにくい。Microsoft Copilot Blog は記事ページは読めたが、一覧ページは 403 のことがある。`news.microsoft.com`・`blogs.microsoft.com`・`techcrunch.com` は相手サイト（Cloudflare）が 403。`community.openai.com`・`www.cnbc.com`・`www.upi.com`・`venturebeat.com`・`borncity.com` は許可リスト外（CONNECT 403）。`cloud.watch.impress.co.jp/docs/news/` の一覧は 403 だったが、`ai.watch.impress.co.jp`・`forest.watch.impress.co.jp`・`www.theregister.com` は読めた。Tech Community の記事は gzip で返ることがある（展開すれば本文が読める）。
- 2026-11-25：mc.merill.net のトップに埋め込まれた JSON（`{"id":"MC…","title":…,"date":"YYYY-MM-DD"}`）を日付で絞ると、期間内の MC／RM を一覧できた（HTML の表は200件だけ）。各 MC ページは curl で本文が読める。`siliconangle.com`・`office-watch.com` は許可リスト外（DNS 解決できず）。Kesslernity の Copilot Weekly は W47・W48 とも 404（未公開）。Copilot Studio の Learn「What's new」は11月分が未更新（11/12時点）。M365 障害の最終版レポートは信頼できる報道で本文を確認できず、掲載を見送った。
