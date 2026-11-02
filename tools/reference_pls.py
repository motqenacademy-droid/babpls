"""Independent NumPy implementation of the PLS-SEM algorithm (Lohmöller), used only to
produce tests/fixtures/reference.json that the JavaScript engine is checked against.

    python tools/reference_pls.py > tests/fixtures/reference.json

Needs numpy only. Casewise deletion of rows with any missing indicator.
"""
import csv, json, sys, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'examples', 'customer_satisfaction.csv')
MODEL = os.path.join(HERE, '..', 'examples', 'customer_satisfaction.model.json')


def load():
    with open(DATA, newline='') as f:
        rows = list(csv.DictReader(f))
    model = json.load(open(MODEL))
    used = [i for c in model['constructs'] for i in c['indicators']]
    rows = [r for r in rows if all(r[i] != '' for i in used)]
    return rows, model


def pls(rows, model, scheme='path', modes=None):
    C = model['constructs']; ids = [c['id'] for c in C]; J = len(C)
    modes = modes or {}
    X = []
    for c in C:
        a = np.array([[float(r[i]) for i in c['indicators']] for r in rows])
        X.append((a - a.mean(0)) / a.std(0, ddof=1))
    n = X[0].shape[0]
    A = np.zeros((J, J))  # A[i, j] = 1 if i -> j
    for p in model['paths']:
        A[ids.index(p['from']), ids.index(p['to'])] = 1
    w = [np.ones(x.shape[1]) for x in X]

    def norm(j):
        y = X[j] @ w[j]; s = y.std(ddof=1); w[j] = w[j] / s; return y / s

    for it in range(3000):
        Y = np.column_stack([norm(j) for j in range(J)])
        R = np.corrcoef(Y, rowvar=False)
        E = np.zeros((J, J))
        for j in range(J):
            pred = np.where(A[:, j] == 1)[0]; succ = np.where(A[j, :] == 1)[0]
            nb = np.concatenate([pred, succ]).astype(int)
            if scheme == 'centroid':
                E[j, nb] = np.sign(R[j, nb])
            elif scheme == 'factor':
                E[j, nb] = R[j, nb]
            else:
                E[j, succ] = R[j, succ]
                if len(pred):
                    E[j, pred] = np.linalg.solve(R[np.ix_(pred, pred)], R[pred, j])
        Z = Y @ E.T
        old = [x.copy() for x in w]
        for j in range(J):
            if X[j].shape[1] == 1:
                w[j] = np.ones(1); continue
            if modes.get(C[j]['name']) == 'B':
                w[j] = np.linalg.solve(X[j].T @ X[j], X[j].T @ Z[:, j])
            else:
                w[j] = X[j].T @ Z[:, j] / (n - 1)
        for j in range(J):
            norm(j)
        if max(np.abs(np.abs(a) - np.abs(b)).max() for a, b in zip(w, old)) < 1e-12:
            break
    Y = np.column_stack([norm(j) for j in range(J)])
    R = np.corrcoef(Y, rowvar=False)
    out = {'n': n, 'weights': {}, 'loadings': {}, 'paths': {}, 'r2': {}}
    for j, c in enumerate(C):
        for k, ind in enumerate(c['indicators']):
            out['weights'][ind] = float(w[j][k])
            out['loadings'][ind] = float(np.corrcoef(X[j][:, k], Y[:, j])[0, 1])
        pred = np.where(A[:, j] == 1)[0]
        if len(pred):
            b = np.linalg.solve(R[np.ix_(pred, pred)], R[pred, j])
            for i, bi in zip(pred, b):
                out['paths'][C[i]['name'] + ' -> ' + c['name']] = float(bi)
            out['r2'][c['name']] = float(b @ R[pred, j])
    return out


if __name__ == '__main__':
    rows, model = load()
    res = {
        'path_A': pls(rows, model, 'path'),
        'centroid_A': pls(rows, model, 'centroid'),
        'factor_A': pls(rows, model, 'factor'),
        'path_ValueB': pls(rows, model, 'path', {'Value': 'B'}),
    }
    json.dump(res, sys.stdout, indent=1)
