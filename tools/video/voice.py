#!/usr/bin/env python3
"""Offline narration for the BabPls videos with Piper (neural TTS, runs locally).

  voice.py synth <lang> <text>   -> prints JSON {"wav": path, "seconds": float} (cached by text)
  voice.py has <lang>            -> prints 1 if a voice model for <lang> is installed, else 0

Voices (see tools/video/README.md):
  en: en_US-joe-medium (CC0), from the npm package vowel-lab-voices-float (float.onnx; the config is rebuilt here)
  ar: ar_JO-kareem-medium from rhasspy/piper-voices (put the .onnx and .onnx.json in $BABPLS_VOICES/ar/)
Captions are written to be read; speak() turns symbols and abbreviations into words first.
"""
import hashlib, json, os, re, sys, wave

VOICES = os.environ.get('BABPLS_VOICES', os.path.join(os.path.dirname(os.path.abspath(__file__)), '.voices'))
CACHE = os.environ.get('BABPLS_TTS_CACHE', os.path.join(VOICES, 'cache'))


def model_for(lang):
    d = os.path.join(VOICES, lang)
    if not os.path.isdir(d):
        return None
    for f in sorted(os.listdir(d)):
        if f.endswith('.onnx'):
            p = os.path.join(d, f)
            if lang == 'en' and not os.path.exists(p + '.json'):
                from piper.phoneme_ids import DEFAULT_PHONEME_ID_MAP
                json.dump({'audio': {'sample_rate': 22050}, 'espeak': {'voice': 'en-us'}, 'language': {'code': 'en_US'},
                           'inference': {'noise_scale': 0.667, 'length_scale': 1, 'noise_w': 0.8}, 'phoneme_type': 'espeak',
                           'num_symbols': 256, 'num_speakers': 1, 'speaker_id_map': {}, 'phoneme_id_map': DEFAULT_PHONEME_ID_MAP},
                          open(p + '.json', 'w'))
            return p if os.path.exists(p + '.json') else None
    return None


EN = [
    (r'⬇[^\n]*', ''), (r'\bPLS-SEM\b', 'P L S SEM'), (r'\bCB-SEM\b', 'C B SEM'), (r'\bPLSc\b', 'P L S C'), (r'\bPLSpredict\b', 'P L S predict'),
    (r'\bIPMA\b', 'I P M A'), (r'\bMGA\b', 'M G A'), (r'\bNCA\b', 'N C A'), (r'\bCTA\b', 'C T A'), (r'\bHTMT\b', 'H T M T'), (r'\bAVE\b', 'A V E'),
    (r'\bAPA\b', 'A P A'), (r'\bVIF\b', 'V I F'), (r'\bSRMR\b', 'S R M R'), (r'\bCFI\b', 'C F I'), (r'\bTLI\b', 'T L I'), (r'\bRMSEA\b', 'R M S E A'),
    (r'\bGSCA\b', 'G S C A'), (r'\bFIMIX\b', 'fimix'), (r'\bCVPAT\b', 'C V pat'), (r'\bHTML\b', 'H T M L'), (r'\bCSV\b', 'C S V'), (r'\bURL\b', 'U R L'),
    (r'\bSEM\b', 'sem'), (r'\bSD\b', 'standard deviation'), (r'\bBabPls\b', 'Bab P L S'), (r'rho_A', 'rho A'), (r'rho_c', 'rho C'), (r'\bα\b|α', 'alpha'),
    (r'R²', 'R squared'), (r'f²', 'f squared'), (r'Q²', 'Q squared'), (r'χ²', 'chi square'), (r'→', ' to '), (r'≥', ' at least '), (r'≤', ' at most '),
    (r'\bP\s*<\s*', 'P less than '), (r'\s<\s', ' below '), (r'\s>\s', ' above '), (r'(\d),(\d{3})', r'\1\2'), (r'\be\.g\.', 'for example'),
    (r'\bi\.e\.', 'that is'), (r'([a-z]+)_(\d)', r'\1 \2'), (r'&', ' and '), (r'%', ' percent'), (r'[“”"«»]', ''),
    # the letter A inside a spelled acronym (A P A, I P M A): a lone "A" is read as the article "uh"
    (r'\bA(?= [A-Z]\b)', 'eh'), (r'(?<=\b[A-Z] )A\b', 'eh'), (r'\s+', ' '),
]
# tutorial narration (applied before EN): spoken forms that espeak would read literally or oddly
EN_PRE = [
    (r'\bSPSS\b', 'S P S S'), (r'\bDr\. ', 'Doctor '), (r'\bet al\.', 'and colleagues'), (r'⤢', 'fit'), (r'\bimag_(\d)', r'image \1'), (r'’', "'"),
    (r'(\w+) → (\w+) → (\w+)', r'\1 through \2 to \3'), (r'\s=\s', ' is '),
    # rho_A: a lone "A" before a number or verb is read as the article "uh"; "eh" is phonemised as the letter (eɪ)
    (r'rho_A', 'rho eh'), (r'\bloy_(\d)', r'loyalty item \1'),
    # numbers as a narrator says them: 0.708 -> "point 7 0 8", (2019) -> "(20 19)" = twenty nineteen
    # a one-digit decimal written with a trailing zero (0.70, 0.50) is said as "point 7"; 0.708 and 0.05 keep every digit
    (r'(?<![\d.])0\.([1-9])0(?!\d)', r'0.\1'),
    (r'(?<![\d.])0\.(\d+)', lambda m: 'point ' + ' '.join(m.group(1))), (r'\((19|20)(\d\d)\)', r'(\1 \2)'),
]
# Arabic narration (applied before AR): Piper's diacritizer (tashkeel) misreads some imperatives, case endings and
# symbols, so those get fully diacritized replacements (Piper keeps diacritics it is given); numbers with a decimal point
# are read digit by digit in Arabic words; a Latin term or number glued to an Arabic prefix (وExcel, لـ«الولاء», فـ0.802)
# is split with § so the \b rules below match it, and joined back after them (AR_POST).
AR_DIGITS = 'صِفْرْ واحِدْ اثْنانْ ثَلاثَهْ أَرْبَعَهْ خَمْسَهْ سِتَّهْ سَبْعَهْ ثَمانِيَهْ تِسْعَهْ'.split()  # pausal forms (ـهْ = the spoken -ah)
AR_PRE = [
    (r'[“”"«»]', ''), (r'لـال', 'لل'), (r'ـ', ''), (r'(?<=[؀-ۿ])(?=[A-Za-z0-9])', '§'), (r'\bد\. ', 'الدكتور '),
    # symbols
    (r'العلامة ✓', 'علامةُ الصَّحّ'), (r'▲', 'المُثَلَّث'), (r'✗', 'علامةُ الخَطَأ'), (r'\bSPSS\b', 'إس بي إس إس'), (r'\bألفا\b', 'أَلْفَا'),
    (r'(المسار|فمسار) (\S+) ← ', r'\1 مِنَ \2 إلى '), (r'←', ' ثُمَّ '), (r'زر ⤢', 'زِرُّ المُلاءَمَة'), (r'كبّر بزر \+', 'كَبِّرْ بِزِرِّ الزّائِد'),
    (r'\bCtrl\b', 'كُنْتْرول'), (r'\bShift\b', 'شِيفْت'), (r'\bEnter\b', 'إِنْتَر'), (r'\bHair\b', 'هير'), (r'f²', 'إِفْ تَرْبيع'),
    (r'\bimag_(\d)', lambda m: 'إيماج ' + AR_DIGITS[int(m.group(1))]), (r'\bloy_(\d)', lambda m: 'لُوي ' + AR_DIGITS[int(m.group(1))]),
    (r'\bP\b', 'بي'), (r'\bt\b', 'تي'), (r'\bPLS-SEM\b', 'بي إلْ إسْ سِيمْ'), (r'\bCB-SEM\b', 'سي بي سِيمْ'), (r'\bBabPls\b', 'بابْ بي إلْ إسْ'), (r'\bIPMA\b', 'آي بي إمْ إيه'), (r'\bPLSpredict\b', 'بي إلْ إسْ بْرِدِكْتْ'), (r'α', 'أَلْفَا'),
    # numbers: 0.70 -> «صفر فاصلة سبعة», 0.708 -> «صفر فاصلة سبعة صفر ثمانية», 95% -> «95 بالمئة»
    (r'(?<![\d.])(\d)\.([1-9])0(?!\d)', r'\1.\2'),
    (r'(?<![\d.])(\d+)\.(\d+)', lambda m: ' '.join(AR_DIGITS[int(d)] for d in m.group(1)) + ' فاصِلَهْ ' + ' '.join(AR_DIGITS[int(d)] for d in m.group(2))),
    (r'(\d+)%', r'\1 بالمِئَة'), (r'نحو 90', 'نَحْوَ تِسْعين'),
    # words the diacritizer gets wrong (imperatives read as past verbs, زر read as a verb, wrong case or voice)
    (r'بزر نسخ', 'بِزِرِّ نَسْخ'), (r'شغّل ال', 'شَغِّلِ ال'), (r'\bالدلالة\b', 'الدَّلالَةِ'), (r'\bوآخرين\b', 'وَآخَرِينَ'), (r'\bللولاء\b', 'لِلْوَلاءِ'), (r'\bزر\b', 'زِرُّ'), (r'\bوزر\b', 'وَزِرُّ'), (r'\bبزر\b', 'بِزِرِّ'), (r'\bافتح\b', 'افْتَحْ'), (r'أو تصفّح', 'أو تَصَفَّحْ'), (r'\bاستورد\b', 'اسْتَوْرِدْ'),
    (r'\bنزّل\b', 'نَزِّلْ'), (r'\bيقبل\b', 'يَقْبَلُ'), (r'\bالتفلطح\b', 'التَّفَلْطُحُ'), (r'\bاختر\b', 'اخْتَرْ'), (r'\bاسحبها\b', 'اسْحَبْها'),
    (r'\bاكتب\b', 'اكْتُبْ'), (r'وسمِّ البقية', 'وَسَمِّ البَقِيَّةَ'), (r'\bيتجه\b', 'يَتَّجِهُ'), (r'عُد إلى', 'عُدْ إلى'),
    (r'لا تحذف المؤشر', 'لا تَحْذِفِ المُؤَشِّرَ'), (r'حسّن ذلك الثبات', 'حَسَّنَ ذلك الثَّباتَ'), (r'وألا يقل', 'وَأَلّا يَقِلَّ'),
    (r'\bستعلّم\b', 'سَتُعَلِّمُ'), (r'\bفوق\b', 'فَوْقَ'), (r'\bشغّل\b', 'شَغِّلْ'), (r'\bمسودة\b', 'مُسَوَّدَةٌ'), (r'راجعها وكيّفها', 'راجِعْها وكَيِّفْها'),
    (r'\bانسخها\b', 'انْسَخْها'), (r'\bتُحفظ\b', 'تُحْفَظُ'), (r'\bتفسّر\b', 'تُفَسِّرُ'), (r'وماذا يُظهر المثال', 'وماذا يُظْهِرُ المِثالُ'),
    (r'\bيحمّل\b', 'يُحَمِّلُ'), (r'\bتُظهر\b', 'تُظْهِرُ'), (r'يخفّف الدعم أثر عبء العمل', 'يُخَفِّفُ الدَّعْمُ أَثَرَ عِبْءِ العَمَلِ'),
    (r'\bكرونباخ\b', 'كْرونْباخ'), (r'\bتُسحب\b', 'تُسْحَبُ'), (r'^درس\b', 'دَرْسُ'), (r'\bجرّبه\b', 'جَرِّبْهُ'),
    (r'\bانقر\b', 'انْقُرْ'), (r'\bفستعلّمه\b', 'فَسَتُعَلِّمُهُ'), (r'\bتعطي\b', 'تُعْطِي'), (r'\bيُحفظ\b', 'يُحْفَظُ'), (r'وشغّل هذا', 'وَشَغِّلْ هذا'),
    (r'\bتعرض الصيغ\b', 'تَعْرِضُ الصِّيَغَ'), (r'\bيعدّ(?=\s)', 'يَعُدُّ'), (r'الدعم يخفّف أثر عبء العمل', 'الدَّعْمُ يُخَفِّفُ أَثَرَ عِبْءِ العَمَلِ'), (r'\bالمتأثِّر', 'المُتَأَثِّر'), (r'وارسم بقية', 'وَرْسُمْ بَقِيَّةَ'), (r'قائمة احسب فيها كل', 'قائِمَةُ اِحْسِبْ فيها كُلُّ'),
]
# promo narration (checked against Piper's IPA): wrong vowels or case endings from the diacritizer; معاملات = coefficients
# (مُعامِلات, not مُعامَلات); «من» alone is the preposition (min, not man); بِال before a moon letter is read «bi-aal»
_AR = '؀-ۿ'
AR_PRE += [
    (r'…', '، '), (r'(?<![A-Za-z])p(?![A-Za-z])', 'بي'), (rf'(?<![{_AR}])من(?![{_AR}])', 'مِنْ'),
    (rf'(?<![{_AR}])([وف]?)بال(?=[ءأإآبجحخعغفقكمهوي])', r'\1بِلْ'),
    (r'تحمّل البيانات', 'تُحَمِّلُ الْبَيَانَاتِ'), (r'^أكثر ', 'أَكْثَرُ '), (r'الإقلاع الذاتي ب', 'الْإِقْلَاعُ الذَّاتِيُّ بِ'),
    (r'آلاف عينة', 'آلافِ عَيِّنَةٍ'), (r'\bافتراضياً', 'اِفْتِرَاضِيًّا'), (r'شريط تقدّم حيّ', 'شَرِيطُ تَقَدُّمٍ حَيٌّ'), (r'\bويمكنك\b', 'وَيُمْكِنُكَ'),
    (r'تقييم آلية', 'تَقْيِيمٍ آلِيَّةٌ'), (r'\bتنبّهك\b', 'تُنَبِّهُكَ'), (r'وفقرة نتائج جاهزة', 'وَفَقْرَةُ نَتَائِجَ جَاهِزَةٌ'),
    (r'\bبأسلوب\b', 'بِأُسْلُوبِ'), (r'\bتوزيع', 'تَوْزِيع'), (r'المعاملات وقيم', 'الْمُعَامِلَاتُ وَقِيَمُ'), (r'معاملات', 'مُعَامِلَات'),
    (r'الأهمية والأداء', 'الْأَهَمِّيَّةِ وَالْأَدَاءِ'), (r'أولويات التحسين', 'أَوْلَوِيَّاتِ التَّحْسِين'), (r'صدّر كل', 'صَدِّرْ كُلَّ'),
    (r'\bنسّق الرسم\b', 'نَسِّقِ الرَّسْمَ'), (r'على نموذج المسار', 'عَلَى نَمُوذَجِ الْمَسَارِ'), (r'كما تشاء', 'كَمَا تَشَاءُ'), (r'ووضع داكن مريح', 'وَوَضْعٌ دَاكِنٌ مُرِيحٌ'),
    (r'برنامج واحد', 'بَرْنَامَجٍ وَاحِد'), (r'\bوبياناتك\b', 'وَبَيَانَاتُكَ'),
    # imperative with a pronoun (iftaḥhu, not iftaḥahu); phrase-final taa marbuta in its pausal form (-ah, not a released -at)
    (r'\bافتحه\b', 'اِفْتَحْهُ'), (r'في قائمة واحدة', 'فِي قائِمَةٍ واحِدَهْ'), (r'وفترة الثقة', 'وَفَتْرَةِ الثِّقَهْ'),
    (r'مطابقة كاملة', 'مُطابَقَةٍ كامِلَهْ'), (r'والإنجليزية$', 'والإنْجِلِيزِيَّهْ'), (r'بِأُسْلُوبِ APA$', 'بِأُسْلُوبِ إي بي إي'),
    # the diacritizer drops the hint on a sentence-initial اُنْ in a long line (ˈanqur): raw phonemes for the hamza and u
    (r'^انْقُرْ على مسار', '[[ ʔˈunqur ]] على مسار'),
]
# tutorial narration (checked against Piper's IPA): sentence-initial imperatives get hamzat al-wasl with a kasra (or raw
# phonemes), otherwise the diacritizer reads them as first-person verbs (ˈanqur «I click»); a few voice/word-form fixes
# (تُعالَجُ passive, مُعامِل coefficient, مُصَنَّف workbook, النَّموذَج not an-numūdhij)
AR_PRE += [
    (r'^اضغط', 'إِضْغَطْ'), (r'^انْقُرْ', '[[ ʔˈunqur ]]'), (r'ثم انْسَخْها', 'ثُمَّ إِنْسَخْها'), (r'\bاخْتَرْ', 'اِخْتَرْ'),
    (r'^اسحب ال', 'اِسْحَبِ ال'), (r'واسحبها', '[[ wasħˈabhaː ]]'), (r'واسحب ال', 'وَاسْحَبِ ال'), (r'\bابدأ\b', 'اِبْدَأْ'),
    (r'^اكْتُبْ', '[[ ʔˈuktub ]]'), (r'تُعالج القيم', 'تُعالَجُ القيم'), (r'كل معامل', 'كُلَّ مُعامِلٍ'), (r'مصنف واحد', 'مُصَنَّفٍ واحِد'),
    (r'لسان النموذج', 'لِسانِ النَّموذَج'), (r'تقدير النموذج', 'تَقْدِيرُ النَّموذَجِ'), (r'النموذج جاهز', 'النَّموذَجُ جاهِز'),
    (r'يلائمه', 'يُلائِمُهُ'), (r'كيف تشغّله', 'كَيْفَ تُشَغِّلُهُ'), (r'وأضعفها', 'وَأَضْعَفُها'), (r'تفحص كل', 'تَفْحَصُ كُلَّ'),
    (r'هير وَآخَرِينَ', 'هيرْ وَآخَرِينَ'), (r'أو Excel أو', 'أو إكْسِلْ أو'), (r'لاختبار ', 'لِخْتِبارِ '), (r'ينزّل ملف', 'يُنَزِّلُ مِلَفَّ'),
    (r'هذا التحليل يُحَمِّلُ', 'هذا التَّحْلِيلَ يُحَمِّلُ'), (r'إن حسّن الثبات', 'إن حَسَّنَ الثَّباتَ'), (r'لا تَحْذِفِ المُؤَشِّرَ', 'لا [[ tˈaħðifi ]] المُؤَشِّرَ'),
]
# tutorial review fixes (masculine address throughout, case endings, wasl after wa-, counted nouns)
AR_PRE += [
    (r'اسْتَوْرِدْ بياناتك', 'اسْتَوْرِدْ بَياناتَكْ'), (r'تغادر جهازك', 'تُغادِرُ جِهازَكْ'), (r'على جهازك،', 'عَلى جِهازِكَ،'),
    (r'لدراستك', 'لِدِراسَتِكَ'), (r'بخوارزمية', 'بِخَوارِزْمِيَّةِ'), (r'^الألسنة', 'الأَلْسِنَةُ'),
    (r'5000 عينة فرعية', 'خَمْسَةُ آلافِ عَيِّنَةٍ فَرْعِيَّةٍ'), (r'^5000 تقدير', 'خَمْسَةُ آلافِ تَقْدِيرٍ'), (r'بالطريقة نفسها', 'بِطَّرِيقَةِ نَفْسِها'),
    (r'وانقر السبب', 'وَنْقُرِ السَّبَبَ'), (r'^والآثار', 'وَلْآثارُ'), (r'نموذجك الأول', 'نَموذَجُكَ الأَوَّلُ'), (r'متغير كامن', 'مُتَغَيِّرٌ كامِنٌ'),
    (r'الحالة كاملة', 'الحالَةِ كامِلَةً'), (r'أول مؤشر', 'أَوَّلَ مُؤَشِّرٍ'), (r'300 مستجيب', '300 مُسْتَجيبٍ'), (r'وكل قيم', 'وَكُلُّ قِيَمِ'),
]
# after every rule: «مِنْ» before the article is «مِنَ» (mina l-), and the imperative «صَدِّرْ» rule must not catch «يصدّر»
AR_POST = [(r'§\s*', ''), (r'مِنْ ال', 'مِنَ ال'), (r'يصَدِّرْ', 'يُصَدِّرُ'), (r'\s+', ' ')]
AR = [
    (r'⬇[^\n]*', ''), (r'\bPLS-SEM\b', 'بي إل إس سيم'), (r'\bCB-SEM\b', 'سي بي سيم'), (r'\bPLSc\b', 'بي إل إس سي'), (r'\bPLSpredict\b', 'بي إل إس بريدكت'),
    (r'\bBabPls\b', 'باب بي إل إس'), (r'\bIPMA\b', 'آي بي إم إيه'), (r'\bHTMT\b', 'إتش تي إم تي'), (r'\bAVE\b', 'إي في إي'), (r'\bAPA\b', 'إي بي إي'),
    (r'\bVIF\b', 'في آي إف'), (r'\bSRMR\b', 'إس آر إم آر'), (r'\bCFI\b', 'سي إف آي'), (r'\bRMSEA\b', 'آر إم إس إي إيه'), (r'\bExcel\b', 'إكْسِلْ'),
    (r'\bHTML\b', 'إتش تي إم إل'), (r'\bCSV\b', 'سي إس في'), (r'\bMGA\b', 'إم جي إيه'), (r'\bNCA\b', 'إن سي إيه'), (r'\bFIMIX\b', 'فيمكس'),
    (r'\bPROCESS\b', 'بروسس'), (r'\bSmartPLS\b', 'سمارت بي إل إس'), (r'rho_A', 'رُو إِي'), (r'rho_c', 'رو سي'), (r'α', 'ألفا'), (r'R²', 'آر تربيع'),
    (r'→', ' إلى '), (r'≥', ' لا يقل عن '), (r'≤', ' لا يزيد على '), (r'[“”"«»]', ''), (r'\s+', ' '),
]


def speak(lang, text):
    for a, b in ((EN_PRE + EN) if lang == 'en' else AR_PRE + AR + AR_POST):
        text = re.sub(a, b, text)
    return text.strip()


def synth(lang, text):
    import io
    from piper import PiperVoice
    from piper.config import SynthesisConfig
    model = model_for(lang)
    if not model:
        raise SystemExit('no voice for ' + lang)
    spoken = speak(lang, text)
    # Piper length_scale (< 1 = faster); kareem at 1.0 is a slow ~4.3 syllables/s. BABPLS_AR_SPEED overrides it per video
    # (the promo sets 0.8 in promo.js and audio.py; it is part of the cache key, so both steps must use the same value)
    speed = 0.97 if lang == 'en' else float(os.environ.get('BABPLS_AR_SPEED') or 0.9)
    key = hashlib.sha1((model + '|' + lang + '|' + spoken + ('' if lang == 'en' else f'|{speed}')).encode()).hexdigest()[:16]
    os.makedirs(CACHE, exist_ok=True)
    out = os.path.join(CACHE, f'{lang}-{key}.wav')
    if not os.path.exists(out):
        v = PiperVoice.load(model)
        with wave.open(out + '.tmp', 'wb') as w:
            v.synthesize_wav(spoken, w, syn_config=SynthesisConfig(length_scale=speed, noise_scale=0.6, noise_w_scale=0.7))
        os.replace(out + '.tmp', out)
    with wave.open(out) as r:
        sec = r.getnframes() / r.getframerate()
    return {'wav': out, 'seconds': round(sec, 3), 'spoken': spoken}


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'has':
        print(1 if model_for(sys.argv[2]) else 0)
    elif cmd == 'synth':
        print(json.dumps(synth(sys.argv[2], sys.argv[3]), ensure_ascii=False))
    elif cmd == 'speak':
        print(speak(sys.argv[2], sys.argv[3]))
