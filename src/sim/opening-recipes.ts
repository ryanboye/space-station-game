/**
 * The three opening businesses, as recipes rather than prefabs.
 *
 * OPEN-03. The build catalog is a flat list of every module, which answers
 * "what can I place" but not "what does a business need". These recipes group
 * the catalog under the three decisions the opening actually offers — Feed
 * Travelers, Sell Supplies, Service Ships — and state each one's cost,
 * footprint, utilities, staff and stock up front.
 *
 * This is decision and placement guidance, not a one-click builder: every step
 * resolves to an ordinary room-paint or module-place tool, every module stays
 * individually placeable, and move and resale are untouched. Future facilities
 * stay visible with plain prerequisite copy so nothing arrives as a surprise.
 */

import { MODULE_DEFINITIONS, OPENING_BALANCE, ROOM_DEFINITIONS } from './balance';
import { ModuleType, RoomType, type StationState } from './types';

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
}

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

function roomStep(room: RoomType, label: string): RecipeStep {
  return { kind: 'room', room, count: ROOM_DEFINITIONS[room].minTiles, label, costCredits: 0 };
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
      summary: 'Sell prepared meals to arriving pods. Simplest operation, thinnest margin.',
      steps: [
        roomStep(RoomType.Cafeteria, `Paint ${ROOM_DEFINITIONS[RoomType.Cafeteria].minTiles} Cafeteria tiles`),
        moduleStep(ModuleType.ServingStation, 2, 'Two Serving Stations (one more counter)'),
        moduleStep(ModuleType.Table, 2, 'Two Tables (eight seats)'),
        {
          kind: 'stock',
          label: 'Buy an opening batch of prepared meals',
          count: OPENING_BALANCE.preparedMealBatch.units,
          costCredits: OPENING_STOCK_COST.preparedMeals
        }
      ],
      staffing: 'No dedicated staff yet — pickup is self-service.',
      utilities: 'Power and a reachable door. Adds dirty trays and cleaning load.',
      economics: 'Steady small sales. Margin is capped by what prepared meals cost to buy.'
    },
    {
      id: 'sell-supplies',
      title: 'Sell Supplies',
      summary: 'Stock travel goods and sell them to passing travellers.',
      steps: [
        roomStep(RoomType.Market, `Paint ${ROOM_DEFINITIONS[RoomType.Market].minTiles} Market tiles`),
        moduleStep(ModuleType.MarketStall, 1, 'Place a Market Stall'),
        {
          kind: 'stock',
          label: 'Order opening stock through the Freight Locker',
          count: OPENING_BALANCE.travelSupplyBatch.units,
          costCredits: OPENING_STOCK_COST.travelSupplies
        }
      ],
      staffing: 'A Cargo Handler to haul the delivered lot from receiving.',
      utilities: 'Power, a reachable door, and a clear route from the Freight Locker.',
      economics: 'Ties up capital in stock. Pricing policy trades margin against volume.'
    },
    {
      id: 'service-ships',
      title: 'Service Ships',
      summary: 'Refuel arriving craft. Strongest per-call revenue, most hardware.',
      steps: [
        moduleStep(ModuleType.FuelCoupler, 1, 'Install a Fuel Coupler beside a Pod Dock'),
        roomStep(RoomType.Maintenance, `Paint ${ROOM_DEFINITIONS[RoomType.Maintenance].minTiles} Maintenance tiles`),
        moduleStep(ModuleType.FuelTank, 1, 'Place a Fuel Tank'),
        { kind: 'utility', label: 'Draw fuel pipe from the tank to the coupler', count: 1, costCredits: 0 },
        { kind: 'stock', label: 'Order an opening fuel lot', count: OPENING_BALANCE.fuelLot.units, costCredits: OPENING_STOCK_COST.fuelLot }
      ],
      staffing: 'An Engineer once physical staffing is enabled.',
      utilities: 'Power, safe access, and a continuous fuel pipe run.',
      economics: 'High revenue per call, but stock, pipe, tank and dock hardware come first.'
    }
  ];
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

function countUtilityTiles(state: StationState, layer: 'fuel-pipe'): number {
  const tiles = state.utilityUnderlay?.layers?.[layer];
  if (!tiles) return 0;
  let total = 0;
  for (const value of tiles) if (value > 0) total += 1;
  return total;
}

/**
 * How far along each recipe is, measured against what is physically on the
 * station right now. The starter's own crew mess counts toward Feed
 * Travelers, which is honest: the player really does only need the difference.
 */
export function evaluateOpeningRecipes(state: StationState): RecipeProgress[] {
  return openingRecipes().map((recipe) => {
    const steps: RecipeStepProgress[] = recipe.steps.map((step) => {
      const have = step.kind === 'room' && step.room !== undefined
        ? countRoomTiles(state, step.room)
        : step.kind === 'module' && step.module !== undefined
          ? countModules(state, step.module)
          : step.kind === 'utility'
            ? countUtilityTiles(state, 'fuel-pipe')
            : 0;
      return { ...step, have, satisfied: step.kind === 'stock' ? false : have >= step.count };
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
      complete: steps.every((step) => step.satisfied),
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
