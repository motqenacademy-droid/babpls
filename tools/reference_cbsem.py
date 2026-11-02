"""Reference CB-SEM estimates from semopy (independent Python SEM package) for tests/fixtures/semopy.json.

    pip install semopy && python tools/reference_cbsem.py > tests/fixtures/semopy.json
"""
import json, sys, pandas as pd, semopy
df = pd.read_csv('examples/customer_satisfaction.csv').dropna()
m = json.load(open('examples/customer_satisfaction.model.json'))
nm = {c['id']: c['name'] for c in m['constructs']}
lines = [f"{c['name']} =~ " + ' + '.join(c['indicators']) for c in m['constructs']]
tos = {}
for p in m['paths']: tos.setdefault(nm[p['to']], []).append(nm[p['from']])
lines += [f"{k} ~ " + ' + '.join(v) for k, v in tos.items()]
mod = semopy.Model('\n'.join(lines)); mod.fit(df, obj='MLW')
est = mod.inspect(std_est=True)
st = semopy.calc_stats(mod)
out = {'est': [[r['lval'], r['op'], r['rval'], float(r['Estimate']), float(r['Est. Std']), (float(r['Std. Err']) if r['Std. Err'] != '-' else None)] for _, r in est.iterrows()],
       'chi2': float(st['chi2'].iloc[0]), 'dof': float(st['DoF'].iloc[0]), 'cfi': float(st['CFI'].iloc[0]), 'tli': float(st['TLI'].iloc[0]), 'rmsea': float(st['RMSEA'].iloc[0]), 'n': len(df)}
print(json.dumps(out))
