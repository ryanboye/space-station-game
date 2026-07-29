import { readFileSync } from 'node:fs';
import {
  constructionPhaseSpriteKey,
  constructionPhaseVisualState,
  constructionPressurizingTiles
} from '../src/render/render';
import { createInitialState } from '../src/sim/sim';
import { TileType, type ConstructionSite, type StationState } from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`construction-phase-art: ${message}`);
}

function site(overrides: Partial<ConstructionSite>): ConstructionSite {
  return {
    id: 1,
    kind: 'tile',
    tileIndex: 100,
    targetTile: TileType.Wall,
    requiredMaterials: 4,
    deliveredMaterials: 0,
    buildProgress: 0,
    buildWorkRequired: 7,
    requiresEva: true,
    assignedCrewId: null,
    state: 'planned',
    blockedReason: null,
    createdAt: 0,
    ...overrides
  };
}

function testConstructionTruthSelection(): void {
  const scaffold = site({ structuralStage: 'perimeter' });
  assert(constructionPhaseVisualState(scaffold) === 'scaffold', 'Undelivered EVA perimeter must expose scaffold.');

  const wall = site({
    structuralStage: 'perimeter',
    deliveredMaterials: 4,
    state: 'building',
    buildProgress: 2
  });
  assert(constructionPhaseVisualState(wall) === 'wall', 'Material-ready perimeter must show wall fabric.');

  const floor = site({
    structuralStage: 'interior',
    targetTile: TileType.Floor,
    deliveredMaterials: 4,
    state: 'building',
    buildProgress: 2
  });
  assert(constructionPhaseVisualState(floor) === 'floor', 'Material-ready interior must show floor fabric.');

  const seal = site({
    structuralStage: 'seal-check',
    targetTile: TileType.Truss,
    requiredMaterials: 0,
    state: 'building'
  });
  assert(constructionPhaseVisualState(seal) === 'seal', 'Explicit seal-check site must select seal art before generic Truss art.');

  assert(constructionPhaseVisualState(site({ kind: 'module' })) === null, 'Module construction must keep its existing renderer.');
  assert(constructionPhaseVisualState(site({ targetTile: undefined })) === null, 'A tile site without a target must keep fallback art.');
}

function testAllFiveAtlasKeysAreDistinct(): void {
  const states = ['scaffold', 'floor', 'wall', 'seal', 'pressurizing'] as const;
  const keys = states.map(constructionPhaseSpriteKey);
  assert(new Set(keys).size === states.length, `Expected five distinct atlas keys, got ${keys.join(', ')}.`);
  assert(keys.every((key) => key.startsWith('construction.')), 'Construction art must stay in its own atlas namespace.');
}

function testAllFiveFramesArePackedAtOneTile(): void {
  const states = ['scaffold', 'floor', 'wall', 'seal', 'pressurizing'] as const;
  const keys = states.map(constructionPhaseSpriteKey);
  const required = JSON.parse(readFileSync('tools/sprites/required-keys-v1.json', 'utf8')) as string[];
  const manifest = JSON.parse(readFileSync('public/assets/sprites/atlas.json', 'utf8')) as {
    cellSize: number;
    frames: Record<string, { w: number; h: number }>;
  };
  for (const key of keys) {
    assert(required.includes(key), `${key} is missing from the required v1 sprite contract.`);
    const frame = manifest.frames[key];
    assert(frame, `${key} is not registered in the packed runtime atlas.`);
    assert(
      frame.w === manifest.cellSize && frame.h === manifest.cellSize,
      `${key} must pack as exactly one tile, got ${frame.w}x${frame.h}.`
    );
  }
}

function testPressurizingUsesCommissionedVacuumTruth(): void {
  const state = createInitialState({ seed: 797_001, physicalStarterInventory: true });
  const floorTile = state.tiles.findIndex((tile) => tile === TileType.Space);
  const wallTile = state.tiles.findIndex((tile, index) => tile === TileType.Space && index > floorTile);
  assert(floorTile >= 0 && wallTile >= 0, 'Fixture needs two space tiles.');
  state.now = 100;
  state.tiles[floorTile] = TileType.Floor;
  state.tiles[wallTile] = TileType.Wall;
  state.pressurized[floorTile] = false;
  state.pressurized[wallTile] = false;
  state.structuralExpansionProjects = [{
    id: 77,
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    doorTile: null,
    targets: [
      { tileIndex: floorTile, targetTile: TileType.Floor, requiredMaterials: 1 },
      { tileIndex: wallTile, targetTile: TileType.Wall, requiredMaterials: 1 }
    ],
    phase: 'commissioned',
    childSiteIds: [],
    completedSiteIds: [],
    requiredMaterials: 2,
    deliveredMaterials: 2,
    refundedMaterials: 0,
    blockedReason: null,
    cancelled: false,
    commissioned: true,
    createdAt: 90,
    finishedAt: 100
  }];

  assert(constructionPressurizingTiles(state).length === 0, 'Pressure-on art must wait for live pressure truth.');
  state.pressurized[floorTile] = true;
  assert(
    constructionPressurizingTiles(state).join(',') === String(floorTile),
    'Only newly commissioned, now-pressurized walkable targets may show pressure-on art.'
  );
  state.now = 104;
  assert(constructionPressurizingTiles(state).length === 0, 'A later breach must not masquerade as commissioning.');

  state.now = 100;
  state.pressurized[floorTile] = true;
  state.structuralExpansionProjects[0]!.phase = 'blocked';
  state.structuralExpansionProjects[0]!.commissioned = false;
  assert(constructionPressurizingTiles(state).length === 0, 'An uncommissioned shell cannot show pressure-on art.');
}

function testBlockedTruthDoesNotChangeFabric(): void {
  const blockedWall = site({
    structuralStage: 'perimeter',
    deliveredMaterials: 4,
    state: 'blocked',
    blockedReason: 'work position obstructed'
  });
  assert(
    constructionPhaseVisualState(blockedWall) === 'wall',
    'Blocked labels remain a separate overlay and must not erase the physical fabric state.'
  );
}

testConstructionTruthSelection();
testAllFiveAtlasKeysAreDistinct();
testAllFiveFramesArePackedAtOneTile();
testPressurizingUsesCommissionedVacuumTruth();
testBlockedTruthDoesNotChangeFabric();
console.log('construction-phase-art-tests: ok 5 states');
