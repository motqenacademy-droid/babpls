/*
 * BabPls engine module: PROCESS (Hayes) conditional process analysis
 * UMD: extends window.YPEngine (browser/worker) or the Node export of advanced3.js. Each analysis registers
 * E.tasks[kind] = (ds, model, settings, opts, progress) => result (result.kind selects the renderer in js/ui-process.js).
 *
 * One general engine estimates every numbered PROCESS model (Hayes, 2022, Appendix A; PROCESS v4.x) from a template:
 *   - a mediator structure (none, parallel, serial, or the mixed parallel/serial structures of models 80–82),
 *   - for the paths X→M, M→Y and X→Y, which moderators act on them (W, Z, or W, Z and W×Z for a three-way interaction).
 * Each outcome equation then contains the paths into it, the main effects of its moderators, the products of the
 * moderated predictors with the moderators, and the covariates; estimation is OLS (optionally with HC0–HC4 standard
 * errors), and conditional indirect effects, indices of moderated mediation and contrasts are tested with percentile
 * (or bias-corrected) bootstrap confidence intervals.
 */
(function (root) {
  'use strict';
  const E = (typeof module !== 'undefined' && module.exports) ? require('./advanced3.js') : root.YPEngine;
  E.tasks = E.tasks || {};
  const { mean, sd, quantile, rng } = E;

  // ------------------------------------------------------------------ templates
  /*
   * PROCESS v4 model templates (Hayes, 2022, Appendix A). Nine flags, in this order:
   *   aW aZ aWZ — the X→M path(s) are moderated by W, by Z, and by W×Z (three-way: X×W×Z);
   *   bW bZ bWZ — the M→Y path(s);
   *   cW cZ cWZ — the X→Y path (the direct effect, or the only path in models 1–3).
   * A three-way flag always comes with both two-way flags (the lower-order terms are in the equation).
   * Since PROCESS v3 the moderators are called W and Z only (the V and Q of the 2013 edition were renamed and the
   * models with a third or fourth moderator, 23–27 and 30–57, were retired); models 77–79 never existed.
   * Exceptions to "all mediators alike": in models 83 and 86 W moderates X→M1 only; in 87 and 90 W moderates
   * Mk→Y (the last mediator) only; in 91 and 92 W moderates every M→M path of the serial chain.
   * Model 74: the moderator of M→Y is X itself (W ≡ X).
   */
  const FLAGS = {
    1: '000000100', 2: '000000110', 3: '000000111',
    4: '000000000', 5: '000000100', 6: '000000000',
    7: '100000000', 8: '100000100', 9: '110000000', 10: '110000110', 11: '111000000', 12: '111000111', 13: '111000100',
    14: '000100000', 15: '000100100', 16: '000110000', 17: '000110110', 18: '000111000', 19: '000111111', 20: '000111100',
    21: '100010000', 22: '100010100', 28: '100010010', 29: '100010110',
    58: '100100000', 59: '100100100', 60: '110100000', 61: '110100100', 62: '110100010', 63: '110100110',
    64: '100110000', 65: '100110100', 66: '100110010', 67: '100110110', 68: '111100000', 69: '111100111',
    70: '100111000', 71: '100111111', 72: '111111000', 73: '111111111', 74: '000100000', 75: '110110000', 76: '110110110',
    80: '000000000', 81: '000000000', 82: '000000000',
    83: '100000000', 84: '100000000', 85: '100000100', 86: '100000100', 87: '000100000', 88: '000100000',
    89: '000100100', 90: '000100100', 91: '000000000', 92: '100100100'
  };
  const MODELS = Object.keys(FLAGS).map(Number);
  // mediator structure and the allowed number of mediators
  function structure(model) {
    if (model <= 3) return { kind: 'moderation', min: 0, max: 0 };
    if (model === 6 || (model >= 83 && model <= 92)) return { kind: 'serial', min: 2, max: 6 };
    if (model === 80 || model === 81) return { kind: 'model' + model, min: 3, max: 6 };
    if (model === 82) return { kind: 'model82', min: 4, max: 4 };
    if (model === 74) return { kind: 'parallel', min: 1, max: 1 };
    return { kind: 'parallel', min: 1, max: 10 };
  }
  /*
   * The template of a model with k mediators: nodes 0 = X, 1..k = M1..Mk, k+1 = Y; paths {from, to, w, z, wz}.
   */
  function template(model, k) {
    model = +model;
    if (!FLAGS[model]) throw new Error('hayes_model');
    const st = structure(model); if (k === undefined) k = st.min || 0;
    if (k < st.min || k > st.max) throw new Error('hayes_nmed');
    const fl = FLAGS[model].split('').map(Number), Y = k + 1, paths = [];
    const add = (from, to) => { if (!paths.some(p => p.from === from && p.to === to)) paths.push({ from, to, w: false, z: false, wz: false }); };
    if (st.kind === 'moderation') add(0, Y);
    else if (st.kind === 'serial') { for (let j = 1; j <= Y; j++) for (let i = 0; i < j; i++) add(i, j); }
    else {
      for (let i = 1; i <= k; i++) add(0, i);
      if (model === 80) for (let i = 1; i < k; i++) add(i, k);           // M1..Mk−1 → Mk
      if (model === 81) for (let i = 2; i <= k; i++) add(1, i);          // M1 → M2..Mk
      if (model === 82) { add(1, 2); add(3, 4); }                         // M1 → M2, M3 → M4
      for (let i = 1; i <= k; i++) add(i, Y);
      add(0, Y);
    }
    paths.sort((p, q) => p.to - q.to || p.from - q.from);
    paths.forEach(p => {
      let f = null;
      if (p.from === 0 && p.to === Y) f = fl.slice(6, 9);
      else if (p.from === 0) f = (model === 83 || model === 86) && p.to !== 1 ? [0, 0, 0] : fl.slice(0, 3);
      else if (p.to === Y) f = (model === 87 || model === 90) && p.from !== k ? [0, 0, 0] : fl.slice(3, 6);
      else f = (model === 91 || model === 92) ? [1, 0, 0] : [0, 0, 0];
      p.w = !!f[0]; p.z = !!f[1]; p.wz = !!f[2];
    });
    const needW = paths.some(p => p.w || p.wz) && model !== 74, needZ = paths.some(p => p.z || p.wz);
    return { model, k, kind: st.kind, paths, needW, needZ, wIsX: model === 74 };
  }
  /*
   * Symbolic design of each outcome equation. Tokens: X0.. (columns of X; several for a multicategorical X),
   * M0.. (mediators), W, Z, C0.. (covariates). Each term is a list of tokens whose product is the regressor.
   * map[pathIndex][xcol] = coefficient positions (in the coefficient vector, 0 = constant) of the path, of its
   * products with W, Z and W×Z (−1 when absent).
   */
  function design(spec, nx, ncov, covIn) {
    const k = spec.k, Y = k + 1, eqs = [];
    const toks = i => i === 0 ? Array.from({ length: nx }, (_, c) => 'X' + c) : ['M' + (i - 1)];
    const W = spec.wIsX ? 'X0' : 'W';
    for (let j = 1; j <= Y; j++) {
      const into = spec.paths.map((p, q) => [p, q]).filter(([p]) => p.to === j), terms = [], map = {};
      const pos = f => { const key = f.join('*'); let i = terms.findIndex(t => t.join('*') === key); if (i < 0) { terms.push(f); i = terms.length - 1; } return i + 1; };
      into.forEach(([p, q]) => { map[q] = toks(p.from).map(tk => ({ b: pos([tk]), w: -1, z: -1, wz: -1 })); });
      const hasW = into.some(([p]) => p.w || p.wz), hasZ = into.some(([p]) => p.z || p.wz), hasWZ = into.some(([p]) => p.wz);
      if (hasW && !spec.wIsX) pos(['W']);
      if (hasZ) pos(['Z']);
      into.forEach(([p, q]) => toks(p.from).forEach((tk, c) => {
        if (p.w || p.wz) map[q][c].w = pos([tk, W]);
        if (p.z || p.wz) map[q][c].z = pos([tk, 'Z']);
      }));
      if (hasWZ) pos(['W', 'Z']);
      into.forEach(([p, q]) => toks(p.from).forEach((tk, c) => { if (p.wz) map[q][c].wz = pos([tk, W, 'Z']); }));
      const covHere = k === 0 || covIn === 'all' || !covIn || (covIn === 'm' ? j <= k : j === Y);
      if (covHere) for (let c = 0; c < ncov; c++) pos(['C' + c]);
      eqs.push({ node: j, terms, map, cov: covHere });
    }
    return eqs;
  }
  // equations of a model in text form, with role names (X, M1.., W, Z) or real variable names
  function equationsText(model, k, names) {
    const spec = template(model, k), nm = Object.assign({ X: 'X', Y: 'Y', W: 'W', Z: 'Z', M: Array.from({ length: spec.k }, (_, i) => spec.k > 1 ? 'M' + (i + 1) : 'M'), C: [] }, names || {});
    const eqs = design(spec, 1, nm.C.length, names && names.covIn);
    const tn = tk => tk[0] === 'X' ? nm.X : tk[0] === 'M' ? nm.M[+tk.slice(1)] : tk[0] === 'C' ? nm.C[+tk.slice(1)] : nm[tk];
    return eqs.map((e, q) => {
      const out = e.node === spec.k + 1 ? nm.Y : nm.M[e.node - 1];
      return out + ' = i' + (q + 1) + e.terms.map((t, i) => ' + b' + (i + 1) + '·' + t.map(tn).join('×')).join('') + ' + e' + (q + 1);
    });
  }

  // --------------------------------------------------------------- statistics
  // log Γ by the Lanczos approximation with Godfrey's coefficients (g = 607/128; relative error ≈ 1e-15)
  const LG = [0.99999999999999709182, 57.156235665862923517, -59.597960355475491248, 14.136097974741747174, -0.49191381609762019978, 0.33994649984811888699e-4,
    0.46523628927048575665e-4, -0.98374475304879564677e-4, 0.15808870322491248884e-3, -0.21026444172410488319e-3, 0.21743961811521264320e-3,
    -0.16431810653676389022e-3, 0.84418223983852743293e-4, -0.26190838401581408670e-4, 0.36899182659531622704e-5];
  function lgamma(x) {
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1; let a = LG[0]; for (let i = 1; i < 15; i++) a += LG[i] / (x + i);
    const t = x + 607 / 128 + 0.5; return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  function betacf(a, b, x) { // continued fraction of the incomplete beta (Lentz)
    const qab = a + b, qap = a + 1, qam = a - 1, tiny = 1e-300;
    let c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < tiny) d = tiny; d = 1 / d; let h = d;
    for (let m = 1; m <= 500; m++) {
      const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny; c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny; c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny; d = 1 / d;
      const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-16) break;
    }
    return h;
  }
  function ibeta(x, a, b) { // regularised incomplete beta I_x(a, b)
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  const fP = (F, d1, d2) => !(F > 0) ? (isNaN(F) ? NaN : 1) : ibeta(d2 / (d2 + d1 * F), d2 / 2, d1 / 2);
  function incGamma(a, x) { // [P, Q] regularised incomplete gamma, Q computed directly in the upper tail
    if (x <= 0) return [0, 1];
    const lg = -x + a * Math.log(x) - lgamma(a);
    if (x < a + 1) {
      let sum = 1 / a, del = sum, ap = a;
      for (let n = 0; n < 2000; n++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-16) break; }
      const P = sum * Math.exp(lg); return [P, 1 - P];
    }
    let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
    for (let i = 1; i < 2000; i++) {
      const an = -i * (i - a); b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-16) break;
    }
    const Q = Math.exp(lg) * h; return [1 - Q, Q];
  }
  const p2norm = z => isFinite(z) ? incGamma(0.5, z * z / 2)[1] : (isNaN(z) ? NaN : 0); // two-tailed normal p
  const pnorm = z => z >= 0 ? 1 - p2norm(z) / 2 : p2norm(z) / 2;
  function qnorm(p) { let x = E.qnorm(p); if (isFinite(x)) for (let i = 0; i < 2; i++) x -= (pnorm(x) - p) / (Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI)); return x; }
  const pt2 = (t, df) => isFinite(t) ? ibeta(df / (df + t * t), df / 2, 0.5) : (isNaN(t) ? NaN : 0);
  function qt(p, df) { // quantile of Student's t, p > 0.5
    const target = 2 * (1 - p); let lo = 0, hi = 2;
    while (pt2(hi, df) > target) { lo = hi; hi *= 2; if (hi > 1e8) break; }
    for (let i = 0; i < 200 && hi - lo > 1e-14 * hi; i++) { const m = (lo + hi) / 2; if (pt2(m, df) > target) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  // percentile as PROCESS computes it: position p(n + 1) in the sorted data, linear interpolation
  function pctl(sorted, p) {
    const n = sorted.length, pos = p * (n + 1), low = Math.floor(pos), fr = pos - low;
    if (low < 1) return sorted[0]; if (low >= n) return sorted[n - 1];
    return sorted[low - 1] + (sorted[low] - sorted[low - 1]) * fr;
  }

  // Householder QR least squares; cols include the constant. Returns the coefficients and R⁻¹ ((X′X)⁻¹ = R⁻¹R⁻ᵀ).
  function qrls(cols, y) {
    const p = cols.length, n = y.length, A = cols.map(c => Float64Array.from(c)), b = Float64Array.from(y);
    const norm0 = A.map(c => { let s = 0; for (let i = 0; i < n; i++) s += c[i] * c[i]; return Math.sqrt(s); });
    const R = Array.from({ length: p }, () => new Float64Array(p));
    for (let k = 0; k < p; k++) {
      const a = A[k]; let s = 0; for (let i = k; i < n; i++) s += a[i] * a[i];
      const nrm = Math.sqrt(s); if (!(nrm > 1e-9 * norm0[k])) throw new Error('hayes_singular');
      const alpha = a[k] > 0 ? -nrm : nrm, vn = s - a[k] * a[k] + (a[k] - alpha) * (a[k] - alpha); a[k] -= alpha;
      for (let j = k + 1; j < p; j++) { const c = A[j]; let d = 0; for (let i = k; i < n; i++) d += a[i] * c[i]; const f = 2 * d / vn; for (let i = k; i < n; i++) c[i] -= f * a[i]; R[k][j] = c[k]; }
      let d = 0; for (let i = k; i < n; i++) d += a[i] * b[i]; const f = 2 * d / vn; for (let i = k; i < n; i++) b[i] -= f * a[i];
      R[k][k] = alpha;
    }
    const coef = new Float64Array(p);
    for (let k = p - 1; k >= 0; k--) { let s = b[k]; for (let j = k + 1; j < p; j++) s -= R[k][j] * coef[j]; coef[k] = s / R[k][k]; }
    return { coef, R };
  }
  function rinv(R) {
    const p = R.length, U = Array.from({ length: p }, () => new Float64Array(p));
    for (let j = p - 1; j >= 0; j--) { U[j][j] = 1 / R[j][j]; for (let i = j - 1; i >= 0; i--) { let s = 0; for (let m = i + 1; m <= j; m++) s += R[i][m] * U[m][j]; U[i][j] = -s / R[i][i]; } }
    return U;
  }
  /*
   * OLS of y on cols (no constant column; it is added). hc: −1 = OLS, 0–4 = HC0–HC4 (Long & Ervin, 2000;
   * Cribari-Neto, 2004; Hayes & Cai, 2007). full = false returns the coefficients only (bootstrap).
   */
  function ols(cols, y, hc, full, tcrit) {
    const n = y.length, X = [new Float64Array(n).fill(1)].concat(cols), p = X.length;
    const { coef, R } = qrls(X, y);
    if (!full) return { coef };
    const U = rinv(R), XtXi = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (__, j) => { let s = 0; for (let m = Math.max(i, j); m < p; m++) s += U[i][m] * U[j][m]; return s; }));
    const res = new Float64Array(n); let sse = 0, sst = 0; const my = mean(y);
    for (let t = 0; t < n; t++) { let v = 0; for (let q = 0; q < p; q++) v += coef[q] * X[q][t]; res[t] = y[t] - v; sse += res[t] * res[t]; sst += (y[t] - my) * (y[t] - my); }
    const df = n - p, mse = sse / df, r2 = 1 - sse / sst;
    let cov;
    if (!(hc >= 0)) cov = XtXi.map(r => r.map(v => v * mse));
    else {
      const meat = Array.from({ length: p }, () => new Float64Array(p)), xt = new Float64Array(p), u = new Float64Array(p);
      for (let t = 0; t < n; t++) {
        for (let q = 0; q < p; q++) xt[q] = X[q][t];
        for (let i = 0; i < p; i++) { let s = 0; for (let j = 0; j < p; j++) s += XtXi[i][j] * xt[j]; u[i] = s; }
        let h = 0; for (let i = 0; i < p; i++) h += xt[i] * u[i];
        const e2 = res[t] * res[t];
        const om = hc === 2 ? e2 / (1 - h) : hc === 3 ? e2 / ((1 - h) * (1 - h)) : hc === 4 ? e2 / Math.pow(1 - h, Math.min(4, n * h / p)) : e2;
        for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) meat[i][j] += om * xt[i] * xt[j];
      }
      const A = XtXi.map(r => Array.from({ length: p }, (_, j) => { let s = 0; for (let m = 0; m < p; m++) s += r[m] * meat[m][j]; return s; }));
      cov = A.map(r => Array.from({ length: p }, (_, j) => { let s = 0; for (let m = 0; m < p; m++) s += r[m] * XtXi[m][j]; return s; }));
      if (hc === 1) cov = cov.map(r => r.map(v => v * n / df));
    }
    const se = cov.map((r, i) => Math.sqrt(r[i]));
    const tc = tcrit(df);
    const F = p > 1 ? wald(coef, cov, Array.from({ length: p - 1 }, (_, i) => i + 1)) : NaN;
    return { coef, cov, se, df, n, p, sse, sst, r2, mse, tc, F, pF: fP(F, p - 1, df), res };
  }
  function wald(coef, cov, idx) { // F = b′V⁻¹b / q for the coefficients idx
    const b = idx.map(i => coef[i]), V = idx.map(i => idx.map(j => cov[i][j])), Vi = E.inverse(V);
    let s = 0; b.forEach((x, i) => b.forEach((y, j) => { s += x * Vi[i][j] * y; })); return s / idx.length;
  }

  // ---------------------------------------------------------------- variables
  function getter(ds, model, settings) {
    let rep = null;
    return nm => {
      if (nm.startsWith('LV: ')) {
        if (!rep) rep = E.runPLS(ds, model, settings);
        const j = rep.constructs.indexOf(nm.slice(4)); if (j < 0) throw new Error('hayes_vars');
        const col = new Float64Array(ds.n).fill(NaN); rep.rows.forEach((r, t) => { col[r] = rep.scores[j][t]; }); return col;
      }
      const j = ds.names.indexOf(nm); if (j < 0) throw new Error('hayes_vars'); return ds.cols[j];
    };
  }
  const CODINGS = ['indicator', 'sequential', 'helmert', 'effect'];
  // g × (g−1) code matrix for g ordered groups (PROCESS mcx = 1..4)
  function codeMatrix(g, scheme) {
    const M = Array.from({ length: g }, () => new Array(g - 1).fill(0));
    for (let i = 1; i < g; i++) {
      if (scheme === 'indicator') M[i][i - 1] = 1;
      else if (scheme === 'sequential') for (let j = 0; j < i; j++) M[i][j] = 1;
      else if (scheme === 'effect') M[i][i - 1] = 1;
    }
    if (scheme === 'effect') M[0].fill(-1);
    if (scheme === 'helmert') for (let j = 0; j < g - 1; j++) { M[j][j] = -(g - 1 - j) / (g - j); for (let i = j + 1; i < g; i++) M[i][j] = 1 / (g - j); }
    return M;
  }
  const isDich = v => { const s = new Set(v); return s.size === 2; };
  // probe values: 16th/50th/84th percentiles or mean ± 1 SD (clipped to the range); the two values of a dichotomy
  function probeValues(v, how) {
    const s = Array.from(v).sort((a, b) => a - b), lo = s[0], hi = s[s.length - 1];
    if (isDich(v)) return { values: [lo, hi], dich: true, min: lo, max: hi, mean: mean(v), sd: sd(v) };
    const m = mean(v), d = sd(v, m);
    if (how === 'moments') return { values: [Math.max(lo, m - d), m, Math.min(hi, m + d)], min: lo, max: hi, mean: m, sd: d, clipped: m - d < lo || m + d > hi };
    return { values: [0.16, 0.5, 0.84].map(p => pctl(s, p)), min: lo, max: hi, mean: m, sd: d };
  }

  // -------------------------------------------------------------- polynomials
  // effects as polynomials in W and Z: Map "i,j" → coefficient of WⁱZʲ
  function pmul(a, b) {
    const out = new Map();
    a.forEach((x, ka) => b.forEach((y, kb) => { const [i, j] = ka.split(',').map(Number), [u, v] = kb.split(',').map(Number), key = (i + u) + ',' + (j + v); out.set(key, (out.get(key) || 0) + x * y); }));
    return out;
  }

  // ------------------------------------------------------------------- engine
  function hayes(ds, model, settings, opts, progress) {
    opts = Object.assign({ hmodel: 4, m: [], cov: [], covIn: 'all', center: 'none', hc: -1, boot: 5000, seed: 1, conf: 95, bootci: 'percentile', probe: 'percentiles', jn: true, total: false, effsize: false, contrast: 0, sobel: false, condContrast: false, mcx: '' }, opts || {});
    const pm = +opts.hmodel, M = (opts.m || []).filter(Boolean), COV = (opts.cov || []).filter(Boolean);
    if (!FLAGS[pm]) throw new Error('hayes_model');
    if (!opts.x || !opts.y) throw new Error('hayes_vars');
    const st = structure(pm);
    if (M.length < st.min || M.length > st.max) throw new Error('hayes_nmed');
    const spec = template(pm, M.length), k = spec.k, Yn = k + 1;
    if ((spec.needW && !opts.w) || (spec.needZ && !opts.z)) throw new Error('hayes_mods');
    const W = spec.needW ? opts.w : null, Z = spec.needZ ? opts.z : null;
    const roles = [opts.x, opts.y].concat(M, W ? [W] : [], Z ? [Z] : []);
    if (new Set(roles).size !== roles.length || COV.some(c => roles.includes(c))) throw new Error('hayes_dup');
    const mcx = CODINGS.includes(opts.mcx) ? opts.mcx : '';
    if (mcx && pm === 74) throw new Error('hayes_mcx74');
    const hc = opts.hc === '' || opts.hc === null || opts.hc === undefined || +opts.hc < 0 ? -1 : +opts.hc;
    const conf = Math.min(99.9, Math.max(50, +opts.conf || 95)), alpha = 1 - conf / 100;
    const tcrit = df => qt(1 - alpha / 2, df);

    // data (listwise deletion)
    const get = getter(ds, model, settings), names = roles.concat(COV), raw = names.map(get), rows = [];
    for (let t = 0; t < ds.n; t++) if (raw.every(c => !isNaN(c[t]))) rows.push(t);
    const n = rows.length; if (n < 10) throw new Error('hayes_n');
    const col = q => Float64Array.from(rows, t => raw[q][t]);
    const xraw = col(0), y = col(1), mraw = M.map((_, i) => col(2 + i));
    let wraw = W ? col(2 + k) : null, zraw = Z ? col(2 + k + (W ? 1 : 0)) : null;
    const covs = COV.map((_, i) => col(roles.length + i));

    // X: one column, or g − 1 codes of a multicategorical X
    let xcols, xcoding = null;
    if (mcx) {
      const levels = Array.from(new Set(xraw)).sort((a, b) => a - b), g = levels.length;
      if (g < 3 || g > 9 || levels.some(l => xraw.filter(v => v === l).length < 2)) throw new Error('hayes_mcx');
      const C = codeMatrix(g, mcx); xcols = C[0].map((_, j) => Float64Array.from(xraw, v => C[levels.indexOf(v)][j]));
      xcoding = { scheme: mcx, levels, codes: C, labels: C[0].map((_, j) => 'D' + (j + 1)), counts: levels.map(l => xraw.filter(v => v === l).length) };
    } else xcols = [xraw];
    const nx = xcols.length;

    // mean centring of the variables that form products (PROCESS center = 1 all, 2 continuous only)
    const inProd = new Set();
    spec.paths.forEach(p => { if (p.w || p.wz || p.z) { inProd.add(p.from === 0 ? 'X' : 'M' + (p.from - 1)); if (p.w || p.wz) inProd.add(spec.wIsX ? 'X' : 'W'); if (p.z || p.wz) inProd.add('Z'); } });
    const centered = [];
    const cen = (key, v, label, dichOK) => {
      if (opts.center === 'none' || !opts.center || !inProd.has(key)) return v;
      if (opts.center === 'cont' && !dichOK && isDich(v)) return v;
      const m = mean(v); centered.push(label); return Float64Array.from(v, x => x - m);
    };
    if (!mcx) xcols = [cen('X', xraw, opts.x)];
    const mcols = mraw.map((v, i) => cen('M' + i, v, M[i], true));
    const wcol = W ? cen('W', wraw, W) : null, zcol = Z ? cen('Z', zraw, Z) : null;
    const probes = {};
    if (W) probes.W = probeValues(wcol, opts.probe);
    if (spec.wIsX) probes.W = probeValues(xcols[0], opts.probe);
    if (Z) probes.Z = probeValues(zcol, opts.probe);
    const wName = spec.wIsX ? opts.x : W;

    // design matrices
    const eqs = design(spec, nx, COV.length, opts.covIn);
    const tokCol = tk => tk[0] === 'X' ? xcols[+tk.slice(1)] : tk[0] === 'M' ? mcols[+tk.slice(1)] : tk === 'W' ? wcol : tk === 'Z' ? zcol : covs[+tk.slice(1)];
    const xlab = c => mcx ? xcoding.labels[c] : opts.x;
    const tokName = tk => tk[0] === 'X' ? xlab(+tk.slice(1)) : tk[0] === 'M' ? M[+tk.slice(1)] : tk === 'W' ? W : tk === 'Z' ? Z : COV[+tk.slice(1)];
    const outName = j => j === Yn ? opts.y : M[j - 1], outCol = j => j === Yn ? y : mcols[j - 1];
    eqs.forEach(e => {
      e.cols = e.terms.map(tm => { const v = new Float64Array(n).fill(1); tm.forEach(tk => { const c = tokCol(tk); for (let t = 0; t < n; t++) v[t] *= c[t]; }); return v; });
      e.names = ['constant'].concat(e.terms.map(tm => tm.map(tokName).join(' × ')));
      e.y = outCol(e.node);
    });
    const fits = eqs.map(e => ols(e.cols, e.y, hc, true, tcrit));

    // ------------------------------------------------------------ effects
    const pathPoly = (B, q, c) => { // conditional coefficient of path q (x column c) as a polynomial in W, Z
      const e = eqs.findIndex(x => x.node === spec.paths[q].to), mp = eqs[e].map[q][c], P = new Map([['0,0', B[e][mp.b]]]);
      if (mp.w > 0) P.set('1,0', B[e][mp.w]); if (mp.z > 0) P.set('0,1', B[e][mp.z]); if (mp.wz > 0) P.set('1,1', B[e][mp.wz]);
      return P;
    };
    const evalPoly = (P, w, z) => { let s = 0; P.forEach((v, key) => { const [i, j] = key.split(',').map(Number); s += v * Math.pow(w, i) * Math.pow(z, j); }); return s; };
    // chains X → … → Y through at least one mediator, in PROCESS order (depth first)
    const chains = [];
    (function dfs(node, list) {
      spec.paths.forEach((p, q) => { if (p.from !== node) return; if (p.to === Yn) { if (list.length) chains.push(list.concat([q])); } else dfs(p.to, list.concat([q])); });
    })(0, []);
    // PROCESS order: by first mediator, then shorter chains first, then by the mediators' order
    const nodesOf = ch => ch.map(q => spec.paths[q].to);
    chains.sort((a, b) => { const na = nodesOf(a), nb = nodesOf(b); if (na[0] !== nb[0]) return na[0] - nb[0]; if (na.length !== nb.length) return na.length - nb.length; for (let i = 0; i < na.length; i++) if (na[i] !== nb[i]) return na[i] - nb[i]; return 0; });
    const chainLabel = (ch, c) => [xlab(c)].concat(ch.map(q => outName(spec.paths[q].to))).join(' → ');
    const ones = new Map([['0,0', 1]]);
    const structPoly = ch => ch.reduce((P, q) => { const p = spec.paths[q], S = new Map([['0,0', 1]]); if (p.w || p.wz) S.set('1,0', 1); if (p.z || p.wz) S.set('0,1', 1); if (p.wz) S.set('1,1', 1); return pmul(P, S); }, ones);
    const chainPoly = (B, ch, c) => ch.reduce((P, q, i) => pmul(P, pathPoly(B, q, i === 0 ? c : 0)), ones);
    const degs = P => { let dw = 0, dz = 0; P.forEach((_, key) => { const [i, j] = key.split(',').map(Number); dw = Math.max(dw, i); dz = Math.max(dz, j); }); return [dw, dz]; };
    const wv = probes.W ? probes.W.values : [0], zv = probes.Z ? probes.Z.values : [0];
    const grid = (useW, useZ) => { const g = []; (useW ? wv : [null]).forEach(w => (useZ ? zv : [null]).forEach(z => g.push({ w, z }))); return g; };
    const bootQ = []; // bootstrapped estimands: { fn(B, ctx) }
    const reg = fn => { bootQ.push(fn); return bootQ.length - 1; };
    const sdOf = v => sd(v);
    const indirect = [], indices = [], condContrasts = [];
    chains.forEach(ch => {
      const S = structPoly(ch), [dw, dz] = degs(S);
      for (let c = 0; c < nx; c++) {
        const label = chainLabel(ch, c), g = grid(dw > 0, dz > 0);
        const rowsI = g.map(pt => ({ w: pt.w, z: pt.z, q: reg(B => evalPoly(chainPoly(B, ch, c), pt.w || 0, pt.z || 0)) }));
        indirect.push({ label, xcol: c, chain: ch, mods: [dw > 0 ? 'W' : null, dz > 0 ? 'Z' : null].filter(Boolean), rows: rowsI });
        // indices: the indirect effect is linear in each moderator (no W² or Z² terms)
        const coefOf = (B, key) => chainPoly(B, ch, c).get(key) || 0;
        if (dw <= 1 && dz <= 1 && (dw || dz)) {
          if (dw && !dz) indices.push({ label, type: 'imm', mod: 'W', q: reg(B => coefOf(B, '1,0')) });
          else if (dz && !dw) indices.push({ label, type: 'imm', mod: 'Z', q: reg(B => coefOf(B, '0,1')) });
          else if (!S.has('1,1')) { indices.push({ label, type: 'pmm', mod: 'W', q: reg(B => coefOf(B, '1,0')) }); indices.push({ label, type: 'pmm', mod: 'Z', q: reg(B => coefOf(B, '0,1')) }); }
          else {
            zv.forEach((z, i) => indices.push({ label, type: 'cmm', mod: 'W', at: 'Z', atIndex: i, atValue: z, q: reg(B => coefOf(B, '1,0') + coefOf(B, '1,1') * z) }));
            wv.forEach((w, i) => indices.push({ label, type: 'cmm', mod: 'Z', at: 'W', atIndex: i, atValue: w, q: reg(B => coefOf(B, '0,1') + coefOf(B, '1,1') * w) }));
            indices.push({ label, type: 'mmm', mod: 'WZ', q: reg(B => coefOf(B, '1,1')) });
          }
        }
        // pairwise contrasts of conditional indirect effects (one moderator)
        if (opts.condContrast && (dw > 0) !== (dz > 0)) {
          const vals = dw > 0 ? wv : zv, P = dw > 0 ? (B, v) => evalPoly(chainPoly(B, ch, c), v, 0) : (B, v) => evalPoly(chainPoly(B, ch, c), 0, v);
          for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++) condContrasts.push({ label, mod: dw > 0 ? 'W' : 'Z', v1: vals[j], v2: vals[i], q: reg(B => P(B, vals[j]) - P(B, vals[i])) });
        }
      }
    });
    const moderated = spec.needW || spec.needZ || spec.wIsX;
    const yeq = eqs.findIndex(e => e.node === Yn), qXY = spec.paths.findIndex(p => p.from === 0 && p.to === Yn);
    // unmoderated mediation: total indirect, contrasts, effect sizes
    let totalIndirect = null, contrasts = null, std = null;
    if (!moderated && chains.length) {
      totalIndirect = xcols.map((_, c) => ({ label: xlab(c), xcol: c, q: reg(B => chains.reduce((s, ch) => s + evalPoly(chainPoly(B, ch, c), 0, 0), 0)) }));
      if (+opts.contrast && chains.length > 1) {
        contrasts = [];
        for (let c = 0; c < nx; c++) for (let i = 0; i < chains.length; i++) for (let j = i + 1; j < chains.length; j++) {
          const f = B => { const a = evalPoly(chainPoly(B, chains[i], c), 0, 0), b = evalPoly(chainPoly(B, chains[j], c), 0, 0); return +opts.contrast === 2 ? Math.abs(a) - Math.abs(b) : a - b; };
          contrasts.push({ a: chainLabel(chains[i], c), b: chainLabel(chains[j], c), type: +opts.contrast, q: reg(f) });
        }
      }
      if (opts.effsize) {
        std = [];
        const items = [];
        for (let c = 0; c < nx; c++) { chains.forEach(ch => items.push({ label: chainLabel(ch, c), f: B => evalPoly(chainPoly(B, ch, c), 0, 0) })); if (chains.length > 1) items.push({ label: 'total|' + xlab(c), total: true, f: B => chains.reduce((s, ch) => s + evalPoly(chainPoly(B, ch, c), 0, 0), 0) }); }
        items.forEach(it => std.push({ label: it.label, total: !!it.total, partial: reg((B, ctx) => it.f(B) / ctx.sdY), complete: mcx ? null : reg((B, ctx) => it.f(B) * ctx.sdX / ctx.sdY) }));
      }
    }

    // full-sample values
    const Bfull = fits.map(f => f.coef), ctxFull = { sdY: sdOf(y), sdX: sdOf(xraw) };
    const est = bootQ.map(fn => fn(Bfull, ctxFull));

    // bootstrap
    const B = Math.max(0, Math.floor(+opts.boot || 0)), draws = bootQ.map(() => new Float64Array(B));
    let replaced = 0;
    if (B > 0 && bootQ.length) {
      const rand = rng(+opts.seed || 0), idx = new Int32Array(n), tmp = eqs.map(e => e.cols.map(() => new Float64Array(n))), yt = eqs.map(() => new Float64Array(n));
      const yb = new Float64Array(n), xb = new Float64Array(n);
      for (let b = 0; b < B; b++) {
        let ok = false, tries = 0;
        while (!ok && tries < 100) {
          for (let t = 0; t < n; t++) idx[t] = Math.floor(rand() * n);
          try {
            const Bb = eqs.map((e, q) => { e.cols.forEach((c, j) => { const d = tmp[q][j]; for (let t = 0; t < n; t++) d[t] = c[idx[t]]; }); const d = yt[q]; for (let t = 0; t < n; t++) d[t] = e.y[idx[t]]; return ols(tmp[q], d, -1, false).coef; });
            for (let t = 0; t < n; t++) { yb[t] = y[idx[t]]; xb[t] = xraw[idx[t]]; }
            const ctx = { sdY: sdOf(yb), sdX: sdOf(xb) };
            bootQ.forEach((fn, q) => { draws[q][b] = fn(Bb, ctx); });
            ok = true;
          } catch (e) { tries++; replaced++; }
        }
        if (!ok) throw new Error('hayes_singular');
        if (progress && b % 100 === 0) progress(b / B);
      }
    }
    const zlo = qnorm(alpha / 2), zhi = qnorm(1 - alpha / 2);
    const summ = q => {
      const out = { effect: est[q], se: NaN, lo: NaN, hi: NaN };
      if (!B) return out;
      const d = Array.from(draws[q]).sort((a, b) => a - b);
      out.se = sd(d);
      if (opts.bootci === 'bc') {
        let below = 0; d.forEach(v => { if (v < est[q]) below++; });
        const z0 = qnorm(Math.min(1 - 1 / (2 * B), Math.max(1 / (2 * B), below / B)));
        out.lo = quantile(d, pnorm(2 * z0 + zlo)); out.hi = quantile(d, pnorm(2 * z0 + zhi));
      } else { out.lo = quantile(d, alpha / 2); out.hi = quantile(d, 1 - alpha / 2); }
      return out;
    };

    // equations output
    const equations = eqs.map((e, q) => {
      const f = fits[q];
      const terms = e.names.map((nm, i) => { const t = f.coef[i] / f.se[i]; return { name: nm, b: f.coef[i], se: f.se[i], t, p: pt2(t, f.df), lo: f.coef[i] - f.tc * f.se[i], hi: f.coef[i] + f.tc * f.se[i] }; });
      // highest-order unconditional interactions: per moderated path, the X×W×Z product, or X×W and X×Z (and both jointly)
      const tests = [];
      const reduced = idx => { const keep = e.cols.filter((_, j) => !idx.includes(j + 1)); return 1 - ols(keep, e.y, -1, true, tcrit).sse / f.sst; };
      const addTest = (label, idx) => { const F = wald(f.coef, f.cov, idx); tests.push({ label, R2chg: f.r2 - reduced(idx), F, df1: idx.length, df2: f.df, p: fP(F, idx.length, f.df) }); };
      Object.keys(e.map).forEach(qs => {
        const mp = e.map[qs], p = spec.paths[+qs];
        if (p.wz) addTest(e.names[mp[0].wz] + (nx > 1 ? ' …' : ''), mp.map(m => m.wz));
        else {
          if (p.w) addTest(mp.map(m => e.names[m.w]).join(', '), mp.map(m => m.w));
          if (p.z) addTest(mp.map(m => e.names[m.z]).join(', '), mp.map(m => m.z));
        }
      });
      // a path moderated additively by W and Z: joint test of both products (PROCESS "BOTH")
      Object.keys(e.map).forEach(qs => { const p = spec.paths[+qs], mp = e.map[qs]; if (p.w && p.z && !p.wz) addTest('both|' + mp.map(m => e.names[m.w] + ', ' + e.names[m.z]).join(', '), mp.flatMap(m => [m.w, m.z])); });
      return { outcome: outName(e.node), node: e.node, summary: { R: Math.sqrt(Math.max(0, f.r2)), R2: f.r2, MSE: f.mse, F: f.F, df1: f.p - 1, df2: f.df, p: f.pF }, terms, tests };
    });
    // conditional effect of a path (x column c) at (w, z) with its standard error
    const condPath = (q, c, w, z) => {
      const e = eqs.findIndex(x => x.node === spec.paths[q].to), mp = eqs[e].map[q][c], f = fits[e], g = new Map([[mp.b, 1]]);
      if (mp.w > 0) g.set(mp.w, w); if (mp.z > 0) g.set(mp.z, z); if (mp.wz > 0) g.set(mp.wz, w * z);
      let v = 0, s2 = 0; g.forEach((a, i) => { v += a * f.coef[i]; g.forEach((b2, j) => { s2 += a * b2 * f.cov[i][j]; }); });
      const se = Math.sqrt(s2), t = v / se;
      return { effect: v, se, t, p: pt2(t, f.df), lo: v - f.tc * se, hi: v + f.tc * se, df: f.df };
    };
    const pXY = spec.paths[qXY], dW = pXY.w || pXY.wz, dZ = pXY.z || pXY.wz;
    const direct = { label: opts.x + ' → ' + opts.y, mods: [dW ? 'W' : null, dZ ? 'Z' : null].filter(Boolean), rows: [] };
    for (let c = 0; c < nx; c++) grid(dW, dZ).forEach(pt => direct.rows.push(Object.assign({ xcol: c, x: xlab(c), w: pt.w, z: pt.z }, condPath(qXY, c, pt.w || 0, pt.z || 0))));
    if (nx > 1) { // omnibus test of X (all codes) in the Y equation, at W = Z = 0
      const mp = eqs[yeq].map[qXY], F = wald(fits[yeq].coef, fits[yeq].cov, mp.map(m => m.b));
      direct.omnibus = { F, df1: nx, df2: fits[yeq].df, p: fP(F, nx, fits[yeq].df) };
    }
    // conditional two-way interaction at values of Z for a three-way moderated X→Y path (model 3 and others)
    let condInt = null;
    if (pXY.wz && nx === 1) {
      const mp = eqs[yeq].map[qXY][0], f = fits[yeq];
      condInt = { label: opts.x + ' × ' + wName, rows: zv.map(z => { const v = f.coef[mp.w] + f.coef[mp.wz] * z, se = Math.sqrt(f.cov[mp.w][mp.w] + 2 * z * f.cov[mp.w][mp.wz] + z * z * f.cov[mp.wz][mp.wz]), t = v / se; const F = t * t; return { z, effect: v, se, t, F, df1: 1, df2: f.df, p: pt2(t, f.df), lo: v - f.tc * se, hi: v + f.tc * se }; }) };
    }
    // Johnson–Neyman: θ(m) = b₁ + b₃m is significant where θ(m)² ≥ t²crit·var(θ(m))
    let jn = null;
    const jnFor = (i1, i3, f, mod, values, label, target) => {
      const tc = f.tc, b1 = f.coef[i1], b3 = f.coef[i3], v11 = f.cov[i1][i1], v13 = f.cov[i1][i3], v33 = f.cov[i3][i3];
      const a = b3 * b3 - tc * tc * v33, bq = 2 * (b1 * b3 - tc * tc * v13), cq = b1 * b1 - tc * tc * v11, disc = bq * bq - 4 * a * cq;
      const lo = Math.min(...values), hi = Math.max(...values), roots = [];
      if (disc >= 0 && a !== 0) [(-bq - Math.sqrt(disc)) / (2 * a), (-bq + Math.sqrt(disc)) / (2 * a)].sort((u, v) => u - v).forEach(r => { if (r >= lo && r <= hi) roots.push(r); });
      const at = m => { const v = b1 + b3 * m, se = Math.sqrt(v11 + 2 * m * v13 + m * m * v33), t = v / se; return { m, effect: v, se, t, p: pt2(t, f.df), lo: v - tc * se, hi: v + tc * se }; };
      const pts = Array.from({ length: 21 }, (_, i) => lo + (hi - lo) * i / 20).concat(roots).sort((u, v) => u - v);
      return { target, label, mod, range: [lo, hi], points: roots.map(r => ({ value: r, below: 100 * values.filter(v => v < r).length / values.length, above: 100 * values.filter(v => v > r).length / values.length })), rows: pts.map(at), roots: roots.length, allRoots: disc >= 0 && a !== 0 ? [(-bq - Math.sqrt(disc)) / (2 * a), (-bq + Math.sqrt(disc)) / (2 * a)] : [] };
    };
    if (opts.jn && nx === 1) {
      const mp = eqs[yeq].map[qXY][0], f = fits[yeq];
      if (!pXY.wz && pXY.w !== pXY.z) {
        const isW = pXY.w, mv = isW ? (spec.wIsX ? xcols[0] : wcol) : zcol;
        if (!isDich(mv)) jn = jnFor(mp.b, isW ? mp.w : mp.z, f, isW ? wName : Z, Array.from(mv), opts.x + ' → ' + opts.y, 'direct');
      } else if (pXY.wz && !isDich(zcol)) jn = jnFor(mp.w, mp.wz, f, Z, Array.from(zcol), opts.x + ' × ' + wName, 'interaction');
    }
    // total effect model (unmoderated mediation models) and Sobel tests (model 4)
    let totalModel = null, totalEffect = null, sobel = null;
    if (!moderated && k > 0) {
      const covInY = eqs[yeq].cov ? covs : [], tcols = xcols.concat(covInY), tf = ols(tcols, y, hc, true, tcrit);
      const tnames = ['constant'].concat(xcols.map((_, c) => xlab(c)), eqs[yeq].cov ? COV : []);
      totalEffect = xcols.map((_, c) => { const v = tf.coef[1 + c], se = tf.se[1 + c], t = v / se; return { x: xlab(c), effect: v, se, t, p: pt2(t, tf.df), lo: v - tf.tc * se, hi: v + tf.tc * se }; });
      if (opts.total) {
        totalModel = { outcome: opts.y, summary: { R: Math.sqrt(tf.r2), R2: tf.r2, MSE: tf.mse, F: tf.F, df1: tf.p - 1, df2: tf.df, p: tf.pF }, terms: tnames.map((nm, i) => { const t = tf.coef[i] / tf.se[i]; return { name: nm, b: tf.coef[i], se: tf.se[i], t, p: pt2(t, tf.df), lo: tf.coef[i] - tf.tc * tf.se[i], hi: tf.coef[i] + tf.tc * tf.se[i] }; }), tests: [] };
        if (nx > 1) { const F = wald(tf.coef, tf.cov, xcols.map((_, c) => 1 + c)); totalModel.omnibus = { F, df1: nx, df2: tf.df, p: fP(F, nx, tf.df) }; }
      }
      if (std) { const sY = ctxFull.sdY, sX = ctxFull.sdX; totalEffect.forEach(te => { te.partial = te.effect / sY; te.complete = mcx ? NaN : te.effect * sX / sY; }); direct.rows.forEach(r => { r.partial = r.effect / sY; r.complete = mcx ? NaN : r.effect * sX / sY; }); }
      if (opts.sobel && pm === 4 && nx === 1) {
        sobel = M.map((_, i) => {
          const qa = spec.paths.findIndex(p => p.from === 0 && p.to === i + 1), qb = spec.paths.findIndex(p => p.from === i + 1 && p.to === Yn);
          const ea = eqs.findIndex(e => e.node === i + 1), ia = eqs[ea].map[qa][0].b, ib = eqs[yeq].map[qb][0].b;
          const a = fits[ea].coef[ia], sa = fits[ea].se[ia], b = fits[yeq].coef[ib], sb = fits[yeq].se[ib], se = Math.sqrt(a * a * sb * sb + b * b * sa * sa), z = a * b / se;
          return { label: opts.x + ' → ' + M[i] + ' → ' + opts.y, effect: a * b, se, z, p: p2norm(z) };
        });
      }
    }
    // simple slopes plot: the moderated X→Y path, else the first moderated path
    let plot = null;
    {
      const qf = (pXY.w || pXY.z || pXY.wz) ? qXY : spec.paths.findIndex(p => p.w || p.z || p.wz);
      if (qf >= 0 && nx === 1) {
        const p = spec.paths[qf], e = eqs.findIndex(x => x.node === p.to), eq = eqs[e], f = fits[e];
        const ftok = p.from === 0 ? 'X0' : 'M' + (p.from - 1), fcol = tokCol(ftok), fp = probeValues(fcol, opts.probe);
        const fvals = fp.dich ? fp.values : [fp.min, fp.max];
        const means = {}; const tmean = tk => { if (!(tk in means)) means[tk] = mean(tokCol(tk)); return means[tk]; };
        const lines = [];
        grid(p.w || p.wz, p.z || p.wz).forEach(pt => {
          const val = (tk, fv) => tk === ftok ? fv : (tk === 'W' || (spec.wIsX && tk === 'X0' && ftok !== 'X0')) && pt.w !== null ? pt.w : tk === 'Z' && pt.z !== null ? pt.z : tmean(tk);
          lines.push({ w: pt.w, z: pt.z, points: fvals.map(fv => [fv, f.coef[0] + eq.terms.reduce((s, tm, i) => s + f.coef[i + 1] * tm.reduce((pr, tk) => pr * val(tk, fv), 1), 0)]) });
        });
        plot = { focal: tokName(ftok), outcome: outName(p.to), w: (p.w || p.wz) ? wName : null, z: (p.z || p.wz) ? Z : null, lines };
      }
    }
    const S = q => summ(q);
    return {
      kind: 'hayes', model: pm, n, k, x: opts.x, y: opts.y, m: M, w: wName, z: Z, cov: COV, covIn: opts.covIn,
      structure: spec.kind, paths: spec.paths.map(p => ({ from: p.from === 0 ? opts.x : M[p.from - 1], to: p.to === Yn ? opts.y : M[p.to - 1], w: p.w || p.wz, z: p.z || p.wz, wz: p.wz, fromNode: p.from, toNode: p.to })),
      equationsText: equationsText(pm, k, { X: opts.x, Y: opts.y, W: wName || 'W', Z: Z || 'Z', M: M, C: COV, covIn: opts.covIn }),
      options: { center: opts.center || 'none', hc, boot: B, seed: +opts.seed || 0, conf, bootci: opts.bootci, probe: opts.probe, contrast: +opts.contrast || 0 },
      centered, xcoding, probes, bootReplaced: replaced,
      equations, totalModel, direct, condInt, jn, totalEffect,
      indirect: indirect.map(r => Object.assign({}, r, { chain: undefined, rows: r.rows.map(x => Object.assign({ w: x.w, z: x.z }, S(x.q))) })),
      totalIndirect: totalIndirect && totalIndirect.map(r => Object.assign({ label: r.label }, S(r.q))),
      indices: indices.map(r => Object.assign({ label: r.label, type: r.type, mod: r.mod, at: r.at || null, atIndex: r.atIndex, atValue: r.atValue }, S(r.q))),
      contrasts: contrasts && contrasts.map(r => Object.assign({ a: r.a, b: r.b, type: r.type }, S(r.q))),
      condContrasts: condContrasts.map(r => Object.assign({ label: r.label, mod: r.mod, v1: r.v1, v2: r.v2 }, S(r.q))),
      std: std && std.map(r => ({ label: r.label, total: r.total, partial: S(r.partial), complete: r.complete === null ? null : S(r.complete) })),
      sobel, plot, sdY: ctxFull.sdY, sdX: ctxFull.sdX
    };
  }

  E.tasks.hayes = hayes;
  Object.assign(E, { hayes, hayesTemplate: template, hayesDesign: design, hayesEquations: equationsText, hayesModels: MODELS, hayesStructure: structure, hayesFlags: FLAGS, hayesCodes: codeMatrix, hayesQt: qt, hayesOLS: ols });
  if (typeof module !== 'undefined' && module.exports) module.exports = E;
})(typeof self !== 'undefined' ? self : this);
