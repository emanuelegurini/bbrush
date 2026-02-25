(function initBbrush() {
  if (window.__BBRUSH__) {
    return;
  }

  const ANCHOR_SIZE = 10;
  const MIN_TEXT_SIZE = 10;
  const eraserCursorCache = new Map();

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
    isDraggingLauncher: false,
    launcherDragStartX: 0,
    launcherDragStartY: 0,
    launcherPointerId: null,
    suppressNextLauncherClick: false,
    isDrawingMode: false,
    activeTool: 'brush',
    isPointerDown: false,
    eraserDidMutate: false,
    brushColor: '#ff00bb',
    penSize: 4,
    textSize: 18,
    isSizeExpanded: false,
    isToolbarExpanded: false,
    showQuickMenu: false,
    showShortcuts: false,
    currentStroke: null,
    strokes: [],
    textEditor: null,
    selectedTextId: null,
    selectedArrowId: null,
    selectedRectId: null,
    interactionMode: 'none',
    activeAnchor: null,
    interactionPointerId: null,
    interactionStartPoint: null,
    interactionStartText: null,
    textCloneCreatedOnDrag: false,
    interactionStartArrow: null,
    interactionStartRect: null,
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
      if (typeof entry.id === 'number' && entry.id > maxId) {
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

  function getEraserCursor(size) {
    const diameter = Math.max(12, Math.min(48, Math.round(size * 2 + 4)));

    if (eraserCursorCache.has(diameter)) {
      return eraserCursorCache.get(diameter);
    }

    const center = Math.floor(diameter / 2);
    const radius = Math.max(3, center - 2);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${diameter}" height="${diameter}" viewBox="0 0 ${diameter} ${diameter}"><circle cx="${center}" cy="${center}" r="${radius}" fill="rgba(255,255,255,0.12)" stroke="rgba(17,24,39,0.95)" stroke-width="2"/></svg>`;
    const cursor = `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${center} ${center}, crosshair`;
    eraserCursorCache.set(diameter, cursor);
    return cursor;
  }

  function getTextFontSize() {
    return Math.max(12, state.textSize);
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

  function getArrowEntryById(id) {
    return state.strokes.find((entry) => entry.type === 'arrow' && entry.id === id) || null;
  }

  function getRectEntryById(id) {
    return state.strokes.find((entry) => entry.type === 'rect' && entry.id === id) || null;
  }

  function getSelectedRectEntry() {
    if (state.selectedRectId === null) {
      return null;
    }

    return getRectEntryById(state.selectedRectId);
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

  function hitTestRectAnchor(point, entry) {
    const bounds = getRectBounds(entry);
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

  function findTopRectAtPoint(point) {
    for (let i = state.strokes.length - 1; i >= 0; i -= 1) {
      const entry = state.strokes[i];
      if (entry.type !== 'rect') {
        continue;
      }

      if (hitTestRectBody(point, entry)) {
        return entry;
      }
    }

    return null;
  }

  function getSelectedArrowEntry() {
    if (state.selectedArrowId === null) {
      return null;
    }

    return getArrowEntryById(state.selectedArrowId);
  }

  function getArrowHandlePoints(entry) {
    return {
      start: { x: entry.x1, y: entry.y1 },
      end: { x: entry.x2, y: entry.y2 }
    };
  }

  function hitTestArrowHandle(point, entry) {
    const handles = getArrowHandlePoints(entry);
    const half = ANCHOR_SIZE / 2;

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

  function distancePointToSegment(point, segmentStart, segmentEnd) {
    const segX = segmentEnd.x - segmentStart.x;
    const segY = segmentEnd.y - segmentStart.y;
    const segLenSq = segX * segX + segY * segY;

    if (segLenSq === 0) {
      return Math.hypot(point.x - segmentStart.x, point.y - segmentStart.y);
    }

    let t = ((point.x - segmentStart.x) * segX + (point.y - segmentStart.y) * segY) / segLenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = segmentStart.x + t * segX;
    const projY = segmentStart.y + t * segY;
    return Math.hypot(point.x - projX, point.y - projY);
  }

  function hitTestArrowBody(point, entry) {
    const distance = distancePointToSegment(
      point,
      { x: entry.x1, y: entry.y1 },
      { x: entry.x2, y: entry.y2 }
    );
    const threshold = Math.max(8, entry.size + 4);
    return distance <= threshold;
  }

  function findTopArrowAtPoint(point) {
    for (let i = state.strokes.length - 1; i >= 0; i -= 1) {
      const entry = state.strokes[i];
      if (entry.type !== 'arrow') {
        continue;
      }

      if (hitTestArrowBody(point, entry)) {
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
    state.textCloneCreatedOnDrag = false;
    state.interactionStartArrow = null;
    state.interactionStartRect = null;
  }

  function cloneTextEntry(entry) {
    if (!entry || entry.type !== 'text') {
      return null;
    }

    const clone = {
      id: state.nextTextId,
      type: 'text',
      text: entry.text,
      x: entry.x,
      y: entry.y,
      color: entry.color,
      fontSize: entry.fontSize,
      width: entry.width,
      height: entry.height
    };

    state.nextTextId += 1;
    state.strokes.push(clone);
    return clone;
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

  function isArrowTransformChanged(entry, startArrow) {
    if (!entry || !startArrow) {
      return false;
    }

    return (
      entry.x1 !== startArrow.x1 ||
      entry.y1 !== startArrow.y1 ||
      entry.x2 !== startArrow.x2 ||
      entry.y2 !== startArrow.y2
    );
  }

  function isRectTransformChanged(entry, startRect) {
    if (!entry || !startRect) {
      return false;
    }

    return (
      entry.x1 !== startRect.x1 ||
      entry.y1 !== startRect.y1 ||
      entry.x2 !== startRect.x2 ||
      entry.y2 !== startRect.y2
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
    state.selectedArrowId = null;
    state.selectedRectId = null;
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
    input.style.background = 'transparent';
    input.style.border = '1px dashed rgba(255, 255, 255, 0.5)';
    input.style.borderRadius = '4px';
    input.style.padding = '2px 4px';
    input.style.minWidth = '120px';
    input.style.outline = 'none';

    document.body.appendChild(input);
    input.focus();
    state.selectedTextId = null;
    state.selectedArrowId = null;
    state.selectedRectId = null;

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

  function hitTestBrushStroke(point, entry, radius) {
    if (!entry.points || entry.points.length === 0) {
      return false;
    }

    const threshold = radius + entry.size / 2;

    if (entry.points.length === 1) {
      return Math.hypot(point.x - entry.points[0].x, point.y - entry.points[0].y) <= threshold;
    }

    for (let i = 0; i < entry.points.length - 1; i += 1) {
      const distance = distancePointToSegment(point, entry.points[i], entry.points[i + 1]);
      if (distance <= threshold) {
        return true;
      }
    }

    return false;
  }

  function hitTestRectAny(point, entry, radius) {
    const bounds = getRectBounds(entry);
    return (
      point.x >= bounds.left - radius &&
      point.x <= bounds.right + radius &&
      point.y >= bounds.top - radius &&
      point.y <= bounds.bottom + radius
    );
  }

  function hitTestTextAny(point, entry, radius) {
    const bounds = getTextBounds(entry);
    return (
      point.x >= bounds.left - radius &&
      point.x <= bounds.right + radius &&
      point.y >= bounds.top - radius &&
      point.y <= bounds.bottom + radius
    );
  }

  function hitTestArrowAny(point, entry, radius) {
    const distance = distancePointToSegment(
      point,
      { x: entry.x1, y: entry.y1 },
      { x: entry.x2, y: entry.y2 }
    );
    return distance <= radius + entry.size / 2 + 2;
  }

  function isEntryHitByEraser(point, radius, entry) {
    if (!entry) {
      return false;
    }

    if (entry.type === 'brush') {
      return hitTestBrushStroke(point, entry, radius);
    }

    if (entry.type === 'rect') {
      return hitTestRectAny(point, entry, radius);
    }

    if (entry.type === 'arrow') {
      return hitTestArrowAny(point, entry, radius);
    }

    if (entry.type === 'text') {
      return hitTestTextAny(point, entry, radius);
    }

    return false;
  }

  function eraseTopEntryAtPoint(point) {
    const radius = Math.max(1, state.penSize / 2);

    for (let i = state.strokes.length - 1; i >= 0; i -= 1) {
      const entry = state.strokes[i];
      if (!isEntryHitByEraser(point, radius, entry)) {
        continue;
      }

      if (state.selectedTextId === entry.id) {
        state.selectedTextId = null;
      }

      if (state.selectedArrowId === entry.id) {
        state.selectedArrowId = null;
      }

      if (state.selectedRectId === entry.id) {
        state.selectedRectId = null;
      }

      state.strokes.splice(i, 1);
      return true;
    }

    return false;
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

  function drawArrowEntry(entry) {
    if (!state.context || !entry) {
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

    state.context.save();
    state.context.strokeStyle = entry.color;
    state.context.fillStyle = entry.color;
    state.context.lineWidth = entry.size;
    state.context.lineCap = 'round';
    state.context.lineJoin = 'round';

    state.context.beginPath();
    state.context.moveTo(entry.x1, entry.y1);
    state.context.lineTo(entry.x2, entry.y2);
    state.context.stroke();

    state.context.beginPath();
    state.context.arc(entry.x1, entry.y1, Math.max(1.8, entry.size * 0.35), 0, Math.PI * 2);
    state.context.fill();

    state.context.beginPath();
    state.context.moveTo(entry.x2, entry.y2);
    state.context.lineTo(shaftEndX + perpX * (headWidth / 2), shaftEndY + perpY * (headWidth / 2));
    state.context.lineTo(shaftEndX - perpX * (headWidth / 2), shaftEndY - perpY * (headWidth / 2));
    state.context.closePath();
    state.context.fill();
    state.context.restore();
  }

  function drawRectEntry(entry) {
    if (!state.context || !entry) {
      return;
    }

    const left = Math.min(entry.x1, entry.x2);
    const top = Math.min(entry.y1, entry.y2);
    const width = Math.abs(entry.x2 - entry.x1);
    const height = Math.abs(entry.y2 - entry.y1);

    state.context.save();
    state.context.strokeStyle = entry.color;
    state.context.lineWidth = entry.size;
    state.context.lineCap = 'round';
    state.context.lineJoin = 'round';
    state.context.strokeRect(left, top, width, height);
    state.context.restore();
  }

  function drawRectSelection(entry) {
    if (!state.context || !entry) {
      return;
    }

    const bounds = getRectBounds(entry);
    const anchors = getAnchorPoints(bounds);
    const half = ANCHOR_SIZE / 2;

    state.context.save();
    state.context.strokeStyle = '#0a84ff';
    state.context.lineWidth = 1;
    state.context.setLineDash([5, 3]);
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

  function drawArrowSelection(entry) {
    if (!state.context || !entry) {
      return;
    }

    const handles = getArrowHandlePoints(entry);
    const half = ANCHOR_SIZE / 2;

    state.context.save();
    state.context.strokeStyle = '#0a84ff';
    state.context.lineWidth = 1;
    state.context.setLineDash([5, 3]);
    state.context.beginPath();
    state.context.moveTo(entry.x1, entry.y1);
    state.context.lineTo(entry.x2, entry.y2);
    state.context.stroke();
    state.context.setLineDash([]);

    for (const handle of Object.values(handles)) {
      state.context.fillStyle = '#ffffff';
      state.context.strokeStyle = '#0a84ff';
      state.context.lineWidth = 1.2;
      state.context.fillRect(handle.x - half, handle.y - half, ANCHOR_SIZE, ANCHOR_SIZE);
      state.context.strokeRect(handle.x - half, handle.y - half, ANCHOR_SIZE, ANCHOR_SIZE);
    }

    state.context.restore();
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

    if (state.activeTool === 'eraser') {
      state.canvas.style.cursor = getEraserCursor(state.penSize);
      return;
    }

    if (state.activeTool === 'rect') {
      if (state.interactionMode === 'drag-rect') {
        state.canvas.style.cursor = 'grabbing';
        return;
      }

      if (state.interactionMode === 'resize-rect' && state.activeAnchor) {
        state.canvas.style.cursor = getAnchorCursor(state.activeAnchor);
        return;
      }

      if (!pointerPoint) {
        state.canvas.style.cursor = 'crosshair';
        return;
      }

      const selectedRect = getSelectedRectEntry();
      if (selectedRect) {
        const anchor = hitTestRectAnchor(pointerPoint, selectedRect);
        if (anchor) {
          state.canvas.style.cursor = getAnchorCursor(anchor);
          return;
        }

        if (hitTestRectBody(pointerPoint, selectedRect)) {
          state.canvas.style.cursor = 'move';
          return;
        }
      }

      const hoveredRect = findTopRectAtPoint(pointerPoint);
      state.canvas.style.cursor = hoveredRect ? 'move' : 'crosshair';
      return;
    }

    if (state.activeTool === 'arrow') {
      if (state.interactionMode === 'drag-arrow') {
        state.canvas.style.cursor = 'grabbing';
        return;
      }

      if (
        state.interactionMode === 'resize-arrow-start' ||
        state.interactionMode === 'resize-arrow-end'
      ) {
        state.canvas.style.cursor = 'crosshair';
        return;
      }

      if (!pointerPoint) {
        state.canvas.style.cursor = 'crosshair';
        return;
      }

      const selectedArrow = getSelectedArrowEntry();
      if (selectedArrow) {
        const handle = hitTestArrowHandle(pointerPoint, selectedArrow);
        if (handle) {
          state.canvas.style.cursor = 'crosshair';
          return;
        }

        if (hitTestArrowBody(pointerPoint, selectedArrow)) {
          state.canvas.style.cursor = 'move';
          return;
        }
      }

      const hoveredArrow = findTopArrowAtPoint(pointerPoint);
      state.canvas.style.cursor = hoveredArrow ? 'move' : 'crosshair';
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

      if (entry.type === 'arrow') {
        drawArrowEntry(entry);
        continue;
      }

      if (entry.type === 'rect') {
        drawRectEntry(entry);
        continue;
      }

      drawStrokePath(entry);
    }

    if (state.currentStroke) {
      if (state.currentStroke.type === 'arrow') {
        drawArrowEntry(state.currentStroke);
      } else if (state.currentStroke.type === 'rect') {
        drawRectEntry(state.currentStroke);
      } else {
        drawStrokePath(state.currentStroke);
      }
    }

    if (state.activeTool === 'text') {
      const selected = getSelectedTextEntry();
      if (selected) {
        drawTextSelection(selected);
      }
    }

    if (state.activeTool === 'arrow') {
      const selectedArrow = getSelectedArrowEntry();
      if (selectedArrow) {
        drawArrowSelection(selectedArrow);
      }
    }

    if (state.activeTool === 'rect') {
      const selectedRect = getSelectedRectEntry();
      if (selectedRect) {
        drawRectSelection(selectedRect);
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

    if (!getSelectedArrowEntry()) {
      state.selectedArrowId = null;
    }

    if (!getSelectedRectEntry()) {
      state.selectedRectId = null;
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
    state.selectedArrowId = null;
    state.selectedRectId = null;
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

  function applyRectResize(point) {
    const selected = getSelectedRectEntry();
    const startRect = state.interactionStartRect;
    const startPoint = state.interactionStartPoint;
    const anchor = state.activeAnchor;

    if (!selected || !startRect || !startPoint || !anchor) {
      return;
    }

    const minSize = 6;
    const startBounds = getRectBounds(startRect);
    const dx = point.x - startPoint.x;
    const dy = point.y - startPoint.y;
    let left = startBounds.left;
    let right = startBounds.right;
    let top = startBounds.top;
    let bottom = startBounds.bottom;

    if (anchor.includes('w')) {
      left = Math.min(startBounds.right - minSize, startBounds.left + dx);
    }

    if (anchor.includes('e')) {
      right = Math.max(startBounds.left + minSize, startBounds.right + dx);
    }

    if (anchor.includes('n')) {
      top = Math.min(startBounds.bottom - minSize, startBounds.top + dy);
    }

    if (anchor.includes('s')) {
      bottom = Math.max(startBounds.top + minSize, startBounds.bottom + dy);
    }

    left = Math.max(0, left);
    top = Math.max(0, top);

    if (state.canvas) {
      right = Math.min(state.canvas.width, right);
      bottom = Math.min(state.canvas.height, bottom);
    }

    selected.x1 = left;
    selected.y1 = top;
    selected.x2 = right;
    selected.y2 = bottom;
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
        size: state.penSize,
        points: [point]
      };

      replayStrokes();
      return;
    }

    if (state.activeTool === 'eraser') {
      state.selectedTextId = null;
      state.selectedArrowId = null;
      state.selectedRectId = null;
      clearInteractionState();
      state.isPointerDown = true;
      state.currentStroke = null;
      state.eraserDidMutate = eraseTopEntryAtPoint(point);
      if (state.eraserDidMutate) {
        replayStrokes();
      }
      return;
    }

    if (state.activeTool === 'rect') {
      event.preventDefault();
      const selectedRect = getSelectedRectEntry();

      if (selectedRect) {
        const anchor = hitTestRectAnchor(point, selectedRect);
        if (anchor) {
          state.interactionMode = 'resize-rect';
          state.activeAnchor = anchor;
          state.interactionPointerId = event.pointerId;
          state.interactionStartPoint = point;
          state.interactionStartRect = {
            x1: selectedRect.x1,
            y1: selectedRect.y1,
            x2: selectedRect.x2,
            y2: selectedRect.y2
          };
          state.canvas.setPointerCapture(event.pointerId);
          updateCanvasCursor(point);
          return;
        }

        if (hitTestRectBody(point, selectedRect)) {
          state.interactionMode = 'drag-rect';
          state.interactionPointerId = event.pointerId;
          state.interactionStartPoint = point;
          state.interactionStartRect = {
            x1: selectedRect.x1,
            y1: selectedRect.y1,
            x2: selectedRect.x2,
            y2: selectedRect.y2
          };
          state.canvas.setPointerCapture(event.pointerId);
          updateCanvasCursor(point);
          return;
        }
      }

      const clickedRect = findTopRectAtPoint(point);
      if (clickedRect) {
        state.selectedRectId = clickedRect.id;
        state.selectedTextId = null;
        state.selectedArrowId = null;
        state.interactionMode = 'drag-rect';
        state.interactionPointerId = event.pointerId;
        state.interactionStartPoint = point;
        state.interactionStartRect = {
          x1: clickedRect.x1,
          y1: clickedRect.y1,
          x2: clickedRect.x2,
          y2: clickedRect.y2
        };
        state.canvas.setPointerCapture(event.pointerId);
        replayStrokes();
        updateCanvasCursor(point);
        return;
      }

      state.selectedTextId = null;
      state.selectedArrowId = null;
      state.selectedRectId = null;
      clearInteractionState();
      state.isPointerDown = true;
      state.currentStroke = {
        id: state.nextTextId,
        type: 'rect',
        color: state.brushColor,
        size: state.penSize,
        x1: point.x,
        y1: point.y,
        x2: point.x,
        y2: point.y
      };
      state.nextTextId += 1;
      replayStrokes();
      return;
    }

    if (state.activeTool === 'arrow') {
      event.preventDefault();
      const selectedArrow = getSelectedArrowEntry();

      if (selectedArrow) {
        const handle = hitTestArrowHandle(point, selectedArrow);
        if (handle) {
          state.interactionMode = handle === 'start' ? 'resize-arrow-start' : 'resize-arrow-end';
          state.interactionPointerId = event.pointerId;
          state.interactionStartPoint = point;
          state.interactionStartArrow = {
            x1: selectedArrow.x1,
            y1: selectedArrow.y1,
            x2: selectedArrow.x2,
            y2: selectedArrow.y2
          };
          state.canvas.setPointerCapture(event.pointerId);
          updateCanvasCursor(point);
          return;
        }

        if (hitTestArrowBody(point, selectedArrow)) {
          state.interactionMode = 'drag-arrow';
          state.interactionPointerId = event.pointerId;
          state.interactionStartPoint = point;
          state.interactionStartArrow = {
            x1: selectedArrow.x1,
            y1: selectedArrow.y1,
            x2: selectedArrow.x2,
            y2: selectedArrow.y2
          };
          state.canvas.setPointerCapture(event.pointerId);
          updateCanvasCursor(point);
          return;
        }
      }

      const clickedArrow = findTopArrowAtPoint(point);
      if (clickedArrow) {
        state.selectedArrowId = clickedArrow.id;
        state.interactionMode = 'drag-arrow';
        state.interactionPointerId = event.pointerId;
        state.interactionStartPoint = point;
        state.interactionStartArrow = {
          x1: clickedArrow.x1,
          y1: clickedArrow.y1,
          x2: clickedArrow.x2,
          y2: clickedArrow.y2
        };
        state.canvas.setPointerCapture(event.pointerId);
        replayStrokes();
        updateCanvasCursor(point);
        return;
      }

      clearInteractionState();
      state.selectedTextId = null;
      state.selectedArrowId = null;
      state.selectedRectId = null;
      state.isPointerDown = true;
      state.currentStroke = {
        id: state.nextTextId,
        type: 'arrow',
        color: state.brushColor,
        size: state.penSize,
        x1: point.x,
        y1: point.y,
        x2: point.x,
        y2: point.y
      };
      state.nextTextId += 1;
      replayStrokes();
      return;
    }

    if (state.activeTool !== 'text') {
      return;
    }

    event.preventDefault();
    state.textCloneCreatedOnDrag = false;

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
        let textForDrag = selected;
        if (event.altKey) {
          const clone = cloneTextEntry(selected);
          if (clone) {
            textForDrag = clone;
            state.selectedTextId = clone.id;
            state.textCloneCreatedOnDrag = true;
          }
        }

        state.interactionMode = 'drag-text';
        state.interactionPointerId = event.pointerId;
        state.interactionStartPoint = point;
        state.interactionStartText = {
          x: textForDrag.x,
          y: textForDrag.y,
          width: textForDrag.width,
          height: textForDrag.height,
          fontSize: textForDrag.fontSize
        };
        state.canvas.setPointerCapture(event.pointerId);
        replayStrokes();
        updateCanvasCursor(point);
        return;
      }
    }

    const clickedText = findTopTextAtPoint(point);
    if (clickedText) {
      let textForDrag = clickedText;
      if (event.altKey) {
        const clone = cloneTextEntry(clickedText);
        if (clone) {
          textForDrag = clone;
          state.textCloneCreatedOnDrag = true;
        }
      }

      state.selectedTextId = textForDrag.id;
      state.interactionMode = 'drag-text';
      state.interactionPointerId = event.pointerId;
      state.interactionStartPoint = point;
      state.interactionStartText = {
        x: textForDrag.x,
        y: textForDrag.y,
        width: textForDrag.width,
        height: textForDrag.height,
        fontSize: textForDrag.fontSize
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
        if (event.shiftKey && state.currentStroke.points.length > 0) {
          state.currentStroke.points = [state.currentStroke.points[0], point];
        } else {
          const smoothedPoint = getSmoothedPoint(point, state.currentStroke.points);
          state.currentStroke.points.push(smoothedPoint);
        }
      }

      replayStrokes();
      return;
    }

    if (state.activeTool === 'eraser') {
      if (!state.isPointerDown) {
        return;
      }

      const didMutate = eraseTopEntryAtPoint(point);
      if (didMutate) {
        state.eraserDidMutate = true;
        replayStrokes();
      }
      return;
    }

    if (state.activeTool === 'rect') {
      if (
        state.interactionMode !== 'none' &&
        state.interactionPointerId !== null &&
        event.pointerId !== state.interactionPointerId
      ) {
        return;
      }

      const selectedRect = getSelectedRectEntry();

      if (
        state.interactionMode === 'drag-rect' &&
        selectedRect &&
        state.interactionStartPoint &&
        state.interactionStartRect
      ) {
        const dx = point.x - state.interactionStartPoint.x;
        const dy = point.y - state.interactionStartPoint.y;
        selectedRect.x1 = state.interactionStartRect.x1 + dx;
        selectedRect.y1 = state.interactionStartRect.y1 + dy;
        selectedRect.x2 = state.interactionStartRect.x2 + dx;
        selectedRect.y2 = state.interactionStartRect.y2 + dy;
        replayStrokes();
        updateCanvasCursor(point);
        return;
      }

      if (
        state.interactionMode === 'resize-rect' &&
        selectedRect &&
        state.interactionStartPoint &&
        state.interactionStartRect &&
        state.activeAnchor
      ) {
        applyRectResize(point);
        replayStrokes();
        updateCanvasCursor(point);
        return;
      }

      if (!state.isPointerDown || !state.currentStroke || state.currentStroke.type !== 'rect') {
        updateCanvasCursor(point);
        return;
      }

      state.currentStroke.x2 = point.x;
      state.currentStroke.y2 = point.y;
      replayStrokes();
      return;
    }

    if (state.activeTool === 'arrow') {
      if (
        state.interactionMode !== 'none' &&
        state.interactionPointerId !== null &&
        event.pointerId !== state.interactionPointerId
      ) {
        return;
      }

      const selectedArrow = getSelectedArrowEntry();

      if (
        state.interactionMode === 'drag-arrow' &&
        selectedArrow &&
        state.interactionStartPoint &&
        state.interactionStartArrow
      ) {
        const dx = point.x - state.interactionStartPoint.x;
        const dy = point.y - state.interactionStartPoint.y;
        selectedArrow.x1 = state.interactionStartArrow.x1 + dx;
        selectedArrow.y1 = state.interactionStartArrow.y1 + dy;
        selectedArrow.x2 = state.interactionStartArrow.x2 + dx;
        selectedArrow.y2 = state.interactionStartArrow.y2 + dy;
        replayStrokes();
        updateCanvasCursor(point);
        return;
      }

      if (
        state.interactionMode === 'resize-arrow-start' &&
        selectedArrow &&
        state.interactionStartArrow
      ) {
        selectedArrow.x1 = point.x;
        selectedArrow.y1 = point.y;
        replayStrokes();
        updateCanvasCursor(point);
        return;
      }

      if (
        state.interactionMode === 'resize-arrow-end' &&
        selectedArrow &&
        state.interactionStartArrow
      ) {
        selectedArrow.x2 = point.x;
        selectedArrow.y2 = point.y;
        replayStrokes();
        updateCanvasCursor(point);
        return;
      }

      if (state.isPointerDown && state.currentStroke && state.currentStroke.type === 'arrow') {
        state.currentStroke.x2 = point.x;
        state.currentStroke.y2 = point.y;
        replayStrokes();
        return;
      }

      updateCanvasCursor(point);
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

    if (state.activeTool === 'eraser') {
      if (state.eraserDidMutate) {
        pushHistorySnapshot();
      }

      state.currentStroke = null;
      state.isPointerDown = false;
      state.eraserDidMutate = false;
      updateCanvasCursor();
      return;
    }

    if (state.activeTool === 'rect') {
      const selectedRect = getSelectedRectEntry();
      let didCommitTransform = false;

      if (
        selectedRect &&
        (state.interactionMode === 'drag-rect' || state.interactionMode === 'resize-rect') &&
        state.interactionStartRect &&
        isRectTransformChanged(selectedRect, state.interactionStartRect)
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

      if (state.currentStroke && state.currentStroke.type === 'rect') {
        const dx = state.currentStroke.x2 - state.currentStroke.x1;
        const dy = state.currentStroke.y2 - state.currentStroke.y1;
        if (Math.max(Math.abs(dx), Math.abs(dy)) >= 3) {
          state.strokes.push(state.currentStroke);
          state.selectedRectId = state.currentStroke.id;
          pushHistorySnapshot();
          didCommitTransform = true;
        }
      }

      state.currentStroke = null;
      state.isPointerDown = false;
      clearInteractionState();
      if (!didCommitTransform) {
        replayStrokes();
      } else {
        updateCanvasCursor();
      }
      return;
    }

    if (state.activeTool === 'arrow') {
      const selectedArrow = getSelectedArrowEntry();
      let didCommitTransform = false;

      if (
        selectedArrow &&
        (state.interactionMode === 'drag-arrow' ||
          state.interactionMode === 'resize-arrow-start' ||
          state.interactionMode === 'resize-arrow-end') &&
        state.interactionStartArrow &&
        isArrowTransformChanged(selectedArrow, state.interactionStartArrow)
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

      if (state.currentStroke && state.currentStroke.type === 'arrow') {
        const dx = state.currentStroke.x2 - state.currentStroke.x1;
        const dy = state.currentStroke.y2 - state.currentStroke.y1;
        if (Math.hypot(dx, dy) >= 3) {
          state.strokes.push(state.currentStroke);
          state.selectedArrowId = state.currentStroke.id;
          pushHistorySnapshot();
          didCommitTransform = true;
        }
      }

      state.currentStroke = null;
      state.isPointerDown = false;
      clearInteractionState();
      if (!didCommitTransform) {
        replayStrokes();
      } else {
        updateCanvasCursor();
      }
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
      (isTextTransformChanged(selected, state.interactionStartText) || state.textCloneCreatedOnDrag)
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

    if (state.textEditor && state.textEditor.element && !undoPressed && key !== 'escape') {
      return;
    }

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

    if (key === 'e') {
      setActiveTool('eraser');
      event.preventDefault();
      return;
    }

    if (key === 't') {
      setActiveTool('text');
      event.preventDefault();
      return;
    }

    if (key === 'a') {
      setActiveTool('arrow');
      event.preventDefault();
      return;
    }

    if (key === 'r') {
      setActiveTool('rect');
      event.preventDefault();
      return;
    }

    if (key === 'escape') {
      if (state.textEditor && state.textEditor.element) {
        state.textEditor.element.blur();
        event.preventDefault();
        return;
      }

      if (
        state.selectedTextId !== null ||
        state.selectedArrowId !== null ||
        state.selectedRectId !== null ||
        state.interactionMode !== 'none'
      ) {
        state.selectedTextId = null;
        state.selectedArrowId = null;
        state.selectedRectId = null;
        clearInteractionState();
        replayStrokes();
        updateCanvasCursor();
        event.preventDefault();
      }

      return;
    }

    if (key === 'c') {
      clearAllStrokes();
      event.preventDefault();
      return;
    }

    if (key === '[') {
      if (state.activeTool === 'text') {
        state.textSize = Math.max(12, state.textSize - 1);
      } else {
        state.penSize = Math.max(1, state.penSize - 1);
      }
      if (state.toolbarElements) {
        state.toolbarElements.sizeInput.value = String(
          state.activeTool === 'text' ? state.textSize : state.penSize
        );
      }
      event.preventDefault();
      return;
    }

    if (key === ']') {
      if (state.activeTool === 'text') {
        state.textSize = Math.min(96, state.textSize + 1);
      } else {
        state.penSize = Math.min(24, state.penSize + 1);
      }
      if (state.toolbarElements) {
        state.toolbarElements.sizeInput.value = String(
          state.activeTool === 'text' ? state.textSize : state.penSize
        );
      }
      event.preventDefault();
      return;
    }

    if (key === '?') {
      state.showShortcuts = !state.showShortcuts;
      if (state.showShortcuts) {
        state.isToolbarExpanded = true;
      }
      updateToolbarState();
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

  function setToolbarExpanded(expanded) {
    state.isToolbarExpanded = expanded;

    if (!expanded) {
      state.showShortcuts = false;
    }

    updateToolbarState();
  }

  function toggleToolbarExpanded() {
    setToolbarExpanded(!state.isToolbarExpanded);
  }

  function setQuickMenuVisible(visible) {
    state.showQuickMenu = visible;
    updateToolbarState();
  }

  function updateToolbarState() {
    if (!state.toolbarElements) {
      return;
    }

    const activeSize = state.activeTool === 'text' ? state.textSize : state.penSize;

    state.toolbarElements.drawButton.classList.toggle('is-active', state.activeTool === 'brush');
    state.toolbarElements.eraserButton.classList.toggle('is-active', state.activeTool === 'eraser');
    state.toolbarElements.rectButton.classList.toggle('is-active', state.activeTool === 'rect');
    state.toolbarElements.arrowButton.classList.toggle('is-active', state.activeTool === 'arrow');
    state.toolbarElements.textButton.classList.toggle('is-active', state.activeTool === 'text');
    state.toolbarElements.annotateToggleButton.classList.toggle('is-active', state.isDrawingMode);
    state.toolbarElements.sizeToggle.classList.toggle('is-active', state.isSizeExpanded);
    state.toolbarElements.toolbar.classList.toggle('is-drawing', state.isDrawingMode);
    state.toolbarElements.sizeField.classList.toggle('is-expanded', state.isSizeExpanded);
    state.toolbarElements.shortcutsPanel.classList.toggle('is-open', state.showShortcuts);
    state.toolbarElements.quickMenu.classList.toggle('is-open', state.showQuickMenu);
    state.toolbarElements.panel.classList.toggle('is-open', state.isToolbarExpanded);
    state.toolbarElements.quickMenu.hidden = !state.showQuickMenu;
    state.toolbarElements.panel.hidden = !state.isToolbarExpanded;
    state.toolbarElements.launcherTool.textContent =
      state.activeTool === 'text'
        ? 'T'
        : state.activeTool === 'arrow'
          ? 'A'
          : state.activeTool === 'rect'
            ? 'R'
            : state.activeTool === 'eraser'
              ? 'E'
              : 'P';
    state.toolbarElements.launcher.classList.toggle('is-annotating', state.isDrawingMode);
    state.toolbarElements.launcher.style.borderColor = state.brushColor;
    state.toolbarElements.launcher.style.boxShadow = state.isDrawingMode
      ? `0 0 0 3px ${state.brushColor}55, 0 10px 24px rgba(0, 0, 0, 0.26)`
      : `0 10px 24px rgba(0, 0, 0, 0.26)`;
    state.toolbarElements.sizeLabel.textContent =
      state.activeTool === 'text'
        ? 'Text size'
        : state.activeTool === 'eraser'
          ? 'Eraser size'
          : 'Pen size';
    state.toolbarElements.annotateToggleButton.title = state.isDrawingMode
      ? 'Disable annotation'
      : 'Enable annotation';
    state.toolbarElements.sizeToggle.title = state.isSizeExpanded ? 'Hide size' : 'Show size';
    state.toolbarElements.sizeInput.min = state.activeTool === 'text' ? '12' : '1';
    state.toolbarElements.sizeInput.max = state.activeTool === 'text' ? '96' : '24';
    state.toolbarElements.sizeInput.value = String(activeSize);

    if (!state.isDrawingMode) {
      state.isSizeExpanded = false;
      state.showShortcuts = false;
      state.showQuickMenu = false;
      state.isToolbarExpanded = false;
      state.toolbarElements.sizeField.classList.remove('is-expanded');
      state.toolbarElements.shortcutsPanel.classList.remove('is-open');
      state.toolbarElements.quickMenu.classList.remove('is-open');
      state.toolbarElements.panel.classList.remove('is-open');
      state.toolbarElements.quickMenu.hidden = true;
      state.toolbarElements.panel.hidden = true;
    }

    state.toolbarElements.colorInput.disabled = !state.isDrawingMode;
    state.toolbarElements.sizeToggle.disabled = !state.isDrawingMode;
    state.toolbarElements.sizeInput.disabled = !state.isDrawingMode;
    state.toolbarElements.drawButton.disabled = !state.isDrawingMode;
    state.toolbarElements.eraserButton.disabled = !state.isDrawingMode;
    state.toolbarElements.rectButton.disabled = !state.isDrawingMode;
    state.toolbarElements.arrowButton.disabled = !state.isDrawingMode;
    state.toolbarElements.textButton.disabled = !state.isDrawingMode;
    state.toolbarElements.undoButton.disabled = !state.isDrawingMode;
    state.toolbarElements.clearButton.disabled = !state.isDrawingMode;
    state.toolbarElements.shortcutsButton.disabled = !state.isDrawingMode;
    state.toolbarElements.quickUndoButton.disabled = !state.isDrawingMode;
    state.toolbarElements.quickClearButton.disabled = !state.isDrawingMode;

    if (state.canvas) {
      state.canvas.style.boxShadow = state.isDrawingMode
        ? 'inset 0 0 0 2px rgba(23, 98, 166, 0.9)'
        : 'none';
      updateCanvasCursor();
    }
  }

  function setActiveTool(tool) {
    state.activeTool = tool;

    if (tool === 'arrow') {
      state.selectedTextId = null;
      state.selectedRectId = null;
    }

    if (tool === 'text') {
      state.selectedArrowId = null;
      state.selectedRectId = null;
    }

    if (tool === 'brush' || tool === 'rect') {
      state.selectedTextId = null;
      state.selectedArrowId = null;
      state.selectedRectId = null;
      clearInteractionState();
    }

    if (tool === 'eraser') {
      state.selectedTextId = null;
      state.selectedArrowId = null;
      state.selectedRectId = null;
      clearInteractionState();
    }

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
    host.style.display = 'none';
    host.style.visibility = 'hidden';

    const shadowRoot = host.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `
      <div class="bbrush-launcher-wrap">
        <button class="bbrush-launcher" data-role="launcher" title="Open bbrush panel">
          <span class="bbrush-launcher-label">BB</span>
          <span class="bbrush-launcher-tool" data-role="launcher-tool">P</span>
        </button>
        <div class="bbrush-quick-menu" data-role="quick-menu" hidden>
          <button data-role="quick-open">Open panel</button>
          <button data-role="quick-undo">Undo</button>
          <button data-role="quick-clear">Clear</button>
        </div>
      </div>
      <div class="bbrush-panel" data-role="panel" hidden>
        <div class="bbrush-toolbar">
          <div class="bbrush-toolbar-handle" data-role="drag">bbrush</div>
          <button class="bbrush-icon-button" data-role="annotate-toggle" aria-label="Toggle annotation" title="Enable annotation">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3v8" />
              <path d="M7.8 5.7A8.5 8.5 0 1 0 16.2 5.7" />
            </svg>
          </button>
          <label class="bbrush-toolbar-field">
            <span class="bbrush-visually-hidden">Color</span>
            <input data-role="color" type="color" value="#ff00bb" />
          </label>
          <button class="bbrush-icon-button" data-role="size-toggle" aria-label="Toggle size" title="Show size">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 8h10" />
              <circle cx="16" cy="8" r="2" />
              <path d="M4 16h6" />
              <circle cx="12" cy="16" r="2" />
            </svg>
          </button>
          <label class="bbrush-toolbar-field bbrush-toolbar-size" data-role="size-field">
            <span data-role="size-label">Pen size</span>
            <input data-role="size" type="range" min="1" max="24" value="4" />
          </label>
          <button class="bbrush-icon-button" data-role="tool-brush" aria-label="Pen tool" title="Pen tool (B)">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 20l4.5-1.2L19 8.3a1.9 1.9 0 0 0 0-2.7l-.6-.6a1.9 1.9 0 0 0-2.7 0L5.2 15.5z" />
              <path d="M13.5 6.5l4 4" />
            </svg>
          </button>
          <button class="bbrush-icon-button" data-role="tool-eraser" aria-label="Eraser tool" title="Eraser tool (E)">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 16l6-8 6 6-6 8H7z" />
              <path d="M4 20h16" />
            </svg>
          </button>
          <button class="bbrush-icon-button" data-role="tool-arrow" aria-label="Arrow tool" title="Arrow tool (A)">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 20L20 4" />
              <path d="M11 4h9v9" />
            </svg>
          </button>
          <button class="bbrush-icon-button" data-role="tool-rect" aria-label="Rectangle tool" title="Rectangle tool (R)">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="5" y="5" width="14" height="14" rx="1" />
            </svg>
          </button>
          <button class="bbrush-icon-button" data-role="tool-text" aria-label="Text tool" title="Text tool (T)">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 6h14" />
              <path d="M12 6v12" />
              <path d="M8 18h8" />
            </svg>
          </button>
          <button class="bbrush-icon-button" data-role="undo" aria-label="Undo" title="Undo (Ctrl/Cmd+Z)">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 8L5 12l4 4" />
              <path d="M6 12h7a6 6 0 1 1 0 12" transform="translate(0 -6)" />
            </svg>
          </button>
          <button class="bbrush-icon-button" data-role="clear" aria-label="Clear" title="Clear screen (C)">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 7h14" />
              <path d="M9 7V5h6v2" />
              <path d="M8 7l1 12h6l1-12" />
            </svg>
          </button>
          <button class="bbrush-icon-button" data-role="shortcuts-toggle" aria-label="Shortcuts" title="Show shortcuts (?)">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="6" width="18" height="12" rx="2" />
              <path d="M7 10h2" />
              <path d="M11 10h2" />
              <path d="M15 10h2" />
              <path d="M7 14h10" />
            </svg>
          </button>
          <div class="bbrush-shortcuts" data-role="shortcuts-panel">
            <strong>Shortcuts</strong>
            <span>Alt + D - Toggle annotate</span>
            <span>Alt + Shift + B - Toggle panel</span>
            <span>B - Pen</span>
            <span>E - Eraser</span>
            <span>A - Arrow</span>
            <span>R - Rectangle</span>
            <span>T - Text</span>
            <span>Alt/Option + Drag (Text) - Duplicate text</span>
            <span>Ctrl/Cmd + Z - Undo</span>
            <span>C - Clear screen</span>
            <span>Hold Shift + Drag (Pen) - Straight line</span>
            <span>[ / ] - Active tool size</span>
            <span>Esc - Close/cancel</span>
            <span>? - Toggle this help</span>
          </div>
        </div>
      </div>
    `;

    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = chrome.runtime.getURL('toolbar.css');
    stylesheet.addEventListener('load', () => {
      host.style.visibility = 'visible';
    });
    shadowRoot.prepend(stylesheet);

    const launcher = shadowRoot.querySelector('[data-role="launcher"]');
    const launcherTool = shadowRoot.querySelector('[data-role="launcher-tool"]');
    const quickMenu = shadowRoot.querySelector('[data-role="quick-menu"]');
    const quickOpenButton = shadowRoot.querySelector('[data-role="quick-open"]');
    const quickUndoButton = shadowRoot.querySelector('[data-role="quick-undo"]');
    const quickClearButton = shadowRoot.querySelector('[data-role="quick-clear"]');
    const panel = shadowRoot.querySelector('[data-role="panel"]');
    const dragHandle = shadowRoot.querySelector('[data-role="drag"]');
    const annotateToggleButton = shadowRoot.querySelector('[data-role="annotate-toggle"]');
    const colorInput = shadowRoot.querySelector('[data-role="color"]');
    const sizeToggle = shadowRoot.querySelector('[data-role="size-toggle"]');
    const sizeField = shadowRoot.querySelector('[data-role="size-field"]');
    const sizeLabel = shadowRoot.querySelector('[data-role="size-label"]');
    const sizeInput = shadowRoot.querySelector('[data-role="size"]');
    const drawButton = shadowRoot.querySelector('[data-role="tool-brush"]');
    const eraserButton = shadowRoot.querySelector('[data-role="tool-eraser"]');
    const rectButton = shadowRoot.querySelector('[data-role="tool-rect"]');
    const arrowButton = shadowRoot.querySelector('[data-role="tool-arrow"]');
    const textButton = shadowRoot.querySelector('[data-role="tool-text"]');
    const toolbar = shadowRoot.querySelector('.bbrush-toolbar');
    const undoButton = shadowRoot.querySelector('[data-role="undo"]');
    const clearButton = shadowRoot.querySelector('[data-role="clear"]');
    const shortcutsButton = shadowRoot.querySelector('[data-role="shortcuts-toggle"]');
    const shortcutsPanel = shadowRoot.querySelector('[data-role="shortcuts-panel"]');

    launcher.addEventListener('click', () => {
      if (state.suppressNextLauncherClick) {
        state.suppressNextLauncherClick = false;
        return;
      }

      if (state.showQuickMenu) {
        setQuickMenuVisible(false);
      }
      toggleToolbarExpanded();
    });

    launcher.addEventListener('pointerdown', (event) => {
      state.isDraggingLauncher = false;
      state.launcherDragStartX = event.clientX;
      state.launcherDragStartY = event.clientY;
      state.dragOffsetX = event.clientX - state.toolbarHost.offsetLeft;
      state.dragOffsetY = event.clientY - state.toolbarHost.offsetTop;
      state.launcherPointerId = event.pointerId;
      launcher.setPointerCapture(event.pointerId);
    });

    launcher.addEventListener('pointermove', (event) => {
      if (state.launcherPointerId !== event.pointerId) {
        return;
      }

      const moveX = Math.abs(event.clientX - state.launcherDragStartX);
      const moveY = Math.abs(event.clientY - state.launcherDragStartY);

      if (!state.isDraggingLauncher && (moveX > 3 || moveY > 3)) {
        state.isDraggingLauncher = true;
      }

      if (!state.isDraggingLauncher) {
        return;
      }

      const left = event.clientX - state.dragOffsetX;
      const top = event.clientY - state.dragOffsetY;

      state.toolbarHost.style.left = `${Math.max(0, left)}px`;
      state.toolbarHost.style.top = `${Math.max(0, top)}px`;
      state.suppressNextLauncherClick = true;
      setQuickMenuVisible(false);
    });

    launcher.addEventListener('pointerup', (event) => {
      if (state.launcherPointerId !== event.pointerId) {
        return;
      }

      if (launcher.hasPointerCapture(event.pointerId)) {
        launcher.releasePointerCapture(event.pointerId);
      }

      state.launcherPointerId = null;
      state.isDraggingLauncher = false;
    });

    launcher.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      setQuickMenuVisible(!state.showQuickMenu);
    });

    quickOpenButton.addEventListener('click', () => {
      setQuickMenuVisible(false);
      setToolbarExpanded(true);
    });

    quickUndoButton.addEventListener('click', () => {
      undoLastStroke();
      setQuickMenuVisible(false);
    });

    quickClearButton.addEventListener('click', () => {
      clearAllStrokes();
      setQuickMenuVisible(false);
    });

    colorInput.addEventListener('input', () => {
      state.brushColor = colorInput.value;
    });

    sizeInput.addEventListener('input', () => {
      if (state.activeTool === 'text') {
        state.textSize = Number(sizeInput.value);
      } else {
        state.penSize = Number(sizeInput.value);
      }
    });

    sizeToggle.addEventListener('click', () => {
      state.isSizeExpanded = !state.isSizeExpanded;
      updateToolbarState();
    });

    drawButton.addEventListener('click', () => {
      setActiveTool('brush');
    });

    eraserButton.addEventListener('click', () => {
      setActiveTool('eraser');
    });

    arrowButton.addEventListener('click', () => {
      setActiveTool('arrow');
    });

    rectButton.addEventListener('click', () => {
      setActiveTool('rect');
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

    shortcutsButton.addEventListener('click', () => {
      state.showShortcuts = !state.showShortcuts;
      updateToolbarState();
    });

    document.addEventListener(
      'pointerdown',
      (event) => {
        if (!state.showQuickMenu) {
          return;
        }

        if (!event.composedPath().includes(host)) {
          setQuickMenuVisible(false);
        }
      },
      true
    );

    document.body.appendChild(host);

    state.toolbarHost = host;
    state.toolbarShadowRoot = shadowRoot;
    state.toolbarElements = {
      launcher,
      launcherTool,
      quickMenu,
      quickUndoButton,
      quickClearButton,
      panel,
      colorInput,
      sizeToggle,
      sizeField,
      sizeLabel,
      sizeInput,
      drawButton,
      eraserButton,
      rectButton,
      arrowButton,
      textButton,
      toolbar,
      annotateToggleButton,
      undoButton,
      clearButton,
      shortcutsButton,
      shortcutsPanel
    };
  }

  function enableOverlay(startDrawingMode = false) {
    if (state.enabled) {
      setDrawingMode(startDrawingMode);
      updateToolbarState();
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

    state.isToolbarExpanded = false;
    state.showQuickMenu = false;
    state.showShortcuts = false;

    state.canvas.style.display = 'block';
    state.toolbarHost.style.display = 'block';
    state.enabled = true;
    setDrawingMode(startDrawingMode);
    updateToolbarState();
    replayStrokes();
  }

  function disableOverlay() {
    if (!state.enabled || !state.canvas) {
      return;
    }

    setDrawingMode(false);
    clearInteractionState();
    state.selectedTextId = null;
    state.selectedArrowId = null;
    state.selectedRectId = null;
    state.isDraggingLauncher = false;
    state.launcherPointerId = null;
    state.suppressNextLauncherClick = false;

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
      state.selectedArrowId = null;
      state.selectedRectId = null;

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
      enableOverlay(Boolean(message.drawingMode));
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

    if (message.type === 'BBRUSH_TOGGLE_PANEL') {
      toggleToolbarExpanded();
      sendResponse({ ok: true, expanded: state.isToolbarExpanded });
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
