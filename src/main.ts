import './styles.css';
import { renderWorld } from './render/render';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from './sim/save';
import {
  buyMaterialsDetailed,
  buyRawFoodDetailed,
  canExpandDirection,
  clearBodies,
  createInitialState,
  expandMap,
  fireCrew,
  getHousingInspectorAt,
  getRoomDiagnosticAt,
  getRoomInspectorAt,
  getResidentInspectorById,
  getVisitorInspectorById,
  getNextExpansionCost,
  getDockByTile,
  hireCrew,
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
  tryPlaceModule,
  trySetTile,
  getCrewPriorityPresetWeights,
  validateDockPlacement
} from './sim/sim';
import {
  type CardinalDirection,
  type CrewPriorityPreset,
  type CrewPrioritySystem,
  type SpaceLane,
  type ShipSize,
  type HousingPolicy,
  ModuleType,
  RoomType,
  TILE_SIZE,
  TileType,
  ZoneType,
  clamp,
  fromIndex,
  inBounds,
  toIndex,
  type BuildTool
} from './sim/types';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root not found');

app.innerHTML = `
  <div id="topbar">
    <button id="open-save-modal" class="topbar-btn">Save / Load</button>
    <button id="open-market" class="topbar-btn">Market</button>
    <button id="open-expansion-modal" class="topbar-btn">Map Expansion</button>
    <button id="toggle-zones" class="topbar-btn">Zones: OFF</button>
    <button id="toggle-service-nodes" class="topbar-btn">Service Nodes: OFF</button>
    <button id="toggle-inventory-overlay" class="topbar-btn">Inventory Overlay: OFF</button>
    <span class="topbar-spacer"></span>
    <button id="camera-reset" class="topbar-btn">Fit Map</button>
  </div>
  <div id="game-wrap">
    <div id="game-stage">
      <canvas id="game"></canvas>
    </div>
  </div>
  <aside id="panel">
    <h1>Station / Colony Sim MVP</h1>

    <div class="section panel-first top-controls">
      <div class="transport-row">
        <button id="play" class="icon-btn transport-btn" aria-label="Play">&gt;</button>
        <button id="pause" class="icon-btn transport-btn" aria-label="Pause">||</button>
        <button id="speed-up" class="icon-btn transport-btn" aria-label="Speed Up">&gt;&gt;</button>
        <span class="value speed-pill" id="speed-label">1x</span>
      </div>
    </div>

    <details class="section mini-collapse">
      <summary class="legend-title">Build & Room Legend</summary>
      <div class="legend-grid">
        <div class="legend-item"><span class="chip chip-caf"></span><span>Cafeteria (C) <kbd>C</kbd></span></div>
        <div class="legend-item"><span class="chip chip-caf"></span><span>Kitchen (I) <kbd>I</kbd></span></div>
        <div class="legend-item"><span class="chip chip-reactor"></span><span>Workshop (W) <kbd>W</kbd></span></div>
        <div class="legend-item"><span class="chip chip-reactor"></span><span>Reactor (R) <kbd>R</kbd></span></div>
        <div class="legend-item"><span class="chip chip-security"></span><span>Security (S) <kbd>S</kbd></span></div>
        <div class="legend-item"><span class="chip chip-dorm"></span><span>Dorm (D) <kbd>D</kbd></span></div>
        <div class="legend-item"><span class="chip chip-hygiene"></span><span>Hygiene (H) <kbd>H</kbd></span></div>
        <div class="legend-item"><span class="chip chip-hydro"></span><span>Hydroponics (F) <kbd>F</kbd></span></div>
        <div class="legend-item"><span class="chip chip-life"></span><span>Life Support (L) <kbd>L</kbd></span></div>
        <div class="legend-item"><span class="chip chip-lounge"></span><span>Lounge (U) <kbd>U</kbd></span></div>
        <div class="legend-item"><span class="chip chip-market"></span><span>Market (K) <kbd>K</kbd></span></div>
        <div class="legend-item"><span class="chip chip-market"></span><span>Logistics Stock (N) <kbd>N</kbd></span></div>
        <div class="legend-item"><span class="chip chip-market"></span><span>Storage (B) <kbd>B</kbd></span></div>
      </div>
      <small class="legend-build">
        Build: <kbd>1</kbd> Floor, <kbd>2</kbd> Wall, <kbd>3</kbd> Dock, <kbd>4</kbd> Door, <kbd>7</kbd> Erase Tile<br />
        Zone paint: <kbd>8</kbd> Public, <kbd>9</kbd> Restricted, <kbd>0</kbd> Clear Room
      </small>
      <small class="legend-build">
        Modules: <kbd>Q</kbd> Bed, <kbd>T</kbd> Table, <kbd>5</kbd> Serving, <kbd>V</kbd> Stove, <kbd>P</kbd> Workbench, <kbd>G</kbd> Grow, <kbd>M</kbd> Terminal, <kbd>6</kbd> Couch, <kbd>=</kbd> Game, <kbd>;</kbd> Shower, <kbd>'</kbd> Sink, <kbd>-</kbd> Stall, <kbd>,</kbd> Intake, <kbd>.</kbd> Rack, <kbd>X</kbd> Clear Module, <kbd>[</kbd>/<kbd>]</kbd> Rotate
      </small>
      <small id="module-guide" class="legend-build">
        Module guide: Bed->Dorm, Table/Serving->Cafeteria, Stove->Kitchen, Workbench->Workshop, Grow->Hydroponics
      </small>
      <small id="module-phase-note" class="legend-build">
        Readiness checks use size + required modules + door + pressure + path. Rooms are autonomous once ready.
      </small>
    </details>

    <details class="section mini-collapse">
      <summary class="legend-title">Core Status</summary>
      <div class="row compact list-row"><span>Economy</span><span class="value" id="economy">Materials 0 | Credits 0</span></div>
      <div class="row compact list-row"><span>Air / Hull</span><span class="value" id="pressure">0% sealed | 0 leaking tiles</span></div>
      <div class="row compact list-row"><span>Power</span><span class="value" id="power">0 / 0</span></div>
      <div class="row compact list-row"><span>Crew Morale</span><span class="value" id="morale">0</span></div>
      <div class="row compact list-row"><span>Station Rating</span><span class="value" id="station-rating">70</span></div>
      <small id="air-trend">Air trend: +0.0/s</small>
      <small id="air-blocked-warning">Air warning: none</small>
    </details>

    <details class="section mini-collapse">
      <summary class="legend-title">Logistics & Economy</summary>
      <div class="row compact list-row"><span>Resources</span><span class="value" id="resources">Food 0 | Water 0 | Air 0%</span></div>
      <small id="food-flow">Food flow: +0.0 raw/s -> +0.0 meals/s, use 0.0 meals/s</small>
      <small id="economy-flow">Credits/min: +0.0 gross | -0.0 payroll | net +0.0</small>
      <div class="row compact list-row"><span>Jobs</span><span class="value" id="jobs">P0 A0 X0 D0 | none</span></div>
      <details class="mini-collapse">
        <summary>Job Diagnostics</summary>
        <small id="jobs-extra">Avg age 0.0s | Oldest 0.0s | Delivery 0.0s | Stalled 0</small>
        <small id="idle-reasons">Idle reasons: available 0 | no jobs 0 | resting 0 | no path 0 | waiting 0</small>
        <small id="stall-reasons">Stalls: blocked 0 | src 0 | dst 0 | supply 0</small>
        <small id="crew-retargets">Crew retargets/min: 0.0 | visitor service fails/min: 0.0</small>
        <small id="food-chain-hint">Food chain: none</small>
        <small id="room-warnings">Room warnings: none</small>
      </details>
    </details>

    <details class="section mini-collapse">
      <summary class="legend-title">Visitor Traffic</summary>
      <div class="row compact list-row"><span>Visitors</span><span class="value" id="visitors">0</span></div>
      <small id="visitor-feelings">Visitor feelings: none</small>
      <small id="demand-strip">Current demand: Caf 0% | Market 0% | Lounge 0%</small>
      <small id="archetype-strip">Visitors: Diner 0 | Shopper 0 | Lounger 0 | Rusher 0</small>
      <small id="ship-type-strip">Ships/min: Tour 0.0 | Trade 0.0 | Ind 0.0</small>
      <div class="row compact list-row"><span>Docked ships</span><span class="value" id="docked-ships">0</span></div>
      <div class="row compact list-row"><span>Avg dock time</span><span class="value" id="avg-dock-time">0.0s</span></div>
      <div class="row compact list-row"><span>Bay utilization</span><span class="value" id="bay-utilization">0%</span></div>
      <div class="row compact list-row"><span>Exits / min</span><span class="value" id="exits-per-min">0</span></div>
      <small id="lane-queues">Lane queues N/E/S/W: 0/0/0/0</small>
      <small id="walk-stats">Visitor walk avg: 0.0</small>
      <small id="berth-summary">Berths: visitor 0/0 | resident 0/0 | resident ships 0</small>
      <small id="resident-loop-summary">Resident loop: convert 0/0 | departures 0 | tax +0.0/min</small>
      <details class="mini-collapse">
        <summary>Station Rating Insight</summary>
        <small id="rating-insight-trend">Trend: +0.0/min (stable)</small>
        <small id="rating-insight-rate">Penalty/min: timeout 0.0 | no dock 0.0 | service 0.0 | walk 0.0</small>
        <small id="rating-insight-bonus">Bonus/min: meals 0.0 | leisure 0.0 | exits 0.0 | residents 0.0</small>
        <small id="rating-insight-service">Service/min: no path 0.0 | missing services 0.0 | patience bail 0.0 | dock timeout 0.0 | trespass 0.0</small>
        <small id="rating-insight-total">Total penalty: timeout 0.0 | no dock 0.0 | service 0.0 | walk 0.0</small>
        <small id="rating-insight-bonus-total">Total bonus: meals 0.0 | leisure 0.0 | exits 0.0 | residents 0.0</small>
        <small id="rating-insight-service-total">Service total: no path 0.0 | missing services 0.0 | patience bail 0.0 | dock timeout 0.0 | trespass 0.0</small>
        <small id="rating-insight-events">Events: skipped docks 0 | queue timeouts 0 | service fails/min 0.0</small>
      </details>
      <small id="dock-info">Dock: none selected</small>
      <small id="dock-preview">Dock preview: n/a</small>
    </details>

    <details class="section mini-collapse">
      <summary class="legend-title">Population & Services</summary>
      <div class="row compact list-row"><span>Crew</span><span class="value" id="crew">0 / 0 (free 0)</span></div>
      <div class="row compact list-row"><span>Station Systems</span><span class="value" id="ops">Cafeteria 0/0 | Security 0/0 | Reactor 0/0 | Dorms 0/0</span></div>
      <div class="row compact list-row"><span>Incidents</span><span class="value" id="incidents">0</span></div>
      <small id="life-support-status">Life support: active 0 / total 0 (air +0.0/s)</small>
      <small id="air-health">Air health: distressed 0 | critical 0 | deaths 0 (+0 recent)</small>
      <details class="mini-collapse">
        <summary>Advanced Ops</summary>
        <small id="morale-reasons">Crew morale drivers: none</small>
        <small id="rating-reasons">Station rating drivers: none</small>
        <small id="crew-breakdown">Crew: work 0 | idle 0 | resting 0 | logistics 0 | blocked 0</small>
        <small id="crew-shifts">Shifts: resting 0/0 | wake budget 0 | woken 0</small>
        <small id="crew-lockouts">Emergency lockouts prevented: 0</small>
        <small id="critical-staffing-line">Critical staffing: R 0/0/0 | LS 0/0/0 | HY 0/0/0 | KI 0/0/0 | CF 0/0/0</small>
        <small id="ops-extra">Kitchen 0/0 | Workshop 0/0 | Hygiene 0/0 | Hydroponics 0/0 | Life Support 0/0 | Lounge 0/0 | Market 0/0</small>
        <small id="kitchen-status">Kitchen: active 0/0 | raw 0.0 | meal +0.0/s</small>
        <small id="trade-status">Trade: workshop +0.0/s | market use 0.0/s | stock 0.0 | sold/min 0.0 | stockouts/min 0.0</small>
        <small id="room-usage">Usage: to dorm 0 | resting 0 | hygiene 0 | queue 0 | eating 0 | hydro staff 0/0</small>
        <small id="room-flow">Flow/min: dorm 0.0 | hygiene 0.0 | meals 0.0 | dorm fail 0.0</small>
      </details>
      <button id="clear-bodies">Clear Bodies (-6 materials)</button>
      <button id="edit-priorities">Edit Priorities</button>
      <div class="row compact list-row"><span>Crew Mgmt</span><span class="value" id="crew-note">Payroll 0.32c/crew/30s</span></div>
    </details>

    <details class="section mini-collapse">
      <summary class="legend-title">Traffic & Tax</summary>
      <div class="row"><span>Ships / cycle</span><span class="value" id="ships-label">1</span></div>
      <input type="range" id="ships" min="0" max="3" step="1" value="1" />
      <div class="row" style="margin-top:8px;"><span>Visitor Tax Rate</span><span class="value" id="tax-label">20%</span></div>
      <input type="range" id="tax" min="0" max="50" step="1" value="20" />
    </details>

    <details class="section mini-collapse">
      <summary class="legend-title">Build Guidance</summary>
      <small>Drag to paint rectangle (Prison Architect style)</small>
      <small id="paint-guidance">Paint guidance: larger rooms need enough service modules and more than one door.</small>
      <small id="room-diagnostic">Inspect room: hover a room tile</small>
    </details>
  </aside>
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
      </div>
      <small>Export selected save (copy/paste JSON):</small>
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
      <small id="room-modal-reasons">Inactive reasons: none</small>
      <small id="room-modal-warnings">Warnings: none</small>
      <small id="room-modal-hints">Hints: none</small>
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

const ctxMaybe = canvas.getContext('2d');
if (!ctxMaybe) throw new Error('2d context unavailable');
const ctx: CanvasRenderingContext2D = ctxMaybe;

const state = createInitialState();
let zoom = 1;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.5;
const FIT_MIN_ZOOM = 0.1;
const EXPANSION_STEP_TILES = 40;
const PAN_PADDING_MIN = 260;
let mapOffsetX = 0;
let mapOffsetY = 0;

function applyCanvasSize(): void {
  const worldWidthPx = state.width * TILE_SIZE;
  const worldHeightPx = state.height * TILE_SIZE;
  canvas.width = worldWidthPx;
  canvas.height = worldHeightPx;
  canvas.style.width = `${Math.round(worldWidthPx * zoom)}px`;
  canvas.style.height = `${Math.round(worldHeightPx * zoom)}px`;
}
applyCanvasSize();

const shipsInput = document.querySelector<HTMLInputElement>('#ships')!;
const shipsLabel = document.querySelector<HTMLSpanElement>('#ships-label')!;
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
const visitorsEl = document.querySelector<HTMLSpanElement>('#visitors')!;
const moraleEl = document.querySelector<HTMLSpanElement>('#morale')!;
const stationRatingEl = document.querySelector<HTMLSpanElement>('#station-rating')!;
const visitorFeelingsEl = document.querySelector<HTMLElement>('#visitor-feelings')!;
const crewEl = document.querySelector<HTMLSpanElement>('#crew')!;
const opsEl = document.querySelector<HTMLSpanElement>('#ops')!;
const opsExtraEl = document.querySelector<HTMLElement>('#ops-extra')!;
const moraleReasonsEl = document.querySelector<HTMLElement>('#morale-reasons')!;
const ratingReasonsEl = document.querySelector<HTMLElement>('#rating-reasons')!;
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
const priorityModal = document.querySelector<HTMLDivElement>('#priority-modal')!;
const closePriorityBtn = document.querySelector<HTMLButtonElement>('#close-priority')!;
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
const agentModal = document.querySelector<HTMLDivElement>('#agent-modal')!;
const closeAgentBtn = document.querySelector<HTMLButtonElement>('#close-agent')!;
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
const roomDiagnosticEl = document.querySelector<HTMLElement>('#room-diagnostic')!;
const paintGuidanceEl = document.querySelector<HTMLElement>('#paint-guidance')!;
const moduleGuideEl = document.querySelector<HTMLElement>('#module-guide')!;
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

const moduleRoomHint: Record<ModuleType, string> = {
  [ModuleType.None]: 'clear module marker',
  [ModuleType.Bed]: 'Dorm',
  [ModuleType.Table]: 'Cafeteria',
  [ModuleType.ServingStation]: 'Cafeteria',
  [ModuleType.Stove]: 'Kitchen',
  [ModuleType.Workbench]: 'Workshop',
  [ModuleType.GrowStation]: 'Hydroponics',
  [ModuleType.Terminal]: 'Security',
  [ModuleType.Couch]: 'Lounge',
  [ModuleType.GameStation]: 'Lounge',
  [ModuleType.Shower]: 'Hygiene',
  [ModuleType.Sink]: 'Hygiene',
  [ModuleType.MarketStall]: 'Market',
  [ModuleType.IntakePallet]: 'LogisticsStock',
  [ModuleType.StorageRack]: 'Storage'
};

const simSpeeds: Array<1 | 2 | 4> = [1, 2, 4];
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

type SelectedAgent = { kind: 'visitor' | 'resident'; id: number };

let currentTool: BuildTool = { kind: 'tile', tile: TileType.Floor };
let selectedDockId: number | null = null;
let selectedRoomTile: number | null = null;
let selectedAgent: SelectedAgent | null = null;
let isPainting = false;
let paintStart: { x: number; y: number } | null = null;
let paintCurrent: { x: number; y: number } | null = null;
let hoveredTile: number | null = null;
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
  const mapDisplayWidth = canvas.clientWidth;
  const mapDisplayHeight = canvas.clientHeight;
  const padX = Math.max(PAN_PADDING_MIN, Math.round(gameWrap.clientWidth * 0.75));
  const padY = Math.max(PAN_PADDING_MIN, Math.round(gameWrap.clientHeight * 0.75));
  mapOffsetX = padX;
  mapOffsetY = padY;
  gameStage.style.width = `${Math.round(mapDisplayWidth + padX * 2)}px`;
  gameStage.style.height = `${Math.round(mapDisplayHeight + padY * 2)}px`;
  canvas.style.left = `${mapOffsetX}px`;
  canvas.style.top = `${mapOffsetY}px`;
}

function getViewportCenterWorldPx(): { x: number; y: number } {
  return {
    x: (gameWrap.scrollLeft + gameWrap.clientWidth * 0.5 - mapOffsetX) / zoom,
    y: (gameWrap.scrollTop + gameWrap.clientHeight * 0.5 - mapOffsetY) / zoom
  };
}

function centerViewportOnWorldPx(worldX: number, worldY: number): void {
  gameWrap.scrollLeft = mapOffsetX + worldX * zoom - gameWrap.clientWidth * 0.5;
  gameWrap.scrollTop = mapOffsetY + worldY * zoom - gameWrap.clientHeight * 0.5;
  clampViewportScroll();
}

function centerViewportOnMapCenter(): void {
  const mapCenterX = canvas.clientWidth * 0.5;
  const mapCenterY = canvas.clientHeight * 0.5;
  gameWrap.scrollLeft = mapOffsetX + mapCenterX - gameWrap.clientWidth * 0.5;
  gameWrap.scrollTop = mapOffsetY + mapCenterY - gameWrap.clientHeight * 0.5;
  clampViewportScroll();
}

function fitMapToViewport(): void {
  const worldWidthPx = state.width * TILE_SIZE;
  const worldHeightPx = state.height * TILE_SIZE;
  if (worldWidthPx <= 0 || worldHeightPx <= 0) return;
  const fitZoom = Math.min(gameWrap.clientWidth / worldWidthPx, gameWrap.clientHeight / worldHeightPx);
  zoom = clamp(fitZoom, FIT_MIN_ZOOM, MAX_ZOOM);
  applyCanvasSize();
  updateStageLayout();
  centerViewportOnMapCenter();
}

function setZoomAtViewportPoint(nextZoom: number, viewportX: number, viewportY: number): void {
  const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  if (Math.abs(clampedZoom - zoom) < 0.0001) return;
  const worldX = (gameWrap.scrollLeft + viewportX - mapOffsetX) / zoom;
  const worldY = (gameWrap.scrollTop + viewportY - mapOffsetY) / zoom;
  zoom = clampedZoom;
  applyCanvasSize();
  updateStageLayout();
  gameWrap.scrollLeft = mapOffsetX + worldX * zoom - viewportX;
  gameWrap.scrollTop = mapOffsetY + worldY * zoom - viewportY;
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
  updateStageLayout();
  centerViewportOnMapCenter();
});

cameraResetBtn.addEventListener('click', () => {
  fitMapToViewport();
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

function toDisplaySaveJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function getSelectedSave(store: SaveStore): LocalSaveRecord | null {
  const selectedId = saveSlotSelect.value;
  if (!selectedId) return null;
  return store.saves.find((save) => save.id === selectedId) ?? null;
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
    saveCountEl.textContent = String(saves.length);
    const selected = getSelectedSave({ storeVersion: 1, saves });
    saveExportTextarea.value = selected ? toDisplaySaveJson(selected.payloadText) : '';
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
  marketModal.classList.add('hidden');
  expansionModal.classList.add('hidden');
  priorityModal.classList.add('hidden');
  dockModal.classList.add('hidden');
  roomModal.classList.add('hidden');
  agentModal.classList.add('hidden');
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
  dockModalSmallCheckbox.checked = dock.allowedShipSizes.includes('small');
  dockModalMediumCheckbox.checked = dock.allowedShipSizes.includes('medium');
  dockModalLargeCheckbox.checked = dock.allowedShipSizes.includes('large');
  dockModalSmallCheckbox.disabled = !canEnableSize('small', dock.maxSizeByArea);
  dockModalMediumCheckbox.disabled = !canEnableSize('medium', dock.maxSizeByArea);
  dockModalLargeCheckbox.disabled = !canEnableSize('large', dock.maxSizeByArea);
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
  roomModalFlowEl.textContent = `Flow: ${inspector.flowHints?.join(' | ') || 'n/a'}`;
  roomModalFlowEl.style.color = '#8ea2bd';
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
  roomModalReasonsEl.textContent = `Inactive reasons: ${inspector.reasons.join(', ') || 'none'}`;
  roomModalWarningsEl.textContent = `Warnings: ${inspector.warnings.join(', ') || 'none'}`;
  roomModalHintsEl.textContent = `Hints: ${inspector.hints.join(' | ') || 'none'}`;
}

function toTileCoords(clientX: number, clientY: number): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
  const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
  const canvasX = (clientX - rect.left) * scaleX;
  const canvasY = (clientY - rect.top) * scaleY;
  const x = Math.floor(canvasX / TILE_SIZE);
  const y = Math.floor(canvasY / TILE_SIZE);
  if (!inBounds(x, y, state.width, state.height)) return null;
  return { x, y };
}

function toWorldCoords(clientX: number, clientY: number): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
  const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
  const canvasX = (clientX - rect.left) * scaleX;
  const canvasY = (clientY - rect.top) * scaleY;
  const worldX = canvasX / TILE_SIZE;
  const worldY = canvasY / TILE_SIZE;
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
  const maxDistance = 0.55;
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
  if (best) return best.candidate;
  const residentOnTile = state.residents.find((resident) => resident.tileIndex === clickedTile);
  if (residentOnTile) return { kind: 'resident', id: residentOnTile.id };
  const visitorOnTile = state.visitors.find((visitor) => visitor.tileIndex === clickedTile);
  if (visitorOnTile) return { kind: 'visitor', id: visitorOnTile.id };
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
    `social ${inspector.social.toFixed(1)} | safety ${inspector.safety.toFixed(1)} | routine ${inspector.routinePhase} | ` +
    `stress ${inspector.stress.toFixed(1)} | agi ${inspector.agitation.toFixed(1)} | confront ${inspector.inConfrontation ? 'yes' : 'no'} | ` +
    `satisfaction ${inspector.satisfaction.toFixed(1)} | leave ${inspector.leaveIntent.toFixed(1)} | ` +
    `dominant ${inspector.dominantNeed} | home dock ${inspector.homeDockId ?? 'none'} | bed ${inspector.bedModuleId ?? 'none'}`;
  return true;
}

function isTextInputTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return el.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
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
      } else if (currentTool.kind === 'room' && state.tiles[idx] !== TileType.Space) {
        setRoom(state, idx, currentTool.room!);
      } else if (currentTool.kind === 'module' && state.tiles[idx] !== TileType.Space) {
        if (currentTool.module === ModuleType.None) {
          removeModuleAtTile(state, idx);
        } else {
          tryPlaceModule(state, currentTool.module!, idx, state.controls.moduleRotation);
        }
      }
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
  updateStageLayout();
  centerViewportOnWorldPx(center.x, center.y);
});

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || isRightPanning) return;
  const tile = toTileCoords(e.clientX, e.clientY);
  if (!tile) return;
  const canOpenInspectors = currentTool.kind === 'none';
  if (!canOpenInspectors) {
    selectedDockId = null;
    selectedRoomTile = null;
    selectedAgent = null;
    dockModal.classList.add('hidden');
    roomModal.classList.add('hidden');
    agentModal.classList.add('hidden');
  }
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
    if (canOpenInspectors && singleClick && clickedTile !== null) {
      const world = toWorldCoords(e.clientX, e.clientY);
      if (world) {
        const agent = pickInspectableAgent(world.x, world.y, clickedTile);
        if (agent) {
          selectedAgent = agent;
          selectedDockId = null;
          selectedRoomTile = null;
          if (refreshAgentModal()) {
            agentModal.classList.remove('hidden');
          } else {
            selectedAgent = null;
            agentModal.classList.add('hidden');
          }
          dockModal.classList.add('hidden');
          roomModal.classList.add('hidden');
          isPainting = false;
          paintStart = null;
          paintCurrent = null;
          return;
        }
      }

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
      dockModal.classList.add('hidden');
      roomModal.classList.add('hidden');
    } else {
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
    case 'x':
    case 'X':
      currentTool = { kind: 'module', module: ModuleType.None };
      break;
    case 'q':
    case 'Q':
      currentTool = { kind: 'module', module: ModuleType.Bed };
      break;
    case 't':
    case 'T':
      currentTool = { kind: 'module', module: ModuleType.Table };
      break;
    case 'v':
    case 'V':
      currentTool = { kind: 'module', module: ModuleType.Stove };
      break;
    case 'p':
    case 'P':
      currentTool = { kind: 'module', module: ModuleType.Workbench };
      break;
    case 'g':
    case 'G':
      currentTool = { kind: 'module', module: ModuleType.GrowStation };
      break;
    case 'm':
    case 'M':
      currentTool = { kind: 'module', module: ModuleType.Terminal };
      break;
    case '5':
      currentTool = { kind: 'module', module: ModuleType.ServingStation };
      break;
    case '6':
      currentTool = { kind: 'module', module: ModuleType.Couch };
      break;
    case '=':
      currentTool = { kind: 'module', module: ModuleType.GameStation };
      break;
    case ';':
      currentTool = { kind: 'module', module: ModuleType.Shower };
      break;
    case "'":
      currentTool = { kind: 'module', module: ModuleType.Sink };
      break;
    case '-':
      currentTool = { kind: 'module', module: ModuleType.MarketStall };
      break;
    case ',':
      currentTool = { kind: 'module', module: ModuleType.IntakePallet };
      break;
    case '.':
      currentTool = { kind: 'module', module: ModuleType.StorageRack };
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
    case 'i':
    case 'I':
      currentTool = { kind: 'room', room: RoomType.Kitchen };
      break;
    case 'w':
    case 'W':
      currentTool = { kind: 'room', room: RoomType.Workshop };
      break;
    case 'f':
    case 'F':
      currentTool = { kind: 'room', room: RoomType.Hydroponics };
      break;
    case 'l':
    case 'L':
      currentTool = { kind: 'room', room: RoomType.LifeSupport };
      break;
    case 'u':
    case 'U':
      currentTool = { kind: 'room', room: RoomType.Lounge };
      break;
    case 'k':
    case 'K':
      currentTool = { kind: 'room', room: RoomType.Market };
      break;
    case 'r':
    case 'R':
      currentTool = { kind: 'room', room: RoomType.Reactor };
      break;
    case 's':
    case 'S':
      currentTool = { kind: 'room', room: RoomType.Security };
      break;
    case 'n':
    case 'N':
      currentTool = { kind: 'room', room: RoomType.LogisticsStock };
      break;
    case 'b':
    case 'B':
      currentTool = { kind: 'room', room: RoomType.Storage };
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
      break;
    case '8':
      currentTool = { kind: 'zone', zone: ZoneType.Public };
      break;
    case '9':
      currentTool = { kind: 'zone', zone: ZoneType.Restricted };
      break;
    case ' ':
      state.controls.paused = !state.controls.paused;
      refreshTransportUi();
      break;
    case 'Escape':
      saveModal.classList.add('hidden');
      marketModal.classList.add('hidden');
      expansionModal.classList.add('hidden');
      priorityModal.classList.add('hidden');
      dockModal.classList.add('hidden');
      roomModal.classList.add('hidden');
      currentTool = { kind: 'none' };
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
  state.controls.shipsPerCycle = clamp(parseInt(shipsInput.value, 10), 0, 3);
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

toggleZonesBtn.addEventListener('click', () => {
  state.controls.showZones = !state.controls.showZones;
});

toggleServiceNodesBtn.addEventListener('click', () => {
  state.controls.showServiceNodes = !state.controls.showServiceNodes;
});

toggleInventoryOverlayBtn.addEventListener('click', () => {
  state.controls.showInventoryOverlay = !state.controls.showInventoryOverlay;
});

openSaveModalBtn.addEventListener('click', () => {
  refreshSaveUi();
  saveModal.classList.remove('hidden');
});

closeSaveModalBtn.addEventListener('click', () => {
  saveModal.classList.add('hidden');
});

saveModal.addEventListener('click', (e) => {
  if (e.target === saveModal) {
    saveModal.classList.add('hidden');
  }
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

openExpansionModalBtn.addEventListener('click', () => {
  refreshExpansionUi();
  expansionModal.classList.remove('hidden');
});

closeExpansionModalBtn.addEventListener('click', () => {
  expansionModal.classList.add('hidden');
});

expansionModal.addEventListener('click', (e) => {
  if (e.target === expansionModal) {
    expansionModal.classList.add('hidden');
  }
});

editPrioritiesBtn.addEventListener('click', () => {
  refreshPriorityUi();
  priorityModal.classList.remove('hidden');
});

closePriorityBtn.addEventListener('click', () => {
  priorityModal.classList.add('hidden');
});

priorityModal.addEventListener('click', (e) => {
  if (e.target === priorityModal) {
    priorityModal.classList.add('hidden');
  }
});

closeDockBtn.addEventListener('click', () => {
  dockModal.classList.add('hidden');
});

dockModal.addEventListener('click', (e) => {
  if (e.target === dockModal) {
    dockModal.classList.add('hidden');
  }
});

closeRoomBtn.addEventListener('click', () => {
  selectedRoomTile = null;
  roomModal.classList.add('hidden');
});

roomModal.addEventListener('click', (e) => {
  if (e.target === roomModal) {
    selectedRoomTile = null;
    roomModal.classList.add('hidden');
  }
});

closeAgentBtn.addEventListener('click', () => {
  selectedAgent = null;
  agentModal.classList.add('hidden');
});

agentModal.addEventListener('click', (e) => {
  if (e.target === agentModal) {
    selectedAgent = null;
    agentModal.classList.add('hidden');
  }
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

dockModalTouristCheckbox.addEventListener('change', () => {
  if (selectedDockId === null) return;
  setDockAllowedShipType(state, selectedDockId, 'tourist', dockModalTouristCheckbox.checked);
  refreshDockModal();
});

dockModalTraderCheckbox.addEventListener('change', () => {
  if (selectedDockId === null) return;
  setDockAllowedShipType(state, selectedDockId, 'trader', dockModalTraderCheckbox.checked);
  refreshDockModal();
});

dockModalIndustrialCheckbox.addEventListener('change', () => {
  if (selectedDockId === null) return;
  setDockAllowedShipType(state, selectedDockId, 'industrial', dockModalIndustrialCheckbox.checked);
  refreshDockModal();
});

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

dockModalSmallCheckbox.addEventListener('change', () => {
  if (selectedDockId === null) return;
  setDockAllowedShipSize(state, selectedDockId, 'small', dockModalSmallCheckbox.checked);
  refreshDockModal();
});

dockModalMediumCheckbox.addEventListener('change', () => {
  if (selectedDockId === null) return;
  setDockAllowedShipSize(state, selectedDockId, 'medium', dockModalMediumCheckbox.checked);
  refreshDockModal();
});

dockModalLargeCheckbox.addEventListener('change', () => {
  if (selectedDockId === null) return;
  setDockAllowedShipSize(state, selectedDockId, 'large', dockModalLargeCheckbox.checked);
  refreshDockModal();
});

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
    Object.assign(state, hydrated.state);
    applyCanvasSize();
    updateStageLayout();
    centerViewportOnMapCenter();
    clearUiSelectionsAfterLoad();
    syncControlsToUiFromState();
    refreshExpansionUi();
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
  saveExportTextarea.value = selected ? toDisplaySaveJson(selected.payloadText) : '';
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
  marketNoteEl.textContent = result.ok
    ? 'Purchased +25 materials'
    : result.reason === 'insufficient_credits'
      ? 'Not enough credits'
      : result.reason === 'no_logistics_stock'
        ? 'Need Logistics Stock + Intake Pallet'
        : `Not enough intake capacity (free ${result.freeCapacity.toFixed(1)}, need ${result.requiredAmount.toFixed(1)})`;
});

buyLargeBtn.addEventListener('click', () => {
  const result = buyMaterialsDetailed(state, market.buyMat80Cost, 80);
  marketNoteEl.textContent = result.ok
    ? 'Purchased +80 materials'
    : result.reason === 'insufficient_credits'
      ? 'Not enough credits'
      : result.reason === 'no_logistics_stock'
        ? 'Need Logistics Stock + Intake Pallet'
        : `Not enough intake capacity (free ${result.freeCapacity.toFixed(1)}, need ${result.requiredAmount.toFixed(1)})`;
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
    marketNoteEl.textContent = 'Need 6 materials to clear bodies';
  }
});

let lastTime = performance.now();
const UI_REFRESH_INTERVAL_MS = 125;
const HOVER_DIAGNOSTIC_REFRESH_INTERVAL_MS = 250;
let nextUiRefreshAt = 0;
let nextHoverDiagnosticRefreshAt = 0;
let lastHoverDiagnosticTile: number | null = null;
let cachedHoverDiagnostic: ReturnType<typeof getRoomDiagnosticAt> = null;
function frame(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  tick(state, dt);
  const renderStart = performance.now();
  renderWorld(ctx, state, currentTool, hoveredTile);
  state.metrics.renderMs = performance.now() - renderStart;
  toggleZonesBtn.textContent = state.controls.showZones ? 'Zones: ON' : 'Zones: OFF';
  toggleServiceNodesBtn.textContent = state.controls.showServiceNodes ? 'Service Nodes: ON' : 'Service Nodes: OFF';
  toggleInventoryOverlayBtn.textContent = state.controls.showInventoryOverlay
    ? 'Inventory Overlay: ON'
    : 'Inventory Overlay: OFF';

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

  visitorsEl.textContent = String(state.metrics.visitorsCount);
  moraleEl.textContent = `${Math.round(state.metrics.morale)}%`;
  stationRatingEl.textContent = `${Math.round(state.metrics.stationRating)} (${state.metrics.stationRatingTrendPerMin >= 0 ? '+' : ''}${state.metrics.stationRatingTrendPerMin.toFixed(1)}/min)`;
  moraleEl.style.color =
    state.metrics.morale > 65 ? '#6edb8f' : state.metrics.morale > 40 ? '#ffcf6e' : '#ff7676';
  stationRatingEl.style.color =
    state.metrics.stationRating > 70 ? '#6edb8f' : state.metrics.stationRating > 40 ? '#ffcf6e' : '#ff7676';
  visitorFeelingsEl.textContent = `Visitor feelings: ${state.metrics.stationRatingDrivers.join(' | ') || 'none'}`;
  moraleReasonsEl.textContent = `Crew morale drivers: ${state.metrics.crewMoraleDrivers.join(' | ') || 'none'}`;
  ratingReasonsEl.textContent = `Station rating drivers: ${state.metrics.stationRatingDrivers.join(' | ') || 'none'}`;
  crewEl.textContent = `${state.crew.assigned} / ${state.crew.total} (free ${state.crew.free})`;
  crewBreakdownEl.textContent = `Crew: work ${state.metrics.crewAssignedWorking} | idle ${state.metrics.crewIdleAvailable} | resting ${state.metrics.crewResting} | logistics ${state.metrics.crewOnLogisticsJobs} | blocked ${state.metrics.crewBlockedNoPath}`;
  crewShiftsEl.textContent = `Shifts: resting ${state.metrics.crewRestingNow}/${state.metrics.crewRestCap} | wake budget ${state.metrics.crewEmergencyWakeBudget} | woken ${state.metrics.crewWokenForAir}`;
  crewLockoutsEl.textContent = `Emergency lockouts prevented: ${state.metrics.crewPingPongPreventions}`;
  criticalStaffingLineEl.textContent =
    `Critical staffing R ${state.metrics.activeCriticalStaff.reactor}/${state.metrics.assignedCriticalStaff.reactor}/${state.metrics.requiredCriticalStaff.reactor} | ` +
    `LS ${state.metrics.activeCriticalStaff.lifeSupport}/${state.metrics.assignedCriticalStaff.lifeSupport}/${state.metrics.requiredCriticalStaff.lifeSupport} | ` +
    `HY ${state.metrics.activeCriticalStaff.hydroponics}/${state.metrics.assignedCriticalStaff.hydroponics}/${state.metrics.requiredCriticalStaff.hydroponics} | ` +
    `KI ${state.metrics.activeCriticalStaff.kitchen}/${state.metrics.assignedCriticalStaff.kitchen}/${state.metrics.requiredCriticalStaff.kitchen} | ` +
    `CF ${state.metrics.activeCriticalStaff.cafeteria}/${state.metrics.assignedCriticalStaff.cafeteria}/${state.metrics.requiredCriticalStaff.cafeteria}`;
  opsEl.textContent = `Cafeteria ${state.ops.cafeteriasActive}/${state.ops.cafeteriasTotal} | Security ${state.ops.securityActive}/${state.ops.securityTotal} | Reactor ${state.ops.reactorsActive}/${state.ops.reactorsTotal} | Dorms ${state.ops.dormsActive}/${state.ops.dormsTotal}`;
  opsExtraEl.textContent = `Kitchen ${state.ops.kitchenActive}/${state.ops.kitchenTotal} | Workshop ${state.ops.workshopActive}/${state.ops.workshopTotal} | Hygiene ${state.ops.hygieneActive}/${state.ops.hygieneTotal} | Hydroponics ${state.ops.hydroponicsActive}/${state.ops.hydroponicsTotal} | Life Support ${state.ops.lifeSupportActive}/${state.ops.lifeSupportTotal} | Lounge ${state.ops.loungeActive}/${state.ops.loungeTotal} | Market ${state.ops.marketActive}/${state.ops.marketTotal}`;
  kitchenStatusEl.textContent = `Kitchen: active ${state.ops.kitchenActive}/${state.ops.kitchenTotal} | raw ${state.metrics.kitchenRawBuffer.toFixed(1)} | meal +${state.metrics.kitchenMealProdRate.toFixed(1)}/s`;
  tradeStatusEl.textContent =
    `Trade: workshop +${state.metrics.workshopTradeGoodProdRate.toFixed(1)}/s | ` +
    `market use ${state.metrics.marketTradeGoodUseRate.toFixed(1)}/s | stock ${state.metrics.marketTradeGoodStock.toFixed(1)} | ` +
    `sold/min ${state.metrics.tradeGoodsSoldPerMin.toFixed(1)} | stockouts/min ${state.metrics.marketStockoutsPerMin.toFixed(1)}`;
  demandStripEl.textContent = `Current demand: Caf ${Math.round(state.metrics.shipDemandCafeteriaPct)}% | Market ${Math.round(state.metrics.shipDemandMarketPct)}% | Lounge ${Math.round(state.metrics.shipDemandLoungePct)}%`;
  archetypeStripEl.textContent = `Visitors: Diner ${state.metrics.visitorsByArchetype.diner} | Shopper ${state.metrics.visitorsByArchetype.shopper} | Lounger ${state.metrics.visitorsByArchetype.lounger} | Rusher ${state.metrics.visitorsByArchetype.rusher}`;
  shipTypeStripEl.textContent =
    `Ships/min: Tour ${state.metrics.shipsByTypePerMin.tourist.toFixed(1)} | ` +
    `Trade ${state.metrics.shipsByTypePerMin.trader.toFixed(1)} | ` +
    `Ind ${state.metrics.shipsByTypePerMin.industrial.toFixed(1)}`;
  roomUsageEl.textContent = `Usage: to dorm ${state.metrics.toDormResidents} | resting ${state.metrics.dormSleepingResidents} | hygiene ${state.metrics.hygieneCleaningResidents} | queue ${state.metrics.cafeteriaQueueingCount} | eating ${state.metrics.cafeteriaEatingCount} | hydro staff ${state.metrics.hydroponicsStaffed}/${state.metrics.hydroponicsActiveGrowNodes} | life nodes ${state.metrics.lifeSupportActiveNodes}`;
  roomFlowEl.textContent = `Flow/min: dorm ${state.metrics.dormVisitsPerMin.toFixed(1)} | hygiene ${state.metrics.hygieneUsesPerMin.toFixed(1)} | meals ${state.metrics.mealsConsumedPerMin.toFixed(1)} | dorm fail ${state.metrics.dormFailedAttemptsPerMin.toFixed(1)} | failed needs H/E/Y ${state.metrics.failedNeedAttemptsHunger}/${state.metrics.failedNeedAttemptsEnergy}/${state.metrics.failedNeedAttemptsHygiene}`;
  resourcesEl.textContent = `Raw Meal ${Math.round(state.metrics.rawFoodStock)} -> Meals ${Math.round(state.metrics.mealStock)} | Water ${Math.round(state.metrics.waterStock)} | Air ${Math.round(state.metrics.airQuality)}%`;
  resourcesEl.style.color = state.metrics.airQuality < 35 ? '#ff7676' : '#d6deeb';
  pressureEl.textContent = `${Math.round(state.metrics.pressurizationPct)}% sealed | ${state.metrics.leakingTiles} leaking tiles`;
  pressureEl.style.color = state.metrics.pressurizationPct > 85 ? '#6edb8f' : state.metrics.pressurizationPct > 60 ? '#ffcf6e' : '#ff7676';
  economyEl.textContent = `Materials ${Math.round(state.metrics.materials)} | Credits ${Math.round(state.metrics.credits)}`;
  economyFlowEl.textContent = `Credits/min: +${state.metrics.creditsGrossPerMin.toFixed(1)} gross | -${state.metrics.creditsPayrollPerMin.toFixed(1)} payroll | net ${state.metrics.creditsNetPerMin >= 0 ? '+' : ''}${state.metrics.creditsNetPerMin.toFixed(1)}`;
  jobsEl.textContent = `P${state.metrics.pendingJobs} A${state.metrics.assignedJobs} X${state.metrics.expiredJobs} D${state.metrics.completedJobs} | ${state.metrics.topBacklogType}`;
  idleReasonsEl.textContent = `Idle reasons: available ${state.metrics.idleCrewByReason.idle_available} | no jobs ${state.metrics.idleCrewByReason.idle_no_jobs} | resting ${state.metrics.idleCrewByReason.idle_resting} | no path ${state.metrics.idleCrewByReason.idle_no_path} | waiting ${state.metrics.idleCrewByReason.idle_waiting_reassign}`;
  stallReasonsEl.textContent = `Stalls: blocked ${state.metrics.stalledJobsByReason.stalled_path_blocked} | src ${state.metrics.stalledJobsByReason.stalled_unreachable_source} | dst ${state.metrics.stalledJobsByReason.stalled_unreachable_dropoff} | supply ${state.metrics.stalledJobsByReason.stalled_no_supply}`;
  crewRetargetsEl.textContent =
    `Crew retargets/min: ${state.metrics.crewRetargetsPerMin.toFixed(1)} | ` +
    `critical drops/min: ${state.metrics.criticalStaffDropsPerMin.toFixed(1)} | ` +
    `dispatch ${state.metrics.logisticsDispatchSlots} | pressure ${(state.metrics.logisticsPressure * 100).toFixed(0)}%`;
  jobsExtraEl.textContent =
    `Avg age ${state.metrics.avgJobAgeSec.toFixed(1)}s | Oldest ${state.metrics.oldestPendingJobAgeSec.toFixed(1)}s | Delivery ${state.metrics.deliveryLatencySec.toFixed(1)}s | Stalled ${state.metrics.stalledJobs} | ` +
    `shortfall sec R ${state.metrics.criticalShortfallSec.reactor.toFixed(1)} LS ${state.metrics.criticalShortfallSec.lifeSupport.toFixed(1)} HY ${state.metrics.criticalShortfallSec.hydroponics.toFixed(1)} KI ${state.metrics.criticalShortfallSec.kitchen.toFixed(1)} CF ${state.metrics.criticalShortfallSec.cafeteria.toFixed(1)}`;
  const foodBlocked =
    state.metrics.topRoomWarnings.find((w) => w.startsWith('critical staffing:')) ??
    state.metrics.topRoomWarnings.find((w) => w.startsWith('food chain blocked:'));
  foodChainHintEl.textContent = `Food chain: ${foodBlocked ?? 'stable'}`;
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
  foodFlowEl.textContent = `Food flow: +${state.metrics.rawFoodProdRate.toFixed(1)} raw/s -> kitchen +${state.metrics.kitchenMealProdRate.toFixed(1)} meals/s, use ${state.metrics.mealUseRate.toFixed(1)} meals/s`;
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
  walkStatsEl.textContent = `Visitor walk avg: ${state.metrics.avgVisitorWalkDistance.toFixed(1)} | skipped docks ${state.metrics.shipsSkippedNoEligibleDock} | queue timeouts ${state.metrics.shipsTimedOutInQueue}`;
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
    `walk ${state.metrics.stationRatingPenaltyPerMin.longWalks.toFixed(2)}`;
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
    `walk ${state.metrics.stationRatingPenaltyTotal.longWalks.toFixed(1)}`;
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
    if (refreshAgentModal()) {
      if (agentModal.classList.contains('hidden')) {
        agentModal.classList.remove('hidden');
      }
    } else {
      selectedAgent = null;
      agentModal.classList.add('hidden');
    }
  } else {
    agentModal.classList.add('hidden');
  }
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

  const diagnostic = cachedHoverDiagnostic;
  if (diagnostic) {
    if (diagnostic.active) {
      const warningSuffix = diagnostic.warnings.length > 0 ? ` | warning: ${diagnostic.warnings.join(', ')}` : '';
      roomDiagnosticEl.textContent = `Inspect room: ${diagnostic.room} active (${diagnostic.clusterSize} tiles)${warningSuffix} | click for details`;
      roomDiagnosticEl.style.color = '#6edb8f';
    } else {
      const warningSuffix = diagnostic.warnings.length > 0 ? ` | warning: ${diagnostic.warnings.join(', ')}` : '';
      roomDiagnosticEl.textContent = `Inspect room: ${diagnostic.room} inactive - ${diagnostic.reasons.join(', ')}${warningSuffix} | click for details`;
      roomDiagnosticEl.style.color = '#ffcf6e';
    }
  } else {
    roomDiagnosticEl.textContent = 'Inspect room: hover a room tile';
    roomDiagnosticEl.style.color = '#8ea2bd';
  }
  }

  requestAnimationFrame(frame);

  if (currentTool.kind === 'module') {
    moduleGuideEl.textContent = `Module guide: ${currentTool.module} -> ${moduleRoomHint[currentTool.module!]} (rot ${state.controls.moduleRotation}deg)`;
  } else {
    moduleGuideEl.textContent =
      'Module guide: Q bed, T table, 5 serving, V stove, P workbench, G grow, M terminal, 6 couch, = game, ; shower, \' sink, - stall, , intake, . rack | rot [ ] | inventory O';
  }

  if (currentTool.kind === 'room' && currentTool.room !== RoomType.None) {
    paintGuidanceEl.textContent =
      'Paint guidance: add enough matching service modules and avoid one-door mega rooms to reduce queue clumping.';
  } else {
    paintGuidanceEl.textContent = 'Paint guidance: larger rooms need enough service modules and more than one door.';
  }
}
requestAnimationFrame(frame);
