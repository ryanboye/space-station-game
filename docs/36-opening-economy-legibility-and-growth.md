# Opening Economy: Legibility and Growth

## Implementation Status

Implemented as one integrated opening loop. The current build includes dock demand/result chips, a bounded operating ledger, Travel Supplies pricing and supplier stock orders, charter-derived economics shown during site selection and in play, explicit supplier-versus-courier freight ownership, optional capital projects, and a wired stock starter with compatibility fallback for older custom layouts. Focused runners cover accounting, save migration, freight ownership, projects, starter power, and the joined supplier-delivery flow.

## Purpose

The first station should feel like a tiny roadside service stop in space. A player should be able to watch a pod arrive, understand what its occupants want, serve them, see where money was made or lost, and choose the next physical investment. Complexity grows from owned infrastructure and operating pressure, not hidden unlocks or manifest paperwork.

This pass joins six features around one loop:

1. **See demand** at each dock.
2. **Provide a service** through physical rooms, fixtures, stock, and staff.
3. **See the transaction** in the world and in a compact ledger.
4. **Understand local economics** from the chartered site.
5. **Choose an investment** through ordinary construction, purchasing, or an optional grant.
6. **Create new demand and operating pressure** by expanding.

## Non-negotiable Player Experience

- Pods are ambient traffic, not approval cards. The player manages capacity and services, not individual manifests.
- The first useful information is visible in the world. Panels explain and aggregate; they do not replace watching the station.
- Credits must answer: what did I sell, what did it cost me, and what should I invest in next?
- Zoning remains free. Modules, stock, utilities, staffing, and maintenance carry the cost.
- A charter location changes prices, demand, traffic, solar yield, and environmental pressure in visible ways.
- Freight is never both free inventory and paid work. Ownership and payment direction must be explicit.
- The starter is powered by a visible, connected system. Laying the first cable must never disable a hidden free grid.
- Grants are optional capital offers, not a linear quest chain and not hard unlock gates.

## Shared Economy Contract

All opening-economy actions emit a bounded, save-safe `EconomyEvent`:

```ts
type EconomyEventKind =
  | 'dock-fee'
  | 'passenger-service'
  | 'fuel-sale'
  | 'repair-service'
  | 'retail-sale'
  | 'supplier-purchase'
  | 'courier-fee'
  | 'wages'
  | 'maintenance'
  | 'construction'
  | 'grant-award';

interface EconomyEvent {
  id: number;
  at: number;
  kind: EconomyEventKind;
  credits: number; // positive revenue, negative expense
  costBasis: number; // inventory/resource cost consumed by this action
  label: string;
  sourceId?: number;
  tileIndex?: number;
  siteTag?: string;
}
```

The state retains a bounded recent history and lifetime totals by category. UI derives revenue, expense, margin, and recent trends from this source. No second UI-only accounting model.

## Slice A: Dock Transaction Feedback

### Arrival

A small chip anchored beside an occupied Pod Dock shows concise demand:

- `2 travelers · food + supplies`
- `courier · 4 crates`
- `low fuel · wants 6 units`

It must not block the station or require interaction.

### Departure

The same anchor briefly shows the result:

- `+18c · meals 2 · supplies 1`
- `+10c courier fee · 4/4 crates`
- `+3c · missed fuel sale`

Green is successful service, amber is partial/missed opportunity, red is a broken or failed service. The callout fades and remains available in the ledger.

### Acceptance

- Every completed pod visit produces exactly one summary.
- Summary values equal emitted economy events.
- The player can understand why a low-value visit was low-value without opening a manifest.

## Slice B: Operating Ledger and Travel Supplies Shop

### Credits Ledger

Clicking the Credits HUD opens a compact panel with:

- current credits;
- revenue, expenses, and net for the recent operating window;
- grouped sources with clear labels;
- the last 8-12 transactions;
- no giant table and no editable accounting controls.

### Travel Supplies Shop

Rename the station-operated starter `Market` presentation to **Travel Supplies Shop**. Its inspector shows:

- stock on hand / capacity;
- local wholesale cost;
- current sale price;
- recent unit sales and gross margin;
- local demand descriptor;
- `Order stock` action;
- pricing policy: `Budget`, `Standard`, `Premium`.

Policy tradeoff:

- Budget: faster demand, lower margin, small satisfaction benefit.
- Standard: balanced baseline.
- Premium: higher margin, slower demand, dissatisfaction risk when station rating is low.

No per-item spreadsheet is needed in this slice.

### Acceptance

- Starter retail is profitable at Standard policy under a neutral charter.
- Stock purchases create a clear negative transaction; sales create positive transactions with cost basis.
- Empty stock visibly stops sales and prompts ordering.
- A player can state their shop margin from the UI without reading debug metrics.

## Slice C: Chartered Local Economy

Derive an `OpeningEconomyProfile` from the existing `SiteCharter` and generated site data. It provides bounded multipliers and labels for:

- passenger traffic;
- courier traffic;
- supply wholesale prices;
- fuel wholesale and sale prices;
- retail demand;
- repair demand;
- solar yield and environment pressure references.

The charter screen uses the same derived values shown later in a persistent **Site Brief**. The Site Brief is compact and descriptive:

- `Busy trade lane · strong traveler demand`
- `Ice-rich belt · cheap water and fuel feedstock`
- `Remote orbit · costly deliveries, high repair demand`
- `Sunward orbit · excellent solar yield, higher cooling load`

Resource type must affect at least one operating price or demand. A survey number that does not affect play must be removed or labeled as flavor.

### Acceptance

- Two meaningfully different charter sites produce visibly different demand or margins in the first ten minutes.
- The active effects can be rediscovered after starting the game.
- Modifiers remain bounded so every charter is viable.

## Slice D: Freight Ownership and Supplier Deliveries

There are two explicit freight relationships:

### Supplier Delivery

- Player orders station-owned stock (travel supplies, meals, or fuel).
- Player pays when the order is placed or contracted.
- A supplier pod/ship carries named goods to a compatible freight point.
- Goods become station inventory only after unloading.
- Failure or lack of capacity delays the delivery; it never pays the station.

### Courier Handling

- A courier arrives with consigned cargo.
- Cargo remains logically owned by the courier/customer.
- The station earns a handling fee for completed unloading/loading or temporary transfer.
- Consigned cargo never increases station-owned material totals.

The Pod Dock Freight Locker supports pod-scale deliveries. Cargo Arms and berth storage remain the higher-throughput evolution.

### Acceptance

- No freight operation both grants station inventory and pays revenue.
- UI says `Supplier delivery` or `Courier handling`, never generic `freight` when payment direction matters.
- Orders, arrival, unloading, stock ownership, and ledger entries agree after save/load.

## Slice E: Optional Capital Grants

Introduce a compact **Projects** panel with optional grant offers. At most two are active. Initial offers:

- **Roadside Rest Stop**: serve travelers with food and supplies; rewards expansion capital.
- **Courier Partner**: install freight handling and complete courier transfers.
- **Fuel Frontier**: establish a powered, piped fuel service and complete refuels.
- **Local Bazaar**: reach a retail sales and station-rating target.

Each grant has 2-4 world-readable conditions, an upfront advance when appropriate, a completion award, and no exclusive unlock. The player can always self-fund the same infrastructure.

### Acceptance

- Grants suggest directions without dictating build order.
- Progress comes from actual simulation state, not button clicks.
- Rewards are large enough to finance the next meaningful module cluster but not erase operating economics.

## Slice F: Honest Starter Power

The authored starter contains:

- one visible 2x2 reactor or an appropriate solar installation for the charter;
- visible power conduits connecting all starter service rooms;
- 65-75% normal utilization before expansion;
- a clear power HUD and overlay showing source, connected area, draw, and reserve.

Compatibility rule: legacy saves with no power infrastructure may retain the old fallback until the player places a source or explicitly enables the grid. Fresh games never rely on the fallback.

### Acceptance

- All starter rooms work immediately and visibly receive power.
- Adding one modest powered room approaches the limit; meaningful expansion requires generation or solar.
- Placing the first cable cannot cause a surprise station-wide blackout.
- Cable placement returns to normal view and remains performant.

## Balance Targets

For the first 10-15 minutes at a neutral site:

- Basic pod passenger: 3c dock access plus optional purchases.
- Meal: 5-7c sale against 2.5-3.5c landed cost.
- Travel supply: 6-9c sale against 3-5c landed cost.
- Pod refuel: materially better than access alone, but consumes purchased fuel.
- Courier handling: modest fee tied to completed units, no free inventory.
- One good pod visit should produce a legible `10-30c` result.
- A new service fixture cluster should require several successful visits, not dozens of passive minutes.
- Starter payroll and upkeep should create pressure without making inactivity immediately fatal.

Exact values are tuning inputs, not hard API contracts.

## Integration Order

1. Add shared economy events, profile math, market policy, grant definitions, and focused pure tests.
2. Add transaction recording to existing service and purchasing paths.
3. Split pod freight into supplier and courier flows.
4. Add dock callouts, ledger, shop inspector, Site Brief, and Projects panel.
5. Replace the fresh-start power fallback with authored infrastructure.
6. Validate save migration.
7. Play a clean charter start through the first expansion and tune.

## Test Strategy

Do not run the full suite during iteration. Use focused runners and the production build:

- economy event accounting and bounded history;
- market policy demand/margin behavior;
- charter profile determinism and bounds;
- supplier versus courier ownership/payment invariants;
- grant progress and rewards;
- fresh starter power connectivity and reserve;
- save/load for every new state field;
- browser playtest from title screen -> charter -> starter -> first expansion.
