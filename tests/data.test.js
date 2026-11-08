// Data editing (js/data.js): expression language, transformations against pandas / numpy / scipy references in
// tests/fixtures/data.json (regenerate with: python tools/reference_data.py > tests/fixtures/data.json), the analysis
// dataset built from the editable one, project metadata round trip, rename propagation and SPSS files with dictionaries.
'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const X = require('../js/data.js'), E = require('../js/engine.js'), IO = require('../js/io.js');
const R = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/data.json'), 'utf8'));
const arr = a => Float64Array.from(a, v => (v === null ? NaN : v));
const I = Object.fromEntries(Object.entries(R.input).map(([k, v]) => [k, arr(v)]));
function same(a, b, label, tol) {
  tol = tol === undefined ? 1e-10 : tol;
  assert.strictEqual(a.length, b.length, label + ' length');
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i] === null ? NaN : b[i];
    if (y !== y) { assert.ok(x !== x, `${label}[${i}]: expected missing, got ${x}`); continue; }
    assert.ok(Math.abs(x - y) <= tol * Math.max(1, Math.abs(y)), `${label}[${i}]: ${x} vs ${y}`);
  }
}
// a small dataset with every variable type
function sample() {
  const D = { n: 6, vars: [], filter: null, readOnly: false };
  D.vars.push(X.newVar('id', 'numeric', 6, { values: arr([1, 2, 3, 4, 5, 6]), decimals: 0 }));
  D.vars.push(X.newVar('gender', 'categorical', 6, { values: arr([1, 2, 2, 1, null, 2]), labels: [[1, 'female'], [2, 'male']] }));
  D.vars.push(X.newVar('q1', 'numeric', 6, { values: arr([1, 2, 3, 99, 5, null]), missing: { codes: [99], lo: null, hi: null } }));
  D.vars.push(X.newVar('q2', 'numeric', 6, { values: arr([2, 2, 4, 4, null, 1]) }));
  D.vars.push(X.newVar('q3', 'numeric', 6, { values: arr([3, 5, 1, 2, 2, null]) }));
  D.vars.push(X.newVar('city', 'string', 6, { values: ['Rabat', 'Amman', '', 'Rabat', 'Cairo', 'Amman'] }));
  D.vars.push(X.newVar('day', 'date', 6, { values: arr([X.parseDate('2024-01-31'), X.parseDate('2024-02-01'), null, 0, 1.5, 365]) }));
  return D;
}
const ev = (D, s) => Array.from(X.evaluate(D, s).values);
const one = (D, s, i) => X.evaluate(D, s).values[i || 0];

test('expression parser: precedence, associativity and constants', () => {
  const D = sample();
  assert.strictEqual(one(D, '2 + 3 * 4'), 14);
  assert.strictEqual(one(D, '(2 + 3) * 4'), 20);
  assert.strictEqual(one(D, '-2^2'), -4);
  assert.strictEqual(one(D, '2^3^2'), 512);
  assert.strictEqual(one(D, '2 ** -1'), 0.5);
  assert.strictEqual(one(D, '10 - 4 - 3'), 3);
  assert.strictEqual(one(D, '12 / 3 / 2'), 2);
  assert.strictEqual(one(D, '1 + 2 = 3 and not 4 < 3'), 1);
  assert.strictEqual(one(D, '1 < 2 & 3 > 4 | 5 <> 5'), 0);
  assert.strictEqual(one(D, '1.5e1 + .5'), 15.5);
  assert.ok(Number.isNaN(one(D, '1 / 0')));
  assert.deepStrictEqual(X.parseExpr('a + b * c'), { k: 'bin', op: '+', a: { k: 'var', name: 'a', pos: 0 }, b: { k: 'bin', op: '*', a: { k: 'var', name: 'b', pos: 4 }, b: { k: 'var', name: 'c', pos: 8 } } });
});
test('expression: variables, user-missing values and missing propagation', () => {
  const D = sample();
  assert.deepStrictEqual(ev(D, 'q1 + 1').map(x => (x !== x ? null : x)), [2, 3, 4, null, 6, null], '99 is user-missing');
  assert.deepStrictEqual(ev(D, 'value(q1)').map(x => (x !== x ? null : x)), [1, 2, 3, 99, 5, null], 'value() ignores user-missing');
  assert.deepStrictEqual(ev(D, 'missing(q1)'), [0, 0, 0, 1, 0, 1]);
  assert.deepStrictEqual(ev(D, 'sysmis(q1)'), [0, 0, 0, 0, 0, 1]);
  assert.deepStrictEqual(ev(D, 'notmissing(city)'), [1, 1, 0, 1, 1, 1]);
  // comparisons with missing are missing; three-valued logic
  assert.ok(Number.isNaN(one(D, 'q1 > 2', 3)));
  assert.strictEqual(one(D, 'q1 > 2 and 1 = 2', 3), 0, 'missing and false = false');
  assert.strictEqual(one(D, 'q1 > 2 or 1 = 1', 3), 1, 'missing or true = true');
  assert.ok(Number.isNaN(one(D, 'q1 > 2 or 1 = 2', 3)), 'missing or false = missing');
  assert.ok(Number.isNaN(one(D, 'not q1 > 2', 3)));
  // text: labels of categorical variables, string variables, dates
  assert.deepStrictEqual(ev(D, 'gender = "male"').map(x => (x !== x ? null : x)), [0, 1, 1, 0, null, 1]);
  assert.deepStrictEqual(ev(D, "gender = 'Female'").map(x => (x !== x ? null : x)), [1, 0, 0, 1, null, 0], 'labels match case-insensitively');
  assert.deepStrictEqual(ev(D, 'city = "Rabat"'), [1, 0, 0, 1, 0, 0]);
  assert.deepStrictEqual(ev(D, 'any(gender, "male")').map(x => (x !== x ? null : x)), [0, 1, 1, 0, null, 1]);
  assert.deepStrictEqual(ev(D, 'day >= "2024-02-01"').map(x => (x !== x ? null : x)), [0, 1, null, 0, 0, 0]);
  const s = X.evaluate(D, 'if(gender = "male", "M", "F")'); assert.ok(s.isString); assert.deepStrictEqual(s.values, ['F', 'M', 'M', 'F', '', 'M']);
});
test('expression functions over lists and ranges match pandas row-wise statistics', () => {
  const D = { n: I.q1.length, vars: ['q1', 'q2', 'q3'].map(n => X.newVar(n, 'numeric', I.q1.length, { values: I[n] })), filter: null };
  const W = R.rowwise;
  same(X.evaluate(D, 'mean(q1 to q3)').values, W.mean, 'mean');
  same(X.evaluate(D, 'sum(q1, q2, q3)').values, W.sum, 'sum');
  same(X.evaluate(D, 'sd(q1 to q3)').values, W.sd, 'sd');
  same(X.evaluate(D, 'min(q1 to q3)').values, W.min, 'min');
  same(X.evaluate(D, 'max(q1 to q3)').values, W.max, 'max');
  same(X.evaluate(D, 'median(q1 to q3)').values, W.median, 'median');
  same(X.evaluate(D, 'count(q1 to q3)').values, W.count, 'count');
  same(X.evaluate(D, 'nmiss(q1 to q3)').values, W.nmiss, 'nmiss');
  same(X.evaluate(D, 'mean.2(q1 to q3)').values, W.mean2, 'mean.2');
  same(X.evaluate(D, 'q1*2 + q2^2 - q3/4').values, W.formula, 'formula');
  same(X.evaluate(D, 'MEAN(Q1 TO Q3)').values, W.mean, 'names and keywords are case-insensitive');
});
test('expression: math functions', () => {
  const D = sample();
  assert.strictEqual(one(D, 'round(2.5)'), 3); assert.strictEqual(one(D, 'round(-2.5)'), -3, 'half away from zero');
  assert.strictEqual(one(D, 'round(1.005, 2)'), 1.01); assert.strictEqual(one(D, 'round(1234.5, -2)'), 1200);
  assert.strictEqual(one(D, 'mod(-7, 3)'), -1); assert.strictEqual(one(D, 'mod(7, 3)'), 1);
  assert.strictEqual(one(D, 'trunc(-2.7) + floor(-2.2) + ceil(2.2)'), -2 - 3 + 3);
  assert.strictEqual(one(D, 'abs(-3) + sqrt(16) + pow(2, 10)'), 3 + 4 + 1024);
  assert.ok(Math.abs(one(D, 'ln(exp(2)) + log10(1000)') - 5) < 1e-12);
  assert.ok(Number.isNaN(one(D, 'sqrt(-1)'))); assert.ok(Number.isNaN(one(D, 'ln(0)')));
  assert.deepStrictEqual(ev(D, 'between(id, 2, 4)'), [0, 1, 1, 1, 0, 0]);
  assert.deepStrictEqual(ev(D, 'any(id, 1, 6)'), [1, 0, 0, 0, 0, 1]);
  assert.deepStrictEqual(ev(D, 'casenum()'), [1, 2, 3, 4, 5, 6]);
  assert.deepStrictEqual(ev(D, 'lag(id)').map(x => (x !== x ? null : x)), [null, 1, 2, 3, 4, 5]);
  assert.deepStrictEqual(ev(D, 'lead(id, 2)').map(x => (x !== x ? null : x)), [3, 4, 5, 6, null, null]);
  assert.deepStrictEqual(ev(D, 'if(id > 3, 1, 0)'), [0, 0, 0, 1, 1, 1]);
  assert.deepStrictEqual(ev(D, 'ifelse(q1 > 2, 1, 0)').map(x => (x !== x ? null : x)), [0, 0, 1, null, 1, null], 'missing condition gives missing');
});
test('expression errors carry a code, the position and the offending name', () => {
  const D = sample(), err = (s, code, arg) => assert.throws(() => X.evaluate(D, s), e => e.code === code && (arg === undefined || e.arg === arg), `${s} → ${code}`);
  err('', 'expr_empty'); err('1 +', 'expr_end'); err('(1 + 2', 'expr_syntax'); err('1 2', 'expr_syntax'); err('1 # 2', 'expr_char', '#');
  err('nope + 1', 'expr_unknown_var', 'nope'); err('foo(1)', 'expr_unknown_fn', 'foo'); err('sqrt(1, 2)', 'expr_args', 'sqrt'); err('mean()', 'expr_args');
  err('mean(q3 to q1)', 'expr_range'); err('q1 to q3', 'expr_syntax'); err('sqrt(q1 to q3)', 'expr_args'); err('1 < 2 < 3', 'expr_chain');
  err('"abc', 'expr_string'); err('gender = "other"', 'expr_unknown_label', 'other'); err('lag(1)', 'expr_args');
  assert.strictEqual((() => { try { X.parseExpr('1 + )'); } catch (e) { return e.pos; } })(), 4);
  assert.ok(X.compile('`q1` + 1', D), 'backtick names');
});
test('recode: first matching rule, ranges, lowest/highest, missing, else and copy', () => {
  const v = arr([1, 2, 3, 4, 5, 99, null]), miss = x => x !== x || x === 99;
  const rules = [{ from: { t: 'missing' }, to: { t: 'value', v: 0 } }, { from: { t: 'range', lo: -Infinity, hi: 2 }, to: { t: 'value', v: 1 } }, { from: { t: 'range', lo: 3, hi: 4 }, to: { t: 'value', v: 2 } }, { from: { t: 'value', v: 3 }, to: { t: 'value', v: 9 } }];
  assert.deepStrictEqual(Array.from(X.recode(v, rules, { isMissing: miss })), [1, 1, 2, 2, 5, 0, 0], 'same variable: unmatched values stay');
  assert.deepStrictEqual(Array.from(X.recode(v, rules, { isMissing: miss, into: true })).map(x => (x !== x ? null : x)), [1, 1, 2, 2, null, 0, 0], 'into: unmatched → missing');
  const r2 = [{ from: { t: 'range', lo: 4, hi: Infinity }, to: { t: 'missing' } }, { from: { t: 'sysmis' }, to: { t: 'value', v: -1 } }, { from: { t: 'else' }, to: { t: 'copy' } }];
  assert.deepStrictEqual(Array.from(X.recode(v, r2, { into: true })).map(x => (x !== x ? null : x)), [1, 2, 3, null, null, null, -1]);
});
test('reverse scoring, z-scores and centering', () => {
  assert.deepStrictEqual(Array.from(X.reverse(arr([1, 2, 5, null]), 1, 5)).map(x => (x !== x ? null : x)), [5, 4, 1, null]);
  same(X.zscore(I.x), R.zscore, 'z'); same(X.center(I.x), R.center, 'center');
  assert.deepStrictEqual(Array.from(X.center(arr([1, 3]), 2)), [-1, 1]);
});
test('ranks with tie rules, percent / fractional ranks and n-tiles match scipy', () => {
  for (const t of ['mean', 'low', 'high', 'dense']) same(X.rank(I.lik, { ties: t }).rank, R.rank[t], 'rank ' + t);
  same(X.rank(I.lik, { desc: true }).rank, R.rank.desc, 'descending');
  same(X.rankScore(I.lik, 'percent'), R.rank.percent, 'percent');
  same(X.rankScore(I.lik, 'fraction'), R.rank.fraction, 'fraction');
  same(X.rankScore(I.lik, 'ntiles', { k: 4 }), R.rank.ntiles4, 'ntiles');
});
test('binning matches pandas.cut / qcut (intervals closed on the right)', () => {
  same(X.bin(I.x, X.binCuts(I.x, 'width', 4)).codes, R.bin_width4, 'equal width');
  const c = X.binCuts(I.x, 'quantile', 3); same(c, R.bin_quantile3_cuts, 'quantile cuts', 1e-12);
  same(X.bin(I.x, c).codes, R.bin_quantile3, 'quantile groups');
  same(X.bin(I.lik, X.binCuts(I.lik, 'quantile', 4)).codes, R.bin_lik_quantile4, 'tied quantiles merged');
  const b = X.bin(arr([1, 2, 3, 4, null]), [2, 3]);
  assert.deepStrictEqual(Array.from(b.codes).map(x => (x !== x ? null : x)), [1, 1, 2, 3, null]);
  assert.deepStrictEqual(b.labels, [[1, '≤ 2'], [2, '(2, 3]'], [3, '> 3']]);
  assert.deepStrictEqual(X.binCuts(arr([1, 2, 3, 4]), 'median'), [2.5]);
  assert.deepStrictEqual(X.binCuts(arr([1, 2]), 'cuts', 0, [5, 1, 5]), [1, 5]);
});
test('dummy variables match pandas.get_dummies; count values within cases', () => {
  const d = X.dummies(I.lik, [1, 2, 3, 4, 5], 1);
  assert.deepStrictEqual(d.map(x => x.level), [2, 3, 4, 5]);
  d.forEach(x => same(x.values, R.dummies[String(x.level)], 'dummy ' + x.level));
  assert.strictEqual(X.dummies(I.lik, [1, 2], null).length, 2);
  const cnt = X.countValues([arr([1, 2, null]), arr([2, 5, 1])], [{ t: 'value', v: 1 }, { t: 'range', lo: 4, hi: 6 }]);
  assert.deepStrictEqual(Array.from(cnt), [1, 1, 1]);
  assert.deepStrictEqual(Array.from(X.countValues([arr([1, null]), arr([null, null])], [{ t: 'missing' }])), [1, 2]);
});
test('replacing missing values matches pandas (mean, median, interpolation, nearby points, mode)', () => {
  same(X.replaceMissing(I.x, 'mean'), R.rmv.mean, 'mean');
  same(X.replaceMissing(I.x, 'median'), R.rmv.median, 'median');
  same(X.replaceMissing(I.x, 'linear'), R.rmv.linear, 'linear');
  same(X.replaceMissing(I.x, 'nearmean', { span: 2 }), R.rmv.nearmean2, 'nearby mean');
  same(X.replaceMissing(I.x, 'nearmedian', { span: 2 }), R.rmv.nearmedian2, 'nearby median');
  same(X.replaceMissing(I.lik, 'mode'), R.rmv.mode, 'mode');
  assert.deepStrictEqual(Array.from(X.replaceMissing(arr([null, 1, null, 3, null]), 'linear')).map(x => (x !== x ? null : x)), [null, 1, 2, 3, null], 'ends stay missing');
  assert.deepStrictEqual(X.incompleteRows([arr([1, null, 3]), ['a', 'b', '']]), [1, 2]);
});
test('log, square root, inverse and Box–Cox match numpy / scipy.stats.boxcox', () => {
  same(X.mathTransform(I.pos, 'ln'), R.math.ln, 'ln'); same(X.mathTransform(I.pos, 'log10'), R.math.log10, 'log10');
  same(X.mathTransform(I.pos, 'sqrt'), R.math.sqrt, 'sqrt'); same(X.mathTransform(I.pos, 'inverse'), R.math.inverse, 'inverse');
  same(X.mathTransform(I.pos, 'boxcox', 0.5), R.math.boxcox05, 'boxcox 0.5'); same(X.mathTransform(I.pos, 'boxcox', 0), R.math.boxcox0, 'boxcox 0');
  same(X.mathTransform(I.pos, 'boxcox', -1.3), R.math.boxcox_m13, 'boxcox -1.3');
  assert.deepStrictEqual(Array.from(X.mathTransform(arr([-1, 0, 4]), 'sqrt')).map(x => (x !== x ? null : x)), [null, 0, 2]);
});
test('lag, lead and differences match pandas shift / diff', () => {
  same(X.shift(I.x, 'lag', 2), R.shift.lag2, 'lag'); same(X.shift(I.x, 'lead', 1), R.shift.lead1, 'lead');
  same(X.shift(I.x, 'diff', 1), R.shift.diff1, 'diff'); same(X.shift(I.x, 'diff', 3), R.shift.diff3, 'diff 3');
});
test('duplicates match pandas.duplicated; outliers by z, Tukey fences and Mahalanobis distance', () => {
  const d = X.duplicates([I.dup, I.dup2]); same(d.dup, R.duplicates, 'duplicates'); assert.strictEqual(d.count, R.duplicates.filter(x => x === 1).length);
  assert.deepStrictEqual(Array.from(d.first).slice(0, 7), [1, 2, 2, 4, 1, 6, 2], 'first occurrence');
  const iq = X.outliersIQR(I.x, 1.5); assert.ok(Math.abs(iq.q1 - R.iqr.q1) < 1e-12 && Math.abs(iq.q3 - R.iqr.q3) < 1e-12); same(iq.flag, R.iqr.flag15, 'IQR flags');
  same(X.outliersZ(I.x, 2).flag, R.zflag2, 'z flags');
  const m = X.mahalanobis([I.m1, I.m2, I.m3]); same(m.d2, R.mahalanobis.d2, 'D²', 1e-9); same(m.p, R.mahalanobis.p, 'p', 1e-9);
  assert.strictEqual(m.df, 3); assert.ok(m.p[0] < 0.001, 'planted outlier');
});
test('aggregate within groups matches pandas groupby().transform()', () => {
  const map = { mean: 'mean', sum: 'sum', sd: 'std', median: 'median', min: 'min', max: 'max' };
  for (const [k, ref] of Object.entries(map)) same(X.aggregate([I.grp], I.x, k), R.aggregate[ref], 'aggregate ' + k);
  assert.deepStrictEqual(Array.from(X.aggregate([arr([1, 1, 2])], arr([1, null, 3]), 'n')), [2, 2, 1]);
  assert.deepStrictEqual(Array.from(X.aggregate([arr([1, 1, 2])], arr([1, null, 3]), 'nvalid')), [1, 1, 1]);
});

test('analysis dataset: user-missing as NaN, categories coded 1..k, strings coded, filter applied', () => {
  const D = sample(), ds = X.toDS(D);
  assert.deepStrictEqual(ds.names, ['id', 'gender', 'q1', 'q2', 'q3', 'city', 'day']);
  assert.deepStrictEqual(ds.kinds, ['num', 'cat', 'num', 'num', 'num', 'cat', 'num']);
  assert.deepStrictEqual(Array.from(ds.cols[2]).map(x => (x !== x ? null : x)), [1, 2, 3, null, 5, null]);
  assert.deepStrictEqual(ds.labels[1], ['female', 'male']); assert.deepStrictEqual(ds.labels[5], ['Rabat', 'Amman', 'Cairo']);
  assert.deepStrictEqual(Array.from(ds.cols[5]).map(x => (x !== x ? null : x)), [1, 2, null, 1, 3, 2]);
  assert.deepStrictEqual(ds.measures, ['ordinal', 'nominal', 'ordinal', 'ordinal', 'ordinal', 'nominal', 'scale'], 'inferred: 2–12 distinct numbers are ordinal');
  assert.strictEqual(ds.rowIndex, null);
  // codes of a categorical variable become 1..k in code order; unlabelled codes are labelled by their value
  const v = X.newVar('g', 'categorical', 4, { values: arr([10, 30, 20, 10]), labels: [[30, 'c']] }), c = X.toDS({ n: 4, vars: [v] });
  assert.deepStrictEqual(Array.from(c.cols[0]), [1, 3, 2, 1]); assert.deepStrictEqual(c.labels[0], ['10', '20', 'c']);
  // filter: unselected cases leave the analysis dataset; the editable data keep them
  D.filter = { expr: 'id > 2', mask: X.conditionMask(D, 'id > 2'), ver: 1 };
  const f = X.toDS(D); assert.strictEqual(f.n, 4); assert.deepStrictEqual(Array.from(f.rowIndex), [2, 3, 4, 5]);
  assert.deepStrictEqual(Array.from(f.cols[0]), [3, 4, 5, 6]); assert.deepStrictEqual(f.labels[1], ['female', 'male']);
  assert.strictEqual(D.n, 6);
  // the engine accepts it
  assert.ok(E.describe(f).every(d => d.n >= 0));
  // a measurement level set by the user wins over the inferred one
  D.vars[3].measure = 'nominal'; D.vars[3].measureSet = true; X.touch(D.vars[3]); assert.strictEqual(X.toDS(D).measures[3], 'nominal');
});
test('a column is rebuilt only after it changed (cached by version)', () => {
  const D = sample(), a = X.toDS(D), b = X.toDS(D);
  assert.strictEqual(a.cols[0], b.cols[0]);
  D.vars[0].values[0] = 7; X.touch(D.vars[0]);
  const c = X.toDS(D); assert.notStrictEqual(c.cols[0], a.cols[0]); assert.strictEqual(c.cols[0][0], 7); assert.strictEqual(c.cols[1], a.cols[1]);
});
test('legacy CSV import (engine reader) becomes numeric and categorical variables; old projects keep working', () => {
  const ds = E.parseCSV('a,b,c\n1,x,1.25\n2,y,\n3,x,2\n'), D = X.fromDS(ds);
  assert.deepStrictEqual(D.vars.map(v => [v.name, v.type, v.decimals]), [['a', 'numeric', 0], ['b', 'categorical', 0], ['c', 'numeric', 2]]);
  assert.deepStrictEqual(D.vars[1].labels, [[1, 'x'], [2, 'y']]);
  const back = X.toDS(D); assert.deepStrictEqual(back.labels[1], ds.labels[1]); assert.deepStrictEqual(Array.from(back.cols[1]), Array.from(ds.cols[1]));
});
test('project round trip: raw CSV + metadata keep types, labels, user-missing values and the filter', () => {
  const D = sample(); D.vars[2].label = 'Item, "one"'; D.vars[3].measure = 'nominal'; D.vars[3].measureSet = true; D.vars[3].width = 14; D.vars[3].align = 'center'; D.vars[3].role = 'target';
  D.filter = { expr: 'q2 > 1', mask: X.conditionMask(D, 'q2 > 1'), ver: 9 };
  const csv = X.toCSV(D, { raw: true }), meta = JSON.parse(JSON.stringify(X.metaJSON(D))), B = X.fromCSV(csv, meta);
  assert.strictEqual(B.n, D.n);
  D.vars.forEach((v, j) => {
    const w = B.vars[j];
    for (const k of ['name', 'label', 'type', 'measure', 'measureSet', 'decimals', 'role', 'width', 'align']) assert.deepStrictEqual(w[k], v[k], `${v.name}.${k}`);
    assert.deepStrictEqual(w.labels, v.labels); assert.deepStrictEqual(w.missing, v.missing);
    assert.deepStrictEqual(Array.from(w.values).map(x => (x !== x ? null : x)), Array.from(v.values).map(x => (x !== x ? null : x)), v.name + ' values');
  });
  assert.deepStrictEqual(Array.from(B.filter.mask), Array.from(D.filter.mask)); assert.strictEqual(B.filter.expr, 'q2 > 1');
  // exported CSV for other programs: labels and ISO dates
  const out = X.toCSV(D).split('\n'); assert.strictEqual(out[1], '1,female,1,2,3,Rabat,2024-01-31'); assert.ok(out[5].endsWith(',Cairo,1970-01-02 12:00'));
});
test('rename and delete propagate to every model', () => {
  const models = [{ name: 'M1', model: { constructs: [{ indicators: ['q1', 'q2'] }, { indicators: ['q3'] }] } }, { name: 'M2', model: { constructs: [{ indicators: ['q1'] }] } }];
  assert.strictEqual(X.renameInModels(models, 'q1', 'item1'), 2);
  assert.deepStrictEqual(models.map(m => m.model.constructs.map(c => c.indicators)), [[['item1', 'q2'], ['q3']], [['item1']]]);
  assert.strictEqual(X.removeFromModels(models, ['q3', 'item1']), 3);
  assert.deepStrictEqual(models[0].model.constructs.map(c => c.indicators), [['q2'], []]);
});
test('names: validation and unique names', () => {
  const D = sample();
  assert.strictEqual(X.nameError(D, 'Q1'), 'dv_name_taken'); assert.strictEqual(X.nameError(D, 'q1', 2), null, 'a variable keeps its own name');
  assert.strictEqual(X.nameError(D, 'a b'), 'dv_name_chars'); assert.strictEqual(X.nameError(D, '1a'), 'dv_name_chars'); assert.strictEqual(X.nameError(D, 'and'), 'dv_name_reserved');
  assert.strictEqual(X.nameError(D, 'الرضا_1'), null, 'Arabic names'); assert.strictEqual(X.nameError(D, ''), 'dv_name_empty');
  assert.strictEqual(X.uniqueName(D, 'q1'), 'q1_2'); assert.strictEqual(X.uniqueName(D, 'my var'), 'my_var'); assert.strictEqual(X.uniqueName(D, '2x'), 'V2x');
});
test('cell input: numbers, decimal commas, Arabic digits, labels, new categories, dates, errors', () => {
  const D = sample(), [id, g, , , , city, day] = D.vars;
  assert.deepStrictEqual(X.parseCell(id, ' 3.5 '), { value: 3.5 }); assert.deepStrictEqual(X.parseCell(id, '2,5'), { value: 2.5 });
  assert.deepStrictEqual(X.parseCell(id, '١٢٫٥'), { value: 12.5 }); assert.ok(Number.isNaN(X.parseCell(id, '').value)); assert.ok(Number.isNaN(X.parseCell(id, 'NA').value));
  assert.deepStrictEqual(X.parseCell(id, 'abc'), { error: 'dv_not_number' });
  assert.deepStrictEqual(X.parseCell(g, 'MALE'), { value: 2 }); assert.deepStrictEqual(X.parseCell(g, '1'), { value: 1 });
  assert.deepStrictEqual(X.parseCell(g, 'other'), { value: 3, label: [3, 'other'] });
  assert.deepStrictEqual(X.parseCell(city, ' x '), { value: ' x ' });
  assert.strictEqual(X.parseCell(day, '2024-02-29').value, X.parseDate('2024-02-29')); assert.deepStrictEqual(X.parseCell(day, '2023-02-29'), { error: 'dv_bad_date' });
  assert.strictEqual(X.formatDate(X.parseDate('2024-01-31')), '2024-01-31'); assert.strictEqual(X.formatDate(1.5), '1970-01-02 12:00');
  assert.strictEqual(X.format(g, 2, true), 'male'); assert.strictEqual(X.format(g, 2, false), '2'); assert.strictEqual(X.format(D.vars[2], 1, false), '1.00');
  assert.deepStrictEqual(X.parseTSV('a\tb\r\n"x\ty"\t2\r\n'), [['a', 'b'], ['x\ty', '2']]);
});
test('type conversion keeps the data', () => {
  const D = sample(), q = D.vars[3];
  X.convertType(q, 'categorical'); assert.strictEqual(q.type, 'categorical'); assert.strictEqual(q.measure, 'nominal');
  X.convertType(q, 'numeric'); assert.deepStrictEqual(Array.from(q.values).map(x => (x !== x ? null : x)), [2, 2, 4, 4, null, 1]);
  const g = D.vars[1]; X.convertType(g, 'string'); assert.deepStrictEqual(g.values, ['female', 'male', 'male', 'female', '', 'male']);
  X.convertType(g, 'categorical'); assert.deepStrictEqual(g.labels, [[1, 'female'], [2, 'male']]); assert.deepStrictEqual(Array.from(g.values).map(x => (x !== x ? null : x)), [1, 2, 2, 1, null, 2]);
  const c = D.vars[5]; assert.strictEqual(X.convertType(c, 'numeric'), 5, 'five texts are not numbers');
  const s = X.newVar('s', 'string', 3, { values: ['1', '2.5', 'x'] }); assert.strictEqual(X.convertType(s, 'numeric'), 1); assert.deepStrictEqual(Array.from(s.values).map(x => (x !== x ? null : x)), [1, 2.5, null]);
  const d = X.newVar('d', 'string', 2, { values: ['2024-01-01', 'no'] }); X.convertType(d, 'date'); assert.strictEqual(d.values[0], X.parseDate('2024-01-01'));
});
test('structure: insert / delete / sort cases with the filter, snapshots for undo', () => {
  const D = sample(); D.filter = { expr: 'id <> 2', mask: X.conditionMask(D, 'id <> 2'), ver: 1 };
  const snap = X.snapshot(D);
  X.insertRows(D, 1, 2); assert.strictEqual(D.n, 8); assert.deepStrictEqual(Array.from(D.vars[0].values).map(x => (x !== x ? null : x)), [1, null, null, 2, 3, 4, 5, 6]);
  assert.deepStrictEqual(Array.from(D.filter.mask), [1, 1, 1, 0, 1, 1, 1, 1]);
  X.deleteRows(D, [0, 1, 2]); assert.deepStrictEqual(Array.from(D.vars[0].values), [2, 3, 4, 5, 6]); assert.deepStrictEqual(D.vars[5].values, ['Amman', '', 'Rabat', 'Cairo', 'Amman']);
  X.sortCases(D, [{ j: 3, desc: true }, { j: 0, desc: false }]);
  assert.deepStrictEqual(Array.from(D.vars[0].values), [3, 4, 2, 6, 5], 'q2 descending, missing last, ties by id');
  assert.deepStrictEqual(Array.from(D.filter.mask), [1, 1, 0, 1, 1], 'the filter follows its cases');
  X.restore(D, snap); assert.strictEqual(D.n, 6); assert.deepStrictEqual(Array.from(D.vars[0].values), [1, 2, 3, 4, 5, 6]);
  X.sortCases(D, [{ j: 5 }]); assert.deepStrictEqual(D.vars[5].values, ['Amman', 'Amman', 'Cairo', 'Rabat', 'Rabat', ''], 'text sorted, empty last');
  X.restore(D, snap);
  X.duplicateVar(D, 1); assert.strictEqual(D.vars[2].name, 'gender_copy'); assert.notStrictEqual(D.vars[2].values, D.vars[1].values);
  X.moveVar(D, 2, 0); assert.strictEqual(D.vars[0].name, 'gender_copy'); X.deleteVars(D, [0]); assert.strictEqual(D.vars[0].name, 'id');
  assert.ok(X.snapshotCost(snap, X.snapshot(D)) === 0, 'nothing replaced since the restore');
  const hits = X.findCells(D, { text: 'male', labels: true }); assert.deepStrictEqual(hits.map(h => h.r), [0, 1, 2, 3, 5], 'female contains male');
  assert.deepStrictEqual(X.findCells(D, { text: 'male', labels: true, whole: true }).map(h => h.r), [1, 2, 5]);
  assert.strictEqual(X.replaceText(D.vars[5], 'Rabat', { text: 'ab', with: 'AB' }, true), 'RABat');
});
test('merge files: add cases by name and variables by key; transpose', () => {
  const A = sample(), B = { n: 2, vars: [X.newVar('id', 'numeric', 2, { values: arr([7, 8]) }), X.newVar('gender', 'categorical', 2, { values: arr([1, 2]), labels: [[1, 'male'], [2, 'other']] }), X.newVar('extra', 'numeric', 2, { values: arr([1, 2]) })] };
  X.mergeCases(A, B); assert.strictEqual(A.n, 8); assert.deepStrictEqual(Array.from(A.vars[0].values).slice(-2), [7, 8]);
  assert.deepStrictEqual(Array.from(A.vars[1].values).slice(-2), [2, 3], 'categories matched by label'); assert.deepStrictEqual(A.vars[1].labels[2], [3, 'other']);
  assert.strictEqual(A.vars[A.vars.length - 1].name, 'extra'); assert.ok(Number.isNaN(A.vars[A.vars.length - 1].values[0]));
  const C = sample(), K = { n: 3, vars: [X.newVar('key', 'numeric', 3, { values: arr([3, 1, 3]) }), X.newVar('score', 'numeric', 3, { values: arr([30, 10, 33]) })] };
  const r = X.mergeVars(C, K, 0, 0); assert.deepStrictEqual(r, { added: 1, matched: 2 });
  assert.deepStrictEqual(Array.from(C.vars[C.vars.length - 1].values).map(x => (x !== x ? null : x)), [10, null, 30, null, null, null], 'first match per key');
  const T = X.transpose({ n: 2, vars: [X.newVar('a', 'numeric', 2, { values: arr([1, 2]) }), X.newVar('b', 'numeric', 2, { values: arr([3, 4]) })] }, null);
  assert.deepStrictEqual(T.vars.map(v => v.name), ['variable', 'case1', 'case2']); assert.deepStrictEqual(Array.from(T.vars[2].values), [2, 4]);
});
test('SPSS: the writer’s file is read by pyreadstat with its dictionary and by our reader', () => {
  const W = require('../tools/make_data_sav.js'), bytes = W.write(), ref = fs.readFileSync(W.FILE);
  assert.deepStrictEqual(Buffer.from(bytes), ref, 'writer output unchanged (regenerate with node tools/make_data_sav.js)');
  const P = R.sav_written;
  assert.deepStrictEqual(P.names, W.SAMPLE.map(v => v.name));
  assert.deepStrictEqual(P.labels, W.SAMPLE.map(v => v.label || null));
  assert.deepStrictEqual(P.value_labels['الجنس'], { '1.0': 'ذكر', '2.0': 'أنثى' }); assert.deepStrictEqual(P.value_labels.likert, { '1.0': 'disagree', '3.0': 'neutral', '5.0': 'agree' });
  assert.deepStrictEqual(P.missing.satisfaction_score_total, [{ lo: 90, hi: 99 }]); assert.deepStrictEqual(P.missing.likert, [{ lo: -9, hi: -9 }, { lo: 99, hi: 99 }]);
  assert.deepStrictEqual(P.measure, { id: 'scale', 'الجنس': 'nominal', satisfaction_score_total: 'scale', likert: 'ordinal', city: 'nominal', when: 'scale' });
  assert.strictEqual(P.formats.city, 'A31'); assert.strictEqual(P.formats.when, 'SDATE10'); assert.strictEqual(P.formats.satisfaction_score_total, 'F10.2');
  assert.deepStrictEqual(P.rows[1], [2, 2, 95, 5, 'القاهرة', '2022-01-08']); assert.deepStrictEqual(P.rows[2].slice(4), ['a much longer string value here', null]);
  const back = IO.readSAV(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  back.vars.forEach((v, j) => {
    const s = W.SAMPLE[j];
    assert.strictEqual(v.name, s.name); assert.strictEqual(v.label, s.label); assert.strictEqual(v.type, s.type); assert.strictEqual(v.measure, s.measure);
    assert.deepStrictEqual(v.labels, s.labels); assert.deepStrictEqual(v.missing, s.missing);
    assert.deepStrictEqual(Array.from(v.values).map(x => (x !== x ? null : x)), Array.from(s.values).map(x => (x !== x ? null : x)), s.name);
  });
});
test('SPSS reader keeps the dictionary of a file written by pyreadstat', () => {
  const b = fs.readFileSync(path.join(__dirname, 'fixtures/data_meta.sav')), r = IO.readSAV(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  assert.deepStrictEqual(r.vars.map(v => [v.name, v.label, v.type, v.measure]), [['id', 'Identifier', 'numeric', 'scale'], ['score', 'Test score', 'numeric', 'scale'], ['grp', 'Group', 'categorical', 'nominal'], ['name', 'Name', 'string', 'nominal']]);
  assert.deepStrictEqual(r.vars[2].labels, [[1, 'control'], [2, 'treatment'], [8, 'refused']]);
  assert.deepStrictEqual(r.vars[1].missing, { codes: [99], lo: null, hi: null }); assert.deepStrictEqual(r.vars[2].missing, { codes: [], lo: 8, hi: 9 });
  const ds = X.toDS(X.fromVars(r.vars, r.n));
  assert.deepStrictEqual(Array.from(ds.cols[1]).map(x => (x !== x ? null : x)), [1.5, null, 3.25, null], 'user-missing 99 and system-missing');
  assert.deepStrictEqual(ds.labels[2], ['control', 'treatment'], 'refused (8) is user-missing');
  // the text export of the old reader is unchanged: user-missing values are empty
  assert.strictEqual(IO.savToCSV(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)).split('\n')[2], '2,,2,b');
});
