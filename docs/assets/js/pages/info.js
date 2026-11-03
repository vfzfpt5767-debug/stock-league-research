import { store, esc, help, themeColor } from '../ui.js';
import { GLOSSARY } from '../glossary.js';

// テーマごとの公式な情報源（リンクのみ。自動で記事を集めてはいない）
const COMMON = [
  { label: '日経電子版（STOCKリーグ参加者は申込で利用可）', url: 'https://www.nikkei.com/' },
  { label: 'TDnet 適時開示情報閲覧サービス（会社の公式発表）', url: 'https://www.release.tdnet.info/inbs/I_main_00.html' },
  { label: 'EDINET（有価証券報告書など）', url: 'https://disclosure2.edinet-fsa.go.jp/WEEK0010.aspx' },
];
const OFFICIAL = {
  resources: [
    { label: '資源エネルギー庁', url: 'https://www.enecho.meti.go.jp/' },
    { label: 'JOGMEC（エネルギー・金属鉱物資源機構）', url: 'https://www.jogmec.go.jp/' },
    { label: '林野庁（森林・木材）', url: 'https://www.rinya.maff.go.jp/' },
  ],
  decarbon: [
    { label: '環境省 報道発表', url: 'https://www.env.go.jp/press/' },
    { label: '経済産業省 ニュースリリース', url: 'https://www.meti.go.jp/press/index.html' },
    { label: 'NEDO（新エネルギー・産業技術総合開発機構）', url: 'https://www.nedo.go.jp/' },
  ],
  raremetal: [
    { label: 'JOGMEC 金属資源情報', url: 'https://mric.jogmec.go.jp/' },
    { label: '経済産業省 ニュースリリース', url: 'https://www.meti.go.jp/press/index.html' },
    { label: 'JAMSTEC（海洋研究開発機構）', url: 'https://www.jamstec.go.jp/' },
  ],
  semicon: [
    { label: '経済産業省 ニュースリリース', url: 'https://www.meti.go.jp/press/index.html' },
    { label: 'NEDO（新エネルギー・産業技術総合開発機構）', url: 'https://www.nedo.go.jp/' },
    { label: '熊本県（半導体関連の取り組み）', url: 'https://www.pref.kumamoto.jp/' },
  ],
  energy: [
    { label: '資源エネルギー庁', url: 'https://www.enecho.meti.go.jp/' },
    { label: '電力広域的運営推進機関（OCCTO）', url: 'https://www.occto.or.jp/' },
    { label: '原子力規制委員会', url: 'https://www.nra.go.jp/' },
  ],
};

export async function renderNews(app, query) {
  document.title = '情報の探し方｜テーマ別 銘柄リサーチ';
  const params = new URLSearchParams(query || '');
  let cur = params.get('theme') || store.themes[0]?.id;
  app.innerHTML = `
    <div class="page-head">
      <div class="breadcrumb"><a href="#/">ホーム</a> › 情報の探し方</div>
      <h1>テーマの最新情報の探し方</h1>
      <p>ニュースサイトの見出しは、利用規約や robots.txt（自動アクセスのルール）で自動収集が禁止・制限されているものが多いため、このサイトでは自動で集めていません（<a href="#/about">くわしく</a>）。
      かわりに、テーマごとの<b>公式な情報源</b>と、<b>日経電子版などで検索するときのキーワード</b>をまとめました。${store.hasFin ? '候補企業が金融庁 EDINET に出した書類の一覧も載せています。' : ''}</p>
    </div>
    <div class="row" role="group" aria-label="テーマ">
      ${store.themes.map((t) => `<button type="button" class="chip" data-t="${t.id}" aria-pressed="${t.id === cur}"><span class="dot" style="background:${themeColor(t.id)}"></span>${esc(t.short_name)}</button>`).join('')}
    </div>
    <div id="news" style="margin-top:12px"></div>
  `;
  const draw = () => {
    const t = store.themes.find((x) => x.id === cur);
    const filings = store.stocks.filter((s) => s.themes.includes(cur))
      .flatMap((s) => (s.filings || []).map((f) => ({ ...f, code: s.code, name: s.name })))
      .sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 30);
    document.getElementById('news').innerHTML = `
      <section class="card">
        <h2 style="margin-top:0">検索するときのキーワード</h2>
        <div class="row">${(t.news_keywords || []).map((k) => `<span class="badge">${esc(k)}</span>`).join('')}</div>
        <p class="small muted" style="margin-top:8px">日経電子版・新聞・会社のニュースリリースで、これらの言葉と会社名を組み合わせて探してみてください。</p>
      </section>
      <section class="card">
        <h2 style="margin-top:0">公式な情報源</h2>
        <ul>${[...(OFFICIAL[cur] || []), ...COMMON].map((l) => `<li><a href="${esc(l.url)}" rel="noopener" target="_blank">${esc(l.label)} ↗</a></li>`).join('')}</ul>
      </section>
      ${store.hasFin ? `<section class="card">
        <h2 style="margin-top:0">候補企業の最近の提出書類（EDINET）${help('filing')}</h2>
        ${filings.length ? `<ul class="news-list">${filings.map((n) => `<li><span class="date">${esc(n.date.replaceAll('-', '/'))}</span><a href="${esc(n.url)}" rel="noopener" target="_blank">${esc(n.title)}</a><span class="who"><a href="#/stock/${esc(n.code)}">${esc(n.name)}</a>（${esc(n.code)}）</span></li>`).join('')}</ul><p class="small muted">出典：金融庁 EDINET</p>` : '<p class="muted">まだありません。</p>'}
      </section>` : ''}`;
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
      <p>このサイトや、株価サイト・決算資料に出てくる言葉の説明です。各ページの <span class="help" aria-hidden="true">?</span> を押しても同じ説明が出ます。</p>
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
      <h2 style="margin-top:0">このサイトで使っているデータ</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>データ</th><th>出どころ</th><th>利用条件</th></tr></thead>
        <tbody>
          <tr><td>業種・決算日</td><td><a href="https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/WZEK0030.html" rel="noopener">金融庁 EDINET（EDINETコードリスト）</a></td><td>公共データ利用規約（PDL1.0）。出典を明記し、必要な列だけを抜き出して加工して利用。</td></tr>
          <tr><td>決算の数字（売上・純利益・ROE・1株配当・株主総利回りなど）、提出書類の一覧</td><td>金融庁 EDINET API（有価証券報告書）</td><td>同上。APIキーが登録されているときだけ自動で取得します（${store.hasFin ? '登録済み' : '<b>未登録のため、いまは表示していません</b>'}）。</td></tr>
          <tr><td>テーマとの関係の一言・事業の説明</td><td>Wikipedia・各社の発表・報道など（各銘柄に出典リンク）</td><td>本文に根拠となる語句があることを確かめて、自分たちの言葉で要約。</td></tr>
          <tr><td>ルール</td><td><a href="https://manabow.com/sl/" rel="noopener">日経STOCKリーグ公式（man@bow）</a></td><td>要点を要約し、出典を明記（<a href="#/rules">ルール</a>）。</td></tr>
          <tr><td>株価（株価メモ・ポートフォリオ試算）</td><td>利用者が自分で調べて入力した値</td><td>この端末のブラウザと、共有用のURLの中にだけ保存されます（サーバーには送りません）。</td></tr>
        </tbody>
      </table></div>
    </section>

    <section class="card">
      <h2 style="margin-top:0">株価・チャート・ニュースを自動表示していない理由</h2>
      <p>株価などの市場データは取引所などに権利があり、多くのサイトが利用規約で自動取得や再配布を禁止しています。2026年11月に確認した結果は次のとおりで、<b>規約上問題なく自動で集めて、グループ向けの公開ページに表示できるデータ源は見つかりませんでした</b>。</p>
      <ul class="small">
        <li><b>IR BANK</b>：2026年11月4日に施行された利用規約で、スクレイピング等による自動取得（公式API以外）と、データ（加工したものを含む）の再配布・公衆送信が禁止されました。公式APIのデータも「私的利用の範囲」で、データファイルとしての公開は禁止です。このため、いったん集めたデータは削除しました。</li>
        <li><b>JPX（日本取引所グループ）</b>：サイトの規約で、許諾のない二次利用・再配信が禁止されています（TOPIXの値も含む）。銘柄コードが実在するかのチェックにだけ使い、内容は保存・公開していません。</li>
        <li><b>J-Quants（JPX公式API）</b>：個人の私的利用に限られ、生データを閲覧者が見られる形で公開できません。</li>
        <li><b>Yahoo! Finance（米国）</b>：株価APIの robots.txt が自動取得を全面的に禁止しています。<b>Google Finance</b>：免責事項でデータのダウンロード・保存・再配布が禁止されています。</li>
        <li><b>ニュース</b>（Google ニュースなど）：robots.txt や規約で自動収集が禁止・制限されています。</li>
        <li>Yahoo!ファイナンス（日本）・株探・Stooq：利用規約を確認できなかったため使っていません（リンクを張るだけにしています）。</li>
      </ul>
      <p class="small">株価やチャートは、各銘柄ページのリンク先や STOCKリーグのバーチャル投資システムで確認し、必要な数字だけを「株価メモ」やポートフォリオ試算に入力して使ってください。レポートに数字を使うときは、その出典（サイト名・日付）を書きましょう。</p>
    </section>

    <section class="card">
      <h2 style="margin-top:0">更新のしくみ</h2>
      <ul>
        <li>毎週月曜の18:37ごろ（日本時間）と、設定ファイルを変更したときに GitHub Actions で自動更新します。</li>
        <li>最終更新：${esc((m.generated_at || '').replace('T', ' ').slice(0, 16))}${m.fin_latest_fy ? `／決算データの最新期：${esc(m.fin_latest_fy)}` : ''}</li>
      </ul>
      ${(m.warnings || []).length ? `<details><summary>データ作成時の注意（${m.warnings.length}件）</summary><ul class="small">${m.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>` : '<p class="small muted">前回の更新で注意はありませんでした。</p>'}
    </section>

    <section class="card">
      <h2 style="margin-top:0">計算のしかた</h2>
      <ul class="small">
        <li><b>株数</b>：金額 ÷（入力した株価 × 1.011）を売買単位で切り捨て。STOCKリーグでは注文日の終値で約定するため、実際とはずれます。</li>
        <li><b>過去と比べる</b>：今の金額の割合で、入力した過去の時点に買っていた場合の騰落率（株価のみ・配当なし）。</li>
        <li><b>売上の成長率</b>：(最新年度の売上 ÷ 3年度前の売上)^(1/3) − 1。</li>
        <li><b>株主総利回り</b>：各社が有価証券報告書で開示した値（5年前の期末＝100、配当込み）。1年・3年は、その比から計算しています。</li>
        <li><b>テーマの数字</b>：候補銘柄の中央値。</li>
      </ul>
    </section>

    <section class="card" id="edit">
      <h2 style="margin-top:0">テーマ・銘柄を追加・削除するには（スマホでもできます）</h2>
      <ol class="steps">
        <li>GitHub で <a href="${repo}/blob/main/config/stocks.csv" rel="noopener">config/stocks.csv</a> を開き、鉛筆マーク（Edit）を押します。</li>
        <li>1行が「テーマ×銘柄」1件です。<code>theme_id,code,name,reason,business,source_title,source_url,note</code> の順に、カンマ区切りで書きます。文章の中にカンマ「,」を入れたいときは、その欄を <code>"</code> で囲みます。</li>
        <li>削除するときは、その行を消します。テーマ自体を休ませるときは <a href="${repo}/blob/main/config/themes.csv" rel="noopener">config/themes.csv</a> の <code>enabled</code> を 0 にします。テーマを増やすときは themes.csv に1行足します。</li>
        <li>「Commit changes」を押して保存すると、数分で自動的にデータが作り直されます（GitHub の「Actions」タブで進み具合を見られます）。</li>
        <li>書き方を間違えると、Actions に赤い×が付き、どの行が問題かが表示されます。</li>
      </ol>
    </section>

    <section class="card">
      <h2 style="margin-top:0">このサイトのしくみ</h2>
      <p class="small">プログラムとデータは <a href="${repo}" rel="noopener">GitHub のリポジトリ</a> にあります。グラフの表示には <a href="https://www.chartjs.org/" rel="noopener">Chart.js</a>（MITライセンス）を使っています。検索エンジンには載らない設定にしています（URLを知っている人だけが見る想定）。</p>
    </section>
  `;
}
