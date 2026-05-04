import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const CURATED_DIR = path.resolve(ROOT, 'tools/sprites/curated');

function keyToFileName(key) {
  return `${key.replace(/[^a-zA-Z0-9]+/g, '_')}.png`;
}

function parseArgs(argv) {
  const args = { source: '/Users/ryan.boye/Downloads/sprites.png' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--source') args.source = argv[++i];
  }
  return args;
}

function rectFromCenter(cx, cy, w, h) {
  return {
    left: Math.round(cx - w / 2),
    top: Math.round(cy - h / 2),
    width: Math.round(w),
    height: Math.round(h)
  };
}

function rgbaDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

async function removeFloodBackground(buffer, tolerance = 42) {
  const image = sharp(buffer).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const seen = new Uint8Array(width * height);
  const queue = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (seen[idx]) return;
    seen[idx] = 1;
    queue.push(idx);
  };
  const sample = (idx) => {
    const off = idx * 4;
    return [data[off], data[off + 1], data[off + 2]];
  };
  const anchors = [
    sample(0),
    sample(width - 1),
    sample((height - 1) * width),
    sample(width * height - 1)
  ];
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  for (let q = 0; q < queue.length; q++) {
    const idx = queue[q];
    const color = sample(idx);
    if (!anchors.some((anchor) => rgbaDistance(color, anchor) <= tolerance)) continue;
    const off = idx * 4;
    data[off + 3] = 0;
    const x = idx % width;
    const y = Math.floor(idx / width);
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  return sharp(data, { raw: { width, height, channels: 4 } })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
    .extend({ top: 6, bottom: 6, left: 6, right: 6, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

const actor = (key, cx, cy) => ({
  key,
  rect: rectFromCenter(cx, cy, 76, 92),
  output: { width: 96, height: 96 }
});

const terminal = (key, cx, cy) => ({
  key,
  rect: rectFromCenter(cx, cy, 154, 106),
  output: { width: 128, height: 96 }
});

const crops = [
  actor('agent.visitor.1', 50, 96),
  actor('agent.visitor.2', 118, 96),
  actor('agent.visitor.3', 185, 96),
  actor('agent.visitor.4', 252, 96),
  actor('agent.visitor.5', 320, 96),
  actor('agent.visitor.6', 432, 96),
  actor('agent.resident.1', 535, 240),
  actor('agent.resident.2', 617, 240),
  actor('agent.resident.3', 700, 240),
  actor('agent.resident.4', 775, 240),
  actor('agent.resident.5', 851, 240),
  actor('agent.resident.6', 1097, 96),
  actor('agent.crew.1', 779, 570),
  actor('agent.crew.2', 231, 570),
  actor('agent.crew.3', 397, 570),
  actor('agent.crew.4', 704, 570),
  actor('agent.crew.5', 1233, 570),
  actor('agent.crew.6', 61, 386),
  actor('agent.crew.captain', 61, 386),
  actor('agent.crew.sanitation_officer', 166, 386),
  actor('agent.crew.security_officer', 271, 386),
  actor('agent.crew.mechanic_officer', 376, 386),
  actor('agent.crew.industrial_officer', 482, 386),
  actor('agent.crew.navigation_officer', 588, 386),
  actor('agent.crew.comms_officer', 693, 386),
  actor('agent.crew.medical_officer', 798, 386),
  actor('agent.crew.eva_suit', 923, 386),
  actor('agent.crew.eva_specialist', 923, 386),
  actor('agent.crew.eva_engineer', 1029, 386),
  actor('agent.crew.flight_controller', 1353, 386),
  actor('agent.crew.docking_officer', 1458, 386),
  actor('agent.crew.doctor', 60, 570),
  actor('agent.crew.nurse', 145, 570),
  actor('agent.crew.cook', 231, 570),
  actor('agent.crew.cleaner', 397, 570),
  actor('agent.crew.janitor', 481, 570),
  actor('agent.crew.botanist', 555, 570),
  actor('agent.crew.technician', 704, 570),
  actor('agent.crew.assistant', 779, 570),
  actor('agent.crew.security_guard', 913, 570),
  actor('agent.crew.maintenance_tech', 1127, 570),
  actor('agent.crew.engineer', 1233, 570),
  actor('agent.crew.mechanic', 1340, 570),
  actor('agent.crew.welder', 1445, 570),
  terminal('module.bridge.captain_console', 112, 744),
  terminal('module.bridge.sanitation_terminal', 270, 744),
  terminal('module.bridge.security_terminal', 425, 744),
  terminal('module.bridge.mechanical_terminal', 582, 744),
  terminal('module.bridge.industrial_terminal', 736, 744),
  terminal('module.bridge.navigation_terminal', 889, 744),
  terminal('module.bridge.comms_terminal', 1043, 744),
  terminal('module.bridge.medical_terminal', 1198, 744),
  terminal('module.bridge.research_terminal', 1350, 744),
  terminal('module.bridge.logistics_terminal', 1490, 744),
  terminal('module.bridge.fleet_command_terminal', 96, 899),
  terminal('module.bridge.traffic_control_terminal', 252, 899),
  terminal('module.bridge.resource_management_terminal', 409, 899),
  terminal('module.bridge.power_management_terminal', 562, 899),
  terminal('module.bridge.life_support_terminal', 718, 899),
  terminal('module.bridge.atmosphere_control_terminal', 874, 899),
  terminal('module.bridge.ai_core_terminal', 1027, 899),
  terminal('module.bridge.communications_array_terminal', 1185, 899),
  terminal('module.bridge.emergency_control_terminal', 1337, 899),
  terminal('module.bridge.records_terminal', 1488, 899)
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = path.resolve(args.source.replace(/^~(?=$|\/)/, process.env.HOME ?? ''));
  await fs.mkdir(CURATED_DIR, { recursive: true });
  const meta = await sharp(source).metadata();
  if (meta.width !== 1536 || meta.height !== 1024) {
    console.warn(`[import-command-sheet] expected 1536x1024, got ${meta.width}x${meta.height}; continuing with fixed crop map.`);
  }

  let written = 0;
  for (const crop of crops) {
    const rect = {
      left: Math.max(0, Math.min(crop.rect.left, (meta.width ?? 0) - crop.rect.width)),
      top: Math.max(0, Math.min(crop.rect.top, (meta.height ?? 0) - crop.rect.height)),
      width: Math.min(crop.rect.width, meta.width ?? crop.rect.width),
      height: Math.min(crop.rect.height, meta.height ?? crop.rect.height)
    };
    const extracted = await sharp(source).extract(rect).png().toBuffer();
    const transparent = await removeFloodBackground(extracted);
    const finalImage = await sharp(transparent)
      .resize(crop.output.width, crop.output.height, { fit: 'contain', kernel: 'lanczos3', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    await fs.writeFile(path.join(CURATED_DIR, keyToFileName(crop.key)), finalImage);
    written += 1;
  }
  console.log(`[import-command-sheet] wrote ${written} sprites from ${source}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
