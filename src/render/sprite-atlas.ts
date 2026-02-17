export type SpriteFrame = { x: number; y: number; w: number; h: number };

export type SpriteAtlasManifest = {
  version: string;
  cellSize: number;
  imagePath: string;
  frames: Record<string, SpriteFrame>;
  rotations?: Record<string, number>;
};

export type SpriteAtlas = {
  ready: boolean;
  version: string;
  image: HTMLImageElement | null;
  getFrame: (key: string) => SpriteFrame | null;
  getRotation: (key: string) => number;
};

function emptyAtlas(version = 'missing'): SpriteAtlas {
  return {
    ready: false,
    version,
    image: null,
    getFrame: () => null,
    getRotation: () => 0
  };
}

function parseFrame(raw: unknown): SpriteFrame | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const frame = raw as Record<string, unknown>;
  const x = Number(frame.x);
  const y = Number(frame.y);
  const w = Number(frame.w);
  const h = Number(frame.h);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  if (x < 0 || y < 0 || w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

function parseManifest(raw: unknown): SpriteAtlasManifest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const version = typeof record.version === 'string' && record.version.trim().length > 0 ? record.version : 'v0';
  const cellSize = Number(record.cellSize);
  const imagePath = typeof record.imagePath === 'string' ? record.imagePath : '';
  if (!Number.isFinite(cellSize) || cellSize <= 0 || imagePath.trim().length <= 0) return null;
  if (!record.frames || typeof record.frames !== 'object' || Array.isArray(record.frames)) return null;
  const rawFrames = record.frames as Record<string, unknown>;
  const frames: Record<string, SpriteFrame> = {};
  for (const [key, value] of Object.entries(rawFrames)) {
    const parsed = parseFrame(value);
    if (parsed) frames[key] = parsed;
  }
  const rotations: Record<string, number> = {};
  const rawRotations = record.rotations;
  if (rawRotations && typeof rawRotations === 'object' && !Array.isArray(rawRotations)) {
    for (const [key, value] of Object.entries(rawRotations)) {
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      const normalized = ((Math.round(n / 90) * 90) % 360 + 360) % 360;
      if (normalized === 0 || normalized === 90 || normalized === 180 || normalized === 270) {
        rotations[key] = normalized;
      }
    }
  }
  return {
    version,
    cellSize,
    imagePath,
    frames,
    rotations
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

export function createEmptySpriteAtlas(version = 'missing'): SpriteAtlas {
  return emptyAtlas(version);
}

export async function loadSpriteAtlas(): Promise<SpriteAtlas> {
  const manifestUrl = new URL('assets/sprites/atlas.json', document.baseURI).toString();
  try {
    const response = await fetch(manifestUrl, { cache: 'no-cache' });
    if (!response.ok) return emptyAtlas('missing');
    const manifestRaw = (await response.json()) as unknown;
    const manifest = parseManifest(manifestRaw);
    if (!manifest) return emptyAtlas('invalid_manifest');
    const imageUrl = new URL(manifest.imagePath, manifestUrl).toString();
    const image = await loadImage(imageUrl);
    return {
      ready: true,
      version: manifest.version,
      image,
      getFrame: (key: string): SpriteFrame | null => manifest.frames[key] ?? null,
      getRotation: (key: string): number => manifest.rotations?.[key] ?? 0
    };
  } catch {
    return emptyAtlas('missing');
  }
}
