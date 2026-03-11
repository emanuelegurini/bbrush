(function registerBbrushWhiteboardPlugin() {
  const PLUGIN_IDS = window.__BBRUSH_PLUGIN_IDS__;

  if (
    !PLUGIN_IDS ||
    typeof PLUGIN_IDS.WHITEBOARD !== 'string' ||
    typeof window.__BBRUSH_REGISTER_PLUGIN_IMPL__ !== 'function'
  ) {
    return;
  }

  window.__BBRUSH_REGISTER_PLUGIN_IMPL__(PLUGIN_IDS.WHITEBOARD, {
    onLocationChange(ctx, payload) {
      if (ctx.core.canvasMode !== 'whiteboard') {
        return;
      }

      if (!ctx.utils.didPageContextChange(payload.previousHref, payload.nextHref)) {
        return;
      }

      ctx.setCanvasMode('page', { autoEnableDrawing: false });
    }
  });
})();
