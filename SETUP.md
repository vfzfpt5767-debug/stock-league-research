# はじめにやること（スマホでできます・約5分）

このページをグループに公開するために、**最初に1回だけ**次の設定が必要です。
スマホのブラウザ（Safari や Chrome）で、GitHub にログインした状態で進めてください。
（GitHub のスマホアプリには設定画面がないので、**ブラウザ**を使います）

## 1. GitHub Pages（ジーハブ・ページズ）をオンにする

GitHub Pages は、GitHub に置いたファイルを無料で Web ページとして公開するしくみです。

1. 次のURLを開く：
   https://github.com/vfzfpt5767-debug/stock-league-research/settings/pages
2. 「Build and deployment（作成と公開）」の **Source（公開のしかた）** を
   「Deploy from a branch」から **「GitHub Actions」** に変える
   - 選ぶだけで保存されます（保存ボタンはありません）
   - GitHub Actions（ジーハブ・アクションズ）は、決まった時間や変更があったときに GitHub のサーバーでプログラムを自動で動かすしくみです

## 2. 1回目の公開を手動で動かす

1. 次のURLを開く：
   https://github.com/vfzfpt5767-debug/stock-league-research/actions/workflows/update-and-deploy.yml
2. 右側の **「Run workflow」** を押し、出てきた緑の **「Run workflow」** をもう一度押す
3. 数分待つと、一覧の一番上に緑のチェック ✓ が付きます（オレンジの丸は実行中）
   - 赤い × が付いたときは、その行を押すと理由が見られます

## 3. ページを開く

https://vfzfpt5767-debug.github.io/stock-league-research/

このURLをグループの LINE などに送れば、全員が見られます。
（検索エンジンには出ない設定なので、URLを知っている人だけが見る想定です）

## 4.（任意）決算の数字を表示する：EDINET の APIキーを登録する

EDINET（エディネット）は、金融庁が運営する、会社の有価証券報告書などを公開するしくみです。
APIキー（プログラムからデータを受け取るための合言葉）を無料で発行すると、各社の売上・純利益・配当・株主総利回り（TOPIXとの比較）が自動で表示されます。

1. EDINET API の利用登録ページで登録し、APIキーを発行する
   - 金融庁「EDINET API仕様書・利用登録」の案内（https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/WZEK0110.html）から進みます
   - メールアドレスと、電話番号（SMSで届く確認コード）が必要です。パソコンのブラウザのほうが進めやすいです
2. 次のURLを開き、「New repository secret」を押す：
   https://github.com/vfzfpt5767-debug/stock-league-research/settings/secrets/actions
   - Name（名前）に `EDINET_API_KEY`、Secret（中身）に発行したキーを貼って「Add secret」
   - Secret（シークレット）は、パスワードのような秘密の値を、ファイルに書かずに安全に保存する場所です
3. 手順2のページ（Run workflow）で「EDINETの提出書類一覧を調べる日数」を **400** にして1回だけ実行する（初回だけ、過去1年分の書類を探すため。10〜20分ほどかかります）
   - この部分は APIキーがない状態で作ったため、まだ実際には動作を確認できていません。赤い × が出たら、その内容を Claude に見せてください

## そのあとは自動

- 毎週月曜の夕方（日本時間 18:37ごろ）に、EDINET の情報が自動で更新されます
- `config/stocks.csv` を編集して保存したときも、自動でデータが作り直されます
- 株価は自動では表示しません（理由はサイトの「データについて」）。株価メモとポートフォリオ試算に、自分で調べた値を入力して使います

## うまくいかないとき

| 症状 | 原因と対処 |
|---|---|
| 「データ更新と公開」に赤い × が付き、`deploy` のところで止まっている | 手順1（Source を GitHub Actions にする）がまだです。設定してから手順2をもう一度 |
| ページを開くと 404 | 公開には数分かかります。手順2の実行が緑の ✓ になってから開き直す |
| 「テスト」に赤い × | `config/stocks.csv` の書き方の間違いなど。× を押すと、どの行が問題かが表示されます |
| 決算の数字が出ない | 手順4（EDINET の APIキー）がまだか、キーの名前が `EDINET_API_KEY` になっていない |
