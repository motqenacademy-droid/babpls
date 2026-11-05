// Screen-recording toolkit for the BabPls promo and tutorial videos.
// Drives the real app in Chromium (Playwright), adds an overlay layer (captions, title cards, step badge, a visible
// cursor), captures frames with the DevTools screencast and encodes a 30 fps H.264 MP4 with ffmpeg.
// Usage: const R = await rec.start({ lang, url, out }); ... await R.finish();
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const W = 1920, H = 1080, ZOOM = 1.25; // the page is laid out at 1536×864 CSS px and rendered at 1.25× = 1920×1080 device px, so the UI reads well on video
const FONT_DIR = 'tools/video/fonts/'; // served by the same static server as the app

const OVERLAY_CSS = `
@font-face { font-family: Cairo; font-weight: 400; src: url(${FONT_DIR}cairo-arabic-400-normal.woff2) format('woff2'); unicode-range: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF; }
@font-face { font-family: Cairo; font-weight: 700; src: url(${FONT_DIR}cairo-arabic-700-normal.woff2) format('woff2'); unicode-range: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF; }
@font-face { font-family: Cairo; font-weight: 800; src: url(${FONT_DIR}cairo-arabic-800-normal.woff2) format('woff2'); unicode-range: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF; }
@font-face { font-family: Cairo; font-weight: 400; src: url(${FONT_DIR}cairo-latin-400-normal.woff2) format('woff2'); }
@font-face { font-family: Cairo; font-weight: 700; src: url(${FONT_DIR}cairo-latin-700-normal.woff2) format('woff2'); }
@font-face { font-family: Cairo; font-weight: 800; src: url(${FONT_DIR}cairo-latin-800-normal.woff2) format('woff2'); }
#vo-root { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; font-family: Cairo, system-ui, sans-serif; }
#vo-cap { position: absolute; left: 50%; bottom: 36px; transform: translate(-50%, 20px); max-width: 1250px; padding: 14px 28px; border-radius: 18px;
  background: rgba(17, 16, 52, .88); color: #fff; font-size: 30px; font-weight: 700; line-height: 1.45; text-align: center; opacity: 0;
  box-shadow: 0 12px 40px rgba(0,0,0,.35); transition: opacity .35s ease, transform .35s ease; }
#vo-cap.on { opacity: 1; transform: translate(-50%, 0); }
#vo-cap small { display: block; font-size: 22px; font-weight: 400; color: #c7d2fe; margin-top: 4px; }
#vo-step { position: absolute; top: 26px; inset-inline-end: 26px; padding: 10px 22px; border-radius: 999px; background: #f59e0b; color: #1e1b4b;
  font-size: 23px; font-weight: 800; opacity: 0; transition: opacity .3s; }
#vo-step.on { opacity: 1; }
#vo-card { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; text-align: center;
  background: radial-gradient(1200px 700px at 30% 20%, #3730a3 0%, #1e1b4b 55%, #0b1026 100%); color: #fff; opacity: 0; transition: opacity .5s ease; padding: 0 120px; }
#vo-card.on { opacity: 1; }
#vo-card img { width: 180px; height: 180px; filter: drop-shadow(0 18px 40px rgba(0,0,0,.45)); }
#vo-card h1 { font-size: 84px; font-weight: 800; margin: 0; letter-spacing: .5px; }
#vo-card h2 { font-size: 46px; font-weight: 800; margin: 0; line-height: 1.35; }
#vo-card p { font-size: 32px; font-weight: 400; margin: 0; color: #c7d2fe; line-height: 1.5; max-width: 1200px; }
#vo-card .tag { display: inline-block; padding: 8px 26px; border-radius: 999px; background: #f59e0b; color: #1e1b4b; font-size: 27px; font-weight: 800; }
#vo-card .pills { display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; max-width: 1250px; }
#vo-card .pills span { padding: 10px 24px; border-radius: 999px; background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.25); font-size: 26px; font-weight: 700; }
#vo-card .url { font-size: 36px; font-weight: 700; color: #67e8f9; direction: ltr; }
#vo-card .anim { animation: vo-rise .8s ease both; }
@keyframes vo-rise { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: none; } }
#vo-cursor { position: absolute; width: 28px; height: 28px; margin: -4px 0 0 -4px; transition: transform .12s ease; }
#vo-cursor.down { transform: scale(.82); }
.vo-ripple { position: absolute; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%; border: 4px solid #f59e0b; animation: vo-rip .6s ease-out forwards; }
@keyframes vo-rip { to { width: 90px; height: 90px; margin: -45px 0 0 -45px; opacity: 0; } }
.vo-hl { position: absolute; border: 5px solid #f59e0b; border-radius: 14px; box-shadow: 0 0 0 9999px rgba(15, 14, 40, .35); transition: all .4s ease; opacity: 0; }
.vo-hl.on { opacity: 1; }
#toasts { display: none !important; }
`;
const CURSOR_SVG = `<svg viewBox="0 0 24 24" width="28" height="28"><path d="M3 2l7 19 2.6-7.4L20 11z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

async function start(o) {
  const out = o.out, frames = out + '.frames';
  fs.rmSync(frames, { recursive: true, force: true }); fs.mkdirSync(frames, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W / ZOOM, height: H / ZOOM }, deviceScaleFactor: ZOOM, locale: o.lang === 'ar' ? 'ar' : 'en-US' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  // fresh state with the requested language and light theme
  await page.goto(o.url);
  await page.evaluate(([l, s]) => { localStorage.clear(); localStorage.setItem('babpls.prefs.v1', JSON.stringify({ lang: l, theme: 'light', uiScale: s })); }, [o.lang, o.uiScale || 100]);
  await page.reload();
  await injectOverlay(page);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);

  // screencast: frames arrive only when the screen changes, each with a timestamp
  const cdp = await ctx.newCDPSession(page), shots = [];
  let recording = true;
  cdp.on('Page.screencastFrame', async ev => {
    if (recording) { const f = path.join(frames, String(shots.length).padStart(6, '0') + '.jpg'); fs.writeFileSync(f, Buffer.from(ev.data, 'base64')); shots.push({ f, t: ev.metadata.timestamp }); }
    try { await cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }); } catch (e) { /* closing */ }
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  // keep the screencast producing frames during static scenes (a 1px heartbeat in a corner)
  await page.evaluate(() => { const d = document.createElement('div'); d.id = 'vo-beat'; d.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;z-index:2147483647;pointer-events:none'; document.body.appendChild(d); let k = 0; setInterval(() => { d.style.background = (k++ % 2) ? 'rgba(0,0,0,.01)' : 'rgba(0,0,0,.02)'; }, 100); });

  const t0 = Date.now(), caps = []; // caption timeline for the .srt file
  const capOn = text => { const now = (Date.now() - t0) / 1000; if (caps.length && caps[caps.length - 1].end === null) caps[caps.length - 1].end = now; if (text) caps.push({ start: now, end: null, text }); };
  const R = {
    page, errors, lang: o.lang,
    T: v => (typeof v === 'string' ? v : v[o.lang]),
    wait: ms => page.waitForTimeout(ms),
    async caption(text, ms, sub) { capOn(R.T(text) + (sub ? '\n' + R.T(sub) : '')); await page.evaluate(([t, s]) => { const c = document.getElementById('vo-cap'); c.innerHTML = ''; c.textContent = t; if (s) { const sm = document.createElement('small'); sm.textContent = s; c.appendChild(sm); } c.classList.add('on'); }, [R.T(text), sub ? R.T(sub) : '']); if (ms) await page.waitForTimeout(ms); },
    async hideCaption(ms) { capOn(null); await page.evaluate(() => document.getElementById('vo-cap').classList.remove('on')); await page.waitForTimeout(ms || 350); },
    async step(text) { await page.evaluate(t => { const s = document.getElementById('vo-step'); s.textContent = t; s.classList.toggle('on', !!t); }, text ? R.T(text) : ''); },
    async card(html, ms) { await page.evaluate(h => { const c = document.getElementById('vo-card'); c.innerHTML = h; c.classList.add('on'); document.getElementById('vo-cursor').style.visibility = 'hidden'; }, html); await page.waitForTimeout(ms || 3000); },
    async hideCard(ms) { await page.evaluate(() => document.getElementById('vo-card').classList.remove('on')); await page.waitForTimeout(ms || 600); },
    async highlight(sel, pad) { await page.evaluate(([s, p]) => { const el = document.querySelector(s), hl = document.querySelector('.vo-hl'); if (!el) { hl.classList.remove('on'); return; } const r = el.getBoundingClientRect(); p = p || 8; Object.assign(hl.style, { left: r.left - p + 'px', top: r.top - p + 'px', width: r.width + 2 * p + 'px', height: r.height + 2 * p + 'px' }); hl.classList.add('on'); }, [sel, pad]); await page.waitForTimeout(450); },
    async unhighlight() { await page.evaluate(() => document.querySelector('.vo-hl').classList.remove('on')); await page.waitForTimeout(300); },
    async moveTo(sel, opt) {
      opt = opt || {};
      const el = typeof sel === 'string' ? page.locator(sel).first() : sel;
      await el.scrollIntoViewIfNeeded();
      const b = await el.boundingBox(); if (!b) throw new Error('no box for ' + sel);
      const x = b.x + b.width * (opt.fx === undefined ? 0.5 : opt.fx), y = b.y + b.height * (opt.fy === undefined ? 0.5 : opt.fy);
      await page.mouse.move(x, y, { steps: opt.steps || 28 }); await page.waitForTimeout(opt.pause === undefined ? 180 : opt.pause);
      return { x, y };
    },
    async moveXY(x, y, steps) { await page.mouse.move(x, y, { steps: steps || 28 }); await page.waitForTimeout(150); },
    async click(sel, opt) { await R.moveTo(sel, opt); await page.mouse.down(); await page.waitForTimeout(90); await page.mouse.up(); await page.waitForTimeout((opt && opt.after) || 500); },
    async drag(fromSel, toSel, opt) { await R.moveTo(fromSel); await page.mouse.down(); await page.waitForTimeout(150); await R.moveTo(toSel, Object.assign({ steps: 40 }, opt || {})); await page.mouse.up(); await page.waitForTimeout(600); },
    async type(sel, text, opt) { await R.click(sel); await page.keyboard.press('Control+A'); await page.keyboard.type(text, { delay: (opt && opt.delay) || 70 }); await page.waitForTimeout(300); },
    async scroll(sel, dy, steps) { const n = steps || 12; for (let i = 0; i < n; i++) { await page.evaluate(([s, d]) => { const el = s ? document.querySelector(s) : document.scrollingElement; if (el) el.scrollBy(0, d); }, [sel, dy / n]); await page.waitForTimeout(40); } await page.waitForTimeout(300); },
    async finish() {
      await page.waitForTimeout(500);
      recording = false; try { await cdp.send('Page.stopScreencast'); } catch (e) { /* ignore */ }
      const tEnd = shots.length ? shots[shots.length - 1].t + 0.5 : 0;
      await browser.close();
      // concat list with real durations, then resample to constant 30 fps
      const list = shots.map((s, i) => `file '${s.f}'\nduration ${Math.max(0.001, ((i + 1 < shots.length ? shots[i + 1].t : tEnd) - s.t)).toFixed(4)}`).join('\n') + `\nfile '${shots[shots.length - 1].f}'\n`;
      const lf = path.join(frames, 'list.txt'); fs.writeFileSync(lf, list);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lf, '-vf', 'fps=30,scale=' + W + ':' + H + ':flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart', out]);
      fs.rmSync(frames, { recursive: true, force: true });
      // subtitles: same text and timing as the burned-in captions (the video starts at the first frame, ≈ t0)
      capOn(null);
      const ts = v => { const ms = Math.max(0, Math.round(v * 1000)); return new Date(ms).toISOString().slice(11, 23).replace('.', ','); };
      fs.writeFileSync(out.replace(/\.mp4$/, '.srt'), caps.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join('\n'));
      if (errors.length) console.error('page errors:', errors);
      return { out, seconds: tEnd - (shots[0] ? shots[0].t : 0), frames: shots.length, errors };
    }
  };
  return R;
}

async function injectOverlay(page) {
  await page.addStyleTag({ content: OVERLAY_CSS });
  await page.evaluate(svg => {
    const root = document.createElement('div'); root.id = 'vo-root';
    root.innerHTML = `<div class="vo-hl"></div><div id="vo-card"></div><div id="vo-step"></div><div id="vo-cap"></div><div id="vo-cursor">${svg}</div>`;
    document.body.appendChild(root);
    const cur = document.getElementById('vo-cursor');
    cur.style.left = '960px'; cur.style.top = '600px';
    document.addEventListener('mousemove', e => { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; }, true);
    document.addEventListener('mousedown', e => { cur.classList.add('down'); const r = document.createElement('div'); r.className = 'vo-ripple'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; root.appendChild(r); setTimeout(() => r.remove(), 700); }, true);
    document.addEventListener('mouseup', () => cur.classList.remove('down'), true);
  }, CURSOR_SVG);
}

module.exports = { start, W, H };
