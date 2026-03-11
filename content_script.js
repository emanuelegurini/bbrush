(function bootstrapBbrushRuntime() {
  if (window.__BBRUSH_RUNTIME__ && window.__BBRUSH_RUNTIME__.initialized) {
    return;
  }

  if (typeof window.__BBRUSH_CREATE_RUNTIME__ !== 'function') {
    return;
  }

  const runtime = window.__BBRUSH_CREATE_RUNTIME__();
  window.__BBRUSH_RUNTIME__ = runtime;
  runtime.init();
})();
