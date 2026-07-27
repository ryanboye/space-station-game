/**
 * Canonical completed-service record.
 *
 * Shared contract C1 ("Honest Physical Service") requires one completion event
 * that every consumer reads: port promises, settlement reports, progression
 * goals, the ledger, and world feedback. Before this module each consumer
 * inferred completion from its own signal, so a turnaround could report
 * cantina drinks and lounge visits at a station that contained neither room.
 *
 * Like `opening-economy.ts`, this module owns no StationState mutation. It
 * holds the plain-data log plus the fixture rules that decide whether a tile
 * can physically deliver a given service, so both the simulation and the
 * focused checks answer that question the same way.
 */

import { ModuleType, RoomType, type HospitalityServiceKind } from './types';

/**
 * Everything a station can physically sell a visitor. The six hospitality
 * kinds map onto berth-contract promises; `retail` does not, but it is still a
 * completed physical session and still means the station served someone —
 * which is what the opening "Visitors served" goal counts.
 */
export type ServiceKind = HospitalityServiceKind | 'retail';

/** Who consumed the service. Progression goals care about this distinction. */
export const SERVICE_POPULATIONS = ['visitor', 'crew', 'resident'] as const;
export type ServicePopulation = typeof SERVICE_POPULATIONS[number];

/**
 * A physical session that finished at a real fixture. `roomType`/`moduleType`/
 * `tileIndex` are the facility identity TRUTH-02 requires: every reported
 * completion can be traced back to the thing that served it.
 */
export interface ServiceCompletion {
  id: number;
  at: number;
  population: ServicePopulation;
  actorId: number;
  service: ServiceKind;
  roomType: RoomType;
  moduleType: ModuleType;
  tileIndex: number;
  /** Set when the actor arrived on a ship, so settlement can attribute it. */
  shipId: number | null;
  /** Set when a tenant operated the facility. Tenants use this same event. */
  commercialUnitId: number | null;
}

export type ServiceCompletionInput = Omit<ServiceCompletion, 'id'>;

export type ServiceCountsByKind = Record<ServiceKind, number>;

export interface ServiceLog {
  nextEventId: number;
  /** Most recent completions, ascending by simulation time. Bounded on write. */
  recent: ServiceCompletion[];
  /** Lifetime totals across every population. */
  lifetimeByService: ServiceCountsByKind;
  /** Lifetime totals for ship- and pod-borne visitors only. */
  visitorLifetimeByService: ServiceCountsByKind;
  /** Distinct visitors who completed at least one service. */
  visitorsServedLifetime: number;
}

export const SERVICE_KINDS: readonly ServiceKind[] = [
  'meal',
  'drink',
  'leisure',
  'restroom',
  'hygiene',
  'comfort',
  'retail'
];

export const DEFAULT_SERVICE_LOG_LIMIT = 64;

/**
 * Which fixtures can physically deliver each service.
 *
 * `rooms: null` means the fixture is sufficient on its own — a Toilet is a
 * restroom wherever it is plumbed. Otherwise both the room and the module must
 * match, which is what stops a visitor idling at a Market Stall from
 * completing a lounge visit.
 */
export interface ServiceFixtureRule {
  rooms: RoomType[] | null;
  modules: ModuleType[];
}

export const SERVICE_FIXTURE_RULES: Record<ServiceKind, ServiceFixtureRule> = {
  meal: {
    rooms: [RoomType.Cafeteria, RoomType.Cantina, RoomType.CommercialUnit],
    modules: [ModuleType.Table, ModuleType.Bench, ModuleType.Couch, ModuleType.BarCounter]
  },
  drink: {
    rooms: [RoomType.Cantina, RoomType.CommercialUnit],
    modules: [ModuleType.BarCounter, ModuleType.Tap, ModuleType.Bench, ModuleType.Couch, ModuleType.Table]
  },
  leisure: {
    rooms: [RoomType.Lounge, RoomType.RecHall, RoomType.Observatory],
    modules: [ModuleType.Couch, ModuleType.Bench, ModuleType.RecUnit, ModuleType.GameStation, ModuleType.Telescope]
  },
  restroom: { rooms: null, modules: [ModuleType.Toilet] },
  hygiene: { rooms: null, modules: [ModuleType.Shower, ModuleType.Sink] },
  comfort: {
    rooms: [RoomType.Lounge, RoomType.Observatory, RoomType.RecHall, RoomType.Dorm],
    modules: [ModuleType.GameStation, ModuleType.Telescope, ModuleType.Bed, ModuleType.Bunk, ModuleType.BunkBank]
  },
  retail: {
    rooms: [RoomType.Market, RoomType.CommercialUnit, RoomType.Cafeteria, RoomType.Lounge, RoomType.RecHall],
    modules: [ModuleType.MarketStall, ModuleType.VendingMachine, ModuleType.CheckoutBank]
  }
};

/**
 * True when a tile's room and module can deliver `service`. Pure on purpose —
 * the simulation adds the "powered, staffed, stocked, reserved" conditions on
 * top, but no caller may complete a service the fixture cannot provide at all.
 */
export function fixtureProvidesService(
  room: RoomType,
  module: ModuleType,
  service: ServiceKind
): boolean {
  const rule = SERVICE_FIXTURE_RULES[service];
  if (!rule) return false;
  if (!rule.modules.includes(module)) return false;
  return rule.rooms === null || rule.rooms.includes(room);
}

function zeroCounts(): ServiceCountsByKind {
  return Object.fromEntries(SERVICE_KINDS.map((kind) => [kind, 0])) as ServiceCountsByKind;
}

export function createServiceLog(): ServiceLog {
  return {
    nextEventId: 1,
    recent: [],
    lifetimeByService: zeroCounts(),
    visitorLifetimeByService: zeroCounts(),
    visitorsServedLifetime: 0
  };
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeCounts(raw: unknown): ServiceCountsByKind {
  const counts = zeroCounts();
  if (raw && typeof raw === 'object') {
    for (const kind of SERVICE_KINDS) {
      counts[kind] = Math.max(0, Math.floor(finite((raw as Record<string, unknown>)[kind])));
    }
  }
  return counts;
}

function isCompletion(value: unknown): value is ServiceCompletion {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<ServiceCompletion>;
  return Number.isFinite(event.id)
    && Number.isFinite(event.at)
    && typeof event.service === 'string'
    && SERVICE_KINDS.includes(event.service as ServiceKind)
    && typeof event.population === 'string'
    && (SERVICE_POPULATIONS as readonly string[]).includes(event.population);
}

/** Accepts saves written before the service log existed, or partial ones. */
export function normalizeServiceLog(raw: Partial<ServiceLog> | null | undefined): ServiceLog {
  const recent = Array.isArray(raw?.recent)
    ? raw.recent.filter(isCompletion).map((event) => ({ ...event })).sort((a, b) => a.at - b.at || a.id - b.id)
    : [];
  const maxId = recent.reduce((highest, event) => Math.max(highest, event.id), 0);
  return {
    nextEventId: Math.max(1, Math.floor(finite(raw?.nextEventId, maxId + 1)), maxId + 1),
    recent,
    lifetimeByService: normalizeCounts(raw?.lifetimeByService),
    visitorLifetimeByService: normalizeCounts(raw?.visitorLifetimeByService),
    visitorsServedLifetime: Math.max(0, Math.floor(finite(raw?.visitorsServedLifetime)))
  };
}

export interface ServiceLogOptions {
  recentLimit?: number;
  /** First completion for this visitor, so unique-visitor counting stays here. */
  firstForActor?: boolean;
}

/**
 * Appends one completion and updates the rollups. Callers must have already
 * verified the physical session; this function does not re-check the fixture
 * so that the simulation keeps one gate rather than two disagreeing ones.
 */
export function appendServiceCompletion(
  log: ServiceLog,
  input: ServiceCompletionInput,
  options: ServiceLogOptions = {}
): ServiceCompletion {
  const limit = Math.max(1, Math.floor(options.recentLimit ?? DEFAULT_SERVICE_LOG_LIMIT));
  const event: ServiceCompletion = { id: Math.max(1, Math.floor(finite(log.nextEventId, 1))), ...input };
  log.nextEventId = event.id + 1;
  if (!Array.isArray(log.recent)) log.recent = [];
  log.recent.push(event);
  if (log.recent.length > limit) log.recent.splice(0, log.recent.length - limit);
  log.lifetimeByService[event.service] = (log.lifetimeByService[event.service] ?? 0) + 1;
  if (event.population === 'visitor') {
    log.visitorLifetimeByService[event.service] = (log.visitorLifetimeByService[event.service] ?? 0) + 1;
    if (options.firstForActor) log.visitorsServedLifetime += 1;
  }
  return event;
}

/** Completions inside a time window, optionally narrowed to one ship. */
export function completionsForShip(
  log: ServiceLog,
  shipId: number
): ServiceCompletion[] {
  return log.recent.filter((event) => event.shipId === shipId);
}
