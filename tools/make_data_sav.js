// Writes tests/fixtures/data_written.sav with the SPSS writer of js/io.js (variables with labels, value labels,
// user-missing codes and range, measurement levels, a long Arabic name, a string and a date). tools/reference_data.py
// reads it back with pyreadstat; tests/data.test.js checks that the writer still produces exactly this file.
'use strict';
const path = require('path'), fs = require('fs');
const IO = require('../js/io.js');
const M = (codes, lo, hi) => ({ codes: codes || [], lo: lo === undefined ? null : lo, hi: hi === undefined ? null : hi });
const SAMPLE = [
  { name: 'id', label: '', type: 'numeric', measure: 'scale', decimals: 0, labels: [], missing: M(), values: [1, 2, 3, 4, 5] },
  { name: 'الجنس', label: 'الجنس (gender)', type: 'categorical', measure: 'nominal', decimals: 0, labels: [[1, 'ذكر'], [2, 'أنثى']], missing: M([9]), values: [1, 2, 9, NaN, 2] },
  { name: 'satisfaction_score_total', label: 'Total satisfaction', type: 'numeric', measure: 'scale', decimals: 2, labels: [], missing: M([], 90, 99), values: [1.25, 95, 3.5, 4, -2.75] },
  { name: 'likert', label: 'Agreement', type: 'numeric', measure: 'ordinal', decimals: 0, labels: [[1, 'disagree'], [3, 'neutral'], [5, 'agree']], missing: M([-9, 99]), values: [1, 5, -9, 3, 2] },
  { name: 'city', label: 'City', type: 'string', measure: 'nominal', decimals: 0, labels: [], missing: M(), values: ['Riyadh', 'القاهرة', 'a much longer string value here', '', 'Rabat'] },
  { name: 'when', label: 'Interview date', type: 'date', measure: 'scale', decimals: 0, labels: [], missing: M(), values: [0, 19000, NaN, 20000, 20398] }
].map(v => Object.assign(v, { values: v.type === 'string' ? v.values : Float64Array.from(v.values) }));
const FILE = path.join(__dirname, '..', 'tests', 'fixtures', 'data_written.sav');
const write = () => IO.writeSAV(SAMPLE, 5, { label: 'BabPls test', date: '2026-11-08T10:00:00' });
if (require.main === module) { fs.writeFileSync(FILE, write()); console.log('wrote', FILE); }
module.exports = { SAMPLE, FILE, write };
