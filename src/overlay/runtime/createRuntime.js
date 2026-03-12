import { getIconMarkup } from '../../shared/iconCatalog.js';
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
import { createModeRuntime } from './modeRuntime.js';
import { createOverlayLifecycle } from './overlayLifecycle.js';

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
  const modeRuntime = createModeRuntime({
    state,
    getPlugins() {
      return plugins;
    },
    getPlugin,
    callPluginHook,
    ensureHistoryInitialized,
    getActiveScene,
    recomputeNextEntryId,
    clearSelection,
    requestRender,
    updateOverlayInteractionState,
    updateToolbarState
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
  const overlayLifecycle = createOverlayLifecycle({
    state,
    getPlugins() {
      return plugins;
    },
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
    modeRuntime.setDrawingMode(active);
  }

  function setCanvasMode(mode, options = {}) {
    modeRuntime.setCanvasMode(mode, options);
  }

  function toggleCanvasMode() {
    modeRuntime.toggleCanvasMode();
  }

  function setActiveTool(pluginId, options = {}) {
    modeRuntime.setActiveTool(pluginId, options);
  }

  function undoLastAction() {
    return sceneRuntime.undoLastAction();
  }

  function clearAll() {
    return sceneRuntime.clearAll();
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
    overlayLifecycle.enableOverlay(startDrawingMode);
  }

  function disableOverlay() {
    overlayLifecycle.disableOverlay();
  }

  function toggleDrawingMode() {
    return modeRuntime.toggleDrawingMode();
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
