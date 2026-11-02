/* YouPls model editor: SVG path-model canvas. */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const RX = 54, RY = 30, IW = 70, IH = 22, GAP = 28, DIST = 112;
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

  // ------------------------------------------------------------- geometry
  function ellipseEdge(cx, cy, tx, ty, rx, ry) {
    const dx = tx - cx, dy = ty - cy; if (!dx && !dy) return [cx, cy];
    const t = 1 / Math.sqrt((dx / rx) * (dx / rx) + (dy / ry) * (dy / ry)); return [cx + dx * t, cy + dy * t];
  }
  function rectEdge(cx, cy, tx, ty, w, h) {
    const dx = tx - cx, dy = ty - cy; if (!dx && !dy) return [cx, cy];
    const t = Math.min(Math.abs((w / 2) / (dx || 1e-9)), Math.abs((h / 2) / (dy || 1e-9))); return [cx + dx * t, cy + dy * t];
  }
  P.indPos = function (c) {
    const k = c.indicators.length, out = [];
    c.indicators.forEach((n, i) => {
      const off = (i - (k - 1) / 2);
      let x = c.x, y = c.y;
      if (c.side === 'left') { x -= DIST + 20; y += off * GAP; }
      else if (c.side === 'right') { x += DIST + 20; y += off * GAP; }
      else if (c.side === 'top') { x += off * (IW + 8); y -= DIST - 6; }
      else { x += off * (IW + 8); y += DIST - 6; }
      out.push({ name: n, x, y });
    });
    return out;
  };

  // --------------------------------------------------------------- render
  P.render = function () {
    const m = this.model, o = this.overlay, sel = this.sel;
    let s = `<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="var(--edge)"/></marker>
      <marker id="ahs" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="var(--accent)"/></marker>
      <marker id="ahm" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="var(--c3)"/></marker></defs>`;
    s += `<g transform="translate(${this.view.x},${this.view.y}) scale(${this.view.k})">`;
    s += `<rect class="bgcatch" x="-5000" y="-5000" width="10000" height="10000" fill="transparent"/>`;
    // outer model
    m.constructs.forEach(c => {
      this.indPos(c).forEach((p, q) => {
        const isSel = sel && sel.type === 'indicator' && sel.cid === c.id && sel.name === p.name;
        const a = ellipseEdge(c.x, c.y, p.x, p.y, RX, RY), b = rectEdge(p.x, p.y, c.x, c.y, IW, IH);
        const [x1, y1, x2, y2] = c.mode === 'B' ? [b[0], b[1], a[0], a[1]] : [a[0], a[1], b[0], b[1]];
        s += `<line class="outer" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#ah)"/>`;
        if (o && o.outer && o.outer[c.id] && o.outer[c.id][q] !== undefined) {
          const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
          s += `<text class="olab" x="${mx}" y="${my - 3}" text-anchor="middle">${esc(o.outer[c.id][q])}</text>`;
        }
        s += `<g class="ind${isSel ? ' sel' : ''}" data-cid="${c.id}" data-name="${esc(p.name)}"><rect x="${p.x - IW / 2}" y="${p.y - IH / 2}" width="${IW}" height="${IH}" rx="3"/><text x="${p.x}" y="${p.y + 4}" text-anchor="middle">${esc(p.name.length > 11 ? p.name.slice(0, 10) + '…' : p.name)}</text><title>${esc(p.name)}</title></g>`;
      });
    });
    // inner paths
    m.paths.forEach(p => {
      const a = this.byId(p.from), b = this.byId(p.to); if (!a || !b) return;
      const s1 = ellipseEdge(a.x, a.y, b.x, b.y, RX, RY), s2 = ellipseEdge(b.x, b.y, a.x, a.y, RX + 2, RY + 2);
      const isSel = sel && sel.type === 'path' && sel.id === p.id;
      s += `<g class="path${isSel ? ' sel' : ''}" data-pid="${p.id}"><line class="hit" x1="${s1[0]}" y1="${s1[1]}" x2="${s2[0]}" y2="${s2[1]}"/><line class="inner" x1="${s1[0]}" y1="${s1[1]}" x2="${s2[0]}" y2="${s2[1]}" marker-end="url(#${isSel ? 'ahs' : 'ah'})"/></g>`;
      if (o && o.paths && o.paths[p.from + '>' + p.to] !== undefined) {
        const mx = (s1[0] + s2[0]) / 2, my = (s1[1] + s2[1]) / 2, txt = o.paths[p.from + '>' + p.to];
        s += `<g class="plab"><rect x="${mx - txt.length * 3.4 - 4}" y="${my - 10}" width="${txt.length * 6.8 + 8}" height="18" rx="4"/><text x="${mx}" y="${my + 3}" text-anchor="middle">${esc(txt)}</text></g>`;
      }
    });
    // interactions
    m.interactions.forEach(it => {
      const b = this.byId(it.y); if (!b) return;
      if (it.px === undefined) { it.px = b.x - 120; it.py = b.y - 120; }
      const e1 = ellipseEdge(it.px, it.py, b.x, b.y, RX - 6, RY - 8), e2 = ellipseEdge(b.x, b.y, it.px, it.py, RX + 2, RY + 2);
      const isSel = sel && sel.type === 'inter' && sel.id === it.id;
      s += `<line class="modline" x1="${e1[0]}" y1="${e1[1]}" x2="${e2[0]}" y2="${e2[1]}" marker-end="url(#ahm)"/>`;
      if (o && o.paths && o.paths[it.id + '>' + it.y] !== undefined) {
        const mx = (e1[0] + e2[0]) / 2, my = (e1[1] + e2[1]) / 2, txt = o.paths[it.id + '>' + it.y];
        s += `<g class="plab"><rect x="${mx - txt.length * 3.4 - 4}" y="${my - 10}" width="${txt.length * 6.8 + 8}" height="18" rx="4"/><text x="${mx}" y="${my + 3}" text-anchor="middle">${esc(txt)}</text></g>`;
      }
      s += `<g class="inter${isSel ? ' sel' : ''}" data-iid="${it.id}"><ellipse cx="${it.px}" cy="${it.py}" rx="${RX - 6}" ry="${RY - 8}"/><text x="${it.px}" y="${it.py + 4}" text-anchor="middle">${esc(it.name.length > 16 ? it.name.slice(0, 15) + '…' : it.name)}</text><title>${esc(it.name)}</title></g>`;
    });
    // constructs
    m.constructs.forEach(c => {
      const isSel = sel && sel.type === 'construct' && sel.id === c.id, pend = this.pending === c.id;
      const r2 = o && o.r2 && o.r2[c.id];
      s += `<g class="lv${isSel ? ' sel' : ''}${pend ? ' pend' : ''}${c.indicators.length ? '' : ' empty'}" data-id="${c.id}"><ellipse cx="${c.x}" cy="${c.y}" rx="${RX}" ry="${RY}"/>`;
      s += `<text class="lvname" x="${c.x}" y="${c.y + (r2 ? -2 : 4)}" text-anchor="middle">${esc(c.name.length > 15 ? c.name.slice(0, 14) + '…' : c.name)}</text>`;
      if (r2) s += `<text class="r2" x="${c.x}" y="${c.y + 14}" text-anchor="middle">${esc(r2)}</text>`;
      if (c.mode === 'B') s += `<text class="modeb" x="${c.x + RX - 6}" y="${c.y - RY + 8}" text-anchor="middle">B</text>`;
      s += `<title>${esc(c.name)}</title></g>`;
    });
    s += '</g>';
    this.svg.innerHTML = s;
    if (this.hooks.render) this.hooks.render();
  };

  P.fit = function () {
    const r = this.svg.getBoundingClientRect(); if (!r.width || !this.model.constructs.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const take = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    this.model.constructs.forEach(c => { take(c.x - RX, c.y - RY); take(c.x + RX, c.y + RY); this.indPos(c).forEach(p => { take(p.x - IW / 2, p.y - IH / 2); take(p.x + IW / 2, p.y + IH / 2); }); });
    this.model.interactions.forEach(i => { take(i.px - RX, i.py - RY); take(i.px + RX, i.py + RY); });
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
    return this.model.constructs.find(c => Math.pow((pt.x - c.x) / (RX + 8), 2) + Math.pow((pt.y - c.y) / (RY + 8), 2) <= 1);
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
  Editor.newId = newId;
  root.YPEditor = Editor;
})(typeof self !== 'undefined' ? self : this);
