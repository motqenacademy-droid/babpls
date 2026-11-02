// Optional end-to-end check in a real browser (needs Playwright + Chromium):
//   python3 -m http.server 8765 &   then   node tests/browser_smoke.js
// Loads the example, runs every analysis, visits every result section and fails on any JS error.
'use strict';
const { chromium } = require('playwright');
const URL = process.env.YOUPLS_URL || 'http://127.0.0.1:8765/index.html';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.click('.welcome [data-act=example]');
  const runs = [['pls', {}], ['plsc', {}], ['bootstrap', { samples: '200' }], ['blindfolding', {}], ['predict', { reps: '2' }], ['ipma', {}], ['mga', { permutations: '100' }], ['nca', { permutations: '20' }], ['cbsem', {}], ['fimix', { maxK: '3', starts: '3' }], ['pos', { starts: '2' }], ['cta', { samples: '200' }], ['copula', { samples: '100' }], ['process', { samples: '200' }], ['regression', {}]];
  for (const [k, fields] of runs) {
    await p.click('#calcbtn'); await p.click(`#calcmenu [data-run=${k}]`);
    for (const [n, v] of Object.entries(fields)) await p.fill(`#runfields [name=${n}]`, v);
    if (k === 'process') { await p.selectOption('#runfields [name=procX]', 'LV: Image'); await p.selectOption('#runfields [name=procM]', ['LV: Satisfaction']); await p.selectOption('#runfields [name=procY]', 'LV: Loyalty'); }
    if (k === 'regression') { await p.selectOption('#runfields [name=regY]', 'sat_1'); await p.selectOption('#runfields [name=regX]', ['val_1', 'qual_1']); }
    await p.click('#rundlg button[type=submit]');
    await p.waitForSelector(`.restabs [data-kind=${k}].on`, { timeout: 120000 });
    const secs = await p.$$eval('.secnav button', bs => bs.map(x => x.dataset.sec));
    for (const s of secs) await p.click(`.secnav button[data-sec="${s}"]`);
    console.log('ok', k, secs.length, 'sections');
  }
  await b.close();
  if (errs.length) { console.error('JS errors:', errs); process.exit(1); }
  console.log('browser smoke test passed');
})().catch(e => { console.error(e); process.exit(1); });
