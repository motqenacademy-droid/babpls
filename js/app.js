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
    selCols: [], lang: 'ar', theme: 'auto', showResults: true, dataSel: null
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
      if (save) localStorage.setItem(PREF, JSON.stringify({ lang: S.lang, theme: S.theme }));
      else { const p = JSON.parse(localStorage.getItem(PREF) || '{}'); if (p.lang) S.lang = p.lang; if (p.theme) S.theme = p.theme; }
    } catch (e) { /* storage unavailable */ }
  }
  function applyTheme() { if (S.theme === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = S.theme; }

  // ------------------------------------------------------------ utilities
  const f = (v, d) => (v === null || v === undefined || !isFinite(v)) ? '–' : Number(v).toFixed(d === undefined ? 3 : d);
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
    TABLES.set(id, { title: o.title || 'table', csv: toCSV(head, rows.map(r => r.map(c => (c && typeof c === 'object' && 'v' in c) ? c.raw !== undefined ? c.raw : c.v : c))) });
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
    return `<section class="card"><header><h3>${esc(title)}</h3>${btn}</header>${opts.note ? `<p class="note">${opts.note}</p>` : ''}${body}</section>`;
  }

  // ---------------------------------------------------------- persistence
  function projectJSON() {
    return { format: 'youpls', version: 1, name: S.name, data: { name: S.dataName, csv: S.csv }, model: editor.model, settings: S.settings, view: editor.view };
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
    S.results = {}; S.current = null;
    if (p.data && p.data.csv) setData(p.data.csv, p.data.name, true); else { S.csv = ''; S.ds = null; S.dataName = ''; }
    editor.history = []; editor.setModel(p.model);
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
    let h = `<div class="datahead"><h2>${esc(S.dataName)}</h2><span class="pill">${t('rows')}: ${ds.n}</span><span class="pill">${t('variables')}: ${ds.names.length}</span><span class="pill">${t('missing')}: ${d.reduce((a, x) => a + x.missing, 0)}</span></div>`;
    const descRows = d.map(x => [x.name, x.kind === 'cat' ? t('categorical') : t('numeric'), x.n, x.missing, f(x.mean), f(x.median), f(x.min), f(x.max), f(x.sd), f(x.kurtosis), f(x.skewness)]);
    h += card(t('descriptives'), `<p class="note">${t('click_var')}</p>` + table([t('variable'), t('type'), 'N', t('missing'), t('mean'), t('median'), t('min'), t('max'), t('sd'), t('kurtosis'), t('skewness')], descRows, { title: 'descriptives', cls: 'clickable', rowAttr: i => `data-var="${i}"` }));
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
      <div class="actions"><button class="primary" data-act="example">${t('load_example')}</button><button data-act="import">${t('import_csv')}</button><button data-act="open">${t('open_project')}</button></div>
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
    pls: { title: 'an_pls', fields: ['scheme', 'missing', 'maxIter', 'consistent'] },
    plsc: { title: 'an_plsc', task: 'pls', fields: ['scheme', 'missing', 'maxIter'], preset: { consistent: true } },
    bootstrap: { title: 'an_bootstrap', fields: ['samples', 'ci', 'test', 'alpha', 'seed', 'scheme', 'missing', 'consistent'] },
    blindfolding: { title: 'an_blindfolding', fields: ['distance', 'scheme', 'missing'] },
    predict: { title: 'an_predict', fields: ['folds', 'reps', 'seed', 'scheme', 'missing'] },
    ipma: { title: 'an_ipma', fields: ['target', 'scaleMin', 'scaleMax', 'scheme', 'missing'] },
    mga: { title: 'an_mga', fields: ['groupVar', 'permutations', 'seed', 'scheme', 'missing'] },
    nca: { title: 'an_nca', fields: ['permutations', 'scheme', 'missing'] },
    regression: { title: 'an_regression', fields: ['regY', 'regX'], noModel: true }
  };
  const DEF = { samples: 5000, ci: 'percentile', test: 'two', alpha: 0.05, seed: 1, distance: 7, folds: 10, reps: 10, permutations: 1000, scaleMin: '', scaleMax: '' };
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
    if (!S.ds) { toast(t('no_data'), 'bad'); return; }
    const def = TASKS[kind];
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
      maxIter: fd.maxIter ? +fd.maxIter : S.settings.maxIter, consistent: !!fd.consistent
    }, TASKS[kind].preset || {});
    if (fd.scheme) { S.settings.scheme = fd.scheme; S.settings.missing = fd.missing || S.settings.missing; }
    const opts = {
      samples: +fd.samples || 5000, ci: fd.ci, test: fd.test, alpha: +fd.alpha || 0.05, seed: +fd.seed || 0,
      distance: +fd.distance || 7, folds: +fd.folds || 10, reps: +fd.reps || 10, permutations: +fd.permutations || 1000,
      target: fd.target, groupVar: fd.groupVar, y: fd.regY, x: fd.regX
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
          const fn = { pls: () => E.runPLS(S.ds, model, settings), bootstrap: () => E.bootstrap(S.ds, model, settings, opts), blindfolding: () => E.blindfolding(S.ds, model, settings, opts), predict: () => E.plspredict(S.ds, model, settings, opts), ipma: () => E.ipma(S.ds, model, settings, opts), mga: () => E.mga(S.ds, model, settings, opts), nca: () => E.nca(S.ds, model, settings, opts), regression: () => E.regression(S.ds, opts) }[task];
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
    const model = JSON.parse(JSON.stringify(editor.model));
    const bar = $('#busy'); bar.hidden = false; $('#busytext').textContent = t(TASKS[kind].title) + '…'; $('#busybar').style.width = '0%';
    const t0 = performance.now();
    try {
      const r = await runTask(task, model, settings, opts, p => { $('#busybar').style.width = Math.round(p * 100) + '%'; });
      r.meta = { kind, model, settings, opts, time: new Date().toISOString(), ms: Math.round(performance.now() - t0) };
      S.results[kind] = r; S.current = kind; S.section = null;
      if (kind === 'pls' || kind === 'plsc' || kind === 'bootstrap') applyOverlay(kind);
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
  const KIND_ORDER = ['pls', 'plsc', 'bootstrap', 'blindfolding', 'predict', 'ipma', 'mga', 'nca', 'regression'];
  function renderResults() {
    const el = $('#resultsview'), kinds = KIND_ORDER.filter(k => S.results[k]);
    if (!kinds.length) { el.innerHTML = `<div class="empty"><p>${t('no_results')}</p><button class="primary" data-run="pls">${t('an_pls')}</button></div>`; return; }
    if (!S.current || !S.results[S.current]) S.current = kinds[0];
    const r = S.results[S.current];
    TABLES.clear();
    const secs = sections(S.current, r);
    if (!S.section || !secs.some(s => s.id === S.section)) S.section = secs[0].id;
    const sec = secs.find(s => s.id === S.section);
    el.innerHTML = `<div class="restabs" role="tablist">${kinds.map(k => `<button role="tab" data-kind="${k}" class="${k === S.current ? 'on' : ''}">${t(TASKS[k].title)}</button>`).join('')}
        <span class="grow"></span><button data-act="report">${t('export_report')}</button><button data-act="rerun">${t('rerun')}</button></div>
      <div class="resbody"><nav class="secnav">${groupNav(secs)}</nav><div class="secout" id="secout">${metaLine(r)}${sec.html()}</div></div>`;
  }
  function groupNav(secs) {
    let h = '', g = null;
    secs.forEach(s => { if (s.group !== g) { g = s.group; h += `<h4>${esc(t(g))}</h4>`; } h += `<button data-sec="${s.id}" class="${s.id === S.section ? 'on' : ''}">${esc(s.title)}</button>`; });
    return h;
  }
  function metaLine(r) {
    const m = r.meta; let s = `<p class="meta">${esc(t(TASKS[m.kind].title))} · ${new Date(m.time).toLocaleString(S.lang === 'ar' ? 'ar' : 'en')} · ${t('done', { s: (m.ms / 1000).toFixed(1) })}`;
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
      case 'blindfolding': return [sec('g_quality', 'q2', t('q2'), () => card(t('q2'), table([t('construct'), 'SSO', 'SSE', 'Q² (=1-SSE/SSO)', t('q2_com')], r.rows.map(x => [x.construct, f(x.sso, 1), f(x.sseRed, 1), cell(f(x.q2), x.q2 > 0 ? 'good' : 'bad', x.q2), f(x.q2com)]), { title: 'q2' }) + chart(C.bars(r.rows.map(x => ({ label: x.construct, value: x.q2 })), { title: 'Q²', thresholds: [{ value: 0, label: '0' }] }), 'Q2'), { note: t('q2_note', { d: r.distance }) }))];
      case 'predict': return predictSections(r);
      case 'ipma': return ipmaSections(r);
      case 'mga': return mgaSections(r);
      case 'nca': return ncaSections(r);
      case 'regression': return regSections(r);
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
      return card(t('path_coefs'), matrixTable(N, N, N.map((_, i) => N.map((__, j) => r.paths[j][i])), { skip: (i, j) => !has(i, j), title: 'paths' }) + chart(C.bars(items, { title: t('path_coefs') }), 'paths'), { note: t('matrix_note') });
    }));
    s.push(sec('g_final', 'effects', t('total_effects'), () => {
      const rows = []; N.forEach((n, j) => N.forEach((m, i) => { const tot = r.total[j][i]; if (i !== j && Math.abs(tot) > 1e-12) rows.push([m + ' → ' + n, f(r.paths[j][i]), f(tot - r.paths[j][i]), f(tot)]); }));
      let h = card(t('total_effects'), table([t('relationship'), t('direct'), t('indirect_total'), t('total')], rows, { title: 'effects' }));
      if (r.specific.length) h += card(t('specific_indirect'), table([t('path'), t('value')], r.specific.map(x => [x.path.join(' → '), f(x.value)]), { title: 'specific' }));
      return h;
    }));
    s.push(sec('g_final', 'outer', t('outer_loadings'), () => {
      const items = []; const rows = [];
      N.forEach((n, j) => r.indicators[j].forEach((ind, q) => { rows.push([ind, n, cell(f(r.loadings[j][q]), r.modes[j] === 'A' && r.loadings[j][q] < 0.708 ? (r.loadings[j][q] < 0.4 ? 'bad' : 'warn') : '', r.loadings[j][q]), f(r.weights[j][q]), f(r.outerVIF[j][q])]); if (!r.isInter[j]) items.push({ label: ind, value: r.loadings[j][q] }); }));
      return card(t('outer_model'), table([t('indicator'), t('construct'), t('loading'), t('weight'), 'VIF'], rows, { title: 'outer' }) + chart(C.bars(items, { title: t('outer_loadings'), thresholds: [{ value: 0.708, label: '0.708' }] }), 'loadings'), { note: t('loading_note') });
    }));
    s.push(sec('g_final', 'r2', t('r2'), () => card(t('r2'), table([t('construct'), 'R²', t('r2adj')], endo.map(j => [N[j], f(r.r2[j]), f(r.r2adj[j])]), { title: 'r2' }) + chart(C.bars(endo.map(j => ({ label: N[j], value: r.r2[j] })), { title: 'R²', max: 1, thresholds: [{ value: 0.25, label: '0.25' }, { value: 0.5, label: '0.50' }, { value: 0.75, label: '0.75' }] }), 'r2'), { note: t('r2_note') })));
    s.push(sec('g_final', 'f2', t('f2'), () => {
      const items = []; N.forEach((n, j) => r.pred[j].forEach(i => items.push({ label: N[i] + ' → ' + n, value: r.f2[i][j] })));
      return card(t('f2'), matrixTable(N, N, r.f2, { skip: (i, j) => !has(i, j), title: 'f2', cls: v => v >= 0.35 ? 'good' : v >= 0.02 ? '' : 'warn' }) + chart(C.bars(items, { title: 'f²', thresholds: [{ value: 0.02, label: '0.02' }, { value: 0.15, label: '0.15' }, { value: 0.35, label: '0.35' }] }), 'f2'), { note: t('f2_note') });
    }));
    s.push(sec('g_final', 'lvcorr', t('lv_corr'), () => card(t('lv_corr'), chart(C.heatmap(N, N, r.lvCorr, { lower: true }), 'lvcorr') + matrixTable(N, N, r.lvCorr, { title: 'lvcorr' }))));
    if (r.inter.length) s.push(sec('g_final', 'slopes', t('simple_slopes'), () => r.inter.map(it => {
      const b = k => r.stats['path|' + k] || 0;
      const bx = b(it.x + ' -> ' + it.y), bm = b(it.m + ' -> ' + it.y), bi = b(it.name + ' -> ' + it.y);
      const line = mv => ({ points: [-2, 2].map(x => [x, bx * x + bm * mv + bi * x * mv]), label: it.m + (mv > 0 ? ' +1 SD' : mv < 0 ? ' -1 SD' : ' ' + t('mean')) });
      return card(t('simple_slopes') + ': ' + it.name, chart(C.scatter([], { lines: [line(-1), line(0), line(1)], xLabel: it.x, yLabel: it.y, title: it.name + ' → ' + it.y, xmin: -2, xmax: 2 }), 'slopes'), { note: t('slopes_note') });
    }).join('')));
    // quality
    s.push(sec('g_quality', 'rel', t('reliability'), () => {
      const rows = real.map(j => { const b = r.reliability[j]; return [N[j], cell(f(b.alpha), b.alpha < 0.7 ? 'warn' : '', b.alpha), cell(f(b.rhoA), b.rhoA < 0.7 ? 'warn' : '', b.rhoA), cell(f(b.rhoC), b.rhoC < 0.7 ? 'warn' : b.rhoC > 0.95 ? 'warn' : '', b.rhoC), cell(f(b.ave), b.ave < 0.5 ? 'bad' : 'good', b.ave)]; });
      const bar = (key, title, thr) => chart(C.bars(real.map(j => ({ label: N[j], value: r.reliability[j][key] })), { title, width: 460, max: 1, thresholds: [{ value: thr, label: String(thr) }] }), title);
      return card(t('reliability'), table([t('construct'), "Cronbach's α", 'ρA (rho_a)', 'ρc (rho_c)', 'AVE'], rows, { title: 'reliability' }) +
        `<div class="chartgrid">${bar('alpha', "Cronbach's α", 0.7)}${bar('rhoA', 'ρA', 0.7)}${bar('rhoC', 'ρc', 0.7)}${bar('ave', 'AVE', 0.5)}</div>`, { note: t('rel_note') + (r.settings.consistent ? ' ' + t('plsc_note') : '') });
    }));
    s.push(sec('g_quality', 'htmt', 'HTMT', () => {
      const n = real.map(j => N[j]), M = real.map(i => real.map(j => r.htmt[i][j]));
      return card(t('htmt'), chart(C.heatmap(n, n, M, { lower: true, hideDiag: true, threshold: 0.85, min: 0, max: 1 }), 'htmt') + matrixTable(n, n, M, { skip: (i, j) => j >= i, cls: v => v >= 0.9 ? 'bad' : v >= 0.85 ? 'warn' : 'good', title: 'htmt' }), { note: t('htmt_note') });
    }));
    s.push(sec('g_quality', 'fl', t('fornell'), () => {
      const n = real.map(j => N[j]), M = real.map(i => real.map(j => r.fornell[i][j]));
      return card(t('fornell'), matrixTable(n, n, M, { skip: (i, j) => j > i, cls: (v, i, j) => i === j ? 'diag' : (Math.abs(v) > Math.min(M[i][i], M[j][j]) ? 'bad' : ''), title: 'fornell' }), { note: t('fl_note') });
    }));
    s.push(sec('g_quality', 'cross', t('cross_loadings'), () => {
      const own = {}; N.forEach((n, j) => r.indicators[j].forEach(ind => { if (!r.isInter[j]) own[ind] = j; }));
      const rows = r.crossNames.map((ind, a) => [ind].concat(real.map(j => cell(f(r.cross[a][j]), own[ind] === j ? 'diag' : (Math.abs(r.cross[a][j]) > Math.abs(r.cross[a][own[ind]]) ? 'bad' : ''), r.cross[a][j]))));
      return card(t('cross_loadings'), table([t('indicator')].concat(real.map(j => N[j])), rows, { title: 'cross' }), { note: t('cross_note') });
    }));
    s.push(sec('g_quality', 'vif', t('collinearity'), () => {
      const rows = []; N.forEach((n, j) => r.indicators[j].forEach((ind, q) => rows.push([ind, n, cell(f(r.outerVIF[j][q]), r.outerVIF[j][q] >= 5 ? 'bad' : r.outerVIF[j][q] >= 3 ? 'warn' : '', r.outerVIF[j][q])])));
      return card(t('outer_vif'), table([t('indicator'), t('construct'), 'VIF'], rows, { title: 'outer_vif' })) +
        card(t('inner_vif'), matrixTable(N, N, r.innerVIF, { skip: (i, j) => !has(i, j), cls: v => v >= 5 ? 'bad' : v >= 3 ? 'warn' : '', title: 'inner_vif' }), { note: t('vif_note') });
    }));
    s.push(sec('g_quality', 'fit', t('model_fit'), () => {
      const a = r.fit.saturated, b = r.fit.estimated;
      const rows = [['SRMR', cell(f(a.srmr), a.srmr > 0.08 ? 'warn' : 'good', a.srmr), f(b.srmr)], ['d_ULS', f(a.dULS), f(b.dULS)], ['d_G', f(a.dG), f(b.dG)], ['Chi²', f(a.chi2), f(b.chi2)], ['NFI', f(a.nfi), f(b.nfi)]];
      return card(t('model_fit'), table(['', t('saturated'), t('estimated')], rows, { title: 'fit' }), { note: t('fit_note') }) +
        card(t('selection'), table([t('construct'), 'AIC', 'BIC', 'HQ'], r.selection.map(x => [x.construct, f(x.aic), f(x.bic), f(x.hq)]), { title: 'selection' }), { note: t('selection_note') });
    }));
    // data
    s.push(sec('g_data', 'scores', t('lv_scores'), () => {
      const rows = r.scores[0].map((_, i) => [String(r.rows[i] + 1)].concat(r.scores.map(sc => f(sc[i], 4))));
      return card(t('lv_scores'), table(['#'].concat(N), rows, { title: 'lv_scores' }));
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
        return card(t('bg_' + g), tbl + `<div id="drawbox" class="note">${t('click_row_hist')}</div>` + ciChart(rows, g), { note: (g === 'htmt' ? t('htmt_boot_note') : t('boot_note', { b: r.samples, f: r.failed, test: t('opt_' + r.test) })) });
      }));
    });
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
        chart(C.bars(r.rows.map(x => ({ label: x.indicator, value: x.q2 })), { title: 'Q²predict', thresholds: [{ value: 0, label: '0' }] }), 'q2predict'), { note: t('pp_note', { k: r.folds, r: r.reps }) })),
      sec('g_final', 'pp_lv', t('pp_constructs'), () => card(t('pp_constructs'), table([t('construct'), 'Q²predict', 'RMSE', 'MAE'], r.lvRows.map(x => [x.construct, f(x.q2), f(x.rmse), f(x.mae)]), { title: 'plspredict_lv' }))),
      sec('g_data', 'pp_err', t('pp_errors'), () => card(t('pp_errors'), `<div class="chartgrid">${r.rows.map(x => chart(C.histogram(x.errors, { title: x.indicator + ' (skew ' + f(x.errSkew, 2) + ')', width: 360, height: 200, marks: [{ value: 0, label: '0' }] }), x.indicator)).join('')}</div>`, { note: t('pp_err_note') }))
    ];
  }

  function ipmaSections(r) {
    const lv = r.lvRows, ind = r.indRows;
    const mi = a => a.reduce((s, x) => s + x.importance, 0) / a.length, mp = a => a.reduce((s, x) => s + x.performance, 0) / a.length;
    return [
      sec('g_final', 'ip_lv', t('ipma_constructs'), () => card(t('ipma_constructs') + ' – ' + r.target, chart(C.scatter(lv.map(x => ({ x: x.importance, y: x.performance, label: x.construct })), { title: t('ipma_map'), xLabel: t('importance'), yLabel: t('performance'), quadrants: { x: mi(lv), y: mp(lv) } }), 'ipma') +
        table([t('construct'), t('importance'), t('performance')], lv.map(x => [x.construct, f(x.importance), f(x.performance, 2)]), { title: 'ipma_lv' }), { note: t('ipma_note', { p: f(r.targetPerformance, 2) }) })),
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
        out.push(sec('g_final', 'm' + k + g, t('bg_' + g), () => card(t('bg_' + g) + ' – ' + lab, table([t('parameter'), res.g1 + ` (n=${res.n1})`, res.g2 + ` (n=${res.n2})`, t('difference'), t('perm_p')],
          rows.map(x => [x.label, f(x.g1), f(x.g2), f(x.diff), cell(fp(x.p) + ' ' + stars(x.p), x.p < 0.05 ? 'good' : '', x.p)]), { title: 'mga_' + g }) +
          (g === 'path' ? chart(C.grouped(rows.map(x => ({ label: x.label, values: [x.g1, x.g2] })), [res.g1, res.g2], { title: t('path_coefs') }), 'mga') : ''), { note: t('mga_note', { p: res.permutations }) })));
      });
      out.push(sec('g_quality', 'micom' + k, 'MICOM', () => card(t('micom2'), table([t('construct'), 'c', '5% quantile', t('perm_p'), t('result')], res.micom.map(x => [x.construct, f(x.c, 4), f(x.c5, 4), fp(x.pc), cell(x.c >= x.c5 ? t('established') : t('not_established'), x.c >= x.c5 ? 'good' : 'bad')]), { title: 'micom2' }), { note: t('micom2_note') }) +
        card(t('micom3'), table([t('construct'), t('mean_diff'), '2.5%', '97.5%', t('perm_p'), t('logvar_ratio'), '2.5%', '97.5%', t('perm_p')], res.micom.map(x => [x.construct, f(x.meanDiff), f(x.meanLo), f(x.meanHi), cell(fp(x.pMean), x.pMean < 0.05 ? 'warn' : 'good', x.pMean), f(x.varDiff), f(x.varLo), f(x.varHi), cell(fp(x.pVar), x.pVar < 0.05 ? 'warn' : 'good', x.pVar)]), { title: 'micom3' }), { note: t('micom3_note') })));
    });
    return out;
  }

  function ncaSections(r) {
    return [sec('g_final', 'nca_d', t('nca_effects'), () => card(t('nca_effects'), table([t('relationship'), t('effect_size_d'), t('perm_p'), t('result')], r.rows.map(x => [x.x + ' → ' + x.y, f(x.d), fp(x.p), cell(x.d >= 0.1 && x.p < 0.05 ? t('necessary') : t('not_necessary'), x.d >= 0.1 && x.p < 0.05 ? 'good' : '')]), { title: 'nca' }), { note: t('nca_note') })),
      sec('g_final', 'nca_plot', t('nca_plots'), () => r.rows.map(x => card(x.x + ' → ' + x.y, `<div class="chartgrid">${chart(C.scatter(x.points.map(p => ({ x: p[0], y: p[1] })), { step: x.steps, title: 'CE-FDH  d = ' + f(x.d), xLabel: x.x, yLabel: x.y }), 'nca')}${table([x.y + ' %', x.x + ' % ' + t('required')], x.bottleneck.map(b => [String(b.y), b.x === null ? 'NA' : f(b.x, 1)]), { title: 'bottleneck' })}</div>`)).join(''))];
  }

  function regSections(r) {
    return [sec('g_final', 'reg', t('an_regression'), () => card(r.y + ' ~ ' + r.terms.slice(1).map(x => x.name).join(' + '),
      `<p class="meta">N = ${r.n} · R² = ${f(r.r2)} · ${t('r2adj')} = ${f(r.r2adj)} · F(${r.df1}, ${r.df2}) = ${f(r.F, 2)} · p = ${fp(r.pF)}</p>` +
      table([t('term'), 'B', 'β', 'SE', 't', 'p', 'VIF'], r.terms.map(x => [x.name, f(x.b), f(x.beta), f(x.se), f(x.t), cell(fp(x.p) + ' ' + stars(x.p), x.p < 0.05 ? 'good' : '', x.p), f(x.vif)]), { title: 'regression' }) +
      chart(C.scatter(r.residuals.map(p => ({ x: p[0], y: p[1] })), { title: t('residual_plot'), xLabel: t('fitted'), yLabel: t('residual') }), 'residuals')))];
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
  function exportModelImage() {
    const svg = $('#canvas'), r = svg.getBoundingClientRect(), clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('width', r.width); clone.setAttribute('height', r.height); clone.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
    const css = Array.from(document.styleSheets).map(ss => { try { return Array.from(ss.cssRules).map(x => x.cssText).filter(x => /#canvas|:root/.test(x)).join('\n'); } catch (e) { return ''; } }).join('\n');
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style'); style.textContent = css; clone.insertBefore(style, clone.firstChild);
    const cs = getComputedStyle(document.documentElement);
    clone.setAttribute('style', ['--ink', '--line', '--edge', '--accent', '--c1', '--c2', '--c3', '--lv', '--lv-ink', '--ind', '--bg', '--panel', '--muted', '--sel'].map(v => `${v}:${cs.getPropertyValue(v)}`).join(';') + ';background:' + cs.getPropertyValue('--bg'));
    download(slug(S.name) + '_model.svg', new XMLSerializer().serializeToString(clone), 'image/svg+xml');
  }

  // ------------------------------------------------------------ views
  function setView(v) {
    S.view = v;
    $$('.tabs [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    $$('main > .view').forEach(el => { el.hidden = el.id !== v + 'view' && !(v === 'model' && el.id === 'modelview'); });
    if (v === 'data') renderData();
    if (v === 'model') { renderIndicators(); renderProps(); requestAnimationFrame(() => { if (!editor._fitted && editor.model.constructs.length) { editor.fit(); editor._fitted = true; } }); }
    if (v === 'results') renderResults();
  }
  function refreshAll() { applyLang(); setView(S.view); }

  // ------------------------------------------------------------ editor
  const editor = new window.YPEditor($('#canvas'), {
    change: () => { renderProps(); renderIndicators(); autosave(); },
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
    editor.history = []; editor.setModel(JSON.parse(JSON.stringify(ex.model))); editor._fitted = false;
    setView('model'); toast(t('example_loaded'), 'good'); autosave();
  }

  // ------------------------------------------------------------ wiring
  function readFile(file, cb) { const fr = new FileReader(); fr.onload = () => cb(String(fr.result)); fr.readAsText(file); }
  function bind() {
    $('#csvfile').addEventListener('change', e => { const fl = e.target.files[0]; if (!fl) return; readFile(fl, txt => { if (setData(txt, fl.name)) { if (!editor.model.constructs.length) setView('model'); } }); e.target.value = ''; });
    $('#projfile').addEventListener('change', e => { const fl = e.target.files[0]; if (!fl) return; readFile(fl, txt => { try { loadProject(JSON.parse(txt)); toast(t('project_loaded'), 'good'); autosave(); } catch (err) { toast(t('bad_project'), 'bad'); } }); e.target.value = ''; });
    $('#pname').addEventListener('change', e => { S.name = e.target.value.trim() || 'Untitled'; autosave(); });
    $('#lang').addEventListener('click', () => { S.lang = S.lang === 'ar' ? 'en' : 'ar'; prefs(true); refreshAll(); });
    $('#theme').addEventListener('click', () => { S.theme = { auto: 'dark', dark: 'light', light: 'auto' }[S.theme]; applyTheme(); prefs(true); toast(t('theme_' + S.theme)); });
    $('#indsearch').addEventListener('input', renderIndicators);
    $('#cancelrun').addEventListener('click', cancelRun);
    $('#rundlg').addEventListener('submit', e => { e.preventDefault(); run($('#rundlg').dataset.kind); });
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
      if (b.dataset.kind) { S.current = b.dataset.kind; S.section = null; renderResults(); if (['pls', 'plsc', 'bootstrap'].includes(S.current)) applyOverlay(S.current); }
      if (b.dataset.sec) { S.section = b.dataset.sec; renderResults(); $('#secout').scrollTop = 0; }
      if (b.dataset.csv) { const tb = TABLES.get(b.dataset.csv); if (tb) download(slug(S.name) + '_' + slug(tb.title) + '.csv', tb.csv, 'text/csv;charset=utf-8'); }
      if (b.dataset.copy) { const tb = TABLES.get(b.dataset.copy); if (tb) { const tsv = tb.csv.replace(/^﻿/, '').split('\n').map(l => l.replace(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/g, '\t')).join('\n'); (navigator.clipboard ? navigator.clipboard.writeText(tsv) : Promise.reject()).then(() => toast(t('copied'), 'good'), () => toast(t('copy_failed'), 'bad')); } }
      if (b.dataset.rmind) { const c = editor.byId(editor.sel.id); editor.snapshot(); c.indicators = c.indicators.filter(n => n !== b.dataset.rmind); editor.changed(); }
      const fig = b.closest('figure.chartbox'); if (fig && b.dataset.act) { exportChart(fig, b.dataset.act); return; }
      switch (b.dataset.act) {
        case 'example': loadExample(); break;
        case 'import': $('#csvfile').click(); break;
        case 'open': $('#projfile').click(); break;
        case 'save': download(slug(S.name) + '.youpls.json', JSON.stringify(projectJSON(), null, 1), 'application/json'); break;
        case 'new': if (confirm(t('confirm_new'))) { S.name = 'Untitled'; $('#pname').value = S.name; S.csv = ''; S.ds = null; S.results = {}; editor.history = []; editor.setModel(null); try { localStorage.removeItem(STORE); } catch (e) { } setView('data'); } break;
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
        case 'modelimg': exportModelImage(); break;
        case 'report': exportReport(); break;
        case 'rerun': openRun(S.current); break;
      }
    });
    // clickable rows
    document.addEventListener('click', e => {
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
  prefs(false); applyTheme(); bind();
  let restored = false;
  try { const p = JSON.parse(localStorage.getItem(STORE) || 'null'); if (p) { loadProject(p); restored = true; } } catch (e) { /* ignore */ }
  if (!restored) { editor.setModel(null); refreshAll(); }
  if (restored && editor.model.constructs.length) setView('model');
  window.YouPls = { S, editor, run: openRun };
})();
