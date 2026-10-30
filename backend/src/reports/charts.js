const { COLORS, FONT } = require("./theme");

/**
 * Static SVG bar charts for the PDF (vector, so they stay sharp at any zoom).
 * One series each: no legend, the section title names it. Recessive grid, mono axis labels.
 */

const escapeXml = (text) => String(text).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);

// 1-2-5 steps so the axis reads 0, 500, 1,000, ...
const niceStep = (max, ticks = 4) => {
  if (max <= 0) return 1;
  const raw = max / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].find((m) => m * magnitude >= raw) * magnitude;
  return Math.max(1, step);
};

/**
 * @param {{ values: number[], labels: string[], labelEvery?: number, highlight?: number[], width: number, height: number }} options
 *   labels: x-axis label per bar (only every `labelEvery`-th is printed); highlight: indexes drawn in the signal color
 */
const barChartSvg = ({ values, labels, labelEvery = 1, highlight = [], width, height }) => {
  const left = 34;
  const right = 2;
  const top = 8;
  const bottom = 16;
  const plotW = width - left - right;
  const plotH = height - top - bottom;

  const max = Math.max(0, ...values);
  const step = niceStep(max);
  const axisMax = Math.max(step, Math.ceil(max / step) * step);
  const y = (v) => top + plotH - (v / axisMax) * plotH;

  const parts = [];
  for (let v = 0; v <= axisMax; v += step) {
    const yy = y(v).toFixed(2);
    parts.push(`<line x1="${left}" y1="${yy}" x2="${width - right}" y2="${yy}" stroke="${v === 0 ? COLORS.muted : COLORS.border}" stroke-width="${v === 0 ? 0.6 : 0.5}"/>`);
    parts.push(`<text x="${left - 5}" y="${(Number(yy) + 2.5).toFixed(2)}" text-anchor="end" font-family="${FONT.mono}" font-size="6.5" fill="${COLORS.muted}">${v.toLocaleString("en-US")}</text>`);
  }

  const band = plotW / values.length;
  // 2pt gap between neighbouring bars, but never thinner than half the band
  const barW = Math.max(band / 2, band - 2);
  values.forEach((v, i) => {
    const x = left + i * band + (band - barW) / 2;
    if (v > 0) {
      const h = Math.max(0.8, (v / axisMax) * plotH);
      const fill = highlight.includes(i) ? COLORS.signal : COLORS.primary;
      parts.push(`<rect x="${x.toFixed(2)}" y="${(top + plotH - h).toFixed(2)}" width="${barW.toFixed(2)}" height="${h.toFixed(2)}" fill="${fill}"/>`);
    }
    if (i % labelEvery === 0) {
      parts.push(`<text x="${(left + i * band + band / 2).toFixed(2)}" y="${height - 4}" text-anchor="middle" font-family="${FONT.mono}" font-size="6.5" fill="${COLORS.muted}">${escapeXml(labels[i])}</text>`);
    }
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join("")}</svg>`;
};

module.exports = { barChartSvg };
