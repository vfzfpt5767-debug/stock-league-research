import * as C from '../calc.js';
import { store, esc, help, themeBadge, theme, na, signed, exportFooter, savedPortfolio, savePortfolio, toast, memoPrice, setMemoPrice, extLinks } from '../ui.js';
import { barChart, palette } from '../charts.js';
import { exportChart, exportTable } from '../export.js';

const JPX_TOPIX = 'https://www.jpx.co.jp/markets/indices/topix/index.html';

function initialState(query) {
  const fromUrl = C.decodePortfolio(query);
  if (fromUrl.items.length || Object.keys(fromUrl.topix).length) return fromUrl;
  const saved = savedPortfolio();
  if (saved && Array.isArray(saved.items)) {
    return {
      items: saved.items.filter((i) => /^[0-9]{3}[0-9A-Z]$/.test(i.code)),
      prices: saved.prices || {}, pastPrices: saved.pastPrices || {}, pastDate: saved.pastDate || '',
      lot: saved.lot === 1 ? 1 : 100, topix: saved.topix || {}, name: saved.name || '',
    };
  }
  return { items: [], prices: {}, pastPrices: {}, pastDate: '', lot: 100, topix: {}, name: '' };
}

function shareUrl(state) {
  return `${location.href.split('#')[0]}#/portfolio?${C.encodePortfolio(state)}`;
}

export async function renderPortfolio(app, query) {
  document.title = 'ポートフォリオ試算｜テーマ別 銘柄リサーチ';
  const rules = store.rules.portfolio;
  const st = initialState(query);
  // URLに株価がなければ、この端末の株価メモで補う
  for (const it of st.items) {
    if (!C.isNum(st.prices[it.code]) && memoPrice(it.code)) st.prices[it.code] = memoPrice(it.code).price;
  }
  let showPast = Object.keys(st.pastPrices).length > 0;

  app.innerHTML = `
    <div class="page-head">
      <div class="breadcrumb"><a href="#/">ホーム</a> › ポートフォリオ試算</div>
      <h1>ポートフォリオの試し組み</h1>
      <p>銘柄・株価・金額を入れると、STOCKリーグのルール（仮想資金${C.fmtJpAmount(rules.budget_yen)}・${rules.min_stocks}〜${rules.max_stocks}銘柄・手数料1.1％${help('fee')}）で株数を計算し、業種やテーマのかたよりを確かめられます。
      <b>「共有用のURLをコピー」</b>でグループに送ると、同じ組み合わせ（入力した株価も）を開けます。</p>
      <p class="small muted">株価は自分で入力します（STOCKリーグのバーチャル投資システムや証券会社のサイトで確認）。このサイトは株価データを自動で集めていません（<a href="#/about">理由</a>）。</p>
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
        <thead><tr><th>銘柄</th><th class="r">株価（入力）</th><th class="r past-col">比べたい過去の時点の株価</th><th class="r">金額（円）</th><th class="r">株数</th><th class="r">手数料込み</th><th class="r">割合</th><th></th></tr></thead>
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
      <div class="chart-head"><h2 style="margin:0">かたよりのチェック</h2><button type="button" class="btn small" id="png-ind">業種のかたよりをPNG</button></div>
      <div class="grid grid-2">
        <div><h3>業種 ${help('industry')}</h3><div id="pf-ind"></div></div>
        <div><h3>テーマ</h3><div id="pf-theme"></div><p class="small muted">複数のテーマに入っている銘柄は、金額をテーマの数で等分して数えています。</p>
          <h3>集中度</h3><div id="pf-conc"></div></div>
      </div>
    </section>

    <section class="card">
      <div class="chart-head"><h2 style="margin:0">過去と比べる（任意）</h2><button type="button" class="btn small" id="png-past">比較をPNG</button></div>
      <p class="small">ある過去の時点（例：1年前、STOCKリーグで買った日）の株価を入れると、「今の金額の割合でその日に買っていたら、今どれくらいか」を計算し、同じ期間の TOPIX ${help('topix')} と比べられます。値はすべて自分で調べて入力します。</p>
      <div class="row">
        <button type="button" class="btn" id="pf-toggle-past">${showPast ? '過去の株価の列を隠す' : '過去の株価の列を表示'}</button>
        <label>過去の時点（日付）<br><input id="pf-past-date" type="text" placeholder="2025-11-04" value="${esc(st.pastDate || '')}" style="width:9em"></label>
        <label>同じ期間の TOPIX の騰落率（%）<br><input id="pf-tp" type="number" step="0.01" value="${st.topix.tp ?? ''}" style="width:9em"></label>
      </div>
      <p class="small muted">TOPIX の値は <a href="${JPX_TOPIX}" rel="noopener" target="_blank">JPX公式のTOPIXのページ ↗</a> や証券会社のサイトで確認し、「（今の値 ÷ 過去の時点の値 − 1）× 100」で計算して入れてください（JPXの規約によりこのサイトでは自動表示できません）。</p>
      <div class="table-wrap" style="margin-top:8px"><table id="pf-past"></table></div>
      ${store.hasFin ? `<h3>参考：各社が開示した株主総利回り ${help('tsr')}（金額で加重平均）</h3><div class="table-wrap"><table id="pf-tsr"></table></div>
        <p class="small muted">各社の直近の有価証券報告書（決算期末）の値を、今の金額の割合で平均したもの。会社ごとに決算期と比較指標が違うことがあるため、目安として見てください。</p>` : ''}
    </section>
  `;

  const $ = (sel) => app.querySelector(sel);
  const rowsEl = $('#pf-rows');

  function persist() {
    savePortfolio(st);
    const q = C.encodePortfolio(st);
    history.replaceState(null, '', `#/portfolio${q ? '?' + q : ''}`);
  }

  const plan = () => C.planPortfolio(st.items, st.prices, st.lot, { ...rules });

  function setPastVisible() {
    app.querySelectorAll('.past-col').forEach((el) => el.classList.toggle('hidden', !showPast));
    $('#pf-toggle-past').textContent = showPast ? '過去の株価の列を隠す' : '過去の株価の列を表示';
  }

  function renderRows() {
    const p = plan();
    rowsEl.innerHTML = st.items.length ? st.items.map((it, i) => {
      const s = store.byCode[it.code];
      const r = p.rows[i];
      const share = p.invested > 0 ? r.cost / p.invested : null;
      const nm = esc(s?.name || it.code);
      return `<tr data-i="${i}">
        <td><span class="name-cell">${s ? `<a href="#/stock/${esc(s.code)}">${nm}</a>` : nm}<span class="code">${esc(it.code)}</span></span><br>${s ? s.themes.map((t) => themeBadge(t)).join(' ') : '<span class="na">候補にない銘柄</span>'}
          <div class="small"><a href="${esc(extLinks(it.code)[0].url)}" rel="noopener" target="_blank">株価を調べる ↗</a></div></td>
        <td class="r"><label class="sr-only" for="pr-${i}">${nm}の株価</label><input id="pr-${i}" type="number" inputmode="decimal" min="0" step="1" placeholder="株価" value="${C.isNum(st.prices[it.code]) ? st.prices[it.code] : ''}" data-price="${i}" style="width:7.5em"></td>
        <td class="r past-col"><label class="sr-only" for="pp-${i}">${nm}の過去の株価</label><input id="pp-${i}" type="number" inputmode="decimal" min="0" step="1" placeholder="過去の株価" value="${C.isNum(st.pastPrices[it.code]) ? st.pastPrices[it.code] : ''}" data-past="${i}" style="width:7.5em"></td>
        <td class="r"><label class="sr-only" for="amt-${i}">${nm}の金額</label><input id="amt-${i}" type="number" inputmode="numeric" min="0" step="10000" value="${it.amount}" data-amt="${i}"></td>
        <td class="r num" data-cell="shares">${r.shares.toLocaleString('ja-JP')}株</td>
        <td class="r num" data-cell="total">${C.fmtYen(r.total)}</td>
        <td class="r num" data-cell="share">${C.isNum(share) ? C.fmtPct(share, { sign: false }) : '—'}</td>
        <td><button type="button" class="btn small" data-del="${i}" aria-label="${nm}を削除">削除</button></td>
      </tr>`;
    }).join('') : `<tr><td colspan="8" class="muted">まだ銘柄がありません。上の検索欄や、各銘柄のページの「ポートフォリオ試算に追加」から追加してください。</td></tr>`;
    setPastVisible();
    renderDerived(p);
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
    renderDerived(p);
  }

  function renderDerived(p) {
    renderSummary(p);
    renderAllocation(p);
    renderPast(p);
  }

  function renderSummary(p) {
    const okCount = p.count >= rules.min_stocks && p.count <= rules.max_stocks;
    const noPrice = st.items.filter((it) => !C.isNum(st.prices[it.code])).length;
    $('#pf-sum').innerHTML = `
      <div class="tile"><div class="label">買えている銘柄数</div><div class="value">${p.count}銘柄</div><div class="sub"><span class="badge ${okCount ? 'ok' : 'warn'}">${okCount ? '✓ 10〜20銘柄の範囲内' : `⚠ ${rules.min_stocks}〜${rules.max_stocks}銘柄が必要`}</span></div></div>
      <div class="tile"><div class="label">株を買う金額</div><div class="value num">${C.fmtYen(p.invested)}</div></div>
      <div class="tile"><div class="label">手数料（1.1％）${help('fee')}</div><div class="value num">${C.fmtYen(p.fees)}</div></div>
      <div class="tile"><div class="label">合計（手数料込み）</div><div class="value num">${C.fmtYen(p.total)}</div><div class="sub">仮想資金 ${C.fmtYen(p.budget)}</div></div>
      <div class="tile"><div class="label">残る現金</div><div class="value num ${p.cash < 0 ? 'down' : ''}">${C.fmtYen(p.cash)}</div></div>`;
    const warns = p.warnings.map((w) => w.replace('は株価を取得できていないため計算に入れていません', 'の株価がまだ入力されていません'));
    $('#pf-warn').innerHTML = warns.length
      ? `<div class="notice"><b>⚠ 確認してください</b><ul>${warns.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>`
      : (st.items.length ? '<div class="notice info">✓ ルール（銘柄数・予算）の範囲に収まっています。</div>' : '');
    if (noPrice && st.items.length) $('#pf-warn').insertAdjacentHTML('afterbegin', `<p class="small muted">株価が未入力の銘柄が${noPrice}つあります。株価を入れると株数と手数料が計算されます。</p>`);
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
    $('#pf-ind').innerHTML = a.ind.length ? a.ind.map(([k, v]) => bar(esc(k), v)).join('') : '<p class="muted">株価と金額を入れると表示されます。</p>';
    $('#pf-theme').innerHTML = a.th.length ? a.th.map(([k, v]) => bar(esc(theme(k)?.short_name || 'その他'), v, `var(--t${((store.themeIndex[k] ?? 0) % 8) + 1})`)).join('') : '<p class="muted">—</p>';
    $('#pf-conc').innerHTML = a.total
      ? `<div class="sum-grid"><div class="tile"><div class="label">いちばん大きい銘柄の割合</div><div class="value">${C.fmtPct(a.top1, { sign: false })}</div></div><div class="tile"><div class="label">上位3銘柄の割合</div><div class="value">${C.fmtPct(a.top3, { sign: false })}</div></div><div class="tile"><div class="label">業種の数</div><div class="value">${a.ind.length}</div></div></div>`
      : '';
  }

  let lastPast = null;
  function renderPast(p) {
    const pr = C.pastReturn(p.rows, st.pastPrices);
    const tp = C.isNum(st.topix.tp) ? st.topix.tp / 100 : null;
    lastPast = { ret: pr.ret, used: pr.used, tp };
    const label = st.pastDate ? `${st.pastDate.replaceAll('-', '/')} → 今` : '過去の時点 → 今';
    $('#pf-past').innerHTML = `
      <thead><tr><th>${esc(label)}</th><th class="r">このポートフォリオ<br><small class="muted">株価のみ・入力値</small></th><th class="r">TOPIX<br><small class="muted">入力値</small></th><th class="r">差</th></tr></thead>
      <tbody><tr><th scope="row">騰落率 ${help('return')}</th><td class="r">${signed(pr.ret)}</td><td class="r">${signed(tp)}</td><td class="r">${C.isNum(pr.ret) && C.isNum(tp) ? signed(pr.ret - tp) : na()}</td></tr></tbody>`;
    const tsrTable = $('#pf-tsr');
    if (tsrTable) {
      const pairs = (k) => p.rows.map((r) => [r.cost, store.byCode[r.code]?.fin?.[k]]);
      const row = (lbl, k) => {
        const a = C.weightedAverage(pairs(k));
        const b = C.weightedAverage(pairs(`${k}_index`));
        const cov = p.invested ? a.coverage / p.invested : 0;
        return `<tr><th scope="row">${lbl}</th><td class="r">${signed(a.value)}</td><td class="r">${signed(b.value)}</td><td class="r small muted">${p.invested ? C.fmtPct(cov, { sign: false, digits: 0 }) : '—'}</td></tr>`;
      };
      tsrTable.innerHTML = `<thead><tr><th>期間（決算期末まで）</th><th class="r">組み入れ銘柄の平均</th><th class="r">比較指標の平均</th><th class="r">データがある割合</th></tr></thead>
        <tbody>${row('1年', 'tsr_1y')}${row('3年', 'tsr_3y')}${row('5年', 'tsr_5y')}</tbody>`;
    }
  }

  // ---------- 入力のイベント ----------
  function refresh(full = true) {
    if (full) renderRows(); else updateRowCells();
    persist();
  }

  rowsEl.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.amt !== undefined) {
      st.items[Number(t.dataset.amt)].amount = Math.max(0, Math.round(Number(t.value) || 0));
    } else if (t.dataset.price !== undefined) {
      const code = st.items[Number(t.dataset.price)].code;
      const v = parseFloat(t.value);
      if (Number.isFinite(v) && v > 0) { st.prices[code] = v; setMemoPrice(code, v); } else delete st.prices[code];
    } else if (t.dataset.past !== undefined) {
      const code = st.items[Number(t.dataset.past)].code;
      const v = parseFloat(t.value);
      if (Number.isFinite(v) && v > 0) st.pastPrices[code] = v; else delete st.pastPrices[code];
    } else return;
    refresh(false);
  });
  rowsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    const [removed] = st.items.splice(Number(b.dataset.del), 1);
    delete st.prices[removed.code];
    delete st.pastPrices[removed.code];
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
    const each = Math.floor(rules.budget_yen / (1 + C.feeRate(rules)) / st.items.length / 1000) * 1000;
    st.items = st.items.map((i) => ({ ...i, amount: each }));
    refresh();
  });
  $('#pf-clear').addEventListener('click', () => {
    if (!st.items.length || !confirm('すべての銘柄を削除しますか？')) return;
    st.items = [];
    st.prices = {};
    st.pastPrices = {};
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
  $('#pf-toggle-past').addEventListener('click', () => { showPast = !showPast; setPastVisible(); });
  $('#pf-past-date').addEventListener('input', (e) => { st.pastDate = e.target.value.trim().slice(0, 10); renderPast(plan()); persist(); });
  $('#pf-tp').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v)) st.topix.tp = v; else delete st.topix.tp;
    renderPast(plan());
    persist();
  });

  // ---------- 銘柄の検索・追加 ----------
  const search = $('#pf-search');
  const sug = $('#pf-suggest');
  function addCode(code) {
    if (st.items.some((i) => i.code === code)) { toast('すでに入っています'); return; }
    if (st.items.length >= 30) { toast('30銘柄までにしてください'); return; }
    st.items.push({ code, amount: 250000 });
    if (memoPrice(code)) st.prices[code] = memoPrice(code).price;
    refresh();
    toast(`${store.byCode[code]?.name || code} を追加しました`);
  }
  function showSuggest(list) {
    if (!list.length) { sug.innerHTML = '<div class="muted small" style="padding:8px 12px">見つかりません（このサイトの候補の中から探します）</div>'; sug.classList.remove('hidden'); return; }
    sug.innerHTML = list.slice(0, 40).map((s) => `<button type="button" role="option" data-add="${esc(s.code)}">
      <span style="flex:1"><b>${esc(s.name)}</b> <span class="muted small">${esc(s.code)}・${esc(s.themes.map((t) => theme(t)?.short_name).join('/'))}・${esc(s.industry || '')}</span></span>
      ${st.items.some((i) => i.code === s.code) ? '<span class="small muted">追加済み</span>' : ''}</button>`).join('');
    sug.classList.remove('hidden');
  }
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    if (!q) { sug.classList.add('hidden'); return; }
    showSuggest(store.stocks.filter((s) => `${s.name} ${s.code} ${s.themes.map((t) => `${theme(t)?.name} ${theme(t)?.short_name}`).join(' ')} ${s.industry || ''}`.toLowerCase().includes(q)));
  });
  app.querySelectorAll('[data-suggest-theme]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.suggestTheme;
    showSuggest(store.stocks.filter((s) => s.themes.includes(id)).sort((a, c) => (a.industry || '').localeCompare(c.industry || '', 'ja')));
  }));
  sug.addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    addCode(b.dataset.add);
    b.insertAdjacentHTML('beforeend', '<span class="small muted">追加済み</span>');
  });

  // ---------- PNG ----------
  const title = () => (st.name ? `ポートフォリオ「${st.name}」` : 'ポートフォリオの試算');
  $('#png-ind').addEventListener('click', () => {
    const a = allocation(plan());
    if (!a.total) { toast('先に株価と金額を入れてください'); return; }
    exportChart({
      title: `${title()}：業種のかたより`,
      subtitle: `株を買う金額に占める割合（${plan().count}銘柄）`,
      footer: exportFooter('｜株価は利用者が入力した値'),
      build: (cv, sc) => barChart(cv, { labels: a.ind.map(([k]) => k), groups: [{ label: '割合', values: a.ind.map(([, v]) => (v / a.total) * 100), color: palette(true).series[0] }], format: (v) => `${C.fmtNum(v, 1)}%`, horizontal: true, scale: sc, forExport: true, valueLabels: true }),
      filename: 'portfolio_industry.png',
    });
  });
  $('#png-past').addEventListener('click', () => {
    if (!lastPast || (!C.isNum(lastPast.ret) && !C.isNum(lastPast.tp))) { toast('先に過去の株価とTOPIXの騰落率を入れてください'); return; }
    const pal = palette(true);
    exportChart({
      title: `${title()}：${st.pastDate ? st.pastDate.replaceAll('-', '/') + 'から' : '過去の時点から'}の騰落率`,
      subtitle: '今の金額の割合でその日に買っていた場合（株価のみ）。株価・TOPIXは利用者が入力した値',
      footer: exportFooter('｜株価・TOPIXは利用者が入力した値'),
      build: (cv, sc) => barChart(cv, { labels: ['このポートフォリオ', 'TOPIX'], groups: [{ label: '騰落率', values: [lastPast.ret, lastPast.tp].map((v) => (C.isNum(v) ? v * 100 : null)), colors: [pal.series[0], pal.muted] }], format: (v) => `${C.fmtNum(v, 1)}%`, horizontal: true, scale: sc, forExport: true, valueLabels: true }),
      filename: 'portfolio_past.png',
    });
  });

  renderRows();
  persist();
  void exportTable;
}
