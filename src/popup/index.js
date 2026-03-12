import { MESSAGE_TYPES } from '../shared/messages.js';

const popupShell = document.querySelector('.popup-shell');
const overlayModeElement = document.getElementById('overlay-mode');
const overlayHintElement = document.getElementById('overlay-hint');
const stateChipElement = document.getElementById('state-chip');
const statusCopyElement = document.getElementById('status-copy');
const statusNoteElement = document.getElementById('status-note');
const statusTitleElement = document.getElementById('status-title');
const toggleButton = document.getElementById('toggle-overlay');

function setUiState({ buttonLabel, chipLabel, copy, hint, note, state, title }) {
  popupShell.dataset.state = state;
  stateChipElement.textContent = chipLabel;
  statusTitleElement.textContent = title;
  statusCopyElement.textContent = copy;
  overlayModeElement.textContent = state === 'active' ? 'Active' : 'Inactive';
  overlayHintElement.textContent = hint;
  statusNoteElement.textContent = note;
  toggleButton.textContent = buttonLabel;
}

function setOverlayState(active) {
  if (active) {
    setUiState({
      state: 'active',
      chipLabel: 'Overlay live',
      title: 'Drawing mode ready',
      copy: 'Your overlay is enabled on this tab. Open the panel and start annotating.',
      hint: 'Panel and shortcuts available',
      note: 'Use Alt + D to toggle annotate and Alt + Shift + B to reopen the panel quickly.',
      buttonLabel: 'Deactivate on this tab'
    });
    return;
  }

  setUiState({
    state: 'ready',
    chipLabel: 'Ready',
    title: 'Ready for this tab',
    copy: 'Turn on the overlay to start drawing, highlighting, and switching scenes.',
    hint: 'Available on normal pages',
    note: 'Best on regular webpages. Chrome system pages and stores are blocked by the browser.',
    buttonLabel: 'Activate on this tab'
  });
}

function setUnsupportedState() {
  setUiState({
    state: 'unsupported',
    chipLabel: 'Blocked',
    title: 'Unsupported page',
    copy: 'This page type does not allow extension overlays.',
    hint: 'chrome://, store, extension pages',
    note: 'Try again on a regular website, document, or presentation tab.',
    buttonLabel: 'Activate on this tab'
  });
}

function setErrorState(message) {
  setUiState({
    state: 'error',
    chipLabel: 'Needs retry',
    title: 'Could not start overlay',
    copy: message,
    hint: 'Refresh or retry on this tab',
    note: 'If the page just changed, reload the tab and try again.',
    buttonLabel: 'Activate on this tab'
  });
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
    setErrorState('No active tab found.');
    return;
  }

  chrome.runtime.sendMessage({ type: MESSAGE_TYPES.POPUP_GET_STATUS, tabId }, (response) => {
    if (chrome.runtime.lastError || !response || !response.ok) {
      setOverlayState(false);
      return;
    }

    setOverlayState(response.active);
  });
}

toggleButton.addEventListener('click', async () => {
  const tabId = await getActiveTabId();

  if (!tabId) {
    setErrorState('No active tab found.');
    return;
  }

  chrome.runtime.sendMessage({ type: MESSAGE_TYPES.POPUP_TOGGLE_OVERLAY, tabId }, (response) => {
    if (chrome.runtime.lastError) {
      setErrorState('Could not toggle overlay on this tab.');
      return;
    }

    if (!response || !response.ok) {
      if (response && response.error === 'unsupported_url') {
        setUnsupportedState();
      } else {
        setErrorState('Overlay injection failed on this page.');
      }

      return;
    }

    setOverlayState(response.active);
  });
});

refreshStatus();
