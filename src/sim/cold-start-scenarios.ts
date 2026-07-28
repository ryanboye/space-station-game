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
import { resolveFacilitySlots } from './facility-descriptors';
import { createVisitorNeeds } from './occupant-demand';
import { GRID_WIDTH, TileType, RoomType, ModuleType, VisitorState, ZoneType } from './types';
import type { ArrivingShip, ItemType, SpecialtyId, StationState, TrafficOffer, UnlockId, UnlockTier, Visitor, VisitorServiceFailureStage, RecurringNeedKind } from './types';
import { buildStationExpansionOnTruss, buyMaterials, buyRawFood, getApproachConflictGroups, hireStaffRole, mapConditionAt, planStationExpansionOnTruss, reconcileExteriorIntegrityTargets, removeModuleAtTile, runMovementCoordinatorTestTick, setBerthCustomsPolicy, setBerthScreeningLevel, setExteriorIntegrityTargetState, setExteriorIntegrityTargetWear, setTile, setRoom, setModule, setUtilityUnderlayTile, tick, tryPlaceModule } from './sim';

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

function roomClusterTilesForScenario(state: StationState, room: RoomType, anchor: number): number[] {
  if (state.rooms[anchor] !== room) return [];
  const seen = new Set<number>([anchor]);
  const stack = [anchor];
  while (stack.length > 0) {
    const tile = stack.pop()!;
    const x = tile % state.width;
    const y = Math.floor(tile / state.width);
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
      const next = ny * state.width + nx;
      if (seen.has(next) || state.rooms[next] !== room) continue;
      seen.add(next);
      stack.push(next);
    }
  }
  return [...seen].sort((a, b) => a - b);
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

function visitScheduleShowcaseShip(
  state: StationState,
  id: number,
  berthAnchor: number,
  reason: 'service-failure' | 'remaining-work'
): ArrivingShip {
  const bayTiles = roomClusterTilesForScenario(state, RoomType.Berth, berthAnchor);
  if (bayTiles.length === 0) throw new Error('Visit schedule showcase requires a Berth cluster.');
  const centerX = bayTiles.reduce((sum, tile) => sum + (tile % state.width) + 0.5, 0) / bayTiles.length;
  const centerY = bayTiles.reduce((sum, tile) => sum + Math.floor(tile / state.width) + 0.5, 0) / bayTiles.length;
  return {
    id,
    kind: 'transient',
    size: 'medium',
    bayTiles,
    bayCenterX: centerX,
    bayCenterY: centerY,
    shipType: reason === 'service-failure' ? 'tourist' : 'industrial',
    hullVariant: reason === 'service-failure' ? 'passenger-shuttle' : 'repair-tender',
    lane: 'north',
    originDockId: null,
    assignedDockId: null,
    assignedDockSourceKey: null,
    assignedBerthAnchor: berthAnchor,
    queueState: 'none',
    stage: 'docked',
    stageTime: 0,
    passengersTotal: reason === 'service-failure' ? 18 : 9,
    passengersSpawned: reason === 'service-failure' ? 18 : 9,
    passengersBoarded: 0,
    minimumBoarding: 1,
    spawnCarry: 0,
    dockedAt: state.now - 180,
    residentIds: [],
    manifestDemand: { cafeteria: 1, market: 1, lounge: 1 },
    manifestMix: { diner: 0.25, shopper: 0.25, lounger: 0.25, rusher: 0.25 },
    stayClass: 'contract',
    visitPhase: reason === 'service-failure' ? 'recall' : 'visit-service',
    plannedDepartureAt: state.now + (reason === 'service-failure' ? 45 : 150),
    extensionUntil: reason === 'remaining-work' ? state.now + 150 : null,
    recallAt: reason === 'service-failure' ? state.now : null,
    visitScheduleReason: reason
  };
}

function mixedBerthShowcaseOffer(state: StationState): TrafficOffer {
  const id = state.shipSpawnCounter++;
  return {
    id,
    callsign: `MIX-${String(id).padStart(3, '0')}`,
    shipName: 'Longwatch Repair Tender',
    lane: 'east',
    shipType: 'industrial',
    hullVariant: 'repair-tender',
    offerKind: 'mixed',
    size: 'medium',
    status: 'holding',
    forecastAt: state.now,
    arrivesAt: state.now,
    expiresAt: state.now + 900,
    passengersTotal: 6,
    manifestDemand: { cafeteria: 0.8, market: 0.15, lounge: 0.55 },
    manifestMix: { diner: 0.35, shopper: 0.1, lounger: 0.4, rusher: 0.15 },
    hospitalityDemand: { meal: 5, drink: 2, leisure: 3, restroom: 3, hygiene: 2, comfort: 2 },
    inboundCargo: { rawMaterial: 10, rawMeal: 0, tradeGood: 4 },
    outboundRequest: { rawMaterial: 4, meal: 4, tradeGood: 2 },
    requestedServices: ['cafeteria', 'lounge', 'workshop'],
    berthTimeSec: 190,
    dockingFee: 180,
    projectedSpend: 150,
    riskLabel: 'guarded',
    assignedBerthAnchor: null
  };
}

/** Two ordinary medium passenger manifests for the Phase 6 congestion gate.
 * The fixture starts them in holding; tests must still admit and dock them
 * through Approach Control before any passenger, queue, or deadline state
 * exists. */
function mealQueueBoardingOffer(
  state: StationState,
  label: 'DINERS' | 'RETURN',
  passengers: number
): TrafficOffer {
  const id = state.shipSpawnCounter++;
  return {
    id,
    callsign: `${label}-${String(id).padStart(3, '0')}`,
    shipName: label === 'DINERS' ? 'Civic Meal Shuttle' : 'Return Window Shuttle',
    lane: 'east',
    shipType: 'tourist',
    hullVariant: 'passenger-shuttle',
    offerKind: 'passenger',
    size: 'medium',
    status: 'holding',
    forecastAt: state.now,
    arrivesAt: state.now,
    expiresAt: state.now + 900,
    passengersTotal: passengers,
    manifestDemand: { cafeteria: 1, market: 0, lounge: 0 },
    manifestMix: { diner: 1, shopper: 0, lounger: 0, rusher: 0 },
    hospitalityDemand: { meal: passengers, drink: 0, leisure: 0, restroom: 0, hygiene: 0, comfort: 0 },
    inboundCargo: { rawMaterial: 0, rawMeal: 0, tradeGood: 0 },
    outboundRequest: { rawMaterial: 0, meal: 0, tradeGood: 0 },
    requestedServices: ['cafeteria'],
    berthTimeSec: 190,
    dockingFee: 0,
    projectedSpend: 0,
    riskLabel: 'low',
    assignedBerthAnchor: null
  };
}

export const COLD_START_SCENARIOS: Record<string, Scenario> = {
  // Default starter state — no-op. Keeps the registry pattern symmetric
  // so `?scenario=starter` is a valid URL (and differentiates from a
  // mistyped name which falls through to warning).
  starter: () => {},
  'two-berth-shift': () => {},

  // Gate A proof: start from the ordinary safe shell, build one complete
  // public food operation through production room/module APIs, then run normal
  // pod traffic until the first paid meal is recorded. The paused result is a
  // stable visual counterpart to the deterministic opening-business runner.
  'opening-food-cycle': (s) => {
    stageOpeningFoodCycle(s);
  },

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

  // Phase 7 visual fixture: four distinct exposed hull tiles demonstrate the
  // full integrity language without waiting through hours of natural wear.
  // The breach uses the real pressure barrier path; this scenario only seeds
  // durable condition and leaves the underlying wall intact.
  'exterior-integrity-showcase': (s) => {
    reconcileExteriorIntegrityTargets(s);
    const distinctHullTargets = s.exteriorIntegrityTargets
      .filter((target) => target.panel === 'hull')
      .sort((a, b) => a.worldY - b.worldY || a.worldX - b.worldX || a.face.localeCompare(b.face))
      .filter((target, index, targets) =>
        targets.findIndex((candidate) => candidate.worldX === target.worldX && candidate.worldY === target.worldY) === index
      )
      .slice(0, 4);
    if (distinctHullTargets[0]) setExteriorIntegrityTargetWear(s, distinctHullTargets[0].id, 20);
    if (distinctHullTargets[1]) setExteriorIntegrityTargetWear(s, distinctHullTargets[1].id, 58);
    if (distinctHullTargets[2]) setExteriorIntegrityTargetWear(s, distinctHullTargets[2].id, 88);
    if (distinctHullTargets[3]) setExteriorIntegrityTargetState(s, distinctHullTargets[3].id, 'patched', 0);
    s.controls.paused = true;
  },

  // Phase 6 visual fixture: a real assigned haul waits at a stocked source.
  // Unpausing demonstrates pickup, the bulky cart footprint, and the brief
  // destination handoff marker without inventing showcase-only cargo state.
  'physical-cargo-showcase': (s) => {
    const wasPaused = s.controls.paused;
    s.controls.paused = false;
    tick(s, 0);
    s.controls.paused = wasPaused;
    const nodes = [...s.itemNodes].sort((a, b) => a.tileIndex - b.tileIndex);
    const source = nodes[0];
    const destination = nodes.find((node) => node.tileIndex !== source?.tileIndex);
    const crew = s.crewMembers[0];
    if (source && destination && crew) {
      source.items = { tradeGood: Math.min(8, source.capacity) };
      destination.items = {};
      crew.tileIndex = source.tileIndex;
      crew.x = source.tileIndex % s.width + 0.5;
      crew.y = Math.floor(source.tileIndex / s.width) + 0.5;
      crew.path = [];
      crew.activeJobId = 99601;
      crew.carryingItemType = null;
      crew.carryingAmount = 0;
      s.jobs = [{
        id: 99601,
        type: 'deliver',
        itemType: 'tradeGood',
        amount: Math.min(8, source.capacity),
        fromTile: source.tileIndex,
        toTile: destination.tileIndex,
        assignedCrewId: crew.id,
        createdAt: s.now,
        expiresAt: s.now + 180,
        state: 'assigned',
        pickedUpAmount: 0,
        completedAt: null,
        lastProgressAt: s.now,
        stallReason: 'none'
      }];
      s.jobSpawnCounter = Math.max(s.jobSpawnCounter, 99602);
    }
    s.controls.shipsPerCycle = 0;
    s.controls.paused = true;
  },

  // Phase 6 visual fixture: a returning passenger and a bulky freight cart
  // attempt a head-on exchange. The production movement coordinator generates
  // both world-space wait reasons before the paused frame is presented.
  'cargo-boarding-conflict': (s) => {
    const wasPaused = s.controls.paused;
    s.controls.paused = false;
    tick(s, 0);
    s.controls.paused = wasPaused;
    const walkable = (idx: number): boolean =>
      (s.tiles[idx] === TileType.Floor || s.tiles[idx] === TileType.Door) &&
      s.modules[idx] === ModuleType.None;
    let passengerTile = -1;
    let cargoTile = -1;
    const centerX = Math.floor(s.width / 2);
    const centerY = Math.floor(s.height / 2);
    for (let radius = 0; radius < Math.max(s.width, s.height) && passengerTile < 0; radius += 1) {
      for (let y = Math.max(1, centerY - radius); y <= Math.min(s.height - 2, centerY + radius); y += 1) {
        for (let x = Math.max(1, centerX - radius); x < Math.min(s.width - 2, centerX + radius); x += 1) {
          const left = y * s.width + x;
          const right = left + 1;
          if (!walkable(left) || !walkable(right)) continue;
          passengerTile = left;
          cargoTile = right;
          break;
        }
        if (passengerTile >= 0) break;
      }
    }
    const cargo = s.crewMembers[0];
    if (passengerTile >= 0 && cargoTile >= 0 && cargo) {
      s.visitors.length = 0;
      s.residents.length = 0;
      s.crewMembers = [cargo];
      addFailureShowcaseVisitor(s, 99620, passengerTile % s.width, Math.floor(passengerTile / s.width), 'balking', 'hunger');
      const visitor = s.visitors.find((candidate) => candidate.id === 99620);
      if (visitor) {
        visitor.state = VisitorState.ToDock;
        visitor.transferPhase = 'boarding-queued';
        visitor.path = [cargoTile];
        visitor.speed = 10;
        visitor.movementWaitReason = undefined;
        visitor.movementBlockedTile = null;
        visitor.blockedTicks = 0;
        cargo.tileIndex = cargoTile;
        cargo.x = (cargoTile % s.width) + 0.5;
        cargo.y = Math.floor(cargoTile / s.width) + 0.5;
        cargo.path = [passengerTile];
        cargo.speed = 10;
        cargo.carryingItemType = 'rawMaterial';
        cargo.carryingAmount = 8;
        cargo.activeJobId = 99620;
        cargo.movementWaitReason = undefined;
        cargo.blockedTicks = 0;
        runMovementCoordinatorTestTick(s, 0.1);
        s.now += 0.1;
        runMovementCoordinatorTestTick(s, 0.1);
        s.now += 0.1;
      }
    }
    s.controls.shipsPerCycle = 0;
    s.controls.spriteMode = 'sprites';
    s.controls.showSpriteFallback = false;
    s.controls.paused = true;
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
    // Leave two clear tiles in front of the west-facing checkout. This is the
    // physical point of the fixture: crowd capacity comes from authored floor
    // space, not an invisible queue counter packed against a wall.
    placeMod(s, 10, 21, ModuleType.CheckoutBank);
    placeMod(s, 6, 21, ModuleType.ShelfAisle);
    placeMod(s, 13, 21, ModuleType.ShelfAisle);
    placeMod(s, 13, 26, ModuleType.Vent);
    for (let y = 20; y < 29; y++) {
      for (let x = 5; x < 15; x++) {
        const tileIndex = y * s.width + x;
        s.zones[tileIndex] = ZoneType.Public;
        if (s.tiles[tileIndex] !== TileType.Wall) s.pressurized[tileIndex] = true;
      }
    }
    seedItemNodeStock(s, 6, 21, 'tradeGood', 12);
    seedItemNodeStock(s, 13, 21, 'tradeGood', 12);
    stageMarketShowcase(s, 6);
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

  // Paired berth chips for the two authored reasons that can change a long
  // visit clock. The production transitions are covered by failed-stay tests;
  // this paused fixture makes their world-space explanation easy to inspect.
  'visit-schedule-showcase': (s) => {
    unlockThrough(s, 3);
    applyDemoStationOverlay(s);
    const berthAnchors = roomClusterAnchorsForScenario(s, RoomType.Berth);
    if (berthAnchors.length < 2) throw new Error('Visit schedule showcase requires two Berths.');
    s.arrivingShips.length = 0;
    s.arrivingShips.push(
      visitScheduleShowcaseShip(s, 99301, berthAnchors[0], 'service-failure'),
      visitScheduleShowcaseShip(s, 99302, berthAnchors[1], 'remaining-work')
    );
    s.controls.paused = true;
  },

  // Integration fixture for the full medium-call loop. It begins before
  // admission so the player still makes the Approach Control decision; every
  // later ship, passenger, cargo and settlement state is production-owned.
  'mixed-berth-visit': (s) => {
    unlockThrough(s, 3);
    applyDemoStationOverlay(s);

    // The ordinary demo packs two compact bays onto one frontage. This call
    // uses a broad repair tender, so give it one honest bay with four tiles of
    // lateral approach clearance instead of weakening the hull envelope.
    for (let y = 27; y <= 46; y++) {
      const outsidePrimaryBerth = y < 31 || y > 42;
      if (!outsidePrimaryBerth) continue;
      for (let x = 68; x <= 75; x++) {
        const tile = y * s.width + x;
        removeModuleAtTile(s, tile);
        setTile(s, tile, TileType.Space);
        setRoom(s, tile, RoomType.None);
      }
    }
    // Crop the east half of Security back to a sealed vertical bulkhead. The
    // repair bay's approach margin must be exterior space without opening the
    // public deck behind it to vacuum.
    for (let y = 20; y <= 30; y++) {
      for (let x = 68; x <= 75; x++) {
        const tile = y * s.width + x;
        removeModuleAtTile(s, tile);
        setTile(s, tile, TileType.Space);
        setRoom(s, tile, RoomType.None);
      }
      const seal = y * s.width + 67;
      removeModuleAtTile(s, seal);
      setTile(s, seal, TileType.Wall);
      setRoom(s, seal, RoomType.None);
    }
    // Merge the former stacked compact bays into one ten-tile-deep repair bay.
    // Its room area is usable clearance; the west bulkhead seals the station
    // and the east edge remains open to the vessel.
    for (let y = 31; y <= 42; y++) {
      for (let x = 68; x <= 75; x++) {
        const tile = y * s.width + x;
        removeModuleAtTile(s, tile);
        const bulkhead = x === 68 || y === 31 || y === 42;
        setTile(s, tile, bulkhead ? TileType.Wall : TileType.Floor);
        setRoom(s, tile, bulkhead ? RoomType.None : RoomType.Berth);
      }
      if (y > 31 && y < 42) {
        setTile(s, y * s.width + 76, TileType.Space);
        setRoom(s, y * s.width + 76, RoomType.None);
      }
    }
    setTile(s, 36 * s.width + 68, TileType.Door);
    setRoom(s, 36 * s.width + 68, RoomType.Berth);
    placeMod(s, 68, 36, ModuleType.AccessGate);
    placeMod(s, 75, 36, ModuleType.Gangway);
    placeMod(s, 69, 34, ModuleType.CustomsCounter);
    placeMod(s, 73, 33, ModuleType.CargoArm);

    // Seal the cropped Security room and arrival corridor where the broad
    // bay's exterior clearance replaces the old lower berth.
    for (let y = 43; y <= 46; y++) setTile(s, y * s.width + 67, TileType.Wall);

    const publicRooms = new Set<RoomType>([
      RoomType.Cafeteria,
      RoomType.Market,
      RoomType.Lounge,
      RoomType.Cantina,
      RoomType.Observatory,
      RoomType.RecHall,
      RoomType.Hygiene
    ]);
    for (let tile = 0; tile < s.rooms.length; tile += 1) {
      if (publicRooms.has(s.rooms[tile])) s.zones[tile] = ZoneType.Public;
    }

    // The mixed fixture fields eighteen crew, so replace the old five-bed demo
    // dorm with sixteen compact bunks plus two private beds. Guest lodging below
    // remains a separate public resource and cannot satisfy crew quarters.
    for (let y = 7; y < 14; y++) {
      for (let x = 6; x < 14; x++) removeModuleAtTile(s, y * s.width + x);
    }
    for (const x of [6, 8, 10, 12]) placeMod(s, x, 7, ModuleType.BunkBank);
    placeMod(s, 7, 12, ModuleType.Bed);
    placeMod(s, 11, 12, ModuleType.Bed);

    // Guest bunks are separate from crew quarters. A six-person repair call
    // can fill this small public lodging room rather than commandeering the
    // crew's sleep capacity.
    for (let y = 31; y < 42; y++) {
      for (let x = 38; x < 49; x++) removeModuleAtTile(s, y * s.width + x);
    }
    paintRoom(s, 38, 31, 49, 42, RoomType.Dorm, 'north');
    placeMod(s, 40, 34, ModuleType.BunkBank);
    placeMod(s, 44, 34, ModuleType.BunkBank);
    for (let y = 32; y < 41; y++) {
      for (let x = 39; x < 48; x++) {
        const tile = y * s.width + x;
        s.zones[tile] = ZoneType.Public;
        s.roomHousingPolicies[tile] = 'visitor';
      }
    }

    // Preserve visible cafeteria custody: meals and trays start at counters,
    // while later replenishment still has to move through the station.
    seedItemNodeStock(s, 16, 13, 'cleanTray', 18);
    seedItemNodeStock(s, 19, 13, 'cleanTray', 18);

    // Materialize the expanded crew pool before traffic is admitted, then put
    // the roles this mixed call exercises on Alpha Watch. The customs gate is
    // intentionally real, but a deterministic showcase must not deadlock only
    // because its sole Cargo Handler rolled onto the next watch.
    const addedHandlers = Math.min(2, s.crew.roleCounts.assistant);
    s.crew.roleCounts.assistant -= addedHandlers;
    s.crew.roleCounts['cargo-handler'] += addedHandlers;
    tick(s, 0);
    for (const crew of s.crewMembers) {
      if (crew.staffRole === 'cargo-handler' || crew.staffRole === 'engineer' ||
        crew.staffRole === 'steward' || crew.staffRole === 'cook') {
        crew.shiftBucket = 0;
      }
    }

    s.controls.shipsPerCycle = 0;
    s.controls.manualTrafficAdmission = true;
    s.trafficOffers.length = 0;
    s.arrivingShips.length = 0;
    s.dockQueue.length = 0;
    s.portOps.contracts.length = 0;
    s.portOps.cargoLots.length = 0;
    s.portOps.settlements.length = 0;
    const offer = mixedBerthShowcaseOffer(s);
    s.trafficOffers.push(offer);
    s.controls.paused = true;
  },

  // Phase 6 production fixture: the only public exit from this compact mess
  // is also the lower berth's passenger throat. One dining ship can therefore
  // create a real, stocked service line through that Door while a second ship
  // later recalls its own passengers through the same physical tile.
  'meal-queue-boarding-conflict': (s) => {
    unlockThrough(s, 6);
    applyDemoStationOverlay(s);

    // Remove the broad demo cafeteria so its counters cannot absorb demand.
    for (let y = 6; y < 15; y += 1) {
      for (let x = 15; x < 25; x += 1) {
        removeModuleAtTile(s, y * GRID_WIDTH + x);
        setRoom(s, y * GRID_WIDTH + x, RoomType.None);
      }
    }

    // Rebuild the east frontage as two separate medium berths. The east face
    // is exposed to space; each bay has its own Control, clamps and Gangway.
    // The south berth's public approach is deliberately through the mess door.
    for (let y = 18; y < 44; y += 1) {
      for (let x = 55; x < 77; x += 1) {
        removeModuleAtTile(s, y * GRID_WIDTH + x);
        setTile(s, y * GRID_WIDTH + x, TileType.Space);
        setRoom(s, y * GRID_WIDTH + x, RoomType.None);
      }
    }
    for (let y = 18; y < 37; y += 1) {
      for (let x = 49; x < 68; x += 1) {
        setTile(s, y * GRID_WIDTH + x, TileType.Floor);
        setRoom(s, y * GRID_WIDTH + x, RoomType.None);
      }
    }
    // A narrow bridge lets the upper ship's visitors reach the one shared
    // public door before the meal line seals it.
    for (let y = 27; y <= 37; y += 1) {
      const x = 68;
      setTile(s, y * GRID_WIDTH + x, TileType.Floor);
      setRoom(s, y * GRID_WIDTH + x, RoomType.None);
    }

    const paintBerth = (y1: number, y2: number, gangwayY: number): void => {
      for (let y = y1; y <= y2; y += 1) {
        for (let x = 68; x <= 74; x += 1) {
          setTile(s, y * GRID_WIDTH + x, TileType.Floor);
          setRoom(s, y * GRID_WIDTH + x, RoomType.Berth);
        }
      }
      placeMod(s, 68, y1, ModuleType.BerthControl);
      placeMod(s, 71, y1, ModuleType.DockingClamp);
      placeMod(s, 71, y2, ModuleType.DockingClamp);
      placeMod(s, 74, gangwayY, ModuleType.Gangway);
    };
    paintBerth(22, 26, 24);
    paintBerth(38, 42, 40);
    // Berth facing is derived from exterior contact. Seal the north/south
    // edges so the only broad exterior face is east; keep the one-tile bridge
    // intact between the otherwise-separated bays.
    for (const y of [21, 27, 37, 43]) {
      for (let x = 68; x <= 74; x += 1) {
        if ((y === 27 || y === 37) && x === 68) continue;
        setTile(s, y * GRID_WIDTH + x, TileType.Wall);
        setRoom(s, y * GRID_WIDTH + x, RoomType.None);
      }
    }
    // The exposed berth rooms are separated from the inhabited deck by real
    // pressure barriers. The south Airlock sits directly beyond the cafeteria
    // Door, so the same one-tile throat governs both the meal line and return
    // boarding without turning this proof into an oxygen failure.
    for (const [x, y] of [[68, 24], [68, 40]] as const) {
      const tile = y * GRID_WIDTH + x;
      setTile(s, tile, TileType.Airlock);
      setRoom(s, tile, RoomType.Berth);
    }

    // Compact but valid public cafeteria: two counters, two four-seat tables,
    // and a tray return. Its only Door is the lower berth's access throat.
    paintRoom(s, 58, 36, 68, 44, RoomType.Cafeteria, 'east');
    const throat = 40 * GRID_WIDTH + 67;
    setTile(s, throat, TileType.Door);
    setRoom(s, throat, RoomType.Cafeteria);
    for (let y = 37; y < 43; y += 1) {
      for (let x = 59; x < 67; x += 1) s.zones[y * GRID_WIDTH + x] = ZoneType.Public;
    }
    s.zones[throat] = ZoneType.Public;
    placeMod(s, 59, 37, ModuleType.ServingStation);
    placeMod(s, 62, 37, ModuleType.ServingStation);
    placeMod(s, 59, 40, ModuleType.Table);
    placeMod(s, 62, 40, ModuleType.Table);
    placeMod(s, 65, 40, ModuleType.TrayReturn);
    seedItemNodeStock(s, 59, 37, 'meal', 56);
    seedItemNodeStock(s, 59, 37, 'cleanTray', 56);
    seedItemNodeStock(s, 62, 37, 'meal', 56);
    seedItemNodeStock(s, 62, 37, 'cleanTray', 56);

    // The sole public route reaches the north berth through its interior and
    // reaches the south berth only through the cafeteria throat. Seal all
    // remaining east-frontier shortcuts so a line at the Door has a visible,
    // causal consequence rather than merely a local cosmetic effect.
    for (let y = 36; y < 44; y += 1) {
      const tile = y * GRID_WIDTH + 57;
      setTile(s, tile, TileType.Wall);
      setRoom(s, tile, RoomType.None);
    }
    for (const [x, y] of [[58, 39], [58, 40], [58, 41], [67, 38], [67, 39], [67, 41], [67, 42]] as const) {
      const tile = y * GRID_WIDTH + x;
      setTile(s, tile, TileType.Wall);
      setRoom(s, tile, RoomType.None);
    }
    // The demo overlay authors topology directly. Start this finished fixture
    // from an intact pressure snapshot so Approach Control reads the bays,
    // then let ordinary simulation recompute the exterior graph on its first
    // running tick.
    for (let tile = 0; tile < s.tiles.length; tile += 1) {
      if (s.tiles[tile] === TileType.Floor || s.tiles[tile] === TileType.Door || s.tiles[tile] === TileType.Airlock) {
        s.pressurized[tile] = true;
      }
    }
    s.controls.shipsPerCycle = 0;
    s.controls.manualTrafficAdmission = true;
    s.trafficOffers.length = 0;
    s.arrivingShips.length = 0;
    s.dockQueue.length = 0;
    s.portOps.contracts.length = 0;
    s.portOps.cargoLots.length = 0;
    s.portOps.settlements.length = 0;
    s.trafficOffers.push(
      mealQueueBoardingOffer(s, 'DINERS', 24),
      mealQueueBoardingOffer(s, 'RETURN', 4)
    );
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

function stageOpeningFoodCycle(state: StationState): void {
  state.metrics.credits = Math.max(state.metrics.credits, 1200);
  const width = 3;
  const height = 7;
  let roomTiles: number[] | null = null;
  for (let y = 1; y <= state.height - height - 1 && roomTiles === null; y += 1) {
    for (let x = 1; x <= state.width - width - 1 && roomTiles === null; x += 1) {
      const candidate: number[] = [];
      let valid = true;
      for (let dy = 0; dy < height && valid; dy += 1) {
        for (let dx = 0; dx < width && valid; dx += 1) {
          const tile = (y + dy) * state.width + x + dx;
          if (
            state.tiles[tile] !== TileType.Floor ||
            state.rooms[tile] !== RoomType.None ||
            state.moduleOccupancyByTile[tile] !== null
          ) valid = false;
          candidate.push(tile);
        }
      }
      if (valid) roomTiles = candidate;
    }
  }
  if (!roomTiles) throw new Error('Opening food showcase could not find a public Cafeteria footprint.');
  for (const tile of roomTiles) {
    setRoom(state, tile, RoomType.Cafeteria);
    state.zones[tile] = ZoneType.Public;
  }
  tick(state, 0);

  const placeInRoom = (module: ModuleType): number => {
    for (const rotation of [0, 90] as const) {
      for (const tile of roomTiles ?? []) {
        const placed = tryPlaceModule(state, module, tile, rotation);
        if (placed.ok) return tile;
      }
    }
    throw new Error(`Opening food showcase could not place ${module}.`);
  };
  const counterA = placeInRoom(ModuleType.ServingStation);
  const counterB = placeInRoom(ModuleType.ServingStation);
  placeInRoom(ModuleType.Table);
  placeInRoom(ModuleType.Table);
  placeInRoom(ModuleType.TrayReturn);
  tick(state, 0);
  for (const counter of [counterA, counterB]) {
    const node = state.itemNodes.find((candidate) => candidate.tileIndex === counter);
    if (!node) throw new Error('Opening food showcase Serving Station has no inventory node.');
    node.items.meal = 12;
    node.items.cleanTray = 12;
  }

  state.controls.paused = false;
  state.controls.manualTrafficAdmission = false;
  state.controls.shipsPerCycle = 6;
  for (let elapsed = 0; elapsed < 150; elapsed += 0.1) {
    tick(state, 0.1);
    if (state.openingEconomy.ledger.recent.some((event) =>
      event.kind === 'retail-sale' && event.label === 'Prepared meal sold'
    )) break;
  }
  state.controls.paused = true;
}

function stageMarketShowcase(state: StationState, shopperCount: number): void {
  while ((state.crew.roleCounts.steward ?? 0) < 2) {
    if (!hireStaffRole(state, 'steward')) break;
  }

  const checkout = state.moduleInstances.find((module) => module.type === ModuleType.CheckoutBank);
  const staffSlots = checkout
    ? resolveFacilitySlots(checkout, state.width).filter((slot) => slot.role === 'checkout-staff')
    : [];
  const stewards = state.crewMembers.filter((crew) => crew.staffRole === 'steward');
  for (let index = 0; index < Math.min(staffSlots.length, stewards.length); index += 1) {
    const crew = stewards[index];
    const slot = staffSlots[index];
    crew.assignedSystem = 'market';
    crew.lastSystem = 'market';
    crew.role = 'cafeteria';
    crew.targetTile = slot.tileIndex;
    crew.tileIndex = slot.tileIndex;
    crew.x = (slot.tileIndex % state.width) + 0.5;
    crew.y = Math.floor(slot.tileIndex / state.width) + 0.5;
    crew.path = [];
    crew.resting = false;
    crew.energy = 100;
    crew.hunger = 100;
    crew.hygiene = 100;
    crew.bladder = 100;
    crew.thirst = 100;
    crew.morale = 100;
    crew.retargetAt = state.now + 120;
    crew.taskLockUntil = state.now + 120;
  }

  for (let index = 0; index < shopperCount; index += 1) {
    const x = 7 + (index % 6);
    const y = 17 + Math.floor(index / 6);
    const tileIndex = y * state.width + x;
    state.visitors.push({
      id: 99200 + index,
      name: `Shopper ${index + 1}`,
      trait: index % 2 === 0 ? 'patient' : 'social',
      x: x + 0.5,
      y: y + 0.5,
      tileIndex,
      state: VisitorState.ToLeisure,
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
      archetype: 'shopper',
      taxSensitivity: 1,
      spendMultiplier: 1,
      patienceMultiplier: 1,
      primaryPreference: 'market',
      spawnedAt: state.now,
      originShipId: null,
      airExposureSec: 0,
      healthState: 'healthy',
      leisureLegsRemaining: 1,
      leisureLegsPlanned: 1,
      lastLeisureKind: null,
      servicePlan: [],
      completedServices: [],
      activeService: null,
      stayClass: 'errand',
      needs: undefined,
      recurringNeedActive: null,
      marketTradeGoodSourceTile: null,
      temporarySleepTargetTile: null,
      queueProviderTile: null,
      queueJoinedAt: null
    });
  }
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
  // The public band otherwise forms an unbroken bulkhead between the main
  // concourse and the lower operations deck. This second rec-hall door is the
  // deliberate public-to-arrivals circulation route.
  for (const x of [49, 50, 51]) {
    setTile(state, 20 * state.width + x, TileType.Door);
    setRoom(state, 20 * state.width + x, RoomType.RecHall);
    setTile(state, 28 * state.width + x, TileType.Door);
    setRoom(state, 28 * state.width + x, RoomType.RecHall);
  }

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
  placeMod(state, 22, 13, ModuleType.TrayReturn);
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
  placeMod(state, 10, 34, ModuleType.ReactorCore);
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

  // This fixture replaces the starter shell, so its logical spawn point and
  // existing actors must move with it. Otherwise crew remain marooned on
  // coordinates that are now exterior space and every service looks broken.
  state.core.serviceTile = 17 * state.width + 40;
  for (let index = 0; index < state.crewMembers.length; index++) {
    const crew = state.crewMembers[index];
    const tile = 17 * state.width + 30 + index;
    crew.tileIndex = tile;
    crew.x = (tile % state.width) + 0.5;
    crew.y = Math.floor(tile / state.width) + 0.5;
    crew.targetTile = null;
    crew.path = [];
  }
  for (let y = 7; y < 14; y++) {
    for (let x = 6; x < 14; x++) state.roomHousingPolicies[y * state.width + x] = 'crew';
  }
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
