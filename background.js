const activeOverlayTabs = new Set();

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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'POPUP_TOGGLE_OVERLAY' || typeof message.tabId !== 'number') {
    return;
  }

  const { tabId } = message;

  (async () => {
    let isActive = activeOverlayTabs.has(tabId);

    if (!isActive) {
      await ensureContentScript(tabId);
      await sendTabMessage(tabId, { type: 'BBRUSH_ENABLE_OVERLAY' });
      activeOverlayTabs.add(tabId);
      isActive = true;
    } else {
      await sendTabMessage(tabId, { type: 'BBRUSH_DISABLE_OVERLAY' });
      activeOverlayTabs.delete(tabId);
      isActive = false;
    }

    sendResponse({ active: isActive });
  })();

  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  activeOverlayTabs.delete(tabId);
});
