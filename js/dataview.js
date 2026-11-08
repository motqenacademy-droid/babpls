/*
 * BabPls data editor (Data tab): a virtualised spreadsheet (Data view), the variable dictionary (Variable view), the
 * descriptive summary, and the Edit / Data / Transform / Export menus. The engine is js/data.js (window.YPData);
 * app.js hands over its toolkit through YPDataView.create(app) and rebuilds the analysis dataset after every change
 * (app.changed). Every edit is a transaction with undo/redo: a shallow snapshot of the variables (columns are replaced,
 * never modified, by structural operations) plus the list of single cells written in place.
 */
(function () {
  'use strict';
  const X = window.YPData;
  const RH = 26, HH = 34, HIST_MAX = 200, HIST_BYTES = 256e6;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  function create(A) {
    const { S, t, esc, toast } = A;
    const st = { tab: 'data', labels: true, sel: null, edit: null, undo: [], redo: [], bytes: 0, colX: [0], el: null, menu: null, find: { at: -1 }, raf: 0 };
    const D = () => S.data;
    const ro = () => !S.data || S.data.readOnly;
    const isStr = v => v.type === 'string';
    const K = () => D().vars.length;
    const vname = j => (D().vars[j] ? D().vars[j].name : '');

    // ------------------------------------------------------------ history (undo / redo)
    function tx(label, fn, o) {
      o = o || {};
      if (ro()) { toast(t('dv_readonly'), 'bad'); return false; }
      const d = D(), before = X.snapshot(d), mb = o.models ? A.modelsJSON() : null, diffs = [];
      const set = (v, r, x) => { const old = v.values[r]; if (old === x || (old !== old && x !== x)) return; diffs.push([v.values, r, old, x]); v.values[r] = x; X.touch(v); };
      let res;
      try { res = fn(d, set); }
      catch (e) { revert(diffs); X.restore(d, before); if (mb) A.setModelsJSON(mb); toast(errText(e), 'bad'); return false; }
      if (res === false) { revert(diffs); X.restore(d, before); if (mb) A.setModelsJSON(mb); return false; }
      const after = X.snapshot(d), ma = mb !== null ? A.modelsJSON() : null;
      const bytes = X.snapshotCost(before, after) + diffs.length * 40;
      st.undo.push({ label, before, after, diffs, mb, ma, bytes }); st.bytes += bytes;
      st.redo = [];
      while (st.undo.length > HIST_MAX || (st.bytes > HIST_BYTES && st.undo.length > 1)) st.bytes -= st.undo.shift().bytes;
      A.changed();
      return res === undefined ? true : res;
    }
    function revert(diffs) { for (let i = diffs.length - 1; i >= 0; i--) { const [a, r, old] = diffs[i]; a[r] = old; } }
    function undo() {
      if (ro() || !st.undo.length) return;
      const e = st.undo.pop(); st.bytes -= e.bytes; revert(e.diffs); X.restore(D(), e.before); if (e.mb) A.setModelsJSON(e.mb);
      st.redo.push(e); clampSel(); A.changed(); announce(t('dv_undone', { a: e.label }));
    }
    function redo() {
      if (ro() || !st.redo.length) return;
      const e = st.redo.pop(); X.restore(D(), e.after); e.diffs.forEach(([a, r, , x]) => { a[r] = x; }); if (e.ma) A.setModelsJSON(e.ma);
      st.undo.push(e); st.bytes += e.bytes; clampSel(); A.changed(); announce(t('dv_redone', { a: e.label }));
    }
    // undo / redo are announced in the status bar (read by screen readers), not as toasts
    function announce(msg) {
      const el = st.el && $('#dvstatus', st.el); if (!el) return;
      setTimeout(() => { const s = document.createElement('span'); s.className = 'dvnote'; s.textContent = msg; el.prepend(s); }, 0);
    }
    const errText = e => {
      const k = e && (e.code || e.message); if (!k) return String(e);
      const v = { name: e.arg === undefined ? '' : e.arg, pos: e.pos === undefined ? '' : e.pos + 1 }, s = t(k, v);
      if (s !== k) return s;
      const s2 = t('err_' + k, v); return s2 !== 'err_' + k ? s2 : e.message || k;
    };

    // ------------------------------------------------------------ selection
    const one = (r, c) => ({ r0: r, c0: c, r1: r, c1: c });
    const norm = g => ({ r0: Math.min(g.r0, g.r1), r1: Math.max(g.r0, g.r1), c0: Math.min(g.c0, g.c1), c1: Math.max(g.c0, g.c1), rows: g.rows, cols: g.cols });
    function resetSel() { st.sel = { r: 0, c: 0, ar: 0, ac: 0, ranges: [one(0, 0)] }; }
    function clampSel() {
      if (!st.sel || !D()) { resetSel(); return; }
      const mr = Math.max(0, D().n - 1), mc = Math.max(0, K() - 1), s = st.sel;
      s.r = Math.min(s.r, mr + (ro() ? 0 : 1)); s.c = Math.min(s.c, mc + (ro() ? 0 : 1)); s.ar = Math.min(s.ar, mr); s.ac = Math.min(s.ac, mc);
      s.ranges = s.ranges.map(g => ({ r0: Math.min(g.r0, mr), r1: Math.min(g.r1, mr), c0: Math.min(g.c0, mc), c1: Math.min(g.c1, mc), rows: g.rows, cols: g.cols }));
    }
    const inSel = (r, c) => st.sel.ranges.some(g => { const q = norm(g); return r >= q.r0 && r <= q.r1 && c >= q.c0 && c <= q.c1; });
    const primary = () => norm(st.sel.ranges[st.sel.ranges.length - 1]);
    // full rows / columns covered by the selection (or the active cell's)
    function selRows() { const out = new Set(); st.sel.ranges.forEach(g => { const q = norm(g); for (let r = q.r0; r <= q.r1 && r < D().n; r++) out.add(r); }); return Array.from(out).sort((a, b) => a - b); }
    function selCols() { const out = new Set(); st.sel.ranges.forEach(g => { const q = norm(g); for (let c = q.c0; c <= q.c1 && c < K(); c++) out.add(c); }); return Array.from(out).sort((a, b) => a - b); }
    function selectCell(r, c, extend, add) {
      const s = st.sel;
      if (extend) { const g = s.ranges[s.ranges.length - 1]; g.r0 = s.ar; g.c0 = s.ac; g.r1 = r; g.c1 = c; g.rows = g.cols = false; }
      else if (add) { s.ranges.push(one(r, c)); s.ar = r; s.ac = c; }
      else { s.ranges = [one(r, c)]; s.ar = r; s.ac = c; }
      s.r = r; s.c = c;
    }

    // ------------------------------------------------------------ rendering
    const pill = (txt, cls, extra) => `<span class="pill${cls ? ' ' + cls : ''}">${txt}${extra || ''}</span>`;
    function render(el) {
      st.el = el; el.classList.add('dvmode');
      if (!st.sel) resetSel(); clampSel();
      const d = D(), f = d.filter;
      const nSel = f ? f.mask.reduce((a, b) => a + b, 0) : d.n;
      const tabs = ['data', 'vars', 'summary'].map(k => `<button role="tab" aria-selected="${st.tab === k}" data-dvtab="${k}" class="${st.tab === k ? 'on' : ''}">${esc(t('dv_tab_' + k))}</button>`).join('');
      el.innerHTML = `<div class="dv">
        <div class="dvbar"><h2 title="${esc(S.dataName)}">${esc(S.dataName)}</h2>${S.fromMatrix ? pill(esc(t('from_matrix', { n: S.fromMatrix.n })), 'warn') : ''}${d.readOnly ? pill(esc(t('dv_readonly_pill')), 'warn') : ''}
          ${pill(esc(t('dv_cases', { n: d.n })))}${pill(esc(t('dv_nvars', { k: d.vars.length })))}${f ? pill(esc(t('dv_filter_on', { n: nSel, all: d.n })), 'filt', `<button class="x" data-dvact="unfilter" title="${esc(t('dv_unfilter'))}" aria-label="${esc(t('dv_unfilter'))}">×</button>`) : ''}
          <span class="grow"></span><div class="dvtabs" role="tablist">${tabs}</div></div>
        <div class="dvtools">${menus()}<span class="sep"></span>
          <button class="icon" data-dvact="undo" title="${esc(t('dv_a_undo'))} (Ctrl+Z)" aria-label="${esc(t('dv_a_undo'))}"${st.undo.length && !d.readOnly ? '' : ' disabled'}>↶</button><button class="icon" data-dvact="redo" title="${esc(t('dv_a_redo'))} (Ctrl+Y)" aria-label="${esc(t('dv_a_redo'))}"${st.redo.length && !d.readOnly ? '' : ' disabled'}>↷</button>
          <span class="sep"></span><label class="check dvlab"><input type="checkbox" data-dvlabels${st.labels ? ' checked' : ''}> ${esc(t('dv_show_labels'))}</label>
          <span class="grow"></span><button data-act="groups"${d.readOnly ? ' disabled' : ''}>${esc(t('define_groups'))}</button><button data-act="covimport">${esc(t('import_cov'))}</button></div>
        <div class="dvmain${st.tab !== 'data' ? ' scroll' : ''}" id="dvmain"></div>
        <div class="dvstatus" id="dvstatus" aria-live="polite"></div></div>`;
      const main = $('#dvmain', el);
      if (st.tab === 'data') { main.innerHTML = gridHTML(); bindGrid(main); paint(); status(); }
      else if (st.tab === 'vars') { main.innerHTML = varViewHTML(); bindVarView(main); $('#dvstatus', el).textContent = t('dv_vars_hint'); }
      else { main.innerHTML = A.summaryHTML(); $('#dvstatus', el).textContent = ''; }
    }
    function refresh() {
      if (!st.el || !st.el.isConnected || S.view !== 'data' || !S.data) return;
      if (st.tab === 'data' && $('.dg', st.el)) { clampSel(); updateBar(); layout(); paint(); status(); }
      else render(st.el);
    }
    function updateBar() { // re-render only the header bar and tools (keeps the grid and its scroll position)
      const tmp = document.createElement('div'); const keep = st.tab; const el = st.el;
      const d = D(), f = d.filter, nSel = f ? f.mask.reduce((a, b) => a + b, 0) : d.n;
      const bar = $('.dvbar', el); if (!bar) return;
      tmp.innerHTML = `${pill(esc(t('dv_cases', { n: d.n })))}${pill(esc(t('dv_nvars', { k: d.vars.length })))}${f ? pill(esc(t('dv_filter_on', { n: nSel, all: d.n })), 'filt', `<button class="x" data-dvact="unfilter" title="${esc(t('dv_unfilter'))}" aria-label="${esc(t('dv_unfilter'))}">×</button>`) : ''}`;
      $$('.pill:not(.warn)', bar).forEach(p => p.remove());
      const tabs = $('.grow', bar); Array.from(tmp.children).forEach(c => bar.insertBefore(c, tabs));
      const u = $('.dvtools > [data-dvact=undo]', el), r = $('.dvtools > [data-dvact=redo]', el);
      if (u) { u.disabled = !st.undo.length || d.readOnly; u.title = t('dv_a_undo') + (st.undo.length ? ': ' + st.undo[st.undo.length - 1].label : '') + ' (Ctrl+Z)'; }
      if (r) { r.disabled = !st.redo.length || d.readOnly; r.title = t('dv_a_redo') + (st.redo.length ? ': ' + st.redo[st.redo.length - 1].label : '') + ' (Ctrl+Y)'; }
      st.tab = keep;
    }
    const MENUS = {
      edit: ['undo', 'redo', '-', 'cut', 'copy', 'paste', 'filldown', 'clear', '-', 'inscase', 'insvar', 'delcases', 'delvars', 'dupvar', '-', 'find', 'goto'],
      data: ['sort', 'filter', 'unfilter', '-', 'varprops', 'labels', '-', 'listwise', 'duplicates', 'aggregate', '-', 'mergecases', 'mergevars', 'transpose'],
      transform: ['compute', 'recode', 'recodeinto', 'reverse', 'standardize', 'rank', 'bin', 'dummies', 'count', 'missing', 'math', 'shift', 'outliers'],
      export: ['exp_csv', 'exp_csvcodes', 'exp_xlsx', 'exp_sav']
    };
    const KEYS = { undo: 'Ctrl+Z', redo: 'Ctrl+Y', cut: 'Ctrl+X', copy: 'Ctrl+C', paste: 'Ctrl+V', filldown: 'Ctrl+D', clear: 'Del', find: 'Ctrl+F', goto: 'Ctrl+G' };
    function menus() {
      return Object.keys(MENUS).map(m => `<div class="dvmenu"><button data-dvmenu="${m}" aria-haspopup="true" aria-expanded="false">${esc(t('dv_menu_' + m))} ▾</button><div class="menu" role="menu" hidden>${MENUS[m].map(a => a === '-' ? '<hr>' : `<button role="menuitem" data-dvact="${a}">${esc(t('dv_a_' + a))}${KEYS[a] ? `<kbd>${KEYS[a]}</kbd>` : ''}</button>`).join('')}</div></div>`).join('');
    }
    function status() {
      const el = $('#dvstatus', st.el); if (!el || !D()) return;
      const s = st.sel, d = D(), v = d.vars[s.c];
      let h = '';
      if (v && s.r < d.n) {
        const x = v.values[s.r], shown = X.format(v, x, st.labels), code = X.format(v, x, false);
        h = `<b>${esc(t('dv_case'))} ${s.r + 1}</b> · <b>${esc(v.name)}</b>${v.label ? ' (' + esc(v.label) + ')' : ''} = <span dir="auto">${X.isMissing(v, x) ? `<i>${esc(t('missing'))}</i>${code !== '' ? ' [' + esc(code) + ']' : ''}` : esc(shown) + (shown !== code ? ' [' + esc(code) + ']' : '')}</span>`;
      }
      // statistics of the selected numeric cells
      let n = 0, sum = 0, cells = 0;
      st.sel.ranges.forEach(g => { const q = norm(g); for (let c = q.c0; c <= Math.min(q.c1, K() - 1); c++) { const w = d.vars[c]; if (isStr(w)) continue; for (let r = q.r0; r <= Math.min(q.r1, d.n - 1) && cells < 2e6; r++) { cells++; const x = w.values[r]; if (x === x && !X.userMissing(w, x)) { n++; sum += x; } } } });
      if (cells > 1 && n) h += ` <span class="grow"></span><span>N = ${n}</span><span>${esc(t('mean'))} = ${X.fmtNum(sum / n, 4)}</span><span>${esc(t('dv_sum'))} = ${X.fmtNum(sum, null)}</span>`;
      el.innerHTML = h;
    }

    // ------------------------------------------------------------ the grid
    const colW = v => Math.max(48, Math.min(480, Math.round((v.width || 10) * 8.2 + 18)));
    function layout() {
      const d = D(); st.colX = [0]; d.vars.forEach(v => st.colX.push(st.colX[st.colX.length - 1] + colW(v)));
      if (!d.readOnly) st.colX.push(st.colX[st.colX.length - 1] + 90); // empty column: typing there adds a variable
      const g = $('.dg', st.el); if (!g) return;
      const rnw = Math.max(52, String(d.n + 1).length * 8 + 26);
      g.style.setProperty('--rnw', rnw + 'px');
      const rows = d.n + (d.readOnly ? 0 : 1);
      $('.dg-sizer', g).style.width = st.colX[st.colX.length - 1] + 'px';
      $('.dg-sizer', g).style.height = rows * RH + 'px';
      g.setAttribute('aria-rowcount', rows); g.setAttribute('aria-colcount', st.colX.length - 1);
    }
    function gridHTML() {
      return `<div class="dg" tabindex="0" dir="ltr" role="grid" aria-label="${esc(t('dv_tab_data'))}" aria-multiselectable="true">
        <div class="dg-corner" title="${esc(t('dv_select_all'))}"></div>
        <div class="dg-head"><div class="dg-hin"></div></div>
        <div class="dg-rn"><div class="dg-rin"></div></div>
        <div class="dg-body"><div class="dg-sizer"><div class="dg-cells"></div><div class="dg-act"></div></div></div>
        ${D().readOnly ? `<div class="dg-ro">${esc(t('dv_matrix_ro'))}</div>` : ''}</div>`;
    }
    const colAt = x => { const c = st.colX; let lo = 0, hi = c.length - 2; if (x < 0) return 0; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c[m] <= x) lo = m; else hi = m - 1; } return lo; };
    function paint() {
      cancelAnimationFrame(st.raf); st.raf = 0;
      const g = st.el && $('.dg', st.el); if (!g) return;
      const body = $('.dg-body', g), d = D(), top = body.scrollTop, left = body.scrollLeft, h = body.clientHeight || 400, w = body.clientWidth || 800;
      const rows = d.n + (d.readOnly ? 0 : 1), cols = st.colX.length - 1;
      const r0 = Math.max(0, Math.floor(top / RH)), r1 = Math.min(rows - 1, Math.floor((top + h) / RH));
      const c0 = colAt(left), c1 = Math.min(cols - 1, colAt(left + w));
      const mask = d.filter ? d.filter.mask : null, s = st.sel;
      let cells = '', head = '', rn = '';
      for (let c = c0; c <= c1; c++) {
        const v = d.vars[c], x0 = st.colX[c], cw = st.colX[c + 1] - x0, colSel = s.ranges.some(q => { q = norm(q); return q.r0 === 0 && q.r1 >= d.n - 1 && c >= q.c0 && c <= q.c1; });
        if (v) {
          const m = X.effMeasure(v);
          head += `<div class="dh${colSel ? ' sel' : ''}${c === s.c ? ' cur' : ''}" style="left:${x0}px;width:${cw}px" data-c="${c}" title="${esc(v.name + (v.label ? ' – ' + v.label : '') + ' · ' + t('dv_type_' + v.type) + ' · ' + t('dv_m_' + m))}"><i class="mi m-${m}" aria-hidden="true"></i><span>${esc(v.name)}</span><b class="rz" data-rz="${c}"></b></div>`;
        } else head += `<div class="dh ghost" style="left:${x0}px;width:${cw}px" data-c="${c}">${esc(t('dv_newvar_col'))}</div>`;
      }
      for (let r = r0; r <= r1; r++) {
        const off = mask && r < d.n && !mask[r], rowSel = s.ranges.some(q => { q = norm(q); return q.c0 === 0 && q.c1 >= K() - 1 && r >= q.r0 && r <= q.r1; });
        rn += `<div class="dr${off ? ' off' : ''}${rowSel ? ' sel' : ''}${r === s.r ? ' cur' : ''}${r >= d.n ? ' ghost' : ''}" style="top:${r * RH}px" data-r="${r}">${r < d.n ? r + 1 : '＋'}</div>`;
        for (let c = c0; c <= c1; c++) {
          const v = d.vars[c], x0 = st.colX[c], cw = st.colX[c + 1] - x0;
          let cls = 'dc', txt = '';
          if (!v || r >= d.n) cls += ' ghost';
          else {
            const x = v.values[r];
            txt = X.format(v, x, st.labels);
            const str = isStr(v), al = v.align !== 'auto' ? v.align : str || (v.type === 'categorical' && st.labels && X.labelOf(v, x) !== undefined) ? 'left' : 'right';
            cls += ' a-' + al;
            if (str ? x === '' : x !== x) cls += ' miss';
            else if (X.userMissing(v, x)) cls += ' umiss';
            if (off) cls += ' off';
          }
          if (inSel(r, c)) cls += ' sel';
          cells += `<div class="${cls}"${cls.includes('a-left') ? ' dir="auto"' : ''} style="top:${r * RH}px;left:${x0}px;width:${cw}px">${esc(txt)}</div>`;
        }
      }
      $('.dg-cells', g).innerHTML = cells;
      const hin = $('.dg-hin', g); hin.innerHTML = head; hin.style.transform = `translateX(${-left}px)`; hin.style.width = st.colX[st.colX.length - 1] + 'px';
      const rin = $('.dg-rin', g); rin.innerHTML = rn; rin.style.transform = `translateY(${-top}px)`;
      const act = $('.dg-act', g);
      if (s.c < cols && s.r < rows) { act.hidden = false; act.style.cssText = `top:${s.r * RH}px;left:${st.colX[s.c]}px;width:${st.colX[s.c + 1] - st.colX[s.c]}px;height:${RH}px`; } else act.hidden = true;
      g.setAttribute('aria-activedescendant', '');
    }
    const schedule = () => { if (!st.raf) st.raf = requestAnimationFrame(paint); };
    function ensureVisible(r, c) {
      const body = st.el && $('.dg-body', st.el); if (!body) return;
      const y = r * RH; if (y < body.scrollTop) body.scrollTop = y; else if (y + RH > body.scrollTop + body.clientHeight) body.scrollTop = y + RH - body.clientHeight;
      const x0 = st.colX[c] || 0, x1 = st.colX[c + 1] || x0; if (x0 < body.scrollLeft) body.scrollLeft = x0; else if (x1 > body.scrollLeft + body.clientWidth) body.scrollLeft = x1 - body.clientWidth;
    }
    function moveTo(r, c, extend) {
      const d = D(), rows = d.n + (d.readOnly ? 0 : 1), cols = st.colX.length - 1;
      r = Math.max(0, Math.min(rows - 1, r)); c = Math.max(0, Math.min(cols - 1, c));
      selectCell(r, c, extend); ensureVisible(r, c); paint(); status();
    }
    function cellFromEvent(e, g) {
      const sz = $('.dg-sizer', g).getBoundingClientRect(), d = D();
      const r = Math.max(0, Math.min(d.n - (d.readOnly ? 1 : 0), Math.floor((e.clientY - sz.top) / RH))), c = Math.min(st.colX.length - 2, colAt(e.clientX - sz.left));
      return { r, c };
    }
    function bindGrid(main) {
      const g = $('.dg', main), body = $('.dg-body', g);
      layout();
      body.addEventListener('scroll', schedule, { passive: true });
      if (window.ResizeObserver) { const ro_ = new ResizeObserver(schedule); ro_.observe(body); }
      let drag = null;
      const up = () => { drag = null; document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); status(); };
      const mv = e => {
        if (!drag) return;
        if (drag.rz !== undefined) { const v = D().vars[drag.rz]; const w = Math.max(48, drag.w0 + (e.clientX - drag.x0)); v.width = Math.round((w - 18) / 8.2 * 10) / 10; layout(); paint(); return; }
        const sz = $('.dg-sizer', g).getBoundingClientRect(), br = body.getBoundingClientRect();
        if (e.clientY > br.bottom - 8) body.scrollTop += RH; else if (e.clientY < br.top + 8) body.scrollTop -= RH;
        if (e.clientX > br.right - 8) body.scrollLeft += 40; else if (e.clientX < br.left + 8) body.scrollLeft -= 40;
        const d = D();
        if (drag.kind === 'cell') { const p = cellFromEvent(e, g); const q = st.sel.ranges[st.sel.ranges.length - 1]; q.r1 = Math.min(p.r, Math.max(0, d.n - 1)); q.c1 = Math.min(p.c, Math.max(0, K() - 1)); st.sel.r = p.r; st.sel.c = p.c; }
        else if (drag.kind === 'col') { const c = Math.min(K() - 1, colAt(e.clientX - sz.left)); const q = st.sel.ranges[st.sel.ranges.length - 1]; q.c1 = c; st.sel.c = c; }
        else if (drag.kind === 'row') { const r = Math.max(0, Math.min(d.n - 1, Math.floor((e.clientY - sz.top) / RH))); const q = st.sel.ranges[st.sel.ranges.length - 1]; q.r1 = r; st.sel.r = r; }
        paint();
      };
      const startDrag = (kind, e) => { drag = { kind }; document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up); e.preventDefault(); };
      body.addEventListener('mousedown', e => {
        if (e.target.closest('.dg-ed')) return;
        if (e.button === 2 && inSel(...Object.values(cellFromEvent(e, g)))) { g.focus(); return; }
        commitEdit(); const { r, c } = cellFromEvent(e, g);
        selectCell(r, c, e.shiftKey, e.ctrlKey || e.metaKey); paint(); g.focus({ preventScroll: true });
        if (e.button === 0) startDrag('cell', e);
      });
      body.addEventListener('dblclick', e => { if (e.target.closest('.dg-ed')) return; const { r, c } = cellFromEvent(e, g); selectCell(r, c); startEdit(null, true); });
      $('.dg-head', g).addEventListener('mousedown', e => {
        const rz = e.target.closest('[data-rz]'); commitEdit();
        if (rz) { const c = +rz.dataset.rz; drag = { rz: c, x0: e.clientX, w0: st.colX[c + 1] - st.colX[c] }; document.addEventListener('mousemove', mv); document.addEventListener('mouseup', () => { if (drag && drag.rz !== undefined) { A.autosave(); } up(); }, { once: true }); e.preventDefault(); return; }
        const h = e.target.closest('[data-c]'); if (!h) return; const c = +h.dataset.c; if (c >= K()) { selectCell(0, c); paint(); return; }
        const full = { r0: 0, r1: Math.max(0, D().n - 1), c0: c, c1: c, cols: true };
        if (e.shiftKey) { const q = st.sel.ranges[st.sel.ranges.length - 1]; Object.assign(q, { r0: 0, r1: full.r1, c0: st.sel.ac, c1: c, cols: true }); }
        else if (e.ctrlKey || e.metaKey) { st.sel.ranges.push(full); st.sel.ac = c; }
        else { st.sel.ranges = [full]; st.sel.ac = c; st.sel.ar = 0; }
        st.sel.c = c; st.sel.r = Math.min(st.sel.r, Math.max(0, D().n - 1)); paint(); status(); g.focus({ preventScroll: true });
        if (e.button === 0) startDrag('col', e);
      });
      $('.dg-head', g).addEventListener('dblclick', e => { const h = e.target.closest('[data-c]'); if (!h || e.target.closest('[data-rz]')) return; const c = +h.dataset.c; if (c < K()) { st.tab = 'vars'; st.focusVar = c; render(st.el); } });
      $('.dg-rn', g).addEventListener('mousedown', e => {
        const h = e.target.closest('[data-r]'); if (!h) return; commitEdit(); const r = Math.min(+h.dataset.r, Math.max(0, D().n - 1));
        const full = { r0: r, r1: r, c0: 0, c1: Math.max(0, K() - 1), rows: true };
        if (e.shiftKey) { const q = st.sel.ranges[st.sel.ranges.length - 1]; Object.assign(q, { r0: st.sel.ar, r1: r, c0: 0, c1: full.c1, rows: true }); }
        else if (e.ctrlKey || e.metaKey) { st.sel.ranges.push(full); st.sel.ar = r; }
        else { st.sel.ranges = [full]; st.sel.ar = r; st.sel.ac = 0; }
        st.sel.r = r; paint(); status(); g.focus({ preventScroll: true });
        if (e.button === 0) startDrag('row', e);
      });
      $('.dg-corner', g).addEventListener('mousedown', e => { e.preventDefault(); selectAll(); g.focus(); });
      g.addEventListener('keydown', gridKey);
      g.addEventListener('contextmenu', e => { e.preventDefault(); contextMenu(e); });
      g.focus({ preventScroll: true });
    }
    function selectAll() { st.sel.ranges = [{ r0: 0, r1: Math.max(0, D().n - 1), c0: 0, c1: Math.max(0, K() - 1), rows: true, cols: true }]; paint(); status(); }

    // ------------------------------------------------------------ keyboard
    function gridKey(e) {
      if (st.edit) return;
      const s = st.sel, d = D(), ctrl = e.ctrlKey || e.metaKey, k = e.key;
      const rows = d.n + (d.readOnly ? 0 : 1), page = Math.max(1, Math.floor(($('.dg-body', st.el).clientHeight || 400) / RH) - 1);
      const lastRow = Math.max(0, d.n - 1), lastCol = Math.max(0, K() - 1);
      if (ctrl && !e.altKey) {
        const q = k.toLowerCase();
        if (q === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
        if (q === 'y') { e.preventDefault(); redo(); return; }
        if (q === 'a') { e.preventDefault(); selectAll(); return; }
        if (q === 'd') { e.preventDefault(); fillDown(); return; }
        if (q === 'f' || q === 'h') { e.preventDefault(); open('find'); return; }
        if (q === 'g') { e.preventDefault(); open('goto'); return; }
        if (k === 'Home') { e.preventDefault(); moveTo(0, 0, e.shiftKey); return; }
        if (k === 'End') { e.preventDefault(); moveTo(lastRow, lastCol, e.shiftKey); return; }
        if (k === 'ArrowDown') { e.preventDefault(); moveTo(lastRow, s.c, e.shiftKey); return; }
        if (k === 'ArrowUp') { e.preventDefault(); moveTo(0, s.c, e.shiftKey); return; }
        if (k === 'ArrowRight') { e.preventDefault(); moveTo(s.r, lastCol, e.shiftKey); return; }
        if (k === 'ArrowLeft') { e.preventDefault(); moveTo(s.r, 0, e.shiftKey); return; }
        return;
      }
      switch (k) {
        case 'ArrowDown': e.preventDefault(); moveTo(s.r + 1, s.c, e.shiftKey); return;
        case 'ArrowUp': e.preventDefault(); moveTo(s.r - 1, s.c, e.shiftKey); return;
        case 'ArrowRight': e.preventDefault(); moveTo(s.r, s.c + 1, e.shiftKey); return;
        case 'ArrowLeft': e.preventDefault(); moveTo(s.r, s.c - 1, e.shiftKey); return;
        case 'PageDown': e.preventDefault(); moveTo(Math.min(rows - 1, s.r + page), s.c, e.shiftKey); return;
        case 'PageUp': e.preventDefault(); moveTo(s.r - page, s.c, e.shiftKey); return;
        case 'Home': e.preventDefault(); moveTo(s.r, 0, e.shiftKey); return;
        case 'End': e.preventDefault(); moveTo(s.r, lastCol, e.shiftKey); return;
        case 'Tab': e.preventDefault(); moveTo(s.r, s.c + (e.shiftKey ? -1 : 1)); return;
        case 'Enter': e.preventDefault(); if (e.altKey) startEdit(null, true); else moveTo(s.r + (e.shiftKey ? -1 : 1), s.c); return;
        case 'F2': e.preventDefault(); startEdit(null, true); return;
        case 'Delete': case 'Backspace': e.preventDefault(); clearSel(); return;
        case 'Escape': return;
      }
      if (e.altKey && k === 'ArrowDown') { e.preventDefault(); startEdit(null, true); return; }
      if (k.length === 1 && !e.altKey) { e.preventDefault(); startEdit(k, false); }
    }

    // ------------------------------------------------------------ in-place editing
    function startEdit(initial, editMode) {
      if (ro()) { toast(t('dv_readonly'), 'bad'); return; }
      const g = st.el && $('.dg', st.el); if (!g) return;
      const d = D(), s = st.sel, v = d.vars[s.c];
      ensureVisible(s.r, s.c);
      const sz = $('.dg-sizer', g);
      let inp = $('.dg-ed', sz);
      if (!inp) { inp = document.createElement('input'); inp.className = 'dg-ed'; inp.setAttribute('dir', 'auto'); sz.appendChild(inp); }
      const list = v && v.labels.length ? 'dg-list' : '';
      let dl = $('#dg-list'); if (!dl) { dl = document.createElement('datalist'); dl.id = 'dg-list'; document.body.appendChild(dl); }
      dl.innerHTML = list ? v.labels.map(p => `<option value="${esc(p[1])}">${esc(X.format(v, p[0], false))}</option>`).join('') : '';
      if (list) inp.setAttribute('list', 'dg-list'); else inp.removeAttribute('list');
      inp.style.cssText = `top:${s.r * RH}px;left:${st.colX[s.c]}px;width:${Math.max(120, st.colX[s.c + 1] - st.colX[s.c])}px;height:${RH}px`;
      const cur = v && s.r < d.n ? X.format(v, v.values[s.r], st.labels) : '';
      inp.value = initial !== null && initial !== undefined ? initial : cur;
      inp.setAttribute('aria-label', (v ? v.name : t('dv_newvar_col')) + ' ' + t('dv_case') + ' ' + (s.r + 1));
      st.edit = { r: s.r, c: s.c, inp, mode: editMode };
      inp.hidden = false; inp.focus();
      if (editMode) inp.select(); else { const L = inp.value.length; inp.setSelectionRange(L, L); }
      inp.onkeydown = ev => {
        const k = ev.key; ev.stopPropagation();
        if (k === 'Escape') { ev.preventDefault(); cancelEdit(); return; }
        if (k === 'Enter') { ev.preventDefault(); const r = st.edit.r, c = st.edit.c; commitEdit(); moveTo(r + (ev.shiftKey ? -1 : 1), c); return; }
        if (k === 'Tab') { ev.preventDefault(); const r = st.edit.r, c = st.edit.c; commitEdit(); moveTo(r, c + (ev.shiftKey ? -1 : 1)); return; }
        if (!st.edit.mode && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(k) && !(list && ev.altKey)) {
          ev.preventDefault(); const r = st.edit.r, c = st.edit.c; commitEdit();
          moveTo(r + (k === 'ArrowDown') - (k === 'ArrowUp'), c + (k === 'ArrowRight') - (k === 'ArrowLeft'));
        }
      };
      inp.onblur = () => { if (st.edit && st.edit.inp === inp) commitEdit(); };
    }
    function cancelEdit() { if (!st.edit) return; const inp = st.edit.inp; st.edit = null; inp.hidden = true; inp.onblur = null; const g = $('.dg', st.el); if (g) g.focus({ preventScroll: true }); }
    function commitEdit() {
      if (!st.edit) return;
      const { r, c, inp } = st.edit, text = inp.value; st.edit = null; inp.hidden = true; inp.onblur = null;
      const g = st.el && $('.dg', st.el); if (g) g.focus({ preventScroll: true });
      const d = D(), v = d.vars[c];
      if (v && r < d.n && text === X.format(v, v.values[r], st.labels)) return;
      if (!v && text === '') return;
      writeBlock(r, c, [[text]], t('dv_h_edit'));
    }
    // write rows of text starting at (r, c): new cases / variables are added as needed (types guessed from the text)
    function writeBlock(r, c, block, label) {
      let bad = 0, firstErr = '';
      const touched = new Set();
      const ok = tx(label, (d, set) => {
        const h = block.length, w = Math.max(...block.map(x => x.length));
        if (r + h > d.n) X.insertRows(d, d.n, r + h - d.n);
        for (let j = d.vars.length; j < c + w; j++) {
          const colText = block.map(row => row[j - c]).filter(x => x !== undefined && String(x).trim() !== '');
          const num = colText.every(x => X.parseNumber(x) !== undefined), date = !num && colText.length && colText.every(x => X.parseDate(x) === X.parseDate(x));
          X.insertVar(d, d.vars.length, X.newVar(X.uniqueName(d, 'var' + String(d.vars.length + 1).padStart(3, '0')), num ? 'numeric' : date ? 'date' : 'categorical', d.n, { decimals: 0 }));
        }
        block.forEach((row, i) => row.forEach((text, j) => {
          const v = d.vars[c + j]; const p = X.parseCell(v, text);
          if (p.error) { bad++; firstErr = firstErr || t(p.error, { name: v.name }); return; }
          if (p.label) v.labels.push(p.label);
          set(v, r + i, p.value); touched.add(v);
        }));
        // a typed value with more decimals than the variable shows widens its format (up to 4)
        touched.forEach(v => { if (v.type === 'numeric' && v.decimals < 4) { const dd = X.inferDecimals(v.values); if (dd > v.decimals) v.decimals = Math.min(4, dd); } });
      });
      if (bad) toast(t('dv_bad_cells', { n: bad }) + (firstErr ? ' ' + firstErr : ''), 'bad');
      return ok;
    }
    function clearSel() {
      if (ro()) { toast(t('dv_readonly'), 'bad'); return; }
      tx(t('dv_a_clear'), (d, set) => { st.sel.ranges.forEach(g => { const q = norm(g); for (let c = q.c0; c <= Math.min(q.c1, d.vars.length - 1); c++) { const v = d.vars[c]; for (let r = q.r0; r <= Math.min(q.r1, d.n - 1); r++) set(v, r, isStr(v) ? '' : NaN); } }); });
    }
    function fillDown() {
      tx(t('dv_a_filldown'), (d, set) => { st.sel.ranges.forEach(g => { const q = norm(g); for (let c = q.c0; c <= Math.min(q.c1, d.vars.length - 1); c++) { const v = d.vars[c], x = v.values[q.r0]; for (let r = q.r0 + 1; r <= Math.min(q.r1, d.n - 1); r++) set(v, r, x); } }); });
    }

    // ------------------------------------------------------------ clipboard (TSV, compatible with Excel and Sheets)
    const tsvCell = s => (/[\t\n\r"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
    function selectionTSV() {
      if (st.sel.ranges.length > 1) { toast(t('dv_one_range'), 'bad'); return null; }
      const q = primary(), d = D(), lines = [];
      if ((q.r1 - q.r0 + 1) * (q.c1 - q.c0 + 1) > 5e6) { toast(t('dv_too_big'), 'bad'); return null; }
      if (q.r0 === 0 && q.r1 >= d.n - 1 && d.n > 1) lines.push(Array.from({ length: Math.min(q.c1, K() - 1) - q.c0 + 1 }, (_, j) => tsvCell(d.vars[q.c0 + j].name)).join('\t')); // whole columns: with their names
      for (let r = q.r0; r <= Math.min(q.r1, d.n - 1); r++) { const row = []; for (let c = q.c0; c <= Math.min(q.c1, K() - 1); c++) { const v = d.vars[c]; row.push(tsvCell(X.format(v, v.values[r], st.labels))); } lines.push(row.join('\t')); }
      return lines.join('\r\n');
    }
    const gridFocused = () => S.view === 'data' && st.tab === 'data' && !st.edit && document.activeElement && document.activeElement.closest && document.activeElement.closest('.dg');
    document.addEventListener('copy', e => { if (!gridFocused()) return; const s = selectionTSV(); if (s === null) return; e.clipboardData.setData('text/plain', s); e.preventDefault(); toast(t('copied'), 'good'); });
    document.addEventListener('cut', e => { if (!gridFocused()) return; if (ro()) { toast(t('dv_readonly'), 'bad'); return; } const s = selectionTSV(); if (s === null) return; e.clipboardData.setData('text/plain', s); e.preventDefault(); clearSel(); });
    document.addEventListener('paste', e => { if (!gridFocused()) return; e.preventDefault(); pasteText(e.clipboardData.getData('text/plain')); });
    function pasteText(text) {
      if (ro()) { toast(t('dv_readonly'), 'bad'); return; }
      if (!text) return;
      let block = X.parseTSV(text); const q = primary(), d = D();
      // whole columns copied from this editor carry their names: skip the header row when it matches
      if (block.length > 1 && q.r0 === 0 && block[0].every((h, j) => d.vars[q.c0 + j] && d.vars[q.c0 + j].name === h)) block = block.slice(1);
      // one value into a larger selection fills it
      if (block.length === 1 && block[0].length === 1 && (q.r1 > q.r0 || q.c1 > q.c0)) block = Array.from({ length: Math.min(q.r1, d.n - 1) - q.r0 + 1 }, () => Array(Math.min(q.c1, K() - 1) - q.c0 + 1).fill(block[0][0]));
      if (writeBlock(q.r0, q.c0, block, t('dv_a_paste'))) { st.sel.ranges = [{ r0: q.r0, c0: q.c0, r1: q.r0 + block.length - 1, c1: q.c0 + Math.max(...block.map(x => x.length)) - 1 }]; paint(); status(); toast(t('dv_pasted', { n: block.length * Math.max(...block.map(x => x.length)) }), 'good'); }
    }
    async function clip(kind) {
      const g = $('.dg', st.el); if (g) g.focus();
      if (kind === 'paste') { try { pasteText(await navigator.clipboard.readText()); } catch (e) { toast(t('dv_paste_keys'), 'bad'); } return; }
      const s = selectionTSV(); if (s === null) return;
      try { await navigator.clipboard.writeText(s); toast(t('copied'), 'good'); if (kind === 'cut') clearSel(); } catch (e) { toast(t('copy_failed'), 'bad'); }
    }

    // ------------------------------------------------------------ cases & variables
    function insertCases(below) {
      const rows = selRows(), at = rows.length ? (below ? rows[rows.length - 1] + 1 : rows[0]) : st.sel.r + (below ? 1 : 0), k = primary().rows ? rows.length : 1;
      if (tx(t('dv_a_inscase'), d => { X.insertRows(d, Math.min(at, d.n), k); })) { moveTo(at, st.sel.c); }
    }
    function deleteCases() {
      const rows = selRows(); if (!rows.length) return;
      if (rows.length > 1 && !confirm(t('dv_confirm_delcases', { n: rows.length }))) return;
      if (tx(t('dv_a_delcases'), d => { X.deleteRows(d, rows); })) { st.sel.ranges = [one(Math.min(rows[0], Math.max(0, D().n - 1)), st.sel.c)]; st.sel.r = st.sel.ranges[0].r0; refresh(); }
    }
    function insertVariable(at) {
      at = at === undefined ? Math.min(st.sel.c, K()) : at;
      if (tx(t('dv_a_insvar'), d => { X.insertVar(d, at, X.newVar(X.uniqueName(d, 'var' + String(d.vars.length + 1).padStart(3, '0')), 'numeric', d.n, { decimals: 0 })); })) { layout(); moveTo(st.sel.r, at); }
    }
    function usedInModels(names) { const set = new Set(names), out = new Set(); A.models().forEach(m => (m.model.constructs || []).forEach(c => c.indicators.forEach(x => { if (set.has(x)) out.add(x); }))); return Array.from(out); }
    function deleteVariables(cols) {
      cols = cols || selCols(); if (!cols.length) return;
      const names = cols.map(vname), used = usedInModels(names);
      if (!confirm(t(used.length ? 'dv_confirm_delvars_used' : 'dv_confirm_delvars', { n: cols.length, v: names.slice(0, 6).join(', ') + (names.length > 6 ? '…' : ''), u: used.join(', ') }))) return;
      if (tx(t('dv_a_delvars'), d => { X.deleteVars(d, cols); if (used.length) X.removeFromModels(A.models(), used); }, { models: used.length > 0 })) { st.sel.ranges = [one(st.sel.r, Math.min(cols[0], Math.max(0, K() - 1)))]; st.sel.c = st.sel.ranges[0].c0; layout(); refresh(); }
    }
    function duplicateVariable() { const c = st.sel.c; if (c >= K()) return; if (tx(t('dv_a_dupvar'), d => { X.duplicateVar(d, c); })) { layout(); moveTo(st.sel.r, c + 1); } }
    // add variables built elsewhere (latent variable scores, segments): [{ name, values (per case), labels }]
    function addVariables(list, label) {
      return tx(label || t('dv_h_add'), d => {
        list.forEach(col => {
          const v = X.newVar(X.uniqueName(d, col.name), col.labels ? 'categorical' : 'numeric', d.n, { values: Float64Array.from(col.values) });
          if (col.labels) v.labels = col.labels.map(p => p.slice()); else v.decimals = Math.min(4, X.inferDecimals(v.values));
          X.insertVar(d, d.vars.length, v);
        });
      });
    }

    // ------------------------------------------------------------ context menu
    function contextMenu(e) {
      closeMenus();
      const m = document.createElement('div'); m.className = 'menu dvctx'; m.setAttribute('role', 'menu');
      const items = ['cut', 'copy', 'paste', '-', 'inscase', 'inscasebelow', 'delcases', '-', 'insvar', 'insvarright', 'delvars', 'dupvar', '-', 'sortasc', 'sortdesc', '-', 'clear', 'filldown', '-', 'varprops'];
      m.innerHTML = items.map(a => a === '-' ? '<hr>' : `<button role="menuitem" data-dvact="${a}">${esc(t('dv_a_' + a))}${KEYS[a] ? `<kbd>${KEYS[a]}</kbd>` : ''}</button>`).join('');
      document.body.appendChild(m);
      const w = m.offsetWidth, h = m.offsetHeight;
      m.style.left = Math.min(e.clientX, innerWidth - w - 8) + 'px'; m.style.top = Math.min(e.clientY, innerHeight - h - 8) + 'px';
      st.menu = m; const b = $('button', m); if (b) b.focus();
    }
    function closeMenus() { if (st.menu) { st.menu.remove(); st.menu = null; } if (st.el) $$('.dvmenu .menu', st.el).forEach(x => { x.hidden = true; }); if (st.el) $$('[data-dvmenu]', st.el).forEach(b => b.setAttribute('aria-expanded', 'false')); }

    // ------------------------------------------------------------ actions
    function act(a) {
      closeMenus();
      const needEdit = !['copy', 'find', 'goto', 'exp_csv', 'exp_csvcodes', 'exp_xlsx', 'exp_sav', 'varprops', 'undo', 'redo'].includes(a);
      if (needEdit && ro()) { toast(t('dv_readonly'), 'bad'); return; }
      if (['cut', 'copy', 'paste', 'filldown', 'clear', 'inscase', 'inscasebelow', 'delcases', 'insvar', 'insvarright', 'delvars', 'dupvar', 'sortasc', 'sortdesc'].includes(a) && st.tab !== 'data') { st.tab = 'data'; render(st.el); }
      switch (a) {
        case 'undo': return undo();
        case 'redo': return redo();
        case 'cut': case 'copy': case 'paste': return clip(a);
        case 'filldown': return fillDown();
        case 'clear': return clearSel();
        case 'inscase': return insertCases(false);
        case 'inscasebelow': return insertCases(true);
        case 'delcases': return deleteCases();
        case 'insvar': return insertVariable();
        case 'insvarright': return insertVariable(Math.min(st.sel.c + 1, K()));
        case 'delvars': return deleteVariables();
        case 'dupvar': return duplicateVariable();
        case 'sortasc': case 'sortdesc': { const c = st.sel.c; if (c >= K()) return; tx(t('dv_a_sort'), d => X.sortCases(d, [{ j: c, desc: a === 'sortdesc' }])); return; }
        case 'unfilter': if (D().filter) tx(t('dv_a_unfilter'), d => { d.filter = null; }); return;
        case 'varprops': st.tab = 'vars'; st.focusVar = Math.min(st.sel.c, K() - 1); render(st.el); return;
        case 'exp_csv': return exportData('csv');
        case 'exp_csvcodes': return exportData('csvcodes');
        case 'exp_xlsx': return exportData('xlsx');
        case 'exp_sav': return exportData('sav');
        default: return open(a);
      }
    }
    document.addEventListener('click', e => {
      if (st.menu && !e.target.closest('.dvctx')) closeMenus();
      if (!st.el || !st.el.contains(e.target) && !e.target.closest('.dvctx')) return;
      const mb = e.target.closest('[data-dvmenu]');
      if (mb) { const m = mb.nextElementSibling, was = !m.hidden; closeMenus(); m.hidden = was; mb.setAttribute('aria-expanded', String(!was)); if (!was) { const f = $('button', m); if (f) f.focus(); } return; }
      if (!e.target.closest('.dvmenu')) $$('.dvmenu .menu', st.el).forEach(x => { x.hidden = true; });
      const b = e.target.closest('[data-dvact]'); if (b) { e.preventDefault(); act(b.dataset.dvact); return; }
      const tb = e.target.closest('[data-dvtab]'); if (tb) { commitEdit(); st.tab = tb.dataset.dvtab; render(st.el); return; }
    });
    document.addEventListener('change', e => { if (e.target.matches && e.target.matches('[data-dvlabels]')) { st.labels = e.target.checked; paint(); status(); const g = $('.dg', st.el); if (g) g.focus(); } });
    document.addEventListener('keydown', e => {
      if (st.menu && e.key === 'Escape') { closeMenus(); return; }
      const m = e.target.closest && e.target.closest('.menu'); if (m && (st.menu === m || (st.el && st.el.contains(m)))) {
        const items = $$('button', m), i = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); } else if (e.key === 'Escape') { closeMenus(); const g = $('.dg', st.el); if (g) g.focus(); }
        return;
      }
      // undo / redo in the Variable view and Summary (the grid handles its own keys)
      if (S.view !== 'data' || !S.data || st.tab === 'data' || e.target.closest('input,select,textarea,dialog')) return;
      const ctrl = e.ctrlKey || e.metaKey, q = e.key.toLowerCase();
      if (ctrl && q === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); } else if (ctrl && q === 'y') { e.preventDefault(); redo(); }
    });
    window.addEventListener('resize', () => { if (S.view === 'data' && st.tab === 'data') schedule(); });

    // ------------------------------------------------------------ export
    function exportData(kind) {
      const d = D(), base = A.slug(S.dataName.replace(/\.[a-z0-9]+$/i, '') || S.name || 'data');
      if (kind === 'csv' || kind === 'csvcodes') { A.download(base + '.csv', '﻿' + X.toCSV(d, { labels: kind === 'csv' }), 'text/csv;charset=utf-8'); return; }
      if (kind === 'xlsx') {
        const rows = [d.vars.map(v => v.name)];
        for (let i = 0; i < d.n; i++) rows.push(d.vars.map(v => { const x = v.values[i]; if (isStr(v)) return x; if (x !== x) return ''; if (v.type === 'date') return X.formatDate(x); const l = v.labels.length ? X.labelOf(v, x) : undefined; return l !== undefined && v.type === 'categorical' ? l : x; }));
        const dict = [[t('name'), t('dv_col_label'), t('dv_col_type'), t('dv_col_measure'), t('dv_col_decimals'), t('dv_col_values'), t('dv_col_missing'), t('dv_col_role')]].concat(d.vars.map(v => [v.name, v.label, t('dv_type_' + v.type), t('dv_m_' + X.effMeasure(v)), v.decimals, v.labels.map(p => p[0] + ' = ' + p[1]).join('; '), missingText(v), t('dv_role_' + v.role)]));
        const out = window.YPIO.writeXLSX([{ name: 'data', rows }, { name: t('dv_tab_vars'), rows: dict }], S.lang === 'ar');
        A.download(base + '.xlsx', new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); return;
      }
      const out = window.YPIO.writeSAV(d.vars.map(v => Object.assign({}, v, { measure: X.effMeasure(v) })), d.n, { label: S.name });
      A.download(base + '.sav', new Blob([out], { type: 'application/octet-stream' }));
    }
    function missingText(v) { const m = v.missing, p = m.codes.map(x => (isStr(v) ? '"' + x + '"' : X.fmtNum(x, null))); if (m.lo !== null && m.hi !== null) p.push(X.fmtNum(m.lo, null) + ' – ' + X.fmtNum(m.hi, null)); return p.join(', '); }

    // ------------------------------------------------------------ Variable view
    const opt = (vals, cur, lab) => vals.map(x => `<option value="${x}"${x === cur ? ' selected' : ''}>${esc(lab(x))}</option>`).join('');
    function varViewHTML() {
      const d = D(), dis = d.readOnly ? ' disabled' : '';
      const rows = d.vars.map((v, j) => {
        const vl = v.labels.length ? v.labels.slice(0, 3).map(p => X.format(v, p[0], false) + ' = ' + p[1]).join(', ') + (v.labels.length > 3 ? ' …' : '') : t('none');
        const mt = missingText(v) || t('none');
        return `<tr data-vj="${j}" draggable="${!d.readOnly}">
          <td class="vh" title="${esc(t('dv_drag_reorder'))}" aria-hidden="true">⠿</td><td class="num">${j + 1}</td>
          <td><input data-vf="name" value="${esc(v.name)}" aria-label="${esc(t('name'))}" dir="auto"${dis}></td>
          <td><input data-vf="label" value="${esc(v.label)}" aria-label="${esc(t('dv_col_label'))}" dir="auto"${dis}></td>
          <td><select data-vf="type" aria-label="${esc(t('dv_col_type'))}"${dis}>${opt(X.TYPES, v.type, x => t('dv_type_' + x))}</select></td>
          <td><select data-vf="measure" aria-label="${esc(t('dv_col_measure'))}"${dis}>${opt(X.MEASURES, X.effMeasure(v), x => t('dv_m_' + x))}</select></td>
          <td><input data-vf="decimals" type="number" min="0" max="15" value="${v.decimals}" aria-label="${esc(t('dv_col_decimals'))}"${isStr(v) || v.type === 'date' ? ' disabled' : dis}></td>
          <td><button class="mini vlbtn" data-vlab="${j}" title="${esc(t('dv_edit_values'))}"${v.type === 'date' ? ' disabled' : dis}>${esc(vl)}</button></td>
          <td><button class="mini vlbtn" data-vmiss="${j}" title="${esc(t('dv_edit_missing'))}"${dis}>${esc(mt)}</button></td>
          <td><select data-vf="role" aria-label="${esc(t('dv_col_role'))}"${dis}>${opt(X.ROLES, v.role, x => t('dv_role_' + x))}</select></td>
          <td><input data-vf="width" type="number" min="3" max="60" step="1" value="${Math.round(v.width)}" aria-label="${esc(t('dv_col_width'))}"${dis}></td>
          <td><select data-vf="align" aria-label="${esc(t('dv_col_align'))}"${dis}>${opt(['auto', 'left', 'center', 'right'], v.align, x => t('dv_al_' + x))}</select></td></tr>`;
      }).join('');
      const head = ['', '#', t('name'), t('dv_col_label'), t('dv_col_type'), t('dv_col_measure'), t('dv_col_decimals'), t('dv_col_values'), t('dv_col_missing'), t('dv_col_role'), t('dv_col_width'), t('dv_col_align')];
      return `<div class="vv"><p class="note">${esc(t('dv_vars_note'))}</p><table class="grid vvt"><thead><tr>${head.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
        ${d.readOnly ? '' : `<p><button data-dvact="insvar">＋ ${esc(t('dv_a_insvar'))}</button></p>`}</div>`;
    }
    function bindVarView(main) {
      main.addEventListener('change', e => {
        const el = e.target.closest('[data-vf]'); if (!el) return;
        const j = +el.closest('tr').dataset.vj, f = el.dataset.vf, v = D().vars[j], val = el.value;
        if (f === 'name') {
          const nm = val.trim(), err = X.nameError(D(), nm, j);
          if (nm === v.name) return;
          if (err) { toast(t(err), 'bad'); el.value = v.name; return; }
          const old = v.name;
          tx(t('dv_h_rename', { a: old, b: nm }), d => { d.vars[j].name = nm; X.touch(d.vars[j]); X.renameInModels(A.models(), old, nm); A.renamed(old, nm); }, { models: true });
          return;
        }
        tx(t('dv_h_prop', { a: v.name }), d => {
          const w = d.vars[j];
          if (f === 'label') w.label = val;
          else if (f === 'type') { const lost = X.convertType(w, val); if (lost) toast(t('dv_lost', { n: lost }), 'bad'); }
          else if (f === 'measure') { w.measure = val; w.measureSet = true; }
          else if (f === 'decimals') w.decimals = Math.max(0, Math.min(15, parseInt(val, 10) || 0));
          else if (f === 'role') w.role = val;
          else if (f === 'width') w.width = Math.max(3, Math.min(60, +val || 10));
          else if (f === 'align') w.align = val;
          X.touch(w);
        });
        if (f === 'type') render(st.el);
      });
      main.addEventListener('click', e => {
        const b = e.target.closest('[data-vlab],[data-vmiss]'); if (!b) return;
        if (b.dataset.vlab !== undefined) valueLabelsDialog(+b.dataset.vlab); else missingDialog(+b.dataset.vmiss);
      });
      let from = null;
      main.addEventListener('dragstart', e => { const tr = e.target.closest('tr[data-vj]'); if (!tr) return; from = +tr.dataset.vj; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(from)); tr.classList.add('dragging'); });
      main.addEventListener('dragover', e => { const tr = e.target.closest('tr[data-vj]'); if (!tr || from === null) return; e.preventDefault(); $$('tr.dropat', main).forEach(x => x.classList.remove('dropat')); tr.classList.add('dropat'); });
      main.addEventListener('dragend', () => { from = null; $$('tr.dropat,tr.dragging', main).forEach(x => x.classList.remove('dropat', 'dragging')); });
      main.addEventListener('drop', e => { const tr = e.target.closest('tr[data-vj]'); if (!tr || from === null) return; e.preventDefault(); const to = +tr.dataset.vj, f = from; from = null; if (to !== f) { if (tx(t('dv_h_move'), d => X.moveVar(d, f, to))) render(st.el); } });
      if (st.focusVar !== undefined) { const tr = $(`tr[data-vj="${st.focusVar}"]`, main); if (tr) { tr.scrollIntoView({ block: 'center' }); const i = $('input', tr); if (i) i.focus(); } st.focusVar = undefined; }
    }
    function valueLabelsDialog(j) {
      const v = D().vars[j];
      const row = (c, l) => `<div class="vlrow"><input class="vlc" value="${esc(c)}" aria-label="${esc(t('dv_code'))}" dir="auto"><input class="vll" value="${esc(l)}" aria-label="${esc(t('dv_label'))}" dir="auto"><button type="button" class="mini" data-vlmv="-1" aria-label="${esc(t('dv_up'))}">↑</button><button type="button" class="mini" data-vlmv="1" aria-label="${esc(t('dv_down'))}">↓</button><button type="button" class="mini x" data-vlrm aria-label="${esc(t('remove'))}">×</button></div>`;
      dialog({
        title: t('dv_values_title', { v: v.name }), desc: t('dv_values_note'),
        body: `<div class="vlist">${v.labels.map(p => row(X.format(v, p[0], false), p[1])).join('')}</div><p><button type="button" data-vladd>＋ ${esc(t('dv_add_label'))}</button> <button type="button" data-vlauto>${esc(t('dv_labels_from_data'))}</button></p>`,
        init: body => body.addEventListener('click', e => {
          const b = e.target.closest('button'); if (!b) return; const list = $('.vlist', body);
          if (b.dataset.vladd !== undefined) { list.insertAdjacentHTML('beforeend', row('', '')); $$('.vlc', list).pop().focus(); }
          else if (b.dataset.vlauto !== undefined) { const have = new Set($$('.vlc', list).map(i => i.value.trim())); X.labelCodes(v).forEach(p => { const c = X.format(v, p[0], false); if (!have.has(c)) list.insertAdjacentHTML('beforeend', row(c, String(p[1]))); }); }
          else if (b.dataset.vlrm !== undefined) b.closest('.vlrow').remove();
          else if (b.dataset.vlmv) { const r = b.closest('.vlrow'), o = +b.dataset.vlmv > 0 ? r.nextElementSibling : r.previousElementSibling; if (o) { if (+b.dataset.vlmv > 0) o.after(r); else o.before(r); } }
        }),
        apply: (fd, body) => {
          const pairs = [], seen = new Set();
          for (const r of $$('.vlrow', body)) {
            const c = $('.vlc', r).value.trim(), l = $('.vll', r).value; if (c === '' && !l.trim()) continue;
            const code = isStr(v) ? c : v.type === 'date' ? X.parseDate(c) : X.parseNumber(c);
            if (code === undefined || code !== code) { toast(t('dv_bad_code', { c }), 'bad'); return false; }
            if (seen.has(code)) { toast(t('dv_dup_code', { c }), 'bad'); return false; }
            seen.add(code); pairs.push([code, l]);
          }
          tx(t('dv_h_values', { a: v.name }), d => { d.vars[j].labels = pairs; X.touch(d.vars[j]); });
          if (st.tab === 'vars') render(st.el);
        }
      });
    }
    function missingDialog(j) {
      const v = D().vars[j], m = v.missing;
      dialog({
        title: t('dv_missing_title', { v: v.name }), desc: t('dv_missing_note'),
        body: `<label>${esc(t('dv_missing_codes'))}<input name="codes" value="${esc(m.codes.map(x => (isStr(v) ? x : X.fmtNum(x, null))).join(', '))}" placeholder="99, -9" dir="ltr"></label>
          ${isStr(v) ? '' : `<div class="row2"><label>${esc(t('dv_range_lo'))}<input name="lo" type="number" step="any" value="${m.lo === null ? '' : m.lo}"></label><label>${esc(t('dv_range_hi'))}<input name="hi" type="number" step="any" value="${m.hi === null ? '' : m.hi}"></label></div>`}`,
        preview: fd => { const w = Object.assign({}, v, { missing: readMissing(fd) }); if (!w.missing) return `<p class="bad">${esc(t('dv_bad_missing'))}</p>`; let k = 0; v.values.forEach(x => { if (X.isMissing(w, x)) k++; }); return `<p>${esc(t('dv_missing_count', { n: k, all: v.values.length }))}</p>`; },
        apply: fd => { const mm = readMissing(fd); if (!mm) { toast(t('dv_bad_missing'), 'bad'); return false; } tx(t('dv_h_missing', { a: v.name }), d => { d.vars[j].missing = mm; X.touch(d.vars[j]); }); if (st.tab === 'vars') render(st.el); }
      });
      function readMissing(fd) {
        const codes = String(fd.codes || '').split(/[,;،]/).map(s => s.trim()).filter(s => s !== '').map(s => (isStr(v) ? s.replace(/^"(.*)"$/, '$1') : X.parseNumber(s)));
        if (codes.some(x => x === undefined || x !== x)) return null;
        const lo = fd.lo === undefined || fd.lo === '' ? null : +fd.lo, hi = fd.hi === undefined || fd.hi === '' ? null : +fd.hi;
        if ((lo === null) !== (hi === null) || (lo !== null && lo > hi)) return null;
        return { codes, lo, hi };
      }
    }

    // ------------------------------------------------------------ dialogs
    let dlg = null;
    function dialog(o) {
      if (!dlg) {
        dlg = document.createElement('dialog'); dlg.id = 'dvdlg'; dlg.className = 'wide dvdlg';
        dlg.innerHTML = `<form method="dialog"><h2></h2><p class="note dvdesc"></p><div class="fields dvfields"></div><div class="dvprev" aria-live="polite"></div><menu><span class="dvextra"></span><span class="grow"></span><button type="button" class="dvcancel"></button><button class="primary dvok" type="submit"></button></menu></form>`;
        document.body.appendChild(dlg);
        $('.dvcancel', dlg).addEventListener('click', () => dlg.close());
        dlg.addEventListener('click', e => { if (e.target.closest('[data-doc]')) dlg.close(); }); // the method page opens behind
      }
      if (dlg.open) dlg.close();
      const body = $('.dvfields', dlg), prev = $('.dvprev', dlg);
      $('h2', dlg).textContent = o.title;
      if (o.doc) $('h2', dlg).insertAdjacentHTML('beforeend', ` <button type="button" class="mini" data-doc="${o.doc}" title="${esc(t('method_ref'))}" aria-label="${esc(t('method_ref'))}">📖</button>`);
      $('.dvdesc', dlg).textContent = o.desc || ''; $('.dvdesc', dlg).hidden = !o.desc;
      body.innerHTML = o.body; prev.innerHTML = ''; prev.hidden = !o.preview;
      $('.dvcancel', dlg).textContent = t(o.cancel || 'cancel'); $('.dvok', dlg).textContent = t(o.ok || 'dv_ok');
      $('.dvextra', dlg).innerHTML = o.extra || '';
      const read = () => { const fd = {}; $$('input,select,textarea', body).forEach(el => { if (!el.name) return; if (el.type === 'checkbox') fd[el.name] = el.checked; else if (el.type === 'radio') { if (el.checked) fd[el.name] = el.value; } else if (el.multiple) fd[el.name] = Array.from(el.selectedOptions).map(x => x.value); else if (el.type !== 'file') fd[el.name] = el.value; }); return fd; };
      let timer = 0;
      const upd = () => { if (!o.preview) return; clearTimeout(timer); timer = setTimeout(() => { try { prev.innerHTML = o.preview(read(), body) || ''; } catch (e) { prev.innerHTML = `<p class="bad">${esc(errText(e))}</p>`; } }, 120); };
      body.oninput = upd; body.onchange = upd;
      const form = $('form', dlg);
      form.onsubmit = e => { e.preventDefault(); let r; try { r = o.apply(read(), body); } catch (err) { toast(errText(err), 'bad'); return; } if (r !== false) { dlg.close(); const g = st.el && $('.dg', st.el); if (g) g.focus(); } };
      $('.dvextra', dlg).onclick = e => { const b = e.target.closest('button'); if (b && o.onExtra) o.onExtra(b.dataset.x, read(), body); };
      if (o.init) o.init(body, upd);
      if (o.modeless) dlg.show(); else dlg.showModal();
      upd();
      const f = $('input:not([type=hidden]):not([disabled]),select,textarea', body); if (f && !o.noFocus) f.focus();
      return { body, close: () => dlg.close(), update: upd };
    }
    // field builders
    const lab = (key, inner, cls) => `<label${cls ? ` class="${cls}"` : ''}>${esc(t(key))}${inner}</label>`;
    function varSel(name, o) {
      o = o || {}; const d = D(), list = d.vars.map((v, j) => ({ v, j })).filter(x => !o.filter || o.filter(x.v)), cur = [].concat(o.value === undefined ? [] : o.value);
      return lab(o.key || 'dv_f_' + name, `<select name="${name}"${o.multiple ? ` multiple size="${o.size || 8}"` : ''}>${o.none ? `<option value="">${esc(t('none'))}</option>` : ''}${list.map(x => `<option value="${x.j}"${cur.includes(x.j) ? ' selected' : ''}>${esc(x.v.name)}${x.v.label ? ' – ' + esc(x.v.label) : ''}</option>`).join('')}</select>${o.multiple ? `<small>${esc(t('multi_hint'))}</small>` : ''}`);
    }
    const numField = (name, value, key, attrs) => lab(key || 'dv_f_' + name, `<input name="${name}" type="number" step="any" value="${esc(value === undefined || value === null ? '' : value)}"${attrs || ''}>`);
    const textField = (name, value, key, ph) => lab(key || 'dv_f_' + name, `<input name="${name}" value="${esc(value || '')}" placeholder="${esc(ph || '')}" dir="auto">`);
    const selField = (name, vals, value, key, pre) => lab(key || 'dv_f_' + name, `<select name="${name}">${vals.map(x => `<option value="${x}"${String(x) === String(value) ? ' selected' : ''}>${esc(t('dv_o_' + (pre || '') + x))}</option>`).join('')}</select>`);
    const check = (name, on, key) => `<label class="check"><input type="checkbox" name="${name}"${on ? ' checked' : ''}> ${esc(t(key || 'dv_f_' + name))}</label>`;
    const numericVar = v => v.type === 'numeric' || v.type === 'categorical' || v.type === 'date';
    const curVar = () => Math.min(st.sel.c, K() - 1);
    const idxs = fd => [].concat(fd || []).map(Number).filter(j => j >= 0);
    // a short preview table: first cases of the source and result columns
    function previewTable(heads, cols, n) {
      n = Math.min(n || 8, D().n);
      let h = `<table class="grid mini"><thead><tr><th>#</th>${heads.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>`;
      for (let i = 0; i < n; i++) h += `<tr><th>${i + 1}</th>${cols.map(c => `<td class="${typeof c[i] === 'number' ? 'num' : ''}">${esc(typeof c[i] === 'number' ? X.fmtNum(c[i], Number.isInteger(c[i]) ? 0 : 4) : c[i] === undefined ? '' : c[i])}</td>`).join('')}</tr>`;
      return h + '</tbody></table>';
    }
    const countValid = a => { let k = 0; for (const x of a) if (typeof x === 'string' ? x !== '' : x === x) k++; return k; };
    function newVarAfter(d, after, name, values, o) {
      const v = X.newVar(X.uniqueName(d, name), (o && o.type) || 'numeric', d.n, Object.assign({ values }, o || {}));
      if (!o || o.decimals === undefined) v.decimals = Math.min(4, X.inferDecimals(values));
      X.insertVar(d, after === null ? d.vars.length : after + 1, v); return v;
    }
    const nview = v => X.numeric(v);

    const OPEN = {};
    function open(kind) {
      if (!D()) { toast(t('no_data'), 'bad'); return; }
      if (st.edit) commitEdit();
      if (OPEN[kind]) OPEN[kind]();
    }

    // ---- compute
    const FUNCS = ['mean', 'sum', 'min', 'max', 'sd', 'median', 'count', 'nmiss', 'abs', 'sqrt', 'ln', 'log10', 'exp', 'round', 'floor', 'ceil', 'trunc', 'mod', 'pow', 'if', 'missing', 'notmissing', 'between', 'any', 'lag', 'casenum'];
    OPEN.compute = () => {
      const d = D(), fn = FUNCS.map(f => `<option value="${f}">${f}()</option>`).join('');
      dialog({
        title: t('dv_a_compute'), desc: t('dv_compute_note'), ok: 'dv_ok',
        body: `<div class="row2">${lab('dv_f_target', `<input name="target" list="dv-names" value="${esc(X.uniqueName(d, 'new_var'))}" dir="auto">`)}${textField('label', '', 'dv_col_label')}</div><datalist id="dv-names">${d.vars.map(v => `<option value="${esc(v.name)}">`).join('')}</datalist>
          ${lab('dv_f_expr', `<textarea name="expr" rows="3" dir="ltr" spellcheck="false" placeholder="mean(sat_1 to sat_3)"></textarea>`)}
          <div class="row2">${lab('variables', `<select class="dvins" size="7" dir="ltr">${d.vars.map(v => `<option value="${esc(/^[\p{L}_][\p{L}\p{N}_.]*$/u.test(v.name) ? v.name : '`' + v.name + '`')}">${esc(v.name)}</option>`).join('')}</select><small>${esc(t('dv_dbl_insert'))}</small>`)}${lab('dv_functions', `<select class="dvins fn" size="7" dir="ltr">${fn}</select><small>${esc(t('dv_dbl_insert'))}</small>`)}</div>
          <details class="dvhelp"><summary>${esc(t('dv_expr_help'))}</summary><p class="note" dir="auto">${esc(t('dv_expr_help_text'))}</p></details>`,
        init: body => body.addEventListener('dblclick', e => {
          const o = e.target.closest('select.dvins option'); if (!o) return; const ta = $('textarea', body), s = ta.selectionStart, txt = o.parentElement.classList.contains('fn') ? o.value + '(' : o.value;
          ta.value = ta.value.slice(0, s) + txt + ta.value.slice(ta.selectionEnd); ta.focus(); ta.selectionStart = ta.selectionEnd = s + txt.length; ta.dispatchEvent(new Event('input', { bubbles: true }));
        }),
        preview: fd => {
          if (!fd.expr.trim()) return '';
          const r = X.evaluate(D(), fd.expr), j = D().vars.findIndex(v => v.name === fd.target.trim());
          return `<p>${esc(t('dv_valid_n', { n: countValid(r.values), all: D().n }))}${j >= 0 ? ' · <b class="warn">' + esc(t('dv_overwrite', { v: fd.target })) + '</b>' : ''}</p>` + previewTable([fd.target || '?'], [r.values]);
        },
        apply: fd => {
          const name = fd.target.trim(), d = D(); let j = d.vars.findIndex(v => v.name === name);
          if (j < 0) { const err = X.nameError(d, name); if (err) { toast(t(err), 'bad'); return false; } }
          const r = X.evaluate(d, fd.expr);
          if (j >= 0 && !confirm(t('dv_overwrite', { v: name }))) return false;
          tx(t('dv_h_compute', { a: name }), dd => {
            if (j >= 0) { const v = dd.vars[j]; if (r.isString !== isStr(v)) X.convertType(v, r.isString ? 'string' : 'numeric'); v.values = r.values; if (fd.label) v.label = fd.label; X.touch(v); }
            else { const v = X.newVar(name, r.isString ? 'string' : 'numeric', dd.n, { values: r.values, label: fd.label || '' }); if (!r.isString) v.decimals = Math.min(4, X.inferDecimals(r.values)); X.insertVar(dd, dd.vars.length, v); j = dd.vars.length - 1; }
          });
          layout(); moveTo(st.sel.r, j);
        }
      });
    };

    // ---- recode
    const RULE_FROM = ['value', 'range', 'lowest', 'highest', 'missing', 'sysmis', 'else'], RULE_TO = ['value', 'missing', 'copy'];
    function ruleRow(r) {
      r = r || { from: 'value', a: '', b: '', to: 'value', v: '' };
      return `<div class="rule"><select class="rf" aria-label="${esc(t('dv_old_value'))}">${RULE_FROM.map(x => `<option value="${x}"${x === r.from ? ' selected' : ''}>${esc(t('dv_r_' + x))}</option>`).join('')}</select><input class="ra" value="${esc(r.a)}" aria-label="${esc(t('dv_old_value'))}" dir="auto"><input class="rb" value="${esc(r.b)}" aria-label="${esc(t('dv_range_hi'))}" dir="auto"> → <select class="rt" aria-label="${esc(t('dv_new_value'))}">${RULE_TO.map(x => `<option value="${x}"${x === r.to ? ' selected' : ''}>${esc(t('dv_r_to_' + x))}</option>`).join('')}</select><input class="rv" value="${esc(r.v)}" aria-label="${esc(t('dv_new_value'))}" dir="auto"><button type="button" class="mini x" data-rrm aria-label="${esc(t('remove'))}">×</button></div>`;
    }
    function readRules(body, v) {
      const num = s => { const r = v ? X.parseCell(v, s) : { value: X.parseNumber(s) }; const x = r.error || r.label ? X.parseNumber(s) : r.value; if (x === undefined || x !== x) throw Object.assign(new Error('dv_bad_rule'), { code: 'dv_bad_rule', arg: s }); return x; };
      const rules = $$('.rule', body).map(row => {
        const f = $('.rf', row).value, a = $('.ra', row).value.trim(), b = $('.rb', row).value.trim(), to = $('.rt', row).value, nv = $('.rv', row).value.trim();
        const from = f === 'value' ? { t: 'value', v: num(a) } : f === 'range' ? { t: 'range', lo: num(a), hi: num(b) } : f === 'lowest' ? { t: 'range', lo: -Infinity, hi: num(a) } : f === 'highest' ? { t: 'range', lo: num(a), hi: Infinity } : { t: f };
        const tt = to === 'value' ? { t: 'value', v: X.parseNumber(nv) } : { t: to };
        if (to === 'value' && (tt.v === undefined || tt.v !== tt.v)) throw Object.assign(new Error('dv_bad_rule'), { code: 'dv_bad_rule', arg: nv });
        return { from, to: tt };
      });
      if (!rules.length) throw Object.assign(new Error('dv_need_rule'), { code: 'dv_need_rule' });
      return rules;
    }
    function recodeDialog(into) {
      const c = curVar();
      dialog({
        title: t(into ? 'dv_a_recodeinto' : 'dv_a_recode'), desc: t(into ? 'dv_recodeinto_note' : 'dv_recode_note'),
        body: varSel('vars', { multiple: true, filter: numericVar, value: c, size: 6 }) + (into ? textField('suffix', '_rc', 'dv_f_suffix') : '') +
          `<h4>${esc(t('dv_rules'))}</h4><div class="rules">${ruleRow()}</div><p><button type="button" data-radd>＋ ${esc(t('dv_add_rule'))}</button></p>`,
        init: (body, upd) => {
          const sync = () => $$('.rule', body).forEach(r => { const f = $('.rf', r).value; $('.ra', r).hidden = ['missing', 'sysmis', 'else'].includes(f); $('.rb', r).hidden = f !== 'range'; $('.rv', r).hidden = $('.rt', r).value !== 'value'; });
          body.addEventListener('click', e => { if (e.target.closest('[data-radd]')) { $('.rules', body).insertAdjacentHTML('beforeend', ruleRow()); sync(); } if (e.target.closest('[data-rrm]')) { e.target.closest('.rule').remove(); upd(); } });
          body.addEventListener('change', sync); sync();
        },
        preview: (fd, body) => {
          const js = idxs(fd.vars); if (!js.length) return ''; const v = D().vars[js[0]], rules = readRules(body, v);
          const out = X.recode(v.values, rules, { into, isMissing: x => X.isMissing(v, x) });
          return previewTable([v.name, (into ? v.name + fd.suffix : v.name) + ' ←'], [Array.from(v.values, x => X.format(v, x, false)), out]);
        },
        apply: (fd, body) => {
          const js = idxs(fd.vars); if (!js.length) { toast(t('dv_need_vars'), 'bad'); return false; }
          const rules = readRules(body, D().vars[js[0]]);
          tx(t(into ? 'dv_a_recodeinto' : 'dv_a_recode'), d => {
            const vs = js.map(j => d.vars[j]);
            vs.forEach(v => {
              const out = X.recode(v.values, rules, { into, isMissing: x => X.isMissing(v, x) });
              if (into) newVarAfter(d, d.vars.indexOf(v), v.name + (fd.suffix || '_rc'), out, { label: v.label });
              else { v.values = out; X.touch(v); }
            });
          });
        }
      });
    }
    OPEN.recode = () => recodeDialog(false);
    OPEN.recodeinto = () => recodeDialog(true);

    // ---- reverse
    OPEN.reverse = () => dialog({
      title: t('dv_a_reverse'), desc: t('dv_reverse_note'),
      body: varSel('vars', { multiple: true, filter: numericVar, value: curVar(), size: 8 }) + `<div class="row2">${numField('min', '', 'dv_f_scalemin', ` placeholder="${esc(t('auto'))}"`)}${numField('max', '', 'dv_f_scalemax', ` placeholder="${esc(t('auto'))}"`)}</div>` + selField('mode', ['new', 'replace'], 'new', 'dv_f_output') + textField('suffix', '_r', 'dv_f_suffix'),
      preview: fd => { const js = idxs(fd.vars); if (!js.length) return ''; const v = D().vars[js[0]], s = X.summary(v), lo = fd.min === '' ? s.min : +fd.min, hi = fd.max === '' ? s.max : +fd.max; return `<p>${esc(t('dv_reverse_range', { a: X.fmtNum(lo, null), b: X.fmtNum(hi, null) }))}</p>` + previewTable([v.name, v.name + fd.suffix], [nview(v), X.reverse(nview(v), lo, hi)]); },
      apply: fd => {
        const js = idxs(fd.vars); if (!js.length) { toast(t('dv_need_vars'), 'bad'); return false; }
        tx(t('dv_a_reverse'), d => {
          js.map(j => d.vars[j]).forEach(v => {
            const s = X.summary(v), lo = fd.min === '' ? s.min : +fd.min, hi = fd.max === '' ? s.max : +fd.max, out = X.reverse(nview(v), lo, hi);
            const labels = v.labels.filter(p => typeof p[0] === 'number').map(p => [lo + hi - p[0], p[1]]).sort((a, b) => a[0] - b[0]);
            if (fd.mode === 'replace') { v.values = out; v.missing = { codes: [], lo: null, hi: null }; v.labels = labels; X.touch(v); }
            else newVarAfter(d, d.vars.indexOf(v), v.name + (fd.suffix || '_r'), out, { label: v.label, labels, type: v.type === 'categorical' ? 'categorical' : 'numeric', decimals: v.decimals, measure: v.measure, measureSet: v.measureSet });
          });
        });
      }
    });

    // ---- standardize / center
    OPEN.standardize = () => dialog({
      title: t('dv_a_standardize'), doc: 'zscore', desc: t('dv_standardize_note'),
      body: varSel('vars', { multiple: true, filter: v => v.type === 'numeric', value: curVar(), size: 8 }) + selField('method', ['z', 'center', 'centerat'], 'z', 'dv_f_method') + numField('at', '', 'dv_f_center_at'),
      preview: fd => { const js = idxs(fd.vars); if (!js.length) return ''; const v = D().vars[js[0]], a = nview(v); return previewTable([v.name, pref(fd.method) + v.name], [a, fd.method === 'z' ? X.zscore(a) : X.center(a, fd.method === 'centerat' ? +fd.at : undefined)]); },
      apply: fd => {
        const js = idxs(fd.vars); if (!js.length) { toast(t('dv_need_vars'), 'bad'); return false; }
        if (fd.method === 'centerat' && !isFinite(parseFloat(fd.at))) { toast(t('dv_need_value'), 'bad'); return false; }
        tx(t('dv_a_standardize'), d => { js.map(j => d.vars[j]).forEach(v => { const a = nview(v); newVarAfter(d, d.vars.indexOf(v), pref(fd.method) + v.name, fd.method === 'z' ? X.zscore(a) : X.center(a, fd.method === 'centerat' ? +fd.at : undefined), { label: (fd.method === 'z' ? 'z: ' : t('dv_o_center') + ': ') + (v.label || v.name), decimals: 4 }); }); });
      }
    });
    const pref = m => (m === 'z' ? 'Z' : 'c_');

    // ---- rank
    OPEN.rank = () => dialog({
      title: t('dv_a_rank'), doc: 'ranks', desc: t('dv_rank_note'),
      body: varSel('vars', { multiple: true, filter: v => v.type !== 'string', value: curVar(), size: 7 }) + `<div class="row2">${selField('ties', ['mean', 'low', 'high', 'dense'], 'mean', 'dv_f_ties', 'tie_')}${selField('order', ['asc', 'desc'], 'asc', 'dv_f_order')}</div>` +
        `<fieldset><legend>${esc(t('dv_f_outputs'))}</legend>${check('o_rank', true, 'dv_o_rank')}${check('o_percent', false, 'dv_o_percent')}${check('o_fraction', false, 'dv_o_fraction')}${check('o_ntiles', false, 'dv_o_ntiles')}${numField('k', 4, 'dv_f_ntiles', ' min="2" max="100" step="1"')}</fieldset>`,
      preview: fd => { const js = idxs(fd.vars); if (!js.length) return ''; const v = D().vars[js[0]], a = nview(v), o = { ties: fd.ties, desc: fd.order === 'desc', k: +fd.k || 4 }; const outs = rankOuts(fd); return previewTable([v.name].concat(outs.map(x => x[1] + v.name)), [a].concat(outs.map(x => X.rankScore(a, x[0], o)))); },
      apply: fd => {
        const js = idxs(fd.vars), outs = rankOuts(fd); if (!js.length || !outs.length) { toast(t('dv_need_vars'), 'bad'); return false; }
        tx(t('dv_a_rank'), d => { js.map(j => d.vars[j]).forEach(v => { const a = nview(v), o = { ties: fd.ties, desc: fd.order === 'desc', k: Math.max(2, +fd.k || 4) }; let at = d.vars.indexOf(v); outs.forEach(x => { newVarAfter(d, at++, x[1] + v.name, X.rankScore(a, x[0], o), { label: t('dv_o_' + x[0]) + ': ' + (v.label || v.name), measure: 'ordinal', measureSet: x[0] === 'ntiles' }); }); }); });
      }
    });
    const rankOuts = fd => [['rank', 'R_'], ['percent', 'P_'], ['fraction', 'RF_'], ['ntiles', 'N_']].filter(x => fd['o_' + (x[0] === 'rank' ? 'rank' : x[0])]);

    // ---- visual binning (also "Define data groups")
    OPEN.bin = () => {
      const c = curVar(), d = D(), jj = d.vars[c] && d.vars[c].type === 'numeric' ? c : d.vars.findIndex(v => v.type === 'numeric');
      dialog({
        title: t('dv_a_bin'), doc: 'tukeyfences', desc: t('dv_bin_note'),
        body: varSel('var', { filter: v => v.type === 'numeric', value: jj }) + `<div class="row2">${selField('method', ['median', 'width', 'quantile', 'cuts'], 'quantile', 'dv_f_method', 'bin_')}${numField('k', 3, 'dv_f_bins', ' min="2" max="50" step="1"')}</div>` + textField('cuts', '', 'dv_f_cuts', '2.5, 4.5') + `<div class="row2">${textField('name', '', 'dv_f_newname', 'group')}${textField('label', '', 'dv_col_label')}</div>`,
        preview: fd => { const r = binFor(fd); if (!r) return ''; const cnt = r.labels.map(p => Array.from(r.codes).filter(x => x === p[0]).length); return `<p>${esc(t('dv_cuts_are', { c: r.cuts.map(x => X.fmtNum(x, null)).join(', ') || '–' }))}</p><table class="grid mini"><thead><tr><th>${esc(t('dv_code'))}</th><th>${esc(t('dv_label'))}</th><th>N</th></tr></thead><tbody>${r.labels.map((p, i) => `<tr><td class="num">${p[0]}</td><td>${esc(p[1])}</td><td class="num">${cnt[i]}</td></tr>`).join('')}</tbody></table>`; },
        apply: fd => {
          const r = binFor(fd); if (!r || !r.cuts.length) { toast(t('grp_need_cuts'), 'bad'); return false; }
          const v = D().vars[+fd.var];
          tx(t('dv_a_bin'), dd => { newVarAfter(dd, dd.vars.indexOf(dd.vars.find(x => x.name === v.name)), (fd.name || '').trim() || v.name + '_bin', r.codes, { type: 'categorical', labels: r.labels, measure: 'ordinal', measureSet: true, label: fd.label || '', decimals: 0 }); });
        }
      });
    };
    function binFor(fd) {
      const v = D().vars[+fd.var]; if (!v) return null; const a = nview(v), k = Math.max(2, Math.min(50, parseInt(fd.k, 10) || 3));
      const cuts = X.binCuts(a, fd.method, k, String(fd.cuts || '').split(/[;,،\s]+/).map(Number).filter(isFinite));
      return Object.assign(X.bin(a, cuts), { cuts });
    }

    // ---- dummy variables
    OPEN.dummies = () => {
      const d = D(), c = curVar(), cats = j => { const v = d.vars[j]; return v.type !== 'string' && (v.type === 'categorical' || X.effMeasure(v) !== 'scale'); }, jj = cats(c) ? c : d.vars.findIndex((v, j) => cats(j));
      dialog({
        title: t('dv_a_dummies'), desc: t('dv_dummies_note'),
        body: varSel('var', { filter: v => v.type !== 'string', value: jj }) + `<div class="row2">${selField('ref', ['first', 'last', 'none'], 'first', 'dv_f_ref', 'ref_')}${textField('prefix', '', 'dv_f_prefix', t('auto'))}</div>`,
        preview: fd => { const r = dummyFor(fd); if (!r) return ''; return `<p>${esc(t('dv_dummies_make', { n: r.list.length, ref: r.refLabel || t('none') }))}</p>` + previewTable([r.v.name].concat(r.list.map(x => x.name)), [Array.from(r.v.values, x => X.format(r.v, x, true))].concat(r.list.map(x => x.values))); },
        apply: fd => { const r = dummyFor(fd); if (!r || !r.list.length) { toast(t('dv_need_levels'), 'bad'); return false; } tx(t('dv_a_dummies'), dd => { let at = dd.vars.indexOf(dd.vars.find(x => x.name === r.v.name)); r.list.forEach(x => newVarAfter(dd, at++, x.name, x.values, { label: r.v.name + ' = ' + x.level, decimals: 0 })); }); }
      });
    };
    function dummyFor(fd) {
      const v = D().vars[+fd.var]; if (!v) return null; const a = nview(v), levels = X.summary(v).levels; if (levels.length > 60) throw Object.assign(new Error('dv_too_many_levels'), { code: 'dv_too_many_levels' });
      const ref = fd.ref === 'first' ? levels[0] : fd.ref === 'last' ? levels[levels.length - 1] : null, prefix = fd.prefix || v.name + '_';
      return { v, refLabel: ref === null ? '' : X.format(v, ref, true), list: X.dummies(a, levels, ref).map(x => ({ level: X.format(v, x.level, true), name: X.uniqueName(D(), prefix + X.format(v, x.level, true)), values: x.values })) };
    }

    // ---- count values within cases
    OPEN.count = () => dialog({
      title: t('dv_a_count'), desc: t('dv_count_note'),
      body: varSel('vars', { multiple: true, filter: numericVar, value: curVar(), size: 8 }) + textField('spec', '', 'dv_f_countspec', '1, 2, 4-5, missing') + textField('name', 'count', 'dv_f_newname'),
      preview: fd => { const js = idxs(fd.vars); if (!js.length || !fd.spec.trim()) return ''; return previewTable(js.slice(0, 4).map(vname).concat([fd.name]), js.slice(0, 4).map(j => nview(D().vars[j])).concat([countFor(fd, js)])); },
      apply: fd => { const js = idxs(fd.vars); if (!js.length) { toast(t('dv_need_vars'), 'bad'); return false; } const out = countFor(fd, js); tx(t('dv_a_count'), d => { newVarAfter(d, null, (fd.name || 'count').trim(), out, { decimals: 0, label: t('dv_a_count') + ': ' + fd.spec }); }); }
    });
    function countFor(fd, js) {
      const spec = String(fd.spec).split(/[,;،]/).map(s => s.trim()).filter(Boolean).map(s => {
        if (/^(missing|مفقود)$/i.test(s)) return { t: 'missing' };
        const m = s.match(/^(-?[\d.]+)\s*(?:-|–|to|إلى)\s*(-?[\d.]+)$/); if (m) return { t: 'range', lo: +m[1], hi: +m[2] };
        const x = X.parseNumber(s); if (x === undefined || x !== x) throw Object.assign(new Error('dv_bad_rule'), { code: 'dv_bad_rule', arg: s }); return { t: 'value', v: x };
      });
      const vs = js.map(j => D().vars[j]);
      return X.countValues(vs.map(v => v.values), spec, vs.map(v => x => X.isMissing(v, x)));
    }

    // ---- replace missing values / listwise deletion
    OPEN.missing = () => dialog({
      title: t('dv_a_missing'), doc: 'imputation', desc: t('dv_missing_rep_note'),
      body: varSel('vars', { multiple: true, filter: numericVar, value: curVar(), size: 8 }) + `<div class="row2">${selField('method', ['mean', 'median', 'nearmean', 'nearmedian', 'linear', 'mode'], 'mean', 'dv_f_method', 'rm_')}${numField('span', 2, 'dv_f_span', ' min="1" max="50" step="1"')}</div>` + selField('mode', ['new', 'replace'], 'new', 'dv_f_output') + textField('suffix', '_1', 'dv_f_suffix'),
      preview: fd => { const js = idxs(fd.vars); if (!js.length) return ''; const v = D().vars[js[0]], a = nview(v), out = X.replaceMissing(a, fd.method, { span: +fd.span || 2 }); const rows = []; for (let i = 0; i < a.length && rows.length < 8; i++) if (a[i] !== a[i]) rows.push(i); return `<p>${esc(t('dv_missing_filled', { n: countValid(out) - countValid(a), m: a.length - countValid(a) }))}</p>` + (rows.length ? `<table class="grid mini"><thead><tr><th>#</th><th>${esc(v.name)}</th></tr></thead><tbody>${rows.map(i => `<tr><th>${i + 1}</th><td class="num">${esc(X.fmtNum(out[i], 4) || '–')}</td></tr>`).join('')}</tbody></table>` : ''); },
      apply: fd => {
        const js = idxs(fd.vars); if (!js.length) { toast(t('dv_need_vars'), 'bad'); return false; }
        tx(t('dv_a_missing'), d => { js.map(j => d.vars[j]).forEach(v => { const out = X.replaceMissing(nview(v), fd.method, { span: Math.max(1, +fd.span || 2) }); if (fd.mode === 'replace') { v.values = out; v.missing = { codes: [], lo: null, hi: null }; X.touch(v); } else newVarAfter(d, d.vars.indexOf(v), v.name + (fd.suffix || '_1'), out, { label: v.label, labels: v.labels.slice(), type: v.type, decimals: v.decimals }); }); });
      }
    });
    OPEN.listwise = () => dialog({
      title: t('dv_a_listwise'), desc: t('dv_listwise_note'),
      body: varSel('vars', { multiple: true, value: D().vars.map((v, j) => j), size: 10 }) + selField('action', ['delete', 'filter'], 'delete', 'dv_f_action', 'lw_'),
      preview: fd => { const js = idxs(fd.vars), rows = incomplete(js); return `<p>${esc(t('dv_incomplete_n', { n: rows.length, all: D().n }))}</p>`; },
      apply: fd => {
        const js = idxs(fd.vars), rows = incomplete(js); if (!rows.length) { toast(t('dv_none_incomplete')); return; }
        if (fd.action === 'filter') { const set = new Set(rows); tx(t('dv_a_filter'), d => { const m = new Uint8Array(d.n); for (let i = 0; i < d.n; i++) m[i] = set.has(i) ? 0 : 1; d.filter = { expr: t('dv_complete_cases'), mask: m, ver: Date.now() }; }); }
        else tx(t('dv_a_listwise'), d => { X.deleteRows(d, rows); });
      }
    });
    function incomplete(js) { const vs = js.map(j => D().vars[j]), out = []; for (let i = 0; i < D().n; i++) if (vs.some(v => X.isMissing(v, v.values[i]))) out.push(i); return out; }

    // ---- math transforms
    OPEN.math = () => dialog({
      title: t('dv_a_math'), doc: 'boxcox', desc: t('dv_math_note'),
      body: varSel('vars', { multiple: true, filter: v => v.type === 'numeric', value: curVar(), size: 8 }) + `<div class="row2">${selField('fn', ['ln', 'log10', 'sqrt', 'inverse', 'square', 'exp', 'boxcox'], 'ln', 'dv_f_function')}${numField('lambda', 0.5, 'dv_f_lambda')}</div>`,
      preview: fd => { const js = idxs(fd.vars); if (!js.length) return ''; const v = D().vars[js[0]], a = nview(v), out = X.mathTransform(a, fd.fn, +fd.lambda), lost = countValid(a) - countValid(out); return (lost ? `<p class="warn">${esc(t('dv_math_lost', { n: lost }))}</p>` : '') + previewTable([v.name, (fd.fn === 'boxcox' ? 'bc' : fd.fn) + '_' + v.name], [a, out]); },
      apply: fd => { const js = idxs(fd.vars); if (!js.length) { toast(t('dv_need_vars'), 'bad'); return false; } if (fd.fn === 'boxcox' && !isFinite(parseFloat(fd.lambda))) { toast(t('dv_need_value'), 'bad'); return false; } tx(t('dv_a_math'), d => { js.map(j => d.vars[j]).forEach(v => newVarAfter(d, d.vars.indexOf(v), (fd.fn === 'boxcox' ? 'bc' : fd.fn) + '_' + v.name, X.mathTransform(nview(v), fd.fn, +fd.lambda), { label: t('dv_o_' + fd.fn) + (fd.fn === 'boxcox' ? ' (λ = ' + fd.lambda + ')' : '') + ': ' + (v.label || v.name), decimals: 4 })); }); }
    });

    // ---- lag / lead / differences
    OPEN.shift = () => dialog({
      title: t('dv_a_shift'), desc: t('dv_shift_note'),
      body: varSel('vars', { multiple: true, filter: v => v.type !== 'string', value: curVar(), size: 7 }) + `<div class="row2">${selField('kind', ['lag', 'lead', 'diff'], 'lag', 'dv_f_function')}${numField('k', 1, 'dv_f_k', ' min="1" step="1"')}</div>`,
      preview: fd => { const js = idxs(fd.vars); if (!js.length) return ''; const v = D().vars[js[0]], a = nview(v); return previewTable([v.name, fd.kind + fd.k + '_' + v.name], [a, X.shift(a, fd.kind, +fd.k || 1)]); },
      apply: fd => { const js = idxs(fd.vars); if (!js.length) { toast(t('dv_need_vars'), 'bad'); return false; } const k = Math.max(1, parseInt(fd.k, 10) || 1); tx(t('dv_a_shift'), d => { js.map(j => d.vars[j]).forEach(v => newVarAfter(d, d.vars.indexOf(v), fd.kind + k + '_' + v.name, X.shift(nview(v), fd.kind, k), { label: t('dv_o_' + fd.kind) + ' ' + k + ': ' + (v.label || v.name), decimals: v.decimals })); }); }
    });

    // ---- duplicates
    OPEN.duplicates = () => dialog({
      title: t('dv_a_duplicates'), desc: t('dv_duplicates_note'),
      body: varSel('vars', { multiple: true, value: D().vars.map((v, j) => j), size: 10, key: 'dv_f_keys' }) + selField('action', ['flag', 'delete'], 'flag', 'dv_f_action', 'dup_') + textField('name', 'duplicate', 'dv_f_newname'),
      preview: fd => { const js = idxs(fd.vars); if (!js.length) return ''; const r = X.duplicates(js.map(j => D().vars[j].values)); return `<p>${esc(t('dv_dup_found', { n: r.count }))}</p>`; },
      apply: fd => {
        const js = idxs(fd.vars); if (!js.length) { toast(t('dv_need_vars'), 'bad'); return false; }
        const r = X.duplicates(js.map(j => D().vars[j].values));
        if (fd.action === 'delete') { if (!r.count) { toast(t('dv_dup_found', { n: 0 })); return; } const rows = []; r.dup.forEach((x, i) => { if (x) rows.push(i); }); tx(t('dv_a_duplicates'), d => X.deleteRows(d, rows)); }
        else tx(t('dv_a_duplicates'), d => { newVarAfter(d, null, (fd.name || 'duplicate').trim(), r.dup, { labels: [[0, t('dv_first_case')], [1, t('dv_duplicate')]], type: 'categorical', decimals: 0, measure: 'nominal' }); newVarAfter(d, null, (fd.name || 'duplicate').trim() + '_of', r.first, { decimals: 0, label: t('dv_first_case_no') }); });
        toast(t('dv_dup_found', { n: r.count }), r.count ? 'good' : '');
      }
    });

    // ---- outliers
    OPEN.outliers = () => dialog({
      title: t('dv_a_outliers'), doc: 'mahalanobis', desc: t('dv_outliers_note'),
      body: varSel('vars', { multiple: true, filter: v => v.type === 'numeric', value: curVar(), size: 8 }) + `<div class="row2">${selField('method', ['z', 'iqr', 'mahalanobis'], 'z', 'dv_f_method', 'ol_')}${numField('k', 3, 'dv_f_threshold')}</div>` + textField('name', 'outlier', 'dv_f_newname'),
      init: body => { const m = $('[name=method]', body), k = $('[name=k]', body); m.addEventListener('change', () => { k.value = m.value === 'z' ? 3 : m.value === 'iqr' ? 1.5 : 0.001; }); },
      preview: fd => { const r = outlierFor(fd); if (!r) return ''; return `<p>${esc(t('dv_outliers_found', { n: Array.from(r.flag).filter(x => x === 1).length, all: countValid(r.flag) }))}</p>` + (r.extra ? `<p class="note">${esc(r.extra)}</p>` : ''); },
      apply: fd => {
        const r = outlierFor(fd); if (!r) { toast(t('dv_need_vars'), 'bad'); return false; }
        tx(t('dv_a_outliers'), d => {
          const nm = (fd.name || 'outlier').trim();
          newVarAfter(d, null, nm, r.flag, { labels: [[0, t('no')], [1, t('yes')]], type: 'categorical', decimals: 0, measure: 'nominal', label: t('dv_o_ol_' + fd.method) + ' (' + fd.k + ')' });
          if (r.d2) { newVarAfter(d, null, nm + '_D2', r.d2, { decimals: 4, label: 'Mahalanobis D²' }); newVarAfter(d, null, nm + '_p', r.p, { decimals: 5, label: 'p (χ², df = ' + r.df + ')' }); }
        });
      }
    });
    function outlierFor(fd) {
      const js = idxs(fd.vars); if (!js.length) return null; const cols = js.map(j => nview(D().vars[j])), k = +fd.k;
      if (fd.method === 'mahalanobis') {
        if (js.length < 2) throw Object.assign(new Error('dv_need_two'), { code: 'dv_need_two' });
        const m = X.mahalanobis(cols); return { flag: Float64Array.from(m.p, p => (p !== p ? NaN : p < k ? 1 : 0)), d2: m.d2, p: m.p, df: m.df, extra: t('dv_mah_info', { n: m.n, df: m.df, a: k }) };
      }
      const flags = cols.map(a => (fd.method === 'z' ? X.outliersZ(a, k) : X.outliersIQR(a, k)).flag), n = cols[0].length;
      const flag = new Float64Array(n); for (let i = 0; i < n; i++) { let any = 0, nan = true; flags.forEach(f => { if (f[i] === f[i]) { nan = false; if (f[i] === 1) any = 1; } }); flag[i] = nan ? NaN : any; }
      return { flag };
    }

    // ---- aggregate within groups
    OPEN.aggregate = () => dialog({
      title: t('dv_a_aggregate'), desc: t('dv_aggregate_note'),
      body: varSel('groups', { multiple: true, size: 5, key: 'dv_f_groups' }) + varSel('var', { filter: v => v.type === 'numeric', value: curVar() }) + `<div class="row2">${selField('fn', ['mean', 'sum', 'sd', 'min', 'max', 'median', 'n', 'nvalid'], 'mean', 'dv_f_function', 'ag_')}${textField('name', '', 'dv_f_newname', t('auto'))}</div>`,
      preview: fd => { const g = idxs(fd.groups), v = D().vars[+fd.var]; if (!g.length || !v) return ''; return previewTable(g.map(vname).concat([v.name, aggName(fd, v)]), g.map(j => Array.from(D().vars[j].values, x => X.format(D().vars[j], x, true))).concat([nview(v), X.aggregate(g.map(j => groupKey(D().vars[j])), nview(v), fd.fn)])); },
      apply: fd => { const g = idxs(fd.groups), v = D().vars[+fd.var]; if (!g.length || !v) { toast(t('dv_need_vars'), 'bad'); return false; } const out = X.aggregate(g.map(j => groupKey(D().vars[j])), nview(v), fd.fn); tx(t('dv_a_aggregate'), d => { newVarAfter(d, null, aggName(fd, v), out, { label: t('dv_o_ag_' + fd.fn) + ': ' + v.name + ' | ' + g.map(vname).join(', ') }); }); }
    });
    const aggName = (fd, v) => (fd.name || '').trim() || v.name + '_' + fd.fn;
    const groupKey = v => (isStr(v) ? v.values : Array.from(v.values, x => (X.isMissing(v, x) ? NaN : x)));

    // ---- sort cases
    OPEN.sort = () => {
      const key = (j, desc) => `<div class="sortkey"><select class="sk" aria-label="${esc(t('variable'))}">${D().vars.map((v, q) => `<option value="${q}"${q === j ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select><select class="sd" aria-label="${esc(t('dv_f_order'))}"><option value="asc">${esc(t('dv_o_asc'))}</option><option value="desc"${desc ? ' selected' : ''}>${esc(t('dv_o_desc'))}</option></select><button type="button" class="mini x" data-skrm aria-label="${esc(t('remove'))}">×</button></div>`;
      dialog({
        title: t('dv_a_sort'), desc: t('dv_sort_note'),
        body: `<div class="sortkeys">${key(curVar(), false)}</div><p><button type="button" data-skadd>＋ ${esc(t('dv_add_key'))}</button></p>`,
        init: body => body.addEventListener('click', e => { if (e.target.closest('[data-skadd]')) $('.sortkeys', body).insertAdjacentHTML('beforeend', key(0, false)); if (e.target.closest('[data-skrm]') && $$('.sortkey', body).length > 1) e.target.closest('.sortkey').remove(); }),
        apply: (fd, body) => { const keys = $$('.sortkey', body).map(r => ({ j: +$('.sk', r).value, desc: $('.sd', r).value === 'desc' })); tx(t('dv_a_sort'), d => X.sortCases(d, keys)); }
      });
    };

    // ---- select cases (filter)
    OPEN.filter = () => {
      const d = D(), ops = ['=', '<>', '<', '<=', '>', '>='];
      dialog({
        title: t('dv_a_filter'), desc: t('dv_filter_note'),
        body: `<div class="cond">${varSelInline()}<select class="cop" aria-label="${esc(t('dv_operator'))}">${ops.map(o => `<option>${esc(o)}</option>`).join('')}</select><input class="cval" aria-label="${esc(t('value'))}" dir="auto"><button type="button" data-cadd="and">${esc(t('dv_add_and'))}</button><button type="button" data-cadd="or">${esc(t('dv_add_or'))}</button></div>
          ${lab('dv_f_condition', `<textarea name="expr" rows="3" dir="ltr" spellcheck="false" placeholder="gender = 'female' and age >= 30">${esc(d.filter ? d.filter.expr : '')}</textarea>`)}` + selField('action', ['filter', 'delete'], 'filter', 'dv_f_unselected', 'un_'),
        init: body => body.addEventListener('click', e => {
          const b = e.target.closest('[data-cadd]'); if (!b) return;
          const v = D().vars[+$('.cvar', body).value], raw = $('.cval', body).value.trim(), ta = $('textarea', body);
          const val = isStr(v) || (v.labels.length && X.parseNumber(raw) === undefined) || v.type === 'date' ? `'${raw.replace(/'/g, "\\'")}'` : raw || '0';
          const nm = /^[\p{L}_][\p{L}\p{N}_.]*$/u.test(v.name) ? v.name : '`' + v.name + '`';
          ta.value = (ta.value.trim() ? ta.value.trim() + ' ' + b.dataset.cadd + ' ' : '') + `${nm} ${$('.cop', body).value} ${val}`; ta.dispatchEvent(new Event('input', { bubbles: true }));
        }),
        preview: fd => { if (!fd.expr.trim()) return ''; const m = X.conditionMask(D(), fd.expr), k = m.reduce((a, b) => a + b, 0); return `<p><b>${esc(t('dv_filter_count', { n: k, all: D().n }))}</b></p>`; },
        apply: fd => {
          if (!fd.expr.trim()) { if (D().filter) act('unfilter'); return; }
          const m = X.conditionMask(D(), fd.expr), k = m.reduce((a, b) => a + b, 0);
          if (fd.action === 'delete') { if (!confirm(t('dv_confirm_delcases', { n: D().n - k }))) return false; const rows = []; m.forEach((x, i) => { if (!x) rows.push(i); }); tx(t('dv_a_filter'), dd => X.deleteRows(dd, rows)); }
          else tx(t('dv_a_filter'), dd => { dd.filter = { expr: fd.expr.trim(), mask: m, ver: Date.now() }; });
          toast(t('dv_filter_count', { n: k, all: D().n }), 'good');
        }
      });
    };
    const varSelInline = () => `<select class="cvar" aria-label="${esc(t('variable'))}">${D().vars.map((v, j) => `<option value="${j}"${j === curVar() ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select>`;

    // ---- find & replace (modeless: the grid stays visible)
    OPEN.find = () => {
      st.find.at = -1;
      dialog({
        title: t('dv_a_find'), modeless: true, ok: 'dv_find_next', cancel: 'close',
        body: `<div class="row2">${textField('text', st.find.text || '', 'dv_f_find')}${textField('with', st.find.with || '', 'dv_f_replace')}</div>${selField('scope', ['all', 'current'], st.find.scope || 'all', 'dv_f_scope')}${check('matchCase', !!st.find.matchCase, 'dv_f_matchcase')}${check('whole', !!st.find.whole, 'dv_f_whole')}`,
        extra: `<button type="button" data-x="replace">${esc(t('dv_replace'))}</button><button type="button" data-x="all">${esc(t('dv_replace_all'))}</button>`,
        preview: fd => { Object.assign(st.find, fd); st.find.at = -1; if (!fd.text) return ''; const hits = hitsFor(fd); return `<p>${esc(t('dv_found_n', { n: hits.length }))}</p>`; },
        apply: fd => { Object.assign(st.find, fd); const hits = hitsFor(fd); if (!hits.length) { toast(t('dv_found_n', { n: 0 }), 'bad'); return false; } const s0 = st.sel; let i = hits.findIndex(h => h.r > s0.r || (h.r === s0.r && h.c > s0.c)); if (i < 0) i = 0; if (st.tab !== 'data') { st.tab = 'data'; render(st.el); } moveTo(hits[i].r, hits[i].c); return false; },
        onExtra: (x, fd) => {
          Object.assign(st.find, fd); const hits = hitsFor(fd); if (!hits.length) { toast(t('dv_found_n', { n: 0 }), 'bad'); return; }
          const targets = x === 'all' ? hits : hits.filter(h => h.r === st.sel.r && h.c === st.sel.c).slice(0, 1);
          if (!targets.length) { toast(t('dv_find_first'), 'bad'); return; }
          let bad = 0;
          tx(t('dv_replace'), (dd, set) => { targets.forEach(h => { const v = dd.vars[h.c], txt = X.replaceText(v, v.values[h.r], fd, st.labels), p = X.parseCell(v, txt); if (p.error) { bad++; return; } if (p.label) v.labels.push(p.label); set(v, h.r, p.value); }); });
          toast(t('dv_replaced_n', { n: targets.length - bad }) + (bad ? ' · ' + t('dv_bad_cells', { n: bad }) : ''), bad ? 'bad' : 'good');
        }
      });
    };
    const hitsFor = fd => X.findCells(D(), { text: fd.text, vars: fd.scope === 'current' ? [curVar()] : null, matchCase: fd.matchCase, whole: fd.whole, labels: st.labels });

    // ---- go to case / variable
    OPEN.goto = () => dialog({
      title: t('dv_a_goto'),
      body: `<div class="row2">${numField('case', st.sel.r + 1, 'dv_f_case', ` min="1" max="${D().n}" step="1"`)}${varSel('var', { value: curVar(), key: 'variable' })}</div>`,
      apply: fd => { const r = Math.max(1, Math.min(D().n, parseInt(fd.case, 10) || 1)) - 1; if (st.tab !== 'data') { st.tab = 'data'; render(st.el); } moveTo(r, +fd.var); }
    });

    // ---- merge files / transpose
    function readDataFile(file) {
      return new Promise((resolve, reject) => {
        const ext = file.name.split('.').pop().toLowerCase(), fr = new FileReader();
        fr.onerror = () => reject(new Error('csv_empty'));
        fr.onload = async () => {
          try {
            if (ext === 'sav') { const r = window.YPIO.readSAV(fr.result); resolve(X.fromVars(r.vars, r.n)); }
            else if (ext === 'xlsx') resolve(X.fromDS(A.E.parseCSV(await window.YPIO.xlsxToCSV(fr.result))));
            else resolve(X.fromDS(A.E.parseCSV(new TextDecoder('utf-8').decode(fr.result))));
          } catch (e) { reject(e); }
        };
        fr.readAsArrayBuffer(file);
      });
    }
    function mergeDialog(kind) {
      let B = null;
      dialog({
        title: t('dv_a_' + kind), desc: t('dv_' + kind + '_note'),
        body: `<label>${esc(t('dv_f_file'))}<input type="file" class="mfile" accept=".csv,.txt,.tsv,.xlsx,.sav"></label>` + (kind === 'mergevars' ? `<div class="row2">${varSel('keyA', { key: 'dv_f_keya' })}<label>${esc(t('dv_f_keyb'))}<select name="keyB"></select></label></div>` : ''),
        init: (body, upd) => $('.mfile', body).addEventListener('change', async e => {
          const f = e.target.files[0]; if (!f) return;
          try { B = await readDataFile(f); } catch (err) { B = null; toast(t('csv_error') + ': ' + errText(err), 'bad'); return; }
          const kb = $('[name=keyB]', body); if (kb) { const ka = D().vars[+$('[name=keyA]', body).value]; kb.innerHTML = B.vars.map((v, j) => `<option value="${j}"${ka && v.name.toLowerCase() === ka.name.toLowerCase() ? ' selected' : ''}>${esc(v.name)}</option>`).join(''); }
          upd();
        }),
        preview: () => {
          if (!B) return `<p class="note">${esc(t('dv_choose_file'))}</p>`;
          if (kind === 'mergecases') { const have = new Set(D().vars.map(v => v.name.toLowerCase())), same = B.vars.filter(v => have.has(v.name.toLowerCase())).length; return `<p>${esc(t('dv_mergecases_info', { n: B.n, k: B.vars.length, m: same }))}</p>`; }
          return `<p>${esc(t('dv_mergevars_info', { n: B.n, k: B.vars.length - 1 }))}</p>`;
        },
        apply: fd => {
          if (!B) { toast(t('dv_choose_file'), 'bad'); return false; }
          if (kind === 'mergecases') tx(t('dv_a_mergecases'), d => X.mergeCases(d, B));
          else { let r; tx(t('dv_a_mergevars'), d => { r = X.mergeVars(d, B, +fd.keyA, +fd.keyB); }); if (r) toast(t('dv_merged', { k: r.added, m: r.matched, n: D().n }), 'good'); }
          layout();
        }
      });
    }
    OPEN.mergecases = () => mergeDialog('mergecases');
    OPEN.mergevars = () => mergeDialog('mergevars');
    OPEN.transpose = () => dialog({
      title: t('dv_a_transpose'), desc: t('dv_transpose_note'),
      body: varSel('names', { none: true, key: 'dv_f_casenames' }),
      apply: fd => {
        if (D().n > 5000) { toast(t('dv_too_big'), 'bad'); return false; }
        tx(t('dv_a_transpose'), d => { const T = X.transpose(d, fd.names === '' ? null : +fd.names); d.n = T.n; d.vars = T.vars; d.filter = null; });
        resetSel(); layout(); refresh();
      }
    });
    OPEN.labels = () => { const c = curVar(); if (c >= 0) valueLabelsDialog(c); };
    OPEN.varprops = () => act('varprops');

    // ------------------------------------------------------------ public
    return {
      render, refresh, open, addVariables, undo, redo,
      reset: () => { st.undo = []; st.redo = []; st.bytes = 0; st.sel = null; st.edit = null; st.tab = 'data'; },
      state: st
    };
  }
  window.YPDataView = { create };
})();
