/* YouPls application: data, model, analyses and reports. */
(function () {
  'use strict';
  const E = window.YPEngine, C = window.YPCharts, I18N = window.YPI18N;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = C.esc;
  const STORE = 'youpls.project.v1', PREF = 'youpls.prefs.v1';

  const S = {
    name: 'Untitled', csv: '', dataName: '', ds: null, desc: null,
    settings: Object.assign({}, E.DEFAULTS), results: {}, view: 'data', current: null, section: null,
    selCols: [], lang: 'ar', theme: 'auto', showResults: true, dataSel: null,
    ap: { palette: 'theme', decimals: 3, uiFont: 'system', uiScale: 100 }, help: 'start',
    models: [], cur: 0, history: [], fromMatrix: null, cmp: null
  };

  // ---------------------------------------------------------------- i18n
  function t(k, v) {
    let s = (I18N[S.lang] && I18N[S.lang][k]) || I18N.en[k] || k;
    if (v) Object.keys(v).forEach(x => { s = s.split('{' + x + '}').join(v[x]); });
    return s;
  }
  function applyLang() {
    document.documentElement.lang = S.lang; document.documentElement.dir = S.lang === 'ar' ? 'rtl' : 'ltr';
    $$('[data-i]').forEach(el => { el.textContent = t(el.dataset.i); });
    $$('[data-it]').forEach(el => { el.title = t(el.dataset.it); el.setAttribute('aria-label', t(el.dataset.it)); });
    $$('[data-ip]').forEach(el => { el.placeholder = t(el.dataset.ip); });
    $('#lang').textContent = S.lang === 'ar' ? 'English' : 'العربية';
  }
  function prefs(save) {
    try {
      if (save) localStorage.setItem(PREF, JSON.stringify({ lang: S.lang, theme: S.theme, uiFont: S.ap.uiFont, uiScale: S.ap.uiScale }));
      else { const p = JSON.parse(localStorage.getItem(PREF) || '{}'); if (p.lang) S.lang = p.lang; if (p.theme) S.theme = p.theme; if (p.uiFont) S.ap.uiFont = p.uiFont; if (p.uiScale) S.ap.uiScale = +p.uiScale; }
    } catch (e) { /* storage unavailable */ }
  }
  function applyTheme() { if (S.theme === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = S.theme; }

  // ------------------------------------------------------------ utilities
  const f = (v, d) => { if (v === null || v === undefined || !isFinite(v)) return '–'; const k = d === undefined ? S.ap.decimals : d, out = Number(v).toFixed(k); return /^-0\.?0*$/.test(out) ? out.slice(1) : out; };
  const fp = v => (!isFinite(v)) ? '–' : (v < 0.001 ? '0.000' : v.toFixed(3));
  const stars = p => !isFinite(p) ? '' : p < 0.001 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : '';
  function toast(msg, kind) {
    const el = document.createElement('div'); el.className = 'toast ' + (kind || ''); el.textContent = msg;
    $('#toasts').appendChild(el); setTimeout(() => el.classList.add('out'), 3800); setTimeout(() => el.remove(), 4300);
  }
  function download(name, text, type) {
    const blob = text instanceof Blob ? text : new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const csvCell = v => { const s = v === null || v === undefined ? '' : String(v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const toCSV = (head, rows) => '﻿' + [head].concat(rows).map(r => r.map(csvCell).join(',')).join('\n');
  // ASCII-only file names: some browsers silently replace non-ASCII names with "download"
  const slug = s => String(s).normalize('NFKD').replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'youpls';

  // Tables are registered so their CSV can be exported.
  const TABLES = new Map(); let tableSeq = 0;
  function table(head, rows, o) {
    o = o || {};
    const id = 'tb' + (++tableSeq);
    const rawRows = rows.map(r => r.map(c => (c && typeof c === 'object' && 'v' in c) ? c.raw !== undefined ? c.raw : c.v : c));
    TABLES.set(id, { title: o.title || 'table', csv: toCSV(head, rawRows), head, rows: rawRows });
    let h = `<div class="tablewrap"><table class="grid${o.cls ? ' ' + o.cls : ''}" id="${id}"><thead><tr>${head.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>`;
    rows.forEach((r, i) => {
      h += `<tr${o.rowAttr ? ' ' + o.rowAttr(i) : ''}>` + r.map((c, j) => {
        if (c && typeof c === 'object' && 'v' in c) return `<td class="${c.cls || ''}${j ? ' num' : ''}">${esc(c.v)}</td>`;
        return j === 0 ? `<th scope="row">${esc(c)}</th>` : `<td class="num">${esc(c)}</td>`;
      }).join('') + '</tr>';
    });
    return h + '</tbody></table></div>';
  }
  const cell = (v, cls, raw) => ({ v, cls, raw });
  let chartSeq = 0;
  function chart(svg, title) {
    if (!svg) return '';
    const id = 'ch' + (++chartSeq);
    return `<figure class="chartbox" id="${id}" data-title="${esc(title || 'chart')}">${svg}<figcaption><button class="mini" data-act="svg">SVG</button><button class="mini" data-act="png">PNG</button></figcaption></figure>`;
  }
  function card(title, body, opts) {
    opts = opts || {};
    const tbls = (body.match(/id="tb\d+"/g) || []).map(x => x.slice(4, -1));
    const btn = tbls.length ? `<span class="cardtools">${tbls.map(id => `<button class="mini" data-csv="${id}" title="${esc(t('csv'))}">CSV</button><button class="mini" data-copy="${id}">${esc(t('copy'))}</button>`).join('')}</span>` : '';
    const doc = opts.doc ? `<button class="mini" data-doc="${opts.doc}" title="${esc(t('method_ref'))}">📖</button>` : '';
    return `<section class="card"><header><h3>${esc(title)}</h3>${doc}${btn}</header>${opts.note ? `<p class="note">${opts.note}</p>` : ''}${body}</section>`;
  }

  // ---------------------------------------------------------- persistence
  function syncModel() { if (!S.models.length) S.models = [{ name: t('model') + ' 1', model: editor.model }]; S.models[S.cur].model = editor.model; }
  function projectJSON(full) {
    syncModel();
    const p = { format: 'youpls', version: 2, name: S.name, data: { name: S.dataName, csv: S.csv, fromMatrix: S.fromMatrix }, model: editor.model, models: S.models, cur: S.cur, settings: S.settings, view: editor.view, appearance: { palette: S.ap.palette, decimals: S.ap.decimals } };
    if (full) { // reports are saved in the project file (not in the browser autosave); history entries that are current results are stored as references
      p.results = S.results;
      p.history = S.history.map(h => { const k = Object.keys(S.results).find(q => S.results[q] === h.r); return k ? { id: h.id, label: h.label, ref: k } : h; });
    }
    return p;
  }
  let saveTimer = null;
  function autosave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORE, JSON.stringify(projectJSON())); } catch (e) { /* too large or blocked: ignore */ }
    }, 400);
  }
  function loadProject(p) {
    if (!p || p.format !== 'youpls') throw new Error(t('bad_project'));
    S.name = p.name || 'Untitled'; $('#pname').value = S.name;
    S.settings = Object.assign({}, E.DEFAULTS, p.settings || {});
    S.results = p.results || {}; S.history = (p.history || []).map(h => (h.ref ? { id: h.id, label: h.label, r: S.results[h.ref] } : h)).filter(h => h.r); S.current = null; S.cmp = null;
    S.fromMatrix = (p.data && p.data.fromMatrix) || null;
    if (p.data && p.data.csv) setData(p.data.csv, p.data.name, true); else { S.csv = ''; S.ds = null; S.dataName = ''; }
    if (p.appearance) { S.ap.palette = p.appearance.palette || 'theme'; S.ap.decimals = isFinite(p.appearance.decimals) ? +p.appearance.decimals : 3; applyAppearance(); }
    S.models = p.models && p.models.length ? p.models : [{ name: t('model') + ' 1', model: p.model }]; S.cur = Math.min(p.cur || 0, S.models.length - 1);
    editor.history = []; editor.setModel(S.models[S.cur].model);
    if (p.view) editor.view = p.view;
    editor.render(); refreshAll();
  }

  // ------------------------------------------------------------------ data
  function setData(text, name, quiet) {
    let ds;
    try { ds = E.parseCSV(text); } catch (e) { toast(t('csv_error') + ': ' + e.message, 'bad'); return false; }
    S.csv = text; S.ds = ds; S.dataName = name || 'data.csv'; S.desc = E.describe(ds); S.dataSel = null;
    if (!quiet) { toast(t('data_loaded', { n: ds.n, k: ds.names.length })); autosave(); }
    refreshAll(); return true;
  }
  function renderData() {
    const el = $('#dataview');
    if (!S.ds) { el.innerHTML = welcome(); return; }
    const ds = S.ds, d = S.desc;
    let h = `<div class="datahead"><h2>${esc(S.dataName)}</h2>${S.fromMatrix ? `<span class="pill warn">${t('from_matrix', { n: S.fromMatrix.n })}</span>` : ''}<span class="grow"></span><button data-act="groups">${t('define_groups')}</button><button data-act="covimport">${t('import_cov')}</button></div><div class="datahead"><span class="pill">${t('rows')}: ${ds.n}</span><span class="pill">${t('variables')}: ${ds.names.length}</span><span class="pill">${t('missing')}: ${d.reduce((a, x) => a + x.missing, 0)}</span></div>`;
    const descRows = d.map(x => [x.name, x.kind === 'cat' ? t('categorical') : t('numeric'), x.n, x.missing, f(x.mean), f(x.median), f(x.min), f(x.max), f(x.sd), f(x.kurtosis), f(x.skewness)]);
    h += card(t('descriptives'), `<p class="note">${t('click_var')}</p>` + table([t('variable'), t('type'), 'N', t('missing'), t('mean'), t('median'), t('min'), t('max'), t('sd'), t('kurtosis'), t('skewness')], descRows, { title: 'descriptives', cls: 'clickable', rowAttr: i => `data-var="${i}"` }), { doc: 'descriptives' });
    if (S.dataSel !== null) {
      const j = S.dataSel, v = Array.from(ds.cols[j]).filter(x => !isNaN(x));
      let extra = '';
      if (ds.kinds[j] === 'cat') {
        const counts = ds.labels[j].map((l, q) => ({ label: l, value: v.filter(x => x === q + 1).length }));
        extra = chart(C.bars(counts, { title: ds.names[j] }), ds.names[j]);
      } else extra = chart(C.histogram(v, { title: ds.names[j], marks: [{ value: E.mean(v), label: t('mean') }] }), ds.names[j]);
      h += card(t('distribution') + ': ' + ds.names[j], extra);
    }
    const num = ds.names.map((n, j) => j).filter(j => ds.kinds[j] === 'num').slice(0, 40);
    if (num.length > 1) {
      const R = num.map(a => num.map(b => {
        const x = [], y = []; for (let i = 0; i < ds.n; i++) { const p = ds.cols[a][i], q = ds.cols[b][i]; if (!isNaN(p) && !isNaN(q)) { x.push(p); y.push(q); } }
        return a === b ? 1 : E.corr(x, y);
      }));
      const names = num.map(j => ds.names[j]);
      h += card(t('correlations'), chart(C.heatmap(names, names, R, { lower: true }), 'correlations') + table([''].concat(names), names.map((n, i) => [n].concat(R[i].map(x => f(x)))), { title: 'correlations' }));
    }
    const prev = Math.min(ds.n, 200);
    const rows = []; for (let i = 0; i < prev; i++) rows.push([String(i + 1)].concat(ds.cols.map((c, j) => isNaN(c[i]) ? '' : ds.kinds[j] === 'cat' ? ds.labels[j][c[i] - 1] : c[i])));
    h += card(t('preview', { n: prev }), table(['#'].concat(ds.names), rows, { title: 'data' }));
    el.innerHTML = h;
  }
  function welcome() {
    return `<div class="welcome"><img src="assets/logo.svg" alt="" width="84" height="84"><h1>YouPls</h1><p>${t('tagline')}</p>
      <div class="actions"><button class="primary" data-act="example">${t('load_example')}</button><button data-act="import">${t('import_csv')}</button><button data-act="open">${t('open_project')}</button><button data-act="covimport">${t('import_cov')}</button></div>
      <ol class="steps"><li>${t('step1')}</li><li>${t('step2')}</li><li>${t('step3')}</li><li>${t('step4')}</li></ol></div>`;
  }

  // ------------------------------------------------------ indicator list
  function owners() {
    const o = {}; editor.model.constructs.forEach(c => c.indicators.forEach(n => { (o[n] = o[n] || []).push(c.name); })); return o;
  }
  function renderIndicators() {
    const el = $('#indlist'), q = ($('#indsearch').value || '').toLowerCase();
    if (!S.ds) { el.innerHTML = `<p class="note">${t('no_data')}</p>`; return; }
    const own = owners();
    el.innerHTML = S.ds.names.map((n, j) => {
      if (S.ds.kinds[j] !== 'num' || (q && !n.toLowerCase().includes(q))) return '';
      const sel = S.selCols.includes(n);
      return `<li draggable="true" data-col="${esc(n)}" class="${sel ? 'sel' : ''}${own[n] ? ' used' : ''}" tabindex="0"><span>${esc(n)}</span>${own[n] ? `<small>${esc(own[n].join(', '))}</small>` : ''}</li>`;
    }).join('');
  }

  // ------------------------------------------------------ properties panel
  function renderProps() {
    const el = $('#props'), s = editor.sel, m = editor.model;
    editor._elSnap = false;
    if (!s) {
      const errs = S.ds ? E.validate(m, S.ds) : [];
      el.innerHTML = `<h3>${t('model')}</h3><p class="note">${t('model_summary', { c: m.constructs.length, p: m.paths.length, i: m.interactions.length })}</p>
        ${errs.length ? `<ul class="errs">${errs.map(e => `<li>${esc(errText(e))}</li>`).join('')}</ul>` : (m.constructs.length ? `<p class="ok">${t('model_ok')}</p>` : '')}
        <p class="note">${t('hint_editor')}</p><button data-act="prefix">${t('auto_prefix')}</button>`;
      return;
    }
    if (s.type === 'construct') {
      const c = editor.byId(s.id); if (!c) return;
      el.innerHTML = `<h3>${t('construct')}</h3>
        <label>${t('name')}<input id="p_name" value="${esc(c.name)}"></label>
        <label>${t('measurement')}<select id="p_mode"><option value="A"${c.mode === 'A' ? ' selected' : ''}>${t('mode_a')}</option><option value="B"${c.mode === 'B' ? ' selected' : ''}>${t('mode_b')}</option></select></label>
        <label>${t('ind_side')}<select id="p_side">${['left', 'right', 'top', 'bottom'].map(x => `<option value="${x}"${c.side === x ? ' selected' : ''}>${t('side_' + x)}</option>`).join('')}</select></label>
        <h4>${t('indicators')} (${c.indicators.length})</h4>
        <ul class="chips">${c.indicators.map(n => `<li>${esc(n)}<button class="x" data-rmind="${esc(n)}" aria-label="${t('remove')}">×</button></li>`).join('') || `<li class="note">${t('drop_here')}</li>`}</ul>
        <button data-act="assign" ${S.selCols.length ? '' : 'disabled'}>${t('assign_selected', { n: S.selCols.length })}</button>
        ${elStyleHTML(s)}
        <button class="danger" data-act="delete">${t('delete')}</button>`;
      $('#p_name').addEventListener('change', e => { const v = e.target.value.trim(); if (!v) return; if (m.constructs.some(o => o !== c && o.name === v)) { toast(t('name_taken'), 'bad'); e.target.value = c.name; return; } editor.snapshot(); c.name = v; editor.changed(); });
      $('#p_mode').addEventListener('change', e => { editor.snapshot(); c.mode = e.target.value; editor.changed(); });
      $('#p_side').addEventListener('change', e => { editor.snapshot(); c.side = e.target.value; editor.changed(); });
    } else if (s.type === 'path') {
      const p = m.paths.find(x => x.id === s.id); if (!p) return;
      const a = editor.byId(p.from), b = editor.byId(p.to);
      const mods = m.constructs.filter(c => c.id !== p.from && c.id !== p.to);
      el.innerHTML = `<h3>${t('path')}</h3><p><b>${esc(a.name)}</b> → <b>${esc(b.name)}</b></p>
        <h4>${t('moderation')}</h4><p class="note">${t('moderation_note')}</p>
        <label>${t('moderator')}<select id="p_mod">${mods.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
        <button data-act="addmod" ${mods.length ? '' : 'disabled'}>${t('add_moderator')}</button>
        <h4>${t('nonlinear')}</h4><p class="note">${t('quadratic_hint')}</p><button data-act="addquad">${t('add_quadratic')}</button>
        ${elStyleHTML(s)}
        <button class="danger" data-act="delete">${t('delete')}</button>`;
    } else if (s.type === 'inter') {
      const it = editor.byId(s.id); if (!it) return;
      el.innerHTML = `<h3>${t('interaction')}</h3><label>${t('name')}<input id="p_iname" value="${esc(it.name)}"></label>
        <p class="note">${t('two_stage')}</p><button class="danger" data-act="delete">${t('delete')}</button>`;
      $('#p_iname').addEventListener('change', e => { const v = e.target.value.trim(); if (!v) return; editor.snapshot(); it.name = v; editor.changed(); });
    } else if (s.type === 'indicator') {
      el.innerHTML = `<h3>${t('indicator')}</h3><p><b>${esc(s.name)}</b></p><button class="danger" data-act="delete">${t('remove_from_construct')}</button>`;
    }
  }
  function errText(e) { return t('err_' + e.code, { name: e.name || '' }); }

  // ------------------------------------------------------------- analyses
  const TASKS = {
    pls: { title: 'an_pls', fields: ['scheme', 'missing', 'maxIter', 'consistent', 'weightVar'] },
    plsc: { title: 'an_plsc', task: 'pls', fields: ['scheme', 'missing', 'maxIter', 'weightVar'], preset: { consistent: true } },
    bootstrap: { title: 'an_bootstrap', fields: ['samples', 'ci', 'test', 'alpha', 'seed', 'scheme', 'missing', 'consistent', 'weightVar'] },
    blindfolding: { title: 'an_blindfolding', fields: ['distance', 'scheme', 'missing'] },
    predict: { title: 'an_predict', fields: ['folds', 'reps', 'seed', 'scheme', 'missing'] },
    ipma: { title: 'an_ipma', fields: ['target', 'scaleMin', 'scaleMax', 'scheme', 'missing'] },
    mga: { title: 'an_mga', fields: ['groupVar', 'permutations', 'bootSamples', 'seed', 'scheme', 'missing', 'consistent'] },
    nca: { title: 'an_nca', fields: ['permutations', 'scheme', 'missing'] },
    regression: { title: 'an_regression', fields: ['regY', 'regX', 'regBoot', 'seed'], noModel: true },
    cca: { title: 'an_cca', fields: ['samples', 'seed', 'scheme', 'missing'] },
    cbsemmg: { title: 'an_cbsemmg', fields: ['groupVar', 'missing'] },
    compare: { title: 'an_compare', fields: ['cmpMethod', 'scheme', 'missing'], noModel: true },
    cbsem: { title: 'an_cbsem', fields: ['cbBoot', 'seed', 'missing'] },
    gsca: { title: 'an_gsca', fields: ['samples', 'seed', 'missing'] },
    cvpat: { title: 'an_cvpat', fields: ['folds', 'reps', 'seed', 'scheme', 'missing'] },
    logistic: { title: 'an_logistic', fields: ['logY', 'logX'], noModel: true },
    samplesize: { title: 'an_samplesize', fields: ['ssPmin', 'ssAlpha', 'ssPower'], noModel: true, noData: true },
    fimix: { title: 'an_fimix', fields: ['maxK', 'K', 'starts', 'seed', 'scheme', 'missing'] },
    pos: { title: 'an_pos', fields: ['K', 'starts', 'seed', 'scheme', 'missing'] },
    cta: { title: 'an_cta', fields: ['samples', 'alpha', 'seed', 'missing'] },
    copula: { title: 'an_copula', fields: ['samples', 'seed', 'scheme', 'missing'] },
    process: { title: 'an_process', fields: ['pmodel', 'procX', 'procM', 'procW', 'procY', 'samples', 'seed', 'center'], noModel: true }
  };
  const DEF = { samples: 5000, ci: 'percentile', test: 'two', alpha: 0.05, seed: 1, distance: 7, folds: 10, reps: 10, permutations: 1000, scaleMin: '', scaleMax: '', maxK: 4, K: 2, starts: 10, pmodel: 4, center: true, weightVar: '', bootSamples: 1000, cbBoot: 0, ssPmin: 0.2, ssAlpha: 0.05, ssPower: 0.8, regBoot: 0, cmpMethod: 'pls' };
  function fieldHTML(k, task) {
    const st = Object.assign({}, S.settings, DEF, S['last_' + task] || {});
    const num = (min, max, step) => `<input type="number" name="${k}" value="${esc(st[k])}" min="${min}" max="${max}" step="${step || 1}">`;
    const opt = (vals) => `<select name="${k}">${vals.map(v => `<option value="${v}"${String(st[k]) === String(v) ? ' selected' : ''}>${t('opt_' + v)}</option>`).join('')}</select>`;
    let ctrl;
    switch (k) {
      case 'scheme': ctrl = opt(['path', 'factor', 'centroid']); break;
      case 'missing': ctrl = opt(['mean', 'casewise']); break;
      case 'maxIter': ctrl = num(10, 100000); break;
      case 'consistent': return `<label class="check"><input type="checkbox" name="consistent"${st.consistent ? ' checked' : ''}> ${t('f_consistent')}</label>`;
      case 'samples': ctrl = num(50, 100000, 50); break;
      case 'ci': ctrl = opt(['percentile', 'bca']); break;
      case 'test': ctrl = opt(['two', 'one']); break;
      case 'alpha': ctrl = num(0.001, 0.5, 'any'); break;
      case 'seed': ctrl = num(0, 2147483647); break;
      case 'distance': ctrl = num(5, 25); break;
      case 'folds': ctrl = num(2, 50); break;
      case 'reps': ctrl = num(1, 100); break;
      case 'permutations': ctrl = num(20, 100000, 10); break;
      case 'scaleMin': case 'scaleMax': ctrl = `<input type="number" name="${k}" value="${esc(st[k])}" placeholder="${t('auto')}">`; break;
      case 'target': {
        // default: a final outcome (endogenous construct without successors)
        const endo = editor.model.constructs.filter(c => editor.model.paths.some(p => p.to === c.id));
        const fin = endo.filter(c => !editor.model.paths.some(p => p.from === c.id)).map(c => c.id);
        const pick = endo.some(c => c.id === st.target) ? st.target : fin[fin.length - 1];
        ctrl = `<select name="target">${endo.map(c => `<option value="${c.id}"${c.id === pick ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`; break;
      }
      case 'groupVar': {
        const cats = S.ds.names.filter((n, j) => { const v = new Set(Array.from(S.ds.cols[j]).filter(x => !isNaN(x))); return v.size >= 2 && v.size <= 12; });
        ctrl = `<select name="groupVar">${cats.map(n => `<option>${esc(n)}</option>`).join('')}</select>`;
        return `<label>${t('f_groupVar')}${ctrl}</label><div id="groupPick"></div>`;
      }
      case 'bootSamples': ctrl = num(0, 100000, 1); break;
      case 'regBoot': ctrl = num(0, 100000, 1); break;
      case 'cmpMethod': ctrl = `<select name="cmpMethod">${['pls', 'cbsem'].map(v => `<option value="${v}"${st.cmpMethod === v ? ' selected' : ''}>${t('cmp_' + v)}</option>`).join('')}</select><small>${t('cmp_models_hint', { n: S.models.length })}</small>`; break;
      case 'cbBoot': ctrl = num(0, 100000, 1); break;
      case 'ssPmin': ctrl = num(0.01, 1, 'any'); break;
      case 'ssAlpha': ctrl = `<select name="ssAlpha">${[0.01, 0.05, 0.1].map(v => `<option${+st.ssAlpha === v ? ' selected' : ''}>${v}</option>`).join('')}</select>`; break;
      case 'ssPower': ctrl = `<select name="ssPower">${[0.8, 0.9, 0.95].map(v => `<option${+st.ssPower === v ? ' selected' : ''}>${v}</option>`).join('')}</select>`; break;
      case 'logY': { const bin = S.ds.names.filter((n, j) => new Set(Array.from(S.ds.cols[j]).filter(x => !isNaN(x))).size === 2); ctrl = `<select name="logY">${bin.map(v => `<option>${esc(v)}</option>`).join('')}</select><small>${t('binary_hint')}</small>`; break; }
      case 'logX': ctrl = `<select name="logX" multiple size="8">${processVars().map(v => `<option>${esc(v)}</option>`).join('')}</select><small>${t('multi_hint')}</small>`; break;
      case 'maxK': ctrl = num(2, 10); break;
      case 'K': ctrl = num(2, 10); break;
      case 'starts': ctrl = num(1, 100); break;
      case 'center': return `<label class="check"><input type="checkbox" name="center"${st.center ? ' checked' : ''}> ${t('f_center')}</label>`;
      case 'weightVar': ctrl = `<select name="weightVar"><option value="">${t('none')}</option>${S.ds.names.filter((n, j) => S.ds.kinds[j] === 'num').map(n => `<option${st.weightVar === n ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`; break;
      case 'pmodel': ctrl = `<select name="pmodel">${[4, 6, 1, 7, 14].map(v => `<option value="${v}"${+st.pmodel === v ? ' selected' : ''}>${t('pm_' + v)}</option>`).join('')}</select>`; break;
      case 'procX': case 'procY': case 'procW': case 'procM': {
        const vars = processVars(), multi = k === 'procM';
        ctrl = `<select name="${k}"${multi ? ' multiple size="6"' : ''}>${k === 'procW' ? `<option value="">${t('none')}</option>` : ''}${vars.map(v => `<option>${esc(v)}</option>`).join('')}</select>${multi ? `<small>${t('multi_hint')}</small>` : ''}`; break;
      }
      case 'regY': ctrl = `<select name="regY">${S.ds.names.filter((n, j) => S.ds.kinds[j] === 'num').map(n => `<option>${esc(n)}</option>`).join('')}</select>`; break;
      case 'regX': ctrl = `<select name="regX" multiple size="8">${S.ds.names.filter((n, j) => S.ds.kinds[j] === 'num').map(n => `<option>${esc(n)}</option>`).join('')}</select><small>${t('multi_hint')}</small>`; break;
    }
    return `<label>${t('f_' + k)}${ctrl}</label>`;
  }
  function groupPicker(dlg) {
    const sel = $('select[name=groupVar]', dlg), box = $('#groupPick', dlg); if (!sel) return;
    const draw = () => {
      const j = S.ds.names.indexOf(sel.value); if (j < 0) { box.innerHTML = ''; return; }
      const vals = Array.from(new Set(Array.from(S.ds.cols[j]).filter(x => !isNaN(x)))).sort((a, b) => a - b);
      const nm = v => S.ds.labels[j] ? S.ds.labels[j][v - 1] : String(v);
      const cnt = v => Array.from(S.ds.cols[j]).filter(x => x === v).length;
      const o = vals.map(v => `<option value="${v}">${esc(nm(v))} (n=${cnt(v)})</option>`).join('');
      box.innerHTML = `<label>${t('f_groupA')}<select name="gA">${o}</select></label><label>${t('f_groupB')}<select name="gB">${o}</select></label>`;
      if (vals.length > 1) $('select[name=gB]', box).selectedIndex = 1;
    };
    sel.addEventListener('change', draw); draw();
  }
  function openRun(kind) {
    const def = TASKS[kind];
    if (!S.ds && !def.noData) { toast(t('no_data'), 'bad'); return; }
    if (S.fromMatrix && !['pls', 'plsc', 'cbsem', 'compare', 'samplesize'].includes(kind)) { toast(t('matrix_only'), 'bad'); return; }
    if (kind === 'compare') { syncModel(); if (S.models.length < 2) { toast(t('compare_two_models'), 'bad'); return; } }
    if (!def.noModel) {
      const errs = E.validate(editor.model, S.ds);
      if (errs.length) { toast(errText(errs[0]), 'bad'); setView('model'); return; }
    }
    const dlg = $('#rundlg');
    $('#runtitle').textContent = t(def.title);
    $('#rundesc').textContent = t(def.title + '_d');
    $('#runfields').innerHTML = def.fields.map(k => fieldHTML(k, kind)).join('');
    groupPicker(dlg);
    dlg.dataset.kind = kind;
    dlg.showModal();
  }
  function readForm(dlg, kind) {
    const fd = {}; $$('input,select', $('#runfields')).forEach(el => {
      if (el.type === 'checkbox') fd[el.name] = el.checked;
      else if (el.multiple) fd[el.name] = Array.from(el.selectedOptions).map(o => o.value);
      else fd[el.name] = el.value;
    });
    S['last_' + kind] = fd;
    const settings = Object.assign({}, S.settings, {
      scheme: fd.scheme || S.settings.scheme, missing: fd.missing || S.settings.missing,
      maxIter: fd.maxIter ? +fd.maxIter : S.settings.maxIter, consistent: !!fd.consistent, weightVar: fd.weightVar || undefined
    }, TASKS[kind].preset || {});
    if (fd.scheme) { S.settings.scheme = fd.scheme; S.settings.missing = fd.missing || S.settings.missing; }
    const opts = {
      samples: +fd.samples || 5000, ci: fd.ci, test: fd.test, alpha: +fd.alpha || 0.05, seed: +fd.seed || 0,
      distance: +fd.distance || 7, folds: +fd.folds || 10, reps: +fd.reps || 10, permutations: +fd.permutations || 1000,
      target: fd.target, groupVar: fd.groupVar, y: fd.regY, x: fd.regX,
      maxK: +fd.maxK || 4, K: +fd.K || 2, starts: +fd.starts || (kind === 'pos' ? 5 : 10), pmodel: +fd.pmodel || 4, center: !!fd.center,
      ...(kind === 'process' ? { x: fd.procX, y: fd.procY, m: fd.procM || [], w: fd.procW || undefined } : {}),
      ...(kind === 'logistic' ? { y: fd.logY, x: fd.logX || [] } : {}),
      ...(kind === 'cbsem' ? { samples: S.fromMatrix ? 0 : +fd.cbBoot || 0 } : {}),
      ...(kind === 'regression' ? { samples: +fd.regBoot || 0 } : {}),
      method: fd.cmpMethod || 'pls',
      ...(kind === 'samplesize' ? sampleSizeInputs(fd) : {}),
      bootSamples: fd.bootSamples === undefined ? 1000 : +fd.bootSamples
    };
    if (fd.gA !== undefined) opts.groups = [+fd.gA, +fd.gB];
    if (kind === 'ipma' && (fd.scaleMin !== '' || fd.scaleMax !== '')) {
      opts.ranges = {}; editor.model.constructs.forEach(c => c.indicators.forEach(n => { opts.ranges[n] = { min: fd.scaleMin === '' ? NaN : +fd.scaleMin, max: fd.scaleMax === '' ? NaN : +fd.scaleMax }; }));
    }
    return { settings, opts };
  }

  // Worker with main-thread fallback (file:// pages cannot start workers in some browsers).
  let worker = null, jobSeq = 0; const jobs = {};
  function getWorker() {
    if (worker !== null) return worker;
    try {
      worker = new Worker('js/worker.js');
      worker.onmessage = ev => { const j = jobs[ev.data.id]; if (!j) return; if ('progress' in ev.data) j.progress(ev.data.progress); else { delete jobs[ev.data.id]; ev.data.error ? j.reject(ev.data) : j.resolve(ev.data.result); } };
      worker.onerror = () => { worker.terminate(); worker = false; Object.values(jobs).forEach(j => j.retry()); };
    } catch (e) { worker = false; }
    return worker;
  }
  function runTask(task, model, settings, opts, progress) {
    return new Promise((resolve, reject) => {
      const local = () => setTimeout(() => {
        try {
          let r;
          const fn = { pls: () => E.runPLS(S.ds, model, settings), bootstrap: () => E.bootstrap(S.ds, model, settings, opts), blindfolding: () => E.blindfolding(S.ds, model, settings, opts), predict: () => E.plspredict(S.ds, model, settings, opts), ipma: () => E.ipma(S.ds, model, settings, opts), mga: () => E.mgaFull(S.ds, model, settings, opts), nca: () => E.nca(S.ds, model, settings, opts), regression: () => E.regression(S.ds, opts), gsca: () => E.gsca(S.ds, model, settings, opts), cvpat: () => E.cvpat(S.ds, model, settings, opts), logistic: () => E.logistic(S.ds, model, settings, opts), samplesize: () => E.sampleSize(opts), cbsem: () => E.cbsemModerated(S.ds, model, settings, opts), cca: () => E.fitTest(S.ds, model, settings, opts), cbsemmg: () => E.cbsemMG(S.ds, model, settings, opts), compare: () => E.compareModels(S.ds, opts.models, settings, opts), fimix: () => E.fimix(S.ds, model, settings, opts), pos: () => E.pos(S.ds, model, settings, opts), cta: () => E.cta(S.ds, model, settings, opts), copula: () => E.copula(S.ds, model, settings, opts), process: () => E.processModel(S.ds, model, settings, opts) }[task];
          r = fn(); resolve(r);
        } catch (e) { reject({ error: e.message, details: e.details }); }
      }, 60);
      const w = getWorker();
      if (!w) { local(); return; }
      const id = ++jobSeq;
      jobs[id] = { resolve, reject, progress, retry: local };
      w.postMessage({ id, task, ds: S.ds, model, settings, opts });
    });
  }
  async function run(kind) {
    const dlg = $('#rundlg'); const { settings, opts } = readForm(dlg, kind); dlg.close();
    const task = TASKS[kind].task || kind;
    syncModel();
    const model = JSON.parse(JSON.stringify(editor.model));
    if (kind === 'compare') opts.models = S.models.map(x => ({ name: x.name, model: JSON.parse(JSON.stringify(x.model)) }));
    const bar = $('#busy'); bar.hidden = false; $('#busytext').textContent = t(TASKS[kind].title) + '…'; $('#busybar').style.width = '0%';
    const t0 = performance.now();
    try {
      const r = await runTask(task, model, settings, opts, p => { $('#busybar').style.width = Math.round(p * 100) + '%'; });
      if (opts.models) delete opts.models;
      r.meta = { kind, model, modelName: (S.models[S.cur] || {}).name, settings, opts, time: new Date().toISOString(), ms: Math.round(performance.now() - t0) };
      S.results[kind] = r; S.current = kind; S.section = null; S.cmp = null;
      S.history.unshift({ id: Date.now(), label: t(TASKS[kind].title) + ' · ' + r.meta.modelName + ' · ' + new Date().toLocaleTimeString(), r }); if (S.history.length > 30) S.history.pop();
      if (['pls', 'plsc', 'bootstrap', 'cbsem'].includes(kind)) applyOverlay(kind);
      setView('results');
      toast(t('done', { s: (r.meta.ms / 1000).toFixed(1) }), 'good');
    } catch (e) {
      const msg = e.details ? e.details.map(errText).join(' · ') : t('err_' + e.error) !== 'err_' + e.error ? t('err_' + e.error) : (e.error || String(e));
      toast(t('failed') + ': ' + msg, 'bad');
    } finally { bar.hidden = true; }
  }
  function cancelRun() {
    if (worker) { worker.terminate(); worker = null; Object.keys(jobs).forEach(k => { jobs[k].reject({ error: 'cancelled' }); delete jobs[k]; }); }
    $('#busy').hidden = true;
  }

  // ----------------------------------------------------- canvas overlay
  function applyOverlay(kind) {
    const r = S.results[kind]; if (!r) return;
    const base = r.kind === 'bootstrap' ? r.base : r, m = editor.model;
    if (sig(r.meta.model) !== sig(m)) { editor.overlay = null; editor._lastOverlay = null; editor.render(); return; }
    const ids = m.constructs.map(c => c.id).concat(m.interactions.map(i => i.id));
    if (r.kind === 'cbsem') { // standardised CB-SEM estimates (p-values in brackets)
      const id = nm => ids[r.constructs.indexOf(nm)], ov = { paths: {}, r2: {}, outer: {} };
      r.paths.forEach(p => { ov.paths[id(p.from) + '>' + id(p.to)] = f(p.std) + ' (' + fp(p.p) + ')'; });
      r.r2.forEach(x => { ov.r2[id(x.construct)] = 'R² ' + f(x.r2); });
      m.constructs.forEach(c => { ov.outer[c.id] = c.indicators.map(ind => { const l = r.loadings.find(x => x.construct === c.name && x.indicator === ind); return l ? f(l.std) : ''; }); });
      editor.overlay = S.showResults ? ov : null; editor._lastOverlay = ov; editor.render(); return;
    }
    const ov = { paths: {}, r2: {}, outer: {} };
    const pv = {}; if (r.kind === 'bootstrap') r.rows.forEach(x => { pv[x.key] = x.p; });
    base.constructs.forEach((name, j) => {
      base.pred[j].forEach(i => {
        const key = 'path|' + base.constructs[i] + ' -> ' + name;
        ov.paths[ids[i] + '>' + ids[j]] = f(base.paths[j][i]) + (key in pv ? ' (' + fp(pv[key]) + ')' : '');
      });
      if (base.pred[j].length) ov.r2[ids[j]] = 'R² ' + f(base.r2[j]);
      if (j < m.constructs.length) ov.outer[ids[j]] = base.indicators[j].map((_, q) => f(base.modes[j] === 'B' ? base.weights[j][q] : base.loadings[j][q]));
    });
    editor.overlay = S.showResults ? ov : null; editor._lastOverlay = ov; editor.render();
  }

  // ---------------------------------------------------------- results
  const KIND_ORDER = ['pls', 'plsc', 'bootstrap', 'cca', 'blindfolding', 'predict', 'cvpat', 'ipma', 'mga', 'nca', 'cta', 'copula', 'fimix', 'pos', 'compare', 'cbsem', 'cbsemmg', 'gsca', 'process', 'regression', 'logistic', 'samplesize'];
  function renderResults() {
    const el = $('#resultsview'), kinds = KIND_ORDER.filter(k => S.results[k]);
    if (!kinds.length) { el.innerHTML = `<div class="empty"><p>${t('no_results')}</p><button class="primary" data-run="pls">${t('an_pls')}</button></div>`; return; }
    if (!S.current || !S.results[S.current]) S.current = kinds[0];
    const r = S.cmp ? S.cmp : S.results[S.current];
    TABLES.clear();
    const secs = sections(S.current, r);
    if (!S.section || !secs.some(s => s.id === S.section)) S.section = secs[0].id;
    const sec = secs.find(s => s.id === S.section);
    el.innerHTML = `<div class="restabs" role="tablist">${kinds.map(k => `<button role="tab" data-kind="${k}" class="${k === S.current ? 'on' : ''}">${t(TASKS[k].title)}</button>`).join('')}
        <span class="grow"></span><button data-act="cmpreports">⇄ ${t('compare_reports')}</button><button data-act="excel">⬇ Excel</button><button data-act="report">${t('export_report')}</button><button data-act="rerun">${t('rerun')}</button></div>
      <div class="resbody"><nav class="secnav">${groupNav(secs)}</nav><div class="secout" id="secout">${metaLine(r)}${sec.html()}</div></div>`;
  }
  function groupNav(secs) {
    let h = '', g = null;
    secs.forEach(s => { if (s.group !== g) { g = s.group; h += `<h4>${esc(t(g))}</h4>`; } h += `<button data-sec="${s.id}" class="${s.id === S.section ? 'on' : ''}">${esc(s.title)}</button>`; });
    return h;
  }
  function metaLine(r) {
    const m = r.meta; if (m.kind === 'cmp') return `<p class="meta">${t('compare_reports')}</p>`; let s = `<p class="meta">${esc(t(TASKS[m.kind].title))}${m.modelName ? ' · ' + esc(m.modelName) : ''} · ${new Date(m.time).toLocaleString(S.lang === 'ar' ? 'ar' : 'en')} · ${t('done', { s: (m.ms / 1000).toFixed(1) })}`;
    const b = r.kind === 'bootstrap' ? r.base : r;
    if (b && b.kind === 'pls') s += ` · N = ${b.n} · ${t('iterations')}: ${b.iterations}${b.converged ? '' : ' ⚠ ' + t('not_converged')}`;
    if (sig(m.model) !== sig(editor.model)) s += ` · <span class="warn">${t('stale')}</span>`;
    return s + '</p>';
  }
  const sec = (group, id, title, html) => ({ group, id, title, html });
  // structural signature: ignores positions so moving a node does not invalidate results
  const sig = m => JSON.stringify([m.constructs.map(c => [c.id, c.name, c.mode, c.indicators]), m.paths.map(p => [p.from, p.to]), (m.interactions || []).map(i => [i.id, i.x, i.m, i.y])]);

  function matrixTable(rowNames, colNames, M, opt) {
    opt = opt || {};
    return table([''].concat(colNames), rowNames.map((rn, i) => [rn].concat(colNames.map((_, j) => {
      const v = M[i][j]; if (opt.skip && opt.skip(i, j)) return cell('', 'blank');
      return cell(f(v), opt.cls ? opt.cls(v, i, j) : '', isFinite(v) ? v : '');
    }))), { title: opt.title });
  }

  function sections(kind, r) {
    switch (r.kind) {
      case 'pls': return plsSections(r);
      case 'bootstrap': return bootSections(r);
      case 'blindfolding': return [sec('g_quality', 'q2', t('q2'), () => card(t('q2'), table([t('construct'), 'SSO', 'SSE', 'Q² (=1-SSE/SSO)', t('q2_com')], r.rows.map(x => [x.construct, f(x.sso, 1), f(x.sseRed, 1), cell(f(x.q2), x.q2 > 0 ? 'good' : 'bad', x.q2), f(x.q2com)]), { title: 'q2' }) + chart(C.bars(r.rows.map(x => ({ label: x.construct, value: x.q2 })), { title: 'Q²', thresholds: [{ value: 0, label: '0' }] }), 'Q2'), { note: t('q2_note', { d: r.distance }), doc: 'blindfolding' }))];
      case 'predict': return predictSections(r);
      case 'ipma': return ipmaSections(r);
      case 'mga': return mgaSections(r);
      case 'nca': return ncaSections(r);
      case 'regression': return regSections(r);
      case 'cbsem': return cbsemSections(r);
      case 'gsca': return gscaSections(r);
      case 'cvpat': return cvpatSections(r);
      case 'logistic': return logitSections(r);
      case 'samplesize': return ssSections(r);
      case 'cca': return ccaSections(r);
      case 'cbsemmg': return mgcbSections(r);
      case 'compare': return compareSections(r);
      case 'cmp': return cmpSections(r);
      case 'fimix': case 'pos': return segSections(r);
      case 'cta': return ctaSections(r);
      case 'copula': return copulaSections(r);
      case 'process': return processSections(r);
    }
    return [];
  }

  function plsSections(r) {
    const N = r.constructs, J = N.length, s = [];
    const pathCls = v => isFinite(v) && v !== 0 ? '' : 'blank';
    const has = (i, j) => r.pred[j].includes(i);
    const endo = N.map((_, j) => j).filter(j => r.pred[j].length);
    const real = N.map((_, j) => j).filter(j => !r.isInter[j]);
    // path coefficients
    s.push(sec('g_final', 'paths', t('path_coefs'), () => {
      const items = []; N.forEach((n, j) => r.pred[j].forEach(i => items.push({ label: N[i] + ' → ' + n, value: r.paths[j][i] })));
      return card(t('path_coefs'), matrixTable(N, N, N.map((_, i) => N.map((__, j) => r.paths[j][i])), { skip: (i, j) => !has(i, j), title: 'paths' }) + chart(C.bars(items, { title: t('path_coefs') }), 'paths'), { note: t('matrix_note'), doc: 'pls' });
    }));
    s.push(sec('g_final', 'effects', t('total_effects'), () => {
      const rows = []; N.forEach((n, j) => N.forEach((m, i) => { const tot = r.total[j][i]; if (i !== j && Math.abs(tot) > 1e-12) rows.push([m + ' → ' + n, f(r.paths[j][i]), f(tot - r.paths[j][i]), f(tot)]); }));
      let h = card(t('total_effects'), table([t('relationship'), t('direct'), t('indirect_total'), t('total')], rows, { title: 'effects' }), { doc: 'effects' });
      if (r.specific.length) h += card(t('specific_indirect'), table([t('path'), t('value')], r.specific.map(x => [x.path.join(' → '), f(x.value)]), { title: 'specific' }));
      return h;
    }));
    s.push(sec('g_final', 'outer', t('outer_loadings'), () => {
      const items = []; const rows = [];
      N.forEach((n, j) => r.indicators[j].forEach((ind, q) => { rows.push([ind, n, cell(f(r.loadings[j][q]), r.modes[j] === 'A' && r.loadings[j][q] < 0.708 ? (r.loadings[j][q] < 0.4 ? 'bad' : 'warn') : '', r.loadings[j][q]), f(r.weights[j][q]), f(r.outerVIF[j][q])]); if (!r.isInter[j]) items.push({ label: ind, value: r.loadings[j][q] }); }));
      return card(t('outer_model'), table([t('indicator'), t('construct'), t('loading'), t('weight'), 'VIF'], rows, { title: 'outer' }) + chart(C.bars(items, { title: t('outer_loadings'), thresholds: [{ value: 0.708, label: '0.708' }] }), 'loadings'), { note: t('loading_note'), doc: 'outer' });
    }));
    s.push(sec('g_final', 'r2', t('r2'), () => card(t('r2'), table([t('construct'), 'R²', t('r2adj')], endo.map(j => [N[j], f(r.r2[j]), f(r.r2adj[j])]), { title: 'r2' }) + chart(C.bars(endo.map(j => ({ label: N[j], value: r.r2[j] })), { title: 'R²', max: 1, thresholds: [{ value: 0.25, label: '0.25' }, { value: 0.5, label: '0.50' }, { value: 0.75, label: '0.75' }] }), 'r2'), { note: t('r2_note'), doc: 'r2' })));
    s.push(sec('g_final', 'f2', t('f2'), () => {
      const items = []; N.forEach((n, j) => r.pred[j].forEach(i => items.push({ label: N[i] + ' → ' + n, value: r.f2[i][j] })));
      return card(t('f2'), matrixTable(N, N, r.f2, { skip: (i, j) => !has(i, j), title: 'f2', cls: v => v >= 0.35 ? 'good' : v >= 0.02 ? '' : 'warn' }) + chart(C.bars(items, { title: 'f²', thresholds: [{ value: 0.02, label: '0.02' }, { value: 0.15, label: '0.15' }, { value: 0.35, label: '0.35' }] }), 'f2'), { note: t('f2_note'), doc: 'f2' });
    }));
    s.push(sec('g_final', 'lvcorr', t('lv_corr'), () => card(t('lv_corr'), chart(C.heatmap(N, N, r.lvCorr, { lower: true }), 'lvcorr') + matrixTable(N, N, r.lvCorr, { title: 'lvcorr' }))));
    if (r.inter.length) s.push(sec('g_final', 'slopes', t('simple_slopes'), () => r.inter.map(it => {
      const b = k => r.stats['path|' + k] || 0;
      const bx = b(it.x + ' -> ' + it.y), bm = b(it.m + ' -> ' + it.y), bi = b(it.name + ' -> ' + it.y);
      if (it.x === it.m) { // quadratic effect: Y = b·X + b_q·X² (component scores)
        const pts = []; for (let x = -2; x <= 2.0001; x += 0.1) pts.push([x, bx * x + bi * x * x]);
        return card(t('quadratic_effect') + ': ' + it.name, chart(C.scatter([], { lines: [{ points: pts, label: it.y + ' = ' + f(bx) + '·' + it.x + (bi >= 0 ? ' + ' : ' − ') + f(Math.abs(bi)) + '·' + it.x + '²' }], xLabel: it.x, yLabel: it.y, xmin: -2, xmax: 2, title: it.name }), 'quadratic'), { note: t('quadratic_note'), doc: 'nonlinear' });
      }
      const line = mv => ({ points: [-2, 2].map(x => [x, bx * x + bm * mv + bi * x * mv]), label: it.m + (mv > 0 ? ' +1 SD' : mv < 0 ? ' -1 SD' : ' ' + t('mean')) });
      return card(t('simple_slopes') + ': ' + it.name, chart(C.scatter([], { lines: [line(-1), line(0), line(1)], xLabel: it.x, yLabel: it.y, title: it.name + ' → ' + it.y, xmin: -2, xmax: 2 }), 'slopes'), { note: t('slopes_note'), doc: 'slopes' });
    }).join('')));
    s.push(sec('g_quality', 'assess', t('assessment'), () => card(t('assessment'), checklistHTML(assessment(r, null)), { note: t('assessment_note'), doc: 'outer' })));
    // quality
    s.push(sec('g_quality', 'rel', t('reliability'), () => {
      const rows = real.map(j => { const b = r.reliability[j]; return [N[j], cell(f(b.alpha), b.alpha < 0.7 ? 'warn' : '', b.alpha), cell(f(b.rhoA), b.rhoA < 0.7 ? 'warn' : '', b.rhoA), cell(f(b.rhoC), b.rhoC < 0.7 ? 'warn' : b.rhoC > 0.95 ? 'warn' : '', b.rhoC), cell(f(b.ave), b.ave < 0.5 ? 'bad' : 'good', b.ave)]; });
      const bar = (key, title, thr) => chart(C.bars(real.map(j => ({ label: N[j], value: r.reliability[j][key] })), { title, width: 460, max: 1, thresholds: [{ value: thr, label: String(thr) }] }), title);
      return card(t('reliability'), table([t('construct'), "Cronbach's α", 'ρA (rho_a)', 'ρc (rho_c)', 'AVE'], rows, { title: 'reliability' }) +
        `<div class="chartgrid">${bar('alpha', "Cronbach's α", 0.7)}${bar('rhoA', 'ρA', 0.7)}${bar('rhoC', 'ρc', 0.7)}${bar('ave', 'AVE', 0.5)}</div>`, { note: t('rel_note') + (r.settings.consistent ? ' ' + t('plsc_note') : ''), doc: 'rhoa' });
    }));
    s.push(sec('g_quality', 'htmt', 'HTMT', () => {
      const n = real.map(j => N[j]), M = real.map(i => real.map(j => r.htmt[i][j]));
      return card(t('htmt'), chart(C.heatmap(n, n, M, { lower: true, hideDiag: true, threshold: 0.85, min: 0, max: 1 }), 'htmt') + matrixTable(n, n, M, { skip: (i, j) => j >= i, cls: v => v >= 0.9 ? 'bad' : v >= 0.85 ? 'warn' : 'good', title: 'htmt' }), { note: t('htmt_note'), doc: 'htmt' });
    }));
    s.push(sec('g_quality', 'fl', t('fornell'), () => {
      const n = real.map(j => N[j]), M = real.map(i => real.map(j => r.fornell[i][j]));
      return card(t('fornell'), matrixTable(n, n, M, { skip: (i, j) => j > i, cls: (v, i, j) => i === j ? 'diag' : (Math.abs(v) > Math.min(M[i][i], M[j][j]) ? 'bad' : ''), title: 'fornell' }), { note: t('fl_note'), doc: 'fl' });
    }));
    s.push(sec('g_quality', 'cross', t('cross_loadings'), () => {
      const own = {}; N.forEach((n, j) => r.indicators[j].forEach(ind => { if (!r.isInter[j]) own[ind] = j; }));
      const rows = r.crossNames.map((ind, a) => [ind].concat(real.map(j => cell(f(r.cross[a][j]), own[ind] === j ? 'diag' : (Math.abs(r.cross[a][j]) > Math.abs(r.cross[a][own[ind]]) ? 'bad' : ''), r.cross[a][j]))));
      return card(t('cross_loadings'), table([t('indicator')].concat(real.map(j => N[j])), rows, { title: 'cross' }), { note: t('cross_note'), doc: 'cross' });
    }));
    s.push(sec('g_quality', 'vif', t('collinearity'), () => {
      const rows = []; N.forEach((n, j) => r.indicators[j].forEach((ind, q) => rows.push([ind, n, cell(f(r.outerVIF[j][q]), r.outerVIF[j][q] >= 5 ? 'bad' : r.outerVIF[j][q] >= 3 ? 'warn' : '', r.outerVIF[j][q])])));
      return card(t('outer_vif'), table([t('indicator'), t('construct'), 'VIF'], rows, { title: 'outer_vif' })) +
        card(t('inner_vif'), matrixTable(N, N, r.innerVIF, { skip: (i, j) => !has(i, j), cls: v => v >= 5 ? 'bad' : v >= 3 ? 'warn' : '', title: 'inner_vif' }), { note: t('vif_note'), doc: 'vif' });
    }));
    s.push(sec('g_quality', 'fit', t('model_fit'), () => {
      const a = r.fit.saturated, b = r.fit.estimated;
      const rows = [['SRMR', cell(f(a.srmr), a.srmr > 0.08 ? 'warn' : 'good', a.srmr), f(b.srmr)], ['d_ULS', f(a.dULS), f(b.dULS)], ['d_G', f(a.dG), f(b.dG)], ['Chi²', f(a.chi2), f(b.chi2)], ['NFI', f(a.nfi), f(b.nfi)], ['GoF', f(r.gof), '']];
      return card(t('model_fit'), table(['', t('saturated'), t('estimated')], rows, { title: 'fit' }), { note: t('fit_note'), doc: 'fit' }) +
        card(t('selection'), table([t('construct'), 'AIC', 'BIC', 'HQ'], r.selection.map(x => [x.construct, f(x.aic), f(x.bic), f(x.hq)]), { title: 'selection' }), { note: t('selection_note'), doc: 'ic' });
    }));
    // data
    s.push(sec('g_data', 'scores', t('lv_scores'), () => {
      const rows = r.scores[0].map((_, i) => [String(r.rows[i] + 1)].concat(r.scores.map(sc => f(sc[i], 4))));
      return card(t('lv_scores'), `<button data-act="addscores">＋ ${t('add_scores')}</button>` + table(['#'].concat(N), rows, { title: 'lv_scores' }));
    }));
    s.push(sec('g_data', 'algo', t('algorithm'), () => card(t('algorithm'), table([t('setting'), t('value')], [[t('f_scheme'), t('opt_' + r.settings.scheme)], [t('f_missing'), t('opt_' + r.settings.missing)], [t('f_maxIter'), r.settings.maxIter], [t('stop_criterion'), r.settings.tol], [t('iterations'), r.iterations], [t('converged'), r.converged ? t('yes') : t('no')], ['PLSc', r.settings.consistent ? t('yes') : t('no')], ['N', r.n]], { title: 'algorithm' }))));
    return s;
  }

  const GROUPS = ['path', 'total', 'indirect', 'specific', 'loading', 'weight', 'r2', 'r2adj', 'f2', 'htmt', 'alpha', 'rhoA', 'rhoC', 'ave', 'fit'];
  function bootSections(r) {
    const s = [], hiLabel = r.ci === 'bca' ? 'BCa' : t('percentile');
    GROUPS.forEach(g => {
      const rows = r.rows.filter(x => x.group === g); if (!rows.length) return;
      s.push(sec(['htmt', 'alpha', 'rhoA', 'rhoC', 'ave', 'fit'].includes(g) ? 'g_quality' : 'g_final', 'b_' + g, t('bg_' + g), () => {
        const lo = ((r.alpha / 2) * 100).toFixed(1) + '%', hi = ((1 - r.alpha / 2) * 100).toFixed(1) + '%';
        const tbl = table([t('parameter'), t('original'), t('sample_mean'), t('std_dev'), 'T', 'P', `${hiLabel} ${lo}`, `${hiLabel} ${hi}`],
          rows.map(x => [x.label, f(x.original), f(x.mean), f(x.sd), f(x.t), cell(fp(x.p) + ' ' + stars(x.p), g === 'htmt' ? '' : (x.p < r.alpha ? 'good' : ''), x.p), f(x.lo), cell(f(x.hi), g === 'htmt' && x.hi >= 1 ? 'bad' : g === 'htmt' && x.hi >= 0.85 ? 'warn' : '', x.hi)]),
          { title: 'boot_' + g, cls: 'clickable', rowAttr: i => `data-draw="${r.rows.indexOf(rows[i])}"` });
        return card(t('bg_' + g), tbl + `<div id="drawbox" class="note">${t('click_row_hist')}</div>` + ciChart(rows, g), { note: (g === 'htmt' ? t('htmt_boot_note') : t('boot_note', { b: r.samples, f: r.failed, test: t('opt_' + r.test) })), doc: r.ci === 'bca' ? 'bca' : 'bootstrap' });
      }));
    });
    s.unshift(sec('g_final', 'b_writeup', t('writeup'), () => card(t('assessment'), checklistHTML(assessment(r.base, r)), { note: t('assessment_note') }) + card(t('writeup'), `<div class="writeup" id="writeup">${writeup(r)}</div><button class="mini" data-act="copywriteup">${t('copy')}</button>`, { note: t('writeup_note') })));
    s.push(sec('g_data', 'b_info', t('algorithm'), () => card(t('algorithm'), table([t('setting'), t('value')], [[t('f_samples'), r.samples], [t('failed_samples'), r.failed], [t('f_ci'), t('opt_' + r.ci)], [t('f_test'), t('opt_' + r.test)], [t('f_alpha'), r.alpha], [t('f_seed'), r.meta.opts.seed], ['PLSc', r.settings.consistent ? t('yes') : t('no')], ['N', r.n]], { title: 'bootstrap_settings' }))));
    s.push(sec('g_data', 'b_base', t('base_estimates'), () => `<p class="note">${t('base_note')}</p>` + plsSections(r.base).filter(x => ['rel', 'htmt', 'fit', 'r2'].includes(x.id)).map(x => x.html()).join('')));
    return s;
  }
  // forest-style CI chart
  function ciChart(rows, g) {
    const h = 30 + rows.length * 24 + 40, w = 680, lw = Math.min(280, 20 + Math.max(...rows.map(x => x.label.length * 6.2)));
    const lo = Math.min(0, ...rows.map(x => x.lo)), hi = Math.max(0, ...rows.map(x => x.hi));
    const X = v => lw + (v - lo) / ((hi - lo) || 1) * (w - lw - 30);
    let s = `<line x1="${X(0)}" x2="${X(0)}" y1="20" y2="${h - 30}" stroke="var(--line)"/>`;
    rows.forEach((x, i) => {
      const y = 30 + i * 24, sig = g !== 'htmt' && (x.lo > 0 || x.hi < 0);
      s += `<text x="${lw - 6}" y="${y + 4}" text-anchor="end">${esc(x.label)}</text><line x1="${X(x.lo)}" x2="${X(x.hi)}" y1="${y}" y2="${y}" stroke="${sig ? 'var(--c1)' : 'var(--muted)'}" stroke-width="3"/><circle cx="${X(x.original)}" cy="${y}" r="4.5" fill="${sig ? 'var(--c1)' : 'var(--muted)'}"/>`;
    });
    [lo, (lo + hi) / 2, hi].forEach(v => { s += `<text x="${X(v)}" y="${h - 12}" text-anchor="middle">${v.toFixed(2)}</text>`; });
    return chart(`<svg class="chart" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><style>.chart text{font-family:system-ui,sans-serif;font-size:11px;fill:var(--ink,#222)}</style><text x="${w / 2}" y="14" text-anchor="middle" style="font-weight:600;font-size:13px">${esc(t('ci_plot'))}</text>${s}</svg>`, 'ci');
  }

  function predictSections(r) {
    return [
      sec('g_final', 'pp_ind', t('pp_indicators'), () => card(t('pp_indicators'), table([t('indicator'), t('construct'), 'Q²predict', 'PLS RMSE', 'PLS MAE', 'LM RMSE', 'LM MAE', 'LM Q²predict'],
        r.rows.map(x => [x.indicator, x.construct, cell(f(x.q2), x.q2 > 0 ? 'good' : 'bad', x.q2), cell(f(x.plsRMSE), x.plsRMSE < x.lmRMSE ? 'good' : 'warn', x.plsRMSE), cell(f(x.plsMAE), x.plsMAE < x.lmMAE ? 'good' : 'warn', x.plsMAE), f(x.lmRMSE), f(x.lmMAE), f(x.lmQ2)]), { title: 'plspredict' }) +
        chart(C.grouped(r.rows.map(x => ({ label: x.indicator, values: [x.plsRMSE, x.lmRMSE] })), ['PLS-SEM RMSE', 'LM RMSE'], { title: 'RMSE' }), 'rmse') +
        chart(C.bars(r.rows.map(x => ({ label: x.indicator, value: x.q2 })), { title: 'Q²predict', thresholds: [{ value: 0, label: '0' }] }), 'q2predict'), { note: t('pp_note', { k: r.folds, r: r.reps }), doc: 'predict' })),
      sec('g_final', 'pp_lv', t('pp_constructs'), () => card(t('pp_constructs'), table([t('construct'), 'Q²predict', 'RMSE', 'MAE'], r.lvRows.map(x => [x.construct, f(x.q2), f(x.rmse), f(x.mae)]), { title: 'plspredict_lv' }))),
      sec('g_data', 'pp_err', t('pp_errors'), () => card(t('pp_errors'), `<div class="chartgrid">${r.rows.map(x => chart(C.histogram(x.errors, { title: x.indicator + ' (skew ' + f(x.errSkew, 2) + ')', width: 360, height: 200, marks: [{ value: 0, label: '0' }] }), x.indicator)).join('')}</div>`, { note: t('pp_err_note') }))
    ];
  }

  function ipmaSections(r) {
    const lv = r.lvRows, ind = r.indRows;
    const mi = a => a.reduce((s, x) => s + x.importance, 0) / a.length, mp = a => a.reduce((s, x) => s + x.performance, 0) / a.length;
    return [
      sec('g_final', 'ip_lv', t('ipma_constructs'), () => card(t('ipma_constructs') + ' – ' + r.target, chart(C.scatter(lv.map(x => ({ x: x.importance, y: x.performance, label: x.construct })), { title: t('ipma_map'), xLabel: t('importance'), yLabel: t('performance'), quadrants: { x: mi(lv), y: mp(lv) } }), 'ipma') +
        table([t('construct'), t('importance'), t('performance')], lv.map(x => [x.construct, f(x.importance), f(x.performance, 2)]), { title: 'ipma_lv' }), { note: t('ipma_note', { p: f(r.targetPerformance, 2) }), doc: 'ipma' })),
      sec('g_final', 'ip_ind', t('ipma_indicators'), () => card(t('ipma_indicators'), chart(C.scatter(ind.map(x => ({ x: x.importance, y: x.performance, label: x.indicator })), { title: t('ipma_map'), xLabel: t('importance'), yLabel: t('performance'), quadrants: { x: mi(ind), y: mp(ind) } }), 'ipma_ind') +
        table([t('indicator'), t('construct'), t('importance'), t('performance')], ind.map(x => [x.indicator, x.construct, f(x.importance), f(x.performance, 2)]), { title: 'ipma_ind' }))),
      sec('g_data', 'ip_w', t('rescaled_weights'), () => card(t('rescaled_weights'), table([t('construct'), t('indicator'), t('weight')], r.rescaledWeights.flatMap(w => w.indicators.map((n, q) => [w.construct, n, f(w.weights[q])])), { title: 'ipma_weights' })))
    ];
  }

  function mgaSections(r) {
    const out = [];
    r.results.forEach((res, k) => {
      const lab = res.g1 + ' vs ' + res.g2;
      ['path', 'total', 'indirect', 'r2', 'loading', 'weight'].forEach(g => {
        const rows = res.rows.filter(x => x.group === g); if (!rows.length) return;
        const bt = !!res.bootSamples;
        out.push(sec('g_final', 'm' + k + g, t('bg_' + g), () => card(t('bg_' + g) + ' – ' + lab, table([t('parameter'), res.g1 + ` (n=${res.n1})`, res.g2 + ` (n=${res.n2})`, t('difference'), t('perm_p')].concat(bt ? ['SE 1', 'SE 2', 'PLS-MGA p (1>2)', 'PLS-MGA p', t('parametric') + ' p', 'Welch-Satterthwaite p'] : []),
          rows.map(x => [x.label, f(x.g1), f(x.g2), f(x.diff), cell(fp(x.p) + ' ' + stars(x.p), x.p < 0.05 ? 'good' : '', x.p)].concat(bt ? [f(x.se1), f(x.se2), fp(x.hP1), cell(fp(x.hP2), x.hP2 < 0.05 ? 'good' : '', x.hP2), cell(fp(x.parP), x.parP < 0.05 ? 'good' : '', x.parP), cell(fp(x.wsP), x.wsP < 0.05 ? 'good' : '', x.wsP)] : [])), { title: 'mga_' + g }) +
          (g === 'path' ? chart(C.grouped(rows.map(x => ({ label: x.label, values: [x.g1, x.g2] })), [res.g1, res.g2], { title: t('path_coefs') }), 'mga') : ''), { note: t('mga_note', { p: res.permutations }) + (res.bootSamples ? ' ' + t('mga_boot_note', { b: res.bootSamples }) : ''), doc: 'mga' })));
      });
      out.push(sec('g_quality', 'micom' + k, 'MICOM', () => card(t('micom2'), table([t('construct'), 'c', '5% quantile', t('perm_p'), t('result')], res.micom.map(x => [x.construct, f(x.c, 4), f(x.c5, 4), fp(x.pc), cell(x.c >= x.c5 ? t('established') : t('not_established'), x.c >= x.c5 ? 'good' : 'bad')]), { title: 'micom2' }), { note: t('micom2_note'), doc: 'micom' }) +
        card(t('micom3'), table([t('construct'), t('mean_diff'), '2.5%', '97.5%', t('perm_p'), t('logvar_ratio'), '2.5%', '97.5%', t('perm_p')], res.micom.map(x => [x.construct, f(x.meanDiff), f(x.meanLo), f(x.meanHi), cell(fp(x.pMean), x.pMean < 0.05 ? 'warn' : 'good', x.pMean), f(x.varDiff), f(x.varLo), f(x.varHi), cell(fp(x.pVar), x.pVar < 0.05 ? 'warn' : 'good', x.pVar)]), { title: 'micom3' }), { note: t('micom3_note') })));
    });
    return out;
  }

  function ncaSections(r) {
    return [sec('g_final', 'nca_d', t('nca_effects'), () => card(t('nca_effects'), table([t('relationship'), t('effect_size_d'), t('perm_p'), t('result')], r.rows.map(x => [x.x + ' → ' + x.y, f(x.d), fp(x.p), cell(x.d >= 0.1 && x.p < 0.05 ? t('necessary') : t('not_necessary'), x.d >= 0.1 && x.p < 0.05 ? 'good' : '')]), { title: 'nca' }), { note: t('nca_note'), doc: 'nca' })),
      sec('g_final', 'nca_plot', t('nca_plots'), () => r.rows.map(x => card(x.x + ' → ' + x.y, `<div class="chartgrid">${chart(C.scatter(x.points.map(p => ({ x: p[0], y: p[1] })), { step: x.steps, title: 'CE-FDH  d = ' + f(x.d), xLabel: x.x, yLabel: x.y }), 'nca')}${table([x.y + ' %', x.x + ' % ' + t('required')], x.bottleneck.map(b => [String(b.y), b.x === null ? 'NA' : f(b.x, 1)]), { title: 'bottleneck' })}</div>`)).join(''))];
  }

  function processVars() {
    const v = S.ds.names.filter((n, j) => S.ds.kinds[j] === 'num');
    const ok = editor.model.constructs.length && !E.validate(editor.model, S.ds).length;
    return (ok ? editor.model.constructs.map(c => 'LV: ' + c.name) : []).concat(v);
  }
  const pcell = p => cell(fp(p) + ' ' + stars(p), p < 0.05 ? 'good' : '', p);
  const thr = (v, ok, label) => cell(f(v), ok ? 'good' : 'warn', v);
  function cbsemSections(r) {
    const F = r.fit;
    const fitRows = [
      ['χ²', f(F.chi2), ''], ['df', String(F.df), ''], ['p (χ²)', fp(F.p), '> 0.05'], ['χ²/df', f(F.chi2 / F.df), '< 3'],
      ['CFI', thr(F.cfi, F.cfi >= 0.95), '≥ 0.95'], ['TLI', thr(F.tli, F.tli >= 0.95), '≥ 0.95'],
      ['RMSEA', thr(F.rmsea, F.rmsea <= 0.06), '≤ 0.06'], ['RMSEA 90% CI', f(F.rmseaLo) + ' – ' + f(F.rmseaHi), ''],
      ['SRMR', thr(F.srmr, F.srmr <= 0.08), '≤ 0.08'], ['GFI', f(F.gfi), '≥ 0.90'], ['AGFI', f(F.agfi), '≥ 0.90'], ['NFI', f(F.nfi), '≥ 0.90'],
      ['AIC', f(F.aic, 1), t('lower_better')], ['BIC', f(F.bic, 1), t('lower_better')], ['N', String(r.n), ''], [t('free_params'), String(F.params), ''], [t('iterations'), String(F.iterations) + (F.converged ? '' : ' ⚠'), '']];
    const N = r.constructs;
    return [
      sec('g_quality', 'cb_fit', t('cb_fit'), () => (r.heywood ? `<p class="warn">⚠ ${t('heywood')}</p>` : '') + card(t('cb_fit'), table(['', t('value'), t('guideline')], fitRows, { title: 'cbsem_fit' }), { note: t('cb_fit_note'), doc: 'cbfit' })),
      sec('g_final', 'cb_paths', t('path_coefs'), () => card(t('path_coefs'), table([t('relationship'), t('estimate'), 'SE', 'z', 'p', t('std_estimate')].concat(r.boot ? ['Boot SE', 'Boot p', '2.5%', '97.5%'] : []), r.paths.map(p => [p.from + ' → ' + p.to, f(p.est), f(p.se), f(p.z), pcell(p.p), f(p.std)].concat(r.boot ? [f(p.bootSE), pcell(p.bootP), f(p.lo), f(p.hi)] : [])), { title: 'cbsem_paths' }) +
        chart(C.bars(r.paths.map(p => ({ label: p.from + ' → ' + p.to, value: p.std })), { title: t('std_estimate') }), 'cbsem_paths'), { note: t('cb_paths_note'), doc: 'cbsem' })),
      sec('g_final', 'cb_load', t('outer_loadings'), () => card(t('outer_loadings'), table([t('construct'), t('indicator'), t('estimate'), 'SE', 'z', 'p', t('std_estimate')].concat(r.boot ? ['Boot SE', '2.5%', '97.5%'] : []), r.loadings.map(l => [l.construct, l.indicator, f(l.est), l.fixed ? t('fixed') : f(l.se), l.fixed ? '' : f(l.z), l.fixed ? cell('') : pcell(l.p), cell(f(l.std), l.std < 0.7 ? 'warn' : '', l.std)].concat(r.boot ? [f(l.bootSE), f(l.lo), f(l.hi)] : [])), { title: 'cbsem_loadings' }) +
        chart(C.bars(r.loadings.map(l => ({ label: l.indicator, value: l.std })), { title: t('std_estimate'), thresholds: [{ value: 0.7, label: '0.70' }] }), 'cbsem_loadings'), { note: t('cb_load_note'), doc: 'cbsem' })),
      sec('g_final', 'cb_r2', t('r2'), () => card(t('r2'), table([t('construct'), 'R²'], r.r2.map(x => [x.construct, f(x.r2)]), { title: 'cbsem_r2' }), { doc: 'cbsem' })),
      sec('g_final', 'cb_eff', t('total_effects'), () => card(t('total_effects') + ' (' + t('std_estimate') + ')', table([t('relationship'), t('direct'), t('indirect_total'), t('total')], r.effects.map(e => [e.from + ' → ' + e.to, f(e.direct), f(e.indirect), f(e.total)]), { title: 'cbsem_effects' }), { doc: 'effects' })),
      sec('g_quality', 'cb_rel', t('reliability'), () => card(t('reliability'), table([t('construct'), 'CR', 'AVE', '√AVE'], r.reliability.map(x => [x.construct, cell(f(x.cr), x.cr >= 0.7 ? 'good' : 'warn', x.cr), cell(f(x.ave), x.ave >= 0.5 ? 'good' : 'bad', x.ave), f(Math.sqrt(x.ave))]), { title: 'cbsem_reliability' }) +
        matrixTable(N, N, r.lvcorr.map((row, i) => row.map((v, j) => (i === j ? Math.sqrt(r.reliability[i].ave) : v))), { skip: (i, j) => j > i, cls: (v, i, j) => i === j ? 'diag' : (Math.abs(v) > Math.min(Math.sqrt(r.reliability[i].ave), Math.sqrt(r.reliability[j].ave)) ? 'bad' : ''), title: 'cbsem_fornell' }), { note: t('cb_rel_note'), doc: 'ave' })),
      sec('g_data', 'cb_var', t('cb_variances'), () => card(t('cb_variances'), table(['', t('type'), t('estimate'), 'SE', 'z', 'p', t('std_estimate')], r.covs.map(c => [c.a === c.b ? c.a : c.a + ' ↔ ' + c.b, t('cbk_' + c.kind), cell(f(c.est), c.kind !== 'cov' && c.est < 0 ? 'bad' : '', c.est), f(c.se), f(c.z), pcell(c.p), f(c.std)]).concat(r.resid.map(x => [x.indicator, t('cbk_error'), cell(f(x.est), x.est < 0 ? 'bad' : '', x.est), f(x.se), f(x.z), pcell(x.p), f(x.std)])), { title: 'cbsem_variances' }))),
      sec('g_quality', 'cb_mi', t('cb_mi'), () => card(t('cb_mi'), table([t('parameter'), t('type'), 'MI', 'p', 'EPC', t('std_epc')], (r.mi || []).filter(x => x.mi >= 3.84).slice(0, 40).map(x => [x.label, t('mi_' + x.type), cell(f(x.mi, 2), x.mi >= 10 ? 'warn' : '', x.mi), fp(x.p), f(x.epc), f(x.sepc)]), { title: 'cbsem_mi' }), { note: t('cb_mi_note'), doc: 'cbmi' })),
      sec('g_data', 'cb_res', t('cb_residuals'), () => card(t('cb_residuals'), chart(C.heatmap(r.indicators, r.indicators, r.resCorr, { lower: true, hideDiag: true, min: -0.2, max: 0.2 }), 'residuals'), { note: t('cb_res_note') }))
    ];
  }
  function segSections(r) {
    const isF = r.kind === 'fimix', segs = r.segments, head = [t('relationship'), t('global')].concat(segs.map(s => t('segment') + ' ' + s.segment));
    const out = [];
    if (isF) {
      const crit = ['aic', 'aic3', 'aic4', 'bic', 'caic', 'hq', 'mdl5'], minOf = k => Math.min(...r.table.map(x => x[k]));
      out.push(sec('g_quality', 'fx_crit', t('fx_criteria'), () => card(t('fx_criteria'), table(['K', 'lnL', 'AIC', 'AIC3', 'AIC4', 'BIC', 'CAIC', 'HQ', 'MDL5', 'EN'], r.table.map(x => [String(x.K), f(x.lnL, 2)].concat(crit.map(k => cell(f(x[k], 2), x[k] === minOf(k) ? 'good' : '', x[k]))).concat([f(x.en)])), { title: 'fimix_criteria' }), { note: t('fx_crit_note'), doc: 'fimix' })));
    }
    out.push(sec('g_final', 'seg_paths', t('seg_results'), () => card(t('seg_sizes'), table([t('segment'), t('share'), 'N'], segs.map(s => [String(s.segment), f(s.share * 100, 1) + '%', String(s.count)]), { title: 'segment_sizes' }) +
      (isF ? '' : `<p class="meta">${t('pos_objective', { a: f(r.globalObjective), b: f(r.objective) })}</p>`), { doc: isF ? 'fimix' : 'pos' }) +
      card(t('path_coefs'), table(head, r.global.map((g, q) => [g.from + ' → ' + g.to, f(g.value)].concat(segs.map(s => f(s.paths[q].value)))), { title: 'segment_paths' }) +
        chart(C.grouped(r.global.map((g, q) => ({ label: g.from + ' → ' + g.to, values: [g.value].concat(segs.map(s => s.paths[q].value)) })), [t('global')].concat(segs.map(s => t('segment') + ' ' + s.segment)), { title: t('path_coefs') }), 'segments')) +
      card('R²', table([t('construct')].concat(isF ? [] : [t('global')]).concat(segs.map(s => t('segment') + ' ' + s.segment)), segs[0].r2.map((x, q) => [x.construct].concat(isF ? [] : [f(r.globalR2[q].r2)]).concat(segs.map(s => f(s.r2[q].r2)))), { title: 'segment_r2' }), { note: isF ? t('fx_seg_note') : t('pos_note', { m: r.minSize }) })));
    out.push(sec('g_data', 'seg_mem', t('membership'), () => card(t('membership'), table(['#', t('segment')].concat(isF ? segs.map(s => 'P(' + s.segment + ')') : []), r.membership.map(x => [String(x.row), String(x.segment)].concat(isF ? x.probs.map(v => f(v)) : [])), { title: 'membership' }) + `<button data-act="addseg">＋ ${t('add_segments')}</button>`, { note: t('membership_note') })));
    return out;
  }
  function ctaSections(r) {
    return [sec('g_quality', 'cta', t('an_cta'), () => r.constructs.map(c => card(c.construct + ' – ' + (c.reflectiveRejected ? t('cta_reject') : t('cta_keep')),
      table([t('tetrad'), t('value'), t('sample_mean'), t('std_dev'), 'T', 'p', t('ci_low_adj'), t('ci_high_adj'), t('result')], c.rows.map(x => [x.tetrad, f(x.value, 4), f(x.mean, 4), f(x.sd, 4), f(x.t), fp(x.p), f(x.lo, 4), f(x.hi, 4), cell(x.sig ? t('cta_nonzero') : t('cta_zero'), x.sig ? 'bad' : 'good')]), { title: 'cta_' + c.construct }),
      { note: t('cta_note', { m: c.tetrads, a: f(c.adjAlpha, 4), b: r.samples }), doc: 'cta' })).join(''))];
  }
  function copulaSections(r) {
    return [
      sec('g_quality', 'cop_tests', t('cop_tests'), () => card(t('cop_tests'), table([t('outcome'), t('model'), t('term'), t('value'), t('std_dev'), 'T', 'p', '2.5%', '97.5%'], r.tests.flatMap(x => x.copulas.map(c => [x.outcome, x.model, c.term, f(c.value), f(c.sd), f(c.t), cell(fp(c.p), c.p < 0.05 ? 'bad' : 'good', c.p), f(c.lo), f(c.hi)]).concat(x.paths.map(pp => [x.outcome, x.model, pp.term + ' (' + t('original') + ' ' + f(pp.original) + ')', f(pp.value), f(pp.sd), f(pp.t), fp(pp.p), f(pp.lo), f(pp.hi)]))), { title: 'copula' }), { note: t('cop_note', { b: r.samples }), doc: 'copula' })),
      sec('g_quality', 'cop_norm', t('cop_normality'), () => card(t('cop_normality'), table([t('construct'), 'KS D', t('critical_5'), t('skewness'), t('kurtosis'), t('result')], r.normality.map(x => [x.construct, f(x.D), f(x.crit), f(x.skew), f(x.kurt), cell(x.nonNormal ? t('nonnormal') : t('normal_like'), x.nonNormal ? 'good' : 'warn')]), { title: 'copula_normality' }), { note: t('cop_norm_note'), doc: 'copula' }))];
  }
  function processLabel(r, key) {
    const W = r.w, lv = r.wvals || [], lvl = q => [t('low'), t('mean'), t('high')][q] + ' (' + f(lv[q]) + ')';
    const M = i => r.m[i];
    let m;
    if (key === 'total') return t('total') + ': ' + r.x + ' → ' + r.y;
    if (key === 'direct') return t('direct') + ': ' + r.x + ' → ' + r.y;
    if (key === 'total_ind') return t('indirect_total');
    if ((m = key.match(/^ind_(\d)$/))) { const i = +m[1]; if (r.pmodel === 6 && i === 2) return r.x + ' → ' + M(0) + ' → ' + M(1) + ' → ' + r.y; return r.x + ' → ' + M(i) + ' → ' + r.y; }
    if ((m = key.match(/^cond_(\d)$/))) return t('cond_effect') + ' ' + r.x + ' → ' + r.y + ' | ' + W + ' = ' + lvl(+m[1]);
    if ((m = key.match(/^cind_(\d)_(\d)$/))) return r.x + ' → ' + M(+m[1]) + ' → ' + r.y + ' | ' + W + ' = ' + lvl(+m[2]);
    if ((m = key.match(/^imm_(\d)$/))) return t('imm') + ' (' + M(+m[1]) + ')';
    return key;
  }
  function processSections(r) {
    return [
      sec('g_final', 'pr_eff', t('pr_effects'), () => card(t('pm_' + r.pmodel), table([t('effect'), t('value'), 'Boot SE', 'Boot 2.5%', 'Boot 97.5%', t('result')], r.effects.map((e, q) => [processLabel(r, e.key), f(e.value), f(e.se), f(e.lo), f(e.hi), cell(e.lo > 0 || e.hi < 0 ? t('significant') : t('not_significant'), e.lo > 0 || e.hi < 0 ? 'good' : '')].concat([])), { title: 'process_effects' }) +
        (r.condSE ? table([t('cond_effect'), 'SE', 't', 'p'], r.wvals.map((w, q) => { const e = r.effects.find(x => x.key === 'cond_' + q), tt = e.value / r.condSE[q]; return [processLabel(r, 'cond_' + q), f(r.condSE[q]), f(tt), fp(E.tTwoTailedP(tt, r.equations[0].df))]; }), { title: 'process_conditional' }) : ''), { note: t('pr_note', { b: r.samples, n: r.n }) + (r.center ? ' ' + t('pr_centered') : ''), doc: 'process' })),
      sec('g_final', 'pr_eq', t('pr_equations'), () => r.equations.map(eq => card(t('outcome') + ': ' + eq.outcome, `<p class="meta">R² = ${f(eq.r2)} · F = ${f(eq.F, 2)} · df = ${eq.df}</p>` + table([t('term'), 'b', 'SE', 't', 'p', 'LLCI', 'ULCI'], eq.terms.map(x => [x.name, f(x.b), f(x.se), f(x.t), pcell(x.p), f(x.lo), f(x.hi)]), { title: 'process_' + eq.outcome }))).join(''))];
  }

  function sampleSizeInputs(fd) {
    const m = editor.model, o = { pmin: +fd.ssPmin || 0.2, alpha: +fd.ssAlpha || 0.05, power: +fd.ssPower || 0.8 };
    if (m.constructs.length) {
      const maxForm = Math.max(0, ...m.constructs.filter(c => c.mode === 'B').map(c => c.indicators.length));
      const maxArrows = Math.max(0, ...m.constructs.map(c => m.paths.filter(p => p.to === c.id).length + (m.interactions || []).filter(i => i.y === c.id).length));
      o.tenTimes = 10 * Math.max(maxForm, maxArrows);
    }
    const r = S.results.pls || S.results.plsc;
    if (r) { let best = null; r.pred.forEach((P, j) => P.forEach(i => { const v = Math.abs(r.paths[j][i]); if (!best || v < best.v) best = { v, label: r.constructs[i] + ' → ' + r.constructs[j] }; })); if (best) o.fromModel = best; }
    if (S.ds) o.currentN = S.ds.n;
    return o;
  }
  function bootTable(rows, title) {
    return table([t('parameter'), t('original'), t('sample_mean'), t('std_dev'), 'T', 'P', '2.5%', '97.5%'], rows.map(x => [x.label, f(x.original), f(x.mean), f(x.sd), f(x.t), cell(fp(x.p) + ' ' + stars(x.p), x.p < 0.05 ? 'good' : '', x.p), f(x.lo), f(x.hi)]), { title });
  }
  function gscaSections(r) {
    const grp = g => r.rows.filter(x => x.group === g), fitRow = k => r.rows.find(x => x.key === 'fit|' + k);
    return [
      sec('g_quality', 'gs_fit', t('model_fit'), () => card(t('model_fit') + ' (GSCA)', table(['', t('value'), '2.5%', '97.5%'], ['FIT', 'AFIT', 'GFI', 'SRMR'].map(k => { const x = fitRow(k); return [k, f(x.original), f(x.lo), f(x.hi)]; }), { title: 'gsca_fit' }), { note: t('gsca_fit_note', { b: r.samples, i: r.iterations }), doc: 'gsca' })),
      sec('g_final', 'gs_path', t('path_coefs'), () => card(t('path_coefs'), bootTable(grp('path'), 'gsca_paths') + chart(C.bars(grp('path').map(x => ({ label: x.label, value: x.original })), { title: t('path_coefs') }), 'gsca_paths'), { doc: 'gsca' }) + card('R²', bootTable(grp('r2'), 'gsca_r2'))),
      sec('g_final', 'gs_w', t('outer_model'), () => card(t('bg_weight'), bootTable(grp('weight'), 'gsca_weights')) + card(t('bg_loading'), bootTable(grp('loading'), 'gsca_loadings'))),
      sec('g_data', 'gs_corr', t('lv_corr'), () => card(t('lv_corr'), matrixTable(r.constructs, r.constructs, r.lvCorr, { title: 'gsca_lvcorr' })))
    ];
  }
  function cvpatSections(r) {
    const line = (lbl, x) => [lbl, f(x.plsLoss), f(x.benchLoss), f(x.diff), f(x.t), cell(fp(x.p), x.p < 0.05 ? 'good' : 'warn', x.p)];
    const head = [t('construct'), t('loss_pls'), t('loss_bench'), t('loss_diff'), 't', 'p'];
    return [sec('g_final', 'cv', t('an_cvpat'), () => ['ia', 'lm'].map(b => card(t('cvpat_vs_' + b), table(head, [line(t('overall'), r.overall[b])].concat(r.constructs.map(c => line(c.construct, c[b]))), { title: 'cvpat_' + b }), { note: t('cvpat_note', { k: r.folds, r: r.reps }), doc: 'cvpat' })).join(''))];
  }
  function logitSections(r) {
    const roc = (() => { const pts = [[0, 0]], P = r.events, N = r.n - r.events; let tp = 0, fp_ = 0; r.fitted.slice().reverse().forEach(([, y]) => { if (y) tp++; else fp_++; pts.push([fp_ / N, tp / P]); }); return pts; })();
    const tb = r.table;
    return [
      sec('g_final', 'lg_coef', t('coefficients'), () => (r.separation ? `<p class="warn">⚠ ${t('separation')}</p>` : '') + card(t('an_logistic') + ': ' + r.y + ' (' + t('event') + ' = ' + r.event + ', ' + t('reference_cat') + ' = ' + r.reference + ')',
        table([t('term'), 'B', 'SE', 'z', 'p', t('odds_ratio'), 'OR 2.5%', 'OR 97.5%', 'VIF'], r.terms.map(x => [x.name, f(x.b), f(x.se), f(x.z), pcell(x.p), f(x.or), f(x.orLo), f(x.orHi), f(x.vif)]), { title: 'logistic' }), { note: t('logit_note'), doc: 'logistic' })),
      sec('g_quality', 'lg_fit', t('model_fit'), () => card(t('model_fit'), table(['', t('value')], [['N', String(r.n)], [t('events'), String(r.events)], ['−2LL', f(r.deviance, 2)], ['LR χ² (df = ' + r.LRdf + ')', f(r.LR, 2)], ['p (LR)', fp(r.LRp)], ['McFadden R²', f(r.mcfadden)], ['Cox & Snell R²', f(r.coxSnell)], ['Nagelkerke R²', f(r.nagelkerke)], ['AIC', f(r.aic, 2)], ['BIC', f(r.bic, 2)], ['AUC (ROC)', f(r.auc)], ['Hosmer–Lemeshow χ² (df = ' + r.hlDf + ')', f(r.hl, 2)], ['p (HL)', cell(fp(r.hlP), r.hlP >= 0.05 ? 'good' : 'warn', r.hlP)]], { title: 'logistic_fit' }), { doc: 'logistic' }) +
        card(t('classification'), table(['', t('pred_event'), t('pred_ref')], [[t('obs_event'), String(tb.tp), String(tb.fn)], [t('obs_ref'), String(tb.fp), String(tb.tn)]], { title: 'classification' }) + `<p class="meta">${t('accuracy')} ${f(tb.accuracy * 100, 1)}% · ${t('sensitivity')} ${f(tb.sensitivity * 100, 1)}% · ${t('specificity')} ${f(tb.specificity * 100, 1)}% (cut-off 0.5)</p>` +
        chart(C.scatter([], { lines: [{ points: roc, label: 'ROC (AUC ' + f(r.auc) + ')' }, { points: [[0, 0], [1, 1]], color: 'var(--muted)' }], xLabel: '1 − ' + t('specificity'), yLabel: t('sensitivity'), xmin: 0, xmax: 1, ymin: 0, ymax: 1, width: 420, height: 400, title: 'ROC' }), 'roc')))
    ];
  }
  function ssSections(r) {
    return [sec('g_final', 'ss', t('an_samplesize'), () => card(t('an_samplesize'), `<p class="big">n<sub>min</sub> = <b>${r.n}</b> <span class="meta">(|β|<sub>min</sub> = ${f(r.pmin, 2)}, α = ${r.alpha}, ${t('power')} = ${r.power})</span></p>` +
      table(['|β|min', 'n min'], r.table.map(x => [f(x.beta, 2), String(x.n)]), { title: 'sample_size' }) +
      `<ul>${r.fromModel ? `<li>${t('ss_from_model', { p: esc(r.fromModel.label), b: f(r.fromModel.v), n: Math.ceil((r.z / r.fromModel.v) ** 2) })}</li>` : ''}${r.tenTimes ? `<li>${t('ss_ten_times', { n: r.tenTimes })}</li>` : ''}${r.currentN ? `<li>${t('ss_current', { n: r.currentN })}</li>` : ''}</ul>` +
      chart(C.bars(r.table.map(x => ({ label: '|β| = ' + x.beta, value: x.n })), { title: 'n min' }), 'sample_size'), { note: t('ss_note'), doc: 'samplesize' }))];
  }

  // ---------------------------------------------------- assessment & write-up
  function assessment(r, rb) {
    const items = [], real = r.constructs.map((_, j) => j).filter(j => !r.isInter[j]);
    const refl = real.filter(j => r.modes[j] === 'A' && r.indicators[j].length > 1), form = real.filter(j => r.modes[j] === 'B');
    const add = (status, key, vars) => items.push({ status, text: t(key, vars) });
    if (!r.converged) add('bad', 'chk_converge');
    const L = []; refl.forEach(j => r.loadings[j].forEach((v, q) => L.push({ v, name: r.indicators[j][q] })));
    const low = L.filter(x => x.v < 0.708), vlow = L.filter(x => x.v < 0.4);
    add(vlow.length ? 'bad' : low.length ? 'warn' : 'ok', 'chk_loadings', { n: low.length, list: low.map(x => x.name).join(', ') || '–' });
    const relBad = refl.filter(j => r.reliability[j].rhoA < 0.7 || r.reliability[j].rhoC < 0.7), relHigh = refl.filter(j => r.reliability[j].rhoC > 0.95);
    add(relBad.length ? 'bad' : relHigh.length ? 'warn' : 'ok', 'chk_reliability', { list: relBad.concat(relHigh).map(j => r.constructs[j]).join(', ') || '–' });
    const aveBad = refl.filter(j => r.reliability[j].ave < 0.5);
    add(aveBad.length ? 'bad' : 'ok', 'chk_ave', { list: aveBad.map(j => r.constructs[j]).join(', ') || '–' });
    let hmax = 0, hpair = ''; real.forEach((i, a) => real.forEach((j, b) => { if (b > a && r.htmt[i][j] > hmax) { hmax = r.htmt[i][j]; hpair = r.constructs[i] + ' – ' + r.constructs[j]; } }));
    add(hmax >= 0.9 ? 'bad' : hmax >= 0.85 ? 'warn' : 'ok', 'chk_htmt', { v: f(hmax), pair: hpair });
    if (rb) { const hu = rb.rows.filter(x => x.group === 'htmt'), mx = hu.reduce((a, x) => (x.hi > a.hi ? x : a), { hi: -Infinity }); if (hu.length) add(mx.hi >= 1 ? 'bad' : mx.hi >= 0.9 ? 'warn' : 'ok', 'chk_htmt_ci', { v: f(mx.hi), pair: mx.label }); }
    if (form.length) { let vmax = 0; form.forEach(j => r.outerVIF[j].forEach(v => { vmax = Math.max(vmax, v); })); add(vmax >= 5 ? 'bad' : vmax >= 3 ? 'warn' : 'ok', 'chk_outer_vif', { v: f(vmax) }); }
    let ivmax = 0; r.pred.forEach((P, j) => P.forEach(i => { if (isFinite(r.innerVIF[i][j])) ivmax = Math.max(ivmax, r.innerVIF[i][j]); }));
    add(ivmax >= 5 ? 'bad' : ivmax >= 3 ? 'warn' : 'ok', 'chk_inner_vif', { v: f(ivmax) });
    if (rb) { const ps = rb.rows.filter(x => x.group === 'path'), ns = ps.filter(x => !(x.p < 0.05)); add(ns.length ? 'info' : 'ok', 'chk_paths', { s: ps.length - ns.length, n: ps.length, list: ns.map(x => x.label).join(', ') || '–' }); }
    const r2 = r.pred.map((P, j) => (P.length && !r.isInter[j] ? r.r2[j] : null)).filter(v => v !== null);
    if (r2.length) add(Math.min(...r2) < 0.1 ? 'warn' : 'info', 'chk_r2', { lo: f(Math.min(...r2)), hi: f(Math.max(...r2)) });
    const sr = r.fit.saturated.srmr; add(sr > 0.08 ? 'warn' : 'ok', 'chk_srmr', { v: f(sr) });
    let bmin = Infinity; r.pred.forEach((P, j) => P.forEach(i => { bmin = Math.min(bmin, Math.abs(r.paths[j][i])); }));
    if (isFinite(bmin) && bmin > 0) { const need = Math.ceil((2.486 / bmin) ** 2); add(r.n >= need ? 'ok' : 'warn', 'chk_n', { n: r.n, need, b: f(bmin) }); }
    return items;
  }
  function checklistHTML(items) {
    const icon = { ok: '✓', warn: '⚠', bad: '✗', info: 'ℹ' };
    return `<ul class="checklist">${items.map(x => `<li class="${x.status}"><span>${icon[x.status]}</span>${esc(x.text)}</li>`).join('')}</ul>`;
  }
  function writeup(rb) {
    const r = rb.base, ar = S.lang === 'ar', real = r.constructs.map((_, j) => j).filter(j => !r.isInter[j]);
    const refl = real.filter(j => r.modes[j] === 'A' && r.indicators[j].length > 1);
    const span = a => (a.length ? f(Math.min(...a)) + '–' + f(Math.max(...a)) : '–');
    const pAPA = p => (p < 0.001 ? '< .001' : '= ' + p.toFixed(3).replace(/^0/, ''));
    const L = []; refl.forEach(j => r.loadings[j].forEach(v => L.push(v)));
    const rel = k => refl.map(j => r.reliability[j][k]);
    let hmax = 0; real.forEach((i, a) => real.forEach((j, b) => { if (b > a) hmax = Math.max(hmax, r.htmt[i][j]); }));
    const hu = rb.rows.filter(x => x.group === 'htmt'), hiMax = hu.length ? Math.max(...hu.map(x => x.hi)) : NaN;
    let iv = []; r.pred.forEach((P, j) => P.forEach(i => { if (isFinite(r.innerVIF[i][j])) iv.push(r.innerVIF[i][j]); }));
    const paths = rb.rows.filter(x => x.group === 'path');
    const r2s = r.pred.map((P, j) => (P.length && !r.isInter[j] ? r.constructs[j] + ' (R² = ' + f(r.r2[j]) + ')' : null)).filter(Boolean);
    const ci = x => '[' + f(x.lo) + ', ' + f(x.hi) + ']';
    const pathTxt = paths.map(x => x.label.replace(' -> ', ' → ') + ' (β = ' + f(x.original) + ', t = ' + f(x.t, 2) + ', p ' + pAPA(x.p) + ', 95% CI ' + ci(x) + ')');
    const sig = paths.filter(x => x.p < 0.05), ns = paths.filter(x => !(x.p < 0.05));
    if (ar) return `<p>قُيِّم نموذج القياس وفق إرشادات Hair وآخرين (2019). تراوحت التشبعات الخارجية بين ${span(L)}${L.filter(v => v < 0.708).length ? `، وجاء ${L.filter(v => v < 0.708).length} منها دون 0.708` : '، وكلها فوق 0.708'}. وتراوح معامل ألفا كرونباخ بين ${span(rel('alpha'))}، وρA بين ${span(rel('rhoA'))}، والثبات المركب ρc بين ${span(rel('rhoC'))}، ومتوسط التباين المستخلص (AVE) بين ${span(rel('ave'))}. وبلغت أعلى قيمة لنسبة HTMT ${f(hmax)}${isFinite(hiMax) ? `، وأعلى حدّ أعلى لفترة الثقة 95% ${f(hiMax)}` : ''}${hmax < 0.85 ? '، مما يدعم الصدق التمايزي' : ''}.</p>
      <p>وفي النموذج الهيكلي تراوحت قيم VIF الداخلية بين ${span(iv)}. وأظهر الإقلاع الذاتي بـ ${rb.samples} عينة فرعية أن ${sig.length} من ${paths.length} مسارات دالة إحصائياً عند 0.05: ${sig.length ? pathTxt.filter((_, q) => paths[q].p < 0.05).join('؛ ') : '–'}.${ns.length ? ` ولم تكن المسارات التالية دالة: ${pathTxt.filter((_, q) => !(paths[q].p < 0.05)).join('؛ ')}.` : ''} ويفسّر النموذج من تباين المتغيرات التابعة: ${r2s.join('، ')}.</p>
      <p class="note">استُعمل برنامج YouPls (الإصدار ${window.YPDocs.version}) بمخطط ترجيح ${t('opt_' + r.settings.scheme)} و${rb.samples} عينة إقلاع (${t('opt_' + rb.ci)}، ${t('opt_' + rb.test)}).</p>`;
    return `<p>The measurement model was assessed following Hair et al. (2019). Outer loadings ranged from ${span(L)}${L.filter(v => v < 0.708).length ? `, with ${L.filter(v => v < 0.708).length} below 0.708` : ', all above 0.708'}. Cronbach’s alpha ranged from ${span(rel('alpha'))}, ρA from ${span(rel('rhoA'))} and composite reliability ρc from ${span(rel('rhoC'))}; the average variance extracted (AVE) ranged from ${span(rel('ave'))}. The highest HTMT ratio was ${f(hmax)}${isFinite(hiMax) ? ` and the highest upper bound of the 95% confidence intervals was ${f(hiMax)}` : ''}${hmax < 0.85 ? ', supporting discriminant validity' : ''}.</p>
      <p>In the structural model, inner VIF values ranged from ${span(iv)}. Bootstrapping with ${rb.samples} subsamples showed ${sig.length} of ${paths.length} paths to be significant at the 5% level: ${sig.length ? pathTxt.filter((_, q) => paths[q].p < 0.05).join('; ') : '–'}.${ns.length ? ` The following paths were not significant: ${pathTxt.filter((_, q) => !(paths[q].p < 0.05)).join('; ')}.` : ''} The model explains ${r2s.join(', ')}.</p>
      <p class="note">Analysis performed with YouPls (version ${window.YPDocs.version}) using the ${t('opt_' + r.settings.scheme).toLowerCase()} weighting scheme and ${rb.samples} bootstrap subsamples (${t('opt_' + rb.ci).toLowerCase()} confidence intervals, ${t('opt_' + rb.test).toLowerCase()} test).</p>`;
  }

  // ------------------------------------------------------- Excel export of all results
  function exportExcel() {
    const kinds = KIND_ORDER.filter(k => S.results[k]); if (!kinds.length) return;
    const sheets = [], toNum = v => (typeof v === 'string' && /^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(v.trim()) ? Number(v) : v);
    kinds.forEach(k => {
      sections(k, S.results[k]).forEach(sc => {
        TABLES.clear(); sc.html();
        Array.from(TABLES.values()).forEach((tb, i) => sheets.push({ name: (t(TASKS[k].title).replace(/\s*\(.*$/, '').slice(0, 12) + ' ' + sc.title).slice(0, 31 - (i ? 3 : 0)) + (i ? ' ' + (i + 1) : ''), rows: [tb.head.map(String)].concat(tb.rows.map(r => r.map(toNum))) }));
      });
    });
    const u8 = window.YPIO.writeXLSX(sheets, S.lang === 'ar');
    download(slug(S.name) + '_results.xlsx', new Blob([u8], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    renderResults();
  }

  function ccaSections(r) {
    const ft = r.fitTest, row = x => [x.index === 'srmr' ? 'SRMR' : x.index === 'dULS' ? 'd_ULS' : 'd_G', f(x.value), f(x.hi95), f(x.hi99), fp(x.p), cell(x.ok === null ? '–' : x.ok ? t('supported') : t('not_supported'), x.ok ? 'good' : 'bad')];
    const head = ['', t('value'), 'HI95', 'HI99', 'p', t('result')];
    const base = plsSections(r.base);
    return [sec('g_quality', 'cca_fit', t('cca_fit'), () => card(t('cca_fit') + ' – ' + t('saturated'), r.fitTest.saturatedPD ? table(head, ft.saturated.map(row), { title: 'cca_saturated' }) : `<p class="warn">${t('cca_not_pd')}</p>`, { note: t('cca_fit_note', { b: r.samples }), doc: 'cca' }) +
        card(t('cca_fit') + ' – ' + t('estimated'), r.fitTest.estimatedPD ? table(head, ft.estimated.map(row), { title: 'cca_estimated' }) : `<p class="warn">${t('cca_not_pd')}</p>`, { doc: 'cca' }))]
      .concat(base.filter(x => ['assess', 'outer', 'rel', 'htmt', 'fl', 'cross', 'vif'].includes(x.id)).map(x => Object.assign({}, x, { group: 'g_quality' })));
  }
  function mgcbSections(r) {
    const L = r.levels, lv = ['configural', 'metric', 'scalar'];
    const fitRow = k => [t('inv_' + k), f(L[k].chi2, 2), String(L[k].df), fp(L[k].p), f(L[k].cfi), f(L[k].tli), f(L[k].rmsea), f(L[k].srmr), f(L[k].aic, 1), f(L[k].bic, 1)];
    return [
      sec('g_quality', 'mg_inv', t('cb_invariance'), () => card(t('cb_invariance') + ' – ' + r.groups.map((g, i) => g + ' (n=' + r.ns[i] + ')').join(' / '), table(['', 'χ²', 'df', 'p', 'CFI', 'TLI', 'RMSEA', 'SRMR', 'AIC', 'BIC'], lv.map(fitRow), { title: 'cbsem_invariance_fit' }) +
        table([t('comparison'), 'Δχ²', 'Δdf', 'p', 'ΔCFI', 'ΔRMSEA', t('result')], r.invariance.map(x => { const ok = x.p >= 0.05 || (x.dcfi >= -0.01 && x.drmsea <= 0.015); return [t('inv_' + x.model) + ' vs ' + t('inv_' + x.vs), f(x.dchi, 2), String(x.ddf), fp(x.p), f(x.dcfi), f(x.drmsea), cell(ok ? t('established') : t('not_established'), ok ? 'good' : 'bad')]; }), { title: 'cbsem_invariance_tests' }), { note: t('cb_inv_note'), doc: 'cbsemmg' })),
      sec('g_final', 'mg_paths', t('cb_mga'), () => card(t('cb_mga'), table([t('relationship')].concat(r.groups.map(g => g + ' (B)')).concat(['Δχ² (1 df)', 'p']), r.pathTests.map(x => [x.path].concat(x.values.map(v => f(v))).concat([f(x.dchi, 2), cell(fp(x.p) + ' ' + stars(x.p), x.p < 0.05 ? 'good' : '', x.p)])), { title: 'cbsem_mga' }) +
        chart(C.grouped(r.pathTests.map((x, q) => ({ label: x.path, values: r.groupEstimates.map(g => g.paths[q].std) })), r.groups, { title: t('std_estimate') }), 'cbsem_mga'), { note: t('cb_mga_note'), doc: 'cbsemmg' })),
      sec('g_final', 'mg_means', t('latent_means'), () => card(t('latent_means'), table([t('segment'), t('construct'), t('estimate'), t('std_estimate')], r.latentMeans.map(x => [x.group, x.construct, f(x.mean), f(x.std)]), { title: 'cbsem_latent_means' }), { note: t('latent_means_note', { g: r.groups[0] }) })),
      sec('g_data', 'mg_load', t('outer_loadings'), () => card(t('outer_loadings') + ' (' + t('std_estimate') + ')', table([t('construct'), t('indicator')].concat(r.groups), r.groupEstimates[0].loadings.map((l, q) => [l.construct, l.indicator].concat(r.groupEstimates.map(g => f(g.loadings[q].std)))), { title: 'cbsem_mg_loadings' })))
    ];
  }
  function compareSections(r) {
    if (r.method === 'cbsem') {
      const ok = r.models.filter(m => m.fit);
      return [sec('g_final', 'cmp_cb', t('an_compare'), () => card(t('cmp_cbsem'), table([t('model'), 'χ²', 'df', 'p', 'CFI', 'TLI', 'RMSEA', 'SRMR', 'AIC', 'BIC', t('bic_weight')], ok.map(m => [m.name, f(m.fit.chi2, 2), String(m.fit.df), fp(m.fit.p), f(m.fit.cfi), f(m.fit.tli), f(m.fit.rmsea), f(m.fit.srmr), f(m.fit.aic, 1), f(m.fit.bic, 1), cell(f(m.bicWeight), m.bicWeight === Math.max(...ok.map(x => x.bicWeight)) ? 'good' : '', m.bicWeight)]), { title: 'compare_cbsem' }) +
        (r.diffs.length ? table([t('restricted'), t('less_restricted'), 'Δχ²', 'Δdf', 'p'], r.diffs.map(d => [d.restricted, d.free, f(d.dchi, 2), String(d.ddf), cell(fp(d.p), d.p < 0.05 ? 'warn' : 'good', d.p)]), { title: 'compare_chi2' }) : '') +
        (r.models.some(m => m.error) ? `<p class="warn">${r.models.filter(m => m.error).map(m => esc(m.name) + ': ' + esc(errMsg(m.error))).join('<br>')}</p>` : ''), { note: t('cmp_cb_note'), doc: 'modelselection' }))];
    }
    return [sec('g_final', 'cmp_pls', t('an_compare'), () => r.targets.map(tg => card(t('target') + ': ' + tg.construct, table([t('model'), t('predictors'), 'R²', 'AIC', 'BIC', 'HQ', t('bic_weight')], tg.rows.map(x => [x.model, String(x.k), f(x.r2), f(x.aic, 2), f(x.bic, 2), f(x.hq, 2), cell(f(x.bicWeight), x.bicWeight === Math.max(...tg.rows.map(y => y.bicWeight)) ? 'good' : '', x.bicWeight)]), { title: 'compare_' + tg.construct }), { note: t('cmp_pls_note'), doc: 'modelselection' })).join('') +
      card(t('model_fit'), table([t('model'), 'N', 'SRMR', 'GoF'], r.models.map(m => [m.name, m.error ? errMsg(m.error) : String(m.n), f(m.srmr), f(m.gof)]), { title: 'compare_fit' })))];
  }
  function errMsg(code) { const k = 'err_' + code; return t(k) !== k ? t(k) : code; }
  // flattened statistics of a result, for side-by-side comparison of two reports
  function flatten(r) {
    const o = {};
    if (r.kind === 'pls') { Object.assign(o, r.stats); o['fit|GoF'] = r.gof; }
    else if (r.kind === 'bootstrap') r.rows.forEach(x => { o[x.key] = x.original; o['p|' + x.label + ' (' + x.group + ')'] = x.p; });
    else if (r.kind === 'cbsem') { ['chi2', 'df', 'cfi', 'tli', 'rmsea', 'srmr', 'aic', 'bic'].forEach(k => { o['fit|' + k] = r.fit[k]; }); r.paths.forEach(x => { o['path|' + x.from + ' -> ' + x.to] = x.std; }); r.loadings.forEach(x => { o['loading|' + x.indicator + ' <- ' + x.construct] = x.std; }); r.r2.forEach(x => { o['r2|' + x.construct] = x.r2; }); }
    else if (r.kind === 'gsca') r.rows.forEach(x => { o[x.key] = x.original; });
    else if (r.kind === 'cca') { Object.assign(o, r.base.stats); }
    else if (r.kind === 'regression' || r.kind === 'logistic') r.terms.forEach(x => { o['coef|' + x.name] = x.b; });
    else return null;
    return o;
  }
  function cmpSections(c) {
    const A = flatten(c.a.r), B = flatten(c.b.r);
    const keys = Array.from(new Set(Object.keys(A).concat(Object.keys(B))));
    const groups = Array.from(new Set(keys.map(k => k.split('|')[0])));
    return groups.map(g => sec('g_final', 'cmp_' + g, t('bg_' + g) !== 'bg_' + g ? t('bg_' + g) : g, () => card(t('compare_reports'), table([t('parameter'), 'A', 'B', 'B − A'], keys.filter(k => k.split('|')[0] === g).map(k => { const a = A[k], b = B[k], d = isFinite(a) && isFinite(b) ? b - a : NaN; return [k.slice(g.length + 1), f(a), f(b), cell(f(d), Math.abs(d) >= 0.1 ? 'warn' : '', d)]; }), { title: 'compare_' + g }), { note: 'A = ' + esc(c.a.label) + '<br>B = ' + esc(c.b.label) })));
  }
  function openCompare() {
    const cand = S.history.filter(h => flatten(h.r));
    if (cand.length < 2) { toast(t('compare_need_two'), 'bad'); return; }
    const opt = sel => cand.map((h, i) => `<option value="${h.id}"${i === sel ? ' selected' : ''}>${esc(h.label)}</option>`).join('');
    $('#runtitle').textContent = t('compare_reports'); $('#rundesc').textContent = t('compare_reports_d');
    $('#runfields').innerHTML = `<label>A<select name="cmpA">${opt(1)}</select></label><label>B<select name="cmpB">${opt(0)}</select></label>`;
    $('#rundlg').dataset.kind = '__compare'; $('#rundlg').showModal();
  }
  // ---- datasets: write back to CSV, add columns, define groups, covariance input
  function datasetCSV(ds) {
    const c = v => { const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = [ds.names.map(c).join(',')];
    for (let i = 0; i < ds.n; i++) rows.push(ds.cols.map((col, j) => (isNaN(col[i]) ? '' : ds.kinds[j] === 'cat' ? c(ds.labels[j][col[i] - 1]) : c(col[i]))).join(','));
    return rows.join('\n');
  }
  function addColumns(list) { // [{ name, values: array indexed by data row (NaN = missing), labels? }]
    const ds = S.ds; let added = 0;
    list.forEach(col => {
      let nm = col.name, k = 2; while (ds.names.includes(nm)) nm = col.name + '_' + k++;
      ds.names.push(nm); ds.cols.push(Float64Array.from(col.values)); ds.kinds.push(col.labels ? 'cat' : 'num'); ds.labels.push(col.labels || null); added++;
    });
    const name = S.dataName; setData(datasetCSV(ds), name, true); autosave(); toast(t('columns_added', { n: added }), 'good');
  }
  function addScoresToData() {
    const r = S.results[S.current]; const base = r.kind === 'bootstrap' ? r.base : r.kind === 'cca' ? r.base : r;
    addColumns(base.constructs.map((nm, j) => { const v = new Float64Array(S.ds.n).fill(NaN); base.rows.forEach((row, t_) => { v[row] = base.scores[j][t_]; }); return { name: 'LV_' + nm.replace(/\s+/g, '_'), values: v }; }));
  }
  function addSegmentsToData() {
    const r = S.results[S.current], v = new Float64Array(S.ds.n).fill(NaN);
    r.membership.forEach(x => { v[x.row - 1] = x.segment; });
    addColumns([{ name: (r.kind === 'fimix' ? 'FIMIX_K' : 'POS_K') + r.K, values: v, labels: Array.from({ length: r.K }, (_, i) => t('segment') + ' ' + (i + 1)) }]);
  }
  function openGroups() {
    if (!S.ds) { toast(t('no_data'), 'bad'); return; }
    const nums = S.ds.names.filter((n, j) => S.ds.kinds[j] === 'num');
    $('#runtitle').textContent = t('define_groups'); $('#rundesc').textContent = t('define_groups_d');
    $('#runfields').innerHTML = `<label>${t('variable')}<select name="gVar">${nums.map(n => `<option>${esc(n)}</option>`).join('')}</select></label>
      <label>${t('grp_method')}<select name="gMethod"><option value="median">${t('grp_median')}</option><option value="cuts">${t('grp_cuts')}</option><option value="quantiles">${t('grp_quantiles')}</option></select></label>
      <label>${t('grp_param')}<input name="gParam" placeholder="${t('grp_param_ph')}"></label><label>${t('name')}<input name="gName" placeholder="group"></label>`;
    $('#rundlg').dataset.kind = '__groups'; $('#rundlg').showModal();
  }
  function makeGroups(fd) {
    const j = S.ds.names.indexOf(fd.gVar), col = S.ds.cols[j], vals = Array.from(col).filter(v => !isNaN(v)).sort((a, b) => a - b);
    let cuts;
    if (fd.gMethod === 'median') cuts = [E.quantile(vals, 0.5)];
    else if (fd.gMethod === 'quantiles') { const k = Math.max(2, Math.min(10, parseInt(fd.gParam, 10) || 3)); cuts = Array.from({ length: k - 1 }, (_, i) => E.quantile(vals, (i + 1) / k)); }
    else cuts = String(fd.gParam || '').split(/[;,\s]+/).map(Number).filter(isFinite).sort((a, b) => a - b);
    if (!cuts.length) { toast(t('grp_need_cuts'), 'bad'); return; }
    const labels = cuts.map((c, i) => (i === 0 ? '≤ ' + c : '(' + cuts[i - 1] + ', ' + c + ']')).concat(['> ' + cuts[cuts.length - 1]]);
    const v = Float64Array.from(col, x => { if (isNaN(x)) return NaN; let g = 0; while (g < cuts.length && x > cuts[g]) g++; return g + 1; });
    addColumns([{ name: (fd.gName || 'group_' + fd.gVar).trim(), values: v, labels }]);
  }
  function importCovMatrix(text, fname) {
    let parsed; try { parsed = E.parseCovMatrix(text); } catch (e) { toast(t('csv_error') + ': ' + errMsg(e.message), 'bad'); return; }
    const n = parseInt(window.prompt(t('cov_n_prompt'), '200'), 10);
    if (!(n > parsed.names.length)) { toast(t('err_cov_n'), 'bad'); return; }
    let cols; try { cols = E.dataFromCov(parsed.names, parsed.C, n, parsed.means, 1); } catch (e) { toast(errMsg(e.message), 'bad'); return; }
    const ds = { names: parsed.names, cols, kinds: parsed.names.map(() => 'num'), labels: parsed.names.map(() => null), n };
    S.fromMatrix = { n, file: fname, correlation: parsed.isCorr };
    setData(datasetCSV(ds), fname, false); toast(t('cov_loaded', { n }), 'good');
  }
  // ---- multiple models per project
  function renderModelTabs() {
    const el = $('#modeltabs'); if (!el) return;
    if (!S.models.length) S.models = [{ name: t('model') + ' 1', model: editor.model }];
    el.innerHTML = S.models.map((m, i) => `<span class="mtab${i === S.cur ? ' on' : ''}"><button data-mtab="${i}" title="${esc(t('rename_hint'))}">${esc(m.name)}</button>${S.models.length > 1 ? `<button class="x" data-mdel="${i}" aria-label="${esc(t('delete'))}">×</button>` : ''}</span>`).join('') + `<button class="mini" data-act="mnew" title="${esc(t('new_model'))}">＋ ${t('new_model')}</button>`;
  }
  function useModel(i) {
    syncModel(); S.cur = i; editor.history = []; editor.setModel(S.models[i].model); editor._fitted = false;
    renderModelTabs(); renderProps(); renderIndicators(); requestAnimationFrame(() => editor.fit());
    if (['pls', 'plsc', 'bootstrap', 'cbsem'].includes(S.current) && S.results[S.current]) applyOverlay(S.current);
    autosave();
  }

  function regSections(r) {
    return [sec('g_final', 'reg', t('an_regression'), () => card(r.y + ' ~ ' + r.terms.slice(1).map(x => x.name).join(' + '),
      `<p class="meta">N = ${r.n} · R² = ${f(r.r2)} · ${t('r2adj')} = ${f(r.r2adj)} · F(${r.df1}, ${r.df2}) = ${f(r.F, 2)} · p = ${fp(r.pF)}</p>` +
      table([t('term'), 'B', 'β', 'SE', 't', 'p', 'VIF'].concat(r.bootSamples ? ['Boot SE', 'Boot p', '2.5%', '97.5%'] : []), r.terms.map(x => [x.name, f(x.b), f(x.beta), f(x.se), f(x.t), cell(fp(x.p) + ' ' + stars(x.p), x.p < 0.05 ? 'good' : '', x.p), f(x.vif)].concat(r.bootSamples ? [f(x.bootSE), pcell(x.bootP), f(x.lo), f(x.hi)] : [])), { title: 'regression' }) +
      (r.bootSamples ? `<p class="meta">${t('reg_boot_note', { b: r.bootSamples, lo: f(r.r2Lo), hi: f(r.r2Hi) })}</p>` : '') +
      chart(C.scatter(r.residuals.map(p => ({ x: p[0], y: p[1] })), { title: t('residual_plot'), xLabel: t('fitted'), yLabel: t('residual') }), 'residuals'), { doc: 'regression' }))];
  }

  // ------------------------------------------------------------- report
  function exportReport() {
    const r = S.results[S.current]; if (!r) return;
    const secs = sections(S.current, r);
    const css = Array.from(document.styleSheets).map(ss => { try { return Array.from(ss.cssRules).map(x => x.cssText).join('\n'); } catch (e) { return ''; } }).join('\n');
    const body = secs.map(s => `<h2 class="rep">${esc(s.title)}</h2>` + s.html()).join('');
    const html = `<!doctype html><html lang="${S.lang}" dir="${S.lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YouPls – ${esc(S.name)}</title><style>${css}\nbody{padding:24px;max-width:1100px;margin:auto;overflow:auto;height:auto}.cardtools,figcaption{display:none}</style></head><body><h1>YouPls · ${esc(S.name)}</h1>${metaLine(r)}${body}<p class="note">${t('generated_by')}</p></body></html>`;
    download(slug(S.name) + '_' + S.current + '.html', html, 'text/html;charset=utf-8');
    renderResults();
  }
  function svgOf(fig) {
    const svg = fig.querySelector('svg').cloneNode(true);
    const cs = getComputedStyle(document.documentElement);
    const vars = ['--ink', '--line', '--grid', '--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--neg', '--warn', '--muted', '--bg2', '--good-bg', '--bad-bg', '--edge', '--accent'];
    svg.setAttribute('style', vars.map(v => `${v}:${cs.getPropertyValue(v)}`).join(';') + ';background:' + cs.getPropertyValue('--bg'));
    return new XMLSerializer().serializeToString(svg);
  }
  function exportChart(fig, kind) {
    const src = svgOf(fig), name = slug(fig.dataset.title);
    if (kind === 'svg') { download(name + '.svg', src, 'image/svg+xml'); return; }
    const img = new Image(), svg = fig.querySelector('svg'), w = +svg.getAttribute('width'), h = +svg.getAttribute('height');
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
      const g = c.getContext('2d'); g.fillStyle = getComputedStyle(document.body).backgroundColor; g.fillRect(0, 0, c.width, c.height); g.scale(2, 2); g.drawImage(img, 0, 0);
      c.toBlob(b => download(name + '.png', b));
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
  }
  function exportModelImage(kind) {
    const svg = $('#canvas'), g = svg.querySelector('g');
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    Array.from(g.children).forEach(ch => { if (ch.classList.contains('bgcatch')) return; const b = ch.getBBox(); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height); });
    if (!isFinite(x0)) return;
    const pad = 20, w = Math.ceil(x1 - x0 + 2 * pad), h = Math.ceil(y1 - y0 + 2 * pad);
    const clone = svg.cloneNode(true), cg = clone.querySelector('g');
    cg.removeAttribute('transform'); cg.querySelector('.bgcatch').remove();
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('width', w); clone.setAttribute('height', h); clone.setAttribute('viewBox', `${x0 - pad} ${y0 - pad} ${w} ${h}`);
    clone.querySelectorAll('.sel, .pend').forEach(n => n.classList.remove('sel', 'pend'));
    const css = Array.from(document.styleSheets).map(ss => { try { return Array.from(ss.cssRules).map(x => x.cssText).filter(x => /#canvas/.test(x)).join('\n'); } catch (e) { return ''; } }).join('\n');
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style'); style.textContent = css; clone.insertBefore(style, clone.firstChild);
    const cs = getComputedStyle(document.documentElement);
    clone.setAttribute('style', ['--ink', '--line', '--edge', '--accent', '--c1', '--c2', '--c3', '--lv', '--lv-ink', '--ind', '--bg', '--panel', '--muted', '--sel', '--good-bg', '--grid'].map(v => `${v}:${cs.getPropertyValue(v)}`).join(';') + `;background:${cs.getPropertyValue('--bg')};font-family:${svg.style.fontFamily}`);
    clone.removeAttribute('data-tool'); clone.removeAttribute('id'); clone.setAttribute('id', 'canvas');
    const src = new XMLSerializer().serializeToString(clone), name = slug(S.name) + '_model';
    if (kind === 'svg') { download(name + '.svg', src, 'image/svg+xml'); return; }
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'), k = 3; c.width = w * k; c.height = h * k; const x = c.getContext('2d'); x.fillStyle = cs.getPropertyValue('--bg'); x.fillRect(0, 0, c.width, c.height); x.scale(k, k); x.drawImage(img, 0, 0); c.toBlob(bl => download(name + '.png', bl)); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
  }

  // ------------------------------------------------------------ appearance
  const PALETTES = {
    theme: null,
    okabe: ['#0072B2', '#D55E00', '#009E73', '#E69F00', '#CC79A7', '#56B4E9'],
    vivid: ['#e11d48', '#2563eb', '#16a34a', '#f59e0b', '#9333ea', '#0891b2'],
    ocean: ['#0c4a6e', '#0284c7', '#0f766e', '#38bdf8', '#14b8a6', '#6366f1'],
    earth: ['#8c510a', '#01665e', '#bf812d', '#35978f', '#543005', '#80cdc1'],
    gray: ['#262626', '#737373', '#a3a3a3', '#404040', '#8a8a8a', '#c4c4c4']
  };
  const FONTS = window.YPEditor.FONTS;
  // theme colour that an "auto" colour field currently shows
  const AUTO = { lvFill: '--lv', lvStroke: '--accent', lvText: '--lv-ink', indFill: '--ind', indStroke: '--edge', indText: '--ink', pathColor: '--edge', outerColor: '--edge', interFill: '--good-bg', interStroke: '--c3', color: '--edge' };
  function applyAppearance() {
    const root = document.documentElement, pal = PALETTES[S.ap.palette];
    ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6'].forEach((v, i) => { if (pal) root.style.setProperty(v, pal[i]); else root.style.removeProperty(v); });
    document.body.style.fontFamily = S.ap.uiFont !== 'system' ? FONTS[S.ap.uiFont] : '';
    root.style.fontSize = ''; document.body.style.fontSize = S.ap.uiScale !== 100 ? (14 * S.ap.uiScale / 100) + 'px' : '';
  }
  function hex(v) { v = (v || '').trim(); if (/^#[0-9a-f]{6}$/i.test(v)) return v; if (/^#[0-9a-f]{3}$/i.test(v)) return '#' + v.slice(1).split('').map(c => c + c).join(''); const m = v.match(/\d+/g); return m && m.length >= 3 ? '#' + m.slice(0, 3).map(x => (+x).toString(16).padStart(2, '0')).join('') : '#000000'; }
  function colorField(scope, key, val, label) {
    const shown = val || hex(getComputedStyle(document.documentElement).getPropertyValue(AUTO[key] || '--ink'));
    return `<label class="cf">${esc(label)}<span><input type="color" data-${scope}="${key}" value="${shown}"><button type="button" class="mini${val ? '' : ' on'}" data-auto-${scope}="${key}">${t('auto_color')}</button></span></label>`;
  }
  const numField = (scope, key, val, label, min, max, step) => `<label>${esc(label)} <output>${val}</output><input type="range" data-${scope}="${key}" min="${min}" max="${max}" step="${step || 1}" value="${val}"></label>`;
  const selField = (scope, key, val, label, opts) => `<label>${esc(label)}<select data-${scope}="${key}">${opts.map(o => `<option value="${o}"${String(val) === String(o) ? ' selected' : ''}>${esc(t('st_' + o))}</option>`).join('')}</select></label>`;
  const chkField = (scope, key, val, label) => `<label class="check"><input type="checkbox" data-${scope}="${key}"${val ? ' checked' : ''}> ${esc(label)}</label>`;

  function presetPreview(p) {
    const D = window.YPEditor.STYLE_DEFAULTS, st = Object.assign({}, D, p), v = k => st[k] || `var(${AUTO[k]})`;
    const lv = st.lvShape === 'ellipse' ? `<ellipse cx="46" cy="22" rx="24" ry="14" style="fill:${v('lvFill')};stroke:${v('lvStroke')}"/>` : `<rect x="22" y="9" width="48" height="26" rx="${st.lvShape === 'rounded' ? 8 : 2}" style="fill:${v('lvFill')};stroke:${v('lvStroke')}"/>`;
    return `<svg viewBox="0 0 120 44" width="120" height="44">${lv}<rect x="86" y="14" width="28" height="16" rx="${st.indShape === 'rounded' ? 5 : 1}" style="fill:${v('indFill')};stroke:${v('indStroke')}"/><line x1="70" y1="22" x2="85" y2="22" style="stroke:${v('pathColor')};stroke-width:1.5"/><rect x="2" y="14" width="10" height="16" style="fill:${v('indFill')};stroke:${v('indStroke')}"/><line x1="12" y1="22" x2="22" y2="22" style="stroke:${v('pathColor')};stroke-width:1.5"/><text x="46" y="25" text-anchor="middle" style="font-size:9px;fill:${v('lvText')};font-family:${FONTS[st.font]}">Aa</text></svg>`;
  }
  function styleBody() {
    const g = editor.style(), P = window.YPEditor.PRESETS;
    return `<div class="presets">${Object.keys(P).map(k => `<button type="button" class="preset" data-preset="${k}">${presetPreview(P[k])}<span>${esc(t('preset_' + k))}</span></button>`).join('')}</div>
      <div class="stgrid">
      <fieldset><legend>${t('st_diagram')}</legend>
        ${selField('g', 'font', g.font, t('st_font'), Object.keys(FONTS))}
        ${numField('g', 'labelFont', g.labelFont, t('st_label_size'), 8, 18, 0.5)}
        ${chkField('g', 'showOuter', g.showOuter, t('st_show_outer'))}${chkField('g', 'showR2', g.showR2, t('st_show_r2'))}
        <label>${t('st_decimals')}<select data-ap="decimals">${[2, 3, 4].map(d => `<option${S.ap.decimals === d ? ' selected' : ''}>${d}</option>`).join('')}</select></label>
      </fieldset>
      <fieldset><legend>${t('st_constructs')}</legend>
        ${selField('g', 'lvShape', g.lvShape, t('st_shape'), ['ellipse', 'rect', 'rounded'])}
        ${numField('g', 'lvW', g.lvW, t('st_width'), 60, 220, 2)}${numField('g', 'lvH', g.lvH, t('st_height'), 30, 120, 2)}
        ${colorField('g', 'lvFill', g.lvFill, t('st_fill'))}${colorField('g', 'lvStroke', g.lvStroke, t('st_border'))}${colorField('g', 'lvText', g.lvText, t('st_text'))}
        ${numField('g', 'lvFont', g.lvFont, t('st_font_size'), 8, 24, 0.5)}${numField('g', 'lvStrokeW', g.lvStrokeW, t('st_border_w'), 0, 5, 0.2)}
        ${chkField('g', 'lvBold', g.lvBold, t('st_bold'))}
      </fieldset>
      <fieldset><legend>${t('st_indicators')}</legend>
        ${selField('g', 'indShape', g.indShape, t('st_shape'), ['rect', 'rounded'])}
        ${numField('g', 'indW', g.indW, t('st_width'), 40, 160, 2)}${numField('g', 'indH', g.indH, t('st_height'), 16, 44, 1)}
        ${colorField('g', 'indFill', g.indFill, t('st_fill'))}${colorField('g', 'indStroke', g.indStroke, t('st_border'))}${colorField('g', 'indText', g.indText, t('st_text'))}
        ${numField('g', 'indFont', g.indFont, t('st_font_size'), 7, 20, 0.5)}
      </fieldset>
      <fieldset><legend>${t('st_arrows')}</legend>
        ${colorField('g', 'pathColor', g.pathColor, t('st_path_color'))}${numField('g', 'pathW', g.pathW, t('st_path_w'), 0.5, 6, 0.1)}
        ${selField('g', 'pathStyle', g.pathStyle, t('st_line_style'), ['solid', 'dashed', 'dotted'])}
        ${colorField('g', 'outerColor', g.outerColor, t('st_outer_color'))}${numField('g', 'outerW', g.outerW, t('st_outer_w'), 0.5, 4, 0.1)}
        ${colorField('g', 'interFill', g.interFill, t('st_inter_fill'))}${colorField('g', 'interStroke', g.interStroke, t('st_inter_stroke'))}
      </fieldset>
      <fieldset><legend>${t('st_app')}</legend>
        <label>${t('st_palette')}<select data-ap="palette">${Object.keys(PALETTES).map(k => `<option value="${k}"${S.ap.palette === k ? ' selected' : ''}>${esc(t('pal_' + k))}</option>`).join('')}</select></label>
        <div class="swatches">${(PALETTES[S.ap.palette] || ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6'].map(v => `var(${v})`)).map(c => `<i style="background:${c}"></i>`).join('')}</div>
        <label>${t('st_ui_font')}<select data-ap="uiFont">${Object.keys(FONTS).map(k => `<option value="${k}"${S.ap.uiFont === k ? ' selected' : ''}>${esc(t('st_' + k))}</option>`).join('')}</select></label>
        <label>${t('st_ui_scale')} <output>${S.ap.uiScale}%</output><input type="range" data-ap="uiScale" min="85" max="130" step="5" value="${S.ap.uiScale}"></label>
      </fieldset></div>`;
  }
  function openStyle() {
    editor.snapshot(); $('#stylebody').innerHTML = styleBody(); $('#styledlg').showModal();
  }
  function resetStyle() {
    editor.snapshot(); editor.model.style = { global: {}, el: {} };
    S.ap.palette = 'theme'; S.ap.decimals = 3; applyAppearance(); afterStyle(true);
  }
  function afterStyle(redraw) {
    if (S.results && S.current && ['pls', 'plsc', 'bootstrap', 'cbsem'].includes(S.current)) applyOverlay(S.current); else editor.render();
    if (redraw && $('#styledlg').open) $('#stylebody').innerHTML = styleBody();
    autosave();
  }
  function setStyle(scope, key, value) {
    const st = editor.model.style;
    if (scope === 'g') { if (value === '' || value === null) delete st.global[key]; else st.global[key] = value; }
    else if (scope === 'el') {
      const id = editor.sel && (editor.sel.id); if (!id) return;
      const e = st.el[id] = st.el[id] || {};
      if (value === '' || value === null) delete e[key]; else e[key] = value;
      if (!Object.keys(e).length) delete st.el[id];
    } else if (scope === 'ap') {
      S.ap[key] = ['decimals', 'uiScale'].includes(key) ? +value : value; applyAppearance();
      if (key === 'uiFont' || key === 'uiScale') prefs(true);
      if (key === 'decimals' && S.view === 'results') renderResults();
    }
  }
  function inputValue(el) { return el.type === 'checkbox' ? el.checked : (el.type === 'range' || el.type === 'number') ? +el.value : el.value; }
  function bindStyle() {
    const handle = (ev, commit) => {
      const el = ev.target; const scope = ['g', 'el', 'ap'].find(s => el.dataset && el.dataset[s] !== undefined); if (!scope) return;
      if (scope === 'el' && !editor._elSnap) { editor.snapshot(); editor._elSnap = true; }
      setStyle(scope, el.dataset[scope], inputValue(el));
      const out = el.parentElement.querySelector('output'); if (out) out.textContent = el.value + (el.dataset.ap === 'uiScale' ? '%' : '');
      const auto = el.closest('.cf'); if (auto) auto.querySelector('button').classList.remove('on');
      afterStyle(false);
      if (commit && scope === 'ap' && el.dataset.ap === 'palette' && $('#styledlg').open) $('#stylebody').innerHTML = styleBody();
    };
    document.addEventListener('input', e => handle(e, false));
    document.addEventListener('change', e => handle(e, true));
    document.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.preset) { editor.model.style.global = JSON.parse(JSON.stringify(window.YPEditor.PRESETS[b.dataset.preset])); afterStyle(true); }
      if (b.dataset.autoG) { setStyle('g', b.dataset.autoG, ''); afterStyle(true); }
      if (b.dataset.autoEl) { setStyle('el', b.dataset.autoEl, ''); afterStyle(false); renderProps(); }
      if (b.dataset.elact === 'reset' && editor.sel) { editor.snapshot(); delete editor.model.style.el[editor.sel.id]; afterStyle(false); renderProps(); }
      if (b.dataset.elact === 'all' && editor.sel) {
        editor.snapshot(); const st = editor.model.style, e = st.el[editor.sel.id] || {};
        const isPath = editor.sel.type === 'path';
        Object.entries(e).forEach(([k, v]) => { st.global[isPath ? { color: 'pathColor', width: 'pathW', style: 'pathStyle' }[k] : k] = v; });
        const ids = isPath ? editor.model.paths.map(p => p.id) : editor.model.constructs.map(c => c.id);
        ids.forEach(id => { delete st.el[id]; });
        afterStyle(false); renderProps(); toast(t('applied_all'), 'good');
      }
    });
  }
  function elStyleHTML(sel) {
    const e = editor.model.style.el[sel.id] || {}, g = editor.style();
    if (sel.type === 'construct') return `<details class="elstyle"><summary>🎨 ${t('appearance')}</summary>
      ${colorField('el', 'lvFill', e.lvFill || '', t('st_fill'))}${colorField('el', 'lvStroke', e.lvStroke || '', t('st_border'))}${colorField('el', 'lvText', e.lvText || '', t('st_text'))}
      ${selField('el', 'lvShape', e.lvShape || g.lvShape, t('st_shape'), ['ellipse', 'rect', 'rounded'])}
      ${numField('el', 'lvW', e.lvW || g.lvW, t('st_width'), 60, 220, 2)}${numField('el', 'lvFont', e.lvFont || g.lvFont, t('st_font_size'), 8, 24, 0.5)}
      ${colorField('el', 'indFill', e.indFill || '', t('st_ind_fill'))}${colorField('el', 'indStroke', e.indStroke || '', t('st_ind_border'))}${colorField('el', 'indText', e.indText || '', t('st_ind_text'))}
      ${colorField('el', 'outerColor', e.outerColor || '', t('st_outer_color'))}
      <div><button data-elact="all">${t('apply_all')}</button><button data-elact="reset">${t('reset')}</button></div></details>`;
    if (sel.type === 'path') return `<details class="elstyle"><summary>🎨 ${t('appearance')}</summary>
      ${colorField('el', 'color', e.color || '', t('st_path_color'))}${numField('el', 'width', e.width || g.pathW, t('st_path_w'), 0.5, 6, 0.1)}
      ${selField('el', 'style', e.style || g.pathStyle, t('st_line_style'), ['solid', 'dashed', 'dotted'])}
      <div><button data-elact="all">${t('apply_all')}</button><button data-elact="reset">${t('reset')}</button></div></details>`;
    return '';
  }

  // ------------------------------------------------------------ help & references
  function renderHelp() {
    const D = window.YPDocs, L = S.lang, el = $('#helpview');
    const nav = `<nav class="secnav"><h4>${t('user_guide')}</h4>${D.guide.map(g => `<button data-help="${g.id}" class="${S.help === g.id ? 'on' : ''}">${esc(g[L].title)}</button>`).join('')}
      <h4>${t('methods_refs')}</h4><button data-help="methods" class="${S.help === 'methods' ? 'on' : ''}">${t('methods')}</button><button data-help="biblio" class="${S.help === 'biblio' ? 'on' : ''}">${t('bibliography')}</button>
      <h4>YouPls</h4><button data-help="about" class="${S.help === 'about' ? 'on' : ''}">${t('about')}</button></nav>`;
    // short author-year label from an APA entry: "Hair et al., 2022"
    const cite = k => {
      const r = D.refs[k].replace(/<[^>]+>/g, ''), yr = (r.match(/\((\d{4}[a-z]?)\)/) || [])[1] || '';
      const names = r.split(/\(\d{4}[a-z]?\)/)[0].split(/,\s*/).map(x => x.replace(/^&\s*/, '').trim()).filter(x => x && !/^([A-Z]\.\s?-?)+|\(Eds?\.\)/.test(x));
      const who = names.length > 2 ? names[0] + ' et al.' : names.join(' & ');
      return `<a href="#ref-${k}" data-ref="${k}">${esc(who + ', ' + yr)}</a>`;
    };
    let body;
    if (S.help === 'methods') body = `<h2>${t('methods')}</h2><p class="note">${t('methods_note')}</p>` + D.methods.map(m => `<section class="card method" id="m-${m.id}"><header><h3>${esc(m[L].title)}</h3></header><p>${esc(m[L].text)}</p><div class="formula">${m.formula}</div><p class="refs">${t('sources')}: ${m.refs.map(cite).join(L === 'ar' ? '؛ ' : '; ')}</p></section>`).join('');
    else if (S.help === 'biblio') body = `<h2>${t('bibliography')}</h2><ol class="biblio">${Object.keys(D.refs).sort().map(k => `<li id="ref-${k}" dir="ltr">${D.refs[k]}</li>`).join('')}</ol>`;
    else if (S.help === 'about') body = `<div class="about"><img src="assets/logo.svg" alt="" width="64" height="64"><h2>YouPls ${D.version}</h2>${D.about[L].split('{v}').join(D.version)}</div>`;
    else { const g = D.guide.find(x => x.id === S.help) || D.guide[0]; body = `<h2>${esc(g[L].title)}</h2><div class="guide">${g[L].html}</div>`; }
    el.innerHTML = `<div class="resbody">${nav}<div class="secout helpout" id="helpout">${body}</div></div>`;
  }
  function openDoc(id) {
    S.help = 'methods'; setView('help');
    requestAnimationFrame(() => { const m = document.getElementById('m-' + id); if (m) { m.scrollIntoView({ block: 'start' }); m.classList.add('flash'); setTimeout(() => m.classList.remove('flash'), 1600); } });
  }

  // ------------------------------------------------------------ views
  function setView(v) {
    S.view = v;
    $$('.tabs [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    $$('main > .view').forEach(el => { el.hidden = el.id !== v + 'view' && !(v === 'model' && el.id === 'modelview'); });
    if (v === 'data') renderData();
    if (v === 'model') { renderModelTabs(); renderIndicators(); renderProps(); requestAnimationFrame(() => { if (!editor._fitted && editor.model.constructs.length) { editor.fit(); editor._fitted = true; } }); }
    if (v === 'results') renderResults();
    if (v === 'help') renderHelp();
  }
  function refreshAll() { applyLang(); setView(S.view); }

  // ------------------------------------------------------------ editor
  const editor = new window.YPEditor($('#canvas'), {
    // re-apply results to the diagram if the structure still matches them (e.g. after undoing a colour change)
    change: () => { renderProps(); renderIndicators(); autosave(); if (['pls', 'plsc', 'bootstrap', 'cbsem'].includes(S.current) && S.results[S.current]) applyOverlay(S.current); },
    select: () => renderProps(),
    render: () => { },
    tool: tl => $$('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === tl)),
    warn: k => toast(t(k), 'bad'),
    rename: id => { const c = editor.byId(id); setTimeout(() => { const i = $('#p_name'); if (i) { i.focus(); i.select(); } }, 30); return c; },
    created: () => setTimeout(() => { const i = $('#p_name'); if (i) { i.focus(); i.select(); } }, 30)
  });

  function autoPrefix() {
    if (!S.ds) return;
    const own = owners(), groups = {};
    S.ds.names.forEach((n, j) => {
      if (S.ds.kinds[j] !== 'num' || own[n]) return;
      const m = n.match(/^(.*?)[\s_\-.]*\d+$/); if (!m || !m[1]) return;
      (groups[m[1]] = groups[m[1]] || []).push(n);
    });
    const keys = Object.keys(groups).filter(k => groups[k].length >= 2);
    if (!keys.length) { toast(t('no_prefix'), 'bad'); return; }
    editor.snapshot();
    keys.forEach((k, i) => {
      const nm = k.charAt(0).toUpperCase() + k.slice(1);
      editor.model.constructs.push({ id: window.YPEditor.newId('c'), name: nm, mode: 'A', indicators: groups[k], x: 200 + (i % 3) * 300, y: 150 + Math.floor(i / 3) * 230, side: 'left' });
    });
    editor.changed(); editor.fit(); toast(t('prefix_done', { n: keys.length }), 'good');
  }

  function loadExample() {
    const ex = window.YP_EXAMPLE;
    if (!ex) { toast(t('example_failed'), 'bad'); return; }
    S.name = t('example_name'); $('#pname').value = S.name; S.results = {};
    setData(ex.csv, 'customer_satisfaction.csv', true);
    S.fromMatrix = null; S.history = []; S.models = [{ name: t('model') + ' 1', model: JSON.parse(JSON.stringify(ex.model)) }]; S.cur = 0;
    editor.history = []; editor.setModel(S.models[0].model); editor._fitted = false;
    setView('model'); toast(t('example_loaded'), 'good'); autosave();
  }

  // ------------------------------------------------------------ wiring
  function readFile(file, cb) { const fr = new FileReader(); fr.onload = () => cb(String(fr.result)); fr.readAsText(file); }
  function bind() {
    $('#csvfile').addEventListener('change', e => {
      const fl = e.target.files[0]; if (!fl) return; e.target.value = '';
      const ext = fl.name.split('.').pop().toLowerCase(), after = txt => { if (setData(txt, fl.name)) { if (!editor.model.constructs.length) setView('model'); } };
      if (ext === 'xlsx' || ext === 'sav') {
        const fr = new FileReader();
        fr.onload = async () => { try { after(ext === 'xlsx' ? await window.YPIO.xlsxToCSV(fr.result) : window.YPIO.savToCSV(fr.result)); } catch (err) { const k = 'err_' + err.message; toast(t('csv_error') + ': ' + (t(k) !== k ? t(k) : err.message), 'bad'); } };
        fr.readAsArrayBuffer(fl);
      } else readFile(fl, after);
    });
    $('#projfile').addEventListener('change', e => { const fl = e.target.files[0]; if (!fl) return; readFile(fl, txt => { try { loadProject(JSON.parse(txt)); toast(t('project_loaded'), 'good'); autosave(); } catch (err) { toast(t('bad_project'), 'bad'); } }); e.target.value = ''; });
    $('#pname').addEventListener('change', e => { S.name = e.target.value.trim() || 'Untitled'; autosave(); });
    $('#lang').addEventListener('click', () => { S.lang = S.lang === 'ar' ? 'en' : 'ar'; prefs(true); refreshAll(); });
    $('#theme').addEventListener('click', () => { S.theme = { auto: 'dark', dark: 'light', light: 'auto' }[S.theme]; applyTheme(); prefs(true); toast(t('theme_' + S.theme)); });
    $('#indsearch').addEventListener('input', renderIndicators);
    $('#cancelrun').addEventListener('click', cancelRun);
    $('#rundlg').addEventListener('submit', e => {
      e.preventDefault(); const kind = $('#rundlg').dataset.kind;
      if (kind === '__compare' || kind === '__groups') {
        const fd = {}; $$('input,select', $('#runfields')).forEach(el => { fd[el.name] = el.value; }); $('#rundlg').close();
        if (kind === '__groups') makeGroups(fd);
        else { const a = S.history.find(h => String(h.id) === fd.cmpA), b = S.history.find(h => String(h.id) === fd.cmpB); S.cmp = { kind: 'cmp', a, b, meta: { kind: 'cmp', model: editor.model, time: new Date().toISOString(), ms: 0 } }; S.section = null; setView('results'); }
        return;
      }
      run(kind);
    });
    $('#covfile').addEventListener('change', e => { const fl = e.target.files[0]; if (!fl) return; e.target.value = ''; readFile(fl, txt => importCovMatrix(txt, fl.name)); });
    $('#runcancel').addEventListener('click', () => $('#rundlg').close());
    const menu = $('#calcmenu');
    $('#calcbtn').addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; });
    document.addEventListener('click', e => { if (!e.target.closest('#calcmenu')) menu.hidden = true; });

    // indicator list: selection + drag
    const list = $('#indlist'); let anchor = null;
    list.addEventListener('click', e => {
      const li = e.target.closest('li[data-col]'); if (!li) return;
      const n = li.dataset.col, all = $$('li[data-col]', list).map(x => x.dataset.col);
      if (e.shiftKey && anchor) { const a = all.indexOf(anchor), b = all.indexOf(n); S.selCols = all.slice(Math.min(a, b), Math.max(a, b) + 1); }
      else if (e.ctrlKey || e.metaKey) S.selCols = S.selCols.includes(n) ? S.selCols.filter(x => x !== n) : S.selCols.concat([n]);
      else S.selCols = S.selCols.length === 1 && S.selCols[0] === n ? [] : [n];
      anchor = n; renderIndicators(); renderProps();
    });
    list.addEventListener('dragstart', e => {
      const li = e.target.closest('li[data-col]'); if (!li) return;
      const names = S.selCols.includes(li.dataset.col) ? S.selCols : [li.dataset.col];
      e.dataTransfer.setData('text/plain', JSON.stringify(names)); e.dataTransfer.effectAllowed = 'copy';
    });

    document.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.view) setView(b.dataset.view);
      if (b.dataset.tool) editor.setTool(b.dataset.tool);
      if (b.dataset.run) { $('#calcmenu').hidden = true; openRun(b.dataset.run); }
      if (b.dataset.kind) { S.cmp = null; S.current = b.dataset.kind; S.section = null; renderResults(); if (['pls', 'plsc', 'bootstrap', 'cbsem'].includes(S.current)) applyOverlay(S.current); }
      if (b.dataset.mtab !== undefined) { const i = +b.dataset.mtab; if (i === S.cur && e.detail === 2) { const nm = window.prompt(t('rename_model'), S.models[i].name); if (nm && nm.trim()) { S.models[i].name = nm.trim(); renderModelTabs(); autosave(); } } else if (i !== S.cur) useModel(i); }
      if (b.dataset.mdel !== undefined) { const i = +b.dataset.mdel; if (S.models.length > 1 && confirm(t('confirm_delete_model', { m: S.models[i].name }))) { syncModel(); S.models.splice(i, 1); S.cur = Math.max(0, Math.min(S.cur - (i < S.cur ? 1 : 0), S.models.length - 1)); editor.setModel(S.models[S.cur].model); renderModelTabs(); autosave(); } }
      if (b.dataset.help) { S.help = b.dataset.help; renderHelp(); $('#helpout').scrollTop = 0; }
      if (b.dataset.doc) openDoc(b.dataset.doc);
      if (b.dataset.sec) { S.section = b.dataset.sec; renderResults(); $('#secout').scrollTop = 0; }
      if (b.dataset.csv) { const tb = TABLES.get(b.dataset.csv); if (tb) download(slug(S.name) + '_' + slug(tb.title) + '.csv', tb.csv, 'text/csv;charset=utf-8'); }
      if (b.dataset.copy) { const tb = TABLES.get(b.dataset.copy); if (tb) { const tsv = tb.csv.replace(/^﻿/, '').split('\n').map(l => l.replace(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/g, '\t')).join('\n'); (navigator.clipboard ? navigator.clipboard.writeText(tsv) : Promise.reject()).then(() => toast(t('copied'), 'good'), () => toast(t('copy_failed'), 'bad')); } }
      if (b.dataset.rmind) { const c = editor.byId(editor.sel.id); editor.snapshot(); c.indicators = c.indicators.filter(n => n !== b.dataset.rmind); editor.changed(); }
      const fig = b.closest('figure.chartbox'); if (fig && b.dataset.act) { exportChart(fig, b.dataset.act); return; }
      switch (b.dataset.act) {
        case 'example': loadExample(); break;
        case 'import': $('#csvfile').click(); break;
        case 'open': $('#projfile').click(); break;
        case 'save': download(slug(S.name) + '.youpls.json', JSON.stringify(projectJSON(true)), 'application/json'); break;
        case 'new': if (confirm(t('confirm_new'))) { S.name = 'Untitled'; $('#pname').value = S.name; S.csv = ''; S.ds = null; S.results = {}; S.history = []; S.fromMatrix = null; editor.history = []; editor.setModel(null); S.models = [{ name: t('model') + ' 1', model: editor.model }]; S.cur = 0; renderModelTabs(); try { localStorage.removeItem(STORE); } catch (e) { } setView('data'); } break;
        case 'undo': editor.undo(); break;
        case 'redo': editor.redo(); break;
        case 'delete': editor.removeSelected(); break;
        case 'layout': editor.autoLayout(); break;
        case 'zin': editor.zoom(1.2); break;
        case 'zout': editor.zoom(1 / 1.2); break;
        case 'fit': editor.fit(); break;
        case 'prefix': autoPrefix(); break;
        case 'assign': if (editor.sel && editor.sel.type === 'construct') { editor.assign(editor.sel.id, S.selCols); S.selCols = []; renderIndicators(); renderProps(); } break;
        case 'addmod': editor.addModerator(editor.sel.id, $('#p_mod').value); break;
        case 'overlay': S.showResults = !S.showResults; b.classList.toggle('on', S.showResults); editor.overlay = S.showResults ? editor._lastOverlay || null : null; editor.render(); break;
        case 'modelimg': exportModelImage('svg'); break;
        case 'modelpng': exportModelImage('png'); break;
        case 'style': openStyle(); break;
        case 'style-reset': resetStyle(); break;
        case 'report': exportReport(); break;
        case 'excel': exportExcel(); break;
        case 'cmpreports': openCompare(); break;
        case 'addscores': addScoresToData(); break;
        case 'addseg': addSegmentsToData(); break;
        case 'groups': openGroups(); break;
        case 'covimport': $('#covfile').click(); break;
        case 'mnew': { syncModel(); const copy = JSON.parse(JSON.stringify(editor.model)); S.models.push({ name: t('model') + ' ' + (S.models.length + 1), model: copy }); useModel(S.models.length - 1); toast(t('model_copied'), 'good'); break; }
        case 'addquad': { const pth = editor.model.paths.find(q => q.id === editor.sel.id); if (!pth) break; if (editor.model.interactions.some(i => i.x === pth.from && i.m === pth.from && i.y === pth.to)) break; const a = editor.byId(pth.from), b = editor.byId(pth.to); editor.snapshot(); editor.model.interactions.push({ id: window.YPEditor.newId('i'), name: a.name + '²', x: pth.from, m: pth.from, y: pth.to, px: (a.x + b.x) / 2, py: Math.max(a.y, b.y) + 90 }); editor.changed(); break; }
        case 'copywriteup': { const w = $('#writeup'); if (w) (navigator.clipboard ? navigator.clipboard.writeText(w.innerText) : Promise.reject()).then(() => toast(t('copied'), 'good'), () => toast(t('copy_failed'), 'bad')); break; }
        case 'rerun': openRun(S.current); break;
      }
    });
    // clickable rows
    document.addEventListener('click', e => {
      const ra = e.target.closest('a[data-ref]');
      if (ra) { e.preventDefault(); S.help = 'biblio'; renderHelp(); const li = document.getElementById('ref-' + ra.dataset.ref); if (li) { li.scrollIntoView({ block: 'center' }); li.classList.add('flash'); setTimeout(() => li.classList.remove('flash'), 1600); } return; }
      const tr = e.target.closest('tr[data-var]');
      if (tr) { S.dataSel = +tr.dataset.var; renderData(); const c = $$('#dataview .card')[1]; if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      const dr = e.target.closest('tr[data-draw]');
      if (dr) {
        const r = S.results[S.current], row = r.rows[+dr.dataset.draw];
        $$('tr.picked').forEach(x => x.classList.remove('picked')); dr.classList.add('picked');
        $('#drawbox').innerHTML = chart(C.histogram(row.draws, { title: row.label, xLabel: t('bootstrap_dist'), marks: [{ value: row.original, label: t('original') }, { value: row.lo, label: '', color: 'var(--c2)', dash: '4 3' }, { value: row.hi, label: '', color: 'var(--c2)', dash: '4 3' }] }), row.label);
      }
    });
    document.addEventListener('keydown', e => {
      if (e.target.closest('input,select,textarea') || S.view !== 'model') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && editor.sel) { e.preventDefault(); editor.removeSelected(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? editor.redo() : editor.undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); editor.redo(); }
      else if (e.key === 'Escape') editor.setTool('select');
      else if (!e.ctrlKey && !e.metaKey && !e.altKey) { const k = e.key.toLowerCase(); if (k === 'v') editor.setTool('select'); if (k === 'c') editor.setTool('construct'); if (k === 'p') editor.setTool('path'); }
    });
    window.addEventListener('resize', () => editor.render());
  }

  // ------------------------------------------------------------- start
  if (/Electron\//.test(navigator.userAgent)) document.documentElement.classList.add('is-desktop');
  // Installable web app (PWA): offline use and a desktop/start-menu app without any download or security warning
  let installEvt = null;
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) && !/Electron\//.test(navigator.userAgent)) navigator.serviceWorker.register('sw.js').catch(() => { });
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('#installbtn').hidden = false; });
  window.addEventListener('appinstalled', () => { $('#installbtn').hidden = true; toast(t('installed'), 'good'); });
  $('#installbtn').addEventListener('click', async () => { if (!installEvt) { setView('help'); S.help = 'desktop'; renderHelp(); return; } installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('#installbtn').hidden = true; });
  prefs(false); applyTheme(); applyAppearance(); bind(); bindStyle();
  let restored = false;
  try { const p = JSON.parse(localStorage.getItem(STORE) || 'null'); if (p) { loadProject(p); restored = true; } } catch (e) { /* ignore */ }
  if (!restored) { editor.setModel(null); refreshAll(); }
  if (restored && editor.model.constructs.length) setView('model');
  window.YouPls = { S, editor, run: openRun };
})();
