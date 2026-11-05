// BabPls promo video (60–90 s), Arabic and English.
// Usage (with the app served on PORT): node tools/video/promo.js ar|en [port]
// Output: media/BabPls-promo-<lang>.mp4, .srt (in-app captions and title cards) and -thumb.png (the hook card)
'use strict';
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const rec = require('./rec.js');

const lang = process.argv[2] || 'en', port = process.argv[3] || '8771';
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'media', `BabPls-promo-${lang}.mp4`);

(async () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const R = await rec.start({ lang, url: `http://127.0.0.1:${port}/index.html`, out: OUT });
  const t0 = Date.now(); // ≈ rec.js's own t0 (the .srt clock)
  const now = () => (Date.now() - t0) / 1000;
  const { page: P, T } = R;
  // quicker pointer moves than rec.js's default (28 steps), so the montage keeps its pace on a busy machine
  const click0 = R.click, move0 = R.moveTo;
  R.click = (s, o) => click0(s, Object.assign({ steps: 10 }, o));
  R.moveTo = (s, o) => move0(s, Object.assign({ steps: 10 }, o));
  // the highlight box fades in where it belongs instead of sliding from its previous place
  await P.evaluate(() => { document.querySelector('.vo-hl').style.transition = 'opacity .35s ease'; });
  // the report's meta line (run date and clock time of this recording) is incidental clutter in a promo: not shown
  await P.addStyleTag({ content: '#secout > .meta, #vo-zoom > .meta { display: none !important; }' });
  // Cuts (front trim, waits for long computations): while a cut is on, a magenta square sits in the bottom-left corner of
  // the page; after encoding, the frames that show it are dropped. Frame-based, so it stays exact when a busy machine makes
  // the screencast lag behind the script's clock. `cuts` keeps the script-clock times to re-anchor the subtitles.
  const cuts = [];
  await P.evaluate(() => { const m = document.createElement('div'); m.id = 'vo-cut'; m.style.cssText = 'position:absolute;left:0;bottom:0;width:8px;height:8px;background:#f0f;z-index:9;pointer-events:none;display:none'; document.getElementById('vo-root').appendChild(m); }); // inside the overlay, so it follows it into open dialogs
  async function cutOn() { await P.evaluate(() => { document.getElementById('vo-cut').style.display = 'block'; }); cuts.push([now(), null]); }
  async function cutOff() { cuts[cuts.length - 1][1] = now(); await P.evaluate(() => { document.getElementById('vo-cut').style.display = 'none'; }); }
  let park = null;       // a resting place for the pointer on empty canvas (measured in scene 6)
  const cardSubs = [];   // title cards also go into the .srt
  // observe the app's downloads in the page (name and blob of each <a download> it clicks): Chromium blocks a second
  // download in quick succession, so the browser's download event cannot be relied on for the Excel + HTML pair
  await P.evaluate(() => {
    window.__voDl = []; const mk = URL.createObjectURL.bind(URL), blobs = new Map(), click = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = b => { const u = mk(b); blobs.set(u, b); return u; };
    HTMLAnchorElement.prototype.click = function () { if (this.download) window.__voDl.push({ name: this.download, blob: blobs.get(this.href) }); return click.call(this); };
  });
  async function nextDownload(n, ms) {
    for (let i = 0; i < (ms || 3000) / 100; i++) { if (await P.evaluate(k => window.__voDl.length > k, n)) break; await R.wait(100); }
    return P.evaluate(async k => { const d = window.__voDl[k]; return d ? { name: d.name, text: /\.html?$/i.test(d.name) && d.blob ? await d.blob.text() : null } : null; }, n);
  }

  // helpers --------------------------------------------------------------
  // smoothly scroll a container so that an element sits `top` px below the container's top edge
  async function scrollTo(container, sel, top) {
    const dy = await P.evaluate(([c, s, tp]) => { const C = document.querySelector(c), el = document.querySelector(s); return el.getBoundingClientRect().top - C.getBoundingClientRect().top - tp; }, [container, sel, top || 0]);
    await R.scroll(container, dy, 18);
  }
  // a modal <dialog> sits in the browser's top layer, above the overlay: move the overlay into it while it is open
  const intoDlg = sel => P.evaluate(s => document.querySelector(s).appendChild(document.getElementById('vo-root')), sel);
  const outDlg = () => P.evaluate(() => document.body.appendChild(document.getElementById('vo-root')));
  const cursor = on => P.evaluate(v => { document.getElementById('vo-cursor').style.visibility = v ? 'visible' : 'hidden'; }, on);
  // caption at the top of the screen (for shots whose subject sits at the bottom, e.g. the progress bar)
  const capTop = on => P.evaluate(v => { const c = document.getElementById('vo-cap'); c.style.top = v ? '118px' : ''; c.style.bottom = v ? 'auto' : ''; }, on);
  async function runFromMenu(kind, before, opt) {
    await R.click('#calcbtn', { after: 250 });
    if (opt && opt.menuHold) { await R.moveTo(`#calcmenu [data-run="${kind}"]`); await R.wait(opt.menuHold); }
    await R.click(`#calcmenu [data-run="${kind}"]`, { after: 300 });
    await intoDlg('#rundlg');
    if (before) await before();
    await R.click('#rundlg button[type=submit]', { after: 150 });
    if (opt && opt.cut) await cutOn(); // the run itself is cut (the caller ends the cut)
    await outDlg();
    await P.waitForSelector('#busy', { state: 'hidden', timeout: 120000 });
    await R.wait(350); // let the report lay out before measuring anything on it
  }
  // camera zoom on a results element: only the report column (#secout) is scaled, so the section list and the report
  // tabs stay put and nothing is cut mid-word at a screen edge. Its content is wrapped (recording-only DOM tweak) and the
  // wrapper is scaled inside the column, clamped so the zoomed content always fills the column. Resolves only when the
  // transition has finished, so anything measured afterwards (highlights) is in its final place.
  async function zoomOn(sel, maxS, fx) {
    await P.evaluate(([s, mx, fx]) => new Promise(done => {
      const C = document.getElementById('secout'), st = C.scrollTop;
      let Z = document.getElementById('vo-zoom');
      if (!Z) { Z = document.createElement('div'); Z.id = 'vo-zoom'; C.insertBefore(Z, C.firstChild); while (Z.nextSibling) Z.appendChild(Z.nextSibling); C.scrollTop = st; }
      C.style.overflowX = 'hidden'; Z.style.transition = 'none'; Z.style.transform = ''; Z.style.transformOrigin = '0 0';
      const cr = C.getBoundingClientRect(), zr = Z.getBoundingClientRect(), r = document.querySelector(s).getBoundingClientRect();
      const rtl = getComputedStyle(C).direction === 'rtl', vl = rtl ? cr.right - C.clientWidth : cr.left, vw = C.clientWidth, vt = cr.top, vh = C.clientHeight;
      const k = Math.max(1, Math.min(mx || 1.5, fx === undefined ? 0.92 * vw / r.width : 9, 0.74 * vh / r.height));
      const px = r.left + r.width * (fx === undefined ? 0.5 : fx), py = r.top + r.height / 2;
      const clamp = (v, lo, hi) => lo <= hi ? Math.min(hi, Math.max(lo, v)) : (lo + hi) / 2;
      const m = 14; // keep a margin like the column's own padding at the zoomed content's edges
      const tx = clamp(vl + vw / 2 - zr.left - k * (px - zr.left), vl + vw - m - zr.left - k * zr.width, vl + m - zr.left);
      const ty = clamp(vt + vh / 2 - 45 - zr.top - k * (py - zr.top), vt + vh - zr.top - k * zr.height, vt - zr.top);
      void Z.offsetWidth; Z.style.transition = 'transform .7s ease';
      if (k === 1 && Math.abs(tx) < 0.5 && Math.abs(ty) < 0.5) return done();
      const fin = () => { clearTimeout(to); Z.removeEventListener('transitionend', fin); done(); }, to = setTimeout(fin, 1500);
      Z.addEventListener('transitionend', fin);
      Z.style.transform = `translate(${tx}px,${ty}px) scale(${k})`;
    }), [sel, maxS, fx]);
    await R.wait(60);
  }
  async function zoomOut() {
    await P.evaluate(() => new Promise(done => {
      const Z = document.getElementById('vo-zoom'); if (!Z) return done();
      const fin = () => { clearTimeout(to); const C = Z.parentElement, st = C.scrollTop; while (Z.firstChild) C.insertBefore(Z.firstChild, Z); Z.remove(); C.scrollTop = st; C.style.overflowX = ''; done(); }, to = setTimeout(fin, 1200);
      if (!Z.style.transform) return fin();
      Z.addEventListener('transitionend', fin, { once: true }); Z.style.transform = '';
    }));
    await R.wait(60);
  }
  // highlight an element, clipped to the visible part of the report column (a zoomed element can overflow it)
  async function hlIn(sel, pad) {
    await P.evaluate(([s, p]) => {
      const r = document.querySelector(s).getBoundingClientRect(), c = document.getElementById('secout').getBoundingClientRect();
      const L = Math.max(r.left - p, c.left + 4), Rr = Math.min(r.right + p, c.right - 4), Tt = Math.max(r.top - p, c.top + 4), B = Math.min(r.bottom + p, c.bottom - 4);
      const hl = document.querySelector('.vo-hl'); Object.assign(hl.style, { left: L + 'px', top: Tt + 'px', width: Rr - L + 'px', height: B - Tt + 'px' }); hl.classList.add('on');
    }, [sel, pad || 6]);
    await R.wait(450);
  }
  // a file chip under an export button: shows the name of the file the click produced
  async function fileChip(sel, name, ms) {
    await P.evaluate(([s, n]) => {
      const b = document.querySelector(s).getBoundingClientRect(), d = document.createElement('div'); d.id = 'vo-chip';
      d.style.cssText = `position:absolute;top:${b.bottom + 14}px;left:${b.left + b.width / 2}px;transform:translate(-50%,-8px);opacity:0;transition:opacity .3s ease,transform .3s ease;padding:8px 18px;border-radius:999px;background:#15803d;color:#fff;font:700 18px/1.3 Cairo,system-ui,sans-serif;direction:ltr;white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,.25)`;
      d.textContent = n + '  ✓'; document.getElementById('vo-root').appendChild(d);
      requestAnimationFrame(() => { d.style.opacity = '1'; d.style.transform = 'translate(-50%,0)'; });
    }, [sel, name]);
    await R.wait(ms);
    await P.evaluate(() => { const d = document.getElementById('vo-chip'); d.style.opacity = '0'; setTimeout(() => d.remove(), 400); });
  }
  // the project title is English data; in the Arabic UI the RTL field shows its end: scroll it back to its start
  const fixTitle = () => P.evaluate(() => { const i = document.getElementById('pname'); if (i) i.scrollLeft = getComputedStyle(i).direction === 'rtl' ? -i.scrollWidth : 0; });
  // highlight the first n rows of a table (with its header)
  async function highlightRows(sel, n) {
    await P.evaluate(([s, n]) => {
      const el = document.querySelector(s), rows = el.querySelectorAll('tbody tr'), a = el.getBoundingClientRect(), z = rows[Math.min(n, rows.length) - 1].getBoundingClientRect();
      const hl = document.querySelector('.vo-hl'); Object.assign(hl.style, { left: a.left - 4 + 'px', top: a.top - 4 + 'px', width: a.width + 8 + 'px', height: z.bottom - a.top + 10 + 'px' }); hl.classList.add('on');
    }, [sel, n]);
    await R.wait(450);
  }
  // pan the diagram up so the bottom indicators clear the caption band (drag on empty canvas; the overlay cursor is hidden)
  async function panCanvas(dy) {
    const b = await P.locator('#canvas').boundingBox();
    const x = b.x + b.width - 60, y = 640;
    await cursor(false);
    await P.addStyleTag({ content: '.vo-ripple{display:none}' }).then(h => h.evaluate(e => { e.id = 'vo-noripple'; }));
    await P.mouse.move(x, y); await P.mouse.down(); await P.mouse.move(x, y - dy, { steps: 10 }); await P.mouse.up();
    await R.wait(150);
    await P.mouse.move(b.x + b.width * 0.5, 470); await P.evaluate(() => document.getElementById('vo-noripple').remove()); await cursor(true);
  }
  async function card(html, ms, sub, opt) {
    const s = now();
    if (opt && opt.instant) { await cutOn(); await P.evaluate(() => { document.getElementById('vo-card').style.transition = 'none'; }); }
    await R.card(html, opt && opt.instant ? 50 : ms);
    if (opt && opt.instant) { await P.evaluate(() => { document.getElementById('vo-card').style.transition = ''; }); await cutOff(); await R.wait(ms - 50); }
    if (sub) cardSubs.push({ start: opt && opt.instant ? now() - (ms - 50) / 1000 : s + 0.4, end: now(), text: T(sub) });
  }

  // 1. hook (shown at once: the frames before it are trimmed, so frame 0 is the card) -------------------------
  const hook = { ar: 'نمذجة المعادلات الهيكلية… مجاناً وفي متصفحك', en: 'Structural equation modeling. Free, right in your browser.' };
  await card(`<img class="anim" src="assets/logo.svg" alt="">
    <h1 class="anim" style="animation-delay:.15s">BabPls</h1>
    <h2 class="anim" style="animation-delay:.35s">${T(hook)}</h2>
    <div class="anim" style="animation-delay:.6s"><span class="tag">PLS-SEM · CB-SEM</span></div>`, 3300, { ar: 'BabPls: ' + hook.ar, en: 'BabPls: ' + hook.en }, { instant: true });
  await P.mouse.move(980, 230); await cursor(true);
  await R.hideCard(120); // the pointer heads for the gallery button while the card fades

  // 2. example gallery -------------------------------------------------------
  await R.click('#dataview [data-act=examples]', { after: 0 });
  await R.caption({ ar: 'تسعة أمثلة جاهزة تغطي التحليلات كلها', en: 'Nine ready-made examples covering every analysis' });
  await R.highlight('.exgrid > section:first-child', 6);
  await R.wait(1900);
  await R.hideCaption(150);
  await R.caption({ ar: 'نقرة واحدة تحمّل البيانات والنموذج', en: 'One click loads the data and the model' });
  await R.unhighlight();
  await R.click('[data-exload=customer]', { after: 700 });
  await panCanvas(70);
  await R.wait(500);

  // 3. bootstrapping (default 5000 samples; the wait is cut) --------------------------------------------
  await R.hideCaption(200);
  await R.caption({ ar: 'أكثر من عشرين تحليلاً في قائمة واحدة', en: 'Over twenty analyses in one menu' });
  await R.click('#calcbtn', { after: 300 });
  await R.highlight('#calcmenu', 4);
  await R.moveTo('#calcmenu [data-run=bootstrap]');
  await R.wait(400);
  await R.unhighlight();
  await R.click('#calcmenu [data-run=bootstrap]', { after: 300 });
  await intoDlg('#rundlg');
  await R.hideCaption(150);
  await R.caption({ ar: 'الإقلاع الذاتي بخمسة آلاف عينة افتراضياً', en: 'Bootstrapping with 5,000 samples by default' });
  await R.highlight('#rundlg input[name=samples]', 6);
  await R.moveTo('#rundlg input[name=samples]', { fx: 0.7 });
  await R.wait(900);
  await R.unhighlight();
  await R.hideCaption(150);
  await P.evaluate(() => { document.getElementById('busy').style.zoom = '1.5'; }); // a bigger progress strip for this shot (reset in the cut)
  await R.click('#rundlg button[type=submit]', { after: 150 });
  await outDlg();
  await capTop(true);
  await R.caption({ ar: 'شريط تقدّم حيّ، ويمكنك الإلغاء متى شئت', en: 'Live progress, and you can cancel any time' });
  await R.highlight('#busy', 8);
  await R.moveTo('#busy', { fx: 0.4 });
  await R.wait(1300);
  // hold until the bar has visibly moved, at most ~1 s more
  await P.waitForFunction(() => parseFloat(document.getElementById('busybar').style.width) >= 12, null, { timeout: 1000, polling: 100 }).catch(() => {});
  await R.wait(200);
  await cutOn();
  await R.unhighlight(); await R.hideCaption(100); await capTop(false);
  await P.evaluate(() => { document.getElementById('busy').style.zoom = ''; });
  await P.waitForSelector('#busy', { state: 'hidden', timeout: 300000 });
  await R.wait(350);
  await cutOff();
  await R.wait(300);

  // 4. checklist and APA write-up ---------------------------------------------
  await zoomOn('#secout .card:first-of-type ul', 1.4, lang === 'ar' ? 0.72 : 0.28);
  await hlIn('#secout .card:first-of-type ul', 6);
  await R.caption({ ar: 'قائمة تقييم آلية تنبّهك إلى مواطن الضعف', en: 'An automatic checklist flags the weak spots' });
  await R.moveTo('#secout .card:first-of-type li:nth-child(1)', { fx: lang === 'ar' ? 0.75 : 0.25 });
  await R.wait(2000);
  await R.unhighlight();
  await R.hideCaption(150);
  await zoomOut();
  await R.caption({ ar: 'وفقرة نتائج جاهزة بأسلوب APA', en: 'And a ready-made APA-style write-up' });
  await scrollTo('#secout', '#writeup', 40);
  await R.highlight('#writeup', 6);
  await R.moveTo('#writeup', { fx: 0.5, fy: 0.3 });
  await R.wait(1700);
  await R.unhighlight();
  await R.hideCaption(150);

  // 5. bootstrap distribution ------------------------------------------------
  await R.click('.secnav [data-sec=b_path]', { after: 400 });
  await R.caption({ ar: 'انقر على مسار لترى توزيع الإقلاع الذاتي وفترة الثقة', en: 'Click a path to see its bootstrap distribution' });
  await scrollTo('#secout', '#secout tr[data-draw]:nth-child(9)', 300);
  await R.highlight('#secout tr[data-draw]:nth-child(9)', 4);
  await R.click('#secout tr[data-draw]:nth-child(9)', { after: 500, fx: 0.15 });
  await R.unhighlight();
  await scrollTo('#secout', '#drawbox', 20);
  await zoomOn('#drawbox svg', 1.6);
  await R.moveTo('#drawbox svg', { fx: 0.5, fy: 0.5 });
  await R.wait(1000);
  await R.hideCaption(150);
  await zoomOut();

  // 6. results on the path model ----------------------------------------------
  await R.click('.tabs [data-view=model]', { after: 400 });
  await R.caption({ ar: 'المعاملات وقيم p على نموذج المسار نفسه', en: 'Coefficients and p-values on the path model' });
  park = await P.evaluate(() => { // the point of the canvas farthest from any drawn shape (above the caption band)
    const c = document.getElementById('canvas').getBoundingClientRect(), A = c.width * c.height;
    const boxes = [...document.querySelectorAll('#canvas text, #canvas rect, #canvas ellipse, #canvas circle, #canvas path, #canvas line')].map(e => e.getBoundingClientRect()).filter(r => r.width && r.width * r.height < A / 4);
    let best = { x: c.left + c.width / 2, y: c.top + c.height / 2, d: -1 };
    for (let x = c.left + 40; x < c.right - 40; x += 20) for (let y = c.top + 40; y < Math.min(c.bottom, 864) - 150; y += 20) {
      const hit = document.elementFromPoint(x, y); if (!hit || !hit.closest('#canvas')) continue; // visible canvas only
      const d = Math.min(...boxes.map(r => Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom))));
      if (d > best.d) best = { x, y, d };
    }
    return best;
  });
  await R.moveXY(park.x, park.y, 10); // empty canvas, clear of every label
  await R.wait(1800);

  // 7. IPMA (target: Value, whose map has room for every label); the caption comes with the map ----------------------
  await R.hideCaption(150);
  await runFromMenu('ipma', async () => { // the caption comes with the IPMA dialog (its title names the map), then stays on the map
    await R.caption({ ar: 'خريطة الأهمية والأداء تكشف أولويات التحسين', en: 'IPMA shows what to improve first' });
    await R.moveTo('#rundlg select[name=target]');
    await P.selectOption('#rundlg select[name=target]', { index: 2 }); // Value
    await R.wait(250);
  });
  await zoomOn('#secout figure.chartbox svg', 1.35);
  await hlIn('#secout figure.chartbox svg', 6);
  const sv = await P.locator('#secout figure.chartbox svg').boundingBox();
  await R.moveXY(Math.min(1450, sv.x + sv.width + 120), sv.y + sv.height * 0.6, 8); // off the map
  await R.wait(1300);
  await R.unhighlight();
  await R.hideCaption(150);
  await zoomOut();

  // 8. CB-SEM fit: the menu entry is shown, the run is cut, then the fit table -------------------------------------
  await R.caption({ ar: 'وفيه أيضاً CB-SEM بمؤشرات مطابقة كاملة', en: 'CB-SEM too, with a full set of fit indices' });
  await runFromMenu('cbsem', null, { menuHold: 300, cut: true });
  await R.click('.secnav [data-sec=cb_fit]', { after: 450 });
  await cutOff();
  await highlightRows('#secout .card', 12); // χ² … NFI
  await R.wait(1900);
  await R.unhighlight();
  await R.hideCaption(150);

  // 9. exports: back to the bootstrap report (this also puts its estimates back on the diagram), then the HTML report --
  await R.caption({ ar: 'صدّر كل النتائج إلى Excel أو تقرير HTML', en: 'Export everything to Excel or an HTML report' });
  await R.click('.restabs [data-kind=bootstrap]', { after: 250 });
  await R.highlight('.restabs [data-act=excel]', 6);
  await R.click('.restabs [data-act=excel]', { after: 200 });
  const xl = await nextDownload(0);
  if (xl) await fileChip('.restabs [data-act=excel]', xl.name, 950); else await R.wait(800);
  await R.highlight('.restabs [data-act=report]', 6);
  await R.click('.restabs [data-act=report]', { after: 400 });
  await R.unhighlight();
  const dl = await nextDownload(xl ? 1 : 0);
  if (dl && dl.text) {
    const html = dl.text, name = dl.name;
    await P.evaluate(([h, n]) => {
      const w = document.createElement('div'); w.id = 'vo-rep';
      w.style.cssText = 'position:absolute;left:50%;top:52%;width:1080px;height:640px;transform:translate(-50%,-50%) scale(.92);opacity:0;transition:opacity .4s ease,transform .4s ease;border-radius:14px;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.45);background:#fff;display:flex;flex-direction:column';
      w.innerHTML = '<div style="height:40px;flex:none;background:#e5e7eb;display:flex;align-items:center;gap:8px;padding:0 16px;direction:ltr"><i style="width:12px;height:12px;border-radius:50%;background:#ef4444"></i><i style="width:12px;height:12px;border-radius:50%;background:#f59e0b"></i><i style="width:12px;height:12px;border-radius:50%;background:#22c55e"></i><span style="margin-left:14px;font:600 15px system-ui;color:#374151"></span></div>';
      w.querySelector('span').textContent = n;
      const f = document.createElement('iframe'); f.style.cssText = 'flex:1;border:0;width:100%;background:#fff'; f.srcdoc = h; f.onload = () => { const d = f.contentDocument, g = d.querySelector('h2.rep'); if (g) d.scrollingElement.scrollTop = g.offsetTop - 12; }; w.appendChild(f);
      document.getElementById('vo-root').insertBefore(w, document.getElementById('vo-cap'));
      requestAnimationFrame(() => { w.style.opacity = '1'; w.style.transform = 'translate(-50%,-50%)'; });
    }, [html, name]);
    await cursor(false);
    await R.wait(500);
    for (let i = 0; i < 16; i++) { await P.evaluate(() => { const f = document.querySelector('#vo-rep iframe'); f.contentWindow.scrollBy(0, 14); }); await R.wait(40); }
    await R.wait(200);
    await R.hideCaption(150);
    await P.evaluate(() => { const w = document.getElementById('vo-rep'); w.style.opacity = '0'; });
    await R.wait(420);
    await P.evaluate(() => document.getElementById('vo-rep').remove());
    await cursor(true);
  } else {
    await R.wait(900);
    await R.hideCaption(150);
  }

  // 10. appearance ------------------------------------------------------------
  await P.evaluate(() => document.getElementById('theme').click()); // light → auto, follows the system (light here): nothing changes on screen
  await R.click('.tabs [data-view=model]', { after: 300 });
  await R.caption({ ar: 'نسّق الرسم كما تشاء: قوالب وألوان وخطوط', en: 'Restyle diagrams: presets, colors, fonts' });
  await R.click('[data-act=style]', { after: 400 });
  await intoDlg('#styledlg');
  await R.highlight('#styledlg .presets', 6);
  await R.click('#styledlg [data-preset=classic]', { after: 1300 });
  await R.unhighlight();
  await P.evaluate(() => document.querySelector('#styledlg form').requestSubmit());
  await outDlg();
  await R.moveXY(park.x, park.y, 10);
  await R.wait(1000);

  // 11. dark theme ----------------------------------------------------------------
  await R.hideCaption(150);
  await R.click('#theme', { after: 250 }); // auto → dark
  await R.caption({ ar: 'ووضع داكن مريح للعين', en: 'And a comfortable dark mode' });
  await R.wait(2200);

  // 12. language --------------------------------------------------------------
  await R.hideCaption(150);
  await R.caption({ ar: 'واجهة كاملة بالعربية والإنجليزية', en: 'A full interface in English and Arabic' });
  await R.click('#lang', { after: 250 });
  await fixTitle();
  await R.moveTo('#lang', { steps: 6 }); // the header mirrored under the pointer: back onto the language button
  await R.wait(1600);
  await R.click('#lang', { after: 250, steps: 6 });
  await fixTitle();
  await R.moveTo('#lang', { steps: 6 });
  await R.wait(550);

  // 13. feature pills ------------------------------------------------------------
  await R.hideCaption(200);
  const pills = ['PLS-SEM', 'PLSc', T({ ar: 'الإقلاع الذاتي (BCa)', en: 'Bootstrapping (BCa)' }), T({ ar: 'الطيّ الأعمى Q²', en: 'Blindfolding Q²' }), 'PLSpredict', 'CVPAT', 'IPMA', 'MGA + MICOM', 'NCA', 'CCA', 'CTA-PLS', 'CB-SEM', T({ ar: 'ثبات القياس', en: 'Measurement invariance' }), 'GSCA', 'FIMIX-PLS', 'PLS-POS', T({ ar: 'الكوبولا الغاوسية', en: 'Gaussian copula' }), 'PROCESS', T({ ar: 'الانحدار اللوجستي', en: 'Logistic regression' }), T({ ar: 'حجم العينة', en: 'Sample size' })];
  const everything = { ar: 'من PLS-SEM إلى CB-SEM في برنامج واحد', en: 'From PLS-SEM to CB-SEM, all in one app' };
  await card(`<h2 class="anim">${T(everything)}</h2>
    <div class="pills anim" style="animation-delay:.25s">${pills.map(p => `<span>${p}</span>`).join('')}</div>
    <p class="anim" style="animation-delay:.5s">${T({ ar: 'يغطي مزايا SmartPLS 4 Enterprise البرمجية، وأكثر', en: 'Covers the software features of SmartPLS 4 Enterprise, and more' })}</p>
    <p class="anim" style="animation-delay:.6s;font-size:26px;opacity:.88">${T({ ar: 'BabPls مشروع مستقل لا صلة له بشركة SmartPLS GmbH', en: 'BabPls is an independent project, not affiliated with SmartPLS GmbH' })}</p>`, 5000, everything);

  // 14. values ----------------------------------------------------------------
  const values = { ar: 'مجاني ومفتوح المصدر، وبياناتك لا تغادر جهازك', en: 'Free. Open source. Your data never leaves your device.' };
  await card(`<h2 class="anim">${T(values)}</h2>
    <div class="pills anim" style="animation-delay:.3s">
      <span>${T({ ar: 'رخصة MIT', en: 'MIT license' })}</span>
      <span>${T({ ar: 'يعمل في المتصفح بلا خادم', en: 'Runs in the browser, no server' })}</span>
      <span>${T({ ar: 'بلا حسابات ولا تتبّع', en: 'No accounts, no tracking' })}</span>
      <span>${T({ ar: 'يُثبَّت كتطبيق ويب', en: 'Installs as a web app' })}</span>
      <span>Windows · macOS · Linux</span>
    </div>`, 3300, values);

  // 15. end card -----------------------------------------------------------------
  const cta = { ar: 'افتحه الآن، بلا تسجيل ولا تثبيت', en: 'Open it now. No sign-up, no install.' };
  await card(`<img class="anim" src="assets/logo.svg" alt="">
    <h1 class="anim" style="animation-delay:.1s">BabPls</h1>
    <p class="anim" style="animation-delay:.3s">${T(cta)}</p>
    <div class="url anim" style="animation-delay:.5s">motqenacademy-droid.github.io/babpls</div>
    <p class="anim" style="animation-delay:.7s;font-size:26px">${T({ ar: 'تصميم د. أحمد يوسف', en: 'Designed by Dr. Ahmed Youssef' })}</p>`, 3900,
    { ar: cta.ar + '\nmotqenacademy-droid.github.io/babpls', en: cta.en + '\nmotqenacademy-droid.github.io/babpls' });

  const res = await R.finish();

  // post: find the marked frames, drop them, and re-anchor the subtitles at the end of each cut --------------------
  const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', OUT, '-vf', `crop=4:4:2:${rec.H - 6},format=rgb24`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
  const N = raw.length / 48, marked = [];
  for (let n = 0; n < N; n++) { let r = 0, g = 0, b = 0; for (let k = 0; k < 16; k++) { r += raw[n * 48 + k * 3]; g += raw[n * 48 + k * 3 + 1]; b += raw[n * 48 + k * 3 + 2]; } marked.push(r / 16 > 180 && g / 16 < 90 && b / 16 > 180); }
  const runs = []; // [first, last] marked frame of each run
  marked.forEach((m, n) => { if (m && (n === 0 || !marked[n - 1])) runs.push([n, n]); else if (m) runs[runs.length - 1][1] = n; });
  // a modal dialog opening above the overlay can hide the marker for a few frames: merge runs closer than 2/3 s;
  // the first run also takes the frames before it (the page before the hook card)
  for (let i = runs.length - 1; i > 0; i--) if (runs[i][0] - runs[i - 1][1] < 20) { runs[i - 1][1] = runs[i][1]; runs.splice(i, 1); }
  if (runs.length && runs[0][0] < 15) runs[0][0] = 0;
  if (runs.length !== cuts.length) console.error(`warning: ${runs.length} marked runs for ${cuts.length} cuts`);
  const srtFile = OUT.replace(/\.mp4$/, '.srt');
  const parseT = s => { const m = s.match(/(\d+):(\d+):(\d+),(\d+)/); return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000; };
  const subs = fs.readFileSync(srtFile, 'utf8').trim().split(/\n\s*\n/).filter(Boolean).map(b => { const L = b.split('\n'); const [a, z] = L[1].split(' --> '); return { start: parseT(a), end: parseT(z), text: L.slice(2).join('\n') }; });
  const all = subs.concat(cardSubs).sort((a, b) => a.start - b.start);
  const map = t => { // script clock → final video time
    let out = t, removed = 0;
    cuts.forEach(([a, b], i) => { const r = runs[i]; if (!r) return; const fa = r[0] / 30, fb = (r[1] + 1) / 30; removed += fb - fa; if (t >= a) out = Math.max(fb, fb + (t - b)) - removed; });
    return Math.max(0, out);
  };
  const ts = v => { const ms = Math.max(0, Math.round(v * 1000)); return new Date(ms).toISOString().slice(11, 23).replace('.', ','); };
  const shifted = all.map(s => ({ start: map(s.start), end: map(s.end), text: s.text })).filter(s => s.end - s.start > 0.3);
  const rlm = v => (lang === 'ar' ? v.split('\n').map(l => '\u200F' + l).join('\n') : v); // RTL paragraphs even for lines that start with Latin text
  fs.writeFileSync(srtFile, shifted.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${rlm(c.text)}\n`).join('\n'));
  const tmp = OUT.replace(/\.mp4$/, '.cut.mp4');
  const sel = runs.map(([a, b]) => `between(n,${a},${b})`).join('+') || '0';
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', OUT, '-vf', `select='not(${sel})',setpts=N/FRAME_RATE/TB`, '-r', '30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', tmp]);
  fs.renameSync(tmp, OUT);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '2.2', '-i', OUT, '-frames:v', '1', OUT.replace(/\.mp4$/, '-thumb.png')]);
  const dur = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', OUT]).toString().trim();
  console.log(JSON.stringify({ out: OUT, seconds: dur, recorded: res.seconds, cuts, runs, errors: res.errors }));
})().catch(e => { console.error(e); process.exit(1); });
