#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import { GoogleGenAI, Modality } from '@google/genai';

function parseArgs(argv) {
  const args = {
    promptPath: '',
    prompt: '',
    reference: '',
    clean: '',
    out: ''
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--prompt' && argv[i + 1]) {
      args.prompt = argv[i + 1];
      i += 1;
    } else if (arg === '--prompt-file' && argv[i + 1]) {
      args.promptPath = argv[i + 1];
      i += 1;
    } else if (arg === '--reference' && argv[i + 1]) {
      args.reference = argv[i + 1];
      i += 1;
    } else if (arg === '--clean' && argv[i + 1]) {
      args.clean = argv[i + 1];
      i += 1;
    } else if (arg === '--out' && argv[i + 1]) {
      args.out = argv[i + 1];
      i += 1;
    }
  }
  if (!args.reference || !args.clean) {
    throw new Error('Usage: node tools/sprites/stylize-save-scene.mjs --reference browser-like.png --clean clean.png [--prompt-file prompt.txt | --prompt \"...\"] [--out output.png]');
  }
  return args;
}

function mimeTypeForPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
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

async function readPrompt(args) {
  if (args.promptPath) {
    return fs.readFile(path.resolve(args.promptPath), 'utf8');
  }
  if (args.prompt) return args.prompt;
  return [
    'Turn this image into a top-down 2d style space station, in the style of rimworld meets The Expanse.',
    'Included are 2 reference images of the exact same size. One is labeled with boxes of what each room is, and the other is a cleaner image that shows clean tiles you can draw over.',
    'Render a clean new image in the exact same dimensions, with everything in the exact same place, but draw over it in your style as noted above.',
    '',
    'Tiles labeled D are bedrooms, and the boxes with B are beds.',
    'Tiles labeled H are bathrooms, with I being sinks and H being shower heads.',
    'Tiles labeled W are workshops, and boxes labeled W are work benches.',
    'Tiles labeled U are lounges, with C being couches and J being a gaming console area.',
    'Tiles labeled C are cafeterias, with T being four-person tables and S being serving stations.',
    'Tiles labeled I are kitchens, with V being stoves.',
    'Tiles labeled F are hydroponics, with G being a grow light plant growing area.',
    'Tiles labeled K are an open market, with the dollar sign being market stalls.',
    'The blue tiles on the edges of the map are docking areas and should look like air lock openings where ships can dock to the station.',
    'Tiles labeled N are storage areas, with P being storage racks.',
    'Tiles labeled R are reactors.',
    '',
    'The final image should be restyled, and should contain NO letters whatsoever.',
    'These images are purely for reference.',
    'The final image should look like a clean image from a brand new space game.',
    'Preserve the station footprint, room boundaries, tile grid, docking positions, and module placement exactly.'
  ].join('\n');
}

async function toInlinePart(filePath) {
  const absolute = path.resolve(filePath);
  const buffer = await fs.readFile(absolute);
  return {
    inlineData: {
      mimeType: mimeTypeForPath(absolute),
      data: buffer.toString('base64')
    }
  };
}

async function main() {
  dotenv.config({ path: path.resolve('.env.local') });
  dotenv.config({ path: path.resolve('.env') });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing in .env.local or .env');

  const args = parseArgs(process.argv.slice(2));
  const prompt = await readPrompt(args);
  const referencePath = path.resolve(args.reference);
  const cleanPath = path.resolve(args.clean);
  const outPath = path.resolve(
    args.out || path.join(path.dirname(referencePath), `nanobanana-${new Date().toISOString().replace(/[:.]/g, '-')}.png`)
  );

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image',
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          await toInlinePart(referencePath),
          await toInlinePart(cleanPath)
        ]
      }
    ],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
      imageConfig: {
        aspectRatio: '1:1'
      }
    }
  });

  const imageData = extractImageData(response);
  if (!imageData) {
    throw new Error('Model returned no image data');
  }
  await fs.writeFile(outPath, Buffer.from(imageData, 'base64'));
  console.log(`Stylized scene written to ${outPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
