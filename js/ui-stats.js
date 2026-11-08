/*
 * BabPls UI plugin: classic statistics I (JASP-style T-Tests, ANOVA and nonparametric modules)
 * (see the plugin contract above PLUGINS in js/app.js). Engine: js/stats.js. The methods (with MathML formulas), APA
 * references and the Arabic/English strings live in this file.
 */
(function (root) {
  'use strict';

  // ------------------------------------------------------------------ small SVG charts (same look as js/charts.js)
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f3 = v => (v === null || v === undefined || !isFinite(v)) ? '–' : (Math.abs(v) >= 1000 ? v.toFixed(0) : (+v.toFixed(3)).toString());
  const PAL = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];
  function nice(lo, hi) {
    if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
    if (lo === hi) { lo -= 1; hi += 1; }
    const span = hi - lo, step = Math.pow(10, Math.floor(Math.log10(span / 5))), m = [1, 2, 2.5, 5, 10].find(k => span / (k * step) <= 6) * step;
    const a = Math.floor(lo / m) * m, b = Math.ceil(hi / m) * m, ticks = []; for (let v = a; v <= b + m / 2; v += m) ticks.push(+v.toFixed(10));
    return { lo: a, hi: b, ticks };
  }
  function wrap(w, h, body, title) {
    return `<svg class="chart" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(title || '')}">` +
      `<style>.chart text{font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;font-size:11px;fill:var(--ink,#222)}.chart .ax{stroke:var(--line,#ccc)}.chart .gd{stroke:var(--grid,#eee)}.chart .tt{font-size:13px;font-weight:600}</style>` +
      (title ? `<text class="tt" x="${w / 2}" y="16" text-anchor="middle">${esc(title)}</text>` : '') + body + '</svg>';
  }
  function q7(s, p) { const n = s.length, h = (n - 1) * p, lo = Math.floor(h), hi = Math.ceil(h); return s[lo] + (h - lo) * (s[hi] - s[lo]); }
  // Tukey box plots. groups: [{label, values (sorted)}]
  function boxplot(groups, o) {
    o = o || {}; groups = groups.filter(g => g.values && g.values.length);
    if (!groups.length) return '';
    const w = o.width || Math.max(320, 90 + groups.length * 90), h = o.height || 300, top = o.title ? 30 : 12, left = 54, bottom = 40;
    const all = groups.flatMap(g => g.values), n = nice(Math.min(...all), Math.max(...all));
    const Y = v => top + (n.hi - v) / (n.hi - n.lo) * (h - top - bottom), gw = (w - left - 10) / groups.length, bw = Math.min(46, gw * 0.5);
    let s = '';
    n.ticks.forEach(t => { s += `<line class="gd" x1="${left}" x2="${w - 10}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${left - 5}" y="${Y(t) + 4}" text-anchor="end">${+t.toFixed(6)}</text>`; });
    groups.forEach((g, i) => {
      const v = g.values, q1 = q7(v, 0.25), md = q7(v, 0.5), q3 = q7(v, 0.75), iqr = q3 - q1, lo = v.find(x => x >= q1 - 1.5 * iqr), hi = v.slice().reverse().find(x => x <= q3 + 1.5 * iqr);
      const cx = left + i * gw + gw / 2, col = PAL[i % PAL.length];
      s += `<line x1="${cx}" x2="${cx}" y1="${Y(hi)}" y2="${Y(q3)}" stroke="var(--ink)"/><line x1="${cx}" x2="${cx}" y1="${Y(q1)}" y2="${Y(lo)}" stroke="var(--ink)"/>`;
      s += `<line x1="${cx - bw / 4}" x2="${cx + bw / 4}" y1="${Y(hi)}" y2="${Y(hi)}" stroke="var(--ink)"/><line x1="${cx - bw / 4}" x2="${cx + bw / 4}" y1="${Y(lo)}" y2="${Y(lo)}" stroke="var(--ink)"/>`;
      s += `<rect x="${cx - bw / 2}" y="${Y(q3)}" width="${bw}" height="${Math.max(1, Y(q1) - Y(q3))}" fill="${col}" fill-opacity=".35" stroke="${col}"><title>${esc(g.label)}: Q1 ${f3(q1)}, Mdn ${f3(md)}, Q3 ${f3(q3)}</title></rect>`;
      s += `<line x1="${cx - bw / 2}" x2="${cx + bw / 2}" y1="${Y(md)}" y2="${Y(md)}" stroke="var(--ink)" stroke-width="2"/>`;
      v.forEach(x => { if (x < lo || x > hi) s += `<circle cx="${cx}" cy="${Y(x)}" r="3" fill="none" stroke="${col}"><title>${f3(x)}</title></circle>`; });
      s += `<text x="${cx}" y="${h - bottom + 16}" text-anchor="middle">${esc(String(g.label).slice(0, 18))}</text>`;
    });
    s += `<line class="ax" x1="${left}" x2="${left}" y1="${top}" y2="${h - bottom}"/>`;
    if (o.yLabel) s += `<text transform="translate(14,${(h - bottom + top) / 2}) rotate(-90)" text-anchor="middle">${esc(o.yLabel)}</text>`;
    return wrap(w, h, s, o.title);
  }
  // means with confidence intervals. cats: x labels; series: [{name, points:[{mean, lo, hi}] (aligned to cats)}]
  function meansPlot(cats, series, o) {
    o = o || {}; const w = o.width || Math.max(380, 120 + cats.length * 90), h = o.height || 300, top = o.title ? 30 : 12, left = 56, bottom = series.length > 1 ? 58 : 40;
    const vals = series.flatMap(sr => sr.points.flatMap(p => [p.lo, p.hi, p.mean])).filter(isFinite), n = nice(Math.min(...vals), Math.max(...vals));
    const Y = v => top + (n.hi - v) / (n.hi - n.lo) * (h - top - bottom), gw = (w - left - 20) / cats.length, X = (i, k) => left + 10 + i * gw + gw / 2 + (k - (series.length - 1) / 2) * Math.min(14, gw / (series.length + 2));
    let s = '';
    n.ticks.forEach(t => { s += `<line class="gd" x1="${left}" x2="${w - 10}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${left - 5}" y="${Y(t) + 4}" text-anchor="end">${+t.toFixed(6)}</text>`; });
    series.forEach((sr, k) => {
      const col = PAL[k % PAL.length], pts = sr.points.map((p, i) => [X(i, k), Y(p.mean)]).filter((p, i) => isFinite(sr.points[i].mean));
      if (pts.length > 1) s += `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${col}" stroke-width="2"/>`;
      sr.points.forEach((p, i) => {
        if (!isFinite(p.mean)) return; const x = X(i, k);
        if (isFinite(p.lo) && isFinite(p.hi)) s += `<line x1="${x}" x2="${x}" y1="${Y(p.lo)}" y2="${Y(p.hi)}" stroke="${col}" stroke-width="1.5"/><line x1="${x - 5}" x2="${x + 5}" y1="${Y(p.lo)}" y2="${Y(p.lo)}" stroke="${col}"/><line x1="${x - 5}" x2="${x + 5}" y1="${Y(p.hi)}" y2="${Y(p.hi)}" stroke="${col}"/>`;
        s += `<circle cx="${x}" cy="${Y(p.mean)}" r="4.5" fill="${col}"><title>${esc(sr.name || '')} ${esc(cats[i])}: ${f3(p.mean)} [${f3(p.lo)}, ${f3(p.hi)}]</title></circle>`;
      });
      if (series.length > 1) s += `<rect x="${left + k * 120}" y="${h - 16}" width="10" height="10" fill="${col}"/><text x="${left + k * 120 + 14}" y="${h - 7}">${esc(String(sr.name).slice(0, 16))}</text>`;
    });
    cats.forEach((c, i) => { s += `<text x="${X(i, (series.length - 1) / 2)}" y="${h - bottom + 16}" text-anchor="middle">${esc(String(c).slice(0, 18))}</text>`; });
    s += `<line class="ax" x1="${left}" x2="${left}" y1="${top}" y2="${h - bottom}"/>`;
    if (o.yLabel) s += `<text transform="translate(14,${(h - bottom + top) / 2}) rotate(-90)" text-anchor="middle">${esc(o.yLabel)}</text>`;
    return wrap(w, h, s, o.title);
  }
  // normal Q–Q plot of standardised values with the identity line
  function qqPlot(U, values, title) {
    const v = values.filter(isFinite); if (v.length < 3) return '';
    const n = v.length, m = v.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)), a = n <= 10 ? 3 / 8 : 0.5;
    const s = v.slice().sort((x, y) => x - y), pts = s.map((x, i) => ({ x: U.E.st.qnorm((i + 1 - a) / (n + 1 - 2 * a)), y: (x - m) / sd }));
    const lim = Math.max(...pts.map(p => Math.max(Math.abs(p.x), Math.abs(p.y)))) * 1.05;
    return U.C.scatter(pts, { lines: [{ points: [[-lim, -lim], [lim, lim]], color: 'var(--muted)' }], xLabel: U.t('st_theoretical'), yLabel: U.t('st_standardized'), width: 380, height: 340, title });
  }

  // ------------------------------------------------------------------ formatting helpers
  const fin = v => v !== null && v !== undefined && isFinite(v);
  function apaNum(v, d) { if (!fin(v)) return '–'; return Number(v).toFixed(d === undefined ? 2 : d); }
  function apaR(v, d) { if (!fin(v)) return '–'; const s = Number(v).toFixed(d === undefined ? 2 : d); return s.replace(/^(-?)0\./, '$1.'); } // bounded statistics: no leading zero
  function apaP(p) { if (!fin(p)) return 'p = –'; if (p < 0.001) return 'p < .001'; return 'p = ' + p.toFixed(3).replace(/^0\./, '.'); }
  const dfFmt = df => (Math.abs(df - Math.round(df)) < 1e-9 ? String(Math.round(df)) : df.toFixed(2));
  const ciTxt = (U, lo, hi) => `[${fin(lo) ? U.f(lo) : (lo === -Infinity ? '−∞' : '–')}, ${fin(hi) ? U.f(hi) : (hi === Infinity ? '∞' : '–')}]`;
  const pct = r => Math.round((r.level || 0.95) * 100);
  const writeupCard = (U, sentences) => U.card(U.t('st_writeup'), `<div class="writeup">${sentences.map(s => `<p>${s}</p>`).join('')}</div>`, { note: U.t('st_writeup_note') });
  const altNote = (U, r) => r.alt === 'greater' ? U.t('st_alt_note_greater') : r.alt === 'less' ? U.t('st_alt_note_less') : '';
  const effName = (U, e) => e === 'g' ? "Hedges' g" : e === 'delta' ? "Glass' Δ" : "Cohen's d";

  // ------------------------------------------------------------------ section builders
  const G_MAIN = 'g_st_main', G_ASSUMP = 'g_st_assump', G_DESC = 'g_st_desc', G_POST = 'g_st_post';

  function descSections(r, U) {
    const { t, f, card, table, sec, chart } = U, out = [];
    const nums = r.vars.filter(v => !v.cat), cols = []; nums.forEach(v => v.groups.forEach(g => cols.push({ v, g })));
    if (cols.length) {
      const head = [''].concat(cols.map(c => c.v.name + (c.g.label !== null ? ' (' + c.g.label + ')' : '')));
      const L = Math.round((r.ci || 0.95) * 100);
      const stat = [['N', g => String(g.n)], [t('st_missing'), g => String(g.missing)], [t('st_mean'), g => f(g.mean)], [t('st_se_mean'), g => f(g.se)], [t('st_ci_mean', { l: L }) + ' ' + t('st_lower'), g => f(g.ciLo)], [t('st_ci_mean', { l: L }) + ' ' + t('st_upper'), g => f(g.ciHi)],
        [t('st_median'), g => f(g.median)], [t('st_mode'), g => f(g.mode) + (g.multiMode ? ' ᵃ' : '')], [t('st_sd'), g => f(g.sd)], [t('st_variance'), g => f(g.variance)], [t('st_cv'), g => f(g.cv)],
        [t('st_skewness'), g => f(g.skew)], [t('st_se_skew'), g => f(g.seSkew)], [t('st_kurtosis'), g => f(g.kurt)], [t('st_se_kurt'), g => f(g.seKurt)],
        ['Shapiro–Wilk W', g => f(g.swW)], ['Shapiro–Wilk p', g => U.fp(g.swP)], [t('st_range'), g => f(g.range)], [t('st_min'), g => f(g.min)], [t('st_max'), g => f(g.max)],
        [t('st_q1'), g => f(g.q1)], [t('st_q3'), g => f(g.q3)], ['IQR', g => f(g.iqr)], [t('st_sum'), g => f(g.sum)]].concat((r.pct || []).map((p, k) => [t('st_percentile', { p }), g => f(g.pct && g.pct[k] ? g.pct[k].v : NaN)]));
      out.push(sec(G_MAIN, 'sd_tab', t('st_desc_stats'), () => card(t('st_desc_stats'), table(head, stat.map(([lab, fn]) => [lab].concat(cols.map(c => fn(c.g)))), { title: 'descriptives' }) + (cols.some(c => c.g.multiMode) ? `<p class="note">ᵃ ${t('st_multimode')}</p>` : ''), { doc: 'stdesc' })));
      out.push(sec(G_DESC, 'sd_plots', t('st_plots'), () => nums.map(v => {
        const groups = v.groups.filter(g => g.values && g.values.length > 1);
        return card(v.name, `<div class="chartgrid">${groups.map(g => chart(U.C.histogram(g.values, { title: v.name + (g.label !== null ? ' · ' + g.label : ''), marks: [{ value: g.mean, label: t('st_mean') }] }), v.name)).join('')}${chart(boxplot(groups.map(g => ({ label: g.label !== null ? g.label : v.name, values: g.values })), { title: t('st_boxplot'), yLabel: v.name }), v.name + '_box')}${groups.map(g => chart(qqPlot(U, g.values, 'Q–Q: ' + v.name + (g.label !== null ? ' · ' + g.label : '')), v.name + '_qq')).join('')}</div>`);
      }).join('')));
    }
    const freqs = r.vars.filter(v => v.freq);
    if (freqs.length) out.push(sec(G_MAIN, 'sd_freq', t('st_freq'), () => freqs.map(v => card(t('st_freq_of', { v: v.name }), table([v.name, t('st_count'), t('st_percent'), t('st_valid_percent'), t('st_cum_percent')], v.freq.rows.map(x => [x.label, String(x.count), f(x.pct, 1), f(x.valid, 1), f(x.cum, 1)]).concat(v.freq.missing ? [[t('st_missing'), String(v.freq.missing), f(100 * v.freq.missing / v.freq.total, 1), '', '']] : []).concat([[t('st_total'), String(v.freq.total), '100.0', '', '']]), { title: 'frequencies_' + v.name }) + chart(U.C.bars(v.freq.rows.map(x => ({ label: x.label, value: x.count })), { title: v.name }), v.name), { doc: 'stdesc' })).join('')));
    return out;
  }

  function normSections(r, U) {
    const { t, f, card, table, sec, chart, pcell } = U;
    return [
      sec(G_MAIN, 'sn_tab', t('st_normality_tests'), () => card(t('st_normality_tests'), table([t('st_variable')].concat(r.split ? [t('st_group')] : []).concat(['N', 'Shapiro–Wilk W', 'p', 'Lilliefors D', 'p', 'Anderson–Darling A²', 'p']),
        r.rows.map(x => [x.name].concat(r.split ? [x.group] : []).concat([String(x.n), f(x.sw.w), pcell(x.sw.p), f(x.ks.d), pcell(x.ks.p), f(x.ad.a2), pcell(x.ad.p)])), { title: 'normality' }) + `<p class="note">${t('st_normality_note')}</p>`, { doc: 'stshapiro' }) +
        card(t('st_other_tests'), `<p class="note">${t('st_lillie_note')}</p>`, { doc: 'stlillie' }) + card(t('st_ad_title'), `<p class="note">${t('st_ad_note')}</p>`, { doc: 'stad' })),
      sec(G_DESC, 'sn_qq', 'Q–Q', () => card('Q–Q', `<div class="chartgrid">${r.rows.map(x => chart(qqPlot(U, x.values, x.name + (x.group !== null ? ' · ' + x.group : '')), 'qq_' + x.name)).join('')}</div>`)),
      sec(G_MAIN, 'sn_wu', t('st_writeup'), () => writeupCard(U, r.rows.map(x => t('st_wu_norm', { v: esc(x.name + (x.group !== null ? ' (' + x.group + ')' : '')), w: apaR(x.sw.w, 3), p: apaP(x.sw.p), n: x.n, verdict: x.sw.p < 0.05 ? t('st_wu_norm_bad') : t('st_wu_norm_ok') }))))
    ];
  }

  function ttestSections(r, U) {
    const { t, f, card, table, sec, chart, pcell } = U, tests = r.tests || { student: true }, L = pct(r), out = [], eff = r.effect || 'd';
    const effX = r.design === 'ind' ? eff : (eff === 'delta' ? 'd' : eff), effOf = s => effX === 'g' ? [s.g, s.gLo, s.gHi] : effX === 'delta' ? [s.delta, NaN, NaN] : [s.d, s.dLo, s.dHi];
    const head = [t('st_variable'), t('st_test'), t('st_statistic'), 'df', 'p', t('st_md'), t('st_se_diff'), t('st_ci_of', { l: L }), t('st_effect_size'), t('st_value'), t('st_ci_of', { l: L })];
    const rows = [], wu = [];
    const ci = (lo, hi) => [(fin(lo) || fin(hi)) ? ciTxt(U, lo, hi) : '–'];
    r.rows.forEach(x => {
      if (r.design === 'ind') {
        const s = x.student, w = x.welch, m = x.mann;
        if (tests.student) { const e = effOf(s); rows.push([x.name, t('st_student'), 't = ' + f(s.t), dfFmt(s.df), pcell(s.p), f(s.md), f(s.se)].concat(ci(s.lo, s.hi), [t('st_eff_' + eff), f(e[0])], ci(e[1], e[2]))); wu.push(t('st_wu_t_ind', { v: esc(x.name), a: esc(r.labels[0]), b: esc(r.labels[1]), m1: apaNum(x.desc[0].mean), s1: apaNum(x.desc[0].sd), m2: apaNum(x.desc[1].mean), s2: apaNum(x.desc[1].sd), df: dfFmt(s.df), t: apaNum(s.t), p: apaP(s.p), es: effName(U, eff).split(' ').pop(), d: apaNum(e[0]), l: L, lo: apaNum(e[1]), hi: apaNum(e[2]) })); }
        if (tests.welch) { const e = eff === 'delta' ? [w.delta] : eff === 'g' ? [w.g] : [w.d]; rows.push([x.name, t('st_welch'), 't = ' + f(w.t), dfFmt(w.df), pcell(w.p), f(w.md), f(w.se)].concat(ci(w.lo, w.hi), [t('st_eff_' + eff), f(e[0]), '–'])); wu.push(t('st_wu_welch', { v: esc(x.name), df: apaNum(w.df), t: apaNum(w.t), p: apaP(w.p), d: apaNum(e[0]) })); }
        if (tests.mann) { rows.push([x.name, t('st_mannwhitney'), 'U = ' + f(m.U, 1), '', pcell(m.p), f(m.hl), ''].concat([''], [t('st_rbc'), f(m.rbc)], ci(m.ci[0], m.ci[1]))); wu.push(t('st_wu_mw', { v: esc(x.name), u: apaNum(m.U, 1), p: apaP(m.p), r: apaR(m.rbc), how: m.exact ? t('st_exact') : t('st_asymptotic') })); }
      } else {
        const s = x, wil = x.wilcoxon;
        if (tests.student) { const e = effOf(s); rows.push([x.name, t('st_student'), 't = ' + f(s.t), dfFmt(s.df), pcell(s.p), f(s.md), f(s.se)].concat(ci(s.lo, s.hi), [t('st_eff_' + effX), f(e[0])], ci(e[1], e[2]))); wu.push(t(r.design === 'one' ? 'st_wu_t_one' : 'st_wu_t_paired', { v: esc(x.name), m: apaNum(r.design === 'one' ? x.mean : x.md), sd: apaNum(x.sd), mu: apaNum(r.mu), df: dfFmt(s.df), t: apaNum(s.t), p: apaP(s.p), d: apaNum(e[0]), l: L, lo: apaNum(e[1]), hi: apaNum(e[2]) })); }
        if (tests.wilcoxon) { rows.push([x.name, t('st_wilcoxon'), 'V = ' + f(wil.V, 1), '', pcell(wil.p), f(wil.hl), ''].concat([''], [t('st_rbc'), f(wil.rbc)], ci(wil.ci[0], wil.ci[1]))); wu.push(t('st_wu_wilcoxon', { v: esc(x.name), V: apaNum(wil.V, 1), p: apaP(wil.p), r: apaR(wil.rbc), how: wil.exact ? t('st_exact') : t('st_asymptotic'), n: wil.n })); }
        if (tests.sign && x.sign) { rows.push([x.name, t('st_sign_test'), 'S = ' + x.sign.pos, '', pcell(x.sign.p), '', ''].concat(['', '', '', ''])); wu.push(t('st_wu_sign', { v: esc(x.name), pos: x.sign.pos, neg: x.sign.neg, p: apaP(x.sign.p) })); }
      }
    });
    const docMain = r.design === 'one' ? 'stttest1' : r.design === 'ind' ? 'stttestind' : 'stttestpaired';
    const title = t(r.design === 'one' ? 'an_st_ttest_one' : r.design === 'ind' ? 'an_st_ttest_ind' : 'an_st_ttest_paired');
    let notes = [];
    if (altNote(U, r)) notes.push(altNote(U, r));
    if (r.design === 'one') notes.push(t('st_note_mu', { mu: f(r.mu) }));
    if (r.design === 'ind') notes.push(t('st_note_groups', { a: esc(r.labels[0]), b: esc(r.labels[1]) }));
    if (tests.mann || tests.wilcoxon) notes.push(t('st_note_np'));
    out.push(sec(G_MAIN, 'tt_tab', title, () => card(title, table(head, rows, { title: 'ttest' }), { note: notes.join(' '), doc: tests.student ? docMain : tests.mann ? 'stmannwhitney' : 'stwilcoxon' }) +
      (tests.welch && r.design === 'ind' ? card('Welch', `<p class="note">${t('st_welch_note')}</p>`, { doc: 'stwelch' }) : '') +
      (tests.mann ? card('Mann–Whitney U', `<p class="note">${t('st_mw_note')}</p>`, { doc: 'stmannwhitney' }) : '') +
      (tests.wilcoxon ? card(t('st_wilcoxon_title'), `<p class="note">${t('st_wilcoxon_note')}</p>`, { doc: 'stwilcoxon' }) : '') +
      (tests.sign && r.design !== 'ind' ? card(t('st_sign_test'), `<p class="note">${t('st_sign_note')}</p>`, { doc: 'stsign' }) : '') +
      card(t('st_effect_size'), `<p class="note">${t('st_effect_note')}</p>`, { doc: 'stcohend' })));
    out.push(sec(G_MAIN, 'tt_wu', t('st_writeup'), () => writeupCard(U, wu)));
    // assumption checks
    out.push(sec(G_ASSUMP, 'tt_ass', t('st_assumptions'), () => {
      let h = '';
      if (r.design === 'ind') {
        h += card(t('st_sw_title'), table([t('st_variable'), t('st_group'), 'W', 'p'], r.rows.flatMap(x => x.desc.map(d => [x.name, d.label, f(d.sw.w), pcell(d.sw.p)])), { title: 'normality' }), { note: t('st_sw_note'), doc: 'stshapiro' });
        h += card(t('st_levene_title', { c: r.center === 'median' ? 'Brown–Forsythe' : 'Levene' }), table([t('st_variable'), 'F', 'df₁', 'df₂', 'p'], r.rows.map(x => [x.name, f(x.levene.F), String(x.levene.df1), String(x.levene.df2), pcell(x.levene.p)]), { title: 'levene' }), { note: t('st_levene_note'), doc: 'stlevene' });
      } else h += card(t('st_sw_title'), table([t('st_variable'), 'W', 'p'], r.rows.map(x => [x.name + (r.design === 'paired' ? ' (' + t('st_differences') + ')' : ''), f(x.sw.w), pcell(x.sw.p)]), { title: 'normality' }), { note: t('st_sw_note'), doc: 'stshapiro' });
      h += card('Q–Q', `<div class="chartgrid">${r.rows.map(x => r.design === 'ind' ? x.desc.map(d => chart(qqPlot(U, d.values, x.name + ' · ' + d.label), 'qq')).join('') : chart(qqPlot(U, x.values, x.name), 'qq')).join('')}</div>`);
      return h;
    }));
    // descriptives
    out.push(sec(G_DESC, 'tt_desc', t('st_descriptives'), () => {
      const drows = []; r.rows.forEach(x => (x.desc || [{ label: x.name, n: x.n, mean: x.mean, sd: x.sd, se: x.se, values: x.values }]).forEach(d => { const q = U.E.st.qt(1 - (1 - (r.level || 0.95)) / 2, d.n - 1); drows.push([x.name, d.label, String(d.n), f(d.mean), f(d.sd), f(d.se), f(d.mean - q * d.se), f(d.mean + q * d.se)]); }));
      const plots = r.rows.map(x => { const ds = x.desc || [{ label: x.name, n: x.n, mean: x.mean, se: x.se, values: x.values }]; const pts = ds.map(d => { const q = U.E.st.qt(1 - (1 - (r.level || 0.95)) / 2, d.n - 1); return { mean: d.mean, lo: d.mean - q * d.se, hi: d.mean + q * d.se }; }); return chart(meansPlot(ds.map(d => d.label), [{ name: x.name, points: pts }], { title: x.name, yLabel: t('st_mean') + ' ± ' + L + '% CI' }), x.name) + chart(boxplot(ds.map(d => ({ label: d.label, values: d.values.slice().sort((a, b) => a - b) })), { title: t('st_boxplot') }), x.name + '_box'); }).join('');
      return card(t('st_descriptives'), table([t('st_variable'), t('st_group'), 'N', t('st_mean'), t('st_sd'), t('st_se'), `${L}% CI ${t('st_lower')}`, `${L}% CI ${t('st_upper')}`], drows, { title: 'descriptives' }) + `<div class="chartgrid">${plots}</div>`);
    }));
    return out;
  }

  function posthocCards(U, factor, ph, gh, methods, level, label) {
    const { t, f, card, table, pcell } = U, L = Math.round(level * 100), m = methods || ['tukey'];
    let h = '';
    const cols = [['tukey', 'p Tukey', 'pTukey'], ['scheffe', 'p Scheffé', 'pScheffe'], ['bonferroni', 'p Bonferroni', 'pBonf'], ['holm', 'p Holm', 'pHolm']].filter(c => m.includes(c[0]) && ph[0] && c[2] in ph[0]);
    const withCI = m.includes('tukey') && ph[0] && 'lo' in ph[0];
    if (cols.length) h += card(label || t('st_posthoc_of', { f: factor }), table([t('st_comparison'), t('st_md'), 'SE', 't', 'df', "Cohen's d"].concat(withCI ? [`${L}% CI (Tukey) ${t('st_lower')}`, t('st_upper')] : []).concat(cols.map(c => c[1])),
      ph.map(x => [x.a + ' − ' + x.b, f(x.diff), f(x.se), f(x.t), dfFmt(x.df), fin(x.d) ? f(x.d) : '–'].concat(withCI ? [f(x.lo), f(x.hi)] : []).concat(cols.map(c => pcell(x[c[2]])))), { title: 'posthoc_' + factor }), { note: t('st_posthoc_note'), doc: m.includes('tukey') ? 'sttukey' : m.includes('scheffe') ? 'stscheffe' : 'stbonfholm' });
    if (m.includes('scheffe') && m.includes('tukey')) h += card('Scheffé', `<p class="note">${t('st_scheffe_note')}</p>`, { doc: 'stscheffe' });
    if ((m.includes('bonferroni') || m.includes('holm')) && (m.includes('tukey') || m.includes('scheffe'))) h += card('Bonferroni / Holm', `<p class="note">${t('st_bonf_note')}</p>`, { doc: 'stbonfholm' });
    if (m.includes('gameshowell') && gh) h += card(t('st_gh_of', { f: factor }), table([t('st_comparison'), t('st_md'), 'SE', 't', 'df', 'p Games–Howell'], gh.map(x => [x.a + ' − ' + x.b, f(x.diff), f(x.se), f(x.t), dfFmt(x.df), pcell(x.p)]), { title: 'gameshowell_' + factor }), { note: t('st_gh_note'), doc: 'stgameshowell' });
    return h;
  }
  function anovaTable(U, r, title, doc) {
    const { t, f, table, card, pcell } = U;
    const rows = r.table.map(x => [x.term, f(x.ss), String(x.df), f(x.ms), f(x.F), pcell(x.p), f(x.eta2), f(x.peta2), f(x.omega2)]);
    rows.push([t('st_residuals'), f(r.resid.ss), String(r.resid.df), f(r.resid.ms), '', '', '', '', '']);
    return card(title, table([t('st_cases'), t('st_ss_type', { k: ['I', 'II', 'III'][r.ssType - 1] }), 'df', t('st_ms'), 'F', 'p', 'η²', 'η²p', 'ω²'], rows, { title: 'anova' }), { note: t('st_anova_note'), doc });
  }
  function anovaSections(r, U) {
    const { t, f, card, table, sec, chart, pcell } = U, out = [], L = pct(r), anc = r.covs && r.covs.length;
    const title = anc ? t('an_st_ancova') : r.factors.length > 1 ? t('st_factorial_title') : t('st_oneway_title');
    out.push(sec(G_MAIN, 'av_tab', 'ANOVA', () => {
      let h = anovaTable(U, r, title + ': ' + r.dv, anc ? 'stancova' : r.factors.length > 1 ? 'stfactorial' : 'stanova1');
      if (r.welch) h += card(t('st_homcorr'), table([t('st_correction'), 'F', 'df₁', 'df₂', 'p'], [['Welch', f(r.welch.F), dfFmt(r.welch.df1), dfFmt(r.welch.df2), pcell(r.welch.p)], ['Brown–Forsythe', f(r.bf.F), dfFmt(r.bf.df1), dfFmt(r.bf.df2), pcell(r.bf.p)]], { title: 'anova_welch' }), { note: t('st_homcorr_note'), doc: 'stwelchanova' }) + card('Brown–Forsythe', `<p class="note">${t('st_bf_note')}</p>`, { doc: 'stbfanova' });
      h += card(t('st_effect_sizes'), `<p class="note">${t('st_eta_note')}</p>`, { doc: 'steffect' });
      return h;
    }));
    if (r.slopes) out.push(sec(G_ASSUMP, 'av_slopes', t('st_slopes'), () => card(t('st_slopes'), table([t('st_cases'), 'SS', 'df', 'F', 'p'], r.slopes.map(x => [x.term, f(x.ss), String(x.df), f(x.F), pcell(x.p)]), { title: 'slopes' }), { note: t('st_slopes_note'), doc: 'stancova' })));
    out.push(sec(G_MAIN, 'av_wu', t('st_writeup'), () => {
      const s = r.table.filter(x => !x.slope).map(x => t('st_wu_anova', { term: esc(x.term), df1: x.df, df2: r.resid.df, F: apaNum(x.F), p: apaP(x.p), e: apaR(x.peta2), o: apaR(x.omega2) }));
      if (r.welch) s.push(t('st_wu_welch_anova', { df1: dfFmt(r.welch.df1), df2: apaNum(r.welch.df2), F: apaNum(r.welch.F), p: apaP(r.welch.p) }));
      return writeupCard(U, s);
    }));
    out.push(sec(G_ASSUMP, 'av_ass', t('st_assumptions'), () => {
      let h = '';
      if (r.levene) h += card(t('st_levene_title', { c: r.levene.center === 'median' ? 'Brown–Forsythe' : 'Levene' }), table(['F', 'df₁', 'df₂', 'p'], [[f(r.levene.F), String(r.levene.df1), String(r.levene.df2), pcell(r.levene.p)]], { title: 'levene' }), { note: t('st_levene_note'), doc: 'stlevene' });
      h += card(t('st_resid_normality'), table(['Shapiro–Wilk W', 'p'], [[f(r.residSW.w), pcell(r.residSW.p)]], { title: 'residual_normality' }) + chart(qqPlot(U, r.qq, t('st_qq_resid')), 'qq_residuals'), { doc: 'stshapiro' });
      return h;
    }));
    out.push(sec(G_POST, 'av_post', t('st_posthoc'), () => r.emm.map(e => posthocCards(U, e.factor, e.posthoc, e.gh, r.posthoc, r.level || 0.95)).join('') || `<p class="note">${t('st_no_posthoc')}</p>`));
    out.push(sec(G_DESC, 'av_emm', t('st_emm'), () => r.emm.map(e => card(t('st_emm_of', { f: e.factor }), table([e.factor, t('st_emm'), 'SE', `${L}% CI ${t('st_lower')}`, t('st_upper')], e.rows.map(x => [x.level, f(x.mean), f(x.se), f(x.lo), f(x.hi)]), { title: 'emm_' + e.factor }), { note: anc ? t('st_emm_cov_note') : t('st_emm_note'), doc: 'stemm' })).join('')));
    out.push(sec(G_DESC, 'av_desc', t('st_descriptives'), () => {
      const tb = table(r.factors.concat(['N', t('st_mean'), t('st_sd'), t('st_se'), t('st_cv')]), r.desc.map(d => d.levels.concat([String(d.n), f(d.mean), f(d.sd), f(d.se), f(d.cv)])).map(row => row.map((c, j) => j === 0 ? c : U.cell(c))), { title: 'cell_descriptives' });
      const lv1 = r.factorLevels[0], second = r.factors.length > 1 ? r.factorLevels[1] : [null];
      const series = second.map((b, bi) => ({ name: b === null ? r.dv : r.factors[1] + ': ' + b, points: lv1.map((a, ai) => { const d = r.desc.find(x => x.key[0] === ai && (b === null || x.key[1] === bi)); if (!d || d.n < 2) return { mean: d ? d.mean : NaN, lo: NaN, hi: NaN }; const q = U.E.st.qt(1 - (1 - (r.level || 0.95)) / 2, d.n - 1); return { mean: d.mean, lo: d.mean - q * d.se, hi: d.mean + q * d.se }; }) }));
      return card(t('st_descriptives'), tb + chart(meansPlot(lv1, series, { title: r.dv + ' · ' + r.factors[0], yLabel: t('st_mean') + ' ± ' + L + '% CI' }), 'means'), { note: r.factors.length > 2 ? t('st_plot_first_two') : '' });
    }));
    return out;
  }

  function rmSections(r, U) {
    const { t, f, card, table, sec, chart, pcell } = U, out = [], L = pct(r);
    out.push(sec(G_MAIN, 'rm_within', t('st_within'), () => {
      const rows = [];
      r.within.forEach(w => {
        const corr = w.q > 1 ? [['None', 1, w.p], ['Greenhouse–Geisser', w.sph.gg, w.pGG], ['Huynh–Feldt', w.sph.hf, w.pHF]] : [['None', 1, w.p]];
        corr.forEach(([nm, e, p], k) => rows.push([k ? '' : w.term, t('st_corr_' + nm.split('–')[0].toLowerCase()), f(w.ss), dfFmt(w.df * e), f(w.ss / (w.df * e)), f(w.F), pcell(p), k ? '' : f(w.peta2), k ? '' : f(w.geta2)]));
        rows.push([t('st_residuals'), '', f(w.err.ss), dfFmt(w.err.df), f(w.err.ss / w.err.df), '', '', '', '']);
      });
      let h = card(t('st_within'), table([t('st_cases'), t('st_sphericity_corr'), 'SS', 'df', t('st_ms'), 'F', 'p', 'η²p', 'η²G'], rows, { title: 'rm_within' }), { note: t('st_rm_note'), doc: 'strmanova' });
      const b = [...r.betweenRows.map(x => [x.term, f(x.ss), String(x.df), f(x.ms), f(x.F), pcell(x.p), f(x.peta2), f(x.geta2)]), [t('st_residuals'), f(r.subjErr.ss), String(r.subjErr.df), f(r.subjErr.ms), '', '', '', '']];
      h += card(t('st_between'), table([t('st_cases'), 'SS', 'df', t('st_ms'), 'F', 'p', 'η²p', 'η²G'], b, { title: 'rm_between' }), { note: t('st_rm_between_note'), doc: 'strmanova' });
      h += card(t('st_effect_sizes'), `<p class="note">${t('st_eta_note')}</p>`, { doc: 'steffect' });
      return h;
    }));
    out.push(sec(G_MAIN, 'rm_wu', t('st_writeup'), () => writeupCard(U, r.within.map(w => {
      const useGG = w.q > 1 && w.sph.p < 0.05;
      return t(useGG ? 'st_wu_rm_gg' : 'st_wu_rm', { term: esc(w.term), df1: dfFmt(useGG ? w.df * w.sph.gg : w.df), df2: dfFmt(useGG ? w.err.df * w.sph.gg : w.err.df), F: apaNum(w.F), p: apaP(useGG ? w.pGG : w.p), e: apaR(w.peta2), g: apaR(w.geta2), eps: apaR(w.sph.gg) });
    }).concat(r.betweenRows.map(x => t('st_wu_anova_b', { term: esc(x.term), df1: x.df, df2: r.subjErr.df, F: apaNum(x.F), p: apaP(x.p), e: apaR(x.peta2) }))))));
    out.push(sec(G_ASSUMP, 'rm_sph', t('st_sphericity'), () => {
      const rows = r.within.filter(w => w.q > 1).map(w => [w.term, f(w.sph.W), f(w.sph.chi), String(w.sph.df), pcell(w.sph.p), f(w.sph.gg), f(w.sph.hf), f(w.sph.lb)]);
      return card(t('st_mauchly'), rows.length ? table([t('st_cases'), "Mauchly's W", 'χ²', 'df', 'p', 'ε GG', 'ε HF', t('st_lower_bound')], rows, { title: 'sphericity' }) : `<p class="note">${t('st_sph_two')}</p>`, { note: t('st_mauchly_note'), doc: 'stmauchly' }) + card(t('st_eps_title'), `<p class="note">${t('st_eps_note')}</p>`, { doc: 'stsphericity' });
    }));
    out.push(sec(G_POST, 'rm_post', t('st_posthoc'), () => r.posthoc.map(ph => card(t('st_posthoc_of', { f: ph.factor }), table([t('st_comparison'), t('st_md'), 'SE', 't', 'df', "Cohen's dz", 'p', 'p Bonferroni', 'p Holm'], ph.rows.map(x => [x.a + ' − ' + x.b, f(x.diff), f(x.se), f(x.t), String(x.df), f(x.d), pcell(x.p), pcell(x.pBonf), pcell(x.pHolm)]), { title: 'rm_posthoc_' + ph.factor }), { note: t('st_rm_post_note'), doc: 'stbonfholm' })).join('') +
      (r.betweenPost ? posthocCards(U, r.between, r.betweenPost.posthoc, r.betweenPost.gh, ['tukey', 'bonferroni', 'holm'], r.level || 0.95) : '')));
    out.push(sec(G_DESC, 'rm_desc', t('st_descriptives'), () => {
      const tb = table([t('st_measure')].concat(r.levels.length > 1 ? r.wnames : []).concat(r.between ? [r.between] : []).concat(['N', t('st_mean'), t('st_sd'), t('st_se'), `${L}% CI ${t('st_lower')}`, t('st_upper')]),
        r.desc.map(d => [d.measure].concat(r.levels.length > 1 ? d.cell.map(c => String(c + 1)) : []).concat(r.between ? [d.group] : []).concat([String(d.n), f(d.mean), f(d.sd), f(d.se), f(d.lo), f(d.hi)])), { title: 'rm_descriptives' });
      // plot: x = first within factor (marginal over others), series = between groups
      const k1 = r.levels[0], cats = Array.from({ length: k1 }, (_, i) => r.levels.length === 1 ? r.measures[i] : r.wnames[0] + ' ' + (i + 1));
      const series = r.groups.map(g => ({ name: g === null ? t('st_mean') : r.between + ': ' + g, points: cats.map((_, i) => { const ds = r.desc.filter(d => d.cell[0] === i && d.group === g); const m = ds.reduce((a, d) => a + d.mean, 0) / ds.length; return ds.length === 1 ? { mean: m, lo: ds[0].lo, hi: ds[0].hi } : { mean: m, lo: NaN, hi: NaN }; }) }));
      return card(t('st_descriptives'), tb + chart(meansPlot(cats, series, { title: r.wnames[0], yLabel: t('st_mean') + ' ± ' + L + '% CI' }), 'rm_means'), { note: r.levels.length > 1 ? t('st_rm_plot_note') : '' });
    }));
    return out;
  }

  function manovaSections(r, U) {
    const { t, f, card, table, sec, pcell } = U, out = [];
    const names = { pillai: "Pillai's trace", wilks: "Wilks' Λ", hotelling: 'Hotelling–Lawley', roy: "Roy's largest root" };
    out.push(sec(G_MAIN, 'mv_tab', 'MANOVA', () => card('MANOVA: ' + r.dvs.join(', '), table([t('st_cases'), t('st_test'), t('st_value'), t('st_approx_f'), 'df₁', 'df₂', 'p'], r.tests.flatMap(x => ['pillai', 'wilks', 'hotelling', 'roy'].map((k, i) => [i ? '' : x.term, names[k], f(x[k].stat), f(x[k].F), dfFmt(x[k].df1), dfFmt(x[k].df2), pcell(x[k].p)])), { title: 'manova' }), { note: t('st_manova_note', { n: r.n, df: r.dfResid }), doc: 'stmanova' })));
    out.push(sec(G_MAIN, 'mv_wu', t('st_writeup'), () => writeupCard(U, r.tests.map(x => t('st_wu_manova', { term: esc(x.term), V: apaR(x.pillai.stat), df1: dfFmt(x.pillai.df1), df2: dfFmt(x.pillai.df2), F: apaNum(x.pillai.F), p: apaP(x.pillai.p), L: apaR(x.wilks.stat) })))));
    out.push(sec(G_POST, 'mv_uni', t('st_univariate'), () => r.univariate.map(u => anovaTable(U, Object.assign({ ssType: 3 }, u), t('st_univariate') + ': ' + u.dv, 'stfactorial')).join('')));
    out.push(sec(G_ASSUMP, 'mv_box', t('st_assumptions'), () => card(t('st_boxm'), r.box ? table(['χ²', 'df', 'p'], [[f(r.box.chi), String(r.box.df), pcell(r.box.p)]], { title: 'boxm' }) : `<p class="note">${t('st_boxm_na')}</p>`, { note: t('st_boxm_note'), doc: 'stboxm' })));
    out.push(sec(G_DESC, 'mv_desc', t('st_descriptives'), () => card(t('st_descriptives'), table(r.factors.concat(['N']).concat(r.dvs.flatMap(d => [d + ' ' + t('st_mean'), d + ' ' + t('st_sd')])), r.desc.map(d => d.levels.concat([String(d.n)]).concat(d.stats.flatMap(s => [f(s.mean), f(s.sd)]))), { title: 'manova_descriptives' }))));
    return out;
  }

  function kwSections(r, U) {
    const { t, f, card, table, sec, chart, pcell } = U;
    return [
      sec(G_MAIN, 'kw_tab', 'Kruskal–Wallis', () => card('Kruskal–Wallis: ' + r.group, table([t('st_variable'), 'H', 'df', 'p', 'ε²', 'η²H', 'N'], r.rows.map(x => [x.name, f(x.H), String(x.df), pcell(x.p), f(x.eps2), f(x.eta2H), String(x.N)]), { title: 'kruskal' }), { note: t('st_kw_note'), doc: 'stkruskal' })),
      sec(G_MAIN, 'kw_wu', t('st_writeup'), () => writeupCard(U, r.rows.map(x => t('st_wu_kw', { v: esc(x.name), g: esc(r.group), df: x.df, N: x.N, H: apaNum(x.H), p: apaP(x.p), e: apaR(x.eps2) })))),
      sec(G_POST, 'kw_dunn', t('st_dunn'), () => r.rows.map(x => card(t('st_dunn') + ': ' + x.name, table([t('st_comparison'), 'z', 'p', 'p Bonferroni', 'p Holm'], x.dunn.map(d => [d.a + ' − ' + d.b, f(d.z), pcell(d.p), pcell(d.pBonf), pcell(d.pHolm)]), { title: 'dunn_' + x.name }), { note: t('st_dunn_note'), doc: 'stdunn' })).join('')),
      sec(G_DESC, 'kw_desc', t('st_descriptives'), () => r.rows.map(x => card(x.name, table([r.group, 'N', t('st_median'), t('st_mean_rank')], x.groups.map(g => [g.label, String(g.n), f(g.median), f(g.meanRank)]), { title: 'kw_desc_' + x.name }) + chart(boxplot(x.groups, { title: x.name, yLabel: x.name }), x.name))).join(''))
    ];
  }
  function friedmanSections(r, U) {
    const { t, f, card, table, sec, chart, pcell } = U;
    return [
      sec(G_MAIN, 'fr_tab', 'Friedman', () => card(t('an_st_friedman'), table(['χ²', 'df', 'p', "Kendall's W", 'N'], [[f(r.chi), String(r.df), pcell(r.p), f(r.W), String(r.n)]], { title: 'friedman' }), { note: t('st_friedman_note'), doc: 'stfriedman' }) + card("Kendall's W", `<p class="note">${t('st_kendall_note')}</p>`, { doc: 'stkendallw' })),
      sec(G_MAIN, 'fr_wu', t('st_writeup'), () => writeupCard(U, [t('st_wu_friedman', { df: r.df, n: r.n, chi: apaNum(r.chi), p: apaP(r.p), W: apaR(r.W) })])),
      sec(G_POST, 'fr_con', t('st_conover'), () => card(t('st_conover'), table([t('st_comparison'), 't', 'df', 'p', 'p Bonferroni', 'p Holm'], r.conover.map(x => [x.a + ' − ' + x.b, f(x.t), String(x.df), pcell(x.p), pcell(x.pBonf), pcell(x.pHolm)]), { title: 'conover' }), { note: t('st_conover_note'), doc: 'stconover' })),
      sec(G_DESC, 'fr_desc', t('st_descriptives'), () => card(t('st_descriptives'), table([t('st_measure'), 'N', t('st_median'), t('st_mean'), t('st_sd'), t('st_rank_sum'), t('st_mean_rank')], r.desc.map(d => [d.name, String(d.n), f(d.median), f(d.mean), f(d.sd), f(d.rankSum, 1), f(d.meanRank)]), { title: 'friedman_desc' }) + chart(U.C.bars(r.desc.map(d => ({ label: d.name, value: d.meanRank })), { title: t('st_mean_rank') }), 'mean_ranks')))
    ];
  }

  // ------------------------------------------------------------------ run-dialog fields
  const altSel = c => c.select(['two', 'greater', 'less'], { labels: v => c.t('st_alt_' + v) });
  const fields = {
    stVars: c => c.vars({ multiple: true, list: c.all() }),
    stNumVars: c => c.vars({ multiple: true, key: 'f_stVars' }),
    stSplit: c => c.vars({ list: c.cats(), none: true }),
    stGroup: c => c.vars({ list: c.cats() }),
    stPct: c => c.text('10, 90'),
    stFreq: c => c.check(), stStudent: c => c.check(), stWelch: c => c.check(), stMann: c => c.check(), stWilcox: c => c.check(), stSign: c => c.check(), stSlopes: c => c.check(),
    stMu: c => c.num(-1e12, 1e12, 'any'),
    stAlt: altSel,
    stEffect: c => c.select(['d', 'g', 'delta'], { labels: v => c.t('st_eff_' + v) }),
    stCenter: c => c.select(['mean', 'median'], { labels: v => c.t('st_center_' + v) }),
    stCI: c => c.num(50, 99.9, 'any'),
    stPairA: c => c.vars({ multiple: true }), stPairB: c => c.vars({ multiple: true }),
    stDV: c => c.vars(),
    stDVs: c => c.vars({ multiple: true }),
    stFactors: c => c.vars({ multiple: true, list: c.cats(), size: 5 }),
    stCovs: c => c.vars({ multiple: true, size: 5 }),
    stSSType: c => c.select(['3', '2', '1'], { labels: v => c.t('st_sstype_' + v) }),
    stPosthoc: c => c.select(['tukey', 'scheffe', 'bonferroni', 'holm', 'gameshowell'], { multiple: true, size: 5, labels: v => c.t('st_ph_' + v) }),
    stMeasures: c => c.vars({ multiple: true, size: 8 }),
    stLevels: c => c.text('3  ·  2, 3'),
    stWNames: c => c.text('Time  ·  A, B'),
    stBetween: c => c.vars({ list: c.cats(), none: true })
  };
  const CI = ['stCI'];
  const tasks = {
    st_desc: { doc: 'stdesc', title: 'an_st_desc', fields: ['stVars', 'stSplit', 'stPct', 'stFreq'].concat(CI), noModel: true, defaults: { stCI: 95, stFreq: true } },
    st_normality: { doc: 'stshapiro', title: 'an_st_normality', fields: ['stNumVars', 'stSplit'], noModel: true },
    st_ttest_one: { doc: 'stttest1', title: 'an_st_ttest_one', fields: ['stNumVars', 'stMu', 'stStudent', 'stWilcox', 'stAlt', 'stEffect'].concat(CI), noModel: true, defaults: { stMu: 0, stStudent: true, stAlt: 'two', stEffect: 'd', stCI: 95 } },
    st_ttest_ind: { doc: 'stttestind', title: 'an_st_ttest_ind', fields: ['stNumVars', 'groupVar', 'stStudent', 'stWelch', 'stMann', 'stAlt', 'stEffect', 'stCenter'].concat(CI), noModel: true, defaults: { stStudent: true, stWelch: true, stMann: false, stAlt: 'two', stEffect: 'd', stCenter: 'mean', stCI: 95 } },
    st_ttest_paired: { doc: 'stttestpaired', title: 'an_st_ttest_paired', fields: ['stPairA', 'stPairB', 'stStudent', 'stWilcox', 'stSign', 'stAlt', 'stEffect'].concat(CI), noModel: true, defaults: { stStudent: true, stWilcox: false, stSign: false, stAlt: 'two', stEffect: 'd', stCI: 95 } },
    st_anova: { doc: 'stanova1', title: 'an_st_anova', fields: ['stDV', 'stFactors', 'stSSType', 'stPosthoc', 'stCenter'].concat(CI), noModel: true, defaults: { stSSType: '3', stPosthoc: ['tukey'], stCenter: 'mean', stCI: 95 } },
    st_ancova: { doc: 'stancova', title: 'an_st_ancova', fields: ['stDV', 'stFactors', 'stCovs', 'stSSType', 'stSlopes', 'stPosthoc', 'stCenter'].concat(CI), noModel: true, defaults: { stSSType: '3', stPosthoc: ['tukey'], stSlopes: true, stCenter: 'mean', stCI: 95 } },
    st_rmanova: { doc: 'strmanova', title: 'an_st_rmanova', fields: ['stMeasures', 'stLevels', 'stWNames', 'stBetween'].concat(CI), noModel: true, defaults: { stLevels: '', stWNames: '', stCI: 95 } },
    st_manova: { doc: 'stmanova', title: 'an_st_manova', fields: ['stDVs', 'stFactors'], noModel: true },
    st_mannwhitney: { doc: 'stmannwhitney', title: 'an_st_mannwhitney', task: 'st_ttest_ind', fields: ['stNumVars', 'groupVar', 'stMann', 'stStudent', 'stAlt', 'stCenter'].concat(CI), noModel: true, defaults: { stStudent: false, stWelch: false, stMann: true, stAlt: 'two', stCI: 95 } },
    st_wilcoxon: { doc: 'stwilcoxon', title: 'an_st_wilcoxon', task: 'st_ttest_paired', fields: ['stPairA', 'stPairB', 'stWilcox', 'stSign', 'stStudent', 'stAlt'].concat(CI), noModel: true, defaults: { stStudent: false, stWilcox: true, stSign: false, stAlt: 'two', stCI: 95 } },
    st_kruskal: { doc: 'stkruskal', title: 'an_st_kruskal', fields: ['stNumVars', 'stGroup'], noModel: true },
    st_friedman: { doc: 'stfriedman', title: 'an_st_friedman', fields: ['stMeasures'], noModel: true }
  };
  const list = v => (Array.isArray(v) ? v : (v ? [v] : [])).filter(Boolean);
  const splitList = s => String(s || '').split(/[,،;\s]+/).map(x => x.trim()).filter(Boolean);
  function readForm(fd, kind) {
    const ci = isFinite(+fd.stCI) && +fd.stCI > 0 ? (+fd.stCI > 1 ? +fd.stCI / 100 : +fd.stCI) : 0.95;
    const o = { ci, alt: fd.stAlt || 'two', effect: fd.stEffect || 'd', center: fd.stCenter || 'mean' };
    o.vars = list(fd.stVars || fd.stNumVars);
    if (fd.stSplit) o.split = fd.stSplit;
    if (fd.stPct !== undefined) o.pct = splitList(fd.stPct).map(Number).filter(p => p > 0 && p < 100);
    o.freq = !!fd.stFreq;
    o.mu = +fd.stMu || 0;
    o.tests = { student: !!fd.stStudent, welch: !!fd.stWelch, mann: !!fd.stMann, wilcoxon: !!fd.stWilcox, sign: !!fd.stSign };
    if (!Object.values(o.tests).some(Boolean)) o.tests[kind === 'st_mannwhitney' ? 'mann' : kind === 'st_wilcoxon' ? 'wilcoxon' : 'student'] = true;
    o.group = fd.stGroup || fd.groupVar;
    const A = list(fd.stPairA), B = list(fd.stPairB); o.pairs = A.map((a, i) => [a, B[i]]).filter(p => p[1]);
    o.dv = fd.stDV; o.dvs = list(fd.stDVs); o.factors = list(fd.stFactors); o.covs = list(fd.stCovs);
    o.ssType = +fd.stSSType || 3; o.posthoc = list(fd.stPosthoc).length ? list(fd.stPosthoc) : ['tukey']; o.slopes = !!fd.stSlopes;
    o.measures = list(fd.stMeasures); o.levels = splitList(fd.stLevels).map(Number).filter(x => x > 0); o.wnames = splitList(fd.stWNames); o.between = fd.stBetween || '';
    return o;
  }

  // ------------------------------------------------------------------ references (APA 7)
  const REFS = {
    student1908: 'Student. (1908). The probable error of a mean. <i>Biometrika, 6</i>(1), 1–25. https://doi.org/10.1093/biomet/6.1.1',
    fisher1925: 'Fisher, R. A. (1925). <i>Statistical methods for research workers</i>. Oliver and Boyd.',
    fisher1932: 'Fisher, R. A. (1932). <i>Statistical methods for research workers</i> (4th ed.). Oliver and Boyd.',
    welch1947: 'Welch, B. L. (1947). The generalization of “Student’s” problem when several different population variances are involved. <i>Biometrika, 34</i>(1–2), 28–35. https://doi.org/10.1093/biomet/34.1-2.28',
    satterthwaite1946: 'Satterthwaite, F. E. (1946). An approximate distribution of estimates of variance components. <i>Biometrics Bulletin, 2</i>(6), 110–114. https://doi.org/10.2307/3002019',
    welch1951: 'Welch, B. L. (1951). On the comparison of several mean values: An alternative approach. <i>Biometrika, 38</i>(3–4), 330–336. https://doi.org/10.1093/biomet/38.3-4.330',
    brown1974var: 'Brown, M. B., & Forsythe, A. B. (1974). Robust tests for the equality of variances. <i>Journal of the American Statistical Association, 69</i>(346), 364–367. https://doi.org/10.1080/01621459.1974.10482955',
    brown1974mean: 'Brown, M. B., & Forsythe, A. B. (1974). The small sample behavior of some statistics which test the equality of several means. <i>Technometrics, 16</i>(1), 129–132. https://doi.org/10.1080/00401706.1974.10489158',
    levene1960: 'Levene, H. (1960). Robust tests for equality of variances. In I. Olkin (Ed.), <i>Contributions to probability and statistics: Essays in honor of Harold Hotelling</i> (pp. 278–292). Stanford University Press.',
    shapiro1965: 'Shapiro, S. S., & Wilk, M. B. (1965). An analysis of variance test for normality (complete samples). <i>Biometrika, 52</i>(3–4), 591–611. https://doi.org/10.1093/biomet/52.3-4.591',
    royston1995: 'Royston, P. (1995). Remark AS R94: A remark on algorithm AS 181: The W-test for normality. <i>Journal of the Royal Statistical Society: Series C (Applied Statistics), 44</i>(4), 547–551. https://doi.org/10.2307/2986146',
    lilliefors1967: 'Lilliefors, H. W. (1967). On the Kolmogorov–Smirnov test for normality with mean and variance unknown. <i>Journal of the American Statistical Association, 62</i>(318), 399–402. https://doi.org/10.1080/01621459.1967.10482916',
    dallal1986: 'Dallal, G. E., & Wilkinson, L. (1986). An analytic approximation to the distribution of Lilliefors’s test statistic for normality. <i>The American Statistician, 40</i>(4), 294–296. https://doi.org/10.1080/00031305.1986.10475419',
    anderson1952: 'Anderson, T. W., & Darling, D. A. (1952). Asymptotic theory of certain “goodness of fit” criteria based on stochastic processes. <i>The Annals of Mathematical Statistics, 23</i>(2), 193–212. https://doi.org/10.1214/aoms/1177729437',
    stephens1974: 'Stephens, M. A. (1974). EDF statistics for goodness of fit and some comparisons. <i>Journal of the American Statistical Association, 69</i>(347), 730–737. https://doi.org/10.1080/01621459.1974.10480196',
    joanes1998: 'Joanes, D. N., & Gill, C. A. (1998). Comparing measures of sample skewness and kurtosis. <i>Journal of the Royal Statistical Society: Series D (The Statistician), 47</i>(1), 183–189. https://doi.org/10.1111/1467-9884.00122',
    hyndman1996: 'Hyndman, R. J., & Fan, Y. (1996). Sample quantiles in statistical packages. <i>The American Statistician, 50</i>(4), 361–365. https://doi.org/10.1080/00031305.1996.10473566',
    pearson1895: 'Pearson, K. (1895). Contributions to the mathematical theory of evolution. II. Skew variation in homogeneous material. <i>Philosophical Transactions of the Royal Society of London. A, 186</i>, 343–414. https://doi.org/10.1098/rsta.1895.0010',
    cohen1988: 'Cohen, J. (1988). <i>Statistical power analysis for the behavioral sciences</i> (2nd ed.). Lawrence Erlbaum Associates.',
    hedges1981: 'Hedges, L. V. (1981). Distribution theory for Glass’s estimator of effect size and related estimators. <i>Journal of Educational Statistics, 6</i>(2), 107–128. https://doi.org/10.3102/10769986006002107',
    cumming2001: 'Cumming, G., & Finch, S. (2001). A primer on the understanding, use, and calculation of confidence intervals that are based on central and noncentral distributions. <i>Educational and Psychological Measurement, 61</i>(4), 532–574. https://doi.org/10.1177/0013164401614002',
    lenth1989: 'Lenth, R. V. (1989). Algorithm AS 243: Cumulative distribution function of the non-central t distribution. <i>Journal of the Royal Statistical Society: Series C (Applied Statistics), 38</i>(1), 185–189. https://doi.org/10.2307/2347693',
    mann1947: 'Mann, H. B., & Whitney, D. R. (1947). On a test of whether one of two random variables is stochastically larger than the other. <i>The Annals of Mathematical Statistics, 18</i>(1), 50–60. https://doi.org/10.1214/aoms/1177730491',
    wilcoxon1945: 'Wilcoxon, F. (1945). Individual comparisons by ranking methods. <i>Biometrics Bulletin, 1</i>(6), 80–83. https://doi.org/10.2307/3001968',
    kerby2014: 'Kerby, D. S. (2014). The simple difference formula: An approach to teaching nonparametric correlation. <i>Comprehensive Psychology, 3</i>, Article 11.IT.3.1. https://doi.org/10.2466/11.IT.3.1',
    hodges1963: 'Hodges, J. L., Jr., & Lehmann, E. L. (1963). Estimates of location based on rank tests. <i>The Annals of Mathematical Statistics, 34</i>(2), 598–611. https://doi.org/10.1214/aoms/1177704172',
    arbuthnot1710: 'Arbuthnot, J. (1710). An argument for Divine Providence, taken from the constant regularity observ’d in the births of both sexes. <i>Philosophical Transactions of the Royal Society of London, 27</i>(328), 186–190. https://doi.org/10.1098/rstl.1710.0011',
    dixon1946: 'Dixon, W. J., & Mood, A. M. (1946). The statistical sign test. <i>Journal of the American Statistical Association, 41</i>(236), 557–566. https://doi.org/10.1080/01621459.1946.10501898',
    yates1934: 'Yates, F. (1934). The analysis of multiple classifications with unequal numbers in the different classes. <i>Journal of the American Statistical Association, 29</i>(185), 51–66. https://doi.org/10.1080/01621459.1934.10502686',
    langsrud2003: 'Langsrud, Ø. (2003). ANOVA for unbalanced data: Use Type II instead of Type III sums of squares. <i>Statistics and Computing, 13</i>(2), 163–167. https://doi.org/10.1023/A:1023260610025',
    searle1980: 'Searle, S. R., Speed, F. M., & Milliken, G. A. (1980). Population marginal means in the linear model: An alternative to least squares means. <i>The American Statistician, 34</i>(4), 216–221. https://doi.org/10.1080/00031305.1980.10483031',
    cohen1973: 'Cohen, J. (1973). Eta-squared and partial eta-squared in fixed factor ANOVA designs. <i>Educational and Psychological Measurement, 33</i>(1), 107–112. https://doi.org/10.1177/001316447303300111',
    hays1963: 'Hays, W. L. (1963). <i>Statistics for psychologists</i>. Holt, Rinehart and Winston.',
    olejnik2003: 'Olejnik, S., & Algina, J. (2003). Generalized eta and omega squared statistics: Measures of effect size for some common research designs. <i>Psychological Methods, 8</i>(4), 434–447. https://doi.org/10.1037/1082-989X.8.4.434',
    tukey1949: 'Tukey, J. W. (1949). Comparing individual means in the analysis of variance. <i>Biometrics, 5</i>(2), 99–114. https://doi.org/10.2307/3001913',
    kramer1956: 'Kramer, C. Y. (1956). Extension of multiple range tests to group means with unequal numbers of replications. <i>Biometrics, 12</i>(3), 307–310. https://doi.org/10.2307/3001469',
    copenhaver1988: 'Copenhaver, M. D., & Holland, B. (1988). Computation of the distribution of the maximum studentized range statistic with application to multiple significance testing of simple effects. <i>Journal of Statistical Computation and Simulation, 30</i>(1), 1–15. https://doi.org/10.1080/00949658808811082',
    dunn1961: 'Dunn, O. J. (1961). Multiple comparisons among means. <i>Journal of the American Statistical Association, 56</i>(293), 52–64. https://doi.org/10.1080/01621459.1961.10482090',
    holm1979: 'Holm, S. (1979). A simple sequentially rejective multiple test procedure. <i>Scandinavian Journal of Statistics, 6</i>(2), 65–70.',
    scheffe1953: 'Scheffé, H. (1953). A method for judging all contrasts in the analysis of variance. <i>Biometrika, 40</i>(1–2), 87–110. https://doi.org/10.1093/biomet/40.1-2.87',
    games1976: 'Games, P. A., & Howell, J. F. (1976). Pairwise multiple comparison procedures with unequal n’s and/or variances: A Monte Carlo study. <i>Journal of Educational Statistics, 1</i>(2), 113–125. https://doi.org/10.3102/10769986001002113',
    box1954: 'Box, G. E. P. (1954). Some theorems on quadratic forms applied in the study of analysis of variance problems, II. Effects of inequality of variance and of correlation between errors in the two-way classification. <i>The Annals of Mathematical Statistics, 25</i>(3), 484–498. https://doi.org/10.1214/aoms/1177728717',
    mauchly1940: 'Mauchly, J. W. (1940). Significance test for sphericity of a normal <i>n</i>-variate distribution. <i>The Annals of Mathematical Statistics, 11</i>(2), 204–209. https://doi.org/10.1214/aoms/1177731915',
    greenhouse1959: 'Greenhouse, S. W., & Geisser, S. (1959). On methods in the analysis of profile data. <i>Psychometrika, 24</i>(2), 95–112. https://doi.org/10.1007/BF02289823',
    huynh1976: 'Huynh, H., & Feldt, L. S. (1976). Estimation of the Box correction for degrees of freedom from sample data in randomized block and split-plot designs. <i>Journal of Educational Statistics, 1</i>(1), 69–82. https://doi.org/10.3102/10769986001001069',
    lecoutre1991: 'Lecoutre, B. (1991). A correction for the ε̃ approximate test in repeated measures designs with two or more independent groups. <i>Journal of Educational Statistics, 16</i>(4), 371–372. https://doi.org/10.3102/10769986016004371',
    wilks1932: 'Wilks, S. S. (1932). Certain generalizations in the analysis of variance. <i>Biometrika, 24</i>(3–4), 471–494. https://doi.org/10.1093/biomet/24.3-4.471',
    pillai1955: 'Pillai, K. C. S. (1955). Some new test criteria in multivariate analysis. <i>The Annals of Mathematical Statistics, 26</i>(1), 117–121. https://doi.org/10.1214/aoms/1177728599',
    lawley1938: 'Lawley, D. N. (1938). A generalization of Fisher’s z test. <i>Biometrika, 30</i>(1–2), 180–187. https://doi.org/10.1093/biomet/30.1-2.180',
    hotelling1951: 'Hotelling, H. (1951). A generalized T test and measure of multivariate dispersion. In J. Neyman (Ed.), <i>Proceedings of the Second Berkeley Symposium on Mathematical Statistics and Probability</i> (pp. 23–41). University of California Press.',
    roy1953: 'Roy, S. N. (1953). On a heuristic method of test construction and its use in multivariate analysis. <i>The Annals of Mathematical Statistics, 24</i>(2), 220–238. https://doi.org/10.1214/aoms/1177729029',
    rao1951: 'Rao, C. R. (1951). An asymptotic expansion of the distribution of Wilks’ criterion. <i>Bulletin of the International Statistical Institute, 33</i>(2), 177–180.',
    box1949: 'Box, G. E. P. (1949). A general distribution theory for a class of likelihood criteria. <i>Biometrika, 36</i>(3–4), 317–346. https://doi.org/10.1093/biomet/36.3-4.317',
    kruskal1952: 'Kruskal, W. H., & Wallis, W. A. (1952). Use of ranks in one-criterion variance analysis. <i>Journal of the American Statistical Association, 47</i>(260), 583–621. https://doi.org/10.1080/01621459.1952.10483441',
    tomczak2014: 'Tomczak, M., & Tomczak, E. (2014). The need to report effect size estimates revisited: An overview of some recommended measures of effect size. <i>Trends in Sport Sciences, 21</i>(1), 19–25.',
    dunn1964: 'Dunn, O. J. (1964). Multiple comparisons using rank sums. <i>Technometrics, 6</i>(3), 241–252. https://doi.org/10.1080/00401706.1964.10490181',
    friedman1937: 'Friedman, M. (1937). The use of ranks to avoid the assumption of normality implicit in the analysis of variance. <i>Journal of the American Statistical Association, 32</i>(200), 675–701. https://doi.org/10.1080/01621459.1937.10503522',
    kendall1939: 'Kendall, M. G., & Babington Smith, B. (1939). The problem of <i>m</i> rankings. <i>The Annals of Mathematical Statistics, 10</i>(3), 275–287. https://doi.org/10.1214/aoms/1177732186',
    conover1999: 'Conover, W. J. (1999). <i>Practical nonparametric statistics</i> (3rd ed.). Wiley.'
  };

  // ------------------------------------------------------------------ MathML builders
  const mi = v => `<mi>${v}</mi>`, mo = v => `<mo>${v}</mo>`, mn = v => `<mn>${v}</mn>`, mt = v => `<mtext>${v}</mtext>`, row = (...a) => `<mrow>${a.join('')}</mrow>`;
  const fr = (a, b) => `<mfrac>${row(a)}${row(b)}</mfrac>`, sq = a => `<msqrt>${a}</msqrt>`, sb = (a, b) => `<msub>${row(a)}${row(b)}</msub>`, sp = (a, b) => `<msup>${row(a)}${row(b)}</msup>`;
  const ss = (a, b, c) => `<msubsup>${row(a)}${row(b)}${row(c)}</msubsup>`, bar = v => `<mover>${row(v)}<mo>¯</mo></mover>`, hat = v => `<mover>${row(v)}<mo>^</mo></mover>`, tld = v => `<mover>${row(v)}<mo>~</mo></mover>`;
  const SUM = (lo, hi) => `<munderover><mo>∑</mo>${row(lo || '')}${row(hi || '')}</munderover>`, SUMu = lo => `<munder><mo>∑</mo>${row(lo)}</munder>`, PROD = lo => `<munder><mo>∏</mo>${row(lo)}</munder>`;
  const par = (...a) => row(mo('('), ...a, mo(')')), brk = (...a) => row(mo('['), ...a, mo(']')), abs = (...a) => row(mo('|'), ...a, mo('|'));
  const eq = mo('='), pl = mo('+'), mi_ = mo('−'), tm = mo('·'), cm = mo(','), gap = '<mspace width="1.2em"/>';
  const M = (...lines) => `<math display="block"><mtable columnalign="left">${lines.map(l => `<mtr><mtd>${l}</mtd></mtr>`).join('')}</mtable></math>`;
  const xb = bar(mi('x')), yb = bar(mi('y')), xi = sb(mi('x'), mi('i')), n = mi('n'), N = mi('N'), k = mi('k'), nu = mi('ν'), s2 = i => ss(mi('s'), i, mn(2)), ni = i => sb(mi('n'), i), ybi = i => sb(yb, i);
  const ties = row(SUMu(''), par(sp(mi('t'), mn(3)), mi_, mi('t')));

  // ------------------------------------------------------------------ methods ("!" popovers and the Methods help page)
  const METHODS = [
    {
      id: 'stdesc', refs: ['pearson1895', 'joanes1998', 'hyndman1996'],
      formula: M(row(xb, eq, fr(mn(1), n), SUM(row(mi('i'), eq, mn(1)), n), xi, gap, mi('s'), eq, sq(fr(row(SUM(row(mi('i'), eq, mn(1)), n), sp(par(xi, mi_, xb), mn(2))), row(n, mi_, mn(1)))), gap, mi('SE'), eq, fr(mi('s'), sq(n))),
        row(sb(mi('G'), mn(1)), eq, fr(n, row(par(n, mi_, mn(1)), par(n, mi_, mn(2)))), SUM(mi('i'), ''), sp(par(fr(row(xi, mi_, xb), mi('s'))), mn(3)), gap, sb(mi('SE'), sb(mi('G'), mn(1))), eq, sq(fr(row(mn(6), n, par(n, mi_, mn(1))), row(par(n, mi_, mn(2)), par(n, pl, mn(1)), par(n, pl, mn(3)))))),
        row(sb(mi('G'), mn(2)), eq, fr(row(n, par(n, pl, mn(1))), row(par(n, mi_, mn(1)), par(n, mi_, mn(2)), par(n, mi_, mn(3)))), SUM(mi('i'), ''), sp(par(fr(row(xi, mi_, xb), mi('s'))), mn(4)), mi_, fr(row(mn(3), sp(par(n, mi_, mn(1)), mn(2))), row(par(n, mi_, mn(2)), par(n, mi_, mn(3))))),
        row(sb(mi('SE'), sb(mi('G'), mn(2))), eq, mn(2), sb(mi('SE'), sb(mi('G'), mn(1))), sq(fr(row(sp(n, mn(2)), mi_, mn(1)), row(par(n, mi_, mn(3)), par(n, pl, mn(5)))))),
        row(mi('Q'), par(mi('p')), eq, sb(mi('x'), par(mi('j'))), pl, par(mi('h'), mi_, mi('j')), par(sb(mi('x'), par(mi('j'), pl, mn(1))), mi_, sb(mi('x'), par(mi('j')))), cm, gap, mi('h'), eq, par(n, mi_, mn(1)), mi('p'), pl, mn(1), cm, gap, mi('j'), eq, mo('⌊'), mi('h'), mo('⌋'))),
      en: { title: 'Descriptive statistics', origin: 'Moment-based skewness and kurtosis go back to Karl Pearson (1895, Philosophical Transactions A); the bias-adjusted coefficients G1 and G2 reported here (as in SPSS and JASP) are those compared by Joanes and Gill (1998). Quartiles and percentiles use definition 7 of Hyndman and Fan (1996), the default of R and JASP.', text: 'Summarises each variable (optionally within the groups of a split variable): valid N and missing values, mean with its standard error and t-based confidence interval, median, mode, standard deviation, variance, coefficient of variation, range, quartiles, percentiles, skewness and excess kurtosis with their standard errors, and the Shapiro–Wilk normality test. Categorical variables get frequency tables. Histograms, Tukey box plots (whiskers at 1.5 × IQR) and normal Q–Q plots show the distributions.' },
      ar: { title: 'الإحصاءات الوصفية', origin: 'يرجع الالتواء والتفرطح القائمان على العزوم إلى كارل بيرسون (1895، مجلة Philosophical Transactions A)، أما المعاملان المصحَّحان من التحيّز G1 وG2 المعروضان هنا (كما في SPSS وJASP) فهما اللذان قارن بينهما جوانز وجِل (1998). وتُحسب الربيعات والمئينات بالتعريف السابع عند هيندمان وفان (1996)، وهو الافتراضي في R وJASP.', text: 'يلخّص كل متغير (وعند الطلب داخل مجموعات متغير التقسيم): عدد القيم الصالحة والمفقودة، والمتوسط مع خطئه المعياري وفترة ثقته المبنية على توزيع t، والوسيط والمنوال والانحراف المعياري والتباين ومعامل الاختلاف والمدى والربيعات والمئينات، والالتواء والتفرطح الزائد مع خطأيهما المعياريين، واختبار شابيرو–ويلك للاعتدالية. وتُعرض للمتغيرات الفئوية جداول تكرار، وتُظهر المدرَّجات التكرارية والمخططات الصندوقية (بشوارب عند 1.5 × المدى الربيعي) ومخططات Q–Q الطبيعية شكلَ التوزيع.' }
    },
    {
      id: 'stshapiro', refs: ['shapiro1965', 'royston1995'],
      formula: M(row(mi('W'), eq, fr(sp(par(SUM(row(mi('i'), eq, mn(1)), n), sb(mi('a'), mi('i')), sb(mi('x'), par(mi('i')))), mn(2)), row(SUM(row(mi('i'), eq, mn(1)), n), sp(par(xi, mi_, xb), mn(2))))),
        row(sp(mi('a'), mi('⊤')), eq, fr(row(sp(mi('m'), mi('⊤')), sp(mi('V'), row(mi_, mn(1)))), sp(par(sp(mi('m'), mi('⊤')), sp(mi('V'), row(mi_, mn(1))), sp(mi('V'), row(mi_, mn(1))), mi('m')), row(mn(1), mo('/'), mn(2))))),
        row(mi('z'), eq, fr(row(mi('ln'), par(mn(1), mi_, mi('W')), mi_, mi('μ'), par(n)), row(mi('σ'), par(n))), cm, gap, mi('p'), eq, mn(1), mi_, mi('Φ'), par(mi('z')))),
      en: { title: 'Shapiro–Wilk test of normality', origin: 'Introduced by Samuel S. Shapiro and Martin B. Wilk in Biometrika (1965) for samples up to 50; Patrick Royston’s approximation (Applied Statistics, 1992; algorithm AS R94, 1995) extended it to 5000 cases and is the algorithm used by R, JASP and BabPls.', text: 'Tests H0: the data come from a normal distribution. W is the squared correlation between the ordered sample x(i) and the expected normal order statistics m (weighted by their covariance V); values well below 1 indicate non-normality. The p-value comes from Royston’s normalising transformation of ln(1 − W). Valid for 3 ≤ n ≤ 5000. With large samples trivial departures become significant, so inspect the Q–Q plot too.' },
      ar: { title: 'اختبار شابيرو–ويلك للاعتدالية', origin: 'قدّمه صموئيل س. شابيرو ومارتن ب. ويلك في مجلة Biometrika عام 1965 للعيّنات حتى 50 حالة، ثم وسّع باتريك رويستون مجاله إلى 5000 حالة بتقريبه (Applied Statistics، 1992؛ الخوارزمية AS R94، 1995)، وهي الخوارزمية المستعملة في R وJASP وBabPls.', text: 'يختبر الفرضية الصفرية: البيانات مأخوذة من توزيع طبيعي. والإحصاءة W مربّع الارتباط بين العيّنة المرتَّبة x(i) والقيم المتوقعة لإحصاءات الترتيب الطبيعية m (موزونةً بمصفوفة تغايرها V)، فإذا نقصت كثيراً عن 1 دلّ ذلك على عدم الاعتدالية. وتُستخرج القيمة الاحتمالية من تحويل رويستون المقرِّب إلى الاعتدالية للمقدار ln(1 − W). يصلح للعيّنات من 3 إلى 5000 حالة، وفي العيّنات الكبيرة تصير الانحرافات الطفيفة دالّة، فانظر في مخطط Q–Q أيضاً.' }
    },
    {
      id: 'stlillie', refs: ['lilliefors1967', 'dallal1986'],
      formula: M(row(mi('D'), eq, sb(mi('max'), mi('i')), mo('{'), fr(mi('i'), n), mi_, mi('Φ'), par(sb(mi('z'), par(mi('i')))), cm, mi('Φ'), par(sb(mi('z'), par(mi('i')))), mi_, fr(row(mi('i'), mi_, mn(1)), n), mo('}'), cm, gap, sb(mi('z'), par(mi('i'))), eq, fr(row(sb(mi('x'), par(mi('i'))), mi_, xb), mi('s')))),
      en: { title: 'Kolmogorov–Smirnov test with Lilliefors correction', origin: 'Hubert W. Lilliefors (Journal of the American Statistical Association, 1967) tabulated the Kolmogorov–Smirnov statistic when the normal mean and variance are estimated from the sample; Dallal and Wilkinson (1986) gave the analytic p-value approximation used here (as in R’s nortest::lillie.test).', text: 'D is the largest vertical distance between the empirical distribution function and the normal CDF with the sample mean and SD. Because these parameters are estimated, the classical K–S p-value would be far too large; the Lilliefors distribution corrects this. Less powerful than Shapiro–Wilk; requires n ≥ 5.' },
      ar: { title: 'اختبار كولموغوروف–سميرنوف بتصحيح ليلييفورس', origin: 'جدول هوبرت و. ليلييفورس (مجلة الجمعية الإحصائية الأمريكية، 1967) توزيعَ إحصاءة كولموغوروف–سميرنوف حين يُقدَّر المتوسط والتباين الطبيعيان من العيّنة نفسها، ثم قدّم دالال وويلكنسون (1986) التقريب التحليلي للقيمة الاحتمالية المستعمل هنا (كما في nortest::lillie.test في R).', text: 'الإحصاءة D أكبر مسافة رأسية بين دالة التوزيع التجريبية ودالة التوزيع الطبيعي التراكمية بمتوسط العيّنة وانحرافها المعياري. ولأن هاتين المعلمتين مقدَّرتان تكون القيمة الاحتمالية لاختبار K–S التقليدي أكبر من حقيقتها كثيراً، فيصحّحها توزيع ليلييفورس. وهو أضعف قوةً من شابيرو–ويلك، ويتطلب خمس حالات على الأقل.' }
    },
    {
      id: 'stad', refs: ['anderson1952', 'stephens1974'],
      formula: M(row(sp(mi('A'), mn(2)), eq, mi_, n, mi_, fr(mn(1), n), SUM(row(mi('i'), eq, mn(1)), n), par(mn(2), mi('i'), mi_, mn(1)), brk(mi('ln'), mi('Φ'), par(sb(mi('z'), par(mi('i')))), pl, mi('ln'), par(mn(1), mi_, mi('Φ'), par(sb(mi('z'), par(n, pl, mn(1), mi_, mi('i'))))))),
        row(sp(mi('A'), row(mo('*'), mn(2))), eq, sp(mi('A'), mn(2)), par(mn(1), pl, fr(mn('0.75'), n), pl, fr(mn('2.25'), sp(n, mn(2)))))),
      en: { title: 'Anderson–Darling test of normality', origin: 'Theodore W. Anderson and Donald A. Darling introduced the statistic in The Annals of Mathematical Statistics (1952); Michael A. Stephens (Journal of the American Statistical Association, 1974) gave the small-sample modification and p-value formulas for the case of estimated mean and variance used here (as in R’s nortest::ad.test).', text: 'A weighted squared distance between the empirical and the fitted normal distribution functions that gives extra weight to the tails, which makes it more sensitive than K–S to heavy or light tails. Requires n ≥ 8.' },
      ar: { title: 'اختبار أندرسون–دارلنغ للاعتدالية', origin: 'قدّم ثيودور و. أندرسون ودونالد أ. دارلنغ هذه الإحصاءة في مجلة The Annals of Mathematical Statistics عام 1952، وقدّم مايكل أ. ستيفنز (مجلة الجمعية الإحصائية الأمريكية، 1974) تعديل العيّنات الصغيرة وصيغ القيمة الاحتمالية عند تقدير المتوسط والتباين، وهي المستعملة هنا (كما في nortest::ad.test في R).', text: 'مسافة تربيعية موزونة بين دالة التوزيع التجريبية ودالة التوزيع الطبيعي الموفَّقة، تعطي الذيلين وزناً أكبر، فتكون أشدّ حساسيةً من K–S للذيول الثقيلة أو الخفيفة. يتطلب ثماني حالات على الأقل.' }
    },
    {
      id: 'stttest1', refs: ['student1908'],
      formula: M(row(mi('t'), eq, fr(row(xb, mi_, sb(mi('μ'), mn(0))), row(mi('s'), mo('/'), sq(n))), cm, gap, nu, eq, n, mi_, mn(1)),
        row(xb, mo('±'), sb(mi('t'), row(mn(1), mi_, mi('α'), mo('/'), mn(2), cm, nu)), fr(mi('s'), sq(n)), cm, gap, mi('d'), eq, fr(row(xb, mi_, sb(mi('μ'), mn(0))), mi('s')))),
      en: { title: 'One-sample t-test', origin: 'Derived by William Sealy Gosset, a chemist at the Guinness brewery in Dublin, who published it under the pseudonym “Student” in Biometrika (1908); R. A. Fisher later gave the distribution its modern form and the name t.', text: 'Tests whether the population mean equals a test value μ0. Assumes independent observations from an approximately normal population (robust in moderate samples). Reports the mean difference with its confidence interval and Cohen’s d (or Hedges’ g). The Wilcoxon signed-rank test is the distribution-free alternative.' },
      ar: { title: 'اختبار t لعيّنة واحدة', origin: 'اشتقّه وليام سيلي غوسِت، الكيميائي في مصنع غينيس للجعة في دبلن، ونشره باسم مستعار هو «Student» في مجلة Biometrika عام 1908، ثم أعطى ر. أ. فيشر التوزيعَ صورته الحديثة واسمه t.', text: 'يختبر هل يساوي متوسط المجتمع قيمةً مرجعية μ0. ويفترض استقلال المشاهدات وأن المجتمع قريب من التوزيع الطبيعي (وهو متين في العيّنات المتوسطة). يعرض فرق المتوسط مع فترة ثقته ومقدار الأثر d لكوهين (أو g لهيدجز)، وبديله اللامعلمي اختبار ويلكوكسون للرتب ذات الإشارة.' }
    },
    {
      id: 'stttestind', refs: ['student1908', 'fisher1925'],
      formula: M(row(mi('t'), eq, fr(row(ybi(mn(1)), mi_, ybi(mn(2))), row(sb(mi('s'), mi('p')), sq(row(fr(mn(1), ni(mn(1))), pl, fr(mn(1), ni(mn(2))))))), cm, gap, nu, eq, ni(mn(1)), pl, ni(mn(2)), mi_, mn(2)),
        row(ss(mi('s'), mi('p'), mn(2)), eq, fr(row(par(ni(mn(1)), mi_, mn(1)), s2(mn(1)), pl, par(ni(mn(2)), mi_, mn(1)), s2(mn(2))), row(ni(mn(1)), pl, ni(mn(2)), mi_, mn(2))))),
      en: { title: 'Independent-samples t-test (Student)', origin: 'Student’s (W. S. Gosset’s) 1908 Biometrika paper treated one sample; R. A. Fisher extended the t distribution to the difference between two independent means with a pooled variance in Statistical Methods for Research Workers (1925).', text: 'Tests whether two independent groups have equal population means. Assumes independence, approximate normality within groups and equal variances (check with Levene’s test; if they differ, use Welch’s test, which JASP and BabPls report alongside). The confidence interval is for the difference of means.' },
      ar: { title: 'اختبار t لعيّنتين مستقلتين (ستيودنت)', origin: 'عالجت ورقة «ستيودنت» (و. س. غوسِت) في Biometrika عام 1908 حالة العيّنة الواحدة، ثم مدّ ر. أ. فيشر توزيع t إلى الفرق بين متوسطي عيّنتين مستقلتين بتباين مجمَّع في كتابه Statistical Methods for Research Workers عام 1925.', text: 'يختبر تساوي متوسطي مجتمعين لمجموعتين مستقلتين. ويفترض الاستقلال، والاعتدالية التقريبية داخل كل مجموعة، وتساوي التباينين (افحصه باختبار ليفين؛ فإن اختلفا فاعتمد اختبار ويلش الذي يعرضه JASP وBabPls بجانبه). وفترة الثقة للفرق بين المتوسطين.' }
    },
    {
      id: 'stwelch', refs: ['welch1947', 'satterthwaite1946'],
      formula: M(row(mi('t'), eq, fr(row(ybi(mn(1)), mi_, ybi(mn(2))), sq(row(fr(s2(mn(1)), ni(mn(1))), pl, fr(s2(mn(2)), ni(mn(2))))))),
        row(nu, eq, fr(sp(par(fr(s2(mn(1)), ni(mn(1))), pl, fr(s2(mn(2)), ni(mn(2)))), mn(2)), row(fr(sp(par(s2(mn(1)), mo('/'), ni(mn(1))), mn(2)), row(ni(mn(1)), mi_, mn(1))), pl, fr(sp(par(s2(mn(2)), mo('/'), ni(mn(2))), mn(2)), row(ni(mn(2)), mi_, mn(1))))))),
      en: { title: 'Welch’s t-test (unequal variances)', origin: 'Bernard Lewis Welch solved the Behrens–Fisher problem approximately in Biometrika (1947); the degrees-of-freedom formula is Franklin E. Satterthwaite’s (Biometrics Bulletin, 1946), hence “Welch–Satterthwaite”.', text: 'Compares two independent means without assuming equal variances: each group keeps its own variance and the degrees of freedom are approximated. It loses little power when variances are equal and protects the Type I error rate when they are not, so many authors recommend it by default. The effect size uses the average of the two variances.' },
      ar: { title: 'اختبار t لويلش (تباينان غير متساويين)', origin: 'حلّ برنارد لويس ويلش مسألة بيهرنز–فيشر حلاً تقريبياً في مجلة Biometrika عام 1947، وصيغة درجات الحرية لفرانكلين إ. ساترثويت (Biometrics Bulletin، 1946)، ومن هنا تسميته «ويلش–ساترثويت».', text: 'يقارن متوسطي مجموعتين مستقلتين دون افتراض تساوي التباينين: تحتفظ كل مجموعة بتباينها وتُقرَّب درجات الحرية. لا يخسر إلا قليلاً من القوة إذا تساوى التباينان، ويحمي معدل الخطأ من النوع الأول إذا اختلفا، ولذلك يوصي به كثيرون افتراضياً. ويُحسب مقدار الأثر بمتوسط التباينين.' }
    },
    {
      id: 'stttestpaired', refs: ['student1908'],
      formula: M(row(sb(mi('d'), mi('i')), eq, xi, mi_, sb(mi('y'), mi('i')), cm, gap, mi('t'), eq, fr(bar(mi('d')), row(sb(mi('s'), mi('d')), mo('/'), sq(n))), cm, gap, nu, eq, n, mi_, mn(1), cm, gap, sb(mi('d'), mi('z')), eq, fr(bar(mi('d')), sb(mi('s'), mi('d'))))),
      en: { title: 'Paired-samples t-test', origin: 'Already in Student’s 1908 Biometrika paper, whose worked example was the paired gain in sleep produced by two drugs in the same ten patients (Cushny and Peebles’ data).', text: 'Tests whether the mean of the paired differences is zero (two measurements on the same cases). Assumes the differences are approximately normal. Cohen’s dz divides the mean difference by the SD of the differences. Alternatives: Wilcoxon signed-rank test and the sign test.' },
      ar: { title: 'اختبار t لعيّنتين مترابطتين', origin: 'ورد في ورقة «ستيودنت» نفسها في Biometrika عام 1908، وكان مثالها المحلول الزيادةَ المزدوجة في ساعات النوم التي أحدثها دواءان لدى المرضى العشرة أنفسهم (بيانات كَشني وبيبلز).', text: 'يختبر هل يساوي متوسط الفروق المزدوجة صفراً (قياسان على الحالات نفسها). ويفترض أن الفروق قريبة من التوزيع الطبيعي. ويقسم dz لكوهين متوسط الفروق على انحرافها المعياري. وبديلاه اختبار ويلكوكسون للرتب ذات الإشارة واختبار الإشارة.' }
    },
    {
      id: 'stcohend', refs: ['cohen1988', 'hedges1981', 'cumming2001', 'lenth1989'],
      formula: M(row(mi('d'), eq, fr(row(ybi(mn(1)), mi_, ybi(mn(2))), sb(mi('s'), mi('p'))), cm, gap, mi('g'), eq, mi('J'), par(nu), mi('d'), cm, gap, mi('J'), par(nu), eq, fr(row(mi('Γ'), par(nu, mo('/'), mn(2))), row(sq(row(nu, mo('/'), mn(2))), mi('Γ'), par(par(nu, mi_, mn(1)), mo('/'), mn(2)))), cm, gap, mi('Δ'), eq, fr(row(ybi(mn(1)), mi_, ybi(mn(2))), sb(mi('s'), mn(2)))),
        row(sb(mi('P'), sb(mi('δ'), mi('L'))), par(sp(mi('T'), mo('′')), mo('≤'), mi('t')), eq, mn(1), mi_, fr(mi('α'), mn(2)), cm, gap, sb(mi('P'), sb(mi('δ'), mi('U'))), par(sp(mi('T'), mo('′')), mo('≤'), mi('t')), eq, fr(mi('α'), mn(2)), cm, gap, sb(mi('d'), row(mi('L'), cm, mi('U'))), eq, sb(mi('δ'), row(mi('L'), cm, mi('U'))), sq(row(fr(mn(1), ni(mn(1))), pl, fr(mn(1), ni(mn(2))))))),
      en: { title: 'Effect sizes for t-tests: Cohen’s d, Hedges’ g, Glass’ Δ', origin: 'Jacob Cohen standardised the mean difference in Statistical Power Analysis for the Behavioral Sciences (1962 paper; book 1969, 2nd ed. 1988); Larry V. Hedges derived the small-sample bias correction J in the Journal of Educational Statistics (1981). Exact confidence intervals invert the non-central t distribution (Cumming & Finch, 2001), computed with Lenth’s algorithm AS 243.', text: 'd expresses the mean difference in pooled-SD units (≈ 0.2 small, 0.5 medium, 0.8 large, by Cohen’s rough convention); g removes the small-sample upward bias of d; Glass’ Δ uses the SD of the second (control) group only. The CI is found from the non-centrality parameters δL and δU of the non-central t distribution T′ that place the observed t at the α/2 tails. For one-sample and paired tests the scaling factor is 1/√n.' },
      ar: { title: 'مقادير الأثر لاختبارات t: d لكوهين وg لهيدجز وΔ لغلاس', origin: 'وحّد جيكوب كوهين فرق المتوسطين بوحدات الانحراف المعياري في Statistical Power Analysis for the Behavioral Sciences (ورقة 1962، والكتاب 1969، والطبعة الثانية 1988)، واشتقّ لاري ف. هيدجز معامل تصحيح تحيّز العيّنات الصغيرة J في مجلة Journal of Educational Statistics عام 1981. وتُستخرج فترات الثقة الدقيقة بقلب توزيع t غير المركزي (كمنغ وفينش، 2001)، ويُحسب بخوارزمية لِنث AS 243.', text: 'يعبّر d عن فرق المتوسطين بوحدات الانحراف المعياري المجمَّع (نحو 0.2 صغير و0.5 متوسط و0.8 كبير بحسب عُرف كوهين التقريبي)، ويُزيل g التحيّز الموجب لـ d في العيّنات الصغيرة، ويستعمل Δ لغلاس الانحراف المعياري للمجموعة الثانية (الضابطة) وحدها. وتُحدَّد فترة الثقة بمعلمتي عدم المركزية δL وδU لتوزيع t غير المركزي T′ اللتين تضعان قيمة t المشاهدة عند ذيلي α/2. وفي اختبار العيّنة الواحدة والعيّنتين المترابطتين يكون معامل التحويل 1/√n.' }
    },
    {
      id: 'stlevene', refs: ['levene1960', 'brown1974var'],
      formula: M(row(mi('W'), eq, fr(row(N, mi_, k), row(k, mi_, mn(1))), tm, fr(row(SUM(row(mi('i'), eq, mn(1)), k), ni(mi('i')), sp(par(sb(bar(mi('Z')), mi('i')), mi_, bar(mi('Z'))), mn(2))), row(SUMu(mi('i')), SUMu(mi('j')), sp(par(sb(mi('Z'), row(mi('i'), mi('j'))), mi_, sb(bar(mi('Z')), mi('i'))), mn(2))))),
        row(sb(mi('Z'), row(mi('i'), mi('j'))), eq, abs(sb(mi('y'), row(mi('i'), mi('j'))), mi_, ybi(mi('i'))), mt(' (Levene) '), mt(' or '), abs(sb(mi('y'), row(mi('i'), mi('j'))), mi_, sb(tld(mi('y')), mi('i'))), mt(' (Brown–Forsythe)'), cm, gap, mi('W'), mo('∼'), sb(mi('F'), row(k, mi_, mn(1), cm, N, mi_, k)))),
      en: { title: 'Levene’s and Brown–Forsythe tests of equal variances', origin: 'Howard Levene proposed the ANOVA on absolute deviations from the group means in the Hotelling Festschrift Contributions to Probability and Statistics (1960); Morton B. Brown and Alan B. Forsythe (Journal of the American Statistical Association, 1974) showed that deviations from the group medians are more robust.', text: 'Tests H0: all groups have equal population variances (homogeneity of variance), an assumption of Student’s t-test and the classical ANOVA. A significant result suggests using Welch’s t-test or Welch/Brown–Forsythe ANOVA and Games–Howell post hoc comparisons.' },
      ar: { title: 'اختبارا ليفين وبراون–فورسايث لتساوي التباينات', origin: 'اقترح هوارد ليفين تحليل التباين على الانحرافات المطلقة عن متوسطات المجموعات في الكتاب التكريمي لهوتيلنغ Contributions to Probability and Statistics عام 1960، وبيّن مورتن ب. براون وآلن ب. فورسايث (مجلة الجمعية الإحصائية الأمريكية، 1974) أن الانحرافات عن وسيطات المجموعات أكثر متانة.', text: 'يختبر الفرضية الصفرية: تتساوى تباينات المجتمعات في جميع المجموعات (تجانس التباين)، وهو افتراض في اختبار t لستيودنت وفي تحليل التباين التقليدي. فإذا كانت النتيجة دالّة فالأولى استعمال اختبار t لويلش، أو تحليل التباين بتصحيح ويلش أو براون–فورسايث، ومقارنات غيمز–هاول البَعدية.' }
    },
    {
      id: 'stmannwhitney', refs: ['mann1947', 'wilcoxon1945', 'kerby2014', 'hodges1963'],
      formula: M(row(mi('U'), eq, sb(mi('R'), mn(1)), mi_, fr(row(ni(mn(1)), par(ni(mn(1)), pl, mn(1))), mn(2)), cm, gap, sb(mi('r'), mi('rb')), eq, fr(row(mn(2), mi('U')), row(ni(mn(1)), ni(mn(2)))), mi_, mn(1)),
        row(mi('z'), eq, fr(row(mi('U'), mi_, ni(mn(1)), ni(mn(2)), mo('/'), mn(2), mo('∓'), mn('0.5')), sq(row(fr(row(ni(mn(1)), ni(mn(2))), mn(12)), brk(N, pl, mn(1), mi_, fr(ties, row(N, par(N, mi_, mn(1))))))))),
        row(sb(hat(mi('Δ')), mi('HL')), eq, sb(mi('median'), row(mi('i'), cm, mi('j'))), par(xi, mi_, sb(mi('y'), mi('j'))))),
      en: { title: 'Mann–Whitney U test (Wilcoxon rank-sum)', origin: 'Frank Wilcoxon introduced the rank-sum test for equal samples in Biometrics Bulletin (1945); Henry B. Mann and Donald R. Whitney generalised it to unequal sizes with the U statistic in The Annals of Mathematical Statistics (1947).', text: 'A rank-based alternative to the independent t-test: tests whether values in one group tend to be larger than in the other (stochastic equality). U is reported as W in R/JASP (rank sum of group 1 minus its minimum). Exact p-values are used when both groups have fewer than 50 cases and there are no ties; otherwise the normal approximation with continuity and tie corrections. Effect size: rank-biserial correlation (Kerby, 2014) with a Fisher-z confidence interval; location: Hodges–Lehmann estimate.' },
      ar: { title: 'اختبار مان–ويتني U (مجموع رتب ويلكوكسون)', origin: 'قدّم فرانك ويلكوكسون اختبار مجموع الرتب لعيّنتين متساويتين في Biometrics Bulletin عام 1945، وعمّمه هنري ب. مان ودونالد ر. ويتني على الأحجام غير المتساوية بالإحصاءة U في مجلة The Annals of Mathematical Statistics عام 1947.', text: 'بديل قائم على الرتب لاختبار t للعيّنتين المستقلتين: يختبر هل تميل قيم إحدى المجموعتين إلى أن تكون أكبر من قيم الأخرى (التكافؤ العشوائي). وتُعرض U باسم W في R وJASP (مجموع رتب المجموعة الأولى مطروحاً منه أصغر قيمة ممكنة له). تُستعمل القيم الاحتمالية الدقيقة إذا قلّ حجم كل مجموعة عن 50 ولم توجد قيم متعادلة، وإلا فالتقريب الطبيعي مع تصحيحي الاتصال والتعادل. ومقدار الأثر ارتباط الرتب الثنائي (كيربي، 2014) مع فترة ثقة بتحويل فيشر z، ومقدّر الموقع تقدير هودجز–ليمان.' }
    },
    {
      id: 'stwilcoxon', refs: ['wilcoxon1945', 'kerby2014', 'hodges1963'],
      formula: M(row(mi('V'), eq, SUMu(row(sb(mi('d'), mi('i')), mo('&gt;'), mn(0))), sb(mi('R'), mi('i')), cm, gap, sb(mi('r'), mi('rb')), eq, fr(row(sp(mi('T'), mo('+')), mi_, sp(mi('T'), mo('−'))), row(n, par(n, pl, mn(1)), mo('/'), mn(2)))),
        row(mi('z'), eq, fr(row(mi('V'), mi_, n, par(n, pl, mn(1)), mo('/'), mn(4), mo('∓'), mn('0.5')), sq(row(fr(row(n, par(n, pl, mn(1)), par(mn(2), n, pl, mn(1))), mn(24)), mi_, fr(ties, mn(48)))))),
        row(sb(hat(mi('θ')), mi('HL')), eq, sb(mi('median'), row(mi('i'), mo('≤'), mi('j'))), fr(row(sb(mi('d'), mi('i')), pl, sb(mi('d'), mi('j'))), mn(2)))),
      en: { title: 'Wilcoxon signed-rank test', origin: 'Introduced by Frank Wilcoxon, a chemist at the American Cyanamid Company, in “Individual comparisons by ranking methods”, Biometrics Bulletin (1945), the same paper that proposed the rank-sum test.', text: 'Rank-based alternative to the one-sample and paired t-tests: tests whether the differences (or values minus μ0) are symmetrically distributed around zero. Zero differences are dropped and tied absolute differences receive average ranks. Exact p-values for n < 50 without ties or zeros; otherwise the normal approximation with continuity and tie corrections. Effect size: matched-pairs rank-biserial correlation; location: Hodges–Lehmann (pseudo-median) estimate.' },
      ar: { title: 'اختبار ويلكوكسون للرتب ذات الإشارة', origin: 'قدّمه فرانك ويلكوكسون، الكيميائي في شركة American Cyanamid، في ورقته «المقارنات الفردية بطرائق الترتيب» في Biometrics Bulletin عام 1945، وهي الورقة نفسها التي اقترحت اختبار مجموع الرتب.', text: 'بديل قائم على الرتب لاختباري t للعيّنة الواحدة وللعيّنتين المترابطتين: يختبر هل الفروق (أو القيم مطروحاً منها μ0) موزعة توزيعاً متماثلاً حول الصفر. تُحذف الفروق الصفرية، وتُعطى الفروق المطلقة المتعادلة متوسط رتبها. تُستعمل القيم الاحتمالية الدقيقة إذا قلّ n عن 50 دون تعادل أو أصفار، وإلا فالتقريب الطبيعي مع تصحيحي الاتصال والتعادل. ومقدار الأثر ارتباط الرتب الثنائي للأزواج، ومقدّر الموقع تقدير هودجز–ليمان (الوسيط الزائف).' }
    },
    {
      id: 'stsign', refs: ['arbuthnot1710', 'dixon1946'],
      formula: M(row(mi('S'), eq, mi('#'), mo('{'), mi('i'), mo(':'), sb(mi('d'), mi('i')), mo('&gt;'), mn(0), mo('}'), cm, gap, mi('B'), mo('∼'), mi('Bin'), par(sp(n, mo('′')), cm, fr(mn(1), mn(2))), cm, gap, mi('p'), eq, mn(2), mi('min'), mo('{'), mi('P'), par(mi('B'), mo('≤'), mi('S')), cm, mi('P'), par(mi('B'), mo('≥'), mi('S')), mo('}'))),
      en: { title: 'Sign test', origin: 'The oldest significance test: John Arbuthnot (Philosophical Transactions, 1710) argued from 82 consecutive years with more male than female christenings in London that the excess could not be due to chance; Wilfrid J. Dixon and Alexander M. Mood formalised the modern sign test (Journal of the American Statistical Association, 1946).', text: 'Counts how many paired differences are positive among the n′ non-zero differences and compares this with a binomial distribution with p = 1/2 (exact). It assumes only independent pairs and uses only the direction of each difference, so it is very robust but less powerful than the Wilcoxon test.' },
      ar: { title: 'اختبار الإشارة', origin: 'أقدم اختبار للدلالة: استدلّ جون أربوثنوت (Philosophical Transactions، 1710) بـ 82 سنة متتالية زاد فيها عدد المعمَّدين من الذكور على الإناث في لندن على أن هذه الزيادة لا ترجع إلى المصادفة، ثم صاغ ويلفريد ج. ديكسون وألكسندر م. مود اختبار الإشارة الحديث (مجلة الجمعية الإحصائية الأمريكية، 1946).', text: 'يعدّ الفروق المزدوجة الموجبة من بين الفروق غير الصفرية وعددها n′، ويقارن العدد بتوزيع ذي الحدين باحتمال 1/2 (حساباً دقيقاً). لا يفترض إلا استقلال الأزواج ولا يستعمل إلا اتجاه كل فرق، فهو شديد المتانة لكنه أضعف قوةً من اختبار ويلكوكسون.' }
    },
    {
      id: 'stanova1', refs: ['fisher1925'],
      formula: M(row(mi('F'), eq, fr(row(sb(mi('MS'), mi('between')), ''), sb(mi('MS'), mi('within'))), eq, fr(row(SUM(row(mi('i'), eq, mn(1)), k), ni(mi('i')), sp(par(ybi(mi('i')), mi_, yb), mn(2)), mo('/'), par(k, mi_, mn(1))), row(SUMu(mi('i')), SUMu(mi('j')), sp(par(sb(mi('y'), row(mi('i'), mi('j'))), mi_, ybi(mi('i'))), mn(2)), mo('/'), par(N, mi_, k))), cm, gap, mi('F'), mo('∼'), sb(mi('F'), row(k, mi_, mn(1), cm, N, mi_, k)))),
      en: { title: 'One-way analysis of variance (ANOVA)', origin: 'Developed by Ronald A. Fisher at the Rothamsted Experimental Station and set out in Statistical Methods for Research Workers (1925); the F ratio was named in his honour by George W. Snedecor (1934).', text: 'Tests whether k group means are all equal by comparing the variance between group means with the variance within groups. Assumes independence, normal residuals and equal group variances. With unequal variances use the Welch or Brown–Forsythe versions; after a significant F, post hoc tests locate the differences.' },
      ar: { title: 'تحليل التباين الأحادي (ANOVA)', origin: 'طوّره رونالد أ. فيشر في محطة روثامستد التجريبية وعرضه في كتابه Statistical Methods for Research Workers عام 1925، وسمّى جورج و. سنيدكور النسبة F تكريماً له (1934).', text: 'يختبر هل تتساوى متوسطات k مجموعة بمقارنة التباين بين متوسطات المجموعات بالتباين داخلها. ويفترض الاستقلال واعتدالية البواقي وتساوي تباينات المجموعات. فإن اختلفت التباينات فاستعمل صيغتي ويلش أو براون–فورسايث، وإذا دلّت F فالاختبارات البَعدية تحدّد مواضع الفروق.' }
    },
    {
      id: 'stwelchanova', refs: ['welch1951'],
      formula: M(row(sb(mi('w'), mi('i')), eq, fr(ni(mi('i')), s2(mi('i'))), cm, gap, mi('W'), eq, SUMu(mi('i')), sb(mi('w'), mi('i')), cm, gap, sb(yb, mi('w')), eq, fr(row(SUMu(mi('i')), sb(mi('w'), mi('i')), ybi(mi('i'))), mi('W')), cm, gap, mi('Λ'), eq, SUMu(mi('i')), fr(sp(par(mn(1), mi_, sb(mi('w'), mi('i')), mo('/'), mi('W')), mn(2)), row(ni(mi('i')), mi_, mn(1)))),
        row(sb(mi('F'), mi('W')), eq, fr(row(SUMu(mi('i')), sb(mi('w'), mi('i')), sp(par(ybi(mi('i')), mi_, sb(yb, mi('w'))), mn(2)), mo('/'), par(k, mi_, mn(1))), row(mn(1), pl, fr(row(mn(2), par(k, mi_, mn(2))), row(sp(k, mn(2)), mi_, mn(1))), mi('Λ'))), cm, gap, sb(nu, mn(1)), eq, k, mi_, mn(1), cm, gap, sb(nu, mn(2)), eq, fr(row(sp(k, mn(2)), mi_, mn(1)), row(mn(3), mi('Λ'))))),
      en: { title: 'Welch’s ANOVA', origin: 'Bernard L. Welch, “On the comparison of several mean values: An alternative approach”, Biometrika (1951), generalising his 1947 two-sample solution.', text: 'Tests the equality of k means without assuming equal variances by weighting each group by n/s². Recommended when Levene’s test is significant or group sizes differ strongly. Post hoc comparisons should then use Games–Howell.' },
      ar: { title: 'تحليل التباين لويلش', origin: 'برنارد ل. ويلش، «في مقارنة عدة متوسطات: مقاربة بديلة»، مجلة Biometrika عام 1951، تعميماً لحلّه لحالة العيّنتين عام 1947.', text: 'يختبر تساوي k متوسطاً دون افتراض تساوي التباينات، بوزن كل مجموعة بالمقدار n/s². ويوصى به إذا دلّ اختبار ليفين أو اختلفت أحجام المجموعات اختلافاً كبيراً، وتكون المقارنات البَعدية عندئذٍ بطريقة غيمز–هاول.' }
    },
    {
      id: 'stbfanova', refs: ['brown1974mean'],
      formula: M(row(sp(mi('F'), mo('*')), eq, fr(row(SUMu(mi('i')), ni(mi('i')), sp(par(ybi(mi('i')), mi_, yb), mn(2))), row(SUMu(mi('i')), sb(mi('c'), mi('i')))), cm, gap, sb(mi('c'), mi('i')), eq, par(mn(1), mi_, fr(ni(mi('i')), N)), s2(mi('i')), cm, gap, sb(nu, mn(2)), eq, fr(sp(par(SUMu(mi('i')), sb(mi('c'), mi('i'))), mn(2)), row(SUMu(mi('i')), fr(ss(mi('c'), mi('i'), mn(2)), row(ni(mi('i')), mi_, mn(1))))))),
      en: { title: 'Brown–Forsythe test of equal means', origin: 'Morton B. Brown and Alan B. Forsythe, “The small sample behavior of some statistics which test the equality of several means”, Technometrics (1974).', text: 'An F* statistic whose denominator weights each group variance by (1 − nᵢ/N), with Satterthwaite-type degrees of freedom; robust to unequal variances like Welch’s ANOVA. (Not to be confused with the Brown–Forsythe test of equal variances.)' },
      ar: { title: 'اختبار براون–فورسايث لتساوي المتوسطات', origin: 'مورتن ب. براون وآلن ب. فورسايث، «سلوك العيّنات الصغيرة لبعض الإحصاءات التي تختبر تساوي عدة متوسطات»، مجلة Technometrics عام 1974.', text: 'إحصاءة F* يزن مقامُها تباينَ كل مجموعة بالمقدار (1 − nᵢ/N)، بدرجات حرية من نوع ساترثويت، وهي متينة أمام اختلاف التباينات كتحليل التباين لويلش. (ولا تُخلط باختبار براون–فورسايث لتساوي التباينات.)' }
    },
    {
      id: 'stfactorial', refs: ['fisher1925', 'yates1934', 'langsrud2003'],
      formula: M(row(sb(mi('y'), row(mi('i'), mi('j'), mi('k'))), eq, mi('μ'), pl, sb(mi('α'), mi('i')), pl, sb(mi('β'), mi('j')), pl, sb(par(mi('α'), mi('β')), row(mi('i'), mi('j'))), pl, sb(mi('ε'), row(mi('i'), mi('j'), mi('k'))), cm, gap, SUMu(mi('i')), sb(mi('α'), mi('i')), eq, SUMu(mi('j')), sb(mi('β'), mi('j')), eq, mn(0)),
        row(sb(mi('SS'), mi('III')), par(mi('T')), eq, ss(hat(mi('b')), mi('T'), mi('⊤')), sp(brk(sb(sp(par(sp(mi('X'), mi('⊤')), mi('X')), row(mi_, mn(1))), row(mi('T'), mi('T')))), row(mi_, mn(1))), sb(hat(mi('b')), mi('T')), cm, gap, sb(mi('SS'), mi('II')), par(mi('T')), eq, mi('RSS'), par(sb(mi('M'), mi('T'))), mi_, mi('RSS'), par(sb(mi('M'), mi('T')), pl, mi('T'))),
        row(sb(mi('F'), mi('T')), eq, fr(row(sb(mi('SS'), mi('T')), mo('/'), sb(mi('df'), mi('T'))), row(sb(mi('SS'), mi('E')), mo('/'), sb(mi('df'), mi('E')))))),
      en: { title: 'Factorial ANOVA and types of sums of squares', origin: 'Fisher introduced factorial experiments and their analysis of variance in the 1920s (Statistical Methods for Research Workers, 1925; The Design of Experiments, 1935); Frank Yates (Journal of the American Statistical Association, 1934) gave the “weighted squares of means” analysis of unbalanced tables that underlies Type III sums of squares, and Øyvind Langsrud (2003) argued for Type II.', text: 'Tests main effects and interactions of two or more crossed factors. With unequal cell sizes the sums of squares depend on the order or type: Type I is sequential, Type II adjusts each term for all terms that do not contain it (respects marginality), Type III adjusts each term for all others using sum-to-zero (effect) coding; Type III is the default of JASP and SPSS. In balanced designs all three coincide.' },
      ar: { title: 'تحليل التباين العاملي وأنواع مجاميع المربعات', origin: 'أدخل فيشر التجارب العاملية وتحليل تباينها في عشرينيات القرن العشرين (Statistical Methods for Research Workers، 1925؛ The Design of Experiments، 1935)، وقدّم فرانك ييتس (مجلة الجمعية الإحصائية الأمريكية، 1934) تحليل «المربعات الموزونة للمتوسطات» للجداول غير المتوازنة الذي تقوم عليه مجاميع المربعات من النوع الثالث، وانتصر أويفيند لانغسرود (2003) للنوع الثاني.', text: 'يختبر الآثار الرئيسة والتفاعلات لعاملين متقاطعين أو أكثر. وإذا اختلفت أحجام الخلايا تعتمد مجاميع المربعات على الترتيب أو النوع: النوع الأول تتابعي، والثاني يعدّل كل حدٍّ بالحدود التي لا تتضمنه (فيحترم الهامشية)، والثالث يعدّل كل حدٍّ بجميع الحدود الأخرى بترميز الأثر (مجموعه صفر)، وهو الافتراضي في JASP وSPSS. وفي التصاميم المتوازنة تتطابق الأنواع الثلاثة.' }
    },
    {
      id: 'stancova', refs: ['fisher1932', 'searle1980'],
      formula: M(row(sb(mi('y'), row(mi('i'), mi('j'))), eq, mi('μ'), pl, sb(mi('α'), mi('i')), pl, mi('β'), par(sb(mi('x'), row(mi('i'), mi('j'))), mi_, xb), pl, sb(mi('ε'), row(mi('i'), mi('j')))),
        row(sb(yb, row(mi('i'), cm, mi('adj'))), eq, ybi(mi('i')), mi_, sb(mi('b'), mi('w')), par(sb(xb, mi('i')), mi_, xb), cm, gap, sb(mi('b'), mi('w')), eq, fr(row(SUMu(mi('i')), SUMu(mi('j')), par(sb(mi('x'), row(mi('i'), mi('j'))), mi_, sb(xb, mi('i'))), par(sb(mi('y'), row(mi('i'), mi('j'))), mi_, ybi(mi('i')))), row(SUMu(mi('i')), SUMu(mi('j')), sp(par(sb(mi('x'), row(mi('i'), mi('j'))), mi_, sb(xb, mi('i'))), mn(2)))))),
      en: { title: 'Analysis of covariance (ANCOVA)', origin: 'R. A. Fisher added the analysis of covariance to the fourth edition of Statistical Methods for Research Workers (1932), to remove the influence of a concomitant variable from agricultural yield comparisons.', text: 'Compares group means of a dependent variable after adjusting for one or more continuous covariates (a linear model with factors and covariates, Type III sums of squares by default). Additional assumptions: a linear covariate effect and homogeneous regression slopes across groups (checked by testing the factor × covariate interaction). Adjusted (estimated marginal) means are evaluated at the covariate means.' },
      ar: { title: 'تحليل التغاير (ANCOVA)', origin: 'أضاف ر. أ. فيشر تحليل التغاير إلى الطبعة الرابعة من Statistical Methods for Research Workers عام 1932، لإزالة أثر متغير مصاحب من مقارنات المحاصيل الزراعية.', text: 'يقارن متوسطات مجموعات متغير تابع بعد ضبط أثر متغير مصاحب متصل أو أكثر (نموذج خطي يجمع العوامل والمتغيرات المصاحبة، بمجاميع مربعات من النوع الثالث افتراضياً). وافتراضاته الإضافية: خطية أثر المتغير المصاحب، وتجانس ميول الانحدار بين المجموعات (ويُفحص باختبار تفاعل العامل مع المتغير المصاحب). وتُحسب المتوسطات المعدَّلة (الهامشية المقدَّرة) عند متوسطات المتغيرات المصاحبة.' }
    },
    {
      id: 'stemm', refs: ['searle1980'],
      formula: M(row(mi('EMM'), eq, sp(mi('ℓ'), mi('⊤')), hat(mi('b')), cm, gap, mi('SE'), eq, sq(row(sp(mi('ℓ'), mi('⊤')), sp(par(sp(mi('X'), mi('⊤')), mi('X')), row(mi_, mn(1))), mi('ℓ'), tm, sb(mi('MS'), mi('E')))), cm, gap, mi('t'), eq, fr(row(sp(mi('c'), mi('⊤')), hat(mi('b'))), sq(row(sp(mi('c'), mi('⊤')), sp(par(sp(mi('X'), mi('⊤')), mi('X')), row(mi_, mn(1))), mi('c'), tm, sb(mi('MS'), mi('E'))))))),
      en: { title: 'Estimated marginal means', origin: 'Shayle R. Searle, F. Michael Speed and George A. Milliken defined population marginal means (the “least-squares means” of SAS) in The American Statistician (1980).', text: 'The mean of each factor level predicted by the fitted model, averaging the other factors’ levels with equal weights and holding covariates at their means; they do not depend on the unequal cell sizes. Post hoc comparisons in ANOVA/ANCOVA compare these means with the contrast c = ℓa − ℓb and the model’s error term.' },
      ar: { title: 'المتوسطات الهامشية المقدَّرة', origin: 'عرّف شيل ر. سيرل وف. مايكل سبيد وجورج أ. ميليكن المتوسطات الهامشية للمجتمع («متوسطات المربعات الصغرى» في SAS) في مجلة The American Statistician عام 1980.', text: 'متوسط كل مستوى من مستويات العامل كما يتنبأ به النموذج الموفَّق، بأخذ متوسط مستويات العوامل الأخرى بأوزان متساوية وتثبيت المتغيرات المصاحبة عند متوسطاتها، فلا تتأثر بعدم تساوي أحجام الخلايا. وتقارن الاختبارات البَعدية في تحليل التباين والتغاير بين هذه المتوسطات بالتباين c = ℓa − ℓb وحدِّ الخطأ في النموذج.' }
    },
    {
      id: 'steffect', refs: ['cohen1973', 'hays1963', 'olejnik2003'],
      formula: M(row(sp(mi('η'), mn(2)), eq, fr(sb(mi('SS'), mi('effect')), sb(mi('SS'), mi('total'))), cm, gap, ss(mi('η'), mi('p'), mn(2)), eq, fr(sb(mi('SS'), mi('effect')), row(sb(mi('SS'), mi('effect')), pl, sb(mi('SS'), mi('error')))), cm, gap, sp(mi('ω'), mn(2)), eq, fr(row(sb(mi('SS'), mi('effect')), mi_, sb(mi('df'), mi('effect')), sb(mi('MS'), mi('error'))), row(sb(mi('SS'), mi('total')), pl, sb(mi('MS'), mi('error'))))),
        row(ss(mi('η'), mi('G'), mn(2)), eq, fr(sb(mi('SS'), mi('effect')), row(sb(mi('SS'), mi('effect')), pl, SUMu(mi('all error terms')), sb(mi('SS'), mi('error')))))),
      en: { title: 'Effect sizes in ANOVA: η², partial η², ω², generalised η²', origin: 'The correlation ratio η goes back to Karl Pearson (1905); Jacob Cohen (Educational and Psychological Measurement, 1973) discussed partial η²; William L. Hays proposed the less biased ω² in Statistics for Psychologists (1963); Stephen Olejnik and James Algina (Psychological Methods, 2003) introduced generalised η² to compare designs with repeated measures.', text: 'η² is the share of the total variance explained by an effect; partial η² relates the effect to effect + its error only (it is what SPSS calls “partial eta squared”); ω² corrects η² for its positive bias. In repeated-measures designs generalised η² (η²G) is comparable across between- and within-subjects designs.' },
      ar: { title: 'مقادير الأثر في تحليل التباين: η² وη² الجزئي وω² وη² المعمَّم', origin: 'ترجع نسبة الارتباط η إلى كارل بيرسون (1905)، وناقش جيكوب كوهين η² الجزئي (Educational and Psychological Measurement، 1973)، واقترح وليام ل. هايز المقياس الأقل تحيّزاً ω² في كتابه Statistics for Psychologists عام 1963، وقدّم ستيفن أولينيك وجيمس ألجينا η² المعمَّم (Psychological Methods، 2003) للمقارنة بين التصاميم ذات القياسات المتكررة.', text: 'η² نسبة التباين الكلي التي يفسّرها الأثر، وη² الجزئي ينسب الأثر إلى مجموع الأثر وخطئه فقط (وهو ما يسميه SPSS «مربع إيتا الجزئي»)، وω² يصحّح التحيّز الموجب في η². وفي تصاميم القياسات المتكررة يكون η² المعمَّم (η²G) قابلاً للمقارنة بين تصاميم ما بين الأفراد وداخلهم.' }
    },
    {
      id: 'sttukey', refs: ['tukey1949', 'kramer1956', 'copenhaver1988'],
      formula: M(row(mi('q'), eq, fr(abs(ybi(mi('i')), mi_, ybi(mi('j'))), sq(row(fr(sb(mi('MS'), mi('E')), mn(2)), par(fr(mn(1), ni(mi('i'))), pl, fr(mn(1), ni(mi('j'))))))), eq, sq(mn(2)), abs(mi('t')), cm, gap, mi('p'), eq, mi('P'), par(sb(mi('Q'), row(k, cm, nu)), mo('≥'), mi('q'))),
        row(par(ybi(mi('i')), mi_, ybi(mi('j'))), mo('±'), fr(sb(mi('q'), row(mn(1), mi_, mi('α'), mo(';'), k, cm, nu)), sq(mn(2))), tm, mi('SE'))),
      en: { title: 'Tukey’s HSD (honestly significant difference)', origin: 'John W. Tukey developed the studentized-range procedure for all pairwise comparisons (Biometrics, 1949, and his 1953 unpublished manuscript “The problem of multiple comparisons”); Clyde Y. Kramer (Biometrics, 1956) extended it to unequal group sizes (Tukey–Kramer). The studentized range distribution is computed with the algorithm of Copenhaver and Holland (1988), as in R’s ptukey.', text: 'Compares all pairs of k means while controlling the familywise error rate exactly for equal n (conservatively otherwise), using the distribution of the range of k studentized means. Simultaneous confidence intervals are given. Assumes equal variances; otherwise use Games–Howell.' },
      ar: { title: 'اختبار توكي HSD (الفرق الدالّ حقاً)', origin: 'طوّر جون و. توكي إجراء المدى المعيَّر لجميع المقارنات الزوجية (Biometrics، 1949، ومخطوطته غير المنشورة «مسألة المقارنات المتعددة» عام 1953)، ومدّه كلايد ي. كرامر (Biometrics، 1956) إلى المجموعات غير المتساوية الأحجام (توكي–كرامر). ويُحسب توزيع المدى المعيَّر بخوارزمية كوبنهافر وهولاند (1988) كما في الدالة ptukey في R.', text: 'يقارن جميع أزواج المتوسطات الـ k مع ضبط معدل الخطأ العائلي ضبطاً تاماً عند تساوي الأحجام (ومحافظاً في غيرها)، اعتماداً على توزيع مدى k متوسطاً معيَّراً، ويعرض فترات ثقة متزامنة. ويفترض تساوي التباينات، وإلا فاستعمل غيمز–هاول.' }
    },
    {
      id: 'stbonfholm', refs: ['dunn1961', 'holm1979'],
      formula: M(row(ss(mi('p'), mi('i'), mi('Bonf')), eq, mi('min'), par(mn(1), cm, mi('m'), sb(mi('p'), mi('i'))), cm, gap, ss(mi('p'), par(mi('i')), mi('Holm')), eq, sb(mi('max'), row(mi('j'), mo('≤'), mi('i'))), mi('min'), par(mn(1), cm, par(mi('m'), mi_, mi('j'), pl, mn(1)), sb(mi('p'), par(mi('j')))))),
      en: { title: 'Bonferroni and Holm corrections', origin: 'Based on Carlo Emilio Bonferroni’s inequalities (1936) and applied to multiple comparisons by Olive Jean Dunn (Journal of the American Statistical Association, 1961); Sture Holm’s sequentially rejective step-down method appeared in the Scandinavian Journal of Statistics (1979).', text: 'Adjust the p-values of m comparisons so that the familywise Type I error rate stays at α. Bonferroni multiplies each p by m; Holm orders the p-values and multiplies the j-th smallest by (m − j + 1), which is uniformly more powerful and equally valid under any dependence.' },
      ar: { title: 'تصحيحا بونفيروني وهولم', origin: 'يقوم على متباينات كارلو إميليو بونفيروني (1936)، وطبّقته أوليف جين دَن على المقارنات المتعددة (مجلة الجمعية الإحصائية الأمريكية، 1961)، أما طريقة ستوره هولم التتابعية التنازلية فنُشرت في Scandinavian Journal of Statistics عام 1979.', text: 'يعدّلان القيم الاحتمالية لـ m مقارنة حتى يبقى معدل الخطأ العائلي من النوع الأول عند α. يضرب بونفيروني كل قيمة في m، ويرتّب هولم القيم تصاعدياً ويضرب القيمة ذات الترتيب j في (m − j + 1)، فهو أقوى دائماً وصحيح بالقدر نفسه تحت أي اعتماد بين الاختبارات.' }
    },
    {
      id: 'stscheffe', refs: ['scheffe1953'],
      formula: M(row(sb(mi('F'), mi('S')), eq, fr(sp(mi('t'), mn(2)), row(k, mi_, mn(1))), eq, fr(sp(par(ybi(mi('i')), mi_, ybi(mi('j'))), mn(2)), row(par(k, mi_, mn(1)), sb(mi('MS'), mi('E')), par(fr(mn(1), ni(mi('i'))), pl, fr(mn(1), ni(mi('j')))))), cm, gap, mi('p'), eq, mi('P'), par(sb(mi('F'), row(k, mi_, mn(1), cm, nu)), mo('≥'), sb(mi('F'), mi('S'))))),
      en: { title: 'Scheffé’s method', origin: 'Henry Scheffé, “A method for judging all contrasts in the analysis of variance”, Biometrika (1953).', text: 'Controls the familywise error rate over all possible contrasts among k means (not only pairwise ones) by referring t²/(k − 1) to the F distribution of the overall test. It is the most conservative of the classical pairwise procedures but never contradicts the omnibus F test.' },
      ar: { title: 'طريقة شيفيه', origin: 'هنري شيفيه، «طريقة للحكم على جميع المقارنات في تحليل التباين»، مجلة Biometrika عام 1953.', text: 'يضبط معدل الخطأ العائلي على جميع المقارنات الممكنة بين k متوسطاً (لا الزوجية وحدها) بإحالة المقدار t²/(k − 1) إلى توزيع F للاختبار الكلي. وهو أكثر الإجراءات الزوجية التقليدية تحفّظاً، لكنه لا يناقض اختبار F الكلي أبداً.' }
    },
    {
      id: 'stgameshowell', refs: ['games1976'],
      formula: M(row(mi('t'), eq, fr(row(ybi(mi('i')), mi_, ybi(mi('j'))), sq(row(fr(s2(mi('i')), ni(mi('i'))), pl, fr(s2(mi('j')), ni(mi('j')))))), cm, gap, sb(nu, row(mi('i'), mi('j'))), eq, fr(sp(par(fr(s2(mi('i')), ni(mi('i'))), pl, fr(s2(mi('j')), ni(mi('j')))), mn(2)), row(fr(sp(par(s2(mi('i')), mo('/'), ni(mi('i'))), mn(2)), row(ni(mi('i')), mi_, mn(1))), pl, fr(sp(par(s2(mi('j')), mo('/'), ni(mi('j'))), mn(2)), row(ni(mi('j')), mi_, mn(1))))), cm, gap, mi('p'), eq, mi('P'), par(sb(mi('Q'), row(k, cm, sb(nu, row(mi('i'), mi('j'))))), mo('≥'), sq(mn(2)), abs(mi('t'))))),
      en: { title: 'Games–Howell post hoc test', origin: 'Paul A. Games and John F. Howell, Journal of Educational Statistics (1976), from a Monte Carlo comparison of procedures for unequal sample sizes and variances.', text: 'Pairwise comparisons that do not assume equal variances or equal group sizes: each pair uses its own Welch standard error and degrees of freedom, referred to the studentized range distribution. The recommended companion of Welch’s ANOVA.' },
      ar: { title: 'اختبار غيمز–هاول البَعدي', origin: 'بول أ. غيمز وجون ف. هاول، مجلة Journal of Educational Statistics عام 1976، بعد مقارنة بمحاكاة مونت كارلو بين الإجراءات حين تختلف أحجام العيّنات وتبايناتها.', text: 'مقارنات زوجية لا تفترض تساوي التباينات ولا تساوي أحجام المجموعات: يستعمل كل زوج خطأه المعياري ودرجات حريته على طريقة ويلش، ويُحال إلى توزيع المدى المعيَّر. وهو الرفيق الموصى به لتحليل التباين لويلش.' }
    },
    {
      id: 'strmanova', refs: ['fisher1925', 'box1954', 'greenhouse1959'],
      formula: M(row(sb(mi('F'), mi('A')), eq, fr(row(sb(mi('SS'), mi('A')), mo('/'), par(mi('a'), mi_, mn(1))), row(sb(mi('SS'), row(mi('A'), mo('×'), mi('S'))), mo('/'), brk(par(mi('a'), mi_, mn(1)), par(n, mi_, mi('g'))))), cm, gap, sb(mi('SS'), mi('A')), eq, mi('tr'), par(sb(mi('H'), mi('A'))), cm, gap, sb(mi('SS'), row(mi('A'), mo('×'), mi('S'))), eq, mi('tr'), par(sb(mi('E'), mi('A')))),
        row(sb(mi('Z'), mi('A')), eq, mi('Y'), sb(mi('C'), mi('A')), cm, gap, sp(sb(mi('C'), mi('A')), mi('⊤')), sb(mi('C'), mi('A')), eq, mi('I'))),
      en: { title: 'Repeated-measures ANOVA', origin: 'The univariate “split-plot” analysis of repeated measurements goes back to Fisher’s agricultural designs (1925); George E. P. Box (Annals of Mathematical Statistics, 1954) showed how violations of sphericity bias its F test, and Greenhouse and Geisser (Psychometrika, 1959) made the correction practical.', text: 'Tests within-subjects factors (measurements taken on the same cases, entered as columns in wide format; with two within factors the last factor varies fastest), optionally crossed with a between-subjects factor (mixed design). Each within effect is tested on orthonormal contrasts Z = YC of the repeated measures against its own effect × subjects error term. Requires sphericity (see Mauchly’s test) or a Greenhouse–Geisser / Huynh–Feldt correction.' },
      ar: { title: 'تحليل التباين للقياسات المتكررة', origin: 'يرجع التحليل أحادي المتغير «للقِطَع المنشقّة» للقياسات المتكررة إلى تصاميم فيشر الزراعية (1925)، وبيّن جورج إ. ب. بوكس (Annals of Mathematical Statistics، 1954) كيف يحرف الإخلالُ بالكروية اختبارَ F، وجعل غرينهاوس وغايسر (Psychometrika، 1959) التصحيح ميسوراً.', text: 'يختبر العوامل داخل الأفراد (قياسات على الحالات نفسها، تُدخل أعمدةً بالصيغة العريضة؛ ومع عاملين داخليين يتغيّر العامل الأخير أسرع)، مع عامل بين الأفراد عند الطلب (تصميم مختلط). ويُختبر كل أثر داخلي على تباينات متعامدة معيارية Z = YC للقياسات المتكررة مقابل حدّ خطئه الخاص (الأثر × الأفراد). ويتطلب الكروية (انظر اختبار موشلي) أو تصحيح غرينهاوس–غايسر أو هوين–فيلدت.' }
    },
    {
      id: 'stmauchly', refs: ['mauchly1940'],
      formula: M(row(mi('W'), eq, fr(row(mi('det'), par(mi('S'))), sp(brk(mi('tr'), par(mi('S')), mo('/'), mi('p')), mi('p'))), cm, gap, mi('S'), eq, sp(mi('C'), mi('⊤')), sb(mi('Σ'), mi('Y')), mi('C')),
        row(sp(mi('χ'), mn(2)), eq, mi_, par(nu, mi_, fr(row(mn(2), sp(mi('p'), mn(2)), pl, mi('p'), pl, mn(2)), row(mn(6), mi('p')))), mi('ln'), mi('W'), cm, gap, mi('df'), eq, fr(row(mi('p'), par(mi('p'), pl, mn(1))), mn(2)), mi_, mn(1))),
      en: { title: 'Mauchly’s test of sphericity', origin: 'John W. Mauchly, “Significance test for sphericity of a normal n-variate distribution”, The Annals of Mathematical Statistics (1940) — the same Mauchly who co-designed the ENIAC computer.', text: 'Tests H0: the covariance matrix of the orthonormal contrasts is proportional to the identity (sphericity: equal variances of all pairwise differences). p is the number of contrasts (levels − 1) and ν the error degrees of freedom; the p-value adds the second-order term of the asymptotic expansion, as in R’s mauchly.test. It is only defined for effects with three or more levels and has low power in small samples, so many authors apply the Greenhouse–Geisser correction whenever ε is clearly below 1.' },
      ar: { title: 'اختبار موشلي للكروية', origin: 'جون و. موشلي، «اختبار الدلالة لكروية التوزيع الطبيعي ذي n متغيراً»، مجلة The Annals of Mathematical Statistics عام 1940، وهو موشلي نفسه الذي شارك في تصميم الحاسوب ENIAC.', text: 'يختبر الفرضية الصفرية: مصفوفة تغاير التباينات المتعامدة المعيارية متناسبة مع مصفوفة الوحدة (الكروية: تساوي تباينات جميع الفروق الزوجية). وp عدد التباينات (عدد المستويات ناقص واحد)، وν درجات حرية الخطأ، وتضيف القيمة الاحتمالية حدّ الرتبة الثانية من المفكوك التقاربي كما في mauchly.test في R. ولا يُعرَّف إلا للآثار ذات ثلاثة مستويات فأكثر، وقوته ضعيفة في العيّنات الصغيرة، فيطبّق كثيرون تصحيح غرينهاوس–غايسر كلما نقص ε عن 1 نقصاً واضحاً.' }
    },
    {
      id: 'stsphericity', refs: ['greenhouse1959', 'huynh1976', 'lecoutre1991', 'box1954'],
      formula: M(row(sb(hat(mi('ε')), mi('GG')), eq, fr(sp(par(mi('tr'), mi('S')), mn(2)), row(mi('p'), tm, mi('tr'), par(sp(mi('S'), mn(2))))), cm, gap, sb(tld(mi('ε')), mi('HF')), eq, mi('min'), par(mn(1), cm, fr(row(par(nu, pl, mn(1)), mi('p'), sb(hat(mi('ε')), mi('GG')), mi_, mn(2)), row(mi('p'), par(nu, mi_, mi('p'), sb(hat(mi('ε')), mi('GG'))))))),
        row(sb(mi('df'), mn(1)), mo('′'), eq, mi('ε'), sb(mi('df'), mn(1)), cm, gap, sb(mi('df'), mn(2)), mo('′'), eq, mi('ε'), sb(mi('df'), mn(2)), cm, gap, fr(mn(1), mi('p')), mo('≤'), mi('ε'), mo('≤'), mn(1))),
      en: { title: 'Greenhouse–Geisser and Huynh–Feldt corrections', origin: 'Box (1954) introduced the ε adjustment of the degrees of freedom; Samuel W. Greenhouse and Seymour Geisser (Psychometrika, 1959) proposed estimating it from the sample (ε̂), Huynh Huynh and Leonard S. Feldt (Journal of Educational Statistics, 1976) gave the less conservative ε̃, and Bruno Lecoutre (1991) corrected ε̃ for designs with several groups (the version used by R, JASP and here).', text: 'When sphericity fails, the F statistic is kept but both degrees of freedom are multiplied by ε (1/p ≤ ε ≤ 1, where 1/p is the lower bound). Greenhouse–Geisser tends to be conservative when ε > .75, in which case Huynh–Feldt is often preferred.' },
      ar: { title: 'تصحيحا غرينهاوس–غايسر وهوين–فيلدت', origin: 'أدخل بوكس (1954) تعديل درجات الحرية بالمعامل ε، واقترح صموئيل و. غرينهاوس وسيمور غايسر (Psychometrika، 1959) تقديره من العيّنة (ε̂)، وقدّم هوين هوين وليونارد س. فيلدت (Journal of Educational Statistics، 1976) المقدّر الأقل تحفظاً ε̃، وصحّح برونو لوكوتر (1991) هذا المقدّر للتصاميم ذات المجموعات المتعددة (وهي الصيغة المستعملة في R وJASP وهنا).', text: 'إذا اختلّت الكروية تبقى إحصاءة F كما هي، وتُضرب درجتا الحرية كلتاهما في ε (حيث 1/p ≤ ε ≤ 1، و1/p هو الحد الأدنى). ويميل تصحيح غرينهاوس–غايسر إلى التحفظ إذا زاد ε على 0.75، فيُفضَّل عندئذٍ في الغالب تصحيح هوين–فيلدت.' }
    },
    {
      id: 'stmanova', refs: ['wilks1932', 'lawley1938', 'hotelling1951', 'roy1953', 'pillai1955', 'rao1951'],
      formula: M(row(sb(mi('λ'), mi('i')), mo(':'), mt(' eigenvalues of '), sp(mi('E'), row(mi_, mn(1))), mi('H'), cm, gap, mi('V'), eq, SUMu(mi('i')), fr(sb(mi('λ'), mi('i')), row(mn(1), pl, sb(mi('λ'), mi('i')))), cm, gap, mi('Λ'), eq, PROD(mi('i')), fr(mn(1), row(mn(1), pl, sb(mi('λ'), mi('i')))), cm, gap, mi('T'), eq, SUMu(mi('i')), sb(mi('λ'), mi('i')), cm, gap, mi('θ'), eq, sb(mi('λ'), mi('max'))),
        row(sb(mi('F'), mi('V')), eq, fr(row(mn(2), mi('n'), pl, mi('s'), pl, mn(1)), row(mn(2), mi('m'), pl, mi('s'), pl, mn(1))), fr(mi('V'), row(mi('s'), mi_, mi('V'))), cm, gap, mi('s'), eq, mi('min'), par(mi('p'), cm, mi('q')), cm, gap, mi('m'), eq, fr(row(abs(mi('p'), mi_, mi('q')), mi_, mn(1)), mn(2)), cm, gap, mi('n'), eq, fr(row(sb(nu, mi('E')), mi_, mi('p'), mi_, mn(1)), mn(2)))),
      en: { title: 'MANOVA: Pillai, Wilks, Hotelling–Lawley and Roy', origin: 'Samuel S. Wilks introduced the likelihood-ratio criterion Λ (Biometrika, 1932); Derrick N. Lawley (Biometrika, 1938) and Harold Hotelling (Berkeley Symposium, 1951) the trace T; Samarendra N. Roy (Annals of Mathematical Statistics, 1953) the largest-root criterion; K. C. Sreedharan Pillai (Annals of Mathematical Statistics, 1955) the trace V. The F approximations follow C. R. Rao (1951) and R’s summary.manova.', text: 'Tests group (and interaction) effects on several dependent variables jointly. H is the hypothesis and E the error SSCP matrix (Type III, effect coding); p is the number of dependent variables and q the effect degrees of freedom. Pillai’s trace is the most robust to violations of homogeneity of covariance matrices (Box’s M); Roy’s largest root gives an upper bound for F. Assumes multivariate normal residuals.' },
      ar: { title: 'تحليل التباين المتعدد (MANOVA): بيلاي وويلكس وهوتيلنغ–لولي وروي', origin: 'قدّم صموئيل س. ويلكس معيار نسبة الإمكان Λ (Biometrika، 1932)، وديريك ن. لولي (Biometrika، 1938) وهارولد هوتيلنغ (ندوة بيركلي، 1951) معيار الأثر T، وسامارندرا ن. روي (Annals of Mathematical Statistics، 1953) معيار الجذر الأكبر، وك. س. سريذاران بيلاي (Annals of Mathematical Statistics، 1955) معيار الأثر V. وتتبع تقريبات F صيغ س. ر. راو (1951) والدالة summary.manova في R.', text: 'يختبر آثار المجموعات (والتفاعلات) على عدة متغيرات تابعة معاً. وH مصفوفة مجاميع المربعات والضرب المتقاطع للفرضية وE مصفوفة الخطأ (النوع الثالث، بترميز الأثر)، وp عدد المتغيرات التابعة وq درجات حرية الأثر. وأثر بيلاي أكثر المعايير متانة أمام عدم تجانس مصفوفات التغاير (اختبار بوكس M)، ويعطي الجذر الأكبر لروي حداً أعلى لـ F. ويفترض اعتدالية البواقي المتعددة.' }
    },
    {
      id: 'stboxm', refs: ['box1949'],
      formula: M(row(mi('M'), eq, par(N, mi_, mi('g')), mi('ln'), abs(sb(mi('S'), mi('p'))), mi_, SUMu(mi('i')), par(ni(mi('i')), mi_, mn(1)), mi('ln'), abs(sb(mi('S'), mi('i')))),
        row(sp(mi('χ'), mn(2)), eq, mi('M'), par(mn(1), mi_, mi('c')), cm, gap, mi('c'), eq, fr(row(mn(2), sp(mi('p'), mn(2)), pl, mn(3), mi('p'), mi_, mn(1)), row(mn(6), par(mi('p'), pl, mn(1)), par(mi('g'), mi_, mn(1)))), par(SUMu(mi('i')), fr(mn(1), row(ni(mi('i')), mi_, mn(1))), mi_, fr(mn(1), row(N, mi_, mi('g')))), cm, gap, mi('df'), eq, fr(row(mi('p'), par(mi('p'), pl, mn(1)), par(mi('g'), mi_, mn(1))), mn(2)))),
      en: { title: 'Box’s M test of equal covariance matrices', origin: 'George E. P. Box, “A general distribution theory for a class of likelihood criteria”, Biometrika (1949).', text: 'Tests whether the covariance matrices of the dependent variables are equal across the g groups (cells), an assumption of MANOVA. It is very sensitive to non-normality and to large samples, so a strict α (e.g. .001) is commonly used; Pillai’s trace is the most robust statistic when it fails.' },
      ar: { title: 'اختبار بوكس M لتساوي مصفوفات التغاير', origin: 'جورج إ. ب. بوكس، «نظرية توزيع عامة لفئة من معايير الإمكان»، مجلة Biometrika عام 1949.', text: 'يختبر هل تتساوى مصفوفات تغاير المتغيرات التابعة في المجموعات (الخلايا) الـ g، وهو افتراض في تحليل التباين المتعدد. وهو شديد الحساسية لعدم الاعتدالية وللعيّنات الكبيرة، فيُستعمل غالباً مستوى دلالة صارم (مثل 0.001)، وأثر بيلاي أكثر الإحصاءات متانة إذا اختلّ هذا الافتراض.' }
    },
    {
      id: 'stkruskal', refs: ['kruskal1952', 'tomczak2014'],
      formula: M(row(mi('H'), eq, fr(row(fr(mn(12), row(N, par(N, pl, mn(1)))), SUM(row(mi('i'), eq, mn(1)), k), fr(ss(mi('R'), mi('i'), mn(2)), ni(mi('i'))), mi_, mn(3), par(N, pl, mn(1))), row(mn(1), mi_, fr(ties, row(sp(N, mn(3)), mi_, N)))), cm, gap, mi('H'), mo('∼'), ss(mi('χ'), row(k, mi_, mn(1)), mn(2))),
        row(ss(mi('ε'), mi('R'), mn(2)), eq, fr(mi('H'), row(par(sp(N, mn(2)), mi_, mn(1)), mo('/'), par(N, pl, mn(1)))))),
      en: { title: 'Kruskal–Wallis H test', origin: 'William H. Kruskal and W. Allen Wallis, “Use of ranks in one-criterion variance analysis”, Journal of the American Statistical Association (1952).', text: 'Rank-based alternative to the one-way ANOVA: tests whether k independent groups come from the same distribution (stochastic equality), using the rank sums Rᵢ of the pooled sample with a correction for ties (chi-square approximation). Effect size ε²R (Tomczak & Tomczak, 2014). Follow up with Dunn’s test.' },
      ar: { title: 'اختبار كروسكال–واليس H', origin: 'وليام هـ. كروسكال وو. ألن واليس، «استعمال الرتب في تحليل التباين ذي المعيار الواحد»، مجلة الجمعية الإحصائية الأمريكية عام 1952.', text: 'بديل قائم على الرتب لتحليل التباين الأحادي: يختبر هل جاءت k مجموعة مستقلة من التوزيع نفسه (التكافؤ العشوائي)، اعتماداً على مجاميع الرتب Rᵢ في العيّنة المجمَّعة مع تصحيح للتعادل (تقريب مربع كاي). ومقدار الأثر ε²R (توماتشاك وتوماتشاك، 2014)، ويُتبَع باختبار دَن.' }
    },
    {
      id: 'stdunn', refs: ['dunn1964'],
      formula: M(row(sb(mi('z'), row(mi('i'), mi('j'))), eq, fr(row(sb(bar(mi('R')), mi('i')), mi_, sb(bar(mi('R')), mi('j'))), sq(row(brk(fr(row(N, par(N, pl, mn(1))), mn(12)), mi_, fr(ties, row(mn(12), par(N, mi_, mn(1))))), par(fr(mn(1), ni(mi('i'))), pl, fr(mn(1), ni(mi('j'))))))))),
      en: { title: 'Dunn’s post hoc test', origin: 'Olive Jean Dunn, “Multiple comparisons using rank sums”, Technometrics (1964).', text: 'Pairwise comparisons after a Kruskal–Wallis test using the mean ranks from the joint ranking (with tie correction) and the normal distribution; p-values are adjusted with Bonferroni or Holm.' },
      ar: { title: 'اختبار دَن البَعدي', origin: 'أوليف جين دَن، «المقارنات المتعددة باستعمال مجاميع الرتب»، مجلة Technometrics عام 1964.', text: 'مقارنات زوجية بعد اختبار كروسكال–واليس، تستعمل متوسطات الرتب من الترتيب المشترك (مع تصحيح التعادل) والتوزيع الطبيعي، وتُعدَّل القيم الاحتمالية بطريقة بونفيروني أو هولم.' }
    },
    {
      id: 'stfriedman', refs: ['friedman1937'],
      formula: M(row(ss(mi('χ'), mi('F'), mn(2)), eq, fr(row(mn(12), SUM(row(mi('j'), eq, mn(1)), k), sp(par(sb(mi('R'), mi('j')), mi_, fr(row(n, par(k, pl, mn(1))), mn(2))), mn(2))), row(n, k, par(k, pl, mn(1)), mi_, fr(row(SUMu(''), par(sp(mi('t'), mn(3)), mi_, mi('t'))), row(k, mi_, mn(1))))), cm, gap, ss(mi('χ'), mi('F'), mn(2)), mo('∼'), ss(mi('χ'), row(k, mi_, mn(1)), mn(2)))),
      en: { title: 'Friedman test', origin: 'Milton Friedman, later the Nobel-laureate economist, “The use of ranks to avoid the assumption of normality implicit in the analysis of variance”, Journal of the American Statistical Association (1937).', text: 'Rank-based alternative to the one-way repeated-measures ANOVA: the k measurements of each case are ranked within the case and the column rank sums Rj are compared (with a correction for ties within cases). Effect size: Kendall’s W. Follow up with Conover’s test.' },
      ar: { title: 'اختبار فريدمان', origin: 'ميلتون فريدمان، الذي صار لاحقاً اقتصادياً حائزاً جائزة نوبل، «استعمال الرتب لتجنّب افتراض الاعتدالية الضمني في تحليل التباين»، مجلة الجمعية الإحصائية الأمريكية عام 1937.', text: 'بديل قائم على الرتب لتحليل التباين للقياسات المتكررة ذي العامل الواحد: تُرتَّب القياسات الـ k لكل حالة داخل الحالة نفسها، ثم تُقارن مجاميع رتب الأعمدة Rj (مع تصحيح التعادل داخل الحالات). ومقدار الأثر W لكندال، ويُتبَع باختبار كونوفر.' }
    },
    {
      id: 'stkendallw', refs: ['kendall1939'],
      formula: M(row(mi('W'), eq, fr(ss(mi('χ'), mi('F'), mn(2)), row(n, par(k, mi_, mn(1)))), eq, fr(row(mn(12), SUMu(mi('j')), sp(par(sb(mi('R'), mi('j')), mi_, bar(mi('R'))), mn(2))), row(sp(n, mn(2)), par(sp(k, mn(3)), mi_, k))), mt(' (no ties)'))),
      en: { title: 'Kendall’s coefficient of concordance W', origin: 'Maurice G. Kendall and Bernard Babington Smith, “The problem of m rankings”, The Annals of Mathematical Statistics (1939).', text: 'Agreement among the n cases (raters) in how they rank the k conditions, from 0 (no agreement) to 1 (identical rankings). It is a rescaling of Friedman’s statistic and serves as its effect size.' },
      ar: { title: 'معامل التوافق W لكندال', origin: 'موريس ج. كندال وبرنارد بابينغتون سميث، «مسألة الترتيبات m»، مجلة The Annals of Mathematical Statistics عام 1939.', text: 'مقدار اتفاق الحالات (المقيِّمين) الـ n في ترتيب الشروط الـ k، من 0 (لا اتفاق) إلى 1 (ترتيبات متطابقة). وهو إعادة قياس لإحصاءة فريدمان، ويُستعمل مقداراً لأثرها.' }
    },
    {
      id: 'stconover', refs: ['conover1999'],
      formula: M(row(sb(mi('t'), row(mi('i'), mi('j'))), eq, fr(row(sb(mi('R'), mi('i')), mi_, sb(mi('R'), mi('j'))), sq(fr(row(mn(2), par(n, sb(mi('A'), mn(1)), mi_, SUMu(mi('j')), ss(mi('R'), mi('j'), mn(2)))), row(par(n, mi_, mn(1)), par(k, mi_, mn(1)))))), cm, gap, sb(mi('A'), mn(1)), eq, SUMu(mi('i')), SUMu(mi('j')), ss(mi('r'), row(mi('i'), mi('j')), mn(2)), cm, gap, mi('df'), eq, par(n, mi_, mn(1)), par(k, mi_, mn(1)))),
      en: { title: 'Conover’s post hoc test for Friedman', origin: 'William J. Conover, Practical Nonparametric Statistics (Wiley; 3rd ed. 1999), building on Conover and Iman’s rank-transformation work (1979–1981).', text: 'Pairwise comparisons of the column rank sums after a Friedman test using a t distribution with (n − 1)(k − 1) degrees of freedom; more powerful than comparisons based on the normal approximation. p-values are adjusted with Bonferroni or Holm.' },
      ar: { title: 'اختبار كونوفر البَعدي لفريدمان', origin: 'وليام ج. كونوفر، Practical Nonparametric Statistics (دار Wiley، الطبعة الثالثة 1999)، بناءً على أعمال كونوفر وإيمان في تحويل الرتب (1979–1981).', text: 'مقارنات زوجية بين مجاميع رتب الأعمدة بعد اختبار فريدمان، باستعمال توزيع t بدرجات حرية (n − 1)(k − 1)، وهو أقوى من المقارنات المبنية على التقريب الطبيعي. وتُعدَّل القيم الاحتمالية بطريقة بونفيروني أو هولم.' }
    }
  ];

  // ------------------------------------------------------------------ interface strings
  const I18N = {
    en: {
      menu_st_desc: 'Descriptives', menu_ttests: 'T-Tests', menu_anova: 'ANOVA', menu_nonpar: 'Nonparametric tests',
      an_st_desc: 'Descriptive statistics', an_st_desc_d: 'Mean, SD, SE and CI, median, mode, quartiles and percentiles, skewness and kurtosis with SEs, Shapiro–Wilk, frequency tables, histograms, box plots and Q–Q plots, optionally split by a grouping variable.',
      an_st_normality: 'Normality tests', an_st_normality_d: 'Shapiro–Wilk, Kolmogorov–Smirnov (Lilliefors) and Anderson–Darling tests with normal Q–Q plots, optionally by group.',
      an_st_ttest_one: 'One-sample t-test', an_st_ttest_one_d: 'Compares a mean with a test value: Student’s t with Cohen’s d / Hedges’ g and exact CIs, and the Wilcoxon signed-rank test.',
      an_st_ttest_ind: 'Independent-samples t-test', an_st_ttest_ind_d: 'Compares two independent groups: Student and Welch t-tests, Mann–Whitney U, effect sizes with CIs, Levene’s test and normality checks.',
      an_st_ttest_paired: 'Paired-samples t-test', an_st_ttest_paired_d: 'Compares two measurements on the same cases. Pair variables by order: the n-th selection in “Variable 1” with the n-th in “Variable 2”.',
      an_st_anova: 'ANOVA (one-way / factorial)', an_st_anova_d: 'One or more fixed factors, full factorial model, Type I/II/III sums of squares, η², partial η², ω², Welch and Brown–Forsythe (one factor), Levene, marginal means and post hoc tests.',
      an_st_ancova: 'ANCOVA', an_st_ancova_d: 'ANOVA with continuous covariates: adjusted (marginal) means, Type III tests, homogeneity-of-slopes check and post hoc comparisons of adjusted means.',
      an_st_rmanova: 'Repeated-measures ANOVA', an_st_rmanova_d: 'Select the repeated measures (wide format). Levels: number of levels of each within factor, e.g. “3” or “2, 3” (the last factor varies fastest). Optional between-subjects factor. Mauchly, Greenhouse–Geisser and Huynh–Feldt.',
      an_st_manova: 'MANOVA', an_st_manova_d: 'Several dependent variables and one or more factors: Pillai, Wilks, Hotelling–Lawley and Roy with F approximations, univariate ANOVAs and Box’s M.',
      an_st_mannwhitney: 'Mann–Whitney U test', an_st_mannwhitney_d: 'Rank-based comparison of two independent groups (exact for small samples), rank-biserial correlation and Hodges–Lehmann estimate.',
      an_st_wilcoxon: 'Wilcoxon signed-rank test', an_st_wilcoxon_d: 'Rank-based comparison of two paired measurements (exact for small samples) with the matched rank-biserial correlation; optional sign test.',
      an_st_kruskal: 'Kruskal–Wallis test', an_st_kruskal_d: 'Rank-based comparison of k independent groups with ε² and Dunn’s post hoc test (Bonferroni and Holm).',
      an_st_friedman: 'Friedman test', an_st_friedman_d: 'Rank-based comparison of k repeated measures with Kendall’s W and Conover’s post hoc test.',
      f_stVars: 'Variables', f_stSplit: 'Split by', f_stGroup: 'Grouping variable', f_stPct: 'Percentiles (comma-separated)', f_stFreq: 'Frequency tables for variables with few values',
      f_stStudent: 'Student’s t', f_stWelch: 'Welch’s t', f_stMann: 'Mann–Whitney U', f_stWilcox: 'Wilcoxon signed-rank', f_stSign: 'Sign test', f_stSlopes: 'Test homogeneity of regression slopes',
      f_stMu: 'Test value (μ₀)', f_stAlt: 'Alternative hypothesis', f_stEffect: 'Effect size', f_stCenter: 'Homogeneity of variances test', f_stCI: 'Confidence level (%)',
      f_stPairA: 'Variable 1 (paired by order)', f_stPairB: 'Variable 2 (paired by order)', f_stDV: 'Dependent variable', f_stDVs: 'Dependent variables', f_stFactors: 'Fixed factors', f_stCovs: 'Covariates',
      f_stSSType: 'Sum of squares', f_stPosthoc: 'Post hoc tests', f_stMeasures: 'Repeated measures (columns)', f_stLevels: 'Levels of the within factors', f_stWNames: 'Names of the within factors', f_stBetween: 'Between-subjects factor',
      st_alt_two: 'Two-sided (≠)', st_alt_greater: 'Group 1 / measure > test value', st_alt_less: 'Group 1 / measure < test value',
      st_eff_d: 'Cohen’s d', st_eff_g: 'Hedges’ g', st_eff_delta: 'Glass’ Δ',
      st_center_mean: 'Levene (deviations from means)', st_center_median: 'Brown–Forsythe (deviations from medians)',
      st_sstype_3: 'Type III', st_sstype_2: 'Type II', st_sstype_1: 'Type I (sequential)',
      st_ph_tukey: 'Tukey HSD', st_ph_scheffe: 'Scheffé', st_ph_bonferroni: 'Bonferroni', st_ph_holm: 'Holm', st_ph_gameshowell: 'Games–Howell',
      g_st_main: 'Main results', g_st_assump: 'Assumption checks', g_st_desc: 'Descriptives & plots', g_st_post: 'Post hoc tests',
      st_theoretical: 'Theoretical quantiles', st_standardized: 'Standardised values', st_writeup: 'APA write-up', st_writeup_note: 'Suggested wording in APA 7 style; check it against your design before use.',
      st_alt_note_greater: 'One-sided test: H₁ states that the first group (or the measure) is larger.', st_alt_note_less: 'One-sided test: H₁ states that the first group (or the measure) is smaller.',
      st_missing: 'Missing', st_mean: 'Mean', st_se_mean: 'Std. error of mean', st_ci_mean: '{l}% CI mean', st_lower: 'lower', st_upper: 'upper', st_median: 'Median', st_mode: 'Mode', st_sd: 'SD', st_se: 'SE',
      st_variance: 'Variance', st_cv: 'Coefficient of variation', st_skewness: 'Skewness', st_se_skew: 'SE of skewness', st_kurtosis: 'Kurtosis (excess)', st_se_kurt: 'SE of kurtosis', st_range: 'Range', st_min: 'Minimum', st_max: 'Maximum',
      st_q1: '25th percentile', st_q3: '75th percentile', st_sum: 'Sum', st_percentile: '{p}th percentile', st_desc_stats: 'Descriptive statistics', st_multimode: 'More than one mode exists; the smallest is shown.',
      st_plots: 'Plots', st_boxplot: 'Box plot', st_freq: 'Frequency tables', st_freq_of: 'Frequencies of {v}', st_count: 'Frequency', st_percent: 'Percent', st_valid_percent: 'Valid percent', st_cum_percent: 'Cumulative percent', st_total: 'Total',
      st_normality_tests: 'Tests of normality', st_variable: 'Variable', st_group: 'Group', st_normality_note: 'H₀: the population is normally distributed. A small p (e.g. < .05) indicates a departure from normality; with large samples look at the Q–Q plots as well.',
      st_other_tests: 'Kolmogorov–Smirnov (Lilliefors)', st_lillie_note: 'D is the largest distance between the empirical and the fitted normal distribution function; p uses Lilliefors’ distribution (Dallal–Wilkinson approximation).', st_ad_title: 'Anderson–Darling', st_ad_note: 'A² weights the tails more than K–S; p from Stephens’ formulas for estimated mean and variance.',
      st_wu_norm: 'A Shapiro–Wilk test for {v} gave W = {w}, {p} (n = {n}); {verdict}', st_wu_norm_bad: 'normality is rejected.', st_wu_norm_ok: 'there is no evidence against normality.',
      st_ci_of: '{l}% CI', st_student: 'Student', st_welch: 'Welch', st_mannwhitney: 'Mann–Whitney', st_wilcoxon: 'Wilcoxon',
      st_test: 'Test', st_statistic: 'Statistic', st_md: 'Mean difference', st_se_diff: 'SE difference', st_effect_size: 'Effect size', st_value: 'Value', st_rbc: 'Rank-biserial r', st_exact: 'exact', st_asymptotic: 'normal approximation',
      st_wu_t_ind: 'An independent-samples t-test showed that {v} differed between {a} (M = {m1}, SD = {s1}) and {b} (M = {m2}, SD = {s2}), t({df}) = {t}, {p}, {es} = {d}, {l}% CI [{lo}, {hi}].',
      st_wu_welch: 'Welch’s t-test for {v}, which does not assume equal variances: t({df}) = {t}, {p}, d = {d}.',
      st_wu_mw: 'A Mann–Whitney test for {v}: U = {u}, {p} ({how}), rank-biserial r = {r}.',
      st_wu_t_one: 'A one-sample t-test compared the mean of {v} (M = {m}, SD = {sd}) with {mu}: t({df}) = {t}, {p}, d = {d}, {l}% CI [{lo}, {hi}].',
      st_wu_t_paired: 'A paired-samples t-test for {v} (mean difference = {m}, SD = {sd}): t({df}) = {t}, {p}, dz = {d}, {l}% CI [{lo}, {hi}].',
      st_wu_wilcoxon: 'A Wilcoxon signed-rank test for {v}: V = {V}, {p} ({how}, n = {n} non-zero differences), matched rank-biserial r = {r}.',
      st_wu_sign: 'A sign test for {v}: {pos} positive and {neg} negative differences, {p}.',
      st_sign_test: 'Sign test', st_note_mu: 'Test value μ₀ = {mu}.', st_note_groups: 'Differences are {a} − {b}.', st_note_np: 'For Mann–Whitney and Wilcoxon the “mean difference” column shows the Hodges–Lehmann estimate.',
      st_welch_note: 'Welch’s test does not assume equal variances; its degrees of freedom are approximated (Welch–Satterthwaite).', st_mw_note: 'U (W in R/JASP) = rank sum of group 1 − n₁(n₁ + 1)/2. Exact p for n < 50 per group without ties; otherwise normal approximation with continuity and tie corrections.',
      st_wilcoxon_title: 'Wilcoxon signed-rank test', st_wilcoxon_note: 'V = sum of the ranks of the positive differences; zero differences are dropped. Exact p for n < 50 without ties or zeros; otherwise normal approximation with continuity and tie corrections.',
      st_sign_note: 'Exact binomial test of the number of positive differences (p = 1/2).', st_effect_note: 'Confidence intervals of d and g are exact (non-central t). Hedges’ g removes the small-sample bias of d. No exact CI is given for Welch’s d or Glass’ Δ.',
      st_assumptions: 'Assumption checks', st_sw_title: 'Test of normality (Shapiro–Wilk)', st_sw_note: 'A significant result suggests a departure from normality; consider the nonparametric test.',
      st_levene_title: 'Test of equality of variances ({c})', st_levene_note: 'A significant result suggests unequal variances; prefer Welch’s test and Games–Howell comparisons.', st_differences: 'differences', st_descriptives: 'Descriptives',
      st_posthoc_of: 'Post hoc comparisons: {f}', st_comparison: 'Comparison', st_posthoc_note: 'Comparisons of estimated marginal means using the model’s error term. Tukey and Scheffé use the studentized range and F distributions; Bonferroni and Holm adjust the unadjusted t-test p-values over all pairs of this factor.',
      st_scheffe_note: 'Scheffé’s p controls the error rate over all contrasts, hence it is larger than Tukey’s.', st_bonf_note: 'Bonferroni multiplies by the number of comparisons; Holm is a uniformly more powerful step-down version.',
      st_gh_of: 'Games–Howell comparisons: {f}', st_gh_note: 'Does not assume equal variances; uses the raw group data of this factor (ignoring other factors and covariates).',
      st_residuals: 'Residuals', st_cases: 'Source', st_ss_type: 'Sum of squares (Type {k})', st_ms: 'Mean square', st_anova_note: 'η² = SS/SS total, η²p = SS/(SS + SS residual), ω² = (SS − df·MS residual)/(SS total + MS residual). Factors use sum-to-zero (effect) coding.',
      st_factorial_title: 'Factorial ANOVA', st_oneway_title: 'One-way ANOVA', st_homcorr: 'Homogeneity corrections', st_correction: 'Correction', st_homcorr_note: 'Robust tests of equal means that do not assume equal variances.',
      st_bf_note: 'Brown–Forsythe F* weights each group variance by (1 − nᵢ/N).', st_effect_sizes: 'Effect sizes', st_eta_note: 'η²: share of total variance; η²p: effect relative to effect + error; ω²: less biased; η²G (repeated measures): comparable across designs.',
      st_slopes: 'Homogeneity of regression slopes', st_slopes_note: 'Factor × covariate interactions added to the ANCOVA model (Type III). A significant interaction means the covariate’s slope differs between groups, which violates an ANCOVA assumption.',
      st_wu_anova: 'The effect of {term} was F({df1}, {df2}) = {F}, {p}, η²p = {e}, ω² = {o}.', st_wu_anova_b: 'The effect of {term} was F({df1}, {df2}) = {F}, {p}, η²p = {e}.', st_wu_welch_anova: 'Welch’s ANOVA, which does not assume equal variances: F({df1}, {df2}) = {F}, {p}.',
      st_resid_normality: 'Normality of residuals', st_qq_resid: 'Q–Q plot of standardised residuals', st_posthoc: 'Post hoc tests', st_no_posthoc: 'No post hoc tests.',
      st_emm: 'Marginal means', st_emm_of: 'Estimated marginal means: {f}', st_emm_note: 'Other factors are averaged with equal weights (unweighted means).', st_emm_cov_note: 'Adjusted means: covariates held at their means, other factors averaged with equal weights.', st_plot_first_two: 'The plot shows the first two factors.',
      st_within: 'Within-subjects effects', st_corr_none: 'None', st_corr_greenhouse: 'Greenhouse–Geisser', st_corr_huynh: 'Huynh–Feldt', st_sphericity_corr: 'Sphericity correction',
      st_rm_note: 'Each within effect is tested against its own effect × subjects error term (Type III). Corrected rows multiply both degrees of freedom by ε.', st_between: 'Between-subjects effects', st_rm_between_note: 'Tested on the subjects’ totals; the residual is the subjects-within-groups error.',
      st_wu_rm: 'The effect of {term} was F({df1}, {df2}) = {F}, {p}, η²p = {e}, η²G = {g}.', st_wu_rm_gg: 'Because sphericity was violated, Greenhouse–Geisser corrected degrees of freedom are reported (ε = {eps}): the effect of {term} was F({df1}, {df2}) = {F}, {p}, η²p = {e}, η²G = {g}.',
      st_sphericity: 'Sphericity', st_mauchly: 'Mauchly’s test of sphericity', st_lower_bound: 'Lower-bound ε', st_sph_two: 'Sphericity holds trivially for effects with two levels.',
      st_mauchly_note: 'H₀: sphericity holds. If p < .05, use the Greenhouse–Geisser (or, when ε > .75, the Huynh–Feldt) corrected tests.', st_eps_title: 'Greenhouse–Geisser and Huynh–Feldt ε', st_eps_note: 'ε measures the departure from sphericity (1 = sphericity, lower bound = 1/(levels − 1)).',
      st_rm_post_note: 'Paired t-tests on the subjects’ marginal means of each level (averaged over other within factors); Bonferroni and Holm adjust over the pairs of this factor.', st_measure: 'Measure', st_rm_plot_note: 'The plot shows the first within factor averaged over the others.',
      st_approx_f: 'Approx. F', st_manova_note: 'N = {n}, residual df = {df}. Type III hypothesis matrices with effect coding; F approximations as in R’s summary.manova (Rao’s F for Wilks).',
      st_wu_manova: 'A MANOVA showed for {term}: Pillai’s V = {V}, F({df1}, {df2}) = {F}, {p} (Wilks’ Λ = {L}).', st_univariate: 'Univariate ANOVA',
      st_boxm: 'Box’s M test of equality of covariance matrices', st_boxm_na: 'Not available: every cell needs more cases than dependent variables.', st_boxm_note: 'χ² approximation. Box’s M is very sensitive; many authors use α = .001.',
      st_kw_note: 'H is corrected for ties and referred to χ²(k − 1). ε² = H/((N² − 1)/(N + 1)); η²H = (H − k + 1)/(N − k).', st_wu_kw: 'A Kruskal–Wallis test showed for {v} across the groups of {g}: H({df}, N = {N}) = {H}, {p}, ε² = {e}.',
      st_dunn: 'Dunn’s post hoc test', st_dunn_note: 'z from the mean ranks of the joint ranking (tie-corrected); p two-sided.', st_mean_rank: 'Mean rank',
      st_friedman_note: 'χ² corrected for ties within cases; Kendall’s W = χ²/(n(k − 1)).', st_kendall_note: 'Agreement among cases in ranking the conditions (0 = none, 1 = complete).',
      st_wu_friedman: 'A Friedman test showed χ²({df}, N = {n}) = {chi}, {p}, Kendall’s W = {W}.', st_conover: 'Conover’s post hoc test', st_conover_note: 'Differences of column rank sums with a t distribution on (n − 1)(k − 1) df.', st_rank_sum: 'Rank sum',
      err_st_need_vars: 'Select at least one variable.', err_st_need_group: 'Select a grouping variable.', err_st_two_groups: 'The grouping variable must have exactly two groups (choose two groups).', err_st_too_few: 'Too few valid cases for this analysis.',
      err_st_need_pairs: 'Select the pairs of variables (Variable 1 and Variable 2 in the same order).', err_st_need_dv: 'Select a dependent variable.', err_st_need_factor: 'Select at least one factor.', err_st_dv_twice: 'The dependent variable cannot also be a factor or covariate.',
      err_st_one_level: 'A factor has only one level among the valid cases.', err_st_empty_cell: 'Some combination of factor levels has no cases; the full factorial model cannot be estimated.', err_st_singular: 'The model is singular (redundant predictors or no variance).',
      err_st_need_measures: 'Select at least two repeated measures.', err_st_levels: 'The product of the within-factor levels must equal the number of selected measures (e.g. 6 measures = “2, 3”).', err_st_need_dvs: 'Select at least two dependent variables.'
    },
    ar: {
      menu_st_desc: 'الإحصاءات الوصفية', menu_ttests: 'اختبارات t', menu_anova: 'تحليل التباين', menu_nonpar: 'الاختبارات اللامعلمية',
      an_st_desc: 'الإحصاءات الوصفية', an_st_desc_d: 'المتوسط والانحراف المعياري والخطأ المعياري وفترة الثقة، والوسيط والمنوال والربيعات والمئينات، والالتواء والتفرطح مع خطأيهما المعياريين، واختبار شابيرو–ويلك، وجداول التكرار، والمدرَّجات التكرارية والمخططات الصندوقية ومخططات Q–Q، مع إمكان التقسيم بمتغير تجميع.',
      an_st_normality: 'اختبارات الاعتدالية', an_st_normality_d: 'اختبارات شابيرو–ويلك وكولموغوروف–سميرنوف (ليلييفورس) وأندرسون–دارلنغ مع مخططات Q–Q الطبيعية، مع إمكان الحساب لكل مجموعة.',
      an_st_ttest_one: 'اختبار t لعيّنة واحدة', an_st_ttest_one_d: 'يقارن متوسطاً بقيمة مرجعية: اختبار t لستيودنت مع d لكوهين أو g لهيدجز وفترات ثقة دقيقة، واختبار ويلكوكسون للرتب ذات الإشارة.',
      an_st_ttest_ind: 'اختبار t لعيّنتين مستقلتين', an_st_ttest_ind_d: 'يقارن مجموعتين مستقلتين: اختبارا t لستيودنت وويلش، واختبار مان–ويتني U، ومقادير الأثر مع فترات ثقتها، واختبار ليفين وفحص الاعتدالية.',
      an_st_ttest_paired: 'اختبار t لعيّنتين مترابطتين', an_st_ttest_paired_d: 'يقارن قياسين على الحالات نفسها. تُزاوَج المتغيرات بالترتيب: الاختيار ذو الرقم n في «المتغير 1» مع نظيره في «المتغير 2».',
      an_st_anova: 'تحليل التباين (أحادي / عاملي)', an_st_anova_d: 'عامل ثابت أو أكثر في نموذج عاملي كامل، ومجاميع مربعات من الأنواع الأول والثاني والثالث، وη² وη² الجزئي وω²، وتصحيحا ويلش وبراون–فورسايث (لعامل واحد)، واختبار ليفين، والمتوسطات الهامشية والاختبارات البَعدية.',
      an_st_ancova: 'تحليل التغاير (ANCOVA)', an_st_ancova_d: 'تحليل التباين مع متغيرات مصاحبة متصلة: المتوسطات المعدَّلة (الهامشية)، واختبارات النوع الثالث، وفحص تجانس الميول، والمقارنات البَعدية بين المتوسطات المعدَّلة.',
      an_st_rmanova: 'تحليل التباين للقياسات المتكررة', an_st_rmanova_d: 'اختر القياسات المتكررة (بالصيغة العريضة). المستويات: عدد مستويات كل عامل داخلي، مثل «3» أو «2, 3» (يتغيّر العامل الأخير أسرع). ويمكن إضافة عامل بين الأفراد. يتضمن اختبار موشلي وتصحيحي غرينهاوس–غايسر وهوين–فيلدت.',
      an_st_manova: 'تحليل التباين المتعدد (MANOVA)', an_st_manova_d: 'عدة متغيرات تابعة مع عامل أو أكثر: بيلاي وويلكس وهوتيلنغ–لولي وروي مع تقريبات F، وتحليلات تباين أحادية المتغير، واختبار بوكس M.',
      an_st_mannwhitney: 'اختبار مان–ويتني U', an_st_mannwhitney_d: 'مقارنة قائمة على الرتب بين مجموعتين مستقلتين (دقيقة في العيّنات الصغيرة)، مع ارتباط الرتب الثنائي وتقدير هودجز–ليمان.',
      an_st_wilcoxon: 'اختبار ويلكوكسون للرتب ذات الإشارة', an_st_wilcoxon_d: 'مقارنة قائمة على الرتب بين قياسين مترابطين (دقيقة في العيّنات الصغيرة) مع ارتباط الرتب الثنائي للأزواج، واختبار الإشارة اختيارياً.',
      an_st_kruskal: 'اختبار كروسكال–واليس', an_st_kruskal_d: 'مقارنة قائمة على الرتب بين k مجموعة مستقلة مع ε² واختبار دَن البَعدي (بونفيروني وهولم).',
      an_st_friedman: 'اختبار فريدمان', an_st_friedman_d: 'مقارنة قائمة على الرتب بين k قياساً متكرراً مع W لكندال واختبار كونوفر البَعدي.',
      f_stVars: 'المتغيرات', f_stSplit: 'التقسيم بحسب', f_stGroup: 'متغير التجميع', f_stPct: 'المئينات (مفصولة بفواصل)', f_stFreq: 'جداول تكرار للمتغيرات ذات القيم القليلة',
      f_stStudent: 'اختبار t لستيودنت', f_stWelch: 'اختبار t لويلش', f_stMann: 'مان–ويتني U', f_stWilcox: 'ويلكوكسون للرتب ذات الإشارة', f_stSign: 'اختبار الإشارة', f_stSlopes: 'اختبار تجانس ميول الانحدار',
      f_stMu: 'القيمة المرجعية (μ₀)', f_stAlt: 'الفرضية البديلة', f_stEffect: 'مقدار الأثر', f_stCenter: 'اختبار تجانس التباين', f_stCI: 'مستوى الثقة (%)',
      f_stPairA: 'المتغير 1 (يُزاوَج بالترتيب)', f_stPairB: 'المتغير 2 (يُزاوَج بالترتيب)', f_stDV: 'المتغير التابع', f_stDVs: 'المتغيرات التابعة', f_stFactors: 'العوامل الثابتة', f_stCovs: 'المتغيرات المصاحبة',
      f_stSSType: 'مجموع المربعات', f_stPosthoc: 'الاختبارات البَعدية', f_stMeasures: 'القياسات المتكررة (أعمدة)', f_stLevels: 'مستويات العوامل الداخلية', f_stWNames: 'أسماء العوامل الداخلية', f_stBetween: 'عامل بين الأفراد',
      st_alt_two: 'ثنائي الذيل (≠)', st_alt_greater: 'المجموعة 1 / القياس > القيمة المرجعية', st_alt_less: 'المجموعة 1 / القياس < القيمة المرجعية',
      st_eff_d: 'd لكوهين', st_eff_g: 'g لهيدجز', st_eff_delta: 'Δ لغلاس',
      st_center_mean: 'ليفين (الانحرافات عن المتوسطات)', st_center_median: 'براون–فورسايث (الانحرافات عن الوسيطات)',
      st_sstype_3: 'النوع الثالث', st_sstype_2: 'النوع الثاني', st_sstype_1: 'النوع الأول (تتابعي)',
      st_ph_tukey: 'توكي HSD', st_ph_scheffe: 'شيفيه', st_ph_bonferroni: 'بونفيروني', st_ph_holm: 'هولم', st_ph_gameshowell: 'غيمز–هاول',
      g_st_main: 'النتائج الرئيسة', g_st_assump: 'فحص الافتراضات', g_st_desc: 'الوصف والمخططات', g_st_post: 'الاختبارات البَعدية',
      st_theoretical: 'الكمّيات النظرية', st_standardized: 'القيم المعيارية', st_writeup: 'الصياغة بأسلوب APA', st_writeup_note: 'صياغة مقترحة بأسلوب APA 7؛ راجعها في ضوء تصميم دراستك قبل استعمالها.',
      st_alt_note_greater: 'اختبار أحادي الذيل: تنص الفرضية البديلة على أن المجموعة الأولى (أو القياس) أكبر.', st_alt_note_less: 'اختبار أحادي الذيل: تنص الفرضية البديلة على أن المجموعة الأولى (أو القياس) أصغر.',
      st_missing: 'المفقود', st_mean: 'المتوسط', st_se_mean: 'الخطأ المعياري للمتوسط', st_ci_mean: 'فترة ثقة {l}% للمتوسط', st_lower: 'الحد الأدنى', st_upper: 'الحد الأعلى', st_median: 'الوسيط', st_mode: 'المنوال', st_sd: 'الانحراف المعياري', st_se: 'الخطأ المعياري',
      st_variance: 'التباين', st_cv: 'معامل الاختلاف', st_skewness: 'الالتواء', st_se_skew: 'الخطأ المعياري للالتواء', st_kurtosis: 'التفرطح (الزائد)', st_se_kurt: 'الخطأ المعياري للتفرطح', st_range: 'المدى', st_min: 'أصغر قيمة', st_max: 'أكبر قيمة',
      st_q1: 'المئين 25', st_q3: 'المئين 75', st_sum: 'المجموع', st_percentile: 'المئين {p}', st_desc_stats: 'الإحصاءات الوصفية', st_multimode: 'يوجد أكثر من منوال؛ ويُعرض أصغرها.',
      st_plots: 'المخططات', st_boxplot: 'المخطط الصندوقي', st_freq: 'جداول التكرار', st_freq_of: 'تكرارات {v}', st_count: 'التكرار', st_percent: 'النسبة المئوية', st_valid_percent: 'النسبة الصالحة', st_cum_percent: 'النسبة التراكمية', st_total: 'المجموع الكلي',
      st_normality_tests: 'اختبارات الاعتدالية', st_variable: 'المتغير', st_group: 'المجموعة', st_normality_note: 'الفرضية الصفرية: المجتمع موزع توزيعاً طبيعياً. تدل القيمة الاحتمالية الصغيرة (مثل < 0.05) على الانحراف عن الاعتدالية، وفي العيّنات الكبيرة انظر في مخططات Q–Q أيضاً.',
      st_other_tests: 'كولموغوروف–سميرنوف (ليلييفورس)', st_lillie_note: 'D أكبر مسافة بين دالة التوزيع التجريبية ودالة التوزيع الطبيعي الموفَّقة، وتُحسب القيمة الاحتمالية من توزيع ليلييفورس (تقريب دالال–ويلكنسون).', st_ad_title: 'أندرسون–دارلنغ', st_ad_note: 'تعطي A² الذيلين وزناً أكبر مما يعطيه K–S، والقيمة الاحتمالية من صيغ ستيفنز عند تقدير المتوسط والتباين.',
      st_wu_norm: 'أعطى اختبار شابيرو–ويلك للمتغير {v} القيمة W = {w}، {p} (n = {n})؛ {verdict}', st_wu_norm_bad: 'فتُرفض الاعتدالية.', st_wu_norm_ok: 'فلا دليل على مخالفة الاعتدالية.',
      st_ci_of: 'فترة ثقة {l}%', st_student: 'ستيودنت', st_welch: 'ويلش', st_mannwhitney: 'مان–ويتني', st_wilcoxon: 'ويلكوكسون',
      st_test: 'الاختبار', st_statistic: 'الإحصاءة', st_md: 'فرق المتوسطين', st_se_diff: 'الخطأ المعياري للفرق', st_effect_size: 'مقدار الأثر', st_value: 'القيمة', st_rbc: 'ارتباط الرتب الثنائي r', st_exact: 'حساب دقيق', st_asymptotic: 'تقريب طبيعي',
      st_wu_t_ind: 'أظهر اختبار t لعيّنتين مستقلتين أن {v} اختلف بين {a} (M = {m1}، SD = {s1}) و{b} (M = {m2}، SD = {s2})، t({df}) = {t}، {p}، {es} = {d}، فترة ثقة {l}% [{lo}, {hi}].',
      st_wu_welch: 'اختبار t لويلش للمتغير {v}، وهو لا يفترض تساوي التباينين: t({df}) = {t}، {p}، d = {d}.',
      st_wu_mw: 'اختبار مان–ويتني للمتغير {v}: U = {u}، {p} ({how})، وارتباط الرتب الثنائي r = {r}.',
      st_wu_t_one: 'قارن اختبار t لعيّنة واحدة متوسط {v} (M = {m}، SD = {sd}) بالقيمة {mu}: t({df}) = {t}، {p}، d = {d}، فترة ثقة {l}% [{lo}, {hi}].',
      st_wu_t_paired: 'اختبار t لعيّنتين مترابطتين للفرق {v} (متوسط الفروق = {m}، SD = {sd}): t({df}) = {t}، {p}، dz = {d}، فترة ثقة {l}% [{lo}, {hi}].',
      st_wu_wilcoxon: 'اختبار ويلكوكسون للرتب ذات الإشارة للمتغير {v}: V = {V}، {p} ({how}، n = {n} فرقاً غير صفري)، وارتباط الرتب الثنائي للأزواج r = {r}.',
      st_wu_sign: 'اختبار الإشارة للمتغير {v}: {pos} فرقاً موجباً و{neg} فرقاً سالباً، {p}.',
      st_sign_test: 'اختبار الإشارة', st_note_mu: 'القيمة المرجعية μ₀ = {mu}.', st_note_groups: 'الفروق محسوبة على صورة {a} − {b}.', st_note_np: 'في اختباري مان–ويتني وويلكوكسون يعرض عمود «فرق المتوسطين» تقدير هودجز–ليمان.',
      st_welch_note: 'لا يفترض اختبار ويلش تساوي التباينين، وتُقرَّب درجات حريته (ويلش–ساترثويت).', st_mw_note: 'U (وتسمى W في R وJASP) = مجموع رتب المجموعة 1 − n₁(n₁ + 1)/2. تُحسب p حساباً دقيقاً إذا قلّ حجم كل مجموعة عن 50 ولم يوجد تعادل، وإلا فبالتقريب الطبيعي مع تصحيحي الاتصال والتعادل.',
      st_wilcoxon_title: 'اختبار ويلكوكسون للرتب ذات الإشارة', st_wilcoxon_note: 'V = مجموع رتب الفروق الموجبة، وتُحذف الفروق الصفرية. تُحسب p حساباً دقيقاً إذا قلّ n عن 50 دون تعادل أو أصفار، وإلا فبالتقريب الطبيعي مع تصحيحي الاتصال والتعادل.',
      st_sign_note: 'اختبار ذي الحدين الدقيق لعدد الفروق الموجبة (باحتمال 1/2).', st_effect_note: 'فترتا الثقة لـ d وg دقيقتان (توزيع t غير المركزي)، ويُزيل g لهيدجز تحيّز d في العيّنات الصغيرة. ولا تُعرض فترة ثقة دقيقة لـ d في اختبار ويلش ولا لـ Δ لغلاس.',
      st_assumptions: 'فحص الافتراضات', st_sw_title: 'اختبار الاعتدالية (شابيرو–ويلك)', st_sw_note: 'تدل النتيجة الدالّة على الانحراف عن الاعتدالية؛ ففكّر في الاختبار اللامعلمي.',
      st_levene_title: 'اختبار تساوي التباينات ({c})', st_levene_note: 'تدل النتيجة الدالّة على عدم تساوي التباينات؛ فالأولى اختبار ويلش ومقارنات غيمز–هاول.', st_differences: 'الفروق', st_descriptives: 'الإحصاءات الوصفية',
      st_posthoc_of: 'المقارنات البَعدية: {f}', st_comparison: 'المقارنة', st_posthoc_note: 'مقارنات بين المتوسطات الهامشية المقدَّرة بحدّ الخطأ في النموذج. يستعمل توكي وشيفيه توزيعَي المدى المعيَّر وF، ويعدّل بونفيروني وهولم القيم الاحتمالية غير المعدَّلة لاختبارات t على جميع أزواج هذا العامل.',
      st_scheffe_note: 'تضبط قيمة شيفيه الاحتمالية معدل الخطأ على جميع المقارنات الممكنة، فهي أكبر من قيمة توكي.', st_bonf_note: 'يضرب بونفيروني في عدد المقارنات، وطريقة هولم صيغة تنازلية أقوى منه دائماً.',
      st_gh_of: 'مقارنات غيمز–هاول: {f}', st_gh_note: 'لا تفترض تساوي التباينات، وتستعمل البيانات الخام لمجموعات هذا العامل (متجاهلةً العوامل الأخرى والمتغيرات المصاحبة).',
      st_residuals: 'البواقي', st_cases: 'المصدر', st_ss_type: 'مجموع المربعات (النوع {k})', st_ms: 'متوسط المربعات', st_anova_note: 'η² = مجموع مربعات الأثر / المجموع الكلي، وη²p = SS/(SS + SS البواقي)، وω² = (SS − df·MS البواقي)/(SS الكلي + MS البواقي). وتُرمَّز العوامل بترميز الأثر (مجموعه صفر).',
      st_factorial_title: 'تحليل التباين العاملي', st_oneway_title: 'تحليل التباين الأحادي', st_homcorr: 'تصحيحات عدم تجانس التباين', st_correction: 'التصحيح', st_homcorr_note: 'اختبارات متينة لتساوي المتوسطات لا تفترض تساوي التباينات.',
      st_bf_note: 'تزن إحصاءة براون–فورسايث F* تباين كل مجموعة بالمقدار (1 − nᵢ/N).', st_effect_sizes: 'مقادير الأثر', st_eta_note: 'η²: نسبة من التباين الكلي، وη²p: الأثر منسوباً إلى الأثر مع خطئه، وω²: أقل تحيّزاً، وη²G (للقياسات المتكررة): قابل للمقارنة بين التصاميم.',
      st_slopes: 'تجانس ميول الانحدار', st_slopes_note: 'تُضاف تفاعلات العامل مع المتغير المصاحب إلى نموذج تحليل التغاير (النوع الثالث). ويعني التفاعل الدالّ أن ميل المتغير المصاحب يختلف بين المجموعات، وهو إخلال بأحد افتراضات تحليل التغاير.',
      st_wu_anova: 'كان أثر {term}: F({df1}, {df2}) = {F}، {p}، η²p = {e}، ω² = {o}.', st_wu_anova_b: 'كان أثر {term}: F({df1}, {df2}) = {F}، {p}، η²p = {e}.', st_wu_welch_anova: 'تحليل التباين لويلش، وهو لا يفترض تساوي التباينات: F({df1}, {df2}) = {F}، {p}.',
      st_resid_normality: 'اعتدالية البواقي', st_qq_resid: 'مخطط Q–Q للبواقي المعيارية', st_posthoc: 'الاختبارات البَعدية', st_no_posthoc: 'لا توجد اختبارات بَعدية.',
      st_emm: 'المتوسطات الهامشية', st_emm_of: 'المتوسطات الهامشية المقدَّرة: {f}', st_emm_note: 'يُؤخذ متوسط العوامل الأخرى بأوزان متساوية (متوسطات غير موزونة).', st_emm_cov_note: 'متوسطات معدَّلة: تُثبَّت المتغيرات المصاحبة عند متوسطاتها، ويُؤخذ متوسط العوامل الأخرى بأوزان متساوية.', st_plot_first_two: 'يعرض المخطط العاملين الأوّلين.',
      st_within: 'الآثار داخل الأفراد', st_corr_none: 'بلا تصحيح', st_corr_greenhouse: 'غرينهاوس–غايسر', st_corr_huynh: 'هوين–فيلدت', st_sphericity_corr: 'تصحيح الكروية',
      st_rm_note: 'يُختبر كل أثر داخلي مقابل حدّ خطئه الخاص (الأثر × الأفراد، النوع الثالث). وفي الصفوف المصحَّحة تُضرب درجتا الحرية كلتاهما في ε.', st_between: 'الآثار بين الأفراد', st_rm_between_note: 'تُختبر على مجاميع الأفراد، والبواقي هي خطأ الأفراد داخل المجموعات.',
      st_wu_rm: 'كان أثر {term}: F({df1}, {df2}) = {F}، {p}، η²p = {e}، η²G = {g}.', st_wu_rm_gg: 'لاختلال الكروية تُعرض درجات الحرية بتصحيح غرينهاوس–غايسر (ε = {eps}): كان أثر {term}: F({df1}, {df2}) = {F}، {p}، η²p = {e}، η²G = {g}.',
      st_sphericity: 'الكروية', st_mauchly: 'اختبار موشلي للكروية', st_lower_bound: 'الحد الأدنى لـ ε', st_sph_two: 'تتحقق الكروية تلقائياً في الآثار ذات المستويين.',
      st_mauchly_note: 'الفرضية الصفرية: الكروية متحققة. فإذا كانت p < 0.05 فاعتمد الاختبارات المصحَّحة بطريقة غرينهاوس–غايسر (أو هوين–فيلدت إذا زاد ε على 0.75).', st_eps_title: 'معامل ε لغرينهاوس–غايسر وهوين–فيلدت', st_eps_note: 'يقيس ε مقدار الابتعاد عن الكروية (1 = كروية تامة، والحد الأدنى = 1/(عدد المستويات − 1)).',
      st_rm_post_note: 'اختبارات t للعيّنات المترابطة على المتوسطات الهامشية للأفراد في كل مستوى (بعد أخذ متوسط العوامل الداخلية الأخرى)، ويعدّل بونفيروني وهولم على أزواج هذا العامل.', st_measure: 'القياس', st_rm_plot_note: 'يعرض المخطط العامل الداخلي الأول بعد أخذ متوسط العوامل الأخرى.',
      st_approx_f: 'F التقريبية', st_manova_note: 'N = {n}، ودرجات حرية البواقي = {df}. مصفوفات فرضيات من النوع الثالث بترميز الأثر، وتقريبات F كما في summary.manova في R (F لراو في حالة ويلكس).',
      st_wu_manova: 'أظهر تحليل التباين المتعدد للأثر {term}: V لبيلاي = {V}، F({df1}, {df2}) = {F}، {p} (Λ لويلكس = {L}).', st_univariate: 'تحليل التباين أحادي المتغير',
      st_boxm: 'اختبار بوكس M لتساوي مصفوفات التغاير', st_boxm_na: 'غير متاح: يجب أن يزيد عدد الحالات في كل خلية على عدد المتغيرات التابعة.', st_boxm_note: 'تقريب مربع كاي. واختبار بوكس M شديد الحساسية، فيستعمل كثيرون α = 0.001.',
      st_kw_note: 'تُصحَّح H للتعادل وتُحال إلى توزيع χ² بدرجات حرية k − 1. ε² = H/((N² − 1)/(N + 1))، وη²H = (H − k + 1)/(N − k).', st_wu_kw: 'أظهر اختبار كروسكال–واليس للمتغير {v} عبر مجموعات {g}: H({df}, N = {N}) = {H}، {p}، ε² = {e}.',
      st_dunn: 'اختبار دَن البَعدي', st_dunn_note: 'تُحسب z من متوسطات الرتب في الترتيب المشترك (مع تصحيح التعادل)، والقيمة الاحتمالية ثنائية الذيل.', st_mean_rank: 'متوسط الرتب',
      st_friedman_note: 'تُصحَّح χ² للتعادل داخل الحالات، وW لكندال = χ²/(n(k − 1)).', st_kendall_note: 'مقدار اتفاق الحالات في ترتيب الشروط (0 = لا اتفاق، 1 = اتفاق تام).',
      st_wu_friedman: 'أظهر اختبار فريدمان أن χ²({df}, N = {n}) = {chi}، {p}، وW لكندال = {W}.', st_conover: 'اختبار كونوفر البَعدي', st_conover_note: 'فروق مجاميع رتب الأعمدة مع توزيع t بدرجات حرية (n − 1)(k − 1).', st_rank_sum: 'مجموع الرتب',
      err_st_need_vars: 'اختر متغيراً واحداً على الأقل.', err_st_need_group: 'اختر متغير التجميع.', err_st_two_groups: 'يجب أن يكون لمتغير التجميع مجموعتان بالضبط (اختر مجموعتين).', err_st_too_few: 'عدد الحالات الصالحة قليل جداً لهذا التحليل.',
      err_st_need_pairs: 'اختر أزواج المتغيرات (المتغير 1 والمتغير 2 بالترتيب نفسه).', err_st_need_dv: 'اختر المتغير التابع.', err_st_need_factor: 'اختر عاملاً واحداً على الأقل.', err_st_dv_twice: 'لا يصح أن يكون المتغير التابع عاملاً أو متغيراً مصاحباً أيضاً.',
      err_st_one_level: 'لأحد العوامل مستوى واحد فقط بين الحالات الصالحة.', err_st_empty_cell: 'بعض توافيق مستويات العوامل خالٍ من الحالات، فلا يمكن تقدير النموذج العاملي الكامل.', err_st_singular: 'النموذج منفرد (متنبئات مكررة أو بلا تباين).',
      err_st_need_measures: 'اختر قياسين متكررين على الأقل.', err_st_levels: 'يجب أن يساوي حاصل ضرب مستويات العوامل الداخلية عدد القياسات المختارة (مثلاً 6 قياسات = «2, 3»).', err_st_need_dvs: 'اختر متغيرين تابعين على الأقل.'
    }
  };

  (root.YP_PLUGINS = root.YP_PLUGINS || []).push({
    id: 'stats',
    i18n: I18N,
    refs: REFS,
    methods: METHODS,
    menu: [
      { group: 'menu_st_desc', items: ['st_desc', 'st_normality'] },
      { group: 'menu_ttests', items: ['st_ttest_one', 'st_ttest_ind', 'st_ttest_paired'] },
      { group: 'menu_anova', items: ['st_anova', 'st_ancova', 'st_rmanova', 'st_manova'] },
      { group: 'menu_nonpar', items: ['st_mannwhitney', 'st_wilcoxon', 'st_kruskal', 'st_friedman'] }
    ],
    order: ['st_desc', 'st_normality', 'st_ttest_one', 'st_ttest_ind', 'st_ttest_paired', 'st_mannwhitney', 'st_wilcoxon', 'st_anova', 'st_ancova', 'st_rmanova', 'st_manova', 'st_kruskal', 'st_friedman'],
    tasks, fields, readForm,
    sections: { st_desc: descSections, st_normality: normSections, st_ttest: ttestSections, st_anova: anovaSections, st_rmanova: rmSections, st_manova: manovaSections, st_kruskal: kwSections, st_friedman: friedmanSections }
  });
})(typeof self !== 'undefined' ? self : this);
