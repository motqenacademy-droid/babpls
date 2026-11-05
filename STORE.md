# Publishing BabPls in the Microsoft Store

Store installs show **no SmartScreen warning**: Microsoft signs the package and distributes it. Individual developer accounts are free.

## 1. One-time setup (owner)
1. Sign in at <https://partner.microsoft.com/dashboard/registration> with a personal Microsoft account and register as an **Individual** developer (free).
2. **Apps and games → New product → MSIX or PWA app**. Reserve the name **BabPls**. If it is taken, use e.g. *BabPls – PLS-SEM*.
3. Open **Product management → Product identity** and copy three values into GitHub. Go to *Settings → Secrets and variables → Actions → **Variables** tab → New repository variable*. These values are public identifiers, not secrets.

| GitHub variable | Partner Center field | Example |
|---|---|---|
| `APPX_IDENTITY_NAME` | Package/Identity/Name | `12345AhmedYoussef.BabPls` |
| `APPX_PUBLISHER` | Package/Identity/Publisher | `CN=ABCD1234-...` |
| `APPX_PUBLISHER_DISPLAY_NAME` | Package/Properties/PublisherDisplayName | `Ahmed Youssef` |

4. Run **Actions → desktop → Run workflow**. Download the artifact **store-package** from the run summary: `BabPls-<version>-store.appx`. Without the variables, the workflow produces a `…-store-TEST.appx`, which proves the build works but cannot be uploaded.

## 2. Submission (each release)
**Packages:** upload `BabPls-<version>-store.appx`. It is unsigned on purpose; the Store signs it.

**Pricing and availability:** Free · all markets.

**Properties:**
- **Category:** *Education* (alternative: *Productivity*).
- **Privacy policy URL:** <https://github.com/motqenacademy-droid/youpls/blob/main/PRIVACY.md>
- **Website:** <https://motqenacademy-droid.github.io/youpls/>
- **Support contact:** <https://github.com/motqenacademy-droid/youpls/issues>
- **Does this product access, collect, or transmit personal information?** **No.**

**Restricted capability `runFullTrust`:** Partner Center asks why the app needs it. Answer:
> BabPls is a desktop (Electron/Win32) application packaged with MSIX. runFullTrust is required for all packaged desktop applications. The app does not access personal data or the network except when the user opens a link.

**Age ratings:** complete the IARC questionnaire. BabPls has no violence, no user interaction or chat, no purchases and no data sharing, so it is usually rated *3+ / Everyone*.

**Store listings:** add **English (United States)** and **Arabic (Saudi Arabia)**. Both are declared in the package, so both need a listing. Use the texts below. Screenshots (1920×1080) are in [`docs/store/screenshots`](docs/store/screenshots): `en-*.png` for English and `ar-*.png` for Arabic. Logos are generated from `assets/logo.svg` (300×300: `assets/icon-512.png`).

---

### English listing
**Product name:** BabPls

**Short description:** Free structural equation modeling (PLS-SEM and CB-SEM) in English and Arabic: draw your model, run the analysis and get publication-ready results.

**Description:**
BabPls is free, open-source software for structural equation modeling, for researchers, graduate students and teachers.

Import your data from CSV, Excel or SPSS. Draw the path model on the canvas, then run the analyses reported in theses and journal articles:
- PLS-SEM with bootstrapping;
- the full measurement-model assessment (reliability, AVE, HTMT, VIF);
- mediation and moderation;
- PLSpredict and CVPAT;
- IPMA;
- multigroup analysis with MICOM;
- FIMIX-PLS and POS segmentation;
- CTA-PLS, endogeneity tests and NCA;
- CB-SEM and CFA with fit indices, modification indices and measurement invariance;
- GSCA, PROCESS, and linear and logistic regression.

BabPls writes an APA-style results section for you and checks your model against published reporting guidelines. It exports every table to Excel and every chart or model diagram as PNG or SVG. Each statistic comes with its formula and scholarly source, and the statistical engine is tested against independent reference implementations.

Your data stay on your computer: no account, no tracking, no data collection.

**Product features** (one per line):
- PLS-SEM, consistent PLS and weighted PLS with bootstrapping
- Reliability, validity and HTMT with automatic quality checklist
- Mediation, moderation and nonlinear effects
- PLSpredict, CVPAT and model comparison
- Multigroup analysis, MICOM and measurement invariance
- FIMIX-PLS and POS segmentation, CTA-PLS, NCA, IPMA
- CB-SEM and CFA with fit and modification indices
- GSCA, PROCESS, linear and logistic regression
- Automatic APA-style results write-up
- Import CSV, Excel and SPSS; export to Excel, PNG and SVG
- Arabic and English interface and documentation
- Works offline; your data never leave your computer

**Keywords:** PLS-SEM, SEM, structural equation modeling, statistics, CB-SEM, research, SmartPLS alternative

**Copyright:** © 2026 Dr. Ahmed Youssef and BabPls contributors · MIT licence

---

### Arabic listing (العربية)
**اسم المنتج:** BabPls

**وصف قصير:** نمذجة المعادلات الهيكلية (PLS-SEM وCB-SEM) مجاناً بالعربية والإنجليزية: ارسم نموذجك، وشغّل التحليل، واحصل على نتائج جاهزة للنشر.

**الوصف:**
BabPls برنامج مجاني مفتوح المصدر لنمذجة المعادلات الهيكلية، موجّه إلى الباحثين وطلاب الدراسات العليا والأساتذة.

استورد بياناتك من CSV أو Excel أو SPSS، وارسم نموذج المسارات على اللوحة، ثم شغّل التحليلات المطلوبة في الرسائل العلمية والمجلات المحكَّمة:
- PLS-SEM مع الإقلاع الذاتي؛
- التقييم الكامل لنموذج القياس (الثبات وAVE وHTMT وVIF)؛
- الوساطة والتعديل؛
- PLSpredict وCVPAT؛
- IPMA؛
- التحليل متعدد المجموعات مع MICOM؛
- التجزئة بـ FIMIX-PLS وPOS؛
- CTA-PLS واختبارات الداخلية وNCA؛
- CB-SEM والتحليل العاملي التوكيدي مع مؤشرات المطابقة والتعديل وثبات القياس؛
- GSCA وPROCESS، والانحدار الخطي واللوجستي.

يكتب BabPls فقرة النتائج بأسلوب APA، ويقيّم نموذجك وفق إرشادات كتابة التقارير المنشورة. ويصدّر كل الجداول إلى Excel، وكل الرسوم ومخطط النموذج بصيغتي PNG وSVG. ولكل إحصاءة صيغتها ومصدرها العلمي داخل البرنامج، ومحرّكه الإحصائي مختبَر مقابل تنفيذات مرجعية مستقلة.

بياناتك تبقى على جهازك: لا حساب، ولا تتبّع، ولا جمع بيانات.

**مزايا المنتج:**
- PLS-SEM وPLS المتّسقة والموزونة مع الإقلاع الذاتي
- الثبات والصدق وHTMT مع قائمة تقييم آلية
- الوساطة والتعديل والعلاقات غير الخطية
- PLSpredict وCVPAT والمقارنة بين النماذج
- التحليل متعدد المجموعات وMICOM وثبات القياس
- التجزئة بـ FIMIX-PLS وPOS، وCTA-PLS، وNCA، وIPMA
- CB-SEM والتحليل العاملي التوكيدي مع مؤشرات المطابقة والتعديل
- GSCA وPROCESS والانحدار الخطي واللوجستي
- كتابة النتائج بأسلوب APA آلياً
- استيراد CSV وExcel وSPSS، والتصدير إلى Excel وPNG وSVG
- واجهة وتوثيق بالعربية والإنجليزية
- يعمل دون إنترنت، وبياناتك لا تغادر جهازك

**الكلمات المفتاحية:** PLS-SEM، نمذجة المعادلات الهيكلية، إحصاء، بحث علمي، CB-SEM، SEM، رسائل جامعية
