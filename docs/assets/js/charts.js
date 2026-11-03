// Chart.js の共通設定。色は CSS 変数（ライト／ダーク）から読む。
// ルール: 1つのグラフに縦軸は1つだけ。系列の色は固定の順番（テーマごとに決まった色）。

const LIGHT = {
  surface: '#ffffff', ink: '#0b0b0b', ink2: '#52514e', muted: '#6f6d68', grid: '#e1e0d9', axis: '#c3c2b7',
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  up: '#006300', down: '#c02f2f',
};

export const FONT = 'system-ui, -apple-system, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic UI", Meiryo, sans-serif';

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function palette(forExport = false) {
  if (forExport) return LIGHT;
  return {
    surface: cssVar('--surface'), ink: cssVar('--ink'), ink2: cssVar('--ink-2'), muted: cssVar('--muted'),
    grid: cssVar('--grid'), axis: cssVar('--axis'),
    series: ['--t1', '--t2', '--t3', '--t4', '--t5', '--t6', '--t7', '--t8'].map(cssVar),
    up: cssVar('--up'), down: cssVar('--down'),
  };
}

// テーマの色（themes の並び順で固定）
export function themeColorVar(index) {
  return `var(--t${(index % 8) + 1})`;
}

const crosshair = {
  id: 'crosshair',
  afterDatasetsDraw(chart) {
    const act = chart.tooltip?.getActiveElements?.() || [];
    if (!act.length || chart.config.type !== 'line') return;
    const x = act[0].element.x;
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = chart.options.plugins.crosshair?.color || '#999';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.restore();
  },
};

function base(pal, scale = 1) {
  return {
    responsive: scale === 1,
    maintainAspectRatio: false,
    animation: scale === 1 ? { duration: 250 } : false,
    devicePixelRatio: scale === 1 ? undefined : 1,
    layout: { padding: { top: 6 * scale, right: 10 * scale, bottom: 2 * scale, left: 2 * scale } },
    plugins: {
      legend: { display: false },
      crosshair: { color: pal.axis },
      tooltip: {
        enabled: scale === 1,
        backgroundColor: pal.surface,
        titleColor: pal.ink,
        bodyColor: pal.ink,
        borderColor: pal.axis,
        borderWidth: 1,
        padding: 10,
        titleFont: { family: FONT, weight: '600' },
        bodyFont: { family: FONT },
      },
    },
  };
}

function axisFont(scale) {
  return { family: FONT, size: 12 * scale };
}

export function destroyOn(canvas) {
  const C = window.Chart;
  const ch = C && C.getChart(canvas);
  if (ch) ch.destroy();
}

// ---------- 折れ線（時系列） ----------
// datasets: [{label, data:[[date,value],...], color, dashed?, width?}]
export function lineChart(canvas, { datasets, yFormat = (v) => v, tooltipFormat, scale = 1, forExport = false, yTitle }) {
  destroyOn(canvas);
  const pal = palette(forExport);
  const allDates = [...new Set(datasets.flatMap((d) => d.data.map((p) => p[0])))].sort();
  const ds = datasets.map((d) => {
    const m = new Map(d.data);
    return {
      label: d.label,
      data: allDates.map((x) => (m.has(x) ? m.get(x) : null)),
      borderColor: d.color,
      backgroundColor: d.color,
      borderWidth: (d.width || 2) * scale,
      borderDash: d.dashed ? [6 * scale, 4 * scale] : [],
      pointRadius: 0,
      pointHoverRadius: 4 * scale,
      spanGaps: true,
      tension: 0,
    };
  });
  const opts = base(pal, scale);
  opts.interaction = { mode: 'index', intersect: false };
  opts.plugins.tooltip.callbacks = {
    title: (items) => (items[0] ? items[0].label.replaceAll('-', '/') : ''),
    label: (it) => ` ${it.dataset.label}: ${(tooltipFormat || yFormat)(it.parsed.y)}`,
  };
  opts.scales = {
    x: {
      type: 'category',
      grid: { display: false },
      border: { color: pal.axis },
      ticks: {
        color: pal.muted, font: axisFont(scale), maxRotation: 0, autoSkip: true, maxTicksLimit: scale === 1 ? 6 : 8,
        callback(v) { const s = this.getLabelForValue(v); return s ? s.slice(0, 7).replace('-', '/') : ''; },
      },
    },
    y: {
      grid: { color: pal.grid },
      border: { display: false },
      ticks: { color: pal.muted, font: axisFont(scale), callback: (v) => yFormat(v), maxTicksLimit: 6 },
      title: yTitle ? { display: true, text: yTitle, color: pal.ink2, font: axisFont(scale) } : undefined,
    },
  };
  return new window.Chart(canvas, { type: 'line', data: { labels: allDates, datasets: ds }, options: opts, plugins: [crosshair] });
}

// ---------- 棒グラフ ----------
// groups: [{label, values:[...], color}]（2系列以上なら凡例をHTMLで別に出す）
export function barChart(canvas, { labels, groups, format = (v) => v, horizontal = false, scale = 1, forExport = false, zeroLine = true, valueLabels = false }) {
  destroyOn(canvas);
  const pal = palette(forExport);
  const ds = groups.map((g) => ({
    label: g.label,
    data: g.values,
    backgroundColor: g.colors || g.color,
    borderRadius: 4 * scale,
    borderSkipped: 'start',
    maxBarThickness: 46 * scale,
    categoryPercentage: 0.72,
    barPercentage: 0.9,
  }));
  const opts = base(pal, scale);
  opts.indexAxis = horizontal ? 'y' : 'x';
  opts.interaction = { mode: 'nearest', intersect: false, axis: horizontal ? 'y' : 'x' };
  opts.plugins.tooltip.callbacks = { label: (it) => ` ${it.dataset.label}: ${it.raw === null ? '取得できず' : format(it.raw)}` };
  const valueAxis = {
    grid: { color: pal.grid },
    border: { display: false },
    ticks: { color: pal.muted, font: axisFont(scale), callback: (v) => format(v), maxTicksLimit: 6 },
    grace: '8%',
  };
  const catAxis = {
    grid: { display: false },
    border: { color: zeroLine ? pal.axis : 'transparent' },
    ticks: { color: pal.ink2, font: axisFont(scale), autoSkip: false, maxRotation: 0 },
  };
  opts.scales = horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis };
  const plugins = [];
  if (valueLabels) {
    plugins.push({
      id: 'valueLabels',
      afterDatasetsDraw(chart) {
        const ctx = chart.ctx;
        ctx.save();
        ctx.fillStyle = pal.ink;
        ctx.font = `600 ${12 * scale}px ${FONT}`;
        chart.data.datasets.forEach((d, di) => {
          chart.getDatasetMeta(di).data.forEach((el, i) => {
            const v = d.data[i];
            if (v === null || v === undefined) return;
            const txt = format(v);
            if (horizontal) {
              ctx.textAlign = v >= 0 ? 'left' : 'right';
              ctx.textBaseline = 'middle';
              ctx.fillText(txt, el.x + (v >= 0 ? 6 : -6) * scale, el.y);
            } else {
              ctx.textAlign = 'center';
              ctx.textBaseline = v >= 0 ? 'bottom' : 'top';
              ctx.fillText(txt, el.x, el.y + (v >= 0 ? -4 : 4) * scale);
            }
          });
        });
        ctx.restore();
      },
    });
  }
  return new window.Chart(canvas, { type: 'bar', data: { labels, datasets: ds }, options: opts, plugins });
}

export function legendHTML(items) {
  return `<div class="legend">${items.map((i) => `<span><i style="background:${i.color}" class="${i.box ? 'box' : ''}${i.dashed ? ' dashed' : ''}"></i>${i.label}</span>`).join('')}</div>`;
}
