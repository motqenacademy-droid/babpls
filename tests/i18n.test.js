// Every UI key used in app.js / index.html must exist in both languages.
'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = {};
require(path.join(root, 'js/i18n.js'));
const L = global.window.YPI18N;
test('both languages define the same keys', () => {
  const en = Object.keys(L.en).sort(), ar = Object.keys(L.ar).sort();
  assert.deepStrictEqual(ar.filter(k => !L.en[k]), [], 'only in ar');
  assert.deepStrictEqual(en.filter(k => !L.ar[k]), [], 'only in en');
});
test('every key used by the UI is defined', () => {
  const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8'), html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const used = new Set();
  for (const m of app.matchAll(/\bt\('([a-z0-9_]+)'/gi)) if (!m[1].endsWith('_')) used.add(m[1]);
  for (const m of html.matchAll(/data-i[tp]?="([a-z0-9_]+)"/g)) used.add(m[1]);
  for (const m of app.matchAll(/title: '(an_[a-z_]+)'/g)) { used.add(m[1]); used.add(m[1] + '_d'); }
  // dynamic families
  ['path', 'factor', 'centroid', 'mean', 'casewise', 'percentile', 'bca', 'two', 'one'].forEach(k => used.add('opt_' + k));
  ['scheme', 'missing', 'maxIter', 'samples', 'ci', 'test', 'alpha', 'seed', 'distance', 'folds', 'reps', 'permutations', 'scaleMin', 'scaleMax', 'target', 'regY', 'regX'].forEach(k => used.add('f_' + k));
  ['path', 'total', 'indirect', 'specific', 'loading', 'weight', 'r2', 'r2adj', 'f2', 'htmt', 'alpha', 'rhoA', 'rhoC', 'ave', 'fit'].forEach(k => used.add('bg_' + k));
  ['left', 'right', 'top', 'bottom'].forEach(k => used.add('side_' + k));
  ['auto', 'dark', 'light'].forEach(k => used.add('theme_' + k));
  ['g_final', 'g_quality', 'g_data', 'path_exists'].forEach(k => used.add(k));
  ['theme', 'classic', 'journal', 'pastel', 'forest', 'contrast', 'boxes'].forEach(k => used.add('preset_' + k));
  ['ellipse', 'rect', 'rounded', 'solid', 'dashed', 'dotted', 'system', 'sans', 'serif', 'georgia', 'tahoma', 'mono', 'naskh'].forEach(k => used.add('st_' + k));
  ['theme', 'okabe', 'vivid', 'ocean', 'earth', 'gray'].forEach(k => used.add('pal_' + k));
  [1, 4, 6, 7, 14].forEach(k => used.add('pm_' + k));
  ['load', 'ecov', 'path', 'rcov'].forEach(k => used.add('mi_' + k));
  ['ia', 'lm'].forEach(k => used.add('cvpat_vs_' + k));
  ['regBoot', 'cmpMethod'].forEach(k => used.add('f_' + k));
  ['pls', 'cbsem'].forEach(k => used.add('cmp_' + k));
  ['configural', 'metric', 'scalar'].forEach(k => used.add('inv_' + k));
  ['cov_n', 'cov_bad', 'compare_two', 'mg_small'].forEach(k => used.add('err_' + k));
  ['converge', 'loadings', 'reliability', 'ave', 'htmt', 'htmt_ci', 'outer_vif', 'inner_vif', 'paths', 'r2', 'srmr', 'n'].forEach(k => used.add('chk_' + k));
  ['bootSamples', 'cbBoot', 'ssPmin', 'ssAlpha', 'ssPower', 'logY', 'logX'].forEach(k => used.add('f_' + k));
  ['logit_binary', 'xlsx_bad', 'xlsx_unsupported', 'sav_bad', 'sav_zsav', 'csv_empty'].forEach(k => used.add('err_' + k));
  ['var', 'cov', 'resid', 'error'].forEach(k => used.add('cbk_' + k));
  ['maxK', 'K', 'starts', 'center', 'weightVar', 'pmodel', 'procX', 'procY', 'procM', 'procW'].forEach(k => used.add('f_' + k));
  ['cbsem_formative', 'cbsem_interactions', 'cbsem_unidentified', 'cbsem_start', 'pos_too_small', 'pos_failed', 'cta_no_block', 'process_vars', 'no_weight'].forEach(k => used.add('err_' + k));
  ['no_constructs', 'no_indicators', 'missing_column', 'non_numeric', 'bad_path', 'bad_interaction', 'cycle', 'no_paths', 'no_interactions', 'no_group', 'one_group', 'same_group', 'bad_regression', 'cancelled'].forEach(k => used.add('err_' + k));
  // data editor (js/dataview.js): literal keys and the dynamic families of its menus, options and errors
  const dv = fs.readFileSync(path.join(root, 'js/dataview.js'), 'utf8');
  for (const m of dv.matchAll(/\bt\('([a-z0-9_]+)'/gi)) if (!m[1].endsWith('_')) used.add(m[1]);
  for (const m of dv.matchAll(/'(dv_[a-z0-9_]+)'/g)) if (!m[1].endsWith('_')) used.add(m[1]);
  for (const m of dv.matchAll(/^\s+(?:edit|data|transform|export): \[([^\]]+)\]/gm)) for (const a of m[1].match(/'([a-z_]+)'/g)) if (a !== "'-'") used.add('dv_a_' + a.slice(1, -1));
  for (const m of dv.matchAll(/selField\('[a-zA-Z]+', \[([^\]]+)\][^)]*?(?:, '([a-z]+_)')?\)/g)) for (const a of m[1].match(/'([a-z0-9]+)'/g)) used.add('dv_o_' + (m[2] || '') + a.slice(1, -1));
  ['inscasebelow', 'insvarright', 'sortasc', 'sortdesc', 'varprops'].forEach(k => used.add('dv_a_' + k));
  ['data', 'vars', 'summary'].forEach(k => used.add('dv_tab_' + k)); ['edit', 'data', 'transform', 'export'].forEach(k => used.add('dv_menu_' + k));
  ['numeric', 'categorical', 'string', 'date'].forEach(k => used.add('dv_type_' + k)); ['scale', 'ordinal', 'nominal'].forEach(k => used.add('dv_m_' + k));
  ['input', 'target', 'both', 'none'].forEach(k => used.add('dv_role_' + k)); ['auto', 'left', 'center', 'right'].forEach(k => used.add('dv_al_' + k));
  ['value', 'range', 'lowest', 'highest', 'missing', 'sysmis', 'else'].forEach(k => used.add('dv_r_' + k)); ['value', 'missing', 'copy'].forEach(k => used.add('dv_r_to_' + k));
  ['rank', 'percent', 'fraction', 'ntiles'].forEach(k => used.add('dv_o_' + k));
  ['empty', 'syntax', 'end', 'char', 'string', 'chain', 'unknown_var', 'unknown_fn', 'args', 'range', 'range_here', 'unknown_label'].forEach(k => used.add('expr_' + k));
  ['name_empty', 'name_chars', 'name_reserved', 'name_taken', 'not_number', 'bad_date'].forEach(k => used.add('dv_' + k));
  const missing = [...used].filter(k => !L.en[k] || !L.ar[k]);
  assert.deepStrictEqual(missing, []);
});
