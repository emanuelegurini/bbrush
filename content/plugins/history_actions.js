(function registerBbrushHistoryActionsPlugin() {
  if (typeof window.__BBRUSH_REGISTER_PLUGIN__ !== 'function') {
    return;
  }

  function canUseDrawingShortcut(ctx) {
    return ctx.core.enabled && ctx.core.isDrawingMode && !ctx.core.isTemporaryPassthrough;
  }

  window.__BBRUSH_REGISTER_PLUGIN__({
    id: 'history-actions',
    kind: 'action',
    order: 80,
    toolbarItems: [
      {
        id: 'undo',
        order: 80,
        ariaLabel: 'Undo',
        title: 'Undo (Ctrl/Cmd+Z)',
        icon: `
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 8L5 12l4 4" />
            <path d="M6 12h7a6 6 0 1 1 0 12" transform="translate(0 -6)" />
          </svg>
        `,
        onClick(ctx) {
          ctx.history.undo();
          return true;
        },
        isDisabled(ctx) {
          return !ctx.core.isDrawingMode;
        }
      },
      {
        id: 'clear',
        order: 81,
        ariaLabel: 'Clear',
        title: 'Clear screen (C)',
        icon: `
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 7h14" />
            <path d="M9 7V5h6v2" />
            <path d="M8 7l1 12h6l1-12" />
          </svg>
        `,
        onClick(ctx) {
          ctx.clearAll();
          return true;
        },
        isDisabled(ctx) {
          return !ctx.core.isDrawingMode;
        }
      }
    ],
    quickActions: [
      {
        id: 'quick-undo',
        label: 'Undo',
        order: 80,
        onClick(ctx) {
          ctx.history.undo();
          ctx.setQuickMenuVisible(false);
          return true;
        },
        isDisabled(ctx) {
          return !ctx.core.isDrawingMode;
        }
      },
      {
        id: 'quick-clear',
        label: 'Clear',
        order: 81,
        onClick(ctx) {
          ctx.clearAll();
          ctx.setQuickMenuVisible(false);
          return true;
        },
        isDisabled(ctx) {
          return !ctx.core.isDrawingMode;
        }
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
        when(ctx) {
          return ctx.core.enabled;
        },
        run(ctx) {
          return ctx.history.undo();
        }
      },
      {
        key: 'c',
        order: 81,
        when(ctx) {
          return canUseDrawingShortcut(ctx);
        },
        run(ctx) {
          ctx.clearAll();
          return true;
        }
      }
    ]
  });
})();
