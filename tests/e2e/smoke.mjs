// ブラウザで各ページを開き、エラーが出ないかを確かめる（スクリーンショットも保存）
// 使い方: node tests/e2e/smoke.mjs [出力フォルダ]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('docs');
const outDir = process.argv[2] || '.cache/screens';
fs.mkdirSync(outDir, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;

const stocks = JSON.parse(fs.readFileSync(path.join(root, 'data/stocks.json'), 'utf8'));
const first = stocks[0];
const pick = stocks.slice(0, 12);
const pf = pick.map((s) => `${s.code}:400000`).join(',');
const pr = pick.map((s, i) => `${s.code}:${1000 + i * 250}`).join(',');
const routes = [
  ['home', '#/'],
  ['rules', '#/rules'],
  ['theme', '#/theme/semicon'],
  ['compare', '#/compare'],
  ['compare-filter', '#/compare?theme=raremetal&sort=industry&dir=desc'],
  ['stock', `#/stock/${first.code}`],
  ['themes', '#/themes'],
  ['portfolio', `#/portfolio?p=${pf}&pr=${pr}&pp=${pr}&pd=2025-11-04&tp=20`],
  ['news', '#/news?theme=energy'],
  ['glossary', '#/glossary'],
  ['about', '#/about'],
];

const browser = await chromium.launch();
let failures = 0;
for (const [vpName, vp, scheme] of [['desktop', { width: 1280, height: 900 }, 'light'], ['mobile', { width: 390, height: 844 }, 'dark']]) {
  const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  for (const [name, hash] of routes) {
    errors.length = 0;
    await page.goto(base + hash);
    await page.waitForTimeout(1500);
    const title = await page.title();
    const text = await page.locator('#app').innerText();
    const bad = /表示中にエラー|データを読み込めませんでした|ページが見つかりません/.test(text);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    await page.screenshot({ path: `${outDir}/${vpName}-${name}.png`, fullPage: false });
    const ok = !errors.length && !bad && !overflow;
    if (!ok) failures++;
    console.log(`${ok ? 'OK ' : 'NG '} ${vpName} ${name} — ${title}${errors.length ? ' ' + JSON.stringify(errors) : ''}${bad ? ' [error text]' : ''}${overflow ? ' [horizontal overflow]' : ''}`);
  }
  await ctx.close();
}
await browser.close();
server.close();
if (failures) { console.error(`${failures} page(s) failed`); process.exit(1); }
