(function registerBbrushPanelActionsPlugin() {
  if (typeof window.__BBRUSH_REGISTER_PLUGIN__ !== 'function') {
    return;
  }

  function canUseDrawingShortcut(ctx) {
    return ctx.core.enabled && ctx.core.isDrawingMode && !ctx.core.isTemporaryPassthrough;
  }

  function adjustActiveSize(ctx, delta) {
    if (ctx.core.activeToolId === 'text') {
      ctx.shared.textSize = Math.max(12, Math.min(96, ctx.shared.textSize + delta));
    } else {
      ctx.shared.penSize = Math.max(1, Math.min(24, ctx.shared.penSize + delta));
    }

    ctx.updateToolbarState();
  }

  window.__BBRUSH_REGISTER_PLUGIN__({
    id: 'panel-actions',
    kind: 'ui',
    order: 5,
    quickActions: [
      {
        id: 'quick-open',
        label: 'Open panel',
        order: 5,
        onClick(ctx) {
          ctx.setQuickMenuVisible(false);
          ctx.setToolbarExpanded(true);
          return true;
        },
        isDisabled(ctx) {
          return !ctx.core.isDrawingMode;
        }
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
        key: 'escape',
        order: 5,
        when(ctx) {
          return ctx.core.enabled;
        },
        run(ctx) {
          return ctx.clearSelection({ reason: 'escape' });
        }
      },
      {
        key: '[',
        order: 6,
        when(ctx) {
          return canUseDrawingShortcut(ctx);
        },
        run(ctx) {
          adjustActiveSize(ctx, -1);
          return true;
        }
      },
      {
        key: ']',
        order: 7,
        when(ctx) {
          return canUseDrawingShortcut(ctx);
        },
        run(ctx) {
          adjustActiveSize(ctx, 1);
          return true;
        }
      }
    ]
  });
})();
