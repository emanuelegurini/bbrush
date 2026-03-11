(function registerBbrushPanelActionsPlugin() {
  const PLUGIN_IDS = window.__BBRUSH_PLUGIN_IDS__;

  if (
    !PLUGIN_IDS ||
    typeof PLUGIN_IDS.PANEL_ACTIONS !== 'string' ||
    typeof window.__BBRUSH_REGISTER_PLUGIN_IMPL__ !== 'function'
  ) {
    return;
  }

  window.__BBRUSH_REGISTER_PLUGIN_IMPL__(PLUGIN_IDS.PANEL_ACTIONS, {});
})();
