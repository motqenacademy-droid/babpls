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
test('every method explains its origin in Arabic and English', () => {
  for (const m of D.methods) for (const L of ['ar', 'en']) {
    const o = m[L] && m[L].origin;
    assert.ok(typeof o === 'string' && o.length > 40, `origin ${m.id} ${L}`);
    assert.ok(/\d{4}/.test(o), `origin ${m.id} ${L} names a year`);
  }
});

// Minimal XML well-formedness check (no dependencies): balanced tags, quoted attributes, only XML entities.
function xmlCheck(s) {
  const stack = [], re = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>|<!--[\s\S]*?-->|<|&(#\d+|#x[0-9a-fA-F]+|[A-Za-z]+);|&/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[0] === '<') return `stray "<" at ${m.index}`;
    if (m[0] === '&') return `bare "&" at ${m.index}`;
    if (m[0][0] === '&') { if (/^[A-Za-z]+$/.test(m[5]) && !['amp', 'lt', 'gt', 'quot', 'apos'].includes(m[5])) return `undefined entity &${m[5]};`; continue; }
    if (m[0].startsWith('<!--')) continue;
    const [, close, name, , self] = m;
    if (close) { const top = stack.pop(); if (top !== name) return `</${name}> closes <${top}>`; }
    else if (!self) stack.push(name);
  }
  return stack.length ? `unclosed <${stack.pop()}>` : null;
}
const MATHML = new Set(['math', 'mrow', 'mi', 'mn', 'mo', 'mtext', 'mspace', 'ms', 'mfrac', 'msqrt', 'mroot', 'msub', 'msup', 'msubsup',
  'munder', 'mover', 'munderover', 'mtable', 'mtr', 'mtd', 'mstyle', 'mpadded', 'mphantom', 'menclose', 'semantics', 'annotation']);
test('xml checker rejects malformed markup', () => {
  assert.strictEqual(xmlCheck('<math><mi>x</mi></math>'), null);
  assert.ok(xmlCheck('<math><mi>x</math>'));
  assert.ok(xmlCheck('<math><mi>a &nbsp; b</mi></math>'));
  assert.ok(xmlCheck('<math><mo>a < b</mo></math>'));
});
test('every formula is well-formed presentation MathML', () => {
  for (const m of D.methods) {
    assert.ok(typeof m.formula === 'string' && m.formula.startsWith('<math display="block" xmlns="http://www.w3.org/1998/Math/MathML">') && m.formula.endsWith('</math>'), `formula ${m.id} is a block <math>`);
    assert.strictEqual(xmlCheck(m.formula), null, `formula ${m.id}: ${xmlCheck(m.formula)}`);
    const tags = [...m.formula.matchAll(/<\/?([A-Za-z][\w-]*)/g)].map(x => x[1]);
    assert.deepStrictEqual(tags.filter(t => !MATHML.has(t)), [], `formula ${m.id} uses only MathML elements`);
  }
});

test('version matches package.json', () => {
  assert.strictEqual(D.version, JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version);
});
