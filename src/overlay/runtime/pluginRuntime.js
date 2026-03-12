import {
  ANCHOR_SIZE,
  MIN_TEXT_SIZE,
  STATIC_PLUGIN_MANIFEST_KEYS,
  DESCRIPTOR_HANDLER_KEYS,
  sortByOrder
} from './state.js';

export function createPluginRuntime({
  featureRecords,
  state,
  utils,
  scene,
  actions,
  logPluginError
}) {
  const plugins = [];
  const pluginsById = new Map();
  const pluginContexts = new Map();

  function getPlugin(pluginId) {
    return pluginsById.get(pluginId) || null;
  }

  function getPluginContext(pluginId) {
    return pluginContexts.get(pluginId) || null;
  }

  function getActiveToolPlugin() {
    return getPlugin(state.core.activeToolId);
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
      utils,
      scene: {
        getActive() {
          return scene.getActiveScene();
        },
        getEntries() {
          return scene.getActiveScene().strokes;
        },
        getHistory() {
          return scene.getActiveScene().history;
        },
        getScene(mode) {
          return scene.getSceneForMode(mode);
        },
        findEntryById(id, type) {
          return (
            scene.getActiveScene().strokes.find((entry) => {
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
          actions.ensureHistoryInitialized();
        },
        pushSnapshot() {
          actions.pushHistorySnapshot();
        },
        undo() {
          return actions.undoLastAction();
        }
      },
      generateEntryId: actions.generateEntryId,
      requestRender: actions.requestRender,
      updateToolbarState: actions.updateToolbarState,
      updateCanvasCursor: actions.updateCanvasCursor,
      updateOverlayInteractionState: actions.updateOverlayInteractionState,
      setActiveTool: actions.setActiveTool,
      setDrawingMode: actions.setDrawingMode,
      setCanvasMode: actions.setCanvasMode,
      toggleCanvasMode: actions.toggleCanvasMode,
      clearSelection: actions.clearSelection,
      clearAll: actions.clearAll,
      setToolbarExpanded: actions.setToolbarExpanded,
      toggleToolbarExpanded: actions.toggleToolbarExpanded,
      setQuickMenuVisible: actions.setQuickMenuVisible,
      toggleShortcuts: actions.toggleShortcuts,
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

  const builtInHandlers = {
    activateTool(ctx, _payload, reference) {
      ctx.setActiveTool(reference.descriptor.targetToolId || reference.pluginId);
      return true;
    },
    adjustActiveSize(_ctx, _payload, reference) {
      return actions.adjustActiveSize(Number(reference.descriptor.sizeDelta));
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
      actions.requestRender();
    }

    return changed;
  }

  function notifySceneChanged(reason) {
    for (const plugin of plugins) {
      callPluginHook(plugin, 'onSceneChanged', { reason });
    }
  }

  return {
    plugins,
    getPlugin,
    getPluginContext,
    getActiveToolPlugin,
    getEntryOwner,
    callPluginHook,
    initializePlugins,
    hasActiveInteraction,
    clearSelection,
    notifySceneChanged
  };
}
