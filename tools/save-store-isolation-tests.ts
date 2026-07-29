import {
  continueEligibleSaves,
  parseSaveStore,
  saveStorageKeys,
  saveStorageScopeFromSearchParams,
  trimSaveStore,
  type LocalSaveRecord,
  type SaveStore
} from '../src/save-store';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`save-store-isolation: ${message}`);
}

function record(id: string, updatedAt: number, payloadText = id): LocalSaveRecord {
  const stamp = new Date(updatedAt).toISOString();
  return { id, name: id, createdAt: stamp, updatedAt: stamp, payloadText };
}

function write(memory: Map<string, string>, key: string, store: SaveStore): void {
  memory.set(key, JSON.stringify(store));
}

function read(memory: Map<string, string>, key: string): SaveStore {
  const parsed = parseSaveStore(memory.get(key) ?? null);
  assert(!parsed.invalid, `${key} should remain a valid save store`);
  return parsed.store;
}

function testSessionClassification(): void {
  assert(saveStorageScopeFromSearchParams(new URLSearchParams()) === 'player', 'plain game URL should use player saves');
  for (const query of ['scenario=market-improved-flow', 'load=encoded', 'loadId=harness-test-save']) {
    assert(
      saveStorageScopeFromSearchParams(new URLSearchParams(query)) === 'qa',
      `${query} should use deterministic QA saves`
    );
  }
  console.log('ok 1 deterministic URLs select the QA persistence domain');
}

function testQuicksaveAndQuotaIsolation(): void {
  const playerKeys = saveStorageKeys('player');
  const qaKeys = saveStorageKeys('qa');
  assert(playerKeys.storeKey !== qaKeys.storeKey, 'player and QA save stores must use different keys');
  assert(playerKeys.autosaveKey !== qaKeys.autosaveKey, 'player and QA autosaves must use different keys');

  const memory = new Map<string, string>();
  const playerQuick = record(playerKeys.quicksaveId, 1_000, 'PLAYER-QUICKSAVE');
  const playerStore: SaveStore = { storeVersion: 1, saves: [playerQuick, record('manual-1', 900)] };
  write(memory, playerKeys.storeKey, playerStore);

  const qaPressure = [
    record(qaKeys.quicksaveId, 4_000, 'QA-QUICKSAVE'),
    ...Array.from({ length: 40 }, (_, index) => record(`qa-${index}`, 3_000 - index, 'x'.repeat(240)))
  ];
  const trimmedQa = trimSaveStore(qaPressure, qaKeys.quicksaveId, { maxSlots: 5, maxChars: 1_400 });
  write(memory, qaKeys.storeKey, { storeVersion: 1, saves: trimmedQa.saves });

  const playerAfterQaTrim = read(memory, playerKeys.storeKey);
  const quickAfterQaTrim = playerAfterQaTrim.saves.find((save) => save.id === playerKeys.quicksaveId);
  assert(quickAfterQaTrim?.payloadText === 'PLAYER-QUICKSAVE', 'QA quota trimming replaced or evicted player quicksave');
  assert(trimmedQa.removed > 0, 'test must exercise actual QA trim pressure');
  assert(
    read(memory, qaKeys.storeKey).saves.some((save) => save.payloadText === 'QA-QUICKSAVE'),
    'protected QA quicksave should remain available to deterministic tests'
  );
  console.log('ok 2 QA quicksave and quota trimming cannot touch player quicksave');
}

function testContinueIsolation(): void {
  const qaSaves = [record('quicksave', 3_000, 'QA'), record('qa-repro', 4_000, 'QA-REPRO')];
  assert(continueEligibleSaves('qa', qaSaves).length === 0, 'QA saves became Continue candidates');

  const playerSaves = [record('quicksave', 3_000, 'PLAYER'), record('manual', 4_000, 'MANUAL')];
  const candidates = continueEligibleSaves('player', playerSaves);
  assert(candidates.length === 2, 'ordinary player saves should remain eligible for Continue');
  assert(candidates[0].id === 'manual', 'player Continue candidates should preserve newest-first behavior');
  console.log('ok 3 QA saves cannot become Continue candidates');
}

function testAutosaveAndReloadIsolation(): void {
  const memory = new Map<string, string>();
  const playerKeys = saveStorageKeys('player');
  const qaKeys = saveStorageKeys('qa');
  memory.set(playerKeys.autosaveKey, 'PLAYER-AUTOSAVE');
  memory.set(qaKeys.autosaveKey, 'QA-AUTOSAVE');

  assert(memory.get(playerKeys.autosaveKey) === 'PLAYER-AUTOSAVE', 'QA autosave overwrote player autosave');
  assert(memory.get(qaKeys.autosaveKey) === 'QA-AUTOSAVE', 'QA autosave is unavailable for deterministic reload');
  assert(saveStorageScopeFromSearchParams(new URLSearchParams('scenario=market-improved-flow')) === 'qa', 'scenario reload lost QA scope');
  assert(saveStorageScopeFromSearchParams(new URLSearchParams()) === 'player', 'plain reload did not return to player scope');
  console.log('ok 4 autosave and reload remain isolated by session scope');
}

function testLegacyStoreMigration(): void {
  const legacy: SaveStore = { storeVersion: 1, saves: [record('legacy-manual', 100, 'LEGACY')] };
  const parsed = parseSaveStore(JSON.stringify(legacy));
  assert(!parsed.invalid, 'existing v1 player store should remain readable');
  assert(parsed.store.saves[0]?.payloadText === 'LEGACY', 'existing save payload changed during store parsing');
  console.log('ok 5 existing v1 save stores remain readable');
}

testSessionClassification();
testQuicksaveAndQuotaIsolation();
testContinueIsolation();
testAutosaveAndReloadIsolation();
testLegacyStoreMigration();
console.log('save-store-isolation-tests: ok 5/5');
