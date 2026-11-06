#!/usr/bin/env python3
"""Original background music for the BabPls videos, synthesised from code (no samples, no licence issues).

  music.py <style> <seconds> <out.wav>     style: promo (brighter, light beat) | tutorial (calm pad)
"""
import sys, wave
import numpy as np

SR = 44100


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def tone(freq, dur, harmonics=10, bright=1.0):
    t = np.arange(int(dur * SR)) / SR
    out = np.zeros_like(t)
    for h in range(1, harmonics + 1):
        if freq * h > 6000:
            break
        out += np.sin(2 * np.pi * freq * h * t + h * 0.7) * (1 / h ** (1.6 / bright))
    return out


def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x); acc = 0.0
    for i in range(len(x)):  # one-pole: cheap and smooth enough for pads
        acc = (1 - a) * x[i] + a * acc; y[i] = acc
    return y


def env(n, attack, release):
    e = np.ones(n); a = int(attack * SR); r = int(release * SR)
    if a: e[:a] = np.linspace(0, 1, a)
    if r: e[-r:] *= np.linspace(1, 0, r)
    return e


def mix_in(buf, j0, s, g=1.0):
    if j0 >= len(buf): return
    e = min(len(buf), j0 + len(s)); buf[j0:e] += s[:e - j0] * g


def render(style, seconds):
    promo = style == 'promo'
    bpm = 88 if promo else 68
    beat = 60 / bpm
    bar = 4 * beat
    # chord roots/voicings (MIDI): uplifting minor-major loop for the promo, gentle major loop for the tutorial
    prog = ([(57, [57, 60, 64, 67]), (53, [53, 57, 60, 64]), (48, [55, 60, 64, 67]), (55, [55, 59, 62, 67])] if promo else
            [(48, [55, 60, 64, 71]), (45, [57, 60, 64, 67]), (41, [57, 60, 65, 69]), (43, [55, 59, 62, 69])])
    bars_per_chord = 1 if promo else 2
    n = int(seconds * SR) + SR
    L = np.zeros(n); R = np.zeros(n)
    t0 = 0.0; k = 0
    while t0 < seconds:
        root, notes = prog[k % len(prog)]
        dur = bar * bars_per_chord
        i0 = int(t0 * SR)
        # pad: two slightly detuned voices per note, panned apart, fading in/out across chord changes
        for j, m in enumerate(notes):
            for det, pan in ((-0.07, 0.3), (0.07, 0.7)):
                s = tone(midi(m + det), dur + 0.8, harmonics=8, bright=0.8) * env(int((dur + 0.8) * SR), 0.6, 1.0) * 0.06
                mix_in(L, i0, s, 1 - pan); mix_in(R, i0, s, pan)
        # bass: soft sine on the root, one note per beat (promo) or per bar (tutorial)
        step = beat if promo else bar
        b = 0.0
        while b < dur - 1e-6:
            ln = step * 0.95
            s = np.sin(2 * np.pi * midi(root - 12) * np.arange(int(ln * SR)) / SR) * env(int(ln * SR), 0.02, ln * 0.6) * (0.16 if promo else 0.11)
            j0 = i0 + int(b * SR); mix_in(L, j0, s); mix_in(R, j0, s)
            b += step
        # promo: plucked arpeggio in eighth notes with ping-pong echo, plus a soft kick and shaker after the intro
        if promo:
            arp = notes + [notes[1] + 12, notes[2] + 12]
            q = 0
            while q * beat / 2 < dur - 1e-6:
                m = arp[q % len(arp)] + 12
                ln = 0.45
                tt = np.arange(int(ln * SR)) / SR
                s = (np.sin(2 * np.pi * midi(m) * tt) + 0.3 * np.sin(4 * np.pi * midi(m) * tt)) * np.exp(-tt * 9) * np.minimum(1, tt / 0.005) * 0.05
                j0 = i0 + int(q * beat / 2 * SR)
                for d, g, pan in ((0, 1.0, 0.5), (beat * 0.75, 0.45, 0.15), (beat * 1.5, 0.25, 0.85)):
                    jj = j0 + int(d * SR); mix_in(L, jj, s, g * (1 - pan) * 2); mix_in(R, jj, s, g * pan * 2)
                q += 1
            if t0 >= bar * 2 and t0 < seconds - bar * 2:
                for bt in range(4 * bars_per_chord):
                    jj = i0 + int(bt * beat * SR)
                    if bt % 2 == 0:  # kick
                        tt = np.arange(int(0.3 * SR)) / SR
                        f = 50 + 70 * np.exp(-tt * 30)
                        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 12) * 0.22
                    else:  # shaker: high-passed noise burst
                        tt = np.arange(int(0.09 * SR)) / SR
                        s = np.diff(np.random.default_rng(bt + k).standard_normal(len(tt) + 1)) * np.exp(-tt * 45) * 0.025
                    mix_in(L, jj, s); mix_in(R, jj, s)
        t0 += dur; k += 1
    L = lowpass(L, 5200 if promo else 3200); R = lowpass(R, 5200 if promo else 3200)
    out = np.stack([L, R], 1)[:int(seconds * SR)]
    fi, fo = int(2 * SR), int(min(4, seconds / 4) * SR)
    out[:fi] *= np.linspace(0, 1, fi)[:, None]; out[-fo:] *= np.linspace(1, 0, fo)[:, None]
    return out / (np.abs(out).max() + 1e-9) * 0.89


if __name__ == '__main__':
    style, secs, path = sys.argv[1], float(sys.argv[2]), sys.argv[3]
    pcm = (render(style, secs) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
