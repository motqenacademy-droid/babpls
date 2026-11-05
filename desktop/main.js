// BabPls desktop: the same web app, packaged with Electron so it runs offline as a normal program.
'use strict';
const { app, BrowserWindow, protocol, net, shell, Menu } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

// Serve the app from a private app:// origin (not file://) so Web Workers and local storage work.
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const ROOT = path.join(__dirname, 'app');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 600, title: 'BabPls', backgroundColor: '#f6f7fb',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  win.loadURL('app://youpls/index.html'); // host kept from the old name: storage is per origin, so saved work survives the rename
  // links to the web (docs, GitHub) open in the user's browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); } });
  return win;
}

// --smoke: load the app, run PLS-SEM in the page and CB-SEM in the Web Worker, then exit (used by CI).
function smoke(win) {
  const fail = msg => { console.error('SMOKE FAIL', msg); app.exit(1); };
  setTimeout(() => fail('timeout'), 90000);
  win.webContents.on('console-message', e => { if (e.level === 'error') console.error('page error:', e.message); });
  win.webContents.once('did-finish-load', async () => {
    try {
      const r = await win.webContents.executeJavaScript(`(async () => {
        const E = window.YPEngine, ex = window.YP_EXAMPLE, ds = E.parseCSV(ex.csv);
        const pls = E.runPLS(ds, ex.model, {});
        const w = new Worker('js/worker.js');
        const cb = await new Promise((ok, bad) => {
          w.onmessage = ev => { if (ev.data.result) ok(ev.data.result); else if (ev.data.error) bad(ev.data.error); };
          w.onerror = e => bad(e.message || 'worker error');
          w.postMessage({ id: 1, task: 'cbsem', ds, model: ex.model, settings: {}, opts: {} });
        });
        localStorage.setItem('babpls.smoke', '1');
        return { title: document.title, ui: !!window.BabPls, plsN: pls.n, cbsemCFI: cb.fit.cfi, storage: localStorage.getItem('babpls.smoke') };
      })()`);
      console.log('SMOKE OK', JSON.stringify(r));
      app.exit(r.ui && r.plsN > 0 && r.cbsemCFI > 0 && r.storage === '1' ? 0 : 1);
    } catch (e) { fail(e && e.message ? e.message : String(e)); }
  });
}

app.whenReady().then(() => {
  protocol.handle('app', req => {
    const rel = decodeURIComponent(new URL(req.url).pathname);
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  const win = createWindow();
  if (process.argv.includes('--smoke')) smoke(win);
});
app.on('window-all-closed', () => app.quit());
