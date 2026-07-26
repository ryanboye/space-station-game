/**
 * Focused checks for the Gate 0 "truth before breadth" packages.
 *
 * Deliberately narrow and fast: each case pins one invariant from
 * docs/37-station-portfolio-program/00-shared-contracts.md so the opening
 * packages can iterate without running the full simulation suite.
 */

import { createInitialState } from '../src/sim';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import type { StationState } from '../src/sim/types';

const GAME_VERSION = 'truth-checks';

let failures = 0;
let checks = 0;

function check(name: string, fn: () => void): void {
  checks += 1;
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message} (expected ${String(expected)}, got ${String(actual)})`);
}

function roundTrip(state: StationState): StationState {
  const parsed = parseAndMigrateSave(serializeSave('round-trip', state, GAME_VERSION));
  assert(parsed.ok, `save did not parse: ${parsed.ok ? '' : parsed.error}`);
  return hydrateStateFromSave(parsed.save).state;
}

function freshState(): StationState {
  return createInitialState({ physicalStarterInventory: true, manualTrafficAdmission: true });
}

// --- TRUTH-01: fresh game isolation ----------------------------------------

console.log('TRUTH-01 fresh game isolation');

check('a fresh station starts at tier 0 with no unlocks', () => {
  const state = freshState();
  assertEqual(state.unlocks.tier, 0, 'starter unlock tier');
  assertEqual(state.unlocks.unlockedIds.length, 0, 'starter unlocked id count');
});

check('saving and reloading a fresh station does not inflate its tier', () => {
  // Regression for docs/tickets/2026-07-25-opening-playtest/00-*: the
  // authored starter contains catalog entries above tier 0, and the
  // content-derived elevation rule promoted every reload to tier 2.
  const restored = roundTrip(freshState());
  assertEqual(restored.unlocks.tier, 0, 'reloaded starter unlock tier');
  assertEqual(restored.unlocks.unlockedIds.length, 0, 'reloaded starter unlocked id count');
});

check('reloading a fresh station preserves its opening progression counters', () => {
  const restored = roundTrip(freshState());
  assertEqual(restored.metrics.creditsEarnedLifetime, 0, 'lifetime credits earned');
  assertEqual(restored.metrics.archetypesServedLifetime, 0, 'lifetime archetypes served');
  assertEqual(restored.metrics.turnaroundsCompletedLifetime, 0, 'lifetime turnarounds');
  assertEqual(restored.metrics.mealsServedTotal, 0, 'lifetime meals served');
});

check('an advanced run round-trips its own tier and metrics intact', () => {
  const advanced = freshState();
  advanced.unlocks.tier = 3;
  advanced.unlocks.unlockedIds = ['tier1_sustenance', 'tier2_commerce', 'tier3_logistics'];
  advanced.metrics.creditsEarnedLifetime = 812;
  advanced.metrics.archetypesServedLifetime = 4;
  advanced.metrics.turnaroundsCompletedLifetime = 5;
  const restored = roundTrip(advanced);
  assertEqual(restored.unlocks.tier, 3, 'restored tier');
  assertEqual(restored.metrics.creditsEarnedLifetime, 812, 'restored lifetime credits');
  assertEqual(restored.metrics.turnaroundsCompletedLifetime, 5, 'restored lifetime turnarounds');
});

check('a new station built after an advanced run shares no progression with it', () => {
  const advanced = freshState();
  advanced.unlocks.tier = 3;
  advanced.metrics.creditsEarnedLifetime = 812;
  advanced.metrics.mealsServedTotal = 44;
  roundTrip(advanced);

  const newGame = roundTrip(freshState());
  assertEqual(newGame.unlocks.tier, 0, 'new game tier');
  assertEqual(newGame.metrics.creditsEarnedLifetime, 0, 'new game lifetime credits');
  assertEqual(newGame.metrics.mealsServedTotal, 0, 'new game meals served');
});

console.log('');
console.log(`${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
