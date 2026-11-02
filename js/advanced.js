/*
 * YouPls advanced analyses: CB-SEM (maximum likelihood), FIMIX-PLS, POS, CTA-PLS,
 * Gaussian-copula endogeneity tests and PROCESS models. Extends the engine in js/engine.js.
 * Browser: load after engine.js (adds to window.YPEngine). Node: require('./advanced.js') returns the engine.
 */
(function (root) {
  'use strict';
  const E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.YPEngine;
  const { mean, sd, quantile, inverse, solve, matmul, transpose, zeros, eye, dot, logdet, lgamma, rng, qnorm, pnorm, tTwoTailedP, olsFit } = E;

  // ------------------------------------------------------------ distributions
  function gammaP(a, x) { // regularised lower incomplete gamma
    if (x <= 0) return 0;
    if (x < a + 1) {
      let sum = 1 / a, del = sum, ap = a;
      for (let n = 0; n < 1000; n++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-15) break; }
      return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
    }
    let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
    for (let i = 1; i < 1000; i++) {
      const an = -i * (i - a); b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-15) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
  }
  const chi2cdf = (x, df) => gammaP(df / 2, x / 2);
  function ncchi2cdf(x, df, lam) { // Poisson mixture of central chi-squares
    if (lam <= 0) return chi2cdf(x, df);
    const h = lam / 2, j0 = Math.floor(h); let s = 0;
    for (let j = Math.max(0, j0 - 400); j < j0 + 400; j++) {
      const lw = -h + j * Math.log(h) - lgamma(j + 1), t = Math.exp(lw) * chi2cdf(x, df + 2 * j);
      s += t;
    }
    return Math.min(1, s);
  }
  function solveLambda(x, df, target) { // λ with ncchi2cdf(x, df, λ) = target (decreasing in λ)
    if (ncchi2cdf(x, df, 0) < target) return 0;
    let lo = 0, hi = Math.max(10, x * 2); while (ncchi2cdf(x, df, hi) > target) hi *= 2;
    for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (ncchi2cdf(x, df, mid) > target) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }

  // ------------------------------------------------------------------ CB-SEM
  /*
   * Measurement: x = Λη + ε; structure: η = Bη + ζ.  Σ(θ) = Λ(I−B)⁻¹Ψ(I−B)⁻ᵀΛᵀ + Θ.
   * Scaling by the first indicator of each construct (marker, loading 1). ML discrepancy
   * F = ln|Σ| + tr(SΣ⁻¹) − ln|S| − p, S with divisor n (as lavaan), minimised by BFGS with an analytic gradient.
   */
  function cbsem(ds, model, settings, opts, progress) {
    settings = Object.assign({}, E.DEFAULTS, settings || {});
    const prep = E.prepare(ds, model, settings), spec = prep.spec;
    if (spec.inter.length) throw new Error('cbsem_interactions');
    if (spec.lv.some(l => l.mode === 'B')) throw new Error('cbsem_formative');
    const X = prep.raw, p = X.length, n = X[0].length, m = spec.J;
    const mu = X.map(mean), S = zeros(p, p);
    for (let a = 0; a < p; a++) for (let b = a; b < p; b++) { let s = 0; for (let t = 0; t < n; t++) s += (X[a][t] - mu[a]) * (X[b][t] - mu[b]); S[a][b] = S[b][a] = s / n; }
    const ldS = logdet(S);
    // ---- parameters
    const par = [], single = new Set();
    spec.lv.forEach((l, j) => { if (l.idx.length === 1) single.add(l.idx[0]); l.idx.forEach((k, q) => { if (q > 0) par.push({ t: 'L', k, j }); }); });
    for (let j = 0; j < m; j++) spec.pred[j].forEach(i => par.push({ t: 'B', i: j, j: i }));   // B[j][i]: effect of i on j
    const exo = []; for (let j = 0; j < m; j++) if (!spec.pred[j].length) exo.push(j);
    exo.forEach((a, x) => exo.forEach((b, y) => { if (y >= x) par.push({ t: 'P', a, b }); }));
    for (let j = 0; j < m; j++) if (spec.pred[j].length) par.push({ t: 'P', a: j, b: j });
    for (let k = 0; k < p; k++) if (!(single.has(k) && spec.lv.filter(l => l.idx.includes(k)).length === 1)) par.push({ t: 'T', k });
    const q = par.length, df = p * (p + 1) / 2 - q;
    if (df < 0) throw new Error('cbsem_unidentified');
    // ---- start values
    const th = new Float64Array(q);
    const fvar = spec.lv.map(l => { const mk = l.idx[0]; if (l.idx.length === 1) return S[mk][mk]; const c = l.idx.slice(1).map(k => S[k][mk]); return Math.max(0.05 * S[mk][mk], mean(c)); });
    par.forEach((pp, z) => {
      if (pp.t === 'L') th[z] = S[pp.k][spec.lv[pp.j].idx[0]] / fvar[pp.j];
      else if (pp.t === 'B') th[z] = 0;
      else if (pp.t === 'P') th[z] = pp.a === pp.b ? (spec.pred[pp.a].length ? 0.5 : 1) * fvar[pp.a] : 0;
      else th[z] = 0.5 * S[pp.k][pp.k];
    });
    const build = t => {
      const L = zeros(p, m), B = zeros(m, m), Ps = zeros(m, m), Th = new Array(p).fill(0);
      spec.lv.forEach((l, j) => { L[l.idx[0]][j] = 1; });
      par.forEach((pp, z) => {
        if (pp.t === 'L') L[pp.k][pp.j] = t[z];
        else if (pp.t === 'B') B[pp.i][pp.j] = t[z];
        else if (pp.t === 'P') { Ps[pp.a][pp.b] = t[z]; Ps[pp.b][pp.a] = t[z]; }
        else Th[pp.k] = t[z];
      });
      const A = inverse(eye(m).map((r, i) => r.map((v, k) => v - B[i][k])));
      const M = matmul(matmul(A, Ps), transpose(A));
      const Sig = matmul(matmul(L, M), transpose(L)); for (let k = 0; k < p; k++) Sig[k][k] += Th[k];
      return { L, B, Ps, Th, A, M, Sig };
    };
    const F = t => {
      let st; try { st = build(t); } catch (e) { return Infinity; }
      let ld; try { ld = logdet(st.Sig); } catch (e) { return Infinity; }
      const Si = inverse(st.Sig); let tr = 0; for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) tr += S[a][b] * Si[b][a];
      return ld + tr - ldS - p;
    };
    const grad = t => {
      const st = build(t), Si = inverse(st.Sig), SiS = matmul(Si, S), W = matmul(SiS, Si).map((r, a) => r.map((v, b) => Si[a][b] - v));
      const WL = matmul(W, st.L), WLM = matmul(WL, st.M), G = matmul(transpose(st.L), WL), H = matmul(matmul(transpose(st.A), G), st.A), MGA = matmul(matmul(st.M, G), st.A);
      const g = new Float64Array(q);
      par.forEach((pp, z) => {
        if (pp.t === 'L') g[z] = 2 * WLM[pp.k][pp.j];
        else if (pp.t === 'B') g[z] = 2 * MGA[pp.j][pp.i];
        else if (pp.t === 'P') g[z] = pp.a === pp.b ? H[pp.a][pp.a] : 2 * H[pp.a][pp.b];
        else g[z] = W[pp.k][pp.k];
      });
      return g;
    };
    if (opts && opts.gradCheck) { // test hook: analytic vs numerical gradient at perturbed start values
      const th0 = Float64Array.from(th, (v, a) => v + 0.05 * Math.sin(a + 1)); const g0 = grad(th0), num = par.map((_, a) => { const tp = Float64Array.from(th0), tm = Float64Array.from(th0); tp[a] += 1e-6; tm[a] -= 1e-6; return (F(tp) - F(tm)) / 2e-6; });
      return { maxGradDiff: Math.max(...num.map((v, a) => Math.abs(v - g0[a]))) };
    }
    // ---- BFGS
    let f = F(th), g = grad(th), Hi = eye(q), it = 0, converged = false;
    if (!isFinite(f)) throw new Error('cbsem_start');
    for (it = 1; it <= 3000; it++) {
      let d = new Float64Array(q); for (let a = 0; a < q; a++) { let s = 0; for (let b = 0; b < q; b++) s -= Hi[a][b] * g[b]; d[a] = s; }
      let gd = dot(g, d); if (!(gd < 0)) { Hi = eye(q); d = Float64Array.from(g, v => -v); gd = -dot(g, g); }
      let step = 1, tn, fn;
      for (let ls = 0; ls < 60; ls++) { tn = Float64Array.from(th, (v, a) => v + step * d[a]); fn = F(tn); if (fn <= f + 1e-4 * step * gd) break; step *= 0.5; }
      if (!(fn <= f + 1e-4 * step * gd)) break;
      const gn = grad(tn), s = Float64Array.from(tn, (v, a) => v - th[a]), y = Float64Array.from(gn, (v, a) => v - g[a]), sy = dot(s, y);
      if (sy > 1e-14) {
        const r = 1 / sy, Hy = Hi.map(row => dot(row, y)), yHy = dot(y, Hy);
        for (let a = 0; a < q; a++) for (let b = 0; b < q; b++) Hi[a][b] += (1 + r * yHy) * r * s[a] * s[b] - r * (Hy[a] * s[b] + s[a] * Hy[b]);
      }
      const df_ = f - fn; th.set(tn); f = fn; g = gn;
      if (progress && it % 20 === 0) progress(Math.min(0.9, it / 600));
      if (Math.max(...Array.from(g, Math.abs)) < 1e-7 || (df_ >= 0 && df_ < 1e-14)) { converged = Math.max(...Array.from(g, Math.abs)) < 1e-4; break; }
    }
    // ---- standard errors from the expected information (as lavaan/semopy default):
    //      I_ab = (n/2) tr(Σ⁻¹ ∂Σ/∂θ_a Σ⁻¹ ∂Σ/∂θ_b), Cov(θ) = I⁻¹
    const S0 = build(th).Sig, S0i = inverse(S0), h = 1e-6;
    const dS = par.map((_, a) => { const tp = Float64Array.from(th), tm = Float64Array.from(th); tp[a] += h; tm[a] -= h; const P1 = build(tp).Sig, P2 = build(tm).Sig; return matmul(S0i, P1.map((r, i) => r.map((v, j) => (v - P2[i][j]) / (2 * h)))); });
    const info = zeros(q, q);
    for (let a = 0; a < q; a++) for (let b = a; b < q; b++) { let tr = 0; for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) tr += dS[a][i][j] * dS[b][j][i]; info[a][b] = info[b][a] = n / 2 * tr; }
    let cov = null; try { cov = inverse(info); } catch (e) { cov = null; }
    const se = par.map((_, z) => cov && cov[z][z] > 0 ? Math.sqrt(cov[z][z]) : NaN);
    const st = build(th), Sig = st.Sig, M = st.M;
    // ---- fit
    const chi2 = n * f, pchi = df > 0 ? 1 - chi2cdf(chi2, df) : NaN;
    let ldDiag = 0; for (let k = 0; k < p; k++) ldDiag += Math.log(S[k][k]);
    const chi0 = n * (ldDiag - ldS), df0 = p * (p - 1) / 2;
    const cfi = 1 - Math.max(chi2 - df, 0) / Math.max(chi0 - df0, chi2 - df, 1e-12);
    const tli = ((chi0 / df0) - (chi2 / Math.max(df, 1e-12))) / ((chi0 / df0) - 1);
    const rmsea = df > 0 ? Math.sqrt(Math.max(chi2 - df, 0) / (df * n)) : NaN;
    const rmseaLo = df > 0 ? Math.sqrt(solveLambda(chi2, df, 0.95) / (df * n)) : NaN, rmseaHi = df > 0 ? Math.sqrt(solveLambda(chi2, df, 0.05) / (df * n)) : NaN;
    let sr = 0, sc = 0; for (let a = 0; a < p; a++) for (let b = 0; b <= a; b++) { const r = (S[a][b] - Sig[a][b]) / Math.sqrt(S[a][a] * S[b][b]); sr += r * r; sc++; }
    const Si = inverse(Sig); let trSS = 0; for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) trSS += S[a][b] * Si[b][a];
    const logL = -n / 2 * (p * Math.log(2 * Math.PI) + logdet(Sig) + trSS);
    const SiS = matmul(Si, S); let g1 = 0, g2 = 0; for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) { const v = SiS[a][b] - (a === b ? 1 : 0); g1 += v * (SiS[b][a] - (a === b ? 1 : 0)); g2 += SiS[a][b] * SiS[b][a]; }
    const gfi = 1 - g1 / g2;
    const fit = { chi2, df, p: pchi, cfi, tli, rmsea, rmseaLo, rmseaHi, srmr: Math.sqrt(sr / sc), nfi: 1 - chi2 / chi0, gfi, agfi: df > 0 ? 1 - (p * (p + 1) / (2 * df)) * (1 - gfi) : NaN, aic: -2 * logL + 2 * q, bic: -2 * logL + q * Math.log(n), logL, chi0, df0, params: q, n, iterations: it, converged };
    // ---- estimates (unstandardised and completely standardised, as lavaan std.all)
    const names = spec.lv.map(l => l.name), ind = prep.names;
    const sdx = k => Math.sqrt(Sig[k][k]), sdl = j => Math.sqrt(M[j][j]);
    const z2p = z => 2 * (1 - pnorm(Math.abs(z)));
    const loadings = [], paths = [], covs = [], resid = [];
    spec.lv.forEach((l, j) => l.idx.forEach((k, qq) => {
      const z = par.findIndex(pp => pp.t === 'L' && pp.k === k && pp.j === j), est = st.L[k][j];
      loadings.push({ construct: names[j], indicator: ind[k], est, se: z >= 0 ? se[z] : NaN, z: z >= 0 ? est / se[z] : NaN, p: z >= 0 ? z2p(est / se[z]) : NaN, std: est * sdl(j) / sdx(k), fixed: z < 0 });
    }));
    par.forEach((pp, z) => {
      const est = th[z], zz = est / se[z];
      if (pp.t === 'B') paths.push({ from: names[pp.j], to: names[pp.i], est, se: se[z], z: zz, p: z2p(zz), std: est * sdl(pp.j) / sdl(pp.i) });
      if (pp.t === 'P') covs.push({ a: names[pp.a], b: names[pp.b], est, se: se[z], z: zz, p: z2p(zz), std: pp.a === pp.b ? est / M[pp.a][pp.a] : est / Math.sqrt(st.Ps[pp.a][pp.a] * st.Ps[pp.b][pp.b]), kind: pp.a === pp.b ? (spec.pred[pp.a].length ? 'resid' : 'var') : 'cov' });
      if (pp.t === 'T') resid.push({ indicator: ind[pp.k], est, se: se[z], z: zz, p: z2p(zz), std: est / Sig[pp.k][pp.k] });
    });
    const r2 = []; for (let j = 0; j < m; j++) if (spec.pred[j].length) r2.push({ construct: names[j], r2: 1 - st.Ps[j][j] / M[j][j] });
    const Bs = zeros(m, m); for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) if (st.B[i][j]) Bs[i][j] = st.B[i][j] * sdl(j) / sdl(i);
    const T = inverse(eye(m).map((r, i) => r.map((v, k) => v - Bs[i][k]))).map((r, i) => r.map((v, k) => (i === k ? v - 1 : v)));
    const effects = []; for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) if (i !== j && Math.abs(T[i][j]) > 1e-12) effects.push({ from: names[j], to: names[i], direct: Bs[i][j], indirect: T[i][j] - Bs[i][j], total: T[i][j] });
    const reliability = spec.lv.map((l, j) => {
      const ls = loadings.filter(x => x.construct === names[j]).map(x => x.std), s1 = ls.reduce((a, b) => a + b, 0), e = ls.reduce((a, b) => a + 1 - b * b, 0);
      return { construct: names[j], cr: ls.length > 1 ? s1 * s1 / (s1 * s1 + e) : 1, ave: ls.reduce((a, b) => a + b * b, 0) / ls.length };
    });
    const lvcorr = M.map((r, a) => r.map((v, b) => v / Math.sqrt(M[a][a] * M[b][b])));
    const resCorr = S.map((r, a) => r.map((v, b) => (v - Sig[a][b]) / Math.sqrt(S[a][a] * S[b][b])));
    if (progress) progress(1);
    return { kind: 'cbsem', n, fit, loadings, paths, covs, resid, r2, effects, reliability, constructs: names, lvcorr, indicators: ind, resCorr, heywood: resid.some(r => r.est < 0) || covs.some(c => c.kind !== 'cov' && c.est < 0) };
  }

  // ------------------------------------------------------------- FIMIX-PLS
  function structFromScores(rep) {
    const endo = []; rep.pred.forEach((P, j) => { if (P.length) endo.push(j); });
    return { Y: rep.scores.map(v => Float64Array.from(v)), endo, n: rep.scores[0].length };
  }
  function fimix(ds, model, settings, opts, progress) {
    opts = Object.assign({ maxK: 4, K: 2, starts: 10, maxIter: 1000, tol: 1e-9, seed: 1 }, opts || {});
    const rep = E.runPLS(ds, model, settings), { Y, endo, n } = structFromScores(rep), rand = rng(opts.seed);
    const preds = endo.map(j => rep.pred[j]);
    const em = K => {
      let best = null;
      for (let s = 0; s < (K === 1 ? 1 : opts.starts); s++) {
        let P = Array.from({ length: n }, () => { const r = Array.from({ length: K }, () => rand() + 1e-3); const t = r.reduce((a, b) => a + b, 0); return r.map(v => v / t); });
        let ll = -Infinity, pi, beta, s2, it;
        for (it = 0; it < opts.maxIter; it++) {
          pi = Array.from({ length: K }, (_, k) => P.reduce((a, r) => a + r[k], 0) / n);
          beta = []; s2 = [];
          endo.forEach((j, e) => {
            const X = preds[e].map(i => Y[i]), y = Y[j], bj = [], sj = [];
            for (let k = 0; k < K; k++) {
              const XtX = X.map(a => X.map(b => { let v = 0; for (let t = 0; t < n; t++) v += P[t][k] * a[t] * b[t]; return v; })), Xty = X.map(a => { let v = 0; for (let t = 0; t < n; t++) v += P[t][k] * a[t] * y[t]; return v; });
              XtX.forEach((r, a) => { r[a] += 1e-10; });
              const b = solve(XtX, Xty); let ss = 0, sw = 0;
              for (let t = 0; t < n; t++) { let r = y[t]; X.forEach((c, a) => { r -= b[a] * c[t]; }); ss += P[t][k] * r * r; sw += P[t][k]; }
              bj.push(b); sj.push(Math.max(ss / Math.max(sw, 1e-12), 1e-8));
            }
            beta.push(bj); s2.push(sj);
          });
          let llNew = 0;
          for (let t = 0; t < n; t++) {
            const lp = pi.map((pk, k) => {
              let v = Math.log(Math.max(pk, 1e-300));
              endo.forEach((j, e) => { let r = Y[j][t]; preds[e].forEach((i, a) => { r -= beta[e][k][a] * Y[i][t]; }); v += -0.5 * Math.log(2 * Math.PI * s2[e][k]) - r * r / (2 * s2[e][k]); });
              return v;
            });
            const mx = Math.max(...lp), sum = lp.reduce((a, v) => a + Math.exp(v - mx), 0);
            llNew += mx + Math.log(sum); P[t] = lp.map(v => Math.exp(v - mx) / sum);
          }
          const done = Math.abs(llNew - ll) < opts.tol * (1 + Math.abs(llNew)); ll = llNew;
          if (done) break;
        }
        if (!best || ll > best.ll) best = { ll, P, pi, beta, s2, iterations: it };
      }
      return best;
    };
    const table = [];
    let chosen = null;
    for (let K = 1; K <= opts.maxK; K++) {
      const r = em(K);
      const Nk = (K - 1) + K * endo.reduce((a, j, e) => a + preds[e].length + 1, 0), ll = r.ll;
      let ent = 0; r.P.forEach(row => row.forEach(v => { if (v > 0) ent -= v * Math.log(v); }));
      table.push({ K, lnL: ll, params: Nk, aic: -2 * ll + 2 * Nk, aic3: -2 * ll + 3 * Nk, aic4: -2 * ll + 4 * Nk, bic: -2 * ll + Math.log(n) * Nk, caic: -2 * ll + (Math.log(n) + 1) * Nk, hq: -2 * ll + 2 * Math.log(Math.log(n)) * Nk, mdl5: -2 * ll + 5 * Math.log(n) * Nk, en: K > 1 ? 1 - ent / (n * Math.log(K)) : NaN });
      if (K === opts.K) chosen = r;
      if (progress) progress(K / opts.maxK);
    }
    if (!chosen) chosen = em(opts.K);
    // order segments by size (largest first)
    const K = opts.K, order = Array.from({ length: K }, (_, k) => k).sort((a, b) => chosen.pi[b] - chosen.pi[a]);
    const assign = chosen.P.map(r => order.indexOf(r.indexOf(Math.max(...r))));
    const segs = order.map((k, s) => {
      const count = assign.filter(a => a === s).length;
      const paths = [], r2 = [];
      endo.forEach((j, e) => {
        preds[e].forEach((i, a) => paths.push({ from: rep.constructs[i], to: rep.constructs[j], value: chosen.beta[e][k][a] }));
        let vy = 0, sw = 0, my = 0; for (let t = 0; t < n; t++) { sw += chosen.P[t][k]; my += chosen.P[t][k] * Y[j][t]; } my /= sw;
        for (let t = 0; t < n; t++) vy += chosen.P[t][k] * Math.pow(Y[j][t] - my, 2); vy /= sw;
        r2.push({ construct: rep.constructs[j], r2: Math.max(0, 1 - chosen.s2[e][k] / vy) });
      });
      return { segment: s + 1, share: chosen.pi[k], count, paths, r2 };
    });
    const global = []; endo.forEach(j => rep.pred[j].forEach(i => global.push({ from: rep.constructs[i], to: rep.constructs[j], value: rep.paths[j][i] })));
    return { kind: 'fimix', K, n, table, segments: segs, global, membership: chosen.P.map((r, t) => ({ row: rep.rows[t] + 1, segment: assign[t] + 1, probs: order.map(k => r[k]) })) };
  }

  // ---------------------------------------------------------------------- POS
  // Prediction-oriented segmentation (after Becker, Rai, Ringle & Völckner, 2013): cases are moved to the segment whose
  // model predicts them best (smallest R²-scaled structural residual) until no case moves; best of several starts by Σ R².
  function pos(ds, model, settings, opts, progress) {
    settings = Object.assign({}, E.DEFAULTS, settings || {});
    opts = Object.assign({ K: 2, starts: 5, maxIter: 50, seed: 1 }, opts || {});
    const prep = E.prepare(ds, model, settings), spec = prep.spec, n = prep.raw[0].length, K = opts.K;
    if (spec.inter.length) throw new Error('no_interactions');
    const endo = []; for (let j = 0; j < spec.J; j++) if (spec.pred[j].length) endo.push(j);
    const minSize = Math.max(10, 2 * Math.max(...spec.lv.map(l => l.idx.length)), 3 * Math.max(...spec.pred.map(p => p.length)));
    if (n < K * minSize) throw new Error('pos_too_small');
    const rand = rng(opts.seed);
    const fitSeg = rows => {
      const raw = prep.raw.map(c => Float64Array.from(rows, t => c[t]));
      const mu = raw.map(c => mean(c)), sg = raw.map((c, k) => sd(c, mu[k]) || 1);
      return { f: E.fitFull(raw, spec, settings), mu, sg, n: rows.length };
    };
    const objective = segs => segs.reduce((a, s) => a + s.n / n * endo.reduce((b, j) => b + s.f.r2[j], 0), 0);
    let best = null;
    for (let st = 0; st < opts.starts; st++) {
      let lab = Array.from({ length: n }, () => Math.floor(rand() * K));
      let segs, it, moved = 0;
      for (it = 0; it < opts.maxIter; it++) {
        const groups = Array.from({ length: K }, (_, k) => lab.map((l, t) => (l === k ? t : -1)).filter(t => t >= 0));
        if (groups.some(g => g.length < minSize)) { // repair: give small segments the cases closest to their random seed
          groups.forEach((g, k) => { while (g.length < minSize) { const big = groups.reduce((a, x, i) => (x.length > groups[a].length ? i : a), 0); const t = groups[big].splice(Math.floor(rand() * groups[big].length), 1)[0]; g.push(t); lab[t] = k; } });
        }
        try { segs = groups.map(fitSeg); } catch (e) { segs = null; break; }
        const sizes = groups.map(g => g.length), next = lab.slice();
        moved = 0;
        for (let t = 0; t < n; t++) {
          let bestK = lab[t], bestD = Infinity;
          segs.forEach((s, k) => {
            const z = prep.raw.map((c, q) => (c[t] - s.mu[q]) / s.sg[q]);
            const y = spec.lv.map((l, j) => l.idx.reduce((a, q, r) => a + s.f.w[j][r] * z[q], 0));
            let d = 0; endo.forEach(j => { let r = y[j]; spec.pred[j].forEach(i => { r -= s.f.B[j][i] * y[i]; }); d += r * r / Math.max(1 - s.f.r2[j], 1e-6); });
            if (d < bestD) { bestD = d; bestK = k; }
          });
          if (bestK !== lab[t] && sizes[lab[t]] > minSize) { sizes[lab[t]]--; sizes[bestK]++; next[t] = bestK; moved++; }
        }
        lab = next; if (!moved) break;
      }
      if (!segs) continue;
      const groups = Array.from({ length: K }, (_, k) => lab.map((l, t) => (l === k ? t : -1)).filter(t => t >= 0));
      segs = groups.map(fitSeg);
      const obj = objective(segs);
      if (!best || obj > best.obj) best = { obj, lab: lab.slice(), segs, iterations: it };
      if (progress) progress((st + 1) / opts.starts);
    }
    if (!best) throw new Error('pos_failed');
    const glob = E.fitFull(prep.raw, spec, settings);
    const order = Array.from({ length: K }, (_, k) => k).sort((a, b) => best.segs[b].n - best.segs[a].n);
    const nm = j => spec.lv[j].name;
    const segments = order.map((k, s) => ({
      segment: s + 1, count: best.segs[k].n, share: best.segs[k].n / n,
      paths: endo.flatMap(j => spec.pred[j].map(i => ({ from: nm(i), to: nm(j), value: best.segs[k].f.B[j][i] }))),
      r2: endo.map(j => ({ construct: nm(j), r2: best.segs[k].f.r2[j] }))
    }));
    return {
      kind: 'pos', K, n, objective: best.obj, globalObjective: endo.reduce((a, j) => a + glob.r2[j], 0), minSize,
      global: endo.flatMap(j => spec.pred[j].map(i => ({ from: nm(i), to: nm(j), value: glob.B[j][i] }))), globalR2: endo.map(j => ({ construct: nm(j), r2: glob.r2[j] })),
      segments, membership: best.lab.map((l, t) => ({ row: prep.rows[t] + 1, segment: order.indexOf(l) + 1 }))
    };
  }

  // ------------------------------------------------------------------ CTA-PLS
  function covOf(cols) {
    const k = cols.length, n = cols[0].length, mu = cols.map(mean), C = zeros(k, k);
    for (let a = 0; a < k; a++) for (let b = a; b < k; b++) { let s = 0; for (let t = 0; t < n; t++) s += (cols[a][t] - mu[a]) * (cols[b][t] - mu[b]); C[a][b] = C[b][a] = s / (n - 1); }
    return C;
  }
  function tetradSet(k, C) {
    // all tetrads τ = σ_ab σ_cd − σ_ac σ_bd over quadruples, then a maximal non-redundant subset chosen greedily by the
    // rank of their gradients with respect to the covariances (Bollen & Ting, 2000); k(k−3)/2 tetrads remain.
    const all = [];
    for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) for (let c = b + 1; c < k; c++) for (let d = c + 1; d < k; d++) {
      all.push([a, b, c, d]); all.push([a, c, b, d]); all.push([a, d, b, c]);
    }
    const pairIdx = (i, j) => { if (i > j) [i, j] = [j, i]; return i * k - i * (i + 1) / 2 + (j - i - 1); };
    const P = k * (k - 1) / 2, basis = [], chosen = [];
    for (const [a, b, c, d] of all) { // τ = σ_ab σ_cd − σ_ac σ_bd
      const g = new Float64Array(P);
      g[pairIdx(a, b)] += C[c][d]; g[pairIdx(c, d)] += C[a][b]; g[pairIdx(a, c)] -= C[b][d]; g[pairIdx(b, d)] -= C[a][c];
      const v = Float64Array.from(g); basis.forEach(u => { const pr = dot(v, u); for (let i = 0; i < P; i++) v[i] -= pr * u[i]; });
      const nv = Math.sqrt(dot(v, v)), ng = Math.sqrt(dot(g, g));
      if (ng > 0 && nv > 1e-6 * ng) { basis.push(v.map(x => x / nv)); chosen.push([a, b, c, d]); }
      if (chosen.length >= k * (k - 3) / 2) break;
    }
    return chosen;
  }
  function cta(ds, model, settings, opts, progress) {
    settings = Object.assign({}, E.DEFAULTS, settings || {});
    opts = Object.assign({ samples: 1000, alpha: 0.05, seed: 1 }, opts || {});
    const prep = E.prepare(ds, model, settings), spec = prep.spec, n = prep.raw[0].length, rand = rng(opts.seed);
    const blocks = spec.lv.filter(l => !l.inter && l.idx.length >= 4);
    if (!blocks.length) throw new Error('cta_no_block');
    const tet = (C, [a, b, c, d]) => C[a][b] * C[c][d] - C[a][c] * C[b][d];
    const out = blocks.map(l => {
      const cols = l.idx.map(k => prep.raw[k]), C0 = covOf(cols), set = tetradSet(cols.length, C0);
      return { l, cols, set, orig: set.map(q => tet(C0, q)), draws: set.map(() => []) };
    });
    for (let b = 0; b < opts.samples; b++) {
      const idx = Int32Array.from({ length: n }, () => Math.floor(rand() * n));
      out.forEach(o => { const C = covOf(o.cols.map(c => Float64Array.from(idx, t => c[t]))); o.set.forEach((q, z) => o.draws[z].push(tet(C, q))); });
      if (progress && b % 50 === 0) progress(b / opts.samples);
    }
    const names = prep.names;
    return {
      kind: 'cta', samples: opts.samples, alpha: opts.alpha, n,
      constructs: out.map(o => {
        const m = o.set.length, adj = opts.alpha / m, zlo = qnorm(adj / 2), zhi = qnorm(1 - adj / 2);
        const rows = o.set.map((q, z) => {
          const d = o.draws[z].slice().sort((a, b) => a - b), mm = mean(d), s = sd(d, mm), orig = o.orig[z];
          const z0 = qnorm(Math.min(1 - 1e-9, Math.max(1e-9, d.filter(x => x < orig).length / d.length)));
          const lo = quantile(d, pnorm(2 * z0 + zlo)), hi = quantile(d, pnorm(2 * z0 + zhi));
          const ind = q.map(i => names[o.l.idx[i]]);
          return { tetrad: `${z + 1}: ${ind.join(',')}`, formula: `σ(${ind[0]},${ind[1]})σ(${ind[2]},${ind[3]}) − σ(${ind[0]},${ind[2]})σ(${ind[1]},${ind[3]})`, value: orig, mean: mm, sd: s, t: Math.abs(orig / s), p: tTwoTailedP(Math.abs(orig / s), d.length - 1), lo, hi, sig: lo > 0 || hi < 0 };
        });
        return { construct: o.l.name, indicators: o.cols.length, tetrads: m, adjAlpha: adj, rows, reflectiveRejected: rows.some(r => r.sig) };
      })
    };
  }

  // ---------------------------------------------------- Gaussian copula endogeneity
  function rankUniform(x) { // (rank − ½)/n with average ranks for ties → (0,1)
    const n = x.length, idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => x[a] - x[b]), r = new Float64Array(n);
    for (let i = 0; i < n;) { let j = i; while (j + 1 < n && x[idx[j + 1]] === x[idx[i]]) j++; const avg = (i + j) / 2 + 1; for (let q = i; q <= j; q++) r[idx[q]] = avg; i = j + 1; }
    return Float64Array.from(r, v => (v - 0.5) / n);
  }
  function ksNormal(x) { // Kolmogorov–Smirnov distance to the normal with estimated mean/SD (Lilliefors)
    const n = x.length, m = mean(x), s = sd(x, m), v = Array.from(x).sort((a, b) => a - b); let D = 0;
    v.forEach((xi, i) => { const F = pnorm((xi - m) / s); D = Math.max(D, Math.abs((i + 1) / n - F), Math.abs(F - i / n)); });
    return { D, crit: 0.886 / Math.sqrt(n) };
  }
  function copula(ds, model, settings, opts, progress) {
    opts = Object.assign({ samples: 1000, seed: 1 }, opts || {});
    const rep = E.runPLS(ds, model, settings), Y = rep.scores.map(v => Float64Array.from(v)), n = Y[0].length, rand = rng(opts.seed);
    const C = Y.map(y => Float64Array.from(rankUniform(y), qnorm));
    const normality = [], tests = [];
    const preds = new Set(); rep.pred.forEach(P => P.forEach(i => preds.add(i)));
    preds.forEach(i => { const ks = ksNormal(Y[i]); let m3 = 0, m4 = 0; Y[i].forEach(v => { m3 += v * v * v; m4 += v * v * v * v; }); normality.push({ construct: rep.constructs[i], D: ks.D, crit: ks.crit, nonNormal: ks.D > ks.crit, skew: m3 / n, kurt: m4 / n - 3 }); });
    const jobs = [];
    rep.pred.forEach((P, j) => { if (!P.length) return; P.forEach(i => jobs.push({ j, P, cop: [i] })); if (P.length > 1) jobs.push({ j, P, cop: P.slice() }); });
    jobs.forEach((job, z) => {
      const fitOn = rows => {
        const y = Float64Array.from(rows, t => Y[job.j][t]), X = job.P.map(i => Float64Array.from(rows, t => Y[i][t])).concat(job.cop.map(i => Float64Array.from(rows, t => C[i][t])));
        return olsFit(X, y).coef;
      };
      const all = Array.from({ length: n }, (_, t) => t), est = fitOn(all), draws = job.cop.map(() => []), pathDraws = job.P.map(() => []);
      for (let b = 0; b < opts.samples; b++) {
        const rows = Array.from({ length: n }, () => Math.floor(rand() * n));
        try { const c = fitOn(rows); job.cop.forEach((_, q) => draws[q].push(c[1 + job.P.length + q])); job.P.forEach((_, q) => pathDraws[q].push(c[1 + q])); } catch (e) { /* skip */ }
      }
      const stat = (v, d) => { const s = sd(d), srt = d.slice().sort((a, b) => a - b); return { value: v, sd: s, t: Math.abs(v / s), p: tTwoTailedP(Math.abs(v / s), d.length - 1), lo: quantile(srt, 0.025), hi: quantile(srt, 0.975) }; };
      tests.push({
        outcome: rep.constructs[job.j], model: job.cop.map(i => 'c(' + rep.constructs[i] + ')').join(' + '),
        copulas: job.cop.map((i, q) => Object.assign({ term: 'c(' + rep.constructs[i] + ')' }, stat(est[1 + job.P.length + q], draws[q]))),
        paths: job.P.map((i, q) => Object.assign({ term: rep.constructs[i] + ' → ' + rep.constructs[job.j], original: rep.paths[job.j][i] }, stat(est[1 + q], pathDraws[q])))
      });
      if (progress) progress((z + 1) / jobs.length);
    });
    return { kind: 'copula', n, samples: opts.samples, normality, tests };
  }

  // ------------------------------------------------------------------ PROCESS
  function olsFull(y, X, names) {
    const n = y.length, k = X.length, { coef, XtX } = olsFit(X, y), inv = inverse(XtX);
    let sse = 0, sst = 0; const my = mean(y);
    for (let t = 0; t < n; t++) { let v = coef[0]; X.forEach((c, q) => { v += coef[q + 1] * c[t]; }); sse += (y[t] - v) * (y[t] - v); sst += (y[t] - my) * (y[t] - my); }
    const df = n - k - 1, s2 = sse / df, r2 = 1 - sse / sst;
    return { coef, cov: inv.map(r => r.map(v => v * s2)), r2, df, F: (r2 / k) / ((1 - r2) / df), terms: ['constant'].concat(names).map((nm, q) => { const se = Math.sqrt(inv[q][q] * s2), t = coef[q] / se; return { name: nm, b: coef[q], se, t, p: tTwoTailedP(t, df), lo: coef[q] - 1.96 * se, hi: coef[q] + 1.96 * se }; }) };
  }
  function processModel(ds, model, settings, opts, progress) {
    opts = Object.assign({ pmodel: 4, m: [], samples: 5000, seed: 1, center: true }, opts || {});
    const pm = +opts.pmodel;
    const needW = [1, 7, 14].includes(pm), needM = [4, 6, 7, 14].includes(pm);
    if (!opts.x || !opts.y || (needW && !opts.w) || (needM && !opts.m.length) || (pm === 6 && opts.m.length !== 2)) throw new Error('process_vars');
    // variables: data columns or construct scores ("LV: name")
    let rep = null; const get = nm => {
      if (nm.startsWith('LV: ')) { if (!rep) rep = E.runPLS(ds, model, settings); const j = rep.constructs.indexOf(nm.slice(4)); const col = new Float64Array(ds.n).fill(NaN); rep.rows.forEach((r, t) => { col[r] = rep.scores[j][t]; }); return col; }
      const j = ds.names.indexOf(nm); if (j < 0) throw new Error('process_vars'); return ds.cols[j];
    };
    const names = [opts.x, opts.y].concat(opts.m).concat(needW ? [opts.w] : []);
    const raw = names.map(get), rows = []; for (let t = 0; t < ds.n; t++) if (raw.every(c => !isNaN(c[t]))) rows.push(t);
    const n = rows.length; if (n < 10) throw new Error('process_vars');
    const V = {}; names.forEach((nm, q) => { V[nm] = Float64Array.from(rows, t => raw[q][t]); });
    const cen = v => { if (!opts.center) return v; const m = mean(v); return Float64Array.from(v, x => x - m); };
    const prod = (a, b) => Float64Array.from(a, (v, t) => v * b[t]);
    const label = { x: opts.x, y: opts.y, w: opts.w };
    const wvals = needW ? (() => { const w = opts.center ? cen(V[opts.w]) : V[opts.w], m = mean(w), s = sd(w, m); return [m - s, m, m + s]; })() : [];
    const sub = (v, idx) => Float64Array.from(idx, t => v[t]);
    // one estimation on a row subset; returns equations (full sample only) and named effects
    const estimate = (idx, full) => {
      const x = sub(V[opts.x], idx), y = sub(V[opts.y], idx), M = opts.m.map(nm => sub(V[nm], idx)), w = needW ? sub(V[opts.w], idx) : null;
      const eqs = [], eff = {};
      if (pm === 1) {
        const xc = cen(x), wc = cen(w), r = olsFull(y, [xc, wc, prod(xc, wc)], [label.x, label.w, label.x + ' × ' + label.w]);
        eqs.push({ outcome: label.y, fit: r });
        wvals.forEach((wv, q) => { eff['cond_' + q] = r.coef[1] + r.coef[3] * wv; });
        if (full) eff._condSE = wvals.map(wv => Math.sqrt(r.cov[1][1] + wv * wv * r.cov[3][3] + 2 * wv * r.cov[1][3]));
      } else if (pm === 4 || pm === 6) {
        const a = [], mEq = [];
        M.forEach((mv, i) => {
          const X = pm === 6 && i === 1 ? [x, M[0]] : [x], nm = pm === 6 && i === 1 ? [label.x, opts.m[0]] : [label.x];
          const r = olsFull(mv, X, nm); mEq.push(r); a.push(r.coef[1]); eqs.push({ outcome: opts.m[i], fit: r });
        });
        const ry = olsFull(y, [x].concat(M), [label.x].concat(opts.m)); eqs.push({ outcome: label.y, fit: ry });
        const b = M.map((_, i) => ry.coef[2 + i]);
        if (pm === 4) M.forEach((_, i) => { eff['ind_' + i] = a[i] * b[i]; });
        else { eff.ind_0 = a[0] * b[0]; eff.ind_1 = a[1] * b[1]; eff.ind_2 = a[0] * mEq[1].coef[2] * b[1]; }
        eff.total_ind = Object.keys(eff).filter(k => k.startsWith('ind_')).reduce((s, k) => s + eff[k], 0);
        eff.direct = ry.coef[1];
        const rt = olsFull(y, [x], [label.x]); eff.total = rt.coef[1]; if (full) eqs.push({ outcome: label.y + ' (total effect model)', fit: rt });
      } else if (pm === 7) {
        const xc = cen(x), wc = cen(w), a1 = [], a3 = [];
        M.forEach((mv, i) => { const r = olsFull(mv, [xc, wc, prod(xc, wc)], [label.x, label.w, label.x + ' × ' + label.w]); a1.push(r.coef[1]); a3.push(r.coef[3]); eqs.push({ outcome: opts.m[i], fit: r }); });
        const ry = olsFull(y, [xc].concat(M), [label.x].concat(opts.m)); eqs.push({ outcome: label.y, fit: ry });
        M.forEach((_, i) => { const b = ry.coef[2 + i]; wvals.forEach((wv, q) => { eff[`cind_${i}_${q}`] = (a1[i] + a3[i] * wv) * b; }); eff['imm_' + i] = a3[i] * b; });
        eff.direct = ry.coef[1];
      } else if (pm === 14) {
        const a = [], wc = cen(w);
        M.forEach((mv, i) => { const r = olsFull(mv, [x], [label.x]); a.push(r.coef[1]); eqs.push({ outcome: opts.m[i], fit: r }); });
        const Mc = M.map(cen), X = [x].concat(Mc).concat([wc]).concat(Mc.map(mv => prod(mv, wc)));
        const ry = olsFull(y, X, [label.x].concat(opts.m).concat([label.w]).concat(opts.m.map(nm => nm + ' × ' + label.w))); eqs.push({ outcome: label.y, fit: ry });
        const k = M.length;
        M.forEach((_, i) => { const b1 = ry.coef[2 + i], b3 = ry.coef[2 + k + 1 + i]; wvals.forEach((wv, q) => { eff[`cind_${i}_${q}`] = a[i] * (b1 + b3 * wv); }); eff['imm_' + i] = a[i] * b3; });
        eff.direct = ry.coef[1];
      }
      return { eqs, eff };
    };
    const all = Array.from({ length: n }, (_, t) => t), base = estimate(all, true), rand = rng(opts.seed);
    const keys = Object.keys(base.eff).filter(k => !k.startsWith('_')), draws = keys.map(() => []);
    for (let b = 0; b < opts.samples; b++) {
      const idx = Array.from({ length: n }, () => Math.floor(rand() * n));
      try { const e = estimate(idx, false).eff; keys.forEach((k, q) => draws[q].push(e[k])); } catch (e) { /* singular resample */ }
      if (progress && b % 100 === 0) progress(b / opts.samples);
    }
    const effects = keys.map((k, q) => { const d = draws[q].slice().sort((a, b) => a - b); return { key: k, value: base.eff[k], se: sd(d), lo: quantile(d, 0.025), hi: quantile(d, 0.975) }; });
    return { kind: 'process', pmodel: pm, n, samples: opts.samples, center: !!opts.center, x: opts.x, y: opts.y, m: opts.m, w: opts.w, wvals, condSE: base.eff._condSE || null, equations: base.eqs.map(e => ({ outcome: e.outcome, r2: e.fit.r2, F: e.fit.F, df: e.fit.df, terms: e.fit.terms })), effects };
  }

  Object.assign(E, { cbsem, fimix, pos, cta, copula, processModel, chi2cdf, ncchi2cdf, gammaP, tetradSet, ksNormal });
  if (typeof module !== 'undefined' && module.exports) module.exports = E;
})(typeof self !== 'undefined' ? self : this);
