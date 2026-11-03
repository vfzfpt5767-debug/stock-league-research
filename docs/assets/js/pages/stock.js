import * as C from '../calc.js';
import { store, esc, help, themeBadge, na, cell, exportFooter, savedPortfolio, savePortfolio, toast, extLinks, memoPrice, setMemoPrice, finNote } from '../ui.js';
import { barChart, palette, legendHTML } from '../charts.js';
import { exportChart } from '../export.js';

export async function renderStock(app, code) {
  const s = store.byCode[code];
  if (!s) {
    app.innerHTML = `<div class="card"><h1>銘柄が見つかりません（${esc(code)}）</h1><p>このサイトの候補にない銘柄です。<a href="#/compare">比較表へ</a></p></div>`;
    return;
  }
  document.title = `${s.name}（${s.code}）｜テーマ別 銘柄リサーチ`;
  const f = s.fin || {};
  const hist = s.fin_history || [];
  const memo = memoPrice(s.code);
  const tile = (label, key, value, sub = '') => `<div class="tile"><div class="label">${label}${key ? help(key) : ''}</div><div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;

  app.innerHTML = `
    <div class="page-head">
      <div class="breadcrumb"><a href="#/">ホーム</a> › <a href="#/compare">比較表</a> › ${esc(s.name)}</div>
      <h1>${esc(s.name)} <span class="muted" style="font-weight:400">${esc(s.code)}</span></h1>
      <div class="row">${s.themes.map((t) => themeBadge(t, { short: false })).join(' ')}
        ${s.industry ? `<span class="badge">業種：${esc(s.industry)}</span>` : ''}
        ${s.fiscal_year_end ? `<span class="badge">決算日：${esc(s.fiscal_year_end)}</span>` : ''}</div>
      <div class="row" style="margin-top:10px">
        <button type="button" class="btn primary" id="add-pf">ポートフォリオ試算に追加</button>
      </div>
    </div>

    <div class="grid grid-2">
      <section class="card">
        <h2 style="margin-top:0">株価・チャートを見る</h2>
        <p class="small">株価やチャートは、次の外部サイトや STOCKリーグのバーチャル投資システムで確認してください（このサイトは株価データを自動では集めていません）。</p>
        <div class="row">${extLinks(s.code).map((l) => `<a class="btn small" href="${esc(l.url)}" rel="noopener" target="_blank">${esc(l.label)} ↗</a>`).join('')}</div>
        <h3>株価メモ ${help('price_memo')}</h3>
        <div class="row">
          <label>株価（円）<br><input id="memo-price" type="number" inputmode="decimal" min="0" step="1" value="${memo ? memo.price : ''}" style="width:9em"></label>
          <label>調べた日<br><input id="memo-date" type="text" placeholder="2026-11-04" value="${memo ? esc(memo.date) : ''}" style="width:9em"></label>
          <button type="button" class="btn" id="memo-save" style="align-self:flex-end">保存</button>
        </div>
        <p class="small muted" id="memo-note">${memo ? `100株で ${C.fmtJpAmount(memo.price * 100)}（手数料は別）` : '入力すると比較表とポートフォリオ試算で使えます。この端末のブラウザだけに保存されます。'}</p>
      </section>
      <section class="card">
        <h2 style="margin-top:0">テーマとの関係</h2>
        ${s.themes.map((t) => {
          const r = s.reasons[t];
          return `<div style="margin-bottom:12px">${themeBadge(t, { short: false })}<p style="margin:6px 0 2px">${esc(r.reason)}</p><div class="small">出典：<a href="${esc(r.source_url)}" rel="noopener">${esc(r.source_title || r.source_url)}</a></div></div>`;
        }).join('')}
        <h3>事業の説明</h3>
        <p>${s.business ? esc(s.business) : na()}</p>
        <p class="small muted">公開情報をもとにした短い要約です。くわしくは会社の公式サイト・統合報告書・有価証券報告書で確認してください。</p>
      </section>
    </div>

    <section class="card" style="margin-top:16px">
      <h2 style="margin-top:0">決算の数字（有価証券報告書より）</h2>
      ${hist.length ? `
      <div class="tiles">
        ${tile('売上高', 'sales', cell(f.sales, C.fmtJpAmount), esc(f.fy || ''))}
        ${tile('純利益', 'net_income', cell(f.net_income, C.fmtJpAmount))}
        ${tile('売上の成長率', 'sales_cagr_3y', C.isNum(f.sales_cagr_3y) ? C.fmtPct(f.sales_cagr_3y) : na(), '3年の年平均')}
        ${tile('ROE', 'roe', cell(f.roe_actual, (v) => C.fmtPctRaw(v, 1)))}
        ${tile('自己資本比率', 'equity_ratio', cell(f.equity_ratio, (v) => C.fmtPctRaw(v, 1)))}
        ${tile('1株配当', 'dps', cell(f.dps, (v) => C.fmtNum(v, 1) + '円'))}
        ${tile('PER（期末）', 'per', cell(f.per_fy_end, (v) => C.fmtTimes(v)), '決算期末の株価で計算')}
      </div>
      <div class="chart-head" style="margin-top:14px"><h3 style="margin:0">売上高と純利益の推移</h3>
        <div class="row"><button type="button" class="btn small" id="png-sales">売上をPNG</button><button type="button" class="btn small" id="png-profit">純利益をPNG</button></div></div>
      <div class="grid grid-2">
        <div><div class="chart-box short"><canvas id="sales-chart" role="img" aria-label="売上高の推移"></canvas></div></div>
        <div><div class="chart-box short"><canvas id="profit-chart" role="img" aria-label="純利益の推移"></canvas></div></div>
      </div>
      ${hist.some((h) => C.isNum(h.tsr)) ? `
      <div class="chart-head" style="margin-top:14px"><h3 style="margin:0">株主総利回り ${help('tsr')}（5年前の期末＝100）</h3><button type="button" class="btn small" id="png-tsr">PNG</button></div>
      <div id="tsr-legend"></div>
      <div class="chart-box short"><canvas id="tsr-chart" role="img" aria-label="株主総利回りと比較指標"></canvas></div>
      <p class="small muted">配当も含めた株主のもうけの推移を、会社が選んだ比較指標（${esc(f.tsr_index_name || '配当込みTOPIXなど')}）と並べたものです。各社が有価証券報告書で開示した値です。</p>` : ''}
      <details style="margin-top:10px"><summary>数字の表で見る</summary>
        <div class="table-wrap" style="margin-top:8px"><table>
          <thead><tr><th>決算期</th><th class="r">売上高</th><th class="r">経常利益等</th><th class="r">純利益</th><th class="r">EPS</th><th class="r">1株配当</th><th class="r">株主総利回り</th></tr></thead>
          <tbody>${hist.map((h) => `<tr><td>${esc(h.fy)}</td><td class="r">${cell(h.sales, C.fmtJpAmount)}</td><td class="r">${cell(h.ordinary_income, C.fmtJpAmount)}</td><td class="r">${cell(h.net_income, C.fmtJpAmount)}</td><td class="r">${cell(h.eps, (v) => C.fmtNum(v, 2) + '円')}</td><td class="r">${cell(h.dps, (v) => C.fmtNum(v, 1) + '円')}</td><td class="r">${cell(h.tsr, (v) => C.fmtNum(v, 1) + '%')}</td></tr>`).join('')}</tbody>
        </table></div>
        <p class="small muted">EPS・1株配当は各年度の決算時点の株数での値です（そのあとの株式分割は反映していません）。IFRSの会社は「経常利益等」が税引前利益です。</p>
      </details>
      <p class="small muted" style="margin-top:8px">出典：金融庁 EDINET（${esc(s.name)}の有価証券報告書。必要な項目を抜き出して加工）。</p>`
      : `<p>${finNote()}</p><p class="small"><a href="https://disclosure2.edinet-fsa.go.jp/WEEK0010.aspx" rel="noopener" target="_blank">EDINETで有価証券報告書を探す ↗</a>（「提出者名」に会社名を入れて検索）</p>`}
    </section>

    <section class="card">
      <h2 style="margin-top:0">最近の主な提出書類（EDINET） ${help('filing')}</h2>
      ${(s.filings || []).length
        ? `<ul class="news-list">${s.filings.map((n) => `<li><span class="date">${esc(n.date.replaceAll('-', '/'))}</span><a href="${esc(n.url)}" rel="noopener" target="_blank">${esc(n.title)}</a></li>`).join('')}</ul><p class="small muted">出典：金融庁 EDINET。会社の最近の発表（決算短信・ニュースリリース）は、会社の公式サイトや上の外部サイトで確認できます。</p>`
        : `<p class="muted">${store.hasFin ? 'まだありません。' : 'EDINET の APIキーを登録すると、有価証券報告書・臨時報告書などの一覧が表示されます。'}会社の最近の発表は、上の外部サイトや会社の公式サイトで確認してください。</p>`}
    </section>
  `;

  // ---- ポートフォリオに追加 ----
  app.querySelector('#add-pf').addEventListener('click', () => {
    const cur = savedPortfolio() || { items: [], lot: 100, topix: {}, prices: {} };
    if (!cur.items.some((i) => i.code === s.code)) cur.items.push({ code: s.code, amount: 250000 });
    const m = memoPrice(s.code);
    if (m) cur.prices = { ...(cur.prices || {}), [s.code]: m.price };
    savePortfolio(cur);
    toast(`${s.name} をポートフォリオ試算に追加しました（${cur.items.length}銘柄）`);
  });

  // ---- 株価メモ ----
  app.querySelector('#memo-save').addEventListener('click', () => {
    const v = parseFloat(app.querySelector('#memo-price').value);
    const d = app.querySelector('#memo-date').value.trim().slice(0, 10) || new Date().toISOString().slice(0, 10);
    setMemoPrice(s.code, Number.isFinite(v) ? v : null, d);
    app.querySelector('#memo-note').textContent = Number.isFinite(v) && v > 0 ? `保存しました。100株で ${C.fmtJpAmount(v * 100)}（手数料は別）` : '株価メモを消しました。';
  });

  // ---- 業績グラフ ----
  if (!hist.length) return;
  const pal = palette();
  const labels = hist.map((h) => h.fy);
  const oku = (v) => (C.isNum(v) ? v / 1e8 : null);
  const fmtOku = (v) => `${C.fmtNum(v, 0)}億円`;
  const one = (key, label, idx) => (cv, sc, ex) => barChart(cv, { labels, groups: [{ label, values: hist.map((h) => oku(h[key])), color: palette(ex).series[idx] }], format: fmtOku, scale: sc, forExport: ex, valueLabels: !!ex });
  const salesCfg = one('sales', '売上高', 0);
  const profitCfg = one('net_income', '純利益', 2);
  salesCfg(document.getElementById('sales-chart'), 1, false);
  profitCfg(document.getElementById('profit-chart'), 1, false);
  app.querySelector('#png-sales').addEventListener('click', () => exportChart({
    title: `${s.name}（${s.code}）の売上高の推移`, subtitle: `単位：億円　売上の成長率（3年・年平均）${C.isNum(f.sales_cagr_3y) ? C.fmtPct(f.sales_cagr_3y) : '取得できず'}`,
    footer: exportFooter(), build: (cv, sc) => salesCfg(cv, sc, true), filename: `sales_${s.code}.png`,
  }));
  app.querySelector('#png-profit').addEventListener('click', () => exportChart({
    title: `${s.name}（${s.code}）の純利益の推移`, subtitle: '単位：億円（親会社株主に帰属する当期純利益）',
    footer: exportFooter(), build: (cv, sc) => profitCfg(cv, sc, true), filename: `profit_${s.code}.png`,
  }));
  const tsrCanvas = document.getElementById('tsr-chart');
  if (tsrCanvas) {
    const idxName = f.tsr_index_name || '比較指標';
    const tsrCfg = (cv, sc, ex) => barChart(cv, {
      labels,
      groups: [
        { label: s.name, values: hist.map((h) => (C.isNum(h.tsr) ? h.tsr : null)), color: palette(ex).series[0] },
        { label: idxName, values: hist.map((h) => (C.isNum(h.tsr_index) ? h.tsr_index : null)), color: palette(ex).muted },
      ],
      format: (v) => `${C.fmtNum(v, 0)}`, scale: sc, forExport: ex,
    });
    tsrCfg(tsrCanvas, 1, false);
    document.getElementById('tsr-legend').innerHTML = legendHTML([{ label: s.name, color: pal.series[0], box: true }, { label: idxName, color: pal.muted, box: true }]);
    app.querySelector('#png-tsr').addEventListener('click', () => exportChart({
      title: `${s.name}（${s.code}）の株主総利回りと${idxName}`, subtitle: '5年前の決算期末＝100（配当込み）。各社の有価証券報告書の開示値',
      legendItems: [{ label: s.name, color: palette(true).series[0], box: true }, { label: idxName, color: palette(true).muted, box: true }],
      footer: exportFooter(), build: (cv, sc) => tsrCfg(cv, sc, true), filename: `tsr_${s.code}.png`,
    }));
  }
}
