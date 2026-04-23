// Named cold-start scenario fixtures. Applied via the `?scenario=<name>`
// URL param in main.ts. Each fixture takes a fresh `createInitialState()`
// result and thin-spec-overrides only the fields needed to land at the
// target test state — it does NOT rebuild station geometry, rooms,
// modules, or crew rosters. The rest of the world remains whatever the
// default starter produces.
//
// Deliberately thin so schema drift doesn't rot the fixtures: if
// `StationState` gains a field, default-starter populates it and the
// fixture stays silent. Only tier-relevant counters + unlock bookkeeping
// are set per scenario.
//
// Whitelist-only: the `?scenario=<name>` loader looks up by name in
// `COLD_START_SCENARIOS` and applies nothing if not found. No freeform
// paths or JSON blobs land through this door.

import { UNLOCK_DEFINITIONS } from './content/unlocks';
import type { StationState, UnlockId, UnlockTier } from './types';

type Scenario = (state: StationState) => void;

function unlockThrough(state: StationState, targetTier: UnlockTier): void {
  const ids: UnlockId[] = [];
  for (const def of UNLOCK_DEFINITIONS) {
    if (def.tier <= targetTier) ids.push(def.id);
  }
  state.unlocks.tier = targetTier;
  state.unlocks.unlockedIds = ids;
  state.unlocks.unlockedAtSec = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const id of ids) {
    state.unlocks.triggerProgress[
      UNLOCK_DEFINITIONS.find((d) => d.id === id)!.tier
    ] = 1;
  }
}

export const COLD_START_SCENARIOS: Record<string, Scenario> = {
  // Default starter state — no-op. Keeps the registry pattern symmetric
  // so `?scenario=starter` is a valid URL (and differentiates from a
  // mistyped name which falls through to warning).
  starter: () => {},

  // Tier 1 already fired: first visitor archetype seen, T1 unlocked.
  // Useful for sprite/UX iteration that starts "after the first-visitor
  // flash" without waiting for the spawn cycle.
  't1-ready': (s) => {
    unlockThrough(s, 1);
    s.usageTotals.archetypesEverSeen.diner = true;
    s.metrics.archetypesServedLifetime = 1;
  },

  // Mid-game: Tier 4 unlocked, Tier 5 on-deck with counters poised.
  // Has the variety of archetypes + credits + incidents a playtester
  // would see after ~30 min of real play. Good target for dense-room
  // sprite review.
  't5-ready': (s) => {
    unlockThrough(s, 4);
    s.usageTotals.archetypesEverSeen = {
      diner: true,
      shopper: true,
      lounger: true,
      rusher: true
    };
    s.metrics.archetypesServedLifetime = 4;
    s.metrics.creditsEarnedLifetime = 5000;
    s.metrics.tradeCyclesCompletedLifetime = 5;
    s.metrics.incidentsResolvedLifetime = 3;
    s.metrics.credits = 1000;
    s.metrics.materials = 200;
  },

  // End-state: every tier unlocked, trophy condition satisfied. For
  // reviewing T6+ UX copy, achievement-panel polish, post-game states.
  't6-trophy': (s) => {
    unlockThrough(s, 6);
    s.usageTotals.archetypesEverSeen = {
      diner: true,
      shopper: true,
      lounger: true,
      rusher: true
    };
    s.metrics.archetypesServedLifetime = 4;
    s.metrics.creditsEarnedLifetime = 25000;
    s.metrics.tradeCyclesCompletedLifetime = 20;
    s.metrics.incidentsResolvedLifetime = 10;
    s.metrics.actorsTreatedLifetime = 5;
    s.metrics.residentsConvertedLifetime = 3;
    s.metrics.credits = 5000;
    s.metrics.materials = 500;
  }
};

/** Apply a named scenario to a fresh state. Returns true if the name
 *  matched a whitelisted fixture, false otherwise. Caller decides
 *  whether to warn on mismatch. */
export function applyColdStartScenario(
  state: StationState,
  name: string
): boolean {
  const scenario = COLD_START_SCENARIOS[name];
  if (!scenario) return false;
  scenario(state);
  return true;
}

export const COLD_START_SCENARIO_NAMES: readonly string[] = Object.freeze(
  Object.keys(COLD_START_SCENARIOS)
);
