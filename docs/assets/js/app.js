// 画面の切り替え（#/〇〇 のURLで表示するページを決める）
import { store, loadCore, initHelp, esc } from './ui.js';
import { renderHome } from './pages/home.js';
import { renderRules } from './pages/rules.js';
import { renderTheme } from './pages/theme.js';
import { renderCompare } from './pages/compare.js';
import { renderStock } from './pages/stock.js';
import { renderThemes } from './pages/themes.js';
import { renderPortfolio } from './pages/portfolio.js';
import { renderNews, renderGlossary, renderAbout } from './pages/info.js';

const app = document.getElementById('app');

const ROUTES = [
  { re: /^$/, nav: '', render: () => renderHome(app) },
  { re: /^rules$/, nav: 'rules', render: () => renderRules(app) },
  { re: /^theme\/([a-z0-9_-]+)$/, nav: 'theme', render: (m) => renderTheme(app, m[1]) },
  { re: /^compare$/, nav: 'compare', render: (m, q) => renderCompare(app, q) },
  { re: /^stock\/([0-9A-Za-z]{4})$/, nav: 'compare', render: (m) => renderStock(app, m[1].toUpperCase()) },
  { re: /^themes$/, nav: 'themes', render: () => renderThemes(app) },
  { re: /^portfolio$/, nav: 'portfolio', render: (m, q) => renderPortfolio(app, q) },
  { re: /^news$/, nav: 'news', render: (m, q) => renderNews(app, q) },
  { re: /^glossary$/, nav: 'glossary', render: () => renderGlossary(app) },
  { re: /^about$/, nav: 'about', render: () => renderAbout(app) },
];

function parseHash() {
  let h = location.hash.replace(/^#\/?/, '');
  try { h = decodeURI(h); } catch (e) { /* 壊れたURLでもそのまま読む */ }
  const i = h.indexOf('?');
  return { path: i >= 0 ? h.slice(0, i) : h, query: i >= 0 ? h.slice(i + 1) : '' };
}

let lastPath = null;
async function route() {
  const { path, query } = parseHash();
  const r = ROUTES.find((x) => x.re.test(path));
  const current = r ? r.nav : '__';
  document.querySelectorAll('.nav a').forEach((a) => {
    if (a.dataset.nav === current) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  if (!r) {
    app.innerHTML = `<div class="card"><h1>ページが見つかりません</h1><p><a href="#/">トップへ戻る</a></p></div>`;
    return;
  }
  try {
    await r.render(path.match(r.re), query);
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="card"><h1>表示中にエラーが起きました</h1><p class="muted">${esc(e.message)}</p><p><a href="#/">トップへ戻る</a></p></div>`;
  }
  if (path !== lastPath) {
    window.scrollTo(0, 0);
    lastPath = path;
  }
}

function initThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  const order = ['auto', 'light', 'dark'];
  const label = { auto: '表示: 自動', light: '表示: ライト', dark: '表示: ダーク' };
  let mode = 'auto';
  try { mode = localStorage.getItem('slr-theme') || 'auto'; } catch (e) { /* なくてもよい */ }
  const apply = () => {
    if (mode === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', mode);
    btn.textContent = label[mode];
  };
  apply();
  btn.addEventListener('click', () => {
    mode = order[(order.indexOf(mode) + 1) % order.length];
    try { localStorage.setItem('slr-theme', mode); } catch (e) { /* なくてもよい */ }
    apply();
    route(); // グラフの色を描き直す
  });
}

function fillFooter() {
  const m = store.meta;
  const el = document.getElementById('data-date');
  if (el && m) {
    el.textContent = `データ：${m.data_date ? m.data_date.replaceAll('-', '/') : '—'} 時点（前営業日の終値）／ 更新：${(m.generated_at || '').replace('T', ' ').slice(0, 16)}`;
  }
}

async function main() {
  initHelp();
  initThemeToggle();
  try {
    await loadCore();
  } catch (e) {
    app.innerHTML = `<div class="card"><h1>データを読み込めませんでした</h1><p>${esc(e.message)}</p><p class="muted">ページを再読み込みしてください。続く場合は GitHub Actions の実行結果を確認してください。</p></div>`;
    return;
  }
  fillFooter();
  window.addEventListener('hashchange', route);
  route();
}

main();
