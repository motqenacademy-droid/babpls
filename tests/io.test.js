// File formats: .xlsx and .sav readers against files written by openpyxl / pyreadstat; .xlsx writer round trip.
'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const IO = require('../js/io.js'), E = require('../js/engine.js');
const fx = f => path.join(__dirname, 'fixtures', f);
const buf = f => { const b = fs.readFileSync(fx(f)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const ref = E.parseCSV(fs.readFileSync(fx('io_sample.csv'), 'utf8'));
function same(ds, label) {
  assert.deepStrictEqual(ds.names, ref.names, label + ' names');
  ref.names.forEach((n, j) => {
    const a = ref.cols[j], b = ds.cols[ds.names.indexOf(n)];
    if (ref.kinds[j] === 'cat') { assert.deepStrictEqual(Array.from(b, v => (isNaN(v) ? '' : ds.labels[j][v - 1])), Array.from(a, v => (isNaN(v) ? '' : ref.labels[j][v - 1])), label + ' ' + n); return; }
    a.forEach((v, i) => assert.ok(isNaN(v) ? isNaN(b[i]) : Math.abs(v - b[i]) < 1e-9, `${label} ${n}[${i}]: ${b[i]} vs ${v}`));
  });
}
test('xlsx reader', async () => { same(E.parseCSV(await IO.xlsxToCSV(buf('io_sample.xlsx'))), 'xlsx'); });
test('sav reader (uncompressed and bytecode-compressed)', () => {
  same(E.parseCSV(IO.savToCSV(buf('io_sample.sav'))), 'sav');
  same(E.parseCSV(IO.savToCSV(buf('io_sample_compressed.sav'))), 'sav-compressed');
});
test('xlsx writer round trip', async () => {
  const rows = [['name', 'value', 'نص'], ['a', 1.5, 'عربي'], ['b & <c>', -2, ''], ['"q"', 3, 'x']];
  const out = IO.writeXLSX([{ name: 'Results/1', rows }, { name: 'Results/1', rows: [['k'], [1]] }], true);
  const csv = await IO.xlsxToCSV(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength));
  const ds = E.parseCSV(csv);
  assert.deepStrictEqual(ds.names, ['name', 'value', 'نص']);
  assert.deepStrictEqual(Array.from(ds.cols[1]), [1.5, -2, 3]);
  assert.deepStrictEqual(ds.labels[0], ['a', 'b & <c>', '"q"']);
  const z = await IO.unzip(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength));
  assert.ok((await z.text('xl/workbook.xml')).includes('Results 1 2'), 'duplicate sheet names made unique');
});
