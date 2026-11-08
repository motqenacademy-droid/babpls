/*
 * BabPls engine module: CB-SEM extensions (AMOS-style)
 * UMD: extends window.YPEngine (browser/worker) or the Node export of advanced3.js. Each analysis registers
 * E.tasks[kind] = (ds, model, settings, opts, progress) => result (result.kind selects the renderer in js/ui-amos.js).
 *
 * A general covariance-structure engine in RAM notation (McArdle & McDonald, 1984): all observed and latent
 * variables v = (x, η) satisfy v = A v + u, Cov(u) = Ω, E(u) = m, so with B = (I − A)⁻¹
 *     C = B Ω Bᵀ (implied covariances of all variables),  Σ = F C Fᵀ,  μ = F B m  (F selects the observed ones).
 * The diagram gives the default model (marker loadings fixed at 1, exogenous latents correlated); an optional
 * lavaan-like syntax adds error covariances, fixed values, equality labels, intercepts and user-defined estimands.
 *
 * Conventions follow IBM SPSS Amos (Arbuckle, 2019, Appendices A–C): the sample covariance matrix S is the unbiased
 * one (divisor N − 1) and CMIN = (N − G)·F̂ (n = N − 1 for one group) for ML, GLS, ULS, SLS and ADF; with incomplete
 * data (FIML) CMIN is the deviance against the saturated model, −2 ln L(model) + 2 ln L(saturated).
 */
(function (root) {
  'use strict';
  const E = (typeof module !== 'undefined' && module.exports) ? require('./advanced3.js') : root.YPEngine;
  E.tasks = E.tasks || {};
  const { mean, zeros, eye, inverse, logdet, cholesky, rng, qnorm, pnorm, ibeta, quantile, lgamma } = E;
  const chi2cdf = E.chi2cdf;

  const fail = (code, details) => { const e = new Error(code); if (details && details.length) e.details = details; return e; };
  const ESTIMATORS = ['ML', 'GLS', 'ULS', 'SLS', 'ADF', 'FIML'];

  // ------------------------------------------------------------ distributions
  // noncentral χ² CDF as a Poisson mixture of central χ² CDFs, summed over ±(12√(λ/2) + 40) terms around the mode
  function ncchi2cdf(x, df, lam) {
    if (!(lam > 0)) return chi2cdf(x, df);
    const h = lam / 2, j0 = Math.floor(h), K = Math.ceil(12 * Math.sqrt(h) + 40); let s = 0;
    for (let j = Math.max(0, j0 - K); j <= j0 + K; j++) s += Math.exp(-h + j * Math.log(h) - lgamma(j + 1)) * chi2cdf(x, df + 2 * j);
    return Math.min(1, s);
  }
  // λ such that P(χ²(df, λ) ≤ x) = target (0 when even the central distribution gives less)
  function lambdaFor(x, df, target) {
    if (!(df > 0) || !isFinite(x)) return NaN;
    if (ncchi2cdf(x, df, 0) < target) return 0;
    let lo = 0, hi = Math.max(10, 2 * x); while (ncchi2cdf(x, df, hi) > target) hi *= 2;
    for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (ncchi2cdf(x, df, m) > target) lo = m; else hi = m; if (hi - lo < 1e-10 * (1 + hi)) break; }
    return (lo + hi) / 2;
  }
  function chi2q(pr, df) { // quantile of the central χ²
    if (!(df > 0)) return NaN;
    let lo = 0, hi = Math.max(10, 4 * df); while (chi2cdf(hi, df) < pr) hi *= 2;
    for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (chi2cdf(m, df) < pr) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  const chi2sf = (x, df) => (df > 0 ? Math.max(0, 1 - chi2cdf(x, df)) : NaN);
  const z2p = z => (isFinite(z) ? 2 * (1 - pnorm(Math.abs(z))) : NaN);

  // ------------------------------------------------------------ small linear algebra
  function mm(A, B) { // dense product of arrays of arrays
    const n = A.length, k = B.length, m = B[0].length, C = zeros(n, m);
    for (let i = 0; i < n; i++) { const Ai = A[i], Ci = C[i]; for (let t = 0; t < k; t++) { const a = Ai[t]; if (a === 0) continue; const Bt = B[t]; for (let j = 0; j < m; j++) Ci[j] += a * Bt[j]; } }
    return C;
  }
  const tp = A => A[0].map((_, j) => A.map(r => r[j]));
  function eigSym(S) { // Jacobi rotations: eigenvalues and eigenvectors (columns of V)
    const n = S.length, A = S.map(r => r.slice()), V = eye(n);
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
      if (off < 1e-26) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;
        const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const a = A[k][p], b = A[k][q]; A[k][p] = c * a - s * b; A[k][q] = s * a + c * b; }
        for (let k = 0; k < n; k++) { const a = A[p][k], b = A[q][k]; A[p][k] = c * a - s * b; A[q][k] = s * a + c * b; }
        for (let k = 0; k < n; k++) { const a = V[k][p], b = V[k][q]; V[k][p] = c * a - s * b; V[k][q] = s * a + c * b; }
      }
    }
    return { values: A.map((r, i) => r[i]), vectors: V };
  }
  function powSym(S, e) { const { values, vectors: V } = eigSym(S), n = S.length, d = values.map(v => Math.pow(Math.max(v, 1e-300), e)), R = zeros(n, n); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < n; k++) s += V[i][k] * d[k] * V[j][k]; R[i][j] = s; } return R; }
  function covOf(X, unbiased) { // X: columns
    const p = X.length, N = X[0].length, mu = X.map(mean), S = zeros(p, p), div = unbiased ? N - 1 : N;
    for (let a = 0; a < p; a++) for (let b = a; b < p; b++) { let s = 0; const xa = X[a], xb = X[b], ma = mu[a], mb = mu[b]; for (let t = 0; t < N; t++) s += (xa[t] - ma) * (xb[t] - mb); S[a][b] = S[b][a] = s / div; }
    return { S, mu };
  }

  // ------------------------------------------------------------ syntax
  const IDENT = /^[\p{L}_][\p{L}\p{N}_.]*$/u;
  function parseTerm(tm, line, errs) {
    const k = tm.indexOf('*'); let mod = null, name = tm;
    if (k >= 0) {
      const m = tm.slice(0, k).trim(); name = tm.slice(k + 1).trim();
      if (/^NA$/i.test(m)) mod = { free: true };
      else if (m !== '' && isFinite(Number(m))) mod = { fixed: Number(m) };
      else if (IDENT.test(m)) mod = { label: m };
      else { errs.push({ code: 'amos_syn_parse', name: line + ': ' + tm }); return null; }
    }
    if (!name || /[\s*~=:+]/.test(name)) { errs.push({ code: 'amos_syn_parse', name: line + ': ' + tm }); return null; }
    return { name, mod };
  }
  // Statements: "F =~ x1 + a*x2 + 1*x3", "y ~ b*x", "y ~ 1" (intercept), "x1 ~~ x2", "ind := a*b"; comments # or !; ";" separates.
  function parseSyntax(text) {
    const stmts = [], errs = [];
    String(text || '').split(/\r?\n/).forEach((raw, li) => {
      raw.replace(/[#!].*$/, '').split(';').forEach(part => {
        const s = part.trim(); if (!s) return;
        const line = li + 1; let op = null, at = -1;
        for (const o of [':=', '=~', '~~', '~']) { const k = s.indexOf(o); if (k >= 0) { op = o; at = k; break; } }
        if (!op || at === 0) { errs.push({ code: 'amos_syn_parse', name: line + ': ' + s }); return; }
        const lhs = s.slice(0, at).trim(), rhs = s.slice(at + op.length).trim();
        if (!lhs || !rhs) { errs.push({ code: 'amos_syn_parse', name: line + ': ' + s }); return; }
        if (op === ':=') {
          if (!IDENT.test(lhs)) { errs.push({ code: 'amos_syn_parse', name: line + ': ' + s }); return; }
          stmts.push({ op, lhs: [lhs], expr: rhs, line }); return;
        }
        const L = lhs.split('+').map(x => x.trim());
        if (L.some(x => !x || /[\s*]/.test(x))) { errs.push({ code: 'amos_syn_parse', name: line + ': ' + s }); return; }
        const terms = rhs.split('+').map(x => x.trim());
        if (terms.some(x => !x)) { errs.push({ code: 'amos_syn_parse', name: line + ': ' + s }); return; }
        const parsed = terms.map(x => parseTerm(x, line, errs));
        if (parsed.some(x => !x)) return;
        stmts.push({ op, lhs: L, rhs: parsed, line });
      });
    });
    return { stmts, errs };
  }
  // arithmetic for := (numbers, labels, + − * / ^, parentheses, sqrt exp log abs); returns { fn(env), ids }
  const FUN = { sqrt: Math.sqrt, exp: Math.exp, log: Math.log, abs: Math.abs };
  function parseExpr(src) {
    const toks = String(src).match(/\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?|[\p{L}_][\p{L}\p{N}_.]*|[-+*/^()]|\S/gu) || [];
    let i = 0; const ids = new Set();
    const bad = () => { throw new Error('expr'); };
    const add = () => { let a = mul(); while (toks[i] === '+' || toks[i] === '-') { const o = toks[i++], b = mul(), x = a; a = o === '+' ? e => x(e) + b(e) : e => x(e) - b(e); } return a; };
    const mul = () => { let a = un(); while (toks[i] === '*' || toks[i] === '/') { const o = toks[i++], b = un(), x = a; a = o === '*' ? e => x(e) * b(e) : e => x(e) / b(e); } return a; };
    const un = () => { if (toks[i] === '-') { i++; const a = un(); return e => -a(e); } if (toks[i] === '+') { i++; return un(); } return pw(); };
    const pw = () => { const a = prim(); if (toks[i] === '^') { i++; const b = un(); return e => Math.pow(a(e), b(e)); } return a; };
    const prim = () => {
      const tk = toks[i++]; if (tk === undefined) bad();
      if (tk === '(') { const a = add(); if (toks[i++] !== ')') bad(); return a; }
      if (/^[\d.]/.test(tk)) { const c = Number(tk); if (!isFinite(c)) bad(); return () => c; }
      if (IDENT.test(tk)) {
        if (toks[i] === '(') { const F = FUN[tk]; if (!F) bad(); i++; const a = add(); if (toks[i++] !== ')') bad(); return e => F(a(e)); }
        ids.add(tk); return e => e[tk];
      }
      return bad();
    };
    const fn = add(); if (i !== toks.length) bad();
    return { fn, ids: [...ids] };
  }

  // ------------------------------------------------------------ model specification
  /*
   * Returns { obs, lat, vars, p, nv, entries, means, defs, labels }. entries: { mat:'A'|'S'|'M', i, j, fixed (null = free),
   * label, kind, key, src }. A[i][j]: effect of j on i. kinds: load, path; var (exogenous variance), xcov (covariance of
   * exogenous variables), evar/ecov (measurement residuals), dvar/dcov (structural residuals); int, mean, lmean.
   */
  function buildSpec(ds, model, syntax, opts) {
    opts = opts || {};
    model = model || { constructs: [], paths: [], interactions: [] };
    const errs = [], cons = model.constructs || [];
    if ((model.interactions || []).length) throw fail('cbsem_interactions');
    if (cons.some(c => c.mode === 'B')) throw fail('cbsem_formative');
    const numCols = new Set(ds.names.filter((n, j) => ds.kinds[j] === 'num')), allCols = new Set(ds.names);
    const lat = [], obs = [], latSet = new Set(), obsSet = new Set();
    const addLat = nm => { if (!latSet.has(nm)) { latSet.add(nm); lat.push(nm); } };
    const addObs = nm => { if (!obsSet.has(nm)) { obsSet.add(nm); obs.push(nm); } };
    const ent = new Map(); // key -> entry (by names)
    const kA = (to, fr) => 'A|' + to + '|' + fr, kS = (a, b) => 'S|' + (a < b ? a + '|' + b : b + '|' + a), kM = v => 'M|' + v;
    // as in lavaan: a number fixes, NA frees, and a label names the parameter without changing whether it is fixed
    const apply = (e, mod) => { if (!mod) return; if (mod.free) { e.fixed = null; } else if ('fixed' in mod) { e.fixed = mod.fixed; } else if (mod.label) { e.label = mod.label; } };
    const setA = (to, fr, mod, src, dflt) => { const k = kA(to, fr); let e = ent.get(k); if (!e) { e = { mat: 'A', to, fr, fixed: dflt === undefined ? null : dflt, label: null, src }; ent.set(k, e); } apply(e, mod); return e; };
    const setS = (a, b, mod, src) => { const k = kS(a, b); let e = ent.get(k); if (!e) { e = { mat: 'S', a: a < b ? a : b, b: a < b ? b : a, fixed: null, label: null, src }; ent.set(k, e); } apply(e, mod); return e; };
    const setM = (v, mod, src, dflt) => { const k = kM(v); let e = ent.get(k); if (!e) { e = { mat: 'M', v, fixed: dflt === undefined ? null : dflt, label: null, src }; ent.set(k, e); } apply(e, mod); return e; };
    // ---- diagram
    const byId = {}; cons.forEach(c => { byId[c.id] = c; });
    const single = new Set();
    cons.forEach(c => {
      if (!c.indicators.length) errs.push({ code: 'no_indicators', name: c.name });
      if (allCols.has(c.name)) errs.push({ code: 'amos_name_clash', name: c.name });
      addLat(c.name);
      c.indicators.forEach((x, q) => {
        if (!allCols.has(x)) { errs.push({ code: 'missing_column', name: x }); return; }
        if (!numCols.has(x)) { errs.push({ code: 'non_numeric', name: x }); return; }
        addObs(x); setA(x, c.name, null, 'diagram', q === 0 ? 1 : null);
      });
      if (c.indicators.length === 1) single.add(c.indicators[0]);
    });
    (model.paths || []).forEach(p => { if (!byId[p.from] || !byId[p.to]) { errs.push({ code: 'bad_path' }); return; } setA(byId[p.to].name, byId[p.from].name, null, 'diagram'); });
    // ---- syntax
    const P = parseSyntax(syntax); errs.push(...P.errs);
    const synLat = new Set(), firstDone = new Set(), defs = [];
    P.stmts.forEach(s => { if (s.op === '=~') s.lhs.forEach(F => { if (obsSet.has(F) || (allCols.has(F) && !latSet.has(F))) errs.push({ code: 'amos_syn_latobs', name: s.line + ': ' + F }); else { if (!latSet.has(F)) synLat.add(F); addLat(F); } }); });
    const resolve = (nm, line) => {
      if (latSet.has(nm)) return nm;
      if (numCols.has(nm)) { addObs(nm); return nm; }
      errs.push({ code: allCols.has(nm) ? 'non_numeric' : 'amos_syn_var', name: line + ': ' + nm }); return null;
    };
    let wantMeans = !!opts.means;
    P.stmts.forEach(s => {
      if (s.op === ':=') { defs.push({ name: s.lhs[0], expr: s.expr, line: s.line }); return; }
      s.lhs.forEach(L0 => {
        const L = resolve(L0, s.line); if (L === null) return;
        s.rhs.forEach(tm => {
          if (s.op === '~' && tm.name === '1') { wantMeans = true; setM(L, tm.mod, 'syntax'); return; }
          const R = resolve(tm.name, s.line); if (R === null) return;
          if (s.op === '=~') {
            const first = synLat.has(L) && !firstDone.has(L); firstDone.add(L);
            if (R === L) { errs.push({ code: 'amos_syn_parse', name: s.line + ': ' + L + ' =~ ' + R }); return; }
            setA(R, L, tm.mod, 'syntax', first ? 1 : null); // the first indicator of a new latent is its marker unless NA* frees it
          } else if (s.op === '~') {
            if (R === L) { errs.push({ code: 'amos_syn_parse', name: s.line + ': ' + L + ' ~ ' + R }); return; }
            setA(L, R, tm.mod, 'syntax');
          } else setS(L, R, tm.mod, 'syntax');
        });
      });
    });
    if (errs.length) throw fail('amos_syntax', errs);
    const vars = obs.concat(lat), p = obs.length, nv = vars.length, ix = {}; vars.forEach((v, i) => { ix[v] = i; });
    if (!lat.length && !P.stmts.length) throw fail('no_constructs');
    if (p < 2) throw fail('amos_too_few');
    // ---- exogenous / endogenous (fixed-zero arrows do not count) and cycles
    const isArrow = e => e.mat === 'A' && e.fixed !== 0;
    const incoming = new Set([...ent.values()].filter(isArrow).map(e => e.to));
    const succ = {}; vars.forEach(v => { succ[v] = []; }); [...ent.values()].filter(isArrow).forEach(e => succ[e.fr].push(e.to));
    const state = {}; let cyc = false; const dfs = u => { state[u] = 1; succ[u].forEach(v => { if (state[v] === 1) cyc = true; else if (!state[v]) dfs(v); }); state[u] = 2; };
    vars.forEach(v => { if (!state[v]) dfs(v); });
    if (cyc) throw fail('amos_nonrecursive');
    const exo = vars.filter(v => !incoming.has(v));
    // ---- default variances and covariances
    vars.forEach(v => { if (!ent.has(kS(v, v))) { const e = setS(v, v, null, 'default'); if (obsSet.has(v) && single.has(v) && [...ent.values()].filter(x => isArrow(x) && x.to === v).length === 1 && cons.some(c => c.indicators.length === 1 && c.indicators[0] === v)) e.fixed = 0; } });
    exo.forEach((a, x) => exo.forEach((b, y) => { if (y > x && !ent.has(kS(a, b))) setS(a, b, null, 'default'); }));
    if (wantMeans) { obs.forEach(v => { if (!ent.has(kM(v))) setM(v, null, 'default'); }); lat.forEach(v => { if (!ent.has(kM(v))) setM(v, null, 'default', 0); }); }
    // ---- scaling and use of every latent variable
    lat.forEach(F => {
      const out = [...ent.values()].filter(e => e.mat === 'A' && e.fr === F && e.fixed !== 0);
      if (!out.length) { errs.push({ code: 'no_indicators', name: F }); return; }
      const v = ent.get(kS(F, F));
      if (!out.some(e => e.fixed !== null) && !(v && v.fixed !== null)) errs.push({ code: 'amos_syn_scale', name: F });
    });
    // ---- labels: a label names either free parameters (equal) or one fixed value
    const labels = {};
    [...ent.values()].forEach(e => { if (!e.label) return; (labels[e.label] = labels[e.label] || []).push(e); });
    Object.keys(labels).forEach(l => { // a label shared with a fixed parameter fixes the whole group at that value
      const fx = [...new Set(labels[l].filter(e => e.fixed !== null).map(e => e.fixed))];
      if (fx.length > 1) errs.push({ code: 'amos_syn_labelfix', name: l });
      else if (fx.length === 1) labels[l].forEach(e => { e.fixed = fx[0]; });
    });
    const known = new Set(Object.keys(labels)), defN = new Set();
    defs.forEach(d => {
      if (known.has(d.name) || defN.has(d.name)) { errs.push({ code: 'amos_syn_dup', name: d.line + ': ' + d.name }); return; }
      try { d.parsed = parseExpr(d.expr); } catch (e) { errs.push({ code: 'amos_syn_expr', name: d.line + ': ' + d.expr }); return; }
      d.parsed.ids.forEach(id => { if (!known.has(id) && !defN.has(id)) errs.push({ code: 'amos_syn_label', name: d.line + ': ' + id }); });
      defN.add(d.name);
    });
    if (errs.length) throw fail('amos_syntax', errs);
    // ---- index-based entries with kinds
    const endoLat = new Set(lat.filter(v => incoming.has(v))), isObs = v => obsSet.has(v);
    const entries = [...ent.values()].map(e => {
      if (e.mat === 'A') { const i = ix[e.to], j = ix[e.fr]; return { mat: 'A', i, j, fixed: e.fixed, label: e.label, src: e.src, kind: isObs(e.to) && !isObs(e.fr) ? 'load' : 'path', key: 'A|' + i + '|' + j }; }
      if (e.mat === 'M') { const i = ix[e.v]; return { mat: 'M', i, j: i, fixed: e.fixed, label: e.label, src: e.src, kind: isObs(e.v) ? (incoming.has(e.v) ? 'int' : 'mean') : 'lmean', key: 'M|' + i }; }
      const i = ix[e.a], j = ix[e.b], ea = !incoming.has(e.a), eb = !incoming.has(e.b);
      let kind;
      if (i === j) kind = ea ? 'var' : (isObs(e.a) ? 'evar' : 'dvar');
      else if (ea && eb) kind = 'xcov';
      else if (!ea && !eb && endoLat.has(e.a) && endoLat.has(e.b)) kind = 'dcov';
      else kind = 'ecov';
      return { mat: 'S', i: Math.min(i, j), j: Math.max(i, j), fixed: e.fixed, label: e.label, src: e.src, kind, key: 'S|' + Math.min(i, j) + '|' + Math.max(i, j) };
    });
    const order = { A: 0, M: 2, S: 1 };
    entries.sort((a, b) => order[a.mat] - order[b.mat] || a.i - b.i || a.j - b.j);
    return { obs, lat, vars, p, nv, entries, means: wantMeans, defs, exo: exo.map(v => ix[v]), endo: vars.filter(v => incoming.has(v)).map(v => ix[v]), syntaxUsed: P.stmts.length > 0 };
  }

  // ------------------------------------------------------------ parameter layout (groups, equality constraints)
  // shared: Set of entry kinds constrained equal across groups; shared.has('int') also frees latent means in groups > 1
  function layout(spec, G, shared) {
    shared = shared || new Set();
    const keys = new Map(); let q = 0;
    const id = k => { if (!keys.has(k)) keys.set(k, q++); return keys.get(k); };
    const ents = [];
    for (let g = 0; g < G; g++) ents.push(spec.entries.map(e => {
      let fixed = e.fixed;
      if (e.kind === 'lmean' && shared.has('int') && g > 0 && e.src === 'default') fixed = null;
      if (fixed !== null) return Object.assign({}, e, { idx: -1, fixed });
      const k = e.label ? 'L:' + e.label : (shared.has(e.kind) && e.kind !== 'lmean' ? e.key : e.key + '#' + g);
      return Object.assign({}, e, { idx: id(k), fixed: null });
    }));
    return { ents, q, keys: [...keys.keys()] };
  }

  // ------------------------------------------------------------ data
  function completeCols(ds, names, rows) {
    const cols = names.map(n => ds.cols[ds.names.indexOf(n)]);
    const keep = rows.filter(r => cols.every(c => isFinite(c[r])));
    return { X: cols.map(c => Float64Array.from(keep, r => c[r])), rows: keep };
  }
  function moments(X, est, rows) {
    const p = X.length, N = X[0].length;
    if (N <= p + 1) throw fail('amos_small_n');
    const { S, mu } = covOf(X, true);
    let ldS; try { ldS = logdet(S); } catch (e) { throw fail('amos_singular'); }
    const d = { N, n: N - 1, p, S, ldS, Sinv: inverse(S), xbar: mu, X, rows };
    if (est === 'ADF') {
      const pairs = []; for (let a = 0; a < p; a++) for (let b = a; b < p; b++) pairs.push([a, b]);
      const ps = pairs.length; if (N <= ps) throw fail('amos_adf_n');
      const Z = X.map((c, a) => Float64Array.from(c, v => v - mu[a]));
      const Pr = pairs.map(([a, b]) => Float64Array.from(Z[a], (v, t) => v * Z[b][t]));
      const w = Pr.map(mean), U = zeros(ps, ps);
      for (let k = 0; k < ps; k++) for (let l = k; l < ps; l++) { let s = 0; const x = Pr[k], y = Pr[l]; for (let t = 0; t < N; t++) s += x[t] * y[t]; U[k][l] = U[l][k] = s / N - w[k] * w[l]; }
      try { d.Uinv = inverse(U); } catch (e) { throw fail('amos_adf_n'); }
      d.pairs = pairs;
    }
    return d;
  }
  // incomplete data for FIML: rows with at least one observed value, grouped by missing-data pattern
  function fimlData(ds, names, rows) {
    const cols = names.map(n => ds.cols[ds.names.indexOf(n)]), p = names.length, pats = new Map(), keep = [];
    rows.forEach(r => { const o = []; cols.forEach((c, a) => { if (isFinite(c[r])) o.push(a); }); if (!o.length) return; keep.push(r); const k = o.join(','); if (!pats.has(k)) pats.set(k, { o, rows: [] }); pats.get(k).rows.push(r); });
    const N = keep.length; if (N <= p + 1) throw fail('amos_small_n');
    const patterns = [...pats.values()].map(pt => {
      const n = pt.rows.length, k = pt.o.length, xbar = pt.o.map(a => { let s = 0; pt.rows.forEach(r => { s += cols[a][r]; }); return s / n; });
      const M2 = zeros(k, k); pt.rows.forEach(r => { for (let a = 0; a < k; a++) for (let b = 0; b <= a; b++) M2[a][b] += cols[pt.o[a]][r] * cols[pt.o[b]][r]; });
      for (let a = 0; a < k; a++) for (let b = 0; b <= a; b++) M2[b][a] = M2[a][b];
      const Sb = M2.map((rw, a) => rw.map((v, b) => v / n - xbar[a] * xbar[b]));
      return { o: pt.o, n, xbar, Sb, M2, M1: xbar.map(v => v * n), cst: k * Math.log(2 * Math.PI) };
    });
    const missing = patterns.some(pt => pt.o.length < p);
    return { fiml: true, N, n: N - 1, p, patterns, rows: keep, missing, cols, names };
  }
  // saturated model with incomplete data: EM for the unrestricted mean vector and covariance matrix (Dempster et al., 1977)
  function emSaturated(d) {
    const p = d.p, N = d.N; let mu = new Array(p).fill(0), Sg = zeros(p, p);
    { const cnt = new Array(p).fill(0), s1 = new Array(p).fill(0), s2 = new Array(p).fill(0); d.patterns.forEach(pt => pt.o.forEach((a, k) => { cnt[a] += pt.n; s1[a] += pt.M1[k]; s2[a] += pt.M2[k][k]; })); for (let a = 0; a < p; a++) { mu[a] = s1[a] / cnt[a]; Sg[a][a] = Math.max(s2[a] / cnt[a] - mu[a] * mu[a], 1e-6); } }
    let ll = Infinity;
    for (let it = 0; it < 20000; it++) {
      const T1 = new Array(p).fill(0), T2 = zeros(p, p);
      d.patterns.forEach(pt => {
        const o = pt.o, m = []; for (let a = 0; a < p; a++) if (!o.includes(a)) m.push(a);
        if (!m.length) { o.forEach((a, k) => { T1[a] += pt.M1[k]; o.forEach((b, l) => { T2[a][b] += pt.M2[k][l]; }); }); return; }
        const Soo = o.map(a => o.map(b => Sg[a][b])), Soi = inverse(Soo), Smo = m.map(a => o.map(b => Sg[a][b]));
        const Bm = mm(Smo, Soi), Cmm = m.map((a, i) => m.map((b, j) => Sg[a][b] - Bm[i].reduce((s, v, k) => s + v * Smo[j][k], 0)));
        const av = m.map((a, i) => mu[a] - Bm[i].reduce((s, v, k) => s + v * mu[o[k]], 0));
        const BM1 = Bm.map(r => r.reduce((s, v, k) => s + v * pt.M1[k], 0)), BM2 = mm(Bm, pt.M2);
        o.forEach((a, k) => { T1[a] += pt.M1[k]; o.forEach((b, l) => { T2[a][b] += pt.M2[k][l]; }); });
        m.forEach((a, i) => {
          T1[a] += pt.n * av[i] + BM1[i];
          o.forEach((b, l) => { const v = av[i] * pt.M1[l] + BM2[i][l]; T2[a][b] += v; T2[b][a] += v; });
          m.forEach((b, j) => { let v = pt.n * av[i] * av[j] + av[i] * BM1[j] + BM1[i] * av[j] + pt.n * Cmm[i][j]; for (let k = 0; k < o.length; k++) v += BM2[i][k] * Bm[j][k]; T2[a][b] += v; });
        });
      });
      mu = T1.map(v => v / N); Sg = T2.map((r, a) => r.map((v, b) => v / N - mu[a] * mu[b]));
      const lln = fimlDeviance(d, Sg, mu);
      if (Math.abs(ll - lln) < 1e-11 * (1 + Math.abs(lln))) { ll = lln; break; }
      ll = lln;
    }
    return { mu, S: Sg, dev: ll };
  }
  function fimlDeviance(d, Sig, mu) { // −2 ln L
    let s = 0;
    for (const pt of d.patterns) {
      const o = pt.o, Soo = o.map(a => o.map(b => Sig[a][b])); let ld; try { ld = logdet(Soo); } catch (e) { return Infinity; }
      const Si = inverse(Soo), dm = pt.xbar.map((v, k) => v - mu[o[k]]); let tr = 0;
      for (let a = 0; a < o.length; a++) for (let b = 0; b < o.length; b++) tr += Si[a][b] * (pt.Sb[b][a] + dm[b] * dm[a]);
      s += pt.n * (pt.cst + ld + tr);
    }
    return s;
  }

  // ------------------------------------------------------------ implied moments and discrepancy functions
  function implied(spec, ents, th) {
    const nv = spec.nv, p = spec.p, A = zeros(nv, nv), Om = zeros(nv, nv), mv = new Array(nv).fill(0);
    for (const e of ents) { const v = e.idx >= 0 ? th[e.idx] : e.fixed; if (e.mat === 'A') A[e.i][e.j] = v; else if (e.mat === 'S') { Om[e.i][e.j] = v; Om[e.j][e.i] = v; } else mv[e.i] = v; }
    const B = inverse(eye(nv).map((r, i) => r.map((v, k) => v - A[i][k])));
    const C = mm(mm(B, Om), tp(B)), Sig = C.slice(0, p).map(r => r.slice(0, p)), Bm = B.map(r => r.reduce((s, v, k) => s + v * mv[k], 0));
    return { A, Om, mv, B, C, Sig, mu: Bm.slice(0, p), Bm };
  }
  // value of F and dF/dΣ (G, symmetric, dF = tr(G dΣ)) and dF/dμ (gm) for one group
  function discrepancy(est, d, st, means, wantG) {
    const p = d.p, Sig = st.Sig;
    if (est === 'FIML') {
      let f = 0; const G = wantG ? zeros(p, p) : null, gm = wantG ? new Array(p).fill(0) : null;
      for (const pt of d.patterns) {
        const o = pt.o, k = o.length, Soo = o.map(a => o.map(b => Sig[a][b])); let ld; try { ld = logdet(Soo); } catch (e) { return { f: Infinity }; }
        const Si = inverse(Soo), dm = pt.xbar.map((v, z) => v - st.mu[o[z]]), M = pt.Sb.map((r, a) => r.map((v, b) => v + dm[a] * dm[b]));
        let tr = 0; for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) tr += Si[a][b] * M[b][a];
        const w = pt.n / d.N; f += w * (ld + tr);
        if (wantG) { const SMS = mm(mm(Si, M), Si); for (let a = 0; a < k; a++) { let u = 0; for (let b = 0; b < k; b++) { G[o[a]][o[b]] += w * (Si[a][b] - SMS[a][b]); u += Si[a][b] * dm[b]; } gm[o[a]] += -2 * w * u; } }
      }
      return { f, G, gm };
    }
    const S = d.S, R = zeros(p, p); for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) R[a][b] = S[a][b] - Sig[a][b];
    if (est === 'ML') {
      let ld; try { ld = logdet(Sig); } catch (e) { return { f: Infinity }; }
      const Si = inverse(Sig); let tr = 0; for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) tr += S[a][b] * Si[b][a];
      let f = ld - d.ldS + tr - p, dm = null, u = null;
      if (means) { dm = d.xbar.map((v, k) => v - st.mu[k]); u = Si.map(r => r.reduce((s, v, k) => s + v * dm[k], 0)); f += dm.reduce((s, v, k) => s + v * u[k], 0); }
      if (!wantG) return { f };
      const SSS = mm(mm(Si, S), Si), G = Si.map((r, a) => r.map((v, b) => v - SSS[a][b] - (means ? u[a] * u[b] : 0)));
      return { f, G, gm: means ? u.map(v => -2 * v) : null, Si };
    }
    if (est === 'GLS') {
      const T = mm(d.Sinv, R); let f = 0; for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) f += T[a][b] * T[b][a]; f /= 2;
      return { f, G: wantG ? mm(T, d.Sinv).map(r => r.map(v => -v)) : null };
    }
    if (est === 'ULS') { let f = 0; for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) f += R[a][b] * R[a][b]; return { f: f / 2, G: wantG ? R.map(r => r.map(v => -v)) : null }; }
    if (est === 'SLS') { let f = 0; const G = zeros(p, p); for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) { const w = 1 / (S[a][a] * S[b][b]); f += w * R[a][b] * R[a][b]; G[a][b] = -w * R[a][b]; } return { f: f / 2, G }; }
    if (est === 'ADF') {
      const r = d.pairs.map(([a, b]) => R[a][b]), v = d.Uinv.map(row => row.reduce((s, x, k) => s + x * r[k], 0));
      const f = r.reduce((s, x, k) => s + x * v[k], 0); if (!wantG) return { f };
      const G = zeros(p, p); d.pairs.forEach(([a, b], k) => { if (a === b) G[a][a] = -2 * v[k]; else { G[a][b] = -v[k]; G[b][a] = -v[k]; } });
      return { f, G };
    }
    throw fail('amos_estimator');
  }
  // objective over groups: F = Σ_g w_g F_g with w_g = n_g / Σ n (N_g / N for FIML), and its gradient
  function makeObjective(spec, L, data, est) {
    const p = spec.p, nv = spec.nv, tot = data.reduce((s, d) => s + (est === 'FIML' ? d.N : d.n), 0);
    const w = data.map(d => (est === 'FIML' ? d.N : d.n) / tot);
    return (th, wantGrad) => {
      let f = 0; const grad = wantGrad ? new Float64Array(L.q) : null;
      for (let g = 0; g < data.length; g++) {
        let st; try { st = implied(spec, L.ents[g], th); } catch (e) { return { f: Infinity }; }
        const r = discrepancy(est, data[g], st, spec.means, wantGrad);
        if (!isFinite(r.f)) return { f: Infinity };
        f += w[g] * r.f;
        if (!wantGrad) continue;
        const B = st.B, C = st.C, G = r.G, BtH = zeros(nv, p); // (Bᵀ H) restricted to the observed columns
        for (let a = 0; a < nv; a++) for (let b = 0; b < p; b++) { let s = 0; for (let k = 0; k < p; k++) s += B[k][a] * G[k][b]; BtH[a][b] = s; }
        const u = r.gm ? Array.from({ length: nv }, (_, a) => { let s = 0; for (let k = 0; k < p; k++) s += B[k][a] * r.gm[k]; return s; }) : null;
        for (const e of L.ents[g]) {
          if (e.idx < 0) continue; let v = 0;
          if (e.mat === 'A') { for (let b = 0; b < p; b++) v += BtH[e.i][b] * C[b][e.j]; v *= 2; if (u) v += u[e.i] * st.Bm[e.j]; }
          else if (e.mat === 'S') { for (let b = 0; b < p; b++) v += BtH[e.i][b] * B[b][e.j]; if (e.i !== e.j) v *= 2; }
          else v = u ? u[e.i] : 0;
          grad[e.idx] += w[g] * v;
        }
      }
      return { f, g: grad };
    };
  }

  // ------------------------------------------------------------ optimiser (BFGS with Armijo backtracking)
  function bfgs(fg, x0, maxIt, Hi0, prog) {
    const q = x0.length, x = Float64Array.from(x0);
    let r = fg(x, true); if (!isFinite(r.f)) return null;
    if (!q) return { th: x, f: r.f, it: 0, converged: true, gmax: 0, Hi: [] };
    let f = r.f, g = r.g, Hi = Hi0 ? Hi0.map(row => row.slice()) : eye(q), it, gmax = Infinity;
    for (it = 1; it <= maxIt; it++) {
      let dvec = new Float64Array(q); for (let a = 0; a < q; a++) { let s = 0; const H = Hi[a]; for (let b = 0; b < q; b++) s -= H[b] * g[b]; dvec[a] = s; }
      let gd = 0; for (let a = 0; a < q; a++) gd += g[a] * dvec[a];
      if (!(gd < 0)) { Hi = eye(q); dvec = Float64Array.from(g, v => -v); gd = 0; for (let a = 0; a < q; a++) gd -= g[a] * g[a]; }
      let step = 1, tn = null, fn = Infinity;
      for (let ls = 0; ls < 60; ls++) { tn = Float64Array.from(x, (v, a) => v + step * dvec[a]); fn = fg(tn, false).f; if (fn <= f + 1e-4 * step * gd) break; step *= 0.5; }
      if (!(fn <= f + 1e-4 * step * gd)) break;
      const rn = fg(tn, true), gn = rn.g, sv = Float64Array.from(tn, (v, a) => v - x[a]), y = Float64Array.from(gn, (v, a) => v - g[a]);
      let sy = 0; for (let a = 0; a < q; a++) sy += sv[a] * y[a];
      if (sy > 1e-16) {
        const rr = 1 / sy, Hy = Hi.map(row => { let s = 0; for (let b = 0; b < q; b++) s += row[b] * y[b]; return s; }); let yHy = 0; for (let a = 0; a < q; a++) yHy += y[a] * Hy[a];
        for (let a = 0; a < q; a++) for (let b = 0; b < q; b++) Hi[a][b] += (1 + rr * yHy) * rr * sv[a] * sv[b] - rr * (Hy[a] * sv[b] + sv[a] * Hy[b]);
      }
      const dF = f - fn; x.set(tn); f = rn.f; g = gn;
      gmax = 0; for (let a = 0; a < q; a++) gmax = Math.max(gmax, Math.abs(g[a]));
      if (prog && it % 25 === 0) prog(Math.min(0.95, it / 400));
      if (gmax < 1e-9 || (dF >= 0 && dF < 1e-16 * (1 + Math.abs(f)) && gmax < 1e-6)) break;
    }
    return { th: x, f, it, converged: gmax < 1e-5, gmax, Hi };
  }
  // start values from the data (first group): marker-based loadings, half of the variances as residual variances
  function startValues(spec, L, data) {
    const th = new Float64Array(L.q), cnt = new Float64Array(L.q), p = spec.p;
    data.forEach((d, g) => {
      const S = d.fiml ? d.Sstart : d.S, xbar = d.fiml ? d.mstart : d.xbar, ents = L.ents[g];
      const varOf = {}; // rough latent variances
      spec.lat.forEach((nm, z) => {
        const j = p + z, outs = ents.filter(e => e.mat === 'A' && e.j === j && e.i < p);
        const mk = outs.find(e => e.idx < 0 && e.fixed);
        if (mk) { const others = outs.filter(e => e !== mk); const c = others.map(e => S[e.i][mk.i]); varOf[j] = Math.max(0.05 * S[mk.i][mk.i], c.length ? mean(c) / (mk.fixed * mk.fixed) : 0.5 * S[mk.i][mk.i] / (mk.fixed * mk.fixed)); varOf[j + 'mk'] = mk; }
        else { const fv = ents.find(e => e.mat === 'S' && e.i === j && e.j === j); varOf[j] = fv && fv.idx < 0 && fv.fixed > 0 ? fv.fixed : 1; }
      });
      ents.forEach(e => {
        if (e.idx < 0) return; let v = 0;
        if (e.mat === 'A') {
          if (e.i < p && e.j >= p) { const mk = varOf[e.j + 'mk']; v = mk ? S[e.i][mk.i] / (mk.fixed * varOf[e.j]) : Math.sqrt(0.5 * S[e.i][e.i] / varOf[e.j]); if (!isFinite(v) || Math.abs(v) < 1e-3) v = 0.5; }
          else if (e.i >= p && e.j >= p) v = 0; else v = 0;
        } else if (e.mat === 'S') {
          if (e.i === e.j) v = e.i < p ? (e.kind === 'var' ? S[e.i][e.i] : 0.5 * S[e.i][e.i]) : (e.kind === 'var' ? varOf[e.i] : 0.5 * varOf[e.i]);
          else if (e.i < p && e.j < p && e.kind === 'xcov') v = S[e.i][e.j];
          else v = 0;
        } else v = e.i < p ? xbar[e.i] : 0;
        th[e.idx] += v; cnt[e.idx]++;
      });
    });
    return th.map((v, i) => v / (cnt[i] || 1));
  }
  function optimize(spec, L, data, est, th0, prog) {
    const fg = makeObjective(spec, L, data, est);
    let sol = bfgs(fg, th0 || startValues(spec, L, data), 5000, null, prog);
    if (!sol) { // alternative start: larger residual variances
      const t2 = startValues(spec, L, data); L.ents[0].forEach(e => { if (e.idx >= 0 && e.mat === 'S' && e.i === e.j) t2[e.idx] *= 1.6; });
      sol = bfgs(fg, t2, 5000, null, prog);
    }
    if (!sol) throw fail('cbsem_start');
    if (!sol.converged) { const s2 = bfgs(fg, sol.th, 5000, null, prog); if (s2 && s2.f <= sol.f) sol = s2; }
    sol.fg = fg;
    return sol;
  }

  // ------------------------------------------------------------ standard errors
  // Δ_a = ∂Σ/∂θ_a and ∂μ/∂θ_a per group by central differences
  function derivs(spec, L, th, G) {
    const out = [];
    for (let g = 0; g < G; g++) {
      const D = [];
      for (let a = 0; a < L.q; a++) {
        const h = 1e-6 * Math.max(1, Math.abs(th[a])), tp1 = Float64Array.from(th), tm1 = Float64Array.from(th); tp1[a] += h; tm1[a] -= h;
        const s1 = implied(spec, L.ents[g], tp1), s2 = implied(spec, L.ents[g], tm1);
        D.push({ S: s1.Sig.map((r, i) => r.map((v, j) => (v - s2.Sig[i][j]) / (2 * h))), m: s1.mu.map((v, i) => (v - s2.mu[i]) / (2 * h)) });
      }
      out.push(D);
    }
    return out;
  }
  // information matrix (total, i.e. Σ n_g × per-case information): ML/GLS (K = Σ̂⁻¹ or S⁻¹): ½tr(KΔ_aKΔ_b) + Δμ_a'KΔμ_b; ADF: Δ_a' U⁻¹ Δ_b
  function information(est, spec, data, D, Kmats) {
    const q = D[0] ? D[0].length : 0, I = zeros(q, q);
    data.forEach((d, g) => {
      const Dg = D[g], p = d.p;
      if (est === 'ADF') {
        const V = Dg.map(x => d.pairs.map(([a, b]) => x.S[a][b])), UV = V.map(v => d.Uinv.map(row => row.reduce((s, x, k) => s + x * v[k], 0)));
        for (let a = 0; a < q; a++) for (let b = a; b < q; b++) { const v = d.n * V[a].reduce((s, x, k) => s + x * UV[b][k], 0); I[a][b] += v; if (a !== b) I[b][a] += v; }
        return;
      }
      const K = Kmats[g], W = Dg.map(x => mm(K, x.S)), Km = spec.means ? Dg.map(x => K.map(r => r.reduce((s, v, k) => s + v * x.m[k], 0))) : null;
      for (let a = 0; a < q; a++) for (let b = a; b < q; b++) {
        let tr = 0; const Wa = W[a], Wb = W[b]; for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) tr += Wa[i][j] * Wb[j][i];
        let v = tr / 2; if (Km) v += Dg[a].m.reduce((s, x, k) => s + x * Km[b][k], 0);
        v *= d.n; I[a][b] += v; if (a !== b) I[b][a] += v;
      }
    });
    return I;
  }
  function invOrNull(M) { try { const R = inverse(M); return R.every((r, i) => isFinite(r[i])) ? R : null; } catch (e) { return null; } }
  // FIML: observed information = Hessian of −ln L = (N/2)·F by differences of the analytic gradient
  function fimlHessian(fg, th, Ntot) {
    const q = th.length, H = zeros(q, q);
    for (let b = 0; b < q; b++) {
      const h = 1e-5 * Math.max(1, Math.abs(th[b])), tp1 = Float64Array.from(th), tm1 = Float64Array.from(th); tp1[b] += h; tm1[b] -= h;
      const g1 = fg(tp1, true).g, g2 = fg(tm1, true).g;
      for (let a = 0; a < q; a++) H[a][b] = Ntot / 2 * (g1[a] - g2[a]) / (2 * h);
    }
    for (let a = 0; a < q; a++) for (let b = a + 1; b < q; b++) H[a][b] = H[b][a] = (H[a][b] + H[b][a]) / 2;
    return H;
  }

  // ------------------------------------------------------------ fit measures (Amos, Appendix C)
  function fitRow(o) { // o: { C, d, q, n, N, G, Cb, db, ps:[p per group], Ns:[N per group], gfi, rmr, means, moments }
    const { C, d, q, n } = o, r = { npar: q, cmin: C, df: d, p: chi2sf(C, d), cmindf: d > 0 ? C / d : NaN, rmr: o.rmr, gfi: o.gfi };
    r.agfi = d > 0 && isFinite(o.gfi) ? 1 - (o.moments / d) * (1 - o.gfi) : NaN;
    r.pgfi = d > 0 && isFinite(o.gfi) ? (d / o.moments) * o.gfi : NaN;
    const Cb = o.Cb, db = o.db;
    r.nfi = 1 - C / Cb; r.rfi = d > 0 ? 1 - (C / d) / (Cb / db) : NaN; r.ifi = (Cb - C) / (Cb - d);
    r.tli = d > 0 ? (Cb / db - C / d) / (Cb / db - 1) : NaN;
    const den = Math.max(Cb - db, C - d, 0); r.cfi = den > 0 ? 1 - Math.max(C - d, 0) / den : 1;
    r.pratio = d / db; r.pnfi = r.pratio * r.nfi; r.pcfi = r.pratio * r.cfi;
    const lo = d > 0 ? lambdaFor(C, d, 0.95) : 0, hi = d > 0 ? lambdaFor(C, d, 0.05) : 0;
    r.ncp = Math.max(C - d, 0); r.ncpLo = d > 0 ? lo : NaN; r.ncpHi = d > 0 ? hi : NaN;
    r.fmin = C / n; r.f0 = r.ncp / n; r.f0Lo = r.ncpLo / n; r.f0Hi = r.ncpHi / n;
    r.rmsea = d > 0 ? Math.sqrt(r.f0 / d) : NaN; r.rmseaLo = d > 0 ? Math.sqrt(lo / (n * d)) : NaN; r.rmseaHi = d > 0 ? Math.sqrt(hi / (n * d)) : NaN;
    r.pclose = d > 0 ? 1 - ncchi2cdf(C, d, 0.0025 * n * d) : NaN;
    r.aic = C + 2 * q;
    const den2 = o.ps.reduce((s, p) => s + p * (p + 3), 0), num2 = o.ps.reduce((s, p, g) => s + (n * o.Ns[g] / o.N) * p * (p + 3) / (o.Ns[g] - p - 2), 0);
    r.bcc = C + 2 * q * num2 / den2;
    r.bic = o.G === 1 ? C + q * Math.log(o.N) : NaN; r.caic = o.G === 1 ? C + q * (Math.log(o.N) + 1) : NaN;
    r.ecvi = r.aic / n; r.ecviLo = (lo + d + 2 * q) / n; r.ecviHi = (hi + d + 2 * q) / n; r.mecvi = r.bcc / n;
    r.hoelter05 = d > 0 && C > 0 ? Math.floor(n * chi2q(0.95, d) / C + 1) : NaN; r.hoelter01 = d > 0 && C > 0 ? Math.floor(n * chi2q(0.99, d) / C + 1) : NaN;
    return r;
  }
  // GFI = 1 − F̂/F̂_b (Jöreskog & Sörbom, 1984; Tanaka & Huba, 1985); for ML both are evaluated as ½tr[(K⁻¹(S − Σ))²] with K = Σ̂
  function gfiParts(est, d, Sig) {
    const p = d.p, S = d.S, R = S.map((r, a) => r.map((v, b) => v - Sig[a][b]));
    const half = M => { let s = 0; for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) s += M[a][b] * M[b][a]; return s / 2; };
    if (est === 'ML') { const Ki = inverse(Sig); return { f: half(mm(Ki, R)), fb: half(mm(Ki, S)) }; }
    if (est === 'GLS') return { f: half(mm(d.Sinv, R)), fb: p / 2 };
    if (est === 'ULS') return { f: half(R), fb: half(S) };
    if (est === 'SLS') { const sc = M => M.map((r, a) => r.map((v, b) => v / Math.sqrt(S[a][a] * S[b][b]))); return { f: half(sc(R)), fb: half(sc(S)) }; }
    if (est === 'ADF') { const qf = M => { const r = d.pairs.map(([a, b]) => M[a][b]); return r.reduce((s, x, k) => s + x * d.Uinv[k].reduce((t, y, l) => t + y * r[l], 0), 0); }; return { f: qf(R), fb: qf(S) }; }
    return { f: NaN, fb: NaN };
  }
  function rmrOf(data, sigs) { let s = 0, c = 0; data.forEach((d, g) => { for (let a = 0; a < d.p; a++) for (let b = 0; b <= a; b++) { const r = d.S[a][b] - sigs[g][a][b]; s += r * r; c++; } }); return Math.sqrt(s / c); }
  // independence model: diagonal Σ (and free means) fitted with the same estimator
  function independenceSpec(spec) {
    const p = spec.p, entries = [];
    for (let i = 0; i < p; i++) entries.push({ mat: 'S', i, j: i, fixed: null, label: null, kind: 'var', key: 'S|' + i + '|' + i, src: 'default' });
    if (spec.means) for (let i = 0; i < p; i++) entries.push({ mat: 'M', i, j: i, fixed: null, label: null, kind: 'mean', key: 'M|' + i, src: 'default' });
    return { obs: spec.obs, lat: [], vars: spec.obs.slice(), p, nv: p, entries, means: spec.means };
  }

  // ------------------------------------------------------------ assessment of normality (Amos "Assessment of normality")
  function normality(X, rows) {
    const p = X.length, N = X[0].length;
    const uni = X.map(c => {
      const m = mean(c); let m2 = 0, m3 = 0, m4 = 0, mn = Infinity, mx = -Infinity;
      for (let t = 0; t < N; t++) { const d = c[t] - m; m2 += d * d; m3 += d * d * d; m4 += d * d * d * d; if (c[t] < mn) mn = c[t]; if (c[t] > mx) mx = c[t]; }
      m2 /= N; m3 /= N; m4 /= N;
      const skew = m3 / Math.pow(m2, 1.5), kurt = m4 / (m2 * m2) - 3;
      return { min: mn, max: mx, skew, skewCR: skew / Math.sqrt(6 / N), kurt, kurtCR: kurt / Math.sqrt(24 / N) };
    });
    const { S, mu } = covOf(X, false); let Si; try { Si = inverse(S); } catch (e) { return { uni, mardia: null, mahal: [] }; }
    const d2 = new Float64Array(N);
    for (let t = 0; t < N; t++) { let s = 0; for (let a = 0; a < p; a++) { const da = X[a][t] - mu[a]; for (let b = 0; b < p; b++) s += da * Si[a][b] * (X[b][t] - mu[b]); } d2[t] = s; }
    let b2 = 0; for (let t = 0; t < N; t++) b2 += d2[t] * d2[t]; b2 /= N;
    const kurt = b2 - p * (p + 2) * (N - 1) / (N + 1), cr = kurt / Math.sqrt(8 * p * (p + 2) / N);
    const order = Array.from({ length: N }, (_, t) => t).sort((a, b) => d2[b] - d2[a]);
    const mahal = order.slice(0, Math.min(100, N)).map((t, k) => {
      const p1 = chi2sf(d2[t], p), p2 = p1 <= 0 ? 0 : p1 >= 1 ? 1 : ibeta(p1, k + 1, N - k); // P(at least k+1 of N tail probabilities ≤ p1) = I_p1(k+1, N−k)
      return { row: rows[t] + 1, d2: d2[t], p1, p2 };
    });
    return { uni, mardia: { b2p: b2, kurt, cr, p, N }, mahal };
  }

  // ------------------------------------------------------------ the analysis
  const EST_SE = { ML: true, GLS: true, ADF: true, FIML: true, ULS: false, SLS: false };
  function prepareData(ds, spec, est, rows, opts) {
    if (est === 'FIML') {
      const d = fimlData(ds, spec.obs, rows), sat = emSaturated(d);
      d.sat = sat; d.Sstart = sat.S; d.mstart = sat.mu; d.S = sat.S; d.xbar = sat.mu;
      return d;
    }
    const cc = completeCols(ds, spec.obs, rows);
    return moments(cc.X, est, cc.rows);
  }
  // all derived quantities of one solution (single group) — used for the estimates and for every bootstrap sample
  function derived(spec, ents, th) {
    const st = implied(spec, ents, th), nv = spec.nv, sd = st.C.map((r, i) => Math.sqrt(Math.max(r[i], 0)));
    const T = st.B.map((r, i) => r.map((v, j) => v - (i === j ? 1 : 0)));
    return { st, sd, T };
  }
  function labelEnv(ents, th) { const env = {}; ents.forEach(e => { if (e.label) env[e.label] = e.idx >= 0 ? th[e.idx] : e.fixed; }); return env; }
  function evalDefs(spec, ents, th) { const env = labelEnv(ents, th); return spec.defs.map(d => { const v = d.parsed.fn(env); env[d.name] = v; return v; }); }

  // quantities that are bootstrapped: parameters, standardised weights, correlations, SMC, effects (unstd/std), estimands
  function quantities(spec, ents, effPairs) {
    const Q = [];
    ents.forEach((e, z) => { Q.push({ cat: 'par', z }); if (e.mat === 'A') Q.push({ cat: 'std', z }); if (e.mat === 'S' && e.i !== e.j) Q.push({ cat: 'corr', z }); });
    spec.endo.forEach(i => Q.push({ cat: 'smc', i }));
    effPairs.forEach(([i, j]) => ['tot', 'dir', 'ind', 'stot', 'sdir', 'sind'].forEach(k => Q.push({ cat: k, i, j })));
    spec.defs.forEach((_, k) => Q.push({ cat: 'def', k }));
    return Q;
  }
  function evalQ(spec, ents, th, Q) {
    const { st, sd, T } = derived(spec, ents, th), defs = spec.defs.length ? evalDefs(spec, ents, th) : [];
    const val = e => (e.idx >= 0 ? th[e.idx] : e.fixed);
    return Float64Array.from(Q, x => {
      switch (x.cat) {
        case 'par': return val(ents[x.z]);
        case 'std': { const e = ents[x.z]; return val(e) * sd[e.j] / sd[e.i]; }
        case 'corr': { const e = ents[x.z]; return val(e) / Math.sqrt(st.Om[e.i][e.i] * st.Om[e.j][e.j]); }
        case 'smc': return 1 - st.Om[x.i][x.i] / st.C[x.i][x.i];
        case 'tot': return T[x.i][x.j];
        case 'dir': return st.A[x.i][x.j];
        case 'ind': return T[x.i][x.j] - st.A[x.i][x.j];
        case 'stot': return T[x.i][x.j] * sd[x.j] / sd[x.i];
        case 'sdir': return st.A[x.i][x.j] * sd[x.j] / sd[x.i];
        case 'sind': return (T[x.i][x.j] - st.A[x.i][x.j]) * sd[x.j] / sd[x.i];
        default: return defs[x.k];
      }
    });
  }
  // bootstrap summary in the Amos style: SE, mean, bias, percentile and bias-corrected (BC) CIs with two-tailed p
  function bootSummary(orig, draws, level) {
    const B = draws.length; if (!B) return null;
    const srt = Array.from(draws).sort((a, b) => a - b), m = mean(srt); let v = 0; srt.forEach(x => { v += (x - m) * (x - m); });
    const se = Math.sqrt(v / (B - 1)), a = (1 - level) / 2;
    const lt = x => { let lo = 0, hi = B; while (lo < hi) { const md = (lo + hi) >> 1; if (srt[md] < x) lo = md + 1; else hi = md; } return lo; }; // # below x
    const le = x => { let lo = 0, hi = B; while (lo < hi) { const md = (lo + hi) >> 1; if (srt[md] <= x) lo = md + 1; else hi = md; } return lo; };
    const clip = pr => Math.min(1 - 0.5 / B, Math.max(0.5 / B, pr));
    const p0 = (lt(0) + le(0)) / (2 * B); // proportion of draws below zero (ties counted half)
    const pPerc = Math.min(1, 2 * Math.min(p0, 1 - p0));
    const z0 = qnorm(clip((lt(orig) + le(orig)) / (2 * B))), za = qnorm(a);
    const w = qnorm(clip(p0)) - 2 * z0, pBC = Math.min(1, 2 * Math.min(pnorm(w), 1 - pnorm(w)));
    return { se, mean: m, bias: m - orig, lo: quantile(srt, a), hi: quantile(srt, 1 - a), p: p0 === 0 || p0 === 1 ? 1 / (B + 1) : pPerc, bcLo: quantile(srt, pnorm(2 * z0 + za)), bcHi: quantile(srt, pnorm(2 * z0 - za)), bcP: p0 === 0 || p0 === 1 ? 1 / (B + 1) : pBC, z0 };
  }

  function amosSem(ds, model, settings, opts, progress) {
    opts = Object.assign({ estimator: 'ML', means: false, syntax: '', boot: 0, level: 0.95, bollenStine: false, seed: 1, miMin: 4 }, opts || {});
    const est = String(opts.estimator).toUpperCase(); if (!ESTIMATORS.includes(est)) throw fail('amos_estimator');
    const spec = buildSpec(ds, opts.ignoreDiagram ? null : model, opts.syntax, { means: opts.means || est === 'FIML' });
    if (est === 'FIML') spec.means = true;
    if (spec.means && est !== 'ML' && est !== 'FIML') throw fail('amos_means_ml');
    const allRows = Array.from({ length: ds.n }, (_, i) => i);
    const d = prepareData(ds, spec, est, allRows, opts), data = [d];
    const L = layout(spec, 1);
    const moments_ = spec.p * (spec.p + 1) / 2 + (spec.means ? spec.p : 0), df = moments_ - L.q;
    if (df < 0) throw fail('cbsem_unidentified');
    const prog = p => progress && progress(opts.boot > 0 || opts.bollenStine ? 0.15 * p : 0.8 * p);
    const sol = optimize(spec, L, data, est, null, prog), th = sol.th, ents = L.ents[0];
    // ---- standard errors
    let cov = null, D = null;
    if (EST_SE[est] && L.q) {
      D = derivs(spec, L, th, 1);
      let I;
      if (est === 'FIML') I = fimlHessian(sol.fg, th, d.N);
      else { const st0 = implied(spec, ents, th); I = information(est, spec, data, D, [est === 'GLS' ? d.Sinv : inverse(st0.Sig)]); }
      cov = invOrNull(I);
    }
    const warnings = []; if (!sol.converged) warnings.push('amos_w_conv'); if (EST_SE[est] && L.q && !cov) warnings.push('amos_w_ident');
    // ---- fit: default, saturated and independence models
    const st = implied(spec, ents, th), n = d.n, N = d.N;
    let C, Cb, Fhat = sol.f;
    const ispec = independenceSpec(spec), Li = layout(ispec, 1), isol = optimize(ispec, Li, data, est, null, null), ist = implied(ispec, Li.ents[0], isol.th);
    if (est === 'FIML') {
      const dev = fimlDeviance(d, st.Sig, st.mu), devB = fimlDeviance(d, ist.Sig, ist.mu);
      C = Math.max(0, dev - d.sat.dev); Cb = devB - d.sat.dev;
      d.dev = dev;
    } else { C = n * Fhat; Cb = n * isol.f; }
    const db = moments_ - Li.q, base = { n, N, G: 1, ps: [spec.p], Ns: [N], moments: moments_, Cb, db };
    const noGFI = spec.means || est === 'FIML';
    const gp = noGFI ? null : gfiParts(est, d, st.Sig), gpb = noGFI ? null : gfiParts(est, d, ist.Sig);
    const fit = {
      def: fitRow(Object.assign({}, base, { C, d: df, q: L.q, rmr: noGFI ? NaN : rmrOf(data, [st.Sig]), gfi: noGFI ? NaN : 1 - gp.f / gp.fb })),
      sat: fitRow(Object.assign({}, base, { C: 0, d: 0, q: moments_, rmr: noGFI ? NaN : 0, gfi: noGFI ? NaN : 1 })),
      ind: fitRow(Object.assign({}, base, { C: Cb, d: db, q: Li.q, rmr: noGFI ? NaN : rmrOf(data, [ist.Sig]), gfi: noGFI ? NaN : 1 - gpb.f / gpb.fb }))
    };
    if (est === 'FIML') { fit.def.dev = d.dev; fit.sat.dev = d.sat.dev; fit.ind.dev = fit.ind.cmin + d.sat.dev; }
    // ---- estimates
    const V = spec.vars, p = spec.p, { sd, T } = derived(spec, ents, th);
    const val = e => (e.idx >= 0 ? th[e.idx] : e.fixed), seOf = e => (e.idx >= 0 && cov ? Math.sqrt(Math.max(cov[e.idx][e.idx], 0)) : NaN);
    const row = (e, z) => { const est_ = val(e), se = seOf(e), cr = est_ / se; return { z, est: est_, se, cr, p: z2p(cr), label: e.label, fixed: e.idx < 0, kind: e.kind, idx: e.idx }; };
    const weights = [], covs = [], variances = [], intercepts = [];
    ents.forEach((e, z) => {
      const r = row(e, z);
      if (e.mat === 'A') weights.push(Object.assign(r, { to: V[e.i], from: V[e.j], std: r.est * sd[e.j] / sd[e.i] }));
      else if (e.mat === 'M') intercepts.push(Object.assign(r, { v: V[e.i] }));
      else if (e.i === e.j) variances.push(Object.assign(r, { v: V[e.i] }));
      else covs.push(Object.assign(r, { a: V[e.i], b: V[e.j], corr: r.est / Math.sqrt(st.Om[e.i][e.i] * st.Om[e.j][e.j]) }));
    });
    const smc = spec.endo.map(i => ({ v: V[i], i, smc: 1 - st.Om[i][i] / st.C[i][i] }));
    const effPairs = []; for (let i = 0; i < V.length; i++) for (let j = 0; j < V.length; j++) if (i !== j && Math.abs(T[i][j]) > 1e-12) effPairs.push([i, j]);
    const effects = effPairs.map(([i, j]) => ({ to: V[i], from: V[j], i, j, tot: T[i][j], dir: st.A[i][j], ind: T[i][j] - st.A[i][j], stot: T[i][j] * sd[j] / sd[i], sdir: st.A[i][j] * sd[j] / sd[i], sind: (T[i][j] - st.A[i][j]) * sd[j] / sd[i], latent: i >= p && j >= p }));
    // ---- user-defined estimands (delta method)
    const defs = spec.defs.map((df_, k) => {
      const v = evalDefs(spec, ents, th)[k]; let se = NaN;
      if (cov) { const gr = Array.from({ length: L.q }, (_, a) => { const h = 1e-6 * Math.max(1, Math.abs(th[a])), t1 = Float64Array.from(th), t2 = Float64Array.from(th); t1[a] += h; t2[a] -= h; return (evalDefs(spec, ents, t1)[k] - evalDefs(spec, ents, t2)[k]) / (2 * h); }); let s = 0; for (let a = 0; a < L.q; a++) for (let b = 0; b < L.q; b++) s += gr[a] * cov[a][b] * gr[b]; se = Math.sqrt(Math.max(s, 0)); }
      return { name: df_.name, expr: df_.expr, est: v, se, cr: v / se, p: z2p(v / se) };
    });
    // ---- matrices
    const Sig = st.Sig, Sigi = invOrNull(Sig), corrOf = M => M.map((r, a) => r.map((v, b) => v / Math.sqrt(M[a][a] * M[b][b])));
    const resid = d.S.map((r, a) => r.map((v, b) => v - Sig[a][b]));
    const stdResid = resid.map((r, a) => r.map((v, b) => v / Math.sqrt((Sig[a][a] * Sig[b][b] + Sig[a][b] * Sig[a][b]) / N)));
    const fsw = Sigi && spec.lat.length ? spec.lat.map((_, z) => { const cl = st.C[p + z].slice(0, p); return Sigi.map((_, b) => cl.reduce((s, v, a) => s + v * Sigi[a][b], 0)); }) : null;
    const matrices = { sampleCov: d.S, sampleCorr: corrOf(d.S), implied: st.C, impliedCorr: corrOf(st.C), resid, stdResid, fsw, sampleMeans: d.xbar, impliedMeans: spec.means ? st.Bm : null, total: T, direct: st.A, indirect: T.map((r, i) => r.map((v, j) => v - st.A[i][j])), sd };
    // ---- modification indices (ML, GLS): score tests for fixed-zero covariances and regression weights
    let mi = null;
    if ((est === 'ML' || est === 'GLS') && D) {
      const K = est === 'GLS' ? d.Sinv : Sigi, Ib = information(est, spec, data, D, [K]).map(r => r.map(v => v / n)), IbInv = invOrNull(Ib);
      const r0 = discrepancy(est, d, st, spec.means, true);
      if (IbInv && r0.G) {
        const have = new Set(ents.map(e => e.key)), B = st.B, Cc = st.C, nv = spec.nv, endoSet = new Set(spec.endo);
        const reach = (a, b) => { const stk = [a], seen = new Set(); while (stk.length) { const u = stk.pop(); if (u === b) return true; if (seen.has(u)) continue; seen.add(u); for (let k = 0; k < nv; k++) if (st.A[k][u] !== 0) stk.push(k); } return false; }; // b reachable from a
        const KD = Dm => mm(K, Dm), W0 = D[0].map(x => KD(x.S));
        const cands = [];
        for (let i = 0; i < nv; i++) for (let j = i + 1; j < nv; j++) if (!have.has('S|' + i + '|' + j)) cands.push({ type: 'cov', i, j });
        for (let i = 0; i < nv; i++) if (endoSet.has(i)) for (let j = 0; j < nv; j++) if (j !== i && !have.has('A|' + i + '|' + j) && !reach(i, j)) cands.push({ type: 'reg', i, j });
        const out = [];
        cands.forEach(c => {
          const Dm = zeros(p, p), dmu = new Array(p).fill(0);
          for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) Dm[a][b] = c.type === 'cov' ? B[a][c.i] * B[b][c.j] + B[a][c.j] * B[b][c.i] : B[a][c.i] * Cc[c.j][b] + Cc[a][c.j] * B[b][c.i];
          if (c.type === 'reg' && spec.means) for (let a = 0; a < p; a++) dmu[a] = B[a][c.i] * st.Bm[c.j];
          let g = 0; for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) g += r0.G[a][b] * Dm[b][a]; if (r0.gm) g += r0.gm.reduce((s, x, a) => s + x * dmu[a], 0);
          const Wc = KD(Dm), Km = spec.means ? K.map(r => r.reduce((s, v, k) => s + v * dmu[k], 0)) : null;
          let icc = 0; for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) icc += Wc[a][b] * Wc[b][a]; icc /= 2; if (Km) icc += dmu.reduce((s, x, k) => s + x * Km[k], 0);
          const v = W0.map((Wa, z) => { let tr = 0; for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) tr += Wc[a][b] * Wa[b][a]; let s = tr / 2; if (Km) s += D[0][z].m.reduce((t, x, k) => t + x * Km[k], 0); return s; });
          let quad = 0; for (let a = 0; a < L.q; a++) { let s2 = 0; for (let b = 0; b < L.q; b++) s2 += IbInv[a][b] * v[b]; quad += v[a] * s2; }
          const schur = icc - quad; if (!(schur > 1e-9 * Math.max(1, icc))) return;
          const MI = n * g * g / (4 * schur), epc = -g / (2 * schur);
          out.push({ type: c.type, a: V[c.i], b: V[c.j], mi: MI, p: chi2sf(MI, 1), parChange: epc, stdChange: c.type === 'cov' ? epc / Math.sqrt(Math.max(st.Om[c.i][c.i], 1e-300) * Math.max(st.Om[c.j][c.j], 1e-300)) : epc * sd[c.j] / sd[c.i] });
        });
        out.sort((a, b) => b.mi - a.mi);
        mi = { covs: out.filter(x => x.type === 'cov'), weights: out.filter(x => x.type === 'reg'), min: +opts.miMin || 4 };
      }
    }
    // ---- normality (complete cases of the observed variables)
    let norm = null;
    if (!opts.fromMatrix) { const cc = completeCols(ds, spec.obs, allRows); if (cc.rows.length > spec.p + 1) { norm = normality(cc.X, cc.rows); norm.N = cc.rows.length; } }
    // ---- bootstrap (ML-based on resampled cases) and Bollen–Stine
    let boot = null, bs = null;
    const B = opts.fromMatrix ? 0 : Math.max(0, Math.floor(+opts.boot || 0));
    const Q = quantities(spec, ents, effPairs), orig = evalQ(spec, ents, th, Q);
    const rand = rng(+opts.seed || 1);
    const refit = dd => { const r = bfgs(makeObjective(spec, L, [dd], est), th, 1000, sol.Hi); return r && r.converged ? r : (r && r.gmax < 1e-4 ? r : null); };
    const resample = (Xs, rowsIdx) => { const Nn = rowsIdx.length; const pick = Int32Array.from({ length: Nn }, () => Math.floor(rand() * Nn)); return pick; };
    if (B > 0) {
      const draws = Q.map(() => []); let failed = 0;
      for (let b = 0; b < B; b++) {
        let dd;
        try {
          if (est === 'FIML') { const pick = resample(null, d.rows); const rws = Array.from(pick, k => d.rows[k]); const ds2 = subsetDS(ds, spec.obs, rws); dd = fimlData(ds2, spec.obs, Array.from({ length: rws.length }, (_, i) => i)); dd.Sstart = d.S; dd.mstart = d.xbar; }
          else { const pick = resample(null, d.rows); dd = moments(d.X.map(c => Float64Array.from(pick, k => c[k])), est, d.rows); }
          const r = refit(dd); if (!r) throw new Error('fail');
          const v = evalQ(spec, ents, r.th, Q); if (!v.every(isFinite)) throw new Error('fail');
          v.forEach((x, k) => draws[k].push(x));
        } catch (e) { failed++; }
        if (progress && b % 5 === 0) progress(0.15 + (opts.bollenStine ? 0.42 : 0.85) * b / B);
      }
      const summ = Q.map((x, k) => bootSummary(orig[k], draws[k], +opts.level || 0.95));
      boot = { B, failed, level: +opts.level || 0.95, Q, summ };
    }
    if (opts.bollenStine && B > 0 && est !== 'FIML') {
      // Bollen & Stine (1992): Z = (X − x̄) S^(−1/2) Σ̂^(1/2) + μ̂ reproduces Σ̂ exactly, so H0 holds in the bootstrap population
      const T_ = mm(powSym(d.S, -0.5), powSym(Sig, 0.5)), N0 = d.N, mu0 = spec.means ? st.mu : d.xbar;
      const Y = Array.from({ length: p }, (_, b) => Float64Array.from({ length: N0 }, (_, t) => { let s = 0; for (let a = 0; a < p; a++) s += (d.X[a][t] - d.xbar[a]) * T_[a][b]; return s + mu0[b]; }));
      let better = 0, worse = 0, failed = 0; const cs = [];
      for (let b = 0; b < B; b++) {
        try { const pick = resample(null, d.rows), dd = moments(Y.map(c => Float64Array.from(pick, k => c[k])), est, d.rows), r = refit(dd); if (!r) throw new Error('fail'); const c = dd.n * r.f; cs.push(c); if (c < C) better++; else worse++; } catch (e) { failed++; }
        if (progress && b % 5 === 0) progress(0.57 + 0.43 * b / B);
      }
      bs = { B, better, worse, failed, p: (worse + failed + 1) / (B + 1), mean: mean(cs), cmins: cs.slice().sort((a, b) => a - b) };
    }
    if (progress) progress(1);
    const counts = paramSummary(ents);
    return {
      kind: 'amos', estimator: est, means: spec.means, N, n, rowsUsed: d.rows.length, totalRows: ds.n, missing: est === 'FIML' ? d.missing : false, patterns: est === 'FIML' ? d.patterns.length : 1,
      obs: spec.obs, lat: spec.lat, vars: V, p, endo: spec.endo, exo: spec.exo, syntaxUsed: spec.syntaxUsed,
      notes: { moments: moments_, q: L.q, df, chi2: C, p: chi2sf(C, df), iterations: sol.it, converged: sol.converged, fmin: Fhat, se: EST_SE[est] },
      counts, weights, covs, variances, intercepts, smc, effects, defs, matrices, fit, mi, normality: norm, boot, bollenStine: bs, warnings,
      heywood: variances.some(v => v.est < 0) || smc.some(s => s.smc > 1)
    };
  }
  function subsetDS(ds, names, rows) { const idx = names.map(n => ds.names.indexOf(n)); return { names: names.slice(), kinds: names.map(() => 'num'), labels: names.map(() => null), cols: idx.map(j => Float64Array.from(rows, r => ds.cols[j][r])), n: rows.length }; }
  function paramSummary(ents) {
    const cat = e => (e.mat === 'A' ? 'weights' : e.mat === 'M' ? (e.kind === 'lmean' ? 'means' : 'intercepts') : e.i === e.j ? 'variances' : 'covariances');
    const out = {}; ['weights', 'covariances', 'variances', 'means', 'intercepts'].forEach(k => { out[k] = { fixed: 0, labeled: 0, unlabeled: 0 }; });
    const seenL = new Set();
    ents.forEach(e => { const c = out[cat(e)]; if (e.idx < 0) c.fixed++; else if (e.label) { if (!seenL.has(e.label)) { c.labeled++; seenL.add(e.label); } } else c.unlabeled++; });
    return out;
  }

  // ------------------------------------------------------------ multiple groups: Amos' nested sequence of constrained models
  const MG_STEPS = [['mw', ['load']], ['mi', ['int', 'mean']], ['sw', ['path']], ['scov', ['var', 'xcov']], ['sr', ['dvar', 'dcov']], ['mr', ['evar', 'ecov']]];
  function amosMG(ds, model, settings, opts, progress) {
    opts = Object.assign({ estimator: 'ML', means: false, syntax: '' }, opts || {});
    const est = String(opts.estimator).toUpperCase(); if (!ESTIMATORS.includes(est)) throw fail('amos_estimator');
    const gcol = ds.names.indexOf(opts.groupVar); if (gcol < 0) throw fail('no_group');
    const spec = buildSpec(ds, model, opts.syntax, { means: opts.means || est === 'FIML' });
    if (est === 'FIML') spec.means = true;
    if (spec.means && est !== 'ML' && est !== 'FIML') throw fail('amos_means_ml');
    if (spec.obs.includes(opts.groupVar)) throw fail('amos_group_in_model');
    const lab = ds.labels[gcol], vals = Array.from(new Set(Array.from(ds.cols[gcol]).filter(v => !isNaN(v)))).sort((a, b) => a - b);
    if (vals.length < 2) throw fail('one_group');
    const gname = v => (lab ? lab[v - 1] : String(v));
    const data = vals.map(v => { const rows = []; for (let i = 0; i < ds.n; i++) if (ds.cols[gcol][i] === v) rows.push(i); return prepareData(ds, spec, est, rows, opts); });
    if (data.some(d => d.N <= spec.p + 2)) throw fail('mg_small');
    const G = data.length, p = spec.p, Ntot = data.reduce((s, d) => s + d.N, 0), n = Ntot - G;
    const momentsG = p * (p + 1) / 2 + (spec.means ? p : 0), moments_ = G * momentsG;
    // models: unconstrained, then cumulative constraints (steps without a free parameter of that kind are skipped)
    const kindsPresent = new Set(spec.entries.filter(e => e.fixed === null && !e.label).map(e => e.kind));
    const models = [{ id: 'unc', shared: new Set() }]; let cur = new Set();
    MG_STEPS.forEach(([id, kinds]) => {
      if (id === 'mi' && !spec.means) return;
      if (!kinds.some(k => kindsPresent.has(k))) return;
      cur = new Set([...cur, ...kinds]); models.push({ id, shared: new Set(cur) });
    });
    const fits = []; let prev = null;
    const ispec = independenceSpec(spec), Li = layout(ispec, G), isol = optimize(ispec, Li, data, est, null, null);
    const dbIdx = moments_ - Li.q;
    let Cb;
    if (est === 'FIML') { Cb = data.reduce((s, d, g) => { const it = implied(ispec, Li.ents[g], isol.th); return s + fimlDeviance(d, it.Sig, it.mu) - d.sat.dev; }, 0); }
    else Cb = n * isol.f;
    const noGFI = spec.means || est === 'FIML';
    const base = { n, N: Ntot, G, ps: data.map(() => p), Ns: data.map(d => d.N), moments: moments_, Cb, db: dbIdx };
    models.forEach((mo, z) => {
      const L = layout(spec, G, mo.shared), df = moments_ - L.q;
      let th0 = null;
      if (prev) { th0 = startValues(spec, L, data); prev.L.keys.forEach((k, a) => { const b = L.keys.indexOf(k); if (b >= 0) th0[b] = prev.th[a]; }); // carry over shared values
        L.keys.forEach((k, b) => { if (!prev.L.keys.includes(k)) { const k0 = k + '#0'; const a = prev.L.keys.indexOf(k0); if (a >= 0) th0[b] = prev.th[a]; } }); }
      const sol = optimize(spec, L, data, est, th0, null);
      let C;
      if (est === 'FIML') C = Math.max(0, data.reduce((s, d, g) => { const it = implied(spec, L.ents[g], sol.th); return s + fimlDeviance(d, it.Sig, it.mu) - d.sat.dev; }, 0));
      else C = n * sol.f;
      const sigs = data.map((d, g) => implied(spec, L.ents[g], sol.th).Sig);
      let gfi = NaN;
      if (!noGFI) { let fsum = 0, fbsum = 0; data.forEach((d, g) => { const gp = gfiParts(est, d, sigs[g]), w = d.n / n; fsum += w * gp.f; fbsum += w * gp.fb; }); gfi = 1 - fsum / fbsum; }
      // standard errors
      let cov = null;
      if (EST_SE[est] && L.q) {
        let I;
        if (est === 'FIML') I = fimlHessian(sol.fg, sol.th, Ntot);
        else { const D = derivs(spec, L, sol.th, G); I = information(est, spec, data, D, data.map((d, g) => (est === 'GLS' ? d.Sinv : inverse(sigs[g])))); }
        cov = invOrNull(I);
      }
      const groups = data.map((d, g) => {
        const ents = L.ents[g], { st, sd } = derived(spec, ents, sol.th), V = spec.vars;
        const rows = ents.map(e => {
          const v = e.idx >= 0 ? sol.th[e.idx] : e.fixed, se = e.idx >= 0 && cov ? Math.sqrt(Math.max(cov[e.idx][e.idx], 0)) : NaN;
          const r = { mat: e.mat, kind: e.kind, est: v, se, cr: v / se, p: z2p(v / se), fixed: e.idx < 0, label: e.label, shared: e.idx >= 0 && !L.keys[e.idx].endsWith('#' + g) };
          if (e.mat === 'A') Object.assign(r, { to: V[e.i], from: V[e.j], std: v * sd[e.j] / sd[e.i] });
          else if (e.mat === 'M') r.v = V[e.i];
          else if (e.i === e.j) r.v = V[e.i]; else Object.assign(r, { a: V[e.i], b: V[e.j], corr: v / Math.sqrt(st.Om[e.i][e.i] * st.Om[e.j][e.j]) });
          return r;
        });
        return { group: gname(vals[g]), N: d.N, rows, smc: spec.endo.map(i => ({ v: V[i], smc: 1 - st.Om[i][i] / st.C[i][i] })) };
      });
      const fr = fitRow(Object.assign({}, base, { C, d: df, q: L.q, rmr: noGFI ? NaN : rmrOf(data, sigs), gfi }));
      fits.push({ id: mo.id, fit: fr, groups, converged: sol.converged, q: L.q, df });
      prev = { L, th: sol.th };
      if (progress) progress((z + 1) / models.length);
    });
    const sat = fitRow(Object.assign({}, base, { C: 0, d: 0, q: moments_, rmr: noGFI ? NaN : 0, gfi: noGFI ? NaN : 1 }));
    const ind = fitRow(Object.assign({}, base, { C: Cb, d: dbIdx, q: Li.q, rmr: noGFI ? NaN : rmrOf(data, data.map((_, g) => implied(ispec, Li.ents[g], isol.th).Sig)), gfi: (() => { if (noGFI) return NaN; let fs = 0, fb = 0; data.forEach((d, g) => { const gp = gfiParts(est, d, implied(ispec, Li.ents[g], isol.th).Sig), w = d.n / n; fs += w * gp.f; fb += w * gp.fb; }); return 1 - fs / fb; })() }));
    // nested model comparisons: assuming model j is correct, the changes when moving to the more constrained model k
    const nested = [];
    fits.forEach((fj, j) => fits.forEach((fk, k) => {
      if (k <= j) return; const a = fj.fit, b = fk.fit, ddf = b.df - a.df, dc = b.cmin - a.cmin;
      nested.push({ base: fj.id, model: fk.id, ddf, dcmin: dc, p: chi2sf(dc, ddf), dnfi: a.nfi - b.nfi, difi: a.ifi - b.ifi, drfi: a.rfi - b.rfi, dtli: a.tli - b.tli });
    }));
    return { kind: 'amosmg', estimator: est, means: spec.means, groupVar: opts.groupVar, groups: vals.map(gname), Ns: data.map(d => d.N), N: Ntot, models: fits, sat, ind, nested, vars: spec.vars, p };
  }

  // ------------------------------------------------------------ latent growth curve template
  function lgmSyntax(waves, opts) {
    const k = waves.length, quad = !!opts.quadratic;
    if (k < (quad ? 4 : 3)) throw fail('amos_lgm_waves');
    let times = String(opts.times || '').split(/[,;\s]+/).filter(Boolean).map(Number);
    if (!times.length) times = waves.map((_, i) => i);
    if (times.length !== k || times.some(v => !isFinite(v))) throw fail('amos_lgm_times');
    const f = v => String(Math.round(v * 1e6) / 1e6);
    const lines = ['ICEPT =~ ' + waves.map(w => '1*' + w).join(' + '), 'SLOPE =~ ' + waves.map((w, i) => f(times[i]) + '*' + w).join(' + ')];
    if (quad) lines.push('QUAD =~ ' + waves.map((w, i) => f(times[i] * times[i]) + '*' + w).join(' + '));
    waves.forEach(w => lines.push(w + ' ~ 0*1'));
    lines.push('ICEPT ~ 1', 'SLOPE ~ 1'); if (quad) lines.push('QUAD ~ 1');
    return lines.join('\n') + (opts.extra ? '\n' + opts.extra : '');
  }
  function amosLGM(ds, model, settings, opts, progress) {
    opts = Object.assign({ estimator: 'ML' }, opts || {});
    const waves = opts.waves || []; if (waves.some(w => ds.names.indexOf(w) < 0)) throw fail('amos_lgm_waves');
    const est = String(opts.estimator).toUpperCase() === 'FIML' ? 'FIML' : 'ML';
    const syntax = lgmSyntax(waves, opts);
    const r = amosSem(ds, null, settings, Object.assign({}, opts, { estimator: est, means: true, syntax, ignoreDiagram: true }), progress);
    r.lgm = { waves, syntax, quadratic: !!opts.quadratic };
    return r;
  }

  E.tasks.amos_sem = amosSem;
  E.tasks.amos_mg = amosMG;
  E.tasks.amos_lgm = amosLGM;
  E.amos = { parseSyntax, parseExpr, buildSpec, layout, implied, discrepancy, makeObjective, optimize, normality, fitRow, ncchi2cdf, lambdaFor, chi2q, emSaturated, fimlData, fimlDeviance, bootSummary, lgmSyntax, powSym, eigSym, ESTIMATORS };
  if (typeof module !== 'undefined' && module.exports) module.exports = E;
})(typeof self !== 'undefined' ? self : this);
