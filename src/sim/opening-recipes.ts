/**
 * The three opening businesses, as recipes rather than prefabs.
 *
 * OPEN-03. The build catalog is a flat list of every module, which answers
 * "what can I place" but not "what does a business need". These recipes group
 * the catalog under the three decisions the opening actually offers — Feed
 * Travelers, Sell Supplies, Refuel Pods — and state each one's cost,
 * footprint, utilities, staff and stock up front.
 *
 * This is decision and placement guidance, not a one-click builder: every step
 * resolves to an ordinary room-paint or module-place tool, every module stays
 * individually placeable, and move and resale are untouched. Future facilities
 * stay visible with plain prerequisite copy so nothing arrives as a surprise.
 */

import { MODULE_DEFINITIONS, OPENING_BALANCE, ROOM_DEFINITIONS } from './balance';
import {
  getPodDockFuelReadiness,
  getMarketFixtureStatus,
  getRoomClusterOperationalViews,
  quoteFuelOrder,
  quoteTravelSuppliesOrder,
  type RoomClusterOperationalView
} from './sim';
import { ModuleType, RoomType, ZoneType, type ItemType, type StationState } from './types';

export type OpeningRecipeId = 'feed-travelers' | 'sell-supplies' | 'service-ships';

export type RecipeStepKind = 'room' | 'module' | 'utility' | 'stock';

export interface RecipeStep {
  kind: RecipeStepKind;
  /** Player-facing instruction, for example "Paint 12 Cafeteria tiles". */
  label: string;
  /** Room to paint, for a `room` step. */
  room?: RoomType;
  /** Module to place, for a `module` step. */
  module?: ModuleType;
  /** Tiles or module instances required. */
  count: number;
  /** Credits this step costs, 0 when it only spends floor space. */
  costCredits: number;
  /** The procurement action for an operating-stock step. */
  stockKind?: OpeningRecipeStockKind;
}

export type OpeningRecipeStockKind = 'prepared-meals' | 'travel-supplies' | 'fuel';

export interface OpeningRecipe {
  id: OpeningRecipeId;
  /** Catalog group heading. */
  title: string;
  summary: string;
  steps: RecipeStep[];
  /** Roles the finished operation wants, or an explicit "none yet". */
  staffing: string;
  /** Shared-infrastructure obligations this recipe creates (contract C7). */
  utilities: string;
  /** What it earns and what limits it, for comparing the three. */
  economics: string;
}

/**
 * Prices come from the same tables the build path charges, so a recipe's
 * headline cost cannot drift from what the player is actually billed.
 */
function moduleCost(module: ModuleType): number {
  const definition = MODULE_DEFINITIONS[module];
  return definition?.capitalCost ?? Math.max(1, definition.width * definition.height * 6);
}

function moduleStep(module: ModuleType, count: number, label: string): RecipeStep {
  return { kind: 'module', module, count, label, costCredits: moduleCost(module) * count };
}

function roomStep(room: RoomType, count: number, label: string): RecipeStep {
  return { kind: 'room', room, count, label, costCredits: 0 };
}

/** Opening stock batches, read from the one balance location (OPEN-04). */
export const OPENING_STOCK_COST = {
  preparedMeals: OPENING_BALANCE.preparedMealBatch.costCredits,
  travelSupplies: OPENING_BALANCE.travelSupplyBatch.costCredits,
  fuelLot: OPENING_BALANCE.fuelLot.costCredits
} as const;

export function openingRecipes(): OpeningRecipe[] {
  return [
    {
      id: 'feed-travelers',
      title: 'Feed Travelers',
      summary: 'Turn a public cafeteria into a real meal line: counter frontage, seating, tray flow, and stock all matter.',
      steps: [
        roomStep(RoomType.Cafeteria, 20, 'Shape one 20-tile PUBLIC Cafeteria cluster'),
        moduleStep(ModuleType.ServingStation, 2, 'Two Serving Stations'),
        moduleStep(ModuleType.Table, 2, 'Two Tables (eight visible seats)'),
        moduleStep(ModuleType.TrayReturn, 1, 'One Tray Return for the meal loop'),
        {
          kind: 'stock',
          label: `Keep ${OPENING_BALANCE.preparedMealBatch.units} ready servings stocked (meal + clean tray)`,
          // Public stock must sit at the public counters. The crew reserve is
          // deliberately private until the player accepts a shared mess.
          count: OPENING_BALANCE.preparedMealBatch.units,
          costCredits: OPENING_STOCK_COST.preparedMeals,
          stockKind: 'prepared-meals'
        }
      ],
      staffing: 'No dedicated staff yet — guests collect from the counters.',
      utilities: 'Power, a reachable door, and Public zoning. A shared crew mess is cheaper but creates traffic conflict.',
      economics: 'Steady small sales. More counters reduce queues; more seats prevent a beautiful bottleneck.'
    },
    {
      id: 'sell-supplies',
      title: 'Sell Supplies',
      summary: 'Build a real shop: cargo reaches stocked shelves, shoppers browse, then check out.',
      steps: [
        roomStep(
          RoomType.Market,
          24,
          'Shape one 24-tile PUBLIC Market cluster'
        ),
        moduleStep(ModuleType.CheckoutBank, 1, 'One Checkout Bank'),
        moduleStep(ModuleType.ShelfAisle, 1, 'One Shelf Aisle (stocked by cargo)'),
        {
          kind: 'stock',
          label: 'Order opening stock through the Freight Locker',
          count: OPENING_BALANCE.travelSupplyBatch.units,
          costCredits: OPENING_STOCK_COST.travelSupplies,
          stockKind: 'travel-supplies'
        }
      ],
      staffing: 'One Steward holds the checkout; your Cargo Handler unloads and restocks the shelves.',
      utilities: 'Power, a reachable door, Public zoning, and a clear route from the Freight Locker to shelves.',
      economics: 'Ties up capital in stock. A second shelf expands range and stock buffer, but is not required to open.'
    },
    {
      id: 'service-ships',
      title: 'Refuel Pods',
      summary: 'Sell fuel to arriving pods. This is refueling only; repair and dry-dock work come later.',
      steps: [
        moduleStep(ModuleType.FuelCoupler, 1, 'Install a Fuel Coupler beside a Pod Dock'),
        roomStep(RoomType.Maintenance, ROOM_DEFINITIONS[RoomType.Maintenance].minTiles, `Paint ${ROOM_DEFINITIONS[RoomType.Maintenance].minTiles} Maintenance tiles`),
        moduleStep(ModuleType.FuelTank, 1, 'Place a Fuel Tank'),
        { kind: 'utility', label: 'Draw fuel pipe from the tank to the coupler', count: 1, costCredits: 0 },
        {
          kind: 'stock',
          label: 'Order an opening fuel lot',
          count: OPENING_BALANCE.fuelLot.units,
          costCredits: OPENING_STOCK_COST.fuelLot,
          stockKind: 'fuel'
        }
      ],
      staffing: 'Your starting Engineer covers the fuel hardware; no extra hire is needed yet.',
      utilities: 'Power, safe access, and a continuous fuel pipe run.',
      economics: 'High revenue per call, but stock, pipe, tank and dock hardware come first.'
    }
  ];
}

/**
 * Site freight conditions are part of the procurement decision, so the
 * recipe's remaining-cost headline must use the same quote the order path
 * charges. Prepared meals intentionally retain their fixed local price.
 */
function adjustedStepCost(state: StationState, step: RecipeStep): number {
  if (step.kind !== 'stock' || !step.stockKind) return step.costCredits;
  if (step.stockKind === 'travel-supplies') {
    return quoteTravelSuppliesOrder(state, step.costCredits, step.count).creditCost;
  }
  if (step.stockKind === 'fuel') {
    return quoteFuelOrder(state, step.costCredits, step.count).creditCost;
  }
  return step.costCredits;
}

export interface RecipeStepProgress extends RecipeStep {
  have: number;
  satisfied: boolean;
}

export interface RecipeProgress {
  id: OpeningRecipeId;
  title: string;
  summary: string;
  staffing: string;
  utilities: string;
  economics: string;
  steps: RecipeStepProgress[];
  /** Credits still owed on the unfinished steps. */
  remainingCostCredits: number;
  totalCostCredits: number;
  /** The permanent room/module/network investment is in place. */
  built: boolean;
  /** The completed investment can serve a customer this moment. */
  operational: boolean;
  /** Plain player-facing reasons the investment is not live yet. */
  operationalReasons: string[];
  /** Access of the coherent room candidate whose fixtures feed the progress rows. */
  candidateAccess: 'public' | 'restricted' | null;
  /**
   * Backward-compatible alias for permanent construction completion. Do not
   * use this to answer whether stock or utilities are currently live.
   */
  complete: boolean;
  affordable: boolean;
}

function countRoomTiles(state: StationState, room: RoomType): number {
  let total = 0;
  for (const tile of state.rooms) if (tile === room) total += 1;
  return total;
}

function countModules(state: StationState, module: ModuleType): number {
  return state.moduleInstances.filter((instance) => instance.type === module).length;
}

type FacilityRequirement = ReadonlyArray<readonly [ModuleType, number]>;

function moduleCountInCluster(state: StationState, cluster: number[], module: ModuleType): number {
  const tiles = new Set(cluster);
  return state.moduleInstances.filter((instance) => instance.type === module && tiles.has(instance.originTile)).length;
}

function clusterIsPublic(state: StationState, cluster: RoomClusterOperationalView): boolean {
  return cluster.tiles.every((tile) => state.zones[tile] === ZoneType.Public);
}

function matchingRoomCluster(
  state: StationState,
  room: RoomType,
  requirements: FacilityRequirement,
  minimumTiles = ROOM_DEFINITIONS[room].minTiles,
  requirePublic = false
): RoomClusterOperationalView | null {
  const matches = getRoomClusterOperationalViews(state, room).filter((cluster) =>
    cluster.tiles.length >= minimumTiles &&
    (!requirePublic || clusterIsPublic(state, cluster)) &&
    requirements.every(([module, count]) => moduleCountInCluster(state, cluster.tiles, module) >= count)
  );
  return matches.find((cluster) => cluster.active) ?? matches[0] ?? null;
}

/**
 * Recipe rows must tell one coherent spatial story. Prefer a live cluster,
 * then the cluster nearest to its fixture requirements, never a station-wide
 * sum that makes split rooms look finished.
 */
function bestRoomCluster(
  state: StationState,
  room: RoomType,
  requirements: FacilityRequirement,
  minimumTiles = ROOM_DEFINITIONS[room].minTiles
): RoomClusterOperationalView | null {
  const candidates = getRoomClusterOperationalViews(state, room)
    .filter((cluster) => cluster.tiles.length >= Math.min(minimumTiles, ROOM_DEFINITIONS[room].minTiles))
    .map((cluster) => {
    const progress = requirements.reduce(
      (total, [module, count]) => total + Math.min(count, moduleCountInCluster(state, cluster.tiles, module)) / count,
      0
    );
      return { cluster, progress };
    });
  candidates.sort((a, b) =>
    Number(b.cluster.active) - Number(a.cluster.active) ||
    b.progress - a.progress ||
    b.cluster.tiles.length - a.cluster.tiles.length
  );
  return candidates[0]?.cluster ?? null;
}

function coherentRoomProgress(
  state: StationState,
  cluster: RoomClusterOperationalView | null,
  step: RecipeStep
): number {
  if (!cluster) return 0;
  if (step.kind === 'room') return cluster.tiles.length;
  if (step.kind === 'module' && step.module !== undefined) {
    return moduleCountInCluster(state, cluster.tiles, step.module);
  }
  return 0;
}

function inactiveReason(label: string, cluster: RoomClusterOperationalView | null): string {
  if (!cluster) return label;
  if (cluster.active) return '';
  return `${label}: ${cluster.reasons.join(', ')}`;
}

function countUsableCounterServings(state: StationState, cluster: RoomClusterOperationalView | null): number {
  if (!cluster) return 0;
  const servingOrigins = new Set(
    state.moduleInstances
      .filter((module) => module.type === ModuleType.ServingStation && cluster.tiles.includes(module.originTile))
      .map((module) => module.originTile)
  );
  return state.itemNodes.reduce((total, node) => {
    if (!servingOrigins.has(node.tileIndex)) return total;
    return total + Math.min(Math.max(0, node.items.meal ?? 0), Math.max(0, node.items.cleanTray ?? 0));
  }, 0);
}

function countStockInCluster(
  state: StationState,
  cluster: RoomClusterOperationalView | null,
  module: ModuleType,
  item: ItemType
): number {
  if (!cluster) return 0;
  const origins = new Set(
    state.moduleInstances
      .filter((instance) => instance.type === module && cluster.tiles.includes(instance.originTile))
      .map((instance) => instance.originTile)
  );
  return state.itemNodes.reduce(
    (total, node) => total + (origins.has(node.tileIndex) ? Math.max(0, node.items[item] ?? 0) : 0),
    0
  );
}

function countRecipeStock(
  state: StationState,
  recipe: OpeningRecipeId,
  facility: RoomClusterOperationalView | null
): number {
  switch (recipe) {
    case 'feed-travelers':
      return countUsableCounterServings(state, facility);
    case 'sell-supplies':
      return countStockInCluster(state, facility, ModuleType.ShelfAisle, 'tradeGood');
    case 'service-ships': {
      const connectedTanks = new Set(getPodDockFuelReadiness(state).flatMap((dock) => dock.connected ? dock.tankTiles : []));
      return state.itemNodes.reduce(
        (total, node) => total + (connectedTanks.has(node.tileIndex) ? Math.max(0, node.items.fuel ?? 0) : 0),
        0
      );
    }
  }
}

function marketCheckoutReadiness(
  state: StationState,
  market: RoomClusterOperationalView | null
): { activeRegisters: number; queueCapacity: number } {
  if (!market) return { activeRegisters: 0, queueCapacity: 0 };
  const marketTiles = new Set(market.tiles);
  return state.moduleInstances
    .filter((module) => module.type === ModuleType.CheckoutBank && marketTiles.has(module.originTile))
    .reduce((summary, module) => {
      const status = getMarketFixtureStatus(state, module.id);
      if (!status || status.kind !== 'checkout') return summary;
      summary.activeRegisters += status.activeRegisters;
      summary.queueCapacity += status.capacity;
      return summary;
    }, { activeRegisters: 0, queueCapacity: 0 });
}

/**
 * How far along each recipe is, measured against what is physically on the
 * station right now. Progress may show the restricted crew mess as a cheap
 * conversion candidate, but completion always requires a coherent PUBLIC
 * commercial cluster and stock at that operation's own fixtures.
 */
export function evaluateOpeningRecipes(state: StationState): RecipeProgress[] {
  return openingRecipes().map((recipe) => {
    const cafeteria = recipe.id === 'feed-travelers'
      ? matchingRoomCluster(state, RoomType.Cafeteria, [[ModuleType.ServingStation, 2], [ModuleType.Table, 2], [ModuleType.TrayReturn, 1]], 20, true)
      : null;
    const market = recipe.id === 'sell-supplies'
      ? matchingRoomCluster(state, RoomType.Market, [[ModuleType.CheckoutBank, 1], [ModuleType.ShelfAisle, 1]], 24, true)
      : null;
    const fuelDocks = recipe.id === 'service-ships' ? getPodDockFuelReadiness(state) : [];
    const fuelNetworkReady = fuelDocks.some((dock) => dock.hasFuelCoupler && dock.connected);
    const facility = recipe.id === 'feed-travelers' ? cafeteria : market;
    const coherentCluster = recipe.id === 'feed-travelers'
      ? bestRoomCluster(state, RoomType.Cafeteria, [[ModuleType.ServingStation, 2], [ModuleType.Table, 2], [ModuleType.TrayReturn, 1]], 20)
      : recipe.id === 'sell-supplies'
        ? bestRoomCluster(state, RoomType.Market, [[ModuleType.CheckoutBank, 1], [ModuleType.ShelfAisle, 1]], 24)
        : null;
    const steps: RecipeStepProgress[] = recipe.steps.map((step) => {
      const coherentRoomStep = coherentCluster !== null && (step.kind === 'room' || step.kind === 'module');
      const have = coherentRoomStep
        ? coherentRoomProgress(state, coherentCluster, step)
        : step.kind === 'room' && step.room !== undefined
          ? countRoomTiles(state, step.room)
          : step.kind === 'module' && step.module !== undefined
            ? countModules(state, step.module)
          : step.kind === 'utility'
            ? fuelNetworkReady ? 1 : 0
            : step.kind === 'stock'
              ? countRecipeStock(state, recipe.id, facility)
              : 0;
      return { ...step, costCredits: adjustedStepCost(state, step), have, satisfied: have >= step.count };
    });
    // Price what is still missing, not the whole step: the player who already
    // owns one of two Serving Stations owes for one, and a headline that says
    // otherwise is the kind of number that stops being trusted.
    const remainingCostCredits = steps
      .filter((step) => !step.satisfied)
      .reduce((sum, step) => {
        const missing = step.kind === 'stock' ? 1 : Math.max(0, step.count - step.have);
        const perUnit = step.count > 0 ? step.costCredits / step.count : step.costCredits;
        return sum + Math.round(step.kind === 'stock' ? step.costCredits : missing * perUnit);
      }, 0);
    const totalCostCredits = steps.reduce((sum, step) => sum + step.costCredits, 0);
    const stockSteps = steps.filter((step) => step.kind === 'stock');
    // Recipe rows use the opening order as a healthy replenishment target,
    // but an operation remains open while it can serve the next customer.
    // Otherwise the first ordinary sale immediately erases the player's
    // completed business from the Global Goal.
    const serviceStockReady = stockSteps.every((step) =>
      step.have >= (recipe.id === 'service-ships' ? 4 : 1)
    );
    const marketCheckout = recipe.id === 'sell-supplies'
      ? marketCheckoutReadiness(state, market)
      : { activeRegisters: 0, queueCapacity: 0 };
    const built = recipe.id === 'feed-travelers'
      ? cafeteria !== null
      : recipe.id === 'sell-supplies'
        ? market !== null
        : recipe.id === 'service-ships'
          ? fuelNetworkReady
          : false;
    const operationalReasons: string[] = [];
    if (recipe.id === 'feed-travelers') {
      if (!cafeteria) {
        operationalReasons.push('Build one 20-tile PUBLIC Cafeteria with two Serving Stations, two Tables, and a Tray Return.');
      } else {
        const reason = inactiveReason('Cafeteria needs to be enclosed, reachable, pressurized, and powered', cafeteria);
        if (reason) operationalReasons.push(reason);
      }
      if (!serviceStockReady) operationalReasons.push('Need ready servings: each pickup needs one meal and one clean tray.');
    } else if (recipe.id === 'sell-supplies') {
      const reason = inactiveReason('Market needs enclosure, a door, a path, pressure, and local power', market);
      if (reason) operationalReasons.push(reason);
      if (!market) operationalReasons.push('Build one 24-tile PUBLIC Market with a Checkout Bank and stocked Shelf Aisle.');
      if (!serviceStockReady) operationalReasons.push('Order travel supplies through the Freight Locker.');
      if (market && marketCheckout.queueCapacity <= 0) {
        operationalReasons.push('Leave open floor in front of the Checkout Bank so shoppers can form a line.');
      } else if (market && marketCheckout.activeRegisters <= 0) {
        operationalReasons.push('A Steward must reach and hold a checkout post.');
      }
    } else {
      if (!fuelDocks.some((dock) => dock.hasFuelCoupler)) {
        operationalReasons.push('Attach a Fuel Coupler to a real Pod Dock.');
      } else if (!fuelNetworkReady) {
        const reason = fuelDocks.find((dock) => dock.hasFuelCoupler)?.reason;
        operationalReasons.push(reason ?? 'Connect a Maintenance Fuel Tank to the attached coupler with fuel pipe.');
      }
      if (!serviceStockReady) operationalReasons.push('Keep at least 4 fuel in the connected Fuel Tank for one pod refuel.');
    }
    return {
      id: recipe.id,
      title: recipe.title,
      summary: recipe.summary,
      staffing: recipe.staffing,
      utilities: recipe.utilities,
      economics: recipe.economics,
      steps,
      remainingCostCredits,
      totalCostCredits,
      built,
      operational: built && serviceStockReady && operationalReasons.length === 0,
      operationalReasons,
      candidateAccess: coherentCluster === null
        ? null
        : clusterIsPublic(state, coherentCluster)
          ? 'public'
          : 'restricted',
      complete: built,
      affordable: state.metrics.credits >= remainingCostCredits
    };
  });
}

/**
 * Facilities the player cannot build yet, kept visible with plain prerequisite
 * copy so a later tier is never a surprise (shared contract C9).
 */
export interface FutureFacility {
  title: string;
  prerequisite: string;
}

export function futureFacilities(): FutureFacility[] {
  return [
    { title: 'Kitchen', prerequisite: 'Cook meals from raw food for a better margin once a Cafeteria is running.' },
    { title: 'Lounge', prerequisite: 'Somewhere for travellers to spend time and money. Needs the first station rating.' },
    { title: 'Cantina', prerequisite: 'Drink service. Station-run or leased to a tenant.' },
    { title: 'Storage and Racks', prerequisite: 'Buffer stock for a larger shop. Unlocks with Production Logistics.' },
    { title: 'Workshop', prerequisite: 'Repair work and parts. Unlocks with Production Logistics.' },
    { title: 'Medium Berth', prerequisite: 'Larger ships and contracts. Needs the capital for a full berth, not a tier.' }
  ];
}
