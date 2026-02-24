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

async function activateOverlay(tabId) {
  try {
    await ensureContentScript(tabId);
  } catch {
    return { ok: false, error: 'unsupported_url' };
  }

  const response = await sendTabMessage(tabId, { type: 'BBRUSH_ENABLE_OVERLAY' });

  if (!response) {
    return { ok: false, error: 'injection_failed' };
  }

  return { ok: true };
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
    const isActive = await getOverlayStatus(tabId);

    if (isActive) {
      await sendTabMessage(tabId, { type: 'BBRUSH_DISABLE_OVERLAY' });
      sendResponse({ ok: true, active: false });
      return;
    }

    const activation = await activateOverlay(tabId);

    if (!activation.ok) {
      sendResponse({ ok: false, error: activation.error });
      return;
    }

    sendResponse({ ok: true, active: true });
  })();

  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-drawing-mode') {
    return;
  }

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!activeTab || typeof activeTab.id !== 'number') {
    return;
  }

  const tabId = activeTab.id;

  const isActive = await getOverlayStatus(tabId);

  if (!isActive) {
    const activation = await activateOverlay(tabId);

    if (!activation.ok) {
      return;
    }
  }

  await sendTabMessage(tabId, { type: 'BBRUSH_TOGGLE_DRAWING_MODE' });
});
