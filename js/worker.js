/* Runs heavy YouPls analyses off the main thread. */
importScripts('engine.js');
self.onmessage = function (ev) {
  const { id, task, ds, model, settings, opts } = ev.data;
  const E = self.YPEngine;
  const progress = p => self.postMessage({ id, progress: p });
  try {
    let result;
    switch (task) {
      case 'pls': result = E.runPLS(ds, model, settings); break;
      case 'bootstrap': result = E.bootstrap(ds, model, settings, opts, progress); break;
      case 'blindfolding': result = E.blindfolding(ds, model, settings, opts, progress); break;
      case 'predict': result = E.plspredict(ds, model, settings, opts, progress); break;
      case 'ipma': result = E.ipma(ds, model, settings, opts); break;
      case 'mga': result = E.mga(ds, model, settings, opts, progress); break;
      case 'nca': result = E.nca(ds, model, settings, opts, progress); break;
      case 'regression': result = E.regression(ds, opts); break;
      default: throw new Error('unknown task ' + task);
    }
    self.postMessage({ id, result });
  } catch (e) {
    self.postMessage({ id, error: e.message, details: e.details || null });
  }
};
