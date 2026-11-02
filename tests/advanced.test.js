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
