function sendTabMessage(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      resolve(response || null);
    });
  });
}

async function ensureContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content_script.js']
  });
}

async function getOverlayStatus(tabId) {
  const response = await sendTabMessage(tabId, { type: 'BBRUSH_GET_STATUS' });
  return Boolean(response && response.overlayEnabled);
}

async function activateOverlay(tabId, drawingMode = false) {
  try {
    await ensureContentScript(tabId);
  } catch {
    return { ok: false, error: 'unsupported_url' };
  }

  const response = await sendTabMessage(tabId, {
    type: 'BBRUSH_ENABLE_OVERLAY',
    drawingMode
  });

  if (!response) {
    return { ok: false, error: 'injection_failed' };
  }

  return { ok: true };
}

async function toggleOverlayForTab(tabId) {
  const isActive = await getOverlayStatus(tabId);

  if (isActive) {
    await sendTabMessage(tabId, { type: 'BBRUSH_DISABLE_OVERLAY' });
    return { ok: true, active: false };
  }

  const activation = await activateOverlay(tabId, true);

  if (!activation.ok) {
    return { ok: false, error: activation.error };
  }

  return { ok: true, active: true };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string' || typeof message.tabId !== 'number') {
    return;
  }

  const { tabId } = message;

  if (message.type === 'POPUP_GET_STATUS') {
    (async () => {
      const isActive = await getOverlayStatus(tabId);
      sendResponse({ ok: true, active: isActive });
    })();

    return true;
  }

  if (message.type !== 'POPUP_TOGGLE_OVERLAY') {
    return;
  }

  (async () => {
    const result = await toggleOverlayForTab(tabId);
    sendResponse(result);
  })();

  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-drawing-mode' && command !== 'toggle-toolbar-panel') {
    return;
  }

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!activeTab || typeof activeTab.id !== 'number') {
    return;
  }

  const tabId = activeTab.id;

  let isActive = await getOverlayStatus(tabId);

  if (!isActive) {
    const activation = await activateOverlay(tabId, command === 'toggle-drawing-mode');

    if (!activation.ok) {
      return;
    }

    isActive = true;

    if (command === 'toggle-drawing-mode') {
      return;
    }
  }

  if (command === 'toggle-toolbar-panel') {
    await sendTabMessage(tabId, { type: 'BBRUSH_TOGGLE_PANEL' });
    return;
  }

  if (command === 'toggle-drawing-mode' && isActive) {
    await sendTabMessage(tabId, { type: 'BBRUSH_TOGGLE_DRAWING_MODE' });
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || typeof tab.id !== 'number') {
    return;
  }

  await toggleOverlayForTab(tab.id);
});
