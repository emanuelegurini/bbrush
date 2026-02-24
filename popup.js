const statusElement = document.getElementById('status');
const toggleButton = document.getElementById('toggle-overlay');

toggleButton.addEventListener('click', async () => {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!activeTab || typeof activeTab.id !== 'number') {
    statusElement.textContent = 'No active tab found.';
    return;
  }

  chrome.runtime.sendMessage({ type: 'POPUP_TOGGLE_OVERLAY', tabId: activeTab.id }, (response) => {
    if (chrome.runtime.lastError) {
      statusElement.textContent = 'Could not toggle overlay.';
      return;
    }

    if (response && response.active) {
      statusElement.textContent = 'Overlay enabled.';
      toggleButton.textContent = 'Deactivate on this tab';
    } else {
      statusElement.textContent = 'Overlay disabled.';
      toggleButton.textContent = 'Activate on this tab';
    }
  });
});
