#!/usr/bin/env node
/**
 * qa-review.mjs — human-in-the-loop QA gate for gpt-image-1 sprite output.
 *
 * This tool is the ONLY way a tile in `staging/` can be promoted to
 * `approved/`. A future `pack-atlas.mjs` revision will read from
 * `approved/` — never from `staging/` directly. That constraint is the
 * reason this tool exists: sam + awfml want a single reviewer checkpoint
 * before any generator output touches the runtime atlas.
 *
 * Boundaries:
 *   - Zero imports from `src/`. Pure Node + three prelim modules +
 *     `yaml` + `sharp`.
 *   - All paths sourced from config (./qa-config.json by default).
 *   - Port defaults to 5199, overridable via QA_PORT / --port / config.
 *   - Portable: `cp qa-review.mjs qa-config.json` into another project
 *     (sebcity etc.), tweak the JSON, done.
 *
 * Safety invariants enforced server-side:
 *   1. Approve ONLY moves files into `approved/`. Never touches
 *      `public/assets/sprites/*` — pack-atlas owns that surface.
 *   2. If `approved/<key>.png` already exists, `/api/approve` returns 409
 *      and the UI surfaces the conflict. `/api/approve-force` overwrites.
 *   3. Reject moves to `rejected/` + optional note. `/api/unreject`
 *      round-trips back to `staging/`.
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import YAML from 'yaml';
import sharp from 'sharp';
import { buildPrompt } from './build-prompt.mjs';
import { hasModerationRisk, formatSwaps } from './moderation-rephrase.mjs';
// rate-limits.mjs is imported so the three prelim modules stay coupled at
// the module-graph level — if any one vanishes, the QA tool fails loud on
// startup instead of silently skipping features. Functionally unused here
// (ETA banner is a follow-up; generator-side is where it matters).
// eslint-disable-next-line no-unused-vars
import * as _rateLimits from './rate-limits.mjs';

const THIS_FILE = fileURLToPath(import.meta.url);
const THIS_DIR = path.dirname(THIS_FILE);
const REPO_ROOT = path.resolve(THIS_DIR, '..', '..');

// --- CLI parsing ----------------------------------------------------------

function parseArgs(argv) {
  const args = { config: null, port: null, open: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config') args.config = argv[++i];
    else if (a === '--port') args.port = Number(argv[++i]);
    else if (a === '--no-open') args.open = false;
    else if (a === '-h' || a === '--help') {
      console.log('Usage: qa-review.mjs [--config <path>] [--port <n>] [--no-open]');
      process.exit(0);
    } else {
      console.error(`qa-review: unknown arg "${a}"`);
      process.exit(2);
    }
  }
  return args;
}

// --- Config loading -------------------------------------------------------

function resolveConfigPath(cliPath) {
  if (cliPath) return path.resolve(process.cwd(), cliPath);
  if (process.env.QA_CONFIG) return path.resolve(process.cwd(), process.env.QA_CONFIG);
  return path.resolve(THIS_DIR, 'qa-config.json');
}

async function loadConfig(configPath) {
  const raw = await fs.readFile(configPath, 'utf8');
  const cfg = JSON.parse(raw);
  // Resolve every path in the config relative to REPO_ROOT (two levels up
  // from tools/sprites/). Absolute paths are passed through untouched.
  const abs = (p) => (p ? (path.isAbsolute(p) ? p : path.resolve(REPO_ROOT, p)) : null);
  return {
    projectName: cfg.projectName || 'sprite-qa',
    stagingDir: abs(cfg.stagingDir),
    approvedDir: abs(cfg.approvedDir),
    rejectedDir: abs(cfg.rejectedDir),
    specPath: abs(cfg.specPath),
    publicAtlasJson: abs(cfg.publicAtlasJson),
    publicAtlasPng: abs(cfg.publicAtlasPng),
    referenceImage: abs(cfg.referenceImage),
    previewSizes: Array.isArray(cfg.previewSizes) && cfg.previewSizes.length
      ? cfg.previewSizes.map(Number)
      : [32, 64, 128],
    port: cfg.port || 5199,
  };
}

// --- Filesystem helpers ---------------------------------------------------

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function fileExists(p) {
  if (!p) return false;
  try { await fs.access(p); return true; } catch { return false; }
}

async function listKeys(dir) {
  // A "key" is any file <name>.png in dir. .meta.json sidecars are
  // associated by stem.
  try {
    const entries = await fs.readdir(dir);
    return entries
      .filter((f) => f.endsWith('.png'))
      .map((f) => f.replace(/\.png$/, ''))
      .sort();
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function readMetaJson(dir, key) {
  const p = path.join(dir, `${key}.meta.json`);
  try {
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    return { _parseError: err.message };
  }
}

async function movePair(srcDir, dstDir, key, extras = []) {
  // Moves <key>.png and <key>.meta.json (if present) from srcDir to dstDir.
  // `extras` is a list of additional suffixes to move if they exist
  // (e.g. 'note.txt').
  await ensureDir(dstDir);
  const moved = [];
  const suffixes = ['png', 'meta.json', ...extras];
  for (const suf of suffixes) {
    const src = path.join(srcDir, `${key}.${suf}`);
    const dst = path.join(dstDir, `${key}.${suf}`);
    if (await fileExists(src)) {
      // Rename is atomic within a filesystem. Fall back to copy+unlink if
      // the dirs span filesystems (rare in practice on a single workstation).
      try {
        await fs.rename(src, dst);
      } catch (err) {
        if (err.code === 'EXDEV') {
          await fs.copyFile(src, dst);
          await fs.unlink(src);
        } else {
          throw err;
        }
      }
      moved.push(suf);
    }
  }
  return moved;
}

// --- Spec + prompt (re-derivation for display) ----------------------------

let SPEC_CACHE = null;
async function loadSpec(specPath) {
  if (SPEC_CACHE) return SPEC_CACHE;
  try {
    const raw = await fs.readFile(specPath, 'utf8');
    SPEC_CACHE = YAML.parse(raw);
  } catch (err) {
    // If spec is missing, the tool is still usable — we just can't
    // re-derive prompts. Meta.json written at generation time should
    // already carry the prompt, so this is best-effort fallback.
    SPEC_CACHE = { sprites: {} };
  }
  return SPEC_CACHE;
}

async function enrichMeta(specPath, key, meta) {
  // Prefer fields on meta.json (what actually shipped to the API). Fall
  // back to re-deriving from spec for context the generator may not have
  // written (e.g. raw pre-rephrase description).
  const spec = await loadSpec(specPath);
  let fallback = null;
  try {
    fallback = buildPrompt(spec, key);
  } catch { /* key missing from spec — that's fine */ }
  const prompt = meta?.prompt || fallback?.prompt || '';
  const description = meta?.description || fallback?.description || '';
  const swaps = meta?.swaps || fallback?.swaps || [];
  return {
    prompt,
    description,
    swaps,
    swapsLabel: formatSwaps(swaps),
    moderationRisk: hasModerationRisk(prompt || description),
    quality: meta?.quality ?? null,
    generated: meta?.generated ?? null,
    model: meta?.model ?? null,
  };
}

// --- Atlas slicing --------------------------------------------------------

let ATLAS_CACHE = null;
async function loadAtlas(atlasJsonPath) {
  if (ATLAS_CACHE) return ATLAS_CACHE;
  if (!atlasJsonPath || !(await fileExists(atlasJsonPath))) {
    ATLAS_CACHE = null;
    return null;
  }
  try {
    const raw = await fs.readFile(atlasJsonPath, 'utf8');
    ATLAS_CACHE = JSON.parse(raw);
  } catch {
    ATLAS_CACHE = null;
  }
  return ATLAS_CACHE;
}

async function sliceAtlasRegion(atlasPngPath, frame) {
  if (!frame || !(await fileExists(atlasPngPath))) return null;
  const { x, y, w, h } = frame;
  // sharp.extract is 0-indexed; atlas frames are already in image space.
  try {
    return await sharp(atlasPngPath)
      .extract({ left: x, top: y, width: w, height: h })
      .png()
      .toBuffer();
  } catch (err) {
    return null;
  }
}

// --- HTTP helpers ---------------------------------------------------------

function sendJson(res, code, body) {
  const json = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(json),
    'cache-control': 'no-store',
  });
  res.end(json);
}

function sendText(res, code, body, type = 'text/plain') {
  res.writeHead(code, {
    'content-type': `${type}; charset=utf-8`,
    'cache-control': 'no-store',
  });
  res.end(body);
}

async function sendFile(res, filePath, contentType) {
  try {
    const buf = await fs.readFile(filePath);
    res.writeHead(200, {
      'content-type': contentType,
      'content-length': buf.length,
      'cache-control': 'no-store',
    });
    res.end(buf);
  } catch (err) {
    sendText(res, 404, `not found: ${filePath}`);
  }
}

function sendBuffer(res, buf, contentType) {
  res.writeHead(200, {
    'content-type': contentType,
    'content-length': buf.length,
    'cache-control': 'no-store',
  });
  res.end(buf);
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

// --- State assembly -------------------------------------------------------

async function buildState(cfg) {
  const [stagingKeys, approvedKeys, rejectedKeys] = await Promise.all([
    listKeys(cfg.stagingDir),
    listKeys(cfg.approvedDir),
    listKeys(cfg.rejectedDir),
  ]);

  const atlas = await loadAtlas(cfg.publicAtlasJson);
  const atlasFrames = atlas?.frames || {};

  const staging = [];
  for (const key of stagingKeys) {
    const meta = await readMetaJson(cfg.stagingDir, key);
    const enriched = await enrichMeta(cfg.specPath, key, meta);
    const approvedExists = approvedKeys.includes(key);
    staging.push({
      key,
      stagingImgPath: path.join(cfg.stagingDir, `${key}.png`),
      metaJsonPath: path.join(cfg.stagingDir, `${key}.meta.json`),
      approvedImgPath: approvedExists
        ? path.join(cfg.approvedDir, `${key}.png`)
        : null,
      hasApprovedConflict: approvedExists,
      hasAtlasSlice: Boolean(atlasFrames[key]),
      meta: enriched,
    });
  }

  return {
    projectName: cfg.projectName,
    previewSizes: cfg.previewSizes,
    staging,
    progress: {
      staging: stagingKeys.length,
      approved: approvedKeys.length,
      rejected: rejectedKeys.length,
    },
  };
}

// --- HTML page ------------------------------------------------------------

function htmlPage() {
  // Inline so the tool is a single file. Dark theme approximates the
  // spacegame palette from src/styles.css.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>sprite QA</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root {
    --bg: #11161d;
    --panel: #1b2430;
    --panel-2: #223041;
    --text: #d6deeb;
    --muted: #8ea2bd;
    --ok: #6edb8f;
    --warn: #ffcf6e;
    --danger: #ff7676;
    --border: #2f3f53;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    font-family: Consolas, Menlo, Monaco, monospace;
    background: radial-gradient(circle at 20% 10%, #182430 0%, var(--bg) 55%);
    color: var(--text);
    font-size: 13px;
  }
  header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    background: linear-gradient(180deg, #192330 0%, #141c27 100%);
    display: flex;
    align-items: baseline;
    gap: 16px;
    flex-wrap: wrap;
  }
  header h1 {
    margin: 0;
    font-size: 16px;
    color: var(--text);
  }
  .stats {
    color: var(--muted);
    font-size: 12px;
  }
  .stats .ok { color: var(--ok); }
  .stats .warn { color: var(--warn); }
  .stats .danger { color: var(--danger); }
  main {
    max-width: 1280px;
    margin: 0 auto;
    padding: 16px;
  }
  .panel {
    background: linear-gradient(180deg, var(--panel) 0%, #141d29 100%);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px;
    margin-bottom: 16px;
  }
  .key-label {
    font-size: 18px;
    font-weight: bold;
    color: var(--text);
    margin: 0 0 4px;
  }
  .nav-line {
    color: var(--muted);
    font-size: 11px;
    margin-bottom: 12px;
  }
  .compare-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 16px;
    margin-bottom: 16px;
  }
  .compare-col h3 {
    margin: 0 0 8px;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .img-stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }
  .img-stack .zoom-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .zoom-label {
    font-size: 10px;
    color: var(--muted);
    min-width: 32px;
  }
  .sprite-img {
    background: #0a0e14;
    border: 1px solid var(--border);
    image-rendering: pixelated;
    display: block;
  }
  .sprite-img.missing {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
    font-size: 10px;
    background: repeating-linear-gradient(45deg, #141c27, #141c27 6px, #182333 6px, #182333 12px);
  }
  .reference-col .sprite-img {
    max-width: 256px;
    max-height: 256px;
    width: auto;
    height: auto;
  }
  .meta-block {
    font-family: Consolas, Menlo, Monaco, monospace;
    font-size: 12px;
    background: #0f161f;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 10px;
    margin-bottom: 12px;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--text);
  }
  .meta-row {
    display: flex;
    gap: 8px;
    align-items: baseline;
    margin-bottom: 4px;
    flex-wrap: wrap;
  }
  .meta-row .k {
    color: var(--muted);
    min-width: 90px;
  }
  .meta-row .v { color: var(--text); }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: bold;
    margin-right: 6px;
  }
  .badge.warn {
    background: rgba(255, 207, 110, 0.15);
    border: 1px solid var(--warn);
    color: var(--warn);
  }
  .badge.danger {
    background: rgba(255, 118, 118, 0.15);
    border: 1px solid var(--danger);
    color: var(--danger);
  }
  .badge.muted {
    background: rgba(142, 162, 189, 0.1);
    border: 1px solid var(--muted);
    color: var(--muted);
  }
  .actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 12px;
  }
  button {
    font-family: inherit;
    font-size: 13px;
    padding: 8px 16px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--panel-2);
    color: var(--text);
    cursor: pointer;
  }
  button:hover { filter: brightness(1.15); }
  button.approve {
    border-color: var(--ok);
    color: var(--ok);
  }
  button.reject {
    border-color: var(--danger);
    color: var(--danger);
  }
  button.nav {
    border-color: var(--muted);
    color: var(--muted);
  }
  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .progress-bar {
    position: fixed;
    left: 0;
    bottom: 0;
    width: 100%;
    height: 28px;
    background: #0a0e14;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    padding: 0 16px;
    font-size: 11px;
    color: var(--muted);
    gap: 12px;
  }
  .progress-track {
    flex: 1;
    height: 8px;
    background: #0a0e14;
    border: 1px solid var(--border);
    border-radius: 4px;
    position: relative;
    overflow: hidden;
  }
  .progress-fill-ok {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: var(--ok);
  }
  .progress-fill-danger {
    position: absolute;
    top: 0;
    height: 100%;
    background: var(--danger);
  }
  .toast {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 10px 14px;
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 12px;
    max-width: 380px;
    z-index: 50;
  }
  .toast.ok { border-color: var(--ok); color: var(--ok); }
  .toast.err { border-color: var(--danger); color: var(--danger); }
  kbd {
    display: inline-block;
    padding: 1px 5px;
    background: #0f161f;
    border: 1px solid var(--border);
    border-radius: 3px;
    font-size: 10px;
    color: var(--muted);
    margin: 0 2px;
  }
  .done-panel {
    text-align: center;
    padding: 60px 20px;
  }
  .done-panel h2 {
    color: var(--ok);
    margin-bottom: 12px;
  }
  .hint {
    color: var(--muted);
    font-size: 11px;
    margin-top: 16px;
  }
  .conflict-row {
    padding: 8px 12px;
    margin-bottom: 12px;
    background: rgba(255, 207, 110, 0.08);
    border: 1px solid var(--warn);
    border-radius: 6px;
    color: var(--warn);
    font-size: 12px;
  }
</style>
</head>
<body>
<header>
  <h1 id="title">sprite QA</h1>
  <span class="stats" id="stats">loading…</span>
  <span class="stats">
    <kbd>a</kbd> approve
    <kbd>r</kbd> reject
    <kbd>j</kbd>/<kbd>k</kbd> next/prev
  </span>
</header>
<main id="main"></main>
<div class="progress-bar">
  <span id="progress-label">—</span>
  <div class="progress-track" id="progress-track">
    <div class="progress-fill-ok" id="progress-fill-ok"></div>
    <div class="progress-fill-danger" id="progress-fill-danger"></div>
  </div>
  <span id="progress-counts">—</span>
</div>
<div id="toast-host"></div>

<script>
const state = {
  staging: [],
  previewSizes: [32, 64, 128],
  projectName: 'sprite-qa',
  progress: { staging: 0, approved: 0, rejected: 0 },
  index: 0,
};

async function fetchState() {
  const r = await fetch('/api/state');
  const data = await r.json();
  state.staging = data.staging;
  state.previewSizes = data.previewSizes;
  state.projectName = data.projectName;
  state.progress = data.progress;
  document.getElementById('title').textContent = data.projectName + ' sprite QA';
  if (state.index >= state.staging.length) {
    state.index = Math.max(0, state.staging.length - 1);
  }
  render();
}

function toast(msg, cls = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast ' + cls;
  t.textContent = msg;
  document.getElementById('toast-host').appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

function render() {
  const main = document.getElementById('main');
  const stats = document.getElementById('stats');
  const progressFillOk = document.getElementById('progress-fill-ok');
  const progressFillDanger = document.getElementById('progress-fill-danger');
  const progressLabel = document.getElementById('progress-label');
  const progressCounts = document.getElementById('progress-counts');

  const total = state.progress.staging + state.progress.approved + state.progress.rejected;
  const done = state.progress.approved + state.progress.rejected;
  const pctOk = total > 0 ? (state.progress.approved / total) * 100 : 0;
  const pctBad = total > 0 ? (state.progress.rejected / total) * 100 : 0;
  progressFillOk.style.width = pctOk + '%';
  progressFillDanger.style.width = pctBad + '%';
  progressFillDanger.style.left = pctOk + '%';
  progressCounts.textContent = state.progress.approved + '✓ ' + state.progress.rejected + '✗ ' + state.progress.staging + '? (' + total + ' total)';

  if (state.staging.length === 0) {
    stats.innerHTML = '<span class="ok">all staging reviewed</span>';
    progressLabel.textContent = 'done';
    main.innerHTML = \`
      <div class="panel done-panel">
        <h2>nothing to review</h2>
        <p>staging is empty.</p>
        <p class="hint">approved: \${state.progress.approved} · rejected: \${state.progress.rejected}</p>
        <p class="hint">next step: run <code>pack-atlas.mjs</code> to pack approved tiles into the runtime atlas.</p>
      </div>
    \`;
    return;
  }

  const current = state.staging[state.index];
  stats.innerHTML = \`reviewing <b>\${current.key}</b> — \${state.index + 1}/\${state.staging.length}\`;
  progressLabel.textContent = \`\${done}/\${total} reviewed\`;

  const sizes = state.previewSizes;
  const stagingStack = sizes.map((sz) => imgRow(sz, '/img/staging/' + encodeURIComponent(current.key))).join('');
  const atlasStack = current.hasAtlasSlice
    ? sizes.map((sz) => imgRow(sz, '/img/atlas-current/' + encodeURIComponent(current.key))).join('')
    : '<div class="sprite-img missing" style="width:128px;height:128px">no atlas entry</div>';
  const approvedStack = current.hasApprovedConflict
    ? sizes.map((sz) => imgRow(sz, '/img/approved/' + encodeURIComponent(current.key))).join('')
    : '';

  const swapBadge = current.meta.swapsLabel
    ? \`<span class="badge warn" title="moderation rephrases applied">swaps: \${escapeHtml(current.meta.swapsLabel)}</span>\`
    : '';
  const riskBadge = current.meta.moderationRisk && !current.meta.swapsLabel
    ? \`<span class="badge warn">moderation risk (check prompt)</span>\`
    : '';
  const conflict = current.hasApprovedConflict
    ? \`<div class="conflict-row">⚠ <b>\${escapeHtml(current.key)}</b> already exists in approved/. Approve will require confirmation (approve-force).</div>\`
    : '';

  main.innerHTML = \`
    <div class="panel">
      <div class="key-label">\${escapeHtml(current.key)}</div>
      <div class="nav-line">
        tile \${state.index + 1} of \${state.staging.length}
        \${state.index + 1 < state.staging.length ? '· next: <code>' + escapeHtml(state.staging[state.index + 1].key) + '</code>' : '· last tile'}
      </div>
      \${conflict}
      <div class="compare-grid">
        <div class="compare-col reference-col">
          <h3>reference / mockup</h3>
          <img src="/img/reference" class="sprite-img" onerror="this.replaceWith(missingDiv('no reference configured'))"/>
        </div>
        <div class="compare-col">
          <h3>staging (proposed)</h3>
          <div class="img-stack">\${stagingStack}</div>
        </div>
        <div class="compare-col">
          <h3>\${current.hasApprovedConflict ? 'current approved (will be replaced)' : 'current atlas'}</h3>
          <div class="img-stack">\${current.hasApprovedConflict ? approvedStack : atlasStack}</div>
        </div>
      </div>
      <div>
        \${swapBadge}\${riskBadge}
        \${current.meta.quality ? \`<span class="badge muted">quality: \${escapeHtml(String(current.meta.quality))}</span>\` : ''}
        \${current.meta.model ? \`<span class="badge muted">\${escapeHtml(String(current.meta.model))}</span>\` : ''}
        \${current.meta.generated ? \`<span class="badge muted">gen: \${escapeHtml(String(current.meta.generated))}</span>\` : ''}
      </div>
      <div class="meta-block">\${escapeHtml(current.meta.prompt || current.meta.description || '(no prompt recorded)')}</div>
      <div class="actions">
        <button class="nav" onclick="nav(-1)" \${state.index === 0 ? 'disabled' : ''}>◀ prev (k)</button>
        <button class="nav" onclick="nav(1)" \${state.index >= state.staging.length - 1 ? 'disabled' : ''}>next (j) ▶</button>
        <span style="flex:1"></span>
        <button class="approve" onclick="act('approve')">✓ Approve (a)</button>
        <button class="reject" onclick="act('reject')">✗ Reject (r)</button>
      </div>
    </div>
  \`;
}

function imgRow(size, src) {
  return \`<div class="zoom-row">
    <span class="zoom-label">\${size}px</span>
    <img src="\${src}" class="sprite-img" style="width:\${size}px;height:\${size}px" onerror="this.replaceWith(missingDiv('missing'))"/>
  </div>\`;
}

function missingDiv(label) {
  const d = document.createElement('div');
  d.className = 'sprite-img missing';
  d.style.width = '64px';
  d.style.height = '64px';
  d.textContent = label;
  return d;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nav(dir) {
  const next = state.index + dir;
  if (next < 0 || next >= state.staging.length) return;
  state.index = next;
  render();
}

async function act(action) {
  const current = state.staging[state.index];
  if (!current) return;
  if (action === 'reject') {
    const note = prompt('reject note (optional — blank skips):') || '';
    try {
      const r = await fetch('/api/reject', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: current.key, note }),
      });
      const data = await r.json();
      if (!r.ok) { toast(data.error || 'reject failed', 'err'); return; }
      toast(\`rejected: \${current.key}\`);
      await afterAction();
    } catch (err) { toast('network error: ' + err.message, 'err'); }
    return;
  }
  if (action === 'approve') {
    const endpoint = current.hasApprovedConflict ? '/api/approve-force' : '/api/approve';
    if (current.hasApprovedConflict) {
      if (!confirm(\`\${current.key} already approved. Overwrite existing approved version?\`)) return;
    }
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: current.key }),
      });
      const data = await r.json();
      if (!r.ok) { toast(data.error || 'approve failed', 'err'); return; }
      toast(\`approved: \${current.key}\`);
      await afterAction();
    } catch (err) { toast('network error: ' + err.message, 'err'); }
  }
}

async function afterAction() {
  // After moving, the current key disappears from staging. We keep the
  // index where it was — the next item naturally slides in. If we were
  // at the end, step back by one.
  const prevLen = state.staging.length;
  await fetchState();
  if (state.staging.length > 0 && state.index >= state.staging.length) {
    state.index = state.staging.length - 1;
    render();
  }
}

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'a' || e.key === 'A') { e.preventDefault(); act('approve'); }
  else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); act('reject'); }
  else if (e.key === 'j' || e.key === 'J') { e.preventDefault(); nav(1); }
  else if (e.key === 'k' || e.key === 'K') { e.preventDefault(); nav(-1); }
});

fetchState();
</script>
</body>
</html>`;
}

// --- Request routing ------------------------------------------------------

function decodeSegment(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

async function handleRequest(cfg, req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const method = req.method || 'GET';

  try {
    // GET / — the HTML UI
    if (method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return sendText(res, 200, htmlPage(), 'text/html');
    }

    // GET /api/state
    if (method === 'GET' && url.pathname === '/api/state') {
      const state = await buildState(cfg);
      return sendJson(res, 200, state);
    }

    // GET /img/reference
    if (method === 'GET' && url.pathname === '/img/reference') {
      if (cfg.referenceImage && (await fileExists(cfg.referenceImage))) {
        return sendFile(res, cfg.referenceImage, 'image/png');
      }
      return sendText(res, 404, 'no reference image configured');
    }

    // GET /img/staging/<key>
    if (method === 'GET' && url.pathname.startsWith('/img/staging/')) {
      const key = decodeSegment(url.pathname.slice('/img/staging/'.length));
      return sendFile(res, path.join(cfg.stagingDir, `${key}.png`), 'image/png');
    }

    // GET /img/approved/<key>
    if (method === 'GET' && url.pathname.startsWith('/img/approved/')) {
      const key = decodeSegment(url.pathname.slice('/img/approved/'.length));
      return sendFile(res, path.join(cfg.approvedDir, `${key}.png`), 'image/png');
    }

    // GET /img/rejected/<key>
    if (method === 'GET' && url.pathname.startsWith('/img/rejected/')) {
      const key = decodeSegment(url.pathname.slice('/img/rejected/'.length));
      return sendFile(res, path.join(cfg.rejectedDir, `${key}.png`), 'image/png');
    }

    // GET /img/atlas-current/<key>
    if (method === 'GET' && url.pathname.startsWith('/img/atlas-current/')) {
      const key = decodeSegment(url.pathname.slice('/img/atlas-current/'.length));
      const atlas = await loadAtlas(cfg.publicAtlasJson);
      const frame = atlas?.frames?.[key];
      if (!frame) return sendText(res, 404, 'no atlas entry for key');
      const buf = await sliceAtlasRegion(cfg.publicAtlasPng, frame);
      if (!buf) return sendText(res, 404, 'atlas slice unavailable');
      return sendBuffer(res, buf, 'image/png');
    }

    // POST /api/approve — move to approved/ unless conflict
    if (method === 'POST' && url.pathname === '/api/approve') {
      const body = await readJsonBody(req);
      const key = body?.key;
      if (!key) return sendJson(res, 400, { error: 'key required' });
      const approvedPng = path.join(cfg.approvedDir, `${key}.png`);
      if (await fileExists(approvedPng)) {
        return sendJson(res, 409, {
          error: `existing approved version will be overwritten — POST /api/approve-force to confirm`,
        });
      }
      const stagingPng = path.join(cfg.stagingDir, `${key}.png`);
      if (!(await fileExists(stagingPng))) {
        return sendJson(res, 404, { error: `staging/${key}.png not found` });
      }
      const moved = await movePair(cfg.stagingDir, cfg.approvedDir, key);
      return sendJson(res, 200, { ok: true, moved });
    }

    // POST /api/approve-force — overwrite existing approved
    if (method === 'POST' && url.pathname === '/api/approve-force') {
      const body = await readJsonBody(req);
      const key = body?.key;
      if (!key) return sendJson(res, 400, { error: 'key required' });
      const stagingPng = path.join(cfg.stagingDir, `${key}.png`);
      if (!(await fileExists(stagingPng))) {
        return sendJson(res, 404, { error: `staging/${key}.png not found` });
      }
      // Remove any pre-existing approved files for this key so movePair
      // doesn't fail on EEXIST on filesystems that don't overwrite on rename.
      for (const suf of ['png', 'meta.json']) {
        const p = path.join(cfg.approvedDir, `${key}.${suf}`);
        if (await fileExists(p)) await fs.unlink(p);
      }
      const moved = await movePair(cfg.stagingDir, cfg.approvedDir, key);
      return sendJson(res, 200, { ok: true, moved, forced: true });
    }

    // POST /api/reject — move to rejected/ + optional note
    if (method === 'POST' && url.pathname === '/api/reject') {
      const body = await readJsonBody(req);
      const key = body?.key;
      if (!key) return sendJson(res, 400, { error: 'key required' });
      const stagingPng = path.join(cfg.stagingDir, `${key}.png`);
      if (!(await fileExists(stagingPng))) {
        return sendJson(res, 404, { error: `staging/${key}.png not found` });
      }
      // Clear any prior rejected files for this key (re-reject after
      // unreject is legitimate; just overwrite).
      for (const suf of ['png', 'meta.json', 'note.txt']) {
        const p = path.join(cfg.rejectedDir, `${key}.${suf}`);
        if (await fileExists(p)) await fs.unlink(p);
      }
      const moved = await movePair(cfg.stagingDir, cfg.rejectedDir, key);
      const note = (body?.note || '').trim();
      if (note) {
        await ensureDir(cfg.rejectedDir);
        await fs.writeFile(
          path.join(cfg.rejectedDir, `${key}.note.txt`),
          `${new Date().toISOString()}\n${note}\n`,
          'utf8',
        );
        moved.push('note.txt');
      }
      return sendJson(res, 200, { ok: true, moved });
    }

    // POST /api/unreject — move rejected -> staging
    if (method === 'POST' && url.pathname === '/api/unreject') {
      const body = await readJsonBody(req);
      const key = body?.key;
      if (!key) return sendJson(res, 400, { error: 'key required' });
      const rejectedPng = path.join(cfg.rejectedDir, `${key}.png`);
      if (!(await fileExists(rejectedPng))) {
        return sendJson(res, 404, { error: `rejected/${key}.png not found` });
      }
      const moved = await movePair(cfg.rejectedDir, cfg.stagingDir, key, ['note.txt']);
      return sendJson(res, 200, { ok: true, moved });
    }

    return sendText(res, 404, `not found: ${url.pathname}`);
  } catch (err) {
    console.error('qa-review: request error', err);
    return sendJson(res, 500, { error: err.message });
  }
}

// --- Browser open helper --------------------------------------------------

function openBrowser(url) {
  const platform = process.platform;
  let cmd;
  if (platform === 'darwin') cmd = `open "${url}"`;
  else if (platform === 'win32') cmd = `start "" "${url}"`;
  else cmd = `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) {
      // Silent — Linux servers often lack xdg-open. Print the URL anyway.
    }
  });
}

// --- Main ------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);
  const configPath = resolveConfigPath(args.config);
  if (!fsSync.existsSync(configPath)) {
    console.error(`qa-review: config not found at ${configPath}`);
    console.error(`  set QA_CONFIG=<path>, pass --config <path>, or place qa-config.json next to qa-review.mjs`);
    process.exit(2);
  }
  const cfg = await loadConfig(configPath);
  const port = Number(process.env.QA_PORT) || args.port || cfg.port || 5199;

  // Ensure target dirs exist so first approve/reject doesn't ENOENT.
  await Promise.all([
    ensureDir(cfg.stagingDir),
    ensureDir(cfg.approvedDir),
    ensureDir(cfg.rejectedDir),
  ]);

  const server = http.createServer((req, res) => handleRequest(cfg, req, res));
  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`qa-review: ${cfg.projectName}`);
    console.log(`  staging:  ${path.relative(REPO_ROOT, cfg.stagingDir)}`);
    console.log(`  approved: ${path.relative(REPO_ROOT, cfg.approvedDir)}`);
    console.log(`  rejected: ${path.relative(REPO_ROOT, cfg.rejectedDir)}`);
    console.log(`  config:   ${path.relative(REPO_ROOT, configPath)}`);
    console.log(`  listening on ${url}`);
    if (args.open) openBrowser(url);
  });
}

main().catch((err) => {
  console.error('qa-review: fatal', err);
  process.exit(1);
});
