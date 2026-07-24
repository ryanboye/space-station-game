export type EnvironmentPieceKey =
  | 'gas-giant'
  | 'ice-moon'
  | 'rocky-moon'
  | 'ice-debris'
  | 'metal-debris'
  | 'traffic-ships';

const PIECE_PATHS: Record<EnvironmentPieceKey, string> = {
  'gas-giant': 'assets/environment-pieces/gas-giant.png?v=1',
  'ice-moon': 'assets/environment-pieces/ice-moon.png?v=1',
  'rocky-moon': 'assets/environment-pieces/rocky-moon.png?v=1',
  'ice-debris': 'assets/environment-pieces/ice-debris-sheet.png?v=1',
  'metal-debris': 'assets/environment-pieces/metal-debris-sheet.png?v=1',
  'traffic-ships': 'assets/environment-pieces/traffic-ships-sheet.png?v=1'
};

const imageCache = new Map<EnvironmentPieceKey, HTMLImageElement>();
const loading = new Set<EnvironmentPieceKey>();

export function getEnvironmentPiece(key: EnvironmentPieceKey): HTMLImageElement | null {
  const cached = imageCache.get(key);
  if (cached?.complete && cached.naturalWidth > 0) return cached;
  if (loading.has(key)) return null;

  loading.add(key);
  const image = new Image();
  image.onload = () => {
    imageCache.set(key, image);
    loading.delete(key);
  };
  image.onerror = () => loading.delete(key);
  image.src = new URL(PIECE_PATHS[key], document.baseURI).toString();
  return null;
}

export function drawEnvironmentAtlasCell(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  columns: number,
  rows: number,
  index: number,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation = 0,
  alpha = 1
): boolean {
  if (!image || !image.complete || image.naturalWidth <= 0 || columns <= 0 || rows <= 0) return false;
  const cellWidth = image.naturalWidth / columns;
  const cellHeight = image.naturalHeight / rows;
  const cell = ((Math.floor(index) % (columns * rows)) + columns * rows) % (columns * rows);
  const sourceX = (cell % columns) * cellWidth;
  const sourceY = Math.floor(cell / columns) * cellHeight;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.drawImage(image, sourceX, sourceY, cellWidth, cellHeight, -width * 0.5, -height * 0.5, width, height);
  ctx.restore();
  return true;
}
