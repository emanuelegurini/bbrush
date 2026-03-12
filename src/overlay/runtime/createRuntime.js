import { getIconMarkup, ICON_KEYS } from '../../shared/iconCatalog.js';
import { MESSAGE_TYPES } from '../../shared/messages.js';
import { PLUGIN_IDS } from '../../shared/pluginIds.js';

const ANCHOR_SIZE = 10;
const MIN_TEXT_SIZE = 10;
const MAX_HISTORY_ENTRIES = 100;
const STATIC_PLUGIN_MANIFEST_KEYS = new Set([
  'id',
  'kind',
  'order',
  'launcherLabel',
  'entryTypes',
  'usesCanvasPointerEvents',
  'toolbarItems',
  'quickActions',
  'shortcutItems',
  'keybindings'
]);
const DESCRIPTOR_HANDLER_KEYS = {
  toolbarItems: ['onClick', 'getTitle', 'isActive', 'isDisabled'],
  quickActions: ['onClick', 'getTitle', 'isActive', 'isDisabled'],
  keybindings: ['when', 'run']
};

function sortByOrder(left, right) {
  const leftOrder = typeof left.order === 'number' ? left.order : 0;
  const rightOrder = typeof right.order === 'number' ? right.order : 0;

  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  const leftId = typeof left.id === 'string' ? left.id : '';
  const rightId = typeof right.id === 'string' ? right.id : '';
  return leftId.localeCompare(rightId);
}

export function createBbrushRuntime(featureRecords = []) {
  const state = {
    core: {
      enabled: false,
      isDrawingMode: false,
      canvasMode: 'page',
      activeToolId: typeof PLUGIN_IDS.BRUSH === 'string' ? PLUGIN_IDS.BRUSH : 'brush',
      canvas: null,
      context: null,
      toolbarHost: null,
      toolbarShadowRoot: null,
      toolbarElements: null,
      isToolbarExpanded: false,
      isSizeExpanded: false,
      showQuickMenu: false,
      showShortcuts: false,
      isDraggingToolbar: false,
      isDraggingLauncher: false,
      dragOffsetX: 0,
      dragOffsetY: 0,
      launcherDragStartX: 0,
      launcherDragStartY: 0,
      launcherPointerId: null,
      suppressNextLauncherClick: false,
      isSpacePressed: false,
      isTemporaryPassthrough: false,
      lastLocationHref: window.location.href,
      registeredPlugins: [],
      toolbarButtonRecords: [],
      quickActionRecords: [],
      shortcutLines: [],
      keybindingRecords: [],
      entryTypeOwners: {}
    },
    shared: {
      pageScene: { strokes: [], history: [] },
      whiteboardScene: { strokes: [], history: [] },
      nextEntryId: 1,
      brushColor: '#ff00bb',
      penSize: 4,
      textSize: 18
    },
    plugins: {}
  };

  const plugins = [];
  const pluginsById = new Map();
  const pluginContexts = new Map();
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

  function getPlugin(pluginId) {
    return pluginsById.get(pluginId) || null;
  }

  function getPluginContext(pluginId) {
    return pluginContexts.get(pluginId) || null;
  }

  function getActiveToolPlugin() {
    return getPlugin(state.core.activeToolId);
  }

  function getSceneForMode(mode) {
    return mode === 'whiteboard' ? state.shared.whiteboardScene : state.shared.pageScene;
  }

  function getActiveScene() {
    return getSceneForMode(state.core.canvasMode);
  }

  function cloneStrokes(strokes) {
    return JSON.parse(JSON.stringify(strokes));
  }

  function ensureHistoryInitialized(scene = getActiveScene()) {
    if (scene.history.length === 0) {
      scene.history.push(cloneStrokes(scene.strokes));
    }
  }

  function pushHistorySnapshot(scene = getActiveScene()) {
    ensureHistoryInitialized(scene);
    scene.history.push(cloneStrokes(scene.strokes));

    if (scene.history.length > MAX_HISTORY_ENTRIES) {
      scene.history.shift();
    }
  }

  function recomputeNextEntryId() {
    let maxId = 0;

    for (const scene of [state.shared.pageScene, state.shared.whiteboardScene]) {
      for (const entry of scene.strokes) {
        if (typeof entry.id === 'number' && entry.id > maxId) {
          maxId = entry.id;
        }
      }
    }

    state.shared.nextEntryId = maxId + 1;
  }

  function generateEntryId() {
    const entryId = state.shared.nextEntryId;
    state.shared.nextEntryId += 1;
    return entryId;
  }

  function getCanvasPoint(event) {
    const rect = state.core.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function getSmoothedPoint(rawPoint, points) {
    const sampleSize = 3;
    const recentPoints = points.slice(-(sampleSize - 1));
    const samples = [...recentPoints, rawPoint];
    const totals = samples.reduce(
      (accumulator, point) => {
        return {
          x: accumulator.x + point.x,
          y: accumulator.y + point.y
        };
      },
      { x: 0, y: 0 }
    );

    return {
      x: totals.x / samples.length,
      y: totals.y / samples.length
    };
  }

  function distancePointToSegment(point, segmentStart, segmentEnd) {
    const segX = segmentEnd.x - segmentStart.x;
    const segY = segmentEnd.y - segmentStart.y;
    const segLenSq = segX * segX + segY * segY;

    if (segLenSq === 0) {
      return Math.hypot(point.x - segmentStart.x, point.y - segmentStart.y);
    }

    let t = ((point.x - segmentStart.x) * segX + (point.y - segmentStart.y) * segY) / segLenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = segmentStart.x + t * segX;
    const projY = segmentStart.y + t * segY;
    return Math.hypot(point.x - projX, point.y - projY);
  }

  function getAnchorPoints(bounds) {
    return {
      nw: { x: bounds.left, y: bounds.top },
      n: { x: bounds.left + bounds.width / 2, y: bounds.top },
      ne: { x: bounds.right, y: bounds.top },
      e: { x: bounds.right, y: bounds.top + bounds.height / 2 },
      se: { x: bounds.right, y: bounds.bottom },
      s: { x: bounds.left + bounds.width / 2, y: bounds.bottom },
      sw: { x: bounds.left, y: bounds.bottom },
      w: { x: bounds.left, y: bounds.top + bounds.height / 2 }
    };
  }

  function getAnchorCursor(anchor) {
    if (anchor === 'n' || anchor === 's') {
      return 'ns-resize';
    }

    if (anchor === 'e' || anchor === 'w') {
      return 'ew-resize';
    }

    if (anchor === 'nw' || anchor === 'se') {
      return 'nwse-resize';
    }

    return 'nesw-resize';
  }

  function measureTextBounds(text, fontSize) {
    if (!state.core.context) {
      return { width: 0, height: fontSize };
    }

    state.core.context.font = `${fontSize}px Arial, sans-serif`;
    const metrics = state.core.context.measureText(text);
    const width = Math.max(1, metrics.width);
    const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.8;
    const descent = metrics.actualBoundingBoxDescent || fontSize * 0.2;

    return {
      width,
      height: Math.max(fontSize, ascent + descent)
    };
  }

  function isSpaceShortcut(event) {
    return event.code === 'Space' || event.key === ' ';
  }

  function isEditableTarget(target) {
    if (!target || !(target instanceof Element)) {
      return false;
    }

    if (target.isContentEditable) {
      return true;
    }

    return (
      target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
    );
  }

  function didPageContextChange(previousHref, nextHref) {
    if (!previousHref || !nextHref) {
      return false;
    }

    try {
      const previousUrl = new URL(previousHref);
      const nextUrl = new URL(nextHref);
      return (
        previousUrl.origin !== nextUrl.origin ||
        previousUrl.pathname !== nextUrl.pathname ||
        previousUrl.search !== nextUrl.search
      );
    } catch {
      return previousHref !== nextHref;
    }
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

  function getEntryOwner(entry) {
    if (!entry || typeof entry.type !== 'string') {
      return null;
    }

    const ownerId = state.core.entryTypeOwners[entry.type];
    return ownerId ? getPlugin(ownerId) : null;
  }

  function createPluginContext(pluginId) {
    const ctx = {
      constants: {
        ANCHOR_SIZE,
        MIN_TEXT_SIZE
      },
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
        getActive() {
          return getActiveScene();
        },
        getEntries() {
          return getActiveScene().strokes;
        },
        getHistory() {
          return getActiveScene().history;
        },
        getScene(mode) {
          return getSceneForMode(mode);
        },
        findEntryById(id, type) {
          return (
            getActiveScene().strokes.find((entry) => {
              if (typeof id === 'number' && entry.id !== id) {
                return false;
              }

              if (type && entry.type !== type) {
                return false;
              }

              return true;
            }) || null
          );
        }
      },
      history: {
        ensureInitialized() {
          ensureHistoryInitialized();
        },
        pushSnapshot() {
          pushHistorySnapshot();
        },
        undo() {
          return undoLastAction();
        }
      },
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
      getEntryOwner
    };

    Object.defineProperties(ctx, {
      core: {
        get() {
          return state.core;
        }
      },
      shared: {
        get() {
          return state.shared;
        }
      },
      pluginState: {
        get() {
          return state.plugins[pluginId];
        }
      }
    });

    return ctx;
  }

  function callPluginHook(plugin, hookName, payload) {
    if (!plugin || typeof plugin[hookName] !== 'function') {
      return undefined;
    }

    return plugin[hookName](getPluginContext(plugin.id), payload);
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

  const builtInHandlers = {
    activateTool(ctx, _payload, reference) {
      ctx.setActiveTool(reference.descriptor.targetToolId || reference.pluginId);
      return true;
    },
    adjustActiveSize(_ctx, _payload, reference) {
      return adjustActiveSize(Number(reference.descriptor.sizeDelta));
    },
    canUseDrawingShortcut(ctx) {
      return ctx.core.enabled && ctx.core.isDrawingMode && !ctx.core.isTemporaryPassthrough;
    },
    clearAll(ctx, _payload, reference) {
      ctx.clearAll();

      if (reference.descriptor.closeQuickMenu) {
        ctx.setQuickMenuVisible(false);
      }

      return true;
    },
    clearSelection(ctx, _payload, reference) {
      return ctx.clearSelection({
        reason: reference.descriptor.reason || reference.descriptor.id || 'clear-selection'
      });
    },
    isActiveTool(ctx, _payload, reference) {
      return ctx.core.activeToolId === (reference.descriptor.targetToolId || reference.pluginId);
    },
    isDrawingDisabled(ctx) {
      return !ctx.core.isDrawingMode;
    },
    isEnabled(ctx) {
      return ctx.core.enabled;
    },
    isWhiteboardMode(ctx) {
      return ctx.core.canvasMode === 'whiteboard';
    },
    openPanel(ctx) {
      ctx.setQuickMenuVisible(false);
      ctx.setToolbarExpanded(true);
      return true;
    },
    toggleCanvasMode(ctx) {
      ctx.toggleCanvasMode();
      return true;
    },
    toggleShortcuts(ctx) {
      ctx.toggleShortcuts();
      return true;
    },
    undoHistory(ctx, _payload, reference) {
      const changed = ctx.history.undo();

      if (reference.descriptor.closeQuickMenu) {
        ctx.setQuickMenuVisible(false);
      }

      return changed;
    }
  };

  function resolveHandlerReference(pluginId, descriptorType, descriptor, propertyName, handlers) {
    const reference = descriptor[propertyName];
    if (reference === undefined || reference === null) {
      return {
        ok: true,
        value: reference
      };
    }

    if (typeof reference === 'function') {
      return {
        ok: true,
        value: reference
      };
    }

    if (typeof reference !== 'string') {
      logPluginError(
        `Invalid ${descriptorType}.${propertyName} reference for plugin "${pluginId}".`,
        descriptor
      );
      return {
        ok: false,
        value: null
      };
    }

    const pluginHandler =
      handlers && typeof handlers[reference] === 'function' ? handlers[reference] : null;
    const builtInHandler =
      !pluginHandler && typeof builtInHandlers[reference] === 'function'
        ? builtInHandlers[reference]
        : null;
    const resolvedHandler = pluginHandler || builtInHandler;

    if (!resolvedHandler) {
      logPluginError(
        `Missing handler "${reference}" for ${descriptorType} on plugin "${pluginId}".`,
        descriptor
      );
      return {
        ok: false,
        value: null
      };
    }

    return {
      ok: true,
      value(ctx, payload) {
        return resolvedHandler(ctx, payload, {
          pluginId,
          descriptorType,
          propertyName,
          descriptor
        });
      }
    };
  }

  function resolveDescriptorList(pluginId, descriptorType, descriptors, handlers) {
    const handlerKeys = DESCRIPTOR_HANDLER_KEYS[descriptorType] || [];
    const resolvedDescriptors = [];

    for (const descriptor of descriptors) {
      if (!descriptor || typeof descriptor !== 'object') {
        logPluginError(
          `Invalid ${descriptorType} descriptor for plugin "${pluginId}".`,
          descriptor
        );
        continue;
      }

      const resolvedDescriptor = { ...descriptor };
      let isValid = true;

      for (const handlerKey of handlerKeys) {
        if (resolvedDescriptor[handlerKey] === undefined) {
          continue;
        }

        const resolution = resolveHandlerReference(
          pluginId,
          descriptorType,
          descriptor,
          handlerKey,
          handlers
        );

        if (!resolution.ok) {
          isValid = false;
          break;
        }

        resolvedDescriptor[handlerKey] = resolution.value;
      }

      if (!isValid) {
        continue;
      }

      resolvedDescriptors.push(resolvedDescriptor);
    }

    return resolvedDescriptors;
  }

  function composePluginDefinition(manifestEntry, implementation) {
    if (!manifestEntry || typeof manifestEntry.id !== 'string') {
      return null;
    }

    const pluginId = manifestEntry.id;
    const handlers =
      implementation && implementation.handlers && typeof implementation.handlers === 'object'
        ? implementation.handlers
        : {};
    const pluginDefinition = {
      ...manifestEntry,
      toolbarItems: resolveDescriptorList(
        pluginId,
        'toolbarItems',
        Array.isArray(manifestEntry.toolbarItems) ? manifestEntry.toolbarItems : [],
        handlers
      ),
      quickActions: resolveDescriptorList(
        pluginId,
        'quickActions',
        Array.isArray(manifestEntry.quickActions) ? manifestEntry.quickActions : [],
        handlers
      ),
      keybindings: resolveDescriptorList(
        pluginId,
        'keybindings',
        Array.isArray(manifestEntry.keybindings) ? manifestEntry.keybindings : [],
        handlers
      ),
      shortcutItems: Array.isArray(manifestEntry.shortcutItems) ? manifestEntry.shortcutItems : []
    };

    for (const [key, value] of Object.entries(implementation || {})) {
      if (key === 'handlers') {
        continue;
      }

      if (STATIC_PLUGIN_MANIFEST_KEYS.has(key)) {
        logPluginError(
          `Plugin "${pluginId}" attempted to redefine static manifest key "${key}".`,
          value
        );
        continue;
      }

      pluginDefinition[key] = value;
    }

    return pluginDefinition;
  }

  function collectPluginDescriptors() {
    state.core.toolbarButtonRecords = [];
    state.core.quickActionRecords = [];
    state.core.shortcutLines = [];
    state.core.keybindingRecords = [];
    state.core.entryTypeOwners = {};

    for (const plugin of plugins) {
      const toolbarItems = Array.isArray(plugin.toolbarItems) ? plugin.toolbarItems : [];
      const quickActions = Array.isArray(plugin.quickActions) ? plugin.quickActions : [];
      const shortcutItems = Array.isArray(plugin.shortcutItems) ? plugin.shortcutItems : [];
      const keybindings = Array.isArray(plugin.keybindings) ? plugin.keybindings : [];
      const entryTypes = Array.isArray(plugin.entryTypes) ? plugin.entryTypes : [];

      for (const toolbarItem of toolbarItems) {
        state.core.toolbarButtonRecords.push({
          pluginId: plugin.id,
          descriptor: {
            ...toolbarItem,
            order: typeof toolbarItem.order === 'number' ? toolbarItem.order : plugin.order
          },
          button: null
        });
      }

      for (const quickAction of quickActions) {
        state.core.quickActionRecords.push({
          pluginId: plugin.id,
          descriptor: {
            ...quickAction,
            order: typeof quickAction.order === 'number' ? quickAction.order : plugin.order
          },
          button: null
        });
      }

      for (const shortcutItem of shortcutItems) {
        const shortcutText =
          typeof shortcutItem === 'string'
            ? shortcutItem
            : typeof shortcutItem.text === 'string'
              ? shortcutItem.text
              : '';

        if (!shortcutText) {
          continue;
        }

        state.core.shortcutLines.push({
          pluginId: plugin.id,
          order: typeof shortcutItem.order === 'number' ? shortcutItem.order : plugin.order,
          text: shortcutText
        });
      }

      for (const keybinding of keybindings) {
        state.core.keybindingRecords.push({
          pluginId: plugin.id,
          binding: keybinding,
          order: typeof keybinding.order === 'number' ? keybinding.order : plugin.order
        });
      }

      for (const entryType of entryTypes) {
        state.core.entryTypeOwners[entryType] = plugin.id;
      }
    }

    state.core.toolbarButtonRecords.sort((left, right) => {
      return sortByOrder(left.descriptor, right.descriptor);
    });
    state.core.quickActionRecords.sort((left, right) => {
      return sortByOrder(left.descriptor, right.descriptor);
    });
    state.core.shortcutLines.sort(sortByOrder);
    state.core.keybindingRecords.sort(sortByOrder);
  }

  function initializePlugins() {
    const normalizedRecords = Array.isArray(featureRecords) ? featureRecords.slice() : [];
    normalizedRecords.sort((left, right) => {
      return sortByOrder(
        left && left.manifestEntry ? left.manifestEntry : {},
        right && right.manifestEntry ? right.manifestEntry : {}
      );
    });

    plugins.length = 0;
    pluginsById.clear();
    pluginContexts.clear();

    for (const record of normalizedRecords) {
      const manifestEntry = record && record.manifestEntry;
      const implementation = record && record.implementation;

      if (!manifestEntry || typeof manifestEntry.id !== 'string') {
        logPluginError('Skipping feature because no valid manifest entry was provided.', record);
        continue;
      }

      if (!implementation || typeof implementation !== 'object') {
        logPluginError(
          `Skipping plugin "${manifestEntry.id}" because no implementation was imported.`,
          record
        );
        continue;
      }

      const definition = composePluginDefinition(manifestEntry, implementation);
      if (!definition) {
        logPluginError(`Skipping plugin "${manifestEntry.id}" because composition failed.`, {
          manifestEntry,
          implementation
        });
        continue;
      }

      plugins.push(definition);
      pluginsById.set(definition.id, definition);
      state.plugins[definition.id] = {};
    }

    for (const plugin of plugins) {
      const ctx = createPluginContext(plugin.id);
      pluginContexts.set(plugin.id, ctx);
      const initialState = typeof plugin.setup === 'function' ? plugin.setup(ctx) : {};
      state.plugins[plugin.id] =
        initialState && typeof initialState === 'object' ? initialState : {};
    }

    state.core.registeredPlugins = plugins.map((plugin) => plugin.id);
    collectPluginDescriptors();
  }

  function hasActiveInteraction() {
    return plugins.some((plugin) => {
      if (typeof plugin.isInteracting !== 'function') {
        return false;
      }

      return Boolean(plugin.isInteracting(getPluginContext(plugin.id)));
    });
  }

  function clearSelection(options = {}) {
    let changed = false;

    for (const plugin of plugins) {
      if (plugin.id === options.exceptPluginId) {
        continue;
      }

      if (typeof plugin.clearSelection !== 'function') {
        continue;
      }

      if (plugin.clearSelection(getPluginContext(plugin.id), options)) {
        changed = true;
      }
    }

    if (changed && options.render !== false) {
      requestRender();
    }

    return changed;
  }

  function notifySceneChanged(reason) {
    for (const plugin of plugins) {
      callPluginHook(plugin, 'onSceneChanged', { reason });
    }
  }

  function requestRender() {
    replayStrokes();
  }

  function getActiveSizeConfig() {
    if (state.core.activeToolId === PLUGIN_IDS.TEXT) {
      return {
        label: 'Text size',
        min: 12,
        max: 96,
        value: state.shared.textSize
      };
    }

    if (state.core.activeToolId === PLUGIN_IDS.ERASER) {
      return {
        label: 'Eraser size',
        min: 1,
        max: 24,
        value: state.shared.penSize
      };
    }

    return {
      label: 'Pen size',
      min: 1,
      max: 24,
      value: state.shared.penSize
    };
  }

  function getLauncherToolLabel() {
    if (state.core.canvasMode === 'whiteboard') {
      return 'WB';
    }

    const activePlugin = getActiveToolPlugin();
    if (!activePlugin || typeof activePlugin.launcherLabel !== 'string') {
      return 'P';
    }

    return activePlugin.launcherLabel;
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

  function applyDynamicButtonState(records) {
    for (const record of records) {
      if (!record.button) {
        continue;
      }

      const plugin = getPlugin(record.pluginId);
      const ctx = getPluginContext(record.pluginId);
      if (!plugin || !ctx) {
        continue;
      }

      const { descriptor } = record;
      const isActive = typeof descriptor.isActive === 'function' && descriptor.isActive(ctx);
      const isDisabled = typeof descriptor.isDisabled === 'function' && descriptor.isDisabled(ctx);

      record.button.classList.toggle('is-active', Boolean(isActive));
      record.button.disabled = Boolean(isDisabled);

      if (typeof descriptor.getTitle === 'function') {
        record.button.title = descriptor.getTitle(ctx);
      }
    }
  }

  function updateToolbarState() {
    if (!state.core.toolbarElements) {
      return;
    }

    if (!state.core.isDrawingMode) {
      state.core.isSizeExpanded = false;
      state.core.showShortcuts = false;
      state.core.showQuickMenu = false;
      state.core.isToolbarExpanded = false;
    }

    const { toolbarElements } = state.core;
    const sizeConfig = getActiveSizeConfig();

    toolbarElements.quickMenu.classList.toggle('is-open', state.core.showQuickMenu);
    toolbarElements.quickMenu.hidden = !state.core.showQuickMenu;
    toolbarElements.panel.classList.toggle('is-open', state.core.isToolbarExpanded);
    toolbarElements.panel.hidden = !state.core.isToolbarExpanded;
    toolbarElements.shortcutsPanel.classList.toggle('is-open', state.core.showShortcuts);
    toolbarElements.sizeField.classList.toggle('is-expanded', state.core.isSizeExpanded);
    toolbarElements.sizeToggle.classList.toggle('is-active', state.core.isSizeExpanded);
    toolbarElements.toolbar.classList.toggle('is-drawing', state.core.isDrawingMode);
    toolbarElements.launcher.classList.toggle('is-annotating', state.core.isDrawingMode);
    toolbarElements.launcherTool.textContent = getLauncherToolLabel();
    toolbarElements.launcher.style.borderColor = state.shared.brushColor;
    toolbarElements.launcher.style.boxShadow = state.core.isDrawingMode
      ? `0 0 0 3px ${state.shared.brushColor}55, 0 10px 24px rgba(0, 0, 0, 0.26)`
      : '0 10px 24px rgba(0, 0, 0, 0.26)';
    toolbarElements.annotateToggleButton.classList.toggle('is-active', state.core.isDrawingMode);
    toolbarElements.annotateToggleButton.title = state.core.isDrawingMode
      ? 'Disable annotation'
      : 'Enable annotation';
    toolbarElements.sizeToggle.title = state.core.isSizeExpanded ? 'Hide size' : 'Show size';
    toolbarElements.sizeLabel.textContent = sizeConfig.label;
    toolbarElements.sizeInput.min = String(sizeConfig.min);
    toolbarElements.sizeInput.max = String(sizeConfig.max);
    toolbarElements.sizeInput.value = String(sizeConfig.value);
    toolbarElements.colorInput.value = state.shared.brushColor;
    toolbarElements.colorInput.disabled = !state.core.isDrawingMode;
    toolbarElements.sizeToggle.disabled = !state.core.isDrawingMode;
    toolbarElements.sizeInput.disabled = !state.core.isDrawingMode;

    applyDynamicButtonState(state.core.toolbarButtonRecords);
    applyDynamicButtonState(state.core.quickActionRecords);

    if (state.core.canvas) {
      state.core.canvas.style.boxShadow = state.core.isDrawingMode
        ? 'inset 0 0 0 2px rgba(23, 98, 166, 0.9)'
        : 'none';
    }

    updateOverlayInteractionState();
  }

  function setToolbarExpanded(expanded) {
    state.core.isToolbarExpanded = expanded;

    if (!expanded) {
      state.core.showShortcuts = false;
    }

    updateToolbarState();
  }

  function toggleToolbarExpanded() {
    setToolbarExpanded(!state.core.isToolbarExpanded);
  }

  function setQuickMenuVisible(visible) {
    state.core.showQuickMenu = visible;
    updateToolbarState();
  }

  function toggleShortcuts() {
    state.core.showShortcuts = !state.core.showShortcuts;

    if (state.core.showShortcuts) {
      state.core.isToolbarExpanded = true;
    }

    updateToolbarState();
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
    const scene = getActiveScene();
    ensureHistoryInitialized(scene);

    if (scene.history.length <= 1) {
      return false;
    }

    scene.history.pop();
    const previousSnapshot = cloneStrokes(scene.history[scene.history.length - 1]);
    scene.strokes.length = 0;
    scene.strokes.push(...previousSnapshot);
    recomputeNextEntryId();
    notifySceneChanged('undo');
    requestRender();
    return true;
  }

  function clearAll() {
    const scene = getActiveScene();
    const hasSceneEntries = scene.strokes.length > 0;
    let didChange = false;

    if (hasSceneEntries) {
      scene.strokes.length = 0;
      pushHistorySnapshot(scene);
      didChange = true;
    }

    for (const plugin of plugins) {
      const didPluginChange = callPluginHook(plugin, 'onClearAll', {
        canvasMode: state.core.canvasMode
      });

      if (didPluginChange) {
        didChange = true;
      }
    }

    if (!didChange) {
      return false;
    }

    recomputeNextEntryId();
    notifySceneChanged('clear');
    requestRender();
    return true;
  }

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

    for (const plugin of plugins) {
      callPluginHook(plugin, 'onRenderOverlay');
    }
  }

  function buildIconButton(descriptor) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bbrush-icon-button';
    button.setAttribute('aria-label', descriptor.ariaLabel || '');
    button.title = descriptor.title || '';
    button.innerHTML = resolveIconMarkup(
      descriptor.iconKey,
      `toolbar item "${descriptor.id || 'unknown'}"`
    );
    return button;
  }

  function buildQuickActionButton(descriptor) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = descriptor.label || '';
    return button;
  }

  function populateToolbarUi(shadowRoot) {
    const dynamicButtonsRoot = shadowRoot.querySelector('[data-role="dynamic-buttons"]');
    const quickMenu = shadowRoot.querySelector('[data-role="quick-menu"]');
    const shortcutsPanel = shadowRoot.querySelector('[data-role="shortcuts-panel"]');

    for (const record of state.core.toolbarButtonRecords) {
      const button = buildIconButton(record.descriptor);
      button.addEventListener('click', (event) => {
        const ctx = getPluginContext(record.pluginId);
        if (!ctx || typeof record.descriptor.onClick !== 'function') {
          return;
        }

        record.descriptor.onClick(ctx, event);
      });
      dynamicButtonsRoot.appendChild(button);
      record.button = button;
    }

    for (const record of state.core.quickActionRecords) {
      const button = buildQuickActionButton(record.descriptor);
      button.addEventListener('click', (event) => {
        const ctx = getPluginContext(record.pluginId);
        if (!ctx || typeof record.descriptor.onClick !== 'function') {
          return;
        }

        record.descriptor.onClick(ctx, event);
      });
      quickMenu.appendChild(button);
      record.button = button;
    }

    for (const shortcutLine of state.core.shortcutLines) {
      const line = document.createElement('span');
      line.textContent = shortcutLine.text;
      shortcutsPanel.appendChild(line);
    }
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
    if (state.core.toolbarHost) {
      return;
    }

    const host = document.createElement('div');
    host.id = 'bbrush-toolbar-host';
    host.style.left = '24px';
    host.style.position = 'fixed';
    host.style.top = '24px';
    host.style.zIndex = '2147483647';
    host.style.display = 'none';
    host.style.visibility = 'hidden';

    const shadowRoot = host.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `
        <div class="bbrush-launcher-wrap">
          <button class="bbrush-launcher" data-role="launcher" title="Open bbrush panel">
            <span class="bbrush-launcher-label">BB</span>
            <span class="bbrush-launcher-tool" data-role="launcher-tool">P</span>
          </button>
          <div class="bbrush-quick-menu" data-role="quick-menu" hidden></div>
        </div>
        <div class="bbrush-panel" data-role="panel" hidden>
          <div class="bbrush-toolbar">
            <div class="bbrush-toolbar-handle" data-role="drag">bbrush</div>
            <button class="bbrush-icon-button" data-role="annotate-toggle" aria-label="Toggle annotation" title="Enable annotation"></button>
            <label class="bbrush-toolbar-field">
              <span class="bbrush-visually-hidden">Color</span>
              <input data-role="color" type="color" value="#ff00bb" />
            </label>
            <button class="bbrush-icon-button" data-role="size-toggle" aria-label="Toggle size" title="Show size"></button>
            <label class="bbrush-toolbar-field bbrush-toolbar-size" data-role="size-field">
              <span data-role="size-label">Pen size</span>
              <input data-role="size" type="range" min="1" max="24" value="4" />
            </label>
            <div data-role="dynamic-buttons" style="display: contents;"></div>
            <div class="bbrush-shortcuts" data-role="shortcuts-panel">
              <strong>Shortcuts</strong>
            </div>
          </div>
        </div>
      `;

    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = chrome.runtime.getURL('toolbar.css');
    stylesheet.addEventListener('load', () => {
      host.style.visibility = 'visible';
    });
    shadowRoot.prepend(stylesheet);

    populateToolbarUi(shadowRoot);

    const launcher = shadowRoot.querySelector('[data-role="launcher"]');
    const launcherTool = shadowRoot.querySelector('[data-role="launcher-tool"]');
    const quickMenu = shadowRoot.querySelector('[data-role="quick-menu"]');
    const panel = shadowRoot.querySelector('[data-role="panel"]');
    const dragHandle = shadowRoot.querySelector('[data-role="drag"]');
    const annotateToggleButton = shadowRoot.querySelector('[data-role="annotate-toggle"]');
    const colorInput = shadowRoot.querySelector('[data-role="color"]');
    const sizeToggle = shadowRoot.querySelector('[data-role="size-toggle"]');
    const sizeField = shadowRoot.querySelector('[data-role="size-field"]');
    const sizeLabel = shadowRoot.querySelector('[data-role="size-label"]');
    const sizeInput = shadowRoot.querySelector('[data-role="size"]');
    const toolbar = shadowRoot.querySelector('.bbrush-toolbar');
    const shortcutsPanel = shadowRoot.querySelector('[data-role="shortcuts-panel"]');

    annotateToggleButton.innerHTML = resolveIconMarkup(
      ICON_KEYS.SHELL_ANNOTATE_TOGGLE || 'shell-annotate-toggle',
      'toolbar shell button "annotate-toggle"'
    );
    sizeToggle.innerHTML = resolveIconMarkup(
      ICON_KEYS.SHELL_SIZE_TOGGLE || 'shell-size-toggle',
      'toolbar shell button "size-toggle"'
    );

    launcher.addEventListener('click', () => {
      if (state.core.suppressNextLauncherClick) {
        state.core.suppressNextLauncherClick = false;
        return;
      }

      if (state.core.showQuickMenu) {
        setQuickMenuVisible(false);
      }

      toggleToolbarExpanded();
    });

    launcher.addEventListener('pointerdown', (event) => {
      state.core.isDraggingLauncher = false;
      state.core.launcherDragStartX = event.clientX;
      state.core.launcherDragStartY = event.clientY;
      state.core.dragOffsetX = event.clientX - state.core.toolbarHost.offsetLeft;
      state.core.dragOffsetY = event.clientY - state.core.toolbarHost.offsetTop;
      state.core.launcherPointerId = event.pointerId;
      launcher.setPointerCapture(event.pointerId);
    });

    launcher.addEventListener('pointermove', (event) => {
      if (state.core.launcherPointerId !== event.pointerId) {
        return;
      }

      const moveX = Math.abs(event.clientX - state.core.launcherDragStartX);
      const moveY = Math.abs(event.clientY - state.core.launcherDragStartY);

      if (!state.core.isDraggingLauncher && (moveX > 3 || moveY > 3)) {
        state.core.isDraggingLauncher = true;
      }

      if (!state.core.isDraggingLauncher) {
        return;
      }

      const left = event.clientX - state.core.dragOffsetX;
      const top = event.clientY - state.core.dragOffsetY;

      state.core.toolbarHost.style.left = `${Math.max(0, left)}px`;
      state.core.toolbarHost.style.top = `${Math.max(0, top)}px`;
      state.core.suppressNextLauncherClick = true;
      setQuickMenuVisible(false);
    });

    launcher.addEventListener('pointerup', (event) => {
      if (state.core.launcherPointerId !== event.pointerId) {
        return;
      }

      if (launcher.hasPointerCapture(event.pointerId)) {
        launcher.releasePointerCapture(event.pointerId);
      }

      state.core.launcherPointerId = null;
      state.core.isDraggingLauncher = false;
    });

    launcher.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      setQuickMenuVisible(!state.core.showQuickMenu);
    });

    dragHandle.addEventListener('pointerdown', (event) => {
      state.core.isDraggingToolbar = true;
      state.core.dragOffsetX = event.clientX - state.core.toolbarHost.offsetLeft;
      state.core.dragOffsetY = event.clientY - state.core.toolbarHost.offsetTop;
      dragHandle.setPointerCapture(event.pointerId);
    });

    dragHandle.addEventListener('pointermove', (event) => {
      if (!state.core.isDraggingToolbar) {
        return;
      }

      const left = event.clientX - state.core.dragOffsetX;
      const top = event.clientY - state.core.dragOffsetY;

      state.core.toolbarHost.style.left = `${Math.max(0, left)}px`;
      state.core.toolbarHost.style.top = `${Math.max(0, top)}px`;
    });

    dragHandle.addEventListener('pointerup', (event) => {
      state.core.isDraggingToolbar = false;
      dragHandle.releasePointerCapture(event.pointerId);
    });

    annotateToggleButton.addEventListener('click', () => {
      toggleDrawingMode();
    });

    colorInput.addEventListener('input', () => {
      state.shared.brushColor = colorInput.value;
      updateToolbarState();
    });

    sizeToggle.addEventListener('click', () => {
      state.core.isSizeExpanded = !state.core.isSizeExpanded;
      updateToolbarState();
    });

    sizeInput.addEventListener('input', () => {
      if (state.core.activeToolId === PLUGIN_IDS.TEXT) {
        state.shared.textSize = Number(sizeInput.value);
      } else {
        state.shared.penSize = Number(sizeInput.value);
      }

      updateToolbarState();
    });

    document.body.appendChild(host);

    state.core.toolbarHost = host;
    state.core.toolbarShadowRoot = shadowRoot;
    state.core.toolbarElements = {
      launcher,
      launcherTool,
      quickMenu,
      panel,
      toolbar,
      annotateToggleButton,
      colorInput,
      sizeToggle,
      sizeField,
      sizeLabel,
      sizeInput,
      shortcutsPanel
    };
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
