(function registerBbrushWhiteboardPlugin() {
  if (typeof window.__BBRUSH_REGISTER_PLUGIN__ !== 'function') {
    return;
  }

  function canUseDrawingShortcut(ctx) {
    return ctx.core.enabled && ctx.core.isDrawingMode && !ctx.core.isTemporaryPassthrough;
  }

  window.__BBRUSH_REGISTER_PLUGIN__({
    id: 'whiteboard',
    kind: 'mode',
    order: 70,
    toolbarItems: [
      {
        id: 'mode-whiteboard',
        order: 70,
        ariaLabel: 'Whiteboard mode',
        title: 'Toggle whiteboard (W)',
        icon: `
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4" y="5" width="16" height="12" rx="2" />
            <path d="M8 19h8" />
          </svg>
        `,
        onClick(ctx) {
          ctx.toggleCanvasMode();
          return true;
        },
        isActive(ctx) {
          return ctx.core.canvasMode === 'whiteboard';
        },
        isDisabled(ctx) {
          return !ctx.core.isDrawingMode;
        }
      }
    ],
    shortcutItems: [{ order: 70, text: 'W - Toggle whiteboard' }],
    keybindings: [
      {
        key: 'w',
        order: 70,
        when(ctx) {
          return canUseDrawingShortcut(ctx);
        },
        run(ctx) {
          ctx.toggleCanvasMode();
          return true;
        }
      }
    ],
    onLocationChange(ctx, payload) {
      if (ctx.core.canvasMode !== 'whiteboard') {
        return;
      }

      if (!ctx.utils.didPageContextChange(payload.previousHref, payload.nextHref)) {
        return;
      }

      ctx.setCanvasMode('page', { autoEnableDrawing: false });
    }
  });
})();
