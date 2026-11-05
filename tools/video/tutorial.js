// BabPls tutorial video (Arabic and English): a first PLS-SEM project in seven steps, recorded from the real app.
// Usage (with the app served on PORT):  node tools/video/tutorial.js ar|en [PORT]
// Output: media/BabPls-tutorial-<lang>.mp4 and .srt
'use strict';
const path = require('path'), fs = require('fs');
const rec = require('./rec.js');

const lang = process.argv[2] === 'en' ? 'en' : 'ar';
const PORT = process.argv[3] || '8772';
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'media', `BabPls-tutorial-${lang}.mp4`);
const CSV = path.join(ROOT, 'examples', 'customer_satisfaction.csv');

// construct names per language (the data columns are imag_*, expe_*, qual_*, val_*, sat_*, loy_*)
const N = lang === 'ar'
  ? { imag: 'الصورة', expe: 'التوقعات', qual: 'الجودة', val: 'القيمة', sat: 'الرضا', loy: 'الولاء' }
  : { imag: 'Image', expe: 'Expectation', qual: 'Quality', val: 'Value', sat: 'Satisfaction', loy: 'Loyalty' };

(async () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const R = await rec.start({ lang, url: `http://127.0.0.1:${PORT}/index.html`, out: OUT, frames: fs.mkdtempSync(path.join(require('os').tmpdir(), 'babpls-tutorial-' + lang + '-')) });
  const P = R.page;

  // Keep the overlay (captions, cursor, highlight) above modal dialogs: <dialog>.showModal() puts the dialog in the
  // top layer, above any z-index, so the overlay becomes a manual popover and is re-raised whenever a dialog opens.
  // the step badge sits in the empty middle of the top bar (between the file buttons and the Desktop app button), where it
  // never covers a highlighted element, a dialog title or page text
  const badgeX = lang === 'ar' ? 588 : 992;
  await P.evaluate(badgeX => {
    const st = document.createElement('style');
    st.textContent = '#vo-root[popover]{position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:transparent;overflow:visible;color:inherit}';
    document.head.appendChild(st);
    const root = document.getElementById('vo-root');
    root.setAttribute('popover', 'manual');
    const st2 = document.createElement('style'); st2.textContent = '.vo-hl{transition:opacity .35s ease !important} #vo-step{inset-inline-end:auto !important;left:' + badgeX + 'px !important;transform:translateX(-50%);top:7px !important;font-size:18px !important;padding:5px 18px !important;line-height:1.5;white-space:nowrap}'; document.head.appendChild(st2); root.showPopover();
    const raise = () => { try { root.hidePopover(); root.showPopover(); } catch (e) { /* ignore */ } };
    new MutationObserver(() => setTimeout(raise, 0)).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
  }, badgeX);

  // captions: each stays on screen at least long enough to read (≈ 0.85 s + 0.22 s per word, 2.4–4.5 s); actions run meanwhile
  let due = 0, shown = 0;
  const words = s => s.split(/\s+/).filter(Boolean).length;
  const hold = async () => { const w = due - Date.now(); if (w > 0) await R.wait(w); };
  const say = async (ar, en) => { await hold(); const s = R.T({ ar, en }); await R.caption(s); shown = Date.now(); due = shown + Math.min(4500, Math.max(2400, 850 + 222 * words(s))); };
  const hl = async (sel, pad) => { await hold(); await R.highlight(sel, pad); };
  const quiet = async () => { await hold(); await R.hideCaption(); };
  // caption at the top of the canvas (during the bootstrap run, so it covers neither the model nor the progress bar)
  const capTop = on => P.evaluate(v => { const c = document.getElementById('vo-cap'); c.style.top = v ? '196px' : ''; c.style.bottom = v ? 'auto' : ''; }, on);
  // smooth-scroll an element into view inside its scroll containers
  const into = async (sel, block) => { await P.evaluate(([q, b]) => { const el = typeof q === 'string' ? document.querySelector(q) : null; if (el) el.scrollIntoView({ block: b || 'center', behavior: 'smooth' }); }, [sel, block]); await R.wait(700); };
  // click something that downloads a file; returns the file name
  const download = async sel => { try { const [d] = await Promise.all([P.waitForEvent('download', { timeout: 8000 }), R.click(sel, { after: 300 })]); return d.suggestedFilename(); } catch (e) { return null; } };
  // a point on empty canvas (no construct, indicator or path under it) near (x, y), for panning
  const emptyAt = (x, y) => P.evaluate(([x0, y0]) => { const svg = document.querySelector('#canvas'); for (let r = 0; r < 400; r += 12) for (let a = 0; a < 6.28; a += 0.4) { const x = x0 + r * Math.cos(a), y = y0 + r * Math.sin(a), el = document.elementFromPoint(x, y); if (el && svg.contains(el) && !el.closest('g')) return { x, y }; } return { x: x0, y: y0 }; }, [x, y]);
  const lv = name => P.locator('#canvas g.lv', { hasText: name }).first();
  const step = (n, ar, en) => R.step({ ar: `${n}/7 · ${ar}`, en: `${n}/7 · ${en}` }); // same wording as the pills on the "What you will learn" card

  // ------------------------------------------------------------------ title
  await R.card(R.T({
    ar: `<img class="anim" src="assets/logo.svg"><span class="tag anim">درس تعليمي</span><h1 class="anim">BabPls</h1><h2 class="anim">نموذجك الأول في PLS-SEM في سبع خطوات</h2><p class="anim">من استيراد البيانات إلى تقرير جاهز بأسلوب APA</p>`,
    en: `<img class="anim" src="assets/logo.svg"><span class="tag anim">Tutorial</span><h1 class="anim">BabPls</h1><h2 class="anim">Your first PLS-SEM model in 7 steps</h2><p class="anim">From importing data to an APA-style report</p>`
  }), 2800);
  await R.card(R.T({
    ar: `<h2 class="anim">ماذا ستتعلم؟</h2><div class="pills anim"><span>1 · شاشة البدء</span><span>2 · استيراد البيانات</span><span>3 · بناء النموذج</span><span>4 · PLS-SEM ومعايير الجودة</span><span>5 · الإقلاع الذاتي</span><span>6 · التقرير والتصدير</span><span>7 · الأمثلة والدليل</span></div>`,
    en: `<h2 class="anim">What you will learn</h2><div class="pills anim"><span>1 · Start screen</span><span>2 · Import data</span><span>3 · Build the model</span><span>4 · PLS-SEM &amp; quality criteria</span><span>5 · Bootstrapping</span><span>6 · Report &amp; export</span><span>7 · Examples &amp; guide</span></div>`
  }), 2900);
  await R.hideCard(600);

  // ------------------------------------------------------- 1. start screen
  await step(1, 'شاشة البدء', 'Start screen');
  await R.moveXY(760, 300);
  await say('افتح BabPls في المتصفح: بلا تثبيت ولا حساب، وبياناتك لا تغادر جهازك.', 'Open BabPls in your browser: no installation, no account, and your data stay on your computer.');
  await hl('.welcome .actions', 10);
  await say('من شاشة البدء: افتح مثالاً جاهزاً، أو تصفّح بيانات الأمثلة، أو استورد بياناتك.', 'From the start screen, open a ready example, browse the example datasets, or import your own data.');
  await R.moveTo('.welcome .actions [data-act=import]');
  await hl('.tabs', 4);
  await say('الألسنة في الأعلى: البيانات، والنموذج، والنتائج، والدليل والمصادر.', 'The tabs at the top: Data, Model, Results, and Guide & references.');
  await R.moveTo('.tabs [data-view=help]');
  await hl('#dlapp', 6);
  await R.moveTo('#dlapp');
  await say('تفضّل تطبيقاً مستقلاً؟ نزّل «تطبيق سطح المكتب» لويندوز أو ماك أو لينكس.', 'Prefer a desktop app? Download it for Windows, macOS or Linux.');
  await hl('#lang', 6);
  await R.moveTo('#lang');
  await say('وزر اللغة بجانبه يبدّل الواجهة إلى الإنجليزية.', 'The language button next to it switches the interface to Arabic.');
  await quiet(); await R.unhighlight();

  // ------------------------------------------------------- 2. import data
  await step(2, 'استيراد البيانات', 'Import data');
  await hl('.tbar [data-act=import]', 6);
  await say('اضغط «استيراد بيانات»: يقبل CSV وExcel وSPSS، والصف الأول أسماء المتغيرات.', 'Click Import data. CSV, Excel and SPSS files work; the first row holds the variable names.');
  await R.moveTo('.tbar [data-act=import]');
  await hold();
  await R.unhighlight();
  try {
    const [fc] = await Promise.all([P.waitForEvent('filechooser', { timeout: 5000 }), R.click('.tbar [data-act=import]', { after: 200 })]);
    await fc.setFiles(CSV);
  } catch (e) { await P.setInputFiles('#csvfile', CSV); }
  await R.hideCaption(200);
  await R.wait(500);
  // the app opens the Model tab after an import: go to the Data tab first, then talk about it
  await R.click('.tabs [data-view=data]', { after: 400 });
  await say('مثالنا رضا العملاء: 300 مستجيب و24 متغيراً. لنفحص البيانات أولاً في لسان «البيانات».', 'Our example: customer satisfaction, 300 respondents, 24 variables. First, check the data in the Data tab.');
  await hl('#dataview > .datahead + .datahead', 6);
  await say('في الأعلى: عدد الصفوف والمتغيرات، ومجموع القيم المفقودة.', 'At the top: the number of rows and variables, and the total of missing values.');
  await hl('#dataview .card', 4);
  await say('ثم الإحصاءات الوصفية لكل متغير: المتوسط والوسيط والانحراف والالتواء والتفلطح.', 'Then descriptive statistics for every variable: mean, median, SD, kurtosis and skewness.');
  await hl('#dataview tr[data-var="4"]', 2);
  await R.moveTo('#dataview tr[data-var="4"] td:nth-child(4)');
  await say('عمود «المفقود» يبيّن عدد القيم الناقصة في كل متغير، مثل imag_2.', 'The Missing column counts the empty cells of each variable, such as imag_2.');
  await hold();
  await say('انقر على أي متغير لعرض توزيعه.', 'Click any variable to see its distribution.');
  await R.unhighlight();
  await R.click('#dataview tr[data-var="4"]', { after: 300 });
  await into('#dataview > section.card:nth-of-type(2)', 'start');
  await R.highlight('#dataview > section.card:nth-of-type(2) svg', 6);
  await R.moveXY(560, 330);
  await hold(); await R.unhighlight();
  await R.hideCaption(200);
  await P.evaluate(() => document.querySelector('#dataview').scrollTo({ top: 0, behavior: 'smooth' })); await R.wait(800);
  await hl('#dataview > .datahead + .datahead .pill:nth-child(3)', 6);
  await say('القيم المفقودة تُعالج افتراضياً بـ«الإحلال بالمتوسط»، ويمكنك اختيار «حذف الحالة كاملة» عند الحساب.', 'By default missing values get mean replacement; you can choose casewise deletion when you run an analysis.');
  await hold(); await R.unhighlight();
  await quiet();

  // ------------------------------------------------------- 3. build the model
  await step(3, 'بناء النموذج', 'Build the model');
  await R.click('.tabs [data-view=model]');
  await hl('#indlist', 4);
  await say('في لسان النموذج تظهر مؤشرات بياناتك في القائمة الجانبية.', 'In the Model tab, the indicators of your data are listed in the side panel.');
  await hold(); await R.unhighlight();
  await say('انقر أول مؤشر، ثم Shift مع النقر على آخره لتحديد المجموعة كلها.', 'Click the first indicator, then Shift-click the last one to select the whole block.');
  await R.click('#indlist li[data-col=imag_1]');
  await R.moveTo('#indlist li[data-col=imag_5]');
  await P.keyboard.down('Shift'); await P.mouse.down(); await R.wait(80); await P.mouse.up(); await P.keyboard.up('Shift');
  await R.wait(400);
  await hold();
  await say('ثم اسحبها إلى مساحة فارغة: يُنشأ متغير كامن يضمّ هذه المؤشرات.', 'Now drag them onto empty canvas: a construct is created with these indicators.');
  const cb = await P.locator('#canvas').boundingBox();
  await R.moveTo('#indlist li[data-col=imag_3]');
  await P.mouse.down(); await R.wait(150);
  await P.mouse.move(cb.x + 350, cb.y + 265, { steps: 45 }); await R.wait(200); await P.mouse.up();
  await R.wait(600);
  await hold();
  await say('اكتب له اسماً واضحاً في لوحة الخصائص، ثم اضغط Enter.', 'Give it a clear name in the properties panel, then press Enter.');
  await R.type('#p_name', N.imag, { delay: 110 });
  await P.keyboard.press('Enter');
  await R.wait(500);
  // clear the indicator selection (click a selected indicator once to select it alone, once more to deselect it)
  const i1 = await R.moveTo('#indlist li[data-col=imag_1]', { steps: 22 });
  await P.mouse.click(i1.x, i1.y); await R.wait(150); await P.mouse.click(i1.x, i1.y); await R.wait(300);
  await hold();
  // click empty canvas (lower middle, far from the constructs) to show the model panel
  await R.moveXY(cb.x + cb.width * 0.5, cb.y + cb.height * 0.82);
  await P.mouse.down(); await P.mouse.up(); await R.wait(400);
  await hl('#props [data-act=prefix]', 6);
  await say('أسرع من ذلك: هذا الزر ينشئ كل المتغيرات الباقية من بادئات الأسماء دفعة واحدة.', 'Even faster: this button creates all remaining constructs from the name prefixes in one click.');
  await R.moveTo('#props [data-act=prefix]');
  await hold();
  await R.unhighlight();
  await R.click('#props [data-act=prefix]', { after: 900 });
  await say('انقر مرتين على المتغير لإعادة تسميته.', 'Double-click a construct to rename it.');
  const ren = [['Expe', N.expe], ['Qual', N.qual], ['Val', N.val], ['Sat', N.sat], ['Loy', N.loy]];
  for (let i = 0; i < ren.length; i++) {
    const [old, nu] = ren[i];
    const pt = await R.moveTo(lv(old), { steps: i ? 18 : 28 });
    await P.mouse.dblclick(pt.x, pt.y); await R.wait(250);
    await R.type('#p_name', nu, { delay: i ? 35 : 90 });
    await P.keyboard.press('Enter'); await R.wait(i ? 250 : 500);
    if (i === 0) { await hold(); await say('وسمِّ البقية بالطريقة نفسها.', 'Rename the others the same way.'); }
    if (i === 2) { await hold(); await say('هذه الأسماء هي التي ستظهر في النتائج والتقارير.', 'These names are the ones you will see in the results and reports.'); }
  }
  await hold();
  await hl('.etools [data-tool=path]', 6);
  await say('الآن المسارات: اختر أداة «مسار»، وانقر السبب ثم النتيجة.', 'Now the paths: choose the Path tool, click the cause, then the effect.');
  await R.click('.etools [data-tool=path]');
  await R.unhighlight();
  await R.click(lv(N.imag), { after: 400 });
  await R.click(lv(N.expe), { after: 600 });
  await say('ارسم بقية الفرضيات العشر بالطريقة نفسها.', 'Draw the rest of the ten hypothesised paths the same way.');
  const paths = [[N.imag, N.sat], [N.imag, N.loy], [N.expe, N.qual], [N.expe, N.val], [N.expe, N.sat], [N.qual, N.val], [N.qual, N.sat], [N.val, N.sat], [N.sat, N.loy]];
  for (let q = 0; q < paths.length; q++) {
    const [a, b] = paths[q];
    if (q === 4) { await hold(); await say('كل سهم يتجه من المتغير المؤثِّر إلى المتغير الذي يؤثّر فيه.', 'Each arrow runs from the predictor to the outcome it affects.'); }
    await R.moveTo(lv(a), { steps: 11, pause: 50 }); await P.mouse.down(); await P.mouse.up(); await R.wait(120);
    await R.moveTo(lv(b), { steps: 12, pause: 50 }); await P.mouse.down(); await P.mouse.up(); await R.wait(160);
  }
  await hold();
  await R.click('.etools [data-tool=select]', { after: 300 });
  await hl('.etools [data-act=layout]', 6);
  await say('عُد إلى أداة التحديد، واضغط «ترتيب تلقائي» لترتيب النموذج من اليسار إلى اليمين.', 'Back to the Select tool, then Auto layout arranges the model from left to right.');
  await R.click('.etools [data-act=layout]', { after: 800 });
  await R.unhighlight();
  await hold();
  // tidy: move the Quality construct down so the Image → Loyalty path no longer crosses its indicators, then fit
  await say('اسحب أي متغير لتحسين الرسم، وزر ⤢ يلائم النموذج مع اللوحة.', 'Drag any construct to tidy the drawing; the ⤢ button fits the model to the canvas.');
  const qp = await R.moveTo(lv(N.qual), { steps: 22 });
  await P.mouse.down(); await R.wait(120); await P.mouse.move(qp.x + 5, qp.y + 40, { steps: 30 }); await R.wait(120); await P.mouse.up(); await R.wait(400);
  await R.click('.etools [data-act=fit]', { after: 700 });
  await hold();
  const ep = await emptyAt(cb.x + cb.width * 0.5, cb.y + 40);
  await R.moveXY(ep.x, ep.y);
  await P.mouse.down(); await P.mouse.up(); await R.wait(400);
  await hl('#props .ok', 8);
  await say('اللوحة تؤكد: ستة متغيرات كامنة وعشرة مسارات، والنموذج جاهز للحساب.', 'The panel confirms six constructs and ten paths: the model is ready to calculate.');
  await hold(); await R.unhighlight();
  await quiet();

  // ------------------------------------------------------- 4. PLS-SEM
  await step(4, 'PLS-SEM ومعايير الجودة', 'PLS-SEM & quality criteria');
  await R.click('#calcbtn', { after: 400 });
  await hl('#calcmenu', 4);
  await say('قائمة «احسب» فيها كل التحليلات: PLS-SEM والإقلاع الذاتي وPLSpredict وIPMA وCB-SEM وغيرها.', 'Calculate lists every analysis: PLS-SEM, bootstrapping, PLSpredict, IPMA, CB-SEM and more.');
  await R.moveTo('#calcmenu [data-run=pls]');
  await hold(); await R.unhighlight();
  await R.click('#calcmenu [data-run=pls]', { after: 600 });
  await say('ابدأ بخوارزمية PLS-SEM، واترك الإعدادات الافتراضية: مخطط الترجيح «المسار» و«الإحلال بالمتوسط».', 'Start with the PLS-SEM algorithm and keep the defaults: path weighting, mean replacement.');
  await R.moveTo('#rundlg button[type=submit]');
  await hold();
  await R.hideCaption(200);
  await R.click('#rundlg button[type=submit]', { after: 1000 });
  await hl('#resultsview .secnav', 2);
  await say('النتائج في ثلاث مجموعات: النهائية، ومعايير الجودة، والتفاصيل. ابدأ بنموذج القياس: «التشبعات الخارجية».', 'Results come in three groups: final, quality criteria, details. Start with Outer loadings.');
  await R.moveTo('.secnav [data-sec=outer]');
  await hold(); await R.unhighlight();
  await R.click('.secnav [data-sec=outer]', { after: 500 });
  await hold();
  // bring the loy rows to the middle of the screen, well above the caption
  await into('#secout table tbody tr:nth-child(21)', 'center');
  await hl('#secout table tbody tr:nth-child(21)', 3);
  await say('ينبغي ألا يقل التشبع عن 0.708، وأضعف التشبعات هنا loy_3 بقيمة 0.629.', 'Loadings should be at least 0.708. The weakest here is loy_3 = 0.629.');
  await R.moveTo('#secout table tbody tr:nth-child(21) td:nth-child(3)');
  await hold();
  await say('بين 0.40 و0.70 لا تحذف المؤشر إلا إن حسّن ذلك الثبات أو AVE.', 'Between 0.40 and 0.70, delete an indicator only if that improves reliability or AVE.');
  await hold(); await R.unhighlight(); await R.hideCaption(150);
  await R.click('.secnav [data-sec=rel]', { after: 500 });
  await hl('#secout .tablewrap', 6);
  await say('ينبغي أن يكون الثبات (α، rho_A، rho_c) بين 0.70 و0.95، وألا يقل AVE عن 0.50.', 'Reliability (α, rho_A, rho_c) should lie between 0.70 and 0.95, and AVE should be at least 0.50.');
  await hold();
  await hl('#secout table tbody tr:nth-child(6)', 3);
  await R.moveTo('#secout table tbody tr:nth-child(6) td:nth-child(2)');
  await say(`ألفا كرونباخ لـ«${N.loy}» 0.638 وrho_A له 0.675، وكلاهما دون 0.70؛ أما rho_c فـ0.802 وهو مقبول.`, `${N.loy}: α = 0.638 and rho_A = 0.675 fall below 0.70; rho_c = 0.802 is acceptable.`);
  await R.wait(1400);
  await R.moveTo('#secout table tbody tr:nth-child(6) td:nth-child(3)');
  await hold();
  await R.moveTo('#secout table tbody tr:nth-child(6) td:nth-child(5)');
  await say('لذا ستعلّم قائمة التقييم ثباته للمراجعة. وكل قيم AVE فوق 0.50.', 'So the assessment checklist will flag its reliability. Every AVE is above 0.50.');
  await hold(); await R.unhighlight(); await R.hideCaption(150);
  await R.click('.secnav [data-sec=htmt]', { after: 500 });
  await hl('#secout .chartbox svg', 6);
  { const c = P.locator('#secout .chartbox svg text', { hasText: /^0\.592$/ }).first(); if (await c.count()) await R.moveTo(c); }
  await say('الصدق التمييزي: ينبغي أن تقل HTMT عن 0.85، أو 0.90 للمفاهيم المتقاربة، وأعلاها هنا 0.592.', 'Discriminant validity: HTMT should stay below 0.85 (0.90 for similar concepts). The highest here is 0.592.');
  await hold(); await R.unhighlight(); await R.hideCaption(150);
  await R.click('.secnav [data-sec=paths]', { after: 500 });
  await hl('#secout .tablewrap', 6);
  await say('ثم النموذج الهيكلي: معاملات المسار، وR² وf² في القائمة نفسها.', 'Then the structural model: path coefficients, with R² and f² in the same list.');
  await R.moveTo('.secnav [data-sec=r2]');
  await hold(); await R.unhighlight();
  await R.hideCaption(200);
  await R.click('.tabs [data-view=model]', { after: 500 });
  await say('والنتائج مرسومة على النموذج أيضاً: التشبعات ومعاملات المسار وR².', 'The estimates are also drawn on the model: loadings, path coefficients and R².');
  await R.moveXY(cb.x + cb.width * 0.55, cb.y + cb.height * 0.45);
  await hold();
  await hl('.etools [data-act=zin]', 6);
  await say('كبّر بزر + (أو Ctrl مع عجلة الفأرة)، واسحب الخلفية لتحريك الرسم.', 'Zoom in with + (or Ctrl + mouse wheel) and drag the background to pan.');
  for (let z = 0; z < 3; z++) await R.click('.etools [data-act=zin]', { after: 200, steps: z ? 6 : 24 });
  await R.unhighlight();
  // pan so that Satisfaction → Loyalty sits in the middle of the canvas
  const bs = await lv(N.sat).boundingBox(), bl = await lv(N.loy).boundingBox();
  const mx = (bs.x + bs.width / 2 + bl.x + bl.width / 2) / 2, my = (bs.y + bs.height / 2 + bl.y + bl.height / 2) / 2;
  const tx = cb.x + cb.width / 2, ty = cb.y + cb.height * 0.4;
  const sp = await emptyAt(cb.x + cb.width * 0.4, cb.y + cb.height * 0.5);
  await R.moveXY(sp.x, sp.y);
  await P.mouse.down(); await R.wait(120); await P.mouse.move(sp.x + (tx - mx), sp.y + (ty - my), { steps: 40 }); await R.wait(120); await P.mouse.up(); await R.wait(300);
  await hold();
  const lab = P.locator('#canvas text', { hasText: /^0\.356$/ }).first();
  if (await lab.count()) await R.moveTo(lab, { fx: 0.5, fy: 1.3 });
  await say(`مثلاً: معامل المسار ${N.sat} ← ${N.loy} هو 0.356، وR² لـ«${N.loy}» تحت اسمه.`, `For example, ${N.sat} → ${N.loy} is 0.356, and ${N.loy}’s R² is shown under its name.`);
  await R.wait(1800);
  await R.moveTo(lv(N.loy), { fy: 0.7 });
  await hold();
  await quiet();

  // ------------------------------------------------------- 5. bootstrapping
  await step(5, 'الإقلاع الذاتي', 'Bootstrapping');
  await R.click('#calcbtn', { after: 400 });
  await R.click('#calcmenu [data-run=bootstrap]', { after: 500 });
  await hl('#rundlg input[name=samples]', 6);
  await say('لاختبار الدلالة شغّل «الإقلاع الذاتي»: 5000 عينة فرعية، وفترات مئينية، واختبار ذو طرفين عند 0.05.', 'To test significance, run Bootstrapping: 5,000 subsamples, percentile intervals, two-tailed at 0.05.');
  await hold(); await R.unhighlight();
  await R.hideCaption(200);
  await R.moveTo('#rundlg button[type=submit]');
  await capTop(true);
  await R.click('#rundlg button[type=submit]', { after: 300 });
  // teaching captions while the run lasts (each shown only while it is still running)
  const busy = () => P.evaluate(() => !document.getElementById('busy').hidden);
  const runCaps = [
    ['يجري الحساب على جهازك، وشريط التقدم في الأسفل، ويمكنك الإلغاء متى شئت.', 'The computation runs on your computer; the progress bar is at the bottom and you can cancel at any time.', '#cancelrun'],
    ['كل عينة فرعية تُسحب بالإرجاع، ويُعاد تقدير النموذج عليها.', 'Each subsample is drawn with replacement and the model is re-estimated on it.', '#busybar'],
    ['5000 إعادة تقدير تعطي كل تقدير خطأً معيارياً وقيمة t وفترة ثقة.', '5,000 re-estimates give each estimate a standard error, a t value and a confidence interval.', null],
    ['وبذرة العشوائية ثابتة (1)، فإعادة التشغيل تعطي النتائج نفسها.', 'The random seed is fixed (1), so running it again gives the same results.', null],
    ['وعند انتهائه يُفتح لسان «النتائج» تلقائياً.', 'When it finishes, the Results tab opens by itself.', '#busybar']
  ];
  for (const [ar, en, sel] of runCaps) {
    if (!(await busy())) break;
    await say(ar, en);
    if (sel && await busy()) { try { await R.moveTo(sel, { steps: 24 }); } catch (e) { /* finished meanwhile */ } }
    while (Date.now() < due && await busy()) await R.wait(100);
  }
  await P.waitForSelector('#busy', { state: 'hidden', timeout: 180000 });
  { const w = shown + 2500 - Date.now(); if (w > 0) await R.wait(w); } // the last caption still gets its minimum reading time
  await R.hideCaption(200); due = 0;
  await capTop(false);
  await R.wait(300);
  await R.click('.secnav [data-sec=b_path]', { after: 600 });
  await hl('#secout .tablewrap', 6);
  await say('المسار دالّ إذا كانت P أقل من 0.05 ولم تتضمن فترة الثقة 95% الصفر.', 'A path is significant when P < 0.05 and the 95% confidence interval does not include zero.');
  await hold();
  await hl('#secout table tbody tr:nth-child(10)', 3);
  await R.moveTo('#secout table tbody tr:nth-child(10) td:nth-child(6)');
  await say(`المسارات العشرة كلها دالة؛ فمسار ${N.sat} ← ${N.loy} معامله 0.356 وقيمة t له 7.34.`, `All ten paths are significant; for example ${N.sat} → ${N.loy} = 0.356, t = 7.34.`);
  await hold(); await R.unhighlight(); await R.hideCaption(150);
  await R.click('.secnav [data-sec=b_specific]', { after: 600 });
  await hl('#secout .tablewrap', 6);
  await say('الآثار غير المباشرة المحددة تختبر الوساطة: كل سلسلة مسارات مع دلالتها.', 'Specific indirect effects test mediation: every chain of paths with its significance.');
  await hold();
  await hl('#secout table tbody tr:nth-child(12)', 3);
  await R.moveTo('#secout table tbody tr:nth-child(12) th', { fx: 0.3 });
  await say(`مثلاً: أثر ${N.imag} في ${N.loy} عبر ${N.sat} يبلغ 0.051 وقيمة P له 0.009، فالوساطة دالة.`, `For example ${N.imag} → ${N.sat} → ${N.loy} = 0.051, P = 0.009: a significant mediation.`);
  await hold(); await R.unhighlight();
  await quiet();

  // ------------------------------------------------------- 6. report and export
  await step(6, 'التقرير والتصدير', 'Report & export');
  await R.click('.secnav [data-sec=b_writeup]', { after: 600 });
  await hl('#secout .card', 4);
  await say('«قائمة التقييم» تفحص كل معيار وفق إرشادات Hair وآخرين (2019).', 'The assessment checklist checks every criterion against Hair et al. (2019).');
  await hold();
  await say('العلامة ✓ تعني سليم، و▲ يحتاج مراجعة، و✗ مشكلة.', 'A tick is fine, a triangle needs a look, a cross is a problem.');
  await hold();
  await hl('#secout .checklist li:nth-child(1)', 4);
  await say('▲ هنا لأربعة تشبعات دون 0.708.', 'A triangle here: four loadings below 0.708.');
  await hold();
  await hl('#secout .checklist li:nth-child(2)', 4);
  await say(`و✗ لثبات «${N.loy}»: قيمة rho_A له دون 0.70.`, `A cross for ${N.loy}’s reliability: its rho_A is below 0.70.`);
  await hold();
  await hl('#secout .checklist li:last-child', 4);
  await say('و▲ لحجم العينة: 300 أقل بقليل من 305 اللازمة لأصغر مسار.', 'And a triangle for sample size: 300 is just under the 305 needed for the smallest path.');
  await hold(); await R.unhighlight();
  await R.hideCaption(200);
  await R.scroll('#secout', 430, 16);
  await hl('#writeup', 6);
  await say('وتحتها مسودة لكتابة النتائج بأسلوب APA، مبنية على أرقامك.', 'Below it, a draft APA-style write-up built from your numbers.');
  await hold();
  await say('راجعها وكيّفها لدراستك، ثم انسخها بزر «نسخ».', 'Check it, adapt it to your study, then copy it with the Copy button.');
  await R.moveTo('#secout [data-act=copywriteup]');
  await hold(); await R.unhighlight();
  await R.hideCaption(200);
  await R.scroll('#secout', -430, 10);
  await hl('.restabs [data-act=excel]', 6);
  const exText = { ar: 'زر Excel يصدّر كل جداول التحليل إلى مصنف واحد.', en: 'Excel exports every table of the analysis to one workbook.' };
  await say(exText.ar, exText.en);
  const fx = await download('.restabs [data-act=excel]');
  if (fx) await R.caption(exText, 0, '⬇ ' + fx);
  await hold();
  await hl('.restabs [data-act=report]', 6);
  const repText = { ar: '«تصدير التقرير» يحفظ تقرير HTML كاملاً بالجداول والرسوم.', en: 'Export report saves a complete HTML report with all tables and charts.' };
  await say(repText.ar, repText.en);
  const fr = await download('.restabs [data-act=report]');
  if (fr) await R.caption(repText, 0, '⬇ ' + fr);
  await hold();
  await hl('.tbar [data-act=save]', 6);
  await R.moveTo('.tbar [data-act=save]');
  await say('البيانات والنماذج تُحفظ تلقائياً في المتصفح، واضغط «حفظ» لتنزيل ملف المشروع كاملاً مع النتائج.', 'Data and models autosave in the browser; click Save to download the full project file with its results.');
  await hold(); await R.unhighlight();
  await quiet();

  // ------------------------------------------------------- 7. examples and guide
  await step(7, 'الأمثلة والدليل', 'Examples & guide');
  await R.click('.tabs [data-view=help]', { after: 500 });
  await R.click('.secnav [data-help=examples]', { after: 600 });
  await say('في «الدليل والمصادر» ← «كل الأمثلة»: بيانات جاهزة لكل تحليل في البرنامج.', 'Guide & references → All examples: ready data for every analysis in BabPls.');
  await hold();
  await R.click('#helpout [data-help="ex:wellbeing"]', { after: 700 });
  await say('لكل مثال دليل: خطوات التشغيل، وكيف تفسّر النتيجة، وماذا يُظهر المثال.', 'Each example has a guide: how to run it, how to interpret it, and what it shows.');
  await R.wait(600);
  await into('#helpout [data-exrun="wellbeing|0"]', 'center');
  await R.moveTo('#helpout [data-exrun="wellbeing|0"]');
  await hl('#helpout [data-exrun="wellbeing|0"]', 6);
  await hold();
  await say('زر «شغّل هذا التحليل» يحمّل البيانات والنموذج ويفتح التحليل بإعداداته.', 'Run this analysis loads the data and the model and opens the analysis with its settings.');
  await hold();
  await R.unhighlight();
  await R.hideCaption(200);
  await R.click('#helpout [data-exrun="wellbeing|0"]', { after: 600 });
  await R.click('#rundlg button[type=submit]', { after: 600 });
  await R.click('.secnav [data-sec=slopes]', { after: 600 });
  await into('#secout .chartbox', 'center');
  await hl('#secout .chartbox svg', 6);
  await say('وهذه نتيجته: الميول البسيطة تُظهر كيف يخفّف الدعم أثر عبء العمل في الإجهاد.', 'And here is the result: the simple slopes show how support buffers the effect of workload on stress.');
  await hold(); await R.unhighlight();
  await R.hideCaption(200);
  await R.click('.tabs [data-view=help]', { after: 500 });
  await R.click('.secnav [data-help=start]', { after: 600 });
  await hl('#helpview .secnav', 2);
  await say('«دليل المستخدم» يشرح البيانات وبناء النموذج وكل تحليل وقراءة النتائج.', 'The user guide covers data, model building, every analysis and reporting.');
  await R.moveTo('.secnav [data-help=report]');
  await hold(); await R.unhighlight();
  await R.hideCaption(200);
  await R.click('.secnav [data-help=methods]', { after: 600 });
  await say('و«المنهجيات» تعرض صيغة كل طريقة ومصادرها، مع نحو 90 مرجعاً.', 'Methods shows the formulas and sources of each method, with about 90 references.');
  await R.scroll('#helpout', 500, 18);
  await hold();
  await quiet();
  await R.step('');

  // ------------------------------------------------------------------ end card
  await R.card(R.T({
    ar: `<img class="anim" src="assets/logo.svg"><h1 class="anim">BabPls</h1><h2 class="anim">جرّبه الآن على بياناتك</h2><div class="pills anim"><span>مجاني ومفتوح المصدر (MIT)</span><span>يعمل في المتصفح</span><span>ويندوز وماك ولينكس</span></div><div class="url anim">motqenacademy-droid.github.io/babpls</div><p class="anim">تصميم: د. أحمد يوسف</p>`,
    en: `<img class="anim" src="assets/logo.svg"><h1 class="anim">BabPls</h1><h2 class="anim">Try it now with your own data</h2><div class="pills anim"><span>Free &amp; open source (MIT)</span><span>Runs in your browser</span><span>Windows, macOS, Linux</span></div><div class="url anim">motqenacademy-droid.github.io/babpls</div><p class="anim">Designed by Dr. Ahmed Youssef</p>`
  }), 4200);

  const res = await R.finish();
  console.log(JSON.stringify({ out: res.out, seconds: Math.round(res.seconds), frames: res.frames, errors: res.errors }));
})().catch(e => { console.error(e); process.exit(1); });
