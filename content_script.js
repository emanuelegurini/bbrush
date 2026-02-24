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
    previousPoint: null
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
  }

  function handlePointerMove(event) {
    if (!state.enabled || !state.isDrawingMode || !state.isPointerDown) {
      return;
    }

    const point = getCanvasPoint(event);

    if (state.previousPoint) {
      drawSegment(state.previousPoint, point);
    }

    state.previousPoint = point;
  }

  function handlePointerUp() {
    state.isPointerDown = false;
    state.previousPoint = null;
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
    }
  });

  window.__BBRUSH__ = {
    enableOverlay,
    disableOverlay
  };
})();
