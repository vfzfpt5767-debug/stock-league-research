import * as C from '../calc.js';
import { store, esc, help, themeColor, themeColorHex, na, exportFooter, hundredCost } from '../ui.js';
import { barChart } from '../charts.js';
import { exportChart, exportTable } from '../export.js';

// テーマ比較で並べる指標（中央値）
const METRICS = [
  { id: 'count', label: '候補の銘柄数', help: '', unit: '社', get: (t) => t.count, fmt: (v) => `${v}社`, note: '多いほど10〜20銘柄を選ぶときの選択肢が多い' },
  { id: 'cheap', label: '100株50万円以下の銘柄数', help: 'lot', get: (t) => t.cheap, fmt: (v) => `${v}社`, note: '500万円を10〜20銘柄に分けると1銘柄25〜50万円。100株単位なら、この範囲で買える銘柄が多いほど組みやすい' },
  { id: 'return_1y', label: '1年の騰落率', help: 'return_1y', get: (t) => t.median.return_1y, fmt: (v) => C.fmtPct(v), pct: true, note: 'この1年で株価がどれだけ動いたか（過去の結果で、これからを示すものではない）' },
  { id: 'return_3y', label: '3年の騰落率', help: 'return_3y', get: (t) => t.median.return_3y, fmt: (v) => C.fmtPct(v), pct: true, note: '3年間の変化。上場3年未満の銘柄は含まない' },
  { id: 'vol_1y', label: '値動きの大きさ（1年・年率）', help: 'vol', get: (t) => t.median.vol_1y, fmt: (v) => C.fmtPct(v, { sign: false }), pct: true, note: '大きいほど評価額が上下に大きく動きやすい' },
  { id: 'mdd_3y', label: '最大下落率（3年）', help: 'mdd', get: (t) => t.median.mdd_3y, fmt: (v) => C.fmtPct(v), pct: true, note: '0に近いほど大きな下落が少なかった' },
  { id: 'per', label: 'PER', help: 'per', get: (t) => t.median.per, fmt: (v) => C.fmtTimes(v), note: '低いほど利益に比べて割安、高いほど成長への期待が大きい（赤字の会社は除く）' },
  { id: 'pbr', label: 'PBR', help: 'pbr', get: (t) => t.median.pbr, fmt: (v) => C.fmtTimes(v, 2), note: '1倍未満は資産価値より株価が低い状態' },
  { id: 'dividend_yield', label: '配当利回り', help: 'dividend_yield', get: (t) => t.median.dividend_yield, fmt: (v) => C.fmtPctRaw(v), raw: true, note: '株価に対する年間の配当の割合' },
  { id: 'sales_cagr_3y', label: '売上の成長率（3年・年平均）', help: 'sales_cagr_3y', get: (t) => t.median.sales_cagr_3y, fmt: (v) => C.fmtPct(v), pct: true, note: '事業がどれだけ伸びているか' },
  { id: 'op_margin', label: '営業利益率', help: 'op_margin', get: (t) => t.median.op_margin, fmt: (v) => C.fmtPct(v, { sign: false }), pct: true, note: '売上からどれだけ効率よく利益を出しているか' },
];

function rows() {
  return store.themes.map((t) => {
    const s = store.themeSummary[t.id] || { median: {}, count: 0 };
    const members = store.stocks.filter((x) => x.themes.includes(t.id));
    const cheap = members.filter((m) => C.isNum(hundredCost(m)) && hundredCost(m) <= 500000).length;
    return { id: t.id, name: t.name, short: t.short_name, count: s.count ?? members.length, cheap, median: s.median || {}, loss: s.loss_making ?? 0, industries: s.industries || {} };
  });
}

export function renderThemes(app) {
  document.title = 'テーマ比較｜テーマ別 銘柄リサーチ';
  const R = rows();
  const tableHead = `<tr><th class="sticky-col">指標</th>${R.map((r) => `<th class="r"><span class="badge" style="border:0;background:none;padding:0"><span class="dot" style="background:${themeColor(r.id)}"></span>${esc(r.short)}</span></th>`).join('')}</tr>`;
  const tableBody = METRICS.map((m) => `<tr><th scope="row" class="sticky-col" style="white-space:normal;min-width:11em">${esc(m.label)}${m.help ? help(m.help) : ''}${m.id === 'count' ? '' : m.id === 'cheap' ? '' : '<br><small class="muted">中央値</small>'}</th>${R.map((r) => { const v = m.get(r); return `<td class="r">${C.isNum(v) ? `<span class="num">${m.fmt(v)}</span>` : na()}</td>`; }).join('')}</tr>`).join('')
    + `<tr><th scope="row" class="sticky-col" style="white-space:normal">最新の決算が赤字の銘柄数</th>${R.map((r) => `<td class="r">${r.loss}社</td>`).join('')}</tr>`;

  app.innerHTML = `
    <div class="page-head">
      <div class="breadcrumb"><a href="#/">ホーム</a> › テーマ比較</div>
      <h1>テーマ比較：どのテーマが選びやすい？の判断材料</h1>
      <p>5つのテーマの候補銘柄について、数字の<b>中央値</b>${help('median')}を並べました。<b>どのテーマが良いかは決めつけません。</b>グループの関心、説明のしやすさ、リスク（値動き）の好みなどと合わせて考える材料にしてください。STOCKリーグでは評価額（もうけ）は審査に関係ありません。</p>
    </div>
    <section class="card">
      <div class="chart-head"><h2 style="margin:0">一覧表</h2><button type="button" class="btn small" id="png-table">表をPNGで保存</button></div>
      <div class="table-wrap"><table><thead>${tableHead}</thead><tbody>${tableBody}</tbody></table></div>
      <p class="small muted" style="margin-top:8px">数字は ${esc((store.meta.data_date || '').replaceAll('-', '/'))} 時点。騰落率は配当を含まない。同じ会社が複数のテーマに入っていることがあります（例：富士電機）。</p>
    </section>

    <h2>指標ごとのグラフ</h2>
    <p class="muted small">棒はテーマごとの中央値。各グラフの「PNG」でスライド用の画像を保存できます。</p>
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
        <li><b>組みやすさ</b>：10〜20銘柄が必要なので、候補が少ないテーマや、100株の金額が大きい銘柄が多いテーマは、500万円の中で組みにくくなります（売買単位は<a href="#/rules">未確認</a>）。</li>
        <li><b>説明しやすさ</b>：「なぜこのテーマか」「なぜこの会社か」を自分たちの言葉で説明できるか。各テーマのページの「テーマとの関係」と出典を見てみましょう。</li>
        <li><b>値動き</b>：値動きの大きいテーマは評価額が大きく上下します。どちらが良い悪いではなく、レポートで「なぜ動いたか」を考察する材料になります。</li>
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
    format: (v) => (m.pct ? `${C.fmtNum(v, 1)}%` : m.raw ? `${C.fmtNum(v, 2)}%` : m.id === 'count' || m.id === 'cheap' ? `${C.fmtNum(v, 0)}社` : `${C.fmtNum(v, m.id === 'pbr' ? 2 : 1)}倍`),
    horizontal: true, scale, forExport: ex, valueLabels: true,
  });
  app.querySelectorAll('canvas[data-metric]').forEach((cv) => {
    const m = METRICS.find((x) => x.id === cv.dataset.metric);
    build(m, cv, 1, false);
  });
  app.querySelectorAll('[data-png]').forEach((b) => b.addEventListener('click', () => {
    const m = METRICS.find((x) => x.id === b.dataset.png);
    exportChart({
      title: `テーマ別の比較：${m.label}${m.id === 'count' || m.id === 'cheap' ? '' : '（中央値）'}`,
      subtitle: m.note,
      footer: exportFooter(),
      build: (cv, sc) => build(m, cv, sc, true),
      filename: `themes_${m.id}.png`,
    });
  }));
  app.querySelector('#png-table').addEventListener('click', () => {
    exportTable({
      title: 'テーマ比較（候補銘柄の中央値）',
      subtitle: 'どのテーマが良いかではなく、選ぶときの判断材料として',
      footer: exportFooter(),
      columns: [{ label: '指標', width: 2.6 }, ...R.map((r) => ({ label: r.short, align: 'right', width: 1 }))],
      rows: METRICS.map((m) => [m.label, ...R.map((r) => { const v = m.get(r); return C.isNum(v) ? m.fmt(v) : '取得できず'; })]),
      filename: 'themes_table.png',
    });
  });
}
