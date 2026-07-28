// Named cold-start scenario fixtures. Applied via the `?scenario=<name>`
// URL param in main.ts. Each fixture takes a fresh `createInitialState()`
// result and thin-spec-overrides only the fields needed to land at the
// target test state — it does NOT rebuild station geometry, rooms,
// modules, or crew rosters. The rest of the world remains whatever the
// default starter produces.
//
// Deliberately thin so schema drift doesn't rot the fixtures: if
// `StationState` gains a field, default-starter populates it and the
// fixture stays silent. Only tier-relevant counters + unlock bookkeeping
// are set per scenario.
//
// Whitelist-only: the `?scenario=<name>` loader looks up by name in
// `COLD_START_SCENARIOS` and applies nothing if not found. No freeform
// paths or JSON blobs land through this door.

import { UNLOCK_DEFINITIONS } from './content/unlocks';
import { selectShipHullVariant } from './ship-hulls';
import { createEmptyStaffRoleCounts, totalStaffCount } from './content/command';
import { createVisitorNeeds } from './occupant-demand';
import { GRID_WIDTH, TileType, RoomType, ModuleType, VisitorState } from './types';
import type { ArrivingShip, ItemType, SpecialtyId, StationState, UnlockId, UnlockTier, Visitor, VisitorServiceFailureStage, RecurringNeedKind } from './types';
import { buildStationExpansionOnTruss, buyMaterials, buyRawFood, getApproachConflictGroups, mapConditionAt, planStationExpansionOnTruss, removeModuleAtTile, setBerthCustomsPolicy, setBerthScreeningLevel, setTile, setRoom, setModule, setUtilityUnderlayTile, tryPlaceModule } from './sim';

type Scenario = (state: StationState) => void;

function unlockThrough(state: StationState, targetTier: UnlockTier): void {
  const ids: UnlockId[] = [];
  for (const def of UNLOCK_DEFINITIONS) {
    if (def.tier <= targetTier) ids.push(def.id);
  }
  state.unlocks.tier = targetTier;
  state.unlocks.unlockedIds = ids;
  state.unlocks.unlockedAtSec = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const id of ids) {
    state.unlocks.triggerProgress[
      UNLOCK_DEFINITIONS.find((d) => d.id === id)!.tier
    ] = 1;
  }
}

function completeSpecialtyForScenario(state: StationState, id: SpecialtyId): void {
  state.command.selectedSpecialty = null;
  if (!state.command.completedSpecialties.includes(id)) state.command.completedSpecialties.push(id);
  state.command.specialtyProgress[id] = {
    id,
    state: 'completed',
    progress: 1,
    selectedAt: 0,
    completedAt: 0
  };
}

function setScenarioCrew(state: StationState): void {
  const counts = createEmptyStaffRoleCounts();
  counts.captain = 1;
  counts['sanitation-officer'] = 1;
  counts.janitor = 2;
  counts.assistant = 5;
  state.crew.roleCounts = counts;
  state.crew.total = totalStaffCount(counts);
  state.crew.free = state.crew.total;
  state.crew.assigned = 0;
  state.command.officers.captain = true;
  state.command.officers['sanitation-officer'] = true;
}

function setReputationScenarioCrew(state: StationState): void {
  const counts = createEmptyStaffRoleCounts();
  counts.captain = 1;
  counts['sanitation-officer'] = 1;
  counts['security-officer'] = 1;
  counts['security-guard'] = 2;
  counts.janitor = 2;
  counts.assistant = 7;
  state.crew.roleCounts = counts;
  state.crew.total = totalStaffCount(counts);
  state.crew.free = state.crew.total;
  state.crew.assigned = 0;
  state.command.officers.captain = true;
  state.command.officers['sanitation-officer'] = true;
  state.command.officers['security-officer'] = true;
}

function setMaintenanceScenarioCrew(state: StationState): void {
  const counts = createEmptyStaffRoleCounts();
  counts.captain = 1;
  counts['mechanic-officer'] = 1;
  counts.technician = 2;
  counts.engineer = 1;
  counts.assistant = 5;
  state.crew.roleCounts = counts;
  state.crew.total = totalStaffCount(counts);
  state.crew.free = state.crew.total;
  state.crew.assigned = 0;
  state.command.officers.captain = true;
  state.command.officers['mechanic-officer'] = true;
}

function seedRoomDirt(state: StationState, room: RoomType, sourceCode: number, base: number): void {
  let n = 0;
  for (let i = 0; i < state.rooms.length; i++) {
    if (state.rooms[i] !== room) continue;
    if (state.tiles[i] === TileType.Wall || state.tiles[i] === TileType.Space) continue;
    const variation = ((i * 17 + n * 11) % 29);
    state.dirtByTile[i] = Math.min(96, base + variation);
    state.dirtSourceByTile[i] = sourceCode;
    n += 1;
  }
}

function seedRoomThermalPressure(state: StationState, room: RoomType, heat: number, staleAir: number): void {
  for (let i = 0; i < state.rooms.length; i++) {
    if (state.rooms[i] !== room) continue;
    if (state.tiles[i] === TileType.Wall || state.tiles[i] === TileType.Space) continue;
    const sun = mapConditionAt(state, 'sunlight', i);
    state.heatByTile[i] = Math.max(state.heatByTile[i] ?? 42, heat + sun * 8);
    state.staleAirByTile[i] = Math.max(state.staleAirByTile[i] ?? 0, staleAir);
  }
}

function roomClusterAnchorsForScenario(state: StationState, room: RoomType): number[] {
  const seen = new Set<number>();
  const anchors: number[] = [];
  for (let i = 0; i < state.rooms.length; i++) {
    if (seen.has(i) || state.rooms[i] !== room) continue;
    const stack = [i];
    seen.add(i);
    let anchor = i;
    while (stack.length > 0) {
      const tile = stack.pop()!;
      anchor = Math.min(anchor, tile);
      const x = tile % GRID_WIDTH;
      const y = Math.floor(tile / GRID_WIDTH);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= GRID_WIDTH) continue;
        const next = ny * GRID_WIDTH + nx;
        if (next < 0 || next >= state.rooms.length || seen.has(next) || state.rooms[next] !== room) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    anchors.push(anchor);
  }
  return anchors.sort((a, b) => a - b);
}

function drawAirDuctLine(state: StationState, x1: number, y1: number, x2: number, y2: number): void {
  const dx = Math.sign(x2 - x1);
  const dy = Math.sign(y2 - y1);
  if (dx !== 0 && dy !== 0) {
    drawAirDuctLine(state, x1, y1, x2, y1);
    drawAirDuctLine(state, x2, y1, x2, y2);
    return;
  }
  let x = x1;
  let y = y1;
  while (true) {
    setUtilityUnderlayTile(state, 'air-duct', y * GRID_WIDTH + x, true);
    if (x === x2 && y === y2) break;
    x += dx;
    y += dy;
  }
}

function placeWallMod(state: StationState, x: number, y: number, m: ModuleType): void {
  tryPlaceModule(state, m, y * GRID_WIDTH + x, 0);
}

function approachConflictShip(id: number, dock: StationState['docks'][number], status: 'active' | 'waiting', groupIds: string[]): ArrivingShip {
  const anchor = dock.anchorTile;
  const x = anchor % GRID_WIDTH;
  const y = Math.floor(anchor / GRID_WIDTH);
  return {
    id,
    kind: 'transient',
    size: 'small',
    bayTiles: [...dock.tiles],
    bayCenterX: x + 0.5,
    bayCenterY: y + 0.5,
    shipType: id === 9403 ? 'trader' : 'tourist',
    hullVariant: selectShipHullVariant(id, id === 9403 ? 'trader' : 'tourist', 'small'),
    lane: dock.facing,
    originDockId: dock.id,
    assignedDockId: dock.id,
    assignedDockSourceKey: dock.sourceKey,
    assignedBerthAnchor: null,
    queueState: 'queued',
    stage: 'approach',
    stageTime: status === 'active' ? 0.8 : 0.15,
    passengersTotal: 0,
    passengersSpawned: 0,
    passengersBoarded: 0,
    minimumBoarding: 0,
    spawnCarry: 0,
    dockedAt: 0,
    residentIds: [],
    manifestDemand: { cafeteria: 0, market: 0, lounge: 0 },
    manifestMix: { diner: 0.25, shopper: 0.25, lounger: 0.25, rusher: 0.25 },
    approachCommitment: {
      slotId: `dock:${dock.sourceKey}`,
      groupIds,
      phase: 'approach',
      status,
      queuedAt: id === 9401 ? 1 : id === 9402 ? 2 : 3
    }
  };
}

export const COLD_START_SCENARIOS: Record<string, Scenario> = {
  // Default starter state — no-op. Keeps the registry pattern symmetric
  // so `?scenario=starter` is a valid URL (and differentiates from a
  // mistyped name which falls through to warning).
  starter: () => {},
  'two-berth-shift': () => {},

  // Phase 4 visual fixture: two nearby hull interfaces share the same
  // approach rectangle, while a third remains clear. Paused deliberately so
  // the active/waiting state is stable for a screenshot or manual inspection.
  'approach-conflicts': (s) => {
    applyDemoStationOverlay(s);
    for (const y of [20, 22, 31]) {
      const anchor = y * GRID_WIDTH + 76;
      s.rooms[anchor] = RoomType.None;
      setTile(s, anchor, TileType.Dock);
    }
    const makeDock = (id: number, y: number, sourceKey: string) => ({
      id,
      sourceKind: 'legacy-tile-cluster' as const,
      sourceKey,
      purpose: 'visitor' as const,
      tiles: [y * GRID_WIDTH + 76],
      anchorTile: y * GRID_WIDTH + 76,
      area: 1,
      facing: 'east' as const,
      lane: 'east' as const,
      approachTiles: [y * GRID_WIDTH + 77, y * GRID_WIDTH + 78],
      allowedShipTypes: ['tourist', 'trader'] as StationState['docks'][number]['allowedShipTypes'],
      allowedShipSizes: ['small' as const],
      maxSizeByArea: 'small' as const,
      occupiedByShipId: null
    });
    const first = makeDock(9401, 20, `legacy-dock:${20 * GRID_WIDTH + 76}`);
    const second = makeDock(9402, 22, `legacy-dock:${22 * GRID_WIDTH + 76}`);
    const independent = makeDock(9403, 31, `legacy-dock:${31 * GRID_WIDTH + 76}`);
    s.docks = [first, second, independent];
    const sharedGroup = getApproachConflictGroups(s).find((group) =>
      group.slotIds.includes(`dock:${first.sourceKey}`) && group.slotIds.includes(`dock:${second.sourceKey}`)
    );
    s.arrivingShips = [
      approachConflictShip(9401, first, 'active', sharedGroup ? [sharedGroup.id] : []),
      approachConflictShip(9402, second, 'waiting', sharedGroup ? [sharedGroup.id] : []),
      approachConflictShip(9403, independent, 'active', [])
    ];
    s.controls.paused = true;
    s.controls.spriteMode = 'sprites';
    s.controls.showSpriteFallback = false;
  },

  // Tier 1 already fired: first visitor archetype seen, T1 unlocked.
  // Useful for sprite/UX iteration that starts "after the first-visitor
  // flash" without waiting for the spawn cycle.
  't1-ready': (s) => {
    unlockThrough(s, 1);
    s.usageTotals.archetypesEverSeen.diner = true;
    s.metrics.archetypesServedLifetime = 1;
  },

  // Mid-game: Tier 4 unlocked, Tier 5 on-deck with counters poised.
  // Has the variety of archetypes + credits + incidents a playtester
  // would see after ~30 min of real play. Good target for dense-room
  // sprite review.
  't5-ready': (s) => {
    unlockThrough(s, 4);
    s.usageTotals.archetypesEverSeen = {
      diner: true,
      shopper: true,
      lounger: true,
      rusher: true
    };
    s.metrics.archetypesServedLifetime = 4;
    s.metrics.creditsEarnedLifetime = 5000;
    s.metrics.tradeCyclesCompletedLifetime = 5;
    s.metrics.incidentsResolvedLifetime = 3;
    s.metrics.credits = 1000;
    s.metrics.materials = 200;
  },

  // End-state: every tier unlocked, trophy condition satisfied. For
  // reviewing T6+ UX copy, achievement-panel polish, post-game states.
  't6-trophy': (s) => {
    unlockThrough(s, 6);
    s.usageTotals.archetypesEverSeen = {
      diner: true,
      shopper: true,
      lounger: true,
      rusher: true
    };
    s.metrics.archetypesServedLifetime = 4;
    s.metrics.creditsEarnedLifetime = 25000;
    s.metrics.tradeCyclesCompletedLifetime = 20;
    s.metrics.incidentsResolvedLifetime = 10;
    s.metrics.actorsTreatedLifetime = 5;
    s.metrics.residentsConvertedLifetime = 3;
    s.metrics.credits = 5000;
    s.metrics.materials = 500;
  },

  // Entropy slice 19-1/19-4: a busy public/service station with live
  // dirt, open sanitation pressure, and the Sanitation Department ready
  // to activate once the first tick refreshes Bridge reachability.
  'entropy-sanitation': (s) => {
    unlockThrough(s, 2);
    s.metrics.credits = 1500;
    s.metrics.materials = 400;
    completeSpecialtyForScenario(s, 'sanitation-program');
    setScenarioCrew(s);
    applyDemoStationOverlay(s);
    paintRoom(s, 49, 31, 61, 38, RoomType.Bridge, 'north');
    placeMod(s, 51, 33, ModuleType.CaptainConsole);
    placeMod(s, 55, 33, ModuleType.SanitationTerminal);
    seedRoomDirt(s, RoomType.Cafeteria, 2, 54);
    seedRoomDirt(s, RoomType.Hygiene, 3, 48);
    seedRoomDirt(s, RoomType.Market, 6, 42);
    s.controls.paused = false;
    s.controls.simSpeed = 1;
    s.controls.diagnosticOverlay = 'sanitation';
    s.controls.shipsPerCycle = 0;
    s.controls.materialAutoImportEnabled = false;
  },

  // Entropy slice 19-2: debris-exposed berth and hull maintenance with
  // a Mechanical Department path, airlock, supplies, and maintenance overlay.
  'entropy-maintenance': (s) => {
    unlockThrough(s, 3);
    s.metrics.credits = 1800;
    s.metrics.materials = 500;
    s.legacyMaterialStock = 500;
    completeSpecialtyForScenario(s, 'mechanical-maintenance');
    setMaintenanceScenarioCrew(s);
    applyDemoStationOverlay(s);
    paintRoom(s, 49, 31, 61, 38, RoomType.Bridge, 'north');
    placeMod(s, 51, 33, ModuleType.CaptainConsole);
    placeMod(s, 55, 33, ModuleType.MechanicalTerminal);
    placeMod(s, 58, 33, ModuleType.ResearchTerminal);
    paintFloorTile(s, 76, 30, TileType.Airlock);
    setRoom(s, 30 * GRID_WIDTH + 76, RoomType.None);
    paintFloorTile(s, 75, 30, TileType.Floor);
    setRoom(s, 30 * GRID_WIDTH + 75, RoomType.None);
    for (const debt of [
      { key: `berth:${32 * GRID_WIDTH + 68}`, anchorTile: 32 * GRID_WIDTH + 68, targetTile: 33 * GRID_WIDTH + 75, domain: 'berth' as const, label: 'berth perimeter' },
      { key: `hull:${31 * GRID_WIDTH + 76}`, anchorTile: 31 * GRID_WIDTH + 76, targetTile: 31 * GRID_WIDTH + 76, domain: 'hull' as const, label: 'exterior hull' },
      { key: `module:${8 * GRID_WIDTH + 27}`, anchorTile: 8 * GRID_WIDTH + 27, targetTile: 8 * GRID_WIDTH + 27, domain: 'module' as const, label: 'kitchen stove' }
    ]) {
      s.maintenanceDebts.push({
        key: debt.key,
        domain: debt.domain,
        source: debt.domain === 'module' ? 'high-load' : 'debris',
        anchorTile: debt.anchorTile,
        targetTile: debt.targetTile,
        exterior: debt.domain !== 'module',
        label: debt.label,
        effect: debt.domain === 'module' ? 'meal prep slowed at high wear' : 'EVA repair pressure',
        debt: 58,
        lastServicedAt: s.now
      });
    }
    buyMaterials(s, 0, 160);
    s.controls.paused = false;
    s.controls.simSpeed = 1;
    s.controls.diagnosticOverlay = 'maintenance';
    s.controls.shipsPerCycle = 2;
    s.controls.materialAutoImportEnabled = false;
  },

  // Entropy slice 19-3: seeded sunlight/shade thermal pressure with a
  // high-load bright room, a shaded comparison band, vents, and wall
  // insulation visible from the Thermal overlay on load.
  'entropy-thermal': (s) => {
    unlockThrough(s, 3);
    s.seedAtCreation = 19314;
    s.metrics.credits = 1800;
    s.metrics.materials = 520;
    s.legacyMaterialStock = 520;
    applyDemoStationOverlay(s);
    completeSpecialtyForScenario(s, 'mechanical-maintenance');
    setMaintenanceScenarioCrew(s);
    paintRoom(s, 49, 31, 61, 38, RoomType.Bridge, 'north');
    placeMod(s, 51, 33, ModuleType.CaptainConsole);
    placeMod(s, 55, 33, ModuleType.MechanicalTerminal);
    placeMod(s, 58, 33, ModuleType.ResearchTerminal);
    // Leave the kitchen deliberately exposed so the scenario does not solve
    // its own thermal pressure; the insulated workshop is the comparison.
    for (const tile of [
      [55, 6], [56, 6], [57, 6], [58, 6], [59, 6], [60, 6], [61, 6], [62, 6]
    ] as const) {
      placeWallMod(s, tile[0], tile[1], ModuleType.InsulationPanel);
    }
    placeWallMod(s, 20, 6, ModuleType.Vent);
    placeWallMod(s, 34, 6, ModuleType.Vent);
    placeWallMod(s, 64, 6, ModuleType.Vent);
    placeWallMod(s, 16, 31, ModuleType.Vent);
    seedRoomThermalPressure(s, RoomType.Kitchen, 74, 38);
    seedRoomThermalPressure(s, RoomType.Workshop, 70, 34);
    seedRoomThermalPressure(s, RoomType.Dorm, 50, 24);
    buyMaterials(s, 0, 160);
    s.controls.paused = false;
    s.controls.simSpeed = 1;
    s.controls.diagnosticOverlay = 'thermal';
    s.controls.shipsPerCycle = 0;
    s.controls.materialAutoImportEnabled = false;
  },

  // Entropy slice 19-5: underfloor utility networks as the first ducted
  // ventilation fixture. The source branch leaves Life Support, powers
  // kitchen/workshop vents, and includes one intentionally disconnected
  // storage branch for overlay/debug feedback.
  'entropy-ventilation': (s) => {
    unlockThrough(s, 3);
    s.seedAtCreation = 19315;
    s.metrics.credits = 2200;
    s.metrics.materials = 620;
    s.legacyMaterialStock = 620;
    applyDemoStationOverlay(s);
    completeSpecialtyForScenario(s, 'mechanical-maintenance');
    setMaintenanceScenarioCrew(s);
    placeWallMod(s, 30, 6, ModuleType.Vent);
    placeWallMod(s, 59, 6, ModuleType.Vent);
    placeWallMod(s, 73, 6, ModuleType.Vent);
    drawAirDuctLine(s, 20, 33, 20, 17);
    drawAirDuctLine(s, 20, 17, 29, 17);
    drawAirDuctLine(s, 29, 17, 29, 14);
    drawAirDuctLine(s, 29, 14, 30, 7);
    drawAirDuctLine(s, 29, 17, 59, 17);
    drawAirDuctLine(s, 59, 17, 59, 7);
    drawAirDuctLine(s, 69, 9, 73, 9);
    drawAirDuctLine(s, 73, 9, 73, 7);
    seedRoomThermalPressure(s, RoomType.Kitchen, 78, 62);
    seedRoomThermalPressure(s, RoomType.Workshop, 76, 58);
    seedRoomThermalPressure(s, RoomType.Clinic, 54, 24);
    buyMaterials(s, 0, 160);
    s.controls.paused = false;
    s.controls.simSpeed = 1;
    s.controls.diagnosticOverlay = 'utility-underlay';
    s.controls.shipsPerCycle = 0;
    s.controls.materialAutoImportEnabled = false;
  },

  // Demo showcase: T6 unlocked + a PROGRAMMATICALLY BUILT multi-room
  // station so every sprite category renders on load. Departs from the
  // thin-spec norm because the whole point is *dense* visual verification
  // for sprite-pipeline iteration. Use `?scenario=demo-station`.
  'demo-station': (s) => {
    // Start from t6-trophy counters so content is unlocked.
    unlockThrough(s, 6);
    s.usageTotals.archetypesEverSeen = { diner: true, shopper: true, lounger: true, rusher: true };
    s.metrics.archetypesServedLifetime = 4;
    s.metrics.creditsEarnedLifetime = 25000;
    s.metrics.tradeCyclesCompletedLifetime = 20;
    s.metrics.incidentsResolvedLifetime = 10;
    s.metrics.actorsTreatedLifetime = 5;
    s.metrics.residentsConvertedLifetime = 3;
    s.metrics.credits = 5000;
    s.metrics.materials = 500;
    applyDemoStationOverlay(s);
  },

  // Focused visual fixture for the larger, slot-driven hospitality modules.
  // It keeps the demo station's sealed shell but replaces the old one-tile
  // market and dorm furniture so atlas scale, walkable faces, and occupancy
  // indicators can be reviewed together at `?scenario=facility-scale`.
  'facility-scale': (s) => {
    unlockThrough(s, 3);
    s.metrics.credits = 3000;
    s.metrics.materials = 500;
    applyDemoStationOverlay(s);

    for (let y = 7; y < 14; y++) {
      for (let x = 6; x < 14; x++) removeModuleAtTile(s, y * GRID_WIDTH + x);
    }
    for (let y = 21; y < 28; y++) {
      for (let x = 6; x < 14; x++) removeModuleAtTile(s, y * GRID_WIDTH + x);
    }

    placeMod(s, 6, 7, ModuleType.BunkBank);
    placeMod(s, 10, 7, ModuleType.BunkBank);
    placeMod(s, 6, 21, ModuleType.CheckoutBank);
    placeMod(s, 10, 21, ModuleType.ShelfAisle);
    placeMod(s, 12, 21, ModuleType.ShelfAisle);
    s.controls.paused = true;
  },

  // Presentation fixture for the long-stay failure ladder and relief action.
  // The states are intentionally staged and paused so each warning remains
  // visible long enough for visual QA at `?scenario=failed-stay-showcase`.
  'failed-stay-showcase': (s) => {
    unlockThrough(s, 3);
    s.metrics.credits = 3000;
    s.metrics.materials = 500;
    applyDemoStationOverlay(s);
    s.visitors.length = 0;
    addFailureShowcaseVisitor(s, 99101, 17, 17, 'balking', 'hunger');
    addFailureShowcaseVisitor(s, 99102, 23, 17, 'distressed', 'leisure');
    addFailureShowcaseVisitor(s, 99103, 29, 17, 'disruptive', 'hygiene');
    addFailureShowcaseVisitor(s, 99104, 35, 17, 'distressed', 'energy', true);
    s.controls.paused = true;
  },

  // Paired construction fixtures: one makes the missing-Airlock block easy
  // to inspect; the other runs the same project through real logistics/EVA.
  'structural-expansion-blocked': (s) => {
    planScenarioStructuralExpansion(s, false);
    s.controls.paused = false;
  },
  'structural-expansion-active': (s) => {
    planScenarioStructuralExpansion(s, true);
    s.controls.paused = false;
  },

  // Commercial-unit prototype: a mature station with one large vacant shell
  // ready for the player to solicit and compare tenant proposals.
  'commercial-units': (s) => {
    unlockThrough(s, 3);
    s.metrics.credits = 3000;
    s.metrics.materials = 500;
    applyDemoStationOverlay(s);
    for (let y = 20; y < 29; y++) {
      for (let x = 45; x < 54; x++) removeModuleAtTile(s, y * GRID_WIDTH + x);
    }
    paintRoom(s, 45, 20, 54, 29, RoomType.CommercialUnit, 'south');
    s.controls.paused = true;
  },

  // Focused Stage 4 fixture: one supplier and one customer, with two
  // pump-equipped berths and visible tank stock. Both manifests begin in
  // holding orbit so the player can inspect the economics and route them.
  'fuel-day': (s) => {
    unlockThrough(s, 2);
    s.metrics.credits = 2400;
    s.metrics.materials = 500;
    applyDemoStationOverlay(s);
    // This fixture tests fuel routing rather than an intentionally undersized
    // demo dorm. Keep the port-day roster and its basic self-care capacity in
    // the 12-16 crew range described by the roadmap.
    s.crew.total = 12;
    for (const [x, y] of [
      [7, 10], [9, 10], [11, 10], [13, 10], [12, 12], [7, 14], [9, 14]
    ] as const) {
      placeMod(s, x, y, ModuleType.Bunk);
    }
    placeMod(s, 61, 22, ModuleType.Sink);
    placeMod(s, 62, 22, ModuleType.WaterFountain);
    placeMod(s, 61, 26, ModuleType.Toilet);
    placeMod(s, 63, 26, ModuleType.Toilet);
    placeMod(s, 70, 34, ModuleType.FuelTank);
    placeMod(s, 72, 35, ModuleType.FuelPump);
    placeMod(s, 70, 38, ModuleType.FuelTank);
    placeMod(s, 72, 41, ModuleType.FuelPump);
    seedItemNodeStock(s, 70, 34, 'fuel', 40);
    seedItemNodeStock(s, 70, 38, 'fuel', 40);
    const common = {
      size: 'medium' as const,
      status: 'holding' as const,
      forecastAt: 0,
      expiresAt: 180,
      passengersTotal: 0,
      manifestDemand: { cafeteria: 0, market: 0, lounge: 0 },
      manifestMix: { diner: 0.25, shopper: 0.25, lounger: 0.25, rusher: 0.25 },
      hospitalityDemand: { meal: 0, drink: 0, leisure: 0, restroom: 0, hygiene: 0, comfort: 0 },
      inboundCargo: { rawMaterial: 0, rawMeal: 0, tradeGood: 0 },
      outboundRequest: { rawMaterial: 0, meal: 0, tradeGood: 0 },
      berthTimeSec: 240,
      projectedSpend: 0,
      riskLabel: 'guarded' as const,
      assignedBerthAnchor: null
    };
    s.trafficOffers = [
      {
        ...common,
        id: 9001,
        callsign: 'F-901',
        shipName: 'Helios Bunker',
        lane: 'east',
        shipType: 'industrial',
        hullVariant: selectShipHullVariant(9001, 'industrial', 'medium'),
        offerKind: 'freight',
        arrivesAt: 5,
        fuelSupply: 48,
        fuelRequest: 0,
        fuelProcurementCostCredits: 108,
        requestedServices: [],
        dockingFee: 70
      },
      {
        ...common,
        id: 9002,
        callsign: 'F-902',
        shipName: 'Wayfarer Meridian',
        lane: 'south',
        shipType: 'trader',
        hullVariant: selectShipHullVariant(9002, 'trader', 'medium'),
        offerKind: 'freight',
        arrivesAt: 9,
        fuelSupply: 0,
        fuelRequest: 36,
        fuelProcurementCostCredits: 0,
        requestedServices: ['fuel'],
        dockingFee: 65
      }
    ];
    s.shipSpawnCounter = 9003;
    s.portOps.offerSequenceIndex = 3;
    s.portOps.firstOfferShownAt = 0;
    s.controls.manualTrafficAdmission = true;
    s.controls.portAutoAdmitEnabled = false;
    s.controls.materialAutoImportEnabled = false;
    s.controls.paused = true;
    s.controls.simSpeed = 1;
  },

  'reputation-slice': (s) => {
    unlockThrough(s, 3);
    completeSpecialtyForScenario(s, 'sanitation-program');
    completeSpecialtyForScenario(s, 'security-command');
    setReputationScenarioCrew(s);
    applyDemoStationOverlay(s);
    paintRoom(s, 49, 31, 61, 38, RoomType.Bridge, 'north');
    placeMod(s, 51, 33, ModuleType.CaptainConsole);
    placeMod(s, 55, 33, ModuleType.SanitationTerminal);
    placeMod(s, 58, 33, ModuleType.SecurityTerminal);
    s.metrics.credits = 3500;
    s.metrics.materials = 500;
    s.controls.paused = false;
    s.controls.simSpeed = 1;
    s.controls.shipsPerCycle = 3;
    s.controls.diagnosticOverlay = 'reputation';
    // Two berth pockets: first is stricter/cleaner, second is open/cargo-heavy.
    const berthAnchors = roomClusterAnchorsForScenario(s, RoomType.Berth);
    if (berthAnchors[0] !== undefined) {
      setBerthScreeningLevel(s, berthAnchors[0], 'strict');
      setBerthCustomsPolicy(s, berthAnchors[0], 'selective');
    }
    if (berthAnchors[1] !== undefined) {
      setBerthScreeningLevel(s, berthAnchors[1], 'open');
      setBerthCustomsPolicy(s, berthAnchors[1], 'expedited');
    }
    s.controls.securityPosture = 'standard';
    seedRoomDirt(s, RoomType.Market, 6, 28);
    seedRoomDirt(s, RoomType.Cantina, 6, 34);
    seedRoomDirt(s, RoomType.Workshop, 5, 42);
    seedRoomDirt(s, RoomType.Storage, 5, 45);
    seedRoomDirt(s, RoomType.LogisticsStock, 5, 48);
    seedRoomDirt(s, RoomType.Berth, 5, 14);
    // Keep the green-zone side visually legible against the red cargo/arrival pocket.
    for (const room of [RoomType.Lounge, RoomType.Observatory, RoomType.Dorm]) {
      seedRoomDirt(s, room, 0, 0);
    }
  }
};

// ----------------------------------------------------------------------------
// demo-station layout — programmatic station builder
// ----------------------------------------------------------------------------

function paintRoom(
  state: StationState,
  x1: number, y1: number, x2: number, y2: number,
  roomType: RoomType,
  doorSide: 'north' | 'south' | 'east' | 'west' = 'south'
): void {
  for (let y = y1; y < y2; y++) {
    for (let x = x1; x < x2; x++) {
      const idx = y * GRID_WIDTH + x;
      const isEdge = x === x1 || x === x2 - 1 || y === y1 || y === y2 - 1;
      if (isEdge) {
        setTile(state, idx, TileType.Wall);
      } else {
        setTile(state, idx, TileType.Floor);
        setRoom(state, idx, roomType);
      }
    }
  }
  const midX = Math.floor((x1 + x2) / 2);
  const midY = Math.floor((y1 + y2) / 2);
  let doorX: number, doorY: number;
  if (doorSide === 'north') { doorX = midX; doorY = y1; }
  else if (doorSide === 'south') { doorX = midX; doorY = y2 - 1; }
  else if (doorSide === 'west') { doorX = x1; doorY = midY; }
  else { doorX = x2 - 1; doorY = midY; }
  const doorIdx = doorY * GRID_WIDTH + doorX;
  setTile(state, doorIdx, TileType.Door);
  setRoom(state, doorIdx, roomType);
}

function placeMod(state: StationState, x: number, y: number, m: ModuleType): void {
  setModule(state, y * GRID_WIDTH + x, m);
}

function paintFloorTile(state: StationState, x: number, y: number, t: TileType): void {
  setTile(state, y * GRID_WIDTH + x, t);
}

function seedItemNodeStock(state: StationState, x: number, y: number, itemType: ItemType, amount: number): number {
  const tileIndex = y * GRID_WIDTH + x;
  const node = state.itemNodes.find((entry) => entry.tileIndex === tileIndex);
  if (!node || amount <= 0) return 0;
  const used = Object.values(node.items).reduce((sum, value) => sum + (value ?? 0), 0);
  const added = Math.min(amount, Math.max(0, node.capacity - used));
  if (added <= 0) return 0;
  node.items[itemType] = (node.items[itemType] ?? 0) + added;
  return added;
}

function addFailureShowcaseVisitor(
  state: StationState,
  id: number,
  x: number,
  y: number,
  stage: Exclude<VisitorServiceFailureStage, 'none' | 'unmet'>,
  need: RecurringNeedKind,
  stranded = false
): void {
  const tileIndex = y * GRID_WIDTH + x;
  const needs = createVisitorNeeds(id);
  needs[need] = 12;
  needs.active = need;
  needs.unmetSince = state.now - 120;
  const visitor: Visitor = {
    id,
    name: `Showcase ${id}`,
    x: x + 0.5,
    y: y + 0.5,
    tileIndex,
    state: VisitorState.Leisure,
    path: [],
    speed: 2,
    patience: 0,
    eatTimer: 0,
    trespassed: false,
    servedMeal: false,
    carryingMeal: false,
    reservedServingTile: null,
    reservedTargetTile: null,
    blockedTicks: 0,
    archetype: need === 'hunger' ? 'diner' : 'lounger',
    taxSensitivity: 1,
    spendMultiplier: 1,
    patienceMultiplier: 1,
    primaryPreference: need === 'hunger' ? 'cafeteria' : 'lounge',
    spawnedAt: state.now - 180,
    originShipId: null,
    airExposureSec: 0,
    healthState: 'healthy',
    leisureLegsRemaining: 0,
    leisureLegsPlanned: 0,
    lastLeisureKind: null,
    servicePlan: [],
    completedServices: [],
    activeService: need === 'hunger' ? 'meal' : need === 'hygiene' ? 'hygiene' : 'leisure',
    stayClass: 'extended',
    needs,
    recurringNeedActive: need,
    serviceBlockedSince: state.now - 120,
    serviceFailureStage: stage,
    failureSince: state.now - 120,
    failureNeed: need,
    strandedFromShipId: stranded ? 99100 : null,
    strandedAt: stranded ? state.now - 90 : null,
    reliefEligibleAt: stranded ? state.now : null
  };
  state.visitors.push(visitor);
}

function planScenarioStructuralExpansion(state: StationState, withAirlock: boolean): void {
  let patch: number[] | null = null;
  for (let y = 1; y < state.height - 2 && patch === null; y++) {
    for (let x = 1; x < state.width - 2; x++) {
      const candidate = [
        y * state.width + x,
        y * state.width + x + 1,
        (y + 1) * state.width + x,
        (y + 1) * state.width + x + 1
      ];
      if (candidate.some((tile) => state.tiles[tile] !== TileType.Space)) continue;
      for (const tile of candidate) setTile(state, tile, TileType.Truss);
      if (planStationExpansionOnTruss(state, candidate).ok) {
        patch = candidate;
        break;
      }
      for (const tile of candidate) setTile(state, tile, TileType.Space);
    }
  }
  if (!patch) throw new Error('Structural expansion fixture could not find a valid scaffold patch.');
  if (withAirlock) {
    for (let tile = 0; tile < state.tiles.length; tile++) {
      if (state.tiles[tile] !== TileType.Wall) continue;
      const x = tile % state.width;
      const y = Math.floor(tile / state.width);
      const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
        .filter((point) => point.x >= 0 && point.y >= 0 && point.x < state.width && point.y < state.height)
        .map((point) => point.y * state.width + point.x);
      if (!neighbors.some((neighbor) => state.tiles[neighbor] === TileType.Space)) continue;
      if (!neighbors.some((neighbor) => state.tiles[neighbor] === TileType.Floor)) continue;
      setTile(state, tile, TileType.Airlock);
      break;
    }
  }
  state.legacyMaterialStock = 200;
  state.metrics.materials = 200;
  const planned = buildStationExpansionOnTruss(state, patch);
  if (!planned.ok) throw new Error(`Structural expansion fixture failed: ${planned.reason ?? 'unknown'}`);
}

function applyDemoStationOverlay(state: StationState): void {
  // Wipe a larger canvas so the starter's tiny central room doesn't conflict.
  for (let y = 3; y < 48; y++) {
    for (let x = 3; x < 80; x++) {
      const idx = y * GRID_WIDTH + x;
      setTile(state, idx, TileType.Space);
      setRoom(state, idx, RoomType.None);
    }
  }

  // Sealed outer hull. Older demo-station only painted rooms and left
  // corridor floor open to space, which made it useless for simulation
  // playtests because oxygen instantly collapsed.
  for (let y = 5; y < 44; y++) {
    for (let x = 4; x < 77; x++) {
      const idx = y * GRID_WIDTH + x;
      const edge = x === 4 || x === 76 || y === 5 || y === 43;
      setTile(state, idx, edge ? TileType.Wall : TileType.Floor);
      setRoom(state, idx, RoomType.None);
    }
  }

  // Main service/social band.
  paintRoom(state, 5, 6, 15, 15, RoomType.Dorm, 'south');
  paintRoom(state, 15, 6, 25, 15, RoomType.Cafeteria, 'south');
  paintRoom(state, 25, 6, 34, 15, RoomType.Kitchen, 'south');
  paintRoom(state, 34, 6, 44, 15, RoomType.Hydroponics, 'south');
  paintRoom(state, 44, 6, 54, 15, RoomType.Clinic, 'south');
  paintRoom(state, 54, 6, 64, 15, RoomType.Workshop, 'south');
  paintRoom(state, 64, 6, 75, 15, RoomType.Storage, 'south');

  // Central public/service concourse.
  for (let y = 15; y < 20; y++) {
    for (let x = 5; x < 76; x++) {
      setTile(state, y * GRID_WIDTH + x, TileType.Floor);
      setRoom(state, y * GRID_WIDTH + x, RoomType.None);
    }
  }

  // Bottom public/civic/utility band.
  paintRoom(state, 5, 20, 15, 29, RoomType.Market, 'north');
  paintRoom(state, 15, 20, 25, 29, RoomType.Lounge, 'north');
  paintRoom(state, 25, 20, 35, 29, RoomType.Cantina, 'north');
  paintRoom(state, 35, 20, 45, 29, RoomType.Observatory, 'north');
  paintRoom(state, 45, 20, 55, 29, RoomType.RecHall, 'north');
  paintRoom(state, 55, 20, 65, 29, RoomType.Hygiene, 'north');
  paintRoom(state, 65, 20, 75, 29, RoomType.Security, 'north');

  // Back-of-house / arrival band.
  paintRoom(state, 5, 31, 16, 42, RoomType.Reactor, 'north');
  paintRoom(state, 16, 31, 27, 42, RoomType.LifeSupport, 'north');
  paintRoom(state, 27, 31, 38, 42, RoomType.LogisticsStock, 'north');
  paintRoom(state, 38, 31, 49, 42, RoomType.Brig, 'north');
  paintRoom(state, 68, 31, 76, 37, RoomType.Berth, 'west');
  paintRoom(state, 68, 37, 76, 43, RoomType.Berth, 'west');

  // Arrival corridor behind the exterior berths.
  for (let y = 31; y < 42; y++) {
    for (let x = 49; x < 68; x++) {
      const idx = y * GRID_WIDTH + x;
      setTile(state, idx, TileType.Floor);
      setRoom(state, idx, RoomType.None);
    }
  }

  // Room-specific floor variants
  for (let y = 7; y < 14; y++) for (let x = 16; x < 24; x++) {
    paintFloorTile(state, x, y, TileType.Cafeteria);
    setRoom(state, y * GRID_WIDTH + x, RoomType.Cafeteria);
  }
  for (let y = 32; y < 41; y++) for (let x = 6; x < 15; x++) {
    paintFloorTile(state, x, y, TileType.Reactor);
    setRoom(state, y * GRID_WIDTH + x, RoomType.Reactor);
  }
  for (let y = 21; y < 28; y++) for (let x = 66; x < 74; x++) {
    paintFloorTile(state, x, y, TileType.Security);
    setRoom(state, y * GRID_WIDTH + x, RoomType.Security);
  }

  // Berths need an exposed room edge. The corridor doors seal station air
  // behind them while the east edge remains open to ship traffic.
  for (const y of [32, 33, 34, 35, 38, 39, 40, 41]) {
    paintFloorTile(state, 75, y, TileType.Floor);
    setRoom(state, y * GRID_WIDTH + 75, RoomType.Berth);
    setTile(state, y * GRID_WIDTH + 76, TileType.Space);
    setRoom(state, y * GRID_WIDTH + 76, RoomType.None);
  }

  // ---- modules ----
  // Dorm
  placeMod(state, 7, 8, ModuleType.Bed);
  placeMod(state, 9, 8, ModuleType.Bed);
  placeMod(state, 11, 8, ModuleType.Bed);
  placeMod(state, 13, 8, ModuleType.Bed);
  placeMod(state, 7, 12, ModuleType.Bed);
  placeMod(state, 10, 12, ModuleType.Plant);
  // Cafeteria
  placeMod(state, 16, 8, ModuleType.Table);
  placeMod(state, 19, 8, ModuleType.Table);
  placeMod(state, 22, 8, ModuleType.Table);
  placeMod(state, 16, 11, ModuleType.Table);
  placeMod(state, 19, 11, ModuleType.Table);
  placeMod(state, 22, 11, ModuleType.Table);
  placeMod(state, 16, 13, ModuleType.ServingStation);
  placeMod(state, 19, 13, ModuleType.ServingStation);
  placeMod(state, 22, 13, ModuleType.VendingMachine);
  // Kitchen
  placeMod(state, 27, 8, ModuleType.Stove);
  placeMod(state, 30, 8, ModuleType.Stove);
  placeMod(state, 27, 10, ModuleType.Stove);
  placeMod(state, 30, 10, ModuleType.Stove);
  placeMod(state, 27, 12, ModuleType.WaterFountain);
  // Hydroponics
  placeMod(state, 36, 8, ModuleType.GrowStation);
  placeMod(state, 39, 8, ModuleType.GrowStation);
  placeMod(state, 41, 8, ModuleType.GrowStation);
  placeMod(state, 36, 12, ModuleType.GrowStation);
  placeMod(state, 39, 12, ModuleType.GrowStation);
  // Clinic
  placeMod(state, 46, 9, ModuleType.MedBed);
  placeMod(state, 49, 9, ModuleType.MedBed);
  placeMod(state, 46, 12, ModuleType.Sink);
  // Workshop
  placeMod(state, 56, 9, ModuleType.Workbench);
  placeMod(state, 59, 9, ModuleType.Workbench);
  placeMod(state, 56, 12, ModuleType.Plant);
  // Storage
  placeMod(state, 66, 8, ModuleType.StorageRack);
  placeMod(state, 69, 8, ModuleType.StorageRack);
  placeMod(state, 72, 8, ModuleType.StorageRack);
  placeMod(state, 66, 12, ModuleType.StorageRack);
  placeMod(state, 69, 12, ModuleType.StorageRack);
  // Market
  placeMod(state, 7, 22, ModuleType.MarketStall);
  placeMod(state, 10, 22, ModuleType.MarketStall);
  placeMod(state, 7, 26, ModuleType.VendingMachine);
  placeMod(state, 10, 26, ModuleType.Bench);
  // Lounge
  placeMod(state, 17, 22, ModuleType.Couch);
  placeMod(state, 20, 22, ModuleType.GameStation);
  placeMod(state, 17, 26, ModuleType.Bench);
  // Cantina
  placeMod(state, 27, 22, ModuleType.BarCounter);
  placeMod(state, 30, 22, ModuleType.Tap);
  placeMod(state, 27, 26, ModuleType.Bench);
  placeMod(state, 30, 26, ModuleType.Bench);
  // Observatory
  placeMod(state, 37, 22, ModuleType.Telescope);
  placeMod(state, 40, 26, ModuleType.Bench);
  // RecHall
  placeMod(state, 47, 22, ModuleType.RecUnit);
  placeMod(state, 50, 22, ModuleType.Bench);
  placeMod(state, 47, 26, ModuleType.VendingMachine);
  // Hygiene
  placeMod(state, 57, 22, ModuleType.Shower);
  placeMod(state, 59, 22, ModuleType.Shower);
  placeMod(state, 59, 26, ModuleType.Toilet);
  placeMod(state, 57, 26, ModuleType.Sink);
  placeMod(state, 60, 26, ModuleType.WaterFountain);
  // Security
  placeMod(state, 67, 22, ModuleType.Terminal);
  placeMod(state, 70, 22, ModuleType.Terminal);
  placeMod(state, 67, 26, ModuleType.Plant);
  placeWallMod(state, 65, 23, ModuleType.SecurityCamera);
  // Reactor
  placeMod(state, 7, 33, ModuleType.WaterFountain);
  placeMod(state, 15, 33, ModuleType.FireExtinguisher);
  // Life support
  placeMod(state, 16, 33, ModuleType.Vent);
  placeMod(state, 26, 33, ModuleType.Vent);
  placeMod(state, 20, 38, ModuleType.WaterFountain);
  // Logistics stock
  placeMod(state, 29, 34, ModuleType.IntakePallet);
  placeMod(state, 33, 34, ModuleType.IntakePallet);
  // Brig
  placeMod(state, 40, 34, ModuleType.CellConsole);
  placeMod(state, 43, 34, ModuleType.CellConsole);
  // Berths
  placeMod(state, 68, 34, ModuleType.AccessGate);
  placeMod(state, 75, 33, ModuleType.Gangway);
  placeMod(state, 69, 33, ModuleType.CustomsCounter);
  placeMod(state, 73, 32, ModuleType.CargoArm);
  placeMod(state, 68, 40, ModuleType.AccessGate);
  placeMod(state, 75, 40, ModuleType.Gangway);
  placeMod(state, 69, 40, ModuleType.CustomsCounter);
  placeMod(state, 73, 38, ModuleType.CargoArm);

  // Demo starts with enough inventory for the Part 1 living-actors/job loop.
  state.crew.total = 18;
  state.metrics.credits = 5000;
  state.legacyMaterialStock = 500;
  state.metrics.materials = 500;
  state.metrics.waterStock = 180;
  state.metrics.airQuality = 95;
  state.controls.shipsPerCycle = 3;
  buyRawFood(state, 0, 90);
  buyMaterials(state, 0, 120);

  const seededMeals =
    seedItemNodeStock(state, 16, 13, 'meal', 24) +
    seedItemNodeStock(state, 19, 13, 'meal', 24) +
    seedItemNodeStock(state, 27, 8, 'meal', 12) +
    seedItemNodeStock(state, 30, 8, 'meal', 12);
  state.metrics.mealStock = seededMeals;
}

/** Apply a named scenario to a fresh state. Returns true if the name
 *  matched a whitelisted fixture, false otherwise. Caller decides
 *  whether to warn on mismatch. */
export function applyColdStartScenario(
  state: StationState,
  name: string
): boolean {
  const scenario = COLD_START_SCENARIOS[name];
  if (!scenario) return false;
  scenario(state);
  return true;
}

export const COLD_START_SCENARIO_NAMES: readonly string[] = Object.freeze(
  Object.keys(COLD_START_SCENARIOS)
);
