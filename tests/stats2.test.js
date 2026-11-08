// Classic statistics II (js/stats2.js) against SciPy / statsmodels / pingouin / factor_analyzer reference values
// produced by tools/reference_stats2.py (tests/fixtures/stats2.json). Closed-form statistics are compared to ≈1e-6
// (relative), iterative or numerically integrated ones to ≈1e-4…1e-3. Where no library provides a statistic, the
// reference is an independent Python computation from its published definition (see the docstring of the script).
'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const E = require('../js/stats2.js'), S = E.st2;
const R = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'stats2.json'), 'utf8'));
const ex = name => E.parseCSV(fs.readFileSync(path.join(__dirname, '..', 'examples', name), 'utf8'));
const mk = o => ({ names: o.names, cols: o.cols.map(c => Float64Array.from(c, v => (v === null ? NaN : v))), kinds: o.kinds, labels: o.labels, n: o.cols[0].length });
const tableDS = tab => { const r = [], c = []; tab.forEach((row, i) => row.forEach((v, j) => { for (let q = 0; q < v; q++) { r.push(i + 1); c.push(j + 1); } })); return mk({ names: ['r', 'c'], cols: [r, c], kinds: ['num', 'num'], labels: [null, null] }); };
function close(a, b, tol, msg) {
  if (b === null || b === undefined) return;
  assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b} (tol ${tol})`);
}
const tp = ex('training_performance.csv'), cs = ex('customer_satisfaction.csv'), cr = ex('corporate_reputation.csv');

test('distribution functions', () => {
  close(S.pnorm(1.959963984540054), 0.975, 1e-14, 'pnorm'); close(S.qnorm(0.975), 1.959963984540054, 1e-12, 'qnorm');
  close(S.qnorm(1e-10), -6.361340902404056, 1e-10, 'qnorm tail'); close(S.qt(0.975, 10), 2.2281388519649385, 1e-10, 'qt');
  close(S.qchisq(0.95, 3), 7.814727903251178, 1e-10, 'qchisq'); close(S.qfU(0.05, 3, 20), 3.0983912121407795, 1e-10, 'qf');
  close(S.pchisqU(30, 2), Math.exp(-15), 1e-12, 'chisq upper tail');
});

test('correlation matrix: Pearson (t, Fisher-z CI), Spearman, Kendall τ-b, partial correlations', () => {
  const r = S.correlation(tp, { vars: R.corr.vars, methods: ['pearson', 'spearman', 'kendall'] });
  const rg = S.correlation(tp, { vars: R.corr.vars, methods: ['pearson'], alt: 'greater' });
  const rp = S.correlation(tp, { vars: R.corr.vars, methods: ['pearson', 'spearman'], covariates: [R.corr.covar] });
  R.corr.pairs.forEach((ref, i) => {
    const p = r.pairs[i], m = `${ref.x}~${ref.y}`; assert.strictEqual(p.x, ref.x);
    close(p.pearson.r, ref.r, 1e-10, m + ' r'); close(p.pearson.p, ref.p, 1e-7, m + ' p'); close(p.pearson.lo, ref.lo, 1e-8, m + ' lo'); close(p.pearson.hi, ref.hi, 1e-8, m + ' hi');
    close(p.pearson.cov, ref.cov, 1e-10, m + ' cov');
    close(rg.pairs[i].pearson.p, ref.pGreater, 1e-7, m + ' p greater'); close(rg.pairs[i].pearson.lo, ref.loGreater, 1e-8, m + ' lo greater');
    close(p.spearman.rho, ref.rho, 1e-10, m + ' rho'); close(p.spearman.p, ref.pRho, 1e-7, m + ' p rho');
    close(p.kendall.tau, ref.tau, 1e-10, m + ' tau'); close(p.kendall.p, ref.pTau, 1e-7, m + ' p tau');
    close(rp.pairs[i].pearson.r, ref.partial, 1e-10, m + ' partial'); close(rp.pairs[i].pearson.p, ref.pPartial, 1e-7, m + ' p partial');
    close(rp.pairs[i].pearson.lo, ref.loPartial, 1e-8, m + ' partial lo'); close(rp.pairs[i].pearson.hi, ref.hiPartial, 1e-8, m + ' partial hi');
    close(rp.pairs[i].spearman.rho, ref.partialRho, 1e-10, m + ' partial rho'); close(rp.pairs[i].spearman.p, ref.pPartialRho, 1e-7, m + ' partial rho p');
  });
  const k = R.corr.kendallExact; // no ties, n = 14: exact null distribution
  [['two', 'two-sided'], ['greater', 'greater'], ['less', 'less']].forEach(([a, b]) => { const q = S.kendall(k.x, k.y, a); assert.ok(q.exact); close(q.tau, k.res[b].tau, 1e-12, 'exact tau'); close(q.p, k.res[b].p, 1e-10, 'exact p ' + a); });
});

test('linear regression: hierarchical blocks, ΔR², coefficients, diagnostics, collinearity', () => {
  const L = S.linreg(tp, { y: R.linreg.y, blocks: R.linreg.blocks });
  L.models.forEach((m, i) => {
    const ref = R.linreg.models[i], a = m.model.anova;
    close(m.model.r2, ref.r2, 1e-10, 'R2'); close(m.model.r2adj, ref.r2adj, 1e-10, 'adj R2'); close(m.model.rmse, ref.rmse, 1e-10, 'RMSE');
    close(a.F, ref.F, 1e-8, 'F'); close(a.p, ref.pF, 1e-6, 'p F'); close(m.model.dw, ref.dw, 1e-10, 'DW'); close(a.ssr, ref.ssr, 1e-9, 'SSR'); close(a.sse, ref.sse, 1e-9, 'SSE');
    close(m.Fch, R.linreg.change[i].F, 1e-8, 'F change'); close(m.pch, R.linreg.change[i].p, 1e-6, 'p change');
  });
  L.models[1].model.terms.forEach((t, j) => { const ref = R.linreg.coef2[j]; ['b', 'se', 't', 'p', 'lo', 'hi', 'beta', 'vif', 'zero', 'partial', 'part'].forEach(k => close(t[k], ref[k], k === 'p' ? 1e-7 : 1e-8, t.name + ' ' + k)); });
  // casewise diagnostics: Cook's distance, leverage and internally studentized residuals (statsmodels OLSInfluence)
  L.diag.forEach((d, i) => { close(d[3], R.linreg.cooks[i], 1e-8, 'cook ' + i); close(d[4], R.linreg.leverage[i], 1e-9, 'leverage ' + i); close(d[2], R.linreg.sres[i], 1e-8, 'sres ' + i); });
  L.collin.dims.forEach((d, i) => { close(d.eigen, R.linreg.collin.eigen[i], 1e-8, 'eigen'); close(d.ci, R.linreg.collin.ci[i], 1e-6, 'condition index'); d.props.forEach((p, j) => close(p, R.linreg.collin.props[j][i], 1e-6, 'variance proportion')); });
  // forward / backward / stepwise selection reproduce the same sequence of models
  const cand = ['training_hours', 'age', 'supervisor_support', 'motivation', 'self_efficacy'];
  ['forward', 'backward', 'stepwise'].forEach(mth => {
    const s = S.linreg(tp, { y: 'performance', blocks: [cand], method: mth }), ref = R.linreg.steps[mth];
    assert.strictEqual(s.models.length, ref.length, mth + ' steps');
    s.models.forEach((m, i) => { assert.deepStrictEqual(m.model.names.slice().sort(), ref[i].vars.slice().sort(), mth + ' step ' + i); close(m.model.r2, ref[i].r2, 1e-10, mth + ' r2'); });
  });
});

test('multinomial logistic regression (statsmodels MNLogit) and ordinal logistic regression (OrderedModel)', () => {
  const ds = mk(R.synth), m = S.mlogit(ds, { y: 'outcome', x: ['x1', 'x2', 'grp'] });
  // order of parameters per category: intercept, x1, x2, grp=b, grp=c
  m.coefs.forEach((c, i) => { const k = Math.floor(i / 5), q = i % 5; close(c.b, R.mlogit.params[k][q], 1e-6, 'B ' + c.term); close(c.se, R.mlogit.bse[k][q], 1e-6, 'SE ' + c.term); });
  close(m.fit.LL, R.mlogit.llf, 1e-9, 'LL'); close(m.fit.LL0, R.mlogit.llnull, 1e-9, 'LL0'); close(m.fit.aic, R.mlogit.aic, 1e-9, 'AIC'); close(m.fit.bic, R.mlogit.bic, 1e-9, 'BIC');
  close(m.lrt.find(x => x.name === 'x2').chi, R.mlogit.lrX2, 1e-6, 'LR x2'); close(m.lrt.find(x => x.name === 'grp').chi, R.mlogit.lrGrp, 1e-6, 'LR grp');
  const o = S.ordinal(cs, { y: 'loy_1', x: ['sat_1', 'val_1', 'gender'] });
  assert.strictEqual(o.n, R.ordinal.n);
  o.coefs.forEach((c, i) => { close(c.b, R.ordinal.beta[i], 1e-5, 'beta ' + c.name); close(c.se, R.ordinal.bse[i], 1e-4, 'SE ' + c.name); });
  o.thresholds.forEach((t, i) => close(t.b, R.ordinal.thresholds[i], 1e-5, 'threshold ' + i));
  close(o.fit.LL, R.ordinal.llf, 1e-8, 'ordinal LL');
});

test('binomial test, χ² goodness of fit', () => {
  [['two', 'two-sided'], ['greater', 'greater'], ['less', 'less']].forEach(([a, b]) => {
    const r = S.binomTest(cs, { vars: ['gender'], p0: 0.5, alt: a }), lv = r.vars[0].levels.find(x => x.level === 'female'), ref = R.binom.gender[b];
    assert.strictEqual(lv.k, ref.k); close(lv.p, ref.p, 1e-9, 'binom p ' + a); close(lv.lo, ref.lo, 1e-9, 'CP lo ' + a); close(lv.hi, ref.hi, 1e-9, 'CP hi ' + a);
  });
  const pd = ex('purchase_decision.csv'), b = S.binomTest(pd, { vars: ['bought'], p0: 0.3 }).vars[0].levels.find(x => x.level === '1');
  close(b.p, R.binom.bought.p, 1e-9, 'bought p'); close(b.lo, R.binom.bought.lo, 1e-9, 'bought lo'); close(b.hi, R.binom.bought.hi, 1e-9, 'bought hi');
  const g = S.chisqGOF(cs, { var: 'sat_1' }); close(g.chi, R.gof.sat.chi, 1e-10, 'GOF chi'); close(g.p, R.gof.sat.p, 1e-9, 'GOF p'); close(g.g2, R.gof.sat.g2, 1e-10, 'G2'); close(g.pG, R.gof.sat.pG, 1e-9, 'p G2');
  const g2 = S.chisqGOF(cs, { var: 'gender', expected: '0.4, 0.6' }); // levels in data order: female, male
  close(g2.chi, R.gof.gender46.chi, 1e-10, 'GOF custom'); close(g2.p, R.gof.gender46.p, 1e-9, 'GOF custom p');
});

test('contingency tables: χ², Yates, G², Fisher (2×2 and exact r×c), McNemar/Bowker, effect sizes, γ, τ-b', () => {
  Object.entries(R.crosstab).filter(([k]) => k[0] === 't').forEach(([k, ref]) => {
    const c = S.crosstab(tableDS(ref.tab), { rows: 'r', cols: 'c' });
    close(c.chi.stat, ref.chi, 1e-10, k + ' chi'); close(c.chi.p, ref.p, 1e-9, k + ' p'); assert.strictEqual(c.chi.df, ref.df);
    close(c.g2.stat, ref.g2, 1e-10, k + ' G2'); close(c.g2.p, ref.pG, 1e-9, k + ' p G2');
    c.exp.forEach((r, i) => r.forEach((v, j) => close(v, ref.expected[i][j], 1e-12, 'expected')));
    close(c.cramer, ref.cramer, 1e-10, k + ' V'); close(c.contingency, ref.contingency, 1e-10, k + ' C');
    close(c.gamma.gamma, ref.gamma, 1e-12, k + ' gamma'); close(c.gamma.ase, ref.gammaASE, 1e-10, k + ' gamma ASE');
    close(c.taub.tau, ref.taub, 1e-10, k + ' tau-b'); close(c.taub.p, ref.pTaub, 1e-8, k + ' tau-b p');
    close(c.fisher.p, ref['fisher_two-sided'], 1e-9, k + ' Fisher');
    if (ref.yates !== undefined) {
      close(c.yates.stat, ref.yates, 1e-10, 'Yates'); close(c.yates.p, ref.pYates, 1e-9, 'Yates p');
      close(c.fisher.pLess, ref.fisher_less, 1e-9, 'Fisher less'); close(c.fisher.pGreater, ref.fisher_greater, 1e-9, 'Fisher greater');
      close(c.or.or, ref.or, 1e-10, 'OR'); close(c.or.lo, ref.orLo, 1e-8, 'OR lo'); close(c.or.hi, ref.orHi, 1e-8, 'OR hi');
      close(c.rr.rr, ref.rr, 1e-10, 'RR'); close(c.rr.lo, ref.rrLo, 1e-8, 'RR lo'); close(c.rr.hi, ref.rrHi, 1e-8, 'RR hi'); close(c.phi, ref.phi, 1e-10, 'phi');
      close(c.mcnemar.stat, ref.mcn, 1e-10, 'McNemar'); close(c.mcnemar.p, ref.p_mcn, 1e-9, 'McNemar p'); close(c.mcnemar.statCC, ref.mcnCC, 1e-10, 'McNemar cc'); close(c.mcnemar.pCC, ref.p_mcnCC, 1e-9, 'McNemar cc p');
      close(c.mcnemar.pExact, ref.p_mcnExact, 1e-9, 'McNemar exact');
    }
    if (ref.bowker !== undefined) { close(c.bowker.stat, ref.bowker, 1e-10, 'Bowker'); close(c.bowker.p, ref.pBowker, 1e-9, 'Bowker p'); }
  });
  const gs = S.crosstab(cs, { rows: 'gender', cols: 'sat_1', seed: 1, mcB: 2000 }), ref = R.crosstab.gender_sat;
  close(gs.chi.stat, ref.chi, 1e-10, 'gender x sat chi'); close(gs.chi.p, ref.p, 1e-9, 'gender x sat p'); close(gs.cramer, ref.cramer, 1e-10, 'V');
  assert.ok(gs.fisher.p > 0 && gs.fisher.p <= 1);
});

test('reliability: α (Feldt CI), standardized α, ω, λ2, λ6, split-half, item statistics; reverse-scored items', () => {
  [['plain', []], ['reversed', R.rel.reverse]].forEach(([key, rev]) => {
    const r = S.reliability(cr, { vars: R.rel.items, reverse: rev }), ref = R.rel[key];
    close(r.alpha, ref.alpha, 1e-10, key + ' alpha'); close(r.alphaLo, ref.lo, 1e-8, key + ' alpha lo'); close(r.alphaHi, ref.hi, 1e-8, key + ' alpha hi');
    close(r.alphaStd, ref.alphaStd, 1e-10, key + ' std alpha'); close(r.rbar, ref.rbar, 1e-10, key + ' mean r');
    close(r.l2, ref.l2, 1e-10, key + ' lambda2'); close(r.l6, ref.l6, 1e-10, key + ' lambda6');
    close(r.omega, ref.omega, 1e-5, key + ' omega (one-factor ML, factor_analyzer)');
    close(r.split.r, ref.split, 1e-10, 'split r'); close(r.split.sb, ref.sb, 1e-10, 'Spearman-Brown'); close(r.split.guttman, ref.guttmanSplit, 1e-10, 'Guttman split-half');
    r.itemsOut.forEach((it, i) => { close(it.itemRest, ref.items[i].itemRest, 1e-10, 'item-rest'); close(it.alpha, ref.items[i].alphaDrop, 1e-10, 'alpha if deleted'); close(it.mean, ref.items[i].mean, 1e-12, 'mean'); close(it.sd, ref.items[i].sd, 1e-12, 'sd'); });
  });
});

test('intraclass correlations: six Shrout–Fleiss forms with F tests and confidence intervals (pingouin)', () => {
  const r = S.icc(ex('workload_wellbeing.csv'), { vars: R.icc.vars });
  r.rows.forEach((x, i) => { const ref = R.icc.rows[i]; ['icc', 'F', 'df1', 'df2', 'p', 'lo', 'hi'].forEach(k => close(x[k], ref[k], k === 'lo' || k === 'hi' ? 1e-7 : 1e-9, ref.type + ' ' + k)); });
});

// loadings agree up to the sign and the order of the factors
function matchCols(A, B, tol, msg) {
  const m = B[0].length, used = new Set();
  for (let j = 0; j < m; j++) {
    let best = null;
    for (let q = 0; q < m; q++) if (!used.has(q)) for (const s of [1, -1]) { const d = Math.max(...A.map((r, i) => Math.abs(s * r[q] - B[i][j]))); if (!best || d < best.d) best = { q, s, d }; }
    used.add(best.q); assert.ok(best.d <= tol, `${msg}: factor ${j} differs by ${best.d}`);
  }
}
test('factor analysis: KMO, Bartlett, extraction (ML, minres, PA, PCA), rotations, ML χ²', () => {
  const F = R.efa;
  const ml = S.factor(cr, { vars: F.vars, nfMode: 'manual', nf: F.nf, extraction: 'ml', rotation: 'none' });
  close(ml.kmo.overall, F.kmo, 1e-10, 'KMO'); ml.kmo.msa.forEach((v, i) => close(v, F.msa[i], 1e-10, 'MSA'));
  close(ml.bartlett.chi, F.bartlett, 1e-9, 'Bartlett'); close(ml.bartlett.p, F.pBartlett, 1e-9, 'Bartlett p');
  ml.eigen.forEach((v, i) => close(v, F.eigen[i], 1e-10, 'eigenvalue'));
  close(ml.fit.chi, F.mlChi, 1e-3, 'ML chi2'); assert.strictEqual(ml.fit.df, F.mlDf); close(ml.fit.rmsea, F.mlRmsea === undefined ? F.rmsea : F.mlRmsea, 1e-4, 'RMSEA');
  for (const meth of ['ml', 'minres', 'pa', 'pc']) {
    const ref = F.fits[meth], pca = meth === 'pc';
    const un = S.factor(cr, { vars: F.vars, nfMode: 'manual', nf: F.nf, extraction: meth, rotation: 'none' }, pca);
    matchCols(un.loadings, ref.unrotated, meth === 'pa' || meth === 'pc' ? 1e-8 : 2e-4, meth + ' unrotated');
    // rotation algorithms are checked on the reference's own unrotated loadings (exact comparison of the rotation step)
    Object.entries(ref.rot).forEach(([rm, rr]) => {
      const out = S.rotate(ref.unrotated, rm);
      matchCols(out.L, rr.L, 1e-6, `${meth}/${rm}`);
      if (rr.phi) { const ph = out.Phi; const off = a => Math.abs(a); rr.phi.forEach((row, i) => row.forEach((v, j) => { if (i !== j) assert.ok(Math.min(...ph.map(r => Math.min(...r.map(x => Math.abs(off(x) - Math.abs(v)))))) < 1e-6, `${meth}/${rm} phi`); })); }
      const full = S.factor(cr, { vars: F.vars, nfMode: 'manual', nf: F.nf, extraction: meth, rotation: rm }, pca);
      matchCols(full.loadings, rr.L, meth === 'pa' || meth === 'pc' ? 1e-6 : 1e-3, `${meth}/${rm} end-to-end`);
    });
  }
  // number of factors: parallel analysis and Kaiser criterion run and give sensible counts
  const auto = S.factor(cr, { vars: F.vars, nfMode: 'parallel', extraction: 'minres', rotation: 'oblimin', parB: 30, seed: 3 });
  assert.ok(auto.m >= 1 && auto.m <= 5); assert.strictEqual(auto.nKaiser, F.eigen.filter(v => v > 1).length);
});

test('Bayesian t-tests: JZS Bayes factors (two- and one-sided) and the δ posterior', () => {
  const B = R.bttest, mot = Float64Array.from(tp.cols[tp.names.indexOf('motivation')]), se = Float64Array.from(tp.cols[tp.names.indexOf('self_efficacy')]);
  const one = mk({ names: ['m'], cols: [Array.from(mot.slice(0, 25))], kinds: ['num'], labels: [null] });
  const pair = mk({ names: ['a', 'b'], cols: [Array.from(se.slice(0, 40)), Array.from(mot.slice(0, 40))], kinds: ['num', 'num'], labels: [null, null] });
  const runs = { one: o => S.bttest(one, Object.assign({ type: 'one', y: 'm', mu0: B.mu0 }, o)), paired: o => S.bttest(pair, Object.assign({ type: 'paired', y: 'a', y2: 'b' }, o)), independent: o => S.bttest(cs, Object.assign({ type: 'independent', y: 'sat_1', group: 'gender' }, o)) };
  Object.entries(runs).forEach(([key, run]) => {
    const ref = B.cases[key], two = run({ r: B.r });
    close(two.t, ref.t, 1e-10, key + ' t'); close(two.bf10, ref.bf10, 1e-6, key + ' BF10');
    close(Math.exp(S.deltaPosterior(two.t, two.N, two.df, B.r, 'two').logBF10), ref.bf10, 1e-6, key + ' BF10 via δ grid');
    close(run({ r: B.r, hyp: 'greater' }).bf10, ref.bfPlus, 1e-6, key + ' BF+0'); close(run({ r: B.r, hyp: 'less' }).bf10, ref.bfMinus, 1e-6, key + ' BF-0');
    close(two.lo, ref.post[0], 2e-4, key + ' CrI lo'); close(two.median, ref.post[1], 2e-4, key + ' median'); close(two.hi, ref.post[2], 2e-4, key + ' CrI hi');
    if (ref.postPlus) { const g = run({ r: B.r, hyp: 'greater' }); close(g.median, ref.postPlus[1], 2e-4, key + ' median (δ>0)'); close(g.hi, ref.postPlus[2], 2e-4, key + ' CrI hi (δ>0)'); }
    if (ref.bf10wide) close(run({ r: 1 }).bf10, ref.bf10wide, 1e-6, 'BF10 r = 1');
  });
});

test('Bayesian Pearson correlation (Ly et al., 2016), Bayesian binomial test, Gunel–Dickey contingency Bayes factors', () => {
  R.bcorr.forEach(ref => {
    const x = Float64Array.from(tp.cols[tp.names.indexOf(ref.x)]).slice(0, ref.n), y = Float64Array.from(tp.cols[tp.names.indexOf(ref.y)]).slice(0, ref.n);
    const ds = mk({ names: ['x', 'y'], cols: [Array.from(x), Array.from(y)], kinds: ['num', 'num'], labels: [null, null] });
    const p = S.bcorr(ds, { vars: ['x', 'y'] }).pairs[0], m = `${ref.x}~${ref.y} n=${ref.n}`;
    close(p.r, ref.r, 1e-12, m + ' r'); close(p.bf10, ref.bf10, 1e-8, m + ' BF10 (analytic)');
    close(Math.exp(p.logBF10num), ref.bf10, 1e-5, m + ' BF10 by integrating the likelihood');
    // directional BFs: pingouin's closed form (BF10 ± C) cancels catastrophically when the evidence is very strong
    // (it then returns 0), so they are also checked against an mpmath integration of the exact likelihood
    const bp = S.bcorr(ds, { vars: ['x', 'y'], hyp: 'greater' }).pairs[0].bf10, bm = S.bcorr(ds, { vars: ['x', 'y'], hyp: 'less' }).pairs[0].bf10;
    close(bp, ref.bfPlusNum, 1e-6, m + ' BF+0 (integral)'); close(bm, ref.bfMinusNum, 1e-6, m + ' BF-0 (integral)');
    if (ref.bf10 < 1e6) { close(bp, ref.bfPlus, 1e-5, m + ' BF+0 (pingouin)'); close(bm, ref.bfMinus, 1e-5, m + ' BF-0 (pingouin)'); }
    close(S.bcorr(ds, { vars: ['x', 'y'], kappa: 0.5 }).pairs[0].bf10, ref.bf10k2, 1e-8, m + ' BF10 κ=0.5');
    if (ref.post) { close(p.lo, ref.post[0], 2e-4, m + ' CrI lo'); close(p.median, ref.post[1], 2e-4, m + ' median'); close(p.hi, ref.post[2], 2e-4, m + ' CrI hi'); }
  });
  R.bbinom.forEach(ref => {
    const col = Array.from({ length: ref.n }, (_, i) => (i < ref.k ? 1 : 2)), ds = mk({ names: ['v'], cols: [col], kinds: ['num'], labels: [null] });
    const o = h => S.bbinom(ds, { vars: ['v'], p0: ref.p0, a: ref.a, b: ref.b, hyp: h }).vars[0].levels[0];
    close(o('two').bf10, ref.bf10, 1e-9, 'binomial BF10'); close(o('greater').bf10, ref.bfPlus, 1e-8, 'binomial BF+0'); close(o('less').bf10, ref.bfMinus, 1e-8, 'binomial BF-0');
    const t = o('two'); close(t.lo, ref.post[0], 1e-9, 'posterior lo'); close(t.median, ref.post[1], 1e-9, 'posterior median'); close(t.hi, ref.post[2], 1e-9, 'posterior hi');
  });
  Object.entries(R.bcont).forEach(([k, ref]) => {
    const tab = R.crosstab[k].tab;
    ['joint', 'rows', 'cols'].forEach(d => close(S.contingencyLogBF(tab, d), ref[d], 1e-10, k + ' ' + d));
    if (ref.rowsIntegral !== undefined) close(S.contingencyLogBF(tab, 'rows'), ref.rowsIntegral, 1e-8, 'rows-fixed BF by direct integration');
    const b = S.bcont(tableDS(tab), { rows: 'r', cols: 'c', design: 'joint' }); close(b.logBF10, ref.joint, 1e-10, 'bcont task');
  });
});

test('classical meta-analysis: FE, DL, PM, REML, ML; heterogeneity; prediction interval; Egger; fail-safe N', () => {
  const M = R.meta, ds = mk({ names: ['study', 'yi', 'vi'], cols: [M.labels.map((_, i) => i + 1), M.yi, M.vi], kinds: ['cat', 'num', 'num'], labels: [M.labels, null, null] });
  const run = method => S.meta(ds, { es: 'yi', se: 'vi', seType: 'var', method, label: 'study' });
  const fe = run('FE'); close(fe.mu, M.FE.mu, 1e-10, 'FE mu'); close(fe.se, M.FE.se, 1e-10, 'FE se'); close(fe.Q, M.FE.Q, 1e-10, 'Q'); close(fe.I2, M.FE.I2, 1e-9, 'FE I2'); close(fe.H2, M.FE.H2, 1e-10, 'FE H2');
  ['DL', 'PM', 'REML', 'ML'].forEach(m => {
    const r = run(m), ref = M[m], tol = m === 'DL' ? 1e-10 : 1e-7;
    ['tau2', 'mu', 'se', 'z', 'p', 'I2', 'H2', 'piLo', 'piHi'].forEach(k => close(r[k], ref[k], tol, m + ' ' + k));
    if (ref.muSM !== undefined) close(r.mu, ref.muSM, tol, m + ' mu (statsmodels)');
    if (ref.I2SM !== undefined) close(r.I2, ref.I2SM, 1e-9, m + ' I2 (statsmodels)');
  });
  const r = run('REML'); close(r.tau2, 0.3132, 1e-3, 'metafor dat.bcg REML tau2'); close(r.mu, -0.7145, 1e-3, 'metafor dat.bcg REML estimate');
  ['b0', 'se', 't', 'p'].forEach(k => close(r.egger[k], M.egger[k], 1e-8, 'Egger ' + k)); close(r.fsn, M.fsn, 1e-9, 'fail-safe N');
  assert.strictEqual(r.studies[0].label, 'Aronson');
});

test('every task runs through E.tasks and returns its result kind', () => {
  const syn = mk(R.synth), t22 = tableDS(R.crosstab.t22.tab);
  const calls = {
    st2_corr: [tp, { vars: ['motivation', 'performance', 'age'], methods: ['pearson', 'kendall'] }], st2_linreg: [tp, { y: 'performance', blocks: [['motivation']] }],
    st2_mlogit: [syn, { y: 'outcome', x: ['x1'] }], st2_ordinal: [cs, { y: 'loy_1', x: ['sat_1'] }], st2_binom: [cs, { vars: ['gender'] }], st2_gof: [cs, { var: 'sat_1' }],
    st2_crosstab: [t22, { rows: 'r', cols: 'c' }], st2_rel: [cr, { vars: ['like_1', 'like_2', 'like_3'] }], st2_icc: [cr, { vars: ['like_1', 'like_2'] }],
    st2_efa: [cr, { vars: ['qual_1', 'qual_2', 'qual_3', 'csr_1', 'csr_2', 'csr_3'], parB: 10 }], st2_pca: [cr, { vars: ['qual_1', 'qual_2', 'qual_3'], parB: 10 }],
    st2_bttest: [tp, { type: 'one', y: 'motivation', mu0: 5 }], st2_bcorr: [tp, { vars: ['motivation', 'age'] }], st2_bbinom: [cs, { vars: ['gender'] }], st2_bcont: [t22, { rows: 'r', cols: 'c' }]
  };
  Object.entries(calls).forEach(([k, [ds, o]]) => { const r = E.tasks[k](ds, null, {}, o); assert.strictEqual(r.kind, k, k); });
});

test('UI plugin: bilingual texts, methods with MathML formulas and references, tasks wired to the engine', () => {
  global.window = global.window || {}; global.self = global.window;
  delete require.cache[require.resolve('../js/ui-stats2.js')]; require('../js/ui-stats2.js');
  const P = global.window.YP_PLUGINS.find(p => p.id === 'stats2'); assert.ok(P);
  const en = P.i18n.en, ar = P.i18n.ar;
  assert.deepStrictEqual(Object.keys(en).filter(k => !ar[k]), [], 'keys only in en'); assert.deepStrictEqual(Object.keys(ar).filter(k => !en[k]), [], 'keys only in ar');
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui-stats2.js'), 'utf8');
  global.window.YPI18N = global.window.YPI18N || (() => { require('../js/i18n.js'); return global.window.YPI18N; })();
  const known = k => en[k] || (global.window.YPI18N && global.window.YPI18N.en[k]);
  const used = new Set([...src.matchAll(/\bt\('([a-z0-9_]+)'/gi)].map(m => m[1]).filter(k => !k.endsWith('_'))); // prefixes of dynamic keys are skipped
  Object.values(P.tasks).forEach(tk => { used.add(tk.title); used.add(tk.title + '_d'); tk.fields.forEach(f => used.add('f_' + f)); });
  P.menu.forEach(g => used.add(g.group));
  // dynamic families: option labels of every select field, evidence categories, ICC forms
  ['pairwise', 'listwise', 'two', 'greater', 'less', 'enter', 'forward', 'backward', 'stepwise', 'first', 'last', 'parallel', 'eigen', 'manual', 'minres', 'ml', 'pa', 'pc', 'none', 'varimax', 'quartimax', 'equamax', 'geominT', 'promax', 'oblimin', 'geominQ', 'one', 'paired', 'independent', 'joint', 'rows', 'cols', 'se', 'var', 'REML', 'ML', 'DL', 'PM', 'FE'].forEach(k => used.add('s2o_' + k));
  ['none', 'anecdotal', 'moderate', 'strong', 'vstrong', 'extreme', 'for_h1', 'for_h0'].forEach(k => used.add('s2_ev_' + k));
  ['ICC1', 'ICC2', 'ICC3', 'ICC1k', 'ICC2k', 'ICC3k'].forEach(k => used.add('s2_icc_' + k)); ['poor', 'moderate', 'good', 'excellent'].forEach(k => used.add('s2_q_' + k));
  ['two', 'greater', 'less'].forEach(k => { used.add('s2_h_' + k); used.add('s2_hr_' + k); used.add('s2_hp_' + k); });
  ['marvelous', 'meritorious', 'middling', 'mediocre', 'miserable', 'unacceptable'].forEach(k => used.add('s2_kmo_' + k));
  ['missing_var', 'need_two', 'need_three', 'too_few', 'levels', 'bad_p0', 'need_var', 'bad_expected', 'rotation', 'two_groups', 'meta_vars', 'meta_se'].forEach(k => used.add('err_st2_' + k));
  const eng = fs.readFileSync(path.join(__dirname, '..', 'js', 'stats2.js'), 'utf8'); [...eng.matchAll(/new Error\('(st2_[a-z0-9_]+)'\)/g)].forEach(m => used.add('err_' + m[1]));
  assert.deepStrictEqual([...used].filter(k => !known(k)), [], 'undefined i18n keys');
  const ids = new Set();
  P.methods.forEach(m => {
    assert.ok(!ids.has(m.id), 'duplicate method ' + m.id); ids.add(m.id);
    ['en', 'ar'].forEach(L => { assert.ok(m[L] && m[L].title && m[L].text && m[L].origin, `${m.id} ${L}`); });
    assert.ok(/^<math display="block">[\s\S]*<\/math>$/.test(m.formula), m.id + ' formula');
    const open = (m.formula.match(/<m[a-z]+[ >]/g) || []).length, close_ = (m.formula.match(/<\/m[a-z]+>/g) || []).length;
    assert.strictEqual(open, close_, m.id + ' balanced MathML');
    assert.ok(m.refs.length && m.refs.every(r => P.refs[r]), m.id + ' refs');
  });
  const cited = new Set([].concat(...P.methods.map(m => m.refs))); assert.deepStrictEqual(Object.keys(P.refs).filter(k => !cited.has(k)), [], 'uncited references');
  Object.entries(P.tasks).forEach(([k, tk]) => { assert.ok(E.tasks[k], 'engine task ' + k); assert.ok(tk.noModel); assert.ok(ids.has(tk.doc), 'doc ' + tk.doc); });
  [...src.matchAll(/doc: '([a-z0-9]+)'/g)].forEach(m => assert.ok(ids.has(m[1]), 'card doc ' + m[1]));
  Object.values(P.tasks).forEach(tk => tk.fields.forEach(f => assert.ok(P.fields[f], 'field ' + f)));
  P.menu.forEach(g => g.items.forEach(k => assert.ok(P.tasks[k], 'menu item ' + k)));
});
