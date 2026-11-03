import * as C from '../calc.js';
import { store, esc, help, themeColor, themeBadge, na, finNote, exportFooter, memoPrice } from '../ui.js';
import { exportWrappedTable } from '../export.js';

const PER_PAGE = 7;

export async function renderTheme(app, id) {
  const t = store.themes.find((x) => x.id === id);
  if (!t) {
    app.innerHTML = `<div class="card"><h1>テーマが見つかりません</h1><p><a href="#/">ホームへ</a></p></div>`;
    return;
  }
  document.title = `${t.name}｜テーマ別 銘柄リサーチ`;
  const s = store.themeSummary[id] || { median: {}, industries: {} };
  const med = s.median || {};
  // 並び順：業種 → 名前（市場データを使わないので、時価総額順にはしない）
  const members = store.stocks.filter((x) => x.themes.includes(id))
    .sort((a, b) => (a.industry || '').localeCompare(b.industry || '', 'ja') || a.name.localeCompare(b.name, 'ja'));

  const tile = (label, key, value, sub = '中央値') => `
    <div class="tile"><div class="label">${label}${key ? help(key) : ''}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;

  const cards = members.map((m) => {
    const r = m.reasons[id];
    const others = m.themes.filter((x) => x !== id).map((x) => themeBadge(x)).join(' ');
    const f = m.fin || {};
    const memo = memoPrice(m.code);
    return `
      <article class="card stock-card">
        <div class="top">
          <a href="#/stock/${esc(m.code)}">${esc(m.name)}</a>
          <span class="muted small">${esc(m.code)}${m.industry ? '・' + esc(m.industry) : ''}</span>
        </div>
        <div class="reason">${esc(r.reason)}</div>
        <div class="src">出典：<a href="${esc(r.source_url)}" rel="noopener">${esc(r.source_title || r.source_url)}</a></div>
        <div class="mini">
          ${store.hasFin ? `<span>売上成長率 ${C.isNum(f.sales_cagr_3y) ? C.fmtPct(f.sales_cagr_3y) : na()}</span><span>ROE ${C.isNum(f.roe_actual) ? C.fmtPctRaw(f.roe_actual, 1) : na()}</span>` : ''}
          ${memo ? `<span>株価メモ ${C.fmtYen(memo.price)}（${esc(memo.date)}）</span>` : ''}
        </div>
        ${others ? `<div class="row small"><span class="muted">他のテーマ：</span>${others}</div>` : ''}
      </article>`;
  }).join('');

  const pages = Math.ceil(members.length / PER_PAGE);
  app.innerHTML = `
    <div class="page-head">
      <div class="breadcrumb"><a href="#/">ホーム</a> › テーマ</div>
      <h1><span class="badge" style="vertical-align:middle;margin-right:6px"><span class="dot" style="background:${themeColor(id)}"></span>テーマ</span>${esc(t.name)}</h1>
      <p>${esc(t.description)}</p>
      <div class="row">
        <a class="btn" href="#/compare?theme=${id}">比較表で見る</a>
        <a class="btn" href="#/themes">ほかのテーマと比べる</a>
        <a class="btn" href="#/news?theme=${id}">情報の探し方</a>
      </div>
    </div>
    <section class="card">
      <h2 style="margin-top:0">数字で見る</h2>
      <div class="tiles">
        ${tile('候補の銘柄数', '', `${s.count ?? 0}社`, `業種は${Object.keys(s.industries || {}).length}種類`)}
        ${store.hasFin ? `
        ${tile('売上の成長率', 'sales_cagr_3y', C.isNum(med.sales_cagr_3y) ? C.fmtPct(med.sales_cagr_3y) : na(), '中央値・3年の年平均')}
        ${tile('ROE', 'roe', C.isNum(med.roe_actual) ? C.fmtPctRaw(med.roe_actual, 1) : na(), '中央値・最新期')}
        ${tile('自己資本比率', 'equity_ratio', C.isNum(med.equity_ratio) ? C.fmtPctRaw(med.equity_ratio, 1) : na(), '中央値・最新期')}
        ${tile('株主総利回り（5年）', 'tsr', C.isNum(med.tsr_5y) ? C.fmtPct(med.tsr_5y) : na(), '中央値・各社の有報より')}
        ${tile('最新期が赤字', '', `${s.loss_making ?? 0}社`, '純利益がマイナス')}` : ''}
      </div>
      <p class="small muted" style="margin:8px 0 0">${finNote()}</p>
      <h3>業種の内訳 ${help('industry')}</h3>
      ${Object.entries(s.industries || {}).map(([k, v]) => `<div class="bar-row"><span>${esc(k)}</span><span class="track"><span class="fill" style="width:${(v / (s.count || 1)) * 100}%;background:${themeColor(id)}"></span></span><span class="num">${v}社</span></div>`).join('')}
    </section>
    <div class="chart-head" style="margin-top:1.6em"><h2 style="margin:0">候補の銘柄と「テーマとの関係」（業種順）</h2>
      <div class="row"><span class="small muted">スライド用PNG：</span>${Array.from({ length: pages }, (_, i) => `<button type="button" class="btn small" data-page="${i}">${i * PER_PAGE + 1}〜${Math.min(members.length, (i + 1) * PER_PAGE)}社目</button>`).join('')}</div></div>
    <p class="muted small">「テーマとの関係」は公開情報をもとに作った一言メモです。出典のリンク先で確認し、レポートでは会社の公式資料（統合報告書・決算説明資料など）も確認してください。銘柄の追加・削除は<a href="#/about">データについて</a>の手順で行えます。</p>
    <div class="stock-list">${cards}</div>
  `;

  app.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.page);
    const part = members.slice(i * PER_PAGE, (i + 1) * PER_PAGE);
    exportWrappedTable({
      title: `テーマ「${t.name}」の候補銘柄（${i * PER_PAGE + 1}〜${i * PER_PAGE + part.length}社目／全${members.length}社）`,
      subtitle: '業種順。「テーマとの関係」は公開情報をもとにした要約',
      footer: exportFooter(),
      columns: [{ label: '銘柄', width: 1.5, wrap: true }, { label: 'テーマとの関係', width: 4.2, wrap: true }, { label: '業種', width: 1.0, wrap: true }],
      rows: part.map((m) => [`${m.name}（${m.code}）`, m.reasons[id].reason, m.industry || '取得できず']),
      filename: `theme_${id}_${i + 1}.png`,
    });
  }));
}
