# Structural Frontage Playtest Report

Date: 2026-07-27

This report closes the current implementation tranche. It does not claim that
the full program in `39-structural-frontage-execution-checklist.md` is finished.
It records the build that is ready to test, the failures found while operating
it, and the shortest useful path for the next playtest.

## What Changed

The station now has several physical systems that can create visible layout
problems instead of resolving demand through hidden counters:

- Ships use directional Pod Docks and Berths with real approach envelopes.
- Charter lane direction influences preferred interfaces, approach frequency,
  debris exposure, sunlight, and the placement forecast shown in the world.
- Passengers transfer through exclusive Gangway/Pod Dock slots over nonzero
  time; additional Gangways can add capacity.
- Bulky freight exists as a carried cart with physical custody and corridor
  capacity. It can block passengers, and the conflict is labeled in the world.
- Long-stay cohorts can trigger early recall after sustained service collapse,
  or extend within a bounded window while useful work remains.
- Markets can use stocked Shelf Aisles and a two-register Checkout Bank. Goods
  are claimed at a shelf, carried by the shopper through a real FIFO line, and
  sold only at a physically staffed register.
- Exterior damage is durable and spatial. Breaches affect pressure and require
  real EVA access, oxygen, supplies, and repair work.
- Structural expansion is a phased material/EVA project rather than an instant
  shell mutation. Missing EVA access is now named over the blocked blueprint.
- Save hydration retains durable visits, construction, and damage while
  discarding stale paths, reservations, queues, and invalid dock commitments.
- Room-operation and local-oxygen cadence now use simulation time rather than
  render or machine wall time, restoring deterministic results across speeds.

## Bugs Found And Fixed During Play

1. Visitors entered a cafeteria queue before they had left their arrival tile.
   The queue was fictional: no reachable public food provider existed. Visitors
   now report `No public food?`, record missed demand, and choose another action
   or departure without claiming a phantom line.

2. A large market could visually contain two registers while the first line
   claimed the second register's physical head tile. Each register now protects
   its own queue head, lines split deterministically, and a focused comparison
   proves that two staffed registers complete more sales than one in the same
   window.

3. Stewards posted at Checkout Banks were immediately stolen by generic tray or
   cleaning dispatch. Live market posts are now protected up to actual register
   demand, while excess Stewards remain available to general work.

4. A Checkout Bank placed against the market wall had zero legal queue depth.
   This was not papered over: moving it inward creates eight line positions and
   makes the market work. It is useful evidence that fixture orientation and
   frontage can create an immediate, readable operational consequence.

5. Local oxygen and room-operation updates depended on real wall time, causing
   different results at different machine or simulation speeds. Both now use a
   fixed simulation-time cadence.

6. Blocked structural work rendered red but did not say why. The world now
   displays the project-level reason, such as `NO AIRLOCK EVA ROUTE`.

## Morning Test Route

Use the existing server at `http://127.0.0.1:5183/`.

### 1. Facility-Scale Market

Open:
`http://127.0.0.1:5183/?scenario=facility-scale&diag=1`

Observe stocked Shelf Aisles, two Stewards at the rear register positions, and
shoppers using physical browse and checkout positions. The large bank must have
public floor in front and staff space behind. This is the most complete new
spatial-machine slice.

### 2. Passenger And Freight Conflict

Open:
`http://127.0.0.1:5183/?scenario=cargo-boarding-conflict&diag=1`

The deliberately bad shared throat should show a cart and boarding passenger
blocking one another with an anchored `PASSENGERS BLOCKING FREIGHT` diagnosis.
This is the clearest proof that public and logistics circulation are no longer
just hidden efficiency modifiers.

### 3. Structural Expansion

Open both:

- `http://127.0.0.1:5183/?scenario=structural-expansion-blocked&diag=1`
- `http://127.0.0.1:5183/?scenario=structural-expansion-active&diag=1`

The blocked plan should name the missing Airlock/EVA route. The active plan
should show staged exterior work, EVA activity, and material use.

### 4. Failed Stay And Exterior Damage

Open:

- `http://127.0.0.1:5183/?scenario=failed-stay-showcase&diag=1`
- `http://127.0.0.1:5183/?scenario=visit-schedule-showcase&diag=1`
- `http://127.0.0.1:5183/?scenario=exterior-integrity-showcase&diag=1`

These show the occupant failure ladder, the red `EARLY RECALL | SERVICES
FAILED` and blue `EXTENDED | WORK REMAINS` Berth chips, and the
worn/damaged/breached/patched exterior states. The fixture stages the two
player-facing reasons; their production transitions are independently covered
by the failed-stay runner.

## Focused Verification

The following focused commands pass:

- `npm run test:facility-slots`
- `npm run test:failed-stay`
- `npm run test:physical-cargo`
- `npm run test:approach-control`
- `npm run test:approach-envelopes`
- `npm run test:exterior-integrity`
- `npm run test:structural-expansion`
- `npm run test:phase9-save`
- `npm run perf:target-scale`

The target-scale diagnostic uses a 16,800-tile station, 50 crew, 50 visitors,
and ten interfaces. Its two runs currently match deterministically at roughly
28 ms p95 simulation tick and 258 MiB RSS on the development machine. It lacks
enough active jobs and queues to qualify as the final mixed-operation scale
gate.

`npm run test:port-ops` is deliberately not listed as green. It still encodes
the old eight-crew, prebuilt-market, prebuilt-fuel starter and needs a proper
authored Berth fixture. Rewriting assertions until it passed would conceal that
product change rather than validate the current game.

## Design Assessment

The strongest result is not another need or module. It is that physical layout
can now determine whether a system works and explain the failure in the world.
The Checkout Bank is the best example: floor area buys capacity, but only when
the player also gives it queue frontage, a staff face, stocked shelves, and a
usable route. Passenger/freight contention and blocked EVA work express the same
design language.

That is the direction to deepen. The next pass should not add another broad
catalogue of shallow rooms. It should make one complete mixed visit use these
systems together: a ship approaches, passengers disembark, freight crosses the
station, shoppers and diners occupy real fixtures, unfinished work extends the
stay, failure can trigger recall, passengers physically board, and the contract
settles exactly once. The resulting authored scenario should become both the
design benchmark and the replacement for stale port-operation tests.

## Remaining Program Gaps

- A complete bare-station to first-medium-Berth playthrough is not yet closed.
- Larger cantina, Reception, wash, guest-cabin, and connected-bar machines are
  still planned rather than implemented.
- One versus two Checkout Banks still needs a live player-facing comparison;
  one versus two staffed registers is now measured in the focused runner.
- Early recall and bounded extension are visually staged and mechanically
  covered, but still need to emerge naturally during a full mixed visit.
- The final scale gate needs active ships, jobs, reservations, service queues,
  and browser render-frame measurements.
- Missing material, staging, oxygen, seal, and obstruction reasons need the
  same world-space treatment as missing EVA access.
- The whole progression/economy pass remains larger than this tranche; the
  checklist deliberately leaves those claims open.

The recommended next implementation target is one deterministic mixed Berth
visit fixture and focused runner. It has more design value than another isolated
module because it tests whether the station now behaves as one physical machine.
