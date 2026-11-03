// 画面づくりの共通部品とデータの読み込み
import * as C from './calc.js';
import { GLOSSARY } from './glossary.js';
import { palette } from './charts.js';

export const store = { meta: null, stocks: [], byCode: {}, themeSummary: {} };

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
  store.hasFin = stocks.some((s) => (s.fin_history || []).length);
}

// ---------- 株価メモ（自分で調べた株価を、この端末のブラウザにだけ保存） ----------
// 株価などの市場データは、規約上このサイトで自動取得・公開できないため、利用者が入力する方式にしている。
const MEMO_KEY = 'slr-price-memo';
export function priceMemo() {
  try { return JSON.parse(localStorage.getItem(MEMO_KEY) || '{}') || {}; } catch (e) { return {}; }
}
export function memoPrice(code) {
  const m = priceMemo()[code];
  return m && C.isNum(m.price) ? m : null;
}
export function setMemoPrice(code, price, date) {
  const all = priceMemo();
  if (C.isNum(price) && price > 0) all[code] = { price, date: date || new Date().toISOString().slice(0, 10) };
  else delete all[code];
  try { localStorage.setItem(MEMO_KEY, JSON.stringify(all)); } catch (e) { /* 保存できなくても動く */ }
}

// ---------- 外部サイトへのリンク（データは取りにいかず、リンクするだけ） ----------
export function extLinks(code) {
  return [
    { label: 'Yahoo!ファイナンス', url: `https://finance.yahoo.co.jp/quote/${code}.T` },
    { label: '株探', url: `https://kabutan.jp/stock/?code=${code}` },
    { label: 'IR BANK', url: `https://irbank.net/${code}` },
  ];
}

// ---------- HTML ----------
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function na(text = '取得できず') {
  return `<span class="na" title="データがありません（推測で埋めていません）">${text}</span>`;
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

export function finNote() {
  return store.hasFin
    ? `決算の数字は金融庁 EDINET の有価証券報告書から（最新：${esc(store.meta.fin_latest_fy || '—')}期）。`
    : '決算の数字（売上・利益・配当・株主総利回り）は、EDINET の APIキーを登録すると自動で表示されます（<a href="#/about">データについて</a>）。';
}

export function exportFooter(extra = '') {
  return `出典：金融庁 EDINET（業種・決算・株主総利回り。加工して作成）／テーマとの関係は各銘柄ページの出典を参照${extra}｜作成：テーマ別 銘柄リサーチ｜学習目的の資料であり、投資の助言ではありません`;
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
    const left = Math.min(Math.max(16, r.left - pw / 2 + r.width / 2), window.innerWidth - pw - 16);
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
