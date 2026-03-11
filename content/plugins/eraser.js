(function registerBbrushEraserPlugin() {
  if (typeof window.__BBRUSH_REGISTER_PLUGIN__ !== 'function') {
    return;
  }

  const cursorCache = new Map();

  function canUseDrawingShortcut(ctx) {
    return ctx.core.enabled && ctx.core.isDrawingMode && !ctx.core.isTemporaryPassthrough;
  }

  function getEraserCursor(size) {
    const diameter = Math.max(12, Math.min(48, Math.round(size * 2 + 4)));

    if (cursorCache.has(diameter)) {
      return cursorCache.get(diameter);
    }

    const center = Math.floor(diameter / 2);
    const radius = Math.max(3, center - 2);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${diameter}" height="${diameter}" viewBox="0 0 ${diameter} ${diameter}"><circle cx="${center}" cy="${center}" r="${radius}" fill="rgba(255,255,255,0.12)" stroke="rgba(17,24,39,0.95)" stroke-width="2"/></svg>`;
    const cursor = `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${center} ${center}, crosshair`;
    cursorCache.set(diameter, cursor);
    return cursor;
  }

  function hitTestBrushStroke(ctx, point, entry, radius) {
    if (!entry.points || entry.points.length === 0) {
      return false;
    }

    const threshold = radius + entry.size / 2;

    if (entry.points.length === 1) {
      return Math.hypot(point.x - entry.points[0].x, point.y - entry.points[0].y) <= threshold;
    }

    for (let index = 0; index < entry.points.length - 1; index += 1) {
      const distance = ctx.utils.distancePointToSegment(
        point,
        entry.points[index],
        entry.points[index + 1]
      );
      if (distance <= threshold) {
        return true;
      }
    }

    return false;
  }

  function hitTestRect(point, entry, radius) {
    const left = Math.min(entry.x1, entry.x2);
    const right = Math.max(entry.x1, entry.x2);
    const top = Math.min(entry.y1, entry.y2);
    const bottom = Math.max(entry.y1, entry.y2);
    return (
      point.x >= left - radius &&
      point.x <= right + radius &&
      point.y >= top - radius &&
      point.y <= bottom + radius
    );
  }

  function hitTestText(point, entry, radius) {
    return (
      point.x >= entry.x - radius &&
      point.x <= entry.x + entry.width + radius &&
      point.y >= entry.y - radius &&
      point.y <= entry.y + entry.height + radius
    );
  }

  function hitTestArrow(ctx, point, entry, radius) {
    const distance = ctx.utils.distancePointToSegment(
      point,
      { x: entry.x1, y: entry.y1 },
      { x: entry.x2, y: entry.y2 }
    );
    return distance <= radius + entry.size / 2 + 2;
  }

  function isEntryHit(ctx, point, radius, entry) {
    if (!entry) {
      return false;
    }

    if (entry.type === 'brush') {
      return hitTestBrushStroke(ctx, point, entry, radius);
    }

    if (entry.type === 'rect') {
      return hitTestRect(point, entry, radius);
    }

    if (entry.type === 'text') {
      return hitTestText(point, entry, radius);
    }

    if (entry.type === 'arrow') {
      return hitTestArrow(ctx, point, entry, radius);
    }

    return false;
  }

  function eraseTopEntryAtPoint(ctx, point) {
    const radius = Math.max(1, ctx.shared.penSize / 2);
    const entries = ctx.scene.getEntries();

    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (!isEntryHit(ctx, point, radius, entry)) {
        continue;
      }

      entries.splice(index, 1);
      return true;
    }

    return false;
  }

  window.__BBRUSH_REGISTER_PLUGIN__({
    id: 'eraser',
    kind: 'tool',
    order: 20,
    launcherLabel: 'E',
    usesCanvasPointerEvents: true,
    setup() {
      return {
        isPointerDown: false,
        didMutate: false
      };
    },
    toolbarItems: [
      {
        id: 'tool-eraser',
        order: 20,
        ariaLabel: 'Eraser tool',
        title: 'Eraser tool (E)',
        icon: `
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 16l6-8 6 6-6 8H7z" />
            <path d="M4 20h16" />
          </svg>
        `,
        onClick(ctx) {
          ctx.setActiveTool('eraser');
          return true;
        },
        isActive(ctx) {
          return ctx.core.activeToolId === 'eraser';
        },
        isDisabled(ctx) {
          return !ctx.core.isDrawingMode;
        }
      }
    ],
    shortcutItems: [{ order: 20, text: 'E - Eraser' }],
    keybindings: [
      {
        key: 'e',
        order: 20,
        when(ctx) {
          return canUseDrawingShortcut(ctx);
        },
        run(ctx) {
          ctx.setActiveTool('eraser');
          return true;
        }
      }
    ],
    clearSelection(ctx) {
      const changed = ctx.pluginState.isPointerDown || ctx.pluginState.didMutate;
      ctx.pluginState.isPointerDown = false;
      ctx.pluginState.didMutate = false;
      return changed;
    },
    isInteracting(ctx) {
      return ctx.pluginState.isPointerDown;
    },
    onSceneChanged(ctx) {
      ctx.pluginState.isPointerDown = false;
      ctx.pluginState.didMutate = false;
    },
    getCanvasCursor(ctx) {
      return getEraserCursor(ctx.shared.penSize);
    },
    onPointerDown(ctx, event) {
      ctx.clearSelection({
        reason: 'eraser-start',
        exceptPluginId: 'eraser',
        render: false
      });

      ctx.pluginState.isPointerDown = true;
      ctx.pluginState.didMutate = eraseTopEntryAtPoint(ctx, ctx.utils.getCanvasPoint(event));

      if (ctx.pluginState.didMutate) {
        ctx.requestRender();
      }
    },
    onPointerMove(ctx, event) {
      if (!ctx.pluginState.isPointerDown) {
        return;
      }

      const didMutate = eraseTopEntryAtPoint(ctx, ctx.utils.getCanvasPoint(event));
      if (!didMutate) {
        return;
      }

      ctx.pluginState.didMutate = true;
      ctx.requestRender();
    },
    onPointerUp(ctx) {
      if (ctx.pluginState.didMutate) {
        ctx.history.pushSnapshot();
      }

      ctx.pluginState.isPointerDown = false;
      ctx.pluginState.didMutate = false;
      ctx.updateCanvasCursor();
    }
  });
})();
