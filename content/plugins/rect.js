(function registerBbrushRectPlugin() {
  if (typeof window.__BBRUSH_REGISTER_PLUGIN__ !== 'function') {
    return;
  }

  function canUseDrawingShortcut(ctx) {
    return ctx.core.enabled && ctx.core.isDrawingMode && !ctx.core.isTemporaryPassthrough;
  }

  function getSelectedRect(ctx) {
    if (ctx.pluginState.selectedId === null) {
      return null;
    }

    return ctx.scene.findEntryById(ctx.pluginState.selectedId, 'rect');
  }

  function getRectBounds(entry) {
    const left = Math.min(entry.x1, entry.x2);
    const right = Math.max(entry.x1, entry.x2);
    const top = Math.min(entry.y1, entry.y2);
    const bottom = Math.max(entry.y1, entry.y2);

    return {
      left,
      right,
      top,
      bottom,
      width: right - left,
      height: bottom - top
    };
  }

  function hitTestRectBody(point, entry) {
    const bounds = getRectBounds(entry);
    const threshold = Math.max(6, entry.size + 3);
    const expandedLeft = bounds.left - threshold;
    const expandedTop = bounds.top - threshold;
    const expandedRight = bounds.right + threshold;
    const expandedBottom = bounds.bottom + threshold;

    if (
      point.x < expandedLeft ||
      point.x > expandedRight ||
      point.y < expandedTop ||
      point.y > expandedBottom
    ) {
      return false;
    }

    const innerLeft = bounds.left + threshold;
    const innerTop = bounds.top + threshold;
    const innerRight = bounds.right - threshold;
    const innerBottom = bounds.bottom - threshold;
    const hasInnerArea = innerLeft <= innerRight && innerTop <= innerBottom;

    if (hasInnerArea) {
      const insideInner =
        point.x >= innerLeft &&
        point.x <= innerRight &&
        point.y >= innerTop &&
        point.y <= innerBottom;
      return !insideInner;
    }

    return true;
  }

  function hitTestRectAnchor(ctx, point, entry) {
    const bounds = getRectBounds(entry);
    const anchors = ctx.utils.getAnchorPoints(bounds);
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

  function findTopRectAtPoint(ctx, point) {
    const entries = ctx.scene.getEntries();

    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (entry.type !== 'rect') {
        continue;
      }

      if (hitTestRectBody(point, entry)) {
        return entry;
      }
    }

    return null;
  }

  function drawRectEntry(ctx, entry) {
    const left = Math.min(entry.x1, entry.x2);
    const top = Math.min(entry.y1, entry.y2);
    const width = Math.abs(entry.x2 - entry.x1);
    const height = Math.abs(entry.y2 - entry.y1);

    ctx.core.context.save();
    ctx.core.context.strokeStyle = entry.color;
    ctx.core.context.lineWidth = entry.size;
    ctx.core.context.lineCap = 'round';
    ctx.core.context.lineJoin = 'round';
    ctx.core.context.strokeRect(left, top, width, height);
    ctx.core.context.restore();
  }

  function drawRectSelection(ctx, entry) {
    const bounds = getRectBounds(entry);
    const anchors = ctx.utils.getAnchorPoints(bounds);
    const half = ctx.constants.ANCHOR_SIZE / 2;

    ctx.core.context.save();
    ctx.core.context.strokeStyle = '#0a84ff';
    ctx.core.context.lineWidth = 1;
    ctx.core.context.setLineDash([5, 3]);
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
    state.currentEntry = null;
    state.interactionMode = 'none';
    state.activeAnchor = null;
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

  function applyRectResize(ctx, point) {
    const selectedRect = getSelectedRect(ctx);
    if (
      !selectedRect ||
      !ctx.pluginState.interactionStartEntry ||
      !ctx.pluginState.interactionStartPoint ||
      !ctx.pluginState.activeAnchor
    ) {
      return;
    }

    const minSize = 6;
    const startBounds = getRectBounds(ctx.pluginState.interactionStartEntry);
    const dx = point.x - ctx.pluginState.interactionStartPoint.x;
    const dy = point.y - ctx.pluginState.interactionStartPoint.y;
    let left = startBounds.left;
    let right = startBounds.right;
    let top = startBounds.top;
    let bottom = startBounds.bottom;

    if (ctx.pluginState.activeAnchor.includes('w')) {
      left = Math.min(startBounds.right - minSize, startBounds.left + dx);
    }

    if (ctx.pluginState.activeAnchor.includes('e')) {
      right = Math.max(startBounds.left + minSize, startBounds.right + dx);
    }

    if (ctx.pluginState.activeAnchor.includes('n')) {
      top = Math.min(startBounds.bottom - minSize, startBounds.top + dy);
    }

    if (ctx.pluginState.activeAnchor.includes('s')) {
      bottom = Math.max(startBounds.top + minSize, startBounds.bottom + dy);
    }

    left = Math.max(0, left);
    top = Math.max(0, top);
    right = Math.min(ctx.core.canvas.width, right);
    bottom = Math.min(ctx.core.canvas.height, bottom);

    selectedRect.x1 = left;
    selectedRect.y1 = top;
    selectedRect.x2 = right;
    selectedRect.y2 = bottom;
  }

  window.__BBRUSH_REGISTER_PLUGIN__({
    id: 'rect',
    kind: 'tool',
    order: 40,
    entryTypes: ['rect'],
    launcherLabel: 'R',
    usesCanvasPointerEvents: true,
    setup() {
      return {
        selectedId: null,
        currentEntry: null,
        interactionMode: 'none',
        activeAnchor: null,
        interactionPointerId: null,
        interactionStartPoint: null,
        interactionStartEntry: null
      };
    },
    toolbarItems: [
      {
        id: 'tool-rect',
        order: 40,
        ariaLabel: 'Rectangle tool',
        title: 'Rectangle tool (R)',
        icon: `
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="5" y="5" width="14" height="14" rx="1" />
          </svg>
        `,
        onClick(ctx) {
          ctx.setActiveTool('rect');
          return true;
        },
        isActive(ctx) {
          return ctx.core.activeToolId === 'rect';
        },
        isDisabled(ctx) {
          return !ctx.core.isDrawingMode;
        }
      }
    ],
    shortcutItems: [{ order: 40, text: 'R - Rectangle' }],
    keybindings: [
      {
        key: 'r',
        order: 40,
        when(ctx) {
          return canUseDrawingShortcut(ctx);
        },
        run(ctx) {
          ctx.setActiveTool('rect');
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
      if (!getSelectedRect(ctx)) {
        ctx.pluginState.selectedId = null;
      }

      ctx.utils.releasePointerCapture(ctx.pluginState.interactionPointerId);
      clearInteraction(ctx.pluginState);
    },
    getCanvasCursor(ctx, point) {
      if (ctx.pluginState.interactionMode === 'drag-rect') {
        return 'grabbing';
      }

      if (ctx.pluginState.interactionMode === 'resize-rect' && ctx.pluginState.activeAnchor) {
        return ctx.utils.getAnchorCursor(ctx.pluginState.activeAnchor);
      }

      if (!point) {
        return 'crosshair';
      }

      const selectedRect = getSelectedRect(ctx);
      if (selectedRect) {
        const anchor = hitTestRectAnchor(ctx, point, selectedRect);
        if (anchor) {
          return ctx.utils.getAnchorCursor(anchor);
        }

        if (hitTestRectBody(point, selectedRect)) {
          return 'move';
        }
      }

      return findTopRectAtPoint(ctx, point) ? 'move' : 'crosshair';
    },
    onPointerDown(ctx, event) {
      event.preventDefault();
      const point = ctx.utils.getCanvasPoint(event);
      const selectedRect = getSelectedRect(ctx);

      if (selectedRect) {
        const anchor = hitTestRectAnchor(ctx, point, selectedRect);
        if (anchor) {
          ctx.pluginState.interactionMode = 'resize-rect';
          ctx.pluginState.activeAnchor = anchor;
          ctx.pluginState.interactionPointerId = event.pointerId;
          ctx.pluginState.interactionStartPoint = point;
          ctx.pluginState.interactionStartEntry = {
            x1: selectedRect.x1,
            y1: selectedRect.y1,
            x2: selectedRect.x2,
            y2: selectedRect.y2
          };
          ctx.core.canvas.setPointerCapture(event.pointerId);
          ctx.updateCanvasCursor(point);
          return;
        }

        if (hitTestRectBody(point, selectedRect)) {
          ctx.pluginState.interactionMode = 'drag-rect';
          ctx.pluginState.interactionPointerId = event.pointerId;
          ctx.pluginState.interactionStartPoint = point;
          ctx.pluginState.interactionStartEntry = {
            x1: selectedRect.x1,
            y1: selectedRect.y1,
            x2: selectedRect.x2,
            y2: selectedRect.y2
          };
          ctx.core.canvas.setPointerCapture(event.pointerId);
          ctx.updateCanvasCursor(point);
          return;
        }
      }

      const clickedRect = findTopRectAtPoint(ctx, point);
      if (clickedRect) {
        ctx.clearSelection({
          reason: 'rect-selected',
          exceptPluginId: 'rect',
          render: false
        });
        ctx.pluginState.selectedId = clickedRect.id;
        ctx.pluginState.interactionMode = 'drag-rect';
        ctx.pluginState.interactionPointerId = event.pointerId;
        ctx.pluginState.interactionStartPoint = point;
        ctx.pluginState.interactionStartEntry = {
          x1: clickedRect.x1,
          y1: clickedRect.y1,
          x2: clickedRect.x2,
          y2: clickedRect.y2
        };
        ctx.core.canvas.setPointerCapture(event.pointerId);
        ctx.requestRender();
        ctx.updateCanvasCursor(point);
        return;
      }

      ctx.clearSelection({
        reason: 'rect-draft',
        exceptPluginId: 'rect',
        render: false
      });
      ctx.pluginState.selectedId = null;
      clearInteraction(ctx.pluginState);
      ctx.pluginState.currentEntry = {
        id: ctx.generateEntryId(),
        type: 'rect',
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

      const selectedRect = getSelectedRect(ctx);

      if (
        ctx.pluginState.interactionMode === 'drag-rect' &&
        selectedRect &&
        ctx.pluginState.interactionStartEntry &&
        ctx.pluginState.interactionStartPoint
      ) {
        const dx = point.x - ctx.pluginState.interactionStartPoint.x;
        const dy = point.y - ctx.pluginState.interactionStartPoint.y;
        selectedRect.x1 = ctx.pluginState.interactionStartEntry.x1 + dx;
        selectedRect.y1 = ctx.pluginState.interactionStartEntry.y1 + dy;
        selectedRect.x2 = ctx.pluginState.interactionStartEntry.x2 + dx;
        selectedRect.y2 = ctx.pluginState.interactionStartEntry.y2 + dy;
        ctx.requestRender();
        ctx.updateCanvasCursor(point);
        return;
      }

      if (
        ctx.pluginState.interactionMode === 'resize-rect' &&
        selectedRect &&
        ctx.pluginState.interactionStartEntry &&
        ctx.pluginState.interactionStartPoint
      ) {
        applyRectResize(ctx, point);
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
      const selectedRect = getSelectedRect(ctx);
      let didCommit = false;

      if (
        selectedRect &&
        ctx.pluginState.interactionMode !== 'none' &&
        ctx.pluginState.interactionStartEntry &&
        isTransformChanged(selectedRect, ctx.pluginState.interactionStartEntry)
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

        if (Math.max(Math.abs(dx), Math.abs(dy)) >= 3) {
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
      drawRectEntry(ctx, entry);
    },
    onRenderOverlay(ctx) {
      if (ctx.pluginState.currentEntry) {
        drawRectEntry(ctx, ctx.pluginState.currentEntry);
      }

      if (ctx.core.activeToolId !== 'rect') {
        return;
      }

      const selectedRect = getSelectedRect(ctx);
      if (selectedRect) {
        drawRectSelection(ctx, selectedRect);
      }
    }
  });
})();
