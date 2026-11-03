import * as C from '../calc.js';
import { store, esc, help, themeColor } from '../ui.js';

export function renderHome(app) {
  document.title = 'テーマ別 銘柄リサーチ';
  const m = store.meta;
  const rules = store.rules.portfolio;
  const warnings = (m.warnings || []).length;
  const cards = store.themes.map((t) => {
    const s = store.themeSummary[t.id] || { median: {}, industries: {} };
    const inds = Object.entries(s.industries || {}).slice(0, 3).map(([k, v]) => `${esc(k)} ${v}`).join('・');
    const g = s.median?.sales_cagr_3y;
    return `
      <article class="card theme-card" style="--tc:${themeColor(t.id)}">
        <h3><a href="#/theme/${t.id}">${esc(t.name)}</a></h3>
        <p class="small ink2" style="margin:0">${esc(t.description)}</p>
        <div class="stats">
          <div>候補<b>${s.count ?? 0}社</b></div>
          <div style="grid-column:span 2">多い業種<b style="font-size:.85rem">${inds || '—'}</b></div>
        </div>
        ${C.isNum(g) ? `<div class="small ink2">売上の成長率（3年・中央値）${help('sales_cagr_3y')}：<b>${C.fmtPct(g)}</b></div>` : ''}
        <div class="row">
          <a class="btn small" href="#/theme/${t.id}">銘柄一覧と関係</a>
          <a class="btn small" href="#/compare?theme=${t.id}">比較表で見る</a>
        </div>
      </article>`;
  }).join('');

  app.innerHTML = `
    <section class="page-head">
      <h1>テーマ別 銘柄リサーチ</h1>
      <p class="lead">日経STOCKリーグ（第27回・2026年度）に向けて、<b>テーマを決める → 銘柄を選ぶ → 発表資料を作る</b>ための、グループ用の学習ページです。</p>
      <div class="notice info">
        <b>株価・PER・チャートなどの市場データは、このページでは自動表示していません。</b>
        株価のデータは取引所などの権利があり、規約上問題なく自動で集めて公開できるデータ源が見つからなかったためです（<a href="#/about">理由</a>）。
        株価は STOCKリーグのバーチャル投資システムや証券会社のサイトで確認し、<b>ポートフォリオ試算</b>や各銘柄の「株価メモ」に入力して使ってください。
        ${warnings ? `<br><a href="#/about">データ作成時の注意 ${warnings}件</a>` : ''}
      </div>
    </section>

    <section class="card">
      <h2 style="margin-top:0">使い方（おすすめの順番）</h2>
      <ol class="steps">
        <li>下の5つのテーマから気になるものを選び、「銘柄一覧と関係」で各社が<b>なぜそのテーマに関係するか</b>と出典を確認する</li>
        <li><a href="#/themes">テーマ比較</a>で、テーマごとの銘柄数・業種の内訳${store.hasFin ? '・業績' : ''}を見比べる</li>
        <li><a href="#/compare">銘柄の比較表</a>で並べ替え・絞り込みをして候補をしぼる（見出しの <span class="help" aria-hidden="true">?</span> で用語の説明）</li>
        <li>銘柄名を押して詳しく見る。株価やチャートは、ページ内のリンク（外部サイト）で確認</li>
        <li><a href="#/portfolio">ポートフォリオ試算</a>で${rules.min_stocks}〜${rules.max_stocks}銘柄・${C.fmtJpAmount(rules.budget_yen)}の組み合わせを試し（株価は自分で入力）、<b>「共有用のURLをコピー」</b>でグループに送る</li>
        <li>表やグラフの<b>「PNGで保存」</b>で横長の画像を作り、発表スライドに貼る</li>
      </ol>
    </section>

    <h2>5つのテーマ</h2>
    <div class="grid grid-3">${cards}</div>

    <section class="card" style="margin-top:16px">
      <h2 style="margin-top:0">STOCKリーグのルール（要点）</h2>
      <ul>
        <li>仮想資金 <b>${C.fmtJpAmount(rules.budget_yen)}</b> で、<b>${rules.min_stocks}銘柄以上${rules.max_stocks}銘柄以下</b>のポートフォリオを組む（範囲外だと審査対象外）</li>
        <li>売買手数料は売買代金の1％＋消費税10％（＝1.1％）${help('fee')}</li>
        <li>ポートフォリオの評価額（増えたかどうか）は審査に関係ない</li>
        <li>レポートはA4で30ページ以内のPDF。提出締切は <b>2027年1月8日（金）17:00</b></li>
        <li>リセット機能は <b>11月30日まで・2回まで</b></li>
      </ul>
      <p><a class="btn small" href="#/rules">ルールの詳細と出典（未確認の点もあり）</a></p>
    </section>
  `;
}
