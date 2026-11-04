// Generates the example datasets in examples/ and the embedded copy js/example-data.js.
// Every dataset is synthetic, drawn from a known population model with a fixed seed, so the guides in
// js/examples.js can state what each analysis should find (tests/examples.test.js checks those claims).
'use strict';
const SEED_T = 27;
const fs = require('fs'), path = require('path');
const E = require('../js/advanced3.js');
const OUT = path.join(__dirname, '..', 'examples');

function gen(seed) {
  const rand = E.rng(seed);
  const gauss = () => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
  return { rand, gauss };
}
// 7-point (or k-point) Likert item from a standardised latent score
function likert(g, z, lam, k, centre, spread) {
  const x = lam * z + Math.sqrt(1 - lam * lam) * g.gauss();
  const v = Math.round((centre || (k + 1) / 2 + 0.5) + (spread || 1.25) * x);
  return Math.max(1, Math.min(k || 7, v));
}
const toCSV = rows => { const names = Object.keys(rows[0]); return [names.join(',')].concat(rows.map(r => names.map(n => r[n]).join(','))).join('\n') + '\n'; };
const C = (id, name, mode, indicators, x, y, side) => ({ id, name, mode, indicators, x, y, side: side || 'left' });
const P = (from, to) => ({ from, to });
const items = (p, k) => Array.from({ length: k }, (_, q) => p + '_' + (q + 1));
const sets = {};

// ------------------------------------------------------------------ 1. customer satisfaction (existing file)
{
  const csv = fs.readFileSync(path.join(OUT, 'customer_satisfaction.csv'), 'utf8');
  const m1 = JSON.parse(fs.readFileSync(path.join(OUT, 'customer_satisfaction.model.json'), 'utf8'));
  const m2 = JSON.parse(JSON.stringify(m1)); m2.paths = m2.paths.filter(p => !(p.from === 'c2' && p.to === 'c5'));
  sets.customer = { file: 'customer_satisfaction.csv', csv, models: [{ name: 'Model 1', model: m1 }, { name: 'Model 2', model: m2 }] };
}

// ------------------------------------------------------------------ 2. workload, support, stress, wellbeing
{
  const g = gen(11), rows = [], N = 350;
  for (let i = 0; i < N; i++) {
    const WL = g.gauss(), SUP = 0.2 * g.gauss() + Math.sqrt(0.96) * g.gauss();
    const STR = 0.50 * WL - 0.30 * SUP - 0.25 * WL * SUP + 0.70 * g.gauss();
    const WB = -0.45 * STR - 0.18 * (STR * STR - 1) + 0.10 * WL + 0.75 * g.gauss();
    const lat = { wl: WL, sup: SUP, str: STR / 1.0, wb: WB / 0.95 };
    const L = { wl: [0.80, 0.78, 0.74, 0.70], sup: [0.85, 0.82, 0.78], str: [0.84, 0.80, 0.79, 0.73], wb: [0.86, 0.82, 0.80, 0.75] };
    const r = { id: i + 1 };
    for (const k of Object.keys(L)) L[k].forEach((l, q) => { r[k + '_' + (q + 1)] = likert(g, lat[k], l, 7, 4.2, 1.2); });
    rows.push(r);
  }
  const cs = [C('w1', 'Workload', 'A', items('wl', 4), 160, 200), C('w2', 'Support', 'A', items('sup', 3), 160, 520), C('w3', 'Stress', 'A', items('str', 4), 560, 360, 'bottom'), C('w4', 'Wellbeing', 'A', items('wb', 4), 940, 200, 'right')];
  const paths = [P('w1', 'w3'), P('w2', 'w3'), P('w3', 'w4'), P('w1', 'w4')];
  const m1 = { constructs: cs, paths, interactions: [{ id: 'wi1', name: 'Workload x Support', x: 'w1', m: 'w2', y: 'w3', px: 360, py: 560 }] };
  const m2 = { constructs: JSON.parse(JSON.stringify(cs)), paths: paths.slice(), interactions: [{ id: 'wq1', name: 'Stress²', x: 'w3', m: 'w3', y: 'w4', px: 760, py: 520 }] };
  sets.wellbeing = { file: 'workload_wellbeing.csv', csv: toCSV(rows), models: [{ name: 'Moderation', model: m1 }, { name: 'Quadratic', model: m2 }] };
}

// ------------------------------------------------------------------ 3. training (observed variables: PROCESS, regression)
{
  const g = gen(SEED_T), rows = [], N = 300;
  for (let i = 0; i < N; i++) {
    const tr = Math.max(0, Math.min(40, Math.round(20 + 8 * g.gauss())));
    const sup = Math.max(1, Math.min(7, Math.round(4 + 1.3 * g.gauss())));
    const trz = (tr - 20) / 8, supz = (sup - 4) / 1.3;
    const mot = 0.40 * trz + 0.10 * supz + 0.30 * trz * supz + 0.80 * g.gauss();
    const eff = 0.25 * trz + 0.40 * mot + 0.80 * g.gauss();
    const age = Math.round(24 + 36 * g.rand());
    const perf = 0.15 * trz + 0.35 * mot + 0.30 * eff - 0.004 * (age - 42) + 0.75 * g.gauss();
    const s = (z, c, d) => Math.round((c + d * z) * 100) / 100;
    rows.push({ id: i + 1, training_hours: tr, supervisor_support: sup, motivation: s(mot, 5, 1), self_efficacy: s(eff, 5, 1), performance: s(perf, 70, 8), age });
  }
  sets.training = { file: 'training_performance.csv', csv: toCSV(rows), models: [{ name: 'Model 1', model: { constructs: [], paths: [], interactions: [] } }] };
}

// ------------------------------------------------------------------ 4. corporate reputation (formative, CTA, HOC)
{
  const g = gen(37), rows = [], N = 344;
  for (let i = 0; i < N; i++) {
    const f1 = g.gauss(), f2 = g.gauss(); // two unrelated causes: QUAL is a composite, not a common factor
    const c1 = g.gauss(), c2 = 0.3 * c1 + Math.sqrt(0.91) * g.gauss();
    const QUAL = (0.5 * f1 + 0.5 * f2) / Math.SQRT1_2 / Math.SQRT2, CSR = (0.6 * c1 + 0.4 * c2);
    const REP = 0.60 * QUAL + 0.45 * CSR + 0.45 * g.gauss();
    const COMP = 0.85 * REP + 0.5 * g.gauss(), LIKE = 0.85 * REP + 0.5 * g.gauss();
    const LOY = 0.30 * COMP + 0.40 * LIKE + 0.70 * g.gauss();
    const r = { id: i + 1 };
    [f1, f1, f1, f2, f2].forEach((f, q) => { r['qual_' + (q + 1)] = likert(g, f, [0.80, 0.76, 0.72, 0.80, 0.75][q], 7, 4.5); });
    [c1, c1, c2, c2].forEach((f, q) => { r['csr_' + (q + 1)] = likert(g, f, [0.85, 0.80, 0.85, 0.80][q], 7, 4.0); });
    [0.84, 0.80, 0.76].forEach((l, q) => { r['comp_' + (q + 1)] = likert(g, COMP / 1.15, l, 7, 4.6); });
    [0.86, 0.83, 0.80, 0.76].forEach((l, q) => { r['like_' + (q + 1)] = likert(g, LIKE / 1.15, l, 7, 4.6); });
    [0.85, 0.80, 0.74].forEach((l, q) => { r['loy_' + (q + 1)] = likert(g, LOY / 1.1, l, 7, 4.4); });
    rows.push(r);
  }
  const qual = C('r1', 'Quality', 'B', items('qual', 5), 160, 180), csr = C('r2', 'CSR', 'B', items('csr', 4), 160, 540);
  const comp = C('r3', 'Competence', 'A', items('comp', 3), 560, 160, 'top'), like = C('r4', 'Likeability', 'A', items('like', 4), 560, 560, 'bottom');
  const loy = C('r5', 'Loyalty', 'A', items('loy', 3), 960, 360, 'right');
  const m1 = { constructs: [qual, csr, comp, like, loy], paths: [P('r1', 'r3'), P('r1', 'r4'), P('r2', 'r3'), P('r2', 'r4'), P('r3', 'r5'), P('r4', 'r5')], interactions: [] };
  // repeated-indicator higher-order construct: Reputation is measured by all items of its two lower-order constructs
  const cl = o => JSON.parse(JSON.stringify(o));
  const rep = C('r6', 'Reputation', 'A', items('comp', 3).concat(items('like', 4)), 560, 360, 'top');
  const comp2 = Object.assign(cl(comp), { x: 860, y: 140, side: 'right' }), like2 = Object.assign(cl(like), { x: 860, y: 580, side: 'right' }), loy2 = Object.assign(cl(loy), { x: 1060, y: 360 });
  const m2 = { constructs: [cl(qual), cl(csr), rep, comp2, like2, loy2], paths: [P('r1', 'r6'), P('r2', 'r6'), P('r6', 'r3'), P('r6', 'r4'), P('r6', 'r5')], interactions: [] };
  sets.reputation = { file: 'corporate_reputation.csv', csv: toCSV(rows), models: [{ name: 'First order', model: m1 }, { name: 'Higher order', model: m2 }] };
}

// ------------------------------------------------------------------ 5. hidden segments (FIMIX, POS)
{
  const g = gen(55), rows = [], N = 400;
  for (let i = 0; i < N; i++) {
    const seg = g.rand() < 0.55 ? 1 : 2; // segment 1: satisfaction drives loyalty; segment 2: price does
    const SAT = g.gauss(), PRICE = 0.2 * SAT + Math.sqrt(0.96) * g.gauss();
    const LOY = seg === 1 ? 0.85 * SAT + 0.00 * PRICE + 0.35 * g.gauss() : -0.10 * SAT + 0.85 * PRICE + 0.35 * g.gauss();
    const r = { id: i + 1 };
    [0.92, 0.90, 0.88].forEach((l, q) => { r['sat_' + (q + 1)] = likert(g, SAT, l, 7, 4.5); });
    [0.91, 0.89, 0.87].forEach((l, q) => { r['price_' + (q + 1)] = likert(g, PRICE, l, 7, 4.2); });
    [0.92, 0.90, 0.88].forEach((l, q) => { r['loy_' + (q + 1)] = likert(g, LOY / 0.95, l, 7, 4.4); });
    r.true_segment = seg;
    rows.push(r);
  }
  const m = { constructs: [C('s1', 'Satisfaction', 'A', items('sat', 3), 180, 180), C('s2', 'Price', 'A', items('price', 3), 180, 520), C('s3', 'Loyalty', 'A', items('loy', 3), 640, 350, 'right')], paths: [P('s1', 's3'), P('s2', 's3')], interactions: [] };
  sets.segments = { file: 'hidden_segments.csv', csv: toCSV(rows), models: [{ name: 'Model 1', model: m }] };
}

// ------------------------------------------------------------------ 6. advertising and sales (endogeneity, copula)
{
  const g = gen(71), rows = [], N = 400;
  for (let i = 0; i < N; i++) {
    const z = g.gauss(), demand = 0.6 * z + 0.8 * g.gauss(); // unobserved demand, correlated with the copula of spending
    const ad = Math.exp(0.8 * z); // skewed, non-normal regressor (needed for the copula approach)
    const adz = (ad - 1.377) / 1.33; // standardised spending (population mean and SD of exp(0.8 z))
    const QUAL = g.gauss();
    const SALES = 0.25 * adz + 0.35 * QUAL + 0.55 * demand + 0.55 * g.gauss();
    const r = { id: i + 1, ad_spend: Math.round(ad * 1000) / 100 };
    [0.84, 0.80, 0.76].forEach((l, q) => { r['qual_' + (q + 1)] = likert(g, QUAL, l, 7, 4.5); });
    [0.88, 0.85, 0.82].forEach((l, q) => { r['sales_' + (q + 1)] = likert(g, SALES / 0.95, l, 7, 4.3); });
    rows.push(r);
  }
  const m = { constructs: [C('a1', 'Advertising', 'A', ['ad_spend'], 180, 180), C('a2', 'Quality', 'A', items('qual', 3), 180, 520), C('a3', 'Sales', 'A', items('sales', 3), 640, 350, 'right')], paths: [P('a1', 'a3'), P('a2', 'a3')], interactions: [] };
  sets.advertising = { file: 'advertising_sales.csv', csv: toCSV(rows), models: [{ name: 'Model 1', model: m }] };
}

// ------------------------------------------------------------------ 7. purchase decision (logistic regression)
{
  const g = gen(91), rows = [], N = 500;
  for (let i = 0; i < N; i++) {
    const trust = Math.max(1, Math.min(7, Math.round((4.3 + 1.3 * g.gauss()) * 10) / 10));
    const price = Math.max(1, Math.min(7, Math.round((4.0 + 1.3 * g.gauss()) * 10) / 10));
    const income = Math.max(8, Math.round(35 + 12 * g.gauss()));
    const age = Math.round(20 + 45 * g.rand());
    const eta = -0.6 + 0.85 * (trust - 4.3) - 0.55 * (price - 4.0) + 0.03 * (income - 35) + 0.0 * (age - 42);
    const bought = g.rand() < 1 / (1 + Math.exp(-eta)) ? 1 : 0;
    rows.push({ id: i + 1, bought, trust, price_sensitivity: price, income, age });
  }
  sets.purchase = { file: 'purchase_decision.csv', csv: toCSV(rows), models: [{ name: 'Model 1', model: { constructs: [], paths: [], interactions: [] } }] };
}

// ------------------------------------------------------------------ 8. weighted survey (WPLS)
{
  const g = gen(97), rows = [], N = 400, popUrban = 0.3, sampUrban = 0.75;
  for (let i = 0; i < N; i++) {
    const urban = g.rand() < sampUrban; // urban residents are over-represented in the sample
    const SAT = g.gauss(), b = urban ? 0.30 : 0.70;
    const LOY = b * SAT + Math.sqrt(1 - b * b) * g.gauss();
    const r = { id: i + 1, region: urban ? 'urban' : 'rural' };
    [0.86, 0.83, 0.80].forEach((l, q) => { r['sat_' + (q + 1)] = likert(g, SAT, l, 7, 4.5); });
    [0.87, 0.84, 0.79].forEach((l, q) => { r['loy_' + (q + 1)] = likert(g, LOY, l, 7, 4.3); });
    r.weight = urban ? Math.round(popUrban / sampUrban * 1000) / 1000 : Math.round((1 - popUrban) / (1 - sampUrban) * 1000) / 1000;
    rows.push(r);
  }
  const m = { constructs: [C('v1', 'Satisfaction', 'A', items('sat', 3), 200, 300), C('v2', 'Loyalty', 'A', items('loy', 3), 640, 300, 'right')], paths: [P('v1', 'v2')], interactions: [] };
  sets.weighted = { file: 'weighted_survey.csv', csv: toCSV(rows), models: [{ name: 'Model 1', model: m }] };
}

// ------------------------------------------------------------------ 9. published correlation matrix (CB-SEM from a matrix)
{
  // population matrix of a three-factor model (Visual, Textual, Speed) with Visual → Speed and Textual → Speed
  const lam = [0.75, 0.55, 0.65, 0.85, 0.85, 0.80, 0.65, 0.70, 0.60], fac = [0, 0, 0, 1, 1, 1, 2, 2, 2];
  const phi = [[1, 0.45, 0], [0.45, 1, 0], [0, 0, 1]];
  phi[2][0] = phi[0][2] = 0.35 + 0.15 * 0.45; phi[2][1] = phi[1][2] = 0.15 + 0.35 * 0.45; // implied by paths 0.35 and 0.15
  const names = ['visual_1', 'visual_2', 'visual_3', 'text_1', 'text_2', 'text_3', 'speed_1', 'speed_2', 'speed_3'];
  const g = gen(5), n = 301;
  // sample correlation matrix: population matrix + sampling noise, rounded to 3 decimals as in a paper
  const pop = names.map((_, a) => names.map((_, b) => (a === b ? 1 : lam[a] * lam[b] * phi[fac[a]][fac[b]])));
  const sample = pop.map(r => r.slice());
  for (let a = 0; a < 9; a++) for (let b = 0; b < a; b++) sample[a][b] = sample[b][a] = pop[a][b] + 0.05 * (1 - pop[a][b] ** 2) * g.gauss();
  E.cholesky(sample); // throws if the perturbed matrix is not positive definite
  const sds = [1.17, 1.18, 1.13, 1.16, 1.31, 1.10, 1.09, 1.01, 1.01];
  const lines = ['name,' + names.join(',')];
  names.forEach((nm, a) => lines.push(nm + ',' + names.map((_, b) => (b <= a ? sample[a][b].toFixed(3) : '')).join(',')));
  lines.push('sd,' + sds.join(','));
  const matrix = lines.join('\n') + '\n';
  const cs = [C('m1', 'Visual', 'A', names.slice(0, 3), 180, 160), C('m2', 'Textual', 'A', names.slice(3, 6), 180, 540), C('m3', 'Speed', 'A', names.slice(6), 640, 350, 'right')];
  sets.matrix = { file: 'cfa_correlations.csv', matrix, n, models: [{ name: 'Model 1', model: { constructs: cs, paths: [P('m1', 'm3'), P('m2', 'm3')], interactions: [] } }] };
}

for (const k of Object.keys(sets)) {
  const s = sets[k];
  if (k !== 'customer') fs.writeFileSync(path.join(OUT, s.file), s.csv || s.matrix);
  if (k !== 'customer' && s.models[0].model.constructs.length) fs.writeFileSync(path.join(OUT, s.file.replace(/\.csv$/, '.model.json')), JSON.stringify(s.models.length > 1 ? { models: s.models } : s.models[0].model, null, 1) + '\n');
  console.log(k.padEnd(12), s.file, s.csv ? s.csv.split('\n').length - 2 + ' rows' : 'matrix');
}
fs.writeFileSync(path.join(__dirname, '..', 'js', 'example-data.js'),
  '/* Generated by tools/make_examples.js – do not edit. Embedded so the examples also load from file:// pages. */\n' +
  'window.YP_EXDATA = ' + JSON.stringify(sets) + ';\n' +
  'window.YP_EXAMPLE = { csv: window.YP_EXDATA.customer.csv, model: window.YP_EXDATA.customer.models[0].model };\n');
