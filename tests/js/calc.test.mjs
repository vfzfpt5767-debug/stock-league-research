// ブラウザ側の計算（docs/assets/js/calc.js）のテスト。node --test tests/js で実行
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../docs/assets/js/calc.js';

const rules = { budget_yen: 5000000, min_stocks: 10, max_stocks: 20, fee_rate: 0.01, fee_tax_rate: 0.1 };

test('手数料率は1.1%', () => {
  assert.ok(Math.abs(C.feeRate(rules) - 0.011) < 1e-12);
});

test('株数は手数料込みで金額を超えない最大の100株単位', () => {
  // 3,040円 × 100株 × 1.011 = 307,344円 → 40万円なら100株、70万円なら200株
  assert.equal(C.sharesFor(400000, 3040, 100, rules), 100);
  assert.equal(C.sharesFor(700000, 3040, 100, rules), 200);
  assert.equal(C.sharesFor(300000, 3040, 100, rules), 0);
  assert.equal(C.sharesFor(300000, 3040, 1, rules), 97);
  assert.equal(C.sharesFor(300000, null, 1, rules), 0);
});

test('ポートフォリオの合計と警告', () => {
  const items = [{ code: '7203', amount: 400000 }, { code: '6758', amount: 100000 }];
  const prices = { 7203: 3040, 6758: 4000 };
  const p = C.planPortfolio(items, prices, 100, rules);
  assert.equal(p.rows[0].shares, 100);
  assert.equal(p.rows[1].shares, 0);
  assert.equal(p.invested, 304000);
  assert.equal(p.fees, Math.round(304000 * 0.011));
  assert.equal(p.count, 1);
  assert.ok(p.warnings.some((w) => w.includes('10〜20銘柄')));
  assert.ok(p.warnings.some((w) => w.includes('6758')));
  assert.equal(p.cash, 5000000 - p.total);
});

test('予算オーバーの警告', () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ code: String(1000 + i), amount: 600000 }));
  const prices = Object.fromEntries(items.map((i) => [i.code, 1000]));
  const p = C.planPortfolio(items, prices, 100, rules);
  assert.ok(p.warnings.some((w) => w.includes('超えています')));
});

test('URLへの保存と読み込みが往復する', () => {
  const st = { items: [{ code: '7203', amount: 500000 }, { code: '285A', amount: 300000 }], lot: 1, topix: { t1: 12.34, t3: 45.67, m3: -21.09, td: '2026-09-30' }, name: 'A案' };
  const q = C.encodePortfolio(st);
  const back = C.decodePortfolio(q);
  assert.deepEqual(back.items, st.items);
  assert.equal(back.lot, 1);
  assert.deepEqual(back.topix, st.topix);
  assert.equal(back.name, 'A案');
});

test('URLの不正な値は無視する', () => {
  const back = C.decodePortfolio('p=7203:500000,abc:1,7203:3,99999:1,6758:x&lot=7&t1=foo');
  assert.deepEqual(back.items, [{ code: '7203', amount: 500000 }]);
  assert.equal(back.lot, 100);
  assert.deepEqual(back.topix, {});
});

test('バックテスト：2銘柄を半分ずつ', () => {
  const weekly = {
    A: [['2025-01-03', 100], ['2025-01-10', 110], ['2025-01-17', 120]],
    B: [['2025-01-03', 50], ['2025-01-10', 50], ['2025-01-17', 40]],
  };
  const bt = C.backtest({ A: 1, B: 1 }, weekly, '2025-01-03', '2025-01-17');
  assert.deepEqual(bt.included, ['A', 'B']);
  const last = bt.series[bt.series.length - 1][1];
  assert.ok(Math.abs(last - 100 * (0.5 * 1.2 + 0.5 * 0.8)) < 1e-9);
});

test('バックテスト：開始時点に株価がない銘柄は除く', () => {
  const weekly = { A: [['2025-01-03', 100], ['2025-01-10', 110]], NEW: [['2025-06-06', 10]] };
  const bt = C.backtest({ A: 1, NEW: 1 }, weekly, '2025-01-03', '2025-01-10');
  assert.deepEqual(bt.excluded, ['NEW']);
  assert.ok(Math.abs(bt.series[bt.series.length - 1][1] - 110) < 1e-9);
});

test('最大下落率と値動きの大きさ', () => {
  const s = [['a', 100], ['b', 120], ['c', 90], ['d', 130]];
  assert.ok(Math.abs(C.maxDrawdown(s).value - (90 / 120 - 1)) < 1e-12);
  assert.equal(C.annualVol([100, 100, 100]), 0);
});

test('並べ替えでは空欄がいつも最後', () => {
  const rows = [{ v: 1 }, { v: null }, { v: 3 }, { v: 2 }];
  assert.deepEqual(C.sortRows(rows, 'v', 'desc').map((r) => r.v), [3, 2, 1, null]);
  assert.deepEqual(C.sortRows(rows, 'v', 'asc').map((r) => r.v), [1, 2, 3, null]);
});

test('表示の書式', () => {
  assert.equal(C.fmtPct(0.1234), '+12.3%');
  assert.equal(C.fmtPct(-0.05), '-5.0%');
  assert.equal(C.fmtPct(null), '取得できず');
  assert.equal(C.fmtJpAmount(12345600000000), '12.35兆円');
  assert.equal(C.fmtJpAmount(123456789), '1億円');
  assert.equal(C.fmtYen(3040), '3,040円');
});
