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
    activeTool: 'brush',
    isPointerDown: false,
    brushColor: '#000000',
    brushSize: 4,
    isSizeExpanded: false,
    currentStroke: null,
    strokes: [],
    textEditor: null
  };

  function getCanvasPoint(event) {
    const rect = state.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function getSmoothedPoint(rawPoint, points) {
    const sampleSize = 3;
    const recentPoints = points.slice(-(sampleSize - 1));
    const samples = [...recentPoints, rawPoint];
    const totals = samples.reduce(
      (accumulator, point) => {
        return {
          x: accumulator.x + point.x,
          y: accumulator.y + point.y
        };
      },
      { x: 0, y: 0 }
    );

    return {
      x: totals.x / samples.length,
      y: totals.y / samples.length
    };
  }

  function getTextFontSize() {
    return Math.max(12, state.brushSize * 3);
  }

  function commitTextAt(point, text, color, fontSize) {
    if (!state.context || !text.trim()) {
      return;
    }

    state.context.fillStyle = color;
    state.context.font = `${fontSize}px Arial, sans-serif`;
    state.context.textBaseline = 'top';
    state.context.fillText(text, point.x, point.y);

    state.strokes.push({
      type: 'text',
      text,
      x: point.x,
      y: point.y,
      color,
      fontSize
    });
  }

  function openTextEditorAt(point) {
    if (state.textEditor && state.textEditor.element) {
      state.textEditor.element.remove();
    }

    const editorColor = state.brushColor;
    const editorFontSize = getTextFontSize();

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Type text';
    input.style.position = 'fixed';
    input.style.left = `${point.x}px`;
    input.style.top = `${point.y}px`;
    input.style.zIndex = '2147483647';
    input.style.color = editorColor;
    input.style.fontSize = `${editorFontSize}px`;
    input.style.fontFamily = 'Arial, sans-serif';
    input.style.background = 'rgba(255, 255, 255, 0.92)';
    input.style.border = '1px solid #1762a6';
    input.style.borderRadius = '4px';
    input.style.padding = '2px 4px';
    input.style.minWidth = '120px';

    document.body.appendChild(input);
    input.focus();

    let isFinalized = false;

    const finalize = (commit) => {
      if (isFinalized) {
        return;
      }

      isFinalized = true;
      const textValue = input.value;
      input.remove();

      if (state.textEditor && state.textEditor.element === input) {
        state.textEditor = null;
      }

      if (commit) {
        commitTextAt(point, textValue, editorColor, editorFontSize);
      }
    };

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

    state.textEditor = {
      element: input,
      x: point.x,
      y: point.y,
      color: editorColor,
      fontSize: editorFontSize
    };
  }

  function drawStrokePath(stroke) {
    if (!state.context || !stroke || stroke.points.length === 0) {
      return;
    }

    state.context.strokeStyle = stroke.color;
    state.context.fillStyle = stroke.color;
    state.context.lineWidth = stroke.size;
    state.context.lineCap = 'round';
    state.context.lineJoin = 'round';

    if (stroke.points.length === 1) {
      state.context.beginPath();
      state.context.arc(stroke.points[0].x, stroke.points[0].y, stroke.size / 2, 0, Math.PI * 2);
      state.context.fill();
      return;
    }

    state.context.beginPath();
    state.context.moveTo(stroke.points[0].x, stroke.points[0].y);

    if (stroke.points.length === 2) {
      state.context.lineTo(stroke.points[1].x, stroke.points[1].y);
      state.context.stroke();
      return;
    }

    for (let i = 1; i < stroke.points.length - 1; i += 1) {
      const current = stroke.points[i];
      const next = stroke.points[i + 1];
      const midPointX = (current.x + next.x) / 2;
      const midPointY = (current.y + next.y) / 2;
      state.context.quadraticCurveTo(current.x, current.y, midPointX, midPointY);
    }

    const penultimate = stroke.points[stroke.points.length - 2];
    const last = stroke.points[stroke.points.length - 1];
    state.context.quadraticCurveTo(penultimate.x, penultimate.y, last.x, last.y);

    state.context.stroke();
  }

  function drawTextEntry(entry) {
    if (!state.context || !entry || !entry.text) {
      return;
    }

    state.context.fillStyle = entry.color;
    state.context.font = `${entry.fontSize}px Arial, sans-serif`;
    state.context.textBaseline = 'top';
    state.context.fillText(entry.text, entry.x, entry.y);
  }

  function handlePointerDown(event) {
    if (!state.enabled || !state.isDrawingMode) {
      return;
    }

    if (state.activeTool === 'text') {
      const point = getCanvasPoint(event);
      openTextEditorAt(point);
      return;
    }

    if (state.activeTool !== 'brush') {
      return;
    }

    state.isPointerDown = true;
    const point = getCanvasPoint(event);
    state.currentStroke = {
      color: state.brushColor,
      size: state.brushSize,
      points: [point]
    };

    replayStrokes();
  }

  function handlePointerMove(event) {
    if (
      !state.enabled ||
      !state.isDrawingMode ||
      state.activeTool !== 'brush' ||
      !state.isPointerDown
    ) {
      return;
    }

    const point = getCanvasPoint(event);

    if (state.currentStroke) {
      const smoothedPoint = getSmoothedPoint(point, state.currentStroke.points);
      state.currentStroke.points.push(smoothedPoint);
    }

    replayStrokes();
  }

  function handlePointerUp() {
    if (state.currentStroke && state.currentStroke.points.length > 0) {
      state.strokes.push(state.currentStroke);
    }

    state.currentStroke = null;
    state.isPointerDown = false;
    replayStrokes();
  }

  function replayStrokes() {
    if (!state.canvas || !state.context) {
      return;
    }

    state.context.clearRect(0, 0, state.canvas.width, state.canvas.height);

    for (const stroke of state.strokes) {
      if (stroke.type === 'text') {
        drawTextEntry(stroke);
        continue;
      }

      drawStrokePath(stroke);
    }

    if (state.currentStroke) {
      drawStrokePath(state.currentStroke);
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

    state.toolbarElements.drawButton.classList.toggle('is-active', state.activeTool === 'brush');
    state.toolbarElements.textButton.classList.toggle('is-active', state.activeTool === 'text');

    state.toolbarElements.toolbar.classList.toggle('is-drawing', state.isDrawingMode);
    state.toolbarElements.sizeField.classList.toggle('is-expanded', state.isSizeExpanded);
    state.toolbarElements.sizeToggle.textContent = state.isSizeExpanded ? 'Size -' : 'Size +';

    if (state.canvas) {
      state.canvas.style.boxShadow = state.isDrawingMode
        ? 'inset 0 0 0 2px rgba(23, 98, 166, 0.9)'
        : 'none';
    }
  }

  function setActiveTool(tool) {
    state.activeTool = tool;
    if (!state.isDrawingMode) {
      setDrawingMode(true);
    }

    updateToolbarState();
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
        <button data-role="size-toggle">Size +</button>
        <label class="bbrush-toolbar-field bbrush-toolbar-size" data-role="size-field">
          <span>Size</span>
          <input data-role="size" type="range" min="1" max="24" value="4" />
        </label>
        <button data-role="tool-brush">Draw</button>
        <button data-role="tool-text">Text</button>
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
    const sizeToggle = shadowRoot.querySelector('[data-role="size-toggle"]');
    const sizeField = shadowRoot.querySelector('[data-role="size-field"]');
    const sizeInput = shadowRoot.querySelector('[data-role="size"]');
    const drawButton = shadowRoot.querySelector('[data-role="tool-brush"]');
    const textButton = shadowRoot.querySelector('[data-role="tool-text"]');
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

    sizeToggle.addEventListener('click', () => {
      state.isSizeExpanded = !state.isSizeExpanded;
      updateToolbarState();
    });

    drawButton.addEventListener('click', () => {
      setActiveTool('brush');
    });

    textButton.addEventListener('click', () => {
      setActiveTool('text');
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
      sizeToggle,
      sizeField,
      sizeInput,
      drawButton,
      textButton,
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

    if (state.textEditor && state.textEditor.element) {
      state.textEditor.element.remove();
      state.textEditor = null;
    }

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
drawButton.addEventListener('click', () => {
  setActiveTool('brush');
});

textButton.addEventListener('click', () => {
  setActiveTool('text');
});
