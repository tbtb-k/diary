# はじめての一棟 ― 住宅営業3Dシミュレーター

新人の住宅営業になって、3D のモデルハウスでお客様を接客する研修ゲームです。
お出迎え → ヒアリング → ご案内 → プラン・資金計画の提案 → クロージングを体験し、
最後に 5 つの力（信頼づくり・ヒアリング・提案・資金計画・クロージング）で採点されます。
成約すると、提案した家が更地から建っていきます。

- 遊ぶページ：`pages/game_jutaku-eigyo.html`
- このフォルダ：ゲームのプログラムとデータ一式

## 動かし方

- **Web に置く場合**：`game_jutaku-eigyo.html` と `jutaku-eigyo/` フォルダを同じ場所に置くだけです。
- **手元で動かす場合**：同じ 2 つをコピーして、HTML をダブルクリックで開けます（Web サーバーは不要）。
- インストールもビルドも要りません。外部への通信は行わず、記録はそのブラウザの中だけに保存されます。
- 推奨は PC の Chrome / Edge / Safari / Firefox の新しい版。スマホでも動きますが、画面の広い PC が快適です。
- 動きが重いときは、タイトルの「設定」→「画質」を「軽い」にしてください（重い端末では自動でも下がります）。

## 自社向けに書き換える

| 書き換えたいもの | ファイル |
|---|---|
| 会社名、オプションの名前と価格、金利、諸費用の割合、コンプライアンスの解説文 | `js/data-config.js` |
| お客様 3 組のセリフ・選択肢・先輩の解説・ニーズ・予算 | `js/data-scenarios.js` |

どちらもファイルの冒頭に書き方の説明があります。
**金額・金利・法令の説明はすべて練習用のサンプルです。** 実際の研修で使うときは、
自社の商品・価格・コンプライアンス規程に合わせて必ず見直してください。

## フォルダの中身

| 場所 | 内容 |
|---|---|
| `js/core.js` | 土台（時間の管理・データ読み込み・描画・カメラ） |
| `js/materials.js` | 床の木目や壁などの質感を、画像ファイルなしで計算して作る |
| `js/world.js` | 3D の共通部品（形を組み立てる道具・空・木・光の時間帯） |
| `js/house.js` | モデルハウスの室内 |
| `js/lot.js` | 敷地と「提案する家」の外観、建築タイムラプス |
| `js/people.js` | 人物（モーション・表情・視線・歩行） |
| `js/ui.js` | 画面の部品（会話・選択肢・カルテ・プランづくり） |
| `js/game.js` | 進行と採点、結果、研修レポート |
| `js/audio.js` | 効果音と BGM（その場で音を合成） |
| `models/` | 人物 10 人とモーション（変換済みデータ） |
| `vendor/` | three.js 本体と追加機能を 1 つにまとめたもの |
| `tools/` | `models/` と `vendor/` を作り直すための道具 |
| `tests/check-data.js` | シナリオと設定のつじつまチェック |
| `tests/playtest.js` | 自動で最後まで遊ぶテスト |

## 書き換えたあとの確認

シナリオや設定を書き換えたら、次の 2 つを実行してください。

```bash
node pages/jutaku-eigyo/tests/check-data.js
```

ID の書きまちがい、聞き出す手段のないニーズ、セリフの抜けなどを数秒で見つけます（ブラウザ不要）。

```bash
node pages/jutaku-eigyo/tests/playtest.js
```

3 組のお客様を「うまい人・ふつうの人・へたな人」の 3 通りで最後まで自動で遊び、
途中でエラーが出ないこと、うまい人は成約・へたな人は失注になることを確かめます（数分かかります）。

## 研修で使うときの機能

- **研修レポート**：タイトルの「研修レポート」から、成績・よかった点・次に生かす点・コンプライアンスに関わる発言を印刷（PDF 保存）できます。
- **講師用ガイド**：タイトルの「講師用ガイド」から、3 組それぞれのニーズ一覧・模範解答・解説を印刷できます。シナリオのデータから自動で作るので、書き換えても内容がずれません。
- **先輩のひとこと**：選ぶたびに理由を解説します。「設定」でオフにすると、本番に近い形で力試しができます。

## 人物データを作り直す（出演者やモーションを変えたいとき）

元データは Microsoft Rocketbox Avatar Library です。出演者は `tools/build-assets.cjs` の `CAST`、
モーションは `ANIMS` に並んでいます。

```bash
# 1. 元データを取得（とても大きいので、必要なフォルダだけ取り出す）
git clone --depth 1 --filter=blob:none --sparse https://github.com/microsoft/Microsoft-Rocketbox
# 2. 変換に使う道具を入れる
npm install three@0.187.0 esbuild @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions sharp playwright
# 3. 変換
node tools/build-assets.cjs avatars --src <Rocketbox>/Assets --three node_modules/three
node tools/build-assets.cjs anims   --src <Rocketbox>/Assets --three node_modules/three
# three.js のまとめ直し
npx esbuild tools/vendor-entry.js --bundle --format=iife --minify --target=es2020 --outfile=vendor/three-bundle.min.js
```

## 使っているもの

- [three.js](https://threejs.org/) r187（MIT ライセンス）… 3D の描画
- [Microsoft Rocketbox Avatar Library](https://github.com/microsoft/Microsoft-Rocketbox)（MIT ライセンス）… 人物モデルとモーション

ライセンスの全文は [`NOTICE.md`](NOTICE.md) にあります。登場する会社名・人物名はすべて架空です。

このゲームは Claude Code（Anthropic の AI）が制作しました。
