// Checks the claims made in the example guides (js/examples.js) against the example data.
'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const E = require('../js/advanced3.js');
const root = path.join(__dirname, '..');
global.window = {}; require('../js/example-data.js');
const X = global.window.YP_EXDATA, EX = require('../js/examples.js'), S = E.DEFAULTS;
const near = (v, target, tol, msg) => assert.ok(Math.abs(v - target) <= tol, `${msg}: ${v} not ≈ ${target}`);
const ds = k => E.parseCSV(X[k].csv), M = (k, i) => X[k].models[i || 0].model;
const path_ = (r, a, b) => r.paths[r.constructs.indexOf(b)][r.constructs.indexOf(a)];
const brow = (b, key) => b.rows.find(x => x.key === key);

test('gallery and embedded data agree with the files in examples/', () => {
  assert.ok(EX.length >= 9);
  for (const ex of EX) {
    const d = X[ex.id]; assert.ok(d, ex.id);
    assert.strictEqual(d.file, ex.file);
    assert.strictEqual(fs.readFileSync(path.join(root, 'examples', ex.file), 'utf8').replace(/\r\n/g, '\n'), d.csv || d.matrix, ex.file); // Windows checkouts may use CRLF
    for (const a of ex.analyses) {
      assert.ok(d.models[a.model], ex.id + ' model ' + a.model);
      for (const k of ['how', 'read', 'expect']) { assert.ok(a[k].ar && a[k].en, `${ex.id}/${a.kind} ${k}`); }
    }
    for (const k of ['title', 'story']) assert.ok(ex[k].ar && ex[k].en);
    ex.vars.forEach(v => assert.strictEqual(v.length, 3));
  }
  // every analysis of the app is illustrated by at least one example
  const kinds = new Set(EX.flatMap(e => e.analyses.map(a => a.kind)));
  for (const k of ['pls', 'plsc', 'bootstrap', 'cca', 'blindfolding', 'predict', 'cvpat', 'ipma', 'mga', 'nca', 'cta', 'copula', 'fimix', 'pos', 'compare', 'cbsem', 'cbsemmg', 'gsca', 'process', 'regression', 'logistic', 'samplesize']) assert.ok(kinds.has(k), k);
  assert.ok(fs.readFileSync(path.join(root, 'tools/make_examples.js'), 'utf8').includes('YP_EXDATA'));
});

test('customer satisfaction: PLS, bootstrap, PLSc, quality criteria', () => {
  const d = ds('customer'), m = M('customer'), r = E.runPLS(d, m, S);
  r.reliability.forEach(x => { assert.ok(x.ave > 0.5); assert.ok(x.rhoC > 0.8); });
  near(r.reliability[0].ave, 0.54, 0.01, 'AVE image'); near(r.reliability[5].alpha, 0.64, 0.01, 'alpha loyalty');
  near(Math.max(...r.htmt.flat().filter(v => isFinite(v) && v < 0.9999)), 0.59, 0.01, 'max HTMT');
  near(r.r2[4], 0.28, 0.01, 'R2 sat'); near(r.r2[5], 0.21, 0.01, 'R2 loy'); near(r.fit.saturated.srmr, 0.067, 0.002, 'SRMR');
  assert.ok(Math.max(...r.innerVIF.flat().filter(isFinite)) <= 1.6);
  const b = E.bootstrap(d, m, S, { samples: 1000, seed: 1 });
  b.rows.filter(x => x.group === 'path').forEach(x => assert.ok(x.p < 0.05, x.key));
  near(brow(b, 'path|Satisfaction -> Loyalty').original, 0.36, 0.01, 'sat-loy'); near(brow(b, 'path|Image -> Satisfaction').original, 0.14, 0.01, 'img-sat');
  const ind = brow(b, 'indirect|Image -> Loyalty'); near(ind.original, 0.105, 0.01, 'indirect'); assert.ok(ind.p < 0.05);
  near(brow(b, 'total|Image -> Loyalty').original, 0.31, 0.01, 'total');
  const pc = E.runPLS(d, m, Object.assign({}, S, { consistent: true }));
  near(path_(pc, 'Satisfaction', 'Loyalty'), 0.50, 0.01, 'PLSc'); near(pc.r2[5], 0.39, 0.01, 'PLSc R2');
});

test('customer satisfaction: prediction, IPMA, NCA, CCA, sample size', () => {
  const d = ds('customer'), m = M('customer');
  const bf = E.blindfolding(d, m, S, { distance: 7 }); bf.rows.forEach(x => assert.ok(x.q2 > 0.09 && x.q2 < 0.18, x.construct));
  const pr = E.plspredict(d, m, S, { folds: 10, reps: 10, seed: 1 }), loy = pr.rows.filter(x => x.construct === 'Loyalty');
  loy.forEach(x => assert.ok(x.q2 > 0)); assert.deepStrictEqual(loy.map(x => x.plsRMSE < x.lmRMSE), [true, false, true]);
  const cv = E.cvpat(d, m, S, { folds: 10, reps: 10, seed: 1 }); assert.ok(cv.overall.ia.p < 0.001 && cv.overall.lm.p < 0.05 && cv.overall.lm.diff > 0);
  const ip = E.ipma(d, m, S, { target: 'c6', ranges: Object.fromEntries(d.names.map(n => [n, { min: 1, max: 7 }])) });
  const imp = Object.fromEntries(ip.lvRows.map(x => [x.construct, x]));
  near(imp.Satisfaction.importance, 0.34, 0.01, 'imp sat'); near(imp.Image.importance, 0.29, 0.01, 'imp img'); near(imp.Value.importance, 0.06, 0.01, 'imp val');
  ip.lvRows.forEach(x => near(x.performance, 60, 2, 'performance ' + x.construct));
  const nc = E.nca(d, m, S, { permutations: 200 }); nc.rows.forEach(x => { assert.ok(x.d >= 0.15 && x.d <= 0.29 && x.p < 0.05, x.x + x.y); });
  near(nc.rows.find(x => x.x === 'Satisfaction').d, 0.28, 0.01, 'nca sat');
  const cc = E.fitTest(d, m, S, { samples: 300, seed: 1 }), s = cc.fitTest.saturated[0];
  near(s.value, 0.067, 0.002, 'cca srmr'); assert.ok(s.ok === false); near(s.hi95, 0.055, 0.004, 'HI95');
  assert.strictEqual(E.sampleSize({ pmin: 0.2, alpha: 0.05, power: 0.8 }).n, 155);
});

test('customer satisfaction: CB-SEM, multigroup CB-SEM, GSCA, model comparison', () => {
  const d = ds('customer'), m = M('customer');
  const cb = E.cbsem(d, m, S, {}), F = cb.fit;
  assert.strictEqual(F.df, 179); near(F.chi2, 238.6, 0.5, 'chi2'); near(F.cfi, 0.966, 0.002, 'cfi'); near(F.rmsea, 0.033, 0.002, 'rmsea'); near(F.srmr, 0.044, 0.002, 'srmr');
  cb.paths.forEach(p => assert.strictEqual(p.p < 0.05, !(p.from === 'Expectation' && p.to === 'Satisfaction'), p.from + p.to));
  const mg = E.cbsemMG(d, m, S, { groupVar: 'gender' });
  near(mg.invariance[0].dchi, 16, 0.5, 'metric dchi'); near(mg.invariance[0].p, 0.38, 0.01, 'metric p'); near(mg.invariance[1].p, 0.45, 0.01, 'scalar p');
  mg.invariance.forEach(x => assert.ok(Math.abs(x.dcfi) < 0.001));
  const gs = E.gsca(d, m, S, { samples: 100, seed: 1 }); near(gs.fit.FIT, 0.51, 0.01, 'FIT'); near(gs.fit.GFI, 0.95, 0.01, 'GFI'); near(gs.fit.SRMR, 0.068, 0.002, 'SRMR');
  const cm = E.compareModels(d, X.customer.models, S, {}), sat = cm.targets.find(x => x.construct === 'Satisfaction');
  sat.rows.forEach(x => near(x.bicWeight, 0.5, 0.01, 'bic weight'));
});

test('workload & wellbeing: moderation, mediation, quadratic effect', () => {
  const d = ds('wellbeing'), r = E.runPLS(d, M('wellbeing'), S);
  const wl = path_(r, 'Workload', 'Stress'), it = path_(r, 'Workload x Support', 'Stress');
  near(wl, 0.47, 0.01, 'wl'); near(path_(r, 'Support', 'Stress'), -0.22, 0.01, 'sup'); near(it, -0.26, 0.01, 'inter');
  near(wl + it, 0.21, 0.01, 'slope high'); near(wl - it, 0.73, 0.01, 'slope low'); near(r.r2[2], 0.34, 0.01, 'R2');
  const b = E.bootstrap(d, M('wellbeing'), S, { samples: 500, seed: 1 });
  assert.ok(brow(b, 'path|Workload x Support -> Stress').p < 0.001);
  const ind = brow(b, 'indirect|Workload -> Wellbeing'), dir = brow(b, 'path|Workload -> Wellbeing');
  near(ind.original, -0.17, 0.01, 'indirect'); assert.ok(ind.p < 0.05); near(dir.original, -0.03, 0.01, 'direct'); assert.ok(dir.p > 0.5);
  const b2 = E.bootstrap(d, M('wellbeing', 1), S, { samples: 500, seed: 1 }), q = brow(b2, 'path|Stress² -> Wellbeing');
  near(q.original, -0.25, 0.01, 'quadratic'); assert.ok(q.p < 0.001); near(brow(b2, 'f2|Stress² -> Wellbeing').original, 0.08, 0.01, 'f2');
  near(E.runPLS(d, M('wellbeing', 1), S).r2[3], 0.20, 0.01, 'R2 quad'); near(r.r2[3], 0.14, 0.01, 'R2 lin');
});

test('training: PROCESS models 4, 6, 7, 14, 1 and regression', () => {
  const d = ds('training'), run = o => E.processModel(d, {}, S, Object.assign({ x: 'training_hours', y: 'performance', m: [], samples: 1000, seed: 1, center: true }, o));
  const ef = (r, k) => r.effects.find(e => e.key === k), sig = e => e.lo > 0 || e.hi < 0;
  const p4 = run({ pmodel: 4, m: ['motivation'] });
  near(ef(p4, 'ind_0').value, 0.21, 0.01, 'ind'); assert.ok(sig(ef(p4, 'ind_0')) && sig(ef(p4, 'direct'))); near(ef(p4, 'total').value, 0.33, 0.01, 'total');
  near(ef(p4, 'ind_0').value / ef(p4, 'total').value, 0.63, 0.01, 'proportion');
  const p6 = run({ pmodel: 6, m: ['motivation', 'self_efficacy'] });
  ['ind_0', 'ind_1', 'ind_2', 'direct'].forEach(k => assert.ok(sig(ef(p6, k)), k));
  near(ef(p6, 'ind_0').value, 0.16, 0.01, 'm1'); near(ef(p6, 'ind_1').value, 0.03, 0.01, 'm2'); near(ef(p6, 'ind_2').value, 0.05, 0.01, 'serial'); near(ef(p6, 'direct').value, 0.09, 0.01, 'direct');
  const p7 = run({ pmodel: 7, m: ['motivation'], w: 'supervisor_support' });
  near(ef(p7, 'imm_0').value, 0.16, 0.01, 'imm'); assert.ok(sig(ef(p7, 'imm_0'))); assert.ok(!sig(ef(p7, 'cind_0_0')));
  near(ef(p7, 'cind_0_0').value, 0, 0.02, 'low'); near(ef(p7, 'cind_0_1').value, 0.21, 0.01, 'mean'); near(ef(p7, 'cind_0_2').value, 0.42, 0.01, 'high');
  const p14 = run({ pmodel: 14, m: ['motivation'], w: 'supervisor_support' });
  near(ef(p14, 'imm_0').value, 0, 0.01, 'imm14'); assert.ok(!sig(ef(p14, 'imm_0'))); [0, 1, 2].forEach(q => near(ef(p14, 'cind_0_' + q).value, 0.21, 0.01, 'cind14'));
  const p1 = run({ pmodel: 1, y: 'motivation', w: 'supervisor_support' });
  assert.ok(p1.equations[0].terms[3].p < 0.05); assert.ok(!sig(ef(p1, 'cond_0')));
  near(ef(p1, 'cond_0').value, 0, 0.005, 'c0'); near(ef(p1, 'cond_1').value, 0.05, 0.005, 'c1'); near(ef(p1, 'cond_2').value, 0.10, 0.005, 'c2');
  const g = E.regression(d, { y: 'performance', x: ['training_hours', 'motivation', 'self_efficacy', 'age'] }), t = n => g.terms.find(x => x.name === n);
  near(g.r2, 0.43, 0.01, 'R2'); near(t('motivation').beta, 0.42, 0.01, 'mot'); near(t('self_efficacy').beta, 0.26, 0.01, 'eff');
  near(t('training_hours').p, 0.06, 0.01, 'tr p'); near(t('age').p, 0.13, 0.01, 'age p'); g.terms.slice(1).forEach(x => assert.ok(x.vif < 1.6));
});

test('reputation: CTA, formative indicators, higher-order construct', () => {
  const d = ds('reputation');
  const c = E.cta(d, M('reputation'), S, { samples: 1000, seed: 1 }), by = Object.fromEntries(c.constructs.map(x => [x.construct, x.reflectiveRejected]));
  assert.deepStrictEqual(by, { Quality: true, CSR: true, Likeability: false });
  const r = E.runPLS(d, M('reputation'), S); r.outerVIF.slice(0, 2).flat().forEach(v => assert.ok(v < 2));
  const b = E.bootstrap(d, M('reputation'), S, { samples: 1000, seed: 1 }), w4 = brow(b, 'weight|csr_4 -> CSR');
  near(w4.original, -0.04, 0.01, 'csr_4'); near(w4.p, 0.81, 0.02, 'csr_4 p'); near(r.loadings[1][3], 0.46, 0.01, 'csr_4 loading');
  ['qual_1', 'qual_3'].forEach(n => assert.ok(brow(b, `weight|${n} -> Quality`).p > 0.05));
  assert.ok(r.loadings[0][0] > 0.45 && r.loadings[0][2] > 0.45);
  b.rows.filter(x => x.group === 'path').forEach(x => assert.ok(x.p < 0.05, x.key));
  const h = E.runPLS(d, M('reputation', 1), S);
  near(path_(h, 'Reputation', 'Competence'), 0.78, 0.01, 'comp'); near(path_(h, 'Reputation', 'Likeability'), 0.88, 0.01, 'like');
  near(path_(h, 'Reputation', 'Loyalty'), 0.36, 0.01, 'loy'); near(path_(h, 'Quality', 'Reputation'), 0.37, 0.01, 'qual'); near(path_(h, 'CSR', 'Reputation'), 0.41, 0.01, 'csr');
  near(h.reliability[2].rhoC, 0.84, 0.01, 'rhoC');
});

test('hidden segments: FIMIX-PLS and PLS-POS recover the two segments', () => {
  const d = ds('segments'), m = M('segments'), truth = d.cols[d.names.indexOf('true_segment')];
  const g = E.runPLS(d, m, S); near(path_(g, 'Satisfaction', 'Loyalty'), 0.46, 0.01, 'global sat'); near(path_(g, 'Price', 'Loyalty'), 0.39, 0.01, 'global price'); near(g.r2[2], 0.42, 0.01, 'global R2');
  const fx = E.fimix(d, m, S, { maxK: 4, K: 2, starts: 10, seed: 1 });
  ['aic3', 'bic', 'caic'].forEach(k => { const best = fx.table.reduce((a, x) => (x[k] < a[k] ? x : a)); assert.strictEqual(best.K, 2, k); });
  const v = s => Object.fromEntries(fx.segments[s].paths.map(p => [p.from, p.value]));
  near(fx.segments[0].share, 0.56, 0.01, 'share'); near(v(0).Satisfaction, 0.79, 0.01, 's1 sat'); near(v(0).Price, 0, 0.02, 's1 price'); near(v(1).Price, 0.92, 0.01, 's2 price'); near(v(1).Satisfaction, 0, 0.03, 's2 sat');
  near(fx.membership.filter(x => x.segment === truth[x.row - 1]).length / fx.membership.length, 0.77, 0.01, 'agreement');
  const ps = E.pos(d, m, S, { K: 2, starts: 5, seed: 1 }), pv = s => Object.fromEntries(ps.segments[s].paths.map(p => [p.from, p.value]));
  near(pv(0).Satisfaction, 0.84, 0.01, 'pos sat'); near(pv(1).Price, 0.94, 0.01, 'pos price'); ps.segments.forEach(s => assert.ok(s.r2[0].r2 >= 0.70));
});

test('advertising: copula detects endogeneity of the non-normal regressor', () => {
  const c = E.copula(ds('advertising'), M('advertising'), S, { samples: 500, seed: 1 }), nm = Object.fromEntries(c.normality.map(x => [x.construct, x]));
  assert.ok(nm.Advertising.nonNormal && !nm.Quality.nonNormal); near(nm.Advertising.skew, 6.6, 0.3, 'skew');
  const t = c.tests.find(x => x.copulas.length === 1 && x.copulas[0].term === 'c(Advertising)');
  assert.ok(t.copulas[0].p < 0.001); const p = t.paths.find(x => x.term === 'Advertising → Sales');
  near(p.original, 0.40, 0.01, 'original'); near(p.value, 0.12, 0.01, 'corrected');
});

test('purchase: logistic regression', () => {
  const r = E.logistic(ds('purchase'), {}, S, { y: 'bought', x: ['trust', 'price_sensitivity', 'income', 'age'] }), t = n => r.terms.find(x => x.name === n);
  near(t('trust').or, 2.1, 0.05, 'trust'); near(t('price_sensitivity').or, 0.63, 0.01, 'price'); near(t('income').or, 1.02, 0.005, 'income');
  ['trust', 'price_sensitivity', 'income'].forEach(n => assert.ok(t(n).p < 0.05)); near(t('age').p, 0.83, 0.01, 'age');
  near(r.auc, 0.76, 0.01, 'AUC'); near(r.table.accuracy, 0.71, 0.01, 'accuracy'); assert.ok(r.hlP > 0.05);
});

test('weighted survey: WPLS and MGA by region', () => {
  const d = ds('weighted'), m = M('weighted');
  const a = E.runPLS(d, m, S), w = E.runPLS(d, m, Object.assign({}, S, { weightVar: 'weight' }));
  near(a.paths[1][0], 0.27, 0.01, 'unweighted'); near(w.paths[1][0], 0.40, 0.01, 'weighted'); near(a.r2[1], 0.07, 0.01, 'R2'); near(w.r2[1], 0.16, 0.01, 'R2 w');
  const mg = E.mgaFull(d, m, S, { groupVar: 'region', permutations: 500, bootSamples: 300, seed: 1 }), res = mg.results[0], row = res.rows.find(x => x.group === 'path');
  res.micom.forEach(x => assert.ok(x.c >= x.c5));
  near(row.g1, 0.21, 0.01, 'urban'); near(row.g2, 0.51, 0.01, 'rural'); near(row.diff, -0.29, 0.01, 'diff');
  assert.ok(row.p < 0.01 && row.parP < 0.01 && row.wsP < 0.01 && (row.hP1 < 0.05 || row.hP1 > 0.95));
});

test('correlation matrix: CB-SEM on data reproducing the matrix', () => {
  const p = E.parseCovMatrix(X.matrix.matrix), n = X.matrix.n, cols = E.dataFromCov(p.names, p.C, n, p.means, 1);
  const d = { names: p.names, cols, kinds: p.names.map(() => 'num'), labels: p.names.map(() => null), n };
  const r = E.cbsem(d, M('matrix'), S, {}), F = r.fit;
  near(F.cfi, 0.97, 0.005, 'cfi'); near(F.rmsea, 0.06, 0.005, 'rmsea'); near(F.srmr, 0.03, 0.005, 'srmr');
  const pa = Object.fromEntries(r.paths.map(x => [x.from, x]));
  near(pa.Visual.std, 0.32, 0.01, 'visual'); assert.ok(pa.Visual.p < 0.005); near(pa.Textual.std, 0.18, 0.01, 'textual'); assert.ok(pa.Textual.p < 0.05);
  const rel = Object.fromEntries(r.reliability.map(x => [x.construct, x]));
  near(rel.Textual.cr, 0.88, 0.01, 'cr'); assert.ok(rel.Visual.ave < 0.5 && rel.Speed.ave < 0.5);
});
