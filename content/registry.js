(function initBbrushPluginRegistry() {
  if (window.__BBRUSH_REGISTER_PLUGIN__) {
    return;
  }

  const pluginDefinitions = [];

  function findPluginIndex(pluginId) {
    return pluginDefinitions.findIndex((entry) => entry && entry.id === pluginId);
  }

  window.__BBRUSH_PLUGIN_DEFINITIONS__ = pluginDefinitions;
  window.__BBRUSH_REGISTER_PLUGIN__ = function registerBbrushPlugin(definition) {
    if (!definition || typeof definition.id !== 'string') {
      return;
    }

    const nextDefinition = { ...definition };
    const existingIndex = findPluginIndex(nextDefinition.id);

    if (existingIndex === -1) {
      pluginDefinitions.push(nextDefinition);
      return;
    }

    pluginDefinitions[existingIndex] = nextDefinition;
  };
})();
