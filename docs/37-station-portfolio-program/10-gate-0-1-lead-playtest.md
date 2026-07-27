# Gate 0/1 Lead Playtest

Date: 2026-07-26

Build reviewed: `0b29503` plus bounded lead-playtest fixes

This is the lead game-design review of the completed Gate 0/1 handoff. It records what a fresh player can see and do, not only what the simulation can prove in tests.

## Verdict

The package adds useful foundations, but the opening delivered in `0b29503` did not pass Gate 1 without follow-up work. The three-business framing is directionally right. The initial implementation let the station earn, serve travelers, gain rating, and advance goals before the player chose a business. Several catalog numbers also disagreed with the actual simulation.

After the lead fixes, the hospitality route now passes its first playable cycle and procurement uses shared quotes. Commerce and engineering have credible foundations, but Gate 1 should remain open until the stock starter and any stored starter template both complete those routes through the UI. The opening also needs a balance ruling: doing nothing is stagnant now, but payroll eventually bankrupts the station rather than merely applying gentle pressure.

### Follow-up Verification

The first lead-review fixes are now present in the local playtest build:

- the starter Cafeteria is a crew mess until it has two Serving Stations and two Tables;
- the opening palette defaults to Businesses and shows remaining fixture prices;
- recipe stock steps use physical item-node stock and reopen on depletion;
- passenger arrival itself produces no credits, rating, meals served, or goal progress;
- supplier stock and fuel orders now use the same site-adjusted quote in the recipe, shop, affordability check, ledger charge, and supplier-pod delivery;
- pod outcomes now retain visit-local service and revenue accounting instead of reconstructing results from bounded recent logs;
- freight handling no longer counts as refuel/repair demand.

That is a genuine improvement: the opening is now a demand signal and a choice, rather than an automatic restaurant.

## Visual Route 1: Feed Travelers

Run from a clean recommended charter through the real build UI:

- placed one additional Serving Station in the starter Cafeteria for `50c`;
- placed one additional four-seat Table in the same room for `80c`;
- cash moved from `220c` to `90c`, exactly matching the `130c remaining` recipe;
- within the first operating cycles, the card reported `5/5 served recently`, the global goal reached `9/20` visitors served, traffic revenue reached `61c`, and cash recovered to `133c`;
- after a longer 4x run, cash reached `174c`, rating reached `2`, traffic revenue reached `132c`, and the prepared-meal reserve fell to `8`.

The world behavior change is immediate and legible: pod visitors enter the Cafeteria, collect meals, occupy the rendered table seats, and leave. This route is the first Gate 1 route to pass its basic authorship, cost, behavior, and revenue checks.

It also exposed an important state-model problem. Once stock fell below the recipe's 12-meal threshold, the business stopped reading as `operational`; because Capital Projects visibility was tied to that transient flag, later UI could disappear when a built business merely needed restocking. Build completion and current operating readiness must be separate concepts.

The longer run also confirmed that meal readiness must include clean trays, not meals alone. The recipe must use the limiting stock and share the same active Cafeteria cluster rule as visitor routing.

## Visual Route 2: Sell Supplies

Run through the real build UI from a clean recommended charter:

- painted one coherent 10-tile Market cluster in the expansion apron;
- placed one Market Stall for `50c`, with the ledger/header moving from `220c` to `170c` exactly;
- the card correctly separated `built` from `operational` and diagnosed `missing door, no local power`;
- the stock action opened the Travel Supplies Shop and showed the site-adjusted `77c` wholesale order rather than the base balance-table number;
- the stored starter template used by the browser contained a visible Freight Locker that the live dock registry did not recognize as attached, so the order remained disabled;
- switching to `?starter=stock` restored the authored starter layout, while the focused procurement check proved the factory starter's dock, quote, charge, supplier-pod delivery, and destination stock path.

This route is not yet a clean visual pass. Two findings matter. First, a stored starter template can preserve port hardware that no longer satisfies the current attachment rules; New Game needs either template validation/repair or a clear incompatibility warning. Second, the recipe originally labeled its room step `Build an enclosed ... Market` and marked it ready from tile count alone. The step now says exactly what it measures, `Paint one 10-tile Market cluster`; enclosure, door, path, pressure, and local power remain explicit operating diagnostics.

## Route 3: Service Ships

The focused procurement and operational-truth checks cover the engineering chain end to end: a Fuel Coupler must belong to a real Pod Dock, a Fuel Tank must be in Maintenance, the fuel pipe must connect that tank to that coupler, the order price is site-adjusted, and delivered fuel lands in the tank. Freight handling no longer satisfies ship-service demand.

This route still needs one final eyes-on build from the stock starter. Its individual dependencies are now truthful, but drawing the pipe and understanding the coupler/tank relationship are precisely the interactions that can be technically correct and still feel obscure.

## Fresh Start Baseline

Recommended charter, no player construction:

- 220 credits
- 6 crew
- 30 prepared meals at one Serving Station
- one Cafeteria with one four-seat Table
- no Market Stall
- no Fuel Tank or Fuel Coupler
- two Pod Docks
- 11.3 power demand against 18 supply
- 75% oxygen reserve
- rating 0

In the original handoff build, after about ten real seconds at 4x, without building or ordering anything:

- credits rose from 220 to 239
- rating rose from 0 to 8
- prepared meals fell from 30 to 26
- four visitors were served
- traffic revenue reached 25/500c
- Feed Travelers reported 2/2 recent demand served

This was the central opening failure. The player could click Play and watch the supposed first business operate. The lead fixes removed passenger-arrival income/rating and keep the starter mess crew-only until the player adds a second counter and table.

A later 1800-second no-input check produced `0c` access income, about `346c` payroll, and cash `220c -> 0c`, while recording substantial unmet meal, supply, and ship-service demand. That proves stagnation and missed opportunity now work, but it also means the phrase "survivable but stagnant" is not yet accurate over a long opening. The next balance pass should decide the intended grace period and communicate burn rate before changing numbers.

## What Works

### The three choices are understandable

`Feed Travelers`, `Sell Supplies`, and `Service Ships` are a much better opening vocabulary than a flat module catalog. They describe recognizable businesses with different physical and economic shapes.

### The starter station is legible

The compact shell, two Pod Docks, visible reactor, crew support rooms, logistics intake, and open expansion apron communicate a small working outpost. It is a credible place to begin building.

### Site conditions point toward strategy

The charter brief exposes supply prices, solar yield, repair demand, and local traffic character. This is the correct foundation for making different sites favor different portfolios, although the opening choices do not yet make those differences felt strongly enough.

### Recipe steps use ordinary build tools

The player still paints rooms, places fixtures, and draws utilities in the world. The catalog is guidance rather than a one-click prefab or a detached funding screen.

## Bugs And Contract Failures

### Fixed: Starter hospitality was already operating

The one-counter, one-table crew mess is counted as an active public Cafeteria. Visitors eat there immediately and generate revenue, rating, demand completion, and global-goal progress.

Result: the starter mess now remains crew-only in practice. Traveler pickup targets open only after the Cafeteria cluster has two Serving Stations and two Tables.

### Fixed: Arrival awarded idle capital and rating

Initial pod access had been treated as a paid, rated passenger service. A fresh station could therefore gain credits and eight rating points simply by playing. Passenger arrival now has zero direct credits and rating; revenue and reputation begin when the player operates a business. The Tier 1 first-visitor unlock also no longer grants a rating foundation.

### Fixed: Feed Travelers cost disagreed with its intended commitment

The catalog reports 65c remaining because one additional Serving Station costs 25c and one additional Table costs 40c. This allows Feed Travelers plus Sell Supplies for 195c, contradicting the 55-70% opening-capital target and the corrected 260c cost for the two cheapest choices.

Result: a fresh Feed Travelers investment costs `130c` through actual added fixtures, and placement charges match the catalog.

### Fixed: Unrelated fuel pipe completed the recipe step

The starter contains one fuel-pipe tile. The Service Ships recipe therefore displays `1/1` before a tank or coupler exists.

Result: the step completes only when a continuous network connects a Fuel Tank in Maintenance to a Fuel Coupler attached to a real Pod Dock.

### P1: Recipe stock used presentation data

The initial implementation hard-coded stock steps to zero. During lead review this was changed to count physical meals at Serving Stations, goods at Market Stalls, and fuel at Fuel Tanks. Stock now becomes incomplete again when inventory is depleted.

### Fixed: Pod outcomes depended on bounded recent logs

A departing pod reconstructed its visit from bounded recent service and economy events. Under sustained traffic, early events could age out before departure and lower the reported result.

Result: each active visit now durably accumulates canonical meal/retail completion, refuel/repair completion, and attributable positive ledger revenue until settlement. A focused regression churns both recent buffers before departure and retains the correct outcome across save/load.

### Fixed: Freight was misreported as Service Ships demand

Freight Locker courier handling was counted in the `shipService` demand family even though Service Ships means refuel/repair hardware. Freight-only calls now report `0/0` engineering demand; only refuel and repair increment that served family.

### Fixed: Cumulative rating was not save-stable

The header could show earned rating, then lose it after a save/load or hot reload because rating factors were not serialized. Saves now retain the cumulative score, current delta, penalty buckets, failure reasons, and bonus buckets. Older saves migrate those fields to zero.

### Open: Stored starter templates can contain invalid port attachments

The browser's saved starter template rendered its Freight Locker, but the live Pod Dock did not advertise freight capability and procurement stayed disabled. The authored stock starter passes the focused procurement check. Template application currently copies authored topology without a player-facing compatibility audit.

Recommended outcome: validate Pod Docks and their attachments when saving/applying a starter template. Reject invalid templates in the editor, and show a concise repair warning for older stored templates rather than silently presenting decorative, nonfunctional hardware.

### Open: Settlement penalties remain difficult to trust

The focused truth run still reports a badly served turnaround paying `147c` against `345c` for a clean call. The settlement function prorates gross and then applies penalties against the prorated number; its advertised maximum-loss floor is effectively unreachable, and `shortfallPenaltyCredits` is not preserved on older settlement records. This needs a separate economy review before berth contracts become an opening promise.

### P1: Businesses panel was unreadable at 1280x720

Recipe cards inherited the build palette's multi-column grid, compressing labels into vertical letter stacks. During lead review it was changed to a single-column decision list. The copy is readable now, but the panel remains too tall to compare all three choices at once.

### Fixed: Recipe step prices described totals, not remaining purchases

The headline says the remaining cost, while each partially completed step displays its full two-fixture cost. The player cannot easily reconcile the two numbers.

Result: partially completed steps now state their remaining fixture count and remaining cost, matching the recipe headline.

### P2: Opening choices are hidden behind the Businesses tab

The fresh game opens on Build. The most important strategic decision is therefore not the first thing the interface asks the player to make.

Recommended outcome: open Businesses by default for a fresh charter, or place a compact world-linked opening prompt that sends the player there without covering the station.

### P2: Capital Projects remain prominent

The Site Brief still displays `Capital projects 0/2 active`. This competes with the newer player-authored portfolio model and resembles the one-off funding workflow the design explicitly moved away from.

Decision needed after route playtests: reposition projects as optional contracts/grants after the first business, or remove them from the opening surface.

## Catalog Presentation Assessment

The repaired single-column layout is readable, but it is still a long inspector embedded in a narrow build sidebar. At 1280x720 the player can see Feed Travelers and only the beginning of Sell Supplies. Comparing three alternatives requires scrolling and memory.

Recommended next UI pass:

1. Show three compact business cards together: name, required capital, expected demand, footprint, and one-line tradeoff.
2. Clicking a card opens its detailed step list in the same sidebar or a modest overlay.
3. Keep completed steps visible but compressed.
4. Put site modifiers directly on the relevant cards, such as `Repair demand +29%` on Service Ships.
5. Keep every step linked to ordinary world build tools.

## Acceptance Runs Still Required

Run each route from a clean recommended charter without debug credit injection:

1. Commerce on the stock starter: enclose and power the Market, receive supplies through the Freight Locker, verify hauling, inventory, pricing, sales, and stockout feedback.
2. Engineering in the UI: install tank and coupler, draw a real connected pipe, buy fuel, refuel pods, and verify tank gauge, engineer work, revenue, and depletion.
3. Stored-template compatibility: save a starter with both Pod Docks and one Freight Locker, begin New Game, and confirm the freight capability survives.

For each run record:

- time and spend to become operational
- whether the build recipe predicted the real cost
- the first visible customer behavior change
- first revenue and gross margin
- labor and utility consequences
- failure diagnosis when one dependency is removed
- time to recover enough capital for the next major investment

## Gate 1 Passing Standard

Gate 1 passes when all of the following are true:

- doing nothing does not complete a business, serve optional demand, or fund growth
- crew survival does not force the hospitality choice
- exactly one opening business is comfortably affordable
- the chosen build causes an obvious change in the world
- demand, stock, throughput, revenue, and failure reasons agree across UI and simulation
- each route can reach a stable first operating cycle without debug intervention
- site conditions make at least one route more attractive without closing the others

## Lead Recommendation

Keep the three-business opening. It creates the first real portfolio decision the game has had, and the successful hospitality run proves that one small capital choice can visibly change traveler behavior and cash flow. Do not add more opening systems yet.

The next pass should be narrow:

1. Make saved starter templates validate and migrate physical port attachments.
2. Finish one eyes-on commerce and engineering cycle from the stock starter.
3. Add a compact opening burn-rate forecast: current cash, payroll per cycle, and approximate time until funds run out.
4. Rework the recipe comparison into three compact summaries with details on selection; the current single-column cards are readable but too tall.
5. Review turnaround settlement math before larger berths/contracts become part of Gate 2.

The key design result is positive: the player is finally authoring a business rather than completing a hidden checklist. The remaining work is truth, pacing, and presentation, not another reinvention of the opening spine.
