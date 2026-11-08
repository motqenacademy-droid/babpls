/*
 * BabPls UI plugin: PROCESS (Hayes) models 1–92 (see the plugin contract above PLUGINS in js/app.js).
 * Engine: js/process2.js (E.tasks.hayes). Run dialog: model chooser with a live preview of the equations and the
 * conceptual diagram; results: model summary, outcome models, conditional/indirect effects and indices,
 * Johnson–Neyman region, interaction plot.
 */
(function (root) {
  'use strict';
  const E = root.YPEngine;
  const LRI = '⁦', PDI = '⁩', iso = s => LRI + s + PDI; // keep "X→M" left-to-right inside Arabic text

  // ------------------------------------------------------------------ i18n
  const en = {
    menu_process: 'PROCESS (Hayes)',
    an_hayes: 'PROCESS models 1–92 (Hayes)',
    an_hayes_d: 'Conditional process analysis with every numbered PROCESS model (Hayes, 2022; PROCESS v4): mediation (up to 10 parallel or 6 serial mediators), moderation by W and Z, moderated mediation, with HC standard errors, bootstrap confidence intervals, Johnson–Neyman regions and indices of moderated mediation. Variables can be data columns or construct scores.',
    f_hModel: 'PROCESS model', f_hPreview: 'Equations of the chosen model', f_hX: 'Independent variable X', f_hY: 'Outcome Y',
    f_hM: 'Mediators M', f_hW: 'Moderator W', f_hZ: 'Second moderator Z', f_hCov: 'Covariates', f_hCovIn: 'Covariates enter',
    f_hMcx: 'Multicategorical X', f_hCenter: 'Mean centring', f_hHC: 'Standard errors', f_hProbe: 'Probe moderators at',
    f_hBoot: 'Bootstrap samples (0 = none)', f_hConf: 'Confidence level (%)', f_hBootCI: 'Bootstrap intervals', f_hContrast: 'Contrasts of indirect effects',
    f_hJN: 'Johnson–Neyman technique', f_hTotal: 'Total effect model', f_hEff: 'Standardized effect sizes', f_hSobel: 'Sobel (normal theory) test (model 4)',
    f_hCondC: 'Pairwise contrasts of conditional indirect effects',
    hy_cov_all: 'All equations', hy_cov_m: 'Mediator equations only', hy_cov_y: 'Outcome equation only',
    hy_mcx_: 'No (continuous or dichotomous X)', hy_mcx_indicator: 'Indicator (dummy) coding', hy_mcx_sequential: 'Sequential coding', hy_mcx_helmert: 'Helmert coding', hy_mcx_effect: 'Effect coding',
    hy_cen_none: 'None', hy_cen_all: 'All variables that define products', hy_cen_cont: 'Only continuous variables that define products',
    hy_hc_: 'OLS', hy_probe_percentiles: '16th, 50th and 84th percentiles', hy_probe_moments: 'Mean and ±1 SD',
    hy_ci_percentile: 'Percentile', hy_ci_bc: 'Bias-corrected', hy_con_0: 'None', hy_con_1: 'Pairwise differences', hy_con_2: 'Differences in absolute values',
    hy_order_hint: 'Mediators are used in the order you select them (M1, M2, …); serial models follow this causal order.',
    hy_needs: 'Needs', hy_mediators: 'mediators', hy_mediator: 'mediator',
    hy_moderation: 'moderation', hy_simple: 'simple mediation', hy_parallel: 'parallel mediation', hy_serial: 'serial mediation', hy_mixed: 'parallel and serial mediation',
    hy_by: 'moderated by', hy_three: 'three-way', hy_x_mod: 'X moderates M→Y',
    hy_m80: 'M1…Mk−1 in parallel, all → Mk', hy_m81: 'M1 → each of M2…Mk', hy_m82: 'two serial pairs M1→M2 and M3→M4',
    hy_model: 'Model and equations', hy_modelno: 'Model', hy_roles: 'Variables', hy_role: 'Role', hy_variable: 'Variable',
    hy_sample: 'Sample size', hy_settings: 'Settings', hy_equations: 'Equations', hy_diagram: 'Conceptual diagram', hy_coding: 'Coding of X', hy_group: 'Group',
    hy_probes: 'Values of the moderators used for probing', hy_moderator: 'Moderator', hy_values: 'Values', hy_dich: 'dichotomous: its two values',
    hy_centered: 'Mean-centred prior to analysis: {v}.', hy_nocenter: 'No variables were mean centred.', hy_codes_note: 'Codes of a multicategorical X are not centred.',
    hy_eqs: 'Outcome models', hy_outcome: 'Outcome', hy_summary: 'Model summary', hy_coefs: 'Coefficients', hy_tests: 'Test(s) of highest-order unconditional interaction(s)',
    hy_term: 'Term', hy_both: 'Both', hy_hcnote: 'Standard errors, t, p, CIs and F use {hc}.', hy_total_model: 'Total effect model',
    hy_effects: 'Direct and indirect effects', hy_cond: 'Conditional effects of the focal predictor', hy_condint: 'Test of conditional {i} interaction at values of {z}',
    hy_direct: 'Direct effect of X on Y', hy_cdirect: 'Conditional direct effect(s) of X on Y', hy_total: 'Total effect of X on Y', hy_indirect: 'Indirect effect(s) of X on Y',
    hy_cindirect: 'Conditional indirect effects of X on Y', hy_path: 'Path', hy_tot_ind: 'Total indirect', hy_omnibus: 'Omnibus test of X (all codes)',
    hy_indices: 'Indices', hy_imm: 'Index of moderated mediation', hy_pmm: 'Index of partial moderated mediation', hy_cmm: 'Index of conditional moderated mediation',
    hy_mmm: 'Index of moderated moderated mediation', hy_at: 'at', hy_index: 'Index', hy_type: 'Index type',
    hy_contrasts: 'Specific indirect effect contrasts', hy_ccontrasts: 'Pairwise contrasts between conditional indirect effects', hy_std: 'Standardized effects',
    hy_partial: 'Partially standardized', hy_complete: 'Completely standardized', hy_sobel: 'Normal theory (Sobel) test of the indirect effect',
    hy_boot_note: '{b} bootstrap samples ({ci}), {c}% intervals, seed {s}. An effect is significant when its interval excludes zero.',
    hy_noboot: 'No bootstrap samples were requested: indirect effects are shown without intervals.', hy_replaced: '{n} bootstrap samples were singular and were replaced.',
    hy_jn: 'Johnson–Neyman technique', hy_jn_points: 'Moderator value(s) defining Johnson–Neyman significance region(s)', hy_jn_none: 'There are no statistical significance transition points within the observed range of {m}.',
    hy_below: '% below', hy_above: '% above', hy_jn_table: 'Conditional effect of {f} at values of {m}', hy_plot: 'Interaction plot',
    hy_plot_note: 'Predicted {y} at values of {f} for the probed values of the moderator(s); other variables at their means.',
    hy_effect: 'Effect', hy_coeff: 'coeff',
    hy_mean: 'mean', hy_sd: 'SD', hy_none: 'none',
    err_hayes_vars: 'Choose X and Y (and the variables the model needs) for the PROCESS model.', err_hayes_nmed: 'This PROCESS model needs a different number of mediators (see the equations preview).',
    err_hayes_mods: 'This PROCESS model needs the moderator W (and Z for models with two moderators).', err_hayes_dup: 'Each variable can have only one role (X, Y, M, W, Z or covariate).',
    err_hayes_mcx: 'A multicategorical X needs 3 to 9 groups with at least 2 cases each.', err_hayes_mcx74: 'Model 74 needs a continuous or dichotomous X.',
    err_hayes_n: 'Too few complete cases for the PROCESS model.', err_hayes_singular: 'A regression in the model is singular (collinear predictors).', err_hayes_model: 'Unknown PROCESS model number.'
  };
  const ar = {
    menu_process: 'PROCESS (هايز)',
    an_hayes: 'نماذج PROCESS من 1 إلى 92 (هايز)',
    an_hayes_d: 'تحليل العمليات المشروطة بكل نماذج PROCESS المرقَّمة (Hayes، 2022؛ الإصدار الرابع): الوساطة (حتى 10 وسطاء متوازين أو 6 متسلسلين)، والتعديل بالمعدِّلين W وZ، والوساطة المعدَّلة، مع أخطاء معيارية متسقة مع عدم تجانس التباين (HC)، وفترات ثقة بالإقلاع الذاتي، ومناطق جونسون–نيمان، ومؤشرات الوساطة المعدَّلة. المتغيرات أعمدة من البيانات أو درجات متغيرات كامنة.',
    f_hModel: 'نموذج PROCESS', f_hPreview: 'معادلات النموذج المختار', f_hX: 'المتغير المستقل X', f_hY: 'المتغير التابع Y',
    f_hM: 'المتغيرات الوسيطة M', f_hW: 'المتغير المعدِّل W', f_hZ: 'المعدِّل الثاني Z', f_hCov: 'المتغيرات الضابطة', f_hCovIn: 'موضع المتغيرات الضابطة',
    f_hMcx: 'X متعدد الفئات', f_hCenter: 'التمركز حول المتوسط', f_hHC: 'الأخطاء المعيارية', f_hProbe: 'قيم فحص المعدِّلات',
    f_hBoot: 'عينات الإقلاع الذاتي (0 = بلا إقلاع)', f_hConf: 'مستوى الثقة (%)', f_hBootCI: 'فترات الإقلاع الذاتي', f_hContrast: 'مقارنات الآثار غير المباشرة',
    f_hJN: 'أسلوب جونسون–نيمان', f_hTotal: 'نموذج الأثر الكلي', f_hEff: 'أحجام الأثر المعيارية', f_hSobel: 'اختبار سوبل (النظرية الطبيعية) للنموذج 4',
    f_hCondC: 'مقارنات زوجية بين الآثار غير المباشرة المشروطة',
    hy_cov_all: 'كل المعادلات', hy_cov_m: 'معادلات الوسطاء فقط', hy_cov_y: 'معادلة المتغير التابع فقط',
    hy_mcx_: 'لا (X متصل أو ثنائي)', hy_mcx_indicator: 'الترميز المؤشِّري (الوهمي)', hy_mcx_sequential: 'الترميز التتابعي', hy_mcx_helmert: 'ترميز هلمرت', hy_mcx_effect: 'ترميز الأثر',
    hy_cen_none: 'بلا تمركز', hy_cen_all: 'كل المتغيرات الداخلة في حواصل الضرب', hy_cen_cont: 'المتغيرات المتصلة فقط من الداخلة في حواصل الضرب',
    hy_hc_: 'المربعات الصغرى العادية (OLS)', hy_probe_percentiles: 'المئينات 16 و50 و84', hy_probe_moments: 'المتوسط و±1 انحراف معياري',
    hy_ci_percentile: 'المئينية', hy_ci_bc: 'المصحَّحة للتحيّز', hy_con_0: 'لا شيء', hy_con_1: 'الفروق الزوجية', hy_con_2: 'فروق القيم المطلقة',
    hy_order_hint: 'تُستعمل الوسطاء بترتيب اختيارك لها (M1، M2، …)، وتتبع النماذج التسلسلية هذا الترتيب السببي.',
    hy_needs: 'يتطلب', hy_mediators: 'وسطاء', hy_mediator: 'وسيطاً',
    hy_moderation: 'تعديل', hy_simple: 'وساطة بسيطة', hy_parallel: 'وساطة متوازية', hy_serial: 'وساطة تسلسلية', hy_mixed: 'وساطة متوازية وتسلسلية',
    hy_by: 'يعدّله', hy_three: 'تفاعل ثلاثي', hy_x_mod: 'X يعدّل المسار M→Y',
    hy_m80: 'M1…Mk−1 متوازية وكلها تؤثر في Mk', hy_m81: 'M1 يؤثر في كلٍّ من M2…Mk', hy_m82: 'زوجان تسلسليان M1→M2 وM3→M4',
    hy_model: 'النموذج ومعادلاته', hy_modelno: 'النموذج', hy_roles: 'المتغيرات', hy_role: 'الدور', hy_variable: 'المتغير',
    hy_sample: 'حجم العينة', hy_settings: 'الإعدادات', hy_equations: 'المعادلات', hy_diagram: 'المخطط المفاهيمي', hy_coding: 'ترميز X', hy_group: 'الفئة',
    hy_probes: 'قيم المعدِّلات المستخدمة في الفحص', hy_moderator: 'المعدِّل', hy_values: 'القيم', hy_dich: 'ثنائي: قيمتاه',
    hy_centered: 'مُركَزت حول المتوسط قبل التحليل: {v}.', hy_nocenter: 'لم يُمركَز أي متغير حول متوسطه.', hy_codes_note: 'رموز X متعدد الفئات لا تُمركَز.',
    hy_eqs: 'نماذج المتغيرات التابعة', hy_outcome: 'المتغير التابع', hy_summary: 'ملخص النموذج', hy_coefs: 'المعاملات', hy_tests: 'اختبار التفاعل (التفاعلات) غير المشروط من أعلى رتبة',
    hy_term: 'الحد', hy_both: 'كلاهما', hy_hcnote: 'الأخطاء المعيارية وt وp وفترات الثقة وF محسوبة بـ {hc}.', hy_total_model: 'نموذج الأثر الكلي',
    hy_effects: 'الآثار المباشرة وغير المباشرة', hy_cond: 'الآثار المشروطة للمتغير المحوري', hy_condint: 'اختبار التفاعل المشروط {i} عند قيم {z}',
    hy_direct: 'الأثر المباشر لـ X في Y', hy_cdirect: 'الأثر (الآثار) المباشر المشروط لـ X في Y', hy_total: 'الأثر الكلي لـ X في Y', hy_indirect: 'الأثر (الآثار) غير المباشر لـ X في Y',
    hy_cindirect: 'الآثار غير المباشرة المشروطة لـ X في Y', hy_path: 'المسار', hy_tot_ind: 'الأثر غير المباشر الكلي', hy_omnibus: 'الاختبار الشامل لـ X (كل الرموز)',
    hy_indices: 'المؤشرات', hy_imm: 'مؤشر الوساطة المعدَّلة', hy_pmm: 'مؤشر الوساطة المعدَّلة الجزئية', hy_cmm: 'مؤشر الوساطة المعدَّلة المشروطة',
    hy_mmm: 'مؤشر الوساطة المعدَّلة المعدَّلة', hy_at: 'عند', hy_index: 'المؤشر', hy_type: 'نوع المؤشر',
    hy_contrasts: 'مقارنات الآثار غير المباشرة النوعية', hy_ccontrasts: 'مقارنات زوجية بين الآثار غير المباشرة المشروطة', hy_std: 'الآثار المعيارية',
    hy_partial: 'معيارية جزئياً', hy_complete: 'معيارية كلياً', hy_sobel: 'اختبار النظرية الطبيعية (سوبل) للأثر غير المباشر',
    hy_boot_note: '{b} عينة إقلاع ذاتي ({ci})، وفترات ثقة {c}%، والبذرة {s}. يكون الأثر دالاً إذا لم تتضمن فترته الصفر.',
    hy_noboot: 'لم تُطلب عينات إقلاع ذاتي، فتُعرض الآثار غير المباشرة بلا فترات ثقة.', hy_replaced: 'استُبدلت {n} عينة إقلاع ذاتي لأنها أعطت مصفوفة منفردة.',
    hy_jn: 'أسلوب جونسون–نيمان', hy_jn_points: 'قيمة (قيم) المعدِّل التي تحدّ منطقة (مناطق) الدلالة', hy_jn_none: 'لا توجد نقاط انتقال في الدلالة الإحصائية ضمن المدى المشاهَد لـ {m}.',
    hy_below: '% تحتها', hy_above: '% فوقها', hy_jn_table: 'الأثر المشروط لـ {f} عند قيم {m}', hy_plot: 'رسم التفاعل',
    hy_plot_note: 'قيم {y} المتنبأ بها عند قيم {f} لكل قيمة مفحوصة من المعدِّل (المعدِّلات)، وبقية المتغيرات عند متوسطاتها.',
    hy_effect: 'الأثر', hy_coeff: 'المعامل',
    hy_mean: 'المتوسط', hy_sd: 'الانحراف المعياري', hy_none: 'لا شيء',
    err_hayes_vars: 'اختر X وY (والمتغيرات التي يتطلبها النموذج) لنموذج PROCESS.', err_hayes_nmed: 'يتطلب نموذج PROCESS هذا عدداً مختلفاً من الوسطاء (انظر معاينة المعادلات).',
    err_hayes_mods: 'يتطلب نموذج PROCESS هذا المعدِّل W (وZ في النماذج ذات المعدِّلين).', err_hayes_dup: 'لكل متغير دور واحد فقط (X أو Y أو M أو W أو Z أو ضابط).',
    err_hayes_mcx: 'يتطلب X متعدد الفئات من 3 إلى 9 فئات في كلٍّ منها حالتان على الأقل.', err_hayes_mcx74: 'يتطلب النموذج 74 متغيراً X متصلاً أو ثنائياً.',
    err_hayes_n: 'عدد الحالات المكتملة قليل جداً لنموذج PROCESS.', err_hayes_singular: 'إحدى معادلات الانحدار في النموذج منفردة (متنبئات متداخلة خطياً).', err_hayes_model: 'رقم نموذج PROCESS غير معروف.'
  };

  // ------------------------------------------------------------ references
  const refs = {
    pr_hayes2022: 'Hayes, A. F. (2022). <i>Introduction to mediation, moderation, and conditional process analysis: A regression-based approach</i> (3rd ed.). Guilford Press.',
    pr_hayes2013: 'Hayes, A. F. (2013). <i>Introduction to mediation, moderation, and conditional process analysis: A regression-based approach</i>. Guilford Press.',
    pr_hayes2015: 'Hayes, A. F. (2015). An index and test of linear moderated mediation. <i>Multivariate Behavioral Research, 50</i>(1), 1–22. https://doi.org/10.1080/00273171.2014.962683',
    pr_hayes2018: 'Hayes, A. F. (2018). Partial, conditional, and moderated moderated mediation: Quantification, inference, and interpretation. <i>Communication Monographs, 85</i>(1), 4–40. https://doi.org/10.1080/03637751.2017.1352100',
    pr_preacher2004: 'Preacher, K. J., & Hayes, A. F. (2004). SPSS and SAS procedures for estimating indirect effects in simple mediation models. <i>Behavior Research Methods, Instruments, &amp; Computers, 36</i>(4), 717–731. https://doi.org/10.3758/BF03206553',
    pr_preacher2008: 'Preacher, K. J., & Hayes, A. F. (2008). Asymptotic and resampling strategies for assessing and comparing indirect effects in multiple mediator models. <i>Behavior Research Methods, 40</i>(3), 879–891. https://doi.org/10.3758/BRM.40.3.879',
    pr_preacher2007: 'Preacher, K. J., Rucker, D. D., & Hayes, A. F. (2007). Addressing moderated mediation hypotheses: Theory, methods, and prescriptions. <i>Multivariate Behavioral Research, 42</i>(1), 185–227. https://doi.org/10.1080/00273170701341316',
    pr_alwin1975: 'Alwin, D. F., & Hauser, R. M. (1975). The decomposition of effects in path analysis. <i>American Sociological Review, 40</i>(1), 37–47. https://doi.org/10.2307/2094445',
    pr_sobel1982: 'Sobel, M. E. (1982). Asymptotic confidence intervals for indirect effects in structural equation models. <i>Sociological Methodology, 13</i>, 290–312. https://doi.org/10.2307/270723',
    pr_johnson1936: 'Johnson, P. O., & Neyman, J. (1936). Tests of certain linear hypotheses and their application to some educational problems. <i>Statistical Research Memoirs, 1</i>, 57–93.',
    pr_bauer2005: 'Bauer, D. J., & Curran, P. J. (2005). Probing interactions in fixed and multilevel regression: Inferential and graphical techniques. <i>Multivariate Behavioral Research, 40</i>(3), 373–400. https://doi.org/10.1207/s15327906mbr4003_5',
    pr_hayes2009: 'Hayes, A. F., & Matthes, J. (2009). Computational procedures for probing interactions in OLS and logistic regression: SPSS and SAS implementations. <i>Behavior Research Methods, 41</i>(3), 924–936. https://doi.org/10.3758/BRM.41.3.924',
    pr_aiken1991: 'Aiken, L. S., & West, S. G. (1991). <i>Multiple regression: Testing and interpreting interactions</i>. Sage.',
    pr_rogosa1980: 'Rogosa, D. (1980). Comparing nonparallel regression lines. <i>Psychological Bulletin, 88</i>(2), 307–321. https://doi.org/10.1037/0033-2909.88.2.307',
    pr_white1980: 'White, H. (1980). A heteroskedasticity-consistent covariance matrix estimator and a direct test for heteroskedasticity. <i>Econometrica, 48</i>(4), 817–838. https://doi.org/10.2307/1912934',
    pr_mackinnon1985: 'MacKinnon, J. G., & White, H. (1985). Some heteroskedasticity-consistent covariance matrix estimators with improved finite sample properties. <i>Journal of Econometrics, 29</i>(3), 305–325. https://doi.org/10.1016/0304-4076(85)90158-7',
    pr_cribari2004: 'Cribari-Neto, F. (2004). Asymptotic inference under heteroskedasticity of unknown form. <i>Computational Statistics &amp; Data Analysis, 45</i>(2), 215–233. https://doi.org/10.1016/S0167-9473(02)00366-3',
    pr_long2000: 'Long, J. S., & Ervin, L. H. (2000). Using heteroscedasticity consistent standard errors in the linear regression model. <i>The American Statistician, 54</i>(3), 217–224. https://doi.org/10.1080/00031305.2000.10474549',
    pr_hayes2007: 'Hayes, A. F., & Cai, L. (2007). Using heteroskedasticity-consistent standard error estimators in OLS regression: An introduction and software implementation. <i>Behavior Research Methods, 39</i>(4), 709–722. https://doi.org/10.3758/BF03192961',
    pr_efron1993: 'Efron, B., & Tibshirani, R. J. (1993). <i>An introduction to the bootstrap</i>. Chapman &amp; Hall.',
    pr_mackinnon2004: 'MacKinnon, D. P., Lockwood, C. M., & Williams, J. (2004). Confidence limits for the indirect effect: Distribution of the product and resampling methods. <i>Multivariate Behavioral Research, 39</i>(1), 99–128. https://doi.org/10.1207/s15327906mbr3901_4',
    pr_hayes2014: 'Hayes, A. F., & Preacher, K. J. (2014). Statistical mediation analysis with a multicategorical independent variable. <i>British Journal of Mathematical and Statistical Psychology, 67</i>(3), 451–470. https://doi.org/10.1111/bmsp.12028',
    pr_preacher2011: 'Preacher, K. J., & Kelley, K. (2011). Effect size measures for mediation models: Quantitative strategies for communicating indirect effects. <i>Psychological Methods, 16</i>(2), 93–115. https://doi.org/10.1037/a0022658'
  };

  // ---------------------------------------------------------------- MathML
  const mi = s => `<mi>${s}</mi>`, mo = s => `<mo>${s}</mo>`, mn = s => `<mn>${s}</mn>`, sub = (a, b) => `<msub>${a}${b}</msub>`, row = (...a) => `<mrow>${a.join('')}</mrow>`;
  const sup = (a, b) => `<msup>${a}${b}</msup>`, subsup = (a, b, c) => `<msubsup>${a}${b}${c}</msubsup>`, frac = (a, b) => `<mfrac>${a}${b}</mfrac>`, sqrt = a => `<msqrt>${a}</msqrt>`;
  const txt = s => `<mtext>${s}</mtext>`, math = (...rows) => `<math display="block">${rows.length > 1 ? `<mtable columnalign="left">${rows.map(r => `<mtr><mtd>${r}</mtd></mtr>`).join('')}</mtable>` : rows[0]}</math>`;
  const P = (...a) => row(mo('('), ...a, mo(')'));
  const a1 = sub(mi('a'), mn(1)), a3 = sub(mi('a'), mn(3)), b1 = sub(mi('b'), mn(1)), b3 = sub(mi('b'), mn(3)), W = mi('W'), Z = mi('Z'), X = mi('X');
  const s2 = v => subsup(mi('s'), v, mn(2)), s12 = sub(mi('s'), row(sub(mi('b'), mn(1)), sub(mi('b'), mn(3)))), tcr = sub(mi('t'), txt('crit'));
  const F = {
    hayes: math(
      row(sub(mi('Y'), mi('j')), mo('='), sub(mi('i'), mi('j')), mo('+'), `<munder>${mo('∑')}${row(mi('k'), mo('→'), mi('j'))}</munder>`, sub(mi('θ'), row(mi('k'), mo('→'), mi('j'))), P(W, mo(','), Z), sub(mi('V'), mi('k')), mo('+'), sub(mi('b'), W), W, mo('+'), sub(mi('b'), Z), Z, mo('+'), sub(mi('b'), row(W, Z)), W, Z, mo('+'), sup(mi('γ'), mo('′')), mi('C'), mo('+'), sub(mi('e'), mi('j'))),
      row(sub(mi('θ'), row(mi('k'), mo('→'), mi('j'))), P(W, mo(','), Z), mo('='), sub(mi('b'), mi('k')), mo('+'), sub(mi('b'), row(mi('k'), W)), W, mo('+'), sub(mi('b'), row(mi('k'), Z)), Z, mo('+'), sub(mi('b'), row(mi('k'), W, Z)), W, Z)),
    hayes_med: math(
      row(sub(mi('ω'), mi('i')), mo('='), sub(mi('a'), mi('i')), sub(mi('b'), mi('i')), mo(','), txt('  '), sub(mi('ω'), txt('serial')), mo('='), a1, sub(mi('d'), mn(21)), sub(mi('b'), mn(2))),
      row(mi('c'), mo('='), sup(mi('c'), mo('′')), mo('+'), `<munder>${mo('∑')}${mi('i')}</munder>`, sub(mi('ω'), mi('i')), mo(','), txt('  '), sub(mi('ω'), mi('i')), mo('−'), sub(mi('ω'), mi('j')), txt(' (contrast)'))),
    hayes_mod: math(
      row(sub(mi('θ'), row(X, mo('→'), mi('Y'))), P(W), mo('='), b1, mo('+'), b3, W, mo(','), txt('  '), mi('t'), mo('='), frac(row(b1, mo('+'), b3, W), sqrt(row(s2(b1), mo('+'), mn(2), W, s12, mo('+'), sup(W, mn(2)), s2(b3))))),
      row(mi('F'), mo('='), frac(row(mi('Δ'), sup(mi('R'), mn(2)), mo('/'), mi('q')), row(P(mn(1), mo('−'), sup(mi('R'), mn(2))), mo('/'), sub(mi('df'), txt('res')))))),
    hayes_jn: math(
      row(sup(P(b1, mo('+'), b3, W), mn(2)), mo('='), sup(tcr, mn(2)), P(s2(b1), mo('+'), mn(2), W, s12, mo('+'), sup(W, mn(2)), s2(b3))),
      row(mo('⇔'), P(sup(b3, mn(2)), mo('−'), sup(tcr, mn(2)), s2(b3)), sup(W, mn(2)), mo('+'), mn(2), P(b1, b3, mo('−'), sup(tcr, mn(2)), s12), W, mo('+'), P(sup(b1, mn(2)), mo('−'), sup(tcr, mn(2)), s2(b1)), mo('='), mn(0))),
    hayes_imm: math(
      row(mi('ω'), P(W), mo('='), P(a1, mo('+'), a3, W), b1, mo('='), a1, b1, mo('+'), a3, b1, W, mo('⇒'), txt('index'), mo('='), a3, b1),
      row(mi('ω'), P(W), mo('='), a1, P(b1, mo('+'), b3, W), mo('⇒'), txt('index'), mo('='), a1, b3)),
    hayes_pmm: math(
      row(mi('ω'), mo('='), P(a1, mo('+'), sub(mi('a'), mn(4)), W, mo('+'), sub(mi('a'), mn(5)), Z), b1, mo('⇒'), sub(txt('index'), W), mo('='), sub(mi('a'), mn(4)), b1, mo(','), txt(' '), sub(txt('index'), Z), mo('='), sub(mi('a'), mn(5)), b1),
      row(mi('ω'), mo('='), P(a1, mo('+'), sub(mi('a'), mn(4)), W, mo('+'), sub(mi('a'), mn(5)), Z, mo('+'), sub(mi('a'), mn(7)), W, Z), b1),
      row(txt('conditional: '), P(sub(mi('a'), mn(4)), mo('+'), sub(mi('a'), mn(7)), Z), b1, mo(','), txt('  moderated moderated: '), sub(mi('a'), mn(7)), b1)),
    hayes_hc: math(
      row(mover('V'), mo('='), sup(P(sup(X, mo('′')), X), row(mo('−'), mn(1))), sup(X, mo('′')), txt('diag'), P(sub(mi('ω'), mi('i'))), X, sup(P(sup(X, mo('′')), X), row(mo('−'), mn(1)))),
      row(txt('HC0: '), sub(mi('ω'), mi('i')), mo('='), subsup(mi('e'), mi('i'), mn(2)), mo(';'), txt(' HC1: '), frac(mi('n'), row(mi('n'), mo('−'), mi('k'))), subsup(mi('e'), mi('i'), mn(2)), mo(';'), txt(' HC2: '), frac(subsup(mi('e'), mi('i'), mn(2)), row(mn(1), mo('−'), sub(mi('h'), mi('ii'))))),
      row(txt('HC3: '), frac(subsup(mi('e'), mi('i'), mn(2)), sup(P(mn(1), mo('−'), sub(mi('h'), mi('ii'))), mn(2))), mo(';'), txt(' HC4: '), frac(subsup(mi('e'), mi('i'), mn(2)), sup(P(mn(1), mo('−'), sub(mi('h'), mi('ii'))), sub(mi('δ'), mi('i')))), mo(','), txt(' '), sub(mi('δ'), mi('i')), mo('='), txt('min'), P(mn(4), mo(','), frac(row(mi('n'), sub(mi('h'), mi('ii'))), mi('k'))))),
    hayes_boot: math(
      row(txt('percentile: '), mo('['), subsup(mover('ω'), row(P(mi('α'), mo('/'), mn(2))), mo('*')), mo(','), subsup(mover('ω'), row(P(mn(1), mo('−'), mi('α'), mo('/'), mn(2))), mo('*')), mo(']')),
      row(txt('bias-corrected: '), sub(mover('z'), mn(0)), mo('='), sup(mi('Φ'), row(mo('−'), mn(1))), P(frac(row(mo('#'), mo('{'), sup(mi('ω'), mo('*')), mo('&lt;'), mover('ω'), mo('}')), mi('B'))), mo(','), txt(' '), sub(mi('α'), mn(1)), mo('='), mi('Φ'), P(mn(2), sub(mover('z'), mn(0)), mo('+'), sub(mi('z'), row(mi('α'), mo('/'), mn(2)))))),
    hayes_sobel: math(row(mi('z'), mo('='), frac(row(mi('a'), mi('b')), sqrt(row(sup(mi('a'), mn(2)), s2(mi('b')), mo('+'), sup(mi('b'), mn(2)), s2(mi('a'))))), mo(','), txt('  '), mi('p'), mo('='), mn(2), P(mn(1), mo('−'), mi('Φ'), P(mo('|'), mi('z'), mo('|'))))),
    hayes_mc: math(
      row(mi('M'), mo('='), sub(mi('i'), mi('M')), mo('+'), `<munderover>${mo('∑')}${row(mi('j'), mo('='), mn(1))}${row(mi('g'), mo('−'), mn(1))}</munderover>`, sub(mi('a'), mi('j')), sub(mi('D'), mi('j')), mo(','), txt('  '), mi('Y'), mo('='), sub(mi('i'), mi('Y')), mo('+'), `<munder>${mo('∑')}${mi('j')}</munder>`, sub(sup(mi('c'), mo('′')), mi('j')), sub(mi('D'), mi('j')), mo('+'), mi('b'), mi('M')),
      row(txt('relative indirect effect: '), sub(mi('ω'), mi('j')), mo('='), sub(mi('a'), mi('j')), mi('b'), mo(';'), txt(' omnibus: '), mi('F'), mo('='), sup(mover('c', true), mo('′')), sup(mover('V'), row(mo('−'), mn(1))), mover('c', true), mo('/'), P(mi('g'), mo('−'), mn(1)))),
    hayes_std: math(row(sub(mi('ω'), txt('ps')), mo('='), frac(mi('ω'), sub(mi('s'), mi('Y'))), mo(','), txt('  '), sub(mi('ω'), txt('cs')), mo('='), frac(row(mi('ω'), sub(mi('s'), X)), sub(mi('s'), mi('Y')))))
  };
  function mover(s, bold) { return `<mover>${bold ? `<mi mathvariant="bold">${s}</mi>` : mi(s)}${mo('^')}</mover>`; }

  // ---------------------------------------------------------------- methods
  const methods = [
    { id: 'hayes', refs: ['pr_hayes2022', 'pr_hayes2013', 'pr_preacher2007'], formula: F.hayes,
      en: { title: 'PROCESS: conditional process analysis', origin: 'Andrew F. Hayes released the PROCESS macro for SPSS and SAS in 2012 and documented it in his book (Hayes, 2013); version 3 (2017, book 2nd ed. 2018) renamed the moderators W and Z and added models 80–92, and version 4 (2021; book 3rd ed. 2022) added an R version. The numbered templates are in Appendix A of the book.',
        text: 'A family of regression models that combine mediation (X affects Y through mediators M) with moderation (the size of a path depends on W or Z). Each numbered model is a template: which mediators there are (parallel, serial, or both), and which of the paths X→M, M→Y, M→M and X→Y are moderated by W, by Z, or by W×Z (three-way). Every outcome is estimated by OLS with the paths into it, the moderators, the products of the moderated predictors with the moderators, and the covariates. BabPls implements all numbered models of PROCESS 4 (1–22, 28, 29, 58–76, 80–92); models 23–27 and 30–57 needed a third moderator and were retired by Hayes in version 3. Variables can be observed columns or PLS construct scores.' },
      ar: { title: 'PROCESS: تحليل العمليات المشروطة', origin: 'أصدر أندرو ف. هايز ماكرو PROCESS لبرنامجي SPSS وSAS عام 2012 ووثّقه في كتابه (Hayes، 2013)؛ ثم سمّى الإصدارُ الثالث (2017، والطبعة الثانية من الكتاب 2018) المعدِّلين W وZ وأضاف النماذج 80–92، وأضاف الإصدار الرابع (2021؛ الطبعة الثالثة 2022) نسخةً للغة R. والقوالب المرقَّمة في الملحق A من الكتاب.',
        text: 'عائلة من نماذج الانحدار تجمع الوساطة (يؤثر X في Y عبر وسطاء M) والتعديل (يتوقف حجم المسار على W أو Z). وكل نموذج مرقَّم قالبٌ يحدد الوسطاء (متوازية أو متسلسلة أو كليهما)، وأيّ المسارات X→M وM→Y وM→M وX→Y يعدّلها W أو Z أو حاصل ضربهما W×Z (تفاعل ثلاثي). ويُقدَّر كل متغير تابع بالمربعات الصغرى العادية بالمسارات الداخلة إليه والمعدِّلات وحواصل ضرب المتنبئات المعدَّلة في المعدِّلات والمتغيرات الضابطة. ويطبّق BabPls كل النماذج المرقَّمة في الإصدار الرابع (1–22 و28 و29 و58–76 و80–92)؛ أما النماذج 23–27 و30–57 فكانت تحتاج معدِّلاً ثالثاً فألغاها هايز في الإصدار الثالث. والمتغيرات أعمدة مشاهدة أو درجات متغيرات كامنة من PLS.' } },
    { id: 'hayes_med', refs: ['pr_alwin1975', 'pr_preacher2004', 'pr_preacher2008', 'pr_hayes2022'], formula: F.hayes_med,
      en: { title: 'Mediation: indirect effects (a×b)', origin: 'The product-of-coefficients decomposition of a total effect into direct and indirect effects comes from path analysis (Alwin & Hauser, 1975); Preacher and Hayes (2004, 2008) made the bootstrap test of a×b the standard for simple and multiple (parallel) mediator models, and Hayes (2013, 2022) extended it to serial chains and contrasts.',
        text: 'The indirect effect of X on Y through M is the product of the effect of X on M (a) and the effect of M on Y controlling for X (b). In serial models each chain X→M1→M2→Y is the product of its paths (a₁d₂₁b₂). Without moderators the total effect c equals the direct effect c′ plus the sum of all specific indirect effects. Inference uses bootstrap confidence intervals because a×b is not normally distributed. Pairwise contrasts test whether two specific indirect effects differ (or differ in size, using absolute values).' },
      ar: { title: 'الوساطة: الآثار غير المباشرة (a×b)', origin: 'يعود تحليل الأثر الكلي إلى أثر مباشر وآثار غير مباشرة بحاصل ضرب المعاملات إلى تحليل المسار (Alwin وHauser، 1975)؛ وجعل Preacher وHayes (2004، 2008) اختبار a×b بالإقلاع الذاتي المعيارَ في نماذج الوسيط الواحد والوسطاء المتعددين المتوازين، ثم وسّعه Hayes (2013، 2022) إلى السلاسل التسلسلية والمقارنات.',
        text: 'الأثر غير المباشر لـ X في Y عبر M هو حاصل ضرب أثر X في M (a) في أثر M في Y مع ضبط X (b). وفي النماذج التسلسلية يكون أثر كل سلسلة X→M1→M2→Y حاصل ضرب مساراتها (a₁d₂₁b₂). وفي غياب المعدِّلات يساوي الأثرُ الكلي c الأثرَ المباشر c′ مضافاً إليه مجموعُ الآثار غير المباشرة النوعية. ويُستدل بفترات ثقة الإقلاع الذاتي لأن توزيع a×b ليس طبيعياً. وتختبر المقارنات الزوجية هل يختلف أثران غير مباشرين (أو يختلفان في المقدار باستعمال القيم المطلقة).' } },
    { id: 'hayes_mod', refs: ['pr_aiken1991', 'pr_rogosa1980', 'pr_hayes2022'], formula: F.hayes_mod,
      en: { title: 'Moderation: simple slopes and the pick-a-point approach', origin: 'Testing interactions as products in multiple regression and probing them with simple slopes at chosen moderator values was set out by Aiken and West (1991); the name "pick-a-point" is Rogosa’s (1980). PROCESS 3 and later probe at the 16th, 50th and 84th percentiles by default (Hayes, 2022).',
        text: 'With an interaction X×W, the effect of X on Y is a function of W: θ(W) = b₁ + b₃W. The highest-order interaction is tested by the change in R² when the product is added (an F test; with HC errors a Wald F). The conditional effect is then estimated with its standard error, t, p and confidence interval at selected values of the moderator: the 16th, 50th and 84th percentiles, or the mean and ±1 SD (clipped to the observed range), or both values of a dichotomous moderator. In three-way models the X×W interaction is itself tested at values of Z. Mean centring changes the lower-order coefficients and the moderator metric but not the interaction or the conditional effects at the same raw values.' },
      ar: { title: 'التعديل: الميول البسيطة وأسلوب انتقاء النقاط', origin: 'وضع Aiken وWest (1991) اختبار التفاعلات بحواصل الضرب في الانحدار المتعدد وفحصها بالميول البسيطة عند قيم مختارة للمعدِّل، وتسمية «انتقاء النقاط» (pick-a-point) من Rogosa (1980). ويفحص PROCESS منذ الإصدار الثالث افتراضياً عند المئينات 16 و50 و84 (Hayes، 2022).',
        text: 'مع وجود التفاعل X×W يصبح أثر X في Y دالةً في W: θ(W) = b₁ + b₃W. ويُختبر التفاعل الأعلى رتبةً بالتغير في R² عند إضافة حاصل الضرب (اختبار F، أو F لـ Wald مع أخطاء HC). ثم يُقدَّر الأثر المشروط بخطئه المعياري وt وp وفترة ثقته عند قيم مختارة للمعدِّل: المئينات 16 و50 و84، أو المتوسط و±1 انحراف معياري (مقصوراً على المدى المشاهَد)، أو قيمتي المعدِّل الثنائي. وفي النماذج الثلاثية يُختبر التفاعل X×W نفسه عند قيم Z. والتمركز حول المتوسط يغيّر المعاملات الأدنى رتبةً ومقياسَ المعدِّل، ولا يغيّر التفاعل ولا الآثار المشروطة عند القيم الخام نفسها.' } },
    { id: 'hayes_jn', refs: ['pr_johnson1936', 'pr_bauer2005', 'pr_hayes2009'], formula: F.hayes_jn,
      en: { title: 'Johnson–Neyman technique', origin: 'Palmer O. Johnson and Jerzy Neyman (1936, Statistical Research Memoirs) derived the region of the covariate where two regression lines differ significantly; Bauer and Curran (2005) and Hayes and Matthes (2009) adapted it to probing interactions in regression, and PROCESS reports it for models 1 and 3.',
        text: 'Instead of picking moderator values, the technique finds the values of W at which the conditional effect θ(W) = b₁ + b₃W is exactly significant: the roots of a quadratic equation obtained by setting the t statistic equal to ± the critical t. Within the observed range of W the roots separate the region where the effect is significant from where it is not; the table lists the effect across the range of W, with the percentage of cases below and above each boundary. In three-way models the same is done for the conditional X×W interaction across Z. Not available for a dichotomous moderator.' },
      ar: { title: 'أسلوب جونسون–نيمان', origin: 'اشتقّ بالمر أ. جونسون ويرزي نيمان (1936، في Statistical Research Memoirs) منطقة المتغير المصاحب التي يختلف فيها خطّا انحدار اختلافاً دالاً، ثم كيّفه Bauer وCurran (2005) وHayes وMatthes (2009) لفحص التفاعلات في الانحدار، ويعرضه PROCESS للنموذجين 1 و3.',
        text: 'بدلاً من انتقاء قيم للمعدِّل، يجد هذا الأسلوب قيم W التي يكون عندها الأثر المشروط θ(W) = b₁ + b₃W عند حد الدلالة تماماً: جذور معادلة تربيعية تنتج من مساواة إحصاءة t بـ ± القيمة الحرجة. وضمن المدى المشاهَد لـ W تفصل الجذور منطقةَ دلالة الأثر عن منطقة عدم دلالته؛ ويعرض الجدول الأثر على امتداد مدى W مع نسبة الحالات تحت كل حد وفوقه. وفي النماذج الثلاثية يُطبَّق الأمر نفسه على التفاعل المشروط X×W عبر قيم Z. ولا يُطبَّق مع معدِّل ثنائي.' } },
    { id: 'hayes_imm', refs: ['pr_hayes2015', 'pr_preacher2007'], formula: F.hayes_imm,
      en: { title: 'Index of moderated mediation', origin: 'Conditional indirect effects were formalized by Preacher, Rucker and Hayes (2007); the index of moderated mediation and its bootstrap test were introduced by Hayes (2015, Multivariate Behavioral Research).',
        text: 'When one moderator changes one or more paths of a chain, the indirect effect is a function of W. If that function is linear, ω(W) = A + BW, its slope B is the index of moderated mediation: the change in the indirect effect per unit of W. A bootstrap interval for the index that excludes zero shows that the indirect effect depends on W, and then any two conditional indirect effects differ (their difference equals the index times the difference in W). When W moderates two paths of the same chain (models 58, 59, 74 and others) the function is quadratic and no single index exists; the conditional indirect effects and their pairwise contrasts are reported instead.' },
      ar: { title: 'مؤشر الوساطة المعدَّلة', origin: 'صاغ Preacher وRucker وHayes (2007) الآثار غير المباشرة المشروطة صياغة منهجية، وقدّم Hayes (2015، في Multivariate Behavioral Research) مؤشر الوساطة المعدَّلة واختباره بالإقلاع الذاتي.',
        text: 'إذا عدّل معدِّلٌ واحد مساراً أو أكثر من سلسلة ما صار الأثر غير المباشر دالةً في W. فإن كانت الدالة خطية، ω(W) = A + BW، فميلها B هو مؤشر الوساطة المعدَّلة: مقدار تغيّر الأثر غير المباشر لكل وحدة من W. وإذا لم تتضمن فترة الإقلاع الذاتي للمؤشر الصفرَ دلّ ذلك على أن الأثر غير المباشر يتوقف على W، وحينئذٍ يختلف أي أثرين غير مباشرين مشروطين (فرقهما يساوي المؤشر مضروباً في فرق قيمتي W). أما إذا عدّل W مسارين من السلسلة نفسها (النماذج 58 و59 و74 وغيرها) فالدالة تربيعية ولا يوجد مؤشر واحد، فتُعرض الآثار غير المباشرة المشروطة ومقارناتها الزوجية.' } },
    { id: 'hayes_pmm', refs: ['pr_hayes2018'], formula: F.hayes_pmm,
      en: { title: 'Partial, conditional and moderated moderated mediation', origin: 'Introduced by Andrew F. Hayes (2018, Communication Monographs) for models in which two moderators act on a mediation process.',
        text: 'With two moderators acting additively (e.g. model 9) the indirect effect is linear in both, and each slope, holding the other moderator constant, is an index of partial moderated mediation. With a three-way interaction (e.g. model 11) the indirect effect contains a W×Z term: the index of conditional moderated mediation is the slope for W at a given value of Z, and the index of moderated moderated mediation (the coefficient of WZ) tests whether the moderation by W itself depends on Z. BabPls reports these indices whenever the indirect effect is linear in each moderator.' },
      ar: { title: 'الوساطة المعدَّلة الجزئية والمشروطة والمعدَّلة المعدَّلة', origin: 'قدّمها أندرو ف. هايز (2018، في Communication Monographs) للنماذج التي يؤثر فيها معدِّلان في عملية الوساطة.',
        text: 'إذا أثّر معدِّلان تأثيراً جمعياً (مثل النموذج 9) كان الأثر غير المباشر خطياً في كليهما، وكل ميل مع تثبيت المعدِّل الآخر مؤشرُ وساطة معدَّلة جزئية. ومع التفاعل الثلاثي (مثل النموذج 11) يتضمن الأثر غير المباشر حداً في W×Z: فمؤشر الوساطة المعدَّلة المشروطة هو الميل بالنسبة إلى W عند قيمة معينة لـ Z، ومؤشر الوساطة المعدَّلة المعدَّلة (معامل WZ) يختبر هل يتوقف تعديل W نفسه على Z. ويعرض BabPls هذه المؤشرات كلما كان الأثر غير المباشر خطياً في كل معدِّل.' } },
    { id: 'hayes_hc', refs: ['pr_white1980', 'pr_mackinnon1985', 'pr_cribari2004', 'pr_long2000', 'pr_hayes2007'], formula: F.hayes_hc,
      en: { title: 'Heteroscedasticity-consistent standard errors (HC0–HC4)', origin: 'HC0 is White’s (1980) estimator; HC1–HC3 are the finite-sample corrections of MacKinnon and White (1985); HC4 is Cribari-Neto’s (2004). Long and Ervin (2000) recommended HC3 for small samples, and Hayes and Cai (2007) brought these estimators to SPSS and SAS users, later in PROCESS.',
        text: 'OLS standard errors assume equal error variance. The sandwich estimators remain valid when the variance differs across cases: each squared residual is weighted by a function of its leverage hᵢᵢ. They change standard errors, t, p, confidence intervals and the F tests (computed as Wald tests), not the coefficients. Bootstrap intervals of indirect effects do not use them.' },
      ar: { title: 'الأخطاء المعيارية المتسقة مع عدم تجانس التباين (HC0–HC4)', origin: 'HC0 مقدِّر White (1980)، وHC1–HC3 تصحيحات MacKinnon وWhite (1985) للعينات المحدودة، وHC4 مقدِّر Cribari-Neto (2004). وأوصى Long وErvin (2000) بـ HC3 للعينات الصغيرة، ونقل Hayes وCai (2007) هذه المقدِّرات إلى مستخدمي SPSS وSAS ثم إلى PROCESS.',
        text: 'تفترض أخطاء المربعات الصغرى العادية تساوي تباين الخطأ، أما مقدِّرات «الشطيرة» فتبقى صحيحة إذا اختلف التباين بين الحالات، إذ يُوزن كل مربع باقٍ بدالة في رافعته hᵢᵢ. وهي تغيّر الأخطاء المعيارية وt وp وفترات الثقة واختبارات F (المحسوبة اختباراتِ Wald)، ولا تغيّر المعاملات. ولا تدخل في فترات الإقلاع الذاتي للآثار غير المباشرة.' } },
    { id: 'hayes_boot', refs: ['pr_efron1993', 'pr_mackinnon2004', 'pr_preacher2008', 'pr_hayes2022'], formula: F.hayes_boot,
      en: { title: 'Bootstrap confidence intervals for indirect effects', origin: 'The bootstrap is Efron’s (1979; Efron & Tibshirani, 1993); MacKinnon, Lockwood and Williams (2004) and Preacher and Hayes (2004, 2008) established it for indirect effects. PROCESS used bias-corrected intervals until version 2 and percentile intervals by default since version 3.',
        text: 'Cases are resampled with replacement B times and every equation is re-estimated; each indirect effect, index and contrast is recomputed in every resample. The percentile interval takes the α/2 and 1 − α/2 quantiles of the B estimates; the bias-corrected interval shifts these quantiles by ẑ₀, the normal quantile of the share of resamples below the estimate. BootSE is the standard deviation of the resamples. With a fixed seed the results are reproducible; centring and the probe values are fixed at the full-sample values, as in PROCESS.' },
      ar: { title: 'فترات الثقة بالإقلاع الذاتي للآثار غير المباشرة', origin: 'الإقلاع الذاتي من وضع Efron (1979؛ Efron وTibshirani، 1993)، وأرسى MacKinnon وLockwood وWilliams (2004) وPreacher وHayes (2004، 2008) استعماله للآثار غير المباشرة. واستعمل PROCESS الفترات المصحَّحة للتحيّز حتى الإصدار الثاني، والفترات المئينية افتراضياً منذ الإصدار الثالث.',
        text: 'تُسحب الحالات مع الإرجاع B مرة وتُعاد تقدير كل المعادلات، ويُعاد حساب كل أثر غير مباشر ومؤشر ومقارنة في كل عينة. وتأخذ الفترة المئينية المئينين α/2 و1 − α/2 من التقديرات B، أما الفترة المصحَّحة للتحيّز فتُزيح هذين المئينين بمقدار ẑ₀، أي القيمة الطبيعية المعيارية المقابلة لنسبة العينات التي تقل عن التقدير. وBootSE هو الانحراف المعياري للتقديرات. ومع تثبيت البذرة تتكرر النتائج نفسها، ويُثبَّت التمركز وقيم الفحص على قيم العينة كاملة كما في PROCESS.' } },
    { id: 'hayes_sobel', refs: ['pr_sobel1982', 'pr_preacher2004'], formula: F.hayes_sobel,
      en: { title: 'Sobel test (normal theory)', origin: 'Michael E. Sobel (1982, Sociological Methodology) derived the first-order (delta-method) standard error of a×b.',
        text: 'Divides the indirect effect by its delta-method standard error and refers the ratio to the standard normal distribution. It assumes a×b is normally distributed, which fails in small and moderate samples, so it is less powerful than the bootstrap; PROCESS offers it for model 4 for comparison only. BabPls uses the standard errors of the chosen estimator (OLS or HC).' },
      ar: { title: 'اختبار سوبل (النظرية الطبيعية)', origin: 'اشتقّ مايكل إ. سوبل (1982، في Sociological Methodology) الخطأ المعياري من الرتبة الأولى (طريقة دلتا) لـ a×b.',
        text: 'يقسم الأثرَ غير المباشر على خطئه المعياري بطريقة دلتا ويقارن النسبة بالتوزيع الطبيعي المعياري. ويفترض أن توزيع a×b طبيعي، وهذا لا يتحقق في العينات الصغيرة والمتوسطة، فهو أضعف قوة من الإقلاع الذاتي؛ ويعرضه PROCESS للنموذج 4 للمقارنة فقط. ويستعمل BabPls الأخطاء المعيارية للمقدِّر المختار (OLS أو HC).' } },
    { id: 'hayes_mc', refs: ['pr_hayes2014', 'pr_hayes2022'], formula: F.hayes_mc,
      en: { title: 'Multicategorical X', origin: 'Hayes and Preacher (2014, British Journal of Mathematical and Statistical Psychology) developed mediation analysis with a multicategorical independent variable (relative direct, indirect and total effects); PROCESS 3 and later implement it for every model with four coding systems.',
        text: 'An X with g groups (3–9) is represented by g − 1 codes D₁…D_g−1: indicator (each group vs the first), sequential (each group vs the previous one), Helmert (each group vs the mean of the following groups) or effect coding (each group vs the unweighted grand mean). Each code has its own paths, so the effects are relative effects for the comparison the code represents; the omnibus F test of all codes tests whether X has any direct (or total) effect. Codes are never mean centred.' },
      ar: { title: 'X متعدد الفئات', origin: 'طوّر Hayes وPreacher (2014، في British Journal of Mathematical and Statistical Psychology) تحليل الوساطة بمتغير مستقل متعدد الفئات (الآثار النسبية المباشرة وغير المباشرة والكلية)، ويطبّقه PROCESS منذ الإصدار الثالث في كل نموذج بأربعة أنظمة ترميز.',
        text: 'يُمثَّل المتغير X ذو الـ g فئة (من 3 إلى 9) بـ g − 1 رمزاً D₁…D_g−1: ترميز مؤشِّري (كل فئة مقابل الأولى)، أو تتابعي (كل فئة مقابل سابقتها)، أو هلمرت (كل فئة مقابل متوسط الفئات التالية)، أو ترميز الأثر (كل فئة مقابل المتوسط العام غير الموزون). ولكل رمز مساراته، فالآثار نسبيةٌ للمقارنة التي يمثّلها الرمز، ويختبر اختبار F الشامل لكل الرموز هل لـ X أي أثر مباشر (أو كلي). ولا تُمركَز الرموز حول المتوسط.' } },
    { id: 'hayes_std', refs: ['pr_preacher2011', 'pr_hayes2022'], formula: F.hayes_std,
      en: { title: 'Standardized indirect effects', origin: 'Partially and completely standardized indirect effects are discussed by Preacher and Kelley (2011) and reported by PROCESS for models without moderators (Hayes, 2022).',
        text: 'The partially standardized effect expresses the indirect effect in standard deviations of Y per unit of X; the completely standardized effect in standard deviations of Y per standard deviation of X (not defined for a multicategorical X). Bootstrap intervals use the standard deviations of each resample.' },
      ar: { title: 'الآثار غير المباشرة المعيارية', origin: 'ناقش Preacher وKelley (2011) الآثار غير المباشرة المعيارية جزئياً وكلياً، ويعرضها PROCESS للنماذج الخالية من المعدِّلات (Hayes، 2022).',
        text: 'يعبّر الأثر المعياري جزئياً عن الأثر غير المباشر بوحدات الانحراف المعياري لـ Y لكل وحدة من X، والمعياري كلياً بوحدات الانحراف المعياري لـ Y لكل انحراف معياري من X (ولا يُعرَّف مع X متعدد الفئات). وتستعمل فترات الإقلاع الذاتي الانحرافات المعيارية لكل عينة.' } }
  ];

  // ------------------------------------------------------- model descriptions
  const L = () => (root.BabPls && root.BabPls.S && root.BabPls.S.lang) || (root.document && root.document.documentElement.lang) || 'en';
  const tr = (k, lang) => ((lang === 'ar' ? ar : en)[k]) || k;
  function describe(m, lang, k) {
    const st = E.hayesStructure(m), fl = E.hayesFlags[m].split('').map(Number), T = k => tr(k, lang), parts = [];
    const kind = st.kind === 'moderation' ? T('hy_moderation') : st.kind === 'serial' ? T('hy_serial') : st.kind === 'parallel' ? (m === 74 || k === 1 ? T('hy_simple') : T('hy_parallel')) : T('hy_mixed');
    parts.push(kind);
    if (m === 80 || m === 81 || m === 82) parts.push(T('hy_m' + m));
    const mods = f => f[2] ? 'W×Z (' + T('hy_three') + ')' : [f[0] ? 'W' : '', f[1] ? 'Z' : ''].filter(Boolean).join(lang === 'ar' ? ' و' : ' & ');
    const add = (path, f) => { if (f[0] || f[1] || f[2]) parts.push(iso(path) + ' ' + T('hy_by') + ' ' + mods(f)); };
    if (m === 74) parts.push(iso('X') + ' ' + T('hy_x_mod').replace(/^X /, '').replace(/^X/, ''));
    add(m === 83 || m === 86 ? 'X→M1' : 'X→M', fl.slice(0, 3));
    if (m !== 74) add(m === 87 || m === 90 ? 'Mk→Y' : 'M→Y', fl.slice(3, 6));
    if (m === 91 || m === 92) add('M→M', [1, 0, 0]);
    add('X→Y', fl.slice(6, 9));
    return parts.join(lang === 'ar' ? '؛ ' : '; ');
  }
  function needs(m, lang) {
    const st = E.hayesStructure(m), sp = E.hayesTemplate(m, st.min), T = k => tr(k, lang), out = [];
    if (st.max) out.push(st.min === st.max ? st.min + ' ' + T(st.min === 1 ? 'hy_mediator' : 'hy_mediators') : st.min + '–' + st.max + ' ' + T('hy_mediators'));
    if (sp.needW) out.push('W'); if (sp.needZ) out.push('Z');
    return out.join(lang === 'ar' ? '، ' : ', ');
  }

  // --------------------------------------------------------- diagram (SVG)
  let dseq = 0;
  function diagram(d, esc) {
    // d: { k, paths:[{fromNode,toNode,w,z,wz}], names: [X, M1..Mk, Y], W, Z, wIsX }
    const k = d.k, anyMod = d.paths.some(p => p.w || p.z), Wd = 600, H = k ? (anyMod ? 330 : 250) : 210, id = 'hyarr' + (++dseq), bw = 112, bh = 36;
    const layer = [0]; for (let j = 1; j <= k; j++) layer[j] = 1 + Math.max(0, ...d.paths.filter(p => p.toNode === j && p.fromNode > 0).map(p => layer[p.fromNode]));
    const Lmax = Math.max(0, ...layer.slice(1)), pos = [];
    const baseY = k ? H - (anyMod ? 120 : 40) : H - 70;
    pos[0] = [70, baseY]; pos[k + 1] = [Wd - 70, baseY];
    for (let l = 1; l <= Lmax; l++) {
      const nodes = []; for (let j = 1; j <= k; j++) if (layer[j] === l) nodes.push(j);
      const x = 70 + (Wd - 140) * l / (Lmax + 1);
      nodes.forEach((j, i) => { pos[j] = [x + (nodes.length > 2 && i % 2 ? 0 : 0), 34 + (baseY - 100) * (nodes.length === 1 ? 0.5 : i / (nodes.length - 1))]; });
    }
    const edge = (p, q) => { // point on the border of the box at p in the direction of q
      const dx = q[0] - p[0], dy = q[1] - p[1]; if (!dx && !dy) return p;
      const s = Math.min(dx ? (bw / 2 + 3) / Math.abs(dx) : Infinity, dy ? (bh / 2 + 3) / Math.abs(dy) : Infinity); return [p[0] + dx * s, p[1] + dy * s];
    };
    const arrow = (a, b, dash) => `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="var(--edge)" stroke-width="1.6"${dash ? ' stroke-dasharray="5 3"' : ''} marker-end="url(#${id})"/>`;
    const box = (p, role, name, fill) => `<g><rect x="${p[0] - bw / 2}" y="${p[1] - bh / 2}" width="${bw}" height="${bh}" rx="6" fill="${fill}" stroke="var(--edge)"/><text x="${p[0]}" y="${p[1] - 3}" text-anchor="middle" font-weight="700" fill="var(--lv-ink)" font-size="12">${esc(role)}</text><text x="${p[0]}" y="${p[1] + 11}" text-anchor="middle" fill="var(--lv-ink)" font-size="10">${esc(name && name !== role ? (name.length > 17 ? name.slice(0, 16) + '…' : name) : '')}</text></g>`;
    let s = `<defs><marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="var(--edge)"/></marker></defs>`;
    const mids = [];
    d.paths.forEach(p => { const a = edge(pos[p.fromNode], pos[p.toNode]), b = edge(pos[p.toNode], pos[p.fromNode]); s += arrow(a, b); mids.push({ p, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }); });
    const wPos = d.wIsX ? pos[0] : k ? [Wd * 0.4, H - 26] : [Wd * 0.42, 34], zPos = k ? [Wd * 0.64, H - 26] : [Wd * 0.64, 34];
    const usesW = mids.some(x => x.p.w), usesZ = mids.some(x => x.p.z);
    mids.forEach(({ p, m }) => {
      let wEnd = null;
      if (p.w) { const a = edge(wPos, m); s += arrow(a, m, true); wEnd = [(a[0] + m[0]) / 2, (a[1] + m[1]) / 2]; }
      if (p.z) s += arrow(edge(zPos, p.wz && wEnd ? wEnd : m), p.wz && wEnd ? wEnd : m, true);
    });
    const nm = d.names;
    s += box(pos[0], 'X', nm[0], 'var(--lv)') + box(pos[k + 1], 'Y', nm[k + 1], 'var(--lv)');
    for (let j = 1; j <= k; j++) s += box(pos[j], k > 1 ? 'M' + j : 'M', nm[j], 'var(--ind)');
    if (usesW && !d.wIsX) s += box(wPos, 'W', d.W, 'var(--bg2)');
    if (usesZ) s += box(zPos, 'Z', d.Z, 'var(--bg2)');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Wd} ${H}" width="${Wd}" height="${H}" font-family="system-ui, sans-serif" role="img" aria-label="PROCESS diagram">${s}</svg>`;
  }
  const diagramOf = (m, k, names, esc) => { const sp = E.hayesTemplate(m, k); return diagram({ k, paths: sp.paths.map(p => ({ fromNode: p.from, toNode: p.to, w: p.w || p.wz, z: p.z || p.wz, wz: p.wz })), names: names || [], W: 'W', Z: 'Z', wIsX: sp.wIsX }, esc); };

  // ---------------------------------------------------------------- run dialog
  const escH = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function preview(m, sel, lang) {
    const st = E.hayesStructure(m), k = Math.min(st.max, Math.max(st.min, sel.length)), T = x => tr(x, lang);
    const names = { M: Array.from({ length: k }, (_, i) => (k > 1 ? 'M' + (i + 1) : 'M') + (sel[i] ? ' [' + sel[i] + ']' : '')) };
    return `<p class="note">${escH(T('hy_modelno'))} ${m}: ${escH(describe(m, lang, k))}. ${escH(T('hy_needs'))}: X, Y${needs(m, lang) ? ', ' + escH(needs(m, lang)) : ''}.</p>` +
      `<div class="formula">${E.hayesEquations(m, k, names).map(escH).join('<br>')}</div>` +
      `<div class="hy-diagram" dir="ltr" style="max-width:460px">${diagramOf(m, k, ['', ...sel.slice(0, k), ''], escH).replace('<svg ', '<svg style="width:100%;height:auto" ')}</div>`;
  }
  function selOrder(dlg) {
    const ms = dlg.querySelector('select[name=hM]'), hid = dlg.querySelector('input[name=hMseq]'); if (!ms || !hid) return [];
    let seq = []; try { seq = JSON.parse(hid.value || '[]'); } catch (e) { seq = []; }
    const now = Array.from(ms.selectedOptions).map(o => o.value);
    seq = seq.filter(v => now.includes(v)).concat(now.filter(v => !seq.includes(v)));
    hid.value = JSON.stringify(seq); return seq;
  }
  function refreshPreview(dlg) {
    const box = dlg.querySelector('#hayesPreview'), ms = dlg.querySelector('select[name=hModel]'); if (!box || !ms) return;
    const seq = selOrder(dlg);
    box.innerHTML = preview(+ms.value, seq, L());
    const ord = dlg.querySelector('#hayesOrder'); if (ord) ord.textContent = seq.map((v, i) => 'M' + (i + 1) + ' = ' + v).join(' · ');
  }
  if (root.document && root.document.addEventListener) {
    root.document.addEventListener('change', ev => {
      const el = ev.target; if (!el || !el.name || !['hModel', 'hM'].includes(el.name)) return;
      const dlg = el.closest('dialog') || root.document; refreshPreview(dlg);
    });
  }
  const opts = (ctx, vals, labelKey, cur) => vals.map(v => `<option value="${ctx.esc(v)}"${String(cur) === String(v) ? ' selected' : ''}>${ctx.esc(ctx.t(labelKey + v))}</option>`).join('');
  const sel = (ctx, inner, extra) => ctx.label(`<select name="${ctx.key}"${extra || ''}>${inner}</select>`);
  const varList = ctx => ctx.lvs().concat(ctx.nums());
  function varSelect(ctx, o) {
    const list = varList(ctx), cur = ctx.value;
    let pick = cur;
    if ((pick === undefined || pick === '' || !list.includes(pick)) && o.def) pick = o.def(list);
    return sel(ctx, (o.none ? `<option value="">${ctx.esc(ctx.t('none'))}</option>` : '') + list.map(v => `<option${v === pick ? ' selected' : ''}>${ctx.esc(v)}</option>`).join(''));
  }
  function multiSelect(ctx, size, hint) {
    const list = varList(ctx), cur = Array.isArray(ctx.value) ? ctx.value : [];
    return ctx.label(`<select name="${ctx.key}" multiple size="${size}">${list.map(v => `<option${cur.includes(v) ? ' selected' : ''}>${ctx.esc(v)}</option>`).join('')}</select><small>${ctx.esc(hint)}</small>`);
  }
  const fields = {
    hModel: ctx => sel(ctx, E.hayesModels.map(m => `<option value="${m}"${+(ctx.value || 4) === m ? ' selected' : ''}>${ctx.esc(ctx.t('hy_modelno') + ' ' + m + ': ' + describe(m, ctx.S.lang))}</option>`).join('')),
    hPreview: ctx => { const seq = Array.isArray(ctx.st.hMseq) ? ctx.st.hMseq : (() => { try { return JSON.parse(ctx.st.hMseq || '[]'); } catch (e) { return []; } })(); return `<div class="hy-preview" style="grid-column:1/-1"><b>${ctx.esc(ctx.t('f_hPreview'))}</b><div id="hayesPreview">${preview(+(ctx.st.hModel || 4), seq, ctx.S.lang)}</div></div>`; },
    hX: ctx => varSelect(ctx, { def: l => l[0] }),
    hY: ctx => varSelect(ctx, { def: l => l[l.length - 1] }),
    hM: ctx => { const seq = Array.isArray(ctx.st.hM) ? ctx.st.hM : []; return multiSelect(ctx, 6, ctx.t('hy_order_hint')) + `<input type="hidden" name="hMseq" value="${ctx.esc(JSON.stringify(seq))}"><small id="hayesOrder">${ctx.esc(seq.map((v, i) => 'M' + (i + 1) + ' = ' + v).join(' · '))}</small>`; },
    hW: ctx => varSelect(ctx, { none: true }),
    hZ: ctx => varSelect(ctx, { none: true }),
    hCov: ctx => multiSelect(ctx, 4, ctx.t('multi_hint')),
    hCovIn: ctx => sel(ctx, opts(ctx, ['all', 'm', 'y'], 'hy_cov_', ctx.value || 'all')),
    hMcx: ctx => sel(ctx, opts(ctx, ['', 'indicator', 'sequential', 'helmert', 'effect'], 'hy_mcx_', ctx.value || '')),
    hCenter: ctx => sel(ctx, opts(ctx, ['none', 'all', 'cont'], 'hy_cen_', ctx.value || 'none')),
    hHC: ctx => sel(ctx, ['', '0', '1', '2', '3', '4'].map(v => `<option value="${v}"${String(ctx.value === undefined ? '' : ctx.value) === v ? ' selected' : ''}>${v === '' ? ctx.esc(ctx.t('hy_hc_')) : 'HC' + v}</option>`).join('')),
    hProbe: ctx => sel(ctx, opts(ctx, ['percentiles', 'moments'], 'hy_probe_', ctx.value || 'percentiles')),
    hBoot: ctx => ctx.num(0, 100000, 100),
    hConf: ctx => sel(ctx, [90, 95, 99].map(v => `<option${+(ctx.value || 95) === v ? ' selected' : ''}>${v}</option>`).join('')),
    hBootCI: ctx => sel(ctx, opts(ctx, ['percentile', 'bc'], 'hy_ci_', ctx.value || 'percentile')),
    hContrast: ctx => sel(ctx, opts(ctx, ['0', '1', '2'], 'hy_con_', ctx.value || '0')),
    hJN: ctx => ctx.check(), hTotal: ctx => ctx.check(), hEff: ctx => ctx.check(), hSobel: ctx => ctx.check(), hCondC: ctx => ctx.check()
  };
  function readForm(fd) {
    const chosen = fd.hM || [];
    let seq = []; try { seq = JSON.parse(fd.hMseq || '[]'); } catch (e) { seq = []; }
    const m = seq.filter(v => chosen.includes(v)).concat(chosen.filter(v => !seq.includes(v)));
    fd.hM = m; // remembered in selection order
    return {
      hmodel: +fd.hModel || 4, x: fd.hX, y: fd.hY, m, w: fd.hW || undefined, z: fd.hZ || undefined, cov: fd.hCov || [], covIn: fd.hCovIn || 'all',
      mcx: fd.hMcx || '', center: fd.hCenter || 'none', hc: fd.hHC === '' || fd.hHC === undefined ? -1 : +fd.hHC, probe: fd.hProbe || 'percentiles',
      boot: fd.hBoot === undefined || fd.hBoot === '' ? 5000 : +fd.hBoot, seed: +fd.seed || 0, conf: +fd.hConf || 95, bootci: fd.hBootCI || 'percentile',
      contrast: +fd.hContrast || 0, jn: !!fd.hJN, total: !!fd.hTotal, effsize: !!fd.hEff, sobel: !!fd.hSobel, condContrast: !!fd.hCondC
    };
  }

  // ---------------------------------------------------------------- results
  function sections(r, U) {
    const { t, f, esc, table, cell, card, sec, pcell, chart, C } = U;
    const ci = x => x.lo > 0 || x.hi < 0;
    const bootCells = x => [f(x.effect), f(x.se), f(x.lo), f(x.hi)];
    const sigCell = x => isFinite(x.lo) ? cell(ci(x) ? t('significant') : t('not_significant'), ci(x) ? 'good' : '') : '';
    const hcName = r.options.hc >= 0 ? 'HC' + r.options.hc : 'OLS';
    const pc = Math.round(r.options.conf * 10) / 10, LL = 'LLCI', UL = 'ULCI';
    const bootNote = (r.options.boot ? t('hy_boot_note', { b: r.options.boot, ci: t('hy_ci_' + (r.options.bootci || 'percentile')), c: pc, s: r.options.seed }) : t('hy_noboot')) + (r.bootReplaced ? ' ' + t('hy_replaced', { n: r.bootReplaced }) : '');
    const modCols = mods => mods.map(m => m === 'W' ? r.w : r.z);
    const modVals = (row, mods) => mods.map(m => f(m === 'W' ? row.w : row.z));
    const out = [];
    const names = [r.x].concat(r.m, [r.y]);
    const diag = () => chart(diagram({ k: r.k, paths: r.paths, names, W: r.w, Z: r.z, wIsX: r.model === 74 }, esc), 'process_diagram');
    // 1. model
    out.push(sec('g_final', 'hy_model', t('hy_model'), () => {
      const roles = [['X', r.x], ['Y', r.y]].concat(r.m.map((m, i) => [r.m.length > 1 ? 'M' + (i + 1) : 'M', m]), r.w && r.model !== 74 ? [['W', r.w]] : [], r.z ? [['Z', r.z]] : [], r.cov.length ? [[t('f_hCov'), r.cov.join(', ') + ' (' + t('hy_cov_' + (r.covIn || 'all')) + ')']] : []);
      const settings = [[t('hy_sample'), String(r.n)], [t('f_hCenter'), t('hy_cen_' + r.options.center)], [t('f_hHC'), hcName], [t('f_hBoot'), String(r.options.boot)], [t('f_hConf'), String(pc)], [t('f_hProbe'), t('hy_probe_' + r.options.probe)]];
      let h = table([t('hy_role'), t('hy_variable')], roles, { title: 'process_roles' }) + table([t('hy_settings'), ''], settings, { title: 'process_settings' });
      h += `<h4>${esc(t('hy_equations'))}</h4><div class="formula">${r.equationsText.map(esc).join('<br>')}</div>`;
      h += `<h4>${esc(t('hy_diagram'))}</h4>` + diag();
      const pr = Object.keys(r.probes);
      if (pr.length) h += `<h4>${esc(t('hy_probes'))}</h4>` + table([t('hy_moderator'), t('hy_values'), t('hy_mean'), t('hy_sd'), 'min', 'max'], pr.map(k => { const p = r.probes[k]; return [k + ' = ' + (k === 'W' ? r.w : r.z) + (p.dich ? ' (' + t('hy_dich') + ')' : ''), p.values.map(v => f(v)).join(' · '), f(p.mean), f(p.sd), f(p.min), f(p.max)]; }), { title: 'process_probes' });
      if (r.xcoding) h += `<h4>${esc(t('hy_coding'))} (${esc(t('hy_mcx_' + r.xcoding.scheme))})</h4>` + table([r.x, 'n'].concat(r.xcoding.labels), r.xcoding.levels.map((l, i) => [String(l), String(r.xcoding.counts[i])].concat(r.xcoding.codes[i].map(v => f(v)))), { title: 'process_coding' });
      const note = (r.centered.length ? t('hy_centered', { v: esc(r.centered.join(', ')) }) : t('hy_nocenter')) + (r.xcoding ? ' ' + t('hy_codes_note') : '');
      return card(t('hy_modelno') + ' ' + r.model + ': ' + describe(r.model, U.lang(), r.k), h, { note, doc: 'hayes' });
    }));
    // 2. outcome models
    const eqCard = (e, title) => {
      const s = e.summary;
      let h = `<h4>${esc(t('hy_summary'))}</h4>` + table(['R', 'R²', 'MSE', 'F', 'df1', 'df2', 'p'], [[f(s.R), f(s.R2), f(s.MSE), f(s.F), String(s.df1), String(s.df2), pcell(s.p)]], { title: 'process_summary_' + e.outcome });
      h += `<h4>${esc(t('hy_coefs'))}</h4>` + table([t('hy_term'), t('hy_coeff'), r.options.hc >= 0 ? 'se (' + hcName + ')' : 'se', 't', 'p', LL, UL], e.terms.map(x => [x.name, f(x.b), f(x.se), f(x.t), pcell(x.p), f(x.lo), f(x.hi)]), { title: 'process_coef_' + e.outcome });
      if (e.tests && e.tests.length) h += `<h4>${esc(t('hy_tests'))}</h4>` + table([t('hy_term'), 'R²-chng', 'F', 'df1', 'df2', 'p'], e.tests.map(x => [x.label.startsWith('both|') ? t('hy_both') + ': ' + x.label.slice(5) : x.label, f(x.R2chg), f(x.F), String(x.df1), String(x.df2), pcell(x.p)]), { title: 'process_int_' + e.outcome });
      if (e.omnibus) h += `<p class="meta">${esc(t('hy_omnibus'))}: F(${e.omnibus.df1}, ${e.omnibus.df2}) = ${f(e.omnibus.F)}, p = ${U.fp(e.omnibus.p)}</p>`;
      return card(title, h, { note: r.options.hc >= 0 ? t('hy_hcnote', { hc: hcName }) : '', doc: e.tests && e.tests.length ? 'hayes_mod' : (r.options.hc >= 0 ? 'hayes_hc' : 'hayes') });
    };
    out.push(sec('g_final', 'hy_eqs', t('hy_eqs'), () => r.equations.map(e => eqCard(e, t('hy_outcome') + ': ' + e.outcome)).join('') + (r.totalModel ? eqCard(r.totalModel, t('hy_total_model') + ': ' + r.totalModel.outcome) : '')));
    // 3. effects
    out.push(sec('g_final', 'hy_effects', r.k ? t('hy_effects') : t('hy_cond'), () => {
      let h = '';
      const d = r.direct, dm = d.mods, multiX = !!r.xcoding, stdCols = r.direct.rows[0] && 'partial' in r.direct.rows[0];
      const dHead = [t('hy_path')].concat(modCols(dm), [t('hy_effect'), 'se', 't', 'p', LL, UL], stdCols ? ['c_ps', 'c_cs'] : []);
      let dc = table(dHead, d.rows.map(x => [multiX ? x.x + ' → ' + r.y : r.x + ' → ' + r.y].concat(modVals(x, dm), [f(x.effect), f(x.se), f(x.t), pcell(x.p), f(x.lo), f(x.hi)], stdCols ? [f(x.partial), f(x.complete)] : [])), { title: 'process_direct' });
      if (d.omnibus) dc += `<p class="meta">${esc(t('hy_omnibus'))}: F(${d.omnibus.df1}, ${d.omnibus.df2}) = ${f(d.omnibus.F)}, p = ${U.fp(d.omnibus.p)}</p>`;
      const dTitle = !r.k ? t('hy_cond') + ': ' + r.x + ' → ' + r.y : dm.length ? t('hy_cdirect') : t('hy_direct');
      h += card(dTitle, dc, { doc: dm.length ? 'hayes_mod' : 'hayes_med', note: r.options.hc >= 0 ? t('hy_hcnote', { hc: hcName }) : '' });
      if (r.condInt) h += card(t('hy_condint', { i: r.condInt.label, z: r.z }), table([r.z, t('hy_effect'), 'se', 't', 'F', 'df1', 'df2', 'p', LL, UL], r.condInt.rows.map(x => [cell(iso(f(x.z)), '', x.z), f(x.effect), f(x.se), f(x.t), f(x.F), '1', String(x.df2), pcell(x.p), f(x.lo), f(x.hi)]), { title: 'process_condint' }), { doc: 'hayes_mod' });
      if (r.totalEffect) h += card(t('hy_total'), table([t('hy_path'), t('hy_effect'), 'se', 't', 'p', LL, UL].concat(stdCols ? ['c_ps', 'c_cs'] : []), r.totalEffect.map(x => [x.x + ' → ' + r.y, f(x.effect), f(x.se), f(x.t), pcell(x.p), f(x.lo), f(x.hi)].concat(stdCols ? [f(x.partial), f(x.complete)] : [])), { title: 'process_total' }), { doc: 'hayes_med' });
      if (r.indirect.length) {
        const mods = Array.from(new Set(r.indirect.flatMap(x => x.mods))).sort();
        const rows = [];
        r.indirect.forEach(x => x.rows.forEach(rw => rows.push([x.label].concat(mods.map(m => x.mods.includes(m) ? f(m === 'W' ? rw.w : rw.z) : ''), bootCells(rw), [sigCell(rw)]))));
        if (r.totalIndirect) r.totalIndirect.forEach(x => rows.push([t('hy_tot_ind') + (r.xcoding ? ' (' + x.label + ')' : '')].concat(mods.map(() => ''), bootCells(x), [sigCell(x)])));
        h += card(mods.length ? t('hy_cindirect') : t('hy_indirect'), table([t('hy_path')].concat(modCols(mods), [t('hy_effect'), 'BootSE', 'BootLLCI', 'BootULCI', '']), rows, { title: 'process_indirect' }), { note: bootNote, doc: mods.length ? 'hayes_imm' : 'hayes_med' });
      }
      if (r.indices.length) {
        const nm = x => x.mod === 'WZ' ? r.w + ' × ' + r.z : x.mod === 'W' ? r.w : r.z;
        const hasAt = r.indices.some(x => x.at);
        h += card(t('hy_indices'), table([t('hy_path'), t('hy_type'), t('hy_moderator')].concat(hasAt ? [t('hy_at')] : [], [t('hy_index'), 'BootSE', 'BootLLCI', 'BootULCI', '']), r.indices.map(x => [x.label, t('hy_' + x.type), nm(x)].concat(hasAt ? [x.at ? (x.at === 'W' ? r.w : r.z) + ' = ' + f(x.atValue) : ''] : [], bootCells(x), [sigCell(x)])), { title: 'process_indices' }), { note: bootNote, doc: r.indices.some(x => x.type !== 'imm') ? 'hayes_pmm' : 'hayes_imm' });
      }
      if (r.condContrasts.length) h += card(t('hy_ccontrasts'), table([t('hy_path'), t('hy_moderator'), '1', '2', t('hy_effect') + ' (1 − 2)', 'BootSE', 'BootLLCI', 'BootULCI', ''], r.condContrasts.map(x => [x.label, x.mod === 'W' ? r.w : r.z, f(x.v1), f(x.v2), ...bootCells(x), sigCell(x)]), { title: 'process_cond_contrasts' }), { note: bootNote, doc: 'hayes_imm' });
      if (r.contrasts && r.contrasts.length) h += card(t('hy_contrasts') + ' (' + t('hy_con_' + r.options.contrast) + ')', table([t('hy_path'), t('hy_effect'), 'BootSE', 'BootLLCI', 'BootULCI', ''], r.contrasts.map(x => [(x.type === 2 ? '|' + x.a + '| − |' + x.b + '|' : '(' + x.a + ') − (' + x.b + ')'), ...bootCells(x), sigCell(x)]), { title: 'process_contrasts' }), { note: bootNote, doc: 'hayes_med' });
      if (r.std && r.std.length) h += card(t('hy_std'), table([t('hy_path'), t('hy_partial'), 'BootSE', 'BootLLCI', 'BootULCI', t('hy_complete'), 'BootSE', 'BootLLCI', 'BootULCI'], r.std.map(x => [x.label.startsWith('total|') ? t('hy_tot_ind') : x.label, ...bootCells(x.partial), ...(x.complete ? bootCells(x.complete) : ['–', '–', '–', '–'])]), { title: 'process_std' }), { note: bootNote, doc: 'hayes_std' });
      if (r.sobel) h += card(t('hy_sobel'), table([t('hy_path'), t('hy_effect'), 'se', 'Z', 'p'], r.sobel.map(x => [x.label, f(x.effect), f(x.se), f(x.z), pcell(x.p)]), { title: 'process_sobel' }), { doc: 'hayes_sobel' });
      return h;
    }));
    // 4. Johnson–Neyman
    if (r.jn) out.push(sec('g_final', 'hy_jn', t('hy_jn'), () => {
      const j = r.jn, rows = j.rows;
      let h = j.points.length ? `<h4>${esc(t('hy_jn_points'))}</h4>` + table([j.mod, t('hy_below'), t('hy_above')], j.points.map(p => [cell(iso(f(p.value)), '', p.value), f(p.below, 2), f(p.above, 2)]), { title: 'process_jn_points' }) : `<p class="note">${esc(t('hy_jn_none', { m: j.mod }))}</p>`;
      h += `<h4>${esc(t('hy_jn_table', { f: j.label, m: j.mod }))}</h4>` + table([j.mod, t('hy_effect'), 'se', 't', 'p', LL, UL], rows.map(x => [cell(iso(f(x.m)), '', x.m), f(x.effect), f(x.se), f(x.t), pcell(x.p), f(x.lo), f(x.hi)]), { title: 'process_jn', rowAttr: i => j.points.some(p => p.value === rows[i].m) ? 'class="hl"' : '' });
      const ys = rows.flatMap(x => [x.lo, x.hi]), ymin = Math.min(0, ...ys), ymax = Math.max(0, ...ys);
      const lines = [{ points: rows.map(x => [x.m, x.effect]), label: t('hy_effect') }, { points: rows.map(x => [x.m, x.lo]), color: 'var(--muted)', label: pc + '% CI' }, { points: rows.map(x => [x.m, x.hi]), color: 'var(--muted)' }, { points: [[j.range[0], 0], [j.range[1], 0]], color: 'var(--line)' }]
        .concat(j.points.map(p => ({ points: [[p.value, ymin], [p.value, ymax]], color: 'var(--warn)' })));
      h += chart(C.scatter([], { lines, xLabel: j.mod, yLabel: j.label, title: t('hy_jn') }), 'process_jn');
      return card(t('hy_jn'), h, { doc: 'hayes_jn' });
    }));
    // 5. interaction plot
    if (r.plot) out.push(sec('g_final', 'hy_plot', t('hy_plot'), () => {
      const p = r.plot, lab = l => [p.w !== null && l.w !== null ? p.w + ' = ' + f(l.w, 2) : '', p.z !== null && l.z !== null ? p.z + ' = ' + f(l.z, 2) : ''].filter(Boolean).join(', ');
      const svg = C.scatter([], { lines: p.lines.map(l => ({ points: l.points, label: lab(l) })), xLabel: p.focal, yLabel: p.outcome, title: t('hy_plot'), width: 600 });
      return card(t('hy_plot') + ': ' + p.focal + ' → ' + p.outcome, chart(svg, 'process_plot') + table([p.focal].concat(p.lines.map(lab)), p.lines[0].points.map((pt, i) => [cell(iso(f(pt[0])), '', pt[0])].concat(p.lines.map(l => f(l.points[i][1])))), { title: 'process_plot_data' }), { note: t('hy_plot_note', { y: p.outcome, f: p.focal }), doc: 'hayes_mod' });
    }));
    return out;
  }

  (root.YP_PLUGINS = root.YP_PLUGINS || []).push({
    id: 'process',
    i18n: { en, ar },
    refs,
    methods,
    menu: [{ group: 'menu_process', items: ['hayes'] }],
    tasks: {
      hayes: {
        title: 'an_hayes', doc: 'hayes', noModel: true,
        fields: ['hModel', 'hPreview', 'hX', 'hY', 'hM', 'hW', 'hZ', 'hCov', 'hCovIn', 'hMcx', 'hCenter', 'hHC', 'hProbe', 'hBoot', 'seed', 'hConf', 'hBootCI', 'hContrast', 'hJN', 'hTotal', 'hEff', 'hSobel', 'hCondC'],
        defaults: { hModel: 4, hBoot: 5000, hConf: 95, hJN: true, hCenter: 'none', hProbe: 'percentiles', hBootCI: 'percentile', hCovIn: 'all', hContrast: '0', hHC: '' }
      }
    },
    fields,
    readForm,
    sections: { hayes: sections },
    // for tests and other modules
    hayes: { describe, needs, diagramOf, preview }
  });
})(typeof self !== 'undefined' ? self : this);
