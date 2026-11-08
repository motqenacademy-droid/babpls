"""
Reference values for js/process2.js (PROCESS models, Hayes 2022).

Each case writes out the regression equations of one PROCESS model template BY HAND (independently of the
template table in process2.js), estimates them with statsmodels OLS (HC0-HC3 through cov_type, HC4 computed
here), and derives conditional effects, conditional indirect effects, indices of (partial / conditional /
moderated) moderated mediation, Johnson-Neyman boundaries, Sobel tests and standardized effects analytically.

    python tools/reference_process.py   ->  tests/fixtures/process.json

Data: examples/training_performance.csv plus two derived columns (a three-group variable from age and a
dichotomy), stored in the fixture so that the JavaScript test uses exactly the same rows.
"""
import json
import os

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy import stats

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
df = pd.read_csv(os.path.join(ROOT, "examples", "training_performance.csv"))
df["group"] = 1 + (df["age"] >= 37).astype(int) + (df["age"] >= 47).astype(int)
df["senior"] = (df["age"] >= 45).astype(float)
X, Y, M1, M2, W, Z = "training_hours", "performance", "motivation", "self_efficacy", "supervisor_support", "age"
P = " × "


def pctl(v, p):
    """Percentile as PROCESS computes it: position p(n+1) in the sorted data, linear interpolation."""
    s = np.sort(np.asarray(v, float))
    n = len(s)
    pos = p * (n + 1)
    low = int(np.floor(pos))
    fr = pos - low
    if low < 1:
        return s[0]
    if low >= n:
        return s[-1]
    return s[low - 1] + (s[low] - s[low - 1]) * fr


def probes(v, how):
    v = np.asarray(v, float)
    u = np.unique(v)
    if len(u) == 2:
        return [float(u[0]), float(u[1])]
    if how == "moments":
        m, d = v.mean(), v.std(ddof=1)
        return [max(v.min(), m - d), m, min(v.max(), m + d)]
    return [pctl(v, p) for p in (0.16, 0.5, 0.84)]


class Fit:
    """One OLS equation: terms are lists of column names whose product is the regressor."""

    def __init__(self, data, outcome, terms, hc, conf):
        self.names = ["constant"] + [P.join(t) for t in terms]
        cols = [np.prod([data[c].values for c in t], axis=0) for t in terms]
        Xm = np.column_stack([np.ones(len(data))] + cols)
        y = data[outcome].values
        self.X, self.y = Xm, y
        ols = sm.OLS(y, Xm)
        if hc is None:
            res = ols.fit()
            cov = res.cov_params()
        elif hc in (0, 1, 2, 3):
            res = ols.fit(cov_type="HC%d" % hc, use_t=True)
            cov = res.cov_params()
        else:  # HC4 (Cribari-Neto, 2004): e^2 / (1 - h)^min(4, n h / k)
            res = ols.fit()
            n, k = Xm.shape
            xtxi = np.linalg.inv(Xm.T @ Xm)
            h = np.einsum("ij,jk,ik->i", Xm, xtxi, Xm)
            om = res.resid ** 2 / (1 - h) ** np.minimum(4, n * h / k)
            cov = xtxi @ (Xm.T * om) @ Xm @ xtxi
        self.res, self.cov, self.hc = res, np.asarray(cov), hc
        self.b = np.asarray(res.params)
        self.se = np.sqrt(np.diag(self.cov))
        self.df = res.df_resid
        self.tc = stats.t.ppf(1 - (1 - conf / 100) / 2, self.df)
        self.r2 = res.rsquared
        k = Xm.shape[1]
        F = self.wald(list(range(1, k)))
        self.summary = {"R": float(np.sqrt(self.r2)), "R2": float(self.r2), "MSE": float(res.ssr / self.df), "F": F,
                        "df1": k - 1, "df2": float(self.df), "p": float(stats.f.sf(F, k - 1, self.df))}

    def i(self, name):
        return self.names.index(name)

    def __getitem__(self, name):
        return self.b[self.i(name)]

    def wald(self, idx):
        b = self.b[idx]
        V = self.cov[np.ix_(idx, idx)]
        return float(b @ np.linalg.solve(V, b) / len(idx))

    def wald_sm(self, idx):
        """The same Wald F through statsmodels (cross-check for HC0-HC3 and OLS)."""
        R = np.zeros((len(idx), len(self.b)))
        for r, j in enumerate(idx):
            R[r, j] = 1
        return float(np.squeeze(self.res.wald_test(R, use_f=True, scalar=True).statistic))

    def lin(self, g):
        """Linear combination sum g[name] * b[name] with its standard error."""
        a = np.zeros(len(self.b))
        for nm, v in g.items():
            a[self.i(nm)] = v
        est = float(a @ self.b)
        se = float(np.sqrt(a @ self.cov @ a))
        t = est / se
        return {"effect": est, "se": se, "t": t, "p": float(2 * stats.t.sf(abs(t), self.df)),
                "lo": est - self.tc * se, "hi": est + self.tc * se}

    def test(self, names, data, outcome, terms):
        idx = [self.i(n) for n in names]
        F = self.wald(idx)
        keep = [t for t in terms if P.join(t) not in names]
        red = Fit(data, outcome, keep, None, 95)
        return {"names": names, "F": F, "df1": len(idx), "df2": float(self.df), "p": float(stats.f.sf(F, len(idx), self.df)),
                "R2chg": float(self.r2 - red.r2)}

    def out(self):
        t = self.b / self.se
        return {"names": self.names, "b": self.b.tolist(), "se": self.se.tolist(), "t": t.tolist(),
                "p": (2 * stats.t.sf(np.abs(t), self.df)).tolist(),
                "lo": (self.b - self.tc * self.se).tolist(), "hi": (self.b + self.tc * self.se).tolist(), "summary": self.summary}


def jn(fit, n1, n3, mod_values):
    """Johnson-Neyman: values m where (b1 + b3 m)^2 = t_crit^2 var(b1 + b3 m), inside the observed range."""
    i1, i3 = fit.i(n1), fit.i(n3)
    b1, b3 = fit.b[i1], fit.b[i3]
    v11, v13, v33 = fit.cov[i1, i1], fit.cov[i1, i3], fit.cov[i3, i3]
    tc = fit.tc
    a = b3 * b3 - tc * tc * v33
    bq = 2 * (b1 * b3 - tc * tc * v13)
    c = b1 * b1 - tc * tc * v11
    disc = bq * bq - 4 * a * c
    lo, hi = float(np.min(mod_values)), float(np.max(mod_values))
    if disc < 0:
        return []
    r = sorted([(-bq - np.sqrt(disc)) / (2 * a), (-bq + np.sqrt(disc)) / (2 * a)])
    return [float(x) for x in r if lo <= x <= hi]


def codes(levels, scheme):
    g = len(levels)
    Mx = np.zeros((g, g - 1))
    if scheme == "indicator":
        Mx[1:, :] = np.eye(g - 1)
    elif scheme == "sequential":
        for i in range(1, g):
            Mx[i, :i] = 1
    elif scheme == "effect":
        Mx[1:, :] = np.eye(g - 1)
        Mx[0, :] = -1
    elif scheme == "helmert":
        for j in range(g - 1):
            Mx[j, j] = -(g - 1 - j) / (g - j)
            Mx[j + 1:, j] = 1 / (g - j)
    return Mx


def prep(center, mcx=None, xvar=X):
    d = df.copy()
    for v in center:
        d[v] = d[v] - d[v].mean()
    if mcx:
        levels = sorted(d[xvar].unique())
        C = codes(levels, mcx)
        for j in range(C.shape[1]):
            d["D%d" % (j + 1)] = [C[levels.index(v), j] for v in d[xvar]]
    return d


CASES = []


def case(name, opts, eqs, effects, center=(), mcx=None, xvar=X, hc=None, conf=95):
    """eqs: [(outcome, [terms])]; effects(fits, d) -> dict of analytic results."""
    d = prep(center, mcx, xvar)
    fits = [Fit(d, o, t, hc, conf) for o, t in eqs]
    res = {"name": name, "opts": opts, "equations": [dict(outcome=o, **f.out()) for (o, _), f in zip(eqs, fits)]}
    res.update(effects(fits, d, eqs))
    CASES.append(res)


def tests_of(fits, d, eqs, spec):
    """spec: [(equation index, [product names])]"""
    out = []
    for e, names in spec:
        o, t = eqs[e]
        r = fits[e].test(names, d, o, t)
        r["eq"] = e
        if fits[e].hc != 4:  # statsmodels has no HC4
            r["F_sm"] = fits[e].wald_sm([fits[e].i(n) for n in names])
        out.append(r)
    return out


xw, xz, wz, xwz = X + P + W, X + P + Z, W + P + Z, X + P + W + P + Z
m1w, m2w, m1z = M1 + P + W, M2 + P + W, M1 + P + Z

# ---------------------------------------------------------------- model 1
for nm, cen, hc, how in (("m1", [X, W], None, "percentiles"), ("m1_hc3_moments", [], 3, "moments")):
    def eff(f, d, eqs, how=how):
        wv = probes(d[W], how)
        return {"probeW": wv, "direct": [f[0].lin({X: 1, xw: w}) for w in wv],
                "jn": jn(f[0], X, xw, d[W]), "tests": tests_of(f, d, eqs, [(0, [xw])])}
    case(nm, {"hmodel": 1, "x": X, "y": Y, "w": W, "center": "all" if cen else "none", "hc": -1 if hc is None else hc, "probe": how},
         [(Y, [[X], [W], [X, W]])], eff, center=cen, hc=hc)

# ---------------------------------------------------------------- model 2 (W and Z additive)
def eff2(f, d, eqs):
    wv, zv = probes(d[W], "percentiles"), probes(d[Z], "percentiles")
    return {"probeW": wv, "probeZ": zv, "direct": [f[0].lin({X: 1, xw: w, xz: z}) for w in wv for z in zv],
            "tests": tests_of(f, d, eqs, [(0, [xw]), (0, [xz]), (0, [xw, xz])])}
case("m2", {"hmodel": 2, "x": X, "y": Y, "w": W, "z": Z, "center": "cont", "hc": 0}, [(Y, [[X], [W], [Z], [X, W], [X, Z]])], eff2, center=[X, W, Z], hc=0)

# ---------------------------------------------------------------- model 3 (three-way)
def eff3(f, d, eqs):
    wv, zv = probes(d[W], "percentiles"), probes(d[Z], "percentiles")
    return {"probeW": wv, "probeZ": zv, "direct": [f[0].lin({X: 1, xw: w, xz: z, xwz: w * z}) for w in wv for z in zv],
            "condInt": [f[0].lin({xw: 1, xwz: z}) for z in zv], "jn": jn(f[0], xw, xwz, d[Z]),
            "tests": tests_of(f, d, eqs, [(0, [xwz])])}
case("m3", {"hmodel": 3, "x": X, "y": Y, "w": W, "z": Z, "center": "all", "hc": 4},
     [(Y, [[X], [W], [Z], [X, W], [X, Z], [W, Z], [X, W, Z]])], eff3, center=[X, W, Z], hc=4)

# ---------------------------------------------------------------- model 4 (two parallel mediators, a covariate)
def eff4(f, d, eqs):
    a1, a2, b1, b2 = f[0][X], f[1][X], f[2][M1], f[2][M2]
    ind = [a1 * b1, a2 * b2]
    tot = Fit(d, Y, [[X], [Z]], 1, 95)
    sY, sX = d[Y].std(ddof=1), d[X].std(ddof=1)
    sob = []
    for (fa, fb, mn) in ((f[0], f[2], M1), (f[1], f[2], M2)):
        a, sa, b, sb = fa[X], fa.se[fa.i(X)], fb[mn], fb.se[fb.i(mn)]
        se = np.sqrt(a * a * sb * sb + b * b * sa * sa)
        z = a * b / se
        sob.append({"effect": a * b, "se": se, "z": z, "p": float(2 * stats.norm.sf(abs(z)))})
    return {"indirect": [[ind[0]], [ind[1]]], "totalIndirect": [sum(ind)], "contrasts": [ind[0] - ind[1]],
            "totalModel": dict(outcome=Y, **tot.out()), "total": tot.lin({X: 1}), "direct": [f[2].lin({X: 1})],
            "std": [[i / sY, i * sX / sY] for i in ind + [sum(ind)]], "sobel": sob}
case("m4", {"hmodel": 4, "x": X, "y": Y, "m": [M1, M2], "cov": [Z], "hc": 1, "total": True, "effsize": True, "contrast": 1, "sobel": True},
     [(M1, [[X], [Z]]), (M2, [[X], [Z]]), (Y, [[X], [M1], [M2], [Z]])], eff4, hc=1)

# ---------------------------------------------------------------- model 5
def eff5(f, d, eqs):
    wv = probes(d[W], "percentiles")
    return {"probeW": wv, "indirect": [[f[0][X] * f[1][M1]]], "direct": [f[1].lin({X: 1, xw: w}) for w in wv],
            "jn": jn(f[1], X, xw, d[W]), "tests": tests_of(f, d, eqs, [(1, [xw])])}
case("m5", {"hmodel": 5, "x": X, "y": Y, "m": [M1], "w": W, "center": "all"}, [(M1, [[X]]), (Y, [[X], [M1], [W], [X, W]])], eff5, center=[X, W])

# ---------------------------------------------------------------- model 6 (serial, two mediators)
def eff6(f, d, eqs):
    a1, a2, d21, b1, b2 = f[0][X], f[1][X], f[1][M1], f[2][M1], f[2][M2]
    ind = [a1 * b1, a1 * d21 * b2, a2 * b2]
    sY, sX = d[Y].std(ddof=1), d[X].std(ddof=1)
    return {"indirect": [[v] for v in ind], "totalIndirect": [sum(ind)], "direct": [f[2].lin({X: 1})],
            "contrasts": [ind[0] - ind[1], ind[0] - ind[2], ind[1] - ind[2]],
            "std": [[i / sY, i * sX / sY] for i in ind + [sum(ind)]]}
case("m6", {"hmodel": 6, "x": X, "y": Y, "m": [M1, M2], "hc": 2, "effsize": True, "contrast": 1},
     [(M1, [[X]]), (M2, [[X], [M1]]), (Y, [[X], [M1], [M2]])], eff6, hc=2)
case("m6_absdiff", {"hmodel": 6, "x": X, "y": Y, "m": [M1, M2], "contrast": 2},
     [(M1, [[X]]), (M2, [[X], [M1]]), (Y, [[X], [M1], [M2]])],
     lambda f, d, e: {"contrasts": (lambda i: [abs(i[0]) - abs(i[1]), abs(i[0]) - abs(i[2]), abs(i[1]) - abs(i[2])])(
         [f[0][X] * f[2][M1], f[0][X] * f[1][M1] * f[2][M2], f[1][X] * f[2][M2]])})

# ---------------------------------------------------------------- first-stage models 7, 8, 9, 11
def eff7(f, d, eqs):
    wv = probes(d[W], "percentiles")
    a1, a3, b = f[0][X], f[0][xw], f[1][M1]
    return {"probeW": wv, "indirect": [[(a1 + a3 * w) * b for w in wv]], "indices": [["imm", "W", None, a3 * b]],
            "direct": [f[1].lin({X: 1})], "tests": tests_of(f, d, eqs, [(0, [xw])])}
case("m7", {"hmodel": 7, "x": X, "y": Y, "m": [M1], "w": W, "center": "all", "condContrast": True},
     [(M1, [[X], [W], [X, W]]), (Y, [[X], [M1]])], eff7, center=[X, W])

def eff7d(f, d, eqs):
    wv = probes(d["senior"], "percentiles")
    a1, a3, b = f[0][X], f[0][X + P + "senior"], f[1][M1]
    return {"probeW": wv, "indirect": [[(a1 + a3 * w) * b for w in wv]], "indices": [["imm", "W", None, a3 * b]]}
case("m7_dich_bc", {"hmodel": 7, "x": X, "y": Y, "m": [M1], "w": "senior", "center": "cont", "bootci": "bc"},
     [(M1, [[X], ["senior"], [X, "senior"]]), (Y, [[X], [M1]])], eff7d, center=[X])

def eff8(f, d, eqs):
    wv = probes(d[W], "percentiles")
    a1, a3, b = f[0][X], f[0][xw], f[1][M1]
    return {"probeW": wv, "indirect": [[(a1 + a3 * w) * b for w in wv]], "indices": [["imm", "W", None, a3 * b]],
            "direct": [f[1].lin({X: 1, xw: w}) for w in wv], "jn": jn(f[1], X, xw, d[W])}
case("m8", {"hmodel": 8, "x": X, "y": Y, "m": [M1], "w": W, "center": "all"},
     [(M1, [[X], [W], [X, W]]), (Y, [[X], [M1], [W], [X, W]])], eff8, center=[X, W])

def eff9(f, d, eqs):
    wv, zv = probes(d[W], "percentiles"), probes(d[Z], "percentiles")
    a1, a4, a5, b = f[0][X], f[0][xw], f[0][xz], f[1][M1]
    return {"probeW": wv, "probeZ": zv, "indirect": [[(a1 + a4 * w + a5 * z) * b for w in wv for z in zv]],
            "indices": [["pmm", "W", None, a4 * b], ["pmm", "Z", None, a5 * b]],
            "tests": tests_of(f, d, eqs, [(0, [xw]), (0, [xz]), (0, [xw, xz])])}
case("m9", {"hmodel": 9, "x": X, "y": Y, "m": [M1], "w": W, "z": Z, "center": "all"},
     [(M1, [[X], [W], [Z], [X, W], [X, Z]]), (Y, [[X], [M1]])], eff9, center=[X, W, Z])

def eff11(f, d, eqs):
    wv, zv = probes(d[W], "percentiles"), probes(d[Z], "percentiles")
    a1, a4, a5, a7, b = f[0][X], f[0][xw], f[0][xz], f[0][xwz], f[1][M1]
    idx = [["cmm", "W", i, (a4 + a7 * z) * b] for i, z in enumerate(zv)] + [["cmm", "Z", i, (a5 + a7 * w) * b] for i, w in enumerate(wv)]
    idx.append(["mmm", "WZ", None, a7 * b])
    return {"probeW": wv, "probeZ": zv, "indirect": [[(a1 + a4 * w + a5 * z + a7 * w * z) * b for w in wv for z in zv]], "indices": idx}
case("m11", {"hmodel": 11, "x": X, "y": Y, "m": [M1], "w": W, "z": Z, "center": "all", "hc": 3},
     [(M1, [[X], [W], [Z], [X, W], [X, Z], [W, Z], [X, W, Z]]), (Y, [[X], [M1]])], eff11, center=[X, W, Z], hc=3)

# ---------------------------------------------------------------- second-stage models 14, 15
def eff14(f, d, eqs):
    wv = probes(d[W], "percentiles")
    a1, a2 = f[0][X], f[1][X]
    b1, b1w, b2, b2w = f[2][M1], f[2][m1w], f[2][M2], f[2][m2w]
    return {"probeW": wv, "indirect": [[a1 * (b1 + b1w * w) for w in wv], [a2 * (b2 + b2w * w) for w in wv]],
            "indices": [["imm", "W", None, a1 * b1w], ["imm", "W", None, a2 * b2w]], "direct": [f[2].lin({X: 1})],
            "tests": tests_of(f, d, eqs, [(2, [m1w]), (2, [m2w])])}
case("m14", {"hmodel": 14, "x": X, "y": Y, "m": [M1, M2], "w": W, "center": "cont", "hc": 3},
     [(M1, [[X]]), (M2, [[X]]), (Y, [[X], [M1], [M2], [W], [M1, W], [M2, W]])], eff14, center=[M1, M2, W], hc=3)

def eff15(f, d, eqs):
    wv = probes(d[W], "moments")
    a, b1, b3 = f[0][X], f[1][M1], f[1][m1w]
    return {"probeW": wv, "indirect": [[a * (b1 + b3 * w) for w in wv]], "indices": [["imm", "W", None, a * b3]],
            "direct": [f[1].lin({X: 1, xw: w}) for w in wv]}
case("m15", {"hmodel": 15, "x": X, "y": Y, "m": [M1], "w": W, "center": "all", "probe": "moments"},
     [(M1, [[X]]), (Y, [[X], [M1], [W], [X, W], [M1, W]])], eff15, center=[X, M1, W])

# ---------------------------------------------------------------- model 21 (W on a, Z on b)
def eff21(f, d, eqs):
    wv, zv = probes(d[W], "percentiles"), probes(d[Z], "percentiles")
    a1, a3, b1, b3 = f[0][X], f[0][xw], f[1][M1], f[1][m1z]
    idx = [["cmm", "W", i, a3 * (b1 + b3 * z)] for i, z in enumerate(zv)] + [["cmm", "Z", i, (a1 + a3 * w) * b3] for i, w in enumerate(wv)]
    idx.append(["mmm", "WZ", None, a3 * b3])
    return {"probeW": wv, "probeZ": zv, "indirect": [[(a1 + a3 * w) * (b1 + b3 * z) for w in wv for z in zv]], "indices": idx}
case("m21", {"hmodel": 21, "x": X, "y": Y, "m": [M1], "w": W, "z": Z}, [(M1, [[X], [W], [X, W]]), (Y, [[X], [M1], [Z], [M1, Z]])], eff21)

# ---------------------------------------------------------------- models 58, 59 (W on a and b: quadratic in W, no index)
def eff58(f, d, eqs):
    wv = probes(d[W], "percentiles")
    a1, a3, b1, b3 = f[0][X], f[0][xw], f[1][M1], f[1][m1w]
    return {"probeW": wv, "indirect": [[(a1 + a3 * w) * (b1 + b3 * w) for w in wv]], "indices": []}
case("m58", {"hmodel": 58, "x": X, "y": Y, "m": [M1], "w": W, "center": "all"},
     [(M1, [[X], [W], [X, W]]), (Y, [[X], [M1], [W], [M1, W]])], eff58, center=[X, M1, W])

def eff59(f, d, eqs):
    wv = probes(d[W], "percentiles")
    a1, a3, b1, b3 = f[0][X], f[0][xw], f[1][M1], f[1][m1w]
    return {"probeW": wv, "indirect": [[(a1 + a3 * w) * (b1 + b3 * w) for w in wv]], "indices": [],
            "direct": [f[1].lin({X: 1, xw: w}) for w in wv]}
case("m59", {"hmodel": 59, "x": X, "y": Y, "m": [M1], "w": W, "center": "all", "hc": 0},
     [(M1, [[X], [W], [X, W]]), (Y, [[X], [M1], [W], [X, W], [M1, W]])], eff59, center=[X, M1, W], hc=0)

# ---------------------------------------------------------------- model 74 (X moderates M -> Y)
def eff74(f, d, eqs):
    xv = probes(d[X], "percentiles")
    a, b1, b3 = f[0][X], f[1][M1], f[1][M1 + P + X]
    return {"probeW": xv, "indirect": [[a * (b1 + b3 * x) for x in xv]], "indices": [["imm", "W", None, a * b3]]}
case("m74", {"hmodel": 74, "x": X, "y": Y, "m": [M1], "center": "all"}, [(M1, [[X]]), (Y, [[X], [M1], [M1, X]])], eff74, center=[X, M1])

# ---------------------------------------------------------------- serial moderated models 83, 92 and 80
def eff83(f, d, eqs):
    wv = probes(d[W], "percentiles")
    a1, a3, a2, d21, b1, b2 = f[0][X], f[0][xw], f[1][X], f[1][M1], f[2][M1], f[2][M2]
    return {"probeW": wv, "indirect": [[(a1 + a3 * w) * b1 for w in wv], [(a1 + a3 * w) * d21 * b2 for w in wv], [a2 * b2]],
            "indices": [["imm", "W", None, a3 * b1], ["imm", "W", None, a3 * d21 * b2]]}
case("m83", {"hmodel": 83, "x": X, "y": Y, "m": [M1, M2], "w": W, "center": "all"},
     [(M1, [[X], [W], [X, W]]), (M2, [[X], [M1]]), (Y, [[X], [M1], [M2]])], eff83, center=[X, W])

def eff92(f, d, eqs):
    wv = probes(d[W], "percentiles")
    A = lambda w: f[0][X] + f[0][xw] * w
    A2 = lambda w: f[1][X] + f[1][xw] * w
    D = lambda w: f[1][M1] + f[1][m1w] * w
    B1 = lambda w: f[2][M1] + f[2][m1w] * w
    B2 = lambda w: f[2][M2] + f[2][m2w] * w
    return {"probeW": wv, "indirect": [[A(w) * B1(w) for w in wv], [A(w) * D(w) * B2(w) for w in wv], [A2(w) * B2(w) for w in wv]],
            "indices": [], "direct": [f[2].lin({X: 1, xw: w}) for w in wv],
            "tests": tests_of(f, d, eqs, [(1, [xw]), (1, [m1w]), (2, [xw]), (2, [m1w]), (2, [m2w])])}
case("m92", {"hmodel": 92, "x": X, "y": Y, "m": [M1, M2], "w": W, "center": "all"},
     [(M1, [[X], [W], [X, W]]), (M2, [[X], [M1], [W], [X, W], [M1, W]]), (Y, [[X], [M1], [M2], [W], [X, W], [M1, W], [M2, W]])],
     eff92, center=[X, M1, M2, W])

def eff80(f, d, eqs):
    a1, a2, a3 = f[0][X], f[1][X], f[2][X]
    d31, d32 = f[2][M1], f[2][M2]
    b1, b2, b3 = f[3][M1], f[3][M2], f[3]["senior"]
    ind = [a1 * b1, a1 * d31 * b3, a2 * b2, a2 * d32 * b3, a3 * b3]
    return {"indirect": [[v] for v in ind], "totalIndirect": [sum(ind)]}
case("m80", {"hmodel": 80, "x": X, "y": Y, "m": [M1, M2, "senior"]},
     [(M1, [[X]]), (M2, [[X]]), ("senior", [[X], [M1], [M2]]), (Y, [[X], [M1], [M2], ["senior"]])], eff80)

# ---------------------------------------------------------------- multicategorical X
def eff1mc(f, d, eqs):
    wv = probes(d[W], "percentiles")
    return {"probeW": wv, "direct": [f[0].lin({"D%d" % j: 1, "D%d" % j + P + W: w}) for j in (1, 2) for w in wv],
            "tests": tests_of(f, d, eqs, [(0, ["D1" + P + W, "D2" + P + W])])}
case("m1_mcx_indicator", {"hmodel": 1, "x": "group", "y": Y, "w": W, "center": "all", "mcx": "indicator"},
     [(Y, [["D1"], ["D2"], [W], ["D1", W], ["D2", W]])], eff1mc, center=[W], mcx="indicator", xvar="group")

for scheme in ("helmert", "sequential", "effect"):
    def eff4mc(f, d, eqs):
        b = f[1][M1]
        tot = Fit(d, Y, [["D1"], ["D2"]], None, 95)
        return {"indirect": [[f[0]["D1"] * b], [f[0]["D2"] * b]], "totalIndirect": [f[0]["D1"] * b, f[0]["D2"] * b],
                "direct": [f[1].lin({"D1": 1}), f[1].lin({"D2": 1})], "omnibusDirect": f[1].wald([1, 2]),
                "totalModel": dict(outcome=Y, **tot.out()), "omnibusTotal": tot.wald([1, 2])}
    case("m4_mcx_" + scheme, {"hmodel": 4, "x": "group", "y": Y, "m": [M1], "mcx": scheme, "total": True},
         [(M1, [["D1"], ["D2"]]), (Y, [["D1"], ["D2"], [M1]])], eff4mc, mcx=scheme, xvar="group")

# covariates only in the mediator equations, confidence level 90
def eff4c(f, d, eqs):
    return {"indirect": [[f[0][X] * f[1][M1]]], "direct": [f[1].lin({X: 1})]}
case("m4_covm_90", {"hmodel": 4, "x": X, "y": Y, "m": [M1], "cov": [Z], "covIn": "m", "conf": 90},
     [(M1, [[X], [Z]]), (Y, [[X], [M1]])], eff4c, conf=90)

cols = [X, Y, M1, M2, W, Z, "group", "senior"]
out = {"data": {c: df[c].astype(float).tolist() for c in cols}, "cases": CASES,
       "tquantiles": [[p, dfv, float(stats.t.ppf(p, dfv))] for p in (0.95, 0.975, 0.995) for dfv in (5, 30, 296)]}


def clean(o):
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (np.floating, np.integer)):
        return float(o)
    return o


with open(os.path.join(ROOT, "tests", "fixtures", "process.json"), "w") as fh:
    json.dump(clean(out), fh)
print("wrote", len(CASES), "cases")
