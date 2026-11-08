// APA 7 number and symbol formatting of result tables (YPFormat in js/charts.js).
'use strict';
const test = require('node:test'), assert = require('node:assert'), path = require('path');
const F = require(path.join(__dirname, '..', 'js/charts.js')).YPFormat;
const M = '−';

test('num: decimals, true minus, leading zero', () => {
  assert.strictEqual(F.num(0.4567), '0.46');
  assert.strictEqual(F.num(0.4567, { dec: 3 }), '0.457');
  assert.strictEqual(F.num(-0.4567), M + '0.46');
  assert.strictEqual(F.num(-0.4567, { minus: false }), '-0.46');
  assert.strictEqual(F.num(-0.4567, { zero: false }), M + '.46');
  assert.strictEqual(F.num(1.234, { zero: false }), '1.23', 'a value above 1 keeps its integer part');
  assert.strictEqual(F.num(-0.001), '0.00', 'no minus sign on a value that rounds to zero');
  assert.strictEqual(F.num(NaN), '–');
  assert.strictEqual(F.num(null), '–');
});

test('pval: exact p without leading zero, "< .001" below the printable range', () => {
  assert.strictEqual(F.pval(0.0234), '.023');
  assert.strictEqual(F.pval(0.05), '.050');
  assert.strictEqual(F.pval(0.0004), '< .001');
  assert.strictEqual(F.pval(0), '< .001');
  assert.strictEqual(F.pval(0.0004, { dec: 4 }), '.0004');
  assert.strictEqual(F.pval(0.00004, { dec: 4 }), '< .0001');
  assert.strictEqual(F.pval(0.0234, { dec: 2 }), '.02');
  assert.strictEqual(F.pval(0.0234, { zero: true }), '0.023');
  assert.strictEqual(F.pval(0.0002, { zero: true }), '< 0.001');
  assert.strictEqual(F.pval(1), '1.000');
  assert.strictEqual(F.pval(NaN), '–');
});

test('text: re-typesets formatted cells by column kind', () => {
  const apa = { apa: true, minus: true };
  assert.strictEqual(F.text('0.000', 'p', apa), '< .001');
  assert.strictEqual(F.text('0.000 ***', 'p', apa), '< .001***');
  assert.strictEqual(F.text('0.023 *', 'p', apa), '.023*');
  assert.strictEqual(F.text('0.023', 'p', { apa: true, raw: 0.02346, pDec: 4 }), '.0235', 'raw value and p decimals win');
  assert.strictEqual(F.text('0.000', 'p', { apa: false }), '< 0.001');
  assert.strictEqual(F.text('-0.123', 'bounded', apa), M + '.123');
  assert.strictEqual(F.text('0.708', 'bounded', apa), '.708');
  assert.strictEqual(F.text('0.708', '', apa), '0.708', 'statistics that can exceed 1 keep the zero');
  assert.strictEqual(F.text('-2.45', '', apa), M + '2.45');
  assert.strictEqual(F.text('[-0.12, 0.30]', 'bounded', apa), '[' + M + '.12, .30]');
  assert.strictEqual(F.text('0.12 – 0.34', 'bounded', apa), '.12 – .34', 'an en dash between numbers is not a minus');
  assert.strictEqual(F.text('≥ 0.95', 'bounded', apa), '≥ .95');
  assert.strictEqual(F.text('Image → Loyalty', 'bounded', apa), 'Image → Loyalty', 'labels are left alone');
  assert.strictEqual(F.text('sat_1', 'bounded', apa), 'sat_1');
  assert.strictEqual(F.text('-0.123', 'bounded', { apa: false, minus: false }), '-0.123', 'classic style changes nothing');
  assert.strictEqual(F.text('45.0%', '', apa), '45.0%');
  assert.strictEqual(F.text('–', 'p', apa), '–');
});

test('colKind: p values, bounded statistics, test statistics', () => {
  ['p', 'P', 'Boot p', 'p (χ²)', 'PLS-MGA p (1>2)', 'Permutation p', 'p التباديل', 'p (LR)'].forEach(h => assert.strictEqual(F.colKind(h), 'p', h));
  ['η²p', 'ω²p', 'η²'].forEach(h => assert.strictEqual(F.colKind(h), 'bounded', h)); // effect sizes, not p values
  ['r', 'R²', 'R² adjusted', "Cronbach's α", 'ρA (rho_a)', 'β', 'AVE', 'CR', 'CFI', 'RMSEA', 'SRMR', 'Q²predict', '|β|min', 'ΔCFI'].forEach(h => assert.strictEqual(F.colKind(h), 'bounded', h));
  ['t', 'T', 'z', 'F', 'df', 'VIF', 'f²', 'HTMT', 'χ²', 'AIC', 'PLS RMSE'].forEach(h => assert.strictEqual(F.colKind(h), 'stat', h));
  ['P(1)', 'Loading', 'SE', 'M', 'Estimate', 'TLI', 'PLS', ''].forEach(h => assert.strictEqual(F.colKind(h), '', h));
  assert.strictEqual(F.colKind('Loading', ['Loading']), 'bounded', 'translated headers can be declared bounded');
});

test('italic: statistical symbols in italics, Greek letters and abbreviations upright', () => {
  assert.strictEqual(F.italic('p'), '<i>p</i>');
  assert.strictEqual(F.italic('M'), '<i>M</i>');
  assert.strictEqual(F.italic('SD'), '<i>SD</i>');
  assert.strictEqual(F.italic('Boot SE'), 'Boot <i>SE</i>');
  assert.strictEqual(F.italic('R² adjusted'), '<i>R</i>² adjusted');
  assert.strictEqual(F.italic('p (χ²)'), '<i>p</i> (χ²)');
  assert.strictEqual(F.italic('n min'), '<i>n</i> min');
  assert.strictEqual(F.italic('β'), 'β');
  assert.strictEqual(F.italic("Cronbach's α"), "Cronbach's α");
  assert.strictEqual(F.italic('SRMR'), 'SRMR');
  assert.strictEqual(F.italic('VIF'), 'VIF');
  assert.strictEqual(F.italic('PLS RMSE'), 'PLS RMSE');
  assert.strictEqual(F.italic('sat_1'), 'sat_1');
  assert.strictEqual(F.italic('a < b & c'), 'a &lt; <i>b</i> &amp; c', 'escapes HTML');
});

test('spans: confidence limits get a "95% CI" spanner over LL / UL', () => {
  const s = F.spans(['Path', 'β', '2.5%', '97.5%']);
  assert.deepStrictEqual(s.map(x => x.label), ['Path', 'β', '95% CI']);
  assert.deepStrictEqual(s[2].sub, ['LL', 'UL']);
  assert.strictEqual(F.spans(['Path', 'Percentile 5.0%', 'Percentile 95.0%'])[1].label, '90% CI (Percentile)');
  assert.strictEqual(F.spans(['b', 'LLCI', 'ULCI'])[1].label, '95% CI');
  assert.strictEqual(F.spans(['a', 'b']), null);
  assert.strictEqual(F.spans(['a', '2.5%', 'x', '97.5%']), null, 'only adjacent limits');
  assert.strictEqual(F.spans(['x', '2.5%', '97.5%'], { ci: 'فترة الثقة', ll: 'الأدنى', ul: 'الأعلى' })[1].label, '95% فترة الثقة');
});

test('titleCase: APA title case for English titles', () => {
  assert.strictEqual(F.titleCase('Path coefficients'), 'Path Coefficients');
  assert.strictEqual(F.titleCase('Model fit of the estimated model'), 'Model Fit of the Estimated Model');
  assert.strictEqual(F.titleCase('f-square'), 'f-square', 'a symbol stays lower case');
  assert.strictEqual(F.titleCase('HTMT'), 'HTMT');
});

test('xlsx writer: styled APA sheet keeps raw values, number formats, borders and captions', async () => {
  const IO = require(path.join(__dirname, '..', 'js/io.js'));
  const rows = [[{ v: 'Table 1', s: { b: 1 } }], [{ v: 'Path Coefficients', s: { i: 1 } }],
    [{ v: 'Path', s: { bt: 1, bb: 1 } }, { v: 'β', s: { bt: 1, bb: 1, al: 'center' } }, { v: 'p', s: { bt: 1, bb: 1, al: 'center' } }],
    [{ v: 'A → B', s: { bb: 1 } }, { v: 0.41234, s: { bb: 1, fmt: '.00' } }, { v: 0.0004, s: { bb: 1, fmt: '[<0.001]"<.001";.000' } }]];
  const out = IO.writeXLSX([{ name: 'APA', rows, styled: true, freeze: 3 }], false);
  const z = await IO.unzip(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength));
  const styles = await z.text('xl/styles.xml'), sheet = await z.text('xl/worksheets/sheet1.xml');
  assert.ok(styles.includes('formatCode=".00"') && styles.includes('formatCode="[&lt;0.001]&quot;&lt;.001&quot;;.000"'), 'number formats');
  assert.ok(styles.includes('<i/>') && styles.includes('<b/>') && styles.includes('<top style="thin">'), 'fonts and borders');
  assert.ok(sheet.includes('<v>0.41234</v>') && sheet.includes('<v>0.0004</v>'), 'raw values are kept');
  assert.ok(sheet.includes('ySplit="3"') && sheet.includes('showGridLines="0"'));
  const csv = await IO.xlsxToCSV(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength));
  assert.ok(csv.includes('Table 1') && csv.includes('0.41234'));
});
