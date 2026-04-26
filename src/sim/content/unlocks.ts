import type { Metrics } from '../types';
import {
  ModuleType,
  RoomType,
  type UnlockDefinition,
  type UnlockState,
  type UnlockTier,
} from '../types';

// --- Tier triggers ---------------------------------------------------------
//
// Every trigger is a monotonic predicate over lifetime counters on
// `Metrics` — the predicate never goes false once true, so tier advance
// survives save/load, and harness scenarios can assert progress with
// simple `counter >= threshold` checks.
//
// Thresholds are placeholders (T1 = first visitor arrives,
// T2 = 500 credits + 3 archetypes, ...). awfml's milestone framework
// will dial these in when it lands; swapping a number here is ~20 LoC
// of delta at that point.

function progressTo(current: number, threshold: number): number {
  if (threshold <= 0) return current > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, current / threshold));
}

const TIER1_VISITOR_ARRIVAL_THRESHOLD = 1;
const TIER2_CREDIT_THRESHOLD = 500;
const TIER2_ARCHETYPE_THRESHOLD = 3;
const TIER3_TRADE_CYCLES_THRESHOLD = 1;
const TIER4_INCIDENTS_RESOLVED_THRESHOLD = 1;
const TIER5_ACTORS_TREATED_THRESHOLD = 1;
const TIER5_RESIDENTS_CONVERTED_THRESHOLD = 1;
const TIER6_ELIGIBLE_TIER = 5;

export const UNLOCK_DEFINITIONS: UnlockDefinition[] = [
  {
    id: 'tier1_sustenance',
    tier: 1,
    name: 'Guest Services',
    description: 'First visitor arrives. Unlocks lounge, market, and market stall.',
    trigger: {
      // Starter state has no kitchen/cafeteria, so mealsServedTotal never
      // advanced. Gate on visitor-spawn via archetypesServedLifetime.
      predicate: (m: Metrics) => m.archetypesServedLifetime >= TIER1_VISITOR_ARRIVAL_THRESHOLD,
      progress: (m: Metrics) =>
        progressTo(m.archetypesServedLifetime, TIER1_VISITOR_ARRIVAL_THRESHOLD),
      tooltip: 'Your first visitor arrives at the station.',
    },
  },
  {
    id: 'tier2_commerce',
    tier: 2,
    name: 'Production Logistics',
    description: 'Balance revenue vs visitor diversity. Unlocks workshop, storage, storage racks, and industrial ships.',
    trigger: {
      predicate: (m: Metrics) =>
        m.creditsEarnedLifetime >= TIER2_CREDIT_THRESHOLD &&
        m.archetypesServedLifetime >= TIER2_ARCHETYPE_THRESHOLD,
      progress: (m: Metrics) =>
        Math.min(
          progressTo(m.creditsEarnedLifetime, TIER2_CREDIT_THRESHOLD),
          progressTo(m.archetypesServedLifetime, TIER2_ARCHETYPE_THRESHOLD),
        ),
      tooltip: 'Earn 500 credits and serve three different visitor types.',
    },
  },
  {
    id: 'tier3_logistics',
    tier: 3,
    name: 'Advanced Operations',
    description: 'Item-chain loop proven. Unlocks security, brig, clinic, rec hall, and advanced ship families.',
    trigger: {
      predicate: (m: Metrics) => m.tradeCyclesCompletedLifetime >= TIER3_TRADE_CYCLES_THRESHOLD,
      progress: (m: Metrics) =>
        progressTo(m.tradeCyclesCompletedLifetime, TIER3_TRADE_CYCLES_THRESHOLD),
      tooltip: 'Produce a trade good at a workshop and sell it at the market.',
    },
  },
  {
    id: 'tier4_governance',
    tier: 4,
    name: 'Governance Roadmap',
    description: 'Advanced milestone for future rules, civic systems, and zone depth.',
    trigger: {
      predicate: (m: Metrics) => m.incidentsResolvedLifetime >= TIER4_INCIDENTS_RESOLVED_THRESHOLD,
      progress: (m: Metrics) =>
        progressTo(m.incidentsResolvedLifetime, TIER4_INCIDENTS_RESOLVED_THRESHOLD),
      tooltip: 'Resolve one dispatched incident.',
    },
  },
  {
    id: 'tier5_health',
    tier: 5,
    name: 'Health Roadmap',
    description: 'Advanced milestone for deeper treatment, mortality, and resident systems.',
    trigger: {
      predicate: (m: Metrics) =>
        m.actorsTreatedLifetime >= TIER5_ACTORS_TREATED_THRESHOLD &&
        m.residentsConvertedLifetime >= TIER5_RESIDENTS_CONVERTED_THRESHOLD,
      progress: (m: Metrics) =>
        Math.min(
          progressTo(m.actorsTreatedLifetime, TIER5_ACTORS_TREATED_THRESHOLD),
          progressTo(m.residentsConvertedLifetime, TIER5_RESIDENTS_CONVERTED_THRESHOLD),
        ),
      tooltip: 'Treat a patient at a clinic and convert a visitor to a resident.',
    },
  },
  {
    id: 'tier6_specialization',
    tier: 6,
    name: 'Specialization',
    description: 'Station identity roadmap. Marks completion of the current progression track.',
    trigger: {
      // T6 is the "tutorial complete" marker — gated on reaching T5.
      predicate: (_m: Metrics) => false,
      progress: (_m: Metrics) => 0,
      tooltip: 'Complete the health-loop tier to unlock station specialization.',
    },
  },
];

// Tier assignments preserved from the v1 3-tier scaffold. The new 6-tier
// SHAPE lives in UNLOCK_DEFINITIONS + triggers above, but actual content
// gating stays at the shipped values so the current game / test suite
// keeps passing. awfml's milestone framework + a content-reshuffle PR
// will dial these in against the strawman's aspirational assignments.
export const ROOM_UNLOCK_TIER: Record<RoomType, UnlockTier> = {
  [RoomType.None]: 0,
  [RoomType.Cafeteria]: 0,
  [RoomType.Kitchen]: 0,
  [RoomType.Workshop]: 2,
  [RoomType.Clinic]: 3,
  [RoomType.Brig]: 3,
  [RoomType.RecHall]: 3,
  [RoomType.Reactor]: 0,
  [RoomType.Security]: 3,
  [RoomType.Dorm]: 0,
  [RoomType.Hygiene]: 0,
  [RoomType.Hydroponics]: 0,
  [RoomType.LifeSupport]: 0,
  [RoomType.Lounge]: 1,
  [RoomType.Market]: 1,
  [RoomType.LogisticsStock]: 0,
  [RoomType.Storage]: 2,
};

export const MODULE_UNLOCK_TIER: Record<ModuleType, UnlockTier> = {
  [ModuleType.None]: 0,
  [ModuleType.WallLight]: 0,
  [ModuleType.Bed]: 0,
  [ModuleType.Table]: 0,
  [ModuleType.ServingStation]: 0,
  [ModuleType.Stove]: 0,
  [ModuleType.Workbench]: 2,
  [ModuleType.MedBed]: 3,
  [ModuleType.CellConsole]: 3,
  [ModuleType.RecUnit]: 3,
  [ModuleType.GrowStation]: 0,
  [ModuleType.Terminal]: 3,
  [ModuleType.Couch]: 1,
  [ModuleType.GameStation]: 1,
  [ModuleType.Shower]: 0,
  [ModuleType.Sink]: 0,
  [ModuleType.MarketStall]: 1,
  [ModuleType.IntakePallet]: 0,
  [ModuleType.StorageRack]: 2,
};

export function createInitialUnlockState(): UnlockState {
  return {
    tier: 0,
    unlockedIds: [],
    unlockedAtSec: {},
    triggerProgress: { 0: 1 },
  };
}

export function isRoomUnlockedAtTier(room: RoomType, tier: UnlockTier): boolean {
  return tier >= ROOM_UNLOCK_TIER[room];
}

export function isModuleUnlockedAtTier(module: ModuleType, tier: UnlockTier): boolean {
  return tier >= MODULE_UNLOCK_TIER[module];
}

/** Shared threshold constant so `T6_ELIGIBLE_TIER` isn't a bare number
 *  at the render + sim-tick call sites. */
export { TIER6_ELIGIBLE_TIER };
