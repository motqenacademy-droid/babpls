/*
 * BabPls advanced analyses II: GSCA, logistic regression, CVPAT, bootstrap-based multigroup tests
 * (PLS-MGA, parametric, Welch-Satterthwaite) and sample-size planning. Load after engine.js and advanced.js.
 */
(function (root) {
  'use strict';
  const E = (typeof module !== 'undefined' && module.exports) ? require('./advanced.js') : root.YPEngine;
  const { mean, sd, quantile, inverse, solve, zeros, dot, rng, qnorm, pnorm, tTwoTailedP, olsFit, standardize, r2From } = E;
  const tOneSided = (t, df) => { const two = tTwoTailedP(Math.abs(t), df); return t > 0 ? two / 2 : 1 - two / 2; };

  // variables for the regression-type analyses: data columns or construct scores ("LV: name")
  function varGetter(ds, model, settings) {
    let rep = null;
    return nm => {
      if (nm.startsWith('LV: ')) {
        if (!rep) rep = E.runPLS(ds, model, settings);
        const j = rep.constructs.indexOf(nm.slice(4)); if (j < 0) throw new Error('process_vars');
        const col = new Float64Array(ds.n).fill(NaN); rep.rows.forEach((r, t) => { col[r] = rep.scores[j][t]; }); return col;
      }
      const j = ds.names.indexOf(nm); if (j < 0) throw new Error('process_vars'); return ds.cols[j];
    };
  }

  // ------------------------------------------------------------------- GSCA
  /*
   * Generalized structured component analysis (Hwang & Takane, 2004): minimise
   *   SS(ZV − ZWA) = Σ_reflective ||z_k − c_k γ_j||² + Σ_endogenous ||γ_j − Σ b_ji γ_i||²  (+ constant terms)
   * by alternating least squares over the weights W and the loadings/paths A; components have unit variance.
   */
  function gscaFit(raw, spec, init, maxIter, tol) {
    const Z = raw.map(standardize), n = Z[0].length, n1 = n - 1, J = spec.J, lv = spec.lv;
    let w = init ? init.map(a => a.slice()) : lv.map(l => l.idx.map(() => 1));
    const G = new Array(J);
    const comp = j => { const y = new Float64Array(n); lv[j].idx.forEach((k, q) => { const z = Z[k], c = w[j][q]; for (let t = 0; t < n; t++) y[t] += c * z[t]; }); return y; };
    const norm = j => { let y = comp(j); const s = Math.sqrt(dot(y, y) / n1) || 1; w[j] = w[j].map(v => v / s); for (let t = 0; t < n; t++) y[t] /= s;
      // sign: component positively related to the sum of its indicators
      let c = 0; lv[j].idx.forEach(k => { c += dot(Z[k], y); }); if (c < 0) { w[j] = w[j].map(v => -v); for (let t = 0; t < n; t++) y[t] = -y[t]; }
      G[j] = y; };
    for (let j = 0; j < J; j++) norm(j);
    const blockInv = lv.map(l => { const R = l.idx.map(a => l.idx.map(b => dot(Z[a], Z[b]))); try { return inverse(R); } catch (e) { return null; } });
    let C, B, f = Infinity, it = 0, trace = [];
    const estimateA = () => {
      C = lv.map((l, j) => (l.mode === 'A' ? l.idx.map(k => dot(Z[k], G[j]) / n1) : l.idx.map(() => 0)));
      B = zeros(J, J);
      for (let j = 0; j < J; j++) { const P = spec.pred[j]; if (!P.length) continue; const R = P.map(a => P.map(b => dot(G[a], G[b]) / n1)), r = P.map(a => dot(G[a], G[j]) / n1); const b = solve(R, r); P.forEach((i, q) => { B[j][i] = b[q]; }); }
    };
    const criterion = () => {
      let s = 0;
      lv.forEach((l, j) => { if (l.mode !== 'A') return; l.idx.forEach((k, q) => { const c = C[j][q]; for (let t = 0; t < n; t++) { const e = Z[k][t] - c * G[j][t]; s += e * e; } }); });
      for (let j = 0; j < J; j++) { const P = spec.pred[j]; if (!P.length) continue; for (let t = 0; t < n; t++) { let e = G[j][t]; P.forEach(i => { e -= B[j][i] * G[i][t]; }); s += e * e; } }
      return s;
    };
    estimateA();
    for (it = 1; it <= maxIter; it++) {
      for (let j = 0; j < J; j++) {
        if (!blockInv[j]) continue;
        const terms = []; // { y: target vector, a: coefficient of γ_j }
        if (lv[j].mode === 'A') lv[j].idx.forEach((k, q) => terms.push({ y: Z[k], a: C[j][q] }));
        if (spec.pred[j].length) { const y = new Float64Array(n); spec.pred[j].forEach(i => { for (let t = 0; t < n; t++) y[t] += B[j][i] * G[i][t]; }); terms.push({ y, a: 1 }); }
        spec.succ[j].forEach(l => { const y = Float64Array.from(G[l]); spec.pred[l].forEach(i => { if (i !== j) for (let t = 0; t < n; t++) y[t] -= B[l][i] * G[i][t]; }); terms.push({ y, a: B[l][j] }); });
        const sa = terms.reduce((s, x) => s + x.a * x.a, 0); if (!(sa > 1e-12)) continue;
        const target = new Float64Array(n); terms.forEach(x => { for (let t = 0; t < n; t++) target[t] += x.a * x.y[t]; });
        const zt = lv[j].idx.map(k => dot(Z[k], target) / sa);
        w[j] = blockInv[j].map(row => dot(row, zt));
        norm(j);
      }
      estimateA();
      const fn = criterion(); trace.push(fn);
      if (Math.abs(f - fn) < tol * Math.max(1, fn)) { f = fn; break; }
      f = fn;
    }
    // fit indices
    const p = raw.length, nForm = lv.filter(l => l.mode === 'B').reduce((s, l) => s + l.idx.length, 0);
    const nExo = spec.pred.filter(P => !P.length).length;
    // unique indicators may appear in several blocks (repeated indicators): count columns of Z once each
    const ssTot = n1 * (p + J), ssRes = f + n1 * (nForm + nExo);
    const FIT = 1 - ssRes / ssTot;
    const nPar = lv.reduce((s, l) => s + l.idx.length + (l.mode === 'A' ? l.idx.length : 0), 0) + spec.pred.reduce((s, P) => s + P.length, 0);
    const d0 = n * (p + J), AFIT = 1 - (1 - FIT) * d0 / (d0 - nPar);
    const R = G.map(a => G.map(b => dot(a, b) / n1));
    const corrL = lv.map((l, j) => l.idx.map(k => dot(Z[k], G[j]) / n1));
    // composite-based implied correlations (reflective: c_a c_b within block; across blocks c_a r_jl c_b)
    const ind = [], own = [], pos = []; lv.forEach((l, j) => l.idx.forEach((k, q) => { if (!ind.includes(k)) { ind.push(k); own.push(j); pos.push(q); } }));
    let srs = 0, cnt = 0, num = 0, den = 0;
    for (let a = 0; a < ind.length; a++) for (let b = 0; b < ind.length; b++) {
      const s = a === b ? 1 : dot(Z[ind[a]], Z[ind[b]]) / n1; let sig;
      if (a === b) sig = 1; else if (own[a] === own[b]) sig = lv[own[a]].mode === 'B' ? s : corrL[own[a]][pos[a]] * corrL[own[b]][pos[b]];
      else sig = corrL[own[a]][pos[a]] * R[own[a]][own[b]] * corrL[own[b]][pos[b]];
      num += (s - sig) * (s - sig); den += s * s; if (b <= a) { srs += (s - sig) * (s - sig); cnt++; }
    }
    const r2 = spec.pred.map((P, j) => (P.length ? r2From(R, j, P) : NaN));
    return { w, C, B, G, R, corrL, f, FIT, AFIT, GFI: 1 - num / den, SRMR: Math.sqrt(srs / cnt), r2, iterations: it, trace, n };
  }
  function gsca(ds, model, settings, opts, progress) {
    settings = Object.assign({}, E.DEFAULTS, settings || {});
    opts = Object.assign({ samples: 500, seed: 1, maxIter: 1000, tol: 1e-10 }, opts || {});
    const prep = E.prepare(ds, model, settings), spec = prep.spec;
    if (spec.inter.length) throw new Error('no_interactions');
    const fit = gscaFit(prep.raw, spec, null, opts.maxIter, opts.tol);
    const names = spec.lv.map(l => l.name), indName = prep.names, n = prep.raw[0].length;
    const stats = f => {
      const s = {};
      names.forEach((nm, j) => {
        spec.lv[j].idx.forEach((k, q) => { s['weight|' + indName[k] + ' -> ' + nm] = f.w[j][q]; s['loading|' + indName[k] + ' <- ' + nm] = f.corrL[j][q]; });
        spec.pred[j].forEach(i => { s['path|' + names[i] + ' -> ' + nm] = f.B[j][i]; });
        if (spec.pred[j].length) s['r2|' + nm] = f.r2[j];
      });
      s['fit|FIT'] = f.FIT; s['fit|AFIT'] = f.AFIT; s['fit|GFI'] = f.GFI; s['fit|SRMR'] = f.SRMR;
      return s;
    };
    const orig = stats(fit), keys = Object.keys(orig), draws = keys.map(() => []);
    const rand = rng(opts.seed);
    for (let b = 0; b < opts.samples; b++) {
      const idx = Int32Array.from({ length: n }, () => Math.floor(rand() * n));
      try { const fb = gscaFit(prep.raw.map(c => Float64Array.from(idx, t => c[t])), spec, fit.w, 300, 1e-8), sb = stats(fb); keys.forEach((k, q) => draws[q].push(sb[k])); } catch (e) { /* skip */ }
      if (progress && b % 10 === 0) progress(b / opts.samples);
    }
    const rows = keys.map((k, q) => {
      const [group, label] = E.splitKey(k), d = draws[q].slice().sort((a, b) => a - b), o = orig[k];
      if (!d.length) return { key: k, group, label, original: o };
      const m = mean(d), s = sd(d, m), t = Math.abs(o / s);
      return { key: k, group, label, original: o, mean: m, sd: s, t, p: tTwoTailedP(t, d.length - 1), lo: quantile(d, 0.025), hi: quantile(d, 0.975) };
    });
    return { kind: 'gsca', n, samples: opts.samples, iterations: fit.iterations, fit: { FIT: fit.FIT, AFIT: fit.AFIT, GFI: fit.GFI, SRMR: fit.SRMR }, rows, constructs: names, lvCorr: fit.R, trace: fit.trace };
  }

  // ----------------------------------------------------------- logistic regression
  function logistic(ds, model, settings, opts) {
    opts = opts || {};
    if (!opts.y || !opts.x || !opts.x.length) throw new Error('bad_regression');
    const get = varGetter(ds, model, settings), yRaw = get(opts.y), Xraw = opts.x.map(get);
    const rows = []; for (let t = 0; t < ds.n; t++) if (!isNaN(yRaw[t]) && Xraw.every(c => !isNaN(c[t]))) rows.push(t);
    const levels = Array.from(new Set(rows.map(t => yRaw[t]))).sort((a, b) => a - b);
    if (levels.length !== 2) throw new Error('logit_binary');
    const event = opts.event !== undefined && levels.includes(+opts.event) ? +opts.event : levels[1];
    const yj = ds.names.indexOf(opts.y), lab = yj >= 0 && ds.labels[yj] ? v => ds.labels[yj][v - 1] : v => String(v);
    const n = rows.length, k = Xraw.length, y = Float64Array.from(rows, t => (yRaw[t] === event ? 1 : 0)), X = Xraw.map(c => Float64Array.from(rows, t => c[t]));
    const col = a => (a === 0 ? null : X[a - 1]), P = k + 1;
    let beta = new Array(P).fill(0), it, sep = false, XtWX;
    const prob = b => Float64Array.from({ length: n }, (_, t) => { let e = b[0]; for (let a = 1; a < P; a++) e += b[a] * X[a - 1][t]; return 1 / (1 + Math.exp(-e)); });
    for (it = 1; it <= 100; it++) {
      const p = prob(beta); XtWX = zeros(P, P); const g = new Array(P).fill(0);
      for (let a = 0; a < P; a++) {
        const ca = col(a);
        for (let t = 0; t < n; t++) g[a] += (ca ? ca[t] : 1) * (y[t] - p[t]);
        for (let b = a; b < P; b++) { const cb = col(b); let s = 0; for (let t = 0; t < n; t++) s += (ca ? ca[t] : 1) * (cb ? cb[t] : 1) * p[t] * (1 - p[t]); XtWX[a][b] = XtWX[b][a] = s; }
      }
      let d; try { d = solve(XtWX, g); } catch (e) { sep = true; break; }
      beta = beta.map((v, a) => v + d[a]);
      if (Math.max(...d.map(Math.abs)) < 1e-10) break;
    }
    if (beta.some(v => Math.abs(v) > 25) || it > 100) sep = true;
    const p = prob(beta), cov = inverse(XtWX);
    let LL = 0; for (let t = 0; t < n; t++) LL += y[t] ? Math.log(Math.max(p[t], 1e-300)) : Math.log(Math.max(1 - p[t], 1e-300));
    const ybar = mean(y), LL0 = n * (ybar * Math.log(ybar) + (1 - ybar) * Math.log(1 - ybar));
    const LR = 2 * (LL - LL0), cs = 1 - Math.exp(2 * (LL0 - LL) / n);
    const names = ['(Intercept)'].concat(opts.x);
    const Rc = E.corrMatrix(X);
    const terms = names.map((nm, a) => { const se = Math.sqrt(cov[a][a]), z = beta[a] / se; return { name: nm, b: beta[a], se, z, p: 2 * (1 - pnorm(Math.abs(z))), or: Math.exp(beta[a]), orLo: Math.exp(beta[a] - 1.959964 * se), orHi: Math.exp(beta[a] + 1.959964 * se), vif: a === 0 ? NaN : (k < 2 ? 1 : 1 / (1 - r2From(Rc, a - 1, Rc.map((_, q) => q).filter(q => q !== a - 1)))) }; });
    let tp = 0, fp = 0, tn = 0, fn = 0; for (let t = 0; t < n; t++) { const pr = p[t] >= 0.5; if (pr && y[t]) tp++; else if (pr) fp++; else if (y[t]) fn++; else tn++; }
    // AUC (Mann–Whitney) and Hosmer–Lemeshow (deciles of risk)
    const order = Array.from({ length: n }, (_, t) => t).sort((a, b) => p[a] - p[b]);
    let rankSum = 0; { let i = 0; while (i < n) { let j = i; while (j + 1 < n && p[order[j + 1]] === p[order[i]]) j++; const r = (i + j) / 2 + 1; for (let q = i; q <= j; q++) if (y[order[q]]) rankSum += r; i = j + 1; } }
    const n1 = y.reduce((a, b) => a + b, 0), n0 = n - n1, auc = (rankSum - n1 * (n1 + 1) / 2) / (n1 * n0);
    const g = Math.min(10, Math.floor(n / 5)); let hl = 0;
    for (let q = 0; q < g; q++) {
      const part = order.slice(Math.floor(q * n / g), Math.floor((q + 1) * n / g)); let o1 = 0, e1 = 0;
      part.forEach(t => { o1 += y[t]; e1 += p[t]; }); const e0 = part.length - e1, o0 = part.length - o1;
      if (e1 > 0) hl += (o1 - e1) * (o1 - e1) / e1; if (e0 > 0) hl += (o0 - e0) * (o0 - e0) / e0;
    }
    return {
      kind: 'logistic', n, y: opts.y, event: lab(event), reference: lab(levels.find(v => v !== event)), events: n1, iterations: it, separation: sep, terms,
      LL, LL0, deviance: -2 * LL, LR, LRdf: k, LRp: 1 - E.chi2cdf(LR, k), mcfadden: 1 - LL / LL0, coxSnell: cs, nagelkerke: cs / (1 - Math.exp(2 * LL0 / n)),
      aic: -2 * LL + 2 * P, bic: -2 * LL + P * Math.log(n), auc, hl, hlDf: g - 2, hlP: 1 - E.chi2cdf(hl, g - 2),
      table: { tp, fp, tn, fn, accuracy: (tp + tn) / n, sensitivity: tp / (tp + fn), specificity: tn / (tn + fp) },
      fitted: order.map(t => [p[t], y[t]])
    };
  }

  // ------------------------------------------------------------------ CVPAT
  /*
   * Cross-validated predictive ability test (Liengaard et al., 2021): k-fold cross-validated squared prediction errors
   * of every case (averaged over the endogenous indicators and the repetitions) are compared between PLS-SEM and the
   * indicator-average (IA) and linear-model (LM) benchmarks with a one-sided paired t-test on the loss differences.
   */
  function cvpat(ds, model, settings, opts, progress) {
    settings = Object.assign({}, E.DEFAULTS, settings || {});
    opts = Object.assign({ folds: 10, reps: 10, seed: 1 }, opts || {});
    const prep = E.prepare(ds, model, settings), spec = prep.spec;
    if (spec.inter.length) throw new Error('no_interactions');
    const n = prep.raw[0].length, rand = rng(opts.seed);
    const endo = []; for (let j = 0; j < spec.J; j++) if (spec.pred[j].length) endo.push(j);
    const exoOf = j => { const s = new Set(), st = [j]; while (st.length) { const u = st.pop(); spec.pred[u].forEach(i => { if (!spec.pred[i].length) s.add(i); st.push(i); }); } return Array.from(s); };
    const items = []; endo.forEach(j => spec.lv[j].idx.forEach((k, q) => items.push({ j, k, q })));
    const loss = { pls: new Float64Array(n), ia: new Float64Array(n), lm: new Float64Array(n) };
    const byLv = endo.map(() => ({ pls: new Float64Array(n), ia: new Float64Array(n), lm: new Float64Array(n) }));
    for (let r = 0; r < opts.reps; r++) {
      const perm = Array.from({ length: n }, (_, i) => i);
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
      for (let f = 0; f < opts.folds; f++) {
        const test = perm.filter((_, i) => i % opts.folds === f), ts = new Set(test), train = []; for (let t = 0; t < n; t++) if (!ts.has(t)) train.push(t);
        const rawTr = prep.raw.map(c => Float64Array.from(train, t => c[t])), mu = rawTr.map(c => mean(c)), sg = rawTr.map((c, k) => sd(c, mu[k]) || 1);
        const fit = E.fitFull(rawTr, spec, settings), m = test.length;
        const zt = prep.raw.map((c, k) => Float64Array.from(test, t => (c[t] - mu[k]) / sg[k]));
        const Yact = spec.lv.map((l, j) => { const y = new Float64Array(m); l.idx.forEach((k, q) => { for (let t = 0; t < m; t++) y[t] += fit.w[j][q] * zt[k][t]; }); return y; });
        const Yhat = [];
        spec.order.forEach(j => { if (!spec.pred[j].length) Yhat[j] = Yact[j]; else { const y = new Float64Array(m); spec.pred[j].forEach(i => { for (let t = 0; t < m; t++) y[t] += fit.B[j][i] * Yhat[i][t]; }); Yhat[j] = y; } });
        const lms = {};
        items.forEach(it => {
          const xs = []; exoOf(it.j).forEach(i => spec.lv[i].idx.forEach(k => { if (!xs.includes(k)) xs.push(k); }));
          const key = it.k + '|' + xs.join(','); if (!lms[key]) lms[key] = olsFit(xs.map(k => rawTr[k]), rawTr[it.k]).coef;
          const c = lms[key], e = endo.indexOf(it.j);
          for (let t = 0; t < m; t++) {
            const row = test[t], act = prep.raw[it.k][row];
            const pls = fit.L[it.j][it.q] * Yhat[it.j][t] * sg[it.k] + mu[it.k];
            let lm = c[0]; xs.forEach((k, a) => { lm += c[a + 1] * prep.raw[k][row]; });
            const a1 = (act - pls) ** 2 / items.length, a2 = (act - mu[it.k]) ** 2 / items.length, a3 = (act - lm) ** 2 / items.length;
            loss.pls[row] += a1 / opts.reps; loss.ia[row] += a2 / opts.reps; loss.lm[row] += a3 / opts.reps;
            const ni = spec.lv[it.j].idx.length / items.length; // per-construct losses averaged over that construct's indicators
            byLv[e].pls[row] += a1 / ni / opts.reps; byLv[e].ia[row] += a2 / ni / opts.reps; byLv[e].lm[row] += a3 / ni / opts.reps;
          }
        });
        if (progress) progress((r * opts.folds + f + 1) / (opts.reps * opts.folds));
      }
    }
    const test = (bench, pls) => { const d = Float64Array.from(bench, (v, i) => v - pls[i]), m = mean(d), s = sd(d, m), t = m / (s / Math.sqrt(n)); return { plsLoss: mean(pls), benchLoss: mean(bench), diff: m, t, p: tOneSided(t, n - 1) }; };
    return {
      kind: 'cvpat', n, folds: opts.folds, reps: opts.reps,
      overall: { ia: test(loss.ia, loss.pls), lm: test(loss.lm, loss.pls) },
      constructs: endo.map((j, e) => ({ construct: spec.lv[j].name, ia: test(byLv[e].ia, byLv[e].pls), lm: test(byLv[e].lm, byLv[e].pls) }))
    };
  }

  // ----------------------------------------------- MGA with bootstrap-based tests
  // Adds Henseler's PLS-MGA, the parametric test (Keil et al., 2000) and the Welch–Satterthwaite test to the
  // permutation-based MGA and MICOM of the engine (Sarstedt, Henseler & Ringle, 2011).
  function mgaFull(ds, model, settings, opts, progress) {
    settings = Object.assign({}, E.DEFAULTS, settings || {});
    opts = Object.assign({ bootSamples: 1000, seed: 1 }, opts || {});
    const base = E.mga(ds, model, settings, opts, progress ? p => progress(opts.bootSamples > 0 ? 0.5 * p : p) : null);
    const B = +opts.bootSamples || 0; if (!B) return base;
    const gcol = ds.names.indexOf(opts.groupVar), rand = rng(opts.seed + 7);
    const values = Array.from(new Set(Array.from(ds.cols[gcol]).filter(v => !isNaN(v)))).sort((a, b) => a - b);
    const [g1, g2] = opts.groups || values.slice(0, 2);
    const rowsOf = v => { const r = []; for (let i = 0; i < ds.n; i++) if (ds.cols[gcol][i] === v) r.push(i); return r; };
    const res = base.results[0], keys = res.rows.map(x => x.key);
    const bootGroup = (rows, phase) => {
      const prep = E.prepare(ds, model, Object.assign({}, settings, { rows })), n = prep.raw[0].length;
      const indNames = prep.names.concat(prep.spec.inter.map(it => it.name)), f0 = E.fitFull(prep.raw, prep.spec, settings), init = { full: f0.w, base: f0.stage1W };
      const draws = keys.map(() => []);
      for (let b = 0; b < B; b++) {
        const idx = Int32Array.from({ length: n }, () => Math.floor(rand() * n));
        try { const s = E.collectStats(E.fitFull(prep.raw.map(c => Float64Array.from(idx, t => c[t])), prep.spec, settings, init), prep.spec, { indNames, light: true }); keys.forEach((k, q) => draws[q].push(s[k])); } catch (e) { /* skip */ }
        if (progress && b % 20 === 0) progress(0.5 + 0.25 * phase + 0.25 * b / B);
      }
      return { n, draws };
    };
    const A = bootGroup(rowsOf(g1), 0), Bg = bootGroup(rowsOf(g2), 1), n1 = A.n, n2 = Bg.n;
    res.rows.forEach((row, q) => {
      const d1 = A.draws[q].filter(isFinite), d2 = Bg.draws[q].filter(isFinite), m1 = mean(d1), m2 = mean(d2), s1 = sd(d1, m1), s2 = sd(d2, m2);
      // Henseler et al. (2009): P(θ1 > θ2) from all pairs of bias-centred bootstrap estimates
      const c1 = d1.map(v => 2 * row.g1 - v).sort((a, b) => a - b), c2 = d2.map(v => 2 * row.g2 - v);
      let cnt = 0; c2.forEach(v => { let lo = 0, hi = c1.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (c1[mid] <= v) lo = mid + 1; else hi = mid; } cnt += lo; });
      // one-tailed p for H1: θ1 > θ2 is the share of pairs with θ1* ≤ θ2* (small when group 1 is clearly larger)
      const pOne = cnt / (c1.length * c2.length);
      row.se1 = s1; row.se2 = s2;
      row.hP1 = pOne; row.hP2 = 2 * Math.min(pOne, 1 - pOne);
      const sp = Math.sqrt(((n1 - 1) ** 2 / (n1 + n2 - 2)) * s1 * s1 + ((n2 - 1) ** 2 / (n1 + n2 - 2)) * s2 * s2) * Math.sqrt(1 / n1 + 1 / n2);
      row.parT = Math.abs(row.diff) / sp; row.parP = tTwoTailedP(row.parT, n1 + n2 - 2);
      const v1 = (n1 - 1) / n1 * s1 * s1, v2 = (n2 - 1) / n2 * s2 * s2;
      row.wsT = Math.abs(row.diff) / Math.sqrt(v1 + v2);
      row.wsDf = Math.max(1, (v1 + v2) ** 2 / ((n1 - 1) / (n1 * n1) * s1 ** 4 + (n2 - 1) / (n2 * n2) * s2 ** 4) - 2);
      row.wsP = tTwoTailedP(row.wsT, row.wsDf);
    });
    res.bootSamples = B;
    return base;
  }

  // ------------------------------------------------------------- sample size
  // Inverse square root method (Kock & Hadaya, 2018): n_min = ((z_{1−α} + z_{power}) / |β_min|)², one-tailed test.
  function sampleSize(opts) {
    const alpha = +opts.alpha || 0.05, power = +opts.power || 0.8, beta = Math.abs(+opts.pmin || 0.2);
    const z = qnorm(1 - alpha) + qnorm(power), need = b => Math.ceil((z / b) ** 2);
    return { kind: 'samplesize', alpha, power, pmin: beta, z, n: need(beta), table: [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5].map(b => ({ beta: b, n: need(b) })), tenTimes: opts.tenTimes || null, fromModel: opts.fromModel || null };
  }

  Object.assign(E, { gsca, gscaFit, logistic, cvpat, mgaFull, sampleSize, varGetter });
  if (typeof module !== 'undefined' && module.exports) module.exports = E;
})(typeof self !== 'undefined' ? self : this);
