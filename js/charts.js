/* BabPls charts: tiny dependency-free SVG chart builders. Each returns an SVG string. */
(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f3 = v => (v === null || v === undefined || !isFinite(v)) ? '–' : (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(3));
  const PAL = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];
  function nice(lo, hi) {
    if (lo === hi) { lo -= 1; hi += 1; }
    const span = hi - lo, step = Math.pow(10, Math.floor(Math.log10(span / 5)));
    const m = [1, 2, 2.5, 5, 10].find(k => span / (k * step) <= 6) * step;
    const a = Math.floor(lo / m) * m, b = Math.ceil(hi / m) * m, ticks = [];
    for (let v = a; v <= b + m / 2; v += m) ticks.push(+v.toFixed(10));
    return { lo: a, hi: b, ticks };
  }
  function wrap(w, h, body, title) {
    return `<svg class="chart" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(title || '')}">` +
      `<style>.chart text{font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;font-size:11px;fill:var(--ink,#222)}.chart .ax{stroke:var(--line,#ccc)}.chart .gd{stroke:var(--grid,#eee)}.chart .tt{font-size:13px;font-weight:600}</style>` +
      (title ? `<text class="tt" x="${w / 2}" y="16" text-anchor="middle">${esc(title)}</text>` : '') + body + '</svg>';
  }

  // Horizontal bar chart. items: [{label, value, color?}]
  function bars(items, o) {
    o = o || {};
    const lw = Math.min(260, 20 + Math.max(40, ...items.map(i => String(i.label).length * 6.4)));
    const bh = 20, gap = 6, top = o.title ? 28 : 8, w = o.width || 640, h = top + items.length * (bh + gap) + 30;
    const vals = items.map(i => i.value).filter(isFinite);
    const lims = (o.thresholds || []).map(t => t.value);
    const n = nice(Math.min(0, ...vals, ...lims, o.min !== undefined ? o.min : 0), Math.max(0, ...vals, ...lims, o.max !== undefined ? o.max : 0));
    const x0 = lw, x1 = w - 50, X = v => x0 + (v - n.lo) / (n.hi - n.lo) * (x1 - x0);
    let s = '';
    n.ticks.forEach(t => { s += `<line class="gd" x1="${X(t)}" x2="${X(t)}" y1="${top}" y2="${h - 24}"/><text x="${X(t)}" y="${h - 10}" text-anchor="middle">${+t.toFixed(3)}</text>`; });
    items.forEach((it, i) => {
      const y = top + i * (bh + gap), v = isFinite(it.value) ? it.value : 0;
      const a = X(Math.min(0, v)), b = X(Math.max(0, v));
      s += `<text x="${lw - 6}" y="${y + bh / 2 + 4}" text-anchor="end">${esc(it.label)}</text>`;
      s += `<rect x="${a}" y="${y}" width="${Math.max(1, b - a)}" height="${bh}" rx="3" fill="${it.color || (v < 0 ? 'var(--neg)' : 'var(--c1)')}"><title>${esc(it.label)}: ${f3(it.value)}</title></rect>`;
      s += `<text x="${(v < 0 ? a - 4 : b + 4)}" y="${y + bh / 2 + 4}" text-anchor="${v < 0 ? 'end' : 'start'}">${f3(it.value)}</text>`;
    });
    s += `<line class="ax" x1="${X(0)}" x2="${X(0)}" y1="${top - 2}" y2="${h - 24}"/>`;
    (o.thresholds || []).forEach(t => { s += `<line x1="${X(t.value)}" x2="${X(t.value)}" y1="${top - 4}" y2="${h - 24}" stroke="var(--warn)" stroke-dasharray="5 3" stroke-width="1.5"/><text x="${X(t.value) + 3}" y="${top + 2}" style="fill:var(--warn)">${esc(t.label || t.value)}</text>`; });
    return wrap(w, h, s, o.title);
  }

  // Grouped vertical bars: groups [{label, values:[...] }], series names
  function grouped(groups, series, o) {
    o = o || {};
    const bottom = Math.min(170, 34 + Math.max(...groups.map(g => String(g.label).length)) * 4.6), left = 50;
    const w = o.width || Math.max(480, 60 + groups.length * (series.length * 18 + 22)), h = (o.height || 300) + bottom - 70, top = o.title ? 30 : 10;
    const all = groups.flatMap(g => g.values).filter(isFinite);
    const n = nice(Math.min(0, ...all), Math.max(0, ...all));
    const Y = v => top + (n.hi - v) / (n.hi - n.lo) * (h - top - bottom);
    const gw = (w - left - 10) / groups.length, bw = Math.min(18, (gw - 10) / series.length);
    let s = '';
    n.ticks.forEach(t => { s += `<line class="gd" x1="${left}" x2="${w - 10}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${left - 5}" y="${Y(t) + 4}" text-anchor="end">${+t.toFixed(3)}</text>`; });
    groups.forEach((g, i) => {
      const gx = left + i * gw + (gw - bw * series.length) / 2;
      g.values.forEach((v, k) => {
        const a = Y(Math.max(0, v)), b = Y(Math.min(0, v));
        s += `<rect x="${gx + k * bw}" y="${a}" width="${bw - 2}" height="${Math.max(1, b - a)}" fill="${PAL[k % PAL.length]}"><title>${esc(g.label)} – ${esc(series[k])}: ${f3(v)}</title></rect>`;
      });
      s += `<text transform="translate(${left + i * gw + gw / 2},${h - bottom + 12}) rotate(-35)" text-anchor="end">${esc(g.label)}</text>`;
    });
    s += `<line class="ax" x1="${left}" x2="${w - 10}" y1="${Y(0)}" y2="${Y(0)}"/>`;
    series.forEach((sn, k) => { s += `<rect x="${left + k * 110}" y="${h - 16}" width="10" height="10" fill="${PAL[k % PAL.length]}"/><text x="${left + k * 110 + 14}" y="${h - 7}">${esc(sn)}</text>`; });
    return wrap(w, h, s, o.title);
  }

  // Heatmap of a square/rect matrix
  function heatmap(rowLabels, colLabels, M, o) {
    o = o || {};
    const lw = Math.min(200, 16 + Math.max(...rowLabels.map(l => String(l).length * 6.4))), cw = o.cell || Math.max(48, Math.min(70, 520 / colLabels.length));
    const top = (o.title ? 28 : 6) + 70, w = lw + colLabels.length * cw + 10, h = top + rowLabels.length * 26 + 10;
    const lo = o.min !== undefined ? o.min : -1, hi = o.max !== undefined ? o.max : 1;
    const color = v => {
      if (!isFinite(v)) return 'var(--bg2)';
      if (o.threshold !== undefined) return v >= o.threshold ? 'var(--bad-bg)' : 'var(--good-bg)';
      const t = Math.max(-1, Math.min(1, (v - (lo + hi) / 2) / ((hi - lo) / 2)));
      return t >= 0 ? `rgba(37,99,235,${0.08 + 0.6 * t})` : `rgba(220,38,38,${0.08 + 0.6 * -t})`;
    };
    let s = '';
    colLabels.forEach((c, j) => { s += `<text transform="translate(${lw + j * cw + cw / 2},${top - 6}) rotate(-40)">${esc(c)}</text>`; });
    rowLabels.forEach((r, i) => {
      s += `<text x="${lw - 6}" y="${top + i * 26 + 17}" text-anchor="end">${esc(r)}</text>`;
      colLabels.forEach((c, j) => {
        const v = M[i][j], show = !(o.lower && j > i) && !(o.hideDiag && i === j);
        s += `<rect x="${lw + j * cw}" y="${top + i * 26}" width="${cw - 2}" height="24" rx="2" fill="${show ? color(v) : 'transparent'}"/>`;
        if (show && isFinite(v)) s += `<text x="${lw + j * cw + cw / 2 - 1}" y="${top + i * 26 + 16}" text-anchor="middle">${f3(v)}</text>`;
      });
    });
    return wrap(w, h, s, o.title);
  }

  // Histogram with optional vertical markers [{value,label}]
  function histogram(values, o) {
    o = o || {};
    const v = values.filter(isFinite); if (!v.length) return '';
    const w = o.width || 520, h = o.height || 240, top = o.title ? 30 : 10, left = 44, bottom = 34;
    const lo = Math.min(...v), hi = Math.max(...v), k = o.bins || Math.min(40, Math.max(8, Math.ceil(Math.sqrt(v.length))));
    const width = (hi - lo) / k || 1, counts = new Array(k).fill(0);
    v.forEach(x => { counts[Math.min(k - 1, Math.floor((x - lo) / width))]++; });
    const n = nice(lo, hi), cmax = Math.max(...counts);
    const X = x => left + (x - n.lo) / (n.hi - n.lo) * (w - left - 10), Y = c => h - bottom - c / cmax * (h - top - bottom);
    let s = '';
    n.ticks.forEach(t => { s += `<text x="${X(t)}" y="${h - 16}" text-anchor="middle">${+t.toFixed(3)}</text><line class="gd" x1="${X(t)}" x2="${X(t)}" y1="${top}" y2="${h - bottom}"/>`; });
    counts.forEach((c, i) => { const a = X(lo + i * width), b = X(lo + (i + 1) * width); s += `<rect x="${a}" y="${Y(c)}" width="${Math.max(1, b - a - 1)}" height="${h - bottom - Y(c)}" fill="var(--c1)" opacity=".8"><title>${f3(lo + i * width)} – ${f3(lo + (i + 1) * width)}: ${c}</title></rect>`; });
    s += `<line class="ax" x1="${left}" x2="${w - 10}" y1="${h - bottom}" y2="${h - bottom}"/><text x="${left - 6}" y="${top + 8}" text-anchor="end">${cmax}</text>`;
    (o.marks || []).forEach((m, i) => { if (!isFinite(m.value)) return; const x = X(m.value); s += `<line x1="${x}" x2="${x}" y1="${top}" y2="${h - bottom}" stroke="${m.color || 'var(--warn)'}" stroke-width="2" stroke-dasharray="${m.dash || ''}"/><text x="${x + 3}" y="${top + 10 + i * 12}" style="fill:${m.color || 'var(--warn)'}">${esc(m.label || '')}</text>`; });
    if (o.xLabel) s += `<text x="${(w + left) / 2}" y="${h - 2}" text-anchor="middle">${esc(o.xLabel)}</text>`;
    return wrap(w, h, s, o.title);
  }

  // Scatter. points [{x,y,label?,color?}], o.step: [[x,y]...] ceiling line, o.lines: [{points:[[x,y]..],label,color}]
  function scatter(points, o) {
    o = o || {};
    const w = o.width || 560, h = o.height || 400, top = o.title ? 32 : 12, left = 54, bottom = 44, right = 20;
    const xs = points.map(p => p.x).concat((o.lines || []).flatMap(l => l.points.map(p => p[0]))), ys = points.map(p => p.y).concat((o.lines || []).flatMap(l => l.points.map(p => p[1])));
    const nx = nice(o.xmin !== undefined ? o.xmin : Math.min(...xs), o.xmax !== undefined ? o.xmax : Math.max(...xs));
    const ny = nice(o.ymin !== undefined ? o.ymin : Math.min(...ys), o.ymax !== undefined ? o.ymax : Math.max(...ys));
    const X = x => left + (x - nx.lo) / (nx.hi - nx.lo) * (w - left - right), Y = y => h - bottom - (y - ny.lo) / (ny.hi - ny.lo) * (h - top - bottom);
    let s = '';
    nx.ticks.forEach(t => { s += `<line class="gd" x1="${X(t)}" x2="${X(t)}" y1="${top}" y2="${h - bottom}"/><text x="${X(t)}" y="${h - bottom + 14}" text-anchor="middle">${+t.toFixed(3)}</text>`; });
    ny.ticks.forEach(t => { s += `<line class="gd" x1="${left}" x2="${w - right}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${left - 5}" y="${Y(t) + 4}" text-anchor="end">${+t.toFixed(3)}</text>`; });
    if (o.quadrants) { const mx = X(o.quadrants.x), my = Y(o.quadrants.y); s += `<line x1="${mx}" x2="${mx}" y1="${top}" y2="${h - bottom}" stroke="var(--warn)" stroke-dasharray="4 3"/><line x1="${left}" x2="${w - right}" y1="${my}" y2="${my}" stroke="var(--warn)" stroke-dasharray="4 3"/>`; }
    if (o.step) {
      let d = ''; o.step.forEach((p, i) => { d += (i ? `L${X(p[0])},${Y(o.step[i - 1][1])}L${X(p[0])},${Y(p[1])}` : `M${X(p[0])},${Y(p[1])}`); });
      d += `L${X(nx.hi)},${Y(o.step[o.step.length - 1][1])}`;
      s += `<path d="${d}" fill="none" stroke="var(--c2)" stroke-width="2"/>`;
    }
    (o.lines || []).forEach((l, k) => {
      s += `<polyline points="${l.points.map(p => X(p[0]) + ',' + Y(p[1])).join(' ')}" fill="none" stroke="${l.color || PAL[k % PAL.length]}" stroke-width="2.2"/>`;
      if (l.label) s += `<rect x="${left + 8 + k * 120}" y="${top + 2}" width="10" height="10" fill="${l.color || PAL[k % PAL.length]}"/><text x="${left + 22 + k * 120}" y="${top + 11}">${esc(l.label)}</text>`;
    });
    const r = points.length > 200 ? 2 : (points.some(p => p.label) ? 5 : 3);
    points.forEach(p => {
      s += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${r}" fill="${p.color || 'var(--c1)'}" opacity="${points.length > 200 ? 0.5 : 0.85}"><title>${esc(p.label ? p.label + ': ' : '')}(${f3(p.x)}, ${f3(p.y)})</title></circle>`;
      if (p.label) s += `<text x="${X(p.x) + 7}" y="${Y(p.y) - 6}">${esc(p.label)}</text>`;
    });
    s += `<line class="ax" x1="${left}" x2="${w - right}" y1="${h - bottom}" y2="${h - bottom}"/><line class="ax" x1="${left}" x2="${left}" y1="${top}" y2="${h - bottom}"/>`;
    if (o.xLabel) s += `<text x="${(w + left) / 2}" y="${h - 8}" text-anchor="middle">${esc(o.xLabel)}</text>`;
    if (o.yLabel) s += `<text transform="translate(14,${(h - bottom + top) / 2}) rotate(-90)" text-anchor="middle">${esc(o.yLabel)}</text>`;
    return wrap(w, h, s, o.title);
  }

  root.YPCharts = { bars, grouped, heatmap, histogram, scatter, esc, f3 };
})(typeof self !== 'undefined' ? self : this);
