/*
 * BabPls engine module: classic statistics II: correlation, regression, frequencies, reliability, factor analysis,
 * Bayesian tests and meta-analysis (the JASP Regression, Frequencies, Reliability, Factor, Bayesian and Meta-Analysis
 * modules). UMD: extends window.YPEngine (browser/worker) or the Node export of advanced3.js. Each analysis registers
 * E.tasks[kind] = (ds, model, settings, opts, progress) => result (result.kind selects the renderer in js/ui-stats2.js).
 * Every statistic is validated against SciPy / statsmodels / pingouin / factor_analyzer in tests/stats2.test.js.
 */
(function (root) {
  'use strict';
  const E = (typeof module !== 'undefined' && module.exports) ? require('./advanced3.js') : root.YPEngine;
  E.tasks = E.tasks || {};
  const { inverse, solve, zeros, rng } = E;

  // log Γ by the Lanczos approximation (g = 607/128, 15 terms; relative error ≈ 1e-15) and the regularised incomplete
  // beta function by Lentz's continued fraction. (E.lgamma in engine.js is accurate to about 1e-8 only.)
  const LG = [0.99999999999999709182, 57.156235665862923517, -59.597960355475491248, 14.136097974741747174, -0.49191381609762019978,
    0.33994649984811888699e-4, 0.46523628927048575665e-4, -0.98374475304879564677e-4, 0.15808870322491248884e-3, -0.21026444172410488319e-3,
    0.21743961811521264320e-3, -0.16431810653676389022e-3, 0.84418223983852743293e-4, -0.26190838401581408670e-4, 0.36899182659531622704e-5];
  function lgamma(x) {
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1; let a = LG[0]; const t = x + 607 / 128 + 0.5;
    for (let i = 1; i < 15; i++) a += LG[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  function betacf(a, b, x) {
    const TINY = 1e-300; let c = 1, d = 1 - (a + b) * x / (a + 1); if (Math.abs(d) < TINY) d = TINY; d = 1 / d; let h = d;
    for (let m = 1; m <= 100000; m++) {
      const m2 = 2 * m; let aa = m * (b - m) * x / ((a - 1 + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY; c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY; d = 1 / d; h *= d * c;
      aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + 1 + m2));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY; c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY; d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-16) break;
    }
    return h;
  }
  function ibeta(x, a, b) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const lbt = lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log1p(-x);
    return x < (a + 1) / (a + b + 2) ? Math.exp(lbt) * betacf(a, b, x) / a : 1 - Math.exp(lbt) * betacf(b, a, 1 - x) / b;
  }

  // ================================================================ distributions (full double precision)
  function gser(a, x) { let sum = 1 / a, del = sum, ap = a; for (let n = 0; n < 100000; n++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-17) break; } return sum * Math.exp(-x + a * Math.log(x) - lgamma(a)); }
  function gcf(a, x) {
    let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
    for (let i = 1; i < 100000; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-16) break; }
    return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
  }
  const gammaP = (a, x) => (x <= 0 ? 0 : x < a + 1 ? gser(a, x) : 1 - gcf(a, x));
  const gammaQ = (a, x) => (x <= 0 ? 1 : x < a + 1 ? 1 - gser(a, x) : gcf(a, x));
  const pnorm = z => (isNaN(z) ? NaN : z < 0 ? 0.5 * gammaQ(0.5, z * z / 2) : 1 - 0.5 * gammaQ(0.5, z * z / 2));
  const pnormU = z => pnorm(-z);
  function qnorm(p) {
    if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
    let x = E.qnorm(p);
    if (!isFinite(x)) x = p < 0.5 ? -38 : 38;
    for (let i = 0; i < 3; i++) { const e = pnorm(x) - p, u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2); x -= u / (1 + x * u / 2); }
    return x;
  }
  const dnormLog = z => -0.5 * z * z - 0.5 * Math.log(2 * Math.PI);
  function pt(t, df) { if (isNaN(t)) return NaN; if (!isFinite(t)) return t > 0 ? 1 : 0; const a = 0.5 * ibeta(df / (df + t * t), df / 2, 0.5); return t > 0 ? 1 - a : a; }
  const ptU = (t, df) => pt(-t, df);
  const pchisqU = (x, k) => gammaQ(k / 2, x / 2);
  const pchisq = (x, k) => gammaP(k / 2, x / 2);
  const pfU = (F, d1, d2) => (!(F > 0) ? 1 : ibeta(d2 / (d2 + d1 * F), d2 / 2, d1 / 2));
  const lbeta = (a, b) => lgamma(a) + lgamma(b) - lgamma(a + b);
  // monotone inversion by bisection (inc: f increasing); brackets are widened until they contain the root
  function invert(fn, target, lo, hi, inc, positive) {
    const below = v => (inc ? fn(v) < target : fn(v) > target);
    if (positive) { if (!(hi > 0)) hi = 1; while (below(hi) && hi < 1e12) hi *= 2; lo = 0; }
    else { while (below(hi) && hi < 1e12) hi = hi * 2 + 1; while (!below(lo) && lo > -1e12) lo = lo * 2 - 1; }
    for (let i = 0; i < 300; i++) { const m = (lo + hi) / 2; if (m === lo || m === hi) break; if (below(m)) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  const qt = (p, df) => (p === 0.5 ? 0 : invert(t => pt(t, df), p, -10, 10, true));
  const qchisq = (p, k) => invert(x => pchisq(x, k), p, 0, k + 10, true, true);
  const qfU = (a, d1, d2) => invert(F => pfU(F, d1, d2), a, 0, 10, false, true); // upper-tail quantile (F.isf)
  const qbeta = (p, a, b) => { let lo = 0, hi = 1; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (ibeta(m, a, b) < p) lo = m; else hi = m; } return (lo + hi) / 2; };
  const lfact = n => lgamma(n + 1);
  const logsumexp = arr => { const m = Math.max(...arr); if (!isFinite(m)) return m; let s = 0; for (const v of arr) s += Math.exp(v - m); return m + Math.log(s); };
  // p-value of a statistic with a symmetric reference distribution (cdf), alternative 'two' | 'greater' | 'less'
  const pAlt = (stat, cdf, alt) => (alt === 'greater' ? 1 - cdf(stat) : alt === 'less' ? cdf(stat) : Math.min(1, 2 * cdf(-Math.abs(stat))));

  // ================================================================ linear algebra
  function eigSym(S) { // Jacobi with eigenvectors; values descending, vectors as columns
    const n = S.length, A = S.map(r => Array.from(r)), V = zeros(n, n);
    for (let i = 0; i < n; i++) V[i][i] = 1;
    let scale = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) scale += A[i][j] * A[i][j];
    for (let sweep = 0; sweep < 200; sweep++) {
      let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
      if (off <= 1e-30 * scale || off === 0) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;
        const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
        for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
      }
    }
    const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => A[b][b] - A[a][a]);
    return { values: idx.map(i => A[i][i]), vectors: V.map(r => idx.map(i => r[i])) };
  }
  const mm = (A, B) => A.map(r => B[0].map((_, j) => { let s = 0; for (let k = 0; k < r.length; k++) s += r[k] * B[k][j]; return s; }));
  const tr = A => A[0].map((_, j) => A.map(r => r[j]));
  const diagOf = A => A.map((r, i) => r[i]);
  const det = A => { const n = A.length, M = A.map(r => r.slice()); let d = 1; for (let i = 0; i < n; i++) { let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r; if (M[p][i] === 0) return 0; if (p !== i) { [M[p], M[i]] = [M[i], M[p]]; d = -d; } d *= M[i][i]; for (let r = i + 1; r < n; r++) { const f = M[r][i] / M[i][i]; for (let c = i; c < n; c++) M[r][c] -= f * M[i][c]; } } return d; };
  function covMatrix(cols) {
    const k = cols.length, n = cols[0].length, m = cols.map(c => { let s = 0; for (let i = 0; i < n; i++) s += c[i]; return s / n; }), C = zeros(k, k);
    for (let a = 0; a < k; a++) for (let b = a; b < k; b++) { let s = 0; for (let i = 0; i < n; i++) s += (cols[a][i] - m[a]) * (cols[b][i] - m[b]); C[a][b] = C[b][a] = s / (n - 1); }
    return C;
  }
  const cov2cor = C => C.map((r, i) => r.map((v, j) => v / Math.sqrt(C[i][i] * C[j][j])));

  // ================================================================ data helpers
  function colOf(ds, name) { const j = ds.names.indexOf(name); if (j < 0) throw new Error('st2_missing_var'); return ds.cols[j]; }
  function complete(ds, names) {
    const cs = names.map(n => colOf(ds, n)), N = ds.cols.length ? ds.cols[0].length : 0, rows = [];
    for (let i = 0; i < N; i++) if (cs.every(c => !isNaN(c[i]))) rows.push(i);
    return { rows, X: cs.map(c => Float64Array.from(rows, i => c[i])) };
  }
  const labelOf = (ds, name) => { const j = ds.names.indexOf(name); return v => (ds.labels[j] ? ds.labels[j][v - 1] : String(v)); };
  const meanOf = v => { let s = 0; for (let i = 0; i < v.length; i++) s += v[i]; return s / v.length; };
  const sdOf = v => { const m = meanOf(v); let s = 0; for (let i = 0; i < v.length; i++) s += (v[i] - m) ** 2; return Math.sqrt(s / (v.length - 1)); };
  function ranks(v) {
    const n = v.length, o = Array.from({ length: n }, (_, i) => i).sort((a, b) => v[a] - v[b]), r = new Float64Array(n);
    let i = 0; while (i < n) { let j = i; while (j + 1 < n && v[o[j + 1]] === v[o[i]]) j++; const rk = (i + j) / 2 + 1; for (let q = i; q <= j; q++) r[o[q]] = rk; i = j + 1; }
    return r;
  }
  const tieCounts = v => { const m = new Map(); for (const x of v) m.set(x, (m.get(x) || 0) + 1); return Array.from(m.values()); };

  // ================================================================ correlation
  function pearsonR(x, y) {
    const n = x.length, mx = meanOf(x), my = meanOf(y); let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
    return { r: sxy / Math.sqrt(sxx * syy), cov: sxy / (n - 1) };
  }
  // r with t test (df = n − 2 − k for k partialled covariates) and a Fisher-z confidence interval
  function rTest(r, n, k, alt, level) {
    const df = n - 2 - k, t = r * Math.sqrt(df / (1 - r * r)), p = pAlt(t, v => pt(v, df), alt);
    const z = Math.atanh(r), se = 1 / Math.sqrt(n - 3 - k);
    let lo, hi;
    if (alt === 'greater') { lo = Math.tanh(z - qnorm(level) * se); hi = 1; }
    else if (alt === 'less') { lo = -1; hi = Math.tanh(z + qnorm(level) * se); }
    else { const q = qnorm(1 - (1 - level) / 2); lo = Math.tanh(z - q * se); hi = Math.tanh(z + q * se); }
    return { r, t, df, p, lo, hi, z, seZ: se };
  }
  function kendallExactP(n, con, alt) { // Kendall (1970) exact null distribution, as in scipy.stats.kendalltau
    const tot = n * (n - 1) / 2, inRight = con >= tot - con, c = Math.min(con, tot - con);
    let prob, mass;
    if (n === 1) { prob = 1; mass = 1; } else if (n === 2) { prob = 1; mass = 0.5; }
    else if (4 * c === n * (n - 1) && alt === 'two') prob = 1;
    else {
      let f = new Float64Array(c + 1); f[0] = 0.5; if (c >= 1) f[1] = 0.5;
      for (let j = 3; j <= n; j++) {
        const g = new Float64Array(c + 1); let s = 0; for (let i = 0; i <= c; i++) { s += f[i]; g[i] = s; }
        if (j <= c) for (let i = c; i >= j; i--) g[i] -= g[i - j];
        for (let i = 0; i <= c; i++) g[i] /= j; f = g;
      }
      let cdf = 0; for (let i = 0; i <= c; i++) cdf += f[i];
      prob = 2 * cdf; mass = f[c];
    }
    if (alt !== 'two') prob = (inRight === (alt === 'greater')) ? prob / 2 : 1 - prob / 2 + mass;
    return Math.min(1, Math.max(0, prob));
  }
  // Kendall τ-b from concordant/discordant counts; ties = tie group sizes of x and y
  function kendallFrom(n, C, D, tx, ty, alt, allowExact) {
    const tot = n * (n - 1) / 2, s = a => a.reduce((q, t) => q + t * (t - 1) / 2, 0);
    const xt = s(tx), yt = s(ty), tau = (C - D) / Math.sqrt((tot - xt) * (tot - yt));
    if (allowExact && xt === 0 && yt === 0 && (n <= 33 || Math.min(D, tot - D) <= 1)) return { tau, p: kendallExactP(n, C, alt), exact: true, z: NaN };
    const x0 = tx.reduce((q, t) => q + t * (t - 1) * (t - 2), 0), y0 = ty.reduce((q, t) => q + t * (t - 1) * (t - 2), 0);
    const x1 = tx.reduce((q, t) => q + t * (t - 1) * (2 * t + 5), 0), y1 = ty.reduce((q, t) => q + t * (t - 1) * (2 * t + 5), 0);
    const m = n * (n - 1), v = (m * (2 * n + 5) - x1 - y1) / 18 + (2 * xt * yt) / m + x0 * y0 / (9 * m * (n - 2)), z = (C - D) / Math.sqrt(v);
    return { tau, z, p: pAlt(z, pnorm, alt), exact: false };
  }
  function kendall(x, y, alt) {
    const n = x.length; let C = 0, D = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const s = (x[i] - x[j]) * (y[i] - y[j]); if (s > 0) C++; else if (s < 0) D++; }
    return kendallFrom(n, C, D, tieCounts(x).filter(t => t > 1), tieCounts(y).filter(t => t > 1), alt, true);
  }
  function residualize(v, Z) { // residuals of v on an intercept and the columns of Z
    if (!Z.length) { const m = meanOf(v); return Float64Array.from(v, x => x - m); }
    const f = ols(v, Z); return f.resid;
  }
  function correlation(ds, opts) {
    const vars = opts.vars || [], cov = opts.covariates || [], alt = opts.alt || 'two', level = +opts.ci || 0.95;
    const methods = (opts.methods && opts.methods.length) ? opts.methods : ['pearson'];
    if (vars.length < 2) throw new Error('st2_need_two');
    const listwise = opts.missing === 'listwise' || cov.length > 0, all = complete(ds, vars.concat(cov));
    const pairs = [];
    for (let a = 0; a < vars.length; a++) for (let b = a + 1; b < vars.length; b++) {
      let x, y, Z;
      if (listwise) { x = all.X[a]; y = all.X[b]; Z = all.X.slice(vars.length); }
      else { const c = complete(ds, [vars[a], vars[b]]); x = c.X[0]; y = c.X[1]; Z = []; }
      const n = x.length, k = Z.length, row = { x: vars[a], y: vars[b], n, a, b };
      if (methods.includes('pearson')) { const xr = residualize(x, Z), yr = residualize(y, Z), pr = pearsonR(xr, yr); row.pearson = Object.assign(rTest(pr.r, n, k, alt, level), { cov: k ? NaN : pr.cov }); }
      if (methods.includes('spearman')) {
        const rx = ranks(x), ry = ranks(y), Zr = Z.map(ranks), r = pearsonR(residualize(rx, Zr), residualize(ry, Zr)).r, tt = rTest(r, n, k, alt, level);
        row.spearman = { rho: r, t: tt.t, df: tt.df, p: tt.p };
      }
      if (methods.includes('kendall') && !k) row.kendall = kendall(x, y, alt);
      if (pairs.length < 6) { const st_ = Math.max(1, Math.ceil(n / 800)); row.pts = []; for (let i = 0; i < n; i += st_) row.pts.push([x[i], y[i]]); }
      pairs.push(row);
    }
    const mat = key => vars.map((_, i) => vars.map((__, j) => { if (i === j) return 1; const p = pairs.find(q => (q.a === i && q.b === j) || (q.a === j && q.b === i)); return p && p[key] ? (key === 'spearman' ? p[key].rho : key === 'kendall' ? p[key].tau : p[key].r) : NaN; }));
    const pmat = key => vars.map((_, i) => vars.map((__, j) => { if (i === j) return NaN; const p = pairs.find(q => (q.a === i && q.b === j) || (q.a === j && q.b === i)); return p && p[key] ? p[key].p : NaN; }));
    return {
      kind: 'st2_corr', vars, covariates: cov, methods: cov.length ? methods.filter(m => m !== 'kendall') : methods, kendallDropped: cov.length > 0 && methods.includes('kendall'),
      alt, ci: level, listwise, nListwise: all.rows.length, pairs,
      matrices: Object.fromEntries(methods.map(m => [m, { r: mat(m), p: pmat(m) }]))
    };
  }

  // ================================================================ linear regression
  // OLS with intercept; X = array of predictor columns (may be empty)
  function ols(y, X) {
    const n = y.length, k = X.length, P = k + 1, XtX = zeros(P, P), Xty = new Array(P).fill(0);
    const xv = (q, t) => (q === 0 ? 1 : X[q - 1][t]);
    for (let a = 0; a < P; a++) { for (let t = 0; t < n; t++) Xty[a] += xv(a, t) * y[t]; for (let b = a; b < P; b++) { let s = 0; for (let t = 0; t < n; t++) s += xv(a, t) * xv(b, t); XtX[a][b] = XtX[b][a] = s; } }
    const inv = inverse(XtX), coef = inv.map(r => r.reduce((s, v, j) => s + v * Xty[j], 0));
    const fitted = new Float64Array(n), resid = new Float64Array(n), my = meanOf(y); let sse = 0, sst = 0;
    for (let t = 0; t < n; t++) { let v = coef[0]; for (let q = 0; q < k; q++) v += coef[q + 1] * X[q][t]; fitted[t] = v; resid[t] = y[t] - v; sse += resid[t] ** 2; sst += (y[t] - my) ** 2; }
    const df = n - P, mse = sse / df;
    return { n, k, coef, inv, fitted, resid, sse, sst, df, mse, r2: k ? 1 - sse / sst : 0, se: coef.map((_, q) => Math.sqrt(inv[q][q] * mse)) };
  }
  function olsModel(y, X, names, level) {
    const f = ols(y, X), n = f.n, k = f.k, sy = sdOf(y), R = k ? cov2cor(covMatrix(X)) : [];
    const qcrit = qt(1 - (1 - level) / 2, f.df);
    const terms = ['(Intercept)'].concat(names).map((name, q) => {
      const b = f.coef[q], se = f.se[q], t = b / se, p = 2 * ptU(Math.abs(t), f.df);
      const o = { name, b, se, t, p, lo: b - qcrit * se, hi: b + qcrit * se };
      if (q > 0) {
        const x = X[q - 1], r2j = k > 1 ? E.r2From(R, q - 1, R.map((_, a) => a).filter(a => a !== q - 1)) : 0;
        Object.assign(o, { beta: b * sdOf(x) / sy, vif: 1 / (1 - r2j), tol: 1 - r2j, zero: pearsonR(x, y).r, partial: t / Math.sqrt(t * t + f.df), part: t * Math.sqrt((1 - f.r2) / f.df) });
      }
      return o;
    });
    const ssr = f.sst - f.sse, F = k ? (ssr / k) / f.mse : NaN;
    let dw = 0; for (let t = 1; t < n; t++) dw += (f.resid[t] - f.resid[t - 1]) ** 2; dw /= f.sse;
    return { f, names, terms, r2: f.r2, R: Math.sqrt(f.r2), r2adj: 1 - (1 - f.r2) * (n - 1) / f.df, rmse: Math.sqrt(f.mse), dw,
      anova: { ssr, sse: f.sse, sst: f.sst, dfr: k, dfe: f.df, dft: n - 1, msr: k ? ssr / k : NaN, mse: f.mse, F, p: k ? pfU(F, k, f.df) : NaN } };
  }
  // Belsley collinearity diagnostics: eigen-decomposition of the unit-length-scaled cross-products matrix (with intercept)
  function collinearity(X, names) {
    const n = X[0] ? X[0].length : 0, cols = [Float64Array.from({ length: n }, () => 1)].concat(X), P = cols.length;
    const sc = cols.map(c => { let s = 0; for (const v of c) s += v * v; return Math.sqrt(s); });
    const M = zeros(P, P); for (let a = 0; a < P; a++) for (let b = a; b < P; b++) { let s = 0; for (let t = 0; t < n; t++) s += cols[a][t] * cols[b][t]; M[a][b] = M[b][a] = s / (sc[a] * sc[b]); }
    const { values, vectors } = eigSym(M), lmax = values[0];
    const phi = vectors.map(r => r.map((v, d) => v * v / values[d])), tot = phi.map(r => r.reduce((s, v) => s + v, 0));
    return { names: ['(Intercept)'].concat(names), dims: values.map((ev, d) => ({ eigen: ev, ci: Math.sqrt(lmax / ev), props: phi.map((r, j) => r[d] / tot[j]) })) };
  }
  function diagnostics(y, X, f) { // leverage, standardized / studentized residuals, Cook's distance
    const n = f.n, P = f.k + 1, h = new Float64Array(n), out = [];
    for (let t = 0; t < n; t++) {
      const x = [1].concat(X.map(c => c[t])); let s = 0;
      for (let a = 0; a < P; a++) for (let b = 0; b < P; b++) s += x[a] * f.inv[a][b] * x[b];
      h[t] = s;
      const e = f.resid[t], zres = e / Math.sqrt(f.mse), sres = e / Math.sqrt(f.mse * (1 - s)), cook = sres * sres * s / (P * (1 - s));
      out.push({ i: t, y: y[t], pred: f.fitted[t], resid: e, zres, sres, lev: s, cook });
    }
    return out;
  }
  function stepwise(y, cand, X, method, pin, pout, level) {
    let inModel = method === 'backward' ? cand.slice() : [];
    const steps = [], fit = names => olsModel(y, names.map(nm => X[cand.indexOf(nm)]), names, level);
    const pOf = (m, nm) => m.terms.find(t => t.name === nm).p;
    if (method === 'backward') steps.push({ action: 'enter_all', model: fit(inModel) });
    for (let guard = 0; guard < 4 * cand.length + 4; guard++) {
      let changed = false;
      if (method !== 'backward') { // forward step: add the candidate with the smallest p below pin
        let best = null; cand.filter(c => !inModel.includes(c)).forEach(c => { const p = pOf(fit(inModel.concat([c])), c); if (p < pin && (!best || p < best.p)) best = { c, p }; });
        if (best) { inModel = inModel.concat([best.c]); steps.push({ action: 'enter', v: best.c, model: fit(inModel) }); changed = true; }
      }
      if (method !== 'forward' && inModel.length) { // removal step
        const m = fit(inModel); let worst = null; inModel.forEach(c => { const p = pOf(m, c); if (p > pout && (!worst || p > worst.p)) worst = { c, p }; });
        if (worst) { inModel = inModel.filter(c => c !== worst.c); steps.push({ action: 'remove', v: worst.c, model: fit(inModel) }); changed = true; }
      }
      if (!changed) break;
    }
    return steps;
  }
  function linreg(ds, opts) {
    const level = +opts.ci || 0.95, blocks = (opts.blocks || []).map(b => (b || []).filter(Boolean)).filter(b => b.length);
    if (!opts.y || !blocks.length) throw new Error('bad_regression');
    const allX = [].concat(...blocks).filter((v, i, a) => a.indexOf(v) === i && v !== opts.y);
    const c = complete(ds, [opts.y].concat(allX)), y = c.X[0], X = c.X.slice(1), n = y.length;
    if (n <= allX.length + 1) throw new Error('st2_too_few');
    const method = opts.method || 'enter';
    let models = [];
    if (method === 'enter') {
      let names = [];
      blocks.forEach(b => { names = names.concat(b.filter(v => allX.includes(v) && !names.includes(v))); models.push({ label: 'M' + (models.length + 1), model: olsModel(y, names.map(nm => X[allX.indexOf(nm)]), names, level) }); });
    } else {
      const steps = stepwise(y, allX, X, method, +opts.pin || 0.05, +opts.pout || 0.10, level);
      models = steps.map((s, i) => ({ label: 'M' + (i + 1), action: s.action, v: s.v, model: s.model }));
      if (!models.length) models.push({ label: 'M1', action: 'none', model: olsModel(y, [], [], level) });
    }
    const null0 = olsModel(y, [], [], level);
    models.forEach((m, i) => { // R² change against the previous model (the intercept-only model for the first)
      const prev = i ? models[i - 1].model : null0, cur = m.model, df1 = cur.f.k - prev.f.k, df2 = cur.f.df;
      const d = cur.r2 - prev.r2; m.dR2 = d; m.df1 = df1; m.df2 = df2;
      if (df1 > 0) { m.Fch = (d / df1) / ((1 - cur.r2) / df2); m.pch = pfU(m.Fch, df1, df2); }
      else if (df1 < 0) { m.Fch = (-d / -df1) / ((1 - prev.r2) / prev.f.df); m.pch = pfU(m.Fch, -df1, prev.f.df); }
      else { m.Fch = NaN; m.pch = NaN; }
    });
    const last = models[models.length - 1].model, Xl = last.names.map(nm => X[allX.indexOf(nm)]);
    const diag = diagnostics(y, Xl, last.f), rowsIdx = c.rows;
    diag.forEach(d => { d.case = rowsIdx[d.i] + 1; });
    const thr = +opts.outlier || 3;
    const sr = diag.map(d => d.sres).sort((a, b) => a - b), qq = sr.map((v, i) => { const a = n <= 10 ? 3 / 8 : 0.5; return [qnorm((i + 1 - a) / (n + 1 - 2 * a)), v]; });
    const stat = arr => { const v = Float64Array.from(arr); let mn = Infinity, mx = -Infinity; v.forEach(x => { mn = Math.min(mn, x); mx = Math.max(mx, x); }); return { min: mn, max: mx, mean: meanOf(v), sd: sdOf(v), n: v.length }; };
    const pm = meanOf(last.f.fitted), ps = sdOf(last.f.fitted);
    return {
      kind: 'st2_linreg', y: opts.y, method, n, ci: level, blocks, models: models.map(m => Object.assign({}, m, { model: Object.assign({}, m.model, { f: undefined }) })),
      collin: last.names.length ? collinearity(Xl, last.names) : null,
      casewise: diag.filter(d => Math.abs(d.sres) > thr).map(d => ({ case: d.case, sres: d.sres, y: d.y, pred: d.pred, resid: d.resid, cook: d.cook })), outlier: thr,
      cookMax: Math.max(...diag.map(d => d.cook)), levMax: Math.max(...diag.map(d => d.lev)), nCook1: diag.filter(d => d.cook > 1).length,
      residStats: { pred: stat(last.f.fitted), resid: stat(last.f.resid), zpred: stat(Array.from(last.f.fitted, v => (v - pm) / ps)), zres: stat(diag.map(d => d.zres)), sres: stat(diag.map(d => d.sres)), cook: stat(diag.map(d => d.cook)), lev: stat(diag.map(d => d.lev)) },
      diag: diag.map(d => [d.pred, d.resid, d.sres, d.cook, d.lev, d.case]), qq
    };
  }
  // ================================================================ multinomial and ordinal logistic regression
  // predictors: numeric columns enter as they are, categorical columns as dummies (first level = reference)
  function designMatrix(ds, xs, rows) {
    const cols = [], names = [], groups = [];
    xs.forEach(nm => {
      const j = ds.names.indexOf(nm), c = ds.cols[j];
      if (ds.kinds[j] === 'cat') {
        const lv = Array.from(new Set(rows.map(i => c[i]))).sort((a, b) => a - b), lab = labelOf(ds, nm), g = [];
        lv.slice(1).forEach(v => { g.push(cols.length); cols.push(Float64Array.from(rows, i => (c[i] === v ? 1 : 0))); names.push(nm + ' = ' + lab(v)); });
        groups.push({ name: nm, idx: g });
      } else { groups.push({ name: nm, idx: [cols.length] }); cols.push(Float64Array.from(rows, i => c[i])); names.push(nm); }
    });
    return { cols, names, groups };
  }
  function mnlFit(Y, X, K) { // Y: category index 0..K−1 (0 = reference); X: columns; Newton–Raphson
    const n = Y.length, P = X.length + 1, Q = P * (K - 1), xv = (q, t) => (q === 0 ? 1 : X[q - 1][t]);
    let B = new Array(Q).fill(0), H, LL = -Infinity, it;
    const probs = b => { const pr = []; for (let t = 0; t < n; t++) { const e = [0]; for (let k = 1; k < K; k++) { let s = 0; for (let q = 0; q < P; q++) s += b[(k - 1) * P + q] * xv(q, t); e.push(s); } const m = Math.max(...e); const ex = e.map(v => Math.exp(v - m)), z = ex.reduce((a, v) => a + v, 0); pr.push(ex.map(v => v / z)); } return pr; };
    const ll = pr => { let s = 0; for (let t = 0; t < n; t++) s += Math.log(Math.max(pr[t][Y[t]], 1e-300)); return s; };
    let pr = probs(B); LL = ll(pr);
    for (it = 1; it <= 200; it++) {
      const g = new Array(Q).fill(0); H = zeros(Q, Q);
      for (let t = 0; t < n; t++) {
        const p = pr[t];
        for (let k = 1; k < K; k++) for (let q = 0; q < P; q++) g[(k - 1) * P + q] += xv(q, t) * ((Y[t] === k ? 1 : 0) - p[k]);
        for (let k = 1; k < K; k++) for (let l = k; l < K; l++) { const w = p[k] * ((k === l ? 1 : 0) - p[l]); if (!w) continue; for (let q = 0; q < P; q++) { const a = xv(q, t) * w; for (let r = 0; r < P; r++) H[(k - 1) * P + q][(l - 1) * P + r] += a * xv(r, t); } }
      }
      for (let a = 0; a < Q; a++) for (let b = 0; b < a; b++) H[a][b] = H[b][a];
      let d; try { d = solve(H, g); } catch (e) { break; }
      let step = 1, nb, npr, nLL;
      for (let h = 0; h < 30; h++) { nb = B.map((v, i) => v + step * d[i]); npr = probs(nb); nLL = ll(npr); if (nLL >= LL - 1e-12) break; step /= 2; }
      const delta = Math.max(...d.map(Math.abs)) * step; B = nb; pr = npr; const imp = nLL - LL; LL = nLL;
      if (delta < 1e-10 || Math.abs(imp) < 1e-13) break;
    }
    // observed information at the solution
    H = zeros(Q, Q);
    for (let t = 0; t < n; t++) { const p = pr[t]; for (let k = 1; k < K; k++) for (let l = 1; l < K; l++) { const w = p[k] * ((k === l ? 1 : 0) - p[l]); for (let q = 0; q < P; q++) for (let r = 0; r < P; r++) H[(k - 1) * P + q][(l - 1) * P + r] += xv(q, t) * xv(r, t) * w; } }
    return { B, LL, cov: inverse(H), pr, it, P };
  }
  function logitFitStats(LL, LL0, n, npar, df) {
    const LR = 2 * (LL - LL0), cs = 1 - Math.exp(2 * (LL0 - LL) / n);
    return { LL, LL0, deviance: -2 * LL, dev0: -2 * LL0, LR, df, p: pchisqU(LR, df), mcfadden: 1 - LL / LL0, coxSnell: cs, nagelkerke: cs / (1 - Math.exp(2 * LL0 / n)), aic: -2 * LL + 2 * npar, bic: -2 * LL + npar * Math.log(n) };
  }
  function mlogit(ds, opts) {
    const xs = opts.x || [], level = +opts.ci || 0.95;
    if (!opts.y || !xs.length) throw new Error('bad_regression');
    const c = complete(ds, [opts.y].concat(xs)), rows = c.rows, n = rows.length, yc = colOf(ds, opts.y), lab = labelOf(ds, opts.y);
    let lv = Array.from(new Set(rows.map(i => yc[i]))).sort((a, b) => a - b);
    if (lv.length < 2 || lv.length > 20) throw new Error('st2_levels');
    if (opts.ref === 'last') lv = [lv[lv.length - 1]].concat(lv.slice(0, -1));
    const K = lv.length, Y = Int32Array.from(rows, i => lv.indexOf(yc[i])), dm = designMatrix(ds, xs, rows);
    const fit = mnlFit(Y, dm.cols, K), P = fit.P, z = qnorm(1 - (1 - level) / 2);
    const counts = lv.map((_, k) => Y.reduce((s, v) => s + (v === k ? 1 : 0), 0)), LL0 = counts.reduce((s, m) => s + (m ? m * Math.log(m / n) : 0), 0);
    const coefs = [];
    for (let k = 1; k < K; k++) ['(Intercept)'].concat(dm.names).forEach((nm, q) => {
      const i = (k - 1) * P + q, b = fit.B[i], se = Math.sqrt(fit.cov[i][i]), zz = b / se;
      coefs.push({ cat: lab(lv[k]), term: nm, b, se, z: zz, p: 2 * pnormU(Math.abs(zz)), or: Math.exp(b), orLo: Math.exp(b - z * se), orHi: Math.exp(b + z * se) });
    });
    const lrt = dm.groups.map(g => { // likelihood-ratio test of each predictor
      const keep = dm.cols.filter((_, q) => !g.idx.includes(q)), f0 = mnlFit(Y, keep, K), chi = 2 * (fit.LL - f0.LL), df = g.idx.length * (K - 1);
      return { name: g.name, chi, df, p: pchisqU(chi, df) };
    });
    const conf = lv.map(() => lv.map(() => 0)); fit.pr.forEach((p, t) => { let b = 0; p.forEach((v, k) => { if (v > p[b]) b = k; }); conf[Y[t]][b]++; });
    return { kind: 'st2_mlogit', y: opts.y, n, cats: lv.map(lab), ref: lab(lv[0]), counts, ci: level, coefs, lrt, iterations: fit.it,
      fit: logitFitStats(fit.LL, LL0, n, P * (K - 1), (P - 1) * (K - 1)), confusion: conf, accuracy: conf.reduce((s, r, i) => s + r[i], 0) / n };
  }
  function ordinal(ds, opts) { // proportional-odds (cumulative logit) model: logit P(Y ≤ j) = θj − xβ
    const xs = opts.x || [], level = +opts.ci || 0.95;
    if (!opts.y || !xs.length) throw new Error('bad_regression');
    const c = complete(ds, [opts.y].concat(xs)), rows = c.rows, n = rows.length, yc = colOf(ds, opts.y), lab = labelOf(ds, opts.y);
    const lv = Array.from(new Set(rows.map(i => yc[i]))).sort((a, b) => a - b), J = lv.length;
    if (J < 3 || J > 30) throw new Error('st2_levels');
    const Y = Int32Array.from(rows, i => lv.indexOf(yc[i])), dm = designMatrix(ds, xs, rows), X = dm.cols, k = X.length, NP = J - 1 + k;
    const F = v => (v === Infinity ? 1 : v === -Infinity ? 0 : 1 / (1 + Math.exp(-v))), dF = v => (isFinite(v) ? F(v) * (1 - F(v)) : 0);
    const eta = (b, t) => { let s = 0; for (let q = 0; q < k; q++) s += b[J - 1 + q] * X[q][t]; return s; };
    const th = (b, j) => (j < 0 ? -Infinity : j >= J - 1 ? Infinity : b[j]);
    const LLf = b => { let s = 0; for (let t = 0; t < n; t++) { const e = eta(b, t), j = Y[t], p = F(th(b, j) - e) - F(th(b, j - 1) - e); s += Math.log(Math.max(p, 1e-300)); } return s; };
    const grad = b => {
      const g = new Array(NP).fill(0);
      for (let t = 0; t < n; t++) {
        const e = eta(b, t), j = Y[t], u = th(b, j) - e, l = th(b, j - 1) - e, p = Math.max(F(u) - F(l), 1e-300), du = dF(u), dl = dF(l);
        if (j < J - 1) g[j] += du / p; if (j > 0) g[j - 1] -= dl / p;
        for (let q = 0; q < k; q++) g[J - 1 + q] -= X[q][t] * (du - dl) / p;
      }
      return g;
    };
    const hess = b => { const H = zeros(NP, NP); for (let a = 0; a < NP; a++) { const h = 1e-5 * Math.max(1, Math.abs(b[a])), bp = b.slice(), bm = b.slice(); bp[a] += h; bm[a] -= h; const gp = grad(bp), gm = grad(bm); for (let q = 0; q < NP; q++) H[a][q] = (gp[q] - gm[q]) / (2 * h); } for (let a = 0; a < NP; a++) for (let q = 0; q < a; q++) H[a][q] = H[q][a] = (H[a][q] + H[q][a]) / 2; return H; };
    const cum = []; let acc = 0; lv.forEach((_, j) => { acc += Y.reduce((s, v) => s + (v === j ? 1 : 0), 0); cum.push(acc / n); });
    let b = cum.slice(0, -1).map(p => Math.log(p / (1 - p))).concat(new Array(k).fill(0)), LL = LLf(b), it;
    const LL0 = LL;
    for (it = 1; it <= 200; it++) {
      const g = grad(b), H = hess(b); let d; try { d = solve(H.map(r => r.map(v => -v)), g); } catch (e) { break; }
      let step = 1, nb, nLL;
      for (let h = 0; h < 40; h++) { nb = b.map((v, i) => v + step * d[i]); let ok = true; for (let j = 1; j < J - 1; j++) if (nb[j] <= nb[j - 1]) ok = false; if (ok) { nLL = LLf(nb); if (nLL >= LL - 1e-12) break; } step /= 2; }
      const delta = Math.max(...d.map(Math.abs)) * step; b = nb; const imp = nLL - LL; LL = nLL;
      if (delta < 1e-9 && Math.abs(imp) < 1e-10) break;
    }
    const cov = inverse(hess(b).map(r => r.map(v => -v))), z = qnorm(1 - (1 - level) / 2);
    const par = (i, name) => { const se = Math.sqrt(cov[i][i]), zz = b[i] / se; return { name, b: b[i], se, z: zz, p: 2 * pnormU(Math.abs(zz)), lo: b[i] - z * se, hi: b[i] + z * se, or: Math.exp(b[i]), orLo: Math.exp(b[i] - z * se), orHi: Math.exp(b[i] + z * se) }; };
    return { kind: 'st2_ordinal', y: opts.y, n, cats: lv.map(lab), ci: level, iterations: it,
      coefs: dm.names.map((nm, q) => par(J - 1 + q, nm)), thresholds: lv.slice(0, -1).map((v, j) => par(j, lab(v) + ' | ' + lab(lv[j + 1]))),
      fit: logitFitStats(LL, LL0, n, NP, k) };
  }

  // ================================================================ frequencies
  function binomP(k, n, p0, alt) { // exact binomial test (two-sided: sum of outcomes no more likely than the observed one)
    const lp = y => lfact(n) - lfact(y) - lfact(n - y) + (y ? y * Math.log(p0) : 0) + (n - y ? (n - y) * Math.log(1 - p0) : 0);
    const cdf = y => (y < 0 ? 0 : y >= n ? 1 : 1 - ibeta(p0, y + 1, n - y)), sf = y => 1 - cdf(y - 1); // P(X ≤ y), P(X ≥ y)
    if (alt === 'greater') return sf(k); if (alt === 'less') return cdf(k);
    const d = lp(k); if (k === n * p0) return 1;
    let s = 0; for (let y = 0; y <= n; y++) { const l = lp(y); if (l <= d + Math.log1p(1e-7)) s += Math.exp(l); }
    return Math.min(1, s);
  }
  function clopper(k, n, level, alt) {
    const a = 1 - level;
    if (alt === 'greater') return [k ? qbeta(a, k, n - k + 1) : 0, 1];
    if (alt === 'less') return [0, k < n ? qbeta(1 - a, k + 1, n - k) : 1];
    return [k ? qbeta(a / 2, k, n - k + 1) : 0, k < n ? qbeta(1 - a / 2, k + 1, n - k) : 1];
  }
  function levelCounts(ds, nm) {
    const c = colOf(ds, nm), lv = Array.from(new Set(Array.from(c).filter(v => !isNaN(v)))).sort((a, b) => a - b), lab = labelOf(ds, nm);
    if (lv.length > 50) throw new Error('st2_levels');
    return { lv, labels: lv.map(lab), counts: lv.map(v => Array.from(c).filter(x => x === v).length) };
  }
  function binomTest(ds, opts) {
    const p0 = opts.p0 === undefined || opts.p0 === '' ? 0.5 : +opts.p0, alt = opts.alt || 'two', level = +opts.ci || 0.95;
    if (!(p0 > 0 && p0 < 1)) throw new Error('st2_bad_p0');
    const vars = (opts.vars || []).map(nm => { const L = levelCounts(ds, nm), n = L.counts.reduce((a, b) => a + b, 0); return { name: nm, n, levels: L.labels.map((lb, i) => { const k = L.counts[i], ci = clopper(k, n, level, alt); return { level: lb, k, n, prop: k / n, p: binomP(k, n, p0, alt), lo: ci[0], hi: ci[1] }; }) }; });
    if (!vars.length) throw new Error('st2_need_var');
    return { kind: 'st2_binom', p0, alt, ci: level, vars };
  }
  function parseNums(s) { return String(s || '').split(/[,;\s]+/).filter(Boolean).map(Number); }
  function chisqGOF(ds, opts) {
    const L = levelCounts(ds, opts.var), k = L.counts.length, n = L.counts.reduce((a, b) => a + b, 0);
    let w = opts.expected && String(opts.expected).trim() ? parseNums(opts.expected) : L.counts.map(() => 1);
    if (w.length !== k || w.some(v => !(v >= 0)) || !w.some(v => v > 0)) throw new Error('st2_bad_expected');
    const sw = w.reduce((a, b) => a + b, 0), exp = w.map(v => n * v / sw);
    let chi = 0, g = 0; L.counts.forEach((o, i) => { chi += (o - exp[i]) ** 2 / exp[i]; if (o > 0) g += 2 * o * Math.log(o / exp[i]); });
    return { kind: 'st2_gof', var: opts.var, n, df: k - 1, chi, p: pchisqU(chi, k - 1), g2: g, pG: pchisqU(g, k - 1),
      w: Math.sqrt(chi / n), rows: L.labels.map((lb, i) => ({ level: lb, obs: L.counts[i], prop: w[i] / sw, exp: exp[i], resid: (L.counts[i] - exp[i]) / Math.sqrt(exp[i]) })), minExp: Math.min(...exp) };
  }
  // all r×c tables with the observed margins (exact) or a seeded Monte-Carlo sample of them
  function fisherRC(tab, seed, B) {
    const r = tab.length, c = tab[0].length, R = tab.map(x => x.reduce((a, b) => a + b, 0)), C = tab[0].map((_, j) => tab.reduce((a, x) => a + x[j], 0)), N = R.reduce((a, b) => a + b, 0);
    const konst = R.reduce((s, v) => s + lfact(v), 0) + C.reduce((s, v) => s + lfact(v), 0) - lfact(N);
    const lpOf = t => konst - t.reduce((s, x) => s + x.reduce((q, v) => q + lfact(v), 0), 0);
    const lobs = lpOf(tab), tol = Math.log1p(1e-7);
    let nodes = 0, total = 0, done = true; const LIMIT = 4e6;
    const colLeft = C.slice();
    const rec = (i, j, rowLeft, acc) => { // fill cell (i, j); acc = −Σ log n_ij! so far
      if (!done) return;
      if (i === r - 1) { let a = acc; for (let q = 0; q < c; q++) a -= lfact(colLeft[q]); const lp = konst + a; if (lp <= lobs + tol) total += Math.exp(lp); return; }
      if (j === c - 1) { const v = rowLeft; if (v > colLeft[j]) return; colLeft[j] -= v; rec(i + 1, 0, R[i + 1], acc - lfact(v)); colLeft[j] += v; return; }
      let restCap = 0; for (let q = j + 1; q < c; q++) restCap += colLeft[q];
      const lo = Math.max(0, rowLeft - restCap), hi = Math.min(rowLeft, colLeft[j]);
      for (let v = lo; v <= hi; v++) { if (++nodes > LIMIT) { done = false; return; } colLeft[j] -= v; rec(i, j + 1, rowLeft - v, acc - lfact(v)); colLeft[j] += v; }
    };
    rec(0, 0, R[0], 0);
    if (done) return { p: Math.min(1, total), exact: true };
    const rand = rng(seed || 1), rowLab = [], colLab = []; tab.forEach((x, i) => x.forEach((v, j) => { for (let q = 0; q < v; q++) { rowLab.push(i); colLab.push(j); } }));
    let hit = 0; B = B || 10000;
    for (let b = 0; b < B; b++) {
      for (let q = N - 1; q > 0; q--) { const s = Math.floor(rand() * (q + 1)), tmp = colLab[q]; colLab[q] = colLab[s]; colLab[s] = tmp; }
      const t = tab.map(x => x.map(() => 0)); for (let q = 0; q < N; q++) t[rowLab[q]][colLab[q]]++;
      if (lpOf(t) <= lobs + tol) hit++;
    }
    return { p: (1 + hit) / (B + 1), exact: false, B };
  }
  function fisher22(t, alt) {
    const [[a, b], [c, d]] = t, r1 = a + b, c1 = a + c, N = a + b + c + d, lo = Math.max(0, r1 + c1 - N), hi = Math.min(r1, c1);
    const lp = x => lfact(r1) + lfact(N - r1) + lfact(c1) + lfact(N - c1) - lfact(N) - lfact(x) - lfact(r1 - x) - lfact(c1 - x) - lfact(N - r1 - c1 + x);
    let s = 0;
    if (alt === 'less') { for (let x = lo; x <= a; x++) s += Math.exp(lp(x)); return Math.min(1, s); }
    if (alt === 'greater') { for (let x = a; x <= hi; x++) s += Math.exp(lp(x)); return Math.min(1, s); }
    const d0 = lp(a) + Math.log1p(1e-7); for (let x = lo; x <= hi; x++) { const l = lp(x); if (l <= d0) s += Math.exp(l); }
    return Math.min(1, s);
  }
  function ordinalAssoc(tab) { // concordance counts per cell (Agresti), Goodman–Kruskal γ with ASE, Kendall τ-b
    const r = tab.length, c = tab[0].length, A = zeros(r, c), Dm = zeros(r, c);
    for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) {
      let a = 0, d = 0;
      for (let k = 0; k < r; k++) for (let l = 0; l < c; l++) { if ((k < i && l < j) || (k > i && l > j)) a += tab[k][l]; if ((k < i && l > j) || (k > i && l < j)) d += tab[k][l]; }
      A[i][j] = a; Dm[i][j] = d;
    }
    let P = 0, Q = 0; for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) { P += tab[i][j] * A[i][j]; Q += tab[i][j] * Dm[i][j]; }
    const gamma = (P - Q) / (P + Q); let s = 0;
    for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) s += tab[i][j] * (Q * A[i][j] - P * Dm[i][j]) ** 2;
    const ase = 4 / (P + Q) ** 2 * Math.sqrt(s), N = tab.reduce((q, x) => q + x.reduce((a, b) => a + b, 0), 0);
    const tx = tab.map(x => x.reduce((a, b) => a + b, 0)).filter(t => t > 1), ty = tab[0].map((_, j) => tab.reduce((a, x) => a + x[j], 0)).filter(t => t > 1);
    return { gamma, gammaASE: ase, C: P / 2, D: Q / 2, taub: kendallFrom(N, P / 2, Q / 2, tx, ty, 'two', false) };
  }
  function crosstab(ds, opts) {
    const rv = opts.rows, cv = opts.cols, level = +opts.ci || 0.95;
    if (!rv || !cv || rv === cv) throw new Error('st2_need_two');
    const c = complete(ds, [rv, cv]), rl = Array.from(new Set(c.X[0])).sort((a, b) => a - b), cl = Array.from(new Set(c.X[1])).sort((a, b) => a - b);
    if (rl.length < 2 || cl.length < 2 || rl.length > 30 || cl.length > 30) throw new Error('st2_levels');
    const tab = rl.map(() => cl.map(() => 0)); for (let i = 0; i < c.rows.length; i++) tab[rl.indexOf(c.X[0][i])][cl.indexOf(c.X[1][i])]++;
    const r = rl.length, k = cl.length, R = tab.map(x => x.reduce((a, b) => a + b, 0)), C = cl.map((_, j) => tab.reduce((a, x) => a + x[j], 0)), N = c.rows.length;
    const exp = tab.map((x, i) => x.map((_, j) => R[i] * C[j] / N)), df = (r - 1) * (k - 1);
    let chi = 0, g2 = 0, yates = 0;
    tab.forEach((x, i) => x.forEach((o, j) => { const e = exp[i][j]; chi += (o - e) ** 2 / e; if (o > 0) g2 += 2 * o * Math.log(o / e); const d = Math.max(0, Math.abs(o - e) - 0.5); yates += d * d / e; }));
    const out = { kind: 'st2_crosstab', rowVar: rv, colVar: cv, rowLabels: rl.map(labelOf(ds, rv)), colLabels: cl.map(labelOf(ds, cv)), tab, exp, R, C, N, ci: level,
      chi: { stat: chi, df, p: pchisqU(chi, df) }, g2: { stat: g2, df, p: pchisqU(g2, df) }, minExp: Math.min(...[].concat(...exp)), nLow: [].concat(...exp).filter(e => e < 5).length,
      cramer: Math.sqrt(chi / (N * (Math.min(r, k) - 1))), contingency: Math.sqrt(chi / (chi + N)), phi: Math.sqrt(chi / N) };
    out.cramerP = out.chi.p;
    out.stdRes = tab.map((x, i) => x.map((o, j) => (o - exp[i][j]) / Math.sqrt(exp[i][j] * (1 - R[i] / N) * (1 - C[j] / N)))); // adjusted standardized residuals
    if (r === 2 && k === 2) {
      const [[a, b], [cc, d]] = tab; out.yates = { stat: yates, df: 1, p: pchisqU(yates, 1) };
      out.phi = (a * d - b * cc) / Math.sqrt(R[0] * R[1] * C[0] * C[1]);
      const lor = Math.log(a * d / (b * cc)), se = Math.sqrt(1 / a + 1 / b + 1 / cc + 1 / d), z = qnorm(1 - (1 - level) / 2);
      out.or = { or: Math.exp(lor), lor, se, lo: Math.exp(lor - z * se), hi: Math.exp(lor + z * se), z: lor / se, p: 2 * pnormU(Math.abs(lor / se)) };
      const rr = (a / R[0]) / (cc / R[1]), lse = Math.sqrt(1 / a - 1 / R[0] + 1 / cc - 1 / R[1]);
      out.rr = { rr, lo: Math.exp(Math.log(rr) - z * lse), hi: Math.exp(Math.log(rr) + z * lse) };
      out.fisher = { p: fisher22(tab, 'two'), pLess: fisher22(tab, 'less'), pGreater: fisher22(tab, 'greater'), exact: true };
    } else if (opts.fisher !== false) out.fisher = fisherRC(tab, opts.seed, +opts.mcB || 10000);
    if (r === k && r >= 2) { // McNemar (2×2) / Bowker symmetry test
      if (r === 2) {
        const b = tab[0][1], cc = tab[1][0], s = b + cc;
        out.mcnemar = { b, c: cc, stat: s ? (b - cc) ** 2 / s : NaN, statCC: s ? (Math.abs(b - cc) - 1) ** 2 / s : NaN, df: 1 };
        out.mcnemar.p = pchisqU(out.mcnemar.stat, 1); out.mcnemar.pCC = pchisqU(out.mcnemar.statCC, 1);
        out.mcnemar.pExact = s ? Math.min(1, 2 * (1 - ibeta(0.5, Math.min(b, cc) + 1, s - Math.min(b, cc)))) : 1;
        if (Math.min(b, cc) === s) out.mcnemar.pExact = 1;
      } else {
        let st = 0; for (let i = 0; i < r; i++) for (let j = i + 1; j < r; j++) { const s = tab[i][j] + tab[j][i]; if (s) st += (tab[i][j] - tab[j][i]) ** 2 / s; }
        const dfb = r * (r - 1) / 2; out.bowker = { stat: st, df: dfb, p: pchisqU(st, dfb) };
      }
    }
    const oa = ordinalAssoc(tab), zc = qnorm(1 - (1 - level) / 2);
    out.gamma = { gamma: oa.gamma, ase: oa.gammaASE, lo: oa.gamma - zc * oa.gammaASE, hi: oa.gamma + zc * oa.gammaASE };
    out.taub = oa.taub;
    return out;
  }
  // ================================================================ factor extraction and rotation
  const smcOf = R => { const Ri = inverse(R); return R.map((_, i) => 1 - 1 / Ri[i][i]); };
  function loadFromEig(M, m, shift) { const { values, vectors } = eigSym(M); return { L: vectors.map(r => r.slice(0, m).map((v, j) => v * Math.sqrt(Math.max(values[j] - (shift || 0), 0)))), values }; }
  function faObjective(R, m, method) {
    const p = R.length;
    if (method === 'ml') return psi => { // factanal (Lawley & Maxwell) discrepancy, concentrated in ψ
      const sc = psi.map(v => 1 / Math.sqrt(v)), Ss = R.map((r, i) => r.map((v, j) => v * sc[i] * sc[j])), { values, vectors } = eigSym(Ss);
      let f = 0; for (let j = m; j < p; j++) f -= Math.log(values[j]) - values[j]; f += -m + p;
      const L = vectors.map((r, i) => r.slice(0, m).map((v, j) => v * Math.sqrt(Math.max(values[j] - 1, 0)) * Math.sqrt(psi[i])));
      const g = psi.map((ps, i) => { let s = 0; for (let j = 0; j < m; j++) s += L[i][j] * L[i][j]; return (s + ps - R[i][i]) / (ps * ps); });
      return { f, g, L };
    };
    return psi => { // minres / ULS: ‖(R − Ψ) − ΛΛ'‖²
      const M = R.map((r, i) => r.map((v, j) => (i === j ? v - psi[i] : v))), { L } = loadFromEig(M, m);
      let f = 0; const g = new Array(p).fill(0);
      for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) { let s = 0; for (let q = 0; q < m; q++) s += L[i][q] * L[j][q]; const e = M[i][j] - s; f += e * e; if (i === j) g[i] = -2 * e; }
      return { f, g, L };
    };
  }
  function boxMinimize(obj, x0, lo, hi) { // projected Newton (numerical Hessian of the analytic gradient) with box bounds
    const p = x0.length, clip = x => x.map(v => Math.min(hi, Math.max(lo, v)));
    let x = clip(x0), cur = obj(x), it, conv = false;
    for (it = 0; it < 500; it++) {
      const g = cur.g, free = x.map((v, i) => !((v <= lo + 1e-12 && g[i] > 0) || (v >= hi - 1e-12 && g[i] < 0)));
      const gf = g.map((v, i) => (free[i] ? v : 0)), gn = Math.sqrt(gf.reduce((s, v) => s + v * v, 0));
      if (gn < 1e-11) { conv = true; break; }
      const F = x.map((_, i) => i).filter(i => free[i]), H = zeros(F.length, F.length);
      F.forEach((i, a) => { const h = 1e-6, xp = x.slice(), xm = x.slice(); xp[i] += h; xm[i] -= h; const gp = obj(xp).g, gm = obj(xm).g; F.forEach((q, b) => { H[a][b] = (gp[q] - gm[q]) / (2 * h); }); });
      for (let a = 0; a < F.length; a++) for (let b = 0; b < a; b++) H[a][b] = H[b][a] = (H[a][b] + H[b][a]) / 2;
      let d = new Array(p).fill(0);
      try { const s = solve(H, F.map(i => -g[i])); F.forEach((i, a) => { d[i] = s[a]; }); } catch (e) { d = gf.map(v => -v); }
      if (d.reduce((s, v, i) => s + v * g[i], 0) >= 0) d = gf.map(v => -v);
      let step = 1, nx, nc;
      for (let h = 0; h < 60; h++) { nx = clip(x.map((v, i) => v + step * d[i])); nc = obj(nx); if (nc.f <= cur.f + 1e-4 * nx.reduce((s, v, i) => s + g[i] * (v - x[i]), 0)) break; step /= 2; }
      const dx = Math.max(...nx.map((v, i) => Math.abs(v - x[i]))), df = cur.f - nc.f;
      if (nc.f <= cur.f) { x = nx; cur = nc; }
      if (dx < 1e-13 || (df >= 0 && df < 1e-16)) { conv = true; break; }
    }
    return { x, f: cur.f, L: cur.L, it, conv };
  }
  function extract(R, m, method) {
    const p = R.length;
    if (method === 'pc') { const { L } = loadFromEig(R, m); return { L, psi: L.map(r => 1 - r.reduce((s, v) => s + v * v, 0)), it: 0, conv: true }; }
    if (method === 'pa') { // iterated principal axis, starting from squared multiple correlations
      let h2 = smcOf(R), L, it, conv = false;
      for (it = 1; it <= 5000; it++) {
        L = loadFromEig(R.map((r, i) => r.map((v, j) => (i === j ? h2[i] : v))), m).L;
        const nh = L.map(r => r.reduce((s, v) => s + v * v, 0)), d = Math.max(...nh.map((v, i) => Math.abs(v - h2[i]))); h2 = nh;
        if (d < 1e-12) { conv = true; break; }
      }
      return { L, psi: h2.map(v => 1 - v), it, conv };
    }
    const start = smcOf(R).map(v => 1 - v), r = boxMinimize(faObjective(R, m, method), start, 0.005, 1);
    return { L: r.L, psi: r.x, it: r.it, conv: r.conv, f: r.f };
  }
  // gradient-projection rotation (Bernaards & Jennrich, 2005), as in R's GPArotation
  const vgQ = {
    varimax: L => { const p = L.length, k = L[0].length, cm = []; for (let j = 0; j < k; j++) { let s = 0; for (let i = 0; i < p; i++) s += L[i][j] ** 2; cm.push(s / p); } const QL = L.map(r => r.map((v, j) => v * v - cm[j])); return { f: -QL.reduce((s, r) => s + r.reduce((q, v) => q + v * v, 0), 0) / 4, G: L.map((r, i) => r.map((v, j) => -v * QL[i][j])) }; },
    quartimax: L => ({ f: -L.reduce((s, r) => s + r.reduce((q, v) => q + v ** 4, 0), 0) / 4, G: L.map(r => r.map(v => -(v ** 3))) }),
    equamax: L => { const p = L.length, k = L[0].length, kap = k / (2 * p), L2 = L.map(r => r.map(v => v * v)); const rowS = L2.map(r => r.reduce((a, b) => a + b, 0)), colS = L2[0].map((_, j) => L2.reduce((a, r) => a + r[j], 0)); let f = 0; const G = L.map((r, i) => r.map((v, j) => { const a = rowS[i] - L2[i][j], b = colS[j] - L2[i][j]; f += (1 - kap) * L2[i][j] * a / 4 + kap * L2[i][j] * b / 4; return (1 - kap) * v * a + kap * v * b; })); return { f, G }; },
    oblimin: L => { const L2 = L.map(r => r.map(v => v * v)), rowS = L2.map(r => r.reduce((a, b) => a + b, 0)); let f = 0; const G = L.map((r, i) => r.map((v, j) => { const x = rowS[i] - L2[i][j]; f += L2[i][j] * x / 4; return v * x; })); return { f, G }; },
    geomin: L => { const k = L[0].length, dl = 0.01; let f = 0; const G = L.map(r => { const l2 = r.map(v => v * v + dl), pro = Math.exp(l2.reduce((s, v) => s + Math.log(v), 0) / k); f += pro; return r.map((v, j) => 2 / k * v / l2[j] * pro); }); return { f, G }; }
  };
  function polar(X) { const XtX = mm(tr(X), X), { values, vectors } = eigSym(XtX), W = vectors; const S = W.map(r => r.map((v, j) => v / Math.sqrt(values[j]))); return mm(X, mm(S, tr(W))); }
  const fro = A => Math.sqrt(A.reduce((s, r) => s + r.reduce((q, v) => q + v * v, 0), 0));
  function gpOrth(A, crit) {
    const k = A[0].length; let T = zeros(k, k); for (let i = 0; i < k; i++) T[i][i] = 1;
    let L = mm(A, T), V = crit(L), G = mm(tr(A), V.G), f = V.f, al = 1, it;
    for (it = 0; it < 20000; it++) {
      const M = mm(tr(T), G), S = M.map((r, i) => r.map((v, j) => (v + M[j][i]) / 2)), TS = mm(T, S), Gp = G.map((r, i) => r.map((v, j) => v - TS[i][j]));
      const s = fro(Gp); if (s < 1e-11) break; al *= 2;
      let Tt, Vt;
      for (let h = 0; h <= 10; h++) { const X = T.map((r, i) => r.map((v, j) => v - al * Gp[i][j])); Tt = polar(X); L = mm(A, Tt); Vt = crit(L); if (Vt.f < f - 0.5 * s * s * al) break; al /= 2; }
      T = Tt; f = Vt.f; G = mm(tr(A), Vt.G);
    }
    return { L: mm(A, T), T, Phi: null, it };
  }
  function gpObl(A, crit) {
    const k = A[0].length; let T = zeros(k, k); for (let i = 0; i < k; i++) T[i][i] = 1;
    const Lof = T_ => mm(A, tr(inverse(T_)));
    let L = Lof(T), V = crit(L), G = tr(mm(mm(tr(L), V.G), inverse(T))).map(r => r.map(v => -v)), f = V.f, al = 1, it;
    for (it = 0; it < 20000; it++) {
      const cs = T[0].map((_, j) => T.reduce((s, r, i) => s + r[j] * G[i][j], 0)), Gp = G.map((r, i) => r.map((v, j) => v - T[i][j] * cs[j]));
      const s = fro(Gp); if (s < 1e-11) break; al *= 2;
      let Tt, Vt;
      for (let h = 0; h <= 10; h++) {
        const X = T.map((r, i) => r.map((v, j) => v - al * Gp[i][j])), nrm = X[0].map((_, j) => 1 / Math.sqrt(X.reduce((s2, rr) => s2 + rr[j] * rr[j], 0)));
        Tt = X.map(r => r.map((v, j) => v * nrm[j])); L = Lof(Tt); Vt = crit(L); if (f - Vt.f > 0.5 * s * s * al) break; al /= 2;
      }
      T = Tt; f = Vt.f; G = tr(mm(mm(tr(L), Vt.G), inverse(T))).map(r => r.map(v => -v));
    }
    return { L: Lof(T), T, Phi: mm(tr(T), T), it };
  }
  function kaiser(A, fn) { const h = A.map(r => Math.sqrt(r.reduce((s, v) => s + v * v, 0))), out = fn(A.map((r, i) => r.map(v => v / h[i]))); out.L = out.L.map((r, i) => r.map(v => v * h[i])); return out; }
  function rotate(A, method) {
    if (A[0].length < 2 || method === 'none') return { L: A, Phi: null };
    switch (method) {
      case 'varimax': return kaiser(A, B => gpOrth(B, vgQ.varimax));
      case 'quartimax': return gpOrth(A, vgQ.quartimax);
      case 'equamax': return gpOrth(A, vgQ.equamax);
      case 'geominT': return gpOrth(A, vgQ.geomin);
      case 'oblimin': return gpObl(A, vgQ.oblimin);
      case 'geominQ': return gpObl(A, vgQ.geomin);
      case 'promax': { // Hendrickson & White (1964), as in R's stats::promax (m = 4)
        const X = kaiser(A, B => gpOrth(B, vgQ.varimax)).L, Q = X.map(r => r.map(v => v * Math.abs(v) ** 3));
        let U = mm(inverse(mm(tr(X), X)), mm(tr(X), Q)); const d = diagOf(inverse(mm(tr(U), U)));
        U = U.map(r => r.map((v, j) => v * Math.sqrt(d[j])));
        return { L: mm(X, U), Phi: inverse(mm(tr(U), U)) };
      }
    }
    throw new Error('st2_rotation');
  }
  function kmo(R) {
    const Ri = inverse(R), p = R.length, Q = R.map((r, i) => r.map((_, j) => -Ri[i][j] / Math.sqrt(Ri[i][i] * Ri[j][j])));
    let a = 0, b = 0; const msa = [];
    for (let i = 0; i < p; i++) { let ai = 0, bi = 0; for (let j = 0; j < p; j++) if (i !== j) { ai += R[i][j] ** 2; bi += Q[i][j] ** 2; } msa.push(ai / (ai + bi)); a += ai; b += bi; }
    return { overall: a / (a + b), msa };
  }
  function bartlett(R, n) { const p = R.length, chi = -(n - 1 - (2 * p + 5) / 6) * Math.log(det(R)), df = p * (p - 1) / 2; return { chi, df, p: pchisqU(chi, df) }; }
  function parallel(n, p, B, seed, reduced) { // eigenvalues of random normal data (mean and 95th percentile)
    const rand = rng(seed || 1), g = () => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); }, ev = [];
    for (let b = 0; b < B; b++) {
      const cols = Array.from({ length: p }, () => Float64Array.from({ length: n }, g)); let R = cov2cor(covMatrix(cols));
      if (reduced) { const s = smcOf(R); R = R.map((r, i) => r.map((v, j) => (i === j ? s[i] : v))); }
      ev.push(eigSym(R).values);
    }
    return { mean: ev[0].map((_, j) => meanOf(ev.map(e => e[j]))), q95: ev[0].map((_, j) => E.quantile(ev.map(e => e[j]).sort((a, c) => a - c), 0.95)) };
  }
  function factor(ds, opts, pca) {
    const vars = opts.vars || []; if (vars.length < 3) throw new Error('st2_need_three');
    const c = complete(ds, vars), n = c.rows.length, p = vars.length; if (n <= p) throw new Error('st2_too_few');
    const R = cov2cor(covMatrix(c.X)), method = pca ? 'pc' : (opts.extraction || 'minres'), rot = opts.rotation || (pca ? 'varimax' : 'promax');
    const ev = eigSym(R).values, smc = smcOf(R), red = eigSym(R.map((r, i) => r.map((v, j) => (i === j ? smc[i] : v)))).values;
    const par = parallel(n, p, +opts.parB || 100, opts.seed || 1, !pca), parE = pca ? ev : red;
    let nPar = 0; while (nPar < p && parE[nPar] > par.mean[nPar]) nPar++;
    const nKaiser = ev.filter(v => v > (+opts.eigMin || 1)).length;
    let m = opts.nfMode === 'manual' ? +opts.nf : opts.nfMode === 'eigen' ? nKaiser : nPar;
    let maxM = pca ? p : 1; if (!pca) while (maxM + 1 < p && (p - maxM - 1) ** 2 - (p + maxM + 1) >= 0) maxM++;
    m = Math.max(1, Math.min(m || 1, maxM));
    const ex = extract(R, m, method), rt = rotate(ex.L, rot);
    let L = rt.L, Phi = rt.Phi;
    // reflect factors to positive column sums and order them by explained variance (as psych::fa)
    const sg = L[0].map((_, j) => (L.reduce((s, r) => s + r[j], 0) < 0 ? -1 : 1)); L = L.map(r => r.map((v, j) => v * sg[j])); if (Phi) Phi = Phi.map((r, i) => r.map((v, j) => v * sg[i] * sg[j]));
    const ssOf = (Lx, Px) => Lx[0].map((_, j) => (Px ? mm(Px, mm(tr(Lx), Lx))[j][j] : Lx.reduce((s, r) => s + r[j] * r[j], 0)));
    const ord = ssOf(L, Phi).map((v, j) => [v, j]).sort((a, b) => b[0] - a[0]).map(x => x[1]);
    L = L.map(r => ord.map(j => r[j])); if (Phi) Phi = ord.map(i => ord.map(j => Phi[i][j]));
    const S = Phi ? mm(L, Phi) : L, h2 = L.map((r, i) => (Phi ? r.reduce((s, v, j) => s + v * S[i][j], 0) : r.reduce((s, v) => s + v * v, 0)));
    const ss = ssOf(L, Phi); let cum = 0;
    const out = { kind: pca ? 'st2_pca' : 'st2_efa', vars, n, m, method, rotation: rot, oblique: !!Phi, loadings: L, structure: Phi ? S : null, phi: Phi,
      h2, uniq: h2.map(v => 1 - v), initial: pca ? vars.map(() => 1) : smc, eigen: ev, reducedEigen: red, parallel: par, nPar, nKaiser, converged: ex.conv, iterations: ex.it,
      variance: ss.map(v => { cum += v / p; return { ss: v, prop: v / p, cum }; }), unrotated: ss.length ? ssOf(ex.L, null) : [], kmo: kmo(R), bartlett: bartlett(R, n), hide: +opts.hide || 0 };
    // goodness of fit (Bartlett-corrected likelihood-ratio χ² for the fitted correlation matrix)
    const dfm = ((p - m) ** 2 - (p + m)) / 2;
    if (!pca && dfm > 0) {
      const Rhat = R.map((r, i) => r.map((_, j) => (i === j ? 1 : ex.L[i].reduce((s, v, q) => s + v * ex.L[j][q], 0)))), Rhi = inverse(Rhat), A = mm(Rhi, R);
      const F = A.reduce((s, r, i) => s + r[i], 0) - Math.log(det(R) / det(Rhat)) - p, chi = (n - 1 - (2 * p + 5) / 6 - 2 * m / 3) * F;
      out.fit = { F, chi, df: dfm, p: pchisqU(chi, dfm), rmsea: Math.sqrt(Math.max((chi / dfm - 1) / (n - 1), 0)), bic: chi - dfm * Math.log(n) };
      const chi0 = (n - 1 - (2 * p + 5) / 6) * (-Math.log(det(R))), df0 = p * (p - 1) / 2; out.fit.tli = ((chi0 / df0) - (chi / dfm)) / ((chi0 / df0) - 1);
      let rs = 0, cnt = 0; for (let i = 0; i < p; i++) for (let j = 0; j < i; j++) { rs += (R[i][j] - Rhat[i][j]) ** 2; cnt++; } out.fit.rmsr = Math.sqrt(rs / cnt);
    }
    return out;
  }

  // ================================================================ reliability
  function relCore(X) {
    const k = X.length, C = covMatrix(X), Vx = C.reduce((s, r) => s + r.reduce((a, b) => a + b, 0), 0), sv = diagOf(C).reduce((a, b) => a + b, 0);
    const alpha = k / (k - 1) * (1 - sv / Vx), l1 = 1 - sv / Vx;
    let c2 = 0; for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) if (i !== j) c2 += C[i][j] ** 2;
    const l2 = l1 + Math.sqrt(k / (k - 1) * c2) / Vx, Ci = inverse(C), l6 = 1 - C.reduce((s, _, i) => s + 1 / Ci[i][i], 0) / Vx;
    let om = NaN, lam = null, theta = null;
    try { // McDonald's ω from a one-factor maximum-likelihood factor model (scale invariant, so fitted to the correlations)
      const R = cov2cor(C), ex = extract(R, 1, 'ml'), sd = diagOf(C).map(Math.sqrt), sgn = ex.L.reduce((s, r) => s + r[0], 0) < 0 ? -1 : 1;
      lam = ex.L.map((r, i) => sgn * r[0] * sd[i]); theta = ex.psi.map((v, i) => v * sd[i] * sd[i]);
      const sl = lam.reduce((a, b) => a + b, 0); om = sl * sl / (sl * sl + theta.reduce((a, b) => a + b, 0));
    } catch (e) { /* singular */ }
    const R = cov2cor(C); let rbar = 0, cnt = 0; for (let i = 0; i < k; i++) for (let j = 0; j < i; j++) { rbar += R[i][j]; cnt++; } rbar /= cnt;
    return { k, C, Vx, alpha, l2, l6, omega: om, lam, theta, rbar, alphaStd: k * rbar / (1 + (k - 1) * rbar) };
  }
  function reliability(ds, opts) {
    const items = opts.vars || []; if (items.length < 2) throw new Error('st2_need_two');
    const c = complete(ds, items), n = c.rows.length, level = +opts.ci || 0.95, rev = opts.reverse || [];
    const X = c.X.map((x, i) => { if (!rev.includes(items[i])) return x; let mn = Infinity, mx = -Infinity; x.forEach(v => { mn = Math.min(mn, v); mx = Math.max(mx, v); }); return Float64Array.from(x, v => mn + mx - v); });
    const core = relCore(X), k = items.length, df1 = n - 1, df2 = df1 * (k - 1), a = 1 - level;
    const total = Float64Array.from({ length: n }, (_, t) => X.reduce((s, x) => s + x[t], 0));
    // split-half (odd/even items): correlation, Spearman–Brown and Guttman (Flanagan–Rulon)
    let split = null;
    if (k >= 2) {
      const A = Float64Array.from({ length: n }, (_, t) => X.reduce((s, x, i) => s + (i % 2 === 0 ? x[t] : 0), 0)), Bh = Float64Array.from(total, (v, t) => v - A[t]);
      const r = pearsonR(A, Bh).r, va = sdOf(A) ** 2, vb = sdOf(Bh) ** 2, vt = sdOf(total) ** 2; split = { r, sb: 2 * r / (1 + r), guttman: 2 * (1 - (va + vb) / vt) };
    }
    const itemsOut = items.map((nm, i) => {
      const rest = Float64Array.from(total, (v, t) => v - X[i][t]), sub = k > 2 ? relCore(X.filter((_, j) => j !== i)) : null;
      return { name: nm, reversed: rev.includes(nm), mean: meanOf(X[i]), sd: sdOf(X[i]), itemRest: pearsonR(X[i], rest).r, itemTotal: pearsonR(X[i], total).r,
        alpha: sub ? sub.alpha : NaN, omega: sub ? sub.omega : NaN, l2: sub ? sub.l2 : NaN, l6: sub ? sub.l6 : NaN, loading: core.lam ? core.lam[i] / Math.sqrt(core.C[i][i]) : NaN };
    });
    return { kind: 'st2_rel', items, n, k, ci: level, alpha: core.alpha, alphaStd: core.alphaStd, alphaLo: 1 - (1 - core.alpha) * qfU(a / 2, df1, df2), alphaHi: 1 - (1 - core.alpha) * qfU(1 - a / 2, df1, df2),
      omega: core.omega, l2: core.l2, l6: core.l6, rbar: core.rbar, split, mean: meanOf(total), sd: sdOf(total), itemsOut, reverse: rev };
  }
  function icc(ds, opts) {
    const vars = opts.vars || []; if (vars.length < 2) throw new Error('st2_need_two');
    const c = complete(ds, vars), n = c.rows.length, k = vars.length, X = c.X, level = +opts.ci || 0.95, a = 1 - level;
    if (n < 2) throw new Error('st2_too_few');
    let gm = 0; X.forEach(x => x.forEach(v => { gm += v; })); gm /= n * k;
    const rm = Array.from({ length: n }, (_, t) => X.reduce((s, x) => s + x[t], 0) / k), cmn = X.map(meanOf);
    let ssr = 0, ssc = 0, sst = 0; rm.forEach(v => { ssr += k * (v - gm) ** 2; }); cmn.forEach(v => { ssc += n * (v - gm) ** 2; }); X.forEach(x => x.forEach(v => { sst += (v - gm) ** 2; }));
    const sse = sst - ssr - ssc, msr = ssr / (n - 1), msc = ssc / (k - 1), mse = sse / ((n - 1) * (k - 1)), msw = (ssc + sse) / (n * (k - 1));
    const qf = (pp, d1, d2) => qfU(1 - pp, d1, d2), df1 = n - 1, df1kd = n * (k - 1), df2kd = (n - 1) * (k - 1);
    const icc1 = (msr - msw) / (msr + (k - 1) * msw), icc2 = (msr - mse) / (msr + (k - 1) * mse + k * (msc - mse) / n), icc3 = (msr - mse) / (msr + (k - 1) * mse);
    const f1 = msr / msw, f3 = msr / mse, p1 = pfU(f1, df1, df1kd), p3 = pfU(f3, df1, df2kd);
    const f1l = f1 / qf(1 - a / 2, df1, df1kd), f1u = f1 * qf(1 - a / 2, df1kd, df1), f3l = f3 / qf(1 - a / 2, df1, df2kd), f3u = f3 * qf(1 - a / 2, df2kd, df1);
    const fj = msc / mse, vn = df2kd * (k * icc2 * fj + n * (1 + (k - 1) * icc2) - k * icc2) ** 2, vd = df1 * k * k * icc2 * icc2 * fj * fj + (n * (1 + (k - 1) * icc2) - k * icc2) ** 2, v = vn / vd;
    const f2u = qf(1 - a / 2, n - 1, v), f2l = qf(1 - a / 2, v, n - 1);
    const l2 = n * (msr - f2u * mse) / (f2u * (k * msc + (k * n - k - n) * mse) + n * msr), u2 = n * (f2l * msr - mse) / (k * msc + (k * n - k - n) * mse + n * f2l * msr);
    const rows = [
      { type: 'ICC1', sf: 'ICC(1,1)', icc: icc1, F: f1, df1, df2: df1kd, p: p1, lo: (f1l - 1) / (f1l + k - 1), hi: (f1u - 1) / (f1u + k - 1) },
      { type: 'ICC2', sf: 'ICC(2,1)', icc: icc2, F: f3, df1, df2: df2kd, p: p3, lo: l2, hi: u2 },
      { type: 'ICC3', sf: 'ICC(3,1)', icc: icc3, F: f3, df1, df2: df2kd, p: p3, lo: (f3l - 1) / (f3l + k - 1), hi: (f3u - 1) / (f3u + k - 1) },
      { type: 'ICC1k', sf: 'ICC(1,k)', icc: (msr - msw) / msr, F: f1, df1, df2: df1kd, p: p1, lo: 1 - 1 / f1l, hi: 1 - 1 / f1u },
      { type: 'ICC2k', sf: 'ICC(2,k)', icc: (msr - mse) / (msr + (msc - mse) / n), F: f3, df1, df2: df2kd, p: p3, lo: l2 * k / (1 + l2 * (k - 1)), hi: u2 * k / (1 + u2 * (k - 1)) },
      { type: 'ICC3k', sf: 'ICC(3,k)', icc: (msr - mse) / msr, F: f3, df1, df2: df2kd, p: p3, lo: 1 - 1 / f3l, hi: 1 - 1 / f3u }
    ];
    return { kind: 'st2_icc', vars, n, k, ci: level, rows, anova: { ssr, ssc, sse, msr, msc, mse, msw } };
  }
  // ================================================================ Bayesian tests
  // evidence categories of Jeffreys (1961) as labelled by Lee & Wagenmakers (2013)
  function evidence(bf10) {
    const b = bf10 >= 1 ? bf10 : 1 / bf10, side = bf10 >= 1 ? 'h1' : 'h0';
    const lvl = b === 1 ? 'none' : b < 3 ? 'anecdotal' : b < 10 ? 'moderate' : b < 30 ? 'strong' : b < 100 ? 'vstrong' : 'extreme';
    return { side, level: lvl };
  }
  function simpson(f, a, b, N) { // N even
    if (!(b > a)) return 0; const h = (b - a) / N; let s = f(a) + f(b);
    for (let i = 1; i < N; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
    return s * h / 3;
  }
  // JZS Bayes factor (Rouder et al., 2009): integral over g (Zellner–Siow), computed on u = ln g with the trapezoid rule
  function jzsLogBF10(t, N, df, r) {
    const lf = u => { const g = Math.exp(u), a = 1 + N * g * r * r; return -0.5 * Math.log(a) - (df + 1) / 2 * Math.log(1 + t * t / (a * df)) - 0.5 * Math.log(2 * Math.PI) - 0.5 * u - 1 / (2 * g); };
    const h = 0.01, vals = []; for (let u = -40; u <= 90; u += h) vals.push(lf(u));
    return logsumexp(vals) + Math.log(h) + (df + 1) / 2 * Math.log(1 + t * t / df);
  }
  // log of the likelihood ratio p(t | δ) / p(t | δ = 0) for the noncentral t with ncp = δ√N
  function ncLogLR(t, df, mu) {
    const a = df + t * t, logI = m => {
      const s0 = (t * m + Math.sqrt(t * t * m * m + 4 * df * a)) / (2 * a), w = 1 / Math.sqrt(a + df / (s0 * s0)), lo = Math.max(1e-300, s0 - 15 * w), hi = s0 + 15 * w, N = 600, hh = (hi - lo) / N;
      const lg = s => df * Math.log(s) - a * s * s / 2 + t * m * s - m * m / 2, ref = lg(s0); let sum = 0;
      for (let i = 0; i <= N; i++) { const s = lo + i * hh; sum += (i === 0 || i === N ? 1 : i % 2 ? 4 : 2) * Math.exp(lg(s) - ref); }
      return ref + Math.log(sum * hh / 3);
    };
    return logI(mu) - logI(0);
  }
  function quantilesFromGrid(xs, dens, probs) { // cumulative trapezoid + linear interpolation
    const cdf = [0]; for (let i = 1; i < xs.length; i++) cdf.push(cdf[i - 1] + (dens[i] + dens[i - 1]) / 2 * (xs[i] - xs[i - 1]));
    const tot = cdf[cdf.length - 1];
    return probs.map(p => { const target = p * tot; let i = 1; while (i < cdf.length - 1 && cdf[i] < target) i++; const f = (target - cdf[i - 1]) / (cdf[i] - cdf[i - 1] || 1); return xs[i - 1] + f * (xs[i] - xs[i - 1]); });
  }
  // posterior of δ under the (possibly truncated) Cauchy prior on a grid; also gives the directional Bayes factors
  function deltaPosterior(t, N, df, r, hyp, pts) {
    pts = pts || 4000; const dh = t / Math.sqrt(N), w = Math.sqrt((df + t * t) / (df * N));
    let lo = Math.min(0, dh) - 14 * w, hi = Math.max(0, dh) + 14 * w;
    const lcau = d => Math.log(r / Math.PI) - Math.log(r * r + d * d);
    const seg = (a, b) => { const n = Math.max(2, 2 * Math.round(pts * (b - a) / (hi - lo) / 2)), h = (b - a) / n, xs = [], lv = []; for (let i = 0; i <= n; i++) { const d = a + i * h; xs.push(d); lv.push(ncLogLR(t, df, d * Math.sqrt(N)) + lcau(d)); } return { xs, lv, h, n }; };
    const integ = s => { if (s.n < 2) return -Infinity; const ws = s.lv.map((v, i) => v + Math.log((i === 0 || i === s.n ? 1 : i % 2 ? 4 : 2) * s.h / 3)); return logsumexp(ws); };
    const neg = seg(lo, 0), pos = seg(0, hi), lneg = integ(neg), lpos = integ(pos), l2 = logsumexp([lneg, lpos]);
    const out = { logBF10: l2, logBFplus: Math.log(2) + lpos, logBFminus: Math.log(2) + lneg };
    const use = hyp === 'greater' ? [pos] : hyp === 'less' ? [neg] : [neg, pos], xs = [], lv = [];
    use.forEach((s, q) => s.xs.forEach((x, i) => { if (q && i === 0) return; xs.push(x); lv.push(s.lv[i]); }));
    const m = Math.max(...lv), dens = lv.map(v => Math.exp(v - m)), qs = quantilesFromGrid(xs, dens, [0.025, 0.5, 0.975]);
    let area = 0; for (let i = 1; i < xs.length; i++) area += (dens[i] + dens[i - 1]) / 2 * (xs[i] - xs[i - 1]);
    const step = Math.max(1, Math.floor(xs.length / 300)); out.curve = xs.filter((_, i) => i % step === 0).map((x, i) => [x, dens[i * step] / area]);
    out.lo = qs[0]; out.median = qs[1]; out.hi = qs[2];
    return out;
  }
  function bfFor(t, N, df, r, hyp, pts) { return hyp === 'two' ? jzsLogBF10(t, N, df, r) : (hyp === 'greater' ? deltaPosterior(t, N, df, r, hyp, pts || 800).logBFplus : deltaPosterior(t, N, df, r, hyp, pts || 800).logBFminus); }
  function tStat(type, a, b, mu0) {
    if (type === 'independent') { const n1 = a.length, n2 = b.length, df = n1 + n2 - 2, sp = ((n1 - 1) * sdOf(a) ** 2 + (n2 - 1) * sdOf(b) ** 2) / df; return { t: (meanOf(a) - meanOf(b)) / Math.sqrt(sp * (1 / n1 + 1 / n2)), N: n1 * n2 / (n1 + n2), df }; }
    const d = type === 'paired' ? Float64Array.from(a, (v, i) => v - b[i]) : Float64Array.from(a, v => v - mu0), n = d.length;
    return { t: meanOf(d) / (sdOf(d) / Math.sqrt(n)), N: n, df: n - 1 };
  }
  function bttest(ds, opts) {
    const type = opts.type || 'one', r = +opts.r || Math.SQRT1_2, hyp = opts.hyp || 'two', mu0 = +opts.mu0 || 0;
    let a, b, desc;
    if (type === 'independent') {
      const c = complete(ds, [opts.y, opts.group]), lv = Array.from(new Set(c.X[1])).sort((p, q) => p - q);
      if (lv.length !== 2) throw new Error('st2_two_groups');
      const lab = labelOf(ds, opts.group); a = c.X[0].filter((_, i) => c.X[1][i] === lv[0]); b = c.X[0].filter((_, i) => c.X[1][i] === lv[1]);
      desc = [{ name: lab(lv[0]), n: a.length, mean: meanOf(a), sd: sdOf(a) }, { name: lab(lv[1]), n: b.length, mean: meanOf(b), sd: sdOf(b) }];
    } else if (type === 'paired') {
      const c = complete(ds, [opts.y, opts.y2]); a = c.X[0]; b = c.X[1];
      desc = [{ name: opts.y, n: a.length, mean: meanOf(a), sd: sdOf(a) }, { name: opts.y2, n: b.length, mean: meanOf(b), sd: sdOf(b) }];
    } else { const c = complete(ds, [opts.y]); a = c.X[0]; desc = [{ name: opts.y, n: a.length, mean: meanOf(a), sd: sdOf(a) }]; }
    if (a.length < 2 || (type === 'independent' && b.length < 2)) throw new Error('st2_too_few');
    const ts = tStat(type, a, b, mu0), post = deltaPosterior(ts.t, ts.N, ts.df, r, hyp);
    const logBF = hyp === 'two' ? jzsLogBF10(ts.t, ts.N, ts.df, r) : hyp === 'greater' ? post.logBFplus : post.logBFminus;
    const robust = []; for (let i = 1; i <= 30; i++) { const rr = i * 0.05; robust.push([rr, bfFor(ts.t, ts.N, ts.df, rr, hyp, 400) / Math.LN10]); }
    const seq = [], n0 = type === 'independent' ? 0 : a.length, nt = type === 'independent' ? a.length + b.length : n0, stepN = Math.max(1, Math.ceil(nt / 120));
    if (type === 'independent') {
      const c = complete(ds, [opts.y, opts.group]), lv = Array.from(new Set(c.X[1])).sort((p, q) => p - q);
      for (let m = 4; m <= c.rows.length; m += stepN) { const ya = [], yb = []; for (let i = 0; i < m; i++) (c.X[1][i] === lv[0] ? ya : yb).push(c.X[0][i]); if (ya.length >= 2 && yb.length >= 2) { const s = tStat(type, ya, yb); seq.push([m, bfFor(s.t, s.N, s.df, r, hyp, 300) / Math.LN10]); } }
    } else for (let m = 3; m <= n0; m += stepN) { const s = tStat(type, a.slice(0, m), b ? b.slice(0, m) : null, mu0); if (isFinite(s.t)) seq.push([m, bfFor(s.t, s.N, s.df, r, hyp, 300) / Math.LN10]); }
    const bf10 = Math.exp(logBF);
    return { kind: 'st2_bttest', type, hyp, r, mu0, y: opts.y, y2: opts.y2, group: opts.group, desc, t: ts.t, df: ts.df, N: ts.N, bf10, bf01: 1 / bf10, logBF10: logBF,
      evidence: evidence(bf10), median: post.median, lo: post.lo, hi: post.hi, curve: post.curve, robust, seq, cohenD: ts.t / Math.sqrt(ts.N) };
  }
  // log ₂F₁(a, b; c; z) for a, b, c > 0 and 0 ≤ z < 1: the positive series summed in log space, stopped by a ratio bound
  function log2F1pos(a, b, c, z) {
    if (z === 0) return 0; let lt = 0, ls = 0;
    for (let j = 0; j < 2e6; j++) {
      lt += Math.log(a + j) + Math.log(b + j) - Math.log(c + j) - Math.log(j + 1) + Math.log(z);
      ls = ls > lt ? ls + Math.log1p(Math.exp(lt - ls)) : lt + Math.log1p(Math.exp(ls - lt));
      const ratio = (a + j + 1) * (b + j + 1) * z / ((c + j + 1) * (j + 2));
      if (ratio < 1 && lt - ls < Math.log(1e-17 * (1 - ratio))) break;
    }
    return ls;
  }
  function ccBF10(r, n, kappa) { // Ly, Verhagen & Wagenmakers (2016), two-sided, stretched beta prior of width κ
    const k = kappa, a = (n - 1) / 2, c = (n + 2 / k) / 2, z = r * r;
    const lhyp = (c - 2 * a) * Math.log(1 - z) + log2F1pos(c - a, c - a, c, z); // Euler transformation
    return (1 - 2 / k) * Math.LN2 + 0.5 * Math.log(Math.PI) - lbeta(1 / k, 1 / k) + lgamma((n + 2 / k - 1) / 2) - lgamma((n + 2 / k) / 2) + lhyp;
  }
  // likelihood of ρ given the sample r (Hotelling's form of the density of r; all terms positive)
  const rhoLogLik = (rho, r, n) => (n - 1) / 2 * Math.log(1 - rho * rho) - (n - 1.5) * Math.log(1 - rho * r) + log2F1pos(0.5, 0.5, n - 0.5, (1 + rho * r) / 2);
  function rhoPosterior(r, n, kappa, hyp) {
    const lprior = rho => (1 - 2 / kappa) * Math.LN2 - lbeta(1 / kappa, 1 / kappa) + (1 / kappa - 1) * Math.log(1 - rho * rho);
    const w = Math.max(1e-3, (1 - r * r) / Math.sqrt(n)), lo = Math.max(-1 + 1e-12, Math.min(0, r) - 16 * w), hi = Math.min(1 - 1e-12, Math.max(0, r) + 16 * w), l0 = rhoLogLik(0, r, n);
    const seg = (a, b, N) => { const h = (b - a) / N, xs = [], lv = []; for (let i = 0; i <= N; i++) { const x = a + i * h; xs.push(x); lv.push(rhoLogLik(x, r, n) - l0 + lprior(x)); } return { xs, lv, h, N }; };
    const nn = s => 2 * Math.max(50, Math.round(1500 * s / (hi - lo)));
    const neg = seg(lo, 0, nn(0 - lo)), pos = seg(0, hi, nn(hi)), integ = s => logsumexp(s.lv.map((v, i) => v + Math.log((i === 0 || i === s.N ? 1 : i % 2 ? 4 : 2) * s.h / 3)));
    const lneg = integ(neg), lpos = integ(pos);
    const use = hyp === 'greater' ? [pos] : hyp === 'less' ? [neg] : [neg, pos], xs = [], lv = [];
    use.forEach((s, q) => s.xs.forEach((x, i) => { if (q && i === 0) return; xs.push(x); lv.push(s.lv[i]); }));
    const m = Math.max(...lv), dens = lv.map(v => Math.exp(v - m)), qs = quantilesFromGrid(xs, dens, [0.025, 0.5, 0.975]);
    let area = 0; for (let i = 1; i < xs.length; i++) area += (dens[i] + dens[i - 1]) / 2 * (xs[i] - xs[i - 1]);
    const step = Math.max(1, Math.floor(xs.length / 300));
    return { logBF10num: logsumexp([lneg, lpos]), logBFplus: Math.log(2) + lpos, logBFminus: Math.log(2) + lneg, lo: qs[0], median: qs[1], hi: qs[2], curve: xs.filter((_, i) => i % step === 0).map((x, i) => [x, dens[i * step] / area]) };
  }
  function bcorr(ds, opts) {
    const vars = opts.vars || [], kappa = +opts.kappa || 1, hyp = opts.hyp || 'two'; if (vars.length < 2) throw new Error('st2_need_two');
    const pairs = [];
    for (let i = 0; i < vars.length; i++) for (let j = i + 1; j < vars.length; j++) {
      const c = complete(ds, [vars[i], vars[j]]), n = c.rows.length; if (n < 3) continue;
      const r = pearsonR(c.X[0], c.X[1]).r, post = rhoPosterior(r, n, kappa, hyp), l2 = ccBF10(r, n, kappa);
      const lbf = hyp === 'two' ? l2 : hyp === 'greater' ? post.logBFplus : post.logBFminus, bf = Math.exp(lbf);
      pairs.push({ x: vars[i], y: vars[j], n, r, bf10: bf, bf01: 1 / bf, logBF10: lbf, logBF10two: l2, logBF10num: post.logBF10num, evidence: evidence(bf), median: post.median, lo: post.lo, hi: post.hi, curve: post.curve });
    }
    return { kind: 'st2_bcorr', vars, kappa, hyp, pairs };
  }
  function bbinom(ds, opts) {
    const p0 = opts.p0 === undefined || opts.p0 === '' ? 0.5 : +opts.p0, a = +opts.a || 1, b = +opts.b || 1, hyp = opts.hyp || 'two';
    if (!(p0 > 0 && p0 < 1)) throw new Error('st2_bad_p0');
    const vars = (opts.vars || []).map(nm => {
      const L = levelCounts(ds, nm), n = L.counts.reduce((x, y) => x + y, 0);
      return { name: nm, n, levels: L.labels.map((lb, i) => {
        const k = L.counts[i], A = a + k, Bb = b + n - k, l0 = k * Math.log(p0) + (n - k) * Math.log(1 - p0), lm = lbeta(A, Bb) - lbeta(a, b);
        const two = lm - l0, plus = lm + Math.log(1 - ibeta(p0, A, Bb)) - Math.log(1 - ibeta(p0, a, b)) - l0, minus = lm + Math.log(ibeta(p0, A, Bb)) - Math.log(ibeta(p0, a, b)) - l0;
        const lbf = hyp === 'two' ? two : hyp === 'greater' ? plus : minus, bf = Math.exp(lbf);
        const F0 = ibeta(p0, A, Bb), q = pp => (hyp === 'greater' ? qbeta(F0 + pp * (1 - F0), A, Bb) : hyp === 'less' ? qbeta(pp * F0, A, Bb) : qbeta(pp, A, Bb));
        return { level: lb, k, n, prop: k / n, bf10: bf, bf01: 1 / bf, logBF10: lbf, evidence: evidence(bf), median: q(0.5), lo: q(0.025), hi: q(0.975), postA: A, postB: Bb };
      }) };
    });
    if (!vars.length) throw new Error('st2_need_var');
    return { kind: 'st2_bbinom', p0, a, b, hyp, vars };
  }
  const lmbeta = v => v.reduce((s, x) => s + lgamma(x), 0) - lgamma(v.reduce((s, x) => s + x, 0)); // log multivariate beta
  function contingencyLogBF(tab, design, a0) { // Gunel & Dickey (1974) Bayes factors for independence
    a0 = a0 || 1; const I = tab.length, J = tab[0].length, R = tab.map(x => x.reduce((p, q) => p + q, 0)), C = tab[0].map((_, j) => tab.reduce((p, x) => p + x[j], 0));
    if (design === 'rows' || design === 'cols') {
      const T = design === 'rows' ? tab : tr(tab), rows = T.length, cols = T[0].length, S = T[0].map((_, j) => T.reduce((p, x) => p + x[j], 0));
      const ac = new Array(cols).fill(a0 * rows - rows + 1), ai = new Array(cols).fill(a0);
      return T.reduce((s, x) => s + lmbeta(x.map(v => v + a0)) - lmbeta(ai), 0) - (lmbeta(S.map((v, j) => v + ac[j])) - lmbeta(ac));
    }
    const a = [].concat(...tab.map(x => x.map(() => a0))), y = [].concat(...tab), ar = new Array(I).fill(a0 * J - J + 1), ac = new Array(J).fill(a0 * I - I + 1);
    return (lmbeta(y.map((v, i) => v + a[i])) - lmbeta(a)) - (lmbeta(R.map((v, i) => v + ar[i])) - lmbeta(ar)) - (lmbeta(C.map((v, j) => v + ac[j])) - lmbeta(ac));
  }
  function bcont(ds, opts) {
    const ct = crosstab(ds, { rows: opts.rows, cols: opts.cols, fisher: false }), design = opts.design || 'joint', a0 = +opts.a0 || 1, lbf = contingencyLogBF(ct.tab, design, a0), bf = Math.exp(lbf);
    return { kind: 'st2_bcont', rowVar: ct.rowVar, colVar: ct.colVar, rowLabels: ct.rowLabels, colLabels: ct.colLabels, tab: ct.tab, N: ct.N, design, a0, bf10: bf, bf01: 1 / bf, logBF10: lbf, evidence: evidence(bf), chi: ct.chi, cramer: ct.cramer };
  }

  // ================================================================ meta-analysis
  function tau2Of(y, v, method) {
    const k = y.length, w = v.map(x => 1 / x), sw = w.reduce((a, b) => a + b, 0), muF = w.reduce((s, x, i) => s + x * y[i], 0) / sw;
    const Q = w.reduce((s, x, i) => s + x * (y[i] - muF) ** 2, 0);
    if (method === 'FE') return 0;
    if (method === 'DL') return Math.max(0, (Q - (k - 1)) / (sw - w.reduce((s, x) => s + x * x, 0) / sw));
    const gen = t2 => { const ww = v.map(x => 1 / (x + t2)), s = ww.reduce((a, b) => a + b, 0), mu = ww.reduce((q, x, i) => q + x * y[i], 0) / s; return { ww, s, mu, Q: ww.reduce((q, x, i) => q + x * (y[i] - mu) ** 2, 0) }; };
    if (method === 'PM') { // Paule & Mandel (1982): generalized Q equals k − 1
      if (gen(0).Q <= k - 1) return 0; let lo = 0, hi = 1; while (gen(hi).Q > k - 1) hi *= 2;
      for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (gen(m).Q > k - 1) lo = m; else hi = m; } return (lo + hi) / 2;
    }
    // ML / REML by Fisher scoring (as in metafor), started at the DerSimonian–Laird value
    const reml = method === 'REML';
    const ll = t2 => { const g = gen(t2); let s = -0.5 * v.reduce((q, x) => q + Math.log(x + t2), 0) - 0.5 * g.Q; if (reml) s -= 0.5 * Math.log(g.s); return s; };
    let t2 = tau2Of(y, v, 'DL'), cur = ll(t2);
    for (let it = 0; it < 1000; it++) {
      const g = gen(t2), sw2 = g.ww.reduce((q, x) => q + x * x, 0), sr = g.ww.reduce((q, x, i) => q + x * x * (y[i] - g.mu) ** 2, 0);
      let score, info;
      if (reml) { const sw3 = g.ww.reduce((q, x) => q + x ** 3, 0); score = 0.5 * (sr - g.s + sw2 / g.s); info = 0.5 * (sw2 - 2 * sw3 / g.s + (sw2 / g.s) ** 2); }
      else { score = 0.5 * (sr - g.s); info = 0.5 * sw2; }
      let step = score / info, nt = Math.max(0, t2 + step), nl = ll(nt);
      for (let h = 0; h < 50 && nl < cur - 1e-14; h++) { step /= 2; nt = Math.max(0, t2 + step); nl = ll(nt); }
      const d = Math.abs(nt - t2); t2 = nt; cur = nl; if (d < 1e-12) break;
    }
    return t2;
  }
  function meta(ds, opts) {
    if (!opts.es || !opts.se) throw new Error('st2_meta_vars');
    const names = [opts.es, opts.se], c = complete(ds, names), lab = opts.label ? colOf(ds, opts.label) : null, lfun = opts.label ? labelOf(ds, opts.label) : null;
    const y = Array.from(c.X[0]), v = Array.from(c.X[1], x => (opts.seType === 'var' ? x : x * x)), k = y.length, method = opts.method || 'REML', level = +opts.ci || 0.95;
    if (k < 2) throw new Error('st2_too_few'); if (v.some(x => !(x > 0))) throw new Error('st2_meta_se');
    const zc = qnorm(1 - (1 - level) / 2), w = v.map(x => 1 / x), sw = w.reduce((a, b) => a + b, 0), muF = w.reduce((s, x, i) => s + x * y[i], 0) / sw;
    const Q = w.reduce((s, x, i) => s + x * (y[i] - muF) ** 2, 0), t2 = tau2Of(y, v, method), ww = v.map(x => 1 / (x + t2)), sww = ww.reduce((a, b) => a + b, 0);
    const mu = ww.reduce((s, x, i) => s + x * y[i], 0) / sww, se = 1 / Math.sqrt(sww), z = mu / se;
    const s2 = (k - 1) * sw / (sw * sw - w.reduce((s, x) => s + x * x, 0));
    let I2, H2; if (method === 'FE') { I2 = Math.max(0, (Q - (k - 1)) / Q) * 100; H2 = Q / (k - 1); } else { I2 = 100 * t2 / (t2 + s2); H2 = (t2 + s2) / s2; }
    const studies = y.map((yi, i) => ({ label: lab ? lfun(lab[c.rows[i]]) : String(c.rows[i] + 1), y: yi, se: Math.sqrt(v[i]), lo: yi - zc * Math.sqrt(v[i]), hi: yi + zc * Math.sqrt(v[i]), w: 100 * ww[i] / sww }));
    // Egger's regression test: standardized effect on precision (ordinary least squares)
    let egger = null;
    if (k >= 3) { const zs = y.map((yi, i) => yi / Math.sqrt(v[i])), prec = v.map(x => 1 / Math.sqrt(x)), m = olsModel(Float64Array.from(zs), [Float64Array.from(prec)], ['precision'], level); egger = { b0: m.terms[0].b, se: m.terms[0].se, t: m.terms[0].t, df: m.f.df, p: m.terms[0].p, slope: m.terms[1].b }; }
    const zsum = y.reduce((s, yi, i) => s + yi / Math.sqrt(v[i]), 0), za = qnorm(0.95);
    const fsn = Math.max(0, zsum * zsum / (za * za) - k);
    return { kind: 'st2_meta', method, k, ci: level, es: opts.es, seName: opts.se, seType: opts.seType || 'se', studies, mu, se, z, p: 2 * pnormU(Math.abs(z)), lo: mu - zc * se, hi: mu + zc * se,
      tau2: t2, tau: Math.sqrt(t2), I2, H2, Q, df: k - 1, pQ: pchisqU(Q, k - 1), piLo: mu - zc * Math.sqrt(se * se + t2), piHi: mu + zc * Math.sqrt(se * se + t2), muFE: muF, seFE: 1 / Math.sqrt(sw), egger, fsn };
  }
  E.st2 = { lgamma, ibeta, gammaP, gammaQ, pnorm, qnorm, pt, qt, pchisq, pchisqU, qchisq, pfU, qfU, qbeta, lbeta, eigSym, ranks, kendall, kendallExactP, ols, olsModel, correlation, linreg,
    mlogit, ordinal, binomTest, binomP, chisqGOF, crosstab, fisherRC, fisher22, ordinalAssoc, extract, rotate, kmo, bartlett, factor, reliability, icc,
    jzsLogBF10, deltaPosterior, ncLogLR, ccBF10, rhoPosterior, bttest, bcorr, bbinom, contingencyLogBF, bcont, tau2Of, meta, evidence, log2F1pos };
  const T = (fn, x) => (ds, model, settings, opts) => fn(ds, opts || {}, x);
  Object.assign(E.tasks, {
    st2_corr: T(correlation), st2_linreg: T(linreg), st2_mlogit: T(mlogit), st2_ordinal: T(ordinal),
    st2_binom: T(binomTest), st2_gof: T(chisqGOF), st2_crosstab: T(crosstab),
    st2_rel: T(reliability), st2_icc: T(icc), st2_efa: T(factor, false), st2_pca: T(factor, true),
    st2_bttest: T(bttest), st2_bcorr: T(bcorr), st2_bbinom: T(bbinom), st2_bcont: T(bcont), st2_meta: T(meta)
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = E;
})(typeof self !== 'undefined' ? self : this);
