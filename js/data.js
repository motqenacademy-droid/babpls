/*
 * BabPls data engine: the editable dataset (SPSS-style variables with metadata), its conversion to the analysis
 * dataset `ds`, a safe expression language (no eval / Function) and the data transformations of the Transform menu.
 * UMD: window.YPData in the browser, module.exports in Node (tests/data.test.js).
 *
 * Dataset  D = { n, vars: [Var], filter: null | { expr, mask: Uint8Array (1 = case selected), ver }, readOnly }
 * Var      = { name, label, type: 'numeric' | 'categorical' | 'string' | 'date', measure: 'scale' | 'ordinal' | 'nominal',
 *              measureSet (false: inferred from the data), decimals, labels: [[code, label]...] (value labels),
 *              missing: { codes: [...], lo, hi } (user-missing values; lo/hi = range or null), role, width (characters),
 *              align: 'auto' | 'left' | 'center' | 'right', values: Float64Array (NaN = system-missing) or string[] }
 * Dates are stored as days since 1970-01-01 (UTC; fractions are the time of day).
 * Columns are replaced, not modified, by every operation except single-cell edits (see js/dataview.js: undo history).
 */
(function (root) {
  'use strict';
  let SEQ = 0; // version stamps: a column's analysis copy is cached until its stamp changes
  const touch = v => { v._v = ++SEQ; return v; };
  const TYPES = ['numeric', 'categorical', 'string', 'date'], MEASURES = ['scale', 'ordinal', 'nominal'], ROLES = ['input', 'target', 'both', 'none'];
  const isStr = v => v.type === 'string';

  // ------------------------------------------------------------------ variables
  function newVar(name, type, n, o) {
    type = type || 'numeric';
    const v = Object.assign({ name, label: '', type, measure: type === 'categorical' || type === 'string' ? 'nominal' : 'scale', measureSet: false, decimals: type === 'numeric' ? 2 : 0, labels: [], missing: { codes: [], lo: null, hi: null }, role: 'input', width: 10, align: 'auto' }, o || {});
    if (!v.values) v.values = type === 'string' ? new Array(n).fill('') : new Float64Array(n).fill(NaN);
    return touch(v);
  }
  function inferDecimals(a) {
    let d = 0; const step = Math.max(1, Math.floor(a.length / 4000));
    for (let i = 0; i < a.length && d < 4; i += step) { const x = a[i]; if (!isFinite(x)) continue; while (d < 4 && Math.abs(Math.round(x * Math.pow(10, d)) - x * Math.pow(10, d)) > 1e-7 * Math.max(1, Math.abs(x) * Math.pow(10, d))) d++; }
    return d;
  }
  // measurement level from the data (as the pickers always did): 2–12 distinct values = ordinal, otherwise scale
  function inferMeasure(v) {
    if (v.type === 'categorical' || v.type === 'string') return 'nominal';
    if (v.type === 'date') return 'scale';
    const seen = new Set(), a = v.values;
    for (let i = 0; i < a.length; i++) { const x = a[i]; if (x === x && !userMissing(v, x)) { seen.add(x); if (seen.size > 12) return 'scale'; } }
    return seen.size >= 2 ? 'ordinal' : 'scale';
  }
  function effMeasure(v) {
    if (v.measureSet) return v.measure;
    if (v._mv !== v._v) { v._m = inferMeasure(v); v._mv = v._v; }
    return v._m;
  }
  function userMissing(v, x) {
    const m = v.missing; if (!m) return false;
    if (m.codes.length && m.codes.indexOf(x) >= 0) return true;
    return m.lo !== null && m.hi !== null && typeof x === 'number' && x >= m.lo && x <= m.hi;
  }
  const isMissing = (v, x) => (isStr(v) ? x === '' || x === undefined || x === null : x !== x) || userMissing(v, x);
  const labelOf = (v, x) => { for (const p of v.labels) if (p[0] === x) return p[1]; return undefined; };
  // values as numbers with user-missing values set to NaN (strings: null)
  function numeric(v) {
    if (isStr(v)) return null;
    const a = v.values, out = new Float64Array(a.length), m = v.missing, plain = !m.codes.length && (m.lo === null || m.hi === null);
    for (let i = 0; i < a.length; i++) out[i] = plain ? a[i] : userMissing(v, a[i]) ? NaN : a[i];
    return out;
  }

  // ------------------------------------------------------------------ dates
  const DAY = 86400000;
  function parseDate(s) {
    s = String(s).trim(); if (!s) return NaN;
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?)?Z?$/);
    if (m) { const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), 0) + (+(m[6] || 0)) * 1000; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? ms / DAY : NaN; }
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); // day/month/year
    if (m) { const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])); return d.getUTCMonth() === +m[2] - 1 ? d.getTime() / DAY : NaN; }
    return NaN;
  }
  function formatDate(days) {
    if (!isFinite(days)) return '';
    const ms = Math.round(days * DAY), d = new Date(ms), p = x => String(x).padStart(2, '0');
    const day = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`, t = ms - Math.floor(days) * DAY;
    return Math.abs(ms % DAY) > 500 && t ? `${day} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` + (d.getUTCSeconds() ? ':' + p(d.getUTCSeconds()) : '') : day;
  }

  // ------------------------------------------------------------------ display & input
  function fmtNum(x, dec) {
    if (x !== x) return '';
    if (!isFinite(x)) return x > 0 ? '∞' : '-∞';
    let s = dec === null || dec === undefined ? String(+x.toPrecision(10)) : x.toFixed(Math.max(0, Math.min(15, dec)));
    if (/^-0\.?0*$/.test(s)) s = s.slice(1);
    return s;
  }
  // text shown in a cell: value labels when `labels` is true, codes otherwise
  function format(v, x, labels) {
    if (isStr(v)) return x === undefined || x === null ? '' : String(x);
    if (x !== x) return '';
    if (labels && v.labels.length) { const l = labelOf(v, x); if (l !== undefined) return l; }
    if (v.type === 'date') return formatDate(x);
    if (v.type === 'categorical') return fmtNum(x, Number.isInteger(x) ? 0 : null);
    return fmtNum(x, v.decimals);
  }
  function parseNumber(s) {
    s = String(s).trim().replace(/[  \s]/g, '').replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660)).replace(/٫/g, '.').replace(/^−/, '-');
    if (s === '') return NaN;
    if (/^[-+]?\d+,\d+$/.test(s)) s = s.replace(',', '.'); // decimal comma
    const x = Number(s);
    return s !== '' && isFinite(x) ? x : undefined;
  }
  // typed or pasted text → value of variable v: { value } or { value, label: [code, text] } (a new category) or { error }
  function parseCell(v, text) {
    const s = text === undefined || text === null ? '' : String(text).replace(/\r$/, '');
    if (isStr(v)) return { value: s };
    const t = s.trim();
    if (t === '' || /^(na|nan|null|\.|sysmis)$/i.test(t)) return { value: NaN };
    for (const p of v.labels) if (p[1] === t) return { value: p[0] };
    const low = t.toLowerCase(); for (const p of v.labels) if (String(p[1]).toLowerCase() === low) return { value: p[0] };
    if (v.type === 'date') { const d = parseDate(t); if (d === d) return { value: d }; const x = parseNumber(t); return x === undefined ? { error: 'dv_bad_date' } : { value: x }; }
    const x = parseNumber(t);
    if (x !== undefined) return { value: x };
    if (v.type === 'categorical') { let mx = 0; v.labels.forEach(p => { if (p[0] > mx) mx = p[0]; }); for (const y of v.values) if (y > mx) mx = y; const c = Math.floor(mx) + 1; return { value: c, label: [c, t] }; }
    return { error: 'dv_not_number' };
  }

  // ------------------------------------------------------------------ names
  const NAME_RE = /^[\p{L}_][\p{L}\p{N}_.]*$/u;
  function nameError(D, name, self) {
    const s = String(name || '').trim();
    if (!s) return 'dv_name_empty';
    if (/[\s,"'`()\[\]{}+\-*/^=<>!&|~;:]/.test(s) || !NAME_RE.test(s)) return 'dv_name_chars';
    if (/^(and|or|not|to)$/i.test(s)) return 'dv_name_reserved';
    if (D.vars.some((v, j) => j !== self && v.name.toLowerCase() === s.toLowerCase())) return 'dv_name_taken';
    return null;
  }
  // a valid, unused name built from `base` (invalid characters become _, then _2, _3 ... until unique)
  function uniqueName(D, base, taken) {
    let b = String(base || 'V').trim().replace(/[^\p{L}\p{N}_.]+/gu, '_').replace(/^_+(?=.)/, '') || 'V';
    if (!/^[\p{L}_]/u.test(b)) b = 'V' + b;
    if (/^(and|or|not|to)$/i.test(b)) b += '_';
    const used = new Set(D.vars.map(v => v.name.toLowerCase()).concat((taken || []).map(x => x.toLowerCase())));
    let s = b, k = 2; while (used.has(s.toLowerCase())) s = b + '_' + k++;
    return s;
  }
  // rename an indicator in every model (constructs' indicator lists); returns the number of references changed
  function renameInModels(models, from, to) {
    let k = 0;
    (models || []).forEach(m => { const mo = m && m.model ? m.model : m; if (!mo || !mo.constructs) return; mo.constructs.forEach(c => { c.indicators = c.indicators.map(x => (x === from ? (k++, to) : x)); }); });
    return k;
  }
  function removeFromModels(models, names) {
    const set = new Set(names); let k = 0;
    (models || []).forEach(m => { const mo = m && m.model ? m.model : m; if (!mo || !mo.constructs) return; mo.constructs.forEach(c => { const b = c.indicators.length; c.indicators = c.indicators.filter(x => !set.has(x)); k += b - c.indicators.length; }); });
    return k;
  }

  // ------------------------------------------------------------------ dataset construction
  // from the parsed CSV dataset of the engine (E.parseCSV): text columns become categorical variables (codes 1..k)
  function fromDS(ds) {
    const D = { n: ds.n, vars: [], filter: null, readOnly: false };
    ds.names.forEach((name, j) => {
      const col = Float64Array.from(ds.cols[j]);
      if (ds.kinds[j] === 'cat') D.vars.push(newVar(name, 'categorical', ds.n, { values: col, decimals: 0, labels: (ds.labels[j] || []).map((l, i) => [i + 1, String(l)]) }));
      else D.vars.push(newVar(name, 'numeric', ds.n, { values: col, decimals: inferDecimals(col) }));
    });
    return D;
  }
  // from variables with a dictionary (IO.readSAV): measurement levels given by the file are kept as set
  function fromVars(list, n) {
    const D = { n, vars: [], filter: null, readOnly: false };
    list.forEach(m => {
      const type = TYPES.includes(m.type) ? m.type : 'numeric', name = nameError(D, m.name) ? uniqueName(D, m.name) : m.name;
      const v = newVar(name, type, n, { values: m.values, label: m.label || '', decimals: m.decimals !== undefined && m.decimals !== null ? m.decimals : 2, labels: (m.labels || []).map(p => p.slice()) });
      if (m.missing) v.missing = { codes: m.missing.codes.slice(0, 50), lo: m.missing.lo, hi: m.missing.hi };
      if (m.measure && MEASURES.includes(m.measure)) { v.measure = m.measure; v.measureSet = true; }
      if (m.align) v.align = m.align;
      if (m.width) v.width = Math.max(4, Math.min(40, m.width));
      D.vars.push(touch(v));
    });
    return D;
  }
  // CSV tokenizer (same rules as the engine's reader; delimiter detected from the first line unless given)
  function tokenize(text, delim) {
    text = String(text).replace(/^﻿/, '');
    if (!delim) { const first = text.split(/\r?\n/, 1)[0]; let best = -1; for (const c of [',', ';', '\t', '|']) { const k = first.split(c).length; if (k > best) { best = k; delim = c; } } }
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"' && cell === '') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; rows.push(row); row = []; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return { rows, delim };
  }
  // clipboard text (Excel / Sheets: tab-separated, quoted cells may contain line breaks) → rows of cells
  function parseTSV(text) {
    const s = String(text).replace(/\r\n/g, '\n').replace(/\n$/, '');
    if (!s.includes('\t') && !s.includes('"')) return s.split('\n').map(x => [x]);
    return tokenize(s, '\t').rows;
  }
  // project data: raw values in CSV + variable metadata (see metaJSON)
  function fromCSV(text, meta) {
    const rows = tokenize(text, ',').rows.filter((r, i) => i === 0 || r.some(c => c !== ''));
    const head = rows[0] || [], n = Math.max(0, rows.length - 1), vars = [];
    (meta.vars || meta).forEach((m, j) => {
      const type = TYPES.includes(m.type) ? m.type : 'numeric', v = newVar(m.name || head[j] || 'V' + (j + 1), type, n);
      ['label', 'measure', 'measureSet', 'decimals', 'role', 'width', 'align'].forEach(k => { if (m[k] !== undefined && m[k] !== null) v[k] = m[k]; });
      v.labels = (m.labels || []).map(p => [type === 'string' ? String(p[0]) : +p[0], String(p[1])]);
      v.missing = { codes: ((m.missing && m.missing.codes) || []).map(x => (type === 'string' ? String(x) : +x)), lo: m.missing && m.missing.lo !== undefined ? m.missing.lo : null, hi: m.missing && m.missing.hi !== undefined ? m.missing.hi : null };
      for (let i = 0; i < n; i++) { const c = rows[i + 1][j]; v.values[i] = type === 'string' ? (c === undefined ? '' : c) : (c === undefined || c === '' ? NaN : Number(c)); }
      vars.push(touch(v));
    });
    const D = { n, vars, filter: null, readOnly: false };
    if (meta.filter && meta.filter.mask) D.filter = { expr: meta.filter.expr || '', mask: rleDecode(meta.filter.mask, n), ver: ++SEQ };
    return D;
  }
  const rleEncode = m => { const out = []; let i = 0; while (i < m.length) { let j = i; while (j < m.length && m[j] === m[i]) j++; out.push(m[i] + ':' + (j - i)); i = j; } return out.join(','); };
  function rleDecode(s, n) { const m = new Uint8Array(n).fill(1); let i = 0; String(s).split(',').forEach(p => { const [b, k] = p.split(':').map(Number); for (let q = 0; q < k && i < n; q++) m[i++] = b; }); return m; }
  function metaJSON(D) {
    if (!D) return null;
    return { vars: D.vars.map(v => ({ name: v.name, label: v.label, type: v.type, measure: v.measure, measureSet: v.measureSet, decimals: v.decimals, labels: v.labels, missing: v.missing, role: v.role, width: v.width, align: v.align })), filter: D.filter ? { expr: D.filter.expr, mask: rleEncode(D.filter.mask) } : null };
  }
  const csvCell = s => (/[",\n\r;\t]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
  // raw: values as stored (codes, day numbers); otherwise as shown (value labels, ISO dates) for other programs
  function toCSV(D, o) {
    o = o || {}; const raw = !!o.raw, labels = o.labels !== false && !raw, sep = o.sep || ',';
    const vars = o.vars ? o.vars.map(j => D.vars[j]) : D.vars, rows = o.rows || null, out = [vars.map(v => csvCell(v.name)).join(sep)];
    const cell = (v, x) => raw ? (isStr(v) ? csvCell(String(x)) : x !== x ? '' : String(x)) : csvCell(isStr(v) ? String(x) : x !== x ? '' : v.type === 'date' ? formatDate(x) : labels && v.labels.length && labelOf(v, x) !== undefined ? labelOf(v, x) : String(x));
    const N = rows ? rows.length : D.n;
    for (let q = 0; q < N; q++) { const i = rows ? rows[q] : q; let line = ''; for (let j = 0; j < vars.length; j++) { if (j) line += sep; line += cell(vars[j], vars[j].values[i]); } out.push(line); }
    return out.join('\n');
  }

  // ------------------------------------------------------------------ analysis dataset
  // ds = { names, cols, kinds, labels, n, measures, types, varLabels, rowIndex } with user-missing values as NaN,
  // categorical/string variables coded 1..k (k = levels present), unselected cases left out
  const CACHE = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function selectedRows(D) {
    if (!D.filter) return null;
    const m = D.filter.mask, out = []; for (let i = 0; i < D.n; i++) if (m[i]) out.push(i);
    return Int32Array.from(out);
  }
  function dsColumn(v, rows, n) {
    const N = rows ? rows.length : n, col = new Float64Array(N), a = v.values;
    if (v.type === 'numeric' || v.type === 'date') { for (let q = 0; q < N; q++) { const x = a[rows ? rows[q] : q]; col[q] = userMissing(v, x) ? NaN : x; } return { col, kind: 'num', labels: null }; }
    if (v.type === 'categorical') {
      const codes = new Set(); for (let q = 0; q < N; q++) { const x = a[rows ? rows[q] : q]; if (x === x && !userMissing(v, x)) codes.add(x); }
      const order = Array.from(codes).sort((x, y) => x - y), idx = new Map(order.map((c, i) => [c, i + 1]));
      for (let q = 0; q < N; q++) { const x = a[rows ? rows[q] : q]; col[q] = idx.has(x) ? idx.get(x) : NaN; }
      return { col, kind: 'cat', labels: order.map(c => { const l = labelOf(v, c); return l !== undefined ? l : fmtNum(c, null); }) };
    }
    const idx = new Map(), lv = [];
    for (let q = 0; q < N; q++) { const s = a[rows ? rows[q] : q]; if (isMissing(v, s)) { col[q] = NaN; continue; } if (!idx.has(s)) { idx.set(s, lv.length + 1); lv.push(s); } col[q] = idx.get(s); }
    return { col, kind: 'cat', labels: lv.map(s => { const l = labelOf(v, s); return l !== undefined ? l : s; }) };
  }
  function toDS(D) {
    const rows = selectedRows(D), fv = D.filter ? D.filter.ver : 0;
    const ds = { names: [], cols: [], kinds: [], labels: [], n: rows ? rows.length : D.n, measures: [], types: [], varLabels: [], rowIndex: rows };
    D.vars.forEach(v => {
      let c = CACHE && CACHE.get(v.values);
      const key = v._v + ':' + fv + ':' + D.n;
      if (!c || c.key !== key) { c = Object.assign(dsColumn(v, rows, D.n), { key }); if (CACHE) CACHE.set(v.values, c); }
      ds.names.push(v.name); ds.cols.push(c.col); ds.kinds.push(c.kind); ds.labels.push(c.labels);
      ds.measures.push(effMeasure(v)); ds.types.push(v.type); ds.varLabels.push(v.label || '');
    });
    return ds;
  }

  // ------------------------------------------------------------------ snapshots (undo) and structure
  const cloneMeta = v => Object.assign({}, v, { labels: v.labels.map(p => p.slice()), missing: { codes: v.missing.codes.slice(), lo: v.missing.lo, hi: v.missing.hi } });
  function snapshot(D) { return { n: D.n, vars: D.vars.map(cloneMeta), filter: D.filter ? { expr: D.filter.expr, mask: D.filter.mask, ver: D.filter.ver } : null }; }
  function restore(D, s) { D.n = s.n; D.vars = s.vars.map(cloneMeta); D.filter = s.filter ? Object.assign({}, s.filter) : null; }
  // bytes held only by `before` (columns replaced or deleted by an operation): the cost of keeping it in the history
  function snapshotCost(before, after) {
    const keep = new Set(after.vars.map(v => v.values)); let b = 0;
    before.vars.forEach(v => { if (!keep.has(v.values)) b += isStr(v) ? v.values.length * 16 : v.values.byteLength; });
    if (before.filter && (!after.filter || after.filter.mask !== before.filter.mask)) b += before.filter.mask.length;
    return b;
  }
  const emptyLike = (v, n) => (isStr(v) ? new Array(n).fill('') : new Float64Array(n).fill(NaN));
  function takeRows(v, idx) { const out = isStr(v) ? new Array(idx.length) : new Float64Array(idx.length); for (let q = 0; q < idx.length; q++) out[q] = idx[q] < 0 ? (isStr(v) ? '' : NaN) : v.values[idx[q]]; return out; }
  // rebuild every column from a row index (-1 = new empty case)
  function reindexRows(D, idx) {
    D.vars.forEach(v => { v.values = takeRows(v, idx); touch(v); });
    if (D.filter) { const m = new Uint8Array(idx.length); for (let q = 0; q < idx.length; q++) m[q] = idx[q] < 0 ? 1 : D.filter.mask[idx[q]]; D.filter = { expr: D.filter.expr, mask: m, ver: ++SEQ }; }
    D.n = idx.length;
  }
  function insertRows(D, at, count) { const idx = []; for (let i = 0; i < at; i++) idx.push(i); for (let k = 0; k < count; k++) idx.push(-1); for (let i = at; i < D.n; i++) idx.push(i); reindexRows(D, idx); }
  function deleteRows(D, rows) { const del = new Set(rows), idx = []; for (let i = 0; i < D.n; i++) if (!del.has(i)) idx.push(i); reindexRows(D, idx); }
  function insertVar(D, at, v) { D.vars.splice(Math.max(0, Math.min(at, D.vars.length)), 0, v); return v; }
  function deleteVars(D, idxs) { const del = new Set(idxs); D.vars = D.vars.filter((v, j) => !del.has(j)); }
  function moveVar(D, from, to) { const v = D.vars.splice(from, 1)[0]; D.vars.splice(to, 0, v); }
  function duplicateVar(D, j) { const v = cloneMeta(D.vars[j]); v.values = isStr(v) ? v.values.slice() : Float64Array.from(v.values); v.name = uniqueName(D, D.vars[j].name + '_copy'); return insertVar(D, j + 1, touch(v)); }
  // sort cases by keys [{ j, desc }] (stable; missing values last)
  function sortOrder(D, keys) {
    const idx = Array.from({ length: D.n }, (_, i) => i);
    const cmp = (v, a, b) => {
      const x = v.values[a], y = v.values[b], mx = isMissing(v, x), my = isMissing(v, y);
      if (mx || my) return mx && my ? 0 : mx ? 1 : -1;
      return isStr(v) ? String(x).localeCompare(String(y)) : x - y;
    };
    idx.sort((a, b) => { for (const k of keys) { const v = D.vars[k.j], c = cmp(v, a, b); if (c) { const mx = isMissing(v, v.values[a]) || isMissing(v, v.values[b]); return k.desc && !mx ? -c : c; } } return a - b; });
    return idx;
  }
  function sortCases(D, keys) { reindexRows(D, sortOrder(D, keys)); }
  // change a variable's type, keeping its data (numbers ↔ codes, codes → labels for strings, text → numbers when possible)
  function convertType(v, type) {
    if (v.type === type) return 0;
    let lost = 0; const n = v.values.length;
    if (type === 'string') {
      const out = new Array(n); for (let i = 0; i < n; i++) { const x = v.values[i]; out[i] = x !== x ? '' : v.type === 'date' ? formatDate(x) : labelOf(v, x) !== undefined ? labelOf(v, x) : fmtNum(x, null); }
      v.values = out; v.labels = []; v.missing = { codes: v.missing.codes.map(String), lo: null, hi: null }; v.decimals = 0;
    } else if (v.type === 'string') {
      const out = new Float64Array(n);
      if (type === 'categorical') {
        const lv = [], idx = new Map(), lab = new Map(v.labels);
        for (let i = 0; i < n; i++) { const s = v.values[i]; if (s === '') { out[i] = NaN; continue; } if (!idx.has(s)) { idx.set(s, lv.length + 1); lv.push(s); } out[i] = idx.get(s); }
        v.labels = lv.map((s, i) => [i + 1, lab.has(s) ? lab.get(s) : s]);
        v.missing = { codes: v.missing.codes.filter(c => idx.has(c)).map(c => idx.get(c)), lo: null, hi: null };
      } else {
        for (let i = 0; i < n; i++) { const s = v.values[i]; const x = s === '' ? NaN : type === 'date' ? parseDate(s) : parseNumber(s); out[i] = x === undefined || x !== x ? NaN : x; if (s !== '' && out[i] !== out[i]) lost++; }
        v.labels = v.labels.map(p => [parseNumber(p[0]), p[1]]).filter(p => p[0] !== undefined && p[0] === p[0]);
        v.missing = { codes: v.missing.codes.map(parseNumber).filter(x => x !== undefined && x === x), lo: null, hi: null };
        if (type === 'numeric') v.decimals = inferDecimals(out);
      }
      v.values = out;
    } else if (type === 'categorical') v.decimals = 0;
    else if (type === 'numeric' && v.type === 'categorical') v.decimals = inferDecimals(v.values);
    v.type = type;
    if (type === 'categorical' || type === 'string') { if (v.measure === 'scale') v.measure = 'nominal'; }
    else if (type === 'date') { v.measure = 'scale'; v.labels = []; }
    touch(v); return lost;
  }
  // value labels for the codes present in the data that have none yet
  function labelCodes(v) {
    const have = new Set(v.labels.map(p => p[0])), add = new Set();
    v.values.forEach(x => { if (!isMissing(v, x) && !have.has(x)) add.add(x); });
    return Array.from(add).sort((a, b) => (isStr(v) ? String(a).localeCompare(String(b)) : a - b)).map(x => [x, isStr(v) ? x : fmtNum(x, null)]);
  }

  // ------------------------------------------------------------------ find & replace
  // cells whose displayed text matches; o = { text, vars: [j] | null, matchCase, whole, labels }
  function findCells(D, o) {
    const out = [], q = o.matchCase ? o.text : String(o.text).toLowerCase(), js = o.vars || D.vars.map((_, j) => j);
    for (let i = 0; i < D.n; i++) for (const j of js) {
      const v = D.vars[j]; let s = format(v, v.values[i], o.labels); if (!o.matchCase) s = s.toLowerCase();
      if (o.whole ? s === q : q !== '' && s.includes(q)) out.push({ r: i, c: j });
    }
    return out;
  }
  function replaceText(v, x, o, labels) {
    const shown = format(v, x, labels);
    if (o.whole) return o.with;
    const re = new RegExp(String(o.text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), o.matchCase ? 'g' : 'gi');
    return shown.replace(re, () => o.with);
  }

  // ================================================================== expression language
  // Arithmetic + - * / ^, comparison = <> < <= > >=, logic and/or/not (three-valued: false and missing = false,
  // true or missing = true), if(c, a, b), list functions over arguments and ranges (mean(q1 to q5)), math functions,
  // missing(x). Variables evaluate to their values with user-missing values as missing (NaN).
  function ExprError(code, pos, arg) { const e = new Error(code); e.code = code; e.pos = pos; e.arg = arg; return e; }
  function lex(src) {
    const toks = []; let i = 0; const s = String(src);
    const ID = /[\p{L}\p{N}_.]/u, ID0 = /[\p{L}_]/u;
    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(s[i + 1] || ''))) {
        const m = s.slice(i).match(/^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/); toks.push({ t: 'num', v: Number(m[0]), pos: i }); i += m[0].length; continue;
      }
      if (ch === '"' || ch === "'") { let j = i + 1, out = ''; while (j < s.length && s[j] !== ch) { if (s[j] === '\\' && j + 1 < s.length) j++; out += s[j++]; } if (j >= s.length) throw ExprError('expr_string', i); toks.push({ t: 'str', v: out, pos: i }); i = j + 1; continue; }
      if (ch === '`') { const j = s.indexOf('`', i + 1); if (j < 0) throw ExprError('expr_syntax', i); toks.push({ t: 'id', v: s.slice(i + 1, j), pos: i, quoted: true }); i = j + 1; continue; }
      if (ID0.test(ch)) { let j = i; while (j < s.length && ID.test(s[j])) j++; let w = s.slice(i, j); while (w.endsWith('.')) { w = w.slice(0, -1); j--; } toks.push({ t: 'id', v: w, pos: i }); i = j; continue; }
      const two = s.substr(i, 2);
      if (['**', '<=', '>=', '<>', '!=', '~=', '==', '&&', '||'].includes(two)) { toks.push({ t: 'op', v: two, pos: i }); i += 2; continue; }
      if ('+-*/^(),=<>&|!~'.includes(ch)) { toks.push({ t: 'op', v: ch, pos: i }); i++; continue; }
      throw ExprError('expr_char', i, ch);
    }
    toks.push({ t: 'end', pos: s.length });
    return toks;
  }
  const KW = w => w.toLowerCase();
  function parseExpr(src) {
    if (!String(src || '').trim()) throw ExprError('expr_empty', 0);
    const tk = lex(src); let p = 0;
    const peek = () => tk[p], next = () => tk[p++];
    const isOp = (v) => peek().t === 'op' && peek().v === v;
    const isKw = (w) => peek().t === 'id' && !peek().quoted && KW(peek().v) === w;
    const expect = (v) => { if (!isOp(v)) throw ExprError('expr_syntax', peek().pos, v); next(); };
    function or() { let a = and(); while (isOp('|') || isOp('||') || isKw('or')) { next(); a = { k: 'or', a, b: and() }; } return a; }
    function and() { let a = not(); while (isOp('&') || isOp('&&') || isKw('and')) { next(); a = { k: 'and', a, b: not() }; } return a; }
    function not() { if (isOp('!') || isOp('~') || isKw('not')) { next(); return { k: 'not', a: not() }; } return cmp(); }
    const CMP = { '=': 'eq', '==': 'eq', '<>': 'ne', '!=': 'ne', '~=': 'ne', '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge' };
    function cmp() {
      const a = add();
      if (peek().t === 'op' && CMP[peek().v]) { const op = CMP[next().v], b = add(); if (peek().t === 'op' && CMP[peek().v]) throw ExprError('expr_chain', peek().pos); return { k: 'cmp', op, a, b }; }
      return a;
    }
    function add() { let a = mul(); while (isOp('+') || isOp('-')) { const op = next().v; a = { k: 'bin', op, a, b: mul() }; } return a; }
    function mul() { let a = unary(); while (isOp('*') || isOp('/')) { const op = next().v; a = { k: 'bin', op, a, b: unary() }; } return a; }
    function unary() { if (isOp('-')) { next(); return { k: 'neg', a: unary() }; } if (isOp('+')) { next(); return unary(); } return pow(); }
    function pow() { const a = primary(); if (isOp('^') || isOp('**')) { next(); return { k: 'bin', op: '^', a, b: unary() }; } return a; }
    function primary() {
      const x = peek();
      if (x.t === 'num') { next(); return { k: 'num', v: x.v }; }
      if (x.t === 'str') { next(); return { k: 'str', v: x.v }; }
      if (isOp('(')) { next(); const e = or(); expect(')'); return e; }
      if (x.t === 'id') {
        next();
        if (!x.quoted && isOp('(')) {
          next(); const args = [];
          if (!isOp(')')) for (;;) {
            const st = peek();
            if (st.t === 'id' && tk[p + 1] && tk[p + 1].t === 'id' && !tk[p + 1].quoted && KW(tk[p + 1].v) === 'to') { next(); next(); const en = next(); if (!en || en.t !== 'id') throw ExprError('expr_syntax', en ? en.pos : 0); args.push({ k: 'range', from: st.v, to: en.v, pos: st.pos }); }
            else args.push(or());
            if (isOp(',')) { next(); continue; }
            break;
          }
          expect(')');
          return { k: 'call', name: x.v, args, pos: x.pos };
        }
        if (!x.quoted && ['and', 'or', 'not', 'to'].includes(KW(x.v))) throw ExprError('expr_syntax', x.pos, x.v);
        return { k: 'var', name: x.v, pos: x.pos };
      }
      throw ExprError(x.t === 'end' ? 'expr_end' : 'expr_syntax', x.pos, x.v);
    }
    const e = or();
    if (peek().t !== 'end') throw ExprError('expr_syntax', peek().pos, peek().v);
    return e;
  }
  const LIST_FN = ['mean', 'sum', 'min', 'max', 'sd', 'variance', 'median', 'count', 'nvalid', 'nmiss', 'any'];
  const FN_ARGS = { abs: [1, 1], sqrt: [1, 1], ln: [1, 1], log: [1, 1], log10: [1, 1], exp: [1, 1], round: [1, 2], floor: [1, 1], ceil: [1, 1], trunc: [1, 1], mod: [2, 2], pow: [2, 2], missing: [1, 1], notmissing: [1, 1], sysmis: [1, 1], between: [3, 3], if: [3, 3], ifelse: [3, 3], casenum: [0, 0], lag: [1, 2], lead: [1, 2], value: [1, 1] };
  function findVar(D, name, pos) {
    let j = D.vars.findIndex(v => v.name === name);
    if (j < 0) { const low = name.toLowerCase(), c = D.vars.map((v, q) => (v.name.toLowerCase() === low ? q : -1)).filter(q => q >= 0); if (c.length === 1) j = c[0]; }
    if (j < 0) throw ExprError('expr_unknown_var', pos, name);
    return j;
  }
  const truth = x => (x !== x ? NaN : typeof x === 'string' ? (x === '' ? 0 : 1) : x !== 0 ? 1 : 0);
  // compile to a row function f(i) → number | string (NaN = missing); also lists the variables used
  function compile(src, D) {
    const ast = typeof src === 'string' ? parseExpr(src) : src, used = new Set();
    const views = new Map();
    const view = j => { if (!views.has(j)) { const v = D.vars[j]; views.set(j, isStr(v) ? v.values : numeric(v)); } return views.get(j); };
    const varNode = n => (n.k === 'var' ? D.vars[findVar(D, n.name, n.pos)] : null);
    // "gender = 'male'": a text literal compared with a labelled variable means its code
    const coerce = (vn, lit) => {
      if (!vn || lit.k !== 'str' || isStr(vn)) return lit;
      if (vn.type === 'date') { const d = parseDate(lit.v); if (d === d) return { k: 'num', v: d }; }
      for (const pr of vn.labels) if (pr[1] === lit.v || String(pr[1]).toLowerCase() === lit.v.toLowerCase()) return { k: 'num', v: pr[0] };
      const x = parseNumber(lit.v); if (x !== undefined && x === x) return { k: 'num', v: x };
      throw ExprError('expr_unknown_label', lit.pos || 0, lit.v);
    };
    function c(n) {
      switch (n.k) {
        case 'num': { const v = n.v; return () => v; }
        case 'str': { const v = n.v; return () => v; }
        case 'var': { const j = findVar(D, n.name, n.pos); used.add(j); const a = view(j); return i => a[i]; }
        case 'neg': { const a = c(n.a); return i => { const x = a(i); return typeof x === 'number' ? -x : NaN; }; }
        case 'not': { const a = c(n.a); return i => { const x = truth(a(i)); return x !== x ? NaN : 1 - x; }; }
        case 'and': { const a = c(n.a), b = c(n.b); return i => { const x = truth(a(i)); if (x === 0) return 0; const y = truth(b(i)); if (y === 0) return 0; return x !== x || y !== y ? NaN : 1; }; }
        case 'or': { const a = c(n.a), b = c(n.b); return i => { const x = truth(a(i)); if (x === 1) return 1; const y = truth(b(i)); if (y === 1) return 1; return x !== x || y !== y ? NaN : 0; }; }
        case 'bin': {
          const a = c(n.a), b = c(n.b), op = n.op;
          const f = op === '+' ? (x, y) => x + y : op === '-' ? (x, y) => x - y : op === '*' ? (x, y) => x * y : op === '/' ? (x, y) => (y === 0 ? NaN : x / y) : (x, y) => { const r = Math.pow(x, y); return isFinite(r) ? r : NaN; };
          return i => { const x = a(i), y = b(i); return typeof x === 'number' && typeof y === 'number' ? f(x, y) : NaN; };
        }
        case 'cmp': {
          const va = varNode(n.a), vb = varNode(n.b);
          const A = c(vb ? coerce(vb, n.a) : n.a), B = c(va ? coerce(va, n.b) : n.b), op = n.op;
          return i => {
            const x = A(i), y = B(i);
            if (typeof x === 'string' || typeof y === 'string') {
              if (typeof x !== 'string' || typeof y !== 'string') { if (x !== x || y !== y) return NaN; return op === 'ne' ? 1 : op === 'eq' ? 0 : NaN; }
              const k = x < y ? -1 : x > y ? 1 : 0;
              return +(op === 'eq' ? k === 0 : op === 'ne' ? k !== 0 : op === 'lt' ? k < 0 : op === 'le' ? k <= 0 : op === 'gt' ? k > 0 : k >= 0);
            }
            if (x !== x || y !== y) return NaN;
            return +(op === 'eq' ? x === y : op === 'ne' ? x !== y : op === 'lt' ? x < y : op === 'le' ? x <= y : op === 'gt' ? x > y : x >= y);
          };
        }
        case 'range': throw ExprError('expr_range_here', n.pos, n.from);
        case 'call': return call(n);
      }
      throw ExprError('expr_syntax', 0);
    }
    function expand(args) { // ranges "a to b" → the variables between them (dataset order)
      const out = [];
      args.forEach(a => {
        if (a.k !== 'range') { out.push(a); return; }
        const j0 = findVar(D, a.from, a.pos), j1 = findVar(D, a.to, a.pos);
        if (j1 < j0) throw ExprError('expr_range', a.pos, a.from + ' to ' + a.to);
        for (let j = j0; j <= j1; j++) out.push({ k: 'var', name: D.vars[j].name, pos: a.pos });
      });
      return out;
    }
    function call(n) {
      let name = n.name.toLowerCase(), minValid = 0;
      const dot = name.match(/^([a-z]+)\.(\d+)$/); if (dot && LIST_FN.includes(dot[1])) { name = dot[1]; minValid = +dot[2]; }
      if (LIST_FN.includes(name)) {
        const args = expand(n.args);
        if (name === 'any') {
          if (args.length < 2) throw ExprError('expr_args', n.pos, n.name);
          const vx = varNode(args[0]), x = c(args[0]), rest = args.slice(1).map(a => c(vx ? coerce(vx, a) : a));
          return i => { const v = x(i); if (v !== v) return NaN; for (const f of rest) if (f(i) === v) return 1; return 0; };
        }
        if (!args.length) throw ExprError('expr_args', n.pos, n.name);
        const fs = args.map(c), k = fs.length, buf = new Float64Array(k);
        const need = Math.max(minValid, name === 'sd' || name === 'variance' ? 2 : name === 'count' || name === 'nvalid' || name === 'nmiss' ? 0 : 1);
        return i => {
          let m = 0; for (let q = 0; q < k; q++) { const x = fs[q](i); if (typeof x === 'number' && x === x) buf[m++] = x; }
          if (name === 'count' || name === 'nvalid') return m;
          if (name === 'nmiss') return k - m;
          if (m < need) return NaN;
          let s = 0; for (let q = 0; q < m; q++) s += buf[q];
          switch (name) {
            case 'sum': return s;
            case 'mean': return s / m;
            case 'min': { let r = Infinity; for (let q = 0; q < m; q++) if (buf[q] < r) r = buf[q]; return r; }
            case 'max': { let r = -Infinity; for (let q = 0; q < m; q++) if (buf[q] > r) r = buf[q]; return r; }
            case 'median': { const a = Array.from(buf.subarray(0, m)).sort((x, y) => x - y); return m % 2 ? a[(m - 1) / 2] : (a[m / 2 - 1] + a[m / 2]) / 2; }
            default: { const mu = s / m; let ss = 0; for (let q = 0; q < m; q++) ss += (buf[q] - mu) * (buf[q] - mu); const vv = ss / (m - 1); return name === 'variance' ? vv : Math.sqrt(vv); }
          }
        };
      }
      if (!FN_ARGS[name]) throw ExprError('expr_unknown_fn', n.pos, n.name);
      const [lo, hi] = FN_ARGS[name];
      if (n.args.length < lo || n.args.length > hi || n.args.some(a => a.k === 'range')) throw ExprError('expr_args', n.pos, n.name);
      if (name === 'casenum') return i => i + 1;
      if (name === 'lag' || name === 'lead') {
        if (n.args[0].k !== 'var') throw ExprError('expr_args', n.pos, n.name);
        const a = c(n.args[0]), kf = n.args[1] ? n.args[1] : { k: 'num', v: 1 };
        if (kf.k !== 'num' || !(kf.v >= 1) || !Number.isInteger(kf.v)) throw ExprError('expr_args', n.pos, n.name);
        const k = name === 'lag' ? -kf.v : kf.v, N = D.n;
        return i => (i + k >= 0 && i + k < N ? a(i + k) : NaN);
      }
      if (name === 'missing' || name === 'notmissing' || name === 'sysmis') {
        const vn = varNode(n.args[0]), a = c(n.args[0]), neg = name === 'notmissing';
        if (name === 'sysmis') { if (!vn || isStr(vn)) throw ExprError('expr_args', n.pos, n.name); const raw = vn.values; return i => +(raw[i] !== raw[i]); }
        return i => { const x = a(i); const m = typeof x === 'string' ? x === '' : x !== x; return +(neg ? !m : m); };
      }
      if (name === 'value') { const vn = varNode(n.args[0]); if (!vn || isStr(vn)) throw ExprError('expr_args', n.pos, n.name); const raw = vn.values; used.add(D.vars.indexOf(vn)); return i => raw[i]; }
      if (name === 'if' || name === 'ifelse') { const cc = c(n.args[0]), a = c(n.args[1]), b = c(n.args[2]); return i => { const x = truth(cc(i)); return x !== x ? NaN : x ? a(i) : b(i); }; }
      if (name === 'between') {
        const vx = varNode(n.args[0]), x = c(n.args[0]), l = c(vx ? coerce(vx, n.args[1]) : n.args[1]), h = c(vx ? coerce(vx, n.args[2]) : n.args[2]);
        return i => { const v = x(i), a = l(i), b = h(i); if (typeof v !== 'number' || v !== v || a !== a || b !== b) return NaN; return +(v >= a && v <= b); };
      }
      const fs = n.args.map(c), num = (x) => (typeof x === 'number' ? x : NaN);
      const one = f => i => { const x = num(fs[0](i)); return x !== x ? NaN : f(x); };
      switch (name) {
        case 'abs': return one(Math.abs);
        case 'sqrt': return one(x => (x < 0 ? NaN : Math.sqrt(x)));
        case 'ln': case 'log': return one(x => (x <= 0 ? NaN : Math.log(x)));
        case 'log10': return one(x => (x <= 0 ? NaN : Math.log10(x)));
        case 'exp': return one(x => { const r = Math.exp(x); return isFinite(r) ? r : NaN; });
        case 'floor': return one(Math.floor);
        case 'ceil': return one(Math.ceil);
        case 'trunc': return one(Math.trunc);
        case 'round': return i => { const x = num(fs[0](i)), d = fs[1] ? num(fs[1](i)) : 0; if (x !== x || d !== d) return NaN; const f = Math.pow(10, Math.round(d)), y = Math.abs(x) * f; return Math.sign(x) * Math.round(+(y.toPrecision(15))) / f; };
        case 'mod': return i => { const a = num(fs[0](i)), b = num(fs[1](i)); return a !== a || b !== b || b === 0 ? NaN : a - b * Math.trunc(a / b); };
        case 'pow': return i => { const a = num(fs[0](i)), b = num(fs[1](i)); const r = Math.pow(a, b); return isFinite(r) ? r : NaN; };
      }
      throw ExprError('expr_unknown_fn', n.pos, n.name);
    }
    const fn = c(ast);
    return { fn, used: Array.from(used), ast };
  }
  // evaluate for every case: { values: Float64Array | string[], isString }
  function evaluate(D, src, rows) {
    const { fn } = compile(src, D), N = rows ? rows.length : D.n, out = new Array(N);
    let isString = false;
    for (let q = 0; q < N; q++) { const x = fn(rows ? rows[q] : q); out[q] = x; if (typeof x === 'string') isString = true; }
    if (isString) return { values: out.map(x => (typeof x === 'string' ? x : x !== x ? '' : fmtNum(x, null))), isString };
    return { values: Float64Array.from(out, x => (typeof x === 'number' && isFinite(x) ? x : NaN)), isString };
  }
  // filter mask from a condition: true = selected; false or missing = not selected
  function conditionMask(D, src) { const { fn } = compile(src, D), m = new Uint8Array(D.n); for (let i = 0; i < D.n; i++) m[i] = truth(fn(i)) === 1 ? 1 : 0; return m; }

  // ================================================================== transformations
  const valid = a => { const out = []; for (const x of a) if (x === x) out.push(x); return out; };
  const meanOf = a => { let s = 0; for (const x of a) s += x; return s / a.length; };
  const sdOf = (a, m) => { let s = 0; for (const x of a) s += (x - m) * (x - m); return Math.sqrt(s / (a.length - 1)); };
  const q7 = (sorted, p) => { const n = sorted.length; if (!n) return NaN; const h = (n - 1) * p, lo = Math.floor(h), hi = Math.ceil(h); return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]); };
  const sortedValid = a => valid(a).sort((x, y) => x - y);

  // Recode. rules: [{ from: { t: 'value', v } | { t: 'range', lo, hi } (lo = -Infinity: lowest, hi = Infinity: highest)
  //   | { t: 'missing' } (system- or user-missing) | { t: 'sysmis' } | { t: 'else' }, to: { t: 'value', v } | { t: 'missing' } | { t: 'copy' } }]
  // The first matching rule wins. Unmatched values are kept (same variable) or missing (into a different variable).
  function recode(values, rules, o) {
    o = o || {}; const n = values.length, out = new Float64Array(n), into = !!o.into, isMiss = o.isMissing || (x => x !== x);
    for (let i = 0; i < n; i++) {
      const x = values[i], miss = isMiss(x); let r = null;
      for (const ru of rules) {
        const f = ru.from;
        if (f.t === 'else' ? true : f.t === 'missing' ? miss : f.t === 'sysmis' ? x !== x : miss ? false : f.t === 'value' ? x === f.v : f.t === 'range' ? x >= f.lo && x <= f.hi : false) { r = ru; break; }
      }
      out[i] = r ? (r.to.t === 'copy' ? x : r.to.t === 'missing' ? NaN : r.to.v) : into ? NaN : x;
    }
    return out;
  }
  function reverse(values, min, max) { return Float64Array.from(values, x => (x === x ? min + max - x : NaN)); }
  function zscore(values) { const v = valid(values), m = meanOf(v), s = sdOf(v, m); return Float64Array.from(values, x => (x === x && s > 0 ? (x - m) / s : NaN)); }
  function center(values, at) { const v = valid(values), m = at === undefined ? meanOf(v) : at; return Float64Array.from(values, x => (x === x ? x - m : NaN)); }
  // ranks of the valid values; ties: 'mean' | 'low' | 'high' | 'dense'; desc: largest = 1
  function rank(values, o) {
    o = o || {}; const ties = o.ties || 'mean', idx = [];
    for (let i = 0; i < values.length; i++) if (values[i] === values[i]) idx.push(i);
    idx.sort((a, b) => (o.desc ? values[b] - values[a] : values[a] - values[b]));
    const out = new Float64Array(values.length).fill(NaN); let dense = 0;
    for (let s = 0; s < idx.length;) {
      let e = s; while (e + 1 < idx.length && values[idx[e + 1]] === values[idx[s]]) e++;
      dense++;
      const r = ties === 'low' ? s + 1 : ties === 'high' ? e + 1 : ties === 'dense' ? dense : (s + e + 2) / 2;
      for (let q = s; q <= e; q++) out[idx[q]] = r;
      s = e + 1;
    }
    return { rank: out, n: idx.length };
  }
  // rank-based scores: 'percent' (100 R / n), 'fraction' (R / n), 'ntiles' (k groups: floor(k R / (n + 1)) + 1, as SPSS)
  function rankScore(values, kind, o) {
    o = o || {}; const { rank: R, n } = rank(values, kind === 'ntiles' ? Object.assign({}, o, { ties: o.ties || 'mean' }) : o), k = o.k || 4;
    return Float64Array.from(R, r => (r !== r ? NaN : kind === 'percent' ? 100 * r / n : kind === 'fraction' ? r / n : kind === 'ntiles' ? Math.floor(k * r / (n + 1)) + 1 : r));
  }
  // cut points: 'width' (k equal-width intervals), 'quantile' (k groups of equal size, type-7 quantiles), 'cuts' (given),
  // 'median'. Intervals include their upper bound: bin 1 = x ≤ c1, bin 2 = c1 < x ≤ c2, …, last bin = x > c(k-1).
  function binCuts(values, method, k, cuts) {
    const s = sortedValid(values); if (!s.length) return [];
    let c;
    if (method === 'width') { const lo = s[0], hi = s[s.length - 1]; c = Array.from({ length: k - 1 }, (_, i) => lo + (hi - lo) * (i + 1) / k); }
    else if (method === 'quantile') c = Array.from({ length: k - 1 }, (_, i) => q7(s, (i + 1) / k)).filter(x => x < s[s.length - 1] || s[0] === s[s.length - 1]);
    else if (method === 'median') c = [q7(s, 0.5)];
    else c = (cuts || []).filter(x => isFinite(x));
    return Array.from(new Set(c.map(x => +x.toPrecision(12)))).sort((a, b) => a - b);
  }
  function binLabel(cuts, i, fmt) {
    fmt = fmt || (x => String(+x.toPrecision(6)));
    if (!cuts.length) return 'all';
    return i === 0 ? '≤ ' + fmt(cuts[0]) : i === cuts.length ? '> ' + fmt(cuts[cuts.length - 1]) : '(' + fmt(cuts[i - 1]) + ', ' + fmt(cuts[i]) + ']';
  }
  function bin(values, cuts) {
    const codes = Float64Array.from(values, x => { if (x !== x) return NaN; let g = 0; while (g < cuts.length && x > cuts[g]) g++; return g + 1; });
    return { codes, labels: Array.from({ length: cuts.length + 1 }, (_, i) => [i + 1, binLabel(cuts, i)]) };
  }
  // 0/1 indicator per level except the reference (ref: a level value, or null for all levels)
  function dummies(values, levels, ref) {
    return levels.filter(l => l !== ref).map(l => ({ level: l, values: Float64Array.from(values, x => (x !== x ? NaN : x === l ? 1 : 0)) }));
  }
  // occurrences per case of values among several variables. spec: [{ t: 'value', v } | { t: 'range', lo, hi } | { t: 'missing' }]
  function countValues(cols, spec, isMiss) {
    const n = cols.length ? cols[0].length : 0, out = new Float64Array(n);
    for (let i = 0; i < n; i++) { let k = 0; cols.forEach((col, j) => { const x = col[i], miss = isMiss ? isMiss[j](x) : x !== x; for (const s of spec) if (s.t === 'missing' ? miss : !miss && (s.t === 'value' ? x === s.v : x >= s.lo && x <= s.hi)) { k++; break; } }); out[i] = k; }
    return out;
  }
  // replace missing values: 'mean' | 'median' (series), 'nearmean' | 'nearmedian' (span valid values on each side; left
  // missing if fewer exist), 'linear' (interpolation between the neighbouring valid values; ends stay missing), 'mode'
  function replaceMissing(values, method, o) {
    o = o || {}; const n = values.length, out = Float64Array.from(values), span = Math.max(1, o.span || 2);
    const v = valid(values); if (!v.length) return out;
    if (method === 'mean' || method === 'median' || method === 'mode') {
      let r;
      if (method === 'mean') r = meanOf(v);
      else if (method === 'median') r = q7(v.sort((a, b) => a - b), 0.5);
      else { const cnt = new Map(); v.forEach(x => cnt.set(x, (cnt.get(x) || 0) + 1)); let best = -1; cnt.forEach((k, x) => { if (k > best || (k === best && x < r)) { best = k; r = x; } }); }
      for (let i = 0; i < n; i++) if (out[i] !== out[i]) out[i] = r;
      return out;
    }
    for (let i = 0; i < n; i++) {
      if (values[i] === values[i]) continue;
      if (method === 'linear') {
        let a = i - 1; while (a >= 0 && values[a] !== values[a]) a--;
        let b = i + 1; while (b < n && values[b] !== values[b]) b++;
        if (a >= 0 && b < n) out[i] = values[a] + (values[b] - values[a]) * (i - a) / (b - a);
        continue;
      }
      const near = []; let a = i - 1, k = 0; while (a >= 0 && k < span) { if (values[a] === values[a]) { near.push(values[a]); k++; } a--; }
      if (k < span) continue;
      let b = i + 1; k = 0; while (b < n && k < span) { if (values[b] === values[b]) { near.push(values[b]); k++; } b++; }
      if (k < span) continue;
      out[i] = method === 'nearmedian' ? q7(near.sort((x, y) => x - y), 0.5) : meanOf(near);
    }
    return out;
  }
  // case indexes with a missing value in any of the columns
  function incompleteRows(cols) { const n = cols.length ? cols[0].length : 0, out = []; for (let i = 0; i < n; i++) if (cols.some(c => (typeof c[i] === 'string' ? c[i] === '' : c[i] !== c[i]))) out.push(i); return out; }
  // ln, log10, sqrt, inverse (1/x), square, exp, boxcox ((x^λ − 1)/λ; ln x for λ = 0; x must be > 0)
  function mathTransform(values, kind, lambda) {
    const f = {
      ln: x => (x > 0 ? Math.log(x) : NaN), log10: x => (x > 0 ? Math.log10(x) : NaN), sqrt: x => (x >= 0 ? Math.sqrt(x) : NaN),
      inverse: x => (x !== 0 ? 1 / x : NaN), square: x => x * x, exp: x => Math.exp(x),
      boxcox: x => (x > 0 ? (Math.abs(lambda) < 1e-12 ? Math.log(x) : (Math.pow(x, lambda) - 1) / lambda) : NaN)
    }[kind];
    return Float64Array.from(values, x => { if (x !== x) return NaN; const r = f(x); return isFinite(r) ? r : NaN; });
  }
  // lag (k > 0: value k cases earlier), lead (k cases later), difference x(t) − x(t−k)
  function shift(values, kind, k) {
    k = Math.max(1, k | 0); const n = values.length;
    return Float64Array.from(values, (x, i) => {
      if (kind === 'lag') return i - k >= 0 ? values[i - k] : NaN;
      if (kind === 'lead') return i + k < n ? values[i + k] : NaN;
      return i - k >= 0 ? x - values[i - k] : NaN;
    });
  }
  // duplicates over key columns: dup = 1 for every repeat of an earlier case, group = index of the first occurrence (1-based)
  function duplicates(cols) {
    const n = cols.length ? cols[0].length : 0, seen = new Map(), dup = new Float64Array(n), first = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const key = cols.map(c => { const x = c[i]; return typeof x === 'string' ? 's' + x : x !== x ? 'NA' : 'n' + x; }).join('\u0001');
      if (seen.has(key)) { dup[i] = 1; first[i] = seen.get(key) + 1; } else { seen.set(key, i); first[i] = i + 1; }
    }
    return { dup, first, count: dup.reduce((s, x) => s + x, 0) };
  }
  function outliersZ(values, k) { const z = zscore(values); return { flag: Float64Array.from(z, x => (x !== x ? NaN : Math.abs(x) > k ? 1 : 0)), z }; }
  function outliersIQR(values, k) {
    const s = sortedValid(values), q1 = q7(s, 0.25), q3 = q7(s, 0.75), lo = q1 - k * (q3 - q1), hi = q3 + k * (q3 - q1);
    return { flag: Float64Array.from(values, x => (x !== x ? NaN : x < lo || x > hi ? 1 : 0)), q1, q3, lo, hi };
  }
  function eng() { return root.YPEngine && root.YPEngine.st ? root.YPEngine : typeof require === 'function' ? require('./stats.js') : null; }
  // squared Mahalanobis distance of every complete case from the centroid (covariance with n − 1), p = P(χ²(p) > D²)
  function mahalanobis(cols) {
    const E = eng(), p = cols.length, n = p ? cols[0].length : 0, rows = [];
    for (let i = 0; i < n; i++) if (cols.every(c => c[i] === c[i])) rows.push(i);
    const d2 = new Float64Array(n).fill(NaN), pv = new Float64Array(n).fill(NaN);
    if (rows.length <= p) return { d2, p: pv, n: rows.length, df: p };
    const mu = cols.map(c => rows.reduce((s, i) => s + c[i], 0) / rows.length);
    const S = Array.from({ length: p }, (_, a) => Array.from({ length: p }, (_, b) => rows.reduce((s, i) => s + (cols[a][i] - mu[a]) * (cols[b][i] - mu[b]), 0) / (rows.length - 1)));
    const Si = E.inverse(S);
    rows.forEach(i => {
      const d = cols.map((c, a) => c[i] - mu[a]); let s = 0;
      for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) s += d[a] * Si[a][b] * d[b];
      d2[i] = s; pv[i] = E.st.pchisq(s, p);
    });
    return { d2, p: pv, n: rows.length, df: p };
  }
  // statistic of a variable within groups, written back to every case of the group
  function aggregate(groupCols, values, fn) {
    const n = values.length, groups = new Map(), key = i => groupCols.map(c => (typeof c[i] === 'string' ? 's' + c[i] : c[i] !== c[i] ? 'NA' : 'n' + c[i])).join('\u0001');
    for (let i = 0; i < n; i++) { const k = key(i); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); }
    const out = new Float64Array(n).fill(NaN);
    groups.forEach(idx => {
      const v = idx.map(i => values[i]).filter(x => x === x), s = v.slice().sort((a, b) => a - b);
      const r = fn === 'n' ? idx.length : fn === 'nvalid' ? v.length : !v.length ? NaN : fn === 'sum' ? v.reduce((a, b) => a + b, 0) : fn === 'mean' ? meanOf(v) : fn === 'sd' ? (v.length > 1 ? sdOf(v, meanOf(v)) : NaN) : fn === 'min' ? s[0] : fn === 'max' ? s[s.length - 1] : fn === 'median' ? q7(s, 0.5) : NaN;
      idx.forEach(i => { out[i] = r; });
    });
    return out;
  }
  // cases ↔ variables (numeric data); case names from an optional variable
  function transpose(D, nameVar) {
    const keep = D.vars.filter((v, j) => j !== nameVar), n = D.n, T = { n: keep.length, vars: [], filter: null, readOnly: false };
    T.vars.push(newVar('variable', 'string', keep.length, { values: keep.map(v => v.name), width: 12 }));
    const used = ['variable'];
    for (let i = 0; i < n; i++) {
      const base = nameVar !== null && nameVar !== undefined ? format(D.vars[nameVar], D.vars[nameVar].values[i], true) : 'case' + (i + 1);
      const nm = uniqueName(T, base || 'case' + (i + 1), used); used.push(nm);
      const v = newVar(nm, 'numeric', keep.length, { values: Float64Array.from(keep, k => (isStr(k) ? (parseNumber(k.values[i]) === undefined ? NaN : parseNumber(k.values[i])) : userMissing(k, k.values[i]) ? NaN : k.values[i])) });
      v.decimals = inferDecimals(v.values); T.vars.push(v);
    }
    return T;
  }
  // add cases of B (variables matched by name; new variables are added)
  function mergeCases(D, B) {
    const n0 = D.n, n = D.n + B.n, map = new Map(D.vars.map((v, j) => [v.name.toLowerCase(), j]));
    D.vars.forEach(v => { const b = B.vars.find(x => x.name.toLowerCase() === v.name.toLowerCase()); const out = emptyLike(v, n); for (let i = 0; i < n0; i++) out[i] = v.values[i]; if (b) for (let i = 0; i < B.n; i++) out[n0 + i] = coerceValue(v, b, b.values[i]); v.values = out; touch(v); });
    B.vars.forEach(b => { if (map.has(b.name.toLowerCase())) return; const v = cloneMeta(b); v.values = emptyLike(b, n); for (let i = 0; i < B.n; i++) v.values[n0 + i] = b.values[i]; D.vars.push(touch(v)); });
    if (D.filter) { const m = new Uint8Array(n).fill(1); m.set(D.filter.mask); D.filter = { expr: D.filter.expr, mask: m, ver: ++SEQ }; }
    D.n = n;
  }
  function coerceValue(v, b, x) {
    if (isStr(v) === isStr(b)) {
      if (!isStr(v) && b.labels.length && v.labels.length) { const l = labelOf(b, x); if (l !== undefined) { const r = parseCell(v, l); if (r.label) v.labels.push(r.label); return r.value; } }
      return x;
    }
    if (isStr(v)) return format(b, x, true);
    const r = parseCell(v, x); if (r.label) v.labels.push(r.label); return r.error ? NaN : r.value;
  }
  // add variables of B matched on a key variable (first match; unmatched cases stay missing)
  function mergeVars(D, B, keyD, keyB) {
    const kd = D.vars[keyD], kb = B.vars[keyB], index = new Map(), str = (v, x) => (isStr(v) ? String(x) : x !== x ? '' : String(x));
    for (let i = B.n - 1; i >= 0; i--) index.set(str(kb, kb.values[i]), i);
    const match = Array.from({ length: D.n }, (_, i) => { const k = str(kd, kd.values[i]); return k !== '' && index.has(k) ? index.get(k) : -1; });
    let added = 0;
    B.vars.forEach((b, j) => {
      if (j === keyB) return;
      const v = cloneMeta(b); v.name = uniqueName(D, b.name); v.values = emptyLike(b, D.n);
      match.forEach((m, i) => { if (m >= 0) v.values[i] = b.values[m]; });
      D.vars.push(touch(v)); added++;
    });
    return { added, matched: match.filter(m => m >= 0).length };
  }
  // per-variable summary for the Variable View / transforms (valid, missing, min, max, distinct codes)
  function summary(v) {
    let nv = 0, mn = Infinity, mx = -Infinity; const codes = new Set();
    v.values.forEach(x => { if (isMissing(v, x)) return; nv++; if (!isStr(v)) { if (x < mn) mn = x; if (x > mx) mx = x; } if (codes.size <= 500) codes.add(x); });
    return { valid: nv, missing: v.values.length - nv, min: nv && !isStr(v) ? mn : NaN, max: nv && !isStr(v) ? mx : NaN, levels: Array.from(codes).sort((a, b) => (isStr(v) ? String(a).localeCompare(String(b)) : a - b)) };
  }

  const api = {
    TYPES, MEASURES, ROLES, newVar, touch, inferDecimals, inferMeasure, effMeasure, userMissing, isMissing, labelOf, numeric,
    parseDate, formatDate, fmtNum, format, parseNumber, parseCell, nameError, uniqueName, renameInModels, removeFromModels,
    fromDS, fromVars, tokenize, parseTSV, fromCSV, metaJSON, toCSV, toDS, snapshot, restore, snapshotCost, cloneMeta,
    insertRows, deleteRows, insertVar, deleteVars, moveVar, duplicateVar, sortOrder, sortCases, reindexRows, convertType, labelCodes,
    findCells, replaceText, lex, parseExpr, compile, evaluate, conditionMask,
    recode, reverse, zscore, center, rank, rankScore, binCuts, binLabel, bin, dummies, countValues, replaceMissing, incompleteRows,
    mathTransform, shift, duplicates, outliersZ, outliersIQR, mahalanobis, aggregate, transpose, mergeCases, mergeVars, summary, quantile7: q7
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.YPData = api;
})(typeof self !== 'undefined' ? self : this);
