import { PLUGIN_IDS } from '../../shared/pluginIds.js';

export function createInteractionRuntime({
  state,
  getPlugins,
  getPluginContext,
  getActiveToolPlugin,
  callPluginHook,
  hasActiveInteraction,
  setQuickMenuVisible,
  requestRender,
  updateCanvasCursor,
  isSpaceShortcut,
  isEditableTarget
}) {
  function updateOverlayInteractionState() {
    if (!state.core.canvas) {
      return;
    }

    const activePlugin = getActiveToolPlugin();
    const canUseCanvasPointerEvents =
      activePlugin && activePlugin.usesCanvasPointerEvents !== false;

    const canInteractWithCanvas =
      state.core.isDrawingMode &&
      !state.core.isTemporaryPassthrough &&
      Boolean(canUseCanvasPointerEvents);

    state.core.canvas.style.pointerEvents = canInteractWithCanvas ? 'auto' : 'none';

    if (!state.core.isDrawingMode || state.core.isTemporaryPassthrough) {
      document.body.style.cursor = '';
      return;
    }

    if (state.core.activeToolId === PLUGIN_IDS.HIGHLIGHT) {
      document.body.style.cursor = 'text';
      return;
    }

    document.body.style.cursor = 'crosshair';
    updateCanvasCursor();
  }

  function setTemporaryPassthrough(active) {
    if (!state.core.canvas || state.core.isTemporaryPassthrough === active) {
      return;
    }

    state.core.isTemporaryPassthrough = active;
    updateOverlayInteractionState();
  }

  function releaseTemporaryPassthrough() {
    if (state.core.isTemporaryPassthrough) {
      setTemporaryPassthrough(false);
    }
  }

  function forceReleaseTemporaryPassthrough() {
    state.core.isSpacePressed = false;
    releaseTemporaryPassthrough();
  }

  function runActiveToolHook(hookName, payload) {
    const activePlugin = getActiveToolPlugin();
    if (!activePlugin) {
      return undefined;
    }

    return callPluginHook(activePlugin, hookName, payload);
  }

  function handleCanvasPointerDown(event) {
    if (!state.core.enabled || !state.core.isDrawingMode || !state.core.canvas) {
      return;
    }

    runActiveToolHook('onPointerDown', event);
  }

  function handleCanvasPointerMove(event) {
    if (!state.core.enabled || !state.core.isDrawingMode || !state.core.canvas) {
      return;
    }

    runActiveToolHook('onPointerMove', event);
  }

  function handleCanvasPointerUp(event) {
    if (!state.core.enabled || !state.core.canvas) {
      return;
    }

    runActiveToolHook('onPointerUp', event);
  }

  function shouldBlockKeybindings(event) {
    return getPlugins().some((plugin) => {
      if (typeof plugin.shouldBlockKeybindings !== 'function') {
        return false;
      }

      return Boolean(plugin.shouldBlockKeybindings(getPluginContext(plugin.id), event));
    });
  }

  function matchesKeybinding(binding, event) {
    if (!binding || typeof binding.run !== 'function') {
      return false;
    }

    const bindingKey = typeof binding.key === 'string' ? binding.key.toLowerCase() : null;
    const eventKey = typeof event.key === 'string' ? event.key.toLowerCase() : '';

    if (bindingKey && bindingKey !== eventKey) {
      return false;
    }

    if (binding.ctrlOrMeta && !(event.ctrlKey || event.metaKey)) {
      return false;
    }

    if (binding.alt && !event.altKey) {
      return false;
    }

    if (binding.shift && !event.shiftKey) {
      return false;
    }

    return true;
  }

  function runKeybindings(event) {
    for (const record of state.core.keybindingRecords) {
      const ctx = getPluginContext(record.pluginId);
      if (!ctx) {
        continue;
      }

      if (typeof record.binding.when === 'function' && !record.binding.when(ctx, event)) {
        continue;
      }

      if (!matchesKeybinding(record.binding, event)) {
        continue;
      }

      const handled = record.binding.run(ctx, event);
      if (handled !== false) {
        return true;
      }
    }

    return false;
  }

  function handleDocumentPointerDown(event) {
    if (state.core.isTemporaryPassthrough && !state.core.isSpacePressed) {
      releaseTemporaryPassthrough();
    }

    if (
      state.core.showQuickMenu &&
      state.core.toolbarHost &&
      !event.composedPath().includes(state.core.toolbarHost)
    ) {
      setQuickMenuVisible(false);
    }

    for (const plugin of getPlugins()) {
      callPluginHook(plugin, 'onDocumentPointerDownCapture', event);
    }
  }

  function handleDocumentPointerUp(event) {
    for (const plugin of getPlugins()) {
      callPluginHook(plugin, 'onDocumentPointerUpCapture', event);
    }
  }

  function handleKeyDown(event) {
    if (!state.core.enabled) {
      return;
    }

    if (
      state.core.isTemporaryPassthrough &&
      !isSpaceShortcut(event) &&
      !state.core.isSpacePressed
    ) {
      releaseTemporaryPassthrough();
    }

    if (
      isSpaceShortcut(event) &&
      state.core.isDrawingMode &&
      !state.core.isTemporaryPassthrough &&
      !hasActiveInteraction() &&
      !isEditableTarget(event.target)
    ) {
      state.core.isSpacePressed = true;
      setTemporaryPassthrough(true);
      event.preventDefault();
      return;
    }

    if (shouldBlockKeybindings(event)) {
      return;
    }

    if (runKeybindings(event)) {
      event.preventDefault();
      return;
    }

    for (const plugin of getPlugins()) {
      const handled = callPluginHook(plugin, 'onKeyDown', event);
      if (handled) {
        event.preventDefault();
        return;
      }
    }
  }

  function handleKeyUp(event) {
    if (!state.core.enabled) {
      return;
    }

    if (isSpaceShortcut(event)) {
      state.core.isSpacePressed = false;
      releaseTemporaryPassthrough();
      event.preventDefault();
      return;
    }

    for (const plugin of getPlugins()) {
      const handled = callPluginHook(plugin, 'onKeyUp', event);
      if (handled) {
        event.preventDefault();
        return;
      }
    }
  }

  function handleResize() {
    if (!state.core.canvas) {
      return;
    }

    state.core.canvas.width = window.innerWidth;
    state.core.canvas.height = window.innerHeight;

    for (const plugin of getPlugins()) {
      callPluginHook(plugin, 'onResize');
    }

    requestRender();
  }

  function installInteractionListeners() {
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    document.addEventListener('pointerup', handleDocumentPointerUp, true);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') {
        forceReleaseTemporaryPassthrough();
      }

      for (const plugin of getPlugins()) {
        callPluginHook(plugin, 'onVisibilityChange', document.visibilityState);
      }
    });
    window.addEventListener('blur', () => {
      forceReleaseTemporaryPassthrough();
      for (const plugin of getPlugins()) {
        callPluginHook(plugin, 'onWindowBlur');
      }
    });
    window.addEventListener('resize', handleResize);
  }

  return {
    updateOverlayInteractionState,
    setTemporaryPassthrough,
    releaseTemporaryPassthrough,
    forceReleaseTemporaryPassthrough,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
    handleCanvasPointerUp,
    installInteractionListeners
  };
}
