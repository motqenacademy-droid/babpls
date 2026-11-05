# BabPls promo video · الفيديو الدعائي

| | |
|---|---|
| Files | `media/BabPls-promo-ar.mp4`, `media/BabPls-promo-en.mp4` (1920×1080, 30 fps, H.264, no audio track) + `.srt` subtitles (every in-app caption and the headline of every title card, with the URL on the end card) + `-thumb.png` thumbnails (the hook card) |
| Length | AR 85.3 s, EN 86.2 s |
| Source | `tools/video/promo.js` (Playwright + `tools/video/rec.js`); real app, example "Customer satisfaction and loyalty (ECSI)" |
| Re-render | `cd babpls && (python3 -m http.server 8771 >/dev/null 2>&1 &)` then `node tools/video/promo.js ar 8771` and `node tools/video/promo.js en 8771` |

Recording is real time; two waits are cut out after encoding (frame-exact: the script shows a magenta marker in the
bottom-left corner while a cut is on, and the frames carrying it are dropped): the 5,000-sample bootstrap run, and the
CB-SEM run between its Calculate-menu entry and the fit table. The first frames (before the hook card) are cut the same way, so frame 0
is the title card. The .srt is re-anchored at the end of each cut. A busy machine can stretch scenes by a few seconds; the
two renders above were made on a shared machine and both stay between 60 and 90 s.

## Scenes · المشاهد

Times are from the Arabic render; the English one is within ±1 s per scene.

| # | Time (AR) | On screen | Caption EN | الشرح بالعربية |
|---|---|---|---|---|
| 1 | 00:00–00:03 | Title card (opaque from frame 0): logo, BabPls, promise, tag PLS-SEM · CB-SEM | (card) BabPls: Structural equation modeling. Free, right in your browser. | (بطاقة) BabPls: نمذجة المعادلات الهيكلية… مجاناً وفي متصفحك |
| 2 | 00:04–00:07 | The pointer heads for the gallery button while the card fades; example gallery, ECSI card highlighted | Nine ready-made examples covering every analysis | تسعة أمثلة جاهزة تغطي التحليلات كلها |
| 3 | 00:07–00:10 | “Load data and models”: the path model opens; the diagram is panned up so the lowest indicators clear the caption | One click loads the data and the model | نقرة واحدة تحمّل البيانات والنموذج |
| 4 | 00:10–00:13 | Calculate menu highlighted, pointer on Bootstrapping | Over twenty analyses in one menu | أكثر من عشرين تحليلاً في قائمة واحدة |
| 5 | 00:13–00:15 | Bootstrapping dialog; the samples field (default 5000, unchanged) highlighted | Bootstrapping with 5,000 samples by default | الإقلاع الذاتي بخمسة آلاف عينة افتراضياً |
| 6 | 00:16–00:18 | Start → the progress strip (shown at 1.5× for this shot) highlighted, caption at the top; the rest of the run is cut | Live progress, and you can cancel any time | شريط تقدّم حيّ، ويمكنك الإلغاء متى شئت |
| 7 | 00:20–00:23 | Camera zoom (×1.4, report column only: section list and tabs stay put) on the assessment checklist; the frame is placed once the zoom has settled | An automatic checklist flags the weak spots | قائمة تقييم آلية تنبّهك إلى مواطن الضعف |
| 8 | 00:24–00:27 | Scroll to the APA write-up, highlighted (mentions 5000 subsamples) | And a ready-made APA-style write-up | وفقرة نتائج جاهزة بأسلوب APA |
| 9 | 00:29–00:35 | Path coefficients → the Image → Loyalty row is highlighted and clicked → zoom on its bootstrap histogram | Click a path to see its bootstrap distribution | انقر على مسار لترى توزيع الإقلاع الذاتي وفترة الثقة |
| 10 | 00:36–00:39 | Model tab: bootstrap coefficients (p-values) and R² on the canvas; the pointer rests on empty canvas | Coefficients and p-values on the path model | المعاملات وقيم p على نموذج المسار نفسه |
| 11 | 00:40–00:45 | Calculate → IPMA dialog (the caption comes with it), target construct Value → zoom on the importance-performance map | IPMA shows what to improve first | خريطة الأهمية والأداء تكشف أولويات التحسين |
| 12 | 00:46–00:52 | Calculate menu → CB-SEM (maximum likelihood) → dialog → (run cut) Model fit (CB-SEM) table, rows χ² … NFI highlighted | CB-SEM too, with a full set of fit indices | وفيه أيضاً CB-SEM بمؤشرات مطابقة كاملة |
| 13 | 00:52–00:58 | Back to the Bootstrapping report → Excel is clicked (a chip shows the exported file name) → Export report (HTML) is clicked and the exported file is shown in a window for ~2 s | Export everything to Excel or an HTML report | صدّر كل النتائج إلى Excel أو تقرير HTML |
| 14 | 00:59–01:04 | Appearance dialog, preset row highlighted → “Classic” preset → close; the restyled diagram is held | Restyle diagrams: presets, colors, fonts | نسّق الرسم كما تشاء: قوالب وألوان وخطوط |
| 15 | 01:05–01:07 | One click on the theme button → dark mode (caption after the change) | And a comfortable dark mode | ووضع داكن مريح للعين |
| 16 | 01:08–01:12 | Language button: the other UI language held ~1.6 s (the pointer follows the mirrored button), then back | A full interface in English and Arabic | واجهة كاملة بالعربية والإنجليزية |
| 17 | 01:13–01:17 | Card: headline, 20 analysis pills, SmartPLS line and the independence note (26 px) | (card) From PLS-SEM to CB-SEM, all in one app | (بطاقة) من PLS-SEM إلى CB-SEM في برنامج واحد |
| 18 | 01:18–01:21 | Card: free, open source, data stays on the device; MIT, browser, no accounts, web app, Windows · macOS · Linux | (card) Free. Open source. Your data never leaves your device. | (بطاقة) مجاني ومفتوح المصدر، وبياناتك لا تغادر جهازك |
| 19 | 01:21–01:24 | End card: logo, CTA, URL, “Designed by Dr. Ahmed Youssef” | (card) Open it now. No sign-up, no install. + URL | (بطاقة) افتحه الآن، بلا تسجيل ولا تثبيت + الرابط |

Recording-only tweaks (no app code is changed): the report's meta line (run date and the recording's clock time) is hidden
with an injected style; the camera zoom wraps the report column's content in a scaled `<div>`; downloads are observed in the
page (file name and blob of each `<a download>`), so the Excel chip and the HTML preview show the real exported files; the
English project title is scrolled to its start in the RTL title field; every line of the Arabic .srt starts with U+200F (RLM).

## Narration script (EN) — voice-over, ≈ 160 words

> Read at a lively pace; each paragraph matches a scene group. Pauses (…) let the visual land.

1. **(hook, 0–4 s)** BabPls. Structural equation modeling — free, right in your browser.
2. **(examples)** Start right away: nine ready-made examples cover every analysis. One click loads the data and the path model.
3. **(bootstrap)** Over twenty analyses sit in one menu. Bootstrapping uses 5,000 samples by default, with live progress you can cancel…
4. **(report)** …then an automatic checklist flags the weak spots, and an APA-style write-up is ready to adapt for your paper. Click any path to see its bootstrap distribution and confidence interval.
5. **(model, IPMA, CB-SEM)** Coefficients and p-values appear right on your model. The importance-performance map shows what to improve first. CB-SEM is there too, with a full set of fit indices.
6. **(export, style)** Export everything to Excel or an HTML report. Restyle your diagram with presets, colors and fonts, switch to dark mode, and work in English or Arabic.
7. **(features)** PLS-SEM, consistent PLS, PLSpredict, IPMA, multigroup analysis, NCA, CB-SEM, FIMIX, PROCESS — from PLS-SEM to CB-SEM, all in one app. (BabPls is an independent project, not affiliated with SmartPLS GmbH.)
8. **(values)** Free. Open source. Your data never leaves your device. Use it in the browser, install it as a web app, or download it for Windows, macOS and Linux.
9. **(end)** Open BabPls now — no sign-up, no install. Designed by Dr. Ahmed Youssef.

## نص التعليق الصوتي (عربي) — نحو 150 كلمة

> يُقرأ بإيقاع حيوي؛ كل فقرة لمجموعة مشاهد.

1. **(الافتتاح)** BabPls… نمذجة المعادلات الهيكلية، مجاناً وفي متصفحك.
2. **(الأمثلة)** ابدأ فوراً: تسعة أمثلة جاهزة تغطي التحليلات كلها، ونقرة واحدة تحمّل البيانات ونموذج المسار.
3. **(الإقلاع الذاتي)** أكثر من عشرين تحليلاً في قائمة واحدة، والإقلاع الذاتي بخمسة آلاف عينة افتراضياً، بشريط تقدّم حيّ يمكنك إيقافه متى شئت…
4. **(التقرير)** …ثم تنبّهك قائمة تقييم آلية إلى مواطن الضعف، وتجد فقرة نتائج جاهزة بأسلوب APA تكيّفها لبحثك. وانقر على أي مسار لترى توزيع الإقلاع الذاتي وفترة الثقة.
5. **(النموذج وIPMA وCB-SEM)** المعاملات وقيم p تظهر على النموذج نفسه، وخريطة الأهمية والأداء تكشف ما تحسّنه أولاً، وفيه أيضاً CB-SEM بمؤشرات مطابقة كاملة.
6. **(التصدير والمظهر)** صدّر كل النتائج إلى Excel أو تقرير HTML، ونسّق الرسم بالقوالب والألوان والخطوط، وانتقل إلى الوضع الداكن، واعمل بالعربية أو الإنجليزية.
7. **(المزايا)** PLS-SEM، وPLS المتّسقة، وPLSpredict، وخريطة الأهمية والأداء، والتحليل متعدد المجموعات، وتحليل الشرط الضروري، وCB-SEM، وFIMIX، وPROCESS… من PLS-SEM إلى CB-SEM في برنامج واحد. (BabPls مشروع مستقل لا صلة له بشركة SmartPLS GmbH.)
8. **(القيم)** مجاني ومفتوح المصدر، وبياناتك لا تغادر جهازك. استعمله في المتصفح، أو ثبّته تطبيقَ ويب، أو نزّله لويندوز وماك ولينكس.
9. **(الختام)** افتح BabPls الآن، بلا تسجيل ولا تثبيت. تصميم د. أحمد يوسف.

## Title cards · البطاقات

| Card | EN | AR |
|---|---|---|
| Hook | BabPls — Structural equation modeling. Free, right in your browser. · tag PLS-SEM · CB-SEM | BabPls — نمذجة المعادلات الهيكلية… مجاناً وفي متصفحك |
| Features | From PLS-SEM to CB-SEM, all in one app · 20 pills (PLS-SEM, PLSc, Bootstrapping (BCa), Blindfolding Q², PLSpredict, CVPAT, IPMA, MGA + MICOM, NCA, CCA, CTA-PLS, CB-SEM, Measurement invariance, GSCA, FIMIX-PLS, PLS-POS, Gaussian copula, PROCESS, Logistic regression, Sample size) · "Covers the software features of SmartPLS 4 Enterprise, and more" · note (26 px) "BabPls is an independent project, not affiliated with SmartPLS GmbH" | من PLS-SEM إلى CB-SEM في برنامج واحد · الأقراص نفسها، وفيها «الإقلاع الذاتي (BCa)» و«الطيّ الأعمى Q²» · «يغطي مزايا SmartPLS 4 Enterprise البرمجية، وأكثر» (صيغة README) · سطر «BabPls مشروع مستقل لا صلة له بشركة SmartPLS GmbH» |
| Values | Free. Open source. Your data never leaves your device. · MIT license · Runs in the browser, no server · No accounts, no tracking · Installs as a web app · Windows · macOS · Linux | مجاني ومفتوح المصدر، وبياناتك لا تغادر جهازك · رخصة MIT · يعمل في المتصفح بلا خادم · بلا حسابات ولا تتبّع · يُثبَّت كتطبيق ويب · Windows · macOS · Linux |
| End | BabPls · Open it now. No sign-up, no install. · motqenacademy-droid.github.io/babpls · Designed by Dr. Ahmed Youssef | افتحه الآن، بلا تسجيل ولا تثبيت · تصميم د. أحمد يوسف |

## Fact check · مصادر الادعاءات

- Nine examples, every analysis: `js/examples.js` (9 sets; the gallery button reads "Example datasets for every analysis").
- Over twenty analyses: 22 entries in the Calculate menu (`index.html`).
- Background computation with progress bar: `js/worker.js`, `#busy` in `index.html` (README: worker + progress bar + cancel).
- Checklist and APA write-up: `bootSections` in `js/app.js` (`assessment`, `writeup`). The demo keeps the default 5000 samples; the wait is cut from the video.
- Excel / HTML report: `exportExcel`, `exportReport` in `js/app.js`.
- Appearance presets, dark theme, Arabic/English: `js/app.js` (`styleBody`, `#theme`, `#lang`), `js/i18n.js`.
- "Covers the software features of SmartPLS 4 Enterprise" (softened from README's "every"; `js/docs.js` lists caveats such as simplified POS): README ("New in 0.5 — every software feature of SmartPLS 4 Enterprise"; «تغطية كل مزايا SmartPLS 4 Enterprise البرمجية»). BabPls is independent of SmartPLS GmbH (`js/docs.js` about page); no SmartPLS logos or screenshots are used.
- Free, MIT, no server, no accounts, no tracking, data stays on the device: `js/docs.js` about page, README, `PRIVACY.md`.
- Web app install and desktop builds for Windows, macOS, Linux: README "Download", `desktop/`.
