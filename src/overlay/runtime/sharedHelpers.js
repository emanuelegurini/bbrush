export function cloneStrokes(strokes) {
  return JSON.parse(JSON.stringify(strokes));
}

export function getCanvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

export function getSmoothedPoint(rawPoint, points) {
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

export function distancePointToSegment(point, segmentStart, segmentEnd) {
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

export function getAnchorPoints(bounds) {
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

export function getAnchorCursor(anchor) {
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

export function measureTextBounds(context, text, fontSize) {
  if (!context) {
    return { width: 0, height: fontSize };
  }

  context.font = `${fontSize}px Arial, sans-serif`;
  const metrics = context.measureText(text);
  const width = Math.max(1, metrics.width);
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.8;
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.2;

  return {
    width,
    height: Math.max(fontSize, ascent + descent)
  };
}

export function isSpaceShortcut(event) {
  return event.code === 'Space' || event.key === ' ';
}

export function isEditableTarget(target) {
  if (!target || !(target instanceof Element)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}

export function didPageContextChange(previousHref, nextHref) {
  if (!previousHref || !nextHref) {
    return false;
  }

  try {
    const previousUrl = new URL(previousHref);
    const nextUrl = new URL(nextHref);
    return (
      previousUrl.origin !== nextUrl.origin ||
      previousUrl.pathname !== nextUrl.pathname ||
      previousUrl.search !== nextUrl.search
    );
  } catch {
    return previousHref !== nextHref;
  }
}
