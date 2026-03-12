const whiteboardFeature = {
  onLocationChange(ctx, payload) {
    if (ctx.core.canvasMode !== 'whiteboard') {
      return;
    }

    if (!ctx.utils.didPageContextChange(payload.previousHref, payload.nextHref)) {
      return;
    }

    ctx.setCanvasMode('page', { autoEnableDrawing: false });
  }
};

export default whiteboardFeature;
