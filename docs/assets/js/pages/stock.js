import * as C from '../calc.js';
import { store, esc, help, themeBadge, theme, signed, na, cell, perCell, yieldCell, loadPrices, loadJSON, exportFooter, savedPortfolio, savePortfolio, toast } from '../ui.js';
import { lineChart, barChart, palette, legendHTML } from '../charts.js';
import { exportChart } from '../export.js';

let eventsCache = null;
async function loadEvents() {
  if (eventsCache) return eventsCache;
  try { eventsCache = (await loadJSON('events.json')).data || {}; } catch (e) { eventsCache = {}; }
  return eventsCache;
}

const RANGES = [
  { id: '6m', label: '6か月', days: 182, src: 'daily' },
  { id: '1y', label: '1年', days: 365, src: 'daily' },
  { id: '3y', label: '3年', days: 365 * 3, src: 'weekly' },
  { id: 'all', label: '全期間', days: null, src: 'weekly' },
];

function priceSeries(p, range) {
  const r = RANGES.find((x) => x.id === range) || RANGES[2];
  let s = r.src === 'daily' ? (p.daily || []) : (p.weekly || []);
  if (r.src === 'daily' && s.length && r.days && C.daysBetween(s[0][0], s[s.length - 1][0]) < r.days - 20) {
    // 日足が足りなければ週足を使う
    s = p.weekly || [];
  }
  if (r.src === 'weekly' && p.daily?.length) {
    // 週足の最後に最新の日足をつなぐ
    const last = p.daily[p.daily.length - 1];
    if (!s.length || s[s.length - 1][0] < last[0]) s = [...s, last];
  }
  if (!s.length) return [];
  if (r.days) {
    // 騰落率の計算と同じく「ちょうど期間前に最も近い終値」から表示する
    const start = C.addDays(s[s.length - 1][0], -r.days);
    const near = C.closeNearest(s, start, 10);
    s = near ? s.filter(([d]) => d >= near[0]) : s.filter(([d]) => d >= start);
  }
  return s;
}

export async function renderStock(app, code) {
  const s = store.byCode[code];
  if (!s) {
    app.innerHTML = `<div class="card"><h1>銘柄が見つかりません（${esc(code)}）</h1><p>このサイトの候補にない銘柄です。<a href="#/compare">比較表へ</a></p></div>`;
    return;
  }
  document.title = `${s.name}（${s.code}）｜テーマ別 銘柄リサーチ`;
  const f = s.fin || {};
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
        <a class="btn" href="https://irbank.net/${esc(s.code)}/chart" rel="noopener">IR BANK（株価）</a>
        <a class="btn" href="https://irbank.net/${esc(s.code)}" rel="noopener">IR BANK（会社情報）</a>
      </div>
    </div>

    <section class="card">
      <h2 style="margin-top:0">主な数字 <small class="muted" style="font-weight:400">${s.price_date ? s.price_date.replaceAll('-', '/') + ' 時点' : ''}</small></h2>
      <div class="tiles">
        ${tile('株価', 'price', cell(s.price, (v) => C.fmtYen(v)), C.isNum(s.price) ? `100株で ${C.fmtJpAmount(s.price * 100)}` : '')}
        ${tile('時価総額', 'market_cap', cell(s.market_cap, C.fmtJpAmount))}
        ${tile('PER', 'per', perCell(s))}
        ${tile('PBR', 'pbr', cell(s.pbr, (v) => C.fmtTimes(v, 2)))}
        ${tile('配当利回り', 'dividend_yield', yieldCell(s))}
        ${tile('ROE', 'roe', cell(s.roe, (v) => C.fmtPctRaw(v, 1)))}
        ${tile('1年の騰落率', 'return_1y', signed(s.return_1y))}
        ${tile('3年の騰落率', 'return_3y', signed(s.return_3y))}
        ${tile('値動きの大きさ', 'vol', C.isNum(s.vol_1y) ? C.fmtPct(s.vol_1y, { sign: false }) : na(), '1年・年率')}
        ${tile('最大下落率', 'mdd', C.isNum(s.mdd_3y) ? C.fmtPct(s.mdd_3y) : na(), '過去3年・週足')}
      </div>
    </section>

    <div class="grid grid-2" style="margin-top:16px">
      <section class="card">
        <h2 style="margin-top:0">テーマとの関係</h2>
        ${s.themes.map((t) => {
          const r = s.reasons[t];
          return `<div style="margin-bottom:12px">${themeBadge(t, { short: false })}<p style="margin:6px 0 2px">${esc(r.reason)}</p><div class="small">出典：<a href="${esc(r.source_url)}" rel="noopener">${esc(r.source_title || r.source_url)}</a></div></div>`;
        }).join('')}
      </section>
      <section class="card">
        <h2 style="margin-top:0">事業の説明</h2>
        <p>${s.business ? esc(s.business) : na()}</p>
        <p class="small muted">公開情報をもとにした短い要約です。くわしくは会社の公式サイト・統合報告書や、上のIR BANKのページ（会社情報）で確認してください。</p>
      </section>
    </div>

    <section class="card" style="margin-top:16px">
      <div class="chart-head">
        <h2 style="margin:0">株価チャート</h2>
        <div class="row">
          <div class="seg" role="group" aria-label="期間">${RANGES.map((r) => `<button type="button" data-range="${r.id}" aria-pressed="${r.id === '3y'}">${r.label}</button>`).join('')}</div>
          <button type="button" class="btn small" id="png-price">PNGで保存</button>
        </div>
      </div>
      <p id="price-note" class="small muted" style="margin:0 0 6px"></p>
      <div class="chart-box tall"><canvas id="price-chart" aria-label="${esc(s.name)}の株価の推移" role="img"></canvas></div>
    </section>

    <section class="card">
      <div class="chart-head">
        <h2 style="margin:0">業績の推移（決算期ごと）</h2>
        <div class="row">
          <button type="button" class="btn small" id="png-sales">売上をPNG</button>
          <button type="button" class="btn small" id="png-profit">利益をPNG</button>
        </div>
      </div>
      ${(s.fin_history || []).length ? `
      <div class="grid grid-2">
        <div><h3 style="margin-top:0">売上高 ${help('sales')}</h3><div class="chart-box short"><canvas id="sales-chart" role="img" aria-label="売上高の推移"></canvas></div></div>
        <div><h3 style="margin-top:0">営業利益と純利益 ${help('operating_income')}</h3><div id="profit-legend"></div><div class="chart-box short"><canvas id="profit-chart" role="img" aria-label="営業利益と純利益の推移"></canvas></div></div>
      </div>
      <details style="margin-top:10px"><summary>数字の表で見る</summary>
        <div class="table-wrap" style="margin-top:8px"><table>
          <thead><tr><th>決算期</th><th class="r">売上高</th><th class="r">営業利益</th><th class="r">純利益</th><th class="r">EPS</th><th class="r">1株配当</th></tr></thead>
          <tbody>${s.fin_history.map((h) => `<tr><td>${esc(h.fy)}</td><td class="r">${cell(h.sales, C.fmtJpAmount)}</td><td class="r">${cell(h.operating_income, C.fmtJpAmount)}</td><td class="r">${cell(h.net_income, C.fmtJpAmount)}</td><td class="r">${cell(h.eps, (v) => C.fmtNum(v, 2) + '円')}</td><td class="r">${cell(h.dps, (v) => C.fmtNum(v, 1) + '円')}</td></tr>`).join('')}</tbody>
        </table></div>
      </details>
      <p class="small muted" style="margin-top:8px">売上の成長率（3年・年平均）${help('sales_cagr_3y')}：${C.isNum(f.sales_cagr_3y) ? C.fmtPct(f.sales_cagr_3y) : '取得できず'}　／　営業利益率${help('op_margin')}：${C.isNum(f.op_margin) ? C.fmtPct(f.op_margin, { sign: false }) : '取得できず'}。出典：IR BANK（有価証券報告書のデータ）。会社によっては経常利益などが空欄です。</p>`
      : `<p>${na()}（決算データを取得できませんでした）</p>`}
    </section>

    <section class="card">
      <h2 style="margin-top:0">最近の主な出来事（適時開示）${help('disclosure')}</h2>
      <div id="events" class="muted">読み込み中…</div>
    </section>
  `;

  // ---- ポートフォリオに追加 ----
  app.querySelector('#add-pf').addEventListener('click', () => {
    const cur = savedPortfolio() || { items: [], lot: 100, topix: {} };
    if (!cur.items.some((i) => i.code === s.code)) cur.items.push({ code: s.code, amount: 250000 });
    savePortfolio(cur);
    toast(`${s.name} をポートフォリオ試算に追加しました（${cur.items.length}銘柄）`);
  });

  // ---- 株価チャート ----
  const p = await loadPrices(s.code);
  let range = '3y';
  const pal = palette();
  const draw = () => {
    const ser = priceSeries(p, range);
    const canvas = document.getElementById('price-chart');
    if (!canvas) return;
    const note = document.getElementById('price-note');
    if (!ser.length) {
      note.textContent = '株価を取得できませんでした。';
      return;
    }
    const r = RANGES.find((x) => x.id === range);
    const first = ser[0], last = ser[ser.length - 1];
    note.textContent = `${first[0].replaceAll('-', '/')} 〜 ${last[0].replaceAll('-', '/')}（${r.src === 'daily' ? '日足' : '週足'}の終値）　期間中の変化：${C.fmtPct(last[1] / first[1] - 1)}`;
    lineChart(canvas, { datasets: [{ label: '株価', data: ser, color: pal.series[0] }], yFormat: (v) => C.fmtNum(v, 0) + '円' });
  };
  draw();
  app.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => {
    range = b.dataset.range;
    app.querySelectorAll('[data-range]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.range === range));
    draw();
  }));
  app.querySelector('#png-price').addEventListener('click', () => {
    const ser = priceSeries(p, range);
    if (!ser.length) return;
    const r = RANGES.find((x) => x.id === range);
    exportChart({
      title: `${s.name}（${s.code}）の株価（${r.label}）`,
      subtitle: `${ser[0][0].replaceAll('-', '/')}〜${ser[ser.length - 1][0].replaceAll('-', '/')}　期間中の変化 ${C.fmtPct(ser[ser.length - 1][1] / ser[0][1] - 1)}（${r.src === 'daily' ? '日足' : '週足'}の終値、配当は含まない）`,
      footer: exportFooter(),
      build: (cv, sc) => lineChart(cv, { datasets: [{ label: '株価', data: ser, color: palette(true).series[0] }], yFormat: (v) => C.fmtNum(v, 0) + '円', scale: sc, forExport: true }),
      filename: `price_${s.code}_${r.id}.png`,
    });
  });

  // ---- 業績グラフ ----
  const hist = s.fin_history || [];
  if (hist.length) {
    const labels = hist.map((h) => h.fy);
    const oku = (v) => (C.isNum(v) ? v / 1e8 : null);
    const fmtOku = (v) => `${C.fmtNum(v, 0)}億円`;
    const salesCfg = (cv, sc, ex) => barChart(cv, { labels, groups: [{ label: '売上高', values: hist.map((h) => oku(h.sales)), color: palette(ex).series[0] }], format: fmtOku, scale: sc, forExport: ex, valueLabels: !!ex });
    const profitCfg = (cv, sc, ex) => barChart(cv, {
      labels,
      groups: [
        { label: '営業利益', values: hist.map((h) => oku(h.operating_income)), color: palette(ex).series[0] },
        { label: '純利益', values: hist.map((h) => oku(h.net_income)), color: palette(ex).series[2] },
      ],
      format: fmtOku, scale: sc, forExport: ex,
    });
    salesCfg(document.getElementById('sales-chart'), 1, false);
    profitCfg(document.getElementById('profit-chart'), 1, false);
    document.getElementById('profit-legend').innerHTML = legendHTML([{ label: '営業利益', color: pal.series[0], box: true }, { label: '純利益', color: pal.series[2], box: true }]);
    app.querySelector('#png-sales').addEventListener('click', () => exportChart({
      title: `${s.name}（${s.code}）の売上高の推移`,
      subtitle: `単位：億円　売上の成長率（3年・年平均）${C.isNum(f.sales_cagr_3y) ? C.fmtPct(f.sales_cagr_3y) : '取得できず'}`,
      footer: exportFooter(), build: (cv, sc) => salesCfg(cv, sc, true), filename: `sales_${s.code}.png`,
    }));
    app.querySelector('#png-profit').addEventListener('click', () => exportChart({
      title: `${s.name}（${s.code}）の営業利益と純利益の推移`,
      subtitle: '単位：億円',
      legendItems: [{ label: '営業利益', color: palette(true).series[0], box: true }, { label: '純利益', color: palette(true).series[2], box: true }],
      footer: exportFooter(), build: (cv, sc) => profitCfg(cv, sc, true), filename: `profit_${s.code}.png`,
    }));
  } else {
    app.querySelector('#png-sales').disabled = true;
    app.querySelector('#png-profit').disabled = true;
  }

  // ---- 適時開示 ----
  const ev = await loadEvents();
  const el = document.getElementById('events');
  if (!el) return;
  const items = ev[s.code]?.items || [];
  el.classList.remove('muted');
  el.innerHTML = items.length
    ? `<ul class="news-list">${items.slice(0, 12).map((n) => `<li><span class="date">${esc(n.date.replaceAll('-', '/'))}</span><a href="${esc(n.url)}" rel="noopener">${esc(n.title)}</a></li>`).join('')}</ul>
       <p class="small muted">出典：IR BANK（${esc(s.name)}の適時開示の一覧、${esc((ev[s.code].fetched_at || '').replaceAll('-', '/'))}取得）。決算短信・説明資料なども、ここから原文を開けます。</p>`
    : `<p class="muted">まだ集めていません（自動更新で順番に集めます）。<a href="https://irbank.net/${esc(s.code)}/ir" rel="noopener">IR BANKで見る</a></p>`;
  void theme;
}
