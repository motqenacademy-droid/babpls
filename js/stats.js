/*
 * BabPls engine module: classic statistics I (JASP-style T-Tests, ANOVA and nonparametric modules)
 * UMD: extends window.YPEngine (browser/worker) or the Node export of advanced3.js. Each analysis registers
 * E.tasks[kind] = (ds, model, settings, opts, progress) => result (result.kind selects the renderer in js/ui-stats.js).
 *
 * Tasks: st_desc, st_normality, st_ttest_one, st_ttest_ind, st_ttest_paired, st_anova (one-way, factorial, ANCOVA),
 * st_rmanova (repeated measures, optional between factor), st_manova, st_kruskal, st_friedman.
 * Distribution functions (exact or to ~1e-12): pnorm/qnorm, pt/qt, pf, pchisq, non-central t (AS 243), studentized range
 * (Copenhaver & Holland 1988, as R's ptukey), Shapiro–Wilk (Royston 1995, as R/scipy swilk), exact Mann–Whitney and
 * Wilcoxon signed-rank distributions. They are exported as E.st for other modules.
 */
(function (root) {
  'use strict';
  const E = (typeof module !== 'undefined' && module.exports) ? require('./advanced3.js') : root.YPEngine;
  E.tasks = E.tasks || {};
  // precise log-gamma (shift to x >= 10, then the Stirling series; relative error < 1e-15). The engine's Lanczos
  // lgamma is only accurate to ~1e-7, which is too coarse for exact reference-level p-values.
  function lgamma(x) {
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    let shift = 0; while (x < 10) { shift += Math.log(x); x += 1; }
    const z = 1 / (x * x);
    const ser = (1 / 12 + z * (-1 / 360 + z * (1 / 1260 + z * (-1 / 1680 + z * (1 / 1188 + z * (-691 / 360360 + z / 156)))))) / x;
    return (x - 0.5) * Math.log(x) - x + 0.5 * Math.log(2 * Math.PI) + ser - shift;
  }
  function betacf(a, b, x) {
    const qab = a + b, qap = a + 1, qam = a - 1; let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < 1e-300) d = 1e-300; d = 1 / d; let h = d;
    for (let m = 1; m <= 100000; m++) {
      const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d;
      const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-16) break;
    }
    return h;
  }
  function ibeta(x, a, b) { // regularised incomplete beta I_x(a, b)
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log1p(-x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  const fail = code => { const e = new Error(code); throw e; };

  // ================================================================ distributions
  function gser(a, x) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 0; n < 100000; n++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-17) break; }
    return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
  }
  function gcf(a, x) { // modified Lentz continued fraction for Q(a, x)
    let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
    for (let i = 1; i < 100000; i++) {
      const an = -i * (i - a); b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-16) break;
    }
    return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
  }
  const gammaP = (a, x) => x <= 0 ? 0 : x < a + 1 ? gser(a, x) : 1 - gcf(a, x);
  const gammaQ = (a, x) => x <= 0 ? 1 : x < a + 1 ? 1 - gser(a, x) : gcf(a, x);
  // standard normal CDF through erfc = Q(1/2, z²/2): full relative precision in both tails
  function pnorm(z) { if (isNaN(z)) return NaN; if (z === Infinity) return 1; if (z === -Infinity) return 0; const q = 0.5 * gammaQ(0.5, z * z / 2); return z < 0 ? q : 1 - q; }
  const pnormU = z => pnorm(-z);
  function qnorm(p) {
    if (!(p > 0)) return p === 0 ? -Infinity : NaN; if (!(p < 1)) return p === 1 ? Infinity : NaN;
    if (p > 0.5) return -qnorm(1 - p);
    let x = E.qnorm(p);
    for (let k = 0; k < 3; k++) { // Halley refinement
      const e = pnorm(x) - p, u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2);
      x = x - u / (1 + x * u / 2);
    }
    return x;
  }
  const dnorm = z => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  // Student t
  function pt(t, df, lower) {
    if (lower === undefined) lower = true;
    if (isNaN(t)) return NaN; if (t === Infinity) return lower ? 1 : 0; if (t === -Infinity) return lower ? 0 : 1;
    if (df === Infinity) return lower ? pnorm(t) : pnorm(-t);
    const tail = 0.5 * ibeta(df / (df + t * t), df / 2, 0.5); // P(T > |t|)
    const up = t > 0 ? tail : 1 - tail;
    return lower ? 1 - up : up;
  }
  const dt = (x, df) => Math.exp(lgamma((df + 1) / 2) - lgamma(df / 2) - 0.5 * Math.log(df * Math.PI) - (df + 1) / 2 * Math.log1p(x * x / df));
  function qt(p, df) {
    if (!(p > 0 && p < 1)) return p === 0 ? -Infinity : p === 1 ? Infinity : NaN;
    if (df === Infinity) return qnorm(p);
    if (p > 0.5) return -qt(1 - p, df);
    // bracket and Newton with bisection safeguard on the lower tail
    let lo = -1, hi = 0;
    while (pt(lo, df) > p) { hi = lo; lo *= 2; if (lo < -1e300) return -Infinity; }
    let x = (lo + hi) / 2;
    for (let it = 0; it < 200; it++) {
      const f = pt(x, df) - p;
      if (f > 0) hi = x; else lo = x;
      const d = dt(x, df); let nx = x - f / d;
      if (!(nx > lo && nx < hi)) nx = (lo + hi) / 2;
      if (Math.abs(nx - x) <= 1e-15 * Math.max(1, Math.abs(x))) { x = nx; break; }
      x = nx;
    }
    return x;
  }
  const pf = (F, d1, d2) => (!(F > 0) ? 1 : F === Infinity ? 0 : ibeta(d2 / (d2 + d1 * F), d2 / 2, d1 / 2)); // upper tail
  const pchisq = (x, df) => gammaQ(df / 2, x / 2); // upper tail
  // non-central t CDF (Lenth 1989, AS 243, as R's pnt), lower tail
  function pnt(t, df, del) {
    if (del === 0) return pt(t, df);
    if (!isFinite(t)) return t > 0 ? 1 : 0;
    let negdel = false, tt = t, d = del;
    if (t < 0) { negdel = true; tt = -t; d = -del; }
    if (df > 4e5 || d * d > 2 * Math.LN2 * 1021) { // normal approximation (Abramowitz & Stegun 26.7.10)
      const s = 1 / (4 * df), z = (tt * (1 - s) - d) / Math.sqrt(1 + tt * tt * 2 * s), v = pnorm(z);
      return negdel ? 1 - v : v;
    }
    const x = tt * tt / (tt * tt + df);
    let tnc = 0;
    if (x > 0) {
      const lambda = d * d;
      let p = 0.5 * Math.exp(-0.5 * lambda), q = Math.sqrt(2 / Math.PI) * p * d, s = 0.5 - p;
      if (s < 1e-7) s = -0.5 * Math.expm1(-0.5 * lambda);
      let a = 0.5; const b = 0.5 * df, rxb = Math.pow(1 - x, b), albeta = 0.5 * Math.log(Math.PI) + lgamma(b) - lgamma(0.5 + b);
      let xodd = ibeta(x, a, b), godd = 2 * rxb * Math.exp(a * Math.log(x) - albeta), tn = b * x;
      let xeven = tn < 2.220446e-16 ? tn : 1 - rxb, geven = tn * rxb;
      tnc = p * xodd + q * xeven;
      for (let it = 1; it <= 1000; it++) {
        a += 1; xodd -= godd; xeven -= geven;
        godd *= x * (a + b - 1) / a; geven *= x * (a + b - 0.5) / (a + 0.5);
        p *= lambda / (2 * it); q *= lambda / (2 * it + 1);
        tnc += p * xodd + q * xeven; s -= p;
        if (s < -1e-10) break;
        if (s <= 0 && it > 1) break;
        const errbd = 2 * s * (xodd - godd);
        if (Math.abs(errbd) < 1e-12 && it > 1) break;
      }
    }
    tnc += pnorm(-d);
    if (tnc > 1) tnc = 1;
    return negdel ? 1 - tnc : tnc;
  }
  // root of a monotone function on an expanding bracket (bisection + secant, to ~1e-12)
  function solveMono(fn, target, x0, step) {
    let a = x0 - step, b = x0 + step, fa = fn(a) - target, fb = fn(b) - target, k = 0;
    while (fa * fb > 0 && k++ < 200) { if (Math.abs(fa) < Math.abs(fb)) { a -= (b - a); fa = fn(a) - target; } else { b += (b - a); fb = fn(b) - target; } }
    if (fa * fb > 0) return NaN;
    for (let it = 0; it < 300; it++) {
      const m = (a + b) / 2, fm = fn(m) - target;
      if (fm === 0 || (b - a) / 2 < 1e-12 * Math.max(1, Math.abs(m))) return m;
      if (fa * fm < 0) { b = m; fb = fm; } else { a = m; fa = fm; }
    }
    return (a + b) / 2;
  }
  // confidence limits of a non-centrality parameter given an observed t (pnt decreases in ncp)
  function ncpCI(t, df, level, alt) {
    const a = 1 - level, lo = alt === 'less' ? -Infinity : solveMono(nc => -pnt(t, df, nc), -(1 - (alt === 'two' || !alt ? a / 2 : a)), t, 1 + Math.abs(t));
    const hi = alt === 'greater' ? Infinity : solveMono(nc => -pnt(t, df, nc), -((alt === 'two' || !alt) ? a / 2 : a), t, 1 + Math.abs(t));
    return [lo, hi];
  }

  // Gauss–Legendre nodes (positive half, descending) and weights
  function gaussLegendre(n) {
    const x = [], w = [];
    for (let i = 1; i <= Math.floor(n / 2); i++) {
      let z = Math.cos(Math.PI * (i - 0.25) / (n + 0.5)), pp = 1;
      for (let it = 0; it < 100; it++) {
        let p1 = 1, p2 = 0;
        for (let j = 1; j <= n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; }
        pp = n * (z * p1 - p2) / (z * z - 1); const z1 = z; z = z1 - p1 / pp; if (Math.abs(z - z1) < 1e-16) break;
      }
      x.push(z); w.push(2 / ((1 - z * z) * pp * pp));
    }
    return { x, w };
  }
  const GL12 = gaussLegendre(12), GL16 = gaussLegendre(16);
  // studentized range: probability integral of the range of cc normal means (Copenhaver & Holland 1988; R ptukey)
  function wprob(w, rr, cc) {
    const C1 = -30, C2 = -50, C3 = 60, bb = 8, wlar = 3, xleg = GL12.x, aleg = GL12.w;
    const qsqz = w * 0.5;
    if (qsqz >= bb) return 1;
    let prW = 2 * pnorm(qsqz) - 1;
    prW = prW >= Math.exp(C2 / cc) ? Math.pow(prW, cc) : 0;
    const wincr = w > wlar ? 2 : 3;
    let blb = qsqz; const binc = (bb - qsqz) / wincr; let bub = blb + binc, einsum = 0; const cc1 = cc - 1;
    for (let wi = 1; wi <= wincr; wi++) {
      let elsum = 0; const a = 0.5 * (bub + blb), b = 0.5 * (bub - blb);
      for (let jj = 1; jj <= 12; jj++) {
        let j, xx;
        if (6 < jj) { j = 12 - jj + 1; xx = xleg[j - 1]; } else { j = jj; xx = -xleg[j - 1]; }
        const ac = a + b * xx, qexpo = ac * ac;
        if (qexpo > C3) break;
        const pplus = 2 * pnorm(ac), pminus = 2 * pnorm(ac - w);
        let rinsum = pplus * 0.5 - pminus * 0.5;
        if (rinsum >= Math.exp(C1 / cc1)) { rinsum = aleg[j - 1] * Math.exp(-(0.5 * qexpo)) * Math.pow(rinsum, cc1); elsum += rinsum; }
      }
      elsum *= 2 * b * cc / Math.sqrt(2 * Math.PI);
      einsum += elsum; blb = bub; bub += binc;
    }
    prW += einsum;
    if (prW <= Math.exp(C1 / rr)) return 0;
    prW = Math.pow(prW, rr);
    return prW >= 1 ? 1 : prW;
  }
  function ptukey(q, cc, df, lower, rr) { // P(Q <= q) for cc means, df error degrees of freedom
    rr = rr || 1; if (lower === undefined) lower = true;
    if (!(q > 0)) return lower ? 0 : 1;
    if (!isFinite(q)) return lower ? 1 : 0;
    let ans = 0;
    if (df > 25000) ans = wprob(q, rr, cc);
    else {
      const xlegq = GL16.x, alegq = GL16.w, eps1 = -30, eps2 = 1e-14;
      const f2 = df * 0.5; let f2lf = f2 * Math.log(df) - df * Math.LN2 - lgamma(f2); const f21 = f2 - 1, ff4 = df * 0.25;
      const ulen = df <= 100 ? 1 : df <= 800 ? 0.5 : df <= 5000 ? 0.25 : 0.125;
      f2lf += Math.log(ulen);
      for (let i = 1; i <= 50; i++) {
        let otsum = 0; const twa1 = (2 * i - 1) * ulen;
        for (let jj = 1; jj <= 16; jj++) {
          let j, t1, qsqz;
          if (8 < jj) { j = jj - 8 - 1; t1 = f2lf + f21 * Math.log(twa1 + xlegq[j] * ulen) - (xlegq[j] * ulen + twa1) * ff4; }
          else { j = jj - 1; t1 = f2lf + f21 * Math.log(twa1 - xlegq[j] * ulen) + (xlegq[j] * ulen - twa1) * ff4; }
          if (t1 >= eps1) {
            qsqz = 8 < jj ? q * Math.sqrt((xlegq[j] * ulen + twa1) * 0.5) : q * Math.sqrt((-(xlegq[j] * ulen) + twa1) * 0.5);
            otsum += wprob(qsqz, rr, cc) * alegq[j] * Math.exp(t1);
          }
        }
        if (i * ulen >= 1 && otsum <= eps2) break;
        ans += otsum;
      }
      if (ans > 1) ans = 1;
    }
    return lower ? ans : 1 - ans;
  }
  const qtukey = (p, cc, df) => solveMono(q => ptukey(q, cc, df), p, 3.5, 1.5);

  // ================================================================ basic helpers
  const sum = a => { let s = 0; for (const v of a) s += v; return s; };
  const mean = a => sum(a) / a.length;
  function variance(a, m) { if (m === undefined) m = mean(a); let s = 0; for (const v of a) s += (v - m) * (v - m); return s / (a.length - 1); }
  const sdv = a => Math.sqrt(variance(a));
  function quantile7(sorted, p) { // R type 7
    const n = sorted.length; if (!n) return NaN; const h = (n - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
    return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
  }
  // average ranks; returns { r, ties: [t...] } (sizes of tied groups)
  function rank(a) {
    const n = a.length, idx = Array.from({ length: n }, (_, i) => i).sort((p, q) => a[p] - a[q]), r = new Float64Array(n), ties = [];
    for (let i = 0; i < n;) {
      let j = i; while (j + 1 < n && a[idx[j + 1]] === a[idx[i]]) j++;
      const rv = (i + j + 2) / 2; for (let k = i; k <= j; k++) r[idx[k]] = rv;
      if (j > i) ties.push(j - i + 1); i = j + 1;
    }
    return { r, ties };
  }
  const tieSum = ties => ties.reduce((s, t) => s + t * t * t - t, 0);
  function adjust(ps, method) { // Bonferroni / Holm adjusted p-values
    const m = ps.length;
    if (method === 'bonferroni') return ps.map(p => Math.min(1, p * m));
    const o = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]), out = new Array(m); let run = 0;
    o.forEach(([p, i], k) => { run = Math.max(run, Math.min(1, (m - k) * p)); out[i] = run; });
    return out;
  }
  function colOf(ds, name) { const j = ds.names.indexOf(name); if (j < 0) fail('missing_column'); return j; }
  // factor levels in natural order of their labels (as R / JASP), numeric codes ascending
  const natural = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true });
  function levelOrder(ds, j, codes) { return ds.labels && ds.labels[j] ? codes.sort((a, b) => natural(levelName(ds, j, a), levelName(ds, j, b))) : codes.sort((a, b) => a - b); }
  function levelName(ds, j, v) { return ds.labels && ds.labels[j] ? ds.labels[j][v - 1] : String(v); }
  function modes(sorted) {
    let best = 0, out = [];
    for (let i = 0; i < sorted.length;) { let j = i; while (j + 1 < sorted.length && sorted[j + 1] === sorted[i]) j++; const c = j - i + 1; if (c > best) { best = c; out = [sorted[i]]; } else if (c === best) out.push(sorted[i]); i = j + 1; }
    return out;
  }

  // ================================================================ normality tests
  function poly(cc, x) { let ret = cc[0]; if (cc.length > 1) { let p = x * cc[cc.length - 1]; for (let j = cc.length - 2; j > 0; j--) p = (p + cc[j]) * x; ret += p; } return ret; }
  // Shapiro–Wilk W and p (Royston 1995, AS R94; identical to R shapiro.test and scipy.stats.shapiro), 3 <= n <= 5000
  function shapiroWilk(values) {
    const x = values.filter(v => !isNaN(v)).sort((a, b) => a - b), n = x.length;
    if (n < 3) return { w: NaN, p: NaN, n };
    const nn2 = Math.floor(n / 2), a = new Float64Array(nn2 + 1), an = n;
    const g = [-2.273, 0.459], c1 = [0, 0.221157, -0.147981, -2.07119, 4.434685, -2.706056], c2 = [0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633];
    const c3 = [0.544, -0.39978, 0.025054, -6.714e-4], c4 = [1.3822, -0.77857, 0.062767, -0.0020322], c5 = [-1.5861, -0.31082, -0.083751, 0.0038915], c6 = [-0.4803, -0.082676, 0.0030302];
    if (n === 3) a[1] = Math.SQRT1_2;
    else {
      const an25 = an + 0.25; let summ2 = 0;
      for (let i = 1; i <= nn2; i++) { a[i] = qnorm((i - 0.375) / an25); summ2 += a[i] * a[i]; }
      summ2 *= 2; const ssumm2 = Math.sqrt(summ2), rsn = 1 / Math.sqrt(an), a1 = poly(c1, rsn) - a[1] / ssumm2;
      let i1, fac;
      if (n > 5) { i1 = 3; const a2 = -a[2] / ssumm2 + poly(c2, rsn); fac = Math.sqrt((summ2 - 2 * a[1] * a[1] - 2 * a[2] * a[2]) / (1 - 2 * a1 * a1 - 2 * a2 * a2)); a[2] = a2; }
      else { i1 = 2; fac = Math.sqrt((summ2 - 2 * a[1] * a[1]) / (1 - 2 * a1 * a1)); }
      a[1] = a1; for (let i = i1; i <= nn2; i++) a[i] /= -fac;
    }
    const range = x[n - 1] - x[0]; if (range < 1e-19) return { w: NaN, p: NaN, n };
    const af = i => { const j = n - 1 - i; return i === j ? 0 : (i < j ? -a[1 + i] : a[1 + j]); };
    let sa = 0, sx = 0; for (let i = 0; i < n; i++) { sa += af(i); sx += x[i] / range; } sa /= n; sx /= n;
    let ssa = 0, ssx = 0, sax = 0;
    for (let i = 0; i < n; i++) { const asa = af(i) - sa, xsx = x[i] / range - sx; ssa += asa * asa; ssx += xsx * xsx; sax += asa * xsx; }
    const ssassx = Math.sqrt(ssa * ssx), w1 = (ssassx - sax) * (ssassx + sax) / (ssa * ssx), w = 1 - w1;
    let p;
    if (n === 3) { p = Math.max(0, 1.90985931710274 * (Math.asin(Math.sqrt(w)) - 1.04719755119660)); return { w, p, n }; }
    let y = Math.log(w1), m, s; const xx = Math.log(an);
    if (n <= 11) { const gamma = poly(g, an); if (y >= gamma) return { w, p: 1e-99, n }; y = -Math.log(gamma - y); m = poly(c3, an); s = Math.exp(poly(c4, an)); }
    else { m = poly(c5, xx); s = Math.exp(poly(c6, xx)); }
    p = pnorm(-(y - m) / s);
    return { w, p, n, large: n > 5000 };
  }
  // Kolmogorov–Smirnov with Lilliefors correction (Dallal & Wilkinson 1986 p-value, as R nortest::lillie.test)
  function lilliefors(values) {
    const x = values.filter(v => !isNaN(v)).sort((a, b) => a - b), n = x.length;
    if (n < 5) return { d: NaN, p: NaN, n };
    const m = mean(x), s = sdv(x); let dp = -Infinity, dm = -Infinity;
    for (let i = 0; i < n; i++) { const p = pnorm((x[i] - m) / s); dp = Math.max(dp, (i + 1) / n - p); dm = Math.max(dm, p - i / n); }
    const K = Math.max(dp, dm); let Kd = K, nd = n;
    if (n > 100) { Kd = K * Math.pow(n / 100, 0.49); nd = 100; }
    let p = Math.exp(-7.01256 * Kd * Kd * (nd + 2.78019) + 2.99587 * Kd * Math.sqrt(nd + 2.78019) - 0.122119 + 0.974598 / Math.sqrt(nd) + 1.67997 / nd);
    if (p > 0.1) {
      const KK = (Math.sqrt(n) - 0.01 + 0.85 / Math.sqrt(n)) * K;
      if (KK <= 0.302) p = 1;
      else if (KK <= 0.5) p = 2.76773 - 19.828315 * KK + 80.709644 * KK ** 2 - 138.55152 * KK ** 3 + 81.218052 * KK ** 4;
      else if (KK <= 0.9) p = -4.901232 + 40.662806 * KK - 97.490286 * KK ** 2 + 94.029866 * KK ** 3 - 32.355711 * KK ** 4;
      else if (KK <= 1.31) p = 6.198765 - 19.558097 * KK + 23.186922 * KK ** 2 - 12.234627 * KK ** 3 + 2.423045 * KK ** 4;
      else p = 0;
    }
    return { d: K, p, n };
  }
  // Anderson–Darling normality test (Stephens 1986 small-sample adjustment and p-value, as R nortest::ad.test)
  function andersonDarling(values) {
    const x = values.filter(v => !isNaN(v)).sort((a, b) => a - b), n = x.length;
    if (n < 8) return { a2: NaN, p: NaN, n };
    const m = mean(x), s = sdv(x); let h = 0;
    for (let i = 0; i < n; i++) { const z1 = (x[i] - m) / s, z2 = (x[n - 1 - i] - m) / s; h += (2 * (i + 1) - 1) * (Math.log(pnorm(z1)) + Math.log(pnorm(-z2))); }
    const A = -n - h / n, AA = (1 + 0.75 / n + 2.25 / (n * n)) * A;
    let p;
    if (AA < 0.2) p = 1 - Math.exp(-13.436 + 101.14 * AA - 223.73 * AA * AA);
    else if (AA < 0.34) p = 1 - Math.exp(-8.318 + 42.796 * AA - 59.938 * AA * AA);
    else if (AA < 0.6) p = Math.exp(0.9177 - 4.279 * AA - 1.38 * AA * AA);
    else if (AA < 10) p = Math.exp(1.2937 - 5.709 * AA + 0.0186 * AA * AA);
    else p = 3.7e-24;
    return { a2: A, a2adj: AA, p, n };
  }

  // ================================================================ exact rank distributions
  // counts of the Mann–Whitney U for sample sizes m, n (U = 0..mn), additions only
  function mwCounts(m, n) {
    const L = m * n + 1; let prev = []; for (let j = 0; j <= n; j++) { const a = new Float64Array(L); a[0] = 1; prev.push(a); }
    for (let i = 1; i <= m; i++) {
      const cur = []; const c0 = new Float64Array(L); c0[0] = 1; cur.push(c0);
      for (let j = 1; j <= n; j++) { const c = new Float64Array(L), pj = prev[j], cl = cur[j - 1]; for (let u = 0; u < L; u++) c[u] = cl[u] + (u >= j ? pj[u - j] : 0); cur.push(c); }
      prev = cur;
    }
    return prev[n];
  }
  function pwilcoxLower(q, counts) { let s = 0, tot = 0; for (let u = 0; u < counts.length; u++) { tot += counts[u]; if (u <= q) s += counts[u]; } return s / tot; }
  function signrankCounts(n) { const L = n * (n + 1) / 2 + 1, c = new Float64Array(L); c[0] = 1; for (let k = 1; k <= n; k++) for (let s = L - 1; s >= k; s--) c[s] += c[s - k]; return c; }
  function exactP(stat, counts, center, alt) { // R's convention for wilcox.test exact p-values
    const lowerP = q => q < 0 ? 0 : pwilcoxLower(Math.floor(q), counts);
    if (alt === 'greater') return 1 - lowerP(stat - 1);
    if (alt === 'less') return lowerP(stat);
    const p = stat > center ? 1 - lowerP(stat - 1) : lowerP(stat);
    return Math.min(1, 2 * p);
  }
  function zP(z, alt) { return alt === 'greater' ? pnorm(-z) : alt === 'less' ? pnorm(z) : 2 * pnorm(-Math.abs(z)); }
  function tP(t, df, alt) { return alt === 'greater' ? pt(t, df, false) : alt === 'less' ? pt(t, df) : Math.min(1, 2 * pt(-Math.abs(t), df)); }
  function median(a) { const s = Float64Array.from(a).sort(); return quantile7(s, 0.5); }

  // Mann–Whitney U (R wilcox.test conventions: W = U of the first sample; exact if n1, n2 < 50 without ties)
  function mannWhitney(x, y, alt, opts) {
    opts = opts || {}; const n1 = x.length, n2 = y.length, all = Array.from(x).concat(Array.from(y)), rk = rank(all);
    let r1 = 0; for (let i = 0; i < n1; i++) r1 += rk.r[i];
    const W = r1 - n1 * (n1 + 1) / 2, N = n1 + n2, exact = opts.exact !== undefined ? opts.exact && !rk.ties.length : (n1 < 50 && n2 < 50 && !rk.ties.length);
    let p, z = NaN;
    if (exact) p = exactP(W, mwCounts(n1, n2), n1 * n2 / 2, alt);
    else {
      const sigma = Math.sqrt(n1 * n2 / 12 * ((N + 1) - tieSum(rk.ties) / (N * (N - 1))));
      let zz = W - n1 * n2 / 2; const corr = alt === 'greater' ? 0.5 : alt === 'less' ? -0.5 : Math.sign(zz) * 0.5;
      z = (zz - corr) / sigma; p = zP(z, alt);
    }
    const rbc = 2 * W / (n1 * n2) - 1, se = Math.sqrt((N + 1) / (3 * n1 * n2));
    let hl = NaN; if (n1 * n2 <= 4e6) { const d = new Float64Array(n1 * n2); let k = 0; for (const a of x) for (const b of y) d[k++] = a - b; hl = median(d); }
    return { W, U: W, p, z, exact, rbc, rbcSE: se, hl, n1, n2, meanRank1: r1 / n1, meanRank2: (N * (N + 1) / 2 - r1) / n2 };
  }
  // Wilcoxon signed-rank on d = x - mu (zeros dropped; exact if n < 50 without ties or zeros)
  function signedRank(d, alt, opts) {
    opts = opts || {}; const all = Array.from(d), nz = all.filter(v => v !== 0), zeros = all.length - nz.length, n = nz.length;
    if (n < 1) return { V: NaN, p: NaN, n };
    const rk = rank(nz.map(Math.abs)); let V = 0, Vn = 0; nz.forEach((v, i) => { if (v > 0) V += rk.r[i]; else Vn += rk.r[i]; });
    const exact = opts.exact !== undefined ? opts.exact && !rk.ties.length && !zeros : (n < 50 && !rk.ties.length && !zeros);
    let p, z = NaN;
    if (exact) p = exactP(V, signrankCounts(n), n * (n + 1) / 4, alt);
    else {
      const sigma = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24 - tieSum(rk.ties) / 48), zz = V - n * (n + 1) / 4;
      const corr = alt === 'greater' ? 0.5 : alt === 'less' ? -0.5 : Math.sign(zz) * 0.5; z = (zz - corr) / sigma; p = zP(z, alt);
    }
    const tot = n * (n + 1) / 2, rbc = (V - Vn) / tot, se = Math.sqrt((2 * n ** 3 + 3 * n ** 2 + n) / 6) / tot;
    let hl = NaN; if (all.length <= 3000) { const w = []; for (let i = 0; i < all.length; i++) for (let j = i; j < all.length; j++) w.push((all[i] + all[j]) / 2); hl = median(w); }
    return { V, p, z, exact, n, zeros, rbc, rbcSE: se, hl };
  }
  function binomTwoSidedHalf(k, n, alt) { // exact binomial test with p0 = 1/2
    const lp = j => { let s = 0; for (let i = 0; i <= j; i++) s += Math.exp(lgamma(n + 1) - lgamma(i + 1) - lgamma(n - i + 1) - n * Math.LN2); return Math.min(1, s); };
    if (alt === 'greater') return k <= 0 ? 1 : 1 - lp(k - 1);
    if (alt === 'less') return lp(k);
    return Math.min(1, 2 * Math.min(lp(k), k <= 0 ? 1 : 1 - lp(k - 1)));
  }
  function levene(groups, center) { // Levene (center = mean) or Brown–Forsythe (center = median): one-way ANOVA on |y - centre|
    const z = groups.map(g => { const c = center === 'median' ? median(g) : mean(g); return g.map(v => Math.abs(v - c)); });
    return onewayF(z);
  }
  function onewayF(groups) {
    const k = groups.length, N = groups.reduce((s, g) => s + g.length, 0), gm = groups.reduce((s, g) => s + sum(g), 0) / N;
    let ssb = 0, ssw = 0; groups.forEach(g => { const m = mean(g); ssb += g.length * (m - gm) ** 2; g.forEach(v => { ssw += (v - m) ** 2; }); });
    const df1 = k - 1, df2 = N - k, F = (ssb / df1) / (ssw / df2);
    return { F, df1, df2, p: pf(F, df1, df2), ssb, ssw };
  }

  E.st = { lgamma, ibeta, gammaP, gammaQ, pnorm, qnorm, dnorm, pt, qt, dt, pf, pchisq, pnt, ncpCI, ptukey, qtukey, shapiroWilk, lilliefors, andersonDarling, mwCounts, signrankCounts, mannWhitney, signedRank, binomTwoSidedHalf, levene, onewayF, rank, adjust, quantile7, mean, variance, median, solveMono };

  // ================================================================ descriptives & normality tasks
  function groupsOf(ds, gname, rowsOk) { // [{value, label, rows:[i]}] sorted by code
    const g = colOf(ds, gname), col = ds.cols[g], map = new Map();
    for (let i = 0; i < ds.n; i++) { const v = col[i]; if (isNaN(v) || (rowsOk && !rowsOk(i))) continue; if (!map.has(v)) map.set(v, []); map.get(v).push(i); }
    return levelOrder(ds, g, Array.from(map.keys())).map(v => ({ value: v, label: levelName(ds, g, v), rows: map.get(v) }));
  }
  function describeValues(all, o) {
    o = o || {}; const x = all.filter(v => !isNaN(v)), n = x.length, s = Float64Array.from(x).sort(), level = o.ci || 0.95;
    const out = { n, missing: all.length - n };
    if (!n) return out;
    const m = mean(x), v = n > 1 ? variance(x, m) : NaN, sd = Math.sqrt(v), se = sd / Math.sqrt(n), tq = n > 1 ? qt(1 - (1 - level) / 2, n - 1) : NaN;
    let m3 = 0, m4 = 0; for (const a of x) { const d = (a - m) / sd; m3 += d ** 3; m4 += d ** 4; }
    const md = modes(s);
    Object.assign(out, {
      mean: m, se, sd, variance: v, ciLo: m - tq * se, ciHi: m + tq * se, median: quantile7(s, 0.5), mode: md[0], multiMode: md.length > 1,
      min: s[0], max: s[n - 1], range: s[n - 1] - s[0], q1: quantile7(s, 0.25), q3: quantile7(s, 0.75), sum: sum(x),
      skew: n > 2 ? n / ((n - 1) * (n - 2)) * m3 : NaN, kurt: n > 3 ? n * (n + 1) / ((n - 1) * (n - 2) * (n - 3)) * m4 - 3 * (n - 1) ** 2 / ((n - 2) * (n - 3)) : NaN,
      cv: sd / m
    });
    out.iqr = out.q3 - out.q1;
    out.seSkew = n > 2 ? Math.sqrt(6 * n * (n - 1) / ((n - 2) * (n + 1) * (n + 3))) : NaN;
    out.seKurt = n > 3 ? 2 * out.seSkew * Math.sqrt((n * n - 1) / ((n - 3) * (n + 5))) : NaN;
    out.pct = (o.pct || []).map(p => ({ p, v: quantile7(s, p / 100) }));
    if (n >= 3 && n <= 5000) { const sw = shapiroWilk(x); out.swW = sw.w; out.swP = sw.p; }
    if (o.keep !== false) out.values = Array.from(s);
    return out;
  }
  E.tasks.st_desc = function (ds, model, settings, opts) {
    const vars = opts.vars || []; if (!vars.length) fail('st_need_vars');
    const groups = opts.split ? groupsOf(ds, opts.split) : [{ label: null, rows: null }];
    const res = vars.map(name => {
      const j = colOf(ds, name), col = ds.cols[j], isCat = ds.kinds[j] === 'cat';
      const sub = groups.map(g => { const vals = g.rows ? g.rows.map(i => col[i]) : Array.from(col); return Object.assign({ label: g.label }, isCat ? { n: vals.filter(v => !isNaN(v)).length, missing: vals.filter(v => isNaN(v)).length } : describeValues(vals, opts)); });
      let freq = null;
      const distinct = new Set(Array.from(col).filter(v => !isNaN(v)));
      if (isCat || (opts.freq && distinct.size <= 12)) {
        const levels = levelOrder(ds, j, Array.from(distinct)), valid = Array.from(col).filter(v => !isNaN(v)).length; let cum = 0;
        freq = { rows: levels.map(v => { const c = Array.from(col).filter(x => x === v).length; cum += c; return { label: levelName(ds, j, v), count: c, pct: 100 * c / ds.n, valid: 100 * c / valid, cum: 100 * cum / valid }; }), missing: ds.n - valid, total: ds.n };
      }
      return { name, cat: isCat, groups: sub, freq };
    });
    return { kind: 'st_desc', vars: res, split: opts.split || null, ci: opts.ci || 0.95, pct: opts.pct || [] };
  };
  E.tasks.st_normality = function (ds, model, settings, opts) {
    const vars = opts.vars || []; if (!vars.length) fail('st_need_vars');
    const groups = opts.split ? groupsOf(ds, opts.split) : [{ label: null, rows: null }];
    const rows = [];
    vars.forEach(name => {
      const j = colOf(ds, name), col = ds.cols[j];
      groups.forEach(g => {
        const x = (g.rows ? g.rows.map(i => col[i]) : Array.from(col)).filter(v => !isNaN(v)), m = x.length ? mean(x) : NaN, s = x.length > 1 ? sdv(x) : NaN;
        rows.push({ name, group: g.label, n: x.length, mean: m, sd: s, sw: shapiroWilk(x), ks: lilliefors(x), ad: andersonDarling(x), values: x.slice().sort((a, b) => a - b) });
      });
    });
    return { kind: 'st_normality', rows, split: opts.split || null };
  };

  // ================================================================ t-tests
  const ALT = a => (a === 'greater' || a === 'less') ? a : 'two';
  function meanCI(est, se, df, level, alt) {
    const a = 1 - level;
    if (alt === 'greater') return [est - qt(1 - a, df) * se, Infinity];
    if (alt === 'less') return [-Infinity, est + qt(1 - a, df) * se];
    const q = qt(1 - a / 2, df); return [est - q * se, est + q * se];
  }
  const hedgesJ = df => Math.exp(lgamma(df / 2) - 0.5 * Math.log(df / 2) - lgamma((df - 1) / 2));
  function rbcCI(r, se, level, alt) {
    const z = Math.atanh(Math.max(-0.9999999, Math.min(0.9999999, r))), a = 1 - level;
    if (alt === 'greater') return [Math.tanh(z - qnorm(1 - a) * se), 1];
    if (alt === 'less') return [-1, Math.tanh(z + qnorm(1 - a) * se)];
    const q = qnorm(1 - a / 2); return [Math.tanh(z - q * se), Math.tanh(z + q * se)];
  }
  E.tasks.st_ttest_one = function (ds, model, settings, opts) {
    const vars = opts.vars || []; if (!vars.length) fail('st_need_vars');
    const mu = +opts.mu || 0, alt = ALT(opts.alt), level = +opts.ci || 0.95;
    const rows = vars.map(name => {
      const x = Array.from(ds.cols[colOf(ds, name)]).filter(v => !isNaN(v)), n = x.length;
      if (n < 2) fail('st_too_few');
      const m = mean(x), sd = sdv(x), se = sd / Math.sqrt(n), df = n - 1, t = (m - mu) / se;
      const ci = meanCI(m - mu, se, df, level, alt), d = (m - mu) / sd, nc = ncpCI(t, df, level, alt), J = hedgesJ(df);
      const out = { name, n, mean: m, sd, se, mu, t, df, p: tP(t, df, alt), md: m - mu, lo: ci[0], hi: ci[1], d, dLo: nc[0] / Math.sqrt(n), dHi: nc[1] / Math.sqrt(n), g: d * J, gLo: nc[0] / Math.sqrt(n) * J, gHi: nc[1] / Math.sqrt(n) * J, sw: shapiroWilk(x), values: x };
      const w = signedRank(x.map(v => v - mu), alt); out.wilcoxon = Object.assign(w, { ci: rbcCI(w.rbc, w.rbcSE, level, alt) });
      return out;
    });
    return { kind: 'st_ttest', design: 'one', rows, alt, level, mu, tests: opts.tests || { student: true }, effect: opts.effect || 'd' };
  };
  E.tasks.st_ttest_ind = function (ds, model, settings, opts) {
    const vars = opts.vars || []; if (!vars.length) fail('st_need_vars');
    const gname = opts.group || opts.groupVar; if (!gname) fail('st_need_group');
    let groups = groupsOf(ds, gname);
    if (opts.groups && opts.groups.length === 2) { if (opts.groups[0] === opts.groups[1]) fail('same_group'); groups = opts.groups.map(v => groups.find(g => g.value === v)).filter(Boolean); }
    if (groups.length !== 2) fail('st_two_groups');
    const alt = ALT(opts.alt), level = +opts.ci || 0.95, center = opts.center === 'median' ? 'median' : 'mean';
    const rows = vars.map(name => {
      const col = ds.cols[colOf(ds, name)], x = groups[0].rows.map(i => col[i]).filter(v => !isNaN(v)), y = groups[1].rows.map(i => col[i]).filter(v => !isNaN(v));
      const n1 = x.length, n2 = y.length; if (n1 < 2 || n2 < 2) fail('st_too_few');
      const m1 = mean(x), m2 = mean(y), v1 = variance(x), v2 = variance(y), md = m1 - m2;
      // Student (pooled variance)
      const df = n1 + n2 - 2, sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) / df, se = Math.sqrt(sp2 * (1 / n1 + 1 / n2)), t = md / se, ci = meanCI(md, se, df, level, alt);
      const d = md / Math.sqrt(sp2), sc = Math.sqrt(1 / n1 + 1 / n2), nc = ncpCI(t, df, level, alt), J = hedgesJ(df);
      const student = { t, df, p: tP(t, df, alt), md, se, lo: ci[0], hi: ci[1], d, dLo: nc[0] * sc, dHi: nc[1] * sc, g: d * J, gLo: nc[0] * sc * J, gHi: nc[1] * sc * J, delta: md / Math.sqrt(v2) };
      // Welch–Satterthwaite
      const sew = Math.sqrt(v1 / n1 + v2 / n2), tw = md / sew, dfw = (v1 / n1 + v2 / n2) ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1)), ciw = meanCI(md, sew, dfw, level, alt);
      const dw = md / Math.sqrt((v1 + v2) / 2), Jw = hedgesJ(dfw);
      const welch = { t: tw, df: dfw, p: tP(tw, dfw, alt), md, se: sew, lo: ciw[0], hi: ciw[1], d: dw, g: dw * Jw, delta: md / Math.sqrt(v2) };
      const mw = mannWhitney(x, y, alt); mw.ci = rbcCI(mw.rbc, mw.rbcSE, level, alt);
      return {
        name, student, welch, mann: mw, levene: levene([x, y], center),
        desc: [{ label: groups[0].label, n: n1, mean: m1, sd: Math.sqrt(v1), se: Math.sqrt(v1 / n1), sw: shapiroWilk(x), values: x }, { label: groups[1].label, n: n2, mean: m2, sd: Math.sqrt(v2), se: Math.sqrt(v2 / n2), sw: shapiroWilk(y), values: y }]
      };
    });
    return { kind: 'st_ttest', design: 'ind', group: gname, labels: groups.map(g => g.label), rows, alt, level, center, tests: opts.tests || { student: true }, effect: opts.effect || 'd' };
  };
  E.tasks.st_ttest_paired = function (ds, model, settings, opts) {
    const pairs = (opts.pairs || []).filter(p => p[0] && p[1] && p[0] !== p[1]); if (!pairs.length) fail('st_need_pairs');
    const alt = ALT(opts.alt), level = +opts.ci || 0.95;
    const rows = pairs.map(([a, b]) => {
      const ca = ds.cols[colOf(ds, a)], cb = ds.cols[colOf(ds, b)], x = [], y = [];
      for (let i = 0; i < ds.n; i++) if (!isNaN(ca[i]) && !isNaN(cb[i])) { x.push(ca[i]); y.push(cb[i]); }
      const n = x.length; if (n < 2) fail('st_too_few');
      const dd = x.map((v, i) => v - y[i]), m = mean(dd), sd = sdv(dd), se = sd / Math.sqrt(n), df = n - 1, t = m / se, ci = meanCI(m, se, df, level, alt);
      const d = m / sd, nc = ncpCI(t, df, level, alt), J = hedgesJ(df);
      const w = signedRank(dd, alt); w.ci = rbcCI(w.rbc, w.rbcSE, level, alt);
      const pos = dd.filter(v => v > 0).length, neg = dd.filter(v => v < 0).length;
      return {
        name: a + ' − ' + b, a, b, n, t, df, p: tP(t, df, alt), md: m, sd, se, lo: ci[0], hi: ci[1], d, dLo: nc[0] / Math.sqrt(n), dHi: nc[1] / Math.sqrt(n), g: d * J, gLo: nc[0] / Math.sqrt(n) * J, gHi: nc[1] / Math.sqrt(n) * J,
        wilcoxon: w, sign: { pos, neg, ties: n - pos - neg, p: binomTwoSidedHalf(pos, pos + neg, alt) }, sw: shapiroWilk(dd), values: dd,
        desc: [{ label: a, n, mean: mean(x), sd: sdv(x), se: sdv(x) / Math.sqrt(n), values: x }, { label: b, n, mean: mean(y), sd: sdv(y), se: sdv(y) / Math.sqrt(n), values: y }]
      };
    });
    return { kind: 'st_ttest', design: 'paired', rows, alt, level, tests: opts.tests || { student: true }, effect: opts.effect || 'd' };
  };
  // ================================================================ linear-model machinery
  // small dense helpers (row-major arrays)
  function chol(A) { // lower L with A = L L'
    const n = A.length, L = A.map(() => new Float64Array(n));
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
      let s = A[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) { if (!(s > 0)) fail('st_singular'); L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j];
    }
    return L;
  }
  const logdet = A => { const L = chol(A); let s = 0; for (let i = 0; i < L.length; i++) s += 2 * Math.log(L[i][i]); return s; };
  function invSPD(A) { // inverse of a symmetric positive-definite matrix
    const n = A.length, L = chol(A), Li = L.map(() => new Float64Array(n));
    for (let i = 0; i < n; i++) { Li[i][i] = 1 / L[i][i]; for (let j = 0; j < i; j++) { let s = 0; for (let k = j; k < i; k++) s -= L[i][k] * Li[k][j]; Li[i][j] = s / L[i][i]; } }
    const R = A.map(() => new Array(n).fill(0));
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s = 0; for (let k = i; k < n; k++) s += Li[k][i] * Li[k][j]; R[i][j] = R[j][i] = s; }
    return R;
  }
  function symEigen(S) { // cyclic Jacobi with a relative stopping rule; eigenvalues descending
    const n = S.length, A = S.map(r => Array.from(r)); let scale = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) scale += A[i][j] * A[i][j];
    for (let sweep = 0; sweep < 200; sweep++) {
      let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
      if (off <= 1e-30 * scale) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (A[p][q] === 0) continue;
        const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
        for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      }
    }
    return A.map((r, i) => r[i]).sort((a, b) => b - a);
  }
  // eigenvalues of E^-1 H (H, E symmetric, E positive definite)
  function relEigen(H, E_) {
    const L = chol(E_), n = L.length, Li = L.map(() => new Float64Array(n));
    for (let i = 0; i < n; i++) { Li[i][i] = 1 / L[i][i]; for (let j = 0; j < i; j++) { let s = 0; for (let k = j; k < i; k++) s -= L[i][k] * Li[k][j]; Li[i][j] = s / L[i][i]; } }
    const T = Li.map(r => H[0].map((_, j) => { let s = 0; for (let k = 0; k < n; k++) s += r[k] * H[k][j]; return s; }));
    const M = T.map(r => Li.map(c => { let s = 0; for (let k = 0; k < n; k++) s += r[k] * c[k]; return s; }));
    for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) M[i][j] = M[j][i] = (M[i][j] + M[j][i]) / 2;
    return symEigen(M).map(v => Math.max(0, v));
  }
  // least squares by Householder QR. cols: p predictor columns, Ys: m responses. Returns coefficients (p×m),
  // (X'X)^-1, residual SSCP (m×m) and residual df.
  function lsq(cols, Ys) {
    const p = cols.length, n = Ys[0].length, A = cols.map(c => Float64Array.from(c)), Y = Ys.map(y => Float64Array.from(y)), m = Y.length;
    if (n <= p) fail('st_too_few');
    const norms0 = A.map(c => Math.sqrt(c.reduce((s, v) => s + v * v, 0)));
    for (let k = 0; k < p; k++) {
      const ak = A[k]; let s = 0; for (let i = k; i < n; i++) s += ak[i] * ak[i];
      const nrm = Math.sqrt(s); if (!(nrm > 1e-9 * (norms0[k] || 1))) fail('st_singular');
      const alpha = ak[k] > 0 ? -nrm : nrm, v0 = ak[k] - alpha, vv = s - ak[k] * ak[k] + v0 * v0;
      const apply = col => { let dot = v0 * col[k]; for (let i = k + 1; i < n; i++) dot += ak[i] * col[i]; const f = 2 * dot / vv; col[k] -= f * v0; for (let i = k + 1; i < n; i++) col[i] -= f * ak[i]; };
      for (let j = k + 1; j < p; j++) apply(A[j]); Y.forEach(apply); ak[k] = alpha;
    }
    const R = (i, j) => A[j][i], Ri = Array.from({ length: p }, () => new Float64Array(p));
    for (let j = p - 1; j >= 0; j--) { Ri[j][j] = 1 / R(j, j); for (let i = j - 1; i >= 0; i--) { let s = 0; for (let k = i + 1; k <= j; k++) s += R(i, k) * Ri[k][j]; Ri[i][j] = -s / R(i, i); } }
    const XtXi = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => { let s = 0; for (let k = Math.max(i, j); k < p; k++) s += Ri[i][k] * Ri[j][k]; return s; }));
    const coef = Array.from({ length: p }, (_, i) => Y.map(y => { let s = 0; for (let k = i; k < p; k++) s += Ri[i][k] * y[k]; return s; }));
    const SSE = Y.map(a => Y.map(b => { let s = 0; for (let i = p; i < n; i++) s += a[i] * b[i]; return s; }));
    return { coef, XtXi, SSE, df: n - p, n, p };
  }
  // effect (sum-to-zero) coded design for factors (codes 0..L-1), covariates and terms
  // term: { name, f: [factor indices], c: covariate index or -1 }
  function rowBuilder(facs, terms) {
    return (levels, covVals) => {
      const x = [1];
      terms.forEach(tm => {
        let vals = [1];
        tm.f.forEach(fi => { const L = facs[fi].L, lv = levels[fi], e = []; for (let c = 0; c < L - 1; c++) e.push(lv === c ? 1 : lv === L - 1 ? -1 : 0); const nv = []; vals.forEach(a => e.forEach(b => nv.push(a * b))); vals = nv; });
        if (tm.c >= 0) vals = vals.map(v => v * covVals[tm.c]);
        x.push(...vals);
      });
      return x;
    };
  }
  function termIndex(facs, terms) { // column indices of each term in the design
    let k = 1; return terms.map(tm => { let w = tm.f.reduce((s, fi) => s * (facs[fi].L - 1), 1); const idx = []; for (let i = 0; i < w; i++) idx.push(k++); return idx; });
  }
  const sub = (M, idx) => idx.map(i => idx.map(j => M[i][j]));
  function quadInv(b, V) { // b' V^-1 b
    const Vi = invSPD(V); let s = 0; for (let i = 0; i < b.length; i++) for (let j = 0; j < b.length; j++) s += b[i] * Vi[i][j] * b[j]; return s;
  }
  function hypSSCP(fit, idx) { // multivariate hypothesis SSCP for the coefficients idx (Type III)
    const Vi = invSPD(sub(fit.XtXi, idx)), m = fit.coef[0].length, B = idx.map(i => fit.coef[i]);
    return Array.from({ length: m }, (_, a) => Array.from({ length: m }, (_, b) => { let s = 0; for (let i = 0; i < idx.length; i++) for (let j = 0; j < idx.length; j++) s += B[i][a] * Vi[i][j] * B[j][b]; return s; }));
  }
  const containsTerm = (u, t) => u !== t && t.vars.every(v => u.vars.includes(v)) && u.vars.length > t.vars.length;
  function allSubsets(k, minSize) { const out = []; for (let mask = 1; mask < (1 << k); mask++) { const s = []; for (let i = 0; i < k; i++) if (mask & (1 << i)) s.push(i); if (s.length >= minSize) out.push(s); } return out.sort((a, b) => a.length - b.length); }
  function makeTerms(facNames, covNames, extraSlopes) {
    const terms = [];
    facNames.forEach((nm, i) => terms.push({ name: nm, f: [i], c: -1, vars: ['f' + i] }));
    allSubsets(facNames.length, 2).forEach(s => terms.push({ name: s.map(i => facNames[i]).join(' ✻ '), f: s, c: -1, vars: s.map(i => 'f' + i) }));
    covNames.forEach((nm, i) => terms.push({ name: nm, f: [], c: i, vars: ['c' + i] })); // as JASP / R: factorial terms, then covariates
    if (extraSlopes) facNames.forEach((fn, i) => covNames.forEach((cn, j) => terms.push({ name: fn + ' ✻ ' + cn, f: [i], c: j, vars: ['f' + i, 'c' + j], slope: true })));
    return terms;
  }
  // core univariate linear model with SS of a given type
  function glm(y, facs, covs, terms, ssType) {
    const n = y.length, build = rowBuilder(facs, terms), tIdx = termIndex(facs, terms);
    const rows = []; for (let i = 0; i < n; i++) rows.push(build(facs.map(f => f.codes[i]), covs.map(c => c[i])));
    const p = rows[0].length, colsAll = Array.from({ length: p }, (_, j) => Float64Array.from(rows, r => r[j]));
    const fit = lsq(colsAll, [y]), sse = fit.SSE[0][0], dfe = fit.df, mse = sse / dfe;
    const rss = idxs => lsq(idxs.map(j => colsAll[j]), [y]).SSE[0][0];
    const ss = terms.map((tm, k) => {
      if (ssType === 1) { const before = [0].concat(...tIdx.slice(0, k)); return rss(before) - rss(before.concat(tIdx[k])); }
      if (ssType === 2) { const base = [0].concat(...terms.map((u, q) => (q !== k && !containsTerm(u, tm)) ? tIdx[q] : [])); return rss(base) - rss(base.concat(tIdx[k])); }
      return quadInv(tIdx[k].map(j => fit.coef[j][0]), sub(fit.XtXi, tIdx[k]));
    });
    const ym = mean(y); let sst = 0; for (const v of y) sst += (v - ym) ** 2;
    const table = terms.map((tm, k) => {
      const df = tIdx[k].length, ms = ss[k] / df, F = ms / mse;
      return { term: tm.name, slope: !!tm.slope, ss: ss[k], df, ms, F, p: pf(F, df, dfe), eta2: ss[k] / sst, peta2: ss[k] / (ss[k] + sse), omega2: (ss[k] - df * mse) / (sst + mse), pomega2: (ss[k] - df * mse) / (ss[k] + (n - df) * mse) };
    });
    const b = fit.coef.map(r => r[0]), fitted = rows.map(r => r.reduce((s, v, j) => s + v * b[j], 0)), resid = y.map((v, i) => v - fitted[i]);
    return { table, sse, dfe, mse, sst, n, b, XtXi: fit.XtXi, build, resid, fitted };
  }
  // estimated marginal means of a factor (other factors averaged with equal weights, covariates at their means)
  function emmFactor(model, facs, fi, covMeans) {
    const others = facs.map((f, i) => i).filter(i => i !== fi), grid = [[]];
    others.forEach(i => { const ng = []; grid.forEach(g => { for (let l = 0; l < facs[i].L; l++) ng.push(g.concat([[i, l]])); }); grid.splice(0, grid.length, ...ng); });
    return Array.from({ length: facs[fi].L }, (_, lv) => {
      const Lv = new Array(model.b.length).fill(0);
      grid.forEach(g => { const levels = new Array(facs.length).fill(0); levels[fi] = lv; g.forEach(([i, l]) => { levels[i] = l; }); model.build(levels, covMeans).forEach((v, j) => { Lv[j] += v / grid.length; }); });
      return Lv;
    });
  }
  const lin = (L, b) => L.reduce((s, v, j) => s + v * b[j], 0);
  const quad = (L, V) => { let s = 0; for (let i = 0; i < L.length; i++) if (L[i]) for (let j = 0; j < L.length; j++) s += L[i] * V[i][j] * L[j]; return s; };
  function emmTable(model, Ls, labels, level) {
    const q = qt(1 - (1 - level) / 2, model.dfe);
    return Ls.map((L, i) => { const m = lin(L, model.b), se = Math.sqrt(quad(L, model.XtXi) * model.mse); return { level: labels[i], mean: m, se, lo: m - q * se, hi: m + q * se, df: model.dfe }; });
  }
  function posthocEMM(model, Ls, labels, level) { // pairwise comparisons of marginal means
    const k = Ls.length, out = [], qq = k > 1 ? qtukey(level, k, model.dfe) / Math.SQRT2 : NaN;
    for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) {
      const c = Ls[a].map((v, j) => v - Ls[b][j]), diff = lin(c, model.b), se = Math.sqrt(quad(c, model.XtXi) * model.mse), t = diff / se, df = model.dfe;
      out.push({ a: labels[a], b: labels[b], diff, se, t, df, d: diff / Math.sqrt(model.mse), p: 2 * pt(-Math.abs(t), df), pTukey: ptukey(Math.abs(t) * Math.SQRT2, k, df, false), pScheffe: pf(t * t / (k - 1), k - 1, df), lo: diff - qq * se, hi: diff + qq * se });
    }
    const pb = adjust(out.map(r => r.p), 'bonferroni'), ph = adjust(out.map(r => r.p), 'holm');
    out.forEach((r, i) => { r.pBonf = pb[i]; r.pHolm = ph[i]; });
    return out;
  }
  function gamesHowell(groups, labels) {
    const k = groups.length, st = groups.map(g => ({ n: g.length, m: mean(g), v: variance(g) })), out = [];
    for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) {
      const A = st[a], B = st[b], diff = A.m - B.m, se = Math.sqrt(A.v / A.n + B.v / B.n), t = diff / se;
      const df = (A.v / A.n + B.v / B.n) ** 2 / ((A.v / A.n) ** 2 / (A.n - 1) + (B.v / B.n) ** 2 / (B.n - 1));
      out.push({ a: labels[a], b: labels[b], diff, se, t, df, p: ptukey(Math.abs(t) * Math.SQRT2, k, df, false) });
    }
    return out;
  }
  function welchANOVA(groups) {
    const k = groups.length, st = groups.map(g => ({ n: g.length, m: mean(g), v: variance(g) })), w = st.map(s => s.n / s.v), W = sum(w);
    const mw = st.reduce((s, x, i) => s + w[i] * x.m, 0) / W, A = st.reduce((s, x, i) => s + w[i] * (x.m - mw) ** 2, 0) / (k - 1);
    const lam = st.reduce((s, x, i) => s + (1 - w[i] / W) ** 2 / (x.n - 1), 0), F = A / (1 + 2 * (k - 2) * lam / (k * k - 1)), df2 = (k * k - 1) / (3 * lam);
    return { F, df1: k - 1, df2, p: pf(F, k - 1, df2) };
  }
  function brownForsythe(groups) {
    const k = groups.length, N = groups.reduce((s, g) => s + g.length, 0), st = groups.map(g => ({ n: g.length, m: mean(g), v: variance(g) }));
    const gm = groups.reduce((s, g) => s + sum(g), 0) / N, num = st.reduce((s, x) => s + x.n * (x.m - gm) ** 2, 0);
    const c = st.map(x => (1 - x.n / N) * x.v), den = sum(c), F = num / den, df2 = den * den / st.reduce((s, x, i) => s + c[i] * c[i] / (x.n - 1), 0);
    return { F, df1: k - 1, df2, p: pf(F, k - 1, df2) };
  }
  function boxM(groups) { // groups: arrays of row vectors (n_i × p); chi-square approximation (Box 1949)
    const g = groups.length, p = groups[0][0].length, N = groups.reduce((s, x) => s + x.length, 0);
    const covs = groups.map(G => { const n = G.length, m = Array.from({ length: p }, (_, a) => mean(G.map(r => r[a]))); return Array.from({ length: p }, (_, a) => Array.from({ length: p }, (_, b) => G.reduce((s, r) => s + (r[a] - m[a]) * (r[b] - m[b]), 0) / (n - 1))); });
    const Sp = Array.from({ length: p }, (_, a) => Array.from({ length: p }, (_, b) => covs.reduce((s, S, i) => s + (groups[i].length - 1) * S[a][b], 0) / (N - g)));
    const M = (N - g) * logdet(Sp) - covs.reduce((s, S, i) => s + (groups[i].length - 1) * logdet(S), 0);
    const c = (2 * p * p + 3 * p - 1) / (6 * (p + 1) * (g - 1)) * (groups.reduce((s, x) => s + 1 / (x.length - 1), 0) - 1 / (N - g));
    const chi = M * (1 - c), df = p * (p + 1) * (g - 1) / 2;
    return { M, chi, df, p: pchisq(chi, df) };
  }
  function cellsOf(facs, n) { // map "l0,l1" -> row indices
    const m = new Map(); for (let i = 0; i < n; i++) { const k = facs.map(f => f.codes[i]).join(','); if (!m.has(k)) m.set(k, []); m.get(k).push(i); }
    return m;
  }
  // collect complete cases for dv(s), factors and covariates
  function prepFactors(ds, dvs, factorNames, covNames) {
    const fj = factorNames.map(nm => colOf(ds, nm)), cj = covNames.map(nm => colOf(ds, nm)), dj = dvs.map(nm => colOf(ds, nm));
    const ok = []; for (let i = 0; i < ds.n; i++) if (dj.every(j => !isNaN(ds.cols[j][i])) && fj.every(j => !isNaN(ds.cols[j][i])) && cj.every(j => !isNaN(ds.cols[j][i]))) ok.push(i);
    const facs = fj.map((j, q) => { const vals = levelOrder(ds, j, Array.from(new Set(ok.map(i => ds.cols[j][i])))); if (vals.length < 2) fail('st_one_level'); const pos = new Map(vals.map((v, k) => [v, k])); return { name: factorNames[q], L: vals.length, labels: vals.map(v => levelName(ds, j, v)), codes: Int32Array.from(ok, i => pos.get(ds.cols[j][i])) }; });
    const covs = cj.map(j => Float64Array.from(ok, i => ds.cols[j][i]));
    const ys = dj.map(j => Float64Array.from(ok, i => ds.cols[j][i]));
    return { ok, facs, covs, ys };
  }
  function anovaFor(y, facs, covs, opts) {
    const ssType = +opts.ssType === 1 ? 1 : +opts.ssType === 2 ? 2 : 3, level = +opts.ci || 0.95;
    const covNames = (opts.covs || []), terms = makeTerms(facs.map(f => f.name), covNames, false);
    let model; try { model = glm(y, facs, covs, terms, ssType); } catch (e) { if (e.message === 'st_singular') fail('st_empty_cell'); throw e; }
    const n = y.length, covMeans = covs.map(c => mean(c)), cells = cellsOf(facs, n);
    // descriptives by cell
    const desc = Array.from(cells.entries()).map(([k, idx]) => { const lv = k.split(',').map(Number), v = idx.map(i => y[i]), m = mean(v), sd = v.length > 1 ? sdv(v) : NaN; return { key: lv, levels: lv.map((l, q) => facs[q].labels[l]), n: v.length, mean: m, sd, se: sd / Math.sqrt(v.length), cv: sd / m }; })
      .sort((a, b) => { for (let q = 0; q < a.key.length; q++) if (a.key[q] !== b.key[q]) return a.key[q] - b.key[q]; return 0; });
    const cellGroups = Array.from(cells.values()).map(idx => idx.map(i => y[i]));
    const res = { table: model.table, resid: { ss: model.sse, df: model.dfe, ms: model.mse }, sst: model.sst, n, desc, ssType };
    res.levene = cellGroups.every(g => g.length > 1) ? levene(cellGroups, opts.center === 'median' ? 'median' : 'mean') : null;
    res.levene && (res.levene.center = opts.center === 'median' ? 'median' : 'mean');
    res.residSW = shapiroWilk(model.resid);
    res.qq = Array.from(model.resid).map(v => v / Math.sqrt(model.mse)).sort((a, b) => a - b);
    if (facs.length === 1 && !covs.length) {
      const groups = Array.from({ length: facs[0].L }, (_, l) => []); for (let i = 0; i < n; i++) groups[facs[0].codes[i]].push(y[i]);
      if (groups.every(g => g.length > 1)) { res.welch = welchANOVA(groups); res.bf = brownForsythe(groups); }
    }
    res.emm = facs.map((f, fi) => { const Ls = emmFactor(model, facs, fi, covMeans); return { factor: f.name, rows: emmTable(model, Ls, f.labels, level), posthoc: posthocEMM(model, Ls, f.labels, level), gh: (() => { const groups = Array.from({ length: f.L }, () => []); for (let i = 0; i < n; i++) groups[f.codes[i]].push(y[i]); return groups.every(g => g.length > 1) ? gamesHowell(groups, f.labels) : null; })() }; });
    if (facs.length > 1) { // cell EMMs (fitted cell means at covariate means)
      res.cellEmm = desc.map(d => { const L = model.build(d.key, covMeans), m = lin(L, model.b), se = Math.sqrt(quad(L, model.XtXi) * model.mse); return { levels: d.levels, key: d.key, mean: m, se }; });
    }
    if (covs.length && opts.slopes) {
      const t2 = makeTerms(facs.map(f => f.name), covNames, true);
      try { const m2 = glm(y, facs, covs, t2, 3); res.slopes = m2.table.filter(r => r.slope); res.slopesResid = { ss: m2.sse, df: m2.dfe }; } catch (e) { res.slopes = null; }
    }
    return res;
  }
  E.tasks.st_anova = function (ds, model, settings, opts) {
    const dv = opts.dv, factors = (opts.factors || []).filter(Boolean), covNames = (opts.covs || []).filter(Boolean);
    if (!dv) fail('st_need_dv'); if (!factors.length) fail('st_need_factor');
    if (factors.includes(dv) || covNames.includes(dv)) fail('st_dv_twice');
    const P = prepFactors(ds, [dv], factors, covNames);
    if (P.ok.length <= 2) fail('st_too_few');
    const r = anovaFor(P.ys[0], P.facs, P.covs, Object.assign({}, opts, { covs: covNames }));
    return Object.assign({ kind: 'st_anova', dv, factors, covs: covNames, level: +opts.ci || 0.95, posthoc: opts.posthoc || ['tukey'], factorLevels: P.facs.map(f => f.labels) }, r);
  };
  E.tasks.st_ancova = E.tasks.st_anova;

  // ---------------------------------------------------------------- repeated measures
  function helmert(k) { const C = Array.from({ length: k }, () => new Array(k - 1).fill(0)); for (let j = 1; j < k; j++) { const s = Math.sqrt(j * (j + 1)); for (let i = 0; i < j; i++) C[i][j - 1] = 1 / s; C[j][j - 1] = -j / s; } return C; }
  function kron(A, B) { const out = []; A.forEach(ra => B.forEach(rb => { const r = []; ra.forEach(a => rb.forEach(b => r.push(a * b))); out.push(r); })); return out; }
  function mauchly(Emat, dfe) { // R mauchly.test on the orthonormalised error SSCP
    const p = Emat.length, tr = Emat.reduce((s, r, i) => s + r[i], 0), logW = logdet(Emat) - p * Math.log(tr / p), W = Math.exp(logW);
    const rho = 1 - (2 * p * p + p + 2) / (6 * p * dfe), w2 = (p + 2) * (p - 1) * (p - 2) * (2 * p ** 3 + 6 * p * p + 3 * p + 2) / (288 * (dfe * p * rho) ** 2);
    const z = -dfe * rho * logW, f = p * (p + 1) / 2 - 1, P1 = pchisq(z, f), P2 = pchisq(z, f + 4);
    let tr2 = 0; for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) tr2 += Emat[i][j] * Emat[j][i];
    const gg = tr * tr / (p * tr2), hf = Math.min(1, ((dfe + 1) * p * gg - 2) / (p * (dfe - p * gg)));
    return { W, chi: z, df: f, p: P1 + w2 * (P2 - P1), gg, hf, lb: 1 / p };
  }
  E.tasks.st_rmanova = function (ds, model, settings, opts) {
    const measures = (opts.measures || []).filter(Boolean), K = measures.length; if (K < 2) fail('st_need_measures');
    let levels = (opts.levels && opts.levels.length ? opts.levels : [K]).map(Number);
    if (levels.reduce((a, b) => a * b, 1) !== K || levels.some(l => !(l >= 2))) fail('st_levels');
    const wnames = levels.map((_, i) => (opts.wnames && opts.wnames[i]) || (levels.length === 1 ? 'RM' : 'RM' + (i + 1)));
    const between = opts.between || '', level = +opts.ci || 0.95;
    const P = prepFactors(ds, measures, between ? [between] : [], []), n = P.ok.length, Y = P.ys; // Y[k][i]
    const bf = between ? P.facs[0] : null, g = bf ? bf.L : 1;
    if (n - g < 1) fail('st_too_few');
    const X = [new Float64Array(n).fill(1)]; if (bf) for (let c = 0; c < g - 1; c++) X.push(Float64Array.from(bf.codes, l => l === c ? 1 : l === g - 1 ? -1 : 0));
    // between-subjects part: subject totals / sqrt(K)
    const z0 = Float64Array.from({ length: n }, (_, i) => { let s = 0; for (let k = 0; k < K; k++) s += Y[k][i]; return s / Math.sqrt(K); });
    const f0 = lsq(X, [z0]), ssSubj = f0.SSE[0][0], dfSubj = f0.df;
    const betweenRows = [];
    if (bf) { const idx = X.map((_, j) => j).slice(1), ss = quadInv(idx.map(j => f0.coef[j][0]), sub(f0.XtXi, idx)); betweenRows.push({ term: bf.name, ss, df: g - 1 }); }
    // within-subjects effects
    const within = [];
    allSubsets(levels.length, 1).sort((a, b) => a.length - b.length).forEach(S => {
      let C = [[1]]; levels.forEach((k, fi) => { C = kron(C, S.includes(fi) ? helmert(k) : Array.from({ length: k }, () => [1 / Math.sqrt(k)])); });
      const q = C[0].length, Z = Array.from({ length: q }, (_, c) => Float64Array.from({ length: n }, (_, i) => { let s = 0; for (let k = 0; k < K; k++) s += Y[k][i] * C[k][c]; return s; }));
      const fit = lsq(X, Z), Etr = fit.SSE.reduce((s, r, i) => s + r[i], 0), dfe = fit.df;
      const H0 = hypSSCP(fit, [0]), ss0 = H0.reduce((s, r, i) => s + r[i], 0);
      const sph = q > 1 ? mauchly(fit.SSE, dfe) : { gg: 1, hf: 1, lb: 1 };
      const name = S.map(i => wnames[i]).join(' ✻ ');
      const err = { ss: Etr, df: q * dfe };
      within.push({ term: name, ss: ss0, df: q, err, sph, q });
      if (bf) { const idx = X.map((_, j) => j).slice(1), H = hypSSCP(fit, idx); within.push({ term: name + ' ✻ ' + bf.name, ss: H.reduce((s, r, i) => s + r[i], 0), df: q * (g - 1), err, sph, q, inter: true }); }
    });
    const errTotal = ssSubj + within.filter(w => !w.inter).reduce((s, w) => s + w.err.ss, 0), ssAll = errTotal + betweenRows.reduce((s, r) => s + r.ss, 0) + within.reduce((s, w) => s + w.ss, 0);
    within.forEach(w => {
      const F = (w.ss / w.df) / (w.err.ss / w.err.df); Object.assign(w, { ms: w.ss / w.df, F, p: pf(F, w.df, w.err.df), eta2: w.ss / ssAll, peta2: w.ss / (w.ss + w.err.ss), geta2: w.ss / (w.ss + errTotal) });
      w.pGG = pf(F, w.df * w.sph.gg, w.err.df * w.sph.gg); w.pHF = pf(F, w.df * w.sph.hf, w.err.df * w.sph.hf);
    });
    betweenRows.forEach(r => { r.ms = r.ss / r.df; r.F = r.ms / (ssSubj / dfSubj); r.p = pf(r.F, r.df, dfSubj); r.eta2 = r.ss / ssAll; r.peta2 = r.ss / (r.ss + ssSubj); r.geta2 = r.ss / (r.ss + errTotal); });
    // descriptives per cell (measure x group)
    const grpLabels = bf ? bf.labels : [null], desc = [];
    const lvOf = k => { const out = []; let r = k; for (let fi = levels.length - 1; fi >= 0; fi--) { out.unshift(r % levels[fi]); r = Math.floor(r / levels[fi]); } return out; };
    measures.forEach((m, k) => grpLabels.forEach((gl, gi) => { const v = []; for (let i = 0; i < n; i++) if (!bf || bf.codes[i] === gi) v.push(Y[k][i]); const mm = mean(v), sd = v.length > 1 ? sdv(v) : NaN, tq = v.length > 1 ? qt(1 - (1 - level) / 2, v.length - 1) : NaN; desc.push({ measure: m, cell: lvOf(k), group: gl, n: v.length, mean: mm, sd, se: sd / Math.sqrt(v.length), lo: mm - tq * sd / Math.sqrt(v.length), hi: mm + tq * sd / Math.sqrt(v.length) }); }));
    // post hoc: paired t-tests on the subject-level marginal means of each within factor
    const posthoc = levels.map((L, fi) => {
      const mm = Array.from({ length: L }, (_, l) => Float64Array.from({ length: n }, (_, i) => { let s = 0, c = 0; for (let k = 0; k < K; k++) if (lvOf(k)[fi] === l) { s += Y[k][i]; c++; } return s / c; }));
      const lab = l => wnames.length === 1 ? measures[l] : wnames[fi] + ' ' + (l + 1), rows = [];
      for (let a = 0; a < L; a++) for (let b = a + 1; b < L; b++) { const d = Array.from(mm[a], (v, i) => v - mm[b][i]), m = mean(d), sd = sdv(d), se = sd / Math.sqrt(n), t = m / se; rows.push({ a: lab(a), b: lab(b), diff: m, se, t, df: n - 1, d: m / sd, p: 2 * pt(-Math.abs(t), n - 1) }); }
      const pb = adjust(rows.map(r => r.p), 'bonferroni'), ph = adjust(rows.map(r => r.p), 'holm'); rows.forEach((r, i) => { r.pBonf = pb[i]; r.pHolm = ph[i]; });
      return { factor: wnames[fi], rows };
    });
    let betweenPost = null;
    if (bf) { const zbar = Float64Array.from(z0, v => v / Math.sqrt(K)); const r1 = anovaFor(zbar, [bf], [], { ci: level }); betweenPost = r1.emm[0]; }
    return { kind: 'st_rmanova', measures, levels, wnames, between: between || null, n, within, betweenRows, subjErr: { ss: ssSubj, df: dfSubj, ms: ssSubj / dfSubj }, desc, posthoc, betweenPost, level, groups: grpLabels };
  };

  // ---------------------------------------------------------------- MANOVA
  function manovaStats(eig, q, dfr) { // R summary.manova F approximations
    const p = eig.length, s = Math.min(p, q), m = 0.5 * (Math.abs(p - q) - 1), nn = 0.5 * (dfr - p - 1), out = {};
    { const V = eig.reduce((a, l) => a + l / (1 + l), 0), t1 = 2 * m + s + 1, t2 = 2 * nn + s + 1, F = (t2 / t1 * V) / (s - V); out.pillai = { stat: V, F, df1: s * t1, df2: s * t2 }; }
    { const L = eig.reduce((a, l) => a / (1 + l), 1), t1 = dfr - 0.5 * (p - q + 1), t2 = (p * q - 2) / 4, t3x = p * p + q * q - 5, t3 = t3x > 0 ? Math.sqrt(((p * q) ** 2 - 4) / t3x) : 1, df2 = t1 * t3 - 2 * t2, F = (Math.pow(L, -1 / t3) - 1) * df2 / p / q; out.wilks = { stat: L, F, df1: p * q, df2 }; }
    { const T = eig.reduce((a, l) => a + l, 0), t1 = 2 * m + s + 1, t2 = 2 * (s * nn + 1), F = t2 * T / s / s / t1; out.hotelling = { stat: T, F, df1: s * t1, df2: t2 }; }
    { const R = Math.max(...eig), t1 = Math.max(p, q), t2 = dfr - t1 + q, F = t2 * R / t1; out.roy = { stat: R, F, df1: t1, df2: t2 }; }
    Object.values(out).forEach(o => { o.p = pf(o.F, o.df1, o.df2); });
    return out;
  }
  E.tasks.st_manova = function (ds, model, settings, opts) {
    const dvs = (opts.dvs || []).filter(Boolean), factors = (opts.factors || []).filter(Boolean);
    if (dvs.length < 2) fail('st_need_dvs'); if (!factors.length) fail('st_need_factor');
    const P = prepFactors(ds, dvs, factors, []), n = P.ok.length, terms = makeTerms(factors, [], false), build = rowBuilder(P.facs, terms), tIdx = termIndex(P.facs, terms);
    const rows = []; for (let i = 0; i < n; i++) rows.push(build(P.facs.map(f => f.codes[i]), []));
    let fit; try { fit = lsq(rows[0].map((_, j) => Float64Array.from(rows, r => r[j])), P.ys); } catch (e) { if (e.message === 'st_singular') fail('st_empty_cell'); throw e; }
    const tests = terms.map((tm, k) => { const H = hypSSCP(fit, tIdx[k]), eig = relEigen(H, fit.SSE); return Object.assign({ term: tm.name, df: tIdx[k].length, eig }, manovaStats(eig, tIdx[k].length, fit.df)); });
    const univariate = dvs.map((dv, a) => ({ dv, res: anovaFor(P.ys[a], P.facs, [], { ci: +opts.ci || 0.95 }) })).map(u => ({ dv: u.dv, table: u.res.table, resid: u.res.resid }));
    const cells = cellsOf(P.facs, n), cellRows = Array.from(cells.values()).map(idx => idx.map(i => P.ys.map(y => y[i])));
    let box = null; try { if (cellRows.every(c => c.length > dvs.length)) box = boxM(cellRows); } catch (e) { box = null; }
    const desc = Array.from(cells.entries()).map(([k, idx]) => ({ levels: k.split(',').map((l, q) => P.facs[q].labels[+l]), key: k.split(',').map(Number), n: idx.length, stats: P.ys.map(y => { const v = idx.map(i => y[i]); return { mean: mean(v), sd: v.length > 1 ? sdv(v) : NaN }; }) }))
      .sort((a, b) => { for (let q = 0; q < a.key.length; q++) if (a.key[q] !== b.key[q]) return a.key[q] - b.key[q]; return 0; });
    return { kind: 'st_manova', dvs, factors, n, dfResid: fit.df, tests, univariate, box, desc };
  };

  // ================================================================ rank-based k-sample tests
  E.tasks.st_kruskal = function (ds, model, settings, opts) {
    const vars = (opts.vars || []).filter(Boolean), gname = opts.group; if (!vars.length) fail('st_need_vars'); if (!gname) fail('st_need_group');
    const out = vars.map(name => {
      const P = prepFactors(ds, [name], [gname], []), y = P.ys[0], f = P.facs[0], N = y.length, k = f.L, rk = rank(y);
      const R = new Array(k).fill(0), nn = new Array(k).fill(0); for (let i = 0; i < N; i++) { R[f.codes[i]] += rk.r[i]; nn[f.codes[i]]++; }
      if (nn.some(c => !c)) fail('st_too_few');
      const T = tieSum(rk.ties), H = (12 / (N * (N + 1)) * R.reduce((s, r, i) => s + r * r / nn[i], 0) - 3 * (N + 1)) / (1 - T / (N ** 3 - N));
      const df = k - 1, rows = [], s2 = N * (N + 1) / 12 - T / (12 * (N - 1));
      for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) { const z = (R[a] / nn[a] - R[b] / nn[b]) / Math.sqrt(s2 * (1 / nn[a] + 1 / nn[b])); rows.push({ a: f.labels[a], b: f.labels[b], z, p: 2 * pnorm(-Math.abs(z)), rbar: [R[a] / nn[a], R[b] / nn[b]] }); }
      const pb = adjust(rows.map(r => r.p), 'bonferroni'), ph = adjust(rows.map(r => r.p), 'holm'); rows.forEach((r, i) => { r.pBonf = pb[i]; r.pHolm = ph[i]; });
      const groups = f.labels.map((lb, gi) => { const v = []; for (let i = 0; i < N; i++) if (f.codes[i] === gi) v.push(y[i]); return { label: lb, n: v.length, median: median(v), meanRank: R[gi] / nn[gi], values: v.sort((a, b) => a - b) }; });
      return { name, H, df, p: pchisq(H, df), eps2: H / ((N * N - 1) / (N + 1)), eta2H: (H - k + 1) / (N - k), N, k, dunn: rows, groups };
    });
    return { kind: 'st_kruskal', group: gname, rows: out };
  };
  E.tasks.st_friedman = function (ds, model, settings, opts) {
    const measures = (opts.measures || []).filter(Boolean), k = measures.length; if (k < 2) fail('st_need_measures');
    const js = measures.map(m => colOf(ds, m)), rows = [];
    for (let i = 0; i < ds.n; i++) if (js.every(j => !isNaN(ds.cols[j][i]))) rows.push(js.map(j => ds.cols[j][i]));
    const n = rows.length; if (n < 2) fail('st_too_few');
    const R = new Array(k).fill(0); let T = 0, A1 = 0;
    rows.forEach(r => { const rk = rank(r); rk.r.forEach((v, j) => { R[j] += v; A1 += v * v; }); T += tieSum(rk.ties); });
    const chi = 12 * R.reduce((s, r) => s + (r - n * (k + 1) / 2) ** 2, 0) / (n * k * (k + 1) - T / (k - 1)), df = k - 1;
    const sR2 = R.reduce((s, r) => s + r * r, 0), dfc = (n - 1) * (k - 1), seC = Math.sqrt(2 * (n * A1 - sR2) / dfc), con = [];
    for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) { const t = (R[a] - R[b]) / seC; con.push({ a: measures[a], b: measures[b], t, df: dfc, p: 2 * pt(-Math.abs(t), dfc) }); }
    const pb = adjust(con.map(r => r.p), 'bonferroni'), ph = adjust(con.map(r => r.p), 'holm'); con.forEach((r, i) => { r.pBonf = pb[i]; r.pHolm = ph[i]; });
    const desc = measures.map((m, j) => { const v = rows.map(r => r[j]); return { name: m, n, median: median(v), mean: mean(v), sd: sdv(v), rankSum: R[j], meanRank: R[j] / n }; });
    return { kind: 'st_friedman', measures, n, k, chi, df, p: pchisq(chi, df), W: chi / (n * (k - 1)), conover: con, desc };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = E;
})(typeof self !== 'undefined' ? self : this);
