import {
  applyConstructionSite,
  buildStationExpansionOnTruss,
  cancelConstructionAtTile,
  createInitialState,
  expandMap,
  findSpacePath,
  getBerthFacilityAt,
  pickBerthForShip,
  planStructuralPieceConstruction,
  setTile,
  setRoom,
  tryPlaceModule,
  tick
} from '../src/sim/sim';
import { advanceStructuralExpansionProjects, cleanupConstructionSites } from '../src/sim/construction';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import {
  buildStructuralSupportGraph,
  deriveStructuralInterfaceLoads,
  getStructuralSupportCacheStats,
  validateLiveStructuralInterfaces,
  validateStructuralSupportPlan
} from '../src/sim/structural-support';
import { structuralPieceSpriteKey, structuralPieceVisualState } from '../src/render/render';
import { ModuleType, RoomType, TileType, fromIndex, inBounds, toIndex, type StationState } from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function exteriorWallWithSpace(state: StationState, run = 2): { root: number; dx: number; dy: number } {
  for (let tile = 0; tile < state.tiles.length; tile++) {
    if (state.tiles[tile] !== TileType.Wall && state.tiles[tile] !== TileType.Airlock && state.tiles[tile] !== TileType.Door) continue;
    const point = fromIndex(tile, state.width);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      let clear = true;
      for (let offset = 1; offset <= run; offset++) {
        const x = point.x + dx * offset;
        const y = point.y + dy * offset;
        if (!inBounds(x, y, state.width, state.height) || state.tiles[toIndex(x, y, state.width)] !== TileType.Space) clear = false;
      }
      if (clear) return { root: tile, dx, dy };
    }
  }
  throw new Error('No clear exterior wall face found.');
}

function offset(state: StationState, start: number, dx: number, dy: number, amount: number): number {
  const point = fromIndex(start, state.width);
  return toIndex(point.x + dx * amount, point.y + dy * amount, state.width);
}

function bulkheadOrigin(state: StationState, face: { root: number; dx: number; dy: number }): number {
  return face.dx < 0 || face.dy < 0 ? offset(state, face.root, face.dx, face.dy, 1) : face.root;
}

function freeJunctionTarget(state: StationState): number {
  const occupied = new Set(state.structuralPieces.flatMap((piece) => piece.tiles));
  for (let tile = 0; tile < state.tiles.length; tile++) {
    if (state.tiles[tile] !== TileType.Wall && state.tiles[tile] !== TileType.Airlock && state.tiles[tile] !== TileType.Door) continue;
    const point = fromIndex(tile, state.width);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = point.x + dx;
      const y = point.y + dy;
      if (!inBounds(x, y, state.width, state.height)) continue;
      const target = toIndex(x, y, state.width);
      if (state.tiles[target] === TileType.Space && !occupied.has(target)) return target;
    }
  }
  throw new Error('No free Junction target found.');
}

function siteFor(state: StationState, pieceId: number) {
  const site = state.constructionSites.find((candidate) => candidate.structuralPieceId === pieceId);
  assert(site, `Missing construction site for structural piece ${pieceId}.`);
  return site;
}

function completePiece(state: StationState, pieceId: number): void {
  const site = siteFor(state, pieceId);
  site.deliveredMaterials = site.requiredMaterials;
  site.buildProgress = site.buildWorkRequired;
  assert(applyConstructionSite(state, site), `Structural piece ${pieceId} should complete.`);
  site.state = 'done';
}

function commissionExteriorExpansion(
  state: StationState,
  length: number,
  depth: number
): {
  project: StationState['structuralExpansionProjects'][number];
  patch: number[];
  outward: readonly [number, number];
  tangent: readonly [number, number];
  boundaryStart: number;
} {
  for (let boundaryStart = 0; boundaryStart < state.tiles.length; boundaryStart++) {
    if (state.tiles[boundaryStart] !== TileType.Wall) continue;
    const start = fromIndex(boundaryStart, state.width);
    for (const outward of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const tangent = (outward[0] === 0 ? [1, 0] : [0, 1]) as readonly [number, number];
      const boundary: number[] = [];
      const patch: number[] = [];
      let valid = true;
      for (let along = 0; along < length && valid; along++) {
        const wallX = start.x + tangent[0] * along;
        const wallY = start.y + tangent[1] * along;
        const insideX = wallX - outward[0];
        const insideY = wallY - outward[1];
        if (!inBounds(wallX, wallY, state.width, state.height) || !inBounds(insideX, insideY, state.width, state.height)) {
          valid = false;
          break;
        }
        const wall = toIndex(wallX, wallY, state.width);
        const inside = toIndex(insideX, insideY, state.width);
        if (state.tiles[wall] !== TileType.Wall || state.tiles[inside] !== TileType.Floor) {
          valid = false;
          break;
        }
        boundary.push(wall);
        for (let distance = 1; distance <= depth; distance++) {
          const x = wallX + outward[0] * distance;
          const y = wallY + outward[1] * distance;
          if (!inBounds(x, y, state.width, state.height)) {
            valid = false;
            break;
          }
          const tile = toIndex(x, y, state.width);
          if (state.tiles[tile] !== TileType.Space) {
            valid = false;
            break;
          }
          patch.push(tile);
        }
      }
      if (!valid) continue;
      for (const tile of patch) setTile(state, tile, TileType.Truss);
      const withoutJunctions = buildStationExpansionOnTruss(state, patch);
      const branchTiles = validateStructuralSupportPlan(state).problems
        .filter((problem) => problem.reason === 'branch-requires-junction')
        .map((problem) => problem.tile);
      if (branchTiles.length === 0) {
        if (withoutJunctions.ok) {
          throw new Error('Expansion fixture unexpectedly planned before its branch proof.');
        }
        for (const tile of patch) setTile(state, tile, TileType.Space);
        continue;
      }
      assert(
        !withoutJunctions.ok && withoutJunctions.reason === 'structural support: branch-requires-junction',
        `Production expansion must reject the branched scaffold before Junction completion (${withoutJunctions.reason ?? 'accepted'}).`
      );
      for (const tile of branchTiles) {
        const junction = planStructuralPieceConstruction(state, tile, 'junction');
        assert(junction.ok && junction.pieceId !== undefined, `Expansion branch Junction should plan (${junction.reason ?? 'unknown'}).`);
        completePiece(state, junction.pieceId);
      }
      cleanupConstructionSites(state);
      const planned = buildStationExpansionOnTruss(state, patch);
      if (!planned.ok) {
        for (const tile of patch) setTile(state, tile, TileType.Space);
        continue;
      }
      const project = state.structuralExpansionProjects[state.structuralExpansionProjects.length - 1]!;
      for (let guard = 0; guard < 8 && !project.commissioned; guard++) {
        for (const site of state.constructionSites.filter((candidate) =>
          candidate.structuralProjectId === project.id && candidate.state !== 'done'
        )) {
          site.deliveredMaterials = site.requiredMaterials;
          site.buildProgress = site.buildWorkRequired;
          assert(applyConstructionSite(state, site), `Expansion child ${site.id} should complete.`);
          site.state = 'done';
        }
        advanceStructuralExpansionProjects(state);
      }
      assert(project.commissioned, `Real expansion must commission (${project.phase}: ${project.blockedReason ?? 'none'}).`);
      return { project, patch, outward, tangent, boundaryStart };
    }
  }
  throw new Error(`No ${length}x${depth} exterior expansion face found.`);
}

function buildExpansionBerth(
  state: StationState,
  clampCount: 2 | 5
): {
  project: StationState['structuralExpansionProjects'][number];
  clampTiles: number[];
  bulkheadWall: number;
  frontageOutward: readonly [number, number];
  bulkheadOutward: readonly [number, number];
} {
  const fixture = commissionExteriorExpansion(state, 7, 6);
  for (const tile of fixture.patch) setRoom(state, tile, RoomType.Berth);
  const boundaryStart = fromIndex(fixture.boundaryStart, state.width);
  const frontage = Array.from({ length: 7 }, (_, along) => {
    const wallX = boundaryStart.x + fixture.tangent[0] * along;
    const wallY = boundaryStart.y + fixture.tangent[1] * along;
    return toIndex(
      wallX + fixture.outward[0] * 7,
      wallY + fixture.outward[1] * 7,
      state.width
    );
  });
  const bulkheadWall = toIndex(
    boundaryStart.x - fixture.tangent[0] + fixture.outward[0] * 3,
    boundaryStart.y - fixture.tangent[1] + fixture.outward[1] * 3,
    state.width
  );
  assert(state.tiles[bulkheadWall] === TileType.Wall, 'Commissioned expansion must retain a side hull face for its Bulkhead.');
  const serviceRail = frontage;
  for (const tile of serviceRail) {
    setTile(state, tile, TileType.Floor);
    setRoom(state, tile, RoomType.Berth);
  }
  const gangway = tryPlaceModule(state, ModuleType.Gangway, serviceRail[2]!);
  assert(gangway.ok, `Expansion Gangway placement failed (${gangway.reason ?? 'unknown'}).`);
  const clampTiles = serviceRail.filter((tile) => tile !== serviceRail[2]).slice(0, clampCount);
  for (const tile of clampTiles) {
    const clamp = tryPlaceModule(state, ModuleType.DockingClamp, tile);
    assert(clamp.ok, `Expansion Docking Clamp placement failed (${clamp.reason ?? 'unknown'}).`);
  }
  const controlTile = fixture.patch[Math.floor(fixture.patch.length / 2)]!;
  const control = tryPlaceModule(state, ModuleType.BerthControl, controlTile);
  assert(control.ok, `Expansion Berth Control placement failed (${control.reason ?? 'unknown'}).`);
  tick(state, 0);
  for (const tile of fixture.patch) state.pressurized[tile] = true;
  if (fixture.project.doorTile !== null) state.pressurized[fixture.project.doorTile] = true;
  const facility = getBerthFacilityAt(state, fixture.patch[0]!);
  assert(
    facility?.geometryValid,
    `Commissioned expansion must host a real modern Berth (${facility?.geometry ?? 'missing'}: ${facility?.reasons.join('; ') ?? 'none'}).`
  );
  return {
    project: fixture.project,
    clampTiles,
    bulkheadWall,
    frontageOutward: fixture.outward,
    bulkheadOutward: [-fixture.tangent[0], -fixture.tangent[1]]
  };
}

// Junction changes branch legality only after real completion. Planning graph
// can show it immediately, while live validation deliberately cannot use it.
{
  const state = createInitialState({ seed: 88201 });
  state.metrics.credits = 500;
  const face = exteriorWallWithSpace(state, 5);
  const run = [1, 2, 3, 4].map((n) => offset(state, face.root, face.dx, face.dy, n));
  for (const tile of run) setTile(state, tile, TileType.Truss);
  const branch = run[2]!;
  const branchPoint = fromIndex(branch, state.width);
  const lateral = face.dx === 0 ? [1, 0] as const : [0, 1] as const;
  const branchArm = toIndex(branchPoint.x + lateral[0], branchPoint.y + lateral[1], state.width);
  setTile(state, branchArm, TileType.Truss);
  assert(
    validateStructuralSupportPlan(state).problems.some((problem) => problem.tile === branch && problem.reason === 'branch-requires-junction'),
    'Ordinary Truss must reject a three-way branch.'
  );
  const planned = planStructuralPieceConstruction(state, branch, 'junction');
  assert(planned.ok && planned.pieceId !== undefined, `Junction should plan (${planned.reason ?? 'unknown'}).`);
  const pendingNode = buildStructuralSupportGraph(state).nodes.find((node) => node.tile === branch);
  assert(pendingNode?.kind === 'junction' && !pendingNode.existing, 'Planning graph must include the pending Junction as proposed.');
  assert(
    validateStructuralSupportPlan(state).problems.some((problem) => problem.tile === branch && problem.reason === 'branch-requires-junction'),
    'Pending Junction must not change production branch validation.'
  );
  const buildsBefore = getStructuralSupportCacheStats(state).builds;
  completePiece(state, planned.pieceId);
  assert(validateStructuralSupportPlan(state).ok, 'Completed Junction must legalize the branch and renew support.');
  assert(buildStructuralSupportGraph(state).nodes.find((node) => node.tile === branch)?.existing, 'Completed Junction must become an existing graph node.');
  assert(getStructuralSupportCacheStats(state).builds >= buildsBefore, 'Completion must invalidate/rebuild structural graph cache.');
  state.controls.paused = false;
  for (let step = 0; step < 20 && !state.maintenanceDebts.some((debt) => debt.key === `structural-piece:${planned.pieceId}`); step++) tick(state, 0.2);
  assert(
    state.maintenanceDebts.some((debt) => debt.key === `structural-piece:${planned.pieceId}`),
    'Production maintenance pass must author the completed structural-piece debt target.'
  );
}

// Bulkhead owns both rotated footprint tiles, blocks overlap through either,
// and only satisfies a heavy transfer after completion.
{
  const state = createInitialState({ seed: 88202 });
  state.metrics.credits = 500;
  const face = exteriorWallWithSpace(state, 2);
  const outside = offset(state, face.root, face.dx, face.dy, 1);
  const rotation = face.dx === 0 ? 90 : 0;
  const allExteriorOrigin = face.dx > 0 || face.dy > 0
    ? outside
    : offset(state, face.root, face.dx, face.dy, 2);
  assert(
    !planStructuralPieceConstruction(state, allExteriorOrigin, 'reinforced-bulkhead', rotation).ok,
    'Bulkhead must not float across two exterior tiles without bridging the hull face.'
  );
  const before = validateStructuralSupportPlan(state, [], [{ tile: outside, kind: 'heavy' }]);
  assert(before.problems.some((problem) => problem.reason === 'heavy-load-requires-reinforced-transfer'), 'Heavy load must fail without Bulkhead.');
  const suppliedRotation = rotation === 90 ? 270 : 180;
  const planned = planStructuralPieceConstruction(state, bulkheadOrigin(state, face), 'reinforced-bulkhead', suppliedRotation);
  assert(planned.ok && planned.pieceId !== undefined, `Bulkhead should plan (${planned.reason ?? 'unknown'}).`);
  const piece = state.structuralPieces.find((candidate) => candidate.id === planned.pieceId)!;
  assert(piece.rotation === rotation, 'Bulkhead must normalize 90/270 vertical and 0/180 horizontal before persisting.');
  assert(piece.tiles.length === 2 && piece.tiles.includes(outside), 'Bulkhead must own its exact rotated 2x1 footprint.');
  assert(
    !planStructuralPieceConstruction(state, piece.tiles[1]!, 'junction').ok,
    'A second piece must not overlap the non-origin half of a Bulkhead.'
  );
  assert(
    validateStructuralSupportPlan(state, [], [{ tile: outside, kind: 'heavy' }]).problems.some((problem) => problem.reason === 'heavy-load-requires-reinforced-transfer'),
    'Pending Bulkhead must not satisfy live heavy transfer.'
  );
  completePiece(state, planned.pieceId);
  assert(validateStructuralSupportPlan(state, [], [{ tile: outside, kind: 'heavy' }]).ok, 'Completed Bulkhead must satisfy heavy transfer to hull root.');
}

// Cancellation from either footprint tile removes identity and refunds both
// paid credits and already-delivered materials exactly once.
{
  const state = createInitialState({ seed: 88203 });
  state.metrics.credits = 500;
  state.legacyMaterialStock = 0;
  const face = exteriorWallWithSpace(state, 2);
  const rotation = face.dx === 0 ? 90 : 0;
  const creditsBefore = state.metrics.credits;
  const planned = planStructuralPieceConstruction(state, bulkheadOrigin(state, face), 'reinforced-bulkhead', rotation);
  assert(planned.ok && planned.pieceId !== undefined, 'Refund fixture Bulkhead should plan.');
  const piece = state.structuralPieces.find((candidate) => candidate.id === planned.pieceId)!;
  const site = siteFor(state, piece.id);
  site.deliveredMaterials = 3;
  assert(cancelConstructionAtTile(state, piece.tiles[1]!), 'Cancel must resolve through the second footprint tile.');
  assert(!state.structuralPieces.some((candidate) => candidate.id === piece.id), 'Cancellation must remove pending durable identity.');
  assert(state.metrics.credits === creditsBefore, 'Cancellation must refund the paid structural-piece credits exactly.');
  assert(state.legacyMaterialStock === 3, `Cancellation must refund delivered material exactly (got ${state.legacyMaterialStock}).`);
  assert(!cancelConstructionAtTile(state, piece.tiles[1]!), 'Repeated cancellation must not pay a second refund.');
}

// Mid-build and complete saves preserve state; legacy payloads default empty.
{
  const state = createInitialState({ seed: 88204 });
  state.metrics.credits = 500;
  const face = exteriorWallWithSpace(state, 2);
  const planned = planStructuralPieceConstruction(state, bulkheadOrigin(state, face), 'reinforced-bulkhead', face.dx === 0 ? 90 : 0);
  assert(planned.ok && planned.pieceId !== undefined, 'Save fixture Bulkhead should plan.');
  const site = siteFor(state, planned.pieceId);
  const sourcePiece = state.structuralPieces.find((piece) => piece.id === planned.pieceId)!;
  assert(structuralPieceVisualState(state, sourcePiece) === 'planned', 'Undelivered piece sprite state must be planned.');
  assert(
    structuralPieceSpriteKey(sourcePiece, 'planned') === 'module.reinforced_bulkhead.planned',
    'Bulkhead planned state must use its curated atlas key.'
  );
  site.deliveredMaterials = site.requiredMaterials;
  assert(structuralPieceVisualState(state, sourcePiece) === 'delivered', 'Delivered material with no weld work must select delivered art.');
  site.buildProgress = site.buildWorkRequired * 0.4;
  const midParsed = parseAndMigrateSave(serializeSave('structural-mid', state, 'structural-piece-tests'));
  assert(midParsed.ok, 'Mid-build structural save should parse.');
  const mid = hydrateStateFromSave(midParsed.save);
  const midPiece = mid.state.structuralPieces.find((piece) => piece.id === planned.pieceId)!;
  assert(midPiece && !midPiece.completed && siteFor(mid.state, midPiece.id).buildProgress > 0, 'Mid-build piece and welding progress must hydrate.');
  assert(structuralPieceVisualState(mid.state, midPiece) === 'welding', 'Mid-build hydrated sprite state must be welding.');
  completePiece(mid.state, midPiece.id);
  assert(structuralPieceVisualState(mid.state, midPiece) === 'complete', 'Completed piece must select complete art.');
  mid.state.maintenanceDebts.push({
    key: `structural-piece:${midPiece.id}`,
    domain: 'module',
    source: 'high-load',
    anchorTile: midPiece.originTile,
    targetTile: midPiece.originTile,
    exterior: true,
    label: 'reinforced bulkhead',
    effect: 'heavy berth transfer weakened',
    debt: 60,
    lastServicedAt: mid.state.now
  });
  assert(structuralPieceVisualState(mid.state, midPiece) === 'damaged', 'Real severe maintenance debt must select damaged art.');
  mid.state.maintenanceDebts = mid.state.maintenanceDebts.filter((debt) => debt.key !== `structural-piece:${midPiece.id}`);
  const completeParsed = parseAndMigrateSave(serializeSave('structural-complete', mid.state, 'structural-piece-tests'));
  assert(completeParsed.ok, 'Completed structural save should parse.');
  const completed = hydrateStateFromSave(completeParsed.save);
  assert(completed.state.structuralPieces.find((piece) => piece.id === midPiece.id)?.completed, 'Completed piece must survive hydration.');
  const legacyRaw = JSON.parse(serializeSave('legacy-structural', state, 'structural-piece-tests')) as { snapshot: Record<string, unknown> };
  delete legacyRaw.snapshot.structuralPieces;
  legacyRaw.snapshot.constructionSites = [];
  const legacyParsed = parseAndMigrateSave(JSON.stringify(legacyRaw));
  assert(legacyParsed.ok, 'Legacy payload without structuralPieces should parse.');
  assert(hydrateStateFromSave(legacyParsed.save).state.structuralPieces.length === 0, 'Legacy save must default structural pieces to empty.');
}

// North expansion remaps both pending and completed footprints without changing ids.
{
  const state = createInitialState({ seed: 88205 });
  state.metrics.credits = 100000;
  const first = exteriorWallWithSpace(state, 2);
  const pending = planStructuralPieceConstruction(state, bulkheadOrigin(state, first), 'reinforced-bulkhead', first.dx === 0 ? 90 : 0);
  assert(pending.ok && pending.pieceId !== undefined, 'Pending remap piece should plan.');
  const complete = planStructuralPieceConstruction(state, freeJunctionTarget(state), 'junction');
  assert(complete.ok && complete.pieceId !== undefined, 'Completed remap Junction should plan.');
  completePiece(state, complete.pieceId);
  const before = new Map(state.structuralPieces.map((piece) => [piece.id, { origin: piece.originTile, tiles: [...piece.tiles], completed: piece.completed }]));
  const oldWidth = state.width;
  const oldHeight = state.height;
  const expanded = expandMap(state, 'north');
  assert(expanded.ok, 'North expansion should succeed.');
  const shift = (state.height - oldHeight) * oldWidth;
  for (const piece of state.structuralPieces) {
    const prior = before.get(piece.id)!;
    assert(piece.originTile === prior.origin + shift, 'North expansion must remap structural origin by the added rows.');
    assert(piece.tiles.every((tile, index) => tile === prior.tiles[index]! + shift), 'North expansion must remap every occupied tile.');
    assert(piece.completed === prior.completed, 'Map remap must preserve pending/completed state.');
  }
}

// A real commissioned expansion retains non-root provenance. Production-
// placed Berth hardware therefore needs a completed Junction for medium load;
// a pending Junction changes planning truth but never live eligibility.
{
  const state = createInitialState({ seed: 88206 });
  state.metrics.credits = 10000;
  const berth = buildExpansionBerth(state, 2);
  const loads = deriveStructuralInterfaceLoads(state);
  const medium = loads.find((load) => load.kind === 'medium');
  assert(medium, 'Two production-placed clamps on commissioned frontage must author medium load.');
  assert(
    validateLiveStructuralInterfaces(state).problems.some((problem) =>
      problem.tile === medium.tile && problem.reason === 'medium-load-requires-junction'
    ),
    'Commissioned expansion Berth must not inherit grandfathered medium-load support.'
  );
  assert(pickBerthForShip(state, 'tourist', 'medium') === null, 'Unsupported commissioned medium Berth must be ineligible for arrival.');
  const clamp = fromIndex(berth.clampTiles[0]!, state.width);
  const junctionTile = toIndex(
    clamp.x + berth.frontageOutward[0],
    clamp.y + berth.frontageOutward[1],
    state.width
  );
  const planned = planStructuralPieceConstruction(state, junctionTile, 'junction');
  assert(planned.ok && planned.pieceId !== undefined, `Frontage Junction should plan (${planned.reason ?? 'unknown'}).`);
  assert(!validateLiveStructuralInterfaces(state).ok, 'Pending Junction must not enable the commissioned medium Berth.');
  completePiece(state, planned.pieceId);
  assert(validateLiveStructuralInterfaces(state).ok, 'Completed Junction must enable the commissioned medium Berth load.');
  assert(pickBerthForShip(state, 'tourist', 'medium') !== null, 'Completed Junction must make the commissioned medium Berth eligible.');
  assert(
    !validateStructuralSupportPlan(state, [], [{ tile: berth.project.doorTile!, kind: 'medium' }]).problems
      .some((problem) => problem.reason === 'medium-load-requires-junction'),
    'The legacy tie-in root must remain grandfathered rather than being reclassified with the expansion.'
  );
}

// A large production Berth on a separately commissioned wing needs its own
// hull-adjacent completed Bulkhead. Reinforcement cannot be borrowed by
// traversing grandfathered hull to an unrelated transfer elsewhere.
{
  const state = createInitialState({ seed: 882061 });
  state.metrics.credits = 10000;
  const unrelatedFace = exteriorWallWithSpace(state, 2);
  const unrelated = planStructuralPieceConstruction(
    state,
    bulkheadOrigin(state, unrelatedFace),
    'reinforced-bulkhead',
    unrelatedFace.dx === 0 ? 90 : 0
  );
  assert(unrelated.ok && unrelated.pieceId !== undefined, 'Legacy-hull Bulkhead fixture should plan.');
  completePiece(state, unrelated.pieceId);
  const berth = buildExpansionBerth(state, 5);
  const heavy = deriveStructuralInterfaceLoads(state).find((load) => load.kind === 'heavy');
  assert(heavy, 'Five production-placed clamps on a 42+ tile commissioned Berth must author heavy load.');
  assert(
    validateLiveStructuralInterfaces(state).problems.some((problem) =>
      problem.tile === heavy.tile && problem.reason === 'heavy-load-requires-reinforced-transfer'
    ),
    'An unrelated Bulkhead reached only through legacy root must not enable the expanded large Berth.'
  );
  assert(pickBerthForShip(state, 'tourist', 'large') === null, 'Unsupported commissioned large Berth must be ineligible for arrival.');
  const wall = fromIndex(berth.bulkheadWall, state.width);
  const outside = toIndex(wall.x + berth.bulkheadOutward[0], wall.y + berth.bulkheadOutward[1], state.width);
  const origin = berth.bulkheadOutward[0] < 0 || berth.bulkheadOutward[1] < 0 ? outside : berth.bulkheadWall;
  const planned = planStructuralPieceConstruction(
    state,
    origin,
    'reinforced-bulkhead',
    berth.bulkheadOutward[0] === 0 ? 90 : 0
  );
  assert(planned.ok && planned.pieceId !== undefined, `Expansion Bulkhead should plan (${planned.reason ?? 'unknown'}).`);
  assert(!validateLiveStructuralInterfaces(state).ok, 'Pending Bulkhead must not enable the commissioned large Berth.');
  completePiece(state, planned.pieceId);
  assert(validateLiveStructuralInterfaces(state).ok, 'Completed hull-adjacent Bulkhead must enable the commissioned large Berth load.');
  assert(pickBerthForShip(state, 'tourist', 'large') !== null, 'Completed Bulkhead must make the commissioned large Berth eligible.');
}

// A real exterior construction produces delivery work and requires EVA; the
// same site progresses through the normal tick loop rather than graph mutation.
{
  const state = createInitialState({ seed: 88207, physicalStarterInventory: true });
  tick(state, 0);
  state.metrics.credits = 500;
  const airlock = state.tiles.findIndex((tile) => tile === TileType.Airlock);
  assert(airlock >= 0, 'EVA fixture needs an Airlock.');
  const target = state.tiles.findIndex((tile, index) =>
    tile === TileType.Truss && findSpacePath(state, airlock, index) !== null &&
    state.crewMembers.every((crew) => crew.tileIndex !== index)
  );
  assert(target >= 0, 'EVA fixture needs a reachable Truss tile.');
  const planned = planStructuralPieceConstruction(state, target, 'junction');
  assert(planned.ok && planned.pieceId !== undefined, `Reachable Junction should plan (${planned.reason ?? 'unknown'}).`);
  const site = siteFor(state, planned.pieceId);
  assert(site.requiresEva && site.deliveredMaterials === 0, 'Structural piece must begin as an undelivered EVA site.');
  state.controls.paused = false;
  for (let step = 0; step < 1200 && site.deliveredMaterials <= 0; step++) tick(state, 0.1);
  assert(site.deliveredMaterials > 0, `Normal logistics must physically deliver structural material (${site.state}/${site.blockedReason ?? 'none'}).`);
  assert(state.crewMembers.some((crew) => crew.evaSuit), 'A worker must suit up for exterior structural work.');
}

console.log('structural-piece-tests: PASS');
