import { store, esc } from '../ui.js';

export function renderRules(app) {
  document.title = 'ルール｜テーマ別 銘柄リサーチ';
  const r = store.rules;
  const rows = r.items.map((it) => `
    <tr>
      <th scope="row" style="white-space:normal;min-width:9em">${esc(it.label)}</th>
      <td>${esc(it.value)}</td>
      <td><span class="badge ${it.status === '確認済み' ? 'ok' : 'warn'}">${it.status === '確認済み' ? '✓ 確認済み' : '⚠ 未確認'}</span></td>
      <td>${it.source ? `<a href="${esc(it.source)}" rel="noopener">出典</a>` : '<span class="muted">—</span>'}</td>
    </tr>`).join('');
  app.innerHTML = `
    <div class="page-head">
      <div class="breadcrumb"><a href="#/">ホーム</a> › ルール</div>
      <h1>日経STOCKリーグのルール（${esc(r.edition)}）</h1>
      <p>公式サイト「man@bow」と募集要項・説明会資料（PDF）で ${esc(r.checked_at.replaceAll('-', '/'))} に確認した要点です。
      公式資料で確認できなかった点は「未確認」としています。<b>最終的には必ず公式の資料で確認してください。</b></p>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>項目</th><th>内容</th><th>確認</th><th>出典</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <section class="card" style="margin-top:16px">
      <h2 style="margin-top:0">このサイトの計算での扱い</h2>
      <ul>
        <li><b>仮想資金・銘柄数・手数料</b>：上の確認済みの数字（500万円、10〜20銘柄、1.1％）をポートフォリオ試算に使っています。</li>
        <li><b>売買単位</b>：公式資料で確認できなかったため、100株単位（日本の取引所の標準）を初期値にし、1株単位にも切り替えられるようにしています。</li>
        <li><b>約定価格</b>：STOCKリーグでは注文した日の終値で約定します。このサイトの株価は前営業日の終値なので、実際の約定価格とはずれます。</li>
        <li><b>対象銘柄</b>：このサイトの候補は東京証券取引所に上場している国内株式だけです（海外の「日経アジア300」銘柄は入れていません）。</li>
      </ul>
    </section>
    <section class="card">
      <h2 style="margin-top:0">確認した公式資料</h2>
      <ul>${r.sources.map((s) => `<li><a href="${esc(s.url)}" rel="noopener">${esc(s.title)}</a></li>`).join('')}</ul>
    </section>
  `;
}
