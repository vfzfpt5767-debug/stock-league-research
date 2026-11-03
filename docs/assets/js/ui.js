// 画面づくりの共通部品とデータの読み込み
import * as C from './calc.js';
import { GLOSSARY } from './glossary.js';
import { palette } from './charts.js';

export const store = {
  meta: null,
  stocks: [],
  byCode: {},
  themeSummary: {},
  prices: {},
  bench: undefined,
  news: undefined,
};

export async function loadJSON(path) {
  const r = await fetch(`data/${path}`, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${path} を読み込めませんでした (${r.status})`);
  return r.json();
}

export async function loadCore() {
  const [meta, stocks, themes] = await Promise.all([loadJSON('meta.json'), loadJSON('stocks.json'), loadJSON('themes.json')]);
  store.meta = meta;
  store.stocks = stocks;
  store.byCode = Object.fromEntries(stocks.map((s) => [s.code, s]));
  store.themeSummary = Object.fromEntries(themes.map((t) => [t.id, t]));
  store.themes = meta.themes.filter((t) => t.enabled);
  store.themeIndex = Object.fromEntries(meta.themes.map((t, i) => [t.id, i]));
  store.rules = meta.rules;
}

export async function loadPrices(code) {
  if (store.prices[code]) return store.prices[code];
  try {
    store.prices[code] = await loadJSON(`prices/${code}.json`);
  } catch (e) {
    store.prices[code] = { code, daily: [], weekly: [] };
  }
  return store.prices[code];
}

export async function loadBench() {
  if (store.bench !== undefined) return store.bench;
  try { store.bench = await loadJSON('benchmark.json'); } catch (e) { store.bench = null; }
  return store.bench;
}

export async function loadNews() {
  if (store.news !== undefined) return store.news;
  try { store.news = await loadJSON('news.json'); } catch (e) { store.news = { themes: {} }; }
  return store.news;
}

// ---------- HTML ----------
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function na() {
  return '<span class="na" title="データを取得できませんでした（推測で埋めていません）">取得できず</span>';
}

export function help(key) {
  const g = GLOSSARY[key];
  if (!g) return '';
  return `<button type="button" class="help" data-help="${key}" aria-label="${esc(g.term)}の説明">?</button>`;
}

export function theme(id) {
  return store.themes.find((t) => t.id === id) || store.meta.themes.find((t) => t.id === id);
}

export function themeColor(id) {
  return `var(--t${((store.themeIndex[id] ?? 0) % 8) + 1})`;
}

export function themeColorHex(id, forExport = false) {
  return palette(forExport).series[(store.themeIndex[id] ?? 0) % 8];
}

export function themeBadge(id, { link = true, short = true } = {}) {
  const t = theme(id);
  if (!t) return '';
  const label = esc(short ? t.short_name : t.name);
  const inner = `<span class="dot" style="background:${themeColor(id)}"></span>${label}`;
  return link ? `<a class="badge" href="#/theme/${id}">${inner}</a>` : `<span class="badge">${inner}</span>`;
}

export function stockLink(s) {
  return `<a href="#/stock/${esc(s.code)}">${esc(s.name)}</a><span class="code">${esc(s.code)}</span>`;
}

// 数値セル（値がなければ「取得できず」）
export function cell(v, fmt) {
  return C.isNum(v) ? `<span class="num">${fmt(v)}</span>` : na();
}

// 上昇・下落は色だけでなく記号（▲▼）でも示す
export function signed(v, { digits = 1 } = {}) {
  if (!C.isNum(v)) return na();
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : '';
  const mark = v > 0 ? '▲' : v < 0 ? '▼' : '';
  return `<span class="num ${cls}">${mark}${C.fmtPct(v, { digits })}</span>`;
}

export function perCell(s) {
  if (!C.isNum(s.per)) return na();
  return `<span class="num">${C.fmtTimes(s.per)}${s.per_forecast ? '<small class="muted">（予）</small>' : ''}</span>`;
}

export function yieldCell(s) {
  if (!C.isNum(s.dividend_yield)) return na();
  return `<span class="num">${C.fmtPctRaw(s.dividend_yield)}${s.dividend_forecast ? '<small class="muted">（予）</small>' : ''}</span>`;
}

export function exportFooter() {
  const d = store.meta?.data_date ? store.meta.data_date.replaceAll('-', '/') : '—';
  return `出典：IR BANK（株価・指標・決算）、金融庁EDINET（業種）｜データ：${d}時点（前営業日終値）｜作成：テーマ別 銘柄リサーチ｜学習目的の資料であり、投資の助言ではありません`;
}

export function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

// ---------- 用語の説明（? ボタン） ----------
let pop = null;
function closePop() {
  if (pop) { pop.remove(); pop = null; }
}
export function initHelp() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.help');
    if (!b) {
      if (pop && !e.target.closest('.popover')) closePop();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const g = GLOSSARY[b.dataset.help];
    if (!g) return;
    const same = pop && pop.dataset.key === b.dataset.help;
    closePop();
    if (same) return;
    pop = document.createElement('div');
    pop.className = 'popover';
    pop.setAttribute('role', 'dialog');
    pop.dataset.key = b.dataset.help;
    pop.innerHTML = `<strong>${esc(g.term)}</strong>${esc(g.text)}<div style="margin-top:6px"><a href="#/glossary">用語集をすべて見る</a></div>`;
    document.body.appendChild(pop);
    const r = b.getBoundingClientRect();
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    let left = Math.min(Math.max(16, r.left - pw / 2 + r.width / 2), window.innerWidth - pw - 16);
    let top = r.bottom + 8;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 8);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });
  window.addEventListener('hashchange', closePop);
  window.addEventListener('scroll', closePop, { passive: true });
}

// ---------- 保存しておくポートフォリオ（この端末だけ） ----------
export function savedPortfolio() {
  try { return JSON.parse(localStorage.getItem('slr-portfolio') || 'null'); } catch (e) { return null; }
}
export function savePortfolio(state) {
  try { localStorage.setItem('slr-portfolio', JSON.stringify(state)); } catch (e) { /* 保存できなくても動く */ }
}

export function downloadCSV(filename, header, rows) {
  const q = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const text = '﻿' + [header, ...rows].map((r) => r.map(q).join(',')).join('\r\n');
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function hundredCost(s) {
  return C.isNum(s.price) ? s.price * 100 : null;
}
