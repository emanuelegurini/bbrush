(function registerBbrushTextPlugin() {
  if (typeof window.__BBRUSH_REGISTER_PLUGIN__ !== 'function') {
    return;
  }

  function canUseDrawingShortcut(ctx) {
    return ctx.core.enabled && ctx.core.isDrawingMode && !ctx.core.isTemporaryPassthrough;
  }

  function isUndoPressed(event) {
    const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
    return (event.ctrlKey || event.metaKey) && key === 'z';
  }

  function getTextFontSize(ctx) {
    return Math.max(12, ctx.shared.textSize);
  }

  function updateTextBounds(ctx, entry) {
    if (!entry || entry.type !== 'text') {
      return;
    }

    const bounds = ctx.utils.measureTextBounds(entry.text, entry.fontSize);
    entry.width = bounds.width;
    entry.height = bounds.height;
  }

  function getTextBounds(entry) {
    return {
      left: entry.x,
      top: entry.y,
      right: entry.x + entry.width,
      bottom: entry.y + entry.height,
      width: entry.width,
      height: entry.height
    };
  }

  function getSelectedText(ctx) {
    if (ctx.pluginState.selectedId === null) {
      return null;
    }

    return ctx.scene.findEntryById(ctx.pluginState.selectedId, 'text');
  }

  function hitTestTextBody(point, entry) {
    const bounds = getTextBounds(entry);
    return (
      point.x >= bounds.left &&
      point.x <= bounds.right &&
      point.y >= bounds.top &&
      point.y <= bounds.bottom
    );
  }

  function hitTestTextAnchor(ctx, point, entry) {
    const anchors = ctx.utils.getAnchorPoints(getTextBounds(entry));
    const half = ctx.constants.ANCHOR_SIZE / 2;

    for (const [anchorKey, anchorPoint] of Object.entries(anchors)) {
      if (
        point.x >= anchorPoint.x - half &&
        point.x <= anchorPoint.x + half &&
        point.y >= anchorPoint.y - half &&
        point.y <= anchorPoint.y + half
      ) {
        return anchorKey;
      }
    }

    return null;
  }

  function findTopTextAtPoint(ctx, point) {
    const entries = ctx.scene.getEntries();

    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (entry.type !== 'text') {
        continue;
      }

      if (hitTestTextBody(point, entry)) {
        return entry;
      }
    }

    return null;
  }

  function drawTextEntry(ctx, entry) {
    if (!ctx.core.context || !entry || !entry.text) {
      return;
    }

    updateTextBounds(ctx, entry);
    ctx.core.context.fillStyle = entry.color;
    ctx.core.context.font = `${entry.fontSize}px Arial, sans-serif`;
    ctx.core.context.textBaseline = 'top';
    ctx.core.context.fillText(entry.text, entry.x, entry.y);
  }

  function drawTextSelection(ctx, entry) {
    const bounds = getTextBounds(entry);
    const anchors = ctx.utils.getAnchorPoints(bounds);
    const half = ctx.constants.ANCHOR_SIZE / 2;

    ctx.core.context.save();
    ctx.core.context.strokeStyle = '#0a84ff';
    ctx.core.context.lineWidth = 1;
    ctx.core.context.setLineDash([4, 3]);
    ctx.core.context.strokeRect(bounds.left, bounds.top, bounds.width, bounds.height);
    ctx.core.context.setLineDash([]);

    for (const anchor of Object.values(anchors)) {
      ctx.core.context.fillStyle = '#ffffff';
      ctx.core.context.strokeStyle = '#0a84ff';
      ctx.core.context.lineWidth = 1.25;
      ctx.core.context.fillRect(
        anchor.x - half,
        anchor.y - half,
        ctx.constants.ANCHOR_SIZE,
        ctx.constants.ANCHOR_SIZE
      );
      ctx.core.context.strokeRect(
        anchor.x - half,
        anchor.y - half,
        ctx.constants.ANCHOR_SIZE,
        ctx.constants.ANCHOR_SIZE
      );
    }

    ctx.core.context.restore();
  }

  function clearInteraction(state) {
    state.interactionMode = 'none';
    state.activeAnchor = null;
    state.interactionPointerId = null;
    state.interactionStartPoint = null;
    state.interactionStartEntry = null;
    state.textCloneCreatedOnDrag = false;
  }

  function removeEditor(ctx, commit) {
    if (!ctx.pluginState.editor || !ctx.pluginState.editor.element) {
      return false;
    }

    const input = ctx.pluginState.editor.element;
    const textValue = input.value;
    const editorPoint = {
      x: ctx.pluginState.editor.x,
      y: ctx.pluginState.editor.y
    };
    const editorColor = ctx.pluginState.editor.color;
    const editorFontSize = ctx.pluginState.editor.fontSize;

    input.remove();
    ctx.pluginState.editor = null;

    if (commit && textValue.trim()) {
      commitTextAt(ctx, editorPoint, textValue, editorColor, editorFontSize);
    } else {
      ctx.requestRender();
    }

    return true;
  }

  function commitTextAt(ctx, point, text, color, fontSize) {
    if (!text.trim()) {
      return;
    }

    const entry = {
      id: ctx.generateEntryId(),
      type: 'text',
      text,
      x: point.x,
      y: point.y,
      color,
      fontSize,
      width: 0,
      height: 0
    };

    updateTextBounds(ctx, entry);
    ctx.scene.getEntries().push(entry);
    ctx.pluginState.selectedId = entry.id;
    ctx.history.pushSnapshot();
    ctx.requestRender();
  }

  function openTextEditorAt(ctx, point) {
    removeEditor(ctx, false);

    const canvasRect = ctx.core.canvas.getBoundingClientRect();
    const viewportX = canvasRect.left + point.x;
    const viewportY = canvasRect.top + point.y;
    const input = document.createElement('input');
    const editorColor = ctx.shared.brushColor;
    const editorFontSize = getTextFontSize(ctx);

    input.type = 'text';
    input.placeholder = 'Type text';
    input.style.position = 'fixed';
    input.style.left = `${viewportX}px`;
    input.style.top = `${viewportY}px`;
    input.style.zIndex = '2147483647';
    input.style.color = editorColor;
    input.style.fontSize = `${editorFontSize}px`;
    input.style.fontFamily = 'Arial, sans-serif';
    input.style.background = 'transparent';
    input.style.border = '1px dashed rgba(255, 255, 255, 0.5)';
    input.style.borderRadius = '4px';
    input.style.padding = '2px 4px';
    input.style.minWidth = '120px';
    input.style.outline = 'none';

    document.body.appendChild(input);
    input.focus();

    ctx.pluginState.selectedId = null;
    ctx.pluginState.editor = {
      element: input,
      x: point.x,
      y: point.y,
      color: editorColor,
      fontSize: editorFontSize
    };

    let isFinalized = false;

    function finalize(commit) {
      if (isFinalized || !ctx.pluginState.editor || ctx.pluginState.editor.element !== input) {
        return;
      }

      isFinalized = true;
      removeEditor(ctx, commit);
    }

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finalize(true);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        finalize(false);
      }
    });

    input.addEventListener('blur', () => {
      finalize(true);
    });
  }

  function cloneTextEntry(ctx, entry) {
    if (!entry) {
      return null;
    }

    const clone = {
      id: ctx.generateEntryId(),
      type: 'text',
      text: entry.text,
      x: entry.x,
      y: entry.y,
      color: entry.color,
      fontSize: entry.fontSize,
      width: entry.width,
      height: entry.height
    };

    ctx.scene.getEntries().push(clone);
    return clone;
  }

  function isTransformChanged(entry, startEntry) {
    if (!entry || !startEntry) {
      return false;
    }

    return (
      entry.x !== startEntry.x ||
      entry.y !== startEntry.y ||
      entry.fontSize !== startEntry.fontSize ||
      entry.width !== startEntry.width ||
      entry.height !== startEntry.height
    );
  }

  function applyTextResize(ctx, point) {
    const selectedText = getSelectedText(ctx);
    if (
      !selectedText ||
      !ctx.pluginState.interactionStartEntry ||
      !ctx.pluginState.interactionStartPoint ||
      !ctx.pluginState.activeAnchor
    ) {
      return;
    }

    const dx = point.x - ctx.pluginState.interactionStartPoint.x;
    const dy = point.y - ctx.pluginState.interactionStartPoint.y;
    let delta = 0;

    if (ctx.pluginState.activeAnchor.length === 2) {
      const horizontal = ctx.pluginState.activeAnchor.includes('e') ? dx : -dx;
      const vertical = ctx.pluginState.activeAnchor.includes('s') ? dy : -dy;
      delta = (horizontal + vertical) / 2;
    } else if (ctx.pluginState.activeAnchor === 'e') {
      delta = dx;
    } else if (ctx.pluginState.activeAnchor === 'w') {
      delta = -dx;
    } else if (ctx.pluginState.activeAnchor === 's') {
      delta = dy;
    } else if (ctx.pluginState.activeAnchor === 'n') {
      delta = -dy;
    }

    selectedText.fontSize = Math.max(
      ctx.constants.MIN_TEXT_SIZE,
      Math.round(ctx.pluginState.interactionStartEntry.fontSize + delta * 0.2)
    );
    updateTextBounds(ctx, selectedText);
    selectedText.x = ctx.pluginState.interactionStartEntry.x;
    selectedText.y = ctx.pluginState.interactionStartEntry.y;

    if (ctx.pluginState.activeAnchor.includes('w')) {
      selectedText.x =
        ctx.pluginState.interactionStartEntry.x +
        (ctx.pluginState.interactionStartEntry.width - selectedText.width);
    }

    if (ctx.pluginState.activeAnchor.includes('n')) {
      selectedText.y =
        ctx.pluginState.interactionStartEntry.y +
        (ctx.pluginState.interactionStartEntry.height - selectedText.height);
    }

    selectedText.x = Math.max(0, selectedText.x);
    selectedText.y = Math.max(0, selectedText.y);
  }

  window.__BBRUSH_REGISTER_PLUGIN__({
    id: 'text',
    kind: 'tool',
    order: 50,
    entryTypes: ['text'],
    launcherLabel: 'T',
    usesCanvasPointerEvents: true,
    setup() {
      return {
        selectedId: null,
        editor: null,
        interactionMode: 'none',
        activeAnchor: null,
        interactionPointerId: null,
        interactionStartPoint: null,
        interactionStartEntry: null,
        textCloneCreatedOnDrag: false
      };
    },
    toolbarItems: [
      {
        id: 'tool-text',
        order: 50,
        ariaLabel: 'Text tool',
        title: 'Text tool (T)',
        icon: `
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 6h14" />
            <path d="M12 6v12" />
            <path d="M8 18h8" />
          </svg>
        `,
        onClick(ctx) {
          ctx.setActiveTool('text');
          return true;
        },
        isActive(ctx) {
          return ctx.core.activeToolId === 'text';
        },
        isDisabled(ctx) {
          return !ctx.core.isDrawingMode;
        }
      }
    ],
    shortcutItems: [
      { order: 50, text: 'T - Text' },
      { order: 51, text: 'Alt/Option + Drag (Text) - Duplicate text' }
    ],
    keybindings: [
      {
        key: 't',
        order: 50,
        when(ctx) {
          return canUseDrawingShortcut(ctx);
        },
        run(ctx) {
          ctx.setActiveTool('text');
          return true;
        }
      }
    ],
    clearSelection(ctx) {
      const hadSelection = ctx.pluginState.selectedId !== null;
      const hadInteraction =
        ctx.pluginState.interactionMode !== 'none' || ctx.pluginState.editor !== null;

      ctx.pluginState.selectedId = null;
      ctx.utils.releasePointerCapture(ctx.pluginState.interactionPointerId);
      clearInteraction(ctx.pluginState);
      removeEditor(ctx, false);
      return hadSelection || hadInteraction;
    },
    isInteracting(ctx) {
      return ctx.pluginState.interactionMode !== 'none' || Boolean(ctx.pluginState.editor);
    },
    shouldBlockKeybindings(ctx, event) {
      if (!ctx.pluginState.editor) {
        return false;
      }

      const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
      return !isUndoPressed(event) && key !== 'escape';
    },
    onSceneChanged(ctx) {
      if (!getSelectedText(ctx)) {
        ctx.pluginState.selectedId = null;
      }

      ctx.utils.releasePointerCapture(ctx.pluginState.interactionPointerId);
      clearInteraction(ctx.pluginState);
    },
    getCanvasCursor(ctx, point) {
      if (ctx.pluginState.interactionMode === 'drag-text') {
        return 'grabbing';
      }

      if (ctx.pluginState.interactionMode === 'resize-text' && ctx.pluginState.activeAnchor) {
        return ctx.utils.getAnchorCursor(ctx.pluginState.activeAnchor);
      }

      if (!point) {
        return 'text';
      }

      const selectedText = getSelectedText(ctx);
      if (selectedText) {
        const anchor = hitTestTextAnchor(ctx, point, selectedText);
        if (anchor) {
          return ctx.utils.getAnchorCursor(anchor);
        }

        if (hitTestTextBody(point, selectedText)) {
          return 'move';
        }
      }

      return findTopTextAtPoint(ctx, point) ? 'move' : 'text';
    },
    onPointerDown(ctx, event) {
      event.preventDefault();
      const point = ctx.utils.getCanvasPoint(event);
      const selectedText = getSelectedText(ctx);
      ctx.pluginState.textCloneCreatedOnDrag = false;

      if (selectedText) {
        const anchor = hitTestTextAnchor(ctx, point, selectedText);
        if (anchor) {
          ctx.pluginState.interactionMode = 'resize-text';
          ctx.pluginState.activeAnchor = anchor;
          ctx.pluginState.interactionPointerId = event.pointerId;
          ctx.pluginState.interactionStartPoint = point;
          ctx.pluginState.interactionStartEntry = {
            x: selectedText.x,
            y: selectedText.y,
            width: selectedText.width,
            height: selectedText.height,
            fontSize: selectedText.fontSize
          };
          ctx.core.canvas.setPointerCapture(event.pointerId);
          ctx.updateCanvasCursor(point);
          return;
        }

        if (hitTestTextBody(point, selectedText)) {
          let textForDrag = selectedText;
          if (event.altKey) {
            const clone = cloneTextEntry(ctx, selectedText);
            if (clone) {
              textForDrag = clone;
              ctx.pluginState.selectedId = clone.id;
              ctx.pluginState.textCloneCreatedOnDrag = true;
            }
          }

          ctx.pluginState.interactionMode = 'drag-text';
          ctx.pluginState.interactionPointerId = event.pointerId;
          ctx.pluginState.interactionStartPoint = point;
          ctx.pluginState.interactionStartEntry = {
            x: textForDrag.x,
            y: textForDrag.y,
            width: textForDrag.width,
            height: textForDrag.height,
            fontSize: textForDrag.fontSize
          };
          ctx.core.canvas.setPointerCapture(event.pointerId);
          ctx.requestRender();
          ctx.updateCanvasCursor(point);
          return;
        }
      }

      const clickedText = findTopTextAtPoint(ctx, point);
      if (clickedText) {
        ctx.clearSelection({
          reason: 'text-selected',
          exceptPluginId: 'text',
          render: false
        });

        let textForDrag = clickedText;
        if (event.altKey) {
          const clone = cloneTextEntry(ctx, clickedText);
          if (clone) {
            textForDrag = clone;
            ctx.pluginState.textCloneCreatedOnDrag = true;
          }
        }

        ctx.pluginState.selectedId = textForDrag.id;
        ctx.pluginState.interactionMode = 'drag-text';
        ctx.pluginState.interactionPointerId = event.pointerId;
        ctx.pluginState.interactionStartPoint = point;
        ctx.pluginState.interactionStartEntry = {
          x: textForDrag.x,
          y: textForDrag.y,
          width: textForDrag.width,
          height: textForDrag.height,
          fontSize: textForDrag.fontSize
        };
        ctx.core.canvas.setPointerCapture(event.pointerId);
        ctx.requestRender();
        ctx.updateCanvasCursor(point);
        return;
      }

      ctx.clearSelection({
        reason: 'text-editor',
        exceptPluginId: 'text',
        render: false
      });
      ctx.pluginState.selectedId = null;
      ctx.requestRender();
      openTextEditorAt(ctx, point);
    },
    onPointerMove(ctx, event) {
      const point = ctx.utils.getCanvasPoint(event);

      if (
        ctx.pluginState.interactionMode !== 'none' &&
        ctx.pluginState.interactionPointerId !== null &&
        event.pointerId !== ctx.pluginState.interactionPointerId
      ) {
        return;
      }

      const selectedText = getSelectedText(ctx);

      if (
        ctx.pluginState.interactionMode === 'drag-text' &&
        selectedText &&
        ctx.pluginState.interactionStartPoint &&
        ctx.pluginState.interactionStartEntry
      ) {
        const dx = point.x - ctx.pluginState.interactionStartPoint.x;
        const dy = point.y - ctx.pluginState.interactionStartPoint.y;
        selectedText.x = Math.max(0, ctx.pluginState.interactionStartEntry.x + dx);
        selectedText.y = Math.max(0, ctx.pluginState.interactionStartEntry.y + dy);
        ctx.requestRender();
        ctx.updateCanvasCursor(point);
        return;
      }

      if (ctx.pluginState.interactionMode === 'resize-text' && selectedText) {
        applyTextResize(ctx, point);
        ctx.requestRender();
        ctx.updateCanvasCursor(point);
        return;
      }

      ctx.updateCanvasCursor(point);
    },
    onPointerUp(ctx, event) {
      const selectedText = getSelectedText(ctx);
      let didCommit = false;

      if (
        selectedText &&
        (ctx.pluginState.interactionMode === 'drag-text' ||
          ctx.pluginState.interactionMode === 'resize-text') &&
        ctx.pluginState.interactionStartEntry &&
        (isTransformChanged(selectedText, ctx.pluginState.interactionStartEntry) ||
          ctx.pluginState.textCloneCreatedOnDrag)
      ) {
        ctx.history.pushSnapshot();
        didCommit = true;
      }

      ctx.utils.releasePointerCapture(
        event.pointerId === ctx.pluginState.interactionPointerId
          ? ctx.pluginState.interactionPointerId
          : null
      );

      clearInteraction(ctx.pluginState);

      if (!didCommit) {
        ctx.requestRender();
      } else {
        ctx.updateCanvasCursor();
      }
    },
    onRenderEntry(ctx, entry) {
      drawTextEntry(ctx, entry);
    },
    onRenderOverlay(ctx) {
      if (ctx.core.activeToolId !== 'text') {
        return;
      }

      const selectedText = getSelectedText(ctx);
      if (selectedText) {
        drawTextSelection(ctx, selectedText);
      }
    }
  });
})();
