#!/usr/bin/env python3
"""Add the soundtrack to a rendered BabPls video: narration from its .srt (when a voice for the language is installed)
over generated background music that ducks under the voice. The video stream is copied, not re-encoded.

  audio.py <video.mp4> <lang> <promo|tutorial> [--no-voice]

Each subtitle is spoken at its start time; a line never starts before the previous one has finished (any delay is
reported). The URL line of an end card is not read aloud.
"""
import json, os, re, subprocess, sys, tempfile, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import voice, music  # noqa: E402

SR = 44100


def srt(path):
    out = []
    for block in re.split(r'\n\s*\n', open(path, encoding='utf-8').read().strip()):
        lines = block.strip().split('\n')
        if len(lines) < 3:
            continue
        a, b = lines[1].split(' --> ')
        t = lambda s: sum(float(x) * m for x, m in zip(s.replace(',', '.').split(':'), (3600, 60, 1)))
        text = ' '.join(l for l in lines[2:] if not re.search(r'[a-z0-9-]+\.github\.io|https?://', l)).replace('‏', '').strip()
        out.append((t(a), t(b), text))
    return out


def read_wav(path):
    with wave.open(path) as r:
        sr, ch, n = r.getframerate(), r.getnchannels(), r.getnframes()
        x = np.frombuffer(r.readframes(n), dtype='<i2').astype(np.float32) / 32768
    if ch == 2:
        x = x.reshape(-1, 2).mean(1)
    if sr != SR:  # linear resampling is plenty for speech at this rate ratio
        x = np.interp(np.arange(int(len(x) * SR / sr)) * sr / SR, np.arange(len(x)), x)
    return x


def duration(path):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]))


def main():
    video, lang, style = sys.argv[1], sys.argv[2], sys.argv[3]
    if style == 'promo' and lang == 'ar':  # same narration speed as promo.js used while recording (voice.py cache key)
        os.environ.setdefault('BABPLS_AR_SPEED', '0.8')
    use_voice = '--no-voice' not in sys.argv and voice.model_for(lang) is not None
    secs = duration(video)
    n = int(secs * SR)
    speech = np.zeros(n, dtype=np.float32)
    report = {'video': video, 'voice': use_voice, 'lines': 0, 'max_delay': 0.0, 'delayed': []}
    if use_voice:
        free, prev = 0.0, None
        for start, end, text in srt(video[:-4] + '.srt'):
            said = voice.speak(lang, text) if text else ''
            if not said or said == prev:  # a caption re-shown with a second line (a downloaded file name) is spoken once
                prev = said or prev
                continue
            prev = said
            clip = read_wav(voice.synth(lang, text)['wav'])
            at = max(start, free)
            if at - start > 0.05:
                report['delayed'].append([round(start, 2), round(at - start, 2), text[:50]])
            i = int(at * SR)
            if i >= n:
                break
            e = min(n, i + len(clip))
            speech[i:e] += clip[:e - i] * 0.9
            free = at + len(clip) / SR + 0.25
            report['lines'] += 1
            report['max_delay'] = max(report['max_delay'], round(at - start, 2))
    bed = music.render(style, secs).astype(np.float32)
    # ducking: follow the speech envelope (fast attack, slow release) and pull the music down under the voice
    env = np.abs(speech)
    k = int(0.05 * SR)
    env = np.convolve(env, np.ones(k) / k, mode='same')
    duck = np.clip(env / 0.02, 0, 1)
    rel = np.exp(-1 / (0.6 * SR))
    for i in range(1, n):  # release smoothing
        if duck[i] < duck[i - 1] * rel:
            duck[i] = duck[i - 1] * rel
    level = (0.30 if style == 'promo' else 0.22) * (1 - 0.72 * duck) if use_voice else (0.55 if style == 'promo' else 0.4)
    mix = bed[:n] * (level[:, None] if use_voice else level) + speech[:, None]
    mix /= max(1.0, np.abs(mix).max() / 0.95)
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, 'mix.wav')
        with wave.open(wav, 'wb') as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((mix * 32767).astype('<i2').tobytes())
        out = os.path.join(tmp, 'out.mp4')
        # loudness to -16 LUFS (web/social standard): one constant gain followed by a limiter at -2.5 dBFS (headroom for the
        # AAC overshoot and for platform transcoding). The limiter takes some loudness off the speech peaks, so the gain is
        # found by measuring the whole chain and correcting it (two or three quick passes). A single dynamic loudnorm pass
        # landed about 1 LU short on voiced mixes. AAC 192k, video copied.
        def chain(g):
            return f'volume={g:.2f}dB,alimiter=limit=0.75:attack=5:release=50:level=false'

        def measure(af):
            log = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', wav, '-af', af + (',' if af else '') +
                                  'loudnorm=I=-16:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
            return float(json.loads(log[log.rindex('{'):log.rindex('}') + 1])['input_i'])

        g = -16 - measure('')
        for _ in range(3):
            got = measure(chain(g))
            if abs(got + 16) < 0.2:
                break
            g += -16 - got
        af = chain(g)
        subprocess.check_call(['ffmpeg', '-y', '-loglevel', 'error', '-i', video, '-i', wav, '-map', '0:v:0', '-map', '1:a:0',
                               '-af', af, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
                               '-shortest', '-movflags', '+faststart', out])
        os.replace(out, video)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
