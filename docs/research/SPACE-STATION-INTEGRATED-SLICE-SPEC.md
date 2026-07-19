# Integrated Port-Operations Slice

## Objective

Turn the existing collection of station systems into one legible, actionable loop:

`forecast traffic -> prepare capacity -> admit a ship -> process its people and cargo -> intervene in bottlenecks -> earn money/reputation -> attract new traffic`

This slice adds no free-standing dashboard systems. Every new datum must either be visible on the station or offer a direct action.

## Design rules

1. No resource exists only as a counter. It must be stored in a physical item node, carried by crew, consumed by a module, or remain aboard a ship.
2. No alert exists without a world target and at least one immediate action.
3. No room is mandatory merely because a recipe says so. It becomes necessary because throughput fails without its capacity.
4. Ships create bounded workloads, not passive visitor spawn multipliers.
5. The player manually solves early operations, then turns repeated solutions into schedules and policies.
6. Existing environmental systems remain supporting constraints during this slice; they do not become a second main game.

## Current foundations to retain

- Physical ships already approach, dock and depart; queues exist by lane.
- Docks already have area, orientation, lane, size and type filters.
- Five ship families and per-ship passenger/service manifests exist.
- Visitors retain their origin ship and physically seek cafeteria, market and lounge service.
- Crew pathfind, select prioritized posts, accept transport jobs and visibly carry items.
- `ItemNode` capacity, intake pallets, storage racks, serving stations, stoves, workbenches and market stalls exist.
- Raw meals, meals, raw materials and trade goods already exist as item types.
- Rooms already validate size, modules, doors, paths and pressure.
- Resident needs, housing policies, satisfaction, safety, crime, theft, reputation and lane profiles exist.

The work is primarily replacing shortcuts and connecting ownership, capacity, failure, feedback and rewards.

## A. Construction economy and stockpile prerequisite

### Today

Storage and logistics rooms are optional optimizers. Construction is effectively paid from global counters, so material location and storage capacity do not bind station growth.

### Behind the scenes

- Split inventory into **station reserve** (abstract starting cache only) and **physical stock** (all newly acquired goods).
- A small starting `Intake Pallet` beside the initial dock holds enough materials for the first storage room. This avoids a bootstrap deadlock.
- After that cache is exhausted, construction consumes `rawMaterial` from reachable intake pallets or storage racks.
- Placing a blueprint reserves materials but does not consume them. Crew create delivery jobs from stockpile to blueprint; construction begins only after delivery.
- Demolition returns a fraction of material as physical items at the site.
- Every node gets player-set filters and a target quantity. Overflow remains on the dock/ship and blocks turnaround.
- Remove any production or commerce path that silently creates inventory when no valid node exists.

### What the player sees

- Build ghosts show `12 material required / 7 reachable` directly over the footprint.
- Storage rooms visibly fill rack cells; carried crates use existing agent/item rendering.
- A logistics overlay colors sources, destinations, reserved stock and blocked routes.
- A dock apron shows cargo pallets accumulating. Red striped floor means the berth cannot release.

### Player actions

- Zone a Storage room, install racks and choose accepted goods/target levels.
- Place temporary intake pallets close to docks or permanent central storage farther inside.
- Prioritize a delivery, suspend a blueprint, or reroute haulers.
- Decide whether cheap cargo is worth consuming scarce storage and labor.

### Dependencies and safeguards

- Storage is available at the start rather than tier-locked.
- Initial hull includes one functioning intake pallet and one hauler.
- If no legal stockpile exists, the ship manifest explicitly says `0/40 unload capacity`; the player can refuse it.
- The tutorial's first construction is a rack adjacent to the intake pallet, proving the loop before traffic pressure begins.

## B. Finite arrivals and admission

### Today

`shipsPerCycle` and lane profiles automatically generate traffic. Queued and approaching ships are visible, but the player primarily configures general dock filters.

### Behind the scenes

Each ship becomes a persistent visit with:

- identity, type, size, origin lane and ETA;
- passengers by archetype;
- inbound cargo and outbound requested cargo;
- requested services;
- expected berth time and patience/deadline;
- base fee, service revenue and late/failure penalties;
- safety/security traits;
- explicit turnaround work units.

Traffic is forecast 60–120 seconds ahead. Ships enter a physical holding orbit. They do not dock until assigned or matched by an unlocked berth policy.

### What the player sees

- Ships appear at the station edge with an ETA ring and lane trail.
- Clicking the ship opens one compact, world-anchored manifest: **brings / wants / needs / pays / occupies / risks**.
- Every line forecasts current readiness: `Meals 18 required — 11 ready`, `Cargo space 32 required — 20 free`, `Security recommended — 0 nearby`.
- Ghost route lines connect the proposed berth to storage and requested services, with estimated walking/haul times.

### Player actions

- Drag the ship to an eligible berth, leave it holding, refuse it, or redirect it.
- Change a dock filter or reserve the berth for a later arrival.
- Inspect why the readiness forecast is poor and build/reassign before committing.

### Not added

No card hand, random perk selection or detached contract board. The object being manipulated is a real ship occupying real time and space.

## C. Dock turnaround as visible work

### Today

Ships use `approach -> docked -> depart`; passengers spawn during a fixed dock timer. Most turnaround work is implicit.

### Behind the scenes

Replace the single dock timer with parallel work tracks:

1. **Mooring** — one dockworker reaches the berth terminal.
2. **Unload** — cargo becomes transport jobs into legal stockpiles.
3. **Passenger service** — existing visitors disembark, use rooms and return.
4. **Service** — supplies/repair/cleaning depend on manifest type.
5. **Load** — requested exports move from storage to the berth.
6. **Clearance** — all passengers aboard, hazards resolved and apron below its obstruction limit.

Inspection is not a new room in the first slice. It is a security-qualified task performed at the existing dock terminal. Large/hazardous ships may later justify a customs room, but the initial slice must prove the job before requiring more construction taxonomy.

### What the player sees

- A segmented progress rail is drawn beside each docked ship: moor, unload, people, service, load, clear.
- Segments animate from actual completed work, not elapsed time.
- Hovering a stalled segment identifies the world cause: `UNLOAD BLOCKED — racks full`, `CLEARANCE — 2 passengers still in Market`, `SERVICE — no workshop crew`.
- Cargo and passengers visibly cross the docking threshold.
- The dock floor displays its active job count and obstruction level.

### Player actions

- Assign or reprioritize crew at the dock, storage, kitchen, workshop or security post.
- Temporarily close passenger services to send people back, waive unfinished optional service, or pay an expedite fee.
- Hold departure to finish profitable exports, or release early and accept lost revenue/reputation.

## D. Crew operation and staffing

### Today

Crew already select critical posts and logistics using priority weights, sticky assignments and protected minimums. The UI exposes considerable telemetry, but actions are mostly global presets.

### Behind the scenes

- Extend `CrewPrioritySystem` with `dock` and retain logistics as a first-class assignment.
- Give every active room/dock a required or desired staffing count derived from current workload.
- Preserve automatic job selection, but allow direct temporary assignment to a room or dock.
- Add shift templates only after the second berth is operating. Early play is direct assignment; later play uses schedules plus exceptions.
- A temporary assignment expires after the ship clears unless pinned.
- Crew skill is deferred; workload, travel, energy and priorities are sufficient for this slice.

### What the player sees

- Clicking a worker shows current job, destination, carried item, energy and next scheduled role.
- Clicking a room/dock shows `2 working / 3 desired`, pending jobs and projected completion time.
- Drag-select workers, then click a room/dock to reinforce it. Assigned workers get visible route arrows.
- A small alert appears over the affected facility, never only in a menu.

### Player actions

- Reinforce unloading, food service, security or workshop service during a rush.
- Protect reactor/life-support minimums while borrowing other staff.
- Save the successful arrangement as a shift template once repetition becomes tedious.

## E. Production and commerce become manifest-bound

### Today

Hydroponics, kitchen, cafeteria, workshop and market have physical item nodes, but generic traffic and forgiving rates allow the same food core to generate steady income.

### Behind the scenes

- Hydroponics produces raw meals into a real node; kitchen consumes them and produces meals; serving stations consume meals per diner.
- Trader/industrial manifests create raw-material and trade-good imports/exports.
- Workshop consumes raw materials to complete industrial service and produce trade goods.
- Market consumes trade goods per sale rather than paying from occupancy alone.
- Production rates are calibrated around ship-sized bursts and storage buffers, not a smooth average.
- A ship pays in components: berth fee, completed service, passenger spending, cargo trade, punctuality bonus. The ledger attributes every amount to that ship.

### What the player sees

- Modules show input buffer, output buffer and throughput directly when selected.
- The manifest updates live from `at risk` to `ready` as stock arrives or production completes.
- Bottleneck overlay traces the whole chain from ship request to missing rack/module/staff.
- Departure produces a concise world-side receipt explaining profit and failures.

### Player actions

- Build capacity, expand buffers, move stock targets, add staff or refuse incompatible traffic.
- Choose whether to consume meals on current tourists or preserve them for a more valuable colonist ship.
- Decide between larger centralized storage and faster dock-local buffers.

## F. Visitors, residents and district conflict

### Today

Archetypes, housing policy, resident routines, satisfaction, safety, theft, confrontations and rating already operate, but their consequences collapse into broad global scores.

### Behind the scenes

- Calculate service quality and disturbance per room/corridor catchment, then aggregate upward.
- Visitor classes emit congestion, noise and crime exposure while moving and waiting.
- Residents remember exposure near home and routine destinations.
- Housing and service-room policies already present become real access tools: public, resident-shared and private-resident.
- Reputation splits into four legible dimensions: turnaround reliability, public service, safety and residential prestige.
- Those dimensions modify future physical traffic: frequency, passenger mix, patience and willingness to pay.

### What the player sees

- Four optional overlays: crowding, safety, noise/disturbance and service catchments.
- Residents display the rooms/routes producing their strongest positive and negative feelings.
- Ship manifest forecasts local impact: `+24 public load`, `high theft exposure`, `-prestige near private housing`.
- Lane forecast visibly changes after several successful or failed visits.

### Player actions

- Separate freight/passenger routes, restrict doors, place security, move public amenities or create private residential services.
- Accept lucrative disruptive traffic and mitigate it physically, or cultivate a quieter market.

## G. Automation as progression

### Today

Tier unlocks reveal content after stable global predicates. Dock filters and crew presets exist from the outset but do not feel like learned management.

### Behind the scenes

Automation unlocks because scale crosses operational thresholds:

- **Berth rules:** after three manual arrivals, auto-assign matching low-risk ships.
- **Shift templates:** after operating 10 crew and two simultaneous ships, schedule staffing blocks.
- **Stock targets:** after first shortage/overflow resolution, maintain min/max quantities per node.
- **Supervisor policies:** at four berths, assign a manager to execute routine turnaround and escalate exceptions.
- **District policies:** later, set access, staffing, security and service budgets for spatial groups.

Automation is inspectable. Every automatic decision reports the rule that caused it and can be overridden in-world.

### What the player sees and does

- A solved action offers `Make this routine` beside the world object.
- Policies live on docks, rooms and districts rather than in one giant administration menu.
- Exceptions pulse on the facility and appear in a short operational queue: player chooses delay, reinforce, waive or reject.

## Remove, merge or demote existing UI

The current interface exposes many raw metrics simultaneously. For this slice:

- Replace ships/min, demand percentages, archetype counts, queue counts and berth summary text with the orbital traffic strip and selectable physical ships.
- Replace visitor-feelings and rating-driver text dumps with local overlays and the four reputation dimensions.
- Merge crew retargets, idle reasons and job telemetry into worker/facility inspectors; keep raw telemetry behind a debug toggle.
- Keep construction, room/module placement and direct agent inspectors.
- Keep the solar-system map as a forecast/context surface, but do not add diplomacy yet.
- Keep atmosphere/heat/fire readable but secondary; one scripted equipment fault is enough to test whether operations survive disruption.

## Dependency order

### Milestone 1 — Physical economy closes

1. Make construction consume reachable physical material.
2. Provide bootstrap intake pallet/material/hauler.
3. Add rack filters, target quantities, reservations and overflow behavior.
4. Verify the player can build, run out, receive cargo and resume construction without global-item shortcuts.

**Gate:** no material appears/disappears except through a visible node, carrier, module, ship or explicit starting reserve.

### Milestone 2 — One ship is a complete job

1. Extend ship manifest and persistent visit state.
2. Add manual berth assignment and holding orbit.
3. Replace fixed dock timer with turnaround tracks.
4. Generate unload/load/service/clearance work using existing transport and crew systems.
5. Add dock progress rail, world stalls and ship receipt.

**Gate:** a trader can arrive with cargo, occupy storage and labor, receive passengers/services, buy exports and depart; every delay is visible and actionable.

### Milestone 3 — Station layout changes outcomes

1. Bind production/commerce to physical inputs and output buffers.
2. Tune walking, hauling and burst demand so route length and buffer size matter.
3. Add bottleneck trace and capacity forecast.
4. Test near-dock versus central storage and public/freight route conflicts.

**Gate:** two valid layouts have explainable, different strengths; neither universally dominates.

### Milestone 4 — Staffing becomes play

1. Add dock workload and desired staffing.
2. Add direct temporary assignment and route feedback.
3. Add saved shifts after the manual loop is proven.
4. Create one overlapping-arrivals rush requiring reallocation.

**Gate:** the player can recover a late ship by moving staff, while the reassignment creates a visible cost elsewhere.

### Milestone 5 — Traffic shapes station identity

1. Connect ship types to cargo, passengers, disruption and service profitability.
2. Localize safety/crowding/disturbance effects.
3. Split reputation and feed it back into lane traffic.
4. Add residential conflict and access/security counterplay.

**Gate:** passenger, industrial and residential strategies produce visibly different layouts, staffing and future arrivals.

### Milestone 6 — Compressed progression proof

1. Replace linear tier checks with operational automation unlocks.
2. Author a 35–45 minute scenario from 10 crew/2 berths to 25 crew/4 berths.
3. Add forecast, exception handling and a final high-value conflicting arrival.
4. Remove/demote dead telemetry and complete onboarding/audio/feedback.
5. Run three full playthroughs: passenger-heavy, industrial-heavy and mixed/residential.

**Gate:** each run reaches profitability through a different physical/staffing solution, and later automation reduces repetition without eliminating decisions.

## First-slice content budget

Use three ship families, not all five:

- **Tourist:** passengers, meal/leisure demand, crowding, public-service reputation.
- **Trader:** inbound raw materials, outbound trade goods, storage and market pressure.
- **Industrial:** raw material/service demand, workshop work, noise/security burden.

Colonist and military ships remain visible in the code but disabled for the slice. They return only after the three-family loop is fun.

Use existing rooms wherever possible. Required set:

- Dock, Logistics Stock, Storage
- Hydroponics, Kitchen, Cafeteria
- Workshop, Market
- Security and Dorm for the final district conflict

Clinic, Brig, Rec Hall, Hygiene and Lounge stay functional but are not required objectives. This prevents the slice from turning every existing subsystem into a mandatory tutorial.

## Player-facing 40-minute arc

1. **0–5 min:** inspect two forecast arrivals; expand the bootstrap stockpile and choose which ship receives the first berth.
2. **5–12 min:** unload cargo and complete service by manually reinforcing hauling/food. Discover one storage or route bottleneck.
3. **12–20 min:** choose passenger commerce or industrial servicing; build the relevant room/module chain.
4. **20–28 min:** overlapping arrivals force berth scheduling and temporary staff reassignment. Earn berth rules and a shift template.
5. **28–35 min:** residents arrive/convert; crowding, safety and prestige expose a district conflict.
6. **35–40 min:** decide whether to admit a high-value disruptive ship, then mitigate it with admission timing, staffing, stock and layout. Receive a complete operational report.

## Validation questions

- Can the player explain why a ship is profitable before admitting it?
- Can every stalled turnaround be diagnosed from the world without reading raw telemetry?
- Does storage location change turnaround enough to justify construction cost?
- Does accepting a ship prevent or endanger another useful action?
- Can staff reassignment rescue a situation while harming another system?
- Does the station attract measurably different future traffic because of how it was operated?
- Does earned automation remove solved repetition while preserving exceptions?
- Are there any rooms, resources, reputations or jobs shown prominently that do not affect an available decision? If yes, connect, demote or remove them.

