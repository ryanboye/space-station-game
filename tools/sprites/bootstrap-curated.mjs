#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), '..', '..');
const TOOLS_DIR = path.resolve(ROOT, 'tools', 'sprites');
const CURATED_DIR = path.resolve(TOOLS_DIR, 'curated');
const PROCESSED_DIR = path.resolve(TOOLS_DIR, 'out', 'processed');

function parseArgs(argv) {
  const args = { overwrite: false };
  for (const arg of argv) {
    if (arg === '--overwrite') args.overwrite = true;
  }
  return args;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await fs.mkdir(CURATED_DIR, { recursive: true });

  const entries = await fs.readdir(PROCESSED_DIR, { withFileTypes: true });
  let copied = 0;
  let skipped = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith('.png')) continue;
    const src = path.resolve(PROCESSED_DIR, entry.name);
    const dst = path.resolve(CURATED_DIR, entry.name);
    if (!args.overwrite && (await fileExists(dst))) {
      skipped += 1;
      continue;
    }
    await fs.copyFile(src, dst);
    copied += 1;
  }

  console.log(`Bootstrapped curated sprites. copied=${copied}, skipped=${skipped}, curatedDir=${CURATED_DIR}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
