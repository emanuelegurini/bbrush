import { PLUGIN_IDS } from '../../shared/pluginIds.js';

export function createModeRuntime({
  state,
  getPlugins,
  getPlugin,
  callPluginHook,
  ensureHistoryInitialized,
  getActiveScene,
  recomputeNextEntryId,
  clearSelection,
  requestRender,
  updateOverlayInteractionState,
  updateToolbarState
}) {
  function adjustActiveSize(delta) {
    if (!Number.isFinite(delta) || delta === 0) {
      return false;
    }

    if (state.core.activeToolId === PLUGIN_IDS.TEXT) {
      state.shared.textSize = Math.max(12, Math.min(96, state.shared.textSize + delta));
    } else {
      state.shared.penSize = Math.max(1, Math.min(24, state.shared.penSize + delta));
    }

    updateToolbarState();
    return true;
  }

  function setDrawingMode(active) {
    if (!state.core.canvas) {
      return;
    }

    state.core.isDrawingMode = active;

    for (const plugin of getPlugins()) {
      callPluginHook(plugin, 'onDrawingModeChange', { active });
    }

    if (!active) {
      clearSelection({ reason: 'drawing-mode-disabled', render: false });
      state.core.isSpacePressed = false;
      state.core.isTemporaryPassthrough = false;
      requestRender();
    }

    updateOverlayInteractionState();
    updateToolbarState();
  }

  function setCanvasMode(mode, options = {}) {
    if (mode !== 'page' && mode !== 'whiteboard') {
      return;
    }

    if (state.core.canvasMode === mode) {
      return;
    }

    const previousMode = state.core.canvasMode;
    state.core.canvasMode = mode;
    ensureHistoryInitialized(getActiveScene());
    recomputeNextEntryId();
    clearSelection({ reason: 'canvas-mode-changed', render: false });

    if (!state.core.isDrawingMode && options.autoEnableDrawing !== false) {
      setDrawingMode(true);
    }

    for (const plugin of getPlugins()) {
      callPluginHook(plugin, 'onCanvasModeChange', { previousMode, mode });
    }

    requestRender();
    updateToolbarState();
  }

  function toggleCanvasMode() {
    setCanvasMode(state.core.canvasMode === 'whiteboard' ? 'page' : 'whiteboard');
  }

  function setActiveTool(pluginId, options = {}) {
    const nextPlugin = getPlugin(pluginId);
    if (!nextPlugin) {
      return;
    }

    const previousToolId = state.core.activeToolId;
    const previousPlugin = getPlugin(previousToolId);

    if (previousPlugin && previousToolId !== pluginId) {
      callPluginHook(previousPlugin, 'onToolDeactivate', {
        nextToolId: pluginId
      });
    }

    state.core.activeToolId = pluginId;
    clearSelection({
      reason: 'tool-changed',
      exceptPluginId: pluginId,
      render: false
    });

    callPluginHook(nextPlugin, 'onToolActivate', {
      previousToolId
    });

    if (!state.core.isDrawingMode && options.autoEnableDrawing !== false) {
      setDrawingMode(true);
    }

    requestRender();
    updateOverlayInteractionState();
    updateToolbarState();
  }

  function toggleDrawingMode() {
    if (!state.core.enabled) {
      return false;
    }

    setDrawingMode(!state.core.isDrawingMode);
    return state.core.isDrawingMode;
  }

  return {
    adjustActiveSize,
    setDrawingMode,
    setCanvasMode,
    toggleCanvasMode,
    setActiveTool,
    toggleDrawingMode
  };
}
