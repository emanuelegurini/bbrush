function drawStrokePath(ctx, stroke) {
  if (!ctx.core.context || !stroke || !Array.isArray(stroke.points) || stroke.points.length === 0) {
    return;
  }

  ctx.core.context.strokeStyle = stroke.color;
  ctx.core.context.fillStyle = stroke.color;
  ctx.core.context.lineWidth = stroke.size;
  ctx.core.context.lineCap = 'round';
  ctx.core.context.lineJoin = 'round';

  if (stroke.points.length === 1) {
    ctx.core.context.beginPath();
    ctx.core.context.arc(stroke.points[0].x, stroke.points[0].y, stroke.size / 2, 0, Math.PI * 2);
    ctx.core.context.fill();
    return;
  }

  ctx.core.context.beginPath();
  ctx.core.context.moveTo(stroke.points[0].x, stroke.points[0].y);

  if (stroke.points.length === 2) {
    ctx.core.context.lineTo(stroke.points[1].x, stroke.points[1].y);
    ctx.core.context.stroke();
    return;
  }

  for (let index = 1; index < stroke.points.length - 1; index += 1) {
    const current = stroke.points[index];
    const next = stroke.points[index + 1];
    const midPointX = (current.x + next.x) / 2;
    const midPointY = (current.y + next.y) / 2;
    ctx.core.context.quadraticCurveTo(current.x, current.y, midPointX, midPointY);
  }

  const penultimate = stroke.points[stroke.points.length - 2];
  const last = stroke.points[stroke.points.length - 1];
  ctx.core.context.quadraticCurveTo(penultimate.x, penultimate.y, last.x, last.y);
  ctx.core.context.stroke();
}

const brushFeature = {
  setup() {
    return {
      currentStroke: null
    };
  },
  clearSelection(ctx) {
    if (!ctx.pluginState.currentStroke) {
      return false;
    }

    ctx.pluginState.currentStroke = null;
    return true;
  },
  isInteracting(ctx) {
    return Boolean(ctx.pluginState.currentStroke);
  },
  onSceneChanged(ctx) {
    ctx.pluginState.currentStroke = null;
  },
  onPointerDown(ctx, event) {
    const point = ctx.utils.getCanvasPoint(event);
    ctx.pluginState.currentStroke = {
      type: 'brush',
      color: ctx.shared.brushColor,
      size: ctx.shared.penSize,
      points: [point]
    };
    ctx.requestRender();
  },
  onPointerMove(ctx, event) {
    if (!ctx.pluginState.currentStroke) {
      return;
    }

    const point = ctx.utils.getCanvasPoint(event);
    if (event.shiftKey && ctx.pluginState.currentStroke.points.length > 0) {
      ctx.pluginState.currentStroke.points = [ctx.pluginState.currentStroke.points[0], point];
    } else {
      const smoothedPoint = ctx.utils.getSmoothedPoint(point, ctx.pluginState.currentStroke.points);
      ctx.pluginState.currentStroke.points.push(smoothedPoint);
    }

    ctx.requestRender();
  },
  onPointerUp(ctx) {
    if (
      ctx.pluginState.currentStroke &&
      Array.isArray(ctx.pluginState.currentStroke.points) &&
      ctx.pluginState.currentStroke.points.length > 0
    ) {
      ctx.scene.getEntries().push(ctx.pluginState.currentStroke);
      ctx.history.pushSnapshot();
    }

    ctx.pluginState.currentStroke = null;
    ctx.requestRender();
  },
  onRenderEntry(ctx, entry) {
    drawStrokePath(ctx, entry);
  },
  onRenderOverlay(ctx) {
    if (ctx.pluginState.currentStroke) {
      drawStrokePath(ctx, ctx.pluginState.currentStroke);
    }
  }
};

export default brushFeature;
