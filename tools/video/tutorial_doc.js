// Builds docs/video/tutorial.md (chapters for a YouTube description, captions in both languages, narration script)
// from the .srt files written by tools/video/tutorial.js.  Usage: node tools/video/tutorial_doc.js
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

const CH = {
  en: { title: 'Introduction', starts: ['Open BabPls in your browser', 'Click Import data', 'In the Model tab', 'The Calculate menu lists every analysis', 'To test significance', 'The assessment checklist', 'In Guide & references'],
    names: ['1. Start screen', '2. Import data and check it', '3. Build the model (constructs, names, paths)', '4. PLS-SEM and the quality criteria', '5. Bootstrapping: significance and mediation', '6. Report: checklist, APA write-up, export', '7. Examples gallery, user guide and methods'], end: 'Where to get BabPls' },
  ar: { title: 'المقدمة', starts: ['افتح BabPls في المتصفح', 'اضغط «استيراد بيانات»', 'في لسان النموذج', 'قائمة «احسب»', 'لاختبار الدلالة', '«قائمة التقييم»', 'في «الدليل والمصادر»'],
    names: ['1. شاشة البدء', '2. استيراد البيانات وفحصها', '3. بناء النموذج (المتغيرات الكامنة والأسماء والمسارات)', '4. خوارزمية PLS-SEM ومعايير الجودة', '5. الإقلاع الذاتي: الدلالة والوساطة', '6. التقرير: قائمة التقييم وكتابة APA والتصدير', '7. معرض الأمثلة ودليل المستخدم والمنهجيات'], end: 'أين تجد BabPls' }
};

const sec = s => { const m = s.match(/(\d+):(\d+):(\d+),(\d+)/); return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000; };
const mmss = v => { v = Math.floor(v); return Math.floor(v / 60) + ':' + String(v % 60).padStart(2, '0'); };
function parse(lang) {
  const t = fs.readFileSync(path.join(ROOT, 'media', `BabPls-tutorial-${lang}.srt`), 'utf8').replace(/\r/g, '');
  const caps = t.trim().split(/\n\n+/).map(b => { const l = b.split('\n'); const [a, z] = l[1].split(' --> '); return { start: sec(a), end: sec(z), text: l[2], sub: l.slice(3).join(' ') }; });
  // a caption re-shown with a second line (the name of a downloaded file) is one caption for the doc
  return caps.filter((c, i) => !(i && caps[i - 1].text === c.text && Math.abs(caps[i - 1].end - c.start) < 0.05 && (caps[i - 1].end = c.end))).map(c => ({ start: c.start, end: c.end, text: c.text }));
}
function duration(lang) {
  try { return +require('child_process').execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(ROOT, 'media', `BabPls-tutorial-${lang}.mp4`)]).toString().trim(); } catch (e) { return null; }
}
function chapters(lang, caps) {
  const c = CH[lang], out = [{ t: 0, name: c.title, caps: [] }];
  c.starts.forEach((s, i) => { const k = caps.find(x => x.text.startsWith(s)); if (!k) throw new Error(lang + ': chapter start not found: ' + s); out.push({ t: Math.max(0, k.start - 1), name: c.names[i], caps: [] }); });
  // the end card's spoken line (when the .srt has one) opens the last chapter
  const endCap = caps.find(x => /^(Try it now|جرّبه الآن)/.test(x.text));
  out.push({ t: endCap ? Math.max(0, endCap.start - 0.5) : caps[caps.length - 1].end + 0.5, name: c.end, caps: [] });
  caps.forEach(x => { let ch = out[0]; out.forEach(o => { if (x.start >= o.t) ch = o; }); ch.caps.push(x); });
  return out;
}

const L = {};
['en', 'ar'].forEach(l => { const caps = parse(l); L[l] = { caps, ch: chapters(l, caps), dur: duration(l) }; });

// YouTube needs chapters of at least 10 s, so the short title card is folded into the first step
const ytChapters = l => { const c = L[l].ch; return [`0:00 ${l === 'ar' ? 'المقدمة وشاشة البدء' : 'Introduction and start screen'}`].concat(c.slice(2).map(x => `${mmss(x.t)} ${x.name.replace(/^\d\. /, '')}`)).join('\n'); };
let md = `# BabPls tutorial video: your first PLS-SEM model in 7 steps\n\n`;
md += `Files: \`media/BabPls-tutorial-en.mp4\` (${mmss(L.en.dur)}) and \`media/BabPls-tutorial-ar.mp4\` (${mmss(L.ar.dur)}), 1920×1080, 30 fps, H.264, AAC stereo 48 kHz at −16 LUFS; ` +
  `English: offline neural narration of every caption (Piper, voice en_US-joe-medium, CC0; recording paced by the speech in \`tools/video/rec.js\`) over generated background music that ducks under the voice; Arabic: background music only until an Arabic voice is installed (\`tools/video/voice.py\`). Soundtrack: \`python tools/video/audio.py media/BabPls-tutorial-<lang>.mp4 <lang> tutorial\` after recording. Piper is not deterministic (the same line can come out a few tenths of a second longer), so keep the speech cache \`tools/video/.voices/cache/\` with the rendered media: rec.js and audio.py then use the same clips and the narration stays in sync (max_delay 0); after clearing it, record again before running audio.py. ` +
  `Subtitles in \`media/BabPls-tutorial-en.srt\` and \`media/BabPls-tutorial-ar.srt\` (same text and timing as the burned-in captions).\n\n`;
md += `Recorded from the real app with \`tools/video/tutorial.js\` (\`node tools/video/tutorial.js en|ar 8772\` with the app served on that port; for the English narration set \`BABPLS_PY\` to a Python with piper-tts), ` +
  `using the toolkit \`tools/video/rec.js\`. This file is generated by \`node tools/video/tutorial_doc.js\`. ` +
  `Data: \`examples/customer_satisfaction.csv\` (300 respondents, 24 variables); every number quoted in the captions is what BabPls 0.8.1 shows for it ` +
  `(bootstrapping with 5,000 subsamples and seed 1).\n\n`;

md += `## YouTube description (English)\n\n`;
md += `Learn BabPls, the free and open-source PLS-SEM software that runs in your browser, in seven steps: import data, build a model, run PLS-SEM and bootstrapping, read the quality criteria, and export an APA-style report.\n\n`;
md += ytChapters('en') + `\n\nOpen BabPls: https://motqenacademy-droid.github.io/babpls/\nSource code (MIT): https://github.com/motqenacademy-droid/babpls\nDesktop app (Windows, macOS, Linux): https://github.com/motqenacademy-droid/babpls/releases/latest\nDesigned by Dr. Ahmed Youssef.\n\n`;
md += `## وصف يوتيوب (العربية)\n\n`;
md += `تعلّم BabPls، البرنامج المجاني مفتوح المصدر لنمذجة المعادلات الهيكلية (PLS-SEM) الذي يعمل في متصفحك، في سبع خطوات: استيراد البيانات، وبناء النموذج، وتشغيل PLS-SEM والإقلاع الذاتي، وقراءة معايير الجودة، وتصدير تقرير بأسلوب APA.\n\n`;
md += ytChapters('ar') + `\n\nافتح BabPls: https://motqenacademy-droid.github.io/babpls/\nالشيفرة المصدرية (MIT): https://github.com/motqenacademy-droid/babpls\nتطبيق سطح المكتب (ويندوز وماك ولينكس): https://github.com/motqenacademy-droid/babpls/releases/latest\nتصميم: د. أحمد يوسف.\n\n`;

md += `## Captions by chapter\n\n`;
for (let i = 0; i < L.en.ch.length; i++) {
  const e = L.en.ch[i], a = L.ar.ch[i];
  if (i === L.en.ch.length - 1 && !e.caps.length && !a.caps.length) continue; // an end card without a spoken line
  md += `### ${e.name} · ${a.name}\n\nEN starts ${mmss(e.t)} · AR starts ${mmss(a.t)}\n\n| EN | English | AR | العربية |\n|---|---|---|---|\n`;
  const n = Math.max(e.caps.length, a.caps.length);
  for (let k = 0; k < n; k++) {
    const x = e.caps[k], y = a.caps[k];
    md += `| ${x ? mmss(x.start) : ''} | ${x ? x.text.replace(/\|/g, '\\|') : ''} | ${y ? mmss(y.start) : ''} | ${y ? y.text.replace(/\|/g, '\\|') : ''} |\n`;
  }
  md += `\n`;
}
const spoken = c => c.caps.map(x => x.text).join(' '); // the lines the title cards speak
const intro = {
  en: 'Title card: “BabPls · Your first PLS-SEM model in 7 steps · From importing data to an APA-style report”, then the list of the seven steps.',
  ar: 'بطاقة العنوان: «BabPls · نموذجك الأول في PLS-SEM في سبع خطوات · من استيراد البيانات إلى تقرير جاهز بأسلوب APA»، ثم قائمة الخطوات السبع.'
};
const outro = {
  en: 'End card: “Try it now with your own data · Free & open source (MIT) · Runs in your browser · Windows, macOS, Linux · motqenacademy-droid.github.io/babpls · Designed by Dr. Ahmed Youssef”.',
  ar: 'البطاقة الختامية: «جرّبه الآن على بياناتك · مجاني ومفتوح المصدر (MIT) · يعمل في المتصفح · ويندوز وماك ولينكس · motqenacademy-droid.github.io/babpls · تصميم: د. أحمد يوسف».'
};
md += `## Narration script (English)\n\nThe English video speaks these captions (with symbols and abbreviations read out by \`voice.py speak\`); for a human voice-over, read each chapter at a calm pace; each paragraph matches the captions of that chapter.\n\n`;
L.en.ch.forEach((c, i) => { md += `**${mmss(c.t)} · ${c.name}.** ` + (i === 0 ? intro.en + ' ' + (c.caps.length ? spoken(c) : 'Welcome to BabPls. In this lesson you will build your first PLS-SEM model, from importing data to an APA-style report, in seven steps.') : i === L.en.ch.length - 1 ? outro.en + ' ' + (c.caps.length ? spoken(c) : 'That is the whole workflow. Open BabPls in your browser and try it with your own data.') : c.caps.map(x => x.text).join(' ')) + `\n\n`; });
md += `## نص التعليق الصوتي (العربية)\n\nللتعليق الصوتي: تُقرأ كل فقرة بإيقاع هادئ، وهي تطابق ترجمات الفصل نفسه.\n\n`;
L.ar.ch.forEach((c, i) => { md += `**${mmss(c.t)} · ${c.name}.** ` + (i === 0 ? intro.ar + ' ' + (c.caps.length ? spoken(c) : 'مرحباً بك في BabPls. في هذا الدرس تبني نموذجك الأول في PLS-SEM، من استيراد البيانات إلى تقرير بأسلوب APA، في سبع خطوات.') : i === L.ar.ch.length - 1 ? outro.ar + ' ' + (c.caps.length ? spoken(c) : 'هذه هي الخطوات كلها. افتح BabPls في متصفحك وجرّبه على بياناتك.') : c.caps.map(x => x.text).join(' ')) + `\n\n`; });

fs.mkdirSync(path.join(ROOT, 'docs', 'video'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs', 'video', 'tutorial.md'), md);
console.log('docs/video/tutorial.md', L.en.ch.map(c => mmss(c.t)).join(' '), '|', L.ar.ch.map(c => mmss(c.t)).join(' '));
