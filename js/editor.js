/* BabPls model editor: SVG path-model canvas. */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let uid = Date.now() % 100000;
  const newId = p => p + (++uid).toString(36);

  function Editor(svg, hooks) {
    this.svg = svg; this.hooks = hooks || {};
    this.model = { constructs: [], paths: [], interactions: [] };
    this.tool = 'select'; this.sel = null; this.pending = null;
    this.view = { x: 0, y: 0, k: 1 };
    this.overlay = null; this.history = []; this.future = [];
    this._bind();
  }
  const P = Editor.prototype;

  P.setModel = function (m) {
    this.model = m || { constructs: [], paths: [], interactions: [] };
    this.model.interactions = this.model.interactions || [];
    this.model.style = this.model.style || { global: {}, el: {} };
    this.model.paths.forEach(p => { if (!p.id) p.id = newId('p'); });
    this.model.constructs.forEach((c, i) => { if (c.x === undefined) { c.x = 160 + (i % 4) * 230; c.y = 120 + Math.floor(i / 4) * 180; } c.side = c.side || 'left'; });
    this.sel = null; this.render();
  };
  P.snapshot = function () { this.history.push(JSON.stringify(this.model)); if (this.history.length > 80) this.history.shift(); this.future = []; };
  P.undo = function () { if (!this.history.length) return; this.future.push(JSON.stringify(this.model)); this.model = JSON.parse(this.history.pop()); this.sel = null; this.changed(); };
  P.redo = function () { if (!this.future.length) return; this.history.push(JSON.stringify(this.model)); this.model = JSON.parse(this.future.pop()); this.sel = null; this.changed(); };
  P.changed = function () { this.overlay = null; this._lastOverlay = null; this.render(); if (this.hooks.change) this.hooks.change(); };
  P.setTool = function (t) { this.tool = t; this.pending = null; this.svg.dataset.tool = t; this.render(); if (this.hooks.tool) this.hooks.tool(t); };
  P.select = function (s) { this.sel = s; this.render(); if (this.hooks.select) this.hooks.select(s); };
  P.byId = function (id) { return this.model.constructs.find(c => c.id === id) || this.model.interactions.find(i => i.id === id); };

  P.addConstruct = function (x, y, name, indicators) {
    this.snapshot();
    const n = this.model.constructs.length + 1;
    const c = { id: newId('c'), name: name || ('Construct ' + n), mode: 'A', indicators: indicators || [], x, y, side: 'left' };
    let base = c.name, k = 2; while (this.model.constructs.some(o => o !== c && o.name === c.name)) c.name = base + ' ' + k++;
    this.model.constructs.push(c); this.sel = { type: 'construct', id: c.id }; this.changed();
    if (this.hooks.select) this.hooks.select(this.sel);
    return c;
  };
  P.addPath = function (from, to) {
    if (from === to || this.model.paths.some(p => (p.from === from && p.to === to))) return false;
    if (this.model.paths.some(p => p.from === to && p.to === from)) return false;
    this.snapshot(); this.model.paths.push({ id: newId('p'), from, to }); this.changed(); return true;
  };
  P.addModerator = function (pathId, modId) {
    const p = this.model.paths.find(q => q.id === pathId); if (!p || modId === p.from || modId === p.to) return;
    this.snapshot();
    if (!this.model.paths.some(q => q.from === modId && q.to === p.to)) this.model.paths.push({ id: newId('p'), from: modId, to: p.to });
    const a = this.byId(p.from), b = this.byId(p.to), m = this.byId(modId);
    this.model.interactions.push({ id: newId('i'), name: m.name + ' x ' + a.name, x: p.from, m: modId, y: p.to, px: (a.x + b.x) / 2, py: Math.min(a.y, b.y) - 90 });
    this.changed();
  };
  P.assign = function (cid, names) {
    const c = this.byId(cid); if (!c || !c.indicators) return;
    const add = names.filter(n => !c.indicators.includes(n)); if (!add.length) return;
    this.snapshot(); c.indicators = c.indicators.concat(add); this.changed();
  };
  P.removeSelected = function () {
    const s = this.sel; if (!s) return; this.snapshot();
    const m = this.model;
    if (s.type === 'construct') {
      m.constructs = m.constructs.filter(c => c.id !== s.id);
      m.paths = m.paths.filter(p => p.from !== s.id && p.to !== s.id);
      m.interactions = m.interactions.filter(i => i.x !== s.id && i.m !== s.id && i.y !== s.id);
    } else if (s.type === 'path') {
      const p = m.paths.find(q => q.id === s.id);
      m.paths = m.paths.filter(q => q.id !== s.id);
      if (p) m.interactions = m.interactions.filter(i => !(i.x === p.from && i.y === p.to));
    } else if (s.type === 'inter') m.interactions = m.interactions.filter(i => i.id !== s.id);
    else if (s.type === 'indicator') { const c = this.byId(s.cid); if (c) c.indicators = c.indicators.filter(n => n !== s.name); }
    if (m.style && m.style.el && s.id) delete m.style.el[s.id];
    this.sel = null; this.changed(); if (this.hooks.select) this.hooks.select(null);
  };
  P.autoLayout = function () {
    if (!this.model.constructs.length) return;
    this.snapshot();
    const cs = this.model.constructs, depth = {};
    const pred = id => this.model.paths.filter(p => p.to === id).map(p => p.from);
    const d = (id, seen) => { if (depth[id] !== undefined) return depth[id]; if (seen.has(id)) return 0; seen.add(id); const ps = pred(id); depth[id] = ps.length ? 1 + Math.max(...ps.map(x => d(x, seen))) : 0; return depth[id]; };
    cs.forEach(c => d(c.id, new Set()));
    const layers = {}; cs.forEach(c => { (layers[depth[c.id]] = layers[depth[c.id]] || []).push(c); });
    const maxD = Math.max(...Object.keys(layers).map(Number));
    Object.entries(layers).forEach(([k, arr]) => {
      const col = Number(k);
      arr.forEach((c, i) => {
        // single-node layers zig-zag over three rows so paths that skip a layer do not run through other constructs
        const zig = arr.length === 1 ? [0, -1, 1][col % 3] * 170 : 0;
        c.x = 230 + col * 280;
        c.y = 360 + (i - (arr.length - 1) / 2) * 200 + zig;
        const hasSucc = this.model.paths.some(p => p.from === c.id);
        c.side = col === 0 ? 'left' : (!hasSucc && col === maxD ? 'right' : (i % 2 ? 'bottom' : 'top'));
      });
    });
    this.model.interactions.forEach(it => { const a = this.byId(it.x), b = this.byId(it.y); if (a && b) { it.px = (a.x + b.x) / 2; it.py = Math.min(a.y, b.y) - 110; } });
    this.changed(); this.fit();
  };

  // ------------------------------------------------------------ appearance
  // Empty colour = follow the app theme (CSS variables), so light/dark mode keeps working.
  const STYLE_DEFAULTS = {
    font: 'system', lvShape: 'ellipse', lvW: 108, lvH: 60, lvFill: '', lvStroke: '', lvText: '', lvFont: 12.5, lvBold: true, lvStrokeW: 1.6,
    indShape: 'rect', indW: 70, indH: 22, indFill: '', indStroke: '', indText: '', indFont: 11,
    pathColor: '', pathW: 1.8, pathStyle: 'solid', outerColor: '', outerW: 1.1,
    interFill: '', interStroke: '', labelFont: 11, showOuter: true, showR2: true
  };
  const FONTS = {
    system: 'system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif', sans: 'Arial,Helvetica,"Liberation Sans",sans-serif',
    serif: '"Times New Roman",Times,"Liberation Serif",serif', georgia: 'Georgia,"DejaVu Serif",serif',
    tahoma: 'Tahoma,Verdana,sans-serif', mono: 'Consolas,"Courier New",monospace',
    naskh: '"Noto Naskh Arabic","Traditional Arabic","Times New Roman",serif'
  };
  const PRESETS = {
    theme: {},
    classic: { lvFill: '#4f81bd', lvStroke: '#2c5d8f', lvText: '#ffffff', indFill: '#fff2a8', indStroke: '#a8962e', indText: '#1f1f1f', pathColor: '#333333', outerColor: '#555555', interFill: '#c6efce', interStroke: '#2e7d32' },
    journal: { font: 'serif', lvFill: '#ffffff', lvStroke: '#000000', lvText: '#000000', lvBold: false, indFill: '#ffffff', indStroke: '#000000', indText: '#000000', pathColor: '#000000', outerColor: '#000000', interFill: '#ffffff', interStroke: '#000000', lvStrokeW: 1.2, pathW: 1.4 },
    pastel: { lvFill: '#e0f2fe', lvStroke: '#0284c7', lvText: '#0c4a6e', indFill: '#fce7f3', indStroke: '#db2777', indText: '#831843', pathColor: '#475569', outerColor: '#94a3b8', interFill: '#dcfce7', interStroke: '#16a34a' },
    forest: { lvFill: '#dcfce7', lvStroke: '#15803d', lvText: '#14532d', indFill: '#fef3c7', indStroke: '#a16207', indText: '#422006', pathColor: '#3f3f46', outerColor: '#78716c', interFill: '#e0e7ff', interStroke: '#4338ca' },
    contrast: { lvFill: '#000000', lvStroke: '#000000', lvText: '#ffffff', indFill: '#ffd400', indStroke: '#000000', indText: '#000000', pathColor: '#000000', outerColor: '#000000', pathW: 2.6, outerW: 1.6, lvStrokeW: 2, interFill: '#ffffff', interStroke: '#000000' },
    boxes: { lvShape: 'rounded', indShape: 'rounded', lvW: 120, lvH: 52, lvFill: '#eef2ff', lvStroke: '#4338ca', lvText: '#1e1b4b', indFill: '#f8fafc', indStroke: '#64748b', pathColor: '#334155' }
  };
  P.style = function () {
    const m = this.model; m.style = m.style || { global: {}, el: {} };
    m.style.global = m.style.global || {}; m.style.el = m.style.el || {};
    return Object.assign({}, STYLE_DEFAULTS, m.style.global);
  };
  P.elStyle = function (id) { const m = this.model; return (m.style && m.style.el && m.style.el[id]) || {}; };
  P.dims = function (c) { const g = this.style(), e = c ? this.elStyle(c.id) : {}; return { rx: (e.lvW || g.lvW) / 2, ry: (e.lvH || g.lvH) / 2, shape: e.lvShape || g.lvShape }; };

  // ------------------------------------------------------------- geometry
  function ellipseEdge(cx, cy, tx, ty, rx, ry) {
    const dx = tx - cx, dy = ty - cy; if (!dx && !dy) return [cx, cy];
    const t = 1 / Math.sqrt((dx / rx) * (dx / rx) + (dy / ry) * (dy / ry)); return [cx + dx * t, cy + dy * t];
  }
  function rectEdge(cx, cy, tx, ty, w, h) {
    const dx = tx - cx, dy = ty - cy; if (!dx && !dy) return [cx, cy];
    const t = Math.min(Math.abs((w / 2) / (dx || 1e-9)), Math.abs((h / 2) / (dy || 1e-9))); return [cx + dx * t, cy + dy * t];
  }
  function shapeEdge(shape, cx, cy, tx, ty, rx, ry) { return shape === 'ellipse' ? ellipseEdge(cx, cy, tx, ty, rx, ry) : rectEdge(cx, cy, tx, ty, 2 * rx, 2 * ry); }
  function shapeSVG(shape, cx, cy, rx, ry, attr) {
    if (shape === 'ellipse') return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"${attr}/>`;
    return `<rect x="${cx - rx}" y="${cy - ry}" width="${2 * rx}" height="${2 * ry}" rx="${shape === 'rounded' ? Math.min(14, ry) : 2}"${attr}/>`;
  }
  const styleAttr = o => { const s = Object.entries(o).filter(([, v]) => v !== '' && v !== undefined && v !== null).map(([k, v]) => `${k}:${v}`).join(';'); return s ? ` style="${esc(s)}"` : ''; };
  const dash = (st, w) => st === 'dashed' ? `${4 * w},${2.5 * w}` : st === 'dotted' ? `${w},${1.8 * w}` : '';
  const fit = (s, px, font) => { const max = Math.max(3, Math.floor(px / (font * 0.58))); return s.length > max ? s.slice(0, max - 1) + '…' : s; };

  P.indPos = function (c) {
    const g = this.style(), e = this.elStyle(c.id), d = this.dims(c);
    const iw = e.indW || g.indW, ih = g.indH, k = c.indicators.length, out = [];
    const gap = ih + 6, dist = Math.max(d.rx, d.ry) + 58;
    c.indicators.forEach((n, i) => {
      const off = (i - (k - 1) / 2);
      let x = c.x, y = c.y;
      if (c.side === 'left') { x -= d.rx + 40 + iw / 2; y += off * gap; }
      else if (c.side === 'right') { x += d.rx + 40 + iw / 2; y += off * gap; }
      else if (c.side === 'top') { x += off * (iw + 8); y -= d.ry + 44 + ih / 2; }
      else { x += off * (iw + 8); y += d.ry + 44 + ih / 2; }
      out.push({ name: n, x, y, w: iw, h: ih });
    });
    return out;
  };

  // --------------------------------------------------------------- render
  P.render = function () {
    const m = this.model, o = this.overlay, sel = this.sel, g = this.style();
    const markers = {}; let mk = 0;
    const marker = color => { const c = color || 'var(--edge)'; if (!markers[c]) markers[c] = 'ah' + (mk++); return markers[c]; };
    let body = '';
    // outer model
    m.constructs.forEach(c => {
      const e = this.elStyle(c.id), d = this.dims(c);
      const oc = e.outerColor || g.outerColor, ow = g.outerW;
      const iFill = e.indFill || g.indFill, iStroke = e.indStroke || g.indStroke, iText = e.indText || g.indText, iFont = g.indFont, ishape = g.indShape;
      this.indPos(c).forEach((p, q) => {
        const isSel = sel && sel.type === 'indicator' && sel.cid === c.id && sel.name === p.name;
        const a = shapeEdge(d.shape, c.x, c.y, p.x, p.y, d.rx, d.ry), b = rectEdge(p.x, p.y, c.x, c.y, p.w, p.h);
        const [x1, y1, x2, y2] = c.mode === 'B' ? [b[0], b[1], a[0], a[1]] : [a[0], a[1], b[0], b[1]];
        body += `<line class="outer" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#${marker(oc)})"${styleAttr({ stroke: oc, 'stroke-width': ow })}/>`;
        if (g.showOuter && o && o.outer && o.outer[c.id] && o.outer[c.id][q] !== undefined) {
          const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
          body += `<text class="olab" x="${mx}" y="${my - 3}" text-anchor="middle" style="font-size:${g.labelFont - 1}px">${esc(o.outer[c.id][q])}</text>`;
        }
        body += `<g class="ind${isSel ? ' sel' : ''}" data-cid="${c.id}" data-name="${esc(p.name)}">${shapeSVG(ishape === 'rounded' ? 'rounded' : 'rect', p.x, p.y, p.w / 2, p.h / 2, styleAttr({ fill: iFill, stroke: isSel ? '' : iStroke }))}<text x="${p.x}" y="${p.y + iFont / 3}" text-anchor="middle"${styleAttr({ fill: iText, 'font-size': iFont + 'px' })}>${esc(fit(p.name, p.w - 4, iFont))}</text><title>${esc(p.name)}</title></g>`;
      });
    });
    // inner paths
    const label = (mx, my, txt) => { const w = txt.length * g.labelFont * 0.6 + 8; return `<g class="plab"><rect x="${mx - w / 2}" y="${my - g.labelFont * 0.9}" width="${w}" height="${g.labelFont * 1.65}" rx="4"/><text x="${mx}" y="${my + g.labelFont * 0.3}" text-anchor="middle" style="font-size:${g.labelFont}px">${esc(txt)}</text></g>`; };
    m.paths.forEach(p => {
      const a = this.byId(p.from), b = this.byId(p.to); if (!a || !b) return;
      const da = this.dims(a), db = this.dims(b), e = this.elStyle(p.id);
      const s1 = shapeEdge(da.shape, a.x, a.y, b.x, b.y, da.rx, da.ry), s2 = shapeEdge(db.shape, b.x, b.y, a.x, a.y, db.rx + 2, db.ry + 2);
      const isSel = sel && sel.type === 'path' && sel.id === p.id;
      const col = isSel ? 'var(--accent)' : (e.color || g.pathColor), w = (e.width || g.pathW) * (isSel ? 1.5 : 1);
      body += `<g class="path${isSel ? ' sel' : ''}" data-pid="${p.id}"><line class="hit" x1="${s1[0]}" y1="${s1[1]}" x2="${s2[0]}" y2="${s2[1]}"/><line class="inner" x1="${s1[0]}" y1="${s1[1]}" x2="${s2[0]}" y2="${s2[1]}" marker-end="url(#${marker(col)})"${styleAttr({ stroke: col, 'stroke-width': w, 'stroke-dasharray': dash(e.style || g.pathStyle, w) })}/></g>`;
      if (o && o.paths && o.paths[p.from + '>' + p.to] !== undefined) body += label((s1[0] + s2[0]) / 2, (s1[1] + s2[1]) / 2, o.paths[p.from + '>' + p.to]);
    });
    // interactions
    m.interactions.forEach(it => {
      const b = this.byId(it.y); if (!b) return;
      const db = this.dims(b), irx = db.rx * 0.88, iry = db.ry * 0.72;
      if (it.px === undefined) { it.px = b.x - 120; it.py = b.y - 120; }
      const e1 = ellipseEdge(it.px, it.py, b.x, b.y, irx, iry), e2 = shapeEdge(db.shape, b.x, b.y, it.px, it.py, db.rx + 2, db.ry + 2);
      const isSel = sel && sel.type === 'inter' && sel.id === it.id;
      const ist = g.interStroke;
      body += `<line class="modline" x1="${e1[0]}" y1="${e1[1]}" x2="${e2[0]}" y2="${e2[1]}" marker-end="url(#${marker(ist || 'var(--c3)')})"${styleAttr({ stroke: ist })}/>`;
      if (o && o.paths && o.paths[it.id + '>' + it.y] !== undefined) body += label((e1[0] + e2[0]) / 2, (e1[1] + e2[1]) / 2, o.paths[it.id + '>' + it.y]);
      body += `<g class="inter${isSel ? ' sel' : ''}" data-iid="${it.id}"><ellipse cx="${it.px}" cy="${it.py}" rx="${irx}" ry="${iry}"${styleAttr({ fill: g.interFill, stroke: isSel ? '' : ist })}/><text x="${it.px}" y="${it.py + 4}" text-anchor="middle"${styleAttr({ fill: g.lvText, 'font-size': (g.lvFont - 1) + 'px' })}>${esc(fit(it.name, 2 * irx - 8, g.lvFont - 1))}</text><title>${esc(it.name)}</title></g>`;
    });
    // constructs
    m.constructs.forEach(c => {
      const e = this.elStyle(c.id), d = this.dims(c);
      const isSel = sel && sel.type === 'construct' && sel.id === c.id, pend = this.pending === c.id;
      const r2 = g.showR2 && o && o.r2 && o.r2[c.id], font = e.lvFont || g.lvFont, bold = e.lvBold !== undefined ? e.lvBold : g.lvBold;
      const txt = e.lvText || g.lvText;
      body += `<g class="lv${isSel ? ' sel' : ''}${pend ? ' pend' : ''}${c.indicators.length ? '' : ' empty'}" data-id="${c.id}">` +
        shapeSVG(d.shape, c.x, c.y, d.rx, d.ry, styleAttr({ fill: e.lvFill || g.lvFill, stroke: isSel || pend ? '' : (e.lvStroke || g.lvStroke), 'stroke-width': isSel || pend ? '' : g.lvStrokeW }));
      body += `<text class="lvname" x="${c.x}" y="${c.y + (r2 ? -font * 0.15 : font * 0.35)}" text-anchor="middle"${styleAttr({ fill: txt, 'font-size': font + 'px', 'font-weight': bold ? 600 : 400 })}>${esc(fit(c.name, 2 * d.rx - 10, font))}</text>`;
      if (r2) body += `<text class="r2" x="${c.x}" y="${c.y + font * 1.15}" text-anchor="middle"${styleAttr({ fill: txt, 'font-size': (g.labelFont) + 'px' })}>${esc(r2)}</text>`;
      if (c.mode === 'B') body += `<text class="modeb" x="${c.x + d.rx * 0.85}" y="${c.y - d.ry * 0.62}" text-anchor="middle">B</text>`;
      body += `<title>${esc(c.name)}</title></g>`;
    });
    let defs = '<defs>';
    Object.entries(markers).forEach(([col, id]) => { defs += `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" style="fill:${esc(col)}"/></marker>`; });
    defs += '</defs>';
    this.svg.style.fontFamily = FONTS[g.font] || FONTS.system;
    this.svg.innerHTML = defs + `<g transform="translate(${this.view.x},${this.view.y}) scale(${this.view.k})"><rect class="bgcatch" x="-5000" y="-5000" width="10000" height="10000" fill="transparent"/>${body}</g>`;
    if (this.hooks.render) this.hooks.render();
  };

  P.fit = function () {
    const r = this.svg.getBoundingClientRect(); if (!r.width || !this.model.constructs.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const take = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    this.model.constructs.forEach(c => { const d = this.dims(c); take(c.x - d.rx, c.y - d.ry); take(c.x + d.rx, c.y + d.ry); this.indPos(c).forEach(p => { take(p.x - p.w / 2, p.y - p.h / 2); take(p.x + p.w / 2, p.y + p.h / 2); }); });
    this.model.interactions.forEach(i => { take(i.px - 60, i.py - 30); take(i.px + 60, i.py + 30); });
    const pad = 30, k = Math.min(1.4, Math.min((r.width - 2 * pad) / (x1 - x0), (r.height - 2 * pad) / (y1 - y0)));
    this.view = { k, x: (r.width - (x1 - x0) * k) / 2 - x0 * k, y: (r.height - (y1 - y0) * k) / 2 - y0 * k };
    this.render();
  };
  P.zoom = function (f) {
    const r = this.svg.getBoundingClientRect(), cx = r.width / 2, cy = r.height / 2, v = this.view;
    const k = Math.max(0.2, Math.min(3, v.k * f));
    v.x = cx - (cx - v.x) * k / v.k; v.y = cy - (cy - v.y) * k / v.k; v.k = k; this.render();
  };
  P.toModel = function (ev) {
    const r = this.svg.getBoundingClientRect();
    return { x: (ev.clientX - r.left - this.view.x) / this.view.k, y: (ev.clientY - r.top - this.view.y) / this.view.k };
  };
  P.hitConstruct = function (pt) {
    return this.model.constructs.find(c => { const d = this.dims(c); return Math.pow((pt.x - c.x) / (d.rx + 8), 2) + Math.pow((pt.y - c.y) / (d.ry + 8), 2) <= 1; });
  };

  // --------------------------------------------------------------- events
  P._bind = function () {
    const svg = this.svg; let drag = null;
    svg.addEventListener('pointerdown', ev => {
      if (ev.button !== 0) return;
      const pt = this.toModel(ev), g = ev.target.closest('g');
      const lv = g && g.classList.contains('lv') ? g.dataset.id : null;
      const pid = g && g.classList.contains('path') ? g.dataset.pid : null;
      const iid = g && g.classList.contains('inter') ? g.dataset.iid : null;
      const ind = g && g.classList.contains('ind') ? g : null;
      if (this.tool === 'construct' && !lv) { const c = this.addConstruct(pt.x, pt.y); this.setTool('select'); if (this.hooks.created) this.hooks.created(c); return; }
      if (this.tool === 'path') {
        if (!lv) { this.pending = null; this.render(); return; }
        if (!this.pending) { this.pending = lv; this.render(); return; }
        if (this.pending !== lv) { const ok = this.addPath(this.pending, lv); if (!ok && this.hooks.warn) this.hooks.warn('path_exists'); }
        this.pending = null; this.render(); return;
      }
      if (lv) { this.select({ type: 'construct', id: lv }); const c = this.byId(lv); drag = { kind: 'node', c, dx: pt.x - c.x, dy: pt.y - c.y, moved: false }; }
      else if (iid) { this.select({ type: 'inter', id: iid }); const it = this.byId(iid); drag = { kind: 'inter', it, dx: pt.x - it.px, dy: pt.y - it.py, moved: false }; }
      else if (pid) this.select({ type: 'path', id: pid });
      else if (ind) this.select({ type: 'indicator', cid: ind.dataset.cid, name: ind.dataset.name });
      else { this.select(null); drag = { kind: 'pan', sx: ev.clientX, sy: ev.clientY, vx: this.view.x, vy: this.view.y }; }
      if (drag) svg.setPointerCapture(ev.pointerId);
    });
    svg.addEventListener('pointermove', ev => {
      if (!drag) return;
      if (drag.kind === 'pan') { this.view.x = drag.vx + ev.clientX - drag.sx; this.view.y = drag.vy + ev.clientY - drag.sy; this.render(); return; }
      const pt = this.toModel(ev);
      if (!drag.moved) { this.snapshot(); drag.moved = true; }
      if (drag.kind === 'node') { drag.c.x = Math.round(pt.x - drag.dx); drag.c.y = Math.round(pt.y - drag.dy); }
      else { drag.it.px = Math.round(pt.x - drag.dx); drag.it.py = Math.round(pt.y - drag.dy); }
      this.render();
    });
    const end = () => { if (drag && drag.moved && this.hooks.change) this.hooks.change(true); drag = null; };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    svg.addEventListener('dblclick', ev => {
      const g = ev.target.closest('g.lv'); if (g && this.hooks.rename) this.hooks.rename(g.dataset.id);
    });
    svg.addEventListener('wheel', ev => {
      if (!ev.ctrlKey && !ev.metaKey) return; ev.preventDefault();
      this.zoom(ev.deltaY < 0 ? 1.1 : 1 / 1.1);
    }, { passive: false });
    svg.addEventListener('dragover', ev => { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; });
    svg.addEventListener('drop', ev => {
      ev.preventDefault();
      let names; try { names = JSON.parse(ev.dataTransfer.getData('text/plain')); } catch (e) { return; }
      if (!Array.isArray(names) || !names.length) return;
      const pt = this.toModel(ev), c = this.hitConstruct(pt);
      if (c) this.assign(c.id, names);
      else {
        const pre = commonPrefix(names);
        const nc = this.addConstruct(Math.round(pt.x), Math.round(pt.y), pre || null, names.slice());
        if (this.hooks.created) this.hooks.created(nc);
      }
    });
  };
  function commonPrefix(names) {
    let p = names[0] || ''; names.forEach(n => { while (!n.startsWith(p)) p = p.slice(0, -1); });
    p = p.replace(/[\s_\-.0-9]+$/, '');
    return p.length >= 2 ? p.charAt(0).toUpperCase() + p.slice(1) : '';
  }

  Editor.commonPrefix = commonPrefix;
  Editor.STYLE_DEFAULTS = STYLE_DEFAULTS; Editor.PRESETS = PRESETS; Editor.FONTS = FONTS;
  Editor.newId = newId;
  root.YPEditor = Editor;
})(typeof self !== 'undefined' ? self : this);
