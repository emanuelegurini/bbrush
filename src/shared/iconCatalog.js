export const ICON_KEYS = Object.freeze({
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

export const ICONS = Object.freeze({
  [ICON_KEYS.TOOL_BRUSH]: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14.5 4.5l5 5" />
        <path d="M6.5 12.5l5-5 5 5-5 5H6l.5-5z" />
        <path d="M6 17.5c-.8.3-1.6 1-2 2.5" />
      </svg>
    `,
  [ICON_KEYS.TOOL_ERASER]: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 15.5l5.8-5.8a2 2 0 0 1 2.8 0l3.8 3.8a2 2 0 0 1 0 2.8l-3.2 3.2H10a3 3 0 0 1-2.1-.9l-2.1-2.1a.9.9 0 0 1 0-1.3z" />
        <path d="M13.5 19.5H21" />
      </svg>
    `,
  [ICON_KEYS.TOOL_ARROW]: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 19L19 5" />
        <path d="M9 5h10v10" />
      </svg>
    `,
  [ICON_KEYS.TOOL_RECT]: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4.5" y="5.5" width="15" height="13" rx="3" />
      </svg>
    `,
  [ICON_KEYS.TOOL_TEXT]: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 6h14" />
        <path d="M12 6v12" />
        <path d="M9 18h6" />
      </svg>
    `,
  [ICON_KEYS.TOOL_HIGHLIGHT]: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 4l6 6" />
        <path d="M5 13.5l6.5-6.5 5.5 5.5L10.5 19H5z" />
        <path d="M4 20h11" />
      </svg>
    `,
  [ICON_KEYS.ACTION_UNDO]: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 14L4 9l5-5" />
        <path d="M20 20a8 8 0 0 0-8-8H4" />
      </svg>
    `,
  [ICON_KEYS.ACTION_CLEAR]: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16" />
        <path d="M9 7V5h6v2" />
        <path d="M7 7l1 12h8l1-12" />
        <path d="M10 11v5" />
        <path d="M14 11v5" />
      </svg>
    `,
  [ICON_KEYS.UI_SHORTCUTS]: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="6" width="17" height="12" rx="2.5" />
        <path d="M7 10h1" />
        <path d="M11 10h1" />
        <path d="M15 10h1" />
        <path d="M7 14h10" />
      </svg>
    `,
  [ICON_KEYS.MODE_WHITEBOARD]: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="4.5" width="16" height="11.5" rx="2.5" />
        <path d="M12 16v3.5" />
        <path d="M8 20h8" />
      </svg>
    `,
  [ICON_KEYS.SHELL_ANNOTATE_TOGGLE]: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 19H5" />
        <path d="M16.5 3.5l4 4" />
        <path d="M7.5 15.5l8-8 4 4-8 8H7.5z" />
      </svg>
    `,
  [ICON_KEYS.SHELL_SIZE_TOGGLE]: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h8" />
        <path d="M16 7h4" />
        <path d="M4 17h4" />
        <path d="M12 17h8" />
        <circle cx="14" cy="7" r="2" />
        <circle cx="10" cy="17" r="2" />
      </svg>
    `
});

export function getIconMarkup(iconKey) {
  if (typeof iconKey !== 'string') {
    return '';
  }

  return ICONS[iconKey] || '';
}
