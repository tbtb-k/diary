# weekly-jirei の記録

毎回の実行で読み書きするファイルです。「掲載済み」にある事例は選びません。

## 掲載済み

| 掲載日 | 枠 | 組織 | ファイル | 出典URL |
|---|---|---|---|---|
| 2026-09-28 | Agent Builder | 東京建物 | pages/jirei_20260928-agent-builder.html | https://www.microsoft.com/ja-jp/customers/story/26555-tokyo-tatemono-microsoft-365 |
| 2026-09-28 | Copilot Studio | カナダ公務員委員会（PSC） | pages/jirei_20260928-copilot-studio.html | https://www.microsoft.com/en/customers/story/26864-public-service-commission-of-canada-microsoft-365-copilot |
| 2026-10-02 | Agent Builder | HCLTech | pages/jirei_20261002-agent-builder.html | https://techcommunity.microsoft.com/blog/microsoft-copilot-blog/change-management-best-practices-to-drive-value-with-agent-builder/4559753 |
| 2026-10-02 | Copilot Studio | Premera Blue Cross | pages/jirei_20261002-copilot-studio.html | https://www.microsoft.com/en/customers/story/26405-premera-blue-cross-microsoft-365 |
| 2026-10-03 | Agent Builder | 人事院 | pages/jirei_20261003-agent-builder.html | https://www.microsoft.com/ja-jp/customers/story/26988-national-personnel-authority-microsoft-365-copilot |
| 2026-10-03 | Copilot Studio | りそなグループ | pages/jirei_20261003-copilot-studio.html | https://www.microsoft.com/ja-jp/customers/story/26717-resona-holdings-microsoft-copilot-studio |
| 2026-10-05 | Agent Builder | Microsoft（社内・Inside Track） | pages/jirei_20261005-agent-builder.html | https://www.microsoft.com/insidetrack/blog/how-our-employees-are-extending-enterprise-ai-with-custom-retrieval-agents/ |
| 2026-10-05 | Copilot Studio | AGCO | pages/jirei_20261005-copilot-studio.html | https://www.microsoft.com/en/customers/story/26836-agco-corp-word |
| 2026-10-07 | Copilot Studio | Coca-Cola Andina | pages/jirei_20261007-copilot-studio.html | https://www.microsoft.com/en/customers/story/26256-coca-cola-andina-microsoft-copilot-studio |
| 2026-10-07 | Copilot Studio（Agent Builder 枠の代替） | Unifi | pages/jirei_20261007-copilot-studio-2.html | https://www.microsoft.com/en/customers/story/26265-unifi-microsoft-copilot-studio |
| 2026-10-09 | Copilot Studio | カコムス | pages/jirei_20261009-copilot-studio.html | https://techtarget.itmedia.co.jp/tt/article/2609/23/2000001555/ |
| 2026-10-09 | Copilot Studio（Agent Builder 枠の代替） | Microsoft（Ask Microsoft） | pages/jirei_20261009-copilot-studio-2.html | https://www.microsoft.com/en/customers/story/26166-microsoft-microsoft-copilot-studio |

## ネタ帳（候補）

使う前に必ず本文を WebFetch で読み直してください。「本文確認済み」はカッコ内の公開日の記事を、実際に開いて中身を読んだもの、「未確認」は検索結果の要約だけで見つけたものです。使った候補はここから消し、「掲載済み」に移します。

- **Copilot Studio**｜Capita（2025-09-10 公開、本文確認済み）
  https://www.microsoft.com/en/customers/story/25164-capita-microsoft-copilot-studio/
  メール仕分けエージェント（返信時間60%短縮）、70,000件のエージェント利用。詳細は薄め。
- **Copilot Studio**｜OBC（2026-04-06 公開、本文は一部確認）
  https://www.microsoft.com/ja-jp/customers/story/26323-obc-microsoft-365-copilot
  Copilot Studio での内製開発が中心。Agent Builder 枠には不向き（下の「見送り」参照）。
- **Agent Builder?**｜Hiscox（未確認）
  社員約3,500人が6,000体以上のエージェントを作成、3時間 → 約20分の例あり（検索要約）。一次情報の ukstories.microsoft.com は、ネットワーク許可後も相手のサイト側（Cloudflare）に断られて読めません（2026-10-02）。

- **Agent Builder?**｜キリングループ（2026-05-12 公開、本文確認済み）
  https://www.microsoft.com/ja-jp/customers/story/26435-kirin-holdings-company-microsoft-365-copilot
  Agent Builder は一言のみ（「習熟はそこまで難しくない」）。Copilot 普及施策の事例としては厚い。Agent Builder 枠には弱い。

### 見送り（Agent Builder 枠としては記事にならない。読み直さなくてよい）

- OBC（2026-04-06）：「エージェントビルダー」は回答文を整えるツールづくりに一言出てくるだけ。
- Capita（2025-09-10）：「全社員に Agent Builder を開放した」の一文だけで、具体的なエージェントの話がない。
- NTTドコモ（2026-05-14）https://www.microsoft.com/ja-jp/customers/story/26409-ntt-docomo-microsoft-365-e5 ：部長14人が「上長エージェント」を作成したが、使ったツールの記載がない。

## 実行メモ

- 2026-09-28：初回は手作業で作成。本文を読めたのは www.microsoft.com だけでした（learn / news / adoption / ukstories.microsoft.com、techcommunity、日本のメディアはネットワーク制限で読めず）。
- 2026-10-02：配信を「毎週月曜」から「2日に1回（奇数日の朝 8:50）・毎回2本」に変更。Agent Builder の候補（OBC・Capita・NTTドコモ）を読んだが、どれも Agent Builder 枠には不向きだった。
- 2026-10-02：環境のネットワークを Custom（`*.microsoft.com`・`*.itmedia.co.jp`・`xtech.nikkei.com` を追加）に変更。learn.microsoft.com・techcommunity・TechTarget ジャパン・日経クロステックは読めるようになった。news.microsoft.com と ukstories.microsoft.com は相手側の Cloudflare に断られる。
- 2026-10-02：Agent Builder 枠は HCLTech（techcommunity の Microsoft ブログ）。WebFetch は本文を返さなかったため、`curl -sL --compressed -A "Mozilla/5.0"` で取得し、HTML 内の JSON の body から本文を読んだ。HCLTech は社内展開（採用促進）の事例で、個別エージェントの中身の話ではない。
- 2026-10-03：Agent Builder 枠は人事院（ja-jp の顧客事例を WebFetch で読めた。検索の候補にはほかに SCSK・キリン等があるが未確認）。Copilot Studio 枠はネタ帳のりそなグループ。ブロックされたホストはなし。日本時間では実行日が10-03（偶数日の前日の奇数ではない）だった。
- 2026-10-05：Agent Builder 枠は Microsoft Inside Track（2025-03-20、予備だったもの。数字なし）。ja-jp 顧客事例の検索では INPEX・SCSK・キリンを読んだが、Agent Builder と明記された具体例がなく見送り。Agent Builder 枠の新しい事例は枯渇気味。Copilot Studio 枠は AGCO。ブロックされたホストなし（curl で ja-jp ページは本文が取れなかったので WebFetch を使用）。
- 2026-10-07：Agent Builder 枠は、本文を読めて Agent Builder と明記された事例が見つからず、Copilot Studio を2本（Coca-Cola Andina、Unifi）にした。確認したが不採用：Inside Track 3本（2024-12-19 extensibility、2025-02-06 Copilot Studio、2026-07-30 AI value。Agent Builder の具体例なし）、adoption.microsoft.com の agent-transformation-stories（Agent Builder の明記なし）。blog.jbs.co.jp は egress proxy でブロック。ukstories は未確認のまま。
- 2026-10-09：Agent Builder 枠は、WebSearch（標準・拡張）でも顧客事例が出ず、Copilot Studio を2本（カコムス、Microsoft 自社の Ask Microsoft）にした。ブロックされたホストなし。
