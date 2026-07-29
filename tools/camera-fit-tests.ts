import {
  fitBoundsToSafeViewport,
  safeInsetsFromBlockers,
  unionFitBounds,
  type CameraFit,
  type FitBounds
} from '../src/ui/camera-fit';

let failures = 0;

function check(name: string, run: () => string): void {
  try {
    const evidence = run();
    console.log(`ok   ${name}`);
    console.log(`     ${evidence}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(`     ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function projectedEdges(fit: CameraFit, bounds: FitBounds, tileSize: number, marginTiles: number) {
  const margin = marginTiles * tileSize;
  const worldLeft = bounds.minX * tileSize - margin;
  const worldTop = bounds.minY * tileSize - margin;
  const worldRight = (bounds.maxX + 1) * tileSize + margin;
  const worldBottom = (bounds.maxY + 1) * tileSize + margin;
  return {
    left: fit.viewportAnchorX + (worldLeft - fit.worldCenterX) * fit.zoom,
    top: fit.viewportAnchorY + (worldTop - fit.worldCenterY) * fit.zoom,
    right: fit.viewportAnchorX + (worldRight - fit.worldCenterX) * fit.zoom,
    bottom: fit.viewportAnchorY + (worldBottom - fit.worldCenterY) * fit.zoom
  };
}

function assertInsideSafeArea(fit: CameraFit, bounds: FitBounds, tileSize = 32, marginTiles = 8): void {
  const edges = projectedEdges(fit, bounds, tileSize, marginTiles);
  const epsilon = 0.001;
  assert(edges.left >= fit.safeX - epsilon, `left edge ${edges.left} is under HUD at ${fit.safeX}`);
  assert(edges.top >= fit.safeY - epsilon, `top edge ${edges.top} is outside safe area ${fit.safeY}`);
  assert(edges.right <= fit.safeX + fit.safeWidth + epsilon, `right edge ${edges.right} exceeds safe area`);
  assert(edges.bottom <= fit.safeY + fit.safeHeight + epsilon, `bottom edge ${edges.bottom} is under operations dock`);
}

const STARTER = { minX: 35, minY: 38, maxX: 64, maxY: 55 };

check('1280x720 desktop fit clears left HUD, bottom operations, and right palette', () => {
  // The 340px palette is already outside this 924px game viewport. The
  // blockers below are relative to the canvas and match the fixed overlays.
  const insets = safeInsetsFromBlockers(924, 620, [
    { edge: 'left', x: 10, y: 30, width: 320, height: 188 },
    { edge: 'bottom', x: 10, y: 392, width: 914, height: 218 }
  ]);
  const fit = fitBoundsToSafeViewport({
    bounds: STARTER,
    tileSize: 32,
    marginTiles: 8,
    viewportWidth: 924,
    viewportHeight: 620,
    safeInsets: insets,
    minZoom: 0.1,
    maxZoom: 1.4
  });
  assertInsideSafeArea(fit, STARTER);
  assert(fit.viewportAnchorX > 330, 'fit still centers the hull beneath the left HUD');
  return `safe ${fit.safeWidth.toFixed(0)}x${fit.safeHeight.toFixed(0)}, anchor ${fit.viewportAnchorX.toFixed(0)},${fit.viewportAnchorY.toFixed(0)}, zoom ${fit.zoom.toFixed(3)}`;
});

check('tall default viewport uses the extra height without hiding the starter hull', () => {
  const insets = safeInsetsFromBlockers(924, 800, [
    { edge: 'left', x: 10, y: 30, width: 320, height: 260 },
    { edge: 'bottom', x: 10, y: 552, width: 914, height: 238 }
  ]);
  const fit = fitBoundsToSafeViewport({
    bounds: STARTER,
    tileSize: 32,
    marginTiles: 8,
    viewportWidth: 924,
    viewportHeight: 800,
    safeInsets: insets,
    minZoom: 0.1,
    maxZoom: 1.4
  });
  assertInsideSafeArea(fit, STARTER);
  assert(fit.safeHeight > 500, `tall viewport safe height collapsed to ${fit.safeHeight}`);
  return `starter plus margin fits ${fit.safeWidth.toFixed(0)}x${fit.safeHeight.toFixed(0)} unobscured pixels at ${fit.zoom.toFixed(3)}x`;
});

check('an off-hull Gate F facility block participates in camera bounds', () => {
  const gateFBlock = { minX: 40, minY: 61, maxX: 60, maxY: 70 };
  const combined = unionFitBounds([STARTER, gateFBlock]);
  assert(combined !== null, 'union returned no bounds');
  assert(combined.maxY === 70, `off-hull block was dropped at y=${combined.maxY}`);
  const fit = fitBoundsToSafeViewport({
    bounds: combined,
    tileSize: 32,
    marginTiles: 8,
    viewportWidth: 924,
    viewportHeight: 800,
    safeInsets: { left: 342, right: 0, top: 0, bottom: 250 },
    minZoom: 0.1,
    maxZoom: 1.4
  });
  assertInsideSafeArea(fit, combined);
  return `combined y ${combined.minY}..${combined.maxY}; off-hull facility remains inside the safe frame`;
});

check('hidden interface restores the whole viewport and zoom clamps are preserved', () => {
  const tiny = { minX: 50, minY: 50, maxX: 50, maxY: 50 };
  const fit = fitBoundsToSafeViewport({
    bounds: tiny,
    tileSize: 32,
    marginTiles: 0,
    viewportWidth: 924,
    viewportHeight: 620,
    safeInsets: { left: 0, right: 0, top: 0, bottom: 0 },
    minZoom: 0.1,
    maxZoom: 1.4
  });
  assert(fit.zoom === 1.4, `max fit zoom changed to ${fit.zoom}`);
  assert(fit.viewportAnchorX === 462 && fit.viewportAnchorY === 310, 'hidden UI did not use viewport center');

  const huge = fitBoundsToSafeViewport({
    bounds: { minX: 0, minY: 0, maxX: 999, maxY: 999 },
    tileSize: 32,
    marginTiles: 8,
    viewportWidth: 924,
    viewportHeight: 620,
    safeInsets: { left: 0, right: 0, top: 0, bottom: 0 },
    minZoom: 0.1,
    maxZoom: 1.4
  });
  assert(huge.zoom === 0.1, `minimum fit zoom changed to ${huge.zoom}`);
  return 'hide-interface anchor is viewport center; fit zoom remains clamped to 0.1..1.4';
});

if (failures > 0) {
  console.error(`camera-fit-tests: ${failures} check(s) failed`);
  process.exit(1);
}
console.log('camera-fit-tests: ok 4/4 checks');
