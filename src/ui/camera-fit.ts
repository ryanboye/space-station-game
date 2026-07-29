export type FitBounds = { minX: number; minY: number; maxX: number; maxY: number };
export type FitSafeInsets = { left: number; right: number; top: number; bottom: number };
export type FitBlocker = {
  edge: keyof FitSafeInsets;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CameraFit = {
  zoom: number;
  worldCenterX: number;
  worldCenterY: number;
  viewportAnchorX: number;
  viewportAnchorY: number;
  safeX: number;
  safeY: number;
  safeWidth: number;
  safeHeight: number;
};

const MIN_SAFE_AXIS_PX = 96;

export function unionFitBounds(bounds: readonly FitBounds[]): FitBounds | null {
  if (bounds.length === 0) return null;
  return bounds.reduce<FitBounds>((combined, next) => ({
    minX: Math.min(combined.minX, next.minX),
    minY: Math.min(combined.minY, next.minY),
    maxX: Math.max(combined.maxX, next.maxX),
    maxY: Math.max(combined.maxY, next.maxY)
  }), { ...bounds[0] });
}

/**
 * Convert edge-mounted overlay rectangles into one visible canvas rectangle.
 * Rectangles are already relative to the canvas viewport and clipped to it.
 */
export function safeInsetsFromBlockers(
  viewportWidth: number,
  viewportHeight: number,
  blockers: readonly FitBlocker[],
  gap = 12
): FitSafeInsets {
  const insets: FitSafeInsets = { left: 0, right: 0, top: 0, bottom: 0 };
  for (const blocker of blockers) {
    if (blocker.width <= 0 || blocker.height <= 0) continue;
    if (blocker.edge === 'left') insets.left = Math.max(insets.left, blocker.x + blocker.width + gap);
    if (blocker.edge === 'right') insets.right = Math.max(insets.right, viewportWidth - blocker.x + gap);
    if (blocker.edge === 'top') insets.top = Math.max(insets.top, blocker.y + blocker.height + gap);
    if (blocker.edge === 'bottom') insets.bottom = Math.max(insets.bottom, viewportHeight - blocker.y + gap);
  }

  // A pathological responsive stack should make Fit conservative, not produce
  // a negative viewport. Trim opposing claims evenly while keeping a small,
  // usable world window.
  const trimAxis = (start: keyof FitSafeInsets, end: keyof FitSafeInsets, size: number): void => {
    const excess = insets[start] + insets[end] - Math.max(0, size - MIN_SAFE_AXIS_PX);
    if (excess <= 0) return;
    const claimed = insets[start] + insets[end];
    if (claimed <= 0) return;
    insets[start] = Math.max(0, insets[start] - excess * (insets[start] / claimed));
    insets[end] = Math.max(0, insets[end] - excess * (insets[end] / claimed));
  };
  trimAxis('left', 'right', viewportWidth);
  trimAxis('top', 'bottom', viewportHeight);
  return insets;
}

export function fitBoundsToSafeViewport(options: {
  bounds: FitBounds;
  tileSize: number;
  marginTiles: number;
  viewportWidth: number;
  viewportHeight: number;
  safeInsets: FitSafeInsets;
  minZoom: number;
  maxZoom: number;
}): CameraFit {
  const { bounds, tileSize, marginTiles, viewportWidth, viewportHeight, safeInsets } = options;
  const safeX = safeInsets.left;
  const safeY = safeInsets.top;
  const safeWidth = Math.max(1, viewportWidth - safeInsets.left - safeInsets.right);
  const safeHeight = Math.max(1, viewportHeight - safeInsets.top - safeInsets.bottom);
  const marginPx = marginTiles * tileSize;
  const worldWidth = Math.max(tileSize, (bounds.maxX - bounds.minX + 1) * tileSize);
  const worldHeight = Math.max(tileSize, (bounds.maxY - bounds.minY + 1) * tileSize);
  const rawZoom = Math.min(
    safeWidth / (worldWidth + marginPx * 2),
    safeHeight / (worldHeight + marginPx * 2)
  );
  const zoom = Math.max(options.minZoom, Math.min(options.maxZoom, rawZoom));
  return {
    zoom,
    worldCenterX: (bounds.minX + bounds.maxX + 1) * tileSize * 0.5,
    worldCenterY: (bounds.minY + bounds.maxY + 1) * tileSize * 0.5,
    viewportAnchorX: safeX + safeWidth * 0.5,
    viewportAnchorY: safeY + safeHeight * 0.5,
    safeX,
    safeY,
    safeWidth,
    safeHeight
  };
}
