export function createRenderRuntime({
  state,
  getPlugins,
  getActiveScene,
  getEntryOwner,
  getActiveToolPlugin,
  getPluginContext,
  callPluginHook
}) {
  function replayStrokes() {
    if (!state.core.canvas || !state.core.context) {
      return;
    }

    state.core.context.clearRect(0, 0, state.core.canvas.width, state.core.canvas.height);

    if (state.core.canvasMode === 'whiteboard') {
      state.core.context.save();
      state.core.context.fillStyle = '#f8fafc';
      state.core.context.fillRect(0, 0, state.core.canvas.width, state.core.canvas.height);
      state.core.context.restore();
    }

    for (const entry of getActiveScene().strokes) {
      const plugin = getEntryOwner(entry);
      if (!plugin) {
        continue;
      }

      callPluginHook(plugin, 'onRenderEntry', entry);
    }

    for (const plugin of getPlugins()) {
      callPluginHook(plugin, 'onRenderOverlay');
    }
  }

  function requestRender() {
    replayStrokes();
  }

  function updateCanvasCursor(pointerPoint) {
    if (!state.core.canvas) {
      return;
    }

    if (!state.core.enabled || !state.core.isDrawingMode) {
      state.core.canvas.style.cursor = 'crosshair';
      return;
    }

    const activePlugin = getActiveToolPlugin();
    if (!activePlugin || typeof activePlugin.getCanvasCursor !== 'function') {
      state.core.canvas.style.cursor = 'crosshair';
      return;
    }

    const nextCursor = activePlugin.getCanvasCursor(
      getPluginContext(activePlugin.id),
      pointerPoint || null
    );
    state.core.canvas.style.cursor = nextCursor || 'crosshair';
  }

  return {
    requestRender,
    replayStrokes,
    updateCanvasCursor
  };
}
