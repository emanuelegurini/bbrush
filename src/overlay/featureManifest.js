import { ICON_KEYS } from '../shared/iconCatalog.js';
import { PLUGIN_IDS } from '../shared/pluginIds.js';

function createToolManifest(config) {
  return {
    id: config.id,
    kind: 'tool',
    order: config.order,
    launcherLabel: config.launcherLabel,
    entryTypes: config.entryTypes || [],
    usesCanvasPointerEvents: config.usesCanvasPointerEvents !== false,
    toolbarItems: [
      {
        id: config.toolbarItem.id,
        order: config.order,
        ariaLabel: config.toolbarItem.ariaLabel,
        title: config.toolbarItem.title,
        iconKey: config.toolbarItem.iconKey,
        onClick: 'activateTool',
        isActive: 'isActiveTool',
        isDisabled: 'isDrawingDisabled'
      }
    ],
    shortcutItems: config.shortcutItems || [],
    keybindings: [
      {
        key: config.keybinding.key,
        order: config.order,
        when: 'canUseDrawingShortcut',
        run: 'activateTool'
      }
    ]
  };
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  for (const nestedValue of Object.values(value)) {
    freezeDeep(nestedValue);
  }

  return Object.freeze(value);
}

const pluginManifest = {
  [PLUGIN_IDS.PANEL_ACTIONS]: {
    id: PLUGIN_IDS.PANEL_ACTIONS,
    kind: 'ui',
    order: 5,
    quickActions: [
      {
        id: 'quick-open',
        label: 'Open panel',
        order: 5,
        onClick: 'openPanel',
        isDisabled: 'isDrawingDisabled'
      }
    ],
    shortcutItems: [
      { order: 5, text: 'Alt + D - Toggle annotate' },
      { order: 6, text: 'Alt + Shift + B - Toggle panel' },
      { order: 7, text: 'Hold Space - Temporary click-through' },
      { order: 8, text: '[ / ] - Active tool size' },
      { order: 9, text: 'Esc - Close/cancel' }
    ],
    keybindings: [
      {
        id: 'clear-selection',
        key: 'escape',
        order: 5,
        when: 'isEnabled',
        run: 'clearSelection',
        reason: 'escape'
      },
      {
        id: 'decrease-size',
        key: '[',
        order: 6,
        when: 'canUseDrawingShortcut',
        run: 'adjustActiveSize',
        sizeDelta: -1
      },
      {
        id: 'increase-size',
        key: ']',
        order: 7,
        when: 'canUseDrawingShortcut',
        run: 'adjustActiveSize',
        sizeDelta: 1
      }
    ]
  },
  [PLUGIN_IDS.BRUSH]: createToolManifest({
    id: PLUGIN_IDS.BRUSH,
    order: 10,
    launcherLabel: 'P',
    entryTypes: ['brush'],
    toolbarItem: {
      id: 'tool-brush',
      ariaLabel: 'Pen tool',
      title: 'Pen tool (B)',
      iconKey: ICON_KEYS.TOOL_BRUSH || 'tool-brush'
    },
    shortcutItems: [
      { order: 10, text: 'B - Pen' },
      { order: 11, text: 'Hold Shift + Drag (Pen) - Straight line' }
    ],
    keybinding: {
      key: 'b'
    }
  }),
  [PLUGIN_IDS.ERASER]: createToolManifest({
    id: PLUGIN_IDS.ERASER,
    order: 20,
    launcherLabel: 'E',
    toolbarItem: {
      id: 'tool-eraser',
      ariaLabel: 'Eraser tool',
      title: 'Eraser tool (E)',
      iconKey: ICON_KEYS.TOOL_ERASER || 'tool-eraser'
    },
    shortcutItems: [{ order: 20, text: 'E - Eraser' }],
    keybinding: {
      key: 'e'
    }
  }),
  [PLUGIN_IDS.ARROW]: createToolManifest({
    id: PLUGIN_IDS.ARROW,
    order: 30,
    launcherLabel: 'A',
    entryTypes: ['arrow'],
    toolbarItem: {
      id: 'tool-arrow',
      ariaLabel: 'Arrow tool',
      title: 'Arrow tool (A)',
      iconKey: ICON_KEYS.TOOL_ARROW || 'tool-arrow'
    },
    shortcutItems: [{ order: 30, text: 'A - Arrow' }],
    keybinding: {
      key: 'a'
    }
  }),
  [PLUGIN_IDS.RECT]: createToolManifest({
    id: PLUGIN_IDS.RECT,
    order: 40,
    launcherLabel: 'R',
    entryTypes: ['rect'],
    toolbarItem: {
      id: 'tool-rect',
      ariaLabel: 'Rectangle tool',
      title: 'Rectangle tool (R)',
      iconKey: ICON_KEYS.TOOL_RECT || 'tool-rect'
    },
    shortcutItems: [{ order: 40, text: 'R - Rectangle' }],
    keybinding: {
      key: 'r'
    }
  }),
  [PLUGIN_IDS.TEXT]: createToolManifest({
    id: PLUGIN_IDS.TEXT,
    order: 50,
    launcherLabel: 'T',
    entryTypes: ['text'],
    toolbarItem: {
      id: 'tool-text',
      ariaLabel: 'Text tool',
      title: 'Text tool (T)',
      iconKey: ICON_KEYS.TOOL_TEXT || 'tool-text'
    },
    shortcutItems: [
      { order: 50, text: 'T - Text' },
      { order: 51, text: 'Alt/Option + Drag (Text) - Duplicate text' }
    ],
    keybinding: {
      key: 't'
    }
  }),
  [PLUGIN_IDS.HIGHLIGHT]: createToolManifest({
    id: PLUGIN_IDS.HIGHLIGHT,
    order: 60,
    launcherLabel: 'H',
    usesCanvasPointerEvents: false,
    toolbarItem: {
      id: 'tool-highlight',
      ariaLabel: 'Highlight tool',
      title: 'Highlight tool (H)',
      iconKey: ICON_KEYS.TOOL_HIGHLIGHT || 'tool-highlight'
    },
    shortcutItems: [
      { order: 60, text: 'H - Highlight text' },
      { order: 61, text: 'Alt + Click (Highlight) - Remove highlight' }
    ],
    keybinding: {
      key: 'h'
    }
  }),
  [PLUGIN_IDS.WHITEBOARD]: {
    id: PLUGIN_IDS.WHITEBOARD,
    kind: 'mode',
    order: 70,
    toolbarItems: [
      {
        id: 'mode-whiteboard',
        order: 70,
        ariaLabel: 'Whiteboard mode',
        title: 'Toggle whiteboard (W)',
        iconKey: ICON_KEYS.MODE_WHITEBOARD || 'mode-whiteboard',
        onClick: 'toggleCanvasMode',
        isActive: 'isWhiteboardMode',
        isDisabled: 'isDrawingDisabled'
      }
    ],
    shortcutItems: [{ order: 70, text: 'W - Toggle whiteboard' }],
    keybindings: [
      {
        key: 'w',
        order: 70,
        when: 'canUseDrawingShortcut',
        run: 'toggleCanvasMode'
      }
    ]
  },
  [PLUGIN_IDS.HISTORY_ACTIONS]: {
    id: PLUGIN_IDS.HISTORY_ACTIONS,
    kind: 'action',
    order: 80,
    toolbarItems: [
      {
        id: 'undo',
        order: 80,
        ariaLabel: 'Undo',
        title: 'Undo (Ctrl/Cmd+Z)',
        iconKey: ICON_KEYS.ACTION_UNDO || 'action-undo',
        onClick: 'undoHistory',
        isDisabled: 'isDrawingDisabled'
      },
      {
        id: 'clear',
        order: 81,
        ariaLabel: 'Clear',
        title: 'Clear screen (C)',
        iconKey: ICON_KEYS.ACTION_CLEAR || 'action-clear',
        onClick: 'clearAll',
        isDisabled: 'isDrawingDisabled'
      }
    ],
    quickActions: [
      {
        id: 'quick-undo',
        label: 'Undo',
        order: 80,
        onClick: 'undoHistory',
        isDisabled: 'isDrawingDisabled',
        closeQuickMenu: true
      },
      {
        id: 'quick-clear',
        label: 'Clear',
        order: 81,
        onClick: 'clearAll',
        isDisabled: 'isDrawingDisabled',
        closeQuickMenu: true
      }
    ],
    shortcutItems: [
      { order: 80, text: 'Ctrl/Cmd + Z - Undo' },
      { order: 81, text: 'C - Clear screen' }
    ],
    keybindings: [
      {
        key: 'z',
        ctrlOrMeta: true,
        order: 80,
        when: 'isEnabled',
        run: 'undoHistory'
      },
      {
        key: 'c',
        order: 81,
        when: 'canUseDrawingShortcut',
        run: 'clearAll'
      }
    ]
  },
  [PLUGIN_IDS.SHORTCUTS_HELP]: {
    id: PLUGIN_IDS.SHORTCUTS_HELP,
    kind: 'ui',
    order: 90,
    toolbarItems: [
      {
        id: 'shortcuts-toggle',
        order: 90,
        ariaLabel: 'Shortcuts',
        title: 'Show shortcuts (?)',
        iconKey: ICON_KEYS.UI_SHORTCUTS || 'ui-shortcuts',
        onClick: 'toggleShortcuts',
        isDisabled: 'isDrawingDisabled'
      }
    ],
    shortcutItems: [{ order: 90, text: '? - Toggle this help' }],
    keybindings: [
      {
        key: '?',
        order: 90,
        when: 'canUseDrawingShortcut',
        run: 'toggleShortcuts'
      }
    ]
  }
};

export const FEATURE_MANIFEST = freezeDeep(pluginManifest);
