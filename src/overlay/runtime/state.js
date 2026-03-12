import { PLUGIN_IDS } from '../../shared/pluginIds.js';

export const ANCHOR_SIZE = 10;
export const MIN_TEXT_SIZE = 10;
export const MAX_HISTORY_ENTRIES = 100;
export const STATIC_PLUGIN_MANIFEST_KEYS = new Set([
  'id',
  'kind',
  'order',
  'launcherLabel',
  'entryTypes',
  'usesCanvasPointerEvents',
  'toolbarItems',
  'quickActions',
  'shortcutItems',
  'keybindings'
]);
export const DESCRIPTOR_HANDLER_KEYS = {
  toolbarItems: ['onClick', 'getTitle', 'isActive', 'isDisabled'],
  quickActions: ['onClick', 'getTitle', 'isActive', 'isDisabled'],
  keybindings: ['when', 'run']
};

export function sortByOrder(left, right) {
  const leftOrder = typeof left.order === 'number' ? left.order : 0;
  const rightOrder = typeof right.order === 'number' ? right.order : 0;

  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  const leftId = typeof left.id === 'string' ? left.id : '';
  const rightId = typeof right.id === 'string' ? right.id : '';
  return leftId.localeCompare(rightId);
}

export function createRuntimeState() {
  return {
    core: {
      enabled: false,
      isDrawingMode: false,
      canvasMode: 'page',
      activeToolId: typeof PLUGIN_IDS.BRUSH === 'string' ? PLUGIN_IDS.BRUSH : 'brush',
      canvas: null,
      context: null,
      toolbarHost: null,
      toolbarShadowRoot: null,
      toolbarElements: null,
      isToolbarExpanded: false,
      isSizeExpanded: false,
      showQuickMenu: false,
      showShortcuts: false,
      isDraggingToolbar: false,
      isDraggingLauncher: false,
      dragOffsetX: 0,
      dragOffsetY: 0,
      launcherDragStartX: 0,
      launcherDragStartY: 0,
      launcherPointerId: null,
      suppressNextLauncherClick: false,
      isSpacePressed: false,
      isTemporaryPassthrough: false,
      lastLocationHref: window.location.href,
      registeredPlugins: [],
      toolbarButtonRecords: [],
      quickActionRecords: [],
      shortcutLines: [],
      keybindingRecords: [],
      entryTypeOwners: {}
    },
    shared: {
      pageScene: { strokes: [], history: [] },
      whiteboardScene: { strokes: [], history: [] },
      nextEntryId: 1,
      brushColor: '#ff00bb',
      penSize: 4,
      textSize: 18
    },
    plugins: {}
  };
}
