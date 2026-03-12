import { FEATURE_MANIFEST } from '../featureManifest.js';
import { PLUGIN_IDS } from '../../shared/pluginIds.js';
import arrowFeature from './arrow.js';
import brushFeature from './brush.js';
import eraserFeature from './eraser.js';
import highlightFeature from './highlight.js';
import historyActionsFeature from './history_actions.js';
import panelActionsFeature from './panel_actions.js';
import rectFeature from './rect.js';
import shortcutsHelpFeature from './shortcuts_help.js';
import textFeature from './text.js';
import whiteboardFeature from './whiteboard.js';

export const FEATURES = [
  {
    manifestEntry: FEATURE_MANIFEST[PLUGIN_IDS.PANEL_ACTIONS],
    implementation: panelActionsFeature
  },
  {
    manifestEntry: FEATURE_MANIFEST[PLUGIN_IDS.BRUSH],
    implementation: brushFeature
  },
  {
    manifestEntry: FEATURE_MANIFEST[PLUGIN_IDS.ERASER],
    implementation: eraserFeature
  },
  {
    manifestEntry: FEATURE_MANIFEST[PLUGIN_IDS.ARROW],
    implementation: arrowFeature
  },
  {
    manifestEntry: FEATURE_MANIFEST[PLUGIN_IDS.RECT],
    implementation: rectFeature
  },
  {
    manifestEntry: FEATURE_MANIFEST[PLUGIN_IDS.TEXT],
    implementation: textFeature
  },
  {
    manifestEntry: FEATURE_MANIFEST[PLUGIN_IDS.HIGHLIGHT],
    implementation: highlightFeature
  },
  {
    manifestEntry: FEATURE_MANIFEST[PLUGIN_IDS.WHITEBOARD],
    implementation: whiteboardFeature
  },
  {
    manifestEntry: FEATURE_MANIFEST[PLUGIN_IDS.HISTORY_ACTIONS],
    implementation: historyActionsFeature
  },
  {
    manifestEntry: FEATURE_MANIFEST[PLUGIN_IDS.SHORTCUTS_HELP],
    implementation: shortcutsHelpFeature
  }
];
