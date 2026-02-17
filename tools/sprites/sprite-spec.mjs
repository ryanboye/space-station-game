import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), '..', '..');
const TOOLS_DIR = path.resolve(ROOT, 'tools', 'sprites');

export const DEFAULT_SPRITE_SPEC_PATH = path.resolve(TOOLS_DIR, 'sprite-spec.yaml');

function normalizeRotation(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;
  const normalized = ((Math.round(value / 90) * 90) % 360 + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) return normalized;
  return 0;
}

export function parseKeysArg(raw) {
  if (typeof raw !== 'string' || raw.trim().length <= 0) return [];
  const out = [];
  for (const token of raw.split(',')) {
    const key = token.trim();
    if (!key) continue;
    out.push(key);
  }
  return [...new Set(out)];
}

export async function loadSpriteSpec(specPath = DEFAULT_SPRITE_SPEC_PATH) {
  const text = await fs.readFile(specPath, 'utf8');
  const parsed = YAML.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid sprite spec YAML: ${specPath}`);
  }

  const rawSprites = parsed.sprites;
  if (!rawSprites || typeof rawSprites !== 'object' || Array.isArray(rawSprites)) {
    throw new Error(`Sprite spec missing 'sprites' map: ${specPath}`);
  }

  const sprites = {};
  for (const [key, raw] of Object.entries(rawSprites)) {
    if (typeof key !== 'string' || key.trim().length <= 0) continue;
    if (typeof raw === 'string') {
      sprites[key] = { prompt: raw, rotation: 0 };
      continue;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : '';
    const rotation = normalizeRotation(raw.rotation);
    sprites[key] = {
      prompt,
      rotation
    };
  }

  return { sprites };
}

export function getSpritePrompt(spec, key) {
  const entry = spec?.sprites?.[key];
  if (!entry || typeof entry !== 'object') return '';
  return typeof entry.prompt === 'string' ? entry.prompt.trim() : '';
}

export function getSpriteRotation(spec, key) {
  const entry = spec?.sprites?.[key];
  if (!entry || typeof entry !== 'object') return 0;
  return normalizeRotation(entry.rotation);
}
