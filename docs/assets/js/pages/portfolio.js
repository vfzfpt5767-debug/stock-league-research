import * as C from '../calc.js';
import { store, esc, help, themeBadge, theme, themeColorHex, na, signed, loadPrices, loadBench, exportFooter, savedPortfolio, savePortfolio, toast, hundredCost } from '../ui.js';
import { lineChart, barChart, palette, legendHTML } from '../charts.js';
import { exportChart, exportTable } from '../export.js';

const JPX_FACTSHEET = 'https://www.jpx.co.jp/markets/indices/factsheets/files/001_fac2_TOPIX.pdf';
const JPX_TOPIX = 'https://www.jpx.co.jp/markets/indices/topix/index.html';

function initialState(query) {
  const fromUrl = C.decodePortfolio(query);
  if (fromUrl.items.length || Object.keys(fromUrl.topix).length) return fromUrl;
  const saved = savedPortfolio();
  if (saved && Array.isArray(saved.items)) return { items: saved.items.filter((i) => /^[0-9]{3}[0-9A-Z]$/.test(i.code)), lot: saved.lot === 1 ? 1 : 100, topix: saved.topix || {}, name: saved.name || '' };
  return { items: [], lot: 100, topix: {}, name: '' };
}

function shareUrl(state) {
  const base = location.href.split('#')[0];
  return `${base}#/portfolio?${C.encodePortfolio(state)}`;
}

export async function renderPortfolio(app, query) {
  document.title = 'ポートフォリオ試算｜テーマ別 銘柄リサーチ';
  const rules = store.rules.portfolio;
  const st = initialState(query);
  let period = '1y';
  const prices = Object.fromEntries(store.stocks.map((s) => [s.code, s.price]));

  app.innerHTML = `
    <div class="page-head">
      <div class="breadcrumb"><a href="#/">ホーム</a> › ポートフォリオ試算</div>
      <h1>ポートフォリオの試し組み</h1>
      <p>銘柄と金額を選ぶと、STOCKリーグのルール（仮想資金${C.fmtJpAmount(rules.budget_yen)}・${rules.min_stocks}〜${rules.max_stocks}銘柄・手数料1.1％${help('fee')}）で株数を計算し、業種のかたよりや過去の値動きを見られます。
      <b>「共有用のURLをコピー」</b>でグループに送ると、同じ組み合わせを開けます。入力はこの端末にも保存されます。</p>
    </div>

    <section class="card stack">
      <div class="row">
        <label>案の名前（任意）<br><input id="pf-name" type="text" maxlength="40" placeholder="例：A案 脱炭素＋半導体" value="${esc(st.name || '')}"></label>
        <div>
          <span class="small muted">売買単位 ${help('lot')}</span><br>
          <div class="seg" role="group" aria-label="売買単位">
            <button type="button" data-lot="100" aria-pressed="${st.lot === 100}">100株単位</button>
            <button type="button" data-lot="1" aria-pressed="${st.lot === 1}">1株単位</button>
          </div>
        </div>
      </div>
      <div>
        <label for="pf-search">銘柄を追加（社名・コード・テーマ名で探す）</label>
        <div class="pf-add"><input id="pf-search" type="search" placeholder="例：トヨタ、6758、半導体" autocomplete="off"></div>
        <div id="pf-suggest" class="suggest hidden" role="listbox"></div>
        <div class="row small" style="margin-top:6px"><span class="muted">テーマからまとめて候補を表示：</span>${store.themes.map((t) => `<button type="button" class="chip" data-suggest-theme="${t.id}">${esc(t.short_name)}</button>`).join('')}</div>
      </div>
      <div class="table-wrap pf-table"><table>
        <thead><tr><th>銘柄</th><th class="r">株価</th><th class="r">金額（円）</th><th class="r">株数</th><th class="r">手数料込み</th><th class="r">割合</th><th></th></tr></thead>
        <tbody id="pf-rows"></tbody>
      </table></div>
      <div class="row">
        <button type="button" class="btn" id="pf-equal">予算を均等に配分</button>
        <button type="button" class="btn" id="pf-clear">すべて削除</button>
        <span class="spacer"></span>
        <button type="button" class="btn primary" id="pf-share">共有用のURLをコピー</button>
      </div>
    </section>

    <section class="card">
      <h2 style="margin-top:0">合計とチェック</h2>
      <div class="sum-grid" id="pf-sum"></div>
      <div id="pf-warn" style="margin-top:10px"></div>
    </section>

    <section class="card">
      <div class="chart-head">
        <h2 style="margin:0">過去の値動き（もし期間の最初に買っていたら）</h2>
        <div class="row">
          <div class="seg" role="group" aria-label="期間"><button type="button" data-period="1y" aria-pressed="true">過去1年</button><button type="button" data-period="3y" aria-pressed="false">過去3年</button></div>
          <button type="button" class="btn small" id="png-line">グラフをPNG</button>
        </div>
      </div>
      <p class="small muted" style="margin:0 0 6px">今の金額の割合で期間の最初に買い、そのまま持ち続けた場合の評価額の推移（最初＝100、株価のみ・配当なし、週の終値）。過去の結果で、これからの値動きを示すものではありません。</p>
      <div id="pf-line-legend"></div>
      <div class="chart-box"><canvas id="pf-line" role="img" aria-label="ポートフォリオの過去の推移"></canvas></div>
      <p id="pf-excluded" class="small muted"></p>
      <div class="chart-head" style="margin-top:12px"><h3 style="margin:0">数字で比べる</h3><div class="row"><button type="button" class="btn small" id="png-cmp">比較グラフをPNG</button><button type="button" class="btn small" id="png-stats">表をPNG</button></div></div>
      <div class="table-wrap"><table id="pf-stats"></table></div>
      <div class="chart-box short" style="margin-top:10px"><canvas id="pf-cmp" role="img" aria-label="騰落率の比較"></canvas></div>
      <details style="margin-top:12px" ${Object.keys(st.topix).length ? 'open' : ''}>
        <summary>TOPIX（東証株価指数）の数字を入力して比べる ${help('topix')}</summary>
        <div class="notice info" style="margin-top:8px">
          TOPIXの数値はJPX（日本取引所グループ）の規約で再配信が禁止されているため、このサイトは自動では表示しません。
          <a href="${JPX_FACTSHEET}" rel="noopener">JPX公式の「TOPIX ファクトシート」（PDF）</a>の「パフォーマンス（配当込み）」「リスク」の表を見て、下に入力してください（<a href="${JPX_TOPIX}" rel="noopener">TOPIXのページ</a>）。
          入力した値はURLに入るので、グループで共有できます。<b>ファクトシートの数字は配当込み・月末時点</b>で、このサイトの計算（株価のみ・最新日）とは条件が少し違います。
        </div>
        <div class="grid grid-3" style="margin-top:10px">
          <div><b>過去1年</b><br>
            <label>リターン（%）<input type="number" step="0.01" data-topix="t1" value="${st.topix.t1 ?? ''}"></label><br>
            <label>リスク（%）<input type="number" step="0.01" data-topix="v1" value="${st.topix.v1 ?? ''}"></label><br>
            <label>最大ドローダウン（%、マイナスで）<input type="number" step="0.01" data-topix="m1" value="${st.topix.m1 ?? ''}"></label></div>
          <div><b>過去3年</b><br>
            <label>リターン（%）<input type="number" step="0.01" data-topix="t3" value="${st.topix.t3 ?? ''}"></label><br>
            <label>リスク（%）<input type="number" step="0.01" data-topix="v3" value="${st.topix.v3 ?? ''}"></label><br>
            <label>最大ドローダウン（%、マイナスで）<input type="number" step="0.01" data-topix="m3" value="${st.topix.m3 ?? ''}"></label></div>
          <div><b>いつ時点の数字か</b><br><label>基準日 <input type="text" data-topix="td" placeholder="例：2026-09-30" value="${esc(st.topix.td || '')}"></label>
            <p class="small muted">ファクトシートの右上の日付（〇年〇月〇日時点）を入れてください。</p></div>
        </div>
      </details>
    </section>

    <section class="card">
      <div class="chart-head"><h2 style="margin:0">かたよりのチェック</h2><button type="button" class="btn small" id="png-ind">業種のかたよりをPNG</button></div>
      <div class="grid grid-2">
        <div><h3>業種 ${help('industry')}</h3><div id="pf-ind"></div></div>
        <div><h3>テーマ</h3><div id="pf-theme"></div><p class="small muted">複数のテーマに入っている銘柄は、金額をテーマの数で等分して数えています。</p>
          <h3>集中度</h3><div id="pf-conc"></div></div>
      </div>
    </section>
  `;

  const $ = (sel) => app.querySelector(sel);
  const rowsEl = $('#pf-rows');

  function persist() {
    savePortfolio(st);
    history.replaceState(null, '', `#/portfolio${C.encodePortfolio(st) ? '?' + C.encodePortfolio(st) : ''}`);
  }

  function plan() {
    return C.planPortfolio(st.items, prices, st.lot, { ...rules });
  }

  function renderRows() {
    const p = plan();
    rowsEl.innerHTML = st.items.length ? st.items.map((it, i) => {
      const s = store.byCode[it.code];
      const r = p.rows[i];
      const share = p.invested > 0 ? r.cost / p.invested : null;
      return `<tr data-i="${i}">
        <td><span class="name-cell">${s ? `<a href="#/stock/${esc(s.code)}">${esc(s.name)}</a>` : esc(it.code)}<span class="code">${esc(it.code)}</span></span><br>${s ? s.themes.map((t) => themeBadge(t)).join(' ') : '<span class="na">候補にない銘柄</span>'}</td>
        <td class="r">${C.isNum(r.price) ? `<span class="num">${C.fmtYen(r.price)}</span>` : na()}</td>
        <td class="r"><label class="sr-only" for="amt-${i}">${esc(s?.name || it.code)}の金額</label><input id="amt-${i}" type="number" inputmode="numeric" min="0" step="10000" value="${it.amount}" data-amt="${i}"></td>
        <td class="r num" data-cell="shares">${r.shares.toLocaleString('ja-JP')}株</td>
        <td class="r num" data-cell="total">${C.fmtYen(r.total)}</td>
        <td class="r num" data-cell="share">${C.isNum(share) ? C.fmtPct(share, { sign: false }) : '—'}</td>
        <td><button type="button" class="btn small" data-del="${i}" aria-label="${esc(s?.name || it.code)}を削除">削除</button></td>
      </tr>`;
    }).join('') : `<tr><td colspan="7" class="muted">まだ銘柄がありません。上の検索欄や、各銘柄のページの「ポートフォリオ試算に追加」から追加してください。</td></tr>`;
    renderSummary(p);
  }

  function updateRowCells() {
    const p = plan();
    st.items.forEach((it, i) => {
      const tr = rowsEl.querySelector(`tr[data-i="${i}"]`);
      if (!tr) return;
      const r = p.rows[i];
      const share = p.invested > 0 ? r.cost / p.invested : null;
      tr.querySelector('[data-cell="shares"]').textContent = `${r.shares.toLocaleString('ja-JP')}株`;
      tr.querySelector('[data-cell="total"]').textContent = C.fmtYen(r.total);
      tr.querySelector('[data-cell="share"]').textContent = C.isNum(share) ? C.fmtPct(share, { sign: false }) : '—';
    });
    renderSummary(p);
  }

  function renderSummary(p) {
    const okCount = p.count >= rules.min_stocks && p.count <= rules.max_stocks;
    $('#pf-sum').innerHTML = `
      <div class="tile"><div class="label">買えている銘柄数</div><div class="value">${p.count}銘柄</div><div class="sub"><span class="badge ${okCount ? 'ok' : 'warn'}">${okCount ? '✓ 10〜20銘柄の範囲内' : `⚠ ${rules.min_stocks}〜${rules.max_stocks}銘柄が必要`}</span></div></div>
      <div class="tile"><div class="label">株を買う金額</div><div class="value num">${C.fmtYen(p.invested)}</div></div>
      <div class="tile"><div class="label">手数料（1.1％）${help('fee')}</div><div class="value num">${C.fmtYen(p.fees)}</div></div>
      <div class="tile"><div class="label">合計（手数料込み）</div><div class="value num">${C.fmtYen(p.total)}</div><div class="sub">仮想資金 ${C.fmtYen(p.budget)}</div></div>
      <div class="tile"><div class="label">残る現金</div><div class="value num ${p.cash < 0 ? 'down' : ''}">${C.fmtYen(p.cash)}</div></div>`;
    $('#pf-warn').innerHTML = p.warnings.length
      ? `<div class="notice"><b>⚠ 確認してください</b><ul>${p.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>`
      : (st.items.length ? '<div class="notice info">✓ ルール（銘柄数・予算）の範囲に収まっています。</div>' : '');
  }

  // ---------- 分析（過去の値動き・かたより） ----------
  let analysisTimer = null;
  let lastAnalysis = null;
  function scheduleAnalysis() {
    clearTimeout(analysisTimer);
    analysisTimer = setTimeout(runAnalysis, 350);
  }

  async function runAnalysis() {
    const p = plan();
    const held = p.rows.filter((r) => r.shares > 0);
    const weights = Object.fromEntries(held.map((r) => [r.code, r.cost]));
    const end = store.meta.data_date;
    const pal = palette();
    const bench = await loadBench();
    const weekly = {};
    await Promise.all(held.map(async (r) => {
      const d = await loadPrices(r.code);
      const w = [...(d.weekly || [])];
      const last = d.daily?.[d.daily.length - 1];
      if (last && (!w.length || w[w.length - 1][0] < last[0])) w.push(last);
      weekly[r.code] = w;
    }));
    if (!document.body.contains(rowsEl)) return; // 別のページに移動した
    const days = period === '1y' ? 365 : 365 * 3;
    const start = end ? C.addDays(end, -days) : null;
    const bt = held.length && start ? C.backtest(weights, weekly, start, end) : { series: [], included: [], excluded: [] };
    const benchSeries = bench && start ? C.rebase(bench.series, start) : [];
    const pfStats = C.seriesStats(bt.series);
    const bStats = C.seriesStats(benchSeries);
    const tk = period === '1y' ? { ret: st.topix.t1, vol: st.topix.v1, mdd: st.topix.m1 } : { ret: st.topix.t3, vol: st.topix.v3, mdd: st.topix.m3 };
    const topix = { ret: C.isNum(tk.ret) ? tk.ret / 100 : null, vol: C.isNum(tk.vol) ? tk.vol / 100 : null, mdd: C.isNum(tk.mdd) ? -Math.abs(tk.mdd) / 100 : null };
    lastAnalysis = { bt, benchSeries, pfStats, bStats, topix, start, end };

    const ds = [];
    if (bt.series.length) ds.push({ label: 'このポートフォリオ', data: bt.series, color: pal.series[0], width: 2.5 });
    if (benchSeries.length) ds.push({ label: '全候補の等金額平均', data: benchSeries, color: pal.muted, width: 1.5, dashed: true });
    $('#pf-line-legend').innerHTML = ds.length > 1 ? legendHTML(ds.map((d) => ({ label: d.label, color: d.color }))) + `<p class="small muted" style="margin:-4px 0 6px">「全候補の等金額平均」${help('equal_weight')}はTOPIXではありません。</p>` : '';
    const canvas = $('#pf-line');
    if (ds.length) lineChart(canvas, { datasets: ds, yFormat: (v) => C.fmtNum(v, 0), tooltipFormat: (v) => C.fmtNum(v, 1) });
    $('#pf-excluded').textContent = bt.excluded.length
      ? `※ ${bt.excluded.map((c) => store.byCode[c]?.name || c).join('、')} は、この期間の最初の株価がない（上場が新しい等）ため、グラフと数字の計算から外しています。`
      : (held.length ? '' : '銘柄を追加すると、ここに過去の値動きが表示されます。');

    const label = period === '1y' ? '過去1年' : '過去3年';
    const fmtRet = (v) => (C.isNum(v) ? signed(v) : na());
    const fmtVol = (v) => (C.isNum(v) ? `<span class="num">${C.fmtPct(v, { sign: false })}</span>` : na());
    const fmtMdd = (v) => (C.isNum(v) ? `<span class="num">${C.fmtPct(v)}</span>` : na());
    $('#pf-stats').innerHTML = `
      <thead><tr><th>${label}</th><th class="r">このポートフォリオ<br><small class="muted">株価のみ</small></th><th class="r">全候補の等金額平均<br><small class="muted">株価のみ</small></th><th class="r">TOPIX（入力値）<br><small class="muted">配当込み${st.topix.td ? '・' + esc(st.topix.td) : ''}</small></th></tr></thead>
      <tbody>
        <tr><th scope="row">騰落率 ${help('return')}</th><td class="r">${fmtRet(pfStats.ret)}</td><td class="r">${fmtRet(bStats.ret)}</td><td class="r">${fmtRet(topix.ret)}</td></tr>
        <tr><th scope="row">値動きの大きさ ${help('vol')}</th><td class="r">${fmtVol(pfStats.vol)}</td><td class="r">${fmtVol(bStats.vol)}</td><td class="r">${fmtVol(topix.vol)}</td></tr>
        <tr><th scope="row">最大下落率 ${help('mdd')}</th><td class="r">${fmtMdd(pfStats.mdd)}</td><td class="r">${fmtMdd(bStats.mdd)}</td><td class="r">${fmtMdd(topix.mdd)}</td></tr>
      </tbody>`;
    drawCmp($('#pf-cmp'), 1, false);
    renderAllocation(p);
  }

  function cmpData() {
    const a = lastAnalysis;
    return {
      labels: ['このポートフォリオ', '全候補の等金額平均', 'TOPIX（入力値）'],
      values: [a.pfStats.ret, a.bStats.ret, a.topix.ret].map((v) => (C.isNum(v) ? v * 100 : null)),
    };
  }

  function drawCmp(cv, scale, ex) {
    if (!lastAnalysis) return null;
    const d = cmpData();
    const pal = palette(ex);
    return barChart(cv, {
      labels: d.labels,
      groups: [{ label: `騰落率（${period === '1y' ? '過去1年' : '過去3年'}）`, values: d.values, colors: [pal.series[0], pal.muted, pal.series[1]] }],
      format: (v) => `${C.fmtNum(v, 1)}%`, horizontal: true, scale, forExport: ex, valueLabels: true,
    });
  }

  function allocation(p) {
    const ind = {};
    const th = {};
    const total = p.invested || 0;
    for (const r of p.rows) {
      if (!r.cost) continue;
      const s = store.byCode[r.code];
      const k = s?.industry || '不明';
      ind[k] = (ind[k] || 0) + r.cost;
      const ts = s?.themes?.length ? s.themes : ['other'];
      for (const t of ts) th[t] = (th[t] || 0) + r.cost / ts.length;
    }
    const sortObj = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
    const costs = p.rows.map((r) => r.cost).filter((c) => c > 0).sort((a, b) => b - a);
    return { ind: sortObj(ind), th: sortObj(th), total, top1: total ? costs[0] / total : null, top3: total ? costs.slice(0, 3).reduce((a, b) => a + b, 0) / total : null };
  }

  function renderAllocation(p) {
    const a = allocation(p);
    const bar = (label, v, color) => `<div class="bar-row"><span>${label}</span><span class="track"><span class="fill" style="width:${a.total ? (v / a.total) * 100 : 0}%;${color ? `background:${color}` : ''}"></span></span><span class="num">${a.total ? C.fmtPct(v / a.total, { sign: false }) : '—'}</span></div>`;
    $('#pf-ind').innerHTML = a.ind.length ? a.ind.map(([k, v]) => bar(esc(k), v)).join('') : '<p class="muted">銘柄を追加すると表示されます。</p>';
    $('#pf-theme').innerHTML = a.th.length ? a.th.map(([k, v]) => bar(esc(theme(k)?.short_name || 'その他'), v, `var(--t${((store.themeIndex[k] ?? 0) % 8) + 1})`)).join('') : '<p class="muted">—</p>';
    $('#pf-conc').innerHTML = a.total
      ? `<div class="sum-grid"><div class="tile"><div class="label">いちばん大きい銘柄の割合</div><div class="value">${C.fmtPct(a.top1, { sign: false })}</div></div><div class="tile"><div class="label">上位3銘柄の割合</div><div class="value">${C.fmtPct(a.top3, { sign: false })}</div></div><div class="tile"><div class="label">業種の数</div><div class="value">${a.ind.length}</div></div></div>`
      : '';
  }

  // ---------- 入力のイベント ----------
  function refresh(full = true) {
    if (full) renderRows(); else updateRowCells();
    persist();
    scheduleAnalysis();
  }

  rowsEl.addEventListener('input', (e) => {
    const i = e.target.dataset.amt;
    if (i === undefined) return;
    st.items[Number(i)].amount = Math.max(0, Math.round(Number(e.target.value) || 0));
    refresh(false);
  });
  rowsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    st.items.splice(Number(b.dataset.del), 1);
    refresh();
  });
  app.querySelectorAll('[data-lot]').forEach((b) => b.addEventListener('click', () => {
    st.lot = Number(b.dataset.lot);
    app.querySelectorAll('[data-lot]').forEach((x) => x.setAttribute('aria-pressed', Number(x.dataset.lot) === st.lot));
    refresh();
  }));
  $('#pf-name').addEventListener('input', (e) => { st.name = e.target.value.slice(0, 40); persist(); });
  $('#pf-equal').addEventListener('click', () => {
    if (!st.items.length) return;
    // 手数料（1.1％）の分を残して均等に
    const each = Math.floor(rules.budget_yen / (1 + C.feeRate(rules)) / st.items.length / 1000) * 1000;
    st.items = st.items.map((i) => ({ ...i, amount: each }));
    refresh();
  });
  $('#pf-clear').addEventListener('click', () => {
    if (!st.items.length || !confirm('すべての銘柄を削除しますか？')) return;
    st.items = [];
    refresh();
  });
  $('#pf-share').addEventListener('click', async () => {
    const url = shareUrl(st);
    try {
      await navigator.clipboard.writeText(url);
      toast('共有用のURLをコピーしました。LINEなどに貼って送れます');
    } catch (e) {
      prompt('このURLをコピーしてください', url);
    }
  });
  app.querySelectorAll('[data-period]').forEach((b) => b.addEventListener('click', () => {
    period = b.dataset.period;
    app.querySelectorAll('[data-period]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.period === period));
    runAnalysis();
  }));
  app.querySelectorAll('[data-topix]').forEach((inp) => inp.addEventListener('input', () => {
    const k = inp.dataset.topix;
    if (k === 'td') st.topix.td = inp.value.trim().slice(0, 10) || undefined;
    else {
      const v = parseFloat(inp.value);
      if (Number.isFinite(v)) st.topix[k] = v; else delete st.topix[k];
    }
    persist();
    scheduleAnalysis();
  }));

  // ---------- 銘柄の検索・追加 ----------
  const search = $('#pf-search');
  const sug = $('#pf-suggest');
  function addCode(code) {
    if (st.items.some((i) => i.code === code)) { toast('すでに入っています'); return; }
    if (st.items.length >= 30) { toast('30銘柄までにしてください'); return; }
    const p = plan();
    const left = Math.max(0, p.budget - p.total);
    const def = Math.min(250000, Math.floor(left / 10000) * 10000) || 250000;
    st.items.push({ code, amount: def });
    refresh();
    toast(`${store.byCode[code]?.name || code} を追加しました`);
  }
  function showSuggest(list) {
    if (!list.length) { sug.innerHTML = '<div class="muted small" style="padding:8px 12px">見つかりません（このサイトの候補の中から探します）</div>'; sug.classList.remove('hidden'); return; }
    sug.innerHTML = list.slice(0, 40).map((s) => `<button type="button" role="option" data-add="${esc(s.code)}">
      <span style="flex:1"><b>${esc(s.name)}</b> <span class="muted small">${esc(s.code)}・${esc(s.themes.map((t) => theme(t)?.short_name).join('/'))}</span></span>
      <span class="small num">${C.isNum(s.price) ? `100株 ${C.fmtJpAmount(hundredCost(s))}` : '株価取得できず'}</span>
      ${st.items.some((i) => i.code === s.code) ? '<span class="small muted">追加済み</span>' : ''}</button>`).join('');
    sug.classList.remove('hidden');
  }
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    if (!q) { sug.classList.add('hidden'); return; }
    const list = store.stocks.filter((s) => `${s.name} ${s.code} ${s.themes.map((t) => `${theme(t)?.name} ${theme(t)?.short_name}`).join(' ')} ${s.industry || ''}`.toLowerCase().includes(q));
    showSuggest(list);
  });
  app.querySelectorAll('[data-suggest-theme]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.suggestTheme;
    showSuggest(store.stocks.filter((s) => s.themes.includes(id)).sort((a, c) => (c.market_cap ?? 0) - (a.market_cap ?? 0)));
  }));
  sug.addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    addCode(b.dataset.add);
    b.insertAdjacentHTML('beforeend', '<span class="small muted">追加済み</span>');
  });

  // ---------- PNG ----------
  const title = () => (st.name ? `ポートフォリオ「${st.name}」` : 'ポートフォリオの試算');
  $('#png-line').addEventListener('click', () => {
    if (!lastAnalysis || !lastAnalysis.bt.series.length) { toast('先に銘柄を追加してください'); return; }
    const a = lastAnalysis;
    const pe = palette(true);
    const ds = [{ label: 'このポートフォリオ', data: a.bt.series, color: pe.series[0], width: 2.5 }];
    if (a.benchSeries.length) ds.push({ label: '全候補の等金額平均', data: a.benchSeries, color: pe.muted, width: 1.5, dashed: true });
    exportChart({
      title: `${title()}：${period === '1y' ? '過去1年' : '過去3年'}の値動き`,
      subtitle: `最初＝100。今の金額の割合で${a.start.replaceAll('-', '/')}に買って持ち続けた場合（株価のみ・週の終値）。騰落率 ${C.isNum(a.pfStats.ret) ? C.fmtPct(a.pfStats.ret) : '—'}`,
      legendItems: ds.map((d) => ({ label: d.label, color: d.color })),
      footer: exportFooter(),
      build: (cv, sc) => lineChart(cv, { datasets: ds, yFormat: (v) => C.fmtNum(v, 0), scale: sc, forExport: true }),
      filename: `ポートフォリオ_推移_${period}.png`,
    });
  });
  $('#png-cmp').addEventListener('click', () => {
    if (!lastAnalysis) return;
    exportChart({
      title: `${title()}：騰落率の比較（${period === '1y' ? '過去1年' : '過去3年'}）`,
      subtitle: `ポートフォリオと等金額平均は株価のみ。TOPIXはJPX公表の配当込みの値（${st.topix.td || '基準日未入力'}）を入力したもの`,
      footer: `${exportFooter()}｜TOPIX：JPX「TOPIX ファクトシート」より入力`,
      build: (cv, sc) => drawCmp(cv, sc, true),
      filename: `ポートフォリオ_比較_${period}.png`,
    });
  });
  $('#png-stats').addEventListener('click', () => {
    if (!lastAnalysis) return;
    const a = lastAnalysis;
    const f = (v, k) => (!C.isNum(v) ? '取得できず' : k === 'ret' ? C.fmtPct(v) : k === 'vol' ? C.fmtPct(v, { sign: false }) : C.fmtPct(v));
    exportTable({
      title: `${title()}：${period === '1y' ? '過去1年' : '過去3年'}の数字`,
      subtitle: `${plan().count}銘柄・合計${C.fmtYen(plan().total)}（手数料込み）`,
      footer: exportFooter(),
      columns: [{ label: '', width: 1.6 }, { label: 'このポートフォリオ', align: 'right', width: 1.4 }, { label: '全候補の等金額平均', align: 'right', width: 1.4 }, { label: 'TOPIX（入力値）', align: 'right', width: 1.4 }],
      rows: [
        ['騰落率', f(a.pfStats.ret, 'ret'), f(a.bStats.ret, 'ret'), f(a.topix.ret, 'ret')],
        ['値動きの大きさ（年率）', f(a.pfStats.vol, 'vol'), f(a.bStats.vol, 'vol'), f(a.topix.vol, 'vol')],
        ['最大下落率', f(a.pfStats.mdd, 'mdd'), f(a.bStats.mdd, 'mdd'), f(a.topix.mdd, 'mdd')],
      ],
      note: 'ポートフォリオ・等金額平均は株価のみ（配当なし）、週の終値。TOPIXはJPXファクトシートの配当込みの値を入力。',
      filename: `ポートフォリオ_数字_${period}.png`,
    });
  });
  $('#png-ind').addEventListener('click', () => {
    const a = allocation(plan());
    if (!a.total) { toast('先に銘柄を追加してください'); return; }
    exportChart({
      title: `${title()}：業種のかたより`,
      subtitle: `株を買う金額に占める割合（${plan().count}銘柄）`,
      footer: exportFooter(),
      build: (cv, sc) => barChart(cv, { labels: a.ind.map(([k]) => k), groups: [{ label: '割合', values: a.ind.map(([, v]) => (v / a.total) * 100), color: palette(true).series[0] }], format: (v) => `${C.fmtNum(v, 1)}%`, horizontal: true, scale: sc, forExport: true, valueLabels: true }),
      filename: 'ポートフォリオ_業種.png',
    });
  });

  renderRows();
  persist();
  runAnalysis();
  void themeColorHex;
}
