(function bootstrapBbrushRuntime() {
  if (window.__BBRUSH_RUNTIME__ && window.__BBRUSH_RUNTIME__.initialized) {
    return;
  }

  if (typeof window.__BBRUSH_CREATE_RUNTIME__ !== 'function') {
    return;
  }

  const pluginDefinitions = Array.isArray(window.__BBRUSH_PLUGIN_DEFINITIONS__)
    ? window.__BBRUSH_PLUGIN_DEFINITIONS__
    : [];

  const runtime = window.__BBRUSH_CREATE_RUNTIME__(pluginDefinitions);
  window.__BBRUSH_RUNTIME__ = runtime;
  runtime.init();
})();
