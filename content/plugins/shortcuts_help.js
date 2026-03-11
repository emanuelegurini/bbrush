(function registerBbrushShortcutsHelpPlugin() {
  if (typeof window.__BBRUSH_REGISTER_PLUGIN__ !== 'function') {
    return;
  }

  function canUseDrawingShortcut(ctx) {
    return ctx.core.enabled && ctx.core.isDrawingMode && !ctx.core.isTemporaryPassthrough;
  }

  window.__BBRUSH_REGISTER_PLUGIN__({
    id: 'shortcuts-help',
    kind: 'ui',
    order: 90,
    toolbarItems: [
      {
        id: 'shortcuts-toggle',
        order: 90,
        ariaLabel: 'Shortcuts',
        title: 'Show shortcuts (?)',
        icon: `
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="6" width="18" height="12" rx="2" />
            <path d="M7 10h2" />
            <path d="M11 10h2" />
            <path d="M15 10h2" />
            <path d="M7 14h10" />
          </svg>
        `,
        onClick(ctx) {
          ctx.toggleShortcuts();
          return true;
        },
        isDisabled(ctx) {
          return !ctx.core.isDrawingMode;
        }
      }
    ],
    shortcutItems: [{ order: 90, text: '? - Toggle this help' }],
    keybindings: [
      {
        key: '?',
        order: 90,
        when(ctx) {
          return canUseDrawingShortcut(ctx);
        },
        run(ctx) {
          ctx.toggleShortcuts();
          return true;
        }
      }
    ]
  });
})();
