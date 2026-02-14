import './styles.css';
import { renderWorld } from './render/render';
import {
  buyMaterials,
  buyRawFood,
  createInitialState,
  fireCrew,
  getRoomDiagnosticAt,
  hireCrew,
  sellMaterials,
  sellRawFood,
  setRoom,
  setZone,
  tick,
  trySetTile
} from './sim/sim';
import {
  RoomType,
  TILE_SIZE,
  TileType,
  ZoneType,
  clamp,
  inBounds,
  toIndex,
  type BuildTool
} from './sim/types';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root not found');

app.innerHTML = `
  <div id="game-wrap">
    <canvas id="game"></canvas>
  </div>
  <aside id="panel">
    <h1>Station / Colony Sim MVP</h1>

    <div class="section panel-first">
      <div class="section-title">Population & Services</div>
      <div class="row compact list-row"><span>Visitors</span><span class="value" id="visitors">0</span></div>
      <div class="row compact list-row"><span>Morale</span><span class="value" id="morale">0</span></div>
      <div class="row compact list-row"><span>Crew</span><span class="value" id="crew">0 / 0 (free 0)</span></div>
      <div class="row compact list-row"><span>Station Systems</span><span class="value" id="ops">Cafeteria 0/0 | Security 0/0 | Reactor 0/0 | Dorms 0/0</span></div>
      <small id="ops-extra">Hygiene 0/0 | Hydroponics 0/0 | Life Support 0/0</small>
      <small id="food-flow">Food flow: +0.0 raw/s -> +0.0 meals/s, use 0.0 meals/s</small>
    </div>

    <div class="section">
      <div class="section-title">Habitat Status</div>
      <div class="row compact list-row"><span>Pressure Hull</span><span class="value" id="pressure">0% sealed | 0 leaking tiles</span></div>
      <div class="row compact list-row"><span>Power</span><span class="value" id="power">0 / 0</span></div>
      <div class="row compact list-row"><span>Incidents</span><span class="value" id="incidents">0</span></div>
    </div>

    <div class="section">
      <div class="section-title">Economy & Resources</div>
      <div class="row compact list-row"><span>Resources</span><span class="value" id="resources">Food 0 | Water 0 | Air 0%</span></div>
      <div class="row compact list-row"><span>Economy</span><span class="value" id="economy">Materials 0 | Credits 0</span></div>
      <div class="row compact list-row">
        <span>Crew Priority</span>
        <select id="crew-priority">
          <option value="balanced">Balanced</option>
          <option value="cafeteria">Cafeteria</option>
          <option value="hydroponics">Hydroponics</option>
          <option value="security">Security</option>
          <option value="life-support">Life Support</option>
          <option value="reactor">Reactor</option>
        </select>
      </div>
      <div class="row compact list-row"><span>Crew Mgmt</span><span class="value" id="crew-note">Payroll 0.32c/crew/30s</span></div>
      <button id="open-market">Open Market</button>
    </div>

    <div class="section">
      <div class="legend-title">Build & Room Legend</div>
      <div class="legend-grid">
        <div class="legend-item"><span class="chip chip-caf"></span><span>Cafeteria (C) <kbd>C</kbd></span></div>
        <div class="legend-item"><span class="chip chip-reactor"></span><span>Reactor (R) <kbd>R</kbd></span></div>
        <div class="legend-item"><span class="chip chip-security"></span><span>Security (S) <kbd>S</kbd></span></div>
        <div class="legend-item"><span class="chip chip-dorm"></span><span>Dorm (D) <kbd>D</kbd></span></div>
        <div class="legend-item"><span class="chip chip-hygiene"></span><span>Hygiene (H) <kbd>H</kbd></span></div>
        <div class="legend-item"><span class="chip chip-hydro"></span><span>Hydroponics (F) <kbd>F</kbd></span></div>
        <div class="legend-item"><span class="chip chip-life"></span><span>Life Support (L) <kbd>L</kbd></span></div>
      </div>
      <small class="legend-build">
        Build: <kbd>1</kbd> Floor, <kbd>2</kbd> Wall, <kbd>3</kbd> Dock, <kbd>4</kbd> Door, <kbd>7</kbd> Erase Tile<br />
        Zone paint: <kbd>8</kbd> Public, <kbd>9</kbd> Restricted, <kbd>0</kbd> Clear Room
      </small>
    </div>

    <div class="section">
      <div class="row"><span>Ships / cycle</span><span class="value" id="ships-label">1</span></div>
      <input type="range" id="ships" min="0" max="3" step="1" value="1" />
      <div class="row" style="margin-top:8px;"><span>Visitor Tax Rate</span><span class="value" id="tax-label">20%</span></div>
      <input type="range" id="tax" min="0" max="50" step="1" value="20" />
      <div class="section-title" style="margin-top:10px;">Dock Throughput</div>
      <div class="row compact list-row"><span>Docked ships</span><span class="value" id="docked-ships">0</span></div>
      <div class="row compact list-row"><span>Avg dock time</span><span class="value" id="avg-dock-time">0.0s</span></div>
      <div class="row compact list-row"><span>Bay utilization</span><span class="value" id="bay-utilization">0%</span></div>
      <div class="row compact list-row"><span>Exits / min</span><span class="value" id="exits-per-min">0</span></div>
    </div>

    <div class="section">
      <button id="pause">Play</button>
      <div class="row" style="margin-top:8px;"><span>Speed</span><span class="value" id="speed-label">1x</span></div>
      <input type="range" id="speed" min="1" max="3" step="1" value="1" />
    </div>

    <div class="section">
      <button id="toggle-zones">Toggle Zone Overlay</button>
      <small>Drag to paint rectangle (Prison Architect style)</small>
      <small id="room-diagnostic">Inspect room: hover a room tile</small>
    </div>
  </aside>
  <div id="market-modal" class="modal hidden">
    <div class="modal-card">
      <div class="modal-head">
        <h2>Station Market</h2>
        <button id="close-market" class="ghost-btn">Close</button>
      </div>
      <div class="row compact list-row"><span>Market Rate</span><span class="value" id="market-rate">Normal</span></div>
      <div class="row compact list-row"><span>Last trade</span><span class="value" id="market-note">No purchase yet</span></div>
      <div class="row compact list-row"><span>Crew</span><span class="value" id="market-crew">0 / 0</span></div>
      <div class="button-row">
        <button id="hire-crew">Hire +1 Crew (14c)</button>
        <button id="fire-crew">Fire -1 Crew (+5c)</button>
      </div>
      <div class="button-row">
        <button id="buy-small">Buy +25 Materials (20c)</button>
        <button id="sell-small">Sell -25 Materials (+10c)</button>
      </div>
      <div class="button-row">
        <button id="buy-large">Buy +80 Materials (55c)</button>
        <button id="sell-large">Sell -80 Materials (+28c)</button>
      </div>
      <div class="button-row">
        <button id="buy-food-small">Buy +20 Raw Food (12c)</button>
        <button id="sell-food-small">Sell -20 Raw Food (+6c)</button>
      </div>
      <div class="button-row">
        <button id="buy-food-large">Buy +60 Raw Food (30c)</button>
        <button id="sell-food-large">Sell -60 Raw Food (+15c)</button>
      </div>
    </div>
  </div>
`;

const canvasEl = document.querySelector<HTMLCanvasElement>('#game');
if (!canvasEl) throw new Error('Canvas not found');
const canvas: HTMLCanvasElement = canvasEl;

const ctxMaybe = canvas.getContext('2d');
if (!ctxMaybe) throw new Error('2d context unavailable');
const ctx: CanvasRenderingContext2D = ctxMaybe;

const state = createInitialState();
canvas.width = state.width * TILE_SIZE;
canvas.height = state.height * TILE_SIZE;

const shipsInput = document.querySelector<HTMLInputElement>('#ships')!;
const shipsLabel = document.querySelector<HTMLSpanElement>('#ships-label')!;
const taxInput = document.querySelector<HTMLInputElement>('#tax')!;
const taxLabel = document.querySelector<HTMLSpanElement>('#tax-label')!;
const pauseBtn = document.querySelector<HTMLButtonElement>('#pause')!;
const speedInput = document.querySelector<HTMLInputElement>('#speed')!;
const speedLabel = document.querySelector<HTMLSpanElement>('#speed-label')!;
const toggleZonesBtn = document.querySelector<HTMLButtonElement>('#toggle-zones')!;
const visitorsEl = document.querySelector<HTMLSpanElement>('#visitors')!;
const moraleEl = document.querySelector<HTMLSpanElement>('#morale')!;
const crewEl = document.querySelector<HTMLSpanElement>('#crew')!;
const opsEl = document.querySelector<HTMLSpanElement>('#ops')!;
const opsExtraEl = document.querySelector<HTMLElement>('#ops-extra')!;
const resourcesEl = document.querySelector<HTMLSpanElement>('#resources')!;
const pressureEl = document.querySelector<HTMLSpanElement>('#pressure')!;
const economyEl = document.querySelector<HTMLSpanElement>('#economy')!;
const crewPrioritySelect = document.querySelector<HTMLSelectElement>('#crew-priority')!;
const crewNoteEl = document.querySelector<HTMLSpanElement>('#crew-note')!;
const hireCrewBtn = document.querySelector<HTMLButtonElement>('#hire-crew')!;
const fireCrewBtn = document.querySelector<HTMLButtonElement>('#fire-crew')!;
const marketNoteEl = document.querySelector<HTMLSpanElement>('#market-note')!;
const buySmallBtn = document.querySelector<HTMLButtonElement>('#buy-small')!;
const buyLargeBtn = document.querySelector<HTMLButtonElement>('#buy-large')!;
const sellSmallBtn = document.querySelector<HTMLButtonElement>('#sell-small')!;
const sellLargeBtn = document.querySelector<HTMLButtonElement>('#sell-large')!;
const buyFoodSmallBtn = document.querySelector<HTMLButtonElement>('#buy-food-small')!;
const buyFoodLargeBtn = document.querySelector<HTMLButtonElement>('#buy-food-large')!;
const sellFoodSmallBtn = document.querySelector<HTMLButtonElement>('#sell-food-small')!;
const sellFoodLargeBtn = document.querySelector<HTMLButtonElement>('#sell-food-large')!;
const marketCrewEl = document.querySelector<HTMLSpanElement>('#market-crew')!;
const marketRateEl = document.querySelector<HTMLSpanElement>('#market-rate')!;
const openMarketBtn = document.querySelector<HTMLButtonElement>('#open-market')!;
const closeMarketBtn = document.querySelector<HTMLButtonElement>('#close-market')!;
const marketModal = document.querySelector<HTMLDivElement>('#market-modal')!;
const foodFlowEl = document.querySelector<HTMLElement>('#food-flow')!;
const powerEl = document.querySelector<HTMLSpanElement>('#power')!;
const incidentsEl = document.querySelector<HTMLSpanElement>('#incidents')!;
const dockedShipsEl = document.querySelector<HTMLSpanElement>('#docked-ships')!;
const avgDockTimeEl = document.querySelector<HTMLSpanElement>('#avg-dock-time')!;
const bayUtilizationEl = document.querySelector<HTMLSpanElement>('#bay-utilization')!;
const exitsPerMinEl = document.querySelector<HTMLSpanElement>('#exits-per-min')!;
const roomDiagnosticEl = document.querySelector<HTMLElement>('#room-diagnostic')!;
crewPrioritySelect.value = state.controls.crewPriority;

const speedMap: Record<number, 1 | 2 | 4> = { 1: 1, 2: 2, 3: 4 };
const market = {
  hireCost: 14,
  fireRefund: 5,
  buyMat25Cost: 20,
  sellMat25Gain: 10,
  buyMat80Cost: 55,
  sellMat80Gain: 28,
  buyFood20Cost: 12,
  sellFood20Gain: 6,
  buyFood60Cost: 30,
  sellFood60Gain: 15
};
let currentTool: BuildTool = { kind: 'tile', tile: TileType.Floor };
let isPainting = false;
let paintStart: { x: number; y: number } | null = null;
let paintCurrent: { x: number; y: number } | null = null;
let hoveredTile: number | null = null;

function updateMarketRates(): void {
  const loadFactor = clamp(state.metrics.loadPct / 100, 0, 1.4);
  const pulse = Math.sin(state.now * 0.15) * 0.05;
  const buyMultiplier = clamp(0.9 + loadFactor * 0.18 + pulse, 0.8, 1.35);
  const sellMultiplier = clamp(0.58 - loadFactor * 0.08 - pulse * 0.5, 0.38, 0.72);

  market.hireCost = Math.max(8, Math.round(14 * buyMultiplier));
  market.fireRefund = Math.max(1, Math.round(market.hireCost * 0.4));
  market.buyMat25Cost = Math.max(8, Math.round(18 * buyMultiplier));
  market.sellMat25Gain = Math.max(3, Math.round(20 * sellMultiplier));
  market.buyMat80Cost = Math.max(20, Math.round(50 * buyMultiplier));
  market.sellMat80Gain = Math.max(8, Math.round(55 * sellMultiplier));
  market.buyFood20Cost = Math.max(6, Math.round(11 * buyMultiplier));
  market.sellFood20Gain = Math.max(2, Math.round(12 * sellMultiplier));
  market.buyFood60Cost = Math.max(15, Math.round(28 * buyMultiplier));
  market.sellFood60Gain = Math.max(5, Math.round(30 * sellMultiplier));
}

function refreshMarketUi(): void {
  hireCrewBtn.textContent = `Hire +1 Crew (${market.hireCost}c)`;
  fireCrewBtn.textContent = `Fire -1 Crew (+${market.fireRefund}c)`;
  buySmallBtn.textContent = `Buy +25 Materials (${market.buyMat25Cost}c)`;
  sellSmallBtn.textContent = `Sell -25 Materials (+${market.sellMat25Gain}c)`;
  buyLargeBtn.textContent = `Buy +80 Materials (${market.buyMat80Cost}c)`;
  sellLargeBtn.textContent = `Sell -80 Materials (+${market.sellMat80Gain}c)`;
  buyFoodSmallBtn.textContent = `Buy +20 Raw Food (${market.buyFood20Cost}c)`;
  sellFoodSmallBtn.textContent = `Sell -20 Raw Food (+${market.sellFood20Gain}c)`;
  buyFoodLargeBtn.textContent = `Buy +60 Raw Food (${market.buyFood60Cost}c)`;
  sellFoodLargeBtn.textContent = `Sell -60 Raw Food (+${market.sellFood60Gain}c)`;
  marketCrewEl.textContent = `${state.crew.assigned} / ${state.crew.total} (free ${state.crew.free})`;

  const spread = market.buyMat25Cost - market.sellMat25Gain;
  marketRateEl.textContent = spread <= 8 ? 'Favorable' : spread <= 12 ? 'Normal' : 'Tight';
}

function toTileCoords(clientX: number, clientY: number): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((clientX - rect.left) / TILE_SIZE);
  const y = Math.floor((clientY - rect.top) / TILE_SIZE);
  if (!inBounds(x, y, state.width, state.height)) return null;
  return { x, y };
}

function applyRectPaint(a: { x: number; y: number }, b: { x: number; y: number }): void {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const idx = toIndex(x, y, state.width);
      if (currentTool.kind === 'tile') {
        const changed = trySetTile(state, idx, currentTool.tile!);
        if (!changed) continue;
        if (currentTool.tile === TileType.Space) {
          setZone(state, idx, ZoneType.Public);
          setRoom(state, idx, RoomType.None);
        }
      } else if (currentTool.kind === 'zone') {
        if (state.tiles[idx] !== TileType.Space) {
          setZone(state, idx, currentTool.zone!);
        }
      } else if (state.tiles[idx] !== TileType.Space) {
        setRoom(state, idx, currentTool.room!);
      }
    }
  }
}

canvas.addEventListener('mousedown', (e) => {
  const tile = toTileCoords(e.clientX, e.clientY);
  if (!tile) return;
  isPainting = true;
  paintStart = tile;
  paintCurrent = tile;
});
canvas.addEventListener('mousemove', (e) => {
  const tile = toTileCoords(e.clientX, e.clientY);
  hoveredTile = tile ? toIndex(tile.x, tile.y, state.width) : null;
  if (!isPainting) return;
  if (tile) paintCurrent = tile;
});
canvas.addEventListener('mouseleave', () => {
  hoveredTile = null;
});
canvas.addEventListener('mouseup', () => {
  if (isPainting && paintStart && paintCurrent) {
    applyRectPaint(paintStart, paintCurrent);
  }
  isPainting = false;
  paintStart = null;
  paintCurrent = null;
});
window.addEventListener('mouseup', () => {
  if (isPainting && paintStart && paintCurrent) {
    applyRectPaint(paintStart, paintCurrent);
  }
  isPainting = false;
  paintStart = null;
  paintCurrent = null;
});

window.addEventListener('keydown', (e) => {
  switch (e.key) {
    case '1':
      currentTool = { kind: 'tile', tile: TileType.Floor };
      break;
    case '2':
      currentTool = { kind: 'tile', tile: TileType.Wall };
      break;
    case '3':
      currentTool = { kind: 'tile', tile: TileType.Dock };
      break;
    case '4':
      currentTool = { kind: 'tile', tile: TileType.Door };
      break;
    case '7':
      currentTool = { kind: 'tile', tile: TileType.Space };
      break;
    case '0':
      currentTool = { kind: 'room', room: RoomType.None };
      break;
    case 'c':
    case 'C':
      currentTool = { kind: 'room', room: RoomType.Cafeteria };
      break;
    case 'd':
    case 'D':
      currentTool = { kind: 'room', room: RoomType.Dorm };
      break;
    case 'h':
    case 'H':
      currentTool = { kind: 'room', room: RoomType.Hygiene };
      break;
    case 'f':
    case 'F':
      currentTool = { kind: 'room', room: RoomType.Hydroponics };
      break;
    case 'l':
    case 'L':
      currentTool = { kind: 'room', room: RoomType.LifeSupport };
      break;
    case 'r':
    case 'R':
      currentTool = { kind: 'room', room: RoomType.Reactor };
      break;
    case 's':
    case 'S':
      currentTool = { kind: 'room', room: RoomType.Security };
      break;
    case '8':
      currentTool = { kind: 'zone', zone: ZoneType.Public };
      break;
    case '9':
      currentTool = { kind: 'zone', zone: ZoneType.Restricted };
      break;
    case ' ':
      state.controls.paused = !state.controls.paused;
      pauseBtn.textContent = state.controls.paused ? 'Play' : 'Pause';
      break;
    case 'Escape':
      marketModal.classList.add('hidden');
      break;
    default:
      break;
  }
});

shipsInput.addEventListener('input', () => {
  state.controls.shipsPerCycle = clamp(parseInt(shipsInput.value, 10), 0, 3);
  shipsLabel.textContent = String(state.controls.shipsPerCycle);
});

taxInput.addEventListener('input', () => {
  const pct = clamp(parseInt(taxInput.value, 10), 0, 50);
  state.controls.taxRate = pct / 100;
  taxLabel.textContent = `${pct}%`;
});

crewPrioritySelect.addEventListener('change', () => {
  state.controls.crewPriority = crewPrioritySelect.value as typeof state.controls.crewPriority;
});

pauseBtn.addEventListener('click', () => {
  state.controls.paused = !state.controls.paused;
  pauseBtn.textContent = state.controls.paused ? 'Play' : 'Pause';
});

speedInput.addEventListener('input', () => {
  const slider = clamp(parseInt(speedInput.value, 10), 1, 3);
  state.controls.simSpeed = speedMap[slider];
  speedLabel.textContent = `${state.controls.simSpeed}x`;
});

toggleZonesBtn.addEventListener('click', () => {
  state.controls.showZones = !state.controls.showZones;
});

openMarketBtn.addEventListener('click', () => {
  marketModal.classList.remove('hidden');
});

closeMarketBtn.addEventListener('click', () => {
  marketModal.classList.add('hidden');
});

marketModal.addEventListener('click', (e) => {
  if (e.target === marketModal) {
    marketModal.classList.add('hidden');
  }
});

buySmallBtn.addEventListener('click', () => {
  const ok = buyMaterials(state, market.buyMat25Cost, 25);
  marketNoteEl.textContent = ok ? 'Purchased +25 materials' : 'Not enough credits';
});

buyLargeBtn.addEventListener('click', () => {
  const ok = buyMaterials(state, market.buyMat80Cost, 80);
  marketNoteEl.textContent = ok ? 'Purchased +80 materials' : 'Not enough credits';
});

hireCrewBtn.addEventListener('click', () => {
  const ok = hireCrew(state, market.hireCost);
  crewNoteEl.textContent = ok ? 'Hired +1 crew' : 'Not enough credits or max crew';
});

fireCrewBtn.addEventListener('click', () => {
  const ok = fireCrew(state, market.fireRefund);
  crewNoteEl.textContent = ok ? `Fired -1 crew (+${market.fireRefund}c)` : 'No crew to fire';
});

sellSmallBtn.addEventListener('click', () => {
  const ok = sellMaterials(state, 25, market.sellMat25Gain);
  marketNoteEl.textContent = ok ? `Sold -25 materials (+${market.sellMat25Gain}c)` : 'Not enough materials';
});

sellLargeBtn.addEventListener('click', () => {
  const ok = sellMaterials(state, 80, market.sellMat80Gain);
  marketNoteEl.textContent = ok ? `Sold -80 materials (+${market.sellMat80Gain}c)` : 'Not enough materials';
});

buyFoodSmallBtn.addEventListener('click', () => {
  const ok = buyRawFood(state, market.buyFood20Cost, 20);
  marketNoteEl.textContent = ok ? 'Purchased +20 raw food' : 'Not enough credits';
});

buyFoodLargeBtn.addEventListener('click', () => {
  const ok = buyRawFood(state, market.buyFood60Cost, 60);
  marketNoteEl.textContent = ok ? 'Purchased +60 raw food' : 'Not enough credits';
});

sellFoodSmallBtn.addEventListener('click', () => {
  const ok = sellRawFood(state, 20, market.sellFood20Gain);
  marketNoteEl.textContent = ok ? `Sold -20 raw food (+${market.sellFood20Gain}c)` : 'Not enough raw food';
});

sellFoodLargeBtn.addEventListener('click', () => {
  const ok = sellRawFood(state, 60, market.sellFood60Gain);
  marketNoteEl.textContent = ok ? `Sold -60 raw food (+${market.sellFood60Gain}c)` : 'Not enough raw food';
});

let lastTime = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  tick(state, dt);
  renderWorld(ctx, state, currentTool, hoveredTile);

  if (isPainting && paintStart && paintCurrent) {
    const minX = Math.min(paintStart.x, paintCurrent.x);
    const maxX = Math.max(paintStart.x, paintCurrent.x);
    const minY = Math.min(paintStart.y, paintCurrent.y);
    const maxY = Math.max(paintStart.y, paintCurrent.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(
      minX * TILE_SIZE + 1,
      minY * TILE_SIZE + 1,
      (maxX - minX + 1) * TILE_SIZE - 2,
      (maxY - minY + 1) * TILE_SIZE - 2
    );
    ctx.setLineDash([]);
  }

  visitorsEl.textContent = String(state.metrics.visitorsCount);
  moraleEl.textContent = `${Math.round(state.metrics.morale)}%`;
  moraleEl.style.color =
    state.metrics.morale > 65 ? '#6edb8f' : state.metrics.morale > 40 ? '#ffcf6e' : '#ff7676';
  crewEl.textContent = `${state.crew.assigned} / ${state.crew.total} (free ${state.crew.free})`;
  opsEl.textContent = `Cafeteria ${state.ops.cafeteriasActive}/${state.ops.cafeteriasTotal} | Security ${state.ops.securityActive}/${state.ops.securityTotal} | Reactor ${state.ops.reactorsActive}/${state.ops.reactorsTotal} | Dorms ${state.ops.dormsActive}/${state.ops.dormsTotal}`;
  opsExtraEl.textContent = `Hygiene ${state.ops.hygieneActive}/${state.ops.hygieneTotal} | Hydroponics ${state.ops.hydroponicsActive}/${state.ops.hydroponicsTotal} | Life Support ${state.ops.lifeSupportActive}/${state.ops.lifeSupportTotal}`;
  resourcesEl.textContent = `Raw Food ${Math.round(state.metrics.rawFoodStock)} -> Meals ${Math.round(state.metrics.mealStock)} | Water ${Math.round(state.metrics.waterStock)} | Air ${Math.round(state.metrics.airQuality)}%`;
  resourcesEl.style.color = state.metrics.airQuality < 35 ? '#ff7676' : '#d6deeb';
  pressureEl.textContent = `${Math.round(state.metrics.pressurizationPct)}% sealed | ${state.metrics.leakingTiles} leaking tiles`;
  pressureEl.style.color = state.metrics.pressurizationPct > 85 ? '#6edb8f' : state.metrics.pressurizationPct > 60 ? '#ffcf6e' : '#ff7676';
  economyEl.textContent = `Materials ${Math.round(state.metrics.materials)} | Credits ${Math.round(state.metrics.credits)}`;
  updateMarketRates();
  refreshMarketUi();
  crewNoteEl.textContent = `Hire ${market.hireCost}c | Payroll 0.32c/crew/30s`;
  hireCrewBtn.disabled = state.metrics.credits < market.hireCost || state.crew.total >= 40;
  fireCrewBtn.disabled = state.crew.total <= 0;
  buySmallBtn.disabled = state.metrics.credits < market.buyMat25Cost;
  buyLargeBtn.disabled = state.metrics.credits < market.buyMat80Cost;
  sellSmallBtn.disabled = state.metrics.materials < 25;
  sellLargeBtn.disabled = state.metrics.materials < 80;
  buyFoodSmallBtn.disabled = state.metrics.credits < market.buyFood20Cost;
  buyFoodLargeBtn.disabled = state.metrics.credits < market.buyFood60Cost;
  sellFoodSmallBtn.disabled = state.metrics.rawFoodStock < 20;
  sellFoodLargeBtn.disabled = state.metrics.rawFoodStock < 60;
  foodFlowEl.textContent = `Food flow: +${state.metrics.rawFoodProdRate.toFixed(1)} raw/s -> +${state.metrics.mealPrepRate.toFixed(1)} meals/s, use ${state.metrics.mealUseRate.toFixed(1)} meals/s`;
  powerEl.textContent = `${Math.round(state.metrics.powerDemand)} / ${Math.round(state.metrics.powerSupply)}`;
  powerEl.style.color = state.metrics.powerDemand > state.metrics.powerSupply ? '#ff7676' : '#6edb8f';
  incidentsEl.textContent = String(state.metrics.incidentsTotal);
  dockedShipsEl.textContent = String(state.metrics.dockedShips);
  avgDockTimeEl.textContent = `${state.metrics.averageDockTime.toFixed(1)}s`;
  bayUtilizationEl.textContent = `${Math.round(state.metrics.bayUtilizationPct)}%`;
  exitsPerMinEl.textContent = String(state.metrics.exitsPerMin);

  const diagnostic = hoveredTile !== null ? getRoomDiagnosticAt(state, hoveredTile) : null;
  if (diagnostic) {
    if (diagnostic.active) {
      roomDiagnosticEl.textContent = `Inspect room: ${diagnostic.room} active (${diagnostic.clusterSize} tiles)`;
      roomDiagnosticEl.style.color = '#6edb8f';
    } else {
      roomDiagnosticEl.textContent = `Inspect room: ${diagnostic.room} inactive - ${diagnostic.reasons.join(', ')}`;
      roomDiagnosticEl.style.color = '#ffcf6e';
    }
  } else {
    roomDiagnosticEl.textContent = 'Inspect room: hover a room tile';
    roomDiagnosticEl.style.color = '#8ea2bd';
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
