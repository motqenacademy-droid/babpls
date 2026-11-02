# YouPls

**برنامج مجاني مفتوح المصدر (MIT) لنمذجة المعادلات الهيكلية بالمربعات الصغرى الجزئية (PLS-SEM)، يعمل في المتصفح بلا تثبيت ولا خادم، وبياناتك لا تغادر جهازك.**
واجهته بالعربية والإنجليزية، وفيه تحليلات PLS-SEM الشائعة ورسوماتها.

> YouPls مشروع مستقل، لا صلة له بشركة SmartPLS GmbH ولا ببرنامجها. الاسم «SmartPLS» يُذكر هنا للمقارنة فقط.

[English below ↓](#english)

## التشغيل

- **على الإنترنت مباشرة:** https://motqenacademy-droid.github.io/youpls/

- **أبسط طريقة:** افتح `index.html` في المتصفح مباشرة. كل شيء يعمل، لكن بعض المتصفحات تمنع «العامل الخلفي» (Web Worker) لملفات `file://`، فتُحسب التحليلات في الصفحة نفسها وقد تتجمّد الواجهة لحظات في الإقلاع الذاتي الطويل.
- **الطريقة الموصى بها:** خادم محلي، فتُحسب التحليلات الثقيلة في الخلفية مع شريط تقدّم وزرّ إلغاء:
  ```bash
  python3 -m http.server 8765
  ```
  ثم افتح <http://127.0.0.1:8765>.
- للنشر على استضافة أخرى: ارفع المستودع كما هو إلى أي استضافة ملفات ثابتة (GitHub Pages أو Netlify أو Cloudflare Pages…). لا يحتاج بناءً ولا مكتبات.

## الجديد في 0.2

- **المظهر:** قوالب جاهزة (كلاسيكي، أسود وأبيض للمجلات، باستيل، غابة، تباين عالٍ، صناديق)، وتحكّم كامل في الخطوط والألوان والأشكال (بيضاوي/مستطيل/مدوّر) والأحجام وأنماط الأسهم، لكل الرسم أو لعنصر واحد، ولوحات ألوان للرسوم البيانية منها لوحة ملائمة لعمى الألوان وأخرى رمادية، وتصدير النموذج SVG أو PNG بدقة عالية.
- **الدليل والمصادر:** دليل مستخدم كامل بالعربية والإنجليزية، وصفحة «المنهجيات» فيها صيغة كل إحصاءة ومصادرها (45 مرجعاً بصيغة APA)، وزرّ 📖 بجانب كل جدول نتائج يفتح صيغته ومصدره، وصفحة «عن البرنامج» مع طريقة الاستشهاد به.

## خطوات العمل

1. **البيانات:** استورد ملف CSV (الصف الأول أسماء المتغيرات؛ الفاصل `,` أو `;` أو Tab؛ الفاصلة العشرية `,` مقبولة؛ الخلايا الفارغة و`NA` و`-99` تُعدّ مفقودة؛ الأعمدة النصية تُعدّ فئوية للمقارنة بين المجموعات). تظهر الإحصاءات الوصفية ومصفوفة الارتباط وتوزيع كل متغير.
2. **النموذج:** أداة «متغير كامن» ثم انقر على اللوحة، واسحب المؤشرات من القائمة إليه (أو إلى مساحة فارغة فيُنشأ متغير باسم بادئتها)، أو زرّ «أنشئ المتغيرات الكامنة من بادئات الأسماء» لأسماء مثل `sat_1, sat_2`. أداة «مسار»: انقر المصدر ثم الهدف. اختر لكل متغير: انعكاسي (Mode A) أو تكويني (Mode B). للتعديل (Moderation) حدّد مساراً ثم «أضف أثراً معدِّلاً». تراجع/إعادة (Ctrl+Z / Ctrl+Y)، ترتيب تلقائي، تكبير، تصدير صورة SVG.
3. **احسب:** من قائمة «احسب». تظهر القيم على النموذج نفسه (معاملات المسار و p في الإقلاع الذاتي، وR² داخل المتغيرات، والتشبعات على الأسهم).
4. **النتائج:** كل جدول يُنزَّل CSV أو يُنسخ للصقه في Excel، وكل رسم يُنزَّل SVG أو PNG، والتقرير كاملاً HTML (يُطبع PDF من المتصفح).
5. **الحفظ:** يُحفظ المشروع تلقائياً في المتصفح، و«حفظ» ينزّل ملف `.youpls.json` فيه البيانات والنموذج معاً.

## التحليلات المتاحة

| التحليل | ما يُحسب |
|---|---|
| **خوارزمية PLS-SEM** (مخطط المسار/العامل/المركزي) | الأوزان والتشبعات الخارجية، معاملات المسار، الآثار الكلية وغير المباشرة (الكلية والمحددة)، R² وR² المعدَّل، f²، ارتباطات المتغيرات الكامنة ودرجاتها |
| **معايير الجودة** | ألفا كرونباخ، ρA (Dijkstra-Henseler)، ρc (الثبات المركب)، AVE، فورنل-لاركر، HTMT، التشبعات المتقاطعة، VIF للقياس وللنموذج الهيكلي، SRMR وd_ULS وd_G وChi² وNFI (المشبَع والمقدَّر)، AIC وBIC وHQ |
| **PLS المتّسقة (PLSc)** | تصحيح المتغيرات الانعكاسية من خطأ القياس |
| **الإقلاع الذاتي** | الانحراف المعياري وT وp (طرف أو طرفان) وفترات الثقة المئينية أو BCa لكل المعلمات أعلاه، مع مدرّج توزيع كل معلمة ومخطط فترات الثقة |
| **الطيّ الأعمى** | Q² (الإطناب المتحقق منه تقاطعياً) وQ² الاشتراكيات |
| **PLSpredict** | Q²predict وRMSE وMAE لكل مؤشر مقارنةً بمعيار الانحدار الخطي (LM)، وتوزيعات الأخطاء |
| **IPMA** | خريطة الأهمية والأداء للمتغيرات والمؤشرات |
| **MGA + MICOM** | اختبار التباديل للفروق بين مجموعتين، وثبات التركيب والمتوسطات والتباينات |
| **التعديل (Moderation)** | طريقة المرحلتين، مع تحليل الميول البسيطة |
| **NCA** | حجم أثر الضرورة d بخط السقف CE-FDH، واختبار التباديل، وجداول الاختناق |
| **الانحدار (OLS)** | المعاملات المعيارية وغير المعيارية والأخطاء المعيارية وt وp وVIF وR² وF ومخطط البواقي |
| **النماذج الهرمية** | بطريقة «المؤشرات المكرّرة»: أسند المؤشرات نفسها إلى المتغير الأعلى رتبة |

### غير متاح بعد (خارطة الطريق)

CB-SEM (نمذجة التغاير)، تحليل التصنيف الكامن (FIMIX-PLS وPOS)، تحليل CTA-PLS، الانحدار بطريقة PROCESS، الترجيح الموزون (Weighted PLS)، اختبار التماثل الداخلي بطريقة Gaussian copula، المتغيرات الكامنة التكرارية غير الخطية. المساهمات مرحّب بها.

## الدقة والتحقق

- خوارزمية PLS-SEM تطابق تنفيذاً مستقلاً بـNumPy (`tools/reference_pls.py`) حتى 10⁻⁶ في الأوزان والتشبعات والمسارات وR²، بمخططات المسار والعامل والمركزي وبـMode B (`tests/fixtures/reference.json`).
- الاختبارات تتحقق كذلك من صيغ الثبات وHTMT وتحليل الآثار ودوال التوزيع وتكرار الإقلاع الذاتي ببذرة ثابتة وPLSc والتعديل وسائر التحليلات.
- معايير الإيقاف: 10⁻⁷ على تغيّر الأوزان، و3000 تكرار على الأكثر، والأوزان الابتدائية 1 (كالمعتاد في برامج PLS-SEM).
- قد تختلف أرقام قليلة اختلافاً طفيفاً عن برامج أخرى حيث تتعدد التعاريف: HTMT يستعمل القيم المطلقة للارتباطات، وp في الإقلاع الذاتي من توزيع t بدرجات حرية (عدد العينات − 1)، وQ² في الطيّ الأعمى بإحلال المتوسط.

## للمطوّرين

```bash
npm test                      # اختبارات المحرّك والترجمة (Node 18+، بلا تبعيات)
node tests/browser_smoke.js   # اختياري: يحتاج Playwright وخادماً على 8765
node tools/make_example.js    # يعيد توليد بيانات المثال
python3 tools/reference_pls.py > tests/fixtures/reference.json   # يحتاج numpy
```

| الملف | المسؤولية |
|---|---|
| `js/engine.js` | كل الحسابات (يعمل في المتصفح وفي Node): قراءة CSV، PLS/PLSc، معايير الجودة، الإقلاع الذاتي، الطيّ الأعمى، PLSpredict، IPMA، MGA/MICOM، NCA، الانحدار |
| `js/worker.js` | يشغّل المحرّك في الخلفية |
| `js/editor.js` | لوحة رسم النموذج (SVG) |
| `js/charts.js` | الرسوم البيانية (SVG بلا مكتبات) |
| `js/app.js` | الواجهة: البيانات والنموذج والنتائج والتصدير |
| `js/i18n.js` | نصوص الواجهة بالعربية والإنجليزية (كل مفتاح في اللغتين؛ يحرسه `tests/i18n.test.js`) |
| `examples/` | بيانات مثال مصطنعة (رضا العملاء، 300 حالة) ونموذجها |

بيانات المثال **مولَّدة** من نموذج معروف (`tools/make_example.js`) فلا قيود ترخيص عليها، وفيها متغير `gender` بفرق مقصود بين المجموعتين لتجربة MGA.

---

<a id="english"></a>
## English

**YouPls** is a free, open-source (MIT) PLS-SEM application that runs entirely in the browser — no installation, no server, your data never leave your machine. Arabic and English UI.

> YouPls is an independent project and is not affiliated with SmartPLS GmbH. "SmartPLS" is mentioned for comparison only.

**Online:** https://motqenacademy-droid.github.io/youpls/ · **Run it locally:** open `index.html`, or (recommended, enables background computation with progress/cancel) `python3 -m http.server 8765` and browse to <http://127.0.0.1:8765>. Every push to `main` runs the tests and redeploys GitHub Pages; any other static host works too.

**New in 0.2:** appearance presets and full control of fonts, colours, shapes, sizes and arrow styles (whole diagram or single elements), chart palettes (incl. colour-blind safe and greyscale), high-resolution PNG/SVG model export; a bilingual user guide, a methods page with the formula and APA references for every statistic (45 sources), 📖 links from every results table, and an About page with citation info.

**Workflow:** import a CSV → draw constructs, drag indicators onto them (or auto-create constructs from name prefixes) → connect paths, choose reflective/formative, add moderating effects → *Calculate* → results are overlaid on the model and listed in report sections; every table exports to CSV/clipboard, every chart to SVG/PNG, and the whole report to HTML. Projects autosave in the browser and save/open as `.youpls.json` (data + model).

**Analyses:** PLS-SEM (path/factor/centroid weighting; loadings, weights, path coefficients, total/indirect/specific indirect effects, R², adjusted R², f², LV scores) · quality criteria (Cronbach's α, ρA, ρc, AVE, Fornell-Larcker, HTMT, cross-loadings, outer/inner VIF, SRMR, d_ULS, d_G, χ², NFI for saturated and estimated model, AIC/BIC/HQ) · consistent PLS (PLSc) · bootstrapping (percentile or BCa CIs, one/two-tailed, distribution histograms, CI plots) · blindfolding Q² · PLSpredict (Q²predict, RMSE, MAE vs LM benchmark) · IPMA (constructs and indicators) · MGA permutation test with MICOM steps 2–3 · two-stage moderation with simple-slope plots · NCA (CE-FDH, permutation test, bottleneck tables) · OLS regression · higher-order constructs via repeated indicators.

**Not yet:** CB-SEM, FIMIX-PLS/POS segmentation, CTA-PLS, PROCESS, weighted PLS, Gaussian-copula endogeneity tests. Contributions welcome.

**Validation:** the PLS-SEM algorithm matches an independent NumPy implementation (`tools/reference_pls.py`) to 1e-6 for weights, loadings, paths and R² under path, factor and centroid schemes and Mode B. Tests (`npm test`) also cover reliability/HTMT formulas, effect decomposition, distribution functions, seeded bootstrap reproducibility, PLSc, moderation and every other analysis. HTMT uses absolute correlations; bootstrap p-values use the t-distribution with B−1 degrees of freedom.
