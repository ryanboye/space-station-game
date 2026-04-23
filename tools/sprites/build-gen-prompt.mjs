#!/usr/bin/env node
// Expand {MACRO} tokens in a prompt template against prompt-macros.yaml.
// Usage: build-gen-prompt.mjs <template-file>  →  prints expanded text to stdout.
//
// Lets prompts compose camera/palette/style vocabulary from a shared
// yaml file so iteration-to-iteration drift from inconsistent language
// is eliminated at source (tinyclaw lever #3).

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const THIS = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS), '..', '..');
const MACROS_PATH = path.join(ROOT, 'tools/sprites/prompt-macros.yaml');

async function main() {
  const tmplPath = process.argv[2];
  if (!tmplPath) {
    console.error('usage: build-gen-prompt.mjs <template-file>');
    process.exit(2);
  }
  const tmpl = await fs.readFile(tmplPath, 'utf8');
  const macros = YAML.parse(await fs.readFile(MACROS_PATH, 'utf8'));

  let expanded = tmpl;
  let pass = 0;
  while (pass < 10) {  // limit nested expansion depth
    let found = false;
    expanded = expanded.replace(/\{([A-Z_][A-Z0-9_]*)\}/g, (match, name) => {
      if (macros[name] !== undefined) {
        found = true;
        return macros[name];
      }
      return match;  // leave unknown tokens alone
    });
    if (!found) break;
    pass++;
  }
  process.stdout.write(expanded);
}

main().catch((err) => { console.error(err.stack || err.message); process.exit(1); });
