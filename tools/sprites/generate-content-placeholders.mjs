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
  'module.fuel_tank': {
    size: [128, 128],
    body: `${panel(16, 18, 96, 92, '#20383d', '#63f0b2')}
      <rect x="26" y="28" width="30" height="70" rx="12" fill="#284d52" stroke="#10252a" stroke-width="5"/>
      <rect x="72" y="28" width="30" height="70" rx="12" fill="#284d52" stroke="#10252a" stroke-width="5"/>
      <path d="M40 24v-8h48v8M40 102v10h48v-10" fill="none" stroke="#8aa5ad" stroke-width="6"/>
      <rect x="53" y="50" width="22" height="28" fill="#12272c" stroke="#63f0b2" stroke-width="4"/>
      <rect x="58" y="58" width="12" height="12" fill="#63f0b2"/>
      <path d="M23 44h36M69 44h36M23 84h36M69 84h36" stroke="#d3a64e" stroke-width="4"/>`
  },
  'module.fuel_pump': {
    size: [128, 64],
    body: `${panel(12, 10, 104, 44, '#26343d', '#63f0b2')}
      <rect x="22" y="18" width="42" height="30" fill="#314b52" stroke="#12242a" stroke-width="4"/>
      <rect x="30" y="24" width="20" height="10" fill="#10272d" stroke="#63f0b2" stroke-width="3"/>
      <rect x="36" y="27" width="8" height="4" fill="#ffd36a"/>
      <path d="M62 24 C82 12 98 20 98 38" fill="none" stroke="#63f0b2" stroke-width="7"/>
      <rect x="92" y="34" width="12" height="14" fill="#9aa7b8" stroke="#15202a" stroke-width="3"/>
      <path d="M18 50h92" stroke="#d3a64e" stroke-width="4" stroke-dasharray="10 6"/>`
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

// ---------------------------------------------------------------------------
// Multi-tile content fixtures (occupant loop).
//
// Each fixture is authored UNROTATED at exactly 64px per tile, on a fully
// transparent background, with >= 3px of clear margin on every edge so the
// atlas validator's border checks (opaqueRatio <= 0.5, brightOpaqueRatio
// <= 0.22) stay at zero. Everything is inset by 8px; the shared `panel()`
// drop shadow only reaches 3px past the panel bottom.
//
// The atlas is authored at 64px/tile but rasterizes to 32px/tile in game, so
// every reservable position is drawn as a chunky, clearly separated repeated
// element and variants read as silhouette / colour / frame changes.
// ---------------------------------------------------------------------------

const TILE = 64;

const CONTENT_VARIANTS = {
  base: {
    body: '#2b3545', frame: '#7f91a7', seat: '#c98a4f', counter: '#8d5a38',
    lane: '#26343d', accent: '#6fd8ff', steel: '#5c6b7d', stock: true, staff: true
  },
  active: {
    body: '#2f3f4a', frame: '#6edb8f', seat: '#e0a463', counter: '#a26a42',
    lane: '#27403a', accent: '#8ef2b4', steel: '#65808a', stock: true, staff: true
  },
  unstaffed: {
    body: '#242c37', frame: '#6c7787', seat: '#8a7256', counter: '#6a4a34',
    lane: '#212a30', accent: '#5c6a7a', steel: '#4c5865', stock: true, staff: false
  },
  empty: {
    body: '#232b38', frame: '#7f91a7', seat: '#7d6a58', counter: '#6f4c33',
    lane: '#26343d', accent: '#4d5a6b', steel: '#4f5d6b', stock: false, staff: true
  },
  dirty: {
    body: '#38382a', frame: '#9a8f5a', seat: '#9a7a4a', counter: '#6f5330',
    lane: '#31342a', accent: '#c9b46a', steel: '#5d5f45', stock: true, staff: true
  },
  damaged: {
    body: '#3a2a2c', frame: '#df4b47', seat: '#8a5a48', counter: '#6b4230',
    lane: '#33262a', accent: '#ff7a7a', steel: '#5a4448', stock: true, staff: true
  }
};

function crate(x, y, size, fill, top) {
  return `
    <rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${fill}" stroke="#1a2230" stroke-width="3"/>
    <rect x="${x + 5}" y="${y + 5}" width="${size - 10}" height="${Math.max(4, Math.round(size / 3))}" fill="${top}"/>`;
}

function seatPad(x, y, w, h, fill, accent) {
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${fill}" stroke="#141c26" stroke-width="4"/>
    <rect x="${x + 6}" y="${y + 6}" width="${w - 12}" height="${h - 12}" rx="4" fill="none" stroke="${accent}" stroke-width="3" opacity="0.85"/>`;
}

function stool(cx, cy, r, fill, accent) {
  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="#141c26" stroke-width="4"/>
    <circle cx="${cx}" cy="${cy}" r="${Math.max(4, r - 7)}" fill="none" stroke="${accent}" stroke-width="3" opacity="0.9"/>`;
}

function variantOverlay(variant, width, height) {
  if (variant === 'active') {
    const a = 14;
    const bx = Math.min(42, Math.round(width * 0.5) - 8);
    const by = Math.min(42, Math.round(height * 0.5) - 8);
    return `
    <path d="M${a} ${by} V${a} H${bx} M${width - bx} ${a} H${width - a} V${by} M${width - a} ${height - by} V${height - a} H${width - bx} M${bx} ${height - a} H${a} V${height - by}"
      fill="none" stroke="#6edb8f" stroke-width="6" stroke-linecap="square"/>`;
  }
  if (variant === 'unstaffed') {
    const x0 = Math.round(width * 0.58);
    const x1 = width - 16;
    return `
    <rect x="${x0}" y="20" width="${x1 - x0}" height="${height - 40}" fill="none" stroke="#8b93a1" stroke-width="5" stroke-dasharray="14 10"/>
    <path d="M${x0 + 6} 30 L${x1 - 6} ${height - 30} M${x1 - 6} 30 L${x0 + 6} ${height - 30}" stroke="#8b93a1" stroke-width="6" stroke-linecap="square"/>`;
  }
  if (variant === 'empty') {
    return `
    <rect x="20" y="20" width="${width - 40}" height="${height - 40}" fill="none" stroke="#5f6c7d" stroke-width="6" stroke-dasharray="18 14"/>`;
  }
  if (variant === 'dirty') {
    const count = Math.max(4, Math.min(9, Math.round((width * height) / 7000)));
    const spanX = Math.max(1, width - 56);
    const spanY = Math.max(1, height - 56);
    const blobs = [];
    for (let i = 0; i < count; i++) {
      const x = 26 + ((i * 53 + 17) % spanX);
      const y = 26 + ((i * 97 + 31) % spanY);
      const r = 9 + ((i * 5) % 5);
      blobs.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="#8f8a45" opacity="0.88"/>`);
      blobs.push(
        `<circle cx="${x + r}" cy="${y + Math.round(r * 0.6)}" r="${Math.max(5, r - 4)}" fill="#6d6a34" opacity="0.88"/>`
      );
    }
    return blobs.join('');
  }
  if (variant === 'damaged') {
    const path = `M18 ${Math.round(height * 0.28)} L${Math.round(width * 0.38)} ${Math.round(height * 0.5) - 14} L${Math.round(width * 0.56)} ${Math.round(height * 0.5) + 16} L${width - 18} ${Math.round(height * 0.72)}`;
    return `
    <path d="${path}" fill="none" stroke="#2a0d10" stroke-width="12" stroke-linejoin="miter" stroke-linecap="square"/>
    <path d="${path}" fill="none" stroke="#ff5a52" stroke-width="6" stroke-linejoin="miter" stroke-linecap="square"/>
    <rect x="${width - 46}" y="18" width="28" height="28" fill="#2a0d10" stroke="#ff5a52" stroke-width="4"/>
    <rect x="18" y="${height - 46}" width="28" height="28" fill="#2a0d10" stroke="#ff5a52" stroke-width="4"/>`;
  }
  return '';
}

const CONTENT_FIXTURES = {
  // 2x3 back-of-house shelving. Three shelf runs, nine crates. No customer side.
  'module.backroom_stock_bank': {
    tiles: [2, 3],
    variants: ['empty', 'dirty', 'damaged'],
    body: (s, w, h) => {
      const rows = [22, 78, 134];
      const shelves = rows
        .map(
          (y) => `
      <rect x="18" y="${y}" width="92" height="40" fill="#1c242f" stroke="#0f151d" stroke-width="4"/>
      <rect x="18" y="${y + 33}" width="92" height="7" fill="${s.frame}" opacity="0.6"/>`
        )
        .join('');
      const goods = s.stock
        ? rows.map((y) => [22, 54, 86].map((x) => crate(x, y + 5, 24, s.counter, s.seat)).join('')).join('')
        : '';
      return `${panel(8, 8, w - 16, h - 16, s.body, s.frame)}${shelves}${goods}`;
    }
  },
  // 2x5 bar. WEST column = four guest stools, EAST column = staff lane.
  'module.service_bar': {
    tiles: [2, 5],
    variants: ['active', 'unstaffed', 'empty', 'dirty', 'damaged'],
    body: (s, w, h) => {
      const seats = [52, 124, 196, 268];
      const counter = `
      <rect x="46" y="18" width="38" height="${h - 36}" fill="${s.counter}" stroke="#2a1a10" stroke-width="4"/>
      <rect x="46" y="18" width="10" height="${h - 36}" fill="${s.seat}" opacity="0.8"/>`;
      const lane = `
      <rect x="88" y="20" width="28" height="${h - 40}" fill="${s.lane}" stroke="#111a22" stroke-width="4"/>
      <path d="M90 60h24M90 150h24M90 240h24" stroke="${s.frame}" stroke-width="3" opacity="0.5"/>`;
      const stools = seats.map((cy) => stool(30, cy, 18, s.seat, s.accent)).join('');
      const glasses = s.stock
        ? seats
            .map(
              (cy) =>
                `<rect x="58" y="${cy - 9}" width="16" height="18" fill="${s.accent}" stroke="#141c26" stroke-width="3"/>`
            )
            .join('')
        : '';
      const staff = s.staff
        ? [64, 152, 240]
            .map(
              (y) =>
                `<rect x="92" y="${y}" width="20" height="34" rx="3" fill="${s.accent}" stroke="#141c26" stroke-width="3"/>`
            )
            .join('')
        : '';
      return `${panel(8, 8, w - 16, h - 16, s.body, s.frame)}${counter}${lane}${stools}${glasses}${staff}`;
    }
  },
  // 2x2 L-junction of the bar run. No reservable positions.
  'module.bar_corner': {
    tiles: [2, 2],
    variants: ['active', 'dirty', 'damaged'],
    body: (s, w, h) => `${panel(8, 8, w - 16, h - 16, s.body, s.frame)}
      <rect x="16" y="14" width="22" height="100" fill="${s.body}" stroke="${s.frame}" stroke-width="3" opacity="0.9"/>
      <path d="M44 14 H84 V46 H114 V86 H44 Z" fill="${s.counter}" stroke="#2a1a10" stroke-width="4"/>
      <rect x="44" y="14" width="10" height="72" fill="${s.seat}" opacity="0.85"/>
      <rect x="54" y="76" width="60" height="10" fill="${s.seat}" opacity="0.85"/>
      <rect x="90" y="14" width="24" height="26" fill="${s.lane}" stroke="#111a22" stroke-width="4"/>
      <rect x="96" y="20" width="12" height="14" fill="${s.accent}" opacity="0.9"/>
      <rect x="44" y="96" width="70" height="18" fill="${s.body}" stroke="${s.frame}" stroke-width="3" opacity="0.9"/>`
  },
  // 2x2 end cap of the bar run. No reservable positions.
  'module.bar_end': {
    tiles: [2, 2],
    variants: ['active', 'dirty', 'damaged'],
    body: (s, w, h) => `${panel(8, 8, w - 16, h - 16, s.body, s.frame)}
      <rect x="16" y="14" width="22" height="82" fill="${s.body}" stroke="${s.frame}" stroke-width="3" opacity="0.9"/>
      <rect x="44" y="14" width="40" height="80" fill="${s.counter}" stroke="#2a1a10" stroke-width="4"/>
      <rect x="36" y="92" width="56" height="20" rx="8" fill="${s.counter}" stroke="#2a1a10" stroke-width="4"/>
      <rect x="44" y="14" width="10" height="80" fill="${s.seat}" opacity="0.85"/>
      <rect x="88" y="28" width="26" height="44" fill="${s.lane}" stroke="#111a22" stroke-width="4"/>
      <path d="M90 30 L112 70" stroke="${s.accent}" stroke-width="5" stroke-linecap="square" opacity="0.9"/>`
  },
  // 2x4 booth bank. Two booths, three seat pads each = six seats.
  'module.booth_bank': {
    tiles: [2, 4],
    variants: ['active', 'dirty', 'damaged'],
    body: (s, w, h) => {
      const booth = (top) => `
      <rect x="22" y="${top}" width="84" height="44" fill="${s.counter}" stroke="#2a1a10" stroke-width="4"/>
      <rect x="28" y="${top + 6}" width="72" height="10" fill="${s.seat}" opacity="0.8"/>
      ${[24, 54, 84].map((x) => seatPad(x, top + 52, 24, 32, s.seat, s.accent)).join('')}`;
      return `${panel(8, 8, w - 16, h - 16, s.body, s.frame)}${booth(22)}
      <rect x="18" y="118" width="92" height="8" fill="${s.frame}" opacity="0.5"/>
      ${booth(138)}`;
    }
  },
  // 1x4 standing rail. Four standing pads beside a continuous rail.
  'module.standing_rail': {
    tiles: [1, 4],
    variants: ['active', 'dirty'],
    body: (s, w, h) => {
      const pads = [26, 84, 142, 200].map((y) => seatPad(12, y, 24, 34, s.seat, s.accent)).join('');
      const rail = `
      <rect x="42" y="18" width="10" height="${h - 36}" fill="#9aa7b8" stroke="#141c26" stroke-width="3"/>
      <path d="M42 60h10M42 120h10M42 180h10" stroke="${s.accent}" stroke-width="3" opacity="0.8"/>`;
      return `${panel(8, 8, w - 16, h - 16, s.body, s.frame)}${pads}${rail}`;
    }
  },
  // 2x5 cafeteria serving line. WEST = three meal pickup slots, EAST = staff lane.
  'module.serving_line': {
    tiles: [2, 5],
    variants: ['active', 'unstaffed', 'empty', 'dirty', 'damaged'],
    body: (s, w, h) => {
      const slots = [46, 132, 218];
      const pads = slots.map((y) => seatPad(14, y, 30, 56, '#7f93a8', s.accent)).join('');
      const counter = `
      <rect x="48" y="18" width="38" height="${h - 36}" fill="${s.steel}" stroke="#1b2530" stroke-width="4"/>
      <rect x="48" y="18" width="10" height="${h - 36}" fill="${s.frame}" opacity="0.55"/>`;
      const meals = s.stock
        ? slots
            .map(
              (y) =>
                `<rect x="56" y="${y + 14}" width="26" height="26" fill="${s.accent}" stroke="#141c26" stroke-width="3"/>`
            )
            .join('')
        : '';
      const lane = `
      <rect x="92" y="20" width="24" height="${h - 40}" fill="${s.lane}" stroke="#111a22" stroke-width="4"/>`;
      const staff = s.staff
        ? [70, 155, 240]
            .map(
              (y) =>
                `<rect x="95" y="${y}" width="18" height="32" rx="3" fill="${s.accent}" stroke="#141c26" stroke-width="3"/>`
            )
            .join('')
        : '';
      return `${panel(8, 8, w - 16, h - 16, s.body, s.frame)}${counter}${lane}${pads}${meals}${staff}`;
    }
  },
  // 3x4 community table. Four seats WEST, four seats EAST, table core centred.
  'module.community_table': {
    tiles: [3, 4],
    variants: ['active', 'dirty', 'damaged'],
    body: (s, w, h) => {
      const rows = [26, 82, 138, 194];
      const west = rows.map((y) => seatPad(16, y, 38, 44, s.seat, s.accent)).join('');
      const east = rows.map((y) => seatPad(138, y, 38, 44, s.seat, s.accent)).join('');
      const table = `
      <rect x="66" y="20" width="60" height="${h - 40}" fill="${s.counter}" stroke="#2a1a10" stroke-width="4"/>
      <rect x="72" y="26" width="48" height="${h - 52}" fill="none" stroke="${s.seat}" stroke-width="3" opacity="0.7"/>`;
      return `${panel(8, 8, w - 16, h - 16, s.body, s.frame)}${table}${west}${east}`;
    }
  },
  // 3x4 private guest cabin with exactly two beds.
  'module.guest_cabin': {
    tiles: [3, 4],
    variants: ['active', 'dirty'],
    body: (s, w, h) => {
      const bed = (x) => `
      <rect x="${x}" y="30" width="62" height="112" rx="6" fill="${s.seat}" stroke="#141c26" stroke-width="4"/>
      <rect x="${x + 8}" y="38" width="46" height="26" fill="#c8d3e2"/>
      <rect x="${x + 8}" y="74" width="46" height="60" fill="none" stroke="${s.accent}" stroke-width="3" opacity="0.8"/>`;
      return `${panel(8, 8, w - 16, h - 16, s.body, s.frame)}
      <rect x="18" y="18" width="${w - 36}" height="${h - 36}" fill="#1b2430" stroke="#0f151d" stroke-width="3"/>
      ${bed(26)}${bed(104)}
      <rect x="26" y="158" width="46" height="38" fill="${s.counter}" stroke="#1a2230" stroke-width="4"/>
      <rect x="96" y="158" width="70" height="38" fill="${s.steel}" stroke="#1b2530" stroke-width="4"/>
      <rect x="76" y="212" width="40" height="18" fill="${s.accent}" stroke="#141c26" stroke-width="3"/>`;
    }
  },
  // 2x4 arrival desk. WEST = two customer slots, EAST = two staff processors.
  'module.arrival_desk': {
    tiles: [2, 4],
    variants: ['active', 'unstaffed', 'dirty'],
    body: (s, w, h) => {
      const rows = [36, 140];
      const desk = `
      <rect x="48" y="18" width="34" height="${h - 36}" fill="${s.steel}" stroke="#1b2530" stroke-width="4"/>
      <rect x="48" y="18" width="9" height="${h - 36}" fill="${s.frame}" opacity="0.55"/>`;
      const customers = rows
        .map(
          (y) => `${seatPad(14, y, 30, 84, '#3c4d61', s.accent)}
      <path d="M20 ${y + 30}h18M20 ${y + 50}h18" stroke="${s.accent}" stroke-width="4" opacity="0.85"/>`
        )
        .join('');
      const staff = rows
        .map(
          (y) => `
      <rect x="86" y="${y}" width="30" height="84" rx="5" fill="${s.lane}" stroke="#141c26" stroke-width="4"/>
      ${s.staff ? `<rect x="92" y="${y + 10}" width="18" height="28" fill="${s.accent}" stroke="#141c26" stroke-width="3"/>
      <rect x="92" y="${y + 48}" width="18" height="26" rx="4" fill="${s.seat}" stroke="#141c26" stroke-width="3"/>` : ''}`
        )
        .join('');
      return `${panel(8, 8, w - 16, h - 16, s.body, s.frame)}${desk}${customers}${staff}`;
    }
  },
  // 2x5 wash bank. Four basins along the WEST column, plumbing spine EAST.
  'module.wash_bank': {
    tiles: [2, 5],
    variants: ['active', 'dirty', 'damaged'],
    body: (s, w, h) => {
      const rows = [32, 104, 176, 248];
      const basins = rows
        .map(
          (y) => `
      <rect x="16" y="${y}" width="46" height="56" rx="8" fill="#3d5368" stroke="#141c26" stroke-width="4"/>
      <rect x="24" y="${y + 12}" width="30" height="30" rx="4" fill="${s.accent}" opacity="0.85"/>
      <rect x="34" y="${y - 2}" width="10" height="14" fill="#9aa7b8" stroke="#141c26" stroke-width="3"/>`
        )
        .join('');
      const spine = `
      <rect x="92" y="20" width="18" height="${h - 40}" fill="#7b8795" stroke="#141c26" stroke-width="4"/>`;
      const branches = rows
        .map(
          (y) => `
      <rect x="62" y="${y + 22}" width="32" height="10" fill="#7b8795" stroke="#141c26" stroke-width="3"/>
      <circle cx="101" cy="${y + 27}" r="8" fill="${s.accent}" stroke="#141c26" stroke-width="3"/>`
        )
        .join('');
      return `${panel(8, 8, w - 16, h - 16, s.body, s.frame)}${spine}${branches}${basins}`;
    }
  }
};

for (const [key, fixture] of Object.entries(CONTENT_FIXTURES)) {
  const width = fixture.tiles[0] * TILE;
  const height = fixture.tiles[1] * TILE;
  for (const variant of ['base', ...fixture.variants]) {
    const style = CONTENT_VARIANTS[variant];
    if (!style) throw new Error(`Unknown content variant: ${variant}`);
    const assetKey = variant === 'base' ? key : `${key}.${variant}`;
    assets[assetKey] = {
      size: [width, height],
      body: `${fixture.body(style, width, height)}${variantOverlay(variant, width, height)}`
    };
  }
}

await fs.mkdir(OUT_DIR, { recursive: true });
for (const [key, asset] of Object.entries(assets)) {
  const [width, height] = asset.size;
  const outPath = path.resolve(OUT_DIR, keyToFileName(key));
  await sharp(svg(width, height, asset.body)).png().toFile(outPath);
  console.log(`wrote ${path.relative(ROOT, outPath)}`);
}
