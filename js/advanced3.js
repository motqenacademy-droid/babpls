/*
 * YouPls advanced analyses III: multigroup CB-SEM with mean structure (measurement invariance: configural, metric,
 * scalar; path-wise equality tests), CB-SEM moderation, model comparison across models, and exact data generation
 * from a covariance/correlation matrix. Load after engine.js, advanced.js and advanced2.js.
 */
(function (root) {
  'use strict';
  const E = (typeof module !== 'undefined' && module.exports) ? require('./advanced2.js') : root.YPEngine;
  const { mean, sd, inverse, matmul, transpose, zeros, eye, dot, logdet, rng, cholesky, pnorm } = E;

  // ------------------------------------------------------- data from a covariance matrix
  // Builds n cases whose sample covariance (divisor n−1) and means reproduce the given matrix exactly, so every
  // analysis that depends only on the covariance matrix (PLS-SEM and CB-SEM estimates) gives exact results.
  function dataFromCov(names, C, n, means, seed) {
    const p = names.length; if (!(n > p)) throw new Error('cov_n');
    const L = cholesky(C), r = rng(seed || 1);
    const g = () => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
    const Q = [];
    for (let j = 0; j < p; j++) { // centred, orthonormal columns (modified Gram–Schmidt)
      let v = Float64Array.from({ length: n }, g); const m = mean(v); v = v.map(x => x - m);
      Q.forEach(q => { const pr = dot(v, q); for (let t = 0; t < n; t++) v[t] -= pr * q[t]; });
      const nv = Math.sqrt(dot(v, v)); Q.push(v.map(x => x / nv));
    }
    const s = Math.sqrt(n - 1);
    return names.map((_, a) => { const out = new Float64Array(n); for (let b = 0; b <= a; b++) { const c = L[a][b] * s; for (let t = 0; t < n; t++) out[t] += Q[b][t] * c; } const mu = means ? means[a] : 0; for (let t = 0; t < n; t++) out[t] += mu; return out; });
  }
  // CSV with a header of names and a square (or lower-triangular) matrix; first column may hold row names.
  function parseCovMatrix(text) {
    const ds = E.parseCSV(text), names = ds.names.slice();
    let rowNames = null;
    if (ds.kinds[0] === 'cat' || /^(|v1|name|names|variable)$/i.test(names[0])) { rowNames = names.shift(); }
    const off = rowNames ? 1 : 0, p = names.length;
    const vals = ds.cols.slice(off).map(c => Array.from(c));
    if (vals[0].length < p) throw new Error('cov_bad');
    const C = zeros(p, p);
    for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) { const v = vals[b][a]; const w = vals[a][b]; C[a][b] = isFinite(v) ? v : w; }
    for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) { const v = isFinite(C[a][b]) ? C[a][b] : C[b][a]; C[a][b] = C[b][a] = v; }
    if (C.some(r => r.some(v => !isFinite(v)))) throw new Error('cov_bad');
    let means = null, sds = null;
    if (vals[0].length > p) { const extra = vals[0].length - p; for (let e = 0; e < extra; e++) { const lbl = rowNames ? String(ds.labels[0] ? ds.labels[0][ds.cols[0][p + e] - 1] : '').toLowerCase() : ''; const v = vals.map(c => c[p + e]); if (/^(sd|std|stddev)/.test(lbl)) sds = v; else if (/^mean/.test(lbl)) means = v; } }
    const isCorr = C.every((r, a) => Math.abs(r[a] - 1) < 1e-9);
    if (isCorr && sds) for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) C[a][b] *= sds[a] * sds[b];
    return { names, C, means, isCorr: isCorr && !sds };
  }

  // ------------------------------------------------------------- multigroup CB-SEM
  function chi2sf(x, df) { return df > 0 ? 1 - E.chi2cdf(x, df) : NaN; }
  function cbsemMG(ds, model, settings, opts, progress) {
    settings = Object.assign({}, E.DEFAULTS, settings || {});
    opts = opts || {};
    const gcol = ds.names.indexOf(opts.groupVar); if (gcol < 0) throw new Error('no_group');
    const lab = ds.labels[gcol], values = Array.from(new Set(Array.from(ds.cols[gcol]).filter(v => !isNaN(v)))).sort((a, b) => a - b);
    const groupVals = opts.groups && opts.groups.length >= 2 ? opts.groups : values;
    if (groupVals.length < 2) throw new Error('one_group');
    if (opts.groups && opts.groups[0] === opts.groups[1]) throw new Error('same_group');
    const gname = v => (lab ? lab[v - 1] : String(v));
    const preps = groupVals.map(v => { const rows = []; for (let i = 0; i < ds.n; i++) if (ds.cols[gcol][i] === v) rows.push(i); return E.prepare(ds, model, Object.assign({}, settings, { rows })); });
    const spec = preps[0].spec;
    if (spec.inter.length) throw new Error('cbsem_interactions');
    if (spec.lv.some(l => l.mode === 'B')) throw new Error('cbsem_formative');
    const G = preps.length, p = preps[0].raw.length, m = spec.J, names = spec.lv.map(l => l.name), ind = preps[0].names;
    const data = preps.map(pr => {
      const X = pr.raw, n = X[0].length, mu = X.map(mean), S = zeros(p, p);
      for (let a = 0; a < p; a++) for (let b = a; b < p; b++) { let s = 0; for (let t = 0; t < n; t++) s += (X[a][t] - mu[a]) * (X[b][t] - mu[b]); S[a][b] = S[b][a] = s / n; }
      if (n <= p) throw new Error('mg_small');
      return { n, mu, S, ldS: logdet(S) };
    });
    const N = data.reduce((a, d) => a + d.n, 0);
    const exo = []; for (let j = 0; j < m; j++) if (!spec.pred[j].length) exo.push(j);
    const single = k => spec.lv.filter(l => l.idx.includes(k)).length === 1 && spec.lv.some(l => l.idx.length === 1 && l.idx[0] === k);
    // slots per group: L, B, P, T, tau, alpha. level: 'configural' | 'metric' | 'scalar'; equal: set of path keys "i>j" constrained equal
    function layout(level, equalPaths) {
      const slots = []; // { g, t, ...indices, id: global param index }
      const shared = {}; let q = 0;
      const id = key => (key in shared ? shared[key] : (shared[key] = q++));
      for (let g = 0; g < G; g++) {
        spec.lv.forEach((l, j) => l.idx.forEach((k, qq) => { if (qq > 0) slots.push({ g, t: 'L', k, j, id: level === 'configural' ? id(`L${k},${j}|${g}`) : id(`L${k},${j}`) }); }));
        for (let j = 0; j < m; j++) spec.pred[j].forEach(i => slots.push({ g, t: 'B', i: j, j: i, id: equalPaths && equalPaths.has(i + '>' + j) ? id(`B${i}>${j}`) : id(`B${i}>${j}|${g}`) }));
        exo.forEach((a, x) => exo.forEach((b, y) => { if (y >= x) slots.push({ g, t: 'P', a, b, id: id(`P${a},${b}|${g}`) }); }));
        for (let j = 0; j < m; j++) if (spec.pred[j].length) slots.push({ g, t: 'P', a: j, b: j, id: id(`P${j},${j}|${g}`) });
        for (let k = 0; k < p; k++) if (!single(k)) slots.push({ g, t: 'T', k, id: id(`T${k}|${g}`) });
        for (let k = 0; k < p; k++) slots.push({ g, t: 'tau', k, id: level === 'scalar' ? id(`tau${k}`) : id(`tau${k}|${g}`) });
        if (level === 'scalar' && g > 0) for (let j = 0; j < m; j++) slots.push({ g, t: 'alpha', j, id: id(`alpha${j}|${g}`) });
      }
      return { slots, q };
    }
    function build(th, slots, g) {
      const L = zeros(p, m), B = zeros(m, m), Ps = zeros(m, m), Th = new Array(p).fill(0), tau = new Array(p).fill(0), al = new Array(m).fill(0);
      spec.lv.forEach((l, j) => { L[l.idx[0]][j] = 1; });
      slots.forEach(s => {
        if (s.g !== g) return; const v = th[s.id];
        if (s.t === 'L') L[s.k][s.j] = v; else if (s.t === 'B') B[s.i][s.j] = v; else if (s.t === 'P') { Ps[s.a][s.b] = v; Ps[s.b][s.a] = v; }
        else if (s.t === 'T') Th[s.k] = v; else if (s.t === 'tau') tau[s.k] = v; else al[s.j] = v;
      });
      const A = inverse(eye(m).map((r, i) => r.map((v, k) => v - B[i][k]))), M = matmul(matmul(A, Ps), transpose(A));
      const Sig = matmul(matmul(L, M), transpose(L)); for (let k = 0; k < p; k++) Sig[k][k] += Th[k];
      const Aal = A.map(r => dot(r, al)), mu = tau.map((t, k) => t + dot(L[k], Aal));
      return { L, B, Ps, Th, tau, al, A, M, Sig, mu, Aal };
    }
    function Fg(th, slots, g) {
      let st; try { st = build(th, slots, g); } catch (e) { return Infinity; }
      let ld; try { ld = logdet(st.Sig); } catch (e) { return Infinity; }
      const d = data[g], Si = inverse(st.Sig); let tr = 0; for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) tr += d.S[a][b] * Si[b][a];
      const dm = d.mu.map((v, k) => v - st.mu[k]), u = Si.map(r => dot(r, dm));
      return ld + tr - d.ldS - p + dot(dm, u);
    }
    const Ftot = (th, L) => data.reduce((a, d, g) => a + d.n / N * Fg(th, L.slots, g), 0);
    function grad(th, L) {
      const gr = new Float64Array(L.q);
      for (let g = 0; g < G; g++) {
        const st = build(th, L.slots, g), d = data[g], Si = inverse(st.Sig), w = d.n / N;
        const dm = d.mu.map((v, k) => v - st.mu[k]), u = Si.map(r => dot(r, dm));
        const SiS = matmul(Si, d.S), W = matmul(SiS, Si).map((r, a) => r.map((v, b) => Si[a][b] - v - u[a] * u[b]));
        const WL = matmul(W, st.L), WLM = matmul(WL, st.M), Gm = matmul(transpose(st.L), WL), H = matmul(matmul(transpose(st.A), Gm), st.A), MGA = matmul(matmul(st.M, Gm), st.A);
        const uL = transpose(st.L).map(r => dot(r, u)), uLA = transpose(st.A).map(r => dot(r, uL)); // (u'LA)_i
        L.slots.forEach(s => {
          if (s.g !== g) return; let v = 0;
          if (s.t === 'L') v = 2 * WLM[s.k][s.j] - 2 * u[s.k] * st.Aal[s.j];
          else if (s.t === 'B') v = 2 * MGA[s.j][s.i] - 2 * uLA[s.i] * st.Aal[s.j];
          else if (s.t === 'P') v = s.a === s.b ? H[s.a][s.a] : 2 * H[s.a][s.b];
          else if (s.t === 'T') v = W[s.k][s.k];
          else if (s.t === 'tau') v = -2 * u[s.k];
          else v = -2 * uLA[s.j];
          gr[s.id] += w * v;
        });
      }
      return gr;
    }
    function start(L) {
      const th = new Float64Array(L.q), cnt = new Float64Array(L.q);
      L.slots.forEach(s => {
        const d = data[s.g], fv = j => { const l = spec.lv[j], mk = l.idx[0]; if (l.idx.length === 1) return d.S[mk][mk]; return Math.max(0.05 * d.S[mk][mk], mean(l.idx.slice(1).map(k => d.S[k][mk]))); };
        let v = 0;
        if (s.t === 'L') v = d.S[s.k][spec.lv[s.j].idx[0]] / fv(s.j); else if (s.t === 'P') v = s.a === s.b ? (spec.pred[s.a].length ? 0.5 : 1) * fv(s.a) : 0;
        else if (s.t === 'T') v = 0.5 * d.S[s.k][s.k]; else if (s.t === 'tau') v = d.mu[s.k];
        th[s.id] += v; cnt[s.id]++;
      });
      return th.map((v, i) => v / (cnt[i] || 1));
    }
    function optimize(L, th0) {
      const th = Float64Array.from(th0 || start(L)), q = L.q; let f = Ftot(th, L), g = grad(th, L), Hi = eye(q), it;
      if (!isFinite(f)) throw new Error('cbsem_start');
      for (it = 1; it <= 3000; it++) {
        let dv = new Float64Array(q); for (let a = 0; a < q; a++) { let s = 0; for (let b = 0; b < q; b++) s -= Hi[a][b] * g[b]; dv[a] = s; }
        let gd = dot(g, dv); if (!(gd < 0)) { Hi = eye(q); dv = Float64Array.from(g, v => -v); gd = -dot(g, g); }
        let step = 1, tn, fn;
        for (let ls = 0; ls < 60; ls++) { tn = Float64Array.from(th, (v, a) => v + step * dv[a]); fn = Ftot(tn, L); if (fn <= f + 1e-4 * step * gd) break; step *= 0.5; }
        if (!(fn <= f + 1e-4 * step * gd)) break;
        const gn = grad(tn, L), sv = Float64Array.from(tn, (v, a) => v - th[a]), y = Float64Array.from(gn, (v, a) => v - g[a]), sy = dot(sv, y);
        if (sy > 1e-14) { const r = 1 / sy, Hy = Hi.map(row => dot(row, y)), yHy = dot(y, Hy); for (let a = 0; a < q; a++) for (let b = 0; b < q; b++) Hi[a][b] += (1 + r * yHy) * r * sv[a] * sv[b] - r * (Hy[a] * sv[b] + sv[a] * Hy[b]); }
        const df_ = f - fn; th.set(tn); f = fn; g = gn;
        const gm = Math.max(...Array.from(g, Math.abs)); if (gm < 1e-7 || (df_ >= 0 && df_ < 1e-14)) break;
      }
      return { th, f, it, converged: Math.max(...Array.from(g, Math.abs)) < 1e-4 };
    }
    if (opts.gradCheck) { // test hook: analytic vs numerical gradient (scalar model, perturbed start)
      const L = layout('scalar', null), th = start(L).map((v, i) => v + 0.05 * Math.sin(i + 1)), g = grad(th, L);
      return { maxGradDiff: Math.max(...Array.from(g, (v, i) => { const a = Float64Array.from(th), b = Float64Array.from(th); a[i] += 1e-6; b[i] -= 1e-6; return Math.abs((Ftot(a, L) - Ftot(b, L)) / 2e-6 - v); })) };
    }
    const moments = G * (p * (p + 1) / 2 + p);
    let chi0 = 0; data.forEach(d => { let s = 0; for (let k = 0; k < p; k++) s += Math.log(d.S[k][k]); chi0 += d.n * (s - d.ldS); });
    const df0 = G * p * (p - 1) / 2;
    function fitOf(L, sol) {
      const chi2 = N * sol.f, df = moments - L.q;
      const cfi = 1 - Math.max(chi2 - df, 0) / Math.max(chi0 - df0, chi2 - df, 1e-12);
      const tli = ((chi0 / df0) - (chi2 / Math.max(df, 1e-12))) / ((chi0 / df0) - 1);
      const rmsea = df > 0 ? Math.sqrt(G) * Math.sqrt(Math.max(chi2 - df, 0) / (df * N)) : NaN; // lavaan's multigroup RMSEA
      let logL = 0; data.forEach((d, g) => { const st = build(sol.th, L.slots, g), Si = inverse(st.Sig); let tr = 0; for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) tr += d.S[a][b] * Si[b][a]; const dm = d.mu.map((v, k) => v - st.mu[k]); logL += -d.n / 2 * (p * Math.log(2 * Math.PI) + logdet(st.Sig) + tr + dot(dm, Si.map(r => dot(r, dm)))); });
      let srs = 0, sc = 0; data.forEach((d, g) => { const st = build(sol.th, L.slots, g); for (let a = 0; a < p; a++) for (let b = 0; b <= a; b++) { const r = (d.S[a][b] - st.Sig[a][b]) / Math.sqrt(d.S[a][a] * d.S[b][b]); srs += r * r; sc++; } });
      return { chi2, df, p: chi2sf(chi2, df), cfi, tli, rmsea, srmr: Math.sqrt(srs / sc), aic: -2 * logL + 2 * L.q, bic: -2 * logL + L.q * Math.log(N), params: L.q, iterations: sol.it, converged: sol.converged };
    }
    const levels = {}, sols = {};
    const levelNames = ['configural', 'metric', 'scalar'];
    levelNames.forEach((lv, z) => {
      const L = layout(lv, null), sol = optimize(L, null); levels[lv] = fitOf(L, sol); sols[lv] = { L, sol };
      if (progress) progress((z + 1) / (levelNames.length + 1));
    });
    const inv = [['metric', 'configural'], ['scalar', 'metric']].map(([a, b]) => {
      const dchi = levels[a].chi2 - levels[b].chi2, ddf = levels[a].df - levels[b].df;
      return { model: a, vs: b, dchi, ddf, p: chi2sf(dchi, ddf), dcfi: levels[a].cfi - levels[b].cfi, drmsea: levels[a].rmsea - levels[b].rmsea };
    });
    // group-specific standardised estimates (metric model: comparable loadings) and path-wise equality tests
    const base = sols.metric, est = groupVals.map((_, g) => {
      const st = build(base.sol.th, base.L.slots, g), sl = j => Math.sqrt(st.M[j][j]), sx = k => Math.sqrt(st.Sig[k][k]);
      const paths = []; for (let j = 0; j < m; j++) spec.pred[j].forEach(i => paths.push({ from: names[i], to: names[j], est: st.B[j][i], std: st.B[j][i] * sl(i) / sl(j) }));
      const loadings = []; spec.lv.forEach((l, j) => l.idx.forEach(k => loadings.push({ construct: names[j], indicator: ind[k], est: st.L[k][j], std: st.L[k][j] * sl(j) / sx(k) })));
      return { group: gname(groupVals[g]), n: data[g].n, paths, loadings };
    });
    const pathTests = [];
    const allPaths = []; for (let j = 0; j < m; j++) spec.pred[j].forEach(i => allPaths.push([i, j]));
    allPaths.forEach(([i, j], z) => {
      const L = layout('metric', new Set([i + '>' + j])), sol = optimize(L, null), fit = fitOf(L, sol);
      const dchi = fit.chi2 - levels.metric.chi2, ddf = fit.df - levels.metric.df;
      pathTests.push({ path: names[i] + ' → ' + names[j], values: est.map(e => e.paths.find(x => x.from === names[i] && x.to === names[j]).est), dchi, ddf, p: chi2sf(dchi, ddf) });
      if (progress) progress((levelNames.length + (z + 1) / allPaths.length) / (levelNames.length + 1));
    });
    // latent mean differences under scalar invariance (group 1 = reference)
    const sc = sols.scalar, latentMeans = [];
    for (let g = 1; g < G; g++) { const st = build(sc.sol.th, sc.L.slots, g); exo.forEach(j => latentMeans.push({ group: gname(groupVals[g]), construct: names[j], mean: st.al[j], std: st.al[j] / Math.sqrt(st.M[j][j]) })); }
    return { kind: 'cbsemmg', groups: groupVals.map(gname), ns: data.map(d => d.n), groupVar: opts.groupVar, levels, invariance: inv, groupEstimates: est, pathTests, latentMeans };
  }

  // ------------------------------------------------------------- CB-SEM moderation
  // Single product indicator: the interaction is represented by the product of the standardised mean scores of the
  // predictor's and the moderator's indicators (a pragmatic approach; reliabilities of the product are not corrected).
  function cbsemModerated(ds, model, settings, opts, progress) {
    if (!model.interactions || !model.interactions.length) return E.cbsem(ds, model, settings, opts, progress);
    const d2 = { names: ds.names.slice(), cols: ds.cols.slice(), kinds: ds.kinds.slice(), labels: ds.labels.slice(), n: ds.n };
    const m2 = JSON.parse(JSON.stringify(model)); m2.interactions = [];
    const byId = id => model.constructs.find(c => c.id === id);
    const meanScore = c => { const cols = c.indicators.map(nm => ds.cols[ds.names.indexOf(nm)]).map(col => { const v = Array.from(col).filter(isFinite), mu = mean(v), s = sd(v, mu) || 1; return Float64Array.from(col, x => (x - mu) / s); }); return Float64Array.from({ length: ds.n }, (_, t) => { const v = cols.map(c => c[t]).filter(isFinite); return v.length ? mean(v) : NaN; }); };
    model.interactions.forEach((it, q) => {
      const x = meanScore(byId(it.x)), w = meanScore(byId(it.m)), prod = Float64Array.from(x, (v, t) => v * w[t]);
      const vv = Array.from(prod).filter(isFinite), mu = mean(vv), s = sd(vv, mu) || 1, nm = '__int' + (q + 1);
      d2.names.push(nm); d2.cols.push(Float64Array.from(prod, v => (v - mu) / s)); d2.kinds.push('num'); d2.labels.push(null);
      m2.constructs.push({ id: it.id, name: it.name, mode: 'A', indicators: [nm] }); m2.paths.push({ from: it.id, to: it.y });
    });
    const r = E.cbsem(d2, m2, settings, opts, progress);
    r.moderation = model.interactions.map(it => it.name);
    return r;
  }

  // --------------------------------------------------------------- model comparison
  // Compares alternative models of the same data: PLS-SEM by information criteria per target construct with BIC-based
  // Akaike weights (Sharma et al., 2019; Danks, Sharma & Sarstedt, 2020); CB-SEM by global fit and χ² difference tests.
  function compareModels(ds, models, settings, opts, progress) {
    opts = Object.assign({ method: 'pls' }, opts || {});
    if (!models || models.length < 2) throw new Error('compare_two');
    const weights = vals => { const mn = Math.min(...vals.filter(isFinite)), e = vals.map(v => (isFinite(v) ? Math.exp(-(v - mn) / 2) : 0)), s = e.reduce((a, b) => a + b, 0); return e.map(v => v / s); };
    if (opts.method === 'cbsem') {
      const fits = models.map((mo, z) => { let r = null, err = null; try { r = (mo.model.interactions && mo.model.interactions.length ? cbsemModerated : E.cbsem)(ds, mo.model, settings, {}); } catch (e) { err = e.message; } if (progress) progress((z + 1) / models.length); return { name: mo.name, fit: r && r.fit, error: err }; });
      const ok = fits.filter(x => x.fit), bw = weights(ok.map(x => x.fit.bic));
      ok.forEach((x, i) => { x.bicWeight = bw[i]; });
      const diffs = []; for (let a = 0; a < ok.length; a++) for (let b = a + 1; b < ok.length; b++) { const A = ok[a].fit, B = ok[b].fit; if (A.df === B.df) continue; const [r_, f_] = A.df > B.df ? [ok[a], ok[b]] : [ok[b], ok[a]]; const dchi = r_.fit.chi2 - f_.fit.chi2, ddf = r_.fit.df - f_.fit.df; diffs.push({ restricted: r_.name, free: f_.name, dchi, ddf, p: chi2sf(dchi, ddf) }); }
      return { kind: 'compare', method: 'cbsem', models: fits, diffs };
    }
    const reps = models.map((mo, z) => { let r = null, err = null; try { r = E.runPLS(ds, mo.model, settings); } catch (e) { err = e.message; } if (progress) progress((z + 1) / models.length); return { name: mo.name, rep: r, error: err }; });
    const ok = reps.filter(x => x.rep), targets = {};
    ok.forEach(x => x.rep.selection.forEach(s => { (targets[s.construct] = targets[s.construct] || []).push({ model: x.name, k: s.k, r2: x.rep.r2[x.rep.constructs.indexOf(s.construct)], aic: s.aic, bic: s.bic, hq: s.hq }); }));
    const out = Object.keys(targets).filter(k => targets[k].length >= 2).map(k => { const rows = targets[k], bw = weights(rows.map(r => r.bic)); rows.forEach((r, i) => { r.bicWeight = bw[i]; }); return { construct: k, rows }; });
    return { kind: 'compare', method: 'pls', targets: out, models: reps.map(x => ({ name: x.name, error: x.error, n: x.rep && x.rep.n, srmr: x.rep && x.rep.fit.saturated.srmr, gof: x.rep && x.rep.gof })) };
  }

  Object.assign(E, { dataFromCov, parseCovMatrix, cbsemMG, cbsemModerated, compareModels });
  if (typeof module !== 'undefined' && module.exports) module.exports = E;
})(typeof self !== 'undefined' ? self : this);
