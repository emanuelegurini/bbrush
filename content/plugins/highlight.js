(function registerBbrushHighlightPlugin() {
  if (typeof window.__BBRUSH_REGISTER_PLUGIN__ !== 'function') {
    return;
  }

  const HIGHLIGHT_REGISTRY_KEY = 'bbrush-highlight';
  const HIGHLIGHT_STYLE_ID = 'bbrush-highlight-style';

  function canUseDrawingShortcut(ctx) {
    return ctx.core.enabled && ctx.core.isDrawingMode && !ctx.core.isTemporaryPassthrough;
  }

  function canUseCssHighlights() {
    return (
      typeof CSS !== 'undefined' && typeof Highlight !== 'undefined' && Boolean(CSS.highlights)
    );
  }

  function ensureHighlightStyle() {
    if (!document.head || document.getElementById(HIGHLIGHT_STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = HIGHLIGHT_STYLE_ID;
    style.textContent = `::highlight(${HIGHLIGHT_REGISTRY_KEY}) { background: rgba(255, 232, 115, 0.72); color: inherit; }`;
    document.head.appendChild(style);
  }

  function refreshHighlights(ctx) {
    if (!canUseCssHighlights()) {
      return;
    }

    if (
      !ctx.core.enabled ||
      ctx.core.canvasMode !== 'page' ||
      ctx.pluginState.ranges.length === 0
    ) {
      CSS.highlights.delete(HIGHLIGHT_REGISTRY_KEY);
      return;
    }

    ensureHighlightStyle();
    const highlight = new Highlight();
    for (const range of ctx.pluginState.ranges) {
      highlight.add(range);
    }
    CSS.highlights.set(HIGHLIGHT_REGISTRY_KEY, highlight);
  }

  function clearHighlights(ctx) {
    if (ctx.pluginState.ranges.length === 0) {
      return false;
    }

    ctx.pluginState.ranges = [];
    refreshHighlights(ctx);
    return true;
  }

  function isRangeHighlightable(ctx, range) {
    if (!range || range.collapsed) {
      return false;
    }

    const container = range.commonAncestorContainer;
    const containerElement =
      container && container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;

    if (!containerElement || !document.body.contains(containerElement)) {
      return false;
    }

    if (ctx.core.toolbarHost && containerElement.closest('#bbrush-toolbar-host')) {
      return false;
    }

    if (
      containerElement.closest(
        'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
      )
    ) {
      return false;
    }

    return true;
  }

  function highlightCurrentSelection(ctx) {
    if (!canUseCssHighlights()) {
      return false;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return false;
    }

    const range = selection.getRangeAt(0);
    if (!isRangeHighlightable(ctx, range)) {
      return false;
    }

    ctx.pluginState.ranges.push(range.cloneRange());
    selection.removeAllRanges();
    refreshHighlights(ctx);
    return true;
  }

  function getCaretPositionFromPoint(clientX, clientY) {
    if (document.caretPositionFromPoint) {
      const caret = document.caretPositionFromPoint(clientX, clientY);
      if (caret && caret.offsetNode) {
        return { node: caret.offsetNode, offset: caret.offset };
      }
    }

    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(clientX, clientY);
      if (range && range.startContainer) {
        return { node: range.startContainer, offset: range.startOffset };
      }
    }

    return null;
  }

  function removeHighlightAtPoint(ctx, clientX, clientY) {
    if (ctx.pluginState.ranges.length === 0) {
      return false;
    }

    const caret = getCaretPositionFromPoint(clientX, clientY);
    if (!caret) {
      return false;
    }

    for (let index = ctx.pluginState.ranges.length - 1; index >= 0; index -= 1) {
      const range = ctx.pluginState.ranges[index];
      try {
        if (range.isPointInRange(caret.node, caret.offset)) {
          ctx.pluginState.ranges.splice(index, 1);
          refreshHighlights(ctx);
          return true;
        }
      } catch {
        continue;
      }
    }

    return false;
  }

  window.__BBRUSH_REGISTER_PLUGIN__({
    id: 'highlight',
    kind: 'tool',
    order: 60,
    launcherLabel: 'H',
    usesCanvasPointerEvents: false,
    setup() {
      return {
        ranges: []
      };
    },
    toolbarItems: [
      {
        id: 'tool-highlight',
        order: 60,
        ariaLabel: 'Highlight tool',
        title: 'Highlight tool (H)',
        icon: `
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 16l5-5 4 4-5 5H6z" />
            <path d="M13 9l2-2 3 3-2 2" />
            <path d="M4 20h10" />
          </svg>
        `,
        onClick(ctx) {
          ctx.setActiveTool('highlight');
          return true;
        },
        isActive(ctx) {
          return ctx.core.activeToolId === 'highlight';
        },
        isDisabled(ctx) {
          return !ctx.core.isDrawingMode;
        }
      }
    ],
    shortcutItems: [
      { order: 60, text: 'H - Highlight text' },
      { order: 61, text: 'Alt + Click (Highlight) - Remove highlight' }
    ],
    keybindings: [
      {
        key: 'h',
        order: 60,
        when(ctx) {
          return canUseDrawingShortcut(ctx);
        },
        run(ctx) {
          ctx.setActiveTool('highlight');
          return true;
        }
      }
    ],
    onToolActivate(ctx) {
      if (ctx.core.canvasMode === 'whiteboard') {
        ctx.setCanvasMode('page', { autoEnableDrawing: false });
      }
    },
    onOverlayEnable(ctx) {
      refreshHighlights(ctx);
    },
    onOverlayDisable(ctx) {
      refreshHighlights(ctx);
    },
    onCanvasModeChange(ctx) {
      refreshHighlights(ctx);
    },
    onClearAll(ctx, payload) {
      if (payload.canvasMode !== 'page') {
        return false;
      }

      return clearHighlights(ctx);
    },
    onDocumentPointerUpCapture(ctx, event) {
      if (!ctx.core.enabled || !ctx.core.isDrawingMode || ctx.core.activeToolId !== 'highlight') {
        return;
      }

      if (ctx.core.canvasMode !== 'page' || ctx.core.isTemporaryPassthrough) {
        return;
      }

      if (event.button !== 0) {
        return;
      }

      if (ctx.core.toolbarHost && event.composedPath().includes(ctx.core.toolbarHost)) {
        return;
      }

      if (event.altKey) {
        if (removeHighlightAtPoint(ctx, event.clientX, event.clientY)) {
          event.preventDefault();
        }
        return;
      }

      window.setTimeout(() => {
        highlightCurrentSelection(ctx);
      }, 0);
    }
  });
})();
