const statusElement = document.getElementById('status');
const toggleButton = document.getElementById('toggle-overlay');

function setUiState(active) {
  if (active) {
    statusElement.textContent = 'Overlay enabled.';
    toggleButton.textContent = 'Deactivate on this tab';
    return;
  }

  statusElement.textContent = 'Ready for this tab.';
  toggleButton.textContent = 'Activate on this tab';
}

async function getActiveTabId() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab || typeof activeTab.id !== 'number') {
    return null;
  }

  return activeTab.id;
}

async function refreshStatus() {
  const tabId = await getActiveTabId();

  if (!tabId) {
    statusElement.textContent = 'No active tab found.';
    return;
  }

  chrome.runtime.sendMessage({ type: 'POPUP_GET_STATUS', tabId }, (response) => {
    if (chrome.runtime.lastError || !response || !response.ok) {
      setUiState(false);
      return;
    }

    setUiState(response.active);
  });
}

toggleButton.addEventListener('click', async () => {
  const tabId = await getActiveTabId();

  if (!tabId) {
    statusElement.textContent = 'No active tab found.';
    return;
  }

  chrome.runtime.sendMessage({ type: 'POPUP_TOGGLE_OVERLAY', tabId }, (response) => {
    if (chrome.runtime.lastError) {
      statusElement.textContent = 'Could not toggle overlay.';
      return;
    }

    if (!response || !response.ok) {
      if (response && response.error === 'unsupported_url') {
        statusElement.textContent = 'Unsupported page (chrome://, extensions, store).';
      } else {
        statusElement.textContent = 'Overlay injection failed on this page.';
      }

      return;
    }

    setUiState(response.active);
  });
});

refreshStatus();
