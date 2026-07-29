# Structural Frontage Cap Audit

Status: current-code inventory, 2026-07-28. This audit changes no balance value.

The purpose of these limits is to identify where a severe layout can stop
looking worse because a score, spill chain, or penalty has saturated. Values
below are the authoritative constants and clamps in the current simulation.

## Queue spill and balking

- Cafeteria, Cantina, and enhanced Market providers build ordered physical
  queue chains with at most 24 tiles and at most 6 tiles outside the provider's
  room (`QUEUE_CHAIN_MAX_LEN`, `QUEUE_CHAIN_MAX_SPILL` in `src/sim/sim.ts`).
  The chain stops earlier when no distinct walkable, module-free tile remains.
- A visitor blocked from an ordinary service may balk after 16 seconds
  (`QUEUE_BALK_WAIT_SEC`). An unstaffed enhanced-market checkout abandons after
  14 seconds (`MARKET_UNSTAFFED_BALK_SEC`). A ship's dock queue timeout is 18
  seconds (`TASK_TIMINGS.dockQueueMaxSec` in `src/sim/balance.ts`).
- These are behavior bounds, not hidden capacity. Every admitted queue member
  owns a floor reservation; a full chain leaves later arrivals blocked or
  balking rather than placing them in an invisible line.

## Occupancy and congestion costs

- `MAX_OCCUPANTS_PER_TILE = 4` is a diagnosis/rest-target risk threshold, not a
  hard movement capacity. Ordinary movement is resolved by the batched
  coordinator; Doors and Airlocks are serialized crossing resources.
- A* occupancy cost in `src/sim/path.ts` saturates by intent: Security adds
  `min(1, occupants × 0.15)`, Crew/Logistics adds
  `min(16, occupants × 8)`, and Visitor/Resident adds
  `min(10, occupants × 5)` per tile. Beyond those points, additional bodies do
  not make that route less attractive to the pathfinder.
- Provider selection adds uncapped local demand/reservation/occupancy terms,
  while pathfinding itself uses the capped costs above. The movement
  coordinator remains the physical arbiter after a route is chosen.

## Route discomfort and walking saturation

- Walk dissatisfaction starts after 30 route tiles and grows by 0.006 rating
  units per extra tile, capped at 0.10 per completed trip
  (`VISITOR_COMFORT_WALK_THRESHOLD`, `VISITOR_WALK_PENALTY_RATE`, and
  `VISITOR_WALK_PENALTY_MAX_PER_TRIP`). The cap is reached after roughly 47
  total tiles, so a much longer trip does not become worse in this component.
- Route-exposure dissatisfaction multiplies the exposure score by 0.012 and
  caps at 0.28 per completed route. Environment discomfort multiplies by
  0.018 and caps at 0.24. Route exposure still adds visitor patience pressure
  when discomfort is at least 5, so the rating cap does not erase all behavior.
- Resident route exposure is capped separately at 3.2 stress per completed
  route; resident stress itself is clamped to 0-120 and satisfaction/safety to
  0-100.

## Rating-penalty saturation

- Per-completed-route visitor caps are 0.10 for walk distance, 0.28 for route
  exposure, 0.24 for environment discomfort, and 0.18 for sanitation. These
  caps can make two very bad routes look equally bad in the rating delta even
  while their physical wait or need failure still differs.
- Failed-stay milestone penalties are event-bounded rather than tick-bounded:
  0.22 when distressed and 0.50 when disruptive, each exactly once per
  episode. The durable cause and incident ladder remain visible after the
  rating event stops accumulating.
- `usageTotals.ratingDelta` and the reason-specific ledgers retain cumulative
  signed history. The displayed station rating clamps the tier foundation plus
  that delta to 0-100, so additional failure below zero is hidden by the headline
  score but remains inspectable in its causal breakdown.

## Evidence and change rule

`npm run test:saturation-caps` is now the dedicated runner, and it drives eight
caps through below / at / above their saturation point: queue chain length and
spill, ordinary balk timing, market-unstaffed balk, dock-queue timeout, A*
occupancy saturation per intent, walk and route penalties, resident stress, the
failed-stay incident cooldown, and the rating display clamp with its causal
ledger retained underneath. No cap in that list should be raised or removed
without re-running it.

### The two caps that cannot be demonstrated, and why

The runner prints a GAP line for the environment and sanitation visitor
rating-penalty caps. That is not a test gap — **both are dead ceilings that no
buildable scenario can reach**, because a tighter clamp upstream always binds
first:

- **Environment `0.24`.** The term is `min(0.24, environmentDiscomfort * 0.018)`,
  and `visitorEnvironmentDiscomfort` clamps to `0..8`. The real maximum is
  `8 * 0.018 = 0.144`, so the `0.24` literal is unreachable by `0.096`.
- **Sanitation `0.18`.** The term is `min(0.18, (dirt - 32) * 0.0014)`, which
  would need `dirt >= 160.6`. Every production write clamps dirt to `0..100` —
  `addDirt`, the save serializer, hydration, and fixture seeding, which caps at
  96. The real maximum is `(100 - 32) * 0.0014 = 0.0952`, so the `0.18` literal
  is unreachable by nearly half.

The correct action is therefore **not** to write a scenario that cannot exist. It
is to replace each literal with its true ceiling — `0.144` and `0.0952` — or drop
the redundant `Math.min` entirely, after which the existing runner can drive both
to saturation like the other eight. Until that happens these two numbers are
decorative: they read as tuning levers in the source while having no effect on
any reachable state, which is exactly the kind of invisible modifier this
document exists to catch.
