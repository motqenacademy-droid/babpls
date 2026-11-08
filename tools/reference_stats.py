"""Reference values for js/stats.js (classic statistics I: t-tests, ANOVA family, nonparametric tests).

    pip install numpy scipy pandas statsmodels pingouin
    python tools/reference_stats.py > tests/fixtures/stats.json

Sources of truth: scipy.stats (t-tests, Levene, Shapiro-Wilk, Mann-Whitney, Wilcoxon, binomial, Kruskal-Wallis,
Friedman, studentized range, non-central t, Tukey HSD), statsmodels (anova_lm Type I/II/III, Welch/Brown-Forsythe
one-way, Lilliefors D, AnovaRM, MANOVA), pingouin (rm_anova, mixed_anova, sphericity, epsilon, Games-Howell, Box's M,
Kendall's W). Where JASP relies on R formulas that these libraries do not expose (nortest p-values, R's
Hotelling-Lawley F approximation, Mauchly's p with the second-order term, Dunn and Conover post hoc tests, estimated
marginal means of unbalanced designs), the reference is an independent closed-form implementation below.
"""
import io
import re
import json
import warnings

import numpy as np
import pandas as pd
import pingouin as pg
import statsmodels.api as sm
import statsmodels.formula.api as smf
from scipy import optimize, special, stats
from statsmodels.multivariate.manova import MANOVA
from statsmodels.stats.anova import AnovaRM
from statsmodels.stats.diagnostic import lilliefors
from statsmodels.stats.oneway import anova_oneway

warnings.filterwarnings('ignore')
F = lambda v: None if v is None or (isinstance(v, float) and not np.isfinite(v)) else float(v)
out = {'data': {}}


def csv_text(df):
    b = io.StringIO(); df.to_csv(b, index=False, lineterminator='\n'); return b.getvalue()


# ------------------------------------------------------------------ datasets
cs = pd.read_csv('examples/customer_satisfaction.csv')
rs = np.random.RandomState(20261107)

# factorial data: A (3 levels) x B (2 levels), covariate x, three correlated outcomes; unbalanced
n = 72
A = np.array(['a1', 'a2', 'a3'])[rs.randint(0, 3, n)]
B = np.array(['b1', 'b2'])[rs.randint(0, 2, n)]
x = np.round(rs.normal(50, 10, n), 2)
ea = {'a1': 0.0, 'a2': 0.8, 'a3': 1.5}; eb = {'b1': 0.0, 'b2': 0.6}
y = np.array([ea[a] + eb[b] + (0.7 if (a, b) == ('a3', 'b2') else 0) for a, b in zip(A, B)]) + 0.04 * (x - 50) + rs.normal(0, 1, n)
y2 = 0.5 * y + rs.normal(0, 1, n) + np.array([0.5 if a == 'a2' else 0 for a in A])
y3 = rs.normal(0, 1, n) + np.array([0.6 if b == 'b2' else 0 for b in B])
fac = pd.DataFrame({'A': A, 'B': B, 'x': x, 'y': np.round(y, 3), 'y2': np.round(y2, 3), 'y3': np.round(y3, 3), 'yi': np.round(y * 2).astype(int)})
fac.loc[[3, 17], 'y'] = np.nan  # missing values
out['data']['fac'] = csv_text(fac)

# small samples without ties (exact Mann-Whitney / Wilcoxon)
small = pd.DataFrame({'g': ['c'] * 9 + ['t'] * 11, 'v': np.round(np.r_[rs.normal(10, 2, 9), rs.normal(12, 2.5, 11)], 3),
                      'pre': np.round(rs.normal(20, 3, 20), 3)})
small['post'] = np.round(small['pre'] + rs.normal(1.2, 1.5, 20), 3)
out['data']['small'] = csv_text(small)

# repeated measures: 24 subjects, group G (12 + 12), one factor with 3 levels (t1..t3) and a 2 x 3 design (a1b1..a2b3)
ns = 24
G = np.array(['g1'] * 12 + ['g2'] * 12)
subj = rs.normal(0, 1, ns)
rm = pd.DataFrame({'G': G})
for j, m in enumerate([0, 0.5, 0.9]):
    rm['t%d' % (j + 1)] = np.round(5 + subj + m + (0.4 * j if True else 0) * (G == 'g2') + rs.normal(0, 0.8 + 0.3 * j, ns), 3)
for a in range(2):
    for b in range(3):
        rm['a%db%d' % (a + 1, b + 1)] = np.round(5 + subj + 0.6 * a + 0.4 * b + 0.3 * a * b + 0.3 * (G == 'g2') * a + rs.normal(0, 1, ns), 3)
for j in range(3):
    rm['r%d' % (j + 1)] = np.round(rm['t%d' % (j + 1)]).astype(int)  # integer copies with ties for Friedman
out['data']['rm'] = csv_text(rm)


# ------------------------------------------------------------------ helpers
def desc_ref(v):
    v = np.asarray(v, float); v = v[~np.isnan(v)]; n = len(v); m = v.mean(); sd = v.std(ddof=1); se = sd / np.sqrt(n)
    q = stats.t.ppf(0.975, n - 1); s = pd.Series(v)
    seS = np.sqrt(6 * n * (n - 1) / ((n - 2) * (n + 1) * (n + 3))); seK = 2 * seS * np.sqrt((n * n - 1) / ((n - 3) * (n + 5)))
    vals, cnt = np.unique(v, return_counts=True)
    sw = stats.shapiro(v)
    return dict(n=n, mean=m, sd=sd, se=se, variance=v.var(ddof=1), ciLo=m - q * se, ciHi=m + q * se, median=float(np.median(v)),
                mode=float(vals[cnt == cnt.max()][0]), min=v.min(), max=v.max(), q1=np.percentile(v, 25), q3=np.percentile(v, 75),
                p10=np.percentile(v, 10), p90=np.percentile(v, 90), skew=s.skew(), kurt=s.kurt(), seSkew=seS, seKurt=seK, swW=sw.statistic, swP=sw.pvalue)


def lillie_p(x):  # nortest::lillie.test p-value (Dallal-Wilkinson), statistic from statsmodels
    x = np.sort(x); n = len(x); K = lilliefors(x, dist='norm', pvalmethod='table')[0]
    Kd, nd = (K * (n / 100) ** 0.49, 100) if n > 100 else (K, n)
    p = np.exp(-7.01256 * Kd ** 2 * (nd + 2.78019) + 2.99587 * Kd * np.sqrt(nd + 2.78019) - 0.122119 + 0.974598 / np.sqrt(nd) + 1.67997 / nd)
    if p > 0.1:
        KK = (np.sqrt(n) - 0.01 + 0.85 / np.sqrt(n)) * K
        if KK <= 0.302: p = 1
        elif KK <= 0.5: p = 2.76773 - 19.828315 * KK + 80.709644 * KK ** 2 - 138.55152 * KK ** 3 + 81.218052 * KK ** 4
        elif KK <= 0.9: p = -4.901232 + 40.662806 * KK - 97.490286 * KK ** 2 + 94.029866 * KK ** 3 - 32.355711 * KK ** 4
        elif KK <= 1.31: p = 6.198765 - 19.558097 * KK + 23.186922 * KK ** 2 - 12.234627 * KK ** 3 + 2.423045 * KK ** 4
        else: p = 0
    return K, p


def ad_p(x):  # nortest::ad.test p-value; A^2 from scipy
    n = len(x); A = stats.anderson(x, dist='norm').statistic; AA = (1 + 0.75 / n + 2.25 / n ** 2) * A
    if AA < 0.2: p = 1 - np.exp(-13.436 + 101.14 * AA - 223.73 * AA ** 2)
    elif AA < 0.34: p = 1 - np.exp(-8.318 + 42.796 * AA - 59.938 * AA ** 2)
    elif AA < 0.6: p = np.exp(0.9177 - 4.279 * AA - 1.38 * AA ** 2)
    elif AA < 10: p = np.exp(1.2937 - 5.709 * AA + 0.0186 * AA ** 2)
    else: p = 3.7e-24
    return A, p


def nct_ci(t, df, level=0.95, alt='two-sided'):
    a = 1 - level
    f = lambda nc, target: stats.nct.cdf(t, df, nc) - target
    lo = -np.inf if alt == 'less' else optimize.brentq(f, t - 8, t + 8, args=(1 - (a / 2 if alt == 'two-sided' else a),), xtol=1e-14)
    hi = np.inf if alt == 'greater' else optimize.brentq(f, t - 8, t + 8, args=((a / 2 if alt == 'two-sided' else a),), xtol=1e-14)
    return lo, hi


J = lambda df: special.gamma(df / 2) / (np.sqrt(df / 2) * special.gamma((df - 1) / 2))


def rbc_ci(r, se, level=0.95):
    q = stats.norm.ppf(1 - (1 - level) / 2); z = np.arctanh(r); return np.tanh(z - q * se), np.tanh(z + q * se)


def hl_two(x, y): return float(np.median(np.subtract.outer(x, y)))


def hl_one(d):
    d = np.asarray(d); i, j = np.triu_indices(len(d)); return float(np.median((d[i] + d[j]) / 2))


# ------------------------------------------------------------------ descriptives & normality
out['desc'] = {v: desc_ref(cs[v]) for v in ['sat_1', 'age', 'val_1', 'imag_2']}
out['desc_split'] = {g: desc_ref(cs.loc[cs.gender == g, 'age']) for g in ['female', 'male']}
gfreq = cs['gender'].value_counts(dropna=False)
out['freq_gender'] = {'female': int(gfreq['female']), 'male': int(gfreq['male'])}
norm = {}
for v in ['sat_1', 'age', 'val_1']:
    xx = cs[v].dropna().values; K, pk = lillie_p(xx); A2, pa = ad_p(xx); sw = stats.shapiro(xx)
    norm[v] = dict(swW=sw.statistic, swP=sw.pvalue, ksD=K, ksP=pk, adA=A2, adP=pa)
for v in ['v', 'pre']:
    xx = small[v].values; K, pk = lillie_p(xx); A2, pa = ad_p(xx); sw = stats.shapiro(xx)
    norm['small_' + v] = dict(swW=sw.statistic, swP=sw.pvalue, ksD=K, ksP=pk, adA=A2, adP=pa)
out['normality'] = norm

# ------------------------------------------------------------------ distributions (spot values)
out['dist'] = {
    'ptukey': [[q, k, df, stats.studentized_range.sf(q, k, df)] for q, k, df in [(3.5, 4, 20), (2.1, 3, 8), (5, 10, 200), (1.2, 2, 5), (4.4, 6, 1000), (3.0, 3, 60.5)]],
    'qtukey': [[p, k, df, stats.studentized_range.ppf(p, k, df)] for p, k, df in [(0.95, 3, 12), (0.95, 5, 66), (0.99, 4, 30)]],
    'pnt': [[t, df, nc, stats.nct.cdf(t, df, nc)] for t, df, nc in [(2.3, 12, 1.1), (-1.2, 5, 0.7), (4.5, 40, 2.0), (0.3, 3, -1.5), (8.0, 100, 7.5)]],
    'pt': [[t, df, stats.t.cdf(t, df)] for t, df in [(2.1, 7), (-3.3, 2.5), (0.4, 120), (-9.0, 30)]],
    'qt': [[p, df, stats.t.ppf(p, df)] for p, df in [(0.975, 5), (0.001, 2.5), (0.95, 300), (0.6, 1)]],
    'pnorm': [[z, stats.norm.cdf(z)] for z in [-8, -1.3, 0.2, 3.1]],
    'qnorm': [[p, stats.norm.ppf(p)] for p in [1e-10, 0.025, 0.7, 0.999]],
    'pchisq': [[x_, df, stats.chi2.sf(x_, df)] for x_, df in [(7.3, 3), (0.5, 1), (40, 20)]],
    'pf': [[f_, a, b, stats.f.sf(f_, a, b)] for f_, a, b in [(3.2, 2, 40), (0.7, 5, 12.5)]],
    'shapiro': [[list(v), stats.shapiro(v).statistic, stats.shapiro(v).pvalue] for v in [[1, 2, 4], [2.1, 3.4, 1.9, 5.6, 4.4], [1, 2, 4, 7, 8, 9.5, 3], list(np.round(rs.exponential(1, 30), 4))]],
}

# ------------------------------------------------------------------ t-tests
one = {}
for v, mu, alt in [('sat_1', 4.0, 'two-sided'), ('age', 40.0, 'greater'), ('val_1', 5.0, 'less')]:
    xx = cs[v].dropna().values; r = stats.ttest_1samp(xx, mu, alternative=alt); ci = r.confidence_interval(0.95)
    n_ = len(xx); d = (xx.mean() - mu) / xx.std(ddof=1); lo, hi = nct_ci(r.statistic, n_ - 1, 0.95, alt)
    w = stats.wilcoxon(xx - mu, alternative=alt, method='approx', correction=True, zero_method='wilcox')
    dd = xx - mu; dd = dd[dd != 0]; rk = stats.rankdata(np.abs(dd)); Tp = rk[dd > 0].sum(); Tm = rk[dd < 0].sum(); nn = len(dd)
    one[v] = dict(mu=mu, alt=alt, t=r.statistic, df=r.df, p=r.pvalue, lo=ci.low + 0 - mu, hi=ci.high - mu, d=d, dLo=lo / np.sqrt(n_), dHi=hi / np.sqrt(n_), g=d * J(n_ - 1),
                  V=Tp, wp=w.pvalue, rbc=(Tp - Tm) / (nn * (nn + 1) / 2))
xx = small['v'].values
r = stats.ttest_1samp(xx, 11); w = stats.wilcoxon(xx - 11, method='exact')
one['small_v'] = dict(mu=11.0, alt='two-sided', t=r.statistic, df=r.df, p=r.pvalue, V=float(np.sum(stats.rankdata(np.abs(xx - 11))[(xx - 11) > 0])), wp=w.pvalue, hl=hl_one(xx - 11))
out['ttest_one'] = one

ind = {}
gs = list(dict.fromkeys(cs['gender'].dropna()))
for v, alt in [('sat_1', 'two-sided'), ('age', 'two-sided'), ('loy_1', 'less')]:
    d_ = cs[['gender', v]].dropna(); a_ = d_.loc[d_.gender == gs[0], v].values; b_ = d_.loc[d_.gender == gs[1], v].values
    st = stats.ttest_ind(a_, b_, alternative=alt); wl = stats.ttest_ind(a_, b_, equal_var=False, alternative=alt)
    ci = st.confidence_interval(0.95); ciw = wl.confidence_interval(0.95); n1, n2 = len(a_), len(b_); dfp = n1 + n2 - 2
    sp = np.sqrt(((n1 - 1) * a_.var(ddof=1) + (n2 - 1) * b_.var(ddof=1)) / dfp); d = (a_.mean() - b_.mean()) / sp
    lo, hi = nct_ci(st.statistic, dfp, 0.95, alt); sc = np.sqrt(1 / n1 + 1 / n2)
    mw = stats.mannwhitneyu(a_, b_, alternative=alt, method='asymptotic', use_continuity=True)
    ind[v] = dict(alt=alt, groups=gs, t=st.statistic, df=st.df, p=st.pvalue, lo=ci.low, hi=ci.high, d=d, dLo=lo * sc, dHi=hi * sc, g=d * J(dfp),
                  tw=wl.statistic, dfw=wl.df, pw=wl.pvalue, low=ciw.low, hiw=ciw.high, dw=(a_.mean() - b_.mean()) / np.sqrt((a_.var(ddof=1) + b_.var(ddof=1)) / 2),
                  U=mw.statistic, mwp=mw.pvalue, rbc=2 * mw.statistic / (n1 * n2) - 1,
                  lev=list(stats.levene(a_, b_, center='mean')), bfl=list(stats.levene(a_, b_, center='median')))
a_ = small.loc[small.g == 'c', 'v'].values; b_ = small.loc[small.g == 't', 'v'].values
mw = stats.mannwhitneyu(a_, b_, method='exact'); mwg = stats.mannwhitneyu(a_, b_, alternative='less', method='exact')
st = stats.ttest_ind(a_, b_); n1, n2 = len(a_), len(b_); se_r = np.sqrt((n1 + n2 + 1) / (3 * n1 * n2)); rbc = 2 * mw.statistic / (n1 * n2) - 1
ind['small_v'] = dict(alt='two-sided', t=st.statistic, df=st.df, p=st.pvalue, U=mw.statistic, mwp=mw.pvalue, mwpLess=mwg.pvalue, rbc=rbc, rbcCI=list(rbc_ci(rbc, se_r)), hl=hl_two(a_, b_))
out['ttest_ind'] = ind

paired = {}
for a, b, alt in [('sat_1', 'sat_2', 'two-sided'), ('imag_1', 'imag_2', 'greater')]:
    d_ = cs[[a, b]].dropna(); r = stats.ttest_rel(d_[a], d_[b], alternative=alt); ci = r.confidence_interval(0.95); dd = (d_[a] - d_[b]).values
    n_ = len(dd); lo, hi = nct_ci(r.statistic, n_ - 1, 0.95, alt)
    w = stats.wilcoxon(dd, alternative=alt, method='approx', correction=True, zero_method='wilcox'); nz = dd[dd != 0]; rk = stats.rankdata(np.abs(nz))
    pos, neg = int((dd > 0).sum()), int((dd < 0).sum())
    paired[a + '|' + b] = dict(alt=alt, t=r.statistic, df=r.df, p=r.pvalue, lo=ci.low, hi=ci.high, d=dd.mean() / dd.std(ddof=1), dLo=lo / np.sqrt(n_), dHi=hi / np.sqrt(n_),
                               V=rk[nz > 0].sum(), wp=w.pvalue, rbc=(rk[nz > 0].sum() - rk[nz < 0].sum()) / (len(nz) * (len(nz) + 1) / 2), pos=pos, neg=neg,
                               signp=stats.binomtest(pos, pos + neg, 0.5, alternative=alt).pvalue)
dd = (small['pre'] - small['post']).values; w = stats.wilcoxon(dd, method='exact'); r = stats.ttest_rel(small['pre'], small['post'])
paired['pre|post'] = dict(alt='two-sided', t=r.statistic, df=r.df, p=r.pvalue, V=float(stats.rankdata(np.abs(dd))[dd > 0].sum()), wp=w.pvalue, hl=hl_one(dd),
                          signp=stats.binomtest(int((dd > 0).sum()), len(dd), 0.5).pvalue)
out['ttest_paired'] = paired

# ------------------------------------------------------------------ ANOVA family
fd = fac.dropna(subset=['y']).reset_index(drop=True)


def aov_table(formula, data, typ):
    m = smf.ols(formula, data).fit(); t = sm.stats.anova_lm(m, typ=typ); rows = {}
    sst = ((data[formula.split('~')[0].strip()] - data[formula.split('~')[0].strip()].mean()) ** 2).sum(); mse = m.mse_resid
    for idx, row in t.iterrows():
        if idx in ('Intercept', 'Residual'): continue
        name = idx.replace('C(', '').replace(', Sum)', '').replace(':', ' ✻ ')
        ss, df = row['sum_sq'], row['df']
        rows[name] = dict(ss=ss, df=df, F=row['F'], p=row['PR(>F)'], eta2=ss / sst, peta2=ss / (ss + m.ssr), omega2=(ss - df * mse) / (sst + mse))
    return dict(rows=rows, sse=m.ssr, dfe=m.df_resid)


aov = {}
for typ in (1, 2, 3):
    aov['two_way_type%d' % typ] = aov_table('y ~ C(A, Sum) * C(B, Sum)', fd, typ)
aov['ancova_type3'] = aov_table('y ~ C(A, Sum) + x', fd, 3)
aov['ancova2_type3'] = aov_table('y ~ C(A, Sum) * C(B, Sum) + x', fd, 3)
aov['ancova2_type1'] = aov_table('y ~ C(A, Sum) * C(B, Sum) + x', fd, 1)
aov['slopes'] = aov_table('y ~ C(A, Sum) * x', fd, 3)
aov['one_way'] = aov_table('y ~ C(A, Sum)', fd, 3)
groups = [fd.loc[fd.A == a, 'y'].values for a in ['a1', 'a2', 'a3']]
wl = anova_oneway(groups, use_var='unequal'); pw = pg.welch_anova(fd, dv='y', between='A')
aov['welch'] = dict(F=wl.statistic, df1=wl.df[0], df2=wl.df[1], p=wl.pvalue, F_pg=float(pw['F'].iloc[0]))
# Brown-Forsythe (1974) test of means, closed form
N = sum(len(g) for g in groups); gm = np.concatenate(groups).mean(); num = sum(len(g) * (g.mean() - gm) ** 2 for g in groups)
c = [(1 - len(g) / N) * g.var(ddof=1) for g in groups]; Fbf = num / sum(c); df2 = sum(c) ** 2 / sum(ci_ ** 2 / (len(g) - 1) for ci_, g in zip(c, groups))
bfs = anova_oneway(groups, use_var='bf')
aov['bf'] = dict(F=Fbf, df1=2, df2=df2, p=stats.f.sf(Fbf, 2, df2), F_sm=bfs.statistic)
aov['levene_oneway'] = list(stats.levene(*groups, center='mean'))
cells = [fd.loc[(fd.A == a) & (fd.B == b), 'y'].values for a in ['a1', 'a2', 'a3'] for b in ['b1', 'b2']]
aov['levene_cells'] = list(stats.levene(*cells, center='mean')); aov['bf_cells'] = list(stats.levene(*cells, center='median'))

# post hoc one-way: Tukey (scipy), Games-Howell (pingouin), Scheffe & Bonferroni closed form
th = stats.tukey_hsd(*groups); ci = th.confidence_interval(0.95); m1 = smf.ols('y ~ C(A)', fd).fit(); mse = m1.mse_resid; dfe = m1.df_resid
lv = ['a1', 'a2', 'a3']; ph = {}
for i in range(3):
    for j in range(i + 1, 3):
        diff = groups[i].mean() - groups[j].mean(); se = np.sqrt(mse * (1 / len(groups[i]) + 1 / len(groups[j]))); t = diff / se
        ph[lv[i] + '|' + lv[j]] = dict(diff=diff, se=se, t=t, pTukey=th.pvalue[i, j], lo=ci.low[i, j], hi=ci.high[i, j], pScheffe=stats.f.sf(t * t / 2, 2, dfe),
                                       pBonf=min(1, 3 * 2 * stats.t.sf(abs(t), dfe)), d=diff / np.sqrt(mse))
gh = pg.pairwise_gameshowell(fd, dv='y', between='A')
for _, r_ in gh.iterrows():
    ph[r_['A'] + '|' + r_['B']]['gh'] = dict(diff=r_['diff'], se=r_['se'], t=r_['T'], df=r_['df'], p=r_['pval'])
aov['posthoc_oneway'] = ph

# estimated marginal means and Tukey for the unbalanced two-way design (closed form: unweighted means of cell means)
m2 = smf.ols('y ~ C(A, Sum) * C(B, Sum)', fd).fit(); mse2 = m2.mse_resid; dfe2 = m2.df_resid
cm = fd.groupby(['A', 'B'])['y'].agg(['mean', 'count'])
emm = {}; pairs = {}
for a in lv: emm[a] = dict(mean=np.mean([cm.loc[(a, b), 'mean'] for b in ['b1', 'b2']]), se=np.sqrt(mse2 / 4 * sum(1 / cm.loc[(a, b), 'count'] for b in ['b1', 'b2'])))
for i in range(3):
    for j in range(i + 1, 3):
        a, b_ = lv[i], lv[j]; diff = emm[a]['mean'] - emm[b_]['mean']; se = np.sqrt(mse2 / 4 * sum(1 / cm.loc[(a, b), 'count'] + 1 / cm.loc[(b_, b), 'count'] for b in ['b1', 'b2']))
        t = diff / se; pairs[a + '|' + b_] = dict(diff=diff, se=se, t=t, pTukey=stats.studentized_range.sf(abs(t) * np.sqrt(2), 3, dfe2), pScheffe=stats.f.sf(t * t / 2, 2, dfe2))
aov['emm_two_way'] = dict(emm=emm, pairs=pairs, dfe=dfe2)
# ANCOVA adjusted means (closed form): ybar_g - b_w (xbar_g - xbar), b_w = pooled within-group slope
xb = fd.x.mean(); sxy = sum(((g.x - g.x.mean()) * (g.y - g.y.mean())).sum() for _, g in fd.groupby('A')); sxx = sum(((g.x - g.x.mean()) ** 2).sum() for _, g in fd.groupby('A'))
bw = sxy / sxx; m3 = smf.ols('y ~ C(A) + x', fd).fit(); mse3 = m3.mse_resid; adj = {}; apairs = {}
st_ = {a: dict(y=g.y.mean(), x=g.x.mean(), n=len(g)) for a, g in fd.groupby('A')}
for a in lv: adj[a] = dict(mean=st_[a]['y'] - bw * (st_[a]['x'] - xb), se=np.sqrt(mse3 * (1 / st_[a]['n'] + (st_[a]['x'] - xb) ** 2 / sxx)))
for i in range(3):
    for j in range(i + 1, 3):
        a, b_ = lv[i], lv[j]; diff = adj[a]['mean'] - adj[b_]['mean']; se = np.sqrt(mse3 * (1 / st_[a]['n'] + 1 / st_[b_]['n'] + (st_[a]['x'] - st_[b_]['x']) ** 2 / sxx))
        t = diff / se; apairs[a + '|' + b_] = dict(diff=diff, se=se, t=t, pTukey=stats.studentized_range.sf(abs(t) * np.sqrt(2), 3, m3.df_resid))
aov['emm_ancova'] = dict(emm=adj, pairs=apairs)
aov['resid_sw_two_way'] = list(stats.shapiro(m2.resid))
out['anova'] = aov

# ------------------------------------------------------------------ repeated measures
def r_mauchly(E, dfe):  # R mauchly.test on an error SSCP of orthonormal contrasts
    p = E.shape[0]; logW = np.linalg.slogdet(E)[1] - p * np.log(np.trace(E) / p)
    rho = 1 - (2 * p ** 2 + p + 2) / (6 * p * dfe); w2 = (p + 2) * (p - 1) * (p - 2) * (2 * p ** 3 + 6 * p ** 2 + 3 * p + 2) / (288 * (dfe * p * rho) ** 2)
    z = -dfe * rho * logW; f = p * (p + 1) / 2 - 1; P1 = stats.chi2.sf(z, f); P2 = stats.chi2.sf(z, f + 4)
    return np.exp(logW), z, P1 + w2 * (P2 - P1)


rmo = {}
rm['id'] = np.arange(ns)
long1 = rm.melt(id_vars=['id', 'G'], value_vars=['t1', 't2', 't3'], var_name='T', value_name='v')
a1 = pg.rm_anova(long1, dv='v', within='T', subject='id', detailed=True, correction=True)
sph = pg.sphericity(long1, dv='v', within='T', subject='id'); hf = pg.epsilon(long1, dv='v', within='T', subject='id', correction='hf')
Yc = rm[['t1', 't2', 't3']].values; Cm = np.array([[1 / np.sqrt(2), 1 / np.sqrt(6)], [-1 / np.sqrt(2), 1 / np.sqrt(6)], [0, -2 / np.sqrt(6)]])
Z = Yc @ Cm; Zc = Z - Z.mean(0); W_, chi_, pm = r_mauchly(Zc.T @ Zc, ns - 1)
rmo['oneway'] = dict(SS=float(a1['SS'][0]), df=float(a1['DF'][0]), SSerr=float(a1['SS'][1]), dferr=float(a1['DF'][1]), F=float(a1['F'][0]), p=float(a1['p_unc'][0]),
                     pGG=float(a1['p_GG_corr'][0]), gg=float(a1['eps'][0]), hf=float(hf), W=float(sph.W), W_r=W_, chi=float(sph.chi2), chi_r=chi_, pMauchly=pm, ng2=float(a1['ng2'][0]))
# post hoc (paired t, Holm/Bonferroni)
pr = []
for i, j in [(0, 1), (0, 2), (1, 2)]:
    r_ = stats.ttest_rel(Yc[:, i], Yc[:, j]); pr.append(dict(a='t%d' % (i + 1), b='t%d' % (j + 1), t=r_.statistic, p=r_.pvalue))
ps = np.array([r_['p'] for r_ in pr]); order = np.argsort(ps); holm = np.empty(3); run = 0
for k, ix in enumerate(order): run = max(run, min(1, (3 - k) * ps[ix])); holm[ix] = run
for k, r_ in enumerate(pr): r_['pBonf'] = min(1, 3 * r_['p']); r_['pHolm'] = holm[k]
rmo['oneway_posthoc'] = pr
# two within factors (balanced, no between factor): statsmodels AnovaRM
long2 = rm.melt(id_vars=['id'], value_vars=['a%db%d' % (a + 1, b + 1) for a in range(2) for b in range(3)], var_name='cell', value_name='v')
long2['FA'] = long2.cell.str[:2]; long2['FB'] = long2.cell.str[2:]
ar = AnovaRM(long2, 'v', 'id', within=['FA', 'FB']).fit().anova_table
rmo['twoway'] = {k.replace(':', ' ✻ '): dict(F=float(r_['F Value']), df1=float(r_['Num DF']), df2=float(r_['Den DF']), p=float(r_['Pr > F'])) for k, r_ in ar.iterrows()}
a2 = pg.rm_anova(long2, dv='v', within=['FA', 'FB'], subject='id')
rmo['twoway_pg'] = {r_['Source'].replace(' * ', ' ✻ '): dict(F=float(r_['F']), pGG=float(r_['p_GG_corr']), eps=float(r_['eps']), ng2=float(r_['ng2'])) for _, r_ in a2.iterrows()}
# mixed: G between, T within (equal group sizes)
mx = pg.mixed_anova(long1, dv='v', within='T', between='G', subject='id', correction=True, effsize='np2')
rmo['mixed'] = {r_['Source']: dict(SS=float(r_['SS']), df1=float(r_['DF1']), df2=float(r_['DF2']), F=float(r_['F']), p=float(r_['p_unc']), np2=float(r_['np2'])) for _, r_ in mx.iterrows()}
rmo['mixed']['T']['pGG'] = float(mx['p_GG_corr'][1]); rmo['mixed']['T']['eps'] = float(mx['eps'][1])
out['rm'] = rmo

# ------------------------------------------------------------------ MANOVA and Box's M
def r_manova_hl(eig, p, q, dfr):
    s = min(p, q); m = 0.5 * (abs(p - q) - 1); nn = 0.5 * (dfr - p - 1); t1 = 2 * m + s + 1; t2 = 2 * (s * nn + 1); T = eig.sum()
    F_ = t2 * T / s / s / t1; return T, F_, s * t1, t2, stats.f.sf(F_, s * t1, t2)


fm = fac.dropna().reset_index(drop=True)
mv = MANOVA.from_formula('y + y2 + y3 ~ C(A, Sum) * C(B, Sum)', fm).mv_test()
mvo = {}
mres = smf.ols('y ~ C(A, Sum) * C(B, Sum)', fm).fit()
Ymat = fm[['y', 'y2', 'y3']].values; Xmat = mres.model.exog; Bh = np.linalg.lstsq(Xmat, Ymat, rcond=None)[0]; Rm = Ymat - Xmat @ Bh; Emat = Rm.T @ Rm
names = mres.model.exog_names; XtXi = np.linalg.inv(Xmat.T @ Xmat)
for key, nm in [('C(A, Sum)', 'A'), ('C(B, Sum)', 'B'), ('C(A, Sum):C(B, Sum)', 'A ✻ B')]:
    st = mv.results[key]['stat']; d = {}
    for lab, k in [("Wilks' lambda", 'wilks'), ("Pillai's trace", 'pillai'), ("Hotelling-Lawley trace", 'hotelling'), ("Roy's greatest root", 'roy')]:
        d[k] = dict(stat=float(st.loc[lab, 'Value']), F=float(st.loc[lab, 'F Value']), df1=float(st.loc[lab, 'Num DF']), df2=float(st.loc[lab, 'Den DF']), p=float(st.loc[lab, 'Pr > F']))
    idx = [i for i, n_ in enumerate(names) if re.sub(r'\[[^\]]*\]', '', n_) == key]
    Bt = Bh[idx]; H = Bt.T @ np.linalg.inv(XtXi[np.ix_(idx, idx)]) @ Bt
    eig = np.sort(np.real(np.linalg.eigvals(np.linalg.solve(Emat, H))))[::-1]
    T, Fh, d1, d2, ph_ = r_manova_hl(eig, 3, len(idx), mres.df_resid)
    d['hotelling'] = dict(stat=T, F=Fh, df1=d1, df2=d2, p=ph_, stat_sm=d['hotelling']['stat'])
    mvo[nm] = d
out['manova'] = mvo
bm = pg.box_m(fm, dvs=['y', 'y2', 'y3'], group='A')
out['boxm_A'] = dict(chi=float(bm['Chi2'].iloc[0]), df=float(bm['df'].iloc[0]), p=float(bm['pval'].iloc[0]))

# ------------------------------------------------------------------ Kruskal-Wallis + Dunn, Friedman + Kendall W + Conover
def dunn(y, g):
    y = np.asarray(y); g = np.asarray(g); r = stats.rankdata(y); N = len(y); _, t = np.unique(y, return_counts=True)
    s2 = N * (N + 1) / 12 - (t ** 3 - t).sum() / (12 * (N - 1)); lv_ = list(dict.fromkeys(g)); res = {}
    for i in range(len(lv_)):
        for j in range(i + 1, len(lv_)):
            a, b = lv_[i], lv_[j]; z = (r[g == a].mean() - r[g == b].mean()) / np.sqrt(s2 * (1 / (g == a).sum() + 1 / (g == b).sum()))
            res[a + '|' + b] = dict(z=z, p=2 * stats.norm.sf(abs(z)))
    return res


kw = {}
for v in ['yi', 'y']:
    d_ = fac.dropna(subset=[v]); gg = [d_.loc[d_.A == a, v].values for a in lv]; h = stats.kruskal(*gg); N_ = len(d_)
    kw[v] = dict(H=h.statistic, p=h.pvalue, eps2=h.statistic / ((N_ ** 2 - 1) / (N_ + 1)), dunn=dunn(d_[v].values, d_.A.values))
d_ = cs[['gender', 'sat_1']].dropna(); h = stats.kruskal(*[d_.loc[d_.gender == g, 'sat_1'] for g in gs]); kw['sat_1_gender'] = dict(H=h.statistic, p=h.pvalue)
out['kruskal'] = kw


def conover(Y):
    n_, k = Y.shape; Rk = np.apply_along_axis(stats.rankdata, 1, Y); R = Rk.sum(0); A1 = (Rk ** 2).sum(); dfc = (n_ - 1) * (k - 1)
    se = np.sqrt(2 * (n_ * A1 - (R ** 2).sum()) / dfc); res = {}
    for i in range(k):
        for j in range(i + 1, k):
            t = (R[i] - R[j]) / se; res['%d|%d' % (i, j)] = dict(t=t, p=2 * stats.t.sf(abs(t), dfc))
    return res


fr = {}
for key, cols in [('rm_r', ['r1', 'r2', 'r3']), ('rm_t', ['t1', 't2', 't3']), ('cs_imag', ['imag_1', 'imag_2', 'imag_3'])]:
    src = rm if key.startswith('rm') else cs
    Y = src[cols].dropna().values; f = stats.friedmanchisquare(*Y.T); n_, k = Y.shape
    lng = pd.DataFrame(Y, columns=cols).reset_index().melt(id_vars='index', var_name='w', value_name='v')
    pgf = pg.friedman(lng, dv='v', within='w', subject='index')
    fr[key] = dict(chi=f.statistic, p=f.pvalue, W=f.statistic / (n_ * (k - 1)), W_pg=float(pgf['W'].iloc[0]), n=n_, conover=conover(Y))
out['friedman'] = fr


def clean(o):
    if isinstance(o, dict): return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)): return [clean(v) for v in o]
    if isinstance(o, (np.floating, float)): return F(float(o))
    if isinstance(o, np.integer): return int(o)
    if isinstance(o, np.ndarray): return clean(o.tolist())
    return o


print(json.dumps(clean(out), ensure_ascii=False, indent=1))
