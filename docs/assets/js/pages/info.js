import { store, esc, help, themeColor, loadNews } from '../ui.js';
import { GLOSSARY } from '../glossary.js';

export async function renderNews(app, query) {
  document.title = 'ニュース｜テーマ別 銘柄リサーチ';
  const params = new URLSearchParams(query || '');
  let cur = params.get('theme') || store.themes[0]?.id;
  app.innerHTML = `
    <div class="page-head">
      <div class="breadcrumb"><a href="#/">ホーム</a> › ニュース</div>
      <h1>テーマのニュース（各社の最近の発表）</h1>
      <p>テーマの候補企業が出した<b>適時開示</b>${help('disclosure')}（決算・新しい事業・設備投資・自社株買いなどの公式発表）の見出しを、新しい順に並べています。見出しを押すと原文（IR BANK経由）を開けます。</p>
      <p class="small muted">ニュースサイトの見出しは、利用規約や robots.txt で自動収集が禁止・制限されているものが多いため集めていません（くわしくは<a href="#/about">データについて</a>）。新聞記事は、STOCKリーグ参加者向けに配布されている日経電子版などで探してください。</p>
    </div>
    <div class="row" role="group" aria-label="テーマ">
      ${store.themes.map((t) => `<button type="button" class="chip" data-t="${t.id}" aria-pressed="${t.id === cur}"><span class="dot" style="background:${themeColor(t.id)}"></span>${esc(t.short_name)}</button>`).join('')}
    </div>
    <section class="card" style="margin-top:12px"><div id="news">読み込み中…</div></section>
  `;
  const news = await loadNews();
  const draw = () => {
    const items = news.themes?.[cur] || [];
    document.getElementById('news').innerHTML = items.length
      ? `<ul class="news-list">${items.map((n) => `<li><span class="date">${esc(n.date.replaceAll('-', '/'))}</span><a href="${esc(n.url)}" rel="noopener">${esc(n.title)}</a><span class="who"><a href="#/stock/${esc(n.code)}">${esc(n.name)}</a>（${esc(n.code)}）</span></li>`).join('')}</ul>
         <p class="small muted">出典：IR BANK（各社の適時開示の一覧）。集めた日：${esc((news.generated_at || '').slice(0, 10).replaceAll('-', '/'))}。1回の自動更新で数十社ずつ順番に取り直しています。</p>`
      : '<p class="muted">まだ集めていません。</p>';
  };
  draw();
  app.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => {
    cur = b.dataset.t;
    app.querySelectorAll('[data-t]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.t === cur));
    history.replaceState(null, '', `#/news?theme=${cur}`);
    draw();
  }));
}

export function renderGlossary(app) {
  document.title = '用語集｜テーマ別 銘柄リサーチ';
  app.innerHTML = `
    <div class="page-head">
      <div class="breadcrumb"><a href="#/">ホーム</a> › 用語集</div>
      <h1>用語集</h1>
      <p>このサイトに出てくる言葉の説明です。各ページの <span class="help" aria-hidden="true">?</span> を押しても同じ説明が出ます。</p>
    </div>
    <div class="grid grid-2">
      ${Object.entries(GLOSSARY).map(([k, g]) => `<section class="card" id="g-${k}"><h3 style="margin-top:0">${esc(g.term)}</h3><p style="margin:0">${esc(g.text)}</p></section>`).join('')}
    </div>`;
}

export function renderAbout(app) {
  document.title = 'データについて｜テーマ別 銘柄リサーチ';
  const m = store.meta;
  const repo = 'https://github.com/vfzfpt5767-debug/stock-league-research';
  app.innerHTML = `
    <div class="page-head">
      <div class="breadcrumb"><a href="#/">ホーム</a> › データについて</div>
      <h1>データについて・使い方の注意</h1>
      <p class="disclaimer">このページは学習目的の資料であり、投資の助言ではありません。特定の銘柄の売買を勧めるものではありません。</p>
    </div>

    <section class="card">
      <h2 style="margin-top:0">データの出どころ</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>データ</th><th>出どころ</th><th>利用条件の確認（2026/11/03）</th></tr></thead>
        <tbody>
          <tr><td>株価（前営業日の終値・日足／週足）、時価総額、PER、PBR、配当利回り、ROE</td><td><a href="https://irbank.net/" rel="noopener">IR BANK</a></td><td>robots.txt で自動取得を許可。ダウンロードページに「Web公開で利用の際はリンク必須」「過剰アクセス禁止」とあるため、各ページにリンクを付け、3〜10秒の間隔を空けてアクセスし、結果を保存して再利用しています。</td></tr>
          <tr><td>売上高・営業利益・純利益・EPS・BPS・1株配当（年度ごと）</td><td>IR BANK「決算・財務データ（全銘柄一括CSV）」</td><td>同上。週1回だけ取得。</td></tr>
          <tr><td>最近の主な出来事・テーマのニュース（適時開示の見出し）</td><td>IR BANK（各社の適時開示の一覧）</td><td>同上。1回の更新で取り直すのは最大40社まで。</td></tr>
          <tr><td>業種・決算日</td><td><a href="https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/WZEK0030.html" rel="noopener">金融庁 EDINET（EDINETコードリスト）</a></td><td>公共データ利用規約（PDL1.0）。出典を明記し、業種・決算日の列だけを抜き出して加工しています。</td></tr>
          <tr><td>ルール</td><td><a href="https://manabow.com/sl/" rel="noopener">日経STOCKリーグ公式（man@bow）</a></td><td>要点を要約し、出典を明記（<a href="#/rules">ルール</a>）。</td></tr>
          <tr><td>テーマとの関係の一言</td><td>Wikipedia・各社の発表・報道など（各銘柄に出典リンク）</td><td>本文に根拠となる語句があることを確認して作成。</td></tr>
        </tbody>
      </table></div>
      <h3>使っていないデータと理由</h3>
      <ul class="small">
        <li><b>Yahoo! Finance（米国）</b>：株価APIの robots.txt が全面的に自動取得を禁止しているため。</li>
        <li><b>Google Finance</b>：免責事項でデータのダウンロード・保存・再配布が禁止されているため。</li>
        <li><b>J-Quants（JPX公式API）</b>：無料プランでは直近12週間の株価が取れず、公開ページへの表示も認められていないため。</li>
        <li><b>JPX（日本取引所グループ）のサイトのデータ</b>（TOPIXの値・市場区分など）：サイトの規約で許可のない二次利用・再配信が禁止されているため、自動では表示していません。銘柄コードが上場銘柄として実在するかのチェックにだけ使っています。TOPIXとの比較は、<a href="#/portfolio">ポートフォリオ試算</a>で各自が公式資料の数字を入力する方式です。</li>
        <li><b>ニュースサイト・Google ニュース</b>：robots.txt や利用規約で自動収集が禁止・制限されているため。</li>
        <li>Yahoo!ファイナンス（日本）、株探、Stooq：利用規約を確認できなかったため（確認できないものは使わない方針）。</li>
      </ul>
    </section>

    <section class="card">
      <h2 style="margin-top:0">更新のしくみ</h2>
      <ul>
        <li>平日の18:30ごろ（日本時間）に GitHub Actions で自動更新します（混雑で遅れることがあります）。</li>
        <li>最終更新：${esc((m.generated_at || '').replace('T', ' ').slice(0, 16))}／データ：${esc((m.data_date || '').replaceAll('-', '/'))} 時点／今回のアクセス回数：${m.requests ?? '—'}回</li>
      </ul>
      ${(m.warnings || []).length ? `<details><summary>取得時の注意（${m.warnings.length}件）</summary><ul class="small">${m.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>` : '<p class="small muted">前回の更新で注意はありませんでした。</p>'}
    </section>

    <section class="card">
      <h2 style="margin-top:0">計算のしかた</h2>
      <ul class="small">
        <li><b>騰落率</b>：最新の終値 ÷「1年（3年）前以前で最も近い週の終値」− 1。配当は含みません。</li>
        <li><b>値動きの大きさ</b>：週ごとの変化率の標準偏差 × √52（年率）。1年は約52週、3年は約156週を使います。</li>
        <li><b>最大下落率</b>：過去3年の週の終値で、それまでの最高値からの最大の落ち込み。</li>
        <li><b>売上の成長率</b>：(最新年度の売上 ÷ 3年度前の売上)^(1/3) − 1。</li>
        <li><b>テーマの数字</b>：候補銘柄の中央値。PERの中央値は赤字（計算できない）の会社を除いています。</li>
        <li><b>ポートフォリオの過去の値動き</b>：今の金額の割合で期間の最初に買い、そのまま持ち続けた場合。期間の最初に株価がない銘柄は除きます。</li>
        <li><b>株数</b>：金額 ÷（株価 × 1.011）を売買単位で切り捨て。STOCKリーグでは注文日の終値で約定するため、実際とはずれます。</li>
      </ul>
    </section>

    <section class="card" id="edit">
      <h2 style="margin-top:0">テーマ・銘柄を追加・削除するには（スマホでもできます）</h2>
      <ol class="steps">
        <li>GitHub で <a href="${repo}/blob/main/config/stocks.csv" rel="noopener">config/stocks.csv</a> を開き、鉛筆マーク（Edit）を押します。</li>
        <li>1行が「テーマ×銘柄」1件です。<code>theme_id,code,name,reason,business,source_title,source_url,note</code> の順に、カンマ区切りで書きます。文章の中にカンマ「,」を入れたいときは、その欄を <code>"</code> で囲みます。</li>
        <li>削除するときは、その行を消します。テーマ自体を休ませるときは <a href="${repo}/blob/main/config/themes.csv" rel="noopener">config/themes.csv</a> の <code>enabled</code> を 0 にします。テーマを増やすときは themes.csv に1行足します。</li>
        <li>「Commit changes」を押して保存すると、数分〜十数分で自動的にデータが作り直されます（GitHub の「Actions」タブで進み具合を見られます）。</li>
        <li>書き方を間違えると、Actions に赤い×が付き、どの行が問題かが表示されます。</li>
      </ol>
    </section>

    <section class="card">
      <h2 style="margin-top:0">このサイトのしくみ</h2>
      <p class="small">プログラムとデータは <a href="${repo}" rel="noopener">GitHub のリポジトリ</a> にあります。グラフの表示には <a href="https://www.chartjs.org/" rel="noopener">Chart.js</a>（MITライセンス）を使っています。検索エンジンには載らない設定にしています（URLを知っている人だけが見る想定）。</p>
    </section>
  `;
}
