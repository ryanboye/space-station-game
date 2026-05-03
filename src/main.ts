import './styles.css';
import { renderWorld, type RenderViewport } from './render/render';
import { createEmptySpriteAtlas, loadSpriteAtlas, type SpriteAtlas } from './render/sprite-atlas';
import { MODULE_SPRITE_KEYS } from './render/sprite-keys';
import {
  applyLegendStates,
  attachLegendTooltipHandlers,
  maybeFireTierFlash,
} from './render/progression/wire';
import { renderQuestBar } from './render/progression/quest-bar';
import { PROGRESSION_TOOLTIP_COPY } from './sim/content/progression-tooltips';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from './sim/save';
import { UNLOCK_DEFINITIONS } from './sim/content/unlocks';
import { sigilForFaction } from './sim/system-map';
import {
  buyMaterialsDetailed,
  buyRawFoodDetailed,
  buildStationExpansionOnTruss,
  cancelConstructionAtTile,
  canExpandDirection,
  clearBodies,
  createInitialState,
  diagnoseFoodChain,
  expandMap,
  fireCrew,
  getBerthInspectorAt,
  getCrewInspectorById,
  getHousingInspectorAt,
  getLifeSupportTileDiagnostic,
  getMaintenanceTileDiagnostic,
  getRoutePressureDiagnostics,
  getRoutePressureTileDiagnostic,
  getRoomDiagnosticAt,
  getRoomEnvironmentTileDiagnostic,
  getRoomInspectorAt,
  getUnlockTier,
  getResidentInspectorById,
  getVisitorInspectorById,
  getNextExpansionCost,
  getDockByTile,
  isModuleUnlocked,
  isRoomUnlocked,
  isShipTypeUnlocked,
  hireCrew,
  planModuleConstruction,
  planTileConstruction,
  quoteMaterialImportCost,
  removeModuleAtTile,
  setCrewPriorityPreset,
  setCrewPriorityWeight,
  setDockFacing,
  setDockPurpose,
  setDockAllowedShipType,
  setDockAllowedShipSize,
  sellMaterials,
  sellRawFood,
  setRoom,
  setRoomHousingPolicy,
  setZone,
  tick,
  setTile,
  tryPlaceModuleWithCredits,
  trySetTileWithCredits,
  getCrewPriorityPresetWeights,
  validateDockPlacement
} from './sim';
import { MODULE_UNLOCK_TIER, ROOM_UNLOCK_TIER } from './sim/content/unlocks';
import {
  applyColdStartScenario,
  COLD_START_SCENARIO_NAMES
} from './sim/cold-start-scenarios';
import {
  type CardinalDirection,
  type CrewPriorityPreset,
  type CrewPrioritySystem,
  type DiagnosticOverlay,
  type DockPurpose,
  type SpaceLane,
  type ShipSize,
  type ShipType,
  type HousingPolicy,
  type ItemType,
  type JobStallReason,
  type JobStatusCounts,
  type ModuleRotation,
  type StationState,
  ModuleType,
  RoomType,
  TILE_SIZE,
  TileType,
  ZoneType,
  clamp,
  fromIndex,
  inBounds,
  toIndex,
  type BuildTool,
  type RouteExposure,
  type UnlockTier
} from './sim/types';

// Temporary playtest valve: construction/EVA remains implemented, but the
// primary build tools place immediately so other station systems can be tested
// without early expansion bottlenecking on haul/build jobs.
const INSTANT_BUILD_PLAYTEST = true;
const TRUSS_EXPANSION_EXPERIMENT = new URLSearchParams(window.location.search).has('truss');

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root not found');

app.innerHTML = `
  <div id="topbar">
    <div class="station-brand">
      <div class="station-mark">S</div>
      <div>
        <h1>Starlight Station</h1>
        <span id="autosave-status" class="topbar-note hidden" aria-live="polite"></span>
        <span id="sprite-status" class="topbar-note">Sprites inactive (fallback rendering)</span>
      </div>
    </div>
    <div id="hud-status" aria-label="Station status">
      <span class="hud-item"><span class="hud-label">Crew</span><span class="hud-value" id="hud-crew">--</span></span>
      <span class="hud-item"><span class="hud-label">Oxygen</span><span class="hud-value" id="hud-oxygen">--</span></span>
      <span class="hud-item"><span class="hud-label">Power</span><span class="hud-value" id="hud-power">--</span></span>
      <span class="hud-item"><span class="hud-label">Water</span><span class="hud-value" id="hud-water">--</span></span>
      <span class="hud-item"><span class="hud-label">Food</span><span class="hud-value" id="hud-food">--</span></span>
      <span class="hud-item"><span class="hud-label">Rating</span><span class="hud-value" id="hud-rating">--</span></span>
      <span class="hud-item"><span class="hud-label">Morale</span><span class="hud-value" id="hud-morale">--</span></span>
      <span class="hud-item"><span class="hud-label">Credits</span><span class="hud-value" id="hud-credits">--</span></span>
      <span class="hud-item"><span class="hud-label">Supplies</span><span class="hud-value" id="hud-materials">--</span></span>
    </div>
    <div class="top-actions">
      <button id="open-save-modal" class="topbar-btn utility-icon" aria-label="Save / Load" title="Save / Load">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5 4h11l3 3v13H5z" />
          <path d="M8 4v6h8V4" />
          <path d="M8 20v-6h8v6" />
        </svg>
      </button>
      <button id="load-autosave" class="topbar-btn utility-icon hidden" aria-label="Load last session" title="Load last session">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 12a8 8 0 1 0 2.35-5.65" />
          <path d="M4 5v5h5" />
          <path d="M12 8v5l3 2" />
        </svg>
      </button>
      <button id="open-system-map-modal" class="topbar-btn utility-icon" aria-label="System Map (F4)" title="System Map (F4)">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="12" r="6" fill="none" />
          <circle cx="12" cy="12" r="10" fill="none" />
          <circle cx="18" cy="12" r="1" />
          <circle cx="6" cy="6" r="1" />
        </svg>
      </button>
      <button id="open-expansion-modal" class="topbar-btn utility-icon" aria-label="Map Expansion" title="Map Expansion">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M8 4H4v4" />
          <path d="M16 4h4v4" />
          <path d="M8 20H4v-4" />
          <path d="M16 20h4v-4" />
          <path d="M4 4l6 6" />
          <path d="M20 4l-6 6" />
          <path d="M4 20l6-6" />
          <path d="M20 20l-6-6" />
        </svg>
      </button>
      <button id="camera-reset" class="topbar-btn utility-icon" aria-label="Fit Station" title="Fit Station">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 9V5h4" />
          <path d="M16 5h4v4" />
          <path d="M20 15v4h-4" />
          <path d="M8 19H4v-4" />
          <path d="M12 8v8" />
          <path d="M8 12h8" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
    </div>
    <div class="sim-controls">
      <span class="sim-clock" id="hud-clock">Cycle 0 | Day 1 | 00:00</span>
      <button id="play" class="icon-btn transport-btn" aria-label="Play">&gt;</button>
      <button id="pause" class="icon-btn transport-btn" aria-label="Pause">||</button>
      <button id="speed-up" class="icon-btn transport-btn" aria-label="Speed Up">&gt;&gt;</button>
      <span class="value speed-pill" id="speed-label">1x</span>
    </div>
  </div>
  <div id="game-wrap">
    <canvas id="game"></canvas>
    <div id="dev-tier-overlay" aria-label="Time to tier (dev mode)" hidden></div>
    <div id="game-stage"></div>
    <div class="floating-stack left-stack" aria-label="Station tasks">
      <details class="hud-card task-card overlay-card" open>
        <summary class="hud-card-title">Tasks</summary>
        <div id="quest-bar" aria-live="polite"></div>
        <div id="tier-checklist" class="tier-checklist">No active checklist</div>
      </details>
      <section id="diagnostic-key" class="hud-card diagnostic-key hidden" aria-live="polite">
        <div class="hud-card-title" id="diagnostic-key-title">Diagnostics</div>
        <div id="diagnostic-key-stats" class="diagnostic-key-stats"></div>
        <div id="diagnostic-key-rows" class="diagnostic-key-rows"></div>
      </section>
    </div>
    <section id="agent-side-panel" class="side-inspector side-agent-panel floating-agent-panel hidden" aria-live="polite">
      <div class="side-inspector-head">
        <h3 id="agent-side-title">Agent Inspector</h3>
        <button id="close-agent-side" class="mini-action-btn">Close</button>
      </div>
      <div id="agent-side-body" class="side-inspector-body">No agent selected.</div>
    </section>
    <div id="bottom-dock">
      <section class="dock-card command-card">
        <div class="hud-card-title">Command</div>
        <div class="command-actions">
          <button id="open-market" class="primary-command">Market</button>
          <button id="open-progression-modal" class="primary-command">Progress</button>
          <button id="edit-priorities" class="secondary-command">Priorities</button>
        </div>
        <div class="traffic-controls">
          <div class="row compact list-row"><span>Traffic rate</span><span class="value" id="ships-label">1</span></div>
          <input class="compact-range" type="range" id="ships" min="0" max="3" step="1" value="1" />
          <small id="traffic-status" class="traffic-status">Paused</small>
        </div>
        <div class="row compact list-row command-note"><span>Crew Mgmt</span><span class="value" id="crew-note">Payroll 0.32c/crew/30s</span></div>
      </section>
      <section class="dock-card selected-card">
        <div class="hud-card-title">Selection</div>
        <div id="selection-summary" class="selection-summary">No room, dock, or resident selected.</div>
        <small id="dock-info">Dock: none selected</small>
        <small id="dock-preview">Dock preview: n/a</small>
      </section>
      <section class="dock-card ops-card">
        <div class="hud-card-title ops-card-head">
          <span>Station Ops</span>
          <button id="open-ops-modal" class="mini-action-btn">Details</button>
        </div>
        <div class="row compact list-row"><span>Crew</span><span class="value" id="crew">Work 0 | Idle 0 | Log 0 | Rest 0 | Block 0</span></div>
        <div class="row compact list-row"><span>Traffic</span><span class="value" id="ops-traffic">Visitors 0 | Ships 0 | Exits 0/min</span></div>
        <div class="row compact list-row"><span>Systems</span><span class="value" id="ops">Caf 0/0 | Food K0/0 H0/0 | LS 0/0 | R 0/0</span></div>
        <div class="row compact list-row"><span>Residents</span><span class="value" id="ops-residents">0 | waiting</span></div>
        <div class="row compact list-row"><span>Jobs</span><span class="value" id="jobs">P0 A0 X0 D0 | none</span></div>
        <small id="critical-staffing-line">Room ops: module/path/pressure checks active; crew posts disabled</small>
      </section>
      <section class="dock-card event-card">
        <div class="hud-card-title">Station Health</div>
        <div class="row compact list-row"><span>Rating</span><span class="value" id="health-rating">70</span></div>
        <small id="resident-conversion-summary">Residents: waiting for eligible visitor exit</small>
        <small id="room-warnings">Room warnings: none</small>
        <small id="visitor-feelings">Visitor feelings: none</small>
        <small id="rating-reasons">Rating drivers: none</small>
        <small id="morale-reasons">Crew morale drivers: none</small>
      </section>
      <section class="dock-card diagnostics-card">
        <div class="hud-card-title">Alerts</div>
        <div id="alert-list" class="alert-list is-clear">No active alerts</div>
        <button id="clear-bodies" class="alert-action">Clear Bodies (-6 supplies)</button>
        <details class="mini-collapse">
          <summary>Diagnostics</summary>
        <div class="row compact list-row"><span>Economy</span><span class="value" id="economy">Supplies 0 | Credits 0</span></div>
        <div class="row compact list-row"><span>Air / Hull</span><span class="value" id="pressure">0% sealed | 0 leaking tiles</span></div>
        <div class="row compact list-row"><span>Power</span><span class="value" id="power">0 / 0</span></div>
        <div class="row compact list-row"><span>Morale</span><span class="value" id="morale">0</span></div>
        <div class="row compact list-row"><span>Rating</span><span class="value" id="station-rating">70</span></div>
        <div class="row compact list-row"><span>Resources</span><span class="value" id="resources">Food 0 | Water 0 | Air 0%</span></div>
        <div class="row compact list-row"><span>Visitors</span><span class="value" id="visitors">0</span></div>
        <div class="row compact list-row"><span>Incidents</span><span class="value" id="incidents">0</span></div>
        <div class="row compact list-row"><span>Docked ships</span><span class="value" id="docked-ships">0</span></div>
        <div class="row compact list-row"><span>Avg dock time</span><span class="value" id="avg-dock-time">0.0s</span></div>
        <div class="row compact list-row"><span>Bay utilization</span><span class="value" id="bay-utilization">0%</span></div>
        <div class="row compact list-row"><span>Exits / min</span><span class="value" id="exits-per-min">0</span></div>
        <small id="air-trend">Air trend: +0.0/s</small>
        <small id="air-blocked-warning">Air warning: none</small>
        <small id="food-flow">Food flow: +0.0 raw/s -> +0.0 meals/s, use 0.0 meals/s</small>
        <small id="economy-flow">Credits/min: +0.0 gross | -0.0 payroll | net +0.0</small>
        <small id="jobs-extra">Avg age 0.0s | Oldest 0.0s | Delivery 0.0s | Stalled 0</small>
        <small id="idle-reasons">Idle reasons: available 0 | no jobs 0 | resting 0 | no path 0 | waiting 0</small>
        <small id="stall-reasons">Stalls: blocked 0 | src 0 | dst 0 | supply 0</small>
        <small id="crew-retargets">Crew retargets/min: 0.0 | visitor service fails/min: 0.0</small>
        <small id="food-chain-hint">Food chain: none</small>
        <small id="demand-strip">Current demand: Caf 0% | Market 0% | Lounge 0%</small>
        <small id="archetype-strip">Visitors: Diner 0 | Shopper 0 | Lounger 0 | Rusher 0</small>
        <small id="ship-type-strip">Ships/min: Tour 0.0 | Trade 0.0 | Ind 0.0 | Mil 0.0 | Col 0.0</small>
        <small id="lane-queues">Lane queues N/E/S/W: 0/0/0/0</small>
        <small id="walk-stats">Visitor route avg: 0.0</small>
        <small id="perf-stats">Perf: tick 0.0ms | render 0.0ms | path 0.0ms</small>
        <small id="berth-summary">Berths: visitor 0/0 | resident 0/0 | resident ships 0</small>
        <small id="resident-loop-summary">Resident loop: convert 0/0 | departures 0 | tax +0.0/min</small>
        <small id="rating-insight-trend">Trend: +0.0/min (stable)</small>
        <small id="rating-insight-rate">Penalty/min: timeout 0.0 | no dock 0.0 | service 0.0 | route length 0.0 | bad routes 0.0</small>
        <small id="rating-insight-bonus">Bonus/min: meals 0.0 | leisure 0.0 | exits 0.0 | residents 0.0</small>
        <small id="rating-insight-service">Service/min: no path 0.0 | missing services 0.0 | patience bail 0.0 | dock timeout 0.0 | trespass 0.0</small>
        <small id="rating-insight-total">Total penalty: timeout 0.0 | no dock 0.0 | service 0.0 | route length 0.0 | bad routes 0.0</small>
        <small id="rating-insight-bonus-total">Total bonus: meals 0.0 | leisure 0.0 | exits 0.0 | residents 0.0</small>
        <small id="rating-insight-service-total">Service total: no path 0.0 | missing services 0.0 | patience bail 0.0 | dock timeout 0.0 | trespass 0.0</small>
        <small id="rating-insight-events">Events: skipped docks 0 | queue timeouts 0 | service fails/min 0.0</small>
        <small id="life-support-status">Life support: active 0 / total 0 (air +0.0/s)</small>
        <small id="air-health">Air health: distressed 0 | critical 0 | deaths 0 (+0 recent)</small>
        <small id="crew-breakdown">Crew: work 0 | idle 0 | resting 0 | logistics 0 | blocked 0</small>
        <small id="crew-shifts">Shifts: resting 0/0 | wake budget 0 | woken 0</small>
        <small id="crew-lockouts">Emergency lockouts prevented: 0</small>
        <small id="ops-extra">Kitchen 0/0 | Workshop 0/0 | Hygiene 0/0 | Hydroponics 0/0 | Life Support 0/0 | Lounge 0/0 | Market 0/0</small>
        <small id="kitchen-status">Kitchen: active 0/0 | raw 0.0 | meal +0.0/s</small>
        <small id="trade-status">Trade: workshop +0.0/s | market use 0.0/s | stock 0.0 | sold/min 0.0 | stockouts/min 0.0</small>
        <small id="room-usage">Usage: to dorm 0 | resting 0 | hygiene 0 | queue 0 | eating 0 | hydro staff 0/0</small>
        <small id="room-flow">Flow/min: dorm 0.0 | hygiene 0.0 | meals 0.0 | dorm fail 0.0</small>
        </details>
      </section>
    </div>
  </div>
  <aside id="panel">
    <h2>Build Palette</h2>
    <div class="palette-tabs" aria-label="Build palette categories">
      <button class="palette-tab active" data-palette-target="structure">Build</button>
      <button class="palette-tab" data-palette-target="rooms">Rooms</button>
      <button class="palette-tab" data-palette-target="modules">Modules</button>
      <button class="palette-tab" data-palette-target="overlays">Overlays</button>
    </div>
    <div id="toolbar" aria-label="Build tools">
      <div class="tool-row palette-section active" data-palette-section="structure">
        <span class="tool-row-label">Structure</span>
        <button class="tool-btn" data-tool-room-copy="1" title="Copy station stamp — drag over floors, walls, rooms, and furniture"><span class="tool-key">⧉</span>Copy</button>
        <button class="tool-btn" data-tool-room-paste="1" title="Paste copied station stamp — tiles, room settings, zones, docks, and fresh furniture"><span class="tool-key">▣</span>Paste</button>
        <button class="tool-btn" data-tool-tile="floor" title="${TRUSS_EXPANSION_EXPERIMENT ? 'Floor (1) - paint over truss to seal a pressurized expansion' : 'Floor (1)'}"><span class="tool-key">1</span>Floor</button>
        ${TRUSS_EXPANSION_EXPERIMENT ? '<button class="tool-btn" data-tool-tile="truss" title="Truss - fast EVA scaffold. Paint Floor over it to seal the station expansion."><span class="tool-key">.</span>Truss</button>' : ''}
        <button class="tool-btn" data-tool-tile="wall" title="Wall (2)"><span class="tool-key">2</span>Wall</button>
        <button class="tool-btn" data-tool-tile="dock" title="Dock (3)"><span class="tool-key">3</span>Dock</button>
        <button class="tool-btn" data-tool-tile="door" title="Door (4)"><span class="tool-key">4</span>Door</button>
        <button class="tool-btn" data-tool-tile="airlock" title="Airlock — EVA access for exterior construction"><span class="tool-key">·</span>Airlock</button>
        <button class="tool-btn" data-tool-cancel-construction="1" title="Cancel build orders by dragging over blueprints"><span class="tool-key">·</span>Cancel Build</button>
        <button class="tool-btn" data-tool-tile="erase" title="Erase (7)"><span class="tool-key">7</span>Erase</button>
        <button class="tool-btn" data-tool-clearroom="1" title="Clear Room (0)"><span class="tool-key">0</span>Clear Room</button>
      </div>
      <div class="tool-row palette-section" data-palette-section="rooms" data-tool-section="rooms">
        <span class="tool-row-label">Rooms</span>
        <button class="tool-btn" data-tool-room="dorm" title="Build Dorm (D)"><span class="tool-key">D</span>Dorm</button>
        <button class="tool-btn" data-tool-room="hygiene" title="Build Hygiene (H)"><span class="tool-key">H</span>Hygiene</button>
        <button class="tool-btn" data-tool-room="hydroponics" title="Build Hydroponics (F)"><span class="tool-key">F</span>Hydroponics</button>
        <button class="tool-btn" data-tool-room="kitchen" title="Build Kitchen (I)"><span class="tool-key">I</span>Kitchen</button>
        <button class="tool-btn" data-tool-room="cafeteria" title="Build Cafeteria (C)"><span class="tool-key">C</span>Cafeteria</button>
        <button class="tool-btn" data-tool-room="life-support" title="Build Life Support (L)"><span class="tool-key">L</span>Life Support</button>
        <button class="tool-btn" data-tool-room="reactor" title="Build Reactor (R)"><span class="tool-key">R</span>Reactor</button>
        <button class="tool-btn" data-tool-room="lounge" title="Build Lounge (U)"><span class="tool-key">U</span>Lounge</button>
        <button class="tool-btn" data-tool-room="market" title="Build Market (K)"><span class="tool-key">K</span>Market</button>
        <button class="tool-btn" data-tool-room="workshop" title="Build Workshop (W)"><span class="tool-key">W</span>Workshop</button>
        <button class="tool-btn" data-tool-room="storage" title="Build Storage (B)"><span class="tool-key">B</span>Storage</button>
        <button class="tool-btn" data-tool-room="logistics-stock" title="Build Logistics Stock (N)"><span class="tool-key">N</span>Logistics</button>
        <button class="tool-btn" data-tool-room="security" title="Build Security (S)"><span class="tool-key">S</span>Security</button>
        <button class="tool-btn" data-tool-room="clinic" title="Build Clinic (Y)"><span class="tool-key">Y</span>Clinic</button>
        <button class="tool-btn" data-tool-room="brig" title="Build Brig (J)"><span class="tool-key">J</span>Brig</button>
        <button class="tool-btn" data-tool-room="rec-hall" title="Build Rec Hall (A)"><span class="tool-key">A</span>Rec Hall</button>
        <button class="tool-btn" data-tool-room="berth" title="Build Berth (E) — dock-migration v0"><span class="tool-key">E</span>Berth</button>
        <button class="tool-btn" data-tool-room="cantina" title="Build Cantina — drinks bar, social leisure for crew/visitors/residents"><span class="tool-key">·</span>Cantina</button>
        <button class="tool-btn" data-tool-room="observatory" title="Build Observatory (T3+) — premium leisure with wonder bonus"><span class="tool-key">·</span>Observ.</button>
      </div>
      <div class="tool-row palette-section" data-palette-section="modules" data-tool-section="modules">
        <span class="tool-row-label">Furniture</span>
        <button class="tool-btn" data-tool-module="bed" title="Place Bed (Q)"><span class="tool-key">Q</span>Bed</button>
        <button class="tool-btn" data-tool-module="table" title="Place Table (T)"><span class="tool-key">T</span>Table</button>
        <button class="tool-btn" data-tool-module="serving-station" title="Place Serving Station (5)"><span class="tool-key">5</span>Serving</button>
        <button class="tool-btn" data-tool-module="stove" title="Place Stove (V)"><span class="tool-key">V</span>Stove</button>
        <button class="tool-btn" data-tool-module="grow-station" title="Place Grow Station (G)"><span class="tool-key">G</span>Grow</button>
        <button class="tool-btn" data-tool-module="shower" title="Place Shower (;)"><span class="tool-key">;</span>Shower</button>
        <button class="tool-btn" data-tool-module="sink" title="Place Sink (')"><span class="tool-key">'</span>Sink</button>
        <button class="tool-btn" data-tool-module="wall-light" title="Place Wall Light (\`)"><span class="tool-key">\`</span>Light</button>
        <button class="tool-btn" data-tool-module="couch" title="Place Couch (6)"><span class="tool-key">6</span>Couch</button>
        <button class="tool-btn" data-tool-module="game-station" title="Place Game Station (=)"><span class="tool-key">=</span>Game</button>
        <button class="tool-btn" data-tool-module="market-stall" title="Place Market Stall (-)"><span class="tool-key">-</span>Stall</button>
        <button class="tool-btn" data-tool-module="workbench" title="Place Workbench (P)"><span class="tool-key">P</span>Bench</button>
        <button class="tool-btn" data-tool-module="intake-pallet" title="Place Intake Pallet (,)"><span class="tool-key">,</span>Intake</button>
        <button class="tool-btn" data-tool-module="storage-rack" title="Place Storage Rack (.)"><span class="tool-key">.</span>Rack</button>
        <button class="tool-btn" data-tool-module="terminal" title="Place Security Terminal (M)"><span class="tool-key">M</span>Terminal</button>
        <button class="tool-btn" data-tool-module="cell-console" title="Place Cell Console (/)"><span class="tool-key">/</span>Cell</button>
        <button class="tool-btn" data-tool-module="rec-unit" title="Place Rec Unit (\\)"><span class="tool-key">\\</span>Rec</button>
        <button class="tool-btn" data-tool-module="med-bed" title="Place Med Bed (Z)"><span class="tool-key">Z</span>Med Bed</button>
        <button class="tool-btn" data-tool-module="gangway" title="Place Gangway (Berth-only) — dock-migration v0"><span class="tool-key">·</span>Gangway</button>
        <button class="tool-btn" data-tool-module="customs-counter" title="Place Customs Counter (Berth-only) — dock-migration v0"><span class="tool-key">·</span>Customs</button>
        <button class="tool-btn" data-tool-module="cargo-arm" title="Place Cargo Arm (Berth-only) — dock-migration v0"><span class="tool-key">·</span>Cargo</button>
        <button class="tool-btn" data-tool-module="fire-extinguisher" title="Place wall Fire Extinguisher — suppresses nearby fires from an adjacent service tile"><span class="tool-key">·</span>Fire Ext</button>
        <button class="tool-btn" data-tool-module="vent" title="Place wall Vent — projects life-support air from an adjacent service tile"><span class="tool-key">·</span>Vent</button>
        <button class="tool-btn" data-tool-module="vending-machine" title="Place Vending Machine (T1+) — visitors in leisure spend extra credits on this tile"><span class="tool-key">·</span>Vending</button>
        <button class="tool-btn" data-tool-module="bench" title="Place Bench (T1+) — leisure seating in social rooms; small comfort bonus"><span class="tool-key">·</span>Bench</button>
        <button class="tool-btn" data-tool-module="bar-counter" title="Place Bar Counter (Cantina-only) — drink service anchor"><span class="tool-key">·</span>Bar</button>
        <button class="tool-btn" data-tool-module="tap" title="Place Tap (Cantina-only) — increases drink throughput"><span class="tool-key">·</span>Tap</button>
        <button class="tool-btn" data-tool-module="telescope" title="Place Telescope (Observatory-only, T3+) — wonder leisure bonus"><span class="tool-key">·</span>Telesc.</button>
        <button class="tool-btn" data-tool-module="water-fountain" title="Place Water Fountain — basic crew thirst relief"><span class="tool-key">·</span>Water</button>
        <button class="tool-btn" data-tool-module="plant" title="Place Plant (T1+) — small comfort/appeal bonus"><span class="tool-key">·</span>Plant</button>
        <button class="tool-btn" data-tool-module="clear" title="Clear module (X)"><span class="tool-key">X</span>Clear</button>
        <button class="tool-btn utility-tool" data-tool-rotate="1" title="Rotate module ([ / ])"><span class="tool-key">[ ]</span>Rotate</button>
        <button class="tool-btn utility-tool" data-tool-deselect="1" title="Deselect tool (Esc)"><span class="tool-key">Esc</span>None</button>
      </div>
      <div class="tool-row palette-section" data-palette-section="overlays">
        <span class="tool-row-label">Overlays</span>
        <button class="tool-btn" data-tool-zone="public" title="Paint Public zone (8)"><span class="tool-key">8</span>Public</button>
        <button class="tool-btn" data-tool-zone="restricted" title="Paint Restricted zone (9)"><span class="tool-key">9</span>Restricted</button>
        <button id="toggle-zones" class="tool-btn overlay-toggle">Zones: OFF</button>
        <button id="toggle-service-nodes" class="tool-btn overlay-toggle">Service Nodes: OFF</button>
        <button id="toggle-inventory-overlay" class="tool-btn overlay-toggle">Inventory Overlay: OFF</button>
        <button id="toggle-glow" class="tool-btn overlay-toggle">Glow: ON</button>
        <span class="tool-row-label diagnostic-row-label">Diagnostics</span>
        <button class="tool-btn diagnostic-toggle" data-diagnostic-overlay="none" title="Hide diagnostic heatmaps">Diagnostics: OFF</button>
        <button class="tool-btn diagnostic-toggle" data-diagnostic-overlay="life-support" title="Show life-support coverage heatmap">Air Coverage</button>
        <button class="tool-btn diagnostic-toggle" data-diagnostic-overlay="visitor-status" title="Show visitor status heatmap">Visitor Status</button>
        <button class="tool-btn diagnostic-toggle" data-diagnostic-overlay="resident-comfort" title="Show resident comfort heatmap">Resident Comfort</button>
        <button class="tool-btn diagnostic-toggle" data-diagnostic-overlay="service-noise" title="Show service noise heatmap">Service Noise</button>
        <button class="tool-btn diagnostic-toggle" data-diagnostic-overlay="maintenance" title="Show maintenance debt heatmap">Maintenance</button>
        <button class="tool-btn diagnostic-toggle" data-diagnostic-overlay="route-pressure" title="Show active route pressure heatmap">Route Pressure</button>
        <small id="diagnostic-readout" class="diagnostic-readout">Diagnostics off</small>
        <button id="toggle-sprites" class="tool-btn overlay-toggle">Sprites: OFF</button>
        <button id="toggle-sprite-fallback" class="tool-btn overlay-toggle">Force Fallback: OFF</button>
      </div>
    </div>
  </aside>
  <div class="hidden-controls" aria-hidden="true">
    <span id="tax-label">20%</span>
    <input type="range" id="tax" min="0" max="50" step="1" value="20" tabindex="-1" />
  </div>
  <div id="save-modal" class="modal hidden">
    <div class="modal-card save-modal-card">
      <div class="modal-head">
        <h2>Save / Load</h2>
        <button id="close-save-modal" class="ghost-btn">Close</button>
      </div>
      <div class="row compact list-row"><span>Save Name</span><span class="value">New Slot</span></div>
      <input id="save-name" type="text" placeholder="My test station" maxlength="80" />
      <div class="button-row">
        <button id="save-create">Save</button>
        <button id="save-quicksave">Quicksave</button>
      </div>
      <div class="row compact list-row"><span>Saved Slots</span><span class="value" id="save-count">0</span></div>
      <select id="save-slot-select"></select>
      <div class="button-row">
        <button id="save-load">Load</button>
        <button id="save-delete">Delete</button>
        <button id="save-download">Download JSON</button>
      </div>
      <small>Selected save summary:</small>
      <textarea id="save-export" class="save-textarea" readonly spellcheck="false"></textarea>
      <small>Import save JSON as a new slot:</small>
      <textarea id="save-import" class="save-textarea" spellcheck="false"></textarea>
      <button id="save-import-btn">Import as New Save</button>
      <small id="save-status" class="save-status">No saves yet.</small>
    </div>
  </div>
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
        <button id="buy-small">Buy +25 Supplies (20c)</button>
        <button id="sell-small">Sell -25 Supplies (+10c)</button>
      </div>
      <div class="button-row">
        <button id="buy-large">Buy +80 Supplies (55c)</button>
        <button id="sell-large">Sell -80 Supplies (+28c)</button>
      </div>
      <div class="row compact list-row"><span>Auto Supplies</span><span class="value"><label><input id="material-auto-import" type="checkbox" /> Enabled</label></span></div>
      <div class="row compact list-row"><span>Supply Target</span><span class="value"><input id="material-target-stock" type="number" min="0" max="500" step="5" value="120" /></span></div>
      <div class="row compact list-row"><span>Import Batch</span><span class="value"><input id="material-import-batch" type="number" min="1" max="160" step="1" value="25" /></span></div>
      <small id="material-import-status" class="market-status">Auto import: target met</small>
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
  <div id="expansion-modal" class="modal hidden">
    <div class="modal-card expansion-modal-card">
      <div class="modal-head">
        <h2>Map Expansion</h2>
        <button id="close-expansion-modal" class="ghost-btn">Close</button>
      </div>
      <small id="expansion-next-cost">Next expansion cost: 2000c</small>
      <div class="button-row">
        <button id="expand-north">Expand North</button>
        <button id="expand-east">Expand East</button>
      </div>
      <div class="button-row">
        <button id="expand-south">Expand South</button>
        <button id="expand-west">Expand West</button>
      </div>
      <small id="expansion-status">Directions expanded: none</small>
    </div>
  </div>
  <div id="progression-modal" class="modal hidden">
    <div class="modal-card progression-modal-card">
      <div class="modal-head">
        <h2>Station Progression</h2>
        <button id="close-progression-modal" class="ghost-btn">Close</button>
      </div>
      <div class="progression-hero">
        <div id="progress-modal-tier-name" class="progression-tier-name">Tier 0: Founding Outpost</div>
        <small id="progress-modal-tier-theme" class="progression-tier-theme">Keep oxygen, food, and beds stable before adding complexity.</small>
        <div class="tier-progress-track tier-progress-track-lg"><div id="progress-modal-fill" class="tier-progress-fill"></div></div>
        <div class="row compact list-row">
          <span id="progress-modal-pct">Progress: 0%</span>
          <span class="value" id="progress-modal-goal">Goal: meet next-tier requirements</span>
        </div>
      </div>
      <div class="progression-section">
        <div class="section-title">Next Tier Unlocks</div>
        <small id="progress-modal-next-tier-name">Tier 1 - Settled Ring</small>
        <small id="progress-modal-next-criteria">Unlock Requirement: first visitor arrives</small>
        <small id="progress-modal-next-buildings">New Buildings: Lounge, Market</small>
        <small id="progress-modal-next-needs">New Citizen Needs: social need now matters via lounge access</small>
        <small id="progress-modal-next-visitor-needs">New Visitor/Ship Needs: lounge and market demand appears in manifests</small>
        <small id="progress-modal-next-ships">New Ship Families: no new family at Tier 1</small>
        <small id="progress-modal-next-systems">New Systems: leisure + market service now affects ratings and economy</small>
      </div>
      <div class="progression-section">
        <div class="section-title">Tier Roadmap</div>
        <div id="progress-modal-roadmap"></div>
      </div>
    </div>
  </div>
  <div id="priority-modal" class="modal hidden">
    <div class="modal-card">
      <div class="modal-head">
        <h2>Crew Priorities</h2>
        <button id="close-priority" class="ghost-btn">Close</button>
      </div>
      <div class="row compact list-row">
        <span>Preset</span>
        <select id="crew-priority-preset">
          <option value="balanced">Balanced</option>
          <option value="life-support">Life Support</option>
          <option value="food-chain">Food Chain</option>
          <option value="economy">Economy</option>
        </select>
      </div>
      <div class="priority-grid">
        <label class="priority-row">Life Support <input type="range" min="1" max="10" step="1" data-priority="life-support" /><span id="prio-life-support">1</span></label>
        <label class="priority-row">Reactor <input type="range" min="1" max="10" step="1" data-priority="reactor" /><span id="prio-reactor">1</span></label>
        <label class="priority-row">Hydroponics <input type="range" min="1" max="10" step="1" data-priority="hydroponics" /><span id="prio-hydroponics">1</span></label>
        <label class="priority-row">Kitchen <input type="range" min="1" max="10" step="1" data-priority="kitchen" /><span id="prio-kitchen">1</span></label>
        <label class="priority-row">Workshop <input type="range" min="1" max="10" step="1" data-priority="workshop" /><span id="prio-workshop">1</span></label>
        <label class="priority-row">Cafeteria <input type="range" min="1" max="10" step="1" data-priority="cafeteria" /><span id="prio-cafeteria">1</span></label>
        <label class="priority-row">Market <input type="range" min="1" max="10" step="1" data-priority="market" /><span id="prio-market">1</span></label>
        <label class="priority-row">Lounge <input type="range" min="1" max="10" step="1" data-priority="lounge" /><span id="prio-lounge">1</span></label>
        <label class="priority-row">Security <input type="range" min="1" max="10" step="1" data-priority="security" /><span id="prio-security">1</span></label>
        <label class="priority-row">Hygiene <input type="range" min="1" max="10" step="1" data-priority="hygiene" /><span id="prio-hygiene">1</span></label>
      </div>
    </div>
  </div>
  <div id="ops-modal" class="modal hidden">
    <div class="modal-card ops-modal-card">
      <div class="modal-head">
        <h2>Station Ops</h2>
        <button id="close-ops-modal" class="ghost-btn">Close</button>
      </div>
      <div class="ops-modal-summary" aria-label="Crew work state summary">
        <div class="ops-state-chip"><span>Work</span><strong id="ops-chip-work">0</strong></div>
        <div class="ops-state-chip"><span>Idle</span><strong id="ops-chip-idle">0</strong></div>
        <div class="ops-state-chip"><span>Logistics</span><strong id="ops-chip-logistics">0</strong></div>
        <div class="ops-state-chip"><span>Resting</span><strong id="ops-chip-resting">0</strong></div>
        <div class="ops-state-chip blocked"><span>Blocked</span><strong id="ops-chip-blocked">0</strong></div>
      </div>
      <div class="ops-modal-tabs" aria-label="Station ops sections">
        <button id="ops-tab-crew" class="ops-tab-btn" data-ops-tab="crew">Crew</button>
        <button id="ops-tab-jobs" class="ops-tab-btn active" data-ops-tab="jobs">Jobs</button>
        <button id="ops-tab-rooms" class="ops-tab-btn" data-ops-tab="rooms">Rooms</button>
        <button id="ops-tab-food" class="ops-tab-btn" data-ops-tab="food">Food</button>
        <button id="ops-tab-traffic" class="ops-tab-btn" data-ops-tab="traffic">Traffic</button>
      </div>
      <div class="ops-modal-grid">
        <section class="ops-modal-section ops-tab-panel" data-ops-panel="crew">
          <div class="section-title">Crew State</div>
          <div id="ops-modal-idle" class="metric-list" data-metric-title="Idle">Idle reasons</div>
          <small id="ops-modal-crew-why" class="ops-note">Crew: no blockers</small>
          <div id="ops-modal-shifts" class="metric-list" data-metric-title="Rest">Rest shifts</div>
          <div id="ops-modal-crew-needs" class="metric-list" data-metric-title="Needs">Crew needs</div>
          <div id="ops-modal-staffing" class="metric-list" data-metric-title="Room Ops">Room operations</div>
          <div id="ops-modal-duty-transit" class="metric-list" data-metric-title="Dispatch">Job dispatch</div>
        </section>
        <section class="ops-modal-section ops-tab-panel active" data-ops-panel="jobs">
          <div class="section-title">Jobs</div>
          <div id="ops-modal-jobs" class="metric-list" data-metric-title="Queue">Queue</div>
          <div id="ops-modal-pending-work" class="ops-detail-list" data-detail-title="Pending Work">Pending work</div>
          <div id="ops-modal-job-extra" class="metric-list" data-metric-title="Timing">Timing</div>
          <div id="ops-modal-stalls" class="metric-list" data-metric-title="Stalls">Stalls</div>
          <div id="ops-modal-expired" class="metric-list" data-metric-title="Expired Why">Expired reasons</div>
          <div id="ops-modal-expired-work" class="ops-detail-list" data-detail-title="Expired Work">Expired work</div>
          <div id="ops-modal-expired-context" class="metric-list" data-metric-title="Expired At">Expired context</div>
          <div id="ops-modal-retargets" class="metric-list" data-metric-title="Dispatch">Dispatch</div>
          <small id="ops-modal-job-why" class="ops-note">Jobs: queue healthy</small>
        </section>
        <section class="ops-modal-section ops-tab-panel" data-ops-panel="rooms">
          <div class="section-title">Rooms & Systems</div>
          <div id="ops-modal-room-health" class="metric-list" data-metric-title="Health">Room health</div>
          <div id="ops-modal-room-warnings" class="ops-detail-list" data-detail-title="Warnings">Room warnings</div>
          <div id="ops-modal-systems" class="metric-list" data-metric-title="Core">Core systems</div>
          <div id="ops-modal-systems-extra" class="metric-list" data-metric-title="Service">Service rooms</div>
          <div id="ops-modal-life-support" class="metric-list" data-metric-title="Life Support">Life support</div>
          <div id="ops-modal-room-usage" class="metric-list" data-metric-title="Usage">Room usage</div>
          <div id="ops-modal-room-flow" class="metric-list" data-metric-title="Flow">Flow</div>
          <small id="ops-modal-room-why" class="ops-note">Rooms: no warnings</small>
        </section>
        <section class="ops-modal-section ops-tab-panel" data-ops-panel="food">
          <div class="section-title">Food & Trade</div>
          <div id="ops-modal-food-flow" class="metric-list" data-metric-title="Food Flow">Food flow</div>
          <div id="ops-modal-kitchen" class="metric-list" data-metric-title="Kitchen">Kitchen</div>
          <div id="ops-modal-trade" class="metric-list" data-metric-title="Trade">Trade</div>
          <small id="ops-modal-food-chain" class="ops-note">Food chain: none</small>
        </section>
        <section class="ops-modal-section ops-tab-panel" data-ops-panel="traffic">
          <div class="section-title">Traffic, Visitors & Residents</div>
          <div class="ops-modal-traffic-grid">
            <div id="ops-modal-traffic" class="metric-list" data-metric-title="Traffic">Traffic</div>
            <div id="ops-modal-berths" class="metric-list" data-metric-title="Berths">Berths</div>
          </div>
          <div id="ops-modal-demand" class="metric-list" data-metric-title="Demand">Demand</div>
          <div id="ops-modal-archetypes" class="metric-list" data-metric-title="Visitor Mix">Visitors</div>
          <div id="ops-modal-resident-conversion" class="metric-list" data-metric-title="Resident Conversion">Resident conversion</div>
          <div id="ops-modal-resident-needs" class="metric-list" data-metric-title="Residents">Resident needs</div>
          <div id="ops-modal-ships" class="metric-list" data-metric-title="Ships / Min">Ships</div>
          <div id="ops-modal-walk" class="metric-list" data-metric-title="Movement">Walk</div>
          <div id="ops-modal-rating-penalties" class="metric-list" data-metric-title="Rating Penalties">Rating penalties</div>
          <div id="ops-modal-rating-bonuses" class="metric-list" data-metric-title="Rating Bonuses">Rating bonuses</div>
          <div id="ops-modal-rating-failures" class="metric-list" data-metric-title="Failure Why">Service failures</div>
          <small id="ops-modal-rating">Station rating drivers: none</small>
        </section>
      </div>
    </div>
  </div>
  <div id="dock-modal" class="modal hidden">
    <div class="modal-card">
      <div class="modal-head">
        <h2>Dock Config</h2>
        <button id="close-dock" class="ghost-btn">Close</button>
      </div>
      <div class="row compact list-row"><span>Dock</span><span class="value" id="dock-modal-id">none</span></div>
      <div class="row compact list-row"><span>Zone Area</span><span class="value" id="dock-modal-area">0</span></div>
      <div class="row compact list-row"><span>Max Size</span><span class="value" id="dock-modal-max-size">small</span></div>
      <div class="row" style="margin-top:8px;"><span>Purpose</span><span class="value" id="dock-modal-purpose-label">Visitor</span></div>
      <select id="dock-modal-purpose">
        <option value="visitor">Visitor Berth</option>
        <option value="residential">Residential Berth</option>
      </select>
      <div class="row" style="margin-top:8px;"><span>Facing</span><span class="value" id="dock-modal-facing-label">North</span></div>
      <select id="dock-modal-facing">
        <option value="north">North</option>
        <option value="east">East</option>
        <option value="south">South</option>
        <option value="west">West</option>
      </select>
      <small id="dock-modal-error">Facing status: ok</small>
      <div class="section-title" style="margin-top:10px;">Allowed Ship Types</div>
      <label><input type="checkbox" id="dock-modal-tourist" checked /> Tourist</label>
      <label><input type="checkbox" id="dock-modal-trader" /> Trader</label>
      <label><input type="checkbox" id="dock-modal-industrial" /> Industrial</label>
      <label><input type="checkbox" id="dock-modal-military" /> Military (Tier 3)</label>
      <label><input type="checkbox" id="dock-modal-colonist" /> Colonist (Tier 3)</label>
      <div class="section-title" style="margin-top:10px;">Allowed Ship Sizes</div>
      <label><input type="checkbox" id="dock-modal-small" checked /> Small</label>
      <label><input type="checkbox" id="dock-modal-medium" checked /> Medium</label>
      <label><input type="checkbox" id="dock-modal-large" checked /> Large</label>
    </div>
  </div>
  <div id="room-modal" class="modal hidden">
    <div class="modal-card">
      <div class="modal-head">
        <h2>Room Inspector</h2>
        <button id="close-room" class="ghost-btn">Close</button>
      </div>
      <div class="row compact list-row"><span>Room</span><span class="value" id="room-modal-type">none</span></div>
      <div class="row compact list-row"><span>Status</span><span class="value" id="room-modal-status">inactive</span></div>
      <div class="row compact list-row"><span>Cluster</span><span class="value" id="room-modal-cluster">0 tiles</span></div>
      <div class="row compact list-row"><span>Doors</span><span class="value" id="room-modal-doors">0</span></div>
      <div class="row compact list-row"><span>Pressurization</span><span class="value" id="room-modal-pressure">0%</span></div>
      <div class="row compact list-row"><span>Staff</span><span class="value" id="room-modal-staff">0/0</span></div>
      <div class="row compact list-row"><span>Service Nodes</span><span class="value" id="room-modal-nodes">0</span></div>
      <small id="room-modal-inventory">Inventory: n/a</small>
      <small id="room-modal-flow">Flow: n/a</small>
      <small id="room-modal-capacity">Capacity: n/a</small>
      <div class="row compact list-row"><span>Housing Policy</span><span class="value" id="room-modal-housing-policy">n/a</span></div>
      <select id="room-modal-housing-select">
        <option value="crew">Crew</option>
        <option value="visitor">Visitor/Shared</option>
        <option value="resident">Resident Shared</option>
        <option value="private_resident">Private Resident</option>
      </select>
      <small id="room-modal-housing">Housing: n/a</small>
      <small id="room-modal-berth">Berth: n/a</small>
      <small id="room-modal-reasons">Inactive reasons: none</small>
      <small id="room-modal-warnings">Warnings: none</small>
      <small id="room-modal-hints">Hints: none</small>
    </div>
  </div>
  <div id="system-map-modal" class="modal hidden">
    <div class="modal-card system-map-modal-card">
      <div class="modal-head">
        <h2>System Map</h2>
        <button id="close-system-map" class="ghost-btn">Close</button>
      </div>
      <small id="system-map-summary" class="system-map-summary">Loading...</small>
      <canvas id="system-map-canvas" width="520" height="520" aria-label="Star system map"></canvas>
      <div id="system-map-factions" class="system-map-factions"></div>
      <div id="system-map-lanes" class="system-map-lanes"></div>
    </div>
  </div>
  <div id="agent-modal" class="modal hidden">
    <div class="modal-card">
      <div class="modal-head">
        <h2>Agent Inspector</h2>
        <button id="close-agent" class="ghost-btn">Close</button>
      </div>
      <div class="row compact list-row"><span>Type</span><span class="value" id="agent-kind">none</span></div>
      <div class="row compact list-row"><span>ID</span><span class="value" id="agent-id">n/a</span></div>
      <div class="row compact list-row"><span>State</span><span class="value" id="agent-state">n/a</span></div>
      <div class="row compact list-row"><span>Action</span><span class="value" id="agent-action">n/a</span></div>
      <small id="agent-reason">Reason: n/a</small>
      <div class="row compact list-row"><span>Desire</span><span class="value" id="agent-desire">n/a</span></div>
      <div class="row compact list-row"><span>Target</span><span class="value" id="agent-target">n/a</span></div>
      <div class="row compact list-row"><span>Path</span><span class="value" id="agent-path">0</span></div>
      <div class="row compact list-row"><span>Health</span><span class="value" id="agent-health">healthy</span></div>
      <div class="row compact list-row"><span>Blocked Ticks</span><span class="value" id="agent-blocked">0</span></div>
      <small id="agent-visitor-details">Visitor: n/a</small>
      <small id="agent-resident-details">Resident: n/a</small>
      <small id="agent-crew-details">Crew: n/a</small>
    </div>
  </div>
`;

const gameWrapEl = document.querySelector<HTMLDivElement>('#game-wrap');
if (!gameWrapEl) throw new Error('Game wrapper not found');
const gameWrap: HTMLDivElement = gameWrapEl;

const gameStageEl = document.querySelector<HTMLDivElement>('#game-stage');
if (!gameStageEl) throw new Error('Game stage not found');
const gameStage: HTMLDivElement = gameStageEl;

const canvasEl = document.querySelector<HTMLCanvasElement>('#game');
if (!canvasEl) throw new Error('Canvas not found');
const canvas: HTMLCanvasElement = canvasEl;

const ctxMaybe = canvas.getContext('2d', { alpha: false, desynchronized: true });
if (!ctxMaybe) throw new Error('2d context unavailable');
const ctx: CanvasRenderingContext2D = ctxMaybe;

const state = createInitialState();

// T0 onboarding: pre-place a 2-tile visitor dock on the starter hull so
// ships arrive on a fresh start without the player painting one first.
// Keep it core-relative because the starter grid can grow while the
// sealed room stays centered.
const starterCore = fromIndex(state.core.centerTile, state.width);
const starterDockX = starterCore.x + 5;
for (let dockY = starterCore.y - 3; dockY <= starterCore.y - 2; dockY++) {
  setTile(state, toIndex(starterDockX, dockY, state.width), TileType.Dock);
}

// ?scenario=<name> thin-spec cold-start loader: skip the starter grind
// for sprite/UX iteration. Whitelisted fixtures in COLD_START_SCENARIOS
// (src/sim/cold-start-scenarios.ts) overlay tier-relevant counters + unlock
// state onto the fresh starter. Unknown names warn and fall through.
// ?load= / ?loadId= take precedence — those fully hydrate state, so
// combining with ?scenario= would silently drop the scenario overlay.
// Warn on the ambiguity rather than applying both.
(function applyScenarioParam() {
  const params = new URLSearchParams(location.search);
  const name = params.get('scenario');
  if (!name) return;
  if (params.has('load') || params.has('loadId')) {
    console.warn(
      `[scenario] '${name}' ignored — ?load/?loadId takes precedence (full state replacement).`
    );
    return;
  }
  const applied = applyColdStartScenario(state, name);
  if (applied) {
    console.info(`[scenario] applied '${name}'`);
  } else {
    console.warn(
      `[scenario] unknown name '${name}'; known: ${COLD_START_SCENARIO_NAMES.join(', ')}`
    );
  }
})();

// ?walls=dual flips the dual-tilemap wall renderer on for this session.
// Feature-flagged behind Controls.wallRenderMode; per-cell remains default.
(function applyWallsParam() {
  const params = new URLSearchParams(location.search);
  const walls = params.get('walls');
  if (walls === 'dual' || walls === 'dual-tilemap') {
    state.controls.wallRenderMode = 'dual-tilemap';
    console.info('[walls] dual-tilemap wall renderer enabled via URL param');
  } else if (walls === 'per-cell') {
    state.controls.wallRenderMode = 'per-cell';
  }
})();

let spriteAtlas: SpriteAtlas = createEmptySpriteAtlas();
let zoom = 1;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.5;
const FIT_MIN_ZOOM = 0.1;
const FIT_STATION_MAX_ZOOM = 1.4;
const FIT_STATION_MARGIN_TILES = 8;
const EXPANSION_STEP_TILES = 40;
const PAN_PADDING_MIN = 720;
let mapOffsetX = 0;
let mapOffsetY = 0;

function applyCanvasSize(): void {
  const dpr = window.devicePixelRatio || 1;
  const viewportWidth = Math.max(1, Math.ceil(gameWrap.clientWidth));
  const viewportHeight = Math.max(1, Math.ceil(gameWrap.clientHeight));
  canvas.width = Math.ceil(viewportWidth * dpr);
  canvas.height = Math.ceil(viewportHeight * dpr);
  canvas.style.width = `${viewportWidth}px`;
  canvas.style.height = `${viewportHeight}px`;
}
applyCanvasSize();

const shipsInput = document.querySelector<HTMLInputElement>('#ships')!;
const shipsLabel = document.querySelector<HTMLSpanElement>('#ships-label')!;
const trafficStatusEl = document.querySelector<HTMLElement>('#traffic-status')!;
const taxInput = document.querySelector<HTMLInputElement>('#tax')!;
const taxLabel = document.querySelector<HTMLSpanElement>('#tax-label')!;
const expansionNextCostEl = document.querySelector<HTMLElement>('#expansion-next-cost')!;
const expansionStatusEl = document.querySelector<HTMLElement>('#expansion-status')!;
const expandNorthBtn = document.querySelector<HTMLButtonElement>('#expand-north')!;
const expandEastBtn = document.querySelector<HTMLButtonElement>('#expand-east')!;
const expandSouthBtn = document.querySelector<HTMLButtonElement>('#expand-south')!;
const expandWestBtn = document.querySelector<HTMLButtonElement>('#expand-west')!;
const playBtn = document.querySelector<HTMLButtonElement>('#play')!;
const pauseBtn = document.querySelector<HTMLButtonElement>('#pause')!;
const speedUpBtn = document.querySelector<HTMLButtonElement>('#speed-up')!;
const speedLabel = document.querySelector<HTMLSpanElement>('#speed-label')!;
const toggleZonesBtn = document.querySelector<HTMLButtonElement>('#toggle-zones')!;
const toggleServiceNodesBtn = document.querySelector<HTMLButtonElement>('#toggle-service-nodes')!;
const toggleInventoryOverlayBtn = document.querySelector<HTMLButtonElement>('#toggle-inventory-overlay')!;
const toggleGlowBtn = document.querySelector<HTMLButtonElement>('#toggle-glow')!;
const toggleSpritesBtn = document.querySelector<HTMLButtonElement>('#toggle-sprites')!;
const toggleSpriteFallbackBtn = document.querySelector<HTMLButtonElement>('#toggle-sprite-fallback')!;
const diagnosticOverlayBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-diagnostic-overlay]'));
const diagnosticReadoutEl = document.querySelector<HTMLElement>('#diagnostic-readout')!;
const diagnosticKeyEl = document.querySelector<HTMLElement>('#diagnostic-key')!;
const diagnosticKeyTitleEl = document.querySelector<HTMLElement>('#diagnostic-key-title')!;
const diagnosticKeyStatsEl = document.querySelector<HTMLElement>('#diagnostic-key-stats')!;
const diagnosticKeyRowsEl = document.querySelector<HTMLElement>('#diagnostic-key-rows')!;
const spriteStatusEl = document.querySelector<HTMLElement>('#sprite-status')!;

const DIAGNOSTIC_OVERLAY_LABELS: Record<DiagnosticOverlay, string> = {
  none: 'Diagnostics',
  'life-support': 'Air Coverage',
  'visitor-status': 'Visitor Status',
  'resident-comfort': 'Resident Comfort',
  'service-noise': 'Service Noise',
  maintenance: 'Maintenance',
  'route-pressure': 'Route Pressure'
};
const DIAGNOSTIC_OVERLAYS: DiagnosticOverlay[] = [
  'none',
  'life-support',
  'visitor-status',
  'resident-comfort',
  'service-noise',
  'maintenance',
  'route-pressure'
];

function isDiagnosticOverlay(value: string | undefined): value is DiagnosticOverlay {
  return DIAGNOSTIC_OVERLAYS.includes(value as DiagnosticOverlay);
}

let lastDiagnosticReadoutText = '';
let lastDiagnosticKeySignature = '';

type DiagnosticKeyRow = {
  color: string;
  label: string;
};

type DiagnosticKeyModel = {
  title: string;
  stats: string;
  rows: DiagnosticKeyRow[];
};

function diagnosticHoverPrefix(): string {
  if (hoveredTile === null || hoveredTile < 0 || hoveredTile >= state.tiles.length) return 'Hover a tile for local values.';
  const p = fromIndex(hoveredTile, state.width);
  return `Tile ${p.x},${p.y}`;
}

function diagnosticReadoutText(): string {
  const overlay = state.controls.diagnosticOverlay;
  if (overlay === 'none') return 'Diagnostics off';
  if (overlay === 'life-support') {
    const globalLine = `Air: ${state.metrics.lifeSupportCoveragePct.toFixed(0)}% covered | poor ${state.metrics.poorLifeSupportTiles}`;
    if (hoveredTile === null) return `${globalLine}\nHover a tile to see source distance and risk.`;
    const p = fromIndex(hoveredTile, state.width);
    const diagnostic = getLifeSupportTileDiagnostic(state, p.x, p.y);
    if (!diagnostic?.walkablePressurized) return `${globalLine}\n${diagnosticHoverPrefix()}: not pressurized/walkable.`;
    if (!diagnostic.hasLifeSupportSystem) return `${globalLine}\n${diagnosticHoverPrefix()}: no life-support system built yet.`;
    if (diagnostic.noActiveSource) return `${globalLine}\n${diagnosticHoverPrefix()}: no active source; oxygen risk.`;
    if (!diagnostic.reachable) return `${globalLine}\n${diagnosticHoverPrefix()}: disconnected from active air.`;
    return `${globalLine}\n${diagnosticHoverPrefix()}: distance ${diagnostic.distance ?? 0}; ${diagnostic.poorCoverage ? 'poor room readiness' : 'covered'}.`;
  }
  if (overlay === 'maintenance') {
    const globalLine = `Maintenance: max ${state.metrics.maintenanceDebtMax.toFixed(0)}% | open ${state.metrics.maintenanceJobsOpen}`;
    if (hoveredTile === null) return `${globalLine}\nHover reactor or life-support tiles for output loss.`;
    const p = fromIndex(hoveredTile, state.width);
    const diagnostic = getMaintenanceTileDiagnostic(state, p.x, p.y);
    if (!diagnostic) return `${globalLine}\n${diagnosticHoverPrefix()}: no system debt here.`;
    return `${globalLine}\n${diagnosticHoverPrefix()}: ${diagnostic.system} debt ${diagnostic.debt.toFixed(0)}%; output ${(diagnostic.outputMultiplier * 100).toFixed(0)}%.`;
  }
  if (overlay === 'route-pressure') {
    const routePressure = getRoutePressureDiagnostics(state);
    const globalLine = `Routes: ${routePressure.activePaths} active | ${routePressure.pressuredTiles} tiles | ${routePressure.conflictTiles} conflicts`;
    if (hoveredTile === null) return `${globalLine}\nHover a route tile to see V/R/C/L pressure.`;
    const p = fromIndex(hoveredTile, state.width);
    const diagnostic = getRoutePressureTileDiagnostic(state, p.x, p.y, routePressure);
    if (!diagnostic) return `${globalLine}\n${diagnosticHoverPrefix()}: no planned route here.`;
    const reason = diagnostic.reasons.length > 0 ? ` ${diagnostic.reasons.slice(0, 2).join(' | ')}` : ' no route conflict reason.';
    return `${globalLine}\n${diagnosticHoverPrefix()}: V${diagnostic.visitorCount} R${diagnostic.residentCount} C${diagnostic.crewCount} L${diagnostic.logisticsCount}; conflicts ${diagnostic.conflictScore}.${reason}`;
  }
  if (hoveredTile === null) {
    const label = DIAGNOSTIC_OVERLAY_LABELS[overlay];
    return `${label}\nHover a room tile for score and gameplay effect.`;
  }
  const p = fromIndex(hoveredTile, state.width);
  const diagnostic = getRoomEnvironmentTileDiagnostic(state, p.x, p.y);
  if (!diagnostic || diagnostic.sampledTiles <= 0) return `${diagnosticHoverPrefix()}: no room environment sample.`;
  if (overlay === 'visitor-status') {
    return `Visitor Status: avg ${state.metrics.visitorStatusAvg.toFixed(1)} | env ${state.metrics.stationRatingPenaltyPerMin.environment.toFixed(1)}/m\n${diagnosticHoverPrefix()}: score ${diagnostic.visitorStatus.toFixed(1)}, discomfort ${diagnostic.visitorDiscomfort.toFixed(1)}; affects rating/service appeal.`;
  }
  if (overlay === 'resident-comfort') {
    return `Resident Comfort: avg ${state.metrics.residentComfortAvg.toFixed(1)} | stress ${state.metrics.residentEnvironmentStressPerMin.toFixed(1)}/m\n${diagnosticHoverPrefix()}: comfort ${diagnostic.residentialComfort.toFixed(1)}, stress ${diagnostic.residentDiscomfort.toFixed(1)}; affects satisfaction.`;
  }
  return `Service Noise: dorm noise ${state.metrics.serviceNoiseNearDorms.toFixed(1)}\n${diagnosticHoverPrefix()}: noise ${diagnostic.serviceNoise.toFixed(1)}; lowers visitor status and resident comfort nearby.`;
}

function refreshDiagnosticReadout(): void {
  const text = diagnosticReadoutText();
  if (text !== lastDiagnosticReadoutText) {
    diagnosticReadoutEl.textContent = text;
    diagnosticReadoutEl.classList.toggle('active', state.controls.diagnosticOverlay !== 'none');
    lastDiagnosticReadoutText = text;
  }
}

function diagnosticKeyModel(): DiagnosticKeyModel | null {
  switch (state.controls.diagnosticOverlay) {
    case 'life-support':
      return {
        title: 'Air Coverage',
        stats: `${state.metrics.lifeSupportCoveragePct.toFixed(0)}% covered | ${state.metrics.poorLifeSupportTiles} poor | active ${state.metrics.lifeSupportActiveNodes}`,
        rows: [
          { color: '#37d3e6', label: 'Reliable coverage near active life support' },
          { color: '#ffd65c', label: 'Distant coverage, watch room readiness' },
          { color: '#ee4f4f', label: 'Disconnected or no active air source' }
        ]
      };
    case 'visitor-status':
      return {
        title: 'Visitor Status',
        stats: `avg ${state.metrics.visitorStatusAvg.toFixed(1)} | env penalty ${state.metrics.stationRatingPenaltyPerMin.environment.toFixed(1)}/m`,
        rows: [
          { color: '#52d1a7', label: 'Appealing public-facing space' },
          { color: '#ffd65c', label: 'Mixed or mildly ugly surroundings' },
          { color: '#ee6854', label: 'Industrial, noisy, cargo-adjacent view' }
        ]
      };
    case 'resident-comfort':
      return {
        title: 'Resident Comfort',
        stats: `avg ${state.metrics.residentComfortAvg.toFixed(1)} | stress ${state.metrics.residentEnvironmentStressPerMin.toFixed(1)}/m`,
        rows: [
          { color: '#6edb8f', label: 'Comfortable residential/support area' },
          { color: '#ffd65c', label: 'Mixed comfort, tolerable friction' },
          { color: '#ee784a', label: 'Stressful service/noise adjacency' }
        ]
      };
    case 'service-noise':
      return {
        title: 'Service Noise',
        stats: `near dorms ${state.metrics.serviceNoiseNearDorms.toFixed(1)}`,
        rows: [
          { color: 'rgba(40, 48, 60, 0.75)', label: 'Quiet or no meaningful noise' },
          { color: '#ffd65c', label: 'Noisy service friction' },
          { color: '#ee4f4f', label: 'Harsh industrial adjacency' }
        ]
      };
    case 'maintenance':
      return {
        title: 'Maintenance',
        stats: `max ${state.metrics.maintenanceDebtMax.toFixed(0)}% | open jobs ${state.metrics.maintenanceJobsOpen}`,
        rows: [
          { color: '#6edb8f', label: 'Healthy reactor/life-support system' },
          { color: '#ffd65c', label: 'Moderate debt, maintenance should visit' },
          { color: '#ee4f4f', label: 'Serious debt reducing system output' }
        ]
      };
    case 'route-pressure': {
      const routePressure = getRoutePressureDiagnostics(state);
      return {
        title: 'Route Pressure',
        stats: `${routePressure.activePaths} paths | ${routePressure.pressuredTiles} tiles | ${routePressure.conflictTiles} conflicts`,
        rows: [
          { color: '#52d1a7', label: 'Visitor routes' },
          { color: '#ff7ad8', label: 'Resident routes' },
          { color: '#5cd8ff', label: 'Crew post/self-care routes' },
          { color: '#b07cff', label: 'Logistics hauling routes' },
          { color: '#ee4f4f', label: 'Mixed public/back-of-house conflict' }
        ]
      };
    }
    case 'none':
      return null;
  }
}

function renderDiagnosticKeyRows(rows: DiagnosticKeyRow[]): string {
  return rows
    .map(
      (row) =>
        `<div class="diagnostic-key-row"><span class="diagnostic-key-swatch" style="background:${escapeHtml(row.color)}"></span><span>${escapeHtml(row.label)}</span></div>`
    )
    .join('');
}

function refreshDiagnosticKey(): void {
  const model = diagnosticKeyModel();
  if (!model) {
    diagnosticKeyEl.classList.add('hidden');
    lastDiagnosticKeySignature = '';
    return;
  }
  const signature = `${model.title}|${model.stats}|${model.rows.map((row) => `${row.color}:${row.label}`).join('|')}`;
  if (signature === lastDiagnosticKeySignature) return;
  diagnosticKeyEl.classList.remove('hidden');
  diagnosticKeyTitleEl.textContent = model.title;
  diagnosticKeyStatsEl.textContent = model.stats;
  diagnosticKeyRowsEl.innerHTML = renderDiagnosticKeyRows(model.rows);
  lastDiagnosticKeySignature = signature;
}

const autosaveStatusEl = document.querySelector<HTMLElement>('#autosave-status')!;
const loadAutosaveBtn = document.querySelector<HTMLButtonElement>('#load-autosave')!;
const visitorsEl = document.querySelector<HTMLSpanElement>('#visitors')!;
const moraleEl = document.querySelector<HTMLSpanElement>('#morale')!;
const stationRatingEl = document.querySelector<HTMLSpanElement>('#station-rating')!;
const visitorFeelingsEl = document.querySelector<HTMLElement>('#visitor-feelings')!;
const crewEl = document.querySelector<HTMLSpanElement>('#crew')!;
const opsTrafficEl = document.querySelector<HTMLSpanElement>('#ops-traffic')!;
const opsEl = document.querySelector<HTMLSpanElement>('#ops')!;
const opsResidentsEl = document.querySelector<HTMLSpanElement>('#ops-residents')!;
const opsExtraEl = document.querySelector<HTMLElement>('#ops-extra')!;
const moraleReasonsEl = document.querySelector<HTMLElement>('#morale-reasons')!;
const ratingReasonsEl = document.querySelector<HTMLElement>('#rating-reasons')!;
const healthRatingEl = document.querySelector<HTMLElement>('#health-rating')!;
const residentConversionSummaryEl = document.querySelector<HTMLElement>('#resident-conversion-summary')!;
const crewBreakdownEl = document.querySelector<HTMLElement>('#crew-breakdown')!;
const crewShiftsEl = document.querySelector<HTMLElement>('#crew-shifts')!;
const crewLockoutsEl = document.querySelector<HTMLElement>('#crew-lockouts')!;
const criticalStaffingLineEl = document.querySelector<HTMLElement>('#critical-staffing-line')!;
const roomUsageEl = document.querySelector<HTMLElement>('#room-usage')!;
const roomFlowEl = document.querySelector<HTMLElement>('#room-flow')!;
const kitchenStatusEl = document.querySelector<HTMLElement>('#kitchen-status')!;
const tradeStatusEl = document.querySelector<HTMLElement>('#trade-status')!;
const demandStripEl = document.querySelector<HTMLElement>('#demand-strip')!;
const archetypeStripEl = document.querySelector<HTMLElement>('#archetype-strip')!;
const shipTypeStripEl = document.querySelector<HTMLElement>('#ship-type-strip')!;
const perfStatsEl = document.querySelector<HTMLElement>('#perf-stats')!;
const questBarEl = document.querySelector<HTMLElement>('#quest-bar')!;
const openProgressionModalBtn = document.querySelector<HTMLButtonElement>('#open-progression-modal')!;
const progressionModal = document.querySelector<HTMLDivElement>('#progression-modal')!;
const closeProgressionModalBtn = document.querySelector<HTMLButtonElement>('#close-progression-modal')!;
const progressModalTierNameEl = document.querySelector<HTMLElement>('#progress-modal-tier-name')!;
const progressModalTierThemeEl = document.querySelector<HTMLElement>('#progress-modal-tier-theme')!;
const progressModalFillEl = document.querySelector<HTMLElement>('#progress-modal-fill')!;
const progressModalPctEl = document.querySelector<HTMLElement>('#progress-modal-pct')!;
const progressModalGoalEl = document.querySelector<HTMLElement>('#progress-modal-goal')!;
const progressModalNextTierNameEl = document.querySelector<HTMLElement>('#progress-modal-next-tier-name')!;
const progressModalNextCriteriaEl = document.querySelector<HTMLElement>('#progress-modal-next-criteria')!;
const progressModalNextBuildingsEl = document.querySelector<HTMLElement>('#progress-modal-next-buildings')!;
const progressModalNextNeedsEl = document.querySelector<HTMLElement>('#progress-modal-next-needs')!;
const progressModalNextVisitorNeedsEl = document.querySelector<HTMLElement>('#progress-modal-next-visitor-needs')!;
const progressModalNextShipsEl = document.querySelector<HTMLElement>('#progress-modal-next-ships')!;
const progressModalNextSystemsEl = document.querySelector<HTMLElement>('#progress-modal-next-systems')!;
const progressModalRoadmapEl = document.querySelector<HTMLElement>('#progress-modal-roadmap')!;
const resourcesEl = document.querySelector<HTMLSpanElement>('#resources')!;
const pressureEl = document.querySelector<HTMLSpanElement>('#pressure')!;
const economyEl = document.querySelector<HTMLSpanElement>('#economy')!;
const economyFlowEl = document.querySelector<HTMLElement>('#economy-flow')!;
const jobsEl = document.querySelector<HTMLSpanElement>('#jobs')!;
const jobsExtraEl = document.querySelector<HTMLElement>('#jobs-extra')!;
const idleReasonsEl = document.querySelector<HTMLElement>('#idle-reasons')!;
const stallReasonsEl = document.querySelector<HTMLElement>('#stall-reasons')!;
const crewRetargetsEl = document.querySelector<HTMLElement>('#crew-retargets')!;
const foodChainHintEl = document.querySelector<HTMLElement>('#food-chain-hint')!;
const roomWarningsEl = document.querySelector<HTMLElement>('#room-warnings')!;
const crewPriorityPresetSelect = document.querySelector<HTMLSelectElement>('#crew-priority-preset')!;
const editPrioritiesBtn = document.querySelector<HTMLButtonElement>('#edit-priorities')!;
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
const materialAutoImportInput = document.querySelector<HTMLInputElement>('#material-auto-import')!;
const materialTargetStockInput = document.querySelector<HTMLInputElement>('#material-target-stock')!;
const materialImportBatchInput = document.querySelector<HTMLInputElement>('#material-import-batch')!;
const materialImportStatusEl = document.querySelector<HTMLElement>('#material-import-status')!;
const openSaveModalBtn = document.querySelector<HTMLButtonElement>('#open-save-modal')!;
const cameraResetBtn = document.querySelector<HTMLButtonElement>('#camera-reset')!;
const saveModal = document.querySelector<HTMLDivElement>('#save-modal')!;
const closeSaveModalBtn = document.querySelector<HTMLButtonElement>('#close-save-modal')!;
const openMarketBtn = document.querySelector<HTMLButtonElement>('#open-market')!;
const closeMarketBtn = document.querySelector<HTMLButtonElement>('#close-market')!;
const marketModal = document.querySelector<HTMLDivElement>('#market-modal')!;
const openExpansionModalBtn = document.querySelector<HTMLButtonElement>('#open-expansion-modal')!;
const closeExpansionModalBtn = document.querySelector<HTMLButtonElement>('#close-expansion-modal')!;
const expansionModal = document.querySelector<HTMLDivElement>('#expansion-modal')!;
const openSystemMapModalBtn = document.querySelector<HTMLButtonElement>('#open-system-map-modal')!;
const closeSystemMapBtn = document.querySelector<HTMLButtonElement>('#close-system-map')!;
const systemMapModal = document.querySelector<HTMLDivElement>('#system-map-modal')!;
const systemMapCanvas = document.querySelector<HTMLCanvasElement>('#system-map-canvas')!;
const systemMapSummaryEl = document.querySelector<HTMLElement>('#system-map-summary')!;
const systemMapFactionsEl = document.querySelector<HTMLElement>('#system-map-factions')!;
const systemMapLanesEl = document.querySelector<HTMLElement>('#system-map-lanes')!;
const priorityModal = document.querySelector<HTMLDivElement>('#priority-modal')!;
const closePriorityBtn = document.querySelector<HTMLButtonElement>('#close-priority')!;
const opsModal = document.querySelector<HTMLDivElement>('#ops-modal')!;
const openOpsModalBtn = document.querySelector<HTMLButtonElement>('#open-ops-modal')!;
const closeOpsModalBtn = document.querySelector<HTMLButtonElement>('#close-ops-modal')!;
const opsChipWorkEl = document.querySelector<HTMLElement>('#ops-chip-work')!;
const opsChipIdleEl = document.querySelector<HTMLElement>('#ops-chip-idle')!;
const opsChipLogisticsEl = document.querySelector<HTMLElement>('#ops-chip-logistics')!;
const opsChipRestingEl = document.querySelector<HTMLElement>('#ops-chip-resting')!;
const opsChipBlockedEl = document.querySelector<HTMLElement>('#ops-chip-blocked')!;
const opsTabButtons = [...document.querySelectorAll<HTMLButtonElement>('.ops-tab-btn')];
const opsTabPanels = [...document.querySelectorAll<HTMLElement>('.ops-tab-panel')];
const opsModalIdleEl = document.querySelector<HTMLElement>('#ops-modal-idle')!;
const opsModalCrewWhyEl = document.querySelector<HTMLElement>('#ops-modal-crew-why')!;
const opsModalShiftsEl = document.querySelector<HTMLElement>('#ops-modal-shifts')!;
const opsModalCrewNeedsEl = document.querySelector<HTMLElement>('#ops-modal-crew-needs')!;
const opsModalStaffingEl = document.querySelector<HTMLElement>('#ops-modal-staffing')!;
const opsModalDutyTransitEl = document.querySelector<HTMLElement>('#ops-modal-duty-transit')!;
const opsModalJobsEl = document.querySelector<HTMLElement>('#ops-modal-jobs')!;
const opsModalPendingWorkEl = document.querySelector<HTMLElement>('#ops-modal-pending-work')!;
const opsModalJobExtraEl = document.querySelector<HTMLElement>('#ops-modal-job-extra')!;
const opsModalStallsEl = document.querySelector<HTMLElement>('#ops-modal-stalls')!;
const opsModalExpiredEl = document.querySelector<HTMLElement>('#ops-modal-expired')!;
const opsModalExpiredWorkEl = document.querySelector<HTMLElement>('#ops-modal-expired-work')!;
const opsModalExpiredContextEl = document.querySelector<HTMLElement>('#ops-modal-expired-context')!;
const opsModalRetargetsEl = document.querySelector<HTMLElement>('#ops-modal-retargets')!;
const opsModalJobWhyEl = document.querySelector<HTMLElement>('#ops-modal-job-why')!;
const opsModalRoomHealthEl = document.querySelector<HTMLElement>('#ops-modal-room-health')!;
const opsModalRoomWarningsEl = document.querySelector<HTMLElement>('#ops-modal-room-warnings')!;
const opsModalSystemsEl = document.querySelector<HTMLElement>('#ops-modal-systems')!;
const opsModalSystemsExtraEl = document.querySelector<HTMLElement>('#ops-modal-systems-extra')!;
const opsModalLifeSupportEl = document.querySelector<HTMLElement>('#ops-modal-life-support')!;
const opsModalRoomUsageEl = document.querySelector<HTMLElement>('#ops-modal-room-usage')!;
const opsModalRoomFlowEl = document.querySelector<HTMLElement>('#ops-modal-room-flow')!;
const opsModalRoomWhyEl = document.querySelector<HTMLElement>('#ops-modal-room-why')!;
const opsModalFoodFlowEl = document.querySelector<HTMLElement>('#ops-modal-food-flow')!;
const opsModalKitchenEl = document.querySelector<HTMLElement>('#ops-modal-kitchen')!;
const opsModalTradeEl = document.querySelector<HTMLElement>('#ops-modal-trade')!;
const opsModalFoodChainEl = document.querySelector<HTMLElement>('#ops-modal-food-chain')!;
const opsModalTrafficEl = document.querySelector<HTMLElement>('#ops-modal-traffic')!;
const opsModalBerthsEl = document.querySelector<HTMLElement>('#ops-modal-berths')!;
const opsModalDemandEl = document.querySelector<HTMLElement>('#ops-modal-demand')!;
const opsModalArchetypesEl = document.querySelector<HTMLElement>('#ops-modal-archetypes')!;
const opsModalResidentConversionEl = document.querySelector<HTMLElement>('#ops-modal-resident-conversion')!;
const opsModalResidentNeedsEl = document.querySelector<HTMLElement>('#ops-modal-resident-needs')!;
const opsModalShipsEl = document.querySelector<HTMLElement>('#ops-modal-ships')!;
const opsModalWalkEl = document.querySelector<HTMLElement>('#ops-modal-walk')!;
const opsModalRatingPenaltiesEl = document.querySelector<HTMLElement>('#ops-modal-rating-penalties')!;
const opsModalRatingBonusesEl = document.querySelector<HTMLElement>('#ops-modal-rating-bonuses')!;
const opsModalRatingFailuresEl = document.querySelector<HTMLElement>('#ops-modal-rating-failures')!;
const opsModalRatingEl = document.querySelector<HTMLElement>('#ops-modal-rating')!;
const foodFlowEl = document.querySelector<HTMLElement>('#food-flow')!;
const powerEl = document.querySelector<HTMLSpanElement>('#power')!;
const incidentsEl = document.querySelector<HTMLSpanElement>('#incidents')!;
const lifeSupportStatusEl = document.querySelector<HTMLElement>('#life-support-status')!;
const airTrendEl = document.querySelector<HTMLElement>('#air-trend')!;
const airHealthEl = document.querySelector<HTMLElement>('#air-health')!;
const airBlockedWarningEl = document.querySelector<HTMLElement>('#air-blocked-warning')!;
const clearBodiesBtn = document.querySelector<HTMLButtonElement>('#clear-bodies')!;
const dockedShipsEl = document.querySelector<HTMLSpanElement>('#docked-ships')!;
const avgDockTimeEl = document.querySelector<HTMLSpanElement>('#avg-dock-time')!;
const bayUtilizationEl = document.querySelector<HTMLSpanElement>('#bay-utilization')!;
const exitsPerMinEl = document.querySelector<HTMLSpanElement>('#exits-per-min')!;
const laneQueuesEl = document.querySelector<HTMLElement>('#lane-queues')!;
const walkStatsEl = document.querySelector<HTMLElement>('#walk-stats')!;
const berthSummaryEl = document.querySelector<HTMLElement>('#berth-summary')!;
const residentLoopSummaryEl = document.querySelector<HTMLElement>('#resident-loop-summary')!;
const ratingInsightTrendEl = document.querySelector<HTMLElement>('#rating-insight-trend')!;
const ratingInsightRateEl = document.querySelector<HTMLElement>('#rating-insight-rate')!;
const ratingInsightBonusEl = document.querySelector<HTMLElement>('#rating-insight-bonus')!;
const ratingInsightServiceEl = document.querySelector<HTMLElement>('#rating-insight-service')!;
const ratingInsightTotalEl = document.querySelector<HTMLElement>('#rating-insight-total')!;
const ratingInsightBonusTotalEl = document.querySelector<HTMLElement>('#rating-insight-bonus-total')!;
const ratingInsightServiceTotalEl = document.querySelector<HTMLElement>('#rating-insight-service-total')!;
const ratingInsightEventsEl = document.querySelector<HTMLElement>('#rating-insight-events')!;
const dockInfoEl = document.querySelector<HTMLElement>('#dock-info')!;
const dockPreviewEl = document.querySelector<HTMLElement>('#dock-preview')!;
const dockModal = document.querySelector<HTMLDivElement>('#dock-modal')!;
const closeDockBtn = document.querySelector<HTMLButtonElement>('#close-dock')!;
const dockModalIdEl = document.querySelector<HTMLElement>('#dock-modal-id')!;
const dockModalAreaEl = document.querySelector<HTMLElement>('#dock-modal-area')!;
const dockModalMaxSizeEl = document.querySelector<HTMLElement>('#dock-modal-max-size')!;
const dockModalPurposeSelect = document.querySelector<HTMLSelectElement>('#dock-modal-purpose')!;
const dockModalPurposeLabelEl = document.querySelector<HTMLElement>('#dock-modal-purpose-label')!;
const dockModalFacingSelect = document.querySelector<HTMLSelectElement>('#dock-modal-facing')!;
const dockModalFacingLabelEl = document.querySelector<HTMLElement>('#dock-modal-facing-label')!;
const dockModalErrorEl = document.querySelector<HTMLElement>('#dock-modal-error')!;
const dockModalTouristCheckbox = document.querySelector<HTMLInputElement>('#dock-modal-tourist')!;
const dockModalTraderCheckbox = document.querySelector<HTMLInputElement>('#dock-modal-trader')!;
const dockModalIndustrialCheckbox = document.querySelector<HTMLInputElement>('#dock-modal-industrial')!;
const dockModalMilitaryCheckbox = document.querySelector<HTMLInputElement>('#dock-modal-military')!;
const dockModalColonistCheckbox = document.querySelector<HTMLInputElement>('#dock-modal-colonist')!;
const dockModalSmallCheckbox = document.querySelector<HTMLInputElement>('#dock-modal-small')!;
const dockModalMediumCheckbox = document.querySelector<HTMLInputElement>('#dock-modal-medium')!;
const dockModalLargeCheckbox = document.querySelector<HTMLInputElement>('#dock-modal-large')!;
const roomModal = document.querySelector<HTMLDivElement>('#room-modal')!;
const closeRoomBtn = document.querySelector<HTMLButtonElement>('#close-room')!;
const roomModalTypeEl = document.querySelector<HTMLElement>('#room-modal-type')!;
const roomModalStatusEl = document.querySelector<HTMLElement>('#room-modal-status')!;
const roomModalClusterEl = document.querySelector<HTMLElement>('#room-modal-cluster')!;
const roomModalDoorsEl = document.querySelector<HTMLElement>('#room-modal-doors')!;
const roomModalPressureEl = document.querySelector<HTMLElement>('#room-modal-pressure')!;
const roomModalStaffEl = document.querySelector<HTMLElement>('#room-modal-staff')!;
const roomModalNodesEl = document.querySelector<HTMLElement>('#room-modal-nodes')!;
const roomModalInventoryEl = document.querySelector<HTMLElement>('#room-modal-inventory')!;
const roomModalFlowEl = document.querySelector<HTMLElement>('#room-modal-flow')!;
const roomModalCapacityEl = document.querySelector<HTMLElement>('#room-modal-capacity')!;
const roomModalHousingPolicyEl = document.querySelector<HTMLElement>('#room-modal-housing-policy')!;
const roomModalHousingSelect = document.querySelector<HTMLSelectElement>('#room-modal-housing-select')!;
const roomModalHousingEl = document.querySelector<HTMLElement>('#room-modal-housing')!;
const roomModalReasonsEl = document.querySelector<HTMLElement>('#room-modal-reasons')!;
const roomModalWarningsEl = document.querySelector<HTMLElement>('#room-modal-warnings')!;
const roomModalHintsEl = document.querySelector<HTMLElement>('#room-modal-hints')!;
const roomModalBerthEl = document.querySelector<HTMLElement>('#room-modal-berth')!;
const agentModal = document.querySelector<HTMLDivElement>('#agent-modal')!;
const closeAgentBtn = document.querySelector<HTMLButtonElement>('#close-agent')!;
const agentSidePanel = document.querySelector<HTMLElement>('#agent-side-panel')!;
const closeAgentSideBtn = document.querySelector<HTMLButtonElement>('#close-agent-side')!;
const agentSideTitleEl = document.querySelector<HTMLElement>('#agent-side-title')!;
const agentSideBodyEl = document.querySelector<HTMLElement>('#agent-side-body')!;
const agentKindEl = document.querySelector<HTMLElement>('#agent-kind')!;
const agentIdEl = document.querySelector<HTMLElement>('#agent-id')!;
const agentStateEl = document.querySelector<HTMLElement>('#agent-state')!;
const agentActionEl = document.querySelector<HTMLElement>('#agent-action')!;
const agentReasonEl = document.querySelector<HTMLElement>('#agent-reason')!;
const agentDesireEl = document.querySelector<HTMLElement>('#agent-desire')!;
const agentTargetEl = document.querySelector<HTMLElement>('#agent-target')!;
const agentPathEl = document.querySelector<HTMLElement>('#agent-path')!;
const agentHealthEl = document.querySelector<HTMLElement>('#agent-health')!;
const agentBlockedEl = document.querySelector<HTMLElement>('#agent-blocked')!;
const agentVisitorDetailsEl = document.querySelector<HTMLElement>('#agent-visitor-details')!;
const agentResidentDetailsEl = document.querySelector<HTMLElement>('#agent-resident-details')!;
const agentCrewDetailsEl = document.querySelector<HTMLElement>('#agent-crew-details')!;
// HUD status strip elements — persistent top-of-canvas sim-game status bar.
const hudPowerEl = document.querySelector<HTMLElement>('#hud-power')!;
const hudOxygenEl = document.querySelector<HTMLElement>('#hud-oxygen')!;
const hudCreditsEl = document.querySelector<HTMLElement>('#hud-credits')!;
const hudCrewEl = document.querySelector<HTMLElement>('#hud-crew')!;
const hudMaterialsEl = document.querySelector<HTMLElement>('#hud-materials')!;
const hudWaterEl = document.querySelector<HTMLElement>('#hud-water')!;
const hudFoodEl = document.querySelector<HTMLElement>('#hud-food')!;
const hudRatingEl = document.querySelector<HTMLElement>('#hud-rating')!;
const hudMoraleEl = document.querySelector<HTMLElement>('#hud-morale')!;
const hudClockEl = document.querySelector<HTMLElement>('#hud-clock')!;
const alertListEl = document.querySelector<HTMLElement>('#alert-list')!;
const tierChecklistEl = document.querySelector<HTMLElement>('#tier-checklist')!;
const selectionSummaryEl = document.querySelector<HTMLElement>('#selection-summary')!;
const devTierOverlayEl = document.querySelector<HTMLElement>('#dev-tier-overlay')!;
// Enable dev-only HUD surfaces via `?dev=1`. Read once at startup; the
// overlay stays hidden in prod so the shipped game is unaffected.
const devModeEnabled = new URLSearchParams(location.search).get('dev') === '1';
if (devModeEnabled) devTierOverlayEl.hidden = false;
const expansionButtons: Record<CardinalDirection, HTMLButtonElement> = {
  north: expandNorthBtn,
  east: expandEastBtn,
  south: expandSouthBtn,
  west: expandWestBtn
};
const saveNameInput = document.querySelector<HTMLInputElement>('#save-name')!;
const saveCreateBtn = document.querySelector<HTMLButtonElement>('#save-create')!;
const saveQuicksaveBtn = document.querySelector<HTMLButtonElement>('#save-quicksave')!;
const saveSlotSelect = document.querySelector<HTMLSelectElement>('#save-slot-select')!;
const saveLoadBtn = document.querySelector<HTMLButtonElement>('#save-load')!;
const saveDeleteBtn = document.querySelector<HTMLButtonElement>('#save-delete')!;
const saveDownloadBtn = document.querySelector<HTMLButtonElement>('#save-download')!;
const saveExportTextarea = document.querySelector<HTMLTextAreaElement>('#save-export')!;
const saveImportTextarea = document.querySelector<HTMLTextAreaElement>('#save-import')!;
const saveImportBtn = document.querySelector<HTMLButtonElement>('#save-import-btn')!;
const saveStatusEl = document.querySelector<HTMLElement>('#save-status')!;
const saveCountEl = document.querySelector<HTMLElement>('#save-count')!;
const prioritySystems: CrewPrioritySystem[] = [
  'life-support',
  'reactor',
  'hydroponics',
  'kitchen',
  'workshop',
  'cafeteria',
  'market',
  'lounge',
  'security',
  'hygiene'
];
const priorityInputs = new Map<CrewPrioritySystem, HTMLInputElement>();
const priorityValueEls = new Map<CrewPrioritySystem, HTMLElement>();
for (const system of prioritySystems) {
  const input = document.querySelector<HTMLInputElement>(`input[data-priority="${system}"]`);
  const valueEl = document.querySelector<HTMLElement>(`#prio-${system}`);
  if (input && valueEl) {
    priorityInputs.set(system, input);
    priorityValueEls.set(system, valueEl);
  }
}
crewPriorityPresetSelect.value = state.controls.crewPriorityPreset;

// The Build & Room Legend sidebar panel was removed in the HUD-cleanup
// pass (awfml's live-game feedback: the top toolbar already surfaces
// every hotkey). This map used to index those .legend-item nodes; it's
// now empty, which makes `applyLegendStates` + `attachLegendTooltipHandlers`
// safe no-ops. Kept declared so the progression wire calls still compile
// and so we have a single seam if legend chips are ever reintroduced.
const roomLegendByType = new Map<RoomType, HTMLElement>();

const MODULE_HOTKEYS: Array<{ key: string; module: ModuleType; label: string }> = [
  { key: '`', module: ModuleType.WallLight, label: 'WallLight' },
  { key: 'Q', module: ModuleType.Bed, label: 'Bed' },
  { key: 'T', module: ModuleType.Table, label: 'Table' },
  { key: '5', module: ModuleType.ServingStation, label: 'Serving' },
  { key: 'V', module: ModuleType.Stove, label: 'Stove' },
  { key: 'P', module: ModuleType.Workbench, label: 'Workbench' },
  { key: 'G', module: ModuleType.GrowStation, label: 'Grow' },
  { key: 'M', module: ModuleType.Terminal, label: 'Terminal' },
  { key: '6', module: ModuleType.Couch, label: 'Couch' },
  { key: '=', module: ModuleType.GameStation, label: 'Game' },
  { key: ';', module: ModuleType.Shower, label: 'Shower' },
  { key: "'", module: ModuleType.Sink, label: 'Sink' },
  { key: '-', module: ModuleType.MarketStall, label: 'Stall' },
  { key: ',', module: ModuleType.IntakePallet, label: 'Intake' },
  { key: '.', module: ModuleType.StorageRack, label: 'Rack' },
  { key: 'Z', module: ModuleType.MedBed, label: 'MedBed' },
  { key: '/', module: ModuleType.CellConsole, label: 'CellConsole' },
  { key: '\\', module: ModuleType.RecUnit, label: 'RecUnit' }
];

type TierPresentation = {
  name: string;
  theme: string;
  buildings: string[];
  citizenNeeds: string[];
  visitorNeeds: string[];
  ships: string[];
  systems: string[];
};

const TIER_ORDER: UnlockTier[] = [0, 1, 2, 3, 4, 5, 6];
const TIER_PRESENTATION: Record<UnlockTier, TierPresentation> = {
  0: {
    name: 'Founding Outpost',
    theme: 'Keep oxygen, food, and beds stable before adding complexity.',
    buildings: ['Reactor', 'Life Support', 'Dorm', 'Hygiene', 'Hydroponics', 'Kitchen', 'Cafeteria', 'Dock'],
    citizenNeeds: ['Core survival loop: hunger, rest, hygiene'],
    visitorNeeds: ['Visitors can be served by the starting cafeteria while guest services are locked'],
    ships: ['Tourist', 'Trader'],
    systems: ['Room operations, food chain, pressure management, and starter supply intake']
  },
  1: {
    name: 'Guest Services',
    theme: 'First visitor arrives - add social and shopping service.',
    buildings: ['Lounge', 'Market'],
    citizenNeeds: ['Social comfort matters more with lounge access'],
    visitorNeeds: ['Lounge + market demand starts appearing in ship service checks'],
    ships: ['No new family'],
    systems: ['Leisure and market throughput begin impacting rating and credits']
  },
  2: {
    name: 'Production Logistics',
    theme: 'Scale supply storage and convert supplies into trade goods.',
    buildings: ['Workshop', 'Storage'],
    citizenNeeds: ['Errands/work loops gain value from reliable logistics'],
    visitorNeeds: ['Industrial traffic now expects workshop-backed service reliability'],
    ships: ['Industrial'],
    systems: ['Full goods chain: intake -> storage -> workshop -> market stall sale']
  },
  3: {
    name: 'Advanced Operations',
    theme: 'Security, treatment, recreation, and advanced traffic controls.',
    buildings: ['Security', 'Brig', 'Clinic', 'Rec Hall'],
    citizenNeeds: ['Safety, recovery, and richer social sinks affect retention'],
    visitorNeeds: ['Security, treatment, and housing-readiness demands begin evaluating'],
    ships: ['Military', 'Colonist'],
    systems: ['Incident containment, health state handling, and advanced dock filters']
  },
  4: {
    name: 'Permanent Habitation',
    theme: 'Make the station a real home with private quarters and residential docking.',
    buildings: ['Private Resident Dorms', 'Resident Hygiene', 'Residential Berth'],
    citizenNeeds: ['Residents need food, rest, hygiene, safety, and social stability'],
    visitorNeeds: ['High-value visitors can convert into permanent residents when housing is ready'],
    ships: ['No new family'],
    systems: ['Residential berth assignment, private bed capacity, resident needs, tax, and departure loops']
  },
  5: {
    name: 'Specialization Roadmap',
    theme: 'Future specialization, civic depth, and station identity.',
    buildings: ['Roadmap milestone'],
    citizenNeeds: ['No new build unlocks in this pass'],
    visitorNeeds: ['No new ship service demands in this pass'],
    ships: ['No new family'],
    systems: ['Advanced milestone tracking']
  },
  6: {
    name: 'Specialization',
    theme: 'Complete the current progression track.',
    buildings: ['Roadmap milestone'],
    citizenNeeds: ['No new build unlocks in this pass'],
    visitorNeeds: ['No new ship service demands in this pass'],
    ships: ['No new family'],
    systems: ['End of current progression']
  }
};

type TierProgressSnapshot = {
  pct: number;
  nextTier: UnlockTier | null;
  requirement: string;
};

let toolLockMessage = '';

function unlockRequirementText(tier: number): string {
  // Caller ("X locked until Tier N.") already owns the tier number;
  // dropping the prefix here avoids "until Tier 1. Tier 1: ..." doubling.
  const copyTier = Math.max(1, Math.min(6, tier)) as UnlockTier;
  return tierRequirementText(copyTier);
}

function friendlyName(value: string): string {
  return value
    .split('-')
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function roomLockedMessage(room: RoomType): string {
  const tier = ROOM_UNLOCK_TIER[room];
  return `${friendlyName(room)} locked until Tier ${tier}. ${unlockRequirementText(tier)}`;
}

function moduleLockedMessage(module: ModuleType): string {
  const tier = MODULE_UNLOCK_TIER[module];
  return `${friendlyName(module)} locked until Tier ${tier}. ${unlockRequirementText(tier)}`;
}

function selectRoomTool(room: RoomType): void {
  if (room !== RoomType.None && !isRoomUnlocked(state, room)) {
    toolLockMessage = roomLockedMessage(room);
    return;
  }
  currentTool = { kind: 'room', room };
  toolLockMessage = '';
}

function selectModuleTool(module: ModuleType): void {
  if (module !== ModuleType.None && !isModuleUnlocked(state, module)) {
    toolLockMessage = moduleLockedMessage(module);
    return;
  }
  currentTool = { kind: 'module', module };
  toolLockMessage = '';
}

function selectRoomCopyTool(): void {
  currentTool = { kind: 'copy-room' };
  toolLockMessage = 'Drag over station tiles to copy a stamp.';
}

function selectRoomPasteTool(): void {
  if (!roomClipboard) {
    currentTool = { kind: 'paste-room' };
    toolLockMessage = 'Copy a station stamp first.';
    return;
  }
  currentTool = { kind: 'paste-room', pasteStamp: roomClipboard };
  toolLockMessage = `Paste ${roomClipboard.label}`;
}

/**
 * Extract the display name from a legend item's rendered text. Parses
 * things like "Cafeteria (C) C" → "Cafeteria". Avoids adding a separate
 * RoomType→name map when the HTML already has the strings.
 */
function roomDisplayName(room: RoomType): string {
  const entry = roomLegendByType.get(room);
  if (!entry) return room;
  const text = entry.textContent?.trim() ?? room;
  const parenIdx = text.indexOf('(');
  return (parenIdx > 0 ? text.slice(0, parenIdx) : text).trim();
}

/**
 * Install locked/coming-next click handlers on the legend once. Called at
 * startup AFTER roomLegendByType is populated. Idempotent — wire.ts tracks
 * `_progAttached` per element.
 */
function installLegendProgressionHandlers(): void {
  // Tooltip copy source: BMO's PROGRESSION_TOOLTIP_COPY (neighbors
  // unlocks.ts). Player-facing "Unlocks when you..." voice; keeps
  // tierRequirementText reserved for the raw-criteria progression modal.
  attachLegendTooltipHandlers(
    roomLegendByType,
    roomDisplayName,
    tierRequirementText,
  );
}

// Previous-tier tracker for flash-on-advance. Initialized to the
// current tier at startup so the first refresh doesn't spuriously fire.
let prevUnlockTier: UnlockTier = 0;

function refreshUnlockLegendAndHotkeys(): void {
  // Quest bar — pinned "what do I do now" strip at the top of the sidebar.
  // Reads state.unlocks.tier + triggerProgress[tier+1] + PROGRESSION_TOOLTIP_COPY.
  // No new sim fields; lives alongside the existing status line surfaces.
  renderQuestBar(state, questBarEl, (t) => PROGRESSION_TOOLTIP_COPY[t]);
  // Phase-2 progression wiring — paints locked/available state on any
  // remaining legend entries. After the Build & Room Legend panel was
  // removed, roomLegendByType is empty so this is effectively a no-op;
  // keep the call so tier-flash + tooltip wiring still works if legend
  // items are ever reintroduced.
  applyLegendStates(state, roomLegendByType);
  prevUnlockTier = maybeFireTierFlash(
    prevUnlockTier,
    state,
    roomDisplayName,
    (t) => PROGRESSION_TOOLTIP_COPY[t],
  );
}

/**
 * Refresh the persistent top-of-canvas HUD status strip.
 *
 * Shows Power / Oxygen / Credits / Crew / Supplies — the high-frequency
 * status numbers that should always remain visible.
 * awfml wanted at-a-glance without cracking the sidebar (Starlight-Station
 * dashboard vibe). Pulled from the same state surfaces the sidebar panels
 * use so we stay a read-only render consumer:
 *   - Power: `powerDemand / powerSupply`. `loadPct` is a pre-derived %
 *     but it clamps to 140 and loses the raw supply denominator; the
 *     sidebar already shows the ratio so we keep that here too, plus a
 *     % for quick read.
 *   - Oxygen: `airQuality` (0-100 life-support %, the sim's "oxygen").
 *   - Credits: `state.metrics.credits` (integer station bank).
 *   - Crew: `state.crew.total` (hired head-count).
 *   - Supplies: `state.metrics.materials` (operational rawMaterial stock).
 *
 * Uses simple red/yellow/green thresholds matching the existing sidebar
 * treatments so the HUD reads the same at a glance.
 */
function refreshHudStatus(): void {
  const powerDemand = state.metrics.powerDemand;
  const powerSupply = state.metrics.powerSupply;
  const loadPct = Math.round(state.metrics.loadPct);
  hudPowerEl.textContent = `${loadPct}%`;
  hudPowerEl.style.color =
    powerDemand > powerSupply ? 'var(--danger)' : loadPct > 85 ? 'var(--warn)' : 'var(--ok)';

  const oxygen = Math.round(state.metrics.airQuality);
  hudOxygenEl.textContent = `${oxygen}%`;
  hudOxygenEl.style.color =
    oxygen < 35 ? 'var(--danger)' : oxygen < 70 ? 'var(--warn)' : 'var(--ok)';

  hudCreditsEl.textContent = String(Math.round(state.metrics.credits));
  hudCrewEl.textContent = String(state.crew.total);
  hudMaterialsEl.textContent = String(Math.round(state.metrics.materials));
  hudWaterEl.textContent = String(Math.round(state.metrics.waterStock));
  hudFoodEl.textContent = String(Math.round(state.metrics.mealStock));
  hudRatingEl.textContent = String(Math.round(state.metrics.stationRating));
  hudRatingEl.style.color = ratingToneColor();
  hudMoraleEl.textContent = `${Math.round(state.metrics.morale)}%`;
  hudMoraleEl.style.color =
    state.metrics.morale > 65 ? 'var(--ok)' : state.metrics.morale > 40 ? 'var(--warn)' : 'var(--danger)';

  const cycleIndex = Math.floor(state.now / state.cycleDuration);
  const cycle = cycleIndex + 1;
  const day = Math.floor(cycleIndex / 8) + 1;
  const cycleElapsed = Math.max(0, state.now - cycleIndex * state.cycleDuration);
  const minutes = Math.floor(cycleElapsed / 60).toString().padStart(2, '0');
  const seconds = Math.floor(cycleElapsed % 60).toString().padStart(2, '0');
  hudClockEl.textContent = `Cycle ${cycle} | Day ${day} | ${minutes}:${seconds}`;
}

const VISITOR_TRAFFIC_TYPES: ShipType[] = ['tourist', 'trader', 'industrial', 'military', 'colonist'];

function hasVisitorDock(): boolean {
  return state.docks.some((dock) => dock.purpose === 'visitor') || state.metrics.visitorBerthsTotal > 0;
}

function hasEligibleVisitorDock(): boolean {
  if (state.metrics.visitorBerthsTotal > 0) return true;
  return state.docks.some((dock) => {
    if (dock.purpose !== 'visitor' || !dock.allowedShipSizes.includes('small')) return false;
    return VISITOR_TRAFFIC_TYPES.some(
      (shipType) => dock.allowedShipTypes.includes(shipType) && isShipTypeUnlocked(state, shipType)
    );
  });
}

function setTrafficStatus(text: string, tone: 'muted' | 'ok' | 'warn'): void {
  trafficStatusEl.textContent = text;
  trafficStatusEl.classList.remove('tone-muted', 'tone-ok', 'tone-warn');
  trafficStatusEl.classList.add(`tone-${tone}`);
}

function refreshTrafficStatus(): void {
  const shipsPerCycle = clamp(state.controls.shipsPerCycle, 0, 3);
  const activeTransientShips = state.arrivingShips.filter((ship) => ship.kind === 'transient').length;
  if (shipsPerCycle <= 0) {
    setTrafficStatus('Traffic off', 'muted');
    return;
  }
  if (!hasVisitorDock()) {
    setTrafficStatus('Build visitor dock or berth', 'warn');
    return;
  }
  if (!hasEligibleVisitorDock()) {
    setTrafficStatus('Dock filters block traffic', 'warn');
    return;
  }
  if (state.controls.paused) {
    setTrafficStatus('Paused - press play for arrivals', 'muted');
    return;
  }
  if (activeTransientShips > 0 || state.pendingSpawns.length > 0) {
    setTrafficStatus(`${activeTransientShips} ship${activeTransientShips === 1 ? '' : 's'} docked/arriving`, 'ok');
    return;
  }
  const seconds = Math.max(1, Math.ceil(state.lastCycleTime - state.now));
  setTrafficStatus(`Next arrival check in ${seconds}s`, 'ok');
}

type OpsMetricTone = 'default' | 'ok' | 'warn' | 'danger' | 'muted';
type OpsMetricItem = {
  label: string;
  value: string | number;
  tone?: OpsMetricTone;
};
type OpsDetailItem = {
  label: string;
  value: string | number;
  tone?: OpsMetricTone;
};
type OpsTab = 'crew' | 'jobs' | 'rooms' | 'food' | 'traffic';

let activeOpsTab: OpsTab = 'jobs';

function setOpsTab(tab: OpsTab): void {
  activeOpsTab = tab;
  for (const button of opsTabButtons) {
    const active = button.dataset.opsTab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  }
  for (const panel of opsTabPanels) {
    panel.classList.toggle('active', panel.dataset.opsPanel === tab);
  }
}

function setMetricList(el: HTMLElement, items: OpsMetricItem[]): void {
  const nodes = items.map((item) => {
    const metric = document.createElement('span');
    metric.className = `metric-pill tone-${item.tone ?? 'default'}`;

    const label = document.createElement('span');
    label.className = 'metric-label';
    label.textContent = item.label;

    const value = document.createElement('strong');
    value.className = 'metric-value';
    value.textContent = String(item.value);

    metric.append(label, value);
    return metric;
  });
  el.replaceChildren(...nodes);
}

function setDetailList(el: HTMLElement, items: OpsDetailItem[], emptyText = 'None'): void {
  const shown = items.filter((item) => String(item.value) !== '0' && String(item.value) !== '');
  const nodes = shown.length > 0
    ? shown.map((item) => {
        const row = document.createElement('span');
        row.className = `ops-detail-row tone-${item.tone ?? 'default'}`;

        const label = document.createElement('span');
        label.className = 'ops-detail-label';
        label.textContent = item.label;

        const value = document.createElement('strong');
        value.className = 'ops-detail-value';
        value.textContent = String(item.value);

        row.append(label, value);
        return row;
      })
    : [(() => {
        const empty = document.createElement('span');
        empty.className = 'ops-detail-empty';
        empty.textContent = emptyText;
        return empty;
      })()];
  el.replaceChildren(...nodes);
}

const JOB_STALL_LABELS: Record<JobStallReason, string> = {
  none: 'Timed Out',
  stalled_path_blocked: 'Path',
  stalled_unreachable_source: 'Source',
  stalled_unreachable_dropoff: 'Dropoff',
  stalled_no_supply: 'Supply'
};

const ITEM_LABELS: Record<ItemType, string> = {
  rawMeal: 'Raw food',
  meal: 'Meals',
  rawMaterial: 'Supplies',
  tradeGood: 'Trade goods',
  body: 'Bodies'
};

function statusBreakdownText(counts: JobStatusCounts, key: keyof JobStatusCounts): string {
  return counts[key] > 0 ? String(counts[key]) : '0';
}

function dominantCountReason<T extends string>(counts: Record<T, number>): T | null {
  let topReason: T | null = null;
  let topCount = 0;
  for (const [reason, count] of Object.entries(counts) as Array<[T, number]>) {
    if (count > topCount) {
      topReason = reason;
      topCount = count;
    }
  }
  return topReason;
}

function jobWhyText(): string {
  const stalledReason = dominantCountReason(state.metrics.stalledJobsByReason);
  const expiredReason = dominantCountReason(state.metrics.expiredJobsByReason);
  if (state.metrics.logisticsDispatchSlots <= 0 && state.metrics.pendingJobs > 0) {
    return 'Jobs: dispatch saturated; all hauler slots are occupied.';
  }
  if (stalledReason && stalledReason !== 'none' && state.metrics.stalledJobsByReason[stalledReason] > 0) {
    return `Jobs: current stalls are mostly ${JOB_STALL_LABELS[stalledReason].toLowerCase()} problems.`;
  }
  if (expiredReason && state.metrics.expiredJobsByReason[expiredReason] > 0) {
    if (expiredReason === 'none') {
      return 'Jobs: expired work mostly timed out without a path/source/dropoff stall; this usually means the queue outlived the available hauler capacity.';
    }
    return `Jobs: expired work is mostly ${JOB_STALL_LABELS[expiredReason].toLowerCase()} related.`;
  }
  if (state.metrics.oldestPendingJobAgeSec > 30) {
    return 'Jobs: queue is aging even without a clear stall reason.';
  }
  return 'Jobs: queue healthy.';
}

function crewWhyText(): string {
  const waiting = state.metrics.idleCrewByReason.idle_waiting_reassign;
  if (waiting <= 0) return 'Crew: no one is waiting for reassignment.';
  if (state.metrics.pendingJobs <= 0) return 'Crew: waiting workers are roaming because no jobs are pending.';
  if (state.metrics.logisticsDispatchSlots <= 0) {
    return `Crew: ${waiting} waiting while pending jobs exceed the current logistics crew cap.`;
  }
  if (state.metrics.stalledJobs > 0) {
    return `Crew: ${waiting} waiting while the dispatcher avoids stalled jobs.`;
  }
  return `Crew: ${waiting} waiting for the next dispatcher pass; pending jobs exist but were not assigned this tick.`;
}

function roomWhyText(): string {
  const serviceText =
    state.metrics.serviceNodesTotal > 0
      ? `${state.metrics.serviceNodesUnreachable}/${state.metrics.serviceNodesTotal} service nodes unreachable`
      : 'no service nodes built';
  const warningText = state.metrics.topRoomWarnings.join('; ') || 'no room warnings';
  return `Rooms: ${serviceText}; ${warningText}.`;
}

function ratingWhyText(): string {
  const drivers = state.metrics.stationRatingDrivers.filter((driver) => driver !== 'none');
  return `Station rating drivers: ${drivers.join('; ') || 'none'}`;
}

function ratingToneColor(): string {
  return state.metrics.stationRating > 70 ? 'var(--ok)' : state.metrics.stationRating > 40 ? 'var(--warn)' : 'var(--danger)';
}

function ratingSummaryText(): string {
  const trend = state.metrics.stationRatingTrendPerMin;
  return `${Math.round(state.metrics.stationRating)} (${trend >= 0 ? '+' : ''}${trend.toFixed(1)}/min)`;
}

function residentConversionTone(): 'default' | 'warn' | 'danger' | 'ok' {
  if (state.metrics.residentsCount > 0 || state.metrics.residentConversionLastResult === 'converted') return 'ok';
  if (state.metrics.residentPrivateBedsTotal <= 0 || state.metrics.residentBerthsTotal <= 0) return 'danger';
  if (state.metrics.residentConversionLastResult.startsWith('blocked:')) return 'warn';
  if (state.metrics.residentConversionAttempts > 0 && state.metrics.residentConversionSuccesses <= 0) return 'warn';
  return 'default';
}

function residentConversionStatusText(compact = false): string {
  const result = state.metrics.residentConversionLastResult || 'waiting for eligible visitor exit';
  const chance =
    state.metrics.residentConversionLastChancePct > 0
      ? ` | last chance ${state.metrics.residentConversionLastChancePct.toFixed(1)}%`
      : '';
  const ship =
    state.metrics.residentConversionLastShip && state.metrics.residentConversionLastShip !== 'none'
      ? ` | last ship ${state.metrics.residentConversionLastShip}`
      : '';
  const setup =
    `beds ${state.metrics.residentPrivateBedsTotal} | berth ${state.metrics.residentBerthsTotal} | rating ${Math.round(state.metrics.stationRating)}`;
  if (compact) {
    return `${state.metrics.residentsCount} | ${state.metrics.residentConversionSuccesses}/${state.metrics.residentConversionAttempts} | ${result}`;
  }
  if (state.metrics.residentPrivateBedsTotal <= 0) {
    return `Residents blocked: no private resident beds | ${setup}`;
  }
  if (state.metrics.residentBerthsTotal <= 0) {
    return `Residents blocked: no residential berth | ${setup}`;
  }
  return `Residents ${state.metrics.residentsCount} | convert ${state.metrics.residentConversionSuccesses}/${state.metrics.residentConversionAttempts} | ${result}${chance}${ship} | ${setup}`;
}

function crewOpsSummaryText(compact = false): string {
  const logisticsLabel = compact ? 'Log' : 'Logistics';
  const restingLabel = compact ? 'Rest' : 'Resting';
  const blockedLabel = compact ? 'Block' : 'Blocked';
  return `Work ${state.metrics.crewAssignedWorking} | Idle ${state.metrics.crewIdleAvailable} | ` +
    `${logisticsLabel} ${state.metrics.crewOnLogisticsJobs} | ${restingLabel} ${state.metrics.crewResting} | ` +
    `${blockedLabel} ${state.metrics.crewBlockedNoPath}`;
}

function trafficOpsSummaryText(): string {
  return `Visitors ${state.metrics.visitorsCount} | Docked ${state.metrics.dockedShips} | Exits ${state.metrics.exitsPerMin}/min`;
}

function coreOpsSummaryText(): string {
  return `Caf ${state.ops.cafeteriasActive}/${state.ops.cafeteriasTotal} | ` +
    `Food K${state.ops.kitchenActive}/${state.ops.kitchenTotal} H${state.ops.hydroponicsActive}/${state.ops.hydroponicsTotal} | ` +
    `LS ${state.ops.lifeSupportActive}/${state.ops.lifeSupportTotal} | R ${state.ops.reactorsActive}/${state.ops.reactorsTotal}`;
}

function jobsSummaryText(): string {
  return `P${state.metrics.pendingJobs} A${state.metrics.assignedJobs} X${state.metrics.expiredJobs} D${state.metrics.completedJobs} | ${state.metrics.topBacklogType}`;
}

function criticalStaffingText(): string {
  return `Room ops Caf ${state.ops.cafeteriasActive}/${state.ops.cafeteriasTotal} | ` +
    `Kitchen ${state.ops.kitchenActive}/${state.ops.kitchenTotal} | Hydro ${state.ops.hydroponicsActive}/${state.ops.hydroponicsTotal} | ` +
    `LS ${state.ops.lifeSupportActive}/${state.ops.lifeSupportTotal} | Reactor ${state.ops.reactorsActive}/${state.ops.reactorsTotal}`;
}

function idleReasonsText(): string {
  return `Idle reasons: available ${state.metrics.idleCrewByReason.idle_available} | no jobs ${state.metrics.idleCrewByReason.idle_no_jobs} | ` +
    `resting ${state.metrics.idleCrewByReason.idle_resting} | no path ${state.metrics.idleCrewByReason.idle_no_path} | ` +
    `waiting ${state.metrics.idleCrewByReason.idle_waiting_reassign}`;
}

function stallReasonsText(): string {
  return `Stalls: blocked ${state.metrics.stalledJobsByReason.stalled_path_blocked} | ` +
    `src ${state.metrics.stalledJobsByReason.stalled_unreachable_source} | ` +
    `dst ${state.metrics.stalledJobsByReason.stalled_unreachable_dropoff} | ` +
    `supply ${state.metrics.stalledJobsByReason.stalled_no_supply}`;
}

function jobsExtraText(): string {
  return `Avg age ${state.metrics.avgJobAgeSec.toFixed(1)}s | Oldest ${state.metrics.oldestPendingJobAgeSec.toFixed(1)}s | ` +
    `Delivery ${state.metrics.deliveryLatencySec.toFixed(1)}s | Stalled ${state.metrics.stalledJobs} | ` +
    `shortfall sec R ${state.metrics.criticalShortfallSec.reactor.toFixed(1)} LS ${state.metrics.criticalShortfallSec.lifeSupport.toFixed(1)} ` +
    `HY ${state.metrics.criticalShortfallSec.hydroponics.toFixed(1)} KI ${state.metrics.criticalShortfallSec.kitchen.toFixed(1)} ` +
    `CF ${state.metrics.criticalShortfallSec.cafeteria.toFixed(1)}`;
}

function crewShiftsText(): string {
  return `Shifts: resting ${state.metrics.crewRestingNow}/${state.metrics.crewRestCap} | ` +
    `wake budget ${state.metrics.crewEmergencyWakeBudget} | woken ${state.metrics.crewWokenForAir} | ` +
    `lockouts ${state.metrics.crewPingPongPreventions}`;
}

function crewRetargetsText(): string {
  return `Crew retargets/min: ${state.metrics.crewRetargetsPerMin.toFixed(1)} | ` +
    `critical drops/min: ${state.metrics.criticalStaffDropsPerMin.toFixed(1)} | ` +
    `dispatch ${state.metrics.logisticsDispatchSlots} | pressure ${(state.metrics.logisticsPressure * 100).toFixed(0)}%`;
}

function opsExtraText(): string {
  return `Kitchen ${state.ops.kitchenActive}/${state.ops.kitchenTotal} | Workshop ${state.ops.workshopActive}/${state.ops.workshopTotal} | ` +
    `Hygiene ${state.ops.hygieneActive}/${state.ops.hygieneTotal} | Hydroponics ${state.ops.hydroponicsActive}/${state.ops.hydroponicsTotal} | ` +
    `Life Support ${state.ops.lifeSupportActive}/${state.ops.lifeSupportTotal} | Lounge ${state.ops.loungeActive}/${state.ops.loungeTotal} | ` +
    `Market ${state.ops.marketActive}/${state.ops.marketTotal} | Cantina ${state.ops.cantinaActive}/${state.ops.cantinaTotal} | ` +
    `Obs ${state.ops.observatoryActive}/${state.ops.observatoryTotal} | Clinic ${state.ops.clinicActive}/${state.ops.clinicTotal} | ` +
    `Brig ${state.ops.brigActive}/${state.ops.brigTotal} | RecHall ${state.ops.recHallActive}/${state.ops.recHallTotal}`;
}

function roomUsageText(): string {
  return `Usage: to dorm ${state.metrics.toDormResidents} | resting ${state.metrics.dormSleepingResidents} | ` +
    `hygiene ${state.metrics.hygieneCleaningResidents} | queue ${state.metrics.cafeteriaQueueingCount} | ` +
    `eating ${state.metrics.cafeteriaEatingCount} | hydro staff ${state.metrics.hydroponicsStaffed}/${state.metrics.hydroponicsActiveGrowNodes} | ` +
    `life nodes ${state.metrics.lifeSupportActiveNodes}`;
}

function roomFlowText(): string {
  return `Flow/min: dorm ${state.metrics.dormVisitsPerMin.toFixed(1)} | hygiene ${state.metrics.hygieneUsesPerMin.toFixed(1)} | ` +
    `meals ${state.metrics.mealsConsumedPerMin.toFixed(1)} | dorm fail ${state.metrics.dormFailedAttemptsPerMin.toFixed(1)} | ` +
    `failed needs H/E/Y ${state.metrics.failedNeedAttemptsHunger}/${state.metrics.failedNeedAttemptsEnergy}/${state.metrics.failedNeedAttemptsHygiene}`;
}

function foodFlowText(): string {
  return `Food flow: +${state.metrics.rawFoodProdRate.toFixed(1)} raw/s -> kitchen +${state.metrics.kitchenMealProdRate.toFixed(1)} meals/s, use ${state.metrics.mealUseRate.toFixed(1)} meals/s`;
}

function kitchenStatusText(): string {
  return `Kitchen: active ${state.ops.kitchenActive}/${state.ops.kitchenTotal} | raw ${state.metrics.kitchenRawBuffer.toFixed(1)} | meal +${state.metrics.kitchenMealProdRate.toFixed(1)}/s`;
}

function tradeStatusText(): string {
  return `Trade: workshop +${state.metrics.workshopTradeGoodProdRate.toFixed(1)}/s | ` +
    `market use ${state.metrics.marketTradeGoodUseRate.toFixed(1)}/s | stock ${state.metrics.marketTradeGoodStock.toFixed(1)} | ` +
    `sold/min ${state.metrics.tradeGoodsSoldPerMin.toFixed(1)} | stockouts/min ${state.metrics.marketStockoutsPerMin.toFixed(1)}`;
}

function foodChainHintText(): string {
  const foodBlocked =
    state.metrics.topRoomWarnings.find((w) => w.startsWith('food chain blocked:'));
  return `Food chain: ${foodBlocked ?? 'stable'}`;
}

function refreshOpsModal(): void {
  opsChipWorkEl.textContent = String(state.metrics.crewAssignedWorking);
  opsChipIdleEl.textContent = String(state.metrics.crewIdleAvailable);
  opsChipLogisticsEl.textContent = String(state.metrics.crewOnLogisticsJobs);
  opsChipRestingEl.textContent = String(state.metrics.crewResting);
  opsChipBlockedEl.textContent = String(state.metrics.crewBlockedNoPath);
  for (const button of opsTabButtons) {
    switch (button.dataset.opsTab) {
      case 'crew':
        button.textContent = `Crew ${state.metrics.crewIdleAvailable}/${state.metrics.crewOnLogisticsJobs}`;
        break;
      case 'jobs':
        button.textContent = `Jobs ${state.metrics.pendingJobs}/${state.metrics.expiredJobs}`;
        break;
      case 'rooms':
        button.textContent = `Rooms ${state.metrics.roomWarningsCount}`;
        break;
      case 'food':
        button.textContent = `Food ${Math.round(state.metrics.mealStock)}`;
        break;
      case 'traffic':
        button.textContent = `Traffic ${state.metrics.visitorsCount}/${state.metrics.residentsCount}`;
        break;
    }
  }
  setOpsTab(activeOpsTab);
  setMetricList(opsModalIdleEl, [
    { label: 'Available', value: state.metrics.idleCrewByReason.idle_available },
    { label: 'No Jobs', value: state.metrics.idleCrewByReason.idle_no_jobs, tone: state.metrics.idleCrewByReason.idle_no_jobs > 0 ? 'muted' : 'default' },
    { label: 'No Path', value: state.metrics.idleCrewByReason.idle_no_path, tone: state.metrics.idleCrewByReason.idle_no_path > 0 ? 'danger' : 'default' },
    { label: 'Waiting', value: state.metrics.idleCrewByReason.idle_waiting_reassign, tone: state.metrics.idleCrewByReason.idle_waiting_reassign > 0 ? 'warn' : 'default' },
  ]);
  opsModalCrewWhyEl.textContent = crewWhyText();
  setMetricList(opsModalShiftsEl, [
    { label: 'Resting', value: `${state.metrics.crewRestingNow}/${state.metrics.crewRestCap}` },
    { label: 'Cleaning', value: state.metrics.crewCleaning },
    { label: 'Self-Care', value: state.metrics.crewSelfCare },
    { label: 'Wake Budget', value: state.metrics.crewEmergencyWakeBudget },
    { label: 'Woken', value: state.metrics.crewWokenForAir },
  ]);
  setMetricList(opsModalCrewNeedsEl, [
    { label: 'Energy Avg', value: `${state.metrics.crewAvgEnergy.toFixed(0)}%`, tone: state.metrics.crewAvgEnergy < 45 ? 'warn' : 'default' },
    { label: 'Hygiene Avg', value: `${state.metrics.crewAvgHygiene.toFixed(0)}%`, tone: state.metrics.crewAvgHygiene < 45 ? 'warn' : 'default' },
    { label: 'Fatigue Driver', value: state.metrics.crewMoraleDrivers.find((d) => d.startsWith('fatigue'))?.replace('fatigue ', '') ?? '0.0' },
    { label: 'Hygiene Driver', value: state.metrics.crewMoraleDrivers.find((d) => d.startsWith('hygiene'))?.replace('hygiene ', '') ?? '0.0' },
  ]);
  setMetricList(opsModalStaffingEl, [
    { label: 'Reactor', value: `${state.ops.reactorsActive}/${state.ops.reactorsTotal}` },
    { label: 'Life Support', value: `${state.ops.lifeSupportActive}/${state.ops.lifeSupportTotal}` },
    { label: 'Hydro', value: `${state.ops.hydroponicsActive}/${state.ops.hydroponicsTotal}` },
    { label: 'Kitchen', value: `${state.ops.kitchenActive}/${state.ops.kitchenTotal}` },
    { label: 'Cafeteria', value: `${state.ops.cafeteriasActive}/${state.ops.cafeteriasTotal}` },
  ]);
  setMetricList(opsModalDutyTransitEl, [
    { label: 'Dispatch Slots', value: state.metrics.logisticsDispatchSlots },
    { label: 'Pressure', value: state.metrics.logisticsPressure.toFixed(2) },
    { label: 'On Jobs', value: state.metrics.crewOnLogisticsJobs },
    { label: 'Pending', value: state.metrics.pendingJobs },
    { label: 'Top Backlog', value: state.metrics.topBacklogType },
  ]);
  setMetricList(opsModalJobsEl, [
    { label: 'Pending', value: state.metrics.pendingJobs, tone: state.metrics.pendingJobs > 20 ? 'warn' : 'default' },
    { label: 'Assigned', value: state.metrics.assignedJobs },
    { label: 'Expired', value: state.metrics.expiredJobs, tone: state.metrics.expiredJobs > 0 ? 'danger' : 'default' },
    { label: 'Done', value: state.metrics.completedJobs },
    { label: 'Backlog', value: state.metrics.topBacklogType },
    { label: 'Reservations', value: state.metrics.activeReservations, tone: state.metrics.reservationFailures > 0 ? 'warn' : 'default' },
  ]);
  setDetailList(opsModalPendingWorkEl, [
    { label: 'Deliver jobs', value: statusBreakdownText(state.metrics.jobCountsByType.deliver, 'pending') },
    { label: 'Pickup jobs', value: statusBreakdownText(state.metrics.jobCountsByType.pickup, 'pending') },
    { label: 'Cook jobs', value: statusBreakdownText(state.metrics.jobCountsByType.cook, 'pending') },
    { label: ITEM_LABELS.rawMeal, value: statusBreakdownText(state.metrics.jobCountsByItem.rawMeal, 'pending') },
    { label: ITEM_LABELS.meal, value: statusBreakdownText(state.metrics.jobCountsByItem.meal, 'pending') },
    { label: ITEM_LABELS.rawMaterial, value: statusBreakdownText(state.metrics.jobCountsByItem.rawMaterial, 'pending') },
    { label: ITEM_LABELS.tradeGood, value: statusBreakdownText(state.metrics.jobCountsByItem.tradeGood, 'pending') },
    { label: ITEM_LABELS.body, value: statusBreakdownText(state.metrics.jobCountsByItem.body, 'pending') },
  ], 'No pending work');
  setMetricList(opsModalJobExtraEl, [
    { label: 'Avg Age', value: `${state.metrics.avgJobAgeSec.toFixed(1)}s` },
    { label: 'Oldest', value: `${state.metrics.oldestPendingJobAgeSec.toFixed(1)}s`, tone: state.metrics.oldestPendingJobAgeSec > 30 ? 'warn' : 'default' },
    { label: 'Delivery', value: `${state.metrics.deliveryLatencySec.toFixed(1)}s` },
    { label: 'Batch', value: state.metrics.logisticsAverageBatchSize.toFixed(1) },
    { label: 'Blocked', value: state.metrics.logisticsBlockedReason, tone: state.metrics.logisticsBlockedReason === 'none' ? 'default' : 'warn' },
  ]);
  setMetricList(opsModalStallsEl, [
    { label: 'Path', value: state.metrics.stalledJobsByReason.stalled_path_blocked, tone: state.metrics.stalledJobsByReason.stalled_path_blocked > 0 ? 'warn' : 'default' },
    { label: 'Source', value: state.metrics.stalledJobsByReason.stalled_unreachable_source, tone: state.metrics.stalledJobsByReason.stalled_unreachable_source > 0 ? 'warn' : 'default' },
    { label: 'Dropoff', value: state.metrics.stalledJobsByReason.stalled_unreachable_dropoff, tone: state.metrics.stalledJobsByReason.stalled_unreachable_dropoff > 0 ? 'warn' : 'default' },
    { label: 'Supply', value: state.metrics.stalledJobsByReason.stalled_no_supply, tone: state.metrics.stalledJobsByReason.stalled_no_supply > 0 ? 'warn' : 'default' },
  ]);
  setMetricList(opsModalExpiredEl, [
    { label: 'Timed Out', value: state.metrics.expiredJobsByReason.none, tone: state.metrics.expiredJobsByReason.none > 0 ? 'warn' : 'default' },
    { label: 'Path', value: state.metrics.expiredJobsByReason.stalled_path_blocked, tone: state.metrics.expiredJobsByReason.stalled_path_blocked > 0 ? 'danger' : 'default' },
    { label: 'Source', value: state.metrics.expiredJobsByReason.stalled_unreachable_source, tone: state.metrics.expiredJobsByReason.stalled_unreachable_source > 0 ? 'danger' : 'default' },
    { label: 'Dropoff', value: state.metrics.expiredJobsByReason.stalled_unreachable_dropoff, tone: state.metrics.expiredJobsByReason.stalled_unreachable_dropoff > 0 ? 'danger' : 'default' },
    { label: 'Supply', value: state.metrics.expiredJobsByReason.stalled_no_supply, tone: state.metrics.expiredJobsByReason.stalled_no_supply > 0 ? 'danger' : 'default' },
  ]);
  setDetailList(opsModalExpiredWorkEl, [
    { label: 'Deliver jobs', value: statusBreakdownText(state.metrics.jobCountsByType.deliver, 'expired'), tone: state.metrics.jobCountsByType.deliver.expired > 0 ? 'warn' : 'default' },
    { label: 'Pickup jobs', value: statusBreakdownText(state.metrics.jobCountsByType.pickup, 'expired'), tone: state.metrics.jobCountsByType.pickup.expired > 0 ? 'warn' : 'default' },
    { label: 'Cook jobs', value: statusBreakdownText(state.metrics.jobCountsByType.cook, 'expired'), tone: state.metrics.jobCountsByType.cook.expired > 0 ? 'warn' : 'default' },
    { label: ITEM_LABELS.rawMeal, value: statusBreakdownText(state.metrics.jobCountsByItem.rawMeal, 'expired') },
    { label: ITEM_LABELS.meal, value: statusBreakdownText(state.metrics.jobCountsByItem.meal, 'expired') },
    { label: ITEM_LABELS.rawMaterial, value: statusBreakdownText(state.metrics.jobCountsByItem.rawMaterial, 'expired') },
    { label: ITEM_LABELS.tradeGood, value: statusBreakdownText(state.metrics.jobCountsByItem.tradeGood, 'expired') },
    { label: ITEM_LABELS.body, value: statusBreakdownText(state.metrics.jobCountsByItem.body, 'expired') },
  ], 'No expired work');
  setMetricList(opsModalExpiredContextEl, [
    { label: 'Queued', value: state.metrics.expiredJobsByContext.queued, tone: state.metrics.expiredJobsByContext.queued > 0 ? 'warn' : 'default' },
    { label: 'Assigned', value: state.metrics.expiredJobsByContext.assigned, tone: state.metrics.expiredJobsByContext.assigned > 0 ? 'warn' : 'default' },
    { label: 'Carrying', value: state.metrics.expiredJobsByContext.carrying, tone: state.metrics.expiredJobsByContext.carrying > 0 ? 'danger' : 'default' },
    { label: 'Unknown', value: state.metrics.expiredJobsByContext.unknown, tone: state.metrics.expiredJobsByContext.unknown > 0 ? 'warn' : 'default' },
  ]);
  setMetricList(opsModalRetargetsEl, [
    { label: 'Retargets', value: `${state.metrics.crewRetargetsPerMin.toFixed(1)}/m` },
    { label: 'Drops', value: `${state.metrics.criticalStaffDropsPerMin.toFixed(1)}/m`, tone: state.metrics.criticalStaffDropsPerMin > 0 ? 'warn' : 'default' },
    { label: 'Slots', value: state.metrics.logisticsDispatchSlots },
    { label: 'Pressure', value: `${(state.metrics.logisticsPressure * 100).toFixed(0)}%`, tone: state.metrics.logisticsPressure > 0.85 ? 'warn' : 'default' },
    { label: 'Res Fail', value: state.metrics.reservationFailures, tone: state.metrics.reservationFailures > 0 ? 'warn' : 'default' },
  ]);
  opsModalJobWhyEl.textContent = jobWhyText();
  setMetricList(opsModalRoomHealthEl, [
    { label: 'Warnings', value: state.metrics.roomWarningsCount, tone: state.metrics.roomWarningsCount > 0 ? 'warn' : 'default' },
    { label: 'Service Nodes', value: state.metrics.serviceNodesTotal },
    { label: 'Unreachable', value: state.metrics.serviceNodesUnreachable, tone: state.metrics.serviceNodesUnreachable > 0 ? 'warn' : 'default' },
    { label: 'Pressure', value: `${state.metrics.pressurizationPct.toFixed(0)}%`, tone: state.metrics.pressurizationPct < 95 ? 'warn' : 'default' },
    { label: 'Leaks', value: state.metrics.leakingTiles, tone: state.metrics.leakingTiles > 0 ? 'danger' : 'default' },
  ]);
  setDetailList(
    opsModalRoomWarningsEl,
    state.metrics.topRoomWarnings.map((warning, index) => ({
      label: `Warning ${index + 1}`,
      value: warning,
      tone: 'warn' as const
    })),
    'No room warnings'
  );
  setMetricList(opsModalSystemsEl, [
    { label: 'Cafeteria', value: `${state.ops.cafeteriasActive}/${state.ops.cafeteriasTotal}` },
    { label: 'Kitchen', value: `${state.ops.kitchenActive}/${state.ops.kitchenTotal}` },
    { label: 'Hydro', value: `${state.ops.hydroponicsActive}/${state.ops.hydroponicsTotal}` },
    { label: 'Life Support', value: `${state.ops.lifeSupportActive}/${state.ops.lifeSupportTotal}` },
    { label: 'Reactor', value: `${state.ops.reactorsActive}/${state.ops.reactorsTotal}` },
  ]);
  setMetricList(opsModalSystemsExtraEl, [
    { label: 'Workshop', value: `${state.ops.workshopActive}/${state.ops.workshopTotal}` },
    { label: 'Hygiene', value: `${state.ops.hygieneActive}/${state.ops.hygieneTotal}` },
    { label: 'Lounge', value: `${state.ops.loungeActive}/${state.ops.loungeTotal}` },
    { label: 'Market', value: `${state.ops.marketActive}/${state.ops.marketTotal}` },
    { label: 'Cantina', value: `${state.ops.cantinaActive}/${state.ops.cantinaTotal}` },
    { label: 'Observatory', value: `${state.ops.observatoryActive}/${state.ops.observatoryTotal}` },
    { label: 'Security', value: `${state.ops.securityActive}/${state.ops.securityTotal}` },
    { label: 'Maint', value: `${state.metrics.maintenanceDebtAvg.toFixed(0)}% avg / ${state.metrics.maintenanceJobsOpen} open`, tone: state.metrics.maintenanceJobsOpen > 0 ? 'warn' : 'default' },
  ]);
  setMetricList(opsModalLifeSupportEl, [
    { label: 'Active', value: `${state.ops.lifeSupportActive}/${state.ops.lifeSupportTotal}` },
    { label: 'Air', value: `+${state.metrics.lifeSupportActiveAirPerSec.toFixed(1)}/s`, tone: state.metrics.lifeSupportActiveAirPerSec <= 0 ? 'warn' : 'ok' },
    { label: 'Potential', value: `+${state.metrics.lifeSupportPotentialAirPerSec.toFixed(1)}/s` },
    { label: 'Coverage', value: `${state.metrics.lifeSupportCoveragePct.toFixed(0)}% / ${state.metrics.poorLifeSupportTiles} poor`, tone: state.metrics.poorLifeSupportTiles > 0 ? 'warn' : 'default' },
  ]);
  setMetricList(opsModalRoomUsageEl, [
    { label: 'Dorm', value: state.metrics.toDormResidents },
    { label: 'Resting', value: state.metrics.dormSleepingResidents },
    { label: 'Hygiene', value: state.metrics.hygieneCleaningResidents },
    { label: 'Queue', value: state.metrics.cafeteriaQueueingCount },
    { label: 'Eating', value: state.metrics.cafeteriaEatingCount },
    { label: 'Hydro Staff', value: `${state.metrics.hydroponicsStaffed}/${state.metrics.hydroponicsActiveGrowNodes}` },
    { label: 'LS Nodes', value: state.metrics.lifeSupportActiveNodes },
  ]);
  setMetricList(opsModalRoomFlowEl, [
    { label: 'Dorm/m', value: state.metrics.dormVisitsPerMin.toFixed(1) },
    { label: 'Hygiene/m', value: state.metrics.hygieneUsesPerMin.toFixed(1) },
    { label: 'Meals/m', value: state.metrics.mealsConsumedPerMin.toFixed(1) },
    { label: 'Dorm Fails/m', value: state.metrics.dormFailedAttemptsPerMin.toFixed(1), tone: state.metrics.dormFailedAttemptsPerMin > 0 ? 'warn' : 'default' },
    { label: 'Failed H/E/Y', value: `${state.metrics.failedNeedAttemptsHunger}/${state.metrics.failedNeedAttemptsEnergy}/${state.metrics.failedNeedAttemptsHygiene}` },
  ]);
  opsModalRoomWhyEl.textContent = roomWhyText();
  setMetricList(opsModalFoodFlowEl, [
    { label: 'Raw Food', value: `+${state.metrics.rawFoodProdRate.toFixed(1)}/s`, tone: state.metrics.rawFoodProdRate > 0 ? 'ok' : 'default' },
    { label: 'Meals', value: `+${state.metrics.kitchenMealProdRate.toFixed(1)}/s`, tone: state.metrics.kitchenMealProdRate > 0 ? 'ok' : 'default' },
    { label: 'Use', value: `${state.metrics.mealUseRate.toFixed(1)}/s` },
  ]);
  setMetricList(opsModalKitchenEl, [
    { label: 'Active', value: `${state.ops.kitchenActive}/${state.ops.kitchenTotal}` },
    { label: 'Raw Buffer', value: state.metrics.kitchenRawBuffer.toFixed(1), tone: state.metrics.kitchenRawBuffer <= 0 && state.ops.kitchenActive > 0 ? 'warn' : 'default' },
    { label: 'Meal/s', value: `+${state.metrics.kitchenMealProdRate.toFixed(1)}` },
  ]);
  setMetricList(opsModalTradeEl, [
    { label: 'Workshop', value: `+${state.metrics.workshopTradeGoodProdRate.toFixed(1)}/s` },
    { label: 'Stock', value: state.metrics.marketTradeGoodStock.toFixed(1) },
    { label: 'Sold/m', value: state.metrics.tradeGoodsSoldPerMin.toFixed(1) },
    { label: 'Stockouts/m', value: state.metrics.marketStockoutsPerMin.toFixed(1), tone: state.metrics.marketStockoutsPerMin > 0 ? 'warn' : 'default' },
  ]);
  opsModalFoodChainEl.textContent = foodChainHintText();
  setMetricList(opsModalTrafficEl, [
    { label: 'Visitors', value: state.metrics.visitorsCount },
    { label: 'Docked', value: state.metrics.dockedShips },
    { label: 'Exits/m', value: state.metrics.exitsPerMin },
  ]);
  setMetricList(opsModalBerthsEl, [
    { label: 'Visitor', value: `${state.metrics.visitorBerthsOccupied}/${state.metrics.visitorBerthsTotal}` },
    { label: 'Resident', value: `${state.metrics.residentBerthsOccupied}/${state.metrics.residentBerthsTotal}` },
    { label: 'Ships', value: state.metrics.residentShipsDocked },
  ]);
  setMetricList(opsModalDemandEl, [
    { label: 'Cafeteria', value: `${Math.round(state.metrics.shipDemandCafeteriaPct)}%` },
    { label: 'Market', value: `${Math.round(state.metrics.shipDemandMarketPct)}%` },
    { label: 'Lounge', value: `${Math.round(state.metrics.shipDemandLoungePct)}%` },
  ]);
  setMetricList(opsModalArchetypesEl, [
    { label: 'Diner', value: state.metrics.visitorsByArchetype.diner },
    { label: 'Shopper', value: state.metrics.visitorsByArchetype.shopper },
    { label: 'Lounger', value: state.metrics.visitorsByArchetype.lounger },
    { label: 'Rusher', value: state.metrics.visitorsByArchetype.rusher },
  ]);
  setMetricList(opsModalResidentConversionEl, [
    { label: 'Residents', value: state.metrics.residentsCount, tone: state.metrics.residentsCount > 0 ? 'ok' : 'default' },
    { label: 'Attempts', value: `${state.metrics.residentConversionSuccesses}/${state.metrics.residentConversionAttempts}`, tone: state.metrics.residentConversionAttempts > 0 && state.metrics.residentConversionSuccesses <= 0 ? 'warn' : 'default' },
    { label: 'Last', value: state.metrics.residentConversionLastResult || 'waiting' },
    { label: 'Chance', value: state.metrics.residentConversionLastChancePct > 0 ? `${state.metrics.residentConversionLastChancePct.toFixed(1)}%` : 'n/a', tone: state.metrics.residentConversionLastChancePct > 0 && state.metrics.residentConversionLastChancePct < 3 ? 'warn' : 'default' },
    { label: 'Last Ship', value: state.metrics.residentConversionLastShip || 'none' },
    { label: 'Private Beds', value: state.metrics.residentPrivateBedsTotal, tone: state.metrics.residentPrivateBedsTotal <= 0 ? 'danger' : 'ok' },
    { label: 'Residential Berths', value: state.metrics.residentBerthsTotal, tone: state.metrics.residentBerthsTotal <= 0 ? 'danger' : 'ok' },
    { label: 'Rating', value: Math.round(state.metrics.stationRating), tone: state.metrics.stationRating < 40 ? 'danger' : state.metrics.stationRating < 70 ? 'warn' : 'ok' },
  ]);
  setMetricList(opsModalResidentNeedsEl, [
    { label: 'Residents', value: state.metrics.residentsCount },
    { label: 'Hunger', value: `${state.metrics.residentHungerAvg.toFixed(0)}%`, tone: state.metrics.residentHungerAvg > 0 && state.metrics.residentHungerAvg < 45 ? 'warn' : 'default' },
    { label: 'Energy', value: `${state.metrics.residentEnergyAvg.toFixed(0)}%`, tone: state.metrics.residentEnergyAvg > 0 && state.metrics.residentEnergyAvg < 45 ? 'warn' : 'default' },
    { label: 'Hygiene', value: `${state.metrics.residentHygieneAvg.toFixed(0)}%`, tone: state.metrics.residentHygieneAvg > 0 && state.metrics.residentHygieneAvg < 45 ? 'warn' : 'default' },
    { label: 'Social', value: `${state.metrics.residentSocialAvg.toFixed(0)}%` },
    { label: 'Safety', value: `${state.metrics.residentSafetyAvg.toFixed(0)}%` },
    { label: 'Satisfaction', value: `${state.metrics.residentSatisfactionAvg.toFixed(0)}%` },
  ]);
  setMetricList(opsModalShipsEl, [
    { label: 'Tour', value: state.metrics.shipsByTypePerMin.tourist.toFixed(1) },
    { label: 'Trade', value: state.metrics.shipsByTypePerMin.trader.toFixed(1) },
    { label: 'Industrial', value: state.metrics.shipsByTypePerMin.industrial.toFixed(1) },
    { label: 'Military', value: state.metrics.shipsByTypePerMin.military.toFixed(1) },
    { label: 'Colonist', value: state.metrics.shipsByTypePerMin.colonist.toFixed(1) },
  ]);
  setMetricList(opsModalWalkEl, [
    { label: 'Avg Walk', value: state.metrics.avgVisitorWalkDistance.toFixed(1) },
    { label: 'Skipped Docks', value: state.metrics.shipsSkippedNoEligibleDock, tone: state.metrics.shipsSkippedNoEligibleDock > 0 ? 'warn' : 'default' },
    { label: 'Queue Timeouts', value: state.metrics.shipsTimedOutInQueue, tone: state.metrics.shipsTimedOutInQueue > 0 ? 'danger' : 'default' },
  ]);
  setMetricList(opsModalRatingPenaltiesEl, [
    { label: 'Queue Timeout', value: `${state.metrics.stationRatingPenaltyPerMin.queueTimeout.toFixed(1)}/m`, tone: state.metrics.stationRatingPenaltyPerMin.queueTimeout > 0 ? 'danger' : 'default' },
    { label: 'No Dock', value: `${state.metrics.stationRatingPenaltyPerMin.noEligibleDock.toFixed(1)}/m`, tone: state.metrics.stationRatingPenaltyPerMin.noEligibleDock > 0 ? 'warn' : 'default' },
    { label: 'Service Fail', value: `${state.metrics.stationRatingPenaltyPerMin.serviceFailure.toFixed(1)}/m`, tone: state.metrics.stationRatingPenaltyPerMin.serviceFailure > 0 ? 'warn' : 'default' },
    { label: 'Long Routes', value: `${state.metrics.stationRatingPenaltyPerMin.longWalks.toFixed(1)}/m`, tone: state.metrics.stationRatingPenaltyPerMin.longWalks > 0 ? 'warn' : 'default' },
    { label: 'Bad Routes', value: `${state.metrics.stationRatingPenaltyPerMin.routeExposure.toFixed(1)}/m`, tone: state.metrics.stationRatingPenaltyPerMin.routeExposure > 0 ? 'warn' : 'default' },
    { label: 'Environment', value: `${state.metrics.stationRatingPenaltyPerMin.environment.toFixed(1)}/m`, tone: state.metrics.stationRatingPenaltyPerMin.environment > 0 ? 'warn' : 'default' },
  ]);
  setMetricList(opsModalRatingBonusesEl, [
    { label: 'Meals', value: `${state.metrics.stationRatingBonusPerMin.mealService.toFixed(1)}/m`, tone: state.metrics.stationRatingBonusPerMin.mealService > 0 ? 'ok' : 'default' },
    { label: 'Leisure', value: `${state.metrics.stationRatingBonusPerMin.leisureService.toFixed(1)}/m`, tone: state.metrics.stationRatingBonusPerMin.leisureService > 0 ? 'ok' : 'default' },
    { label: 'Exits', value: `${state.metrics.stationRatingBonusPerMin.successfulExit.toFixed(1)}/m`, tone: state.metrics.stationRatingBonusPerMin.successfulExit > 0 ? 'ok' : 'default' },
    { label: 'Residents', value: `${state.metrics.stationRatingBonusPerMin.residentRetention.toFixed(1)}/m`, tone: state.metrics.stationRatingBonusPerMin.residentRetention > 0 ? 'ok' : 'default' },
  ]);
  setMetricList(opsModalRatingFailuresEl, [
    { label: 'No Leisure', value: `${state.metrics.stationRatingServiceFailureByReasonPerMin.noLeisurePath.toFixed(1)}/m`, tone: state.metrics.stationRatingServiceFailureByReasonPerMin.noLeisurePath > 0 ? 'warn' : 'default' },
    { label: 'Missing Svc', value: `${state.metrics.stationRatingServiceFailureByReasonPerMin.shipServicesMissing.toFixed(1)}/m`, tone: state.metrics.stationRatingServiceFailureByReasonPerMin.shipServicesMissing > 0 ? 'warn' : 'default' },
    { label: 'Patience', value: `${state.metrics.stationRatingServiceFailureByReasonPerMin.patienceBail.toFixed(1)}/m`, tone: state.metrics.stationRatingServiceFailureByReasonPerMin.patienceBail > 0 ? 'warn' : 'default' },
    { label: 'Dock Wait', value: `${state.metrics.stationRatingServiceFailureByReasonPerMin.dockTimeout.toFixed(1)}/m`, tone: state.metrics.stationRatingServiceFailureByReasonPerMin.dockTimeout > 0 ? 'danger' : 'default' },
    { label: 'Trespass', value: `${state.metrics.stationRatingServiceFailureByReasonPerMin.trespass.toFixed(1)}/m`, tone: state.metrics.stationRatingServiceFailureByReasonPerMin.trespass > 0 ? 'danger' : 'default' },
  ]);
  opsModalRatingEl.textContent = ratingWhyText();
}

function refreshAlertPanel(): void {
  const alerts: Array<{ tone: 'danger' | 'warn'; text: string }> = [];
  if (state.metrics.mealStock < 8) alerts.push({ tone: 'danger', text: `Low meals: ${Math.round(state.metrics.mealStock)}` });
  else if (state.metrics.mealStock < 25) alerts.push({ tone: 'warn', text: `Meals running low: ${Math.round(state.metrics.mealStock)}` });
  if (state.metrics.airQuality < 35) alerts.push({ tone: 'danger', text: `Oxygen low: ${Math.round(state.metrics.airQuality)}%` });
  if (state.metrics.airBlockedWarningActive) alerts.push({ tone: 'danger', text: 'Life support blocked' });
  if (state.metrics.powerDemand > state.metrics.powerSupply) alerts.push({ tone: 'danger', text: 'Power deficit' });
  else if (state.metrics.loadPct > 85) alerts.push({ tone: 'warn', text: `Power load high: ${Math.round(state.metrics.loadPct)}%` });
  if (state.metrics.leakingTiles > 0 || state.metrics.pressurizationPct < 85) {
    alerts.push({ tone: state.metrics.pressurizationPct < 60 ? 'danger' : 'warn', text: `Hull ${Math.round(state.metrics.pressurizationPct)}%, leaks ${state.metrics.leakingTiles}` });
  }
  if (state.metrics.incidentsOpen > 0) alerts.push({ tone: 'danger', text: `Active incidents: ${state.metrics.incidentsOpen}` });
  if (state.effects.fires.length > 0) {
    const total = state.effects.fires.length;
    const peak = Math.round(state.effects.fires.reduce((m, f) => Math.max(m, f.intensity), 0));
    alerts.push({ tone: 'danger', text: `🔥 Fire! ${total} tile${total > 1 ? 's' : ''} burning (peak ${peak})` });
  }
  // Dock-migration v0: surface ship-waiting-on-capability hints. The
  // sim writes shipsQueuedNoCapabilityHint each cycle when a berth
  // would fit by size but not by capability tags.
  if (state.metrics.shipsQueuedNoCapabilityCount > 0 && state.metrics.shipsQueuedNoCapabilityHint) {
    alerts.push({ tone: 'warn', text: state.metrics.shipsQueuedNoCapabilityHint });
  }
  if (alerts.length === 0) {
    alertListEl.textContent = 'No active alerts';
    alertListEl.classList.add('is-clear');
    return;
  }
  alertListEl.classList.remove('is-clear');
  alertListEl.innerHTML = alerts
    .slice(0, 5)
    .map((alert) => `<div class="alert-item ${alert.tone}">${alert.text}</div>`)
    .join('');
}

// Energy threshold the sim uses to push crew into a rest cycle. Mirrors
// CREW_REST_ENERGY_THRESHOLD in sim.ts — kept in sync manually because exporting
// the constant would couple the UI to internal sim numerics.
const CREW_REST_THRESHOLD_UI = 42;
const CREW_REST_CRITICAL_UI = 18;
const CREW_CLEAN_THRESHOLD_UI = 38;
const CREW_TOILET_THRESHOLD_UI = 25;
const CREW_THIRST_THRESHOLD_UI = 32;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c] as string));
}

function needBarHtml(label: string, value: number, threshold: number, criticalThreshold: number | null, hint: string): string {
  const pct = Math.max(0, Math.min(100, value));
  const tone = criticalThreshold !== null && value < criticalThreshold
    ? 'critical'
    : value < threshold
      ? 'low'
      : value < threshold + 20
        ? 'warn'
        : 'ok';
  const markerLeft = `${Math.max(0, Math.min(100, threshold))}%`;
  return `<div class="need-bar need-bar--${tone}" title="${escapeHtml(hint)}">
    <span class="need-bar__label">${escapeHtml(label)}</span>
    <div class="need-bar__track">
      <div class="need-bar__fill" style="width:${pct.toFixed(0)}%"></div>
      <div class="need-bar__threshold" style="left:${markerLeft}"></div>
    </div>
    <span class="need-bar__value">${value.toFixed(0)}</span>
  </div>`;
}

// Builds a per-route exposure summary (e.g. "3 social, 2 service tiles"). Mirrors
// the cost categories in path.ts/logisticsRoomCost so the player can see *why* a
// route was chosen — long path through cafeteria reads as "social: 5" here.
function routeExposureSummary(exposure: RouteExposure): string {
  const parts: string[] = [];
  if (exposure.socialTiles > 0) parts.push(`${exposure.socialTiles} social`);
  if (exposure.serviceTiles > 0) parts.push(`${exposure.serviceTiles} service`);
  if (exposure.cargoTiles > 0) parts.push(`${exposure.cargoTiles} cargo`);
  if (exposure.residentialTiles > 0) parts.push(`${exposure.residentialTiles} residential`);
  if (exposure.securityTiles > 0) parts.push(`${exposure.securityTiles} security`);
  if (exposure.publicTiles > 0) parts.push(`${exposure.publicTiles} public`);
  if (parts.length === 0) parts.push('back-of-house');
  return parts.join(', ');
}

function formatCrewSelectionHtml(crewId: number): string {
  const inspector = getCrewInspectorById(state, crewId);
  if (!inspector) return 'Selected crew is no longer available.';
  const crew = state.crewMembers.find((c) => c.id === crewId);

  const roleLabel = inspector.resting
    ? 'Resting'
    : inspector.toileting
      ? 'Toilet'
      : inspector.drinking
        ? 'Drinking'
        : inspector.cleaning
          ? 'Cleaning'
          : inspector.leisure
            ? 'Leisure'
            : inspector.role;
  const workLabel = inspector.activeJobId !== null ? `job #${inspector.activeJobId}` : inspector.currentAction;

  const energyHint = `rests at <${CREW_REST_THRESHOLD_UI}, critical at <${CREW_REST_CRITICAL_UI}, returns at 86`;
  const hygieneHint = `cleans at <${CREW_CLEAN_THRESHOLD_UI}`;
  const bladderHint = `seeks toilet at <${CREW_TOILET_THRESHOLD_UI}`;
  const thirstHint = `seeks drink at <${CREW_THIRST_THRESHOLD_UI} (Cantina or Water Fountain)`;

  const parts: string[] = [];
  parts.push(`<div class="agent-card__head">
    <span class="agent-card__title">Crew #${inspector.id}</span>
    <span class="agent-card__role">${escapeHtml(roleLabel)} · ${escapeHtml(workLabel)}</span>
  </div>`);
  parts.push(`<div class="agent-card__action">${escapeHtml(inspector.currentAction)}</div>`);
  if (inspector.actionReason) {
    parts.push(`<div class="agent-card__reason">${escapeHtml(inspector.actionReason)}</div>`);
  }
  const airHint = `local oxygen at this tile (distress <30, critical <15)`;
  parts.push(`<div class="agent-card__needs">
    ${needBarHtml('Energy', inspector.energy, CREW_REST_THRESHOLD_UI, CREW_REST_CRITICAL_UI, energyHint)}
    ${needBarHtml('Hygiene', inspector.hygiene, CREW_CLEAN_THRESHOLD_UI, null, hygieneHint)}
    ${needBarHtml('Bladder', inspector.bladder, CREW_TOILET_THRESHOLD_UI, null, bladderHint)}
    ${needBarHtml('Thirst', inspector.thirst, CREW_THIRST_THRESHOLD_UI, null, thirstHint)}
    ${needBarHtml('Air', inspector.localAir, 30, 15, airHint)}
  </div>`);
  if (inspector.airExposureSec > 0.5) {
    parts.push(`<div class="agent-card__warn">⚠ low-air exposure ${inspector.airExposureSec.toFixed(1)}s</div>`);
  }

  if (inspector.activeJobId !== null) {
    const job = state.jobs.find((j) => j.id === inspector.activeJobId);
    if (job) {
      const carrying = inspector.carryingAmount > 0
        ? `carrying ${inspector.carryingAmount.toFixed(1)} ${inspector.carryingItemType ?? ''}`
        : 'en-route to pickup';
      parts.push(`<div class="agent-card__job">
        Job #${job.id}: ${escapeHtml(job.itemType)} ${job.amount.toFixed(1)} (${carrying})
      </div>`);
    }
  } else if (inspector.idleReason !== 'idle_available') {
    parts.push(`<div class="agent-card__idle">Idle: ${escapeHtml(inspector.idleReason.replace('idle_', ''))}</div>`);
  }
  parts.push(`<div class="agent-card__route">Target ${escapeHtml(inspector.providerTarget ?? 'none')} · reservation ${escapeHtml(inspector.reservationSummary)}</div>`);
  if (inspector.blockedReason) {
    parts.push(`<div class="agent-card__warn">Blocked: ${escapeHtml(inspector.blockedReason)}</div>`);
  }

  if (crew?.lastRouteExposure && crew.lastRouteExposure.distance > 0 && inspector.activeJobId !== null) {
    parts.push(`<div class="agent-card__route">
      Route: ${crew.lastRouteExposure.distance} tiles · ${escapeHtml(routeExposureSummary(crew.lastRouteExposure))}
    </div>`);
  }

  if (inspector.blockedTicks > 4) {
    parts.push(`<div class="agent-card__warn">⚠ Path blocked ${inspector.blockedTicks} ticks</div>`);
  }
  return parts.join('');
}

function selectedAgentTitle(): string {
  if (!selectedAgent) return 'Agent Inspector';
  if (selectedAgent.kind === 'visitor') return `Visitor #${selectedAgent.id}`;
  if (selectedAgent.kind === 'resident') return `Resident #${selectedAgent.id}`;
  return `Crew #${selectedAgent.id}`;
}

function formatVisitorInspectorHtml(visitorId: number): string {
  const inspector = getVisitorInspectorById(state, visitorId);
  if (!inspector) return 'Selected visitor is no longer available.';
  return [
    `<div class="agent-card__head"><span class="agent-card__title">Visitor #${inspector.id}</span><span class="agent-card__role">${escapeHtml(inspector.archetype)} · ${escapeHtml(inspector.primaryPreference)}</span></div>`,
    `<div class="agent-card__action">${escapeHtml(inspector.currentAction)}</div>`,
    `<div class="agent-card__reason">${escapeHtml(inspector.actionReason)}</div>`,
    `<div class="side-inspector-grid">
      <span>State</span><strong>${escapeHtml(inspector.state)}</strong>
      <span>Desire</span><strong>${escapeHtml(inspector.desire)}</strong>
      <span>Target</span><strong>${escapeHtml(formatTileLabel(inspector.targetTile))}</strong>
      <span>Provider</span><strong>${escapeHtml(inspector.providerTarget ?? 'none')}</strong>
      <span>Reservation</span><strong>${escapeHtml(inspector.reservationSummary)}</strong>
      <span>Path</span><strong>${inspector.pathLength} steps</strong>
      <span>Health</span><strong style="color:${healthColor(inspector.healthState)}">${escapeHtml(inspector.healthState)}</strong>
      <span>Patience</span><strong>${inspector.patience.toFixed(1)}</strong>
    </div>`,
    `<div class="agent-card__route">Meal ${inspector.servedMeal ? 'served' : 'not served'} · carrying ${inspector.carryingMeal ? 'yes' : 'no'} · serving ${escapeHtml(formatTileLabel(inspector.reservedServingTile))}</div>`,
    inspector.blockedReason ? `<div class="agent-card__warn">Blocked: ${escapeHtml(inspector.blockedReason)}</div>` : ''
  ].join('');
}

function formatResidentInspectorHtml(residentId: number): string {
  const inspector = getResidentInspectorById(state, residentId);
  if (!inspector) return 'Selected resident is no longer available.';
  return [
    `<div class="agent-card__head"><span class="agent-card__title">Resident #${inspector.id}</span><span class="agent-card__role">${escapeHtml(inspector.role)} · ${escapeHtml(inspector.routinePhase)}</span></div>`,
    `<div class="agent-card__action">${escapeHtml(inspector.currentAction)}</div>`,
    `<div class="agent-card__reason">${escapeHtml(inspector.actionReason)}</div>`,
    `<div class="agent-card__needs">
      ${needBarHtml('Hunger', inspector.hunger, 55, 20, 'eats below 55')}
      ${needBarHtml('Energy', inspector.energy, 42, 18, 'rests below 42')}
      ${needBarHtml('Hygiene', inspector.hygiene, 45, null, 'cleans below 45')}
      ${needBarHtml('Safety', inspector.safety, 35, null, 'seeks safety below 35')}
    </div>`,
    `<div class="side-inspector-grid">
      <span>Desire</span><strong>${escapeHtml(inspector.desire)}</strong>
      <span>Target</span><strong>${escapeHtml(formatTileLabel(inspector.targetTile))}</strong>
      <span>Provider</span><strong>${escapeHtml(inspector.providerTarget ?? 'none')}</strong>
      <span>Reservation</span><strong>${escapeHtml(inspector.reservationSummary)}</strong>
      <span>Path</span><strong>${inspector.pathLength} steps</strong>
      <span>Stress</span><strong>${inspector.stress.toFixed(1)}</strong>
      <span>Satisfaction</span><strong>${inspector.satisfaction.toFixed(1)}</strong>
      <span>Leave</span><strong>${inspector.leaveIntent.toFixed(1)}</strong>
    </div>`,
    inspector.blockedReason ? `<div class="agent-card__warn">Blocked: ${escapeHtml(inspector.blockedReason)}</div>` : ''
  ].join('');
}

function selectedAgentInspectorHtml(): string {
  if (!selectedAgent) return 'No agent selected.';
  if (selectedAgent.kind === 'visitor') return formatVisitorInspectorHtml(selectedAgent.id);
  if (selectedAgent.kind === 'resident') return formatResidentInspectorHtml(selectedAgent.id);
  return formatCrewSelectionHtml(selectedAgent.id);
}

function refreshAgentSidePanel(): boolean {
  if (!selectedAgent) {
    agentSidePanel.classList.add('hidden');
    return false;
  }
  const html = selectedAgentInspectorHtml();
  if (html.includes('no longer available')) {
    agentSidePanel.classList.add('hidden');
    return false;
  }
  agentSideTitleEl.textContent = selectedAgentTitle();
  agentSideBodyEl.innerHTML = html;
  agentSidePanel.classList.remove('hidden');
  return true;
}

function refreshSelectionSummary(): void {
  if (selectedAgent !== null) {
    if (selectedAgent.kind === 'visitor') {
      const inspector = getVisitorInspectorById(state, selectedAgent.id);
      selectionSummaryEl.textContent = inspector
        ? `Visitor #${inspector.id}: ${inspector.state} | ${inspector.currentAction} | ${inspector.healthState}`
        : 'Selected visitor is no longer available.';
      return;
    }
    if (selectedAgent.kind === 'resident') {
      const inspector = getResidentInspectorById(state, selectedAgent.id);
      selectionSummaryEl.textContent = inspector
        ? `Resident #${inspector.id}: ${inspector.role} | ${inspector.currentAction} | ${inspector.healthState}`
        : 'Selected resident is no longer available.';
      return;
    }
    const inspector = getCrewInspectorById(state, selectedAgent.id);
    selectionSummaryEl.textContent = inspector
      ? `Crew #${inspector.id}: ${inspector.state} | ${inspector.currentAction} | ${inspector.healthState}`
      : 'Selected crew is no longer available.';
    return;
  }
  if (selectedDockId !== null) {
    const dock = state.docks.find((d) => d.id === selectedDockId);
    selectionSummaryEl.textContent = dock
      ? `Dock #${dock.id}: ${dock.purpose} | ${dock.lane} lane | facing ${dock.facing}`
      : 'Selected dock is no longer available.';
    return;
  }
  if (selectedRoomTile !== null) {
    const inspector = getRoomInspectorAt(state, selectedRoomTile);
    selectionSummaryEl.textContent = inspector
      ? `${inspector.room}: ${inspector.active ? 'active' : 'inactive'} | staff ${inspector.staffCount}/${inspector.requiredStaff} | pressure ${inspector.pressurizedPct.toFixed(0)}%`
      : 'Selected room is no longer available.';
    return;
  }
  selectionSummaryEl.textContent = 'No room, dock, or resident selected.';
}

// Color a tile by its room category so the route polyline visually shows *why* a
// segment is cheap or costly. Mirrors the route-intent cost categories in path.ts —
// social/residential are penalized for logistics, service tiles are not. The user
// can see "this hauler routed through 3 cafeteria tiles" without reading code.
function routeTileColor(roomType: RoomType): string {
  switch (roomType) {
    case RoomType.Cafeteria:
    case RoomType.Lounge:
    case RoomType.Market:
    case RoomType.RecHall:
    case RoomType.Cantina:
    case RoomType.Observatory:
      return '#ff9d3a'; // social — +7 logistics cost
    case RoomType.Dorm:
    case RoomType.Hygiene:
      return '#ff7ad8'; // residential — +8 logistics cost
    case RoomType.Reactor:
    case RoomType.LifeSupport:
    case RoomType.Workshop:
    case RoomType.Kitchen:
    case RoomType.Hydroponics:
      return '#5cd8ff'; // service
    case RoomType.Storage:
    case RoomType.LogisticsStock:
    case RoomType.Berth:
      return '#b07cff'; // cargo
    case RoomType.Security:
    case RoomType.Brig:
      return '#ff5050'; // security
    case RoomType.Clinic:
      return '#ffd86a'; // clinic
    default:
      return '#5cf598'; // open corridor — no penalty
  }
}

// Draws the selected crew member's planned path on top of the world. Tile
// segments are colored by room category so the player can see why the route
// was chosen (cheap green corridors vs. costly orange social tiles). Endpoints
// get markers — circle at the crew, diamond at the destination.
function selectedAgentRouteData(): { x: number; y: number; path: number[] } | null {
  if (!selectedAgent) return null;
  if (selectedAgent.kind === 'crew') {
    const crew = state.crewMembers.find((c) => c.id === selectedAgent!.id);
    return crew && crew.path.length > 0 ? { x: crew.x, y: crew.y, path: crew.path } : null;
  }
  if (selectedAgent.kind === 'visitor') {
    const visitor = state.visitors.find((v) => v.id === selectedAgent!.id);
    return visitor && visitor.path.length > 0 ? { x: visitor.x, y: visitor.y, path: visitor.path } : null;
  }
  const resident = state.residents.find((r) => r.id === selectedAgent!.id);
  return resident && resident.path.length > 0 ? { x: resident.x, y: resident.y, path: resident.path } : null;
}

function drawSelectedAgentRoute(ctx: CanvasRenderingContext2D): void {
  const route = selectedAgentRouteData();
  if (!route) return;

  const startPx = route.x * TILE_SIZE;
  const startPy = route.y * TILE_SIZE;

  ctx.save();
  ctx.lineWidth = Math.max(2, TILE_SIZE * 0.12);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Translucent black halo so the colored line reads against any tile.
  ctx.strokeStyle = 'rgba(8, 14, 22, 0.55)';
  ctx.lineWidth = Math.max(4, TILE_SIZE * 0.2);
  ctx.beginPath();
  ctx.moveTo(startPx, startPy);
  for (const tile of route.path) {
    const tx = tile % state.width;
    const ty = Math.floor(tile / state.width);
    ctx.lineTo((tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE);
  }
  ctx.stroke();

  // Colored segments: each segment recolors based on the room of the *next* tile.
  ctx.lineWidth = Math.max(2, TILE_SIZE * 0.12);
  let prevPx = startPx;
  let prevPy = startPy;
  for (const tile of route.path) {
    const tx = tile % state.width;
    const ty = Math.floor(tile / state.width);
    const cx = (tx + 0.5) * TILE_SIZE;
    const cy = (ty + 0.5) * TILE_SIZE;
    ctx.strokeStyle = routeTileColor(state.rooms[tile]);
    ctx.beginPath();
    ctx.moveTo(prevPx, prevPy);
    ctx.lineTo(cx, cy);
    ctx.stroke();
    prevPx = cx;
    prevPy = cy;
  }

  // Endpoint markers: ring at crew, diamond at destination.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(startPx, startPy, TILE_SIZE * 0.32, 0, Math.PI * 2);
  ctx.stroke();

  const endTile = route.path[route.path.length - 1];
  const endX = (endTile % state.width + 0.5) * TILE_SIZE;
  const endY = (Math.floor(endTile / state.width) + 0.5) * TILE_SIZE;
  ctx.fillStyle = '#ffe06a';
  ctx.strokeStyle = 'rgba(8, 14, 22, 0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(endX, endY - TILE_SIZE * 0.28);
  ctx.lineTo(endX + TILE_SIZE * 0.28, endY);
  ctx.lineTo(endX, endY + TILE_SIZE * 0.28);
  ctx.lineTo(endX - TILE_SIZE * 0.28, endY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Dev-only overlay — "time to tier" at a glance for playtest pacing.
// Hidden unless `?dev=1` was set at startup. Reached tiers render
// `Tn: MM:SS` (from `state.unlocks.unlockedAtSec`), the current
// candidate renders `Tn: NN%` via the UNLOCK_DEFINITIONS progress fn,
// and future-unreached tiers render `Tn: —`. Catches pacing
// regressions during live play — e.g. awfml's "is T2 reachable?"
// question — without polluting the prod HUD.
export function buildDevTierOverlayString(state: StationState): string {
  const currentTier = getUnlockTier(state);
  return UNLOCK_DEFINITIONS.map((def) => {
    const label = `T${def.tier}`;
    if (state.unlocks.unlockedIds.includes(def.id)) {
      const at = state.unlocks.unlockedAtSec[def.id];
      if (typeof at !== 'number') return `${label}: ✓`;
      const s = Math.max(0, Math.floor(at));
      return `${label}: ${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
    }
    if (def.tier === currentTier + 1) {
      return `${label}: ${Math.round(def.trigger.progress(state.metrics) * 100)}%`;
    }
    return `${label}: —`;
  }).join(' · ');
}
function refreshDevTierOverlay(): void {
  if (!devModeEnabled) return;
  devTierOverlayEl.textContent = buildDevTierOverlayString(state);
}

function tierRequirementText(tier: UnlockTier): string {
  return PROGRESSION_TOOLTIP_COPY[tier]?.trigger ?? 'Progression requirement unavailable.';
}

function tierProgressSnapshot(): TierProgressSnapshot {
  const tier = getUnlockTier(state);
  if (tier >= 6) {
    return { pct: 100, nextTier: null, requirement: 'All progression tiers unlocked.' };
  }
  const nextTier = (tier + 1) as UnlockTier;
  const progress = UNLOCK_DEFINITIONS[nextTier - 1].trigger.progress(state.metrics);
  return {
    pct: Math.round(progress * 100),
    nextTier,
    requirement: PROGRESSION_TOOLTIP_COPY[nextTier].trigger,
  };
}

function checklistRatio(current: number, target: number): { label: string; done: boolean } {
  const safeCurrent = Math.max(0, Math.floor(current));
  return {
    label: `${Math.min(safeCurrent, target)}/${target}`,
    done: safeCurrent >= target,
  };
}

function tierChecklistItems(): Array<{ label: string; value: string; done: boolean }> {
  const tier = getUnlockTier(state);
  const nextTier = tier >= 6 ? null : ((tier + 1) as UnlockTier);
  if (nextTier === null) {
    return [{ label: 'Tutorial complete', value: 'Sandbox unlocked', done: true }];
  }
  if (nextTier === 1) {
    const visitors = checklistRatio(state.metrics.archetypesServedLifetime, 1);
    return [{ label: 'First visitor arrives', value: visitors.label, done: visitors.done }];
  }
  if (nextTier === 2) {
    const credits = checklistRatio(state.metrics.creditsEarnedLifetime, 500);
    const archetypes = checklistRatio(state.metrics.archetypesServedLifetime, 3);
    return [
      { label: 'Earn credits', value: `${credits.label}c`, done: credits.done },
      { label: 'Serve visitor types', value: archetypes.label, done: archetypes.done },
    ];
  }
  if (nextTier === 3) {
    const trades = checklistRatio(state.metrics.tradeCyclesCompletedLifetime, 1);
    return [{ label: 'Workshop to market trade', value: trades.label, done: trades.done }];
  }
  if (nextTier === 4) {
    const treated = checklistRatio(state.metrics.actorsTreatedLifetime, 1);
    const incidents = checklistRatio(state.metrics.incidentsResolvedLifetime, 1);
    return [
      { label: 'Treat a patient', value: treated.label, done: treated.done },
      { label: 'Resolve dispatched incident', value: incidents.label, done: incidents.done },
    ];
  }
  if (nextTier === 5) {
    const residents = checklistRatio(state.metrics.residentsCount, 5);
    const beds = checklistRatio(state.metrics.residentPrivateBedsTotal, 5);
    const berths = checklistRatio(state.metrics.residentBerthsTotal, 1);
    return [
      { label: 'Permanent residents', value: residents.label, done: residents.done },
      { label: 'Private resident beds', value: beds.label, done: beds.done },
      { label: 'Residential berth', value: berths.label, done: berths.done },
    ];
  }
  return [{ label: 'Complete health loop', value: '0/1', done: false }];
}

function refreshTierChecklist(): void {
  const progress = tierProgressSnapshot();
  const heading = progress.nextTier === null
    ? 'All tiers unlocked'
    : `Next: Tier ${progress.nextTier} (${progress.pct}%)`;
  const rows = tierChecklistItems()
    .map((item) => `
      <div class="checklist-item ${item.done ? 'done' : ''}">
        <span class="checkmark">${item.done ? '✓' : ''}</span>
        <span>${item.label}</span>
        <span class="value">${item.value}</span>
      </div>
    `)
    .join('');
  tierChecklistEl.innerHTML = `<div class="checklist-heading">${heading}</div>${rows}`;
}

function formatTierList(items: string[]): string {
  return items.length > 0 ? items.join(', ') : 'None';
}

function refreshProgressionModal(): void {
  const tier = getUnlockTier(state);
  const tierInfo = TIER_PRESENTATION[tier];
  const progress = tierProgressSnapshot();
  progressModalTierNameEl.textContent = `Tier ${tier}: ${tierInfo.name}`;
  progressModalTierThemeEl.textContent = tierInfo.theme;
  progressModalFillEl.style.width = `${progress.pct}%`;
  progressModalPctEl.textContent = `Progress: ${progress.pct}%`;
  progressModalGoalEl.textContent = progress.requirement;

  if (progress.nextTier !== null) {
    const nextInfo = TIER_PRESENTATION[progress.nextTier];
    const nextCopy = PROGRESSION_TOOLTIP_COPY[progress.nextTier];
    progressModalNextTierNameEl.textContent = `Tier ${progress.nextTier}: ${nextInfo.name}`;
    progressModalNextCriteriaEl.textContent = `Unlock Requirement: ${tierRequirementText(progress.nextTier)}`;
    progressModalNextBuildingsEl.textContent = `New Buildings: ${formatTierList(nextInfo.buildings)}`;
    progressModalNextNeedsEl.textContent = `New Citizen Needs: ${formatTierList(nextInfo.citizenNeeds)}`;
    progressModalNextVisitorNeedsEl.textContent = `New Visitor/Ship Needs: ${formatTierList(nextInfo.visitorNeeds)}`;
    progressModalNextShipsEl.textContent = `New Ship Families: ${formatTierList(nextInfo.ships)}`;
    progressModalNextSystemsEl.textContent = `New Systems: ${formatTierList(nextInfo.systems)}`;
  } else {
    progressModalNextTierNameEl.textContent = 'Tier 6 complete: all tiers unlocked';
    progressModalNextCriteriaEl.textContent = 'Unlock Requirement: n/a';
    progressModalNextBuildingsEl.textContent = 'New Buildings: none';
    progressModalNextNeedsEl.textContent = 'New Citizen Needs: none';
    progressModalNextVisitorNeedsEl.textContent = 'New Visitor/Ship Needs: none';
    progressModalNextShipsEl.textContent = 'New Ship Families: none';
    progressModalNextSystemsEl.textContent = 'New Systems: none';
  }

  progressModalRoadmapEl.innerHTML = TIER_ORDER.map((entryTier) => {
    const entry = TIER_PRESENTATION[entryTier];
    const statusClass = entryTier < tier ? 'done' : entryTier === tier ? 'current' : 'upcoming';
    const statusLabel = entryTier < tier ? 'Unlocked' : entryTier === tier ? 'Current Tier' : 'Upcoming';
    return `
      <div class="progression-tier-card ${statusClass}">
        <div class="progression-tier-head">
          <strong>Tier ${entryTier}: ${entry.name}</strong>
          <span class="progression-tier-status">${statusLabel}</span>
        </div>
        <small class="progression-tier-theme-line">${entry.theme}</small>
        <small><strong>Unlock Requirement:</strong> ${tierRequirementText(entryTier)}</small>
        <small><strong>Buildings:</strong> ${formatTierList(entry.buildings)}</small>
        <small><strong>Citizen Needs:</strong> ${formatTierList(entry.citizenNeeds)}</small>
        <small><strong>Visitor/Ship Needs:</strong> ${formatTierList(entry.visitorNeeds)}</small>
        <small><strong>Ship Families:</strong> ${formatTierList(entry.ships)}</small>
        <small><strong>Systems:</strong> ${formatTierList(entry.systems)}</small>
      </div>
    `;
  }).join('');
}

const simSpeeds: Array<1 | 2 | 4> = [1, 2, 4];
type PaletteSection = 'structure' | 'rooms' | 'modules' | 'overlays';
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

const GAME_VERSION = '0.1.0';
const SAVE_STORE_KEY = 'stationSim.saves.v1';
const AUTOSAVE_KEY = 'spacegame-autosave';
const AUTOSAVE_INTERVAL_MS = 60_000;
const QUICKSAVE_ID = 'quicksave';
const MAX_SAVE_SLOTS = 30;

type LocalSaveRecord = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  payloadText: string;
};

type SaveStore = {
  storeVersion: 1;
  saves: LocalSaveRecord[];
};

type SelectedAgent = { kind: 'visitor' | 'resident' | 'crew'; id: number };
type RoomStampCell = {
  dx: number;
  dy: number;
  tile: TileType;
  room: RoomType;
  zone: ZoneType;
  housingPolicy: HousingPolicy;
};
type RoomStampModule = {
  dx: number;
  dy: number;
  type: ModuleType;
  rotation: ModuleRotation;
  tileOffsets: Array<{ dx: number; dy: number }>;
};
type RoomStampDock = {
  dx: number;
  dy: number;
  purpose: DockPurpose;
  facing: SpaceLane;
  allowedShipTypes: ShipType[];
  allowedShipSizes: ShipSize[];
};
type RoomClipboard = {
  width: number;
  height: number;
  cells: RoomStampCell[];
  modules: RoomStampModule[];
  docks: RoomStampDock[];
  label: string;
};

let currentTool: BuildTool = { kind: 'tile', tile: TileType.Floor };
let roomClipboard: RoomClipboard | null = null;
let selectedDockId: number | null = null;
let selectedRoomTile: number | null = null;
let selectedAgent: SelectedAgent | null = null;
let isPainting = false;
let paintStart: { x: number; y: number } | null = null;
let paintCurrent: { x: number; y: number } | null = null;
let hoveredTile: number | null = null;
let activePaletteSection: PaletteSection = 'structure';
let lastPaletteToolKey = '';
let isRightPanning = false;
let panStartClientX = 0;
let panStartClientY = 0;
let panStartScrollLeft = 0;
let panStartScrollTop = 0;

function refreshTransportUi(): void {
  speedLabel.textContent = `${state.controls.simSpeed}x`;
  playBtn.classList.toggle('active', !state.controls.paused);
  pauseBtn.classList.toggle('active', state.controls.paused);
}
refreshTransportUi();

function updateMarketRates(): void {
  const loadFactor = clamp(state.metrics.loadPct / 100, 0, 1.4);
  const pulse = Math.sin(state.now * 0.15) * 0.05;
  const buyMultiplier = clamp(0.9 + loadFactor * 0.18 + pulse, 0.8, 1.35);
  const sellMultiplier = clamp(0.58 - loadFactor * 0.08 - pulse * 0.5, 0.38, 0.72);

  market.hireCost = Math.max(8, Math.round(14 * buyMultiplier));
  market.fireRefund = Math.max(1, Math.round(market.hireCost * 0.4));
  market.buyMat25Cost = quoteMaterialImportCost(state, 25);
  market.sellMat25Gain = Math.max(3, Math.round(20 * sellMultiplier));
  market.buyMat80Cost = quoteMaterialImportCost(state, 80);
  market.sellMat80Gain = Math.max(8, Math.round(55 * sellMultiplier));
  market.buyFood20Cost = Math.max(6, Math.round(11 * buyMultiplier));
  market.sellFood20Gain = Math.max(2, Math.round(12 * sellMultiplier));
  market.buyFood60Cost = Math.max(15, Math.round(28 * buyMultiplier));
  market.sellFood60Gain = Math.max(5, Math.round(30 * sellMultiplier));
}

function refreshMarketUi(): void {
  hireCrewBtn.textContent = `Hire +1 Crew (${market.hireCost}c)`;
  fireCrewBtn.textContent = `Fire -1 Crew (+${market.fireRefund}c)`;
  buySmallBtn.textContent = `Buy +25 Supplies (${market.buyMat25Cost}c)`;
  sellSmallBtn.textContent = `Sell -25 Supplies (+${market.sellMat25Gain}c)`;
  buyLargeBtn.textContent = `Buy +80 Supplies (${market.buyMat80Cost}c)`;
  sellLargeBtn.textContent = `Sell -80 Supplies (+${market.sellMat80Gain}c)`;
  buyFoodSmallBtn.textContent = `Buy +20 Raw Food (${market.buyFood20Cost}c)`;
  sellFoodSmallBtn.textContent = `Sell -20 Raw Food (+${market.sellFood20Gain}c)`;
  buyFoodLargeBtn.textContent = `Buy +60 Raw Food (${market.buyFood60Cost}c)`;
  sellFoodLargeBtn.textContent = `Sell -60 Raw Food (+${market.sellFood60Gain}c)`;
  marketCrewEl.textContent = `${state.crew.assigned} / ${state.crew.total} (free ${state.crew.free})`;
  materialAutoImportInput.checked = state.controls.materialAutoImportEnabled;
  materialTargetStockInput.value = String(Math.round(state.controls.materialTargetStock));
  materialImportBatchInput.value = String(Math.round(state.controls.materialImportBatchSize));
  materialImportStatusEl.textContent = `Auto import: ${state.metrics.materialAutoImportStatus} | ` +
    `${Math.round(state.metrics.materials)}/${Math.round(state.controls.materialTargetStock)} supplies` +
    (state.metrics.materialAutoImportLastAdded > 0
      ? ` | last +${state.metrics.materialAutoImportLastAdded.toFixed(1)} for ${state.metrics.materialAutoImportCreditCost}c`
      : '');

  const spread = market.buyMat25Cost - market.sellMat25Gain;
  marketRateEl.textContent = spread <= 8 ? 'Favorable' : spread <= 12 ? 'Normal' : 'Tight';
}

function materialBuyStatusText(
  result: ReturnType<typeof buyMaterialsDetailed>,
  amount: number
): string {
  if (result.ok) {
    return result.added < amount
      ? `Purchased +${result.added.toFixed(1)} supplies (intake full)`
      : `Purchased +${amount} supplies`;
  }
  if (result.reason === 'insufficient_credits') return 'Not enough credits';
  if (result.reason === 'no_logistics_stock') {
    return 'Build Logistics Stock + Intake Pallet to receive supplies';
  }
  return 'Intake full; add pallets or let haulers move supplies into storage';
}

function refreshPriorityUi(): void {
  for (const system of prioritySystems) {
    const input = priorityInputs.get(system);
    const valueEl = priorityValueEls.get(system);
    if (!input || !valueEl) continue;
    const value = state.controls.crewPriorityWeights[system];
    input.value = String(value);
    valueEl.textContent = String(value);
  }
}
refreshPriorityUi();
// Initialize prev-tier tracker to current (prevents flash on cold-load /
// save-restore). Then install the progression click handlers + paint
// initial states.
prevUnlockTier = state.unlocks.tier;
installLegendProgressionHandlers();
// The Build & Room Legend auto-expand at tiers 0-2 was removed alongside
// the legend panel itself (HUD cleanup pass). The top toolbar now carries
// the tiered tool palette and the quest bar + persistent HUD strip teach
// progression, so there's nothing to open here.
// Build toolbar — clickable surface for the ~30 hotkey-driven tools.
// Each button carries a data-tool-{kind}="{value}" attribute; the
// wire-up below maps that to the same selectRoomTool / selectModuleTool
// calls the keyboard handler uses. Hotkey behavior is unchanged —
// toolbar is additive, not replacing.
const TOOLBAR_TILE_MAP: Record<string, TileType> = {
  floor: TileType.Floor,
  truss: TileType.Truss,
  wall: TileType.Wall,
  dock: TileType.Dock,
  door: TileType.Door,
  airlock: TileType.Airlock,
  erase: TileType.Space,
};
const TOOLBAR_ZONE_MAP: Record<string, ZoneType> = {
  public: ZoneType.Public,
  restricted: ZoneType.Restricted,
};
const TOOLBAR_ROOM_MAP: Record<string, RoomType> = {
  cafeteria: RoomType.Cafeteria,
  kitchen: RoomType.Kitchen,
  workshop: RoomType.Workshop,
  clinic: RoomType.Clinic,
  brig: RoomType.Brig,
  'rec-hall': RoomType.RecHall,
  reactor: RoomType.Reactor,
  security: RoomType.Security,
  dorm: RoomType.Dorm,
  hygiene: RoomType.Hygiene,
  hydroponics: RoomType.Hydroponics,
  'life-support': RoomType.LifeSupport,
  lounge: RoomType.Lounge,
  market: RoomType.Market,
  'logistics-stock': RoomType.LogisticsStock,
  storage: RoomType.Storage,
  berth: RoomType.Berth,
  cantina: RoomType.Cantina,
  observatory: RoomType.Observatory,
};
const TOOLBAR_MODULE_MAP: Record<string, ModuleType> = {
  bed: ModuleType.Bed,
  table: ModuleType.Table,
  'serving-station': ModuleType.ServingStation,
  stove: ModuleType.Stove,
  'grow-station': ModuleType.GrowStation,
  shower: ModuleType.Shower,
  sink: ModuleType.Sink,
  'wall-light': ModuleType.WallLight,
  couch: ModuleType.Couch,
  'game-station': ModuleType.GameStation,
  'market-stall': ModuleType.MarketStall,
  workbench: ModuleType.Workbench,
  'intake-pallet': ModuleType.IntakePallet,
  'storage-rack': ModuleType.StorageRack,
  terminal: ModuleType.Terminal,
  'cell-console': ModuleType.CellConsole,
  'rec-unit': ModuleType.RecUnit,
  'med-bed': ModuleType.MedBed,
  gangway: ModuleType.Gangway,
  'customs-counter': ModuleType.CustomsCounter,
  'cargo-arm': ModuleType.CargoArm,
  'fire-extinguisher': ModuleType.FireExtinguisher,
  vent: ModuleType.Vent,
  'vending-machine': ModuleType.VendingMachine,
  bench: ModuleType.Bench,
  'bar-counter': ModuleType.BarCounter,
  tap: ModuleType.Tap,
  telescope: ModuleType.Telescope,
  'water-fountain': ModuleType.WaterFountain,
  plant: ModuleType.Plant,
  clear: ModuleType.None,
};

const MODULE_PALETTE_ICON_MAX_W = 46;
const MODULE_PALETTE_ICON_MAX_H = 34;
const MODULE_PALETTE_FALLBACK_LABEL: Record<ModuleType, string> = {
  [ModuleType.None]: '',
  [ModuleType.WallLight]: 'LT',
  [ModuleType.Bed]: 'BD',
  [ModuleType.Table]: 'TB',
  [ModuleType.ServingStation]: 'SV',
  [ModuleType.Stove]: 'ST',
  [ModuleType.Workbench]: 'WB',
  [ModuleType.MedBed]: 'MD',
  [ModuleType.CellConsole]: 'CL',
  [ModuleType.RecUnit]: 'RC',
  [ModuleType.GrowStation]: 'GR',
  [ModuleType.Terminal]: 'TM',
  [ModuleType.Couch]: 'CH',
  [ModuleType.GameStation]: 'GM',
  [ModuleType.Shower]: 'SH',
  [ModuleType.Sink]: 'SK',
  [ModuleType.MarketStall]: 'MK',
  [ModuleType.IntakePallet]: 'IN',
  [ModuleType.StorageRack]: 'SR',
  [ModuleType.Gangway]: 'GW',
  [ModuleType.CustomsCounter]: 'CC',
  [ModuleType.CargoArm]: 'CA',
  [ModuleType.FireExtinguisher]: 'FX',
  [ModuleType.Vent]: 'VT',
  [ModuleType.VendingMachine]: 'VM',
  [ModuleType.Bench]: 'BN',
  [ModuleType.BarCounter]: 'BC',
  [ModuleType.Tap]: 'TP',
  [ModuleType.Telescope]: 'TE',
  [ModuleType.WaterFountain]: 'WF',
  [ModuleType.Plant]: 'PL'
};

function applyModulePaletteFallback(btn: HTMLButtonElement, spriteEl: HTMLElement, module: ModuleType): void {
  btn.classList.remove('sprite-missing');
  btn.classList.add('sprite-fallback');
  spriteEl.removeAttribute('style');
  spriteEl.textContent = MODULE_PALETTE_FALLBACK_LABEL[module] || '?';
}

function refreshModulePaletteSprites(): void {
  document.querySelectorAll<HTMLButtonElement>('#toolbar .tool-btn[data-tool-module]').forEach((btn) => {
    const moduleKey = btn.dataset.toolModule;
    const module = moduleKey ? TOOLBAR_MODULE_MAP[moduleKey] : undefined;
    if (!module || module === ModuleType.None) return;

    let frameEl = btn.querySelector<HTMLElement>('.tool-sprite-frame');
    let spriteEl = btn.querySelector<HTMLElement>('.tool-sprite');
    if (!frameEl || !spriteEl) {
      frameEl = document.createElement('span');
      frameEl.className = 'tool-sprite-frame';
      frameEl.setAttribute('aria-hidden', 'true');
      spriteEl = document.createElement('span');
      spriteEl.className = 'tool-sprite';
      frameEl.appendChild(spriteEl);

      const keyEl = btn.querySelector('.tool-key');
      if (keyEl?.nextSibling) {
        btn.insertBefore(frameEl, keyEl.nextSibling);
      } else {
        btn.insertBefore(frameEl, btn.firstChild);
      }
    }

    btn.classList.add('has-sprite');
    const spriteKey = MODULE_SPRITE_KEYS[module];
    const frame = spriteAtlas.getFrame(spriteKey);
    const image = spriteAtlas.image;
    if (!spriteAtlas.ready || !image || !frame) {
      applyModulePaletteFallback(btn, spriteEl, module);
      return;
    }

    const scale = Math.min(MODULE_PALETTE_ICON_MAX_W / frame.w, MODULE_PALETTE_ICON_MAX_H / frame.h);
    const iconW = Math.max(1, Math.round(frame.w * scale));
    const iconH = Math.max(1, Math.round(frame.h * scale));
    btn.classList.remove('sprite-missing');
    btn.classList.remove('sprite-fallback');
    spriteEl.textContent = '';
    spriteEl.style.width = `${iconW}px`;
    spriteEl.style.height = `${iconH}px`;
    spriteEl.style.backgroundImage = `url("${image.src}")`;
    spriteEl.style.backgroundSize = `${Math.round(image.naturalWidth * scale)}px ${Math.round(image.naturalHeight * scale)}px`;
    spriteEl.style.backgroundPosition = `${Math.round(-frame.x * scale)}px ${Math.round(-frame.y * scale)}px`;
  });
}

function toolPaletteSection(tool: BuildTool): PaletteSection {
  if (tool.kind === 'copy-room' || tool.kind === 'paste-room') return 'structure';
  if (tool.kind === 'room') return 'rooms';
  if (tool.kind === 'module') return 'modules';
  if (tool.kind === 'zone') return 'overlays';
  return 'structure';
}

function toolPaletteKey(tool: BuildTool): string {
  if (tool.kind === 'tile') return `tile:${tool.tile}`;
  if (tool.kind === 'room') return `room:${tool.room}`;
  if (tool.kind === 'copy-room') return 'copy-room';
  if (tool.kind === 'paste-room') return 'paste-room';
  if (tool.kind === 'module') return `module:${tool.module}`;
  if (tool.kind === 'zone') return `zone:${tool.zone}`;
  if (tool.kind === 'cancel-construction') return 'cancel-construction';
  return 'none';
}

function setPaletteSection(section: PaletteSection): void {
  activePaletteSection = section;
  document.querySelectorAll<HTMLButtonElement>('.palette-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.paletteTarget === section);
  });
  document.querySelectorAll<HTMLElement>('#toolbar .palette-section').forEach((row) => {
    row.classList.toggle('active', row.dataset.paletteSection === section);
  });
}

function refreshPaletteMenu(): void {
  const key = toolPaletteKey(currentTool);
  if (key !== lastPaletteToolKey) {
    lastPaletteToolKey = key;
    setPaletteSection(toolPaletteSection(currentTool));
  }
}

function wirePaletteMenu(): void {
  document.querySelectorAll<HTMLButtonElement>('.palette-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.paletteTarget as PaletteSection | undefined;
      if (section) setPaletteSection(section);
    });
  });
  setPaletteSection(activePaletteSection);
}

function wireToolbar(): void {
  document.querySelectorAll<HTMLButtonElement>('#toolbar .tool-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tileKey = btn.dataset.toolTile;
      const zoneKey = btn.dataset.toolZone;
      const roomKey = btn.dataset.toolRoom;
      const roomCopyKey = btn.dataset.toolRoomCopy;
      const roomPasteKey = btn.dataset.toolRoomPaste;
      const moduleKey = btn.dataset.toolModule;
      const rotateKey = btn.dataset.toolRotate;
      const deselectKey = btn.dataset.toolDeselect;
      const cancelConstructionKey = btn.dataset.toolCancelConstruction;
      if (tileKey) {
        const tile = TOOLBAR_TILE_MAP[tileKey];
        if (tile !== undefined) {
          currentTool = { kind: 'tile', tile };
          toolLockMessage = '';
        }
      } else if (zoneKey) {
        const zone = TOOLBAR_ZONE_MAP[zoneKey];
        if (zone !== undefined) {
          currentTool = { kind: 'zone', zone };
          toolLockMessage = '';
        }
      } else if (roomKey) {
        const room = TOOLBAR_ROOM_MAP[roomKey];
        if (room !== undefined) selectRoomTool(room);
      } else if (roomCopyKey) {
        selectRoomCopyTool();
      } else if (roomPasteKey) {
        selectRoomPasteTool();
      } else if (moduleKey) {
        const module = TOOLBAR_MODULE_MAP[moduleKey];
        if (module !== undefined) selectModuleTool(module);
      } else if (cancelConstructionKey) {
        currentTool = { kind: 'cancel-construction' };
        toolLockMessage = '';
      } else if (btn.dataset.toolClearroom) {
        // Hotkey '0' equivalent — clears the paint onto a tile (room: None).
        selectRoomTool(RoomType.None);
      } else if (rotateKey) {
        // Toggle between 0 and 90, mirrors [ / ] hotkey behavior.
        state.controls.moduleRotation = state.controls.moduleRotation === 0 ? 90 : 0;
      } else if (deselectKey) {
        currentTool = { kind: 'none' };
        toolLockMessage = '';
      }
    });
  });
}
function refreshToolbar(): void {
  refreshPaletteMenu();
  const toolKind = currentTool.kind;
  document.querySelectorAll<HTMLButtonElement>('#toolbar .tool-btn').forEach((btn) => {
    const tileKey = btn.dataset.toolTile;
    const zoneKey = btn.dataset.toolZone;
    const roomKey = btn.dataset.toolRoom;
    const roomCopyKey = btn.dataset.toolRoomCopy;
    const roomPasteKey = btn.dataset.toolRoomPaste;
    const moduleKey = btn.dataset.toolModule;
    const diagnosticOverlayKey = btn.dataset.diagnosticOverlay;
    const cancelConstructionKey = btn.dataset.toolCancelConstruction;
    let active = false;
    let locked = false;
    let lockedTitle = '';
    if (tileKey && toolKind === 'tile') {
      active = TOOLBAR_TILE_MAP[tileKey] === currentTool.tile;
    } else if (zoneKey && toolKind === 'zone') {
      const z = TOOLBAR_ZONE_MAP[zoneKey];
      active = z !== undefined && z === currentTool.zone;
    } else if (isDiagnosticOverlay(diagnosticOverlayKey)) {
      active = state.controls.diagnosticOverlay === diagnosticOverlayKey;
    } else if (cancelConstructionKey) {
      active = toolKind === 'cancel-construction';
    } else if (btn.dataset.toolClearroom) {
      active = toolKind === 'room' && currentTool.room === RoomType.None;
    } else if (roomCopyKey) {
      active = toolKind === 'copy-room';
    } else if (roomPasteKey) {
      active = toolKind === 'paste-room';
      if (!roomClipboard) {
        locked = true;
        lockedTitle = 'Copy a station stamp first.';
      } else {
        btn.title = `Paste ${roomClipboard.label} — tiles, room settings, zones, docks, and fresh furniture`;
      }
    } else if (roomKey) {
      const room = TOOLBAR_ROOM_MAP[roomKey];
      if (room !== undefined) {
        if (toolKind === 'room' && currentTool.room === room) active = true;
        if (!isRoomUnlocked(state, room)) {
          locked = true;
          lockedTitle = roomLockedMessage(room);
        }
      }
    } else if (moduleKey) {
      const module = TOOLBAR_MODULE_MAP[moduleKey];
      if (module !== undefined && module !== ModuleType.None) {
        if (toolKind === 'module' && currentTool.module === module) active = true;
        if (!isModuleUnlocked(state, module)) {
          locked = true;
          lockedTitle = moduleLockedMessage(module);
        }
      } else if (module === ModuleType.None) {
        // Clear-module button is always available + active when currentTool is module:None
        if (toolKind === 'module' && currentTool.module === ModuleType.None) active = true;
      }
    }
    btn.classList.toggle('active', active);
    btn.classList.toggle('locked', locked);
    if (locked && lockedTitle) btn.title = lockedTitle;
  });
}
wirePaletteMenu();
wireToolbar();

refreshUnlockLegendAndHotkeys();
refreshProgressionModal();
refreshToolbar();

function maxScrollX(): number {
  return Math.max(0, gameWrap.scrollWidth - gameWrap.clientWidth);
}

function maxScrollY(): number {
  return Math.max(0, gameWrap.scrollHeight - gameWrap.clientHeight);
}

function clampViewportScroll(): void {
  gameWrap.scrollLeft = clamp(gameWrap.scrollLeft, 0, maxScrollX());
  gameWrap.scrollTop = clamp(gameWrap.scrollTop, 0, maxScrollY());
}

function updateStageLayout(): void {
  const mapDisplayWidth = state.width * TILE_SIZE * zoom;
  const mapDisplayHeight = state.height * TILE_SIZE * zoom;
  const padX = Math.max(PAN_PADDING_MIN, Math.round(gameWrap.clientWidth * 1.4));
  const padY = Math.max(PAN_PADDING_MIN, Math.round(gameWrap.clientHeight * 1.4));
  mapOffsetX = padX;
  mapOffsetY = padY;
  gameStage.style.width = `${Math.round(mapDisplayWidth + padX * 2)}px`;
  gameStage.style.height = `${Math.round(mapDisplayHeight + padY * 2)}px`;
  syncViewportCanvasPosition();
}

function mapContentOffsetX(): number {
  return gameStage.offsetLeft + mapOffsetX;
}

function mapContentOffsetY(): number {
  return gameStage.offsetTop + mapOffsetY;
}

function syncViewportCanvasPosition(): void {
  canvas.style.left = `${Math.round(gameWrap.scrollLeft)}px`;
  canvas.style.top = `${Math.round(gameWrap.scrollTop)}px`;
}

function getViewportCenterWorldPx(): { x: number; y: number } {
  return {
    x: (gameWrap.scrollLeft + gameWrap.clientWidth * 0.5 - mapContentOffsetX()) / zoom,
    y: (gameWrap.scrollTop + gameWrap.clientHeight * 0.5 - mapContentOffsetY()) / zoom
  };
}

function getRenderViewport(): RenderViewport {
  const marginPx = 0;
  return {
    x: (gameWrap.scrollLeft - mapContentOffsetX()) / zoom - marginPx,
    y: (gameWrap.scrollTop - mapContentOffsetY()) / zoom - marginPx,
    width: gameWrap.clientWidth / zoom + marginPx * 2,
    height: gameWrap.clientHeight / zoom + marginPx * 2
  };
}

function prepareViewportRender(viewport: RenderViewport): void {
  const dpr = window.devicePixelRatio || 1;
  const targetWidth = Math.max(1, Math.ceil(gameWrap.clientWidth * dpr));
  const targetHeight = Math.max(1, Math.ceil(gameWrap.clientHeight * dpr));
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    canvas.style.width = `${Math.ceil(gameWrap.clientWidth)}px`;
    canvas.style.height = `${Math.ceil(gameWrap.clientHeight)}px`;
  }
  syncViewportCanvasPosition();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, -viewport.x * zoom * dpr, -viewport.y * zoom * dpr);
}

function centerViewportOnWorldPx(worldX: number, worldY: number): void {
  gameWrap.scrollLeft = mapContentOffsetX() + worldX * zoom - gameWrap.clientWidth * 0.5;
  gameWrap.scrollTop = mapContentOffsetY() + worldY * zoom - gameWrap.clientHeight * 0.5;
  clampViewportScroll();
}

function centerViewportOnMapCenter(): void {
  centerViewportOnWorldPx(state.width * TILE_SIZE * 0.5, state.height * TILE_SIZE * 0.5);
}

function getStationBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = state.width;
  let minY = state.height;
  let maxX = -1;
  let maxY = -1;

  for (let i = 0; i < state.tiles.length; i++) {
    if (state.tiles[i] === TileType.Space) continue;
    const tile = fromIndex(i, state.width);
    minX = Math.min(minX, tile.x);
    minY = Math.min(minY, tile.y);
    maxX = Math.max(maxX, tile.x);
    maxY = Math.max(maxY, tile.y);
  }

  if (maxX < minX || maxY < minY) {
    const core = fromIndex(state.core.centerTile, state.width);
    return { minX: core.x, minY: core.y, maxX: core.x, maxY: core.y };
  }

  return { minX, minY, maxX, maxY };
}

function fitStationToViewport(): void {
  const bounds = getStationBounds();
  const marginPx = FIT_STATION_MARGIN_TILES * TILE_SIZE;
  const stationWidthPx = Math.max(TILE_SIZE, (bounds.maxX - bounds.minX + 1) * TILE_SIZE);
  const stationHeightPx = Math.max(TILE_SIZE, (bounds.maxY - bounds.minY + 1) * TILE_SIZE);
  const fitZoom = Math.min(
    gameWrap.clientWidth / (stationWidthPx + marginPx * 2),
    gameWrap.clientHeight / (stationHeightPx + marginPx * 2)
  );
  zoom = clamp(fitZoom, FIT_MIN_ZOOM, FIT_STATION_MAX_ZOOM);
  applyCanvasSize();
  updateStageLayout();
  centerViewportOnWorldPx(
    (bounds.minX + bounds.maxX + 1) * TILE_SIZE * 0.5,
    (bounds.minY + bounds.maxY + 1) * TILE_SIZE * 0.5
  );
}

function setZoomAtViewportPoint(nextZoom: number, viewportX: number, viewportY: number): void {
  const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  if (Math.abs(clampedZoom - zoom) < 0.0001) return;
  const worldX = (gameWrap.scrollLeft + viewportX - mapContentOffsetX()) / zoom;
  const worldY = (gameWrap.scrollTop + viewportY - mapContentOffsetY()) / zoom;
  zoom = clampedZoom;
  applyCanvasSize();
  updateStageLayout();
  gameWrap.scrollLeft = mapContentOffsetX() + worldX * zoom - viewportX;
  gameWrap.scrollTop = mapContentOffsetY() + worldY * zoom - viewportY;
  clampViewportScroll();
}

function directionLabel(direction: CardinalDirection): string {
  return direction[0].toUpperCase() + direction.slice(1);
}

function expandedDirectionsText(): string {
  const expanded = (Object.keys(expansionButtons) as CardinalDirection[]).filter((dir) => state.mapExpansion.purchased[dir]);
  return expanded.length > 0 ? expanded.map(directionLabel).join(', ') : 'none';
}

function refreshExpansionUi(): void {
  const nextCost = getNextExpansionCost(state);
  expansionNextCostEl.textContent = `Next expansion cost: ${nextCost}c`;
  expansionStatusEl.textContent = `Directions expanded: ${expandedDirectionsText()}`;
  for (const direction of Object.keys(expansionButtons) as CardinalDirection[]) {
    const button = expansionButtons[direction];
    const available = canExpandDirection(state, direction);
    if (available) {
      button.textContent = `Expand ${directionLabel(direction)} (${nextCost}c)`;
      button.disabled = state.metrics.credits < nextCost;
    } else {
      button.textContent = `Expand ${directionLabel(direction)} (Purchased)`;
      button.disabled = true;
    }
  }
}
refreshExpansionUi();

requestAnimationFrame(() => {
  fitStationToViewport();
});

cameraResetBtn.addEventListener('click', () => {
  fitStationToViewport();
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sortSavesForUi(saves: LocalSaveRecord[]): LocalSaveRecord[] {
  return [...saves].sort((a, b) => {
    if (a.id === QUICKSAVE_ID && b.id !== QUICKSAVE_ID) return -1;
    if (a.id !== QUICKSAVE_ID && b.id === QUICKSAVE_ID) return 1;
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}

function setSaveStatus(message: string, tone: 'ok' | 'warn' | 'error' | 'muted' = 'muted'): void {
  saveStatusEl.textContent = message;
  saveStatusEl.classList.remove('status-ok', 'status-warn', 'status-error', 'status-muted');
  saveStatusEl.classList.add(
    tone === 'ok' ? 'status-ok' : tone === 'warn' ? 'status-warn' : tone === 'error' ? 'status-error' : 'status-muted'
  );
}

function readSaveStore(): { store: SaveStore; warnings: string[] } {
  const warnings: string[] = [];
  const fallback: SaveStore = {
    storeVersion: 1,
    saves: []
  };
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SAVE_STORE_KEY);
  } catch {
    warnings.push('Unable to read localStorage. Save slots are unavailable.');
    return { store: fallback, warnings };
  }
  if (!raw) return { store: fallback, warnings };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    warnings.push('Save storage was corrupted and has been reset.');
    return { store: fallback, warnings };
  }
  if (!isRecord(parsed) || parsed.storeVersion !== 1 || !Array.isArray(parsed.saves)) {
    warnings.push('Save storage format was invalid and has been reset.');
    return { store: fallback, warnings };
  }

  const saves: LocalSaveRecord[] = [];
  for (const entry of parsed.saves) {
    if (!isRecord(entry)) continue;
    if (
      typeof entry.id !== 'string' ||
      typeof entry.name !== 'string' ||
      typeof entry.createdAt !== 'string' ||
      typeof entry.updatedAt !== 'string' ||
      typeof entry.payloadText !== 'string'
    ) {
      continue;
    }
    saves.push({
      id: entry.id,
      name: entry.name,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      payloadText: entry.payloadText
    });
  }
  return {
    store: {
      storeVersion: 1,
      saves
    },
    warnings
  };
}

function writeSaveStore(store: SaveStore): boolean {
  try {
    localStorage.setItem(SAVE_STORE_KEY, JSON.stringify(store));
    return true;
  } catch {
    setSaveStatus('Failed to write localStorage save data.', 'error');
    return false;
  }
}

function trimSaveStore(saves: LocalSaveRecord[]): { saves: LocalSaveRecord[]; removed: number } {
  if (saves.length <= MAX_SAVE_SLOTS) return { saves, removed: 0 };
  const quicksave = saves.find((save) => save.id === QUICKSAVE_ID) ?? null;
  const nonQuick = saves
    .filter((save) => save.id !== QUICKSAVE_ID)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const keepNonQuick = nonQuick.slice(0, Math.max(0, MAX_SAVE_SLOTS - (quicksave ? 1 : 0)));
  const trimmed = quicksave ? [quicksave, ...keepNonQuick] : keepNonQuick;
  return {
    saves: trimmed,
    removed: saves.length - trimmed.length
  };
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KB`;
  return `${(kib / 1024).toFixed(2)} MB`;
}

function toDisplaySaveSummary(save: LocalSaveRecord): string {
  return [
    'Selected save is ready.',
    `Name: ${save.name}`,
    `Updated: ${new Date(save.updatedAt).toLocaleString()}`,
    `JSON size: ${formatByteSize(save.payloadText.length)}`,
    'Use Download JSON for the full export.'
  ].join('\n');
}

function getSelectedSave(store: SaveStore): LocalSaveRecord | null {
  const selectedId = saveSlotSelect.value;
  if (!selectedId) return null;
  return store.saves.find((save) => save.id === selectedId) ?? null;
}

function sanitizeSaveFilenamePart(value: string): string {
  const collapsed = value.trim().replace(/\s+/g, '-');
  const cleaned = collapsed.replace(/[^a-zA-Z0-9-_]+/g, '');
  return cleaned.replace(/-+/g, '-').replace(/^[-_]+|[-_]+$/g, '') || 'save';
}

function buildSaveDownloadFilename(save: LocalSaveRecord): string {
  const namePart = sanitizeSaveFilenamePart(save.name);
  const timestampPart = save.updatedAt.replace(/[:.]/g, '-');
  return `station-save-${namePart}-${timestampPart}.json`;
}

function refreshSaveUi(preferredSaveId?: string): void {
  const { store, warnings } = readSaveStore();
  const saves = sortSavesForUi(store.saves);
  saveSlotSelect.innerHTML = '';
  if (saves.length <= 0) {
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = 'No saves';
    saveSlotSelect.appendChild(emptyOpt);
    saveSlotSelect.disabled = true;
    saveLoadBtn.disabled = true;
    saveDeleteBtn.disabled = true;
    saveDownloadBtn.disabled = true;
    saveExportTextarea.value = '';
    saveCountEl.textContent = '0';
  } else {
    saveSlotSelect.disabled = false;
    for (const save of saves) {
      const opt = document.createElement('option');
      opt.value = save.id;
      const prefix = save.id === QUICKSAVE_ID ? '[Quick] ' : '';
      const stamp = new Date(save.updatedAt).toLocaleString();
      opt.textContent = `${prefix}${save.name} (${stamp})`;
      saveSlotSelect.appendChild(opt);
    }
    if (preferredSaveId && saves.some((save) => save.id === preferredSaveId)) {
      saveSlotSelect.value = preferredSaveId;
    } else if (!saves.some((save) => save.id === saveSlotSelect.value)) {
      saveSlotSelect.value = saves[0].id;
    }
    saveLoadBtn.disabled = false;
    saveDeleteBtn.disabled = false;
    saveDownloadBtn.disabled = false;
    saveCountEl.textContent = String(saves.length);
    const selected = getSelectedSave({ storeVersion: 1, saves });
    saveExportTextarea.value = selected ? toDisplaySaveSummary(selected) : '';
  }
  if (warnings.length > 0) {
    setSaveStatus(warnings.join(' '), 'warn');
  } else if (saves.length <= 0) {
    setSaveStatus('No saves yet.', 'muted');
  }
}

function syncControlsToUiFromState(): void {
  shipsInput.value = String(clamp(state.controls.shipsPerCycle, 0, 3));
  shipsLabel.textContent = String(clamp(state.controls.shipsPerCycle, 0, 3));
  const taxPercent = Math.round(clamp(state.controls.taxRate, 0, 0.5) * 100);
  taxInput.value = String(taxPercent);
  taxLabel.textContent = `${taxPercent}%`;
  crewPriorityPresetSelect.value = state.controls.crewPriorityPreset;
  refreshPriorityUi();
  refreshTransportUi();
}

function clearUiSelectionsAfterLoad(): void {
  selectedDockId = null;
  selectedRoomTile = null;
  selectedAgent = null;
  hoveredTile = null;
  isPainting = false;
  paintStart = null;
  paintCurrent = null;
  toolLockMessage = '';
  marketModal.classList.add('hidden');
  expansionModal.classList.add('hidden');
  progressionModal.classList.add('hidden');
  priorityModal.classList.add('hidden');
  dockModal.classList.add('hidden');
  roomModal.classList.add('hidden');
  agentModal.classList.add('hidden');
  agentSidePanel.classList.add('hidden');
  saveModal.classList.add('hidden');
}
refreshSaveUi();

function canEnableSize(size: ShipSize, maxSize: ShipSize): boolean {
  if (maxSize === 'small') return size === 'small';
  if (maxSize === 'medium') return size !== 'large';
  return true;
}

function refreshDockModal(): void {
  if (selectedDockId === null) return;
  const dock = state.docks.find((d) => d.id === selectedDockId);
  if (!dock) return;
  dockModalIdEl.textContent = `#${dock.id}`;
  dockModalAreaEl.textContent = `${dock.area} tiles`;
  dockModalMaxSizeEl.textContent = dock.maxSizeByArea;
  dockModalPurposeSelect.value = dock.purpose;
  dockModalPurposeLabelEl.textContent = dock.purpose === 'visitor' ? 'Visitor' : 'Residential';
  dockModalFacingSelect.value = dock.facing;
  dockModalFacingLabelEl.textContent = dock.facing[0].toUpperCase() + dock.facing.slice(1);
  dockModalErrorEl.textContent = 'Facing status: ok';
  dockModalErrorEl.style.color = '#6edb8f';
  dockModalTouristCheckbox.checked = dock.allowedShipTypes.includes('tourist');
  dockModalTraderCheckbox.checked = dock.allowedShipTypes.includes('trader');
  dockModalIndustrialCheckbox.checked = dock.allowedShipTypes.includes('industrial');
  dockModalMilitaryCheckbox.checked = dock.allowedShipTypes.includes('military');
  dockModalColonistCheckbox.checked = dock.allowedShipTypes.includes('colonist');
  dockModalIndustrialCheckbox.disabled = !isShipTypeUnlocked(state, 'industrial');
  dockModalMilitaryCheckbox.disabled = !isShipTypeUnlocked(state, 'military');
  dockModalColonistCheckbox.disabled = !isShipTypeUnlocked(state, 'colonist');
  dockModalSmallCheckbox.checked = dock.allowedShipSizes.includes('small');
  dockModalMediumCheckbox.checked = dock.allowedShipSizes.includes('medium');
  dockModalLargeCheckbox.checked = dock.allowedShipSizes.includes('large');
  dockModalSmallCheckbox.disabled = !canEnableSize('small', dock.maxSizeByArea);
  dockModalMediumCheckbox.disabled = !canEnableSize('medium', dock.maxSizeByArea);
  dockModalLargeCheckbox.disabled = !canEnableSize('large', dock.maxSizeByArea);
  if (!isShipTypeUnlocked(state, 'industrial')) {
    dockModalErrorEl.textContent = `Facing status: ok | Industrial locked until Tier ${ROOM_UNLOCK_TIER[RoomType.Workshop]}`;
    dockModalErrorEl.style.color = '#ffcf6e';
  }
  if (!isShipTypeUnlocked(state, 'military') || !isShipTypeUnlocked(state, 'colonist')) {
    dockModalErrorEl.textContent = 'Facing status: ok | Military/Colonist unlock at Tier 3';
    dockModalErrorEl.style.color = '#ffcf6e';
  }
}

function refreshRoomModal(): void {
  if (selectedRoomTile === null) return;
  const inspector = getRoomInspectorAt(state, selectedRoomTile);
  if (!inspector) {
    roomModal.classList.add('hidden');
    selectedRoomTile = null;
    return;
  }
  roomModalTypeEl.textContent = inspector.room;
  roomModalStatusEl.textContent = inspector.active ? 'active' : 'inactive';
  roomModalStatusEl.style.color = inspector.active ? '#6edb8f' : '#ff7676';
  roomModalClusterEl.textContent = `${inspector.clusterSize} tiles (min ${inspector.minTilesRequired}, ${inspector.minTilesMet ? 'ok' : 'missing'})`;
  roomModalDoorsEl.textContent = String(inspector.doorCount);
  roomModalPressureEl.textContent = `${inspector.pressurizedPct.toFixed(0)}%`;
  roomModalStaffEl.textContent = `${inspector.staffCount}/${inspector.requiredStaff}`;
  const moduleProgressText = inspector.moduleProgress.length > 0
    ? inspector.moduleProgress.map((p) => `${p.module} ${p.have}/${p.need}`).join(' | ')
    : 'none';
  const anyOfText = inspector.anyOfProgress.modules.length > 0
    ? ` | any-of ${inspector.anyOfProgress.modules.join(' or ')} (${inspector.anyOfProgress.satisfied ? 'ok' : 'missing'})`
    : '';
  roomModalNodesEl.textContent =
    `service ${inspector.serviceNodeCount}${inspector.hasServiceNode ? '' : ' (missing)'} | ` +
    `reachable ${inspector.reachableServiceNodeCount} | unreachable ${inspector.unreachableServiceNodeCount} | ` +
    `modules ${moduleProgressText}${anyOfText}`;
  if (inspector.inventory) {
    const itemOrder: Array<{ key: 'rawMeal' | 'meal' | 'rawMaterial' | 'tradeGood' | 'body'; label: string }> = [
      { key: 'rawMeal', label: 'rawMeal' },
      { key: 'meal', label: 'meal' },
      { key: 'rawMaterial', label: 'rawMaterial' },
      { key: 'tradeGood', label: 'tradeGood' },
      { key: 'body', label: 'body' }
    ];
    const itemText = itemOrder
      .map(({ key, label }) => ({ label, value: inspector.inventory!.byItem[key] ?? 0 }))
      .filter((entry) => entry.value > 0.01)
      .map((entry) => `${entry.label} ${entry.value.toFixed(1)}`)
      .join(' | ');
    roomModalInventoryEl.textContent =
      `Inventory: ${inspector.inventory.used.toFixed(1)}/${inspector.inventory.capacity.toFixed(1)} ` +
      `(${inspector.inventory.fillPct.toFixed(0)}%) | nodes ${inspector.inventory.nodeCount}` +
      (itemText ? ` | ${itemText}` : '');
    roomModalInventoryEl.style.color = inspector.inventory.fillPct > 90 ? '#ffcf6e' : '#8ea2bd';
  } else {
    roomModalInventoryEl.textContent = 'Inventory: n/a';
    roomModalInventoryEl.style.color = '#8ea2bd';
  }
  const providerText = inspector.providers && inspector.providers.length > 0
    ? inspector.providers
        .slice(0, 5)
        .map((provider) => `${provider.kind} ${provider.status} ${provider.users}/${provider.reserved}/${provider.capacity}${provider.blockedReason ? ` ${provider.blockedReason}` : ''}`)
        .join(' | ')
    : 'none';
  const stockTargetText = inspector.stockTargets && inspector.stockTargets.length > 0
    ? inspector.stockTargets
        .slice(0, 4)
        .map((target) => `${target.itemType} ${target.current.toFixed(1)}+${target.incoming.toFixed(1)}/${target.desired}`)
        .join(' | ')
    : 'none';
  const openJobsText = inspector.openJobs && inspector.openJobs.length > 0 ? inspector.openJobs.join(' | ') : 'none';
  roomModalFlowEl.textContent =
    `Flow: ${inspector.flowHints?.join(' | ') || 'n/a'} | Providers: ${providerText} | Stock: ${stockTargetText} | Jobs: ${openJobsText}`;
  if (inspector.routePressure && inspector.routePressure.pressuredTiles > 0) {
    const routeReasons = inspector.routePressure.reasons.length > 0
      ? ` | ${inspector.routePressure.reasons.join(' | ')}`
      : '';
    roomModalFlowEl.textContent +=
      ` | Routes: pressure ${inspector.routePressure.pressuredTiles} tiles | conflicts ${inspector.routePressure.conflictTiles} | max ${inspector.routePressure.maxPressure}${routeReasons}`;
  }
  roomModalFlowEl.style.color =
    inspector.routePressure && inspector.routePressure.conflictTiles > 0 ? '#ffcf6e' : '#8ea2bd';
  if (inspector.room === 'cafeteria' && inspector.cafeteriaLoad) {
    const load = inspector.cafeteriaLoad;
    roomModalCapacityEl.textContent =
      `Capacity: tables ${load.tableNodes} | queue nodes ${load.queueNodes} | waiting ${load.queueingVisitors} | eating ${load.eatingVisitors} | high-patience wait ${load.highPatienceWaiting} | pressure ${load.pressure}`;
    roomModalCapacityEl.style.color =
      load.pressure === 'high' ? '#ff7676' : load.pressure === 'medium' ? '#ffcf6e' : '#8ea2bd';
  } else {
    roomModalCapacityEl.textContent = 'Capacity: n/a';
    roomModalCapacityEl.style.color = '#8ea2bd';
  }
  const housingRoom = inspector.room === RoomType.Dorm || inspector.room === RoomType.Hygiene;
  if (housingRoom) {
    roomModalHousingPolicyEl.textContent = inspector.housingPolicy ?? 'crew';
    roomModalHousingSelect.disabled = false;
    roomModalHousingSelect.value = inspector.housingPolicy ?? 'crew';
    roomModalHousingSelect.style.display = 'block';
    const housing = getHousingInspectorAt(state, selectedRoomTile!);
    if (housing) {
      roomModalHousingEl.textContent =
        `Housing: beds ${housing.bedsAssigned}/${housing.bedsTotal} | hygiene targets ${housing.hygieneTargets} | ` +
        `${housing.validPrivateHousing ? 'valid private loop' : 'private loop incomplete'}`;
      roomModalHousingEl.style.color = housing.validPrivateHousing ? '#6edb8f' : '#ffcf6e';
    } else {
      roomModalHousingEl.textContent = 'Housing: n/a';
      roomModalHousingEl.style.color = '#8ea2bd';
    }
  } else {
    roomModalHousingPolicyEl.textContent = 'n/a';
    roomModalHousingSelect.disabled = true;
    roomModalHousingSelect.style.display = 'none';
    roomModalHousingEl.textContent = 'Housing: n/a';
    roomModalHousingEl.style.color = '#8ea2bd';
  }
  // Dock-migration v0: berth-specific info. Shows installed
  // capability tags + which ship types this berth can/cannot accept.
  if (inspector.room === RoomType.Berth) {
    const berth = getBerthInspectorAt(state, selectedRoomTile!);
    if (berth) {
      const caps = berth.capabilities.length > 0 ? berth.capabilities.join(', ') : 'none installed';
      const accepts = berth.acceptedShipTypes.length > 0 ? berth.acceptedShipTypes.join(', ') : 'none yet — install capability modules';
      const exposure = berth.spaceExposed ? 'open to space' : 'sealed inside - expose one edge to space';
      const rejects = berth.rejectedShipTypes
        .map((r) => `${r.shipType} (needs ${r.missing.join('+')})`)
        .join(' | ');
      const occ = berth.occupiedByShipId !== null ? ` | occupied by ship #${berth.occupiedByShipId}` : ' | empty';
      roomModalBerthEl.textContent =
        `Berth: size ${berth.size} (${berth.clusterTiles.length} tiles) | ${exposure}${occ} | capabilities: ${caps} | accepts: ${accepts}` +
        (rejects ? ` | rejects: ${rejects}` : '');
      roomModalBerthEl.style.color = berth.spaceExposed && berth.acceptedShipTypes.length > 0 ? '#6edb8f' : '#ffcf6e';
    } else {
      roomModalBerthEl.textContent = 'Berth: cluster too small or not detected';
      roomModalBerthEl.style.color = '#ff7676';
    }
  } else {
    roomModalBerthEl.textContent = 'Berth: n/a';
    roomModalBerthEl.style.color = '#8ea2bd';
  }
  roomModalReasonsEl.textContent = `Inactive reasons: ${inspector.reasons.join(', ') || 'none'}`;
  roomModalWarningsEl.textContent = `Warnings: ${inspector.warnings.join(', ') || 'none'}`;
  roomModalHintsEl.textContent = `Hints: ${inspector.hints.join(' | ') || 'none'}`;
}

function toTileCoords(clientX: number, clientY: number): { x: number; y: number } | null {
  const world = toWorldCoords(clientX, clientY);
  if (!world) return null;
  const x = Math.floor(world.x);
  const y = Math.floor(world.y);
  if (!inBounds(x, y, state.width, state.height)) return null;
  return { x, y };
}

function toWorldCoords(clientX: number, clientY: number): { x: number; y: number } | null {
  const rect = gameWrap.getBoundingClientRect();
  const viewportX = clientX - rect.left;
  const viewportY = clientY - rect.top;
  const worldPxX = (gameWrap.scrollLeft + viewportX - mapContentOffsetX()) / zoom;
  const worldPxY = (gameWrap.scrollTop + viewportY - mapContentOffsetY()) / zoom;
  const worldX = worldPxX / TILE_SIZE;
  const worldY = worldPxY / TILE_SIZE;
  const tileX = Math.floor(worldX);
  const tileY = Math.floor(worldY);
  if (!inBounds(tileX, tileY, state.width, state.height)) return null;
  return { x: worldX, y: worldY };
}

function formatTileLabel(tileIndex: number | null): string {
  if (tileIndex === null) return 'none';
  if (tileIndex < 0 || tileIndex >= state.tiles.length) return `unknown (#${tileIndex})`;
  const p = fromIndex(tileIndex, state.width);
  return `${p.x},${p.y} (#${tileIndex})`;
}

function pickInspectableAgent(worldX: number, worldY: number, clickedTile: number): SelectedAgent | null {
  const maxDistance = 0.85;
  const maxDistanceSq = maxDistance * maxDistance;
  let best: { candidate: SelectedAgent; distSq: number } | null = null;
  for (const visitor of state.visitors) {
    const dx = visitor.x - worldX;
    const dy = visitor.y - worldY;
    const distSq = dx * dx + dy * dy;
    if (distSq > maxDistanceSq) continue;
    if (!best || distSq < best.distSq) {
      best = { candidate: { kind: 'visitor', id: visitor.id }, distSq };
    }
  }
  for (const resident of state.residents) {
    const dx = resident.x - worldX;
    const dy = resident.y - worldY;
    const distSq = dx * dx + dy * dy;
    if (distSq > maxDistanceSq) continue;
    if (!best || distSq < best.distSq) {
      best = { candidate: { kind: 'resident', id: resident.id }, distSq };
    }
  }
  for (const crew of state.crewMembers) {
    const dx = crew.x - worldX;
    const dy = crew.y - worldY;
    const distSq = dx * dx + dy * dy;
    if (distSq > maxDistanceSq) continue;
    if (!best || distSq < best.distSq) {
      best = { candidate: { kind: 'crew', id: crew.id }, distSq };
    }
  }
  if (best) return best.candidate;
  const residentOnTile = state.residents.find((resident) => resident.tileIndex === clickedTile);
  if (residentOnTile) return { kind: 'resident', id: residentOnTile.id };
  const visitorOnTile = state.visitors.find((visitor) => visitor.tileIndex === clickedTile);
  if (visitorOnTile) return { kind: 'visitor', id: visitorOnTile.id };
  const crewOnTile = state.crewMembers.find((crew) => crew.tileIndex === clickedTile);
  if (crewOnTile) return { kind: 'crew', id: crewOnTile.id };
  return null;
}

function healthColor(healthState: 'healthy' | 'distressed' | 'critical'): string {
  if (healthState === 'critical') return '#ff7676';
  if (healthState === 'distressed') return '#ffcf6e';
  return '#6edb8f';
}

function refreshAgentModal(): boolean {
  if (!selectedAgent) return false;
  if (selectedAgent.kind === 'visitor') {
    const inspector = getVisitorInspectorById(state, selectedAgent.id);
    if (!inspector) return false;
    agentKindEl.textContent = 'visitor';
    agentIdEl.textContent = String(inspector.id);
    agentStateEl.textContent = inspector.state;
    agentActionEl.textContent = inspector.currentAction;
    agentReasonEl.textContent = `Reason: ${inspector.actionReason}`;
    agentDesireEl.textContent = inspector.desire;
    agentTargetEl.textContent = formatTileLabel(inspector.targetTile);
    agentPathEl.textContent = `${inspector.pathLength} steps`;
    agentHealthEl.textContent = inspector.healthState;
    agentHealthEl.style.color = healthColor(inspector.healthState);
    agentBlockedEl.textContent = String(inspector.blockedTicks);
    agentVisitorDetailsEl.textContent =
      `Visitor: ${inspector.archetype} | pref ${inspector.primaryPreference} | ` +
      `patience ${inspector.patience.toFixed(1)} | served ${inspector.servedMeal ? 'yes' : 'no'} | carrying ${inspector.carryingMeal ? 'yes' : 'no'} | ` +
      `serving ${formatTileLabel(inspector.reservedServingTile)} | table ${formatTileLabel(inspector.reservedTargetTile)}`;
    agentResidentDetailsEl.textContent = 'Resident: n/a';
    agentCrewDetailsEl.textContent = 'Crew: n/a';
    return true;
  }

  if (selectedAgent.kind === 'crew') {
    const inspector = getCrewInspectorById(state, selectedAgent.id);
    if (!inspector) return false;
    agentKindEl.textContent = 'crew';
    agentIdEl.textContent = String(inspector.id);
    agentStateEl.textContent = inspector.state;
    agentActionEl.textContent = inspector.currentAction;
    agentReasonEl.textContent = `Reason: ${inspector.actionReason}`;
    agentDesireEl.textContent = inspector.desire;
    agentTargetEl.textContent = formatTileLabel(inspector.targetTile);
    agentPathEl.textContent = `${inspector.pathLength} steps`;
    agentHealthEl.textContent = inspector.healthState;
    agentHealthEl.style.color = healthColor(inspector.healthState);
    agentBlockedEl.textContent = String(inspector.blockedTicks);
    agentVisitorDetailsEl.textContent = 'Visitor: n/a';
    agentResidentDetailsEl.textContent = 'Resident: n/a';
    agentCrewDetailsEl.textContent =
      `Crew: role ${inspector.role} | action ${inspector.currentAction} | ` +
      `energy ${inspector.energy.toFixed(1)} | hygiene ${inspector.hygiene.toFixed(1)} | resting ${inspector.resting ? 'yes' : 'no'} | ` +
      `cleaning ${inspector.cleaning ? 'yes' : 'no'} | leisure ${inspector.leisure ? 'yes' : 'no'} | job ${inspector.activeJobId ?? 'none'} | ` +
      `carrying ${inspector.carryingItemType ?? 'none'} ${inspector.carryingAmount.toFixed(1)} | idle ${inspector.idleReason}`;
    return true;
  }

  const inspector = getResidentInspectorById(state, selectedAgent.id);
  if (!inspector) return false;
  agentKindEl.textContent = 'resident';
  agentIdEl.textContent = String(inspector.id);
  agentStateEl.textContent = inspector.state;
  agentActionEl.textContent = inspector.currentAction;
  agentReasonEl.textContent = `Reason: ${inspector.actionReason}`;
  agentDesireEl.textContent = inspector.desire;
  agentTargetEl.textContent = formatTileLabel(inspector.targetTile);
  agentPathEl.textContent = `${inspector.pathLength} steps`;
  agentHealthEl.textContent = inspector.healthState;
  agentHealthEl.style.color = healthColor(inspector.healthState);
  agentBlockedEl.textContent = String(inspector.blockedTicks);
  agentVisitorDetailsEl.textContent = 'Visitor: n/a';
  agentResidentDetailsEl.textContent =
    `Resident: hunger ${inspector.hunger.toFixed(1)} | energy ${inspector.energy.toFixed(1)} | hygiene ${inspector.hygiene.toFixed(1)} | ` +
    `social ${inspector.social.toFixed(1)} | safety ${inspector.safety.toFixed(1)} | routine ${inspector.routinePhase} | role ${inspector.role} | ` +
    `stress ${inspector.stress.toFixed(1)} | agi ${inspector.agitation.toFixed(1)} | confront ${inspector.inConfrontation ? 'yes' : 'no'} | ` +
    `satisfaction ${inspector.satisfaction.toFixed(1)} | leave ${inspector.leaveIntent.toFixed(1)} | ` +
    `dominant ${inspector.dominantNeed} | home dock ${inspector.homeDockId ?? 'none'} | bed ${inspector.bedModuleId ?? 'none'}`;
  agentCrewDetailsEl.textContent = 'Crew: n/a';
  return true;
}

function isTextInputTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return el.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function roomStampLabel(stamp: RoomClipboard): string {
  const rooms = Array.from(new Set(stamp.cells.map((cell) => cell.room).filter((room) => room !== RoomType.None)));
  const builtCells = stamp.cells.filter((cell) => cell.tile !== TileType.Space).length;
  const roomText = rooms.length === 0
    ? `${builtCells} tiles`
    : rooms.length === 1
      ? friendlyName(rooms[0])
      : `${rooms.length} rooms`;
  const moduleText = stamp.modules.length === 1 ? '1 module' : `${stamp.modules.length} modules`;
  const dockText = stamp.docks.length > 0 ? `, ${stamp.docks.length} dock config${stamp.docks.length === 1 ? '' : 's'}` : '';
  return `${roomText} ${stamp.width}x${stamp.height} + ${moduleText}${dockText}`;
}

function copyRoomStamp(minX: number, minY: number, maxX: number, maxY: number): void {
  const cells: RoomStampCell[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const idx = toIndex(x, y, state.width);
      cells.push({
        dx: x - minX,
        dy: y - minY,
        tile: state.tiles[idx],
        room: state.rooms[idx],
        zone: state.zones[idx],
        housingPolicy: state.roomHousingPolicies[idx]
      });
    }
  }

  const modules: RoomStampModule[] = [];
  for (const module of state.moduleInstances) {
    const origin = fromIndex(module.originTile, state.width);
    if (origin.x < minX || origin.x > maxX || origin.y < minY || origin.y > maxY) continue;
    modules.push({
      dx: origin.x - minX,
      dy: origin.y - minY,
      type: module.type,
      rotation: module.rotation,
      tileOffsets: module.tiles.map((tile) => {
        const pos = fromIndex(tile, state.width);
        return { dx: pos.x - minX, dy: pos.y - minY };
      })
    });
  }

  const docks: RoomStampDock[] = [];
  for (const dock of state.docks) {
    const anchor = fromIndex(dock.anchorTile, state.width);
    if (anchor.x < minX || anchor.x > maxX || anchor.y < minY || anchor.y > maxY) continue;
    docks.push({
      dx: anchor.x - minX,
      dy: anchor.y - minY,
      purpose: dock.purpose,
      facing: dock.facing,
      allowedShipTypes: [...dock.allowedShipTypes],
      allowedShipSizes: [...dock.allowedShipSizes]
    });
  }

  if (cells.every((cell) => cell.tile === TileType.Space) && modules.length === 0) {
    toolLockMessage = 'Nothing to copy here.';
    return;
  }

  const stamp: RoomClipboard = {
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    cells,
    modules,
    docks,
    label: ''
  };
  stamp.label = roomStampLabel(stamp);
  roomClipboard = stamp;
  currentTool = { kind: 'paste-room', pasteStamp: stamp };
  lastPaletteToolKey = '';
  refreshToolbar();
  toolLockMessage = `Copied ${stamp.label}. Click a target tile to paste.`;
}

function pasteRoomStampAt(originX: number, originY: number): void {
  if (!roomClipboard) {
    toolLockMessage = 'Copy a station stamp first.';
    return;
  }

  const allShipTypes: ShipType[] = ['tourist', 'trader', 'industrial', 'military', 'colonist'];
  const allShipSizes: ShipSize[] = ['small', 'medium', 'large'];
  const core = fromIndex(state.core.serviceTile, state.width);
  const stampCells = [...roomClipboard.cells].sort((left, right) => {
    const leftX = originX + left.dx;
    const leftY = originY + left.dy;
    const rightX = originX + right.dx;
    const rightY = originY + right.dy;
    const leftDist = Math.abs(leftX - core.x) + Math.abs(leftY - core.y);
    const rightDist = Math.abs(rightX - core.x) + Math.abs(rightY - core.y);
    return leftDist - rightDist;
  });
  let builtTiles = 0;
  let paintedCells = 0;
  let placedModules = 0;
  let skippedCells = 0;
  let firstFailure = '';

  for (const cell of stampCells) {
    if (cell.tile === TileType.Space) continue;
    const x = originX + cell.dx;
    const y = originY + cell.dy;
    if (!inBounds(x, y, state.width, state.height)) {
      skippedCells++;
      continue;
    }
    const idx = toIndex(x, y, state.width);
    if (state.tiles[idx] === cell.tile) continue;
    removeModuleAtTile(state, idx);
    const changed = trySetTileWithCredits(state, idx, cell.tile);
    if (changed.ok) {
      builtTiles++;
      cancelConstructionAtTile(state, idx);
    } else {
      firstFailure ||= changed.reason;
      skippedCells++;
    }
  }

  for (const cell of stampCells) {
    if (cell.tile === TileType.Space) continue;
    const x = originX + cell.dx;
    const y = originY + cell.dy;
    if (!inBounds(x, y, state.width, state.height)) {
      skippedCells++;
      continue;
    }
    const idx = toIndex(x, y, state.width);
    if (state.tiles[idx] === TileType.Space) {
      skippedCells++;
      continue;
    }
    if (cell.room !== RoomType.None && !isRoomUnlocked(state, cell.room)) {
      firstFailure ||= roomLockedMessage(cell.room);
      skippedCells++;
      continue;
    }
    setRoom(state, idx, cell.room);
    setZone(state, idx, cell.zone);
    setRoomHousingPolicy(state, idx, cell.housingPolicy);
    paintedCells++;
  }

  for (const dockConfig of roomClipboard.docks) {
    const x = originX + dockConfig.dx;
    const y = originY + dockConfig.dy;
    if (!inBounds(x, y, state.width, state.height)) {
      firstFailure ||= 'dock config runs off map';
      continue;
    }
    const dock = getDockByTile(state, toIndex(x, y, state.width));
    if (!dock) {
      firstFailure ||= 'dock config had no pasted dock';
      continue;
    }
    setDockPurpose(state, dock.id, dockConfig.purpose);
    const facingResult = setDockFacing(state, dock.id, dockConfig.facing);
    if (!facingResult.ok) firstFailure ||= facingResult.reason ?? 'dock facing invalid';
    for (const shipType of allShipTypes) {
      setDockAllowedShipType(state, dock.id, shipType, dockConfig.allowedShipTypes.includes(shipType));
    }
    for (const shipSize of allShipSizes) {
      setDockAllowedShipSize(state, dock.id, shipSize, dockConfig.allowedShipSizes.includes(shipSize));
    }
  }

  for (const module of roomClipboard.modules) {
    if (module.type !== ModuleType.None && !isModuleUnlocked(state, module.type)) {
      firstFailure ||= moduleLockedMessage(module.type);
      continue;
    }
    const x = originX + module.dx;
    const y = originY + module.dy;
    if (!inBounds(x, y, state.width, state.height)) {
      firstFailure ||= 'stamp runs off map';
      continue;
    }
    for (const offset of module.tileOffsets) {
      const tileX = originX + offset.dx;
      const tileY = originY + offset.dy;
      if (inBounds(tileX, tileY, state.width, state.height)) {
        removeModuleAtTile(state, toIndex(tileX, tileY, state.width));
      }
    }
    const placed = tryPlaceModuleWithCredits(state, module.type, toIndex(x, y, state.width), module.rotation);
    if (placed.ok) {
      placedModules++;
    } else {
      firstFailure ||= placed.reason ?? 'module placement failed';
    }
  }

  const skippedText = skippedCells > 0 ? `, skipped ${skippedCells} cells` : '';
  const failureText = firstFailure ? ` (${firstFailure})` : '';
  toolLockMessage = `Pasted ${builtTiles} tiles, ${paintedCells} settings, and ${placedModules}/${roomClipboard.modules.length} modules${skippedText}${failureText}.`;
}

function applyRectPaint(a: { x: number; y: number }, b: { x: number; y: number }): void {
  if (currentTool.kind === 'room' && currentTool.room && currentTool.room !== RoomType.None && !isRoomUnlocked(state, currentTool.room)) {
    toolLockMessage = roomLockedMessage(currentTool.room);
    return;
  }
  if (currentTool.kind === 'module' && currentTool.module && currentTool.module !== ModuleType.None && !isModuleUnlocked(state, currentTool.module)) {
    toolLockMessage = moduleLockedMessage(currentTool.module);
    return;
  }
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);

  if (currentTool.kind === 'copy-room') {
    copyRoomStamp(minX, minY, maxX, maxY);
    return;
  }
  if (currentTool.kind === 'paste-room') {
    pasteRoomStampAt(minX, minY);
    return;
  }

  const paintTiles: number[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      paintTiles.push(toIndex(x, y, state.width));
    }
  }

  if (currentTool.kind === 'tile') {
    if (
      TRUSS_EXPANSION_EXPERIMENT &&
      currentTool.tile === TileType.Floor &&
      paintTiles.some((idx) => state.tiles[idx] === TileType.Truss)
    ) {
      const built = buildStationExpansionOnTruss(state, paintTiles);
      if (!built.ok) toolLockMessage = built.reason ?? 'cannot build station expansion';
      return;
    }

    const core = fromIndex(state.core.serviceTile, state.width);
    paintTiles.sort((left, right) => {
      const aTile = fromIndex(left, state.width);
      const bTile = fromIndex(right, state.width);
      const aDist = Math.abs(aTile.x - core.x) + Math.abs(aTile.y - core.y);
      const bDist = Math.abs(bTile.x - core.x) + Math.abs(bTile.y - core.y);
      return currentTool.tile === TileType.Space ? bDist - aDist : aDist - bDist;
    });
  }

  for (const idx of paintTiles) {
      if (currentTool.kind === 'tile') {
        const forceConstruction = TRUSS_EXPANSION_EXPERIMENT && currentTool.tile === TileType.Truss;
        if (INSTANT_BUILD_PLAYTEST && !forceConstruction) {
          const changed = trySetTileWithCredits(state, idx, currentTool.tile!);
          if (!changed.ok) {
            toolLockMessage = changed.reason;
            continue;
          }
          cancelConstructionAtTile(state, idx);
          if (currentTool.tile === TileType.Space) {
            setZone(state, idx, ZoneType.Public);
            setRoom(state, idx, RoomType.None);
          }
          continue;
        }
        const planned = planTileConstruction(state, idx, currentTool.tile!);
        if (!planned.ok) {
          toolLockMessage = planned.reason ?? '';
          continue;
        }
        if (currentTool.tile === TileType.Space) {
          setZone(state, idx, ZoneType.Public);
          setRoom(state, idx, RoomType.None);
        }
      } else if (currentTool.kind === 'zone') {
        if (state.tiles[idx] !== TileType.Space) {
          setZone(state, idx, currentTool.zone!);
        }
      } else if (currentTool.kind === 'room' && state.tiles[idx] !== TileType.Space) {
        setRoom(state, idx, currentTool.room!);
      } else if (currentTool.kind === 'module' && state.tiles[idx] !== TileType.Space) {
        if (currentTool.module === ModuleType.None) {
          removeModuleAtTile(state, idx);
        } else {
          if (INSTANT_BUILD_PLAYTEST) {
            cancelConstructionAtTile(state, idx);
            const placed = tryPlaceModuleWithCredits(state, currentTool.module!, idx, state.controls.moduleRotation);
            if (!placed.ok) toolLockMessage = placed.reason ?? '';
            continue;
          }
          const planned = planModuleConstruction(state, idx, currentTool.module!, state.controls.moduleRotation);
          if (!planned.ok) toolLockMessage = planned.reason ?? '';
        }
      } else if (currentTool.kind === 'cancel-construction') {
        cancelConstructionAtTile(state, idx);
      }
  }
}

function beginRightPan(e: MouseEvent): void {
  if (e.button !== 2) return;
  e.preventDefault();
  isRightPanning = true;
  panStartClientX = e.clientX;
  panStartClientY = e.clientY;
  panStartScrollLeft = gameWrap.scrollLeft;
  panStartScrollTop = gameWrap.scrollTop;
  gameWrap.classList.add('panning');
}

function updateRightPan(e: MouseEvent): void {
  if (!isRightPanning) return;
  e.preventDefault();
  const dx = e.clientX - panStartClientX;
  const dy = e.clientY - panStartClientY;
  gameWrap.scrollLeft = clamp(panStartScrollLeft - dx, 0, maxScrollX());
  gameWrap.scrollTop = clamp(panStartScrollTop - dy, 0, maxScrollY());
}

function endRightPan(): void {
  if (!isRightPanning) return;
  isRightPanning = false;
  gameWrap.classList.remove('panning');
}

gameWrap.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});
gameWrap.addEventListener('mousedown', beginRightPan);
window.addEventListener('mousemove', updateRightPan);

gameWrap.addEventListener(
  'wheel',
  (e) => {
    const rect = gameWrap.getBoundingClientRect();
    const viewportX = e.clientX - rect.left;
    const viewportY = e.clientY - rect.top;
    if (viewportX < 0 || viewportY < 0 || viewportX > rect.width || viewportY > rect.height) return;
    e.preventDefault();
    const zoomFactor = Math.exp(-e.deltaY * 0.0015);
    setZoomAtViewportPoint(zoom * zoomFactor, viewportX, viewportY);
  },
  { passive: false }
);

window.addEventListener('keydown', (e) => {
  if (isTextInputTarget(e.target)) return;
  const step = TILE_SIZE * 3;
  let nextLeft = gameWrap.scrollLeft;
  let nextTop = gameWrap.scrollTop;
  if (e.key === 'ArrowUp') {
    nextTop -= step;
  } else if (e.key === 'ArrowDown') {
    nextTop += step;
  } else if (e.key === 'ArrowLeft') {
    nextLeft -= step;
  } else if (e.key === 'ArrowRight') {
    nextLeft += step;
  } else {
    return;
  }
  e.preventDefault();
  gameWrap.scrollLeft = clamp(nextLeft, 0, maxScrollX());
  gameWrap.scrollTop = clamp(nextTop, 0, maxScrollY());
});

window.addEventListener('resize', () => {
  const center = getViewportCenterWorldPx();
  applyCanvasSize();
  updateStageLayout();
  centerViewportOnWorldPx(center.x, center.y);
});

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || isRightPanning) return;
  const tile = toTileCoords(e.clientX, e.clientY);
  if (!tile) return;
  isPainting = true;
  paintStart = tile;
  paintCurrent = tile;
});
canvas.addEventListener('mousemove', (e) => {
  if (isRightPanning) return;
  const tile = toTileCoords(e.clientX, e.clientY);
  hoveredTile = tile ? toIndex(tile.x, tile.y, state.width) : null;
  if (!isPainting) return;
  if (tile) paintCurrent = tile;
});
canvas.addEventListener('mouseleave', () => {
  if (!isRightPanning) hoveredTile = null;
});
canvas.addEventListener('mouseup', (e) => {
  if (isRightPanning) return;
  if (isPainting && paintStart && paintCurrent) {
    const canOpenInspectors = currentTool.kind === 'none';
    const singleClick = paintStart.x === paintCurrent.x && paintStart.y === paintCurrent.y;
    const clickedTile = singleClick ? toIndex(paintStart.x, paintStart.y, state.width) : null;
    if (singleClick && clickedTile !== null) {
      const world = toWorldCoords(e.clientX, e.clientY);
      if (world) {
        const agent = pickInspectableAgent(world.x, world.y, clickedTile);
        if (agent) {
          selectedAgent = agent;
          selectedDockId = null;
          selectedRoomTile = null;
          if (!refreshAgentSidePanel()) {
            selectedAgent = null;
          }
          agentModal.classList.add('hidden');
          dockModal.classList.add('hidden');
          roomModal.classList.add('hidden');
          isPainting = false;
          paintStart = null;
          paintCurrent = null;
          return;
        }
      }
    }

    if (canOpenInspectors && singleClick && clickedTile !== null) {
      const dock = getDockByTile(state, clickedTile);
      if (dock) {
        selectedDockId = dock.id;
        selectedRoomTile = null;
        selectedAgent = null;
        refreshDockModal();
        dockModal.classList.remove('hidden');
        roomModal.classList.add('hidden');
        agentModal.classList.add('hidden');
        isPainting = false;
        paintStart = null;
        paintCurrent = null;
        return;
      }

      if (state.rooms[clickedTile] !== RoomType.None) {
        selectedRoomTile = clickedTile;
        selectedDockId = null;
        selectedAgent = null;
        refreshRoomModal();
        roomModal.classList.remove('hidden');
        dockModal.classList.add('hidden');
        agentModal.classList.add('hidden');
        isPainting = false;
        paintStart = null;
        paintCurrent = null;
        return;
      }

      selectedAgent = null;
      selectedDockId = null;
      selectedRoomTile = null;
      agentModal.classList.add('hidden');
      agentSidePanel.classList.add('hidden');
      dockModal.classList.add('hidden');
      roomModal.classList.add('hidden');
    } else {
      selectedDockId = null;
      selectedRoomTile = null;
      selectedAgent = null;
      dockModal.classList.add('hidden');
      roomModal.classList.add('hidden');
      agentModal.classList.add('hidden');
      agentSidePanel.classList.add('hidden');
      applyRectPaint(paintStart, paintCurrent);
    }
  }
  isPainting = false;
  paintStart = null;
  paintCurrent = null;
});
window.addEventListener('mouseup', () => {
  endRightPan();
  if (isPainting && paintStart && paintCurrent) {
    applyRectPaint(paintStart, paintCurrent);
  }
  isPainting = false;
  paintStart = null;
  paintCurrent = null;
});
window.addEventListener('blur', () => {
  endRightPan();
});

window.addEventListener('keydown', (e) => {
  switch (e.key) {
    case '1':
      currentTool = { kind: 'tile', tile: TileType.Floor };
      toolLockMessage = '';
      break;
    case '2':
      currentTool = { kind: 'tile', tile: TileType.Wall };
      toolLockMessage = '';
      break;
    case '3':
      currentTool = { kind: 'tile', tile: TileType.Dock };
      toolLockMessage = '';
      break;
    case '4':
      currentTool = { kind: 'tile', tile: TileType.Door };
      toolLockMessage = '';
      break;
    case '7':
      currentTool = { kind: 'tile', tile: TileType.Space };
      toolLockMessage = '';
      break;
    case '0':
      selectRoomTool(RoomType.None);
      break;
    case 'x':
    case 'X':
      selectModuleTool(ModuleType.None);
      break;
    case '`':
      selectModuleTool(ModuleType.WallLight);
      break;
    case 'q':
    case 'Q':
      selectModuleTool(ModuleType.Bed);
      break;
    case 't':
    case 'T':
      selectModuleTool(ModuleType.Table);
      break;
    case 'v':
    case 'V':
      selectModuleTool(ModuleType.Stove);
      break;
    case 'p':
    case 'P':
      selectModuleTool(ModuleType.Workbench);
      break;
    case 'g':
    case 'G':
      selectModuleTool(ModuleType.GrowStation);
      break;
    case 'm':
    case 'M':
      selectModuleTool(ModuleType.Terminal);
      break;
    case '5':
      selectModuleTool(ModuleType.ServingStation);
      break;
    case '6':
      selectModuleTool(ModuleType.Couch);
      break;
    case '=':
      selectModuleTool(ModuleType.GameStation);
      break;
    case ';':
      selectModuleTool(ModuleType.Shower);
      break;
    case "'":
      selectModuleTool(ModuleType.Sink);
      break;
    case '-':
      selectModuleTool(ModuleType.MarketStall);
      break;
    case ',':
      selectModuleTool(ModuleType.IntakePallet);
      break;
    case '.':
      selectModuleTool(ModuleType.StorageRack);
      break;
    case 'z':
    case 'Z':
      selectModuleTool(ModuleType.MedBed);
      break;
    case '/':
      selectModuleTool(ModuleType.CellConsole);
      break;
    case '\\':
      selectModuleTool(ModuleType.RecUnit);
      break;
    case 'c':
    case 'C':
      selectRoomTool(RoomType.Cafeteria);
      break;
    case 'd':
    case 'D':
      selectRoomTool(RoomType.Dorm);
      break;
    case 'h':
    case 'H':
      selectRoomTool(RoomType.Hygiene);
      break;
    case 'i':
    case 'I':
      selectRoomTool(RoomType.Kitchen);
      break;
    case 'w':
    case 'W':
      selectRoomTool(RoomType.Workshop);
      break;
    case 'f':
    case 'F':
      selectRoomTool(RoomType.Hydroponics);
      break;
    case 'l':
    case 'L':
      selectRoomTool(RoomType.LifeSupport);
      break;
    case 'u':
    case 'U':
      selectRoomTool(RoomType.Lounge);
      break;
    case 'k':
    case 'K':
      selectRoomTool(RoomType.Market);
      break;
    case 'r':
    case 'R':
      selectRoomTool(RoomType.Reactor);
      break;
    case 's':
    case 'S':
      selectRoomTool(RoomType.Security);
      break;
    case 'n':
    case 'N':
      selectRoomTool(RoomType.LogisticsStock);
      break;
    case 'b':
    case 'B':
      selectRoomTool(RoomType.Storage);
      break;
    case 'y':
    case 'Y':
      selectRoomTool(RoomType.Clinic);
      break;
    case 'j':
    case 'J':
      selectRoomTool(RoomType.Brig);
      break;
    case 'a':
    case 'A':
      selectRoomTool(RoomType.RecHall);
      break;
    case 'e':
    case 'E':
      // Dock-migration v0: Berth room paint.
      selectRoomTool(RoomType.Berth);
      break;
    case '[':
      state.controls.moduleRotation = 0;
      break;
    case ']':
      state.controls.moduleRotation = 90;
      break;
    case 'o':
    case 'O':
      state.controls.showInventoryOverlay = !state.controls.showInventoryOverlay;
      syncToggleLabels();
      break;
    case 'F2':
      state.controls.spriteMode = state.controls.spriteMode === 'sprites' ? 'fallback' : 'sprites';
      if (state.controls.spriteMode === 'sprites' && !spriteAtlas.ready) {
        void loadSpriteAtlas(state.controls.spritePipeline).then((loaded) => {
          spriteAtlas = loaded;
          refreshModulePaletteSprites();
        });
      }
      syncToggleLabels();
      break;
    case 'F3':
      state.controls.showSpriteFallback = !state.controls.showSpriteFallback;
      syncToggleLabels();
      break;
    case 'F4':
      // System Map modal toggle. Y is taken by Clinic (and every other
      // letter is also bound), so the System Map screen rides the F-key
      // convention used by F2/F3 view toggles.
      e.preventDefault();
      if (systemMapModal.classList.contains('hidden')) {
        refreshSystemMapModal();
        systemMapModal.classList.remove('hidden');
      } else {
        systemMapModal.classList.add('hidden');
      }
      break;
    case '8':
      currentTool = { kind: 'zone', zone: ZoneType.Public };
      toolLockMessage = '';
      break;
    case '9':
      currentTool = { kind: 'zone', zone: ZoneType.Restricted };
      toolLockMessage = '';
      break;
    case ' ':
      state.controls.paused = !state.controls.paused;
      refreshTransportUi();
      break;
    case 'Escape':
      saveModal.classList.add('hidden');
      marketModal.classList.add('hidden');
      expansionModal.classList.add('hidden');
      progressionModal.classList.add('hidden');
      priorityModal.classList.add('hidden');
      dockModal.classList.add('hidden');
      roomModal.classList.add('hidden');
      systemMapModal.classList.add('hidden');
      currentTool = { kind: 'none' };
      toolLockMessage = '';
      isPainting = false;
      paintStart = null;
      paintCurrent = null;
      break;
    default:
      break;
  }
});

function handleExpandDirection(direction: CardinalDirection): void {
  const center = getViewportCenterWorldPx();
  const result = expandMap(state, direction);
  if (!result.ok) {
    marketNoteEl.textContent =
      result.reason === 'insufficient_credits'
        ? `Need ${result.cost} credits to expand ${direction}.`
        : `${directionLabel(direction)} edge already expanded.`;
    refreshExpansionUi();
    return;
  }
  const shiftX = direction === 'west' ? EXPANSION_STEP_TILES * TILE_SIZE : 0;
  const shiftY = direction === 'north' ? EXPANSION_STEP_TILES * TILE_SIZE : 0;
  applyCanvasSize();
  updateStageLayout();
  centerViewportOnWorldPx(center.x + shiftX, center.y + shiftY);
  hoveredTile = null;
  isPainting = false;
  paintStart = null;
  paintCurrent = null;
  marketNoteEl.textContent = `Expanded ${directionLabel(direction)} for ${result.cost}c (${result.width}x${result.height}).`;
  refreshExpansionUi();
}

shipsInput.addEventListener('input', () => {
  const nextRate = clamp(parseInt(shipsInput.value, 10), 0, 3);
  if (nextRate !== state.controls.shipsPerCycle) state.lastCycleTime = 0;
  state.controls.shipsPerCycle = nextRate;
  shipsLabel.textContent = String(state.controls.shipsPerCycle);
});

taxInput.addEventListener('input', () => {
  const pct = clamp(parseInt(taxInput.value, 10), 0, 50);
  state.controls.taxRate = pct / 100;
  taxLabel.textContent = `${pct}%`;
});

expandNorthBtn.addEventListener('click', () => handleExpandDirection('north'));
expandEastBtn.addEventListener('click', () => handleExpandDirection('east'));
expandSouthBtn.addEventListener('click', () => handleExpandDirection('south'));
expandWestBtn.addEventListener('click', () => handleExpandDirection('west'));

crewPriorityPresetSelect.addEventListener('change', () => {
  const preset = crewPriorityPresetSelect.value as CrewPriorityPreset;
  setCrewPriorityPreset(state, preset);
  const presetWeights = getCrewPriorityPresetWeights(preset);
  for (const system of prioritySystems) {
    state.controls.crewPriorityWeights[system] = presetWeights[system];
  }
  refreshPriorityUi();
});

playBtn.addEventListener('click', () => {
  state.controls.paused = false;
  refreshTransportUi();
});

pauseBtn.addEventListener('click', () => {
  state.controls.paused = true;
  refreshTransportUi();
});

speedUpBtn.addEventListener('click', () => {
  const currentIndex = simSpeeds.indexOf(state.controls.simSpeed as 1 | 2 | 4);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % simSpeeds.length : 0;
  state.controls.simSpeed = simSpeeds[nextIndex];
  state.controls.paused = false;
  refreshTransportUi();
});

// Button-label sync runs at click-time, not per-frame — these labels
// only change on click, and the frame() loop reassigning ~5 textContent
// props each tick was pure waste (~60Hz × 5 DOM writes).
function syncToggleLabels(): void {
  toggleZonesBtn.textContent = state.controls.showZones ? 'Zones: ON' : 'Zones: OFF';
  toggleServiceNodesBtn.textContent = state.controls.showServiceNodes ? 'Service Nodes: ON' : 'Service Nodes: OFF';
  toggleInventoryOverlayBtn.textContent = state.controls.showInventoryOverlay
    ? 'Inventory Overlay: ON'
    : 'Inventory Overlay: OFF';
  toggleGlowBtn.textContent = state.controls.showGlow ? 'Glow: ON' : 'Glow: OFF';
  toggleSpritesBtn.textContent = state.controls.spriteMode === 'sprites' ? 'Sprites: ON' : 'Sprites: OFF';
  toggleSpriteFallbackBtn.textContent = state.controls.showSpriteFallback
    ? 'Force Fallback: ON'
    : 'Force Fallback: OFF';
  for (const btn of diagnosticOverlayBtns) {
    const overlay = btn.dataset.diagnosticOverlay;
    if (!isDiagnosticOverlay(overlay)) continue;
    const active = state.controls.diagnosticOverlay === overlay;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
    const label = DIAGNOSTIC_OVERLAY_LABELS[overlay];
    btn.textContent =
      overlay === 'none'
        ? `Diagnostics: ${active ? 'OFF' : 'Off'}`
        : `${label}: ${active ? 'ON' : 'Off'}`;
  }
  refreshDiagnosticReadout();
  refreshDiagnosticKey();
}
syncToggleLabels();

toggleZonesBtn.addEventListener('click', () => {
  state.controls.showZones = !state.controls.showZones;
  syncToggleLabels();
});

toggleServiceNodesBtn.addEventListener('click', () => {
  state.controls.showServiceNodes = !state.controls.showServiceNodes;
  syncToggleLabels();
});

toggleInventoryOverlayBtn.addEventListener('click', () => {
  state.controls.showInventoryOverlay = !state.controls.showInventoryOverlay;
  syncToggleLabels();
});

toggleGlowBtn.addEventListener('click', () => {
  state.controls.showGlow = !state.controls.showGlow;
  syncToggleLabels();
});

for (const btn of diagnosticOverlayBtns) {
  btn.addEventListener('click', () => {
    const overlay = btn.dataset.diagnosticOverlay;
    if (!isDiagnosticOverlay(overlay)) return;
    state.controls.diagnosticOverlay = overlay;
    syncToggleLabels();
  });
}

toggleSpritesBtn.addEventListener('click', () => {
  state.controls.spriteMode = state.controls.spriteMode === 'sprites' ? 'fallback' : 'sprites';
  if (state.controls.spriteMode === 'sprites' && !spriteAtlas.ready) {
    void loadSpriteAtlas(state.controls.spritePipeline).then((loaded) => {
      spriteAtlas = loaded;
      refreshModulePaletteSprites();
    });
  }
  syncToggleLabels();
});

toggleSpriteFallbackBtn.addEventListener('click', () => {
  state.controls.showSpriteFallback = !state.controls.showSpriteFallback;
  syncToggleLabels();
});

// Pipeline toggle removed with the pixellab rip-out. Single-atlas runtime
// now. When a future gpt-image-1 alternate ships, the toggle + handler
// come back (type in src/sim/types.ts already accepts a union).

type ModalWiring = {
  modal: HTMLElement;
  openBtn?: HTMLButtonElement;
  closeBtn: HTMLButtonElement;
  beforeOpen?: () => void;
  beforeClose?: () => void;
};

function wireModal({ modal, openBtn, closeBtn, beforeOpen, beforeClose }: ModalWiring): void {
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      beforeOpen?.();
      modal.classList.remove('hidden');
    });
  }
  closeBtn.addEventListener('click', () => {
    beforeClose?.();
    modal.classList.add('hidden');
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      beforeClose?.();
      modal.classList.add('hidden');
    }
  });
}

for (const button of opsTabButtons) {
  button.addEventListener('click', () => {
    const tab = button.dataset.opsTab as OpsTab | undefined;
    if (!tab) return;
    setOpsTab(tab);
  });
}

function refreshSystemMapModal(): void {
  const sys = state.system;
  const ctx2d = systemMapCanvas.getContext('2d');
  if (!ctx2d) return;
  const W = systemMapCanvas.width;
  const H = systemMapCanvas.height;
  ctx2d.clearRect(0, 0, W, H);
  // Backdrop
  ctx2d.fillStyle = '#070b15';
  ctx2d.fillRect(0, 0, W, H);

  if (!sys) {
    systemMapSummaryEl.textContent = 'No system data available for this save.';
    systemMapFactionsEl.textContent = '';
    systemMapLanesEl.textContent = '';
    ctx2d.fillStyle = '#7a8294';
    ctx2d.font = '14px sans-serif';
    ctx2d.textAlign = 'center';
    ctx2d.fillText('No system map (legacy save)', W / 2, H / 2);
    return;
  }

  const cx = W / 2;
  const cy = H / 2;
  const maxR = Math.min(W, H) * 0.46;

  // Asteroid belts (rings, drawn first as a faint dotted band)
  ctx2d.save();
  for (const belt of sys.asteroidBelts) {
    const inner = belt.innerRadius * maxR;
    const outer = belt.outerRadius * maxR;
    ctx2d.fillStyle = belt.resourceType === 'metal'
      ? 'rgba(180, 180, 200, 0.10)'
      : belt.resourceType === 'ice'
      ? 'rgba(160, 220, 240, 0.10)'
      : 'rgba(220, 200, 160, 0.10)';
    ctx2d.beginPath();
    ctx2d.arc(cx, cy, outer, 0, Math.PI * 2);
    ctx2d.arc(cx, cy, inner, 0, Math.PI * 2, true);
    ctx2d.fill('evenodd');
    // Stipple
    ctx2d.fillStyle = 'rgba(220, 220, 230, 0.55)';
    const dotCount = 60;
    for (let i = 0; i < dotCount; i++) {
      const t = (i / dotCount) * Math.PI * 2 + (belt.id.length * 0.13);
      const r = inner + ((i * 37) % 100) / 100 * (outer - inner);
      const x = cx + Math.cos(t) * r;
      const y = cy + Math.sin(t) * r;
      ctx2d.fillRect(x, y, 1.2, 1.2);
    }
  }
  ctx2d.restore();

  // Faint orbit guide rings for planets
  ctx2d.strokeStyle = 'rgba(120, 130, 160, 0.18)';
  ctx2d.lineWidth = 1;
  for (const planet of sys.planets) {
    ctx2d.beginPath();
    ctx2d.arc(cx, cy, planet.orbitRadius * maxR, 0, Math.PI * 2);
    ctx2d.stroke();
  }

  // Lane rays + labels (N/E/S/W projected outward)
  const laneDirs: Array<{ lane: 'north' | 'east' | 'south' | 'west'; dx: number; dy: number; label: string }> = [
    { lane: 'north', dx: 0, dy: -1, label: 'N' },
    { lane: 'east', dx: 1, dy: 0, label: 'E' },
    { lane: 'south', dx: 0, dy: 1, label: 'S' },
    { lane: 'west', dx: -1, dy: 0, label: 'W' }
  ];
  ctx2d.lineWidth = 2;
  for (const dir of laneDirs) {
    const sector = sys.laneSectors[dir.lane];
    const dom = sector.dominantFactionId
      ? sys.factions.find((f) => f.id === sector.dominantFactionId)
      : null;
    ctx2d.strokeStyle = dom?.color ?? 'rgba(140, 150, 180, 0.55)';
    ctx2d.beginPath();
    ctx2d.moveTo(cx + dir.dx * 12, cy + dir.dy * 12);
    // Stop the ray well inside the canvas edge so labels don't need to
    // render off-canvas; long-form lane info lives in the DOM list below.
    const rayMax = maxR - 4;
    ctx2d.lineTo(cx + dir.dx * rayMax, cy + dir.dy * rayMax);
    ctx2d.stroke();
    // Compass label inside the canvas at the ray's far end.
    ctx2d.fillStyle = '#e6eaf2';
    ctx2d.font = 'bold 14px sans-serif';
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    const lx = cx + dir.dx * (maxR - 18);
    const ly = cy + dir.dy * (maxR - 18);
    ctx2d.fillText(dir.label, lx, ly);
  }

  // Planets
  for (const planet of sys.planets) {
    const r = planet.orbitRadius * maxR;
    const px = cx + Math.cos(planet.orbitAngle) * r;
    const py = cy + Math.sin(planet.orbitAngle) * r;
    const faction = sys.factions.find((f) => f.id === planet.factionId);
    const planetColor = planet.bodyType === 'gas'
      ? '#c2a36b'
      : planet.bodyType === 'ice'
      ? '#a9d8ee'
      : '#8d6f5a';
    const planetRadius = planet.bodyType === 'gas' ? 8 : planet.bodyType === 'ice' ? 6 : 5;
    ctx2d.fillStyle = planetColor;
    ctx2d.beginPath();
    ctx2d.arc(px, py, planetRadius, 0, Math.PI * 2);
    ctx2d.fill();
    // Faction-color outline
    if (faction) {
      ctx2d.strokeStyle = faction.color;
      ctx2d.lineWidth = 2;
      ctx2d.beginPath();
      ctx2d.arc(px, py, planetRadius + 2, 0, Math.PI * 2);
      ctx2d.stroke();
    }
    // Label
    ctx2d.fillStyle = '#e6eaf2';
    ctx2d.font = '11px sans-serif';
    ctx2d.textAlign = 'left';
    ctx2d.textBaseline = 'middle';
    const sigil = faction ? `[${sigilForFaction(faction)}] ` : '';
    ctx2d.fillText(`${sigil}${planet.displayName}`, px + planetRadius + 6, py);
  }

  // Sun (center)
  const sunGrad = ctx2d.createRadialGradient(cx, cy, 2, cx, cy, 18);
  sunGrad.addColorStop(0, '#fff7c2');
  sunGrad.addColorStop(0.6, '#f5b94a');
  sunGrad.addColorStop(1, 'rgba(245, 185, 74, 0)');
  ctx2d.fillStyle = sunGrad;
  ctx2d.beginPath();
  ctx2d.arc(cx, cy, 18, 0, Math.PI * 2);
  ctx2d.fill();
  ctx2d.fillStyle = '#fff5b8';
  ctx2d.beginPath();
  ctx2d.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx2d.fill();

  // Station pip — small white square at center, on top of the sun
  ctx2d.fillStyle = '#0b1020';
  ctx2d.fillRect(cx - 3, cy - 3, 6, 6);
  ctx2d.strokeStyle = '#e6eaf2';
  ctx2d.lineWidth = 1;
  ctx2d.strokeRect(cx - 3, cy - 3, 6, 6);

  // Summary line
  systemMapSummaryEl.textContent = `${sys.factions.length} factions · ${sys.planets.length} planets · ${sys.asteroidBelts.length} belts · seed ${sys.seedAtCreation}`;

  // Faction legend
  systemMapFactionsEl.innerHTML = '<div class="section-title">Factions</div>' + sys.factions.map((f) => {
    const swatch = `<span style="display:inline-block;width:10px;height:10px;background:${f.color};margin-right:6px;vertical-align:middle;border-radius:2px;"></span>`;
    return `<div class="row compact list-row"><span>${swatch}[${sigilForFaction(f)}] ${f.displayName}</span></div>`;
  }).join('');

  // Lane legend — vertical stacked layout so long faction lists wrap
  // instead of being clipped by the right edge of the modal.
  const laneNames: Record<string, string> = {
    N: 'North',
    E: 'East',
    S: 'South',
    W: 'West'
  };
  const laneLines = laneDirs.map((d) => {
    const sector = sys.laneSectors[d.lane];
    const factionsAlong = sector.factionIds
      .map((id) => sys.factions.find((f) => f.id === id))
      .filter((f): f is NonNullable<typeof f> => !!f);
    const dom = sector.dominantFactionId
      ? sys.factions.find((f) => f.id === sector.dominantFactionId)
      : null;
    const tag = factionsAlong.length > 0
      ? factionsAlong.map((f) => `[${sigilForFaction(f)}] ${f.displayName}`).join(', ')
      : 'unclaimed';
    const domLabel = dom ? ` &mdash; dominant: [${sigilForFaction(dom)}] ${dom.displayName}` : '';
    return `<div class="system-map-lane-row"><strong>${d.label} (${laneNames[d.label] ?? d.label})</strong><div class="system-map-lane-detail">${tag}${domLabel}</div></div>`;
  }).join('');
  systemMapLanesEl.innerHTML = '<div class="section-title">Lanes</div>' + laneLines;
}

wireModal({ modal: saveModal, openBtn: openSaveModalBtn, closeBtn: closeSaveModalBtn, beforeOpen: refreshSaveUi });
wireModal({ modal: marketModal, openBtn: openMarketBtn, closeBtn: closeMarketBtn });
wireModal({ modal: expansionModal, openBtn: openExpansionModalBtn, closeBtn: closeExpansionModalBtn, beforeOpen: refreshExpansionUi });
wireModal({
  modal: systemMapModal,
  openBtn: openSystemMapModalBtn,
  closeBtn: closeSystemMapBtn,
  beforeOpen: refreshSystemMapModal
});
wireModal({ modal: progressionModal, openBtn: openProgressionModalBtn, closeBtn: closeProgressionModalBtn, beforeOpen: refreshProgressionModal });
wireModal({ modal: priorityModal, openBtn: editPrioritiesBtn, closeBtn: closePriorityBtn, beforeOpen: refreshPriorityUi });
wireModal({ modal: opsModal, openBtn: openOpsModalBtn, closeBtn: closeOpsModalBtn, beforeOpen: refreshOpsModal });
wireModal({ modal: dockModal, closeBtn: closeDockBtn });
wireModal({
  modal: roomModal,
  closeBtn: closeRoomBtn,
  beforeClose: () => {
    selectedRoomTile = null;
  }
});
wireModal({
  modal: agentModal,
  closeBtn: closeAgentBtn,
  beforeClose: () => {
    selectedAgent = null;
    agentSidePanel.classList.add('hidden');
  }
});

closeAgentSideBtn.addEventListener('click', () => {
  selectedAgent = null;
  agentSidePanel.classList.add('hidden');
  agentModal.classList.add('hidden');
});

for (const system of prioritySystems) {
  const input = priorityInputs.get(system);
  const valueEl = priorityValueEls.get(system);
  if (!input || !valueEl) continue;
  input.addEventListener('input', () => {
    const value = clamp(parseInt(input.value, 10), 1, 10);
    valueEl.textContent = String(value);
    setCrewPriorityWeight(state, system, value);
  });
}

const DOCK_MODAL_SHIP_TYPE_CHECKBOXES: Array<[HTMLInputElement, ShipType]> = [
  [dockModalTouristCheckbox, 'tourist'],
  [dockModalTraderCheckbox, 'trader'],
  [dockModalIndustrialCheckbox, 'industrial'],
  [dockModalMilitaryCheckbox, 'military'],
  [dockModalColonistCheckbox, 'colonist']
];
for (const [checkbox, shipType] of DOCK_MODAL_SHIP_TYPE_CHECKBOXES) {
  checkbox.addEventListener('change', () => {
    if (selectedDockId === null) return;
    setDockAllowedShipType(state, selectedDockId, shipType, checkbox.checked);
    refreshDockModal();
  });
}

dockModalPurposeSelect.addEventListener('change', () => {
  if (selectedDockId === null) return;
  setDockPurpose(state, selectedDockId, dockModalPurposeSelect.value as 'visitor' | 'residential');
  refreshDockModal();
});

dockModalFacingSelect.addEventListener('change', () => {
  if (selectedDockId === null) return;
  const facing = dockModalFacingSelect.value as SpaceLane;
  const result = setDockFacing(state, selectedDockId, facing);
  if (!result.ok) {
    dockModalErrorEl.textContent = `Facing status: invalid (${result.reason ?? 'blocked'})`;
    dockModalErrorEl.style.color = '#ff7676';
    refreshDockModal();
    return;
  }
  dockModalErrorEl.textContent = 'Facing status: ok';
  dockModalErrorEl.style.color = '#6edb8f';
  refreshDockModal();
});

const DOCK_MODAL_SHIP_SIZE_CHECKBOXES: Array<[HTMLInputElement, ShipSize]> = [
  [dockModalSmallCheckbox, 'small'],
  [dockModalMediumCheckbox, 'medium'],
  [dockModalLargeCheckbox, 'large']
];
for (const [checkbox, shipSize] of DOCK_MODAL_SHIP_SIZE_CHECKBOXES) {
  checkbox.addEventListener('change', () => {
    if (selectedDockId === null) return;
    setDockAllowedShipSize(state, selectedDockId, shipSize, checkbox.checked);
    refreshDockModal();
  });
}

roomModalHousingSelect.addEventListener('change', () => {
  if (selectedRoomTile === null) return;
  const value = roomModalHousingSelect.value as HousingPolicy;
  const ok = setRoomHousingPolicy(state, selectedRoomTile, value);
  if (ok) refreshRoomModal();
});

function generateSaveId(): string {
  return `save-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function saveToSlot(saveName: string, slotId?: string): void {
  const payloadText = serializeSave(saveName, state, GAME_VERSION);
  const nowIso = new Date().toISOString();
  const { store, warnings } = readSaveStore();
  const saves = [...store.saves];

  if (slotId) {
    const existingIndex = saves.findIndex((save) => save.id === slotId);
    if (existingIndex >= 0) {
      saves[existingIndex] = {
        ...saves[existingIndex],
        name: saveName,
        updatedAt: nowIso,
        payloadText
      };
    } else {
      saves.push({
        id: slotId,
        name: saveName,
        createdAt: nowIso,
        updatedAt: nowIso,
        payloadText
      });
    }
  } else {
    saves.push({
      id: generateSaveId(),
      name: saveName,
      createdAt: nowIso,
      updatedAt: nowIso,
      payloadText
    });
  }

  const trimmed = trimSaveStore(saves);
  if (!writeSaveStore({ storeVersion: 1, saves: trimmed.saves })) return;

  const selectedId = slotId ?? trimmed.saves[trimmed.saves.length - 1]?.id;
  refreshSaveUi(selectedId);
  const extras: string[] = [];
  if (trimmed.removed > 0) extras.push(`${trimmed.removed} old save(s) evicted`);
  if (warnings.length > 0) extras.push(...warnings);
  const suffix = extras.length > 0 ? ` (${extras.join(' | ')})` : '';
  setSaveStatus(`Saved "${saveName}".${suffix}`, extras.length > 0 ? 'warn' : 'ok');
}

function loadSelectedSave(): void {
  const { store, warnings: storageWarnings } = readSaveStore();
  const selected = getSelectedSave(store);
  if (!selected) {
    setSaveStatus('Select a save slot first.', 'error');
    return;
  }

  const parsed = parseAndMigrateSave(selected.payloadText);
  if (!parsed.ok) {
    setSaveStatus(`Selected save is invalid: ${parsed.error}`, 'error');
    return;
  }

  try {
    const hydrated = hydrateStateFromSave(parsed.save);
    applyHydratedState(hydrated.state);
    const warningCount = parsed.warnings.length + hydrated.warnings.length + storageWarnings.length;
    const details = [...storageWarnings, ...parsed.warnings, ...hydrated.warnings];
    if (warningCount > 0) {
      setSaveStatus(`Loaded "${selected.name}" with ${warningCount} warning(s): ${details.slice(0, 3).join(' | ')}`, 'warn');
    } else {
      setSaveStatus(`Loaded "${selected.name}".`, 'ok');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setSaveStatus(`Load failed: ${message}`, 'error');
  }
}

saveSlotSelect.addEventListener('change', () => {
  const { store } = readSaveStore();
  const selected = getSelectedSave(store);
  saveExportTextarea.value = selected ? toDisplaySaveSummary(selected) : '';
});

saveCreateBtn.addEventListener('click', () => {
  const name = saveNameInput.value.trim() || `Save ${new Date().toLocaleString()}`;
  saveToSlot(name);
});

saveQuicksaveBtn.addEventListener('click', () => {
  saveToSlot('Quicksave', QUICKSAVE_ID);
});

saveLoadBtn.addEventListener('click', () => {
  loadSelectedSave();
});

saveDeleteBtn.addEventListener('click', () => {
  const { store } = readSaveStore();
  const selected = getSelectedSave(store);
  if (!selected) {
    setSaveStatus('Select a save slot first.', 'error');
    return;
  }
  const remaining = store.saves.filter((save) => save.id !== selected.id);
  if (!writeSaveStore({ storeVersion: 1, saves: remaining })) return;
  refreshSaveUi();
  setSaveStatus(`Deleted "${selected.name}".`, 'ok');
});

saveDownloadBtn.addEventListener('click', () => {
  const { store } = readSaveStore();
  const selected = getSelectedSave(store);
  if (!selected) {
    setSaveStatus('Select a save slot first.', 'error');
    return;
  }
  try {
    const blob = new Blob([selected.payloadText], { type: 'application/json' });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = buildSaveDownloadFilename(selected);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
    setSaveStatus(`Downloaded "${selected.name}" as JSON.`, 'ok');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setSaveStatus(`Download failed: ${message}`, 'error');
  }
});

saveImportBtn.addEventListener('click', () => {
  const text = saveImportTextarea.value.trim();
  if (!text) {
    setSaveStatus('Paste JSON into the import box first.', 'error');
    return;
  }
  const parsed = parseAndMigrateSave(text);
  if (!parsed.ok) {
    setSaveStatus(`Import failed: ${parsed.error}`, 'error');
    return;
  }
  try {
    const hydrated = hydrateStateFromSave(parsed.save);
    const importName = saveNameInput.value.trim() || parsed.save.name || `Imported ${new Date().toLocaleString()}`;
    const payloadText = serializeSave(importName, hydrated.state, parsed.save.gameVersion || GAME_VERSION);
    const nowIso = new Date().toISOString();
    const { store, warnings } = readSaveStore();
    const saves = [
      ...store.saves,
      {
        id: generateSaveId(),
        name: importName,
        createdAt: nowIso,
        updatedAt: nowIso,
        payloadText
      }
    ];
    const trimmed = trimSaveStore(saves);
    if (!writeSaveStore({ storeVersion: 1, saves: trimmed.saves })) return;
    const selectedId = trimmed.saves[trimmed.saves.length - 1]?.id;
    refreshSaveUi(selectedId);
    const warningCount = warnings.length + parsed.warnings.length + hydrated.warnings.length;
    if (warningCount > 0) {
      setSaveStatus(
        `Imported "${importName}" with ${warningCount} warning(s): ${[...warnings, ...parsed.warnings, ...hydrated.warnings]
          .slice(0, 3)
          .join(' | ')}`,
        'warn'
      );
    } else {
      setSaveStatus(`Imported "${importName}".`, 'ok');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setSaveStatus(`Import failed: ${message}`, 'error');
  }
});

buySmallBtn.addEventListener('click', () => {
  const result = buyMaterialsDetailed(state, market.buyMat25Cost, 25);
  marketNoteEl.textContent = materialBuyStatusText(result, 25);
});

buyLargeBtn.addEventListener('click', () => {
  const result = buyMaterialsDetailed(state, market.buyMat80Cost, 80);
  marketNoteEl.textContent = materialBuyStatusText(result, 80);
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
  marketNoteEl.textContent = ok ? `Sold -25 supplies (+${market.sellMat25Gain}c)` : 'Not enough supplies';
});

sellLargeBtn.addEventListener('click', () => {
  const ok = sellMaterials(state, 80, market.sellMat80Gain);
  marketNoteEl.textContent = ok ? `Sold -80 supplies (+${market.sellMat80Gain}c)` : 'Not enough supplies';
});

materialAutoImportInput.addEventListener('change', () => {
  state.controls.materialAutoImportEnabled = materialAutoImportInput.checked;
});

materialTargetStockInput.addEventListener('change', () => {
  state.controls.materialTargetStock = clamp(Number(materialTargetStockInput.value) || 0, 0, 500);
  materialTargetStockInput.value = String(Math.round(state.controls.materialTargetStock));
});

materialImportBatchInput.addEventListener('change', () => {
  state.controls.materialImportBatchSize = clamp(Number(materialImportBatchInput.value) || 1, 1, 160);
  materialImportBatchInput.value = String(Math.round(state.controls.materialImportBatchSize));
});

buyFoodSmallBtn.addEventListener('click', () => {
  const result = buyRawFoodDetailed(state, market.buyFood20Cost, 20);
  marketNoteEl.textContent = result.ok
    ? 'Purchased +20 raw food'
    : result.reason === 'insufficient_credits'
      ? 'Not enough credits'
      : result.reason === 'no_food_destinations'
        ? 'Need Hydroponics/Kitchen nodes'
        : `Not enough food capacity (free ${result.freeCapacity.toFixed(1)}, need ${result.requiredAmount.toFixed(1)})`;
});

buyFoodLargeBtn.addEventListener('click', () => {
  const result = buyRawFoodDetailed(state, market.buyFood60Cost, 60);
  marketNoteEl.textContent = result.ok
    ? 'Purchased +60 raw food'
    : result.reason === 'insufficient_credits'
      ? 'Not enough credits'
      : result.reason === 'no_food_destinations'
        ? 'Need Hydroponics/Kitchen nodes'
        : `Not enough food capacity (free ${result.freeCapacity.toFixed(1)}, need ${result.requiredAmount.toFixed(1)})`;
});

sellFoodSmallBtn.addEventListener('click', () => {
  const ok = sellRawFood(state, 20, market.sellFood20Gain);
  marketNoteEl.textContent = ok ? `Sold -20 raw food (+${market.sellFood20Gain}c)` : 'Not enough raw food';
});

sellFoodLargeBtn.addEventListener('click', () => {
  const ok = sellRawFood(state, 60, market.sellFood60Gain);
  marketNoteEl.textContent = ok ? `Sold -60 raw food (+${market.sellFood60Gain}c)` : 'Not enough raw food';
});

clearBodiesBtn.addEventListener('click', () => {
  const ok = clearBodies(state);
  if (ok) {
    marketNoteEl.textContent = 'Cleared body remains';
  } else if (state.metrics.bodyCount <= 0) {
    marketNoteEl.textContent = 'No bodies to clear';
  } else {
    marketNoteEl.textContent = 'Need 6 supplies to clear bodies';
  }
});

let lastTime = performance.now();
const UI_REFRESH_INTERVAL_MS = 125;
const HOVER_DIAGNOSTIC_REFRESH_INTERVAL_MS = 250;
const TARGET_FRAME_MS = 1000 / 60;
const MAX_FRAME_DT_SEC = 1 / 30;
let nextUiRefreshAt = 0;
let nextHoverDiagnosticRefreshAt = 0;
let lastHoverDiagnosticTile: number | null = null;
let cachedHoverDiagnostic: ReturnType<typeof getRoomDiagnosticAt> = null;
// Key-cache rather than the PR #48 handler-push pattern because
// `spriteAtlas.ready` flips inside the async atlas-loader resolution, not
// at a sync click. Lazy detection is simpler than plumbing calls into that.
let lastSpriteStatusKey = '';
function refreshSpriteStatus(): void {
  const key = `${state.controls.spriteMode}|${state.controls.showSpriteFallback}|${spriteAtlas.ready}|${spriteAtlas.version}`;
  if (key === lastSpriteStatusKey) return;
  lastSpriteStatusKey = key;
  if (state.controls.spriteMode !== 'sprites') {
    spriteStatusEl.textContent = 'Sprites inactive (fallback rendering)';
    spriteStatusEl.style.color = '#8ea2bd';
  } else if (state.controls.showSpriteFallback) {
    spriteStatusEl.textContent = 'Sprites requested; force fallback enabled';
    spriteStatusEl.style.color = '#ffcf6e';
  } else if (!spriteAtlas.ready) {
    spriteStatusEl.textContent = 'Sprites requested, atlas missing -> fallback active';
    spriteStatusEl.style.color = '#ffcf6e';
  } else {
    spriteStatusEl.textContent = `Sprites active (${spriteAtlas.version})`;
    spriteStatusEl.style.color = '#6edb8f';
  }
}
function frame(now: number): void {
  const frameMs = now - lastTime;
  const dt = Math.min(frameMs / 1000, MAX_FRAME_DT_SEC);
  lastTime = now;
  state.metrics.frameMs = frameMs;
  state.metrics.rafJankMs = Math.max(0, frameMs - TARGET_FRAME_MS);
  state.metrics.rafDroppedFrames = Math.max(0, Math.round(frameMs / TARGET_FRAME_MS) - 1);

  // Tag autosave-dirty whenever the sim advances OR the player acted
  // since the last tick. Simpler than wiring every mutation site; a tick
  // of dt>0 means something about the world changed. Autosave's first
  // successful write still only fires after this flag flips true, so a
  // refresh-then-walk-away doesn't overwrite a meaningful prior record.
  if (dt > 0) markDirty();

  tick(state, dt);
  const renderViewport = getRenderViewport();
  prepareViewportRender(renderViewport);
  const renderStart = performance.now();
  renderWorld(ctx, state, currentTool, hoveredTile, spriteAtlas, renderViewport);
  drawSelectedAgentRoute(ctx);
  state.metrics.renderMs = performance.now() - renderStart;

  if (hoveredTile !== lastHoverDiagnosticTile || now >= nextHoverDiagnosticRefreshAt) {
    cachedHoverDiagnostic = hoveredTile !== null ? getRoomDiagnosticAt(state, hoveredTile) : null;
    lastHoverDiagnosticTile = hoveredTile;
    nextHoverDiagnosticRefreshAt = now + HOVER_DIAGNOSTIC_REFRESH_INTERVAL_MS;
  }

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

  const shouldRefreshUi = now >= nextUiRefreshAt;
  if (shouldRefreshUi) {
    nextUiRefreshAt = now + UI_REFRESH_INTERVAL_MS;

  refreshToolbar();
  refreshSpriteStatus();
  refreshDiagnosticReadout();
  refreshDiagnosticKey();
  refreshHudStatus();
  refreshTrafficStatus();
  refreshAlertPanel();
  refreshTierChecklist();
  refreshSelectionSummary();
  refreshDevTierOverlay();
  visitorsEl.textContent = String(state.metrics.visitorsCount);
  moraleEl.textContent = `${Math.round(state.metrics.morale)}%`;
  stationRatingEl.textContent = ratingSummaryText();
  healthRatingEl.textContent = ratingSummaryText();
  moraleEl.style.color =
    state.metrics.morale > 65 ? '#6edb8f' : state.metrics.morale > 40 ? '#ffcf6e' : '#ff7676';
  stationRatingEl.style.color = ratingToneColor();
  healthRatingEl.style.color = ratingToneColor();
  visitorFeelingsEl.textContent = `Visitor feelings: ${state.metrics.stationRatingDrivers.join(' | ') || 'none'}`;
  moraleReasonsEl.textContent = `Crew morale drivers: ${state.metrics.crewMoraleDrivers.join(' | ') || 'none'}`;
  ratingReasonsEl.textContent = `Rating drivers: ${state.metrics.stationRatingDrivers.join(' | ') || 'none'}`;
  residentConversionSummaryEl.textContent = residentConversionStatusText();
  residentConversionSummaryEl.style.color =
    residentConversionTone() === 'ok' ? '#6edb8f' : residentConversionTone() === 'danger' ? '#ff7676' : residentConversionTone() === 'warn' ? '#ffcf6e' : '#8ea2bd';
  crewEl.textContent = crewOpsSummaryText(true);
  opsTrafficEl.textContent = trafficOpsSummaryText();
  crewBreakdownEl.textContent = `Crew: work ${state.metrics.crewAssignedWorking} | idle ${state.metrics.crewIdleAvailable} | resting ${state.metrics.crewResting} | logistics ${state.metrics.crewOnLogisticsJobs} | blocked ${state.metrics.crewBlockedNoPath}`;
  crewShiftsEl.textContent = crewShiftsText();
  crewLockoutsEl.textContent = `Emergency lockouts prevented: ${state.metrics.crewPingPongPreventions}`;
  criticalStaffingLineEl.textContent = criticalStaffingText();
  opsEl.textContent = coreOpsSummaryText();
  opsResidentsEl.textContent = residentConversionStatusText(true);
  opsExtraEl.textContent = opsExtraText();
  kitchenStatusEl.textContent = kitchenStatusText();
  tradeStatusEl.textContent = tradeStatusText();
  demandStripEl.textContent = `Current demand: Caf ${Math.round(state.metrics.shipDemandCafeteriaPct)}% | Market ${Math.round(state.metrics.shipDemandMarketPct)}% | Lounge ${Math.round(state.metrics.shipDemandLoungePct)}%`;
  archetypeStripEl.textContent = `Visitors: Diner ${state.metrics.visitorsByArchetype.diner} | Shopper ${state.metrics.visitorsByArchetype.shopper} | Lounger ${state.metrics.visitorsByArchetype.lounger} | Rusher ${state.metrics.visitorsByArchetype.rusher}`;
  shipTypeStripEl.textContent =
    `Ships/min: Tour ${state.metrics.shipsByTypePerMin.tourist.toFixed(1)} | ` +
    `Trade ${state.metrics.shipsByTypePerMin.trader.toFixed(1)} | ` +
    `Ind ${state.metrics.shipsByTypePerMin.industrial.toFixed(1)} | ` +
    `Mil ${state.metrics.shipsByTypePerMin.military.toFixed(1)} | ` +
    `Col ${state.metrics.shipsByTypePerMin.colonist.toFixed(1)}`;
  refreshUnlockLegendAndHotkeys();
  refreshProgressionModal();
  roomUsageEl.textContent = roomUsageText();
  roomFlowEl.textContent = roomFlowText();
  resourcesEl.textContent = `Raw Meal ${Math.round(state.metrics.rawFoodStock)} -> Meals ${Math.round(state.metrics.mealStock)} | Water ${Math.round(state.metrics.waterStock)} | Air ${Math.round(state.metrics.airQuality)}%`;
  resourcesEl.style.color = state.metrics.airQuality < 35 ? '#ff7676' : '#d6deeb';
  pressureEl.textContent = `${Math.round(state.metrics.pressurizationPct)}% sealed | ${state.metrics.leakingTiles} leaking tiles`;
  pressureEl.style.color = state.metrics.pressurizationPct > 85 ? '#6edb8f' : state.metrics.pressurizationPct > 60 ? '#ffcf6e' : '#ff7676';
  economyEl.textContent = `Supplies ${Math.round(state.metrics.materials)} | Credits ${Math.round(state.metrics.credits)}`;
  economyFlowEl.textContent = `Credits/min: +${state.metrics.creditsGrossPerMin.toFixed(1)} gross | -${state.metrics.creditsPayrollPerMin.toFixed(1)} payroll | net ${state.metrics.creditsNetPerMin >= 0 ? '+' : ''}${state.metrics.creditsNetPerMin.toFixed(1)}`;
  jobsEl.textContent = jobsSummaryText();
  idleReasonsEl.textContent = idleReasonsText();
  stallReasonsEl.textContent = stallReasonsText();
  crewRetargetsEl.textContent = crewRetargetsText();
  jobsExtraEl.textContent = jobsExtraText();
  foodChainHintEl.textContent = foodChainHintText();
  roomWarningsEl.textContent = `Room warnings: ${state.metrics.topRoomWarnings.join(' | ') || 'none'}`;
  updateMarketRates();
  refreshMarketUi();
  refreshExpansionUi();
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
  clearBodiesBtn.disabled = state.metrics.bodyCount <= 0 || state.metrics.materials < 6;
  foodFlowEl.textContent = foodFlowText();
  powerEl.textContent = `${Math.round(state.metrics.powerDemand)} / ${Math.round(state.metrics.powerSupply)}`;
  powerEl.style.color = state.metrics.powerDemand > state.metrics.powerSupply ? '#ff7676' : '#6edb8f';
  incidentsEl.textContent =
    `${state.metrics.incidentsTotal} | open ${state.metrics.incidentsOpen} | resolved ${state.metrics.incidentsResolved} | ` +
    `failed ${state.metrics.incidentsFailed} | dispatch ${state.metrics.securityDispatches} | resp ${state.metrics.securityResponseAvgSec.toFixed(1)}s | ` +
    `confront ${state.metrics.residentConfrontations} | defuse ${(state.metrics.immediateDefuseRate * 100).toFixed(0)}% | ` +
    `extended ${(state.metrics.escalatedFightRate * 100).toFixed(0)}% | cover ${state.metrics.securityCoveragePct.toFixed(0)}%`;
  lifeSupportStatusEl.textContent = `Life support: active ${state.ops.lifeSupportActive}/${state.ops.lifeSupportTotal} (air +${state.metrics.lifeSupportActiveAirPerSec.toFixed(1)}/s of +${state.metrics.lifeSupportPotentialAirPerSec.toFixed(1)}/s potential)`;
  airTrendEl.textContent = `Air trend: ${state.metrics.airTrendPerSec >= 0 ? '+' : ''}${state.metrics.airTrendPerSec.toFixed(2)}/s`;
  airTrendEl.style.color = state.metrics.airTrendPerSec >= 0 ? '#6edb8f' : '#ff7676';
  airHealthEl.textContent = `Air health: distressed ${state.metrics.distressedResidents} | critical ${state.metrics.criticalResidents} | deaths ${state.metrics.deathsTotal} (+${state.metrics.recentDeaths} recent) | bodies ${state.metrics.bodyCount}`;
  if (state.metrics.airBlockedWarningActive) {
    airBlockedWarningEl.textContent = `Air blocked: life support rooms are painted but inactive (${state.metrics.lifeSupportInactiveReasons.join(', ') || 'check door, pressure, staff, path'})`;
    airBlockedWarningEl.style.color = '#ff7676';
  } else {
    airBlockedWarningEl.textContent = `Air warning: ${state.metrics.lifeSupportInactiveReasons.length > 0 ? state.metrics.lifeSupportInactiveReasons.join(', ') : 'none'}`;
    airBlockedWarningEl.style.color = '#8ea2bd';
  }
  dockedShipsEl.textContent = String(state.metrics.dockedShips);
  avgDockTimeEl.textContent = `${state.metrics.averageDockTime.toFixed(1)}s`;
  bayUtilizationEl.textContent = `${Math.round(state.metrics.bayUtilizationPct)}%`;
  exitsPerMinEl.textContent = String(state.metrics.exitsPerMin);
  laneQueuesEl.textContent = `Lane queues N/E/S/W: ${state.metrics.dockQueueLengthByLane.north}/${state.metrics.dockQueueLengthByLane.east}/${state.metrics.dockQueueLengthByLane.south}/${state.metrics.dockQueueLengthByLane.west}`;
  walkStatsEl.textContent = `Visitor route avg: ${state.metrics.avgVisitorWalkDistance.toFixed(1)} | skipped docks ${state.metrics.shipsSkippedNoEligibleDock} | queue timeouts ${state.metrics.shipsTimedOutInQueue}`;
  const frameBudgetMs = state.metrics.tickMs + state.metrics.renderMs;
  perfStatsEl.textContent =
    `Perf: rAF ${state.metrics.frameMs.toFixed(1)}ms (drop ${state.metrics.rafDroppedFrames}) | ` +
    `sim ${state.metrics.tickMs.toFixed(1)}ms | render ${state.metrics.renderMs.toFixed(1)}ms | ` +
    `path ${state.metrics.pathMs.toFixed(1)}ms/${state.metrics.pathCallsPerTick} | work ${frameBudgetMs.toFixed(1)}ms`;
  perfStatsEl.style.color = state.metrics.rafDroppedFrames > 0 || frameBudgetMs > TARGET_FRAME_MS ? '#ffcf6e' : '#8ea2bd';
  berthSummaryEl.textContent =
    `Berths: visitor ${state.metrics.visitorBerthsOccupied}/${state.metrics.visitorBerthsTotal} | ` +
    `resident ${state.metrics.residentBerthsOccupied}/${state.metrics.residentBerthsTotal} | ` +
    `resident ships ${state.metrics.residentShipsDocked}`;
  residentLoopSummaryEl.textContent =
    `Resident loop: convert ${state.metrics.residentConversionSuccesses}/${state.metrics.residentConversionAttempts} | ` +
    `departures ${state.metrics.residentDepartures} | tax +${state.metrics.residentTaxPerMin.toFixed(1)}/min | sat ${state.metrics.residentSatisfactionAvg.toFixed(0)} | ` +
    `social ${state.metrics.residentSocialAvg.toFixed(0)} | safety ${state.metrics.residentSafetyAvg.toFixed(0)}`;
  const ratingTrend = state.metrics.stationRatingTrendPerMin;
  ratingInsightTrendEl.textContent = `Trend: ${ratingTrend >= 0 ? '+' : ''}${ratingTrend.toFixed(2)}/min ${ratingTrend >= 0 ? '(stable/improving)' : '(declining)'}`;
  ratingInsightTrendEl.style.color = ratingTrend >= 0 ? '#6edb8f' : '#ff7676';
  ratingInsightRateEl.textContent =
    `Penalty/min: timeout ${state.metrics.stationRatingPenaltyPerMin.queueTimeout.toFixed(2)} | ` +
    `no dock ${state.metrics.stationRatingPenaltyPerMin.noEligibleDock.toFixed(2)} | ` +
    `service ${state.metrics.stationRatingPenaltyPerMin.serviceFailure.toFixed(2)} | ` +
    `route length ${state.metrics.stationRatingPenaltyPerMin.longWalks.toFixed(2)} | ` +
    `bad routes ${state.metrics.stationRatingPenaltyPerMin.routeExposure.toFixed(2)} | ` +
    `env ${state.metrics.stationRatingPenaltyPerMin.environment.toFixed(2)}`;
  ratingInsightBonusEl.textContent =
    `Bonus/min: meals ${state.metrics.stationRatingBonusPerMin.mealService.toFixed(2)} | ` +
    `leisure ${state.metrics.stationRatingBonusPerMin.leisureService.toFixed(2)} | ` +
    `exits ${state.metrics.stationRatingBonusPerMin.successfulExit.toFixed(2)} | ` +
    `residents ${state.metrics.stationRatingBonusPerMin.residentRetention.toFixed(2)}`;
  ratingInsightBonusEl.style.color =
    state.metrics.stationRatingBonusPerMin.mealService +
      state.metrics.stationRatingBonusPerMin.leisureService +
      state.metrics.stationRatingBonusPerMin.successfulExit +
      state.metrics.stationRatingBonusPerMin.residentRetention >
    0
      ? '#6edb8f'
      : '#8ea2bd';
  ratingInsightServiceEl.textContent =
    `Service/min: no path ${state.metrics.stationRatingServiceFailureByReasonPerMin.noLeisurePath.toFixed(2)} | ` +
    `missing services ${state.metrics.stationRatingServiceFailureByReasonPerMin.shipServicesMissing.toFixed(2)} | ` +
    `patience bail ${state.metrics.stationRatingServiceFailureByReasonPerMin.patienceBail.toFixed(2)} | ` +
    `dock timeout ${state.metrics.stationRatingServiceFailureByReasonPerMin.dockTimeout.toFixed(2)} | ` +
    `trespass ${state.metrics.stationRatingServiceFailureByReasonPerMin.trespass.toFixed(2)}`;
  ratingInsightTotalEl.textContent =
    `Total penalty: timeout ${state.metrics.stationRatingPenaltyTotal.queueTimeout.toFixed(1)} | ` +
    `no dock ${state.metrics.stationRatingPenaltyTotal.noEligibleDock.toFixed(1)} | ` +
    `service ${state.metrics.stationRatingPenaltyTotal.serviceFailure.toFixed(1)} | ` +
    `route length ${state.metrics.stationRatingPenaltyTotal.longWalks.toFixed(1)} | ` +
    `bad routes ${state.metrics.stationRatingPenaltyTotal.routeExposure.toFixed(1)} | ` +
    `env ${state.metrics.stationRatingPenaltyTotal.environment.toFixed(1)}`;
  ratingInsightBonusTotalEl.textContent =
    `Total bonus: meals ${state.metrics.stationRatingBonusTotal.mealService.toFixed(1)} | ` +
    `leisure ${state.metrics.stationRatingBonusTotal.leisureService.toFixed(1)} | ` +
    `exits ${state.metrics.stationRatingBonusTotal.successfulExit.toFixed(1)} | ` +
    `residents ${state.metrics.stationRatingBonusTotal.residentRetention.toFixed(1)}`;
  ratingInsightServiceTotalEl.textContent =
    `Service total: no path ${state.metrics.stationRatingServiceFailureByReasonTotal.noLeisurePath.toFixed(1)} | ` +
    `missing services ${state.metrics.stationRatingServiceFailureByReasonTotal.shipServicesMissing.toFixed(1)} | ` +
    `patience bail ${state.metrics.stationRatingServiceFailureByReasonTotal.patienceBail.toFixed(1)} | ` +
    `dock timeout ${state.metrics.stationRatingServiceFailureByReasonTotal.dockTimeout.toFixed(1)} | ` +
    `trespass ${state.metrics.stationRatingServiceFailureByReasonTotal.trespass.toFixed(1)}`;
  ratingInsightEventsEl.textContent =
    `Events: skipped docks ${state.metrics.shipsSkippedNoEligibleDock} | ` +
    `queue timeouts ${state.metrics.shipsTimedOutInQueue} | ` +
    `service fails/min ${state.metrics.visitorServiceFailuresPerMin.toFixed(1)} | ` +
    `resident departures ${state.metrics.residentDepartures}`;
  if (selectedAgent !== null) {
    if (!refreshAgentSidePanel()) {
      selectedAgent = null;
      agentSidePanel.classList.add('hidden');
    }
    agentModal.classList.add('hidden');
  } else {
    agentModal.classList.add('hidden');
    agentSidePanel.classList.add('hidden');
  }
  if (!opsModal.classList.contains('hidden')) refreshOpsModal();
  if (selectedDockId !== null) {
    const dock = state.docks.find((d) => d.id === selectedDockId) ?? null;
    if (dock) {
      dockInfoEl.textContent = `Dock #${dock.id}: ${dock.purpose} berth | ${dock.lane} facing ${dock.facing} | area ${dock.area} | type ${dock.allowedShipTypes.join(', ')} | size ${dock.allowedShipSizes.join(', ')}`;
      refreshDockModal();
    } else {
      dockInfoEl.textContent = 'Dock: none selected';
      selectedDockId = null;
      dockModal.classList.add('hidden');
    }
  } else {
    dockInfoEl.textContent = 'Dock: none selected';
    dockModal.classList.add('hidden');
  }
  if (selectedRoomTile !== null) {
    const inspector = getRoomInspectorAt(state, selectedRoomTile);
    if (inspector) {
      refreshRoomModal();
    } else {
      selectedRoomTile = null;
      roomModal.classList.add('hidden');
    }
  }
  if (currentTool.kind === 'tile' && currentTool.tile === TileType.Dock && hoveredTile !== null) {
    const preview = validateDockPlacement(state, hoveredTile);
    dockPreviewEl.textContent = `Dock preview: ${preview.valid ? 'valid' : `invalid (${preview.reason})`}`;
    dockPreviewEl.style.color = preview.valid ? '#6edb8f' : '#ff7676';
  } else {
    dockPreviewEl.textContent = 'Dock preview: n/a';
    dockPreviewEl.style.color = '#8ea2bd';
  }

  // The Build Guidance sidebar panel (room-diagnostic + paint-guidance
  // surfaces) was removed alongside the Build & Room Legend panel in the
  // HUD cleanup pass — the top toolbar already encodes the same build
  // hotkey legend, and the modal room inspector handles deep diagnostics.
  // `cachedHoverDiagnostic` and `toolLockMessage` are still updated by
  // other sites (modal inspector, locked-tool toasts) so we just stop
  // writing them to the deleted sidebar spans.
  }

  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Autosave — ticks every AUTOSAVE_INTERVAL_MS, single slot at AUTOSAVE_KEY.
// Opt-in load: player sees a "Load last session (saved HH:MM)" button on
// arrival and decides whether to hydrate. Auto-loading on refresh would
// override intentional reset attempts. Serialization gated by `stateDirty`
// so a just-booted untouched session doesn't overwrite a meaningful
// prior autosave.

function formatClock(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function applyHydratedState(nextState: StationState): void {
  Object.assign(state, nextState);
  applyCanvasSize();
  updateStageLayout();
  fitStationToViewport();
  clearUiSelectionsAfterLoad();
  syncControlsToUiFromState();
  refreshExpansionUi();
}

type AutosaveRecord = { savedAt: number; payloadText: string };

let stateDirty = false;
let autosaveTimer: ReturnType<typeof setInterval> | null = null;

function markDirty(): void {
  stateDirty = true;
}

function readAutosaveRecord(): AutosaveRecord | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(AUTOSAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AutosaveRecord>;
    if (typeof parsed?.savedAt !== 'number' || typeof parsed?.payloadText !== 'string') return null;
    return { savedAt: parsed.savedAt, payloadText: parsed.payloadText };
  } catch {
    return null;
  }
}

function writeAutosave(): void {
  if (!stateDirty) return;
  try {
    const record: AutosaveRecord = {
      savedAt: Date.now(),
      payloadText: serializeSave('__autosave__', state, GAME_VERSION)
    };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(record));
    autosaveStatusEl.textContent = `Autosaved ${formatClock(record.savedAt)}`;
    autosaveStatusEl.classList.remove('hidden');
  } catch (err) {
    // localStorage full, serialization error, or quota exhausted — log
    // and continue. Autosave is a nice-to-have; never block the game.
    console.warn('[autosave] skip tick:', err);
  }
}

function offerAutosaveLoadOnColdStart(): void {
  const record = readAutosaveRecord();
  if (!record) return;
  const loadLabel = `Load last session (saved ${formatClock(record.savedAt)})`;
  loadAutosaveBtn.title = loadLabel;
  loadAutosaveBtn.setAttribute('aria-label', loadLabel);
  loadAutosaveBtn.classList.remove('hidden');
  loadAutosaveBtn.addEventListener('click', () => {
    const parsed = parseAndMigrateSave(record.payloadText);
    if (!parsed.ok) {
      const failLabel = 'Autosave load failed - record cleared';
      loadAutosaveBtn.classList.add('load-error');
      loadAutosaveBtn.title = failLabel;
      loadAutosaveBtn.setAttribute('aria-label', failLabel);
      try {
        localStorage.removeItem(AUTOSAVE_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      const hydrated = hydrateStateFromSave(parsed.save);
      applyHydratedState(hydrated.state);
      stateDirty = true;
      loadAutosaveBtn.classList.add('hidden');
      autosaveStatusEl.textContent = `Autosaved ${formatClock(record.savedAt)} · loaded`;
      autosaveStatusEl.classList.remove('hidden');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const failLabel = `Autosave load failed: ${msg}`;
      loadAutosaveBtn.classList.add('load-error');
      loadAutosaveBtn.title = failLabel;
      loadAutosaveBtn.setAttribute('aria-label', failLabel);
    }
  });
}

async function startGameLoop(): Promise<void> {
  spriteAtlas = await loadSpriteAtlas(state.controls.spritePipeline);
  refreshModulePaletteSprites();
  offerAutosaveLoadOnColdStart();
  if (autosaveTimer !== null) clearInterval(autosaveTimer);
  autosaveTimer = setInterval(writeAutosave, AUTOSAVE_INTERVAL_MS);
  requestAnimationFrame(frame);
}

void startGameLoop();

// ---------------------------------------------------------------------------
// Harness hooks — always-on, read-only, safe to expose in production.
// Playwright and browser-console users can call these to inspect live state
// without touching internals. Repro URLs use window.__harnessLoadSave().
// ---------------------------------------------------------------------------
declare global {
  interface Window {
    __harnessGetState: () => unknown;
    __harnessGetMetrics: () => unknown;
    __harnessExportSave: () => string;
    __harnessLoadSave: (json: string) => void;
    __harnessPauseAndFlush: () => void;
    __harnessAdvanceSim: (seconds: number, step?: number) => void;
    __harnessDiagnoseFoodChain: () => unknown;
    __harnessReady: boolean;
  }
}

window.__harnessGetState = () => {
  // Returns a shallow-serializable snapshot of the current sim state.
  // Deep-clone via JSON to avoid reference leaks into test code.
  return JSON.parse(serializeSave('__harness__', state, GAME_VERSION));
};

window.__harnessGetMetrics = () => {
  return JSON.parse(JSON.stringify(state.metrics));
};

window.__harnessExportSave = () => {
  return serializeSave('__harness_export__', state, GAME_VERSION);
};

window.__harnessLoadSave = (json: string) => {
  try {
    const parsed = parseAndMigrateSave(json);
    if (!parsed.ok) {
      console.error('[harness] __harnessLoadSave: parse failed', parsed.error);
      return;
    }
    // hydrateStateFromSave returns {state, warnings} and throws on unrecoverable errors.
    // The outer try/catch handles the throw case.
    const hydrated = hydrateStateFromSave(parsed.save);
    if (hydrated.warnings.length) {
      console.warn('[harness] __harnessLoadSave warnings:', hydrated.warnings);
    }
    Object.assign(state, hydrated.state);
    console.log('[harness] state loaded from JSON');
  } catch (e) {
    console.error('[harness] __harnessLoadSave: exception', e);
  }
};

window.__harnessPauseAndFlush = () => {
  // Pause the sim and force a synchronous render pass so screenshots
  // are taken against a stable, non-animated frame.
  state.controls.paused = true;
  const renderViewport = getRenderViewport();
  prepareViewportRender(renderViewport);
  renderWorld(ctx, state, currentTool, hoveredTile, spriteAtlas, renderViewport);
};

window.__harnessAdvanceSim = (seconds: number, step = 0.25) => {
  // Advance the sim by `seconds` of sim time regardless of pause state.
  // Useful for fast-forwarding a scenario to a target state.
  const steps = Math.ceil(seconds / step);
  for (let i = 0; i < steps; i++) {
    tick(state, step);
  }
};

// Food-chain diagnostic — covers BMO's T2 stall hunt 2026-04-27. Call
// from devtools or harness to get a structured dump of "why isn't
// hydroponics→kitchen rawMeal moving?" Includes job state, path probe
// for every grow→stove pair, crew role distribution, and live metrics.
window.__harnessDiagnoseFoodChain = () => {
  return JSON.parse(JSON.stringify(diagnoseFoodChain(state)));
};

window.__harnessReady = true;

// ?load=<base64-JSON> or ?loadId=<localStorageKey> repro URL support.
// Bots can construct these from failure-state.json to reproduce any failure.
(function applyLoadParam() {
  const params = new URLSearchParams(location.search);
  const loadB64 = params.get('load');
  const loadId = params.get('loadId');
  if (loadB64) {
    try {
      const json = atob(loadB64);
      window.__harnessLoadSave(json);
    } catch (e) {
      console.error('[harness] ?load= base64 decode failed', e);
    }
  } else if (loadId) {
    try {
      const raw = localStorage.getItem(loadId);
      if (raw) {
        window.__harnessLoadSave(raw);
      } else {
        console.warn('[harness] ?loadId=', loadId, 'not found in localStorage');
      }
    } catch (e) {
      console.error('[harness] ?loadId= read failed', e);
    }
  }
})();
