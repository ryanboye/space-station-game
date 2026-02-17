#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import sharp from 'sharp';
import { GoogleGenAI, Modality } from '@google/genai';

const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), '..', '..');
const TOOLS_DIR = path.resolve(ROOT, 'tools', 'sprites');
const RAW_DIR = path.resolve(TOOLS_DIR, 'out', 'raw');

const AGENT_TYPES = ['visitor', 'resident', 'crew'];

const TYPE_DETAILS = {
  visitor: 'casual civilian clothes in varied colors, each character with a distinct outfit color',
  resident: 'uniform jumpsuits in muted tones, slight color variation between characters',
  crew: 'utility uniforms with tool belts, each character with slightly different equipment silhouette'
};

function parseArgs(argv) {
  const args = { type: '', count: 6, mock: false, overwrite: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--type' && argv[i + 1]) {
      args.type = argv[i + 1];
      i += 1;
    }
    if (arg === '--count' && argv[i + 1]) {
      args.count = Number(argv[i + 1]);
      i += 1;
    }
    if (arg === '--mock') args.mock = true;
    if (arg === '--overwrite') args.overwrite = true;
  }
  return args;
}

function buildPrompt(agentType, count) {
  const cols = 3;
  const rows = Math.ceil(count / cols);
  const details = TYPE_DETAILS[agentType] || '';
  return [
    `Pixel art sprite sheet: ${count} distinct ${agentType} characters in a strict ${cols}-column, ${rows}-row grid.`,
    '',
    'CRITICAL VIEW REQUIREMENT: Directly overhead birds-eye view looking straight down.',
    'Each character is a small bean/pawn shape like RimWorld or Prison Architect pawns:',
    '- A round head circle on top of a small oval torso.',
    '- NO legs visible, NO feet, NO arms extending out, NO front-facing or side view.',
    '- The body is a simple stubby colored blob/bean seen from directly above.',
    '- Think of looking down at someone from a ceiling camera.',
    '',
    'Space station setting. Muted industrial sci-fi palette.',
    details,
    '',
    'Each character must be clearly different (hair color, outfit color, head shape).',
    'Transparent background, each character centered in their grid cell.',
    'No text, no UI, no labels, no watermarks.',
    'Equal-sized grid cells, exactly 3 columns and 2 rows, clear separation between characters.'
  ].join('\n');
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

async function mockSheetBuffer(agentType, count) {
  const cols = 3;
  const rows = Math.ceil(count / cols);
  const cellSize = 128;
  const width = cols * cellSize;
  const height = rows * cellSize;

  const svgCells = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cellSize;
    const y = row * cellSize;
    const key = `agent.${agentType}.${i + 1}`;
    const color = hashColor(key);
    svgCells.push(`<rect x="${x + 4}" y="${y + 4}" width="${cellSize - 8}" height="${cellSize - 8}" fill="${color}" rx="8" />`);
    svgCells.push(`<text x="${x + cellSize / 2}" y="${y + cellSize / 2}" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="10" fill="white">${key}</text>`);
  }

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="transparent" />
    ${svgCells.join('\n    ')}
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function sliceSheet(sheetBuffer, agentType, count) {
  const cols = 3;
  const rows = Math.ceil(count / cols);
  const meta = await sharp(sheetBuffer).metadata();
  const sheetWidth = meta.width;
  const sheetHeight = meta.height;
  const cellWidth = Math.floor(sheetWidth / cols);
  const cellHeight = Math.floor(sheetHeight / rows);

  const results = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const left = col * cellWidth;
    const top = row * cellHeight;

    const cellBuffer = await sharp(sheetBuffer)
      .extract({ left, top, width: cellWidth, height: cellHeight })
      .png()
      .toBuffer();

    const fileName = `agent_${agentType}_${i + 1}.png`;
    results.push({ fileName, buffer: cellBuffer, index: i + 1 });
  }

  return results;
}

async function main() {
  dotenv.config({ path: path.resolve(ROOT, '.env.local') });
  dotenv.config({ path: path.resolve(ROOT, '.env') });

  const args = parseArgs(process.argv.slice(2));

  if (!args.type || !AGENT_TYPES.includes(args.type)) {
    throw new Error(`--type must be one of: ${AGENT_TYPES.join(', ')}`);
  }

  if (!Number.isFinite(args.count) || args.count < 1 || args.count > 12) {
    throw new Error('--count must be between 1 and 12');
  }

  const mock = args.mock || process.env.SPRITE_GENERATION_MOCK === '1';
  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

  await fs.mkdir(RAW_DIR, { recursive: true });

  // Check if all outputs already exist
  if (!args.overwrite) {
    let allExist = true;
    for (let i = 1; i <= args.count; i++) {
      const outPath = path.resolve(RAW_DIR, `agent_${args.type}_${i}.png`);
      try {
        await fs.access(outPath);
      } catch {
        allExist = false;
        break;
      }
    }
    if (allExist) {
      console.log(`All ${args.count} ${args.type} agent sprites already exist. Use --overwrite to regenerate.`);
      return;
    }
  }

  let sheetBuffer;

  if (mock) {
    console.log(`Generating mock ${args.type} sheet (${args.count} characters)...`);
    sheetBuffer = await mockSheetBuffer(args.type, args.count);
  } else {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is missing. Put it in .env.local or pass --mock for placeholder sprites.');
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = buildPrompt(args.type, args.count);

    console.log(`Calling Gemini for ${args.type} sprite sheet (${args.count} characters)...`);
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
        imageConfig: {
          aspectRatio: '3:2'
        }
      }
    });

    const base64Data = extractImageData(response);
    if (!base64Data) {
      throw new Error(`No image returned from Gemini for ${args.type} sheet`);
    }

    sheetBuffer = Buffer.from(base64Data, 'base64');
  }

  // Save the full sheet for reference
  const sheetPath = path.resolve(RAW_DIR, `agent_${args.type}_sheet.png`);
  await fs.writeFile(sheetPath, sheetBuffer);
  console.log(`Saved sheet: ${sheetPath}`);

  // Slice into individual cells
  const cells = await sliceSheet(sheetBuffer, args.type, args.count);

  for (const cell of cells) {
    const outPath = path.resolve(RAW_DIR, cell.fileName);
    await fs.writeFile(outPath, cell.buffer);
    console.log(`  Saved: ${cell.fileName}`);
  }

  console.log(`\nAgent sheet generation complete: type=${args.type}, count=${args.count}, dir=${RAW_DIR}`);
  console.log(`\nNext steps:`);
  console.log(`  node tools/sprites/postprocess-raw.mjs --profile v1 --overwrite`);
  console.log(`  node tools/sprites/pack-atlas.mjs --profile v1 --activate`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
