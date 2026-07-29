import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import {
  createInitialState,
  findPath,
  getApproachConflictGroups,
  getBerthFacilityAt,
  getDockingSlotDescriptors,
  mapConditionAt,
  tick
} from '../src/sim/sim';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import { ModuleType, RoomType, type ArrivingShip, type StationState } from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`phase0-scenario-guards: ${message}`);
}

function scenario(name: string, seed = 74_021): StationState {
  const state = createInitialState({
    seed,
    physicalStarterInventory: true,
    manualTrafficAdmission: true
  });
  assert(applyColdStartScenario(state, name), `${name} is not registered`);
  return state;
}

function berthFacilities(state: StationState) {
  const anchors = state.rooms
    .map((room, tileIndex) => room === RoomType.Berth ? tileIndex : -1)
    .filter((tileIndex) => tileIndex >= 0)
    .map((tileIndex) => getBerthFacilityAt(state, tileIndex))
    .filter((facility): facility is NonNullable<typeof facility> => facility !== null)
    .filter((facility, index, all) => all.findIndex((other) => other.anchorTile === facility.anchorTile) === index)
    .sort((left, right) => left.anchorTile - right.anchorTile);
  assert(anchors.length >= 2, `expected two Berths, got ${anchors.length}`);
  return anchors;
}

function gangwayOrigins(state: StationState, facility: ReturnType<typeof berthFacilities>[number]): number[] {
  const ids = new Set(facility.serviceModuleIds[ModuleType.Gangway] ?? []);
  return state.moduleInstances
    .filter((module) => module.type === ModuleType.Gangway && ids.has(module.id))
    .map((module) => module.originTile)
    .sort((left, right) => left - right);
}

function fingerprintShip(ship: ArrivingShip): string {
  return [
    ship.id,
    ship.stayClass,
    ship.size,
    ship.shipType,
    ship.portManifest?.offerKind ?? 'none',
    ship.assignedDockSourceKey ?? 'no-dock',
    ship.assignedBerthAnchor ?? 'no-berth'
  ].join(':');
}

function wingExposure(state: StationState): { sites: number; signature: string; meanRisk: number } {
  const sites = state.constructionSites
    .filter((site) => site.structuralProjectId !== undefined)
    .sort((left, right) => left.tileIndex - right.tileIndex);
  assert(sites.length > 0, 'debris wing has no production structural construction sites');
  const risks = sites.map((site) => mapConditionAt(state, 'debris-risk', site.tileIndex));
  return {
    sites: sites.length,
    signature: sites.map((site) =>
      `${site.kind}:${site.targetTile ?? site.targetModule ?? 'piece'}:${site.structuralStage ?? 'none'}:`
      + `${site.requiresEva ? 'eva' : 'interior'}:${site.requiredMaterials}:${site.buildWorkRequired}`
    ).sort().join('|'),
    meanRisk: risks.reduce((sum, risk) => sum + risk, 0) / risks.length
  };
}

function testPodDockFingerIsPhysicalAndRepeatable(): string {
  const base = createInitialState({ seed: 74_021, physicalStarterInventory: true, manualTrafficAdmission: true });
  tick(base, 0);
  const basePodDocks = base.docks.filter((dock) => dock.sourceKind === 'pod-dock-module').length;
  const state = scenario('pod-dock-finger');
  const podDocks = state.docks
    .filter((dock) => dock.sourceKind === 'pod-dock-module')
    .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));

  assert(basePodDocks === 2, `starter baseline changed: expected two Pod Docks, got ${basePodDocks}`);
  assert(podDocks.length === 6, `finger must create four physical Pod Docks (2 -> 6), got ${podDocks.length}`);
  assert(new Set(podDocks.map((dock) => dock.moduleId)).size === 6, 'Pod Dock interfaces must retain six distinct module identities');
  // The finger deliberately puts two Docks on each side of one narrow spine,
  // so its four added collars share two physical throats rather than inventing
  // six isolated entrances. The original two starter collars remain separate.
  const accessUse = new Map<number, number>();
  for (const dock of podDocks) {
    assert(dock.accessTile !== undefined, `Pod Dock ${dock.sourceKey} is missing its interior access tile`);
    accessUse.set(dock.accessTile, (accessUse.get(dock.accessTile) ?? 0) + 1);
  }
  const accessMultiplicity = [...accessUse.values()].sort((left, right) => left - right).join(',');
  assert(accessMultiplicity === '1,1,2,2', `finger must retain two starter throats plus two shared spine throats, got ${accessMultiplicity}`);
  assert(podDocks.every((dock) => dock.accessTile !== undefined && dock.approachTiles.length > 0),
    'every Pod Dock must own both an interior access tile and a physical approach lane');

  const crew = state.crewMembers[0];
  assert(crew, 'finger fixture has no crew member to verify access paths');
  for (const dock of podDocks) {
    const path = findPath(state, crew.tileIndex, dock.accessTile!, {
      allowRestricted: true,
      intent: 'crew',
      routeSeed: crew.id
    });
    assert(path !== null, `Pod Dock ${dock.sourceKey} access tile is not physically reachable from the starter`);
  }
  const descriptors = getDockingSlotDescriptors(state).filter((descriptor) => descriptor.kind === 'pod-dock');
  assert(descriptors.length === 6, `physical frontage descriptor count diverged from docks (${descriptors.length}/6)`);
  assert(descriptors.every((descriptor) => descriptor.accessTiles.length === 1 && descriptor.envelopesBySize.small.ingress.clearance > 0),
    'each Pod Dock descriptor must expose one access throat and a nonzero small-craft ingress envelope');
  const conflictGroups = getApproachConflictGroups(state)
    .filter((group) => group.slotIds.filter((id) => id.startsWith('dock:')).length >= 2);
  assert(conflictGroups.length >= 3, `finger must expose its serialized approach tradeoff, got ${conflictGroups.length} shared dock groups`);

  const repeated = scenario('pod-dock-finger');
  const fingerprint = podDocks.map((dock) => `${dock.sourceKey}:${dock.accessTile}:${dock.facing}:${dock.approachTiles.join(',')}`).join('|');
  const repeatedFingerprint = repeated.docks
    .filter((dock) => dock.sourceKind === 'pod-dock-module')
    .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey))
    .map((dock) => `${dock.sourceKey}:${dock.accessTile}:${dock.facing}:${dock.approachTiles.join(',')}`).join('|');
  assert(fingerprint === repeatedFingerprint, 'same seed produced a different physical Pod-finger interface layout');
  return `Pod finger 2->${podDocks.length} docks, ${conflictGroups.length} shared approach groups`;
}

function testTwoGangwayBerthIsUsableAndRepeatable(): string {
  const state = scenario('berth-two-gangways');
  const facilities = berthFacilities(state);
  const counts = facilities.map((facility) => ({ facility, origins: gangwayOrigins(state, facility) }));
  const twin = counts.find((entry) => entry.origins.length === 2);
  const single = counts.find((entry) => entry.origins.length === 1);
  assert(twin && single, `expected one twin and one single Gangway Berth, got ${counts.map((entry) => entry.origins.length).join(', ')}`);
  assert(twin.facility.geometryValid && twin.facility.accessReady, 'two-Gangway Berth is not a usable production facility');
  assert(single.facility.geometryValid && single.facility.accessReady, 'comparison Berth is not a usable production facility');
  assert(new Set(twin.origins).size === 2, 'two-Gangway Berth reused one module position twice');

  const crew = state.crewMembers[0];
  assert(crew, 'two-Gangway fixture has no crew member to verify gangway access');
  for (const origin of twin.origins) {
    assert(findPath(state, crew.tileIndex, origin, { allowRestricted: true, intent: 'crew', routeSeed: crew.id }) !== null,
      `Gangway at ${origin} has no physical station-side access path`);
  }
  const passengerCalls = state.arrivingShips
    .filter((ship) => ship.size === 'medium' && ship.portManifest?.offerKind === 'passenger')
    .sort((left, right) => left.id - right.id);
  assert(passengerCalls.length === 2 && passengerCalls.every((ship) => ship.passengersTotal === 10),
    `fixture must stage two identical medium 10-passenger calls, got ${passengerCalls.map((ship) => `${ship.size}/${ship.passengersTotal}`).join(', ')}`);
  assert(new Set(passengerCalls.map((ship) => ship.assignedBerthAnchor)).size === 2,
    'the two comparison manifests must bind to distinct physical Berths');

  const repeated = scenario('berth-two-gangways');
  const repeatCounts = berthFacilities(repeated).map((facility) => gangwayOrigins(repeated, facility).length).sort((a, b) => a - b);
  assert(JSON.stringify(repeatCounts) === JSON.stringify([1, 2]), `same seed changed Gangway arrangement (${repeatCounts.join(',')})`);
  return `Medium Berths have ${single.origins.length} versus ${twin.origins.length} reachable Gangways`;
}

function testMixedTenureDurabilityAndDerivation(): string {
  const state = scenario('mixed-tenure-day');
  const ships = state.arrivingShips.slice().sort((left, right) => left.id - right.id);
  const byClass = new Map(ships.map((ship) => [ship.stayClass, ship]));
  for (const stayClass of ['errand', 'shore', 'contract'] as const) {
    assert(byClass.has(stayClass), `mixed-tenure fixture is missing a production-derived ${stayClass} ship`);
  }
  const errand = byClass.get('errand')!;
  const shore = byClass.get('shore')!;
  const contract = byClass.get('contract')!;
  assert(errand.size === 'small' && errand.assignedDockSourceKey !== null && errand.assignedBerthAnchor === null,
    'errand must retain its physical small-craft Pod assignment');
  assert(shore.size === 'medium' && shore.assignedBerthAnchor !== null,
    'shore visit must retain a physical medium Berth assignment');
  assert(contract.size === 'medium' && contract.assignedBerthAnchor !== null && contract.portContractId !== undefined,
    'contract crew must retain an accepted Berth contract identity');
  assert(new Set([errand.id, shore.id, contract.id]).size === 3, 'mixed tenures reused ship identity');
  assert(errand.smallCraftVisit?.targetDurationSec && errand.smallCraftVisit.targetDurationSec > 0,
    'errand must retain a durable small-craft visit-duration contract');
  const shoreContract = state.portOps.contracts.find((entry) => entry.shipId === shore.id);
  const workContract = state.portOps.contracts.find((entry) => entry.shipId === contract.id);
  assert(shoreContract?.stayClass === 'shore' && workContract?.stayClass === 'contract',
    'Berth contracts must retain their derived tenure identities');
  assert(
    (shoreContract?.plannedDepartureAt ?? 0) > 0 &&
    (workContract?.plannedDepartureAt ?? 0) > (shoreContract?.plannedDepartureAt ?? Number.POSITIVE_INFINITY),
    'shore and contract calls must retain distinct durable Berth schedule windows'
  );

  const before = ships.map(fingerprintShip).join('|');
  const parsed = parseAndMigrateSave(serializeSave('phase0-tenures', state, 'phase0-guards'));
  assert(parsed.ok, `mixed-tenure save did not parse: ${parsed.ok ? '' : parsed.error}`);
  const hydrated = hydrateStateFromSave(parsed.save).state;
  const after = hydrated.arrivingShips.slice().sort((left, right) => left.id - right.id).map(fingerprintShip).join('|');
  assert(before === after, `save/load changed mixed-tenure identities\nbefore=${before}\nafter=${after}`);

  const repeated = scenario('mixed-tenure-day');
  assert(before === repeated.arrivingShips.slice().sort((left, right) => left.id - right.id).map(fingerprintShip).join('|'),
    'same seed changed the production-derived mixed-tenure set');
  return `Durable errand Pod, shore Berth, and contract Berth identities: ${before}`;
}

function testDebrisWingPairProducesSaferMeasuredFrontage(): string {
  const exposed = scenario('debris-wing-exposed');
  const sheltered = scenario('debris-wing-sheltered');
  assert(JSON.stringify(exposed.site) === JSON.stringify(sheltered.site), 'debris comparison must retain one charter/site profile');
  const exposedWing = wingExposure(exposed);
  const shelteredWing = wingExposure(sheltered);
  assert(exposedWing.sites === shelteredWing.sites, `paired wings changed construction scope (${exposedWing.sites}/${shelteredWing.sites})`);
  assert(exposedWing.signature === shelteredWing.signature,
    'paired wings changed their construction geometry/work contract rather than only their frontage face');
  assert(exposedWing.meanRisk > shelteredWing.meanRisk + 0.12,
    `sheltered wing was not materially safer in production debris diagnostics (${exposedWing.meanRisk.toFixed(3)} vs ${shelteredWing.meanRisk.toFixed(3)})`);
  assert(exposed.exteriorIntegrityTargets.length > 0 && sheltered.exteriorIntegrityTargets.length > 0,
    'paired wings must reconcile exterior integrity targets for the diagnosed risk');

  const repeat = scenario('debris-wing-exposed');
  const repeatExposure = wingExposure(repeat);
  assert(repeatExposure.signature === exposedWing.signature && repeatExposure.meanRisk === exposedWing.meanRisk,
    'same seed changed exposed-wing construction or debris diagnosis');
  return `Same charter wing risk exposed ${exposedWing.meanRisk.toFixed(3)} > sheltered ${shelteredWing.meanRisk.toFixed(3)}`;
}

const cases: Array<{ name: string; run: () => string }> = [
  { name: 'physical Pod Dock finger', run: testPodDockFingerIsPhysicalAndRepeatable },
  { name: 'usable two-Gangway Berth', run: testTwoGangwayBerthIsUsableAndRepeatable },
  { name: 'mixed tenure durable identities', run: testMixedTenureDurabilityAndDerivation },
  { name: 'paired debris shelter outcome', run: testDebrisWingPairProducesSaferMeasuredFrontage }
];

for (const entry of cases) console.log(`PASS ${entry.name}: ${entry.run()}`);
console.log(`phase0 scenario guards: ${cases.length}/${cases.length} passed`);
