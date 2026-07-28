// A self-contained spatial charter map. System geometry remains owned by the
// simulation; this module only gives that geometry a readable, tactile view.

import {
  CHARTER_LEVEL_LABEL,
  CHARTER_RESOURCE_LABEL,
  CHARTER_TRAFFIC_LABEL,
  charterLevelBand,
  charterTrafficBand,
  computeCharterOperatingForecast,
  computeSiteProfile,
  type CharterOperatingForecast
} from '../sim/site-charter';
import type { LaneRoute, SiteCharter, SpaceLane, SystemMap } from '../sim/types';

export interface CharterScreenOptions {
  allowCancel?: boolean;
}

type Point = { x: number; y: number };
type HoverKind = 'planet' | 'gate' | 'outpost' | 'belt' | 'route' | null;

interface DiscTransform {
  cx: number;
  cy: number;
  radiusX: number;
  radius: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  alpha: number;
  phase: number;
}

interface BeltParticle {
  radius: number;
  angle: number;
  size: number;
  alpha: number;
}

interface Landmark {
  id: string;
  label: string;
  position: Point;
}

interface HoverTarget {
  kind: HoverKind;
  id: string | null;
}

const STYLE_ID = 'charter-screen-styles';
const RECOMMENDED_POS: Point = { x: 0.5, y: 0.34 };
const LANES: SpaceLane[] = ['north', 'east', 'south', 'west'];
const THERMAL_BANDS: Array<[number, number, string]> = [
  [0.11, 0.27, 'rgba(216, 82, 37, 0.14)'],
  [0.27, 0.43, 'rgba(223, 171, 57, 0.12)'],
  [0.43, 0.62, 'rgba(104, 160, 88, 0.12)'],
  [0.62, 0.84, 'rgba(55, 126, 170, 0.08)']
];

const BODY_COLORS: Record<SystemMap['planets'][number]['bodyType'], [string, string]> = {
  rocky: ['#bd7048', '#43231d'],
  gas: ['#e3b176', '#604333'],
  ice: ['#c9e7f0', '#45697e']
};

const BELT_COLORS: Record<SystemMap['asteroidBelts'][number]['resourceType'], string> = {
  metal: '#d3ae82',
  ice: '#b9ddea',
  gas: '#d8b16e'
};

const STYLE_TEXT = `
#charter-screen {
  position: fixed;
  inset: 0;
  z-index: 60;
  overflow: hidden;
  background: #03070b;
  color: #dbe7ef;
  font-family: Consolas, Menlo, Monaco, monospace;
}
#charter-screen canvas { display: block; width: 100%; height: 100%; cursor: crosshair; }
#charter-screen .charter-header,
#charter-screen .charter-legend,
#charter-screen .charter-actions,
#charter-screen .charter-tooltip {
  position: absolute;
  box-sizing: border-box;
  text-shadow: 0 1px 8px #000;
}
#charter-screen .charter-header { top: 28px; left: 36px; max-width: min(440px, calc(100vw - 72px)); }
#charter-screen h1 { margin: 0; font-size: 22px; font-weight: 500; letter-spacing: 0.12em; line-height: 1.1; }
#charter-screen .charter-header p { margin: 8px 0 0; color: #a9b9c5; font-size: 12px; line-height: 1.45; }
#charter-screen .charter-legend {
  bottom: 28px;
  left: 36px;
  display: grid;
  grid-template-columns: auto auto;
  gap: 8px 22px;
  padding: 13px 15px;
  border: 1px solid rgba(133, 163, 183, 0.42);
  background: rgba(7, 15, 23, 0.76);
  font-size: 10px;
  color: #b9c6d0;
  pointer-events: none;
}
#charter-screen .charter-key { display: flex; align-items: center; gap: 8px; white-space: nowrap; }
#charter-screen .key-dot, #charter-screen .key-line, #charter-screen .key-gate { display: inline-block; flex: 0 0 auto; }
#charter-screen .key-dot { width: 10px; height: 10px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.55); }
#charter-screen .key-hot { background: #a95b37; } #charter-screen .key-warm { background: #c59c4c; }
#charter-screen .key-hab { background: #6f9d57; } #charter-screen .key-cold { background: #4384a7; }
#charter-screen .key-line { width: 19px; height: 2px; background: #72d5bb; box-shadow: 0 0 7px #72d5bb; }
#charter-screen .key-gate { width: 11px; height: 11px; border: 1px solid #9ac9ff; transform: rotate(45deg); }
/* Bottom-anchored stack: Back, then the site reading, then the two commit
   controls. The reading is a normal grid row (never an overlay), so it can
   never sit beneath Back or Recommend. */
#charter-screen .charter-actions { right: 28px; bottom: 24px; width: min(348px, calc(100vw - 56px)); display: grid; gap: 8px; }
#charter-screen .charter-selection {
  display: grid;
  gap: 5px;
  min-height: 58px;
  max-height: min(52vh, 430px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 9px 11px;
  border: 1px solid rgba(126, 158, 177, 0.38);
  background: rgba(5, 13, 20, 0.78);
  color: #9fb0bb;
  font-size: 10px;
  line-height: 1.35;
}
#charter-screen .charter-selection strong { color: #f0d38d; font-size: 11px; }
#charter-screen .charter-selection span { color: #c7d7df; }
#charter-screen .charter-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
#charter-screen .charter-chip {
  padding: 2px 5px;
  border: 1px solid rgba(99, 132, 151, 0.5);
  border-radius: 3px;
  color: #bccbd3;
  font-size: 9px;
  line-height: 1.3;
}
#charter-screen .charter-chip b { color: #e4edf0; }
#charter-screen .charter-chip.good { border-color: rgba(89, 190, 137, 0.6); color: #a5dbbe; }
#charter-screen .charter-chip.warn { border-color: rgba(232, 174, 73, 0.66); color: #edca8a; }
#charter-screen .charter-lines { display: grid; gap: 3px; margin-top: 3px; }
#charter-screen .charter-lines p { margin: 0; color: #a9bac4; font-size: 9px; line-height: 1.4; }
#charter-screen .charter-lines .charter-composition { color: #b9d7d0; }
#charter-screen .charter-lines .charter-composition b { color: #f0d38d; font-weight: 500; }
#charter-screen .charter-advice { margin-top: 4px; }
#charter-screen .charter-advice em { display: block; color: #90a5b1; font-size: 9px; font-style: normal; letter-spacing: 0.08em; text-transform: uppercase; }
#charter-screen .charter-advice ul { margin: 3px 0 0; padding-left: 13px; display: grid; gap: 3px; }
#charter-screen .charter-advice li { color: #b6c6cf; font-size: 9px; line-height: 1.4; }
#charter-screen .charter-advice li b { color: #f0d38d; font-weight: 500; }
#charter-screen .charter-viability { margin: 5px 0 0; color: #8fa6b2; font-size: 9px; line-height: 1.4; }
#charter-screen button {
  min-height: 48px;
  padding: 10px 16px;
  border: 1px solid rgba(150, 177, 192, 0.62);
  border-radius: 3px;
  background: rgba(8, 17, 25, 0.86);
  color: #dbe7ef;
  font: 13px Consolas, Menlo, Monaco, monospace;
  letter-spacing: 0.035em;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
#charter-screen button:hover { background: rgba(21, 41, 53, 0.94); border-color: #b9d9e8; }
#charter-screen button.charter-primary { border-color: #c89743; color: #f4cf7b; }
#charter-screen button.charter-primary:not(:disabled) { background: rgba(82, 57, 17, 0.9); box-shadow: inset 0 0 0 1px rgba(244, 207, 123, 0.18); }
#charter-screen button.charter-primary:hover { background: rgba(74, 52, 19, 0.85); }
#charter-screen button:disabled { cursor: default; color: #63737e; border-color: rgba(104, 122, 133, 0.42); background: rgba(8, 14, 20, 0.65); }
#charter-screen .charter-back { min-height: 33px; padding: 6px 12px; font-size: 11px; }
#charter-screen .charter-tooltip {
  display: none;
  z-index: 2;
  width: 204px;
  padding: 10px 11px;
  border: 1px solid rgba(145, 183, 201, 0.7);
  background: rgba(5, 14, 22, 0.9);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35);
  font-size: 11px;
  line-height: 1.5;
  pointer-events: none;
}
#charter-screen .tooltip-title { color: #f4cf7b; font-size: 12px; margin-bottom: 4px; }
#charter-screen .tooltip-row { display: flex; justify-content: space-between; gap: 10px; color: #aab9c4; }
#charter-screen .tooltip-row span:last-child { color: #e1edf4; text-align: right; }
@media (max-width: 620px), (max-height: 560px) {
  #charter-screen .charter-header { top: 16px; left: 18px; max-width: calc(100vw - 36px); }
  #charter-screen h1 { font-size: 16px; }
  #charter-screen .charter-header p { font-size: 10px; margin-top: 5px; }
  #charter-screen .charter-legend { left: 18px; bottom: 16px; gap: 5px 12px; padding: 8px 10px; font-size: 8px; }
  #charter-screen .charter-actions { right: 14px; bottom: 14px; width: min(258px, calc(100vw - 28px)); gap: 5px; }
  #charter-screen .charter-selection { max-height: min(46vh, 250px); padding: 7px 8px; }
  #charter-screen button { min-height: 39px; padding: 7px 9px; font-size: 10px; }
  #charter-screen .charter-back { min-height: 29px; }
  #charter-screen .charter-tooltip { width: 176px; font-size: 10px; }
}
@media (max-width: 410px) {
  /* The reading panel needs the full width here, which is the same corner the
     legend occupies. The map keys stay readable on the map itself. */
  #charter-screen .charter-legend { display: none; }
  #charter-screen .charter-actions { width: calc(100vw - 28px); }
}
`;

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  document.head.appendChild(style);
}

function hashUnit(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function planetPosition(orbitRadius: number, orbitAngle: number): Point {
  return {
    x: 0.5 + orbitRadius * 0.5 * Math.cos(orbitAngle),
    y: 0.5 + orbitRadius * 0.5 * Math.sin(orbitAngle)
  };
}

function toPx(transform: DiscTransform, point: Point): Point {
  return {
    x: transform.cx + (point.x - 0.5) * transform.radiusX * 2,
    y: transform.cy + (point.y - 0.5) * transform.radius * 2
  };
}

function toDisc(transform: DiscTransform, x: number, y: number): Point {
  return {
    x: Math.max(0, Math.min(1, 0.5 + (x - transform.cx) / (transform.radiusX * 2))),
    y: Math.max(0, Math.min(1, 0.5 + (y - transform.cy) / (transform.radius * 2)))
  };
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const progress = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + progress * dx), point.y - (a.y + progress * dy));
}

// Banding and naming live with the forecast so this screen and the in-game
// Site Brief cannot drift into two vocabularies.
function levelBand(value: number): string {
  return CHARTER_LEVEL_LABEL[charterLevelBand(value)];
}

function trafficBandLabel(value: number): string {
  return CHARTER_TRAFFIC_LABEL[charterTrafficBand(value)];
}

function resourceLabel(value: SiteCharter['resourceType']): string {
  return CHARTER_RESOURCE_LABEL[value ?? 'none'];
}

function peakTraffic(profile: SiteCharter): number {
  let peak = 0;
  for (const lane of LANES) peak = Math.max(peak, profile.laneTrafficFactor[lane]);
  return peak;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character] ?? character);
}

function leadServiceCompositionText(forecast: CharterOperatingForecast): string {
  const lead = forecast.services[0];
  const multiplier = lead.compositionMultiplier;
  if (multiplier === undefined) return lead.label;
  const delta = Math.round((multiplier - 1) * 100);
  const fit = delta === 0 ? 'traffic mix neutral' : `traffic mix ${delta > 0 ? '+' : ''}${delta}%`;
  return `${lead.label} · ${fit}`;
}

/** Pure markup seam used by the live selection panel and focused UI evidence. */
export function renderCharterSelectionHtml(profile: SiteCharter, system: SystemMap): string {
  const forecast = computeCharterOperatingForecast(profile, system);
  const lead = forecast.services[0];
  const composition = forecast.compositionLine
    ? `<p class="charter-composition">${escapeHtml(forecast.compositionLine)} <b>${escapeHtml(leadServiceCompositionText(forecast))}</b> leads here.</p>`
    : '';
  return `<strong>${escapeHtml(forecast.headline)}</strong>`
    + `<span>${escapeHtml(forecast.summary)}</span>`
    + `<div class="charter-chips">${forecast.chips.map((chip) =>
      `<span class="charter-chip ${chip.tone}"><b>${escapeHtml(chip.label)}</b> ${escapeHtml(chip.detail)}</span>`).join('')}</div>`
    + `<div class="charter-lines">${composition}${[forecast.resourceLine, forecast.powerLine, forecast.exposureLine, forecast.expansionLine]
      .map((line) => `<p>${escapeHtml(line)}</p>`).join('')}</div>`
    + `<div class="charter-advice"><em>Mitigations</em><ul>${forecast.mitigations
      .map((item) => `<li><b>${escapeHtml(item.system)}.</b> ${escapeHtml(item.detail)}</li>`).join('')}</ul></div>`
    + `<div class="charter-advice"><em>Trade-offs</em><ul>${forecast.tradeoffs
      .map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul></div>`
    + `<p class="charter-viability">${escapeHtml(forecast.viability)}</p>`;
}

function makeStars(seed: string): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < 300; i++) {
    stars.push({
      x: hashUnit(`${seed}:star-x:${i}`),
      y: hashUnit(`${seed}:star-y:${i}`),
      size: 0.45 + hashUnit(`${seed}:star-s:${i}`) * 1.55,
      alpha: 0.18 + hashUnit(`${seed}:star-a:${i}`) * 0.68,
      phase: hashUnit(`${seed}:star-p:${i}`) * Math.PI * 2
    });
  }
  return stars;
}

function makeBeltParticles(seed: string, system: SystemMap): BeltParticle[][] {
  return system.asteroidBelts.map((belt, beltIndex) => {
    const particles: BeltParticle[] = [];
    const count = 150 + beltIndex * 30;
    for (let i = 0; i < count; i++) {
      const unit = hashUnit(`${seed}:${belt.id}:radius:${i}`);
      particles.push({
        radius: belt.innerRadius + (belt.outerRadius - belt.innerRadius) * unit,
        angle: hashUnit(`${seed}:${belt.id}:angle:${i}`) * Math.PI * 2,
        size: 0.55 + hashUnit(`${seed}:${belt.id}:size:${i}`) * 2.05,
        alpha: 0.18 + hashUnit(`${seed}:${belt.id}:alpha:${i}`) * 0.68
      });
    }
    return particles;
  });
}

function gatePoints(routes: LaneRoute[]): Array<{ id: string; position: Point }> {
  const gates: Array<{ id: string; position: Point }> = [];
  for (const route of routes) {
    if (route.from.startsWith('gate-') && route.points.length > 0) {
      gates.push({ id: route.from, position: route.points[0] });
    }
  }
  return gates;
}

function makeLandmarks(seed: string, system: SystemMap): Landmark[] {
  const landmarks: Landmark[] = [];
  const count = Math.min(3, system.planets.length);
  for (let i = 0; i < count; i++) {
    const planet = system.planets[(i * 2 + 1) % system.planets.length];
    const base = planetPosition(planet.orbitRadius, planet.orbitAngle);
    const angle = hashUnit(`${seed}:${planet.id}:outpost`) * Math.PI * 2;
    const distance = 0.035 + hashUnit(`${seed}:${planet.id}:outpost-distance`) * 0.018;
    landmarks.push({
      id: `outpost-${planet.id}`,
      label: i === 0 ? 'ORBITAL OUTPOST' : 'WAYSTATION',
      position: {
        x: Math.max(0.03, Math.min(0.97, base.x + Math.cos(angle) * distance)),
        y: Math.max(0.03, Math.min(0.97, base.y + Math.sin(angle) * distance))
      }
    });
  }
  return landmarks;
}

function drawLabel(ctx: CanvasRenderingContext2D, x: number, y: number, title: string, detail: string): void {
  ctx.save();
  ctx.textAlign = x > ctx.canvas.width / (window.devicePixelRatio || 1) * 0.72 ? 'right' : 'left';
  ctx.fillStyle = 'rgba(225, 237, 244, 0.95)';
  ctx.font = '12px Consolas, Menlo, Monaco, monospace';
  ctx.fillText(title.toUpperCase(), x, y);
  ctx.fillStyle = 'rgba(169, 190, 202, 0.88)';
  ctx.font = '10px Consolas, Menlo, Monaco, monospace';
  ctx.fillText(detail, x, y + 15);
  ctx.restore();
}

function drawOutpost(ctx: CanvasRenderingContext2D, point: Point, highlighted: boolean): void {
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.strokeStyle = highlighted ? '#f5d78e' : '#b7d6e5';
  ctx.fillStyle = highlighted ? 'rgba(245, 215, 142, 0.32)' : 'rgba(157, 198, 216, 0.22)';
  ctx.lineWidth = highlighted ? 1.7 : 1;
  ctx.beginPath();
  ctx.moveTo(-8, 0); ctx.lineTo(8, 0);
  ctx.moveTo(-4, -4); ctx.lineTo(0, 4); ctx.lineTo(4, -4);
  ctx.moveTo(0, -8); ctx.lineTo(0, 8);
  ctx.stroke();
  ctx.fillRect(-2, -2, 4, 4);
  ctx.restore();
}

function drawGate(ctx: CanvasRenderingContext2D, point: Point, label: string, highlighted: boolean, time: number): void {
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.strokeStyle = highlighted ? '#f4d58d' : 'rgba(151, 203, 255, 0.9)';
  ctx.lineWidth = highlighted ? 2.2 : 1.3;
  for (let i = 0; i < 3; i++) {
    ctx.globalAlpha = 0.8 - i * 0.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 11 + i * 3, 16 + i * 4, Math.sin(time * 0.001 + i) * 0.18, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 12);
  glow.addColorStop(0, '#e4f4ff');
  glow.addColorStop(0.25, '#6faaff');
  glow.addColorStop(1, 'rgba(83, 141, 255, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  drawLabel(ctx, point.x + 21, point.y - 13, label, 'Trade hub');
}

function drawPlanet(
  ctx: CanvasRenderingContext2D,
  point: Point,
  planet: SystemMap['planets'][number],
  size: number,
  highlighted: boolean,
  seed: string
): void {
  const colors = BODY_COLORS[planet.bodyType];
  ctx.save();
  ctx.translate(point.x, point.y);
  if (planet.bodyType === 'gas' || hashUnit(`${seed}:${planet.id}:rings`) > 0.68) {
    ctx.strokeStyle = highlighted ? '#f2d18c' : 'rgba(214, 190, 151, 0.78)';
    ctx.lineWidth = Math.max(1, size * 0.12);
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 1.55, size * 0.46, -0.28, 0, Math.PI * 2);
    ctx.stroke();
  }
  const gradient = ctx.createRadialGradient(-size * 0.32, -size * 0.35, size * 0.08, 0, 0, size);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(1, colors[1]);
  ctx.fillStyle = gradient;
  ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI * 2); ctx.fill();
  if (planet.bodyType === 'gas') {
    ctx.strokeStyle = 'rgba(70, 42, 33, 0.5)';
    ctx.lineWidth = Math.max(1, size * 0.13);
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.arc(0, i * size * 0.32, size * 0.72, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    }
  } else if (planet.bodyType === 'ice') {
    ctx.fillStyle = 'rgba(244, 253, 255, 0.48)';
    ctx.beginPath(); ctx.arc(-size * 0.25, -size * 0.35, size * 0.38, 0, Math.PI * 2); ctx.fill();
  }
  if (highlighted) {
    ctx.strokeStyle = '#f5d78e'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, size + 5, 0, Math.PI * 2); ctx.stroke();
  }
  const moonAngle = hashUnit(`${seed}:${planet.id}:moon`) * Math.PI * 2;
  const moonDistance = size + 8;
  ctx.fillStyle = '#c8d6d8';
  ctx.beginPath();
  ctx.arc(Math.cos(moonAngle) * moonDistance, Math.sin(moonAngle) * moonDistance, Math.max(2, size * 0.15), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawLabel(ctx, point.x + size + 10, point.y + 3, planet.displayName, `${planet.bodyType} world`);
}

function drawRoute(
  ctx: CanvasRenderingContext2D,
  route: LaneRoute,
  transform: DiscTransform,
  highlighted: boolean,
  time: number,
  phase: number
): void {
  if (route.points.length < 2) return;
  const first = toPx(transform, route.points[0]);
  ctx.save();
  ctx.beginPath(); ctx.moveTo(first.x, first.y);
  for (let i = 1; i < route.points.length; i++) {
    const point = toPx(transform, route.points[i]);
    ctx.lineTo(point.x, point.y);
  }
  ctx.strokeStyle = highlighted ? 'rgba(225, 212, 140, 0.42)' : `rgba(103, 209, 181, ${0.12 + route.volume * 0.18})`;
  ctx.lineWidth = highlighted ? 9 : 5 + route.volume * 4;
  ctx.stroke();
  ctx.strokeStyle = highlighted ? 'rgba(244, 213, 141, 0.92)' : 'rgba(137, 235, 210, 0.54)';
  ctx.lineWidth = highlighted ? 1.6 : 0.85;
  ctx.stroke();
  ctx.restore();

  const start = route.points[0];
  const end = route.points[route.points.length - 1];
  const pulse = (time * 0.00012 + phase) % 1;
  const pulsePoint = toPx(transform, { x: start.x + (end.x - start.x) * pulse, y: start.y + (end.y - start.y) * pulse });
  ctx.fillStyle = highlighted ? '#fff0b8' : '#d7fff0';
  ctx.globalAlpha = 0.75;
  ctx.beginPath(); ctx.arc(pulsePoint.x, pulsePoint.y, highlighted ? 3.4 : 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}

function findHoverTarget(
  point: Point,
  system: SystemMap,
  routes: LaneRoute[],
  gates: Array<{ id: string; position: Point }>,
  landmarks: Landmark[]
): HoverTarget {
  let best: HoverTarget = { kind: null, id: null };
  let nearest = 0.035;
  for (const planet of system.planets) {
    const position = planetPosition(planet.orbitRadius, planet.orbitAngle);
    const distance = Math.hypot(point.x - position.x, point.y - position.y);
    if (distance < nearest) { nearest = distance; best = { kind: 'planet', id: planet.id }; }
  }
  for (const gate of gates) {
    const distance = Math.hypot(point.x - gate.position.x, point.y - gate.position.y);
    if (distance < nearest) { nearest = distance; best = { kind: 'gate', id: gate.id }; }
  }
  for (const landmark of landmarks) {
    const distance = Math.hypot(point.x - landmark.position.x, point.y - landmark.position.y);
    if (distance < nearest) { nearest = distance; best = { kind: 'outpost', id: landmark.id }; }
  }
  for (const belt of system.asteroidBelts) {
    const radius = Math.hypot(point.x - 0.5, point.y - 0.5) * 2;
    const distance = radius < belt.innerRadius ? belt.innerRadius - radius : radius > belt.outerRadius ? radius - belt.outerRadius : 0;
    if (distance < nearest) { nearest = distance; best = { kind: 'belt', id: belt.id }; }
  }
  for (const route of routes) {
    for (let i = 1; i < route.points.length; i++) {
      const distance = distanceToSegment(point, route.points[i - 1], route.points[i]);
      if (distance < nearest) { nearest = distance; best = { kind: 'route', id: route.id }; }
    }
  }
  return best;
}

// The string overload is the preferred public API. The number overload keeps
// the current new-game caller source-compatible while it continues to store a
// numeric system seed.
export function mountCharterScreen(seed: string, system: SystemMap, options?: CharterScreenOptions): Promise<SiteCharter | null>;
export function mountCharterScreen(seed: number, system: SystemMap, options: CharterScreenOptions & { allowCancel: true }): Promise<SiteCharter | null>;
export function mountCharterScreen(seed: number, system: SystemMap, options?: CharterScreenOptions): Promise<SiteCharter>;
export function mountCharterScreen(
  seed: string | number,
  system: SystemMap,
  options: CharterScreenOptions = {}
): Promise<SiteCharter | null> {
  ensureStyles();
  const seedKey = String(seed);
  const routes = system.laneRoutes ?? [];
  const gates = gatePoints(routes);
  const stars = makeStars(seedKey);
  const particles = makeBeltParticles(seedKey, system);
  const landmarks = makeLandmarks(seedKey, system);

  const root = document.createElement('div');
  root.id = 'charter-screen';
  root.innerHTML = `
    <canvas aria-label="System charter map"></canvas>
    <header class="charter-header"><h1>CHARTER A STATION</h1><p>Survey the system. Choose where your station will grow.</p></header>
    <aside class="charter-legend" aria-label="Map legend">
      <span class="charter-key"><i class="key-dot key-hot"></i>HOT ZONE</span><span class="charter-key"><i class="key-line"></i>TRADE LANE</span>
      <span class="charter-key"><i class="key-dot key-warm"></i>WARM ZONE</span><span class="charter-key"><i class="key-gate"></i>GATE</span>
      <span class="charter-key"><i class="key-dot key-hab"></i>HABITABLE</span><span class="charter-key"><i class="key-dot key-cold"></i>COLD ZONE</span>
    </aside>
    <div class="charter-tooltip" role="status"><div class="tooltip-title" data-field="title">Survey site</div><div class="tooltip-row"><span>Sunlight</span><span data-field="sun"></span></div><div class="tooltip-row"><span>Traffic</span><span data-field="traffic"></span></div><div class="tooltip-row"><span>Debris</span><span data-field="debris"></span></div><div class="tooltip-row"><span>Resource</span><span data-field="resource"></span></div><div class="tooltip-row"><span>Lead service</span><span data-field="lead-service"></span></div><div class="tooltip-row"><span>Supply cost</span><span data-field="supply-cost"></span></div><div class="tooltip-row"><span>Retail demand</span><span data-field="retail-demand"></span></div><div class="tooltip-row"><span>Repair demand</span><span data-field="repair-demand"></span></div><div class="tooltip-row"><span>Solar yield</span><span data-field="solar-yield"></span></div><div class="tooltip-row"><span>Expand toward</span><span data-field="expansion"></span></div></div>
    <nav class="charter-actions" aria-label="Charter actions">
      ${options.allowCancel ? '<button type="button" class="charter-back">Back</button>' : ''}
      <div class="charter-selection" aria-live="polite"><strong>Select a station site</strong><span>Click the map or use the recommended location to compare its operating conditions.</span></div>
      <button type="button" class="charter-recommended">Recommended Site</button>
      <button type="button" class="charter-primary" disabled>Charter This Site</button>
    </nav>
  `;
  document.body.appendChild(root);

  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const tooltip = root.querySelector<HTMLElement>('.charter-tooltip')!;
  const titleField = root.querySelector<HTMLElement>('[data-field="title"]')!;
  const sunField = root.querySelector<HTMLElement>('[data-field="sun"]')!;
  const trafficField = root.querySelector<HTMLElement>('[data-field="traffic"]')!;
  const debrisField = root.querySelector<HTMLElement>('[data-field="debris"]')!;
  const resourceField = root.querySelector<HTMLElement>('[data-field="resource"]')!;
  const leadServiceField = root.querySelector<HTMLElement>('[data-field="lead-service"]')!;
  const expansionField = root.querySelector<HTMLElement>('[data-field="expansion"]')!;
  const supplyCostField = root.querySelector<HTMLElement>('[data-field="supply-cost"]')!;
  const retailDemandField = root.querySelector<HTMLElement>('[data-field="retail-demand"]')!;
  const repairDemandField = root.querySelector<HTMLElement>('[data-field="repair-demand"]')!;
  const solarYieldField = root.querySelector<HTMLElement>('[data-field="solar-yield"]')!;
  const recommendedButton = root.querySelector<HTMLButtonElement>('.charter-recommended')!;
  const charterButton = root.querySelector<HTMLButtonElement>('.charter-primary')!;
  const selectionSummary = root.querySelector<HTMLElement>('.charter-selection')!;
  const backButton = root.querySelector<HTMLButtonElement>('.charter-back');

  let width = 1;
  let height = 1;
  let transform: DiscTransform = { cx: 0, cy: 0, radiusX: 1, radius: 1 };
  let hover: Point | null = null;
  let selected: Point | null = null;
  let target: HoverTarget = { kind: null, id: null };
  let animationFrame = 0;
  let completed = false;
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  const draw = (time = 0): void => {
    ctx.clearRect(0, 0, width, height);
    const background = ctx.createRadialGradient(transform.cx, transform.cy, 0, transform.cx, transform.cy, Math.max(width, height) * 0.72);
    background.addColorStop(0, '#10191c');
    background.addColorStop(0.44, '#071019');
    background.addColorStop(1, '#020509');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    for (const star of stars) {
      const flicker = motionQuery.matches ? 1 : 0.82 + Math.sin(time * 0.0014 + star.phase) * 0.18;
      ctx.globalAlpha = star.alpha * flicker;
      ctx.fillStyle = '#d9ecff';
      ctx.fillRect(star.x * width, star.y * height, star.size, star.size);
    }
    ctx.globalAlpha = 1;

    for (const band of THERMAL_BANDS) {
      ctx.beginPath();
      ctx.ellipse(transform.cx, transform.cy, band[1] * transform.radiusX, band[1] * transform.radius, 0, 0, Math.PI * 2);
      ctx.ellipse(transform.cx, transform.cy, band[0] * transform.radiusX, band[0] * transform.radius, 0, 0, Math.PI * 2, true);
      ctx.fillStyle = band[2];
      ctx.fill('evenodd');
    }

    ctx.strokeStyle = 'rgba(87, 152, 183, 0.22)';
    ctx.lineWidth = 0.8;
    for (const planet of system.planets) {
      ctx.beginPath(); ctx.ellipse(transform.cx, transform.cy, planet.orbitRadius * transform.radiusX, planet.orbitRadius * transform.radius, 0, 0, Math.PI * 2); ctx.stroke();
    }

    for (let beltIndex = 0; beltIndex < system.asteroidBelts.length; beltIndex++) {
      const belt = system.asteroidBelts[beltIndex];
      const highlighted = target.kind === 'belt' && target.id === belt.id;
      const color = BELT_COLORS[belt.resourceType];
      ctx.fillStyle = color;
      for (const particle of particles[beltIndex]) {
        const radius = particle.radius * transform.radius;
        ctx.globalAlpha = particle.alpha * (highlighted ? 1 : 0.72);
        ctx.beginPath();
        ctx.arc(transform.cx + Math.cos(particle.angle) * particle.radius * transform.radiusX, transform.cy + Math.sin(particle.angle) * radius, particle.size, 0, Math.PI * 2);
        ctx.fill();
      }
      if (highlighted) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        const beltRadius = (belt.innerRadius + belt.outerRadius) / 2;
        ctx.beginPath(); ctx.ellipse(transform.cx, transform.cy, beltRadius * transform.radiusX, beltRadius * transform.radius, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    for (const route of routes) {
      drawRoute(ctx, route, transform, target.kind === 'route' && target.id === route.id, time, hashUnit(`${seedKey}:${route.id}:pulse`));
    }

    for (const landmark of landmarks) {
      const point = toPx(transform, landmark.position);
      const highlighted = target.kind === 'outpost' && target.id === landmark.id;
      drawOutpost(ctx, point, highlighted);
      if (highlighted) drawLabel(ctx, point.x + 11, point.y - 12, landmark.label, 'Station landmark');
    }

    for (let i = 0; i < system.planets.length; i++) {
      const planet = system.planets[i];
      const point = toPx(transform, planetPosition(planet.orbitRadius, planet.orbitAngle));
      const size = 16 + hashUnit(`${seedKey}:${planet.id}:size`) * 17;
      drawPlanet(ctx, point, planet, size, target.kind === 'planet' && target.id === planet.id, seedKey);
    }
    for (let i = 0; i < gates.length; i++) {
      const gate = gates[i];
      const point = toPx(transform, gate.position);
      drawGate(ctx, point, i === 0 ? 'NORUS GATE' : 'HELIOS GATE', target.kind === 'gate' && target.id === gate.id, time);
    }

    const sunGlow = ctx.createRadialGradient(transform.cx, transform.cy, 2, transform.cx, transform.cy, 43);
    sunGlow.addColorStop(0, '#fff8ce'); sunGlow.addColorStop(0.25, '#ffd171'); sunGlow.addColorStop(1, 'rgba(255, 154, 53, 0)');
    ctx.fillStyle = sunGlow; ctx.beginPath(); ctx.arc(transform.cx, transform.cy, 43, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff2bb'; ctx.beginPath(); ctx.arc(transform.cx, transform.cy, 13, 0, Math.PI * 2); ctx.fill();

    if (selected) {
      const point = toPx(transform, selected);
      ctx.save();
      ctx.strokeStyle = '#f5d78e'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(point.x, point.y, 18, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(point.x - 27, point.y); ctx.lineTo(point.x - 20, point.y); ctx.moveTo(point.x + 20, point.y); ctx.lineTo(point.x + 27, point.y); ctx.moveTo(point.x, point.y - 27); ctx.lineTo(point.x, point.y - 20); ctx.moveTo(point.x, point.y + 20); ctx.lineTo(point.x, point.y + 27); ctx.stroke();
      ctx.fillStyle = '#f5d78e'; ctx.fillRect(point.x - 3, point.y - 8, 6, 16); ctx.fillRect(point.x - 8, point.y - 3, 16, 6);
      ctx.restore();
      drawOutpost(ctx, point, true);
      drawLabel(ctx, point.x + 24, point.y + 25, 'STATION SITE', 'Charter preview');
    }
    if (hover) {
      const point = toPx(transform, hover);
      ctx.strokeStyle = 'rgba(218, 236, 245, 0.78)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(point.x, point.y, 7, 0, Math.PI * 2); ctx.stroke();
    }
  };

  const animate = (time: number): void => {
    draw(time);
    if (!motionQuery.matches && !completed) animationFrame = requestAnimationFrame(animate);
  };

  const resize = (): void => {
    const rect = root.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    transform = { cx: width * 0.5, cy: height * 0.53, radiusX: width * 0.44, radius: height * 0.43 };
    draw(performance.now());
  };

  const updateTooltip = (point: Point | null, clientX?: number, clientY?: number): void => {
    if (!point || clientX === undefined || clientY === undefined) {
      tooltip.style.display = 'none';
      return;
    }
    const profile = computeSiteProfile(system, point.x, point.y);
    const forecast = computeCharterOperatingForecast(profile, system);
    const economy = forecast.economy;
    const targetName = target.kind === 'planet' ? system.planets.find((planet) => planet.id === target.id)?.displayName
      : target.kind === 'gate' ? 'Trade gate'
        : target.kind === 'outpost' ? landmarks.find((landmark) => landmark.id === target.id)?.label
          : target.kind === 'belt' ? 'Resource belt'
            : target.kind === 'route' ? 'Traffic route' : 'Survey site';
    titleField.textContent = targetName ?? 'Survey site';
    sunField.textContent = levelBand(profile.sunFactor);
    trafficField.textContent = forecast.evenApproaches
      ? `${trafficBandLabel(peakTraffic(profile))} · even`
      : `${trafficBandLabel(peakTraffic(profile))} · ${forecast.busiestFace.lane}`;
    debrisField.textContent = levelBand(profile.debrisFactor);
    resourceField.textContent = resourceLabel(profile.resourceType);
    leadServiceField.textContent = leadServiceCompositionText(forecast);
    supplyCostField.textContent = `${Math.round(economy.supplyWholesaleMultiplier * 100)}%`;
    retailDemandField.textContent = `${Math.round(economy.retailDemandMultiplier * 100)}%`;
    repairDemandField.textContent = `${Math.round(economy.repairDemandMultiplier * 100)}%`;
    solarYieldField.textContent = `${Math.round(economy.solarYieldMultiplier * 100)}%`;
    expansionField.textContent = forecast.shelteredFace.lane;
    const rect = root.getBoundingClientRect();
    const tooltipWidth = tooltip.offsetWidth || 204;
    const tooltipHeight = tooltip.offsetHeight || 154;
    const left = Math.max(8, Math.min(rect.width - tooltipWidth - 8, clientX - rect.left + 16));
    const top = Math.max(8, Math.min(rect.height - tooltipHeight - 8, clientY - rect.top + 16));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.display = 'block';
  };

  let resolvePromise!: (profile: SiteCharter | null) => void;
  const promise = new Promise<SiteCharter | null>((resolve) => { resolvePromise = resolve; });

  const cleanupAndResolve = (profile: SiteCharter | null): void => {
    if (completed) return;
    completed = true;
    cancelAnimationFrame(animationFrame);
    window.removeEventListener('resize', resize);
    motionQuery.removeEventListener('change', onMotionChange);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    canvas.removeEventListener('click', onCanvasClick);
    recommendedButton.removeEventListener('click', onRecommended);
    charterButton.removeEventListener('click', onCharter);
    backButton?.removeEventListener('click', onBack);
    root.remove();
    resolvePromise(profile);
  };

  const select = (point: Point): void => {
    selected = point;
    const profile = computeSiteProfile(system, point.x, point.y);
    // The pure renderer consumes the same system-backed forecast as hover, so
    // a click cannot lose the directional traffic mix the player just saw.
    selectionSummary.innerHTML = renderCharterSelectionHtml(profile, system);
    charterButton.disabled = false;
    draw(performance.now());
  };

  function onPointerMove(event: PointerEvent): void {
    const rect = canvas.getBoundingClientRect();
    hover = toDisc(transform, event.clientX - rect.left, event.clientY - rect.top);
    target = findHoverTarget(hover, system, routes, gates, landmarks);
    updateTooltip(hover, event.clientX, event.clientY);
    if (motionQuery.matches) draw(performance.now());
  }

  function onPointerLeave(): void {
    hover = null;
    target = { kind: null, id: null };
    tooltip.style.display = 'none';
    if (motionQuery.matches) draw(performance.now());
  }

  function onCanvasClick(event: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    select(toDisc(transform, event.clientX - rect.left, event.clientY - rect.top));
  }

  function onRecommended(): void {
    target = { kind: null, id: null };
    select(RECOMMENDED_POS);
  }

  function onCharter(): void {
    if (selected) cleanupAndResolve(computeSiteProfile(system, selected.x, selected.y));
  }

  function onBack(): void {
    cleanupAndResolve(null);
  }

  function onMotionChange(): void {
    cancelAnimationFrame(animationFrame);
    draw(performance.now());
    if (!motionQuery.matches && !completed) animationFrame = requestAnimationFrame(animate);
  }

  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('click', onCanvasClick);
  recommendedButton.addEventListener('click', onRecommended);
  charterButton.addEventListener('click', onCharter);
  backButton?.addEventListener('click', onBack);
  window.addEventListener('resize', resize);
  motionQuery.addEventListener('change', onMotionChange);
  resize();
  if (!motionQuery.matches) animationFrame = requestAnimationFrame(animate);

  return promise;
}
