#!/usr/bin/env python3
"""Reference values for js/stats2.js (classic statistics II), written to tests/fixtures/stats2.json.

Every number comes from an established library where one exists:
  SciPy (pearsonr, spearmanr, kendalltau, chi2_contingency, fisher_exact, binomtest, chisquare, power_divergence),
  statsmodels (OLS, OLSInfluence, durbin_watson, MNLogit, OrderedModel, mcnemar, SquareTable, Table2x2, combine_effects),
  pingouin (partial_corr, cronbach_alpha, intraclass_corr, bayesfactor_ttest, bayesfactor_pearson, bayesfactor_binom),
  factor_analyzer (calculate_kmo, calculate_bartlett_sphericity, FactorAnalyzer, Rotator).
Where no library offers a statistic it is computed here from its published definition, independently of the JavaScript
code (marked "definition" below): Guttman's lambda 2/6, split-half, McDonald's omega (from factor_analyzer one-factor ML
loadings), Belsley collinearity diagnostics, stepwise selection (statsmodels p-values), r x c Fisher exact test (full
enumeration), Goodman-Kruskal gamma (brute-force pair counting; ASE from Agresti 2002), iterated principal axis, promax as
in R's stats::promax, ML/REML tau^2 (scipy optimisation of the (restricted) likelihood), one-sided JZS Bayes factors and
the delta posterior (scipy noncentral t + quad), the rho posterior (mpmath), the Gunel-Dickey contingency Bayes factors
(Dirichlet conjugacy, cross-checked by numerical integration) and Egger's test (statsmodels OLS of y/se on 1/se).

Usage: python tools/reference_stats2.py   (numpy, scipy, pandas, statsmodels, pingouin, factor_analyzer, mpmath)
"""
import json
import math
import os
import warnings

import numpy as np
import pandas as pd
import scipy.stats as st
from scipy import integrate, optimize
import statsmodels.api as sm
from statsmodels.stats.outliers_influence import OLSInfluence
from statsmodels.stats.stattools import durbin_watson
from statsmodels.stats.contingency_tables import mcnemar, SquareTable, Table2x2
from statsmodels.stats.meta_analysis import combine_effects
from statsmodels.miscmodels.ordinal_model import OrderedModel
import pingouin as pg
from factor_analyzer import FactorAnalyzer, Rotator, calculate_kmo, calculate_bartlett_sphericity
import mpmath
import factor_analyzer.factor_analyzer as _fam

# factor_analyzer 0.5 passes force_all_finite=, renamed ensure_all_finite= in scikit-learn 1.8
_check = _fam.check_array
_fam.check_array = lambda X, force_all_finite=True, **kw: _check(X, ensure_all_finite=force_all_finite, **kw)

warnings.filterwarnings('ignore')
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ex = lambda name: pd.read_csv(os.path.join(ROOT, 'examples', name))
F = lambda v: None if v is None or (isinstance(v, float) and not math.isfinite(v)) else float(v)
L = lambda a: [F(x) for x in np.asarray(a, dtype=float).ravel()]
M = lambda a: [L(r) for r in np.asarray(a, dtype=float)]
out = {}

# ------------------------------------------------------------------ synthetic data sets (stored for the JS tests)
rs = np.random.RandomState(20261107)
n = 240
x1 = rs.normal(0, 1, n); x2 = rs.normal(0, 1, n); grp = rs.choice([1, 2, 3], n)
eta1 = 0.4 + 0.9 * x1 - 0.5 * x2 + 0.6 * (grp == 2); eta2 = -0.3 + 0.2 * x1 + 0.8 * x2 - 0.7 * (grp == 3)
P = np.exp(np.c_[np.zeros(n), eta1, eta2]); P /= P.sum(1, keepdims=True)
yc = np.array([rs.choice(3, p=p) for p in P]) + 1
synth = {'names': ['outcome', 'x1', 'x2', 'grp'], 'cols': [yc.tolist(), L(np.round(x1, 4)), L(np.round(x2, 4)), grp.tolist()],
         'kinds': ['cat', 'num', 'num', 'cat'], 'labels': [['low', 'mid', 'high'], None, None, ['a', 'b', 'c']]}
out['synth'] = synth
sx1, sx2 = np.round(x1, 4), np.round(x2, 4)

def table_ds(tab, rname='r', cname='c'):
    rows, cols = [], []
    for i, row in enumerate(tab):
        for j, v in enumerate(row):
            rows += [i + 1] * v; cols += [j + 1] * v
    return {'names': [rname, cname], 'cols': [rows, cols], 'kinds': ['num', 'num'], 'labels': [None, None]}

# ------------------------------------------------------------------ correlation
tp = ex('training_performance.csv')
cv = ['training_hours', 'supervisor_support', 'motivation', 'self_efficacy', 'performance']
pairs = []
for a in range(len(cv)):
    for b in range(a + 1, len(cv)):
        x, y = tp[cv[a]], tp[cv[b]]
        pr = st.pearsonr(x, y); ci = pr.confidence_interval(0.95)
        pg_ = st.pearsonr(x, y, alternative='greater')
        s = st.spearmanr(x, y); k = st.kendalltau(x, y)
        pc = pg.partial_corr(tp, cv[a], cv[b], covar=['age'])
        r_p = float(pc['r'].iloc[0]); npart = len(tp)
        zc = st.norm.ppf(0.975) / math.sqrt(npart - 1 - 3)
        ps = pg.partial_corr(tp, cv[a], cv[b], covar=['age'], method='spearman')
        pairs.append({'x': cv[a], 'y': cv[b], 'r': F(pr.statistic), 'p': F(pr.pvalue), 'lo': F(ci.low), 'hi': F(ci.high), 'pGreater': F(pg_.pvalue),
                      'loGreater': F(pg_.confidence_interval(0.95).low), 'cov': F(np.cov(x, y)[0, 1]),
                      'rho': F(s.statistic), 'pRho': F(s.pvalue), 'tau': F(k.statistic), 'pTau': F(k.pvalue),
                      'partial': r_p, 'pPartial': F(pc['p_val'].iloc[0]), 'loPartial': F(math.tanh(math.atanh(r_p) - zc)), 'hiPartial': F(math.tanh(math.atanh(r_p) + zc)),
                      'partialRho': F(ps['r'].iloc[0]), 'pPartialRho': F(ps['p_val'].iloc[0])})
small = rs.permutation(14).astype(float); small2 = rs.permutation(14).astype(float)
kex = {}
for alt in ['two-sided', 'greater', 'less']:
    kk = st.kendalltau(small, small2, alternative=alt); kex[alt] = {'tau': F(kk.statistic), 'p': F(kk.pvalue)}
out['corr'] = {'vars': cv, 'covar': 'age', 'pairs': pairs, 'kendallExact': {'x': L(small), 'y': L(small2), 'res': kex}}

# ------------------------------------------------------------------ linear regression
yv = tp['performance']; b1 = ['training_hours', 'age']; b2 = ['supervisor_support', 'motivation', 'self_efficacy']
def fit(cols):
    X = sm.add_constant(tp[cols]) if cols else np.ones((len(tp), 1))
    return sm.OLS(yv, X).fit()
m1, m2 = fit(b1), fit(b1 + b2)
fch = (m2.rsquared - m1.rsquared) / len(b2) / ((1 - m2.rsquared) / m2.df_resid)
infl = OLSInfluence(m2)
Xc = sm.add_constant(tp[b1 + b2]).to_numpy(); Xs = Xc / np.sqrt((Xc ** 2).sum(0))
ev, V = np.linalg.eigh(Xs.T @ Xs); o = np.argsort(ev)[::-1]; ev, V = ev[o], V[:, o]
phi = V ** 2 / ev; props = phi / phi.sum(1, keepdims=True)   # definition (Belsley, Kuh & Welsch 1980)
def coef_rows(m, cols):
    rows = []; ci = m.conf_int(0.05)
    sy = yv.std(ddof=1)
    for j, nm in enumerate(['const'] + cols):
        r = {'b': F(m.params[nm]), 'se': F(m.bse[nm]), 't': F(m.tvalues[nm]), 'p': F(m.pvalues[nm]), 'lo': F(ci.loc[nm, 0]), 'hi': F(ci.loc[nm, 1])}
        if nm != 'const':
            others = [c for c in cols if c != nm]
            r2j = sm.OLS(tp[nm], sm.add_constant(tp[others])).fit().rsquared if others else 0.0
            t = m.tvalues[nm]
            r.update({'beta': F(m.params[nm] * tp[nm].std(ddof=1) / sy), 'vif': F(1 / (1 - r2j)), 'zero': F(np.corrcoef(tp[nm], yv)[0, 1]),
                      'partial': F(t / math.sqrt(t * t + m.df_resid)), 'part': F(t * math.sqrt((1 - m.rsquared) / m.df_resid))})
        rows.append(r)
    return rows
f1 = (m1.rsquared) / len(b1) / ((1 - m1.rsquared) / m1.df_resid)
def stepwise(method, cand, pin=0.05, pout=0.10):   # definition (SPSS/JASP rules) using statsmodels p-values
    inm = list(cand) if method == 'backward' else []; steps = [list(inm)] if method == 'backward' else []
    for _ in range(4 * len(cand) + 4):
        changed = False
        if method != 'backward':
            best = None
            for c in [c for c in cand if c not in inm]:
                p = fit(inm + [c]).pvalues[c]
                if p < pin and (best is None or p < best[1]): best = (c, p)
            if best: inm = inm + [best[0]]; steps.append(list(inm)); changed = True
        if method != 'forward' and inm:
            m = fit(inm); worst = None
            for c in inm:
                p = m.pvalues[c]
                if p > pout and (worst is None or p > worst[1]): worst = (c, p)
            if worst: inm = [c for c in inm if c != worst[0]]; steps.append(list(inm)); changed = True
        if not changed: break
    return [{'vars': s, 'r2': F(fit(s).rsquared)} for s in steps]
cand = ['training_hours', 'age', 'supervisor_support', 'motivation', 'self_efficacy']
out['linreg'] = {
    'y': 'performance', 'blocks': [b1, b2],
    'models': [{'r2': F(m.rsquared), 'r2adj': F(m.rsquared_adj), 'rmse': F(math.sqrt(m.mse_resid)), 'F': F(m.fvalue), 'pF': F(m.f_pvalue), 'dw': F(durbin_watson(m.resid)), 'ssr': F(m.ess), 'sse': F(m.ssr)} for m in (m1, m2)],
    'change': [{'F': F(f1), 'p': F(st.f.sf(f1, 2, m1.df_resid))}, {'F': F(fch), 'p': F(st.f.sf(fch, 3, m2.df_resid))}],
    'coef2': coef_rows(m2, b1 + b2),
    'cooks': L(infl.cooks_distance[0]), 'leverage': L(infl.hat_matrix_diag), 'sres': L(infl.resid_studentized_internal),
    'collin': {'eigen': L(ev), 'ci': L(np.sqrt(ev[0] / ev)), 'props': M(props)},
    'steps': {mth: stepwise(mth, cand) for mth in ['forward', 'backward', 'stepwise']}}

# ------------------------------------------------------------------ multinomial and ordinal logistic regression
Xd = pd.DataFrame({'x1': sx1, 'x2': sx2, 'grp_b': (grp == 2).astype(float), 'grp_c': (grp == 3).astype(float)})
mn = sm.MNLogit(yc - 1, sm.add_constant(Xd)).fit(method='newton', maxiter=200, tol=1e-12, disp=0)
mn0 = sm.MNLogit(yc - 1, np.ones((n, 1))).fit(method='newton', disp=0, tol=1e-12)
mn_nox2 = sm.MNLogit(yc - 1, sm.add_constant(Xd[['x1', 'grp_b', 'grp_c']])).fit(method='newton', disp=0, tol=1e-12)
mn_nogrp = sm.MNLogit(yc - 1, sm.add_constant(Xd[['x1', 'x2']])).fit(method='newton', disp=0, tol=1e-12)
out['mlogit'] = {'params': M(np.asarray(mn.params).T), 'bse': M(np.asarray(mn.bse).T), 'llf': F(mn.llf), 'llnull': F(mn0.llf), 'aic': F(mn.aic), 'bic': F(mn.bic),
                 'lrX2': F(2 * (mn.llf - mn_nox2.llf)), 'lrGrp': F(2 * (mn.llf - mn_nogrp.llf))}
cs = ex('customer_satisfaction.csv')
od = cs[['loy_1', 'sat_1', 'val_1', 'gender']].dropna()
exog = pd.DataFrame({'sat_1': od.sat_1, 'val_1': od.val_1, 'male': (od.gender == 'male').astype(float)})
om = OrderedModel(od.loy_1.astype(int), exog, distr='logit').fit(method='bfgs', maxiter=5000, gtol=1e-10, disp=0)
thr = om.model.transform_threshold_params(om.params)[1:-1]
out['ordinal'] = {'beta': L(om.params[:3]), 'bse': L(om.bse[:3]), 'thresholds': L(thr), 'llf': F(om.llf), 'n': int(len(od))}

# ------------------------------------------------------------------ frequencies
g = cs.gender.dropna()
bt = {}
for alt in ['two-sided', 'greater', 'less']:
    r = st.binomtest(int((g == 'female').sum()), len(g), 0.5, alternative=alt); ci = r.proportion_ci(0.95, method='exact')
    bt[alt] = {'k': int((g == 'female').sum()), 'n': len(g), 'p': F(r.pvalue), 'lo': F(ci.low), 'hi': F(ci.high)}
pdx = ex('purchase_decision.csv'); r = st.binomtest(int((pdx.bought == 1).sum()), len(pdx), 0.3); ci = r.proportion_ci(0.95, method='exact')
out['binom'] = {'gender': bt, 'bought': {'k': int((pdx.bought == 1).sum()), 'n': len(pdx), 'p': F(r.pvalue), 'lo': F(ci.low), 'hi': F(ci.high)}}
sat = cs.sat_1.dropna().value_counts().sort_index().to_numpy()
c1 = st.chisquare(sat); g1 = st.power_divergence(sat, lambda_='log-likelihood')
gobs = np.array([(g == 'female').sum(), (g == 'male').sum()]); expv = np.array([0.4, 0.6]) * gobs.sum(); c2 = st.chisquare(gobs, expv)
out['gof'] = {'sat': {'chi': F(c1.statistic), 'p': F(c1.pvalue), 'g2': F(g1.statistic), 'pG': F(g1.pvalue)}, 'gender46': {'chi': F(c2.statistic), 'p': F(c2.pvalue)}}

def tab_ref(tab):
    tab = np.array(tab); N = tab.sum()
    c0 = st.chi2_contingency(tab, correction=False); lr = st.chi2_contingency(tab, correction=False, lambda_='log-likelihood')
    o = {'tab': tab.tolist(), 'chi': F(c0[0]), 'df': int(c0[2]), 'p': F(c0[1]), 'g2': F(lr[0]), 'pG': F(lr[1]), 'expected': M(c0[3]),
         'cramer': F(st.contingency.association(tab, method='cramer')), 'contingency': F(st.contingency.association(tab, method='pearson'))}
    # ordinal measures (definition): brute-force concordant / discordant pairs; ASE of gamma (Agresti 2002, eq. 3.47)
    r, c = tab.shape; Cc = Dd = 0; A = np.zeros((r, c)); D = np.zeros((r, c))
    for i in range(r):
        for j in range(c):
            A[i, j] = tab[:i, :j].sum() + tab[i + 1:, j + 1:].sum(); D[i, j] = tab[:i, j + 1:].sum() + tab[i + 1:, :j].sum()
    cells = [(i, j) for i in range(r) for j in range(c) for _ in range(tab[i, j])]
    for a in range(len(cells)):
        for b in range(a + 1, len(cells)):
            s = (cells[a][0] - cells[b][0]) * (cells[a][1] - cells[b][1])
            Cc += s > 0; Dd += s < 0
    Pp, Qq = (tab * A).sum(), (tab * D).sum()
    o['gamma'] = F((Cc - Dd) / (Cc + Dd)); o['gammaASE'] = F(4 / (Pp + Qq) ** 2 * math.sqrt((tab * (Qq * A - Pp * D) ** 2).sum()))
    ex_r = [i for i, j in cells]; ex_c = [j for i, j in cells]; kt = st.kendalltau(ex_r, ex_c)
    o['taub'] = F(kt.statistic); o['pTaub'] = F(kt.pvalue)
    if tab.shape == (2, 2):
        c1_ = st.chi2_contingency(tab, correction=True); o['yates'] = F(c1_[0]); o['pYates'] = F(c1_[1])
        for alt in ['two-sided', 'less', 'greater']: o['fisher_' + alt] = F(st.fisher_exact(tab, alternative=alt).pvalue)
        t22 = Table2x2(tab); o['or'] = F(t22.oddsratio); lo, hi = t22.oddsratio_confint(0.05); o['orLo'] = F(lo); o['orHi'] = F(hi)
        o['rr'] = F(t22.riskratio); lo, hi = t22.riskratio_confint(0.05); o['rrLo'] = F(lo); o['rrHi'] = F(hi)
        o['phi'] = F((tab[0, 0] * tab[1, 1] - tab[0, 1] * tab[1, 0]) / math.sqrt(tab.sum(1).prod() * tab.sum(0).prod()))
        for k_, kw in (('mcn', dict(exact=False, correction=False)), ('mcnCC', dict(exact=False, correction=True)), ('mcnExact', dict(exact=True))):
            m_ = mcnemar(tab, **kw); o[k_] = F(m_.statistic) if k_ != 'mcnExact' else None; o['p_' + k_] = F(m_.pvalue)
    else:
        o['fisher_two-sided'] = F(fisher_rc(tab))
        if r == c: sy = SquareTable(tab, shift_zeros=False).symmetry(); o['bowker'] = F(sy.statistic); o['pBowker'] = F(sy.pvalue)
    return o

def fisher_rc(tab):   # definition: enumerate every table with the observed margins
    R, C, N = tab.sum(1), tab.sum(0), tab.sum()
    lf = lambda v: math.lgamma(v + 1)
    const = sum(lf(v) for v in R) + sum(lf(v) for v in C) - lf(N)
    lp = lambda t: const - sum(lf(v) for v in np.ravel(t))
    lobs = lp(tab); total = 0.0; r, c = tab.shape
    def rows_with(rowsum, cl, j=0, cur=()):   # every row vector with this sum fitting the remaining column totals
        if j == c - 1:
            if rowsum <= cl[j]: yield cur + (rowsum,)
            return
        for v in range(max(0, rowsum - sum(cl[j + 1:])), min(rowsum, cl[j]) + 1):
            yield from rows_with(rowsum - v, cl, j + 1, cur + (v,))
    def rec(i, cl, rows):
        nonlocal total
        if i == r - 1:
            l = lp(np.array(rows + [tuple(cl)]))
            if l <= lobs + math.log1p(1e-7): total += math.exp(l)
            return
        for row in rows_with(R[i], cl):
            rec(i + 1, [a - b for a, b in zip(cl, row)], rows + [row])
    rec(0, list(C), [])
    return min(1.0, total)

tabs = {'t22': [[12, 5], [7, 19]], 't33': [[6, 2, 1], [3, 7, 2], [1, 3, 8]], 't23': [[8, 4, 2], [3, 6, 9]], 't32': [[5, 3], [2, 8], [7, 1]]}
out['crosstab'] = {k: tab_ref(v) for k, v in tabs.items()}
out['crosstab']['gender_sat'] = {'chi': None}
gs = cs[['gender', 'sat_1']].dropna(); ct = pd.crosstab(gs.gender, gs.sat_1).loc[['female', 'male']].to_numpy()
c0 = st.chi2_contingency(ct, correction=False); out['crosstab']['gender_sat'] = {'chi': F(c0[0]), 'p': F(c0[1]), 'df': int(c0[2]), 'cramer': F(st.contingency.association(ct, method='cramer'))}

# ------------------------------------------------------------------ reliability
cr = ex('corporate_reputation.csv')
def rel_ref(df):
    X = df.to_numpy(float); k = X.shape[1]; nobs = X.shape[0]; C = np.cov(X.T); Vx = C.sum(); sv = np.trace(C)
    alpha = pg.cronbach_alpha(df)[0]
    lo = 1 - (1 - alpha) * st.f.isf(0.025, nobs - 1, (nobs - 1) * (k - 1)); hi = 1 - (1 - alpha) * st.f.isf(0.975, nobs - 1, (nobs - 1) * (k - 1))
    l1 = 1 - sv / Vx; c2 = (C ** 2).sum() - (np.diag(C) ** 2).sum(); l2 = l1 + math.sqrt(k / (k - 1) * c2) / Vx      # definition (Guttman 1945)
    l6 = 1 - (1 / np.diag(np.linalg.inv(C))).sum() / Vx
    fa = FactorAnalyzer(n_factors=1, rotation=None, method='ml'); fa.fit(X)
    lam = fa.loadings_[:, 0] * np.sqrt(np.diag(C)); lam *= np.sign(lam.sum()); th = fa.get_uniquenesses() * np.diag(C)
    omega = lam.sum() ** 2 / (lam.sum() ** 2 + th.sum())                                                             # McDonald (1999)
    tot = X.sum(1); A = X[:, 0::2].sum(1); B = X[:, 1::2].sum(1); rsh = np.corrcoef(A, B)[0, 1]
    items = []
    for i in range(k):
        rest = tot - X[:, i]
        items.append({'itemRest': F(np.corrcoef(X[:, i], rest)[0, 1]), 'alphaDrop': F(pg.cronbach_alpha(df.drop(columns=df.columns[i]))[0]) if k > 2 else None,
                      'mean': F(X[:, i].mean()), 'sd': F(X[:, i].std(ddof=1))})
    R = np.corrcoef(X.T); rbar = R[np.tril_indices(k, -1)].mean()
    return {'alpha': F(alpha), 'lo': F(lo), 'hi': F(hi), 'l2': F(l2), 'l6': F(l6), 'omega': F(omega), 'split': F(rsh), 'sb': F(2 * rsh / (1 + rsh)),
            'guttmanSplit': F(2 * (1 - (A.var(ddof=1) + B.var(ddof=1)) / tot.var(ddof=1))), 'rbar': F(rbar), 'alphaStd': F(k * rbar / (1 + (k - 1) * rbar)), 'items': items}
qual = ['qual_1', 'qual_2', 'qual_3', 'qual_4', 'qual_5']
crr = cr.copy(); crr['qual_3'] = crr.qual_3.min() + crr.qual_3.max() - crr.qual_3
out['rel'] = {'items': qual, 'plain': rel_ref(cr[qual]), 'reversed': rel_ref(crr[qual]), 'reverse': ['qual_3']}

ww = ex('workload_wellbeing.csv'); wl = ['wl_1', 'wl_2', 'wl_3', 'wl_4']
long = ww[wl].reset_index().melt(id_vars='index', var_name='rater', value_name='score')
ic = pg.intraclass_corr(long, targets='index', raters='rater', ratings='score')
# pingouin rounds its CI95 column to two decimals: the limits are recomputed here with pingouin's own formulas
Xw = ww[wl].to_numpy(float); nI, kI = Xw.shape; gm = Xw.mean()
ssr = kI * ((Xw.mean(1) - gm) ** 2).sum(); ssc = nI * ((Xw.mean(0) - gm) ** 2).sum(); sse = ((Xw - gm) ** 2).sum() - ssr - ssc
msb, msj, mse = ssr / (nI - 1), ssc / (kI - 1), sse / ((nI - 1) * (kI - 1)); msw = (ssc + sse) / (nI * (kI - 1))
icc2 = (msb - mse) / (msb + (kI - 1) * mse + kI * (msj - mse) / nI); f1k = msb / msw; f3k = msb / mse
df1, df1kd, df2kd = nI - 1, nI * (kI - 1), (nI - 1) * (kI - 1)
f1l = f1k / st.f.ppf(0.975, df1, df1kd); f1u = f1k * st.f.ppf(0.975, df1kd, df1); f3l = f3k / st.f.ppf(0.975, df1, df2kd); f3u = f3k * st.f.ppf(0.975, df2kd, df1)
fj = msj / mse; vn = df2kd * (kI * icc2 * fj + nI * (1 + (kI - 1) * icc2) - kI * icc2) ** 2; vd = df1 * kI ** 2 * icc2 ** 2 * fj ** 2 + (nI * (1 + (kI - 1) * icc2) - kI * icc2) ** 2; v = vn / vd
f2u = st.f.ppf(0.975, nI - 1, v); f2l = st.f.ppf(0.975, v, nI - 1)
l2 = nI * (msb - f2u * mse) / (f2u * (kI * msj + (kI * nI - kI - nI) * mse) + nI * msb); u2 = nI * (f2l * msb - mse) / (kI * msj + (kI * nI - kI - nI) * mse + nI * f2l * msb)
cis = [((f1l - 1) / (f1l + kI - 1), (f1u - 1) / (f1u + kI - 1)), (l2, u2), ((f3l - 1) / (f3l + kI - 1), (f3u - 1) / (f3u + kI - 1)),
       (1 - 1 / f1l, 1 - 1 / f1u), (l2 * kI / (1 + l2 * (kI - 1)), u2 * kI / (1 + u2 * (kI - 1))), (1 - 1 / f3l, 1 - 1 / f3u)]
for c_, c0_ in zip(cis, ic.CI95): assert abs(c_[0] - c0_[0]) < 0.006 and abs(c_[1] - c0_[1]) < 0.006
out['icc'] = {'vars': wl, 'rows': [{'type': t, 'icc': F(i), 'F': F(f_), 'df1': F(d1), 'df2': F(d2), 'p': F(p_), 'lo': F(c[0]), 'hi': F(c[1])}
                                    for t, i, f_, d1, d2, p_, c in zip(ic.Type, ic.ICC, ic.F, ic.df1, ic.df2, ic.pval, cis)]}

# ------------------------------------------------------------------ factor analysis
fv = ['qual_1', 'qual_2', 'qual_3', 'qual_4', 'qual_5', 'csr_1', 'csr_2', 'csr_3', 'csr_4', 'like_1', 'like_2', 'like_3', 'like_4']
Xf = cr[fv].to_numpy(float); Rf = np.corrcoef(Xf.T); nf = 3; nobs = len(Xf); p = len(fv)
kmo_all, kmo_tot = calculate_kmo(cr[fv]); bchi, bp = calculate_bartlett_sphericity(cr[fv])
def unrot(method):
    if method == 'pa':   # definition: iterated principal axis from SMCs to convergence
        h2 = 1 - 1 / np.diag(np.linalg.inv(Rf))
        for _ in range(5000):
            Rr = Rf.copy(); np.fill_diagonal(Rr, h2); e, V = np.linalg.eigh(Rr); o_ = np.argsort(e)[::-1][:nf]
            Lr = V[:, o_] * np.sqrt(np.maximum(e[o_], 0)); nh = (Lr ** 2).sum(1)
            if np.max(np.abs(nh - h2)) < 1e-12: h2 = nh; break
            h2 = nh
        return Lr
    if method == 'pc':
        e, V = np.linalg.eigh(Rf); o_ = np.argsort(e)[::-1][:nf]; return V[:, o_] * np.sqrt(e[o_])
    fa = FactorAnalyzer(n_factors=nf, rotation=None, method=method); fa.fit(Xf); return fa.loadings_
def rot(Lr, method):
    if method == 'none': return Lr, None
    if method == 'promax':   # R stats::promax: Kaiser-normalised varimax, then the power-4 target (definition)
        X = Rotator(method='varimax', normalize=True, tol=0, max_iter=50000).fit_transform(Lr)
        Q = X * np.abs(X) ** 3; U = np.linalg.lstsq(X, Q, rcond=None)[0]; d = np.diag(np.linalg.inv(U.T @ U)); U = U @ np.diag(np.sqrt(d))
        return X @ U, np.linalg.inv(U.T @ U)
    kw = dict(tol=1e-10, max_iter=20000)
    name = {'varimax': 'varimax', 'quartimax': 'quartimax', 'equamax': 'equamax', 'oblimin': 'oblimin', 'geominQ': 'geomin_obl', 'geominT': 'geomin_ort'}[method]
    if method == 'varimax': kw = dict(tol=0, max_iter=50000)   # factor_analyzer's relative stopping rule stops early otherwise
    r = Rotator(method=name, normalize=(method == 'varimax'), kappa=nf / (2 * p), **kw)
    Lx = r.fit_transform(Lr)
    return Lx, (r.phi_ if method in ('oblimin', 'geominQ') else None)
efa = {}
for meth in ['ml', 'minres', 'pa', 'pc']:
    Lr = unrot(meth); efa[meth] = {'unrotated': M(Lr), 'h2': L((Lr ** 2).sum(1)), 'rot': {}}
    for rm in (['none', 'varimax', 'quartimax', 'equamax', 'promax', 'oblimin', 'geominQ', 'geominT'] if meth == 'ml' else ['varimax', 'promax', 'oblimin']):
        Lx, ph = rot(Lr, rm); efa[meth]['rot'][rm] = {'L': M(Lx), 'phi': M(ph) if ph is not None else None}
fa = FactorAnalyzer(n_factors=nf, rotation=None, method='ml'); fa.fit(Xf); Lm = fa.loadings_
Rh = Lm @ Lm.T; np.fill_diagonal(Rh, 1); Fml = np.trace(np.linalg.inv(Rh) @ Rf) - math.log(np.linalg.det(np.linalg.inv(Rh) @ Rf)) - p
chi = (nobs - 1 - (2 * p + 5) / 6 - 2 * nf / 3) * Fml; dfm = ((p - nf) ** 2 - (p + nf)) / 2
out['efa'] = {'vars': fv, 'nf': nf, 'kmo': F(kmo_tot), 'msa': L(kmo_all), 'bartlett': F(bchi), 'pBartlett': F(bp), 'eigen': L(np.sort(np.linalg.eigvalsh(Rf))[::-1]),
              'mlChi': F(chi), 'mlDf': F(dfm), 'mlP': F(st.chi2.sf(chi, dfm)), 'rmsea': F(math.sqrt(max((chi / dfm - 1) / (nobs - 1), 0))), 'fits': efa}

# ------------------------------------------------------------------ Bayesian t-tests
def nct_ratio(t, df, mu): return float(np.nan_to_num(st.nct.pdf(t, df, mu) / st.t.pdf(t, df)))
def bf_dir(t, N, df, r, side):   # definition: directional JZS BF = 2 * integral over the half line of the noncentral-t ratio
    cau = lambda d: st.cauchy.pdf(d, 0, r)
    f = lambda d: nct_ratio(t, df, d * math.sqrt(N)) * cau(d)
    dh = t / math.sqrt(N); lim = (0, max(dh, 0) + 3) if side == 'greater' else (min(dh, 0) - 3, 0)
    return 2 * integrate.quad(f, *lim, epsabs=0, epsrel=1e-12, limit=500)[0]
def post_q(t, N, df, r, side, probs):
    f = lambda d: nct_ratio(t, df, d * math.sqrt(N)) * st.cauchy.pdf(d, 0, r)
    dh = t / math.sqrt(N); lo, hi = dh - 3, dh + 3
    if side == 'greater': lo = 0
    if side == 'less': hi = 0
    Z = integrate.quad(f, lo, hi, epsabs=0, epsrel=1e-12, limit=500)[0]
    res = []
    for q in probs:
        g_ = lambda x: integrate.quad(f, lo, x, epsabs=0, epsrel=1e-12, limit=500)[0] / Z - q
        a, b = lo + 1e-12, hi - 1e-12
        res.append(optimize.brentq(g_, a, b, xtol=1e-12))
    return res
bt_cases = {}
mot = tp.motivation.to_numpy(); se_ = tp.self_efficacy.to_numpy()
csg = cs[['sat_1', 'gender']].dropna(); fem = csg.sat_1[csg.gender == 'female'].to_numpy(); mal = csg.sat_1[csg.gender == 'male'].to_numpy()
specs = {'one': (st.ttest_1samp(mot[:25], 5.0).statistic, 25, 24), 'paired': (st.ttest_rel(se_[:40], mot[:40]).statistic, 40, 39),
         'independent': (st.ttest_ind(fem, mal).statistic, len(fem) * len(mal) / (len(fem) + len(mal)), len(fem) + len(mal) - 2)}
for key, (t, N, df) in specs.items():
    t = float(t); ny = None if key != 'independent' else len(mal)
    if key == 'independent': bf2 = pg.bayesfactor_ttest(t, len(fem), len(mal), r=0.707)
    elif key == 'paired': bf2 = pg.bayesfactor_ttest(t, 40, paired=True, r=0.707)
    else: bf2 = pg.bayesfactor_ttest(t, 25, r=0.707)
    bt_cases[key] = {'t': t, 'N': F(N), 'df': F(df), 'bf10': F(bf2), 'bfPlus': F(bf_dir(t, N, df, 0.707, 'greater')), 'bfMinus': F(bf_dir(t, N, df, 0.707, 'less')),
                     'bf10wide': F(pg.bayesfactor_ttest(t, 25, r=1.0)) if key == 'one' else None, 'post': L(post_q(t, N, df, 0.707, 'two', [0.025, 0.5, 0.975])),
                     'postPlus': L(post_q(t, N, df, 0.707, 'greater', [0.025, 0.5, 0.975])) if t > 0 else None}
out['bttest'] = {'r': 0.707, 'mu0': 5.0, 'cases': bt_cases, 'nFem': len(fem), 'nMal': len(mal)}

# ------------------------------------------------------------------ Bayesian correlation
mpmath.mp.dps = 25
def rho_dir(r, n):   # definition: directional BFs by integrating the likelihood ratio over half the uniform prior
    lik = lambda rho: (1 - rho * rho) ** ((n - 1) / 2) * (1 - rho * r) ** (-(n - 1.5)) * mpmath.hyp2f1(0.5, 0.5, n - 0.5, (1 + rho * r) / 2)
    l0 = lik(0)
    return float(mpmath.quad(lambda x: lik(x) / l0, [0, r / 2, r, 1]) if r > 0 else mpmath.quad(lambda x: lik(x) / l0, [0, 1])), float(mpmath.quad(lambda x: lik(x) / l0, [-1, 0]))
def rho_post(r, n, probs):    # definition: Hotelling density of r as the likelihood of rho, uniform prior (kappa = 1)
    lik = lambda rho: (1 - rho * rho) ** ((n - 1) / 2) * (1 - rho * r) ** (-(n - 1.5)) * mpmath.hyp2f1(0.5, 0.5, n - 0.5, (1 + rho * r) / 2)
    Z = mpmath.quad(lik, [-1, 0, r, 1]); res = []
    for q in probs:
        res.append(optimize.brentq(lambda x: float(mpmath.quad(lik, [-1, min(x, r), x]) / Z) - q, -0.999, 0.999, xtol=1e-11))
    return res
bc = []
for (a, b, nn) in [('motivation', 'performance', 300), ('training_hours', 'supervisor_support', 300), ('motivation', 'self_efficacy', 30), ('age', 'performance', 60)]:
    x, y = tp[a].to_numpy()[:nn], tp[b].to_numpy()[:nn]; r = float(np.corrcoef(x, y)[0, 1])
    bc.append({'x': a, 'y': b, 'n': nn, 'r': r, 'bf10': F(pg.bayesfactor_pearson(r, nn)), 'bfPlus': F(pg.bayesfactor_pearson(r, nn, alternative='greater')),
               'bfMinus': F(pg.bayesfactor_pearson(r, nn, alternative='less')), 'bf10k2': F(pg.bayesfactor_pearson(r, nn, kappa=0.5)),
               'post': rho_post(r, nn, [0.025, 0.5, 0.975]) if nn <= 60 else None})
    bc[-1]['bfPlusNum'], bc[-1]['bfMinusNum'] = rho_dir(r, nn)
out['bcorr'] = bc

# ------------------------------------------------------------------ Bayesian binomial
bb = []
for k, nn, p0, a, b in [(139, 300, 0.5, 1, 1), (194, 500, 0.3, 1, 1), (115, 200, 0.5, 5, 4), (12, 40, 0.5, 1, 1)]:
    two = pg.bayesfactor_binom(k, nn, p0, a, b)
    lm = st.betabinom.logpmf(k, nn, a, b) - st.binom.logpmf(k, nn, p0)
    plus = math.exp(lm) * st.beta.sf(p0, a + k, b + nn - k) / st.beta.sf(p0, a, b)
    minus = math.exp(lm) * st.beta.cdf(p0, a + k, b + nn - k) / st.beta.cdf(p0, a, b)
    bb.append({'k': k, 'n': nn, 'p0': p0, 'a': a, 'b': b, 'bf10': F(two), 'bfPlus': F(plus), 'bfMinus': F(minus),
               'post': L(st.beta.ppf([0.025, 0.5, 0.975], a + k, b + nn - k))})
out['bbinom'] = bb

# ------------------------------------------------------------------ Bayesian contingency (Gunel & Dickey 1974)
def lmb(v): v = np.asarray(v, float); return sum(math.lgamma(x) for x in v) - math.lgamma(v.sum())
def gd(tab, design):
    tab = np.asarray(tab, float); I, J = tab.shape
    if design in ('rows', 'cols'):
        T = tab if design == 'rows' else tab.T; S = T.sum(0); ac = np.ones(T.shape[1])
        return sum(lmb(row + 1) - lmb(np.ones(T.shape[1])) for row in T) - (lmb(S + ac) - lmb(ac))
    return (lmb(tab.ravel() + 1) - lmb(np.ones(I * J))) - (lmb(tab.sum(1) + 1) - lmb(np.ones(I))) - (lmb(tab.sum(0) + 1) - lmb(np.ones(J)))
t22 = np.array(tabs['t22'])
# cross-check of the rows-fixed 2x2 formula by direct integration over the binomial proportions (uniform priors)
h1 = integrate.quad(lambda p: p ** t22[0, 0] * (1 - p) ** t22[0, 1], 0, 1, epsrel=1e-13)[0] * integrate.quad(lambda p: p ** t22[1, 0] * (1 - p) ** t22[1, 1], 0, 1, epsrel=1e-13)[0]
h0 = integrate.quad(lambda p: p ** (t22[:, 0].sum()) * (1 - p) ** (t22[:, 1].sum()), 0, 1, epsrel=1e-13)[0]
out['bcont'] = {k: {d: F(gd(v, d)) for d in ('joint', 'rows', 'cols')} for k, v in tabs.items()}
out['bcont']['t22']['rowsIntegral'] = F(math.log(h1 / h0))

# ------------------------------------------------------------------ meta-analysis (BCG vaccine trials, Colditz et al. 1994)
bcg = np.array([[4, 119, 11, 128], [6, 300, 29, 274], [3, 228, 11, 209], [62, 13536, 248, 12619], [33, 5036, 47, 5761], [180, 1361, 372, 1079],
                [8, 2537, 10, 619], [505, 87886, 499, 87892], [29, 7470, 45, 7232], [17, 1699, 65, 1600], [186, 50448, 141, 27197], [5, 2493, 3, 2338], [27, 16886, 29, 17825]], float)
yi = np.log((bcg[:, 0] / (bcg[:, 0] + bcg[:, 1])) / (bcg[:, 2] / (bcg[:, 2] + bcg[:, 3])))
vi = 1 / bcg[:, 0] - 1 / (bcg[:, 0] + bcg[:, 1]) + 1 / bcg[:, 2] - 1 / (bcg[:, 2] + bcg[:, 3])
k = len(yi)
def ll_tau(t2, reml):
    w = 1 / (vi + t2); mu = (w * yi).sum() / w.sum()
    s = -0.5 * np.log(vi + t2).sum() - 0.5 * (w * (yi - mu) ** 2).sum()
    return s - 0.5 * math.log(w.sum()) if reml else s
def summary(t2, Qfe):
    w = 1 / (vi + t2); mu = (w * yi).sum() / w.sum(); se = 1 / math.sqrt(w.sum()); wf = 1 / vi
    s2 = (k - 1) * wf.sum() / (wf.sum() ** 2 - (wf ** 2).sum())
    return {'tau2': F(t2), 'mu': F(mu), 'se': F(se), 'z': F(mu / se), 'p': F(2 * st.norm.sf(abs(mu / se))), 'I2': F(100 * t2 / (t2 + s2)), 'H2': F((t2 + s2) / s2),
            'piLo': F(mu - st.norm.ppf(0.975) * math.sqrt(se * se + t2)), 'piHi': F(mu + st.norm.ppf(0.975) * math.sqrt(se * se + t2))}
ce_dl = combine_effects(yi, vi, method_re='dl'); ce_pm = combine_effects(yi, vi, method_re='pm')
meta = {'yi': L(yi), 'vi': L(vi), 'labels': ['Aronson', 'Ferguson & Simes', 'Rosenthal a', 'Hart & Sutherland', 'Frimodt-Moller', 'Stein & Aronson', 'Vandiviere',
                                             'TPT Madras', 'Coetzee & Berjak', 'Rosenthal b', 'Comstock a', 'Comstock b', 'Comstock c']}
meta['FE'] = {'mu': F(ce_dl.mean_effect_fe), 'se': F(ce_dl.sd_eff_w_fe), 'Q': F(ce_dl.q), 'I2': F(max(0, (ce_dl.q - (k - 1)) / ce_dl.q) * 100), 'H2': F(ce_dl.q / (k - 1))}
meta['DL'] = summary(float(ce_dl.tau2), ce_dl.q); meta['DL']['muSM'] = F(ce_dl.mean_effect_re); meta['DL']['seSM'] = F(ce_dl.sd_eff_w_re); meta['DL']['I2SM'] = F(ce_dl.i2 * 100)
meta['PM'] = summary(float(ce_pm.tau2), ce_pm.q); meta['PM']['muSM'] = F(ce_pm.mean_effect_re)
for nm, reml in (('REML', True), ('ML', False)):
    res = optimize.minimize_scalar(lambda t: -ll_tau(t, reml), bounds=(0, 10), method='bounded', options={'xatol': 1e-13})
    meta[nm] = summary(float(res.x), ce_dl.q)
eg = sm.OLS(yi / np.sqrt(vi), sm.add_constant(1 / np.sqrt(vi))).fit()
meta['egger'] = {'b0': F(eg.params[0]), 'se': F(eg.bse[0]), 't': F(eg.tvalues[0]), 'p': F(eg.pvalues[0])}
z = yi / np.sqrt(vi); meta['fsn'] = F(max(0, z.sum() ** 2 / st.norm.ppf(0.95) ** 2 - k))
out['meta'] = meta

with open(os.path.join(ROOT, 'tests', 'fixtures', 'stats2.json'), 'w') as fh:
    json.dump(out, fh, indent=1)
print('wrote tests/fixtures/stats2.json')
