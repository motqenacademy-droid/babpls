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
AR = [
    (r'⬇[^\n]*', ''), (r'\bPLS-SEM\b', 'بي إل إس سيم'), (r'\bCB-SEM\b', 'سي بي سيم'), (r'\bPLSc\b', 'بي إل إس سي'), (r'\bPLSpredict\b', 'بي إل إس بريدكت'),
    (r'\bBabPls\b', 'باب بي إل إس'), (r'\bIPMA\b', 'آي بي إم إيه'), (r'\bHTMT\b', 'إتش تي إم تي'), (r'\bAVE\b', 'إيه في إي'), (r'\bAPA\b', 'إيه بي إيه'),
    (r'\bVIF\b', 'في آي إف'), (r'\bSRMR\b', 'إس آر إم آر'), (r'\bCFI\b', 'سي إف آي'), (r'\bRMSEA\b', 'آر إم إس إي إيه'), (r'\bExcel\b', 'إكسل'),
    (r'\bHTML\b', 'إتش تي إم إل'), (r'\bCSV\b', 'سي إس في'), (r'\bMGA\b', 'إم جي إيه'), (r'\bNCA\b', 'إن سي إيه'), (r'\bFIMIX\b', 'فيمكس'),
    (r'\bPROCESS\b', 'بروسس'), (r'\bSmartPLS\b', 'سمارت بي إل إس'), (r'rho_A', 'رو إيه'), (r'rho_c', 'رو سي'), (r'α', 'ألفا'), (r'R²', 'آر تربيع'),
    (r'→', ' إلى '), (r'≥', ' لا يقل عن '), (r'≤', ' لا يزيد على '), (r'[“”"«»]', ''), (r'\s+', ' '),
]


def speak(lang, text):
    for a, b in ((EN_PRE + EN) if lang == 'en' else AR):
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
    key = hashlib.sha1((model + '|' + lang + '|' + spoken).encode()).hexdigest()[:16]
    os.makedirs(CACHE, exist_ok=True)
    out = os.path.join(CACHE, f'{lang}-{key}.wav')
    if not os.path.exists(out):
        v = PiperVoice.load(model)
        with wave.open(out + '.tmp', 'wb') as w:
            v.synthesize_wav(spoken, w, syn_config=SynthesisConfig(length_scale=0.97 if lang == 'en' else 1.0, noise_scale=0.6, noise_w_scale=0.7))
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
