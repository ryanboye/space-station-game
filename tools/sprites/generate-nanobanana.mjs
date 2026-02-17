#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import sharp from 'sharp';
import { GoogleGenAI, Modality } from '@google/genai';
import { DEFAULT_SPRITE_SPEC_PATH, getSpritePrompt, loadSpriteSpec, parseKeysArg } from './sprite-spec.mjs';

const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), '..', '..');
const TOOLS_DIR = path.resolve(ROOT, 'tools', 'sprites');
const RAW_DIR = path.resolve(TOOLS_DIR, 'out', 'raw');

const PROFILE_TO_REQUIRED = {
  test: path.resolve(TOOLS_DIR, 'required-keys-test.json'),
  v1: path.resolve(TOOLS_DIR, 'required-keys-v1.json'),
  'floors-walls': path.resolve(TOOLS_DIR, 'required-keys-floors-walls.json'),
  agents: path.resolve(TOOLS_DIR, 'required-keys-agents.json'),
  'tiles-full': path.resolve(TOOLS_DIR, 'required-keys-tiles-full.json')
};

const DEFAULT_STYLE_GUIDE = [
  'RimWorld-inspired visual direction (not a direct copy):',
  '- top-down colony sim readability first',
  '- clean silhouettes and low clutter',
  '- muted industrial sci-fi palette with selective accent colors',
  '- subtle texture and shading, avoid painterly detail',
  '- transparent background for non-tile sprites',
  '- no text, no UI labels, no watermarks'
].join('\\n');

function parseArgs(argv) {
  const args = { profile: 'test', mock: false, overwrite: false, style: '', styleRef: '', spec: '', keys: '' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--profile' && argv[i + 1]) {
      args.profile = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--mock') args.mock = true;
    if (arg === '--overwrite') args.overwrite = true;
    if (arg === '--style' && argv[i + 1]) {
      args.style = argv[i + 1];
      i += 1;
    }
    if (arg === '--style-ref' && argv[i + 1]) {
      args.styleRef = argv[i + 1];
      i += 1;
    }
    if (arg === '--spec' && argv[i + 1]) {
      args.spec = argv[i + 1];
      i += 1;
    }
    if (arg === '--keys' && argv[i + 1]) {
      args.keys = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function keyToFileName(key) {
  return `${key.replace(/[^a-zA-Z0-9]+/g, '_')}.png`;
}

function hashColor(seed) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const r = ((hash >>> 16) & 0xff) | 0x40;
  const g = ((hash >>> 8) & 0xff) | 0x40;
  const b = (hash & 0xff) | 0x40;
  return `rgb(${r % 256}, ${g % 256}, ${b % 256})`;
}

async function mockSpriteBuffer(key, size = 128) {
  if (key === 'module.none') {
    return sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .png()
      .toBuffer();
  }
  const color = hashColor(key);
  const label = key.length > 24 ? `${key.slice(0, 24)}...` : key;
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${size}" height="${size}" fill="${color}" />
    <rect x="2" y="2" width="${size - 4}" height="${size - 4}" fill="none" stroke="rgba(0,0,0,0.45)" stroke-width="2" />
    <text x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="10" fill="white">${label}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function extractImageData(response) {
  const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      const inline = part?.inlineData ?? part?.inline_data;
      const data = inline?.data;
      if (typeof data === 'string' && data.length > 0) return data;
    }
  }
  return null;
}

async function readJson(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return JSON.parse(text);
}

function mimeTypeForPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

async function main() {
  dotenv.config({ path: path.resolve(ROOT, '.env.local') });
  dotenv.config({ path: path.resolve(ROOT, '.env') });

  const args = parseArgs(process.argv.slice(2));
  if (!Object.hasOwn(PROFILE_TO_REQUIRED, args.profile)) {
    throw new Error(`Unsupported profile: ${args.profile}. Use one of: ${Object.keys(PROFILE_TO_REQUIRED).join(', ')}`);
  }

  const requiredPath = PROFILE_TO_REQUIRED[args.profile];
  const requiredKeys = await readJson(requiredPath);

  if (!Array.isArray(requiredKeys) || requiredKeys.some((k) => typeof k !== 'string')) {
    throw new Error(`Invalid required keys file: ${requiredPath}`);
  }
  const requestedKeys = parseKeysArg(args.keys);
  const requestedKeySet = new Set(requestedKeys);
  const activeKeys =
    requestedKeys.length > 0 ? requiredKeys.filter((key) => requestedKeySet.has(key)) : [...requiredKeys];
  if (activeKeys.length <= 0) {
    throw new Error(
      requestedKeys.length > 0
        ? `None of the requested keys are in profile=${args.profile}. requested=${requestedKeys.join(', ')}`
        : `No keys available for profile=${args.profile}`
    );
  }

  await fs.mkdir(RAW_DIR, { recursive: true });

  const mock = args.mock || process.env.SPRITE_GENERATION_MOCK === '1';
  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
  const styleGuide = args.style || process.env.SPRITE_STYLE_GUIDE || DEFAULT_STYLE_GUIDE;
  const specPathRaw = args.spec || process.env.SPRITE_SPEC_PATH || DEFAULT_SPRITE_SPEC_PATH;
  const specPath = path.isAbsolute(specPathRaw) ? specPathRaw : path.resolve(ROOT, specPathRaw);
  const spriteSpec = await loadSpriteSpec(specPath);
  const styleReferencePath = args.styleRef || process.env.SPRITE_STYLE_REFERENCE_PATH || '';
  const aspectRatio = process.env.SPRITE_IMAGE_ASPECT_RATIO || '1:1';
  let styleReferencePart = null;

  if (styleReferencePath) {
    const absoluteStyleReferencePath = path.isAbsolute(styleReferencePath)
      ? styleReferencePath
      : path.resolve(ROOT, styleReferencePath);
    const styleReferenceBuffer = await fs.readFile(absoluteStyleReferencePath);
    styleReferencePart = {
      inlineData: {
        mimeType: mimeTypeForPath(absoluteStyleReferencePath),
        data: styleReferenceBuffer.toString('base64')
      }
    };
  }

  let ai = null;
  if (!mock) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is missing. Put it in .env.local or pass --mock for placeholder sprites.');
    }
    ai = new GoogleGenAI({ apiKey });
  }

  let generated = 0;
  for (const key of activeKeys) {
    const outputPath = path.resolve(RAW_DIR, keyToFileName(key));
    if (!args.overwrite) {
      try {
        await fs.access(outputPath);
        continue;
      } catch {
        // continue generation
      }
    }

    if (mock) {
      const buffer = await mockSpriteBuffer(key, 128);
      await fs.writeFile(outputPath, buffer);
      generated += 1;
      continue;
    }

    const prompt = getSpritePrompt(spriteSpec, key) || `Top-down pixel art sprite for key ${key}, transparent background, readable at small size, no text.`;
    const styledPrompt = `${styleGuide}\\n\\nAsset key: ${key}\\n${prompt}`;
    const contents = styleReferencePart
      ? [
          {
            role: 'user',
            parts: [
              { text: `${styledPrompt}\\n\\nUse the image as style reference only; preserve current key semantics.` },
              styleReferencePart
            ]
          }
        ]
      : styledPrompt;

    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
        imageConfig: {
          aspectRatio
        }
      }
    });

    const base64Data = extractImageData(response);
    if (!base64Data) {
      throw new Error(`No image returned for key ${key}`);
    }

    const imageBuffer = Buffer.from(base64Data, 'base64');
    await fs.writeFile(outputPath, imageBuffer);
    generated += 1;
  }

  console.log(`Sprite generation complete. profile=${args.profile}, generated=${generated}, rawDir=${RAW_DIR}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
