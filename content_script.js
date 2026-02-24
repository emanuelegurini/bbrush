(function initBbrush() {
  if (window.__BBRUSH__) {
    return;
  }

  const state = {
    enabled: false,
    canvas: null,
    context: null,
    toolbarHost: null,
    toolbarShadowRoot: null,
    toolbarElements: null,
    dragOffsetX: 0,
    dragOffsetY: 0,
    isDraggingToolbar: false,
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

  function handleResize() {
    if (!state.canvas) {
      return;
    }

    state.canvas.width = window.innerWidth;
    state.canvas.height = window.innerHeight;
    replayStrokes();
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

  function updateToolbarState() {
    if (!state.toolbarElements) {
      return;
    }

    state.toolbarElements.toggleButton.textContent = state.isDrawingMode
      ? 'Stop drawing'
      : 'Start drawing';

    state.toolbarElements.toolbar.classList.toggle('is-drawing', state.isDrawingMode);

    if (state.canvas) {
      state.canvas.style.boxShadow = state.isDrawingMode
        ? 'inset 0 0 0 2px rgba(23, 98, 166, 0.9)'
        : 'none';
    }
  }

  function createToolbar() {
    const host = document.createElement('div');
    host.id = 'bbrush-toolbar-host';
    host.style.left = '24px';
    host.style.position = 'fixed';
    host.style.top = '24px';
    host.style.zIndex = '2147483647';

    const shadowRoot = host.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `
      <div class="bbrush-toolbar">
        <div class="bbrush-toolbar-handle" data-role="drag">bbrush</div>
        <label class="bbrush-toolbar-field">
          <span>Color</span>
          <input data-role="color" type="color" value="#000000" />
        </label>
        <label class="bbrush-toolbar-field">
          <span>Size</span>
          <input data-role="size" type="range" min="1" max="24" value="4" />
        </label>
        <button data-role="toggle">Start drawing</button>
        <button data-role="undo">Undo</button>
        <button data-role="clear">Clear</button>
      </div>
    `;

    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = chrome.runtime.getURL('toolbar.css');
    shadowRoot.prepend(stylesheet);

    const dragHandle = shadowRoot.querySelector('[data-role="drag"]');
    const colorInput = shadowRoot.querySelector('[data-role="color"]');
    const sizeInput = shadowRoot.querySelector('[data-role="size"]');
    const toolbar = shadowRoot.querySelector('.bbrush-toolbar');
    const toggleButton = shadowRoot.querySelector('[data-role="toggle"]');
    const undoButton = shadowRoot.querySelector('[data-role="undo"]');
    const clearButton = shadowRoot.querySelector('[data-role="clear"]');

    colorInput.addEventListener('input', () => {
      state.brushColor = colorInput.value;
    });

    sizeInput.addEventListener('input', () => {
      state.brushSize = Number(sizeInput.value);
    });

    dragHandle.addEventListener('pointerdown', (event) => {
      state.isDraggingToolbar = true;
      state.dragOffsetX = event.clientX - state.toolbarHost.offsetLeft;
      state.dragOffsetY = event.clientY - state.toolbarHost.offsetTop;
      dragHandle.setPointerCapture(event.pointerId);
    });

    dragHandle.addEventListener('pointermove', (event) => {
      if (!state.isDraggingToolbar) {
        return;
      }

      const left = event.clientX - state.dragOffsetX;
      const top = event.clientY - state.dragOffsetY;

      state.toolbarHost.style.left = `${Math.max(0, left)}px`;
      state.toolbarHost.style.top = `${Math.max(0, top)}px`;
    });

    dragHandle.addEventListener('pointerup', (event) => {
      state.isDraggingToolbar = false;
      dragHandle.releasePointerCapture(event.pointerId);
    });

    toggleButton.addEventListener('click', () => {
      toggleDrawingMode();
      updateToolbarState();
    });

    undoButton.addEventListener('click', () => {
      undoLastStroke();
    });

    clearButton.addEventListener('click', () => {
      clearAllStrokes();
    });

    document.body.appendChild(host);

    state.toolbarHost = host;
    state.toolbarShadowRoot = shadowRoot;
    state.toolbarElements = {
      colorInput,
      sizeInput,
      toolbar,
      toggleButton,
      undoButton,
      clearButton
    };
  }

  function enableOverlay() {
    if (state.enabled) {
      return;
    }

    if (!state.canvas) {
      createCanvas();
    }

    if (!state.toolbarHost) {
      createToolbar();
    }

    state.canvas.style.display = 'block';
    state.toolbarHost.style.display = 'block';
    setDrawingMode(false);
    updateToolbarState();
    state.enabled = true;
  }

  function disableOverlay() {
    if (!state.enabled || !state.canvas) {
      return;
    }

    setDrawingMode(false);
    state.canvas.style.display = 'none';
    state.toolbarHost.style.display = 'none';
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
    updateToolbarState();
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
  window.addEventListener('resize', handleResize);

  window.__BBRUSH__ = {
    enableOverlay,
    disableOverlay
  };
})();
