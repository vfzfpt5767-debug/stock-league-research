// ポートフォリオの計算と数値の表示（ブラウザでも Node のテストでも使える純粋な関数だけ）

export const DAY = 86400000;

export function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// ---------- 表示用フォーマット ----------
export const NA = '取得できず';

export function fmtYen(v, { digits = 0 } = {}) {
  if (!isNum(v)) return NA;
  return v.toLocaleString('ja-JP', { maximumFractionDigits: digits, minimumFractionDigits: digits }) + '円';
}

export function fmtNum(v, digits = 1) {
  if (!isNum(v)) return NA;
  return v.toLocaleString('ja-JP', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

// 大きな金額を「兆・億・万」で
export function fmtJpAmount(v) {
  if (!isNum(v)) return NA;
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 1e12) return sign + (a / 1e12).toLocaleString('ja-JP', { maximumFractionDigits: 2 }) + '兆円';
  if (a >= 1e8) return sign + Math.round(a / 1e8).toLocaleString('ja-JP') + '億円';
  if (a >= 1e4) return sign + Math.round(a / 1e4).toLocaleString('ja-JP') + '万円';
  return sign + Math.round(a).toLocaleString('ja-JP') + '円';
}

// 割合（0.123 → +12.3%）
export function fmtPct(v, { digits = 1, sign = true } = {}) {
  if (!isNum(v)) return NA;
  const p = v * 100;
  const s = p.toLocaleString('ja-JP', { maximumFractionDigits: digits, minimumFractionDigits: digits });
  return (sign && p > 0 ? '+' : '') + s + '%';
}

// すでに％の数値（2.5 → 2.5%）
export function fmtPctRaw(v, digits = 2) {
  if (!isNum(v)) return NA;
  return v.toLocaleString('ja-JP', { maximumFractionDigits: digits, minimumFractionDigits: digits }) + '%';
}

export function fmtTimes(v, digits = 1) {
  if (!isNum(v)) return NA;
  return v.toLocaleString('ja-JP', { maximumFractionDigits: digits, minimumFractionDigits: digits }) + '倍';
}

// ---------- 系列の計算 ----------
// series: [[YYYY-MM-DD, value], ...] 古い順
export function closeOnOrBefore(series, date) {
  let found = null;
  for (const [d, v] of series) {
    if (d <= date) found = [d, v];
    else break;
  }
  return found;
}

// target に最も近い日の値（前後 tol 日以内）。同じ近さなら前の日を優先
export function closeNearest(series, target, tol = 10) {
  let best = null;
  for (const [d, v] of series) {
    const diff = Math.abs(daysBetween(d, target));
    if (diff > tol) continue;
    if (!best || diff < best.diff || (diff === best.diff && d <= target)) best = { diff, p: [d, v] };
  }
  return best ? best.p : null;
}

export function addDays(iso, days) {
  const t = Date.parse(iso + 'T00:00:00Z') + days * DAY;
  return new Date(t).toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY);
}

export function stdev(arr) {
  if (arr.length < 2) return null;
  const m = arr.reduce((s, x) => s + x, 0) / arr.length;
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v);
}

export function simpleReturns(values) {
  const out = [];
  for (let i = 1; i < values.length; i++) if (values[i - 1] > 0) out.push(values[i] / values[i - 1] - 1);
  return out;
}

export function annualVol(values, periodsPerYear = 52) {
  const r = simpleReturns(values);
  const s = stdev(r);
  return s === null ? null : s * Math.sqrt(periodsPerYear);
}

export function maxDrawdown(series) {
  if (series.length < 2) return null;
  let peak = series[0][1], peakD = series[0][0];
  let worst = { value: 0, peak: series[0][0], trough: series[0][0] };
  for (const [d, v] of series) {
    if (v > peak) { peak = v; peakD = d; }
    const dd = peak > 0 ? v / peak - 1 : 0;
    if (dd < worst.value) worst = { value: dd, peak: peakD, trough: d };
  }
  return worst;
}

// ---------- ポートフォリオ ----------
// rules: { budget_yen, fee_rate, fee_tax_rate }
export function feeRate(rules) {
  return (rules.fee_rate ?? 0.01) * (1 + (rules.fee_tax_rate ?? 0.1));
}

// 金額から買える株数（手数料込みで金額を超えない最大の株数、lot 単位）
export function sharesFor(amount, price, lot, rules) {
  if (!isNum(amount) || !isNum(price) || price <= 0 || amount <= 0) return 0;
  const perShare = price * (1 + feeRate(rules));
  return Math.floor(amount / perShare / lot) * lot;
}

// items: [{code, amount}], prices: {code: price}
export function planPortfolio(items, prices, lot, rules) {
  const fr = feeRate(rules);
  const rows = items.map((it) => {
    const price = prices[it.code];
    const shares = sharesFor(it.amount, price, lot, rules);
    const cost = isNum(price) ? shares * price : 0;
    const fee = Math.round(cost * fr);
    const minLotCost = isNum(price) ? Math.ceil(price * lot * (1 + fr)) : null;
    return { code: it.code, amount: it.amount, price: isNum(price) ? price : null, shares, cost, fee, total: cost + fee, minLotCost };
  });
  const invested = rows.reduce((s, r) => s + r.cost, 0);
  const fees = rows.reduce((s, r) => s + r.fee, 0);
  const planned = items.reduce((s, it) => s + (isNum(it.amount) ? it.amount : 0), 0);
  const budget = rules.budget_yen ?? 5000000;
  const held = rows.filter((r) => r.shares > 0);
  const warnings = [];
  const count = held.length;
  if (count < (rules.min_stocks ?? 10)) warnings.push(`買えている銘柄が${count}銘柄です。STOCKリーグでは${rules.min_stocks ?? 10}〜${rules.max_stocks ?? 20}銘柄にする必要があります`);
  if (count > (rules.max_stocks ?? 20)) warnings.push(`${count}銘柄あります。STOCKリーグでは${rules.max_stocks ?? 20}銘柄までです`);
  if (invested + fees > budget) warnings.push(`手数料込みの合計（${fmtYen(invested + fees)}）が仮想資金${fmtYen(budget)}を超えています`);
  if (planned > budget) warnings.push(`入力した金額の合計（${fmtYen(planned)}）が仮想資金${fmtYen(budget)}を超えています`);
  for (const r of rows) {
    if (r.price === null) warnings.push(`${r.code} は株価を取得できていないため計算に入れていません`);
    else if (r.shares === 0) warnings.push(`${r.code} は入力した金額では${lot}株も買えません（${lot}株で手数料込み約${fmtYen(r.minLotCost)}）`);
  }
  return { rows, invested, fees, total: invested + fees, cash: budget - invested - fees, planned, budget, count, warnings };
}

// 均等に配分（手数料の分を残して、予算を銘柄数で割る）
export function equalAmounts(codes, rules) {
  const budget = rules.budget_yen ?? 5000000;
  if (!codes.length) return [];
  const each = Math.floor(budget / codes.length / 1000) * 1000;
  return codes.map((code) => ({ code, amount: each }));
}

// 週足をまとめて、期間の最初に「金額の割合」で買って持ち続けた場合の推移（開始=100）
// weights: {code: weight}（合計1でなくてよい）, weekly: {code: [[d,v],...]}
export function backtest(weights, weekly, start, end) {
  const included = [];
  const excluded = [];
  const base = {};
  for (const code of Object.keys(weights)) {
    const s = weekly[code] || [];
    const b = closeNearest(s, start, 10);
    if (!b || !(weights[code] > 0)) { excluded.push(code); continue; }
    base[code] = b[1];
    included.push(code);
  }
  if (!included.length) return { series: [], included, excluded };
  const wsum = included.reduce((s, c) => s + weights[c], 0);
  const dates = new Set();
  for (const c of included) for (const [d] of weekly[c]) if (d > start && d <= end) dates.add(d);
  const sorted = [...dates].sort();
  const last = Object.fromEntries(included.map((c) => [c, base[c]]));
  const maps = Object.fromEntries(included.map((c) => [c, new Map(weekly[c])]));
  const series = [[start, 100]];
  for (const d of sorted) {
    let v = 0;
    for (const c of included) {
      const x = maps[c].get(d);
      if (isNum(x)) last[c] = x;
      v += (weights[c] / wsum) * (last[c] / base[c]);
    }
    series.push([d, v * 100]);
  }
  return { series, included, excluded };
}

export function seriesStats(series) {
  if (!series || series.length < 2) return { ret: null, vol: null, mdd: null };
  const values = series.map((p) => p[1]);
  return {
    ret: values[values.length - 1] / values[0] - 1,
    vol: values.length >= 20 ? annualVol(values) : null,
    mdd: maxDrawdown(series)?.value ?? null,
  };
}

export function rebase(series, start) {
  const b = closeNearest(series, start, 10) || closeOnOrBefore(series, start);
  if (!b) return [];
  return series.filter(([d]) => d >= b[0]).map(([d, v]) => [d === b[0] ? start : d, (v / b[1]) * 100]);
}

// ---------- URL に保存 ----------
// p=7203:500000,6758:300000&lot=1&t1=10&t3=30&v1=15&v3=14&m1=-10&m3=-20&td=2026-09-30
export const TOPIX_KEYS = ['t1', 't3', 'v1', 'v3', 'm1', 'm3'];
export function encodePortfolio(state) {
  const parts = [];
  if (state.items?.length) parts.push('p=' + state.items.map((i) => `${i.code}:${Math.round(i.amount || 0)}`).join(','));
  if (state.lot && state.lot !== 100) parts.push('lot=' + state.lot);
  const t = state.topix || {};
  for (const k of TOPIX_KEYS) if (isNum(t[k])) parts.push(`${k}=${t[k]}`);
  if (t.td) parts.push('td=' + encodeURIComponent(t.td));
  if (state.name) parts.push('n=' + encodeURIComponent(state.name));
  return parts.join('&');
}

export function decodePortfolio(query) {
  const params = new URLSearchParams(query || '');
  const items = [];
  const seen = new Set();
  for (const tok of (params.get('p') || '').split(',')) {
    const m = /^([0-9]{3}[0-9A-Za-z]):(\d{1,9})$/.exec(tok.trim());
    if (!m) continue;
    const code = m[1].toUpperCase();
    if (seen.has(code)) continue;
    seen.add(code);
    items.push({ code, amount: Number(m[2]) });
  }
  const lot = params.get('lot') === '1' ? 1 : 100;
  const topix = {};
  for (const k of TOPIX_KEYS) {
    const v = parseFloat(params.get(k));
    if (Number.isFinite(v)) topix[k] = v;
  }
  if (params.get('td')) topix.td = params.get('td').slice(0, 10);
  return { items: items.slice(0, 40), lot, topix, name: (params.get('n') || '').slice(0, 40) };
}

// ---------- 表の並べ替え ----------
export function sortRows(rows, key, dir = 'desc') {
  const mul = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = typeof key === 'function' ? key(a) : a[key];
    const y = typeof key === 'function' ? key(b) : b[key];
    const xn = x === null || x === undefined || (typeof x === 'number' && !Number.isFinite(x));
    const yn = y === null || y === undefined || (typeof y === 'number' && !Number.isFinite(y));
    if (xn && yn) return 0;
    if (xn) return 1; // 空欄はいつも最後
    if (yn) return -1;
    if (typeof x === 'string') return mul * x.localeCompare(y, 'ja');
    return mul * (x - y);
  });
}

export function median(values) {
  const v = values.filter(isNum).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
