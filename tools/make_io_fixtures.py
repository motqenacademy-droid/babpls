"""Writes small .xlsx and .sav files (with Arabic text and missing values) used by tests/io.test.js.

    pip install pandas openpyxl pyreadstat && python tools/make_io_fixtures.py
"""
import numpy as np, pandas as pd, pyreadstat
df = pd.read_csv('examples/customer_satisfaction.csv').head(40)
df['city'] = ['الرياض', 'القاهرة', 'Amman, JO', 'Rabat "R"'] * 10
df.loc[3, 'sat_1'] = np.nan
df.loc[5, 'city'] = ''
df.to_excel('tests/fixtures/io_sample.xlsx', index=False)
pyreadstat.write_sav(df, 'tests/fixtures/io_sample.sav', compress=False)
pyreadstat.write_sav(df, 'tests/fixtures/io_sample_compressed.sav', row_compress=True)
df.to_csv('tests/fixtures/io_sample.csv', index=False)
