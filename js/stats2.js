/*
 * BabPls engine module: classic statistics II: correlation, regression, frequencies, reliability, factor analysis, Bayesian (JASP-style)
 * UMD: extends window.YPEngine (browser/worker) or the Node export of advanced3.js. Each analysis registers
 * E.tasks[kind] = (ds, model, settings, opts, progress) => result (result.kind selects the renderer in js/ui-stats2.js).
 */
(function (root) {
  'use strict';
  const E = (typeof module !== 'undefined' && module.exports) ? require('./advanced3.js') : root.YPEngine;
  E.tasks = E.tasks || {};

  if (typeof module !== 'undefined' && module.exports) module.exports = E;
})(typeof self !== 'undefined' ? self : this);
