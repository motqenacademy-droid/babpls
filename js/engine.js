/*
 * YouPls engine — PLS-SEM and companion analyses in plain JavaScript.
 * Runs in the browser (window / Web Worker) and in Node (module.exports).
 * No dependencies. MIT licence.
 *
 * Conventions
 *  - Data are column arrays (Float64Array per variable). NaN = missing.
 *  - Standardisation uses the sample SD (n-1); correlations = dot / (n-1).
 *  - Outer weights are scaled so every construct score has unit variance.
 *  - B[j][i] is the path coefficient of construct i -> construct j.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- RNG
  function rng(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------- basic vectors
  function mean(v) { let s = 0; for (let i = 0; i < v.length; i++) s += v[i]; return s / v.length; }
  function sd(v, m) {
    if (m === undefined) m = mean(v);
    let s = 0; for (let i = 0; i < v.length; i++) { const d = v[i] - m; s += d * d; }
    return Math.sqrt(s / (v.length - 1));
  }
  function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
  function standardize(v) {
    const m = mean(v), s = sd(v, m) || 1, out = new Float64Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = (v[i] - m) / s;
    return out;
  }
  function corr(a, b) {
    const ma = mean(a), mb = mean(b);
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
    return sab / Math.sqrt(saa * sbb);
  }
  function quantile(sorted, p) {
    if (!sorted.length) return NaN;
    const h = (sorted.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
  }
  function median(v) { return quantile(Array.from(v).sort((a, b) => a - b), 0.5); }

  // ------------------------------------------------------ small matrices
  function zeros(r, c) { const m = []; for (let i = 0; i < r; i++) m.push(new Array(c).fill(0)); return m; }
  function eye(n) { const m = zeros(n, n); for (let i = 0; i < n; i++) m[i][i] = 1; return m; }
  function inverse(A) {
    const n = A.length, M = A.map((r, i) => r.concat(eye(n)[i]));
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-14) throw new Error('singular');
      [M[c], M[p]] = [M[p], M[c]];
      const d = M[c][c];
      for (let k = 0; k < 2 * n; k++) M[c][k] /= d;
      for (let r = 0; r < n; r++) if (r !== c) {
        const f = M[r][c]; if (f === 0) continue;
        for (let k = 0; k < 2 * n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map(r => r.slice(n));
  }
  function solve(A, b) { // A x = b, A small & square
    const n = A.length, M = A.map((r, i) => r.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-14) throw new Error('singular');
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = c + 1; r < n; r++) {
        const f = M[r][c] / M[c][c]; if (f === 0) continue;
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
      let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
      x[r] = s / M[r][r];
    }
    return x;
  }
  function matmul(A, B) {
    const r = A.length, c = B[0].length, k = B.length, C = zeros(r, c);
    for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) { let s = 0; for (let t = 0; t < k; t++) s += A[i][t] * B[t][j]; C[i][j] = s; }
    return C;
  }
  function transpose(A) { return A[0].map((_, j) => A.map(r => r[j])); }
  function cholesky(A) {
    const n = A.length, L = zeros(n, n);
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
      let s = A[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) { if (s <= 1e-14) throw new Error('not positive definite'); L[i][i] = Math.sqrt(s); }
      else L[i][j] = s / L[j][j];
    }
    return L;
  }
  function logdet(A) { const L = cholesky(A); let s = 0; for (let i = 0; i < L.length; i++) s += Math.log(L[i][i]); return 2 * s; }
  function jacobiEigen(S) { // symmetric -> eigenvalues
    const n = S.length, A = S.map(r => r.slice());
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
      if (off < 1e-22) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;
        const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k][p], akq = A[k][q];
          A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k], aqk = A[q][k];
          A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk;
        }
      }
    }
    return A.map((r, i) => r[i]);
  }
  function corrMatrix(cols) {
    const k = cols.length, R = eye(k), z = cols.map(standardize), n1 = cols[0].length - 1;
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) R[i][j] = R[j][i] = dot(z[i], z[j]) / n1;
    return R;
  }
  // R^2 of y on xs given a correlation matrix R (indices into R)
  function r2From(R, y, xs) {
    if (!xs.length) return 0;
    const Rxx = xs.map(a => xs.map(b => R[a][b])), rxy = xs.map(a => R[a][y]);
    try { const b = solve(Rxx, rxy); return dot(b, rxy); } catch (e) { return NaN; }
  }

  // ------------------------------------------------------ distributions
  function lgamma(x) {
    const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.61503916999185, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1; let a = c[0]; const t = x + g + 0.5;
    for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  function betacf(a, b, x) {
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < 1e-300) d = 1e-300; d = 1 / d; let h = d;
    for (let m = 1; m <= 300; m++) {
      const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 3e-16) break;
    }
    return h;
  }
  function ibeta(x, a, b) { // regularised incomplete beta
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  function tTwoTailedP(t, df) { if (!isFinite(t)) return isNaN(t) ? NaN : 0; return ibeta(df / (df + t * t), df / 2, 0.5); }
  function fP(F, d1, d2) { if (!(F > 0)) return 1; return ibeta(d2 / (d2 + d1 * F), d2 / 2, d1 / 2); }
  function erf(x) {
    const s = Math.sign(x); x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  function pnorm(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }
  function qnorm(p) { // Acklam
    if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const pl = 0.02425; let q, r;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  // ------------------------------------------------------------- dataset
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/, 1)[0];
    const cand = [',', ';', '\t', '|'];
    let delim = ',', best = -1;
    for (const c of cand) { const k = first.split(c).length; if (k > best) { best = k; delim = c; } }
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = ''; if (row.some(c => c.trim() !== '')) rows.push(row); row = [];
      } else cell += ch;
    }
    row.push(cell); if (row.some(c => c.trim() !== '')) rows.push(row);
    if (rows.length < 2) throw new Error('csv_empty');
    const names = rows[0].map((h, i) => (h.trim() || ('V' + (i + 1))));
    const seen = {};
    for (let i = 0; i < names.length; i++) { let n = names[i], k = 2; while (seen[n]) n = names[i] + '_' + k++; seen[n] = 1; names[i] = n; }
    const missing = new Set(['', 'na', 'nan', 'null', '.', '-99', '-999', '-9999']);
    const comma = delim !== ',';
    const raw = names.map((_, j) => rows.slice(1).map(r => (r[j] === undefined ? '' : r[j].trim())));
    const cols = [], kinds = [], labels = [];
    for (let j = 0; j < names.length; j++) {
      const vals = raw[j]; let numeric = true;
      const arr = new Float64Array(vals.length);
      for (let i = 0; i < vals.length; i++) {
        const s = vals[i];
        if (missing.has(s.toLowerCase())) { arr[i] = NaN; continue; }
        const v = Number(comma ? s.replace(',', '.') : s);
        if (!isFinite(v)) { numeric = false; break; }
        arr[i] = v;
      }
      if (numeric) { cols.push(arr); kinds.push('num'); labels.push(null); }
      else { // categorical: code levels 1..k, keep labels
        const lv = [], idx = {};
        for (let i = 0; i < vals.length; i++) {
          const s = vals[i];
          if (missing.has(s.toLowerCase())) { arr[i] = NaN; continue; }
          if (!(s in idx)) { idx[s] = lv.length + 1; lv.push(s); }
          arr[i] = idx[s];
        }
        cols.push(arr); kinds.push('cat'); labels.push(lv);
      }
    }
    return { names, cols, kinds, labels, n: rows.length - 1 };
  }

  function describe(ds) {
    return ds.names.map((name, j) => {
      const v = Array.from(ds.cols[j]).filter(x => !isNaN(x));
      const n = v.length, m = n ? mean(v) : NaN, s = n > 1 ? sd(v, m) : NaN;
      let m3 = 0, m4 = 0; for (const x of v) { const d = (x - m) / s; m3 += d * d * d; m4 += d * d * d * d; }
      const skew = n > 2 ? n / ((n - 1) * (n - 2)) * m3 : NaN;
      const kurt = n > 3 ? (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3)) * m4 - 3 * (n - 1) * (n - 1) / ((n - 2) * (n - 3)) : NaN;
      const sorted = v.slice().sort((a, b) => a - b);
      return {
        name, kind: ds.kinds[j], n, missing: ds.cols[j].length - n, mean: m, median: quantile(sorted, 0.5),
        min: sorted[0], max: sorted[n - 1], sd: s, skewness: skew, kurtosis: kurt
      };
    });
  }

  // ---------------------------------------------------------- model spec
  /*
   * model = { constructs:[{id,name,mode:'A'|'B',indicators:[colName]}], paths:[{from,to}],
   *           interactions:[{id,name,x,m,y}] }  (ids of constructs)
   */
  function validate(model, ds) {
    const errs = [];
    const ids = new Set(model.constructs.map(c => c.id));
    if (!model.constructs.length) errs.push({ code: 'no_constructs' });
    for (const c of model.constructs) {
      if (!c.indicators.length) errs.push({ code: 'no_indicators', name: c.name });
      for (const ind of c.indicators) {
        const j = ds.names.indexOf(ind);
        if (j < 0) errs.push({ code: 'missing_column', name: ind });
        else if (ds.kinds[j] !== 'num') errs.push({ code: 'non_numeric', name: ind });
      }
    }
    for (const p of model.paths) if (!ids.has(p.from) || !ids.has(p.to)) errs.push({ code: 'bad_path' });
    for (const it of (model.interactions || [])) {
      if (!ids.has(it.x) || !ids.has(it.m) || !ids.has(it.y)) errs.push({ code: 'bad_interaction', name: it.name });
    }
    // cycles
    const adj = {}; for (const c of model.constructs) adj[c.id] = [];
    for (const p of model.paths) if (adj[p.from]) adj[p.from].push(p.to);
    const state = {}; let cyc = false;
    const dfs = u => { state[u] = 1; for (const v of adj[u] || []) { if (state[v] === 1) cyc = true; else if (!state[v]) dfs(v); } state[u] = 2; };
    for (const c of model.constructs) if (!state[c.id]) dfs(c.id);
    if (cyc) errs.push({ code: 'cycle' });
    if (model.constructs.length && !model.paths.length) errs.push({ code: 'no_paths' });
    return errs;
  }

  // Compile model + dataset into working raw columns and an index-based spec.
  function prepare(ds, model, opts) {
    opts = opts || {};
    const errs = validate(model, ds);
    if (errs.length) { const e = new Error('invalid_model'); e.details = errs; throw e; }
    const used = [];
    for (const c of model.constructs) for (const ind of c.indicators) if (!used.includes(ind)) used.push(ind);
    const colIdx = used.map(n => ds.names.indexOf(n));
    let rows = [];
    const N = ds.cols[0].length;
    const rowFilter = opts.rows ? new Set(opts.rows) : null;
    // weighted PLS: optional sampling-weight column (cases with missing or non-positive weight are dropped)
    const wj = opts.weightVar ? ds.names.indexOf(opts.weightVar) : -1;
    if (opts.weightVar && wj < 0) throw new Error('no_weight');
    for (let i = 0; i < N; i++) {
      if (rowFilter && !rowFilter.has(i)) continue;
      if (wj >= 0 && !(ds.cols[wj][i] > 0)) continue;
      if ((opts.missing || 'mean') === 'casewise' && colIdx.some(j => isNaN(ds.cols[j][i]))) continue;
      rows.push(i);
    }
    const raw = colIdx.map(j => {
      const v = new Float64Array(rows.length);
      let s = 0, k = 0;
      rows.forEach((r, i) => { v[i] = ds.cols[j][r]; if (!isNaN(v[i])) { s += v[i]; k++; } });
      const m = k ? s / k : 0;
      for (let i = 0; i < v.length; i++) if (isNaN(v[i])) v[i] = m;
      return v;
    });
    const spec = compileSpec(model, used);
    const weights = wj >= 0 ? Float64Array.from(rows, r => ds.cols[wj][r]) : null;
    return { raw, names: used, rows, spec, model, weights };
  }

  function compileSpec(model, used) {
    const cs = model.constructs, ids = cs.map(c => c.id);
    const lv = cs.map(c => ({ id: c.id, name: c.name, mode: c.mode === 'B' ? 'B' : 'A', idx: c.indicators.map(n => used.indexOf(n)), inter: null }));
    const inter = (model.interactions || []).map((it, q) => ({
      id: it.id, name: it.name || (cs[ids.indexOf(it.x)].name + ' x ' + cs[ids.indexOf(it.m)].name),
      x: ids.indexOf(it.x), m: ids.indexOf(it.m), y: ids.indexOf(it.y)
    }));
    const J0 = lv.length;
    inter.forEach((it, q) => lv.push({ id: it.id, name: it.name, mode: 'A', idx: [used.length + q], inter: it }));
    const J = lv.length;
    const pred = Array.from({ length: J }, () => []), succ = Array.from({ length: J }, () => []);
    for (const p of model.paths) {
      const a = ids.indexOf(p.from), b = ids.indexOf(p.to);
      if (!pred[b].includes(a)) { pred[b].push(a); succ[a].push(b); }
    }
    inter.forEach((it, q) => { const a = J0 + q; pred[it.y].push(a); succ[a].push(it.y); });
    const order = topo(J, pred);
    const base = { lv: lv.slice(0, J0), pred: pred.slice(0, J0).map(p => p.filter(i => i < J0)), J: J0 };
    base.succ = Array.from({ length: J0 }, () => []);
    base.pred.forEach((ps, j) => ps.forEach(i => base.succ[i].push(j)));
    base.order = topo(J0, base.pred);
    return { lv, pred, succ, J, J0, inter, order, base: inter.length ? base : null };
  }
  function topo(J, pred) {
    const out = [], seen = new Array(J).fill(false);
    const visit = j => { if (seen[j]) return; seen[j] = true; pred[j].forEach(visit); out.push(j); };
    for (let j = 0; j < J; j++) visit(j);
    return out;
  }

  // ------------------------------------------------------ PLS algorithm
  const DEFAULTS = { scheme: 'path', maxIter: 3000, tol: 1e-7, consistent: false, missing: 'mean' };

  function scores(Z, lv, w, n) {
    const y = new Float64Array(n);
    for (let k = 0; k < lv.idx.length; k++) { const col = Z[lv.idx[k]], wk = w[k]; for (let t = 0; t < n; t++) y[t] += wk * col[t]; }
    return y;
  }

  // Core iterative estimation on standardised columns Z.
  function fitCore(Z, spec, settings, initW) {
    const n = Z[0].length, n1 = n - 1, J = spec.J, lv = spec.lv;
    let w = initW ? initW.map(a => a.slice()) : lv.map(l => l.idx.map(() => 1));
    // Mode B needs the block correlation matrix (constant).
    const blockR = lv.map(l => l.mode === 'B' && l.idx.length > 1 ? l.idx.map(a => l.idx.map(b => dot(Z[a], Z[b]) / n1)) : null);
    let Y = [], it = 0, converged = false;
    const norm = j => {
      const y = scores(Z, lv[j], w[j], n), s = Math.sqrt(dot(y, y) / n1) || 1;
      w[j] = w[j].map(x => x / s); for (let t = 0; t < n; t++) y[t] /= s; return y;
    };
    for (let j = 0; j < J; j++) Y[j] = norm(j);
    for (it = 1; it <= settings.maxIter; it++) {
      const R = zeros(J, J);
      for (let a = 0; a < J; a++) { R[a][a] = 1; for (let b = a + 1; b < J; b++) R[a][b] = R[b][a] = dot(Y[a], Y[b]) / n1; }
      const E = zeros(J, J);
      for (let j = 0; j < J; j++) {
        const nb = spec.pred[j].concat(spec.succ[j]);
        if (settings.scheme === 'centroid') nb.forEach(i => { E[j][i] = Math.sign(R[j][i]) || 1; });
        else if (settings.scheme === 'factor') nb.forEach(i => { E[j][i] = R[j][i]; });
        else {
          spec.succ[j].forEach(i => { E[j][i] = R[j][i]; });
          const P = spec.pred[j];
          if (P.length) {
            let b; try { b = solve(P.map(a => P.map(c => R[a][c])), P.map(a => R[a][j])); } catch (e) { b = P.map(a => R[a][j]); }
            P.forEach((i, k) => { E[j][i] = b[k]; });
          }
        }
      }
      let diff = 0;
      const wNew = [];
      for (let j = 0; j < J; j++) {
        const l = lv[j];
        if (l.idx.length === 1) { wNew.push([1]); continue; }
        let proxy;
        const nb = spec.pred[j].concat(spec.succ[j]);
        if (!nb.length) proxy = Y[j];
        else { proxy = new Float64Array(n); nb.forEach(i => { const e = E[j][i], y = Y[i]; for (let t = 0; t < n; t++) proxy[t] += e * y[t]; }); }
        let wj = l.idx.map(k => dot(Z[k], proxy) / n1);
        if (l.mode === 'B') { try { wj = solve(blockR[j], wj); } catch (e) { /* keep mode A */ } }
        wNew.push(wj);
      }
      const wOld = w; w = wNew;
      for (let j = 0; j < J; j++) Y[j] = norm(j);
      for (let j = 0; j < J; j++) for (let k = 0; k < w[j].length; k++) diff = Math.max(diff, Math.abs(Math.abs(w[j][k]) - Math.abs(wOld[j][k])));
      if (diff < settings.tol) { converged = true; break; }
    }
    // final quantities
    const R = zeros(J, J);
    for (let a = 0; a < J; a++) { R[a][a] = 1; for (let b = a + 1; b < J; b++) R[a][b] = R[b][a] = dot(Y[a], Y[b]) / n1; }
    const L = lv.map((l, j) => l.idx.map(k => dot(Z[k], Y[j]) / n1));
    const fit = { w, Y, R, L, iterations: Math.min(it, settings.maxIter), converged, n, rhoA: null };
    fit.rhoA = lv.map((l, j) => rhoA(Z, l, w[j], n1));
    if (settings.consistent) applyPLSc(fit, spec);
    structural(fit, spec);
    return fit;
  }

  function rhoA(Z, l, w, n1) {
    if (l.idx.length < 2) return 1;
    const S = l.idx.map(a => l.idx.map(b => dot(Z[a], Z[b]) / n1));
    let ww = 0, w4 = 0, wSw = 0, wdw = 0;
    for (let i = 0; i < w.length; i++) { ww += w[i] * w[i]; w4 += Math.pow(w[i], 4); wdw += w[i] * w[i] * S[i][i]; for (let k = 0; k < w.length; k++) wSw += w[i] * S[i][k] * w[k]; }
    const den = ww * ww - w4;
    return ww * ww * (wSw - wdw) / den;
  }

  // Consistent PLS (Dijkstra & Henseler 2015): disattenuate reflective constructs.
  function applyPLSc(fit, spec) {
    const J = spec.J, q = new Array(J);
    for (let j = 0; j < J; j++) {
      const l = spec.lv[j];
      if (l.mode === 'A' && l.idx.length > 1) {
        const w = fit.w[j], ww = dot(w, w), ra = fit.rhoA[j];
        const c = Math.sqrt(Math.max(ra, 0)) / ww;
        fit.L[j] = w.map(x => x * c);
        q[j] = Math.sqrt(Math.max(Math.min(ra, 1), 1e-6));
      } else q[j] = 1;
    }
    for (let a = 0; a < J; a++) for (let b = 0; b < J; b++) if (a !== b) fit.R[a][b] /= q[a] * q[b];
    fit.qualityCorrected = true;
  }

  function structural(fit, spec) {
    const J = spec.J, B = zeros(J, J), r2 = new Array(J).fill(NaN);
    for (let j = 0; j < J; j++) {
      const P = spec.pred[j]; if (!P.length) continue;
      let b;
      try { b = solve(P.map(a => P.map(c => fit.R[a][c])), P.map(a => fit.R[a][j])); } catch (e) { b = P.map(() => NaN); }
      P.forEach((i, k) => { B[j][i] = b[k]; });
      r2[j] = dot(b, P.map(a => fit.R[a][j]));
    }
    fit.B = B; fit.r2 = r2;
    const n = fit.n;
    fit.r2adj = r2.map((r, j) => { const k = spec.pred[j].length; return k ? 1 - (1 - r) * (n - 1) / (n - k - 1) : NaN; });
    let T;
    try { const IB = eye(J).map((r, i) => r.map((v, k) => v - B[i][k])); T = inverse(IB).map((r, i) => r.map((v, k) => (i === k ? v - 1 : v))); }
    catch (e) { T = zeros(J, J); }
    fit.T = T;
  }

  // Weighted standardisation (Becker & Ismail, 2016): z_t = sqrt(c w_t)(x_t - m_w)/s_w with c = n/Σw, so that
  // every dot(z_a, z_b)/(n-1) used by the algorithm is a weighted correlation and fitCore needs no change.
  function weightRoot(w) { const n = w.length; let sw = 0; for (let t = 0; t < n; t++) sw += w[t]; return Float64Array.from(w, x => Math.sqrt(x * n / sw)); }
  function wstandardize(v, sq) {
    const n = v.length; let sw = 0, sm = 0;
    for (let t = 0; t < n; t++) { const c = sq[t] * sq[t]; sw += c; sm += c * v[t]; }
    const m = sm / sw; let ss = 0;
    for (let t = 0; t < n; t++) { const d = v[t] - m; ss += sq[t] * sq[t] * d * d; }
    const s = Math.sqrt(ss / (n - 1)) || 1, out = new Float64Array(n);
    for (let t = 0; t < n; t++) out[t] = sq[t] * (v[t] - m) / s;
    return out;
  }

  // Standardise, run two-stage interactions, estimate.
  function fitFull(raw, spec, settings, init, weights) {
    settings = Object.assign({}, DEFAULTS, settings || {});
    const sq = weights ? weightRoot(weights) : null;
    const stdz = v => (sq ? wstandardize(v, sq) : standardize(v));
    const Z = raw.map(stdz);
    if (spec.inter.length) {
      const s1 = fitCore(Z, spec.base, Object.assign({}, settings, { consistent: false }), init && init.base);
      spec.inter.forEach(it => {
        const x = s1.Y[it.x], m = s1.Y[it.m], p = new Float64Array(x.length);
        for (let t = 0; t < x.length; t++) p[t] = sq ? (x[t] / sq[t]) * (m[t] / sq[t]) : x[t] * m[t];
        Z.push(stdz(p));
      });
      const f = fitCore(Z, spec, settings, init && init.full);
      f.stage1W = s1.w; f.Z = Z; f.sq = sq; return f;
    }
    const f = fitCore(Z, spec, settings, init && init.full);
    f.Z = Z; f.sq = sq; return f;
  }
  function initFrom(fit) { return { full: fit.w, base: fit.stage1W }; }

  // ------------------------------------------------------- quality criteria
  function blockStats(fit, spec) {
    const n1 = fit.n - 1, Z = fit.Z;
    return spec.lv.map((l, j) => {
      const lam = fit.L[j], k = l.idx.length;
      const s = lam.reduce((a, b) => a + b, 0), e = lam.reduce((a, b) => a + (1 - b * b), 0);
      const ave = lam.reduce((a, b) => a + b * b, 0) / k;
      let alpha = NaN;
      if (k > 1) {
        let tot = 0;
        for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) tot += a === b ? 1 : dot(Z[l.idx[a]], Z[l.idx[b]]) / n1;
        alpha = k / (k - 1) * (1 - k / tot);
      } else alpha = 1;
      return { alpha, rhoA: fit.rhoA[j], rhoC: k > 1 ? s * s / (s * s + e) : 1, ave };
    });
  }

  function htmt(fit, spec) {
    const Z = fit.Z, n1 = fit.n - 1, J = spec.J;
    const cache = {};
    const r = (a, b) => { const key = a < b ? a + ',' + b : b + ',' + a; if (!(key in cache)) cache[key] = a === b ? 1 : Math.abs(dot(Z[a], Z[b]) / n1); return cache[key]; };
    const mono = spec.lv.map(l => {
      const k = l.idx.length; if (k < 2) return 1;
      let s = 0, c = 0; for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) { s += r(l.idx[a], l.idx[b]); c++; }
      return s / c;
    });
    const H = zeros(J, J);
    for (let i = 0; i < J; i++) for (let j = i + 1; j < J; j++) {
      let s = 0, c = 0; for (const a of spec.lv[i].idx) for (const b of spec.lv[j].idx) { s += r(a, b); c++; }
      H[i][j] = H[j][i] = (s / c) / Math.sqrt(mono[i] * mono[j]);
    }
    return H;
  }

  function f2(fit, spec) {
    const J = spec.J, F = zeros(J, J).map(r => r.map(() => NaN));
    for (let j = 0; j < J; j++) {
      const P = spec.pred[j]; if (!P.length) continue;
      const inc = fit.r2[j];
      P.forEach(i => { const exc = r2From(fit.R, j, P.filter(x => x !== i)); F[i][j] = (inc - exc) / (1 - inc); });
    }
    return F;
  }

  function innerVIF(fit, spec) {
    const J = spec.J, V = zeros(J, J).map(r => r.map(() => NaN));
    for (let j = 0; j < J; j++) {
      const P = spec.pred[j];
      P.forEach(i => { V[i][j] = P.length < 2 ? 1 : 1 / (1 - r2From(fit.R, i, P.filter(x => x !== i))); });
    }
    return V;
  }

  function outerVIF(fit, spec) {
    return spec.lv.map(l => {
      if (l.idx.length < 2) return [1];
      const R = l.idx.map(a => l.idx.map(b => a === b ? 1 : dot(fit.Z[a], fit.Z[b]) / (fit.n - 1)));
      return l.idx.map((_, k) => 1 / (1 - r2From(R, k, l.idx.map((__, q) => q).filter(q => q !== k))));
    });
  }

  // indicator correlation matrix (observed) and model-implied matrices
  function implied(fit, spec, estimated) {
    const Z = fit.Z, n1 = fit.n - 1;
    const ind = [], owner = [], pos = [];
    spec.lv.forEach((l, j) => l.idx.forEach((k, q) => { if (!ind.includes(k)) { ind.push(k); owner.push(j); pos.push(q); } }));
    const p = ind.length;
    const S = zeros(p, p), Sig = zeros(p, p);
    for (let a = 0; a < p; a++) for (let b = a; b < p; b++) S[a][b] = S[b][a] = a === b ? 1 : dot(Z[ind[a]], Z[ind[b]]) / n1;
    let P = fit.R;
    if (estimated) {
      const J = spec.J, Psi = zeros(J, J);
      const exo = []; for (let j = 0; j < J; j++) if (!spec.pred[j].length) exo.push(j);
      exo.forEach(a => exo.forEach(b => { Psi[a][b] = fit.R[a][b]; }));
      for (let j = 0; j < J; j++) if (spec.pred[j].length) Psi[j][j] = 1 - fit.r2[j];
      try {
        const Inv = inverse(eye(J).map((r, i) => r.map((v, k) => v - fit.B[i][k])));
        P = matmul(matmul(Inv, Psi), transpose(Inv));
      } catch (e) { P = fit.R; }
    }
    for (let a = 0; a < p; a++) for (let b = a; b < p; b++) {
      if (a === b) { Sig[a][a] = 1; continue; }
      const ja = owner[a], jb = owner[b], la = fit.L[ja][pos[a]], lb = fit.L[jb][pos[b]];
      let v;
      if (ja === jb) v = spec.lv[ja].mode === 'B' ? S[a][b] : la * lb;
      else v = la * P[ja][jb] * lb;
      Sig[a][b] = Sig[b][a] = v;
    }
    return { S, Sig, p };
  }
  function fitIndices(fit, spec, estimated) {
    const { S, Sig, p } = implied(fit, spec, estimated);
    let ss = 0, cnt = 0, uls = 0;
    for (let a = 0; a < p; a++) for (let b = 0; b <= a; b++) { const d = S[a][b] - Sig[a][b]; ss += d * d; cnt++; }
    for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) { const d = S[a][b] - Sig[a][b]; uls += d * d; }
    const out = { srmr: Math.sqrt(ss / cnt), dULS: 0.5 * uls, dG: NaN, chi2: NaN, nfi: NaN };
    try {
      const Ls = cholesky(S), Li = inverse(Ls);
      const M = matmul(matmul(Li, Sig), transpose(Li));
      const ev = jacobiEigen(M);
      out.dG = 0.5 * ev.reduce((a, l) => a + (l > 0 ? Math.pow(Math.log(l), 2) : NaN), 0);
      const lS = logdet(S), lSig = logdet(Sig);
      const SigInv = inverse(Sig);
      let tr = 0; for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) tr += S[a][b] * SigInv[b][a];
      const F = lSig - lS + tr - p;
      out.chi2 = (fit.n - 1) * F;
      const chi0 = (fit.n - 1) * (-lS);
      out.nfi = 1 - out.chi2 / chi0;
    } catch (e) { /* matrices not PD */ }
    return out;
  }

  function specificIndirect(fit, spec, limit) {
    limit = limit || 400;
    const out = [];
    const walk = (path) => {
      if (out.length >= limit) return;
      const last = path[path.length - 1];
      for (const k of spec.succ[last]) {
        const np = path.concat([k]);
        if (np.length >= 3) {
          let v = 1; for (let i = 1; i < np.length; i++) v *= fit.B[np[i]][np[i - 1]];
          out.push({ path: np, value: v });
        }
        walk(np);
      }
    };
    for (let j = 0; j < spec.J; j++) walk([j]);
    return out;
  }

  // Flat named statistics: used for the report and for every resample.
  function collectStats(fit, spec, opts) {
    opts = opts || {};
    const S = {}, lv = spec.lv, nm = j => lv[j].name;
    const names = opts.indNames || [];
    const indName = k => names[k] !== undefined ? names[k] : (lv.find(l => l.inter && l.idx[0] === k) || {}).name || ('x' + k);
    for (let j = 0; j < spec.J; j++) {
      spec.pred[j].forEach(i => { S['path|' + nm(i) + ' -> ' + nm(j)] = fit.B[j][i]; });
      if (spec.pred[j].length) { S['r2|' + nm(j)] = fit.r2[j]; S['r2adj|' + nm(j)] = fit.r2adj[j]; }
      lv[j].idx.forEach((k, q) => {
        S['loading|' + indName(k) + ' <- ' + nm(j)] = fit.L[j][q];
        S['weight|' + indName(k) + ' -> ' + nm(j)] = fit.w[j][q];
      });
    }
    for (let j = 0; j < spec.J; j++) for (let i = 0; i < spec.J; i++) {
      if (i === j) continue;
      const t = fit.T[j][i];
      if (Math.abs(t) > 0 || spec.pred[j].includes(i)) {
        S['total|' + nm(i) + ' -> ' + nm(j)] = t;
        const ind = t - fit.B[j][i];
        if (!spec.pred[j].includes(i) || Math.abs(ind) > 1e-12) S['indirect|' + nm(i) + ' -> ' + nm(j)] = ind;
      }
    }
    specificIndirect(fit, spec).forEach(s => { S['specific|' + s.path.map(nm).join(' -> ')] = s.value; });
    const F = f2(fit, spec);
    for (let j = 0; j < spec.J; j++) spec.pred[j].forEach(i => { S['f2|' + nm(i) + ' -> ' + nm(j)] = F[i][j]; });
    if (!opts.light) {
      blockStats(fit, spec).forEach((b, j) => {
        if (lv[j].inter) return;
        S['alpha|' + nm(j)] = b.alpha; S['rhoA|' + nm(j)] = b.rhoA; S['rhoC|' + nm(j)] = b.rhoC; S['ave|' + nm(j)] = b.ave;
      });
      const H = htmt(fit, spec);
      for (let i = 0; i < spec.J; i++) for (let j = i + 1; j < spec.J; j++) if (!lv[i].inter && !lv[j].inter) S['htmt|' + nm(j) + ' <-> ' + nm(i)] = H[i][j];
      const fi = fitIndices(fit, spec, false);
      S['fit|SRMR'] = fi.srmr; S['fit|d_ULS'] = fi.dULS; S['fit|d_G'] = fi.dG;
    }
    return S;
  }

  // Full report of a single estimation.
  function runPLS(ds, model, settings) {
    settings = Object.assign({}, DEFAULTS, settings || {});
    const prep = prepare(ds, model, settings);
    const fit = fitFull(prep.raw, prep.spec, settings, undefined, prep.weights);
    return report(prep, fit, settings);
  }

  function report(prep, fit, settings) {
    const spec = prep.spec, J = spec.J, lv = spec.lv;
    const names = lv.map(l => l.name);
    const indNames = prep.names.concat(spec.inter.map(it => it.name));
    const allInd = [];
    lv.forEach(l => l.idx.forEach(k => { if (!allInd.includes(k)) allInd.push(k); }));
    const n1 = fit.n - 1;
    const cross = allInd.map(k => lv.map((l, j) => dot(fit.Z[k], fit.Y[j]) / n1));
    const block = blockStats(fit, spec);
    const fl = fit.R.map((r, i) => r.map((v, j) => (i === j ? Math.sqrt(block[i].ave) : v)));
    const fitSat = fitIndices(fit, spec, false), fitEst = fitIndices(fit, spec, true);
    const sel = [];
    for (let j = 0; j < J; j++) {
      const k = spec.pred[j].length; if (!k) continue;
      const n = fit.n, sse = (n - 1) * (1 - fit.r2[j]);
      sel.push({
        construct: names[j], k,
        aic: n * Math.log(sse / n) + 2 * (k + 1),
        bic: n * Math.log(sse / n) + (k + 1) * Math.log(n),
        hq: n * Math.log(sse / n) + 2 * (k + 1) * Math.log(Math.log(n))
      });
    }
    return {
      kind: 'pls', settings, n: fit.n, iterations: fit.iterations, converged: fit.converged,
      constructs: names, modes: lv.map(l => l.mode), isInter: lv.map(l => !!l.inter),
      pred: spec.pred, order: spec.order,
      indicators: lv.map(l => l.idx.map(k => indNames[k])),
      paths: fit.B, total: fit.T, r2: fit.r2, r2adj: fit.r2adj, f2: f2(fit, spec),
      loadings: fit.L, weights: fit.w, lvCorr: fit.R,
      crossNames: allInd.map(k => indNames[k]), cross,
      reliability: block, fornell: fl, htmt: htmt(fit, spec),
      outerVIF: outerVIF(fit, spec), innerVIF: innerVIF(fit, spec),
      fit: { saturated: fitSat, estimated: fitEst },
      selection: sel,
      specific: specificIndirect(fit, spec).map(s => ({ path: s.path.map(j => names[j]), value: s.value })),
      scores: fit.Y.map(y => (fit.sq ? Array.from(y, (v, t) => v / fit.sq[t]) : Array.from(y))),
      weighted: !!fit.sq,
      rows: prep.rows,
      stats: collectStats(fit, spec, { indNames }),
      inter: spec.inter.map(it => ({ name: it.name, x: names[it.x], m: names[it.m], y: names[it.y] }))
    };
  }

  // ------------------------------------------------------------ bootstrap
  function bootstrap(ds, model, settings, opts, progress) {
    settings = Object.assign({}, DEFAULTS, settings || {});
    opts = Object.assign({ samples: 1000, seed: 1, alpha: 0.05, ci: 'percentile', test: 'two' }, opts || {});
    const prep = prepare(ds, model, settings);
    const fit0 = fitFull(prep.raw, prep.spec, settings, undefined, prep.weights);
    const indNames = prep.names.concat(prep.spec.inter.map(it => it.name));
    const orig = collectStats(fit0, prep.spec, { indNames });
    const keys = Object.keys(orig), K = keys.length;
    const B = opts.samples, n = prep.raw[0].length, rand = rng(opts.seed);
    const draws = keys.map(() => []);
    const init = initFrom(fit0);
    let failed = 0;
    for (let b = 0; b < B; b++) {
      const idx = new Int32Array(n); for (let t = 0; t < n; t++) idx[t] = Math.floor(rand() * n);
      const raw = prep.raw.map(c => { const v = new Float64Array(n); for (let t = 0; t < n; t++) v[t] = c[idx[t]]; return v; });
      const wb = prep.weights ? Float64Array.from(idx, t => prep.weights[t]) : undefined;
      try {
        const f = fitFull(raw, prep.spec, settings, init, wb);
        const s = collectStats(f, prep.spec, { indNames });
        for (let q = 0; q < K; q++) draws[q].push(s[keys[q]]);
      } catch (e) { failed++; }
      if (progress && (b % 20 === 0 || b === B - 1)) progress((b + 1) / B);
    }
    // jackknife for BCa acceleration
    let jack = null;
    if (opts.ci === 'bca') {
      jack = keys.map(() => []);
      for (let d = 0; d < n; d++) {
        const raw = prep.raw.map(c => { const v = new Float64Array(n - 1); let q = 0; for (let t = 0; t < n; t++) if (t !== d) v[q++] = c[t]; return v; });
        const wj = prep.weights ? prep.weights.filter((_, t) => t !== d) : undefined;
        try { const s = collectStats(fitFull(raw, prep.spec, settings, init, wj), prep.spec, { indNames }); keys.forEach((k, q) => jack[q].push(s[k])); } catch (e) { /* skip */ }
      }
    }
    const a = opts.alpha;
    const rows = keys.map((key, q) => {
      const o = orig[key], d = draws[q].filter(x => isFinite(x)), m = d.length ? mean(d) : NaN, s = d.length > 1 ? sd(d, m) : NaN;
      const sorted = d.slice().sort((x, y) => x - y);
      const tval = Math.abs(o / s);
      const df = Math.max(d.length - 1, 1);
      let p = tTwoTailedP(tval, df);
      if (opts.test === 'one') p /= 2;
      let lo, hi;
      if (opts.ci === 'bca' && jack) {
        const z0 = qnorm(Math.max(1e-10, Math.min(1 - 1e-10, sorted.filter(x => x < o).length / sorted.length)));
        const jv = jack[q].filter(isFinite), jm = mean(jv);
        let num = 0, den = 0; for (const x of jv) { const dd = jm - x; num += dd * dd * dd; den += dd * dd; }
        const acc = den > 0 ? num / (6 * Math.pow(den, 1.5)) : 0;
        const adj = z => pnorm(z0 + (z0 + z) / (1 - acc * (z0 + z)));
        lo = quantile(sorted, adj(qnorm(a / 2))); hi = quantile(sorted, adj(qnorm(1 - a / 2)));
      } else { lo = quantile(sorted, a / 2); hi = quantile(sorted, 1 - a / 2); }
      const [group, label] = splitKey(key);
      return { key, group, label, original: o, mean: m, sd: s, t: tval, p, lo, hi, draws: d.length > 2000 ? thin(d, 2000) : d };
    });
    return { kind: 'bootstrap', samples: B, failed, alpha: a, ci: opts.ci, test: opts.test, n, rows, settings, base: report(prep, fit0, settings) };
  }
  function thin(arr, k) { const out = [], step = arr.length / k; for (let i = 0; i < k; i++) out.push(arr[Math.floor(i * step)]); return out; }
  function splitKey(key) { const i = key.indexOf('|'); return [key.slice(0, i), key.slice(i + 1)]; }

  // ---------------------------------------------------------- blindfolding
  function blindfolding(ds, model, settings, opts, progress) {
    settings = Object.assign({}, DEFAULTS, settings || {});
    const D = (opts && opts.distance) || 7;
    const prep = prepare(ds, model, settings), spec = prep.spec;
    if (spec.inter.length) throw new Error('no_interactions');
    const n = prep.raw[0].length;
    const out = [];
    const targets = []; for (let j = 0; j < spec.J; j++) if (spec.pred[j].length) targets.push(j);
    let step = 0;
    for (const j of targets) {
      const blk = spec.lv[j].idx, K = blk.length;
      let sseR = 0, sseC = 0, sso = 0;
      for (let d = 0; d < D; d++) {
        const raw = prep.raw.map(c => Float64Array.from(c));
        const omit = [];
        for (let t = 0; t < n; t++) for (let q = 0; q < K; q++) if ((t * K + q) % D === d) omit.push([t, q]);
        blk.forEach((k, q) => {
          let s = 0, c = 0;
          for (let t = 0; t < n; t++) if ((t * K + q) % D !== d) { s += raw[k][t]; c++; }
          const m = s / c; for (let t = 0; t < n; t++) if ((t * K + q) % D === d) raw[k][t] = m;
        });
        const f = fitFull(raw, spec, settings);
        const mu = blk.map(k => mean(raw[k])), sg = blk.map(k => sd(raw[k]));
        for (const [t, q] of omit) {
          const k = blk[q], z = (prep.raw[k][t] - mu[q]) / sg[q];
          let yhat = 0; spec.pred[j].forEach(i => { yhat += f.B[j][i] * f.Y[i][t]; });
          const pr = f.L[j][q] * yhat, pc = f.L[j][q] * f.Y[j][t];
          sseR += (z - pr) * (z - pr); sseC += (z - pc) * (z - pc); sso += z * z;
        }
        step++; if (progress) progress(step / (targets.length * D));
      }
      out.push({ construct: spec.lv[j].name, sso, sseRed: sseR, sseCom: sseC, q2: 1 - sseR / sso, q2com: 1 - sseC / sso });
    }
    return { kind: 'blindfolding', distance: D, rows: out };
  }

  // ------------------------------------------------------------- PLSpredict
  function olsFit(X, y) { // X: array of columns (no intercept column); returns coefs incl. intercept first
    const p = X.length + 1, n = y.length;
    const XtX = zeros(p, p), Xty = new Array(p).fill(0);
    const col = k => (k === 0 ? null : X[k - 1]);
    for (let a = 0; a < p; a++) {
      const ca = col(a);
      for (let b = a; b < p; b++) {
        const cb = col(b); let s = 0;
        for (let t = 0; t < n; t++) s += (ca ? ca[t] : 1) * (cb ? cb[t] : 1);
        XtX[a][b] = XtX[b][a] = s;
      }
      let s = 0; for (let t = 0; t < n; t++) s += (ca ? ca[t] : 1) * y[t]; Xty[a] = s;
    }
    for (let a = 1; a < p; a++) XtX[a][a] += 1e-10;
    return { coef: solve(XtX, Xty), XtX };
  }

  function plspredict(ds, model, settings, opts, progress) {
    settings = Object.assign({}, DEFAULTS, settings || {});
    opts = Object.assign({ folds: 10, reps: 10, seed: 1 }, opts || {});
    const prep = prepare(ds, model, settings), spec = prep.spec;
    if (spec.inter.length) throw new Error('no_interactions');
    const n = prep.raw[0].length, rand = rng(opts.seed);
    const endo = []; for (let j = 0; j < spec.J; j++) if (spec.pred[j].length) endo.push(j);
    const ancestorsExo = j => { const s = new Set(), st = [j]; while (st.length) { const u = st.pop(); for (const i of spec.pred[u]) { if (!spec.pred[i].length) s.add(i); st.push(i); } } return Array.from(s); };
    const items = []; endo.forEach(j => spec.lv[j].idx.forEach((k, q) => items.push({ j, k, q })));
    const acc = items.map(() => ({ plsSE: 0, plsAE: 0, lmSE: 0, lmAE: 0, mSE: 0, cnt: 0, err: [] }));
    const lvAcc = endo.map(() => ({ se: 0, ae: 0, m: 0, cnt: 0 }));
    for (let r = 0; r < opts.reps; r++) {
      const perm = Array.from({ length: n }, (_, i) => i);
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
      for (let f = 0; f < opts.folds; f++) {
        const test = perm.filter((_, i) => i % opts.folds === f), testSet = new Set(test);
        const train = []; for (let t = 0; t < n; t++) if (!testSet.has(t)) train.push(t);
        const rawTr = prep.raw.map(c => Float64Array.from(train, t => c[t]));
        const mu = rawTr.map(c => mean(c)), sg = rawTr.map((c, k) => sd(c, mu[k]) || 1);
        const fit = fitFull(rawTr, spec, settings);
        const zt = prep.raw.map((c, k) => Float64Array.from(test, t => (c[t] - mu[k]) / sg[k]));
        const m = test.length, Yhat = [];
        // actual test composite scores (training weights)
        const Yact = spec.lv.map((l, j) => scores(zt, l, fit.w[j], m));
        spec.order.forEach(j => {
          if (!spec.pred[j].length) Yhat[j] = Yact[j];
          else { const y = new Float64Array(m); spec.pred[j].forEach(i => { const b = fit.B[j][i]; for (let t = 0; t < m; t++) y[t] += b * Yhat[i][t]; }); Yhat[j] = y; }
        });
        endo.forEach((j, e) => { for (let t = 0; t < m; t++) { const d = Yact[j][t] - Yhat[j][t]; lvAcc[e].se += d * d; lvAcc[e].ae += Math.abs(d); lvAcc[e].m += Yact[j][t] * Yact[j][t]; lvAcc[e].cnt++; } });
        // LM benchmark per indicator: regress on indicators of exogenous antecedents
        const lmCache = {};
        items.forEach((it, z) => {
          const exo = ancestorsExo(it.j);
          const xs = []; exo.forEach(i => spec.lv[i].idx.forEach(k => { if (!xs.includes(k)) xs.push(k); }));
          const key = xs.join(',');
          const ytr = rawTr[it.k];
          const fitLM = olsFit(xs.map(k => rawTr[k]), ytr);
          lmCache[key] = 1;
          const a = acc[z];
          for (let t = 0; t < m; t++) {
            const actual = prep.raw[it.k][test[t]];
            const pls = fit.L[it.j][it.q] * Yhat[it.j][t] * sg[it.k] + mu[it.k];
            let lm = fitLM.coef[0]; xs.forEach((k, c) => { lm += fitLM.coef[c + 1] * prep.raw[k][test[t]]; });
            const e1 = actual - pls, e2 = actual - lm, e3 = actual - mu[it.k];
            a.plsSE += e1 * e1; a.plsAE += Math.abs(e1); a.lmSE += e2 * e2; a.lmAE += Math.abs(e2); a.mSE += e3 * e3; a.cnt++;
            if (r === 0) a.err.push(e1);
          }
        });
        if (progress) progress((r * opts.folds + f + 1) / (opts.reps * opts.folds));
      }
    }
    const rows = items.map((it, z) => {
      const a = acc[z];
      const e = a.err, me = mean(e), s = sd(e, me);
      let m3 = 0; e.forEach(x => { m3 += Math.pow((x - me) / s, 3); }); const skew = m3 / e.length;
      return {
        indicator: prep.names[it.k], construct: spec.lv[it.j].name,
        q2: 1 - a.plsSE / a.mSE, plsRMSE: Math.sqrt(a.plsSE / a.cnt), plsMAE: a.plsAE / a.cnt,
        lmRMSE: Math.sqrt(a.lmSE / a.cnt), lmMAE: a.lmAE / a.cnt, lmQ2: 1 - a.lmSE / a.mSE, errSkew: skew, errors: e
      };
    });
    const lvRows = endo.map((j, e) => ({ construct: spec.lv[j].name, q2: 1 - lvAcc[e].se / lvAcc[e].m, rmse: Math.sqrt(lvAcc[e].se / lvAcc[e].cnt), mae: lvAcc[e].ae / lvAcc[e].cnt }));
    return { kind: 'predict', folds: opts.folds, reps: opts.reps, rows, lvRows };
  }

  // ----------------------------------------------------------------- IPMA
  function ipma(ds, model, settings, opts) {
    settings = Object.assign({}, DEFAULTS, settings || {});
    const prep = prepare(ds, model, settings), spec = prep.spec;
    if (spec.inter.length) throw new Error('no_interactions');
    const fit = fitFull(prep.raw, spec, settings);
    const target = opts && opts.target !== undefined ? spec.lv.findIndex(l => l.id === opts.target) : spec.order[spec.order.length - 1];
    const ranges = (opts && opts.ranges) || {};
    const resc = prep.raw.map((c, k) => {
      const r = ranges[prep.names[k]] || {}; let lo = r.min, hi = r.max;
      if (!isFinite(lo)) lo = Math.min.apply(null, c); if (!isFinite(hi)) hi = Math.max.apply(null, c);
      return Float64Array.from(c, x => (hi > lo ? (x - lo) / (hi - lo) * 100 : 50));
    });
    const sds = prep.raw.map(c => sd(c) || 1);
    const rw = spec.lv.map((l, j) => { const u = l.idx.map((k, q) => fit.w[j][q] / sds[k]); const s = u.reduce((a, b) => a + b, 0); return u.map(x => x / s); });
    const n = prep.raw[0].length;
    const S = spec.lv.map((l, j) => { const y = new Float64Array(n); l.idx.forEach((k, q) => { for (let t = 0; t < n; t++) y[t] += rw[j][q] * resc[k][t]; }); return y; });
    const J = spec.J, Bu = zeros(J, J);
    for (let j = 0; j < J; j++) { const P = spec.pred[j]; if (!P.length) continue; const c = olsFit(P.map(i => S[i]), S[j]).coef; P.forEach((i, q) => { Bu[j][i] = c[q + 1]; }); }
    const Tu = inverse(eye(J).map((r, i) => r.map((v, k) => v - Bu[i][k]))).map((r, i) => r.map((v, k) => (i === k ? v - 1 : v)));
    const lvRows = [], indRows = [];
    for (let i = 0; i < J; i++) {
      if (i === target || Math.abs(Tu[target][i]) < 1e-12 && !isPathTo(spec, i, target)) continue;
      lvRows.push({ construct: spec.lv[i].name, importance: Tu[target][i], performance: mean(S[i]) });
      spec.lv[i].idx.forEach((k, q) => indRows.push({ indicator: prep.names[k], construct: spec.lv[i].name, importance: rw[i][q] * Tu[target][i], performance: mean(resc[k]) }));
    }
    return { kind: 'ipma', target: spec.lv[target].name, targetPerformance: mean(S[target]), lvRows, indRows, rescaledWeights: rw.map((w, j) => ({ construct: spec.lv[j].name, indicators: spec.lv[j].idx.map(k => prep.names[k]), weights: w })) };
  }
  function isPathTo(spec, a, b) { const st = [a], seen = new Set(); while (st.length) { const u = st.pop(); if (u === b) return true; if (seen.has(u)) continue; seen.add(u); spec.succ[u].forEach(v => st.push(v)); } return false; }

  // ---------------------------------------------------- multigroup (MGA)
  function mga(ds, model, settings, opts, progress) {
    settings = Object.assign({}, DEFAULTS, settings || {});
    opts = Object.assign({ permutations: 1000, seed: 1 }, opts || {});
    const gcol = ds.names.indexOf(opts.groupVar);
    if (gcol < 0) throw new Error('no_group');
    const lab = ds.labels[gcol];
    const values = Array.from(new Set(Array.from(ds.cols[gcol]).filter(v => !isNaN(v)))).sort((a, b) => a - b);
    let pairs = opts.groups ? [opts.groups] : [values.slice(0, 2)];
    if (values.length < 2) throw new Error('one_group');
    if (opts.groups && opts.groups[0] === opts.groups[1]) throw new Error('same_group');
    const gname = v => (lab ? lab[v - 1] : String(v));
    const rowsOf = v => { const r = []; for (let i = 0; i < ds.cols[gcol].length; i++) if (ds.cols[gcol][i] === v) r.push(i); return r; };
    const results = [];
    const prepAll = prepare(ds, model, settings);
    const indNames = prepAll.names.concat(prepAll.spec.inter.map(it => it.name));
    for (const [g1, g2] of pairs) {
      const r1 = rowsOf(g1), r2 = rowsOf(g2);
      const p1 = prepare(ds, model, Object.assign({}, settings, { rows: r1 }));
      const p2 = prepare(ds, model, Object.assign({}, settings, { rows: r2 }));
      const f1 = fitFull(p1.raw, p1.spec, settings), f2_ = fitFull(p2.raw, p2.spec, settings);
      const s1 = collectStats(f1, p1.spec, { indNames, light: true }), s2 = collectStats(f2_, p2.spec, { indNames, light: true });
      const keys = Object.keys(s1).filter(k => /^(path|total|indirect|r2|loading|weight)\|/.test(k));
      // pooled raw for permutation
      const pooled = prepare(ds, model, Object.assign({}, settings, { rows: r1.concat(r2) }));
      const N = pooled.raw[0].length, n1 = p1.raw[0].length;
      const label = new Int8Array(N);
      { const set1 = new Set(r1); pooled.rows.forEach((r, i) => { label[i] = set1.has(r) ? 1 : 2; }); }
      const sub = (lbl, g) => pooled.raw.map(c => { const v = []; for (let t = 0; t < N; t++) if (lbl[t] === g) v.push(c[t]); return Float64Array.from(v); });
      // MICOM step 2/3 statistics
      const Zp = pooled.raw.map(standardize);
      const micom = (lbl, w1, w2) => {
        const spec = pooled.spec;
        const res = spec.lv.filter(l => !l.inter).map((l, j) => {
          const c = corr(scores(Zp, l, w1[j], N), scores(Zp, l, w2[j], N));
          return c;
        });
        return res;
      };
      const fp = fitFull(pooled.raw, pooled.spec, settings);
      const mv = (lbl) => pooled.spec.lv.filter(l => !l.inter).map((l, j) => {
        const y = fp.Y[j], a = [], b = []; for (let t = 0; t < N; t++) (lbl[t] === 1 ? a : b).push(y[t]);
        return { mean: mean(a) - mean(b), lvar: Math.log(Math.pow(sd(a), 2) / Math.pow(sd(b), 2)) };
      });
      const c0 = micom(label, f1.w, f2_.w), mv0 = mv(label);
      const rand = rng(opts.seed);
      const cnt = keys.map(() => 0), permC = c0.map(() => []), permM = mv0.map(() => []), permV = mv0.map(() => []);
      const diff0 = keys.map(k => s1[k] - s2[k]);
      const lbl = Int8Array.from(label);
      for (let p = 0; p < opts.permutations; p++) {
        for (let i = N - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = lbl[i]; lbl[i] = lbl[j]; lbl[j] = t; }
        try {
          const a = fitFull(sub(lbl, 1), pooled.spec, settings, initFrom(f1)), b = fitFull(sub(lbl, 2), pooled.spec, settings, initFrom(f2_));
          const sa = collectStats(a, pooled.spec, { indNames, light: true }), sb = collectStats(b, pooled.spec, { indNames, light: true });
          keys.forEach((k, q) => { if (Math.abs(sa[k] - sb[k]) >= Math.abs(diff0[q])) cnt[q]++; });
          micom(lbl, a.w, b.w).forEach((c, q) => permC[q].push(c));
          mv(lbl).forEach((m, q) => { permM[q].push(m.mean); permV[q].push(m.lvar); });
        } catch (e) { /* skip failed permutation */ }
        if (progress && p % 10 === 0) progress((p + 1) / opts.permutations);
      }
      const P = permC[0] ? permC[0].length : 0;
      const rows = keys.map((k, q) => { const [group, lbl2] = splitKey(k); return { key: k, group, label: lbl2, g1: s1[k], g2: s2[k], diff: diff0[q], p: P ? cnt[q] / P : NaN }; });
      const micomRows = pooled.spec.lv.filter(l => !l.inter).map((l, q) => {
        const sc = permC[q].slice().sort((a, b) => a - b), sm = permM[q].slice().sort((a, b) => a - b), sv = permV[q].slice().sort((a, b) => a - b);
        return {
          construct: l.name, c: c0[q], c5: quantile(sc, 0.05), pc: sc.filter(x => x <= c0[q]).length / (sc.length || 1),
          meanDiff: mv0[q].mean, meanLo: quantile(sm, 0.025), meanHi: quantile(sm, 0.975), pMean: sm.filter(x => Math.abs(x) >= Math.abs(mv0[q].mean)).length / (sm.length || 1),
          varDiff: mv0[q].lvar, varLo: quantile(sv, 0.025), varHi: quantile(sv, 0.975), pVar: sv.filter(x => Math.abs(x) >= Math.abs(mv0[q].lvar)).length / (sv.length || 1)
        };
      });
      results.push({ g1: gname(g1), g2: gname(g2), n1: p1.raw[0].length, n2: p2.raw[0].length, permutations: P, rows, micom: micomRows });
    }
    return { kind: 'mga', groupVar: opts.groupVar, groups: values.map(gname), results };
  }

  // ------------------------------------------------- necessary conditions
  function ncaPair(x, y) {
    const n = x.length, idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => x[a] - x[b] || y[b] - y[a]);
    const xmin = x[idx[0]], xmax = x[idx[n - 1]];
    let ymin = Infinity, ymax = -Infinity; for (let i = 0; i < n; i++) { ymin = Math.min(ymin, y[i]); ymax = Math.max(ymax, y[i]); }
    // CE-FDH ceiling: running max of y over increasing x
    const steps = []; let run = -Infinity;
    for (const i of idx) { if (y[i] > run) { run = y[i]; steps.push([x[i], run]); } }
    let area = 0;
    for (let s = 0; s < steps.length; s++) {
      const x0 = steps[s][0], x1 = s + 1 < steps.length ? steps[s + 1][0] : xmax;
      area += (x1 - x0) * (ymax - steps[s][1]);
    }
    const scope = (xmax - xmin) * (ymax - ymin);
    const d = scope > 0 ? area / scope : 0;
    let viol = 0; // accuracy: points above ceiling (0 for CE-FDH)
    const bottleneck = [];
    for (let pct = 0; pct <= 100; pct += 10) {
      const yl = ymin + (ymax - ymin) * pct / 100; let req = null;
      for (const [sx, sy] of steps) if (sy >= yl - 1e-12) { req = sx; break; }
      bottleneck.push({ y: pct, x: req === null ? null : (req - xmin) / (xmax - xmin) * 100 });
    }
    return { d, steps, xmin, xmax, ymin, ymax, accuracy: 1 - viol / n, bottleneck };
  }
  function nca(ds, model, settings, opts, progress) {
    settings = Object.assign({}, DEFAULTS, settings || {});
    opts = Object.assign({ permutations: 200, seed: 1 }, opts || {});
    const rep = runPLS(ds, model, settings);
    const rand = rng(opts.seed), out = [];
    const pairs = []; rep.pred.forEach((P, j) => P.forEach(i => { if (!rep.isInter[i]) pairs.push([i, j]); }));
    pairs.forEach(([i, j], q) => {
      const x = rep.scores[i], y = rep.scores[j], r = ncaPair(x, y);
      let ge = 0; const ys = y.slice();
      for (let p = 0; p < opts.permutations; p++) {
        for (let a = ys.length - 1; a > 0; a--) { const b = Math.floor(rand() * (a + 1)); [ys[a], ys[b]] = [ys[b], ys[a]]; }
        if (ncaPair(x, ys).d >= r.d) ge++;
      }
      out.push({ x: rep.constructs[i], y: rep.constructs[j], d: r.d, p: (ge + 1) / (opts.permutations + 1), steps: r.steps, bottleneck: r.bottleneck, points: x.map((v, t) => [v, y[t]]), xmin: r.xmin, xmax: r.xmax, ymin: r.ymin, ymax: r.ymax });
      if (progress) progress((q + 1) / pairs.length);
    });
    return { kind: 'nca', rows: out };
  }

  // ---------------------------------------------------------- regression
  function regression(ds, opts) {
    const yj = ds.names.indexOf(opts.y), xj = opts.x.map(n => ds.names.indexOf(n));
    if (yj < 0 || xj.some(j => j < 0) || !xj.length) throw new Error('bad_regression');
    const rows = []; for (let i = 0; i < ds.cols[0].length; i++) if (!isNaN(ds.cols[yj][i]) && xj.every(j => !isNaN(ds.cols[j][i]))) rows.push(i);
    const y = Float64Array.from(rows, i => ds.cols[yj][i]), X = xj.map(j => Float64Array.from(rows, i => ds.cols[j][i]));
    const n = rows.length, k = X.length;
    const { coef, XtX } = olsFit(X, y);
    const inv = inverse(XtX);
    let sse = 0, sst = 0; const my = mean(y);
    const fitted = new Float64Array(n);
    for (let t = 0; t < n; t++) { let v = coef[0]; X.forEach((c, q) => { v += coef[q + 1] * c[t]; }); fitted[t] = v; sse += (y[t] - v) * (y[t] - v); sst += (y[t] - my) * (y[t] - my); }
    const df = n - k - 1, s2 = sse / df, r2 = 1 - sse / sst;
    const sy = sd(y), R = corrMatrix(X);
    const terms = ['(Intercept)'].concat(opts.x).map((name, q) => {
      const se = Math.sqrt(inv[q][q] * s2), t = coef[q] / se;
      const vif = q === 0 ? NaN : (k < 2 ? 1 : 1 / (1 - r2From(R, q - 1, R.map((_, a) => a).filter(a => a !== q - 1))));
      return { name, b: coef[q], beta: q === 0 ? NaN : coef[q] * sd(X[q - 1]) / sy, se, t, p: tTwoTailedP(t, df), vif };
    });
    const F = (r2 / k) / ((1 - r2) / df);
    return { kind: 'regression', y: opts.y, n, r2, r2adj: 1 - (1 - r2) * (n - 1) / df, F, pF: fP(F, k, df), df1: k, df2: df, terms, residuals: Array.from(fitted, (v, t) => [v, y[t] - v]) };
  }

  const api = {
    rng, mean, sd, standardize, corr, corrMatrix, quantile, median, inverse, solve, jacobiEigen, cholesky, logdet, lgamma, matmul, transpose, zeros, eye, dot, olsFit, r2From,
    tTwoTailedP, fP, pnorm, qnorm, ibeta, parseCSV, describe, validate, prepare, fitFull, collectStats,
    runPLS, bootstrap, blindfolding, plspredict, ipma, mga, nca, ncaPair, regression, splitKey, DEFAULTS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.YPEngine = api;
})(typeof self !== 'undefined' ? self : this);
