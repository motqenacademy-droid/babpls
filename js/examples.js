/*
 * YouPls example gallery: one synthetic dataset per family of analyses, with bilingual guides on how to run
 * each analysis and how to read its output. The data come from tools/make_examples.js (embedded in
 * js/example-data.js); every number quoted below is checked by tests/examples.test.js.
 * Each analysis entry: kind (TASKS key in app.js), model (index into the example's models), preset (values of the
 * run dialog's fields), how (steps), read (what to look at and the usual thresholds), expect (what this data shows).
 */
(function (root) {
  'use strict';
  const EX = [
    // ------------------------------------------------------------------------------------------ customer
    {
      id: 'customer', file: 'customer_satisfaction.csv',
      title: { ar: 'رضا العملاء وولاؤهم (ECSI)', en: 'Customer satisfaction and loyalty (ECSI)' },
      story: {
        ar: 'استبيان لـ300 عميل بمقياس ليكرت من 7 درجات وفق نموذج مؤشر رضا العملاء الأوروبي: الصورة الذهنية والتوقعات والجودة المدركة والقيمة تؤثر في الرضا، والرضا والصورة يؤثران في الولاء. كل البُنى انعكاسية. النموذج 2 يحذف المسار التوقعات ← الرضا للمقارنة بين النماذج.',
        en: 'A survey of 300 customers on 7-point Likert items following the European Customer Satisfaction Index: image, expectations, perceived quality and value drive satisfaction, and satisfaction and image drive loyalty. All constructs are reflective. Model 2 drops the path Expectation → Satisfaction for model comparison.'
      },
      vars: [['imag_1…imag_5', 'الصورة الذهنية للشركة', 'Company image'], ['expe_1…expe_3', 'التوقعات قبل الشراء', 'Expectations'], ['qual_1…qual_4', 'الجودة المدركة', 'Perceived quality'], ['val_1…val_3', 'القيمة مقابل السعر', 'Value for money'], ['sat_1…sat_3', 'الرضا', 'Satisfaction'], ['loy_1…loy_3', 'الولاء', 'Loyalty'], ['gender', 'الجنس (أنثى/ذكر) لتحليل المجموعات', 'Gender (female/male) for group analyses'], ['age', 'العمر', 'Age']],
      analyses: [
        {
          kind: 'pls', model: 0, preset: {},
          how: { ar: ['حمّل المثال؛ يظهر النموذج في المحرّر.', 'من شريط «حساب» اختر «خوارزمية PLS-SEM» واترك الإعدادات الافتراضية (مخطط المسار).', 'افتح التقرير: ابدأ بقسم «الجودة» ثم «النتائج النهائية».'], en: ['Load the example; the model appears in the editor.', 'Under Calculate choose “PLS-SEM algorithm” and keep the defaults (path weighting scheme).', 'Open the report: read the Quality sections first, then Final results.'] },
          read: {
            ar: 'قيّم نموذج القياس أولاً: التشبعات ≥ 0.708 (وتُقبل 0.40–0.70 إن لم تُضعف الموثوقية)، وألفا كرونباخ وrho_A والموثوقية المركبة rho_C بين 0.70 و0.95، ومتوسط التباين المستخلص AVE ≥ 0.50 (الصدق التقاربي)، وHTMT < 0.85 أو 0.90 (الصدق التمييزي). ثم النموذج البنائي: VIF الداخلي < 3، وR² (0.25 ضعيف، 0.50 متوسط، 0.75 كبير في التسويق)، وf² (0.02/0.15/0.35)، وSRMR < 0.08.',
            en: 'Assess the measurement model first: loadings ≥ 0.708 (0.40–0.70 acceptable if reliability holds), Cronbach’s alpha, rho_A and composite reliability rho_C between 0.70 and 0.95, AVE ≥ 0.50 (convergent validity) and HTMT < 0.85 or 0.90 (discriminant validity). Then the structural model: inner VIF < 3, R² (0.25 weak, 0.50 moderate, 0.75 substantial in marketing), f² (0.02/0.15/0.35) and SRMR < 0.08.'
          },
          expect: {
            ar: 'كل AVE فوق 0.50 (أدناها الصورة ≈ 0.54) وكل rho_C فوق 0.80، وألفا الولاء ≈ 0.64 أقل قليلاً من 0.70 لكن rho_C = 0.80 مقبولة. أعلى HTMT ≈ 0.59 فالصدق التمييزي متحقق. R² للرضا ≈ 0.28 وللولاء ≈ 0.21 (ضعيفة إلى متوسطة)، وSRMR ≈ 0.067 < 0.08، وVIF الداخلي ≤ 1.6.',
            en: 'Every AVE exceeds 0.50 (lowest: Image ≈ 0.54) and every rho_C exceeds 0.80; Loyalty’s alpha ≈ 0.64 is slightly below 0.70 but its rho_C = 0.80 is acceptable. The largest HTMT ≈ 0.59, so discriminant validity holds. R² is ≈ 0.28 for Satisfaction and ≈ 0.21 for Loyalty (weak to moderate), SRMR ≈ 0.067 < 0.08, and inner VIFs are ≤ 1.6.'
          }
        },
        {
          kind: 'bootstrap', model: 0, preset: { samples: 5000, seed: 1 },
          how: { ar: ['اختر «Bootstrapping» بعدد 5000 عينة وبذرة 1 (لتكرار النتيجة نفسها).', 'اختر فاصل ثقة مئيني أو BCa واختباراً ذا ذيلين عند α = 0.05.', 'اقرأ «معاملات المسار» و«التأثيرات غير المباشرة الخاصة» و«التأثيرات الكلية».'], en: ['Choose Bootstrapping with 5000 subsamples and seed 1 (to reproduce the result).', 'Pick percentile or BCa intervals and a two-tailed test at α = 0.05.', 'Read Path coefficients, Specific indirect effects and Total effects.'] },
          read: {
            ar: 'المسار دال إذا كانت p < 0.05 أو لم يتضمن فاصل الثقة 95% الصفر. للوساطة: إذا كان التأثير غير المباشر دالاً والمباشر دالاً فالوساطة جزئية (تكميلية إن اتفقت الإشارتان)، وإن كان المباشر غير دال فالوساطة كاملة (غير مباشرة فقط). استعمل الأوزان الخارجية وفواصلها لتقييم المؤشرات التكوينية.',
            en: 'A path is significant when p < 0.05 or the 95% interval excludes zero. For mediation: a significant indirect and significant direct effect is partial (complementary when the signs agree) mediation; a significant indirect effect with a non-significant direct effect is full (indirect-only) mediation. Use outer weights and their intervals to assess formative indicators.'
          },
          expect: {
            ar: 'كل المسارات العشرة دالة؛ أقواها الرضا ← الولاء ≈ 0.36 [0.26، 0.45] وأضعفها الصورة ← الرضا ≈ 0.14 (p ≈ 0.006). للصورة ← الولاء تأثير مباشر ≈ 0.20 وغير مباشر عبر الرضا ≈ 0.11، وكلاهما دال: وساطة جزئية تكميلية، والتأثير الكلي ≈ 0.31.',
            en: 'All ten paths are significant; the strongest is Satisfaction → Loyalty ≈ 0.36 [0.26, 0.45] and the weakest Image → Satisfaction ≈ 0.14 (p ≈ 0.006). Image → Loyalty has a direct effect ≈ 0.20 and an indirect effect through Satisfaction ≈ 0.11, both significant: complementary partial mediation, total effect ≈ 0.31.'
          }
        },
        {
          kind: 'plsc', model: 0, preset: {},
          how: { ar: ['اختر «PLS-SEM المتسق (PLSc)».', 'قارن معاملات المسار وR² بنتائج PLS-SEM العادي.'], en: ['Choose “Consistent PLS-SEM (PLSc)”.', 'Compare the path coefficients and R² with ordinary PLS-SEM.'] },
          read: {
            ar: 'يصحّح PLSc الارتباطات بين البُنى بقسمتها على جذر rho_A، فيقدّر نموذج عوامل مشتركة كما يفعل CB-SEM. استعمله عندما تكون البُنى انعكاسية وتريد تقديرات متسقة؛ تكون المسارات عادة أكبر من PLS العادي لأن أثر خطأ القياس قد أزيل.',
            en: 'PLSc corrects the construct correlations by dividing by the square root of rho_A, estimating a common-factor model as CB-SEM does. Use it for reflective constructs when you want consistent estimates; paths are usually larger than in ordinary PLS because measurement error has been removed.'
          },
          expect: {
            ar: 'يرتفع المسار الرضا ← الولاء من ≈ 0.36 إلى ≈ 0.50، ويرتفع R² للولاء من ≈ 0.21 إلى ≈ 0.39 — قريب من تقديرات CB-SEM.',
            en: 'Satisfaction → Loyalty rises from ≈ 0.36 to ≈ 0.50 and Loyalty’s R² from ≈ 0.21 to ≈ 0.39, close to the CB-SEM estimates.'
          }
        },
        {
          kind: 'blindfolding', model: 0, preset: { distance: 7 },
          how: { ar: ['اختر «Blindfolding» بمسافة حذف D = 7 (ألا يقسم عددَ الحالات 300).'], en: ['Choose Blindfolding with omission distance D = 7 (it must not divide the 300 cases).'] },
          read: { ar: 'Q² > 0 يعني قدرة تنبؤية للنموذج للبنية الداخلية؛ 0 و0.25 و0.50 تقابل قدرة صغيرة ومتوسطة وكبيرة.', en: 'Q² > 0 indicates predictive relevance for an endogenous construct; 0, 0.25 and 0.50 correspond to small, medium and large relevance.' },
          expect: { ar: 'كل قيم Q² موجبة (بين ≈ 0.10 للجودة و≈ 0.17 للرضا): قدرة تنبؤية صغيرة.', en: 'All Q² values are positive (from ≈ 0.10 for Quality to ≈ 0.17 for Satisfaction): small predictive relevance.' }
        },
        {
          kind: 'predict', model: 0, preset: { folds: 10, reps: 10, seed: 1 },
          how: { ar: ['اختر «PLSpredict» بعشر طيّات وعشرة تكرارات.', 'قارن عمود RMSE لـPLS بعمود RMSE للنموذج الخطي (LM) لكل مؤشر من مؤشرات البنية الهدف (الولاء).'], en: ['Choose PLSpredict with 10 folds and 10 repetitions.', 'Compare PLS RMSE with the linear-model (LM) RMSE for each indicator of the key target construct (Loyalty).'] },
          read: { ar: 'أولاً Q²predict > 0 لكل مؤشر. ثم: إن كان RMSE لـPLS أقل من LM لكل المؤشرات فالقدرة التنبؤية عالية، ولأغلبها متوسطة، ولأقلها منخفضة، ولا شيء = لا قدرة تنبؤية.', en: 'First Q²predict > 0 for every indicator. Then: PLS RMSE below LM for all indicators = high predictive power, for the majority = medium, for a minority = low, for none = no predictive power.' },
          expect: { ar: 'Q²predict موجب لمؤشرات الولاء الثلاثة، وRMSE لـPLS أقل من LM في loy_1 وloy_3 وأعلى قليلاً في loy_2: قدرة تنبؤية متوسطة.', en: 'Q²predict is positive for all three Loyalty indicators, and PLS RMSE is below LM for loy_1 and loy_3 and slightly above it for loy_2: medium predictive power.' }
        },
        {
          kind: 'cvpat', model: 0, preset: { folds: 10, reps: 10, seed: 1 },
          how: { ar: ['اختر «CVPAT» بعشر طيّات وعشرة تكرارات.', 'اقرأ سطر «الإجمالي» مقابل المعيارين: متوسط المؤشر (IA) والنموذج الخطي (LM).'], en: ['Choose CVPAT with 10 folds and 10 repetitions.', 'Read the Overall row against both benchmarks: indicator average (IA) and linear model (LM).'] },
          read: { ar: 'فرق الخسارة الموجب الدال (p < 0.05) يعني أن نموذج PLS يتنبأ أفضل من المعيار. التفوق على IA هو الحد الأدنى، والتفوق على LM دليل قوي.', en: 'A positive, significant loss difference (p < 0.05) means the PLS model predicts better than the benchmark. Beating IA is the minimum; beating LM is strong evidence.' },
          expect: { ar: 'يتفوق النموذج على IA (p < 0.001) وعلى LM أيضاً (p ≈ 0.02) في الإجمالي.', en: 'Overall the model beats IA (p < 0.001) and also LM (p ≈ 0.02).' }
        },
        {
          kind: 'ipma', model: 0, preset: { target: 'c6', scaleMin: 1, scaleMax: 7 },
          how: { ar: ['اختر «IPMA» والبنية الهدف «Loyalty».', 'اكتب حدود المقياس 1 و7 ليُعاد قياس الأداء من 0 إلى 100.', 'انظر الخريطة: الأهمية (التأثير الكلي) أفقياً والأداء عمودياً.'], en: ['Choose IPMA with target construct Loyalty.', 'Enter the scale limits 1 and 7 so performance is rescaled to 0–100.', 'Read the map: importance (total effect) horizontally and performance vertically.'] },
          read: { ar: 'الأولوية للبُنى ذات الأهمية العالية والأداء المنخفض (الربع الأيمن السفلي): تحسينها يرفع الهدف أكثر.', en: 'Priority goes to constructs with high importance and low performance (bottom-right quadrant): improving them lifts the target most.' },
          expect: { ar: 'الرضا هو الأهم (≈ 0.34) ثم الصورة (≈ 0.29)، وأداء كل البُنى متقارب حول 60 من 100؛ فالأولوية الإدارية لرفع الرضا والصورة لا القيمة (أهميتها ≈ 0.06).', en: 'Satisfaction is the most important driver (≈ 0.34), then Image (≈ 0.29); all performances lie close to 60 of 100, so management should work on satisfaction and image rather than value (importance ≈ 0.06).' }
        },
        {
          kind: 'nca', model: 0, preset: { permutations: 1000 },
          how: { ar: ['اختر «NCA» بألف تبديل.', 'اقرأ حجم التأثير d وقيمة p لكل علاقة، ثم جدول الاختناق.'], en: ['Choose NCA with 1000 permutations.', 'Read the effect size d and p-value of each relationship, then the bottleneck table.'] },
          read: { ar: 'NCA يسأل: هل X شرط ضروري لـY (لا يتحقق Y العالي دون X كافٍ)؟ d بين 0 و0.1 صغير، 0.1–0.3 متوسط، 0.3–0.5 كبير؛ والشرط ضروري إذا كان d ≥ 0.1 وp < 0.05. يكمّل PLS-SEM الذي يقيس «الكفاية في المتوسط».', en: 'NCA asks whether X is a necessary condition for Y (high Y cannot occur without enough X). d of 0–0.1 is small, 0.1–0.3 medium, 0.3–0.5 large; a condition is necessary when d ≥ 0.1 and p < 0.05. It complements PLS-SEM, which measures average sufficiency.' },
          expect: { ar: 'كل العلاقات ضرورية بدرجة متوسطة (d بين ≈ 0.16 و≈ 0.28 وp < 0.05)؛ أكبرها الرضا ← الولاء (d ≈ 0.28).', en: 'All relationships are necessary to a medium degree (d between ≈ 0.16 and ≈ 0.28, p < 0.05); the largest is Satisfaction → Loyalty (d ≈ 0.28).' }
        },
        {
          kind: 'cca', model: 0, preset: { samples: 1000, seed: 1 },
          how: { ar: ['اختر «تحليل البنى المركّبة المؤكّد (CCA)» بألف عينة Bollen–Stine.', 'قارن SRMR وd_ULS وd_G بالمئين 95% (HI95).'], en: ['Choose Confirmatory composite analysis (CCA) with 1000 Bollen–Stine samples.', 'Compare SRMR, d_ULS and d_G with their 95% quantile (HI95).'] },
          read: { ar: 'يختبر CCA هل البيانات تتفق مع نموذج بنى مركّبة. إذا كانت القيمة ≤ HI95 فالنموذج مقبول، وإذا تجاوزته فالنموذج المركّب مرفوض.', en: 'CCA tests whether the data agree with a composite model. A value ≤ HI95 supports the model; a value above it rejects the composite model.' },
          expect: { ar: 'SRMR ≈ 0.067 أكبر من HI95 ≈ 0.055 فيُرفض النموذج المركّب. هذا متوقع: البيانات وُلّدت من عوامل مشتركة (نموذج انعكاسي)، لذلك يناسبها PLSc أو CB-SEM — قارن بنتيجة CB-SEM.', en: 'SRMR ≈ 0.067 exceeds HI95 ≈ 0.055, so the composite model is rejected. That is expected: the data were generated from common factors (a reflective model), which PLSc or CB-SEM represent — compare with the CB-SEM result.' }
        },
        {
          kind: 'cbsem', model: 0, preset: { cbBoot: 0 },
          how: { ar: ['اختر «CB-SEM» (الأرجحية العظمى). اختيارياً: أضف عينات Bootstrap.', 'اقرأ «مطابقة النموذج» ثم «معاملات المسار» و«مؤشرات التعديل».'], en: ['Choose CB-SEM (maximum likelihood). Optionally add bootstrap samples.', 'Read Model fit, then Path coefficients and Modification indices.'] },
          read: { ar: 'إرشادات المطابقة (Hu & Bentler, 1999): CFI وTLI ≥ 0.95، RMSEA ≤ 0.06، SRMR ≤ 0.08. اختبار χ² حساس لحجم العينة فلا يُعتمد وحده. مؤشر التعديل الكبير (> 10) يقترح قيداً قد يُحرَّر، لكن لا تعدّل إلا بمبرر نظري.', en: 'Fit guidelines (Hu & Bentler, 1999): CFI and TLI ≥ 0.95, RMSEA ≤ 0.06, SRMR ≤ 0.08. The χ² test is sensitive to sample size and is not used alone. A large modification index (> 10) suggests a constraint that could be freed; change the model only with a theoretical reason.' },
          expect: { ar: 'χ²(179) ≈ 238.6 (p ≈ 0.002) لكن CFI ≈ 0.966 وTLI ≈ 0.960 وRMSEA ≈ 0.033 وSRMR ≈ 0.044: مطابقة جيدة. كل المسارات دالة عدا التوقعات ← الرضا (β ≈ 0.10، p ≈ 0.41) — وهو المسار الذي يحذفه النموذج 2.', en: 'χ²(179) ≈ 238.6 (p ≈ 0.002), but CFI ≈ 0.966, TLI ≈ 0.960, RMSEA ≈ 0.033 and SRMR ≈ 0.044: good fit. All paths are significant except Expectation → Satisfaction (β ≈ 0.10, p ≈ 0.41) — the path Model 2 removes.' }
        },
        {
          kind: 'cbsemmg', model: 0, preset: { groupVar: 'gender' },
          how: { ar: ['اختر «CB-SEM متعدد المجموعات» ومتغير المجموعة gender.', 'اقرأ جدول الثبات: الشكلي ثم المتري (تشبعات متساوية) ثم العددي (تشبعات وتقاطعات متساوية).'], en: ['Choose Multigroup CB-SEM with group variable gender.', 'Read the invariance table: configural, then metric (equal loadings), then scalar (equal loadings and intercepts).'] },
          read: { ar: 'يتحقق مستوى الثبات إذا لم يكن فرق χ² دالاً (p > 0.05) أو كان انخفاض CFI ≤ 0.01. الثبات المتري شرط لمقارنة المسارات، والعددي شرط لمقارنة المتوسطات الكامنة.', en: 'An invariance level holds when the χ² difference is not significant (p > 0.05) or CFI drops by ≤ 0.01. Metric invariance is required to compare paths, scalar invariance to compare latent means.' },
          expect: { ar: 'الثبات المتري (Δχ² ≈ 16 على 15 د.ح، p ≈ 0.38) والعددي (p ≈ 0.45) متحققان، وΔCFI أقل من 0.001؛ فيجوز مقارنة المسارات والمتوسطات بين الإناث والذكور.', en: 'Metric (Δχ² ≈ 16 on 15 df, p ≈ 0.38) and scalar (p ≈ 0.45) invariance hold and ΔCFI is below 0.001, so paths and means may be compared between women and men.' }
        },
        {
          kind: 'gsca', model: 0, preset: { samples: 1000, seed: 1 },
          how: { ar: ['اختر «GSCA» بألف عينة Bootstrap.'], en: ['Choose GSCA with 1000 bootstrap samples.'] },
          read: { ar: 'تحليل المكونات المعمم يقدّر نموذج المركّبات بمعيار مربعات صغرى واحد. FIT هي نسبة التباين الكلي المفسَّر (0–1) وAFIT معدّلة بعدد المعالم؛ GFI ≥ 0.93 وSRMR ≤ 0.08 تدل على مطابقة جيدة.', en: 'Generalized structured component analysis estimates the composite model with one global least-squares criterion. FIT is the share of total variance explained (0–1), AFIT adjusts it for the number of parameters; GFI ≥ 0.93 and SRMR ≤ 0.08 indicate good fit.' },
          expect: { ar: 'FIT ≈ 0.51 وGFI ≈ 0.95 وSRMR ≈ 0.068، والأوزان والمسارات قريبة من تقديرات PLS-SEM.', en: 'FIT ≈ 0.51, GFI ≈ 0.95 and SRMR ≈ 0.068, with weights and paths close to the PLS-SEM estimates.' }
        },
        {
          kind: 'compare', model: 0, preset: { cmpMethod: 'pls' },
          how: { ar: ['المثال يحوي نموذجين في ألسنة فوق المحرّر: «Model 1» و«Model 2» (بلا التوقعات ← الرضا).', 'اختر «مقارنة النماذج» بطريقة PLS-SEM (أو CB-SEM لاختبار فرق χ²).'], en: ['The example holds two models in the tabs above the editor: Model 1 and Model 2 (without Expectation → Satisfaction).', 'Choose Model comparison with PLS-SEM (or CB-SEM for a χ² difference test).'] },
          read: { ar: 'لكل بنية داخلية يُفضَّل النموذج ذو BIC الأصغر؛ وزن أكايكي/BIC هو احتمال أن يكون النموذج الأفضل بين المرشحين. فرق BIC < 2 يعني دليلاً ضعيفاً، وعندها يُفضَّل النموذج الأبسط.', en: 'For each endogenous construct the model with the lower BIC is preferred; the BIC (Akaike) weight is the probability that a model is the best among the candidates. A BIC difference below 2 is weak evidence, in which case the simpler model is preferred.' },
          expect: { ar: 'للرضا BIC شبه متساوٍ في النموذجين (وزن ≈ 0.50 لكل منهما): المسار الإضافي لا يحسّن التنبؤ بما يكفي، فيُفضَّل النموذج 2 الأبسط.', en: 'For Satisfaction the BIC is practically equal in both models (weight ≈ 0.50 each): the extra path does not improve prediction enough, so the simpler Model 2 is preferred.' }
        },
        {
          kind: 'samplesize', model: 0, preset: { ssPmin: 0.2, ssAlpha: 0.05, ssPower: 0.8 },
          how: { ar: ['اختر «حجم العينة» (لا يحتاج إلى بيانات).', 'أدخل أصغر معامل مسار تتوقع أن يكون ذا معنى، ومستوى الدلالة والقوة.'], en: ['Choose Sample size (no data needed).', 'Enter the smallest path coefficient you expect to be meaningful, the significance level and power.'] },
          read: { ar: 'طريقة الجذر التربيعي المعكوس (Kock & Hadaya, 2018): n = ((z₁₋α + z_power)/|β_min|)². قاعدة «عشرة أضعاف» تُعرض للمقارنة فقط لأنها تقلل الحجم المطلوب غالباً.', en: 'Inverse square root method (Kock & Hadaya, 2018): n = ((z₁₋α + z_power)/|β_min|)². The ten-times rule is shown only for comparison, as it usually understates the required size.' },
          expect: { ar: 'لـβ_min = 0.2 وα = 0.05 وقوة 80% يلزم 155 حالة على الأقل؛ عينة المثال (300) كافية.', en: 'For β_min = 0.2, α = 0.05 and 80% power at least 155 cases are needed; the example’s 300 cases are enough.' }
        }
      ]
    },
    // ------------------------------------------------------------------------------------------ wellbeing
    {
      id: 'wellbeing', file: 'workload_wellbeing.csv',
      title: { ar: 'ضغط العمل والدعم والرفاه (تعديل، وساطة، تأثير غير خطي)', en: 'Workload, support and wellbeing (moderation, mediation, nonlinear effect)' },
      story: {
        ar: '350 موظفاً. عبء العمل يرفع الإجهاد، والدعم يخفّضه ويخفّف أثر العبء (تعديل)، والإجهاد يخفض الرفاه (وساطة: العبء ← الإجهاد ← الرفاه)، ويتسارع أثر الإجهاد كلما اشتد (تأثير تربيعي). النموذج «Moderation» يحوي حد التفاعل، والنموذج «Quadratic» يحوي الإجهاد².',
        en: '350 employees. Workload raises stress; support lowers it and buffers the effect of workload (moderation); stress lowers wellbeing (mediation: workload → stress → wellbeing), and its harm accelerates at high stress (quadratic effect). The “Moderation” model holds the interaction term, the “Quadratic” model holds Stress².'
      },
      vars: [['wl_1…wl_4', 'عبء العمل', 'Workload'], ['sup_1…sup_3', 'دعم المشرف والزملاء (المعدِّل)', 'Supervisor and co-worker support (moderator)'], ['str_1…str_4', 'الإجهاد (الوسيط)', 'Stress (mediator)'], ['wb_1…wb_4', 'الرفاه', 'Wellbeing']],
      analyses: [
        {
          kind: 'pls', model: 0, preset: {},
          how: { ar: ['النموذج «Moderation» محمَّل: حد التفاعل Workload x Support يشير إلى Stress.', 'لإنشاء تفاعل بنفسك: انقر المسار Workload ← Stress ثم «إضافة معدِّل» واختر Support (طريقة المرحلتين).', 'شغّل PLS-SEM وافتح قسم «تحليل الميل البسيط».'], en: ['The “Moderation” model is loaded: the interaction term Workload x Support points to Stress.', 'To create one yourself: click the path Workload → Stress, then “Add moderator” and choose Support (two-stage approach).', 'Run PLS-SEM and open the Simple slope analysis section.'] },
          read: { ar: 'معامل حد التفاعل يبيّن كيف يتغير أثر X على Y بزيادة المعدِّل انحرافاً معيارياً واحداً. في رسم الميل البسيط: خطوط متوازية = لا تعديل؛ ميل أضعف عند المعدِّل المرتفع = أثر مخفِّف (buffering). يُختبر الدلالة بالـBootstrap، ويُقرأ f² للتفاعل: 0.005 و0.01 و0.025 صغير ومتوسط وكبير (Kenny, 2018).', en: 'The interaction coefficient shows how the effect of X on Y changes when the moderator rises by one standard deviation. In the simple-slope plot, parallel lines mean no moderation and a flatter line at high moderator values means a buffering effect. Test significance by bootstrapping and read f² of the interaction: 0.005, 0.01 and 0.025 are small, medium and large (Kenny, 2018).' },
          expect: { ar: 'العبء ← الإجهاد ≈ 0.47، والدعم ← الإجهاد ≈ −0.22، والتفاعل ≈ −0.26: عند الدعم المرتفع (+1 انحراف) ينخفض أثر العبء إلى ≈ 0.21 وعند الدعم المنخفض يرتفع إلى ≈ 0.73. R² للإجهاد ≈ 0.34.', en: 'Workload → Stress ≈ 0.47, Support → Stress ≈ −0.22 and the interaction ≈ −0.26: at high support (+1 SD) the effect of workload falls to ≈ 0.21, at low support it rises to ≈ 0.73. Stress R² ≈ 0.34.' }
        },
        {
          kind: 'bootstrap', model: 0, preset: { samples: 5000, seed: 1 },
          how: { ar: ['شغّل Bootstrapping (5000 عينة) على نموذج «Moderation».', 'اقرأ دلالة حد التفاعل، ثم «التأثيرات غير المباشرة الخاصة» للوساطة.'], en: ['Run bootstrapping (5000 samples) on the “Moderation” model.', 'Read the significance of the interaction term, then the Specific indirect effects for mediation.'] },
          read: { ar: 'للوساطة اتبع Zhao وزملاءه (2010): انظر أولاً التأثير غير المباشر؛ إن كان دالاً والمباشر غير دال فالوساطة كاملة.', en: 'For mediation follow Zhao et al. (2010): look at the indirect effect first; if it is significant and the direct effect is not, mediation is full (indirect-only).' },
          expect: { ar: 'التفاعل دال (p < 0.001). التأثير غير المباشر العبء ← الإجهاد ← الرفاه ≈ −0.17 دال، والمباشر العبء ← الرفاه ≈ −0.03 غير دال (p ≈ 0.63): وساطة كاملة.', en: 'The interaction is significant (p < 0.001). The indirect effect Workload → Stress → Wellbeing ≈ −0.17 is significant and the direct effect Workload → Wellbeing ≈ −0.03 is not (p ≈ 0.63): full mediation.' }
        },
        {
          kind: 'bootstrap', model: 1, preset: { samples: 5000, seed: 1 },
          how: { ar: ['انتقل إلى لسان النموذج «Quadratic» (حد Stress² ← Wellbeing).', 'لإنشائه بنفسك: انقر المسار Stress ← Wellbeing ثم «إضافة تأثير تربيعي».', 'شغّل Bootstrapping واقرأ دلالة Stress²، ثم شغّل PLS-SEM لرسم العلاقة.'], en: ['Switch to the “Quadratic” model tab (term Stress² → Wellbeing).', 'To create it yourself: click the path Stress → Wellbeing, then “Add quadratic effect”.', 'Run bootstrapping for the significance of Stress², then PLS-SEM to plot the curve.'] },
          read: { ar: 'معامل الحد التربيعي السالب يعني منحنى مقعّراً إلى الأسفل: يزداد الضرر كلما زادت قيمة X. قارن R² وf² مع النموذج الخطي لتقرير هل يستحق الحد البقاء.', en: 'A negative quadratic coefficient means a concave curve: the harm grows as X increases. Compare R² and f² with the linear model to decide whether the term is worth keeping.' },
          expect: { ar: 'Stress² ≈ −0.25 دال (p < 0.001) وf² ≈ 0.08، ويرتفع R² للرفاه من ≈ 0.14 إلى ≈ 0.20.', en: 'Stress² ≈ −0.25 is significant (p < 0.001) with f² ≈ 0.08, and Wellbeing’s R² rises from ≈ 0.14 to ≈ 0.20.' }
        }
      ]
    },
    // ------------------------------------------------------------------------------------------ training
    {
      id: 'training', file: 'training_performance.csv',
      title: { ar: 'التدريب والأداء (نماذج PROCESS والانحدار)', en: 'Training and performance (PROCESS models and regression)' },
      story: {
        ar: '300 موظف بمتغيرات مقيسة مباشرة. ساعات التدريب ترفع الدافعية، والدافعية ترفع الكفاءة الذاتية، وكلتاهما ترفع الأداء. دعم المشرف يقوّي أثر التدريب في الدافعية (تعديل في المرحلة الأولى)، ولا يعدّل أثر الدافعية في الأداء. لا يحتاج المثال إلى نموذج في المحرّر.',
        en: '300 employees with directly observed variables. Training hours raise motivation, motivation raises self-efficacy, and both raise performance. Supervisor support strengthens the effect of training on motivation (first-stage moderation) but does not moderate the effect of motivation on performance. No model is needed in the editor.'
      },
      vars: [['training_hours', 'ساعات التدريب (X)', 'Training hours (X)'], ['motivation', 'الدافعية (M1)', 'Motivation (M1)'], ['self_efficacy', 'الكفاءة الذاتية (M2)', 'Self-efficacy (M2)'], ['supervisor_support', 'دعم المشرف 1–7 (W)', 'Supervisor support 1–7 (W)'], ['performance', 'تقييم الأداء (Y)', 'Performance rating (Y)'], ['age', 'العمر (متغير ضابط)', 'Age (control)']],
      analyses: [
        {
          kind: 'process', model: 0, preset: { pmodel: 4, procX: 'training_hours', procM: ['motivation'], procY: 'performance', samples: 5000, seed: 1, center: true },
          how: { ar: ['اختر «PROCESS» ثم النموذج 4 (وساطة بسيطة).', 'X = training_hours وM = motivation وY = performance، و5000 عينة Bootstrap.'], en: ['Choose PROCESS, model 4 (simple mediation).', 'X = training_hours, M = motivation, Y = performance, 5000 bootstrap samples.'] },
          read: { ar: 'التأثير غير المباشر (a×b) دال إذا لم يتضمن فاصل Bootstrap 95% الصفر. التأثير الكلي = المباشر + غير المباشر. نسبة الوساطة = غير المباشر ÷ الكلي.', en: 'The indirect effect (a×b) is significant when its 95% bootstrap interval excludes zero. Total effect = direct + indirect. Proportion mediated = indirect ÷ total.' },
          expect: { ar: 'غير المباشر ≈ 0.21 [0.13، 0.28] دال، والمباشر ≈ 0.12 دال أيضاً، والكلي ≈ 0.33: وساطة جزئية تفسّر نحو 63% من الأثر.', en: 'Indirect ≈ 0.21 [0.13, 0.28] is significant, the direct effect ≈ 0.12 is significant too and the total is ≈ 0.33: partial mediation explaining about 63% of the effect.' }
        },
        {
          kind: 'process', model: 0, preset: { pmodel: 6, procX: 'training_hours', procM: ['motivation', 'self_efficacy'], procY: 'performance', samples: 5000, seed: 1, center: true },
          how: { ar: ['النموذج 6 (وساطة متسلسلة) مع وسيطين بالترتيب: motivation ثم self_efficacy.'], en: ['Model 6 (serial mediation) with two mediators in order: motivation, then self_efficacy.'] },
          read: { ar: 'يعطي ثلاثة تأثيرات غير مباشرة: عبر M1 وحده، وعبر M2 وحده، وعبر M1 ← M2 (المسار المتسلسل).', en: 'It gives three indirect effects: through M1 only, through M2 only, and through M1 → M2 (the serial path).' },
          expect: { ar: 'الثلاثة دالة: عبر الدافعية ≈ 0.16، وعبر الكفاءة ≈ 0.03، والمتسلسل ≈ 0.05؛ ويبقى المباشر ≈ 0.09 دالاً بالكاد.', en: 'All three are significant: via motivation ≈ 0.16, via self-efficacy ≈ 0.03 and serial ≈ 0.05; the direct effect ≈ 0.09 remains barely significant.' }
        },
        {
          kind: 'process', model: 0, preset: { pmodel: 7, procX: 'training_hours', procM: ['motivation'], procW: 'supervisor_support', procY: 'performance', samples: 5000, seed: 1, center: true },
          how: { ar: ['النموذج 7 (وساطة معدَّلة في المرحلة الأولى): X ← M معدَّل بـW.', 'W = supervisor_support.'], en: ['Model 7 (first-stage moderated mediation): X → M moderated by W.', 'W = supervisor_support.'] },
          read: { ar: 'مؤشر الوساطة المعدَّلة (Hayes, 2015) دال إذا لم يتضمن فاصله الصفر؛ ويُقرأ معه التأثير غير المباشر الشرطي عند قيم منخفضة (−1 انحراف) ومتوسطة ومرتفعة (+1 انحراف) لـW.', en: 'The index of moderated mediation (Hayes, 2015) is significant when its interval excludes zero; read it with the conditional indirect effects at low (−1 SD), mean and high (+1 SD) values of W.' },
          expect: { ar: 'المؤشر ≈ 0.16 [0.11، 0.21] دال. التأثير غير المباشر ≈ 0 عند الدعم المنخفض (غير دال)، و≈ 0.21 عند المتوسط، و≈ 0.42 عند المرتفع: التدريب لا يرفع الأداء عبر الدافعية إلا حين يدعمه المشرف.', en: 'The index ≈ 0.16 [0.11, 0.21] is significant. The indirect effect is ≈ 0 at low support (not significant), ≈ 0.21 at mean and ≈ 0.42 at high support: training improves performance through motivation only when supervisors support it.' }
        },
        {
          kind: 'process', model: 0, preset: { pmodel: 14, procX: 'training_hours', procM: ['motivation'], procW: 'supervisor_support', procY: 'performance', samples: 5000, seed: 1, center: true },
          how: { ar: ['النموذج 14 (وساطة معدَّلة في المرحلة الثانية): M ← Y معدَّل بـW، بالمتغيرات نفسها.'], en: ['Model 14 (second-stage moderated mediation): M → Y moderated by W, with the same variables.'] },
          read: { ar: 'مقارنة النموذجين 7 و14 تحدد أين يقع التعديل. المؤشر غير الدال يعني أن W لا يعدّل هذه المرحلة.', en: 'Comparing models 7 and 14 tells you where moderation occurs. A non-significant index means W does not moderate that stage.' },
          expect: { ar: 'المؤشر ≈ 0.00 [−0.02، 0.03] غير دال، والتأثيرات الشرطية متساوية تقريباً (≈ 0.21): التعديل في المرحلة الأولى لا الثانية، فالنموذج 7 هو الصحيح.', en: 'The index ≈ 0.00 [−0.02, 0.03] is not significant and the conditional effects are almost equal (≈ 0.21): moderation is in the first stage, not the second, so model 7 is the right one.' }
        },
        {
          kind: 'process', model: 0, preset: { pmodel: 1, procX: 'training_hours', procW: 'supervisor_support', procY: 'motivation', samples: 5000, seed: 1, center: true },
          how: { ar: ['النموذج 1 (تعديل بسيط): X = training_hours وW = supervisor_support وY = motivation.', 'اقرأ معامل التفاعل والتأثيرات الشرطية (طريقة نقطة الاختيار).'], en: ['Model 1 (simple moderation): X = training_hours, W = supervisor_support, Y = motivation.', 'Read the interaction coefficient and the conditional effects (pick-a-point).'] },
          read: { ar: 'التفاعل الدال يعني أن أثر X يختلف باختلاف W؛ والتأثيرات الشرطية تبيّن عند أي مستوى من W يكون الأثر دالاً.', en: 'A significant interaction means the effect of X differs across W; the conditional effects show at which W levels the effect is significant.' },
          expect: { ar: 'التفاعل training_hours × supervisor_support دال. أثر ساعة تدريب واحدة في الدافعية ≈ 0.00 (غير دال) عند الدعم المنخفض، و≈ 0.05 عند المتوسط، و≈ 0.10 عند المرتفع.', en: 'The interaction training_hours × supervisor_support is significant. One training hour changes motivation by ≈ 0.00 (not significant) at low support, ≈ 0.05 at mean and ≈ 0.10 at high support.' }
        },
        {
          kind: 'regression', model: 0, preset: { regY: 'performance', regX: ['training_hours', 'motivation', 'self_efficacy', 'age'], regBoot: 0 },
          how: { ar: ['اختر «الانحدار الخطي»، المتغير التابع performance، والمستقلة: training_hours وmotivation وself_efficacy وage (اضغط Ctrl للتحديد المتعدد).'], en: ['Choose Linear regression with dependent variable performance and predictors training_hours, motivation, self_efficacy and age (Ctrl-click to select several).'] },
          read: { ar: 'F واحتمالها يختبران النموذج كله، وR² المعدّل يصحح لعدد المتغيرات. B تأثير وحدة واحدة بوحدات Y، وβ المعيارية للمقارنة بين المتغيرات، وVIF > 5 يدل على تعدد خطي.', en: 'F and its p-value test the whole model; adjusted R² corrects for the number of predictors. B is the effect of one unit in Y’s units, standardized β compares predictors, and VIF > 5 signals collinearity.' },
          expect: { ar: 'R² ≈ 0.43. الدافعية (β ≈ 0.42) والكفاءة (β ≈ 0.26) دالتان، أما ساعات التدريب (p ≈ 0.06) والعمر (p ≈ 0.13) فغير دالتين بعد ضبط الوسيطين؛ وكل VIF < 1.6.', en: 'R² ≈ 0.43. Motivation (β ≈ 0.42) and self-efficacy (β ≈ 0.26) are significant, while training hours (p ≈ 0.06) and age (p ≈ 0.13) are not once the mediators are controlled; all VIFs are < 1.6.' }
        }
      ]
    },
    // ------------------------------------------------------------------------------------------ reputation
    {
      id: 'reputation', file: 'corporate_reputation.csv',
      title: { ar: 'سمعة الشركة (بنى تكوينية، CTA، بنية من مرتبة أعلى)', en: 'Corporate reputation (formative constructs, CTA, higher-order construct)' },
      story: {
        ar: '344 مستجيباً. الجودة والمسؤولية الاجتماعية (CSR) بنيتان تكوينيتان: مؤشراتهما تصف جوانب مختلفة لا تتحرك معاً بالضرورة. الكفاءة والجاذبية بُعدان انعكاسيان للسمعة، والسمعة تؤثر في الولاء. النموذج «Higher order» يجمع الكفاءة والجاذبية في بنية «Reputation» بطريقة المؤشرات المكرّرة.',
        en: '344 respondents. Quality and corporate social responsibility (CSR) are formative: their indicators describe different facets that need not move together. Competence and likeability are reflective dimensions of reputation, which drives loyalty. The “Higher order” model combines competence and likeability in a “Reputation” construct with the repeated-indicators approach.'
      },
      vars: [['qual_1…qual_5', 'جوانب جودة المنتج والخدمة (تكويني)', 'Facets of product and service quality (formative)'], ['csr_1…csr_4', 'جوانب المسؤولية الاجتماعية (تكويني)', 'Facets of social responsibility (formative)'], ['comp_1…comp_3', 'الكفاءة', 'Competence'], ['like_1…like_4', 'الجاذبية/الإعجاب', 'Likeability'], ['loy_1…loy_3', 'الولاء', 'Loyalty']],
      analyses: [
        {
          kind: 'cta', model: 0, preset: { samples: 5000, alpha: 0.05, seed: 1 },
          how: { ar: ['اختر «CTA-PLS» (5000 عينة). يُختبر كل بنية لها 4 مؤشرات على الأقل.', 'اقرأ لكل بنية التتراد المستقلة وفواصلها المصححة (Bonferroni).'], en: ['Choose CTA-PLS (5000 samples). Every construct with at least four indicators is tested.', 'For each construct read the non-redundant tetrads and their Bonferroni-adjusted intervals.'] },
          read: { ar: 'في النموذج الانعكاسي كل التتراد تساوي صفراً. إذا كان فاصل أي تترادة لا يتضمن الصفر يُرفض النموذج الانعكاسي ويُفضَّل التكويني؛ وإذا تضمنته كلها فلا دليل ضد القياس الانعكاسي. القرار النهائي نظري أيضاً.', en: 'In a reflective model all tetrads are zero. If any tetrad’s interval excludes zero the reflective model is rejected in favour of a formative one; if all include zero there is no evidence against reflective measurement. The final decision is also theoretical.' },
          expect: { ar: 'Quality وCSR: تترادة واحدة على الأقل غير صفرية، فيُرفض القياس الانعكاسي ويؤكَّد اختيار التكويني. Likeability: كل التتراد صفرية فالقياس الانعكاسي مناسب.', en: 'Quality and CSR: at least one tetrad is non-zero, so reflective measurement is rejected, confirming the formative specification. Likeability: all tetrads are zero, so reflective measurement fits.' }
        },
        {
          kind: 'bootstrap', model: 0, preset: { samples: 5000, seed: 1 },
          how: { ar: ['في النموذج «First order» البنيتان Quality وCSR مضبوطتان على «تكويني (Mode B)» من لوحة الخصائص.', 'شغّل Bootstrapping واقرأ «الأوزان الخارجية» و«VIF الخارجي» و«التشبعات».'], en: ['In the “First order” model Quality and CSR are set to formative (Mode B) in the properties panel.', 'Run bootstrapping and read Outer weights, Outer VIF and Outer loadings.'] },
          read: { ar: 'لكل مؤشر تكويني: VIF < 3 (لا تعدد خطي). إذا كان الوزن دالاً احتفظ بالمؤشر. وإن لم يكن دالاً لكن التشبع ≥ 0.50 احتفظ به أيضاً. وإن كان الوزن غير دال والتشبع < 0.50 فكّر في حذفه — مع مراعاة الصدق المضموني. (Hair وآخرون، 2022).', en: 'For each formative indicator: VIF < 3 (no collinearity). Keep an indicator with a significant weight. Keep it too if the weight is not significant but the loading is ≥ 0.50. Consider removing it when the weight is not significant and the loading is < 0.50, bearing content validity in mind (Hair et al., 2022).' },
          expect: { ar: 'كل VIF الخارجي < 2. csr_4 وزنه ≈ −0.04 غير دال (p ≈ 0.81) وتشبعه ≈ 0.46 < 0.50: مرشّح للحذف. qual_1 وqual_3 وزنهما غير دال لكن تشبعهما قرب 0.50 فيُحتفظ بهما لصدق المضمون. كل المسارات البنائية دالة.', en: 'All outer VIFs are < 2. csr_4 has a weight ≈ −0.04 that is not significant (p ≈ 0.81) and a loading ≈ 0.46 < 0.50: a candidate for removal. qual_1 and qual_3 have non-significant weights but loadings near 0.50, so they are kept for content validity. All structural paths are significant.' }
        },
        {
          kind: 'pls', model: 1, preset: {},
          how: { ar: ['انتقل إلى لسان «Higher order»: البنية Reputation تحمل مؤشرات الكفاءة والجاذبية كلها، وتشير إلى Competence وLikeability (بنيتان من مرتبة أدنى).', 'شغّل PLS-SEM.'], en: ['Switch to the “Higher order” tab: Reputation carries all competence and likeability items and points to Competence and Likeability (lower-order constructs).', 'Run PLS-SEM.'] },
          read: { ar: 'في طريقة المؤشرات المكرّرة تُقرأ مسارات البنية العليا ← البُنى الدنيا كتشبعات للمرتبة الثانية (يُفضَّل ≥ 0.70)، وتُقيَّم موثوقية البنية العليا وAVE من هذه المسارات. ثم تُقرأ المسارات الأخرى كالعادة. للنماذج ذات المتنبئات بالبنية العليا يُنصح بالطريقة المجزّأة (embedded two-stage).', en: 'With repeated indicators, the paths from the higher-order construct to its lower-order constructs are read as second-order loadings (≥ 0.70 preferred), and the higher-order reliability and AVE are judged from them. The other paths are read as usual. When the higher-order construct has predictors, the embedded two-stage approach is recommended.' },
          expect: { ar: 'Reputation ← Competence ≈ 0.78 وReputation ← Likeability ≈ 0.88 (فوق 0.70)، وموثوقية Reputation المركبة ≈ 0.84. المسار Reputation ← Loyalty ≈ 0.36، وتؤثر فيها Quality ≈ 0.37 وCSR ≈ 0.41.', en: 'Reputation → Competence ≈ 0.78 and Reputation → Likeability ≈ 0.88 (above 0.70), and Reputation’s composite reliability ≈ 0.84. Reputation → Loyalty ≈ 0.36, with Quality ≈ 0.37 and CSR ≈ 0.41 driving Reputation.' }
        }
      ]
    },
    // ------------------------------------------------------------------------------------------ segments
    {
      id: 'segments', file: 'hidden_segments.csv',
      title: { ar: 'شرائح خفية من العملاء (FIMIX-PLS وPLS-POS)', en: 'Hidden customer segments (FIMIX-PLS and PLS-POS)' },
      story: {
        ar: '400 عميل من شريحتين لا يعرفهما الباحث: شريحة (≈ 55%) يقودها الرضا إلى الولاء، وشريحة (≈ 45%) يقودها السعر. النموذج الكلي يخلطهما فيُظهر تأثيرين متوسطين مضلِّلين. العمود true_segment هو الشريحة الحقيقية للتحقق فقط — لا يدخل في التحليل.',
        en: '400 customers from two segments unknown to the researcher: one (≈ 55%) where satisfaction drives loyalty and one (≈ 45%) where price does. The global model mixes them and shows two misleading average effects. The column true_segment holds the true segment for checking only — it is not used by the analysis.'
      },
      vars: [['sat_1…sat_3', 'الرضا', 'Satisfaction'], ['price_1…price_3', 'السعر المناسب', 'Price fairness'], ['loy_1…loy_3', 'الولاء', 'Loyalty'], ['true_segment', 'الشريحة الحقيقية (للتحقق)', 'True segment (for checking)']],
      analyses: [
        {
          kind: 'fimix', model: 0, preset: { maxK: 4, K: 2, starts: 10, seed: 1 },
          how: { ar: ['اختر «FIMIX-PLS» بحد أقصى 4 شرائح و10 بدايات.', 'اختر عدد الشرائح من جدول المعايير، ثم اقرأ مسارات كل شريحة.', 'زر «أضف الشرائح إلى البيانات» يضيف عموداً يمكن استخدامه في تحليل المجموعات.'], en: ['Choose FIMIX-PLS with up to 4 segments and 10 starts.', 'Pick the number of segments from the criteria table, then read each segment’s paths.', 'The “Add segments to data” button adds a column you can use in multigroup analysis.'] },
          read: { ar: 'يُختار عدد الشرائح الذي يُصغّر AIC3 وCAIC وBIC معاً (Sarstedt وآخرون، 2011)، مع حجم شريحة كافٍ وقابلية تفسير. EN (الإنتروبيا المعيارية) > 0.50 تعني فصلاً واضحاً. بعدها يُبحث عن متغير يفسّر الشرائح (عمر، دخل…) ثم يُجرى MGA.', en: 'Choose the number of segments that minimises AIC3, CAIC and BIC together (Sarstedt et al., 2011), with adequate segment sizes and interpretability. EN (normed entropy) > 0.50 indicates clear separation. Then look for a variable that explains the segments (age, income…) and run MGA.' },
          expect: { ar: 'AIC3 وBIC وCAIC كلها أصغر عند K = 2. الشريحة 1 (≈ 56%): الرضا ← الولاء ≈ 0.79 والسعر ≈ 0؛ الشريحة 2 (≈ 44%): السعر ≈ 0.92 والرضا ≈ 0. التوافق مع true_segment ≈ 77%، بينما يعطي النموذج الكلي 0.46 و0.39.', en: 'AIC3, BIC and CAIC are all lowest at K = 2. Segment 1 (≈ 56%): Satisfaction → Loyalty ≈ 0.79 and Price ≈ 0; segment 2 (≈ 44%): Price ≈ 0.92 and Satisfaction ≈ 0. Agreement with true_segment ≈ 77%, whereas the global model shows 0.46 and 0.39.' }
        },
        {
          kind: 'pos', model: 0, preset: { K: 2, starts: 5, seed: 1 },
          how: { ar: ['اختر «PLS-POS» بشريحتين وخمس بدايات.'], en: ['Choose PLS-POS with two segments and five starts.'] },
          read: { ar: 'يعيد POS توزيع الحالات لتعظيم R² الموزون، فيكشف تبايناً في النموذج البنائي ونموذج القياس معاً. يُستعمل عادة بعد FIMIX لتأكيد عدد الشرائح.', en: 'POS reassigns cases to maximise the weighted R², detecting heterogeneity in both the structural and measurement models. It is usually run after FIMIX to confirm the segment solution.' },
          expect: { ar: 'يجد الحل نفسه: شريحة رضا (≈ 0.84) وشريحة سعر (≈ 0.94)، وR² لكل شريحة ≥ 0.70 مقابل ≈ 0.42 للنموذج الكلي.', en: 'It finds the same solution: a satisfaction segment (≈ 0.84) and a price segment (≈ 0.94), with R² ≥ 0.70 in each segment against ≈ 0.42 globally.' }
        }
      ]
    },
    // ------------------------------------------------------------------------------------------ advertising
    {
      id: 'advertising', file: 'advertising_sales.csv',
      title: { ar: 'الإعلان والمبيعات (الداخلية والكوبولا الغاوسية)', en: 'Advertising and sales (endogeneity and Gaussian copulas)' },
      story: {
        ar: '400 منطقة بيع. الشركة تنفق على الإعلان أكثر حيث الطلب مرتفع، والطلب غير مقيس ويرفع المبيعات أيضاً؛ فالإنفاق الإعلاني «داخلي» (مرتبط بخطأ المعادلة) ويُبالَغ في تقدير أثره. الإنفاق ملتوٍ (غير طبيعي) وهو شرط طريقة الكوبولا.',
        en: '400 sales regions. The firm spends more on advertising where demand is high, and demand — unmeasured — also raises sales; spending is therefore endogenous (correlated with the equation error) and its effect is overestimated. Spending is skewed (non-normal), which the copula approach requires.'
      },
      vars: [['ad_spend', 'الإنفاق الإعلاني (مؤشر واحد)', 'Advertising spending (single item)'], ['qual_1…qual_3', 'جودة المنتج', 'Product quality'], ['sales_1…sales_3', 'أداء المبيعات', 'Sales performance']],
      analyses: [{
        kind: 'copula', model: 0, preset: { samples: 1000, seed: 1 },
        how: { ar: ['اختر «الكوبولا الغاوسية» (1000 عينة).', 'اقرأ أولاً جدول «اختبار عدم الطبيعية»: لا تُفسَّر الكوبولا إلا للمتنبئ غير الطبيعي.', 'ثم جدول الاختبارات: النموذج الذي يضم كوبولا Advertising وحدها.'], en: ['Choose Gaussian copula (1000 samples).', 'First read the non-normality table: interpret a copula only for a non-normal predictor.', 'Then the tests table: the model with the Advertising copula alone.'] },
        read: { ar: 'حد الكوبولا الدال (p < 0.05) يعني وجود داخلية، فيُعتمد المسار المصحَّح في السطر نفسه؛ وغير الدال يعني لا دليل على الداخلية فيُعتمد التقدير الأصلي. المتنبئ القريب من الطبيعي لا تُعرَّف كوبولاه (تعدد خطي) فتُهمل نتيجته (Hult وآخرون، 2018؛ Becker وآخرون، 2022).', en: 'A significant copula term (p < 0.05) indicates endogeneity, so the corrected path in the same row is used; a non-significant one gives no evidence of endogeneity and the original estimate stands. A near-normal predictor’s copula is not identified (collinearity), so its result is ignored (Hult et al., 2018; Becker et al., 2022).' },
        expect: { ar: 'Advertising غير طبيعي بوضوح (التواء ≈ 6.6) وQuality قريب من الطبيعي. كوبولا Advertising دالة (p < 0.001)، وينخفض المسار Advertising ← Sales من ≈ 0.40 إلى ≈ 0.12 بعد التصحيح: كان معظم الأثر الظاهر نتيجة الطلب غير المقيس. نتيجة كوبولا Quality تُهمل لأنها طبيعية.', en: 'Advertising is clearly non-normal (skewness ≈ 6.6) and Quality is near-normal. The Advertising copula is significant (p < 0.001), and Advertising → Sales drops from ≈ 0.40 to ≈ 0.12 after correction: most of the apparent effect came from the unmeasured demand. The Quality copula is ignored because Quality is normal.' }
      }]
    },
    // ------------------------------------------------------------------------------------------ purchase
    {
      id: 'purchase', file: 'purchase_decision.csv',
      title: { ar: 'قرار الشراء (الانحدار اللوجستي)', en: 'Purchase decision (logistic regression)' },
      story: {
        ar: '500 زائر لمتجر إلكتروني: هل اشترى (1) أم لا (0)؟ الثقة والدخل يرفعان احتمال الشراء، والحساسية للسعر تخفضه، والعمر لا أثر له.',
        en: '500 visitors of an online shop: did they buy (1) or not (0)? Trust and income raise the probability of buying, price sensitivity lowers it, and age has no effect.'
      },
      vars: [['bought', 'اشترى = 1، لم يشترِ = 0', 'Bought = 1, did not buy = 0'], ['trust', 'الثقة بالمتجر 1–7', 'Trust in the shop 1–7'], ['price_sensitivity', 'الحساسية للسعر 1–7', 'Price sensitivity 1–7'], ['income', 'الدخل الشهري (بالألف)', 'Monthly income (thousands)'], ['age', 'العمر', 'Age']],
      analyses: [{
        kind: 'logistic', model: 0, preset: { logY: 'bought', logX: ['trust', 'price_sensitivity', 'income', 'age'] },
        how: { ar: ['اختر «الانحدار اللوجستي»، المتغير الثنائي bought، والمتنبئات الأربعة (Ctrl للتحديد المتعدد).'], en: ['Choose Logistic regression with binary outcome bought and the four predictors (Ctrl-click to select several).'] },
        read: { ar: 'نسبة الأرجحية (OR) > 1 ترفع احتمال الحدث لكل وحدة زيادة، و< 1 تخفضه؛ وتكون دالة إذا لم يتضمن فاصلها 1. اختبار نسبة الأرجحية (LR) يختبر النموذج كله، وR² لناجلكيرك وصف تقريبي، وAUC ≥ 0.70 تمييز مقبول و≥ 0.80 ممتاز، واختبار هوسمر–ليمشو غير الدال (p > 0.05) يعني معايرة جيدة.', en: 'An odds ratio (OR) > 1 raises the odds of the event per unit increase and < 1 lowers them; it is significant when its interval excludes 1. The likelihood-ratio test checks the whole model, Nagelkerke R² is descriptive, AUC ≥ 0.70 is acceptable discrimination and ≥ 0.80 excellent, and a non-significant Hosmer–Lemeshow test (p > 0.05) means good calibration.' },
        expect: { ar: 'OR للثقة ≈ 2.1 (كل درجة ثقة تضاعف أرجحية الشراء تقريباً)، وللحساسية للسعر ≈ 0.63، وللدخل ≈ 1.02 لكل ألف؛ وكلها دالة. العمر غير دال (p ≈ 0.83). AUC ≈ 0.76 ونسبة التصنيف الصحيح ≈ 71% واختبار هوسمر–ليمشو غير دال.', en: 'OR for trust ≈ 2.1 (each point of trust roughly doubles the odds of buying), for price sensitivity ≈ 0.63 and for income ≈ 1.02 per thousand; all significant. Age is not (p ≈ 0.83). AUC ≈ 0.76, about 71% correctly classified, and the Hosmer–Lemeshow test is not significant.' }
      }]
    },
    // ------------------------------------------------------------------------------------------ weighted
    {
      id: 'weighted', file: 'weighted_survey.csv',
      title: { ar: 'عينة غير ممثِّلة (PLS الموزون وتحليل المجموعات)', en: 'Unrepresentative sample (weighted PLS and multigroup analysis)' },
      story: {
        ar: 'سكان المدن 30% من المجتمع لكنهم 75% من العينة (400). أثر الرضا في الولاء ضعيف في المدن قوي في الريف، فالتقدير غير الموزون منحاز نحو المدن. عمود weight = نسبة المجتمع ÷ نسبة العينة لكل منطقة.',
        en: 'City residents are 30% of the population but 75% of the sample (400). Satisfaction drives loyalty weakly in cities and strongly in rural areas, so the unweighted estimate is biased towards cities. Column weight = population share ÷ sample share of each region.'
      },
      vars: [['region', 'المنطقة: urban (مدن) أو rural (ريف)', 'Region: urban or rural'], ['sat_1…sat_3', 'الرضا', 'Satisfaction'], ['loy_1…loy_3', 'الولاء', 'Loyalty'], ['weight', 'وزن المعاينة (0.4 للمدن، 2.8 للريف)', 'Sampling weight (0.4 urban, 2.8 rural)']],
      analyses: [
        {
          kind: 'pls', model: 0, preset: { weightVar: 'weight' },
          how: { ar: ['شغّل PLS-SEM مرة بلا وزن، ثم مرة أخرى مع «متغير الأوزان» = weight (WPLS).', 'استعمل «مقارنة التقارير» لوضع النتيجتين جنباً إلى جنب.'], en: ['Run PLS-SEM once without weights, then again with Weighting variable = weight (WPLS).', 'Use “Compare reports” to put both results side by side.'] },
          read: { ar: 'PLS الموزون (Becker & Ismail, 2016) يعطي كل حالة وزناً بقدر ما تمثّله من المجتمع، فيقرّب التقديرات من قيم المجتمع حين تكون العينة غير متناسبة. لا يصلح الوزن لتصحيح عينة متحيزة في متغيرات غير معروفة.', en: 'Weighted PLS (Becker & Ismail, 2016) gives each case the weight of the population it represents, moving estimates towards population values when the sample is disproportionate. Weighting cannot fix a sample biased on unknown variables.' },
          expect: { ar: 'المسار الرضا ← الولاء ≈ 0.27 بلا وزن، ويرتفع إلى ≈ 0.40 بالوزن؛ وR² من ≈ 0.07 إلى ≈ 0.16.', en: 'Satisfaction → Loyalty is ≈ 0.27 unweighted and rises to ≈ 0.40 weighted; R² rises from ≈ 0.07 to ≈ 0.16.' }
        },
        {
          kind: 'mga', model: 0, preset: { groupVar: 'region', permutations: 1000, bootSamples: 1000, seed: 1 },
          how: { ar: ['اختر «تحليل المجموعات المتعددة (MGA)» ومتغير المجموعة region (urban مقابل rural).', 'اقرأ أولاً MICOM (الخطوة 2: الثبات التركيبي)، ثم فروق المسارات بطرق التبديل وHenseler والبارامترية وWelch–Satterthwaite.'], en: ['Choose Multigroup analysis (MGA) with group variable region (urban vs rural).', 'Read MICOM first (step 2: compositional invariance), then the path differences by permutation, Henseler’s MGA, the parametric and the Welch–Satterthwaite tests.'] },
          read: { ar: 'MICOM: إذا كانت c ≥ المئين 5% فالثبات التركيبي متحقق ويجوز مقارنة المسارات (ثبات جزئي)؛ وإن تساوت المتوسطات والتباينات أيضاً فالثبات كامل ويجوز دمج البيانات. فرق المسار دال إذا كانت p للتبديل < 0.05 (أو p لـHenseler < 0.05 أو > 0.95).', en: 'MICOM: c ≥ its 5% quantile establishes compositional invariance, allowing path comparison (partial invariance); equal means and variances as well give full invariance, allowing pooling. A path difference is significant when the permutation p < 0.05 (or Henseler’s p < 0.05 or > 0.95).' },
          expect: { ar: 'الثبات التركيبي متحقق للبنيتين. المسار ≈ 0.21 في المدن و≈ 0.51 في الريف، والفرق ≈ −0.29 دال بكل الطرق (p للتبديل ≈ 0.001).', en: 'Compositional invariance holds for both constructs. The path is ≈ 0.21 urban and ≈ 0.51 rural, and the difference ≈ −0.29 is significant by every method (permutation p ≈ 0.001).' }
        }
      ]
    },
    // ------------------------------------------------------------------------------------------ matrix
    {
      id: 'matrix', file: 'cfa_correlations.csv', matrix: true,
      title: { ar: 'مصفوفة ارتباطات منشورة (CB-SEM من مصفوفة)', en: 'A published correlation matrix (CB-SEM from a matrix)' },
      story: {
        ar: 'كثيراً ما تنشر الأبحاث مصفوفة الارتباطات والانحرافات المعيارية فقط. هذا الملف مصفوفة لتسعة اختبارات قدرات (n = 301): بصرية ولفظية وسرعة، مع مسارين: القدرة البصرية واللفظية ← السرعة. يولّد البرنامج بيانات تعيد إنتاج المصفوفة تماماً، فتطابق تقديرات CB-SEM وPLS ما تُعطيه البيانات الأصلية.',
        en: 'Papers often publish only a correlation matrix and standard deviations. This file is the matrix of nine ability tests (n = 301): visual, verbal (textual) and speed, with two paths: Visual and Textual → Speed. YouPls generates data that reproduce the matrix exactly, so CB-SEM and PLS estimates equal those from the original data.'
      },
      vars: [['visual_1…visual_3', 'اختبارات بصرية مكانية', 'Visual-spatial tests'], ['text_1…text_3', 'اختبارات لفظية', 'Verbal tests'], ['speed_1…speed_3', 'اختبارات سرعة', 'Speed tests'], ['sd', 'سطر الانحرافات المعيارية', 'Row of standard deviations']],
      analyses: [{
        kind: 'cbsem', model: 0, preset: { cbBoot: 0 },
        how: { ar: ['حمّل المثال (أو استورد ملفك بزر «استيراد مصفوفة تغاير/ارتباط» وأدخل حجم العينة).', 'اختر CB-SEM. لا يتاح Bootstrap ولا التحليلات المعتمدة على الحالات مع المصفوفات.'], en: ['Load the example (or import your own file with “Import covariance/correlation matrix” and enter the sample size).', 'Choose CB-SEM. Bootstrapping and case-level analyses are not available for matrix input.'] },
        read: { ar: 'تُقرأ المطابقة والتشبعات والمسارات كما في أي CB-SEM. صيغة الملف: سطر رأس بالأسماء، ثم مصفوفة كاملة أو مثلث سفلي، وسطر اختياري sd (لتحويل الارتباطات إلى تغايرات) وسطر mean.', en: 'Fit, loadings and paths are read as in any CB-SEM. File format: a header of names, then a full or lower-triangular matrix, an optional sd row (to turn correlations into covariances) and a mean row.' },
        expect: { ar: 'CFI ≈ 0.97 وRMSEA ≈ 0.06 وSRMR ≈ 0.03: مطابقة مقبولة. Visual ← Speed ≈ 0.32 (p ≈ 0.001) وTextual ← Speed ≈ 0.18 (p ≈ 0.04). موثوقية العامل اللفظي ≈ 0.88، أما AVE للبصري والسرعة فأقل من 0.50.', en: 'CFI ≈ 0.97, RMSEA ≈ 0.06 and SRMR ≈ 0.03: acceptable fit. Visual → Speed ≈ 0.32 (p ≈ 0.001) and Textual → Speed ≈ 0.18 (p ≈ 0.04). The verbal factor’s reliability is ≈ 0.88, while the AVE of Visual and Speed is below 0.50.' }
      }]
    }
  ];
  root.YP_EXAMPLES = EX;
  if (typeof module !== 'undefined' && module.exports) module.exports = EX;
})(typeof self !== 'undefined' ? self : this);
