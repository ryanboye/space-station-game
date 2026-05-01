#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), '..', '..');
const OUT_DIR = path.resolve(ROOT, 'tools', 'sprites', 'curated');

function keyToFileName(key) {
  return `${key.replace(/[^a-zA-Z0-9]+/g, '_')}.png`;
}

function svg(width, height, body) {
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="3" stdDeviation="0" flood-color="#07101b" flood-opacity="0.55"/>
    </filter>
  </defs>
  ${body}
</svg>`);
}

function panel(x, y, w, h, fill = '#2b3545', stroke = '#7f91a7') {
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${fill}" stroke="#101820" stroke-width="4" filter="url(#shadow)"/>
    <rect x="${x + 4}" y="${y + 4}" width="${w - 8}" height="${h - 8}" rx="3" fill="none" stroke="${stroke}" stroke-width="2" opacity="0.75"/>`;
}

const assets = {
  'room.berth': {
    size: [96, 96],
    body: `<rect x="0" y="0" width="96" height="96" fill="#202a38"/>
      <path d="M0 24h96M0 48h96M0 72h96M24 0v96M48 0v96M72 0v96" stroke="#344153" stroke-width="2" opacity="0.75"/>
      <rect x="12" y="12" width="72" height="72" fill="none" stroke="#f2b64f" stroke-width="5" stroke-dasharray="10 6"/>
      <rect x="30" y="28" width="36" height="40" fill="#111924" stroke="#79d5ff" stroke-width="4"/>
      <rect x="38" y="64" width="20" height="10" fill="#f2b64f"/>`
  },
  'room.cantina': {
    size: [96, 96],
    body: `<rect x="0" y="0" width="96" height="96" fill="#202837"/>
      <rect x="0" y="0" width="96" height="96" fill="none" stroke="#111722" stroke-width="4"/>
      <path d="M0 24h96M0 48h96M0 72h96M24 0v96M48 0v96M72 0v96" stroke="#314054" stroke-width="2" opacity="0.68"/>
      <path d="M0 12h96M0 60h96M12 0v96M60 0v96" stroke="#263446" stroke-width="2" opacity="0.45"/>
      <rect x="6" y="6" width="84" height="84" fill="none" stroke="#2e3d51" stroke-width="2" opacity="0.55"/>
      <rect x="36" y="44" width="24" height="8" fill="#3d2f35" opacity="0.45"/>`
  },
  'room.observatory': {
    size: [96, 96],
    body: `<rect x="0" y="0" width="96" height="96" fill="#142235"/>
      <path d="M0 24h96M0 48h96M0 72h96M24 0v96M48 0v96M72 0v96" stroke="#243a54" stroke-width="2" opacity="0.65"/>
      <path d="M0 12h96M0 60h96M12 0v96M60 0v96" stroke="#1b3047" stroke-width="2" opacity="0.45"/>
      <circle cx="48" cy="48" r="32" fill="#0b1320" stroke="#315274" stroke-width="4" opacity="0.92"/>
      <circle cx="48" cy="48" r="24" fill="none" stroke="#6fb7f4" stroke-width="2" opacity="0.55"/>
      <path d="M25 48h46M48 25v46" stroke="#253f5d" stroke-width="2" opacity="0.8"/>
      <rect x="28" y="28" width="4" height="4" fill="#d9f1ff"/>
      <rect x="66" y="34" width="3" height="3" fill="#ffe49c"/>
      <rect x="38" y="63" width="3" height="3" fill="#9fd8ff"/>
      <rect x="58" y="58" width="2" height="2" fill="#d9f1ff"/>
      <rect x="6" y="6" width="84" height="84" fill="none" stroke="#29445f" stroke-width="2" opacity="0.45"/>`
  },
  'module.gangway': {
    size: [96, 96],
    body: `${panel(20, 18, 56, 60, '#202b39', '#f2b64f')}
      <rect x="32" y="24" width="32" height="48" fill="#101720" stroke="#6fd8ff" stroke-width="4"/>
      <path d="M32 48h32M48 24v48" stroke="#f2b64f" stroke-width="4"/>`
  },
  'module.customs_counter': {
    size: [96, 96],
    body: `${panel(18, 30, 60, 36, '#30404e', '#90a9c4')}
      <rect x="28" y="38" width="24" height="18" fill="#192432"/>
      <rect x="56" y="36" width="10" height="22" fill="#6edb8f"/>
      <rect x="30" y="34" width="36" height="5" fill="#d0d8e4"/>`
  },
  'module.cargo_arm': {
    size: [128, 128],
    body: `${panel(20, 78, 88, 28, '#2b3545', '#f2b64f')}
      <rect x="28" y="84" width="18" height="16" fill="#7b8795"/>
      <path d="M44 84 L76 52 L91 62 L62 91" fill="none" stroke="#f2b64f" stroke-width="12" stroke-linejoin="miter"/>
      <rect x="84" y="54" width="22" height="18" fill="#9aa7b8" stroke="#1a2230" stroke-width="4"/>
      <rect x="94" y="70" width="8" height="24" fill="#6fd8ff"/>`
  },
  'module.fire_extinguisher': {
    size: [96, 96],
    body: `${panel(32, 18, 32, 60, '#293340', '#90a9c4')}
      <rect x="39" y="32" width="18" height="32" rx="4" fill="#df4b47" stroke="#3b1114" stroke-width="3"/>
      <rect x="42" y="24" width="12" height="10" fill="#d8e0ea"/>
      <path d="M56 30h12v10" fill="none" stroke="#d8e0ea" stroke-width="4"/>`
  },
  'module.vent': {
    size: [96, 96],
    body: `${panel(20, 20, 56, 56, '#1f2b38', '#6fd8ff')}
      <circle cx="48" cy="48" r="22" fill="#121923" stroke="#6fd8ff" stroke-width="4"/>
      <path d="M30 48h36M48 30v36M36 36l24 24M60 36L36 60" stroke="#9fdfff" stroke-width="3" opacity="0.85"/>`
  },
  'module.vending_machine': {
    size: [96, 96],
    body: `${panel(28, 14, 40, 68, '#263346', '#7da2c8')}
      <rect x="34" y="22" width="20" height="34" fill="#102238" stroke="#6fd8ff" stroke-width="3"/>
      <rect x="57" y="24" width="5" height="42" fill="#d8e0ea"/>
      <rect x="38" y="28" width="5" height="5" fill="#f8d36b"/>
      <rect x="46" y="28" width="5" height="5" fill="#6edb8f"/>
      <rect x="38" y="39" width="5" height="5" fill="#ff7a7a"/>
      <rect x="46" y="39" width="5" height="5" fill="#93c7ff"/>
      <rect x="36" y="62" width="24" height="8" fill="#111722"/>`
  },
  'module.bench': {
    size: [128, 64],
    body: `${panel(16, 18, 96, 28, '#2c3544', '#94a7bd')}
      <rect x="24" y="20" width="80" height="14" fill="#7a4d5f"/>
      <rect x="24" y="36" width="80" height="8" fill="#4b2f3b"/>
      <rect x="30" y="44" width="8" height="8" fill="#1a2230"/>
      <rect x="90" y="44" width="8" height="8" fill="#1a2230"/>`
  },
  'module.bar_counter': {
    size: [128, 64],
    body: `${panel(14, 14, 100, 36, '#31273a', '#ffb86a')}
      <rect x="22" y="22" width="84" height="16" fill="#8d5a38"/>
      <rect x="26" y="18" width="76" height="6" fill="#d18a52"/>
      <rect x="38" y="28" width="8" height="8" fill="#6fd8ff"/>
      <rect x="58" y="28" width="8" height="8" fill="#f8d36b"/>
      <rect x="78" y="28" width="8" height="8" fill="#ff7a7a"/>`
  },
  'module.tap': {
    size: [96, 96],
    body: `${panel(20, 30, 56, 36, '#2b3545', '#ffb86a')}
      <rect x="28" y="46" width="40" height="12" fill="#111722" stroke="#607089" stroke-width="3"/>
      <rect x="30" y="50" width="36" height="4" fill="#93c7ff" opacity="0.75"/>
      <rect x="30" y="34" width="8" height="14" fill="#d8e0ea"/>
      <rect x="44" y="34" width="8" height="14" fill="#d8e0ea"/>
      <rect x="58" y="34" width="8" height="14" fill="#d8e0ea"/>
      <rect x="28" y="30" width="12" height="6" fill="#f8d36b"/>
      <rect x="42" y="30" width="12" height="6" fill="#6fd8ff"/>
      <rect x="56" y="30" width="12" height="6" fill="#ff7a7a"/>`
  },
  'module.telescope': {
    size: [128, 128],
    body: `<ellipse cx="62" cy="96" rx="34" ry="13" fill="#08111d" opacity="0.55"/>
      <rect x="49" y="72" width="26" height="24" fill="#26364a" stroke="#0e1724" stroke-width="5"/>
      <path d="M61 50v54M42 108h40M52 96l-18 18M70 96l20 18" stroke="#9cadbf" stroke-width="6" stroke-linecap="square"/>
      <path d="M25 64 L80 31 L99 54 L43 86 Z" fill="#dbe8f4" stroke="#0e1724" stroke-width="6"/>
      <path d="M37 63 L79 38 L89 51 L47 76 Z" fill="#9cadbf" opacity="0.42"/>
      <rect x="80" y="31" width="24" height="23" fill="#62c8ff" stroke="#0e1724" stroke-width="5"/>
      <rect x="85" y="36" width="13" height="13" fill="#c7f1ff"/>
      <rect x="19" y="62" width="17" height="16" fill="#5d6d80" stroke="#0e1724" stroke-width="4"/>`
  },
  'module.water_fountain': {
    size: [96, 96],
    body: `${panel(30, 18, 36, 60, '#223448', '#6fd8ff')}
      <rect x="36" y="24" width="24" height="36" fill="#3d5368"/>
      <path d="M42 38c8-8 18-5 16 4" fill="none" stroke="#6fd8ff" stroke-width="4"/>
      <rect x="38" y="62" width="20" height="8" fill="#9fdfff"/>`
  },
  'module.plant': {
    size: [96, 96],
    body: `${panel(34, 54, 28, 24, '#3a2d25', '#8d6b4e')}
      <path d="M48 58 C30 42 28 26 48 38 C68 24 70 42 50 58 Z" fill="#5ac878" stroke="#17331e" stroke-width="3"/>
      <path d="M48 58 C42 38 53 22 62 38 C70 52 56 56 48 58 Z" fill="#79e08d" stroke="#17331e" stroke-width="3"/>
      <rect x="38" y="66" width="20" height="10" fill="#6b4a34"/>`
  }
};

await fs.mkdir(OUT_DIR, { recursive: true });
for (const [key, asset] of Object.entries(assets)) {
  const [width, height] = asset.size;
  const outPath = path.resolve(OUT_DIR, keyToFileName(key));
  await sharp(svg(width, height, asset.body)).png().toFile(outPath);
  console.log(`wrote ${path.relative(ROOT, outPath)}`);
}
