(function initBbrush() {
  if (window.__BBRUSH__) {
    return;
  }

  const state = {
    enabled: false,
    canvas: null,
    context: null,
    isDrawingMode: false,
    isPointerDown: false,
    brushColor: '#000000',
    brushSize: 4,
    previousPoint: null,
    currentStroke: null,
    strokes: []
  };

  function getCanvasPoint(event) {
    const rect = state.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function drawSegment(from, to) {
    if (!state.context) {
      return;
    }

    state.context.strokeStyle = state.brushColor;
    state.context.lineWidth = state.brushSize;
    state.context.lineCap = 'round';
    state.context.lineJoin = 'round';
    state.context.beginPath();
    state.context.moveTo(from.x, from.y);
    state.context.lineTo(to.x, to.y);
    state.context.stroke();
  }

  function handlePointerDown(event) {
    if (!state.enabled || !state.isDrawingMode) {
      return;
    }

    state.isPointerDown = true;
    state.previousPoint = getCanvasPoint(event);
    state.currentStroke = {
      color: state.brushColor,
      size: state.brushSize,
      points: [state.previousPoint]
    };
  }

  function handlePointerMove(event) {
    if (!state.enabled || !state.isDrawingMode || !state.isPointerDown) {
      return;
    }

    const point = getCanvasPoint(event);

    if (state.previousPoint) {
      drawSegment(state.previousPoint, point);
    }

    if (state.currentStroke) {
      state.currentStroke.points.push(point);
    }

    state.previousPoint = point;
  }

  function handlePointerUp() {
    if (state.currentStroke && state.currentStroke.points.length > 0) {
      state.strokes.push(state.currentStroke);
    }

    state.currentStroke = null;
    state.isPointerDown = false;
    state.previousPoint = null;
  }

  function replayStrokes() {
    if (!state.canvas || !state.context) {
      return;
    }

    state.context.clearRect(0, 0, state.canvas.width, state.canvas.height);

    for (const stroke of state.strokes) {
      if (stroke.points.length < 2) {
        continue;
      }

      state.context.strokeStyle = stroke.color;
      state.context.lineWidth = stroke.size;
      state.context.lineCap = 'round';
      state.context.lineJoin = 'round';
      state.context.beginPath();
      state.context.moveTo(stroke.points[0].x, stroke.points[0].y);

      for (let i = 1; i < stroke.points.length; i += 1) {
        state.context.lineTo(stroke.points[i].x, stroke.points[i].y);
      }

      state.context.stroke();
    }
  }

  function undoLastStroke() {
    if (state.strokes.length === 0) {
      return false;
    }

    state.strokes.pop();
    replayStrokes();
    return true;
  }

  function clearAllStrokes() {
    state.strokes = [];
    state.currentStroke = null;

    if (state.canvas && state.context) {
      state.context.clearRect(0, 0, state.canvas.width, state.canvas.height);
    }
  }

  function handleKeyDown(event) {
    const undoPressed = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z';

    if (!undoPressed || !state.enabled) {
      return;
    }

    const changed = undoLastStroke();

    if (changed) {
      event.preventDefault();
    }
  }

  function createCanvas() {
    const canvas = document.createElement('canvas');
    canvas.id = 'bbrush-canvas';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.zIndex = '2147483647';
    canvas.style.cursor = 'crosshair';

    document.body.appendChild(canvas);

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerUp);

    state.canvas = canvas;
    state.context = canvas.getContext('2d');
  }

  function enableOverlay() {
    if (state.enabled) {
      return;
    }

    if (!state.canvas) {
      createCanvas();
    }

    state.canvas.style.display = 'block';
    setDrawingMode(false);
    state.enabled = true;
  }

  function disableOverlay() {
    if (!state.enabled || !state.canvas) {
      return;
    }

    setDrawingMode(false);
    state.canvas.style.display = 'none';
    state.enabled = false;
  }

  function setDrawingMode(active) {
    if (!state.canvas) {
      return;
    }

    state.isDrawingMode = active;
    state.canvas.style.pointerEvents = active ? 'auto' : 'none';
    document.body.style.cursor = active ? 'crosshair' : '';
  }

  function toggleDrawingMode() {
    if (!state.enabled) {
      return false;
    }

    setDrawingMode(!state.isDrawingMode);
    return state.isDrawingMode;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') {
      return;
    }

    if (message.type === 'BBRUSH_ENABLE_OVERLAY') {
      enableOverlay();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'BBRUSH_DISABLE_OVERLAY') {
      disableOverlay();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'BBRUSH_TOGGLE_DRAWING_MODE') {
      const active = toggleDrawingMode();
      sendResponse({ ok: true, drawingMode: active });
      return;
    }

    if (message.type === 'BBRUSH_UNDO') {
      const changed = undoLastStroke();
      sendResponse({ ok: true, changed });
      return;
    }

    if (message.type === 'BBRUSH_CLEAR_ALL') {
      clearAllStrokes();
      sendResponse({ ok: true });
    }
  });

  document.addEventListener('keydown', handleKeyDown);

  window.__BBRUSH__ = {
    enableOverlay,
    disableOverlay
  };
})();
