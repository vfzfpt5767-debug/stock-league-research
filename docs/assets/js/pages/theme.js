import * as C from '../calc.js';
import { store, esc, help, themeColor, themeBadge, signed, na, cell, perCell, loadNews } from '../ui.js';

export async function renderTheme(app, id) {
  const t = store.themes.find((x) => x.id === id);
  if (!t) {
    app.innerHTML = `<div class="card"><h1>テーマが見つかりません</h1><p><a href="#/">ホームへ</a></p></div>`;
    return;
  }
  document.title = `${t.name}｜テーマ別 銘柄リサーチ`;
  const s = store.themeSummary[id] || { median: {} };
  const med = s.median || {};
  const members = store.stocks.filter((x) => x.themes.includes(id)).sort((a, b) => (b.market_cap ?? -1) - (a.market_cap ?? -1));

  const tile = (label, key, value, sub = '中央値') => `
    <div class="tile"><div class="label">${label}${key ? help(key) : ''}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;

  const cards = members.map((m) => {
    const r = m.reasons[id];
    const others = m.themes.filter((x) => x !== id).map((x) => themeBadge(x)).join(' ');
    return `
      <article class="card stock-card">
        <div class="top">
          <a href="#/stock/${esc(m.code)}">${esc(m.name)}</a>
          <span class="muted small">${esc(m.code)}${m.industry ? '・' + esc(m.industry) : ''}</span>
        </div>
        <div class="reason">${esc(r.reason)}</div>
        <div class="src">出典：<a href="${esc(r.source_url)}" rel="noopener">${esc(r.source_title || r.source_url)}</a></div>
        <div class="mini">
          <span>株価 ${cell(m.price, (v) => C.fmtYen(v))}</span>
          <span>時価総額 ${cell(m.market_cap, C.fmtJpAmount)}</span>
          <span>PER ${perCell(m)}</span>
          <span>1年 ${signed(m.return_1y)}</span>
        </div>
        ${others ? `<div class="row small"><span class="muted">他のテーマ：</span>${others}</div>` : ''}
      </article>`;
  }).join('');

  app.innerHTML = `
    <div class="page-head">
      <div class="breadcrumb"><a href="#/">ホーム</a> › テーマ</div>
      <h1><span class="badge" style="vertical-align:middle;margin-right:6px"><span class="dot" style="background:${themeColor(id)}"></span>テーマ</span>${esc(t.name)}</h1>
      <p>${esc(t.description)}</p>
      <div class="row">
        <a class="btn" href="#/compare?theme=${id}">比較表で見る</a>
        <a class="btn" href="#/themes">ほかのテーマと比べる</a>
        <a class="btn" href="#/news?theme=${id}">このテーマのニュース</a>
      </div>
    </div>
    <section class="card">
      <h2 style="margin-top:0">数字で見る（${s.count ?? 0}社の中央値 ${help('median')}）</h2>
      <div class="tiles">
        ${tile('候補の銘柄数', '', `${s.count ?? 0}社`, `株価を取得：${s.with_price ?? 0}社`)}
        ${tile('1年の騰落率', 'return_1y', signed(med.return_1y))}
        ${tile('3年の騰落率', 'return_3y', signed(med.return_3y))}
        ${tile('値動きの大きさ', 'vol', C.isNum(med.vol_1y) ? C.fmtPct(med.vol_1y, { sign: false }) : na(), '中央値・1年・年率')}
        ${tile('最大下落率', 'mdd', C.isNum(med.mdd_3y) ? C.fmtPct(med.mdd_3y) : na(), '中央値・3年')}
        ${tile('PER', 'per', C.isNum(med.per) ? C.fmtTimes(med.per) : na(), '中央値（赤字の会社を除く）')}
        ${tile('PBR', 'pbr', C.isNum(med.pbr) ? C.fmtTimes(med.pbr, 2) : na())}
        ${tile('配当利回り', 'dividend_yield', C.isNum(med.dividend_yield) ? C.fmtPctRaw(med.dividend_yield) : na())}
        ${tile('売上の成長率', 'sales_cagr_3y', C.isNum(med.sales_cagr_3y) ? C.fmtPct(med.sales_cagr_3y) : na(), '中央値・3年の年平均')}
      </div>
    </section>
    <h2>候補の銘柄と「テーマとの関係」（時価総額の大きい順）</h2>
    <p class="muted small">「テーマとの関係」は公開情報をもとに作った一言メモです。出典のリンク先で確認し、レポートでは会社の公式資料（統合報告書・決算説明資料など）も確認してください。銘柄の追加・削除は<a href="#/about">データについて</a>の手順で行えます。</p>
    <div class="stock-list">${cards}</div>
    <section class="card" style="margin-top:16px">
      <h2 style="margin-top:0">このテーマの最近の主な出来事 ${help('disclosure')}</h2>
      <div id="theme-news" class="muted">読み込み中…</div>
    </section>
  `;

  const news = await loadNews();
  const items = (news.themes?.[id] || []).slice(0, 15);
  const el = document.getElementById('theme-news');
  if (!el) return;
  el.classList.remove('muted');
  el.innerHTML = items.length
    ? `<ul class="news-list">${items.map((n) => `<li><span class="date">${esc(n.date.replaceAll('-', '/'))}</span><a href="${esc(n.url)}" rel="noopener">${esc(n.title)}</a><span class="who">${esc(n.name)}（${esc(n.code)}）</span></li>`).join('')}</ul>
       <p class="small muted">出典：IR BANK（各社の適時開示の一覧）。<a href="#/news?theme=${id}">もっと見る</a></p>`
    : '<p class="muted">まだ集めていません（自動更新で順番に集めます）。</p>';
}
