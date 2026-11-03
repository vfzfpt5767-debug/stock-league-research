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

## そのあとは自動

- 平日の夕方（日本時間 18:37ごろ）に、株価と指標が自動で更新されます
- `config/stocks.csv` を編集して保存したときも、自動でデータが作り直されます

## うまくいかないとき

| 症状 | 原因と対処 |
|---|---|
| 「データ更新と公開」に赤い × が付き、`deploy` のところで止まっている | 手順1（Source を GitHub Actions にする）がまだです。設定してから手順2をもう一度 |
| ページを開くと 404 | 公開には数分かかります。手順2の実行が緑の ✓ になってから開き直す |
| 「テスト」に赤い × | `config/stocks.csv` の書き方の間違いなど。× を押すと、どの行が問題かが表示されます |
| 平日なのに数字が古い | GitHub Actions が混雑して遅れることがあります。手順2で手動実行もできます |
