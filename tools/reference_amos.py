"""Reference values for the AMOS-style CB-SEM module (js/amos.js) -> tests/fixtures/amos.json.

    pip install numpy scipy pandas semopy
    python tools/reference_amos.py > tests/fixtures/amos.json

Independent implementation in NumPy/SciPy (RAM notation, central-difference gradients, scipy BFGS) of the
discrepancy functions ML, GLS, ULS, SLS, ADF and casewise FIML, with every fit measure computed from its textbook
formula (Amos user's guide, Appendix C). Each solution is cross-checked against semopy (an independent SEM package):
the script stops if semopy's estimates differ by more than 2e-3.

Conventions (Amos): S is the unbiased covariance matrix (divisor N - 1), CMIN = (N - G) * F_min; with incomplete
data CMIN = -2lnL(model) + 2lnL(saturated) (FIML). semopy minimises the same functions of the S it is given (its
MLW/GLS/ULS/WLS objectives differ only by constant factors), so its estimates are comparable when S is passed in.
"""
import json, sys, math, warnings
import numpy as np, pandas as pd, scipy.optimize as so, scipy.stats as st
import semopy
from semopy import ModelMeans

warnings.filterwarnings('ignore')
ROOT = __file__.rsplit('/tools/', 1)[0]


# ------------------------------------------------------------------ model specification (RAM)
class Spec:
    """obs, lat, entries: dicts {mat: 'A'|'S'|'M', i, j, fixed (None = free), label, kind}."""

    def __init__(self, obs, lat, entries, means=False):
        self.obs, self.lat, self.vars = obs, lat, obs + lat
        self.p, self.nv, self.entries, self.means = len(obs), len(obs) + len(lat), entries, means
        self.ix = {v: k for k, v in enumerate(self.vars)}


def spec_from_model(model, extra=None, means=False):
    """Default Amos-like specification: marker loading 1, free error variances, exogenous latents correlated."""
    obs, lat, ents = [], [], {}
    byid = {c['id']: c for c in model['constructs']}
    for c in model['constructs']:
        lat.append(c['name'])
        for q, x in enumerate(c['indicators']):
            if x not in obs: obs.append(x)
            ents[('A', x, c['name'])] = dict(fixed=1.0 if q == 0 else None, label=None)
    for p in model['paths']:
        ents[('A', byid[p['to']]['name'], byid[p['from']]['name'])] = dict(fixed=None, label=None)
    for e in (extra or []):  # (mat, a, b, fixed, label)
        mat, a, b, fx, lb = e
        key = ('S', *sorted((a, b))) if mat == 'S' else (mat, a, b)
        ents[key] = dict(fixed=fx, label=lb)
    vars_ = obs + lat
    incoming = {k[1] for k, v in ents.items() if k[0] == 'A' and v['fixed'] != 0}
    for v in vars_:
        ents.setdefault(('S', v, v), dict(fixed=None, label=None))
    exo = [v for v in vars_ if v not in incoming]
    for i, a in enumerate(exo):
        for b in exo[i + 1:]:
            ents.setdefault(('S', *sorted((a, b))), dict(fixed=None, label=None))
    if means:
        for v in obs: ents.setdefault(('M', v, v), dict(fixed=None, label=None))
        for v in lat: ents.setdefault(('M', v, v), dict(fixed=0.0, label=None))
    ix = {v: k for k, v in enumerate(vars_)}
    out = []
    for k, v in ents.items():
        mat, a, b = k
        out.append(dict(mat=mat, i=ix[a], j=ix[b], a=a, b=b, fixed=v['fixed'], label=v['label']))
    return Spec(obs, lat, out, means)


def layout(spec, G=1, shared=()):
    keys, ents = {}, []
    for g in range(G):
        eg = []
        for e in spec.entries:
            e = dict(e)
            kind = kind_of(spec, e)
            if kind == 'lmean' and 'int' in shared and g > 0 and e['fixed'] == 0: e['fixed'] = None
            if e['fixed'] is not None: e['idx'] = -1
            else:
                key = ('L', e['label']) if e['label'] else ((e['mat'], e['i'], e['j']) if kind in shared and kind != 'lmean' else (e['mat'], e['i'], e['j'], g))
                e['idx'] = keys.setdefault(key, len(keys))
            eg.append(e)
        ents.append(eg)
    return ents, len(keys), list(keys)


def kind_of(spec, e):
    p = spec.p
    incoming = {x['i'] for x in spec.entries if x['mat'] == 'A' and x['fixed'] != 0}
    if e['mat'] == 'A': return 'load' if e['i'] < p <= e['j'] else 'path'
    if e['mat'] == 'M': return ('int' if e['i'] in incoming else 'mean') if e['i'] < p else 'lmean'
    i, j = e['i'], e['j']
    if i == j: return 'var' if i not in incoming else ('evar' if i < p else 'dvar')
    if i not in incoming and j not in incoming: return 'xcov'
    if i in incoming and j in incoming and i >= p and j >= p: return 'dcov'
    return 'ecov'


def implied(spec, ents, th):
    nv, p = spec.nv, spec.p
    A, Om, m = np.zeros((nv, nv)), np.zeros((nv, nv)), np.zeros(nv)
    for e in ents:
        v = th[e['idx']] if e['idx'] >= 0 else e['fixed']
        if e['mat'] == 'A': A[e['i'], e['j']] = v
        elif e['mat'] == 'S': Om[e['i'], e['j']] = Om[e['j'], e['i']] = v
        else: m[e['i']] = v
    B = np.linalg.inv(np.eye(nv) - A)
    C = B @ Om @ B.T
    return dict(A=A, Om=Om, B=B, C=C, Sig=C[:p, :p], mu=(B @ m)[:p], Bm=B @ m)


# ------------------------------------------------------------------ data and discrepancy functions
def group_data(X, est):
    N, p = X.shape
    S = np.cov(X.T)  # unbiased
    d = dict(N=N, n=N - 1, p=p, S=S, Si=np.linalg.inv(S), ldS=np.linalg.slogdet(S)[1], xbar=X.mean(0), X=X)
    if est == 'ADF':
        Z = X - X.mean(0)
        pairs = [(a, b) for a in range(p) for b in range(a, p)]
        P = np.array([Z[:, a] * Z[:, b] for a, b in pairs])
        U = np.cov(P, bias=True)  # u_ij,kl = w_ijkl - w_ij w_kl (divisor N), Browne (1984)
        d.update(pairs=pairs, Ui=np.linalg.inv(U))
    return d


def disc(est, d, Sig, mu, means):
    p, S = d['p'], d['S']
    if est == 'ML':
        sgn, ld = np.linalg.slogdet(Sig)
        if sgn <= 0: return np.inf
        Si = np.linalg.inv(Sig)
        f = ld - d['ldS'] + np.trace(S @ Si) - p
        if means:
            dm = d['xbar'] - mu
            f += dm @ Si @ dm
        return f
    R = S - Sig
    if est == 'GLS': T = d['Si'] @ R; return 0.5 * np.trace(T @ T)
    if est == 'ULS': return 0.5 * np.trace(R @ R)
    if est == 'SLS':
        Dm = np.diag(1 / np.diag(S)); T = Dm @ R; return 0.5 * np.trace(T @ T)
    if est == 'ADF':
        r = np.array([R[a, b] for a, b in d['pairs']]); return r @ d['Ui'] @ r
    raise ValueError(est)


_PAT = {}


def fiml_dev(X, Sig, mu):
    """-2 ln L of the incomplete data (casewise ML), summed per missing-data pattern."""
    key = id(X)
    if key not in _PAT:
        pats = {}
        for row in X:
            o = np.isfinite(row)
            if o.any(): pats.setdefault(tuple(o), []).append(row[o])
        _PAT[key] = [(np.array(o), np.array(r)) for o, r in pats.items()]
    tot = 0.0
    for o, R in _PAT[key]:
        So = Sig[np.ix_(o, o)]
        sgn, ld = np.linalg.slogdet(So)
        if sgn <= 0: return np.inf
        Dm = R - mu[o]
        tot += len(R) * (o.sum() * math.log(2 * math.pi) + ld) + np.einsum('ti,ij,tj->', Dm, np.linalg.inv(So), Dm)
    return tot


def em_saturated(X, iters=20000):
    """EM for the unrestricted mean vector and covariance matrix of incomplete multivariate normal data."""
    N, p = X.shape
    mu = np.nanmean(X, 0); Sg = np.diag(np.nanvar(X, 0))
    ll = np.inf
    for _ in range(iters):
        T1, T2 = np.zeros(p), np.zeros((p, p))
        for row in X:
            o = np.isfinite(row); m = ~o
            x = row.copy(); Cm = np.zeros((p, p))
            if m.any():
                Bmo = Sg[np.ix_(m, o)] @ np.linalg.inv(Sg[np.ix_(o, o)])
                x[m] = mu[m] + Bmo @ (row[o] - mu[o])
                Cm[np.ix_(m, m)] = Sg[np.ix_(m, m)] - Bmo @ Sg[np.ix_(o, m)]
            T1 += x; T2 += np.outer(x, x) + Cm
        mu = T1 / N; Sg = T2 / N - np.outer(mu, mu)
        lln = fiml_dev(X, Sg, mu)
        if abs(ll - lln) < 1e-11 * (1 + abs(lln)): ll = lln; break
        ll = lln
    return mu, Sg, ll


# ------------------------------------------------------------------ estimation
def num_grad(f, x, h=1e-6):
    g = np.zeros_like(x)
    for a in range(len(x)):
        e = np.zeros_like(x); s = h * max(1, abs(x[a])); e[a] = s
        g[a] = (f(x + e) - f(x - e)) / (2 * s)
    return g


def fit(spec, data, est, th0, G=1, shared=()):
    ents, q, keys = layout(spec, G, shared)
    tot = sum(d['N'] if est == 'FIML' else d['n'] for d in data)
    w = [(d['N'] if est == 'FIML' else d['n']) / tot for d in data]

    def F(th):
        s = 0.0
        for g, d in enumerate(data):
            try: im = implied(spec, ents[g], th)
            except np.linalg.LinAlgError: return 1e10
            if est == 'FIML': v = fiml_dev(d['X'], im['Sig'], im['mu']) / d['N']
            else: v = disc(est, d, im['Sig'], im['mu'], spec.means)
            if not np.isfinite(v): return 1e10
            s += w[g] * v
        return s
    th = np.array(th0, float)
    for _ in range(4):
        r = so.minimize(F, th, jac=lambda x: num_grad(F, x), method='BFGS', options=dict(gtol=1e-10, maxiter=20000))
        if np.allclose(r.x, th, atol=1e-10): break
        th = r.x
    return r.x, F(r.x), ents, q, keys


def start_from(spec, ents, q, d):
    S = d['S']; th = np.zeros(q); p = spec.p
    for e in ents[0]:
        if e['idx'] < 0: continue
        if e['mat'] == 'A': th[e['idx']] = 0.8 if e['i'] < p else 0.1
        elif e['mat'] == 'S':
            th[e['idx']] = (0.5 * S[e['i'], e['i']] if e['i'] < p else 0.5) if e['i'] == e['j'] else 0.0
        else: th[e['idx']] = d['xbar'][e['i']] if e['i'] < p else 0.0
    return th


# ------------------------------------------------------------------ fit measures (Amos Appendix C)
def lam(x, df, target):
    if df <= 0: return 0.0
    if st.chi2.cdf(x, df) < target: return 0.0
    return so.brentq(lambda l: st.ncx2.cdf(x, df, l) - target if l > 0 else st.chi2.cdf(x, df) - target, 0, max(10, 4 * x + 100), xtol=1e-12)


def fit_row(C, d, q, n, N, ps, Ns, Cb, db, moments, gfi=None, rmr=None):
    G = len(ps)
    r = dict(npar=q, cmin=C, df=d, p=st.chi2.sf(C, d) if d > 0 else None, cmindf=C / d if d > 0 else None)
    if gfi is not None:
        r.update(rmr=rmr, gfi=gfi, agfi=1 - moments / d * (1 - gfi) if d > 0 else None, pgfi=d / moments * gfi if d > 0 else None)
    r['nfi'] = 1 - C / Cb
    r['rfi'] = 1 - (C / d) / (Cb / db) if d > 0 else None
    r['ifi'] = (Cb - C) / (Cb - d)
    r['tli'] = (Cb / db - C / d) / (Cb / db - 1) if d > 0 else None
    den = max(Cb - db, C - d, 0)
    r['cfi'] = 1 - max(C - d, 0) / den if den > 0 else 1.0
    r['pratio'] = d / db; r['pnfi'] = r['pratio'] * r['nfi']; r['pcfi'] = r['pratio'] * r['cfi']
    lo, hi = (lam(C, d, 0.95), lam(C, d, 0.05)) if d > 0 else (0.0, 0.0)
    r['ncp'] = max(C - d, 0)
    if d > 0: r.update(ncpLo=lo, ncpHi=hi, f0Lo=lo / n, f0Hi=hi / n)
    r['fmin'] = C / n; r['f0'] = r['ncp'] / n
    if d > 0:
        r['rmsea'] = math.sqrt(r['f0'] / d); r['rmseaLo'] = math.sqrt(lo / (n * d)); r['rmseaHi'] = math.sqrt(hi / (n * d))
        r['pclose'] = st.ncx2.sf(C, d, 0.0025 * n * d)
        r['hoelter05'] = math.floor(n * st.chi2.ppf(0.95, d) / C + 1); r['hoelter01'] = math.floor(n * st.chi2.ppf(0.99, d) / C + 1)
    r['aic'] = C + 2 * q
    r['bcc'] = C + 2 * q * sum((n * Ns[g] / N) * p * (p + 3) / (Ns[g] - p - 2) for g, p in enumerate(ps)) / sum(p * (p + 3) for p in ps)
    if G == 1: r['bic'] = C + q * math.log(N); r['caic'] = C + q * (math.log(N) + 1)
    r['ecvi'] = r['aic'] / n; r['ecviLo'] = (lo + d + 2 * q) / n; r['ecviHi'] = (hi + d + 2 * q) / n; r['mecvi'] = r['bcc'] / n
    return r


def gfi_parts(est, d, Sig):
    S = d['S']; R = S - Sig
    h = lambda M: 0.5 * np.trace(M @ M)
    if est == 'ML': K = np.linalg.inv(Sig); return h(K @ R), h(K @ S)
    if est == 'GLS': return h(d['Si'] @ R), d['p'] / 2
    if est == 'ULS': return h(R), h(S)
    if est == 'SLS': Dm = np.diag(1 / np.diag(S)); return h(Dm @ R), h(Dm @ S)
    if est == 'ADF':
        qf = lambda M: (lambda r: r @ d['Ui'] @ r)(np.array([M[a, b] for a, b in d['pairs']]))
        return qf(R), qf(S)


def independence(est, d):
    """Diagonal model fitted with the same discrepancy function (closed forms / linear least squares)."""
    S, p = d['S'], d['p']
    if est == 'ML': return np.diag(np.diag(S)), np.sum(np.log(np.diag(S))) - d['ldS']
    if est in ('ULS', 'SLS'): D = np.diag(np.diag(S)); return D, disc(est, d, D, None, False)
    if est == 'GLS':  # min ||I - S^-1/2 D S^-1/2||_F^2 over diagonal D
        ev, V = np.linalg.eigh(S); Sih = V @ np.diag(ev ** -0.5) @ V.T
        Nk = np.array([np.outer(Sih[:, k], Sih[:, k]).ravel() for k in range(p)]).T
        dd = np.linalg.lstsq(Nk, np.eye(p).ravel(), rcond=None)[0]; D = np.diag(dd); return D, disc(est, d, D, None, False)
    if est == 'ADF':  # weighted least squares: r = s - H d
        s = np.array([S[a, b] for a, b in d['pairs']]); H = np.array([[1.0 if (a == b == k) else 0.0 for k in range(p)] for a, b in d['pairs']])
        dd = np.linalg.solve(H.T @ d['Ui'] @ H, H.T @ d['Ui'] @ s); D = np.diag(dd); return D, disc(est, d, D, None, False)


# ------------------------------------------------------------------ standard errors and derived quantities
def deltas(spec, ents, th):
    out = []
    for a in range(len(th)):
        h = 1e-6 * max(1, abs(th[a])); t1, t2 = th.copy(), th.copy(); t1[a] += h; t2[a] -= h
        i1, i2 = implied(spec, ents, t1), implied(spec, ents, t2)
        out.append(((i1['Sig'] - i2['Sig']) / (2 * h), (i1['mu'] - i2['mu']) / (2 * h)))
    return out


def information(est, spec, d, D, Sig):
    q = len(D); I = np.zeros((q, q))
    if est == 'ADF':
        V = np.array([[x[0][a, b] for a, b in d['pairs']] for x in D]); return d['n'] * V @ d['Ui'] @ V.T
    K = np.linalg.inv(Sig) if est == 'ML' else d['Si']
    W = [K @ x[0] for x in D]
    for a in range(q):
        for b in range(q):
            I[a, b] = 0.5 * np.trace(W[a] @ W[b]) + (D[a][1] @ K @ D[b][1] if spec.means else 0)
    return d['n'] * I


def estimates(spec, ents, th, cov):
    im = implied(spec, ents, th); sd = np.sqrt(np.diag(im['C'])); V = spec.vars; rows = []
    for e in ents:
        v = th[e['idx']] if e['idx'] >= 0 else e['fixed']
        se = math.sqrt(cov[e['idx'], e['idx']]) if (cov is not None and e['idx'] >= 0) else None
        r = dict(mat=e['mat'], a=V[e['i']], b=V[e['j']], est=float(v), se=se)
        if e['mat'] == 'A': r['std'] = float(v * sd[e['j']] / sd[e['i']])
        if e['mat'] == 'S' and e['i'] != e['j']: r['corr'] = float(v / math.sqrt(im['Om'][e['i'], e['i']] * im['Om'][e['j'], e['j']]))
        rows.append(r)
    return rows, im, sd


def mardia(X):
    N, p = X.shape; Z = X - X.mean(0); S = Z.T @ Z / N
    d2 = np.einsum('ti,ij,tj->t', Z, np.linalg.inv(S), Z)
    b2 = np.mean(d2 ** 2); k = b2 - p * (p + 2) * (N - 1) / (N + 1)
    m2, m3, m4 = (Z ** 2).mean(0), (Z ** 3).mean(0), (Z ** 4).mean(0)
    skew, kurt = m3 / m2 ** 1.5, m4 / m2 ** 2 - 3
    order = np.argsort(-d2)[:10]
    p1 = st.chi2.sf(d2[order], p)
    p2 = [st.binom.sf(r, N, p1[r]) for r in range(len(order))]  # P(at least r+1 of N exceed)
    return dict(skew=skew.tolist(), skewCR=(skew / math.sqrt(6 / N)).tolist(), kurt=kurt.tolist(), kurtCR=(kurt / math.sqrt(24 / N)).tolist(),
                min=X.min(0).tolist(), max=X.max(0).tolist(), mardia=k, mardiaCR=k / math.sqrt(8 * p * (p + 2) / N),
                mahal=[dict(d2=float(d2[t]), p1=float(p1[r]), p2=float(p2[r])) for r, t in enumerate(order)])


def semopy_desc(spec, ents):
    """lavaan-style description of the same model for semopy (labels and fixed values carried over)."""
    V = spec.vars; lines = []
    for F in spec.lat:
        j = spec.ix[F]
        terms = [(('%r*' % e['fixed']) if e['idx'] < 0 else (e['label'] + '*' if e['label'] else '')) + V[e['i']] for e in ents if e['mat'] == 'A' and e['j'] == j and e['i'] < spec.p]
        if terms: lines.append(F + ' =~ ' + ' + '.join(terms))
    for e in ents:
        if e['mat'] == 'A' and e['i'] >= spec.p:
            lines.append('%s ~ %s%s' % (V[e['i']], (e['label'] + '*') if e['label'] else '', V[e['j']]))
        if e['mat'] == 'S' and e['i'] != e['j']:
            lines.append('%s ~~ %s%s' % (V[e['i']], (e['label'] + '*') if e['label'] else '', V[e['j']]))
    return '\n'.join(lines)


def semopy_check(spec, ents, th, est, df_data, S, fiml=False, d=None):
    th_s = np.array(th, float)
    desc = semopy_desc(spec, ents)
    if fiml:
        m = ModelMeans(desc); m.fit(df_data, obj='ML')  # ModelMeans 'ML' = casewise FIML with mean structure
    else:
        m = semopy.Model(desc)
        m.fit(df_data, cov=pd.DataFrame(S, index=spec.obs, columns=spec.obs), obj={'ML': 'MLW', 'ADF': 'WLS'}.get(est, est))
    tab = m.inspect(); V = spec.vars; worst = 0.0
    for e in ents:
        if e['idx'] < 0 or e['mat'] == 'M': continue
        a, b = V[e['i']], V[e['j']]
        if e['mat'] == 'A': r = tab[(tab.lval == a) & (tab.op == '~') & (tab.rval == b)]
        else: r = tab[(tab.op == '~~') & (((tab.lval == a) & (tab.rval == b)) | ((tab.lval == b) & (tab.rval == a)))]
        if len(r):
            th_s[e['idx']] = float(r.Estimate.iloc[0])
            worst = max(worst, abs(th_s[e['idx']] - th[e['idx']]) / max(1, abs(th[e['idx']])))
    if worst > 2e-3:
        # accept only if semopy stopped early: our discrepancy must be lower at our solution than at semopy's
        if fiml or d is None: sys.exit('semopy disagrees (%s): %.2e' % (est, worst))
        f_ours = disc(est, d, implied(spec, ents, th)['Sig'], None, False); f_sem = disc(est, d, implied(spec, ents, th_s)['Sig'], None, False)
        if not f_ours < f_sem: sys.exit('semopy disagrees (%s): %.2e' % (est, worst))
        return dict(maxRelDiff=worst, F=f_ours, Fsemopy=f_sem)
    return worst


# ------------------------------------------------------------------ cases
def single_case(name, spec, X, est, df_data, semopy_ok=True, syntax=None):
    d = group_data(X, est); data = [d]
    ents, q, keys = layout(spec)
    th0 = start_from(spec, ents, q, d)
    if est != 'ML':
        th0, *_ = fit(spec, data, 'ML', th0)
    th, F, ents, q, keys = fit(spec, data, est, th0)
    gap = semopy_check(spec, ents[0], th, est, df_data, d['S'], d=d) if semopy_ok else None
    n, N, p = d['n'], d['N'], spec.p
    cov = None
    im = implied(spec, ents[0], th)
    if est in ('ML', 'GLS', 'ADF'):
        cov = np.linalg.inv(information(est, spec, d, deltas(spec, ents[0], th), im['Sig']))
    rows, im, sd = estimates(spec, ents[0], th, cov)
    C = n * F; moments = p * (p + 1) // 2; df = moments - q
    Dind, Fb = independence(est, d); Cb = n * Fb; db = p * (p - 1) // 2
    f1, fb1 = gfi_parts(est, d, im['Sig']); f2, fb2 = gfi_parts(est, d, Dind)
    rmr = lambda Sg: math.sqrt(np.sum(np.tril(d['S'] - Sg) ** 2) / moments)
    base = dict(n=n, N=N, ps=[p], Ns=[N], Cb=Cb, db=db, moments=moments)
    fitd = dict(default=fit_row(C, df, q, gfi=1 - f1 / fb1, rmr=rmr(im['Sig']), **base),
                saturated=fit_row(0.0, 0, moments, gfi=1.0, rmr=0.0, **base),
                independence=fit_row(Cb, db, p, gfi=1 - f2 / fb2, rmr=rmr(Dind), **base))
    T = im['B'] - np.eye(spec.nv)
    out = dict(name=name, estimator=est, N=N, chi2=C, df=df, q=q, fit=fitd, est=rows, semopyGap=gap,
               total=T.tolist(), stdTotal=(T * sd[None, :] / sd[:, None]).tolist(), vars=spec.vars,
               smc=[dict(v=spec.vars[i], smc=float(1 - im['Om'][i, i] / im['C'][i, i])) for i in range(spec.nv) if np.any(np.abs(im['A'][i]) > 0)])
    if syntax: out['syntax'] = syntax
    if est == 'ML':
        Sig = im['Sig']; Si = np.linalg.inv(Sig)
        out['stdResid'] = ((d['S'] - Sig) / np.sqrt((np.outer(np.diag(Sig), np.diag(Sig)) + Sig ** 2) / N)).tolist()
        out['fsw'] = (im['C'][p:, :p] @ Si).tolist()
        out['impliedAll'] = im['C'].tolist()
        out['mi'] = mod_indices(spec, ents[0], th, d, F)
    return out, th, ents


def mod_indices(spec, ents, th, d, F0):
    """Score tests by numerical derivatives: MI = n g^2 / (4 (I_cc - I_c. I^-1 I_.c)), per-case expected information."""
    n, p = d['n'], spec.p
    have = {(e['mat'], e['i'], e['j']) for e in ents}
    cands = [('S', 0, 1), ('S', 1, p - 1), ('S', 2, p - 2), ('A', 0, spec.nv - 1), ('A', p - 1, p), ('S', p, spec.nv - 1)]
    out = []
    for mat, i, j in cands:
        if (mat, i, j) in have: continue
        e2 = ents + [dict(mat=mat, i=i, j=j, fixed=None, label=None, idx=len(th))]
        t2 = np.append(th, 0.0)
        D = deltas(spec, e2, t2); Sig = implied(spec, ents, th)['Sig']
        I = information('ML', spec, d, D, Sig) / n
        Fx = lambda x: disc('ML', d, implied(spec, e2, x)['Sig'], None, False)
        g = num_grad(Fx, t2)[-1]
        sch = I[-1, -1] - I[-1, :-1] @ np.linalg.solve(I[:-1, :-1], I[:-1, -1])
        out.append(dict(mat=mat, a=spec.vars[i], b=spec.vars[j], mi=n * g * g / (4 * sch), epc=-g / (2 * sch)))
    return out


def main():
    res = {}
    cs = pd.read_csv(ROOT + '/examples/customer_satisfaction.csv')
    model = json.load(open(ROOT + '/examples/customer_satisfaction.model.json'))
    spec = spec_from_model(model)
    full = cs[spec.obs]; comp = full.dropna()
    X = comp.values.astype(float)
    res['customer'] = {}
    for est in ['ML', 'GLS', 'ULS', 'SLS', 'ADF']:
        out, th, ents = single_case('customer', spec, X, est, comp, semopy_ok=est != 'SLS')
        res['customer'][est] = out
    # normality of the complete cases
    res['normality'] = mardia(X); res['normality']['N'] = len(X)
    # FIML on all cases (incomplete data), with mean structure
    specm = spec_from_model(model, means=True)
    Xf = full.values.astype(float); Xf = Xf[np.isfinite(Xf).any(1)]
    d = dict(N=len(Xf), n=len(Xf) - 1, p=specm.p, X=Xf)
    mu_s, S_s, dev_s = em_saturated(Xf)
    d['S'], d['xbar'] = S_s, mu_s
    ents, q, _ = layout(specm)
    ml = res['customer']['ML']
    th0 = start_from(specm, ents, q, dict(S=S_s, xbar=mu_s))
    e_ml, _, _ = layout(spec); _, th_ml, _ = None, None, None
    th_ml = fit(spec, [group_data(X, 'ML')], 'ML', start_from(spec, e_ml, layout(spec)[1], group_data(X, 'ML')))[0]
    for e in ents[0]:
        for e2 in e_ml[0]:
            if e['idx'] >= 0 and e2['idx'] >= 0 and (e['mat'], e['i'], e['j']) == (e2['mat'], e2['i'], e2['j']): th0[e['idx']] = th_ml[e2['idx']]
    th, F, ents, q, keys = fit(specm, [d], 'FIML', th0)
    gap = semopy_check(specm, ents[0], th, 'FIML', full, None, fiml=True)
    H = np.zeros((q, q)); Ff = lambda x: fiml_dev(Xf, implied(specm, ents[0], x)['Sig'], implied(specm, ents[0], x)['mu']) / 2
    for b in range(q):
        h = 1e-4 * max(1, abs(th[b])); t1, t2 = th.copy(), th.copy(); t1[b] += h; t2[b] -= h
        H[:, b] = (num_grad(Ff, t1, 1e-5) - num_grad(Ff, t2, 1e-5)) / (2 * h)
    cov = np.linalg.inv((H + H.T) / 2)
    rows, im, sd = estimates(specm, ents[0], th, cov)
    dev = fiml_dev(Xf, im['Sig'], im['mu'])
    p = specm.p; dev_b = sum(np.isfinite(Xf[:, k]).sum() * (math.log(2 * math.pi) + math.log(np.nanvar(Xf[:, k])) + 1) for k in range(p))
    moments = p * (p + 3) // 2; df = moments - q; n = len(Xf) - 1
    base = dict(n=n, N=len(Xf), ps=[p], Ns=[len(Xf)], Cb=dev_b - dev_s, db=p * (p - 1) // 2, moments=moments)
    res['fiml'] = dict(N=len(Xf), dev=dev, devSat=dev_s, devInd=dev_b, est=rows, semopyGap=gap, q=q, df=df,
                       fit=dict(default=fit_row(dev - dev_s, df, q, **base), saturated=fit_row(0.0, 0, moments, **base), independence=fit_row(dev_b - dev_s, p * (p - 1) // 2, 2 * p, **base)))
    # syntax features: labels (equality), error covariance, fixed value, defined estimand
    syntax = 'Loyalty =~ loy_1 + a*loy_2 + a*loy_3\nsat_1 ~~ sat_2\nLoyalty ~ b*Satisfaction\nSatisfaction ~ c*Image\nind := c*b\nValue =~ 1*val_1 + val_2 + val_3'
    extra = [('A', 'loy_2', 'Loyalty', None, 'a'), ('A', 'loy_3', 'Loyalty', None, 'a'), ('S', 'sat_1', 'sat_2', None, None), ('A', 'Loyalty', 'Satisfaction', None, 'b'), ('A', 'Satisfaction', 'Image', None, 'c')]
    spec2 = spec_from_model(model, extra)
    out, th, ents = single_case('syntax', spec2, X, 'ML', comp, syntax=syntax)
    env = {e['label']: th[e['idx']] for e in ents[0] if e['label']}
    cov = np.linalg.inv(information('ML', spec2, group_data(X, 'ML'), deltas(spec2, ents[0], th), implied(spec2, ents[0], th)['Sig']))
    ia, ib = [e['idx'] for e in ents[0] if e['label'] == 'c'][0], [e['idx'] for e in ents[0] if e['label'] == 'b'][0]
    gr = np.zeros(len(th)); gr[ia], gr[ib] = env['b'], env['c']
    out['defs'] = [dict(name='ind', est=env['c'] * env['b'], se=math.sqrt(gr @ cov @ gr))]
    res['syntax'] = out
    # covariance-matrix input (published correlation matrix with SDs, N = 301)
    txt = open(ROOT + '/examples/cfa_correlations.csv').read().strip().split('\n')
    names = txt[0].split(',')[1:]; k = len(names); R = np.zeros((k, k)); sdv = None
    for line in txt[1:]:
        c = line.split(',')
        if c[0] == 'sd': sdv = np.array([float(x) for x in c[1:]]); continue
        i = names.index(c[0])
        for j, v in enumerate(c[1:]):
            if v.strip(): R[i, j] = R[j, i] = float(v)
    Sm = R * np.outer(sdv, sdv)
    mcfa = json.load(open(ROOT + '/examples/cfa_correlations.model.json'))
    spec3 = spec_from_model(mcfa)
    Lc = np.linalg.cholesky(Sm); Z = np.random.default_rng(1).standard_normal((301, k)); Z -= Z.mean(0)
    Z = Z @ np.linalg.inv(np.linalg.cholesky(np.cov(Z.T))).T @ Lc.T  # data with exactly this S (only S is used)
    out, th, ents = single_case('matrix', spec3, Z[:, [names.index(v) for v in spec3.obs]], 'ML', pd.DataFrame(Z[:, [names.index(v) for v in spec3.obs]], columns=spec3.obs))
    res['matrix'] = out
    # multiple groups (gender), Amos' nested sequence for a smaller model
    mg_model = {'constructs': [c for c in model['constructs'] if c['name'] in ('Satisfaction', 'Loyalty', 'Value')], 'paths': [p_ for p_ in model['paths'] if p_['from'] in ('c4', 'c5') and p_['to'] in ('c5', 'c6')], 'interactions': []}
    res['mg'] = multigroup(cs, mg_model)
    json.dump(res, sys.stdout, default=lambda o: float(o) if isinstance(o, (np.floating,)) else int(o) if isinstance(o, np.integer) else str(o))


def multigroup(cs, model):
    out = {}
    for means in (False, True):
        spec = spec_from_model(model, means=means)
        sub = cs[spec.obs + ['gender']].dropna()
        groups = sorted(sub['gender'].unique())  # alphabetical like js (female, male: coded by first appearance in js) -> order fixed below
        order = list(dict.fromkeys(cs['gender'].dropna()))
        data = [group_data(sub[sub.gender == g][spec.obs].values.astype(float), 'ML') for g in order]
        p, G = spec.p, len(data); N = sum(d['N'] for d in data); n = N - G
        moments = G * (p * (p + 1) // 2 + (p if means else 0))
        steps = [('mw', ['load']), ('mi', ['int', 'mean']), ('sw', ['path']), ('scov', ['var', 'xcov']), ('sr', ['dvar', 'dcov']), ('mr', ['evar', 'ecov'])]
        kinds = {kind_of(spec, e) for e in spec.entries if e['fixed'] is None}
        models, cur = [('unc', ())], []
        for sid, ks in steps:
            if sid == 'mi' and not means: continue
            if not any(k in kinds for k in ks): continue
            cur = cur + ks; models.append((sid, tuple(cur)))
        Cb = sum(d['n'] * (np.sum(np.log(np.diag(d['S']))) - d['ldS']) for d in data); db = G * p * (p - 1) // 2
        rows, th_prev = [], None
        for sid, shared in models:
            ents, q, keys = layout(spec, G, shared)
            th0 = np.zeros(q)
            if th_prev is None:
                # unconstrained: each group separately
                th = np.zeros(q)
                for g in range(G):
                    e0, q0, _ = layout(spec)
                    tg, *_ = fit(spec, [data[g]], 'ML', start_from(spec, e0, q0, data[g]))
                    for e, eg in zip(e0[0], ents[g]):
                        if eg['idx'] >= 0: th[eg['idx']] = tg[e['idx']]
                th, F, ents, q, keys = fit(spec, data, 'ML', th, G, shared)
            else:
                pk, pth = th_prev
                for b, k in enumerate(keys):
                    k0 = k if k in pk else (k + (0,))
                    th0[b] = pth[pk.index(k0)] if k0 in pk else 0.0
                th, F, ents, q, keys = fit(spec, data, 'ML', th0, G, shared)
            th_prev = (keys, th)
            C = n * F
            sig = [implied(spec, ents[g], th)['Sig'] for g in range(G)]
            row = fit_row(C, moments - q, q, n, N, [p] * G, [d['N'] for d in data], Cb, db, moments)
            if not means:
                fs = sum(d['n'] / n * gfi_parts('ML', d, sig[g])[0] for g, d in enumerate(data)); fb = sum(d['n'] / n * gfi_parts('ML', d, sig[g])[1] for g, d in enumerate(data))
                row['gfi'] = 1 - fs / fb
                row['rmr'] = math.sqrt(sum(np.sum(np.tril(d['S'] - sig[g]) ** 2) for g, d in enumerate(data)) / (G * p * (p + 1) // 2))
            rows.append(dict(id=sid, fit=row, est=[estimates(spec, ents[g], th, None)[0] for g in range(G)]))
        out['means' if means else 'cov'] = dict(groups=order, models=rows, N=N)
    return out


if __name__ == '__main__':
    main()
