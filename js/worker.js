/* Runs heavy YouPls analyses off the main thread. */
importScripts('engine.js', 'advanced.js', 'advanced2.js', 'advanced3.js');
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
      case 'mga': result = E.mgaFull(ds, model, settings, opts, progress); break;
      case 'nca': result = E.nca(ds, model, settings, opts, progress); break;
      case 'regression': result = E.regression(ds, opts); break;
      case 'cbsem': result = E.cbsemModerated(ds, model, settings, opts, progress); break;
      case 'cca': result = E.fitTest(ds, model, settings, opts, progress); break;
      case 'cbsemmg': result = E.cbsemMG(ds, model, settings, opts, progress); break;
      case 'compare': result = E.compareModels(ds, opts.models, settings, opts, progress); break;
      case 'gsca': result = E.gsca(ds, model, settings, opts, progress); break;
      case 'cvpat': result = E.cvpat(ds, model, settings, opts, progress); break;
      case 'logistic': result = E.logistic(ds, model, settings, opts); break;
      case 'samplesize': result = E.sampleSize(opts); break;
      case 'fimix': result = E.fimix(ds, model, settings, opts, progress); break;
      case 'pos': result = E.pos(ds, model, settings, opts, progress); break;
      case 'cta': result = E.cta(ds, model, settings, opts, progress); break;
      case 'copula': result = E.copula(ds, model, settings, opts, progress); break;
      case 'process': result = E.processModel(ds, model, settings, opts, progress); break;
      default: throw new Error('unknown task ' + task);
    }
    self.postMessage({ id, result });
  } catch (e) {
    self.postMessage({ id, error: e.message, details: e.details || null });
  }
};
