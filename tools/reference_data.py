"""Reference values for js/data.js (data editing and transformations), used by tests/data.test.js.

    pip install numpy scipy pandas
    python tools/reference_data.py > tests/fixtures/data.json

The input columns are generated here (with missing values and ties) and stored in the fixture together with the
results of pandas / numpy / scipy: z-scores, ranks with every tie rule, binning (pandas.cut / qcut), replacement of
missing values (series mean / median, linear interpolation, mean of nearby points, mode), Box-Cox and other transforms,
lag / lead / differences, duplicates, outliers (z, Tukey fences, Mahalanobis distance with chi-square p), aggregation
within groups, dummy coding and row-wise list functions of the expression language.
"""
import json
import os

import numpy as np
import pandas as pd
from scipy import stats
from scipy.spatial.distance import mahalanobis

rs = np.random.RandomState(20261108)
N = 60
L = lambda a: [None if (isinstance(v, float) and not np.isfinite(v)) else float(v) for v in np.asarray(a, dtype=float)]

x = np.round(rs.normal(50, 10, N), 2)
x[[3, 17, 40]] = np.nan
lik = rs.randint(1, 6, N).astype(float)          # Likert 1..5 with many ties
lik[[5, 6, 30]] = np.nan
pos = np.round(np.exp(rs.normal(1, 0.6, N)), 3)  # positive, skewed
pos[[2, 44]] = np.nan
q = np.column_stack([rs.randint(1, 8, N) for _ in range(3)]).astype(float)
q[rs.rand(N, 3) < 0.12] = np.nan
grp = rs.randint(1, 4, N).astype(float)
mv = rs.multivariate_normal([0, 1, 2], [[1, .5, .3], [.5, 1, .4], [.3, .4, 1]], N)
mv[7, 1] = np.nan
mv[0] = [4, -3, 5]                                # a multivariate outlier
dup = np.array([1, 2, 2, 3, 1, 4, 2, np.nan, np.nan, 5], dtype=float)
dup2 = np.array([1, 1, 1, 2, 1, 2, 1, 3, 3, 1], dtype=float)

out = {'input': {'x': L(x), 'lik': L(lik), 'pos': L(pos), 'q1': L(q[:, 0]), 'q2': L(q[:, 1]), 'q3': L(q[:, 2]), 'grp': L(grp),
                 'm1': L(mv[:, 0]), 'm2': L(mv[:, 1]), 'm3': L(mv[:, 2]), 'dup': L(dup), 'dup2': L(dup2)}}

# z-scores and centering (sample SD)
out['zscore'] = L(stats.zscore(x, ddof=1, nan_policy='omit'))
out['center'] = L(x - np.nanmean(x))

# ranks of the valid values
ok = ~np.isnan(lik)
ranks = {}
for name, method in [('mean', 'average'), ('low', 'min'), ('high', 'max'), ('dense', 'dense')]:
    r = np.full(N, np.nan); r[ok] = stats.rankdata(lik[ok], method=method); ranks[name] = L(r)
r = np.full(N, np.nan); r[ok] = stats.rankdata(-lik[ok], method='average'); ranks['desc'] = L(r)
n = ok.sum(); R = np.full(N, np.nan); R[ok] = stats.rankdata(lik[ok])
ranks['percent'] = L(100 * R / n); ranks['fraction'] = L(R / n)
ranks['ntiles4'] = L(np.where(ok, np.floor(4 * R / (n + 1)) + 1, np.nan))   # SPSS NTILES(4) definition
out['rank'] = ranks

# binning: equal width (pandas.cut) and equal-size groups (pandas.qcut, type-7 quantiles); right-closed intervals
cw = pd.cut(pd.Series(x), 4, labels=False)
out['bin_width4'] = L(cw + 1)
qc = pd.qcut(pd.Series(x), 3, labels=False)
out['bin_quantile3'] = L(qc + 1)
out['bin_quantile3_cuts'] = [float(v) for v in np.nanpercentile(x, [100 / 3, 200 / 3])]
ql = pd.qcut(pd.Series(lik), 4, labels=False, duplicates='drop')
out['bin_lik_quantile4'] = L(ql + 1)

# replacing missing values
s = pd.Series(x)
out['rmv'] = {
    'mean': L(s.fillna(s.mean())), 'median': L(s.fillna(s.median())),
    'linear': L(s.interpolate(method='linear', limit_area='inside')),
    'mode': L(pd.Series(lik).fillna(stats.mode(lik[ok], keepdims=False).mode)),
}
def nearby(v, span, fn):
    res = v.copy()
    for i in np.where(np.isnan(v))[0]:
        before = [y for y in v[:i][::-1] if not np.isnan(y)][:span]
        after = [y for y in v[i + 1:] if not np.isnan(y)][:span]
        if len(before) == span and len(after) == span:
            res[i] = fn(np.array(before + after))
    return res
out['rmv']['nearmean2'] = L(nearby(x, 2, np.mean))
out['rmv']['nearmedian2'] = L(nearby(x, 2, np.median))

# transforms
with np.errstate(all='ignore'):
    okp = ~np.isnan(pos)
    bc = np.full(N, np.nan); bc[okp] = stats.boxcox(pos[okp], lmbda=0.5); bc0 = np.full(N, np.nan); bc0[okp] = stats.boxcox(pos[okp], lmbda=0)
    bcm = np.full(N, np.nan); bcm[okp] = stats.boxcox(pos[okp], lmbda=-1.3)
    out['math'] = {'ln': L(np.log(pos)), 'log10': L(np.log10(pos)), 'sqrt': L(np.sqrt(pos)), 'inverse': L(1 / pos), 'boxcox05': L(bc), 'boxcox0': L(bc0), 'boxcox_m13': L(bcm)}
out['shift'] = {'lag2': L(s.shift(2)), 'lead1': L(s.shift(-1)), 'diff1': L(s.diff(1)), 'diff3': L(s - s.shift(3))}

# duplicates over (dup, dup2) with missing values equal to each other (pandas semantics)
df = pd.DataFrame({'a': dup, 'b': dup2})
out['duplicates'] = L(df.duplicated(keep='first').astype(float))

# outliers
q1, q3 = np.nanpercentile(x, [25, 75])
out['iqr'] = {'q1': float(q1), 'q3': float(q3), 'flag15': L(np.where(np.isnan(x), np.nan, ((x < q1 - 1.5 * (q3 - q1)) | (x > q3 + 1.5 * (q3 - q1))).astype(float)))}
z = stats.zscore(x, ddof=1, nan_policy='omit')
out['zflag2'] = L(np.where(np.isnan(z), np.nan, (np.abs(z) > 2).astype(float)))
cc = ~np.isnan(mv).any(axis=1)
mu = mv[cc].mean(axis=0); VI = np.linalg.inv(np.cov(mv[cc].T, ddof=1))
d2 = np.full(N, np.nan); d2[cc] = [mahalanobis(r, mu, VI) ** 2 for r in mv[cc]]
out['mahalanobis'] = {'d2': L(d2), 'p': L(np.where(cc, stats.chi2.sf(d2, 3), np.nan))}

# aggregate within groups (written back to each case)
g = pd.DataFrame({'g': grp, 'x': x})
out['aggregate'] = {k: L(g.groupby('g')['x'].transform(k)) for k in ['mean', 'sum', 'std', 'median', 'min', 'max']}

# dummies of lik (levels 1..5), reference = first level
dm = pd.get_dummies(pd.Series(lik), dtype=float)
out['dummies'] = {str(int(c)): L(np.where(ok, dm[c], np.nan)) for c in dm.columns}

# expression functions over rows (missing values skipped; sd needs 2 valid values)
Q = pd.DataFrame(q)
out['rowwise'] = {
    'mean': L(Q.mean(axis=1, skipna=True)), 'sum': L(Q.sum(axis=1, min_count=1)), 'sd': L(Q.std(axis=1, ddof=1)),
    'min': L(Q.min(axis=1)), 'max': L(Q.max(axis=1)), 'median': L(Q.median(axis=1)), 'count': L(Q.notna().sum(axis=1)),
    'nmiss': L(Q.isna().sum(axis=1)), 'mean2': L(Q.mean(axis=1).where(Q.notna().sum(axis=1) >= 2)),
    'formula': L((Q[0] * 2 + Q[1] ** 2 - Q[2] / 4)),  # q1*2 + q2^2 - q3/4
}

# SPSS files: (1) tests/fixtures/data_written.sav comes from the JavaScript writer (node tools/make_data_sav.js) and is read
# here by pyreadstat; (2) tests/fixtures/data_meta.sav is written by pyreadstat with a full dictionary for the reader.
import pyreadstat  # noqa: E402
fx = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures')
d, m = pyreadstat.read_sav(os.path.join(fx, 'data_written.sav'), user_missing=True)
def cellv(v):
    if isinstance(v, str): return v
    if v is None or (isinstance(v, float) and np.isnan(v)): return None
    if hasattr(v, 'isoformat'): return v.isoformat()[:10]
    return float(v)
out['sav_written'] = {
    'names': m.column_names, 'labels': m.column_labels, 'value_labels': {k: {str(a): b for a, b in v.items()} for k, v in m.variable_value_labels.items()},
    'missing': m.missing_ranges, 'measure': m.variable_measure, 'formats': m.original_variable_types, 'file_label': m.file_label,
    'rows': [[cellv(v) for v in row] for row in d.itertuples(index=False)]}
meta = pd.DataFrame({'id': [1.0, 2, 3, 4], 'score': [1.5, 99, 3.25, np.nan], 'grp': [1.0, 2, 2, 8], 'name': ['a', 'b', 'c', '']})
pyreadstat.write_sav(meta, os.path.join(fx, 'data_meta.sav'), column_labels=['Identifier', 'Test score', 'Group', 'Name'],
                     variable_value_labels={'grp': {1: 'control', 2: 'treatment', 8: 'refused'}}, missing_ranges={'score': [99], 'grp': [{'lo': 8, 'hi': 9}]},
                     variable_measure={'id': 'scale', 'score': 'scale', 'grp': 'nominal', 'name': 'nominal'})

print(json.dumps(out, indent=1))
