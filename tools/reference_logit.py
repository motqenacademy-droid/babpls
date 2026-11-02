"""Reference logistic regression from statsmodels for tests/fixtures/logit.json.

    pip install statsmodels pandas && python tools/reference_logit.py > tests/fixtures/logit.json
"""
import json
import pandas as pd
import statsmodels.api as sm

df = pd.read_csv('examples/customer_satisfaction.csv')
x = ['sat_1', 'loy_1', 'age']
d = df[['gender'] + x].dropna()
y = (d['gender'] == 'male').astype(float)   # event = second category in order of appearance? see test
res = sm.Logit(y, sm.add_constant(d[x])).fit(disp=0, tol=1e-12)
print(json.dumps({'x': x, 'params': res.params.tolist(), 'bse': res.bse.tolist(), 'llf': res.llf, 'llnull': res.llnull,
                  'prsquared': res.prsquared, 'aic': res.aic, 'bic': res.bic, 'n': int(res.nobs)}))
