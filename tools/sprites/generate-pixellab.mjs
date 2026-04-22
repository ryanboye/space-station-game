#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { PixelLabClient, AuthenticationError } from '@pixellab-code/pixellab';
import { DEFAULT_SPRITE_SPEC_PATH, getSpritePrompt, loadSpriteSpec, parseKeysArg } from './sprite-spec.mjs';

const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), '..', '..');
const TOOLS_DIR = path.resolve(ROOT, 'tools', 'sprites');
const RAW_DIR = path.resolve(TOOLS_DIR, 'out', 'raw-pixellab');

const PROFILE_TO_REQUIRED = {
  test: path.resolve(TOOLS_DIR, 'required-keys-test.json'),
  v1: path.resolve(TOOLS_DIR, 'required-keys-v1.json'),
  'floors-walls': path.resolve(TOOLS_DIR, 'required-keys-floors-walls.json'),
  agents: path.resolve(TOOLS_DIR, 'required-keys-agents.json'),
  'tiles-full': path.resolve(TOOLS_DIR, 'required-keys-tiles-full.json')
};

// Per-class pixflux param overrides. Pixellab pixflux maxes at 400x400;
// 256 is the recommended upper band for pixel-art fidelity. Tiles stay
// full-bleed (no_background=false) so they tile; sprites/icons/agents
// ride transparent so they composite over tile layers. `view` enum is
// honored by pixflux more reliably than prompt prose for top-down framing.
const CLASS_PARAMS = {
  tile: {
    width: 256,
    height: 256,
    no_background: false,
    outline: 'lineless',
    shading: 'basic shading',
    detail: 'medium detail',
    view: 'high top-down'
  },
  icon: {
    width: 256,
    height: 256,
    no_background: true,
    outline: 'selective outline',
    shading: 'medium shading',
    detail: 'highly detailed',
    view: 'side'
  },
  module: {
    width: 256,
    height: 256,
    no_background: true,
    outline: 'selective outline',
    shading: 'medium shading',
    detail: 'highly detailed',
    view: 'high top-down'
  },
  agent: {
    width: 128,
    height: 128,
    no_background: true,
    outline: 'single color black outline',
    shading: 'medium shading',
    detail: 'highly detailed',
    view: 'side'
  },
  overlay: {
    width: 256,
    height: 256,
    no_background: true,
    outline: 'lineless',
    shading: 'flat shading',
    detail: 'low detail',
    view: 'high top-down'
  },
  room: {
    width: 256,
    height: 256,
    no_background: false,
    outline: 'lineless',
    shading: 'basic shading',
    detail: 'medium detail',
    view: 'high top-down'
  }
};

const FALLBACK_PARAMS = CLASS_PARAMS.tile;

// Pixflux skews toward compositional scenes (interior renders w/ bed +
// nightstand + lamp instead of "a bed sprite") and adds decorative
// borders to tiles. Per-class prefix/suffix wraps the spec's prompt
// with directives that fight that tendency.
const CLASS_PROMPT_WRAPPERS = {
  tile: {
    prefix: 'Seamless repeating tileable pattern only, no border, no frame, no decoration around the edges, the texture continues past every edge. ',
    suffix: ' Pure texture, single material, no objects on top.'
  },
  icon: {
    prefix: 'A single small icon, isolated object centered in frame, transparent background, no scene context. ',
    suffix: ' UI icon style, readable at small size.'
  },
  module: {
    prefix: 'A single furniture/equipment item, top-down or 3/4 view, isolated object on transparent background, no room context, no walls, no floor. ',
    suffix: ' Single placeable object only.'
  },
  agent: {
    prefix: 'A single character sprite facing south (toward camera), full body visible, transparent background, no scene context. ',
    suffix: ' Game sprite for a top-down RPG.'
  },
  overlay: {
    prefix: 'A subtle overlay decal, transparent background except the decal itself, no border. ',
    suffix: ' Used as a layer over base tiles.'
  },
  room: {
    prefix: 'Seamless tileable floor pattern, no border, no frame, no objects. ',
    suffix: ' Floor texture only.'
  }
};

function classifyKey(key) {
  const prefix = key.split('.')[0];
  return CLASS_PARAMS[prefix] ? prefix : null;
}

function paramsForKey(key) {
  const klass = classifyKey(key);
  return klass ? CLASS_PARAMS[klass] : FALLBACK_PARAMS;
}

function wrapPromptForKey(key, basePrompt) {
  const klass = classifyKey(key);
  const wrap = klass ? CLASS_PROMPT_WRAPPERS[klass] : null;
  if (!wrap) return basePrompt;
  return `${wrap.prefix}${basePrompt}${wrap.suffix}`;
}

function keyToFileName(key) {
  return `${key.replace(/[^a-zA-Z0-9]+/g, '_')}.png`;
}

function parseArgs(argv) {
  const args = { profile: 'test', overwrite: false, spec: '', keys: '', concurrency: 1 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--profile' && argv[i + 1]) {
      args.profile = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--overwrite') args.overwrite = true;
    if (arg === '--spec' && argv[i + 1]) {
      args.spec = argv[i + 1];
      i += 1;
    }
    if (arg === '--keys' && argv[i + 1]) {
      args.keys = argv[i + 1];
      i += 1;
    }
    if (arg === '--concurrency' && argv[i + 1]) {
      args.concurrency = Number(argv[i + 1]) || 1;
      i += 1;
    }
  }
  return args;
}

async function readJson(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return JSON.parse(text);
}

const CLASS_NEGATIVE = {
  tile: 'border, frame, decorative edges, trim, watermark, logo, text, signature',
  icon: 'background, scene, environment, multiple objects, watermark, logo',
  module: 'room, walls, floor, scene, environment, multiple items, perspective render, watermark, logo',
  agent: 'background, scenery, multiple characters, watermark, logo, text',
  overlay: 'opaque background, frame, border, watermark, logo',
  room: 'border, frame, objects, furniture, walls, watermark, logo'
};

async function generateOne(client, key, prompt, outputPath) {
  const params = paramsForKey(key);
  const wrappedPrompt = wrapPromptForKey(key, prompt);
  const klass = classifyKey(key);
  const negative = klass ? CLASS_NEGATIVE[klass] : '';
  const response = await client.generateImagePixflux({
    description: wrappedPrompt,
    negativeDescription: negative,
    imageSize: { width: params.width, height: params.height },
    noBackground: params.no_background,
    outline: params.outline,
    shading: params.shading,
    detail: params.detail,
    view: params.view
  });
  const img = response?.image;
  if (!img || typeof img.saveToFile !== 'function') {
    throw new Error(`pixflux returned no image for key=${key}`);
  }
  await img.saveToFile(outputPath);
}

async function runPool(items, concurrency, worker) {
  const queue = items.slice();
  const state = { aborted: false };
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length > 0 && !state.aborted) {
      const item = queue.shift();
      if (item === undefined) break;
      try {
        await worker(item);
      } catch (err) {
        // Auth failures at one key will repeat at every key — abort the
        // pool instead of grinding through the whole profile.
        if (err instanceof AuthenticationError) state.aborted = true;
        throw err;
      }
    }
  });
  await Promise.all(workers);
  if (state.aborted) throw new AuthenticationError('Pixellab authentication failed — aborted remaining keys.');
}

async function main() {
  dotenv.config({ path: path.resolve(ROOT, '.env.local') });
  dotenv.config({ path: path.resolve(ROOT, '.env') });

  const args = parseArgs(process.argv.slice(2));
  if (!Object.hasOwn(PROFILE_TO_REQUIRED, args.profile)) {
    throw new Error(`Unsupported profile: ${args.profile}. Use one of: ${Object.keys(PROFILE_TO_REQUIRED).join(', ')}`);
  }

  const apiKey = process.env.PIXELLAB_API_KEY;
  if (!apiKey) throw new Error('PIXELLAB_API_KEY missing. Set it in .env.local or the env.');

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

  const specPathRaw = args.spec || process.env.SPRITE_SPEC_PATH || DEFAULT_SPRITE_SPEC_PATH;
  const specPath = path.isAbsolute(specPathRaw) ? specPathRaw : path.resolve(ROOT, specPathRaw);
  const spriteSpec = await loadSpriteSpec(specPath);

  const client = new PixelLabClient(apiKey);

  const pending = [];
  for (const key of activeKeys) {
    const outputPath = path.resolve(RAW_DIR, keyToFileName(key));
    if (!args.overwrite) {
      try {
        await fs.access(outputPath);
        continue;
      } catch {
        /* continue */
      }
    }
    const prompt = getSpritePrompt(spriteSpec, key) || `Top-down pixel art sprite for key ${key}, readable at small size, no text.`;
    pending.push({ key, prompt, outputPath });
  }

  if (pending.length === 0) {
    console.log(`pixellab: nothing to generate. profile=${args.profile}, activeKeys=${activeKeys.length}`);
    return;
  }

  let ok = 0;
  let failed = 0;
  const errors = [];

  await runPool(pending, args.concurrency, async ({ key, prompt, outputPath }) => {
    try {
      await generateOne(client, key, prompt, outputPath);
      ok += 1;
      process.stdout.write(`✓ ${key}\n`);
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ key, msg });
      process.stdout.write(`✗ ${key}: ${msg}\n`);
    }
  });

  console.log(`pixellab: profile=${args.profile}, ok=${ok}, failed=${failed}, rawDir=${RAW_DIR}`);
  if (failed > 0) {
    console.log('failures:');
    for (const { key, msg } of errors) console.log(`  - ${key}: ${msg}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
