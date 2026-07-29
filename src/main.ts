import './styles.css';
import { renderWorld, type ApproachEnvelopePreview, type RenderViewport } from './render/render';
import {
  applyRecoveryAction,
  getAdmissionPressure,
  getFailureEpisodes,
  getStrandedReliefQuote,
  setAdmissionPolicy,
  transferStrandedVisitor
} from './sim/sim';
import { DockEconomyFeedbackLayer, type DockDepartureResult } from './render/dock-economy-feedback';
import { createEmptySpriteAtlas, loadSpriteAtlas, type SpriteAtlas } from './render/sprite-atlas';
import { MODULE_SPRITE_KEYS } from './render/sprite-keys';
import { STAFF_ROLE_SPRITE_KEYS } from './render/sprite-keys-extended';
import {
  attachLegendTooltipHandlers,
} from './render/progression/wire';
import { PROGRESSION_TOOLTIP_COPY } from './sim/content/progression-tooltips';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from './sim/save';
import { UNLOCK_DEFINITIONS } from './sim/content/unlocks';
import {
  SPECIALTY_BRANCH_COMPLETION_REQUIREMENT,
  SPECIALTY_BRANCH_PHASE,
  SPECIALTY_DEFINITIONS,
  STAFF_ROLE_DEFINITIONS,
  STAFF_ROLES,
  SURFACED_STAFF_ROLES,
  isSpecialtyPhaseAvailable,
  specialtyForUnlockedModule
} from './sim/content/command';
import { sigilForFaction } from './sim/system-map';
import { mountCharterScreen } from './ui/charter-screen';
import { mountTitleScreen, type TitleContinueInfo } from './ui/title-screen';
import { mountOpeningEconomyPanels, type OpeningEconomyPanelView } from './ui/opening-economy-panels';
import { marketPolicyEffect } from './sim/opening-economy';
import { computeCharterOperatingForecast } from './sim/site-charter';
import { POD_DEMAND_FAMILIES } from './sim/pod-demand';
import { evaluateOpeningRecipes, futureFacilities, type RecipeStepProgress } from './sim/opening-recipes';
import { shipHullAssetPath, shipHullProfile } from './sim/ship-hulls';
import { deriveInterfaceDiagnosis, setSelectedInterface, type InterfaceDiagnosis } from './sim/interface-diagnosis';
import {
  applyPastedRoomSettings,
  cloneStationStateForLayoutPreview,
  type PastedRoomSetting
} from './sim/layout-stamp';
import type { CapitalProjectId } from './sim/capital-projects';
import {
  acceptOpeningCapitalProject,
  buyImportedTradeGoodsDetailed,
  buyMaterialsDetailed,
  buyPreparedMealsDetailed,
  previewPreparedMealPurchase,
  rebuildDockEntities,
  orderFuelDetailed,
  quoteTravelSuppliesOrder,
  admitTrafficOffer,
  acceptCommercialOffer,
  buyRawFoodDetailed,
  berthCapitalCostForArea,
  buildStationExpansionOnTruss,
  commitBerthFootprint,
  cancelConstructionAtTile,
  canPlaceUtilityUnderlay,
  canExpandDirection,
  clearUtilityUnderlayAt,
  closeCommercialUnit,
  createInitialState,
  diagnoseFoodChain,
  expandMap,
  fireStaffRole,
  getBerthInspectorAt,
  getBerthFacilityAt,
  getCommercialUnitAt,
  getDockingSlotDescriptors,
  getTrafficOfferPreview,
  getCrewInspectorById,
  getCrewFacilityReachability,
  getCrewSustainabilitySummary,
  getCrewWatchStatus,
  getOperatingSchedule,
  getOpeningCapitalProjects,
  getOpeningEconomySummary,
  getPodDemandSummary,
  getPreparedMealInventory,
  type PreparedMealInventory,
  getHousingInspectorAt,
  getLifeSupportTileDiagnostic,
  getAirDuctNetworkDiagnostics,
  getFuelPipeNetworkDiagnostics,
  getWaterPipeNetworkDiagnostics,
  getUtilityUnderlayTileDiagnostic,
  getMaintenanceTileDiagnostic,
  getReputationTileDiagnostic,
  getReputationZoneScores,
  getRoutePressureDiagnostics,
  getRoutePressureTileDiagnostic,
  getRoomDiagnosticAt,
  getRoomEnvironmentTileDiagnostic,
  getRoomInspectorAt,
  getThermalTileDiagnostic,
  getUnlockRequirement,
  getUnlockTier,
  getResidentHousingReadiness,
  getResidentInspectorById,
  getVisitorInspectorById,
  getNextExpansionCost,
  getDockByTile,
  getPodDockFuelSupplyView,
  getSanitationTileDiagnostic,
  getRoomSanitationSummary,
  isModuleUnlocked,
  isCrewHoldingProtectedPost,
  isPortAutoAdmitUnlocked,
  isRoomUnlocked,
  isShipTypeUnlocked,
  isUtilityUnderlayKind,
  hireCrew,
  hireStaffRole,
  generateLaneProfiles,
  holdTrafficOffer,
  openCommercialUnitForOffers,
  planModuleConstruction,
  planStructuralPieceConstruction,
  planTileConstruction,
  previewCommercialOffer,
  quoteMaterialImportCost,
  removeModuleAtTile,
  passTrafficOffer,
  setPortAutoAdmit,
  setPortAutoAdmitPolicy,
  setMarketPricingPolicy,
  setCrewWatchAssignment,
  setCrewHomeWorkplace,
  surgeWorkplace,
  selectSpecialty,
  setDockFacing,
  setDockPurpose,
  setDockAllowedShipType,
  setDockAllowedShipSize,
  setBerthAllowedShipType,
  setBerthAllowedShipSize,
  setBerthCustomsPolicy,
  setBerthScreeningLevel,
  sellMaterials,
  sellRawFood,
  sellModuleAtTile,
  setRoom,
  setRoomHousingPolicy,
  setEmergencyRecall,
  setZone,
  tick,
  setTile,
  setUtilityUnderlayTile,
  tryPlaceModuleWithCredits,
  tryMoveModule,
  trySetTileWithCredits,
  mapConditionSamplesAt,
  MODULE_RESALE_REFUND_RATE,
  validateDockPlacement
} from './sim';
import { MODULE_UNLOCK_TIER, ROOM_UNLOCK_TIER } from './sim/content/unlocks';
import { BERTH_SIZE_MIN, MODULE_DEFINITIONS } from './sim/balance';
import {
  applyColdStartScenario,
  COLD_START_SCENARIO_NAMES
} from './sim/cold-start-scenarios';
import {
  type CardinalDirection,
  type CommercialOffer,
  type CommercialUnit,
  type CrewPrioritySystem,
  type CrewWorkLane,
  type CrewWatchIndex,
  type CrewWatchStatus,
  type DiagnosticOverlay,
  type DockPurpose,
  type BerthScreeningLevel,
  type CustomsPolicy,
  type IncidentEntity,
  type SpaceLane,
  type ShipSize,
  type ShipHullVariant,
  type ShipType,
  type HousingPolicy,
  type ItemType,
  type JobStallReason,
  type JobStatusCounts,
  type ModuleRotation,
  type PlaceableStructuralPieceKind,
  type StationState,
  type TrafficOffer,
  type TrafficOfferPreview,
  type StaffDepartment,
  type StaffRole,
  type SpecialtyId,
  type UtilityUnderlayKind,
  ModuleType,
  ResidentState,
  RoomType,
  VisitorState,
  TILE_SIZE,
  TileType,
  WALKABLE_TILES,
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
const startupParams = new URLSearchParams(window.location.search);
const STRUCTURAL_EXPANSION_ENABLED = true;
const STARTER_LAYOUT_DB_NAME = 'starlight-starter-layouts';
const STARTER_LAYOUT_STORE_NAME = 'templates';
const STARTER_LAYOUT_RECORD_KEY = 'default';
const starterLayoutEditorMode = startupParams.get('starter-editor') === '1';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root not found');

app.innerHTML = `
  <div id="topbar">
    <div class="station-brand">
      <div class="station-mark">S</div>
      <div>
        <h1>Starlight Station</h1>
        <span id="autosave-status" class="topbar-note hidden" aria-live="polite"></span>
        <span id="sprite-status" class="topbar-note legacy-ui">Sprites inactive (fallback rendering)</span>
      </div>
    </div>
    <div id="hud-status" aria-label="Station status">
      <span class="hud-item"><span class="hud-label">Crew</span><span class="hud-value" id="hud-crew">--</span></span>
      <button id="hud-air-control" class="hud-item hud-air-control" type="button" title="Open the Air Coverage overlay">
        <span class="hud-label">O2 Reserve</span><span class="hud-value" id="hud-oxygen">--</span>
      </button>
      <span class="hud-item"><span class="hud-label">Power</span><span class="hud-value" id="hud-power">--</span></span>
      <span class="hud-item legacy-ui"><span class="hud-label">Water</span><span class="hud-value" id="hud-water">--</span></span>
      <span class="hud-item hud-item-action"><span class="hud-label">Prepared Meals</span><span class="hud-value" id="hud-food">--</span><button id="buy-prepared-meals" class="hud-stock-button" aria-label="Buy 12 prepared meals for 36 credits" title="Buy 12 prepared meals for 36 credits">+</button></span>
      <button id="open-rating-modal" class="hud-item hud-rating-button" type="button" title="Open station rating factors">
        <span class="hud-label">Rating</span><span class="hud-value" id="hud-rating">--</span>
      </button>
      <span class="hud-item legacy-ui"><span class="hud-label">Morale</span><span class="hud-value" id="hud-morale">--</span></span>
      <button id="open-economy-ledger" class="hud-item hud-rating-button" type="button" title="Open operating ledger">
        <span class="hud-label">Credits</span><span class="hud-value" id="hud-credits">--</span>
      </button>
      <span class="hud-item"><span class="hud-label">Station Stock</span><span class="hud-value" id="hud-materials">--</span></span>
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
      <button id="open-system-map-modal" class="topbar-btn utility-icon legacy-ui" aria-label="System Map (F4)" title="System Map (F4)">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="12" r="6" fill="none" />
          <circle cx="12" cy="12" r="10" fill="none" />
          <circle cx="18" cy="12" r="1" />
          <circle cx="6" cy="6" r="1" />
        </svg>
      </button>
      <button id="open-expansion-modal" class="topbar-btn utility-icon legacy-ui" aria-label="Map Expansion" title="Map Expansion">
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
      <button id="toggle-ui-panels" class="topbar-btn utility-icon" type="button" aria-label="Hide interface panels" title="Hide interface panels" aria-pressed="false" aria-controls="panel bottom-dock berth-ops-anchors">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect x="3" y="4" width="18" height="16" rx="1" />
          <path d="M8 4v16" />
          <path d="M8 15h13" />
          <path class="panel-visibility-slash" d="M4 3l16 18" />
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
    <div id="starter-layout-editor" class="starter-layout-editor hidden" role="region" aria-label="Starter layout editor" title="Build freely while paused, then save this structure as the default for future New Games.">
      <div class="starter-layout-editor-copy">
        <strong>Starter Layout Editor</strong>
        <span>Paused</span>
      </div>
      <div class="starter-layout-editor-actions">
        <span id="starter-layout-status" aria-live="polite"></span>
        <button id="save-starter-layout" class="mini-action-btn" type="button">Save Default</button>
        <button id="reset-starter-layout" class="mini-action-btn" type="button">Reset to Stock</button>
      </div>
    </div>
    <canvas id="game"></canvas>
    <div id="dev-tier-overlay" aria-label="Time to tier (dev mode)" hidden></div>
    <button id="air-emergency-indicator" class="air-emergency-indicator hidden" type="button" aria-live="assertive">
      Oxygen warning - open Air Coverage
    </button>
    <div id="game-stage"></div>
    <div class="floating-stack left-stack" aria-label="Station tasks">
      <section id="station-goal-card" class="hud-card station-goal-card" aria-live="polite">
        <div class="station-goal-head">
          <span>Global Goal</span>
          <span id="station-goal-stage">1 / 3</span>
        </div>
        <strong id="station-goal-title">Establish a working port</strong>
        <div id="station-goal-items" class="station-goal-items"></div>
        <div class="station-goal-progress" aria-hidden="true">
          <i id="station-goal-fill"></i>
        </div>
        <button id="open-progression-summary" class="station-tier-summary hidden" type="button" aria-haspopup="dialog" aria-controls="progression-modal">
          <span class="station-tier-copy">
            <span id="station-tier-current">Tier 0: Founding Outpost</span>
            <strong id="station-tier-next">Next: Guest Services</strong>
            <small id="station-tier-requirement">First visitor arrives</small>
          </span>
          <span class="station-tier-chevron" aria-hidden="true">›</span>
        </button>
      </section>
      <section id="operating-rhythm" class="hud-card operating-rhythm" aria-live="polite">
        <div class="operating-rhythm-head"><span id="watch-name">ALPHA WATCH</span><strong id="watch-countdown">2:15</strong></div>
        <div id="traffic-bank-now" class="operating-rhythm-bank">Passenger bank</div>
        <small id="traffic-bank-next">Next: cargo bank</small>
        <div class="operating-rhythm-actions">
          <button id="open-watch-roster" class="mini-action-btn" type="button" title="Set staffing targets for Alpha, Beta, and Gamma watches">Roster</button>
          <button id="emergency-recall" class="mini-action-btn" type="button" title="Call the off-duty watch into service for 45 seconds; fatigue and morale costs rise">Emergency Recall</button>
        </div>
      </section>
      <details class="hud-card task-card overlay-card legacy-ui">
        <summary class="hud-card-title">Tasks</summary>
        <div id="quest-bar" aria-live="polite"></div>
        <div id="tier-checklist" class="tier-checklist">No active checklist</div>
      </details>
      <button id="open-port-dispatch" class="hud-card port-dispatch-card" type="button" aria-haspopup="dialog" aria-controls="port-dispatch-modal" aria-expanded="false">
        <span class="dispatch-trigger-mark" aria-hidden="true">↘</span>
        <span class="dispatch-trigger-copy">
          <span class="dispatch-trigger-label">Approach Control</span>
          <strong id="dispatch-trigger-title">Approach lanes clear</strong>
          <small id="dispatch-trigger-meta">Waiting for traffic</small>
        </span>
        <span id="dispatch-trigger-count" class="dispatch-trigger-count hidden">0</span>
      </button>
      <section id="diagnostic-key" class="hud-card diagnostic-key hidden" aria-live="polite">
        <div class="hud-card-title" id="diagnostic-key-title">Diagnostics</div>
        <div id="diagnostic-key-stats" class="diagnostic-key-stats"></div>
        <div id="diagnostic-key-rows" class="diagnostic-key-rows"></div>
      </section>
    </div>
    <div id="berth-ops-anchors" class="berth-ops-anchors" aria-label="Live berth and pod operations" aria-live="polite"></div>
    <section id="agent-side-panel" class="side-inspector side-agent-panel floating-agent-panel hidden" aria-live="polite">
      <div class="side-inspector-head">
        <h3 id="agent-side-title">Agent Inspector</h3>
        <button id="close-agent-side" class="mini-action-btn">Close</button>
      </div>
      <div id="agent-side-body" class="side-inspector-body">No agent selected.</div>
    </section>
    <div id="bottom-dock">
      <section class="dock-card command-card legacy-ui">
        <div class="hud-card-title">Command</div>
        <div class="command-actions">
          <button id="open-travel-shop" class="primary-command">Supplies</button>
          <button id="open-market" class="secondary-command">Trade</button>
          <button id="open-capital-projects" class="secondary-command">Projects</button>
          <button id="open-crew-command" class="primary-command">Crew</button>
          <button id="open-progression-modal" class="primary-command">Progress</button>
          <button id="edit-priorities" class="secondary-command">Priorities</button>
        </div>
      </section>
      <section class="dock-card selected-card">
        <div class="hud-card-title">Selection</div>
        <div id="selection-summary" class="selection-summary">No room, dock, or resident selected.</div>
        <small id="dock-info" class="hidden"></small>
        <small id="dock-preview" class="hidden"></small>
      </section>
      <section class="dock-card ops-card">
        <div class="hud-card-title ops-card-head">
          <span>Operations</span>
          <button id="open-ops-modal" class="mini-action-btn">Shift Roster</button>
        </div>
        <div id="bottom-role-coverage" class="bottom-role-coverage" aria-live="polite"></div>
        <div class="row compact list-row hidden" id="cargo-arm-row"><span>Cargo Arm</span><span class="value" id="cargo-arm-status">Ready · 0% strain</span></div>
        <!-- No Fuel row. Every fact it carried is already drawn on the hardware:
             each Fuel Tank shows a graduated fill gauge and a TANK CONNECTED /
             PIPE TO ANY TANK TILE label, and each Fuel Coupler shows
             "COUPLER: READY · n FUEL", "LINE OK, TANK EMPTY", or "NO TANK". -->
        <div class="row compact list-row"><span>Crew</span><span class="value" id="crew">Working 0 | Idle 0 | Resting 0</span></div>
        <div class="row compact list-row"><span>Traffic</span><span class="value" id="ops-traffic">Visitors 0 | Ships 0 | Exits 0/min</span></div>
        <div class="row compact list-row hidden"><span>Systems</span><span class="value" id="ops">Cafeteria 0/0 | Kitchen 0/0 | Life Support 0/0</span></div>
        <div class="row compact list-row hidden"><span>Residents</span><span class="value" id="ops-residents">0 | waiting</span></div>
        <div class="row compact list-row hidden" id="work-queue-row"><span>Work Queue</span><span class="value" id="jobs">No queued work</span></div>
        <small id="critical-staffing-line"></small>
      </section>
      <section id="settlement-card" class="dock-card settlement-card">
        <div class="hud-card-title">Last Turnaround</div>
        <div id="settlement-summary" class="settlement-summary">No ship settled yet.</div>
      </section>
      <section class="dock-card event-card legacy-ui">
        <div class="hud-card-title ops-card-head">
          <span>Station Health</span>
          <button id="open-health-details" class="mini-action-btn">Details</button>
        </div>
        <div class="row compact list-row"><span>Rating</span><span class="value" id="health-rating">70</span></div>
        <small id="room-warnings">Room warnings: none</small>
        <small id="maintenance-status">Maintenance: tracking 0 targets | max 0% | avg 0% | open 0</small>
        <small id="thermal-status">Thermal: avg 0% | max 0% | hot 0 | stale 0</small>
        <small id="resident-conversion-summary" class="hidden"></small>
        <small id="visitor-feelings" class="hidden"></small>
        <small id="rating-reasons" class="hidden"></small>
        <small id="morale-reasons" class="hidden"></small>
      </section>
      <section id="diagnostics-card" class="dock-card diagnostics-card hidden">
        <div class="hud-card-title">Alerts</div>
        <div id="alert-list" class="alert-list is-clear">No active alerts</div>
        <div id="incident-list" class="incident-list is-empty">Incidents: none</div>
        <details class="mini-collapse hidden">
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
        <small id="ops-extra">Kitchen 0/0 | Workshop 0/0 | Bathrooms 0/0 | Hydroponics 0/0 | Life Support 0/0 | Lounge 0/0 | Market 0/0</small>
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
      <button class="palette-tab active" data-palette-target="businesses">Businesses</button>
      <button class="palette-tab" data-palette-target="structure">Build</button>
      <button class="palette-tab" data-palette-target="rooms">Rooms</button>
      <button class="palette-tab" data-palette-target="modules">Modules</button>
      <button class="palette-tab" data-palette-target="crew">Crew</button>
      <button class="palette-tab" data-palette-target="overlays">Overlays</button>
    </div>
    <div id="toolbar" aria-label="Build tools">
      <div class="tool-row palette-section active" data-palette-section="businesses">
        <span class="tool-row-label">Opening businesses</span>
        <small class="market-status">Choose by shaping a working space. These controls only select world tools.</small>
        <div class="opening-zone-controls" aria-label="Opening access zoning">
          <button class="tool-btn recipe-zone-control" data-tool-zone="public" title="Paint guest access onto an existing room">Public access</button>
          <button class="tool-btn recipe-zone-control" data-tool-zone="restricted" title="Reserve an existing room for crew only">Crew only</button>
        </div>
        <div id="opening-recipe-list" class="recipe-list"></div>
        <span class="tool-row-label">Later, once you can afford it</span>
        <div id="future-facility-list" class="recipe-future"></div>
      </div>
      <div class="tool-row palette-section" data-palette-section="structure">
        <span class="tool-row-label">Structure & Utilities</span>
        <button class="tool-btn" data-tool-deselect="1" title="Inspect / no build tool (Esc)"><span class="tool-key">Esc</span>Inspect</button>
        <button class="tool-btn" data-tool-room-copy="1" title="Copy station stamp — drag over floors, walls, rooms, and furniture"><span class="tool-key">⧉</span>Copy</button>
        <button class="tool-btn" data-tool-room-paste="1" title="Paste copied station stamp — tiles, room settings, zones, docks, and fresh furniture"><span class="tool-key">▣</span>Paste</button>
        <button class="tool-btn" data-tool-tile="floor" title="${STRUCTURAL_EXPANSION_ENABLED ? 'Floor (1) - paint over truss to plan a sealed station expansion' : 'Floor (1)'}"><span class="tool-key">1</span>Floor</button>
        ${STRUCTURAL_EXPANSION_ENABLED ? '<button class="tool-btn" data-tool-tile="truss" title="Truss - plan an EVA-built structural scaffold in open space"><span class="tool-key">.</span>Truss</button>' : ''}
        <button class="tool-btn" data-tool-structural-piece="junction" title="Truss Junction — 1x1 branch/span support node"><span class="tool-key">·</span>Junction</button>
        <button class="tool-btn" data-tool-structural-piece="reinforced-bulkhead" title="Reinforced Bulkhead — rotatable 2x1 heavy berth transfer"><span class="tool-key">·</span>Bulkhead</button>
        <button class="tool-btn" data-tool-tile="wall" title="Wall (2)"><span class="tool-key">2</span>Wall</button>
        <button class="tool-btn" data-tool-tile="dock" title="Dock (3)"><span class="tool-key">3</span>Dock</button>
        <button class="tool-btn" data-tool-tile="door" title="Door (4)"><span class="tool-key">4</span>Door</button>
        <button class="tool-btn" data-tool-tile="airlock" title="Airlock — EVA access for exterior construction"><span class="tool-key">·</span>Airlock</button>
        <button class="tool-btn" data-tool-utility-underlay="air-duct" title="Draw underfloor Air Ducts — connect Life Support to wall Vents"><span class="tool-key">·</span>Air Duct</button>
        <button class="tool-btn" data-tool-utility-underlay="power-conduit" title="Draw underfloor Power Cable — connect Reactor Cores or Solar Panels to powered rooms"><span class="tool-key">·</span>Power Cable</button>
        <button class="tool-btn" data-tool-utility-underlay="water-pipe" title="Draw underfloor Water Pipes — connect hygiene and kitchen fixtures"><span class="tool-key">·</span>Water Pipe</button>
        <button class="tool-btn" data-tool-utility-underlay="fuel-pipe" title="Draw underfloor Fuel Pipes — connect Maintenance Fuel Tanks to hull Fuel Couplers"><span class="tool-key">·</span>Fuel Pipe</button>
        <button class="tool-btn" data-tool-utility-underlay="erase" title="Erase underfloor utility tiles"><span class="tool-key">·</span>Erase Utility</button>
        <button class="tool-btn" data-tool-cancel-construction="1" title="Cancel build orders by dragging over blueprints"><span class="tool-key">·</span>Cancel Build</button>
        <button class="tool-btn" data-tool-tile="erase" title="Erase (7)"><span class="tool-key">7</span>Erase</button>
        <button class="tool-btn" data-tool-clearroom="1" title="Clear Room (0)"><span class="tool-key">0</span>Clear Room</button>
      </div>
      <div class="tool-row palette-section" data-palette-section="rooms" data-tool-section="rooms">
        <span class="tool-row-label">Rooms</span>
        <button class="tool-btn" data-tool-room="bridge" title="Build Bridge"><span class="tool-key">·</span>Bridge</button>
        <button class="tool-btn" data-tool-room="dorm" title="Build Dorm (D)"><span class="tool-key">D</span>Dorm</button>
        <button class="tool-btn" data-tool-room="hygiene" title="Build Bathroom (H)"><span class="tool-key">H</span>Bathroom</button>
        <button class="tool-btn" data-tool-room="hydroponics" title="Build Hydroponics (F)"><span class="tool-key">F</span>Hydroponics</button>
        <button class="tool-btn" data-tool-room="kitchen" title="Build Kitchen (I)"><span class="tool-key">I</span>Kitchen</button>
        <button class="tool-btn" data-tool-room="cafeteria" title="Build Cafeteria (C)"><span class="tool-key">C</span>Cafeteria</button>
        <button class="tool-btn" data-tool-room="life-support" title="Build Life Support (L)"><span class="tool-key">L</span>Life Support</button>
        <button class="tool-btn" data-tool-room="reactor" title="Build Reactor (R)"><span class="tool-key">R</span>Reactor</button>
        <button class="tool-btn" data-tool-room="lounge" title="Build Lounge (U)"><span class="tool-key">U</span>Lounge</button>
        <button class="tool-btn" data-tool-room="market" title="Build Market (K)"><span class="tool-key">K</span>Market</button>
        <button class="tool-btn" data-tool-room="workshop" title="Build Workshop (W)"><span class="tool-key">W</span>Workshop</button>
        <button class="tool-btn" data-tool-room="storage" title="Build Storage (B)"><span class="tool-key">B</span>Storage</button>
        <button class="tool-btn" data-tool-room="maintenance" title="Build Maintenance — Fuel Tanks and utility equipment"><span class="tool-key">·</span>Maintenance</button>
        <button class="tool-btn" data-tool-room="logistics-stock" title="Build Logistics Stock (N)"><span class="tool-key">N</span>Logistics</button>
        <button class="tool-btn" data-tool-room="security" title="Build Security (S)"><span class="tool-key">S</span>Security</button>
        <button class="tool-btn" data-tool-room="clinic" title="Build Clinic (Y)"><span class="tool-key">Y</span>Clinic</button>
        <button class="tool-btn" data-tool-room="brig" title="Build Brig (J)"><span class="tool-key">J</span>Brig</button>
        <button class="tool-btn" data-tool-room="rec-hall" title="Build Rec Hall (A)"><span class="tool-key">A</span>Rec Hall</button>
        <button class="tool-btn" data-tool-room="berth" title="Build Berth (E) — dock-migration v0"><span class="tool-key">E</span>Berth</button>
        <button class="tool-btn" data-tool-room="cantina" title="Build Cantina — drinks bar, social leisure for crew/visitors/residents"><span class="tool-key">·</span>Cantina</button>
        <button class="tool-btn" data-tool-room="commercial-unit" title="Designate an enclosed commercial shell, then invite tenant proposals"><span class="tool-key">·</span>Commercial</button>
        <button class="tool-btn" data-tool-room="observatory" title="Build Observatory (T3+) — premium leisure with wonder bonus"><span class="tool-key">·</span>Observ.</button>
      </div>
      <div class="tool-row palette-section" data-palette-section="modules" data-tool-section="modules">
        <span class="tool-row-label">Port Infrastructure</span>
        <span class="tool-group-label">Pod Dock</span>
        <button class="tool-btn" data-tool-module="pod-dock" title="Place Pod Dock · ${MODULE_DEFINITIONS[ModuleType.PodDock].capitalCost}c — requires an exterior hull wall"><span class="tool-key">·</span>Pod Dock · ${MODULE_DEFINITIONS[ModuleType.PodDock].capitalCost}c</button>
        <span class="tool-group-label">Dock Services</span>
        <button class="tool-btn" data-tool-module="fuel-coupler" title="Place Fuel Coupler · ${MODULE_DEFINITIONS[ModuleType.FuelCoupler].capitalCost}c — connect it to a Maintenance Fuel Tank with Fuel Pipe"><span class="tool-key">·</span>Fuel Coupler · ${MODULE_DEFINITIONS[ModuleType.FuelCoupler].capitalCost}c</button>
        <button class="tool-btn" data-tool-module="freight-locker" title="Place Freight Locker · ${MODULE_DEFINITIONS[ModuleType.FreightLocker].capitalCost}c — requires an exterior hull wall near a Pod Dock"><span class="tool-key">·</span>Freight Locker · ${MODULE_DEFINITIONS[ModuleType.FreightLocker].capitalCost}c</button>
        <button class="tool-btn" data-tool-module="maintenance-socket" title="Place Maintenance Socket · ${MODULE_DEFINITIONS[ModuleType.MaintenanceSocket].capitalCost}c — requires an exterior hull wall near a Pod Dock"><span class="tool-key">·</span>Maint. Socket · ${MODULE_DEFINITIONS[ModuleType.MaintenanceSocket].capitalCost}c</button>
        <button class="tool-btn" data-tool-module="fuel-tank" title="Place Fuel Tank · ${MODULE_DEFINITIONS[ModuleType.FuelTank].capitalCost}c — stores propellant in a Maintenance room"><span class="tool-key">·</span>Fuel Tank · ${MODULE_DEFINITIONS[ModuleType.FuelTank].capitalCost}c</button>
        <span class="tool-group-label" data-berth-hardware>Berth Hardware</span>
        <button class="tool-btn" data-tool-module="berth-control" data-berth-hardware title="Place Berth Control · ${MODULE_DEFINITIONS[ModuleType.BerthControl].capitalCost}c — berth-only traffic control"><span class="tool-key">·</span>Berth Control · ${MODULE_DEFINITIONS[ModuleType.BerthControl].capitalCost}c</button>
        <button class="tool-btn" data-tool-module="docking-clamp" data-berth-hardware title="Place Docking Clamp · ${MODULE_DEFINITIONS[ModuleType.DockingClamp].capitalCost}c — berth service rail"><span class="tool-key">·</span>Dock Clamp · ${MODULE_DEFINITIONS[ModuleType.DockingClamp].capitalCost}c</button>
        <button class="tool-btn" data-tool-module="gangway" data-berth-hardware title="Place Gangway · ${MODULE_DEFINITIONS[ModuleType.Gangway].capitalCost}c — berth passenger access"><span class="tool-key">·</span>Gangway · ${MODULE_DEFINITIONS[ModuleType.Gangway].capitalCost}c</button>
        <button class="tool-btn" data-tool-module="customs-counter" data-berth-hardware title="Place Customs Counter · ${MODULE_DEFINITIONS[ModuleType.CustomsCounter].capitalCost}c — berth screening"><span class="tool-key">·</span>Customs · ${MODULE_DEFINITIONS[ModuleType.CustomsCounter].capitalCost}c</button>
        <button class="tool-btn" data-tool-module="cargo-arm" data-berth-hardware title="Place Cargo Arm · ${MODULE_DEFINITIONS[ModuleType.CargoArm].capitalCost}c — heavy berth freight"><span class="tool-key">·</span>Cargo Arm · ${MODULE_DEFINITIONS[ModuleType.CargoArm].capitalCost}c</button>
        <button class="tool-btn" data-tool-module="fuel-pump" data-berth-hardware title="Place Fuel Pump · ${MODULE_DEFINITIONS[ModuleType.FuelPump].capitalCost}c (T2+) — large-berth refueling"><span class="tool-key">·</span>Fuel Pump · ${MODULE_DEFINITIONS[ModuleType.FuelPump].capitalCost}c</button>
        <span class="tool-row-label">Furniture</span>
        <button class="tool-btn" data-tool-module="captain-console" title="Place Captain's Console"><span class="tool-key">·</span>Captain</button>
        <button class="tool-btn" data-tool-module="sanitation-terminal" title="Place Sanitation Terminal"><span class="tool-key">·</span>Sanit.</button>
        <button class="tool-btn" data-tool-module="mechanical-terminal" title="Place Mechanical Terminal"><span class="tool-key">·</span>Mech.</button>
        <button class="tool-btn" data-tool-module="industrial-terminal" title="Place Industrial Terminal"><span class="tool-key">·</span>Ind.</button>
        <button class="tool-btn" data-tool-module="research-terminal" title="Place Research Terminal"><span class="tool-key">·</span>Research</button>
        <button class="tool-btn" data-tool-module="logistics-terminal" title="Place Logistics Terminal"><span class="tool-key">·</span>Log.</button>
        <button class="tool-btn" data-tool-module="bed" title="Place Bed (Q)"><span class="tool-key">Q</span>Bed</button>
        <button class="tool-btn" data-tool-module="bunk" title="Place Bunk — two sleep slots, slower recovery"><span class="tool-key">·</span>Bunk</button>
        <button class="tool-btn" data-tool-module="guest-cabin" title="Place Guest Cabin (Dorm-only) · ${MODULE_DEFINITIONS[ModuleType.GuestCabin].capitalCost}c — two private guest beds"><span class="tool-key">·</span>Guest Cabin · ${MODULE_DEFINITIONS[ModuleType.GuestCabin].capitalCost}c</button>
        <button class="tool-btn" data-tool-module="locker" title="Place Locker — improves crew quarters quality"><span class="tool-key">·</span>Locker</button>
        <button class="tool-btn" data-tool-module="table" title="Place Dining Table (T) — includes four visible seats"><span class="tool-key">T</span>Table + 4 seats</button>
        <button class="tool-btn" data-tool-module="community-table" title="Place Community Table · ${MODULE_DEFINITIONS[ModuleType.CommunityTable].capitalCost}c — eight seats for a Cafeteria or Cantina"><span class="tool-key">·</span>Community Table · ${MODULE_DEFINITIONS[ModuleType.CommunityTable].capitalCost}c</button>
        <button class="tool-btn" data-tool-module="serving-station" title="Place Serving Station (5)"><span class="tool-key">5</span>Serving</button>
        <button class="tool-btn" data-tool-module="serving-line" title="Place Serving Line (Cafeteria-only) · ${MODULE_DEFINITIONS[ModuleType.ServingLine].capitalCost}c — three meal pickup positions on one staff lane"><span class="tool-key">·</span>Serving Line · ${MODULE_DEFINITIONS[ModuleType.ServingLine].capitalCost}c</button>
        <button class="tool-btn" data-tool-module="fridge" title="Place Fridge — cold ingredient buffer"><span class="tool-key">·</span>Fridge</button>
        <button class="tool-btn" data-tool-module="cold-store" title="Place Cold Store — large raw-food buffer"><span class="tool-key">·</span>Cold</button>
        <button class="tool-btn" data-tool-module="prep-counter" title="Place Prep Counter — staffed ingredient prep"><span class="tool-key">·</span>Prep</button>
        <button class="tool-btn" data-tool-module="stove" title="Place Stove (V)"><span class="tool-key">V</span>Stove</button>
        <button class="tool-btn" data-tool-module="tray-return" title="Place Tray Return — dirty tray dropoff"><span class="tool-key">·</span>Tray</button>
        <button class="tool-btn" data-tool-module="dishwasher" title="Place Dishwasher — staffed tray washing"><span class="tool-key">·</span>Wash</button>
        <button class="tool-btn" data-tool-module="grow-station" title="Place Grow Station (G)"><span class="tool-key">G</span>Grow</button>
        <button class="tool-btn" data-tool-module="toilet" title="Place Toilet (Bathroom-only) — relieves bladder, one user at a time"><span class="tool-key">·</span>Toilet</button>
        <button class="tool-btn" data-tool-module="shower" title="Place Shower (;)"><span class="tool-key">;</span>Shower</button>
        <button class="tool-btn" data-tool-module="sink" title="Place Sink (')"><span class="tool-key">'</span>Sink</button>
        <button class="tool-btn" data-tool-module="wash-bank" title="Place Wash Bank (Bathroom-only) · ${MODULE_DEFINITIONS[ModuleType.WashBank].capitalCost}c — four exclusive wash positions on one plumbing spine"><span class="tool-key">·</span>Wash Bank · ${MODULE_DEFINITIONS[ModuleType.WashBank].capitalCost}c</button>
        <button class="tool-btn" data-tool-module="floor-drain" title="Place Floor Drain — flood relief"><span class="tool-key">·</span>Drain</button>
        <button class="tool-btn" data-tool-module="water-valve" title="Place Water Valve — local pipe isolation"><span class="tool-key">·</span>Valve</button>
        <button class="tool-btn" data-tool-module="wall-light" title="Place Wall Light (\`)"><span class="tool-key">\`</span>Light</button>
        <button class="tool-btn" data-tool-module="couch" title="Place Couch (6)"><span class="tool-key">6</span>Couch</button>
        <button class="tool-btn" data-tool-module="game-station" title="Place Game Station (=)"><span class="tool-key">=</span>Game</button>
        <button class="tool-btn" data-tool-module="market-stall" title="Place Market Stall (-)"><span class="tool-key">-</span>Stall</button>
        <button class="tool-btn" data-tool-module="checkout-bank" title="Place Checkout Bank — two customer lanes for a Market"><span class="tool-key">·</span>Checkout</button>
        <button class="tool-btn" data-tool-module="shelf-aisle" title="Place Shelf Aisle — cargo stocks travel goods here"><span class="tool-key">·</span>Shelf Aisle</button>
        <button class="tool-btn" data-tool-module="backroom-stock-bank" title="Place Backroom Stock Bank · ${MODULE_DEFINITIONS[ModuleType.BackroomStockBank].capitalCost}c — bulk stock for a Market, Storage, or Logistics room; serves no customers"><span class="tool-key">·</span>Backroom Stock · ${MODULE_DEFINITIONS[ModuleType.BackroomStockBank].capitalCost}c</button>
        <button class="tool-btn" data-tool-module="arrival-desk" title="Place Arrival Desk · ${MODULE_DEFINITIONS[ModuleType.ArrivalDesk].capitalCost}c — optional reception for a Lounge, Market, or Cafeteria"><span class="tool-key">·</span>Arrival Desk · ${MODULE_DEFINITIONS[ModuleType.ArrivalDesk].capitalCost}c</button>
        <button class="tool-btn" data-tool-module="workbench" title="Place Workbench (P)"><span class="tool-key">P</span>Bench</button>
        <button class="tool-btn" data-tool-module="intake-pallet" title="Place Intake Pallet (,)"><span class="tool-key">,</span>Intake</button>
        <button class="tool-btn" data-tool-module="storage-rack" title="Place Storage Rack (.)"><span class="tool-key">.</span>Rack</button>
        <button class="tool-btn" data-tool-module="terminal" title="Place Security Terminal (M)"><span class="tool-key">M</span>Terminal</button>
        <button class="tool-btn" data-tool-module="cell-console" title="Place Cell Console (/)"><span class="tool-key">/</span>Cell</button>
        <button class="tool-btn" data-tool-module="rec-unit" title="Place Rec Unit (\\)"><span class="tool-key">\\</span>Rec</button>
        <button class="tool-btn" data-tool-module="med-bed" title="Place Med Bed (Z)"><span class="tool-key">Z</span>Med Bed</button>
        <button class="tool-btn" data-tool-module="security-camera" title="Place wall Security Camera (T3+) — lowers local opacity and improves detection/control"><span class="tool-key">·</span>Camera</button>
        <button class="tool-btn" data-tool-module="access-gate" title="Place Access Gate (T3+) — staffed checkpoint control; needs Security Guards"><span class="tool-key">·</span>Gate</button>
        <button class="tool-btn" data-tool-module="fire-extinguisher" title="Place wall Fire Extinguisher — suppresses nearby fires from an adjacent service tile"><span class="tool-key">·</span>Fire Ext</button>
        <button class="tool-btn" data-tool-module="vent" title="Place wall Vent — projects life-support air from an adjacent service tile"><span class="tool-key">·</span>Vent</button>
        <button class="tool-btn" data-tool-module="insulation-panel" title="Place wall Insulation Panel — reduces sunlight heat transfer nearby"><span class="tool-key">·</span>Insul.</button>
        <button class="tool-btn" data-tool-module="vending-machine" title="Place Vending Machine (T1+) — visitors in leisure spend extra credits on this tile"><span class="tool-key">·</span>Vending</button>
        <button class="tool-btn" data-tool-module="bench" title="Place Bench (T1+) — two seats for lounges and cantinas"><span class="tool-key">·</span>Bench · 2 seats</button>
        <button class="tool-btn" data-tool-module="bar-counter" title="Place Bar Counter (Cantina-only) — drink service anchor"><span class="tool-key">·</span>Bar</button>
        <button class="tool-btn" data-tool-module="tap" title="Place Tap (Cantina-only) — increases drink throughput"><span class="tool-key">·</span>Tap</button>
        <button class="tool-btn" data-tool-module="service-bar" title="Place Service Bar (Cantina-only) · ${MODULE_DEFINITIONS[ModuleType.ServiceBar].capitalCost}c — four guest stools on a two-position staff lane"><span class="tool-key">·</span>Service Bar · ${MODULE_DEFINITIONS[ModuleType.ServiceBar].capitalCost}c</button>
        <button class="tool-btn" data-tool-module="bar-corner" title="Place Bar Corner (Cantina-only) · ${MODULE_DEFINITIONS[ModuleType.BarCorner].capitalCost}c — turns a bar run 90°"><span class="tool-key">·</span>Bar Corner · ${MODULE_DEFINITIONS[ModuleType.BarCorner].capitalCost}c</button>
        <button class="tool-btn" data-tool-module="bar-end" title="Place Bar End (Cantina-only) · ${MODULE_DEFINITIONS[ModuleType.BarEnd].capitalCost}c — caps a bar run with one more stool"><span class="tool-key">·</span>Bar End · ${MODULE_DEFINITIONS[ModuleType.BarEnd].capitalCost}c</button>
        <button class="tool-btn" data-tool-module="booth-bank" title="Place Booth Bank · ${MODULE_DEFINITIONS[ModuleType.BoothBank].capitalCost}c — six comfortable seats for a Cantina or Lounge"><span class="tool-key">·</span>Booth Bank · ${MODULE_DEFINITIONS[ModuleType.BoothBank].capitalCost}c</button>
        <button class="tool-btn" data-tool-module="standing-rail" title="Place Standing Rail · ${MODULE_DEFINITIONS[ModuleType.StandingRail].capitalCost}c — four cheap standing positions for a Cantina or Lounge"><span class="tool-key">·</span>Standing Rail · ${MODULE_DEFINITIONS[ModuleType.StandingRail].capitalCost}c</button>
        <button class="tool-btn" data-tool-module="telescope" title="Place Telescope (Observatory-only, T3+) — wonder leisure bonus"><span class="tool-key">·</span>Telesc.</button>
        <button class="tool-btn" data-tool-module="water-fountain" title="Place Water Fountain — basic crew thirst relief"><span class="tool-key">·</span>Water</button>
        <button class="tool-btn" data-tool-module="plant" title="Place Plant (T1+) — small comfort/appeal bonus"><span class="tool-key">·</span>Plant</button>
        <button class="tool-btn" data-tool-module="reactor-core" title="Place 2×2 Reactor Core in a Reactor room — 22 power when active"><span class="tool-key">·</span>Reactor</button>
        <button class="tool-btn" data-tool-module="solar-panel" title="Place Solar Panel — passive power scaled by the tile's sunlight; strongest on a sunward charter"><span class="tool-key">·</span>Solar</button>
        <button class="tool-btn utility-tool" data-tool-module-move="1" title="Move an installed module without repurchasing it"><span class="tool-key">↔</span>Move</button>
        <button class="tool-btn" data-tool-module="clear" title="Sell or remove module (X) · refund ${Math.round(MODULE_RESALE_REFUND_RATE * 100)}% of purchase price"><span class="tool-key">X</span>Sell</button>
        <button class="tool-btn utility-tool" data-tool-rotate="1" title="Rotate module ([ / ])"><span class="tool-key">[ ]</span>Rotate</button>
        <button class="tool-btn utility-tool" data-tool-deselect="1" title="Deselect tool (Esc)"><span class="tool-key">Esc</span>None</button>
      </div>
      <div class="tool-row palette-section crew-palette-section" data-palette-section="crew">
        <span class="tool-row-label">Crew Hiring</span>
        <div class="crew-palette-summary">
          <div class="row compact list-row"><span>Command</span><span class="value" id="crew-command-summary">Captain assigned</span></div>
          <div class="row compact list-row"><span>Research</span><span class="value" id="crew-specialty-summary">Manage in Progress</span></div>
          <div class="row compact list-row"><span>Officers</span><span class="value" id="officer-summary">0 hired</span></div>
        </div>
        <div id="officer-grid" class="crew-grid"></div>
        <div class="row compact list-row crew-palette-subhead"><span>Staff</span><span class="value" id="staff-summary">0 crew</span></div>
        <div id="staff-grid" class="crew-grid"></div>
        <small id="crew-panel-status" class="market-status">Ready.</small>
      </div>
      <div class="tool-row palette-section" data-palette-section="overlays">
        <span class="tool-row-label">Optional city lenses</span>
        <button class="tool-btn diagnostic-toggle" data-diagnostic-overlay="none" title="Return to the normal station view">Normal View</button>
        <button class="tool-btn diagnostic-toggle" data-diagnostic-overlay="life-support" title="Show oxygen quality and life-support coverage across the station">Air Coverage</button>
        <button class="tool-btn diagnostic-toggle" data-diagnostic-overlay="visitor-status" title="Show which public spaces visitors enjoy or avoid">Guest Appeal</button>
        <button class="tool-btn diagnostic-toggle" data-diagnostic-overlay="sanitation" title="Show dirt, grime, cleaning pressure, and its source">Cleanliness</button>
        <button class="tool-btn diagnostic-toggle" data-diagnostic-overlay="structural" title="Show which frontage is structurally supported, planned, overloaded, or unsupported">Structural Support</button>
        <button class="tool-btn diagnostic-toggle" data-diagnostic-overlay="route-pressure" title="Show visitor, crew, and freight routes plus conflicts">Foot Traffic</button>
        <button class="tool-btn diagnostic-toggle" data-diagnostic-overlay="reputation" title="Show local control, notoriety, value, and crime pressure">Security & Risk</button>
        <button id="toggle-inventory-overlay" class="tool-btn overlay-toggle">Storage: OFF</button>
        <button id="toggle-service-nodes" class="tool-btn overlay-toggle">Service Reach: OFF</button>
        <button id="toggle-zones" class="tool-btn overlay-toggle">Zones: OFF</button>
        <small id="diagnostic-readout" class="diagnostic-readout">Diagnostics off</small>
        <button id="toggle-glow" class="tool-btn overlay-toggle legacy-ui">Glow: ON</button>
        <button id="toggle-sprites" class="tool-btn overlay-toggle legacy-ui">Sprites: OFF</button>
        <button id="toggle-sprite-fallback" class="tool-btn overlay-toggle legacy-ui">Force Fallback: OFF</button>
      </div>
    </div>
  </aside>
  <div class="hidden-controls" aria-hidden="true">
    <span id="tax-label">20%</span>
    <input type="range" id="tax" min="0" max="50" step="1" value="20" tabindex="-1" />
  </div>
  <div id="port-dispatch-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="port-dispatch-title">
    <div class="modal-card port-dispatch-modal-card">
      <div class="modal-head">
        <div class="dispatch-modal-heading">
          <span class="dispatch-modal-kicker">Approach Control</span>
          <h2 id="port-dispatch-title">Incoming Ships</h2>
        </div>
        <button id="close-port-dispatch" class="ghost-btn icon-close-btn" aria-label="Close dispatch" title="Close">&times;</button>
      </div>
      <div id="shift-brief" class="shift-brief" aria-live="polite">
        <span class="shift-brief-kicker">Current objective</span>
        <strong>Review incoming manifests</strong>
        <span>Choose work that fits the station and crew.</span>
      </div>
      <div class="traffic-controls">
        <label class="traffic-rate-control">
          <span>Traffic rate</span>
          <span id="ships-label">1</span>
          <input type="range" id="ships" min="0" max="3" step="1" value="1" />
        </label>
        <div class="traffic-state">
          <small id="traffic-status" class="traffic-status tone-muted">Paused</small>
          <small id="port-auto-status">Manual dispatch active.</small>
        </div>
        <button id="toggle-port-auto" class="secondary-command">Auto-routing: OFF</button>
        <div id="approach-policy" class="approach-policy" aria-label="Approach automation policy">
          <span>Standing orders</span>
          <div class="approach-policy-options">
            <button type="button" data-port-policy="cautious" title="Only clear low-risk ships when their requested services are online">Protect service</button>
            <button type="button" data-port-policy="balanced" title="Clear low- and guarded-risk ships that fit berth filters">Balanced</button>
            <button type="button" data-port-policy="open" title="Fill eligible berths regardless of traffic risk">Fill berths</button>
          </div>
        </div>
        <small id="approach-reputation-pull" class="approach-reputation-pull">Traffic pull: reputation has no effect yet</small>
        <section class="commitment-control-surface" aria-labelledby="commitment-recovery-title">
          <div class="commitment-surface-head">
            <span><strong id="commitment-recovery-title">Stay recovery</strong><small>Explicit actions for active failures</small></span>
            <span id="failure-episode-count" class="commitment-count">0 active</span>
          </div>
          <div id="failure-episode-list" class="failure-episode-list" aria-live="polite"></div>
        </section>
        <section id="admission-policy-editor" class="admission-policy-editor" aria-labelledby="admission-policy-title">
          <div class="commitment-surface-head">
            <span><strong id="admission-policy-title">Finite admission</strong><small>Routine calls only; exceptions stay manual</small></span>
            <label class="compact-switch"><input id="admission-policy-enabled" type="checkbox" /> <span>Enabled</span></label>
          </div>
          <div class="admission-rule-grid">
            <fieldset class="admission-rule" data-admission-class="pod">
              <legend><label><input id="admission-pod-enabled" type="checkbox" /> Pods</label></legend>
              <label>Keep free<input data-admission-number="pod.reserveFreeInterfaces" type="number" min="0" max="12" step="1" /></label>
              <label>Max stay<input data-admission-number="pod.maxStaySeconds" type="number" min="0" max="3600" step="30" /><span>s</span></label>
              <label>Min margin<input data-admission-number="pod.minMarginCredits" type="number" min="0" max="100000" step="10" /><span>c</span></label>
            </fieldset>
            <fieldset class="admission-rule" data-admission-class="berth">
              <legend><label><input id="admission-berth-enabled" type="checkbox" /> Berths</label></legend>
              <label>Keep free<input data-admission-number="berth.reserveFreeInterfaces" type="number" min="0" max="12" step="1" /></label>
              <label>Max stay<input data-admission-number="berth.maxStaySeconds" type="number" min="0" max="3600" step="30" /><span>s</span></label>
              <label>Min margin<input data-admission-number="berth.minMarginCredits" type="number" min="0" max="100000" step="10" /><span>c</span></label>
            </fieldset>
            <fieldset class="admission-reserves">
              <legend>Station reserves</legend>
              <label>Guest beds<input data-admission-number="reserveBeds" type="number" min="0" max="999" step="1" /></label>
              <label>Prepared meals<input data-admission-number="reserveMeals" type="number" min="0" max="9999" step="1" /></label>
            </fieldset>
          </div>
          <div class="admission-pressure-row">
            <span id="admission-pressure" aria-live="polite">No calls waiting.</span>
            <button id="admission-manual-override" type="button">Manual all</button>
          </div>
          <small class="admission-override-note">Manual override remains available on every offer through Accept, Hold, and Pass. Finite admission supersedes legacy auto-routing only while enabled.</small>
        </section>
        <div id="traffic-offer-list" class="traffic-offer-list" aria-live="polite"></div>
        <small id="traffic-action-note" class="traffic-action-note">Accept commits the shown interface and station load.</small>
      </div>
    </div>
  </div>
  <div id="rating-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="rating-modal-title">
    <div class="modal-card rating-modal-card">
      <div class="modal-head">
        <div class="rating-modal-heading">
          <span class="rating-modal-kicker">Station Reputation</span>
          <h2 id="rating-modal-title">Station Rating</h2>
        </div>
        <button id="close-rating-modal" class="ghost-btn icon-close-btn" aria-label="Close station rating" title="Close">&times;</button>
      </div>
      <div class="rating-modal-score-row">
        <strong id="rating-modal-score" class="rating-modal-score">--</strong>
        <span id="rating-modal-trend" class="rating-modal-trend">--/min</span>
      </div>
      <p id="rating-modal-summary" class="rating-modal-summary">Rating factors will appear as the station operates.</p>
      <div class="rating-modal-effect" id="rating-modal-effect">Reputation affects which traffic finds the station.</div>
      <div class="rating-factor-grid">
        <section class="rating-factor-group rating-factor-group-positive">
          <div class="rating-factor-heading"><strong>What earned the score</strong><small>points total · rate now</small></div>
          <div id="rating-modal-bonuses" class="metric-list rating-driver-list" data-metric-title="Service"></div>
        </section>
        <section class="rating-factor-group rating-factor-group-negative">
          <div class="rating-factor-heading"><strong>What cost the score</strong><small>points total · rate now</small></div>
          <div id="rating-modal-penalties" class="metric-list rating-driver-list" data-metric-title="Pressure"></div>
        </section>
      </div>
      <section class="rating-factor-group rating-factor-group-failures">
        <div class="rating-factor-heading"><strong>Why service failed</strong><small>points total · rate now</small></div>
        <div id="rating-modal-failures" class="metric-list rating-driver-list" data-metric-title="Misses"></div>
      </section>
      <div class="rating-modal-driver-block">
        <strong>Recorded contributors</strong>
        <div id="rating-modal-drivers" class="rating-driver-notes"></div>
      </div>
    </div>
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
        <button id="open-crew-panel">Crew Panel</button>
        <button id="hire-crew">Quick Assistant (14c)</button>
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
        <small id="progress-modal-tier-theme" class="progression-tier-theme">Keep core life support running and establish visitor service.</small>
        <div class="tier-progress-track tier-progress-track-lg"><div id="progress-modal-fill" class="tier-progress-fill"></div></div>
        <div class="row compact list-row">
          <span id="progress-modal-pct">0% to Tier 1</span>
          <span class="value" id="progress-modal-goal">Your first visitor unlocks Guest Services.</span>
        </div>
        <div id="progress-modal-tier-checklist" class="progression-tier-checklist"></div>
      </div>
      <div class="progression-section">
        <div class="section-title">Tier Roadmap</div>
        <div id="progress-modal-roadmap"></div>
      </div>
      <details class="progression-section progression-specialties">
        <summary class="section-title">Specialization Branches</summary>
        <small id="progress-modal-specialty-summary">No specialty selected.</small>
        <div id="progress-modal-specialties" class="specialty-roadmap"></div>
      </details>
    </div>
  </div>
  <div id="priority-modal" class="modal hidden">
    <div class="modal-card crew-roster-modal-card">
      <div class="modal-head">
        <span><h2>Crew Roster</h2><small>Plan watches by person. Assign workplaces in the station.</small></span>
        <button id="close-priority" class="ghost-btn">Close</button>
      </div>
      <div id="role-coverage-summary" class="role-coverage-summary" aria-live="polite"></div>
      <div id="workplace-assignment-context" class="workplace-assignment-context hidden" aria-live="polite"></div>
      <div id="watch-assignment-bar" class="watch-assignment-bar" aria-live="polite"></div>
      <div id="named-watch-roster" class="named-watch-roster"></div>
      <small class="roster-rule">Role decides what work a person can do. Their watch decides when they are available.</small>
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
          <div id="ops-modal-workforce" class="metric-list" data-metric-title="Workforce">Workforce lanes</div>
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
        <h2 id="dock-modal-title">Dock Config</h2>
        <button id="close-dock" class="ghost-btn">Close</button>
      </div>
      <div class="row compact list-row"><span>Dock</span><span class="value" id="dock-modal-id">none</span></div>
      <div class="row compact list-row"><span id="dock-modal-area-label">Zone Area</span><span class="value" id="dock-modal-area">0</span></div>
      <div class="row compact list-row"><span id="dock-modal-size-label">Max Size</span><span class="value" id="dock-modal-max-size">small</span></div>
      <section id="dock-modal-inspection" class="port-inspection hidden" aria-live="polite">
        <div class="section-title">Pod Dock Inspection</div>
        <div id="dock-modal-capabilities" class="port-chip-row"></div>
        <div id="dock-modal-craft" class="port-inspection-note">No craft in position.</div>
        <div id="dock-modal-services" class="port-service-list"></div>
        <div id="dock-modal-stock" class="port-inspection-note"></div>
        <div id="dock-modal-blocker" class="port-inspection-blocker"></div>
      </section>
      <section id="dock-modal-diagnosis" class="port-inspection interface-diagnosis hidden" aria-live="polite"></section>
      <section id="dock-modal-routing">
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
      </section>
    </div>
  </div>
  <div id="room-modal" class="modal hidden">
    <div class="modal-card room-modal-card">
      <div class="modal-head">
        <h2>Room Inspector</h2>
        <button id="close-room" class="ghost-btn">Close</button>
      </div>
      <section id="room-modal-commercial" class="commercial-lease-panel hidden" aria-live="polite"></section>
      <div class="row compact list-row"><span>Room</span><span class="value" id="room-modal-type">none</span></div>
      <div class="row compact list-row"><span>Status</span><span class="value" id="room-modal-status">inactive</span></div>
      <div class="row compact list-row"><span>Cluster</span><span class="value" id="room-modal-cluster">0 tiles</span></div>
      <div class="row compact list-row"><span>Doors</span><span class="value" id="room-modal-doors">0</span></div>
      <div class="row compact list-row"><span>Pressurization</span><span class="value" id="room-modal-pressure">0%</span></div>
      <div class="row compact list-row"><span>Staff</span><span class="value" id="room-modal-staff">0/0</span></div>
      <section id="room-modal-workplace" class="room-workplace-panel hidden">
        <div class="room-workplace-head"><span><strong id="room-modal-workplace-name">Workplace</strong><small id="room-modal-workplace-roles">Role</small></span><span class="room-workplace-actions"><button id="room-modal-surge-workplace" type="button">Surge</button><button id="room-modal-plan-workplace" type="button">Plan staff</button></span></div>
        <div id="room-modal-workplace-status" class="room-workplace-status">No assigned crew.</div>
      </section>
      <div class="row compact list-row"><span>Service Nodes</span><span class="value" id="room-modal-nodes">0</span></div>
      <small id="room-modal-inventory">Inventory: n/a</small>
      <small id="room-modal-flow">Flow: n/a</small>
      <small id="room-modal-capacity">Capacity: n/a</small>
      <small id="room-modal-reputation">Reputation: n/a</small>
      <div class="row compact list-row"><span>Housing Policy</span><span class="value" id="room-modal-housing-policy">n/a</span></div>
      <select id="room-modal-housing-select">
        <option value="crew">Crew</option>
        <option value="visitor">Visitor/Shared</option>
        <option value="resident">Resident Shared</option>
        <option value="private_resident">Private Resident</option>
      </select>
      <small id="room-modal-housing">Housing: n/a</small>
      <small id="room-modal-berth">Berth: n/a</small>
      <section id="room-modal-berth-readiness" class="port-inspection hidden" aria-live="polite">
        <div class="section-title">Facility Readiness</div>
        <div id="room-modal-berth-readiness-rows" class="port-readiness-grid"></div>
        <div id="room-modal-berth-readiness-reason" class="port-inspection-blocker"></div>
      </section>
      <section id="room-modal-berth-diagnosis" class="port-inspection interface-diagnosis hidden" aria-live="polite"></section>
      <div id="room-modal-berth-config" class="hidden">
        <div class="section-title" style="margin-top:10px;">Berth Config</div>
        <div class="row compact list-row"><span>Purpose</span><span class="value" id="room-modal-berth-purpose">Visitor</span></div>
        <div class="row compact list-row"><span>Facing</span><span class="value" id="room-modal-berth-facing">auto</span></div>
        <div class="row compact list-row"><span>Screening</span><span class="value"><select id="room-modal-berth-screening"><option value="open">Open</option><option value="standard">Standard</option><option value="strict">Strict</option></select></span></div>
        <div class="row compact list-row"><span>Customs Policy</span><span class="value"><select id="room-modal-berth-customs"><option value="routine">Routine</option><option value="selective">Selective</option><option value="expedited">Expedited</option><option value="seizure">Seizure Office</option></select></span></div>
        <small id="room-modal-berth-config-note">Berths route by capability tags + the player allowlist below. Purpose is fixed to <em>Visitor</em> in v0; facing is derived from the cluster's exterior opening.</small>
        <div class="section-title" style="margin-top:10px;">Allowed Ship Types</div>
        <label><input type="checkbox" id="room-modal-berth-tourist" checked /> Tourist</label>
        <label><input type="checkbox" id="room-modal-berth-trader" /> Trader</label>
        <label><input type="checkbox" id="room-modal-berth-industrial" /> Industrial</label>
        <label><input type="checkbox" id="room-modal-berth-military" /> Military (Tier 3)</label>
        <label><input type="checkbox" id="room-modal-berth-colonist" /> Colonist (Tier 3)</label>
        <div class="section-title" style="margin-top:10px;">Allowed Ship Sizes</div>
        <label><input type="checkbox" id="room-modal-berth-small" checked /> Small</label>
        <label><input type="checkbox" id="room-modal-berth-medium" checked /> Medium</label>
        <label><input type="checkbox" id="room-modal-berth-large" checked /> Large</label>
      </div>
      <small id="room-modal-reasons">Inactive reasons: none</small>
      <small id="room-modal-warnings">Warnings: none</small>
      <small id="room-modal-hints">Hints: none</small>
      <div id="room-modal-sanitation" class="hidden">
        <div class="section-title" style="margin-top:10px;">Sanitation</div>
        <div class="row compact list-row"><span>Average dirt</span><span class="value" id="room-modal-sanitation-avg">0</span></div>
        <div class="row compact list-row"><span>Source</span><span class="value" id="room-modal-sanitation-source">none</span></div>
        <small id="room-modal-sanitation-effect">Effect: clean.</small>
        <small id="room-modal-sanitation-fix">Fix: nothing needed.</small>
      </div>
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

// Resolve the world seed once, up front, so the charter screen surveys the
// exact system the game boots on. createInitialState defaults to 1337; an
// optional ?seed=<int> overrides it. Because state.system is generated from
// this same seed and mountCharterScreen renders state.system, the map you
// charter on is guaranteed to be the map you get.
const gameSeed = (() => {
  const raw = new URLSearchParams(location.search).get('seed');
  if (raw === null) return 1337;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 1337;
})();
const state = createInitialState({ seed: gameSeed, physicalStarterInventory: true, manualTrafficAdmission: true });
const dockEconomyFeedback = new DockEconomyFeedbackLayer({ resultLifetime: 9, maxVisibleChips: 16 });
const openingEconomyPanels = mountOpeningEconomyPanels({
  host: app!,
  // The Site Brief joins the existing floating left stack so it flows under
  // the goal and watch cards rather than covering the berth ops widget.
  siteBriefHost: document.querySelector<HTMLElement>('.left-stack'),
  onAction: (action) => {
    if (action.type === 'order-stock') {
      const result = buyImportedTradeGoodsDetailed(state);
      toolLockMessage = result.message;
    } else if (action.type === 'set-pricing-policy') {
      setMarketPricingPolicy(state, action.policy);
    } else if (action.type === 'accept-project') {
      acceptOpeningCapitalProject(state, action.projectId as CapitalProjectId);
    }
    refreshOpeningEconomyPanels();
  }
});

function openingEconomyPanelView(): OpeningEconomyPanelView {
  // Pass the live SystemMap so the in-station Site Brief reads the same
  // composition-aware forecast the Charter screen showed at selection. Without
  // it the brief silently falls back to the legacy site-only model and can
  // recommend a different leading service than the one the player chose on.
  const siteForecast = computeCharterOperatingForecast(state.site, state.system ?? undefined);
  const profile = siteForecast.economy;
  const policy = marketPolicyEffect(state.openingEconomy.marketPricingPolicy);
  const summary = getOpeningEconomySummary(state, 120);
  const marketTiles = new Set(
    state.moduleInstances
      .filter((module) => module.type === ModuleType.MarketStall)
      .map((module) => module.originTile)
  );
  const marketNodes = state.itemNodes.filter((node) => marketTiles.has(node.tileIndex));
  const stock = marketNodes.reduce((sum, node) => sum + Math.max(0, node.items.tradeGood ?? 0), 0);
  const capacity = marketNodes.reduce((sum, node) => sum + Math.max(0, node.capacity), 0);
  const recentRetail = state.openingEconomy.ledger.recent.filter((event) =>
    event.kind === 'retail-sale' && event.label.includes('Travel supplies') && event.at >= state.now - 120
  );
  const recentUnitsSold = recentRetail.length;
  const recentMargin = recentRetail.reduce((sum, event) => sum + event.credits - event.costBasis, 0);
  const travelSupplyQuote = quoteTravelSuppliesOrder(state);
  const wholesaleUnitCost = travelSupplyQuote.creditCost / Math.max(1, travelSupplyQuote.requestedAmount);
  const saleUnitPrice = 1.15 * 5.5 * policy.salePriceMultiplier * profile.retailDemandMultiplier;
  const grouped = [
    { label: 'Travelers and docking', credits: summary.byKind['dock-fee'].net + summary.byKind['passenger-service'].net },
    { label: 'Meals and retail', credits: summary.byKind['retail-sale'].net },
    { label: 'Fuel, repairs, and courier work', credits: summary.byKind['fuel-sale'].net + summary.byKind['repair-service'].net + summary.byKind['courier-fee'].net },
    { label: 'Stock purchases', credits: summary.byKind['supplier-purchase'].net },
    { label: 'Payroll and construction', credits: summary.byKind.wages.net + summary.byKind.construction.net }
  ].filter((group) => Math.abs(group.credits) > 0.01);
  const projects = getOpeningCapitalProjects(state);
  return {
    ledger: {
      credits: state.metrics.credits,
      windowLabel: 'Last 2 minutes',
      revenue: summary.revenue,
      expenses: summary.expenses,
      net: summary.net,
      groups: grouped.map((group) => ({ ...group, tone: group.credits > 0 ? 'good' as const : 'warn' as const })),
      events: state.openingEconomy.ledger.recent.slice(-12).reverse().map((event) => ({
        ...event,
        at: Math.max(0, state.now - event.at)
      }))
    },
    shop: {
      stock,
      capacity,
      wholesaleUnitCost,
      saleUnitPrice,
      recentUnitsSold,
      recentMargin,
      demandLabel: profile.trafficLabel,
      demandDetail: `${state.openingEconomy.marketPricingPolicy} pricing · ${Math.round(profile.retailDemandMultiplier * policy.demandMultiplier * 100)}% local demand`,
      pricingPolicy: state.openingEconomy.marketPricingPolicy,
      canOrderStock: travelSupplyQuote.ok,
      orderLabel: travelSupplyQuote.reason === 'delivery_pending'
        ? 'Supplier pod en route'
        : `Order ${travelSupplyQuote.requestedAmount} supplies by pod`,
      orderCost: travelSupplyQuote.creditCost,
      emptyStockMessage: travelSupplyQuote.ok
        ? 'Out of travel supplies. Order a supplier pod or travelers cannot shop.'
        : travelSupplyQuote.message
    },
    // Same shared forecast the Charter screen rendered before the game
    // started, so the site reading stays recognizable after opening.
    siteBrief: {
      title: siteForecast.chartered ? 'Chartered site' : 'Standard orbit',
      primary: siteForecast.headline,
      secondary: siteForecast.summary,
      composition: siteForecast.compositionLine,
      traits: siteForecast.chips.map((chip) => ({
        label: chip.label,
        detail: chip.detail,
        tone: chip.tone
      }))
    },
    projects: {
      maxActive: 2,
      activeCount: state.openingEconomy.capitalProjects.active.length,
      projects: projects.map((project) => ({
        id: project.id,
        title: project.title,
        description: project.summary,
        state: project.state,
        advance: project.advanceCredits,
        reward: project.completionCredits,
        conditions: project.conditions.map((condition) => ({
          label: condition.label,
          current: Math.floor(condition.current),
          target: condition.target
        }))
      }))
    }
  };
}

function refreshOpeningEconomyPanels(): void {
  openingEconomyPanels.render(openingEconomyPanelView());
}

// Market operations belong at the market. Every fixture on the retail chain
// opens the same shop surface: the stall, the shelves shoppers browse, the
// checkout they queue at, and the backroom that refills the shelves.
const MARKET_FIXTURE_TYPES = new Set<ModuleType>([
  ModuleType.MarketStall,
  ModuleType.ShelfAisle,
  ModuleType.CheckoutBank,
  ModuleType.BackroomStockBank
]);

/** Origin tile the shop panel is currently pinned to, or null when closed. */
let shopAnchorTile: number | null = null;

/** The clicked tile's market fixture, reported by its origin tile. */
function marketFixtureOriginAtTile(tileIndex: number): number | null {
  const moduleId = state.moduleOccupancyByTile[tileIndex] ?? -1;
  if (moduleId < 0) return null;
  const module = state.moduleInstances.find((entry) => entry.id === moduleId);
  return module && MARKET_FIXTURE_TYPES.has(module.type) ? module.originTile : null;
}

function firstMarketFixtureTile(): number | null {
  return state.moduleInstances.find((module) => MARKET_FIXTURE_TYPES.has(module.type))?.originTile ?? null;
}

/**
 * Open the retail surface beside a physical fixture.
 *
 * With no fixture on the station yet — the recipe opens the shop before the
 * Shelf Aisle exists so the player can price the opening order — there is
 * nothing to anchor to and the panel falls back to the centered layout.
 */
function openMarketSurface(anchorTile: number | null): void {
  shopAnchorTile = anchorTile;
  refreshOpeningEconomyPanels();
  if (anchorTile === null) {
    openingEconomyPanels.open('shop');
    return;
  }
  const fixture = tileClientRect(anchorTile);
  openingEconomyPanels.open('shop', { x: fixture.x + fixture.size * 0.5, y: fixture.y });
}

/** Keep the anchored shop pinned to its fixture while the camera moves. */
function syncAnchoredShopPanel(): void {
  if (shopAnchorTile === null) return;
  if (openingEconomyPanels.openPanelName() !== 'shop') {
    shopAnchorTile = null;
    return;
  }
  // Selling or demolishing the fixture takes its operating surface with it,
  // rather than leaving a shop card pointing at empty floor.
  if (marketFixtureOriginAtTile(shopAnchorTile) === null) {
    shopAnchorTile = null;
    openingEconomyPanels.close();
    return;
  }
  const fixture = tileClientRect(shopAnchorTile);
  openingEconomyPanels.setAnchor({ x: fixture.x + fixture.size * 0.5, y: fixture.y });
}

function drawOpeningDockFeedback(renderViewport: RenderViewport | null): void {
  const podShips = state.arrivingShips.filter((ship) => ship.smallCraftVisit);
  const liveShipIds = new Set(podShips.filter((ship) => ship.stage !== 'depart').map((ship) => ship.id));
  const arrivals = podShips
    .filter((ship) => ship.stage !== 'depart' && ship.assignedDockId !== null)
    .flatMap((ship) => {
      const dock = state.docks.find((candidate) => candidate.id === ship.assignedDockId);
      if (!dock) return [];
      const dockTile = dock.moduleId === undefined
        ? dock.tiles[0]
        : state.moduleInstances.find((module) => module.id === dock.moduleId)?.originTile ?? dock.tiles[0];
      const freightOperation = state.openingEconomy.podFreightOperations.find((operation) =>
        operation.dockId === dock.id &&
        operation.status !== 'complete' &&
        operation.status !== 'cancelled' &&
        operation.status !== 'expired'
      );
      const wants: string[] = [];
      if (ship.manifestDemand.cafeteria >= 0.3) wants.push('food');
      if (ship.manifestDemand.market >= 0.22) wants.push('supplies');
      for (const service of ship.smallCraftVisit?.services ?? []) {
        if (service.kind === 'refuel') wants.push('fuel');
        if (service.kind === 'freight') wants.push('cargo');
        if (service.kind === 'repair') wants.push('repair');
      }
      // OPEN-02 asks the chip to show request, current operation, and result.
      // The middle one comes from whatever service is physically running now.
      const runningService = ship.smallCraftVisit?.services.find((service) => service.status === 'active');
      const activeOperation = runningService
        ? `${runningService.kind} ${Math.round(clamp(runningService.progress, 0, 1) * 100)}%`
        : ship.smallCraftVisit?.services.find((service) => service.status === 'blocked')
          ? `blocked: ${ship.smallCraftVisit.services.find((service) => service.status === 'blocked')?.blockedReason ?? 'no facility'}`
          : '';
      const remainingFreight = freightOperation?.kind === 'supplier-delivery'
        ? Math.max(0, freightOperation.orderedUnits - freightOperation.unloadedUnits)
        : freightOperation?.kind === 'courier-handling'
          ? Math.max(0, freightOperation.consignedUnits - freightOperation.completedUnits)
          : 0;
      return [{
        visitId: ship.id,
        dockTileIndex: dockTile,
        label: freightOperation?.kind === 'supplier-delivery'
          ? 'Supplier delivery'
          : freightOperation?.kind === 'courier-handling'
            ? 'Courier handling'
            : `Pod ${ship.id}`,
        demand: freightOperation?.kind === 'supplier-delivery'
          ? `${remainingFreight} travel supplies for your shop`
          : freightOperation?.kind === 'courier-handling'
            ? `${freightOperation.direction} · ${remainingFreight} consigned crates`
            : `${ship.passengersTotal} traveler${ship.passengersTotal === 1 ? '' : 's'} · ${[...new Set(wants)].join(' + ') || 'quick stop'}${
              activeOperation ? ` · now: ${activeOperation}` : ''
            }`
      }];
    });

  const eventsByShip = new Map<number, typeof state.openingEconomy.ledger.recent>();
  for (const event of state.openingEconomy.ledger.recent) {
    if (event.siteTag !== 'pod-dock' || event.sourceId === undefined || event.at < state.now - 9) continue;
    const events = eventsByShip.get(event.sourceId) ?? [];
    events.push(event);
    eventsByShip.set(event.sourceId, events);
  }
  const departures: DockDepartureResult[] = [];
  for (const [shipId, events] of eventsByShip) {
    const ship = podShips.find((candidate) => candidate.id === shipId);
    if (liveShipIds.has(shipId) && ship?.stage !== 'depart') continue;
    const tileIndex = events.find((event) => event.tileIndex !== undefined)?.tileIndex;
    if (tileIndex === undefined) continue;
    const liveMissed = ship?.smallCraftVisit?.services
      .filter((service) => service.status === 'blocked' || service.status === 'skipped')
      .map((service) => service.kind)
      .join(' + ');
    const recordedMissed = events
      .filter((event) => event.label.startsWith('Missed '))
      .map((event) => event.label.slice('Missed '.length))
      .join(' + ');
    // OPEN-02: the filed outcome knows what this call wanted across all three
    // opening families and what the station physically delivered, so the chip
    // can price the opportunity rather than just naming it.
    const outcomeRecord = state.openingEconomy.podDemand.recent.find((entry) => entry.visitId === shipId);
    const missedFamilies = outcomeRecord
      ? POD_DEMAND_FAMILIES
          .filter((family) => outcomeRecord.wanted[family] > outcomeRecord.served[family])
          .map((family) => (family === 'food' ? 'food' : family === 'supplies' ? 'supplies' : 'ship service'))
      : [];
    const missedLabel = missedFamilies.length > 0
      ? `wanted ${missedFamilies.join(' + ')} · est. ${outcomeRecord?.missedCredits ?? 0}c missed`
      : liveMissed || recordedMissed;
    const resultLabels = events.filter((event) => !event.label.startsWith('Missed '));
    const servedSummary = outcomeRecord
      ? POD_DEMAND_FAMILIES
          .filter((family) => outcomeRecord.served[family] > 0)
          .map((family) => `${family === 'food' ? 'meals' : family === 'supplies' ? 'supplies' : 'ship service'} ${outcomeRecord.served[family]}`)
          .join(' · ')
      : '';
    departures.push({
      visitId: shipId,
      dockTileIndex: tileIndex,
      settledAt: Math.max(...events.map((event) => event.at)),
      events,
      serviceSummary: servedSummary
        || [...new Set(resultLabels.map((event) => event.label))].slice(0, 2).join(' · ')
        || (outcomeRecord ? 'bought nothing' : ''),
      missedOpportunity: missedLabel || undefined,
      outcome: missedLabel ? 'partial' : 'success'
    });
  }
  dockEconomyFeedback.update({
    now: state.now,
    gridWidth: state.width,
    gridHeight: state.height,
    tileSize: TILE_SIZE,
    arrivals,
    departures,
    viewport: renderViewport
  });
  dockEconomyFeedback.render(ctx);
}

type StarterLayoutRecord = { savedAt: number; payloadText: string };

function openStarterLayoutDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STARTER_LAYOUT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STARTER_LAYOUT_STORE_NAME)) {
        request.result.createObjectStore(STARTER_LAYOUT_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open starter layout storage.'));
  });
}

async function readStarterLayoutRecord(): Promise<StarterLayoutRecord | null> {
  const database = await openStarterLayoutDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STARTER_LAYOUT_STORE_NAME, 'readonly');
      const request = transaction.objectStore(STARTER_LAYOUT_STORE_NAME).get(STARTER_LAYOUT_RECORD_KEY);
      request.onsuccess = () => {
        const record = request.result as Partial<StarterLayoutRecord> | undefined;
        resolve(typeof record?.savedAt === 'number' && typeof record?.payloadText === 'string'
          ? { savedAt: record.savedAt, payloadText: record.payloadText }
          : null);
      };
      request.onerror = () => reject(request.error ?? new Error('Could not read the starter layout.'));
    });
  } finally {
    database.close();
  }
}

async function writeStarterLayoutRecord(record: StarterLayoutRecord): Promise<void> {
  const database = await openStarterLayoutDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STARTER_LAYOUT_STORE_NAME, 'readwrite');
      transaction.objectStore(STARTER_LAYOUT_STORE_NAME).put(record, STARTER_LAYOUT_RECORD_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the starter layout.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Starter layout save was cancelled.'));
    });
  } finally {
    database.close();
  }
}

async function deleteStarterLayoutRecord(): Promise<void> {
  const database = await openStarterLayoutDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STARTER_LAYOUT_STORE_NAME, 'readwrite');
      transaction.objectStore(STARTER_LAYOUT_STORE_NAME).delete(STARTER_LAYOUT_RECORD_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not reset the starter layout.'));
    });
  } finally {
    database.close();
  }
}

type StarterInventorySource = Pick<StationState, 'itemNodes' | 'moduleInstances' | 'modules' | 'legacyMaterialStock'>;

function moduleTypeAtInventoryNode(source: StarterInventorySource, tileIndex: number): ModuleType {
  return source.moduleInstances.find((module) => module.originTile === tileIndex)?.type
    ?? source.modules[tileIndex]
    ?? ModuleType.None;
}

function seedFreshStarterInventory(target: StationState, fresh: StarterInventorySource): void {
  const stockByModule = new Map<ModuleType, Partial<Record<ItemType, number>>>();
  for (const node of fresh.itemNodes) {
    const module = moduleTypeAtInventoryNode(fresh, node.tileIndex);
    const totals = stockByModule.get(module) ?? {};
    for (const [itemKey, amountValue] of Object.entries(node.items)) {
      const item = itemKey as ItemType;
      const amount = Math.max(0, amountValue ?? 0);
      totals[item] = (totals[item] ?? 0) + amount;
    }
    stockByModule.set(module, totals);
  }

  target.itemNodes = target.itemNodes.map((node) => ({
    tileIndex: node.tileIndex,
    capacity: node.capacity,
    items: {}
  }));
  target.legacyMaterialStock = fresh.legacyMaterialStock;

  for (const [module, stock] of stockByModule.entries()) {
    const nodes = target.itemNodes.filter((node) => moduleTypeAtInventoryNode(target, node.tileIndex) === module);
    for (const [itemKey, amountValue] of Object.entries(stock)) {
      const item = itemKey as ItemType;
      let remaining = Math.max(0, amountValue ?? 0);
      for (const node of nodes) {
        const used = Object.values(node.items).reduce((sum, amount) => sum + Math.max(0, amount ?? 0), 0);
        const accepted = Math.min(remaining, Math.max(0, node.capacity - used));
        if (accepted > 0) node.items[item] = (node.items[item] ?? 0) + accepted;
        remaining -= accepted;
        if (remaining <= 0) break;
      }
      if (item === 'rawMaterial' && remaining > 0) target.legacyMaterialStock += remaining;
    }
  }
}

function applyStarterLayout(target: StationState, authored: StationState): void {
  if (target.width !== authored.width || target.height !== authored.height) {
    throw new Error(`Starter layout is ${authored.width}x${authored.height}; expected ${target.width}x${target.height}.`);
  }

  const freshInventory: StarterInventorySource = {
    itemNodes: target.itemNodes.map((node) => ({ ...node, items: { ...node.items } })),
    moduleInstances: target.moduleInstances.map((module) => ({ ...module, tiles: [...module.tiles] })),
    modules: target.modules.slice(),
    legacyMaterialStock: target.legacyMaterialStock
  };
  target.tiles = authored.tiles.slice();
  target.zones = authored.zones.slice();
  target.rooms = authored.rooms.slice();
  target.roomHousingPolicies = authored.roomHousingPolicies.slice();
  target.modules = authored.modules.slice();
  target.moduleInstances = authored.moduleInstances.map((module) => ({ ...module, tiles: [...module.tiles] }));
  target.moduleOccupancyByTile = authored.moduleOccupancyByTile.slice();
  target.core = { ...authored.core, frameTiles: [...authored.core.frameTiles] };
  target.docks = authored.docks.map((dock) => ({
    ...dock,
    tiles: [...dock.tiles],
    approachTiles: [...dock.approachTiles],
    allowedShipTypes: [...dock.allowedShipTypes],
    allowedShipSizes: [...dock.allowedShipSizes],
    podCapabilities: dock.podCapabilities ? [...dock.podCapabilities] : undefined,
    attachmentModuleIds: dock.attachmentModuleIds ? { ...dock.attachmentModuleIds } : undefined,
    occupiedByShipId: null
  }));
  target.berthConfigs = authored.berthConfigs.map((config) => ({
    ...config,
    allowedShipTypes: [...config.allowedShipTypes],
    allowedShipSizes: [...config.allowedShipSizes],
    serviceScore: 50,
    serviceVisits: 0,
    serviceLastDelta: 0
  }));
  target.mapWorldOriginX = authored.mapWorldOriginX;
  target.mapWorldOriginY = authored.mapWorldOriginY;
  target.utilityUnderlay = {
    version: authored.utilityUnderlay.version + 1,
    layers: Object.fromEntries(
      Object.entries(authored.utilityUnderlay.layers).map(([kind, layer]) => [kind, new Uint8Array(layer)])
    ) as StationState['utilityUnderlay']['layers']
  };
  target.itemNodes = authored.itemNodes;
  target.moduleSpawnCounter = authored.moduleSpawnCounter;
  target.commercialUnits = [];
  target.commercialUnitSpawnCounter = 1;
  target.commercialOfferSpawnCounter = 1;
  target.constructionSites = [];
  target.pressurized = authored.pressurized.slice();
  target.airQualityByTile = Float32Array.from(target.pressurized, (pressurized) => pressurized ? 100 : 0);
  target.heatByTile = new Float32Array(target.tiles.length).fill(42);
  target.staleAirByTile = new Float32Array(target.tiles.length);
  target.dirtByTile = new Float32Array(target.tiles.length);
  target.dirtSourceByTile = new Uint8Array(target.tiles.length);
  target.plumbing = {
    version: authored.plumbing.version + 1,
    floodByTile: new Float32Array(target.tiles.length),
    leaks: [],
    nextLeakId: 1
  };
  target.maintenanceDebts = [];
  target.pathOccupancyByTile = new Map();
  target.topologyVersion = Math.max(target.topologyVersion, authored.topologyVersion) + 1;
  target.roomVersion = Math.max(target.roomVersion, authored.roomVersion) + 1;
  target.moduleVersion = Math.max(target.moduleVersion, authored.moduleVersion) + 1;
  target.dockVersion = Math.max(target.dockVersion, authored.dockVersion) + 1;
  target.mapConditionVersion = Math.max(target.mapConditionVersion, authored.mapConditionVersion) + 1;
  target.derived = authored.derived;
  // Dock capabilities belong to the physical Pod Dock attachments in the
  // applied layout. Rebuild them now instead of trusting metadata serialized
  // by an older starter template (or waiting for a later simulation frame).
  rebuildDockEntities(target);
  seedFreshStarterInventory(target, freshInventory);
  target.metrics.materials = target.legacyMaterialStock + target.itemNodes.reduce(
    (sum, node) => sum + (node.items.rawMaterial ?? 0),
    0
  );
  const walkableTiles = target.tiles
    .map((tile, tileIndex) => WALKABLE_TILES.has(tile) ? tileIndex : -1)
    .filter((tileIndex) => tileIndex >= 0);
  target.crewMembers.forEach((crew, index) => {
    if (WALKABLE_TILES.has(target.tiles[crew.tileIndex])) return;
    const tileIndex = walkableTiles[index % Math.max(1, walkableTiles.length)];
    if (tileIndex === undefined) return;
    const tile = fromIndex(tileIndex, target.width);
    crew.tileIndex = tileIndex;
    crew.x = tile.x + 0.5;
    crew.y = tile.y + 0.5;
    crew.path = [];
    crew.targetTile = null;
    crew.activeJobId = null;
  });
  target.controls.paused = true;
  tick(target, 0);
}

// Cached so New Game can rebuild an authored starter without re-reading
// storage. `null` means "stock layout"; the read is done once at bootstrap.
let savedStarterLayoutState: StationState | null = null;

async function applySavedStarterLayout(): Promise<void> {
  if (startupParams.has('load') || startupParams.has('loadId') || startupParams.has('scenario')) return;
  if (startupParams.get('starter') === 'stock') return;
  const record = await readStarterLayoutRecord();
  if (!record) return;
  const parsed = parseAndMigrateSave(record.payloadText);
  if (!parsed.ok) {
    console.warn('[starter-layout] stored template is invalid:', parsed.error);
    return;
  }
  try {
    const authored = hydrateStateFromSave(parsed.save, { seed: gameSeed }).state;
    savedStarterLayoutState = authored;
    applyStarterLayout(state, authored);
    console.info(`[starter-layout] applied template saved ${new Date(record.savedAt).toLocaleString()}`);
  } catch (error) {
    console.warn('[starter-layout] could not apply stored template:', error);
  }
}

/**
 * Build the exact station a New Game should begin from: the stock starter
 * factory plus the authored starter template when one is stored.
 *
 * TRUTH-01. New Game used to keep whatever `state` the session already held.
 * A failed Continue left a half-hydrated station behind, and nothing reset
 * progression, metrics, rating history or scenario overlays, so a fresh
 * charter could inherit an older run's unlock tier and goal progress.
 */
function buildFreshGameState(): StationState {
  const fresh = createInitialState({
    seed: gameSeed,
    physicalStarterInventory: true,
    manualTrafficAdmission: true
  });
  if (savedStarterLayoutState) applyStarterLayout(fresh, savedStarterLayoutState);
  return fresh;
}

// The fresh state now owns a complete, visible Berth room. Keeping starter
// topology in one factory prevents this UI bootstrap from silently punching
// unzoned dock tiles through the authored station.

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

// Commercial showcase helper: keep the normal scenario interactive, while
// allowing focused visual checks to begin with a specific lease in fit-out.
(function applyCommercialLeaseParam() {
  const params = new URLSearchParams(location.search);
  const lease = params.get('lease');
  if (params.get('scenario') !== 'commercial-units' || !lease) return;
  const shellTile = 21 * state.width + 46;
  for (let tile = 0; tile < state.rooms.length; tile++) {
    if (state.rooms[tile] === RoomType.CommercialUnit) state.pressurized[tile] = true;
  }
  const result = openCommercialUnitForOffers(state, shellTile);
  const offer = result.unit?.offers.find((candidate) => candidate.kind === lease);
  if (!result.ok || !result.unit || !offer) {
    console.warn(`[commercial] showcase lease '${lease}' is unavailable.`);
    return;
  }
  acceptCommercialOffer(state, result.unit.id, offer.id);
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
let spriteAtlasLoadInFlight = false;
let spriteAtlasRetryTimer: number | null = null;

function requestSpriteAtlasLoad(): void {
  if (spriteAtlasLoadInFlight || state.controls.spriteMode !== 'sprites') return;
  spriteAtlasLoadInFlight = true;
  void loadSpriteAtlas(state.controls.spritePipeline).then((loaded) => {
    spriteAtlas = loaded;
    spriteAtlasLoadInFlight = false;
    refreshCrewPanel();
    refreshModulePaletteSprites();
    if (loaded.ready) {
      if (spriteAtlasRetryTimer !== null) window.clearTimeout(spriteAtlasRetryTimer);
      spriteAtlasRetryTimer = null;
      return;
    }
    if (state.controls.spriteMode === 'sprites' && spriteAtlasRetryTimer === null) {
      spriteAtlasRetryTimer = window.setTimeout(() => {
        spriteAtlasRetryTimer = null;
        requestSpriteAtlasLoad();
      }, 3000);
    }
  });
}
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

const openPortDispatchBtn = document.querySelector<HTMLButtonElement>('#open-port-dispatch')!;
const dispatchTriggerTitleEl = document.querySelector<HTMLElement>('#dispatch-trigger-title')!;
const dispatchTriggerMetaEl = document.querySelector<HTMLElement>('#dispatch-trigger-meta')!;
const dispatchTriggerCountEl = document.querySelector<HTMLElement>('#dispatch-trigger-count')!;
const portDispatchModal = document.querySelector<HTMLDivElement>('#port-dispatch-modal')!;
const closePortDispatchBtn = document.querySelector<HTMLButtonElement>('#close-port-dispatch')!;
const stationGoalCardEl = document.querySelector<HTMLElement>('#station-goal-card')!;
const stationGoalStageEl = document.querySelector<HTMLElement>('#station-goal-stage')!;
const stationGoalTitleEl = document.querySelector<HTMLElement>('#station-goal-title')!;
const stationGoalItemsEl = document.querySelector<HTMLElement>('#station-goal-items')!;
const stationGoalFillEl = document.querySelector<HTMLElement>('#station-goal-fill')!;
const openProgressionSummaryBtn = document.querySelector<HTMLButtonElement>('#open-progression-summary')!;
const stationTierCurrentEl = document.querySelector<HTMLElement>('#station-tier-current')!;
const stationTierNextEl = document.querySelector<HTMLElement>('#station-tier-next')!;
const stationTierRequirementEl = document.querySelector<HTMLElement>('#station-tier-requirement')!;
const shipsInput = document.querySelector<HTMLInputElement>('#ships')!;
const shipsLabel = document.querySelector<HTMLSpanElement>('#ships-label')!;
const trafficStatusEl = document.querySelector<HTMLElement>('#traffic-status')!;
const shiftBriefEl = document.querySelector<HTMLElement>('#shift-brief')!;
const trafficOfferListEl = document.querySelector<HTMLElement>('#traffic-offer-list')!;
const trafficActionNoteEl = document.querySelector<HTMLElement>('#traffic-action-note')!;
const portAutoToggleEl = document.querySelector<HTMLButtonElement>('#toggle-port-auto')!;
const portAutoStatusEl = document.querySelector<HTMLElement>('#port-auto-status')!;
const approachPolicyEl = document.querySelector<HTMLElement>('#approach-policy')!;
const approachReputationPullEl = document.querySelector<HTMLElement>('#approach-reputation-pull')!;
const failureEpisodeListEl = document.querySelector<HTMLElement>('#failure-episode-list')!;
const failureEpisodeCountEl = document.querySelector<HTMLElement>('#failure-episode-count')!;
const admissionPolicyEditorEl = document.querySelector<HTMLElement>('#admission-policy-editor')!;
const admissionPolicyEnabledEl = document.querySelector<HTMLInputElement>('#admission-policy-enabled')!;
const admissionPodEnabledEl = document.querySelector<HTMLInputElement>('#admission-pod-enabled')!;
const admissionBerthEnabledEl = document.querySelector<HTMLInputElement>('#admission-berth-enabled')!;
const admissionPressureEl = document.querySelector<HTMLElement>('#admission-pressure')!;
const admissionManualOverrideEl = document.querySelector<HTMLButtonElement>('#admission-manual-override')!;
const berthOpsAnchorsEl = document.querySelector<HTMLElement>('#berth-ops-anchors')!;
const settlementSummaryEl = document.querySelector<HTMLElement>('#settlement-summary')!;
const settlementCardEl = document.querySelector<HTMLElement>('#settlement-card')!;
const bottomDockEl = document.querySelector<HTMLElement>('#bottom-dock')!;

// The bottom dock is fixed to the viewport bottom, is content-sized, and shares
// a z-index with the left HUD stack — so whatever the stack lays out below the
// dock's top edge is painted over and unreadable. The dock's height is only
// known at runtime, so publish it and let the stack bound itself against it.
function publishBottomDockHeight(): void {
  const height = bottomDockEl.getBoundingClientRect().height;
  document.documentElement.style.setProperty('--bottom-dock-h', `${Math.round(height)}px`);
}
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(publishBottomDockHeight).observe(bottomDockEl);
}
window.addEventListener('resize', publishBottomDockHeight);
publishBottomDockHeight();

const cargoArmRowEl = document.querySelector<HTMLElement>('#cargo-arm-row')!;
const cargoArmStatusEl = document.querySelector<HTMLElement>('#cargo-arm-status')!;
const buyPreparedMealsBtn = document.querySelector<HTMLButtonElement>('#buy-prepared-meals')!;
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
const hudAirControlEl = document.querySelector<HTMLButtonElement>('#hud-air-control')!;
const airEmergencyIndicatorEl = document.querySelector<HTMLButtonElement>('#air-emergency-indicator')!;
const diagnosticOverlayBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-diagnostic-overlay]'));
const diagnosticReadoutEl = document.querySelector<HTMLElement>('#diagnostic-readout')!;
const diagnosticKeyEl = document.querySelector<HTMLElement>('#diagnostic-key')!;
const diagnosticKeyTitleEl = document.querySelector<HTMLElement>('#diagnostic-key-title')!;
const diagnosticKeyStatsEl = document.querySelector<HTMLElement>('#diagnostic-key-stats')!;
const diagnosticKeyRowsEl = document.querySelector<HTMLElement>('#diagnostic-key-rows')!;
const spriteStatusEl = document.querySelector<HTMLElement>('#sprite-status')!;

const DIAGNOSTIC_OVERLAY_LABELS: Record<DiagnosticOverlay, string> = {
  none: 'Normal View',
  'life-support': 'Air Coverage',
  'utility-underlay': 'Utility Networks',
  structural: 'Structural Support',
  thermal: 'Thermal',
  'visitor-status': 'Guest Appeal',
  'resident-comfort': 'Resident Comfort',
  'service-noise': 'Service Noise',
  maintenance: 'Maintenance',
  sanitation: 'Cleanliness',
  'map-conditions': 'Map Conditions',
  'route-pressure': 'Foot Traffic',
  reputation: 'Security & Risk'
};
const DIAGNOSTIC_OVERLAYS: DiagnosticOverlay[] = [
  'none',
  'life-support',
  'utility-underlay',
  'structural',
  'thermal',
  'visitor-status',
  'resident-comfort',
  'service-noise',
  'maintenance',
  'sanitation',
  'map-conditions',
  'route-pressure',
  'reputation'
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
  if (overlay === 'utility-underlay') {
    const air = getAirDuctNetworkDiagnostics(state);
    const water = getWaterPipeNetworkDiagnostics(state);
    const fuel = getFuelPipeNetworkDiagnostics(state);
    const globalLine =
      `Utilities: air ${state.metrics.lifeSupportCoveragePct.toFixed(0)}% covered · ${air.networkCount} duct networks | ` +
      `water ${water.poweredSinkCount}/${water.sinkCount} fixtures · ${water.sourceCount} sources · ${water.disconnectedTileCount} disconnected | ` +
      `fuel ${fuel.poweredSinkCount}/${fuel.sinkCount} couplers · ${fuel.sourceCount} tanks · ${fuel.disconnectedTileCount} disconnected | ` +
      `leaks ${state.metrics.activePlumbingLeaks}`;
    if (hoveredTile === null) {
      return `${globalLine}\nDraw Air Ducts to Vents, Water Pipes to wet fixtures, or Fuel Pipes from Maintenance Fuel Tanks to Fuel Couplers.`;
    }
    const p = fromIndex(hoveredTile, state.width);
    const diagnosticKind = currentTool.kind === 'utility-underlay' && !currentTool.utilityErase
      ? currentTool.utilityKind
      : undefined;
    const diagnostic = getUtilityUnderlayTileDiagnostic(state, p.x, p.y, diagnosticKind);
    if (!diagnostic) return `${globalLine}\n${diagnosticHoverPrefix()}: no utility sample.`;
    const network = diagnostic.componentId !== null ? `network ${diagnostic.componentId}` : 'no network';
    return `${globalLine}\n${diagnosticHoverPrefix()}: ${diagnostic.reason}; ${network}; ${diagnostic.effect}; fix: ${diagnostic.fix}.`;
  }
  if (overlay === 'maintenance') {
    const globalLine = `Maintenance: max ${state.metrics.maintenanceDebtMax.toFixed(0)}% | open ${state.metrics.maintenanceJobsOpen}`;
    if (hoveredTile === null) return `${globalLine}\nHover hull, dock, berth, module, reactor, or life-support tiles for source/effect/fix.`;
    const p = fromIndex(hoveredTile, state.width);
    const diagnostic = getMaintenanceTileDiagnostic(state, p.x, p.y);
    if (!diagnostic) {
      const debris = mapConditionSamplesAt(state, hoveredTile).find((sample) => sample.kind === 'debris-risk');
      return `${globalLine}\n${diagnosticHoverPrefix()}: no maintenance wear here${debris ? `; ${debris.label} ${(debris.value * 100).toFixed(0)}%` : ''}.`;
    }
    const repair = diagnostic.exterior ? 'EVA repair' : 'interior repair';
    return `${globalLine}\n${diagnosticHoverPrefix()}: ${diagnostic.label} ${diagnostic.debt.toFixed(0)}% | ${diagnostic.source} | ${diagnostic.effect} | ${repair}.`;
  }
  if (overlay === 'thermal') {
    const globalLine = `Thermal: avg ${state.metrics.thermalAvg.toFixed(0)}% | max ${state.metrics.thermalMax.toFixed(0)}% | hot ${state.metrics.hotTiles} | stale ${state.metrics.staleAirTiles}`;
    if (hoveredTile === null) return `${globalLine}\nHover a room tile for condition, heat/stale cause, effect, and fix.`;
    const p = fromIndex(hoveredTile, state.width);
    const diagnostic = getThermalTileDiagnostic(state, p.x, p.y);
    if (!diagnostic) return `${globalLine}\n${diagnosticHoverPrefix()}: no thermal room sample here.`;
    const condition = diagnostic.sunlight >= 0.65 ? 'bright sun' : diagnostic.sunlight <= 0.28 ? 'deep shade' : 'mixed light';
    return `${globalLine}\n${diagnosticHoverPrefix()}: ${condition} | heat ${diagnostic.heat.toFixed(0)}% | stale ${diagnostic.staleAir.toFixed(0)}% | cause ${diagnostic.cause} | ${diagnostic.effect} | fix: ${diagnostic.fix}.`;
  }
  if (overlay === 'sanitation') {
    const departmentLine = `Sanitation Department: ${departmentStatusText('sanitation')}`;
    const globalLine = `Sanitation: avg ${state.metrics.sanitationAvg.toFixed(1)}% | max ${state.metrics.sanitationMax.toFixed(0)}% | dirty ${state.metrics.dirtyTiles} | filthy ${state.metrics.filthyTiles} | open ${state.metrics.sanitationJobsOpen}`;
    if (hoveredTile === null) return `${globalLine}\n${departmentLine}\nHover a pressurized floor tile for dirt source, effect, and cleanup state.`;
    const p = fromIndex(hoveredTile, state.width);
    const diagnostic = getSanitationTileDiagnostic(state, p.x, p.y);
    if (!diagnostic) return `${globalLine}\n${departmentLine}\n${diagnosticHoverPrefix()}: no sanitation sample here.`;
    const effect = diagnostic.effectSummary === 'none' ? 'no active penalty' : diagnostic.effectSummary;
    // `driftSeverity` is the authored 5-step entropy language (none/low/warning/
    // active/severe) that classifies how far this tile has drifted from kept.
    // It was computed on every sample and read by nothing; this is where the
    // player finally sees it.
    return `${globalLine}\n${departmentLine}\n${diagnosticHoverPrefix()}: ${diagnostic.severity} ${diagnostic.dirt.toFixed(0)}%, drift ${diagnostic.driftSeverity}, source ${diagnostic.dominantSource}; ${effect}.`;
  }
  if (overlay === 'map-conditions') {
    const globalLine = `Map seed: ${state.seedAtCreation} | conditions v${state.mapConditionVersion}`;
    if (hoveredTile === null) return `${globalLine}\nHover the map to inspect sunlight, debris risk, and thermal sink pressure.`;
    const samples = mapConditionSamplesAt(state, hoveredTile);
    const parts = samples.map((sample) => `${sample.kind} ${Math.round(sample.value * 100)}% ${sample.label}`);
    const downsides = samples
      .filter((sample) => sample.downside)
      .map((sample) => sample.downside)
      .slice(0, 2);
    return `${globalLine}\n${diagnosticHoverPrefix()}: ${parts.join(' | ')}${downsides.length > 0 ? `\nPressure: ${downsides.join(' | ')}` : ''}`;
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
  if (overlay === 'reputation') {
    const globalLine = `Reputation: prestige ${state.metrics.reputationPrestigeAvg.toFixed(0)} | notoriety ${state.metrics.reputationNotorietyAvg.toFixed(0)} | control ${state.metrics.reputationControlAvg.toFixed(0)} | risk ${state.metrics.reputationCrimePressureAvg.toFixed(0)}`;
    if (hoveredTile === null) return `${globalLine}\nHover a room for local property value, opacity, and crime pressure.`;
    const p = fromIndex(hoveredTile, state.width);
    const diagnostic = getReputationTileDiagnostic(state, p.x, p.y);
    if (!diagnostic?.zone) return `${globalLine}\n${diagnosticHoverPrefix()}: no reputation zone.`;
    const zone = diagnostic.zone;
    return `${globalLine}\n${diagnosticHoverPrefix()}: ${zone.label} ${zone.room}; value ${zone.value.toFixed(0)} opacity ${zone.opacity.toFixed(0)} crime ${zone.crimePressure.toFixed(0)}; ${zone.topDrivers.join(' | ')}.`;
  }
  if (hoveredTile === null) {
    const label = DIAGNOSTIC_OVERLAY_LABELS[overlay];
    return `${label}\nHover a room tile for score and gameplay effect.`;
  }
  const p = fromIndex(hoveredTile, state.width);
  const diagnostic = getRoomEnvironmentTileDiagnostic(state, p.x, p.y);
  if (!diagnostic || diagnostic.sampledTiles <= 0) return `${diagnosticHoverPrefix()}: no room environment sample.`;
  if (overlay === 'visitor-status') {
    return `Guest Appeal: avg ${state.metrics.visitorStatusAvg.toFixed(1)} | env ${state.metrics.stationRatingPenaltyPerMin.environment.toFixed(1)}/m\n${diagnosticHoverPrefix()}: score ${diagnostic.visitorStatus.toFixed(1)}, discomfort ${diagnostic.visitorDiscomfort.toFixed(1)}; affects rating/service appeal.`;
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
    case 'structural':
      return {
        title: 'Structural Support',
        stats: `pieces ${state.structuralPieces.length} | see the in-world legend for live counts`,
        rows: [
          { color: '#6edb8f', label: 'Supported - load reaches a structural root' },
          { color: '#61c8ff', label: 'Planned support - pending or previewed piece (hatched)' },
          { color: '#ffd65c', label: 'Overloaded - needs a Junction or Reinforced Bulkhead' },
          { color: '#ee4f4f', label: 'Unsupported - disconnected, over-span, or no load path' }
        ]
      };
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
    case 'utility-underlay': {
      const air = getAirDuctNetworkDiagnostics(state);
      const water = getWaterPipeNetworkDiagnostics(state);
      const fuel = getFuelPipeNetworkDiagnostics(state);
      return {
        title: 'Utility Networks',
        stats:
          `air ${state.metrics.lifeSupportCoveragePct.toFixed(0)}% | duct networks ${air.networkCount} | ` +
          `water networks ${water.poweredNetworkCount}/${water.networkCount} supplied | ` +
          `fixtures ${water.poweredSinkCount}/${water.sinkCount} | ` +
          `fuel ${fuel.poweredSinkCount}/${fuel.sinkCount} couplers · ${fuel.sourceCount} tanks | leaks ${state.metrics.activePlumbingLeaks}`,
        rows: [
          { color: '#37d3e6', label: 'Air reach tint underneath' },
          { color: '#6edb8f', label: 'Life Support source duct' },
          { color: '#61c8ff', label: 'Powered Air Duct' },
          { color: '#54c4ff', label: 'Connected Water Pipe' },
          { color: '#86ecff', label: 'Flooded or leaking pipe' },
          { color: '#f2a84b', label: 'Connected Fuel Pipe' },
          { color: '#74dda0', label: 'Maintenance Fuel Tank source' },
          { color: '#a7f3ff', label: 'Wall Vent output connection' },
          { color: '#ee4f4f', label: 'Disconnected utility or unpowered fixture' }
        ]
      };
    }
    case 'visitor-status':
      return {
        title: 'Guest Appeal',
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
          { color: '#6edb8f', label: 'Healthy station system or hull target' },
          { color: '#ffd65c', label: 'Moderate debt, maintenance should visit' },
          { color: '#ee4f4f', label: 'Serious wear causing degradation or EVA urgency' },
          { color: '#d072ff', label: 'Debris-risk space that accelerates exterior wear' }
        ]
      };
    case 'thermal':
      return {
        title: 'Thermal',
        stats: `avg ${state.metrics.thermalAvg.toFixed(0)}% | max ${state.metrics.thermalMax.toFixed(0)}% | hot ${state.metrics.hotTiles} | stale ${state.metrics.staleAirTiles}`,
        rows: [
          { color: '#61c8ff', label: 'Cool or well-vented room' },
          { color: '#ffd65c', label: 'Warm or stale pressure beginning' },
          { color: '#ee784a', label: 'Hot room hurting comfort or work' },
          { color: '#ee4f4f', label: 'Overheated/stale, add vents or insulation' }
        ]
      };
    case 'sanitation':
      return {
        title: 'Sanitation',
        stats: `dept ${departmentStatusText('sanitation')} | avg ${state.metrics.sanitationAvg.toFixed(1)}% | max ${state.metrics.sanitationMax.toFixed(0)}% | open jobs ${state.metrics.sanitationJobsOpen}`,
        rows: [
          { color: '#6edb8f', label: 'Clean or recently serviced room' },
          { color: '#ffd65c', label: 'Lived-in grime, watch high-traffic routes' },
          { color: '#ee4f4f', label: 'Filthy area hurting guests and residents' }
        ]
      };
    case 'map-conditions':
      return {
        title: 'Map Conditions',
        stats: `seed ${state.seedAtCreation} | condition map v${state.mapConditionVersion}`,
        rows: [
          { color: '#ffd95f', label: 'High sunlight band, future heat/power pressure' },
          { color: '#61c8ff', label: 'Cold thermal sink or shadow band' },
          { color: '#d072ff', label: 'Debris-risk corridor for future maintenance pressure' },
          { color: '#31414f', label: 'Neutral build space' }
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
    case 'reputation':
      return {
        title: 'Security & Reputation',
        stats: `prestige ${state.metrics.reputationPrestigeAvg.toFixed(0)} | notoriety ${state.metrics.reputationNotorietyAvg.toFixed(0)} | risk ${state.metrics.reputationCrimePressureAvg.toFixed(0)} | high-risk ${state.metrics.reputationHighRiskZones}`,
        rows: [
          { color: '#52d1a7', label: 'Prestige and property value' },
          { color: '#ffd65c', label: 'Notoriety and value overlap' },
          { color: '#ee4f4f', label: 'High crime pressure' },
          { color: '#5cd8ff', label: 'Control suppressing risk' }
        ]
      };
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
const progressModalTierChecklistEl = document.querySelector<HTMLElement>('#progress-modal-tier-checklist')!;
const progressModalRoadmapEl = document.querySelector<HTMLElement>('#progress-modal-roadmap')!;
const progressModalSpecialtySummaryEl = document.querySelector<HTMLElement>('#progress-modal-specialty-summary')!;
const progressModalSpecialtiesEl = document.querySelector<HTMLElement>('#progress-modal-specialties')!;
const resourcesEl = document.querySelector<HTMLSpanElement>('#resources')!;
const pressureEl = document.querySelector<HTMLSpanElement>('#pressure')!;
const economyEl = document.querySelector<HTMLSpanElement>('#economy')!;
const economyFlowEl = document.querySelector<HTMLElement>('#economy-flow')!;
const workQueueRowEl = document.querySelector<HTMLElement>('#work-queue-row')!;
const jobsEl = document.querySelector<HTMLSpanElement>('#jobs')!;
const jobsExtraEl = document.querySelector<HTMLElement>('#jobs-extra')!;
const idleReasonsEl = document.querySelector<HTMLElement>('#idle-reasons')!;
const stallReasonsEl = document.querySelector<HTMLElement>('#stall-reasons')!;
const crewRetargetsEl = document.querySelector<HTMLElement>('#crew-retargets')!;
const foodChainHintEl = document.querySelector<HTMLElement>('#food-chain-hint')!;
const roomWarningsEl = document.querySelector<HTMLElement>('#room-warnings')!;
const maintenanceStatusEl = document.querySelector<HTMLElement>('#maintenance-status')!;
const thermalStatusEl = document.querySelector<HTMLElement>('#thermal-status')!;
const editPrioritiesBtn = document.querySelector<HTMLButtonElement>('#edit-priorities')!;
const hireCrewBtn = document.querySelector<HTMLButtonElement>('#hire-crew')!;
const openCrewCommandBtn = document.querySelector<HTMLButtonElement>('#open-crew-command')!;
const openCrewPanelBtn = document.querySelector<HTMLButtonElement>('#open-crew-panel')!;
const crewCommandSummaryEl = document.querySelector<HTMLElement>('#crew-command-summary')!;
const crewSpecialtySummaryEl = document.querySelector<HTMLElement>('#crew-specialty-summary')!;
const officerSummaryEl = document.querySelector<HTMLElement>('#officer-summary')!;
const officerGridEl = document.querySelector<HTMLElement>('#officer-grid')!;
const staffSummaryEl = document.querySelector<HTMLElement>('#staff-summary')!;
const staffGridEl = document.querySelector<HTMLElement>('#staff-grid')!;
const crewPanelStatusEl = document.querySelector<HTMLElement>('#crew-panel-status')!;
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
const toggleUiPanelsBtn = document.querySelector<HTMLButtonElement>('#toggle-ui-panels')!;
const saveModal = document.querySelector<HTMLDivElement>('#save-modal')!;
const closeSaveModalBtn = document.querySelector<HTMLButtonElement>('#close-save-modal')!;
const openMarketBtn = document.querySelector<HTMLButtonElement>('#open-market')!;
const openTravelShopBtn = document.querySelector<HTMLButtonElement>('#open-travel-shop')!;
const openCapitalProjectsBtn = document.querySelector<HTMLButtonElement>('#open-capital-projects')!;
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
const ratingModal = document.querySelector<HTMLDivElement>('#rating-modal')!;
const openRatingModalBtn = document.querySelector<HTMLButtonElement>('#open-rating-modal')!;
const closeRatingModalBtn = document.querySelector<HTMLButtonElement>('#close-rating-modal')!;
const ratingModalScoreEl = document.querySelector<HTMLElement>('#rating-modal-score')!;
const ratingModalTrendEl = document.querySelector<HTMLElement>('#rating-modal-trend')!;
const ratingModalSummaryEl = document.querySelector<HTMLElement>('#rating-modal-summary')!;
const ratingModalEffectEl = document.querySelector<HTMLElement>('#rating-modal-effect')!;
const ratingModalBonusesEl = document.querySelector<HTMLElement>('#rating-modal-bonuses')!;
const ratingModalPenaltiesEl = document.querySelector<HTMLElement>('#rating-modal-penalties')!;
const ratingModalFailuresEl = document.querySelector<HTMLElement>('#rating-modal-failures')!;
const ratingModalDriversEl = document.querySelector<HTMLElement>('#rating-modal-drivers')!;
const priorityModal = document.querySelector<HTMLDivElement>('#priority-modal')!;
const closePriorityBtn = document.querySelector<HTMLButtonElement>('#close-priority')!;
const opsModal = document.querySelector<HTMLDivElement>('#ops-modal')!;
const openOpsModalBtn = document.querySelector<HTMLButtonElement>('#open-ops-modal')!;
const openHealthDetailsBtn = document.querySelector<HTMLButtonElement>('#open-health-details')!;
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
const opsModalWorkforceEl = document.querySelector<HTMLElement>('#ops-modal-workforce')!;
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
const incidentListEl = document.querySelector<HTMLElement>('#incident-list')!;
const lifeSupportStatusEl = document.querySelector<HTMLElement>('#life-support-status')!;
const airTrendEl = document.querySelector<HTMLElement>('#air-trend')!;
const airHealthEl = document.querySelector<HTMLElement>('#air-health')!;
const airBlockedWarningEl = document.querySelector<HTMLElement>('#air-blocked-warning')!;
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
const dockModalInspectionEl = document.querySelector<HTMLElement>('#dock-modal-inspection')!;
const dockModalDiagnosisEl = document.querySelector<HTMLElement>('#dock-modal-diagnosis')!;
const dockModalRoutingEl = document.querySelector<HTMLElement>('#dock-modal-routing')!;
const dockModalTitleEl = document.querySelector<HTMLElement>('#dock-modal-title')!;
const dockModalAreaLabelEl = document.querySelector<HTMLElement>('#dock-modal-area-label')!;
const dockModalSizeLabelEl = document.querySelector<HTMLElement>('#dock-modal-size-label')!;
const dockModalCapabilitiesEl = document.querySelector<HTMLElement>('#dock-modal-capabilities')!;
const dockModalCraftEl = document.querySelector<HTMLElement>('#dock-modal-craft')!;
const dockModalServicesEl = document.querySelector<HTMLElement>('#dock-modal-services')!;
const dockModalStockEl = document.querySelector<HTMLElement>('#dock-modal-stock')!;
const dockModalBlockerEl = document.querySelector<HTMLElement>('#dock-modal-blocker')!;
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
const roomModalCardEl = roomModal.querySelector<HTMLElement>('.room-modal-card')!;
const closeRoomBtn = document.querySelector<HTMLButtonElement>('#close-room')!;
const roomModalCommercialEl = document.querySelector<HTMLElement>('#room-modal-commercial')!;
const roomModalTypeEl = document.querySelector<HTMLElement>('#room-modal-type')!;
const roomModalStatusEl = document.querySelector<HTMLElement>('#room-modal-status')!;
const roomModalClusterEl = document.querySelector<HTMLElement>('#room-modal-cluster')!;
const roomModalDoorsEl = document.querySelector<HTMLElement>('#room-modal-doors')!;
const roomModalPressureEl = document.querySelector<HTMLElement>('#room-modal-pressure')!;
const roomModalStaffEl = document.querySelector<HTMLElement>('#room-modal-staff')!;
const roomModalWorkplaceEl = document.querySelector<HTMLElement>('#room-modal-workplace')!;
const roomModalWorkplaceNameEl = document.querySelector<HTMLElement>('#room-modal-workplace-name')!;
const roomModalWorkplaceRolesEl = document.querySelector<HTMLElement>('#room-modal-workplace-roles')!;
const roomModalWorkplaceStatusEl = document.querySelector<HTMLElement>('#room-modal-workplace-status')!;
const roomModalPlanWorkplaceBtn = document.querySelector<HTMLButtonElement>('#room-modal-plan-workplace')!;
const roomModalSurgeWorkplaceBtn = document.querySelector<HTMLButtonElement>('#room-modal-surge-workplace')!;
const roomModalNodesEl = document.querySelector<HTMLElement>('#room-modal-nodes')!;
const roomModalInventoryEl = document.querySelector<HTMLElement>('#room-modal-inventory')!;
const roomModalFlowEl = document.querySelector<HTMLElement>('#room-modal-flow')!;
const roomModalCapacityEl = document.querySelector<HTMLElement>('#room-modal-capacity')!;
const roomModalReputationEl = document.querySelector<HTMLElement>('#room-modal-reputation')!;
const roomModalHousingPolicyEl = document.querySelector<HTMLElement>('#room-modal-housing-policy')!;
const roomModalHousingSelect = document.querySelector<HTMLSelectElement>('#room-modal-housing-select')!;
const roomModalHousingEl = document.querySelector<HTMLElement>('#room-modal-housing')!;
const roomModalReasonsEl = document.querySelector<HTMLElement>('#room-modal-reasons')!;
const roomModalWarningsEl = document.querySelector<HTMLElement>('#room-modal-warnings')!;
const roomModalHintsEl = document.querySelector<HTMLElement>('#room-modal-hints')!;
const roomModalSanitationEl = document.querySelector<HTMLDivElement>('#room-modal-sanitation')!;
const roomModalSanitationAvgEl = document.querySelector<HTMLElement>('#room-modal-sanitation-avg')!;
const roomModalSanitationSourceEl = document.querySelector<HTMLElement>('#room-modal-sanitation-source')!;
const roomModalSanitationEffectEl = document.querySelector<HTMLElement>('#room-modal-sanitation-effect')!;
const roomModalSanitationFixEl = document.querySelector<HTMLElement>('#room-modal-sanitation-fix')!;
const roomModalBerthEl = document.querySelector<HTMLElement>('#room-modal-berth')!;
const roomModalBerthReadinessEl = document.querySelector<HTMLElement>('#room-modal-berth-readiness')!;
const roomModalBerthReadinessRowsEl = document.querySelector<HTMLElement>('#room-modal-berth-readiness-rows')!;
const roomModalBerthReadinessReasonEl = document.querySelector<HTMLElement>('#room-modal-berth-readiness-reason')!;
const roomModalBerthDiagnosisEl = document.querySelector<HTMLElement>('#room-modal-berth-diagnosis')!;
const roomModalBerthConfigEl = document.querySelector<HTMLDivElement>('#room-modal-berth-config')!;
const roomModalBerthPurposeEl = document.querySelector<HTMLElement>('#room-modal-berth-purpose')!;
const roomModalBerthFacingEl = document.querySelector<HTMLElement>('#room-modal-berth-facing')!;
const roomModalBerthScreeningSelect = document.querySelector<HTMLSelectElement>('#room-modal-berth-screening')!;
const roomModalBerthCustomsSelect = document.querySelector<HTMLSelectElement>('#room-modal-berth-customs')!;
const roomModalBerthTouristCheckbox = document.querySelector<HTMLInputElement>('#room-modal-berth-tourist')!;
const roomModalBerthTraderCheckbox = document.querySelector<HTMLInputElement>('#room-modal-berth-trader')!;
const roomModalBerthIndustrialCheckbox = document.querySelector<HTMLInputElement>('#room-modal-berth-industrial')!;
const roomModalBerthMilitaryCheckbox = document.querySelector<HTMLInputElement>('#room-modal-berth-military')!;
const roomModalBerthColonistCheckbox = document.querySelector<HTMLInputElement>('#room-modal-berth-colonist')!;
const roomModalBerthSmallCheckbox = document.querySelector<HTMLInputElement>('#room-modal-berth-small')!;
const roomModalBerthMediumCheckbox = document.querySelector<HTMLInputElement>('#room-modal-berth-medium')!;
const roomModalBerthLargeCheckbox = document.querySelector<HTMLInputElement>('#room-modal-berth-large')!;
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
const openEconomyLedgerBtn = document.querySelector<HTMLButtonElement>('#open-economy-ledger')!;
const hudCrewEl = document.querySelector<HTMLElement>('#hud-crew')!;
const hudMaterialsEl = document.querySelector<HTMLElement>('#hud-materials')!;
const hudWaterEl = document.querySelector<HTMLElement>('#hud-water')!;
const hudFoodEl = document.querySelector<HTMLElement>('#hud-food')!;
const hudRatingEl = document.querySelector<HTMLElement>('#hud-rating')!;
const hudMoraleEl = document.querySelector<HTMLElement>('#hud-morale')!;
const hudClockEl = document.querySelector<HTMLElement>('#hud-clock')!;
const alertListEl = document.querySelector<HTMLElement>('#alert-list')!;
const diagnosticsCardEl = document.querySelector<HTMLElement>('#diagnostics-card')!;
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
const workforceLaneOrder: CrewWorkLane[] = ['food', 'sanitation', 'engineering', 'logistics', 'construction-eva', 'flex'];
const workforceLaneLabels: Record<CrewWorkLane, string> = {
  food: 'Food',
  sanitation: 'Sanitation',
  engineering: 'Engineering',
  logistics: 'Logistics',
  'construction-eva': 'Construction/EVA',
  flex: 'Flex'
};
const roleCoverageSummaryEl = document.querySelector<HTMLElement>('#role-coverage-summary')!;
const namedWatchRosterEl = document.querySelector<HTMLElement>('#named-watch-roster')!;
const workplaceAssignmentContextEl = document.querySelector<HTMLElement>('#workplace-assignment-context')!;
const watchAssignmentBarEl = document.querySelector<HTMLElement>('#watch-assignment-bar')!;
const bottomRoleCoverageEl = document.querySelector<HTMLElement>('#bottom-role-coverage')!;
const watchNameEl = document.querySelector<HTMLElement>('#watch-name')!;
const watchCountdownEl = document.querySelector<HTMLElement>('#watch-countdown')!;
const trafficBankNowEl = document.querySelector<HTMLElement>('#traffic-bank-now')!;
const trafficBankNextEl = document.querySelector<HTMLElement>('#traffic-bank-next')!;
const emergencyRecallEl = document.querySelector<HTMLButtonElement>('#emergency-recall')!;
const openWatchRosterEl = document.querySelector<HTMLButtonElement>('#open-watch-roster')!;
let selectedRosterCrewId: number | null = null;
let selectedWorkplaceAnchor: number | null = null;

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
    buildings: ['Reactor', 'Life Support', 'Dorm', 'Bathroom', 'Hydroponics', 'Kitchen', 'Cafeteria', 'Dock'],
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
    theme: 'Scale cargo storage and choose whether to enter production.',
    buildings: ['Workshop', 'Storage'],
    citizenNeeds: ['Errands/work loops gain value from reliable logistics'],
    visitorNeeds: ['Industrial traffic values reliable cargo handling and buffers'],
    ships: ['Industrial'],
    systems: ['Cargo storage plus optional workshop and market specialization']
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
let lastPresentedToolLockMessage = '';
let toolLockMessageVisibleUntil = 0;

function unlockRequirementText(tier: number): string {
  // Caller ("X locked until Tier N.") already owns the tier number;
  // dropping the prefix here avoids "until Tier 1. Tier 1: ..." doubling.
  const copyTier = Math.max(1, Math.min(6, tier)) as UnlockTier;
  return tierRequirementText(copyTier);
}

function friendlyName(value: string): string {
  if (value === RoomType.Hygiene) return 'Bathroom';
  return value
    .split('-')
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function departmentLabel(department: StaffDepartment): string {
  return friendlyName(department);
}

function departmentInactiveReasonLabel(reason: string | null | undefined): string {
  switch (reason) {
    case 'specialty-not-completed':
      return 'specialty incomplete';
    case 'no-officer':
      return 'officer missing';
    case 'no-bridge':
      return 'Bridge inactive';
    case 'no-terminal':
      return 'terminal missing';
    case 'unreachable':
      return 'officer unreachable';
    default:
      return 'inactive';
  }
}

function departmentStatusText(department: StaffDepartment): string {
  const row = state.command.departments?.[department];
  if (!row) return 'not configured';
  return row.active ? 'active' : departmentInactiveReasonLabel(row.inactiveReason);
}

function departmentTone(department: StaffDepartment): 'default' | 'ok' | 'warn' | 'danger' {
  const row = state.command.departments?.[department];
  if (!row) return 'default';
  if (row.active) return 'ok';
  return row.inactiveReason === 'specialty-not-completed' ? 'default' : 'warn';
}

function roomLockedMessage(room: RoomType): string {
  const requirement = getUnlockRequirement(state, { kind: 'room', room });
  return `${friendlyName(room)} locked until Tier ${requirement.tier}. ${unlockRequirementText(requirement.tier)}`;
}

function moduleLockedMessage(module: ModuleType): string {
  const requirement = getUnlockRequirement(state, { kind: 'module', module });
  if (requirement.specialtyId && !requirement.unlocked) {
    return `${friendlyName(module)} belongs to the ${departmentLabel(requirement.specialtyDepartment!)} Department. Complete ${requirement.specialtyLabel} to build it.`;
  }
  return `${friendlyName(module)} locked until Tier ${requirement.tier}. ${unlockRequirementText(requirement.tier)}`;
}

function selectRoomTool(room: RoomType): void {
  if (!starterLayoutEditorMode && room !== RoomType.None && !isRoomUnlocked(state, room)) {
    toolLockMessage = roomLockedMessage(room);
    return;
  }
  currentTool = { kind: 'room', room };
  // A Berth is the one room that costs credits, and it is charged for the whole
  // bay at once. Say the price up front rather than letting the player discover
  // it by being refused at the end of a drag.
  toolLockMessage = room === RoomType.Berth
    ? `Berth commissioning: ${berthCapitalCostForArea(BERTH_SIZE_MIN.medium)}c medium, ${berthCapitalCostForArea(BERTH_SIZE_MIN.large)}c large. Drag the whole bay.`
    : '';
}

function selectModuleTool(module: ModuleType): void {
  if (!starterLayoutEditorMode && module !== ModuleType.None && !isModuleUnlocked(state, module)) {
    toolLockMessage = moduleLockedMessage(module);
    return;
  }
  currentTool = { kind: 'module', module };
  toolLockMessage = module === ModuleType.PodDock
    ? 'Pod Dock: place on an exterior hull wall.'
    : module === ModuleType.FuelCoupler || module === ModuleType.FreightLocker || module === ModuleType.MaintenanceSocket
      ? 'Dock attachment: place on an exterior hull wall near a Pod Dock.'
      : '';
}

function selectStructuralPieceTool(piece: PlaceableStructuralPieceKind): void {
  currentTool = { kind: 'structural-piece', structuralPiece: piece };
  toolLockMessage = piece === 'junction'
    ? 'Junction: place on connected space or truss to renew span and support a branch.'
    : 'Bulkhead: bridge truss/space and the exterior hull face; rotate with [ or ].';
}

function selectModuleMoveTool(): void {
  currentTool = { kind: 'move-module' };
  toolLockMessage = 'Select an installed module to move.';
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
  // Two-Berth Shift has no tier interruption. Progression may add future
  // options, but the live operating loop never opens a modal over a ship.
  prevUnlockTier = state.unlocks.tier;
}

/**
 * Refresh the persistent top-of-canvas HUD status strip.
 *
 * Shows Power / Oxygen / Credits / Crew / Supplies — the high-frequency
 * status numbers that should always remain visible.
 * awfml wanted at-a-glance without cracking the sidebar (Starlight-Station
 * dashboard vibe). Pulled from the same state surfaces the sidebar panels
 * use so we stay a read-only render consumer:
 *   - Power: `powerDemand / powerSupply`, shown directly so wiring or adding
 *     generation produces an immediately legible change.
 *   - Oxygen: `airQuality` (0-100 life-support %, the sim's "oxygen").
 *   - Credits: `state.metrics.credits` (integer station bank).
 *   - Crew: `state.crew.total` (hired head-count).
 *   - Supplies: `state.metrics.materials` (operational rawMaterial stock).
 *
 * Uses simple red/yellow/green thresholds matching the existing sidebar
 * treatments so the HUD reads the same at a glance.
 */
// One reconciled prepared-meal view for the header, its tooltip, and the meal
// alert. Owned by the simulation so the UI cannot invent a second total.
function preparedMealServiceSnapshot(): PreparedMealInventory {
  return getPreparedMealInventory(state);
}

function refreshHudStatus(): void {
  const powerDemand = state.metrics.powerDemand;
  const powerSupply = state.metrics.powerSupply;
  const powerLoadPct = (powerDemand / Math.max(0.1, powerSupply)) * 100;
  hudPowerEl.textContent = `${Math.round(powerDemand)}/${Math.round(powerSupply)}`;
  hudPowerEl.parentElement?.setAttribute(
    'title',
    `Power demand ${powerDemand.toFixed(1)} / supply ${powerSupply.toFixed(1)} (${Math.round(powerLoadPct)}% load)`
  );
  hudPowerEl.style.color =
    powerDemand > powerSupply ? 'var(--danger)' : powerLoadPct > 85 ? 'var(--warn)' : 'var(--ok)';

  const oxygen = Math.round(state.metrics.airQuality);
  hudOxygenEl.textContent = `${oxygen}%`;
  hudOxygenEl.style.color =
    oxygen < 35 ? 'var(--danger)' : oxygen < 70 ? 'var(--warn)' : 'var(--ok)';

  const airFalling = state.metrics.airTrendPerSec < -0.2;
  const localCoverageRisk =
    state.metrics.lifeSupportActiveNodes > 0 && state.metrics.poorLifeSupportTiles > 0;
  const airWarning =
    oxygen < 70 ||
    (airFalling && oxygen < 85) ||
    localCoverageRisk ||
    state.metrics.airBlockedWarningActive;
  const airDanger = oxygen < 35 || state.metrics.airBlockedWarningActive;
  hudAirControlEl.classList.toggle('warn', airWarning && !airDanger);
  hudAirControlEl.classList.toggle('danger', airDanger);

  let airAction = 'Open Air Coverage';
  if (state.ops.lifeSupportActive <= 0) {
    airAction = 'Build Life Support';
  } else if (state.metrics.pressurizationPct < 75) {
    airAction = 'Check hull walls and doors';
  } else if (localCoverageRisk) {
    airAction = `Check ${state.metrics.poorLifeSupportTiles} poorly supplied tile${state.metrics.poorLifeSupportTiles === 1 ? '' : 's'}`;
  }
  const trendText = `${state.metrics.airTrendPerSec >= 0 ? '+' : ''}${state.metrics.airTrendPerSec.toFixed(2)}%/s`;
  const airStatusText = !airWarning
    ? `Air reserve stable: ${oxygen}% (${trendText})`
    : airFalling
      ? `Oxygen falling: ${oxygen}% (${trendText}) - ${airAction}`
      : oxygen < 70 || state.metrics.airBlockedWarningActive
        ? `Oxygen low: ${oxygen}% - ${airAction}`
        : `Air reserve: ${oxygen}% station-wide; local coverage uneven - ${airAction}`;
  hudAirControlEl.title = `${airStatusText}. Click to open Air Coverage.`;
  hudAirControlEl.setAttribute('aria-label', hudAirControlEl.title);
  airEmergencyIndicatorEl.classList.toggle('hidden', !airWarning);
  airEmergencyIndicatorEl.classList.toggle('danger', airDanger);
  airEmergencyIndicatorEl.classList.toggle('warn', airWarning && !airDanger);
  if (airWarning) airEmergencyIndicatorEl.textContent = airStatusText;

  hudCreditsEl.textContent = String(Math.round(state.metrics.credits));
  const cashFlow = getOpeningEconomySummary(state, 120);
  openEconomyLedgerBtn.title = `Credits ${Math.round(state.metrics.credits)} · last 2 min ${cashFlow.net >= 0 ? '+' : ''}${Math.round(cashFlow.net)}c. Open operating ledger.`;
  openEconomyLedgerBtn.setAttribute('aria-label', openEconomyLedgerBtn.title);
  const crewSustainability = getCrewSustainabilitySummary(state);
  hudCrewEl.textContent = crewSustainability.resignationNotices > 0
    ? `${state.crew.total} · ${crewSustainability.resignationNotices}!`
    : String(state.crew.total);
  hudCrewEl.style.color = crewSustainability.resignationNotices > 0
    ? 'var(--danger)'
    : crewSustainability.atRiskCrew > 0
      ? 'var(--warn)'
      : '';
  hudCrewEl.parentElement!.title = `Mood ${Math.round(state.metrics.morale)}% · sleep ${crewSustainability.sleepSlots}/${state.crew.total} · payroll ${Math.ceil(crewSustainability.payrollPerCycle)}c in ${Math.ceil(crewSustainability.secondsToPayroll)}s`;
  hudMaterialsEl.textContent = String(Math.round(state.metrics.materials));
  hudWaterEl.textContent = String(Math.round(state.metrics.waterStock));
  const preparedMeals = preparedMealServiceSnapshot();
  hudFoodEl.textContent = String(preparedMeals.readyServings);
  hudFoodEl.style.color = preparedMeals.readyServings <= 0
    ? 'var(--danger)'
    : preparedMeals.readyServings < 12
      ? 'var(--warn)'
      : '';
  hudFoodEl.parentElement!.title =
    `${preparedMeals.readyServings} servings ready at ${preparedMeals.counterCount} counter${preparedMeals.counterCount === 1 ? '' : 's'} · ` +
    `${preparedMeals.counterMeals} meals and ${preparedMeals.counterTrays} clean trays at counters · ` +
    `${preparedMeals.stationMeals} cooked meals station-wide.`;
  refreshPreparedMealPurchaseAffordance();
  hudRatingEl.textContent = String(Math.round(state.metrics.stationRating));
  hudRatingEl.style.color = ratingToneColor();
  const ratingButton = hudRatingEl.parentElement;
  if (ratingButton) {
    const ratingTrend = state.metrics.stationRatingTrendPerMin;
    ratingButton.title = `Station rating ${Math.round(state.metrics.stationRating)} (${ratingTrend >= 0 ? '+' : ''}${ratingTrend.toFixed(1)}/min). Click to inspect factors.`;
    ratingButton.setAttribute('aria-label', ratingButton.title);
  }
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
  return state.docks.some((dock) => dock.purpose === 'visitor') ||
    state.metrics.visitorBerthsTotal > 0 ||
    state.rooms.includes(RoomType.Berth);
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

function openPortDispatch(): void {
  portDispatchModal.classList.remove('hidden');
  openPortDispatchBtn.setAttribute('aria-expanded', 'true');
}

function closePortDispatch(): void {
  portDispatchModal.classList.add('hidden');
  openPortDispatchBtn.setAttribute('aria-expanded', 'false');
  projectedTrafficOffer = null;
}

function refreshDispatchTrigger(): void {
  const hasBerthCapacity = state.rooms.includes(RoomType.Berth);
  const visibleOffers = state.trafficOffers.filter((offer) => hasBerthCapacity || offer.size === 'small');
  const openOffers = visibleOffers.filter((offer) => offer.status !== 'cleared');
  const clearedOffers = visibleOffers.filter((offer) => offer.status === 'cleared');
  const activeShips = state.arrivingShips.filter((ship) => ship.portManifest && ship.stage !== 'depart');
  const holdingCount = openOffers.filter((offer) => offer.status === 'holding').length;
  const hasApproachCapacity = hasVisitorDock();

  openPortDispatchBtn.classList.toggle('hidden', !hasApproachCapacity);
  if (!hasApproachCapacity) {
    closePortDispatch();
    return;
  }

  dispatchTriggerCountEl.textContent = String(openOffers.length);
  dispatchTriggerCountEl.classList.toggle('hidden', openOffers.length === 0);
  openPortDispatchBtn.classList.toggle('has-waiting-ships', openOffers.length > 0);
  openPortDispatchBtn.classList.toggle('has-active-ships', openOffers.length === 0 && (clearedOffers.length > 0 || activeShips.length > 0));

  if (openOffers.length > 0) {
    dispatchTriggerTitleEl.textContent = `${openOffers.length} ship${openOffers.length === 1 ? '' : 's'} waiting to approach`;
    dispatchTriggerMetaEl.textContent = holdingCount > 0
      ? `${holdingCount} in holding orbit · choose a dock or berth`
      : hasBerthCapacity ? 'Compare capacity and committed load' : 'Pod Dock traffic ready';
  } else if (clearedOffers.length > 0) {
    dispatchTriggerTitleEl.textContent = `${clearedOffers.length} ship${clearedOffers.length === 1 ? '' : 's'} cleared for approach`;
    dispatchTriggerMetaEl.textContent = 'Open dispatch for traffic controls';
  } else if (activeShips.length > 0) {
    dispatchTriggerTitleEl.textContent = `${activeShips.length} ship${activeShips.length === 1 ? '' : 's'} in service`;
    dispatchTriggerMetaEl.textContent = 'Live progress appears at the active berth';
  } else {
    dispatchTriggerTitleEl.textContent = 'Approach lanes clear';
    dispatchTriggerMetaEl.textContent = state.controls.shipsPerCycle <= 0
      ? 'Traffic is switched off'
      : 'Waiting for traffic';
  }

}

function refreshTrafficStatus(): void {
  refreshDispatchTrigger();
  const autoUnlocked = isPortAutoAdmitUnlocked(state);
  portAutoToggleEl.disabled = !autoUnlocked;
  portAutoToggleEl.textContent = !autoUnlocked
    ? 'Dispatch automation locked'
    : state.controls.portAutoAdmitEnabled ? 'Auto-routing: ON' : 'Auto-routing: OFF';
  portAutoToggleEl.classList.toggle('active', state.controls.portAutoAdmitEnabled);
  for (const button of approachPolicyEl.querySelectorAll<HTMLButtonElement>('button[data-port-policy]')) {
    button.disabled = !autoUnlocked;
    button.classList.toggle('active', button.dataset.portPolicy === state.controls.portAutoAdmitPolicy);
  }
  approachPolicyEl.classList.toggle('disabled', !autoUnlocked);
  approachReputationPullEl.textContent =
    `Traffic pull · premium +${Math.round(state.metrics.reputationPremiumDemandBonusPct)}% · rough +${Math.round(state.metrics.reputationRiskyDemandBonusPct)}%`;
  const policyLabel = state.controls.portAutoAdmitPolicy === 'cautious'
    ? 'Protect service'
    : state.controls.portAutoAdmitPolicy === 'balanced'
      ? 'Balanced traffic'
      : 'Fill berths';
  portAutoStatusEl.textContent = !autoUnlocked
    ? `${Math.min(state.dockedShipsCompleted, 3)}/3 successful turnarounds · prove the route first`
    : state.controls.portAutoAdmitEnabled
      ? `${policyLabel} standing orders active. Ships outside policy wait here.`
      : `Manual clearance active · saved policy: ${policyLabel}.`;
  const shipsPerCycle = clamp(state.controls.shipsPerCycle, 0, 3);
  const activeTransientShips = state.arrivingShips.filter((ship) => ship.kind === 'transient').length;
  const offerCount = state.trafficOffers.length;
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
    setTrafficStatus(offerCount > 0 ? `${offerCount} manifest${offerCount === 1 ? '' : 's'} waiting` : 'Paused - press play for arrivals', offerCount > 0 ? 'warn' : 'muted');
    return;
  }
  if (offerCount > 0) {
    const holding = state.trafficOffers.filter((offer) => offer.status === 'holding').length;
    setTrafficStatus(`${offerCount} manifest${offerCount === 1 ? '' : 's'} · ${holding} in holding orbit`, holding > 0 ? 'warn' : 'ok');
    return;
  }
  if (activeTransientShips > 0 || state.pendingSpawns.length > 0) {
    setTrafficStatus(`${activeTransientShips} ship${activeTransientShips === 1 ? '' : 's'} docked/arriving`, 'ok');
    return;
  }
  const seconds = Math.max(1, Math.ceil(state.lastCycleTime - state.now));
  setTrafficStatus(`Next arrival check in ${seconds}s`, 'ok');
}

function cargoSummary(cargo: { rawMaterial: number; rawMeal: number; tradeGood: number }): string {
  const parts: string[] = [];
  if (cargo.rawMaterial > 0) parts.push(`${cargo.rawMaterial} supplies`);
  if (cargo.rawMeal > 0) parts.push(`${cargo.rawMeal} food`);
  if (cargo.tradeGood > 0) parts.push(`${cargo.tradeGood} goods`);
  return parts.join(' · ') || 'passengers only';
}

function requestSummary(request: { rawMaterial: number; meal: number; tradeGood: number }): string {
  const parts: string[] = [];
  if (request.meal > 0) parts.push(`${request.meal} meals`);
  if (request.tradeGood > 0) parts.push(`${request.tradeGood} goods`);
  if (request.rawMaterial > 0) parts.push(`${request.rawMaterial} supplies`);
  return parts.join(' · ') || 'no export order';
}

function offerPromisePreview(offer: StationState['trafficOffers'][number]): string {
  const promises: string[] = [];
  const hospitality = offer.hospitalityDemand;
  if (offer.passengersTotal > 0 && hospitality) {
    if (hospitality.meal > 0) promises.push(`${hospitality.meal} meals`);
    if (hospitality.drink > 0) promises.push(`${hospitality.drink} drinks`);
    if (hospitality.leisure > 0) promises.push(`${hospitality.leisure} lounge`);
    if (hospitality.restroom > 0) promises.push(`${hospitality.restroom} restroom`);
    if (hospitality.hygiene > 0) promises.push(`${hospitality.hygiene} wash`);
    if (hospitality.comfort > 0) promises.push(`${hospitality.comfort} premium`);
    promises.push(`${offer.passengersTotal} returned`);
  } else if (offer.passengersTotal > 0) {
    promises.push(`${Math.max(1, Math.ceil(offer.passengersTotal * 0.8))} meals`);
    promises.push(`${offer.passengersTotal} returned`);
  }
  const inbound = Object.values(offer.inboundCargo).reduce((sum, amount) => sum + amount, 0);
  const outbound = Object.values(offer.outboundRequest).reduce((sum, amount) => sum + amount, 0);
  if (inbound > 0) promises.push(`${inbound} freight in`);
  if (outbound > 0) promises.push(`${outbound} freight out`);
  if ((offer.fuelSupply ?? 0) > 0) promises.push(`buy ${offer.fuelSupply} fuel`);
  if ((offer.fuelRequest ?? 0) > 0) promises.push(`sell ${offer.fuelRequest} fuel`);
  return promises.join(' · ') || 'berth access only';
}

function offerFacilityVerdict(offer: StationState['trafficOffers'][number]): { label: string; ready: boolean } {
  const demand = offer.hospitalityDemand;
  if (!demand) return { label: 'FACILITIES UNKNOWN', ready: false };
  const hasModule = (types: ModuleType[], room: RoomType, visitorOnly = false): boolean =>
    state.moduleInstances.some((module) =>
      types.includes(module.type) &&
      state.rooms[module.originTile] === room &&
      (!visitorOnly || state.roomHousingPolicies[module.originTile] === 'visitor')
    );
  const missing: string[] = [];
  if (demand.meal > 0 && (!hasModule([ModuleType.ServingStation], RoomType.Cafeteria) || !hasModule([ModuleType.Table], RoomType.Cafeteria))) missing.push('cafeteria');
  if (demand.drink > 0 && (
    !hasModule([ModuleType.BarCounter], RoomType.Cantina) ||
    !hasModule([ModuleType.Bench], RoomType.Cantina)
  )) missing.push('cantina bar + seating');
  if (demand.leisure > 0 && !(
    hasModule([ModuleType.Couch, ModuleType.Bench], RoomType.Lounge) ||
    hasModule([ModuleType.RecUnit, ModuleType.Bench], RoomType.RecHall)
  )) missing.push('lounge seating');
  if (demand.restroom > 0 && !hasModule([ModuleType.Toilet], RoomType.Hygiene, true)) missing.push('public toilet');
  if (demand.hygiene > 0 && !hasModule([ModuleType.Shower, ModuleType.Sink], RoomType.Hygiene, true)) missing.push('public wash');
  if (demand.comfort > 0 && !(
    hasModule([ModuleType.GameStation], RoomType.Lounge) ||
    hasModule([ModuleType.Telescope], RoomType.Observatory)
  )) missing.push('premium comfort');
  if ((offer.fuelSupply ?? 0) > 0 && !state.moduleInstances.some((module) => module.type === ModuleType.FuelTank)) {
    missing.push('fuel tank');
  }
  if ((offer.fuelRequest ?? 0) > 0 && !state.moduleInstances.some((module) => module.type === ModuleType.FuelPump)) {
    missing.push('berth fuel pump');
  }
  return missing.length === 0
    ? { label: 'FACILITIES READY', ready: true }
    : { label: `MISSING ${missing.join(' + ')}`, ready: false };
}

function offerRolePlan(offer: StationState['trafficOffers'][number]): Partial<Record<StaffRole, number>> {
  const inbound = Object.values(offer.inboundCargo).reduce((sum, amount) => sum + amount, 0);
  const outbound = Object.values(offer.outboundRequest).reduce((sum, amount) => sum + amount, 0);
  const freight = inbound + outbound + (offer.fuelSupply ?? 0) + (offer.fuelRequest ?? 0);
  const plan: Partial<Record<StaffRole, number>> = {};
  if (offer.passengersTotal > 0) {
    if (offer.manifestDemand.cafeteria > 0) plan.cook = 1;
    if (
      offer.manifestDemand.lounge > 0 ||
      (offer.hospitalityDemand?.drink ?? 0) > 0 ||
      (offer.hospitalityDemand?.leisure ?? 0) > 0
    ) plan.steward = 1;
  }
  if (freight > 0) plan['cargo-handler'] = freight >= 48 ? 2 : 1;
  if ((offer.fuelSupply ?? 0) > 0 || (offer.fuelRequest ?? 0) > 0) plan.engineer = 1;
  if (offer.riskLabel === 'high') plan['security-guard'] = 1;
  return plan;
}

function offerOperatingPlan(offer: StationState['trafficOffers'][number]): string {
  const roles = Object.entries(offerRolePlan(offer))
    .filter((entry): entry is [StaffRole, number] => (entry[1] ?? 0) > 0)
    .map(([role, count]) => `${count} ${STAFF_ROLE_DEFINITIONS[role].label}`);
  const workstream = (offer.fuelSupply ?? 0) > 0
    ? 'arm → fuel tank'
    : (offer.fuelRequest ?? 0) > 0
      ? 'fuel tank → berth pump'
      : offer.offerKind === 'passenger'
        ? 'mess + hospitality'
        : offer.offerKind === 'freight'
          ? 'arm → storage'
          : 'public and cargo routes overlap';
  return `${roles.join(' + ') || 'No specialist posts'} · ${workstream}`;
}

function crewPlanVerdict(offer: StationState['trafficOffers'][number]): { label: string; ready: boolean } {
  const gaps = Object.entries(offerRolePlan(offer))
    .filter((entry): entry is [StaffRole, number] => (entry[1] ?? 0) > 0)
    .map(([role, needed]) => {
      const available = state.crewMembers.filter(
        (crew) => crewMatchesCoverageRole(crew.staffRole, role) && getCrewWatchStatus(state, crew) !== 'off-duty'
      ).length;
      const gap = Math.max(0, needed - available);
      return gap > 0 ? `${gap} ${STAFF_ROLE_DEFINITIONS[role].label}` : '';
    })
    .filter(Boolean);
  return gaps.length === 0
    ? { label: 'CREW READY', ready: true }
    : { label: `SHORT ${gaps.join(' + ')}`, ready: false };
}

function promiseIntervention(kind: StationState['portOps']['contracts'][number]['promises'][number]['kind']): string {
  if (kind === 'passengers-served') return 'Assign a Cook or Steward to the mess, or add counter throughput.';
  if (kind === 'drinks-served') return 'Open a Cantina with a Bar Counter; Taps shorten drink service.';
  if (kind === 'leisure-served') return 'Add Lounge seating and protect the public route.';
  if (kind === 'restroom-served') return 'Add visitor-zoned Toilets; every fixture serves one person.';
  if (kind === 'hygiene-served') return 'Add visitor-zoned Showers or Sinks.';
  if (kind === 'comfort-served') return 'Add a Game Station or Observatory Telescope.';
  if (kind === 'passengers-returned') return 'Protect the public route and leave boarding slack.';
  if (kind === 'freight-unloaded' || kind === 'freight-loaded') return 'Assign Cargo Handlers to the berth or storage and clear their route.';
  if (kind === 'fuel-received') return 'Add free Fuel Tank capacity and keep the cargo route staffed.';
  if (kind === 'fuel-delivered') return 'Stock fuel, assign a Cargo Handler, and clear the route from tank to berth pump.';
  return 'Protect the work needed by this promise.';
}

function refreshShiftBrief(activeTurnarounds: StationState['arrivingShips']): void {
  if (!state.rooms.includes(RoomType.Berth)) {
    const activePodVisits = state.arrivingShips.filter((ship) => ship.smallCraftVisit && ship.stage !== 'depart').length;
    shiftBriefEl.className = activePodVisits > 0 ? 'shift-brief is-active' : 'shift-brief';
    shiftBriefEl.innerHTML = activePodVisits > 0
      ? `<span class="shift-brief-kicker">Walk-in traffic</span><strong>${activePodVisits} Pod Dock visit${activePodVisits === 1 ? '' : 's'} in progress</strong><span>Passengers use station services while dock attachments handle their craft automatically.</span>`
      : '<span class="shift-brief-kicker">Pod Docks</span><strong>Walk-in traffic arrives automatically</strong><span>Keep food, shopping, fuel, and dock attachments available. Build a berth when you are ready for contracts.</span>';
    return;
  }

  const activeShip = activeTurnarounds
    .map((ship) => ({ ship, contract: ship.portContractId == null ? null : state.portOps.contracts.find((entry) => entry.id === ship.portContractId) ?? null }))
    .filter((entry) => entry.contract !== null)
    .sort((a, b) => (a.contract?.hardDepartureAt ?? Infinity) - (b.contract?.hardDepartureAt ?? Infinity))[0];
  if (activeShip?.contract) {
    const contract = activeShip.contract;
    const seconds = Math.max(0, Math.ceil(contract.hardDepartureAt - state.now));
    const incomplete = [...contract.promises]
      .filter((promise) => promise.completed + 0.01 < promise.target)
      .sort((a, b) => (a.completed / Math.max(1, a.target)) - (b.completed / Math.max(1, b.target)))[0];
    if (contract.status === 'boarding') {
      shiftBriefEl.className = 'shift-brief is-urgent';
      shiftBriefEl.innerHTML = `<span class="shift-brief-kicker">Boarding · ${seconds}s left</span><strong>Get ${escapeHtml(contract.callsign)} clear</strong><span>Optional work is over. Passengers are returning and unfinished freight will settle partial.</span>`;
      return;
    }
    if (incomplete) {
      const offer = activeShip.ship.portManifest;
      const rosterReady = offer ? crewPlanVerdict(offer).ready : false;
      shiftBriefEl.className = seconds <= 24 ? 'shift-brief is-urgent' : 'shift-brief is-active';
      shiftBriefEl.innerHTML = `<span class="shift-brief-kicker">Operate · ${seconds}s left</span><strong>${escapeHtml(incomplete.label)} ${Math.floor(incomplete.completed)}/${Math.floor(incomplete.target)}</strong><span>${seconds <= 24 || !rosterReady ? escapeHtml(promiseIntervention(incomplete.kind)) : 'Crew plan is staffed. Watch this count and intervene if it stalls.'}</span>`;
      return;
    }
  }

  const accepted = state.portOps.contracts
    .filter((contract) => contract.status === 'accepted')
    .sort((a, b) => a.arrivesAt - b.arrivesAt)[0];
  if (accepted) {
    const offer = state.trafficOffers.find((entry) => entry.id === accepted.offerId);
    if (offer) {
      const verdict = crewPlanVerdict(offer);
      shiftBriefEl.className = verdict.ready ? 'shift-brief is-ready' : 'shift-brief is-urgent';
      shiftBriefEl.innerHTML = `<span class="shift-brief-kicker">Prepare · arrives in ${Math.max(1, Math.ceil(accepted.arrivesAt - state.now))}s</span><strong>${escapeHtml(accepted.callsign)} · ${escapeHtml(offerOperatingPlan(offer))}</strong><span>${verdict.ready ? 'Required roles are available. Press Play, or accept an overlap that competes for the same people and routes.' : `${verdict.label}. Hire the role, adjust its watch, or hold this arrival.`}</span>`;
      return;
    }
  }

  if (state.portOps.selectedSettlementId !== null) {
    const settlement = state.portOps.settlements.find((entry) => entry.id === state.portOps.selectedSettlementId);
    if (settlement) {
      const failed = settlement.promises.find((promise) => promise.completed + 0.01 < promise.target);
      shiftBriefEl.className = failed ? 'shift-brief is-review' : 'shift-brief is-ready';
      shiftBriefEl.innerHTML = `<span class="shift-brief-kicker">Review the turnaround</span><strong>${escapeHtml(settlement.callsign)} · ${failed ? `${escapeHtml(failed.label)} fell short` : 'all promises met'}</strong><span>${failed ? escapeHtml(promiseIntervention(failed.kind)) : 'The station is ready for a harder overlap.'}</span>`;
      return;
    }
  }

  const openOffers = state.trafficOffers.filter((offer) => offer.status !== 'cleared');
  shiftBriefEl.className = 'shift-brief';
  shiftBriefEl.innerHTML = openOffers.length > 0
    ? '<span class="shift-brief-kicker">Commit frontage carefully</span><strong>Accept reserves a physical dock or berth</strong><span>Hold buys time once. Pass leaves the interface free for later traffic.</span>'
    : state.portOps.firstOfferShownAt === null
      ? '<span class="shift-brief-kicker">Start the shift</span><strong>Press Play to receive the first manifests</strong><span>Approach Control will announce arrivals without interrupting station operations.</span>'
      : '<span class="shift-brief-kicker">Waiting for traffic</span><strong>Keep the station ready</strong><span>Review the roster, meal buffer, storage route, and cargo-arm condition.</span>';
}

let lastSettlementRenderKey = '';

function refreshSettlementSummary(): void {
  const settlements = state.portOps.settlements;
  const berthMode = state.rooms.includes(RoomType.Berth);
  settlementCardEl.classList.toggle('hidden', !berthMode);
  bottomDockEl.classList.toggle('pod-only', !berthMode);
  const settlement = state.portOps.selectedSettlementId == null
    ? null
    : settlements.find((entry) => entry.id === state.portOps.selectedSettlementId) ?? settlements[settlements.length - 1] ?? null;
  const renderKey = JSON.stringify({
    selectedSettlementId: state.portOps.selectedSettlementId,
    settlements: settlements.map((entry) => [
      entry.id,
      entry.payoutCredits,
      entry.passengerSpendingCredits,
      entry.procurementCostCredits
    ])
  });
  if (renderKey === lastSettlementRenderKey) return;
  lastSettlementRenderKey = renderKey;
  if (!settlement) {
    settlementSummaryEl.innerHTML = settlements.length > 0
      ? `<div class="settlement-empty">Turnaround report dismissed.</div>${renderSettlementHistory(settlements)}`
      : 'No ship settled yet.';
    return;
  }
  const rows = settlement.promises.map((promise) => {
    const ratio = promise.target <= 0 ? 1 : clamp(promise.completed / promise.target, 0, 1);
    const tone = ratio >= 0.999 ? 'complete' : ratio > 0 ? 'partial' : 'failed';
    return `<div class="settlement-row ${tone}"><span>${promise.label}</span><b>${Math.floor(promise.completed)}/${Math.floor(promise.target)}</b></div>`;
  }).join('');
  const failedKinds = new Set(
    settlement.promises
      .filter((promise) => promise.completed + 0.01 < promise.target)
      .map((promise) => promise.kind)
  );
  const adaptation = failedKinds.has('fuel-received')
    ? {
        text: 'Adapt: add fuel-tank capacity, protect Cargo labor, or shorten the supplier route.',
        tile: state.moduleInstances.find((module) => module.type === ModuleType.FuelTank)?.originTile ?? null
      }
    : failedKinds.has('fuel-delivered')
      ? {
          text: 'Adapt: stock more fuel, protect Cargo labor, or move a tank closer to the berth pump.',
          tile: state.moduleInstances.find((module) => module.type === ModuleType.FuelPump)?.originTile ?? null
        }
      : failedKinds.has('freight-unloaded') || failedKinds.has('freight-loaded')
    ? {
        text: 'Adapt: protect Cargo labor, shorten the storage route, or add spare handling capacity.',
        tile: state.moduleInstances.find((module) => module.type === ModuleType.CargoArm)?.originTile ?? null
      }
    : failedKinds.has('passengers-served')
      ? {
          text: 'Adapt: protect Service labor, shorten the public route, or add counter throughput.',
          tile: state.moduleInstances.find((module) => module.type === ModuleType.ServingStation)?.originTile ?? null
        }
      : failedKinds.has('passengers-returned')
        ? {
            text: 'Adapt: shorten the berth route or begin boarding with more slack.',
            tile: state.moduleInstances.find((module) => module.type === ModuleType.Gangway)?.originTile ?? null
          }
        : null;
  const adaptationHtml = adaptation
    ? adaptation.tile === null
      ? `<small class="settlement-adaptation">${escapeHtml(adaptation.text)}</small>`
      : `<button class="settlement-adaptation" data-port-focus="${adaptation.tile}">${escapeHtml(adaptation.text)}</button>`
    : '<small class="settlement-adaptation complete">Ready for a tighter overlap or a more demanding manifest.</small>';
  const grossCredits = settlement.payoutCredits + settlement.passengerSpendingCredits;
  const netCredits = grossCredits - settlement.procurementCostCredits;
  const economics = settlement.procurementCostCredits > 0
    ? `+${grossCredits}c gross · -${settlement.procurementCostCredits}c supply · ${netCredits >= 0 ? '+' : ''}${netCredits}c net`
    : `+${grossCredits}c earned`;
  settlementSummaryEl.innerHTML = `
    <div class="settlement-head"><b>${settlement.callsign}</b><span>${economics}</span><button class="settlement-dismiss" data-dismiss-settlement aria-label="Dismiss turnaround report" title="Dismiss report">&times;</button></div>
    ${rows}
    <small>${settlement.notes.join(' · ')}</small>
    ${adaptationHtml}
    ${renderSettlementHistory(settlements)}
  `;
}

function renderSettlementHistory(settlements: StationState['portOps']['settlements']): string {
  if (settlements.length === 0) return '';
  const rows = settlements.slice(-5).reverse().map((entry) => {
    const completed = entry.promises.filter((promise) => promise.completed + 0.01 >= promise.target).length;
    const netCredits = entry.payoutCredits + entry.passengerSpendingCredits - entry.procurementCostCredits;
    return `<div class="settlement-history-row"><span>${escapeHtml(entry.callsign)}</span><span>${completed}/${entry.promises.length} promises</span><b>${netCredits >= 0 ? '+' : ''}${netCredits}c net</b></div>`;
  }).join('');
  return `<details class="settlement-history"><summary>Recent turnarounds</summary>${rows}</details>`;
}

let lastTrafficOfferRenderKey = '';
let lastFailureEpisodeRenderKey = '';

function trafficOfferTimer(offer: StationState['trafficOffers'][number]): string {
  if (offer.status === 'cleared') {
    return `COMMITTED · ETA ${Math.max(1, Math.ceil(offer.arrivesAt - state.now))}s`;
  }
  if (offer.status === 'holding') {
    return `HOLD · ${Math.max(0, Math.ceil(offer.expiresAt - state.now))}s`;
  }
  return `ETA ${Math.max(1, Math.ceil(offer.arrivesAt - state.now))}s`;
}

function refreshTrafficOfferTimers(offers: StationState['trafficOffers']): void {
  for (const offer of offers) {
    const timer = trafficOfferListEl.querySelector<HTMLElement>(`[data-offer-timer="${offer.id}"]`);
    if (timer) timer.textContent = trafficOfferTimer(offer);
  }
}

function compactLoadItem(label: string, value: string): string {
  return `<span><b>${escapeHtml(value)}</b>${label}</span>`;
}

type ProjectedAdmissionLoad = {
  berthMinutes: number;
  beds: number;
  meals: number;
  hygiene: number;
  staffMinutes: number;
  /** Prepared meals physically on the station right now. */
  mealsReady: number;
};

/**
 * What the station would be committed to if this offer were accepted.
 *
 * Every term already exists. `state.commitment` carries the accepted-contract
 * totals the sim refreshes each pass for the admission policy's own headroom
 * checks, and `preview.committedLoad` carries this offer's share; the forecast
 * is their sum, so it can never disagree with the gate that will judge the
 * accept. Hygiene has no commitment field, so the in-flight visits are summed
 * from the same offer previews the sim reads when it builds the other totals.
 * Nothing here simulates anything new.
 */
function projectedAdmissionLoad(preview: TrafficOfferPreview): ProjectedAdmissionLoad {
  const committed = state.commitment;
  let committedHygiene = 0;
  for (const ship of state.arrivingShips) {
    if (ship.stage === 'depart' || !ship.portManifest) continue;
    const shipPreview = getTrafficOfferPreview(state, ship.portManifest.id);
    committedHygiene += shipPreview?.committedLoad.hygieneVisits ?? 0;
  }
  const load = preview.committedLoad;
  return {
    berthMinutes: (committed.committedBerthSeconds + load.berthSeconds) / 60,
    beds: committed.committedBeds + load.bedNights,
    meals: committed.committedMeals + load.meals,
    hygiene: committedHygiene + load.hygieneVisits,
    staffMinutes: committed.committedStaffMinutes + load.staffMinutes,
    mealsReady: state.itemNodes.reduce((sum, node) => sum + Math.max(0, node.items.meal ?? 0), 0)
  };
}

const RECOVERY_ACTION_LABELS = [
  ['emergency-meals', 'Emergency meal'],
  ['temporary-lodging', 'Temporary bunk'],
  ['prioritize-repair', 'Prioritize repair'],
  ['compensate', 'Compensate'],
  ['onward-transfer', 'Onward transfer'],
  ['cancel-contract', 'Cancel contract'],
  ['close-admissions', 'Close admissions'],
  ['security-intervention', 'Security response']
] as const;

function refreshRecoveryEpisodes(): void {
  const episodes = getFailureEpisodes(state);
  failureEpisodeCountEl.textContent = `${episodes.length} active`;
  failureEpisodeCountEl.classList.toggle('is-active', episodes.length > 0);
  for (const episode of episodes) {
    const elapsedEl = failureEpisodeListEl.querySelector<HTMLElement>(`[data-failure-elapsed="${episode.id}"]`);
    if (elapsedEl) elapsedEl.textContent = `${Math.max(0, Math.round(state.now - episode.openedAt))}s`;
  }
  const renderKey = JSON.stringify(episodes.map((episode) => [
    episode.id,
    episode.subjectId,
    episode.shipId,
    episode.need,
    episode.cause,
    episode.stage,
    episode.actionsApplied
  ]));
  if (renderKey === lastFailureEpisodeRenderKey) return;
  lastFailureEpisodeRenderKey = renderKey;
  if (episodes.length === 0) {
    failureEpisodeListEl.innerHTML = '<div class="failure-episode-empty">No failed stays. Current commitments remain recoverable.</div>';
    return;
  }
  failureEpisodeListEl.innerHTML = episodes.map((episode) => {
    const visitor = state.visitors.find((entry) => entry.id === episode.subjectId);
    const ship = episode.shipId === null ? null : state.arrivingShips.find((entry) => entry.id === episode.shipId) ?? null;
    const elapsed = Math.max(0, Math.round(state.now - episode.openedAt));
    const actions = RECOVERY_ACTION_LABELS
      .filter(([kind]) => {
        if ((kind === 'prioritize-repair' || kind === 'cancel-contract') && episode.shipId === null) return false;
        if (kind === 'security-intervention' && episode.stage !== 'disruptive') return false;
        return true;
      })
      .map(([kind, label]) => {
        const used = episode.actionsApplied.includes(kind);
        return `<button type="button" data-recovery-action="${kind}" data-episode-id="${episode.id}" data-visitor-id="${episode.subjectId}"${episode.shipId === null ? '' : ` data-ship-id="${episode.shipId}"`}${used ? ' disabled aria-disabled="true"' : ''}>${escapeHtml(label)}${used ? ' ✓' : ''}</button>`;
      }).join('');
    return `<article class="failure-episode-card stage-${episode.stage}" data-failure-episode="${episode.id}">
      <div class="failure-episode-head">
        <span><strong>${escapeHtml(visitor?.name ?? `Guest ${episode.subjectId}`)}</strong><small>${escapeHtml(ship?.portManifest?.callsign ?? (episode.shipId === null ? 'Walk-in stay' : `Ship ${episode.shipId}`))}</small></span>
        <b>${escapeHtml(episode.stage.toUpperCase())} · <span data-failure-elapsed="${episode.id}">${elapsed}s</span></b>
      </div>
      <p>${escapeHtml(episode.cause)}${episode.need ? ` · needs ${escapeHtml(episode.need)}` : ''}</p>
      <div class="failure-episode-actions" aria-label="Recovery actions for ${escapeHtml(visitor?.name ?? `guest ${episode.subjectId}`)}">${actions}</div>
    </article>`;
  }).join('');
}

function syncNumberInput(input: HTMLInputElement, value: number): void {
  if (document.activeElement !== input) input.value = String(value);
}

function refreshAdmissionPolicyEditor(): void {
  const policy = state.admissionPolicy;
  const pressure = getAdmissionPressure(state);
  admissionPolicyEnabledEl.checked = policy.enabled;
  admissionPodEnabledEl.checked = policy.pod.enabled;
  admissionBerthEnabledEl.checked = policy.berth.enabled;
  admissionPolicyEditorEl.classList.toggle('is-off', !policy.enabled);
  const values: Record<string, number> = {
    'pod.reserveFreeInterfaces': policy.pod.reserveFreeInterfaces,
    'pod.maxStaySeconds': policy.pod.maxStaySeconds,
    'pod.minMarginCredits': policy.pod.minMarginCredits,
    'berth.reserveFreeInterfaces': policy.berth.reserveFreeInterfaces,
    'berth.maxStaySeconds': policy.berth.maxStaySeconds,
    'berth.minMarginCredits': policy.berth.minMarginCredits,
    reserveBeds: policy.reserveBeds,
    reserveMeals: policy.reserveMeals
  };
  for (const input of admissionPolicyEditorEl.querySelectorAll<HTMLInputElement>('input[data-admission-number]')) {
    const key = input.dataset.admissionNumber;
    if (key && values[key] !== undefined) syncNumberInput(input, values[key]);
  }
  const closure = policy.closedUntil !== null && policy.closedUntil > state.now
    ? ` · recovery closure ${Math.ceil(policy.closedUntil - state.now)}s`
    : '';
  admissionPressureEl.textContent = `${pressure.pendingPods} pod / ${pressure.pendingBerths} berth waiting · ${pressure.autoAccepts} routine clear · ${pressure.autoHolds} held · ${pressure.manual} manual${closure}${pressure.topReason ? ` · ${pressure.topReason}` : ''}`;
}

type OfferInterfaceChoice = {
  id: string;
  label: string;
  slotId: string;
  side: SpaceLane | null;
};

function chosenOfferInterface(offer: TrafficOffer, preview: TrafficOfferPreview): OfferInterfaceChoice | null {
  const assignedId = offer.size === 'small'
    ? offer.assignedDockSourceKey ?? null
    : offer.assignedBerthAnchor === null || offer.assignedBerthAnchor === undefined
      ? null
      : String(offer.assignedBerthAnchor);
  const choice = (assignedId === null
    ? preview.compatibleInterface.interfaces.find((entry) => entry.available)
    : preview.compatibleInterface.interfaces.find((entry) => entry.id === assignedId))
    ?? preview.compatibleInterface.interfaces[0]
    ?? null;
  if (!choice) return null;
  const slotId = choice.kind === 'pod-dock' ? `dock:${choice.id}` : `berth:${choice.id}`;
  const side = getDockingSlotDescriptors(state).find((descriptor) => descriptor.id === slotId)?.facing ?? null;
  return { id: choice.id, label: choice.label, slotId, side };
}

let renderedBerthOpsHtml = '';

/**
 * The physical interface a live turnaround is running on.
 *
 * Berth work anchors on the berth's own anchor tile; pod work anchors on the
 * Pod Dock module the craft is clamped to. A ship that has not been given an
 * interface yet has nothing to stand beside, and is left to Approach Control.
 */
function berthOpsAnchorTile(ship: StationState['arrivingShips'][number]): number | null {
  if (ship.assignedBerthAnchor !== null && ship.assignedBerthAnchor !== undefined) {
    return ship.assignedBerthAnchor;
  }
  if (ship.assignedDockId === null) return null;
  const dock = state.docks.find((entry) => entry.id === ship.assignedDockId);
  if (!dock) return null;
  return dock.moduleId === undefined
    ? dock.tiles[0] ?? null
    : state.moduleInstances.find((module) => module.id === dock.moduleId)?.originTile ?? dock.tiles[0] ?? null;
}

/**
 * Place each live-ops card beside the interface it reports on.
 *
 * Runs every frame because the camera can move between UI refreshes. Cards
 * whose interface has scrolled off screen are hidden rather than clamped: a
 * card pinned to the viewport edge would claim to describe a berth that is not
 * there, which is exactly the floating-HUD problem this replaces.
 */
function syncBerthOpsAnchors(): void {
  const cards = berthOpsAnchorsEl.querySelectorAll<HTMLElement>('.berth-ops-anchor');
  if (cards.length === 0) return;
  const wrap = gameWrap.getBoundingClientRect();
  for (const card of cards) {
    const tile = Number(card.dataset.berthOpsTile);
    if (!Number.isFinite(tile)) continue;
    const anchor = tileClientRect(tile);
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const offScreen =
      anchor.x < wrap.left - anchor.size ||
      anchor.x > wrap.right + anchor.size ||
      anchor.y < wrap.top - anchor.size ||
      anchor.y > wrap.bottom + anchor.size;
    card.classList.toggle('is-offscreen', offScreen);
    if (offScreen) continue;
    // Prefer sitting to the right of the interface, flipping only at the edge,
    // so the card never covers the berth it is reporting on.
    const gap = anchor.size * 0.6 + 8;
    const flip = anchor.x + gap + width + 10 > window.innerWidth;
    const left = flip ? anchor.x - gap - width : anchor.x + gap;
    card.classList.toggle('anchor-left', flip);
    card.style.left = `${Math.round(clamp(left, 10, Math.max(10, window.innerWidth - width - 10)))}px`;
    card.style.top = `${Math.round(clamp(anchor.y - height * 0.5, 10, Math.max(10, window.innerHeight - height - 10)))}px`;
  }
}

function refreshTrafficOffers(): void {
  refreshRecoveryEpisodes();
  refreshAdmissionPolicyEditor();
  const cargoOps = state.portOps;
  const cargoArmCount = state.moduleInstances.filter((module) => module.type === ModuleType.CargoArm).length;
  // Contextual UI: strain and repair readouts describe hardware. A station that
  // has never installed a cargo arm gets no row for one.
  cargoArmRowEl.classList.toggle('hidden', cargoArmCount <= 0);
  cargoArmStatusEl.textContent = cargoOps.cargoArmStatus === 'fault'
    ? cargoArmCount >= 2
      ? `PRIMARY FAULT · spare at 55% · repair ${cargoOps.cargoArmRepairProgress.toFixed(1)}/8s`
      : `FAULT · repair ${cargoOps.cargoArmRepairProgress.toFixed(1)}/8s`
    : `${cargoOps.cargoArmStatus === 'warning' ? 'Strained' : 'Ready'} · ${Math.round(cargoOps.cargoArmStrain)}% strain${cargoArmCount >= 2 ? ` · ${cargoArmCount} arms` : ''}`;
  cargoArmStatusEl.className = `value cargo-arm-${cargoOps.cargoArmStatus}`;
  const activeTurnarounds = state.arrivingShips.filter((ship) =>
    ship.stage !== 'depart' && (ship.portManifest || ship.smallCraftVisit)
  );
  refreshShiftBrief(activeTurnarounds.filter((ship) => ship.portManifest && !ship.smallCraftVisit));
  const activeHtml = activeTurnarounds.map((ship) => {
    // Dock/berth operations are anchored to the interface they run on, so each
    // card carries the tile it belongs to and syncBerthOpsAnchors places it.
    const anchorTile = berthOpsAnchorTile(ship);
    if (anchorTile === null) return '';
    if (ship.smallCraftVisit) {
      const dock = ship.assignedDockId === null ? null : state.docks.find((entry) => entry.id === ship.assignedDockId) ?? null;
      const services = ship.smallCraftVisit.services;
      const progress = services.length > 0
        ? Math.round((services.reduce((sum, service) => sum + clamp(service.progress, 0, 1), 0) / services.length) * 100)
        : 0;
      const firstBlocked = services.find((service) => service.status === 'blocked' && service.blockedReason)?.blockedReason ?? null;
      const serviceSummary = services.map((service) =>
        `${podDockServiceLabel(service.kind, service.freightDirection)} ${service.status.toUpperCase()} ${Math.round(service.progress * 100)}%`
      ).join(' · ');
      return `<article class="traffic-offer port-turnaround small-craft-turnaround berth-ops-anchor" data-berth-ops-tile="${anchorTile}">
        <div class="traffic-offer-head"><strong>${escapeHtml(ship.portManifest?.callsign ?? `POD ${ship.id}`)} · POD DOCK</strong><span>${ship.stage.toUpperCase()} · ${progress}%</span></div>
        <div class="traffic-offer-meta">${dock ? `DOCK ${dock.id}` : 'DOCK LINK LOST'} · ${ship.passengersTotal} GUEST${ship.passengersTotal === 1 ? '' : 'S'}</div>
        <div class="turnaround-track"><i style="width:${Math.max(3, progress)}%"></i></div>
        <div class="small-craft-service-summary">${escapeHtml(serviceSummary)}</div>
        ${firstBlocked ? `<small class="small-craft-blocked">Action: ${escapeHtml(firstBlocked)}</small>` : ''}
      </article>`;
    }
    const offer = ship.portManifest!;
    const turn = ship.portTurnaround;
    const berthStanding = ship.assignedBerthAnchor == null ? null : getBerthInspectorAt(state, ship.assignedBerthAnchor);
    const contract = ship.portContractId == null ? null : state.portOps.contracts.find((entry) => entry.id === ship.portContractId) ?? null;
    const phase = ship.stage === 'approach' ? 'APPROACHING' : contract?.status === 'boarding' ? 'BOARDING' : !turn ? 'BERTHING' : turn.phase.toUpperCase();
    const promiseRatios = contract?.promises.map((promise) => promise.target <= 0 ? 1 : clamp(promise.completed / promise.target, 0, 1)) ?? [];
    const progress = promiseRatios.length > 0 ? Math.round((promiseRatios.reduce((sum, ratio) => sum + ratio, 0) / promiseRatios.length) * 100) : 0;
    const secondsLeft = contract ? Math.max(0, Math.ceil(contract.hardDepartureAt - state.now)) : Math.max(0, Math.ceil((turn?.loadingDeadlineAt ?? state.now) - state.now));
    const promiseRows = contract?.promises.map((promise) => {
      const complete = promise.completed >= promise.target - 0.001;
      return `<div class="turnaround-promise ${complete ? 'complete' : ''}"><span>${promise.label}</span><b>${Math.floor(promise.completed)}/${Math.floor(promise.target)}</b></div>`;
    }).join('') ?? '<div class="traffic-offer-line">Preparing contract...</div>';
    return `<article class="traffic-offer port-turnaround phase-${turn?.phase ?? 'approach'} berth-ops-anchor" data-berth-ops-tile="${anchorTile}">
      <div class="traffic-offer-head"><strong>${offer.callsign} · ${offer.shipName}</strong><span>${phase} · ${secondsLeft}s</span></div>
      <div class="traffic-offer-meta">${(offer.offerKind ?? 'mixed').toUpperCase()} SHIFT · BERTH ${berthStanding?.serviceGrade ?? 'C'} · ${offer.passengersTotal} pax</div>
      <div class="turnaround-track"><i style="width:${Math.max(3, progress)}%"></i></div>
      <div class="turnaround-promises">${promiseRows}</div>
    </article>`;
  }).join('');
  if (activeHtml !== renderedBerthOpsHtml) {
    renderedBerthOpsHtml = activeHtml;
    berthOpsAnchorsEl.innerHTML = activeHtml;
  }
  syncBerthOpsAnchors();
  if (!state.controls.manualTrafficAdmission) {
    trafficOfferListEl.innerHTML = '';
    return;
  }
  const hasBerthCapacity = state.rooms.includes(RoomType.Berth);
  const visibleOffers = state.trafficOffers.filter((offer) => hasBerthCapacity || offer.size === 'small');
  const offerViews = visibleOffers.map((offer) => {
    const preview = getTrafficOfferPreview(state, offer.id);
    return { offer, preview, choice: preview ? chosenOfferInterface(offer, preview) : null };
  });
  if (projectedTrafficOffer) {
    const projectedView = offerViews.find(({ offer }) => offer.id === projectedTrafficOffer?.offerId);
    projectedTrafficOffer = projectedView?.choice
      ? {
          offerId: projectedView.offer.id,
          slotId: projectedView.choice.slotId,
          hullVariant: projectedView.offer.hullVariant,
          size: projectedView.offer.size
        }
      : null;
  }
  const offerRenderKey = JSON.stringify({
    dockVersion: state.dockVersion,
    manual: state.controls.manualTrafficAdmission,
    hasBerthCapacity,
    policy: state.admissionPolicy,
    // The projected-load line moves with the station's standing commitments and
    // its meal stock, neither of which is a property of any single offer, so
    // they have to enter the render key on their own.
    commitment: [
      Math.round(state.commitment.committedBerthSeconds / 30),
      state.commitment.committedBeds,
      Math.round(state.commitment.committedMeals),
      Math.round(state.commitment.committedStaffMinutes),
      Math.floor(state.itemNodes.reduce((sum, node) => sum + Math.max(0, node.items.meal ?? 0), 0))
    ],
    offers: offerViews.map(({ offer, preview, choice }) => [
      offer.id,
      offer.status,
      offer.holdUsed,
      offer.admissionNote,
      choice?.slotId ?? null,
      choice?.side ?? null,
      preview?.compatibleInterface.compatibleCount ?? 0,
      preview?.compatibleInterface.freeCount ?? 0,
      preview?.canAccept ?? false,
      preview?.canHold ?? false
    ])
  });
  if (offerRenderKey === lastTrafficOfferRenderKey) {
    refreshTrafficOfferTimers(visibleOffers);
    return;
  }
  lastTrafficOfferRenderKey = offerRenderKey;
  if (visibleOffers.length === 0) {
    trafficOfferListEl.innerHTML = state.trafficOffers.length > 0 && !hasBerthCapacity
      ? '<div class="traffic-empty">Berth contracts are waiting beyond this Pod Dock-only station.</div>'
      : '<div class="traffic-empty">Orbital manifest queue clear</div>';
    return;
  }
  const offersHtml = offerViews.map(({ offer, preview, choice }) => {
    if (!preview) return '';
    const cleared = offer.status === 'cleared';
    const className = preview.shipClass === 'pod' ? 'pod' : 'berth';
    const interfaceLabel = preview.compatibleInterface.kind === 'pod-dock' ? 'Pod Docks' : 'Berths';
    const range = (value: { min: number; max: number }, suffix: string) =>
      value.min === value.max ? `${value.min}${suffix}` : `${value.min}-${value.max}${suffix}`;
    // The finite admission policy already refuses to answer a `high` risk call
    // on its own, so the label driving that gate has to be readable here rather
    // than only inside the policy's explanation. Faction gets no equivalent
    // chip: no faction-standing system exists, so it would be exactly the
    // illegible dependency the checklist forbids.
    const riskChip = `<span class="traffic-cue traffic-risk-cue risk-${offer.riskLabel}" title="${
      offer.riskLabel === 'high'
        ? 'High-risk calls always stay a manual decision.'
        : `Approach risk read as ${offer.riskLabel}.`
    }">${offer.riskLabel.toUpperCase()} RISK</span>`;
    // One fewer service cue keeps the chip row a single line: the card is a
    // short decision surface, not a manifest.
    const cues = preview.serviceCues.slice(0, 3)
      .map((cue) => `<span class="traffic-cue">${escapeHtml(cue)}</span>`)
      .join('');
    const load = preview.committedLoad;
    // Future-load forecasting belongs to the admission decision, not to a panel
    // of its own: the strip states what this call adds, and the line under it
    // states where the whole station lands if you say yes. Meals carry the only
    // honest denominator available — the prepared meals physically in stock —
    // because that is the number the admission gate itself compares against.
    const projected = projectedAdmissionLoad(preview);
    const mealsShort = projected.meals > projected.mealsReady;
    const forecast = `<div class="traffic-load-forecast${mealsShort ? ' is-short' : ''}" title="Station-wide load once every accepted call is served, this offer included.">
      <span class="traffic-load-forecast-label">If accepted</span>
      <span>${Math.ceil(projected.berthMinutes)}m berth</span>
      <span>${projected.beds} bed${projected.beds === 1 ? '' : 's'}</span>
      <span class="${mealsShort ? 'short' : ''}">${Math.ceil(projected.meals)}/${Math.floor(projected.mealsReady)} meals</span>
      <span>${Math.ceil(projected.hygiene)} hygiene</span>
      <span>${Math.ceil(projected.staffMinutes)}m staff</span>
    </div>`;
    const hull = shipHullProfile(offer.hullVariant);
    const blocker = !cleared && !preview.canAccept && preview.acceptReason
      ? `<small class="traffic-offer-blocker">${escapeHtml(preview.acceptReason)}</small>`
      : '';
    const policyNote = offer.admissionNote
      ? `<small class="traffic-admission-note">${escapeHtml(offer.admissionNote)}</small>`
      : '';
    const interfaceChoice = choice
      ? `<div class="traffic-interface-choice"><b>${escapeHtml(choice.label)}</b><span>${choice.side ? `${choice.side.toUpperCase()} approach` : 'Approach side unavailable'}</span></div>`
      : '<div class="traffic-interface-choice is-blocked"><b>No compatible interface</b><span>Manual planning required</span></div>';
    const berthAnchor = choice && preview.shipClass === 'berth' ? Number(choice.id) : null;
    const actions = cleared
      ? '<span class="traffic-commitment">Interface committed</span>'
      : `<button data-traffic-action="accept" data-offer-id="${offer.id}"${berthAnchor !== null && Number.isFinite(berthAnchor) ? ` data-berth-anchor="${berthAnchor}"` : ''} ${preview.canAccept ? '' : 'disabled'}>Accept</button>
        <button data-traffic-action="hold" data-offer-id="${offer.id}" ${preview.canHold ? '' : 'disabled'}>Hold</button>
        <button data-traffic-action="pass" data-offer-id="${offer.id}" ${preview.canPass ? '' : 'disabled'}>Pass</button>`;
    const projectionData = choice
      ? ` data-offer-slot-id="${escapeHtml(choice.slotId)}" data-offer-hull-variant="${offer.hullVariant}" data-offer-size="${offer.size}"`
      : '';
    return `<article class="traffic-offer decision-card ${className} ${offer.status === 'holding' ? 'is-holding' : ''} ${cleared ? 'is-cleared' : ''}" data-traffic-offer-id="${offer.id}" data-offer-lane="${offer.lane}" data-offer-risk="${offer.riskLabel}"${projectionData} tabindex="0" aria-label="${escapeHtml(offer.callsign)} on the ${offer.lane} lane, ${offer.riskLabel} risk. ${choice ? `${choice.label}, ${choice.side ?? 'unknown'} approach.` : 'No compatible interface.'} Focus to project its physical approach envelope.">
      <div class="traffic-offer-title-row">
        <span class="traffic-offer-class traffic-offer-class--${className}" aria-hidden="true"><i></i></span>
        <img class="traffic-offer-hull" src="${shipHullAssetPath(offer.hullVariant)}" alt="${escapeHtml(hull.variant.replace(/-/g, ' '))}">
        <div><strong>${escapeHtml(offer.callsign)}</strong><small>${escapeHtml(offer.shipName)}</small></div>
        <span class="traffic-offer-approach">
          <span class="traffic-offer-lane">${offer.lane.toUpperCase()} LANE</span>
          <span class="traffic-offer-timer" data-offer-timer="${offer.id}">${trafficOfferTimer(offer)}</span>
        </span>
      </div>
      <div class="traffic-offer-facts"><span>${preview.shipClass === 'pod' ? 'POD' : offer.size.toUpperCase()} · ${range(preview.partySize, ' guests')}</span><span>${range(preview.staySeconds, 's')} stay</span></div>
      <div class="traffic-cues">${riskChip}${cues}</div>
      <div class="traffic-interface ${preview.compatibleInterface.freeCount > 0 ? 'ready' : 'blocked'}"><b>${preview.compatibleInterface.freeCount}/${preview.compatibleInterface.compatibleCount}</b> ${interfaceLabel} free <span>· ${range(preview.expectedRevenue, 'c')}</span></div>
      ${interfaceChoice}
      <div class="traffic-load-strip" aria-label="Load this call commits">
        ${compactLoadItem('berth', `${Math.ceil(load.berthSeconds / 60)}m`)}
        ${compactLoadItem('beds', String(load.bedNights))}
        ${compactLoadItem('meals', String(load.meals))}
        ${compactLoadItem('hygiene', String(load.hygieneVisits))}
        ${compactLoadItem('staff', `${load.staffMinutes}m`)}
      </div>
      ${forecast}
      ${blocker}
      ${policyNote}
      <div class="traffic-offer-actions">${actions}</div>
    </article>`;
  }).join('') || '<div class="traffic-empty">No compatible approach traffic is waiting.</div>';
  trafficOfferListEl.innerHTML = offersHtml;
  refreshTrafficOfferTimers(visibleOffers);
}

let routeConflictCalloutSampledAt = Number.NEGATIVE_INFINITY;
let routeConflictCallout: { tileIndex: number; label: string } | null = null;

function drawPortTurnaroundCallouts(): void {
  const drawLabel = (label: string, cx: number, cy: number, color: string): void => {
    const width = Math.max(54, ctx.measureText(label).width + 18);
    ctx.fillStyle = 'rgba(4, 11, 18, 0.92)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(cx - width / 2, cy - 8, width, 16, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f4f8fb';
    ctx.fillText(label, cx, cy + 0.5);
  };
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 9px Consolas, Menlo, monospace';
  for (const ship of state.arrivingShips) {
    if (!ship.portManifest || ship.stage === 'depart' || ship.assignedBerthAnchor == null) continue;
    const turn = ship.portTurnaround;
    const contract = ship.portContractId == null ? null : state.portOps.contracts.find((candidate) => candidate.id === ship.portContractId) ?? null;
    const x = ship.assignedBerthAnchor % state.width;
    const y = Math.floor(ship.assignedBerthAnchor / state.width);
    const seconds = contract ? Math.max(0, Math.ceil(contract.hardDepartureAt - state.now)) : null;
    const incomplete = contract?.promises.find((promise) => promise.completed + 0.01 < promise.target) ?? null;
    const quantity = incomplete && seconds !== null && seconds <= 28
      ? ` · ${Math.floor(incomplete.completed)}/${Math.floor(incomplete.target)}`
      : '';
    const requiredRole = incomplete?.kind === 'freight-unloaded' || incomplete?.kind === 'freight-loaded' || incomplete?.kind === 'fuel-received' || incomplete?.kind === 'fuel-delivered'
      ? 'cargo-handler'
      : incomplete?.kind === 'drinks-served'
        ? 'steward'
        : incomplete?.kind === 'passengers-served'
          ? 'hospitality'
          : null;
    const roleAvailable = requiredRole === 'hospitality'
      ? state.crewMembers.some((crew) =>
          (crew.staffRole === 'cook' || crew.staffRole === 'steward') && getCrewWatchStatus(state, crew) !== 'off-duty'
        )
      : requiredRole === null
        ? true
        : state.crewMembers.some((crew) => crew.staffRole === requiredRole && getCrewWatchStatus(state, crew) !== 'off-duty');
    const roleWarning = roleAvailable || requiredRole === null
      ? ''
      : requiredRole === 'cargo-handler' ? ' · NO CARGO HANDLER' : requiredRole === 'steward' ? ' · NO STEWARD' : ' · NO COOK/STEWARD';
    const label = `${ship.stage === 'approach' ? 'INBOUND' : (turn?.phase ?? 'BERTHING').toUpperCase()}${seconds === null ? '' : ` ${seconds}s`}${quantity}${roleWarning}`;
    const cx = x * TILE_SIZE + TILE_SIZE * 0.5;
    const cy = y * TILE_SIZE - 9;
    const color = seconds !== null && incomplete && seconds <= 12
      ? '#ff6868'
      : seconds !== null && incomplete && seconds <= 28
        ? '#f3bd62'
        : turn?.phase === 'open' ? '#63d6a0' : '#75b8e8';
    drawLabel(label, cx, cy, color);
  }
  if (state.now - routeConflictCalloutSampledAt >= 1 || state.now < routeConflictCalloutSampledAt) {
    routeConflictCalloutSampledAt = state.now;
    routeConflictCallout = null;
    const diagnostics = getRoutePressureDiagnostics(state);
    let bestScore = 0;
    for (let tileIndex = 0; tileIndex < state.tiles.length; tileIndex++) {
      const publicFlow = diagnostics.visitorByTile[tileIndex] + diagnostics.residentByTile[tileIndex];
      const serviceFlow = diagnostics.crewByTile[tileIndex] + diagnostics.logisticsByTile[tileIndex];
      if (publicFlow <= 0 || serviceFlow <= 0) continue;
      const tile = getRoutePressureTileDiagnostic(
        state,
        tileIndex % state.width,
        Math.floor(tileIndex / state.width),
        diagnostics
      );
      if (!tile || tile.conflictScore <= 0) continue;
      const score = tile.conflictScore * 10 + tile.totalCount;
      if (score <= bestScore) continue;
      bestScore = score;
      routeConflictCallout = {
        tileIndex,
        label: tile.logisticsCount > 0 ? 'PUBLIC / CARGO CONFLICT' : 'PUBLIC / CREW CONFLICT'
      };
    }
  }
  if (routeConflictCallout) {
    const x = routeConflictCallout.tileIndex % state.width;
    const y = Math.floor(routeConflictCallout.tileIndex / state.width);
    drawLabel(routeConflictCallout.label, (x + 0.5) * TILE_SIZE, y * TILE_SIZE - 7, '#f3bd62');
  }
  const servingStations = state.moduleInstances.filter((module) => module.type === ModuleType.ServingStation);
  const serving = servingStations[0];
  const activeGuests = state.visitors.filter((visitor) => visitor.state !== VisitorState.ToDock).length;
  const activeCrewMeals = state.crewMembers.filter((crew) => crew.eating || crew.carryingMeal).length;
  if (serving && (activeGuests > 0 || activeCrewMeals > 0)) {
    const p = fromIndex(serving.originTile, state.width);
    const queue = state.metrics.cafeteriaQueueingCount;
    // A 2x1 serving station has two physical pickup positions but one shared
    // item node. Summarize every station here; using the first node made a
    // stocked mess hall claim "NO CLEAN TRAYS" when only one counter was dry.
    const inventoryByTile = new Map(state.itemNodes.map((node) => [node.tileIndex, node]));
    const mealStock = servingStations.reduce(
      (total, module) => total + Math.max(0, inventoryByTile.get(module.originTile)?.items.meal ?? 0),
      0
    );
    const cleanTrays = servingStations.reduce(
      (total, module) => total + Math.max(0, inventoryByTile.get(module.originTile)?.items.cleanTray ?? 0),
      0
    );
    const readyServings = servingStations.reduce((total, module) => {
      const items = inventoryByTile.get(module.originTile)?.items;
      return total + Math.min(Math.max(0, items?.meal ?? 0), Math.max(0, items?.cleanTray ?? 0));
    }, 0);
    const pickupSlots = servingStations.length * 2;
    const label = readyServings <= 0 && mealStock > 0
      ? `MESS · NO CLEAN TRAYS · LINE ${queue}`
      : readyServings <= 0
      ? `MESS · NO MEALS · LINE ${queue}`
      : `MESS · ${pickupSlots} PICKUP SLOTS · ${Math.floor(readyServings)} READY${queue > 0 ? ` · LINE ${queue}` : ''}`;
    const color = readyServings <= 0 ? '#ff6868' : queue >= 5 ? '#f3bd62' : '#63d6a0';
    drawLabel(label, (p.x + 0.5) * TILE_SIZE, p.y * TILE_SIZE - 6, color);
  }

  const drawFacilityLoad = (
    room: RoomType,
    anchorTypes: ModuleType[],
    label: string,
    capacity: number,
    using: number,
    waiting: number
  ): void => {
    if (using + waiting <= 0) return;
    const anchor = state.moduleInstances.find(
      (module) => anchorTypes.includes(module.type) && state.rooms[module.originTile] === room
    );
    if (!anchor) return;
    const p = fromIndex(anchor.originTile, state.width);
    const full = capacity <= 0 || using >= capacity;
    const text = `${label} · ${using}/${capacity} IN USE${waiting > 0 ? ` · ${waiting} WAITING` : ''}`;
    drawLabel(text, (p.x + anchor.width * 0.5) * TILE_SIZE, p.y * TILE_SIZE - 6, full && waiting > 0 ? '#ff8066' : waiting > 0 ? '#f3bd62' : '#63d6a0');
  };

  const sleepModules = state.moduleInstances.filter(
    (module) => (module.type === ModuleType.Bed || module.type === ModuleType.Bunk) && state.rooms[module.originTile] === RoomType.Dorm
  );
  const sleepCapacity = sleepModules.reduce((sum, module) => sum + (module.type === ModuleType.Bunk ? 2 : 1), 0);
  const sleepingCrew = state.crewMembers.filter((crew) => crew.restSessionActive).length;
  const sleepingResidents = state.residents.filter((resident) => resident.state === ResidentState.Sleeping).length;
  const waitingForSleep = state.crewMembers.filter((crew) => crew.resting && !crew.restSessionActive).length +
    state.residents.filter((resident) => resident.state === ResidentState.ToDorm).length;
  drawFacilityLoad(RoomType.Dorm, [ModuleType.Bed, ModuleType.Bunk], 'QUARTERS', sleepCapacity, sleepingCrew + sleepingResidents, waitingForSleep);

  const toiletCapacity = state.moduleInstances.filter(
    (module) => module.type === ModuleType.Toilet && state.rooms[module.originTile] === RoomType.Hygiene
  ).length;
  const toiletUsers = state.crewMembers.filter((crew) => crew.toiletSessionActive).length +
    state.visitors.filter((visitor) => visitor.activeService === 'restroom' && visitor.state === VisitorState.Leisure).length +
    state.residents.filter(
      (resident) => resident.state === ResidentState.Cleaning && state.modules[resident.tileIndex] === ModuleType.Toilet
    ).length;
  const toiletWaiting = state.crewMembers.filter((crew) => crew.toileting && !crew.toiletSessionActive).length +
    state.visitors.filter((visitor) => visitor.activeService === 'restroom' && visitor.state === VisitorState.ToLeisure).length +
    state.residents.filter(
      (resident) => resident.state === ResidentState.ToHygiene && resident.reservedTargetTile !== null && state.modules[resident.reservedTargetTile] === ModuleType.Toilet
    ).length;
  drawFacilityLoad(RoomType.Hygiene, [ModuleType.Toilet], 'RESTROOM', toiletCapacity, toiletUsers, toiletWaiting);

  const cantinaBars = state.moduleInstances.filter(
    (module) => module.type === ModuleType.BarCounter && state.rooms[module.originTile] === RoomType.Cantina
  );
  if (cantinaBars.length > 0) {
    const barAnchors = new Set(cantinaBars.map((module) => module.originTile));
    let line = 0;
    for (const [anchor, members] of state.derived.queueTheater.membersByAnchor) {
      if (barAnchors.has(anchor)) line += members.length;
    }
    const cantinaSeats = state.moduleInstances
      .filter((module) => module.type === ModuleType.Bench && state.rooms[module.originTile] === RoomType.Cantina)
      .flatMap((module) => module.tiles.slice(0, 2));
    const seatSet = new Set(cantinaSeats);
    const seatsUsed =
      state.visitors.filter((visitor) => visitor.state === VisitorState.Leisure && seatSet.has(visitor.tileIndex)).length +
      state.residents.filter((resident) => resident.state === ResidentState.Leisure && seatSet.has(resident.tileIndex)).length +
      state.crewMembers.filter((crew) => crew.leisureSessionActive && seatSet.has(crew.tileIndex)).length;
    const waitingForSeat = state.visitors.filter(
      (visitor) => visitor.activeService === 'drink' && visitor.carryingDrink && visitor.state === VisitorState.ToLeisure
    ).length;
    const ordering = state.reservations.reduce((total, reservation) => {
      if (reservation.releaseReason !== null || reservation.expiresAt <= state.now) return total;
      if (reservation.ownerKind !== 'visitor' || reservation.kind !== 'provider-slot') return total;
      if (reservation.targetTile === null || !barAnchors.has(reservation.targetTile)) return total;
      if (!reservation.targetId?.startsWith('drink-pickup:')) return total;
      return total + reservation.amount;
    }, 0);
    const stewardCount = state.crewMembers.filter(
      (crew) =>
        !crew.resting &&
        String(crew.staffRole) === 'steward' &&
        crew.assignedSystem === 'lounge' &&
        state.rooms[crew.tileIndex] === RoomType.Cantina
    ).length;
    if (line + ordering + waitingForSeat + seatsUsed > 0) {
      const anchor = cantinaBars[0];
      const p = fromIndex(anchor.originTile, state.width);
      const text = `CANTINA · LINE ${line} · SEATS ${seatsUsed}/${cantinaSeats.length} · ${stewardCount} STEWARD${waitingForSeat > 0 ? ` · ${waitingForSeat} WAIT SEAT` : ''}`;
      const color =
        stewardCount <= 0 && (line > 0 || ordering > 0) ? '#ff8066' :
        waitingForSeat > 0 || line >= Math.max(3, cantinaBars.length * 3) ? '#f3bd62' :
        '#63d6a0';
      drawLabel(text, (p.x + anchor.width * 0.5) * TILE_SIZE, p.y * TILE_SIZE - 6, color);
    }
  }

  const leisureModules = state.moduleInstances.filter(
    (module) => (module.type === ModuleType.Couch || module.type === ModuleType.Bench || module.type === ModuleType.GameStation) &&
      state.rooms[module.originTile] === RoomType.Lounge
  );
  const leisureCapacity = leisureModules.reduce(
    (sum, module) => sum + (module.type === ModuleType.Couch || module.type === ModuleType.Bench ? 2 : 1),
    0
  );
  const leisureUsers = state.crewMembers.filter((crew) => crew.leisureSessionActive).length +
    state.visitors.filter((visitor) => visitor.activeService === 'leisure' && visitor.state === VisitorState.Leisure).length +
    state.residents.filter((resident) => resident.state === ResidentState.Leisure && state.rooms[resident.tileIndex] === RoomType.Lounge).length;
  const leisureWaiting = state.crewMembers.filter((crew) => crew.leisure && !crew.leisureSessionActive).length +
    state.visitors.filter((visitor) => visitor.activeService === 'leisure' && visitor.state === VisitorState.ToLeisure).length +
    state.residents.filter(
      (resident) => resident.state === ResidentState.ToLeisure && resident.reservedTargetTile !== null && state.rooms[resident.reservedTargetTile] === RoomType.Lounge
    ).length;
  drawFacilityLoad(RoomType.Lounge, [ModuleType.Couch, ModuleType.Bench, ModuleType.GameStation], 'LOUNGE', leisureCapacity, leisureUsers, leisureWaiting);

  const protectedSystemsShown = new Set<string>();
  for (const crew of state.crewMembers) {
    if (!isCrewHoldingProtectedPost(state, crew) || crew.assignedSystem === null) continue;
    if (Math.min(crew.energy, crew.hunger, crew.hygiene, crew.bladder, crew.thirst) >= 48) continue;
    if (protectedSystemsShown.has(crew.assignedSystem)) continue;
    protectedSystemsShown.add(crew.assignedSystem);
    const roomBySystem: Partial<Record<CrewPrioritySystem, RoomType>> = {
      reactor: RoomType.Reactor,
      'life-support': RoomType.LifeSupport,
      hydroponics: RoomType.Hydroponics,
      kitchen: RoomType.Kitchen,
      cafeteria: RoomType.Cafeteria,
      security: RoomType.Security
    };
    const room = roomBySystem[crew.assignedSystem];
    if (!room) continue;
    const anchorTile = state.rooms.findIndex((candidate) => candidate === room);
    if (anchorTile < 0) continue;
    const p = fromIndex(anchorTile, state.width);
    drawLabel(`${friendlyName(room).toUpperCase()} · MINIMUM STAFF HELD`, (p.x + 0.5) * TILE_SIZE, p.y * TILE_SIZE - 6, '#f3bd62');
  }

  const cargoArm = state.moduleInstances.find((module) => module.type === ModuleType.CargoArm);
  if (cargoArm && state.portOps.cargoArmStatus !== 'ready') {
    const p = fromIndex(cargoArm.originTile, state.width);
    const label = state.portOps.cargoArmStatus === 'fault' ? 'ARM FAULT' : `ARM ${Math.round(state.portOps.cargoArmStrain)}%`;
    drawLabel(label, (p.x + 0.5) * TILE_SIZE, p.y * TILE_SIZE - 6, state.portOps.cargoArmStatus === 'fault' ? '#ff6868' : '#f3bd62');
  }
  const fuelTanks = state.moduleInstances.filter((module) => module.type === ModuleType.FuelTank);
  const activeFuelWork = state.arrivingShips.some(
    (ship) => ship.stage !== 'depart' && ((ship.portManifest?.fuelSupply ?? 0) > 0 || (ship.portManifest?.fuelRequest ?? 0) > 0)
  );
  if (activeFuelWork && fuelTanks.length > 0) {
    const stock = fuelTanks.reduce(
      (sum, tank) => sum + (state.itemNodes.find((node) => node.tileIndex === tank.originTile)?.items.fuel ?? 0),
      0
    );
    const capacity = fuelTanks.reduce(
      (sum, tank) => sum + (state.itemNodes.find((node) => node.tileIndex === tank.originTile)?.capacity ?? 0),
      0
    );
    const p = fromIndex(fuelTanks[0].originTile, state.width);
    drawLabel(
      `FUEL ${Math.floor(stock)}/${capacity}${stock <= 0 ? ' · EMPTY' : ''}`,
      (p.x + 0.5) * TILE_SIZE,
      p.y * TILE_SIZE - 6,
      stock <= 0 ? '#ff6868' : stock < capacity * 0.2 ? '#f3bd62' : '#63d6a0'
    );
  }
  for (const ship of state.arrivingShips) {
    const turn = ship.portTurnaround;
    if (ship.stage === 'depart' || !turn || turn.fuelRequired <= 0) continue;
    const pump = state.moduleInstances.find(
      (module) => module.type === ModuleType.FuelPump && ship.bayTiles.includes(module.originTile)
    );
    if (!pump) continue;
    const pending = state.jobs.filter(
      (job) => job.portShipId === ship.id && job.itemType === 'fuel' && job.state !== 'done' && job.state !== 'expired'
    );
    const blocked = pending.some((job) => !!job.blockedReason || job.stallReason && job.stallReason !== 'none');
    const p = fromIndex(pump.originTile, state.width);
    drawLabel(
      `PUMP ${Math.floor(turn.fuelDelivered)}/${Math.floor(turn.fuelRequired)}${blocked ? ' · BLOCKED' : pending.length > 0 ? ` · ${pending.length} LOADS` : ''}`,
      (p.x + 0.5) * TILE_SIZE,
      p.y * TILE_SIZE - 6,
      blocked ? '#ff6868' : turn.fuelDelivered >= turn.fuelRequired - 0.05 ? '#63d6a0' : '#75b8e8'
    );
  }
  const activeCargoShip = state.arrivingShips.some((ship) => ship.portManifest && ship.stage !== 'depart');
  const storageNodes = state.itemNodes.filter((node) => state.rooms[node.tileIndex] === RoomType.Storage);
  if (activeCargoShip && storageNodes.length > 0) {
    const stock = storageNodes.reduce(
      (sum, node) => sum + Object.values(node.items).reduce((nodeSum, amount) => nodeSum + (amount ?? 0), 0),
      0
    );
    const capacity = storageNodes.reduce((sum, node) => sum + node.capacity, 0);
    const activeLots = state.portOps.cargoLots.filter((lot) => lot.location !== 'closed' && lot.location !== 'delivered');
    const freightHandled = activeLots.reduce((sum, lot) => sum + lot.handledQuantity, 0);
    const freightReserved = activeLots.reduce((sum, lot) => sum + lot.reservedCapacity, 0);
    const blocked = state.jobs.some(
      (job) => job.portShipId !== undefined && job.state !== 'done' && job.state !== 'expired' && !!job.blockedReason
    );
    const p = fromIndex(storageNodes[0].tileIndex, state.width);
    drawLabel(
      `STORAGE ${Math.floor(stock)} STOCK · ${Math.floor(freightHandled)}/${Math.floor(freightReserved)} FREIGHT${blocked ? ' · BLOCKED' : ''}`,
      (p.x + 0.5) * TILE_SIZE,
      p.y * TILE_SIZE - 6,
      blocked ? '#ff6868' : stock + freightReserved >= capacity * 0.85 ? '#f3bd62' : '#75b8e8'
    );
  }
  for (const dock of state.docks) {
    if (dock.purpose !== 'visitor' || dock.occupiedByShipId === null) continue;
    const ship = state.arrivingShips.find((candidate) => candidate.id === dock.occupiedByShipId);
    if (!ship || ship.portManifest || ship.smallCraftVisit || ship.stage === 'depart') continue;
    const guests = state.visitors.filter((visitor) => visitor.originShipId === ship.id).length;
    const p = fromIndex(dock.anchorTile, state.width);
    const label = ship.stage === 'docked' ? `POD · ${guests} GUEST${guests === 1 ? '' : 'S'}` : 'POD · INBOUND';
    drawLabel(label, (p.x + 0.5) * TILE_SIZE, p.y * TILE_SIZE - 6, '#75b8e8');
  }
  ctx.restore();
}

type OpsMetricTone = 'default' | 'ok' | 'warn' | 'danger' | 'muted';
type OpsMetricItem = {
  label: string;
  value: string | number;
  /** Optional second line under the value, for a rate beside a total. */
  note?: string;
  tone?: OpsMetricTone;
};
/** One cause of the cumulative station rating: what it has done, and how fast. */
type RatingCauseItem = {
  label: string;
  total: number;
  perMin: number;
  /** '+' for causes that raise the score, '-' for causes that lower it. */
  sign: '+' | '-';
  tone: OpsMetricTone;
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
    if (item.note !== undefined) {
      const note = document.createElement('small');
      note.className = 'metric-note';
      note.textContent = item.note;
      metric.append(note);
    }
    return metric;
  });
  el.replaceChildren(...nodes);
}

/**
 * Cumulative-first cause pill for the rating modal.
 *
 * The score the player is looking at is cumulative, so the total is the value
 * and the live rate is the pill's second line — the same information the three
 * lists used to carry, without doubling the row count of an already
 * spreadsheet-shaped surface. A cause is shown when it has ever contributed,
 * not only while it is still firing: a penalty that stopped a minute ago is
 * still part of the number on screen, and hiding it is what made the score
 * unexplainable.
 */
function setRatingCauseList(el: HTMLElement, items: RatingCauseItem[]): void {
  const active = items.filter((item) => item.total > 0.05 || item.perMin > 0.005);
  setMetricList(
    el,
    active.length > 0
      ? active.map((item) => ({
          label: item.label,
          value: `${item.sign}${item.total.toFixed(1)}`,
          note: `${item.perMin.toFixed(2)}/m now`,
          tone: item.total > 0.05 ? item.tone : 'muted'
        }))
      : [{ label: 'None', value: '0.0', note: '0.00/m now', tone: 'default' }]
  );
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

function setRatingDriverList(el: HTMLElement, drivers: string[]): void {
  const activeDrivers = drivers.filter((driver) => driver !== 'none');
  if (activeDrivers.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'rating-driver-empty';
    empty.textContent = 'No active pressure';
    el.replaceChildren(empty);
    return;
  }
  el.replaceChildren(
    ...activeDrivers.map((driver) => {
      const row = document.createElement('span');
      row.className = 'rating-driver-note';
      row.textContent = driver;
      return row;
    })
  );
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
  preppedMeal: 'Prepped food',
  meal: 'Meals',
  cleanTray: 'Clean trays',
  dirtyTray: 'Dirty trays',
  drink: 'Drinks',
  rawMaterial: 'Supplies',
  tradeGood: 'Trade goods',
  fuel: 'Fuel',
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
  const pressureLane = state.metrics.workforceHighestPressureLane;
  if (pressureLane && state.metrics.workforceLanes[pressureLane].pending > 0) {
    const lane = state.metrics.workforceLanes[pressureLane];
    return `Jobs: ${workforceLaneLabels[pressureLane]} lane pressure is highest (${lane.pending} pending, ${lane.working}/${lane.target} working).`;
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
  const pressureLane = state.metrics.workforceHighestPressureLane;
  if (pressureLane) {
    const lane = state.metrics.workforceLanes[pressureLane];
    if (lane.blocked > 0) return `Crew: ${workforceLaneLabels[pressureLane]} has ${lane.blocked} blocked or unreachable jobs.`;
    if (lane.idle > 0 && lane.pending > 0) return `Crew: ${workforceLaneLabels[pressureLane]} has idle workers but no reachable lane work.`;
    return `Crew: ${waiting} waiting while ${workforceLaneLabels[pressureLane]} is the highest-pressure lane.`;
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
  if (state.metrics.stationRating <= 0.01) return 'var(--muted)';
  return state.metrics.stationRating > 70 ? 'var(--ok)' : state.metrics.stationRating > 40 ? 'var(--warn)' : 'var(--danger)';
}

function ratingSummaryText(): string {
  const trend = state.metrics.stationRatingTrendPerMin;
  return `${Math.round(state.metrics.stationRating)} (${trend >= 0 ? '+' : ''}${trend.toFixed(1)}/min)`;
}

function refreshRatingModal(): void {
  const rating = Math.round(state.metrics.stationRating);
  const trend = state.metrics.stationRatingTrendPerMin;
  const drivers = state.metrics.stationRatingDrivers.filter((driver) => driver !== 'none');
  ratingModalScoreEl.textContent = String(rating);
  ratingModalScoreEl.style.color = ratingToneColor();
  ratingModalTrendEl.textContent = `${trend >= 0 ? '+' : ''}${trend.toFixed(2)}/min`;
  ratingModalTrendEl.style.color = trend > 0.01 ? 'var(--ok)' : trend < -0.01 ? 'var(--danger)' : 'var(--muted)';
  const foundation = drivers.find((driver) => driver.includes('foundation'));
  const drag = drivers.find((driver) => driver.includes(' -'));
  ratingModalSummaryEl.textContent = rating <= 0
    ? 'Unknown station. Build trust through reliable service and new operational tiers.'
    : foundation
      ? `${foundation} is earned permanently. ${drag ? `Watch ${drag}.` : 'Reliable service keeps building trust.'}`
      : drag
        ? `Cumulative reputation is being held back by ${drag}.`
        : 'Reliable service is building cumulative trust.';
  ratingModalEffectEl.textContent =
    `Traffic pull: premium +${Math.round(state.metrics.reputationPremiumDemandBonusPct)}% · ` +
    `higher-risk +${Math.round(state.metrics.reputationRiskyDemandBonusPct)}%`;
  // Cumulative rating points earned and lost by cause, with the live rate as
  // each pill's second line. The score above is a running total, so the totals
  // are what actually explain it; the rates say which way it is still moving.
  const bonusTotal = state.metrics.stationRatingBonusTotal;
  const bonusRate = state.metrics.stationRatingBonusPerMin;
  setRatingCauseList(ratingModalBonusesEl, [
    { label: 'Meals', total: bonusTotal.mealService, perMin: bonusRate.mealService, sign: '+', tone: 'ok' },
    { label: 'Leisure', total: bonusTotal.leisureService, perMin: bonusRate.leisureService, sign: '+', tone: 'ok' },
    { label: 'Exits', total: bonusTotal.successfulExit, perMin: bonusRate.successfulExit, sign: '+', tone: 'ok' },
    { label: 'Residents', total: bonusTotal.residentRetention, perMin: bonusRate.residentRetention, sign: '+', tone: 'ok' },
  ]);
  const penaltyTotal = state.metrics.stationRatingPenaltyTotal;
  const penaltyRate = state.metrics.stationRatingPenaltyPerMin;
  setRatingCauseList(ratingModalPenaltiesEl, [
    { label: 'Queue timeouts', total: penaltyTotal.queueTimeout, perMin: penaltyRate.queueTimeout, sign: '-', tone: 'danger' },
    { label: 'No eligible dock', total: penaltyTotal.noEligibleDock, perMin: penaltyRate.noEligibleDock, sign: '-', tone: 'warn' },
    { label: 'Service failures', total: penaltyTotal.serviceFailure, perMin: penaltyRate.serviceFailure, sign: '-', tone: 'warn' },
    { label: 'Long routes', total: penaltyTotal.longWalks, perMin: penaltyRate.longWalks, sign: '-', tone: 'warn' },
    { label: 'Bad routes', total: penaltyTotal.routeExposure, perMin: penaltyRate.routeExposure, sign: '-', tone: 'warn' },
    { label: 'Environment', total: penaltyTotal.environment, perMin: penaltyRate.environment, sign: '-', tone: 'warn' },
    { label: 'Sanitation', total: state.metrics.sanitationPenaltyTotal, perMin: state.metrics.sanitationPenaltyPerMin, sign: '-', tone: 'warn' },
  ]);
  const failureTotal = state.metrics.stationRatingServiceFailureByReasonTotal;
  const failureRate = state.metrics.stationRatingServiceFailureByReasonPerMin;
  setRatingCauseList(ratingModalFailuresEl, [
    { label: 'No leisure path', total: failureTotal.noLeisurePath, perMin: failureRate.noLeisurePath, sign: '-', tone: 'warn' },
    { label: 'Missing ship services', total: failureTotal.shipServicesMissing, perMin: failureRate.shipServicesMissing, sign: '-', tone: 'warn' },
    { label: 'Patience bail', total: failureTotal.patienceBail, perMin: failureRate.patienceBail, sign: '-', tone: 'warn' },
    { label: 'Dock timeout', total: failureTotal.dockTimeout, perMin: failureRate.dockTimeout, sign: '-', tone: 'danger' },
    { label: 'Trespass', total: failureTotal.trespass, perMin: failureRate.trespass, sign: '-', tone: 'danger' },
  ]);
  setRatingDriverList(ratingModalDriversEl, drivers);
}

function maintenanceStatusText(): string {
  return `Maintenance: tracking ${state.maintenanceDebts.length} targets | max ${state.metrics.maintenanceDebtMax.toFixed(0)}% | avg ${state.metrics.maintenanceDebtAvg.toFixed(0)}% | open ${state.metrics.maintenanceJobsOpen}`;
}

function maintenanceStatusToneColor(): string {
  if (state.metrics.maintenanceDebtMax >= 60) return 'var(--danger)';
  if (state.metrics.maintenanceJobsOpen > 0 || state.metrics.maintenanceDebtMax >= 20) return 'var(--warn)';
  if (state.maintenanceDebts.length > 0) return 'var(--ok)';
  return '#8ea2bd';
}

function thermalStatusText(): string {
  return `Thermal: avg ${state.metrics.thermalAvg.toFixed(0)}% | max ${state.metrics.thermalMax.toFixed(0)}% | hot ${state.metrics.hotTiles} | stale ${state.metrics.staleAirTiles}`;
}

function thermalStatusToneColor(): string {
  if (state.metrics.thermalMax >= 86) return 'var(--danger)';
  if (state.metrics.hotTiles > 0 || state.metrics.staleAirTiles > 0 || state.metrics.thermalMax >= 62) return 'var(--warn)';
  if (state.metrics.thermalAvg > 0) return 'var(--ok)';
  return '#8ea2bd';
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
  // "Why blocked" surface: the conversion pipeline only reports a blocked
  // reason once a visitor actually exits and an attempt runs. If housing is
  // misconfigured (or no visitor has departed yet), it would otherwise stall
  // on a vague "waiting for eligible visitor exit" with no hint. Show the
  // first unmet prerequisite proactively; the reactive result takes over once
  // real attempts start producing outcomes.
  const readiness = getResidentHousingReadiness(state);
  const status = !readiness.ready
    ? `blocked: ${readiness.reason}`
    : state.metrics.residentConversionAttempts > 0
      ? result
      : readiness.reason;
  if (compact) {
    return `${state.metrics.residentsCount} | ${state.metrics.residentConversionSuccesses}/${state.metrics.residentConversionAttempts} | ${status}`;
  }
  if (!readiness.ready) {
    return `Residents blocked: ${readiness.reason} | ${setup}`;
  }
  const lead =
    state.metrics.residentConversionAttempts > 0
      ? `Residents ${state.metrics.residentsCount} | convert ${state.metrics.residentConversionSuccesses}/${state.metrics.residentConversionAttempts} | ${result}`
      : `Residents ${state.metrics.residentsCount} | ${readiness.reason}`;
  return `${lead}${chance}${ship} | ${setup}`;
}

function crewOpsSummaryText(compact = false): string {
  const blocked = state.metrics.crewBlockedNoPath > 0 ? ` | Blocked ${state.metrics.crewBlockedNoPath}` : '';
  const fixtureWait = state.metrics.idleCrewByReason.idle_waiting_fixture > 0
    ? ` | Fixture wait ${state.metrics.idleCrewByReason.idle_waiting_fixture}`
    : '';
  // "Working" must include crew on logistics/hauling jobs — they are working,
  // just not standing on a staffed post. Omitting them made the headline read
  // "Working 0" while a dozen crew visibly hauled (they were bucketed as
  // crewOnLogisticsJobs). Show the haul count so Working+Logistics+Idle+Resting
  // reconciles with the roster.
  return compact
    ? `Working ${state.metrics.crewAssignedWorking} | Logistics ${state.metrics.crewOnLogisticsJobs} | Idle ${state.metrics.crewIdleAvailable} | Resting ${state.metrics.crewResting}${fixtureWait}${blocked}`
    : `Working ${state.metrics.crewAssignedWorking} | Idle ${state.metrics.crewIdleAvailable} | Logistics ${state.metrics.crewOnLogisticsJobs} | Resting ${state.metrics.crewResting}${fixtureWait}${blocked}`;
}

function trafficOpsSummaryText(): string {
  const m = state.metrics;
  const fails = m.visitFailuresThisCycle > 0 ? ` ${m.visitFailuresThisCycle} lost` : '';
  const stall = m.visitorExitStalled ? ' | departures backing up' : '';
  // No "Docked n". Every docked ship already draws its own world chip on the
  // berth or Pod Dock it occupies, carrying callsign, phase, passengers,
  // countdown, and completion. The count restated less, further away.
  return (
    `Visitors ${m.visitorsCount} | Exits ${m.exitsPerMin}/min | ` +
    `Cycle: ${m.visitsThisCycle} done${fails} | rev $${Math.round(m.visitRevenueThisCycle)}${stall}`
  );
}

function coreOpsSummaryText(): string {
  return `Caf ${state.ops.cafeteriasActive}/${state.ops.cafeteriasTotal} | ` +
    `Food K${state.ops.kitchenActive}/${state.ops.kitchenTotal} H${state.ops.hydroponicsActive}/${state.ops.hydroponicsTotal} | ` +
    `LS ${state.ops.lifeSupportActive}/${state.ops.lifeSupportTotal} | R ${state.ops.reactorsActive}/${state.ops.reactorsTotal}`;
}

function jobsSummaryText(): string {
  const active = state.metrics.pendingJobs + state.metrics.assignedJobs;
  const stalled = state.metrics.stalledJobs > 0 ? ` | ${state.metrics.stalledJobs} stalled` : '';
  const clean = state.metrics.sanitationJobsOpen > 0 ? ` | ${state.metrics.sanitationJobsOpen} cleaning` : '';
  if (active <= 0 && state.metrics.sanitationJobsOpen <= 0) return 'No queued work';
  return `${active} active | ${state.metrics.topBacklogType}${clean}${stalled}`;
}

function criticalStaffingText(): string {
  const crew = getCrewSustainabilitySummary(state);
  const needs = [
    crew.tiredCrew > 0 ? `${crew.tiredCrew} tired` : '',
    crew.hungryCrew > 0 ? `${crew.hungryCrew} hungry` : '',
    crew.thirstyCrew > 0 ? `${crew.thirstyCrew} need drinks` : '',
    crew.restroomNeedsCrew > 0 ? `${crew.restroomNeedsCrew} need toilets` : '',
    crew.hygieneNeedsCrew > 0 ? `${crew.hygieneNeedsCrew} need washing` : ''
  ].filter(Boolean);
  if (crew.criticalNeedsCrew > 0 || crew.strainedCrew > 0 || crew.sleepSlots < state.crewMembers.length) {
    const needsText = needs.length > 0 ? needs.join(' · ') : 'needs stable';
    return `Crew needs · ${needsText}${crew.criticalNeedsCrew > 0 ? ` · ${crew.criticalNeedsCrew} critical` : ''} · sleep ${crew.sleepSlots}/${state.crewMembers.length}`;
  }
  return `Crew ready · ${crew.averageMoveSpeedPct}% move speed · sleep ${crew.sleepSlots}/${state.crewMembers.length}`;
}

function idleReasonsText(): string {
  return `Idle reasons: available ${state.metrics.idleCrewByReason.idle_available} | no jobs ${state.metrics.idleCrewByReason.idle_no_jobs} | ` +
    `resting ${state.metrics.idleCrewByReason.idle_resting} | no path ${state.metrics.idleCrewByReason.idle_no_path} | ` +
    `fixture wait ${state.metrics.idleCrewByReason.idle_waiting_fixture} | waiting ${state.metrics.idleCrewByReason.idle_waiting_reassign}`;
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
  const pressureLane = state.metrics.workforceHighestPressureLane;
  const laneText = pressureLane ? `${workforceLaneLabels[pressureLane]} ${(state.metrics.workforceLanes[pressureLane].pressure * 100).toFixed(0)}%` : 'none';
  return `Crew retargets/min: ${state.metrics.crewRetargetsPerMin.toFixed(1)} | ` +
    `critical drops/min: ${state.metrics.criticalStaffDropsPerMin.toFixed(1)} | ` +
    `assigned ${state.metrics.logisticsDispatchSlots} | lane pressure ${laneText} | borrowed ${state.metrics.workforceBorrowedCrew}`;
}

function opsExtraText(): string {
  return `Kitchen ${state.ops.kitchenActive}/${state.ops.kitchenTotal} | Workshop ${state.ops.workshopActive}/${state.ops.workshopTotal} | ` +
    `Bathrooms ${state.ops.hygieneActive}/${state.ops.hygieneTotal} | Hydroponics ${state.ops.hydroponicsActive}/${state.ops.hydroponicsTotal} | ` +
    `Life Support ${state.ops.lifeSupportActive}/${state.ops.lifeSupportTotal} | Lounge ${state.ops.loungeActive}/${state.ops.loungeTotal} | ` +
    `Market ${state.ops.marketActive}/${state.ops.marketTotal} | Cantina ${state.ops.cantinaActive}/${state.ops.cantinaTotal} | ` +
    `Obs ${state.ops.observatoryActive}/${state.ops.observatoryTotal} | Clinic ${state.ops.clinicActive}/${state.ops.clinicTotal} | ` +
    `Brig ${state.ops.brigActive}/${state.ops.brigTotal} | RecHall ${state.ops.recHallActive}/${state.ops.recHallTotal} | ` +
    `Rep P${state.metrics.reputationPrestigeAvg.toFixed(0)} N${state.metrics.reputationNotorietyAvg.toFixed(0)} Risk${state.metrics.reputationCrimePressureAvg.toFixed(0)} | top ${state.metrics.reputationTopZone}`;
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
    `clean ${state.metrics.sanitationJobsCompletedPerMin.toFixed(1)} | ` +
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
    { label: 'Fixture Wait', value: state.metrics.idleCrewByReason.idle_waiting_fixture, tone: state.metrics.idleCrewByReason.idle_waiting_fixture > 0 ? 'warn' : 'default' },
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
  setMetricList(
    opsModalWorkforceEl,
    workforceLaneOrder.map((lane) => {
      const metrics = state.metrics.workforceLanes[lane];
      const tone =
        metrics.blocked > 0 ? 'danger' as const :
        metrics.pending > metrics.working + metrics.idle ? 'warn' as const :
        'default' as const;
      return {
        label: lane === 'construction-eva' ? 'Build/EVA' : workforceLaneLabels[lane],
        value: `T${metrics.target} A${metrics.assigned} W${metrics.working} I${metrics.idle} P${metrics.pending} B${metrics.blocked} R${metrics.borrowed}`,
        tone
      };
    })
  );
  setMetricList(opsModalStaffingEl, [
    { label: 'Reactor', value: `${state.ops.reactorsActive}/${state.ops.reactorsTotal}` },
    { label: 'Life Support', value: `${state.ops.lifeSupportActive}/${state.ops.lifeSupportTotal}` },
    { label: 'Hydro', value: `${state.ops.hydroponicsActive}/${state.ops.hydroponicsTotal}` },
    { label: 'Kitchen', value: `${state.ops.kitchenActive}/${state.ops.kitchenTotal}` },
    { label: 'Cafeteria', value: `${state.ops.cafeteriasActive}/${state.ops.cafeteriasTotal}` },
  ]);
  setMetricList(opsModalDutyTransitEl, [
    { label: 'Assigned Now', value: state.metrics.logisticsDispatchSlots },
    { label: 'Pressure', value: state.metrics.workforceHighestPressureLane ? workforceLaneLabels[state.metrics.workforceHighestPressureLane] : 'none' },
    { label: 'On Jobs', value: state.metrics.crewOnLogisticsJobs },
    { label: 'Pending', value: state.metrics.pendingJobs },
    { label: 'Borrowed', value: state.metrics.workforceBorrowedCrew },
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
    { label: 'Sanitize jobs', value: statusBreakdownText(state.metrics.jobCountsByType.sanitize, 'pending'), tone: state.metrics.jobCountsByType.sanitize.pending > 0 ? 'warn' : 'default' },
    { label: 'Repair jobs', value: statusBreakdownText(state.metrics.jobCountsByType.repair, 'pending'), tone: state.metrics.jobCountsByType.repair.pending > 0 ? 'warn' : 'default' },
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
    { label: 'Sanitize jobs', value: statusBreakdownText(state.metrics.jobCountsByType.sanitize, 'expired'), tone: state.metrics.jobCountsByType.sanitize.expired > 0 ? 'warn' : 'default' },
    { label: 'Repair jobs', value: statusBreakdownText(state.metrics.jobCountsByType.repair, 'expired'), tone: state.metrics.jobCountsByType.repair.expired > 0 ? 'warn' : 'default' },
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
    { label: 'Assigned', value: state.metrics.logisticsDispatchSlots },
    { label: 'Lane', value: state.metrics.workforceHighestPressureLane ? workforceLaneLabels[state.metrics.workforceHighestPressureLane] : 'none' },
    { label: 'Res Fail', value: state.metrics.reservationFailures, tone: state.metrics.reservationFailures > 0 ? 'warn' : 'default' },
  ]);
  opsModalJobWhyEl.textContent = jobWhyText();
  setMetricList(opsModalRoomHealthEl, [
    { label: 'Warnings', value: state.metrics.roomWarningsCount, tone: state.metrics.roomWarningsCount > 0 ? 'warn' : 'default' },
    { label: 'Service Nodes', value: state.metrics.serviceNodesTotal },
    { label: 'Unreachable', value: state.metrics.serviceNodesUnreachable, tone: state.metrics.serviceNodesUnreachable > 0 ? 'warn' : 'default' },
    { label: 'Pressure', value: `${state.metrics.pressurizationPct.toFixed(0)}%`, tone: state.metrics.pressurizationPct < 95 ? 'warn' : 'default' },
    { label: 'Leaks', value: state.metrics.leakingTiles, tone: state.metrics.leakingTiles > 0 ? 'danger' : 'default' },
    { label: 'Dirty Tiles', value: `${state.metrics.dirtyTiles}/${state.metrics.filthyTiles}`, tone: state.metrics.filthyTiles > 0 ? 'danger' : state.metrics.dirtyTiles > 0 ? 'warn' : 'default' },
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
    { label: 'Thermal', value: `max ${state.metrics.thermalMax.toFixed(0)}% / stale ${state.metrics.staleAirTiles}`, tone: state.metrics.hotTiles + state.metrics.staleAirTiles > 0 ? 'warn' : 'default' },
    { label: 'Mechanical Dept', value: departmentStatusText('mechanical'), tone: departmentTone('mechanical') },
    { label: 'Sanitation', value: `${state.metrics.sanitationAvg.toFixed(1)}% avg / ${state.metrics.sanitationMax.toFixed(0)}% max / ${state.metrics.sanitationJobsOpen} open`, tone: state.metrics.sanitationJobsOpen > 0 ? 'warn' : 'default' },
    { label: 'Sanitation Dept', value: departmentStatusText('sanitation'), tone: departmentTone('sanitation') },
    { label: 'Drift Jobs', value: `clean ${state.metrics.sanitationJobsOpen} / repair ${state.metrics.maintenanceJobsOpen}`, tone: state.metrics.sanitationJobsOpen + state.metrics.maintenanceJobsOpen > 0 ? 'warn' : 'default' },
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
    { label: 'Clean/m', value: state.metrics.sanitationJobsCompletedPerMin.toFixed(1), tone: state.metrics.sanitationJobsOpen > 0 ? 'warn' : 'default' },
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
    { label: 'Sanitation', value: `${state.metrics.sanitationPenaltyPerMin.toFixed(1)}/m`, tone: state.metrics.sanitationPenaltyPerMin > 0 ? 'warn' : 'default' },
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

let lastPortAlertRenderKey = '';
let strandedReliefFeedback: { text: string; tone: 'danger' | 'warn'; expiresAt: number } | null = null;

type StrandedAlert = {
  tone: 'danger' | 'warn';
  text: string;
  visitorId: number;
  tile: number;
  eligible: boolean;
  cost: number;
};

function strandedAlert(): StrandedAlert | null {
  const visitors = state.visitors
    .filter((visitor) => visitor.strandedFromShipId !== null && visitor.strandedFromShipId !== undefined)
    .sort((a, b) => (a.strandedAt ?? Number.POSITIVE_INFINITY) - (b.strandedAt ?? Number.POSITIVE_INFINITY) || a.id - b.id);
  const target = visitors[0];
  if (!target) return null;
  const quote = getStrandedReliefQuote(state, target.id);
  if (!quote) return null;
  const stageRank = { none: 0, unmet: 1, balking: 2, distressed: 3, disruptive: 4 } as const;
  const worst = visitors.reduce((current, visitor) =>
    stageRank[visitor.serviceFailureStage ?? 'none'] > stageRank[current.serviceFailureStage ?? 'none'] ? visitor : current
  );
  const worstStage = (worst.serviceFailureStage ?? 'none') === 'none' ? 'unmet' : worst.serviceFailureStage ?? 'unmet';
  const relief = quote.eligible ? `arrange relief ${quote.cost}c` : `relief in ${Math.ceil(quote.secondsUntilEligible)}s`;
  return {
    tone: worstStage === 'disruptive' || worstStage === 'distressed' ? 'danger' : 'warn',
    text: `${visitors.length} stranded passenger${visitors.length === 1 ? '' : 's'} | worst: ${worstStage} | ${relief}`,
    visitorId: target.id,
    tile: target.tileIndex,
    eligible: quote.eligible,
    cost: quote.cost
  };
}

function strandedAlertHtml(alert: StrandedAlert): string {
  const action = alert.eligible ? 'data-stranded-relief' : 'data-stranded-focus';
  const title = alert.eligible
    ? `Arrange relief transfer for stranded visitor #${alert.visitorId} for ${alert.cost} credits`
    : `Focus stranded visitor #${alert.visitorId}`;
  return `<button class="alert-item ${alert.tone} alert-action" ${action}="${alert.visitorId}" data-stranded-tile="${alert.tile}" title="${title}" aria-label="${title}">${escapeHtml(alert.text)}</button>`;
}

function cafeteriaStaffingSnapshot(): {
  active: number;
  rostered: number;
  assigned: number;
  selfCare: number;
  diagnosis: string;
} {
  const eligible = state.crewMembers.filter(
    (crew) =>
      (crew.staffRole === 'cook' || crew.staffRole === 'steward') &&
      getCrewWatchStatus(state, crew) !== 'off-duty'
  );
  const active = eligible.filter(
    (crew) => !crew.resting && crew.assignedSystem === 'cafeteria' && state.rooms[crew.tileIndex] === RoomType.Cafeteria
  ).length;
  const assigned = eligible.filter((crew) => !crew.resting && crew.assignedSystem === 'cafeteria').length;
  const selfCare = eligible.filter(
    (crew) => crew.resting || crew.cleaning || crew.toileting || crew.drinking || crew.eating || crew.leisure
  ).length;
  const diagnosis = active > 0
    ? `${active} at counter`
    : eligible.length === 0
      ? 'no Cook or Steward on this watch'
      : selfCare > 0
        ? `${selfCare} rostered ${selfCare === 1 ? 'worker is' : 'workers are'} meeting personal needs`
        : assigned > 0
          ? `${assigned} ${assigned === 1 ? 'worker is' : 'workers are'} walking to the counter`
          : `${eligible.length} rostered ${eligible.length === 1 ? 'worker is' : 'workers are'} not posted`;
  return { active, rostered: eligible.length, assigned, selfCare, diagnosis };
}

// Contextual UI: a station with nothing wrong has nothing to say here, so the
// Alerts card leaves the dock entirely instead of holding a column open for
// "No active alerts". The list elements keep their own is-clear/is-empty state,
// so this reads the same truth the panels just rendered.
function refreshAlertsCardVisibility(): void {
  const hasAlerts = !alertListEl.classList.contains('is-clear');
  const hasIncidents = !incidentListEl.classList.contains('is-empty');
  const showCard = hasAlerts || hasIncidents;
  diagnosticsCardEl.classList.toggle('hidden', !showCard);
  // The dock is a fixed-column grid; without this it keeps an empty cell where
  // the card used to be. Mirrors the pod-only reflow in refreshSettlementSummary.
  bottomDockEl.classList.toggle('alerts-clear', !showCard);
}

function refreshAlertPanel(): void {
  renderAlertPanel();
  refreshAlertsCardVisibility();
}

function renderAlertPanel(): void {
  if (strandedReliefFeedback && state.now >= strandedReliefFeedback.expiresAt) strandedReliefFeedback = null;
  const stranded = strandedAlert();
  if (state.controls.manualTrafficAdmission) {
    // `diagnosis` is what the alert says once you click it: what is wrong,
    // why, and what the player can change (opening ticket 02). Alerts that
    // focus a person rather than a room rely on it, because a crew tile has
    // no room inspector to fall back to.
    const portAlerts: Array<{
      tone: 'danger' | 'warn';
      text: string;
      tile: number | null;
      incidentId?: number;
      diagnosis?: string;
      stranded?: StrandedAlert;
    }> = [];
    if (strandedReliefFeedback) portAlerts.push({ tone: strandedReliefFeedback.tone, text: strandedReliefFeedback.text, tile: null });
    if (stranded) portAlerts.push({ ...stranded, stranded });
    const crewSustainability = getCrewSustainabilitySummary(state);
    if (crewSustainability.resignationNotices > 0) {
      portAlerts.push({
        tone: 'danger',
        text: `${crewSustainability.resignationNotices} crew resignation notice${crewSustainability.resignationNotices === 1 ? '' : 's'} · restore pay and needs within 60s`,
        tile: state.crewMembers.find((crew) => crew.resignationNoticeAt !== null)?.tileIndex ?? null
      });
    } else if (crewSustainability.unpaidCrew > 0) {
      portAlerts.push({
        tone: 'danger',
        text: `${crewSustainability.unpaidCrew} crew unpaid · next payroll ${Math.ceil(crewSustainability.payrollPerCycle)}c`,
        tile: state.crewMembers.find((crew) => crew.missedPayrollCycles > 0)?.tileIndex ?? null
      });
    } else if (crewSustainability.criticalNeedsCrew > 0) {
      const pressure = [
        crewSustainability.tiredCrew > 0 ? `${crewSustainability.tiredCrew} tired` : '',
        crewSustainability.hungryCrew > 0 ? `${crewSustainability.hungryCrew} hungry` : '',
        crewSustainability.thirstyCrew > 0 ? `${crewSustainability.thirstyCrew} need drinks` : '',
        crewSustainability.restroomNeedsCrew > 0 ? `${crewSustainability.restroomNeedsCrew} need toilets` : '',
        crewSustainability.hygieneNeedsCrew > 0 ? `${crewSustainability.hygieneNeedsCrew} need washing` : ''
      ].filter(Boolean).join(' · ');
      const mostStrainedCrew = state.crewMembers.reduce((worst, crew) =>
        Math.min(crew.energy, crew.hunger, crew.hygiene, crew.bladder, crew.thirst) < Math.min(worst.energy, worst.hunger, worst.hygiene, worst.bladder, worst.thirst)
          ? crew
          : worst
      );
      portAlerts.push({
        tone: 'danger',
        text: `Crew needs critical: ${crewSustainability.criticalNeedsCrew} in crisis · ${pressure}`,
        tile: mostStrainedCrew.tileIndex
      });
    } else if (crewSustainability.sleepSlots < state.crew.total) {
      portAlerts.push({
        tone: 'warn',
        text: `Crew quarters short: ${crewSustainability.sleepSlots}/${state.crew.total} sleep slots · add bunks or beds`,
        tile: state.moduleInstances.find((module) => module.type === ModuleType.Bed || module.type === ModuleType.Bunk)?.originTile ?? null
      });
    } else if (
      crewSustainability.strainedCrew >= Math.max(6, Math.ceil(state.crew.total * 0.6)) ||
      state.metrics.idleCrewByReason.idle_waiting_fixture >= Math.max(4, Math.ceil(state.crew.total * 0.2))
    ) {
      const fixtureWait = state.metrics.idleCrewByReason.idle_waiting_fixture;
      // Focus the facility the player can act on, not a wandering crew member.
      // Selecting a crew tile used to set the room selection to a roomless
      // tile, which reported "Selected room is no longer available".
      const hygieneTile = state.rooms.findIndex((room) => room === RoomType.Hygiene);
      const quartersTile = state.rooms.findIndex((room) => room === RoomType.Dorm);
      const focusTile = fixtureWait > 0 && hygieneTile >= 0
        ? hygieneTile
        : quartersTile >= 0
          ? quartersTile
          : hygieneTile >= 0
            ? hygieneTile
            : null;
      const sleepSlots = crewSustainability.sleepSlots;
      portAlerts.push({
        tone: 'warn',
        text: `Crew needs building: ${crewSustainability.strainedCrew} strained · ${crewSustainability.occupiedSleepSlots} sleeping${fixtureWait > 0 ? ` · ${fixtureWait} waiting for fixtures` : ''}`,
        tile: focusTile,
        diagnosis:
          `${crewSustainability.strainedCrew} of ${state.crew.total} crew are running low on a need. ` +
          `Sleep slots ${sleepSlots}/${state.crew.total}` +
          (fixtureWait > 0 ? `, ${fixtureWait} waiting on a hygiene fixture` : '') +
          `. Add toilets, showers or bunks in the highlighted room, or expand it first if the ghost says the footprint is blocked.`
      });
    }
    // A walled-off wing is a silent killer: crew simply never arrive, and
    // every downstream need reads as a mysterious shortage. Name it directly.
    for (const facility of getCrewFacilityReachability(state)) {
      if (!facility.blocked && !facility.missing) continue;
      const focus = facility.facility === 'quarters'
        ? state.rooms.findIndex((room) => room === RoomType.Dorm)
        : facility.facility === 'hygiene'
          ? state.rooms.findIndex((room) => room === RoomType.Hygiene)
          : state.moduleInstances.find((module) => module.type === ModuleType.ServingStation)?.originTile ?? -1;
      portAlerts.push({
        tone: 'danger',
        text: facility.missing
          ? `No ${facility.label} on the station`
          : `${facility.crewTotal - facility.crewWithAccess} crew cannot reach ${facility.label}`,
        tile: focus >= 0 ? focus : null,
        diagnosis: facility.missing
          ? `The station has no ${facility.label}. Crew needs that depend on them can never be met — build one.`
          : `${facility.crewTotal - facility.crewWithAccess} of ${facility.crewTotal} crew are on a part of the station with no walkable route to any ${facility.label}. ` +
            `Check for a missing door or a room wall that closed the only corridor, then add a door to reconnect the two halves.`
      });
    }
    const cargoArmTile = state.moduleInstances.find((module) => module.type === ModuleType.CargoArm)?.originTile ?? null;
    if (state.portOps.cargoArmStatus === 'fault') {
      const hasSpareArm = state.moduleInstances.filter((module) => module.type === ModuleType.CargoArm).length >= 2;
      portAlerts.push({
        tone: 'danger',
        text: hasSpareArm
          ? `Primary cargo arm fault: spare handling at 55% · ${state.portOps.cargoArmRepairProgress.toFixed(1)}/8s repaired`
          : `Cargo arm stopped: assign Maintenance · ${state.portOps.cargoArmRepairProgress.toFixed(1)}/8s repaired`,
        tile: cargoArmTile
      });
    } else if (state.portOps.cargoArmStatus === 'warning') {
      portAlerts.push({
        tone: 'warn',
        text: `Cargo arm strained: ${Math.round(state.portOps.cargoArmStrain)}% · idle it before the next heavy load`,
        tile: cargoArmTile
      });
    }
    for (const ship of state.arrivingShips) {
      const contract = ship.portContractId == null
        ? null
        : state.portOps.contracts.find((entry) => entry.id === ship.portContractId) ?? null;
      if (!contract || contract.status === 'departed' || contract.status === 'settled') continue;
      const seconds = Math.max(0, Math.ceil(contract.hardDepartureAt - state.now));
      const incomplete = contract.promises.filter((promise) => promise.completed + 0.01 < promise.target);
      if (seconds <= 24 && incomplete.length > 0) {
        const lead = incomplete[0];
        portAlerts.push({
          tone: seconds <= 12 ? 'danger' : 'warn',
          text: `${contract.callsign} at risk: ${lead.label} ${Math.floor(lead.completed)}/${Math.floor(lead.target)} · ${seconds}s left`,
          tile: ship.bayTiles[0] ?? null
        });
      }
    }
    const blockedCargoJob = state.jobs.find(
      (job) => job.portShipId !== undefined && job.state !== 'done' && job.state !== 'expired' && !!job.blockedReason
    );
    if (blockedCargoJob) {
      const blockedContract = blockedCargoJob.portShipId === undefined
        ? null
        : state.portOps.contracts.find((contract) => contract.shipId === blockedCargoJob.portShipId) ?? null;
      const seconds = blockedContract ? Math.max(0, Math.ceil(blockedContract.hardDepartureAt - state.now)) : null;
      portAlerts.push({
        tone: 'warn',
        text: `Freight blocked: ${blockedCargoJob.blockedReason}${seconds === null ? '' : ` · ${seconds}s left`}`,
        tile: blockedCargoJob.toTile
      });
    }
    const servingTile = state.moduleInstances.find((module) => module.type === ModuleType.ServingStation)?.originTile ?? null;
    const stockedPickupSlots = state.moduleInstances.filter(
      (module) => module.type === ModuleType.ServingStation
    ).length * 2;
    // Opening ticket 10: the alert used to quote station-wide cooked meals
    // while the header quoted servings ready to take, so the two contradicted
    // each other. Both now read the same located-node total, and a meal with
    // no clean tray is called out as the tray problem it is.
    const mealInventory = preparedMealServiceSnapshot();
    const trayShortfall = mealInventory.counterMeals - mealInventory.readyServings;
    const trayNote = trayShortfall > 0 ? ` · ${trayShortfall} meal${trayShortfall === 1 ? '' : 's'} waiting on clean trays` : '';
    if (mealInventory.readyServings < 8) {
      portAlerts.push({
        tone: 'danger',
        text: `Meal buffer empty: ${mealInventory.readyServings} servings ready${trayNote} · import meals or put a Cook on food production`,
        tile: servingTile
      });
    } else if (mealInventory.readyServings < 20) {
      portAlerts.push({
        tone: 'warn',
        text: `Meals running low: ${mealInventory.readyServings} servings ready${trayNote} · restock before the next passenger ship`,
        tile: servingTile
      });
    }
    if (state.metrics.cafeteriaQueueingCount >= 3) {
      const nextPassengerDeadline = state.portOps.contracts
        .filter((contract) => contract.status === 'active' || contract.status === 'boarding')
        .filter((contract) => contract.promises.some((promise) => promise.kind === 'passengers-served'))
        .map((contract) => Math.max(0, Math.ceil(contract.hardDepartureAt - state.now)))
        .sort((a, b) => a - b)[0];
      portAlerts.push({
        tone: state.metrics.cafeteriaQueueingCount >= 7 ? 'danger' : 'warn',
        text: `Food line: ${state.metrics.cafeteriaQueueingCount} waiting · ${stockedPickupSlots} physical pickup slots${nextPassengerDeadline === undefined ? '' : ` · ${nextPassengerDeadline}s left`}`,
        tile: servingTile
      });
    }
    if (state.metrics.filthyTiles > 0 || state.metrics.dirtyTiles > 10) {
      let dirtiestTile: number | null = null;
      let maxDirt = 0;
      for (let tile = 0; tile < state.dirtByTile.length; tile++) {
        const dirt = state.dirtByTile[tile] ?? 0;
        if (dirt <= maxDirt) continue;
        maxDirt = dirt;
        dirtiestTile = tile;
      }
      portAlerts.push({
        tone: state.metrics.filthyTiles > 0 ? 'danger' : 'warn',
        text: `${state.metrics.filthyTiles > 0 ? 'Filthy concourse' : 'Cleaning backlog'}: ${state.metrics.filthyTiles || state.metrics.dirtyTiles} tiles · assign Cleaning`,
        tile: dirtiestTile
      });
    }
    if (state.metrics.airQuality < 35 || state.metrics.pressurizationPct < 75) {
      portAlerts.push({
        tone: 'danger',
        text: `Air emergency: ${Math.round(state.metrics.airQuality)}% quality · inspect walls, doors, and life support`,
        tile: state.core?.serviceTile ?? null
      });
    }
    const firstIncident = activeIncidentsForUi()[0];
    if (firstIncident) {
      const responseStatus = firstIncident.assignedCrewId !== null
        ? 'Security responding'
        : state.unlocks.tier < 3
          ? 'Security unavailable until Tier 3'
          : 'No responder available';
      portAlerts.push({
        tone: 'danger',
        text: `${firstIncident.type === 'theft' ? 'Theft' : firstIncident.type} in progress · ${responseStatus}`,
        tile: null,
        incidentId: firstIncident.id
      });
    }
    const crowdFeed = state.derived.queueTheater?.eventFeed ?? [];
    for (const entry of crowdFeed.slice(-2).reverse()) {
      if (state.now - entry.at > 45) continue;
      portAlerts.push({
        tone: entry.tone === 'danger' ? 'danger' : 'warn',
        text: entry.text,
        tile: null
      });
    }
    const portAlertRenderKey = JSON.stringify(portAlerts);
    if (portAlertRenderKey === lastPortAlertRenderKey) return;
    lastPortAlertRenderKey = portAlertRenderKey;
    if (portAlerts.length === 0) {
      alertListEl.textContent = 'No active alerts';
      alertListEl.classList.add('is-clear');
      return;
    }
    alertListEl.classList.remove('is-clear');
    alertListEl.innerHTML = portAlerts.slice(0, 5).map((alert) =>
      alert.stranded
        ? strandedAlertHtml(alert.stranded)
        : alert.incidentId !== undefined
        ? `<button class="alert-item ${alert.tone}" data-incident-select="${alert.incidentId}">${escapeHtml(alert.text)}</button>`
        : alert.tile === null
          ? `<div class="alert-item ${alert.tone}">${escapeHtml(alert.text)}</div>`
          : `<button class="alert-item ${alert.tone}" data-port-focus="${alert.tile}"${
              alert.diagnosis ? ` data-port-diagnosis="${escapeHtml(alert.diagnosis)}"` : ''
            } title="${escapeHtml(alert.diagnosis ?? alert.text)}" aria-label="${escapeHtml(alert.diagnosis ?? alert.text)}">${escapeHtml(alert.text)}</button>`
    ).join('');
    return;
  }
  const alerts: Array<{ tone: 'danger' | 'warn'; text: string; incidentId?: number; stranded?: StrandedAlert }> = [];
  if (strandedReliefFeedback) alerts.push({ tone: strandedReliefFeedback.tone, text: strandedReliefFeedback.text });
  if (stranded) alerts.push({ ...stranded, stranded });
  // Crowd-loop v1 (CH-0): death is never silent — top alert, always first.
  if (state.metrics.recentDeaths > 0) {
    alerts.push({ tone: 'danger', text: `⚠ ${state.metrics.recentDeaths} SUFFOCATED — check air / life support (${state.metrics.deathsTotal} total dead)` });
  } else if (state.metrics.deathsTotal > 0 && state.metrics.bodyCount > 0) {
    alerts.push({ tone: 'danger', text: `⚠ ${state.metrics.deathsTotal} dead — bodies await recovery` });
  }
  const readyServings = preparedMealServiceSnapshot().readyServings;
  if (readyServings < 8) alerts.push({ tone: 'danger', text: `Low meals: ${readyServings} servings ready` });
  else if (readyServings < 25) alerts.push({ tone: 'warn', text: `Meals running low: ${readyServings} servings ready` });
  if (state.metrics.airQuality < 35) alerts.push({ tone: 'danger', text: `Oxygen low: ${Math.round(state.metrics.airQuality)}%` });
  if (state.metrics.airBlockedWarningActive) alerts.push({ tone: 'danger', text: 'Life support blocked' });
  if (state.metrics.airNetworkUnpoweredVents > 0) {
    alerts.push({ tone: 'warn', text: `Air network: ${state.metrics.airNetworkUnpoweredVents} unpowered vent${state.metrics.airNetworkUnpoweredVents === 1 ? '' : 's'}` });
  } else if (state.metrics.disconnectedAirDuctTiles > 0) {
    alerts.push({ tone: 'warn', text: `Air network: ${state.metrics.disconnectedAirDuctTiles} disconnected duct tile${state.metrics.disconnectedAirDuctTiles === 1 ? '' : 's'}` });
  }
  if (state.metrics.thermalMax >= 86) alerts.push({ tone: 'danger', text: `Thermal critical: max ${Math.round(state.metrics.thermalMax)}%` });
  else if (state.metrics.staleAirTiles > 0) alerts.push({ tone: 'warn', text: `Stale air: ${state.metrics.staleAirTiles} tile${state.metrics.staleAirTiles === 1 ? '' : 's'}` });
  if (state.metrics.powerDemand > state.metrics.powerSupply) alerts.push({ tone: 'danger', text: 'Power deficit' });
  else if (state.metrics.loadPct > 85) alerts.push({ tone: 'warn', text: `Power load high: ${Math.round(state.metrics.loadPct)}%` });
  if (state.metrics.leakingTiles > 0 || state.metrics.pressurizationPct < 85) {
    alerts.push({ tone: state.metrics.pressurizationPct < 60 ? 'danger' : 'warn', text: `Hull ${Math.round(state.metrics.pressurizationPct)}%, leaks ${state.metrics.leakingTiles}` });
  }
  if (state.metrics.filthyTiles > 0) {
    alerts.push({ tone: 'danger', text: `Filthy rooms: ${state.metrics.filthyTiles} tiles (${state.metrics.sanitationTopSource})` });
  } else if (state.metrics.dirtyTiles > 10) {
    alerts.push({ tone: 'warn', text: `Cleaning backlog: ${state.metrics.dirtyTiles} dirty tiles` });
  }
  if (state.metrics.sanitationJobsOpen > Math.max(4, state.crew.total)) {
    alerts.push({ tone: 'warn', text: `Sanitation jobs backing up: ${state.metrics.sanitationJobsOpen}` });
  }
  if (state.metrics.reputationHighRiskZones > 0) {
    alerts.push({ tone: 'warn', text: `High crime-pressure zones: ${state.metrics.reputationHighRiskZones}` });
  }
  if (state.metrics.visitorExitStalled) {
    alerts.push({
      tone: 'warn',
      text: `Departures backing up: ${state.metrics.visitorsCount} visitors, no exits in 3 cycles — check exit route/berth distance`
    });
  }
  if (state.metrics.incidentsOpen > 0) {
    const firstIncident = activeIncidentsForUi()[0];
    alerts.push({ tone: 'danger', text: `Active incidents: ${state.metrics.incidentsOpen}`, incidentId: firstIncident?.id });
  }
  if (state.metrics.bodyCount > 0) alerts.push({ tone: 'warn', text: `Cleanup needed: ${state.metrics.bodyCount} bodies` });
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
  // Crowd-loop v1 (B3): latest crowd events (storm-offs, balks, deaths) feed
  // the panel so the theater has a readable paper trail.
  const feed = state.derived.queueTheater?.eventFeed ?? [];
  for (const entry of feed.slice(-3).reverse()) {
    if (state.now - entry.at > 45) continue;
    alerts.push({ tone: entry.tone === 'danger' ? 'danger' : 'warn', text: entry.text });
  }
  if (alerts.length === 0) {
    alertListEl.textContent = 'No active alerts';
    alertListEl.classList.add('is-clear');
    return;
  }
  alertListEl.classList.remove('is-clear');
  alertListEl.innerHTML = alerts
    .slice(0, 5)
    .map((alert) =>
      alert.stranded
        ? strandedAlertHtml(alert.stranded)
        : alert.incidentId === undefined
        ? `<div class="alert-item ${alert.tone}">${alert.text}</div>`
        : `<button class="alert-item ${alert.tone}" data-incident-select="${alert.incidentId}">${alert.text}</button>`
    )
    .join('');
}

function selectedIncident(): IncidentEntity | null {
  if (selectedIncidentId === null) return null;
  return state.incidents.find((incident) => incident.id === selectedIncidentId) ?? null;
}

function incidentIsClosed(incident: IncidentEntity): boolean {
  return incident.stage === 'resolved' || incident.stage === 'failed';
}

function activeIncidentsForUi(): IncidentEntity[] {
  return state.incidents
    .filter((incident) => !incidentIsClosed(incident))
    .sort((a, b) => b.severity - a.severity || a.resolveBy - b.resolveBy || a.id - b.id);
}

function incidentStageLabel(stage: string): string {
  switch (stage) {
    case 'detected':
      return 'detected';
    case 'dispatching':
      return 'dispatching';
    case 'intervening':
      return 'security en route';
    case 'intervening_extended':
      return 'containing';
    case 'escorting':
      return 'escorting';
    case 'holding':
      return 'holding';
    case 'ejecting':
      return 'ejecting';
    case 'resolved':
      return 'resolved';
    case 'failed':
      return 'failed';
    default:
      return stage;
  }
}

function incidentTypeLabel(type: string): string {
  return type === 'fight' ? 'Fight' : type === 'trespass' ? 'Trespass' : type === 'theft' ? 'Theft' : type;
}

function incidentSubjectLabel(incident: IncidentEntity): string {
  if (incident.subjectKind === 'visitor' && incident.subjectId !== null && incident.subjectId !== undefined) {
    return `visitor #${incident.subjectId}`;
  }
  if (incident.subjectKind === 'resident' && incident.subjectId !== null && incident.subjectId !== undefined) {
    return `resident #${incident.subjectId}`;
  }
  if (incident.residentParticipantIds.length > 0) {
    return incident.residentParticipantIds.map((id) => `resident #${id}`).join(', ');
  }
  return 'none';
}

function incidentTileForFocus(incident: IncidentEntity): number {
  if (incident.subjectKind === 'visitor' && incident.subjectId !== null && incident.subjectId !== undefined) {
    const visitor = state.visitors.find((entry) => entry.id === incident.subjectId);
    if (visitor) return visitor.tileIndex;
  }
  if (incident.subjectKind === 'resident' && incident.subjectId !== null && incident.subjectId !== undefined) {
    const resident = state.residents.find((entry) => entry.id === incident.subjectId);
    if (resident) return resident.tileIndex;
  }
  return incident.targetTile ?? incident.tileIndex;
}

function incidentAtTile(tileIndex: number): IncidentEntity | null {
  const candidates = state.incidents
    .filter((incident) => {
      const tiles = [incident.tileIndex, incident.targetTile ?? -1, incident.brigTile ?? -1, incidentTileForFocus(incident)];
      return tiles.includes(tileIndex);
    })
    .sort((a, b) => {
      const aActive = a.stage !== 'resolved' && a.stage !== 'failed' ? 1 : 0;
      const bActive = b.stage !== 'resolved' && b.stage !== 'failed' ? 1 : 0;
      return bActive - aActive || b.createdAt - a.createdAt || b.id - a.id;
    });
  return candidates[0] ?? null;
}

function refreshIncidentList(): void {
  const incidents = activeIncidentsForUi();
  if (incidents.length === 0) {
    incidentListEl.textContent = 'Incidents: none';
    incidentListEl.classList.add('is-empty');
    refreshAlertsCardVisibility();
    return;
  }
  incidentListEl.classList.remove('is-empty');
  refreshAlertsCardVisibility();
  incidentListEl.innerHTML = incidents
    .slice(0, 4)
    .map((incident) => {
      const tile = fromIndex(incidentTileForFocus(incident), state.width);
      const secondsLeft = Math.max(0, incident.resolveBy - state.now);
      const responder = incident.assignedCrewId === null ? 'no responder' : `crew #${incident.assignedCrewId}`;
      const tone = incident.stage === 'dispatching' || incident.assignedCrewId === null ? 'danger' : 'warn';
      const selected = selectedIncidentId === incident.id ? ' is-selected' : '';
      return `<button class="incident-item ${tone}${selected}" data-incident-select="${incident.id}" title="Select incident #${incident.id}">
        <span class="incident-dot"></span>
        <span class="incident-copy">
          <strong>${escapeHtml(incidentTypeLabel(incident.type))} #${incident.id}</strong>
          <small>${escapeHtml(incidentStageLabel(incident.stage))} · ${escapeHtml(incidentSubjectLabel(incident))} · ${responder} · ${secondsLeft.toFixed(0)}s · ${tile.x},${tile.y}</small>
        </span>
      </button>`;
    })
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

function renderInterfaceDiagnosis(target: HTMLElement, diagnosis: InterfaceDiagnosis): void {
  target.classList.remove('hidden');
  target.dataset.severity = diagnosis.severity;
  target.innerHTML = `
    <div class="section-title">Operating Diagnosis</div>
    <div class="interface-diagnosis-title">${escapeHtml(diagnosis.title)}</div>
    <div class="interface-diagnosis-evidence">${escapeHtml(diagnosis.evidence)}</div>
    <div class="interface-diagnosis-remedy">${escapeHtml(diagnosis.remedy)}</div>`;
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
    : inspector.eating
      ? 'Meal break'
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
  const hungerHint = 'seeks a prepared meal below 38, then needs a cafeteria seat';
  const hygieneHint = `cleans at <${CREW_CLEAN_THRESHOLD_UI}`;
  const bladderHint = `seeks toilet at <${CREW_TOILET_THRESHOLD_UI}`;
  const thirstHint = `seeks drink at <${CREW_THIRST_THRESHOLD_UI} (Cafeteria, Cantina, or Water Fountain)`;

  const parts: string[] = [];
  parts.push(`<div class="agent-card__head">
    <span class="agent-card__title">${escapeHtml(crew?.name ?? `Crew #${inspector.id}`)}</span>
    <span class="agent-card__role">${escapeHtml(roleLabel)} · ${escapeHtml(workLabel)}</span>
  </div>`);
  parts.push(`<div class="agent-card__action">${escapeHtml(inspector.currentAction)}</div>`);
  if (inspector.actionReason) {
    parts.push(`<div class="agent-card__reason">${escapeHtml(inspector.actionReason)}</div>`);
  }
  const airHint = `local oxygen at this tile (distress <30, critical <15)`;
  parts.push(`<div class="agent-card__needs">
    ${needBarHtml('Morale', inspector.morale, 35, 22, 'low morale slows work; sustained critical needs or missed pay can trigger resignation')}
    ${needBarHtml('Energy', inspector.energy, CREW_REST_THRESHOLD_UI, CREW_REST_CRITICAL_UI, energyHint)}
    ${needBarHtml('Hunger', inspector.hunger, 38, 18, hungerHint)}
    ${needBarHtml('Hygiene', inspector.hygiene, CREW_CLEAN_THRESHOLD_UI, null, hygieneHint)}
    ${needBarHtml('Bladder', inspector.bladder, CREW_TOILET_THRESHOLD_UI, null, bladderHint)}
    ${needBarHtml('Thirst', inspector.thirst, CREW_THIRST_THRESHOLD_UI, null, thirstHint)}
    ${needBarHtml('Air', inspector.localAir, 30, 15, airHint)}
  </div>`);
  if (inspector.missedPayrollCycles > 0) {
    parts.push(`<div class="agent-card__warn">Unpaid for ${inspector.missedPayrollCycles} payroll cycle${inspector.missedPayrollCycles === 1 ? '' : 's'}</div>`);
  }
  if (inspector.resignationNoticeAt !== null) {
    const remaining = Math.max(0, Math.ceil(60 - (state.now - inspector.resignationNoticeAt)));
    parts.push(`<div class="agent-card__warn">Resignation notice: ${remaining}s to recover morale and payroll</div>`);
  }
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
  if (crew) {
    const roleName = STAFF_ROLE_DEFINITIONS[crew.staffRole].label;
    const watch = ['Alpha', 'Beta', 'Gamma'][((crew.shiftBucket % 3) + 3) % 3];
    const homeRoom = crew.homeWorkplaceTile === null ? null : state.rooms[crew.homeWorkplaceTile];
    const homeName = homeRoom && homeRoom !== RoomType.None ? homeRoom.replace(/-/g, ' ') : 'floating';
    parts.push(`<div class="agent-card__lane">
      <strong>${escapeHtml(roleName)}</strong>
      <small>${escapeHtml(watch)} watch · home ${escapeHtml(homeName)}</small>
    </div>`);
  }
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
  if (selectedAgent.kind === 'visitor') return getVisitorInspectorById(state, selectedAgent.id)?.name ?? `Visitor #${selectedAgent.id}`;
  if (selectedAgent.kind === 'resident') return `Resident #${selectedAgent.id}`;
  return `Crew #${selectedAgent.id}`;
}

function formatVisitorInspectorHtml(visitorId: number): string {
  const inspector = getVisitorInspectorById(state, visitorId);
  if (!inspector) return 'Selected visitor is no longer available.';
  return [
    `<div class="agent-card__head"><span class="agent-card__title">${escapeHtml(inspector.name)}</span><span class="agent-card__role">${escapeHtml(inspector.trait)} · ${escapeHtml(inspector.archetype)}</span></div>`,
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
    inspector.servicePlan.length > 0
      ? `<div class="agent-card__route">Manifest: ${inspector.servicePlan.map((service) => `${inspector.completedServices.includes(service) ? '✓' : service === inspector.activeService ? '→' : '·'} ${escapeHtml(service)}`).join(' · ')}</div>`
      : '',
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

function formatIncidentInspectorHtml(incident: IncidentEntity): string {
  const tile = fromIndex(incident.tileIndex, state.width);
  const targetLabel = incident.targetTile === null || incident.targetTile === undefined ? 'none' : formatTileLabel(incident.targetTile);
  const brigLabel = incident.brigTile === null || incident.brigTile === undefined ? 'none' : formatTileLabel(incident.brigTile);
  const responder = incident.assignedCrewId === null
    ? null
    : state.crewMembers.find((crew) => crew.id === incident.assignedCrewId) ?? null;
  const closed = incidentIsClosed(incident);
  const subjectPath =
    closed
      ? null
      : incident.subjectKind === 'visitor' && incident.subjectId !== null && incident.subjectId !== undefined
      ? state.visitors.find((visitor) => visitor.id === incident.subjectId)?.path.length ?? 0
      : incident.subjectKind === 'resident' && incident.subjectId !== null && incident.subjectId !== undefined
        ? state.residents.find((resident) => resident.id === incident.subjectId)?.path.length ?? 0
        : 0;
  const responderPath = closed ? null : responder?.path.length ?? 0;
  const secondsLeft = incident.stage === 'holding'
    ? Math.max(0, (incident.holdUntil ?? state.now) - state.now)
    : Math.max(0, incident.resolveBy - state.now);
  const statusTone = incident.stage === 'failed'
    ? 'critical'
    : incident.stage === 'resolved'
      ? 'ok'
      : incident.assignedCrewId === null
        ? 'critical'
        : 'warn';
  return [
    `<div class="agent-card__head"><span class="agent-card__title">${escapeHtml(incidentTypeLabel(incident.type))} #${incident.id}</span><span class="agent-card__role">${escapeHtml(incidentStageLabel(incident.stage))}</span></div>`,
    `<div class="agent-card__action">${escapeHtml(incidentSubjectLabel(incident))}</div>`,
    `<div class="agent-card__reason">Severity ${incident.severity.toFixed(2)} · ${secondsLeft.toFixed(0)}s</div>`,
    `<div class="side-inspector-grid">
      <span>Status</span><strong>${escapeHtml(incident.outcome ?? incidentStageLabel(incident.stage))}</strong>
      <span>Origin</span><strong>${tile.x},${tile.y}</strong>
      <span>Target</span><strong>${escapeHtml(targetLabel)}</strong>
      <span>Brig</span><strong>${escapeHtml(brigLabel)}</strong>
      <span>Responder</span><strong>${responder ? `crew #${responder.id}` : 'none'}</strong>
      <span>Responder path</span><strong>${responderPath === null ? 'closed' : `${responderPath} steps`}</strong>
      <span>Subject path</span><strong>${subjectPath === null ? 'closed' : `${subjectPath} steps`}</strong>
      <span>Value</span><strong>${incident.value === undefined ? 'n/a' : incident.value.toFixed(1)}</strong>
    </div>`,
    incident.blockedReason ? `<div class="agent-card__warn">Blocked: ${escapeHtml(incident.blockedReason)}</div>` : '',
    `<div class="need-bar need-bar--${statusTone}" title="Incident handling state">
      <span class="need-bar__label">Control</span>
      <div class="need-bar__track"><div class="need-bar__fill" style="width:${clamp(100 - secondsLeft * 6, 0, 100).toFixed(0)}%"></div></div>
      <span class="need-bar__value">${escapeHtml(incidentStageLabel(incident.stage))}</span>
    </div>`
  ].join('');
}

function refreshAgentSidePanel(): boolean {
  const incident = selectedIncident();
  if (incident) {
    agentSideTitleEl.textContent = `${incidentTypeLabel(incident.type)} #${incident.id}`;
    agentSideBodyEl.innerHTML = formatIncidentInspectorHtml(incident);
    agentSidePanel.classList.remove('hidden');
    return true;
  }
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

/** Diagnosis carried over from the last alert click, cleared by any other selection. */
let alertDiagnosisText: string | null = null;

/** Any selection the player makes themselves replaces the alert's explanation. */
function clearAlertDiagnosis(): void {
  alertDiagnosisText = null;
}

function refreshSelectionSummary(): void {
  if (selectedRoomTile === null && alertDiagnosisText !== null) {
    selectionSummaryEl.textContent = alertDiagnosisText;
    return;
  }
  const incident = selectedIncident();
  if (incident) {
    selectionSummaryEl.textContent =
      `${incidentTypeLabel(incident.type)} #${incident.id}: ${incidentStageLabel(incident.stage)} | ${incidentSubjectLabel(incident)} | ${incident.outcome ?? 'open'}`;
    return;
  }
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
      ? `Crew #${inspector.id}: ${inspector.state} | ${inspector.currentAction} | morale ${Math.round(inspector.morale)}% | ${inspector.healthState}`
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
    const room = state.rooms[selectedRoomTile];
    const diagnostic = getRoomDiagnosticAt(state, selectedRoomTile);
    const clusterMeta = state.derived.clusterByTile.get(selectedRoomTile);
    const cluster = clusterMeta?.cluster ?? [selectedRoomTile];
    const clusterSet = new Set(cluster);
    // How dirty this room is and who is on it — appended to whatever the
    // room-specific summary says below, so "Cafeteria - filthy, 2 cleaners
    // assigned" is readable without opening the sanitation overlay. Silent
    // while the floors are clean; a room with nothing wrong should not spend
    // a line saying so.
    const sanitationSummary = getRoomSanitationSummary(state, selectedRoomTile);
    const sanitationSuffix =
      !sanitationSummary || sanitationSummary.severity === 'clean'
        ? ''
        : ` | ${sanitationSummary.severity} floors, ${
            sanitationSummary.assignedCleaners > 0
              ? `${sanitationSummary.assignedCleaners} cleaner${sanitationSummary.assignedCleaners === 1 ? '' : 's'} assigned`
              : sanitationSummary.openJobs > 0
                ? 'cleanup queued, nobody assigned'
                : 'no cleaner assigned'
          }`;
    if (room === undefined || room === RoomType.None || !diagnostic) {
      selectionSummaryEl.textContent = 'Selected room is no longer available.';
    } else if (room === RoomType.Cafeteria) {
      const nextDeadline = state.portOps.contracts
        .filter((contract) => (contract.status === 'active' || contract.status === 'boarding') && contract.promises.some((promise) => promise.kind === 'passengers-served'))
        .map((contract) => Math.max(0, Math.ceil(contract.hardDepartureAt - state.now)))
        .sort((a, b) => a - b)[0];
      const cafeteriaStaffing = cafeteriaStaffingSnapshot();
      const activeServiceCrew = cafeteriaStaffing.active;
      const servingStations = state.moduleInstances.filter(
        (module) => module.type === ModuleType.ServingStation && clusterSet.has(module.originTile)
      ).length;
      const positions = Math.max(1, servingStations * 2);
      selectionSummaryEl.textContent = `Cafeteria: ${state.metrics.cafeteriaQueueingCount} waiting | ${state.metrics.mealsConsumedPerMin.toFixed(1)} meals/min | ${preparedMealServiceSnapshot().readyServings} ready | Counter staff ${activeServiceCrew}/${positions}${activeServiceCrew <= 0 ? ` (slow: ${cafeteriaStaffing.diagnosis})` : ''}${nextDeadline === undefined ? '' : ` | next ship ${nextDeadline}s`}`;
    } else if (room === RoomType.Maintenance) {
      const nodes = state.itemNodes.filter((node) => clusterSet.has(node.tileIndex) && (node.items.fuel !== undefined || state.modules[node.tileIndex] === ModuleType.FuelTank));
      const stock = nodes.reduce((sum, node) => sum + Math.max(0, node.items.fuel ?? 0), 0);
      const capacity = nodes.reduce((sum, node) => sum + Math.max(0, node.capacity), 0);
      const fuel = getFuelPipeNetworkDiagnostics(state);
      const connectedTanks = nodes.filter((node) => {
        const tank = state.moduleInstances.find(
          (module) => module.type === ModuleType.FuelTank && module.originTile === node.tileIndex
        );
        return tank?.tiles.some((tile) => {
          const componentId = fuel.componentIdByTile[tile];
          return componentId >= 0 && fuel.components[componentId]?.powered;
        }) ?? false;
      }).length;
      selectionSummaryEl.textContent = `Maintenance: ${Math.floor(stock)}/${Math.floor(capacity)} fuel | ${connectedTanks}/${nodes.length} tanks connected | ${fuel.poweredSinkCount}/${fuel.sinkCount} Fuel Couplers supplied`;
    } else if (room === RoomType.Storage || room === RoomType.LogisticsStock) {
      const nodes = state.itemNodes.filter((node) => state.rooms[node.tileIndex] === room);
      const capacity = nodes.reduce((sum, node) => sum + node.capacity, 0);
      const used = nodes.reduce((sum, node) => sum + Object.values(node.items).reduce((nodeSum, amount) => nodeSum + (amount ?? 0), 0), 0);
      const activeLots = state.portOps.cargoLots.filter((lot) => lot.location !== 'closed' && lot.location !== 'delivered');
      const freightHandled = activeLots.reduce((sum, lot) => sum + lot.handledQuantity, 0);
      const freightTotal = activeLots.reduce((sum, lot) => sum + lot.quantity, 0);
      const availableCargoHandlers = state.crewMembers.filter(
        (crew) => crewMatchesCoverageRole(crew.staffRole, 'cargo-handler') && getCrewWatchStatus(state, crew) !== 'off-duty'
      ).length;
      selectionSummaryEl.textContent = `${room === RoomType.Storage ? 'Storage' : 'Intake'}: ${Math.floor(used)}/${capacity} station stock | ${Math.floor(freightHandled)}/${Math.floor(freightTotal)} consigned freight | ${availableCargoHandlers} Cargo Handlers available`;
    } else if (room === RoomType.Dorm) {
      const crewSustainability = getCrewSustainabilitySummary(state);
      selectionSummaryEl.textContent = `Crew quarters: ${crewSustainability.occupiedSleepSlots}/${crewSustainability.sleepSlots} occupied | assigned ${crewSustainability.assignedSleepSlots}/${state.crewMembers.length} | ${crewSustainability.bunkSlots} bunk, ${crewSustainability.bedSlots} bed | improvised ${crewSustainability.improvisedRestingCrew} | quality ${Math.round(crewSustainability.quartersQuality)}%`;
    } else if (room === RoomType.Hygiene) {
      const toilets = state.moduleInstances.filter((module) => module.type === ModuleType.Toilet).length;
      const showers = state.moduleInstances.filter((module) => module.type === ModuleType.Shower).length;
      const sinks = state.moduleInstances.filter((module) => module.type === ModuleType.Sink).length;
      const crewUsers = state.crewMembers.filter((crew) => crew.toileting || crew.cleaning).length;
      const visitorUsers = state.visitors.filter((visitor) => state.rooms[visitor.tileIndex] === RoomType.Hygiene).length;
      selectionSummaryEl.textContent = `Bathroom (${state.roomHousingPolicies[selectedRoomTile] ?? 'visitor'}): ${crewUsers} crew + ${visitorUsers} visitors using | ${toilets} toilets, ${showers} showers, ${sinks} sinks | toilet handles restroom; shower is the fastest wash`;
    } else if (room === RoomType.Lounge || room === RoomType.RecHall) {
      const seats = state.moduleInstances.filter((module) => module.type === ModuleType.Couch || module.type === ModuleType.Bench || module.type === ModuleType.RecUnit).reduce((sum, module) => sum + Math.min(module.tiles.length, module.type === ModuleType.RecUnit ? 3 : 2), 0);
      const premium = state.moduleInstances.filter((module) => module.type === ModuleType.GameStation || module.type === ModuleType.Telescope).reduce((sum, module) => sum + Math.min(module.tiles.length, 3), 0);
      const users = state.visitors.filter((visitor) => visitor.state === VisitorState.Leisure && (state.rooms[visitor.tileIndex] === RoomType.Lounge || state.rooms[visitor.tileIndex] === RoomType.RecHall)).length;
      selectionSummaryEl.textContent = `Lounge: ${users} visitors using | ${seats} social seats fulfill leisure | ${premium} premium positions fulfill comfort`;
    } else if (room === RoomType.Cantina) {
      const bars = state.moduleInstances.filter((module) => module.type === ModuleType.BarCounter).length;
      const taps = state.moduleInstances.filter((module) => module.type === ModuleType.Tap).length;
      const drinkers = state.visitors.filter((visitor) => visitor.state === VisitorState.Leisure && state.rooms[visitor.tileIndex] === RoomType.Cantina).length;
      const seats = state.moduleInstances
        .filter((module) => module.type === ModuleType.Bench && state.rooms[module.originTile] === RoomType.Cantina)
        .reduce((sum, module) => sum + module.tiles.length, 0);
      const waitingForSeat = state.visitors.filter((visitor) => visitor.activeService === 'drink' && visitor.carryingDrink && visitor.state === VisitorState.ToLeisure).length;
      selectionSummaryEl.textContent = `Cantina: ${drinkers}/${seats} seated · ${waitingForSeat} waiting for a seat | ${bars * 2} bar positions | ${taps} taps (${Math.round((1 + taps * 0.28) * 100)}% pickup speed)`;
    } else {
      const assignedCrew = clusterMeta
        ? state.crewMembers.filter((crew) => crew.homeWorkplaceTile === clusterMeta.anchor).length
        : 0;
      if (room === RoomType.Berth) {
        const installedPosts = state.moduleInstances.filter(
          (module) => clusterSet.has(module.originTile) &&
            (module.type === ModuleType.CargoArm || module.type === ModuleType.CustomsCounter || module.type === ModuleType.FuelPump)
        ).length;
        selectionSummaryEl.textContent = `Berth: ${diagnostic.active ? 'active' : 'inactive'} | ${assignedCrew}/${Math.max(1, installedPosts)} assigned crew | vacuum ship interface`;
      } else {
        const pressurizedTiles = cluster.reduce((sum, tile) => sum + (state.pressurized[tile] ? 1 : 0), 0);
        const pressurePct = cluster.length > 0 ? (pressurizedTiles / cluster.length) * 100 : 0;
        selectionSummaryEl.textContent = `${room}: ${diagnostic.active ? 'active' : 'inactive'} | ${assignedCrew} assigned crew | pressure ${pressurePct.toFixed(0)}%`;
      }
    }
    if (sanitationSuffix && selectionSummaryEl.textContent) selectionSummaryEl.textContent += sanitationSuffix;
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
    case RoomType.Bridge:
    case RoomType.Maintenance:
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

function selectedIncidentRouteData(): Array<{ x: number; y: number; path: number[]; color: string }> {
  const incident = selectedIncident();
  if (!incident || incidentIsClosed(incident)) return [];
  const routes: Array<{ x: number; y: number; path: number[]; color: string }> = [];
  if (incident.assignedCrewId !== null) {
    const crew = state.crewMembers.find((entry) => entry.id === incident.assignedCrewId);
    if (crew && crew.path.length > 0) routes.push({ x: crew.x, y: crew.y, path: crew.path, color: '#5cd8ff' });
  }
  if (incident.subjectKind === 'visitor' && incident.subjectId !== null && incident.subjectId !== undefined) {
    const visitor = state.visitors.find((entry) => entry.id === incident.subjectId);
    if (visitor && visitor.path.length > 0) routes.push({ x: visitor.x, y: visitor.y, path: visitor.path, color: '#ff5050' });
  }
  if (incident.subjectKind === 'resident' && incident.subjectId !== null && incident.subjectId !== undefined) {
    const resident = state.residents.find((entry) => entry.id === incident.subjectId);
    if (resident && resident.path.length > 0) routes.push({ x: resident.x, y: resident.y, path: resident.path, color: '#ff5050' });
  }
  return routes;
}

function drawSelectedIncidentRoutes(ctx: CanvasRenderingContext2D): void {
  const routes = selectedIncidentRouteData();
  if (routes.length <= 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const route of routes) {
    const startPx = route.x * TILE_SIZE;
    const startPy = route.y * TILE_SIZE;
    ctx.strokeStyle = 'rgba(8, 14, 22, 0.65)';
    ctx.lineWidth = Math.max(4, TILE_SIZE * 0.18);
    ctx.beginPath();
    ctx.moveTo(startPx, startPy);
    for (const tile of route.path) {
      const tx = tile % state.width;
      const ty = Math.floor(tile / state.width);
      ctx.lineTo((tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE);
    }
    ctx.stroke();
    ctx.strokeStyle = route.color;
    ctx.lineWidth = Math.max(2, TILE_SIZE * 0.1);
    ctx.setLineDash([TILE_SIZE * 0.32, TILE_SIZE * 0.18]);
    ctx.beginPath();
    ctx.moveTo(startPx, startPy);
    for (const tile of route.path) {
      const tx = tile % state.width;
      const ty = Math.floor(tile / state.width);
      ctx.lineTo((tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawIncidentCalloutLabel(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, color: string): void {
  const text = label.toUpperCase();
  ctx.save();
  ctx.font = `bold ${Math.max(7, Math.round(TILE_SIZE * 0.28))}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const padX = TILE_SIZE * 0.16;
  const w = ctx.measureText(text).width + padX * 2;
  const h = TILE_SIZE * 0.42;
  const bx = x - w * 0.5;
  const by = y - TILE_SIZE * 0.76 - h * 0.5;
  ctx.fillStyle = 'rgba(8, 12, 18, 0.92)';
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, TILE_SIZE * 0.04);
  ctx.beginPath();
  ctx.roundRect(bx, by, w, h, TILE_SIZE * 0.12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillText(text, x, by + h * 0.53);
  ctx.restore();
}

function drawIncidentActorRing(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, label: string): void {
  const radius = TILE_SIZE * 0.52;
  const pulse = 0.5 + Math.sin(state.now * 7) * 0.5;
  ctx.save();
  ctx.strokeStyle = 'rgba(8, 12, 18, 0.86)';
  ctx.lineWidth = Math.max(4, TILE_SIZE * 0.16);
  ctx.beginPath();
  ctx.arc(x, y, radius + TILE_SIZE * 0.04, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, TILE_SIZE * 0.085);
  ctx.beginPath();
  ctx.arc(x, y, radius + pulse * TILE_SIZE * 0.08, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, TILE_SIZE * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawIncidentCalloutLabel(ctx, label, x, y, color);
}

function incidentActorOffset(id: number): { x: number; y: number } {
  const ox = ((id * 17) % 7) - 3;
  const oy = ((id * 29) % 7) - 3;
  return { x: ox * 0.08, y: oy * 0.08 };
}

function drawIncidentActorPulse(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  const radius = TILE_SIZE * 0.42;
  const pulse = 0.5 + Math.sin(state.now * 6.5) * 0.5;
  ctx.save();
  ctx.strokeStyle = 'rgba(8, 12, 18, 0.7)';
  ctx.lineWidth = Math.max(3, TILE_SIZE * 0.12);
  ctx.beginPath();
  ctx.arc(x, y, radius + TILE_SIZE * 0.04, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, TILE_SIZE * 0.07);
  ctx.beginPath();
  ctx.arc(x, y, radius + pulse * TILE_SIZE * 0.1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function actorScreenPoint(kind: 'visitor' | 'resident' | 'crew', id: number): { x: number; y: number } | null {
  const actor =
    kind === 'visitor'
      ? state.visitors.find((entry) => entry.id === id)
      : kind === 'resident'
        ? state.residents.find((entry) => entry.id === id)
        : state.crewMembers.find((entry) => entry.id === id);
  if (!actor) return null;
  const offset = incidentActorOffset(actor.id);
  return { x: (actor.x + offset.x) * TILE_SIZE, y: (actor.y + offset.y) * TILE_SIZE };
}

function drawIncidentTileTarget(ctx: CanvasRenderingContext2D, tileIndex: number, label: string, color: string): void {
  const p = fromIndex(tileIndex, state.width);
  const x = (p.x + 0.5) * TILE_SIZE;
  const y = (p.y + 0.5) * TILE_SIZE;
  ctx.save();
  ctx.strokeStyle = 'rgba(8, 12, 18, 0.86)';
  ctx.lineWidth = Math.max(4, TILE_SIZE * 0.14);
  ctx.setLineDash([TILE_SIZE * 0.28, TILE_SIZE * 0.16]);
  ctx.strokeRect(p.x * TILE_SIZE + TILE_SIZE * 0.12, p.y * TILE_SIZE + TILE_SIZE * 0.12, TILE_SIZE * 0.76, TILE_SIZE * 0.76);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, TILE_SIZE * 0.07);
  ctx.strokeRect(p.x * TILE_SIZE + TILE_SIZE * 0.12, p.y * TILE_SIZE + TILE_SIZE * 0.12, TILE_SIZE * 0.76, TILE_SIZE * 0.76);
  ctx.setLineDash([]);
  ctx.restore();
  drawIncidentCalloutLabel(ctx, label, x, y, color);
}

function incidentSubjectScreenPoints(incident: IncidentEntity): Array<{ x: number; y: number }> {
  if (incident.subjectKind === 'visitor' && incident.subjectId !== null && incident.subjectId !== undefined) {
    const subject = actorScreenPoint('visitor', incident.subjectId);
    return subject ? [subject] : [];
  }
  if (incident.subjectKind === 'resident' && incident.subjectId !== null && incident.subjectId !== undefined) {
    const subject = actorScreenPoint('resident', incident.subjectId);
    return subject ? [subject] : [];
  }
  return incident.residentParticipantIds
    .map((residentId) => actorScreenPoint('resident', residentId))
    .filter((point): point is { x: number; y: number } => point !== null);
}

function drawActiveIncidentHints(ctx: CanvasRenderingContext2D): void {
  if (selectedIncident() !== null) return;
  const active = activeIncidentsForUi();
  if (active.length === 0) return;
  for (const incident of active.slice(0, 8)) {
    if (incident.id === selectedIncidentId) continue;
    const points = incidentSubjectScreenPoints(incident);
    if (points.length > 0) {
      for (const point of points) drawIncidentActorPulse(ctx, point.x, point.y, 'rgba(255, 80, 80, 0.9)');
      continue;
    }
    const tile = fromIndex(incident.tileIndex, state.width);
    drawIncidentActorPulse(ctx, (tile.x + 0.5) * TILE_SIZE, (tile.y + 0.5) * TILE_SIZE, 'rgba(255, 80, 80, 0.9)');
  }
}

function drawSelectedIncidentCallouts(ctx: CanvasRenderingContext2D): void {
  const incident = selectedIncident();
  if (!incident) return;
  if (incidentIsClosed(incident)) {
    drawIncidentTileTarget(ctx, incident.tileIndex, incident.stage, incident.stage === 'resolved' ? '#6edb8f' : '#ff7676');
    return;
  }
  if (incident.assignedCrewId !== null) {
    const responder = actorScreenPoint('crew', incident.assignedCrewId);
    if (responder) drawIncidentActorRing(ctx, responder.x, responder.y, '#5cd8ff', 'security');
  }
  if (incident.subjectKind === 'visitor' && incident.subjectId !== null && incident.subjectId !== undefined) {
    const subject = actorScreenPoint('visitor', incident.subjectId);
    if (subject) drawIncidentActorRing(ctx, subject.x, subject.y, '#ff5050', incident.type === 'theft' ? 'suspect' : 'subject');
  } else if (incident.subjectKind === 'resident' && incident.subjectId !== null && incident.subjectId !== undefined) {
    const subject = actorScreenPoint('resident', incident.subjectId);
    if (subject) drawIncidentActorRing(ctx, subject.x, subject.y, '#ff5050', incident.type === 'fight' ? 'detainee' : 'suspect');
  } else if (incident.residentParticipantIds.length > 0) {
    for (const [index, residentId] of incident.residentParticipantIds.entries()) {
      const participant = actorScreenPoint('resident', residentId);
      if (participant) drawIncidentActorRing(ctx, participant.x, participant.y, '#ff5050', `fight ${index + 1}`);
    }
  }
  if (incident.brigTile !== null && incident.brigTile !== undefined) {
    drawIncidentTileTarget(ctx, incident.brigTile, 'brig', '#ffe06a');
  } else if (incident.targetTile !== null && incident.targetTile !== undefined && incident.targetTile !== incident.tileIndex) {
    drawIncidentTileTarget(ctx, incident.targetTile, incident.stage === 'ejecting' ? 'exit' : 'target', '#ffe06a');
  }
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

type StationGoalMetric = 'businesses' | 'credits' | 'visitors' | 'turnarounds' | 'perfect-turnarounds';

type StationGoalDefinition = {
  title: string;
  criteria: Array<{ metric: StationGoalMetric; label: string; target: number }>;
};

const STATION_GOALS: StationGoalDefinition[] = [
  {
    title: 'Establish a working port',
    criteria: [
      { metric: 'businesses', label: 'Open Food, Supplies, or Refuel', target: 1 },
      { metric: 'credits', label: 'Earn business revenue', target: 500 },
      { metric: 'visitors', label: 'Travelers served', target: 20 }
    ]
  },
  {
    title: 'Become a reliable stop',
    criteria: [
      { metric: 'credits', label: 'Earn traffic revenue', target: 1500 },
      { metric: 'visitors', label: 'Visitors served', target: 60 },
      { metric: 'turnarounds', label: 'Complete turnarounds', target: 8 }
    ]
  },
  {
    title: 'Build a regional hub',
    criteria: [
      { metric: 'credits', label: 'Earn traffic revenue', target: 4000 },
      { metric: 'visitors', label: 'Visitors served', target: 160 },
      { metric: 'perfect-turnarounds', label: 'Perfect turnarounds', target: 12 }
    ]
  }
];

function lifetimeVisitorsServed(): number {
  // Opening ticket 13. The goal counts *distinct visitors who completed at
  // least one physical service*, not meals: mealsServedTotal also rises when
  // crew and residents eat, so habitation used to finish visitor progression.
  // Pod walk-ins and berth passengers both feed this counter through the one
  // service-completion event, so it works before a berth exists.
  return state.serviceLog.visitorsServedLifetime;
}

function stationGoalMetricValue(metric: StationGoalMetric): number {
  if (metric === 'businesses') return evaluateOpeningRecipes(state).filter((recipe) => recipe.operational).length;
  if (metric === 'credits') return state.metrics.creditsEarnedLifetime;
  if (metric === 'visitors') return lifetimeVisitorsServed();
  if (metric === 'turnarounds') return state.portOps.telemetry.settlements;
  return state.portOps.telemetry.fullSettlements;
}

function refreshStationGoal(): void {
  const complete = (goal: StationGoalDefinition): boolean =>
    goal.criteria.every((criterion) => stationGoalMetricValue(criterion.metric) >= criterion.target);
  const nextIndex = STATION_GOALS.findIndex((goal) => !complete(goal));
  const allComplete = nextIndex < 0;
  const goalIndex = allComplete ? STATION_GOALS.length - 1 : nextIndex;
  const goal = STATION_GOALS[goalIndex];
  const ratios = goal.criteria.map((criterion) =>
    Math.min(1, stationGoalMetricValue(criterion.metric) / Math.max(1, criterion.target))
  );
  const progress = allComplete ? 1 : ratios.reduce((sum, ratio) => sum + ratio, 0) / Math.max(1, ratios.length);

  stationGoalCardEl.classList.toggle('complete', allComplete);
  stationGoalStageEl.textContent = allComplete ? 'Complete' : `${goalIndex + 1} / ${STATION_GOALS.length}`;
  stationGoalTitleEl.textContent = allComplete ? 'Regional hub established' : goal.title;
  stationGoalFillEl.style.width = `${Math.round(progress * 100)}%`;
  stationGoalItemsEl.innerHTML = goal.criteria.map((criterion) => {
    const value = Math.floor(stationGoalMetricValue(criterion.metric));
    const done = value >= criterion.target;
    const suffix = criterion.metric === 'credits' ? 'c' : '';
    return `<div class="station-goal-item ${done ? 'done' : ''}">
      <span class="station-goal-check">${done ? '✓' : ''}</span>
      <span>${criterion.label}</span>
      <b>${Math.min(value, criterion.target)}/${criterion.target}${suffix}</b>
    </div>`;
  }).join('');

  const tier = getUnlockTier(state);
  const tierProgress = tierProgressSnapshot();
  stationTierCurrentEl.textContent = `Tier ${tier}: ${PROGRESSION_TOOLTIP_COPY[tier].name}`;
  stationTierNextEl.textContent = tierProgress.nextTier === null
    ? 'All progression tiers unlocked'
    : `Next: Tier ${tierProgress.nextTier} ${PROGRESSION_TOOLTIP_COPY[tierProgress.nextTier].name} · ${tierProgress.pct}%`;
  stationTierRequirementEl.textContent = tierProgress.requirement;
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
    const turnarounds = checklistRatio(state.metrics.turnaroundsCompletedLifetime, 3);
    return [{ label: 'Complete ship turnarounds', value: turnarounds.label, done: turnarounds.done }];
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

function specialtyBranchRequirementText(id: SpecialtyId): string {
  const phase = SPECIALTY_BRANCH_PHASE[id] ?? 0;
  const requiredCompleted = SPECIALTY_BRANCH_COMPLETION_REQUIREMENT[phase] ?? phase;
  const completedCount = state.command.completedSpecialties.length;
  if (requiredCompleted <= 0) return 'Available from starter Command.';
  const remaining = Math.max(0, requiredCompleted - completedCount);
  if (remaining <= 0) return 'Available after prior specialty progress.';
  return `Complete ${remaining} more specialty ${remaining === 1 ? 'branch' : 'branches'}.`;
}

function refreshProgressionModal(): void {
  const tier = getUnlockTier(state);
  const tierProgress = tierProgressSnapshot();
  const currentCopy = PROGRESSION_TOOLTIP_COPY[tier];
  progressModalTierNameEl.textContent = `Tier ${tier}: ${currentCopy.name}`;
  progressModalTierThemeEl.textContent = currentCopy.theme;
  progressModalFillEl.style.width = `${tierProgress.nextTier === null ? 100 : tierProgress.pct}%`;
  progressModalPctEl.textContent = tierProgress.nextTier === null
    ? 'All tiers unlocked'
    : `${tierProgress.pct}% to Tier ${tierProgress.nextTier}`;
  progressModalGoalEl.textContent = tierProgress.requirement;
  progressModalTierChecklistEl.innerHTML = tierChecklistItems().map((item) => `
    <div class="checklist-item ${item.done ? 'done' : ''}">
      <span class="checkmark">${item.done ? '✓' : ''}</span>
      <span>${escapeHtml(item.label)}</span>
      <span class="value">${escapeHtml(item.value)}</span>
    </div>
  `).join('');
  progressModalRoadmapEl.innerHTML = TIER_ORDER.map((roadmapTier) => {
    const copy = PROGRESSION_TOOLTIP_COPY[roadmapTier];
    const presentation = TIER_PRESENTATION[roadmapTier];
    const completed = roadmapTier < tier;
    const current = roadmapTier === tier;
    const next = tierProgress.nextTier === roadmapTier;
    const status = completed ? 'Unlocked' : current ? 'Current' : next ? `${tierProgress.pct}%` : 'Locked';
    const className = completed ? 'done' : current ? 'current' : next ? 'next' : 'locked';
    return `<div class="progression-tier-card ${className}">
      <div class="specialty-roadmap-head">
        <strong>Tier ${roadmapTier}: ${escapeHtml(copy.name)}</strong>
        <span class="progression-tier-status">${status}</span>
      </div>
      <small>${escapeHtml(copy.theme)}</small>
      <small><strong>Requirement:</strong> ${escapeHtml(copy.trigger)}</small>
      <small><strong>Unlocks:</strong> ${escapeHtml(formatTierList(presentation.buildings))}</small>
    </div>`;
  }).join('');

  const activeSpecialty = state.command.selectedSpecialty;
  const completedCount = state.command.completedSpecialties.length;

  progressModalSpecialtySummaryEl.textContent = activeSpecialty
    ? `Active: ${specialtyLabel(activeSpecialty)}. Finish this branch before choosing another.`
    : state.command.completedSpecialties.length > 0
      ? `Completed: ${state.command.completedSpecialties.map((id) => specialtyLabel(id)).join(', ')}.`
      : 'Choose one specialty branch. Completing it unlocks its officer, staff, and bridge terminal.';
  progressModalSpecialtiesEl.innerHTML = SPECIALTY_DEFINITIONS.map((def) => {
    const progressState = state.command.specialtyProgress[def.id];
    const pct = Math.round((progressState?.progress ?? 0) * 100);
    const branchAvailable = isSpecialtyPhaseAvailable(def.id, completedCount);
    const locked = !branchAvailable;
    const completed = progressState?.state === 'completed';
    const active = state.command.selectedSpecialty === def.id;
    const blockedByActive = !!state.command.selectedSpecialty && !active;
    const selectable = !locked && !completed && !state.command.selectedSpecialty;
    const researchDone = active && pct >= 100;
    const officerHired = roleCount(def.officerRole) > 0;
    const affordable = state.metrics.credits >= def.researchCost;
    const status =
      completed
        ? 'Complete'
        : researchDone && !officerHired
          ? 'Hire Officer'
        : active
          ? `${pct}%`
        : blockedByActive
            ? 'Waiting'
            : !locked
            ? 'Available'
            : 'Future Branch';
    const unlockedStaff = def.unlocksStaff
      .filter((role) => SURFACED_STAFF_ROLES.includes(role))
      .map((role) => STAFF_ROLE_DEFINITIONS[role].label)
      .join(', ');
    const officer = STAFF_ROLE_DEFINITIONS[def.officerRole].label;
    const buttonLabel = active
      ? researchDone && !officerHired
        ? 'Open Crew Hiring'
        : 'Researching'
      : completed
        ? 'Complete'
        : blockedByActive
          ? 'Finish Active Branch'
        : locked
          ? 'Locked'
            : `Research - ${def.researchCost}c`;
    const buttonHtml = active && researchDone && !officerHired
      ? `<button data-open-crew-panel="1">Open Crew Hiring</button>`
      : `<button data-select-specialty="${def.id}" ${selectable && affordable ? '' : 'disabled'}>${!affordable && selectable ? `Need ${def.researchCost}c` : buttonLabel}</button>`;
    return `
      <div class="specialty-roadmap-card ${completed ? 'completed' : active ? 'active' : locked ? 'locked' : 'available'}">
        <div class="specialty-roadmap-head">
          <strong>${def.label}</strong>
          <span class="progression-tier-status">${status}</span>
        </div>
        <small>${def.description}</small>
        <small><strong>Requirement:</strong> ${specialtyBranchRequirementText(def.id)}</small>
        <small><strong>Cost:</strong> ${def.researchCost} credits</small>
        <small><strong>Officer:</strong> ${officer}</small>
        <small><strong>Staff:</strong> ${unlockedStaff || 'Bridge systems only'}</small>
        ${buttonHtml}
      </div>
    `;
  }).join('');
}

const simSpeeds: Array<1 | 2 | 4> = [1, 2, 4];
type PaletteSection = 'businesses' | 'structure' | 'rooms' | 'modules' | 'crew' | 'overlays';
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
  sellFood60Gain: 15,
};

const GAME_VERSION = '0.2.0-two-berth-shift';
const SAVE_STORE_KEY = 'stationSim.saves.v1';
const AUTOSAVE_KEY = 'spacegame-autosave';
const AUTOSAVE_INTERVAL_MS = 60_000;
const QUICKSAVE_ID = 'quicksave';
const MAX_SAVE_SLOTS = 30;
// localStorage is commonly capped per origin. Keep enough headroom for the
// separate autosave and browser bookkeeping as stations grow.
const MAX_SAVE_STORE_CHARS = 3_500_000;

async function configureStarterLayoutEditor(): Promise<void> {
  if (!starterLayoutEditorMode) return;
  const editor = document.querySelector<HTMLElement>('#starter-layout-editor')!;
  const status = document.querySelector<HTMLElement>('#starter-layout-status')!;
  const saveButton = document.querySelector<HTMLButtonElement>('#save-starter-layout')!;
  const resetButton = document.querySelector<HTMLButtonElement>('#reset-starter-layout')!;
  let existing: StarterLayoutRecord | null = null;
  try {
    existing = await readStarterLayoutRecord();
  } catch (error) {
    console.warn('[starter-layout] could not inspect saved template:', error);
  }

  editor.classList.remove('hidden');
  const positionEditor = () => {
    const wrapRect = gameWrap.getBoundingClientRect();
    const width = Math.max(280, Math.min(560, wrapRect.width - 24));
    editor.style.width = `${width}px`;
    editor.style.left = `${Math.max(12, wrapRect.right - width - 12)}px`;
    editor.style.top = `${Math.max(8, wrapRect.top + 8)}px`;
  };
  positionEditor();
  window.addEventListener('resize', positionEditor);
  document.body.classList.add('starter-layout-editor-mode');
  state.controls.paused = true;
  state.controls.simSpeed = 1;
  state.metrics.credits = 999_999;
  state.legacyMaterialStock = 999_999;
  state.metrics.materials = 999_999;
  playBtn.disabled = true;
  pauseBtn.disabled = true;
  speedUpBtn.disabled = true;
  status.textContent = startupParams.get('starter') === 'stock'
    ? 'Stock layout loaded'
    : existing
      ? `Default from ${formatClock(existing.savedAt)}`
      : 'No custom default yet';

  saveButton.addEventListener('click', async () => {
    state.controls.paused = true;
    try {
      const record: StarterLayoutRecord = {
        savedAt: Date.now(),
        payloadText: serializeSave('__starter_layout__', state, GAME_VERSION)
      };
      await writeStarterLayoutRecord(record);
      status.textContent = `Saved ${formatClock(record.savedAt)}`;
      saveButton.textContent = 'Saved';
      window.setTimeout(() => {
        saveButton.textContent = 'Save Default';
      }, 1400);
    } catch (error) {
      status.textContent = 'Could not save default';
      console.warn('[starter-layout] save failed:', error);
    }
  });

  resetButton.addEventListener('click', async () => {
    resetButton.disabled = true;
    try {
      await deleteStarterLayoutRecord();
    } catch (error) {
      resetButton.disabled = false;
      status.textContent = 'Could not reset default';
      console.warn('[starter-layout] reset failed:', error);
      return;
    }
    const url = new URL(location.href);
    url.searchParams.delete('scenario');
    url.searchParams.delete('load');
    url.searchParams.delete('loadId');
    url.searchParams.delete('charter');
    url.searchParams.set('starter-editor', '1');
    url.searchParams.set('starter', 'stock');
    location.assign(url);
  });
}

void configureStarterLayoutEditor();

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

let currentTool: BuildTool = { kind: 'none' };
let utilityToolPreviousOverlay: DiagnosticOverlay | null = null;
let roomClipboard: RoomClipboard | null = null;
let selectedDockId: number | null = null;
let selectedRoomTile: number | null = null;
// Anchor tile of the currently-inspected berth cluster (for the
// berth-config controls inside room-modal). Null when the room
// inspector isn't pointed at a Berth tile.
let selectedBerthAnchor: number | null = null;
let selectedAgent: SelectedAgent | null = null;
let selectedIncidentId: number | null = null;
let projectedTrafficOffer: {
  offerId: number;
  slotId: string;
  hullVariant: ShipHullVariant;
  size: ShipSize;
} | null = null;
let isPainting = false;
let paintStart: { x: number; y: number } | null = null;
let paintCurrent: { x: number; y: number } | null = null;
let hoveredTile: number | null = null;

function approachPreviewForRender(): ApproachEnvelopePreview {
  if (currentTool.kind === 'room' && currentTool.room === RoomType.Berth && isPainting && paintStart && paintCurrent) {
    const minX = Math.min(paintStart.x, paintCurrent.x);
    const maxX = Math.max(paintStart.x, paintCurrent.x);
    const minY = Math.min(paintStart.y, paintCurrent.y);
    const maxY = Math.max(paintStart.y, paintCurrent.y);
    const berthPlacementTiles: number[] = [];
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) berthPlacementTiles.push(toIndex(x, y, state.width));
    }
    return { berthPlacementTiles };
  }
  if (currentTool.kind !== 'none') return {};
  if (projectedTrafficOffer) {
    return {
      candidateOfferId: projectedTrafficOffer.offerId,
      candidateSlotId: projectedTrafficOffer.slotId,
      candidateHullVariant: projectedTrafficOffer.hullVariant,
      candidateShipSize: projectedTrafficOffer.size
    };
  }
  if (selectedDockId !== null) {
    const dock = state.docks.find((candidate) => candidate.id === selectedDockId);
    if (dock) return { inspectedSlotId: `dock:${dock.sourceKey}` };
  }
  if (selectedRoomTile !== null) {
    const berth = getBerthFacilityAt(state, selectedRoomTile);
    if (berth) return { inspectedSlotId: `berth:${berth.anchorTile}` };
  }
  return {};
}
// A new station starts with a strategic choice, not a catalog of walls. Keep
// this in sync with the initially-active markup above. Once the player picks
// a tool or tab, their choice remains theirs.
let activePaletteSection: PaletteSection = 'businesses';
let lastPaletteToolKey = '';
let isRightPanning = false;
let panStartClientX = 0;
let panStartClientY = 0;
let panStartScrollLeft = 0;

function selectUtilityUnderlayTool(kind: UtilityUnderlayKind, erase = false): void {
  if (currentTool.kind !== 'utility-underlay' && utilityToolPreviousOverlay === null) {
    utilityToolPreviousOverlay = state.controls.diagnosticOverlay;
  }
  currentTool = { kind: 'utility-underlay', utilityKind: kind, utilityErase: erase };
  state.controls.diagnosticOverlay = 'utility-underlay';
  toolLockMessage = '';
}

function restoreViewAfterUtilityTool(): void {
  if (utilityToolPreviousOverlay === null) return;
  if (state.controls.diagnosticOverlay === 'utility-underlay') {
    state.controls.diagnosticOverlay = utilityToolPreviousOverlay;
  }
  utilityToolPreviousOverlay = null;
}
let panStartScrollTop = 0;
let uiPanelsHidden = false;

// Live berth/pod ops used to be one floating card with its own collapse
// control. Now that each turnaround stands beside its own interface there is
// no shared card to fold away, and the panel-visibility toggle already hides
// the whole anchor layer.
function syncPanelVisibility(): void {
  app!.classList.toggle('ui-panels-hidden', uiPanelsHidden);
  toggleUiPanelsBtn.classList.toggle('active', uiPanelsHidden);
  toggleUiPanelsBtn.setAttribute('aria-pressed', String(uiPanelsHidden));
  toggleUiPanelsBtn.setAttribute('aria-label', uiPanelsHidden ? 'Show interface panels' : 'Hide interface panels');
  toggleUiPanelsBtn.title = uiPanelsHidden ? 'Show interface panels' : 'Hide interface panels';
  openingEconomyPanels.setSiteBriefVisible(!uiPanelsHidden);
}

toggleUiPanelsBtn.addEventListener('click', () => {
  const center = getViewportCenterWorldPx();
  uiPanelsHidden = !uiPanelsHidden;
  syncPanelVisibility();
  requestAnimationFrame(() => {
    applyCanvasSize();
    updateStageLayout();
    centerViewportOnWorldPx(center.x, center.y);
  });
});

syncPanelVisibility();

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
  hireCrewBtn.textContent = `Quick Assistant (${market.hireCost}c)`;
  buySmallBtn.textContent = `Buy +25 Supplies (${market.buyMat25Cost}c)`;
  sellSmallBtn.textContent = `Sell -25 Supplies (+${market.sellMat25Gain}c)`;
  buyLargeBtn.textContent = `Buy +80 Supplies (${market.buyMat80Cost}c)`;
  sellLargeBtn.textContent = `Sell -80 Supplies (+${market.sellMat80Gain}c)`;
  buyFoodSmallBtn.textContent = `Order +20 Raw Food (${market.buyFood20Cost}c)`;
  sellFoodSmallBtn.textContent = `Sell -20 Raw Food (+${market.sellFood20Gain}c)`;
  buyFoodLargeBtn.textContent = `Order +60 Raw Food (${market.buyFood60Cost}c)`;
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

function specialtyLabel(id: SpecialtyId | null): string {
  if (!id) return 'None selected';
  return SPECIALTY_DEFINITIONS.find((def) => def.id === id)?.label ?? id;
}

function roleCount(role: StaffRole): number {
  return state.crew.roleCounts?.[role] ?? 0;
}

function roleSpriteMarkup(role: StaffRole): string {
  const spriteKey = STAFF_ROLE_SPRITE_KEYS[role];
  const frame = spriteKey ? spriteAtlas.getFrame(spriteKey) : null;
  const image = spriteAtlas.image;
  if (spriteAtlas.ready && image && frame) {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const style = [
      `background-image:url("${image.src}")`,
      `background-position:-${frame.x}px -${frame.y}px`,
      `background-size:${width}px ${height}px`
    ].join(';');
    return `<div class="crew-card-portrait sprite" style='${style}' aria-hidden="true"></div>`;
  }
  const initials = STAFF_ROLE_DEFINITIONS[role].label
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return `<div class="crew-card-portrait fallback" aria-hidden="true">${initials}</div>`;
}

function refreshCrewPanel(): void {
  const completed = new Set(state.command.completedSpecialties);
  const active = state.command.selectedSpecialty;
  crewCommandSummaryEl.textContent =
    `Bridge ${state.ops.bridgeActive}/${state.ops.bridgeTotal} | captain ${roleCount('captain') > 0 ? 'assigned' : 'missing'} | sanitation ${departmentStatusText('sanitation')}`;
  crewSpecialtySummaryEl.textContent = active
    ? `${specialtyLabel(active)} ${Math.round((state.command.specialtyProgress[active]?.progress ?? 0) * 100)}% in Progress`
    : 'Use Progress to unlock more roles';
  const officerCount = STAFF_ROLES.filter((role) => STAFF_ROLE_DEFINITIONS[role].officer && roleCount(role) > 0).length;
  officerSummaryEl.textContent = `${officerCount} hired`;
  staffSummaryEl.textContent = `${state.crew.total} crew`;

  const roleIsAvailableInHiringPanel = (role: StaffRole): boolean => {
    const def = STAFF_ROLE_DEFINITIONS[role];
    if (!def.requiresSpecialty || completed.has(def.requiresSpecialty) || roleCount(role) > 0) return true;
    if (!def.officer || active !== def.requiresSpecialty) return false;
    const specialty = SPECIALTY_DEFINITIONS.find((candidate) => candidate.id === def.requiresSpecialty);
    const progress = state.command.specialtyProgress[def.requiresSpecialty];
    return specialty?.officerRole === role && (progress?.progress ?? 0) >= 1;
  };

  const visibleHiringRoles = SURFACED_STAFF_ROLES.filter((role) => roleCount(role) > 0 || roleIsAvailableInHiringPanel(role));
  const officerRoles = visibleHiringRoles.filter((role) => STAFF_ROLE_DEFINITIONS[role].officer);
  officerGridEl.innerHTML = officerRoles.map((role) => {
    const def = STAFF_ROLE_DEFINITIONS[role];
    const count = roleCount(role);
    const disabled = count > 0 || state.metrics.credits < def.cost;
    const status = count > 0 ? 'Hired' : role === 'captain' ? `${def.cost}c | first command hire` : `${def.cost}c`;
    const armed = currentTool.kind === 'hire-staff' && currentTool.staffRole === role;
    return `<div class="crew-card${armed ? ' armed' : ''}">
      <div class="crew-card-main">
        ${roleSpriteMarkup(role)}
        <div class="crew-card-copy">
          <strong>${def.label}</strong>
          <small>${def.department}</small>
          <small>${status}</small>
        </div>
      </div>
      <button data-hire-role="${role}" ${disabled ? 'disabled' : ''}>${armed ? 'Placing' : 'Hire'}</button>
    </div>`;
  }).join('');

  const staffRoles = visibleHiringRoles.filter((role) => !STAFF_ROLE_DEFINITIONS[role].officer);
  staffGridEl.innerHTML = staffRoles.map((role) => {
    const def = STAFF_ROLE_DEFINITIONS[role];
    const count = roleCount(role);
    const hireDisabled = state.metrics.credits < def.cost;
    const status = `${def.cost}c | ${count} hired`;
    const armed = currentTool.kind === 'hire-staff' && currentTool.staffRole === role;
    return `<div class="crew-card${armed ? ' armed' : ''}">
      <div class="crew-card-main">
        ${roleSpriteMarkup(role)}
        <div class="crew-card-copy">
          <strong>${def.label}</strong>
          <small>${def.department} | ${def.lane}</small>
          <small>${status}</small>
        </div>
      </div>
      <div class="button-row compact-buttons">
        <button data-hire-role="${role}" ${hireDisabled ? 'disabled' : ''}>${armed ? 'Placing' : 'Hire'}</button>
        <button data-fire-role="${role}" ${count <= 0 ? 'disabled' : ''}>Fire</button>
      </div>
    </div>`;
  }).join('');
}

function selectHireStaffTool(role: StaffRole): void {
  const def = STAFF_ROLE_DEFINITIONS[role];
  currentTool = { kind: 'hire-staff', staffRole: role };
  toolLockMessage = '';
  crewPanelStatusEl.textContent = `Click a built station tile to place ${def.label}.`;
  setPaletteSection('crew');
  refreshCrewPanel();
  refreshToolbar();
}

function placeHiredStaffAt(role: StaffRole, idx: number): boolean {
  const def = STAFF_ROLE_DEFINITIONS[role];
  if (!WALKABLE_TILES.has(state.tiles[idx])) {
    crewPanelStatusEl.textContent = `Place ${def.label} on a reachable station floor, dock, door, or airlock.`;
    toolLockMessage = crewPanelStatusEl.textContent;
    return false;
  }
  const beforeMaxId = state.crewMembers.reduce((max, crew) => Math.max(max, crew.id), -1);
  const hired = hireStaffRole(state, role);
  if (!hired) {
    crewPanelStatusEl.textContent = `Cannot hire ${def.label}.`;
    toolLockMessage = crewPanelStatusEl.textContent;
    refreshCrewPanel();
    return false;
  }
  const placedCrew =
    state.crewMembers.find((crew) => crew.id > beforeMaxId) ??
    [...state.crewMembers].reverse().find((crew) => crew.staffRole === role);
  if (placedCrew) {
    const p = fromIndex(idx, state.width);
    placedCrew.x = p.x + 0.5;
    placedCrew.y = p.y + 0.5;
    placedCrew.tileIndex = idx;
    placedCrew.path = [];
    placedCrew.role = 'idle';
    placedCrew.staffRole = role;
    placedCrew.workLane = def.lane;
    placedCrew.lastWorkLane = def.lane;
    placedCrew.targetTile = null;
    placedCrew.activeJobId = null;
    placedCrew.carryingItemType = null;
    placedCrew.carryingAmount = 0;
    placedCrew.retargetAt = state.now;
    placedCrew.assignmentStickyUntil = 0;
    placedCrew.assignmentHoldUntil = 0;
  }
  currentTool = { kind: 'none' };
  crewPanelStatusEl.textContent = `Placed ${def.label}.`;
  toolLockMessage = '';
  refreshCrewPanel();
  refreshToolbar();
  setPaletteSection('crew');
  return true;
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

const CORE_ROLE_COVERAGE: StaffRole[] = [
  'cook',
  'steward',
  'cargo-handler',
  'engineer',
  'cleaner',
  'security-guard',
  'assistant'
];

function crewMatchesCoverageRole(actual: StaffRole, coverageRole: StaffRole): boolean {
  if (coverageRole === 'cargo-handler') {
    return actual === 'cargo-handler' || actual === 'industrial-officer' || actual === 'docking-officer';
  }
  if (coverageRole === 'engineer') {
    return actual === 'engineer' || actual === 'mechanic' || actual === 'technician' || actual === 'welder' ||
      actual === 'eva-engineer' || actual === 'mechanic-officer';
  }
  if (coverageRole === 'cleaner') {
    return actual === 'cleaner' || actual === 'janitor' || actual === 'sanitation-officer';
  }
  if (coverageRole === 'security-guard') {
    return actual === 'security-guard' || actual === 'security-officer';
  }
  return actual === coverageRole;
}

function currentRoleCoverage(): Array<{ role: StaffRole; available: number; total: number }> {
  return CORE_ROLE_COVERAGE.map((role) => {
    const members = state.crewMembers.filter((crew) => crewMatchesCoverageRole(crew.staffRole, role));
    const available = members.filter((crew) => getCrewWatchStatus(state, crew) !== 'off-duty').length;
    return { role, available, total: members.length };
  });
}

let lastBottomRoleCoverageKey = '';
function refreshBottomRoleCoverage(): void {
  const coverage = currentRoleCoverage();
  const key = coverage.map(({ role, available, total }) => `${role}:${available}:${total}`).join('|');
  if (key === lastBottomRoleCoverageKey) return;
  lastBottomRoleCoverageKey = key;
  bottomRoleCoverageEl.innerHTML = coverage.map(({ role, available, total }) =>
    `<span class="bottom-role-chip${available === 0 ? ' uncovered' : ''}" title="${escapeHtml(STAFF_ROLE_DEFINITIONS[role].label)} available this watch">${escapeHtml(STAFF_ROLE_DEFINITIONS[role].label)} <b>${available}/${total}</b></span>`
  ).join('');
}

function refreshNamedWatchRoster(): void {
  const schedule = getOperatingSchedule(state);
  const statusLabel: Record<CrewWatchStatus, string> = {
    'on-duty': 'On duty',
    reserve: 'Reserve',
    'off-duty': 'Off duty'
  };
  const watchNames = ['Alpha', 'Beta', 'Gamma'] as const;
  const coverage = currentRoleCoverage();
  const bankName = schedule.trafficBank === 'passenger-bank'
    ? 'Passenger bank'
    : schedule.trafficBank === 'cargo-bank'
      ? 'Cargo bank'
      : 'Maintenance window';
  roleCoverageSummaryEl.innerHTML = `
    <div class="role-coverage-head">
      <span><strong>${escapeHtml(schedule.watchName)} watch</strong><small>${escapeHtml(bankName)}</small></span>
      <span>${state.crewMembers.length} named crew</span>
    </div>
    <div class="role-coverage-chips">${coverage.map(({ role, available, total }) =>
      `<span class="role-coverage-chip${available === 0 ? ' uncovered' : ''}"><b>${escapeHtml(STAFF_ROLE_DEFINITIONS[role].label)}</b> ${available}/${total}</span>`
    ).join('')}</div>`;
  refreshBottomRoleCoverage();

  const roster = [...state.crewMembers].sort((a, b) => {
    const roleOrder = CORE_ROLE_COVERAGE.indexOf(a.staffRole) - CORE_ROLE_COVERAGE.indexOf(b.staffRole);
    return roleOrder !== 0 ? roleOrder : a.name.localeCompare(b.name);
  });
  const selectedCrew = selectedRosterCrewId === null
    ? null
    : roster.find((crew) => crew.id === selectedRosterCrewId) ?? null;
  if (selectedRosterCrewId !== null && !selectedCrew) selectedRosterCrewId = null;
  const workplaceInspector = selectedWorkplaceAnchor === null
    ? null
    : getRoomInspectorAt(state, selectedWorkplaceAnchor)?.workplace ?? null;
  if (selectedWorkplaceAnchor !== null && !workplaceInspector) selectedWorkplaceAnchor = null;
  if (workplaceInspector) {
    const roleLabels = workplaceInspector.eligibleRoles.map((role) => STAFF_ROLE_DEFINITIONS[role].label).join(' or ');
    const compatible = selectedCrew !== null && workplaceInspector.eligibleRoles.includes(selectedCrew.staffRole);
    const alreadyAssigned = selectedCrew?.homeWorkplaceTile === workplaceInspector.anchorTile;
    workplaceAssignmentContextEl.classList.remove('hidden');
    workplaceAssignmentContextEl.innerHTML = `
      <span><strong>${escapeHtml(workplaceInspector.label)}</strong><small>${workplaceInspector.positions} positions · ${escapeHtml(roleLabels)}</small></span>
      <span class="workplace-context-actions">
        ${selectedCrew ? `<button type="button" data-confirm-workplace ${compatible && !alreadyAssigned ? '' : 'disabled'}>${alreadyAssigned ? 'Assigned' : compatible ? `Assign ${escapeHtml(selectedCrew.name)}` : 'Wrong role'}</button>` : '<small>Select a compatible crew member</small>'}
        <button type="button" data-cancel-workplace class="ghost-btn" aria-label="Cancel workplace assignment">Cancel</button>
      </span>`;
  } else {
    workplaceAssignmentContextEl.classList.add('hidden');
    workplaceAssignmentContextEl.innerHTML = '';
  }
  watchAssignmentBarEl.innerHTML = selectedCrew
    ? `<span class="watch-assignment-person">${roleSpriteMarkup(selectedCrew.staffRole)}<span><strong>${escapeHtml(selectedCrew.name)}</strong><small>${escapeHtml(STAFF_ROLE_DEFINITIONS[selectedCrew.staffRole].label)}</small></span></span>
      <span class="watch-assignment-actions"><small>Assign to</small>${watchNames.map((name, watch) => `<button type="button" data-crew-watch="${watch}" data-crew-id="${selectedCrew.id}" class="${selectedCrew.shiftBucket === watch ? 'active' : ''}" ${selectedCrew.shiftBucket === watch ? 'disabled' : ''}>${name}</button>`).join('')}</span>`
    : '<span><strong>Select a crew member</strong><small>Then choose the watch they should join.</small></span>';

  namedWatchRosterEl.innerHTML = watchNames.map((watchName, watch) => {
    const members = roster.filter((crew) => ((crew.shiftBucket % 3) + 3) % 3 === watch);
    const representative = members[0];
    const status = representative
      ? getCrewWatchStatus(state, representative)
      : watch === schedule.watch ? 'on-duty' : watch === schedule.nextWatch ? 'reserve' : 'off-duty';
    return `<section class="watch-roster-column ${status}">
      <header class="watch-roster-heading">
        <span><strong>${watchName}</strong><small>${statusLabel[status]}</small></span>
        <b>${members.length}</b>
      </header>
      <div class="watch-roster-members">${members.length > 0 ? members.map((crew) => {
        const selected = crew.id === selectedRosterCrewId;
        const homeRoom = crew.homeWorkplaceTile === null ? null : state.rooms[crew.homeWorkplaceTile];
        const assignment = crew.assignedSystem
          ? crew.assignedSystem.replace(/-/g, ' ')
          : homeRoom && homeRoom !== RoomType.None ? `home: ${homeRoom.replace(/-/g, ' ')}` : crew.resting ? 'resting' : crew.activeJobId !== null ? 'working' : 'available';
        const incompatible = !!workplaceInspector && !workplaceInspector.eligibleRoles.includes(crew.staffRole);
        return `<button type="button" class="named-roster-card${selected ? ' selected' : ''}${incompatible ? ' incompatible' : ''}" data-roster-crew-id="${crew.id}" aria-pressed="${selected}" ${incompatible ? `title="${escapeHtml(STAFF_ROLE_DEFINITIONS[crew.staffRole].label)} cannot staff ${escapeHtml(workplaceInspector!.label)}"` : ''}>
          ${roleSpriteMarkup(crew.staffRole)}
          <span class="named-roster-copy">
            <strong>${escapeHtml(crew.name)}</strong>
            <small>${escapeHtml(STAFF_ROLE_DEFINITIONS[crew.staffRole].label)}</small>
            <em>${escapeHtml(assignment)}</em>
          </span>
        </button>`;
      }).join('') : '<span class="watch-roster-empty">No crew assigned</span>'}</div>
    </section>`;
  }).join('');
}

function refreshPriorityUi(): void {
  refreshNamedWatchRoster();
}

function refreshOperatingRhythm(): void {
  const schedule = getOperatingSchedule(state);
  const bankLabel = (bank: ReturnType<typeof getOperatingSchedule>['trafficBank']): string =>
    bank === 'passenger-bank' ? 'Passenger arrival bank' : bank === 'cargo-bank' ? 'Cargo arrival bank' : 'Quiet maintenance window';
  watchNameEl.textContent = `${schedule.watchName} WATCH`;
  const seconds = Math.ceil(schedule.secondsRemaining);
  watchCountdownEl.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const relevantOfferIds = new Set(
    state.portOps.contracts
      .filter((contract) => contract.status === 'accepted' || contract.status === 'active' || contract.status === 'boarding')
      .map((contract) => contract.offerId)
  );
  const forecastOffers = state.trafficOffers
    .filter((offer) =>
      relevantOfferIds.has(offer.id) ||
      offer.status === 'forecast' ||
      offer.status === 'holding' ||
      offer.status === 'cleared'
    )
    .sort((a, b) => a.arrivesAt - b.arrivesAt)
    .slice(0, 3);
  const roleDemand = new Map<StaffRole, number>();
  for (const offer of forecastOffers) {
    for (const [role, count] of Object.entries(offerRolePlan(offer)) as Array<[StaffRole, number]>) {
      roleDemand.set(role, (roleDemand.get(role) ?? 0) + count);
    }
  }
  const demandText = [...roleDemand.entries()]
    .map(([role, count]) => `${STAFF_ROLE_DEFINITIONS[role].label} ${count}`)
    .join(' · ');
  trafficBankNowEl.textContent = forecastOffers.length > 0
    ? `${bankLabel(schedule.trafficBank)} · ${forecastOffers.length} inbound · ${demandText || 'no specialist demand'}`
    : `${bankLabel(schedule.trafficBank)} · next ${bankLabel(schedule.nextTrafficBank).toLowerCase()}`;
  const watchCounts = { 'on-duty': 0, reserve: 0, 'off-duty': 0 };
  for (const crew of state.crewMembers) watchCounts[getCrewWatchStatus(state, crew)] += 1;
  trafficBankNextEl.textContent = schedule.recallActive
    ? `Emergency recall · ${watchCounts['on-duty']} crew available`
    : `${watchCounts['on-duty']} on · ${watchCounts.reserve} reserve · ${watchCounts['off-duty']} off${forecastOffers.length > 0 ? ` · ${forecastOffers[0].callsign} next` : ` · next ${schedule.nextWatchName.toLowerCase()}`}`;
  trafficBankNextEl.title = `Next traffic: ${bankLabel(schedule.nextTrafficBank)}`;
  emergencyRecallEl.textContent = schedule.recallActive ? 'End Recall' : 'Emergency Recall';
  emergencyRecallEl.setAttribute(
    'aria-label',
    schedule.recallActive
      ? 'End emergency crew recall'
      : 'Call the off-duty watch into service for 45 seconds; fatigue and morale costs rise'
  );
  emergencyRecallEl.classList.toggle('active', schedule.recallActive);
}
refreshPriorityUi();
refreshOperatingRhythm();
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
const TOOLBAR_UTILITY_UNDERLAY_MAP: Record<string, UtilityUnderlayKind> = {
  'air-duct': 'air-duct',
  'power-conduit': 'power-conduit',
  'water-pipe': 'water-pipe',
  'fuel-pipe': 'fuel-pipe'
};
const TOOLBAR_ROOM_MAP: Record<string, RoomType> = {
  bridge: RoomType.Bridge,
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
  maintenance: RoomType.Maintenance,
  berth: RoomType.Berth,
  cantina: RoomType.Cantina,
  'commercial-unit': RoomType.CommercialUnit,
  observatory: RoomType.Observatory,
};
const TOOLBAR_MODULE_MAP: Record<string, ModuleType> = {
  'captain-console': ModuleType.CaptainConsole,
  'sanitation-terminal': ModuleType.SanitationTerminal,
  'security-terminal': ModuleType.SecurityTerminal,
  'mechanical-terminal': ModuleType.MechanicalTerminal,
  'industrial-terminal': ModuleType.IndustrialTerminal,
  'navigation-terminal': ModuleType.NavigationTerminal,
  'comms-terminal': ModuleType.CommsTerminal,
  'medical-terminal': ModuleType.MedicalTerminal,
  'research-terminal': ModuleType.ResearchTerminal,
  'logistics-terminal': ModuleType.LogisticsTerminal,
  'fleet-command-terminal': ModuleType.FleetCommandTerminal,
  'traffic-control-terminal': ModuleType.TrafficControlTerminal,
  'resource-management-terminal': ModuleType.ResourceManagementTerminal,
  'power-management-terminal': ModuleType.PowerManagementTerminal,
  'life-support-terminal': ModuleType.LifeSupportTerminal,
  'atmosphere-control-terminal': ModuleType.AtmosphereControlTerminal,
  'ai-core-terminal': ModuleType.AiCoreTerminal,
  'emergency-control-terminal': ModuleType.EmergencyControlTerminal,
  'records-terminal': ModuleType.RecordsTerminal,
  bed: ModuleType.Bed,
  bunk: ModuleType.Bunk,
  'guest-cabin': ModuleType.GuestCabin,
  locker: ModuleType.Locker,
  table: ModuleType.Table,
  'community-table': ModuleType.CommunityTable,
  'serving-station': ModuleType.ServingStation,
  'serving-line': ModuleType.ServingLine,
  fridge: ModuleType.Fridge,
  'cold-store': ModuleType.ColdStore,
  'prep-counter': ModuleType.PrepCounter,
  stove: ModuleType.Stove,
  'tray-return': ModuleType.TrayReturn,
  dishwasher: ModuleType.Dishwasher,
  'grow-station': ModuleType.GrowStation,
  toilet: ModuleType.Toilet,
  shower: ModuleType.Shower,
  sink: ModuleType.Sink,
  'wash-bank': ModuleType.WashBank,
  'floor-drain': ModuleType.FloorDrain,
  'water-valve': ModuleType.WaterValve,
  'wall-light': ModuleType.WallLight,
  couch: ModuleType.Couch,
  'game-station': ModuleType.GameStation,
  'market-stall': ModuleType.MarketStall,
  'checkout-bank': ModuleType.CheckoutBank,
  'shelf-aisle': ModuleType.ShelfAisle,
  'backroom-stock-bank': ModuleType.BackroomStockBank,
  'arrival-desk': ModuleType.ArrivalDesk,
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
  'fuel-tank': ModuleType.FuelTank,
  'fuel-pump': ModuleType.FuelPump,
  'pod-dock': ModuleType.PodDock,
  'fuel-coupler': ModuleType.FuelCoupler,
  'freight-locker': ModuleType.FreightLocker,
  'maintenance-socket': ModuleType.MaintenanceSocket,
  'berth-control': ModuleType.BerthControl,
  'docking-clamp': ModuleType.DockingClamp,
  'security-camera': ModuleType.SecurityCamera,
  'access-gate': ModuleType.AccessGate,
  'fire-extinguisher': ModuleType.FireExtinguisher,
  vent: ModuleType.Vent,
  'insulation-panel': ModuleType.InsulationPanel,
  'vending-machine': ModuleType.VendingMachine,
  bench: ModuleType.Bench,
  'bar-counter': ModuleType.BarCounter,
  tap: ModuleType.Tap,
  'service-bar': ModuleType.ServiceBar,
  'bar-corner': ModuleType.BarCorner,
  'bar-end': ModuleType.BarEnd,
  'booth-bank': ModuleType.BoothBank,
  'standing-rail': ModuleType.StandingRail,
  telescope: ModuleType.Telescope,
  'water-fountain': ModuleType.WaterFountain,
  plant: ModuleType.Plant,
  'reactor-core': ModuleType.ReactorCore,
  'solar-panel': ModuleType.SolarPanel,
  clear: ModuleType.None,
};

const MODULE_PALETTE_ICON_MAX_W = 46;
const MODULE_PALETTE_ICON_MAX_H = 34;
const MODULE_PALETTE_FALLBACK_LABEL: Record<ModuleType, string> = {
  [ModuleType.None]: '',
  [ModuleType.CaptainConsole]: 'CP',
  [ModuleType.SanitationTerminal]: 'SN',
  [ModuleType.SecurityTerminal]: 'SC',
  [ModuleType.MechanicalTerminal]: 'MC',
  [ModuleType.IndustrialTerminal]: 'IN',
  [ModuleType.NavigationTerminal]: 'NV',
  [ModuleType.CommsTerminal]: 'CM',
  [ModuleType.MedicalTerminal]: 'MD',
  [ModuleType.ResearchTerminal]: 'RS',
  [ModuleType.LogisticsTerminal]: 'LG',
  [ModuleType.FleetCommandTerminal]: 'FL',
  [ModuleType.TrafficControlTerminal]: 'TR',
  [ModuleType.ResourceManagementTerminal]: 'RM',
  [ModuleType.PowerManagementTerminal]: 'PW',
  [ModuleType.LifeSupportTerminal]: 'LS',
  [ModuleType.AtmosphereControlTerminal]: 'AT',
  [ModuleType.AiCoreTerminal]: 'AI',
  [ModuleType.EmergencyControlTerminal]: 'EM',
  [ModuleType.RecordsTerminal]: 'RC',
  [ModuleType.WallLight]: 'LT',
  [ModuleType.Bed]: 'BD',
  [ModuleType.Bunk]: 'BK',
  [ModuleType.Locker]: 'LK',
  [ModuleType.Table]: 'TB',
  [ModuleType.ServingStation]: 'SV',
  [ModuleType.Fridge]: 'FR',
  [ModuleType.ColdStore]: 'CS',
  [ModuleType.PrepCounter]: 'PR',
  [ModuleType.Stove]: 'ST',
  [ModuleType.TrayReturn]: 'TR',
  [ModuleType.Dishwasher]: 'DW',
  [ModuleType.Workbench]: 'WB',
  [ModuleType.MedBed]: 'MD',
  [ModuleType.CellConsole]: 'CL',
  [ModuleType.RecUnit]: 'RC',
  [ModuleType.GrowStation]: 'GR',
  [ModuleType.Terminal]: 'TM',
  [ModuleType.Couch]: 'CH',
  [ModuleType.GameStation]: 'GM',
  [ModuleType.Toilet]: 'WC',
  [ModuleType.Shower]: 'SH',
  [ModuleType.Sink]: 'SK',
  [ModuleType.FloorDrain]: 'DR',
  [ModuleType.WaterValve]: 'WV',
  [ModuleType.MarketStall]: 'MK',
  [ModuleType.CheckoutBank]: 'CB',
  [ModuleType.ShelfAisle]: 'SA',
  [ModuleType.BunkBank]: 'BB',
  [ModuleType.BackroomStockBank]: 'SB',
  [ModuleType.ServiceBar]: 'BAR',
  [ModuleType.BarCorner]: 'BC',
  [ModuleType.BarEnd]: 'BE',
  [ModuleType.BoothBank]: 'BO',
  [ModuleType.StandingRail]: 'SR',
  [ModuleType.ServingLine]: 'SL',
  [ModuleType.CommunityTable]: 'CT',
  [ModuleType.GuestCabin]: 'GC',
  [ModuleType.ArrivalDesk]: 'AD',
  [ModuleType.WashBank]: 'WB',
  [ModuleType.IntakePallet]: 'IN',
  [ModuleType.StorageRack]: 'SR',
  [ModuleType.Gangway]: 'GW',
  [ModuleType.CustomsCounter]: 'CC',
  [ModuleType.CargoArm]: 'CA',
  [ModuleType.FuelTank]: 'FT',
  [ModuleType.FuelPump]: 'FP',
  [ModuleType.PodDock]: 'PD',
  [ModuleType.FuelCoupler]: 'FC',
  [ModuleType.FreightLocker]: 'FL',
  [ModuleType.MaintenanceSocket]: 'MS',
  [ModuleType.BerthControl]: 'BC',
  [ModuleType.DockingClamp]: 'DC',
  [ModuleType.SecurityCamera]: 'CM',
  [ModuleType.AccessGate]: 'GT',
  [ModuleType.FireExtinguisher]: 'FX',
  [ModuleType.Vent]: 'VT',
  [ModuleType.InsulationPanel]: 'IP',
  [ModuleType.VendingMachine]: 'VM',
  [ModuleType.Bench]: 'BN',
  [ModuleType.BarCounter]: 'BC',
  [ModuleType.Tap]: 'TP',
  [ModuleType.Telescope]: 'TE',
  [ModuleType.WaterFountain]: 'WF',
  [ModuleType.Plant]: 'PL',
  [ModuleType.ReactorCore]: 'RX',
  [ModuleType.SolarPanel]: 'SP'
};

function applyModulePaletteFallback(btn: HTMLButtonElement, spriteEl: HTMLElement, module: ModuleType): void {
  btn.classList.remove('sprite-missing');
  btn.classList.add('sprite-fallback');
  spriteEl.removeAttribute('style');
  spriteEl.textContent = MODULE_PALETTE_FALLBACK_LABEL[module] || '?';
}

// --- OPEN-03: recipe-oriented build catalog --------------------------------
//
// The three opening businesses rendered as recipes, with every step wired to
// the ordinary paint or place tool it corresponds to. Deliberately not a
// prefab builder: the buttons below select a tool, they never construct.

const RECIPE_ROOM_TOOL_KEY = new Map<RoomType, string>(
  Object.entries(TOOLBAR_ROOM_MAP).map(([key, room]) => [room, key] as const)
);
const RECIPE_MODULE_TOOL_KEY = new Map<ModuleType, string>(
  Object.entries(TOOLBAR_MODULE_MAP).map(([key, module]) => [module, key] as const)
);

function recipeStepAttributes(step: RecipeStepProgress): string {
  if (step.kind === 'room' && step.room !== undefined) {
    const key = RECIPE_ROOM_TOOL_KEY.get(step.room);
    return key ? ` data-tool-room="${key}"` : '';
  }
  if (step.kind === 'module' && step.module !== undefined) {
    const key = RECIPE_MODULE_TOOL_KEY.get(step.module);
    return key ? ` data-tool-module="${key}"` : '';
  }
  if (step.kind === 'utility') return ' data-tool-utility-underlay="fuel-pipe"';
  return step.stockKind ? ` data-recipe-stock-kind="${step.stockKind}"` : ' data-recipe-stock="1"';
}

function recipeStepDetail(recipeId: string, step: RecipeStepProgress): string {
  const have = Math.min(step.have, step.count);
  const remaining = Math.max(0, step.count - have);
  const progress = `${have}/${step.count}`;

  if (step.satisfied) return `${progress} · ready`;

  if (step.kind === 'stock') {
    if (recipeId === 'feed-travelers') return `${progress} ready servings · meals + clean trays`;
    return `${progress} stocked · ${step.costCredits}c to order`;
  }

  if (step.costCredits > 0) {
    const perUnitCost = Math.round(step.costCredits / Math.max(1, step.count));
    return `${progress} · ${remaining} more · ${remaining * perUnitCost}c`;
  }

  if (step.kind === 'utility') return `${progress} · draw the connection`;
  return `${progress} · ${remaining} more`;
}

function shouldShowCapitalProjects(): boolean {
  // Existing active projects must never become inaccessible after this UI
  // hierarchy change. Otherwise, projects first appear only after the player
  // has made one opening business operational.
  return state.openingEconomy.capitalProjects.active.length > 0 ||
    evaluateOpeningRecipes(state).some((recipe) => recipe.built);
}

function recipeOperationalLabel(recipe: ReturnType<typeof evaluateOpeningRecipes>[number]): string {
  if (recipe.operational) return 'operational';
  if (recipe.built) {
    return recipe.steps.some((step) => step.kind === 'stock' && !step.satisfied)
      ? 'built · needs stock'
      : 'built · needs utilities';
  }
  return `${recipe.remainingCostCredits}c remaining`;
}

function recipeMachineReadout(recipe: ReturnType<typeof evaluateOpeningRecipes>[number]): string {
  const step = (module: ModuleType) => recipe.steps.find((candidate) => candidate.module === module);
  const stock = recipe.steps.find((candidate) => candidate.kind === 'stock');
  const count = (module: ModuleType) => `${Math.min(step(module)?.have ?? 0, step(module)?.count ?? 0)}/${step(module)?.count ?? 0}`;
  const ready = `${Math.min(stock?.have ?? 0, stock?.count ?? 0)}/${stock?.count ?? 0}`;
  if (recipe.id === 'feed-travelers') {
    const tables = Math.min(step(ModuleType.Table)?.have ?? 0, step(ModuleType.Table)?.count ?? 0);
    const access = recipe.candidateAccess === 'restricted' ? 'CREW MESS CANDIDATE · ' : '';
    return `${access}${count(ModuleType.ServingStation)} counters · ${tables * 4}/8 seats · ${count(ModuleType.TrayReturn)} tray return · ${ready} ready servings`;
  }
  if (recipe.id === 'sell-supplies') {
    return `${count(ModuleType.CheckoutBank)} checkout bank · ${count(ModuleType.ShelfAisle)} shelf aisle · ${ready} goods on shelves`;
  }
  return `${count(ModuleType.FuelCoupler)} coupler · ${count(ModuleType.FuelTank)} tank · ${ready} fuel · pipe ${recipe.steps.find((candidate) => candidate.kind === 'utility')?.satisfied ? 'live' : 'open'}`;
}

function recipeNextControl(recipe: ReturnType<typeof evaluateOpeningRecipes>[number]): string {
  const roomReady = recipe.steps.find((step) => step.kind === 'room')?.satisfied ?? true;
  if (
    roomReady &&
    !recipe.operational &&
    recipe.operationalReasons.some((reason) => reason.includes('PUBLIC'))
  ) {
    return '<button class="tool-btn recipe-step recipe-action" data-tool-zone="public" title="Paint Public access over the whole guest-facing cluster">Paint Public access <span>zone the whole cluster</span></button>';
  }
  const next = recipe.steps.find((step) => !step.satisfied);
  if (next) {
    return `<button class="tool-btn recipe-step recipe-action"${recipeStepAttributes(next)} title="${escapeHtml(next.label)}">${escapeHtml(next.label)} <span>${escapeHtml(recipeStepDetail(recipe.id, next))}</span></button>`;
  }
  return '';
}

/**
 * Signature of the last rendered catalog. refreshToolbar runs every frame, and
 * replacing the list's innerHTML that often detached each step button between
 * pointerdown and click — the click then landed on a node that was no longer
 * inside #toolbar, so the delegated handler never saw it and the step appeared
 * to do nothing. Re-render only when something actually changed.
 */
let renderedRecipeSignature = '';
let selectedOpeningRecipeId = 'feed-travelers';

function refreshOpeningRecipeCatalog(force = false): void {
  const host = document.querySelector<HTMLElement>('#opening-recipe-list');
  if (!host) return;
  const demand = getPodDemandSummary(state, null);
  const recipes = evaluateOpeningRecipes(state);
  const recentCapturedSales = (recipeId: typeof recipes[number]['id']): number =>
    state.openingEconomy.ledger.recent.filter((event) => {
      if (event.at < state.now - 120) return false;
      if (recipeId === 'feed-travelers') {
        return event.kind === 'retail-sale' && event.label === 'Prepared meal sold';
      }
      if (recipeId === 'sell-supplies') {
        return event.kind === 'retail-sale' && event.label === 'Travel supplies sold';
      }
      return event.kind === 'fuel-sale' || event.kind === 'repair-service';
    }).length;
  if (!recipes.some((recipe) => recipe.id === selectedOpeningRecipeId)) {
    selectedOpeningRecipeId = recipes[0]?.id ?? 'feed-travelers';
  }
  const signature = JSON.stringify([
    selectedOpeningRecipeId,
    recipes.map((recipe) => [
      recipe.remainingCostCredits,
      recipe.affordable,
      recipe.built,
      recipe.operational,
      recipe.operationalReasons,
      recipe.steps.map((step) => step.have)
    ]),
    demand.rows.map((row) => [row.served, row.wanted, row.missedCredits]),
    recipes.map((recipe) => recentCapturedSales(recipe.id))
  ]);
  if (signature === renderedRecipeSignature) return;
  // Demand can change while the player is deciding which step to click. Keep
  // the current nodes stable under the pointer and catch up on the next 125ms
  // refresh after it leaves the catalog.
  if (!force && host.matches(':hover')) return;
  renderedRecipeSignature = signature;
  const presented = recipes.map((recipe) => {
      const demandRow = demand.rows.find((row) =>
        (recipe.id === 'feed-travelers' && row.family === 'food') ||
        (recipe.id === 'sell-supplies' && row.family === 'supplies') ||
        (recipe.id === 'service-ships' && row.family === 'shipService')
      );
      // Recent demand is the whole reason to pick one of these over another,
      // so it sits in the heading rather than behind a metrics panel.
      const demandNote = demandRow && demandRow.wanted > 0
        ? `${demandRow.served}/${demandRow.wanted} served recently${demandRow.missedCredits > 0 ? ` · est. ${demandRow.missedCredits}c missed` : ''}`
        : recentCapturedSales(recipe.id) > 0
          ? `${recentCapturedSales(recipe.id)} sale${recentCapturedSales(recipe.id) === 1 ? '' : 's'} this visit · report pending`
          : 'no demand seen yet';
      const status = recipe.operational
        ? 'Live now.'
        : recipe.operationalReasons[0] ?? 'Finish the remaining build steps.';
      return { recipe, demandNote, status };
    });
  const selected = presented.find(({ recipe }) => recipe.id === selectedOpeningRecipeId) ?? presented[0];
  host.innerHTML = `
    <div class="recipe-choice-grid" aria-label="Opening business choices">
      ${presented.map(({ recipe, demandNote }) => `
        <button class="recipe-choice${recipe.id === selected?.recipe.id ? ' selected' : ''}${recipe.operational ? ' operational' : ''}"
          type="button" data-recipe-select="${escapeHtml(recipe.id)}"
          aria-pressed="${recipe.id === selected?.recipe.id ? 'true' : 'false'}">
          <span class="recipe-choice-name">${escapeHtml(recipe.title)}</span>
          <strong class="${recipe.affordable ? '' : 'recipe-card-unaffordable'}">${escapeHtml(recipeOperationalLabel(recipe))}</strong>
          <small>${escapeHtml(demandNote)}</small>
        </button>`).join('')}
    </div>
    ${selected ? `
      <div class="recipe-card recipe-detail${selected.recipe.built ? ' recipe-card-done' : ''}${selected.recipe.operational ? ' recipe-card-operational' : ''}">
          <div class="recipe-card-head">
            <span class="recipe-card-title">${escapeHtml(selected.recipe.title)}</span>
            <span class="recipe-card-cost${selected.recipe.affordable ? '' : ' recipe-card-unaffordable'}">${
              recipeOperationalLabel(selected.recipe)
            }</span>
          </div>
          <small class="recipe-card-summary">${escapeHtml(selected.recipe.summary)}</small>
          <small class="recipe-card-machine">${escapeHtml(recipeMachineReadout(selected.recipe))}</small>
          <small class="recipe-card-status">${escapeHtml(selected.status)}</small>
          ${selected.recipe.operational ? '' : `<div class="recipe-action-row">${recipeNextControl(selected.recipe)}</div>`}
          <small class="recipe-card-note">Staff: ${escapeHtml(selected.recipe.staffing)}</small>
          <small class="recipe-card-note">Utilities: ${escapeHtml(selected.recipe.utilities)}</small>
          <small class="recipe-card-note">${escapeHtml(selected.recipe.economics)}</small>
      </div>` : ''}`;

  const futureHost = document.querySelector<HTMLElement>('#future-facility-list');
  if (futureHost && futureHost.childElementCount === 0) {
    futureHost.innerHTML = futureFacilities()
      .map((facility) => `
        <div class="recipe-future-row">
          <span class="recipe-future-title">${escapeHtml(facility.title)}</span>
          <small>${escapeHtml(facility.prerequisite)}</small>
        </div>`)
      .join('');
  }
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
  if (tool.kind === 'utility-underlay') return 'structure';
  if (tool.kind === 'structural-piece') return 'structure';
  if (tool.kind === 'room') return 'rooms';
  if (tool.kind === 'module' || tool.kind === 'move-module') return 'modules';
  if (tool.kind === 'hire-staff') return 'crew';
  if (tool.kind === 'zone') return 'overlays';
  return 'structure';
}

function toolPaletteKey(tool: BuildTool): string {
  if (tool.kind === 'tile') return `tile:${tool.tile}`;
  if (tool.kind === 'room') return `room:${tool.room}`;
  if (tool.kind === 'copy-room') return 'copy-room';
  if (tool.kind === 'paste-room') return 'paste-room';
  if (tool.kind === 'module') return `module:${tool.module}`;
  if (tool.kind === 'structural-piece') return `structural-piece:${tool.structuralPiece}`;
  if (tool.kind === 'move-module') return `move-module:${tool.moveSourceModuleId ?? 'select'}`;
  if (tool.kind === 'utility-underlay') return `utility:${tool.utilityKind}:${tool.utilityErase ? 'erase' : 'draw'}`;
  if (tool.kind === 'zone') return `zone:${tool.zone}`;
  if (tool.kind === 'cancel-construction') return 'cancel-construction';
  if (tool.kind === 'hire-staff') return `hire-staff:${tool.staffRole}`;
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
  if (section === 'crew') refreshCrewPanel();
}

function refreshPaletteMenu(): void {
  // `none` means inspect mode. It is not a request to reopen Build; returning
  // here preserves the player's selected palette tab and keeps the opening
  // Businesses view visible on a fresh charter.
  if (currentTool.kind === 'none') {
    lastPaletteToolKey = 'none';
    return;
  }
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
  const toolbar = document.querySelector<HTMLElement>('#toolbar')!;
  const handleCrewButtonAction = (event: Event): void => {
    const btn = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
    if (!btn || !toolbar.contains(btn)) return;
    const hireRole = btn.dataset.hireRole as StaffRole | undefined;
    const fireRole = btn.dataset.fireRole as StaffRole | undefined;
    if (!hireRole && !fireRole) return;
    if (btn.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    if (hireRole) {
      selectHireStaffTool(hireRole);
    } else if (fireRole) {
      const ok = fireStaffRole(state, fireRole);
      const label = STAFF_ROLE_DEFINITIONS[fireRole].label;
      currentTool = { kind: 'none' };
      crewPanelStatusEl.textContent = ok ? `Fired ${label}.` : `Cannot fire ${label}.`;
      refreshCrewPanel();
      refreshToolbar();
      setPaletteSection('crew');
    }
  };
  toolbar.addEventListener('pointerdown', handleCrewButtonAction, true);
  // OPEN-03: recipe steps are rendered after this wiring runs, so they get a
  // delegated listener of their own. They select the ordinary tool through the
  // same helpers the catalog buttons use — a step is a shortcut to a tool, not
  // a second way to build.
  document.querySelector('#opening-recipe-list')?.addEventListener('click', (event) => {
    const choice = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-recipe-select]');
    if (choice?.dataset.recipeSelect) {
      selectedOpeningRecipeId = choice.dataset.recipeSelect;
      renderedRecipeSignature = '';
      refreshOpeningRecipeCatalog(true);
      return;
    }
    const step = (event.target as HTMLElement).closest<HTMLButtonElement>('.recipe-step');
    if (!step) return;
    const roomKey = step.dataset.toolRoom;
    const moduleKey = step.dataset.toolModule;
    const utilityKey = step.dataset.toolUtilityUnderlay;
    const zoneKey = step.dataset.toolZone;
    const stockKind = step.dataset.recipeStockKind;
    if (stockKind === 'prepared-meals') {
      const result = buyPreparedMealsDetailed(state);
      currentTool = { kind: 'none' };
      toolLockMessage = result.message;
      refreshOpeningEconomyPanels();
      refreshToolbar();
      return;
    } else if (stockKind === 'travel-supplies') {
      // Supplies are purchased from their pricing-and-stock panel, not from a
      // generic recipe action that could accidentally issue another commodity.
      // Anchored on the shop's own fixture once one is built, so the recipe
      // step and a click on the shelves land on the same surface.
      currentTool = { kind: 'none' };
      toolLockMessage = 'Travel Supplies Shop opened. Review the pod order before buying stock.';
      openMarketSurface(firstMarketFixtureTile());
      return;
    } else if (stockKind === 'fuel') {
      const result = orderFuelDetailed(state);
      currentTool = { kind: 'none' };
      toolLockMessage = result.message;
      refreshOpeningEconomyPanels();
      refreshToolbar();
      return;
    } else if (roomKey && TOOLBAR_ROOM_MAP[roomKey] !== undefined) {
      selectRoomTool(TOOLBAR_ROOM_MAP[roomKey]);
    } else if (moduleKey && TOOLBAR_MODULE_MAP[moduleKey] !== undefined) {
      selectModuleTool(TOOLBAR_MODULE_MAP[moduleKey]);
    } else if (utilityKey && TOOLBAR_UTILITY_UNDERLAY_MAP[utilityKey] !== undefined) {
      selectUtilityUnderlayTool(TOOLBAR_UTILITY_UNDERLAY_MAP[utilityKey]);
    } else if (zoneKey && TOOLBAR_ZONE_MAP[zoneKey] !== undefined) {
      currentTool = { kind: 'zone', zone: TOOLBAR_ZONE_MAP[zoneKey] };
      toolLockMessage = '';
    }
    // The palette follows the selection to the section that owns the tool, so
    // the player also learns where that tool lives for next time.
    refreshToolbar();
  });
  document.querySelectorAll<HTMLButtonElement>('#toolbar .tool-btn:not(.recipe-step)').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tileKey = btn.dataset.toolTile;
      const zoneKey = btn.dataset.toolZone;
      const roomKey = btn.dataset.toolRoom;
      const roomCopyKey = btn.dataset.toolRoomCopy;
      const roomPasteKey = btn.dataset.toolRoomPaste;
      const moduleKey = btn.dataset.toolModule;
      const structuralPieceKey = btn.dataset.toolStructuralPiece as PlaceableStructuralPieceKind | undefined;
      const moduleMoveKey = btn.dataset.toolModuleMove;
      const utilityUnderlayKey = btn.dataset.toolUtilityUnderlay;
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
      } else if (moduleMoveKey) {
        selectModuleMoveTool();
      } else if (moduleKey) {
        const module = TOOLBAR_MODULE_MAP[moduleKey];
        if (module !== undefined) selectModuleTool(module);
      } else if (structuralPieceKey === 'junction' || structuralPieceKey === 'reinforced-bulkhead') {
        selectStructuralPieceTool(structuralPieceKey);
      } else if (utilityUnderlayKey) {
        if (utilityUnderlayKey === 'erase') {
          selectUtilityUnderlayTool('air-duct', true);
        } else {
          const utilityKind = TOOLBAR_UTILITY_UNDERLAY_MAP[utilityUnderlayKey];
          if (utilityKind !== undefined && isUtilityUnderlayKind(utilityKind)) {
            selectUtilityUnderlayTool(utilityKind);
          }
        }
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
  refreshOpeningRecipeCatalog();
  refreshPaletteMenu();
  // Global Goals are the player-facing progression spine. The legacy tier
  // ladder remains an internal unlock mechanism until its capabilities are
  // fully folded into concrete goals and catalog prerequisites; revealing it
  // here would give the player two competing answers to "what next?".
  openProgressionSummaryBtn.classList.add('hidden');
  openProgressionModalBtn.classList.add('hidden');
  openCapitalProjectsBtn.classList.toggle('hidden', !shouldShowCapitalProjects());
  const hasBerth = state.rooms.includes(RoomType.Berth);
  document.querySelectorAll<HTMLElement>('[data-berth-hardware]').forEach((element) => {
    element.classList.toggle('hidden', !hasBerth);
  });
  const toolKind = currentTool.kind;
  gameWrap.classList.toggle('inspect-mode', toolKind === 'none');
  gameWrap.classList.toggle('build-mode', toolKind !== 'none');
  document.querySelectorAll<HTMLButtonElement>('#toolbar .tool-btn').forEach((btn) => {
    const tileKey = btn.dataset.toolTile;
    const zoneKey = btn.dataset.toolZone;
    const roomKey = btn.dataset.toolRoom;
    const roomCopyKey = btn.dataset.toolRoomCopy;
    const roomPasteKey = btn.dataset.toolRoomPaste;
    const moduleKey = btn.dataset.toolModule;
    const structuralPieceKey = btn.dataset.toolStructuralPiece as PlaceableStructuralPieceKind | undefined;
    const moduleMoveKey = btn.dataset.toolModuleMove;
    const utilityUnderlayKey = btn.dataset.toolUtilityUnderlay;
    const diagnosticOverlayKey = btn.dataset.diagnosticOverlay;
    const cancelConstructionKey = btn.dataset.toolCancelConstruction;
    const deselectKey = btn.dataset.toolDeselect;
    let active = false;
    let locked = false;
    let lockedTitle = '';
    if (deselectKey) {
      active = toolKind === 'none';
    } else if (tileKey && toolKind === 'tile') {
      active = TOOLBAR_TILE_MAP[tileKey] === currentTool.tile;
    } else if (zoneKey && toolKind === 'zone') {
      const z = TOOLBAR_ZONE_MAP[zoneKey];
      active = z !== undefined && z === currentTool.zone;
    } else if (isDiagnosticOverlay(diagnosticOverlayKey)) {
      active = state.controls.diagnosticOverlay === diagnosticOverlayKey;
      if (diagnosticOverlayKey === 'sanitation') {
        btn.title = `Sanitation Department: ${departmentStatusText('sanitation')}`;
      }
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
    } else if (moduleMoveKey) {
      active = toolKind === 'move-module';
    } else if (structuralPieceKey) {
      active = toolKind === 'structural-piece' && currentTool.structuralPiece === structuralPieceKey;
    } else if (roomKey) {
      const room = TOOLBAR_ROOM_MAP[roomKey];
      if (room !== undefined) {
        if (toolKind === 'room' && currentTool.room === room) active = true;
        if (!starterLayoutEditorMode && !isRoomUnlocked(state, room)) {
          locked = true;
          lockedTitle = roomLockedMessage(room);
        }
      }
    } else if (moduleKey) {
      const module = TOOLBAR_MODULE_MAP[moduleKey];
      if (module !== undefined && module !== ModuleType.None) {
        if (toolKind === 'module' && currentTool.module === module) active = true;
        if (!starterLayoutEditorMode && !isModuleUnlocked(state, module)) {
          locked = true;
          lockedTitle = moduleLockedMessage(module);
        }
      } else if (module === ModuleType.None) {
        // Clear-module button is always available + active when currentTool is module:None
        if (toolKind === 'module' && currentTool.module === ModuleType.None) active = true;
      }
    } else if (utilityUnderlayKey) {
      if (utilityUnderlayKey === 'erase') {
        active = toolKind === 'utility-underlay' && currentTool.utilityErase === true;
      } else {
        const utilityKind = TOOLBAR_UTILITY_UNDERLAY_MAP[utilityUnderlayKey];
        active =
          utilityKind !== undefined &&
          toolKind === 'utility-underlay' &&
          currentTool.utilityKind === utilityKind &&
          currentTool.utilityErase !== true;
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

function selectIncident(incidentId: number): boolean {
  const incident = state.incidents.find((entry) => entry.id === incidentId);
  if (!incident) return false;
  selectedIncidentId = incident.id;
  selectedAgent = null;
  selectedDockId = null;
  selectedRoomTile = null;
  setSelectedInterface(null);
  selectedBerthAnchor = null;
  agentModal.classList.add('hidden');
  dockModal.classList.add('hidden');
  roomModal.classList.add('hidden');
  refreshAgentSidePanel();
  refreshSelectionSummary();
  refreshIncidentList();
  return true;
}

function focusIncident(incidentId: number): void {
  const incident = state.incidents.find((entry) => entry.id === incidentId);
  if (!incident) return;
  selectIncident(incidentId);
  const tileIndex = incidentTileForFocus(incident);
  const tile = fromIndex(tileIndex, state.width);
  centerViewportOnWorldPx((tile.x + 0.5) * TILE_SIZE, (tile.y + 0.5) * TILE_SIZE);
  hoveredTile = tileIndex;
  refreshIncidentList();
}

function centerViewportOnMapCenter(): void {
  centerViewportOnWorldPx(state.width * TILE_SIZE * 0.5, state.height * TILE_SIZE * 0.5);
}

const FACILITY_SHOWCASE_CAMERA_BOUNDS: Record<string, { minX: number; minY: number; maxX: number; maxY: number }> = {
  'market-compact-conflict': { minX: 40, minY: 47, maxX: 60, maxY: 60 },
  'market-improved-flow': { minX: 40, minY: 47, maxX: 60, maxY: 60 },
  'cantina-undersized': { minX: 40, minY: 47, maxX: 58, maxY: 60 },
  'cantina-expanded': { minX: 40, minY: 47, maxX: 60, maxY: 62 },
  'reception-absent': { minX: 40, minY: 47, maxX: 60, maxY: 60 },
  'reception-staffed': { minX: 40, minY: 47, maxX: 60, maxY: 60 },
  'long-stay-guest-wing': { minX: 40, minY: 47, maxX: 88, maxY: 70 }
};

function scenarioCameraBounds(): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const scenarioName = new URLSearchParams(location.search).get('scenario');
  return scenarioName ? FACILITY_SHOWCASE_CAMERA_BOUNDS[scenarioName] ?? null : null;
}

function getStationBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
  // Facility scenarios intentionally coexist with the starter shell so their
  // authored comparisons do not destroy shared baseline state. In those
  // whitelisted showcases, Fit Station means the deliberate playtest stage;
  // the full map remains pannable, but screenshots no longer zoom out around
  // unrelated starter geometry.
  const showcaseBounds = scenarioCameraBounds();
  if (showcaseBounds) return showcaseBounds;

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

function writeSaveStore(store: SaveStore, allowAutosaveEviction = false): boolean {
  const serialized = JSON.stringify(store);
  try {
    localStorage.setItem(SAVE_STORE_KEY, serialized);
    return true;
  } catch (initialError) {
    if (allowAutosaveEviction) {
      try {
        localStorage.removeItem(AUTOSAVE_KEY);
        localStorage.setItem(SAVE_STORE_KEY, serialized);
        autosaveStatusEl.classList.add('hidden');
        return true;
      } catch {
        // Report the original write error below. The autosave is expendable
        // when the player is explicitly saving the same live station.
      }
    }
    const reason = initialError instanceof Error ? ` (${initialError.name})` : '';
    setSaveStatus(`Save storage is full or unavailable${reason}. Delete or download an old save and try again.`, 'error');
    return false;
  }
}

function trimSaveStore(saves: LocalSaveRecord[], protectedSaveId?: string): { saves: LocalSaveRecord[]; removed: number } {
  const ranked = [...saves].sort((a, b) => {
    if (a.id === protectedSaveId && b.id !== protectedSaveId) return -1;
    if (a.id !== protectedSaveId && b.id === protectedSaveId) return 1;
    if (a.id === QUICKSAVE_ID && b.id !== QUICKSAVE_ID) return -1;
    if (a.id !== QUICKSAVE_ID && b.id === QUICKSAVE_ID) return 1;
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
  const kept: LocalSaveRecord[] = [];
  for (const save of ranked) {
    if (kept.length >= MAX_SAVE_SLOTS) continue;
    const candidate = [...kept, save];
    const candidateChars = JSON.stringify({ storeVersion: 1, saves: candidate }).length;
    if (candidateChars <= MAX_SAVE_STORE_CHARS || save.id === protectedSaveId) {
      kept.push(save);
    }
  }
  return {
    saves: kept,
    removed: saves.length - kept.length
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
  refreshPriorityUi();
  refreshTransportUi();
}

function clearUiSelectionsAfterLoad(): void {
  selectedDockId = null;
  selectedRoomTile = null;
  selectedAgent = null;
  selectedIncidentId = null;
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

function itemNodeTotals(nodes: StationState['itemNodes'], item: ItemType): { stock: number; capacity: number; free: number } {
  const stock = nodes.reduce((sum, node) => sum + Math.max(0, node.items[item] ?? 0), 0);
  const capacity = nodes.reduce((sum, node) => sum + node.capacity, 0);
  const used = nodes.reduce(
    (sum, node) => sum + Object.values(node.items).reduce((nodeSum, amount) => nodeSum + Math.max(0, amount ?? 0), 0),
    0
  );
  return { stock, capacity, free: Math.max(0, capacity - used) };
}

function podDockServiceLabel(kind: 'passenger' | 'refuel' | 'freight' | 'repair', freightDirection?: 'import' | 'export'): string {
  if (kind === 'passenger') return 'Passenger visit';
  if (kind === 'refuel') return 'Refuel';
  if (kind === 'repair') return 'Minor repair';
  return freightDirection === 'import' ? 'Freight import' : freightDirection === 'export' ? 'Freight export' : 'Freight exchange';
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
  const moduleBacked = dock.sourceKind === 'pod-dock-module';
  dockModalTitleEl.textContent = moduleBacked ? 'Pod Dock' : 'Dock Config';
  dockModalAreaLabelEl.textContent = moduleBacked ? 'Hull Mount' : 'Zone Area';
  dockModalSizeLabelEl.textContent = moduleBacked ? 'Craft Class' : 'Max Size';
  dockModalInspectionEl.classList.toggle('hidden', !moduleBacked);
  dockModalRoutingEl.classList.toggle('hidden', moduleBacked);
  dockModalDiagnosisEl.classList.toggle('hidden', !moduleBacked);
  if (moduleBacked) {
    // Tell the renderer which interface the player is reading, so the problem
    // this panel names is also framed in the world instead of only in prose.
    setSelectedInterface({ kind: 'dock', dockId: dock.id });
    renderInterfaceDiagnosis(dockModalDiagnosisEl, deriveInterfaceDiagnosis(state, { kind: 'dock', dockId: dock.id }));
    const capabilities = ['Passenger access', ...(dock.podCapabilities ?? []).map((capability) =>
      capability === 'fuel' ? 'Fuel' : capability === 'freight' ? 'Freight' : 'Maintenance'
    )];
    dockModalCapabilitiesEl.innerHTML = capabilities
      .map((capability) => `<span class="port-status-chip ok">${escapeHtml(capability)}</span>`)
      .join('');
    const craft = state.arrivingShips.find((ship) => ship.assignedDockId === dock.id && ship.stage !== 'depart') ?? null;
    const visit = craft?.smallCraftVisit;
    const motives = visit?.services.map((service) => podDockServiceLabel(service.kind, service.freightDirection)).join(' + ') ?? 'awaiting traffic';
    dockModalCraftEl.textContent = craft
      ? `${craft.portManifest?.callsign ?? `POD ${craft.id}`} · ${craft.passengersTotal} guest${craft.passengersTotal === 1 ? '' : 's'} · ${motives}`
      : `Ready · ${motives}`;
    dockModalServicesEl.innerHTML = visit
      ? visit.services.map((service) => {
          const status = service.status.toUpperCase();
          const progress = `${Math.round(clamp(service.progress, 0, 1) * 100)}%`;
          const reward = `+${service.creditsEarned}c · +${service.ratingDelta.toFixed(2)} rating`;
          return `<div class="port-service-row ${service.status}"><span>${escapeHtml(podDockServiceLabel(service.kind, service.freightDirection))}</span><b>${status} · ${progress}</b><small>${reward}</small></div>`;
        }).join('')
      : '<div class="port-service-row idle"><span>No craft services queued</span><b>READY</b></div>';
    const materialNodes = state.itemNodes.filter((node) =>
      state.rooms[node.tileIndex] === RoomType.Storage || state.rooms[node.tileIndex] === RoomType.LogisticsStock
    );
    const materials = itemNodeTotals(materialNodes, 'rawMaterial');
    const stock: string[] = [];
    if (dock.podCapabilities?.includes('fuel')) {
      const fuel = getPodDockFuelSupplyView(state, dock.id);
      stock.push(fuel.connected
        ? `Fuel network ${Math.floor(fuel.stock)}/${Math.floor(fuel.capacity)} · ${fuel.tankCount} tank${fuel.tankCount === 1 ? '' : 's'} · ${fuel.pipeTiles} pipe tiles`
        : fuel.reason ?? 'Fuel network disconnected');
    }
    if (dock.podCapabilities?.includes('freight') || dock.podCapabilities?.includes('maintenance')) {
      stock.push(`Materials ${Math.floor(materials.stock)} available · ${Math.floor(materials.free)} free`);
    }
    dockModalStockEl.textContent = stock.length > 0 ? `Stock: ${stock.join(' | ')}` : 'Stock: no attached service consumes station stock.';
    const blocked = visit?.services.find((service) => service.status === 'blocked' && service.blockedReason)?.blockedReason ?? null;
    dockModalBlockerEl.textContent = blocked ? `Action: ${blocked}` : 'No active service blocker.';
    dockModalBlockerEl.classList.toggle('clear', blocked === null);
  }
  if (!isShipTypeUnlocked(state, 'industrial')) {
    dockModalErrorEl.textContent = `Facing status: ok | Industrial locked until Tier ${ROOM_UNLOCK_TIER[RoomType.Workshop]}`;
    dockModalErrorEl.style.color = '#ffcf6e';
  }
  if (!isShipTypeUnlocked(state, 'military') || !isShipTypeUnlocked(state, 'colonist')) {
    dockModalErrorEl.textContent = 'Facing status: ok | Military/Colonist unlock at Tier 3';
    dockModalErrorEl.style.color = '#ffcf6e';
  }
}

let commercialPanelNotice = '';
let commercialCloseArmedUnitId: number | null = null;

function commercialBusinessLabel(kind: CommercialOffer['kind']): string {
  switch (kind) {
    case 'market-stall': return 'Market Stall';
    case 'cantina': return 'Cantina';
    case 'restaurant': return 'Restaurant';
    case 'gift-shop': return 'Gift Shop';
  }
}

function commercialBusinessMark(kind: CommercialOffer['kind']): string {
  switch (kind) {
    case 'market-stall': return 'MK';
    case 'cantina': return 'BAR';
    case 'restaurant': return 'DIN';
    case 'gift-shop': return 'GFT';
  }
}

function commercialOfferPlanHtml(unit: CommercialUnit, offer: CommercialOffer): string {
  const points = unit.tiles.map((tile) => fromIndex(tile, state.width));
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const columns = Math.max(1, maxX - minX + 1);
  const rows = Math.max(1, maxY - minY + 1);
  const shell = new Set(unit.tiles);
  const fixtures = new Map(offer.fixtures.map((fixture) => [fixture.originTile, fixture.module]));
  const cells: string[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const tile = toIndex(x, y, state.width);
      if (!shell.has(tile)) {
        cells.push('<i class="commercial-plan-cell void" aria-hidden="true"></i>');
        continue;
      }
      const fixture = fixtures.get(tile);
      if (!fixture) {
        cells.push('<i class="commercial-plan-cell floor" aria-hidden="true"></i>');
        continue;
      }
      const fixtureClass = fixture.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      cells.push(`<i class="commercial-plan-cell fixture fixture-${fixtureClass}" title="${escapeHtml(friendlyName(fixture))}"></i>`);
    }
  }
  return `<span class="commercial-floorplan" style="--commercial-plan-cols:${columns};--commercial-plan-rows:${rows}" aria-label="${escapeHtml(commercialBusinessLabel(offer.kind))} fixture plan">${cells.join('')}</span>`;
}

function commercialOfferCardHtml(unit: CommercialUnit, offer: CommercialOffer): string {
  const selected = unit.previewOfferId === offer.id;
  return `
    <article class="commercial-offer-card kind-${offer.kind}${selected ? ' selected' : ''}" data-commercial-offer="${offer.id}">
      <button class="commercial-offer-preview" type="button" data-commercial-action="preview" data-commercial-offer-id="${offer.id}" aria-pressed="${selected}" title="Preview ${escapeHtml(offer.brandName)} in the station">
        ${commercialOfferPlanHtml(unit, offer)}
        <span class="commercial-offer-copy">
          <span class="commercial-offer-title"><span class="commercial-business-mark">${commercialBusinessMark(offer.kind)}</span><span><strong>${escapeHtml(offer.brandName)}</strong><small>${escapeHtml(commercialBusinessLabel(offer.kind))} · ${escapeHtml(offer.tenantName)}</small></span></span>
          <span class="commercial-offer-concept">${escapeHtml(offer.concept)}</span>
          <span class="commercial-offer-terms">
            <b>${offer.baseRentPerCycle}c rent</b>
            <b>${Math.round(offer.revenueShare * 100)}% share</b>
            <b>${offer.suppliedStaff} staff</b>
            <b>~${offer.expectedCustomersPerCycle} guests</b>
          </span>
          <span class="commercial-offer-stock">${escapeHtml(offer.stockPolicy)} · ${offer.fixtures.length} fixtures · ${Math.ceil(offer.fitoutDurationSec)}s fit-out</span>
        </span>
      </button>
      <button class="commercial-offer-accept" type="button" data-commercial-action="accept" data-commercial-offer-id="${offer.id}">Sign lease</button>
    </article>`;
}

function commercialUnitStockText(unit: CommercialUnit): string {
  const moduleIds = new Set(unit.fittedModuleIds);
  const moduleTiles = new Set(
    state.moduleInstances
      .filter((module) => moduleIds.has(module.id))
      .map((module) => module.originTile)
  );
  const nodes = state.itemNodes.filter((node) => moduleTiles.has(node.tileIndex));
  if (nodes.length === 0) return unit.selectedOffer?.stockPolicy ?? 'Tenant supplied';
  const used = nodes.reduce(
    (total, node) => total + Object.values(node.items).reduce((sum, amount) => sum + (amount ?? 0), 0),
    0
  );
  const capacity = nodes.reduce((total, node) => total + node.capacity, 0);
  const stock = new Map<string, number>();
  for (const node of nodes) {
    for (const [item, amount] of Object.entries(node.items)) {
      if ((amount ?? 0) > 0.01) stock.set(item, (stock.get(item) ?? 0) + (amount ?? 0));
    }
  }
  const contents = [...stock.entries()].map(([item, amount]) => `${friendlyName(item)} ${Math.floor(amount)}`).join(' · ');
  return `${Math.floor(used)}/${Math.floor(capacity)} stocked${contents ? ` · ${contents}` : ''}`;
}

function refreshCommercialLeasePanel(room: RoomType, clusterSize: number): void {
  if (selectedRoomTile === null) return;
  const unit = getCommercialUnitAt(state, selectedRoomTile);
  if (!unit && room !== RoomType.CommercialUnit) {
    roomModalCommercialEl.classList.add('hidden');
    roomModalCommercialEl.innerHTML = '';
    return;
  }
  roomModalCommercialEl.classList.remove('hidden');
  if (!unit) {
    roomModalCommercialEl.innerHTML = `
      <div class="commercial-lease-head"><span><small>Commercial Unit</small><strong>Vacant shell</strong></span><span class="commercial-phase vacant">Available</span></div>
      <p class="commercial-lease-intro">Invite local operators to propose a complete business and fixture layout for this ${clusterSize}-tile shell.</p>
      <div class="commercial-shell-brief"><span><b>${clusterSize}</b> floor tiles</span><span><b>3</b> competing proposals</span><span><b>Tenant</b> staffs and stocks</span></div>
      <button class="commercial-primary-action" type="button" data-commercial-action="seek">Seek tenant proposals</button>
      ${commercialPanelNotice ? `<small class="commercial-panel-notice">${escapeHtml(commercialPanelNotice)}</small>` : ''}`;
    return;
  }
  const phaseLabel = unit.phase === 'fitting-out' ? 'Fitting out' : friendlyName(unit.phase);
  const head = `<div class="commercial-lease-head"><span><small>Commercial Unit ${unit.id}</small><strong>${escapeHtml(unit.selectedOffer?.brandName ?? 'Tenant proposals')}</strong></span><span class="commercial-phase ${unit.phase}">${escapeHtml(phaseLabel)}</span></div>`;
  if (unit.phase === 'offers') {
    roomModalCommercialEl.innerHTML = `${head}
      <div class="commercial-proposal-toolbar"><span><strong>${unit.offers.length} operators applied</strong><small>Point at a plan to preview its fixtures in the shell.</small></span><button type="button" data-commercial-action="reroll" title="Invite a new set of applicants">New applicants</button></div>
      <div class="commercial-offer-deck">${unit.offers.map((offer) => commercialOfferCardHtml(unit, offer)).join('')}</div>
      ${commercialPanelNotice ? `<small class="commercial-panel-notice">${escapeHtml(commercialPanelNotice)}</small>` : ''}`;
    return;
  }
  if (unit.phase === 'vacant') {
    roomModalCommercialEl.innerHTML = `${head}
      <p class="commercial-lease-intro">This shell is ready for another operator. Tenant proposals include their own fixture plan, staff, and stock policy.</p>
      <button class="commercial-primary-action" type="button" data-commercial-action="seek">Seek tenant proposals</button>
      ${commercialPanelNotice ? `<small class="commercial-panel-notice">${escapeHtml(commercialPanelNotice)}</small>` : ''}`;
    return;
  }
  const offer = unit.selectedOffer;
  if (!offer) {
    roomModalCommercialEl.innerHTML = `${head}<p class="commercial-panel-notice warn">${escapeHtml(unit.statusReason)}</p><button type="button" data-commercial-action="close">Return to vacant shell</button>`;
    return;
  }
  const fixtureTotal = Math.max(1, offer.fixtures.length);
  const fitoutPct = unit.phase === 'open'
    ? 100
    : Math.round(clamp(unit.installedFixtureCount / fixtureTotal, 0, 1) * 100);
  const remaining = unit.phase === 'fitting-out' && unit.fitoutCompleteAt !== null
    ? `${Math.max(0, Math.ceil(unit.fitoutCompleteAt - state.now))}s remaining`
    : unit.statusReason;
  const closeArmed = commercialCloseArmedUnitId === unit.id;
  roomModalCommercialEl.innerHTML = `${head}
    <div class="commercial-tenant-hero kind-${offer.kind}">
      ${commercialOfferPlanHtml(unit, offer)}
      <span><small>${escapeHtml(commercialBusinessLabel(offer.kind))} · ${escapeHtml(offer.tenantName)}</small><strong>${escapeHtml(offer.concept)}</strong><em>${escapeHtml(unit.statusReason)}</em></span>
    </div>
    <div class="commercial-tenant-metrics">
      <span><small>Lease</small><strong>${offer.baseRentPerCycle}c + ${Math.round(offer.revenueShare * 100)}%</strong></span>
      <span><small>Tenant staff</small><strong>${unit.tenantStaffTiles.length || offer.suppliedStaff}</strong></span>
      <span><small>Customers</small><strong>${unit.currentCustomers} here · ${unit.customersServed} served</strong></span>
      <span><small>Stock</small><strong>${escapeHtml(commercialUnitStockText(unit))}</strong></span>
      <span><small>Collected</small><strong>${Math.floor(unit.rentCollected + unit.revenueShareCollected)}c</strong></span>
    </div>
    <div class="commercial-fitout-status">
      <span><strong>${unit.phase === 'fitting-out' ? 'Tenant renovation' : 'Fixture plan'}</strong><small>${unit.installedFixtureCount}/${offer.fixtures.length} fixtures · ${escapeHtml(remaining)}</small></span>
      <span class="commercial-fitout-track"><i style="width:${fitoutPct}%"></i></span>
    </div>
    <div class="commercial-lease-actions"><button class="commercial-close-action${closeArmed ? ' armed' : ''}" type="button" data-commercial-action="close">${closeArmed ? 'Confirm closure' : unit.phase === 'closed' ? 'Clear failed fit-out' : 'End lease'}</button></div>
    ${commercialPanelNotice ? `<small class="commercial-panel-notice${closeArmed ? ' warn' : ''}">${escapeHtml(commercialPanelNotice)}</small>` : ''}`;
}

function refreshRoomModal(): void {
  if (selectedRoomTile === null) return;
  nextRoomModalRefreshAt = performance.now() + ROOM_MODAL_REFRESH_INTERVAL_MS;
  let inspector = getRoomInspectorAt(state, selectedRoomTile);
  if (!inspector) {
    const selectedCommercialUnit = getCommercialUnitAt(state, selectedRoomTile);
    const fallbackTile = selectedCommercialUnit?.tiles.find((tile) => getRoomInspectorAt(state, tile) !== null);
    if (fallbackTile !== undefined) {
      selectedRoomTile = fallbackTile;
      inspector = getRoomInspectorAt(state, fallbackTile);
    }
  }
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
  const commercialUnit = getCommercialUnitAt(state, selectedRoomTile);
  const commercialMode = inspector.room === RoomType.CommercialUnit &&
    (!commercialUnit || commercialUnit.phase === 'vacant' || commercialUnit.phase === 'offers' || commercialUnit.phase === 'closed');
  roomModalCardEl.classList.toggle('commercial-room-mode', commercialMode);
  refreshCommercialLeasePanel(inspector.room, inspector.clusterSize);
  if (inspector.workplace) {
    const workplace = inspector.workplace;
    const roles = workplace.eligibleRoles.map((role) => STAFF_ROLE_DEFINITIONS[role].label).join(' or ');
    const assigned = workplace.assignedCrew.length > 0
      ? workplace.assignedCrew.map((crew) => crew.name).join(', ')
      : 'none';
    const active = workplace.activeCrew.length > 0
      ? workplace.activeCrew.map((crew) => crew.name).join(', ')
      : 'none';
    roomModalWorkplaceEl.classList.remove('hidden');
    roomModalWorkplaceNameEl.textContent = workplace.label;
    roomModalWorkplaceRolesEl.textContent = `${workplace.positions} positions · ${roles}`;
    const tenantManaged = workplace.tenantManaged;
    roomModalWorkplaceStatusEl.textContent = tenantManaged
      ? workplace.tenantStaff > 0
        ? `Tenant staff: ${workplace.tenantStaff} · station crew not required`
        : `Tenant fit-out: ${workplace.tenantStaffExpected} staff arrive when open`
      : `Home crew: ${assigned} · on post: ${active}`;
    roomModalPlanWorkplaceBtn.classList.toggle('hidden', tenantManaged);
    roomModalSurgeWorkplaceBtn.classList.toggle('hidden', tenantManaged);
    roomModalPlanWorkplaceBtn.dataset.workplaceAnchor = String(workplace.anchorTile);
    const surgeable = workplace.assignedCrew.filter((assignedCrew) => {
      const crew = state.crewMembers.find((candidate) => candidate.id === assignedCrew.id);
      return crew ? getCrewWatchStatus(state, crew) !== 'on-duty' : false;
    }).length;
    roomModalSurgeWorkplaceBtn.dataset.workplaceAnchor = String(workplace.anchorTile);
    roomModalSurgeWorkplaceBtn.disabled = surgeable <= 0;
    roomModalSurgeWorkplaceBtn.textContent = surgeable > 0 ? `Surge ${surgeable}` : 'Surge';
    roomModalSurgeWorkplaceBtn.title = surgeable > 0
      ? `Recall ${surgeable} assigned crew for 45 seconds; costs energy and morale`
      : 'No off-duty or reserve home crew to recall';
  } else {
    roomModalWorkplaceEl.classList.add('hidden');
    roomModalPlanWorkplaceBtn.classList.remove('hidden');
    roomModalSurgeWorkplaceBtn.classList.remove('hidden');
    roomModalPlanWorkplaceBtn.removeAttribute('data-workplace-anchor');
    roomModalSurgeWorkplaceBtn.removeAttribute('data-workplace-anchor');
  }
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
    const itemOrder: Array<{ key: 'rawMeal' | 'preppedMeal' | 'meal' | 'cleanTray' | 'dirtyTray' | 'drink' | 'rawMaterial' | 'tradeGood' | 'body'; label: string }> = [
      { key: 'rawMeal', label: 'rawMeal' },
      { key: 'preppedMeal', label: 'prepped' },
      { key: 'meal', label: 'meal' },
      { key: 'cleanTray', label: 'clean trays' },
      { key: 'dirtyTray', label: 'dirty trays' },
      { key: 'drink', label: 'drinks' },
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
      `Capacity: seats ${load.tableNodes * 4} | queue nodes ${load.queueNodes} | waiting ${load.queueingVisitors} | eating ${load.eatingVisitors} | service staff ${load.serviceStaff}${load.tenantStaff > 0 ? ` (${load.tenantStaff} tenant)` : ''} | high-patience wait ${load.highPatienceWaiting} | pressure ${load.pressure}`;
    roomModalCapacityEl.style.color =
      load.pressure === 'high' ? '#ff7676' : load.pressure === 'medium' ? '#ffcf6e' : '#8ea2bd';
  } else if (inspector.room === RoomType.Cantina && inspector.cantinaLoad) {
    const load = inspector.cantinaLoad;
    roomModalCapacityEl.textContent =
      `Capacity: pickup ${load.pickupSlots} | line ${load.lineVisitors} | ordering ${load.orderingVisitors} | seats ${load.seatsUsed}/${load.seatsCapacity} | waiting for seat ${load.waitingForSeat} | stewards ${load.stewardCount} | taps ${load.taps} | pressure ${load.pressure}`;
    roomModalCapacityEl.style.color =
      load.unstaffed || load.pressure === 'high' ? '#ff7676' : load.pressure === 'medium' ? '#ffcf6e' : '#8ea2bd';
  } else {
    roomModalCapacityEl.textContent = 'Capacity: n/a';
    roomModalCapacityEl.style.color = '#8ea2bd';
  }
  const reputationAtRoom = selectedRoomTile !== null
    ? getReputationTileDiagnostic(state, selectedRoomTile % state.width, Math.floor(selectedRoomTile / state.width))
    : null;
  if (reputationAtRoom?.zone) {
    const zone = reputationAtRoom.zone;
    roomModalReputationEl.textContent =
      `Reputation: ${zone.label} | prestige ${zone.prestige.toFixed(0)} | notoriety ${zone.notoriety.toFixed(0)} | control ${zone.control.toFixed(0)} | ` +
      `value ${zone.value.toFixed(0)} | opacity ${zone.opacity.toFixed(0)} | crime ${zone.crimePressure.toFixed(0)} | ${zone.topDrivers.join(' | ')}`;
    roomModalReputationEl.style.color = zone.crimePressure >= 65 ? '#ff7676' : zone.prestige >= 55 ? '#6edb8f' : zone.notoriety >= 55 ? '#ffcf6e' : '#8ea2bd';
  } else {
    roomModalReputationEl.textContent = 'Reputation: n/a';
    roomModalReputationEl.style.color = '#8ea2bd';
  }
  const housingRoom = inspector.room === RoomType.Dorm || inspector.room === RoomType.Hygiene;
  if (housingRoom) {
    roomModalHousingPolicyEl.textContent = inspector.housingPolicy ?? 'crew';
    roomModalHousingSelect.disabled = false;
    roomModalHousingSelect.value = inspector.housingPolicy ?? 'crew';
    roomModalHousingSelect.style.display = 'block';
    const housing = getHousingInspectorAt(state, selectedRoomTile!);
    if (housing) {
      // Opening ticket 11: report slots against demand and name the fixtures
      // behind them, so the inspector matches both the artwork and the alert.
      roomModalHousingEl.textContent =
        `Housing: ${housing.bedsAssigned}/${housing.bedsTotal} sleep slots assigned ` +
        `across ${housing.bedModuleCount} fixture${housing.bedModuleCount === 1 ? '' : 's'} | ` +
        `hygiene targets ${housing.hygieneTargets} | ` +
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
      const facility = berth.facility;
      const geometry = facility.geometry === 'u-shaped'
        ? 'Three-sided bay ready'
        : facility.geometry === 'legacy-rectangular'
          ? 'Legacy adapter'
          : 'Incomplete geometry';
      const capabilityText = facility.capabilities.length > 0 ? facility.capabilities.join(', ') : 'none installed';
      const readinessReason = facility.reasons[0] ??
        (!facility.legacyCompatibility && facility.clampCapacity < 2
          ? `needs ${2 - facility.clampCapacity} more clamp${facility.clampCapacity === 1 ? '' : 's'} for medium ships`
          : facility.clampCapacity < 5
            ? `needs ${5 - facility.clampCapacity} more clamps for large ships`
            : 'no physical berth blocker');
      roomModalBerthReadinessEl.classList.remove('hidden');
      roomModalBerthReadinessRowsEl.innerHTML = [
        ['Geometry', geometry, facility.geometryValid ? 'ok' : 'warn'],
        ['Control', facility.controlModuleId === null ? 'Missing' : 'Installed', facility.controlModuleId === null ? 'warn' : 'ok'],
        ['Clamps', `${facility.clampCapacity} installed · medium 2 / large 5`, facility.clampCapacity >= 2 ? 'ok' : 'warn'],
        ['Access', facility.capabilities.includes('gangway') ? 'Gangway installed' : 'No gangway', facility.capabilities.includes('gangway') ? 'ok' : 'warn'],
        ['Capabilities', capabilityText, facility.capabilities.length > 0 ? 'ok' : 'warn']
      ].map(([label, value, tone]) =>
        `<div class="port-readiness-row"><small>${label}</small><strong class="${tone}">${escapeHtml(value)}</strong></div>`
      ).join('');
      roomModalBerthReadinessReasonEl.textContent = `First action: ${readinessReason}`;
      roomModalBerthReadinessReasonEl.classList.toggle('clear', readinessReason === 'no physical berth blocker');
      setSelectedInterface({ kind: 'berth', anchorTile: berth.anchorTile });
      renderInterfaceDiagnosis(
        roomModalBerthDiagnosisEl,
        deriveInterfaceDiagnosis(state, { kind: 'berth', anchorTile: berth.anchorTile })
      );
      const caps = berth.capabilities.length > 0 ? berth.capabilities.join(', ') : 'none installed';
      const accepts = berth.acceptedShipTypes.length > 0 ? berth.acceptedShipTypes.join(', ') : 'none yet — install capability modules';
      const exposure = berth.spaceExposed ? 'open to space' : 'sealed inside - expose one edge to space';
      const rejects = berth.rejectedShipTypes
        .map((r) => `${r.shipType} (needs ${r.missing.join('+')})`)
        .join(' | ');
      const occ = berth.occupiedByShipId !== null ? ` | occupied by ship #${berth.occupiedByShipId}` : ' | empty';
      roomModalBerthEl.textContent =
        `Berth: ${berth.serviceGrade} service ${Math.round(berth.serviceScore)}/100 (${berth.serviceVisits} visits, ${berth.serviceLastDelta >= 0 ? '+' : ''}${berth.serviceLastDelta.toFixed(0)} last) · ×${berth.servicePayoutMultiplier.toFixed(2)} contract yield | size ${berth.size} (${berth.clusterTiles.length} tiles) | ${exposure}${occ} | capabilities: ${caps} | accepts: ${accepts}` +
        (rejects ? ` | rejects: ${rejects}` : '');
      roomModalBerthEl.style.color = berth.spaceExposed && berth.acceptedShipTypes.length > 0 ? '#6edb8f' : '#ffcf6e';
      // Dock-modal parity: per-berth allowlists (allowed ship types +
      // sizes) on top of the capability-tag gate. Purpose + facing are
      // info-only (purpose hardcoded 'visitor' in v0; facing derived
      // from cluster opening) — see BerthInspector docs in sim.ts.
      selectedBerthAnchor = berth.anchorTile;
      roomModalBerthConfigEl.classList.remove('hidden');
      roomModalBerthPurposeEl.textContent = berth.purpose === 'visitor' ? 'Visitor' : 'Residential';
      roomModalBerthFacingEl.textContent = berth.derivedFacing
        ? berth.derivedFacing[0].toUpperCase() + berth.derivedFacing.slice(1)
        : 'sealed (no exterior opening)';
      roomModalBerthScreeningSelect.value = berth.screeningLevel;
      roomModalBerthCustomsSelect.value = berth.customsPolicy;
      const berthTypes = new Set(berth.allowedShipTypes);
      roomModalBerthTouristCheckbox.checked = berthTypes.has('tourist');
      roomModalBerthTraderCheckbox.checked = berthTypes.has('trader');
      roomModalBerthIndustrialCheckbox.checked = berthTypes.has('industrial');
      roomModalBerthMilitaryCheckbox.checked = berthTypes.has('military');
      roomModalBerthColonistCheckbox.checked = berthTypes.has('colonist');
      roomModalBerthIndustrialCheckbox.disabled = !isShipTypeUnlocked(state, 'industrial');
      roomModalBerthMilitaryCheckbox.disabled = !isShipTypeUnlocked(state, 'military');
      roomModalBerthColonistCheckbox.disabled = !isShipTypeUnlocked(state, 'colonist');
      const berthSizes = new Set(berth.allowedShipSizes);
      roomModalBerthSmallCheckbox.checked = berthSizes.has('small');
      roomModalBerthMediumCheckbox.checked = berthSizes.has('medium');
      roomModalBerthLargeCheckbox.checked = berthSizes.has('large');
      // Cap size checkboxes against the cluster's max-size class — a
      // 4-tile berth is 'small', so 'medium' and 'large' aren't
      // physically reachable at this cluster size and the checkbox
      // disables to mirror the dock-modal max-size gating.
      roomModalBerthMediumCheckbox.disabled = berth.size === 'small';
      roomModalBerthLargeCheckbox.disabled = berth.size !== 'large';
    } else {
      roomModalBerthEl.textContent = 'Berth: cluster too small or not detected';
      roomModalBerthEl.style.color = '#ff7676';
      setSelectedInterface(null);
      selectedBerthAnchor = null;
      roomModalBerthReadinessEl.classList.add('hidden');
      roomModalBerthDiagnosisEl.classList.add('hidden');
      roomModalBerthConfigEl.classList.add('hidden');
    }
  } else {
    roomModalBerthEl.textContent = 'Berth: n/a';
    roomModalBerthEl.style.color = '#8ea2bd';
    setSelectedInterface(null);
    selectedBerthAnchor = null;
    roomModalBerthReadinessEl.classList.add('hidden');
    roomModalBerthDiagnosisEl.classList.add('hidden');
    roomModalBerthConfigEl.classList.add('hidden');
  }
  roomModalReasonsEl.textContent = `Inactive reasons: ${inspector.reasons.join(', ') || 'none'}`;
  roomModalWarningsEl.textContent = `Warnings: ${inspector.warnings.join(', ') || 'none'}`;
  roomModalHintsEl.textContent = `Hints: ${inspector.hints.join(' | ') || 'none'}`;
  const sanitation = inspector.sanitation;
  if (sanitation && sanitation.averageDirt >= 1) {
    roomModalSanitationEl.classList.remove('hidden');
    roomModalSanitationAvgEl.textContent = `${sanitation.averageDirt.toFixed(1)} (max ${sanitation.maxDirt.toFixed(1)})`;
    roomModalSanitationSourceEl.textContent =
      sanitation.dominantSource === 'none' ? 'none' : sanitation.dominantSource;
    roomModalSanitationEffectEl.textContent = `Effect: ${sanitation.effectSummary}`;
    roomModalSanitationFixEl.textContent = `Fix: ${sanitation.suggestedFix}`;
  } else {
    roomModalSanitationEl.classList.add('hidden');
  }
}

roomModalCommercialEl.addEventListener('pointerover', (event) => {
  if (selectedRoomTile === null || !(event.target instanceof Element)) return;
  const card = event.target.closest<HTMLElement>('[data-commercial-offer]');
  if (!card || !roomModalCommercialEl.contains(card)) return;
  const unit = getCommercialUnitAt(state, selectedRoomTile);
  const offerId = Number(card.dataset.commercialOffer);
  if (!unit || !Number.isFinite(offerId) || unit.previewOfferId === offerId) return;
  if (!previewCommercialOffer(state, unit.id, offerId)) return;
  roomModalCommercialEl.querySelectorAll<HTMLElement>('[data-commercial-offer]').forEach((candidate) => {
    const active = Number(candidate.dataset.commercialOffer) === offerId;
    candidate.classList.toggle('selected', active);
    candidate.querySelector<HTMLButtonElement>('.commercial-offer-preview')?.setAttribute('aria-pressed', String(active));
  });
});

roomModalCommercialEl.addEventListener('click', (event) => {
  if (selectedRoomTile === null || !(event.target instanceof Element)) return;
  const actionButton = event.target.closest<HTMLElement>('[data-commercial-action]');
  if (!actionButton || !roomModalCommercialEl.contains(actionButton)) return;
  const action = actionButton.dataset.commercialAction;
  const existingUnit = getCommercialUnitAt(state, selectedRoomTile);
  if (action === 'seek' || action === 'reroll') {
    const result = openCommercialUnitForOffers(state, selectedRoomTile);
    commercialPanelNotice = result.ok
      ? `${result.unit?.offers.length ?? 0} new proposals received.`
      : result.reason ?? 'No viable tenant proposals.';
    commercialCloseArmedUnitId = null;
  } else if (action === 'preview' && existingUnit) {
    const offerId = Number(actionButton.dataset.commercialOfferId);
    if (Number.isFinite(offerId)) previewCommercialOffer(state, existingUnit.id, offerId);
    commercialPanelNotice = '';
    commercialCloseArmedUnitId = null;
  } else if (action === 'accept' && existingUnit) {
    const offerId = Number(actionButton.dataset.commercialOfferId);
    const result = Number.isFinite(offerId)
      ? acceptCommercialOffer(state, existingUnit.id, offerId)
      : { ok: false, reason: 'Tenant offer is unavailable' };
    commercialPanelNotice = result.ok ? 'Lease signed. Tenant renovation has started.' : result.reason ?? 'Could not sign lease.';
    commercialCloseArmedUnitId = null;
  } else if (action === 'close' && existingUnit) {
    if (commercialCloseArmedUnitId !== existingUnit.id) {
      commercialCloseArmedUnitId = existingUnit.id;
      commercialPanelNotice = 'This removes tenant fixtures and returns the room to an empty commercial shell.';
      window.setTimeout(() => {
        if (commercialCloseArmedUnitId !== existingUnit.id) return;
        commercialCloseArmedUnitId = null;
        commercialPanelNotice = '';
        if (selectedRoomTile !== null && getCommercialUnitAt(state, selectedRoomTile)?.id === existingUnit.id) refreshRoomModal();
      }, 3500);
    } else {
      const result = closeCommercialUnit(state, existingUnit.id);
      commercialPanelNotice = result.ok ? 'Lease closed. The shell is available again.' : result.reason ?? 'Could not close lease.';
      commercialCloseArmedUnitId = null;
    }
  }
  refreshRoomModal();
  refreshSelectionSummary();
});

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

/**
 * Inverse of `toWorldCoords`: where a tile currently sits on screen.
 *
 * World-anchored HTML surfaces (the market shop panel, the per-berth ops
 * cards) are positioned in client pixels, so they need the same camera terms
 * `toWorldCoords` reads — scroll, zoom, and the padded stage offset — applied
 * the other way round. Returns the tile's centre and its on-screen size so a
 * caller can hang a card off the fixture's edge rather than its middle.
 */
function tileClientRect(tileIndex: number): { x: number; y: number; size: number } {
  const rect = gameWrap.getBoundingClientRect();
  const point = fromIndex(tileIndex, state.width);
  const size = TILE_SIZE * zoom;
  return {
    x: rect.left + (point.x + 0.5) * size + mapContentOffsetX() - gameWrap.scrollLeft,
    y: rect.top + (point.y + 0.5) * size + mapContentOffsetY() - gameWrap.scrollTop,
    size
  };
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
      `${inspector.name}: ${inspector.trait} ${inspector.archetype} | pref ${inspector.primaryPreference} | ` +
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
      `energy ${inspector.energy.toFixed(1)} | hunger ${inspector.hunger.toFixed(1)} | hygiene ${inspector.hygiene.toFixed(1)} | resting ${inspector.resting ? 'yes' : 'no'} | ` +
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

  // A stamp containing a Berth is a capital commitment, so prove the complete
  // tile-build + room-paint path against a clone before touching live state.
  // Ordinary stamps retain their existing best-effort paste behavior.
  const includesBerth = stampCells.some((cell) => cell.room === RoomType.Berth);
  if (includesBerth) {
    const preview = cloneStationStateForLayoutPreview(state);
    for (const cell of stampCells) {
      if (cell.tile === TileType.Space) continue;
      const x = originX + cell.dx;
      const y = originY + cell.dy;
      if (!inBounds(x, y, preview.width, preview.height)) {
        if (cell.room === RoomType.Berth) {
          toolLockMessage = 'Cannot paste berth: footprint runs off map.';
          return;
        }
        continue;
      }
      const idx = toIndex(x, y, preview.width);
      if (preview.tiles[idx] !== cell.tile) {
        removeModuleAtTile(preview, idx);
        const changed = trySetTileWithCredits(preview, idx, cell.tile);
        if (!changed.ok && cell.room === RoomType.Berth) {
          toolLockMessage = `Cannot paste berth: ${changed.reason}.`;
          return;
        }
        if (changed.ok) cancelConstructionAtTile(preview, idx);
      }
    }
    const previewSettings: PastedRoomSetting[] = [];
    for (const cell of stampCells) {
      if (cell.tile === TileType.Space) continue;
      const x = originX + cell.dx;
      const y = originY + cell.dy;
      if (!inBounds(x, y, preview.width, preview.height)) continue;
      const idx = toIndex(x, y, preview.width);
      if (preview.tiles[idx] === TileType.Space) {
        if (cell.room === RoomType.Berth) {
          toolLockMessage = 'Cannot paste berth: every berth cell needs built floor.';
          return;
        }
        continue;
      }
      if (!starterLayoutEditorMode && cell.room !== RoomType.None && !isRoomUnlocked(preview, cell.room)) {
        if (cell.room === RoomType.Berth) {
          toolLockMessage = roomLockedMessage(cell.room);
          return;
        }
        continue;
      }
      previewSettings.push({
        tileIndex: idx,
        room: cell.room,
        zone: cell.zone,
        housingPolicy: cell.housingPolicy
      });
    }
    const preflight = applyPastedRoomSettings(preview, previewSettings);
    if (!preflight.ok) {
      toolLockMessage = `Cannot paste berth: ${preflight.reason}.`;
      return;
    }
  }

  const roomSettings: PastedRoomSetting[] = [];
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
    if (!starterLayoutEditorMode && cell.room !== RoomType.None && !isRoomUnlocked(state, cell.room)) {
      firstFailure ||= roomLockedMessage(cell.room);
      skippedCells++;
      continue;
    }
    roomSettings.push({
      tileIndex: idx,
      room: cell.room,
      zone: cell.zone,
      housingPolicy: cell.housingPolicy
    });
  }
  const roomPaste = applyPastedRoomSettings(state, roomSettings);
  if (!roomPaste.ok) {
    toolLockMessage = `Cannot paste berth: ${roomPaste.reason}.`;
    return;
  }
  paintedCells = roomPaste.paintedCells;

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
    if (!starterLayoutEditorMode && module.type !== ModuleType.None && !isModuleUnlocked(state, module.type)) {
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
  if (currentTool.kind === 'hire-staff') {
    if (a.x !== b.x || a.y !== b.y) {
      crewPanelStatusEl.textContent = 'Click one station tile to place crew.';
      toolLockMessage = crewPanelStatusEl.textContent;
      return;
    }
    if (currentTool.staffRole) placeHiredStaffAt(currentTool.staffRole, toIndex(a.x, a.y, state.width));
    return;
  }
  if (currentTool.kind === 'structural-piece' && currentTool.structuralPiece) {
    if (a.x !== b.x || a.y !== b.y) {
      toolLockMessage = 'Place structural pieces one at a time.';
      return;
    }
    const planned = planStructuralPieceConstruction(
      state,
      toIndex(a.x, a.y, state.width),
      currentTool.structuralPiece,
      state.controls.moduleRotation
    );
    toolLockMessage = planned.ok
      ? `${currentTool.structuralPiece === 'junction' ? 'Junction' : 'Reinforced Bulkhead'} planned for delivery and EVA welding.`
      : planned.reason ?? 'Structural piece placement rejected.';
    return;
  }
  if (!starterLayoutEditorMode && currentTool.kind === 'room' && currentTool.room && currentTool.room !== RoomType.None && !isRoomUnlocked(state, currentTool.room)) {
    toolLockMessage = roomLockedMessage(currentTool.room);
    return;
  }
  if (!starterLayoutEditorMode && currentTool.kind === 'module' && currentTool.module && currentTool.module !== ModuleType.None && !isModuleUnlocked(state, currentTool.module)) {
    toolLockMessage = moduleLockedMessage(currentTool.module);
    return;
  }
  if (currentTool.kind === 'move-module') {
    if (a.x !== b.x || a.y !== b.y) {
      toolLockMessage = 'Move modules one at a time: click a module, then click its new location.';
      return;
    }
    const clickedTile = toIndex(a.x, a.y, state.width);
    const selectedId = currentTool.moveSourceModuleId;
    if (selectedId === undefined) {
      const moduleId = state.moduleOccupancyByTile[clickedTile];
      const module = moduleId === null ? undefined : state.moduleInstances.find((candidate) => candidate.id === moduleId);
      if (!module) {
        toolLockMessage = 'Select an installed module to move.';
        return;
      }
      currentTool = { kind: 'move-module', moveSourceModuleId: module.id, module: module.type };
      toolLockMessage = `Moving ${friendlyName(module.type)}. Choose its new location.`;
      return;
    }
    const selectedModule = state.moduleInstances.find((candidate) => candidate.id === selectedId);
    if (!selectedModule) {
      selectModuleMoveTool();
      toolLockMessage = 'That module no longer exists. Select another module.';
      return;
    }
    if (selectedModule.tiles.includes(clickedTile)) {
      selectModuleMoveTool();
      return;
    }
    const moved = tryMoveModule(state, selectedId, clickedTile);
    if (!moved.ok) {
      toolLockMessage = `Cannot move ${friendlyName(selectedModule.type)}: ${moved.reason ?? 'invalid destination'}.`;
      return;
    }
    toolLockMessage = `Moved ${friendlyName(selectedModule.type)} at no cost. Select another module to move.`;
    currentTool = { kind: 'move-module' };
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

  if (currentTool.kind === 'module' && currentTool.module === ModuleType.None) {
    const moduleIds = new Set<number>();
    for (const tile of paintTiles) {
      const moduleId = state.moduleOccupancyByTile[tile];
      if (moduleId !== null) moduleIds.add(moduleId);
    }
    let removed = 0;
    let refund = 0;
    let firstFailure = '';
    for (const moduleId of moduleIds) {
      const module = state.moduleInstances.find((candidate) => candidate.id === moduleId);
      if (!module) continue;
      const sold = sellModuleAtTile(state, module.originTile);
      if (sold.ok) {
        removed++;
        refund += sold.refund;
      } else if (!firstFailure) {
        firstFailure = sold.reason ?? 'could not remove module';
      }
    }
    if (removed > 0) {
      toolLockMessage = `Sold ${removed} module${removed === 1 ? '' : 's'} for ${refund} credits (${Math.round(MODULE_RESALE_REFUND_RATE * 100)}% resale).${firstFailure ? ` ${firstFailure}.` : ''}`;
    } else {
      toolLockMessage = firstFailure || 'No module here to sell.';
    }
    return;
  }

  if (currentTool.kind === 'utility-underlay') {
    const kind = currentTool.utilityKind ?? 'air-duct';
    let changed = 0;
    let blocked = 0;
    for (const idx of paintTiles) {
      let ok = false;
      if (currentTool.utilityErase) {
        const erasedAir = clearUtilityUnderlayAt(state, idx, 'air-duct');
        const erasedPower = clearUtilityUnderlayAt(state, idx, 'power-conduit');
        const erasedWater = clearUtilityUnderlayAt(state, idx, 'water-pipe');
        const erasedFuel = clearUtilityUnderlayAt(state, idx, 'fuel-pipe');
        ok = erasedAir || erasedPower || erasedWater || erasedFuel;
      } else {
        ok = canPlaceUtilityUnderlay(state, kind, idx) && setUtilityUnderlayTile(state, kind, idx, true);
      }
      if (ok) changed++;
      else if (!currentTool.utilityErase && !canPlaceUtilityUnderlay(state, kind, idx)) blocked++;
    }
    state.controls.diagnosticOverlay = 'utility-underlay';
    if (changed > 0) {
      const actionSummary = `${currentTool.utilityErase ? 'Erased' : 'Drew'} ${changed} ${currentTool.utilityErase ? 'utility' : kind} tile${changed === 1 ? '' : 's'}.`;
      if (kind === 'fuel-pipe' && !currentTool.utilityErase) {
        const fuel = getFuelPipeNetworkDiagnostics(state);
        const connectionSummary = fuel.poweredSinkCount > 0
          ? ` Fuel Coupler connected: ${fuel.poweredSinkCount} supplied.`
          : fuel.poweredNetworkCount <= 0
            ? ' Not connected yet: run the pipe beneath any tile of a Fuel Tank in a Maintenance room.'
            : ' Tank connected; continue the pipe to the highlighted interior socket behind the Fuel Coupler.';
        toolLockMessage = actionSummary + connectionSummary;
      } else {
        toolLockMessage = actionSummary;
      }
    } else if (blocked > 0) {
      toolLockMessage = `${kind} can only be drawn under walkable station tiles.`;
    }
    return;
  }

  if (currentTool.kind === 'tile') {
    if (
      STRUCTURAL_EXPANSION_ENABLED &&
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

  // A Berth is commissioned as one bay, not tile by tile: the whole footprint
  // is painted and its size-class capital price is paid once. Refused outright
  // when the station cannot cover it, so the floor is never half-painted
  // against a debt it cannot settle.
  if (currentTool.kind === 'room' && currentTool.room === RoomType.Berth) {
    const committed = commitBerthFootprint(state, paintTiles);
    if (!committed.ok) toolLockMessage = committed.reason ?? 'cannot commission this berth';
    return;
  }

  for (const idx of paintTiles) {
      if (currentTool.kind === 'tile') {
        const forceConstruction = STRUCTURAL_EXPANSION_ENABLED && currentTool.tile === TileType.Truss;
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
        if (currentTool.module !== ModuleType.None) {
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
    // Floating HUD cards live inside #game-wrap, so their wheel events bubble here.
    // Let scrollable controls consume the gesture instead of turning it into camera zoom.
    if (e.target instanceof Element && e.target.closest('.port-dispatch-card, .side-inspector-body, .ops-modal-card')) {
      return;
    }
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
    if (canOpenInspectors && singleClick && clickedTile !== null) {
      const incident = incidentAtTile(clickedTile);
      if (incident && selectIncident(incident.id)) {
        isPainting = false;
        paintStart = null;
        paintCurrent = null;
        return;
      }
      const world = toWorldCoords(e.clientX, e.clientY);
      if (world) {
        const agent = pickInspectableAgent(world.x, world.y, clickedTile);
        if (agent) {
          clearAlertDiagnosis();
          selectedAgent = agent;
          selectedDockId = null;
          selectedRoomTile = null;
          selectedIncidentId = null;
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
      clearAlertDiagnosis();
      // Market fixtures answer before the room they stand in does: clicking the
      // shelves is a request to work the shop, not to inspect the Market room.
      const marketFixture = marketFixtureOriginAtTile(clickedTile);
      if (marketFixture !== null) {
        selectedAgent = null;
        selectedDockId = null;
        selectedRoomTile = null;
        selectedIncidentId = null;
        agentModal.classList.add('hidden');
        dockModal.classList.add('hidden');
        roomModal.classList.add('hidden');
        openMarketSurface(marketFixture);
        isPainting = false;
        paintStart = null;
        paintCurrent = null;
        return;
      }
      const dock = getDockByTile(state, clickedTile);
      if (dock) {
        selectedDockId = dock.id;
        selectedRoomTile = null;
        selectedAgent = null;
        selectedIncidentId = null;
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
        selectedIncidentId = null;
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
      selectedIncidentId = null;
      agentModal.classList.add('hidden');
      agentSidePanel.classList.add('hidden');
      dockModal.classList.add('hidden');
      roomModal.classList.add('hidden');
    } else {
      selectedDockId = null;
      selectedRoomTile = null;
      selectedAgent = null;
      selectedIncidentId = null;
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
        requestSpriteAtlasLoad();
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
      e.preventDefault();
      if (e.repeat) break;
      if (starterLayoutEditorMode) break;
      state.controls.paused = !state.controls.paused;
      refreshTransportUi();
      break;
    case 'Escape':
      closePortDispatch();
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

buyPreparedMealsBtn.addEventListener('click', () => {
  // Opening ticket 10: the order now reports its own outcome instead of
  // failing silently behind an enabled button.
  const result = buyPreparedMealsDetailed(state);
  buyPreparedMealsBtn.classList.toggle('purchase-failed', !result.ok);
  buyPreparedMealsBtn.title = result.message;
  buyPreparedMealsBtn.setAttribute('aria-label', result.message);
  window.setTimeout(refreshPreparedMealPurchaseAffordance, 1200);
});

/**
 * Keeps the `+` button's enabled state and title honest between clicks: the
 * player should be able to read why an order cannot be accepted without
 * clicking it and watching nothing happen.
 */
function refreshPreparedMealPurchaseAffordance(): void {
  const preview = previewPreparedMealPurchase(state);
  buyPreparedMealsBtn.disabled = !preview.ok;
  buyPreparedMealsBtn.classList.remove('purchase-failed');
  buyPreparedMealsBtn.title = preview.ok
    ? `Buy ${preview.requestedAmount} prepared meals for ${preview.creditCost}c`
    : preview.message;
  buyPreparedMealsBtn.setAttribute('aria-label', buyPreparedMealsBtn.title);
}

portAutoToggleEl.addEventListener('click', () => {
  const next = !state.controls.portAutoAdmitEnabled;
  const changed = setPortAutoAdmit(state, next);
  trafficActionNoteEl.textContent = changed
    ? next
      ? 'Routine dispatch delegated. Berth filters are now standing orders.'
      : 'Manual manifest clearance restored.'
    : 'Complete three successful turnarounds before delegating dispatch.';
  trafficActionNoteEl.className = `traffic-action-note ${changed ? 'tone-ok' : 'tone-warn'}`;
  refreshTrafficStatus();
  refreshTrafficOffers();
  refreshSettlementSummary();
});

failureEpisodeListEl.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-recovery-action]');
  if (!button || button.disabled) return;
  const episodeId = Number(button.dataset.episodeId);
  const visitorId = Number(button.dataset.visitorId);
  const shipId = button.dataset.shipId === undefined ? undefined : Number(button.dataset.shipId);
  const kind = button.dataset.recoveryAction;
  if (!Number.isFinite(episodeId) || !Number.isFinite(visitorId) || !kind) return;
  const allowed = RECOVERY_ACTION_LABELS.some(([candidate]) => candidate === kind);
  if (!allowed) return;
  const result = applyRecoveryAction(state, {
    kind: kind as (typeof RECOVERY_ACTION_LABELS)[number][0],
    episodeId,
    visitorId,
    shipId: shipId !== undefined && Number.isFinite(shipId) ? shipId : undefined,
    amount: kind === 'emergency-meals' || kind === 'temporary-lodging' ? 1 : undefined
  });
  trafficActionNoteEl.textContent = result.ok ? result.summary : (result.reason ?? result.summary);
  trafficActionNoteEl.className = `traffic-action-note ${result.ok ? 'tone-ok' : 'tone-warn'}`;
  refreshTrafficOffers();
  refreshSettlementSummary();
});

admissionPolicyEnabledEl.addEventListener('change', () => {
  setAdmissionPolicy(state, { enabled: admissionPolicyEnabledEl.checked });
  trafficActionNoteEl.textContent = admissionPolicyEnabledEl.checked
    ? 'Finite admission enabled. Exceptional calls remain manual.'
    : 'Finite admission disabled. Every new call remains manual unless legacy auto-routing is enabled.';
  trafficActionNoteEl.className = 'traffic-action-note tone-ok';
  lastTrafficOfferRenderKey = '';
  refreshTrafficOffers();
});

admissionPodEnabledEl.addEventListener('change', () => {
  setAdmissionPolicy(state, { pod: { ...state.admissionPolicy.pod, enabled: admissionPodEnabledEl.checked } });
  lastTrafficOfferRenderKey = '';
  refreshTrafficOffers();
});

admissionBerthEnabledEl.addEventListener('change', () => {
  setAdmissionPolicy(state, { berth: { ...state.admissionPolicy.berth, enabled: admissionBerthEnabledEl.checked } });
  lastTrafficOfferRenderKey = '';
  refreshTrafficOffers();
});

admissionPolicyEditorEl.addEventListener('change', (event) => {
  const input = (event.target as HTMLElement).closest<HTMLInputElement>('input[data-admission-number]');
  if (!input) return;
  const value = Number(input.value);
  const key = input.dataset.admissionNumber;
  if (!Number.isFinite(value) || !key) return;
  if (key === 'reserveBeds') setAdmissionPolicy(state, { reserveBeds: value });
  else if (key === 'reserveMeals') setAdmissionPolicy(state, { reserveMeals: value });
  else if (key.startsWith('pod.')) {
    const field = key.slice(4);
    const pod = { ...state.admissionPolicy.pod };
    if (field === 'reserveFreeInterfaces') pod.reserveFreeInterfaces = value;
    else if (field === 'maxStaySeconds') pod.maxStaySeconds = value;
    else if (field === 'minMarginCredits') pod.minMarginCredits = value;
    setAdmissionPolicy(state, { pod });
  } else if (key.startsWith('berth.')) {
    const field = key.slice(6);
    const berth = { ...state.admissionPolicy.berth };
    if (field === 'reserveFreeInterfaces') berth.reserveFreeInterfaces = value;
    else if (field === 'maxStaySeconds') berth.maxStaySeconds = value;
    else if (field === 'minMarginCredits') berth.minMarginCredits = value;
    setAdmissionPolicy(state, { berth });
  }
  lastTrafficOfferRenderKey = '';
  refreshTrafficOffers();
});

admissionManualOverrideEl.addEventListener('click', () => {
  setAdmissionPolicy(state, { enabled: false });
  trafficActionNoteEl.textContent = 'Manual override restored for all new calls. Accept, Hold, and Pass remain available.';
  trafficActionNoteEl.className = 'traffic-action-note tone-ok';
  lastTrafficOfferRenderKey = '';
  refreshTrafficOffers();
});

approachPolicyEl.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-port-policy]');
  if (!button || button.disabled) return;
  const policy = button.dataset.portPolicy;
  if (policy !== 'cautious' && policy !== 'balanced' && policy !== 'open') return;
  setPortAutoAdmitPolicy(state, policy);
  const explanation = policy === 'cautious'
    ? 'Standing orders protect service: only ready, low-risk traffic clears automatically.'
    : policy === 'balanced'
      ? 'Standing orders accept low and guarded traffic that fits berth filters.'
      : 'Standing orders prioritize occupancy: every eligible traffic class may clear.';
  trafficActionNoteEl.textContent = explanation;
  trafficActionNoteEl.className = 'traffic-action-note tone-ok';
  refreshTrafficStatus();
  refreshTrafficOffers();
});

function projectTrafficOfferCard(card: HTMLElement | null): void {
  if (!card) {
    projectedTrafficOffer = null;
    return;
  }
  const offerId = Number(card.dataset.trafficOfferId);
  const slotId = card.dataset.offerSlotId;
  const hullVariant = card.dataset.offerHullVariant as ShipHullVariant | undefined;
  const size = card.dataset.offerSize as ShipSize | undefined;
  if (!Number.isFinite(offerId) || !slotId || !hullVariant || !size) {
    projectedTrafficOffer = null;
    return;
  }
  projectedTrafficOffer = { offerId, slotId, hullVariant, size };
}

trafficOfferListEl.addEventListener('mouseover', (event) => {
  projectTrafficOfferCard((event.target as HTMLElement).closest<HTMLElement>('[data-traffic-offer-id]'));
});

trafficOfferListEl.addEventListener('mouseout', (event) => {
  const card = (event.target as HTMLElement).closest<HTMLElement>('[data-traffic-offer-id]');
  if (card && event.relatedTarget instanceof Node && card.contains(event.relatedTarget)) return;
  projectTrafficOfferCard(null);
});

trafficOfferListEl.addEventListener('focusin', (event) => {
  projectTrafficOfferCard((event.target as HTMLElement).closest<HTMLElement>('[data-traffic-offer-id]'));
});

trafficOfferListEl.addEventListener('focusout', (event) => {
  const card = (event.target as HTMLElement).closest<HTMLElement>('[data-traffic-offer-id]');
  if (card && event.relatedTarget instanceof Node && card.contains(event.relatedTarget)) return;
  projectTrafficOfferCard(null);
});

trafficOfferListEl.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-traffic-action]');
  if (!button) return;
  const offerId = Number(button.dataset.offerId);
  if (!Number.isFinite(offerId)) return;
  const action = button.dataset.trafficAction;
  if (action === 'accept' || action === 'assign') {
    const berthAnchor = button.dataset.berthAnchor === undefined ? undefined : Number(button.dataset.berthAnchor);
    const result = admitTrafficOffer(state, offerId, berthAnchor !== undefined && Number.isFinite(berthAnchor) ? berthAnchor : undefined);
    trafficActionNoteEl.textContent = result.ok
      ? (result.reason ?? `Approach clearance transmitted.`)
      : (result.reason ?? 'Unable to accept this approach.');
    trafficActionNoteEl.className = `traffic-action-note ${result.ok ? 'tone-ok' : 'tone-warn'}`;
  } else if (action === 'hold') {
    const held = holdTrafficOffer(state, offerId);
    trafficActionNoteEl.textContent = held ? 'Holding window extended 25 seconds.' : 'Ship has not reached holding orbit.';
    trafficActionNoteEl.className = `traffic-action-note ${held ? 'tone-ok' : 'tone-warn'}`;
  } else if (action === 'pass' || action === 'refuse') {
    const passed = passTrafficOffer(state, offerId);
    trafficActionNoteEl.textContent = passed ? 'Traffic passed. Lane control notified.' : 'Approach is already committed.';
    trafficActionNoteEl.className = 'traffic-action-note tone-muted';
  }
  projectedTrafficOffer = null;
  refreshTrafficStatus();
  refreshTrafficOffers();
});

alertListEl.addEventListener('click', (event) => {
  const target = event.target instanceof HTMLElement ? event.target : null;
  const strandedButton = target?.closest<HTMLButtonElement>('button[data-stranded-focus], button[data-stranded-relief]');
  if (strandedButton) {
    const visitorId = Number(strandedButton.dataset.strandedFocus ?? strandedButton.dataset.strandedRelief);
    const tileIndex = Number(strandedButton.dataset.strandedTile);
    if (!Number.isFinite(visitorId) || !Number.isFinite(tileIndex) || tileIndex < 0 || tileIndex >= state.tiles.length) return;
    const tile = fromIndex(tileIndex, state.width);
    centerViewportOnWorldPx((tile.x + 0.5) * TILE_SIZE, (tile.y + 0.5) * TILE_SIZE);
    hoveredTile = tileIndex;
    selectedRoomTile = null;
    if (strandedButton.dataset.strandedRelief !== undefined) {
      const quote = getStrandedReliefQuote(state, visitorId);
      const transferred = transferStrandedVisitor(state, visitorId);
      strandedReliefFeedback = {
        tone: transferred ? 'warn' : 'danger',
        text: transferred
          ? `Relief transfer arranged for visitor #${visitorId} (-${quote?.cost ?? 0}c)`
          : quote && quote.eligible && state.metrics.credits < quote.cost
            ? `Relief transfer needs ${quote.cost} credits`
            : 'Relief transfer could not be arranged',
        expiresAt: state.now + 8
      };
      alertDiagnosisText = strandedReliefFeedback.text;
      lastPortAlertRenderKey = '';
      refreshHudStatus();
      refreshAlertPanel();
    } else {
      alertDiagnosisText = `Stranded visitor #${visitorId}: their ship has left. Relief transfer becomes available when the alert shows its cost.`;
    }
    refreshSelectionSummary();
    return;
  }
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-port-focus]');
  if (!button) return;
  const tileIndex = Number(button.dataset.portFocus);
  if (!Number.isFinite(tileIndex) || tileIndex < 0 || tileIndex >= state.tiles.length) return;
  const tile = fromIndex(tileIndex, state.width);
  centerViewportOnWorldPx((tile.x + 0.5) * TILE_SIZE, (tile.y + 0.5) * TILE_SIZE);
  hoveredTile = tileIndex;
  // Opening ticket 02: an alert must land on one deterministic destination.
  // Selecting a tile with no room produced "Selected room is no longer
  // available", which is both wrong and unrelated to what the player clicked.
  const hasRoom = state.rooms[tileIndex] !== RoomType.None;
  selectedRoomTile = hasRoom ? tileIndex : null;
  alertDiagnosisText = button.dataset.portDiagnosis ?? null;
  refreshSelectionSummary();
});

settlementSummaryEl.addEventListener('click', (event) => {
  const dismiss = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-dismiss-settlement]');
  if (dismiss) {
    state.portOps.selectedSettlementId = null;
    refreshSettlementSummary();
    return;
  }
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-port-focus]');
  if (!button) return;
  const tileIndex = Number(button.dataset.portFocus);
  if (!Number.isFinite(tileIndex) || tileIndex < 0 || tileIndex >= state.tiles.length) return;
  const tile = fromIndex(tileIndex, state.width);
  centerViewportOnWorldPx((tile.x + 0.5) * TILE_SIZE, (tile.y + 0.5) * TILE_SIZE);
  hoveredTile = tileIndex;
  selectedRoomTile = tileIndex;
  refreshSelectionSummary();
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


playBtn.addEventListener('click', () => {
  if (starterLayoutEditorMode) return;
  if (pendingAutosaveLoad) {
    pendingAutosaveLoad = false;
    loadAutosaveBtn.classList.add('hidden');
  }
  state.controls.paused = false;
  refreshTransportUi();
});

pauseBtn.addEventListener('click', () => {
  state.controls.paused = true;
  refreshTransportUi();
});

speedUpBtn.addEventListener('click', () => {
  if (starterLayoutEditorMode) return;
  if (pendingAutosaveLoad) {
    pendingAutosaveLoad = false;
    loadAutosaveBtn.classList.add('hidden');
  }
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
  toggleServiceNodesBtn.textContent = state.controls.showServiceNodes ? 'Service Reach: ON' : 'Service Reach: OFF';
  toggleInventoryOverlayBtn.textContent = state.controls.showInventoryOverlay
    ? 'Storage: ON'
    : 'Storage: OFF';
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
    btn.textContent = overlay === 'none' ? label : `${label}: ${active ? 'ON' : 'Off'}`;
  }
  refreshDiagnosticReadout();
  refreshDiagnosticKey();
}
syncToggleLabels();

function openAirCoverageOverlay(): void {
  state.controls.diagnosticOverlay = 'life-support';
  setPaletteSection('overlays');
  syncToggleLabels();
}

hudAirControlEl.addEventListener('click', openAirCoverageOverlay);
airEmergencyIndicatorEl.addEventListener('click', openAirCoverageOverlay);

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
    state.controls.diagnosticOverlay =
      overlay !== 'none' && state.controls.diagnosticOverlay === overlay ? 'none' : overlay;
    syncToggleLabels();
  });
}

toggleSpritesBtn.addEventListener('click', () => {
  state.controls.spriteMode = state.controls.spriteMode === 'sprites' ? 'fallback' : 'sprites';
  if (state.controls.spriteMode === 'sprites' && !spriteAtlas.ready) {
    requestSpriteAtlasLoad();
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

openPortDispatchBtn.addEventListener('click', openPortDispatch);
closePortDispatchBtn.addEventListener('click', closePortDispatch);
portDispatchModal.addEventListener('click', (event) => {
  if (event.target === portDispatchModal) closePortDispatch();
});

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

function openCrewPalette(): void {
  refreshCrewPanel();
  setPaletteSection('crew');
}

wireModal({ modal: saveModal, openBtn: openSaveModalBtn, closeBtn: closeSaveModalBtn, beforeOpen: refreshSaveUi });
wireModal({ modal: ratingModal, openBtn: openRatingModalBtn, closeBtn: closeRatingModalBtn, beforeOpen: refreshRatingModal });
openEconomyLedgerBtn.addEventListener('click', () => {
  refreshOpeningEconomyPanels();
  openingEconomyPanels.open('ledger');
});
openTravelShopBtn.addEventListener('click', () => {
  openMarketSurface(firstMarketFixtureTile());
});
openCapitalProjectsBtn.addEventListener('click', () => {
  refreshOpeningEconomyPanels();
  openingEconomyPanels.open('projects');
});
wireModal({
  modal: marketModal,
  openBtn: openMarketBtn,
  closeBtn: closeMarketBtn,
  beforeOpen: () => {
    updateMarketRates();
    refreshMarketUi();
  }
});
openCrewCommandBtn.addEventListener('click', openCrewPalette);
openCrewPanelBtn.addEventListener('click', () => {
  marketModal.classList.add('hidden');
  openCrewPalette();
});
wireModal({ modal: expansionModal, openBtn: openExpansionModalBtn, closeBtn: closeExpansionModalBtn, beforeOpen: refreshExpansionUi });
wireModal({
  modal: systemMapModal,
  openBtn: openSystemMapModalBtn,
  closeBtn: closeSystemMapBtn,
  beforeOpen: refreshSystemMapModal
});
wireModal({
  modal: progressionModal,
  openBtn: openProgressionModalBtn,
  closeBtn: closeProgressionModalBtn,
  beforeOpen: () => {
    refreshProgressionModal();
    progressionModal.querySelector<HTMLElement>('.modal-card')?.scrollTo({ top: 0 });
  }
});
openProgressionSummaryBtn.addEventListener('click', () => {
  refreshProgressionModal();
  progressionModal.querySelector<HTMLElement>('.modal-card')?.scrollTo({ top: 0 });
  progressionModal.classList.remove('hidden');
});
wireModal({
  modal: priorityModal,
  openBtn: openOpsModalBtn,
  closeBtn: closePriorityBtn,
  beforeOpen: () => {
    selectedWorkplaceAnchor = null;
    refreshPriorityUi();
  }
});
editPrioritiesBtn.addEventListener('click', () => {
  selectedWorkplaceAnchor = null;
  refreshPriorityUi();
  priorityModal.classList.remove('hidden');
});
wireModal({ modal: opsModal, closeBtn: closeOpsModalBtn, beforeOpen: refreshOpsModal });
openHealthDetailsBtn.addEventListener('click', () => {
  setOpsTab('traffic');
  refreshOpsModal();
  opsModal.classList.remove('hidden');
});
wireModal({ modal: dockModal, closeBtn: closeDockBtn });
wireModal({
  modal: roomModal,
  closeBtn: closeRoomBtn,
  beforeClose: () => {
    selectedRoomTile = null;
    setSelectedInterface(null);
    selectedBerthAnchor = null;
  }
});
wireModal({
  modal: agentModal,
  closeBtn: closeAgentBtn,
  beforeClose: () => {
    selectedAgent = null;
    selectedIncidentId = null;
    agentSidePanel.classList.add('hidden');
  }
});

closeAgentSideBtn.addEventListener('click', () => {
  selectedAgent = null;
  selectedIncidentId = null;
  agentSidePanel.classList.add('hidden');
  agentModal.classList.add('hidden');
});

namedWatchRosterEl.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-roster-crew-id]');
  if (!button) return;
  const crewId = Number(button.dataset.rosterCrewId);
  if (!Number.isFinite(crewId)) return;
  selectedRosterCrewId = selectedRosterCrewId === crewId ? null : crewId;
  refreshNamedWatchRoster();
});

workplaceAssignmentContextEl.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  if (target.closest('[data-cancel-workplace]')) {
    selectedWorkplaceAnchor = null;
    refreshNamedWatchRoster();
    return;
  }
  const confirm = target.closest<HTMLButtonElement>('button[data-confirm-workplace]');
  if (!confirm || selectedRosterCrewId === null || selectedWorkplaceAnchor === null) return;
  if (!setCrewHomeWorkplace(state, selectedRosterCrewId, selectedWorkplaceAnchor)) return;
  refreshNamedWatchRoster();
  refreshSelectionSummary();
});

watchAssignmentBarEl.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-crew-watch]');
  if (!button) return;
  const crewId = Number(button.dataset.crewId);
  const watch = Number(button.dataset.crewWatch) as CrewWatchIndex;
  if (!Number.isFinite(crewId) || watch < 0 || watch > 2) return;
  if (!setCrewWatchAssignment(state, crewId, watch)) return;
  refreshPriorityUi();
  refreshOperatingRhythm();
});

openWatchRosterEl.addEventListener('click', () => {
  selectedWorkplaceAnchor = null;
  refreshPriorityUi();
  priorityModal.classList.remove('hidden');
});

roomModalPlanWorkplaceBtn.addEventListener('click', () => {
  const anchor = Number(roomModalPlanWorkplaceBtn.dataset.workplaceAnchor);
  if (!Number.isFinite(anchor)) return;
  selectedWorkplaceAnchor = anchor;
  selectedRosterCrewId = null;
  roomModal.classList.add('hidden');
  refreshPriorityUi();
  priorityModal.classList.remove('hidden');
});

roomModalSurgeWorkplaceBtn.addEventListener('click', () => {
  const anchor = Number(roomModalSurgeWorkplaceBtn.dataset.workplaceAnchor);
  if (!Number.isFinite(anchor)) return;
  const recalled = surgeWorkplace(state, anchor);
  roomModalWorkplaceStatusEl.textContent = recalled > 0
    ? `${recalled} assigned crew recalled for 45s · energy -4 · morale -3`
    : 'No reserve or off-duty home crew available.';
  window.setTimeout(refreshRoomModal, 900);
});

emergencyRecallEl.addEventListener('click', () => {
  const active = getOperatingSchedule(state).recallActive;
  setEmergencyRecall(state, !active);
  refreshOperatingRhythm();
});

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

// Berth-config controls inside the room-modal. Same wiring shape as
// the dock-modal block above — the player allowlists are stored
// per-berth in `state.berthConfigs` keyed by anchor tile, and each
// toggle pipes through to the sim setter that mirrors the dock one.
// Purpose + facing are info-only display in v0 (see room-modal HTML
// for the rationale + linked BerthInspector docs in sim.ts).
const ROOM_MODAL_BERTH_SHIP_TYPE_CHECKBOXES: Array<[HTMLInputElement, ShipType]> = [
  [roomModalBerthTouristCheckbox, 'tourist'],
  [roomModalBerthTraderCheckbox, 'trader'],
  [roomModalBerthIndustrialCheckbox, 'industrial'],
  [roomModalBerthMilitaryCheckbox, 'military'],
  [roomModalBerthColonistCheckbox, 'colonist']
];
for (const [checkbox, shipType] of ROOM_MODAL_BERTH_SHIP_TYPE_CHECKBOXES) {
  checkbox.addEventListener('change', () => {
    if (selectedBerthAnchor === null) return;
    setBerthAllowedShipType(state, selectedBerthAnchor, shipType, checkbox.checked);
    refreshRoomModal();
  });
}

const ROOM_MODAL_BERTH_SHIP_SIZE_CHECKBOXES: Array<[HTMLInputElement, ShipSize]> = [
  [roomModalBerthSmallCheckbox, 'small'],
  [roomModalBerthMediumCheckbox, 'medium'],
  [roomModalBerthLargeCheckbox, 'large']
];
for (const [checkbox, shipSize] of ROOM_MODAL_BERTH_SHIP_SIZE_CHECKBOXES) {
  checkbox.addEventListener('change', () => {
    if (selectedBerthAnchor === null) return;
    setBerthAllowedShipSize(state, selectedBerthAnchor, shipSize, checkbox.checked);
    refreshRoomModal();
  });
}

roomModalBerthScreeningSelect.addEventListener('change', () => {
  if (selectedBerthAnchor === null) return;
  setBerthScreeningLevel(state, selectedBerthAnchor, roomModalBerthScreeningSelect.value as BerthScreeningLevel);
  refreshRoomModal();
});

roomModalBerthCustomsSelect.addEventListener('change', () => {
  if (selectedBerthAnchor === null) return;
  setBerthCustomsPolicy(state, selectedBerthAnchor, roomModalBerthCustomsSelect.value as CustomsPolicy);
  refreshRoomModal();
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
  const targetId = slotId ?? generateSaveId();

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
      id: targetId,
      name: saveName,
      createdAt: nowIso,
      updatedAt: nowIso,
      payloadText
    });
  }

  const trimmed = trimSaveStore(saves, targetId);
  if (!writeSaveStore({ storeVersion: 1, saves: trimmed.saves }, true)) return;

  refreshSaveUi(targetId);
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
    const importedSaveId = generateSaveId();
    const saves = [
      ...store.saves,
      {
        id: importedSaveId,
        name: importName,
        createdAt: nowIso,
        updatedAt: nowIso,
        payloadText
      }
    ];
    const trimmed = trimSaveStore(saves, importedSaveId);
    if (!writeSaveStore({ storeVersion: 1, saves: trimmed.saves }, true)) return;
    refreshSaveUi(importedSaveId);
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
  crewPanelStatusEl.textContent = ok ? 'Hired +1 assistant' : 'Not enough credits or max crew';
  refreshCrewPanel();
});

progressionModal.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  if (target.dataset.openCrewPanel) {
    progressionModal.classList.add('hidden');
    setPaletteSection('crew');
    refreshCrewPanel();
    refreshToolbar();
    return;
  }
  const specialty = target.dataset.selectSpecialty as SpecialtyId | undefined;
  if (!specialty) return;
  selectSpecialty(state, specialty);
  refreshProgressionModal();
  refreshCrewPanel();
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
    ? 'Ordered +20 raw food relay'
    : result.reason === 'insufficient_credits'
      ? 'Not enough credits'
      : result.reason === 'no_food_destinations'
        ? 'Need Intake Pallet, Cold Store, Fridge, or Storage'
        : result.reason === 'no_compatible_berth'
          ? 'Need a compatible cargo berth for the supplier'
          : `Not enough food capacity (free ${result.freeCapacity.toFixed(1)}, need ${result.requiredAmount.toFixed(1)})`;
});

buyFoodLargeBtn.addEventListener('click', () => {
  const result = buyRawFoodDetailed(state, market.buyFood60Cost, 60);
  marketNoteEl.textContent = result.ok
    ? 'Ordered +60 raw food relay'
    : result.reason === 'insufficient_credits'
      ? 'Not enough credits'
      : result.reason === 'no_food_destinations'
        ? 'Need Intake Pallet, Cold Store, Fridge, or Storage'
        : result.reason === 'no_compatible_berth'
          ? 'Need a compatible cargo berth for the supplier'
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

incidentListEl.addEventListener('click', (event) => {
  const target = event.target instanceof HTMLElement ? event.target : null;
  const button = target?.closest<HTMLButtonElement>('button[data-incident-select]');
  if (!button) return;
  const incidentId = Number(button.dataset.incidentSelect);
  if (!Number.isFinite(incidentId)) return;
  focusIncident(incidentId);
});

alertListEl.addEventListener('click', (event) => {
  const target = event.target instanceof HTMLElement ? event.target : null;
  const button = target?.closest<HTMLButtonElement>('button[data-incident-select]');
  if (!button) return;
  const incidentId = Number(button.dataset.incidentSelect);
  if (!Number.isFinite(incidentId)) return;
  focusIncident(incidentId);
});

let lastTime = performance.now();
const UI_REFRESH_INTERVAL_MS = 125;
const ROOM_MODAL_REFRESH_INTERVAL_MS = 500;
const HOVER_DIAGNOSTIC_REFRESH_INTERVAL_MS = 250;
const TARGET_FRAME_MS = 1000 / 60;
const SIMULATION_STEP_SEC = 1 / 15;
const SIMULATION_INTERVAL_MS = SIMULATION_STEP_SEC * 1000;
let nextUiRefreshAt = 0;
let nextRoomModalRefreshAt = 0;
let nextHoverDiagnosticRefreshAt = 0;
let lastUiRefreshMs = 0;
let lastHoverDiagnosticTile: number | null = null;
let cachedHoverDiagnostic: ReturnType<typeof getRoomDiagnosticAt> = null;
type ActorPositionSnapshot = {
  crew: Map<number, { x: number; y: number }>;
  visitors: Map<number, { x: number; y: number }>;
  residents: Map<number, { x: number; y: number }>;
};
let simulationTimer: ReturnType<typeof setInterval> | null = null;
let lastSimulationStepAt = performance.now();

function captureActorPositions(): ActorPositionSnapshot {
  return {
    crew: new Map(state.crewMembers.map((actor) => [actor.id, { x: actor.x, y: actor.y }])),
    visitors: new Map(state.visitors.map((actor) => [actor.id, { x: actor.x, y: actor.y }])),
    residents: new Map(state.residents.map((actor) => [actor.id, { x: actor.x, y: actor.y }]))
  };
}

let previousActorPositions = captureActorPositions();

function resetActorInterpolation(): void {
  previousActorPositions = captureActorPositions();
  lastSimulationStepAt = performance.now();
}

function actorPresentationUnit(id: number, salt: number): number {
  const value = Math.sin(id * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function applyInterpolatedActorPositions(alpha: number): () => void {
  const restores: Array<{ actor: { x: number; y: number }; x: number; y: number }> = [];
  const interpolateGroup = (
    actors: Array<{ id: number; x: number; y: number }>,
    previous: Map<number, { x: number; y: number }>,
    presentationSalt: number
  ): void => {
    for (const actor of actors) {
      const prior = previous.get(actor.id);
      if (!prior) continue;
      const currentX = actor.x;
      const currentY = actor.y;
      restores.push({ actor, x: currentX, y: currentY });
      const dx = currentX - prior.x;
      const dy = currentY - prior.y;
      if (Math.abs(dx) + Math.abs(dy) < 0.001) continue;

      // Actors still arrive on the exact simulation tick, but their visual
      // pace through a tile varies slightly so crowds do not march in lockstep.
      const paceBias = (actorPresentationUnit(actor.id, presentationSalt) - 0.5) * 0.2;
      const visualAlpha = Math.min(1, Math.max(0, alpha + paceBias * Math.sin(Math.PI * alpha)));
      const laneSign = actorPresentationUnit(actor.id, presentationSalt + 1) < 0.5 ? -1 : 1;
      const laneAmount = laneSign * (0.025 + actorPresentationUnit(actor.id, presentationSalt + 2) * 0.035);
      const laneOffset = laneAmount * Math.sin(Math.PI * visualAlpha);
      const segmentLength = Math.max(0.001, Math.hypot(dx, dy));
      actor.x = prior.x + dx * visualAlpha + (-dy / segmentLength) * laneOffset;
      actor.y = prior.y + dy * visualAlpha + (dx / segmentLength) * laneOffset;
    }
  };
  interpolateGroup(state.crewMembers, previousActorPositions.crew, 31);
  interpolateGroup(state.visitors, previousActorPositions.visitors, 47);
  interpolateGroup(state.residents, previousActorPositions.residents, 61);
  return () => {
    for (const restore of restores) {
      restore.actor.x = restore.x;
      restore.actor.y = restore.y;
    }
  };
}
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

function runSimulationSlice(): void {
  previousActorPositions = captureActorPositions();
  tick(state, state.controls.paused ? 0 : SIMULATION_STEP_SEC);
  lastSimulationStepAt = performance.now();
  if (!state.controls.paused) markDirty();
}

function frame(now: number): void {
  if (currentTool.kind !== 'utility-underlay') restoreViewAfterUtilityTool();
  const frameMs = now - lastTime;
  lastTime = now;
  state.metrics.frameMs = frameMs;
  state.metrics.rafJankMs = Math.max(0, frameMs - TARGET_FRAME_MS);
  state.metrics.rafDroppedFrames = Math.max(0, Math.round(frameMs / TARGET_FRAME_MS) - 1);

  const renderViewport = getRenderViewport();
  prepareViewportRender(renderViewport);
  const renderStart = performance.now();
  const interpolationAlpha = state.controls.paused
    ? 1
    : Math.min(1, Math.max(0, (now - lastSimulationStepAt) / SIMULATION_INTERVAL_MS));
  const restoreActorPositions = applyInterpolatedActorPositions(interpolationAlpha);
  try {
    renderWorld(ctx, state, currentTool, hoveredTile, spriteAtlas, renderViewport, approachPreviewForRender());
    drawOpeningDockFeedback(renderViewport);
    drawPortTurnaroundCallouts();
    drawSelectedAgentRoute(ctx);
    drawActiveIncidentHints(ctx);
    drawSelectedIncidentRoutes(ctx);
    drawSelectedIncidentCallouts(ctx);
  } finally {
    restoreActorPositions();
  }
  state.metrics.renderMs = performance.now() - renderStart;

  // World-anchored HTML follows the camera, so it re-places every frame rather
  // than on the slower UI cadence — otherwise a pan visibly drags the card off
  // the fixture it belongs to.
  syncAnchoredShopPanel();
  syncBerthOpsAnchors();

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
    const uiRefreshStarted = performance.now();

  refreshToolbar();
  refreshSpriteStatus();
  refreshDiagnosticReadout();
  refreshDiagnosticKey();
  refreshHudStatus();
  refreshOpeningEconomyPanels();
  refreshTrafficStatus();
  refreshTrafficOffers();
  refreshSettlementSummary();
  refreshBottomRoleCoverage();
  if (!priorityModal.classList.contains('hidden')) refreshPriorityUi();
  refreshAlertPanel();
  refreshIncidentList();
  refreshOperatingRhythm();
  refreshStationGoal();
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
  maintenanceStatusEl.textContent = maintenanceStatusText();
  maintenanceStatusEl.style.color = maintenanceStatusToneColor();
  thermalStatusEl.textContent = thermalStatusText();
  thermalStatusEl.style.color = thermalStatusToneColor();
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
  const crewReadiness = getCrewSustainabilitySummary(state);
  criticalStaffingLineEl.style.color = crewReadiness.criticalNeedsCrew > 0
    ? 'var(--danger)'
    : crewReadiness.strainedCrew > 0 || crewReadiness.sleepSlots < state.crewMembers.length
      ? 'var(--warn)'
      : 'var(--ok)';
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
  if (!progressionModal.classList.contains('hidden')) refreshProgressionModal();
  if (activePaletteSection === 'crew') refreshCrewPanel();
  roomUsageEl.textContent = roomUsageText();
  roomFlowEl.textContent = roomFlowText();
  resourcesEl.textContent = `Raw Meal ${Math.round(state.metrics.rawFoodStock)} -> Meals ${Math.round(state.metrics.mealStock)} | Water ${Math.round(state.metrics.waterStock)} | Air ${Math.round(state.metrics.airQuality)}%`;
  resourcesEl.style.color = state.metrics.airQuality < 35 ? '#ff7676' : '#d6deeb';
  pressureEl.textContent = `${Math.round(state.metrics.pressurizationPct)}% sealed | ${state.metrics.leakingTiles} leaking tiles`;
  pressureEl.style.color = state.metrics.pressurizationPct > 85 ? '#6edb8f' : state.metrics.pressurizationPct > 60 ? '#ffcf6e' : '#ff7676';
  economyEl.textContent = `Supplies ${Math.round(state.metrics.materials)} | Credits ${Math.round(state.metrics.credits)}`;
  economyFlowEl.textContent = `Credits/min: +${state.metrics.creditsGrossPerMin.toFixed(1)} gross | -${state.metrics.creditsPayrollPerMin.toFixed(1)} payroll | net ${state.metrics.creditsNetPerMin >= 0 ? '+' : ''}${state.metrics.creditsNetPerMin.toFixed(1)}`;
  // Contextual UI: the queue row appears with the queue. Same inputs
  // jobsSummaryText() uses to decide there is nothing to report.
  workQueueRowEl.classList.toggle(
    'hidden',
    state.metrics.pendingJobs + state.metrics.assignedJobs + state.metrics.sanitationJobsOpen <= 0
  );
  jobsEl.textContent = jobsSummaryText();
  idleReasonsEl.textContent = idleReasonsText();
  stallReasonsEl.textContent = stallReasonsText();
  crewRetargetsEl.textContent = crewRetargetsText();
  jobsExtraEl.textContent = jobsExtraText();
  foodChainHintEl.textContent = foodChainHintText();
  roomWarningsEl.textContent = `Room warnings: ${state.metrics.topRoomWarnings.join(' | ') || 'none'}`;
  updateMarketRates();
  if (!marketModal.classList.contains('hidden')) refreshMarketUi();
  if (!expansionModal.classList.contains('hidden')) refreshExpansionUi();
  hireCrewBtn.disabled = state.metrics.credits < market.hireCost || state.crew.total >= 60;
  buySmallBtn.disabled = state.metrics.credits < market.buyMat25Cost;
  buyLargeBtn.disabled = state.metrics.credits < market.buyMat80Cost;
  sellSmallBtn.disabled = state.metrics.materials < 25;
  sellLargeBtn.disabled = state.metrics.materials < 80;
  buyFoodSmallBtn.disabled = state.metrics.credits < market.buyFood20Cost;
  buyFoodLargeBtn.disabled = state.metrics.credits < market.buyFood60Cost;
  sellFoodSmallBtn.disabled = state.metrics.rawFoodStock < 20;
  sellFoodLargeBtn.disabled = state.metrics.rawFoodStock < 60;
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
  const hottestSimPhases = Object.entries(state.metrics.simPhaseMs ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name, ms]) => `${name} ${ms.toFixed(1)}`)
    .join(' + ');
  const busiestPathPhases = Object.entries(state.metrics.simPhasePathCalls ?? {})
    .filter(([, calls]) => calls > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name, calls]) => `${name} ${calls}`)
    .join(' + ');
  perfStatsEl.textContent =
    `Perf: rAF ${state.metrics.frameMs.toFixed(1)}ms (drop ${state.metrics.rafDroppedFrames}) | ` +
    `sim last ${state.metrics.tickMs.toFixed(1)}ms | render ${state.metrics.renderMs.toFixed(1)}ms | ` +
    `ui ${lastUiRefreshMs.toFixed(1)}ms | path ${state.metrics.pathMs.toFixed(1)}ms/${state.metrics.pathCallsPerTick} | work ${frameBudgetMs.toFixed(1)}ms` +
    (hottestSimPhases ? ` | hot ${hottestSimPhases}` : '') +
    (busiestPathPhases ? ` | routes ${busiestPathPhases}` : '');
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
    `env ${state.metrics.stationRatingPenaltyPerMin.environment.toFixed(2)} | ` +
    `clean ${state.metrics.sanitationPenaltyPerMin.toFixed(2)}`;
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
    `env ${state.metrics.stationRatingPenaltyTotal.environment.toFixed(1)} | ` +
    `clean ${state.metrics.sanitationPenaltyTotal.toFixed(1)}`;
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
  if (selectedIncidentId !== null) {
    if (!refreshAgentSidePanel()) {
      selectedIncidentId = null;
      agentSidePanel.classList.add('hidden');
    }
    agentModal.classList.add('hidden');
  } else if (selectedAgent !== null) {
    if (!refreshAgentSidePanel()) {
      selectedAgent = null;
      agentSidePanel.classList.add('hidden');
    }
    agentModal.classList.add('hidden');
  } else {
    agentModal.classList.add('hidden');
    agentSidePanel.classList.add('hidden');
  }
  if (!ratingModal.classList.contains('hidden')) refreshRatingModal();
  if (!opsModal.classList.contains('hidden')) refreshOpsModal();
  if (selectedDockId !== null) {
    const dock = state.docks.find((d) => d.id === selectedDockId) ?? null;
    if (dock) {
      dockInfoEl.textContent = `Dock #${dock.id}: ${dock.purpose} berth | ${dock.lane} facing ${dock.facing} | area ${dock.area} | type ${dock.allowedShipTypes.join(', ')} | size ${dock.allowedShipSizes.join(', ')}`;
      dockInfoEl.classList.remove('hidden');
      if (!dockModal.classList.contains('hidden')) refreshDockModal();
    } else {
      dockInfoEl.textContent = '';
      dockInfoEl.classList.add('hidden');
      selectedDockId = null;
      dockModal.classList.add('hidden');
    }
  } else {
    dockInfoEl.textContent = '';
    dockInfoEl.classList.add('hidden');
    dockModal.classList.add('hidden');
  }
  if (
    selectedRoomTile !== null &&
    !roomModal.classList.contains('hidden') &&
    now >= nextRoomModalRefreshAt
  ) {
    refreshRoomModal();
  }
  if (currentTool.kind === 'tile' && currentTool.tile === TileType.Dock && hoveredTile !== null) {
    const preview = validateDockPlacement(state, hoveredTile);
    dockPreviewEl.textContent = `Dock preview: ${preview.valid ? 'valid' : `invalid (${preview.reason})`}`;
    dockPreviewEl.style.color = preview.valid ? '#6edb8f' : '#ff7676';
    dockPreviewEl.classList.remove('hidden');
  } else if (toolLockMessage) {
    if (toolLockMessage !== lastPresentedToolLockMessage) {
      lastPresentedToolLockMessage = toolLockMessage;
      toolLockMessageVisibleUntil = now + 4_500;
    }
    if (now < toolLockMessageVisibleUntil) {
      dockPreviewEl.textContent = toolLockMessage;
      dockPreviewEl.style.color = toolLockMessage.startsWith('Cannot') ? '#ff9a9a' : '#9fdcff';
      dockPreviewEl.classList.remove('hidden');
    } else {
      dockPreviewEl.textContent = '';
      dockPreviewEl.classList.add('hidden');
    }
  } else {
    lastPresentedToolLockMessage = '';
    toolLockMessageVisibleUntil = 0;
    dockPreviewEl.textContent = '';
    dockPreviewEl.style.color = '#8ea2bd';
    dockPreviewEl.classList.add('hidden');
  }

  // The Build Guidance sidebar panel (room-diagnostic + paint-guidance
  // surfaces) was removed alongside the Build & Room Legend panel in the
  // HUD cleanup pass — the top toolbar already encodes the same build
  // hotkey legend, and the modal room inspector handles deep diagnostics.
  // `cachedHoverDiagnostic` and `toolLockMessage` are still updated by
  // other sites (modal inspector, locked-tool toasts) so we just stop
  // writing them to the deleted sidebar spans.
  lastUiRefreshMs = performance.now() - uiRefreshStarted;
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
  // Render layers are cached by the simulation version counters. A hydrated
  // state is rebuilt from createInitialState(), so its counters can exactly
  // match the currently rendered starter station even though its tile/room
  // arrays are completely different. That left the old static layer on
  // screen while freshly restored modules and actors rendered over it — the
  // apparent "floating people/modules" save bug. Make every load a hard
  // cache boundary; the sim's derived caches will rebuild on the next tick as
  // well.
  nextState.topologyVersion = Math.max(state.topologyVersion, nextState.topologyVersion) + 1;
  nextState.roomVersion = Math.max(state.roomVersion, nextState.roomVersion) + 1;
  nextState.moduleVersion = Math.max(state.moduleVersion, nextState.moduleVersion) + 1;
  nextState.dockVersion = Math.max(state.dockVersion, nextState.dockVersion) + 1;
  nextState.mapConditionVersion = Math.max(state.mapConditionVersion, nextState.mapConditionVersion) + 1;
  nextState.controls.manualTrafficAdmission = true;
  nextState.trafficOffers ??= [];
  Object.assign(state, nextState);
  resetActorInterpolation();
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
let pendingAutosaveLoad = false;

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
  if (!stateDirty || pendingAutosaveLoad) return;
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

/**
 * TRUTH-01. A New Game must own the single autosave slot from its first
 * moment. Otherwise the previous run's envelope stays on disk until the new
 * run's first 60s tick, and a reload in that window offers Continue on a
 * station the player has already abandoned.
 */
function startFreshAutosaveEpoch(): void {
  pendingAutosaveLoad = false;
  try {
    localStorage.setItem(
      AUTOSAVE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        payloadText: serializeSave('__autosave__', state, GAME_VERSION)
      } satisfies AutosaveRecord)
    );
  } catch (err) {
    // Losing the slot is survivable; a stale record is not. Clear instead.
    console.warn('[autosave] could not seed new-game epoch:', err);
    try {
      localStorage.removeItem(AUTOSAVE_KEY);
    } catch {
      /* ignore */
    }
  }
  stateDirty = false;
}

function offerAutosaveLoadOnColdStart(): void {
  const record = readAutosaveRecord();
  if (!record) return;
  pendingAutosaveLoad = true;
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
      pendingAutosaveLoad = false;
      return;
    }
    try {
      const hydrated = hydrateStateFromSave(parsed.save);
      applyHydratedState(hydrated.state);
      stateDirty = true;
      pendingAutosaveLoad = false;
      loadAutosaveBtn.classList.add('hidden');
      autosaveStatusEl.textContent = `Autosaved ${formatClock(record.savedAt)} · loaded`;
      autosaveStatusEl.classList.remove('hidden');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const failLabel = `Autosave load failed: ${msg}`;
      loadAutosaveBtn.classList.add('load-error');
      pendingAutosaveLoad = false;
      loadAutosaveBtn.title = failLabel;
      loadAutosaveBtn.setAttribute('aria-label', failLabel);
    }
  });
}

let gameLoopStarted = false;

function startGameLoop(): void {
  if (gameLoopStarted) return;
  gameLoopStarted = true;
  requestSpriteAtlasLoad();
  refreshCrewPanel();
  refreshModulePaletteSprites();
  pendingAutosaveLoad = false;
  loadAutosaveBtn.classList.add('hidden');
  if (autosaveTimer !== null) clearInterval(autosaveTimer);
  autosaveTimer = starterLayoutEditorMode ? null : setInterval(writeAutosave, AUTOSAVE_INTERVAL_MS);
  if (simulationTimer !== null) clearInterval(simulationTimer);
  simulationTimer = setInterval(runSimulationSlice, SIMULATION_INTERVAL_MS);
  requestAnimationFrame(frame);
}

if (new URLSearchParams(location.search).get('inspect-commercial') === '1') {
  selectedRoomTile = 21 * state.width + 46;
  refreshRoomModal();
  roomModal.classList.remove('hidden');
}

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
    applyHydratedState(hydrated.state);
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
  renderWorld(ctx, state, currentTool, hoveredTile, spriteAtlas, renderViewport, approachPreviewForRender());
  drawOpeningDockFeedback(renderViewport);
  drawPortTurnaroundCallouts();
  drawSelectedAgentRoute(ctx);
  drawActiveIncidentHints(ctx);
  drawSelectedIncidentRoutes(ctx);
  drawSelectedIncidentCallouts(ctx);
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
function applyLoadParam(): boolean {
  const params = new URLSearchParams(location.search);
  const loadB64 = params.get('load');
  const loadId = params.get('loadId');
  if (loadB64) {
    try {
      const json = atob(loadB64);
      window.__harnessLoadSave(json);
      return true;
    } catch (e) {
      console.error('[harness] ?load= base64 decode failed', e);
    }
  } else if (loadId) {
    try {
      const raw = localStorage.getItem(loadId);
      if (raw) {
        window.__harnessLoadSave(raw);
        return true;
      } else {
        console.warn('[harness] ?loadId=', loadId, 'not found in localStorage');
      }
    } catch (e) {
      console.error('[harness] ?loadId= read failed', e);
    }
  }
  return false;
}

type ContinueCandidate = {
  payloadText: string;
  label: string;
  savedAt: number;
};

function getContinueCandidate(): ContinueCandidate | null {
  const autosave = readAutosaveRecord();
  if (autosave) {
    const parsed = parseAndMigrateSave(autosave.payloadText);
    if (parsed.ok) {
      return {
        payloadText: autosave.payloadText,
        label: 'Last autosave',
        savedAt: autosave.savedAt
      };
    }
  }

  const { store } = readSaveStore();
  const saves = [...store.saves].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  for (const save of saves) {
    const parsed = parseAndMigrateSave(save.payloadText);
    if (!parsed.ok) continue;
    return {
      payloadText: save.payloadText,
      label: save.name,
      savedAt: Date.parse(save.updatedAt)
    };
  }
  return null;
}

function loadContinueCandidate(candidate: ContinueCandidate): boolean {
  const parsed = parseAndMigrateSave(candidate.payloadText);
  if (!parsed.ok) return false;
  try {
    const hydrated = hydrateStateFromSave(parsed.save);
    applyHydratedState(hydrated.state);
    state.controls.paused = true;
    stateDirty = true;
    autosaveStatusEl.textContent = `${candidate.label} loaded`;
    autosaveStatusEl.classList.remove('hidden');
    return true;
  } catch (error) {
    console.error('[startup] continue failed', error);
    return false;
  }
}

function continueInfoFor(candidate: ContinueCandidate | null): TitleContinueInfo {
  if (!candidate) return { available: false, detail: 'No station on record' };
  const when = Number.isFinite(candidate.savedAt)
    ? new Date(candidate.savedAt).toLocaleString()
    : 'Saved station';
  return {
    available: true,
    title: candidate.label,
    detail: when
  };
}

async function runPlayerStartup(): Promise<void> {
  while (!gameLoopStarted) {
    const candidate = getContinueCandidate();
    const choice = await mountTitleScreen({ continueInfo: continueInfoFor(candidate) });
    if (choice === 'continue' && candidate && loadContinueCandidate(candidate)) {
      startGameLoop();
      return;
    }

    // TRUTH-01: every path that is not a successful Continue starts from a
    // rebuilt station. This covers New Game, a Continue whose hydration threw
    // partway through Object.assign, and a second loop pass after the player
    // backed out of the charter screen.
    applyHydratedState(buildFreshGameState());
    if (!state.system) {
      console.warn('[charter] system map unavailable; starting at default site.');
      startFreshAutosaveEpoch();
      startGameLoop();
      return;
    }
    const charter = await mountCharterScreen(state.seedAtCreation, state.system, { allowCancel: true });
    if (!charter) continue;
    state.site = charter;
    state.laneProfiles = generateLaneProfiles(state);
    state.controls.paused = true;
    console.info('[charter] site chartered', charter);
    startFreshAutosaveEpoch();
    startGameLoop();
    return;
  }
}

async function bootstrapApp(): Promise<void> {
  const params = new URLSearchParams(location.search);
  try {
    await applySavedStarterLayout();
  } catch (error) {
    console.warn('[starter-layout] storage unavailable; using stock layout:', error);
  }
  if (params.has('load') || params.has('loadId')) {
    applyLoadParam();
    startGameLoop();
    return;
  }
  if (starterLayoutEditorMode) {
    state.controls.paused = true;
    startGameLoop();
    return;
  }
  if (params.get('charter') === '1') {
    if (state.system) {
      const charter = await mountCharterScreen(state.seedAtCreation, state.system);
      if (charter) {
        state.site = charter;
        state.laneProfiles = generateLaneProfiles(state);
      }
    }
    startGameLoop();
    return;
  }
  if (params.has('scenario')) {
    startGameLoop();
    return;
  }
  await runPlayerStartup();
}

void bootstrapApp();
