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
import { resolveFacilitySlots, type FacilitySlotRole } from './facility-descriptors';
import { buildSlotReservationRequest } from './facility-slots';
import { createVisitorNeeds } from './occupant-demand';
import { findPath } from './path';
import { planStructuralPieceConstruction } from './construction';
import { validateStructuralSupportPlan } from './structural-support';
import { GRID_WIDTH, TileType, RoomType, ModuleType, VisitorState, ZoneType,
  type ModuleInstance,
  type ModuleRotation,
  type VisitorPreference,
  type HospitalityServiceKind,
  type ShipType,
  type ShipSize,
  isWalkable
} from './types';
import type { ArrivingShip, ItemType, SpecialtyId, StationState, TrafficOffer, UnlockId, UnlockTier, Visitor, VisitorServiceFailureStage, RecurringNeedKind } from './types';
import { admitTrafficOffer, buildStationExpansionOnTruss, buyMaterials, buyRawFood, canPlaceUtilityUnderlay, getApproachConflictGroups, getPodDockAttachmentView, getPodDockFuelSupplyView, hireStaffRole, mapConditionAt, orderFuelDetailed, planStationExpansionOnTruss, planTileConstruction, reconcileExteriorIntegrityTargets, removeModuleAtTile, runMovementCoordinatorTestTick, setBerthCustomsPolicy, setBerthScreeningLevel, setDockPurpose, setExteriorIntegrityTargetState, setExteriorIntegrityTargetWear, setTile, setRoom, setModule, setUtilityUnderlayTile, tick, tryCreateReservation, tryPlaceModule, tryPlaceModuleWithCredits, validateDockPlacement } from './sim';

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

  // Gate A proof: the ordinary shell becomes a small public shop. The starter
  // Steward walks to the Checkout Bank through the real crew assignment path;
  // nothing is teleported into a fixture. The fixture pauses on the first
  // physical shelf-to-checkout sale so the player can inspect the machine.
  'opening-supplies-cycle': (s) => {
    stageOpeningSuppliesCycle(s);
  },

  // Gate A proof: construct a real Fuel Coupler/Tank/Pipe chain on the
  // ordinary starter, procure fuel through the Freight Locker, then wait for
  // one normal Pod Dock refuel before pausing on the paid result.
  'opening-refuel-cycle': (s) => {
    stageOpeningRefuelCycle(s);
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
  'structural-expansion-material-blocked': (s) => {
    planScenarioStructuralExpansion(s, true);
    s.legacyMaterialStock = 0;
    for (const node of s.itemNodes) node.items.rawMaterial = 0;
    s.metrics.materials = 0;
    s.controls.materialAutoImportEnabled = false;
    s.controls.paused = false;
  },
  'structural-truss-active': (s) => {
    const candidate = s.tiles.findIndex((tile, index) => {
      if (tile !== TileType.Space) return false;
      const x = index % s.width;
      const y = Math.floor(index / s.width);
      return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nextX = x + dx;
        const nextY = y + dy;
        if (nextX < 0 || nextY < 0 || nextX >= s.width || nextY >= s.height) return false;
        return s.tiles[nextY * s.width + nextX] === TileType.Truss;
      });
    });
    if (candidate < 0) throw new Error('Truss showcase could not find an open extension tile.');
    const planned = planTileConstruction(s, candidate, TileType.Truss);
    if (!planned.ok) throw new Error(`Truss showcase failed: ${planned.reason ?? 'unknown'}`);
    const site = s.constructionSites.find((entry) => entry.tileIndex === candidate);
    if (site) site.buildWorkRequired = 60;
    s.controls.paused = false;
  },

  // A player-visible counterpart to the deterministic target-scale runner.
  // It deliberately uses real rooms, modules, roles, needs, and interfaces so
  // frame pacing and operational failures can be judged in the live client.
  'normal-scale-50': (s) => {
    unlockThrough(s, 3);
    completeSpecialtyForScenario(s, 'sanitation-program');
    completeSpecialtyForScenario(s, 'security-command');
    completeSpecialtyForScenario(s, 'mechanical-maintenance');
    applyDemoStationOverlay(s);
    installScalePowerReserve(s);
    tick(s, 0);
    installScaleDockInterfaces(s, 8);
    // Add the live receiving face after legacy demo inventory has migrated so
    // the pallet remains available to the guaranteed mixed call.
    placeMod(s, 64, 34, ModuleType.IntakePallet);
    tick(s, 0);
    seedScaleStorageReserve(s, 40);

    const counts = createEmptyStaffRoleCounts();
    counts.captain = 1;
    counts.cook = 6;
    counts.steward = 6;
    counts['cargo-handler'] = 12;
    counts.cleaner = 5;
    counts.janitor = 3;
    counts.botanist = 3;
    counts.technician = 4;
    counts.engineer = 4;
    counts['security-guard'] = 3;
    counts.assistant = 3;
    s.crew.roleCounts = counts;
    s.crew.total = totalStaffCount(counts);
    s.crew.free = s.crew.total;
    s.crew.assigned = 0;
    s.command.officers.captain = true;
    tick(s, 0);
    for (const crew of s.crewMembers) {
      crew.energy = 100;
      crew.hunger = 100;
      crew.hygiene = 100;
      crew.bladder = 100;
      crew.thirst = 100;
      crew.morale = 100;
      crew.missedPayrollCycles = 0;
      crew.needsStrainSec = 0;
      crew.resignationNoticeAt = null;
      crew.airExposureSec = 0;
      crew.healthState = 'healthy';
    }
    // Keep a small receiving watch physically near the Berths. The rest of
    // the twelve-person logistics pool still follows ordinary shift and job
    // assignment rules, but the scale proof must not depend on whether every
    // qualified handler begins at the far end of the 70-tile deck.
    const receivingWatch = s.crewMembers
      .filter((crew) => crew.staffRole === 'cargo-handler')
      .sort((left, right) => left.id - right.id)
      .slice(0, 4);
    for (let index = 0; index < receivingWatch.length; index += 1) {
      const crew = receivingWatch[index]!;
      const tile = 40 * s.width + 52 + index;
      crew.shiftBucket = 0;
      crew.tileIndex = tile;
      crew.x = (tile % s.width) + 0.5;
      crew.y = Math.floor(tile / s.width) + 0.5;
      crew.targetTile = null;
      crew.path = [];
      crew.activeJobId = null;
    }

    const publicFloors = s.tiles
      .map((tile, index) => ({ tile, index }))
      .filter(
        ({ tile, index }) =>
          tile === TileType.Floor &&
          s.zones[index] === ZoneType.Public &&
          s.moduleOccupancyByTile[index] === null &&
          s.rooms[index] !== RoomType.None &&
          s.rooms[index] !== RoomType.Berth
      )
      .map(({ index }) => index);
    if (publicFloors.length === 0) throw new Error('Normal-scale fixture needs public floor tiles.');
    s.visitors = Array.from({ length: 50 }, (_, index) =>
      createScaleVisitor(s, 950_000 + index, publicFloors[(index * 17) % publicFloors.length]!, index)
    );
    seedItemNodeStock(s, 7, 22, 'tradeGood', 32);
    seedItemNodeStock(s, 10, 22, 'tradeGood', 32);
    s.metrics.credits = 20_000;
    s.controls.shipsPerCycle = 6;
    s.controls.manualTrafficAdmission = false;
    s.controls.portAutoAdmitEnabled = true;
    // Keep ordinary small-craft traffic, but guarantee that the benchmark
    // also exercises a real medium Berth, cargo custody, passenger transfer,
    // and overlapping approach pressure instead of being eight idle doors.
    const mixedOffer = mixedBerthShowcaseOffer(s);
    // The compact demo Berths accept a medium shuttle but do not have the
    // four-tile exterior service clearance required by the repair-tender hull.
    // Keep the mixed cargo/passenger contract while using compatible geometry.
    mixedOffer.hullVariant = 'passenger-shuttle';
    mixedOffer.shipName = 'Longwatch Cargo Shuttle';
    // This scale proof isolates the interaction under test: one passenger
    // meal cohort sharing the deck with inbound freight. The broader mixed
    // visit fixture already covers the 14-unit manifest, drinks, leisure,
    // hygiene, comfort, and outbound loading. Repeating every promise here
    // made the benchmark call fail for unrelated reasons before the loaded
    // cafeteria could recover.
    mixedOffer.hospitalityDemand = { meal: 5, drink: 0, leisure: 0, restroom: 0, hygiene: 0, comfort: 0 };
    mixedOffer.inboundCargo = { rawMaterial: 6, rawMeal: 0, tradeGood: 4 };
    mixedOffer.outboundRequest = { rawMaterial: 0, meal: 0, tradeGood: 0 };
    mixedOffer.requestedServices = ['cafeteria'];
    mixedOffer.berthTimeSec = 480;
    s.trafficOffers.push(mixedOffer);
    const admitted = admitTrafficOffer(s, mixedOffer.id);
    if (!admitted.ok) {
      throw new Error(`Normal-scale fixture could not admit its mixed call: ${admitted.reason ?? 'unknown'}`);
    }
    s.controls.paused = true;
    s.controls.simSpeed = 1;
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

  // --- Market: one checkout, restock crosses the shop floor ---------------
  // Legal and cheap. The single register forms a line, and the only route
  // from the backroom to the shelves runs straight through it.
  // Compare with `?scenario=market-improved-flow`.
  'market-compact-conflict': (s) => {
    readyFacilityScenario(s);
    paintFacilityBlock(s, 42, 49, 16, 9, RoomType.Market);
    const checkout = placeFixture(s, ModuleType.CheckoutBank, 46, 50);
    const shelf = placeFixture(s, ModuleType.ShelfAisle, 43, 50);
    // Backroom sits BEHIND the customer frontage, so every restock bundle has
    // to cross the queue that forms west of the register.
    const backroom = placeFixture(s, ModuleType.BackroomStockBank, 43, 55);
    tick(s, 0);
    stockNode(s, shelf.originTile, 'tradeGood', 6);
    stockNode(s, backroom.originTile, 'tradeGood', 90);
    void checkout;
    stageFacilityStaff(s, ModuleType.CheckoutBank, 'checkout-staff');
    stageFacilityVisitors(s, 8, 51, 52, 'market');
    s.controls.paused = true;
  },

  // --- Market: two checkouts, restock kept off the customer floor ---------
  // Same demand, same stock, more money spent on a second register AND on a
  // backroom placed against the shelf's stock face instead of behind the line.
  'market-improved-flow': (s) => {
    readyFacilityScenario(s);
    paintFacilityBlock(s, 42, 49, 16, 9, RoomType.Market);
    placeFixture(s, ModuleType.CheckoutBank, 46, 50);
    placeFixture(s, ModuleType.CheckoutBank, 49, 50);
    const shelf = placeFixture(s, ModuleType.ShelfAisle, 43, 50);
    const shelfTwo = placeFixture(s, ModuleType.ShelfAisle, 44, 50);
    // Backroom on the shelves' service side: restock never enters the queue.
    const backroom = placeFixture(s, ModuleType.BackroomStockBank, 55, 50);
    tick(s, 0);
    stockNode(s, shelf.originTile, 'tradeGood', 6);
    stockNode(s, shelfTwo.originTile, 'tradeGood', 6);
    stockNode(s, backroom.originTile, 'tradeGood', 90);
    shelfTwo.shelfMix = 'gifts';
    stageFacilityStaff(s, ModuleType.CheckoutBank, 'checkout-staff');
    stageFacilityVisitors(s, 8, 51, 52, 'market');
    s.controls.paused = true;
  },

  // --- Cantina: service capacity with nowhere to sit ----------------------
  // A full Service Bar and no dwell positions. Drinks get poured; drinkers
  // have nowhere to go, so the bar jams behind its own guests.
  'cantina-undersized': (s) => {
    readyFacilityScenario(s);
    paintFacilityBlock(s, 42, 49, 14, 9, RoomType.Cantina);
    const bar = placeFixture(s, ModuleType.ServiceBar, 44, 50);
    tick(s, 0);
    stockNode(s, bar.originTile, 'rawMaterial', 40);
    stageFacilityStaff(s, ModuleType.ServiceBar, 'bar-staff');
    stageFacilityVisitors(s, 8, 50, 52, 'lounge', ['drink'], 99600);
    s.controls.paused = true;
  },

  // --- Cantina: a connected run plus real dwell capacity ------------------
  // The same bar extended with a Corner and an End into one provider run,
  // backed by Booth Banks and a Standing Rail.
  'cantina-expanded': (s) => {
    readyFacilityScenario(s);
    paintFacilityBlock(s, 42, 49, 16, 12, RoomType.Cantina);
    const bar = placeFixture(s, ModuleType.ServiceBar, 44, 50);
    const corner = placeFixture(s, ModuleType.BarCorner, 44, 55);
    const end = placeFixture(s, ModuleType.BarEnd, 44, 57);
    placeFixture(s, ModuleType.BoothBank, 50, 50);
    placeFixture(s, ModuleType.BoothBank, 53, 50);
    placeFixture(s, ModuleType.StandingRail, 56, 50);
    tick(s, 0);
    stockNode(s, bar.originTile, 'rawMaterial', 40);
    stockNode(s, corner.originTile, 'rawMaterial', 10);
    stockNode(s, end.originTile, 'rawMaterial', 6);
    stageFacilityStaff(s, ModuleType.ServiceBar, 'bar-staff');
    stageFacilityVisitors(s, 8, 50, 60, 'lounge', ['drink'], 99600);
    s.controls.paused = true;
  },

  // --- Reception: mixed demand, nobody to ask -----------------------------
  // Arrivals with several different wants and no Arrival Desk. Every guest
  // guesses its first destination from its own preference alone.
  'reception-absent': (s) => {
    readyFacilityScenario(s);
    paintFacilityBlock(s, 42, 49, 16, 9, RoomType.Lounge);
    placeFixture(s, ModuleType.Couch, 43, 50);
    placeFixture(s, ModuleType.Couch, 43, 52);
    placeFixture(s, ModuleType.Couch, 43, 54);
    placeFixture(s, ModuleType.Couch, 43, 56);
    placeFixture(s, ModuleType.GameStation, 46, 50);
    placeFixture(s, ModuleType.GameStation, 46, 52);
    tick(s, 0);
    // Hidden mixed demand. Everyone can plausibly try the lounge first, but
    // half actually need a comfort fixture and will realize that only after
    // reaching the social seating. The other half guessed correctly.
    const hidden = [
      ...stageFacilityVisitors(s, 4, 48, 52, 'lounge', ['comfort', 'leisure'], 99500),
      ...stageFacilityVisitors(s, 4, 52, 52, 'lounge', ['leisure', 'comfort'], 99520)
    ];
    for (const visitor of hidden) {
      visitor.activeService = null;
      visitor.revealedServices = [];
    }
    s.controls.paused = true;
  },

  // --- Reception: the identical arrivals, with a staffed desk -------------
  // Same rooms, same demand, plus one Arrival Desk. It reveals part of each
  // guest's demand earlier and improves the first routing choice. A full or
  // unstaffed desk is bypassed, never a gate.
  'reception-staffed': (s) => {
    readyFacilityScenario(s);
    paintFacilityBlock(s, 42, 49, 16, 9, RoomType.Lounge);
    placeFixture(s, ModuleType.Couch, 43, 50);
    placeFixture(s, ModuleType.Couch, 43, 52);
    placeFixture(s, ModuleType.Couch, 43, 54);
    placeFixture(s, ModuleType.Couch, 43, 56);
    placeFixture(s, ModuleType.GameStation, 46, 50);
    placeFixture(s, ModuleType.GameStation, 46, 52);
    placeFixture(s, ModuleType.ArrivalDesk, 50, 50);
    tick(s, 0);
    // The SAME hidden arrivals as `reception-absent`, same ids and same wants.
    const hidden = [
      ...stageFacilityVisitors(s, 4, 48, 52, 'lounge', ['comfort', 'leisure'], 99500),
      ...stageFacilityVisitors(s, 4, 52, 52, 'lounge', ['leisure', 'comfort'], 99520)
    ];
    for (const visitor of hidden) {
      visitor.activeService = null;
      visitor.revealedServices = [];
    }
    stageFacilityStaff(s, ModuleType.ArrivalDesk, 'reception-staff');
    s.controls.paused = true;
  },

  // --- Long stay: one cohort using the guest wing repeatedly --------------
  // Guest Cabins, a Serving Line, a Service Bar and a Wash Bank in reach of
  // each other, so an extended-stay cohort cycles food, drink, hygiene and
  // sleep through real physical sessions rather than a needs meter.
  'long-stay-guest-wing': (s) => {
    readyFacilityScenario(s);
    paintFacilityBlock(s, 42, 49, 12, 9, RoomType.Dorm);
    for (let y = 49; y < 58; y++) {
      for (let x = 42; x < 54; x++) s.roomHousingPolicies[y * s.width + x] = 'visitor';
    }
    placeFixture(s, ModuleType.GuestCabin, 43, 50);
    placeFixture(s, ModuleType.GuestCabin, 47, 50);
    placeFixture(s, ModuleType.BunkBank, 51, 50);

    paintFacilityBlock(s, 58, 49, 12, 9, RoomType.Cafeteria);
    const line = placeFixture(s, ModuleType.ServingLine, 59, 50);
    placeFixture(s, ModuleType.CommunityTable, 63, 50);
    placeFixture(s, ModuleType.TrayReturn, 67, 50);

    paintFacilityBlock(s, 74, 49, 12, 9, RoomType.Cantina);
    const bar = placeFixture(s, ModuleType.ServiceBar, 75, 50);
    placeFixture(s, ModuleType.BoothBank, 79, 50);

    paintFacilityBlock(s, 42, 60, 10, 8, RoomType.Hygiene);
    placeFixture(s, ModuleType.WashBank, 43, 61);
    placeFixture(s, ModuleType.Toilet, 47, 61);
    placeFixture(s, ModuleType.Sink, 48, 61);
    for (let y = 60; y < 68; y++) {
      for (let x = 42; x < 52; x++) s.roomHousingPolicies[y * s.width + x] = 'visitor';
    }

    paintFacilityBlock(s, 58, 60, 12, 8, RoomType.Lounge);
    placeFixture(s, ModuleType.Couch, 59, 61);
    placeFixture(s, ModuleType.GameStation, 62, 61);
    placeFixture(s, ModuleType.Couch, 65, 61);

    // These short public passages turn the five rooms into one reachable
    // guest wing. Each endpoint replaces an exterior wall with a Door; any
    // intervening tiles are a pressurized corridor rather than open space.
    connectFacilityRooms(s, 54, 54, 57, 54); // Dorm -> Cafeteria
    connectFacilityRooms(s, 54, 55, 57, 55);
    connectFacilityRooms(s, 70, 54, 73, 54); // Cafeteria -> Cantina
    connectFacilityRooms(s, 70, 55, 73, 55);
    connectFacilityRooms(s, 46, 58, 46, 59); // Dorm -> Hygiene
    connectFacilityRooms(s, 45, 58, 45, 59);
    connectFacilityRooms(s, 62, 58, 62, 59); // Cafeteria -> Lounge
    connectFacilityRooms(s, 63, 58, 63, 59);
    connectFacilityRooms(s, 52, 63, 57, 63); // Hygiene -> Lounge
    connectFacilityRooms(s, 52, 64, 57, 64);

    tick(s, 0);
    stockNode(s, line.originTile, 'meal', 40);
    stockNode(s, line.originTile, 'cleanTray', 40);
    stockNode(s, bar.originTile, 'rawMaterial', 40);
    stageFacilityStaff(s, ModuleType.ServiceBar, 'bar-staff');

    // The showcase owns its cohort; starter walk-ins would add unrelated
    // errands and obscure whether these eight long-stay guests are cycling.
    s.visitors = [];
    const cohort = stageFacilityVisitors(s, 8, 48, 54, 'lounge', [], 99700);
    const recurringNeeds: RecurringNeedKind[] = ['hunger', 'energy', 'hygiene', 'leisure'];
    for (let index = 0; index < cohort.length; index += 1) {
      const visitor = cohort[index];
      const needs = createVisitorNeeds(visitor.id);
      const pressingNeed = recurringNeeds[index % recurringNeeds.length];
      needs.hunger = 76;
      needs.energy = 76;
      needs.hygiene = 76;
      needs.leisure = 76;
      needs[pressingNeed] = 38 + (index % 2) * 4;
      needs.active = null;
      needs.unmetSince = null;
      visitor.stayClass = 'extended';
      visitor.needs = needs;
      visitor.recurringNeedActive = null;
      visitor.spawnedAt = s.now - 120;
      visitor.leisureLegsRemaining = 0;
      visitor.leisureLegsPlanned = 0;
      // Two guests begin with an optional drink, then join the same recurring
      // need loop as the rest of the cohort. This keeps the scenario independent
      // from a synthetic origin ship or manifest.
      visitor.servicePlan = [];
      visitor.revealedServices = [];
      visitor.completedServices = [];
      visitor.activeService = index < 2 ? 'drink' : null;
      visitor.optionalDrinkActive = index < 2;
      visitor.state = VisitorState.ToLeisure;
    }
    s.controls.paused = true;
  },

  // --- Gate G: a committed long stay with nothing to support it -----------
  // A repair cohort is berthed with no reachable meal, bed, or hygiene. It
  // escalates through the documented ladder, slows its own ship work, and
  // holds the interface. Compare with `?scenario=commitment-recovered`, which
  // uses the SAME seed and the same cohort.
  'commitment-failure': (s) => {
    stageCommitmentCohort(s, { supported: false });
  },

  // --- Gate G: the identical cohort, supported ---------------------------
  // Same seed, same ship, same guests — plus the physical facilities the
  // cohort actually needs. The episodes resolve and the berth releases.
  'commitment-recovered': (s) => {
    stageCommitmentCohort(s, { supported: true });
  },

  // --- Gate G: admission policy under pressure ---------------------------
  // Several routine calls arrive against a nearly-full port with an authored
  // policy: some auto-accept, some hold on a reserve, and the exceptional ones
  // stay manual with their reason shown.
  'admission-policy-pressure': (s) => {
    unlockThrough(s, 3);
    s.metrics.credits = 4000;
    s.controls.manualTrafficAdmission = true;
    s.admissionPolicy = {
      ...s.admissionPolicy,
      enabled: true,
      pod: { ...s.admissionPolicy.pod, enabled: true, shipTypes: ['tourist', 'trader'], reserveFreeInterfaces: 1 },
      berth: { ...s.admissionPolicy.berth, enabled: true, shipTypes: ['trader'], reserveFreeInterfaces: 1 },
      reserveMeals: 6
    };
    const dock = s.docks.find((entry) => entry.sourceKind === 'pod-dock-module');
    if (dock) {
      // Routine calls the policy should take.
      s.trafficOffers.push(commitmentOffer(s, 96001, 'tourist', 'small', dock));
      s.trafficOffers.push(commitmentOffer(s, 96002, 'trader', 'small', dock));
      // Exceptional calls that must stay manual whatever the policy says.
      s.trafficOffers.push(commitmentOffer(s, 96003, 'military', 'medium', dock));
      s.trafficOffers.push(commitmentOffer(s, 96004, 'colonist', 'medium', dock));
      const large = commitmentOffer(s, 96005, 'trader', 'large', dock);
      s.trafficOffers.push(large);
    }
    tick(s, 0);
    s.controls.paused = true;
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

function stageOpeningSuppliesCycle(state: StationState): void {
  state.metrics.credits = Math.max(state.metrics.credits, 1200);
  tick(state, 0);
  const steward = state.crewMembers.find((crew) => crew.staffRole === 'steward');
  if (!steward) throw new Error('Opening supplies showcase requires the starter Steward.');

  // A 3x8 Market is the authored opening footprint. Its Checkout Bank begins
  // one tile in from the west edge, leaving legal public counter frontage.
  // Choose a footprint which the actual Steward can reach before we commit
  // the room paint, rather than staging a register worker in place.
  const width = 3;
  const height = 8;
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
      if (!valid) continue;
      const firstStaffPost = candidate[5];
      const route = findPath(
        state,
        steward.tileIndex,
        firstStaffPost,
        { allowRestricted: true, intent: 'crew', routeSeed: steward.id },
        state.pathOccupancyByTile
      );
      if (route) roomTiles = candidate;
    }
  }
  if (!roomTiles) throw new Error('Opening supplies showcase could not find a reachable public Market footprint.');
  for (const tile of roomTiles) {
    setRoom(state, tile, RoomType.Market);
    state.zones[tile] = ZoneType.Public;
  }

  const checkoutOrigin = roomTiles[1];
  const shelfOrigin = roomTiles[12];
  const checkout = tryPlaceModule(state, ModuleType.CheckoutBank, checkoutOrigin, 0);
  if (!checkout.ok) throw new Error(`Opening supplies showcase could not place Checkout Bank: ${checkout.reason}`);
  const shelf = tryPlaceModule(state, ModuleType.ShelfAisle, shelfOrigin, 0);
  if (!shelf.ok) throw new Error(`Opening supplies showcase could not place Shelf Aisle: ${shelf.reason}`);
  tick(state, 0);

  const shelfNode = state.itemNodes.find((node) => node.tileIndex === shelfOrigin);
  if (!shelfNode) throw new Error('Opening supplies showcase Shelf Aisle has no inventory node.');
  shelfNode.items.tradeGood = Math.max(shelfNode.items.tradeGood ?? 0, 16);

  state.controls.paused = false;
  state.controls.manualTrafficAdmission = false;
  state.controls.shipsPerCycle = 8;
  state.cycleDuration = 20;
  state.lastCycleTime = 0;
  for (let elapsed = 0; elapsed < 360; elapsed += 0.1) {
    tick(state, 0.1);
    if (state.openingEconomy.ledger.recent.some((event) =>
      event.kind === 'retail-sale' && event.label === 'Travel supplies sold' && event.credits > 0
    )) break;
  }
  const sale = state.openingEconomy.ledger.recent.find((event) =>
    event.kind === 'retail-sale' && event.label === 'Travel supplies sold' && event.credits > 0
  );
  const checkoutInstance = state.moduleInstances.find((module) => module.originTile === checkoutOrigin);
  const staffPosts = checkoutInstance
    ? new Set(resolveFacilitySlots(checkoutInstance, state.width)
      .filter((slot) => slot.role === 'checkout-staff')
      .map((slot) => slot.tileIndex))
    : new Set<number>();
  const stewardHoldingCheckout = state.crewMembers.some((crew) =>
    crew.staffRole === 'steward' &&
    crew.assignedSystem === 'market' &&
    staffPosts.has(crew.targetTile ?? -1) &&
    staffPosts.has(crew.tileIndex)
  );
  if (!sale) throw new Error('Opening supplies showcase did not produce a paid travel-supplies sale.');
  if (!stewardHoldingCheckout) throw new Error('Opening supplies showcase sale did not leave a real Steward at the checkout.');
  state.controls.paused = true;
}

function stageOpeningRefuelCycle(state: StationState): void {
  state.metrics.credits = Math.max(state.metrics.credits, 1200);

  let tankOrigin: number | null = null;
  for (let y = 0; y < state.height - 1 && tankOrigin === null; y += 1) {
    for (let x = 0; x < state.width - 1 && tankOrigin === null; x += 1) {
      const origin = y * state.width + x;
      const tiles = [origin, origin + 1, origin + state.width, origin + state.width + 1];
      if (!tiles.every((tile) =>
        state.tiles[tile] === TileType.Floor &&
        state.rooms[tile] === RoomType.None &&
        state.moduleOccupancyByTile[tile] === null
      )) continue;
      for (const tile of tiles) setRoom(state, tile, RoomType.Maintenance);
      tankOrigin = origin;
    }
  }
  if (tankOrigin === null) throw new Error('Opening refuel showcase could not find a Fuel Tank maintenance footprint.');

  let couplerOrigin: number | null = null;
  let fuelDockModuleId: number | null = null;
  for (let tile = 0; tile < state.tiles.length; tile += 1) {
    const attachment = getPodDockAttachmentView(state, ModuleType.FuelCoupler, tile);
    if (!attachment.valid) continue;
    const placement = tryPlaceModuleWithCredits(state, ModuleType.FuelCoupler, tile);
    if (!placement.ok) continue;
    couplerOrigin = tile;
    fuelDockModuleId = attachment.dockModuleId;
    break;
  }
  if (couplerOrigin === null || fuelDockModuleId === null) {
    throw new Error('Opening refuel showcase could not mount a Fuel Coupler beside a starter Pod Dock.');
  }
  const tank = tryPlaceModuleWithCredits(state, ModuleType.FuelTank, tankOrigin);
  if (!tank.ok) throw new Error(`Opening refuel showcase could not place Fuel Tank: ${tank.reason}`);

  const couplerX = couplerOrigin % state.width;
  const couplerY = Math.floor(couplerOrigin / state.width);
  let couplerServiceTile: number | null = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const x = couplerX + dx;
    const y = couplerY + dy;
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
    const tile = y * state.width + x;
    if (state.tiles[tile] !== TileType.Wall && canPlaceUtilityUnderlay(state, 'fuel-pipe', tile)) {
      couplerServiceTile = tile;
      break;
    }
  }
  if (couplerServiceTile === null) throw new Error('Opening refuel showcase Fuel Coupler has no pipe service tile.');

  const previous = new Int32Array(state.tiles.length).fill(-1);
  const queue = [tankOrigin];
  previous[tankOrigin] = tankOrigin;
  for (let head = 0; head < queue.length; head += 1) {
    const tile = queue[head];
    if (tile === couplerServiceTile) break;
    const x = tile % state.width;
    const y = Math.floor(tile / state.width);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
      const next = ny * state.width + nx;
      if (previous[next] >= 0 || !canPlaceUtilityUnderlay(state, 'fuel-pipe', next)) continue;
      previous[next] = tile;
      queue.push(next);
    }
  }
  if (previous[couplerServiceTile] < 0) throw new Error('Opening refuel showcase could not find a legal Fuel Pipe route.');
  for (let tile = couplerServiceTile; ; tile = previous[tile]) {
    if (!state.utilityUnderlay.layers['fuel-pipe'][tile]) {
      if (!setUtilityUnderlayTile(state, 'fuel-pipe', tile, true)) {
        throw new Error(`Opening refuel showcase could not place Fuel Pipe at ${tile}.`);
      }
    }
    if (tile === tankOrigin) break;
  }
  tick(state, 0);

  const fuelDock = state.docks.find((dock) => dock.moduleId === fuelDockModuleId);
  if (!fuelDock) throw new Error('Opening refuel showcase lost its attached Pod Dock.');
  const fuelSupply = getPodDockFuelSupplyView(state, fuelDock.id);
  if (!fuelSupply.connected) throw new Error(`Opening refuel showcase fuel chain is disconnected: ${fuelSupply.reason ?? 'unknown reason'}`);

  // The Freight Locker carries the first fuel lot. Keep every other starter
  // dock out of the way until the supplier has completed its ordinary unload.
  const freightDock = state.docks.find((dock) => dock.podCapabilities?.includes('freight'));
  if (!freightDock) throw new Error('Opening refuel showcase requires the starter Freight Locker Pod Dock.');
  for (const dock of state.docks) setDockPurpose(state, dock.id, dock.id === freightDock.id ? 'visitor' : 'residential');
  const fuelAtTank = (): number => state.itemNodes
    .filter((node) => state.moduleInstances.some((module) => module.type === ModuleType.FuelTank && module.originTile === node.tileIndex))
    .reduce((total, node) => total + (node.items.fuel ?? 0), 0);
  state.controls.paused = false;
  const fuelBeforeDelivery = fuelAtTank();
  const order = orderFuelDetailed(state);
  if (!order.ok) throw new Error(`Opening refuel showcase could not order fuel: ${order.message}`);
  for (let elapsed = 0; elapsed < 120 && fuelAtTank() < fuelBeforeDelivery + 1; elapsed += 0.1) tick(state, 0.1);
  if (fuelAtTank() < fuelBeforeDelivery + 1) throw new Error('Opening refuel showcase supplier did not unload fuel into the tank.');

  for (const dock of state.docks) setDockPurpose(state, dock.id, dock.id === fuelDock.id ? 'visitor' : 'residential');
  const fuelBeforeSale = fuelAtTank();
  for (let elapsed = 0; elapsed < 180; elapsed += 0.1) {
    tick(state, 0.1);
    if (state.openingEconomy.ledger.recent.some((event) => event.kind === 'fuel-sale' && event.credits > 0)) break;
  }
  const sale = state.openingEconomy.ledger.recent.find((event) => event.kind === 'fuel-sale' && event.credits > 0);
  if (!sale) throw new Error('Opening refuel showcase did not produce a paid fuel sale.');
  if (fuelAtTank() >= fuelBeforeSale) throw new Error('Opening refuel showcase paid sale did not reduce Fuel Tank stock.');
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

function createScaleVisitor(
  state: StationState,
  id: number,
  tileIndex: number,
  ordinal: number
): Visitor {
  const needs = createVisitorNeeds(id);
  const seekingMeal = ordinal % 3 === 0;
  const seekingHygiene = ordinal % 5 === 0;
  const seekingLeisure = !seekingMeal && !seekingHygiene;
  needs.hunger = seekingMeal ? 18 : 88;
  needs.hygiene = seekingHygiene ? 22 : 90;
  needs.energy = 88;
  needs.active = seekingMeal ? 'hunger' : seekingHygiene ? 'hygiene' : null;
  needs.unmetSince = needs.active ? state.now : null;
  const activeService: Visitor['activeService'] = seekingMeal ? 'meal' : seekingHygiene ? 'hygiene' : null;
  const servicePlan: Visitor['servicePlan'] = activeService ? [activeService] : seekingLeisure ? ['leisure'] : [];
  return {
    id,
    name: `Scale Visitor ${ordinal + 1}`,
    trait: ordinal % 4 === 0 ? 'impatient' : ordinal % 3 === 0 ? 'social' : 'patient',
    x: (tileIndex % state.width) + 0.5,
    y: Math.floor(tileIndex / state.width) + 0.5,
    tileIndex,
    state: seekingMeal ? VisitorState.ToCafeteria : VisitorState.Leisure,
    path: [],
    speed: 2,
    patience: 0,
    eatTimer: seekingMeal ? 0 : 1_000_000,
    trespassed: false,
    servedMeal: !seekingMeal,
    carryingMeal: false,
    carryingDrink: false,
    reservedServingTile: null,
    reservedTargetTile: null,
    blockedTicks: 0,
    archetype: seekingMeal ? 'diner' : seekingHygiene ? 'lounger' : 'shopper',
    taxSensitivity: 1,
    spendMultiplier: 1,
    patienceMultiplier: 1,
    primaryPreference: seekingMeal ? 'cafeteria' : seekingHygiene ? 'lounge' : 'market',
    spawnedAt: state.now,
    originShipId: null,
    airExposureSec: 0,
    healthState: 'healthy',
    hygieneStopUsed: false,
    leisureLegsRemaining: seekingLeisure ? 2 : 0,
    leisureLegsPlanned: seekingLeisure ? 2 : 0,
    lastLeisureKind: null,
    servicePlan,
    completedServices: [],
    activeService,
    optionalDrinkActive: ordinal % 7 === 0,
    repeatDrinksServed: 0,
    queueProviderTile: null,
    queueJoinedAt: null,
    transferPhase: 'station',
    transferSlotKey: null,
    transferQueuedAt: null,
    transferQueueTile: null,
    transferAccessTile: null,
    transferStationTile: null,
    transferCrossingStartedAt: null,
    transferBlockedTile: null,
    serviceBlockedSince: null,
    activeIncidentId: null,
    stayClass: 'extended',
    needs,
    recurringNeedActive: null,
    marketTradeGoodSourceTile: null,
    temporarySleepTargetTile: null,
    serviceFailureStage: 'none',
    failureSince: null,
    failureNeed: null,
    strandedFromShipId: null,
    strandedAt: null,
    reliefEligibleAt: null
  };
}

function installScaleDockInterfaces(state: StationState, target: number): void {
  tick(state, 0);
  const placed = state.docks.map((dock) => dock.anchorTile);
  const farEnough = (candidate: number): boolean => {
    const x = candidate % state.width;
    const y = Math.floor(candidate / state.width);
    return placed.every((other) => {
      const otherX = other % state.width;
      const otherY = Math.floor(other / state.width);
      return Math.abs(x - otherX) + Math.abs(y - otherY) >= 4;
    });
  };
  for (let y = 0; y < state.height && state.docks.length < target; y++) {
    for (let x = 0; x < state.width && state.docks.length < target; x++) {
      const tile = y * state.width + x;
      if (state.tiles[tile] === TileType.Space || state.tiles[tile] === TileType.Dock) continue;
      if (!farEnough(tile) || !validateDockPlacement(state, tile).valid) continue;
      setTile(state, tile, TileType.Dock);
      tick(state, 0);
      const dock = state.docks.find((candidate) => candidate.anchorTile === tile);
      if (dock) placed.push(tile);
    }
  }
  if (state.docks.length < target) {
    throw new Error(`Normal-scale fixture could place only ${state.docks.length}/${target} small docks.`);
  }
}

function installScalePowerReserve(state: StationState): void {
  // One room cluster represents one operating plant, no matter how many cores
  // are packed into it. Divide the demo reactor into two accessible cells so
  // this sustained-load fixture has honest redundant generation rather than a
  // wall of passive panels hidden inside a public observatory.
  for (let y = 32; y <= 40; y += 1) {
    const divider = y * state.width + 12;
    removeModuleAtTile(state, divider);
    setTile(state, divider, TileType.Wall);
    setRoom(state, divider, RoomType.None);
  }
  const eastDoor = 31 * state.width + 13;
  setTile(state, eastDoor, TileType.Door);
  setRoom(state, eastDoor, RoomType.Reactor);
  placeMod(state, 13, 37, ModuleType.ReactorCore);
  // A compact solar reserve covers the temporary passenger load of an
  // overlapping Pod/Berth arrival while preserving the observatory's authored
  // telescope, bench, and clear circulation spine.
  for (const [x, y] of [
    [36, 22], [38, 22], [40, 22], [42, 22], [36, 24],
    [38, 24], [40, 24], [42, 24], [36, 26], [42, 26]
  ] as const) {
    placeMod(state, x, y, ModuleType.SolarPanel);
  }
}

function seedScaleStorageReserve(state: StationState, freeCapacityTarget: number): void {
  const receivingTile = 34 * state.width + 64;
  const physicalStorage = state.itemNodes.filter(
    (node) => state.rooms[node.tileIndex] === RoomType.LogisticsStock || state.rooms[node.tileIndex] === RoomType.Storage
  );
  const freeCapacity = (node: StationState['itemNodes'][number]): number => {
    const used = Object.values(node.items).reduce((sum, amount) => sum + (amount ?? 0), 0);
    return Math.max(0, node.capacity - used);
  };
  let excessFree = physicalStorage.reduce((sum, node) => sum + freeCapacity(node), 0) - freeCapacityTarget;
  // Fill the older, distant stores first. The receiving pallet stays available
  // for the guaranteed inbound call, but the station as a whole begins with a
  // finite and explicitly physical reserve rather than a legacy scalar pool.
  for (const node of [...physicalStorage].sort((left, right) => {
    if (left.tileIndex === receivingTile) return 1;
    if (right.tileIndex === receivingTile) return -1;
    return left.tileIndex - right.tileIndex;
  })) {
    if (excessFree <= 0) break;
    const added = Math.min(excessFree, freeCapacity(node));
    node.items.rawMaterial = (node.items.rawMaterial ?? 0) + added;
    excessFree -= added;
  }
  if (excessFree > 0.01) {
    throw new Error(`Normal-scale fixture could not reduce storage reserve to ${freeCapacityTarget}.`);
  }
}

function planScenarioStructuralExpansion(state: StationState, withAirlock: boolean): void {
  // A scaffold only plans if the finished wing can reach the existing core, so
  // candidates must be tried from the hull outward. Scanning raw map order
  // starts in deep space at the top-left corner, where every patch fails the
  // walkable-hull-connection rule — which is how this fixture broke.
  const touchesStation = (candidate: number[]): boolean => {
    const owned = new Set(candidate);
    for (const tile of candidate) {
      const x = tile % state.width;
      const y = Math.floor(tile / state.width);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
        const neighbor = ny * state.width + nx;
        if (owned.has(neighbor)) continue;
        const tileType = state.tiles[neighbor];
        if (tileType === TileType.Floor || tileType === TileType.Wall || tileType === TileType.Door) {
          return true;
        }
      }
    }
    return false;
  };

  const candidates: number[][] = [];
  for (let y = 1; y < state.height - 2; y++) {
    for (let x = 1; x < state.width - 2; x++) {
      const candidate = [
        y * state.width + x,
        y * state.width + x + 1,
        (y + 1) * state.width + x,
        (y + 1) * state.width + x + 1
      ];
      if (candidate.some((tile) => state.tiles[tile] !== TileType.Space)) continue;
      if (!touchesStation(candidate)) continue;
      candidates.push(candidate);
    }
  }

  // A 2x2 scaffold welded onto the hull always produces a degree-3 truss node,
  // which the structural rules answer with a Truss Junction. Install the
  // junctions the plan asks for -- the same piece the player would place --
  // rather than hunting for a shape that dodges the rule.
  const installRequiredJunctions = (candidate: number[]): void => {
    const problems = validateStructuralSupportPlan(state).problems.filter(
      (problem) => problem.reason === 'branch-requires-junction' && candidate.includes(problem.tile)
    );
    for (const problem of problems) {
      const planned = planStructuralPieceConstruction(state, problem.tile, 'junction');
      if (!planned.ok || planned.pieceId === undefined) continue;
      const piece = state.structuralPieces.find((entry) => entry.id === planned.pieceId);
      if (piece) piece.completed = true;
      // The fixture seeds a station that already owns its junctions, so the
      // scaffold work it stages is the expansion itself, not this prerequisite.
      state.constructionSites = state.constructionSites.filter(
        (site) => site.structuralPieceId !== planned.pieceId
      );
    }
  };

  let patch: number[] | null = null;
  const rejections = new Map<string, number>();
  const creditsBefore = state.metrics.credits;
  state.metrics.credits = Math.max(creditsBefore, 500);
  for (const candidate of candidates) {
    for (const tile of candidate) setTile(state, tile, TileType.Truss);
    let plan = planStationExpansionOnTruss(state, candidate);
    if (!plan.ok && plan.reason.includes('branch-requires-junction')) {
      installRequiredJunctions(candidate);
      plan = planStationExpansionOnTruss(state, candidate);
    }
    if (plan.ok) {
      patch = candidate;
      break;
    }
    rejections.set(plan.reason, (rejections.get(plan.reason) ?? 0) + 1);
    for (const tile of candidate) setTile(state, tile, TileType.Space);
  }
  state.metrics.credits = creditsBefore;
  if (!patch) {
    const detail = [...rejections.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => `${reason} x${count}`)
      .join(', ');
    throw new Error(
      `Structural expansion fixture could not find a valid scaffold patch (${candidates.length} hull-adjacent candidates rejected: ${detail}).`
    );
  }
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
  // Keep a compact receiving room beside the Berths so the healthy scale
  // baseline does not force every inbound cart through the full public band
  // before it can establish custody. The remaining arrival corridor still
  // wraps south of the room and keeps passenger/cargo interaction visible.
  paintRoom(state, 58, 32, 67, 38, RoomType.LogisticsStock, 'east');

  // This fixture replaces the starter shell, so it must replace its access
  // policy too. Leaving old zone bytes behind made visually public rooms
  // unreachable depending on which starter tiles happened to occupy them.
  const staffOnlyRooms = new Set<RoomType>([
    RoomType.Dorm,
    RoomType.Kitchen,
    RoomType.Hydroponics,
    RoomType.Workshop,
    RoomType.Storage,
    RoomType.Reactor,
    RoomType.LifeSupport,
    RoomType.LogisticsStock,
    RoomType.Brig,
    RoomType.Security
  ]);
  for (let index = 0; index < state.tiles.length; index++) {
    if (state.tiles[index] !== TileType.Floor && state.tiles[index] !== TileType.Door) continue;
    state.zones[index] = staffOnlyRooms.has(state.rooms[index]) ? ZoneType.Restricted : ZoneType.Public;
  }

  // Room-specific floor variants
  for (let y = 7; y < 14; y++) for (let x = 16; x < 24; x++) {
    paintFloorTile(state, x, y, TileType.Cafeteria);
    setRoom(state, y * GRID_WIDTH + x, RoomType.Cafeteria);
  }
  // This is the healthy scale baseline, not the single-door comparison.
  // Give each counter a direct public throat and a third door for diners
  // returning trays, so crowd pressure remains physical without making one
  // doorway the only possible answer.
  for (const x of [17, 20, 23]) {
    setTile(state, 14 * GRID_WIDTH + x, TileType.Door);
    setRoom(state, 14 * GRID_WIDTH + x, RoomType.Cafeteria);
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
  placeMod(state, 60, 34, ModuleType.IntakePallet);
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
  seedItemNodeStock(state, 16, 13, 'cleanTray', 24);
  seedItemNodeStock(state, 19, 13, 'cleanTray', 24);
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

// --- Phase 1B facility-scale showcases -------------------------------------
//
// Each pair below is a deliberate before/after: the first layout is legal,
// buildable and visibly worse; the second answers the same demand with a
// different SPATIAL decision, not a bigger number. They are painted south of
// the starter hull so they never disturb the shared demo overlay geometry.

/** Paint a pressurized, powered, public room block with one door. */
function paintFacilityBlock(
  state: StationState,
  x: number,
  y: number,
  width: number,
  height: number,
  room: RoomType,
  zone: ZoneType = ZoneType.Public
): void {
  for (let yy = y - 1; yy <= y + height; yy++) {
    for (let xx = x - 1; xx <= x + width; xx++) {
      const index = yy * state.width + xx;
      const boundary = xx === x - 1 || xx === x + width || yy === y - 1 || yy === y + height;
      state.tiles[index] = boundary ? TileType.Wall : TileType.Floor;
      state.rooms[index] = boundary ? RoomType.None : room;
      if (!boundary) {
        state.pressurized[index] = true;
        state.zones[index] = zone;
      }
    }
  }
  const door = (y - 1) * state.width + x + 1;
  state.tiles[door] = TileType.Door;
  state.rooms[door] = RoomType.None;
  state.utilityUnderlay.layers['power-conduit'].fill(1);
  state.utilityUnderlay.version += 1;
  state.topologyVersion += 1;
  state.roomVersion += 1;
}

/** Join two aligned facility walls with a short pressurized public passage. */
function connectFacilityRooms(
  state: StationState,
  startX: number,
  startY: number,
  endX: number,
  endY: number
): void {
  if (startX !== endX && startY !== endY) {
    throw new Error('facility showcase passages must be horizontal or vertical');
  }
  const stepX = Math.sign(endX - startX);
  const stepY = Math.sign(endY - startY);
  const distance = Math.max(Math.abs(endX - startX), Math.abs(endY - startY));
  for (let offset = 0; offset <= distance; offset += 1) {
    const x = startX + stepX * offset;
    const y = startY + stepY * offset;
    const tileIndex = y * state.width + x;
    state.tiles[tileIndex] = offset === 0 || offset === distance ? TileType.Door : TileType.Floor;
    state.rooms[tileIndex] = RoomType.None;
    state.pressurized[tileIndex] = true;
    state.zones[tileIndex] = ZoneType.Public;
  }
  state.topologyVersion += 1;
  state.roomVersion += 1;
}

/** Place a multi-tile fixture, failing loudly rather than degrading to 1x1. */
function placeFixture(
  state: StationState,
  type: ModuleType,
  x: number,
  y: number,
  rotation: ModuleRotation = 0
): ModuleInstance {
  const result = tryPlaceModule(state, type, y * state.width + x, rotation);
  if (!result.ok) throw new Error(`facility showcase could not place ${type} at ${x},${y}: ${result.reason}`);
  return state.moduleInstances[state.moduleInstances.length - 1];
}

function stockNode(state: StationState, tileIndex: number, itemType: ItemType, amount: number): void {
  const node = state.itemNodes.find((entry) => entry.tileIndex === tileIndex);
  if (!node) throw new Error(`facility showcase expected an inventory node at ${tileIndex}`);
  node.items[itemType] = amount;
}

/**
 * Put real shoppers on the floor of a facility showcase.
 *
 * The before/after market pairs are only honest if somebody actually buys
 * something, so these are ordinary visitors with a market preference standing
 * inside the room, not scripted sale events.
 */
function stageFacilityVisitors(
  state: StationState,
  count: number,
  originX: number,
  originY: number,
  preference: VisitorPreference,
  servicePlan: HospitalityServiceKind[] = [],
  idBase = 99400
): Visitor[] {
  const staged: Visitor[] = [];
  for (let index = 0; index < count; index += 1) {
    const x = originX + (index % 4);
    const y = originY + Math.floor(index / 4);
    const tileIndex = y * state.width + x;
    const visitor: Visitor = {
      id: idBase + index,
      name: `Guest ${index + 1}`,
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
      archetype: preference === 'market' ? 'shopper' : 'lounger',
      taxSensitivity: 1,
      spendMultiplier: 1,
      patienceMultiplier: 1,
      primaryPreference: preference,
      spawnedAt: state.now,
      originShipId: null,
      airExposureSec: 0,
      healthState: 'healthy',
      leisureLegsRemaining: 1,
      leisureLegsPlanned: 1,
      lastLeisureKind: null,
      servicePlan,
      completedServices: [],
      activeService: servicePlan[0] ?? null,
      stayClass: servicePlan.length > 0 ? 'contract' : 'errand',
      needs: undefined,
      recurringNeedActive: null,
      marketTradeGoodSourceTile: null,
      temporarySleepTargetTile: null,
      queueProviderTile: null,
      queueJoinedAt: null,
      // Arrive knowing only what they are already acting on.
      revealedServices: servicePlan.slice(0, 1),
      receptionProcessedAt: null,
      redirectedFrom: null
    };
    state.visitors.push(visitor);
    staged.push(visitor);
  }
  return staged;
}

/** Put stewards physically on every staff work position of a fixture type. */
function stageFacilityStaff(state: StationState, moduleType: ModuleType, role: FacilitySlotRole): number {
  while ((state.crew.roleCounts.steward ?? 0) < 4) {
    if (!hireStaffRole(state, 'steward')) break;
  }
  const slots = state.moduleInstances
    .filter((module) => module.type === moduleType)
    .flatMap((module) => resolveFacilitySlots(module, state.width).filter((slot) => slot.role === role));
  const stewards = state.crewMembers.filter((crew) => crew.staffRole === 'steward');
  let staffed = 0;
  for (let index = 0; index < Math.min(slots.length, stewards.length); index += 1) {
    const crew = stewards[index];
    const slot = slots[index];
    crew.assignedSystem = moduleType === ModuleType.CheckoutBank ? 'market' : 'lounge';
    crew.lastSystem = crew.assignedSystem;
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
    crew.retargetAt = state.now + 240;
    crew.taskLockUntil = state.now + 240;
    // Holding the position is what opens it. Standing next to a register or a
    // reception console serves nobody.
    const request = buildSlotReservationRequest({
      ownerKind: 'crew',
      ownerId: crew.id,
      slot: { ...slot, moduleId: state.moduleOccupancyByTile[slot.tileIndex] ?? -1, moduleType, moduleOriginTile: slot.tileIndex },
      replace: true
    });
    if (request) tryCreateReservation(state, request);
    staffed += 1;
  }
  return staffed;
}

function readyFacilityScenario(state: StationState): void {
  unlockThrough(state, 3);
  state.metrics.credits = 6000;
  state.metrics.materials = 400;
  state.pressurized.fill(true);
  // These are controlled before/after facility comparisons. Ambient pod
  // traffic adds unrelated food and departure failures after the first bank,
  // obscuring the authored shoppers and guests the scenario is measuring.
  state.controls.manualTrafficAdmission = true;
  state.controls.portAutoAdmitEnabled = false;
}


/** A minimal, complete TrafficOffer for the Gate G admission showcase. */
function commitmentOffer(
  state: StationState,
  id: number,
  shipType: ShipType,
  size: ShipSize,
  dock: StationState['docks'][number]
): TrafficOffer {
  return {
    id,
    callsign: `GATE-G-${id}`,
    shipName: `${shipType} call`,
    lane: dock.lane,
    shipType,
    hullVariant: selectShipHullVariant(id, shipType, size),
    size,
    status: 'holding',
    forecastAt: state.now,
    arrivesAt: state.now,
    expiresAt: state.now + 600,
    passengersTotal: size === 'small' ? 2 : 6,
    manifestDemand: { cafeteria: 0.5, market: 0.3, lounge: 0.2 },
    manifestMix: { diner: 1, shopper: 0, lounger: 0, rusher: 0 },
    inboundCargo: { rawMaterial: 0, rawMeal: 0, tradeGood: 0 },
    outboundRequest: { rawMaterial: 0, meal: 0, tradeGood: 0 },
    requestedServices: [],
    berthTimeSec: size === 'small' ? 120 : 300,
    dockingFee: 40,
    projectedSpend: 60,
    riskLabel: shipType === 'military' ? 'high' : 'low',
    assignedBerthAnchor: null,
    assignedDockSourceKey: null
  };
}

/**
 * The Gate G before/after pair.
 *
 * Both arms build the SAME cohort at the same seed. The only difference is
 * whether the station physically owns the facilities the cohort needs, which
 * is what makes the comparison about layout rather than about luck.
 */
function stageCommitmentCohort(state: StationState, options: { supported: boolean }): void {
  unlockThrough(state, 3);
  state.metrics.credits = 4000;
  state.pressurized.fill(true);

  // A shared public concourse exists in BOTH arms. Only what opens onto it
  // differs, so the comparison is about provision, not about geometry.
  paintFacilityBlock(state, 55, 49, 8, 9, RoomType.Lounge);

  if (options.supported) {
    // A guest wing the cohort can actually reach: beds, a wash bank, and meals.
    paintFacilityBlock(state, 42, 49, 12, 9, RoomType.Dorm);
    for (let y = 49; y < 58; y++) {
      for (let x = 42; x < 54; x++) state.roomHousingPolicies[y * state.width + x] = 'visitor';
    }
    placeFixture(state, ModuleType.BunkBank, 43, 50);
    placeFixture(state, ModuleType.GuestCabin, 47, 50);

    paintFacilityBlock(state, 58, 49, 12, 9, RoomType.Cafeteria);
    const line = placeFixture(state, ModuleType.ServingLine, 59, 50);
    placeFixture(state, ModuleType.CommunityTable, 63, 50);
    placeFixture(state, ModuleType.TrayReturn, 67, 50);

    paintFacilityBlock(state, 74, 49, 10, 8, RoomType.Hygiene);
    placeFixture(state, ModuleType.WashBank, 75, 50);
    placeFixture(state, ModuleType.Toilet, 79, 50);
    placeFixture(state, ModuleType.Sink, 80, 50);
    for (let y = 49; y < 57; y++) {
      for (let x = 74; x < 84; x++) state.roomHousingPolicies[y * state.width + x] = 'visitor';
    }
    tick(state, 0);
    stockNode(state, line.originTile, 'meal', 40);
  } else {
    tick(state, 0);
  }

  // The committed cohort itself: identical in both arms.
  const dock = state.docks[0];
  const bayTile = dock?.accessTile ?? dock?.tiles[0] ?? 0;
  const shipId = 95001;
  state.arrivingShips.push({
    id: shipId,
    kind: 'transient',
    size: 'medium',
    bayTiles: [bayTile],
    bayCenterX: (bayTile % state.width) + 0.5,
    bayCenterY: Math.floor(bayTile / state.width) + 0.5,
    shipType: 'industrial',
    hullVariant: 'repair-tender',
    lane: dock?.lane ?? 'north',
    originDockId: dock?.id ?? null,
    assignedDockId: dock?.id ?? null,
    assignedDockSourceKey: dock?.sourceKey ?? null,
    assignedBerthAnchor: null,
    queueState: 'none',
    stage: 'docked',
    stageTime: 12,
    passengersTotal: 4,
    passengersSpawned: 4,
    passengersBoarded: 0,
    minimumBoarding: 4,
    spawnCarry: 0,
    dockedAt: state.now,
    residentIds: [],
    manifestDemand: { cafeteria: 1, market: 0, lounge: 0 },
    manifestMix: { diner: 1, shopper: 0, lounger: 0, rusher: 0 },
    portContractId: shipId,
    stayClass: 'contract',
    visitPhase: 'visit-service',
    // Far enough out that `tryRecallFailedLongStay` cannot end the showcase
    // before the player has looked at it. The recall path is exercised by
    // tools/failed-stay-tests.ts, not here.
    earliestDepartureAt: state.now + 600,
    plannedDepartureAt: state.now + 900,
    extensionUntil: null,
    recallAt: null,
    approachCommitment: null
  } as unknown as StationState['arrivingShips'][number]);
  state.portOps.contracts.push({
    id: shipId,
    offerId: shipId,
    shipId,
    callsign: 'GATE-G-COHORT',
    offerKind: 'passenger',
    assignedBerthAnchor: 0,
    acceptedAt: state.now,
    arrivesAt: state.now,
    boardingStartsAt: state.now + 840,
    hardDepartureAt: state.now + 900,
    status: 'active',
    promises: [{ kind: 'dock', label: 'Dock access', target: 1, completed: 1, payoutCredits: 80 }],
    passengerSpendingCredits: 0,
    procurementCostCredits: 0,
    settlementId: null,
    stayClass: 'contract',
    earliestDepartureAt: state.now + 600,
    plannedDepartureAt: state.now + 900,
    extensionUntil: null,
    recallAt: null
  } as unknown as StationState['portOps']['contracts'][number]);

  // Both arms place the cohort in the SAME spot: the concourse the guest wing
  // opens onto. In the supported arm they can walk to food, a bed and a wash
  // bank from here; in the failure arm there is nothing to walk to. That is
  // the whole comparison, so the spawn point must not differ between them.
  const tiles = commitmentCohortTiles(state);
  for (let index = 0; index < 4; index += 1) {
    const tile = tiles[index % tiles.length];
    const visitor = {
      id: 95100 + index,
      x: (tile % state.width) + 0.5,
      y: Math.floor(tile / state.width) + 0.5,
      tileIndex: tile,
      state: VisitorState.ToCafeteria,
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
      archetype: 'lounger',
      taxSensitivity: 1,
      spendMultiplier: 1,
      patienceMultiplier: 1,
      primaryPreference: 'cafeteria',
      spawnedAt: state.now,
      originShipId: shipId,
      airExposureSec: 0,
      healthState: 'healthy',
      leisureLegsRemaining: 0,
      leisureLegsPlanned: 0,
      lastLeisureKind: null,
      servicePlan: [],
      completedServices: [],
      activeService: 'meal',
      stayClass: 'contract',
      queueProviderTile: null,
      queueJoinedAt: null,
      temporarySleepTargetTile: null,
      needs: createVisitorNeeds(95100 + index),
      recurringNeedActive: 'hunger',
      revealedServices: [],
      receptionProcessedAt: null,
      redirectedFrom: null
    } as unknown as Visitor;
    // Start them already hungry so the pressure is visible immediately.
    visitor.needs!.hunger = 14;
    visitor.needs!.energy = 20;
    if (!options.supported) {
      visitor.serviceBlockedSince = state.now - 90;
      visitor.needs!.unmetSince = state.now - 90;
    }
    state.visitors.push(visitor);
  }
  tick(state, 0);
  state.controls.paused = true;
}

/** The four concourse tiles the cohort stands on, identical in both arms. */
function commitmentCohortTiles(state: StationState): number[] {
  const tiles: number[] = [];
  for (let y = 50; y < 54 && tiles.length < 4; y++) {
    for (let x = 55; x < 58 && tiles.length < 4; x++) {
      const index = y * state.width + x;
      if (isWalkable(state.tiles[index])) tiles.push(index);
    }
  }
  if (tiles.length > 0) return tiles;
  // Fallback for a hull shape that lacks the concourse strip.
  for (let i = 0; i < state.tiles.length && tiles.length < 4; i++) {
    if (isWalkable(state.tiles[i]) && state.rooms[i] !== RoomType.Berth) tiles.push(i);
  }
  return tiles;
}

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
