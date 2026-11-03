// スライド用の横長PNG（1920×1080）を作って保存する。
// 画面のスクリーンショットではなく、白い背景に大きな文字で描き直す。

import { FONT, palette } from './charts.js';

const W = 1920;
const H = 1080;
const PAD = 72;

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const ch of String(text)) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function frame(ctx, { title, subtitle, footer }) {
  const pal = palette(true);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = pal.series[0];
  ctx.fillRect(0, 0, W, 10);
  ctx.fillStyle = pal.ink;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = `700 54px ${FONT}`;
  const tl = wrapText(ctx, title, W - PAD * 2).slice(0, 2);
  let y = 44;
  for (const l of tl) { ctx.fillText(l, PAD, y); y += 66; }
  if (subtitle) {
    ctx.fillStyle = pal.ink2;
    ctx.font = `400 30px ${FONT}`;
    for (const l of wrapText(ctx, subtitle, W - PAD * 2).slice(0, 2)) { ctx.fillText(l, PAD, y + 4); y += 40; }
  }
  // フッター（出典・注意書き）
  ctx.fillStyle = pal.muted;
  ctx.font = `400 22px ${FONT}`;
  const fl = wrapText(ctx, footer, W - PAD * 2).slice(0, 3);
  let fy = H - 34 - (fl.length - 1) * 30;
  ctx.strokeStyle = pal.grid;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, fy - 18);
  ctx.lineTo(W - PAD, fy - 18);
  ctx.stroke();
  for (const l of fl) { ctx.fillText(l, PAD, fy - 6); fy += 30; }
  return { top: y + 24, bottom: H - 34 - (fl.length - 1) * 30 - 36 };
}

function legend(ctx, items, x, y) {
  const pal = palette(true);
  ctx.font = `400 26px ${FONT}`;
  ctx.textBaseline = 'middle';
  let cx = x;
  for (const it of items) {
    ctx.fillStyle = it.color;
    if (it.box) ctx.fillRect(cx, y - 9, 18, 18);
    else ctx.fillRect(cx, y - 3, 34, 6);
    cx += it.box ? 28 : 44;
    ctx.fillStyle = pal.ink2;
    ctx.fillText(it.label, cx, y);
    cx += ctx.measureText(it.label).width + 40;
  }
  return 44;
}

async function save(canvas, filename) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const file = new File([blob], filename, { type: 'image/png' });
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (coarse && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// build(canvas, scale) で Chart.js のグラフを描く関数を受け取る
export async function exportChart({ title, subtitle, footer, legendItems, build, filename }) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const area = frame(ctx, { title, subtitle, footer });
  let top = area.top;
  if (legendItems && legendItems.length) top += legend(ctx, legendItems, PAD, top + 10);
  const ch = document.createElement('canvas');
  ch.width = W - PAD * 2;
  ch.height = Math.max(200, area.bottom - top);
  // Chart.js は DOM に入っていないキャンバスにも描ける（responsive: false のとき）
  const holder = document.createElement('div');
  holder.style.cssText = `position:fixed;left:-10000px;top:0;width:${ch.width}px;height:${ch.height}px;`;
  holder.appendChild(ch);
  document.body.appendChild(holder);
  try {
    const chart = build(ch, 2);
    chart.resize(ch.width, ch.height);
    chart.update('none');
    ctx.drawImage(ch, PAD, top);
    chart.destroy();
  } finally {
    holder.remove();
  }
  await save(canvas, filename);
}

// columns: [{label, align:'left'|'right', width(比率)}], rows: [[文字列,...]]
export async function exportTable({ title, subtitle, footer, columns, rows, filename, note }) {
  const pal = palette(true);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const area = frame(ctx, { title, subtitle, footer });
  const tableW = W - PAD * 2;
  const totalRatio = columns.reduce((s, c) => s + (c.width || 1), 0);
  const widths = columns.map((c) => (tableW * (c.width || 1)) / totalRatio);
  const available = area.bottom - area.top - (note ? 40 : 0);
  const maxRows = Math.max(1, Math.min(rows.length, Math.floor((available - 64) / 52)));
  const rowH = Math.min(64, Math.floor((available - 64) / Math.max(1, maxRows)));
  const fontSize = Math.max(22, Math.min(30, Math.floor(rowH * 0.5)));
  let y = area.top;
  // 見出し行
  ctx.fillStyle = '#f2f1ed';
  ctx.fillRect(PAD, y, tableW, 60);
  ctx.font = `700 ${fontSize}px ${FONT}`;
  ctx.textBaseline = 'middle';
  let x = PAD;
  columns.forEach((c, i) => {
    ctx.fillStyle = pal.ink2;
    ctx.textAlign = c.align === 'right' ? 'right' : 'left';
    const tx = c.align === 'right' ? x + widths[i] - 16 : x + 16;
    ctx.fillText(fit(ctx, c.label, widths[i] - 24), tx, y + 30);
    x += widths[i];
  });
  y += 60;
  rows.slice(0, maxRows).forEach((r, ri) => {
    if (ri % 2 === 1) {
      ctx.fillStyle = '#f9f9f7';
      ctx.fillRect(PAD, y, tableW, rowH);
    }
    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, y + rowH);
    ctx.lineTo(PAD + tableW, y + rowH);
    ctx.stroke();
    let cx = PAD;
    r.forEach((cell, i) => {
      const c = columns[i];
      const isNA = cell === '取得できず';
      ctx.font = `${i === 0 ? 700 : 400} ${isNA ? fontSize - 6 : fontSize}px ${FONT}`;
      ctx.fillStyle = isNA ? pal.muted : pal.ink;
      ctx.textAlign = c.align === 'right' ? 'right' : 'left';
      const tx = c.align === 'right' ? cx + widths[i] - 16 : cx + 16;
      ctx.fillText(fit(ctx, String(cell), widths[i] - 24), tx, y + rowH / 2);
      cx += widths[i];
    });
    y += rowH;
  });
  if (note || rows.length > maxRows) {
    ctx.font = `400 22px ${FONT}`;
    ctx.fillStyle = pal.muted;
    ctx.textAlign = 'left';
    const more = rows.length > maxRows ? `（全${rows.length}件のうち上から${maxRows}件）` : '';
    ctx.fillText(`${note || ''}${more}`, PAD, y + 26);
  }
  await save(canvas, filename);
}

function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}
