// Documentation: both languages for every guide/method entry; every cited reference exists; every
// 📖 link used by the app points at a documented method.
'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = {};
require(path.join(root, 'js/docs.js'));
const D = global.window.YPDocs;
test('guide and methods exist in Arabic and English', () => {
  for (const g of D.guide) for (const L of ['ar', 'en']) assert.ok(g[L] && g[L].title && g[L].html, `guide ${g.id} ${L}`);
  for (const m of D.methods) for (const L of ['ar', 'en']) assert.ok(m[L] && m[L].title && m[L].text, `method ${m.id} ${L}`);
  assert.ok(D.about.ar && D.about.en);
});
test('every method cites existing references and every reference is cited', () => {
  const used = new Set();
  for (const m of D.methods) { assert.ok(m.refs.length, m.id); m.refs.forEach(r => { assert.ok(D.refs[r], `${m.id} -> ${r}`); used.add(r); }); }
  assert.deepStrictEqual(Object.keys(D.refs).filter(k => !used.has(k)), []);
});
test('result cards link to documented methods', () => {
  const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  const ids = new Set(D.methods.map(m => m.id));
  const links = [...app.matchAll(/doc: '([a-z0-9]+)'/g)].map(m => m[1]).concat(['bca', 'bootstrap']);
  assert.deepStrictEqual(links.filter(l => !ids.has(l)), []);
});
test('version matches package.json', () => {
  assert.strictEqual(D.version, JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version);
});
