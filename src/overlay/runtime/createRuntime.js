import { getIconMarkup } from '../../shared/iconCatalog.js';
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
import { createInteractionRuntime } from './interactionRuntime.js';
import { createNavigationRuntime } from './navigationRuntime.js';
import { createMessageRuntime } from './messageRuntime.js';

export function createBbrushRuntime(featureRecords = []) {
  const state = createRuntimeState();

  let initialized = false;

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
  const interactionRuntime = createInteractionRuntime({
    state,
    getPlugins() {
      return plugins;
    },
    getPluginContext,
    getActiveToolPlugin,
    callPluginHook,
    hasActiveInteraction,
    setQuickMenuVisible,
    requestRender,
    updateCanvasCursor,
    isSpaceShortcut,
    isEditableTarget
  });
  const navigationRuntime = createNavigationRuntime({
    state,
    getPlugins() {
      return plugins;
    },
    callPluginHook,
    releaseTemporaryPassthrough
  });
  const messageRuntime = createMessageRuntime({
    state,
    getPlugins() {
      return plugins;
    },
    callPluginHook,
    enableOverlay,
    disableOverlay,
    toggleDrawingMode,
    undoLastAction,
    clearAll,
    toggleToolbarExpanded
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
    interactionRuntime.updateOverlayInteractionState();
  }

  function releaseTemporaryPassthrough() {
    interactionRuntime.releaseTemporaryPassthrough();
  }

  function forceReleaseTemporaryPassthrough() {
    interactionRuntime.forceReleaseTemporaryPassthrough();
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

  function handleCanvasPointerDown(event) {
    interactionRuntime.handleCanvasPointerDown(event);
  }

  function handleCanvasPointerMove(event) {
    interactionRuntime.handleCanvasPointerMove(event);
  }

  function handleCanvasPointerUp(event) {
    interactionRuntime.handleCanvasPointerUp(event);
  }

  function installListeners() {
    messageRuntime.installMessageListener();
    interactionRuntime.installInteractionListeners();
    navigationRuntime.installNavigationListeners();
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
