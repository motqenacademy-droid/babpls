/* BabPls service worker: makes the installed web app (PWA) work offline.
 * Every file the app needs is precached; responses are served from the cache and refreshed in the background.
 * Bump VERSION with every release (tests/pwa.test.js checks it matches package.json). */
'use strict';
const VERSION = '0.9.0';
const CACHE = 'babpls-' + VERSION;
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/engine.js', 'js/advanced.js', 'js/advanced2.js', 'js/advanced3.js', 'js/stats.js', 'js/stats2.js', 'js/amos.js', 'js/process2.js', 'js/ui-stats.js', 'js/ui-stats2.js', 'js/ui-amos.js', 'js/ui-process.js', 'js/io.js', 'js/charts.js', 'js/editor.js',
  'js/i18n.js', 'js/docs.js', 'js/example-data.js', 'js/examples.js', 'js/app.js', 'js/worker.js',
  'assets/logo.svg',
  'examples/customer_satisfaction.csv', 'examples/workload_wellbeing.csv', 'examples/training_performance.csv', 'examples/corporate_reputation.csv',
  'examples/hidden_segments.csv', 'examples/advertising_sales.csv', 'examples/purchase_decision.csv', 'examples/weighted_survey.csv', 'examples/cfa_correlations.csv', 'assets/icon-192.png', 'assets/icon-512.png', 'assets/favicon-32.png'
];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => (k.startsWith('babpls-') || k.startsWith('youpls-')) && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    return hit || (await net) || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
  }));
});
