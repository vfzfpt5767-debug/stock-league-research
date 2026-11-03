import * as C from '../calc.js';
import { store, esc, help, themeBadge, themeColor, signed, na, cell, perCell, yieldCell, hundredCost, exportFooter, downloadCSV, theme } from '../ui.js';
import { GLOSSARY } from '../glossary.js';
import { exportTable } from '../export.js';

const GROUPS = [
  { id: 'base', label: '基本' },
  { id: 'value', label: '割安さ・配当' },
  { id: 'move', label: '値動き' },
  { id: 'fin', label: '業績' },
];

function spark(values, { color = 'var(--accent)' } = {}) {
  const v = values.map((x) => (C.isNum(x) ? x : null));
  if (v.filter((x) => x !== null).length < 2) return na();
  const w = 78, h = 26, n = v.length, bw = Math.max(4, Math.floor((w - (n - 1) * 3) / n));
  const max = Math.max(...v.filter((x) => x !== null).map(Math.abs), 1);
  const hasNeg = v.some((x) => x !== null && x < 0);
  const zero = hasNeg ? h / 2 : h - 1;
  const scale = hasNeg ? (h / 2 - 1) / max : (h - 2) / max;
  const bars = v.map((x, i) => {
    if (x === null) return '';
    const bh = Math.max(1, Math.abs(x) * scale);
    const y = x >= 0 ? zero - bh : zero;
    return `<rect x="${i * (bw + 3)}" y="${y.toFixed(1)}" width="${bw}" height="${bh.toFixed(1)}" rx="1.5" fill="${x < 0 ? 'var(--down)' : color}"/>`;
  }).join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="推移">${bars}<line x1="0" x2="${w}" y1="${zero}" y2="${zero}" stroke="var(--axis)" stroke-width="1"/></svg>`;
}

const finVal = (k) => (s) => s.fin?.[k];

export const COLUMNS = [
  { id: 'name', label: '銘柄', group: 'always', sticky: true, sort: (s) => s.name, render: (s) => `<span class="name-cell"><a href="#/stock/${esc(s.code)}">${esc(s.name)}</a><span class="code">${esc(s.code)}</span></span>`, png: (s) => `${s.name}（${s.code}）`, csv: (s) => s.name },
  { id: 'themes', label: 'テーマ', group: 'base', render: (s) => s.themes.map((t) => themeBadge(t)).join(' '), csv: (s) => s.themes.map((t) => theme(t)?.short_name).join('・') },
  { id: 'industry', label: '業種', group: 'base', help: 'industry', sort: (s) => s.industry || null, render: (s) => (s.industry ? esc(s.industry) : na()), csv: (s) => s.industry || '' },
  { id: 'price', label: '株価', group: 'base', help: 'price', num: true, value: (s) => s.price, fmt: (v) => C.fmtYen(v) },
  { id: 'lot', label: '100株の金額', group: 'base', help: 'lot', num: true, value: hundredCost, fmt: C.fmtJpAmount },
  { id: 'market_cap', label: '時価総額', group: 'base', help: 'market_cap', num: true, value: (s) => s.market_cap, fmt: C.fmtJpAmount },
  { id: 'per', label: 'PER', group: 'value', help: 'per', num: true, value: (s) => s.per, fmt: (v) => C.fmtTimes(v), render: perCell },
  { id: 'pbr', label: 'PBR', group: 'value', help: 'pbr', num: true, value: (s) => s.pbr, fmt: (v) => C.fmtTimes(v, 2) },
  { id: 'dividend_yield', label: '配当利回り', group: 'value', help: 'dividend_yield', num: true, value: (s) => s.dividend_yield, fmt: (v) => C.fmtPctRaw(v), render: yieldCell },
  { id: 'roe', label: 'ROE', group: 'value', help: 'roe', num: true, value: (s) => s.roe, fmt: (v) => C.fmtPctRaw(v, 1) },
  { id: 'return_1m', label: '1か月', pngLabel: '騰落率（1か月）', group: 'move', help: 'return', num: true, value: (s) => s.return_1m, fmt: (v) => C.fmtPct(v), signed: true },
  { id: 'return_6m', label: '6か月', pngLabel: '騰落率（6か月）', group: 'move', help: 'return', num: true, value: (s) => s.return_6m, fmt: (v) => C.fmtPct(v), signed: true },
  { id: 'return_1y', label: '1年', pngLabel: '騰落率（1年）', group: 'move', help: 'return_1y', num: true, value: (s) => s.return_1y, fmt: (v) => C.fmtPct(v), signed: true },
  { id: 'return_3y', label: '3年', pngLabel: '騰落率（3年）', group: 'move', help: 'return_3y', num: true, value: (s) => s.return_3y, fmt: (v) => C.fmtPct(v), signed: true },
  { id: 'vol_1y', label: '値動きの大きさ', group: 'move', help: 'vol', num: true, value: (s) => s.vol_1y, fmt: (v) => C.fmtPct(v, { sign: false }) },
  { id: 'mdd_3y', label: '最大下落率(3年)', group: 'move', help: 'mdd', num: true, value: (s) => s.mdd_3y, fmt: (v) => C.fmtPct(v) },
  { id: 'sales', label: '売上高', group: 'fin', help: 'sales', num: true, value: finVal('sales'), fmt: C.fmtJpAmount },
  { id: 'sales_trend', label: '売上の推移', group: 'fin', render: (s) => spark((s.fin_history || []).map((h) => h.sales)), csv: (s) => (s.fin_history || []).map((h) => `${h.fy}:${h.sales ?? ''}`).join(' ') },
  { id: 'sales_cagr_3y', label: '売上成長率(3年平均)', group: 'fin', help: 'sales_cagr_3y', num: true, value: finVal('sales_cagr_3y'), fmt: (v) => C.fmtPct(v), signed: true },
  { id: 'op_margin', label: '営業利益率', group: 'fin', help: 'op_margin', num: true, value: finVal('op_margin'), fmt: (v) => C.fmtPct(v, { sign: false }) },
  { id: 'net_income', label: '純利益', group: 'fin', help: 'net_income', num: true, value: finVal('net_income'), fmt: C.fmtJpAmount },
  { id: 'ni_trend', label: '純利益の推移', group: 'fin', render: (s) => spark((s.fin_history || []).map((h) => h.net_income), { color: 'var(--t3)' }), csv: (s) => (s.fin_history || []).map((h) => `${h.fy}:${h.net_income ?? ''}`).join(' ') },
  { id: 'fy', label: '決算期', group: 'fin', help: 'fy', sort: (s) => s.fin?.fy || null, render: (s) => (s.fin?.fy ? esc(s.fin.fy) : na()), csv: (s) => s.fin?.fy || '' },
];

function parseQuery(q) {
  const p = new URLSearchParams(q || '');
  return {
    themes: (p.get('theme') || '').split(',').filter(Boolean),
    ind: p.get('ind') || '',
    q: p.get('q') || '',
    cap: p.get('cap') || '',
    groups: (p.get('g') || 'base,value,move,fin').split(',').filter(Boolean),
    sort: p.get('sort') || 'market_cap',
    dir: p.get('dir') === 'asc' ? 'asc' : 'desc',
  };
}

function toQuery(st) {
  const p = new URLSearchParams();
  if (st.themes.length) p.set('theme', st.themes.join(','));
  if (st.ind) p.set('ind', st.ind);
  if (st.q) p.set('q', st.q);
  if (st.cap) p.set('cap', st.cap);
  if (st.groups.join(',') !== 'base,value,move,fin') p.set('g', st.groups.join(','));
  if (st.sort !== 'market_cap') p.set('sort', st.sort);
  if (st.dir !== 'desc') p.set('dir', st.dir);
  return p.toString();
}

function filtered(st) {
  const q = st.q.trim().toLowerCase();
  let rows = store.stocks.filter((s) => {
    if (st.themes.length && !s.themes.some((t) => st.themes.includes(t))) return false;
    if (st.ind && s.industry !== st.ind) return false;
    if (q && !(`${s.name} ${s.code} ${s.business || ''}`.toLowerCase().includes(q))) return false;
    if (st.cap) {
      const c = hundredCost(s);
      if (!C.isNum(c) || c > Number(st.cap)) return false;
    }
    return true;
  });
  const col = COLUMNS.find((c) => c.id === st.sort) || COLUMNS.find((c) => c.id === 'market_cap');
  const key = col.value || col.sort || ((s) => s[col.id]);
  rows = C.sortRows(rows, key, st.dir);
  return rows;
}

function visibleCols(st) {
  return COLUMNS.filter((c) => c.group === 'always' || st.groups.includes(c.group));
}

function renderCell(c, s) {
  if (c.render) return c.render(s);
  const v = c.value(s);
  if (c.signed) return signed(v);
  return cell(v, c.fmt);
}

function headHTML(cols, st) {
  return `<tr>${cols.map((c) => {
    const sortable = !!(c.value || c.sort);
    const aria = st.sort === c.id ? (st.dir === 'asc' ? 'ascending' : 'descending') : 'none';
    const arrow = st.sort === c.id ? (st.dir === 'asc' ? '▲' : '▼') : '↕';
    const label = sortable
      ? `<button type="button" class="sort" data-sort="${c.id}" title="押すと並べ替え">${esc(c.label)}<span class="arrow" aria-hidden="true">${arrow}</span></button>`
      : esc(c.label);
    return `<th scope="col" class="${c.num ? 'r' : ''}${c.sticky ? ' sticky-col' : ''}" ${sortable ? `aria-sort="${aria}"` : ''}>${label}${c.help ? help(c.help) : ''}</th>`;
  }).join('')}</tr>`;
}

export function renderCompare(app, query) {
  document.title = '銘柄の比較表｜テーマ別 銘柄リサーチ';
  const st = parseQuery(query);
  const industries = [...new Set(store.stocks.map((s) => s.industry).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));

  app.innerHTML = `
    <div class="page-head">
      <div class="breadcrumb"><a href="#/">ホーム</a> › 銘柄の比較表</div>
      <h1>銘柄の比較表</h1>
      <p>見出しを押すと並べ替え、<span class="help" aria-hidden="true">?</span> で用語の説明が出ます。スマホでは表を横にスクロールできます。数字は前営業日の終値をもとにしています。</p>
    </div>
    <section class="card stack">
      <div class="row" role="group" aria-label="テーマで絞り込む">
        <span class="small muted">テーマ：</span>
        <button type="button" class="chip" data-theme="" aria-pressed="${st.themes.length === 0}">すべて</button>
        ${store.themes.map((t) => `<button type="button" class="chip" data-theme="${t.id}" aria-pressed="${st.themes.includes(t.id)}"><span class="dot" style="background:${themeColor(t.id)}"></span>${esc(t.short_name)}</button>`).join('')}
      </div>
      <div class="row">
        <label>業種 <select id="f-ind"><option value="">すべて</option>${industries.map((i) => `<option ${i === st.ind ? 'selected' : ''}>${esc(i)}</option>`).join('')}</select></label>
        <label>100株の金額 <select id="f-cap">
          <option value="">すべて</option>
          <option value="250000" ${st.cap === '250000' ? 'selected' : ''}>25万円以下</option>
          <option value="500000" ${st.cap === '500000' ? 'selected' : ''}>50万円以下</option>
          <option value="1000000" ${st.cap === '1000000' ? 'selected' : ''}>100万円以下</option>
        </select></label>
        <label class="sr-only" for="f-q">名前・コードで探す</label>
        <input id="f-q" type="search" placeholder="社名・コードで探す" value="${esc(st.q)}" style="flex:1 1 180px">
      </div>
      <div class="row" role="group" aria-label="表示する列">
        <span class="small muted">表示する列：</span>
        ${GROUPS.map((g) => `<button type="button" class="chip" data-group="${g.id}" aria-pressed="${st.groups.includes(g.id)}">${g.label}</button>`).join('')}
        <span class="spacer"></span>
        <button type="button" class="btn small" id="png">PNGで保存（スライド用）</button>
        <button type="button" class="btn small" id="csv">CSVで保存</button>
      </div>
    </section>
    <p id="count" class="small muted" style="margin:12px 2px 6px"></p>
    <div class="table-wrap" id="tbl"></div>
    <section class="card" style="margin-top:16px">
      <h2 style="margin-top:0">読み方の注意</h2>
      <ul class="small">
        <li>「取得できず」は、データ元から取れなかった数字です（推測で埋めていません）。赤字の会社はPERが計算できません。</li>
        <li>PER・配当利回りの「（予）」は、会社の今期の予想で計算した値です。</li>
        <li>騰落率は株価だけの変化で、配当は含みません。1年・3年は週の終値で計算しています。</li>
        <li>「100株の金額」は株価×100株（手数料は含みません）。STOCKリーグの売買単位は公式資料で確認できていません（<a href="#/rules">ルール</a>）。</li>
        <li>テーマのバッジを押すと、そのテーマの銘柄一覧に移ります。</li>
      </ul>
    </section>
  `;

  const tbl = app.querySelector('#tbl');
  const count = app.querySelector('#count');

  function draw() {
    const cols = visibleCols(st);
    const rows = filtered(st);
    count.textContent = `${rows.length}社を表示（全${store.stocks.length}社）`;
    tbl.innerHTML = `<table><thead>${headHTML(cols, st)}</thead><tbody>${rows.map((s) => `<tr>${cols.map((c) => `<td class="${c.num ? 'r' : ''}${c.sticky ? ' sticky-col' : ''}">${renderCell(c, s)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="muted">条件に合う銘柄がありません</td></tr>`}</tbody></table>`;
    history.replaceState(null, '', `#/compare${toQuery(st) ? '?' + toQuery(st) : ''}`);
  }
  draw();

  app.querySelectorAll('[data-theme]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.theme;
    if (!id) st.themes = [];
    else st.themes = st.themes.includes(id) ? st.themes.filter((x) => x !== id) : [...st.themes, id];
    app.querySelectorAll('[data-theme]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.theme ? st.themes.includes(x.dataset.theme) : st.themes.length === 0));
    draw();
  }));
  app.querySelectorAll('[data-group]').forEach((b) => b.addEventListener('click', () => {
    const g = b.dataset.group;
    st.groups = st.groups.includes(g) ? st.groups.filter((x) => x !== g) : [...st.groups, g];
    b.setAttribute('aria-pressed', st.groups.includes(g));
    draw();
  }));
  app.querySelector('#f-ind').addEventListener('change', (e) => { st.ind = e.target.value; draw(); });
  app.querySelector('#f-cap').addEventListener('change', (e) => { st.cap = e.target.value; draw(); });
  app.querySelector('#f-q').addEventListener('input', (e) => { st.q = e.target.value; draw(); });
  tbl.addEventListener('click', (e) => {
    const b = e.target.closest('button.sort');
    if (!b) return;
    const id = b.dataset.sort;
    if (st.sort === id) st.dir = st.dir === 'desc' ? 'asc' : 'desc';
    else { st.sort = id; st.dir = ['name', 'industry', 'fy'].includes(id) ? 'asc' : 'desc'; }
    draw();
    tbl.querySelector(`button.sort[data-sort="${id}"]`)?.focus();
  });

  function describe() {
    const parts = [];
    parts.push(st.themes.length ? `テーマ：${st.themes.map((t) => theme(t)?.short_name).join('・')}` : 'テーマ：すべて');
    if (st.ind) parts.push(`業種：${st.ind}`);
    if (st.cap) parts.push(`100株の金額：${C.fmtJpAmount(Number(st.cap))}以下`);
    const col = COLUMNS.find((c) => c.id === st.sort);
    if (col) parts.push(`並び順：${col.label}（${st.dir === 'desc' ? '大きい順' : '小さい順'}）`);
    return parts.join('　／　');
  }

  app.querySelector('#png').addEventListener('click', async () => {
    const rows = filtered(st);
    let cols = visibleCols(st).filter((c) => c.id === 'name' || (c.num && c.value));
    // 並べ替えに使った列は必ず入れ、最大7列＋銘柄名
    const sortCol = COLUMNS.find((c) => c.id === st.sort && c.num);
    let numCols = cols.filter((c) => c.id !== 'name');
    if (sortCol && !numCols.includes(sortCol)) numCols = [sortCol, ...numCols];
    if (sortCol) numCols = [sortCol, ...numCols.filter((c) => c !== sortCol)];
    numCols = numCols.slice(0, 7);
    cols = [COLUMNS[0], ...numCols];
    await exportTable({
      title: '銘柄の比較表',
      subtitle: describe(),
      footer: exportFooter(),
      columns: cols.map((c) => ({ label: c.pngLabel || c.label, align: c.num ? 'right' : 'left', width: c.id === 'name' ? 2.4 : c.pngLabel ? 1.3 : 1 })),
      rows: rows.map((s) => cols.map((c) => (c.png ? c.png(s) : C.isNum(c.value(s)) ? c.fmt(c.value(s)) : '取得できず'))),
      note: '「取得できず」はデータ元から取得できなかった値。騰落率は配当を含まない。',
      filename: `compare_${store.meta.data_date || ''}.png`,
    });
  });

  app.querySelector('#csv').addEventListener('click', () => {
    const rows = filtered(st);
    const cols = visibleCols(st);
    const header = ['コード', ...cols.map((c) => c.label + (c.id === 'per' || c.id === 'dividend_yield' ? '' : ''))];
    const raw = (c, s) => {
      if (c.csv) return c.csv(s);
      const v = c.value(s);
      if (!C.isNum(v)) return '';
      if (['return_1m', 'return_6m', 'return_1y', 'return_3y', 'vol_1y', 'mdd_3y', 'sales_cagr_3y', 'op_margin'].includes(c.id)) return (v * 100).toFixed(2);
      return v;
    };
    downloadCSV(`compare_${store.meta.data_date || ''}.csv`, header, rows.map((s) => [s.code, ...cols.map((c) => raw(c, s))]));
  });
}

export { GLOSSARY };
