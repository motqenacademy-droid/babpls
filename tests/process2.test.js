// PROCESS (Hayes) engine: model templates, and numerical agreement with statsmodels (tools/reference_process.py)
'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const E = require('../js/process2.js');
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'process.json'), 'utf8'));
const names = Object.keys(FX.data);
const ds = { names, cols: names.map(n => Float64Array.from(FX.data[n])), n: FX.data[names[0]].length, kinds: names.map(() => 'num') };
const run = (opts, more) => E.tasks.hayes(ds, null, null, Object.assign({ boot: 0, jn: true }, opts, more || {}));
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);

// ------------------------------------------------------------------ templates
// equations in role names: {outcome: 'term term …'} (X×W = product)
function eqs(model, k) {
  const out = {};
  E.hayesEquations(model, k).forEach(s => { const [lhs, rhs] = s.split(' = '); out[lhs] = rhs.split(' + ').filter(t => /^b\d+·/.test(t)).map(t => t.replace(/^b\d+·/, '')).join(' '); });
  return out;
}
test('templates: equations of well-known models', () => {
  const T = {
    1: [0, { Y: 'X W X×W' }],
    2: [0, { Y: 'X W Z X×W X×Z' }],
    3: [0, { Y: 'X W Z X×W X×Z W×Z X×W×Z' }],
    4: [2, { M1: 'X', M2: 'X', Y: 'X M1 M2' }],
    5: [1, { M: 'X', Y: 'X M W X×W' }],
    6: [2, { M1: 'X', M2: 'X M1', Y: 'X M1 M2' }],
    7: [1, { M: 'X W X×W', Y: 'X M' }],
    8: [1, { M: 'X W X×W', Y: 'X M W X×W' }],
    9: [1, { M: 'X W Z X×W X×Z', Y: 'X M' }],
    11: [1, { M: 'X W Z X×W X×Z W×Z X×W×Z', Y: 'X M' }],
    12: [1, { M: 'X W Z X×W X×Z W×Z X×W×Z', Y: 'X M W Z X×W X×Z W×Z X×W×Z' }],
    13: [1, { M: 'X W Z X×W X×Z W×Z X×W×Z', Y: 'X M W X×W' }],
    14: [1, { M: 'X', Y: 'X M W M×W' }],
    15: [1, { M: 'X', Y: 'X M W X×W M×W' }],
    16: [1, { M: 'X', Y: 'X M W Z M×W M×Z' }],
    18: [1, { M: 'X', Y: 'X M W Z M×W M×Z W×Z M×W×Z' }],
    19: [1, { M: 'X', Y: 'X M W Z X×W X×Z M×W M×Z W×Z X×W×Z M×W×Z' }],
    20: [1, { M: 'X', Y: 'X M W Z X×W M×W M×Z W×Z M×W×Z' }],
    21: [1, { M: 'X W X×W', Y: 'X M Z M×Z' }],
    22: [1, { M: 'X W X×W', Y: 'X M W Z X×W M×Z' }],
    28: [1, { M: 'X W X×W', Y: 'X M Z X×Z M×Z' }],
    29: [1, { M: 'X W X×W', Y: 'X M W Z X×W X×Z M×Z' }],
    58: [1, { M: 'X W X×W', Y: 'X M W M×W' }],
    59: [1, { M: 'X W X×W', Y: 'X M W X×W M×W' }],
    62: [1, { M: 'X W Z X×W X×Z', Y: 'X M W Z X×Z M×W' }],
    64: [1, { M: 'X W X×W', Y: 'X M W Z M×W M×Z' }],
    68: [1, { M: 'X W Z X×W X×Z W×Z X×W×Z', Y: 'X M W M×W' }],
    70: [1, { M: 'X W X×W', Y: 'X M W Z M×W M×Z W×Z M×W×Z' }],
    74: [1, { M: 'X', Y: 'X M M×X' }],
    76: [1, { M: 'X W Z X×W X×Z', Y: 'X M W Z X×W X×Z M×W M×Z' }],
    80: [3, { M1: 'X', M2: 'X', M3: 'X M1 M2', Y: 'X M1 M2 M3' }],
    81: [3, { M1: 'X', M2: 'X M1', M3: 'X M1', Y: 'X M1 M2 M3' }],
    82: [4, { M1: 'X', M2: 'X M1', M3: 'X', M4: 'X M3', Y: 'X M1 M2 M3 M4' }],
    83: [2, { M1: 'X W X×W', M2: 'X M1', Y: 'X M1 M2' }],
    84: [2, { M1: 'X W X×W', M2: 'X M1 W X×W', Y: 'X M1 M2' }],
    85: [2, { M1: 'X W X×W', M2: 'X M1 W X×W', Y: 'X M1 M2 W X×W' }],
    86: [2, { M1: 'X W X×W', M2: 'X M1', Y: 'X M1 M2 W X×W' }],
    87: [2, { M1: 'X', M2: 'X M1', Y: 'X M1 M2 W M2×W' }],
    88: [2, { M1: 'X', M2: 'X M1', Y: 'X M1 M2 W M1×W M2×W' }],
    89: [2, { M1: 'X', M2: 'X M1', Y: 'X M1 M2 W X×W M1×W M2×W' }],
    90: [2, { M1: 'X', M2: 'X M1', Y: 'X M1 M2 W X×W M2×W' }],
    91: [2, { M1: 'X', M2: 'X M1 W M1×W', Y: 'X M1 M2' }],
    92: [2, { M1: 'X W X×W', M2: 'X M1 W X×W M1×W', Y: 'X M1 M2 W X×W M1×W M2×W' }]
  };
  for (const [m, [k, exp]] of Object.entries(T)) assert.deepStrictEqual(eqs(+m, k), exp, 'model ' + m);
});
test('templates: the numbered models of PROCESS v4 and their mediator limits', () => {
  const want = [];
  for (let m = 1; m <= 92; m++) if ((m <= 22) || m === 28 || m === 29 || (m >= 58 && m <= 76) || m >= 80) want.push(m);
  assert.deepStrictEqual(E.hayesModels.slice().sort((a, b) => a - b), want);
  [23, 30, 57, 77, 79, 93].forEach(m => assert.throws(() => E.hayesTemplate(m, 1), /hayes_model/));
  assert.throws(() => E.hayesTemplate(4, 11), /hayes_nmed/);
  assert.throws(() => E.hayesTemplate(6, 7), /hayes_nmed/);
  assert.throws(() => E.hayesTemplate(82, 3), /hayes_nmed/);
  assert.strictEqual(E.hayesTemplate(4, 10).paths.length, 21);
  assert.strictEqual(E.hayesTemplate(6, 4).paths.length, 15); // all X, M1..M4, Y pairs in causal order
  // which paths are moderated (spot checks)
  const mod = (m, k) => E.hayesTemplate(m, k).paths.filter(p => p.w || p.z).map(p => p.from + '>' + p.to + (p.w ? 'W' : '') + (p.z ? 'Z' : '') + (p.wz ? '3' : '')).join(' ');
  assert.strictEqual(mod(7, 3), '0>1W 0>2W 0>3W');
  assert.strictEqual(mod(14, 2), '1>3W 2>3W');
  assert.strictEqual(mod(87, 3), '3>4W');
  assert.strictEqual(mod(91, 3), '1>2W 1>3W 2>3W');
  assert.strictEqual(mod(12, 1), '0>1WZ3 0>2WZ3');
});
test('multicategorical codes match PROCESS (indicator, sequential, Helmert, effect)', () => {
  assert.deepStrictEqual(E.hayesCodes(3, 'indicator'), [[0, 0], [1, 0], [0, 1]]);
  assert.deepStrictEqual(E.hayesCodes(3, 'sequential'), [[0, 0], [1, 0], [1, 1]]);
  assert.deepStrictEqual(E.hayesCodes(3, 'effect'), [[-1, -1], [1, 0], [0, 1]]);
  assert.deepStrictEqual(E.hayesCodes(4, 'helmert'), [[-3 / 4, 0, 0], [1 / 4, -2 / 3, 0], [1 / 4, 1 / 3, -1 / 2], [1 / 4, 1 / 3, 1 / 2]]);
});
test('Student t quantiles', () => { FX.tquantiles.forEach(([p, df, q]) => close(E.hayesQt(p, df), q, 1e-10, `qt(${p}, ${df})`)); });

// ------------------------------------------------------- statsmodels reference
function checkEq(je, pe, tag) {
  assert.deepStrictEqual(je.terms.map(t => t.name), pe.names, tag + ' terms');
  ['b', 'se', 't', 'p', 'lo', 'hi'].forEach(k => pe[k].forEach((v, i) => close(je.terms[i][k], v, 1e-6, `${tag} ${k} ${pe.names[i]}`)));
  ['R', 'R2', 'MSE', 'F', 'df1', 'df2', 'p'].forEach(k => close(je.summary[k], pe.summary[k], 1e-6, `${tag} ${k}`));
}
const lin = (a, b, tag) => ['effect', 'se', 't', 'p', 'lo', 'hi'].forEach(k => close(a[k], b[k], 1e-6, tag + ' ' + k));
for (const c of FX.cases) {
  test('reference: ' + c.name, () => {
    const r = run(c.opts);
    assert.strictEqual(r.n, 300);
    assert.strictEqual(r.equations.length, c.equations.length, 'number of equations');
    c.equations.forEach((pe, i) => { assert.strictEqual(r.equations[i].outcome, pe.outcome); checkEq(r.equations[i], pe, c.name + ' ' + pe.outcome); });
    if (c.probeW) c.probeW.forEach((v, i) => close(r.probes.W.values[i], v, 1e-10, 'probe W'));
    if (c.probeZ) c.probeZ.forEach((v, i) => close(r.probes.Z.values[i], v, 1e-10, 'probe Z'));
    if (c.direct) { assert.strictEqual(r.direct.rows.length, c.direct.length); c.direct.forEach((d, i) => lin(r.direct.rows[i], d, c.name + ' direct ' + i)); }
    if (c.condInt) c.condInt.forEach((d, i) => lin(r.condInt.rows[i], d, 'conditional interaction ' + i));
    if (c.jn) { assert.ok(r.jn, 'JN computed'); assert.strictEqual(r.jn.points.length, c.jn.length); c.jn.forEach((v, i) => close(r.jn.points[i].value, v, 1e-6, 'JN point')); }
    if (c.tests) c.tests.forEach(pt => {
      const label = pt.names.join(', '), eq = r.equations[pt.eq], jt = eq.tests.find(x => x.label.replace(/^both\|/, '') === label);
      assert.ok(jt, 'interaction test ' + label + ' in ' + eq.tests.map(x => x.label).join(' / '));
      ['F', 'df1', 'df2', 'p', 'R2chg'].forEach(k => close(jt[k], pt[k], 1e-6, label + ' ' + k));
      if ('F_sm' in pt) close(jt.F, pt.F_sm, 1e-6, label + ' F (statsmodels wald_test)');
    });
    if (c.indirect) {
      assert.strictEqual(r.indirect.length, c.indirect.length, 'number of indirect effects');
      c.indirect.forEach((rows, i) => { assert.strictEqual(r.indirect[i].rows.length, rows.length); rows.forEach((v, j) => close(r.indirect[i].rows[j].effect, v, 1e-8, `indirect ${i}.${j}`)); });
    }
    if (c.indices) {
      assert.strictEqual(r.indices.length, c.indices.length, 'number of indices');
      c.indices.forEach(([type, mod, at, v], i) => { const x = r.indices[i]; assert.strictEqual(x.type, type); assert.strictEqual(x.mod, mod); if (at !== null) assert.strictEqual(x.atIndex, at); close(x.effect, v, 1e-8, `${type} ${mod}`); });
    }
    if (c.totalIndirect) c.totalIndirect.forEach((v, i) => close(r.totalIndirect[i].effect, v, 1e-8, 'total indirect'));
    if (c.contrasts) c.contrasts.forEach((v, i) => close(r.contrasts[i].effect, v, 1e-8, 'contrast ' + i));
    if (c.std) c.std.forEach(([p, cs], i) => { close(r.std[i].partial.effect, p, 1e-8, 'partially standardized'); close(r.std[i].complete.effect, cs, 1e-8, 'completely standardized'); });
    if (c.sobel) c.sobel.forEach((s, i) => ['effect', 'se', 'z', 'p'].forEach(k => close(r.sobel[i][k], s[k], 1e-8, 'Sobel ' + k)));
    if (c.totalModel) checkEq(r.totalModel, c.totalModel, 'total effect model');
    if (c.total) lin(r.totalEffect[0], c.total, 'total effect');
    if (c.omnibusDirect !== undefined) close(r.direct.omnibus.F, c.omnibusDirect, 1e-6, 'omnibus direct');
    if (c.omnibusTotal !== undefined) close(r.totalModel.omnibus.F, c.omnibusTotal, 1e-6, 'omnibus total');
  });
}

// ------------------------------------------------------------------ bootstrap
test('bootstrap: reproducible with a seed, intervals bracket the estimates', () => {
  const o = { hmodel: 7, x: 'training_hours', y: 'performance', m: ['motivation'], w: 'supervisor_support', center: 'all', boot: 800, seed: 11, condContrast: true };
  const a = run(o), b = run(o), c = run(Object.assign({}, o, { seed: 12 }));
  assert.deepStrictEqual(a.indirect, b.indirect);
  assert.deepStrictEqual(a.indices, b.indices);
  assert.notDeepStrictEqual(a.indirect[0].rows[0].lo, c.indirect[0].rows[0].lo);
  a.indirect[0].rows.concat(a.indices, a.condContrasts).forEach(x => { assert.ok(x.lo < x.effect && x.effect < x.hi, 'CI brackets'); assert.ok(x.se > 0); });
  assert.strictEqual(a.condContrasts.length, 3);
  // the contrast of two conditional indirect effects = index × difference of the moderator values
  a.condContrasts.forEach(x => close(x.effect, a.indices[0].effect * (x.v1 - x.v2), 1e-10, 'contrast = index × Δw'));
  const bc = run(Object.assign({}, o, { bootci: 'bc' }));
  bc.indirect[0].rows.forEach(x => assert.ok(x.lo < x.hi));
  assert.notStrictEqual(bc.indirect[0].rows[1].lo, a.indirect[0].rows[1].lo);
  const w99 = run(Object.assign({}, o, { conf: 99 }));
  assert.ok(w99.indices[0].hi - w99.indices[0].lo > a.indices[0].hi - a.indices[0].lo);
});
test('bootstrap: serial mediation, effect sizes and contrasts', () => {
  const r = run({ hmodel: 6, x: 'training_hours', y: 'performance', m: ['motivation', 'self_efficacy'], boot: 500, seed: 3, effsize: true, contrast: 1 });
  r.indirect.forEach(x => assert.ok(x.rows[0].lo <= x.rows[0].effect && x.rows[0].effect <= x.rows[0].hi));
  r.std.forEach(x => assert.ok(x.partial.lo < x.partial.hi && x.complete.lo < x.complete.hi));
  close(r.totalEffect[0].effect, r.direct.rows[0].effect + r.totalIndirect[0].effect, 1e-10, 'total = direct + indirect');
});
test('errors: missing roles, duplicates and bad mediator counts', () => {
  assert.throws(() => run({ hmodel: 7, x: 'training_hours', y: 'performance', m: ['motivation'] }), /hayes_mods/);
  assert.throws(() => run({ hmodel: 6, x: 'training_hours', y: 'performance', m: ['motivation'] }), /hayes_nmed/);
  assert.throws(() => run({ hmodel: 4, x: 'training_hours', y: 'training_hours', m: ['motivation'] }), /hayes_dup/);
  assert.throws(() => run({ hmodel: 1, x: 'training_hours', y: 'performance', w: 'supervisor_support', mcx: 'indicator' }), /hayes_mcx/);
});
test('interaction plot and Johnson–Neyman table', () => {
  const r = run({ hmodel: 1, x: 'training_hours', y: 'performance', w: 'supervisor_support', center: 'all' });
  assert.strictEqual(r.plot.lines.length, 3);
  // the plotted lines have the conditional slopes
  r.plot.lines.forEach((l, i) => { const [[x0, y0], [x1, y1]] = l.points; close((y1 - y0) / (x1 - x0), r.direct.rows[i].effect, 1e-9, 'simple slope'); });
  r.jn.rows.forEach(x => { if (r.jn.points.some(p => Math.abs(p.value - x.m) < 1e-12)) close(x.p, 0.05, 1e-6, 'p = .05 at the JN boundary'); });
  assert.strictEqual(run({ hmodel: 1, x: 'training_hours', y: 'performance', w: 'senior' }).jn, null); // no JN for a dichotomous moderator
});

// --------------------------------------------------------------- UI plugin
test('plugin: i18n keys in both languages, methods documented with valid MathML', () => {
  global.window = global.window || {};
  delete require.cache[require.resolve('../js/ui-process.js')];
  global.self = global.window; require('../js/ui-process.js'); delete global.self;
  const p = (global.window.YP_PLUGINS || []).find(x => x.id === 'process');
  assert.ok(p);
  assert.deepStrictEqual(Object.keys(p.i18n.en).sort(), Object.keys(p.i18n.ar).sort());
  ['menu_process', 'an_hayes', 'an_hayes_d', 'err_hayes_vars', 'err_hayes_nmed', 'err_hayes_mods'].forEach(k => assert.ok(p.i18n.en[k] && p.i18n.ar[k], k));
  assert.ok(p.tasks.hayes && p.tasks.hayes.doc === 'hayes' && p.tasks.hayes.title === 'an_hayes');
  p.tasks.hayes.fields.forEach(k => assert.ok(p.fields[k] || ['samples', 'seed'].includes(k), 'field ' + k));
  p.tasks.hayes.fields.filter(k => p.fields[k]).forEach(k => assert.ok(p.i18n.en['f_' + k] && p.i18n.ar['f_' + k], 'label f_' + k));
  assert.ok(p.methods.some(m => m.id === 'hayes'));
  for (const m of p.methods) {
    for (const L of ['en', 'ar']) assert.ok(m[L] && m[L].title && m[L].text && m[L].origin, m.id + ' ' + L);
    assert.ok(m.refs.length); m.refs.forEach(r => assert.ok(p.refs[r], m.id + ' -> ' + r));
    assert.match(m.formula, /^<math display="block">[\s\S]*<\/math>$/, m.id);
    // well-formed: every tag closed in order
    const st = []; for (const t of m.formula.matchAll(/<(\/?)([a-z]+)[^>]*?(\/?)>/g)) { if (t[3]) continue; if (t[1]) assert.strictEqual(st.pop(), t[2], m.id + ' </' + t[2] + '>'); else st.push(t[2]); }
    assert.strictEqual(st.length, 0, m.id + ' unclosed');
  }
  // every key the renderer uses exists in both languages (plugin strings or the shared dictionary)
  const saved = global.window; global.window = {}; require('../js/i18n.js'); const G = global.window.YPI18N; global.window = saved;
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui-process.js'), 'utf8'), keys = new Set();
  for (const m of src.matchAll(/\bt\('([a-z0-9_]+)'(?!\s*\+)/gi)) keys.add(m[1]);
  ['hy_cov_', 'hy_mcx_', 'hy_cen_', 'hy_probe_', 'hy_ci_', 'hy_con_'].forEach(pre => Object.keys(p.i18n.en).filter(k => k.startsWith(pre)).forEach(k => keys.add(k)));
  ['imm', 'pmm', 'cmm', 'mmm', 'm80', 'm81', 'm82'].forEach(k => keys.add('hy_' + k));
  ['vars', 'nmed', 'mods', 'dup', 'mcx', 'mcx74', 'n', 'singular', 'model'].forEach(k => keys.add('err_hayes_' + k));
  assert.deepStrictEqual([...keys].filter(k => !((p.i18n.en[k] || G.en[k]) && (p.i18n.ar[k] || G.ar[k]))), [], 'undefined UI keys');
  const used = new Set(p.methods.flatMap(m => m.refs));
  // every card's doc id is a documented method
  for (const m of src.matchAll(/doc: '([a-z_]+)'/g)) assert.ok(p.methods.some(x => x.id === m[1]), 'doc ' + m[1]); assert.deepStrictEqual(Object.keys(p.refs).filter(k => !used.has(k)), []);
});
