#!/usr/bin/env node
// Post-pack side-effect: copy the packed atlas.png + atlas.json + a
// snapshot of current curated/ into archive/atlas-{iso}/ so the
// sprite-review harness can diff current iteration against any past
// iteration (tinyclaw lever #4).
//
// Called automatically by `npm run sprites:pack` AFTER pack succeeds.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS), '..', '..');
const ATLAS_PNG = path.join(ROOT, 'public/assets/sprites/atlas.png');
const ATLAS_JSON = path.join(ROOT, 'public/assets/sprites/atlas.json');
const CURATED_DIR = path.join(ROOT, 'tools/sprites/curated');
const ARCHIVE_ROOT = path.join(ROOT, 'tools/sprites/archive');

// Keep only the last N archive entries to prevent unbounded git history
const MAX_ARCHIVE_ENTRIES = 10;

async function main() {
  const manifest = JSON.parse(await fs.readFile(ATLAS_JSON, 'utf8'));
  const version = manifest.version || `unknown-${Date.now()}`;
  const safeVersion = version.replace(/[^a-zA-Z0-9_-]/g, '_');
  const archiveDir = path.join(ARCHIVE_ROOT, `atlas-${safeVersion}`);
  await fs.mkdir(archiveDir, { recursive: true });

  // Copy atlas + manifest
  await fs.copyFile(ATLAS_PNG, path.join(archiveDir, 'atlas.png'));
  await fs.copyFile(ATLAS_JSON, path.join(archiveDir, 'atlas.json'));

  // Copy curated/ snapshot
  const curatedArchive = path.join(archiveDir, 'curated');
  await fs.mkdir(curatedArchive, { recursive: true });
  const curatedFiles = await fs.readdir(CURATED_DIR);
  for (const f of curatedFiles) {
    if (!f.endsWith('.png')) continue;
    await fs.copyFile(path.join(CURATED_DIR, f), path.join(curatedArchive, f));
  }

  // Prune oldest archives beyond MAX_ARCHIVE_ENTRIES (keeps repo lean)
  const existing = (await fs.readdir(ARCHIVE_ROOT))
    .filter((d) => d.startsWith('atlas-'))
    .map((d) => ({
      name: d,
      path: path.join(ARCHIVE_ROOT, d),
    }));
  // Sort by mtime desc
  for (const e of existing) {
    const s = await fs.stat(e.path);
    e.mtime = s.mtimeMs;
  }
  existing.sort((a, b) => b.mtime - a.mtime);
  const toPrune = existing.slice(MAX_ARCHIVE_ENTRIES);
  for (const p of toPrune) {
    await fs.rm(p.path, { recursive: true, force: true });
  }

  console.log(`[archive-atlas] archived ${archiveDir}, pruned ${toPrune.length} older entries.`);
}

main().catch((err) => { console.error(err.stack || err.message); process.exit(1); });
