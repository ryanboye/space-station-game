import { readFileSync } from 'node:fs';
import { createInitialState, setRoom, tick } from '../src/sim';
import { evaluateOpeningRecipes, type RecipeProgress, type RecipeStepProgress } from '../src/sim/opening-recipes';
import { RoomType, TileType, ZoneType, type StationState } from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`opening-recipe-ui: ${message}`);
}

function fresh(): StationState {
  const state = createInitialState({ physicalStarterInventory: true, manualTrafficAdmission: true });
  tick(state, 0);
  return state;
}

function emptyFootprint(state: StationState, width: number, height: number): number[] {
  for (let y = 1; y <= state.height - height - 1; y += 1) {
    for (let x = 1; x <= state.width - width - 1; x += 1) {
      const tiles: number[] = [];
      for (let dy = 0; dy < height; dy += 1) {
        for (let dx = 0; dx < width; dx += 1) {
          tiles.push((y + dy) * state.width + x + dx);
        }
      }
      if (tiles.every((tile) =>
        state.tiles[tile] === TileType.Floor &&
          state.rooms[tile] === RoomType.None &&
          state.moduleOccupancyByTile[tile] === null
      )) return tiles;
    }
  }
  throw new Error(`opening-recipe-ui: no empty ${width}x${height} starter footprint`);
}

function paintMarket(state: StationState, tiles: number[], access: ZoneType): void {
  for (const tile of tiles) {
    setRoom(state, tile, RoomType.Market);
    state.zones[tile] = access;
  }
  tick(state, 0);
}

function authorIsolatedMarketFragment(state: StationState, x: number, y: number): number[] {
  const tiles: number[] = [];
  for (let dy = 0; dy < 4; dy += 1) {
    for (let dx = 0; dx < 2; dx += 1) {
      const tile = (y + dy) * state.width + x + dx;
      state.tiles[tile] = TileType.Floor;
      state.moduleOccupancyByTile[tile] = null;
      tiles.push(tile);
    }
  }
  paintMarket(state, tiles, ZoneType.Public);
  return tiles;
}

function marketRecipe(state: StationState): RecipeProgress {
  const recipe = evaluateOpeningRecipes(state).find((candidate) => candidate.id === 'sell-supplies');
  assert(recipe, 'Sell Supplies recipe is missing');
  return recipe;
}

type RecipeNextControl = (recipe: RecipeProgress) => string;

/**
 * Execute the exact pure renderer body from main.ts without booting the app's
 * DOM. The surrounding formatting helpers are deterministic stubs because
 * this test owns action selection, attributes, and player-facing next-step
 * copy rather than HTML escaping itself.
 */
function loadRecipeNextControl(): RecipeNextControl {
  const source = readFileSync('src/main.ts', 'utf8');
  const start = source.indexOf('function recipeNextControl(');
  const endMarker = '\n}\n\n/**\n * Signature of the last rendered catalog.';
  const end = source.indexOf(endMarker, start);
  assert(start >= 0 && end > start, 'could not isolate recipeNextControl from main.ts');
  const functionSource = source
    .slice(start, end + 2)
    .replace(
      /function recipeNextControl\(recipe: ReturnType<typeof evaluateOpeningRecipes>\[number\]\): string/,
      'function recipeNextControl(recipe)'
    );
  const factory = new Function(
    'recipeStepAttributes',
    'escapeHtml',
    'recipeStepDetail',
    `${functionSource}; return recipeNextControl;`
  ) as (
    attributes: (step: RecipeStepProgress) => string,
    escape: (value: string) => string,
    detail: (recipeId: string, step: RecipeStepProgress) => string
  ) => RecipeNextControl;
  return factory(
    (step) => step.kind === 'room'
      ? ' data-tool-room="market"'
      : step.label.includes('Checkout Bank')
        ? ' data-tool-module="checkout-bank"'
        : '',
    (value) => value,
    (_recipeId, step) => `${step.have}/${step.count}`
  );
}

const recipeNextControl = loadRecipeNextControl();

const publicState = fresh();
paintMarket(publicState, emptyFootprint(publicState, 3, 8), ZoneType.Public);
const publicRecipe = marketRecipe(publicState);
assert(publicRecipe.candidateAccess === 'public', 'coherent 3x8 Public Market was not the public candidate');
const publicControl = recipeNextControl(publicRecipe);
assert(publicControl.includes('data-tool-module="checkout-bank"'), 'Public Market did not advance to Checkout Bank');
assert(!publicControl.includes('data-tool-zone="public"'), 'Public Market incorrectly offered access zoning');

const restrictedState = fresh();
paintMarket(restrictedState, emptyFootprint(restrictedState, 3, 8), ZoneType.Restricted);
const restrictedRecipe = marketRecipe(restrictedState);
assert(restrictedRecipe.candidateAccess === 'restricted', 'coherent restricted Market was not the restricted candidate');
const restrictedControl = recipeNextControl(restrictedRecipe);
assert(restrictedControl.includes('data-tool-zone="public"'), 'restricted coherent Market did not offer Paint Public access');
assert(restrictedControl.includes('Paint Public access'), 'restricted access action lost its player-facing label');

const fragmentedState = fresh();
const firstFragment = authorIsolatedMarketFragment(fragmentedState, 1, 1);
const secondFragment = authorIsolatedMarketFragment(fragmentedState, 6, 1);
const thirdFragment = authorIsolatedMarketFragment(fragmentedState, 11, 1);
const fragmentedTiles = [...firstFragment, ...secondFragment, ...thirdFragment];
assert(fragmentedTiles.length === 24, 'fragment fixture does not total 24 Market tiles');
const fragmentedRecipe = marketRecipe(fragmentedState);
const fragmentedRoomStep = fragmentedRecipe.steps.find((step) => step.kind === 'room');
assert(fragmentedRoomStep?.satisfied, 'fragment fixture did not reproduce the misleading satisfied room total');
assert(fragmentedRecipe.candidateAccess === null, 'fragmented Market unexpectedly produced a coherent candidate');
const fragmentedControl = recipeNextControl(fragmentedRecipe);
assert(fragmentedControl.includes('data-tool-room="market"'), 'fragmented Market did not return to the room tool');
assert(fragmentedControl.includes('shape one coherent room cluster'), 'fragmented Market did not ask for one coherent room');
assert(!fragmentedControl.includes('data-tool-zone="public"'), 'fragmented Market incorrectly offered access zoning');
assert(!fragmentedControl.includes('data-tool-module="checkout-bank"'), 'fragmented Market skipped ahead to Checkout Bank');

console.log('opening-recipe-ui-tests: PASS');
console.log('  public      coherent 3x8 Market -> Checkout Bank');
console.log('  restricted  coherent candidate -> Paint Public access');
console.log('  fragmented  24 total tiles/no candidate -> shape one coherent Market cluster');
