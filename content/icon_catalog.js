(function initBbrushIconCatalog() {
  if (window.__BBRUSH_ICON_KEYS__ && window.__BBRUSH_ICONS__ && window.__BBRUSH_GET_ICON_MARKUP__) {
    return;
  }

  const ICON_KEYS = Object.freeze({
    TOOL_BRUSH: 'tool-brush',
    TOOL_ERASER: 'tool-eraser',
    TOOL_ARROW: 'tool-arrow',
    TOOL_RECT: 'tool-rect',
    TOOL_TEXT: 'tool-text',
    TOOL_HIGHLIGHT: 'tool-highlight',
    ACTION_UNDO: 'action-undo',
    ACTION_CLEAR: 'action-clear',
    UI_SHORTCUTS: 'ui-shortcuts',
    MODE_WHITEBOARD: 'mode-whiteboard',
    SHELL_ANNOTATE_TOGGLE: 'shell-annotate-toggle',
    SHELL_SIZE_TOGGLE: 'shell-size-toggle'
  });

  const icons = Object.freeze({
    [ICON_KEYS.TOOL_BRUSH]: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20l4.5-1.2L19 8.3a1.9 1.9 0 0 0 0-2.7l-.6-.6a1.9 1.9 0 0 0-2.7 0L5.2 15.5z" />
        <path d="M13.5 6.5l4 4" />
      </svg>
    `,
    [ICON_KEYS.TOOL_ERASER]: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 16l6-8 6 6-6 8H7z" />
        <path d="M4 20h16" />
      </svg>
    `,
    [ICON_KEYS.TOOL_ARROW]: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20L20 4" />
        <path d="M11 4h9v9" />
      </svg>
    `,
    [ICON_KEYS.TOOL_RECT]: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="5" width="14" height="14" rx="1" />
      </svg>
    `,
    [ICON_KEYS.TOOL_TEXT]: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 6h14" />
        <path d="M12 6v12" />
        <path d="M8 18h8" />
      </svg>
    `,
    [ICON_KEYS.TOOL_HIGHLIGHT]: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 16l5-5 4 4-5 5H6z" />
        <path d="M13 9l2-2 3 3-2 2" />
        <path d="M4 20h10" />
      </svg>
    `,
    [ICON_KEYS.ACTION_UNDO]: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 8L5 12l4 4" />
        <path d="M6 12h7a6 6 0 1 1 0 12" transform="translate(0 -6)" />
      </svg>
    `,
    [ICON_KEYS.ACTION_CLEAR]: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 7h14" />
        <path d="M9 7V5h6v2" />
        <path d="M8 7l1 12h6l1-12" />
      </svg>
    `,
    [ICON_KEYS.UI_SHORTCUTS]: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M7 10h2" />
        <path d="M11 10h2" />
        <path d="M15 10h2" />
        <path d="M7 14h10" />
      </svg>
    `,
    [ICON_KEYS.MODE_WHITEBOARD]: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5" width="16" height="12" rx="2" />
        <path d="M8 19h8" />
      </svg>
    `,
    [ICON_KEYS.SHELL_ANNOTATE_TOGGLE]: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v8" />
        <path d="M7.8 5.7A8.5 8.5 0 1 0 16.2 5.7" />
      </svg>
    `,
    [ICON_KEYS.SHELL_SIZE_TOGGLE]: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 8h10" />
        <circle cx="16" cy="8" r="2" />
        <path d="M4 16h6" />
        <circle cx="12" cy="16" r="2" />
      </svg>
    `
  });

  window.__BBRUSH_ICON_KEYS__ = ICON_KEYS;
  window.__BBRUSH_ICONS__ = icons;
  window.__BBRUSH_GET_ICON_MARKUP__ = function getBbrushIconMarkup(iconKey) {
    if (typeof iconKey !== 'string') {
      return '';
    }

    return icons[iconKey] || '';
  };
})();
