export function createOverlayLifecycle({
  state,
  getPlugins,
  callPluginHook,
  ensureHistoryInitialized,
  getActiveScene,
  recomputeNextEntryId,
  createToolbar,
  setDrawingMode,
  updateToolbarState,
  requestRender,
  clearSelection,
  forceReleaseTemporaryPassthrough,
  handleCanvasPointerDown,
  handleCanvasPointerMove,
  handleCanvasPointerUp
}) {
  function createCanvas() {
    if (state.core.canvas) {
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.id = 'bbrush-canvas';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.zIndex = '2147483647';
    canvas.style.cursor = 'crosshair';

    canvas.addEventListener('pointerdown', handleCanvasPointerDown);
    canvas.addEventListener('pointermove', handleCanvasPointerMove);
    canvas.addEventListener('pointerup', handleCanvasPointerUp);
    canvas.addEventListener('pointerleave', handleCanvasPointerUp);

    document.body.appendChild(canvas);
    state.core.canvas = canvas;
    state.core.context = canvas.getContext('2d');
  }

  function enableOverlay(startDrawingMode) {
    if (state.core.enabled) {
      setDrawingMode(Boolean(startDrawingMode));
      updateToolbarState();
      return;
    }

    createCanvas();
    createToolbar();
    ensureHistoryInitialized(getActiveScene());
    recomputeNextEntryId();

    state.core.isToolbarExpanded = false;
    state.core.isSizeExpanded = false;
    state.core.showQuickMenu = false;
    state.core.showShortcuts = false;
    state.core.lastLocationHref = window.location.href;
    state.core.canvas.style.display = 'block';
    state.core.toolbarHost.style.display = 'block';
    state.core.enabled = true;

    setDrawingMode(Boolean(startDrawingMode));

    for (const plugin of getPlugins()) {
      callPluginHook(plugin, 'onOverlayEnable');
    }

    updateToolbarState();
    requestRender();
  }

  function disableOverlay() {
    if (!state.core.enabled || !state.core.canvas || !state.core.toolbarHost) {
      return;
    }

    setDrawingMode(false);
    clearSelection({ reason: 'overlay-disabled', render: false });
    state.core.isDraggingLauncher = false;
    state.core.launcherPointerId = null;
    state.core.suppressNextLauncherClick = false;
    forceReleaseTemporaryPassthrough();
    state.core.canvas.style.display = 'none';
    state.core.toolbarHost.style.display = 'none';
    state.core.enabled = false;

    for (const plugin of getPlugins()) {
      callPluginHook(plugin, 'onOverlayDisable');
    }

    updateToolbarState();
  }

  return {
    enableOverlay,
    disableOverlay
  };
}
