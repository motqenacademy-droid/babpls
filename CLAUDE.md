# BabPls — تعليمات المشروع لـ Claude Code

> **لصاحب المشروع (فتح جلسة محلية):** انسخ المستودع ثم شغّل Claude Code داخله، فيقرأ هذا الملف تلقائياً:
> `git clone https://github.com/motqenacademy-droid/babpls.git && cd babpls && claude`
> يلزم Node 22 فأحدث. اختبار المتصفح يحتاج Playwright، وسطح المكتب يحتاج `npm ci` داخل `desktop/`.

BabPls (اسمه السابق YouPls حتى 0.7.0) برنامج مجاني مفتوح المصدر (MIT) لنمذجة المعادلات الهيكلية: PLS-SEM وCB-SEM وكل
تحليلات SmartPLS 4 Enterprise وأكثر. يعمل في المتصفح بلا خادم ولا بناء، وكتطبيق ويب قابل للتثبيت (PWA)، وكتطبيق سطح مكتب
(Electron) لويندوز وماك ولينكس، ومعه حزمة لمتجر مايكروسوفت. المصمم وصاحب الفكرة: **د. أحمد يوسف**.

- الموقع: https://motqenacademy-droid.github.io/babpls/ (GitHub Pages من `main` عبر `pages.yml`)
- المستودع: https://github.com/motqenacademy-droid/babpls (عام). التنزيلات: صفحة Releases.
- الإصدار الحالي: **0.10.0**.

## أين يوجد ماذا
| المسار | المسؤولية |
|---|---|
| `index.html`, `css/app.css` | الصفحة الواحدة والتصميم (الألوان متغيرات على `:root`، وضع داكن) |
| `js/engine.js` | المحرّك (UMD، يعمل في المتصفح وNode): PLS-SEM، PLSc، WPLS، bootstrap (BCa)، blindfolding، PLSpredict، IPMA، MGA/MICOM، NCA، الانحدار، CCA (Bollen–Stine)، GoF |
| `js/advanced.js` | CB-SEM (ML بـBFGS وتدرّج تحليلي، أخطاء من المعلومات المتوقعة، MI/EPC)، FIMIX، POS، CTA، الكوبولا، PROCESS 1/4/6/7/14 |
| `js/advanced2.js` | GSCA، اللوجستي، CVPAT، MGA الكامل (Henseler/بارامتري/Welch)، حجم العينة |
| `js/advanced3.js` | بيانات من مصفوفة تغاير/ارتباط، CB-SEM متعدد المجموعات (الثبات الشكلي/المتري/العددي)، CB-SEM بالتفاعل، مقارنة النماذج |
| `js/io.js` | قراءة xlsx وsav (SPSS، مع القاموس: `readSAV`) وكتابة xlsx وsav (`writeSAV`) |
| `js/data.js` | محرّك البيانات القابلة للتحرير (UMD): المتغيرات بخصائصها (النوع، مستوى القياس، تسميات القيم، المفقود المعرَّف)، `toDS` يبني `S.ds` للتحليلات، لغة التعبيرات (بلا eval)، كل تحويلات قائمة «تحويل» |
| `js/dataview.js` | محرّر البيانات: عرض البيانات (جدول افتراضي)، عرض المتغيرات، القوائم والحوارات، التراجع والإعادة؛ يتصل بـ app.js عبر `YPDataView.create(app)` |
| `js/stats.js` + `js/ui-stats.js` | إحصاء JASP (أ): الوصفي، الطبيعية (شابيرو–ويلك، ليليفورس، أندرسون–دارلنغ)، اختبارات t ومقابلاتها اللامعلمية، ANOVA/ANCOVA/القياسات المتكررة/MANOVA والمقارنات البعدية، كروسكال–واليس، فريدمان؛ دوال توزيع دقيقة في `E.st` |
| `js/stats2.js` + `js/ui-stats2.js` | إحصاء JASP (ب): الارتباطات، الانحدار الهرمي والمتعدد الحدود والترتيبي، التكرارات وجداول التوافق، الثبات وICC، EFA/PCA بالتدويرات، الاختبارات البيزية، التحليل البعدي |
| `js/amos.js` + `js/ui-amos.js` | CB-SEM بأسلوب AMOS: ML/GLS/ULS/SLS/ADF/FIML، صيغة نصية (أخطاء مترابطة، قيود، مقدَّرات معرَّفة)، كل جداول المطابقة، الطبيعية (ماردیا، ماهالانوبيس)، بولن–ستاين، المجموعات المتعددة المتداخلة، منحنى النمو الكامن |
| `js/process2.js` + `js/ui-process.js` | PROCESS لهايز: النماذج 1–22، 28، 29، 58–76، 80–92 (المهمة `hayes`)؛ `process` القديمة باقية لأدلة الأمثلة ومخفية من القائمة |
| `js/charts.js`, `js/editor.js` | الرسوم (SVG بلا مكتبات) ومحرّر النموذج وأنماطه |
| `js/app.js` | الواجهة: البيانات، النماذج المتعددة (`S.models`)، نافذة التشغيل (`TASKS`)، التقارير، التصدير، معرض الأمثلة |
| `js/i18n.js` | نصوص الواجهة **بالعربية والإنجليزية**؛ كل مفتاح في اللغتين (`tests/i18n.test.js`) |
| `js/docs.js` | دليل المستخدم، الطرائق والصيغ، ~90 مرجعاً، «عن البرنامج» |
| `js/examples.js` | أدلة الأمثلة ثنائية اللغة (التشغيل، التفسير، ما يظهر) لكل تحليل |
| `js/example-data.js` | **مولَّد** من `tools/make_examples.js` (لا يُحرَّر يدوياً) |
| `js/worker.js`, `sw.js`, `manifest.webmanifest` | عامل الحساب، وتخزين PWA المؤقت، وبيان التطبيق |
| `examples/` | تسع مجموعات بيانات مصطنعة ونماذجها |
| `desktop/` | Electron: `main.js` (بروتوكول `app://`، `--smoke`)، `build.js` (توقيع شرطي + appx)، `prepare.js` |
| `tools/` | مولّدات الأمثلة، ومراجع التحقق بـPython (NumPy، semopy، statsmodels، openpyxl/pyreadstat) |
| `tests/` | اختبارات Node، و`browser_smoke.js` (Playwright) |
| `STORE.md`, `SIGNING.md`, `CODE_SIGNING_POLICY.md`, `PRIVACY.md` | المتجر والتوقيع والخصوصية |

## الأوامر
```bash
npm test                                   # كل اختبارات Node (172) — يجب أن تنجح قبل أي التزام
python3 -m http.server 8765                # تشغيل التطبيق محلياً: http://127.0.0.1:8765/
node tests/browser_smoke.js                # (والخادم السابق يعمل) يشغّل كل التحليلات وكل أمثلة المعرض في Chromium
node tools/make_examples.js                # يعيد توليد examples/*.csv و js/example-data.js
cd desktop && npm ci && npm start          # تطبيق سطح المكتب محلياً؛ npm run smoke للفحص
```

## قواعد ثابتة
- **بلا بناء ولا اعتماديات** في التطبيق: JavaScript خالص، ولا مكتبات خارجية ولا CDN ولا تتبّع. البيانات لا تغادر جهاز المستخدم.
- **الإضافات** (`window.YP_PLUGINS` في `js/ui-*.js`، والمحرّك `E.tasks[kind]`): انظر التعليق فوق `PLUGINS` في app.js. كل اختبار له مدخل منهجية فيه `origin` بالعربية والإنجليزية وصيغة MathML صحيحة (`<math display="block">`)، فيظهر زر «!» تلقائياً. كل اختبار جديد يُتحقق منه مقابل مرجع مستقل (`tools/reference_*.py` ← `tests/fixtures/*.json`).
- **مخرجات APA 7 افتراضياً** (`charts.js` المنسّق، `table()`/`chart()` في app.js): لا تتجاوز الإضافات `UI.table`/`UI.card`/`UI.chart`.
- **كل نص جديد في الواجهة** يُضاف إلى `ar` و`en` في `js/i18n.js` بالمفتاح نفسه.
- **كل ملف جديد يحمّله `index.html` أو `worker.js`** يُضاف إلى `FILES` في `sw.js` (يحرسه `tests/pwa.test.js`).
- **رفع الإصدار** يكون في كل هذه معاً: `package.json`، `desktop/package.json`، `desktop/package-lock.json` (موضعان)، `js/docs.js`، `VERSION` في `sw.js`.
- **البيانات**: مصدرها `S.data` (js/data.js) لا نص CSV؛ أي تعديل يمرّ بمعاملة `tx()` في dataview.js (للتراجع) ثم `app.changed` يعيد بناء `S.ds`. المشروع يحفظ `data.csv` (قيم خام) و`data.meta` (القاموس والتصفية)، والمشاريع القديمة بلا `meta` تُقرأ كما كانت. مقارنة التحويلات بمراجع pandas/scipy في `tools/reference_data.py` ← `tests/fixtures/data.json`.
- **أي رقم في أدلة الأمثلة** (`js/examples.js`) يتحقق منه `tests/examples.test.js`؛ إن تغيّر المحرّك أو البيانات فحدّث الاثنين معاً.
- **التحقق العددي**: التعديل في المحرّك يُقارن بالمراجع في `tests/fixtures/` (أُنتجت بأدوات `tools/reference_*.py`). لا تُرخِ حدود السماح لتمرير اختبار.
- **التوافق مع الاسم القديم**: تبقى قراءة مفاتيح `youpls.*` في التخزين وصيغة `format: 'youpls'` و`.youpls.json`، ويبقى مضيف `app://youpls` في `desktop/main.js` (التخزين مرتبط بالأصل؛ تغييره يمسح مشاريع المستخدمين).
- **الأسرار** (شهادات التوقيع وكلمات سرها) في GitHub repository secrets فقط؛ لا تُكتب في ملف ولا محادثة. متغيرات `APPX_*` ليست أسراراً (repository variables).
- **الالتزامات** باسم صاحب المشروع: `git -c user.name="Motqen Academy" -c user.email="motqenacademy@gmail.com" commit`. لا دفع ولا Pull Request إلا بطلبه.
- أسماء الملفات المنزَّلة ASCII فقط (`slug()` في app.js)، وعناصر `[hidden]` محمية بقاعدة CSS عامة.

## الإصدار والنشر
- الموقع يُنشر تلقائياً عند الدفع إلى `main` (`pages.yml`).
- `test.yml` يشغّل `npm test` على كل دفع.
- `desktop.yml` يدوي (Actions → desktop → Run workflow): يبني على ويندوز وماك ولينكس، ويختبر بـ`--smoke`، ثم ينشئ Release باسم `v<version>`
  فيه Setup وPortable وDMG وAppImage، ويرفع `store-package` (appx) منفصلاً. الحزم غير موقّعة (ويندوز)، وماك موقّع ad-hoc.

## الحالة والمهام المفتوحة (2026-11-05)
- **بناء سطح المكتب**: يعمل. فشلت تشغيلات v0.7.0 – v0.8.0 على ويندوز بسبب نهايات أسطر CRLF في ملفات الأمثلة، وأُصلح
  (`tests/examples.test.js` و`.gitattributes`)؛ نجح التشغيل 11 ونُشر Release v0.8.1 بملفاته الخمسة (2026-11-05).
- **متجر مايكروسوفت**: على صاحب المشروع التسجيل (فرد، مجاناً) في https://storedeveloper.microsoft.com، وحجز الاسم **BabPls**، ثم ضبط
  المتغيرات `APPX_IDENTITY_NAME` و`APPX_PUBLISHER` و`APPX_PUBLISHER_DISPLAY_NAME` وتشغيل `desktop.yml`. الخطوات في `STORE.md`.
- **التوقيع**: رُفض طلب SignPath Foundation لقلة شهرة المشروع؛ يُعاد التقديم لاحقاً (`SIGNING.md`).
- **رابط الموقع الجديد** `…/babpls/` يحتاج تأكيداً بعد إعادة تسمية المستودع (Settings → Pages).
