#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseKeysArg } from './sprite-spec.mjs';

const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), '..', '..');
const TOOLS_DIR = path.resolve(ROOT, 'tools', 'sprites');
const PROFILE_NAMES = new Set(['test', 'v1', 'floors-walls', 'agents', 'tiles-full']);

function parseArgs(argv) {
  const args = {
    profile: 'v1',
    keysRaw: '',
    activate: false,
    spec: ''
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--profile' && argv[i + 1]) {
      args.profile = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--keys' && argv[i + 1]) {
      args.keysRaw = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--spec' && argv[i + 1]) {
      args.spec = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--activate') {
      args.activate = true;
    }
  }
  return args;
}

function runStep(name, scriptName, extraArgs) {
  const scriptPath = path.resolve(TOOLS_DIR, scriptName);
  const result = spawnSync(process.execPath, [scriptPath, ...extraArgs], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env
  });
  if (result.status !== 0) {
    throw new Error(`Step failed: ${name}`);
  }
}

function normalizeSpecArg(rawSpec) {
  if (typeof rawSpec !== 'string' || rawSpec.trim().length <= 0) return [];
  return ['--spec', rawSpec.trim()];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!PROFILE_NAMES.has(args.profile)) {
    throw new Error(`Unsupported profile: ${args.profile}. Use one of: ${[...PROFILE_NAMES].join(', ')}`);
  }

  const keys = parseKeysArg(args.keysRaw);
  if (keys.length <= 0) {
    throw new Error('Missing --keys. Example: --keys tile.floor,tile.wall.corner');
  }

  const specArg = normalizeSpecArg(args.spec);
  const keysArg = keys.join(',');
  runStep('generate', 'generate-nanobanana.mjs', ['--profile', args.profile, '--overwrite', '--keys', keysArg, ...specArg]);
  runStep('process', 'postprocess-raw.mjs', ['--profile', args.profile, '--overwrite']);
  runStep('pack', 'pack-atlas.mjs', [
    '--profile',
    args.profile,
    '--source',
    'processed',
    ...(args.activate ? ['--activate'] : []),
    ...specArg
  ]);
  runStep('validate', 'validate-atlas.mjs', ['--profile', args.profile]);

  console.log(`Retry complete. profile=${args.profile}, keys=${keys.join(',')}${args.activate ? ', activated=true' : ''}`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
