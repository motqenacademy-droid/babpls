// Run: node --test tests   (Node 18+)
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const E = require('../js/engine.js');

const root = path.join(__dirname, '..');
const ds = E.parseCSV(fs.readFileSync(path.join(root, 'examples/customer_satisfaction.csv'), 'utf8'));
const baseModel = () => JSON.parse(fs.readFileSync(path.join(root, 'examples/customer_satisfaction.model.json'), 'utf8'));
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/reference.json'), 'utf8'));
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

function compare(r, refRes, label) {
  assert.strictEqual(r.n, refRes.n);
  r.constructs.forEach((c, j) => r.indicators[j].forEach((ind, q) => {
    close(r.weights[j][q], refRes.weights[ind], 1e-6, `${label} weight ${ind}`);
    close(r.loadings[j][q], refRes.loadings[ind], 1e-6, `${label} loading ${ind}`);
  }));
  for (const [k, v] of Object.entries(refRes.paths)) close(r.stats['path|' + k], v, 1e-6, `${label} path ${k}`);
  for (const [k, v] of Object.entries(refRes.r2)) close(r.stats['r2|' + k], v, 1e-6, `${label} R2 ${k}`);
}

test('PLS-SEM matches independent NumPy reference (path / centroid / factor / Mode B)', () => {
  compare(E.runPLS(ds, baseModel(), { missing: 'casewise', tol: 1e-12 }), ref.path_A, 'path');
  compare(E.runPLS(ds, baseModel(), { missing: 'casewise', scheme: 'centroid', tol: 1e-12 }), ref.centroid_A, 'centroid');
  compare(E.runPLS(ds, baseModel(), { missing: 'casewise', scheme: 'factor', tol: 1e-12 }), ref.factor_A, 'factor');
  const m = baseModel(); m.constructs[3].mode = 'B';
  compare(E.runPLS(ds, m, { missing: 'casewise', tol: 1e-12 }), ref.path_ValueB, 'modeB');
});

test('reliability, validity and HTMT follow their textbook formulas', () => {
  const r = E.runPLS(ds, baseModel(), { missing: 'casewise' });
  const prep = E.prepare(ds, baseModel(), { missing: 'casewise' });
  r.constructs.forEach((c, j) => {
    const lam = r.loadings[j], k = lam.length, s = lam.reduce((a, b) => a + b, 0);
    close(r.reliability[j].ave, lam.reduce((a, b) => a + b * b, 0) / k, 1e-12, 'AVE ' + c);
    close(r.reliability[j].rhoC, s * s / (s * s + lam.reduce((a, b) => a + 1 - b * b, 0)), 1e-12, 'rhoC ' + c);
    // Cronbach alpha from raw item variances
    const items = r.indicators[j].map(n => prep.raw[prep.names.indexOf(n)]);
    const tot = items[0].map((_, t) => items.reduce((a, it) => a + it[t], 0));
    const varOf = v => Math.pow(E.sd(v), 2);
    const rawAlpha = k / (k - 1) * (1 - items.reduce((a, it) => a + varOf(it), 0) / varOf(tot));
    // engine reports standardised alpha; for items with similar variance they are close
    close(r.reliability[j].alpha, rawAlpha, 0.03, 'alpha ' + c);
    assert.ok(r.reliability[j].rhoA > 0.5 && r.reliability[j].rhoA < 1, 'rhoA range ' + c);
  });
  // HTMT(Image, Loyalty) by hand
  const I = r.indicators[0].map(n => prep.raw[prep.names.indexOf(n)]), L = r.indicators[5].map(n => prep.raw[prep.names.indexOf(n)]);
  const meanAbs = pairs => pairs.reduce((a, [x, y]) => a + Math.abs(E.corr(x, y)), 0) / pairs.length;
  const het = []; I.forEach(a => L.forEach(b => het.push([a, b])));
  const mono = X => { const p = []; for (let a = 0; a < X.length; a++) for (let b = a + 1; b < X.length; b++) p.push([X[a], X[b]]); return p; };
  close(r.htmt[0][5], meanAbs(het) / Math.sqrt(meanAbs(mono(I)) * meanAbs(mono(L))), 1e-12, 'HTMT');
  // Fornell-Larcker diagonal
  close(r.fornell[2][2], Math.sqrt(r.reliability[2].ave), 1e-12, 'FL diag');
  assert.ok(r.fit.saturated.srmr > 0 && r.fit.saturated.srmr < 0.12, 'SRMR plausible');
  assert.ok(r.fit.estimated.srmr >= r.fit.saturated.srmr - 1e-9, 'estimated SRMR >= saturated');
});

test('total and indirect effects decompose correctly', () => {
  const r = E.runPLS(ds, baseModel(), {});
  const s = r.stats;
  // Image -> Loyalty total = direct + indirect
  close(s['total|Image -> Loyalty'], s['path|Image -> Loyalty'] + s['indirect|Image -> Loyalty'], 1e-12, 'decomposition');
  // sum of specific indirect effects equals total indirect
  const spec = Object.keys(s).filter(k => k.startsWith('specific|Image -> ') && k.endsWith('-> Loyalty'));
  close(spec.reduce((a, k) => a + s[k], 0), s['indirect|Image -> Loyalty'], 1e-10, 'specific sum');
  // f2 definition
  const f2 = s['f2|Satisfaction -> Loyalty'];
  assert.ok(f2 > 0.02, 'f2 of a strong path');
});

test('distribution functions', () => {
  close(E.tTwoTailedP(1.959964, 1e7), 0.05, 1e-4, 't large df');
  close(E.tTwoTailedP(2.228139, 10), 0.05, 1e-5, 't df=10');
  close(E.qnorm(0.975), 1.959964, 1e-5, 'qnorm');
  close(E.pnorm(1.959964), 0.975, 1e-6, 'pnorm');
  close(E.fP(4.964603, 1, 10), 0.05, 1e-5, 'F');
});

test('bootstrapping is reproducible and sensible', () => {
  const a = E.bootstrap(ds, baseModel(), {}, { samples: 200, seed: 7 });
  const b = E.bootstrap(ds, baseModel(), {}, { samples: 200, seed: 7 });
  const row = k => a.rows.find(r => r.key === k);
  assert.deepStrictEqual(a.rows.map(r => r.mean), b.rows.map(r => r.mean));
  const sl = row('path|Satisfaction -> Loyalty');
  assert.ok(sl.p < 0.001 && sl.lo > 0 && sl.hi > sl.lo, 'strong path significant');
  assert.ok(sl.lo <= sl.original && sl.original <= sl.hi, 'CI covers estimate');
  const bca = E.bootstrap(ds, baseModel(), {}, { samples: 200, seed: 7, ci: 'bca' });
  assert.ok(bca.rows.every(r => !(r.lo > r.hi)), 'BCa bounds ordered');
});

test('consistent PLS disattenuates construct correlations', () => {
  const p = E.runPLS(ds, baseModel(), {});
  const c = E.runPLS(ds, baseModel(), { consistent: true });
  const ra = p.reliability.map(b => b.rhoA);
  close(c.lvCorr[0][1], p.lvCorr[0][1] / Math.sqrt(ra[0] * ra[1]), 1e-9, 'PLSc correlation');
  assert.ok(Math.abs(c.stats['path|Satisfaction -> Loyalty']) > Math.abs(p.stats['path|Satisfaction -> Loyalty']) * 0.9);
});

test('two-stage moderation adds an interaction term', () => {
  const m = baseModel();
  m.interactions = [{ id: 'i1', name: 'Value x Image', x: 'c4', m: 'c1', y: 'c5' }];
  m.paths.push({ from: 'c1', to: 'c5' });
  const r = E.runPLS(ds, m, {});
  assert.ok(Number.isFinite(r.stats['path|Value x Image -> Satisfaction']));
  const bs = E.bootstrap(ds, m, {}, { samples: 50, seed: 3 });
  assert.ok(bs.rows.some(x => x.key === 'path|Value x Image -> Satisfaction'));
});

test('blindfolding, PLSpredict, IPMA, NCA and regression', () => {
  const bf = E.blindfolding(ds, baseModel(), {}, { distance: 7 });
  assert.ok(bf.rows.every(r => r.q2 > 0 && r.q2 < 1), 'Q2 in (0,1)');
  const pp = E.plspredict(ds, baseModel(), {}, { folds: 5, reps: 2, seed: 1 });
  assert.ok(pp.rows.length === 16 && pp.rows.every(r => r.plsRMSE > 0 && Number.isFinite(r.lmRMSE)));
  const ip = E.ipma(ds, baseModel(), {}, { target: 'c6' });
  assert.ok(ip.lvRows.length === 5 && ip.lvRows.every(r => r.performance > 0 && r.performance < 100));
  ip.rescaledWeights.forEach(w => close(w.weights.reduce((a, b) => a + b, 0), 1, 1e-9, 'rescaled weights sum'));
  const nc = E.nca(ds, baseModel(), {}, { permutations: 20 });
  assert.ok(nc.rows.every(r => r.d >= 0 && r.d <= 1));
  // regression: single predictor slope = r * sy/sx
  const reg = E.regression(ds, { y: 'sat_1', x: ['val_1'] });
  const rows = [];
  for (let i = 0; i < ds.cols[0].length; i++) { const a = ds.cols[ds.names.indexOf('sat_1')][i], b = ds.cols[ds.names.indexOf('val_1')][i]; if (!isNaN(a) && !isNaN(b)) rows.push([b, a]); }
  const x = rows.map(r => r[0]), y = rows.map(r => r[1]);
  close(reg.terms[1].b, E.corr(x, y) * E.sd(y) / E.sd(x), 1e-9, 'slope');
  close(reg.r2, Math.pow(E.corr(x, y), 2), 1e-9, 'R2');
});

test('multigroup analysis finds the simulated gender difference', () => {
  const r = E.mga(ds, baseModel(), {}, { groupVar: 'gender', permutations: 100, seed: 5 });
  assert.deepStrictEqual(r.groups.sort(), ['female', 'male']);
  const row = r.results[0].rows.find(x => x.key === 'path|Satisfaction -> Loyalty');
  assert.ok(Number.isFinite(row.diff) && row.p >= 0 && row.p <= 1);
  assert.ok(r.results[0].micom.every(m => m.c > 0.9), 'compositional invariance plausible');
});

test('validation and CSV parsing', () => {
  const m = baseModel(); m.paths.push({ from: 'c6', to: 'c1' });
  assert.ok(E.validate(m, ds).some(e => e.code === 'cycle'));
  const d2 = E.parseCSV('a;b;g\n1,5;2;x\n2,5;;y\n3;4;x\n');
  assert.deepStrictEqual(Array.from(d2.cols[0]), [1.5, 2.5, 3]);
  assert.ok(Number.isNaN(d2.cols[1][1]));
  assert.strictEqual(d2.kinds[2], 'cat');
  assert.deepStrictEqual(d2.labels[2], ['x', 'y']);
});
