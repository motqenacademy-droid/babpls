// Installable web app: the service worker must precache every file the app loads, and its version must follow releases.
'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const sw = read('sw.js'), files = JSON.parse(sw.match(/const FILES = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
test('service worker precaches every page resource and worker script', () => {
  const html = read('index.html'), need = new Set();
  for (const m of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) need.add(m[1]);
  for (const m of read('js/worker.js').matchAll(/'([a-z0-9]+\.js)'/g)) need.add('js/' + m[1]);
  need.add('js/worker.js');
  const missing = [...need].filter(f => !files.includes(f));
  assert.deepStrictEqual(missing, []);
  files.filter(f => f !== './').forEach(f => assert.ok(fs.existsSync(path.join(root, f)), 'exists: ' + f));
});
test('service worker version follows package.json; manifest icons exist', () => {
  assert.strictEqual(sw.match(/const VERSION = '([^']+)'/)[1], JSON.parse(read('package.json')).version);
  JSON.parse(read('manifest.webmanifest')).icons.forEach(i => assert.ok(fs.existsSync(path.join(root, i.src)), i.src));
  assert.ok(read('.github/workflows/pages.yml').includes('sw.js') && read('.github/workflows/pages.yml').includes('manifest.webmanifest'), 'published by Pages');
});
