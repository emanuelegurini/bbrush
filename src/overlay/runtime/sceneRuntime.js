import { MAX_HISTORY_ENTRIES } from './state.js';

export function createSceneRuntime({
  state,
  cloneStrokes,
  getPlugins,
  callPluginHook,
  notifySceneChanged,
  requestRender
}) {
  function getSceneForMode(mode) {
    return mode === 'whiteboard' ? state.shared.whiteboardScene : state.shared.pageScene;
  }

  function getActiveScene() {
    return getSceneForMode(state.core.canvasMode);
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

    for (const plugin of getPlugins()) {
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

  return {
    getSceneForMode,
    getActiveScene,
    ensureHistoryInitialized,
    pushHistorySnapshot,
    recomputeNextEntryId,
    generateEntryId,
    undoLastAction,
    clearAll
  };
}
