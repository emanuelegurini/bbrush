import { MESSAGE_TYPES } from '../../shared/messages.js';

export function createMessageRuntime({
  state,
  getPlugins,
  callPluginHook,
  enableOverlay,
  disableOverlay,
  toggleDrawingMode,
  undoLastAction,
  clearAll,
  toggleToolbarExpanded
}) {
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

    for (const plugin of getPlugins()) {
      const response = callPluginHook(plugin, 'onMessage', message);
      if (response !== undefined) {
        sendResponse(response);
        return;
      }
    }
  }

  function installMessageListener() {
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  }

  return {
    installMessageListener
  };
}
