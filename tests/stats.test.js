// Classic statistics I (js/stats.js) against scipy / statsmodels / pingouin references in tests/fixtures/stats.json
// (regenerate with: python tools/reference_stats.py > tests/fixtures/stats.json). Closed forms are checked to ~1e-8
// relative; p-values from iterative or tabulated distributions (studentized range, non-central t limits, Mauchly,
// rank tests) to ~1e-6 or tighter. Plus checks of the UI plugin (i18n keys, method docs, references, MathML).
'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const E = require('../js/stats.js'), S = E.st;
const R = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/stats.json'), 'utf8'));
const csv = f => E.parseCSV(fs.readFileSync(path.join(root, 'examples', f), 'utf8'));
const CS = csv('customer_satisfaction.csv'), FAC = E.parseCSV(R.data.fac), SMALL = E.parseCSV(R.data.small), RM = E.parseCSV(R.data.rm);

function close(a, b, rel, label, abs) {
  rel = rel || 1e-8; abs = abs === undefined ? 1e-12 : abs;
  if (b === null || b === undefined) { assert.ok(!isFinite(a), `${label}: expected non-finite, got ${a}`); return; }
  assert.ok(Math.abs(a - b) <= Math.max(abs, rel * Math.abs(b)), `${label}: ${a} vs ${b} (diff ${a - b})`);
}
const run = (task, ds, opts) => E.tasks[task](ds, null, {}, opts);
const pairKey = (rows, key) => { const [a, b] = key.split('|'); const r = rows.find(x => x.a === a && x.b === b); if (r) return { r, s: 1 }; const q = rows.find(x => x.a === b && x.b === a); assert.ok(q, 'pair ' + key); return { r: q, s: -1 }; };

test('distribution functions match scipy', () => {
  const D = R.dist;
  D.pnorm.forEach(([z, p]) => close(S.pnorm(z), p, 1e-12, 'pnorm ' + z));
  D.qnorm.forEach(([p, z]) => close(S.qnorm(p), z, 1e-12, 'qnorm ' + p));
  D.pt.forEach(([t, df, p]) => close(S.pt(t, df), p, 1e-11, 'pt ' + t));
  D.qt.forEach(([p, df, q]) => close(S.qt(p, df), q, 1e-10, 'qt ' + p));
  D.pnt.forEach(([t, df, nc, p]) => close(S.pnt(t, df, nc), p, 1e-9, `pnt ${t},${df},${nc}`));
  D.ptukey.forEach(([q, k, df, p]) => close(S.ptukey(q, k, df, false), p, 1e-7, `ptukey ${q},${k},${df}`));
  D.qtukey.forEach(([p, k, df, q]) => close(S.qtukey(p, k, df), q, 1e-7, `qtukey ${p},${k},${df}`));
  D.pchisq.forEach(([x, df, p]) => close(S.pchisq(x, df), p, 1e-11, 'pchisq ' + x));
  D.pf.forEach(([f, a, b, p]) => close(S.pf(f, a, b), p, 1e-11, 'pf ' + f));
  D.shapiro.forEach(([v, w, p]) => { const r = S.shapiroWilk(v); close(r.w, w, 1e-10, 'SW W n=' + v.length); close(r.p, p, 1e-9, 'SW p n=' + v.length); });
});

test('exact rank distributions', () => {
  const c = S.mwCounts(4, 3); assert.strictEqual(c.reduce((a, b) => a + b, 0), 35); // C(7,3)
  assert.deepStrictEqual(Array.from(c), [1, 1, 2, 3, 4, 4, 5, 4, 4, 3, 2, 1, 1]);
  const w = S.signrankCounts(5); assert.strictEqual(w.reduce((a, b) => a + b, 0), 32);
  assert.deepStrictEqual(Array.from(w), [1, 1, 1, 2, 2, 3, 3, 3, 3, 3, 3, 2, 2, 1, 1, 1]);
});

test('descriptives (type-7 quantiles, G1/G2 with SEs, Shapiro–Wilk, CI)', () => {
  const r = run('st_desc', CS, { vars: ['sat_1', 'age', 'val_1', 'imag_2', 'gender'], pct: [10, 90] });
  ['sat_1', 'age', 'val_1', 'imag_2'].forEach(v => {
    const g = r.vars.find(x => x.name === v).groups[0], ref = R.desc[v];
    ['n', 'mean', 'sd', 'se', 'variance', 'ciLo', 'ciHi', 'median', 'mode', 'min', 'max', 'q1', 'q3', 'skew', 'kurt', 'seSkew', 'seKurt', 'swW'].forEach(k => close(g[k], ref[k], 1e-10, v + ' ' + k));
    close(g.swP, ref.swP, 1e-8, v + ' swP');
    close(g.pct[0].v, ref.p10, 1e-12, v + ' p10'); close(g.pct[1].v, ref.p90, 1e-12, v + ' p90');
  });
  const gd = r.vars.find(x => x.name === 'gender'); assert.ok(gd.cat && gd.freq);
  assert.strictEqual(gd.freq.rows.find(x => x.label === 'female').count, R.freq_gender.female);
  const s = run('st_desc', CS, { vars: ['age'], split: 'gender' });
  s.vars[0].groups.forEach(g => ['n', 'mean', 'sd', 'median', 'q1', 'q3', 'skew', 'kurt', 'swW'].forEach(k => close(g[k], R.desc_split[g.label][k], 1e-10, 'split ' + g.label + ' ' + k)));
});

test('normality: Shapiro–Wilk, Lilliefors (K–S), Anderson–Darling', () => {
  const check = (ds, v, ref) => {
    const r = run('st_normality', ds, { vars: [v] }).rows[0];
    close(r.sw.w, ref.swW, 1e-10, v + ' W'); close(r.sw.p, ref.swP, 1e-8, v + ' SW p');
    close(r.ks.d, ref.ksD, 1e-10, v + ' D'); close(r.ks.p, ref.ksP, 1e-8, v + ' KS p');
    close(r.ad.a2, ref.adA, 1e-9, v + ' A2'); close(r.ad.p, ref.adP, 1e-8, v + ' AD p');
  };
  ['sat_1', 'age', 'val_1'].forEach(v => check(CS, v, R.normality[v]));
  ['v', 'pre'].forEach(v => check(SMALL, v, R.normality['small_' + v]));
});

test('one-sample t-test, Cohen d CI (non-central t), Wilcoxon signed-rank', () => {
  const alt = a => (a === 'two-sided' ? 'two' : a);
  ['sat_1', 'age', 'val_1'].forEach(v => {
    const ref = R.ttest_one[v], r = run('st_ttest_one', CS, { vars: [v], mu: ref.mu, alt: alt(ref.alt) }).rows[0];
    close(r.t, ref.t, 1e-10, v + ' t'); close(r.df, ref.df, 1e-12, v + ' df'); close(r.p, ref.p, 1e-9, v + ' p');
    close(r.lo, ref.lo, 1e-9, v + ' lo'); close(r.hi, ref.hi, 1e-9, v + ' hi');
    close(r.d, ref.d, 1e-10, v + ' d'); close(r.dLo, ref.dLo, 1e-7, v + ' dLo'); close(r.dHi, ref.dHi, 1e-7, v + ' dHi'); close(r.g, ref.g, 1e-9, v + ' g');
    close(r.wilcoxon.V, ref.V, 1e-12, v + ' V'); close(r.wilcoxon.p, ref.wp, 1e-8, v + ' Wilcoxon p'); close(r.wilcoxon.rbc, ref.rbc, 1e-10, v + ' rbc');
    assert.ok(!r.wilcoxon.exact);
  });
  const ref = R.ttest_one.small_v, r = run('st_ttest_one', SMALL, { vars: ['v'], mu: 11 }).rows[0];
  close(r.t, ref.t, 1e-10, 'small t'); close(r.p, ref.p, 1e-9, 'small p');
  assert.ok(r.wilcoxon.exact); close(r.wilcoxon.V, ref.V, 1e-12, 'small V'); close(r.wilcoxon.p, ref.wp, 1e-10, 'exact Wilcoxon p'); close(r.wilcoxon.hl, ref.hl, 1e-12, 'HL');
});

test('independent t-tests: Student, Welch, Mann–Whitney, Levene / Brown–Forsythe', () => {
  const alt = a => (a === 'two-sided' ? 'two' : a);
  ['sat_1', 'age', 'loy_1'].forEach(v => {
    const ref = R.ttest_ind[v], r = run('st_ttest_ind', CS, { vars: [v], group: 'gender', alt: alt(ref.alt) });
    assert.deepStrictEqual(r.labels, ref.groups);
    const x = r.rows[0], s = x.student, w = x.welch;
    close(s.t, ref.t, 1e-10, v + ' t'); close(s.df, ref.df, 1e-12, v + ' df'); close(s.p, ref.p, 1e-9, v + ' p'); close(s.lo, ref.lo, 1e-9, v + ' lo'); close(s.hi, ref.hi, 1e-9, v + ' hi');
    close(s.d, ref.d, 1e-10, v + ' d'); close(s.dLo, ref.dLo, 1e-7, v + ' dLo'); close(s.dHi, ref.dHi, 1e-7, v + ' dHi'); close(s.g, ref.g, 1e-9, v + ' g');
    close(w.t, ref.tw, 1e-10, v + ' Welch t'); close(w.df, ref.dfw, 1e-10, v + ' Welch df'); close(w.p, ref.pw, 1e-9, v + ' Welch p'); close(w.lo, ref.low, 1e-9, v + ' Welch lo'); close(w.hi, ref.hiw, 1e-9, v + ' Welch hi'); close(w.d, ref.dw, 1e-10, v + ' Welch d');
    close(x.mann.U, ref.U, 1e-12, v + ' U'); close(x.mann.p, ref.mwp, 1e-8, v + ' MW p'); close(x.mann.rbc, ref.rbc, 1e-10, v + ' rbc');
    close(x.levene.F, ref.lev[0], 1e-9, v + ' Levene F'); close(x.levene.p, ref.lev[1], 1e-8, v + ' Levene p');
    const bf = run('st_ttest_ind', CS, { vars: [v], group: 'gender', center: 'median' }).rows[0].levene; close(bf.F, ref.bfl[0], 1e-9, v + ' BF F'); close(bf.p, ref.bfl[1], 1e-8, v + ' BF p');
  });
  const ref = R.ttest_ind.small_v, x = run('st_ttest_ind', SMALL, { vars: ['v'], group: 'g' }).rows[0];
  assert.ok(x.mann.exact); close(x.mann.U, ref.U, 1e-12, 'exact U'); close(x.mann.p, ref.mwp, 1e-10, 'exact MW p'); close(x.mann.rbc, ref.rbc, 1e-12, 'rbc');
  close(x.mann.ci[0], ref.rbcCI[0], 1e-9, 'rbc lo'); close(x.mann.ci[1], ref.rbcCI[1], 1e-9, 'rbc hi'); close(x.mann.hl, ref.hl, 1e-12, 'HL two-sample');
  close(run('st_ttest_ind', SMALL, { vars: ['v'], group: 'g', alt: 'less' }).rows[0].mann.p, ref.mwpLess, 1e-10, 'exact MW one-sided');
  assert.throws(() => run('st_ttest_ind', FAC, { vars: ['y'], group: 'A' }), /st_two_groups/);
});

test('paired t-test, Wilcoxon signed-rank, sign test', () => {
  const alt = a => (a === 'two-sided' ? 'two' : a);
  Object.keys(R.ttest_paired).forEach(key => {
    const ref = R.ttest_paired[key], [a, b] = key.split('|'), ds = a === 'pre' ? SMALL : CS, r = run('st_ttest_paired', ds, { pairs: [[a, b]], alt: alt(ref.alt) }).rows[0];
    close(r.t, ref.t, 1e-10, key + ' t'); close(r.df, ref.df, 1e-12, key + ' df'); close(r.p, ref.p, 1e-9, key + ' p');
    if (ref.lo !== undefined) { close(r.lo, ref.lo, 1e-9, key + ' lo'); close(r.hi, ref.hi, 1e-9, key + ' hi'); close(r.d, ref.d, 1e-10, key + ' d'); close(r.dLo, ref.dLo, 1e-7, key + ' dLo'); close(r.dHi, ref.dHi, 1e-7, key + ' dHi'); close(r.wilcoxon.rbc, ref.rbc, 1e-10, key + ' rbc'); }
    close(r.wilcoxon.V, ref.V, 1e-12, key + ' V'); close(r.wilcoxon.p, ref.wp, 1e-8, key + ' W p'); close(r.sign.p, ref.signp, 1e-10, key + ' sign p');
    if (ref.hl !== undefined) close(r.wilcoxon.hl, ref.hl, 1e-12, key + ' HL');
  });
});

const tableCheck = (rows, ref, label, extra) => Object.keys(ref.rows).forEach(term => {
  const x = rows.find(r => r.term === term), y = ref.rows[term]; assert.ok(x, label + ' term ' + term);
  close(x.ss, y.ss, 1e-8, `${label} ${term} SS`); assert.strictEqual(x.df, y.df); close(x.F, y.F, 1e-8, `${label} ${term} F`); close(x.p, y.p, 1e-7, `${label} ${term} p`, 1e-14);
  if (extra) { close(x.eta2, y.eta2, 1e-8, term + ' eta2'); close(x.peta2, y.peta2, 1e-8, term + ' peta2'); close(x.omega2, y.omega2, 1e-8, term + ' omega2'); }
});

test('ANOVA: Type I/II/III, effect sizes, ANCOVA, homogeneity of slopes', () => {
  const A = R.anova;
  [1, 2, 3].forEach(t => { const r = run('st_anova', FAC, { dv: 'y', factors: ['A', 'B'], ssType: t }); tableCheck(r.table, A['two_way_type' + t], 'type ' + t, true); close(r.resid.ss, A['two_way_type' + t].sse, 1e-9, 'SSE'); assert.strictEqual(r.resid.df, A['two_way_type' + t].dfe); });
  tableCheck(run('st_anova', FAC, { dv: 'y', factors: ['A'] }).table, A.one_way, 'one-way', true);
  tableCheck(run('st_ancova', FAC, { dv: 'y', factors: ['A'], covs: ['x'] }).table, A.ancova_type3, 'ancova', true);
  tableCheck(run('st_ancova', FAC, { dv: 'y', factors: ['A', 'B'], covs: ['x'] }).table, A.ancova2_type3, 'ancova2');
  tableCheck(run('st_ancova', FAC, { dv: 'y', factors: ['A', 'B'], covs: ['x'], ssType: 1 }).table, A.ancova2_type1, 'ancova2 type1');
  const sl = run('st_ancova', FAC, { dv: 'y', factors: ['A'], covs: ['x'], slopes: true }).slopes[0], ref = A.slopes.rows['A ✻ x'];
  close(sl.F, ref.F, 1e-8, 'slopes F'); close(sl.p, ref.p, 1e-7, 'slopes p'); assert.strictEqual(sl.df, ref.df);
});

test('one-way ANOVA: Welch, Brown–Forsythe, Levene, post hoc (Tukey, Scheffé, Bonferroni, Games–Howell)', () => {
  const A = R.anova, r = run('st_anova', FAC, { dv: 'y', factors: ['A'] });
  close(r.welch.F, A.welch.F, 1e-9, 'Welch F'); close(r.welch.df2, A.welch.df2, 1e-9, 'Welch df2'); close(r.welch.p, A.welch.p, 1e-8, 'Welch p');
  close(r.bf.F, A.bf.F, 1e-9, 'BF F'); close(r.bf.F, A.bf.F_sm, 1e-9, 'BF F (statsmodels)'); close(r.bf.df2, A.bf.df2, 1e-9, 'BF df2'); close(r.bf.p, A.bf.p, 1e-8, 'BF p');
  close(r.levene.F, A.levene_oneway[0], 1e-9, 'Levene F'); close(r.levene.p, A.levene_oneway[1], 1e-8, 'Levene p');
  const ph = r.emm[0].posthoc, gh = r.emm[0].gh;
  Object.keys(A.posthoc_oneway).forEach(k => {
    const ref = A.posthoc_oneway[k], { r: x, s } = pairKey(ph, k);
    close(s * x.diff, ref.diff, 1e-9, k + ' diff'); close(x.se, ref.se, 1e-9, k + ' se'); close(s * x.t, ref.t, 1e-9, k + ' t');
    close(x.pTukey, ref.pTukey, 1e-6, k + ' Tukey p'); close(x.pScheffe, ref.pScheffe, 1e-8, k + ' Scheffe p'); close(x.pBonf, ref.pBonf, 1e-8, k + ' Bonferroni p'); close(s * x.d, ref.d, 1e-9, k + ' d');
    close(s > 0 ? x.lo : -x.hi, ref.lo, 1e-6, k + ' Tukey lo'); close(s > 0 ? x.hi : -x.lo, ref.hi, 1e-6, k + ' Tukey hi');
    const { r: g, s: s2 } = pairKey(gh, k);
    close(s2 * g.diff, ref.gh.diff, 1e-9, k + ' GH diff'); close(g.se, ref.gh.se, 1e-9, k + ' GH se'); close(g.df, ref.gh.df, 1e-9, k + ' GH df'); close(g.p, ref.gh.p, 1e-6, k + ' GH p');
  });
  const r2 = run('st_anova', FAC, { dv: 'y', factors: ['A', 'B'] });
  close(r2.levene.F, A.levene_cells[0], 1e-9, 'Levene cells F'); close(r2.levene.p, A.levene_cells[1], 1e-8, 'Levene cells p');
  close(run('st_anova', FAC, { dv: 'y', factors: ['A', 'B'], center: 'median' }).levene.F, A.bf_cells[0], 1e-9, 'BF cells F');
  close(r2.residSW.w, A.resid_sw_two_way[0], 1e-9, 'residual SW W'); close(r2.residSW.p, A.resid_sw_two_way[1], 1e-7, 'residual SW p');
});

test('estimated marginal means and their comparisons (unbalanced two-way, ANCOVA)', () => {
  const check = (r, ref, label) => {
    const em = r.emm.find(e => e.factor === 'A');
    Object.keys(ref.emm).forEach(lv => { const x = em.rows.find(z => z.level === lv); close(x.mean, ref.emm[lv].mean, 1e-9, label + ' EMM ' + lv); close(x.se, ref.emm[lv].se, 1e-9, label + ' EMM SE ' + lv); });
    Object.keys(ref.pairs).forEach(k => { const { r: x, s } = pairKey(em.posthoc, k), y = ref.pairs[k]; close(s * x.diff, y.diff, 1e-9, label + k + ' diff'); close(x.se, y.se, 1e-9, label + k + ' se'); close(x.pTukey, y.pTukey, 1e-6, label + k + ' Tukey'); if (y.pScheffe !== undefined) close(x.pScheffe, y.pScheffe, 1e-8, label + k + ' Scheffe'); });
  };
  check(run('st_anova', FAC, { dv: 'y', factors: ['A', 'B'] }), R.anova.emm_two_way, 'two-way ');
  check(run('st_ancova', FAC, { dv: 'y', factors: ['A'], covs: ['x'] }), R.anova.emm_ancova, 'ancova ');
});

test('repeated-measures ANOVA: one within factor, sphericity, corrections, post hoc', () => {
  const ref = R.rm.oneway, r = run('st_rmanova', RM, { measures: ['t1', 't2', 't3'] }), w = r.within[0];
  close(w.ss, ref.SS, 1e-9, 'SS'); assert.strictEqual(w.df, ref.df); close(w.err.ss, ref.SSerr, 1e-9, 'SSerr'); assert.strictEqual(w.err.df, ref.dferr);
  close(w.F, ref.F, 1e-9, 'F'); close(w.p, ref.p, 1e-8, 'p'); close(w.sph.gg, ref.gg, 1e-9, 'GG'); close(w.pGG, ref.pGG, 1e-8, 'p GG'); close(w.sph.hf, ref.hf, 1e-9, 'HF');
  close(w.sph.W, ref.W, 1e-9, 'Mauchly W'); close(w.sph.chi, ref.chi, 1e-9, 'Mauchly chi2'); close(w.sph.p, ref.pMauchly, 1e-8, 'Mauchly p (R)'); close(w.geta2, ref.ng2, 1e-9, 'generalised eta2');
  ref.ph = R.rm.oneway_posthoc; ref.ph.forEach(p => { const x = r.posthoc[0].rows.find(z => z.a === p.a && z.b === p.b); close(x.t, p.t, 1e-9, 'post hoc t'); close(x.p, p.p, 1e-8, 'post hoc p'); close(x.pBonf, p.pBonf, 1e-8, 'bonf'); close(x.pHolm, p.pHolm, 1e-8, 'holm'); });
});

test('repeated-measures ANOVA: two within factors and a mixed design', () => {
  const cols = ['a1b1', 'a1b2', 'a1b3', 'a2b1', 'a2b2', 'a2b3'], r = run('st_rmanova', RM, { measures: cols, levels: [2, 3], wnames: ['FA', 'FB'] });
  Object.keys(R.rm.twoway).forEach(term => {
    const x = r.within.find(z => z.term === term), y = R.rm.twoway[term], g = R.rm.twoway_pg[term];
    close(x.F, y.F, 1e-9, term + ' F'); assert.strictEqual(x.df, y.df1); assert.strictEqual(x.err.df, y.df2); close(x.p, y.p, 1e-8, term + ' p');
    close(x.sph.gg, g.eps, 1e-9, term + ' GG'); close(x.pGG, g.pGG, 1e-8, term + ' p GG'); close(x.geta2, g.ng2, 1e-9, term + ' ng2');
  });
  const m = run('st_rmanova', RM, { measures: ['t1', 't2', 't3'], between: 'G' }), M = R.rm.mixed;
  const b = m.betweenRows[0]; close(b.ss, M.G.SS, 1e-8, 'G SS'); close(b.F, M.G.F, 1e-8, 'G F'); close(b.p, M.G.p, 1e-8, 'G p'); close(b.peta2, M.G.np2, 1e-8, 'G np2'); assert.strictEqual(m.subjErr.df, M.G.df2);
  const t = m.within.find(z => z.term === 'RM'); close(t.ss, M.T.SS, 1e-9, 'T SS'); close(t.F, M.T.F, 1e-9, 'T F'); close(t.p, M.T.p, 1e-8, 'T p'); close(t.peta2, M.T.np2, 1e-9, 'T np2'); close(t.sph.gg, M.T.eps, 1e-9, 'T eps'); close(t.pGG, M.T.pGG, 1e-8, 'T pGG');
  const i = m.within.find(z => z.term === 'RM ✻ G'), I = M.Interaction; close(i.ss, I.SS, 1e-8, 'TxG SS'); close(i.F, I.F, 1e-8, 'TxG F'); close(i.p, I.p, 1e-8, 'TxG p'); assert.strictEqual(i.err.df, I.df2);
});

test('MANOVA (Pillai, Wilks, Hotelling–Lawley, Roy) and Box\'s M', () => {
  const r = run('st_manova', FAC, { dvs: ['y', 'y2', 'y3'], factors: ['A', 'B'] });
  Object.keys(R.manova).forEach(term => {
    const x = r.tests.find(z => z.term === term), y = R.manova[term];
    ['pillai', 'wilks', 'hotelling', 'roy'].forEach(k => { close(x[k].stat, y[k].stat, 1e-9, term + ' ' + k); close(x[k].F, y[k].F, 1e-9, term + ' ' + k + ' F'); close(x[k].df1, y[k].df1, 1e-12, term + k + ' df1'); close(x[k].df2, y[k].df2, 1e-12, term + k + ' df2'); close(x[k].p, y[k].p, 1e-8, term + ' ' + k + ' p'); });
    close(x.hotelling.stat, y.hotelling.stat_sm, 1e-9, term + ' HL (statsmodels)');
  });
  const b = run('st_manova', FAC, { dvs: ['y', 'y2', 'y3'], factors: ['A'] }).box;
  close(b.chi, R.boxm_A.chi, 1e-9, 'Box chi2'); assert.strictEqual(b.df, R.boxm_A.df); close(b.p, R.boxm_A.p, 1e-8, 'Box p');
});

test('Kruskal–Wallis with Dunn post hoc; Friedman with Kendall W and Conover', () => {
  ['yi', 'y'].forEach(v => {
    const ref = R.kruskal[v], r = run('st_kruskal', FAC, { vars: [v], group: 'A' }).rows[0];
    close(r.H, ref.H, 1e-10, v + ' H'); close(r.p, ref.p, 1e-9, v + ' p'); close(r.eps2, ref.eps2, 1e-10, v + ' eps2');
    Object.keys(ref.dunn).forEach(k => { const { r: x, s } = pairKey(r.dunn, k); close(s * x.z, ref.dunn[k].z, 1e-10, k + ' z'); close(x.p, ref.dunn[k].p, 1e-9, k + ' Dunn p'); });
  });
  const k2 = run('st_kruskal', CS, { vars: ['sat_1'], group: 'gender' }).rows[0]; close(k2.H, R.kruskal.sat_1_gender.H, 1e-10, 'H 2 groups'); close(k2.p, R.kruskal.sat_1_gender.p, 1e-9, 'p 2 groups');
  [['rm_r', RM, ['r1', 'r2', 'r3']], ['rm_t', RM, ['t1', 't2', 't3']], ['cs_imag', CS, ['imag_1', 'imag_2', 'imag_3']]].forEach(([key, ds, cols]) => {
    const ref = R.friedman[key], r = run('st_friedman', ds, { measures: cols });
    assert.strictEqual(r.n, ref.n); close(r.chi, ref.chi, 1e-10, key + ' chi2'); close(r.p, ref.p, 1e-9, key + ' p'); close(r.W, ref.W, 1e-10, key + ' W'); close(r.W, ref.W_pg, 1e-9, key + ' W (pingouin)');
    Object.keys(ref.conover).forEach(k => { const [i, j] = k.split('|').map(Number), x = r.conover.find(z => z.a === cols[i] && z.b === cols[j]); close(x.t, ref.conover[k].t, 1e-10, key + k + ' t'); close(x.p, ref.conover[k].p, 1e-9, key + k + ' p'); });
  });
});

test('results are plain data (structured-clone safe) and errors are coded', () => {
  const r = run('st_anova', FAC, { dv: 'y', factors: ['A', 'B'], covs: ['x'] });
  assert.doesNotThrow(() => structuredClone(r));
  assert.throws(() => run('st_desc', CS, { vars: [] }), /st_need_vars/);
  assert.throws(() => run('st_rmanova', RM, { measures: ['t1', 't2', 't3'], levels: [2, 2] }), /st_levels/);
});

// ------------------------------------------------------------------ UI plugin
test('UI plugin: tasks, i18n keys in both languages, documented methods with MathML and references', () => {
  const ctx = {}; global.self = ctx; delete require.cache[require.resolve('../js/ui-stats.js')];
  require('../js/ui-stats.js'); delete global.self;
  const P = ctx.YP_PLUGINS.find(p => p.id === 'stats'); assert.ok(P);
  const en = P.i18n.en, ar = P.i18n.ar;
  assert.deepStrictEqual(Object.keys(en).filter(k => !ar[k]), [], 'missing in ar'); assert.deepStrictEqual(Object.keys(ar).filter(k => !en[k]), [], 'missing in en');
  global.window = {}; require('../js/i18n.js'); const G = global.window.YPI18N; delete global.window;
  const has = k => (en[k] || G.en[k]) && (ar[k] || G.ar[k]);
  const src = fs.readFileSync(path.join(root, 'js/ui-stats.js'), 'utf8');
  const used = new Set(); for (const m of src.matchAll(/\bt\('([a-z0-9_]+)'/gi)) if (!m[1].endsWith('_')) used.add(m[1]);
  // dynamic families: t('st_alt_' + v) etc., and the label of every plugin field (t('f_' + key))
  [['st_alt_', ['two', 'greater', 'less']], ['st_eff_', ['d', 'g', 'delta']], ['st_center_', ['mean', 'median']], ['st_sstype_', ['1', '2', '3']], ['st_ph_', ['tukey', 'scheffe', 'bonferroni', 'holm', 'gameshowell']], ['st_corr_', ['none', 'greenhouse', 'huynh']]]
    .forEach(([pre, vals]) => vals.forEach(v => used.add(pre + v)));
  Object.keys(P.fields).filter(k => k !== 'stNumVars').forEach(k => used.add('f_' + k));
  Object.keys(P.tasks).forEach(k => { const tk = P.tasks[k]; used.add(tk.title); used.add(tk.title + '_d'); assert.ok(E.tasks[tk.task || k], 'engine task ' + k); assert.ok(tk.noModel); assert.ok(P.methods.some(m => m.id === tk.doc), 'doc ' + k); });
  P.menu.forEach(g => { used.add(g.group); g.items.forEach(k => assert.ok(P.tasks[k], 'menu item ' + k)); });
  for (const m of src.matchAll(/\b(?:err|opt|f)_[A-Za-z0-9_]+/g)) if (!m[0].endsWith('_')) used.add(m[0]);
  for (const c of ['st_need_vars', 'st_need_group', 'st_two_groups', 'st_too_few', 'st_need_pairs', 'st_need_dv', 'st_need_factor', 'st_dv_twice', 'st_one_level', 'st_empty_cell', 'st_singular', 'st_need_measures', 'st_levels', 'st_need_dvs']) used.add('err_' + c);
  assert.deepStrictEqual([...used].filter(k => !has(k)), [], 'undefined UI keys');
  const ids = new Set(); const docIds = new Set([...src.matchAll(/doc: '([a-z0-9]+)'/g)].map(m => m[1]));
  P.methods.forEach(m => {
    assert.ok(!ids.has(m.id), 'duplicate method ' + m.id); ids.add(m.id);
    ['en', 'ar'].forEach(L => { assert.ok(m[L] && m[L].title && m[L].text && m[L].origin, `${m.id} ${L}`); });
    assert.ok(m.refs.length && m.refs.every(r => P.refs[r]), 'refs of ' + m.id);
    assert.ok(/^<math display="block">[\s\S]*<\/math>$/.test(m.formula), 'MathML ' + m.id);
    const tags = [...m.formula.matchAll(/<(\/?)([a-z]+)[^>]*?(\/?)>/g)], stack = [];
    tags.forEach(([, close_, name, self_]) => { if (self_) return; if (close_) assert.strictEqual(stack.pop(), name, 'balanced MathML in ' + m.id); else stack.push(name); });
    assert.strictEqual(stack.length, 0, 'unclosed MathML in ' + m.id);
  });
  docIds.forEach(d => assert.ok(ids.has(d), 'card doc ' + d));
  const cited = new Set(P.methods.flatMap(m => m.refs)); assert.deepStrictEqual(Object.keys(P.refs).filter(k => !cited.has(k)), [], 'uncited refs');
  Object.values(P.refs).forEach(r => assert.ok(/\(\d{4}[a-z]?\)\./.test(r), 'APA year in ' + r));
});
