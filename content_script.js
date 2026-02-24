(function initBbrush() {
  if (window.__BBRUSH__) {
    return;
  }

  const ANCHOR_SIZE = 10;
  const MIN_TEXT_SIZE = 10;

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
    textEditor: null,
    selectedTextId: null,
    interactionMode: 'none',
    activeAnchor: null,
    interactionPointerId: null,
    interactionStartPoint: null,
    interactionStartText: null,
    history: [],
    nextTextId: 1
  };

  function cloneStrokes(strokes) {
    return JSON.parse(JSON.stringify(strokes));
  }

  function ensureHistoryInitialized() {
    if (state.history.length === 0) {
      state.history.push(cloneStrokes(state.strokes));
    }
  }

  function pushHistorySnapshot() {
    ensureHistoryInitialized();
    state.history.push(cloneStrokes(state.strokes));
    if (state.history.length > 100) {
      state.history.shift();
    }
  }

  function recomputeNextTextId() {
    let maxId = 0;
    for (const entry of state.strokes) {
      if (entry.type === 'text' && typeof entry.id === 'number' && entry.id > maxId) {
        maxId = entry.id;
      }
    }
    state.nextTextId = maxId + 1;
  }

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

  function measureTextBounds(text, fontSize) {
    if (!state.context) {
      return { width: 0, height: fontSize };
    }

    state.context.font = `${fontSize}px Arial, sans-serif`;
    const metrics = state.context.measureText(text);
    const width = Math.max(1, metrics.width);
    const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.8;
    const descent = metrics.actualBoundingBoxDescent || fontSize * 0.2;

    return {
      width,
      height: Math.max(fontSize, ascent + descent)
    };
  }

  function updateTextBounds(textEntry) {
    if (!textEntry || textEntry.type !== 'text') {
      return;
    }

    const bounds = measureTextBounds(textEntry.text, textEntry.fontSize);
    textEntry.width = bounds.width;
    textEntry.height = bounds.height;
  }

  function getTextBounds(textEntry) {
    return {
      left: textEntry.x,
      top: textEntry.y,
      right: textEntry.x + textEntry.width,
      bottom: textEntry.y + textEntry.height,
      width: textEntry.width,
      height: textEntry.height
    };
  }

  function getTextEntryById(id) {
    return state.strokes.find((entry) => entry.type === 'text' && entry.id === id) || null;
  }

  function getSelectedTextEntry() {
    if (state.selectedTextId === null) {
      return null;
    }

    return getTextEntryById(state.selectedTextId);
  }

  function getAnchorPoints(bounds) {
    return {
      nw: { x: bounds.left, y: bounds.top },
      n: { x: bounds.left + bounds.width / 2, y: bounds.top },
      ne: { x: bounds.right, y: bounds.top },
      e: { x: bounds.right, y: bounds.top + bounds.height / 2 },
      se: { x: bounds.right, y: bounds.bottom },
      s: { x: bounds.left + bounds.width / 2, y: bounds.bottom },
      sw: { x: bounds.left, y: bounds.bottom },
      w: { x: bounds.left, y: bounds.top + bounds.height / 2 }
    };
  }

  function getAnchorCursor(anchor) {
    if (anchor === 'n' || anchor === 's') {
      return 'ns-resize';
    }
    if (anchor === 'e' || anchor === 'w') {
      return 'ew-resize';
    }
    if (anchor === 'nw' || anchor === 'se') {
      return 'nwse-resize';
    }
    return 'nesw-resize';
  }

  function hitTestTextBody(point, textEntry) {
    const bounds = getTextBounds(textEntry);
    return (
      point.x >= bounds.left &&
      point.x <= bounds.right &&
      point.y >= bounds.top &&
      point.y <= bounds.bottom
    );
  }

  function hitTestTextAnchor(point, textEntry) {
    const bounds = getTextBounds(textEntry);
    const anchors = getAnchorPoints(bounds);
    const half = ANCHOR_SIZE / 2;

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

  function findTopTextAtPoint(point) {
    for (let i = state.strokes.length - 1; i >= 0; i -= 1) {
      const entry = state.strokes[i];
      if (entry.type !== 'text') {
        continue;
      }

      if (hitTestTextBody(point, entry)) {
        return entry;
      }
    }

    return null;
  }

  function clearInteractionState() {
    state.interactionMode = 'none';
    state.activeAnchor = null;
    state.interactionPointerId = null;
    state.interactionStartPoint = null;
    state.interactionStartText = null;
  }

  function isTextTransformChanged(textEntry, startText) {
    if (!textEntry || !startText) {
      return false;
    }

    return (
      textEntry.x !== startText.x ||
      textEntry.y !== startText.y ||
      textEntry.fontSize !== startText.fontSize ||
      textEntry.width !== startText.width ||
      textEntry.height !== startText.height
    );
  }

  function commitTextAt(point, text, color, fontSize) {
    if (!state.context || !text.trim()) {
      return;
    }

    const textEntry = {
      id: state.nextTextId,
      type: 'text',
      text,
      x: point.x,
      y: point.y,
      color,
      fontSize,
      width: 0,
      height: 0
    };

    state.nextTextId += 1;
    updateTextBounds(textEntry);
    state.strokes.push(textEntry);
    state.selectedTextId = textEntry.id;
    pushHistorySnapshot();
    replayStrokes();
  }

  function openTextEditorAt(point) {
    if (state.textEditor && state.textEditor.element) {
      state.textEditor.element.remove();
    }

    const canvasRect = state.canvas.getBoundingClientRect();
    const viewportX = canvasRect.left + point.x;
    const viewportY = canvasRect.top + point.y;

    const editorColor = state.brushColor;
    const editorFontSize = getTextFontSize();
    const input = document.createElement('input');

    input.type = 'text';
    input.placeholder = 'Type text';
    input.style.position = 'fixed';
    input.style.left = `${viewportX}px`;
    input.style.top = `${viewportY}px`;
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
    state.selectedTextId = null;

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
      } else {
        replayStrokes();
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
    if (!state.context || !stroke || !stroke.points || stroke.points.length === 0) {
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

    updateTextBounds(entry);
    state.context.fillStyle = entry.color;
    state.context.font = `${entry.fontSize}px Arial, sans-serif`;
    state.context.textBaseline = 'top';
    state.context.fillText(entry.text, entry.x, entry.y);
  }

  function drawTextSelection(entry) {
    if (!state.context || !entry) {
      return;
    }

    const bounds = getTextBounds(entry);
    const anchors = getAnchorPoints(bounds);
    const half = ANCHOR_SIZE / 2;

    state.context.save();
    state.context.strokeStyle = '#0a84ff';
    state.context.lineWidth = 1;
    state.context.setLineDash([4, 3]);
    state.context.strokeRect(bounds.left, bounds.top, bounds.width, bounds.height);
    state.context.setLineDash([]);

    for (const anchor of Object.values(anchors)) {
      state.context.fillStyle = '#ffffff';
      state.context.strokeStyle = '#0a84ff';
      state.context.lineWidth = 1.25;
      state.context.fillRect(anchor.x - half, anchor.y - half, ANCHOR_SIZE, ANCHOR_SIZE);
      state.context.strokeRect(anchor.x - half, anchor.y - half, ANCHOR_SIZE, ANCHOR_SIZE);
    }

    state.context.restore();
  }

  function updateCanvasCursor(pointerPoint) {
    if (!state.canvas) {
      return;
    }

    if (!state.enabled || !state.isDrawingMode) {
      state.canvas.style.cursor = 'crosshair';
      return;
    }

    if (state.activeTool === 'brush') {
      state.canvas.style.cursor = 'crosshair';
      return;
    }

    if (state.interactionMode === 'drag-text') {
      state.canvas.style.cursor = 'grabbing';
      return;
    }

    if (state.interactionMode === 'resize-text' && state.activeAnchor) {
      state.canvas.style.cursor = getAnchorCursor(state.activeAnchor);
      return;
    }

    if (!pointerPoint) {
      state.canvas.style.cursor = 'text';
      return;
    }

    const selected = getSelectedTextEntry();
    if (selected) {
      const anchor = hitTestTextAnchor(pointerPoint, selected);
      if (anchor) {
        state.canvas.style.cursor = getAnchorCursor(anchor);
        return;
      }

      if (hitTestTextBody(pointerPoint, selected)) {
        state.canvas.style.cursor = 'move';
        return;
      }
    }

    const hovered = findTopTextAtPoint(pointerPoint);
    state.canvas.style.cursor = hovered ? 'move' : 'text';
  }

  function replayStrokes() {
    if (!state.canvas || !state.context) {
      return;
    }

    state.context.clearRect(0, 0, state.canvas.width, state.canvas.height);

    for (const entry of state.strokes) {
      if (entry.type === 'text') {
        drawTextEntry(entry);
        continue;
      }

      drawStrokePath(entry);
    }

    if (state.currentStroke) {
      drawStrokePath(state.currentStroke);
    }

    if (state.activeTool === 'text') {
      const selected = getSelectedTextEntry();
      if (selected) {
        drawTextSelection(selected);
      }
    }
  }

  function undoLastStroke() {
    ensureHistoryInitialized();
    if (state.history.length <= 1) {
      return false;
    }

    state.history.pop();
    state.strokes = cloneStrokes(state.history[state.history.length - 1]);
    state.currentStroke = null;
    clearInteractionState();
    recomputeNextTextId();

    if (!getSelectedTextEntry()) {
      state.selectedTextId = null;
    }

    replayStrokes();
    return true;
  }

  function clearAllStrokes() {
    if (state.strokes.length === 0) {
      return;
    }

    state.strokes = [];
    state.currentStroke = null;
    state.selectedTextId = null;
    clearInteractionState();
    pushHistorySnapshot();

    if (state.canvas && state.context) {
      state.context.clearRect(0, 0, state.canvas.width, state.canvas.height);
    }
  }

  function applyTextResize(point) {
    const selected = getSelectedTextEntry();
    const startText = state.interactionStartText;
    const startPoint = state.interactionStartPoint;
    const anchor = state.activeAnchor;

    if (!selected || !startText || !startPoint || !anchor) {
      return;
    }

    const dx = point.x - startPoint.x;
    const dy = point.y - startPoint.y;

    let delta = 0;
    if (anchor.length === 2) {
      const horizontal = anchor.includes('e') ? dx : -dx;
      const vertical = anchor.includes('s') ? dy : -dy;
      delta = (horizontal + vertical) / 2;
    } else if (anchor === 'e') {
      delta = dx;
    } else if (anchor === 'w') {
      delta = -dx;
    } else if (anchor === 's') {
      delta = dy;
    } else if (anchor === 'n') {
      delta = -dy;
    }

    const newFontSize = Math.max(MIN_TEXT_SIZE, Math.round(startText.fontSize + delta * 0.2));
    selected.fontSize = newFontSize;
    updateTextBounds(selected);

    selected.x = startText.x;
    selected.y = startText.y;

    if (anchor.includes('w')) {
      selected.x = startText.x + (startText.width - selected.width);
    }

    if (anchor.includes('n')) {
      selected.y = startText.y + (startText.height - selected.height);
    }

    selected.x = Math.max(0, selected.x);
    selected.y = Math.max(0, selected.y);
  }

  function handlePointerDown(event) {
    if (!state.enabled || !state.isDrawingMode || !state.canvas) {
      return;
    }

    const point = getCanvasPoint(event);

    if (state.activeTool === 'brush') {
      state.isPointerDown = true;
      state.currentStroke = {
        type: 'brush',
        color: state.brushColor,
        size: state.brushSize,
        points: [point]
      };

      replayStrokes();
      return;
    }

    if (state.activeTool !== 'text') {
      return;
    }

    event.preventDefault();

    const selected = getSelectedTextEntry();
    if (selected) {
      const anchor = hitTestTextAnchor(point, selected);
      if (anchor) {
        state.interactionMode = 'resize-text';
        state.activeAnchor = anchor;
        state.interactionPointerId = event.pointerId;
        state.interactionStartPoint = point;
        state.interactionStartText = {
          x: selected.x,
          y: selected.y,
          width: selected.width,
          height: selected.height,
          fontSize: selected.fontSize
        };
        state.canvas.setPointerCapture(event.pointerId);
        updateCanvasCursor(point);
        return;
      }

      if (hitTestTextBody(point, selected)) {
        state.interactionMode = 'drag-text';
        state.interactionPointerId = event.pointerId;
        state.interactionStartPoint = point;
        state.interactionStartText = {
          x: selected.x,
          y: selected.y,
          width: selected.width,
          height: selected.height,
          fontSize: selected.fontSize
        };
        state.canvas.setPointerCapture(event.pointerId);
        updateCanvasCursor(point);
        return;
      }
    }

    const clickedText = findTopTextAtPoint(point);
    if (clickedText) {
      state.selectedTextId = clickedText.id;
      state.interactionMode = 'drag-text';
      state.interactionPointerId = event.pointerId;
      state.interactionStartPoint = point;
      state.interactionStartText = {
        x: clickedText.x,
        y: clickedText.y,
        width: clickedText.width,
        height: clickedText.height,
        fontSize: clickedText.fontSize
      };
      state.canvas.setPointerCapture(event.pointerId);
      replayStrokes();
      updateCanvasCursor(point);
      return;
    }

    clearInteractionState();
    state.selectedTextId = null;
    replayStrokes();
    openTextEditorAt(point);
  }

  function handlePointerMove(event) {
    if (!state.enabled || !state.isDrawingMode || !state.canvas) {
      return;
    }

    const point = getCanvasPoint(event);

    if (state.activeTool === 'brush') {
      if (!state.isPointerDown) {
        return;
      }

      if (state.currentStroke) {
        const smoothedPoint = getSmoothedPoint(point, state.currentStroke.points);
        state.currentStroke.points.push(smoothedPoint);
      }

      replayStrokes();
      return;
    }

    if (state.activeTool !== 'text') {
      return;
    }

    if (
      state.interactionMode !== 'none' &&
      state.interactionPointerId !== null &&
      event.pointerId !== state.interactionPointerId
    ) {
      return;
    }

    const selected = getSelectedTextEntry();

    if (state.interactionMode === 'drag-text' && selected && state.interactionStartPoint) {
      const dx = point.x - state.interactionStartPoint.x;
      const dy = point.y - state.interactionStartPoint.y;

      selected.x = Math.max(0, state.interactionStartText.x + dx);
      selected.y = Math.max(0, state.interactionStartText.y + dy);
      replayStrokes();
      updateCanvasCursor(point);
      return;
    }

    if (state.interactionMode === 'resize-text' && selected) {
      applyTextResize(point);
      replayStrokes();
      updateCanvasCursor(point);
      return;
    }

    updateCanvasCursor(point);
  }

  function handlePointerUp(event) {
    if (!state.enabled || !state.canvas) {
      return;
    }

    if (state.activeTool === 'brush') {
      if (state.currentStroke && state.currentStroke.points.length > 0) {
        state.strokes.push(state.currentStroke);
        pushHistorySnapshot();
      }

      state.currentStroke = null;
      state.isPointerDown = false;
      replayStrokes();
      return;
    }

    if (state.activeTool !== 'text') {
      return;
    }

    const selected = getSelectedTextEntry();
    let didCommitTransform = false;

    if (
      selected &&
      (state.interactionMode === 'drag-text' || state.interactionMode === 'resize-text') &&
      state.interactionStartText &&
      isTextTransformChanged(selected, state.interactionStartText)
    ) {
      pushHistorySnapshot();
      didCommitTransform = true;
    }

    if (
      state.interactionPointerId !== null &&
      event.pointerId === state.interactionPointerId &&
      state.canvas.hasPointerCapture(event.pointerId)
    ) {
      state.canvas.releasePointerCapture(event.pointerId);
    }

    clearInteractionState();
    if (!didCommitTransform) {
      replayStrokes();
    } else {
      updateCanvasCursor();
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
    if (!state.enabled) {
      return;
    }

    const key = event.key.toLowerCase();
    const undoPressed = (event.ctrlKey || event.metaKey) && key === 'z';

    if (undoPressed) {
      const changed = undoLastStroke();

      if (changed) {
        event.preventDefault();
      }

      return;
    }

    if (key === 'b') {
      setActiveTool('brush');
      event.preventDefault();
      return;
    }

    if (key === 't') {
      setActiveTool('text');
      event.preventDefault();
      return;
    }

    if (key === 'escape') {
      if (state.textEditor && state.textEditor.element) {
        state.textEditor.element.blur();
        event.preventDefault();
        return;
      }

      if (state.selectedTextId !== null || state.interactionMode !== 'none') {
        state.selectedTextId = null;
        clearInteractionState();
        replayStrokes();
        updateCanvasCursor();
        event.preventDefault();
      }

      return;
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

    state.toolbarElements.annotateToggleButton.textContent = state.isDrawingMode
      ? 'Annotate: ON'
      : 'Annotate: OFF';

    state.toolbarElements.drawButton.classList.toggle('is-active', state.activeTool === 'brush');
    state.toolbarElements.textButton.classList.toggle('is-active', state.activeTool === 'text');
    state.toolbarElements.annotateToggleButton.classList.toggle('is-active', state.isDrawingMode);
    state.toolbarElements.toolbar.classList.toggle('is-drawing', state.isDrawingMode);
    state.toolbarElements.sizeField.classList.toggle('is-expanded', state.isSizeExpanded);
    state.toolbarElements.sizeToggle.textContent = state.isSizeExpanded ? 'Size -' : 'Size +';

    if (!state.isDrawingMode) {
      state.isSizeExpanded = false;
      state.toolbarElements.sizeField.classList.remove('is-expanded');
      state.toolbarElements.sizeToggle.textContent = 'Size +';
    }

    state.toolbarElements.colorInput.disabled = !state.isDrawingMode;
    state.toolbarElements.sizeToggle.disabled = !state.isDrawingMode;
    state.toolbarElements.sizeInput.disabled = !state.isDrawingMode;
    state.toolbarElements.drawButton.disabled = !state.isDrawingMode;
    state.toolbarElements.textButton.disabled = !state.isDrawingMode;
    state.toolbarElements.undoButton.disabled = !state.isDrawingMode;
    state.toolbarElements.clearButton.disabled = !state.isDrawingMode;

    if (state.canvas) {
      state.canvas.style.boxShadow = state.isDrawingMode
        ? 'inset 0 0 0 2px rgba(23, 98, 166, 0.9)'
        : 'none';
      updateCanvasCursor();
    }
  }

  function setActiveTool(tool) {
    state.activeTool = tool;

    if (!state.isDrawingMode) {
      setDrawingMode(true);
    }

    replayStrokes();
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
        <button data-role="annotate-toggle">Annotate: OFF</button>
        <label class="bbrush-toolbar-field">
          <span>Color</span>
          <input data-role="color" type="color" value="#000000" />
        </label>
        <button data-role="size-toggle">Size +</button>
        <label class="bbrush-toolbar-field bbrush-toolbar-size" data-role="size-field">
          <span>Size</span>
          <input data-role="size" type="range" min="1" max="24" value="4" />
        </label>
        <button data-role="tool-brush">Pen</button>
        <button data-role="tool-text">Text</button>
        <button data-role="undo">Undo</button>
        <button data-role="clear">Clear</button>
      </div>
    `;

    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = chrome.runtime.getURL('toolbar.css');
    shadowRoot.prepend(stylesheet);

    const dragHandle = shadowRoot.querySelector('[data-role="drag"]');
    const annotateToggleButton = shadowRoot.querySelector('[data-role="annotate-toggle"]');
    const colorInput = shadowRoot.querySelector('[data-role="color"]');
    const sizeToggle = shadowRoot.querySelector('[data-role="size-toggle"]');
    const sizeField = shadowRoot.querySelector('[data-role="size-field"]');
    const sizeInput = shadowRoot.querySelector('[data-role="size"]');
    const drawButton = shadowRoot.querySelector('[data-role="tool-brush"]');
    const textButton = shadowRoot.querySelector('[data-role="tool-text"]');
    const toolbar = shadowRoot.querySelector('.bbrush-toolbar');
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

    annotateToggleButton.addEventListener('click', () => {
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
      annotateToggleButton,
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

    ensureHistoryInitialized();
    recomputeNextTextId();

    state.canvas.style.display = 'block';
    state.toolbarHost.style.display = 'block';
    setDrawingMode(false);
    updateToolbarState();
    replayStrokes();
    state.enabled = true;
  }

  function disableOverlay() {
    if (!state.enabled || !state.canvas) {
      return;
    }

    setDrawingMode(false);
    clearInteractionState();
    state.selectedTextId = null;

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

    if (!active) {
      clearInteractionState();
      state.selectedTextId = null;

      if (state.textEditor && state.textEditor.element) {
        state.textEditor.element.remove();
        state.textEditor = null;
      }

      replayStrokes();
    }

    state.canvas.style.pointerEvents = active ? 'auto' : 'none';
    document.body.style.cursor = active ? 'crosshair' : '';
    updateCanvasCursor();
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
      return;
    }

    if (message.type === 'BBRUSH_GET_STATUS') {
      sendResponse({ ok: true, overlayEnabled: state.enabled, drawingMode: state.isDrawingMode });
    }
  });

  document.addEventListener('keydown', handleKeyDown);
  window.addEventListener('resize', handleResize);

  window.__BBRUSH__ = {
    enableOverlay,
    disableOverlay
  };
})();
