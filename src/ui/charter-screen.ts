// Charter selection screen — a self-contained full-screen overlay shown at
// new-game time behind ?charter=1. The player surveys the procedurally
// generated star system and clicks a location to charter their station.
//
// This module owns everything it renders: its own canvas, DOM, and injected
// styles. It reads the system geometry from generateSystemMap(seed) and turns
// the cursor into a survey probe — a live side panel that describes the
// hovered position via computeSiteProfile using the comparative band
// vocabulary the tile inspector already speaks (see src/sim/map-conditions.ts:
// "bright sun / mixed light / deep shade", "heavy debris / sheltered"), never
// raw numbers. A click selects; Confirm charters. "Recommended charter"
// applies a fixed sensible default.
//
// It introduces no tick-path systems and, being opt-in, leaves default
// startup byte-for-byte unchanged.

import { computeSiteProfile } from '../sim/site-charter';
import type { LaneRoute, SiteCharter, SpaceLane, SystemMap } from '../sim/types';

// --- Comparative band vocabulary (mirrors map-conditions.ts thresholds) ------

function sunBand(sunFactor: number): string {
  if (sunFactor >= 0.72) return 'bright sun';
  if (sunFactor >= 0.42) return 'mixed light';
  return 'deep shade';
}

function debrisBand(debrisFactor: number): string {
  if (debrisFactor >= 0.72) return 'heavy debris';
  if (debrisFactor >= 0.42) return 'debris exposed';
  return 'sheltered space';
}

// Traffic reads off the busiest lane at the site. Floors are the ambient
// viability guarantee; a hot route lifts a lane toward ~2.5x.
function trafficBand(peakLane: number): string {
  if (peakLane >= 1.6) return 'busy lanes';
  if (peakLane >= 1.05) return 'steady traffic';
  return 'quiet approach';
}

function resourceLabel(resourceType: SiteCharter['resourceType']): string {
  if (resourceType === 'metal') return 'metal-rich belt';
  if (resourceType === 'ice') return 'ice-rich belt';
  if (resourceType === 'gas') return 'gas-rich belt';
  return 'open space';
}

// A fixed, sensible default charter: a mid-inner position with balanced sun,
// modest belt exposure and steady lanes — the "Recommended charter" anchor.
const RECOMMENDED_POS = { x: 0.5, y: 0.34 };

const DEBRIS_PALETTE: Record<NonNullable<SiteCharter['resourceType']>, string> = {
  metal: '#9c8b7a',
  ice: '#a9d3e6',
  gas: '#e0b063'
};

// --- Styling (injected, so the module stays self-contained) ------------------

const STYLE_ID = 'charter-screen-styles';
const STYLE_TEXT = `
#charter-screen {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  flex-direction: row;
  background: radial-gradient(circle at 30% 20%, #182430 0%, #0c1017 60%, #080b10 100%);
  color: #d6deeb;
  font-family: Consolas, Menlo, Monaco, monospace;
}
#charter-screen.charter-hidden { display: none; }
#charter-screen .charter-stage {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
}
#charter-screen canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: crosshair;
}
#charter-screen .charter-panel {
  flex: 0 0 320px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px 20px;
  background: linear-gradient(180deg, #1b2430 0%, #141d29 100%);
  border-left: 1px solid #2c3a4d;
  overflow-y: auto;
}
#charter-screen h1 {
  margin: 0;
  font-size: 18px;
  letter-spacing: 0.04em;
  color: #d6deeb;
}
#charter-screen .charter-kicker {
  margin: 0;
  font-size: 12px;
  color: #8ea2bd;
  line-height: 1.5;
}
#charter-screen .charter-survey {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  background: #223041;
  border: 1px solid #2c3a4d;
  border-radius: 6px;
}
#charter-screen .charter-survey-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #8ea2bd;
}
#charter-screen .charter-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  font-size: 13px;
}
#charter-screen .charter-row span:first-child { color: #8ea2bd; }
#charter-screen .charter-row span:last-child { color: #d6deeb; text-align: right; }
#charter-screen .charter-hint {
  font-size: 11px;
  color: #8ea2bd;
  line-height: 1.5;
  min-height: 1.5em;
}
#charter-screen .charter-buttons {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
#charter-screen button {
  font-family: inherit;
  font-size: 13px;
  padding: 11px 14px;
  border-radius: 6px;
  border: 1px solid #2c3a4d;
  background: #223041;
  color: #d6deeb;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
}
#charter-screen button:hover { background: #2a3a4e; border-color: #3d5069; }
#charter-screen button.charter-primary {
  background: #2f5d43;
  border-color: #3f7a58;
  color: #eafbf0;
}
#charter-screen button.charter-primary:hover { background: #367049; }
#charter-screen button.charter-primary:disabled {
  background: #1e2a24;
  border-color: #26362d;
  color: #6b8478;
  cursor: not-allowed;
}
`;

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const styleEl = document.createElement('style');
  styleEl.id = STYLE_ID;
  styleEl.textContent = STYLE_TEXT;
  document.head.appendChild(styleEl);
}

// --- Rendering ---------------------------------------------------------------

// Gate positions are the outer endpoint of each 'gate-*' route polyline.
function gatePoints(routes: LaneRoute[]): Array<{ x: number; y: number }> {
  const gates: Array<{ x: number; y: number }> = [];
  for (const route of routes) {
    if (route.from.startsWith('gate-') && route.points.length > 0) {
      gates.push(route.points[0]);
    }
  }
  return gates;
}

function beltColor(resourceType: SystemMap['asteroidBelts'][number]['resourceType']): string {
  return DEBRIS_PALETTE[resourceType] ?? '#8ea2bd';
}

interface DiscTransform {
  cx: number;
  cy: number;
  radius: number;
}

// Map disc coords (0..1, center 0.5,0.5) to canvas pixels.
function discToPx(t: DiscTransform, x: number, y: number): { px: number; py: number } {
  return {
    px: t.cx + (x - 0.5) * 2 * t.radius,
    py: t.cy + (y - 0.5) * 2 * t.radius
  };
}

// Invert: canvas pixels → disc coords.
function pxToDisc(t: DiscTransform, px: number, py: number): { x: number; y: number } {
  return {
    x: 0.5 + (px - t.cx) / (2 * t.radius),
    y: 0.5 + (py - t.cy) / (2 * t.radius)
  };
}

function drawSystem(
  ctx: CanvasRenderingContext2D,
  system: SystemMap,
  t: DiscTransform,
  hover: { x: number; y: number } | null,
  selected: { x: number; y: number } | null
): void {
  const routes = system.laneRoutes ?? [];

  // Belt annuli, colored by resourceType.
  for (const belt of system.asteroidBelts) {
    const inner = belt.innerRadius * t.radius;
    const outer = belt.outerRadius * t.radius;
    ctx.beginPath();
    ctx.arc(t.cx, t.cy, outer, 0, Math.PI * 2);
    ctx.arc(t.cx, t.cy, inner, 0, Math.PI * 2, true);
    ctx.fillStyle = beltColor(belt.resourceType);
    ctx.globalAlpha = 0.16;
    ctx.fill('evenodd');
    ctx.globalAlpha = 1;
  }

  // Planet orbit rings.
  ctx.strokeStyle = 'rgba(142,162,189,0.18)';
  ctx.lineWidth = 1;
  for (const planet of system.planets) {
    ctx.beginPath();
    ctx.arc(t.cx, t.cy, planet.orbitRadius * t.radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Lane routes — polylines, opacity scaled by volume.
  for (const route of routes) {
    if (route.points.length < 2) continue;
    ctx.beginPath();
    const start = discToPx(t, route.points[0].x, route.points[0].y);
    ctx.moveTo(start.px, start.py);
    for (let i = 1; i < route.points.length; i++) {
      const p = discToPx(t, route.points[i].x, route.points[i].y);
      ctx.lineTo(p.px, p.py);
    }
    ctx.strokeStyle = `rgba(245,185,74,${0.25 + route.volume * 0.5})`;
    ctx.lineWidth = 1 + route.volume * 2;
    ctx.stroke();
  }

  // Gates — small diamonds at the outer route endpoints.
  ctx.fillStyle = '#77cfaa';
  for (const g of gatePoints(routes)) {
    const p = discToPx(t, g.x, g.y);
    ctx.save();
    ctx.translate(p.px, p.py);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();
  }

  // Planets.
  for (const planet of system.planets) {
    const angle = planet.orbitAngle;
    const pos = {
      x: 0.5 + planet.orbitRadius * 0.5 * Math.cos(angle),
      y: 0.5 + planet.orbitRadius * 0.5 * Math.sin(angle)
    };
    const p = discToPx(t, pos.x, pos.y);
    const bodyColor =
      planet.bodyType === 'gas' ? '#c8a15a' : planet.bodyType === 'ice' ? '#a9d3e6' : '#9c8b7a';
    ctx.beginPath();
    ctx.arc(p.px, p.py, 6, 0, Math.PI * 2);
    ctx.fillStyle = bodyColor;
    ctx.fill();
  }

  // Sun at center.
  const sunGrad = ctx.createRadialGradient(t.cx, t.cy, 2, t.cx, t.cy, 26);
  sunGrad.addColorStop(0, '#fff2c4');
  sunGrad.addColorStop(0.5, '#ffcf6e');
  sunGrad.addColorStop(1, 'rgba(255,207,110,0)');
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(t.cx, t.cy, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff2c4';
  ctx.beginPath();
  ctx.arc(t.cx, t.cy, 9, 0, Math.PI * 2);
  ctx.fill();

  // Selected marker (steady) then hover probe (crosshair).
  if (selected) {
    const p = discToPx(t, selected.x, selected.y);
    ctx.strokeStyle = '#6edb8f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.px, p.py, 10, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (hover) {
    const p = discToPx(t, hover.x, hover.y);
    ctx.strokeStyle = 'rgba(214,222,235,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.px - 8, p.py);
    ctx.lineTo(p.px + 8, p.py);
    ctx.moveTo(p.px, p.py - 8);
    ctx.lineTo(p.px, p.py + 8);
    ctx.stroke();
  }
}

// --- Public entry ------------------------------------------------------------

/**
 * Mount the charter selection overlay. Resolves with the chosen SiteCharter
 * once the player confirms (via click-then-Confirm or "Recommended charter").
 * The overlay removes itself before resolving.
 */
export function mountCharterScreen(seed: number, system: SystemMap): Promise<SiteCharter> {
  ensureStyles();

  const root = document.createElement('div');
  root.id = 'charter-screen';
  root.innerHTML = `
    <div class="charter-stage">
      <canvas></canvas>
    </div>
    <div class="charter-panel">
      <h1>Charter your station</h1>
      <p class="charter-kicker">
        Survey the system and choose where to plant your station. Sunward runs
        hot but energy-rich; beltward is abrasive but resource-flavored; busy
        lanes bring more ships. Every site is viable — location grants pressures
        and bonuses, never survival.
      </p>
      <div class="charter-survey">
        <div class="charter-survey-title">Survey probe</div>
        <div class="charter-row"><span>Sun</span><span data-field="sun">—</span></div>
        <div class="charter-row"><span>Debris</span><span data-field="debris">—</span></div>
        <div class="charter-row"><span>Resource</span><span data-field="resource">—</span></div>
        <div class="charter-row"><span>Traffic</span><span data-field="traffic">—</span></div>
      </div>
      <div class="charter-hint" data-field="hint">Hover the map to survey. Click to select a site.</div>
      <div class="charter-buttons">
        <button type="button" class="charter-recommended">Recommended charter</button>
        <button type="button" class="charter-primary" disabled>Confirm charter</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const stage = root.querySelector<HTMLDivElement>('.charter-stage')!;
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const confirmBtn = root.querySelector<HTMLButtonElement>('.charter-primary')!;
  const recommendedBtn = root.querySelector<HTMLButtonElement>('.charter-recommended')!;
  const fieldSun = root.querySelector<HTMLElement>('[data-field="sun"]')!;
  const fieldDebris = root.querySelector<HTMLElement>('[data-field="debris"]')!;
  const fieldResource = root.querySelector<HTMLElement>('[data-field="resource"]')!;
  const fieldTraffic = root.querySelector<HTMLElement>('[data-field="traffic"]')!;
  const fieldHint = root.querySelector<HTMLElement>('[data-field="hint"]')!;

  let transform: DiscTransform = { cx: 0, cy: 0, radius: 1 };
  let hover: { x: number; y: number } | null = null;
  let selected: { x: number; y: number } | null = null;

  function resize(): void {
    const rect = stage.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width;
    const h = rect.height;
    transform = { cx: w / 2, cy: h / 2, radius: Math.min(w, h) * 0.44 };
    draw();
  }

  function draw(): void {
    const rect = stage.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    drawSystem(ctx, system, transform, hover, selected);
  }

  function updateSurvey(pos: { x: number; y: number } | null): void {
    if (!pos) {
      fieldSun.textContent = '—';
      fieldDebris.textContent = '—';
      fieldResource.textContent = '—';
      fieldTraffic.textContent = '—';
      return;
    }
    const profile = computeSiteProfile(system, pos.x, pos.y);
    const lanes: SpaceLane[] = ['north', 'east', 'south', 'west'];
    const peakLane = Math.max(...lanes.map((l) => profile.laneTrafficFactor[l]));
    fieldSun.textContent = sunBand(profile.sunFactor);
    fieldDebris.textContent = debrisBand(profile.debrisFactor);
    fieldResource.textContent = resourceLabel(profile.resourceType);
    fieldTraffic.textContent = trafficBand(peakLane);
  }

  function cleanupAndResolve(profile: SiteCharter): void {
    window.removeEventListener('resize', resize);
    root.remove();
    resolveFn(profile);
  }

  let resolveFn!: (profile: SiteCharter) => void;
  const promise = new Promise<SiteCharter>((resolve) => {
    resolveFn = resolve;
  });

  canvas.addEventListener('mousemove', (ev) => {
    const rect = canvas.getBoundingClientRect();
    const disc = pxToDisc(transform, ev.clientX - rect.left, ev.clientY - rect.top);
    disc.x = Math.max(0, Math.min(1, disc.x));
    disc.y = Math.max(0, Math.min(1, disc.y));
    hover = disc;
    updateSurvey(disc);
    draw();
  });

  canvas.addEventListener('mouseleave', () => {
    hover = null;
    updateSurvey(selected);
    draw();
  });

  canvas.addEventListener('click', (ev) => {
    const rect = canvas.getBoundingClientRect();
    const disc = pxToDisc(transform, ev.clientX - rect.left, ev.clientY - rect.top);
    disc.x = Math.max(0, Math.min(1, disc.x));
    disc.y = Math.max(0, Math.min(1, disc.y));
    selected = disc;
    updateSurvey(disc);
    confirmBtn.disabled = false;
    fieldHint.textContent = 'Site selected. Confirm to charter here, or pick another spot.';
    draw();
  });

  confirmBtn.addEventListener('click', () => {
    if (!selected) return;
    cleanupAndResolve(computeSiteProfile(system, selected.x, selected.y));
  });

  recommendedBtn.addEventListener('click', () => {
    cleanupAndResolve(computeSiteProfile(system, RECOMMENDED_POS.x, RECOMMENDED_POS.y));
  });

  window.addEventListener('resize', resize);
  // Defer initial sizing until the element is laid out.
  requestAnimationFrame(resize);

  return promise;
}
