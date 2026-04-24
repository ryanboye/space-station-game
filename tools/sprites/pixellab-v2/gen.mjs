#!/usr/bin/env node
// Pixellab v2 asset generation driver for space-station-game.
//
// Reads MANIFEST below (hardcoded for v1), fires v2 API calls in parallel,
// polls background jobs to completion, writes images + variants.json per
// asset. BMO's tile-editor extension consumes `_status.json` at the root.
//
// Usage: PIXELLAB_API_KEY=... node tools/sprites/pixellab-v2/gen.mjs
//
// Endpoints:
//   character (4-dir) → last_response.images[dir].base64 (rgba_bytes)
//   object    (4-dir) → last_response.storage_urls[dir] (signed URL)
// Both async: 202 with { id } on POST, poll GET /background-jobs/{id}
// until status==='completed'.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS), '..', '..', '..');
const OUT = path.join(ROOT, 'tools/sprites/pixellab-v2');
const API = 'https://api.pixellab.ai/v2';
const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) { console.error('missing PIXELLAB_API_KEY'); process.exit(2); }

const headers = { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' };

// Default style knobs (shared across variants for consistency).
// image_size must be an object {width, height}, not a scalar.
const BASE = { image_size: { width: 64, height: 64 }, outline: 'single color black outline', shading: 'basic shading', detail: 'medium detail' };
const HIGH = { image_size: { width: 64, height: 64 }, outline: 'selective outline', shading: 'detailed shading', detail: 'highly detailed' };

const MANIFEST = [
  // --- Agents (4-direction) ---
  { category: 'agents', name: 'crew_engineer', endpoint: 'create-character-with-4-directions',
    prompts: ['rimworld pawn floating-head style human in orange engineering jumpsuit, short hair, utility belt, expressive face'],
    template: 'mannequin' },
  { category: 'agents', name: 'visitor_diner', endpoint: 'create-character-with-4-directions',
    prompts: ['rimworld pawn floating-head style human in casual clothes, heading to eat, short hair'],
    template: 'mannequin' },
  { category: 'agents', name: 'resident_sleeper', endpoint: 'create-character-with-4-directions',
    prompts: ['rimworld pawn floating-head style human in pajamas, drowsy expression, stretching'],
    template: 'mannequin' },
  // --- Modules (4-direction object) ---
  { category: 'modules', name: 'bed', endpoint: 'create-object-with-4-directions',
    prompts: ['top-down view pixel-art bed, headboard up, sheets folded down, clean lines, sci-fi station style'] },
  { category: 'modules', name: 'table', endpoint: 'create-object-with-4-directions',
    prompts: ['top-down view pixel-art dining table, round, simple'] },
  { category: 'modules', name: 'terminal', endpoint: 'create-object-with-4-directions',
    prompts: ['top-down view pixel-art computer terminal with glowing screen, sci-fi'] },
  { category: 'modules', name: 'stove', endpoint: 'create-object-with-4-directions',
    prompts: ['top-down view pixel-art industrial stove with burners, dark metallic'] },
  { category: 'modules', name: 'workbench', endpoint: 'create-object-with-4-directions',
    prompts: ['top-down view pixel-art cluttered workbench with tools, browns and greys'] },
  { category: 'modules', name: 'couch', endpoint: 'create-object-with-4-directions',
    prompts: ['top-down view pixel-art sofa, fabric, two-seater, cozy'] }
];

const VARIANTS = [
  { label: 'v1', style: BASE },
  { label: 'highdetail', style: HIGH }
];

async function postJob(endpoint, body) {
  const r = await fetch(`${API}/${endpoint}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`POST ${endpoint} ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j.background_job_id || j.id || j.job_id;
}

async function waitForJob(id, timeoutSec = 180) {
  const start = Date.now();
  while (Date.now() - start < timeoutSec * 1000) {
    const r = await fetch(`${API}/background-jobs/${id}`, { headers });
    const j = await r.json().catch(() => ({}));
    if (j.status === 'completed' || j.status === 'succeeded') return j;
    if (j.status === 'failed' || j.status === 'error') {
      const err = new Error(`job ${id} failed: ${JSON.stringify(j).slice(0, 300)}`);
      err.isRateLimit = /maximum number of background jobs|429/i.test(JSON.stringify(j.last_response || {}));
      throw err;
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error(`job ${id} timeout after ${timeoutSec}s`);
}

async function submitWithRetry(endpoint, body, maxAttempts = 6) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const id = await postJob(endpoint, body);
      const j = await waitForJob(id, 240);
      return j;
    } catch (e) {
      if (!e.isRateLimit || i === maxAttempts - 1) throw e;
      // Exponential backoff 5s, 10s, 20s, 40s, 80s with jitter
      const wait = Math.floor((5000 * Math.pow(2, i)) * (0.75 + Math.random() * 0.5));
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw new Error('unreachable');
}

async function fetchBinary(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`GET ${url} ${r.status}`);
  const buf = await r.arrayBuffer();
  return Buffer.from(buf);
}

// Decode a { type:'rgba_bytes', width, height, base64 } field into a PNG on disk via sharp.
// For now just write the raw RGBA buffer — tile-editor can handle conversion.
async function writeRgbaAsPng(rgba, width, height, outPath) {
  // Dynamic import of sharp (already a dep of space-station-game).
  const { default: sharp } = await import('sharp');
  await sharp(Buffer.from(rgba, 'base64'), { raw: { width, height, channels: 4 } })
    .png()
    .toFile(outPath);
}

async function runCharacter(asset, variant) {
  const body = {
    description: asset.prompts[0],
    template_id: asset.template || 'mannequin',
    view: 'low top-down',
    ...variant.style
  };
  const j = await submitWithRetry(asset.endpoint, body);
  const lr = j.last_response || {};
  const imgs = lr.images || {};
  const dir = path.join(OUT, asset.category, asset.name);
  await fs.mkdir(dir, { recursive: true });
  // Stitch 4 directions into a horizontal sheet (N/E/S/W × 64px each = 256×64),
  // simpler for editor consumption.
  const { default: sharp } = await import('sharp');
  const order = ['north', 'east', 'south', 'west'];
  const tiles = [];
  for (const d of order) {
    const im = imgs[d];
    if (!im) continue;
    const raw = sharp(Buffer.from(im.base64, 'base64'), { raw: { width: im.width, height: im.height || im.width, channels: 4 } });
    tiles.push(await raw.png().toBuffer());
  }
  // Save individual + composite
  for (let i = 0; i < order.length; i++) {
    const d = order[i];
    if (imgs[d]) await fs.writeFile(path.join(dir, `${variant.label}_${d}.png`), tiles[i]);
  }
  // Write a sheet
  if (tiles.length > 0) {
    const size = imgs[order[0]].width;
    const sheet = await sharp({
      create: { width: size * order.length, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    })
      .composite(tiles.map((b, i) => ({ input: b, left: i * size, top: 0 })))
      .png()
      .toFile(path.join(dir, `${variant.label}.png`));
  }
  return { ok: true, cost: j.usage?.usd ?? 0 };
}

async function runObject(asset, variant) {
  const body = {
    description: asset.prompts[0],
    ...variant.style
  };
  const j = await submitWithRetry(asset.endpoint, body);
  const lr = j.last_response || {};
  const urls = lr.storage_urls || {};
  const dir = path.join(OUT, asset.category, asset.name);
  await fs.mkdir(dir, { recursive: true });
  const order = ['north', 'east', 'south', 'west'];
  const bufs = [];
  for (const d of order) {
    if (!urls[d]) { bufs.push(null); continue; }
    const buf = await fetchBinary(urls[d]);
    await fs.writeFile(path.join(dir, `${variant.label}_${d}.png`), buf);
    bufs.push(buf);
  }
  const { default: sharp } = await import('sharp');
  const valid = bufs.filter(Boolean);
  if (valid.length > 0) {
    const first = await sharp(valid[0]).metadata();
    const size = first.width || 64;
    await sharp({
      create: { width: size * order.length, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    })
      .composite(valid.map((b, i) => ({ input: b, left: i * size, top: 0 })))
      .png()
      .toFile(path.join(dir, `${variant.label}.png`));
  }
  return { ok: true, cost: j.usage?.usd ?? 0 };
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const status = {
    generated_at: new Date().toISOString(),
    categories: {}
  };
  let totalCost = 0, ok = 0, fail = 0;

  // Fire all jobs in parallel per-asset, sequential per-variant for rate-limit safety.
  const tasks = [];
  for (const a of MANIFEST) {
    for (const v of VARIANTS) {
      tasks.push({ a, v });
    }
  }

  // Concurrency-limited. Pixellab free/low-tier caps at 3 concurrent background jobs.
  // Keep 2 in flight so we stay under the cap even if a prior job is still settling.
  const CONCURRENCY = 2;
  const running = new Set();
  const results = [];
  for (const t of tasks) {
    const p = (async () => {
      const tag = `${t.a.category}/${t.a.name}/${t.v.label}`;
      console.log(`[start] ${tag}`);
      try {
        const r = t.a.endpoint.includes('character')
          ? await runCharacter(t.a, t.v)
          : await runObject(t.a, t.v);
        totalCost += r.cost;
        ok++;
        console.log(`[ok]    ${tag} cost=$${r.cost.toFixed(4)}`);
        results.push({ a: t.a, v: t.v, status: 'ready', cost: r.cost });
      } catch (e) {
        fail++;
        console.error(`[fail]  ${tag}: ${e.message}`);
        results.push({ a: t.a, v: t.v, status: 'failed', error: String(e).slice(0, 200) });
      } finally {
        running.delete(p);
      }
    })();
    running.add(p);
    if (running.size >= CONCURRENCY) await Promise.race(running);
  }
  await Promise.all(running);

  // Build _status.json
  for (const r of results) {
    const cat = status.categories[r.a.category] ||= {};
    const asset = cat[r.a.name] ||= { variants: [] };
    asset.variants.push({
      id: r.v.label,
      endpoint: r.a.endpoint,
      params: r.v.style,
      png: `${r.a.category}/${r.a.name}/${r.v.label}.png`,
      status: r.status,
      cost_usd: r.cost ?? 0
    });
  }
  await fs.writeFile(path.join(OUT, '_status.json'), JSON.stringify(status, null, 2));

  console.log('---');
  console.log(`done. ok=${ok} fail=${fail} cost=$${totalCost.toFixed(4)}`);
}

main().catch(e => { console.error('fatal:', e); process.exit(1); });
