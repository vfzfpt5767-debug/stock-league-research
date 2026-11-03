import * as C from '../calc.js';
import { store, esc, help, themeColor, themeColorHex, na, exportFooter, finNote } from '../ui.js';
import { barChart } from '../charts.js';
import { exportChart, exportTable } from '../export.js';

// テーマ比較で並べる指標（中央値）。決算の指標は EDINET のデータがあるときだけ出す
const ALL_METRICS = [
  { id: 'count', label: '候補の銘柄数', help: '', get: (t) => t.count, fmt: (v) => `${v}社`, note: '多いほど10〜20銘柄を選ぶときの選択肢が多い', count: true },
  { id: 'industries', label: '業種の数', help: 'industry', get: (t) => Object.keys(t.industries || {}).length, fmt: (v) => `${v}種類`, note: '多いほど業種を分散させやすい（同じ業種ばかりだと一緒に動きやすい）', count: true },
  { id: 'sales_cagr_3y', label: '売上の成長率（3年・年平均）', help: 'sales_cagr_3y', get: (t) => t.median.sales_cagr_3y, fmt: (v) => C.fmtPct(v), pct: true, note: '事業がどれだけ伸びているか', fin: true },
  { id: 'roe_actual', label: 'ROE', help: 'roe', get: (t) => t.median.roe_actual, fmt: (v) => C.fmtPctRaw(v, 1), raw: true, note: '株主のお金でどれだけ効率よく稼いでいるか', fin: true },
  { id: 'equity_ratio', label: '自己資本比率', help: 'equity_ratio', get: (t) => t.median.equity_ratio, fmt: (v) => C.fmtPctRaw(v, 1), raw: true, note: '高いほど借金が少なく、財務が安定している目安', fin: true },
  { id: 'payout_ratio', label: '配当性向', help: 'payout_ratio', get: (t) => t.median.payout_ratio, fmt: (v) => C.fmtPctRaw(v, 1), raw: true, note: '利益のうちどれだけを配当に回しているか', fin: true },
  { id: 'tsr_1y', label: '株主総利回り（1年）', help: 'tsr', get: (t) => t.median.tsr_1y, fmt: (v) => C.fmtPct(v), pct: true, note: '直近の決算期までの1年間の、配当込みの株主のもうけ（過去の結果）', fin: true },
  { id: 'tsr_3y', label: '株主総利回り（3年）', help: 'tsr', get: (t) => t.median.tsr_3y, fmt: (v) => C.fmtPct(v), pct: true, note: '直近の決算期までの3年間', fin: true },
  { id: 'tsr_5y', label: '株主総利回り（5年）', help: 'tsr', get: (t) => t.median.tsr_5y, fmt: (v) => C.fmtPct(v), pct: true, note: '直近の決算期までの5年間', fin: true },
  { id: 'tsr_5y_vs_index', label: '5年の株主総利回り − 比較指標', help: 'tsr_index', get: (t) => t.median.tsr_5y_vs_index, fmt: (v) => C.fmtPct(v), pct: true, note: 'プラスなら、各社が選んだ比較指標（多くは配当込みTOPIX）を上回った', fin: true },
];

function metrics() {
  return ALL_METRICS.filter((m) => !m.fin || store.hasFin);
}

function rows() {
  return store.themes.map((t) => {
    const s = store.themeSummary[t.id] || { median: {}, count: 0 };
    return { id: t.id, name: t.name, short: t.short_name, count: s.count ?? 0, median: s.median || {}, loss: s.loss_making ?? 0, industries: s.industries || {} };
  });
}

export function renderThemes(app) {
  document.title = 'テーマ比較｜テーマ別 銘柄リサーチ';
  const R = rows();
  const tableHead = `<tr><th class="sticky-col">指標</th>${R.map((r) => `<th class="r"><span class="badge" style="border:0;background:none;padding:0"><span class="dot" style="background:${themeColor(r.id)}"></span>${esc(r.short)}</span></th>`).join('')}</tr>`;
  const METRICS = metrics();
  const tableBody = METRICS.map((m) => `<tr><th scope="row" class="sticky-col" style="white-space:normal;min-width:11em">${esc(m.label)}${m.help ? help(m.help) : ''}${m.count ? '' : '<br><small class="muted">中央値</small>'}</th>${R.map((r) => { const v = m.get(r); return `<td class="r">${C.isNum(v) ? `<span class="num">${m.fmt(v)}</span>` : na()}</td>`; }).join('')}</tr>`).join('')
    + (store.hasFin ? `<tr><th scope="row" class="sticky-col" style="white-space:normal">最新の決算が赤字の銘柄数</th>${R.map((r) => `<td class="r">${r.loss}社</td>`).join('')}</tr>` : '');

  app.innerHTML = `
    <div class="page-head">
      <div class="breadcrumb"><a href="#/">ホーム</a> › テーマ比較</div>
      <h1>テーマ比較：どのテーマが選びやすい？の判断材料</h1>
      <p>5つのテーマの候補銘柄について、数字（業績は<b>中央値</b>${help('median')}）を並べました。<b>どのテーマが良いかは決めつけません。</b>グループの関心、説明のしやすさ、リスクの好みなどと合わせて考える材料にしてください。STOCKリーグでは評価額（もうけ）は審査に関係ありません。</p>
      <p class="small muted">${finNote()} 株価の値動き（騰落率・値動きの大きさなど）は、株価データを自動で集められないため載せていません（<a href="#/about">理由</a>）。</p>
    </div>
    <section class="card">
      <div class="chart-head"><h2 style="margin:0">一覧表</h2><button type="button" class="btn small" id="png-table">表をPNGで保存</button></div>
      <div class="table-wrap"><table><thead>${tableHead}</thead><tbody>${tableBody}</tbody></table></div>
      <p class="small muted" style="margin-top:8px">同じ会社が複数のテーマに入っていることがあります（例：富士電機）。業績・株主総利回りは各社の直近の有価証券報告書（決算期末）の値です。</p>
    </section>

    <h2>指標ごとのグラフ</h2>
    <p class="muted small">各グラフの「PNG」でスライド用の画像を保存できます。</p>
    <div class="small-multiples">
      ${METRICS.map((m) => `
        <section class="card">
          <div class="chart-head"><h3 style="margin:0;font-size:1rem">${esc(m.label)}${m.help ? help(m.help) : ''}</h3><button type="button" class="btn small" data-png="${m.id}">PNG</button></div>
          <p class="small muted" style="margin:0 0 4px">${esc(m.note)}</p>
          <div class="chart-box short"><canvas data-metric="${m.id}" role="img" aria-label="${esc(m.label)}のテーマ別比較"></canvas></div>
        </section>`).join('')}
    </div>

    <section class="card" style="margin-top:16px">
      <h2 style="margin-top:0">考えるときのヒント（正解はありません）</h2>
      <ul>
        <li><b>組みやすさ</b>：10〜20銘柄が必要です。候補が少ないテーマや、100株の金額が大きい銘柄が多いテーマは、500万円の中で組みにくくなります（株価は<a href="#/portfolio">ポートフォリオ試算</a>で入力して確かめられます。売買単位は<a href="#/rules">未確認</a>）。</li>
        <li><b>説明しやすさ</b>：「なぜこのテーマか」「なぜこの会社か」を自分たちの言葉で説明できるか。各テーマのページの「テーマとの関係」と出典を見てみましょう。</li>
        <li><b>値動き</b>：株価の値動きの大きさは外部サイトのチャートで確かめてください。値動きの大きいテーマは評価額が大きく上下しますが、良い悪いではなく、レポートで「なぜ動いたか」を考察する材料になります。</li>
        <li><b>業種のかたより</b>：同じ業種ばかりだと、同じ出来事で一緒に動きやすくなります。下の業種の内訳も参考に。</li>
      </ul>
    </section>

    <section class="card">
      <h2 style="margin-top:0">テーマごとの業種の内訳 ${help('industry')}</h2>
      <div class="grid grid-3">
        ${R.map((r) => {
          const total = Object.values(r.industries).reduce((a, b) => a + b, 0) || 1;
          return `<div><h3 style="margin-top:0"><span class="badge"><span class="dot" style="background:${themeColor(r.id)}"></span>${esc(r.short)}</span></h3>
            ${Object.entries(r.industries).map(([k, v]) => `<div class="bar-row"><span>${esc(k)}</span><span class="track"><span class="fill" style="width:${(v / total) * 100}%;background:${themeColor(r.id)}"></span></span><span class="num">${v}社</span></div>`).join('')}</div>`;
        }).join('')}
      </div>
    </section>
  `;

  const labels = R.map((r) => r.short);
  const build = (m, cv, scale, ex) => barChart(cv, {
    labels,
    groups: [{ label: m.label, values: R.map((r) => { const v = m.get(r); return C.isNum(v) ? (m.pct ? v * 100 : v) : null; }), colors: R.map((r) => themeColorHex(r.id, ex)) }],
    format: (v) => (m.pct || m.raw ? `${C.fmtNum(v, 1)}%` : m.id === 'count' ? `${C.fmtNum(v, 0)}社` : `${C.fmtNum(v, 0)}種類`),
    horizontal: true, scale, forExport: ex, valueLabels: true,
  });
  app.querySelectorAll('canvas[data-metric]').forEach((cv) => {
    const m = ALL_METRICS.find((x) => x.id === cv.dataset.metric);
    build(m, cv, 1, false);
  });
  app.querySelectorAll('[data-png]').forEach((b) => b.addEventListener('click', () => {
    const m = ALL_METRICS.find((x) => x.id === b.dataset.png);
    exportChart({
      title: `テーマ別の比較：${m.label}${m.count ? '' : '（中央値）'}`,
      subtitle: m.note,
      footer: exportFooter(),
      build: (cv, sc) => build(m, cv, sc, true),
      filename: `themes_${m.id}.png`,
    });
  }));
  app.querySelector('#png-table').addEventListener('click', () => {
    exportTable({
      title: 'テーマ比較',
      subtitle: 'どのテーマが良いかではなく、選ぶときの判断材料として',
      footer: exportFooter(),
      columns: [{ label: '指標', width: 2.6 }, ...R.map((r) => ({ label: r.short, align: 'right', width: 1 }))],
      rows: METRICS.map((m) => [m.label, ...R.map((r) => { const v = m.get(r); return C.isNum(v) ? m.fmt(v) : '取得できず'; })]),
      filename: 'themes_table.png',
    });
  });
}
