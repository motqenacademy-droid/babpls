// AMOS-style CB-SEM (js/amos.js) against tests/fixtures/amos.json, produced by tools/reference_amos.py: an independent
// NumPy/SciPy implementation of the discrepancy functions and of every fit formula, cross-checked against semopy.
'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const E = require('../js/amos.js');
const root = path.join(__dirname, '..');
const R = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/amos.json'), 'utf8'));
const ds = E.parseCSV(fs.readFileSync(path.join(root, 'examples/customer_satisfaction.csv'), 'utf8'));
const model = JSON.parse(fs.readFileSync(path.join(root, 'examples/customer_satisfaction.model.json'), 'utf8'));
const run = (opts, m, d) => E.tasks.amos_sem(d || ds, m === undefined ? model : m, {}, opts);

const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);
const rel = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${what}: ${a} vs ${b} (rel ${tol})`);
const ROWS = { default: 'def', saturated: 'sat', independence: 'ind' };
function checkFit(mine, ref, tag, tol) {
  for (const row of Object.keys(ROWS)) for (const k of Object.keys(ref[row])) {
    if (ref[row][k] === null) continue;
    rel(mine[ROWS[row]][k], ref[row][k], tol || 1e-5, `${tag} ${row} ${k}`);
  }
}
const allEst = r => r.weights.map(w => ({ mat: 'A', a: w.to, b: w.from, est: w.est, se: w.se, std: w.std }))
  .concat(r.covs.map(c => ({ mat: 'S', a: c.a, b: c.b, est: c.est, se: c.se, corr: c.corr })))
  .concat(r.variances.map(v => ({ mat: 'S', a: v.v, b: v.v, est: v.est, se: v.se })))
  .concat(r.intercepts.map(v => ({ mat: 'M', a: v.v, b: v.v, est: v.est, se: v.se })));
function checkEst(r, ref, tag, seTol) {
  const A = allEst(r);
  assert.strictEqual(A.length, ref.length, tag + ': number of parameters');
  ref.forEach(x => {
    const y = A.find(z => z.mat === x.mat && ((z.a === x.a && z.b === x.b) || (x.mat === 'S' && z.a === x.b && z.b === x.a)));
    assert.ok(y, `${tag}: ${x.mat} ${x.a} ${x.b} missing`);
    close(y.est, x.est, 1e-5, `${tag} est ${x.a}/${x.b}`);
    if (x.se !== null) rel(y.se, x.se, seTol || 1e-4, `${tag} SE ${x.a}/${x.b}`);
    else assert.ok(!isFinite(y.se) || x.mat === 'M', `${tag} no SE expected ${x.a}/${x.b}`);
    if ('std' in x) close(y.std, x.std, 1e-5, `${tag} std ${x.a}/${x.b}`);
    if ('corr' in x) close(y.corr, x.corr, 1e-5, `${tag} corr ${x.a}/${x.b}`);
  });
}

for (const est of ['ML', 'GLS', 'ULS', 'SLS', 'ADF']) {
  test(`${est}: estimates, standard errors and the complete Amos fit tables match the reference`, () => {
    const r = run({ estimator: est }), ref = R.customer[est];
    assert.strictEqual(r.N, ref.N); assert.strictEqual(r.notes.df, ref.df); assert.strictEqual(r.notes.q, ref.q);
    rel(r.notes.chi2, ref.chi2, 1e-6, 'CMIN');
    checkEst(r, ref.est, est);
    checkFit(r.fit, ref.fit, est);
    ref.smc.forEach(x => close(r.smc.find(s => s.v === x.v).smc, x.smc, 1e-5, 'SMC ' + x.v));
    assert.deepStrictEqual(r.vars, ref.vars);
    ref.total.forEach((row, i) => row.forEach((v, j) => { close(r.matrices.total[i][j], v, 1e-5, 'total effect'); close(r.effects.find(e => e.i === i && e.j === j) ? r.effects.find(e => e.i === i && e.j === j).stot : 0, ref.stdTotal[i][j], 1e-5, 'std total effect'); }));
    if (est === 'ULS' || est === 'SLS') assert.ok(r.weights.every(w => !isFinite(w.se))); // Amos gives no SEs for ULS/SLS
  });
}

test('ML: standardized residual covariances, factor score weights, implied moments and modification indices', () => {
  const r = run({ estimator: 'ML' }), ref = R.customer.ML;
  ref.stdResid.forEach((row, i) => row.forEach((v, j) => close(r.matrices.stdResid[i][j], v, 1e-5, 'std residual')));
  ref.fsw.forEach((row, i) => row.forEach((v, j) => close(r.matrices.fsw[i][j], v, 1e-6, 'factor score weight')));
  ref.impliedAll.forEach((row, i) => row.forEach((v, j) => close(r.matrices.implied[i][j], v, 1e-5, 'implied covariance')));
  let n = 0;
  ref.mi.filter(x => x.mi > 0).forEach(x => {
    const list = x.mat === 'S' ? r.mi.covs : r.mi.weights, y = list.find(z => (z.a === x.a && z.b === x.b) || (x.mat === 'S' && z.a === x.b && z.b === x.a));
    assert.ok(y, 'MI ' + x.a + ' ' + x.b); rel(y.mi, x.mi, 1e-4, 'MI'); rel(y.parChange, x.epc, 1e-4, 'Par change'); n++;
  });
  assert.ok(n >= 4);
  assert.ok(r.mi.covs.every((x, k, a) => k === 0 || a[k - 1].mi >= x.mi), 'MI sorted');
});

test('FIML with incomplete data: estimates, observed-information SEs, deviances and fit against the EM saturated model', () => {
  const r = run({ estimator: 'FIML' }), ref = R.fiml;
  assert.strictEqual(r.N, ref.N); assert.ok(r.missing); assert.strictEqual(r.notes.df, ref.df);
  rel(r.fit.def.dev, ref.dev, 1e-7, '-2lnL'); rel(r.fit.sat.dev, ref.devSat, 1e-7, '-2lnL saturated'); rel(r.fit.ind.dev, ref.devInd, 1e-7, '-2lnL independence');
  checkEst(r, ref.est, 'FIML', 2e-3); // both SEs come from numerical Hessians
  checkFit(r.fit, ref.fit, 'FIML');
  assert.ok(!isFinite(r.fit.def.gfi) && !isFinite(r.fit.def.rmr)); // not defined with means / missing data (as in Amos)
});

test('extra syntax: equality labels, error covariance, a new latent from syntax, and a user-defined estimand (delta method)', () => {
  const ref = R.syntax, r = run({ estimator: 'ML', syntax: ref.syntax });
  checkEst(r, ref.est, 'syntax'); checkFit(r.fit, ref.fit, 'syntax');
  const a = r.weights.filter(w => w.label === 'a'); assert.strictEqual(a.length, 2); close(a[0].est, a[1].est, 1e-12, 'equal labels');
  assert.ok(r.covs.some(c => c.a === 'sat_1' && c.b === 'sat_2' && c.kind === 'ecov'));
  close(r.defs[0].est, ref.defs[0].est, 1e-6, 'ind'); rel(r.defs[0].se, ref.defs[0].se, 1e-4, 'ind SE');
});

test('covariance-matrix input (published correlations with SDs, N = 301)', () => {
  const txt = fs.readFileSync(path.join(root, 'examples/cfa_correlations.csv'), 'utf8'), P = E.parseCovMatrix(txt);
  const cols = E.dataFromCov(P.names, P.C, 301, P.means, 1), d = { names: P.names, cols, kinds: P.names.map(() => 'num'), labels: P.names.map(() => null), n: 301 };
  const m = JSON.parse(fs.readFileSync(path.join(root, 'examples/cfa_correlations.model.json'), 'utf8'));
  const r = run({ estimator: 'ML', fromMatrix: true }, m, d), ref = R.matrix;
  checkEst(r, ref.est, 'matrix'); checkFit(r.fit, ref.fit, 'matrix');
  assert.strictEqual(r.normality, null); // raw-data diagnostics are skipped for matrix input
});

test('assessment of normality: skew, kurtosis and c.r., Mardia, Mahalanobis d² with p1 and p2', () => {
  const r = run({ estimator: 'ML' }), ref = R.normality, nm = r.normality;
  assert.strictEqual(nm.N, ref.N);
  nm.uni.forEach((u, k) => { close(u.skew, ref.skew[k], 1e-10, 'skew'); close(u.skewCR, ref.skewCR[k], 1e-9, 'skew c.r.'); close(u.kurt, ref.kurt[k], 1e-10, 'kurtosis'); close(u.kurtCR, ref.kurtCR[k], 1e-9, 'kurtosis c.r.'); assert.strictEqual(u.min, ref.min[k]); assert.strictEqual(u.max, ref.max[k]); });
  close(nm.mardia.kurt, ref.mardia, 1e-9, 'Mardia'); close(nm.mardia.cr, ref.mardiaCR, 1e-9, 'Mardia c.r.');
  ref.mahal.forEach((x, k) => { close(nm.mahal[k].d2, x.d2, 1e-9, 'd2'); rel(nm.mahal[k].p1, x.p1, 1e-6, 'p1'); rel(nm.mahal[k].p2, x.p2, 1e-6, 'p2'); });
});

test('multiple groups: Amos nested sequence (measurement weights → … → measurement residuals) with and without means', () => {
  const mg = { constructs: model.constructs.filter(c => ['Satisfaction', 'Loyalty', 'Value'].includes(c.name)), paths: model.paths.filter(p => ['c4', 'c5'].includes(p.from) && ['c5', 'c6'].includes(p.to)), interactions: [] };
  for (const means of [false, true]) {
    const r = E.tasks.amos_mg(ds, mg, {}, { estimator: 'ML', groupVar: 'gender', means }), ref = R.mg[means ? 'means' : 'cov'];
    assert.deepStrictEqual(r.groups, ref.groups); assert.strictEqual(r.N, ref.N);
    assert.deepStrictEqual(r.models.map(x => x.id), ref.models.map(x => x.id));
    r.models.forEach((mo, z) => {
      const rf = ref.models[z];
      for (const k of Object.keys(rf.fit)) if (rf.fit[k] !== null) rel(mo.fit[k], rf.fit[k], 1e-5, `mg ${mo.id} ${k}`);
      rf.est.forEach((ge, g) => ge.forEach(x => {
        const y = mo.groups[g].rows.find(q => q.mat === x.mat && (x.mat === 'A' ? q.to === x.a && q.from === x.b : x.mat === 'M' ? q.v === x.a : x.a === x.b ? q.v === x.a : ((q.a === x.a && q.b === x.b) || (q.a === x.b && q.b === x.a))));
        assert.ok(y, 'mg param'); close(y.est, x.est, 1e-5, `mg ${mo.id} ${x.a}/${x.b}`);
      }));
    });
    // nested comparisons: ΔCMIN and ΔDF are differences of the model rows
    const n1 = r.nested.find(x => x.base === 'unc' && x.model === 'mw');
    close(n1.dcmin, r.models[1].fit.cmin - r.models[0].fit.cmin, 1e-9, 'ΔCMIN'); assert.strictEqual(n1.ddf, r.models[1].df - r.models[0].df);
  }
});

test('analytic gradients equal numerical ones for every estimator (and two groups)', () => {
  const syntax = 'sat_1 ~~ sat_2\nLoyalty =~ loy_1 + a*loy_2 + a*loy_3';
  for (const est of ['ML', 'GLS', 'ULS', 'SLS', 'ADF', 'FIML']) {
    const spec = E.amos.buildSpec(ds, model, syntax, { means: est === 'FIML' || est === 'ML' });
    if (est !== 'ML' && est !== 'FIML') spec.means = false;
    const rows = Array.from({ length: ds.n }, (_, i) => i);
    let d;
    if (est === 'FIML') { d = E.amos.fimlData(ds, spec.obs, rows); const s = E.amos.emSaturated(d); d.S = s.S; d.xbar = s.mu; d.Sstart = s.S; d.mstart = s.mu; }
    else {
      const cols = spec.obs.map(nm => ds.cols[ds.names.indexOf(nm)]), keep = rows.filter(t => cols.every(c => isFinite(c[t])));
      const X = cols.map(c => Float64Array.from(keep, t => c[t]));
      const S = E.zeros(X.length, X.length), mu = X.map(E.mean); for (let a = 0; a < X.length; a++) for (let b = 0; b < X.length; b++) { let s = 0; for (let t = 0; t < keep.length; t++) s += (X[a][t] - mu[a]) * (X[b][t] - mu[b]); S[a][b] = s / (keep.length - 1); }
      d = { N: keep.length, n: keep.length - 1, p: X.length, S, Sinv: E.inverse(S), ldS: E.logdet(S), xbar: mu, X };
      if (est === 'ADF') { const pairs = []; for (let a = 0; a < X.length; a++) for (let b = a; b < X.length; b++) pairs.push([a, b]); d.pairs = pairs; d.Uinv = E.eye(pairs.length); }
    }
    const L = E.amos.layout(spec, 1), fg = E.amos.makeObjective(spec, L, [d], est);
    const th = Float64Array.from({ length: L.q }, (_, a) => { const e = L.ents[0].find(x => x.idx === a); return (e.mat === 'S' && e.i === e.j ? 0.6 : e.mat === 'M' ? 4 : 0.3) + 0.05 * Math.sin(a + 1); });
    const g = fg(th, true).g;
    let worst = 0;
    for (let a = 0; a < L.q; a++) { const h = 1e-6, t1 = Float64Array.from(th), t2 = Float64Array.from(th); t1[a] += h; t2[a] -= h; worst = Math.max(worst, Math.abs((fg(t1).f - fg(t2).f) / (2 * h) - g[a]) / Math.max(1, Math.abs(g[a]))); }
    assert.ok(worst < 1e-5, `${est} gradient ${worst}`);
  }
});

test('syntax parser: statements, modifiers, comments, errors with line numbers', () => {
  const P = E.amos.parseSyntax('# comment\nF =~ x1 + 1*x2 + a*x3 + NA*x4 ; y ~ b*F + 1\nx1 ~~ x2 ! another\nind := a*b');
  assert.deepStrictEqual(P.errs, []);
  assert.strictEqual(P.stmts.length, 4);
  assert.deepStrictEqual(P.stmts[0].rhs.map(t => t.mod), [null, { fixed: 1 }, { label: 'a' }, { free: true }]);
  assert.deepStrictEqual(P.stmts[1].rhs.map(t => t.name), ['F', '1']);
  assert.strictEqual(P.stmts[3].expr, 'a*b');
  assert.strictEqual(E.amos.parseSyntax('F x1').errs[0].code, 'amos_syn_parse');
  assert.strictEqual(E.amos.parseSyntax('F =~ x1 +').errs[0].code, 'amos_syn_parse');
  assert.strictEqual(E.amos.parseSyntax('F =~ 2a*x1').errs[0].name, '1: 2a*x1');
  const fails = (syn, code) => { try { run({ syntax: syn }); assert.fail('no error for ' + syn); } catch (e) { assert.strictEqual(e.message, 'amos_syntax', syn); assert.ok(e.details.some(x => x.code === code), syn + ' -> ' + JSON.stringify(e.details)); } };
  fails('sat_1 ~~ nosuch', 'amos_syn_var');
  fails('ind := a*zz', 'amos_syn_label');
  fails('Loyalty =~ a*loy_2\nind := a*(', 'amos_syn_expr');
  fails('NewF =~ NA*sat_1 + sat_2', 'amos_syn_scale');
  fails('sat_1 =~ sat_2', 'amos_syn_latobs');
  fails('Image =~ a*imag_1\nValue =~ a*val_1\nValue =~ 2*val_1', 'amos_syn_labelfix'); // one label, two different fixed values
  { // a label on a marker keeps it fixed, and an equal-labelled loading takes the fixed value
    const r = run({ syntax: 'Image =~ a*imag_1 + a*imag_2' }), w = r.weights.filter(x => x.label === 'a');
    assert.ok(w.length === 2 && w.every(x => x.fixed && x.est === 1));
  }
  // expressions: precedence and functions
  const ex = E.amos.parseExpr('-a^2 + b*(c - 1)/2 + sqrt(4)');
  assert.deepStrictEqual(ex.ids.sort(), ['a', 'b', 'c']); close(ex.fn({ a: 3, b: 4, c: 2 }), -9 + 2 + 2, 1e-12, 'expr');
  assert.throws(() => E.amos.parseExpr('a +* b'));
  // a model written entirely in syntax (empty diagram)
  const r = run({ syntax: 'Sat =~ sat_1 + sat_2 + sat_3\nLoy =~ loy_1 + loy_2 + loy_3\nLoy ~ Sat' }, { constructs: [], paths: [], interactions: [] });
  assert.deepStrictEqual(r.lat, ['Sat', 'Loy']); assert.strictEqual(r.notes.df, 8);
});

test('bootstrap: deterministic with a seed, Amos percentile and bias-corrected intervals, Bollen–Stine p', () => {
  const o = { estimator: 'ML', boot: 60, seed: 7, bollenStine: true, syntax: 'Loyalty ~ b*Satisfaction\nSatisfaction ~ c*Image\nind := c*b' };
  const r1 = run(o), r2 = run(o);
  assert.strictEqual(r1.boot.B, 60); assert.deepStrictEqual(r1.boot.summ.map(s => s && s.se), r2.boot.summ.map(s => s && s.se));
  const k = r1.boot.Q.findIndex(x => x.cat === 'def'), s = r1.boot.summ[k];
  assert.ok(s.lo <= r1.defs[0].est && r1.defs[0].est <= s.hi && s.bcLo < s.bcHi && s.p >= 0 && s.p <= 1 && s.bcP >= 0 && s.bcP <= 1);
  const bs = r1.bollenStine; assert.strictEqual(bs.better + bs.worse + bs.failed, 60); close(bs.p, (bs.worse + bs.failed + 1) / 61, 1e-12, 'BS p');
  // the Bollen–Stine transformation reproduces Σ̂ exactly
  const S = [[2, 0.5], [0.5, 1]], Sig = [[1.5, 0.2], [0.2, 0.8]], T = E.amos.powSym(S, -0.5), U = E.amos.powSym(Sig, 0.5);
  const M = [[0, 0], [0, 0]]; for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) for (let d = 0; d < 2; d++) M[a][b] += (U[a][c] * T[c][0] * S[0][0] * T[0][d] + U[a][c] * T[c][0] * S[0][1] * T[1][d] + U[a][c] * T[c][1] * S[1][0] * T[0][d] + U[a][c] * T[c][1] * S[1][1] * T[1][d]) * U[d][b];
  M.forEach((row, a) => row.forEach((v, b) => close(v, Sig[a][b], 1e-10, 'BS transform')));
});

test('bootstrap summary: percentile and bias-corrected limits and p-values follow their definitions', () => {
  const draws = Array.from({ length: 1000 }, (_, i) => -0.2 + 1.2 * (i + 0.5) / 1000); // uniform on (−0.2, 1)
  const s = E.amos.bootSummary(0.5, draws, 0.95);
  close(s.lo, -0.2 + 1.2 * 0.025, 2e-3, 'perc lo'); close(s.hi, -0.2 + 1.2 * 0.975, 2e-3, 'perc hi');
  close(s.p, 2 * (0.2 / 1.2), 1e-3, 'perc p'); // smallest α with the (1 − α) interval excluding 0
  const z0 = E.qnorm((draws.filter(x => x < 0.5).length) / 1000);
  close(s.z0, z0, 1e-9, 'z0'); close(s.bcLo, E.quantile(draws, E.pnorm(2 * z0 + E.qnorm(0.025))), 1e-12, 'BC lo');
  const w = E.qnorm(0.2 / 1.2) - 2 * z0; close(s.bcP, 2 * E.pnorm(w), 1e-3, 'BC p');
});

test('latent growth curve template and fit-table edge cases', () => {
  const d = { names: ['t1', 't2', 't3', 't4'], kinds: ['num', 'num', 'num', 'num'], labels: [null, null, null, null], n: 200, cols: [] };
  const rand = E.rng(3), g = () => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
  const I = Array.from({ length: 200 }, () => 3 + g()), Sl = Array.from({ length: 200 }, () => 0.5 + 0.3 * g());
  d.cols = [0, 1, 2, 3].map(k => Float64Array.from({ length: 200 }, (_, t) => I[t] + k * Sl[t] + 0.5 * g()));
  const r = E.tasks.amos_lgm(d, null, {}, { waves: ['t1', 't2', 't3', 't4'], estimator: 'ML' });
  assert.strictEqual(r.notes.df, 4 * 7 / 2 - (4 + 3 + 2)); // moments p(p+3)/2 minus 4 error variances, 3 (co)variances, 2 means
  const mI = r.intercepts.find(x => x.v === 'ICEPT').est, mS = r.intercepts.find(x => x.v === 'SLOPE').est;
  close(mI, E.mean(d.cols[0]), 0.1, 'intercept mean'); close(mS, 0.5, 0.1, 'slope mean');
  assert.match(E.amos.lgmSyntax(['a', 'b', 'c', 'd'], { quadratic: true, times: '0,1,3,4' }), /QUAD =~ 0\*a \+ 1\*b \+ 9\*c \+ 16\*d/);
  assert.throws(() => E.amos.lgmSyntax(['a', 'b'], {}), /amos_lgm_waves/);
  // saturated row: indices that need df > 0 are blank, the others are those of a perfect fit
  const f = E.amos.fitRow({ C: 0, d: 0, q: 10, n: 99, N: 100, G: 1, ps: [4], Ns: [100], moments: 10, Cb: 200, db: 6, rmr: 0, gfi: 1 });
  assert.strictEqual(f.nfi, 1); assert.strictEqual(f.cfi, 1); assert.ok(isNaN(f.rmsea) && isNaN(f.tli) && isNaN(f.hoelter05));
  close(f.ecviLo, f.ecvi, 1e-12, 'ECVI CI of the saturated model'); close(f.bcc, 20 * 99 / (100 - 4 - 2), 1e-9, 'BCC = C + 2q·n/(N − p − 2)');
});

// ------------------------------------------------------------ UI plugin: documentation, MathML, translations
const PL = (() => { const sandbox = {}; const fn = new Function('self', fs.readFileSync(path.join(root, 'js/ui-amos.js'), 'utf8')); fn(sandbox); return sandbox.YP_PLUGINS.find(p => p.id === 'amos'); })();
const MATHML = new Set(['math', 'mrow', 'mi', 'mo', 'mn', 'mtext', 'msub', 'msup', 'msubsup', 'mfrac', 'msqrt', 'mover', 'munder', 'mtable', 'mtr', 'mtd', 'mspace']);
function wellFormed(xml) { // balanced tags, MathML elements only, no stray "<" or "&"
  const stack = [], re = /<(\/?)([a-z]+)([^>]*)>/g; let m, last = 0;
  while ((m = re.exec(xml))) {
    const text = xml.slice(last, m.index); if (/</.test(text) || /&(?!#x[0-9a-f]+;|#\d+;|lt;|gt;|amp;)/i.test(text)) return 'bad text: ' + text;
    last = re.lastIndex; const [, close, tag, attrs] = m;
    if (!MATHML.has(tag)) return 'tag ' + tag;
    if (close) { if (stack.pop() !== tag) return 'unbalanced ' + tag; } else if (!/\/$/.test(attrs)) stack.push(tag);
  }
  return stack.length ? 'unclosed ' + stack.join(',') : null;
}
test('plugin methods: bilingual title/text/origin, valid MathML formulas, existing references (all cited)', () => {
  const used = new Set();
  for (const m of PL.methods) {
    for (const L of ['en', 'ar']) for (const k of ['title', 'text', 'origin']) assert.ok(m[L] && m[L][k] && m[L][k].length > 10, `${m.id} ${L} ${k}`);
    assert.match(m.formula, /^<math display="block">[\s\S]*<\/math>$/, m.id);
    assert.strictEqual(wellFormed(m.formula), null, m.id + ': ' + wellFormed(m.formula));
    assert.ok(m.refs.length, m.id); m.refs.forEach(r => { assert.ok(PL.refs[r], m.id + ' -> ' + r); used.add(r); });
    assert.ok(/[؀-ۿ]/.test(m.ar.text) && /[؀-ۿ]/.test(m.ar.origin), m.id + ' Arabic');
  }
  assert.deepStrictEqual(Object.keys(PL.refs).filter(k => !used.has(k)), []);
  assert.strictEqual(new Set(PL.methods.map(m => m.id)).size, PL.methods.length);
});
test('plugin i18n: same keys in both languages; every key and documented method used by the plugin exists', () => {
  const en = PL.i18n.en, ar = PL.i18n.ar;
  assert.deepStrictEqual(Object.keys(en).filter(k => !ar[k]), []); assert.deepStrictEqual(Object.keys(ar).filter(k => !en[k]), []);
  const src = fs.readFileSync(path.join(root, 'js/ui-amos.js'), 'utf8'), ids = new Set(PL.methods.map(m => m.id));
  const keys = new Set([...src.matchAll(/\bt\('([a-z0-9_]+)'/gi)].map(m => m[1]));
  ['value'].forEach(k => keys.delete(k)); // app-wide keys
  [...keys].filter(k => k.endsWith('_')).forEach(k => keys.delete(k)); // prefixes of dynamic keys (listed below)
  const dyn = []; ['ML', 'GLS', 'ULS', 'SLS', 'ADF', 'FIML'].forEach(e => dyn.push('am_est_' + e)); ['load', 'path', 'var', 'xcov', 'evar', 'ecov', 'dvar', 'dcov', 'int', 'mean', 'lmean'].forEach(k => dyn.push('am_k_' + k));
  ['unc', 'mw', 'mi', 'sw', 'scov', 'sr', 'mr'].forEach(k => dyn.push('am_m_' + k)); ['fixed', 'labeled', 'unlabeled'].forEach(k => dyn.push('am_' + k)); ['w_conv', 'w_ident'].forEach(k => dyn.push('am_' + k));
  Object.keys(PL.fields).forEach(k => { if (!/^amEst(MG|LGM)$/.test(k)) dyn.push('f_' + k); });
  Object.values(PL.tasks).forEach(x => { dyn.push(x.title, x.title + '_d'); assert.ok(ids.has(x.doc), x.doc); });
  PL.menu.forEach(g => dyn.push(g.group));
  const missing = [...keys, ...dyn].filter(k => !en[k]); assert.deepStrictEqual(missing, []);
  // error codes thrown by the engine
  const codes = new Set([...fs.readFileSync(path.join(root, 'js/amos.js'), 'utf8').matchAll(/(?:fail\(|code: )'(amos_[a-z_]+)'/g)].map(m => m[1]));
  assert.deepStrictEqual([...codes].filter(c => !en['err_' + c]), []);
  [...src.matchAll(/doc: '([a-z0-9]+)'(?= *[,}])/g)].forEach(m => assert.ok(ids.has(m[1]), 'doc ' + m[1]));
  ['ML', 'GLS', 'ULS', 'SLS', 'ADF', 'FIML'].forEach(e => assert.ok(ids.has('am' + e.toLowerCase())));
});
