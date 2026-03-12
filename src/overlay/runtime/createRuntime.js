import { getIconMarkup } from '../../shared/iconCatalog.js';
import { MESSAGE_TYPES } from '../../shared/messages.js';
import { PLUGIN_IDS } from '../../shared/pluginIds.js';
import { createRuntimeState } from './state.js';
import {
  cloneStrokes,
  getCanvasPoint as getCanvasPointForCanvas,
  getSmoothedPoint,
  distancePointToSegment,
  getAnchorPoints,
  getAnchorCursor,
  measureTextBounds as measureTextBoundsForContext,
  isSpaceShortcut,
  isEditableTarget,
  didPageContextChange
} from './sharedHelpers.js';
import { createPluginRuntime } from './pluginRuntime.js';
import { createSceneRuntime } from './sceneRuntime.js';
import { createRenderRuntime } from './renderRuntime.js';
import { createToolbarRuntime } from './toolbarRuntime.js';

export function createBbrushRuntime(featureRecords = []) {
  const state = createRuntimeState();

  let initialized = false;
  let historyPatched = false;

  function logPluginError(message, details) {
    console.error(`[bbrush] ${message}`, details);
  }

  function resolveIconMarkup(iconKey, sourceLabel) {
    if (typeof iconKey !== 'string' || iconKey.length === 0) {
      logPluginError(`Missing icon key for ${sourceLabel}.`, {
        iconKey,
        sourceLabel
      });
      return '';
    }

    const iconMarkup = getIconMarkup(iconKey);

    if (!iconMarkup) {
      logPluginError(`Missing icon markup for key "${iconKey}" on ${sourceLabel}.`, {
        iconKey,
        sourceLabel
      });
      return '';
    }

    return iconMarkup;
  }

  function getCanvasPoint(event) {
    return getCanvasPointForCanvas(state.core.canvas, event);
  }

  function measureTextBounds(text, fontSize) {
    return measureTextBoundsForContext(state.core.context, text, fontSize);
  }

  function releasePointerCapture(pointerId) {
    if (
      state.core.canvas &&
      typeof pointerId === 'number' &&
      state.core.canvas.hasPointerCapture(pointerId)
    ) {
      state.core.canvas.releasePointerCapture(pointerId);
    }
  }

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

  const pluginRuntime = createPluginRuntime({
    featureRecords,
    state,
    utils: {
      cloneStrokes,
      didPageContextChange,
      distancePointToSegment,
      getAnchorCursor,
      getAnchorPoints,
      getCanvasPoint,
      getSmoothedPoint,
      isEditableTarget,
      isSpaceShortcut,
      measureTextBounds,
      releasePointerCapture
    },
    scene: {
      getActiveScene,
      getSceneForMode
    },
    actions: {
      ensureHistoryInitialized,
      pushHistorySnapshot,
      undoLastAction,
      generateEntryId,
      requestRender,
      updateToolbarState,
      updateCanvasCursor,
      updateOverlayInteractionState,
      setActiveTool,
      setDrawingMode,
      setCanvasMode,
      toggleCanvasMode,
      clearSelection,
      clearAll,
      setToolbarExpanded,
      toggleToolbarExpanded,
      setQuickMenuVisible,
      toggleShortcuts,
      adjustActiveSize
    },
    logPluginError
  });
  const { plugins } = pluginRuntime;
  const sceneRuntime = createSceneRuntime({
    state,
    cloneStrokes,
    getPlugins() {
      return plugins;
    },
    callPluginHook,
    notifySceneChanged,
    requestRender
  });
  const renderRuntime = createRenderRuntime({
    state,
    getPlugins() {
      return plugins;
    },
    getActiveScene,
    getEntryOwner,
    getActiveToolPlugin,
    getPluginContext,
    callPluginHook
  });
  const toolbarRuntime = createToolbarRuntime({
    state,
    getActiveToolPlugin,
    getPluginContext,
    resolveIconMarkup,
    updateOverlayInteractionState,
    toggleDrawingMode
  });

  function getSceneForMode(mode) {
    return sceneRuntime.getSceneForMode(mode);
  }

  function getActiveScene() {
    return sceneRuntime.getActiveScene();
  }

  function ensureHistoryInitialized(scene = getActiveScene()) {
    sceneRuntime.ensureHistoryInitialized(scene);
  }

  function pushHistorySnapshot(scene = getActiveScene()) {
    sceneRuntime.pushHistorySnapshot(scene);
  }

  function recomputeNextEntryId() {
    sceneRuntime.recomputeNextEntryId();
  }

  function generateEntryId() {
    return sceneRuntime.generateEntryId();
  }

  function getPlugin(pluginId) {
    return pluginRuntime.getPlugin(pluginId);
  }

  function getPluginContext(pluginId) {
    return pluginRuntime.getPluginContext(pluginId);
  }

  function getActiveToolPlugin() {
    return pluginRuntime.getActiveToolPlugin();
  }

  function getEntryOwner(entry) {
    return pluginRuntime.getEntryOwner(entry);
  }

  function callPluginHook(plugin, hookName, payload) {
    return pluginRuntime.callPluginHook(plugin, hookName, payload);
  }

  function initializePlugins() {
    pluginRuntime.initializePlugins();
  }

  function hasActiveInteraction() {
    return pluginRuntime.hasActiveInteraction();
  }

  function clearSelection(options = {}) {
    return pluginRuntime.clearSelection(options);
  }

  function notifySceneChanged(reason) {
    pluginRuntime.notifySceneChanged(reason);
  }

  function requestRender() {
    renderRuntime.requestRender();
  }

  function updateCanvasCursor(pointerPoint) {
    renderRuntime.updateCanvasCursor(pointerPoint);
  }

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

  function updateToolbarState() {
    toolbarRuntime.updateToolbarState();
  }

  function setToolbarExpanded(expanded) {
    toolbarRuntime.setToolbarExpanded(expanded);
  }

  function toggleToolbarExpanded() {
    toolbarRuntime.toggleToolbarExpanded();
  }

  function setQuickMenuVisible(visible) {
    toolbarRuntime.setQuickMenuVisible(visible);
  }

  function toggleShortcuts() {
    toolbarRuntime.toggleShortcuts();
  }

  function setDrawingMode(active) {
    if (!state.core.canvas) {
      return;
    }

    state.core.isDrawingMode = active;

    for (const plugin of plugins) {
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

    for (const plugin of plugins) {
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

  function undoLastAction() {
    return sceneRuntime.undoLastAction();
  }

  function clearAll() {
    return sceneRuntime.clearAll();
  }

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

  function createToolbar() {
    toolbarRuntime.createToolbar();
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
    return plugins.some((plugin) => {
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
      const plugin = getPlugin(record.pluginId);
      const ctx = getPluginContext(record.pluginId);
      if (!plugin || !ctx) {
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

    for (const plugin of plugins) {
      callPluginHook(plugin, 'onDocumentPointerDownCapture', event);
    }
  }

  function handleDocumentPointerUp(event) {
    for (const plugin of plugins) {
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

    for (const plugin of plugins) {
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

    for (const plugin of plugins) {
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

    for (const plugin of plugins) {
      callPluginHook(plugin, 'onResize');
    }

    requestRender();
  }

  function handleLocationChange() {
    const nextHref = window.location.href;

    if (!state.core.enabled) {
      state.core.lastLocationHref = nextHref;
      return;
    }

    if (state.core.lastLocationHref === nextHref) {
      return;
    }

    const previousHref = state.core.lastLocationHref;
    state.core.lastLocationHref = nextHref;

    if (!state.core.isSpacePressed) {
      releaseTemporaryPassthrough();
    }

    for (const plugin of plugins) {
      callPluginHook(plugin, 'onLocationChange', {
        previousHref,
        nextHref
      });
    }
  }

  function patchHistory() {
    if (historyPatched) {
      return;
    }

    historyPatched = true;
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function pushStateOverride(...args) {
      const result = originalPushState.apply(this, args);
      handleLocationChange();
      return result;
    };

    history.replaceState = function replaceStateOverride(...args) {
      const result = originalReplaceState.apply(this, args);
      handleLocationChange();
      return result;
    };
  }

  function handleRuntimeMessage(message, _sender, sendResponse) {
    if (!message || typeof message.type !== 'string') {
      return;
    }

    if (message.type === MESSAGE_TYPES.ENABLE_OVERLAY) {
      enableOverlay(Boolean(message.drawingMode));
      sendResponse({ ok: true });
      return;
    }

    if (message.type === MESSAGE_TYPES.DISABLE_OVERLAY) {
      disableOverlay();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === MESSAGE_TYPES.TOGGLE_DRAWING_MODE) {
      sendResponse({ ok: true, drawingMode: toggleDrawingMode() });
      return;
    }

    if (message.type === MESSAGE_TYPES.UNDO) {
      sendResponse({ ok: true, changed: undoLastAction() });
      return;
    }

    if (message.type === MESSAGE_TYPES.CLEAR_ALL) {
      clearAll();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === MESSAGE_TYPES.TOGGLE_PANEL) {
      toggleToolbarExpanded();
      sendResponse({ ok: true, expanded: state.core.isToolbarExpanded });
      return;
    }

    if (message.type === MESSAGE_TYPES.GET_STATUS) {
      sendResponse({
        ok: true,
        overlayEnabled: state.core.enabled,
        drawingMode: state.core.isDrawingMode
      });
      return;
    }

    for (const plugin of plugins) {
      const response = callPluginHook(plugin, 'onMessage', message);
      if (response !== undefined) {
        sendResponse(response);
        return;
      }
    }
  }

  function installListeners() {
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    document.addEventListener('pointerup', handleDocumentPointerUp, true);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') {
        forceReleaseTemporaryPassthrough();
      }

      for (const plugin of plugins) {
        callPluginHook(plugin, 'onVisibilityChange', document.visibilityState);
      }
    });
    window.addEventListener('blur', () => {
      forceReleaseTemporaryPassthrough();
      for (const plugin of plugins) {
        callPluginHook(plugin, 'onWindowBlur');
      }
    });
    window.addEventListener('hashchange', handleLocationChange);
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('resize', handleResize);
    patchHistory();
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

    for (const plugin of plugins) {
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

    for (const plugin of plugins) {
      callPluginHook(plugin, 'onOverlayDisable');
    }

    updateToolbarState();
  }

  function toggleDrawingMode() {
    if (!state.core.enabled) {
      return false;
    }

    setDrawingMode(!state.core.isDrawingMode);
    return state.core.isDrawingMode;
  }

  const runtimeApi = {
    get initialized() {
      return initialized;
    },
    state,
    init() {
      if (initialized) {
        return runtimeApi;
      }

      initializePlugins();
      installListeners();
      window.__BBRUSH__ = {
        enableOverlay,
        disableOverlay
      };
      initialized = true;
      return runtimeApi;
    },
    enableOverlay,
    disableOverlay
  };

  return runtimeApi;
}
