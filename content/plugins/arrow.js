(function registerBbrushArrowPlugin() {
  if (typeof window.__BBRUSH_REGISTER_PLUGIN__ !== 'function') {
    return;
  }

  function canUseDrawingShortcut(ctx) {
    return ctx.core.enabled && ctx.core.isDrawingMode && !ctx.core.isTemporaryPassthrough;
  }

  function getSelectedArrow(ctx) {
    if (ctx.pluginState.selectedId === null) {
      return null;
    }

    return ctx.scene.findEntryById(ctx.pluginState.selectedId, 'arrow');
  }

  function getHandlePoints(entry) {
    return {
      start: { x: entry.x1, y: entry.y1 },
      end: { x: entry.x2, y: entry.y2 }
    };
  }

  function hitTestArrowHandle(ctx, point, entry) {
    const handles = getHandlePoints(entry);
    const half = ctx.constants.ANCHOR_SIZE / 2;

    for (const [key, handle] of Object.entries(handles)) {
      if (
        point.x >= handle.x - half &&
        point.x <= handle.x + half &&
        point.y >= handle.y - half &&
        point.y <= handle.y + half
      ) {
        return key;
      }
    }

    return null;
  }

  function hitTestArrowBody(ctx, point, entry) {
    const distance = ctx.utils.distancePointToSegment(
      point,
      { x: entry.x1, y: entry.y1 },
      { x: entry.x2, y: entry.y2 }
    );
    const threshold = Math.max(8, entry.size + 4);
    return distance <= threshold;
  }

  function findTopArrowAtPoint(ctx, point) {
    const entries = ctx.scene.getEntries();

    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (entry.type !== 'arrow') {
        continue;
      }

      if (hitTestArrowBody(ctx, point, entry)) {
        return entry;
      }
    }

    return null;
  }

  function drawArrowEntry(ctx, entry) {
    if (!ctx.core.context || !entry) {
      return;
    }

    const dx = entry.x2 - entry.x1;
    const dy = entry.y2 - entry.y1;
    const length = Math.hypot(dx, dy);

    if (length < 1) {
      return;
    }

    const ux = dx / length;
    const uy = dy / length;
    const headLength = Math.max(16, Math.min(length * 0.28, 42), entry.size * 3.8);
    const headWidth = Math.max(12, Math.min(length * 0.18, 30), entry.size * 3.1);
    const shaftEndX = entry.x2 - ux * headLength;
    const shaftEndY = entry.y2 - uy * headLength;
    const perpX = -uy;
    const perpY = ux;

    ctx.core.context.save();
    ctx.core.context.strokeStyle = entry.color;
    ctx.core.context.fillStyle = entry.color;
    ctx.core.context.lineWidth = entry.size;
    ctx.core.context.lineCap = 'round';
    ctx.core.context.lineJoin = 'round';

    ctx.core.context.beginPath();
    ctx.core.context.moveTo(entry.x1, entry.y1);
    ctx.core.context.lineTo(entry.x2, entry.y2);
    ctx.core.context.stroke();

    ctx.core.context.beginPath();
    ctx.core.context.arc(entry.x1, entry.y1, Math.max(1.8, entry.size * 0.35), 0, Math.PI * 2);
    ctx.core.context.fill();

    ctx.core.context.beginPath();
    ctx.core.context.moveTo(entry.x2, entry.y2);
    ctx.core.context.lineTo(
      shaftEndX + perpX * (headWidth / 2),
      shaftEndY + perpY * (headWidth / 2)
    );
    ctx.core.context.lineTo(
      shaftEndX - perpX * (headWidth / 2),
      shaftEndY - perpY * (headWidth / 2)
    );
    ctx.core.context.closePath();
    ctx.core.context.fill();
    ctx.core.context.restore();
  }

  function drawArrowSelection(ctx, entry) {
    const handles = getHandlePoints(entry);
    const half = ctx.constants.ANCHOR_SIZE / 2;

    ctx.core.context.save();
    ctx.core.context.strokeStyle = '#0a84ff';
    ctx.core.context.lineWidth = 1;
    ctx.core.context.setLineDash([5, 3]);
    ctx.core.context.beginPath();
    ctx.core.context.moveTo(entry.x1, entry.y1);
    ctx.core.context.lineTo(entry.x2, entry.y2);
    ctx.core.context.stroke();
    ctx.core.context.setLineDash([]);

    for (const handle of Object.values(handles)) {
      ctx.core.context.fillStyle = '#ffffff';
      ctx.core.context.strokeStyle = '#0a84ff';
      ctx.core.context.lineWidth = 1.2;
      ctx.core.context.fillRect(
        handle.x - half,
        handle.y - half,
        ctx.constants.ANCHOR_SIZE,
        ctx.constants.ANCHOR_SIZE
      );
      ctx.core.context.strokeRect(
        handle.x - half,
        handle.y - half,
        ctx.constants.ANCHOR_SIZE,
        ctx.constants.ANCHOR_SIZE
      );
    }

    ctx.core.context.restore();
  }

  function clearInteraction(state) {
    state.currentEntry = null;
    state.interactionMode = 'none';
    state.interactionPointerId = null;
    state.interactionStartPoint = null;
    state.interactionStartEntry = null;
  }

  function isTransformChanged(entry, startEntry) {
    if (!entry || !startEntry) {
      return false;
    }

    return (
      entry.x1 !== startEntry.x1 ||
      entry.y1 !== startEntry.y1 ||
      entry.x2 !== startEntry.x2 ||
      entry.y2 !== startEntry.y2
    );
  }

  window.__BBRUSH_REGISTER_PLUGIN__({
    id: 'arrow',
    kind: 'tool',
    order: 30,
    entryTypes: ['arrow'],
    launcherLabel: 'A',
    usesCanvasPointerEvents: true,
    setup() {
      return {
        selectedId: null,
        currentEntry: null,
        interactionMode: 'none',
        interactionPointerId: null,
        interactionStartPoint: null,
        interactionStartEntry: null
      };
    },
    toolbarItems: [
      {
        id: 'tool-arrow',
        order: 30,
        ariaLabel: 'Arrow tool',
        title: 'Arrow tool (A)',
        icon: `
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 20L20 4" />
            <path d="M11 4h9v9" />
          </svg>
        `,
        onClick(ctx) {
          ctx.setActiveTool('arrow');
          return true;
        },
        isActive(ctx) {
          return ctx.core.activeToolId === 'arrow';
        },
        isDisabled(ctx) {
          return !ctx.core.isDrawingMode;
        }
      }
    ],
    shortcutItems: [{ order: 30, text: 'A - Arrow' }],
    keybindings: [
      {
        key: 'a',
        order: 30,
        when(ctx) {
          return canUseDrawingShortcut(ctx);
        },
        run(ctx) {
          ctx.setActiveTool('arrow');
          return true;
        }
      }
    ],
    clearSelection(ctx) {
      const hadSelection = ctx.pluginState.selectedId !== null;
      const hadInteraction =
        ctx.pluginState.currentEntry !== null || ctx.pluginState.interactionMode !== 'none';

      ctx.pluginState.selectedId = null;
      ctx.utils.releasePointerCapture(ctx.pluginState.interactionPointerId);
      clearInteraction(ctx.pluginState);
      return hadSelection || hadInteraction;
    },
    isInteracting(ctx) {
      return ctx.pluginState.currentEntry !== null || ctx.pluginState.interactionMode !== 'none';
    },
    onSceneChanged(ctx) {
      if (!getSelectedArrow(ctx)) {
        ctx.pluginState.selectedId = null;
      }

      ctx.utils.releasePointerCapture(ctx.pluginState.interactionPointerId);
      clearInteraction(ctx.pluginState);
    },
    getCanvasCursor(ctx, point) {
      if (ctx.pluginState.interactionMode === 'drag-arrow') {
        return 'grabbing';
      }

      if (
        ctx.pluginState.interactionMode === 'resize-arrow-start' ||
        ctx.pluginState.interactionMode === 'resize-arrow-end'
      ) {
        return 'crosshair';
      }

      if (!point) {
        return 'crosshair';
      }

      const selectedArrow = getSelectedArrow(ctx);
      if (selectedArrow) {
        const handle = hitTestArrowHandle(ctx, point, selectedArrow);
        if (handle) {
          return 'crosshair';
        }

        if (hitTestArrowBody(ctx, point, selectedArrow)) {
          return 'move';
        }
      }

      return findTopArrowAtPoint(ctx, point) ? 'move' : 'crosshair';
    },
    onPointerDown(ctx, event) {
      event.preventDefault();
      const point = ctx.utils.getCanvasPoint(event);
      const selectedArrow = getSelectedArrow(ctx);

      if (selectedArrow) {
        const handle = hitTestArrowHandle(ctx, point, selectedArrow);
        if (handle) {
          ctx.pluginState.interactionMode =
            handle === 'start' ? 'resize-arrow-start' : 'resize-arrow-end';
          ctx.pluginState.interactionPointerId = event.pointerId;
          ctx.pluginState.interactionStartPoint = point;
          ctx.pluginState.interactionStartEntry = {
            x1: selectedArrow.x1,
            y1: selectedArrow.y1,
            x2: selectedArrow.x2,
            y2: selectedArrow.y2
          };
          ctx.core.canvas.setPointerCapture(event.pointerId);
          ctx.updateCanvasCursor(point);
          return;
        }

        if (hitTestArrowBody(ctx, point, selectedArrow)) {
          ctx.pluginState.interactionMode = 'drag-arrow';
          ctx.pluginState.interactionPointerId = event.pointerId;
          ctx.pluginState.interactionStartPoint = point;
          ctx.pluginState.interactionStartEntry = {
            x1: selectedArrow.x1,
            y1: selectedArrow.y1,
            x2: selectedArrow.x2,
            y2: selectedArrow.y2
          };
          ctx.core.canvas.setPointerCapture(event.pointerId);
          ctx.updateCanvasCursor(point);
          return;
        }
      }

      const clickedArrow = findTopArrowAtPoint(ctx, point);
      if (clickedArrow) {
        ctx.clearSelection({
          reason: 'arrow-selected',
          exceptPluginId: 'arrow',
          render: false
        });
        ctx.pluginState.selectedId = clickedArrow.id;
        ctx.pluginState.interactionMode = 'drag-arrow';
        ctx.pluginState.interactionPointerId = event.pointerId;
        ctx.pluginState.interactionStartPoint = point;
        ctx.pluginState.interactionStartEntry = {
          x1: clickedArrow.x1,
          y1: clickedArrow.y1,
          x2: clickedArrow.x2,
          y2: clickedArrow.y2
        };
        ctx.core.canvas.setPointerCapture(event.pointerId);
        ctx.requestRender();
        ctx.updateCanvasCursor(point);
        return;
      }

      ctx.clearSelection({
        reason: 'arrow-draft',
        exceptPluginId: 'arrow',
        render: false
      });
      ctx.pluginState.selectedId = null;
      clearInteraction(ctx.pluginState);
      ctx.pluginState.currentEntry = {
        id: ctx.generateEntryId(),
        type: 'arrow',
        color: ctx.shared.brushColor,
        size: ctx.shared.penSize,
        x1: point.x,
        y1: point.y,
        x2: point.x,
        y2: point.y
      };
      ctx.requestRender();
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

      const selectedArrow = getSelectedArrow(ctx);

      if (
        ctx.pluginState.interactionMode === 'drag-arrow' &&
        selectedArrow &&
        ctx.pluginState.interactionStartPoint &&
        ctx.pluginState.interactionStartEntry
      ) {
        const dx = point.x - ctx.pluginState.interactionStartPoint.x;
        const dy = point.y - ctx.pluginState.interactionStartPoint.y;
        selectedArrow.x1 = ctx.pluginState.interactionStartEntry.x1 + dx;
        selectedArrow.y1 = ctx.pluginState.interactionStartEntry.y1 + dy;
        selectedArrow.x2 = ctx.pluginState.interactionStartEntry.x2 + dx;
        selectedArrow.y2 = ctx.pluginState.interactionStartEntry.y2 + dy;
        ctx.requestRender();
        ctx.updateCanvasCursor(point);
        return;
      }

      if (
        ctx.pluginState.interactionMode === 'resize-arrow-start' &&
        selectedArrow &&
        ctx.pluginState.interactionStartEntry
      ) {
        selectedArrow.x1 = point.x;
        selectedArrow.y1 = point.y;
        ctx.requestRender();
        ctx.updateCanvasCursor(point);
        return;
      }

      if (
        ctx.pluginState.interactionMode === 'resize-arrow-end' &&
        selectedArrow &&
        ctx.pluginState.interactionStartEntry
      ) {
        selectedArrow.x2 = point.x;
        selectedArrow.y2 = point.y;
        ctx.requestRender();
        ctx.updateCanvasCursor(point);
        return;
      }

      if (ctx.pluginState.currentEntry) {
        ctx.pluginState.currentEntry.x2 = point.x;
        ctx.pluginState.currentEntry.y2 = point.y;
        ctx.requestRender();
        return;
      }

      ctx.updateCanvasCursor(point);
    },
    onPointerUp(ctx, event) {
      const selectedArrow = getSelectedArrow(ctx);
      let didCommit = false;

      if (
        selectedArrow &&
        ctx.pluginState.interactionMode !== 'none' &&
        ctx.pluginState.interactionStartEntry &&
        isTransformChanged(selectedArrow, ctx.pluginState.interactionStartEntry)
      ) {
        ctx.history.pushSnapshot();
        didCommit = true;
      }

      ctx.utils.releasePointerCapture(
        event.pointerId === ctx.pluginState.interactionPointerId
          ? ctx.pluginState.interactionPointerId
          : null
      );

      if (ctx.pluginState.currentEntry) {
        const dx = ctx.pluginState.currentEntry.x2 - ctx.pluginState.currentEntry.x1;
        const dy = ctx.pluginState.currentEntry.y2 - ctx.pluginState.currentEntry.y1;

        if (Math.hypot(dx, dy) >= 3) {
          ctx.scene.getEntries().push(ctx.pluginState.currentEntry);
          ctx.pluginState.selectedId = ctx.pluginState.currentEntry.id;
          ctx.history.pushSnapshot();
          didCommit = true;
        }
      }

      clearInteraction(ctx.pluginState);

      if (!didCommit) {
        ctx.requestRender();
      } else {
        ctx.updateCanvasCursor();
      }
    },
    onRenderEntry(ctx, entry) {
      drawArrowEntry(ctx, entry);
    },
    onRenderOverlay(ctx) {
      if (ctx.pluginState.currentEntry) {
        drawArrowEntry(ctx, ctx.pluginState.currentEntry);
      }

      if (ctx.core.activeToolId !== 'arrow') {
        return;
      }

      const selectedArrow = getSelectedArrow(ctx);
      if (selectedArrow) {
        drawArrowSelection(ctx, selectedArrow);
      }
    }
  });
})();
