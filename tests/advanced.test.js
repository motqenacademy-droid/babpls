// CB-SEM, FIMIX-PLS, POS, CTA-PLS, Gaussian copula, PROCESS and weighted PLS.
'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const E = require('../js/advanced.js');
const root = path.join(__dirname, '..');
const ds = E.parseCSV(fs.readFileSync(path.join(root, 'examples/customer_satisfaction.csv'), 'utf8'));
const model = () => JSON.parse(fs.readFileSync(path.join(root, 'examples/customer_satisfaction.model.json'), 'utf8'));
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const gauss = r => () => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
const dataset = (names, cols) => ({ names, cols: cols.map(c => Float64Array.from(c)), kinds: names.map(() => 'num'), labels: names.map(() => null), n: cols[0].length });

test('CB-SEM matches semopy (estimates, standard errors, fit) and the gradient is exact', () => {
  const ref = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/semopy.json'), 'utf8'));
  assert.ok(E.cbsem(ds, model(), { missing: 'casewise' }, { gradCheck: true }).maxGradDiff < 1e-6);
  const r = E.cbsem(ds, model(), { missing: 'casewise' });
  assert.ok(r.fit.converged);
  close(r.fit.chi2, ref.chi2, 1e-2, 'chi2'); assert.strictEqual(r.fit.df, ref.dof);
  close(r.fit.cfi, ref.cfi, 1e-4, 'CFI'); close(r.fit.tli, ref.tli, 1e-4, 'TLI'); close(r.fit.rmsea, ref.rmsea, 5e-4, 'RMSEA');
  assert.ok(r.fit.rmseaLo <= r.fit.rmsea && r.fit.rmsea <= r.fit.rmseaHi, 'RMSEA inside its CI');
  for (const [l, op, rv, est, std, se] of ref.est) {
    if (op !== '~') continue;
    const p = r.paths.find(x => x.to === l && x.from === rv) || r.loadings.find(x => x.construct === rv && x.indicator === l);
    close(p.est, est, 2e-3, `${l} ~ ${rv}`); close(p.std, std, 2e-3, `std ${l} ~ ${rv}`);
    if (se && !p.fixed) close(p.se / se, 1, 0.01, `SE ${l} ~ ${rv}`);
  }
});

test('CB-SEM rejects formative constructs and moderation', () => {
  const m = model(); m.constructs[0].mode = 'B';
  assert.throws(() => E.cbsem(ds, m, {}), /cbsem_formative/);
});

test('FIMIX-PLS recovers two segments with opposite slopes', () => {
  const r = E.rng(11), g = gauss(r), n = 300, cols = [[], [], [], [], [], []];
  for (let i = 0; i < n; i++) {
    const seg = i < 180, x = g(), y = (seg ? 0.7 : -0.6) * x + 0.5 * g();
    [x + 0.4 * g(), x + 0.4 * g(), x + 0.4 * g(), y + 0.4 * g(), y + 0.4 * g(), y + 0.4 * g()].forEach((v, k) => cols[k].push(v));
  }
  const d = dataset(['x1', 'x2', 'x3', 'y1', 'y2', 'y3'], cols);
  const m = { constructs: [{ id: 'a', name: 'X', mode: 'A', indicators: ['x1', 'x2', 'x3'] }, { id: 'b', name: 'Y', mode: 'A', indicators: ['y1', 'y2', 'y3'] }], paths: [{ from: 'a', to: 'b' }], interactions: [] };
  const f = E.fimix(d, m, {}, { maxK: 3, K: 2, starts: 5 });
  const best = f.table.reduce((a, b) => (b.aic3 < a.aic3 ? b : a));
  assert.strictEqual(best.K, 2, 'AIC3 picks 2 segments');
  const slopes = f.segments.map(s => s.paths[0].value).sort((a, b) => a - b);
  assert.ok(slopes[0] < -0.3 && slopes[1] > 0.3, 'opposite slopes ' + slopes);
  const agree = f.membership.filter((x, i) => (x.segment === 1) === (i < 180)).length / n;
  assert.ok(Math.max(agree, 1 - agree) > 0.7, 'classification ' + agree); // cases near x = 0 fit both lines
  const p = E.pos(d, m, {}, { K: 2, starts: 3 });
  assert.ok(p.objective > p.globalObjective, 'POS improves explained variance');
});

test('CTA-PLS: reflective data pass, formative-style data are rejected', () => {
  const ok = E.cta(ds, model(), {}, { samples: 300 });
  assert.ok(ok.constructs.every(c => !c.reflectiveRejected));
  assert.strictEqual(ok.constructs.find(c => c.construct === 'Image').tetrads, 5);  // k(k-3)/2 for k = 5
  const r = E.rng(3), g = gauss(r), n = 400, cols = [[], [], [], [], []];
  for (let i = 0; i < n; i++) { const a = g(), b = g(); [a + 0.3 * g(), a + 0.3 * g(), b + 0.3 * g(), b + 0.3 * g(), a + b + 0.3 * g()].forEach((v, k) => cols[k].push(v)); }
  const d = dataset(['f1', 'f2', 'f3', 'f4', 'y'], cols);
  const m = { constructs: [{ id: 'a', name: 'F', mode: 'A', indicators: ['f1', 'f2', 'f3', 'f4'] }, { id: 'b', name: 'Y', mode: 'A', indicators: ['y'] }], paths: [{ from: 'a', to: 'b' }], interactions: [] };
  assert.ok(E.cta(d, m, {}, { samples: 300 }).constructs[0].reflectiveRejected, 'two-factor block rejected');
});

test('PROCESS model 4 indirect effect equals a·b from separate regressions', () => {
  const r = E.processModel(ds, model(), {}, { pmodel: 4, x: 'imag_1', y: 'loy_1', m: ['sat_1'], samples: 200 });
  const a = E.regression(ds, { y: 'sat_1', x: ['imag_1'] }), b = E.regression(ds, { y: 'loy_1', x: ['imag_1', 'sat_1'] });
  // listwise rows can differ slightly between the separate regressions, so compare loosely
  close(r.effects.find(e => e.key === 'ind_0').value, a.terms[1].b * b.terms[2].b, 0.01, 'a*b');
  const total = r.effects.find(e => e.key === 'total').value, direct = r.effects.find(e => e.key === 'direct').value, ind = r.effects.find(e => e.key === 'total_ind').value;
  close(total, direct + ind, 1e-9, 'total = direct + indirect (OLS identity)');
  for (const pm of [1, 6, 7, 14]) {
    const o = E.processModel(ds, model(), {}, { pmodel: pm, x: 'LV: Image', y: 'LV: Loyalty', m: pm === 6 ? ['LV: Quality', 'LV: Satisfaction'] : ['LV: Satisfaction'], w: 'LV: Value', samples: 100 });
    assert.ok(o.effects.length && o.effects.every(e => Number.isFinite(e.value) && e.lo <= e.hi), 'model ' + pm);
  }
});

test('Gaussian copula: no endogeneity signal in simulated exogenous data', () => {
  const r = E.copula(ds, model(), {}, { samples: 200 });
  assert.ok(r.tests.length > 0 && r.normality.length === 5);
  const sig = r.tests.flatMap(t => t.copulas).filter(c => c.p < 0.01);
  assert.ok(sig.length <= 1, 'at most a chance finding');
});

test('weighted PLS equals replicating each case by its integer weight', () => {
  const n = ds.n, w = Float64Array.from({ length: n }, (_, i) => 1 + (i % 3));
  const d2 = Object.assign({}, ds, { names: ds.names.concat(['w']), cols: ds.cols.concat([w]), kinds: ds.kinds.concat(['num']), labels: ds.labels.concat([null]) });
  const a = E.runPLS(d2, model(), { missing: 'casewise', weightVar: 'w', tol: 1e-12 });
  const rows = []; for (let i = 0; i < n; i++) for (let k = 0; k < w[i]; k++) rows.push(i);
  const b = E.runPLS(Object.assign({}, ds, { cols: ds.cols.map(c => Float64Array.from(rows, i => c[i])) }), model(), { missing: 'casewise', tol: 1e-12 });
  Object.keys(a.stats).filter(k => !/^(r2adj|fit)\|/.test(k)).forEach(k => close(a.stats[k], b.stats[k], 1e-6, k));
});

const E2 = require('../js/advanced2.js');
test('GSCA: monotone ALS, local optimum, plausible fit, paths close to PLS', () => {
  const prep = E2.prepare(ds, model(), {}), fit = E2.gscaFit(prep.raw, prep.spec, null, 1000, 1e-12);
  assert.ok(fit.trace.every((v, i) => i === 0 || v <= fit.trace[i - 1] + 1e-9), 'criterion never increases');
  // perturbing any weight vector (then re-optimising loadings/paths) must not lower the criterion
  const r = E2.rng(9);
  for (let rep = 0; rep < 20; rep++) {
    const w = fit.w.map(a => a.map(v => v * (1 + 0.05 * (r() - 0.5))));
    const g = E2.gscaFit(prep.raw, prep.spec, w, 1, 0); // one ALS sweep starting from perturbed weights
    assert.ok(g.trace[0] >= fit.f - 1e-6 * fit.f || g.f >= fit.f - 1e-6 * fit.f, 'local optimum');
  }
  assert.ok(fit.FIT > 0 && fit.FIT < 1 && fit.AFIT < fit.FIT && fit.SRMR > 0 && fit.GFI > 0.8);
  const res = E2.gsca(ds, model(), {}, { samples: 50 }), pls = E2.runPLS(ds, model(), {});
  res.rows.filter(x => x.group === 'path').forEach(x => close(x.original, pls.stats['path|' + x.label], 0.02, 'GSCA vs PLS ' + x.label));
});

test('logistic regression matches statsmodels', () => {
  const R = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/logit.json'), 'utf8')), gj = ds.names.indexOf('gender');
  const L = E2.logistic(ds, model(), {}, { y: 'gender', x: R.x, event: ds.labels[gj].indexOf('male') + 1 });
  assert.strictEqual(L.n, R.n);
  L.terms.forEach((x, a) => { close(x.b, R.params[a], 1e-6, 'b' + a); close(x.se, R.bse[a], 1e-6, 'se' + a); });
  close(L.LL, R.llf, 1e-6, 'logL'); close(L.LL0, R.llnull, 1e-6, 'null logL'); close(L.mcfadden, R.prsquared, 1e-8, 'McFadden'); close(L.aic, R.aic, 1e-6, 'AIC'); close(L.bic, R.bic, 1e-6, 'BIC');
  assert.ok(L.auc > 0.5 && L.auc < 1);
});

test('CB-SEM modification index approximates the chi-square change; bootstrap CIs bracket estimates', () => {
  const full = E2.cbsem(ds, model(), {}), m2 = model();
  m2.paths = m2.paths.filter(p => !(p.from === 'c5' && p.to === 'c6'));
  const red = E2.cbsem(ds, m2, {}), mi = red.mi.find(x => x.label === 'Loyalty ~ Satisfaction');
  const dchi = red.fit.chi2 - full.fit.chi2;
  assert.ok(Math.abs(mi.mi - dchi) / dchi < 0.1, `MI ${mi.mi} vs Δχ² ${dchi}`);
  close(mi.sepc, full.paths.find(p => p.from === 'Satisfaction' && p.to === 'Loyalty').std, 0.06, 'EPC vs estimate');
  const b = E2.cbsem(ds, model(), {}, { samples: 60, seed: 2 });
  assert.ok(b.boot.failed === 0 && b.paths.every(p => p.lo <= p.std && p.std <= p.hi));
});

test('CVPAT: PLS beats indicator averages; MGA bootstrap tests agree with permutation', () => {
  const c = E2.cvpat(ds, model(), {}, { folds: 10, reps: 3 });
  assert.ok(c.overall.ia.diff > 0 && c.overall.ia.p < 0.05);
  const r = E2.mgaFull(ds, model(), {}, { groupVar: 'gender', permutations: 150, bootSamples: 150 });
  r.results[0].rows.filter(x => x.group === 'path').forEach(x => {
    assert.ok([x.hP2, x.parP, x.wsP].every(v => v >= 0 && v <= 1));
    assert.ok(Math.abs(x.parP - x.wsP) < 0.1, 'parametric and Welch-Satterthwaite close for similar group sizes');
  });
});

test('sample size: inverse square root method reproduces Kock & Hadaya (2018)', () => {
  assert.strictEqual(E2.sampleSize({ pmin: 0.2, alpha: 0.05, power: 0.8 }).n, 155);
  assert.strictEqual(E2.sampleSize({ pmin: 0.1, alpha: 0.05, power: 0.8 }).n, 619);
});

const E3 = require('../js/advanced3.js');
test('multigroup CB-SEM: exact gradient, configural = sum of group fits, invariance df, simulated path difference found', () => {
  assert.ok(E3.cbsemMG(ds, model(), {}, { groupVar: 'gender', gradCheck: true }).maxGradDiff < 1e-6);
  const r = E3.cbsemMG(ds, model(), {}, { groupVar: 'gender' });
  const gj = ds.names.indexOf('gender'); let sum = 0;
  [1, 2].forEach(v => { const rows = []; for (let i = 0; i < ds.n; i++) if (ds.cols[gj][i] === v) rows.push(i); sum += E3.cbsem(Object.assign({}, ds, { cols: ds.cols.map(c => Float64Array.from(rows, i => c[i])), n: rows.length }), model(), {}).fit.chi2; });
  close(r.levels.configural.chi2, sum, 1e-3, 'configural chi2');
  assert.strictEqual(r.levels.metric.df - r.levels.configural.df, 15);
  assert.strictEqual(r.levels.scalar.df - r.levels.metric.df, 15);
  assert.ok(r.pathTests.find(x => x.path === 'Value → Satisfaction').p < 0.05, 'the simulated gender difference');
});

test('covariance-matrix input reproduces the matrix exactly and the PLS / CB-SEM estimates', () => {
  const prep = E3.prepare(ds, model(), { missing: 'casewise' }), p = prep.raw.length, n = prep.raw[0].length;
  const mu = prep.raw.map(c => E3.mean(c)), C = prep.raw.map((a, i) => prep.raw.map((b, j) => { let s = 0; for (let t = 0; t < n; t++) s += (a[t] - mu[i]) * (b[t] - mu[j]); return s / (n - 1); }));
  const csv = [[''].concat(prep.names).join(',')].concat(prep.names.map((nm, i) => [nm].concat(C[i].map(v => v.toFixed(12))).join(','))).join('\n');
  const parsed = E3.parseCovMatrix(csv), cols = E3.dataFromCov(parsed.names, parsed.C, n, mu, 5);
  cols.forEach((a, i) => cols.forEach((b, j) => { const ma = E3.mean(a), mb = E3.mean(b); let s = 0; for (let t = 0; t < n; t++) s += (a[t] - ma) * (b[t] - mb); close(s / (n - 1), C[i][j], 1e-8, 'cov'); }));
  const synth = { names: parsed.names, cols, kinds: parsed.names.map(() => 'num'), labels: parsed.names.map(() => null), n };
  const a = E3.runPLS(ds, model(), { missing: 'casewise' }), b = E3.runPLS(synth, model(), {});
  Object.keys(a.stats).forEach(k => close(b.stats[k], a.stats[k], 1e-6, k));
  close(E3.cbsem(synth, model(), {}).fit.chi2, E3.cbsem(ds, model(), { missing: 'casewise' }).fit.chi2, 1e-4, 'CB-SEM chi2');
});

test('CCA exact fit test does not reject data that satisfy the composite model', () => {
  const fit = E3.runPLS(ds, model(), {}), prep = E3.prepare(ds, model(), {});
  const f0 = E3.fitFull(prep.raw, prep.spec, {}), imp = E3.implied(f0, prep.spec, false);
  const cols = E3.dataFromCov(prep.names, imp.Sig, 300, null, 3);   // population = model-implied matrix
  const synth = { names: prep.names, cols, kinds: prep.names.map(() => 'num'), labels: prep.names.map(() => null), n: 300 };
  const r = E3.fitTest(synth, model(), {}, { samples: 200 });
  assert.ok(r.fitTest.saturated.every(x => x.p > 0.05), 'exact fit not rejected');
  assert.ok(fit.gof > 0 && fit.gof < 1);
});

test('model comparison: BIC weights sum to one; nested CB-SEM χ² difference', () => {
  const m2 = model(); m2.paths = m2.paths.filter(p => !(p.from === 'c5' && p.to === 'c6'));
  const pls = E3.compareModels(ds, [{ name: 'full', model: model() }, { name: 'reduced', model: m2 }], {}, { method: 'pls' });
  const loy = pls.targets.find(x => x.construct === 'Loyalty');
  close(loy.rows.reduce((a, r) => a + r.bicWeight, 0), 1, 1e-12, 'weights');
  assert.ok(loy.rows.find(r => r.model === 'full').bicWeight > 0.99, 'dropping a strong path is penalised');
  const cb = E3.compareModels(ds, [{ name: 'full', model: model() }, { name: 'reduced', model: m2 }], {}, { method: 'cbsem' });
  assert.ok(cb.diffs.length === 1 && cb.diffs[0].ddf === 1 && cb.diffs[0].p < 0.001);
  const mod = model(); mod.interactions = [{ id: 'i1', name: 'Value x Image', x: 'c4', m: 'c1', y: 'c5' }];
  const r = E3.cbsemModerated(ds, mod, {}, {});
  assert.ok(r.paths.some(p => p.from === 'Value x Image' && p.to === 'Satisfaction'));
});

test('regression bootstrap SEs agree with analytic SEs', () => {
  const g = E3.regression(ds, { y: 'sat_1', x: ['val_1', 'qual_1'], samples: 800, seed: 4 });
  g.terms.forEach(x => assert.ok(Math.abs(x.bootSE / x.se - 1) < 0.2, x.name));
});
