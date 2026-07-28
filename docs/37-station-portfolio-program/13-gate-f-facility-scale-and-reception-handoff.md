# Gate F Handoff: Facility Scale And Demand Discovery

## Starting Point

Complete the Gate E save/resume durability work first. Then continue in the same
worktree and return this tranche as a **second, independently cherry-pickable
commit**. Do not merge either commit.

Read, in order:

1. `00-shared-contracts.md`;
2. `02-hospitality-and-tourism.md`;
3. `03-trade-and-logistics.md`;
4. `../../38-structural-frontage-visit-flow-implementation-plan.md`;
5. `../../39-structural-frontage-execution-checklist.md`, especially Phase 1B.

## Player-Facing Goal

Building a business must feel like arranging and operating a small physical
machine, not satisfying a room checklist. The player should make consequential
layout choices about customer flow, staff access, stock delivery, service
capacity, seating, and space. A compact design should be cheap but prone to
queues and awkward replenishment. A larger design should serve more people but
consume valuable interior area, utilities, stock, and labor.

The first completed slice must make these two businesses genuinely playable:

- a market with shelves, finite checkout throughput, backroom stock, staff
  restocking, and visible goods movement;
- a cantina with a connected service bar, guest positions, seating choices,
  finite drink stock, staff work positions, and visible service dwell.

Reception is optional infrastructure that improves demand discovery and
routing. It must not become an arrival gate or reveal every visitor's itinerary.

## Product Decisions Already Made

- Do not add prefab construction or one-click room completion.
- Do not make room recipes binary success checklists. Fixtures create capacity,
  throughput, comfort, stock, and routing consequences.
- Do not expose complete visitor itineraries at spawn.
- Do not make Reception mandatory.
- Do not create one item entity per unit of inventory. Inventory remains
  batched, but deliveries and replenishment use visible carried bundles.
- Every depicted guest, staff, seat, checkout, bed, and wash position must have
  a corresponding physical slot.
- Exclusive service slots remain exclusive. Ordinary walking still permits the
  existing bounded crowd behavior; do not introduce a universal one-actor-per-
  tile rule.
- Larger fixtures provide better absolute throughput, not free efficiency. They
  cost more, occupy more space, require longer delivery routes, consume more
  utilities/stock, and may require staff.
- Preserve current compact modules as valid low-capacity or compatibility
  alternatives.
- Preserve prepared-meal purchasing and current food service. This tranche may
  add a larger Serving Line but must not replace the meal economy.
- Avoid permanent wide panels. Facility state belongs in world chips and the
  selected room/module inspector.

## Scope A: Shared Physical Facility Slots

Complete the reusable slot contract for the facilities in this tranche:

- reserve an explicit public use position, staff work position, seat/bed
  position, or queue position;
- hold the slot for a visible, tuned session duration;
- release it on completion, cancellation, retarget, departure, death, room or
  module deletion, save hydration, and timeout recovery;
- prohibit two actors from simultaneously using the same exclusive fixture
  position;
- keep queue ownership and provider ownership distinct;
- prevent target oscillation when a valid reserved target is still reachable;
- expose the first blocked reason: no stock, no staff, no free provider, no
  free seat, delivery route blocked, public route blocked, or utility failure.

Use the existing facility descriptors and reservation machinery. Generalize it
only where actual duplication requires it.

## Scope B: Market As A Physical Machine

Finish the current Checkout Bank and Shelf Aisle path rather than inventing a
second market system.

Required operation:

1. Travel supplies arrive as a supplier lot at Receiving/Freight Locker.
2. Cargo staff carry visible supply bundles to a Backroom Stock Bank.
3. A clerk or steward carries visible restock bundles from backroom to Shelf
   Aisle bays using a staff-side route.
4. Visitors browse an in-stock shelf bay for a visible duration.
5. Visitors reserve and use one finite Checkout Bank position.
6. Exactly one stock unit is sold, one categorized economy event is emitted,
   and the visitor's need is satisfied exactly once.

Implement or complete:

- finite checkout positions and a visible checkout queue;
- three physical browse positions per Shelf Aisle where the art depicts three
  bays;
- Backroom Stock Bank, target footprint 2x3;
- stock transfer from receiving to backroom to shelf without duplication;
- a staff-side restock route that can conflict with a bad public layout;
- a second Checkout Bank producing a measurable throughput improvement;
- at least three broad shelf mixes such as essentials, gifts, and technical
  supplies, with different demand appeal and margin, selected locally at the
  shelf or market inspector;
- truthful visitor comments: no praise for selection when no suitable shelf is
  stocked;
- low-stock, empty, unstaffed, dirty, and damaged diagnosis where applicable.

Shelf mix is a strategic tradeoff, not a completion checklist. A market may
open with one category and miss other demand.

## Scope C: Cantina As A Physical Machine

Implement a connected modular bar that supports organic room shapes without
requiring dozens of individually placed chairs.

Required fixtures:

- Service Bar, target footprint 2x5, with one staff lane and four depicted guest
  service positions;
- Bar Corner and Bar End pieces, target footprint 2x2;
- Booth Bank, target footprint 2x4;
- Standing Rail, target footprint 1x4.

Required behavior:

- connected straight/corner/end bar pieces form one provider group;
- each depicted guest position is a physical exclusive service slot;
- staff work positions are behind the bar and never occupy guest positions;
- drink stock is finite and replenished by visible carried bundles;
- a steward serves drinks during a visible service session;
- a visitor then chooses a free Booth Bank, Standing Rail, or compatible legacy
  lounge/cantina position for a meaningful leisure dwell;
- visitors may buy a bounded repeat drink when satisfied and time permits;
- no stock, no steward, no service position, and no leisure position are
  distinguishable failure states;
- additional bar length increases service capacity only when it contributes
  valid connected guest/staff geometry;
- more seating increases dwell capacity without pretending to increase service
  throughput;
- dirt/noise/disorder accumulate from real use and remain visible through the
  existing sanitation and room feedback systems.

Do not return to the old behavior where each two-tile bar simply grants two
abstract cantina occupants.

## Scope D: Larger Shared Hospitality Fixtures

Implement these modules through the same descriptor/slot system:

- Serving Line, target 2x5, with multiple meal pickup positions and a staff-side
  replenishment route;
- Community Table, target 3x4, with exactly eight depicted reservable seats;
- Guest Cabin, target 3x4, with two quality visitor-policy beds;
- Arrival Desk, target 2x4, with two reception processors;
- Wash Bank, target 2x5, with multiple depicted exclusive hygiene positions.

Compact legacy Serving Stations, Tables, Beds, and hygiene fixtures remain
useful in constrained layouts. The larger forms trade capital and space for
capacity, staff efficiency, or comfort.

Every footprint must be inspected at actual play zoom before it is locked.

## Scope E: Progressive Demand Discovery And Reception

Visitors and ships should reveal demand in layers:

- ship approach cards show purpose, broad cohort-size/stay range, and two or
  three strong demand cues;
- spawned visitors begin with plausible needs and preferences, but no complete
  exposed itinerary;
- behavior and world thoughts reveal wants over time;
- an Arrival Desk processes a limited number of visitors, reveals some demand
  earlier, and improves their first routing choice;
- visitors may bypass a full or absent desk and choose a plausible facility;
- an incorrect first choice produces one readable redirect with the cause, not
  random wandering or permanent oscillation;
- Reception must improve measured routing time in a mixed-demand crowd while
  remaining optional.

Keep admission/Approach Control ship-focused. Do not add individual passenger
approval.

## Scope F: Art And World Feedback

Create or complete low-resolution, top-down sprites that remain readable at the
actual tile scale for every new fixture above. Use the repository's curated
sprite and atlas pipeline. Do not downscale highly detailed concept art and call
it finished.

Required visual states where applicable:

- idle;
- occupied/in service;
- unstaffed;
- low stock or empty;
- dirty;
- damaged;
- connected bar straight, corner, and end geometry.

The selected facility and nearby world chip must communicate:

- current users / physical capacity;
- queue length;
- stock state;
- staffing state;
- the first actionable blocker.

Do not add a permanent global inventory or demand spreadsheet.

## Scenarios And Deliberate Comparisons

Add deterministic scenarios or extend existing focused showcases for:

1. compact one-checkout market with a public/restock route conflict;
2. improved two-checkout market with separated restock access;
3. undersized bar with service capacity but insufficient dwell positions;
4. expanded connected bar with Booth Banks and a Standing Rail;
5. mixed-demand arrivals with no Reception;
6. the identical mixed-demand arrivals with a staffed Arrival Desk;
7. one long-stay cohort using Guest Cabins, food, drink, and Wash Bank more than
   once.

Each deliberately bad layout must remain physically legal and visibly fail.
Each improved layout must use a different player-authored spatial response and
show a measurable improvement.

## Likely Owned Files

This tranche may own:

- `src/sim/facility-descriptors.ts`;
- new focused facility/reception modules under `src/sim/`;
- narrowly scoped facility, visitor-demand, and service-session changes in
  `src/sim/sim.ts`;
- module/type/save fields required by these fixtures;
- module catalog/config entries;
- sprite keys, curated sprite sources, atlas metadata, and narrowly scoped
  renderer support for fixture states;
- deterministic scenario additions in `src/sim/cold-start-scenarios.ts`;
- focused runners under `tools/` and their `package.json` scripts.

Do not alter structural support, approach geometry, EVA construction, utility
underlay performance work, charter forecasts, global progression, or broad
layout CSS. If the lead has changed `sim.ts` or `cold-start-scenarios.ts` in
parallel, keep your edits conceptually localized and report the exact function
regions so conflicts can be resolved deliberately.

## Focused Evidence Required

Add focused runners that prove:

1. exclusive fixture claims and cleanup across every release path;
2. one market sale follows receiving -> backroom -> shelf -> browse -> checkout
   with exactly-once stock and credit mutations;
3. two checkouts outperform one under the same deterministic demand;
4. separated restocking removes the controlled public-route conflict;
5. connected bar geometry exposes the correct guest and staff slots through
   rotations, corners, and ends;
6. service throughput and dwell capacity are independently limiting;
7. no-stock and no-staff bar states do not satisfy demand;
8. every depicted Community Table seat, Guest Cabin bed, Arrival Desk processor,
   and Wash Bank position is exclusively reservable;
9. Reception improves first-choice routing without blocking bypass traffic;
10. a long-stay visitor repeats food, hygiene, sleep, and leisure through real
    physical sessions;
11. save/load clears transient claims and reconstructs valid durable fixture
    state without inventory duplication.

Do not run the full test suite. Run only the new focused runners, the existing
facility-slot and occupant-loop runners, and `npm run build`.

## Acceptance Criteria

1. The market and cantina each require at least three meaningful spatial
   decisions, and no single room/module placement completes either operation.
2. The player can diagnose whether capacity, stock, staff, seating/dwell,
   utilities, or route layout is the current bottleneck from the world and
   selected facility.
3. Larger fixtures visibly serve more occupants while consuming proportionally
   meaningful space and resources.
4. A bad legal layout performs worse than an improved layout for directly
   observable physical reasons.
5. Reception helps but is never mandatory.
6. Visitor service, inventory consumption, and economy results remain exactly
   once.
7. New sprites are legible at actual play zoom and aligned with their module
   footprints.
8. Focused runners and build pass.

## Return To Lead

Return:

- the Gate E save commit and the separate Gate F facility commit;
- files changed grouped by system;
- focused commands and elapsed time;
- before/after metrics for each deliberate layout pair;
- screenshots of all new fixtures at actual play zoom in idle and active states;
- unresolved design or integration conflicts;
- exact `sim.ts` and scenario function regions changed for conflict review.

